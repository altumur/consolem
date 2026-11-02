/* Тесты API: что система объявляет об «Автоматизации» (reference.rule*), поля правила, действия детектора,
   права при записи правила, ход с ответом оператора, правила на несколько доменов. */
(() => {
  const { test, makeEnv, assert } = ApiTest;
  const FX = ApiTest.FX;
  const ref = FX.reference;
  const CONTENT = ["name", "enabled", "logOnly", "logOnlySince", "start", "runMode", "operatorMenu", "ratePerMinute", "windowSec", "runAt", "repeat",
    "triggers", "conditions", "steps", "owner", "purpose", "serverId", "runAsRoleId", "allowChain"];
  const body = (r, over) => Object.assign(Object.fromEntries(CONTENT.map((k) => [k, JSON.parse(JSON.stringify(r[k]))])), over || {});
  const etag = (r) => ({ "If-Match": `"${r.version}"` });
  const dev = (id) => ({ include: [{ kind: "device", id }], exclude: [], gone: [], fromEvent: false });
  const cam = FX.devices.find((d) => d.type === "camera" && d.online && d.enabled);
  const step = { source: "rec", action: "record", target: dev(cam.id), duration: "min", minutes: 5 };
  const blank = (over) => Object.assign({
    name: "Проверка", enabled: true, logOnly: false, logOnlySince: null, start: "manual", runMode: "manual", operatorMenu: false, ratePerMinute: 6, windowSec: 0,
    runAt: null, repeat: "skip", triggers: [], conditions: [], steps: [step],
    owner: "admin", purpose: "", serverId: null, runAsRoleId: null, allowChain: true,
  }, over || {});
  const noAction = (action) => ({ reference: { ruleActions: ref.ruleActions.filter((a) => a.action !== action) } });
  const issue = (res) => res.body.params.issue.code;

  /* ----- Каталог ----- */

  test("Каталог: справочник говорит, что исполняет система; способы запуска и виды целей объявлены", async () => {
    const env = await makeEnv();
    const r = await env.ok("GET", "/reference");
    assert.ok(r.ruleStarts.length > 0 && r.ruleTargets.kinds.length > 0 && r.ruleActions.length > 0, "каталог не пуст");
    assert.ok(r.ruleTargets.kinds.every((k) => ["device", "folder", "server", "domain"].includes(k)), "виды целей — из контракта");
  });

  test("Каталог: включённое вне каталога — 422 NOT_SUPPORTED с полем и причиной, выключенное хранится и читается", async () => {
    const wall = ref.ruleActions.find((a) => a.action === "preset");
    const env = await makeEnv({ fixturePatch: noAction("preset") });
    const s = { source: "vms", action: "preset", target: dev(cam.id), preset: 1 };
    const bad = await env.call("POST", "/rules", blank({ steps: [s] }));
    assert.status(bad, 422, "NOT_SUPPORTED");
    assert.eq([bad.body.field, issue(bad), bad.body.params.issue.params.action], ["steps", "action.notDeclared", wall.action], "шаг и причина");
    const off = await env.call("POST", "/rules", blank({ enabled: false, steps: [s] }));
    assert.status(off, 201, null, "выключенное хранится");
    const read = await env.ok("GET", `/rules/${off.body.id}`);
    assert.eq(read.steps[0].action, "preset", "шаг не потерян");
    const up = await env.ok("POST", "/rules/update", { idempotencyKey: ApiTest.key(), items: [{ ruleId: read.id, version: read.version, set: { enabled: true } }] });
    assert.eq(up.failed.map((x) => x.code), ["NOT_SUPPORTED"], "включить группой нельзя");
    const put = await env.call("PUT", `/rules/${read.id}`, body(read, { enabled: true }), etag(read));
    assert.status(put, 422, "NOT_SUPPORTED", "включить правкой нельзя");
  });

  test("Каталог: уже включённое вне каталога не запускается — 409 NOT_RUNNABLE, причина кодом", async () => {
    const r = FX.rules.find((x) => x.enabled && x.steps.some((s) => s.action));
    const a = r.steps.find((s) => s.action).action;
    const env = await makeEnv({ fixturePatch: noAction(a) });
    const res = await env.call("POST", `/rules/${r.id}/run`, { idempotencyKey: ApiTest.key() });
    assert.status(res, 409, "NOT_RUNNABLE");
    assert.eq(res.body.params.reason.code, "action.notDeclared", "причина");
    assert.eq((await env.ok("GET", `/rules/${r.id}`)).status.state, "refused", "сервер говорит: отказано");
  });

  test("Каталог: способ запуска, вид цели, «устройство из события», значение и поле действия", async () => {
    const env = await makeEnv({ fixturePatch: { reference: {
      ruleStarts: ["manual", "event"],
      ruleTargets: { kinds: ["device"], fromEvent: false },
      ruleActions: ref.ruleActions.map((a) => (a.action === "record" ? Object.assign({}, a, { fields: a.fields.filter((f) => f.id !== "afterSec").map((f) => (f.id === "duration" ? Object.assign({}, f, { options: ["min"] }) : f)) }) : a)),
    } } });
    const say = async (over, field, code) => {
      const res = await env.call("POST", "/rules", blank(over));
      assert.status(res, 422, "NOT_SUPPORTED", code);
      assert.eq([res.body.field, issue(res)], [field, code], code);
    };
    await say({ start: "schedule", runMode: "always", runAt: { days: [1], time: "10:00" } }, "start", "rule.startNotDeclared");
    const folder = FX.folders[0];
    await say({ steps: [Object.assign({}, step, { target: { include: [{ kind: "folder", id: folder.id }], exclude: [], gone: [], fromEvent: false } })] }, "steps", "target.notDeclared");
    await say({ steps: [Object.assign({}, step, { target: { include: [], exclude: [], gone: [], fromEvent: true } })] }, "steps", "target.notDeclared");
    await say({ steps: [Object.assign({}, step, { duration: "event" })] }, "steps", "action.fieldNotDeclared");
    await say({ steps: [Object.assign({}, step, { afterSec: 5 })] }, "steps", "action.fieldNotDeclared");
    assert.status(await env.call("POST", "/rules", blank()), 201, null, "объявленное сохраняется");
  });

  test("Каталог: событие и условие вне справочника — поле раздела", async () => {
    const env = await makeEnv({ fixturePatch: { reference: {
      ruleTriggers: ref.ruleTriggers.filter((t) => t.kind !== "motion"),
      ruleConditions: ref.ruleConditions.filter((c) => c.kind !== "online"),
    } } });
    const tr = { source: "det", kind: "motion", target: dev(cam.id), match: {} };
    const a = await env.call("POST", "/rules", blank({ start: "event", runMode: "always", triggers: [tr] }));
    assert.status(a, 422, "NOT_SUPPORTED");
    assert.eq([a.body.field, issue(a)], ["triggers", "trigger.notDeclared"], "событие");
    const b = await env.call("POST", "/rules", blank({ conditions: [{ kind: "online", target: dev(cam.id) }] }));
    assert.status(b, 422, "NOT_SUPPORTED");
    assert.eq([b.body.field, issue(b)], ["conditions", "cond.notDeclared"], "условие");
  });

  /* ----- Поля правила ----- */

  test("Правило: годность действия — 30 по умолчанию, 10–600, вне границ — 422", async () => {
    const env = await makeEnv();
    const made = await env.ok("POST", "/rules", blank());
    assert.eq(made.validForSec, 30, "умолчание");
    const put = await env.ok("PUT", `/rules/${made.id}`, body(made, { validForSec: 120 }), etag(made));
    assert.eq(put.validForSec, 120, "сохранено");
    for (const v of [9, 601]) {
      const res = await env.call("PUT", `/rules/${made.id}`, body(put, { validForSec: v }), etag(put));
      assert.status(res, 422, "VALIDATION_FAILED", `значение ${v}`);
      assert.eq(res.body.field, "validForSec", "поле");
    }
    const h = await env.list(`/rules/${made.id}/versions`);
    assert.eq(h[h.length - 1].rule.validForSec, 120, "в истории");
  });

  test("Правило: состояние от сервера — следит, отказано, не годится, не проверено; у выключенного нет; в версию не входит", async () => {
    const env = await makeEnv();
    const on = await env.ok("POST", "/rules", blank());
    assert.eq(on.status, { state: "watching", reason: "" }, "следит");
    const off = await env.ok("POST", "/rules", blank({ enabled: false }));
    assert.ok(!("status" in off), "выключенное не следит");
    assert.status(await env.call("POST", "/test/events", { type: "device.signal", deviceId: cam.id, online: false }), 200);
    const seen = await env.ok("GET", `/rules/${on.id}`);
    assert.eq([seen.status.state, seen.version], ["unchecked", on.version], "не проверено, версия та же");
    assert.ok(seen.status.reason.includes(cam.name), "причина словами");
    assert.status(await env.call("POST", "/test/events", { type: "device.signal", deviceId: cam.id, online: true }), 200);
    const list = await env.list("/rules");
    assert.eq(list.find((r) => r.id === on.id).status.state, "watching", "в списке — тоже");
  });

  test("Правило: не годится — пресета нет на камере", async () => {
    const dev0 = FX.devices.find((d) => d.type === "camera" && d.presetMax && d.online);
    if (!dev0) return;
    const env = await makeEnv();
    const on = await env.ok("POST", "/rules", blank({ steps: [{ source: "vms", action: "preset", target: dev(dev0.id), preset: dev0.presetMax + 1 }] }));
    assert.eq(on.status.state, "unfit", "не годится");
    assert.ok(on.status.reason.includes(String(dev0.presetMax + 1)), "причина: " + on.status.reason);
  });

  test("Правило: уточнение события открыто — любой ключ, тип значения сохраняется, сравнение строгое", async () => {
    const env = await makeEnv();
    const tr = { source: "det", kind: "motion", target: dev(cam.id), match: { pass: 3 } };
    const made = await env.ok("POST", "/rules", blank({ enabled: false, start: "event", runMode: "always", triggers: [tr] }));
    assert.eq((await env.ok("GET", `/rules/${made.id}`)).triggers[0].match, { pass: 3 }, "как есть, числом");
    const run = (value) => env.ok("POST", "/rules/test", { ruleId: null, rule: body(made), events: [{ source: "det", kind: "motion", deviceId: cam.id, match: { pass: value } }], at: null, branches: {}, log: false });
    assert.ok((await run(3)).checks.some((c) => c.code === "event.came"), "число совпало");
    assert.ok(!(await run("3")).checks.some((c) => c.code === "event.came"), "строка — другое значение");
  });

  /* ----- Действия детектора ----- */

  const detect = (over) => Object.assign({ source: "det", action: "detect", target: dev(cam.id), detectorKind: "motion", minutes: 10 }, over || {});
  const scan = (over) => Object.assign({ source: "det", action: "scan", target: dev(cam.id), detectorKind: "motion" }, over || {});

  test("Детектор на время и проверка архива: в каталоге, сохраняются, выполняются в запуске", async () => {
    const env = await makeEnv();
    const r = await env.ok("GET", "/reference");
    const a = r.ruleActions.find((x) => x.action === "detect"), b = r.ruleActions.find((x) => x.action === "scan");
    assert.eq([a.source, b.source, a.deviceTypes, b.fields.map((f) => f.id)], ["det", "det", ["camera"], ["target", "detectorKind", "beforeSec", "afterSec", "archive", "params"]], "каталог");
    assert.ok(a.fields.find((f) => f.id === "detectorKind").options.includes("motion"), "виды — из справочника");
    const c = FX.devices.find((d) => d.type === "camera" && d.online && d.enabled && d.archiveId);
    const made = await env.ok("POST", "/rules", blank({ steps: [detect({ target: dev(c.id), params: "{\"limit\":3}" }), scan({ target: dev(c.id), beforeSec: 30, afterSec: 90, archive: c.archiveId })] }));
    assert.eq([made.steps[1].beforeSec, made.steps[1].afterSec, made.steps[0].params], [30, 90, "{\"limit\":3}"], "поля");
    const f = await env.ok("POST", `/rules/${made.id}/run`, { idempotencyKey: ApiTest.key() });
    assert.eq(f.steps.map((s) => [s.action.action, s.state]), [["detect", "ok"], ["scan", "ok"]], "трасса");
  });

  test("Детектор на время и проверка архива: границы и пустое окно — 422 RULE_INVALID, выключенное хранится", async () => {
    const env = await makeEnv();
    const bad = await env.call("POST", "/rules", blank({ steps: [detect({ minutes: 1441 })] }));
    assert.status(bad, 422, "RULE_INVALID");
    assert.eq(issue(bad), "action.field", "минуты");
    const none = await env.call("POST", "/rules", blank({ steps: [detect({ detectorKind: "" })] }));
    assert.status(none, 422, "RULE_INVALID", "нет вида");
    const win = await env.call("POST", "/rules", blank({ steps: [scan({ beforeSec: 0, afterSec: 0 })] }));
    assert.status(win, 422, "RULE_INVALID");
    assert.eq(issue(win), "action.scanWindow", "окно");
    assert.status(await env.call("POST", "/rules", blank({ enabled: false, steps: [scan({ beforeSec: 0, afterSec: 0 })] })), 201, null, "незаконченное выключенное");
  });

  test("Проверка архива: камере без записи нечего проверять — шаг не выполнен, правило не годится", async () => {
    const c = FX.devices.find((d) => d.type === "camera" && d.online && d.enabled && !d.archiveId && !(d.extraArchives || []).length);
    if (!c) return;
    const env = await makeEnv();
    const made = await env.ok("POST", "/rules", blank({ steps: [scan({ target: dev(c.id) })] }));
    assert.eq(made.status.state, "unfit", "не годится");
    const f = await env.ok("POST", `/rules/${made.id}/run`, { idempotencyKey: ApiTest.key() });
    assert.eq([f.steps[0].state, f.steps[0].reason.code, f.result], ["fail", "target.noRecord", "fail"], "шаг");
  });

  /* ----- Цели и права ----- */

  const roleOf = (fn) => FX.access.roles.find(fn);
  const guard = FX.access.users.find((u) => u.login === "olga"), guardRole = guard.roleIds[0];

  test("Цели: новое устройство в области входит в правило само, новой версии нет", async () => {
    const f = FX.folders.find((x) => x.deviceIds.some((id) => (FX.devices.find((d) => d.id === id) || {}).type === "camera"));
    const other = FX.devices.find((d) => d.type === "camera" && d.domainId === f.domainId && !f.deviceIds.includes(d.id));
    if (!other) return;
    const env = await makeEnv();
    const area = { include: [{ kind: "folder", id: f.id }], exclude: [], gone: [], fromEvent: false };
    const made = await env.ok("POST", "/rules", blank({ steps: [Object.assign({}, step, { target: area })] }));
    const n0 = (await env.ok("POST", `/rules/${made.id}/run`, { idempotencyKey: ApiTest.key() })).steps.length;
    const folder = await env.ok("GET", `/folders/${f.id}`);
    await env.ok("PATCH", `/folders/${f.id}`, { deviceIds: folder.deviceIds.concat(other.id) }, etag(folder));
    const n1 = (await env.ok("POST", `/rules/${made.id}/run`, { idempotencyKey: ApiTest.key() })).steps.length;
    assert.eq([n1, (await env.ok("GET", `/rules/${made.id}`)).version], [n0 + 1, made.version], "шаг на новую камеру, версия та же");
  });

  test("Права: автор отвечает за всё, что называет правило; нет права — 403, ничего не записано", async () => {
    const env = await makeEnv({ actAs: guard.login });
    const before = (await env.list("/rules")).length;
    const bad = await env.call("POST", "/rules", blank());
    assert.status(bad, 403, "PERMISSION_DENIED");
    assert.eq(bad.body.params.target, { kind: "device", id: cam.id }, "что именно");
    assert.eq((await env.list("/rules")).length, before, "не записано");
    const dom = await env.call("POST", "/rules", blank({ steps: [Object.assign({}, step, { target: { include: [{ kind: "domain", id: FX.domains[0].id }], exclude: [], gone: [], fromEvent: false } })] }));
    assert.status(dom, 403, "PERMISSION_DENIED", "весь домен — нужно право на всё");
    const r = FX.rules.find((x) => x.name === "Охрана входа ночью");
    assert.status(await env.call("PUT", `/rules/${r.id}`, body(r, { name: "Чужое" }), etag(r)), 403, "PERMISSION_DENIED", "правка правила с чужой камерой");
    const tr = { source: "det", kind: "motion", target: dev(cam.id), match: {} };
    assert.status(await env.call("POST", "/rules", blank({ enabled: false, start: "event", runMode: "always", triggers: [tr] })), 403, "PERMISSION_DENIED", "и у выключенного, и в событии");
  });

  test("Права: своё право годится, умолчание роли и точечное исключение", async () => {
    const own = roleOf((x) => x.id === guardRole);
    const id = Object.keys(own.objectAccess).find((k) => (own.objectAccess[k].cam === "FULL") && FX.devices.some((d) => d.id === k && d.type === "camera"));
    if (!id) return;
    const env = await makeEnv({ actAs: guard.login });
    const res = await env.call("POST", "/rules", blank({ enabled: false, steps: [Object.assign({}, step, { target: dev(id) })] }));
    assert.status(res, 201, null, "камера, где у роли FULL");
  });

  test("Права: роль запуска ограничивает выполнение; автор выбирает любую роль; нет роли — 422", async () => {
    const env = await makeEnv();
    const weak = roleOf((x) => !x.global.unr && x.global.dCam === "MON" && !x.objectAccess[cam.id]);
    const c2 = FX.devices.find((d) => d.type === "camera" && d.online && d.enabled && !FX.folders.some((f) => f.deviceIds.includes(d.id) && weak.folderAccess[f.id]) );
    if (!c2) return;
    const s = Object.assign({}, step, { target: dev(c2.id) });
    const free = await env.ok("POST", "/rules", blank({ steps: [s] }));
    assert.eq((await env.ok("POST", `/rules/${free.id}/run`, { idempotencyKey: ApiTest.key() })).steps[0].state, "ok", "от имени системы — без ограничений");
    const made = await env.ok("POST", "/rules", blank({ runAsRoleId: weak.id, steps: [s] }));
    assert.eq(made.runAsRoleId, weak.id, "роль, которой у автора нет, выбрать можно");
    const f = await env.ok("POST", `/rules/${made.id}/run`, { idempotencyKey: ApiTest.key() });
    assert.eq([f.steps[0].state, f.steps[0].reason.code, f.steps[0].reason.params.roleId], ["fail", "role.denied", weak.id], "у роли нет права — шаг не выполнен");
    const none = await env.call("POST", "/rules", blank({ runAsRoleId: "80000099-0000-4000-8000-000000000000" }));
    assert.status(none, 422, "VALIDATION_FAILED");
    assert.eq(none.body.field, "runAsRoleId", "поле");
  });

  ApiTest.loaded("api-automation.js");
})();
