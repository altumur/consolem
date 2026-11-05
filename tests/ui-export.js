/* Сценарии интерфейса: выгрузка записей — удаление задания с отсчётом (задание помечено и закрыто на время отсчёта, один
   DELETE) и выбор камер заказа по профилю vms.camera/1 (вид плагина среди камер). Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until, sleep, confirmWith }) => {
  const cam = devicePool.find((n) => n.type === "camera" && n.online !== false && !!n.name);

  // Удаление выгрузки: на время отсчёта задание помечено в дереве, «Удалить» закрыта, повторный вызов не запускает второй таймер
  const job = await API.post("/exports", { mode: "frame", source: "live", cameras: [{ uid: cam.id }], format: "jpg" });
  goApp("exp");
  await expLoad();
  expSel = job.id;
  paint();
  ok(await until(() => !!expRowOf(job.id) && !!document.querySelector(`#tree [data-go="exp:${job.id}"]`)), "выгрузка видна в дереве «Экспорт»");
  // Задание кадра заканчивается за пару секунд; «Удалить» есть только у законченного
  await until(() => { const x = expRowOf(job.id); return x && x.state !== "queued" && x.state !== "running"; }, 15000);
  await expLoad();
  paint();
  const realDel = API.del, dels = [];
  API.del = function (path, ...rest) {
    if (/^\/exports\//.test(path)) dels.push(path);
    return realDel.call(this, path, ...rest);
  };
  try {
    expDel(job.id);
    ok(!!document.getElementById("confirmCountInp"), "удаление выгрузки спрашивает число");
    await confirmWith(1);
    ok(await until(() => pendingDelHas("exp:" + job.id) && !!document.querySelector(`[id^="ttu-del"]`)), "отсчёт идёт, в тосте «Отменить»");
    ok(!!document.querySelector(`#tree [data-go="exp:${job.id}"] .bd.off`), "на время отсчёта задание помечено в дереве");
    ok(document.querySelector("#main .sc button[disabled]") != null && [...document.querySelectorAll("#main .sc button")].some((b) => b.disabled && /Удалить/.test(b.textContent)), "«Удалить» в карточке закрыта");
    const timers = document.querySelectorAll('[id^="ttu-del"]').length;
    expDel(job.id);
    expDelRun(job.id);
    await sleep(100);
    ok(!document.getElementById("confirmCountInp") || !document.getElementById("confirm")?.classList.contains("open"), "повторное «Удалить» во время отсчёта диалог не открывает");
    ok(document.querySelectorAll('[id^="ttu-del"]').length === timers && dels.length === 0, "второго таймера нет, на сервер пока ничего не ушло");
    commitDelete(pendingOf("exp:" + job.id).key);
    ok(await until(() => !expRowOf(job.id)), "по окончании отсчёта задание удалено");
    await sleep(200);
    ok(dels.length === 1, "ушёл один DELETE: " + dels.join(" "));
    ok(!/не найден|404|NOT_FOUND/i.test(document.getElementById("tt")?.textContent || ""), "тоста об ошибке (404) нет");
  } finally {
    API.del = realDel;
  }

  // Выбор камер заказа — по профилю vms.camera/1: камера вида плагина (не camera) в списке есть, детектор — нет
  const PK = "acme.cam";
  const camKind = (await API.get("/kinds")).items.find((x) => x.kind === "camera");
  const plugKind = Object.assign(JSON.parse(JSON.stringify(camKind)), { kind: PK, label: { key: "kind.acme.cam", text: "Камера Acme", lang: "ru" } });
  const pc = devicePool.find((n) => n.type === "camera" && n.id !== cam.id && !!n.name) || cam;
  const realGet = API.get, asked = [];
  const asPlug = (u) => (u && u.uid === pc.id ? Object.assign({}, u, { kind: PK }) : u);
  API.get = function (path, params) {
    const want = path === "/units" && params && params.kind ? String(params.kind).split(",") : null;
    if (path === "/units") asked.push(Object.assign({}, params));
    const p = want ? Object.assign({}, params, { kind: [...new Set(want.map((k) => (k === PK ? "camera" : k)))].join(",") }) : params;
    return realGet.call(this, path, p).then((r) => {
      if (path === `/units/${pc.id}`) return asPlug(r);
      if (path !== "/units" || !r || !Array.isArray(r.items)) return r;
      return Object.assign({}, r, { items: r.items.map(asPlug).filter((u) => !want || want.includes(u.kind)) });
    });
  };
  try {
    KINDS.set(PK, plugKind);
    kindsApply();
    expSel = "new";
    expD = null;
    paint();
    await until(() => !!expD);
    expPick = null;
    asked.length = 0;
    expCamsPop();
    ok(await until(() => expPick?.rows?.some((r) => r.id === pc.id)), "камера вида плагина с vms.camera/1 — в выборе камер заказа");
    ok(asked.some((q) => q.implements === "vms.camera/1" && !q.kind), "выбор идёт по профилю: GET /units?implements=vms.camera/1");
    ok(expPick.rows.some((r) => r.id === cam.id) || pc.id === cam.id, "камеры известного вида остались в списке");
    expPickClose();
  } finally {
    API.get = realGet;
    KINDS.delete(PK);
    kindsApply();
    if (find(pc.id)) delete find(pc.id).n._kind;
  }

  // Надзор над выгрузкой: поля и supervisor — по выдаче прав, accessSupervision ни при чём. Система без этой возможности,
  // как w2c; выдача прав и проверка заказа подменены, потому что встроенный сервер страницы служебных операций не имеет
  const hadSup = CAPS.features.has("accessSupervision"), getReal = API.get, postReal = API.post, wasRows = expRows;
  let grant = { allowed: true, supervisorRequired: true, passwordRequired: false, privacyForced: false, watermark: false, depthHours: 0, devices: [] };
  let chkErrs = [{ code: "SUPERVISOR_REQUIRED", field: "/supervisor", message: "" }];
  const posted = [];
  CAPS.features.delete("accessSupervision");
  API.get = function (path, ...rest) { return path === "/me/export" ? Promise.resolve(grant) : getReal.call(this, path, ...rest); };
  API.post = function (path, body, ...rest) {
    if (path === "/exports/check") return Promise.resolve({ ok: !chkErrs.length, errors: chkErrs, files: [] });
    if (/retry-failed$/.test(path)) { posted.push(body); return Promise.reject({ problem: { code: "SUPERVISOR_REJECTED", field: "/supervisor", message: "" } }); }
    return postReal.call(this, path, body, ...rest);
  };
  try {
    goApp("exp");
    expOpen({ cams: [cam.id] });
    ok(await until(() => expGrantV === grant && !!expD), "окно читает выдачу прав");
    expRepaint();
    const mainText = () => document.getElementById("main").textContent;
    ok(await until(() => /Логин супервизора/.test(mainText())), "supervisorRequired без accessSupervision — поля супервизора есть");
    ok(await until(() => /Нужно подтверждение супервизора/.test(mainText())), "SUPERVISOR_REQUIRED — своё слово, а не «пароль неверен»");
    ok(!("supervisor" in expBody(expD)), "ничего не введено — supervisor в теле нет");
    expD.supLogin = "boss"; expD.supPwd = "x";
    const sent = expBody(expD).supervisor;
    ok(sent && sent.login === "boss" && sent.password === "x", "введено — supervisor в теле, без accessSupervision");
    expD.supLogin = ""; expD.supPwd = "";

    // Выдача прав устарела: надзора в ней нет, а сервер спрашивает супервизора — поля открываются
    grant = Object.assign({}, grant, { supervisorRequired: false });
    expOpen({ cams: [cam.id] });
    await until(() => expGrantV === grant);
    await expCheckRound();
    ok(await until(() => /Логин супервизора/.test(mainText())), "SUPERVISOR_REQUIRED при старой выдаче прав открывает поля");
    chkErrs = [];
    await expCheckRound();
    ok(/Логин супервизора/.test(mainText()), "поля не пропадают, когда отказ ушёл");
    expOpen({ cams: [cam.id] });
    await until(() => expGrantV === grant);
    await expCheckRound();
    ok(!/Логин супервизора/.test(mainText()), "без надзора и без отказа полей нет");

    // Маска, которую система не делает: отказ есть, пароль не просим
    const pf = (EXP_REF?.formats || []).find((f) => f.kind === "video" && f.password && f.password !== "none");
    if (pf && can("feature:exportPassword")) {
      expD.format = pf.id;
      grant = Object.assign({}, grant, { passwordRequired: true });
      expGrantV = grant;
      expRepaint();
      ok(!!document.querySelector("[data-exp-pass]"), "пароль по политике — поле есть");
      const msg = "Маскирования нет, а маска обязательна";
      grant = Object.assign({}, grant, { privacyForced: true, refusal: msg });
      expGrantV = grant;
      expRepaint();
      ok(!document.querySelector("[data-exp-pass]"), "privacyForced и refusal — пароль не просим");
      ok(mainText().includes(msg), "текст отказа виден");
      ok(expErrText({ code: "PERMISSION_DENIED", field: "/cameras/0", params: { reason: "privacy" } }) === msg, "reason: privacy — текст refusal, а не «нет права»");
    }

    // Повтор под надзором спрашивает супервизора и шлёт его в теле
    grant = Object.assign({}, grant, { supervisorRequired: true, passwordRequired: false, privacyForced: false, refusal: undefined });
    expGrantV = grant;
    const rid = "exp-retry-check";
    expRows = [{ id: rid, state: "failed", parts: [], files: [], enforced: {}, request: {} }].concat(expRows || []);
    const supInput = () => document.getElementById("expRetrySupLogin");
    await expRetry(rid);
    ok(!!supInput() && !!document.getElementById("expRetrySupPwd"), "повтор спрашивает супервизора");
    ok(!document.getElementById("expRetryPw"), "пароль выгрузки не нужен — его не спрашивает");
    if (supInput()) {
      supInput().value = "boss"; document.getElementById("expRetrySupPwd").value = "x";
      document.getElementById("confirmOk").click();
      ok(await until(() => posted.length === 1), "повтор отправлен");
      ok(posted[0]?.supervisor?.login === "boss" && posted[0]?.supervisor?.password === "x", "supervisor в теле повтора");
      ok(await until(() => !!supInput() && !supInput().value), "сервер отказал — поля спрошены снова, пустые");
      document.getElementById("confirmCancel").click();
    }
    // Выдача прав молчит о надзоре, а сервер отказывает: повтор уходит без полей, по отказу поля открываются
    grant = Object.assign({}, grant, { supervisorRequired: false });
    posted.length = 0;
    await expRetry(rid);
    ok(await until(() => posted.length === 1), "выдача прав без надзора — повтор сразу");
    ok(!posted[0]?.supervisor, "supervisor в теле нет");
    ok(await until(() => !!supInput()), "отказ по /supervisor открывает поля");
    if (supInput()) document.getElementById("confirmCancel").click();
    // Половина ввода не уходит на проверку
    expOpen({ cams: [cam.id] });
    expD.supLogin = "boss";
    ok(!("supervisor" in expBody(expD)), "только логин — supervisor в теле нет");
    expD.supLogin = "";
  } finally {
    API.get = getReal;
    API.post = postReal;
    expRows = wasRows;
    expD = null;
    expChk = null;
    if (hadSup) CAPS.features.add("accessSupervision");
    await expGrantLoad();
  }

  async function expCheckRound() {
    expCheckSoon();
    await sleep(700);
    expRepaint();
  }
});
