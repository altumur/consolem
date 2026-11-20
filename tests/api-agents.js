/* Тесты API на системе без VMS: оркестратор агентов (api/fixtures/agents.json). Идут и на других наборах, где есть виды агентов,
   на остальных пропускаются: им нужны виды agent.* (kind:agent.agent). Проверяют механизм: правила и их запуск, операции над
   объектами, перенос, удаление, дерево, журнал, вопросы оператору, окна обслуживания, команда вида. Виды и объекты берут из
   самой системы (GET /kinds, GET /units), а не из кодов VMS. */
(() => {
  ApiTest.fileLayer("mechanism");
  const { test, makeEnv, assert, FX, key } = ApiTest;
  const AGENT = "kind:agent.agent", STEP = "kind:agent.step", PIPE = "kind:agent.pipeline", MODEL = "kind:agent.model";
  const U = (uid) => `/units/${uid}`;
  const etag = (r) => ({ "If-Match": `"${r.version}"` });
  const CONTENT = ["name", "enabled", "logOnly", "logOnlySince", "start", "runMode", "operatorMenu", "ratePerMinute", "windowSec", "runAt", "repeat",
    "triggers", "conditions", "steps", "owner", "purpose", "serverId", "runAsRoleId", "allowChain"];
  const body = (r, over) => Object.assign(Object.fromEntries(CONTENT.map((k) => [k, JSON.parse(JSON.stringify(r[k]))])), over || {});
  const agentRule = () => FX.rules.find((r) => r.triggers.some((t) => (t.kinds || []).includes("agent.agent")));
  const target = (uid) => ({ include: [{ uid }], exclude: [], gone: [], fromEvent: false });
  const failed = (env, uid) => env.call("POST", "/test/events", { type: "unit.event", deviceId: uid, eventId: "failed", match: {} });
  const ofKind = async (env, kind) => (await env.list(`/units?kind=${kind}&limit=1000`));

  test("Агенты: правило — создать, сохранить, версии, группой, порядок, пробный запуск", async () => {
    const env = await makeEnv();
    const r1 = agentRule();
    const agent = (await ofKind(env, "agent.agent"))[0];
    const made = await env.call("POST", "/rules", body(r1, { name: "Агент упал — запомнить" }));
    assert.status(made, 201);
    const r2 = made.body;
    assert.eq((await env.list(`/rules/${r2.id}/versions`)).map((v) => v.number), [1], "первая версия истории");
    const put = await env.ok("PUT", `/rules/${r1.id}`, body(r1, { name: "Агент упал — запустить снова" }), etag(r1));
    assert.ok(put.version !== r1.version && put.name === "Агент упал — запустить снова", "версия новая");
    assert.status(await env.call("PUT", `/rules/${r1.id}`, body(r1), etag(r1)), 412, "VERSION_MISMATCH", "чужая версия");
    assert.ok((await env.list(`/rules/${r1.id}/versions`)).length >= 1, "в истории есть версия");
    const up = await env.ok("POST", "/rules/update", { idempotencyKey: key(), items: [
      { ruleId: r1.id, version: put.version, set: { enabled: false } },
      { ruleId: r2.id, version: "stale", set: { enabled: false } },
    ] });
    assert.eq([up.done.map((r) => r.id), up.failed.map((x) => x.code)], [[r1.id], ["VERSION_MISMATCH"]], "частичный успех");
    const ord = await env.ok("POST", "/rules/reorder", { items: [{ ruleId: r1.id, version: up.done[0].version, order: 2 }, { ruleId: r2.id, version: r2.version, order: 1 }] });
    assert.eq(ord.items.map((r) => r.order), [2, 1], "новый порядок");
    const f = await env.ok("POST", "/rules/test", { ruleId: r1.id, rule: body(r1), events: [{ source: "unit", event: "failed", match: {}, deviceId: agent.uid }], at: null, branches: {}, log: false });
    assert.eq(f.by, "test", "пробный запуск");
  }, { needs: [AGENT, "createRule", "putRule", "listRuleVersions", "updateRules", "reorderRules", "testRule"] });

  test("Агенты: событие failed запускает правило, повтор неудачных — нечего повторять", async () => {
    const env = await makeEnv();
    const r1 = agentRule();
    const agent = (await ofKind(env, "agent.agent"))[0];
    // Режим по расписанию зависит от часа прогона (у agents «Рабочее время» в будни 08:00–20:00 выключает это правило):
    // на час теста — вручную «Обычная работа» (modeId null), она правил не выключает
    await env.ok("POST", "/modes/current", { modeId: null, until: new Date(env.now + 3600e3).toISOString() });
    assert.status(await failed(env, agent.uid), 200);
    const fire = await env.until(async () => (await env.list(`/rules/${r1.id}/fires`))[0], "запуск правила");
    assert.eq([fire.result, fire.steps.filter((s) => s.action).length], ["ok", 1], "действие start выполнено");
    assert.status(await env.call("POST", `/rules/${r1.id}/fires/${fire.id}/retry`, { idempotencyKey: key() }), 409, "NOT_RUNNABLE", "нечего повторять");
    assert.status(await env.call("POST", "/test/stream-elsewhere"), 204);
  }, { needs: [AGENT, "retryRuleFire", "listRuleFires", "testEvent", "testStreamElsewhere", "setModeCurrent"] });

  test("Агенты: вопрос оператору — запуск ждёт, ответ «да» открывает ветку", async () => {
    const env = await makeEnv();
    const r1 = agentRule();
    const role = FX.access.roles.find((r) => r.global.unr);
    const agent = (await ofKind(env, "agent.agent"))[0];
    const step = { type: "unitAction", action: "check", target: target(agent.uid), params: {} };
    const ask = { control: "ask", text: "Проверить агента?", roleId: role.id, sec: 60, default: "no", yes: [step], no: [] };
    const made = await env.ok("POST", "/rules", body(r1, { name: "Спросить перед проверкой", start: "manual", runMode: "manual", triggers: [], steps: [ask] }));
    const run = await env.ok("POST", `/rules/${made.id}/run`, { idempotencyKey: key() });
    assert.eq(run.result, "waiting", "запуск ждёт ответа");
    const [p, ...rest] = await env.list("/rule-prompts");
    assert.eq([rest.length, p.ruleId, p.canAnswer], [0, made.id, true], "один вопрос");
    assert.status(await env.call("POST", `/rule-prompts/${p.id}/answer`, { answer: "yes" }), 202);
    const now = (await env.list(`/rules/${made.id}/fires`)).find((x) => x.id === run.id);
    assert.eq(now.steps.filter((s) => s.action).length, 1, "ветка «да» выполнена");
  }, { needs: [AGENT, "createRule", "listRulePrompts", "answerRulePrompt", "runRule", "listRuleFires"] });

  test("Агенты: окно обслуживания — создать вместе со своим расписанием, сохранить, удалить", async () => {
    const env = await makeEnv();
    const r1 = agentRule();
    const sc = JSON.parse(JSON.stringify(FX.schedules[0]));
    ["id", "version", "builtin"].forEach((k) => delete sc[k]);
    sc.owner = null;
    const res = await env.call("POST", "/maintenance-windows", { name: "Ночная проверка", enabled: true, ruleIds: [r1.id], schedule: sc });
    assert.status(res, 201);
    const { window: w, schedule } = res.body;
    assert.eq([w.scheduleId, schedule.owner], [schedule.id, { kind: "maintenanceWindow", id: w.id }], "расписание окна");
    assert.eq((await env.ok("GET", `/maintenance-windows/${w.id}`)).name, "Ночная проверка", "по id");
    assert.eq((await env.list("/maintenance-windows")).length, FX.maintenanceWindows.length + 1, "в списке");
    const put = await env.ok("PUT", `/maintenance-windows/${w.id}`, { name: "Ночная проверка", scheduleId: w.scheduleId, ruleIds: null, enabled: false }, etag(w));
    assert.eq([put.ruleIds, put.enabled], [null, false], "все правила, выключено");
    assert.status(await env.call("DELETE", `/maintenance-windows/${w.id}`, undefined, etag(put)), 204);
  }, { needs: [AGENT, "listMaintenanceWindows", "createMaintenanceWindow", "getMaintenanceWindow", "putMaintenanceWindow", "deleteMaintenanceWindow"] });

  test("Агенты: операция над объектами — создать, читать, пауза, продолжить, отменить, повторить неудачные, откатить, вернуть", async () => {
    const env = await makeEnv();
    const units = [...(await ofKind(env, "agent.agent")), ...(await ofKind(env, "agent.model")), ...(await ofKind(env, "agent.tool"))];
    const rename = (u) => ({ uid: u.uid, patch: { name: `${u.name} 2` } });
    const plan = (list, extra) => Object.assign({ idempotencyKey: key(), items: list.map(rename), expectedVersions: Object.fromEntries(list.map((u) => [u.uid, u.version])) }, extra);
    // Пауза и отмена: шагов много, часы стоят — операция не успевает кончиться
    const long = await env.ok("POST", "/operations", plan(units));
    assert.eq((await env.ok("GET", `/operations/${long.id}`)).total, units.length, "операция читается");
    if (env.frozen) await env.advance(1);
    assert.eq((await env.ok("POST", `/operations/${long.id}/pause`)).state, "paused", "пауза");
    assert.status(await env.call("POST", `/operations/${long.id}/pause`), 409, "BUSY", "уже на паузе");
    assert.eq((await env.ok("POST", `/operations/${long.id}/resume`)).state, "running", "продолжить");
    const cancelled = await env.ok("POST", `/operations/${long.id}/cancel`);
    assert.eq(cancelled.state, "done", "отменена");
    // Откат и повтор: переименование двух агентов
    const fresh = await Promise.all(units.slice(0, 2).map((u) => env.ok("GET", U(u.uid))));
    const op = await env.runOperation(plan(fresh));
    assert.eq([op.ok, op.failed], [2, 0], "выполнено");
    const back = await env.finished((await env.ok("POST", `/operations/${op.id}/revert`)).id);
    assert.eq(back.items.map((x) => x.state), ["ok", "ok"], "отменено");
    assert.eq((await env.ok("GET", U(fresh[0].uid))).name, fresh[0].name, "имя вернулось");
    const redo = await env.finished((await env.ok("POST", `/operations/${op.id}/redo`)).id);
    assert.eq(redo.items.map((x) => x.state), ["ok", "ok"], "повторено");
    // Неудачный шаг: шаг конвейера не уходит в корень (родитель — только конвейер)
    const step = (await ofKind(env, "agent.step"))[0];
    const bad = await env.runOperation({ idempotencyKey: key(), items: [{ uid: step.uid, move: null }], expectedVersions: { [step.uid]: step.version } });
    assert.eq(bad.items.map((x) => x.state), ["fail"], "шаг не выполнен");
    const again = await env.call("POST", `/operations/${bad.id}/retry-failed`);
    assert.status(again, 202);
    assert.eq(again.body.retryOf, bad.id, "повтор только неудачных");
  }, { needs: [AGENT, STEP, "createOperation", "getOperation", "pauseOperation", "resumeOperation", "cancelOperation", "retryFailedOperation", "revertOperation", "redoOperation"] });

  test("Агенты: объекты — проверка без записи, перенос шага, команда вида, удаление одиночное и группой, подсказки и схема", async () => {
    const env = await makeEnv();
    const [p1, p2] = await ofKind(env, "agent.pipeline");
    const step = (await env.list(`/units?parentId=${p1.uid}`))[0];
    // validate не пишет
    const v = await env.ok("POST", "/units/validate", { items: [
      { uid: step.uid, patch: { properties: { order: 0 } } },
      { uid: step.uid, patch: { name: "Только проверка" } },
      { create: { kind: "agent.step", parentId: p1.uid, properties: {} } },
    ] });
    assert.eq(v.items.map((x) => [x.index, x.ok]), [[0, false], [1, true], [2, false]], "итог по строкам");
    assert.eq(v.items[0].errors[0].field, "/properties/order", "порядок меньше 1");
    assert.eq((await env.ok("GET", U(step.uid))).name, step.name, "имя не изменилось");
    // перенос шага в другой конвейер и обратно; без If-Match — 428
    assert.status(await env.call("POST", `/units/${step.uid}/move`, { parentId: p2.uid }), 428, "PRECONDITION_REQUIRED");
    const moved = await env.call("POST", `/units/${step.uid}/move`, { parentId: p2.uid }, { "If-Match": await env.etag(U(step.uid)) });
    assert.status(moved, 200);
    assert.eq(moved.body.parentId, p2.uid, "шаг в другом конвейере");
    const back = await env.call("POST", `/units/${step.uid}/move`, { parentId: p1.uid }, { "If-Match": moved.headers.etag });
    assert.eq(back.body.parentId, p1.uid, "обратно");
    // у вида без move перенос — 422 NOT_SUPPORTED
    assert.status(await env.call("POST", `/units/${p1.uid}/move`, { parentId: null }, { "If-Match": await env.etag(U(p1.uid)) }), 422, "NOT_SUPPORTED");
    // команда вида без объекта
    const kindRun = await env.ok("POST", "/kinds/agent.agent/actions/check", { params: {} });
    assert.eq(typeof kindRun.result.ok, "boolean", "результат команды вида");
    assert.status(await env.call("POST", "/kinds/agent.agent/actions/нет", { params: {} }), 404, "NOT_FOUND");
    // что можно создать, схема, страница настройки
    const creatable = await env.ok("GET", `/units/${p1.uid}/creatable`);
    assert.ok(JSON.stringify(creatable).includes("agent.step"), "под конвейером создаётся шаг");
    assert.status(await env.call("GET", `/units/${p1.uid}/schema`), 422, "NOT_SUPPORTED", "схема одна на вид");
    assert.status(await env.call("POST", `/units/${p1.uid}/setup-ui`, {}), 404, "NOT_FOUND", "страницы настройки нет");
    // дерево: цепочка агента в папке — от области через папку
    const agent = (await ofKind(env, "agent.agent")).find((u) => (u.folders || []).length);
    const paths = await env.ok("GET", `/tree/paths?layout=folders&ids=${agent.uid}`);
    assert.eq(paths.items[0].chains[0].map((x) => x.kind), ["domain", "folder", "agent.agent"], "цепочка: область, папка, агент");
    // удаление: одиночное и группой, версия обязательна
    const tools = await ofKind(env, "agent.tool");
    assert.status(await env.call("DELETE", U(tools[0].uid)), 428, "PRECONDITION_REQUIRED");
    assert.status(await env.call("DELETE", U(tools[0].uid), undefined, { "If-Match": await env.etag(U(tools[0].uid)) }), 204);
    assert.status(await env.call("GET", U(tools[0].uid)), 404, "NOT_FOUND");
    const gone = await env.ok("POST", "/objects/delete", { idempotencyKey: key(), items: tools.slice(1).map((t) => ({ id: t.uid, version: t.version })) });
    assert.eq(gone.done.length, 2, "группой удалены два инструмента");
  }, { needs: [AGENT, STEP, PIPE, "validateUnits", "moveUnit", "runKindAction", "getCreatable", "getUnitSchema", "openUnitSetupUi", "getTreePaths", "deleteUnit", "deleteObjects", "layout:folders"] });

  // Удаление снимает ссылки x-ref на удалённое (refsCleanup): объект со снятой ссылкой меняет место в раскладке by: ref —
  // tree.changed несёт и его новое место (здесь — группа «без модели», а не область, где лежала модель)
  test("Агенты: удалили модель — у агента снята ссылка, tree.changed по его новому месту в раскладке по ссылке", async () => {
    const L = "agent.models";
    const kinds = await ApiTest.makeEnv().then((e) => e.ok("GET", "/kinds"));
    const lay = kinds.layouts.find((l) => l.id === L);
    const place = lay.place.map((r) => (r.by === "area" && r.what && r.what.kinds && r.what.kinds.includes("agent.agent") ? { what: r.what, by: "group", group: "nomodel" } : r));
    const layouts = kinds.layouts.map((l) => (l.id === L ? Object.assign({}, l, { place, groups: [{ id: "nomodel", label: { key: "layout.test.nomodel", text: "Без модели", lang: "ru" } }] }) : l));
    const env = await makeEnv({ fixturePatch: { layouts } });
    const agents = await env.pages("/units?kind=agent.agent&limit=1000");
    const models = await env.pages("/units?kind=agent.model&limit=1000");
    const m = models.find((x) => agents.some((a) => a.properties.modelId === x.uid));
    assert.ok(m, "модель с агентом");
    const ag = agents.find((a) => a.properties.modelId === m.uid);
    const seen = [];
    const stop = ApiTest.subscribeForTest((x) => seen.push(x), []);
    await ApiTest.settle();
    assert.status(await env.call("DELETE", U(m.uid), undefined, etag(m)), 204, null, "модель удалена");
    await env.wait(1);
    await env.ok("GET", "/me");
    await ApiTest.settle();
    stop();
    assert.eq((await env.ok("GET", U(ag.uid))).properties.modelId, null, "ссылка агента снята");
    const at = new Set(seen.filter((x) => x.type === "tree.changed" && x.layout === L).flatMap((x) => x.parentIds));
    assert.ok(at.has(`nomodel:${ag.domainId}`), `tree.changed ${L}: новое место агента — ${[...at].join(", ")}`);
  }, { needs: [AGENT, MODEL, "listKinds", "deleteUnit", "getTreeChildren"] });

  ApiTest.loaded("api-agents.js");
})();
