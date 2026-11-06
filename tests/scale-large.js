/* Стенд большого домена: 250 000 камер, 500 серверов (large) или 1 000 000 камер, 2 000 серверов (xl). Запуск —
   tools/check_scale.py [--fixture xl], страница с ?fixture=large или ?fixture=xl; числа — из stand.large набора.
   Старт формы: не больше 15 запросов, ни одного ответа больше 1 МБ, ни один перечень не прочитан до конца.
   Дальше — то, что оператор делает на таком домене: каждый шаг в тех же пределах ответа. */
window.UI_RAW_CACHE = true;
UiCheck(async ({ ok, until }) => {
  const MB = 1024 * 1024, trace = window.CONSOLEM_TRACE;
  // Числа стенда — из набора страницы: large или xl (тот же large с другими stand.large)
  const FX_NAME = new URLSearchParams(location.search).get("fixture") || "large";
  const L = window.CONSOLEM_FIXTURES[FX_NAME].stand.large;
  const LISTS = /^\/(units|devices|folders|archives|volumes|journal|operations|access\/\w+|tree\/children)(\?|$)/;
  const sizeOk = (from) => trace.slice(from).every((x) => x.bytes <= MB);
  const big = (from) => Math.max(0, ...trace.slice(from).map((x) => x.bytes));
  // Старт
  // Вопросы операторам — шестнадцатый запрос: он отложен за старт и в 15 не входит. Отложен ли на деле, проверено порядком:
  // после последнего чтения дерева, которого старт дожидается. К этому моменту сценарий может и опоздать, поэтому он не считается
  const PROMPTS = "/rule-prompts", startTrace = trace.filter((x) => x.path !== PROMPTS);
  const start = startTrace.length;
  ok(sizeOk(0), `старт: самый большой ответ ${big(0)} байт, не больше 1 МБ`);
  ok(await until(() => trace.some((x) => x.path === PROMPTS && x.status === 200)), "вопросы операторам прочитаны: чтение отложено, а не отключено");
  const treeLast = trace.map((x) => /^\/tree\/children/.test(x.path)).lastIndexOf(true, start);
  ok(trace.findIndex((x) => x.path === PROMPTS) > treeLast, "вопросы читаются после старта, а не в нём");
  // Перечень одного сервера или хранилища — не перечень домена: он ограничен и читается с раскрытой веткой. В ядре это
  // член parentId с профилем хранилища или тома (в базе /archives?serverId=, /volumes?archiveId=). Домены и серверы
  // читаются целиком, как /domains и /servers в базе (их там нет в LISTS): GET /units только по профилям vms.domain/1, vms.server/1
  const unitsQ = (path) => (path.startsWith("/units?") ? new URLSearchParams(path.slice(7)) : null);
  const oneMember = (path) => { const q = unitsQ(path); return !!q && q.has("parentId") && /^vms\.(archive|volume)\/1$/.test(q.get("implements") || ""); };
  const infra = (path) => { const q = unitsQ(path), im = q ? (q.get("implements") || "").split(",") : []; return !!q && [...q.keys()].every((k) => ["implements", "limit", "cursor"].includes(k)) && im.every((p) => p === "vms.domain/1" || p === "vms.server/1") && !!im[0]; };
  // Старт не растёт с объёмом: 15 запросов. Сверх них — только продолжения перечня доменов и серверов (он читается
  // целиком, как /servers базы, страницами по pageMax): на xl 2 001 строка — три страницы вместо одной
  const infraMore = startTrace.filter((x) => infra(x.path) && unitsQ(x.path).has("cursor")).length;
  const infraWant = Math.ceil((L.servers + domains.length) / LIM.pageMax) - 1;
  ok(start - infraMore <= 15 && infraMore === infraWant, `старт: ${start - infraMore} запросов, не больше 15, и ещё ${infraMore} страниц серверов (их ${L.servers}, pageMax ${LIM.pageMax}): ` + startTrace.map((x) => x.path.split("?")[0]).join(" "));
  // Детекторы для среза «Детекторы» база читает на старте (detLoad: /devices?type=det до selectMax строк). В ядре — по профилю
  // vms.detector/1 из индекса вида: на стенде детекторов нет, ответ пуст — это конец пустого перечня, а не перечень домена
  const detEmpty = (x) => { const q = unitsQ(x.path); return !!q && q.get("implements") === "vms.detector/1" && x.empty; };
  const whole = trace.filter((x) => LISTS.test(x.path) && x.method === "GET" && !x.more && !/[?&](serverId|archiveId)=/.test(x.path) && !oneMember(x.path) && !infra(x.path) && !detEmpty(x));
  ok(!whole.length, "старт: ни один перечень не прочитан до конца: " + whole.map((x) => x.path).join(" "));
  ok(!trace.some((x) => /\/discovery|\/journal|\/licenses|\/fires|\/versions|\/access\/users/.test(x.path)), "старт: поиск, журнал, лицензии, история правил и люди не читаются");
  const d = domains[0];
  ok(d.summary && d.summary.total > L.cameras * 0.96 && d.summary.at, `итог домена: всего ${d.summary?.total}, без связи ${d.summary?.offline}`);
  ok(/≈/.test(document.querySelector('#aside [data-slice="all"] .ph-cnt').textContent), "число без фильтра — со знаком ≈: " + document.querySelector('#aside [data-slice="all"] .ph-cnt').textContent);
  ok(d.servers.length === L.servers && devicePool.length < 5000, `кэш неполный: серверов ${d.servers.length}, устройств в кэше ${devicePool.length}`);
  // Камеры-кластеры: под доменом, порядок не алфавитный, строка (в базе версия r<revision>; в ядре у строки и полной
  // записи одна Unit.version — строку отличает _row: полную запись ещё не читали)
  // Раскладка по умолчанию — папки (как база): ветка домена по серверам читается после переключения группировки
  if (group() !== "server") { setGroup("server"); renderTree(); await until(() => treeBr.get("servers|" + d.id)?.cursor || treeBr.get("servers|" + d.id)?.done); }
  const domBranch = treeBr.get("servers|" + d.id);
  ok(domBranch && domBranch.count > L.cameras - L.serverCameras && domBranch.cursor, `под доменом ${domBranch?.count} узлов, прочитана страница`);
  let mark = trace.length;
  let guard = 0;
  // Под доменом сначала серверы, потом камеры-кластеры: страниц — по числу серверов
  while (!devicePool.some((n) => !n.srvId) && guard++ < 5 + Math.ceil(L.servers / 100)) await treeMore(d.id);
  const loose = devicePool.filter((n) => !n.srvId && n.type === "camera");
  ok(loose.length > 0 && loose.every((n) => n._row && hwVer.has(n.id) && n._more), `камеры-кластеры подгружены строкой, версия ${hwVer.get(loose[0]?.id)}, стрелка «может быть»`);
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
  // Поиск волнами: редкое имя, домен просмотрен до конца. Сервер дописывает страницу до limit или бюджета времени
  // (api/README.md, «Страницы ограниченного прохода»): волн в десятки раз меньше, чем по scanPartsMax разделов на запрос
  // (4 096 разделов / 8 = 512), пустых страниц почти нет
  setGroup("server");
  mark = trace.length;
  setTreeQ("Камера 000123");
  ok(await until(() => fs && fs.done, 170000), "поиск дошёл до конца");
  const waves = trace.slice(mark).filter((x) => /^\/(units|devices)\?/.test(x.path));
  const sparseWaves = Math.ceil(4096 / LIM.scanPartsMax), empties = waves.filter((x) => x.empty && x.more).length;
  ok(waves.length * 10 <= sparseWaves && empties * 10 <= sparseWaves && sizeOk(mark), `волн ${waves.length}, пустых страниц с nextCursor ${empties}: в десятки раз меньше ${sparseWaves}`);
  ok(fs.hits.size === 1 && !fs.flat, `найдено ${fs.hits.size}: дошло до конца и до idsMax — дерево`);
  setTreeQ("");
  // Бэкенд вправе страницу не дописывать: пустые страницы с nextCursor подряд законны, форма их выдерживает. Обёртка над
  // API.get — такой бэкенд: перед каждой настоящей страницей поиска две пустые с курсором-заменой, а конец приходит пустой
  // страницей после последней с найденным. Поиск доходит до того же итога
  {
    const realGet = API.get, held = new Map();
    let n = 0, empties = 0;
    const fake = (state) => { const key = `sparse-${++n}`; held.set(key, state); return key; };
    API.get = async (path, params) => {
      if (path !== "/units" || !params || params.q === undefined) return realGet(path, params);
      const st = params.cursor && held.get(params.cursor);
      if (!st) {
        empties++;
        return { items: [], nextCursor: fake({ step: 1, real: params.cursor || null }) };
      }
      held.delete(params.cursor);
      if (st.step === 1) {
        empties++;
        return { items: [], nextCursor: fake({ step: 2, real: st.real }) };
      }
      if (st.step === 3) {
        empties++;
        return { items: [] };
      }
      const r = await realGet(path, Object.assign({}, params, { cursor: st.real || undefined }));
      return r.nextCursor ? r : Object.assign({}, r, { nextCursor: fake({ step: 3 }) });
    };
    try {
      setTreeQ("Камера 000123");
      ok(await until(() => fs && fs.done, 170000), "пустые страницы с nextCursor: поиск дошёл до конца");
      ok(empties >= 3 && fs.hits.size === 1 && !fs.flat && !fs.failed, `пустых страниц ${empties}, найдено ${fs.hits.size}: то же, что без них`);
    } finally {
      API.get = realGet;
      setTreeQ("");
    }
  }
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
  // Топология: граф всегда полный, все серверы и кластеры стенда, запросы только о ретрансляторах
  mark = trace.length;
  pick(d.id, { force: true });
  await until(() => sel === d.id);
  goTab("topo");
  ok(await until(() => G7.relays.get(d.id)?.size > 0), "ретрансляторы прочитаны");
  g7SetLevel(3);
  ok(G7.g.nodes.filter((n) => n.kind === "server").length === L.servers && G7.g.nodes.filter((n) => n.kind === "cluster").length === L.clusters, `топология: ${G7.g.nodes.length} узлов, ${G7.g.edges.length} связей`);
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
  // Перечень домена — GET /units без отбора, сужающего его до ветки или списка (parentId, ids, folderId, serverId, archiveId,
  // ref, q; виртуальные группы noRecord, noFolder, noDetector — ветки дерева): при любом порядке ключей и с kind=/implements=
  // тоже. Не перечень: домены и серверы целиком — infra(), как на старте; первая страница папок, хранилищ и томов — infraPage()
  // (hwRead: 200 строк или конец, без limit — как первая страница /folders, /archives, /volumes в базе)
  const NARROW = ["parentId", "ids", "folderId", "serverId", "archiveId", "ref", "q", "noRecord", "noFolder", "noDetector"];
  const infraPage = (path) => { const q = unitsQ(path), im = q ? (q.get("implements") || "").split(",") : []; return !!q && [...q.keys()].every((k) => ["implements", "cursor"].includes(k)) && !!im[0] && im.every((p) => ["vms.folder/1", "vms.archive/1", "vms.volume/1"].includes(p)); };
  const domainList = (x) => { const q = unitsQ(x.path); return x.method === "GET" && (x.path === "/units" || !!q && !NARROW.some((k) => q.has(k)) && !infra(x.path) && !infraPage(x.path)); };
  const reread = trace.slice(mark).filter((x) => domainList(x) || /\/tree\/children\?layout=\w+$/.test(x.path));
  ok(!reread.length && sizeOk(mark), "stream.reset: весь перечень не читается: " + reread.map((x) => x.path).join(" "));
  ok(Math.abs(devicePool.length - cached) <= 200, `кэш тот же: ${cached} → ${devicePool.length}, запросов ${trace.length - mark}`);
  // Закладка «Просмотр»: только эта камера. Шкала и удержания — страницами, по открытию и по окну, перечней домена нет, таймера нет
  open.add(d.servers[0].id);
  renderTree();
  // Камера этого сервера, а не любая с сервером: в кэше уже есть камеры других серверов из поиска «Камера»
  const underS0 = (n) => n.type === "camera" && n.srvId === d.servers[0].id;
  ok(await until(() => devicePool.some(underS0)), "камера под сервером");
  const rc = devicePool.find(underS0);
  pick(rc.id, { force: true });
  ok(await until(() => !rc._row && sel === rc.id), "её карточка");
  // Ветка сервера, раскрытая выше, читается своими страницами (пустые страницы ограниченного прохода — подряд): «Просмотр»
  // считает свои запросы после её конца, иначе страница ветки попадает в счёт
  const srvBr = () => treeBr.get(treeLayout() + "|" + d.servers[0].id);
  ok(await until(() => !!srvBr() && !srvBr().busy && ![...treeBr.values()].some((b) => b.busy), 20000), "ветка сервера дочитана до «Просмотра»");
  mark = trace.length;
  goTab("view");
  ok(await until(() => lv?.viewOn && !lv.tl.busy && lv.holds), "«Просмотр»: шкала прочитана на большом домене");
  await until(() => lv.noHolder !== undefined);
  // Держатель удержаний — хранилища копий домена по виду (kind+domainId), прежде — по профилю (как /archives?kind=incidents базы — таблица хранилищ), тома — parentId
  const noList = (from) => trace.slice(from).filter((x) => !/^\/((units|devices)\/[^/?]+\/(live|timeline|holds|bookmarks)|(units|devices)\?parentId|journal\?deviceId|units\?implements=vms\.archive%2F1&limit=\d+&domainId=|units\?kind=[\w.%]+&limit=\d+&domainId=|archives\?kind=incidents|volumes\?archiveId)/.test(x.path));
  ok(!noList(mark).length, "«Просмотр»: только двери этой камеры: " + noList(mark).map((x) => x.path).join(" "));
  ok(trace.length - mark <= 8 && sizeOk(mark), `«Просмотр»: открытие — ${trace.length - mark} запросов, самый большой ответ ${big(mark)} байт`);
  const tlRead = () => trace.filter((x) => /\/timeline/.test(x.path)).length;
  const before = tlRead();
  await new Promise((r) => setTimeout(r, 30000));
  ok(tlRead() === before, "шкала не читается по таймеру");
  tlWin("all");
  ok(await until(() => lv.tl.win === "all" && !lv.tl.busy), "окно «Всё»");
  ok(tlRead() === before + 1 && lv.tl.spans.length > 20 && lv.tl.spans.length <= TL_PAGE, `шкала: одно чтение на окно, ${lv.tl.spans.length} спанов на странице`);
  mark = trace.length;
  liveStart();
  ok(await until(() => lv?.sess, 60000), "«Просмотр»: сессия на большом домене");
  ok(trace.length - mark === 1 && !noList(mark).length, `живое: только POST /live, запросов ${trace.length - mark}`);
  liveStop();
  // Удержания страницами: 120 штук, форма читает первую страницу и дочитывает по кнопке
  for (let i = 0; i < 120; i++) await API.post(`/units/${rc.id}/holds`, { from: new Date(16e11 + i * 36e5).toISOString(), to: new Date(16e11 + i * 36e5 + 6e5).toISOString() });
  await new Promise((r) => setTimeout(r, 1000));
  mark = trace.length;
  holdsRead(lv);
  ok(await until(() => lv.holds.length === 50 && lv.holdsNext), "удержания: первая страница, 50 из 120");
  holdsMore();
  ok(await until(() => lv.holds.length === 100), "удержания: вторая страница по кнопке");
  ok(trace.length - mark === 2 && sizeOk(mark), `удержания: ${trace.length - mark} запроса, самый большой ответ ${big(mark)} байт`);
  goTab("gen");
});
