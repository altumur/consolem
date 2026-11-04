/* Сценарий интерфейса: кэш неполный, дерево и поиск по запросу на обычном наборе. Без дочитывания: так форма работает всегда. */
window.UI_RAW_CACHE = true;
UiCheck(async ({ ok, until, confirmWith }) => {
  const d = domains[0];
  const pool0 = devicePool.length;
  const all = (await uiUnitsAll()).filter(uiIsDevice).length;
  await until(() => !!streamClient);
  ok(pool0 < all, `кэш неполный: ${pool0} из ${all}`);
  ok(/≈/.test(document.querySelector('#aside [data-slice="all"] .ph-cnt')?.textContent || ""), "число без фильтра — со знаком ≈");
  ok(treeBr.has(treeLayout() + "|" + d.id), "открытый домен прочитан");
  // Сервер раскрывается по запросу, версия в кэше — из строки
  setGroup("server");
  const s =d.servers.find((x) => !treeBr.has("servers|" + x.id));
  open.add(s.id);
  renderTree();
  ok(await until(() => treeBr.get("servers|" + s.id)?.done), "ветка сервера прочитана");
  const row = devicePool.find((n) => n.srvId === s.id && n._row);
  // Строка — краткий объект (UnitBrief): подробностей записи (логин, поток) нет, и поля x-search (ip, модель) строка ручного экрана
  // не берёт из brief — как строка перечня в базе; они приходят с полной записью (сверка экранов с базой, tools/compare_screens.py)
  ok(!!row && !row.ip && !row.user && !row.rtspUrl && hwVer.has(row.id), "в кэше строка без подробностей: " + JSON.stringify(row && { ip: row.ip, user: row.user }));
  // Карточка: загрузка, затем полная запись
  pick(row.id, { force: true });
  ok(/Загрузка/.test(document.getElementById("main").textContent), "карточка показывает загрузку");
  ok(await until(() => !row._row), "полная запись дочитана по клику");
  ok(await until(() => sel === row.id && document.getElementById("main").textContent.includes(row.name)), "карточка открыта");
  // Вход по чужому id: записи в кэше нет. Как в базе — камера: выбор цели правила (ruleTypesNeed) читает одну страницу по виду,
  // kind= — ограниченный проход, поэтому камеры набора demo в кэше не все (иначе дерево расходится с базой)
  const alien = (await uiDevices()).find((x) => x.type === "camera" && !find(x.id));
  ok(!!alien, "чужая запись есть");
  pick(alien.id, { force: true });
  ok(await until(() => sel === alien.id && !find(alien.id)?.n._row), "вход по чужому id: запись дочитана и открыта");
  // Поиск волнами: на маленьком наборе дошёл до конца — дерево, найденное видно строкой
  setTreeQ(alien.name);
  ok(await until(() => fs && fs.done && !fs.busy), "поиск дошёл до конца");
  ok(!fs.flat && fs.hits.has(alien.id), `дерево, найдено ${fs.hits.size}`);
  ok(await until(() => [...document.querySelectorAll("#tree .n[data-pick]")].some((el) => el.dataset.pick === alien.id)), "найденное — строка дерева");
  ok(/Найдено: \d+/.test(filtHint()), filtHint());
  clearTreeQ();
  ok(fs === null || !filtKeyNow(), "поиск снят");
  // Фильтр по статусу — ИЛИ внутри, тоже волнами
  statusFilts.add("off");
  applyFiltersFromState();
  ok(await until(() => fs && fs.done && !fs.busy), "фильтр дошёл до конца");
  ok([...fs.hits].every((id) => statusIs(find(id).n, "off")), "все выключены");
  statusFilts.clear();
  applyFiltersFromState();
  // Группа «Без записи»: узел строит форма, данные — отбор, число только по загруженному
  const nr = norecId(d.id);
  open.add(nr);
  renderTree();
  ok(await until(() => treeBr.get("servers|" + nr)?.done || treeBr.get("servers|" + nr)?.cursor), "«Без записи» прочитана отбором");
  const nrDone = async () => { while (treeBr.get("servers|" + nr)?.cursor) await treeMore(nr); };
  await nrDone();
  const nrWant = (await uiDevices()).filter((x) => x.type === "camera" && x.domainId === d.id && !x.archiveId && !(x.extraArchives || []).some((e) => e.recordMode !== "none")).length;
  ok(norecList(d.id).length >= nrWant, `в группе ${norecList(d.id).length}, на сервере ${nrWant}`);
  ok(!(await API.get("/units", { kind: "camera", noRecord: "true", domainId: d.id, limit: 1 })).total, "полного числа сервер не даёт");
  // Группа «Без папки»
  setSlice("cam");
  setGroup("folder");
  const nf = nofolderId(d.id);
  open.add(nf);
  renderTree();
  ok(await until(() => treeBr.get("folders|" + nf)?.done || treeBr.get("folders|" + nf)?.cursor), "«Без папки» прочитана отбором");
  // Папка: состав по запросу, правка изменениями
  const f = folders.find((x) => !x.items.length && !treeBr.has("folders|" + x.id) && !x.folders.length);
  open.add(f.id);
  renderTree();
  ok(await until(() => treeBr.get("folders|" + f.id)?.done), "папка прочитана");
  const fIds = await uiFolderIds(f.id);
  ok(f.items.length === fIds.length, `состав папки: ${f.items.length}`);
  const out = fIds[0];
  if (out) {
    await folderChange(f.id, [], [out]);
    ok(!(await uiFolderIds(f.id)).includes(out) && !f.items.includes(out), "убрано изменением, остальное на месте");
    await folderChange(f.id, [out], []);
    ok((await uiFolderIds(f.id)).length === fIds.length, "возвращено");
    // В базе — одиночный запрос POST /folders/{id}/devices (single); в ядре — операция с шагом folders этого объекта
    const lastOp = (await API.get("/operations", { limit: 1 })).items[0];
    ok(lastOp.state === "done" && (lastOp.items || []).some((x) => x.targetId === out && x.state === "ok"), "операция записана: шаг folders одной операцией");
    // Всё или ничего, как база одним POST /folders/{id}/devices: объект без возможности folders (поток) отклоняет всю
    // операцию — не добавлен и прошедший бы шаг камеры, кэш папки прежний. Быстрая запись — одним запросом, без опроса
    const cam = devicePool.find((n) => n.type === "camera" && !f.items.includes(n.id) && !fIds.includes(n.id));
    const st = (await API.get("/units", { implements: "vms.stream/1", limit: 1 })).items[0];
    window.CONSOLEM_TRACE = [];
    let err = null;
    await folderChange(f.id, [cam.id, st.uid], []).catch((e) => (err = e));
    const opPosts = CONSOLEM_TRACE.filter((t) => t.method === "POST" && t.path === "/operations").length;
    const opPolls = CONSOLEM_TRACE.filter((t) => t.method === "GET" && /^\/operations\//.test(t.path)).length;
    const fNow = await uiFolderIds(f.id);
    ok(opPosts === 1 && err?.status === 422 && !f.items.includes(cam.id) && !f.items.includes(st.uid) && !fNow.includes(cam.id) && !fNow.includes(st.uid),
      `отказ всей операции: ничего не применено, кэш папки прежний (${err?.status} ${err?.problem?.code}), одна операция`);
    // Несуществующий объект не отбрасывается молча: отказ всей операции, состав прежний
    err = null;
    await folderChange(f.id, [cam.id, "00000000-dead-4000-8000-000000000000"], []).catch((e) => (err = e));
    ok(err?.status >= 400 && err.status < 500 && !(await uiFolderIds(f.id)).includes(cam.id) && !f.items.includes(cam.id), `несуществующий объект — отказ всей операции (${err?.status} ${err?.problem?.code})`);
    CONSOLEM_TRACE.length = 0;
    await folderChange(f.id, [cam.id], []);
    ok(f.items.includes(cam.id) && !CONSOLEM_TRACE.some((t) => t.method === "GET" && /^\/operations\//.test(t.path)) && !opPolls, "быстрая запись — итогом в ответе, без опроса операции");
    delete window.CONSOLEM_TRACE;
    await folderChange(f.id, [], [cam.id]);
  }
  // Поиск в раскладке «папки»: найденное в нечитанной папке встаёт под свою папку. TreePathStep.kind — код вида (camera…),
  // а не прежнее device: объект шага после папки — любой не инфраструктурный
  let f2 = null, m = null;
  for (const x of flatFolders().filter((y) => !treeBr.has("folders|" + y.id) && y.id !== f.id)) {
    const inside = (await uiFolderIds(x.id)).filter((id) => !x.items.includes(id));
    if (inside.length) { f2 = x; m = inside[0]; break; }
  }
  if (f2) {
    setTreeQ(m);
    ok(await until(() => fs && fs.done && !fs.busy) && fs.hits.has(m), "поиск в раскладке «папки» нашёл объект");
    ok(f2.items.includes(m) && folderDeviceNodes(f2).some((n) => n.id === m) && foldersOfDevice(m).some((x) => x.id === f2.id) &&
      await until(() => !!document.querySelector(`#tree .n[data-pick="${m}"]`)),
      "найденное в нечитанной папке — под своей папкой (f.items), строка в дереве");
    clearTreeQ();
  } else ok(false, "нет нечитанной папки с объектом");
  // Откат папки — словом, запрет запроса 11 п. 23 остаётся
  ok(problemText({ problem: { code: "NOT_SUPPORTED", params: { reason: "folders" } } }) === "папки вне отката: состав папки не возвращается", "слово шага понятно человеку");
  setSlice("all");
  setGroup("server");
  // Поток: наблюдаемое — раскрытые ветки и карточка, не больше watchMax
  ok(await until(() => streamClient && watchLast.includes(sel)), "карточка наблюдается");
  ok(watchIds().length <= LIM.watchMax, "не больше watchMax");
  // tree.changed: ветка вне наблюдения перечитается при раскрытии
  const closed = d.servers.find((x) => treeBr.has("servers|" + x.id) && x.id !== sel);
  treeChanged({ layout: "servers", parentIds: [closed.id] });
  ok(await until(() => treeBr.get("servers|" + closed.id)?.done), "изменённая ветка перечитана");
  // Итог домена на карточке
  pick(d.id, { force: true });
  ok(await until(() => /без связи/.test(document.getElementById("domSummary")?.textContent || "")), "итог домена со временем: " + document.getElementById("domSummary")?.textContent);
  // Предел выбора рядом со счётчиком
  setSelMode(true);
  ok(/\d/.test(String(LIM.selectMax)), "предел из reference.limits: " + LIM.selectMax);
  renderTree();
  setSelMode(false);
  // Нет связи с доменом: плашка, чужое не удалено
  d.online = false;
  pick(d.id, { force: true });
  ok(await until(() => /показано только своё/.test(document.getElementById("domLost")?.textContent || "")), "плашка на домене");
  ok(/показано только своё/.test(document.getElementById("tree").textContent), "строка в дереве");
  ok(!refBroken(alien.id) || find(alien.id), "цели правил не считаются удалёнными");
  d.online = true;
  // Разделы читают своё при заходе
  ok(!logLoaded && !licLoaded, "журнал и лицензии при старте не читались");
  goApp("log");
  ok(await until(() => LOG_ROWS.length > 0), "журнал — при заходе");
  goApp("acc");
  ok(await until(() => accUsersAll().length > 0), "люди — при заходе");
  goApp("hw");

  // Поиск в шапке спрашивает у сервера только устройства, как /devices базы: хранилища и тома не занимают 20 мест
  window.CONSOLEM_TRACE = [];
  goNetQ = "";
  document.getElementById("gq").value = "Хранилище";
  document.getElementById("gopop").classList.add("open");
  goSearch("Хранилище");
  const goText = () => document.getElementById("goList")?.textContent || "";
  ok(await until(() => /Встроенное хранилище/.test(goText())), "поиск в шапке находит встроенные хранилища: " + goText().slice(0, 80));
  const netAsk = CONSOLEM_TRACE.find((t) => t.method === "GET" && /^\/units\?/.test(t.path) && /[?&]q=/.test(t.path));
  const asked = netAsk ? (new URLSearchParams(netAsk.path.split("?")[1]).get("kind") || "").split(",") : [];
  ok(asked.length > 0 && !asked.some((k) => INFRA_SCREENS.has(screenType(k))), "запрос — только виды устройств: " + (netAsk?.path || "нет запроса").slice(0, 80));
  delete window.CONSOLEM_TRACE;
});
function accUsersAll() { return accSt().users; }
