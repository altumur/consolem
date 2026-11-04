/* Прототип 18, срез «Детекторы»: мастер создания, зоны и правило внутри мастера, черновик. Запуск — только
   python tools/check_ui.py --page index_18_detektory-spisok.html tests/proto-18-detektory.js
   В общий набор (tests/ui-*.js) сценарий войдёт при переносе в index.html. */
UiCheck(async ({ ok, until }) => {
  const KEY = "cfg.detCreate";
  const box = () => document.querySelector("#bmodal.open .dc-box");
  const dock = () => document.getElementById("dcDock");
  localStorage.removeItem(KEY);
  goApp("hw");
  setSlice("det");

  // Шаги: без выбранного дальше нельзя, на сервер ничего не уходит до «Создать»
  detCreateOpen();
  ok(await until(() => dc && dc.ready), "мастер прочитал камеры");
  ok(dcSteps().map((x) => x.k).join() === "what,cams,zones,rule,end", "пять шагов");
  const dets = async () => {
    const out = [];
    let cursor = null;
    do {
      const r = await API.get("/devices", { type: "det", cursor, limit: 100 });
      out.push(...r.items);
      cursor = r.nextCursor || null;
    } while (cursor);
    return out;
  };
  const before = (await dets()).length;
  const line = "s:" + DET_TYPES.find((t) => DET_KIND_CODE[t] === "linecross");
  const area = "s:" + DET_TYPES.find((t) => DET_KIND_CODE[t] === "motion");
  dcItemToggle(line, true);
  dcItemToggle(area, true);
  const cams = detCams().filter((c) => !dcWhy(c, line) && !dcWhy(c, area)).slice(0, 2);
  ok(cams.length === 2, "есть две подходящие камеры");
  cams.forEach((c) => dcCamToggle(c.id, true));
  // Окно идёт за шагом: ширина от шага, высота не больше экрана, верх на месте
  const fitH = () => parseFloat(box().style.height);
  const top0 = box().getBoundingClientRect().top;
  ok(box().classList.contains("dc-w-what"), "ширина шага «Что создать»");
  dcStepGo(1);
  ok(box().classList.contains("dc-w-cams") && box().getBoundingClientRect().top === top0, "ширина шага «На каких камерах», верх окна на месте");
  ok(fitH() > 0 && fitH() <= innerHeight * 0.92 + 1, "высота задана и не больше экрана");
  // Фильтр не сжимает окно и посреди перехода
  const camsH = fitH();
  dc.q = "нет такой камеры";
  renderDetCreate();
  ok(fitH() === camsH, "поиск не сжимает окно камер");
  dc.q = "";
  renderDetCreate();
  ok(cams.every((c) => dc.cams.has(c.id)), "камеры на месте");

  // Зоны рисуются в окне: кадр в мастере, рисование включено сразу, линии — первыми
  dcStepGo(2);
  ok(dcStepKey() === "zones" && box().querySelector("[data-live] svg[data-zone]"), "кадр в окне мастера");
  const rows = dcRows();
  ok(rows.length === 4 && rows[0].line && rows[1].line && !rows[2].line, "строки: сначала детекторы линии");
  ok(zoneDraw?.id === rows[0].id && zoneDraw.shape === "line", "первая строка сразу рисует линию");
  zoneSave(rows[0].id, { shape: "line", points: [[0.1, 0.1], [0.9, 0.9]] });
  ok(dcZoneOf(rows[0].id)?.shape === "line", "линия записана в черновик");
  const marks = () => box().querySelectorAll(".dc-z-mark.on").length;
  const counter = () => box().querySelector(".dc-z-cnt").textContent;
  ok(marks() === 1 && counter() === "Настроено 1 из 4", "камера с зоной получила галочку, счётчик 1 из 4");
  // Детектору линии прямоугольник не подходит: галочки нет
  zoneSave(rows[0].id, { shape: "rect", points: [[0.1, 0.1], [0.5, 0.5]] });
  ok(marks() === 0, "прямоугольник у детектора линии галочки не даёт");
  zoneSave(rows[0].id, { shape: "line", points: [[0.1, 0.1], [0.9, 0.9]] });
  // Зона, нарисованная рукой, копией не заменяется
  zoneSave(rows[1].id, { shape: "line", points: [[0.2, 0.2], [0.8, 0.8]] });
  dcZonePick(rows[0].id);
  dcZoneCopy();
  ok(dcZoneOf(rows[1].id).points[0][0] === 0.2, "копия не заменила зону, нарисованную рукой");
  ok(dc.zoneAt === rows[2].id && zoneDraw?.shape === "rect", "дальше — строки другой формы");
  zoneSave(rows[2].id, { shape: "rect", points: [[0.1, 0.1], [0.5, 0.5]] });
  dcZoneCopy();
  ok(dc.zoneBy[rows[3].id]?.from && dcStepKey() === "rule", "копия помечена, мастер перешёл к правилу");
  dcStepGo(dcSteps().findIndex((x) => x.k === "zones"));
  ok(marks() === 4 && box().querySelectorAll(".dc-z-mark.copy").length === 1 && counter() === "Настроено 4 из 4", "у копии контурная галочка, счётчик 4 из 4");
  dcStepGo(dcSteps().findIndex((x) => x.k === "rule"));

  // Правило: сначала простой вид — «Если» и один выбор «То»
  const secs = () => [...box().querySelectorAll(".dc-sec")].map((x) => x.textContent);
  const opts = () => [...box().querySelectorAll(".rl-opt b")].map((x) => x.textContent);
  const onOpt = () => box().querySelector(".rl-opt.on b")?.textContent;
  ok(!dc.rule.adv && box().classList.contains("dc-w-rule"), "шаг открылся в простом виде");
  ok(secs().includes("Если") && secs().includes("То") && !secs().includes("При условии"), "разделы простого вида: Если, То");
  ok(onOpt() === "Записывать видео" && dc.custom.then.length === 1 && dc.custom.then[0].action === "record", "по умолчанию запись");
  ok(opts().includes("Записывать и поднять тревогу") && !opts().includes("Поднять тревогу"), "тревоги без записи в простом виде нет");
  const sel = box().querySelector('select[aria-label*="Архив"]');
  ok(sel && sel.options[1].value === arch.find((x) => archRowOk(x) || x.id === sel.options[1].value)?.id, "архив выбирается из списка");
  setActionField("0", "archive", sel.options[1].value);
  const archive = dc.custom.then[0].archive;
  dcRecLen("30");
  ok(dc.custom.then[0].minutes === 30 && dc.custom.then[0].dur === "min", "длительность записи задаётся в простом виде");

  // Тревога расширяет запись: запись первая, её настройки те же
  dcRulePick("alarm");
  ok(onOpt() === "Записывать и поднять тревогу" && box().querySelector('select[aria-label*="Архив"]'), "вариант с тревогой выбран, настройки записи видны");
  ok(dc.custom.then.map((x) => x.action).join() === "record,alarm" && dc.custom.then.every((x) => x.ref === "$src"), "запись и тревога с камеры события");
  ok(dc.custom.then[0].minutes === 30 && dc.custom.then[0].archive === archive, "настройки записи сохранились");
  ok(dcRuleOk(dcTrigs(dcPlan(dcUniverse(), []), [])), "такое правило верно");
  dcRulePick("none");
  ok(onOpt() === "Ничего не делать" && dc.rule.mode === "none", "можно без правила");
  dcRulePick("alarm");
  ok(dc.rule.mode === "new" && dc.custom.then.length === 2 && dc.custom.then[0].minutes === 30, "возврат не теряет настройку");
  dcRulePick("record");
  ok(dc.custom.then.length === 1 && dc.custom.then[0].minutes === 30 && dc.custom.then[0].archive === archive, "без тревоги остаётся та же запись");

  // Подробный вид правит то же правило на том же шаге, и окно шире
  dcRuleAdv(true);
  ok(box().classList.contains("dc-w-rule-adv") && ["Если", "При условии", "То"].every((t) => secs().includes(t)), "подробный вид: Если, При условии, То");
  ok(box().querySelector('select[aria-label*="Архив"], .rl-f select') && dc.custom.then[0].minutes === 30, "подробный вид показывает выбранную запись");
  addCond();
  ok(dc.custom.cond.length === 1, "условие добавлено в окне");
  // Окно поверх мастера открывается со своим размером и возвращает к мастеру
  rulePickRef("then", "0");
  ok(!box() && document.querySelector("#bmodal .bbox").style.height === "", "выбор устройства открыт со своим размером");
  closeBulkModal();
  ok(box() && dc.rule.adv, "«Отменить» вернула к мастеру");
  const saved = ruleClone(dc.custom.then);
  ruleEdit((r) => { r.then = []; });
  ok(!dcRuleOk(dcTrigs(dcPlan(detCams(), []), [])), "без действий дальше нельзя");
  ruleEdit((r) => { r.then = saved; });

  // Простой вид не теряет подробную настройку: показывает её и спрашивает перед заменой
  dcRuleAdv(false);
  ok(onOpt() === "Своё правило", "настройка с условием показана как «Своё правило»");
  dcRulePick("alarm");
  document.getElementById("confirmCancel").click();
  ok(dc.custom.cond.length === 1 && onOpt() === "Своё правило", "отказ от замены ничего не меняет");

  // Свернули: черновик цел, блок виден, возврат на тот же шаг
  dcMin();
  ok(!box() && dock() && JSON.parse(localStorage.getItem(KEY)).zoneBy[rows[0].id], "свёрнуто: черновик записан, блок виден");
  goApp("rules");
  ok(dock(), "блок виден в другом разделе");
  dcResume();
  ok(app === "hw" && box() && dcStepKey() === "rule" && !dock(), "возврат на тот же шаг");
  // Черновик читается заново, как после перезагрузки страницы
  dcMin();
  dc = null;
  dcResume();
  ok(await until(() => dc && dc.ready), "камеры прочитаны заново");
  ok(dc.items.size === 2 && dc.cams.size === 2 && dcZoneOf(rows[3].id) && dc.custom.cond.length === 1, "черновик восстановлен целиком");

  // Создание: зона уходит в create, правил по одному на вид
  dcStepGo(dcSteps().length - 1);
  ok((await dets()).length === before, "до «Создать» детекторов не прибавилось");
  dcRun();
  ok(!box() && !localStorage.getItem(KEY) && !dock(), "после «Создать» черновика нет");
  ok(await until(() => bq?.finished), "операция закончилась");
  ok((await dets()).length === before + 4, `созданы четыре детектора: ${(await dets()).length - before}`);
  const made = (await dets()).filter((x) => x.parentId === cams[0].id);
  const full = await Promise.all(made.map((x) => API.get(`/devices/${x.id}`)));
  ok(full.some((x) => x.zone?.shape === "line") && full.some((x) => x.zone?.shape === "rect"), "зоны прочитаны с сервера");
  ok(await until(() => rules.filter((r) => r.then[0]?.archive === archive).length === 2), "создано два правила с архивом");
  ok(rules.filter((r) => r.then[0]?.archive === archive).every((r) => r.when.length === 1 && r.cond.length === 1), "правило: одно событие, условие на месте");

  // Только детектор движения: запись всё равно на 10 минут, а сервер правила — из домена камеры
  const other = detCams().find((c) => nodeDomainId(c) !== scopedDomains()[0].id && !dcWhy(c, area));
  detCreateOpen();
  ok(await until(() => dc && dc.ready), "мастер открыт для камеры другого домена");
  dcItemToggle(area, true);
  if (other) dcCamToggle(other.id, true);
  dcStepGo(dcSteps().findIndex((x) => x.k === "rule"));
  ok(dc.custom.then[0].dur === "min" && dc.custom.then[0].minutes === 10, "запись на 10 минут и у вида с концом события");
  if (other) ok(dcRuleOk(dcTrigs(dcPlan(dcUniverse(), []), [])) && domainOf(dc.custom.server)?.id === nodeDomainId(other), "сервер правила — из домена камеры");
  // Подробную настройку заменяют только с согласия
  ruleEdit((r) => { r.cond.push(condNew((COND_KINDS.find(condDeclared) || COND_KINDS[0]).kind)); });
  dcRulePick("alarm");
  document.getElementById("confirmOk").click();
  ok(dc.custom.cond.length === 0 && dc.custom.then.map((x) => x.action).join() === "record,alarm", "согласие заменяет настройку записью и тревогой");
  dcRulePick("record");
  // Свернули из другого раздела: его экран не подменяется
  dcMin();
  goApp("rules");
  const main = document.getElementById("main").textContent;
  document.querySelector("#dcDock .btn.pri").click();
  ok(app === "hw" && box(), "«Продолжить» из другого раздела открывает оборудование");
  dcMin();
  goApp("rules");
  dcCancel();
  document.getElementById("confirmOk").click();
  ok(app === "rules" && document.getElementById("main").textContent === main, "удаление черновика не меняет экран раздела");
  goApp("hw");
  setSlice("det");

  // «Отмена» спрашивает и удаляет черновик
  detCreateOpen();
  ok(await until(() => dc && dc.ready), "мастер открыт");
  dcItemToggle(area, true);
  dcCancel();
  document.getElementById("confirmCancel").click();
  ok(box() && localStorage.getItem(KEY), "«Остаться» сохраняет черновик");
  dcCancel();
  document.getElementById("confirmOk").click();
  ok(!dc && !box() && !localStorage.getItem(KEY) && !dock(), "«Удалить черновик» убирает всё");

  // Запись и тревога доходят до сервера одним правилом на вид
  const free = detCams().find((c) => !dcWhy(c, line));
  detCreateOpen();
  ok(await until(() => dc && dc.ready), "мастер открыт для правила с тревогой");
  dcItemToggle(line, true);
  dcCamToggle(free.id, true);
  dcStepGo(dcSteps().findIndex((x) => x.k === "rule"));
  dcRulePick("alarm");
  dcRun();
  ok(await until(() => rules.some((r) => r.name.endsWith("запись и тревога"))), "правило названо «запись и тревога»");
  const made2 = rules.find((r) => r.name.endsWith("запись и тревога"));
  ok(made2.then.map((x) => x.action).join() === "record,alarm" && made2.then.every((x) => x.ref === "$src"), "правило пишет и поднимает тревогу с камеры события");
  ok(await until(() => bq?.finished), "операция закончилась");
});
