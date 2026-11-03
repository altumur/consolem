/* Прототип 19, раздел «Хранилища»: таблица, дерево, один диалог создания. Запуск — только на прототипе:
   python tools/check_ui.py --page index_19_hranilishcha-tablica.html tests/proto-19-hranilishcha.js
   В общий набор (tests/ui-*.js) сценарий войдёт при переносе в index.html. */
UiCheck(async ({ ok, until }) => {
  const dom = scopedDomains()[0];
  const tree = () => document.getElementById("tree");
  const rowOf = (id) => tree().querySelector(`.n[data-pick="${id}"]`);
  const hd = () => [...document.querySelectorAll(".hd button")].map((b) => b.textContent.trim());
  const dlg = () => document.getElementById("bmBody");
  const menuHas = (n, re) => {
    openTreeCtx(n, { x: 10, y: 10 });
    const has = [...document.querySelectorAll("#tctx button")].some((b) => re.test(b.textContent));
    closeTreeCtx();
    return has;
  };

  // Вход в раздел: сразу таблица, у каждого хранилища виден владелец, сетевые — перед серверами
  goApp("hw");
  setSlice("arch");
  pick(dom.id, { force: true });
  ok(tab === "stor" && document.querySelectorAll(".as-tbl tbody tr").length > 0, "домен: открыта таблица хранилищ");
  ok(document.querySelector(".as-tbl tbody tr td:nth-child(2)")?.textContent.trim().length > 0, "в таблице виден владелец");
  const rows = [...tree().querySelectorAll(".n")];
  const netAt = rows.findIndex((r) => /Сетевые хранилища/.test(r.textContent));
  const srvAt = rows.findIndex((r) => r.dataset.pick && servers.some((s) => s.id === r.dataset.pick));
  ok(netAt >= 0 && netAt < srvAt, "сетевые хранилища стоят перед серверами");

  // Клик по строке не сворачивает, сворачивает стрелка
  ok(open.has(dom.id), "домен раскрыт при входе");
  rowOf(dom.id).click();
  rowOf(dom.id).click();
  ok(open.has(dom.id) && slice === "arch", "клик по строке домена не сворачивает");
  rowOf(dom.id).querySelector(".tw").click();
  ok(!open.has(dom.id), "стрелка сворачивает");
  rowOf(dom.id).querySelector(".tw").click();
  ok(open.has(dom.id), "стрелка раскрывает");
  const owner = dom.servers.find((s) => serverArchives(s.id).length);
  pick(owner.id, { force: true });
  open.add("as:" + owner.id);
  renderTree();
  rowOf(owner.id).click();
  ok(open.has("as:" + owner.id), "клик по выбранному серверу не сворачивает");

  // Значки: сетевое и на диске различаются в дереве и в таблице
  const iconOf = (a) => (archAddr(a) === "disk" ? ".ici-asdisk" : ".ici-asnet");
  const local = serverArchives(owner.id).find((a) => archAddr(a) === "disk");
  ok(!!rowOf(local.id)?.querySelector(".ici-asdisk"), "дерево: хранилище на диске");
  open.add("as:net:" + dom.id);
  renderTree();
  const shared = domainArchives(dom.id)[0];
  ok(!!rowOf(shared.id)?.querySelector(".ici-asnet"), "дерево: сетевое хранилище");
  pick(dom.id, { force: true });
  [...document.querySelectorAll(".as-tbl tbody tr")].slice(0, 3).forEach((tr, i) => ok(!!tr.querySelector(".ici-asdisk,.ici-asnet"), "таблица: значок вида, строка " + i));
  ok(iconOf(local) !== iconOf(shared) && getComputedStyle(rowOf(local.id).querySelector(".ici")).color !== getComputedStyle(rowOf(shared.id).querySelector(".ici")).color, "цвета значков различаются");

  // «Камеры без архива»: внизу дерева, свёрнут, список от сервера
  const top = () => tree().querySelector(".as-norec-top");
  const expected = (await API.get("/devices", { domainId: dom.id, noRecord: true })).items;
  ok(expected.length > 0, "в наборе есть камеры без записи");
  ok(await until(() => top() && archUnlinked(dom.id).length >= expected.length), "пункт появился, камеры прочитаны");
  ok(!open.has(AS_NOREC) && !tree().querySelector(".as-norec-top ~ .n[data-pick]"), "пункт свёрнут");
  ok([...tree().children].pop() === top(), "пункт — последний в дереве");
  top().click();
  ok(open.has(AS_NOREC), "клик раскрывает");
  top().click();
  ok(open.has(AS_NOREC), "второй клик не сворачивает");
  const camRow = tree().querySelector(".as-norec-top ~ .n[data-pick]");
  ok(!!camRow, "камеры видны");
  const camId = camRow.dataset.pick;
  camRow.click();
  ok(await until(() => sel === camId && tab === "rec" && slice === "arch"), "камера открыта на вкладке «Архив», раздел тот же");
  ok(!find(camId).n.arch && !!tree().querySelector(`.n.on[data-pick="${camId}"]`), "у камеры нет хранилища, её строка выбрана");
  top().querySelector(".tw").click();
  ok(!open.has(AS_NOREC), "стрелка сворачивает");
  open.add(AS_NOREC);
  setSlice("cam");
  setSlice("arch");
  ok(!open.has(AS_NOREC), "при входе в раздел снова свёрнут");

  // Кнопка одна на всех объектах раздела
  [dom, owner, local].forEach((n) => {
    pick(n.id, { force: true });
    ok(hd().filter((t) => /Создать хранилище/.test(t)).length === 1, "кнопка в шапке: " + n.type);
    ok(menuHas(n, /Создать хранилище…/), "пункт в меню строки: " + n.type);
  });
  ok(!menuHas(dom, /сетевое хранилище/i), "отдельного пункта для сетевого нет");
  ok(addSplitItems(dom).some(([l]) => l === "Хранилище…") && addSplitItems(owner).some(([l]) => l === "Хранилище…"), "пункт одинаков у домена и сервера");

  // Диалог: контекст подставлен, вид и сервер можно выбрать
  addArchive(dom.id);
  ok(an.domain === dom.id && !an.server && !kindOf(an.kind).serverRequired, "с домена: вид без сервера, весь домен");
  ok(dlg().querySelectorAll(".an-kind").length === refArchKinds.length, "с домена: все виды");
  ok(/Весь домен/.test(dlg().querySelector(".an-srv select").textContent), "с домена: есть «Весь домен»");
  anSet("kind", "local");
  ok(anBlock() === i18n("Выберите сервер") && document.getElementById("anCreate").disabled, "локальному нужен сервер");
  ok(!/Весь домен/.test(dlg().querySelector(".an-srv select").textContent), "у локального нет «Весь домен»");
  ok(/Сначала выберите сервер/.test(dlg().textContent), "диски — после выбора сервера");
  archNewCancel();
  addArchive(owner.id);
  ok(an.server === owner.id && an.kind === "local" && !anBlock(), "с сервера: локальное, сервер подставлен");
  archNewCancel();
  addArchive(shared.id);
  ok(!an.server && an.kind === shared.kind && an.domain === dom.id, "с сетевого: его вид и домен");
  archNewCancel();
  addArchive(local.id);
  ok(an.server === local.server && an.kind === local.kind, "с хранилища на диске: его вид и сервер");
  archNewCancel();

  // После создания раздел тот же, новое выбрано, строка видна и моргает
  const made = async (name) => {
    anSet("name", name, true);
    document.getElementById("anCreate").click();
    return until(() => find(sel)?.n.name === name);
  };
  const landed = async (what, name) => {
    ok(slice === "arch" && app === "hw" && tab === "arch", what + ": раздел и вкладка те же");
    ok(!document.getElementById("bmodal").classList.contains("open"), what + ": окно закрыто");
    ok(!!tree().querySelector(".n.on") && tree().querySelector(".n.on").textContent.includes(name), what + ": строка в дереве выбрана");
    ok(await until(() => document.querySelector("#tree .n.on.acc-flash")), what + ": строка моргает");
  };
  pick(dom.id, { force: true });
  addArchive(dom.id);
  anSet("kind", "local");
  const bare = dom.servers.find((s) => !isUnallocated(s.id) && !serverArchives(s.id).length && serverDisks(s.id).length);
  anSet("server", bare.id);
  ok(!anBlock(), "сервер выбран, создать можно: " + anBlock());
  ok(await made("Проба локальное"), "локальное создано");
  await landed("локальное с домена", "Проба локальное");
  const localMade = find(sel).n;
  ok((await API.get("/archives/" + localMade.id)).serverId === bare.id, "на сервере: владелец — выбранный сервер");

  pick(dom.id, { force: true });
  addArchive(dom.id);
  anSet("disk", "\\\\nas77\\vms", true);
  anSet("user", "vms", true);
  ok(await made("Проба сетевое"), "сетевое создано");
  await landed("сетевое с домена", "Проба сетевое");
  const netMade = find(sel).n;
  const netApi = await API.get("/archives/" + netMade.id);
  ok(!netApi.serverId && netApi.domainId === dom.id, "на сервере: владелец — домен");
  ok(open.has("as:net:" + dom.id), "группа сетевых раскрыта");

  // Том и хранилище без строки в дереве не уводят из раздела
  await until(() => archVols(netMade).length);
  pick(archVols(netMade)[0].id, { force: true });
  ok(slice === "arch", "том: раздел тот же");

  // Переход к владельцу из таблицы моргает
  pick(dom.id, { force: true });
  archTbl.sort = "owner"; archTbl.desc = false; gear();
  const link = document.querySelector(".as-tbl .as-link");
  ok(!!link, "у хранилища сервера владелец — ссылка");
  link.click();
  ok(await until(() => find(sel)?.n.type === "server" && tab === "stor" && slice === "arch"), "переход к серверу: таблица сервера в том же разделе");
  ok(await until(() => document.querySelector("#tree .n.on.acc-flash")), "переход к серверу моргает");
});
