/* Тестовая страница стенда: своя страница подсистемы для вида security_controller/KEYPAD «Клавиатура» (setupUi.mode: iframe).
   Работает только на библиотеке api/setup-bridge.js (протокол setup/1, api/SETUP-UI.md). Две вкладки: «Код» (code_length)
   и «Экран» (display_text, backlight, beep). Поле lock_after_tries страница нарочно не показывает: на нём consolem
   проверяет строку покрытия и ошибки «не на странице». Своих запросов страница не делает и настройки не сохраняет:
   правку она отдаёт consolem сообщением change, записывает её consolem своим «Применить».
   Шаг 2 (мост, session.bridge): «сложный» экран по контроллеру клавиатуры — у самой клавиатуры нет детей, ссылок и
   команд. Блоки «Камеры» (listUnits по ссылкам контроллера, щелчок — navigate), «Найдено в сети домена» (getDiscovery,
   startDiscovery с подпиской на discovery.*, stopDiscovery), «Датчики контроллера» (listUnits по parentId; «Добавить» —
   createUnits, «Удалить» — deleteUnit, оба в черновик consolem; переноса нет: у вида датчика нет move) и «Команда»
   (confirm, затем runUnitAction ARM). Отказ страница называет словами по problem.code. Хост шага 1 — блоки скрыты.
   Прогоны стенда: #run=<имя> в адресе рамки (и hashchange) — страница сама проходит шаги и шлёт x-run {run, step, ok,
   detail}, тип вне протокола. Только по правилу стенда (страница с диска или с непрозрачным происхождением).
   Проверка — сценарий 13 tools/check_setup_bridge.js (python3 tools/check_api.py) и tests/ui-stranica-most.js. */
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
      b_title: "Контроллер «{name}»",
      b_load: "Страница не смогла прочитать контроллер клавиатуры.",
      cams: "Камеры",
      cams_hint: "Контроллер ссылается на эти камеры. Чтобы открыть камеру в консоли, нажать её имя.",
      cams_none: "Контроллер не ссылается на камеры.",
      link_online: "на связи",
      link_offline: "нет связи",
      found: "Найдено в сети домена",
      found_start: "Искать снова",
      found_stop: "Остановить",
      found_idle: "Сервер ещё не искал устройства в сети домена.",
      found_searching: "Сервер ищет устройства: {progress} %.",
      found_done: "Сервер нашёл устройств: {n}.",
      found_stopped: "Пользователь остановил поиск. Сервер нашёл устройств: {n}.",
      found_more: "И ещё {n}.",
      kids: "Датчики контроллера",
      kids_hint: "Консоль добавит и удалит отмеченные датчики, когда пользователь нажмёт «Применить».",
      kids_none: "У контроллера нет датчиков.",
      kid_add: "Добавить датчик",
      kid_del: "Удалить",
      kid_new: "Новый датчик",
      mark_add: "Черновик: добавить",
      mark_del: "Черновик: удалить",
      applied: "Консоль применила изменения датчиков: {ok} из {n}.",
      cmd: "Команда",
      cmd_arm: "Поставить на охрану",
      cmd_armed: "Контроллер на охране.",
      cmd_disarmed: "Контроллер не на охране.",
      cmd_ok: "Сервер выполнил команду.",
      cmd_no: "Пользователь не подтвердил команду.",
      arm_title: "Поставить контроллер на охрану?",
      arm_text: "Контроллер «{name}» начнёт сообщать о тревогах датчиков.",
      arm_ok: "Поставить",
      p_PERMISSION_DENIED: "У вас нет права на это действие, поэтому сервер отказал.",
      p_READONLY: "Страница открыта только для просмотра, поэтому консоль не принимает изменения.",
      p_NOT_SUPPORTED: "Консоль не выполняет эту операцию для страницы.",
      p_VALIDATION_FAILED: "Сервер не принял данные.",
      p_BUSY: "Страница отправила слишком много запросов. Повторить позже.",
      p_CANCELLED: "Пользователь отказался в диалоге консоли.",
      p_NOT_FOUND: "Объекта нет, или у вас нет права его видеть.",
      p_UPSTREAM_UNAVAILABLE: "Нет связи с сервером.",
      p_VERSION_MISMATCH: "Другой пользователь изменил объект. Чтобы повторить, обновить страницу.",
      p_other: "Сервер отказал. Код ошибки: {code}.",
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
      b_title: "Controller “{name}”",
      b_load: "The page cannot read the controller of the keypad.",
      cams: "Cameras",
      cams_hint: "The controller refers to these cameras. To open a camera in the console, click its name.",
      cams_none: "The controller does not refer to cameras.",
      link_online: "online",
      link_offline: "offline",
      found: "Found in the domain network",
      found_start: "Search again",
      found_stop: "Stop",
      found_idle: "The server did not search the domain network yet.",
      found_searching: "The server searches for devices: {progress} %.",
      found_done: "The server found {n} devices.",
      found_stopped: "The user stopped the search. The server found {n} devices.",
      found_more: "And {n} more.",
      kids: "Controller sensors",
      kids_hint: "The console adds and deletes the marked sensors when the user clicks “Apply”.",
      kids_none: "The controller has no sensors.",
      kid_add: "Add sensor",
      kid_del: "Delete",
      kid_new: "New sensor",
      mark_add: "Draft: add",
      mark_del: "Draft: delete",
      applied: "The console applied the sensor changes: {ok} of {n}.",
      cmd: "Command",
      cmd_arm: "Arm",
      cmd_armed: "The controller is armed.",
      cmd_disarmed: "The controller is not armed.",
      cmd_ok: "The server did the command.",
      cmd_no: "The user did not confirm the command.",
      arm_title: "Arm the controller?",
      arm_text: "The controller “{name}” starts to report sensor alarms.",
      arm_ok: "Arm",
      p_PERMISSION_DENIED: "You do not have the right to do this, so the server refused.",
      p_READONLY: "The page is open for viewing only, so the console does not accept changes.",
      p_NOT_SUPPORTED: "The console does not do this operation for the page.",
      p_VALIDATION_FAILED: "The server did not accept the data.",
      p_BUSY: "The page sent too many requests. Try again later.",
      p_CANCELLED: "The user refused in the console dialog.",
      p_NOT_FOUND: "The object does not exist, or you do not have the right to see it.",
      p_UPSTREAM_UNAVAILABLE: "No connection to the server.",
      p_VERSION_MISMATCH: "Another user changed the object. To try again, refresh the page.",
      p_other: "The server refused. Error code: {code}.",
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


  // ── Шаг 2: «сложный» экран по контроллеру через мост consolem ──
  const SENSOR = "security_controller/SENSOR";
  const DISCOVERY = ["discovery.progress", "discovery.finished"];
  const FOUND_MAX = 8;
  // ctrl — контроллер клавиатуры, domainId — её домен, drafted — шаги моста в черновике consolem: step → {op, uid?, name?}
  const B = { ctrl: null, domainId: null, cams: [], kids: [], found: null, drafted: new Map(), steps: [], unsub: null, foundWait: null, wantApplied: null };
  const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  function node(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  // Отказ словами по problem.code. PERMISSION_DENIED без запроса (status 0) — страница только для просмотра
  function why(r) {
    const code = (r && r.problem && r.problem.code) || "";
    if (code === "PERMISSION_DENIED" && r.status === 0) return T.p_READONLY;
    return T["p_" + code] || fill(T.p_other, { code: code || (r && r.status) });
  }
  function note(block, text, done) {
    const msg = $(block).querySelector(".msg");
    msg.textContent = text || "";
    msg.hidden = !text;
    msg.classList.toggle("done", !!done);
  }
  // Вызов моста: ответ consolem, а отказ — ещё и словами в блоке
  async function call(block, op, args) {
    const r = await session.call(op, args);
    if (block) note(block, r.ok ? "" : why(r));
    return r;
  }
  const canDraft = (op) => session.can(op) === "draft";

  // Камеры по ссылкам контроллера: имя и связь; щелчок по имени — переход консоли к камере
  function paintCams() {
    const ul = $("cams");
    clear(ul);
    if (!B.cams.length) ul.appendChild(node("li", "sub", T.cams_none));
    B.cams.forEach((u) => {
      const li = node("li");
      const b = node("button", "link name", u.name);
      b.type = "button";
      b.setAttribute("data-uid", u.uid);
      b.addEventListener("click", () => openCam(u.uid));
      const link = u.status && u.status.link;
      li.appendChild(b);
      li.appendChild(node("span", "sub", link === "online" ? T.link_online : link ? T.link_offline : ""));
      ul.appendChild(li);
    });
  }
  async function openCam(uid) {
    note("blk-cams", "");
    // Удачный переход ответа не получает: consolem открыл камеру и закрыл рамку
    const r = await session.navigate(uid);
    if (r && !r.ok) note("blk-cams", why(r));
  }

  // Найдено в сети домена: состояние поиска и первые кандидаты
  function paintFound() {
    const d = B.found || {};
    const n = Array.isArray(d.candidates) ? d.candidates.length : 0;
    const text = { idle: T.found_idle, searching: fill(T.found_searching, { progress: d.progress || 0 }), done: fill(T.found_done, { n }), stopped: fill(T.found_stopped, { n }) };
    $("found-state").textContent = text[d.state] || "";
    const ul = $("found");
    clear(ul);
    (d.candidates || []).slice(0, FOUND_MAX).forEach((c) => {
      const li = node("li");
      li.appendChild(node("span", "name", c.name || c.ip || c.id));
      li.appendChild(node("span", "sub", [c.ip, [c.vendor, c.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")));
      ul.appendChild(li);
    });
    if (n > FOUND_MAX) ul.appendChild(node("li", "sub", fill(T.found_more, { n: n - FOUND_MAX })));
    $("found-start").disabled = d.state === "searching" || !session.can("startDiscovery") || !B.domainId;
    $("found-stop").disabled = d.state !== "searching" || !session.can("stopDiscovery");
  }
  async function readFound() {
    const r = await call("blk-found", "getDiscovery", { params: { uid: B.domainId } });
    if (r.ok) B.found = r.body;
    paintFound();
    return r;
  }
  function stopListening() {
    if (B.unsub) B.unsub();
    B.unsub = null;
  }
  // «Искать снова»: сначала подписка на события поиска домена, потом запуск. Конец поиска снимает подписку
  async function startFound() {
    note("blk-found", "");
    if (!B.unsub) {
      try {
        B.unsub = await session.subscribe({ entityIds: [B.domainId], types: DISCOVERY }, foundEvent);
      } catch (e) {
        note("blk-found", why({ status: 0, problem: e.problem }));
        return { sub: false };
      }
    }
    const r = await call("blk-found", "startDiscovery", { params: { uid: B.domainId } });
    if (r.ok && r.body) B.found = r.body;
    else stopListening();
    paintFound();
    return { sub: true, r };
  }
  function foundEvent(m) {
    if (m.type === "discovery.finished") stopListening();
    readFound().then(() => { if (B.foundWait) B.foundWait(m); });
  }
  async function stopFound() {
    const r = await call("blk-found", "stopDiscovery", { params: { uid: B.domainId } });
    if (r.ok && r.body) B.found = r.body;
    stopListening();
    paintFound();
    return r;
  }

  // Датчики контроллера и шаги черновика consolem: новый датчик — строка с отметкой, удалённый — зачёркнут
  function paintKids() {
    const ul = $("kids");
    clear(ul);
    const del = new Set();
    const add = [];
    B.drafted.forEach((d) => { if (d.op === "deleteUnit") del.add(d.uid); else add.push(d); });
    if (!B.kids.length && !add.length) ul.appendChild(node("li", "sub", T.kids_none));
    B.kids.forEach((u) => {
      const gone = del.has(u.uid);
      const li = node("li", gone ? "drafted drafted-delete" : "");
      li.setAttribute("data-uid", u.uid);
      li.appendChild(node("span", "name", u.name));
      li.appendChild(node("span", "sub", (u.properties && u.properties.zone) || ""));
      const end = node("span", "end");
      if (gone) end.appendChild(node("span", "chip", T.mark_del));
      else {
        const b = node("button", "", T.kid_del);
        b.type = "button";
        b.disabled = !canDraft("deleteUnit");
        b.addEventListener("click", () => deleteKid(u.uid));
        end.appendChild(b);
      }
      li.appendChild(end);
      ul.appendChild(li);
    });
    add.forEach((d) => {
      const li = node("li", "drafted drafted-add");
      li.appendChild(node("span", "name", d.name));
      const end = node("span", "end");
      end.appendChild(node("span", "chip", T.mark_add));
      li.appendChild(end);
      ul.appendChild(li);
    });
    $("kid-add").disabled = !canDraft("createUnits") || !B.ctrl;
  }
  async function readKids() {
    const r = await call("blk-kids", "listUnits", { params: { parentId: B.ctrl.uid } });
    if (r.ok) B.kids = (r.body.items || []).filter((u) => u.kind === SENSOR);
    paintKids();
    return r;
  }
  async function addKid() {
    const name = T.kid_new;
    const r = await call("blk-kids", "createUnits", { body: { items: [{ kind: SENSOR, parentId: B.ctrl.uid, name, properties: {} }] } });
    if (r.ok && r.body && r.body.drafted) B.drafted.set(r.body.step, { op: "createUnits", name });
    paintKids();
    return r;
  }
  // Удаление: consolem сам спрашивает число удаляемых объектов в своём диалоге
  async function deleteKid(uid) {
    const r = await call("blk-kids", "deleteUnit", { params: { uid } });
    if (r.ok && r.body && r.body.drafted) B.drafted.set(r.body.step, { op: "deleteUnit", uid });
    paintKids();
    return r;
  }
  // draft от consolem: в черновике остались только эти шаги моста
  function onSteps(steps) {
    B.steps = steps || [];
    const live = new Set(B.steps.map((x) => x.step));
    [...B.drafted.keys()].forEach((k) => { if (!live.has(k)) B.drafted.delete(k); });
    if (session && session.bridge) paintKids();
  }
  // applied: итог шагов моста; датчики — заново с сервера
  function onAppliedSteps(steps) {
    const list = steps || [];
    const okN = list.filter((x) => x.state === "ok").length;
    B.drafted.clear();
    if (list.length) note("blk-kids", fill(T.applied, { ok: okN, n: list.length }), okN === list.length);
    if (B.wantApplied) xrun(B.wantApplied, "applied", list.length > 0 && okN === list.length, list.map((x) => x.state + (x.code ? " " + x.code : "")).join(", "));
    B.wantApplied = null;
    if (B.ctrl) readKids();
  }

  // Команда контроллера: подтверждение страницы в диалоге consolem, затем ARM
  function paintCmd() {
    const armed = !!(B.ctrl && B.ctrl.status && B.ctrl.status.observed && B.ctrl.status.observed.armed);
    $("cmd-state").textContent = B.ctrl ? (armed ? T.cmd_armed : T.cmd_disarmed) : "";
    $("cmd-arm").disabled = !B.ctrl || !session.can("runUnitAction");
  }
  async function arm(ask) {
    note("blk-cmd", "");
    if (ask !== false) {
      const yes = await session.confirm({ title: T.arm_title, text: fill(T.arm_text, { name: B.ctrl.name }), okLabel: T.arm_ok });
      if (!yes) {
        note("blk-cmd", T.cmd_no);
        return { confirmed: false };
      }
    }
    const r = await call("blk-cmd", "runUnitAction", { params: { uid: B.ctrl.uid, action: "ARM" } });
    if (r.ok) {
      note("blk-cmd", T.cmd_ok, true);
      await readCtrl();
    }
    return { confirmed: true, r };
  }
  async function readCtrl() {
    const r = await session.call("getUnit", { params: { uid: B.ctrl.uid } });
    if (r.ok) B.ctrl = r.body;
    paintCmd();
    return r;
  }

  // Свой объект: контроллер и домен клавиатуры — их нет в init.unit. Затем блоки
  async function loadBridge() {
    const err = $("b-error");
    const me = await session.call("getUnit", { params: { uid: session.unit.uid } });
    const pid = me.ok && me.body && me.body.parentId;
    const c = pid ? await session.call("getUnit", { params: { uid: pid } }) : null;
    if (!c || !c.ok) {
      err.textContent = c ? `${T.b_load} ${why(c)}` : me.ok ? T.b_load : `${T.b_load} ${why(me)}`;
      err.hidden = false;
      return { me, c };
    }
    err.hidden = true;
    B.ctrl = c.body;
    B.domainId = me.body.domainId || c.body.domainId || null;
    $("b-title").textContent = fill(T.b_title, { name: B.ctrl.name });
    const ids = Array.isArray(B.ctrl.properties && B.ctrl.properties.cameras) ? B.ctrl.properties.cameras : [];
    const cams = ids.length ? await call("blk-cams", "listUnits", { params: { ids } }) : null;
    B.cams = cams && cams.ok ? cams.body.items || [] : [];
    paintCams();
    const kids = await readKids();
    const found = B.domainId ? await readFound() : null;
    paintCmd();
    return { me, c, ids, cams, kids, found };
  }

  // ── Прогоны стенда: #run=<имя> — страница проходит шаги сама и шлёт x-run ──
  // Только по правилу стенда (SETUP-UI.md, «Адрес и рамка»): страница с диска или с непрозрачным происхождением
  const STAND = location.protocol === "file:" || window.origin === "null";
  function xrun(run, step, ok, detail) {
    if (!STAND) return;
    const m = { proto: SetupBridge.proto, type: "x-run", run, step, ok: !!ok };
    if (detail != null) m.detail = String(detail);
    window.parent.postMessage(m, "*");
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, ms) {
    for (let i = 0; i < ms / 50; i++) {
      if (fn()) return true;
      await wait(50);
    }
    return !!fn();
  }
  const codeOf = (r) => (r && r.problem && r.problem.code) || "";
  const said = (r) => `status ${r && r.status} ${codeOf(r)}`.trim();
  const RUNS = {
    async read(step) {
      const x = await loadBridge();
      step("self", !!(x.me.ok && x.me.body.parentId), x.me.ok ? x.me.body.parentId : said(x.me));
      step("controller", !!(x.c && x.c.ok && x.ids.length), x.ids ? x.ids.length : said(x.c));
      step("cameras", !!(x.cams && x.cams.ok && x.cams.body.items.length === x.ids.length), B.cams.map((u) => u.name).join(", "));
      step("children", !!(x.kids && x.kids.ok && B.kids.length), B.kids.map((u) => u.name).join(", "));
      step("blocks", !$("bridge").hidden && $("cams").querySelectorAll("button").length === B.cams.length);
    },
    async discovery(step) {
      if (!B.ctrl) await loadBridge();
      const r = await readFound();
      step("read", r.ok && !!B.found, r.ok ? `${B.found.state} ${(B.found.candidates || []).length}` : said(r));
      const done = new Promise((res) => { B.foundWait = (m) => { if (m.type === "discovery.finished") res(true); }; });
      const s = await startFound();
      step("subscribe", s.sub);
      step("start", !!(s.r && s.r.status === 202), s.r && said(s.r));
      const fin = await Promise.race([done, wait(40000).then(() => false)]);
      B.foundWait = null;
      step("finished", fin && !B.unsub, B.found && B.found.state);
      const s2 = await startFound();
      const r2 = await stopFound();
      step("stop", !!(s2.r && s2.r.ok && r2.ok && B.found && B.found.state !== "searching"), `${said(r2)} ${B.found && B.found.state}`);
      step("unsubscribed", !B.unsub);
    },
    async draft(step) {
      if (!B.ctrl) await loadBridge();
      const r = await readKids();
      step("children", r.ok && B.kids.length > 0, B.kids.length);
      const a = await addKid();
      step("add", a.status === 202 && !!a.body && a.body.drafted === true, said(a));
      const last = B.kids[B.kids.length - 1];
      const d = await deleteKid(last.uid);
      step("delete", d.status === 202 && !!d.body && d.body.drafted === true, `${said(d)} ${last.name}`);
      const marked = await until(() => $("kids").querySelectorAll(".drafted").length === 2 && B.steps.length === 2, 3000);
      step("marked", marked, `${$("kids").querySelectorAll(".drafted").length} ${B.steps.length}`);
      B.wantApplied = "draft";
    },
    async confirm(step) {
      if (!B.ctrl) await loadBridge();
      const x = await arm(true);
      step("confirm", x.confirmed === true);
      step("act", !!(x.r && x.r.ok && x.r.status === 200), x.r && said(x.r));
      step("state", !!(B.ctrl.status && B.ctrl.status.observed && B.ctrl.status.observed.armed), $("cmd-state").textContent);
    },
    async navigate(step) {
      if (!B.cams.length) await loadBridge();
      const first = $("cams").querySelector("button");
      step("cameras", !!first, B.cams.length);
      step("navigate", !!first, first && first.getAttribute("data-uid"));
      // Переход — после done: удачный переход закрывает рамку, и шагов после него не будет
      return () => { if (first) first.click(); };
    },
    async nobridge(step) {
      step("blocks", !session.bridge && $("bridge").hidden, "блоки шага 2 скрыты");
      const inp = $("f-display_text");
      inp.value = "Без моста";
      inp.dispatchEvent(new Event("input"));
      step("change", !!session.draft && session.draft.display_text === "Без моста", JSON.stringify(session.draft));
    },
    async denied(step) {
      if (!B.ctrl) await loadBridge();
      step("readonly", session.readOnly && session.can("createUnits") === null && session.can("runUnitAction") === "act");
      step("add-off", $("kid-add").disabled);
      const x = await arm(false);
      step("act", !!x.r && x.r.status === 403 && codeOf(x.r) === "PERMISSION_DENIED", said(x.r));
      step("act-text", $("blk-cmd").querySelector(".msg").textContent === T.p_PERMISSION_DENIED);
      const c = await session.call("createUnits", { body: { items: [{ kind: SENSOR, parentId: B.ctrl.uid, name: T.kid_new, properties: {} }] } });
      step("draft", c.status === 0 && codeOf(c) === "PERMISSION_DENIED", said(c));
    },
  };
  let running = null;
  async function runFromHash() {
    const m = /^#run=([\w-]+)/.exec(String(location.hash || ""));
    const name = m && m[1];
    if (!name || name === running || !RUNS[name]) return;
    running = name;
    let all = true;
    const step = (id, ok, detail) => {
      all = all && !!ok;
      xrun(name, id, ok, detail);
    };
    let after = null;
    try {
      after = await RUNS[name](step);
    } catch (e) {
      step("error", false, e && e.message);
    }
    running = null;
    xrun(name, "done", all);
    if (typeof after === "function") after();
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
    // Шаг 2: блоки — только у хоста с мостом
    $("bridge").hidden = !s.bridge;
    if (s.bridge) {
      $("kid-add").addEventListener("click", addKid);
      $("found-start").addEventListener("click", startFound);
      $("found-stop").addEventListener("click", stopFound);
      $("cmd-arm").addEventListener("click", () => arm(true));
      loadBridge();
    }
    // Прогоны стенда. В проверке 13 (tools/check_setup_bridge.js) у окна нет addEventListener: прогонов там нет
    if (typeof window.addEventListener === "function") {
      window.addEventListener("hashchange", runFromHash);
      runFromHash();
    }
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
    onDraft: (draft, steps) => { fromHost(); if (steps) onSteps(steps); },
    onApplied: (unit, steps) => { fromHost(); if (steps) onAppliedSteps(steps); },
    onRevert: () => { fromHost(); onSteps([]); },
    onErrors: showErrors,
    onTheme: paintTheme,
    onFlush: () => (session && !session.readOnly ? patchOf() : undefined),
  }).then(start, () => status(T.noHost));
})();
