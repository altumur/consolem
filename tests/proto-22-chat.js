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
  asstPickClear();
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
