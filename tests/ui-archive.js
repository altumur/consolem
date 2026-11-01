/* Сценарии интерфейса: виды хранилищ от сервера, камера и вид, том. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until, confirmWith }) => {
  const main = () => document.getElementById("main");
  const open = (id, t = "arch") => { pick(id, { force: true }); goTab(t); };
  const body = () => document.getElementById("bmBody").textContent;
  const ref = await API.get("/reference");
  const list = (await API.get("/archives")).items;
  const of = (k) => arch.find((a) => a.kind === k);

  // Выбор вида — то, что отдал сервер, с полями этого вида
  const srvFree = servers.find((s) => !isUnallocated(s.id) && s.online !== false && s.id !== of("backup").server && !arch.some((a) => a.kind === "edge" && a.server === s.id) && volDefaults({ kind: "edge", server: s.id, storage: "block", vols: [], name: "x" }));
  addArchive(srvFree.id);
  ref.archiveKinds.forEach((k) => ok(body().includes(i18n(archKindName(k.kind))), "вид в окне: " + k.kind));
  anSet("kind", "edge");
  ok(/Когда писать/.test(body()) && !/Шифрование/.test(body()) && !/Проверить подключение/.test(document.getElementById("bmFoot")?.textContent || ""), "у карты сервера — режим, без шифрования и проверки");
  ok(an.server === srvFree.id && !anBlock(), "сервер подставлен, создать можно: " + anBlock());
  anSet("kind", "local");
  ok(!/Когда писать/.test(body()), "у локального режима нет");
  const keep = refArchKinds;
  refArchKinds = [{ ...keep.find((k) => k.kind === "remote"), address: "bucket" }, keep.find((k) => k.kind === "local")];
  anSet("kind", "remote");
  ok(!body().includes("Облачное") && /Бакет/.test(body()) && !/Путь к папке/.test(body()), "вид remote с адресом bucket: поля бакета, «Облачного» в списке нет");
  closeBulkModal();
  an = null;
  refArchKinds = keep;

  // Создать карту сервера: камеры этого сервера получают строку только для чтения
  addArchive(srvFree.id);
  anSet("kind", "edge");
  anSet("recordMode", "always");
  anSet("name", "Карта — сценарий", true);
  const n0 = arch.length;
  createArchive();
  ok(await until(() => arch.length === n0 + 1), "архив создан");
  const e = arch[arch.length - 1];
  const srvE = await API.get("/archives/" + e.id);
  ok(srvE.kind === "edge" && srvE.recordMode === "always", "на сервере: вид и режим");
  const camE = (await API.get("/devices")).items.find((d) => d.type === "camera" && d.serverId === srvFree.id);
  if (camE) {
    ok(await until(() => find(camE.id).n.archx?.some((x) => x.arch === e.id && x.ro)), "у камеры сервера — строка");
    open(camE.id, "rec");
    ok(!!main().querySelector(`[data-arch-ro="${e.id}"]`), "строка показана только для чтения");
    ok(!main().querySelector(`[data-arch-ro="${e.id}"] select`), "выбора в строке нет");
  }
  // Карточка: режим правится, шифрования нет
  open(e.id);
  ok(!!main().querySelector("[data-arch-mode]") && !/Шифрование томов/.test(main().textContent), "карточка карты сервера: режим, без шифрования");

  // Выбор архива у камеры: вид и режим
  const inc = of("incidents"), bak = of("backup");
  const cam = (await API.get("/devices")).items.find((d) => d.type === "camera" && d.serverId === bak.server && !d.extraArchives && d.archiveId && d.recordMode === "always");
  const c = find(cam.id).n;
  ok(!archChoicesFor(c).includes(bak) && !archChoicesFor(c).includes(inc) && !archChoicesFor(c).includes(of("edge")), "основным резерв, инциденты и карту не выбрать");
  ok(archRowChoices(c).includes(bak) && !archRowChoices(c).includes(inc), "дополнительным — резерв да, инциденты нет");
  open(cam.id, "rec");
  camArchRowAdd(cam.id, bak.id);
  ok(c.archx.some((x) => x.arch === bak.id && x.rec === "backup"), "резерв — сразу с режимом «при сбое»");
  const sel = [...main().querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(locName(bak)))?.querySelectorAll("select")[2];
  ok(sel && [...sel.options].map((o) => o.value).join() === "backup", "в строке резерва других режимов нет");
  const mainSel = main().querySelector("tbody tr")?.querySelectorAll("select")[2];
  ok(mainSel && ![...mainSel.options].some((o) => o.value === "backup"), "у основной записи резерва нет");
  cardApply();
  ok(await until(() => bq && bq.finished), "план выполнен: не ок " + bq?.fail);
  ok((await API.get("/devices/" + cam.id)).extraArchives?.some((x) => x.archiveId === bak.id && x.recordMode === "backup"), "на сервере — строка резерва");

  // Хранилище не принимает записи
  const closed = list.find((a) => a.admits === false && a.kind !== "incidents");
  if (closed) {
    ok(!archChoicesFor(c).some((a) => a.id === closed.id) && !archRowChoices(c).some((a) => a.id === closed.id), "закрытое не предлагается");
    open(closed.id);
    ok(!main().querySelector("[data-arch-admits] .sw.on"), "карточка: не принимает");
  }
  open(inc.id);
  ok(!main().querySelector("[data-arch-admits]") && !!main().querySelector("[data-arch-noadmit]"), "инциденты: переключателя нет, сказано словами");
  const lo = arch.find((a) => a.kind === "local" && a.vols.length && a.server === srvFree.id) || arch.find((a) => a.kind === "local" && a.vols.length);
  open(lo.id);
  archAdmitsToggle(main().querySelector("[data-arch-admits] .sw"), lo.id);
  cardApply();
  ok(await until(() => bq && bq.finished), "план: принимает записи — выключено");
  ok((await API.get("/archives/" + lo.id)).admits === false, "на сервере admits: false");

  // Меньший объём: второе подтверждение
  const vol = arch.flatMap((a) => a.vols).find((x) => x.bytes > 2 * 1024 ** 3 && x.shrink == null && x.mode !== "part" && archAddr(archById(x.archId)) !== "bucket");
  const wasBytes = vol.bytes;
  open(vol.id, "gen");
  volSet(vol.id, "gb", String(Math.round(vol.bytes / 1024 ** 3 / 2)), true);
  cardApply();
  ok(document.getElementById("confirm").classList.contains("open") && /стёрты/.test(document.getElementById("confirmWarn").textContent), "уменьшение спрашивает второй раз");
  await confirmWith(null);
  ok(await until(() => bq && bq.finished), "план выполнен: не ок " + bq?.fail);
  const v2 = await API.get("/volumes/" + vol.id);
  ok(v2.sizeBytes < wasBytes, "на сервере — меньше: " + v2.sizeBytes);
  // Объявленное и не подтверждённое
  const pend = arch.flatMap((a) => a.vols).find((x) => x.shrink != null);
  open(pend.id, "gen");
  ok(!!main().querySelector("[data-vol-shrink]"), "том говорит об ожидании");
  volShrinkConfirm(pend.id);
  await confirmWith(null);
  ok(await until(() => volById(pend.id).shrink == null), "подтверждено");
  ok((await API.get("/volumes/" + pend.id)).shrinkPendingBytes === undefined, "на сервере ожидания нет");
  // Выключить том
  open(pend.id, "gen");
  volEnabledToggle(main().querySelector("[data-vol-enabled] .sw"), pend.id);
  cardApply();
  ok(await until(() => bq && bq.finished), "план выполнен");
  ok((await API.get("/volumes/" + pend.id)).state === "off", "том выключен");
});
