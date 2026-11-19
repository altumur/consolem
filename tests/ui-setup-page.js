/* Сценарий интерфейса: своя страница подсистемы в карточке (часть 05 переделки по слоям, шаг 1, api/SETUP-UI.md).
   Вид security_controller/KEYPAD со setupUi.mode: iframe показывает тестовую страницу стенда в рамке: правило экрана
   (ступень 1), рамка вне разметки карточки, ready и init по схеме api/setup-ui.schema.json, высота по сообщению height,
   перерисовка не трогает рамку, ручной экран со страницей (камера) оставляет вкладку механизма «Доступ», незнакомая
   версия протокола и mode: tab — не страница, поздний адрес, страница не загрузилась и «Загрузить страницу снова».
   Прототип: index_80_svoya-stranica.html. На странице без своей страницы подсистемы сценарию проверять нечего. */
UiCheck(async ({ ok, until, sleep }) => {
  if (typeof suiOn !== "function") { ok(true, "своей страницы подсистемы на этой странице нет: проверять нечего"); return; }
  const SUI_KIND = "security_controller/KEYPAD";
  const SUI_UNIT = "30000306-0000-4000-8000-000000000000";
  const SUI_TEST_PAGE = "api/plugins/security_controller/setup/index.html";
  const main = () => document.getElementById("main");
  const slot = () => main().querySelector("[data-sui-slot]");
  const dockFrame = () => document.querySelector("#suiDock iframe");
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // Шпион: всё, что consolem отправляет странице (suiPost — единственная отправка)
  const sent = [];
  const realPost = suiPost;
  suiPost = (t, d) => { sent.push({ proto: "setup/1", type: t, ...d }); return realPost(t, d); };
  // Схема сообщений — та же, что сверяет check_api.py
  if (!window.CONSOLEM_SETUP_UI_SCHEMA) {
    const s = document.createElement("script");
    s.src = "api/setup-ui.schema.js";
    document.head.appendChild(s);
  }
  ok(await until(() => !!window.CONSOLEM_SETUP_UI_SCHEMA), "схема сообщений setup/1 загружена");
  const S = window.CONSOLEM_SETUP_UI_SCHEMA;
  const errsOf = (m) => (m && S.$defs[m.type] ? ConsolemContract.check({ components: { schemas: S.$defs } }, S.$defs[m.type], m, m.type, []) : ["нет сообщения"]);
  const valid = (m) => !errsOf(m).length;
  // Подмена POST /units/{uid}/setup-ui (P9: suiOpen зовёт API.post в момент вызова)
  const realApiPost = API.post;
  const stubSetup = (fn) => {
    API.post = function (path, ...rest) {
      if (/^\/units\/[^/]+\/setup-ui$/.test(path)) return fn(path, () => realApiPost.call(this, path, ...rest));
      return realApiPost.call(this, path, ...rest);
    };
  };
  const unstub = () => { API.post = realApiPost; };
  const open = async (uid, t) => {
    pick(uid, { force: true, tab: t || "gen" });
    return until(() => sel === uid && !!find(uid)?.n && !find(uid).n._row);
  };
  const cams = (await API.get("/units", { kind: "camera", limit: 5 })).items;
  const cam = cams[0].uid, cam2 = (cams[1] || cams[0]).uid;
  try {
    // Ступень 1 (P2): вид стенда — страница; незнакомая версия протокола и mode: tab — не страница
    ok(screenFor(SUI_KIND) === "page" && screenPageStep(SUI_KIND) === "page" && screenPageStep("security_controller/CONTROLLER") === null && screenPageStep("camera") === null,
      "ступень 1: KEYPAD — страница, mode: tab и камера без setupUi — нет");

    // Объект стенда: одна вкладка «Настройка», страница вместо формы по схеме
    ok(await open(SUI_UNIT), "карточка «Клавиатура у входа» открыта");
    const n = find(SUI_UNIT).n;
    ok(suiOn(n) && JSON.stringify(tabsFor(n)) === JSON.stringify([["gen", "Настройка"]]), "вид с iframe: одна вкладка «Настройка» — " + JSON.stringify(tabsFor(n)));
    ok(await until(() => !!slot()) && !main().querySelector("[data-schema-card]") && !!main().querySelector("[data-schema-head]"),
      "страница вместо формы по схеме, строка вида остаётся");
    ok(await until(() => !!dockFrame()), "рамка создана в #suiDock");
    const fr = dockFrame();
    // Правило стенда: consolem с диска даёт рамке allow-same-origin (иначе Chrome не грузит скрипты страницы с диска),
    // на http того же происхождения — без него
    const wantSandbox = location.protocol === "file:" ? "allow-scripts allow-forms allow-same-origin" : "allow-scripts allow-forms";
    ok(fr && fr.getAttribute("sandbox") === wantSandbox && new RegExp(SUI_TEST_PAGE.replace(/[./]/g, "\\$&") + "\\?").test(fr.src) && fr.src.includes("id=" + SUI_UNIT) &&
      !main().contains(fr) && fr.title === i18n("Страница подсистемы"),
      "стенд: sandbox «" + (fr && fr.getAttribute("sandbox")) + "», адрес тестовой страницы, рамка вне карточки");
    ok(await until(() => suiFrame?.state === "ready", 15000), "страница прислала ready");
    const init = sent.find((m) => m.type === "init");
    ok(valid(init) && JSON.stringify(init.host) === '{"proto":"setup/1","apply":"button"}' && init.readOnly === false && init.unit.version === hwVer.get(SUI_UNIT) &&
      JSON.stringify(init.draft) === "{}" && init.uid === SUI_UNIT && init.kind === SUI_KIND && init.lang === uiLang && init.unit.properties.code_length === 6,
      "init: по схеме, host шага 1 без bridge, readOnly false, версия объекта — " + JSON.stringify(errsOf(init)));
    ok(JSON.stringify(suiFrame.fields) === JSON.stringify(["/properties/code_length", "/properties/display_text", "/properties/backlight", "/properties/beep"]), "ready.fields — четыре поля");
    // Высота: под check_ui в рамке не идут кадры (ResizeObserver и requestAnimationFrame молчат), поэтому height
    // приходит событием от окна рамки, как от страницы
    const fromPage = (d) => window.dispatchEvent(new MessageEvent("message", { data: { proto: "setup/1", ...d }, origin: suiFrame.star ? "null" : suiFrame.origin, source: suiFrame.win }));
    fromPage({ type: "height", px: 437 });
    ok(await until(() => suiFrame.h === 437 && parseInt(slot().style.height) === 437 && parseInt(document.getElementById("suiDock").style.height) === 437), "высота места и рамки — по сообщению height");
    ok(!!document.querySelector("#suiDock:not(.sui-off)") && !slot().textContent.trim(), "после ready рамка видна поверх места");
    // Прокрутка карточки: док идёт за местом и обрезан по видимой части .sc; место ушло из вида — док скрыт.
    // Под check_ui событий прокрутки нет (кадров нет), поэтому suiPlace() — прямым вызовом, как из слушателя scroll
    {
      const sc = slot().closest(".sc"), dock = document.getElementById("suiDock"), pad = sc.style.paddingBottom;
      sc.style.paddingBottom = "3000px";
      sc.scrollTop = Math.max(0, slot().getBoundingClientRect().top - sc.getBoundingClientRect().top + 40);
      suiPlace();
      const r = slot().getBoundingClientRect(), v = sc.getBoundingClientRect();
      const placed = Math.abs(parseFloat(dock.style.top) - r.top) < 1 && new RegExp("^inset\\(" + Math.round(v.top - r.top) + "px").test(dock.style.clipPath) && !dock.classList.contains("sui-off");
      sc.scrollTop = sc.scrollTop + 2000;
      suiPlace();
      const gone = dock.classList.contains("sui-off");
      sc.scrollTop = 0; sc.style.paddingBottom = pad;
      suiPlace();
      ok(placed && gone && !dock.classList.contains("sui-off"), "прокрутка: док идёт за местом и обрезан по видимой части, ушёл из вида — скрыт");
    }
    // Страница с диска не достаёт до consolem. Проверка — из окна рамки, если окно доступно; недоступно — значит, и
    // рамке consolem недоступен. Ключ Chrome --allow-file-access-from-files (его ставит check_ui) даёт файлам общий доступ:
    // тогда защиты нет, и сценарий только называет это (правило стенда, api/SETUP-UI.md)
    const reach = (() => { try { return fr.contentWindow.eval("!!window.parent.document.body"); } catch (e) { return false; } })();
    const fileAccess = await new Promise((res) => {
      if (location.protocol !== "file:") return res(false);
      const x = new XMLHttpRequest();
      x.onload = () => res(!!x.responseText); x.onerror = () => res(false);
      try { x.open("GET", new URL("api/setup-ui.schema.js", document.baseURI).href); x.send(); } catch (e) { res(false); }
    });
    if (fileAccess) ok(true, "ЗАМЕТКА: браузер дал файлам общий доступ (--allow-file-access-from-files), страница с диска " + (reach ? "достаёт" : "не достаёт") + " до consolem — это только стенд");
    else ok(!reach, "страница в рамке не достаёт до window.parent.document");

    // Перерисовка не трогает рамку (Review Focus 1): gear, paint, событие чужого объекта
    const el0 = suiFrame.el, inits = sent.filter((m) => m.type === "init").length;
    gear(); paint();
    apiOnEvent({ type: "entity.changed", entityId: cam, kind: "camera", version: "x-" + Date.now() });
    await sleep(300);
    ok(suiFrame?.el === el0 && el0.isConnected && sent.filter((m) => m.type === "init").length === inits && suiFrame.state === "ready", "перерисовка не трогает рамку, init не уходит второй раз");
    // Чужое окно и чужое происхождение: сообщение не принимается
    const h0 = suiFrame.h;
    window.dispatchEvent(new MessageEvent("message", { data: { proto: "setup/1", type: "height", px: 1234 }, origin: "null", source: window }));
    window.dispatchEvent(new MessageEvent("message", { data: { proto: "setup/1", type: "height", px: 1234 }, origin: "https://evil.example", source: suiFrame.win }));
    ok(suiFrame.h === h0, "сообщение не от рамки или не с её происхождения — пропуск");
    fromPage({ type: "height", px: 5 });
    ok(await until(() => suiFrame.h === 80 && parseInt(slot().style.height) === 80), "высота зажата снизу: 80 px");
    fromPage({ type: "height", px: 99999 });
    ok(await until(() => suiFrame.h === 20000), "высота зажата сверху: 20 000 px");
    fromPage({ type: "height", px: 437 });
    fromPage({ type: "nope" });
    fromPage({ type: "height", px: 300, proto: "setup/9" });
    ok(suiFrame.state === "ready" && suiFrame.h === 437, "незнакомый type и чужая версия proto — пропуск");
    // Тема: страница получает theme
    const th = document.documentElement.dataset.theme;
    setTheme(th === "light" ? "dark" : "light");
    const thMsg = sent.filter((m) => m.type === "theme").pop();
    setTheme(th);
    ok(valid(thMsg) && thMsg.theme.mode === (th === "light" ? "dark" : "light") && typeof thMsg.theme.tokens["--one-accent"] === "string" && thMsg.theme.tokens["--one-accent"].length > 0,
      "смена темы — сообщение theme с токенами --one-…");

    // Ручной экран со страницей (P3, RF4): камера с setupUi.mode: iframe — «Настройка» и вкладка механизма «Доступ».
    // Стенд с testSupport меняет описание сам (PUT /test/kinds) и шлёт kinds.changed. Встроенный сервер страницы служебных
    // операций не держит: тогда новое описание отдаёт перехваченный GET /kinds, отметку setupUi — GET /units/{uid}, адрес —
    // POST /setup-ui (приём ui-unknown.js)
    const camWas = clone(KINDS.get("camera"));
    const camPage = Object.assign(clone(camWas), { setupUi: { mode: "iframe", url: SUI_TEST_PAGE } });
    const put = await API.raw("PUT", "/test/kinds/camera", camPage);
    const realRaw = API.raw, realGet = API.get;
    const stubKind = (def, tag) => {
      API.raw = function (method, path, body, headers) {
        if (method !== "GET" || path !== "/kinds") return realRaw.call(this, method, path, body, headers);
        return realRaw.call(this, method, path, body).then((r) => Object.assign({}, r, { status: 200, headers: Object.assign({}, r.headers, { etag: `"${tag}"` }),
          body: Object.assign({}, r.body, { items: r.body.items.map((k) => (k.kind === "camera" ? def : k)) }) }));
      };
    };
    if (put.status >= 300) {
      stubKind(camPage, "ui-setup-page-cam");
      API.get = function (path, params) { return realGet.call(this, path, params).then((r) => (path === `/units/${cam}` ? Object.assign({}, r, { capabilities: ["setupUi"] }) : r)); };
      stubSetup((path, real) => (path === `/units/${encodeURIComponent(cam)}/setup-ui`
        ? Promise.resolve({ url: `${SUI_TEST_PAGE}?type=camera&id=${encodeURIComponent(cam)}&lang=${uiLang}&t=ui`, expiresAt: new Date(Date.now() + 300000).toISOString(), readOnly: false })
        : real()));
      apiOnEvent({ type: "kinds.changed", kinds: ["camera"] });
    }
    try {
      ok(await until(() => KINDS.get("camera")?.setupUi?.mode === "iframe"), "вид camera получил setupUi.mode: iframe (kinds.changed)");
      ok(screenType("camera") === "camera" && screenFor("camera") === "page", "ступень 1 не меняет тип узла: камера остаётся ручным экраном");
      await open(cam);
      await hwFull(cam);
      const cn = find(cam).n;
      ok((cn._caps || []).includes("setupUi") && !isSchemaNode(cn), "у ручного узла камеры — отметка setupUi из Unit.capabilities");
      ok(JSON.stringify(tabsFor(cn)) === JSON.stringify([["gen", "Настройка"], ["acc", "Доступ"]]), "камера со страницей: «Настройка» и «Доступ» — " + JSON.stringify(tabsFor(cn)));
      gear();
      ok(await until(() => suiFrame?.uid === cam && suiFrame.state === "ready", 15000), "камера: страница прислала ready");
      const camInit = sent.filter((m) => m.type === "init").pop();
      ok(valid(camInit) && camInit.uid === cam && camInit.kind === "camera" && JSON.stringify(camInit.unit.properties) === JSON.stringify(unitProps.get(cam)), "камера: init с полями объекта, как их отдал сервер");
      // Вкладка механизма: места нет, рамка жива и скрыта
      const elc = suiFrame.el;
      tabGo("acc");
      ok(await until(() => !slot() && !!document.querySelector("#suiDock.sui-off")) && suiFrame?.el === elc && elc.isConnected, "вкладка «Доступ»: рамка скрыта, но жива");
      tabGo("gen");
      ok(await until(() => !!slot() && !document.querySelector("#suiDock.sui-off")) && suiFrame?.el === elc, "назад на «Настройка» — та же рамка");
      // Незнакомая версия протокола (Review Focus 4): не страница, вкладки ручного экрана
      const su = KINDS.get("camera").setupUi;
      KINDS.get("camera").setupUi = { mode: "iframe", protocol: "setup/9", url: SUI_TEST_PAGE };
      ok(screenPageStep("camera") === null && !suiOn(cn) && tabsFor(cn).some(([id]) => id === "vid"), "setup/9: не страница, вкладки ручного экрана");
      gear();
      ok(await until(() => suiFrame === null && !dockFrame()), "setup/9: рамки нет");
      KINDS.get("camera").setupUi = su;
    } finally {
      unstub();
      API.get = realGet;
      if (put.status < 300) await API.raw("PUT", "/test/kinds/camera", camWas);
      else { stubKind(camWas, "ui-setup-page-back"); apiOnEvent({ type: "kinds.changed", kinds: ["camera"] }); }
      await until(() => !KINDS.get("camera")?.setupUi);
      API.raw = realRaw;
      await hwFull(cam).catch(() => {});
    }
    // mode: tab — прежняя ссылка «Страница плагина»
    const ctrl = (await API.get("/units", { kind: "security_controller/CONTROLLER", limit: 1 })).items[0];
    await open(ctrl.uid);
    ok(await until(() => !!main().querySelector("[data-plugin]") && !slot() && !!main().querySelector("[data-schema-card]")), "mode: tab — ссылка «Страница плагина», форма по схеме");

    // Поздний адрес (Review Focus 3): ответ для прежнего объекта не создаёт рамку у нового
    stubSetup((p, real) => sleep(500).then(real));
    await open(SUI_UNIT);
    ok(await until(() => !!slot()) && /загружает страницу подсистемы/.test(slot().textContent) && !dockFrame(), "до ready место пишет, что консоль загружает страницу");
    pick(cam2, { force: true, tab: "gen" });
    await sleep(1000);
    ok(suiFrame === null && !dockFrame(), "поздний адрес: рамки нет у другого объекта");
    unstub();

    // Страница не ответила: адрес без страницы → нет ready за 10 с → причина и форма по схеме
    stubSetup(() => Promise.resolve({ url: "api/plugins/security_controller/langs/ru.json", expiresAt: new Date(Date.now() + 300000).toISOString(), readOnly: false }));
    await open(SUI_UNIT);
    ok(await until(() => suiFrame?.state === "failed", 15000) && await until(() => /не ответила за 10 секунд/.test(main().textContent)) && !!main().querySelector("[data-schema-card]") &&
      !!main().querySelector("[data-sui-fail]") && !!main().querySelector("[data-sui-retry]") && !dockFrame(),
      "нет ready за 10 с — текст с причиной и форма по схеме");
    ok(JSON.stringify(tabsFor(find(SUI_UNIT).n)) === JSON.stringify(schemaTabs(find(SUI_UNIT).n)), "сбой: вкладки формы по схеме");
    // Сервер отказал: причина — текст ответа
    const rej = { status: 500, problem: { code: "INTERNAL", message: "Дверь не ответила" } };
    stubSetup(() => Promise.reject(rej));
    suiRetry();
    ok(await until(() => suiFrame?.state === "failed" && main().querySelector("[data-sui-fail]")?.textContent.includes(problemText(rej))), "500 на POST /setup-ui — сбой, в тексте причина ответа: " + problemText(rej));
    // Адрес — javascript: → не открывается
    stubSetup(() => Promise.resolve({ url: "javascript:alert(1)", expiresAt: new Date(Date.now() + 300000).toISOString(), readOnly: false }));
    suiRetry();
    ok(await until(() => suiFrame?.state === "failed") && !dockFrame(), "адрес javascript: — сбой, рамки нет");
    unstub();
    // «Загрузить страницу снова» берёт новый адрес
    main().querySelector("[data-sui-retry]").click();
    ok(await until(() => suiFrame?.state === "ready", 15000) && !!dockFrame() && !!slot(), "«Загрузить страницу снова» — страница прислала ready");

    // Уход на другой объект: рамка убрана
    await open(cam);
    ok(await until(() => suiFrame === null && !dockFrame()), "уход с карточки — рамки нет");
  } finally {
    unstub();
    suiPost = realPost;
  }
});
