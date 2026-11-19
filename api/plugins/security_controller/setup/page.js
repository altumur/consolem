/* Тестовая страница стенда: своя страница подсистемы для вида security_controller/KEYPAD «Клавиатура» (setupUi.mode: iframe).
   Работает только на библиотеке api/setup-bridge.js (протокол setup/1, api/SETUP-UI.md). Две вкладки: «Код» (code_length)
   и «Экран» (display_text, backlight, beep). Поле lock_after_tries страница нарочно не показывает: на нём consolem
   проверяет строку покрытия и ошибки «не на странице». Запросов страница не делает и настройки не сохраняет:
   правку она отдаёт consolem сообщением change, записывает её consolem своим «Применить».
   Проверка — сценарий 13 tools/check_setup_bridge.js (python3 tools/check_api.py). */
(() => {
  const FIELDS = ["code_length", "display_text", "backlight", "beep"];
  const READY_FIELDS = FIELDS.map((k) => `/properties/${k}`);
  // Подписи полей, которые знает страница: поля на странице и lock_after_tries (его страница не показывает,
  // но называет подписью в списке ошибок)
  const LABELS = new Set([...FIELDS, "lock_after_tries"]);
  const TEXT = {
    ru: {
      title: "Клавиатура",
      waiting: "Страница ждёт данные от консоли.",
      alone: "Страница ждёт данные от консоли. Чтобы настроить клавиатуру, открыть её карточку в консоли.",
      noHost: "Страница не знает адрес консоли, поэтому не может получить настройки.",
      readonly: "Только просмотр",
      tab_code: "Код",
      tab_screen: "Экран",
      code_length: "Длина кода",
      code_length_hint: "От 4 до 8 цифр.",
      display_text: "Текст на экране",
      display_text_hint: "Не больше 32 знаков.",
      backlight: "Подсветка",
      backlight_none: "Не выбрана",
      backlight_off: "Выключена",
      backlight_low: "Слабая",
      backlight_high: "Яркая",
      beep: "Звук нажатия",
      lock_after_tries: "Блокировать после попыток",
      bad_code_length: "Указать длину кода от 4 до 8 цифр.",
      bad_display_text: "Текст длиннее 32 знаков. Сократить текст.",
      invalid: "Страница нашла ошибки в полях. Исправить поля, отмеченные красным.",
      other: "Консоль сообщила об ошибке.",
    },
    en: {
      title: "Keypad",
      waiting: "The page waits for data from the console.",
      alone: "The page waits for data from the console. To set up the keypad, open its card in the console.",
      noHost: "The page does not know the console address, so it cannot get the settings.",
      readonly: "View only",
      tab_code: "Code",
      tab_screen: "Display",
      code_length: "Code length",
      code_length_hint: "From 4 to 8 digits.",
      display_text: "Display text",
      display_text_hint: "Maximum 32 characters.",
      backlight: "Backlight",
      backlight_none: "Not selected",
      backlight_off: "Off",
      backlight_low: "Low",
      backlight_high: "High",
      beep: "Key sound",
      lock_after_tries: "Lock after failed tries",
      bad_code_length: "Enter a code length from 4 to 8 digits.",
      bad_display_text: "The text is longer than 32 characters. Make the text shorter.",
      invalid: "The page found errors in the fields. Correct the fields with a red border.",
      other: "The console reported an error.",
    },
  };
  const $ = (id) => document.getElementById(id);
  const fieldEl = (k) => document.querySelector(`[data-field="${k}"]`);
  let T = TEXT[pickLang(new URLSearchParams(location.search).get("lang") || (navigator && navigator.language))];
  let session = null;
  let lastInvalid = "[]";

  function pickLang(lang) {
    return /^ru\b/i.test(String(lang || "")) ? "ru" : "en";
  }
  function paintTexts() {
    document.documentElement.lang = T === TEXT.ru ? "ru" : "en";
    document.title = T.title;
    document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = T[el.getAttribute("data-t")] || ""; });
  }
  function status(text) {
    const el = $("status");
    el.textContent = text || "";
    el.hidden = !text;
  }

  // ── Тема: токены консоли --one-… — переменные CSS страницы ──
  function paintTheme(theme) {
    if (!theme) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme.mode === "light" ? "light" : "dark");
    Object.entries(theme.tokens || {}).forEach(([k, v]) => {
      if (/^--one-[a-z0-9-]+$/.test(k) && typeof v === "string") root.style.setProperty(k, v);
    });
  }

  // ── Вкладки страницы ──
  function showTab(name) {
    document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === name)));
    document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.getAttribute("data-panel") !== name; });
  }

  // ── Значения на полях и обратно ──
  function show(props) {
    const p = props || {};
    $("f-code_length").value = p.code_length == null ? "" : String(p.code_length);
    $("f-display_text").value = p.display_text == null ? "" : String(p.display_text);
    $("f-backlight").value = p.backlight == null ? "" : String(p.backlight);
    $("f-beep").checked = p.beep === true;
  }
  // Значения объекта с черновиком, поверх — ввод на полях. Поле, которого на странице нет (lock_after_tries), остаётся как было
  function readForm() {
    const next = SetupBridge.merge(session.unit.properties || {}, session.draft || {});
    const num = $("f-code_length").value.trim();
    if (num === "") delete next.code_length;
    else next.code_length = Number(num);
    const txt = $("f-display_text").value;
    if (txt === "") delete next.display_text;
    else next.display_text = txt;
    const bl = $("f-backlight").value;
    if (bl === "") delete next.backlight;
    else next.backlight = bl;
    next.beep = $("f-beep").checked;
    return next;
  }
  const patchOf = () => SetupBridge.diff(session.unit.properties || {}, readForm());

  // ── Проверка на странице: invalid закрывает «Показать план» в консоли ──
  function check(props) {
    const bad = {};
    const n = props.code_length;
    if (n !== undefined && !(Number.isInteger(n) && n >= 4 && n <= 8)) bad.code_length = T.bad_code_length;
    if (typeof props.display_text === "string" && props.display_text.length > 32) bad.display_text = T.bad_display_text;
    return bad;
  }
  function mark(k, text) {
    const f = fieldEl(k);
    if (!f) return;
    const msg = f.querySelector(".msg");
    f.classList.toggle("bad", !!text);
    msg.textContent = text || "";
    msg.hidden = !text;
    markTabs();
  }
  // Кнопка вкладки с ошибкой в поле отмечена: так человек видит ошибку и на скрытой вкладке
  function markTabs() {
    document.querySelectorAll("[data-tab]").forEach((b) => {
      const panel = document.querySelector(`[data-panel="${b.getAttribute("data-tab")}"]`);
      b.classList.toggle("bad", !!(panel && panel.querySelector(".field.bad")));
    });
  }
  function sendInvalid(bad) {
    const fields = Object.keys(bad).map((k) => `/properties/${k}`);
    const key = JSON.stringify(fields);
    if (key === lastInvalid) return;
    lastInvalid = key;
    session.invalid(fields, fields.length ? T.invalid : undefined);
  }
  function onInput(e) {
    if (!session || session.readOnly) return;
    const next = readForm();
    const bad = check(next);
    const k = ((e.target && e.target.id) || "").replace(/^f-/, "");
    if (FIELDS.indexOf(k) >= 0) mark(k, bad[k]);
    error("");
    session.change(SetupBridge.diff(session.unit.properties || {}, next));
    sendInvalid(bad);
  }

  // ── Ошибки консоли (errors): поле на странице — красная рамка с текстом, остальное — над полями ──
  function error(text) {
    const el = $("error");
    el.textContent = text || "";
    el.hidden = !text;
  }
  function clearMarks() {
    FIELDS.forEach((k) => mark(k, ""));
    error("");
  }
  function showErrors(problem) {
    clearMarks();
    const p = problem || {};
    const list = Array.isArray(p.errors) && p.errors.length ? p.errors : [{ field: p.field, message: p.message }];
    const rest = [];
    list.forEach((er) => {
      const k = String((er && er.field) || "").replace(/^\/properties\//, "");
      if (FIELDS.indexOf(k) >= 0) mark(k, er.message || T.other);
      // Поля нет на странице: подпись, если страница её знает, иначе указатель
      else if (er && er.field) rest.push(`${er.message || T.other} (${LABELS.has(k) && T[k] ? T[k] : er.field})`);
      else rest.push((er && er.message) || T.other);
    });
    if (rest.length) error(rest.join("\n"));
  }

  // Новые значения от консоли: draft, applied, revert
  function fromHost() {
    show(SetupBridge.merge(session.unit.properties || {}, session.draft || {}));
    const bad = check(readForm());
    FIELDS.forEach((k) => mark(k, bad[k]));
    error("");
    if (!session.readOnly) sendInvalid(bad);
  }

  function start(s) {
    session = s;
    T = TEXT[pickLang(s.init && s.init.lang)];
    paintTexts();
    paintTheme(s.theme);
    status("");
    $("form").hidden = false;
    $("readonly").hidden = !s.readOnly;
    document.querySelectorAll("#form input, #form select").forEach((el) => {
      el.disabled = !!s.readOnly;
      el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", onInput);
    });
    fromHost();
  }

  paintTexts();
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.getAttribute("data-tab"))));
  showTab("code");
  // Страницу открыли саму по себе, а не в рамке консоли: ждать некого, подключения нет
  if (window.parent === window) {
    status(T.alone);
    return;
  }
  status(T.waiting);
  SetupBridge.connect({
    fields: READY_FIELDS,
    onDraft: fromHost,
    onApplied: fromHost,
    onRevert: fromHost,
    onErrors: showErrors,
    onTheme: paintTheme,
    onFlush: () => (session && !session.readOnly ? patchOf() : undefined),
  }).then(start, () => status(T.noHost));
})();
