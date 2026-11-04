/* Прототип 24: вкладка «Итоговый доступ» — вывод словами, вид «По папкам», фильтр списком, вид «Вклад ролей».
   Не ui-*.js: у index.html таких видов нет. Запуск:
   python3 tools/check_ui.py --page index_24_itogovyi-dostup.html tests/proto24-effective.js */
UiCheck(async ({ ok }) => {
  goApp("acc");
  const open = (login) => { accGo("user:" + accUsers().find((u) => u.login === login).id, "access"); };
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const foot = () => q("#accEffList .tfoot")?.textContent || "";
  const num = (re, t) => +((t.match(re) || [])[1] ?? -1);

  // Вид по умолчанию и вывод словами
  open("olga");
  const u = accUsers().find((x) => x.login === "olga");
  const rows = accEffRowsOf(u), seen = rows.filter((x) => x.vis).length;
  ok(accEffView === "tree" && !!q(".eff-tree"), "по умолчанию вид «По папкам»");
  ok(new RegExp(`видит\\s*${seen}\\s*из\\s*${rows.length}`).test(q(".eff-digest").textContent.replace(/\s+/g, " ")), `вывод: ${seen} из ${rows.length}`);
  ok(qa(".eff-digest li").length === accUserRoles(u, true).length, "в выводе строка на каждую роль");
  ok(!q(".eff-facets") && !!q(".eff-facet-bar button"), "чипы свёрнуты в «Фильтр»");
  ok(!!q("#tree .n.on") && qa(".eff-node").length > 0, "папки видны, домен раскрыт");

  // Расчёт не изменился: уровень строки равен accEff
  ok(rows.every((x) => x.lv === accEff(u, x.o.id, x.dom, x.f).lv), "уровни совпадают с accEff");

  // Папка: полоса показывает все объекты, счётчик виден
  const first = accEffTreeModel(rows)[0];
  ok(first.all.length > 0 && accEffCounts(first.all).reduce((a, c) => a + c.n, 0) === first.all.length, "полоса папки складывается в её объекты");

  // Раскрытие и «Почему так» в дереве
  const before = qa(".eff-tree tr").length;
  const closed = qa(".eff-node").find((tr) => !tr.querySelector(".eff-chev.open"));
  closed.click();
  ok(qa(".eff-tree tr").length > before, "щелчок раскрывает папку");
  const why = q(".eff-tree .ch-act");
  ok(!!why, "в дереве есть «Почему так»");
  why.click();
  ok(/Почему так/.test(q(".acc-why")?.textContent || ""), "«Почему так» открывается из дерева");
  accMenuClose();

  // Фильтр: плоский список с папкой, «В дереве», сброс
  q(".eff-facet-bar button").click();
  ok(!!q(".eff-facets"), "«Фильтр» открывает чипы");
  const chip = qa(".eff-facets .stchip").find((b) => /Исключение/.test(b.textContent));
  const n = +chip.querySelector(".stchip-cnt").textContent;
  chip.click();
  ok(num(/из\s*(\d+)/, foot()) === n, `фильтр даёт список: ${n}`);
  ok(rows.filter((x) => facetHit(ACC_EFF_DIMS, x, accEffF)).every((x) => x.e[x.f].best?.src.k === "obj"), "в фильтре только исключения");
  const inList = q("#accEffList table").textContent;
  const hitRow = rows.find((x) => x.e[x.f].best?.src.k === "obj" && x.folderable);
  ok(!hitRow || inList.includes(accEffPlace(hitRow)), "в строке списка видна папка");
  q("#accEffList .ch-act").click();
  ok(/Почему так/.test(q(".acc-why")?.textContent || ""), "«Почему так» открывается из списка");
  accMenuClose();
  accEffFlatSet(false);
  ok(!!q(".eff-tree") && !q("#accEffList"), "«В дереве» показывает результат деревом");
  accEffFlatSet(true);
  accEffClear();
  ok(!!q(".eff-tree") && !Object.keys(accEffF).length, "сброс возвращает дерево");

  // Поиск: то же для вида и нет пустого экрана
  listSetQ("acceff", "нет-такого-объекта", "acc");
  ok(/Ничего не найдено/.test(q("#accEffList").textContent), "поиск без результата говорит об этом");
  listSetQ("acceff", "", "acc");

  // Вид «Вклад ролей»
  const names = () => qa(".eff-views button").map((b) => b.textContent.trim());
  ok(names().join("|") === "По папкам|Вклад ролей", "при двух ролях два вида");
  accEffViewSet("mx");
  const rs = accUserRoles(u, true).map((id) => accRoleName(id));
  ok(qa(".eff-mx th").map((t) => t.textContent.trim()).join("|") === ["Папка", ...rs, "Итог"].join("|"), "столбцы: папка, роли, итог");
  ok(!q(".eff-mx-seg"), "режим один");
  const no = qa(".eff-mx-c:not(.tot) button").find((b) => b.textContent === "Нет");
  ok(!!no, "есть ячейка «Нет»");
  no.click();
  ok(accEffView === "tree" && num(/из\s*(\d+)/, foot()) > 0, "ячейка открывает непустой список");
  accEffClear();

  // Итоговый столбец: одно значение сужает до уровня, список не пуст
  accEffViewSet("mx");
  const tot = qa(".eff-mx-c.tot:not(.mix) button")[0];
  tot.click();
  ok(num(/из\s*(\d+)/, foot()) > 0 && !!accEffF.lv, "ячейка «Итог» открывает список уровня");
  accEffClear();

  // Одна роль и нет ролей: второго вида нет, даже если выбран
  accEffViewSet("mx");
  const one = accUsers().find((x) => accUserActive(x) && accUserRoles(x, true).length === 1);
  open(one.login);
  ok(!q(".eff-views") && !!q(".eff-tree"), "одна роль: только дерево");
  const none = accUsers().find((x) => !accUserRoles(x, true).length);
  open(none.login);
  ok(!q(".eff-views") && !!q(".eff-tree"), "нет ролей: только дерево");
  ok(/Нет действующих ролей/.test(q(".eff-digest").textContent), "нет ролей: вывод это называет");
  open("olga");
  ok(!!q(".eff-mx"), "к двум ролям вернулся выбранный вид");
  accEffViewSet("tree");

  // Уровень «вместе»: итог дают обе роли, ни одна из них не помечена как лишняя
  open("olga");
  const uj = accUsers().find((x) => x.login === "olga");
  const joinRow = accEffRowsOf(uj).find((x) => x.e[x.f].by === "join");
  ok(!joinRow || accEffGivers(joinRow).length >= 2, "уровень «вместе»: итог дают обе роли");
  ok(accEffRowsOf(uj).filter((x) => x.vis).every((x) => accEffGivers(x).length > 0), "у каждого видимого объекта есть роль, дающая итог");

  // Строка домена в «Вклад ролей» ведёт в свой домен
  accEffViewSet("mx");
  const domTree = accEffTreeModel(accEffRowsOf(uj)).find((n) => n.isDom);
  if (domTree) {
    const domCell = qa(".eff-mx tr").find((tr) => tr.querySelector(".eff-mx-n")?.textContent.startsWith(domTree.name)).querySelector(".eff-mx-c button");
    domCell.click();
    ok(accEffF.dom === domTree.dom && num(/из\s*(\d+)/, foot()) === domTree.all.length, `строка домена: ${domTree.all.length} объектов`);
    accEffClear();
  }
  // «Раскрыть всё» открывает всё дерево за один щелчок
  accEffViewSet("tree");
  const count = (ns) => ns.reduce((a, n) => a + 1 + count(n.kids), 0);
  accEffOpenAll(false, "");
  qa(".eff-treeact button").find((b) => /Раскрыть/.test(b.textContent)).click();
  ok(qa(".eff-node").length === count(accEffTreeModel(accEffRowsOf(uj))), "«Раскрыть всё» открывает все папки");
  accEffOpenAll(false, "");

  // Одинаковые подписи уровней не считаются разным доступом
  const labels = accEffCounts(accEffRowsOf(uj)).map((c) => accLv(c.f, c.lv));
  ok(new Set(labels).size === labels.length, "уровни сгруппированы по подписи");

  // Смена домена сбрасывает фильтр
  accEffPick("lv", "Нет");
  const dom2 = domains[domains.length - 1].id;
  pickDomain(dom2);
  accUI();
  ok(!Object.keys(accEffF).length, "другой домен: фильтр чист");
  pickDomain("");
  accUI();
  open("olga");

  // Смена пользователя сбрасывает фильтр
  accEffPick("lv", "Нет");
  open(one.login);
  ok(!Object.keys(accEffF).length, "у другого пользователя фильтр чист");
});
