/* Сценарий интерфейса: добавление серверов одним окном — один вход, один список, без шагов и «Назад», сверка отпечатков и пачкой.
   Пока окно живёт только в прототипе, на страницах без него сценарий ничего не проверяет. */
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

  // Без шагов и «Назад»
  ok(wb().textContent === "Закрыть", "вместо «Назад» — «Закрыть»: " + wb().textContent);
  ok(document.getElementById("wst").style.display === "none", "шагов нет");
  ok(wn().disabled && /\(0\)/.test(wn().textContent), "ничего не выбрано — кнопка погашена: " + wn().textContent);
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
  ok(ipPicked().length === 1 && /\(1\)/.test(wn().textContent), "найденное по адресу отмечено сразу: " + wn().textContent);

  // Сверка отпечатка до приёма
  addProbedServers();
  ok(await until(confirmOpen), "окно сверки открылось");
  ok(document.getElementById("confirmMsg").textContent.includes(net.fingerprint), "окно показывает отпечаток");
  ok(!inDomain(net.id), "до подтверждения не принят");
  await confirmWith(null);
  ok(await until(() => inDomain(net.id)), "принят после сверки");
  ok(await until(() => /Добавлен/.test(document.querySelector(".srv-list").textContent)), "строка осталась с пометкой «Добавлен»");
  ok(wn().disabled, "выбранного больше нет, кнопка погашена");

  // «Закрыть» закрывает
  wb().click();
  ok(!wiz(), "«Закрыть» закрывает окно");

  // Карточка «Нераспределённые»: пачка тоже идёт через сверку
  const pack = d.unallocServers.filter((s) => s.fingerprint && s.cls !== "camera").slice(0, 2).map((s) => s.id);
  ok(pack.length === 2, "в наборе есть два сервера с отпечатком");
  addUnallocServers(pack, d.id);
  ok(await until(confirmOpen), "пачка с карточки идёт через сверку");
  ok(!pack.some(inDomain), "до подтверждения пачка не принята");
  await confirmWith(null);
  ok(await until(() => pack.every(inDomain)), "пачка принята после сверки");
});
