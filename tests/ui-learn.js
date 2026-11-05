/* Сценарий интерфейса: раздел «Обучение» и учебный режим. Запуск — tools/check_ui.py tests/ui-learn.js */
UiCheck(async ({ ok, until }) => {
  goApp("learn");
  const main = () => document.getElementById("main");
  const rows = () => [...document.querySelectorAll("#tree .n")];

  // Раздел и дерево
  ok(appsShown().some((a) => a.id === "learn"), "вкладка «Обучение» в рельсе");
  ok(Tour.topics.length === 6, "шесть тем");
  ok(/Ничего не сломается/.test(main().textContent), "первый экран объясняет, зачем раздел");
  const closed = rows().length;
  ok(closed === 7, "дерево свёрнуто: «С чего начать» и темы, строк: " + closed);
  ok(!Tour.demo && !document.querySelector(".tour-panel,.tour-mode"), "пока показ не запущен, учебного режима нет");

  learnTree("0");
  ok(/Зачем это нужно/.test(main().textContent), "экран темы: таблица глав");
  ok(rows().length === closed + Tour.topics[0].chapters.length, "тема раскрылась");
  ok(getComputedStyle(document.querySelector(".lrn-tbl")).tableLayout === "fixed", "таблица глав не двигает столбцы");

  learnTree("0.1");
  const ch = Tour.topics[0].chapters[1];
  ok(main().querySelector("h1, .hd")?.textContent.includes(ch.title), "экран главы: заголовок");
  ok(document.querySelectorAll(".lrn-steps li").length === ch.to - ch.from + 1, "экран главы: текст всех шагов");
  ok(/\d+ шаг/.test(document.querySelector(".lrn-meta").textContent), "экран главы: число шагов");

  // Стрелка темы раскрывает и сворачивает, выбор не меняется
  learnTree("home");
  learnOpen.clear();
  renderTree();
  const arrow = () => document.querySelector('#tree .n[data-go="learn:1"] .tw');
  const n0 = rows().length;
  arrow().click();
  ok(rows().length === n0 + Tour.topics[1].chapters.length && learnSel === "home", "стрелка раскрыла тему, выбор на месте");
  arrow().click();
  ok(rows().length === n0 && learnSel === "home", "стрелка свернула тему");

  // Ссылка моргает на месте прихода
  learnLink("0");
  ok(await until(() => document.querySelector("#tree .acc-flash")), "ссылка подсвечивает строку дерева");

  // Адрес #learn: неверная глава ведёт к теме, неверная тема — никуда
  const atHash = (h) => {
    history.replaceState(history.state, "", location.pathname + location.search + h);
    learnFromHash();
  };
  atHash("#learn=0.99");
  ok(learnSel === "0" && document.querySelector("#tree .n.on"), "#learn с неверной главой выбирает тему");
  learnSel = "home";
  atHash("#learn=99");
  ok(learnSel === "home", "#learn с неверной темой ничего не выбирает");
  ok(location.hash === "", "якорь снят");

  // Обычная страница сборки не загружает сервер показа
  if (Tour.lazy) ok(!performance.getEntriesByType("resource").some((e) => /\/demo\//.test(e.name)), "обычная страница без файлов demo/");

  // Главы идут подряд, без пропусков; подписи для нового пользователя
  for (const t of Tour.topics) {
    ok(t.chapters[0].from === 0 && t.chapters.at(-1).to === t.steps.length - 1 && t.chapters.every((c, n) => !n || c.from === t.chapters[n - 1].to + 1), `«${t.title}»: главы идут подряд`);
    ok(t.chapters.every((c) => c.title && c.why), `«${t.title}»: у каждой главы есть имя и зачем`);
    ok(!t.steps.some((s) => /раньше|прототип/i.test(s.say)), `«${t.title}»: подписи без «раньше» и «прототип»`);
  }

  // Поиск в дереве оставляет подходящие главы
  setTreeQ(Tour.topics[0].chapters[1].title);
  ok(rows().some((r) => r.textContent.includes(Tour.topics[0].chapters[1].title)), "поиск находит главу");
  setTreeQ("");

  // Учебный режим — страница в окне, на всю ширину. Адрес API задан нарочно: запросы туда идти не должны
  const API_ADDR = "http://127.0.0.1:9";
  // Прототип со своим файлом тем называет себя сам: иначе показ в окне открыл бы темы index.html
  const LEARN_PAGE = document.querySelector('meta[name="learn-page"]')?.content || "index.html";
  const open = (query, withApi = true) => {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:1440px;height:900px;left:-3000px;top:0;border:0";
    f.src = new URL(`${LEARN_PAGE}?${withApi ? `api=${encodeURIComponent(API_ADDR)}&` : ""}${query}`, document.baseURI).href;
    document.body.appendChild(f);
    return f;
  };
  const btnIn = (f, name) => [...(f.contentDocument?.querySelectorAll(".tour-btns button") || [])].find((b) => b.textContent.trim() === name && b.style.display !== "none");
  const sayIn = (f) => f.contentDocument?.querySelector(".tour-say")?.textContent;
  // Настоящий localStorage: черновик и раскрытые папки не должны попасть в показ, и показ не должен их изменить
  const SENTRY = "learnSentry", THEME = "kit-theme";
  const themeWas = localStorage.getItem(THEME), openWas = localStorage.getItem(TREE_OPEN_LS);
  localStorage.setItem(SENTRY, "до показа");
  localStorage.setItem(THEME, "light");
  localStorage.setItem(TREE_OPEN_LS, JSON.stringify({ all: ["svcs:*"] }));
  const snap = () => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
  const snapBefore = snap();
  for (let k = 0; k < Tour.topics.length; k++) {
    const t = Tour.topics[k], last = t.steps.length - 1, want = t.steps[last].say;
    const f = open(`tour=${k + 1}&demo=${last}`);
    // Кнопка появляется, когда последний шаг выполнен: одной подписи мало, она видна раньше
    const reached = await until(() => sayIn(f) === want && btnIn(f, "Показать снова"), 90000);
    ok(reached, `«${t.title}»: показ дошёл до последнего шага` + (reached ? "" : `, на экране: ${sayIn(f)}`));
    const d = f.contentDocument, w = f.contentWindow;
    if (reached) {
      ok(d.querySelector(".tour-mode")?.textContent.includes("Учебные данные"), `«${t.title}»: видна полоса учебного режима`);
      const urls = w.performance.getEntriesByType("resource").map((e) => e.name);
      ok(!urls.some((u) => u.startsWith(API_ADDR)), `«${t.title}»: запросов к адресу API нет`);
      ok(w.localStorage.getItem(SENTRY) === null && w.localStorage.getItem(TREE_OPEN_LS) !== localStorage.getItem(TREE_OPEN_LS), `«${t.title}»: черновики и папки в показ не попали`);
      ok(w.localStorage.getItem(THEME) === "light", `«${t.title}»: тема пришла в показ`);
      w.localStorage.setItem(SENTRY, "из показа");
      ok(w.localStorage.getItem(SENTRY) === "из показа", `«${t.title}»: запись остаётся в памяти показа`);
      // Скорость живёт в этой вкладке, настоящий localStorage не меняет
      [...d.querySelectorAll(".tour-panel button")].find((b) => b.textContent.trim() === "×2")?.click();
    }
    ok(snap() === snapBefore, `«${t.title}»: настоящий localStorage не изменился`);
    f.remove();
  }
  sessionStorage.removeItem("tourSpeed");

  // Глава целиком, настоящим ходом курсора; без ?api= — адрес API из разметки сборки, если он есть
  const chapters = Tour.topics[0].chapters, lastCh = chapters.at(-1);
  const pl = open(`tour=1&demo=${lastCh.from}&play`, false);
  ok(await until(() => sayIn(pl) === Tour.topics[0].steps[lastCh.to].say && btnIn(pl, "Показать снова"), 120000), "глава прошла настоящим ходом до конца: " + sayIn(pl));
  ok(!pl.contentWindow.performance.getEntriesByType("resource").some((e) => /\/backend\/api\//.test(e.name)), "показ без ?api=: запросов к API сборки нет");
  pl.remove();

  // Конец главы: кнопки и переход к следующей главе без перезагрузки
  const f = open(`tour=1&demo=${chapters[0].to}`);
  ok(await until(() => btnIn(f, "Следующая глава") && btnIn(f, "Попробовать самому") && btnIn(f, "Показать снова"), 60000), "конец главы: следующая глава, попробовать самому, показать снова");
  const mark = (f.contentWindow.__sameLoad = {});
  btnIn(f, "Следующая глава")?.click();
  ok(await until(() => f.contentDocument?.querySelector(".tour-ti")?.textContent.includes(chapters[1].title), 60000), "«Следующая глава» открыла следующую главу");
  ok(f.contentWindow.__sameLoad === mark, "страница не перезагружалась");
  f.remove();

  // Выход: раздел на той же главе, учебного режима нет, язык вернулся, у записи истории есть состояние для «Назад»
  const ex = open(`tour=1&demo=${chapters[1].from}&lang=en`, false);
  const barBtn = () => ex.contentDocument?.querySelector(".tour-mode button");
  ok(await until(() => barBtn() && ex.contentDocument.querySelector(".tour-block"), 60000), "полоса учебного режима с кнопкой выхода");
  // Настоящий клик попадает в кнопку, а не в слой, который закрывает страницу на время показа
  const br = barBtn().getBoundingClientRect();
  ok(ex.contentDocument.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2) === barBtn(), "во время показа кнопка выхода доступна мышью");
  barBtn()?.click();
  ok(await until(() => ex.contentWindow?.appReady && ex.contentWindow.location.hash === "" && !/demo/.test(ex.contentWindow.location.search) && ex.contentDocument?.querySelector("#tree .n.on"), 60000), "выход: обычная страница");
  const xw = ex.contentWindow;
  ok(!xw.Tour.demo && !ex.contentDocument.querySelector(".tour-mode"), "выход: полосы нет");
  ok(xw.document.documentElement.lang === "en" && !/lang=/.test(xw.location.search), "выход: язык вернулся, параметр снят");
  ok(xw.history.state != null, "выход: запись истории не потеряла состояние");
  ex.remove();

  localStorage.removeItem(SENTRY);
  if (themeWas == null) localStorage.removeItem(THEME); else localStorage.setItem(THEME, themeWas);
  if (openWas == null) localStorage.removeItem(TREE_OPEN_LS); else localStorage.setItem(TREE_OPEN_LS, openWas);
  goApp("hw");
});
