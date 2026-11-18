/* Маска приватности камеры (пробел E1 против Axxon One, из прототипа 72): вкладка «Видео» → раздел «Маска приватности».
   Многоугольник щелчками (Backspace, Enter, щелчок по первой точке, Esc), прямоугольник двумя щелчками и протяжкой,
   правка точек (перенос щелчком без перетаскивания, правый щелчок убирает, не меньше 3 точек), стрелки и Delete,
   «Как видит оператор», вид маски из опции домена sec.mask, «Сохранить маску» и «Отменить правки», ссылка на опцию,
   подсказки в правах роли. Маска — свойство камеры privacyMasks (контракт 0.17.0): «Сохранить маску» отправляет её на сервер.
   Запуск: python3 tools/check_ui.py tests/ui-maska-privatnosti.js */
UiCheck(async ({ ok, until }) => {
  ok(typeof pmSecHtml === "function", "на странице есть раздел «Маска приватности»");
  if (typeof pmSecHtml !== "function") return;
  const CAM = "30000013-0000-4000-8000-000000000000"; // «1. Главный вход»
  const CAM2 = "30000041-0000-4000-8000-000000000000"; // «2а. Запасной вход»
  const main = () => document.getElementById("main");
  const stage = () => main().querySelector("[data-pm-stage]");
  const ov = () => stage().querySelector(".pm-ov");
  const at = (fx, fy, extra = {}) => { const r = stage().getBoundingClientRect(); return { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: r.x + r.width * fx, clientY: r.y + r.height * fy, ...extra }; };
  const down = (el, fx, fy) => el.dispatchEvent(new MouseEvent("mousedown", at(fx, fy)));
  const up = (fx, fy) => window.dispatchEvent(new MouseEvent("mouseup", at(fx, fy)));
  const move = (fx, fy) => window.dispatchEvent(new MouseEvent("mousemove", at(fx, fy)));
  const click = (fx, fy, el) => { down(el || ov(), fx, fy); up(fx, fy); };
  const key = (k, extra = {}) => stage().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
  const ctx = (el, fx, fy) => el.dispatchEvent(new MouseEvent("contextmenu", at(fx, fy, { button: 2 })));
  const areas = () => pmAreas(find(CAM).n);
  const sum = () => main().querySelector("[data-pm-sum]")?.textContent || "";
  const btn = (t) => [...main().querySelectorAll(".pm-sec button")].find((b) => b.textContent.trim() === t);
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const selOn = (aid) => { if (pm.sel !== aid) pmSel(CAM, aid); };
  const dbl = (fx, fy) => ov().dispatchEvent(new MouseEvent("dblclick", at(fx, fy, { detail: 2 })));

  goApp("hw");
  await hwEnsure([CAM, CAM2]);
  openNode(CAM, { app: "hw", tab: "vid" });
  ok(await until(() => stage()), "вкладка «Видео»: раздел «Маска приватности» с кадром");
  ok(sum() === "нет областей", "без областей итог раздела — «нет областей»");
  ok(btn("Сохранить маску")?.disabled && btn("Отменить правки")?.disabled, "без правок «Сохранить маску» и «Отменить правки» неактивны");

  // Многоугольник: щелчки ставят точки, Backspace убирает последнюю, Enter замыкает
  pmTool(CAM, "poly");
  click(0.2, 0.2); click(0.5, 0.2); click(0.5, 0.5); click(0.3, 0.6);
  ok(pm.poly?.pts.length === 4, "четыре щелчка — четыре точки");
  click(0.3, 0.6);
  ok(pm.poly?.pts.length === 4, "повторный щелчок в ту же точку (двойной щелчок) не ставит лишнюю точку");
  key("Backspace");
  ok(pm.poly?.pts.length === 3, "Backspace убрал последнюю точку");
  key("Enter");
  ok(await until(() => areas().length === 1 && areas()[0].pts.length === 3), "Enter замкнул область из трёх точек");
  ok(sum() === "1 область · мозаика", "итог: 1 область, вид — мозаика из опции домена");
  ok(!btn("Сохранить маску")?.disabled, "после правки «Сохранить маску» активна");

  // Замкнуть щелчком по первой точке; меньше трёх точек Enter не замыкает; Esc отменяет
  pmTool(CAM, "poly");
  click(0.6, 0.6); click(0.8, 0.6);
  key("Enter");
  ok(pm.poly?.pts.length === 2 && areas().length === 1, "Enter при двух точках область не создаёт");
  click(0.8, 0.8); click(0.601, 0.601);
  ok(await until(() => areas().length === 2 && areas()[1].pts.length === 3), "щелчок по первой точке замкнул вторую область");
  pmTool(CAM, "poly");
  click(0.1, 0.1); key("Escape");
  ok(!pm.poly && !pm.tool && areas().length === 2, "Esc отменил начатую область и снял инструмент");
  pmTool(CAM, "poly");
  click(0.3, 0.75); click(0.4, 0.75); click(0.35, 0.9); click(0.35, 0.9); dbl(0.35, 0.9);
  ok(areas().length === 3 && areas()[2].pts.length === 3, "двойной щелчок замкнул область без лишней точки");
  pmDel(CAM, areas()[2].id);
  ok(areas().length === 2, "кнопка «Убрать область» убрала её");

  // Прямоугольник: двумя щелчками (без перетаскивания) и протяжкой
  pmTool(CAM, "rect");
  click(0.7, 0.2);
  ok(pm.rect && areas().length === 2, "первый щелчок ставит угол прямоугольника");
  click(0.9, 0.4);
  const r1 = areas()[2];
  ok(r1?.pts.length === 4 && near(r1.pts[0][0], 0.7) && near(r1.pts[0][1], 0.2) && near(r1.pts[2][0], 0.9) && near(r1.pts[2][1], 0.4), "второй щелчок — прямоугольник по двум углам");
  pmTool(CAM, "rect");
  down(ov(), 0.05, 0.7); move(0.15, 0.9); up(0.15, 0.9);
  const r2 = areas()[3];
  ok(r2?.pts.length === 4 && near(r2.pts[2][0], 0.15) && near(r2.pts[2][1], 0.9), "протяжка рисует прямоугольник");
  ok(pm.sel === r2.id && !pm.tool, "новая область выбрана, инструмент снят");

  // Перенос точки без перетаскивания: щелчок по точке, потом по новому месту
  await until(() => main().querySelector(`[data-h="${r2.id}:0"]`));
  const h0 = main().querySelector(`[data-h="${r2.id}:0"]`);
  down(h0, 0.05, 0.7); up(0.05, 0.7);
  ok(pm.pt?.a === r2.id && pm.pt.i === 0, "щелчок по точке выбирает её");
  click(0.02, 0.62);
  ok(near(areas()[3].pts[0][0], 0.02) && near(areas()[3].pts[0][1], 0.62) && !pm.pt, "щелчок по кадру ставит выбранную точку туда");
  ok(document.activeElement === stage(), "после щелчка по кадру фокус клавиатуры — на кадре");

  // «+» на стороне добавляет точку и тянет её; протяжка точки двигает её
  await until(() => main().querySelector(`[data-m="${r2.id}:0"] circle`));
  down(main().querySelector(`[data-m="${r2.id}:0"] circle`), 0.08, 0.66); move(0.08, 0.6); up(0.08, 0.6);
  ok(areas()[3].pts.length === 5 && near(areas()[3].pts[1][1], 0.6), "«+» добавил точку и протянул её");
  down(main().querySelector(`[data-h="${r2.id}:1"]`), 0.08, 0.6); move(0.1, 0.58); up(0.1, 0.58);
  ok(near(areas()[3].pts[1][0], 0.1) && near(areas()[3].pts[1][1], 0.58) && !pm.pt, "протяжка точки двигает её, выбор точки снят");

  // Выбор точки не переживает смену выбора: другая область, «Как видит оператор»
  down(main().querySelector(`[data-h="${r2.id}:1"]`), 0.1, 0.58); up(0.1, 0.58);
  ok(pm.pt?.a === r2.id, "точка выбрана");
  const r1pts = JSON.stringify(areas()[2].pts), r2pts = JSON.stringify(areas()[3].pts);
  click(0.8, 0.3, ov().querySelector(`[data-b="${r1.id}"]`));
  ok(pm.sel === r1.id && !pm.pt, "щелчок по другой области снимает выбор точки");
  click(0.5, 0.95);
  ok(JSON.stringify(areas()[3].pts) === r2pts && JSON.stringify(areas()[2].pts) === r1pts, "щелчок по кадру после этого не двигает ни одну точку");
  selOn(r2.id);
  down(main().querySelector(`[data-h="${r2.id}:1"]`), 0.1, 0.58); up(0.1, 0.58);
  pmView(CAM); pmView(CAM);
  ok(!pm.pt, "«Как видит оператор» снимает выбор точки");

  // Delete при выбранной точке убирает точку, а не область
  selOn(r2.id);
  down(main().querySelector(`[data-h="${r2.id}:1"]`), 0.1, 0.58); up(0.1, 0.58);
  key("Delete");
  ok(areas().length === 4 && areas()[3].pts.length === 4 && !pm.pt, "Delete убрал выбранную точку, область осталась");

  // Правый щелчок по точке убирает её; у треугольника — отказ
  selOn(r2.id);
  await until(() => main().querySelector(`[data-h="${r2.id}:1"]`));
  ctx(main().querySelector(`[data-h="${r2.id}:1"]`), 0.15, 0.7);
  ok(areas()[3].pts.length === 3, "правый щелчок убрал точку");
  ctx(main().querySelector(`[data-h="${r2.id}:1"]`), 0.15, 0.9);
  ok(areas()[3].pts.length === 3, "меньше трёх точек оставить нельзя");

  // Стрелки сдвигают выбранную область в пределах кадра, Delete убирает её
  const x0 = areas()[3].pts.map((p) => p[0]), selWas = sel;
  key("ArrowLeft", { shiftKey: true });
  ok(Math.min(...areas()[3].pts.map((p) => p[0])) >= 0 && areas()[3].pts[0][0] === 0, "стрелка не выводит область за край кадра");
  key("ArrowRight");
  ok(near(areas()[3].pts[1][0] - (x0[1] - x0[0]), 0.01), "стрелка вправо сдвигает область на 1 %");
  ok(sel === selWas, "стрелки на кадре не двигают выбор в дереве");
  key("Delete");
  ok(areas().length === 3 && !pm.sel, "Delete убрал выбранную область");
  key("ArrowDown");
  ok(sel === selWas && stage(), "без выбранной области стрелка тоже не уходит дереву");

  // «Как видит оператор»: без контуров, подписей и точек
  pmView(CAM);
  ok(await until(() => ov().querySelectorAll(".pm-a.view").length === 3), "«Как видит оператор»: три области маской");
  ok(!ov().querySelector(".dw-tx, .dw-hd, .dw-mid"), "в этом виде нет подписей и точек");
  const before = JSON.stringify(areas());
  click(0.8, 0.3, ov().querySelector(`[data-b="${r1.id}"]`)); click(0.5, 0.5);
  ok(JSON.stringify(areas()) === before && !pm.sel, "щелчки по кадру в этом виде не выбирают и не двигают области");
  pmView(CAM);

  // Вид маски — из опции домена
  const dom = domains.find((x) => x.id === nodeDomainId(find(CAM).n));
  ok(ov().querySelector(".pm-a")?.getAttribute("fill") === "url(#pmMos)", "мозаика — узор pmMos");
  optDomStore(dom)["sec.mask"] = "black";
  pmRepaint(find(CAM).n);
  ok(ov().querySelector(".pm-a")?.getAttribute("fill") === "#000" && sum().endsWith("чёрная заливка"), "опция «Чёрная заливка» — чёрные области и итог");
  optDomStore(dom)["sec.mask"] = "mosaic";
  pmRepaint(find(CAM).n);

  // Сохранить и отменить
  btn("Сохранить маску").click();
  ok(await until(() => unitProps.get(CAM)?.privacyMasks?.length === 3 && !pmDrafts.has(CAM)), "«Сохранить маску» отправила три области на сервер");
  ok(unitProps.get(CAM).privacyMasks.every((m) => m.points.length >= 3 && m.points.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)), "области — точки в долях кадра");
  ok(btn("Сохранить маску")?.disabled, "после сохранения кнопка снова неактивна");
  pmClear(CAM);
  ok(areas().length === 0 && sum() === "нет областей", "«Убрать все» очищает черновик");
  btn("Отменить правки").click();
  ok(areas().length === 3 && sum() === "3 области · мозаика", "«Отменить правки» возвращает сохранённое");

  // Черновик — свой у каждой камеры: другая камера его не стирает
  pmDel(CAM, areas()[0].id);
  ok(pmDirty(find(CAM).n), "черновик первой камеры не сохранён");
  openNode(CAM2, { app: "hw", tab: "vid" });
  ok(await until(() => stage()?.dataset.pmStage === CAM2), "вторая камера: свой раздел маски");
  key("Tab"); pmTool(CAM2, "rect"); key("Escape");
  ok(sum() === "нет областей", "у второй камеры своих областей нет");
  openNode(CAM, { app: "hw", tab: "vid" });
  ok(await until(() => stage()?.dataset.pmStage === CAM), "снова первая камера");
  ok(areas().length === 2 && pmDirty(find(CAM).n) && !btn("Сохранить маску")?.disabled, "несохранённый черновик первой камеры на месте");
  btn("Отменить правки").click();

  // Ссылка на опцию: «Опции» → «Безопасность», опция sec.mask подсвечена
  const link = [...main().querySelectorAll(".pm-who button")].find((b) => b.textContent.includes("Маска приватности"));
  ok(!!link, "в блоке «Кто и где видит маску» есть ссылка на опцию");
  ok(!main().querySelector(".pm-who").textContent.includes("Web Client"), "предупреждения о Web Client в разделе нет");
  ok(!ACC_FEAT_NOTE.ALLOW_SHOW_PRIVACY_VIDEO_IN_ARCHIVE.includes("Web Client"), "предупреждения о Web Client в подсказке права нет");
  link.click();
  ok(await until(() => sys === "sec" && main().querySelector('[data-set="sec.mask"].set-flash')), "ссылка открыла «Безопасность», опция «Маска приватности» подсвечена");

  // Права роли: подпись права и подсказки
  ok(ACC_FEATURE_TEXT.find((f) => f[0] === "ALLOW_SHOW_PRIVACY_VIDEO_IN_ARCHIVE")?.[1] === "Просмотр видео без масок приватности", "подпись права — «Просмотр видео без масок приватности»");
  const role = accRoles().find((r) => !r.builtin && r.id !== accRoles()[0].id) || accRoles()[1];
  goApp("acc"); accGo("role:" + role.id);
  ok(await until(() => [...main().querySelectorAll(".ln-sw small")].some((s) => s.textContent.startsWith("Право снимает все маски"))), "у права — подсказка, что оно снимает все маски");
  const smalls = [...main().querySelectorAll(".ln-sw small")].map((s) => s.textContent);
  ok(smalls.some((t) => t.includes("должен быть детектор лиц")), "у «Лица в реальном времени» — подсказка о детекторе лиц");
  ok(!ACC_RESTR.some(([k]) => k === "noFaces") || smalls.some((t) => t.startsWith("Сервер находит лица детектором лиц")), "у «Запрет распознавания лиц» — подсказка о детекторе лиц");

  // Английский: новые тексты переведены
  ["Маска приватности", "Как видит оператор", "Открыть опцию «Маска приватности»", "Просмотр видео без масок приватности", ACC_FEAT_NOTE.ALLOW_SHOW_PRIVACY_VIDEO_IN_ARCHIVE, pmHint(find(CAM).n)]
    .forEach((t) => ok(!!window.I18N_EN?.[t], `английский текст есть: «${t.slice(0, 40)}»`));
});
