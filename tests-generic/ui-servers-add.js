/* Сценарий интерфейса: добавление серверов одним окном — один вход, один список, два шага («Какие серверы», «Проверка»),
   сверка отпечатков и пачкой. На страницах без окна сценарий ничего не проверяет. */
UiCheck(async ({ ok, until, confirmWith }) => {
  if (typeof openAddServers !== "function") {
    ok(true, "на этой странице окна ещё нет");
    return;
  }
  const d = domains[0];
  const wiz = () => document.getElementById("wiz").classList.contains("open");
  const wb = () => document.getElementById("wb");
  const wn = () => document.getElementById("wn");
  const title = () => document.getElementById("wizT").textContent;
  const confirmOpen = () => document.getElementById("confirm").classList.contains("open");
  const inDomain = (id) => d.servers.some((s) => s.id === id);
  goApp("hw");
  pick(d.id);

  // Один вход
  const split = addSplitItems(d).map(([l]) => l);
  ok(split.includes("Серверы…") && !split.some((l) => /по IP/.test(l)), "в меню домена один пункт: " + split.join(", "));
  const before = sel;
  openFindServerByIp(d.id);
  ok(wiz() && title() === "Добавить серверы", "«Найти по адресу» открывает то же окно: " + title());
  ok(sel === before, "окно не уводит карточку под собой");
  closeWizard();
  openAddServers(d.id);
  ok(wiz() && title() === "Добавить серверы", "вход «Добавить серверы»: " + title());
  ok(d.unallocServers.length > 0 && !!document.getElementById("wizIps") && !!document.querySelector(".srv-list .it"), "поле адресов и список — в одном окне");

  // Два шага: на первом «Назад» нет, «Далее» погашена, пока ничего не выбрано
  ok(getComputedStyle(wb()).display === "none", "на первом шаге «Назад» скрыта");
  ok(document.getElementById("wst").style.display !== "none" && /Какие серверы/.test(document.getElementById("wst").textContent) && /Проверка/.test(document.getElementById("wst").textContent), "шаги «Какие серверы» и «Проверка» видны");
  ok(wn().disabled && wn().textContent === "Далее", "ничего не выбрано — «Далее» погашена: " + wn().textContent);
  ok(document.getElementById("wizFoot").textContent.includes(d.name), "видно, в какой домен");

  // Опрос: результат в том же списке, поле не очищается, нераспознанное — под полем
  const net = d.unallocServers.find((s) => s.fingerprint && s.cls !== "camera");
  const typed = net.ip + ", не-адрес";
  const field = document.getElementById("wizIps");
  field.value = typed;
  ipTextSet(field);
  runIpProbe();
  ok(await until(() => wizd.ipRows?.length === 1 && !wizd.ipBusy), "адрес опрошен");
  ok(document.getElementById("wizIps").value === typed, "поле адресов не очищается");
  ok(/не-адрес/.test(document.querySelector(".srv-bad")?.textContent || ""), "нераспознанное — под полем");

  // Один сервер — одна строка
  ok(srvRows().filter((r) => r.serverId === net.id).length === 1, "сервер из сети, найденный и по адресу, — одна строка");
  ok(document.querySelector(".srv-list").textContent.includes(net.name), "строка опроса названа именем сервера");
  ok(ipPicked().length === 1 && !wn().disabled && /Выбрано 1/.test(document.getElementById("wizFoot").textContent), "найденное по адресу отмечено сразу, «Далее» доступна: " + document.getElementById("wizFoot").textContent);

  // Сверка отпечатка до приёма
  wn().click();
  ok(wizd.srvStep === 1 && wn().textContent === "Добавить 1 сервер" && getComputedStyle(wb()).display !== "none", "«Далее» ведёт к проверке: кнопка «Добавить 1 сервер», есть «Назад»: " + wn().textContent);
  ok(document.querySelector("#wbd .bk-table")?.textContent.includes(net.name), "на шаге «Проверка» сервер назван в таблице");
  ok(!inDomain(net.id), "на шаге «Проверка» ещё не принят");
  wn().click();
  ok(await until(confirmOpen), "окно сверки открылось");
  ok(document.getElementById("confirmMsg").textContent.includes(net.fingerprint), "окно показывает отпечаток");
  ok(!inDomain(net.id), "до подтверждения не принят");
  await confirmWith(null);
  ok(await until(() => inDomain(net.id)), "принят после сверки");
  ok(await until(() => /Добавлен/.test(document.querySelector(".srv-list").textContent)), "строка осталась с пометкой «Добавлен»");
  ok(wn().disabled, "выбранного больше нет, кнопка погашена");

  // «Закрыть» в заголовке закрывает
  document.querySelector('#wizTools button[aria-label="Закрыть"]').click();
  ok(!wiz(), "«Закрыть» закрывает окно");

  // Карточка «Нераспределённые»: пачка тоже идёт через сверку
  const pack = d.unallocServers.filter((s) => s.fingerprint && s.cls !== "camera").slice(0, 2).map((s) => s.id);
  ok(pack.length === 2, "в наборе есть два сервера с отпечатком");
  addUnallocServers(pack, d.id);
  ok(await until(confirmOpen), "пачка с карточки идёт через сверку");
  ok(!pack.some(inDomain), "до подтверждения пачка не принята");
  await confirmWith(null);
  ok(await until(() => pack.every(inDomain)), "пачка принята после сверки");

  // Группа в дереве («Добавить в домен»): тоже через сверку
  const group = d.unallocServers.filter((s) => s.fingerprint && s.cls !== "camera").slice(0, 2).map((s) => s.id);
  ok(group.length === 2, "для группы есть два сервера с отпечатком");
  treeSel.clear();
  group.forEach((id) => treeSel.add(id));
  bulkAddToDomain(d.id);
  ok(await until(confirmOpen), "группа из дерева идёт через сверку");
  ok(!group.some(inDomain), "до подтверждения группа не принята");
  await confirmWith(null);
  ok(await until(() => group.every(inDomain)), "группа принята после сверки");
  treeSel.clear();

  // Второй Enter во время опроса не запускает второй опрос
  const net2 = d.unallocServers.find((s) => s.fingerprint);
  const probeTo = (text) => {
    const f = document.getElementById("wizIps");
    f.value = text;
    ipTextSet(f);
    runIpProbe();
  };
  const post = API.post;
  const posts = [];
  API.post = function (path, ...rest) {
    posts.push(path);
    return post.call(this, path, ...rest);
  };
  openAddServers(d.id);
  probeTo(net2.ip);
  runIpProbe();
  // Опрос адресов — команда probe вида сервера (POST /kinds/server/actions/probe)
  ok(posts.filter((p) => p === "/kinds/server/actions/probe").length === 1, "пока идёт опрос, второй не запускается");

  // Ответ опроса не попадает в окно, открытое заново
  const old = wizd;
  closeWizard();
  openAddServers(d.id);
  ok(await until(() => !old.ipBusy), "прежний опрос закончился");
  ok(!wizd.ipRows && !wizd.ipPick?.size, "ответ прежнего опроса не попал в новое окно");

  // Фильтр не прячет найденное, старая ошибка строки уходит
  listQ[srvKey()] = "нет такого сервера";
  probeTo(net2.ip);
  ok(await until(() => wizd.ipRows?.length === 1 && !wizd.ipBusy), "адрес опрошен при включённом фильтре");
  ok(!listQ[srvKey()] && srvRows().some((r) => r.serverId === net2.id), "фильтр снят, найденное видно");
  const key = wizd.ipRows[0].key;
  wizd.ipFail = { [key]: "старая ошибка" };
  probeTo(net2.ip);
  ok(await until(() => !wizd.ipBusy), "опрошен снова");
  ok(!wizd.ipFail[key], "новый опрос снимает старую ошибку строки");

  // Сверенным считается только показанный
  addProbedServers(new Set(["чужой"]));
  ok(await until(confirmOpen) && document.getElementById("confirmMsg").textContent.includes(net2.fingerprint), "не показанный отпечаток спрашивается");
  document.getElementById("confirmCancel").click();
  ok(await until(() => !confirmOpen()) && !inDomain(net2.id), "отмена сверки: не принят");

  // Двойное нажатие: один новый сервер, кнопка погашена, пока идёт добавление
  const row = { key: "10.99.0.1:20111", ip: "10.99.0.1", port: 20111, status: "found", added: false };
  wizd.ipRows = [row];
  wizd.ipPick = new Set([row.key]);
  posts.length = 0;
  addProbedServers();
  ok(wizd.ipAdding && wn().disabled, "пока идёт добавление, кнопка погашена");
  addProbedServers();
  ok(await until(() => row.added), "новый адрес добавлен: " + document.querySelector(".srv-list").textContent.slice(0, 80));
  API.post = post;
  // Новый сервер — объект вида server (POST /units)
  ok(posts.filter((p) => p === "/units").length === 1, "двойное нажатие заводит один сервер");
  closeWizard();

  // Под самопроверкой показа нет
  if (/[?&]selftest/.test(location.search)) ok(!document.querySelector(".tour-offer"), "под самопроверкой показа нет");
});
