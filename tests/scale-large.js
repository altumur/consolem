/* Стенд большого домена: 250 000 камер, 500 серверов. Запуск — tools/check_scale.py, страница с ?fixture=large.
   Старт формы: не больше 15 запросов, ни одного ответа больше 1 МБ, ни один перечень не прочитан до конца.
   Дальше — то, что оператор делает на таком домене: каждый шаг в тех же пределах ответа. */
window.UI_RAW_CACHE = true;
UiCheck(async ({ ok, until }) => {
  const MB = 1024 * 1024, trace = window.CONSOLEM_TRACE;
  const LISTS = /^\/(devices|folders|archives|volumes|journal|operations|access\/\w+|tree\/children)(\?|$)/;
  const sizeOk = (from) => trace.slice(from).every((x) => x.bytes <= MB);
  const big = (from) => Math.max(0, ...trace.slice(from).map((x) => x.bytes));
  // Старт
  const start = trace.length;
  ok(start <= 15, `старт: ${start} запросов, не больше 15: ` + trace.map((x) => x.path.split("?")[0]).join(" "));
  ok(sizeOk(0), `старт: самый большой ответ ${big(0)} байт, не больше 1 МБ`);
  // Перечень одного сервера или хранилища — не перечень домена: он ограничен и читается с раскрытой веткой
  const whole = trace.filter((x) => LISTS.test(x.path) && x.method === "GET" && !x.more && !/[?&](serverId|archiveId)=/.test(x.path));
  ok(!whole.length, "старт: ни один перечень не прочитан до конца: " + whole.map((x) => x.path).join(" "));
  ok(!trace.some((x) => /\/discovery|\/journal|\/licenses|\/fires|\/versions|\/access\/users/.test(x.path)), "старт: поиск, журнал, лицензии, история правил и люди не читаются");
  const d = domains[0];
  ok(d.summary && d.summary.total > 240000 && d.summary.at, `итог домена: всего ${d.summary?.total}, без связи ${d.summary?.offline}`);
  ok(/≈/.test(document.querySelector('#aside [data-slice="all"] .ph-cnt').textContent), "число без фильтра — со знаком ≈: " + document.querySelector('#aside [data-slice="all"] .ph-cnt').textContent);
  ok(d.servers.length === 500 && devicePool.length < 5000, `кэш неполный: серверов ${d.servers.length}, устройств в кэше ${devicePool.length}`);
  // Камеры-кластеры: под доменом, порядок не алфавитный, строка r<revision>
  const domBranch = treeBr.get("servers|" + d.id);
  ok(domBranch && domBranch.count > 200000 && domBranch.cursor, `под доменом ${domBranch?.count} узлов, прочитана страница`);
  let mark = trace.length;
  let guard = 0;
  while (!devicePool.some((n) => !n.srvId) && guard++ < 5) await treeMore(d.id);
  const loose = devicePool.filter((n) => !n.srvId && n.type === "camera");
  ok(loose.length > 0 && loose.every((n) => /^r\d+$/.test(hwVer.get(n.id)) && n._more), `камеры-кластеры подгружены, версия ${hwVer.get(loose[0]?.id)}, стрелка «может быть»`);
  const names = loose.map((n) => n.name);
  ok(names.join() !== names.slice().sort().join(), "порядок под доменом — не алфавит");
  ok(sizeOk(mark), "подгрузка: ответы не больше 1 МБ");
  // Раскрытие камеры-кластера может вернуть пусто: стрелка уходит
  const c = loose[0];
  open.add(c.id);
  renderTree();
  ok(await until(() => c._more === false), "раскрытие вернуло пусто, стрелки нет");
  // Карточка: полная запись по клику, версия уже не r
  pick(c.id, { force: true });
  ok(/Загрузка/.test(document.getElementById("main").textContent), "карточка — короткая загрузка");
  ok(await until(() => !c._row && sel === c.id), "полная запись дочитана");
  ok(!/^r\d+$/.test(hwVer.get(c.id)), "версия полной записи — Device.version");
  // Закладка «Просмотр»: только эта камера, ни одного перечня
  mark = trace.length;
  goTab("view");
  liveStart();
  ok(await until(() => lv?.sess, 60000), "«Просмотр»: сессия на большом домене");
  const viewReads = trace.slice(mark).filter((x) => x.path.split("?")[0] !== `/devices/${c.id}/live`);
  ok(trace.length - mark === 1 && !viewReads.length, `«Просмотр»: только POST /live, запросов ${trace.length - mark}: ` + viewReads.map((x) => x.path).join(" "));
  liveStop();
  goTab("gen");
  // Группа «Без записи»: виртуальная, отбор волнами, число только по загруженному
  mark = trace.length;
  const nr = norecId(d.id);
  open.add(nr);
  renderTree();
  ok(await until(() => treeBr.get("servers|" + nr)?.cursor), "«Без записи» открылась отбором noRecord");
  const nrReads = trace.filter((x) => /noRecord=true/.test(x.path));
  ok(nrReads.length >= 1 && nrReads.length <= 15 && nrReads.every((x) => x.bytes <= MB), `«Без записи»: ${nrReads.length} запросов отбора`);
  renderTree();
  const nrRow = document.querySelector(`#tree .n[data-pick="${nr}"] .n-cnt`);
  ok(nrRow && /\+$/.test(nrRow.textContent), "у группы число по загруженному со знаком «+», полного не обещает: " + nrRow?.textContent);
  // «Без папки» — в раскладке «Папки»
  mark = trace.length;
  setGroup("folder");
  const nf = nofolderId(d.id);
  open.add(nf);
  renderTree();
  ok(await until(() => treeBr.get("folders|" + nf)?.cursor), "«Без папки» открылась отбором noFolder");
  ok(trace.slice(mark).some((x) => /noFolder=true/.test(x.path)) && trace.length - mark <= 15 && sizeOk(mark), `«Без папки»: ${trace.length - mark} запросов`);
  const fl = folders[0];
  open.add(fl.id);
  renderTree();
  ok(await until(() => treeBr.get("folders|" + fl.id)?.done || treeBr.get("folders|" + fl.id)?.cursor), "папка читается дверью");
  const inFolder = folderDeviceNodes(fl).map((n) => n.name);
  ok(inFolder.length > 1 && inFolder.join() !== inFolder.slice().sort().join(), "порядок в папке — не алфавит");
  // Поиск волнами: редкое имя, домен просмотрен до конца, пустые страницы законны
  setGroup("server");
  mark = trace.length;
  setTreeQ("Камера 000123");
  ok(await until(() => fs && fs.done, 170000), "поиск дошёл до конца");
  const waves = trace.slice(mark).filter((x) => /^\/devices\?/.test(x.path));
  ok(waves.length > 100 && waves.some((x) => x.empty && x.more) && sizeOk(mark), `волн ${waves.length}, пустые страницы с nextCursor есть`);
  ok(fs.hits.size === 1 && !fs.flat, `найдено ${fs.hits.size}: дошло до конца и до idsMax — дерево`);
  setTreeQ("");
  // Широкий запрос: плоский список страницами с путём в строке
  mark = trace.length;
  setTreeQ("Камера");
  ok(await until(() => fs && fs.hits.size >= 200 && !fs.busy), "широкий запрос набрал страницу и встал");
  ok(fs.flat && !fs.done, "плоский список, поиск не дошёл до конца");
  ok(/Искать дальше/.test(document.getElementById("tree").textContent) && /Ищем дальше/.test(document.getElementById("filtHint")?.textContent || filtHint()), "форма говорит «ищем дальше»: " + filtHint());
  ok(document.querySelector("#tree .n-path")?.textContent.length > 0, "у строки — путь");
  ok(trace.length - mark <= 30 && sizeOk(mark), `широкий запрос: ${trace.length - mark} запросов`);
  // Предел выбора
  selMode = true;
  selectAllFiltered();
  ok(treeSel.size === Math.min(LIM.selectMax, selCandidates().length), `выбор не больше предела: ${treeSel.size}`);
  ok(new RegExp(`из ${LIM.selectMax}`).test(document.getElementById("selBar").textContent), "предел рядом со счётчиком");
  clearTreeSel();
  setSelMode(false);
  setTreeQ("");
  // Разделы с целыми перечнями — по заходу
  mark = trace.length;
  goApp("acc");
  ok(await until(() => accShown && trace.slice(mark).some((x) => x.path.startsWith("/access/users"))), "«Права»: люди читаются при заходе");
  ok(trace.slice(mark).filter((x) => x.path.startsWith("/access/users")).length === 1 && sizeOk(mark), "«Права»: одна страница людей");
  goApp("hw");
  ok(sizeOk(0), `за весь сценарий самый большой ответ ${big(0)} байт`);
  // Топология: граф всегда полный, серверов до 500, запросы только о ретрансляторах
  mark = trace.length;
  pick(d.id, { force: true });
  await until(() => sel === d.id);
  goTab("topo");
  ok(await until(() => G7.relays.get(d.id)?.size > 0), "ретрансляторы прочитаны");
  g7SetLevel(3);
  ok(G7.g.nodes.filter((n) => n.kind === "server").length === 500 && G7.g.nodes.filter((n) => n.kind === "cluster").length === 40, `топология: ${G7.g.nodes.length} узлов, ${G7.g.edges.length} связей`);
  ok(!G7.g.nodes.some((n) => /^cam-/.test(n.name)), "камеры ретранслятора не рисуются");
  ok(trace.length - mark <= 6 && sizeOk(mark), `топология: ${trace.length - mark} запросов, самый большой ответ ${big(mark)} байт`);
  const t0 = performance.now();
  G7.alpha = 1;
  for (let i = 0; i < 20; i++) g7Tick(G7.g);
  const tick = (performance.now() - t0) / 20;
  ok(tick < 33, `кадр g7Tick на ${G7.g.nodes.length} узлах: ${tick.toFixed(1)} мс, не дольше 33`);
  goTab("gen");
  ok(await until(() => G7.raf === 0), "уход останавливает цикл");
  // Перечитывание после потери потока — только кэш
  mark = trace.length;
  const cached = devicePool.length;
  await apiReload();
  ok(!trace.slice(mark).some((x) => /\/devices\?limit=1000|\/tree\/children\?layout=\w+$/.test(x.path)) && sizeOk(mark), "stream.reset: весь перечень не читается");
  ok(Math.abs(devicePool.length - cached) <= 200, `кэш тот же: ${cached} → ${devicePool.length}, запросов ${trace.length - mark}`);
});
