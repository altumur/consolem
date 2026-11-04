/* Прототип 22: чат ассистента в своей панели. Запуск:
   python tools/check_ui.py --page index_22_chat-assistenta.html tests/proto-22-chat.js
   В общий набор (tests/ui-*.js) сценарий войдёт при переносе в index.html: тогда же переписать ui-assist*.js. */
UiCheck(async ({ ok, until }) => {
  const el = (id) => document.getElementById(id);
  const btn = () => el("hdAsst");
  const dock = () => el("asstDock");
  const store = () => localStorage.getItem(ASST_STORE) || "";
  const say = (t) => { asst.text = t; asstSendText(); };
  // Ход держим открытым: так видно, что он переживает закрытие панели и другой разговор
  const realStream = API.stream;
  let gates = [];
  const hold = () => { API.stream = function (...args) { return new Promise((r) => gates.push(r)).then(() => realStream.apply(API, args)); }; };
  const free = () => { API.stream = realStream; gates.splice(0).forEach((r) => r()); };
  localStorage.removeItem(ASST_STORE);
  localStorage.removeItem(ASST_VAR_KEY);
  localStorage.removeItem(ASST_W_KEY);
  goApp("hw");

  // Кнопка всегда на месте, панель закрыта
  ok(btn() && btn().textContent.trim() === "Ассистент", "кнопка «Ассистент» в шапке");
  ok(dock().hidden, "панель закрыта");
  ok(!document.querySelector("#gopop #asstBlock"), "разговора нет в окне поиска");

  // Enter в поиске остаётся поиском, ассистенту запрос уходит только явным выбором
  const inp = el("gq");
  inp.focus();
  inp.value = "камера";
  goInput(inp.value);
  const askRow = el("goAsk");
  ok(askRow && askRow === document.querySelector("#goList .gores"), "строка ассистента — первая в списке");
  ok(/Спросить ассистента/.test(askRow.textContent) && /камера/.test(askRow.textContent), "строка говорит, что случится и с каким текстом");
  goKey({ key: "Enter", target: inp, preventDefault() {} });
  ok(asstChats.length === 0 && dock().hidden, "Enter не начинает разговор");
  ok(treeQ === "камера", "Enter оставил фильтр дерева");

  // Выбор строки: новый разговор, запрос поиска снят
  inp.value = "сколько камер";
  goInput(inp.value);
  hold();
  goPick(0);
  ok(asstChats.length === 1 && !dock().hidden, "выбор строки открыл панель с разговором");
  ok(inp.value === "" && treeQ === "", "запрос поиска снят");
  ok(el("asstBlock").textContent.includes("сколько камер"), "просьба в ленте");
  ok(btn().classList.contains("run") && /Отвечает/.test(btn().textContent), "кнопка: отвечает");

  // Закрытие не снимает ход, о готовности говорит кнопка
  const first = asst;
  asstClose();
  ok(dock().hidden && first.busy && !first.abort.signal.aborted, "закрытие не снимает ход");
  free();
  ok(await until(() => !first.busy), "ход закончился при закрытой панели");
  ok(first.answer && first.unread, "ответ получен и ждёт человека");
  ok(btn().classList.contains("ready") && /Готов ответ/.test(btn().textContent), "кнопка: готов ответ");
  ok(/Готов ответ/.test(el("asstLive").textContent) && el("asstLive").getAttribute("role") === "status", "статус для экранного диктора");
  ok(document.activeElement !== el("asstText"), "ответ не забирает фокус");
  asstToggle();
  ok(!dock().hidden && asst === first && !first.unread, "кнопка открывает готовый ответ");
  ok(el("asstAnswer")?.textContent === first.answer, "ответ виден");
  ok(btn().textContent.trim() === "Ассистент", "прочитано: кнопка в покое");

  // История: прежний ответ не пропадает при новом ходе
  const answer1 = first.answer;
  say("а серверов сколько");
  ok(await until(() => !first.busy), "второй ход закончился");
  const thread = el("asstBlock").textContent;
  ok(thread.includes(answer1) && thread.includes("сколько камер") && thread.includes("а серверов сколько"), "лента хранит все реплики и прежний ответ");

  // Новый разговор при идущем ходе: прежний продолжается и остаётся в истории
  hold();
  say("долгий вопрос");
  ok(first.busy, "ход первого разговора идёт");
  asstNewPress();
  const second = asst;
  ok(second !== first && asstChats.includes(first) && first.busy && !first.abort.signal.aborted, "новый разговор не снимает прежний");
  say("второй разговор");
  asstHistToggle();
  const rows = () => [...el("asstBlock").querySelectorAll(".asst-hrow")];
  ok(rows().length === 2 && el("asstFoot").hidden, "список разговоров из двух строк");
  ok(rows().every((r) => /отвечает/.test(r.textContent)), "в списке видно, что оба идут");
  free();
  ok(await until(() => !first.busy && !second.busy), "оба хода закончились");
  ok(rows().some((r) => /готов ответ/.test(r.textContent)), "в списке видно готовый ответ");
  ok(second.unread, "ответ при открытом списке не считается прочитанным");
  asstSwitch(first.id);
  ok(asst === first && el("asstBlock").textContent.includes("долгий вопрос"), "переход к прежнему разговору");

  // Сохранение: пароль и его контекст не пишутся
  asstOpen("");
  const secretChat = asst;
  secretChat.secrets = ["S3cret-value"];
  say("задай пароль Qwerty123 на камере");
  ok(await until(() => !secretChat.busy), "ход с секретом закончился");
  const saved = store();
  ok(saved && !saved.includes("S3cret-value") && !saved.includes("Qwerty123"), "пароль не сохранён");
  ok(JSON.parse(saved).find((c) => c.id === secretChat.id).context === null, "контекст такого разговора не сохранён");
  ok(JSON.parse(saved).find((c) => c.id === first.id).log.length >= 4, "обычный разговор сохранён");

  // Панель вопросов лежит под панелью ассистента: на экране одна из двух, разговор на месте
  const chatNow = asst;
  ok(asstDockOpen, "панель ассистента открыта");
  promptPanel(true);
  ok(PROMPT.open && dock().hidden && asst === chatNow, "вопросы открылись — ассистент скрыт, разговор на месте");
  asstToggle();
  ok(!PROMPT.open && !dock().hidden, "кнопка вернула ассистента, вопросы закрыты");
  promptPanel(true);
  asstOpen("");
  ok(!PROMPT.open && !dock().hidden, "новый разговор закрыл вопросы");

  // Разговор о пароле: значение не сохраняется ни в одной реплике, ни после перезагрузки
  const savedOf = (a) => JSON.parse(store()).find((c) => c.id === a.id);
  asstOpen("");
  const talk = asst;
  say("поставь Abcde777 на камеру");
  ok(await until(() => !talk.busy), "первая реплика без слова «пароль»");
  ok(store().includes("Abcde777"), "пока о пароле речи нет, реплика в истории");
  say("это пароль");
  ok(await until(() => !talk.busy), "вторая реплика о пароле");
  say("Zxcvb999");
  ok(await until(() => !talk.busy), "следующая реплика того же разговора");
  ok(!/Abcde777|Zxcvb999/.test(store()), "ни прежняя, ни следующая реплика не сохранены");
  ok(savedOf(talk).noStore && savedOf(talk).title !== talk.title && savedOf(talk).context === null, "заголовка и контекста нет, признак сохранён");
  asstOpen("");
  const asked = asst;
  say("сколько камер");
  ok(await until(() => !asked.busy), "ход перед вопросом");
  asked.ask = "Какой пароль задать?";
  asstSave();
  ok(savedOf(asked).noStore, "вопрос о пароле: разговор не сохраняется");
  asked.ask = "";

  // Вопрос ассистента переживает перезагрузку и остаётся вопросом
  asstOpen("");
  const q = asst;
  say("сколько камер");
  ok(await until(() => !q.busy), "ход перед обычным вопросом");
  q.ask = "На какой камере?";
  q.answer = "";
  q.context = "stub:вопрос";
  q.ctxLive = false;
  q.unread = true;
  asstSave();
  const keepChats = asstChats, keepAsst = asst;
  asstChats = [];
  asstLoad();
  const restored = asstChats.find((c) => c.id === q.id);
  ok(restored.ask === "На какой камере?" && !restored.log.some((x) => x.k === "ask"), "вопрос восстановлен один раз");
  ok(asstState(restored)[0] === "wait", "кнопка: ждёт ответа");
  asstChats = keepChats;
  asst = keepAsst;
  q.ask = "";
  q.unread = false;

  // Контекст заглушки службе не уходит
  const realMode = window.asstMode, realTurn = window.asstServiceTurn;
  let sent = null;
  window.asstMode = () => "on";
  window.asstServiceTurn = (a, body) => { sent = body; return Promise.resolve(); };
  say("Главный вход");
  ok(sent && !("context" in sent), "контекст другого режима не ушёл");
  window.asstMode = realMode;
  window.asstServiceTurn = realTurn;
  ok(await until(() => !q.busy), "ход закончился");

  // Ход другого разговора не уводит курсор и не трогает дерево
  asstOpen("");
  const focused = asst;
  asstSecretAdd();
  const secretInput = document.querySelector("#asstActs input[type=password]");
  secretInput.focus();
  asstEvent(first, { type: "progress", text: "читаю" });
  ok(document.activeElement === secretInput, "строка хода другого разговора оставила курсор в поле секрета");
  focused.secrets = [];
  asstRender();
  document.activeElement.blur();
  asstEvent(first, { type: "progress", text: "читаю" });
  ok(document.activeElement === document.body, "пустой фокус панель не забирает");
  first.line = "";

  // Открытый список разговоров: ответ не считается увиденным, дерево не трогаем
  asstOpen("");
  const listed = asst;
  asstHistToggle();
  asstEvent(listed, { type: "found", text: "отбор", ids: [], total: 0, conditions: [] });
  ok(listed.found && !asstPick, "при открытом списке отбор не ушёл в дерево");
  ok(document.getElementById("asstHistBtn"), "кнопка списка на месте");
  document.getElementById("asstHistBtn").focus();
  asstRender();
  ok(document.activeElement.id === "asstHistBtn", "фокус не теряется");
  asstHistToggle();

  // Что снято с экрана, остаётся в ленте
  asstOpen("");
  const held = asst;
  say("сколько камер");
  ok(await until(() => !held.busy && held.answer), "ответ получен");
  const heldAnswer = held.answer;
  asstHoldSecret(held);
  ok(el("asstBlock").textContent.includes(heldAnswer) && held.err, "отказ в пароле не стёр прежний ответ");
  held.err = "";
  held.answer = "прежний ответ";
  asstModeChanged(held);
  asstRender();
  ok(el("asstBlock").textContent.includes("прежний ответ"), "смена режима не стёрла ответ");

  // Стрелки на краю панели не ведут по дереву
  let reached = 0;
  const count = () => { reached += 1; };
  document.addEventListener("keydown", count);
  el("asstGrip").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
  document.removeEventListener("keydown", count);
  ok(reached === 0, "стрелка осталась на краю панели");
  asstWidthSet(400, true);

  // Щелчок по тексту панели оставляет фокус в ней: Esc закрывает панель, а не выбор в дереве
  ok(dock().tabIndex === -1, "панель принимает фокус при щелчке");
  dock().focus();
  ok(!!document.activeElement.closest("#asstDock"), "фокус в панели");

  // Плашка черновика детектора не закрывает кнопку панели
  const bar = document.createElement("div");
  bar.className = "dc-dock";
  document.body.append(bar);
  asstVariantSet("side");
  if (innerWidth > 860) ok(parseFloat(getComputedStyle(bar).right) >= asstWidth, "плашка левее панели");
  ok(+getComputedStyle(dock()).zIndex > +getComputedStyle(bar).zIndex, "панель над плашкой");
  bar.remove();

  // Положение и ширина
  const oldW = asstWidth;
  asstVariantSet("side");
  ok(dock().dataset.variant === "side" && el("ws").classList.contains("asst-side"), "«Рядом» сужает рабочую область");
  asstVariantSet("over");
  ok(dock().dataset.variant === "over" && !el("ws").classList.contains("asst-side"), "«Поверх» не сужает");
  asstVariantSet("auto");
  const room = el("ws").getBoundingClientRect().right - el("main").getBoundingClientRect().left;
  ok(asstPos() === (innerWidth > 860 && room - asstWidth >= ASST_FORM_MIN ? "side" : "over"), "«Авто» считает место под форму");
  asstWidthSet(100, false);
  ok(asstWidth === ASST_W_MIN, "ширина не меньше предела");
  asstWidthSet(5000, false);
  ok(asstWidth <= ASST_W_MAX, "ширина не больше предела");
  asstWidthSet(oldW, false);

  // Панель закрыта: отбор не меняет дерево под руками
  asstOpen("");
  const fChat = asst;
  asstClose();
  const fakeFound = { type: "found", text: "отбор", ids: [], total: 0, conditions: [] };
  asstEvent(fChat, fakeFound);
  ok(fChat.found === fakeFound && !asstPick, "закрытая панель: дерево не тронуто");

  // Поверх: план настройки закрывает панель, чтобы показать карточку
  asstVariantSet("over");
  asstOpen("");
  const pChat = asst;
  say("выключи запись Главный вход");
  ok(await until(() => !pChat.busy && pChat.plan?.items), "план настройки пришёл");
  ok(!asstDockOpen, "панель поверх закрылась");
  ok(treeSel.size > 0, "объекты плана отмечены");
  ok(btn().classList.contains("wait") && /Ждёт ответа/.test(btn().textContent), "кнопка: ждёт ответа");
  ok(bulkDraft.planOf === pChat.plan, "черновик карточки из плана");
  asstPickClear();
  treeSel.clear();
  bulkDraft = {};
  asstVariantSet("auto");

  // Переход к другому разговору, пока отбор грузится: план всё равно приходит в карточку
  asstVariantSet("side");
  asstOpen("");
  const swA = asst;
  say("выключи запись Главный вход");
  ok(await until(() => swA.plan?.items), "план для перехода пришёл");
  asstOpen("");
  ok(await until(() => bulkDraft.planOf === swA.plan), "другой разговор не помешал плану дойти до карточки");
  asstPickClear();
  treeSel.clear();
  bulkDraft = {};

  // План пришёл без взгляда на панель: заметки «отмечены» нет, есть «Открыть в дереве»
  asstSwitch(swA.id);
  ok(!el("asstPlanNote") && el("asstPlanOpen"), "план не в дереве: заметки нет, кнопка есть");
  // Правки человека план сам не заменяет
  bulkDraft = { pre: "7" };
  asstOpen("");
  const edited = asst;
  say("выключи запись Главный вход");
  ok(await until(() => !edited.busy && edited.plan?.items), "план при правках в карточке");
  ok(bulkDraft.pre === "7" && !bulkDraft.planOf && !asstPick, "правки человека на месте, дерево не тронуто");
  ok(!el("asstPlanNote") && el("asstPlanOpen"), "план ждёт кнопку");
  asstPlanOpen();
  ok(el("confirm").classList.contains("open") && bulkDraft.pre === "7", "кнопка спрашивает о замене");
  closeConfirm();
  bulkDraft = {};
  asstVariantSet("auto");

  // Итог правил при закрытой панели виден на кнопке и в истории
  asstVariantSet("side");
  asstOpen("");
  const rulesChat = asst;
  say("при движении на Запасной вход пиши 5 минут");
  ok(await until(() => el("asstApply")), "план правил");
  const rulesText = rulesChat.plan.summary;
  asstClose();
  asstApply();
  ok(await until(() => rulesChat.result), "правила применены при закрытой панели");
  ok(rulesChat.unread && asstState(rulesChat)[0] === "ready", "кнопка говорит об итоге");
  ok(savedOf(rulesChat).log.some((x) => x.t && x.t.includes(rulesText)), "план и итог в истории");
  asstVariantSet("auto");

  // Перезагрузка: история на месте, идущий ход отмечен потерянным
  const raw = JSON.parse(store());
  raw[0].running = true;
  localStorage.setItem(ASST_STORE, JSON.stringify(raw));
  asstChats = [];asst = null;
  asstLoad();
  ok(asstChats.length === raw.length && asst.interrupted && asst.err.includes("перезагрузили"), "потерянный ход назван");
  asstToggle();
  ok(el("asstAgain"), "есть «Спросить заново»");
  asstClose();
  localStorage.removeItem(ASST_STORE);
});
