/* Сценарий прототипа 14: «Папки» меняются только от нажатия, статус переживает смену среза, «Найдено» считает показанное,
   службы видны и в раскладке по папкам. Имя не ui-*: на index.html этого поведения нет. При переносе — tests/ui-papki.js.
   Запуск — python3 tools/check_ui.py --page index_14_papki-tolko-vruchnuyu.html tests/proto14-papki.js */
UiCheck(async ({ ok, until, sleep }) => {
  const btn = () => document.getElementById("viewBtn");
  const on = () => btn().getAttribute("aria-checked") === "true";
  const click = (s) => document.querySelector(`#aside [data-slice="${s}"]`).click();
  const settle = async () => { await until(() => !fs || (fs.done && !fs.busy)); await sleep(50); };
  const hint = () => document.getElementById("filtHint").textContent;
  const treeRows = () => [...document.querySelectorAll("#tree .n[data-pick]")];
  const svcGroups = () => [...document.querySelectorAll('#tree .n[data-tid^="svcs:"]')];
  const shownObjects = () => new Set(treeRows().map((e) => find(e.dataset.pick)?.n).filter((n) => n && (slice === "det" ? n.type === "det" : selfOrDet(n))).map((n) => n.id)).size;

  // Старт и выбор среза
  ok(slice === "all" && group() === "folder" && on(), "при старте папки включены");
  ok(btn().getAttribute("role") === "switch" && btn().querySelector(".sw.on"), "«Папки» — переключатель");
  ok(!btn().closest('[aria-label="' + i18n("Срез дерева") + '"]'), "переключатель не среди срезов");
  for (const s of ["det", "cam", "acfa", "all"]) { click(s); ok(slice === s && on(), `срез ${s} не меняет включённые «Папки»`); }
  click("det");
  btn().click();
  ok(!on() && group() === "server", "выключили в «Детекторах»");
  for (const s of ["cam", "acfa", "all", "det"]) { click(s); ok(!on(), `срез ${s}: выключенные «Папки» не включились`); }
  btn().click();
  ok(on(), "включили обратно");

  // Серверы и Хранилища: папок нет, срез кнопка не переключает, состояние ждёт возврата
  for (const s of ["srv", "arch"]) {
    click(s);
    ok(btn().disabled && !on() && btn().title === i18n("В этом срезе нет папок"), `срез ${s}: кнопка неактивна и говорит почему`);
    btn().click();
    ok(slice === s, `срез ${s}: нажатие не сменило срез`);
  }
  click("cam");
  ok(on() && !btn().disabled, "вернулись — «Папки» снова включены");

  // Статус сохраняется, типы снимаются
  pickStatus("nosignal");
  for (const s of ["all", "cam", "acfa", "srv", "arch", "det"]) {
    click(s);
    ok(curStatus() === "nosignal" && /Нет сигнала|Нет связи/.test(document.querySelector(".ph-status-label").textContent), `срез ${s}: статус сохранён`);
  }
  click("cam");
  typeFilts.add("camera");
  click("acfa");
  ok(!typeFilts.size && curStatus() === "nosignal", "типы сняты, статус на месте");

  // «Найдено» — то, что показано в срезе
  for (const status of ["nosignal", "run"]) {
    pickStatus(status);
    for (const s of ["all", "cam", "acfa", "srv", "arch", "det"]) {
      click(s);
      await settle();
      const n = Number((/Найдено: (\d+)/.exec(hint()) || [])[1]);
      ok(n === shownObjects(), `${status}, срез ${s}: «Найдено» ${n}, в дереве ${shownObjects()}`);
    }
  }
  pickStatus("");
  click("all");
  await settle();
  ok(hint() === "", "без фильтра подсказки нет");

  // Очистка поиска убирает прежний счёт
  setTreeQ("Экспорт");
  await settle();
  ok(/Найдено: [1-9]/.test(hint()) && shownObjects() > 0, "поиск находит службы при включённых папках: " + hint());
  setTreeQ("");
  await settle();
  ok(hint() === "", "после очистки поиска «Найдено» нет");

  // Группа «Службы»
  ok(svcGroups().length === domains.length, "у каждого домена группа «Службы»");
  svcGroups()[0].click();
  ok(await until(() => treeRows().some((e) => SVC_TYPES.has(find(e.dataset.pick)?.n.type))), "группа раскрывается по клику");
  const svcId = treeRows().find((e) => SVC_TYPES.has(find(e.dataset.pick)?.n.type)).dataset.pick;
  for (const s of ["cam", "acfa", "det"]) { click(s); ok(!svcGroups().length, `срез ${s}: группы нет`); }
  click("all");
  setGroup("server");
  ok(!svcGroups().length, "в раскладке по серверам группы нет");
  setGroup("folder");

  // Переход не трогает «Папки» без нужды, а когда нужно — шапка показывает правду
  jumpToNode(find(svcId).n);
  ok(on() && !!treeRowOf(svcId), "переход к службе: «Папки» включены, строка на месте");
  const srvNode = domains[0].servers[0];
  jumpToNode(srvNode);
  await settle();
  ok(group() === "server" && !on(), "переход к серверу выключает: в папках его строки нет, шапка это показывает");
  const fold = domainFolders(domains[0].id)[0];
  jumpToNode(fold);
  await settle();
  ok(group() === "folder" && on(), "переход к папке включает, шапка это показывает");

  // Избранное не меняет раскладку, если объект виден и так
  const cam = devicePool.find((n) => n.type === "camera" && cameraTreeServer(n.id));
  toggleFav(cam.id, null);
  const i = favs.findIndex((f) => f.id === cam.id);
  ok(favs[i]?.group === "folder", "избранное сохранено в раскладке по папкам");
  setSlice(favs[i].slice);
  setGroup("server");
  goFav(i);
  await settle();
  ok(group() === "server" && !on() && !!treeRowOf(cam.id), "избранное открылось, раскладка прежняя");
  toggleFav(cam.id, null);

  // Нет связи с доменом: строка есть в обеих раскладках
  const d = domains[0];
  open.add(d.id);
  d.online = false;
  for (const g of ["server", "folder"]) {
    setSlice("all");
    setGroup(g);
    renderTree();
    ok(/показано только своё/.test(document.getElementById("tree").textContent), `${g}: нет связи с доменом — строка в дереве`);
  }
  d.online = true;
});
