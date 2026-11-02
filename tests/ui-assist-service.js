/* Сценарий интерфейса: служба ассистента демо-страницы (?assist=URL, метка consolem-assist). Служба подставная:
   fetch страницы отвечает за неё заготовленными ответами, настоящей модели здесь нет. Метка ставится на время
   сценария: в index.html её нет. На стенде (?api=, сборка консоли) служба не работает, и это тоже проверяется.
   Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until }) => {
  const SVC = "https://assist.example.test", CODE = "k0d-DOSTUPA";
  const params = new URLSearchParams(location.search);
  const onStand = !!(params.get("api") || pageMeta("consolem-api"));
  const calls = [];
  let answer = null;
  const realFetch = window.fetch;
  window.fetch = (url, init) => {
    if (!String(url).startsWith("https://assist.")) return realFetch(url, init);
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    return answer(init);
  };
  const enc = new TextEncoder();
  const sseLine = (e) => `data: ${JSON.stringify(e)}\n\n`;
  const sse = (...events) => () => Promise.resolve(new Response(events.map(sseLine).join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
  const refuse = (status, body, headers) => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json" }, headers || {}) }));
  // Поток, который стоит, пока его не оборвут
  let aborted = 0, feed = null, last = null;
  const hold = (...first) => (init) =>
    Promise.resolve(new Response(new ReadableStream({
      start(c) {
        feed = (e) => c.enqueue(enc.encode(sseLine(e)));
        last = (e) => { feed(e); c.close(); };
        first.forEach(feed);
        init.signal.addEventListener("abort", () => { aborted++; c.error(new DOMException("Aborted", "AbortError")); });
      },
    }), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
  const el = (id) => document.getElementById(id);
  const text = () => el("gopop").textContent;
  const mode = () => el("asstSvc")?.dataset.asstMode;
  const close = () => goClose();
  const lastCall = () => calls[calls.length - 1];
  const open = () => { close(); asstOpen(""); };
  // Ответ и уточнение — в поле под ответом, клавиатурой. Строка поиска — новая просьба, новый разговор
  const key = (e, k) => e.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const gq = el("gq"), typeQ = (t) => { gq.value = t; gq.dispatchEvent(new Event("input", { bubbles: true })); };
  const enter = () => key(gq, "Enter");
  const field = () => el("asstText");
  const say = (t) => { const f = field(); f.focus(); f.value = t; f.dispatchEvent(new Event("input", { bubbles: true })); key(f, "Enter"); };
  const press = (e) => ["mousedown", "mouseup", "click"].forEach((type) => e.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })));
  // По буквам, как клавиатура: keydown, значение, input, keyup
  const typeKeys = (e, t) => [...t].forEach((ch) => { key(e, ch); e.value += ch; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true })); });
  const typeCode = (v) => { const i = el("asstCode"); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); };
  const meta = document.createElement("meta");
  meta.name = "consolem-assist";
  meta.content = SVC + "/";
  const search = (q) => history.replaceState(null, "", location.pathname + q);
  const q0 = location.search;
  asstCodeDrop();

  // Без адреса — прежняя панель: поля кода нет, ответ заглушки, наружу ничего
  open();
  ok(!el("asstSvc") && !el("asstCode"), "без адреса панель прежняя, поля кода нет");
  say("выключи запись Главный вход");
  ok(await until(() => el("asstApply")), "без адреса отвечает заглушка");
  ok(!calls.length, "без адреса служба не вызывается");
  ok(!document.querySelector('meta[name="consolem-assist"]'), "в странице метки нет");
  ok(!!document.querySelector('meta[name="consolem-assist-public"]') && (location.hostname === "altumur.github.io" || !asstServiceUrl()), "метка демо-страницы действует только на её адресе");
  document.head.appendChild(meta);

  // Со стендом службы нет: только встроенный сервер
  if (onStand) {
    open();
    ok(asstMode(asst) === "off" && !el("asstCode"), "с бэкендом службы нет, поля кода нет");
    close();
    meta.remove();
    window.fetch = realFetch;
    return;
  }

  // Адрес есть: сразу служба, поля кода нет, заголовка нет
  open();
  ok(asstMode(asst) === "on" && !el("asstCode") && !el("asstCodeForget"), "адрес задан — служба, поля кода нет");
  ok(!el("asstSvc") && !/Отвечает модель/.test(text()), "отвечает модель — обычный случай, отдельной строки нет");
  answer = sse({ type: "progress", text: "читаю систему" }, { type: "question", text: "На какой камере?", context: "b1:открыта" });
  say("выключи запись");
  ok(await until(() => el("asstAsk")), "служба ответила без кода");
  ok(calls.length === 1 && !("X-Assist-Code" in calls[0].init.headers), "заголовка кода нет");

  // Службу закрыли: 401, поле кода, заглушка, выхода из системы нет
  open();
  answer = refuse(401, { code: "UNAUTHORIZED", message: "нужен код доступа" });
  say("выключи запись Главный вход");
  ok(await until(() => /Служба просит код доступа/.test(el("asstErr")?.textContent || "")), "401 — словами");
  ok(!apiLoggedOut && mode() === "nocode" && el("asstCode") && el("asstCode").type === "password", "после 401 поле кода, выхода нет");
  ok(/отвечает заглушка, не модель/.test(text()), "видно словами, кто отвечает");
  const n401 = calls.length;
  say("выключи запись Главный вход");
  ok(await until(() => el("asstApply")), "без кода — заглушка");
  ok(calls.length === n401, "служба больше не вызывается");
  calls.length = 0;

  // Код: Enter, память вкладки и sessionStorage, не localStorage, не адрес, не разметка
  open();
  el("asstCode").focus();
  typeCode(CODE);
  el("asstCode").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(mode() === "on" && !el("asstCode") && el("asstCodeForget"), "код принят");
  ok(/Отвечает модель/.test(text()), "видно, что отвечает модель");
  ok(!JSON.stringify(Object.assign({}, localStorage)).includes(CODE), "кода нет в localStorage");
  ok(!location.href.includes(CODE) && !el("gopop").innerHTML.includes(CODE), "кода нет в адресе и в разметке");
  ok((sessionStorage.getItem("consolem-assist-code") || "").includes(CODE), "код в sessionStorage");
  asstCodeNow = null;
  ok(asstMode(asst) === "on", "код читается из sessionStorage");

  // Ход: прямо в службу, с кодом и снимком, без куки. Ход ничего не пишет
  const camera = (await uiDevices()).find((d) => d.type === "camera" && d.name.includes("Главный вход"));
  const cam = await API.get(`/devices/${camera.id}`);
  answer = hold({ type: "progress", text: "в очереди: место 2" });
  say("выключи запись Главный вход");
  ok(await until(() => calls.length === 1), "запрос ушёл в службу");
  const call = calls[0], world = call.body.world;
  ok(call.url === SVC + "/assist/turns", "адрес хода: " + call.url);
  ok(call.init.headers["X-Assist-Code"] === CODE, "заголовок X-Assist-Code");
  ok(call.init.credentials === "omit", "куки не уходят");
  ok(!("secrets" in call.body) && call.body.kind === "auto" && !("context" in call.body) && call.body.text === "выключи запись Главный вход", "kind: auto, без secrets и context");
  ok(!call.url.includes(CODE) && !call.init.body.includes(CODE), "код только в заголовке");
  ok(await until(() => /в очереди: место 2/.test(el("asstLine")?.textContent || "")), "место в очереди показано");
  ok(el("asstSend")?.disabled && el("asstCancel"), "идёт ход: «Отправить» неактивна, отмена есть");
  // Клик мимо не снимает ход: панель скрыта, строки хода копятся, окно само не открывается, клик в строке показывает ход
  const abHide = aborted;
  press(el("tree"));
  ok(!el("gopop").classList.contains("open") && asst && asst.busy, "клик мимо скрыл панель, ход идёт");
  feed({ type: "progress", text: "читаю скрыто" });
  ok(await until(() => asst.line === "читаю скрыто"), "скрытый ход идёт дальше");
  ok(!el("gopop").classList.contains("open") && aborted === abHide, "окно само не открылось, запрос не оборван");
  press(gq);
  ok(el("gopop").classList.contains("asst") && /читаю скрыто/.test(el("asstLine")?.textContent || ""), "клик в строке поиска: идущий ход виден");
  // Курсор в строке поиска: строки хода и конец хода его не забирают, набранное на месте
  gq.focus();
  ok(document.activeElement === gq && gq.value === "", "курсор в пустой строке поиска");
  feed({ type: "progress", text: "читаю устройства" });
  ok(await until(() => /читаю устройства/.test(el("asstLine")?.textContent || "")), "строка хода сменилась");
  ok(document.activeElement === gq, "строка хода курсор из пустой строки поиска не забрала");
  last({ type: "plan", summary: "Камеры: 1", context: "b1:plan", items: [{ deviceId: cam.id, version: cam.version, set: { recordMode: "none" }, name: cam.name, changes: [{ field: "recordMode", before: cam.recordMode, after: "none", why: "просьба" }] }] });
  ok(await until(() => el("asstApply")), "план службы показан");
  ok(document.activeElement === gq && gq.value === "", "конец хода курсор из пустой строки поиска не забрал");
  typeKeys(gq, "камера");
  ok(document.activeElement === gq && gq.value === "камера" && el("asstApply"), "печать дальше: текст в строке, план на месте");
  typeQ("");
  gq.blur();
  ok(await until(() => !el("asstCancel")), "ход кончился, отмены нет");

  // Снимок: все ключи, полные записи, по контракту, паролей нет
  ok(["reference", "devices", "folders", "rules", "schedules", "modes", "maintenanceWindows", "me"].every((k) => k in world), "в снимке все ключи: " + Object.keys(world).join());
  ok(Object.keys(world).length === 11, "лишних ключей нет: " + Object.keys(world).join());
  ok(JSON.stringify(world.servers) === JSON.stringify((await API.get("/servers")).items), "серверы как в GET /servers");
  ok(JSON.stringify(world.licenses) === JSON.stringify((await API.get("/licenses")).items), "лицензии как в GET /licenses");
  // Роли — только id и name: для шагов ask, escalate
  const accRolesAll = (await API.get("/access")).roles;
  ok(world.roles.length === accRolesAll.length && world.roles.every((x, i) => x.id === accRolesAll[i].id && x.name === accRolesAll[i].name), "роли все, по порядку");
  ok(world.roles.every((x) => Object.keys(x).sort().join() === "id,name"), "у роли только id и name");
  ok(!/objectAccess|folderAccess/.test(JSON.stringify(world.roles)), "прав и объектов ролей нет");
  const rolesSize = JSON.stringify(world.roles).length;
  ok(rolesSize < 2048, `роли почти не весят: ${rolesSize} байт из ${call.init.body.length}`);
  let all = 0, cursor = null;
  do { const r = await API.get("/devices", { cursor, limit: 1000 }); all += r.items.length; cursor = r.nextCursor || null; } while (cursor);
  ok(world.devices.length === all && all > 100, "устройства целиком: " + world.devices.length);
  ok(JSON.stringify(world.devices.find((d) => d.id === cam.id)) === JSON.stringify(cam), "запись устройства полная, как GET /devices/{id}");
  ok(world.devices.some((d) => (d.folderIds || []).length), "состав папок — Device.folderIds");
  ok(world.devices.every((d) => typeof d.id === "string" && typeof d.type === "string" && typeof d.name === "string"), "у каждого устройства id, type, name: служба судит снимок по ним");
  ok(world.folders.length === (await API.get("/folders", { limit: 1000 })).items.length && world.rules.length === (await API.get("/rules")).items.length, "папки и правила целиком");
  ok(world.schedules.length && world.maintenanceWindows.length && world.modes.items && world.reference.capabilities && world.me.userId, "расписания, окна, режимы, справочник, сессия");
  ok(!/"password"\s*:/.test(call.init.body), "паролей в снимке нет");
  ok(call.init.body.length < 2 * 1024 * 1024, "снимок в пределе службы: " + call.init.body.length);
  ok(!ConsolemContract.requestProblems(window.CONSOLEM_OPENAPI, "POST", "/assist/turns", call.body).length, "тело по контракту: " + ConsolemContract.requestProblems(window.CONSOLEM_OPENAPI, "POST", "/assist/turns", call.body).slice(0, 2).join("; "));

  // «Применить» — за человеком: без него ничего не записано, запись — во встроенный сервер
  ok((await API.get(`/devices/${cam.id}`)).version === cam.version, "ход ничего не записал");
  el("asstApply").click();
  ok(await until(() => /применено/.test(text())), "итог по устройствам");
  const made = await API.get(`/devices/${cam.id}`);
  ok(made.recordMode === "none", "«Применить» записало во встроенный сервер");
  await API.patch(`/devices/${cam.id}`, { recordMode: cam.recordMode }, made.version);
  ok(calls.length === 1, "запись не ходит в службу");

  // Уточнить план через службу: тот же ход, context плана, снимок свежий, план снят и не возвращается
  open();
  answer = sse({ type: "plan", summary: "Камеры: 1", context: "b1:первый", items: [{ deviceId: cam.id, version: cam.version, set: { recordMode: "none" }, name: cam.name, changes: [{ field: "recordMode", before: cam.recordMode, after: "none", why: "просьба" }] }] });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstApply")), "план службы для уточнения");
  ok(field()?.placeholder === "Уточнить" && el("asstSend")?.textContent === "Уточнить", "под планом поле «Уточнить»");
  const nRef = calls.length;
  answer = hold({ type: "progress", text: "читаю систему" });
  say("и Запасной вход");
  ok(await until(() => calls.length === nRef + 1), "уточнение ушло");
  ok(calls[nRef].body.context === "b1:первый" && calls[nRef].body.world, "context плана и снимок");
  ok(!el("asstApply") && !asst.plan && el("asstCancel"), "пока идёт ход, «Применить» нет");
  ok(el("gopop").querySelector(".asst-said")?.textContent === "› и Запасной вход", "видна последняя просьба");
  last({ type: "plan", summary: "Камеры: 2", context: "b1:второй", items: [{ deviceId: cam.id, version: cam.version, set: { recordMode: "none" }, name: cam.name, changes: [{ field: "recordMode", before: cam.recordMode, after: "none", why: "уточнение" }] }] });
  ok(await until(() => el("asstApply") && /уточнение/.test(text())), "новый план целиком");
  answer = sse({ type: "question", text: "На какой камере?", context: "b1:вопрос2" });
  say("и ещё");
  ok(await until(() => el("asstAsk")), "уточнение кончилось вопросом");
  ok(!el("asstApply") && !asst.plan, "прежний план не вернулся");

  // context — как есть; вид хода — как в форме
  open();
  answer = sse({ type: "progress", text: "читаю систему" }, { type: "question", text: "На какой камере?", context: "b1:вопрос" });
  say("выключи запись");
  ok(await until(() => el("asstAsk")), "вопрос службы");
  answer = sse({ type: "refused", text: "Нельзя.", context: "b1:отказ", field: "netmask" });
  say("Главный вход");
  ok(await until(() => el("asstRefused")), "отказ службы");
  ok(calls[calls.length - 1].body.context === "b1:вопрос", "context возвращён как есть");
  close();
  goApp("rules");
  open();
  answer = sse({ type: "question", text: "Какое правило?", context: "c" });
  say("убери условие");
  ok(await until(() => el("asstAsk")), "ход о правилах");
  ok(calls[calls.length - 1].body.kind === "auto", "в разделе правил тип решает служба: kind auto");
  close();
  goApp("hw");

  // Типа хода форма не показывает и не выбирает: всегда auto. Лишнее поле kind в событиях (его шлёт мост Пилота)
  // форма молча пропускает
  open();
  answer = sse({ type: "progress", kind: "config", text: "читаю" }, { type: "progress", kind: "rules", text: "ещё" }, { type: "question", kind: "config", text: "На какой камере?", context: "b1:тип" });
  say("выключи запись");
  ok(await until(() => el("asstAsk")?.textContent === "На какой камере?"), "события с kind — обычный вопрос");
  ok(lastCall().body.kind === "auto" && !el("asstErr"), "kind: auto, ошибки нет");
  ok(!el("asstKind") && !el("gopop").querySelector("[data-asst-kind]") && !/Тип:/.test(text()), "строки «Тип» и выбора типа нет");
  answer = sse({ type: "question", text: "Какое правило?", context: "b1:дальше" });
  say("Охрана входа ночью");
  ok(await until(() => el("asstAsk")?.textContent === "Какое правило?"), "ответ ушёл, разговор идёт");
  ok(lastCall().body.kind === "auto" && lastCall().body.context === "b1:тип", "снова auto, context как есть");
  // Спорная просьба: вопрос без progress — обычный вопрос
  open();
  answer = sse({ type: "question", text: "Настроить или спросить?", context: "b1:спор" });
  say("камеры входа");
  ok(await until(() => el("asstAsk")?.textContent === "Настроить или спросить?"), "спорное: вопрос без progress показан");
  ok(!asst.busy && !el("asstErr"), "ход кончился, ошибки нет");

  // Вопрос о системе: answer — конец хода, поле на месте, разговор идёт с context, плана нет
  answer = sse({ type: "progress", kind: "explain", text: "смотрю систему" }, { type: "answer", text: "Серверов: 12.\nЛицензий хватает.", context: "b1:ответ" });
  say("сколько серверов");
  ok(await until(() => el("asstAnswer")), "ответ показан");
  ok(lastCall().body.kind === "auto" && lastCall().body.context === "b1:спор", "kind: auto, context спорного вопроса");
  ok(el("asstAnswer").textContent === "Серверов: 12.\nЛицензий хватает.", "текст ответа");
  ok(el("asstAnswerNote").textContent === "Ответ ассистента, проверьте по разделу", "подписан как ответ ассистента, а не данные системы");
  ok(asstEnds({ type: "answer" }) && !asstEnds({ type: "progress" }), "answer — конечное событие");
  ok(await until(() => !asst.busy), "ход кончился");
  ok(field() && el("asstSend")?.textContent === "Отправить" && !el("asstApply") && !asst.plan && !el("asstDecline"), "поле на месте, «Применить» нет");
  answer = sse({ type: "progress", kind: "explain", text: "смотрю" }, { type: "answer", text: "Нет, все в сети.", context: "b1:ответ2" });
  say("а офлайн есть?");
  ok(await until(() => /все в сети/.test(el("asstAnswer")?.textContent || "")), "разговор продолжился");
  ok(lastCall().body.context === "b1:ответ" && lastCall().body.kind === "auto", "с context прошлого ответа");
  ok(!/Серверов: 12/.test(el("asstAnswer").textContent), "прежний ответ снят");
  // Типа в событиях нет: лишний kind форма не читает, план показан как план
  answer = sse({ type: "progress", kind: "explain", text: "смотрю" }, { type: "plan", kind: "explain", summary: "Камеры: 1", context: "b1:п", items: [{ deviceId: cam.id, version: cam.version, set: { recordMode: "none" }, name: cam.name, changes: [{ field: "recordMode", before: cam.recordMode, after: "none", why: "просьба" }] }] });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstApply")), "kind в событиях форма пропускает: план показан");
  ok(!el("asstRefused") && !el("asstErr") && !/Тип:/.test(text()), "ни отказа, ни ошибки, ни строки типа");
  el("asstDecline").click();

  // Новая просьба из строки поиска посреди хода: идущий снят, разговор новый, без context
  open();
  answer = sse({ type: "question", text: "На какой камере?", context: "b1:прежний" });
  say("выключи запись");
  ok(await until(() => el("asstAsk")), "вопрос прежнего разговора");
  answer = hold({ type: "progress", text: "читаю" });
  const nAsk = calls.length;
  say("Главный вход");
  ok(await until(() => calls.length === nAsk + 1 && asst.busy && el("asstCancel")), "ход идёт");
  ok(lastCall().body.context === "b1:прежний", "ответ ушёл с context");
  const nBusy = calls.length, ab = aborted, was = asst;
  answer = sse({ type: "question", text: "Какое правило?", context: "b1:после" });
  typeQ("абырвалг посреди хода");
  ok(el("goAsk"), "ничего не найдено — кнопка ассистента");
  enter();
  ok(await until(() => calls.length === nBusy + 1 && aborted === ab + 1), "идущий снят, новый ушёл");
  ok(asst !== was && !("context" in lastCall().body) && lastCall().body.text === "абырвалг посреди хода" && lastCall().body.kind === "auto", "новый разговор: без context, auto");
  ok(await until(() => el("asstAsk")?.textContent === "Какое правило?" && !asst.busy), "новый ход кончился");
  ok(asst.said.length === 1 && gq.value === "", "в разговоре одна реплика, строка поиска очищена");

  // Заглушка: типа нет, kind как раньше — по разделу, службы нет
  const streamWas = API.stream, sent0 = [], nStub = calls.length;
  API.stream = (p, b, ...r) => { sent0.push(b); return streamWas(p, b, ...r); };
  open();
  asst.stub = true;
  say("выключи запись Главный вход");
  ok(await until(() => el("asstApply")), "заглушка ответила");
  ok(!("kind" in sent0[0]) && !/Тип:/.test(text()), "у заглушки нет ни auto, ни строки типа");
  close();
  goApp("rules");
  open();
  asst.stub = true;
  say("при движении на Главный вход спроси оператора");
  ok(await until(() => el("asstApply")), "заглушка в правилах");
  ok(sent0[1].kind === "rules", "в разделе правил — rules");
  close();
  goApp("hw");
  API.stream = streamWas;
  ok(calls.length === nStub, "служба не вызывалась");

  // Пароль наружу не уходит: ни полем, ни словами, ни ответом на вопрос
  const n0 = calls.length;
  open();
  ok(!/Секрет/.test(text()), "поля секрета при службе нет");
  asst.secrets = ["qwerty"];
  say("выключи запись Главный вход");
  ok(/в службу не ушла/.test(el("asstErr")?.textContent || "") && asst.secrets.length === 0, "заполненный секрет не отправлен, и это сказано");
  say("смени пароль Главный вход на qwerty");
  ok(/в службу не ушла/.test(el("asstErr")?.textContent || ""), "просьба о пароле не отправлена, и это сказано");
  ok(calls.length === n0, "наружу ничего не ушло");
  answer = sse({ type: "question", text: "Какой пароль поставить?", context: "b1:пароль" });
  say("настрой Главный вход");
  ok(await until(() => el("asstAsk")), "служба спросила пароль");
  say("qwerty");
  ok(/в службу не ушла/.test(el("asstErr")?.textContent || "") && calls.length === n0 + 1, "ответ на вопрос о пароле не отправлен");
  ok(!el("asstAsk") && asst.context === null && field().value === "" && asst.text === "", "разговор о пароле закончен, поле очищено");
  ok(!calls.some((c) => "secrets" in c.body || c.init.body.includes("qwerty")), "secrets нет ни в одном теле");
  let sent = null;
  await ConsolemApi.assistTurn(SVC, CODE, { text: "x", secrets: ["s"] }, () => {}, { ends: asstEnds }).catch(() => {});
  sent = calls[calls.length - 1].body;
  ok(!("secrets" in sent), "клиент службы secrets срезает сам");

  // Права читать нельзя: ключа нет, ход идёт как раньше
  const getBefore = API.get;
  API.get = (p, q) => (p === "/access" ? Promise.reject({ status: 403, problem: { code: "PERMISSION_DENIED" } }) : getBefore(p, q));
  open();
  answer = sse({ type: "question", text: "На какой камере?", context: "b1:нет-ролей" });
  say("выключи запись");
  ok(await until(() => el("asstAsk")), "ход без ролей прошёл");
  ok(!("roles" in calls[calls.length - 1].body.world), "403 — ключа roles нет");
  API.get = getBefore;
  // Серверов и лицензий читать нельзя: ключей нет, ход идёт
  const capsWas = ["listServers", "listLicenses"];
  capsWas.forEach((x) => CAPS.operations.delete(x));
  open();
  answer = sse({ type: "answer", text: "Этих данных нет.", context: "b1:нет" });
  say("сколько лицензий");
  ok(await until(() => el("asstAnswer")), "ход без серверов и лицензий прошёл");
  ok(!("servers" in calls[calls.length - 1].body.world) && !("licenses" in calls[calls.length - 1].body.world), "не объявлено — ключей нет");
  capsWas.forEach((x) => CAPS.operations.add(x));

  // План службы с ask, escalate, что бы она ни написала, заводится наблюдающим или выключенным
  const rulePlan = (name, steps, extra) => ({ type: "plan", summary: name, context: "b1:р", rules: [{ table: "scenarios", op: "create", body: Object.assign({ name, start: "manual", runMode: "manual", triggers: [], conditions: [], steps }, extra) }] });
  const roleId = world.roles.find((x) => x.name === "Охрана").id, mailStep = { source: "ntf", action: "email", to: "a@object.local", subject: "s", body: "b" };
  const ruleBy = async (plan) => {
    open();
    answer = sse(plan);
    say("заведи правило");
    ok(await until(() => el("asstApply")), "план службы: " + plan.summary);
    press(el("asstApply"));
    ok(await until(() => /заведено/.test(text())), "заведено: " + plan.summary);
    return (await API.get("/rules")).items.find((x) => x.name === plan.summary);
  };
  const askSteps = [{ control: "ask", text: "Да?", roleId, sec: 60, default: "no", yes: [mailStep], no: [] }];
  const escSteps = [mailStep, { control: "escalate", levels: [{ roleId, via: "client", waitMin: 5 }], stop: "ack" }];
  const ra = await ruleBy(rulePlan("Служба: вопрос", askSteps, { enabled: true, logOnly: false }));
  ok(ra.enabled && ra.logOnly && ra.steps[0].control === "ask", "ask с enabled, logOnly: false заведён наблюдающим");
  const re = await ruleBy(rulePlan("Служба: эскалация", escSteps, { enabled: true, logOnly: false }));
  ok(re.enabled && re.logOnly && re.steps[1].control === "escalate", "escalate заведён наблюдающим");
  const ro = await ruleBy(rulePlan("Служба: выключенный вопрос", askSteps, { enabled: false }));
  ok(!ro.enabled, "выключенным просили — выключен");
  ok(!(await API.get("/rule-prompts")).items.length, "вопросов нет");
  await API.post("/rules/update", { idempotencyKey: opKey(), items: [ra, re].map((x) => ({ ruleId: x.id, version: x.version, set: { enabled: false } })) });

  // kept в ответе групповой правки: строка «Принято, применится», это не отказ
  open();
  answer = sse({ type: "plan", summary: "Камеры: 1", context: "b1:k", items: [{ deviceId: cam.id, version: "x", set: { enabled: false }, name: cam.name, changes: [] }] });
  say("выключи камеру");
  ok(await until(() => el("asstApply")), "план для kept");
  const postBefore = API.post;
  API.post = (p, b) => (p === "/devices/update" ? Promise.resolve({ done: [], failed: [{ deviceId: cam.id, code: "SERVER_OFFLINE", params: { targetId: cam.id, kept: "k1" } }] }) : postBefore(p, b));
  press(el("asstApply"));
  ok(await until(() => /Принято, применится/.test(text())), "kept: «Принято, применится» строкой элемента");
  ok(el("gopop").querySelector('[data-asst-row="ok"]') && !el("gopop").querySelector('[data-asst-row="fail"]'), "kept — не отказ");
  API.post = postBefore;
  KEPT_WAIT.clear();

  // Отказы словами
  open();
  answer = refuse(429, { code: "BUSY", message: "Предел ходов в час с этого адреса исчерпан, повторите позже." }, { "Retry-After": "120" });
  say("выключи запись Главный вход");
  ok(await until(() => /через 2 мин/.test(el("asstErr")?.textContent || "")), "429: когда повторить");
  ok(mode() === "on", "429 код не сбрасывает");
  answer = refuse(429, { code: "BUSY", message: "x" }, { "Retry-After": "3720" });
  say("ещё раз");
  ok(await until(() => /через 1 ч 2 мин/.test(el("asstErr")?.textContent || "")), "429: часы");
  answer = refuse(429, { code: "BUSY", message: "Ассистент на сегодня исчерпал дневной предел, приходите завтра." });
  say("ещё раз");
  ok(await until(() => /приходите завтра/.test(el("asstErr")?.textContent || "")), "429 без заголовка: слово службы");
  answer = refuse(413, { code: "VALIDATION_FAILED", message: "тело больше 2 МБ" });
  say("ещё раз");
  ok(await until(() => /больше предела службы/.test(el("asstErr")?.textContent || "")), "413 словами");
  answer = refuse(422, { code: "VALIDATION_FAILED", message: "слишком длинно" });
  say("ещё раз");
  ok(await until(() => /слишком длинные/.test(el("asstErr")?.textContent || "")), "422 словами");
  answer = () => Promise.resolve(new Response("<html>413</html>", { status: 413 }));
  say("ещё раз");
  ok(await until(() => !asst.busy && /больше предела службы/.test(el("asstErr")?.textContent || "")), "отказ не JSON — те же слова");
  answer = sse({ type: "progress", text: "в очереди: место 5" }, { type: "error", code: "BUSY", message: "ассистент занят, повторите позже" });
  say("ещё раз");
  ok(await until(() => /ассистент занят/.test(el("asstErr")?.textContent || "")), "поток error BUSY: занято");
  ok(!/групповая операция/.test(text()) && !el("asstToStub"), "это не групповая операция и не обрыв");
  answer = sse({ type: "error", code: "BUSY" });
  say("ещё раз");
  ok(await until(() => /Ассистент занят/.test(el("asstErr")?.textContent || "")), "error BUSY без слов службы");

  // Нет соединения: служба недоступна, предложена заглушка
  answer = () => Promise.reject(new TypeError("Failed to fetch"));
  say("выключи запись Главный вход");
  ok(await until(() => el("asstToStub")), "нет соединения — предложена заглушка");
  ok(/Служба ассистента недоступна/.test(el("asstErr").textContent), "нет соединения — словами");
  const n1 = calls.length;
  el("asstToStub").click();
  ok(await until(() => el("asstApply")), "заглушка ответила на тот же вопрос");
  ok(calls.length === n1 && mode() === "stub" && /отвечает заглушка/.test(text()), "в службу не ходили, видно, кто отвечает");
  el("asstDecline").click();
  el("asstBack").click();
  ok(mode() === "on", "к службе можно вернуться");
  answer = sse({ type: "progress", text: "читаю систему" });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstToStub")), "поток без конца — обрыв");
  answer = sse({ type: "error", code: "UPSTREAM_UNAVAILABLE", message: "модель не отвечает" });
  say("ещё раз");
  ok(await until(() => !asst.busy && el("asstToStub")), "модель не отвечает — тоже предложена заглушка");

  // Отмена: кнопкой и закрытием окна
  open();
  answer = hold({ type: "progress", text: "читаю систему" });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstCancel") && /читаю систему/.test(el("asstLine")?.textContent || "")), "ход идёт");
  const a0 = aborted;
  el("asstCancel").click();
  ok(await until(() => aborted === a0 + 1 && !asst.busy), "«Отменить ход» обрывает запрос");
  ok(/Ход отменён/.test(text()) && !el("asstErr"), "отмена — не ошибка");
  say("выключи запись Главный вход");
  ok(await until(() => el("asstCancel") && /читаю систему/.test(el("asstLine")?.textContent || "")), "снова ход");
  close();
  ok(asst && asst.busy, "скрытое окно ход не снимает");
  ok(aborted === a0 + 1, "запрос не оборван");
  press(gq);
  ok(!el("asstNew"), "«Нового разговора» нет");
  const runAway = asst;
  answer = sse({ type: "question", text: "На какой камере?", context: "b1:новый" });
  typeQ("абырвалг новая просьба");
  press(el("goAsk"));
  ok(asst && asst !== runAway, "кнопка поиска мышью: новый разговор");
  ok(await until(() => aborted === a0 + 2), "новая просьба из строки поиска снимает идущий ход");
  ok(await until(() => el("asstAsk") && !asst.busy), "новый ход кончился");

  // Неверный код: 401 — не выход из системы, код сброшен, панель на заглушке
  const logged = apiLoggedOut;
  const toastSeen = () => /Сессия истекла/.test(el("tt")?.textContent || "");
  open();
  answer = refuse(401, { code: "UNAUTHORIZED", message: "нужен код доступа" });
  say("выключи запись Главный вход");
  ok(await until(() => /Неверный код доступа/.test(el("asstErr")?.textContent || "")), "401 — словами");
  ok(apiLoggedOut === logged && !logged && !toastSeen(), "401 службы не выход из системы");
  ok(!sessionStorage.getItem("consolem-assist-code") && mode() === "nocode" && el("asstCode"), "код сброшен, поле снова здесь");
  ok(!el("asstCodeForget"), "забывать нечего");
  const n2 = calls.length;
  say("выключи запись Главный вход");
  ok(await until(() => el("asstApply")), "дальше отвечает заглушка");
  ok(calls.length === n2, "без кода в службу не ходим");

  // Забыть код; нерабочий код; пустой код
  open();
  typeCode("");
  el("asstCodeSet").click();
  ok(mode() === "nocode", "пустой код не принят");
  typeCode("код");
  el("asstCodeSet").click();
  ok(mode() === "nocode", "код кириллицей не принят: заголовок его не понесёт");
  typeCode(CODE);
  el("asstCodeSet").click();
  ok(mode() === "on", "код кнопкой");
  answer = hold({ type: "progress", text: "читаю систему" });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstCancel") && /читаю систему/.test(el("asstLine")?.textContent || "")), "ход идёт");
  const n3 = aborted;
  el("asstCodeForget").click();
  ok(await until(() => aborted === n3 + 1 && !asst.busy), "«Забыть код» снимает ход");
  ok(mode() === "nocode" && !sessionStorage.getItem("consolem-assist-code") && asstCodeNow === null, "код забыт");

  // sessionStorage недоступен: код живёт в памяти вкладки
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = () => { throw new Error("запрещено"); };
  open();
  typeCode(CODE);
  el("asstCodeSet").click();
  Storage.prototype.setItem = setItem;
  ok(mode() === "on" && !sessionStorage.getItem("consolem-assist-code"), "без sessionStorage код в памяти");

  // Код привязан к адресу: чужая ссылка его не получит
  meta.content = "https://assist.other.test";
  open();
  ok(mode() === "nocode", "другой адрес — кода нет");
  meta.content = SVC;
  open();
  ok(mode() === "on", "свой адрес — код на месте");

  // ?assist=, неверный адрес, ?api=, набор не demo. Адрес страницы меняется на месте: читается при каждом ходе
  meta.remove();
  try {
    search(`?assist=${encodeURIComponent(SVC)}`);
    open();
    ok(mode() === "on", "?assist= задаёт адрес");
    search("?assist=javascript:alert(1)");
    open();
    ok(!el("asstSvc"), "адрес не http(s) не принят");
    search(`?assist=${encodeURIComponent(SVC)}&api=http://127.0.0.1:1`);
    ok(asstMode(null) === "off", "с ?api= службы нет");
    search(`?assist=${encodeURIComponent(SVC)}&fixture=large`);
    open();
    ok(mode() === "fixture" && !el("asstCode") && /только с демо-набором/.test(text()), "на fixture=large службы нет, это видно");
    const n4 = calls.length;
    say("выключи запись Главный вход");
    ok(await until(() => el("asstApply")), "на fixture=large отвечает заглушка");
    ok(calls.length === n4, "на fixture=large служба не вызывается");
  } finally {
    search(q0);
  }

  close();
  asstCodeDrop();
  asstCodeWanted = false;
  window.fetch = realFetch;
});
