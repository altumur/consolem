/* Подгрузка ветки прокруткой — только от прокрутки человеком (колесо, клавиши, касание, полоса). Прокрутка кодом
   (переход к объекту держит цель в окне) строку «Показать ещё» соседней ветки не дочитывает: иначе переход к домену
   под раскрытой «Без папки» соседа читал её страницу за страницей без конца. Запуск — python3 tools/check_ui.py tests/ui-more-scroll.js */
UiCheck(async ({ ok, sleep }) => {
  goApp("hw");
  await sleep(50);
  const tree = document.getElementById("tree");
  const calls = [];
  const was = window.treeMore;
  window.treeMore = (id) => { calls.push(id); return Promise.resolve(); };
  const row = document.createElement("div");
  row.className = "n n-more n-more-go";
  row.dataset.more = "probe";
  tree.prepend(row);
  tree.dispatchEvent(new Event("scroll"));
  ok(!calls.length, "прокрутка кодом не дочитывает ветку");
  tree.dispatchEvent(new WheelEvent("wheel", { deltaY: 40, bubbles: true }));
  tree.dispatchEvent(new Event("scroll"));
  ok(calls.includes("probe"), "прокрутка колесом дочитывает ветку");
  row.remove();
  window.treeMore = was;
});
