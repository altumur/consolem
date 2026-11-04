/* Сценарий интерфейса: служба ассистента демо-страницы (?assist=URL, метка consolem-assist). Служба подставная:
   fetch страницы отвечает за неё заготовленными ответами, настоящей модели здесь нет. Мир службы — объекты и описания
   видов (AssistWorld: kinds, units), шаг плана — {uid, version, patch} (AssistPlanItem), отбор — фильтры GET /units. Метка ставится на время
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
  const text = () => el("asstDock").textContent;
  const mode = () => el("asstSvc")?.dataset.asstMode;
  const close = () => asstClose();
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
  // Панель рядом с деревом: поверх она закрылась бы на плане настройки
  asstVariantSet("side");
  asstCodeDrop();

  // Без адреса — прежняя панель: поля кода нет, ответ заглушки, наружу ничего
  open();
  ok(!el("asstSvc") && !el("asstCode"), "без адреса панель прежняя, поля кода нет");
  say("выключи запись Главный вход");
  ok(await until(() => el("asstPlanNote")), "без адреса отвечает заглушка");
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
  ok(await until(() => el("asstPlanNote")), "без кода — заглушка");
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
  ok(!location.href.includes(CODE) && !el("asstDock").innerHTML.includes(CODE), "кода нет в адресе и в разметке");
  ok((sessionStorage.getItem("consolem-assist-code") || "").includes(CODE), "код в sessionStorage");
  asstCodeNow = null;
  ok(asstMode(asst) === "on", "код читается из sessionStorage");

  // Ход: прямо в службу, с кодом и снимком, без куки. Ход ничего не пишет
  // Объекты — страницами GET /units, шаг плана — как PATCH /units/{uid}: patch и поле JSON Pointer
  const unitsAll = async (q) => { const out = []; let cursor = null; do { const r = await API.get("/units", Object.assign({ cursor, limit: 1000 }, q || {})); out.push(...r.items); cursor = r.nextCursor || null; } while (cursor); return out; };
  const planItem = (u, properties, why) => ({ uid: u.uid, version: u.version, patch: { properties }, name: u.name,
    changes: Object.entries(properties).map(([k, v]) => ({ field: `/properties/${k}`, before: u.properties[k], after: v, why: why || "просьба" })) });
  const camera = (await unitsAll({ kind: "camera" })).find((u) => u.name === "Главный вход");
  const cam = await API.get(`/units/${camera.uid}`);
  answer = hold({ type: "progress", text: "в очереди: место 2" });
  say("выключи запись Главный вход");
  ok(await until(() => calls.length === 1), "запрос ушёл в службу");
  const call = calls[0], world = call.body.world;
  ok(call.url === SVC + "/assist/turns", "адрес хода: " + call.url);
  ok(call.init.headers["X-Assist-Code"] === CODE, "заголовок X-Assist-Code");
  ok(call.init.credentials === "omit", "куки не уходят");
  ok(!("secrets" in call.body) && !("kind" in call.body) && !("context" in call.body) && call.body.text === "выключи запись Главный вход", "без kind, secrets и context");
  ok(!call.url.includes(CODE) && !call.init.body.includes(CODE), "код только в заголовке");
  ok(await until(() => /в очереди: место 2/.test(el("asstLine")?.textContent || "")), "место в очереди показано");
  ok(el("asstSend")?.disabled && el("asstCancel"), "идёт ход: «Отправить» неактивна, отмена есть");
  // Закрытие панели не снимает ход: панель скрыта, строки хода копятся, сама не открывается, кнопка в шапке показывает ход
  const abHide = aborted;
  const hidden = asst;
  asstClose();
  ok(el("asstDock").hidden && asst && asst.busy, "панель закрыта, ход идёт");
  feed({ type: "progress", text: "читаю скрыто" });
  ok(await until(() => asst.line === "читаю скрыто"), "скрытый ход идёт дальше");
  ok(el("asstDock").hidden && aborted === abHide, "панель сама не открылась, запрос не оборван");
  asstToggle();
  ok(asst === hidden && !el("asstDock").hidden && /читаю скрыто/.test(el("asstLine")?.textContent || ""), "кнопка в шапке: идущий ход виден");
  // Курсор в строке поиска: строки хода и конец хода его не забирают, набранное на месте
  gq.focus();
  ok(document.activeElement === gq && gq.value === "", "курсор в пустой строке поиска");
  feed({ type: "progress", text: "читаю устройства" });
  ok(await until(() => /читаю устройства/.test(el("asstLine")?.textContent || "")), "строка хода сменилась");
  ok(document.activeElement === gq, "строка хода курсор из пустой строки поиска не забрала");
  last({ type: "plan", summary: "Камеры: 1", context: "b1:plan", items: [planItem(cam, { recordMode: "none" })] });
  ok(await until(() => el("asstPlanNote")), "план службы показан");
  ok(document.activeElement === gq && gq.value === "", "конец хода курсор из пустой строки поиска не забрал");
  typeKeys(gq, "камера");
  ok(document.activeElement === gq && gq.value === "камера" && el("asstPlanNote"), "печать дальше: текст в строке, план на месте");
  typeQ("");
  gq.blur();
  ok(await until(() => !el("asstCancel")), "ход кончился, отмены нет");

  // Снимок: все ключи, полные записи, по контракту, паролей нет. Устройств, папок и серверов отдельно нет — это объекты
  ok(["reference", "kinds", "units", "rules", "schedules", "modes", "maintenanceWindows", "me"].every((k) => k in world), "в снимке все ключи: " + Object.keys(world).join());
  ok(Object.keys(world).length === 10 && !["devices", "folders", "servers"].some((k) => k in world), "лишних ключей нет: " + Object.keys(world).join());
  ok(JSON.stringify(world.kinds) === JSON.stringify((await API.get("/kinds")).items), "описания видов как в GET /kinds");
  ok(JSON.stringify(world.licenses) === JSON.stringify((await API.get("/licenses")).items), "лицензии как в GET /licenses");
  // Роли — только id и name: для шагов ask, escalate
  const accRolesAll = (await API.get("/access")).roles;
  ok(world.roles.length === accRolesAll.length && world.roles.every((x, i) => x.id === accRolesAll[i].id && x.name === accRolesAll[i].name), "роли все, по порядку");
  ok(world.roles.every((x) => Object.keys(x).sort().join() === "id,name"), "у роли только id и name");
  ok(!/objectAccess|folderAccess/.test(JSON.stringify(world.roles)), "прав и объектов ролей нет");
  const rolesSize = JSON.stringify(world.roles).length;
  ok(rolesSize < 2048, `роли почти не весят: ${rolesSize} байт из ${call.init.body.length}`);
  // Старый снимок (без units, kinds) не роняет сценарий: проверки ниже падают по одной
  const wu = world.units || [], wk = world.kinds || [];
  const all = (await unitsAll()).length;
  ok(wu.length === all && all > 100, "объекты целиком: " + wu.length);
  ok(JSON.stringify(wu.find((u) => u.uid === cam.uid)) === JSON.stringify(cam), "объект полный, как GET /units/{uid}");
  ok(wu.some((u) => (u.folders || []).length), "состав папок — Unit.folders");
  ok(wu.every((u) => typeof u.uid === "string" && typeof u.kind === "string" && typeof u.name === "string"), "у каждого объекта uid, kind, name: служба судит снимок по ним");
  ok(wu.filter((u) => u.kind === "folder").length === (await unitsAll({ kind: "folder" })).length && world.rules.length === (await API.get("/rules")).items.length, "папки и правила целиком");
  ok(wu.some((u) => u.kind === "security_controller/CONTROLLER") && wk.some((k) => k.kind === "security_controller/CONTROLLER"), "незнакомый вид — в снимке вместе с описанием");
  ok(world.schedules.length && world.maintenanceWindows.length && world.modes.items && world.reference.capabilities && world.me.userId, "расписания, окна, режимы, справочник, сессия");
  { const secret = new Map(wk.map((k) => [k.kind, Object.entries((k.schema || {}).properties || {}).filter(([, s]) => s && s.writeOnly).map(([n]) => n)]));
    ok(wu.every((u) => (secret.get(u.kind) || []).every((n) => !(n in (u.properties || {})))), "паролей в снимке нет: значений writeOnly у объектов нет"); }
  // В справочнике поле password есть у описания формата выгрузки («zip» — вид защиты): это не пароль, справочник обходим.
  // В остальном снимке нет ни одного непустого строкового поля, в имени которого есть «pass»
  const passFields = [], walkPass = (v, path) => { if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => { if (/pass/i.test(k) && typeof x === "string" && x) passFields.push(path + "." + k); walkPass(x, path + "." + k); }); };
  walkPass(Object.assign({}, world, { reference: null }), "world");
  ok(!passFields.length, "паролей в снимке нет: " + passFields.slice(0, 3).join(", "));
  ok(call.init.body.length < 2 * 1024 * 1024, "снимок в пределе службы: " + call.init.body.length);
  ok(!ConsolemContract.requestProblems(window.CONSOLEM_OPENAPI, "POST", "/assist/turns", call.body).length, "тело по контракту: " + ConsolemContract.requestProblems(window.CONSOLEM_OPENAPI, "POST", "/assist/turns", call.body).slice(0, 2).join("; "));

  // «Применить» — за человеком, черновиком групповой карточки: без него ничего не записано, запись — во встроенный сервер
  ok((await API.get(`/units/${cam.uid}`)).version === cam.version, "ход ничего не записал");
  ok(await until(() => bulkActive() && treeSel.has(cam.uid) && el("asstTag")), "план одной камеры — тоже групповая карточка, тег над деревом");
  ok(!el("asstApply"), "в панели «Применить» нет");
  const foot = el("bulkFoot"), showPlan = foot && [...foot.querySelectorAll("button")].find((b) => /Показать план|Применить/.test(b.textContent));
  press(showPlan);
  if (await until(() => el("bmodal")?.classList.contains("open"), 2000)) press([...document.querySelectorAll("#bmodal button")].find((b) => /^Применить/.test(b.textContent)));
  ok(await until(() => bq && bq.finished), "«Применить» в карточке мышью");
  let made = null;
  for (let i = 0; i < 200 && (made = await API.get(`/units/${cam.uid}`)).properties.recordMode !== "none"; i++) await new Promise((r) => setTimeout(r, 25));
  ok(made.properties.recordMode === "none", "«Применить» записало во встроенный сервер");
  await API.patch(`/units/${cam.uid}`, { properties: { recordMode: cam.properties.recordMode } }, made.version);
  ok(calls.length === 1, "запись не ходит в службу");

  // Уточнить план через службу: тот же ход, context плана, снимок свежий, план снят и не возвращается
  open();
  answer = sse({ type: "plan", summary: "Камеры: 1", context: "b1:первый", items: [planItem(cam, { recordMode: "none" })] });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstPlanNote")), "план службы для уточнения");
  ok(field()?.placeholder === "Уточнить" && el("asstSend")?.textContent === "Уточнить", "под планом поле «Уточнить»");
  const nRef = calls.length;
  answer = hold({ type: "progress", text: "читаю систему" });
  say("и Запасной вход");
  ok(await until(() => calls.length === nRef + 1), "уточнение ушло");
  ok(calls[nRef].body.context === "b1:первый" && calls[nRef].body.world, "context плана и снимок");
  ok(!el("asstPlanNote") && !asst.plan && el("asstCancel") && !bulkDraft.plan, "пока идёт ход, плана нет ни в панели, ни в черновике");
  ok([...el("asstBlock").querySelectorAll(".asst-u")].map((x) => x.textContent).join("|") === "выключи запись Главный вход|и Запасной вход", "история просьб, свежая последней");
  ok(el("asstLine")?.firstElementChild?.classList.contains("dev-spin"), "значок хода — в начале строки хода");
  last({ type: "plan", summary: "Камеры: 2", context: "b1:второй", items: [planItem(cam, { recordMode: "none" }, "уточнение")] });
  ok(await until(() => el("asstPlanNote") && /уточнение/.test(text()) && bulkDraft.plan), "новый план целиком, снова в черновике");
  ok(!document.querySelector("#asstBlock .dev-spin"), "ход кончился — значка хода нет");
  answer = sse({ type: "question", text: "На какой камере?", context: "b1:вопрос2" });
  say("и ещё");
  ok(await until(() => el("asstAsk")), "уточнение кончилось вопросом");
  ok(!el("asstPlanNote") && !asst.plan && !bulkDraft.plan, "прежний план не вернулся");

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
  ok(!("kind" in calls[calls.length - 1].body), "в разделе правил тип решает служба: поля kind нет");
  close();
  goApp("hw");

  // Типа хода форма не показывает и не выбирает: всегда auto. Лишнее поле kind в событиях (его шлёт мост Пилота)
  // форма молча пропускает
  open();
  answer = sse({ type: "progress", kind: "config", text: "читаю" }, { type: "progress", kind: "rules", text: "ещё" }, { type: "question", kind: "config", text: "На какой камере?", context: "b1:тип" });
  say("выключи запись");
  ok(await until(() => el("asstAsk")?.textContent === "На какой камере?"), "события с kind — обычный вопрос");
  ok(!("kind" in lastCall().body) && !el("asstErr"), "поля kind в запросе нет, ошибки нет");
  ok(!el("asstKind") && !el("gopop").querySelector("[data-asst-kind]") && !/Тип:/.test(text()), "строки «Тип» и выбора типа нет");
  answer = sse({ type: "question", text: "Какое правило?", context: "b1:дальше" });
  say("Охрана входа ночью");
  ok(await until(() => el("asstAsk")?.textContent === "Какое правило?"), "ответ ушёл, разговор идёт");
  ok(!("kind" in lastCall().body) && lastCall().body.context === "b1:тип", "снова без kind, context как есть");
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
  ok(!("kind" in lastCall().body) && lastCall().body.context === "b1:спор", "без kind, context спорного вопроса");
  ok(el("asstAnswer").textContent === "Серверов: 12.\nЛицензий хватает.", "текст ответа");
  ok(el("asstAnswerNote").textContent === "Ассистент · проверьте по разделу", "подписан как ответ ассистента, а не данные системы");
  ok(asstEnds({ type: "answer" }) && !asstEnds({ type: "progress" }), "answer — конечное событие");
  ok(await until(() => !asst.busy), "ход кончился");
  ok(field() && el("asstSend")?.textContent === "Отправить" && !el("asstApply") && !asst.plan && !el("asstDecline"), "поле на месте, «Применить» нет");
  answer = sse({ type: "progress", kind: "explain", text: "смотрю" }, { type: "answer", text: "Нет, все в сети.", context: "b1:ответ2" });
  say("а офлайн есть?");
  ok(await until(() => /все в сети/.test(el("asstAnswer")?.textContent || "")), "разговор продолжился");
  ok(lastCall().body.context === "b1:ответ" && !("kind" in lastCall().body), "с context прошлого ответа");
  ok(!/Серверов: 12/.test(el("asstAnswer").textContent), "прежний ответ снят");
  // Типа в событиях нет: лишний kind форма не читает, план показан как план
  answer = sse({ type: "progress", kind: "explain", text: "смотрю" }, { type: "plan", kind: "explain", summary: "Камеры: 1", context: "b1:п", items: [planItem(cam, { recordMode: "none" })] });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstPlanNote")), "kind в событиях форма пропускает: план показан");
  ok(!el("asstRefused") && !el("asstErr") && !/Тип:/.test(text()), "ни отказа, ни ошибки, ни строки типа");

  // Новая просьба из строки поиска посреди хода: идущий продолжается, разговор новый, без context
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
  ok(el("goAsk"), "ничего не найдено — строка ассистента");
  press(el("goAsk"));
  ok(await until(() => calls.length === nBusy + 1), "новый ушёл");
  ok(aborted === ab && was.busy, "идущий ход не снят");
  ok(asst !== was && !("context" in lastCall().body) && lastCall().body.text === "абырвалг посреди хода" && !("kind" in lastCall().body), "новый разговор: без context и kind");
  ok(await until(() => el("asstAsk")?.textContent === "Какое правило?" && !asst.busy), "новый ход кончился");
  ok(asst.log.filter((x) => x.u !== undefined).length === 1 && gq.value === "", "в разговоре одна реплика, строка поиска очищена");
  was.abort.abort();
  ok(await until(() => !was.busy && aborted === ab + 1), "прежний ход снят отдельно, он шёл сам по себе");

  // Заглушка: типа нет, kind как раньше — по разделу, службы нет
  const streamWas = API.stream, sent0 = [], nStub = calls.length;
  API.stream = (p, b, ...r) => { sent0.push(b); return streamWas(p, b, ...r); };
  open();
  asst.stub = true;
  say("выключи запись Главный вход");
  ok(await until(() => el("asstPlanNote")), "заглушка ответила");
  ok(!("kind" in sent0[0]) && !/Тип:/.test(text()), "у заглушки нет ни auto, ни строки типа");
  close();
  goApp("rules");
  open();
  asst.stub = true;
  say("при движении на Главный вход спроси оператора");
  ok(await until(() => el("asstApply")), "заглушка в правилах");
  ok(!("kind" in sent0[1]), "в разделе правил поля kind тоже нет");
  close();
  goApp("hw");
  API.stream = streamWas;
  ok(calls.length === nStub, "служба не вызывалась");

  // Отбор службы (found): ids с total и truncated; filter — форма листает GET /units сама; лишний kind пропущен
  ok(asstEnds({ type: "found" }), "found — конечное событие");
  goApp("hw");
  const tagT = () => el("asstTag")?.textContent || "";
  const camIds = (await unitsAll({ kind: "camera" })).map((u) => u.uid);
  open();
  answer = sse({ type: "progress", kind: "found", text: "отбираю" }, { type: "found", kind: "found", text: "Отобрано 700, показаны первые 5.", context: "b1:отбор", ids: camIds.slice(0, 5), total: 700, truncated: true, conditions: ["запись: нет"] });
  say("выведи камеры без записи");
  ok(await until(() => asst.found && asstPick?.src === asst.found && el("asstTag") && fs?.pick && fs.done), "отбор службы — тег над деревом");
  ok(tagT().startsWith("Ассистент: 5 из 700 · запись: нет"), "тег: 5 из 700 и условие — " + tagT());
  ok(/показаны первые 5 из 700/.test(el("filtHint")?.textContent || ""), "truncated словами: " + el("filtHint")?.textContent);
  ok(/В дереве: 5 из 700/.test(el("asstFoundCount")?.textContent || "") && !el("asstErr"), "в панели число, kind не мешает");
  answer = sse({ type: "found", text: "Уточнила.", context: "b1:отбор2", ids: camIds.slice(0, 2), total: 2, conditions: ["запись: нет", "производитель: Axis"] });
  say("а только Axis");
  ok(await until(() => tagT().startsWith("Ассистент: 2 · запись: нет · производитель: Axis")), "уточнение отбора: " + tagT());
  ok(lastCall().body.context === "b1:отбор", "разговор идёт с context отбора");
  // Форма filter: AssistFoundFilter — фильтры GET /units (kinds → kind через запятую, флаги — "true"), ограниченным проходом
  const gets = [], getWas = API.get;
  API.get = (p, q) => { if (p === "/units" && q && q.noRecord) gets.push(q); return getWas(p, q); };
  const noRecIds = (await unitsAll({ kind: "camera", noRecord: "true" })).map((u) => u.uid);
  answer = sse({ type: "found", text: "Камер без записи много: листаю фильтром.", context: "b1:фильтр", filter: { kinds: ["camera"], noRecord: true }, truncated: true, conditions: ["тип: камера", "запись: нет"] });
  say("выведи все камеры без записи");
  ok(await until(() => fs?.pick && fs.filter && fs.done), "форма filter: дерево листает сама");
  ok(gets.length && gets.every((q) => q.kind === "camera" && q.noRecord === "true" && !("ids" in q) && !("kinds" in q)), "запросы GET /units с фильтром отбора: " + JSON.stringify(gets[0]));
  ok(fs.hits.size === noRecIds.length && noRecIds.every((id) => fs.hits.has(id)), "отобраны камеры без записи: " + fs.hits.size);
  ok(tagT().startsWith(`Ассистент: ${noRecIds.length}`) && tagT().includes("тип: камера · запись: нет"), "тег формы filter: " + tagT());
  API.get = getWas;
  press(el("asstFoundPick"));
  ok(await until(() => treeSel.size === noRecIds.length), "«Выбрать всё» — загруженное отобранное: " + treeSel.size);
  setSelMode(false);
  answer = sse({ type: "found", text: "Ничего.", context: "b1:пусто", ids: [], total: 0, conditions: ["имя содержит: такого нет"] });
  say("покажи камеры с именем «такого нет»");
  ok(await until(() => tagT().startsWith("Ассистент: 0")) && el("asstFoundPick")?.disabled, "пустой отбор — тег с нулём, выбирать нечего");
  press(el("asstTag").querySelector("button"));
  ok(!asstPick && !el("asstTag"), "тег снят крестиком");
  // Незнакомый вид: отбор фильтром вида с командой из UnitKind.actions — дерево листает GET /units?kind=, команда названа
  // подписью вида; выполняет её человек из групповой карточки, ход ничего не выполняет
  const CTRL = "security_controller/CONTROLLER", ctrls = await unitsAll({ kind: CTRL });
  answer = sse({ type: "found", text: `Отобрано: ${ctrls.length}.`, context: "b1:охрана", filter: { kinds: [CTRL] }, action: "ARM", total: ctrls.length, conditions: ["тип: контроллер"] });
  say("поставь контроллеры на охрану");
  ok(await until(() => fs?.pick && fs.filter && fs.done), "отбор незнакомого вида фильтром");
  ok(fs.hits.size === ctrls.length && ctrls.every((u) => fs.hits.has(u.uid)), "отобраны контроллеры: " + fs.hits.size);
  ok(/Поставить на охрану/.test(text()), "команда отбора — подписью из описания вида: " + text().slice(0, 200));
  ok(JSON.stringify((await unitsAll({ kind: CTRL })).map((u) => u.version)) === JSON.stringify(ctrls.map((u) => u.version)), "команда не выполнена");
  press(el("asstTag").querySelector("button"));
  close();
  // План незнакомого вида: поле из его схемы — подписью x-label, значение — подписью x-enum-labels; объект отмечен
  const ctrl = ctrls.find((u) => u.properties.mode !== "manual");
  open();
  answer = sse({ type: "plan", summary: "Контроллер: 1", context: "b1:режим", items: [planItem(ctrl, { mode: "manual" })] });
  say("смени режим контроллера на manual");
  ok(await until(() => el("asstPlanNote") && treeSel.has(ctrl.uid)), "план незнакомого вида показан, объект отмечен");
  ok(/Режим/.test(text()) && /Ручной/.test(text()) && !text().includes("/properties/mode"), "поле и значение — подписями схемы, не указателем: " + text().slice(0, 200));
  ok((await API.get(`/units/${ctrl.uid}`)).version === ctrl.version, "ход ничего не записал");
  close();

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

  // План настройки с полем вне групповой карточки: поле названо словами, обхода нет
  open();
  answer = sse({ type: "plan", summary: "Камеры: 1", context: "b1:ip", items: [Object.assign(planItem(cam, { ip: "10.0.0.9", enabled: false }), { changes: [] })] });
  say("смени адрес камеры");
  ok(await until(() => el("asstPlanNote") && el("asstPlanLost")), "план с полем вне карточки");
  ok(/\bip\b/.test(el("asstPlanLost").textContent) && !el("asstPlanLost").textContent.includes("/properties/") && !bulkDraft.plan.ip && bulkDraft.plan.enabled?.[cam.uid] === "off", "ip назван кодом поля, как в базе, не указателем, и в черновик не лёг, «Включено» — лёг: " + el("asstPlanLost").textContent.slice(0, 120));
  ok(!el("asstApply"), "обхода карточки нет");
  // Разные значения по объектам: поле — «— разные —», раскладка плана под полем, каждому объекту уходит своё
  const twoCams = [];
  for (const u of (await unitsAll({ kind: "camera" })).filter((x) => x.properties.recordMode === "motion")) {
    const sv = srv(u.uid);
    if (sv && !hasNoSignal(sv) && u.properties.enabled !== false) twoCams.push(await API.get(`/units/${u.uid}`));
    if (twoCams.length === 2) break;
  }
  const [c1, c2] = twoCams;
  open();
  answer = sse({ type: "plan", summary: "Камеры: 2", context: "b1:разные", items: [
    planItem(c1, { recordMode: "none" }),
    planItem(c2, { recordMode: "always" })] });
  say("первой выключи запись, второй — всегда");
  ok(await until(() => el("asstPlanNote") && bulkActive() && treeSel.size === 2), "план двух камер: обе отмечены, карточка выборки");
  ok(tab === "rec" && /Архив и запись/.test(el("main")?.textContent || ""), "карточка открыта на вкладке «Архив»: план меняет режим записи");
  const recB = document.querySelector('[data-bk="rec"]');
  ok(recB && recB.querySelector("select").value === "" && recB.querySelector("select option:checked")?.textContent === "— разные —" && recB.classList.contains("bk-set"), "поле «Режим» — «— разные —», подсвечено");
  ok(/по плану ассистента: Нет ×1 · Всегда ×1|по плану ассистента: Всегда ×1 · Нет ×1/.test(recB.textContent), "под полем значения плана: " + recB.textContent.slice(0, 200));
  const chs = bulkChanges().filter((c) => c.key === "rec");
  ok(chs.length === 2 && chs.every((c) => c.ops.length === 1), "в плане карточки — шаг на значение, у каждой камеры своё");
  const foot2 = el("bulkFoot");
  press([...foot2.querySelectorAll("button")].find((b) => /Показать план/.test(b.textContent)));
  ok(await until(() => el("bmodal")?.classList.contains("open")), "окно плана: было → станет");
  ok(/Режим записи «Нет»/.test(el("bmodal").textContent) && /Режим записи «Всегда»/.test(el("bmodal").textContent), "оба шага в плане");
  press([...document.querySelectorAll("#bmodal button")].find((b) => /^Применить/.test(b.textContent)));
  ok(await until(() => bq && bq.finished), "применено одной операцией");
  let r1 = null, r2 = null;
  const rec = (u) => u.properties.recordMode;
  for (let i = 0; i < 200; i++) { r1 = await API.get(`/units/${c1.uid}`); r2 = await API.get(`/units/${c2.uid}`); if (rec(r1) === "none" && rec(r2) === "always") break; await new Promise((r) => setTimeout(r, 25)); }
  ok(rec(r1) === "none" && rec(r2) === "always", "каждой камере — её значение плана: " + rec(r1) + ", " + rec(r2));
  await API.patch(`/units/${c1.uid}`, { properties: { recordMode: "motion" } }, r1.version);
  await API.patch(`/units/${c2.uid}`, { properties: { recordMode: "motion" } }, r2.version);

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
  ok(await until(() => el("asstPlanNote")), "заглушка ответила на тот же вопрос");
  ok(calls.length === n1 && mode() === "stub" && /отвечает заглушка/.test(text()), "в службу не ходили, видно, кто отвечает");
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
  const runAway = asst;
  close();
  ok(asst && asst.busy, "скрытая панель ход не снимает");
  ok(aborted === a0 + 1, "запрос не оборван");
  // Кнопка открывает сначала разговор с готовым ответом, потому к идущему переходим из списка
  asstToggle();
  asstSwitch(runAway.id);
  ok(!el("asstDock").hidden && asst === runAway && runAway.busy, "панель открыта на идущем разговоре");
  answer = sse({ type: "question", text: "На какой камере?", context: "b1:новый" });
  typeQ("абырвалг новая просьба");
  press(el("goAsk"));
  ok(asst && asst !== runAway, "строка поиска мышью: новый разговор");
  ok(await until(() => el("asstAsk") && !asst.busy), "новый ход кончился");
  ok(aborted === a0 + 1 && runAway.busy, "новая просьба из строки поиска идущий ход не снимает");
  runAway.abort.abort();
  ok(await until(() => !runAway.busy && aborted === a0 + 2), "прежний ход снят отдельно");

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
  ok(await until(() => el("asstPlanNote")), "дальше отвечает заглушка");
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
    ok(await until(() => el("asstPlanNote")), "на fixture=large отвечает заглушка");
    ok(calls.length === n4, "на fixture=large служба не вызывается");
  } finally {
    search(q0);
  }

  close();
  asstCodeDrop();
  asstCodeWanted = false;
  window.fetch = realFetch;
});
