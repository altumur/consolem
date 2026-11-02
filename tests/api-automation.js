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

  ApiTest.loaded("api-automation.js");
})();
