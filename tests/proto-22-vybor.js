/* Прототип 22: единый выбор на вкладках «Оборудования» и раскрытие дерева. Запуск — только на прототипе:
   python tools/check_ui.py --page index_22_edinyy-vybor-dereva.html tests/proto-22-vybor.js
   В общий набор (tests/ui-*.js) сценарий войдёт при переносе в index.html. */
// Без чтения кэша до конца: страница работает так, как у пользователя
window.UI_RAW_CACHE = true;
UiCheck(async ({ ok, until }) => {
  const tree = () => document.getElementById("tree");
  const rows = () => [...tree().querySelectorAll(".n")];
  const rowNamed = (name) => rows().find((r) => r.querySelector(".nm")?.textContent.trim() === name);
  const shut = (r) => !!r.querySelector(".tw-chev.shut");
  const chip = (id) => document.querySelector(`.ph-choice[data-slice="${id}"] .ph-cnt`)?.textContent.trim();

  goApp("hw");

  // Начальный вид: домены раскрыты, ниже свёрнуто
  setSlice("cam");
  await until(() => sliceReads.get(sliceReadKey())?.done);
  const start = rows().length;
  ok(start < 100, `дерево при входе короткое: ${start} строк`);

  // Кнопки раскрытия
  await treeExpandAll();
  const wide = rows().length;
  ok(wide > start, `«Развернуть всё» показывает больше строк: ${wide}`);
  treeCollapseAll();
  ok(rows().length <= start, "«Свернуть всё» возвращает короткое дерево");

  // «Развернуть всё» разовое: в запомненное раскрытие не попадает
  await treeExpandAll();
  setSlice("all");
  setSlice("cam");
  ok(rows().length <= start, "разовое «Развернуть всё» не запомнено");

  // У каждой вкладки своё раскрытие
  const dom = domains[0];
  const fld = rows().find((r) => r.classList.contains("fld") && shut(r));
  const fldId = fld.dataset.tid;
  fld.querySelector(".tw").click();
  ok(open.has(fldId), "стрелка раскрыла папку");
  setSlice("arch");
  ok(!open.has(fldId), "другая вкладка папку не раскрывает");
  setSlice("cam");
  ok(open.has(fldId), "вкладка помнит своё раскрытие");
  treeCollapseAll();

  // Раскрытие внутри строки
  await treeExpandBelow(dom.id);
  const inner = rows().length;
  ok(inner > start, "«Развернуть всё внутри» раскрывает ветку");
  treeCollapseBelow(dom.id);
  ok(rows().length < inner, "«Свернуть всё внутри» сворачивает ветку");
  treeCollapseAll();

  // ОПС/СКД: стрелка только у ветки, где есть объекты вкладки или вложенные папки
  setSlice("acfa");
  await until(() => sliceReads.get(sliceReadKey())?.done);
  ok(Number(chip("acfa")) > 0, `цифра на кнопке обновилась: ${chip("acfa")}`);
  const empties = rows().filter((r) => r.classList.contains("fld") && r.classList.contains("n-slice-empty"));
  ok(empties.length > 0, "есть серые папки");
  const leaf = empties.filter((r) => {
    const f = folderById(r.dataset.pick);
    return f && !(f.folders || []).length;
  });
  ok(leaf.length > 0 && leaf.every((r) => !r.querySelector(".tw-chev")), "серая папка без вложенных папок — без стрелки");
  const full = rows().find((r) => r.classList.contains("fld") && !r.classList.contains("n-slice-empty") && shut(r));
  ok(!!full, "папка с объектами — со стрелкой");
  const fullId = full.dataset.tid;
  const before = rows().length;
  full.querySelector(".tw").click();
  await until(() => rows().length > before);
  const fullNow = rows().find((r) => r.dataset.pick === fullId);
  ok(fullNow && !fullNow.classList.contains("n-slice-empty"), "раскрытая папка не посерела");
  treeCollapseAll();

  // Галочка на пустых строках вне режима выбора не видна
  const emptyRow = rows().find((r) => r.classList.contains("n-slice-empty") && r.querySelector(".n-chk"));
  if (emptyRow) ok(getComputedStyle(emptyRow.querySelector(".n-chk")).opacity === "0", "галочка пустой строки скрыта");

  // Детекторы: общий выбор, панель под деревом, карточка выборки, панели над таблицей нет
  setSlice("det");
  await until(() => detRows().length > 2);
  const ids = detKindIds().slice(0, 3);
  ok(ids.length === 3, "есть три детектора");
  ok(typeof detSelSet === "undefined" && typeof detBarHtml === "undefined", "своего выбора у детекторов нет");
  detKindChk(detKindLabel(find(ids[0]).n, find(ids[0]).p));
  ok(selMode && treeSel.has(ids[0]), "галочка вида отмечает его детекторы");
  treeSel.clear();
  selMode = false;
  renderTree();
  ids.forEach((id) => selChkClick(id));
  ok(treeSel.size === 3 && selMode, "галочки отмечают три детектора");
  ok(bulkActive(), "открыта карточка выборки");
  aside();
  gear();
  ok(/Нарисовать зоны/.test(document.body.textContent), "«Нарисовать зоны» — в карточке выборки");
  ok(/3/.test(document.getElementById("selBar")?.textContent || ""), "панель под деревом показывает число");

  // Смена вкладки не теряет отметки
  setSlice("all");
  ok(treeSel.size === 3 && selMode, "отметки пережили смену вкладки");
  ok(/здесь/.test(document.getElementById("selBar")?.textContent || "") || /3/.test(document.getElementById("selBar")?.textContent || ""), "панель показывает общее число");
  setSelMode(false);
  ok(!selMode && !treeSel.size, "выход из режима снимает отметки");

  // Вне режима выбора открытый объект отметкой не считается
  setSlice("cam");
  ok(!selMode, "смена вкладки не включает режим выбора");
});
