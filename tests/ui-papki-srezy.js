/* Сценарий прототипа 29: «Папки» и статус в ряду срезов за чертой; в «Серверах» и «Хранилищах» кнопка неактивна и хранит положение.
   Запуск — python3 tools/check_ui.py --page index_29_papki-u-srezov.html tests/ui-papki-srezy.js */
UiCheck(async ({ ok, sleep }) => {
  if (!document.getElementById("phSliceLast")) { ok(true, "на этой странице «Папок» в ряду срезов нет"); return; }
  const btn = () => document.getElementById("viewBtn");
  const on = () => btn().getAttribute("aria-pressed") === "true";
  const click = (s) => document.querySelector(`#aside [data-slice="${s}"]`).click();
  const top = (el) => Math.round(el.getBoundingClientRect().top);
  const last = () => document.getElementById("phSliceLast");
  const statusBtn = () => document.getElementById("filtBtn");
  const sameLine = () => top(last()) === top(btn()) && top(btn()) === top(statusBtn());
  const fits = () => statusBtn().getBoundingClientRect().right <= document.getElementById("aside").getBoundingClientRect().right;

  // Место в шапке
  click("all");
  const sliceGroup = document.querySelector(`#aside [role="group"][aria-label="${i18n("Срез дерева")}"]`);
  ok(sliceGroup && sliceGroup.querySelectorAll("[data-slice]").length === Object.keys(SLICE).length - 1 && sliceGroup.getAttribute("aria-owns") === "phSliceLast", "группа срезов называет все срезы, последний — через aria-owns");
  ok(last().dataset.slice === Object.keys(SLICE).at(-1), "последний срез — в общем ряду");
  ok(!btn().closest('[role="group"]') && !document.getElementById("filtBtn").closest('[role="group"]'), "«Папки» и статус — вне группы срезов");
  const fold = btn().parentElement;
  ok(fold.classList.contains("ph-fold") && fold.contains(document.getElementById("filtBtn")), "«Папки» и статус за одной чертой");
  ok(getComputedStyle(fold, ":before").width === "1px", "черта перед настройками");
  ok(document.querySelector("#treeExpandBtn").closest(".ph-row") !== btn().closest(".ph-row"), "кнопки дерева — на отдельной строке");

  // Настройки не уезжают отдельно: ни при какой подписи статуса, ни на самой узкой панели
  setAsideWidth(100);
  ok(asideW === ASIDE_MIN, `ширина дерева не меньше ${ASIDE_MIN}: ${asideW}`);
  for (const st of ["", "nosignal", "license", "nosignal:auth"]) {
    pickStatus(st);
    await sleep(30);
    ok(sameLine() && fits(), `статус «${st || "все"}»: последний срез, «Папки» и статус в одной строке и в ширине панели`);
  }
  pickStatus("");

  // Свой вид нажатия
  ok(on(), "при старте «Папки» нажаты");
  const bg = (el) => getComputedStyle(el).backgroundColor;
  const sliceBg = bg(document.querySelector('#aside .ph-choice.on[data-slice="all"]'));
  ok(bg(btn()) === "rgba(0, 0, 0, 0)" && sliceBg !== "rgba(0, 0, 0, 0)", `нажатые «Папки» без заливки, выбранный срез с заливкой: ${bg(btn())} / ${sliceBg}`);
  ok(getComputedStyle(btn()).borderTopColor !== "rgba(0, 0, 0, 0)", "у нажатых «Папок» видна рамка");

  // Положение сохраняется: нажаты
  for (const s of ["srv", "arch"]) {
    click(s);
    ok(btn().disabled && on() && btn().title === i18n("В этом срезе нет папок"), `срез ${s}: кнопка неактивна, положение видно, причина названа`);
    btn().click();
    ok(slice === s && btn().disabled && on(), `срез ${s}: нажатие ничего не меняет`);
  }
  click("cam");
  ok(!btn().disabled && on() && group() === "folder", "«Камеры»: кнопка активна, дерево по папкам");

  // Положение сохраняется: отжаты, и возврат их не включает
  btn().click();
  ok(!on() && group() === "server", "«Камеры»: «Папки» выключены");
  for (const s of ["srv", "arch"]) {
    click(s);
    ok(btn().disabled && !on(), `срез ${s}: кнопка неактивна, положение «выключено» видно`);
  }
  for (const s of ["cam", "acfa", "all"]) {
    click(s);
    ok(!btn().disabled && !on() && group() === "server", `срез ${s}: «Папки» сами не включились`);
  }

  // «Детекторы» — своё положение; неактивная кнопка показывает общее, а не положение «Детекторов»
  click("det");
  ok(group() === "kind" && !on() && !btn().disabled, "«Детекторы»: при входе — виды");
  btn().click();
  ok(on() && group() === "folder", "«Детекторы»: включили «Папки»");
  click("srv");
  ok(!on(), "«Серверы» показывают положение камер, а не «Детекторов»");
  click("cam");
  ok(!on() && group() === "server", "«Камеры»: «Детекторы» положение не поменяли");
  btn().click();
  click("all");
  ok(on(), "вернули включённым");
});
