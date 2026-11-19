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
  const CLOUD = "30000002-0000-4000-8000-000000000000"; // «Облачная модель»
  const REPORT = "30000022-0000-4000-8000-000000000000"; // «Агент отчётов», modelId — «Облачная модель»
  const TOOL = "30000011-0000-4000-8000-000000000000"; // инструмент: нет ни в одной своей раскладке
  // Строка-родитель: ближайшая строка выше с меньшим уровнем
  const parentOf = (id) => {
    const rows = [...tree().querySelectorAll(".n[data-pick]")], i = rows.indexOf(row(id));
    for (let j = i - 1; j >= 0; j--) if ((parseFloat(rows[j].style.getPropertyValue("--l")) || 0) < level(id)) return rows[j].dataset.pick;
    return null;
  };

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
  ok(parentOf(AGENT) === MODEL, "строка-родитель агента — его модель");
  row(CLOUD).querySelector(".tw").click();
  ok(await until(() => !!row(REPORT)), "раскрыть вторую модель → её агент");
  ok(parentOf(REPORT) === CLOUD && parentOf(AGENT) === MODEL, "агент другой модели — под своей моделью, а не под этой");

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
  // Подсказка кнопки и значок в поиске по разделам — от системы; без подсказки — подпись
  ok(chip("lay:agent.models").title === "По моделям", "без hint подсказка кнопки — подпись раскладки: " + chip("lay:agent.models").title);
  const declared = TREE_LAYOUTS;
  layoutsApply(declared.map((l) => (l.id === "agent.models" ? Object.assign({}, l, { hint: { text: "Модель → агенты" }, icon: "server" }) : l)));
  aside();
  ok(chip("lay:agent.models")?.title === "Модель → агенты", "подсказка кнопки — hint раскладки: " + chip("lay:agent.models")?.title);
  const jumpSlice = jumpSources.flatMap((f) => { try { return f(); } catch (e) { return []; } }).find((x) => x.kind === "Срез" && x.title === "По моделям");
  ok(jumpSlice?.icon === "server", "значок среза в поиске по разделам — icon раскладки: " + jumpSlice?.icon);
  // Система объявила пустой список раскладок: кнопок срезов нет, кнопки «undefined» нет
  layoutsApply([]);
  aside();
  const bar = [...document.querySelectorAll("#aside .ph-slices button, #aside .ph-tail .ph-choice[data-slice], #aside [data-slice]")].map((b) => b.textContent).join("|");
  ok(!/undefined/.test(document.getElementById("aside").textContent) && !document.querySelector("#aside [data-slice]"), "layouts: [] — кнопок срезов нет и нет «undefined»: " + bar);
  layoutsApply(declared);
  treeReset(); aside();
  ok(await until(() => chip("lay:agent.models")?.title === "По моделям"), "раскладки вернулись");
  setSlice("lay:unknown");
  ok(slice === "lay:agent.models", "необъявленная раскладка — срез не меняется");
  // Поиск в своей раскладке находит объект в непрочитанной ветке, а не «Ничего не найдено» по прочитанному
  setSlice("lay:agent.models");
  treeReset(); open.delete(MODEL); open.delete(CLOUD); renderTree();
  ok(await until(() => !!row(MODEL) && !row(REPORT)), "ветки моделей не прочитаны");
  setTreeQ("Агент отчётов");
  ok(await until(() => !!row(REPORT)), "поиск находит агента в непрочитанной ветке: " + treeRowsText().slice(0, 200));
  ok(!/Ничего не найдено/.test(treeRowsText()), "нет «Ничего не найдено», когда совпадение есть");
  ok(!!row(CLOUD) && !row(MODEL) && !row(LOOSE), "поиск сужает срез: видна только ветка совпадения");
  setTreeQ("Такого объекта нет");
  ok(await until(() => /Ничего не найдено/.test(treeRowsText())), "нет совпадений — «Ничего не найдено»");
  setTreeQ("");
  ok(await until(() => !!row(MODEL) && !!row(LOOSE)), "поиск снят — строки вернулись");
  // Статус сужает срез своей раскладки: «Выключен» — только агент без модели
  pickStatus("off");
  ok(await until(() => !!row(LOOSE) && !row(MODEL) && !row(CLOUD)), "статус «выключен» сужает срез: " + treeRowsText().slice(0, 200));
  pickStatus("");
  ok(await until(() => !!row(MODEL) && !!row(LOOSE)), "статус снят — модели снова видны");

  // Перебор срезов при переходе не спрашивает места в своей раскладке, где узла цели нет: ответ там отбрасывается.
  // Система без «папок» (среза «Оборудование» нет), цель — инструмент, которого нет ни в одной своей раскладке
  {
    const declared = TREE_LAYOUTS;
    layoutsApply(declared.filter((l) => l.id !== "folders"));
    setSlice("lay:agent.pipelines"); treeReset(); aside();
    ok(!chip("all") && slice === "lay:agent.pipelines", "без folders среза «Оборудование» нет: " + slice);
    const realGet = API.get, asked = [];
    API.get = function (path, params) { if (path === "/tree/paths" && params && params.layout === "agent.models") asked.push(params.ids); return realGet.apply(this, arguments); };
    try {
      openNode(TOOL, { app: "hw" });
      await until(() => sel === TOOL);
      await new Promise((r) => setTimeout(r, 1500));
    } finally { API.get = realGet; layoutsApply(declared); treeReset(); setSlice("all"); aside(); }
    ok(asked.length <= 1, "место в чужой своей раскладке спрошено один раз (layElsewhere), а не на каждом переборе: " + asked.length);
  }

  // Вход по ссылке #node=…&slice=lay:agent.models: срез открывается после kindsLoad, строка цели выбрана
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;width:1200px;height:800px;left:-3000px;top:0;border:0";
  f.src = new URL(`${location.pathname}?fixture=agents#node=${AGENT}&slice=lay:agent.models`, location.href).href;
  document.body.appendChild(f);
  try {
    const w = () => f.contentWindow;
    ok(await until(() => w()?.appReady && w().eval("slice") === "lay:agent.models" && !!f.contentDocument.querySelector(`#tree .n.on[data-pick="${AGENT}"]`), 60000), "ссылка со срезом lay:agent.models открывает срез и строку агента: " + (w()?.appReady ? w().eval("slice") : ""));
  } finally { f.remove(); }
  setSlice("all");
});
