/* Прототип 22, единый мастер создания: окно не закрывается случайно, черновик, отмена, пароль не в браузере, доведение до конца.
   Запуск — только на прототипе:
   python tools/check_ui.py --page index_22_edinyy-master.html tests/proto-22-edinyy-master.js
   В общий набор (tests/ui-*.js) сценарий войдёт при переносе в index.html. */
UiCheck(async ({ ok, until, confirmWith }) => {
  const d = domains[0];
  const wiz = () => document.getElementById("wiz");
  const wizOn = () => wiz().classList.contains("open");
  const wn = () => document.getElementById("wn");
  const draft = (id) => localStorage.getItem("cfg.wz." + id);
  const esc = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const confirmOn = () => document.getElementById("confirm").classList.contains("open");

  // Серверы: окно не закрывается случайно
  goApp("hw");
  pick(d.id);
  openAddServers(d.id);
  ok(wizOn() && document.querySelectorAll("#wst .dc-st").length === 2, "серверы: окно с двумя шагами");
  ok(wn().disabled && /Отметьте/.test(document.getElementById("wizFoot").textContent), "серверы: без выбора «Далее» погашена, причина в итоге");
  ok(document.getElementById("wizFoot").textContent.includes(d.name), "серверы: домен виден и без выбора");
  esc();
  ok(wizOn(), "серверы: Escape не закрывает");
  wiz().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  ok(wizOn(), "серверы: клик мимо окна не закрывает");

  // Черновик: закрыть — сохранить, продолжить — то же место, отмена — спросить и удалить
  const net = d.unallocServers.find((s) => s.fingerprint && s.cls !== "camera");
  const row = () => [...document.querySelectorAll(".srv-list .it")].find((r) => r.textContent.includes(net.ip));
  row().click();
  ok(!wn().disabled, "серверы: с выбором «Далее» работает");
  wn().click();
  ok(wizd.srvStep === 1, "серверы: второй шаг");
  wzClose("srv");
  ok(!wizOn() && !!draft("srv") && !!document.getElementById("wzDock-srv"), "закрыть: окна нет, черновик и док есть");
  document.querySelector("#wzDock-srv .btn.pri").click();
  ok(wizOn() && wizd.srvStep === 1, "продолжить: тот же шаг");
  document.getElementById("wc").click();
  ok(await until(confirmOn), "отмена спрашивает");
  ok(wizOn() && !!draft("srv"), "до ответа окно и черновик на месте");
  document.getElementById("confirmOk").click();
  ok(await until(() => !wizOn()), "отмена закрыла окно");
  ok(!draft("srv") && !document.getElementById("wzDock-srv"), "отмена удалила черновик и док");

  // Серверы до конца: сверка отпечатка, потом окно закрывается
  openAddServers(d.id);
  row().click();
  wn().click();
  ok(wizd.srvStep === 1 && !d.servers.some((s) => s.id === net.id), "шаг «Проверка»: сервер ещё не принят");
  wn().click();
  ok(await until(confirmOn), "окно сверки открылось");
  await confirmWith(null);
  ok(await until(() => d.servers.some((s) => s.id === net.id)), "сервер принят");
  ok(await until(() => !wizOn()), "после успеха окно закрыто");
  ok(!draft("srv"), "после успеха черновика нет");

  // Хранилище до конца
  const owner = servers.find((s) => !isUnallocated(s.id) && s.online !== false);
  const nArch = arch.length;
  addArchive(owner.id);
  const next = () => [...document.querySelectorAll("#bmFoot .btn")].find((b) => /Далее/.test(b.textContent));
  ok(document.querySelectorAll("#bmBody .dc-st").length === 4, "хранилище: четыре шага");
  ok(!document.getElementById("anCreate"), "хранилище: кнопки создания на первом шаге нет");
  for (let i = 0; i < 3; i++) next().click();
  ok(an.step === 3 && !!document.getElementById("anCreate"), "хранилище: последний шаг называет результат");
  document.getElementById("anCreate").click();
  ok(await until(() => arch.length === nArch + 1), "хранилище создано");
  ok(!document.getElementById("bmodal").classList.contains("open") && !draft("arch"), "хранилище: окно закрыто, черновика нет");

  // Пользователь: пароль не попадает в браузер и не возвращается из черновика
  goApp("acc");
  accUserDlgOpen();
  const pwd = "Vr9-секрет-пароль";
  accUdSet("login", "wz-proba");
  accUdSet("pwd", pwd);
  wzSave("accUd");
  ok(!!draft("accUd"), "пользователь: черновик записан");
  ok(!JSON.stringify(localStorage).includes(pwd), "пользователь: пароля нет в localStorage");
  ok(/wz-proba/.test(draft("accUd")), "пользователь: логин в черновике");
  wzCancelQuiet("accUd");

  // Роль: две колонки, тело окна не прокручивается, прокрутка колонки переживает клик
  accWzOpen();
  accWz.name = "Проба";
  accWz.step = 1;
  accWzRender();
  const bd = () => document.getElementById("accWizBd");
  const cols = () => [...bd().querySelectorAll(".wz-col")];
  ok(cols().length === 2 && getComputedStyle(bd()).overflowY === "hidden", "«Права»: две колонки, тело окна не прокручивается");
  ok(/Камеры по папкам/.test(cols()[1].textContent) && /Доступ к функциям/.test(cols()[0].textContent), "«Права»: функции слева, камеры справа");
  ok(getComputedStyle(bd().querySelector(".acc-wz-grp")).overflowY === "visible", "«Права»: у таблицы папок нет своей прокрутки");
  cols()[0].scrollTop = 120;
  const was = cols()[0].scrollTop;
  cols()[0].querySelector("input[type=checkbox]").click();
  ok(cols()[0].scrollTop === was, "«Права»: клик по галочке не сбрасывает прокрутку");
  accWz.step = 2;
  accWz.who = "pick";
  accWzRender();
  ok(cols().length === 2 && !!cols()[1].querySelector("#accWzSel") && !!cols()[0].querySelector("#accWzUl"), "«Кому»: список слева, выбранное справа");
  accWzWho("none");
  ok(!bd().querySelector(".wz-cols") && !document.querySelector("#accWiz .wz-win").classList.contains("wz-split"), "«Пока никому»: одна колонка");
  accWzClose();
  wzCancelQuiet("accWiz");

  // Правило: два шага
  goApp("rules");
  ruleNewOpen();
  ok(document.querySelectorAll("#bmBody .dc-st").length === 2, "правило: два шага");
  ruleNewGo(1);
  ok(rnw.step === 1, "правило: второй шаг");
  closeBulkModal();
});
