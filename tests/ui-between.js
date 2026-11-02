/* Сценарий интерфейса: «Автоматизация» → «Между камерами», документ V/07.5 отдельно от правил. */
UiCheck(async ({ ok, until, confirmWith }) => {
  goApp("rules");
  const inTree = () => document.querySelector('#tree [data-go="rule:between"]');
  ok(!!inTree(), "пункт в дереве раздела");
  ruleOpen("between");
  ok(await until(() => SCEN.doc), "документ прочитан");
  ok(rule === "between" && /Сценариев нет/.test(document.getElementById("main").textContent), "пусто, это не правила");
  const n0 = rules.length;
  scenNew();
  scenSet("name", "Ворота — двор");
  const cams = devicePool.filter((n) => n.type === "camera" && deviceDomain(n.id) === SCEN.did);
  scenCamSet("when", cams[0].id);
  scenCamSet("then", cams[1].id);
  scenSet("n", 3);
  scenSave();
  ok(await until(() => SCEN.doc.items.length === 1 && !SCEN.edit), "записан документ");
  ok(rules.length === n0, "в правилах записи нет");
  const srv = await API.get(`/domains/${SCEN.did}/scenarios`);
  ok(srv.items[0].then.n === 3 && srv.items[0].when.deviceId === cams[0].id, "на сервере: deviceId, пресет");
  ok(/нет данных от исполнителя/.test(document.getElementById("main").textContent), "пульса нет — словами");
  // Пульс исполнителя на странице не подделать: состояние задаётся как ответ двери, сам ответ проверяет tests/api-pages.js
  SCEN.status = [{ name: "Ворота — двор", phase: "refused", reason: "нет PTZ", asked: 1, outcomes: { performed: 0, refused: 1, expired: 0, unknown: 0 } }];
  paint();
  ok(/нет PTZ/.test(document.getElementById("main").textContent), "отказ цели виден в строке");
  // Поиск камеры: через сервер, найденное — в кэш
  scenNew();
  scenCamFind("when", cams[0].name);
  ok(await until(() => SCEN.found.when.some((x) => x.id === cams[0].id)), "камера найдена поиском");
  scenCancel();
  // Чужая правка: 412 — перечитать и сказать, что изменилось
  const base = SCEN.doc;
  await API.put(`/domains/${SCEN.did}/scenarios`, { items: [Object.assign({}, srv.items[0], { name: "Чужое" })] }, base.version);
  ok(await until(() => SCEN.doc.items[0].name === "Чужое"), "чужая правка пришла потоком");
  SCEN.doc = base;
  scenEdit(0);
  // Чтение из потока пришло под открытой правкой: запись всё равно судится версией, с которой она начата
  await scenLoad(SCEN.did);
  ok(SCEN.doc !== base && SCEN.edit.base === base, "правка держится за свой документ");
  scenSet("name", "Моё");
  scenSave();
  ok(await until(() => /Документ изменился/.test(SCEN.note)), "конфликт: " + SCEN.note);
  ok(/Чужое|Ворота/.test(SCEN.note) && SCEN.doc.items[0].name === "Чужое", "показано, что изменилось, документ свежий");
  // Удаление: с вводом числа и отсчётом
  SCEN.edit = null;
  scenDelAsk(0);
  ok(!!document.getElementById("confirmCountInp"), "удаление — с вводом числа");
  await confirmWith(1);
  ok(await until(() => SCEN.doc.items.length === 0, 15000), "снят после отсчёта");
});
