/* Сценарий интерфейса: мост страницы подсистемы к механизму (часть 06 переделки по слоям, шаг 2, api/SETUP-UI.md,
   «Шаг 2: мост к механизму»). Страница стенда — тестовая страница вида security_controller/KEYPAD (шаг 1). Сообщения
   страницы сценарий отправляет сам: MessageEvent с source — окно рамки и с её происхождением, как от страницы.
   Задача 3: вызов операций read и act (call → result) по разметке x-bridge контракта, init.host.bridge, пределы,
   подтверждение команды с ActionDescriptor.confirm, ответ только той рамке, что спросила.
   Мост шага 2 есть в прототипе 81 (index_81_stranica-podsistemy-most.html); на странице без моста проверять нечего. */
UiCheck(async ({ ok, until, sleep, confirmWith }) => {
  // Прототип узнаём по имени его файла английских текстов: check_ui.py и самопроверка открывают страницу под другим именем
  const protoFile = [...document.querySelectorAll("script[src]")].map((x) => x.getAttribute("src")).find((x) => /i18n-en-\d+\.js$/.test(x));
  if (typeof bridgeCall !== "function") {
    // В прототипе 81 мост должен быть: его отсутствие там — отказ
    ok(protoFile !== "assets/i18n-en-81.js", protoFile === "assets/i18n-en-81.js" ? "в прототипе 81 нет моста шага 2 (bridgeCall)" : "на этой странице моста шага 2 нет");
    return;
  }
  const SUI_UNIT = "30000306-0000-4000-8000-000000000000"; // «Клавиатура у входа», security_controller/KEYPAD
  const CTRL = "30000294-0000-4000-8000-000000000000"; // её контроллер: камеры, команда ARM (P2)
  const VOL = "60000001-0000-4000-8000-000000000000"; // том: команда format с confirm без ввода числа
  const ODD = "30000299-0000-4000-8000-000000000000"; // test.unknown: команда calibrate с confirm.typeCount
  // Журнал запросов клиента: метод, путь, статус (тел не пишет)
  window.CONSOLEM_TRACE = [];
  const trace = (m, p) => window.CONSOLEM_TRACE.filter((t) => t.method === m && t.path.startsWith(p));
  const traced = (p) => window.CONSOLEM_TRACE.some((t) => t.path.startsWith(p));
  // Шпион: всё, что consolem отправляет странице (suiPost — единственная отправка)
  const sent = [];
  const realPost = suiPost;
  suiPost = (t, d) => { sent.push({ proto: "setup/1", type: t, ...d }); return realPost(t, d); };
  // Подмена API.raw: мост берёт API.raw в момент вызова (P10). gate — задержать ответ сервера; bodies — тела запросов
  const realRaw = API.raw;
  let gate = null;
  const bodies = [];
  API.raw = function (method, path, body, headers) {
    bodies.push({ method, path, body });
    const go = () => realRaw.call(this, method, path, body, headers);
    return gate ? gate.then(go) : go();
  };
  const hold = () => { let open; gate = new Promise((r) => (open = r)); return () => { gate = null; open(); }; };
  if (!window.CONSOLEM_SETUP_UI_SCHEMA) {
    const s = document.createElement("script");
    s.src = "api/setup-ui.schema.js";
    document.head.appendChild(s);
  }
  ok(await until(() => !!window.CONSOLEM_SETUP_UI_SCHEMA), "схема сообщений setup/1 загружена");
  const S = window.CONSOLEM_SETUP_UI_SCHEMA;
  const errsOf = (m) => (m && S.$defs[m.type] ? ConsolemContract.check({ components: { schemas: S.$defs } }, S.$defs[m.type], m, m.type, []) : ["нет сообщения"]);
  const valid = (m) => !errsOf(m).length;
  // Сообщение от страницы: окно рамки и её происхождение (у стенда — "null")
  const pageSend = (d, f = suiFrame) => window.dispatchEvent(new MessageEvent("message", { data: { proto: "setup/1", ...d }, origin: f.star ? "null" : f.origin, source: f.win }));
  const replyOf = (id) => sent.find((m) => m.type === "result" && m.id === id);
  let seq = 0;
  const call = async (op, params, body) => {
    const id = "t" + ++seq;
    const msg = { type: "call", id, op };
    if (params !== undefined) msg.params = params;
    if (body !== undefined) msg.body = body;
    pageSend(msg);
    await until(() => !!replyOf(id), 10000);
    return replyOf(id) || { id, none: true };
  };
  const code = (r) => r && r.problem && r.problem.code;
  const dlgOpen = () => document.getElementById("confirm").classList.contains("open");
  const opsBackup = new Set(CAPS.operations);
  try {
    // Разметка — из x-bridge контракта
    ok(BRIDGE_OPS.get("getUnit").bridge === "read" && BRIDGE_OPS.get("runUnitAction").bridge === "act" && BRIDGE_OPS.get("patchUnit").bridge === "draft",
      "разметка моста — из x-bridge контракта");
    ok(!BRIDGE_OPS.get("testReset").bridge && !BRIDGE_OPS.get("applyAccess").bridge && !BRIDGE_OPS.get("getSettings").bridge, "служебное, права и настройки системы закрыты");
    const gu = BRIDGE_OPS.get("getUnit"), lu = BRIDGE_OPS.get("listUnits");
    ok(gu.method === "GET" && gu.path === "/units/{uid}" && JSON.stringify(gu.pathNames) === '["uid"]' && lu.query.has("ids") && !lu.query.has("If-None-Match") && gu.api === "config",
      "карта операции: метод, путь, параметры пути и запроса");

    pick(SUI_UNIT, { force: true, tab: "gen" });
    ok(await until(() => sel === SUI_UNIT && suiFrame?.ready, 15000), "страница стенда открыта и прислала ready");
    const init = sent.find((m) => m.type === "init");
    const hb = init && init.host && init.host.bridge;
    ok(valid(init) && init.host.proto === "setup/1" && init.host.apply === "button" && !!hb, "init по схеме, host называет мост — " + JSON.stringify(errsOf(init)));
    ok(hb.ops.getUnit === "read" && hb.ops.runUnitAction === "act" && !("testReset" in hb.ops) && !("applyAccess" in hb.ops) &&
      hb.limits.calls === 8 && hb.limits.subscriptions === 16 && hb.limits.watch === LIM.watchMax - 1 &&
      hb.messages.includes("call") && hb.messages.every((t) => ["call", "subscribe", "unsubscribe", "navigate", "confirm"].includes(t) && typeof SUI_ON[t] === "function"),
      "init.host.bridge называет открытые операции и пределы");
    ok(Object.values(bridgeOpsShown(true)).every((v) => v !== "draft") && bridgeOpsShown(false).patchUnit === "draft", "только просмотр: в ops нет операций draft");

    // read: свой объект, камеры контроллера
    const direct = await realRaw("GET", `/units/${SUI_UNIT}`);
    let r = await call("getUnit", { uid: SUI_UNIT });
    ok(valid({ ...r }) && r.ok === true && r.status === 200 && r.body.uid === SUI_UNIT && (!direct.headers.etag || r.etag === direct.headers.etag),
      "getUnit своего uid: ok, 200, тело и ETag как у сервера — " + JSON.stringify(errsOf(r)));
    r = await call("getUnit", { uid: CTRL });
    const cams = r.body?.properties?.cameras || [];
    r = await call("listUnits", { ids: cams.join(",") });
    ok(r.ok && r.status === 200 && cams.length === 2 && r.body.items.length === cams.length, "listUnits по камерам контроллера: " + cams.length + " объекта");
    r = await call("listUnits", { ids: cams });
    ok(r.ok && r.body.items.length === cams.length, "параметр запроса списком — через запятую");

    // Закрытые и незнакомые операции — без запроса
    window.CONSOLEM_TRACE.length = 0;
    const closed = [await call("testReset", undefined, {}), await call("applyAccess", undefined, {}), await call("noSuchOp")];
    ok(closed.every((x) => x.ok === false && x.status === 0 && code(x) === "NOT_SUPPORTED" && valid(x)) && !traced("/test/") && !traced("/access/apply"),
      "testReset, applyAccess, noSuchOp — NOT_SUPPORTED без запроса");

    // Путь из параметров страницы не уходит на другой путь (Review Focus 1)
    window.CONSOLEM_TRACE.length = 0;
    r = await call("getUnit", { uid: "../test/reset" });
    ok(r.ok === false && r.status === 404 && trace("GET", "/units/..%2Ftest%2Freset").length === 1 && !traced("/test/reset") && valid(r),
      "getUnit {uid: \"../test/reset\"} — 404, путь закодирован, запроса к /test/reset нет");
    r = await call("getUnit", { uid: "x?y" });
    ok(r.status === 404 && trace("GET", "/units/x%3Fy").length === 1, "getUnit {uid: \"x?y\"} — 404, знак вопроса закодирован");
    // «.» и «..» encodeURIComponent не кодирует, а fetch настоящего бэкенда сворачивает их: POST /units/./actions/.. — это POST /units/
    window.CONSOLEM_TRACE.length = 0;
    r = await call("runUnitAction", { uid: ".", action: ".." });
    const rDot = await call("getUnit", { uid: ".." });
    ok(code(r) === "VALIDATION_FAILED" && r.status === 0 && r.problem.field === "/params/uid" && code(rDot) === "VALIDATION_FAILED" && rDot.problem.field === "/params/uid" &&
      !window.CONSOLEM_TRACE.length && valid(r), "параметр пути «.» и «..» — VALIDATION_FAILED с полем, без запроса");
    // У команды с idempotencyKey тело — объект: иначе команда ушла бы без ключа
    window.CONSOLEM_TRACE.length = 0;
    r = await call("runUnitAction", { uid: CTRL, action: "ARM" }, "x");
    ok(code(r) === "VALIDATION_FAILED" && r.problem.field === "/body" && !window.CONSOLEM_TRACE.length, "команда с телом не объектом — VALIDATION_FAILED /body, без запроса");

    // Параметры по описанию операции
    window.CONSOLEM_TRACE.length = 0;
    r = await call("getUnit");
    const r2 = await call("listUnits", { evil: 1 });
    const r3 = await call("getUnit", { uid: SUI_UNIT, "If-Match": "1" });
    ok(code(r) === "VALIDATION_FAILED" && r.problem.field === "/params/uid" && r.status === 0 && code(r2) === "VALIDATION_FAILED" && r2.problem.field === "/params/evil" &&
      code(r3) === "VALIDATION_FAILED" && r3.problem.field === "/params/If-Match" && !window.CONSOLEM_TRACE.length && valid(r) && valid(r2),
      "нет параметра пути, незнакомый параметр, заголовок — VALIDATION_FAILED с полем, без запроса");

    // act: команда без подтверждения идёт сразу; idempotencyKey добавляет consolem
    bodies.length = 0;
    r = await call("runUnitAction", { uid: CTRL, action: "ARM" });
    const sentBody = bodies.find((b) => b.method === "POST" && b.path === `/units/${CTRL}/actions/ARM`)?.body;
    const ctrl = await API.get(`/units/${CTRL}`);
    ok(r.ok && r.status === 200 && !dlgOpen() && typeof sentBody?.idempotencyKey === "string" && ctrl.status?.observed?.armed === true,
      "runUnitAction ARM — 200 без диалога, idempotencyKey от consolem, GET показывает итог команды");
    bodies.length = 0;
    r = await call("runUnitAction", { uid: CTRL, action: "DISARM" }, { idempotencyKey: "page-key-1" });
    ok(r.ok && bodies.find((b) => b.path === `/units/${CTRL}/actions/DISARM`)?.body?.idempotencyKey === "page-key-1", "idempotencyKey страницы consolem не меняет");

    // act с ActionDescriptor.confirm: сначала диалог consolem; отказ — CANCELLED без запроса
    window.CONSOLEM_TRACE.length = 0;
    const idF = "t" + ++seq;
    pageSend({ type: "call", id: idF, op: "runUnitAction", params: { uid: VOL, action: "format" } });
    ok(await until(dlgOpen, 5000) && !document.getElementById("confirmCountInp") && document.getElementById("confirmTitle").textContent.includes("Форматировать") &&
      !replyOf(idF), "команда format с confirm: диалог consolem открыт, ответа ещё нет");
    document.getElementById("confirmCancel").click();
    ok(await until(() => !!replyOf(idF), 5000) && code(replyOf(idF)) === "CANCELLED" && replyOf(idF).status === 0 && valid(replyOf(idF)) && !trace("POST", `/units/${VOL}/actions/`).length,
      "отказ в диалоге — CANCELLED, status 0, запроса нет");
    const idC = "t" + ++seq;
    pageSend({ type: "call", id: idC, op: "runUnitAction", params: { uid: ODD, action: "calibrate" }, body: { params: { level: "high" } } });
    ok(await until(() => dlgOpen() && !!document.getElementById("confirmCountInp"), 5000) && document.getElementById("confirmOk").disabled,
      "команда с confirm.typeCount: в диалоге поле для числа, «Выполнить» неактивна");
    await confirmWith(1);
    ok(await until(() => !!replyOf(idC), 5000) && replyOf(idC).ok === true && replyOf(idC).status >= 200 && replyOf(idC).status < 300 && trace("POST", `/units/${ODD}/actions/calibrate`).length === 1,
      "число введено — команда ушла, ответ сервера странице: " + (replyOf(idC) && replyOf(idC).status));

    // Система не объявила операцию — NOT_SUPPORTED, и в ops её нет
    CAPS.operations.delete("listLicenses");
    window.CONSOLEM_TRACE.length = 0;
    r = await call("listLicenses");
    ok(code(r) === "NOT_SUPPORTED" && r.status === 0 && !("listLicenses" in bridgeOpsShown(false)) && !traced("/licenses"), "операция без capabilities.operations — NOT_SUPPORTED, в ops её нет");
    CAPS.operations = new Set(opsBackup);
    r = await call("listLicenses");
    ok(r.ok && r.status === 200, "после возврата capabilities listLicenses отвечает");

    // Предел: восемь вызовов в работе, девятый — BUSY сразу
    let release = hold();
    const ids = [];
    for (let i = 0; i < 9; i++) { const id = "b" + i; ids.push(id); pageSend({ type: "call", id, op: "getUnit", params: { uid: SUI_UNIT } }); }
    ok(await until(() => !!replyOf("b8"), 3000) && code(replyOf("b8")) === "BUSY" && replyOf("b8").status === 0 && ids.slice(0, 8).every((id) => !replyOf(id)),
      "девятый вызов разом — BUSY, восемь ждут ответа сервера");
    release();
    ok(await until(() => ids.slice(0, 8).every((id) => replyOf(id)?.ok === true), 5000), "восемь вызовов получили ответ сервера");
    r = await call("getUnit", { uid: SUI_UNIT });
    ok(r.ok, "после ответов предел свободен");

    // Ответ — только той рамке, что спросила (P4): рамку загрузили заново, пока шёл вызов
    release = hold();
    const f0 = suiFrame;
    pageSend({ type: "call", id: "stale1", op: "getUnit", params: { uid: SUI_UNIT } });
    await sleep(50);
    suiRetry();
    ok(await until(() => suiFrame && suiFrame !== f0 && suiFrame.ready, 15000), "рамку загрузили заново, новая страница прислала ready");
    release();
    await sleep(300);
    ok(!replyOf("stale1"), "ответ на вызов прежней рамки не ушёл никому");
    // Сбой рамки (suiFail) тоже снимает её вызовы
    release = hold();
    const f1 = suiFrame;
    pageSend({ type: "call", id: "stale2", op: "getUnit", params: { uid: SUI_UNIT } });
    await sleep(50);
    suiFail("проверка");
    release();
    await sleep(300);
    ok(!replyOf("stale2") && f1.state === "failed", "после сбоя рамки ответ на её вызов не ушёл");
    // Диалог команды прежней рамки закрывается без ответа
    suiRetry();
    ok(await until(() => suiFrame && suiFrame !== f1 && suiFrame.ready, 15000), "после сбоя рамка загружена снова");
    pageSend({ type: "call", id: "stale3", op: "runUnitAction", params: { uid: VOL, action: "format" } });
    ok(await until(dlgOpen, 5000), "диалог команды открыт");
    window.CONSOLEM_TRACE.length = 0;
    suiRetry();
    ok(await until(() => !dlgOpen(), 3000) && !replyOf("stale3") && !trace("POST", `/units/${VOL}/actions/`).length, "рамка закрылась — диалог её команды закрыт без ответа и без запроса");
    ok(await until(() => suiFrame?.ready, 15000), "рамка снова готова");

    // Все ответы — по схеме
    const results = sent.filter((m) => m.type === "result");
    const badRes = results.filter((m) => !valid(m));
    ok(!badRes.length, "все result по схеме (" + results.length + ") — " + JSON.stringify(badRes.slice(0, 1).map(errsOf)));
  } finally {
    API.raw = realRaw;
    suiPost = realPost;
    gate = null;
    CAPS.operations = new Set(opsBackup);
    if (dlgOpen()) closeConfirm();
    window.CONSOLEM_TRACE = null;
  }
});
