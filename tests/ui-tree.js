/* Сценарий интерфейса: кэш неполный, дерево и поиск по запросу на обычном наборе. Без дочитывания: так форма работает всегда. */
window.UI_RAW_CACHE = true;
UiCheck(async ({ ok, until, confirmWith }) => {
  const d = domains[0];
  const pool0 = devicePool.length;
  const all = (await API.get("/devices", { limit: 1 })).total;
  await until(() => !!streamClient);
  ok(pool0 < all, `кэш неполный: ${pool0} из ${all}`);
  ok(/≈/.test(document.querySelector('#aside [data-slice="all"] .ph-cnt')?.textContent || ""), "число без фильтра — со знаком ≈");
  ok(treeBr.has("servers|" + d.id), "открытый домен прочитан");
  // Сервер раскрывается по запросу, версия в кэше — из строки
  const s = d.servers.find((x) => !treeBr.has("servers|" + x.id));
  open.add(s.id);
  renderTree();
  ok(await until(() => treeBr.get("servers|" + s.id)?.done), "ветка сервера прочитана");
  const row = devicePool.find((n) => n.srvId === s.id && n._row);
  ok(!!row && !row.ip, "в кэше строка без подробностей");
  // Карточка: загрузка, затем полная запись
  pick(row.id, { force: true });
  ok(/Загрузка/.test(document.getElementById("main").textContent), "карточка показывает загрузку");
  ok(await until(() => !row._row), "полная запись дочитана по клику");
  ok(await until(() => sel === row.id && document.getElementById("main").textContent.includes(row.name)), "карточка открыта");
  // Вход по чужому id: записи в кэше нет
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
  ok(!(await API.get("/devices", { noRecord: true, domainId: d.id, limit: 1 })).total, "полного числа сервер не даёт");
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
    ok((await API.get("/operations", { limit: 1 })).items[0].single === true, "операция записана");
  }
  // Откат папки — словом, запрет запроса 11 п. 23 остаётся
  ok(problemText({ problem: { code: "NOT_SUPPORTED", params: { reason: "folders" } } }) === "папки вне отката: состав папки не возвращается", "слово шага понятно человеку");
  setSlice("all");
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
});
function accUsersAll() { return accSt().users; }
