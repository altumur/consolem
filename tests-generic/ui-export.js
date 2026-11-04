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
});
