/* Сценарии интерфейса: единый правый клик (прототип 23). Меню браузера внутри макета нет,
   меню содержит только действия того, по чему щёлкнули, поле ввода показывает своё меню.
   На странице без единого правого клика (index.html, пока его не перенесли) сценарий молчит.
   Запуск — tools/check_ui.py --page index_23_pravyy-klik.html tests/ui-rc-menu.js */
UiCheck(async ({ ok, sleep, until }) => {
  if (typeof rcOnContext !== "function") { ok(true, "на этой странице единого правого клика нет"); return; }
  const menuEl = () => document.getElementById("tctx");
  const opened = () => menuEl().classList.contains("open");
  const items = () => opened() ? [...menuEl().querySelectorAll("button")].map(b => b.innerText.replace(/\s+/g, " ").trim()) : [];
  const has = (re) => items().some(t => re.test(t));
  // Правый клик по элементу: true, если страница отменила меню браузера
  const rc = (el, extra = {}) => {
    closeTreeCtx();
    const r = el.getBoundingClientRect();
    return !el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: r.x + 4, clientY: r.y + 4, ...extra }));
  };
  const main = () => document.getElementById("main");
  const aside = () => document.getElementById("aside");
  const dom = domains[0], server = servers.find(s => domainOf(s.id));

  // 1. Меню браузера: нет нигде, кроме Shift
  pick(dom.id); await sleep(150);
  ok(rc(main()), "пустое место карточки: меню браузера отменено");
  ok(rc(document.body), "пустое место страницы: меню браузера отменено");
  ok(!rc(main(), { shiftKey: true }), "Shift + правый клик оставляет меню браузера");
  closeTreeCtx();

  // 2. Пустое место карточки — меню объекта карточки
  rc(main());
  ok(has(/Добавить устройства/) && has(/Удалить домен/), "пустое место карточки домена показывает меню домена");
  // Кнопка: её действие и так на виду
  const btn = main().querySelector("button");
  rc(btn);
  ok(!opened(), "кнопка не открывает меню");

  // 3. Закрытие и граница окна
  rc(main(), { clientX: innerWidth - 2, clientY: innerHeight - 2 });
  const box = menuEl().getBoundingClientRect();
  ok(box.right <= innerWidth && box.bottom <= innerHeight, "меню не выходит за край окна");
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(30);
  ok(!opened(), "Esc закрывает меню");
  rc(main());
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(30);
  ok(!opened(), "клик снаружи закрывает меню");

  // 4. Поле ввода
  const inp = document.createElement("input");
  inp.value = "текст";
  main().appendChild(inp);
  ok(rc(inp), "поле ввода: меню браузера отменено");
  ok(["Вырезать", "Копировать", "Вставить", "Выделить всё"].every(l => has(new RegExp(l))) && items().length === 4, "поле ввода показывает своё короткое меню");
  closeTreeCtx();
  inp.remove();

  // 5. Меню по срезу
  setSlice("det"); await sleep(150);
  rc(aside());
  ok(has(/Добавить детекторы/) && !has(/Создать домен/), "«Детекторы»: пустое место дерева предлагает детекторы, не домен");
  const det = camDetectors(devicePool.find(d => d.type === "camera" && camDetectors(d).length))[0];
  ok(!!det && canTreeCtx(det), "строка детектора: у неё есть меню");
  openTreeCtx(det, { x: 40, y: 40 });
  ok(has(/Удалить/), "строка детектора: в меню есть удаление");
  closeTreeCtx();
  setSlice("arch"); await sleep(150);
  openTreeCtx(server, { x: 40, y: 40 });
  ok(has(/Создать хранилище/) && !has(/Исключить из домена/), "«Хранилища»: у сервера нет «Исключить из домена»");
  closeTreeCtx();
  setSlice("all"); await sleep(150);

  // Выбор таблицы детекторов не действует вне неё
  const dets = devicePool.filter(d => d.type === "camera").flatMap(camDetectors).slice(0, 2);
  dl.sel = new Set(dets.map(d => d.id));
  const row = document.createElement("div");
  row.setAttribute("data-on-click", JSON.stringify([["detFromCam", dets[0].id]]));
  main().appendChild(row);
  rc(row);
  ok(!has(/\(2\)/), "вне таблицы детекторов старый выбор не даёт групповое меню");
  row.remove();
  dl.sel.clear();

  // Строка с несколькими вызовами ведёт к своему объекту, чужой щелчок — не меню карточки
  pick(dom.id); await sleep(100);
  const cam2 = devicePool.find(d => d.type === "camera");
  const link = document.createElement("div");
  link.setAttribute("data-on-click", JSON.stringify([["goApp", "hw"], ["pick", cam2.id]]));
  main().appendChild(link);
  rc(link);
  ok(!has(/Удалить домен/) && opened(), "строка с goApp и pick показывает меню своего объекта, не домена");
  link.remove();
  const own = document.createElement("div");
  own.setAttribute("data-on-click", JSON.stringify([["toast", "x"]]));
  main().appendChild(own);
  rc(own);
  ok(!opened(), "элемент со своим щелчком не открывает меню карточки");
  own.remove();

  // Меню поля поверх окна, Esc закрывает меню, а не окно
  openAddServers(dom.id); await sleep(50);
  const fld = document.querySelector("#wbd input,#wbd textarea");
  rc(fld);
  const mb = menuEl().getBoundingClientRect();
  ok(menuEl().contains(document.elementFromPoint(mb.x + 10, mb.y + 10)), "меню поля видно поверх мастера");
  fld.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(30);
  ok(!opened() && wizOpen(), "Esc закрывает меню поля, мастер остаётся");
  closeWizard(); await sleep(30);

  // 6. Единица СКУД в кнопке добавления, подтверждение числом
  ok(addSplitItems(dom).some(i => /СКУД/.test(i[0])) && addSplitItems(server).some(i => /СКУД/.test(i[0])), "«Единицу СКУД…» в кнопке добавления домена и сервера");
  excludeFromDomain(server.id);
  ok(document.getElementById("confirm").classList.contains("open") && !!document.getElementById("confirmCountInp") && document.getElementById("confirmOk").disabled, "«Исключить из домена»: подтверждение с вводом числа");
  closeConfirm();

  // 7. Все мастера добавления — одного размера
  pick(server.id); await sleep(100);
  const sizes = new Set();
  for (const open of [() => planOpen(), () => openW("svc"), () => openW("unit"), () => openAddServers(dom.id)]) {
    open(); await sleep(30);
    sizes.add(Math.round(document.getElementById("wizDr").getBoundingClientRect().width));
    closeWizard(); await sleep(30);
  }
  ok(sizes.size === 1, "все мастера добавления одного размера: " + [...sizes].join(", "));
});
