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
  pickStatus("nosignal");
  await sleep(30);
  const look = (el) => { const c = getComputedStyle(el); return c.backgroundColor + " " + c.borderTopColor; };
  ok(look(btn()) === look(statusBtn()), `нажатые «Папки» — как статус с фильтром: ${look(btn())}`);
  pickStatus("");
  await sleep(30);
  ok(bg(btn()) !== sliceBg || getComputedStyle(btn()).borderTopColor !== "rgba(0, 0, 0, 0)", "нажатые «Папки» отличаются от выбранного среза");

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

  // «Детекторы» — то же положение: «выключено» там значит виды, инверсии нет
  click("det");
  ok(group() === "kind" && !on() && !btn().disabled, "«Детекторы»: «Папки» выключены — виды");
  btn().click();
  ok(on() && group() === "folder", "«Детекторы»: включили «Папки»");
  for (const s of ["srv", "arch"]) { click(s); ok(btn().disabled && on(), `срез ${s}: кнопка неактивна и включена`); }
  for (const s of ["acfa", "cam", "all"]) { click(s); ok(on() && group() === "folder", `срез ${s}: «Папки» включены, дерево по папкам`); }
  click("det");
  ok(on() && group() === "folder", "снова «Детекторы»: «Папки» включены");
  btn().click();
  ok(!on() && group() === "kind", "«Детекторы»: выключили «Папки»");
  for (const s of ["acfa", "cam", "all"]) { click(s); ok(!on() && group() === "server", `срез ${s}: «Папки» выключены`); }
  btn().click();
  ok(on(), "вернули включёнными");
  click("det");
  ok(on() && group() === "folder", "«Детекторы» снова по папкам");
  click("all");
});
