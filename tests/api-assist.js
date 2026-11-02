/* Тесты API: ассистент — ход разговора потоком, вопрос, план, отказ, ошибка, секрет. */
(() => {
  const { test, makeEnv, assert } = ApiTest;
  const NEED = { needs: ["assistTurn"] };
  const types = (got) => got.map((m) => m.type).join(",");

  test("Ассистент: план на камеры, «Применить» — POST /devices/update, старый план — VERSION_MISMATCH", async () => {
    const env = await makeEnv();
    const got = await env.stream("/assist/turns", { text: "выключи запись на камерах Главный вход" });
    const plan = got[got.length - 1];
    assert.eq(plan.type, "plan", "последнее сообщение");
    assert.ok(got[0].type === "progress", "сначала ход работы");
    assert.ok(plan.items.length > 0, "камеры выбраны");
    const items = plan.items.map(({ deviceId, version, set }) => ({ deviceId, version, set }));
    const res = await env.ok("POST", "/devices/update", { idempotencyKey: "assist-apply-1", items });
    assert.eq([res.done.length, res.failed.length], [items.length, 0], "применено");
    assert.eq(res.done[0].recordMode, "none", "значение");
    const again = await env.ok("POST", "/devices/update", { idempotencyKey: "assist-apply-2", items });
    assert.eq(again.failed[0].code, "VERSION_MISMATCH", "устройство изменилось после плана");
    return `устройств ${items.length}`;
  }, NEED);

  test("Ассистент: вопрос, ответ с context — план; разговор держит клиент", async () => {
    const env = await makeEnv();
    const first = await env.stream("/assist/turns", { text: "включи запись" });
    const q = first[first.length - 1];
    assert.eq([q.type, q.text], ["question", "На каких камерах?"], "уточнение");
    const second = await env.stream("/assist/turns", { text: "Главный вход", context: q.context });
    assert.eq(second[second.length - 1].type, "plan", "по ответу — план");
    return types(first);
  }, NEED);

  test("Ассистент: отказ по полю и ошибка завершают поток", async () => {
    const env = await makeEnv();
    const no = await env.stream("/assist/turns", { text: "поменяй маску сети" });
    const end = no[no.length - 1];
    assert.eq([end.type, end.field], ["refused", "netmask"], "отказ");
    const bad = await env.stream("/assist/turns", { text: "сбой" });
    assert.eq(bad[bad.length - 1].code, "UPSTREAM_UNAVAILABLE", "ошибка");
  }, NEED);

  test("Ассистент: секрет идёт в set и не показывается в пояснении и в context", async () => {
    const env = await makeEnv();
    const got = await env.stream("/assist/turns", { text: "смени пароль Главный вход на секрет № 2", secrets: ["первый", "второй-S3CRET"] });
    const plan = got[got.length - 1];
    assert.eq(plan.items[0].set.password, "второй-S3CRET", "значение в set");
    const shown = JSON.stringify([plan.summary, plan.context, plan.items.map((x) => x.changes)]);
    assert.ok(!shown.includes("S3CRET"), "значения нет в пояснении и context");
    assert.ok(!("before" in plan.items[0].changes[0]), "«было» у секрета нет");
  }, NEED);

  test("Ассистент: пустая просьба — 422", async () => {
    const env = await makeEnv();
    assert.status(await env.call("POST", "/assist/turns", { text: "" }), 422, "VALIDATION_FAILED");
  }, NEED);
  /* ----- План правил ----- */

  const FX = ApiTest.FX;
  const RULE_WRITE = ["name", "enabled", "logOnly", "logOnlySince", "start", "runMode", "operatorMenu", "ratePerMinute", "windowSec", "runAt", "repeat",
    "triggers", "conditions", "steps", "owner", "purpose", "serverId", "runAsRoleId", "allowChain", "labels", "validForSec"];
  const DEFAULTS = { enabled: true, logOnly: false, logOnlySince: null, start: "event", runMode: "always", operatorMenu: false, ratePerMinute: 6, windowSec: 0, runAt: null,
    repeat: "skip", triggers: [], conditions: [], steps: [], owner: "", purpose: "", serverId: null, runAsRoleId: null, allowChain: true };
  const pick = (r) => Object.fromEntries(RULE_WRITE.filter((k) => k in r).map((k) => [k, r[k]]));
  const lastOf = (got) => got[got.length - 1];
  const turn = (env, text, extra) => env.stream("/assist/turns", Object.assign({ text }, extra || {}));
  const camera = "Главный вход";
  const named = FX.rules.find((r) => r.name === "Охрана входа ночью");

  test("Что за реплика, решает сервер: поля kind в запросе нет, слова правил — план правил, иначе настройка", async () => {
    const env = await makeEnv();
    const said = `при движении на ${camera} пиши 5 минут`;
    const plain = lastOf(await env.stream("/assist/turns", { text: "выключи запись на камерах Главный вход" }));
    assert.ok(plain.type === "plan" && plain.items.length && !("rules" in plain), "настройка устройств");
    const rules = lastOf(await turn(env, said));
    assert.ok(rules.type === "plan" && rules.rules.length === 1 && !("items" in rules), "слова правил — план правил");
    for (const kind of ["config", "rules", "auto", "explain"]) {
      const bad = await env.call("POST", "/assist/turns", { text: said, kind });
      assert.eq([bad.status, bad.body.code], [422, "VALIDATION_FAILED"], `kind: ${kind} — поля нет в контракте`);
      assert.ok(/kind/.test(bad.body.message), "слово отказа называет поле: " + bad.body.message);
    }
  }, NEED);

  test("Вопрос о системе: «сколько», «какие» — answer без плана; в одном разговоре и вопрос, и правка; типа в событиях нет", async () => {
    const env = await makeEnv();
    const ask = (text, extra) => env.stream("/assist/turns", Object.assign({ text }, extra || {}));
    const seen = [];
    const devices = (await env.list("/devices")).length, ctx = [];
    for (const text of ["сколько камер", "сколько устройств", "какие устройства есть"]) {
      const got = await ask(text);
      seen.push(...got);
      const end = lastOf(got);
      assert.eq(types(got), "progress,answer", `«${text}» — вопрос о системе`);
      assert.ok(end.text.includes(`Устройств: ${devices}`) && typeof end.context === "string", "ответ и context: " + end.text);
      ctx.push(end.context);
    }
    const next = await ask("а правил?", { context: ctx[0] });
    seen.push(...next);
    assert.ok(lastOf(next).type === "answer" && lastOf(next).text === `Правил: ${(await env.list("/rules")).length}.`, "разговор идёт с context: " + lastOf(next).text);
    // Тот же разговор: после вопроса — правка, тип выбран по реплике
    const edit = await ask("выключи запись на камерах Главный вход");
    seen.push(...edit);
    assert.ok(lastOf(edit).type === "plan" && lastOf(edit).items.length, "после вопроса — план настройки");
    const rule = await ask(`при движении на ${camera} пиши 5 минут`, { context: lastOf(edit).context });
    seen.push(...rule);
    assert.ok(lastOf(rule).type === "plan" && lastOf(rule).rules.length, "дальше — план правил");
    assert.ok(seen.every((m) => !("kind" in m)), "поля kind в событиях нет");
    return `событий ${seen.length}`;
  }, NEED);

  test("Отбор: «дай список», «покажи», «выведи» — found, отбирает код по полям, ids по имени без повторов, условия словами", async () => {
    const env = await makeEnv();
    const ask = (text, extra) => env.stream("/assist/turns", Object.assign({ text }, extra || {}));
    const all = await env.list("/devices");
    const byName = (list) => list.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1)).map((d) => d.id);
    const cams = all.filter((d) => d.type === "camera");
    const before = JSON.stringify(cams.map((d) => d.version));
    const check = async (text, words, want) => {
      const got = await ask(text);
      const end = lastOf(got);
      assert.eq(types(got), "progress,found", `«${text}» — отбор`);
      assert.eq(end.conditions, words, `условия словами: «${text}»`);
      assert.eq(end.ids, byName(want), `ids по имени: «${text}»`);
      assert.eq([end.total, new Set(end.ids).size, "truncated" in end, "filter" in end, "kind" in end], [want.length, end.ids.length, false, false, false], "total, без повторов, одна форма");
      return end;
    };
    const none = await check("выведи камеры без записи", ["тип: камера", "запись: нет"], cams.filter((d) => (d.recordMode || "none") === "none"));
    assert.ok(none.ids.length > 0 && /Отобрано: \d+/.test(none.text), "текст: " + none.text);
    await check("дай список камер Axis", ["тип: камера", "производитель: Axis"], cams.filter((d) => d.vendor === "Axis"));
    await check("покажи выключенные камеры", ["тип: камера", "включена: нет"], cams.filter((d) => d.enabled === false));
    await check("выведи камеры не на связи", ["тип: камера", "на связи: нет"], cams.filter((d) => d.online === false));
    const folder = FX.folders.find((f) => f.name === "Склад хозчасти"), inside = await env.folderIds(folder.id);
    await check("покажи камеры в папке Склад хозчасти", ["тип: камера", "папка: Склад хозчасти"], cams.filter((d) => inside.includes(d.id)));
    await check("выведи камеры с именем «вход»", ["тип: камера", "имя содержит: вход"], cams.filter((d) => d.name.toLowerCase().includes("вход")));
    // Без детектора движения — по выводному полю камеры
    const noMotion = await check("выведи камеры без детектора движения", ["тип: камера", "детектор движения: нет"], cams.filter((d) => !d.detectorKinds.includes("motion")));
    assert.ok(noMotion.ids.length > 0 && noMotion.ids.length < cams.length, "есть и с детектором, и без: " + noMotion.ids.length + " из " + cams.length);
    // Найдено 0 — тоже found, не отказ
    const empty = lastOf(await ask("покажи камеры с именем «такого нет»"));
    assert.eq([empty.type, empty.ids, empty.total, empty.text], ["found", [], 0, "Ничего не отобрано."], "пусто — found с пустым ids");
    // Разговор продолжается с context: уточнить отбор
    const more = lastOf(await ask("а только Axis", { context: none.context }));
    assert.eq(more.conditions, ["тип: камера", "запись: нет", "производитель: Axis"], "уточнение с context");
    assert.eq(more.ids, byName(cams.filter((d) => (d.recordMode || "none") === "none" && d.vendor === "Axis")), "уточнённый отбор");
    // Не понял условие — вопрос
    const q = lastOf(await ask("покажи что-нибудь"));
    assert.eq(q.type, "question", "без условия — вопрос");
    // Отбор ничего не пишет
    assert.eq(JSON.stringify((await env.list("/devices")).filter((d) => d.type === "camera").map((d) => d.version)), before, "версии камер прежние");
    return `отобрано без записи ${none.ids.length}`;
  }, NEED);

  test("Камера: выводное поле detectorKinds; GET /devices?noDetector — камеры без детектора вида, ограниченным проходом", async () => {
    const env = await makeEnv();
    const all = await env.list("/devices");
    const cams = all.filter((d) => d.type === "camera");
    assert.ok(cams.every((d) => Array.isArray(d.detectorKinds) && new Set(d.detectorKinds).size === d.detectorKinds.length), "у каждой камеры detectorKinds без повторов");
    assert.ok(all.filter((d) => d.type !== "camera").every((d) => !("detectorKinds" in d)), "у прочих поля нет");
    const dets = all.filter((d) => d.type === "det");
    const kindsOf = (id) => new Set(dets.filter((x) => x.parentId === id || x.cameraId === id).map((x) => x.detectorKind));
    assert.ok(cams.every((d) => JSON.stringify([...kindsOf(d.id)].sort()) === JSON.stringify(d.detectorKinds.slice().sort())), "виды встроенных и серверных детекторов камеры");
    const rows = await env.pages("/devices?noDetector=motion&limit=1000");
    const want = cams.filter((d) => !d.detectorKinds.includes("motion")).map((d) => d.id).sort();
    assert.eq(rows.map((r) => r.id).sort(), want, "noDetector=motion — камеры без детектора движения");
    assert.ok(rows.every((r) => r.type === "camera") && want.length < cams.length, "только камеры, не все");
    const page = await env.ok("GET", "/devices?noDetector=motion&limit=5");
    assert.ok(!("total" in page), "полного числа нет: ограниченный проход");
    assert.status(await env.call("GET", "/devices?noDetector=nope"), 422, "VALIDATION_FAILED");
    return `без детектора движения ${want.length} из ${cams.length}`;
  }, NEED);

  test("План правил: новое правило — запись плана словами контракта, ход ничего не пишет, заведено logOnly", async () => {
    const env = await makeEnv();
    const before = (await env.list("/rules")).length;
    const seen = [];
    const stop = ApiTest.subscribeForTest((m) => m.kind === "rule" && seen.push(m.type));
    await ApiTest.settle();
    const plan = lastOf(await turn(env, `при движении на ${camera} пиши 5 минут`));
    const [e] = plan.rules;
    assert.eq([e.table, e.op, "id" in e], ["scenarios", "create", false], "запись плана");
    assert.eq([e.body.enabled, e.body.logOnly, e.body.triggers[0].kind, e.body.steps[0].minutes], [true, true, "motion", 5], "поля Rule");
    assert.eq((await env.list("/rules")).length, before, "ход ничего не записал");
    await ApiTest.settle();
    assert.eq(seen, [], "событий нет");
    const made = await env.ok("POST", "/rules", Object.assign({}, DEFAULTS, e.body));
    stop();
    assert.eq([made.enabled, made.logOnly, made.owner, made.serverId, made.runAsRoleId], [true, true, "", null, null], "заведено наблюдающим, умолчания перевода");
  }, NEED);

  test("План правил: просили выключенным — выключенным", async () => {
    const env = await makeEnv();
    const [e] = lastOf(await turn(env, `при движении на ${camera} пиши 5 минут, заведи выключенным`)).rules;
    assert.eq([e.body.enabled, "logOnly" in e.body], [false, false], "план");
    const made = await env.ok("POST", "/rules", Object.assign({}, DEFAULTS, e.body));
    assert.eq([made.enabled, "status" in made], [false, false], "не следит");
  }, NEED);

  test("План правил: правка — только изменённые поля, PUT целиком с версией, чужая версия — 412 VERSION_MISMATCH", async () => {
    const env = await makeEnv();
    const [e] = lastOf(await turn(env, `в правиле ${named.name} убери условия`)).rules;
    assert.eq([e.table, e.op, e.id, Object.keys(e.body)], ["scenarios", "update", named.id, ["conditions"]], "запись плана");
    const read = await env.ok("GET", `/rules/${e.id}`);
    assert.eq(read.conditions.length, named.conditions.length, "ход ничего не записал");
    const done = await env.ok("PUT", `/rules/${e.id}`, Object.assign(pick(read), e.body), { "If-Match": `"${read.version}"` });
    assert.eq([done.conditions, done.logOnly, done.enabled, done.steps.length], [[], read.logOnly, read.enabled, read.steps.length], "прочее на месте, наблюдения не завелось");
    const stale = await env.call("PUT", `/rules/${e.id}`, Object.assign(pick(read), { ratePerMinute: 7 }), { "If-Match": `"${read.version}"` });
    assert.status(stale, 412, "VERSION_MISMATCH");
    assert.eq(stale.body.current.version, done.version, "актуальная запись в ответе");
    assert.eq((await env.ok("GET", `/rules/${e.id}`)).ratePerMinute, read.ratePerMinute, "чужая версия ничего не записала");
  }, NEED);

  test("План правил: новое расписание — запись с ref, правило ссылается на него «@ref»", async () => {
    const env = await makeEnv();
    const plan = lastOf(await turn(env, `при движении на ${camera} пиши 5 минут, новое расписание`));
    const [s, r] = plan.rules;
    assert.eq([s.table, s.op, s.ref, r.body.conditions[0].scheduleId], ["schedules", "create", "shift", "@shift"], "порядок и ссылка");
    assert.ok(!(await env.list("/schedules")).some((x) => x.name === s.body.name), "расписания нет");
    const sc = await env.ok("POST", "/schedules", s.body);
    const made = await env.ok("POST", "/rules", Object.assign({}, DEFAULTS, r.body, { conditions: [{ kind: "time", scheduleId: sc.id }] }));
    assert.eq(made.conditions[0].scheduleId, sc.id, "ссылка подставлена");
  }, NEED);

  test("План правил: окно со ссылкой на новое расписание — строка объектом в теле окна, POST /schedules нет; новое окно выключено", async () => {
    const env = await makeEnv();
    const [sh, w] = lastOf(await turn(env, "заведи окно обслуживания по новому расписанию")).rules;
    assert.eq([sh.table, sh.ref, w.table, w.op, w.body.schedule, w.body.enabled], ["schedules", "shift", "windows", "create", "@shift", false], "план");
    const n = (await env.list("/schedules")).length, m = (await env.list("/maintenance-windows")).length;
    assert.eq([(await env.list("/schedules")).length, (await env.list("/maintenance-windows")).length], [n, m], "ход ничего не записал");
    const made = await env.ok("POST", "/maintenance-windows", Object.assign({}, w.body, { schedule: sh.body }));
    assert.eq([made.window.enabled, (await env.list("/schedules")).length], [false, n + 1], "одно расписание, его завела дверь окна");
    const ref = await env.call("POST", "/maintenance-windows", Object.assign({}, w.body, { schedule: "@shift" }));
    assert.status(ref, 422, "VALIDATION_FAILED", "ссылки дверь не берёт");
  }, NEED);

  test("План правил: расписание со ссылкой от правила и окна — своя запись; окно с готовым расписанием — копия строки", async () => {
    const env = await makeEnv();
    const plan = lastOf(await turn(env, `при движении на ${camera} пиши 5 минут, новое расписание, окно обслуживания`)).rules;
    assert.eq(plan.map((e) => e.table), ["schedules", "scenarios", "windows"], "порядок");
    assert.eq([plan[1].body.conditions[0].scheduleId, plan[2].body.schedule], ["@shift", "@shift"], "обе ссылки");
    const ready = FX.schedules.find((x) => !x.builtin);
    const [w] = lastOf(await turn(env, `заведи окно обслуживания по расписанию ${ready.name}`)).rules;
    assert.eq([w.body.schedule.name, "id" in w.body.schedule], [ready.name, false], "копия строки");
    assert.status(await env.call("POST", "/maintenance-windows", w.body), 201, null, "дверь берёт копию");
  }, NEED);

  test("План правил: вопрос, ответ с context; чего форма не выражает — отказ словом о странице консоли", async () => {
    const env = await makeEnv();
    const q = lastOf(await turn(env, "при движении пиши 5 минут"));
    assert.eq([q.type, q.text], ["question", "На какой камере?"], "вопрос");
    const p = lastOf(await turn(env, camera, { context: q.context }));
    assert.eq(p.type, "plan", "по ответу — план");
    const no = lastOf(await turn(env, `проверь архив на ${camera}`));
    assert.ok(no.type === "refused" && /странице консоли/.test(no.text) && !("rules" in no), "отказ");
  }, NEED);

  test("План правил: вопрос оператору и эскалация — план с шагами ask, escalate, заведённый наблюдающим", async () => {
    const env = await makeEnv();
    const q = lastOf(await turn(env, "спроси оператора"));
    assert.eq([q.type, q.text], ["question", "На какой камере?"], "вопрос о камере");
    const ask = lastOf(await turn(env, `при движении на ${camera} спроси оператора`));
    assert.eq(ask.type, "plan", "план ask");
    const [row] = ask.rules, step = row.body.steps[0];
    assert.eq([row.table, row.op, row.body.logOnly, step.control, step.default], ["scenarios", "create", true, "ask", "no"], "наблюдает, шаг ask");
    const esc = lastOf(await turn(env, `эскалация при движении на ${camera}`));
    const levels = esc.rules[0].body.steps[1].levels;
    assert.eq([esc.type, esc.rules[0].body.logOnly, esc.rules[0].body.steps[1].control, levels.length], ["plan", true, "escalate", 2], "план escalate");
    const off = lastOf(await turn(env, `при движении на ${camera} спроси оператора, выключенным`));
    assert.eq([off.rules[0].body.enabled, "logOnly" in off.rules[0].body], [false, false], "просили выключенным");
  }, NEED);

  ApiTest.loaded("api-assist.js");
})();
