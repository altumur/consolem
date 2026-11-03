/* Сценарий прототипа 14 на неполном кэше: объект известен только по id, его папок ещё никто не читал — «Папки» от этого не выключаются.
   При переносе — tests/ui-papki-raw.js. Запуск — python3 tools/check_ui.py --page index_14_papki-tolko-vruchnuyu.html tests/proto14-papki-raw.js */
window.UI_RAW_CACHE = true;
UiCheck(async ({ ok, until }) => {
  const on = () => document.getElementById("viewBtn").getAttribute("aria-checked") === "true";
  const onRow = () => document.querySelector("#tree .n.on")?.dataset.pick;
  // Берём заранее: чтение одной записи подтягивает в кэш соседей по папке
  const inFolders = [];
  for (const r of (await API.get("/devices", { limit: 1000, type: "camera" })).items) {
    if (!find(r.id) && (await API.get(`/devices/${r.id}`)).folderIds?.length) inFolders.push(r);
  }
  const a = inFolders[0];

  // Ссылка по id
  ok(inFolders.length > 1, `камер вне кэша, лежащих в папках: ${inFolders.length}`);
  ok(group() === "folder" && on(), "до перехода папки включены");
  pick(a.id, { force: true });
  ok(await until(() => sel === a.id && !find(a.id)?.n._row), "полная запись прочитана");
  ok(await until(() => onRow() === a.id), "строка в папке выбрана");
  ok(group() === "folder" && on(), "«Папки» остались включёнными");

  // Глубокая ссылка просит папки — так и будет
  const b = inFolders.find((r) => !find(r.id) || (find(r.id).n._row && !foldersOfDevice(r.id).length));
  ok(!!b, "есть камера, чьи папки ещё не прочитаны");
  location.hash = `#node=${b.id}&slice=cam&group=folder&tab=gen`;
  applyDeepLink();
  ok(await until(() => sel === b.id && onRow() === b.id), "глубокая ссылка: строка в папке выбрана");
  ok(group() === "folder" && on(), "глубокая ссылка: «Папки» включены");
  location.hash = "";
});
