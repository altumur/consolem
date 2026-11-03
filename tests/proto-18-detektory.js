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

  // Зоны рисуются в окне: кадр в мастере, рисование включено сразу, линии — первыми
  dcStepGo(2);
  ok(dcStepKey() === "zones" && box().querySelector("[data-live] svg[data-zone]"), "кадр в окне мастера");
  const rows = dcRows();
  ok(rows.length === 4 && rows[0].line && rows[1].line && !rows[2].line, "строки: сначала детекторы линии");
  ok(zoneDraw?.id === rows[0].id && zoneDraw.shape === "line", "первая строка сразу рисует линию");
  zoneSave(rows[0].id, { shape: "line", points: [[0.1, 0.1], [0.9, 0.9]] });
  ok(dcZoneOf(rows[0].id)?.shape === "line", "линия записана в черновик");
  // Зона, нарисованная рукой, копией не заменяется
  zoneSave(rows[1].id, { shape: "line", points: [[0.2, 0.2], [0.8, 0.8]] });
  dcZonePick(rows[0].id);
  dcZoneCopy();
  ok(dcZoneOf(rows[1].id).points[0][0] === 0.2, "копия не заменила зону, нарисованную рукой");
  ok(dc.zoneAt === rows[2].id && zoneDraw?.shape === "rect", "дальше — строки другой формы");
  zoneSave(rows[2].id, { shape: "rect", points: [[0.1, 0.1], [0.5, 0.5]] });
  dcZoneCopy();
  ok(dc.zoneBy[rows[3].id]?.from && dcStepKey() === "rule", "копия помечена, мастер перешёл к правилу");

  // Правило: разделы как в карточке, архив — из списка, id уходит в правило
  const sec = [...box().querySelectorAll(".dc-sec")].map((x) => x.textContent);
  ok(["Если", "При условии", "То"].every((t) => sec.includes(t)), "разделы Если, При условии, То");
  ok(dc.custom.then[0].action === "record", "в «То» сразу запись");
  const sel = box().querySelector('select[aria-label*="Архив"]');
  ok(sel && sel.options[1].value === arch.find((x) => archRowOk(x) || x.id === sel.options[1].value)?.id, "архив выбирается из списка");
  setActionField("0", "archive", sel.options[1].value);
  const archive = dc.custom.then[0].archive;
  addCond();
  ok(dc.custom.cond.length === 1, "условие добавлено в окне");
  // Окно поверх мастера возвращает к мастеру
  rulePickRef("then", "0");
  ok(!box(), "выбор устройства открыт");
  closeBulkModal();
  ok(box(), "«Отменить» вернула к мастеру");
  const saved = ruleClone(dc.custom.then);
  ruleEdit((r) => { r.then = []; });
  ok(!dcRuleOk(dcTrigs(dcPlan(detCams(), []), [])), "без действий дальше нельзя");
  ruleEdit((r) => { r.then = saved; });

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
});
