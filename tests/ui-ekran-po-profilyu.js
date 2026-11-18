/* Сценарий интерфейса: экран по профилю (часть 07 переделки по слоям). Ручной экран выбирается по профилю вида
   (implements), а не по коду вида: ступень 1 — своя страница (screenPageStep, до части 05 — форма по схеме у вида с
   setupUi), ступень 2 — ручной экран по SCREEN_OF_PROFILE (handScreenOf), ступень 3 — форма по схеме. Раздел А — выбор
   экрана; раздел Г — профиль снят с вида при открытой карточке (kinds.changed). Виды теста ставятся в KINDS на время
   проверки и снимаются в finally с kindsApply(). Запуск — tools/check_ui.py --page index_78_ekran-po-profilyu.html. */
UiCheck(async ({ ok, until }) => {
  if (typeof screenFor !== "function") { ok(true, "на странице нет screenFor: проверять нечего"); return; }
  const main = () => document.getElementById("main");
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // Описания на время проверки: прежние возвращаются, новые снимаются
  const withKinds = async (defs, fn) => {
    const was = new Map(defs.map((d) => [d.kind, KINDS.get(d.kind)]));
    defs.forEach((d) => KINDS.set(d.kind, d));
    kindsApply();
    try { return await fn(); }
    finally {
      was.forEach((v, k) => (v ? KINDS.set(k, v) : KINDS.delete(k)));
      kindsApply();
    }
  };
  // Объект набора под другим кодом вида: GET /units/{uid} и списки GET /units отдают его с kind (как asPlug в ui-unknown.js)
  const asKind = async (uid, kind, fn) => {
    const realGet = API.get;
    const as = (u) => (u && u.uid === uid ? Object.assign({}, u, { kind }) : u);
    API.get = function (path, params) {
      return realGet.call(this, path, params).then((r) => {
        if (path === `/units/${uid}`) return as(r);
        if (path === "/units" && r && Array.isArray(r.items)) return Object.assign({}, r, { items: r.items.map(as) });
        return r;
      });
    };
    try { return await fn(); }
    finally { API.get = realGet; }
  };
  // Узел заново из ответа сервера: из кэша убран, pick читает строку и полную запись
  const reopen = async (uid) => {
    hwRemoveDevice(uid);
    pick(uid, { force: true, tab: "gen" });
    return until(() => sel === uid && find(uid) && !find(uid).n._row && !!main().querySelector(".cs-cq, [data-schema-card]"));
  };
  const kinds = (await API.get("/kinds")).items;
  const kindOf = (k) => clone(kinds.find((x) => x.kind === k));
  const like = Object.assign(kindOf("camera"), { kind: "test.camera-like", implements: ["vms.camera/1"], label: { text: "Камера по профилю", lang: "ru" } });
  const cam2 = Object.assign(kindOf("camera"), { kind: "test.camera2", implements: ["vms.camera/2"] });
  const acs = Object.assign(kindOf("acfa_lock"), { kind: "acme.acs" });
  const campos = Object.assign(kindOf("camera"), { kind: "acme.campos", implements: ["vms.pos/1", "vms.camera/1"] });
  const sens = Object.assign(kindOf("sensor"), { kind: "acme.sensor", implements: [] });
  const srvK = Object.assign(kindOf("server"), { kind: "acme.srv" });
  const domK = Object.assign(kindOf("domain"), { kind: "acme.dom" });
  const fldK = Object.assign(kindOf("folder"), { kind: "acme.fld" });

  // ── А. Выбор экрана ──
  goApp("hw");
  await withKinds([like, cam2, acs, campos, sens, srvK, domK, fldK], async () => {
    ok(screenFor("test.camera-like") === "hand:camera" && screenType("test.camera-like") === "camera", "вид с vms.camera/1 и другим кодом — экран камеры");
    ok(screenFor("test.camera2") === "schema" && isSchemaKind("test.camera2"), "незнакомая старшая версия vms.camera/2 — форма по схеме");
    ok(screenFor("acme.acs") === "schema" && screenFor("acfa_lock") === "hand:acfa_lock" && screenFor("acfa") === "hand:acfa",
      "неоднозначный vms.acs/1 — экран по коду среди своих, чужой код — форма по схеме");
    ok(screenFor("acme.campos") === "hand:camera", "камера и касса — экран камеры: порядок SCREEN_OF_PROFILE");
    ok(screenFor("sensor") === "hand:sensor" && screenFor("acme.sensor") === "schema", "экран без профиля — только по своему коду");
    ok(screenPageStep("camera") === null && screenFor("security_controller/CONTROLLER") === "schema", "ступень 1 до части 05: вид с setupUi — форма по схеме");
    ok(kindText("test.camera-like") === "Камера по профилю" && kindText("camera") === i18n(LB.camera), "подпись вида плагина — из /kinds, встроенного — словарь экрана");
    // Сервер, домен и папка плагина: узел ручного экрана хранит свой вид
    const srvU = (await API.get("/units", { kind: "server", limit: 1 })).items[0];
    const domU = (await API.get("/units", { kind: "domain", limit: 1 })).items[0];
    const fldU = (await API.get("/units", { kind: "folder", limit: 1 })).items[0];
    const asS = Object.assign(await API.get(`/units/${srvU.uid}`), { kind: "acme.srv" });
    const asD = Object.assign(await API.get(`/units/${domU.uid}`), { kind: "acme.dom" });
    const asF = Object.assign(await API.get(`/units/${fldU.uid}`), { kind: "acme.fld" });
    ok(unitNode(asS).type === "server" && nodeKind(unitNode(asS)) === "acme.srv" && nodeKind(unitNode(asD)) === "acme.dom" && nodeKind(unitNode(asF)) === "acme.fld",
      "сервер, домен и папка плагина хранят свой вид");
  });
  // Код camera без vms.camera/1 (vms.camera/2 и пустой implements): форма по схеме, а не экран по коду
  const camU = (await API.get("/units", { kind: "camera", limit: 50 })).items.find((u) => !u.hasChildren) || (await API.get("/units", { kind: "camera", limit: 1 })).items[0];
  const camFull = await API.get(`/units/${camU.uid}`);
  for (const im of [["vms.camera/2"], []]) {
    await withKinds([Object.assign(kindOf("camera"), { implements: im })], async () => {
      ok(screenFor("camera") === "schema" && isSchemaKind("camera") && isSchemaNode(unitNode(camFull)),
        `код camera с implements [${im.join()}] — форма по схеме, а не экран по коду; узел объекта — узел формы по схеме`);
    });
    await withKinds([like, Object.assign(kindOf("camera"), { implements: im })], async () => {
      ok(kindsOfScreen("camera").includes("test.camera-like") && !kindsOfScreen("camera").includes("camera"),
        `виды экрана камеры — без кода camera с implements [${im.join()}]: ` + kindsOfScreen("camera").join());
    });
  }
  // Описаний нет (listKinds не объявлен, /kinds не прочитан): встроенные экраны — по коду, как прежде
  {
    const saved = new Map(KINDS);
    KINDS.clear();
    try {
      ok(screenFor("camera") === "hand:camera" && screenFor("archive.local") === "hand:archive" && screenFor("volume") === "hand:vol" && screenFor("acme.x") === "schema",
        "описаний нет — экран по коду, как прежде");
    } finally {
      saved.forEach((v, k) => KINDS.set(k, v));
    }
  }
  // Ступень 1 не меняет тип узла (С4): страница у вида с ручным экраном оставляет узел ручным
  {
    const was = window.screenPageStep;
    window.screenPageStep = () => "page";
    try {
      ok(screenFor("camera") === "page" && !isSchemaKind("camera") && screenType("camera") === "camera", "своя страница (ступень 1) не меняет тип узла: камера остаётся ручным экраном");
    } finally {
      window.screenPageStep = was;
    }
  }
  // Карточка: камера набора, отданная как test.camera-like, и как test.camera2
  pick(camU.uid, { force: true, tab: "gen" });
  await until(() => sel === camU.uid && !find(camU.uid)?.n._row && !!main().querySelector(".cs-cq"));
  const camTabs = tabsFor(find(camU.uid).n).map((t) => t[0]).join();
  await withKinds([like, cam2], async () => {
    await asKind(camU.uid, "test.camera-like", async () => {
      await reopen(camU.uid);
      const n = find(camU.uid)?.n;
      ok(!!n && tabsFor(n).map((t) => t[0]).join() === camTabs && nodeKind(n) === "test.camera-like" && !!main().querySelector(".cs-cq"),
        "карточка вида с профилем камеры — вкладки и экран камеры: " + (n ? tabsFor(n).map((t) => t[0]).join() : "нет узла"));
    });
    await asKind(camU.uid, "test.camera2", async () => {
      await reopen(camU.uid);
      const n2 = find(camU.uid)?.n;
      ok(isSchemaNode(n2) && !!main().querySelector("[data-schema-card]"), "объект вида vms.camera/2 открывается формой по схеме");
    });
  });
  await reopen(camU.uid);
  ok(!isSchemaNode(find(camU.uid)?.n) && nodeKind(find(camU.uid)?.n) === "camera" && !!main().querySelector(".cs-cq"), "камера снова под своим кодом — экран камеры");

  // ── Г. Профиль снят с вида при открытой карточке ──
  // Открыта карточка камеры с неприменённой правкой; PUT /test/kinds/camera без vms.camera/1 → kinds.changed. Карточка без
  // перезагрузки становится формой по схеме, правка переходит в черновик формы по схеме. Поле, которого в новой схеме нет
  // (короткое имя), консоль называет в уведомлении. Обратный PUT — снова экран камеры
  const camK = kindOf("camera");
  const NEW_IP = "10.77.0.7", NEW_NAME = "Камера после смены вида", NEW_SHORT = "КПС";
  const noCam = Object.assign(clone(camK), { implements: camK.implements.filter((p) => p !== "vms.camera/1") });
  delete noCam.schema.properties.short;
  // Стенд с testSupport меняет описание сам (PUT /test/kinds) и шлёт kinds.changed; без служебных операций новое описание
  // отдаёт перехваченный GET /kinds, событие приходит тем же apiOnEvent (приём ui-access.js)
  let rawW = null;
  const camPut = async (def, tag) => {
    if (rawW) { API.raw = rawW; rawW = null; }
    const put = await API.raw("PUT", "/test/kinds/camera", def);
    if (put.status < 300) return;
    if (def === camK) { apiOnEvent({ type: "kinds.changed", kinds: ["camera"] }); return; }
    rawW = API.raw;
    const real = rawW;
    API.raw = function (method, path, body, headers) {
      if (method !== "GET" || path !== "/kinds") return real.call(this, method, path, body, headers);
      return real.call(this, method, path, body).then((r) => Object.assign({}, r, { status: 200, headers: Object.assign({}, r.headers, { etag: `"${tag}"` }),
        body: Object.assign({}, r.body, { items: r.body.items.map((k) => (k.kind === "camera" ? def : k)) }) }));
    };
    apiOnEvent({ type: "kinds.changed", kinds: ["camera"] });
  };
  // Уведомления живут 2 с: сценарий собирает все, что консоль показала
  const toasts = [];
  const toastTick = setInterval(() => { const t = document.getElementById("tt")?.textContent; if (t && toasts[toasts.length - 1] !== t) toasts.push(t); }, 20);
  const menuText = (n) => { openTreeCtx(n, { x: 10, y: 10 }); const t = document.getElementById("tctx").textContent; closeTreeCtx(); return t; };
  const HAND_MENU = /Добавить детекторы…|Применить настройки к другим…/;
  try {
    ok(HAND_MENU.test(menuText(find(camU.uid).n)), "меню строки камеры — пункты ручного экрана камеры");
    const n0 = find(camU.uid).n;
    n0.ip = NEW_IP;
    n0.name = NEW_NAME;
    n0.short = NEW_SHORT;
    setD(true);
    ok(cardDraft?.id === camU.uid && cardDiff().length >= 3, "черновик камеры: " + cardDiff().map((r) => r.label).join(", "));
    toasts.length = 0;
    await camPut(noCam, "ui-ekran-no-camera");
    const became = await until(() => {
      const n = find(camU.uid)?.n;
      return !!n && isSchemaNode(n) && !n._row && sel === camU.uid && !!main().querySelector("[data-schema-card]");
    });
    const n1 = find(camU.uid)?.n;
    ok(became, "kinds.changed: открытая карточка камеры без перезагрузки стала формой по схеме");
    ok(!!n1 && n1.props?.ip === NEW_IP && n1.name === NEW_NAME && cardDraft?.id === camU.uid && cardDiff().length >= 2,
      "неприменённая правка перенесена в форму по схеме: " + (n1 ? `ip ${n1.props?.ip}, имя «${n1.name}»` : "нет узла"));
    await until(() => toasts.some((t) => /Короткое имя/.test(t)), 3000);
    const note = toasts.find((t) => /Описание вида изменилось/.test(t)) || "";
    ok(/^Описание вида изменилось, поэтому консоль показывает «Камера после смены вида» другим экраном\. Консоль не перенесла изменения полей «Короткое имя», потому что на новом экране этих полей нет\. Остальные изменения консоль перенесла\.$/.test(note),
      "уведомление называет причину и поле, которое консоль не перенесла: «" + (note || toasts.join(" | ")) + "»");
    ok(!HAND_MENU.test(menuText(n1)), "меню строки камеры формы по схеме — без пунктов ручного экрана камеры");
  } finally {
    await camPut(camK);
  }
  const back = await until(() => {
    const n = find(camU.uid)?.n;
    return !!n && !isSchemaNode(n) && n.type === "camera" && !n._row && !!main().querySelector(".cs-cq");
  });
  const n3 = find(camU.uid)?.n;
  ok(back && n3.ip === NEW_IP && n3.name === NEW_NAME, "профиль вернулся — снова экран камеры, правка цела: " + (n3 ? `ip ${n3.ip}` : "нет узла"));
  if (cardDraft) { cardRestore(); gear(); }

  // Полную запись прочитать не удалось: консоль не теряет правку молча, а называет все поля, которые не перенесла
  {
    const realGet = API.get;
    try {
      find(camU.uid).n.ip = NEW_IP;
      setD(true);
      toasts.length = 0;
      API.get = function (path, params) {
        if (path === `/units/${camU.uid}`) return Promise.reject({ status: 503, problem: { code: "SERVER_OFFLINE", message: "нет связи" } });
        return realGet.call(this, path, params);
      };
      await camPut(noCam, "ui-ekran-no-camera-2");
      const seen = await until(() => toasts.some((t) => /Консоль не прочитала/.test(t)));
      const t = toasts.find((x) => /Консоль не прочитала/.test(x)) || toasts.join(" | ");
      ok(seen && /Консоль не перенесла изменения полей «IP»/.test(t) && !/Остальные изменения/.test(t),
        "запись не прочиталась — уведомление называет все поля правки: «" + t + "»");
    } finally {
      API.get = realGet;
      await camPut(camK);
    }
    ok(await until(() => { const n = find(camU.uid)?.n; return !!n && !isSchemaNode(n) && n.type === "camera"; }), "описание камеры вернулось — снова экран камеры");
    if (cardDraft) { cardRestore(); gear(); }
  }
  clearInterval(toastTick);
});
