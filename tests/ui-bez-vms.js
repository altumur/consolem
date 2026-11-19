/* Сценарий интерфейса: механизм без VMS (часть 04 переделки по слоям) на наборе agents — оркестратор агентов, система не
   из мира VMS. Срезы дерева идут от раскладок, которые объявила система (GET /kinds → layouts): у оркестратора нет камер,
   серверов, хранилищ и детекторов, поэтому их кнопок нет, а свои раскладки (agent.pipelines, agent.models) — срезы lay:<id>.
   Сервер без layouts (старый бэкенд) — прежние шесть срезов: slicesFor(null). Набор — FIXTURE_OF в tests/selftest.js.
   Сценарий пришёл с прототипом 79 (index_79_mehanizm-bez-vms.html). Охрана slicesFor — для страниц без срезов от раскладок. */
UiCheck(async ({ ok, until }) => {
  if (typeof slicesFor !== "function") { ok(true, "срезов от раскладок на этой странице нет: проверять нечего"); return; }
  const tree = () => document.getElementById("tree");
  const treeRowsText = () => tree()?.textContent || "";
  const row = (id) => tree()?.querySelector(`.n[data-pick="${id}"]`);
  const level = (id) => parseFloat(row(id)?.style.getPropertyValue("--l")) || 0;
  const chip = (id) => document.querySelector(`.ph-choice[data-slice="${id}"]`);
  // Имена из набора agents
  const MODEL = "30000001-0000-4000-8000-000000000000"; // «Локальная модель»
  const AGENT = "30000021-0000-4000-8000-000000000000"; // «Агент поддержки», modelId — «Локальная модель»
  const LOOSE = "30000023-0000-4000-8000-000000000000"; // «Агент без модели», modelId: null
  const PIPE = "30000031-0000-4000-8000-000000000000"; // конвейер «Обработка обращения»
  const STEP = "30000041-0000-4000-8000-000000000000"; // шаг «Принять» конвейера

  // Старый бэкенд без layouts — прежние срезы и четыре раскладки
  ok(slicesFor(null).join() === "all,cam,acfa,srv,arch,det", "без layouts — прежние срезы: " + slicesFor(null).join());
  ok(typeof layoutDeclared === "function", "layoutDeclared есть");
  ok(Array.isArray(TREE_LAYOUTS) && TREE_LAYOUTS.some((l) => l.id === "agent.models"), "TREE_LAYOUTS — из GET /kinds: " + (TREE_LAYOUTS || []).map((l) => l.id).join());
  ok(layoutDeclared("folders") && !layoutDeclared("servers") && layoutDeclared("agent.models"), "layoutDeclared — по объявленным раскладкам");
  ok(slicesFor(TREE_LAYOUTS).join() === "all,lay:agent.pipelines,lay:agent.models", "срезы набора agents: " + slicesFor(TREE_LAYOUTS).join());

  goApp("hw");
  await until(() => chip("all"));
  const chips = [...document.querySelectorAll(".ph-choice[data-slice]")].map((b) => b.textContent).join(" | ");
  ok(!/Камеры|ОПС|Серверы|Хранилища|Детекторы/.test(chips), "кнопок срезов VMS нет: " + chips);
  ok(/Конвейеры/.test(chips) && /По моделям/.test(chips), "кнопки своих раскладок — с подписью системы: " + chips);
  ok(document.getElementById("viewBtn").disabled, "«Папки» неактивна: второй раскладки у среза нет");
  ok(treeLayout() === "folders", "«Оборудование» на agents — раскладка folders: " + treeLayout());

  // Раскладка по ссылке: модели под рабочим пространством, агенты — под своей моделью
  setSlice("lay:agent.models");
  ok(slice === "lay:agent.models" && treeLayout() === "agent.models", "срез lay:agent.models → раскладка agent.models: " + treeLayout());
  ok(chip("lay:agent.models")?.classList.contains("on"), "кнопка среза находится по data-slice и нажата");
  ok(document.getElementById("viewBtn").disabled, "в срезе раскладки «Папки» неактивна");
  ok(await until(() => treeRowsText().includes("Локальная модель") && treeRowsText().includes("Облачная модель")), "модели в дереве");
  ok(await until(() => !!row(LOOSE)), "агент без модели — в дереве");
  ok(level(LOOSE) === level(MODEL), `агент без модели — прямо под рабочим пространством (уровень ${level(LOOSE)}, у модели ${level(MODEL)})`);
  ok(!row(AGENT), "агент модели не виден, пока модель свёрнута");
  ok(!!row(MODEL)?.dataset.tid, "у модели с агентами есть стрелка");
  row(MODEL).querySelector(".tw").click();
  ok(await until(() => !!row(AGENT)), "раскрыть модель → под ней агент этой модели");
  ok(level(AGENT) === level(MODEL) + 1, `агент — уровнем ниже модели (${level(AGENT)})`);
  ok(!treeRowsText().includes("Агент отчётов") || level("30000022-0000-4000-8000-000000000000") === level(MODEL) + 1, "агент другой модели — не под этой моделью");

  // Строка открывает карточку объекта
  row(AGENT).click();
  ok(await until(() => sel === AGENT && document.getElementById("main").textContent.includes("Агент поддержки")), "клик по строке открывает карточку агента");

  // Раскладка по родителю: шаги под конвейером
  setSlice("lay:agent.pipelines");
  ok(await until(() => !!row(PIPE)), "конвейер в дереве");
  if (!row(STEP)) row(PIPE).querySelector(".tw").click();
  ok(await until(() => !!row(STEP)), "раскрыть конвейер → под ним шаги");
  ok(level(STEP) === level(PIPE) + 1, "шаг — уровнем ниже конвейера");
  ok(!row(MODEL), "в срезе конвейеров моделей нет");

  // Переход по ссылке в срезе своей раскладки: место цели раскрывается в этой раскладке, строка выбрана
  setSlice("lay:agent.models");
  open.delete(MODEL); renderTree();
  ok(await until(() => !!row(MODEL) && !row(AGENT)), "модель свёрнута");
  openNode(AGENT, { app: "hw" });
  ok(await until(() => row(AGENT)?.classList.contains("on")), "переход к агенту раскрывает его модель, строка агента выбрана");
  ok(slice === "lay:agent.models", "переход не меняет срез своей раскладки");
  // Ветки ещё не прочитаны (как при входе по ссылке): место — по GET /tree/paths и чтению веток цепочки
  openNode(domains[0].id, { app: "hw" });
  treeReset(); open.delete(MODEL); renderTree();
  ok(await until(() => !!row(MODEL) && !row(AGENT)), "ветки перечитаны, модель свёрнута");
  openNode(AGENT, { app: "hw" });
  ok(await until(() => row(AGENT)?.classList.contains("on")), "переход к агенту по непрочитанным веткам раскрывает его модель");
  // Цели в этой раскладке нет (конвейер не лежит «по моделям») — срез, где она есть
  openNode(PIPE, { app: "hw" });
  ok(await until(() => row(PIPE)?.classList.contains("on")), "переход к конвейеру из среза моделей находит его строку: срез " + slice);
  ok(slice === "lay:agent.pipelines", "переход ведёт в срез, где цель есть: " + slice);

  // Код с точкой и дефисом переживает смену среза и перерисовку
  setSlice("all"); setSlice("lay:agent.models");
  ok(slice === "lay:agent.models", "срез с точкой в коде переживает смену среза");
  renderTree(); aside();
  ok(chip("lay:agent.models")?.classList.contains("on") && slice === "lay:agent.models", "срез переживает перерисовку");
  ok(await until(() => !!row(AGENT)), "раскрытие модели — за срезом: после возврата агент снова виден");
  setSlice("lay:unknown");
  ok(slice === "lay:agent.models", "необъявленная раскладка — срез не меняется");
  setSlice("all");
});
