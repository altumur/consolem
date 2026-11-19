/* Сценарий интерфейса: мост страницы подсистемы к механизму (часть 06 переделки по слоям, шаг 2, api/SETUP-UI.md,
   «Шаг 2: мост к механизму»). Страница стенда — тестовая страница вида security_controller/KEYPAD (шаг 1). Сообщения
   страницы сценарий отправляет сам: MessageEvent с source — окно рамки и с её происхождением, как от страницы.
   Задача 3: вызов операций read и act (call → result) по разметке x-bridge контракта, init.host.bridge, пределы,
   подтверждение команды с ActionDescriptor.confirm, ответ только той рамке, что спросила.
   Задача 4: черновик моста — patchUnit, createUnits, deleteUnit (диалог с вводом числа), deleteObjects, moveUnit,
   createOperation; «Применить» одной POST /operations вместе с правкой страницы, applied со steps, откат, конфликт версий
   (версия шага — с момента вызова, чужая правка пришла потоком по подписке), «Сбросить» — revert со steps [].
   Задача 5: подписка на поток (subscribe, event, unsubscribe, пределы, stream.reset), подтверждение страницы (confirm:
   текст — текстом, строка о странице вида, ввод числа, BUSY), переход (navigate: NOT_FOUND, свой объект, черновик —
   CANCELLED, удачный переход со вспышкой без ответа), закрытие рамки снимает подписки и диалог.
   Задача 6: полный цикл на самой тестовой странице — её «сложный» экран по контроллеру клавиатуры (P2). Прогон #run=<имя>
   в адресе рамки: страница сама проходит шаги и шлёт x-run {run, step, ok, detail} (вне протокола, хост пропускает).
   Прогоны read, discovery, draft («Применить» — одна POST /operations, applied.steps у страницы), confirm, navigate
   (переход со вспышкой), nobridge (хост шага 1: блоки шага 2 скрыты, change работает) и denied (вход только с
   просмотром: 403 сервера у команды и PERMISSION_DENIED моста у черновика).
   Мост шага 2 есть в index.html (перенесён из прототипа 81). В прототипе, сделанном до переноса (у него свой
   assets/i18n-en-NN.js), моста может не быть: там проверять нечего. */
UiCheck(async ({ ok, until, sleep, confirmWith }) => {
  // Прототип узнаём по имени его файла английских текстов: check_ui.py и самопроверка открывают страницу под другим именем
  const protoFile = [...document.querySelectorAll("script[src]")].map((x) => x.getAttribute("src")).find((x) => /i18n-en-\d+\.js$/.test(x));
  if (typeof bridgeCall !== "function") {
    // В index.html мост должен быть: его отсутствие там — отказ
    ok(!!protoFile, protoFile ? "на этой странице моста шага 2 нет" : "в index.html нет моста шага 2 (bridgeCall)");
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
  // readAs = {path, res}: ответ res вместо GET path (чтение вида перед командой act)
  let readAs = null;
  const bodies = [];
  API.raw = function (method, path, body, headers) {
    bodies.push({ method, path, body });
    if (readAs && method === "GET" && path === readAs.path) return Promise.resolve({ headers: {}, ...readAs.res });
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
  // Задача 4: возврат API.post — в finally
  let restorePost = null;
  // Задача 6: обёртка suiHostInfo, приём x-run и сброс набора с другим пользователем — вернуть в finally
  let restoreHost = null, onXRun = null, resetBack = false;
  // Ждать условия, которое проверяет сервер (until ждёт только синхронное условие)
  const untilA = async (fn, ms = 10000) => { for (let i = 0; i < ms / 100; i++) { try { if (await fn()) return true; } catch (e) {} await sleep(100); } return false; };
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
    // act, вид объекта не прочитан: consolem не знает, есть ли у команды подтверждение, и команду не отправляет (fail closed).
    // Объекта нет в кэше (find подменён), GET /units/{uid} подменён ответом readAs
    const realFind = find;
    const actPosts = (uid) => bodies.filter((b) => b.method === "POST" && b.path.startsWith(`/units/${uid}/actions/`)).length;
    const actUnread = async (res) => {
      find = (id) => (id === VOL ? null : realFind(id));
      readAs = { path: `/units/${VOL}`, res };
      bodies.length = 0;
      try { return await call("runUnitAction", { uid: VOL, action: "format" }); }
      finally { find = realFind; readAs = null; }
    };
    r = await actUnread({ status: 0 });
    ok(code(r) === "UPSTREAM_UNAVAILABLE" && r.status === 0 && valid(r) && !dlgOpen() && !actPosts(VOL),
      "act: GET /units/{uid} не прошёл — UPSTREAM_UNAVAILABLE, status 0, без диалога и без команды" + ": " + r.status + " " + code(r) + ", команд " + actPosts(VOL));
    r = await actUnread({ status: 200, body: { uid: VOL, kind: "no.such/KIND", name: "x" } });
    ok(code(r) === "UPSTREAM_UNAVAILABLE" && r.status === 0 && !dlgOpen() && !actPosts(VOL),
      "act: вид объекта consolem не знает — UPSTREAM_UNAVAILABLE без команды" + ": " + r.status + " " + code(r) + ", команд " + actPosts(VOL));
    r = await actUnread({ status: 404, body: { code: "NOT_FOUND", message: "нет объекта" } });
    ok(r.ok === false && r.status === 404 && code(r) === "NOT_FOUND" && valid(r) && !dlgOpen() && !actPosts(VOL),
      "act: GET /units/{uid} ответил 404 — ответ сервера странице как есть, без команды" + ": " + r.status + " " + code(r) + ", команд " + actPosts(VOL));
    // Итоговая волна, I1: команды нет в описании вида (вид незнаком или кэш устарел) — consolem не знает, есть ли у неё
    // подтверждение, и команду не отправляет: UPSTREAM_UNAVAILABLE со status 0, без диалога и без запроса
    const kindPosts = (k) => bodies.filter((b) => b.method === "POST" && b.path.startsWith(`/kinds/${encodeURIComponent(k)}/actions/`)).length;
    bodies.length = 0;
    const actGone = [
      await call("runKindAction", { kind: "no.such/KIND", action: "check" }),
      await call("runKindAction", { kind: "archive.network", action: "noSuchAction" }),
      await call("runUnitAction", { uid: CTRL, action: "NO_SUCH_ACTION" }),
    ];
    ok(actGone.every((x) => code(x) === "UPSTREAM_UNAVAILABLE" && x.status === 0 && valid(x)) && !dlgOpen() &&
      !kindPosts("no.such/KIND") && !kindPosts("archive.network") && !actPosts(CTRL),
      "act: команды нет в описании вида — UPSTREAM_UNAVAILABLE, status 0, без диалога и без запроса — " +
      JSON.stringify(actGone.map((x) => x.status + " " + code(x))) + ", команд " + [kindPosts("no.such/KIND"), kindPosts("archive.network"), actPosts(CTRL)]);
    // Команда вида, которую consolem знает, уходит
    bodies.length = 0;
    r = await call("runKindAction", { kind: "archive.network", action: "check" });
    ok(r.status > 0 && kindPosts("archive.network") === 1, "runKindAction знакомой команды вида — запрос ушёл, ответ сервера странице: " + r.status);

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

    // ── Задача 4: черновик моста — правка, создание, перенос и удаление объектов одной операцией ──
    // Датчики: S1 и S3 — у контроллера клавиатуры, S2 — у второго контроллера (P2)
    const S1 = "30000296-0000-4000-8000-000000000000", S3 = "30000297-0000-4000-8000-000000000000";
    const S2 = "30000298-0000-4000-8000-000000000000";
    const SENSOR = "security_controller/SENSOR";
    // Перенос: у датчика набора нет move, а demo.json не меняем, и служебных операций у встроенного сервера страницы нет.
    // Поэтому переносит объект вида с move — «Незнакомый объект 2» (test.unknown) из-под ODD в корень домена
    const ODD2 = "30000300-0000-4000-8000-000000000000";
    ok(sel === SUI_UNIT && suiFrame?.ready && !cardDiff().length, "карточка клавиатуры открыта, черновик пуст");
    // Тело POST /operations: cardApply зовёт API.post, а не API.raw (P10)
    const realPost2 = API.post;
    const opBodies = [];
    API.post = function (path, data, headers) { if (path === "/operations") opBodies.push(JSON.parse(JSON.stringify(data))); return realPost2.call(this, path, data, headers); };
    restorePost = () => { API.post = realPost2; };
    const v0 = {};
    for (const id of [S1, S2, ODD2]) v0[id] = (await realRaw("GET", `/units/${id}`)).body.version;

    window.CONSOLEM_TRACE.length = 0;
    const r1 = await call("patchUnit", { uid: S1 }, { name: "Мост 1" });
    ok(r1.ok === true && r1.status === 202 && r1.body?.drafted === true && Number.isInteger(r1.body.step) && valid(r1) &&
      !trace("PATCH", "/units").length && !trace("POST", "/operations").length, "patchUnit датчика — 202, drafted, step; на сервер ничего не ушло");
    ok(cardDiff().some((x) => x.bridge?.step === r1.body.step && x.label.includes("Датчик двери")), "шаг моста — строка черновика карточки с именем объекта");
    ok(await until(() => sent.some((m) => m.type === "draft" && (m.steps || []).some((s) => s.step === r1.body.step && s.op === "patchUnit")), 3000) &&
      valid(sent.filter((m) => m.type === "draft").pop()), "странице ушёл draft со steps");
    r = await call("patchUnit", { uid: SUI_UNIT }, { name: "Своё" });
    ok(code(r) === "VALIDATION_FAILED" && r.problem.field === "/params/uid" && r.status === 0, "patchUnit своего uid — VALIDATION_FAILED /params/uid: своё — через change");
    const rc = await call("createUnits", undefined, { items: [{ kind: SENSOR, parentId: CTRL, name: "Мост новый", properties: { zone: "Мост" } }] });
    ok(rc.ok && rc.status === 202 && rc.body.drafted, "createUnits под контроллером — drafted");
    r = await call("createUnits", undefined, { items: [{ kind: SENSOR, name: "Без родителя" }] });
    ok(code(r) === "NOT_SUPPORTED" && r.status === 0, "createUnits без parentId — NOT_SUPPORTED");
    // Волна 06, п. 14: тело UnitCreate consolem проверяет при вызове, а не только при «Применить»
    window.CONSOLEM_TRACE.length = 0;
    const cuBad = [
      [await call("createUnits", undefined, { items: [{ parentId: CTRL, name: "Без вида", properties: {} }] }), "/body/items/0/kind"],
      [await call("createUnits", undefined, { items: [{ kind: SENSOR, parentId: CTRL, name: "Без свойств" }] }), "/body/items/0/properties"],
      [await call("createUnits", undefined, { items: [{ kind: SENSOR, parentId: CTRL, properties: {} }, { kind: SENSOR, parentId: CTRL, name: 5, properties: {} }] }), "/body/items/1/name"],
      [await call("createUnits", undefined, { items: [{ kind: SENSOR, parentId: CTRL, properties: [] }] }), "/body/items/0/properties"],
    ];
    ok(cuBad.every(([x, fl]) => code(x) === "VALIDATION_FAILED" && x.status === 0 && x.problem.field === fl && valid(x)) && !window.CONSOLEM_TRACE.length &&
      !cardDiff().some((x) => x.bridge && x.label.includes("Без")), "createUnits с телом не по UnitCreate — VALIDATION_FAILED с полем при вызове, без запроса и строки — " + JSON.stringify(cuBad.map(([x]) => x.problem)));
    // Волна 06, п. 10: свой объект страница не удаляет и не переносит
    window.CONSOLEM_TRACE.length = 0;
    const ownDel = await call("deleteUnit", { uid: SUI_UNIT });
    const ownMove = await call("moveUnit", { uid: SUI_UNIT }, { parentId: null });
    ok([ownDel, ownMove].every((x) => code(x) === "NOT_SUPPORTED" && x.status === 0 && x.problem.field === "/params/uid" && valid(x)) && !dlgOpen() && !window.CONSOLEM_TRACE.length,
      "deleteUnit и moveUnit своего uid — NOT_SUPPORTED /params/uid, без диалога и без запроса");
    // Удаление — диалог консоли с вводом числа
    const nDraft = () => cardDiff().filter((x) => x.bridge).length;
    const idD = "t" + ++seq;
    pageSend({ type: "call", id: idD, op: "deleteUnit", params: { uid: S2 } });
    ok(await until(() => dlgOpen() && !!document.getElementById("confirmCountInp"), 5000) && document.getElementById("confirmOk").disabled &&
      document.getElementById("confirmMsg").textContent.includes("Датчик ворот") && document.getElementById("confirmMsg").textContent.includes("«Применить»") && !replyOf(idD),
      "deleteUnit: диалог консоли с полем числа и именем объекта, «Удалить» неактивна, ответа ещё нет");
    // Волна 06, пп. 8 и 11: один объект — единственное число; что останется — полным предложением; число вложенных — без двоеточия
    const delT = document.getElementById("confirmMsg").textContent;
    ok(delT.includes("просит удалить объект.") && delT.includes("Останутся другие объекты домена и другие шаги черновика.") && !delT.includes("Останется:") &&
      !/вложенные объекты: \d/.test(delT), "диалог удаления одного объекта: «просит удалить объект», что останется — полным предложением — " + delT.replace(/\s+/g, " ").slice(0, 300));
    const inp = document.getElementById("confirmCountInp");
    inp.value = "2"; inp.dispatchEvent(new Event("input"));
    const off2 = document.getElementById("confirmOk").disabled;
    inp.value = "1"; inp.dispatchEvent(new Event("input"));
    ok(off2 && !document.getElementById("confirmOk").disabled, "число 2 — «Удалить» неактивна, число 1 — активна");
    await confirmWith(1);
    ok(await until(() => !!replyOf(idD), 5000) && replyOf(idD).status === 202 && replyOf(idD).body.drafted && !trace("DELETE", "/units").length, "подтвердил — шаг удаления в черновике, запроса нет");
    const before = nDraft();
    const idX = "t" + ++seq;
    pageSend({ type: "call", id: idX, op: "deleteUnit", params: { uid: S3 } });
    ok(await until(dlgOpen, 5000), "второй диалог удаления открыт");
    document.getElementById("confirmCancel").click();
    ok(await until(() => !!replyOf(idX), 5000) && code(replyOf(idX)) === "CANCELLED" && replyOf(idX).status === 0 && nDraft() === before, "отказ в диалоге — CANCELLED, строк черновика столько же");
    const rule = ((await realRaw("GET", "/rules")).body?.items || [])[0];
    r = await call("deleteObjects", undefined, { items: [{ id: rule?.id || "нет-правила", version: "1" }] });
    ok(!!rule && code(r) === "NOT_SUPPORTED" && !dlgOpen(), "deleteObjects с id правила — NOT_SUPPORTED без диалога");
    r = await call("createOperation", undefined, { items: [{ uid: CTRL, action: "ARM" }] });
    ok(code(r) === "NOT_SUPPORTED", "createOperation с шагом action — NOT_SUPPORTED");
    r = await call("moveUnit", { uid: ODD2 }, { parentId: null });
    ok(r.ok && r.status === 202 && r.body.drafted && cardDiff().some((x) => x.bridge && x.label.includes("Незнакомый объект 2")), "moveUnit в корень домена — drafted, подпись называет объект");
    // Своя правка страницы и план
    pageSend({ type: "change", patch: { display_text: "Мост" } });
    ok(await until(() => cardDiff().some((x) => !x.bridge), 3000) && nDraft() === 4, "правка страницы и 4 шага моста — в одном черновике");
    cardPlan();
    ok(await until(() => document.getElementById("bmodal")?.classList.contains("open"), 5000), "план открыт");
    const planText = document.getElementById("bmodal").textContent;
    ok(["Изменить «Датчик двери»", "Добавить:", "«Мост новый»", "Удалить «Датчик ворот»", "Перенести «Незнакомый объект 2»"].every((t) => planText.includes(t)), "в плане строки моста с подписями");
    closeBulkModal();
    window.CONSOLEM_TRACE.length = 0;
    const sentAt = sent.length;
    cardApply();
    ok(await until(() => trace("POST", "/operations").length >= 1, 5000) && trace("POST", "/operations").filter((t) => t.path === "/operations").length === 1, "«Применить» — одна POST /operations");
    const ob = opBodies[opBodies.length - 1] || {};
    ok((ob.items || []).length === 5 && ob.items[0].uid === SUI_UNIT && ob.items[1].uid === S1 && ob.items[1].patch?.name === "Мост 1" && ob.items[2].createUnit?.name === "Мост новый" &&
      ob.items[3].uid === S2 && ob.items[3].delete === true && ob.items[4].uid === ODD2 && ob.items[4].move === null &&
      [S1, S2, ODD2].every((id) => ob.expectedVersions?.[id] === v0[id]), "тело: правка страницы и 4 шага моста; expectedVersions — версии S1, S2, ODD2 — " + JSON.stringify(ob).slice(0, 300));
    const applied = () => sent.slice(sentAt).find((m) => m.type === "applied" && Array.isArray(m.steps));
    ok(await until(applied, 10000) && valid(applied()) && applied().steps.length === 4 && applied().steps.every((s) => s.state === "ok") &&
      !!applied().steps.find((s) => s.step === rc.body.step)?.createdId &&
      !sent.slice(sentAt).some((m) => m.type === "revert"), "applied: 4 шага ok, у createUnit — createdId, revert перед ним нет — " + JSON.stringify(applied()?.steps));
    const madeId = applied()?.steps.find((s) => s.createdId)?.createdId;
    const g = async (id) => realRaw("GET", `/units/${id}`);
    ok((await g(S1)).body.name === "Мост 1" && (await g(madeId)).status === 200 && (await g(S2)).status === 404 && (await g(ODD2)).body.parentId == null && !cardDiff().length,
      "на сервере: S1 переименован, новый есть, S2 нет, ODD2 в корне; черновик пуст");
    const undo = await until(() => document.querySelector("#ttu-undo .ttu-act"), 3000) && document.querySelector("#ttu-undo .ttu-act");
    ok(!!undo, "уведомление с «Отменить»");
    undo?.click();
    // Откат идёт шагами по одному: ждать, пока вернутся все четыре
    ok(await untilA(async () => (await g(S2)).status === 200 && (await g(madeId)).status === 404 && (await g(S1)).body.name !== "Мост 1" && (await g(ODD2)).body.parentId === ODD),
      "«Отменить» — откат: S2 снова есть, нового нет, S1 с прежним именем, ODD2 снова под ODD");
    // Откат — своя операция над объектом страницы: пока она идёт, «Применить» консоль не начнёт
    ok(await until(() => (!bq || bq.finished) && !busyHit(SUI_UNIT), 10000), "откат закончен, объект страницы свободен");
    // Черновик только из шагов моста: applied приходит, хотя свой объект не изменился (P5)
    const sentAt2 = sent.length;
    r = await call("patchUnit", { uid: S3 }, { name: "Мост 3" });
    cardApply();
    const applied2 = () => sent.slice(sentAt2).find((m) => m.type === "applied" && Array.isArray(m.steps));
    ok(await until(applied2, 10000) && applied2().steps.length === 1 && applied2().steps[0].state === "ok" && (await g(S3)).body.name === "Мост 3", "черновик из одного шага моста — applied со steps");
    await until(() => !bq || bq.finished, 5000);
    // Волна 06, п. 9: итог операции не прочитан (GET /operations/{id} после очереди не прошёл) — шаги fail UPSTREAM_UNAVAILABLE
    if (document.getElementById("bmodal")?.classList.contains("open")) closeBulkModal();
    const realGet = API.get;
    API.get = function (path, ...rest) {
      if (String(path).startsWith("/operations/") && suiFrame && !suiFrame.applyQ) return Promise.reject(Object.assign(new Error("нет связи"), { status: 0 }));
      return realGet.call(this, path, ...rest);
    };
    const sentAtG = sent.length;
    try {
      r = await call("patchUnit", { uid: S3 }, { name: "Мост 3б" });
      cardApply();
      const appliedG = () => sent.slice(sentAtG).find((m) => m.type === "applied" && Array.isArray(m.steps));
      ok(await until(appliedG, 10000) && valid(appliedG()) && appliedG().steps.length === 1 && appliedG().steps[0].state === "fail" && appliedG().steps[0].code === "UPSTREAM_UNAVAILABLE",
        "GET /operations/{id} после «Применить» не прошёл — шаг fail UPSTREAM_UNAVAILABLE, а не cancel — " + JSON.stringify(appliedG()?.steps));
    } finally { API.get = realGet; }
    await until(() => !bq || bq.finished, 5000);
    // Версия шага — в момент вызова (P6): чужая правка между вызовом и «Применить» даёт конфликт версий, даже если поток
    // уже принёс консоли новую версию
    if (document.getElementById("bmodal")?.classList.contains("open")) closeBulkModal();
    // Страница подписана на S1: чужая правка приходит потоком, и hwVer консоли становится новым сам
    const subV = "v" + ++seq;
    pageSend({ type: "subscribe", id: subV, entityIds: [S1] });
    ok(await until(() => replyOf(subV)?.ok === true, 5000) && await until(() => watchLast.split(",").includes(S1), 5000), "подписка на S1: S1 в наблюдении потока");
    const vS1 = (await g(S1)).body.version;
    r = await call("patchUnit", { uid: S1 }, { name: "Конфликт" });
    const sentAtE = sent.length;
    const foreign = (await realRaw("PATCH", `/units/${S1}`, { name: "Чужое" }, { "If-Match": `"${vS1}"` })).body;
    ok(await until(() => sent.slice(sentAtE).some((m) => m.type === "event" && m.sub === subV && m.message.entityId === S1) && hwVer.get(S1) === foreign.version, 5000),
      "чужая правка S1 пришла потоком: event подписки, hwVer консоли — новая версия");
    pageSend({ type: "unsubscribe", sub: subV });
    const sentAt3 = sent.length;
    cardApply();
    const applied3 = () => sent.slice(sentAt3).find((m) => m.type === "applied" && Array.isArray(m.steps));
    ok(await until(applied3, 10000) && valid(applied3()) && applied3().steps.every((s) => s.state === "fail" && s.code === "VERSION_MISMATCH") && opBodies[opBodies.length - 1].expectedVersions[S1] === vS1,
      "чужая правка — 412: applied со state fail и VERSION_MISMATCH; версия шага — до чужой правки — " + JSON.stringify(applied3()));
    ok((await g(S1)).body.name === "Чужое" && cardDiff().some((x) => x.bridge) && !sent.slice(sentAt3).some((m) => m.type === "revert"), "чужая правка не затёрта; черновик и шаг остались, revert нет");
    if (document.getElementById("bmodal")?.classList.contains("open")) closeBulkModal();
    const sentAt4 = sent.length;
    cardReset();
    ok(await until(() => sent.slice(sentAt4).some((m) => m.type === "revert" && Array.isArray(m.steps) && !m.steps.length), 3000) && !cardDiff().length, "«Сбросить» — revert со steps [], черновик пуст");
    // Только просмотр — шаги draft закрыты
    suiFrame.readOnly = true;
    window.CONSOLEM_TRACE.length = 0;
    r = await call("patchUnit", { uid: S1 }, { name: "Нельзя" });
    ok(code(r) === "PERMISSION_DENIED" && r.status === 0 && r.problem.params?.readOnly === true && !cardDiff().length && !window.CONSOLEM_TRACE.length, "только просмотр: patchUnit — PERMISSION_DENIED, без запроса и строки");
    suiFrame.readOnly = false;

    // ── Задача 5: подписка на поток, переход со вспышкой, подтверждение consolem ──
    ok(["call", "subscribe", "unsubscribe", "navigate", "confirm"].every((t) => bridgeHostInfo(false).messages.includes(t)), "init.host.bridge.messages называет все сообщения шага 2");
    const subscribe = async (id, f) => { pageSend({ type: "subscribe", id, ...f }); await until(() => !!replyOf(id), 5000); return replyOf(id) || { id, none: true }; };
    // Домен с поиском в сети (профиль vms.discovery/1): первый, у которого getDiscovery через мост отвечает 200
    let domainId = null;
    for (const d of domains) { if ((await call("getDiscovery", { uid: d.id })).ok) { domainId = d.id; break; } }
    ok(!!domainId, "домен с поиском в сети найден: " + domainId);
    const cam = cams[0], cam2 = cams[1];
    r = await subscribe("s1", { entityIds: [domainId], types: ["discovery.progress", "discovery.finished"] });
    ok(r.ok === true && r.status === 200 && r.body?.sub === "s1" && valid(r), "subscribe s1 — result ok, body.sub равен id — " + JSON.stringify(r));
    const evAt = sent.length;
    r = await call("startDiscovery", { uid: domainId });
    ok(r.ok && r.status === 202, "startDiscovery домена через мост — 202: " + r.status);
    const evs = () => sent.slice(evAt).filter((m) => m.type === "event");
    ok(await until(() => evs().some((m) => m.sub === "s1" && m.message.type === "discovery.finished"), 30000), "event s1 с discovery.finished пришёл");
    ok(evs().every((m) => m.sub === "s1" && m.message.entityId === domainId && ["discovery.progress", "discovery.finished"].includes(m.message.type)) && evs().every(valid),
      "в s1 только события поиска домена, по схеме — " + JSON.stringify(evs().map((m) => m.message.type + ":" + m.message.entityId).slice(0, 4)));
    r = await subscribe("s2", { entityIds: [cam] });
    ok(r.ok && watchIds().includes(cam), "subscribe s2 с камерой — камера в watchIds()");
    // Волна 06, п. 5: правка камеры, пока s1 есть, приходит в s2 и не приходит в s1
    ok(await until(() => watchLast.split(",").includes(cam), 5000), "камера в наблюдении потока");
    const camAt = sent.length, camV = (await realRaw("GET", `/units/${cam}`)).body.version;
    const camName = (await realRaw("GET", `/units/${cam}`)).body.name;
    const camP = await realRaw("PATCH", `/units/${cam}`, { name: camName + " " }, { "If-Match": `"${camV}"` });
    const camEvs = () => sent.slice(camAt).filter((m) => m.type === "event" && m.message.entityId === cam);
    ok(camP.status === 200 && await until(() => camEvs().some((m) => m.sub === "s2"), 5000) && !camEvs().some((m) => m.sub === "s1"),
      "правка камеры пришла в s2 и не пришла в s1 — " + JSON.stringify(camEvs().map((m) => m.sub + ":" + m.message.type)));
    const camV2 = (await realRaw("GET", `/units/${cam}`)).body.version;
    await realRaw("PATCH", `/units/${cam}`, { name: camName }, { "If-Match": `"${camV2}"` });
    pageSend({ type: "unsubscribe", sub: "s2" });
    ok(await until(() => !watchIds().includes(cam), 2000) && !bridgeSubs.has("s2"), "unsubscribe s2 — камеры нет в watchIds()");
    // Пределы: 16 подписок, объекты — не больше watchMax − 1
    for (let i = 2; i <= 16; i++) await subscribe("k" + i, { kinds: [SENSOR] });
    r = await subscribe("k17", { kinds: [SENSOR] });
    ok(bridgeSubs.size === 16 && code(r) === "BUSY" && r.status === 0 && valid(r), "16 подписок есть — 17-я BUSY");
    for (let i = 2; i <= 16; i++) pageSend({ type: "unsubscribe", sub: "k" + i });
    ok(bridgeSubs.size === 1, "подписки сняты, осталась s1");
    // Волна 06, п. 2: в одной подписке объектов не больше limits.watch, видов и типов не больше 32, строка — до 200 знаков
    r = await subscribe("big", { entityIds: Array.from({ length: LIM.watchMax }, (_, i) => "w" + i) });
    ok(code(r) === "VALIDATION_FAILED" && r.problem.field === "/entityIds" && !bridgeSubs.has("big") && !watchIds().includes("w0"), "объектов в подписке больше limits.watch — VALIDATION_FAILED /entityIds, в наблюдение не попали");
    r = await subscribe("bad", { entityIds: "x" });
    ok(code(r) === "VALIDATION_FAILED" && r.problem.field === "/entityIds", "entityIds не список — VALIDATION_FAILED /entityIds");
    const sizeBad = [
      [await subscribe("bk", { kinds: Array.from({ length: 33 }, (_, i) => "k" + i) }), "/kinds"],
      [await subscribe("bt", { types: Array.from({ length: 33 }, (_, i) => "t" + i) }), "/types"],
      [await subscribe("bs", { kinds: ["k".repeat(201)] }), "/kinds"],
      [await subscribe("be", { entityIds: ["e".repeat(201)] }), "/entityIds"],
    ];
    ok(sizeBad.every(([x, fl]) => code(x) === "VALIDATION_FAILED" && x.problem.field === fl && valid(x)) && bridgeSubs.size === 1,
      "33 вида, 33 типа, строка длиннее 200 знаков — VALIDATION_FAILED с полем — " + JSON.stringify(sizeBad.map(([x]) => x.problem)));
    // Итоговая волна, I3: в kinds — только виды объектов, которые consolem знает (KINDS). Сообщения поиска, вопросов
    // правил, операций и выгрузки (kind discovery, rulePrompt, operation, exportJob) по kinds не приходят
    const kindBad = [];
    for (const k of ["discovery", "rulePrompt", "operation", "exportJob", "test.kind2"]) kindBad.push(await subscribe("kb-" + k, { kinds: [SENSOR, k] }));
    ok(kindBad.every((x) => code(x) === "VALIDATION_FAILED" && x.status === 0 && x.problem.field === "/kinds" && valid(x)) && bridgeSubs.size === 1,
      "kinds не вида объекта — VALIDATION_FAILED /kinds, подписки нет — " + JSON.stringify(kindBad.map((x) => code(x) + " " + (x.problem && x.problem.field))));
    // Объект, которого нет или которого пользователь не видит, — NOT_FOUND /entityIds; в наблюдение он не попадает
    window.CONSOLEM_TRACE.length = 0;
    r = await subscribe("nf", { entityIds: [cam, "30009999-0000-4000-8000-000000000000"] });
    ok(code(r) === "NOT_FOUND" && r.status === 0 && r.problem.field === "/entityIds" && valid(r) && !bridgeSubs.has("nf") && trace("GET", "/units").length >= 1,
      "subscribe с объектом, которого нет, — consolem спросил сервер, NOT_FOUND /entityIds");
    bridgeSubs.set("fake", { f: suiFrame, entityIds: new Set(["нет-такого"]), kinds: new Set(), types: null });
    ok(!bridgeWatchIds().includes("нет-такого"), "в наблюдение идут только объекты, которые consolem знает (hwVer)");
    bridgeSubs.delete("fake");
    // Предел объектов во всех подписках: при watchMax 3 места два, одно занимает домен s1
    const wm = LIM.watchMax;
    LIM.watchMax = 3;
    try {
      const w1 = await subscribe("w1", { entityIds: [cam] });
      const w2 = await subscribe("w2", { entityIds: [cam2] });
      ok(w1.ok && code(w2) === "BUSY" && w2.status === 0 && !bridgeSubs.has("w2"), "объектов во всех подписках больше limits.watch — BUSY");
    } finally { LIM.watchMax = wm; }
    pageSend({ type: "unsubscribe", sub: "w1" });
    // stream.reset — всем подпискам
    await subscribe("s3", { entityIds: [cam] });
    const rsAt = sent.length;
    bridgeOnEvent({ id: "0", type: "stream.reset", at: new Date().toISOString() });
    ok(["s1", "s3"].every((s) => sent.slice(rsAt).some((m) => m.type === "event" && m.sub === s && m.message.type === "stream.reset")), "stream.reset — event у каждой подписки");

    // confirm: текст страницы — текстом, строка о странице, ввод числа
    pageSend({ type: "confirm", id: "cf1", title: "Поставить на охрану", text: "<img src=x>", lose: ["Тревоги датчиков"], keep: ["<b>Камеры</b>"], count: 2, okLabel: "Поставить" });
    ok(await until(dlgOpen, 5000) && !document.querySelector("#confirm img") && !document.querySelector("#confirmMsg b") && document.getElementById("confirmMsg").textContent.includes("<img src=x>"), "текст страницы — текстом");
    const msgT = document.getElementById("confirmMsg").textContent;
    // Волна 06, п. 6: строка о странице — в шапке над заголовком страницы, а не в тексте
    const asker = document.getElementById("confirmAsker"), cTitle = document.getElementById("confirmTitle");
    ok(!!asker && asker.textContent === `Спрашивает страница вида «${bridgeKindLabel(suiFrame.kind)}».` && !!(asker.compareDocumentPosition(cTitle) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      !document.getElementById("confirmMsg").contains(asker) && !msgT.includes("Спрашивает страница"), "строка «Спрашивает страница вида…» — над заголовком, вне текста страницы");
    ok(msgT.includes("Тревоги датчиков") && msgT.includes("<b>Камеры</b>") &&
      document.getElementById("confirmTitle").textContent === "Поставить на охрану" && document.getElementById("confirmOk").textContent === "Поставить" &&
      !!document.getElementById("confirmCountInp") && document.getElementById("confirmOk").disabled && !replyOf("cf1"),
      "в диалоге строка о странице вида, списки, заголовок и кнопка страницы, поле числа; ответа ещё нет");
    pageSend({ type: "confirm", id: "cf2", title: "Ещё", text: "Ещё" });
    ok(await until(() => !!replyOf("cf2"), 3000) && code(replyOf("cf2")) === "BUSY" && valid(replyOf("cf2")), "второй confirm, пока открыт первый, — BUSY");
    await confirmWith(2);
    ok(await until(() => !!replyOf("cf1"), 3000) && replyOf("cf1").ok === true && replyOf("cf1").status === 200 && replyOf("cf1").body?.confirmed === true && valid(replyOf("cf1")), "confirmWith(2) — confirmed: true");
    pageSend({ type: "confirm", id: "cf3", title: "Снять с охраны", text: "Снять?" });
    ok(await until(dlgOpen, 3000) && !document.getElementById("confirmCountInp"), "confirm без count — без поля числа");
    document.getElementById("confirmCancel").click();
    ok(await until(() => !!replyOf("cf3"), 3000) && replyOf("cf3").ok === true && replyOf("cf3").body?.confirmed === false, "отмена — confirmed: false");
    // Свой диалог consolem закрыл диалог страницы — confirmed: false
    pageSend({ type: "confirm", id: "cf4", title: "Вопрос", text: "Вопрос" });
    ok(await until(dlgOpen, 3000), "диалог c4 открыт");
    askConfirm("Свой вопрос", "Свой", "", "Да", () => {});
    ok(await until(() => !!replyOf("cf4"), 3000) && replyOf("cf4").body?.confirmed === false, "диалог страницы занял свой диалог consolem — confirmed: false");
    ok(!document.getElementById("confirmAsker") && document.getElementById("confirmTitle").textContent === "Свой вопрос", "в своём диалоге consolem строки о странице нет");
    // Волна 06, п. 1: открытый диалог consolem страница не подменяет — ни confirm, ни команда с подтверждением, ни удаление
    window.CONSOLEM_TRACE.length = 0;
    pageSend({ type: "confirm", id: "cf6", title: "Подмена", text: "Подмена" });
    const busyAct = await call("runUnitAction", { uid: VOL, action: "format" });
    const busyDel = await call("deleteUnit", { uid: S3 });
    ok(await until(() => !!replyOf("cf6"), 3000) && code(replyOf("cf6")) === "BUSY" && code(busyAct) === "BUSY" && code(busyDel) === "BUSY" &&
      [replyOf("cf6"), busyAct, busyDel].every(valid) && dlgOpen() && document.getElementById("confirmTitle").textContent === "Свой вопрос" &&
      !trace("POST", `/units/${VOL}/actions/`).length && !cardDiff().some((x) => x.bridge),
      "открыт диалог consolem — confirm, команда format и deleteUnit получают BUSY, диалог consolem цел");
    closeConfirm();
    // Волна 06, п. 3: после трёх отказов подряд вопросы страницы — BUSY на 10 с или до действия пользователя на странице
    const refuse = async (id) => {
      pageSend({ type: "confirm", id, title: "Вопрос " + id, text: "Вопрос" });
      if (!(await until(dlgOpen, 3000))) return null;
      document.getElementById("confirmCancel").click();
      await until(() => !!replyOf(id), 3000);
      return replyOf(id);
    };
    // Счёт отказов начинается заново, когда пользователь переходит на страницу (фокус уходит в рамку). Потом фокус
    // возвращается в consolem: иначе каждое blur окна снова снимало бы счёт
    const touchPage = async () => {
      suiFrame.el.focus();
      window.dispatchEvent(new Event("blur"));
      await sleep(50);
      suiFrame.el.blur();
      window.focus();
      await sleep(50);
    };
    await touchPage();
    const nos = [await refuse("cr1"), await refuse("cr2"), await refuse("cr3")];
    ok(nos.every((x) => x && x.ok && x.body.confirmed === false), "три отказа подряд — confirmed: false");
    pageSend({ type: "confirm", id: "cr4", title: "Четвёртый", text: "Вопрос" });
    ok(await until(() => !!replyOf("cr4"), 3000) && code(replyOf("cr4")) === "BUSY" && valid(replyOf("cr4")) && !dlgOpen(), "четвёртый вопрос после трёх отказов — BUSY без диалога");
    await touchPage();
    ok((await refuse("cr5"))?.body?.confirmed === false, "пользователь перешёл на страницу — вопрос снова открыт");
    await refuse("cr6"); await refuse("cr7");
    pageSend({ type: "confirm", id: "cr8", title: "Ещё", text: "Вопрос" });
    ok(await until(() => !!replyOf("cr8"), 3000) && code(replyOf("cr8")) === "BUSY", "снова три отказа — BUSY");
    await sleep(10100);
    ok((await refuse("cr9"))?.body?.confirmed === false, "через 10 с вопрос снова открыт");
    // Итоговая волна, I2: счёт отказов один на все диалоги рамки — подтверждение команды, удаление, переход с черновиком
    // и вопрос страницы. После трёх отказов подряд пауза одна: все четыре получают BUSY без диалога
    await touchPage();
    const refuseCall = async (op, params) => {
      const id = "t" + ++seq;
      pageSend({ type: "call", id, op, params });
      if (!(await until(dlgOpen, 5000))) return null;
      document.getElementById("confirmCancel").click();
      await until(() => !!replyOf(id), 5000);
      return replyOf(id);
    };
    const noAct = await refuseCall("runUnitAction", { uid: VOL, action: "format" });
    const noDel = await refuseCall("deleteUnit", { uid: S3 });
    pageSend({ type: "change", patch: { display_text: "Счёт" } });
    ok(await until(() => cardDiff().length > 0, 3000), "черновик не пуст: переход спросит пользователя");
    pageSend({ type: "navigate", id: "nm1", uid: cam });
    const navAsked = await until(dlgOpen, 5000);
    if (navAsked) document.getElementById("confirmCancel").click();
    ok(code(noAct) === "CANCELLED" && code(noDel) === "CANCELLED" && navAsked && await until(() => code(replyOf("nm1")) === "CANCELLED", 3000) && sel === SUI_UNIT,
      "отказы в трёх разных диалогах: команда, удаление, переход — CANCELLED");
    window.CONSOLEM_TRACE.length = 0;
    pageSend({ type: "confirm", id: "cm1", title: "После пауз", text: "Вопрос" });
    const muteAct = await call("runUnitAction", { uid: VOL, action: "format" });
    const muteDel = await call("deleteUnit", { uid: S3 });
    pageSend({ type: "navigate", id: "nm2", uid: cam });
    ok(await until(() => !!replyOf("cm1") && !!replyOf("nm2"), 5000) && [replyOf("cm1"), muteAct, muteDel, replyOf("nm2")].every((x) => code(x) === "BUSY" && x.status === 0 && valid(x)) &&
      !dlgOpen() && sel === SUI_UNIT && !trace("POST", `/units/${VOL}/actions/`).length && !cardDiff().some((x) => x.bridge),
      "после трёх отказов в разных диалогах — одна пауза: confirm, команда, удаление и переход получают BUSY без диалога — " +
      JSON.stringify([replyOf("cm1"), muteAct, muteDel, replyOf("nm2")].map(code)));
    cardReset();
    await touchPage();
    ok(!cardDiff().length && !(suiFrame.askMute > Date.now()), "черновик пуст, пользователь перешёл на страницу — пауза снята");
    // Один navigate в полёте: второй, пока первый ждёт ответа, — BUSY
    pageSend({ type: "change", patch: { display_text: "Полёт" } });
    ok(await until(() => cardDiff().length > 0, 3000), "черновик не пуст, переход спросит пользователя");
    pageSend({ type: "navigate", id: "nf1", uid: cam });
    ok(await until(dlgOpen, 5000), "первый переход ждёт ответа пользователя");
    pageSend({ type: "navigate", id: "nf2", uid: cam2 });
    ok(await until(() => !!replyOf("nf2"), 3000) && code(replyOf("nf2")) === "BUSY" && valid(replyOf("nf2")) && !replyOf("nf1"), "второй navigate в полёте — BUSY");
    document.getElementById("confirmCancel").click();
    ok(await until(() => code(replyOf("nf1")) === "CANCELLED", 3000) && sel === SUI_UNIT, "первый переход — CANCELLED");
    cardReset();
    ok(await until(() => !cardDiff().length, 3000), "черновик снова пуст");
    // Рамка закрылась при открытом confirm: диалог закрыт без ответа, подписки сняты
    pageSend({ type: "confirm", id: "cf5", title: "Вопрос", text: "Вопрос" });
    ok(await until(dlgOpen, 3000) && watchIds().includes(cam), "диалог c5 открыт, камера s3 в наблюдении");
    suiClose();
    await sleep(100);
    ok(!dlgOpen() && !replyOf("cf5") && bridgeSubs.size === 0 && !watchIds().includes(cam) && !bridgeConfirmOpen, "suiClose: диалог закрыт без ответа, подписок нет, камеры нет в watchIds()");
    gear();
    ok(await until(() => suiFrame?.ready, 15000), "рамка снова готова");

    // navigate
    pageSend({ type: "navigate", id: "n0", uid: "30009999-0000-4000-8000-000000000000" });
    ok(await until(() => !!replyOf("n0"), 5000) && code(replyOf("n0")) === "NOT_FOUND" && replyOf("n0").status === 0 && valid(replyOf("n0")), "navigate к объекту, которого нет, — NOT_FOUND");
    pageSend({ type: "navigate", id: "n00", uid: SUI_UNIT, tab: "gen" });
    ok(await until(() => !!replyOf("n00"), 5000) && replyOf("n00").ok === true && sel === SUI_UNIT && suiFrame?.ready, "navigate к своему объекту — ok, карточка та же");
    // Волна 06, п. 4: тот же объект и та же вкладка — место всё равно моргает
    ok(await until(() => document.querySelector(".hd .tabs .tab.on.acc-flash") && document.querySelector("#tree .n.on.acc-flash"), 3000), "navigate к своему объекту на ту же вкладку — вкладка и строка дерева моргают");
    // Своя вкладка другая: ответ уходит до того, как consolem сменит вкладку и закроет рамку
    const ownTab = tabsFor(find(SUI_UNIT).n).map(([t]) => t).find((t) => t !== "gen");
    if (ownTab) {
      pageSend({ type: "navigate", id: "n01", uid: SUI_UNIT, tab: ownTab });
      ok(await until(() => !!replyOf("n01"), 5000) && replyOf("n01").ok === true && tab === ownTab, `navigate к своему объекту на вкладку «${ownTab}» — ответ ok пришёл, вкладка сменилась`);
      pick(SUI_UNIT, { force: true, tab: "gen" });
      ok(await until(() => sel === SUI_UNIT && tab === "gen" && suiFrame?.ready, 15000), "снова вкладка страницы");
    } else ok(true, "у объекта страницы одна вкладка");
    pageSend({ type: "change", patch: { display_text: "Переход" } });
    ok(await until(() => cardDiff().length > 0, 3000), "черновик не пуст");
    pageSend({ type: "navigate", id: "n1", uid: cam });
    ok(await until(() => dlgOpen() && document.getElementById("confirmTitle").textContent.includes("Изменения не применены"), 5000) && !replyOf("n1"), "navigate с черновиком — диалог «Изменения не применены»");
    document.getElementById("confirmCancel").click();
    ok(await until(() => !!replyOf("n1"), 3000) && code(replyOf("n1")) === "CANCELLED" && sel === SUI_UNIT && cardDiff().length > 0, "«Остаться» — CANCELLED, карточка прежняя");
    cardReset();
    ok(await until(() => !cardDiff().length, 3000), "черновик пуст");
    await subscribe("s4", { entityIds: [cam2] });
    const f2 = suiFrame, navAt = sent.length;
    pageSend({ type: "navigate", id: "n2", uid: cam, tab: "acc" });
    ok(await until(() => sel === cam && tab === "acc", 5000), "navigate к камере на вкладку «Доступ»");
    // У карточки камеры нет h1: заголовок — последний шаг пути (.cr-cur). Моргают он, активная вкладка и строка дерева
    ok(await until(() => document.querySelector(".hd h1.acc-flash, .hd .cr-cur.acc-flash") && document.querySelector(".hd .tabs .tab.on.acc-flash") && document.querySelector("#tree .n.on.acc-flash"), 3000),
      "переход по ссылке из страницы моргает заголовком, вкладкой и строкой дерева");
    await sleep(100);
    ok(!sent.slice(navAt).some((m) => m.type === "result" && m.id === "n2") && suiFrame !== f2 && f2.bridgeOff === true && bridgeSubs.size === 0, "удачный переход — ответа нет, рамка закрыта, подписок нет");
    pick(SUI_UNIT, { force: true, tab: "gen" });
    ok(await until(() => sel === SUI_UNIT && suiFrame?.ready, 15000), "вернулись к странице стенда");


    // ── Задача 6: тестовая страница «сложного» экрана — полный цикл через саму страницу ──
    // Встроенный сервер страницы служебных операций /test/* не держит, поэтому набор не сбрасывается: прогоны идут
    // по тому, что оставили прошлые части сценария
    pick(SUI_UNIT, { force: true, tab: "gen" });
    ok(await until(() => sel === SUI_UNIT && suiFrame?.ready && !cardDiff().length, 15000), "страница стенда открыта, черновик пуст");
    // x-run — от окна рамки; хост его пропускает (SUI_ON его не знает)
    const xruns = [];
    onXRun = (e) => { const d = e.data; if (d && d.proto === "setup/1" && d.type === "x-run" && suiFrame && e.source === suiFrame.win) xruns.push(d); };
    window.addEventListener("message", onXRun);
    ok(!("x-run" in SUI_ON), "x-run вне протокола: у хоста нет обработчика");
    // Прогон: адрес рамки без # и #run=<имя>; шаги — до done. answer — ответ на диалог консоли, пока идёт прогон
    const run = async (name, answer) => {
      const at = xruns.length;
      const f = suiFrame;
      f.el.src = f.url.split("#")[0] + "#run=" + name;
      const mine = () => xruns.slice(at).filter((m) => m.run === name);
      // Первый шаг — за 5 с: страница без прогонов не тратит срок сценария
      const step = () => { if (answer && dlgOpen()) answer(); return mine().length > 0; };
      if (await until(step, 5000)) await until(() => step() && mine().some((m) => m.step === "done"), 40000);
      return mine();
    };
    const runOk = (name, steps) => ok(steps.length > 1 && steps.some((s) => s.step === "done") && steps.every((s) => s.ok),
      `тестовая страница, прогон ${name}: ${steps.filter((s) => !s.ok).map((s) => s.step + " " + (s.detail || "")).join(", ") || (steps.length ? "все шаги" : "шагов нет")}`);
    const stepOf = (steps, name) => steps.find((s) => s.step === name) || {};
    const yes = () => confirmWith(1);
    for (const name of ["read", "discovery"]) runOk(name, await run(name));
    // draft: «Добавить» и «Удалить» датчика — шаги черновика консоли, строки помечены
    const sentD = sent.length;
    const dsteps = await run("draft", yes);
    runOk("draft", dsteps);
    ok(cardDiff().filter((x) => x.bridge).length === 2 && sent.slice(sentD).some((m) => m.type === "draft" && (m.steps || []).length === 2),
      "после прогона draft в черновике консоли 2 шага страницы, странице ушёл draft со steps");
    cardPlan();
    ok(await until(() => document.getElementById("bmodal")?.classList.contains("open"), 5000), "план черновика открыт");
    closeBulkModal();
    window.CONSOLEM_TRACE.length = 0;
    const xAt = xruns.length;
    cardApply();
    ok(await until(() => trace("POST", "/operations").length >= 1, 5000) && trace("POST", "/operations").filter((t) => t.path === "/operations").length === 1, "«Применить» — одна POST /operations");
    const pApplied = () => xruns.slice(xAt).find((m) => m.run === "draft" && m.step === "applied");
    ok(await until(pApplied, 10000) && pApplied().ok, "страница получила applied.steps и показала итог: " + JSON.stringify(pApplied()));
    await until(() => !bq || bq.finished, 5000);
    // confirm: подтверждение страницы, затем команда ARM контроллера
    window.CONSOLEM_TRACE.length = 0;
    runOk("confirm", await run("confirm", yes));
    ok(trace("POST", `/units/${CTRL}/actions/ARM`).length === 1 && (await realRaw("GET", `/units/${CTRL}`)).body.status?.observed?.armed === true, "команда ARM ушла один раз, контроллер на охране");
    // navigate: щелчок по камере в блоке «Камеры» — переход со вспышкой
    const nsteps = await run("navigate");
    runOk("navigate", nsteps);
    const navTo = stepOf(nsteps, "navigate").detail;
    ok(await until(() => sel === navTo && cams.includes(navTo), 5000), "переход к первой камере контроллера: " + navTo);
    ok(await until(() => document.querySelector(".hd h1.acc-flash, .hd .cr-cur.acc-flash") && document.querySelector("#tree .n.on.acc-flash"), 3000), "переход из страницы моргает заголовком и строкой дерева");
    // nobridge: хост шага 1 (init.host без bridge) — блоки шага 2 скрыты, change шага 1 работает
    const realHost = suiHostInfo;
    suiHostInfo = () => { const h = realHost(); delete h.bridge; return h; };
    restoreHost = () => { suiHostInfo = realHost; };
    const sentN = sent.length;
    pick(SUI_UNIT, { force: true, tab: "gen" });
    suiRetry();
    ok(await until(() => sel === SUI_UNIT && suiFrame?.ready, 15000), "страница стенда на хосте шага 1 открыта");
    const initN = sent.slice(sentN).find((m) => m.type === "init");
    ok(!!initN && !("bridge" in initN.host) && valid(initN), "init.host без bridge");
    const bsteps = await run("nobridge");
    runOk("nobridge", bsteps);
    ok(await until(() => cardDiff().some((x) => !x.bridge), 3000) && !cardDiff().some((x) => x.bridge), "change шага 1 дошёл: строка правки страницы в черновике, шагов моста нет");
    cardReset();
    restoreHost();
    restoreHost = null;
    // Права: вход только с просмотром. У роли «Только просмотр» (elena) класса security_controller нет, и страница не
    // откроется вовсе (403). Стенд с testSupport: набор заново, роль получает view правкой набора на этот прогон (P17),
    // demo.json не меняется. Встроенный сервер страницы /test/reset не держит: тогда ответы сервера для elena —
    // перехватом (адрес страницы с readOnly, 403 команды с тем же Problem), как в tests/ui-access.js
    const roles = (await realRaw("GET", "/access")).body?.roles || [];
    const viewRole = roles.find((x) => x.id === "80000006-0000-4000-8000-000000000000");
    ok(!!viewRole && !viewRole.kindAccess?.security_controller, "роль «Только просмотр» без класса security_controller");
    const patched = roles.map((x) => (x === viewRole ? { ...x, kindAccess: { ...x.kindAccess, security_controller: "view" } } : x));
    const rs = await realRaw("POST", "/test/reset", { fixture: "demo", freezeClock: false, actAs: "elena", fixturePatch: { access: { roles: patched } } });
    const onStand = rs.status === 200;
    resetBack = onStand;
    let restoreDenied = null;
    if (!onStand) {
      const post0 = API.post, raw0 = API.raw;
      API.post = function (path, data, headers) {
        const r = post0.call(this, path, data, headers);
        return path === `/units/${SUI_UNIT}/setup-ui` ? r.then((x) => ({ ...x, readOnly: true })) : r;
      };
      API.raw = function (method, path, body, headers) {
        if (method === "POST" && path === `/units/${CTRL}/actions/ARM`) {
          bodies.push({ method, path, body });
          return Promise.resolve({ status: 403, headers: {}, body: { code: "PERMISSION_DENIED", message: "Команде ARM нужен уровень edit", params: { right: { class: "security_controller", level: "edit" } } } });
        }
        return raw0.call(this, method, path, body, headers);
      };
      restoreDenied = () => { API.post = post0; API.raw = raw0; };
      restoreHost = restoreDenied;
    }
    ok(onStand || rs.body?.code === "TEST_SUPPORT_OFF", "вход elena: " + (onStand ? "стенд, набор с view на security_controller" : "встроенный сервер, ответы для elena — перехватом"));
    const sentR = sent.length;
    suiRetry();
    pick(SUI_UNIT, { force: true, tab: "gen" });
    ok(await until(() => sel === SUI_UNIT && suiFrame?.ready && suiFrame.readOnly, 15000), "страница стенда открыта только для просмотра");
    const initR = sent.slice(sentR).filter((m) => m.type === "init").pop();
    ok(initR?.readOnly === true && !!initR.host.bridge && !Object.values(initR.host.bridge.ops).includes("draft") && initR.host.bridge.ops.runUnitAction === "act",
      "init.readOnly, в init.host.bridge.ops нет draft, команда есть");
    window.CONSOLEM_TRACE.length = 0;
    bodies.length = 0;
    const dn = await run("denied");
    runOk("denied", dn);
    const act = stepOf(dn, "act"), drf = stepOf(dn, "draft");
    ok(/status 403/.test(act.detail || "") && /PERMISSION_DENIED/.test(act.detail || "") && bodies.filter((x) => x.path === `/units/${CTRL}/actions/ARM`).length === 1,
      "runUnitAction — ответ сервера 403 PERMISSION_DENIED дошёл до страницы: " + act.detail);
    ok(/status 0/.test(drf.detail || "") && /PERMISSION_DENIED/.test(drf.detail || "") && !trace("POST", "/operations").length && !cardDiff().length,
      "createUnits — PERMISSION_DENIED моста со status 0, без запроса и без строки черновика: " + drf.detail);
    if (restoreDenied) { restoreDenied(); restoreHost = null; }
    if (onStand) {
      ok((await realRaw("POST", "/test/reset", { fixture: "demo", freezeClock: false })).status === 200, "набор demo с прежним входом");
      resetBack = false;
    }
    suiRetry();
    pick(SUI_UNIT, { force: true, tab: "gen" });
    ok(await until(() => sel === SUI_UNIT && suiFrame?.ready && !suiFrame.readOnly, 15000), "страница стенда снова с правом правки");

    // Все ответы — по схеме
    const results = sent.filter((m) => m.type === "result");
    const badRes = results.filter((m) => !valid(m));
    ok(!badRes.length, "все result по схеме (" + results.length + ") — " + JSON.stringify(badRes.slice(0, 1).map(errsOf)));
  } finally {
    if (restoreHost) restoreHost();
    if (onXRun) window.removeEventListener("message", onXRun);
    if (resetBack) await realRaw("POST", "/test/reset", { fixture: "demo", freezeClock: false });
    if (restorePost) restorePost();
    API.raw = realRaw;
    suiPost = realPost;
    gate = null;
    CAPS.operations = new Set(opsBackup);
    if (dlgOpen()) closeConfirm();
    window.CONSOLEM_TRACE = null;
  }
});
