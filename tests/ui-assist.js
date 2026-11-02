/* Сценарии интерфейса: ассистент. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until }) => {
  // Вход — из поиска: вместо «Ничего не найдено» кнопка, набранное уходит просьбой, запрос поиска снимается
  const inp = document.getElementById("gq");
  inp.value = "выключи запись Главный вход";
  goInput(inp.value);
  ok(document.getElementById("goAsk") && !/Ничего не найдено/.test(document.getElementById("gopop").textContent), "вместо «Ничего не найдено» — кнопка ассистента");
  asstFromSearch();
  ok(await until(() => document.getElementById("asstApply")), "из поиска — сразу план");
  ok(inp.value === "" && treeQ === "", "запрос поиска снят");
  goClose();
  const camId = (await uiDevices()).find((d) => d.type === "camera" && d.name.includes("Главный вход")).id;
  const before = (await API.get(`/devices/${camId}`)).recordMode;
  const say = (t) => { asst.text = t; document.getElementById("asstSend").click(); };
  const body = () => document.getElementById("gopop").textContent;

  // Вопрос и ответ
  asstOpen("");
  ok(document.getElementById("gopop").classList.contains("asst") && !document.getElementById("bmodal").classList.contains("open"), "ассистент на месте списка, окна нет");
  ok(document.activeElement.id === "asstText", "курсор в поле просьбы");
  say("выключи запись");
  ok(await until(() => document.getElementById("asstAsk")), "ассистент спросил");
  // Ответ строит план, без «Применить» ничего не записано
  say("Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "план показан");
  ok(/Камеры: \d+/.test(body()) && body().includes("recordMode"), "кого выбрали и что меняется");
  ok((await API.get(`/devices/${camId}`)).recordMode === before, "без «Применить» ничего не записано");
  // Применить, итог по устройствам, отменить
  document.getElementById("asstApply").click();
  ok(await until(() => /применено/.test(body())), "итог по устройствам");
  ok((await API.get(`/devices/${camId}`)).recordMode === "none", "записано на сервере");
  ok(await until(() => find(camId)?.n.rec === "none"), "дерево обновилось потоком");
  document.getElementById("asstUndo").click();
  ok(await until(() => !document.getElementById("asstUndo")), "отмена выполнена");
  ok(await until(() => find(camId)?.n.rec === before), "значение вернулось");

  // Отказ: без плана
  say("поменяй маску сети");
  ok(await until(() => document.getElementById("asstRefused")), "отказ показан");
  ok(!document.getElementById("asstApply"), "плана нет");
  // Устаревший план: строка failed и «Спросить заново»
  goClose();
  asstOpen();
  say("выключи запись Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "новый план");
  const d = await API.get(`/devices/${camId}`);
  await API.patch(`/devices/${camId}`, { name: d.name + " 2" }, d.version);
  document.getElementById("asstApply").click();
  ok(await until(() => document.getElementById("asstAgain")), "устройство изменилось — предложено спросить заново");
  // Закрыть окно — отменить ход
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  ok(asst === null && !document.getElementById("gopop").classList.contains("open"), "клик мимо закрыл, секреты забыты");

  // План правил. Тип называет форма: вне раздела правил поля нет, в разделе — rules
  const kinds = [], stream = API.stream;
  API.stream = (p, b, ...r) => { kinds.push(b.kind); return stream(p, b, ...r); };
  const R1 = "70000001-0000-4000-8000-000000000000";
  const server = (id) => API.get("/rules/" + id);
  const rows = () => [...document.querySelectorAll("[data-asst-row]")].map((e) => e.dataset.asstRow);
  const talk = (t) => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); asstOpen(""); say(t); };
  const planRules = async (rules) => { asst.plan = null; asst.result = null; asstEvent(asst, { type: "plan", summary: "Test", context: "c", rules }); return until(() => document.getElementById("asstApply")); };
  asstOpen("");
  say("выключи запись Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "план устройств, как раньше");
  ok(kinds.join() === "" && kinds.length === 1, "вне раздела правил поля kind нет");
  ok(!!asst.plan.items && !asst.plan.rules, "плана правил нет — поведение прежнее");
  document.getElementById("asstDecline").click();
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  goApp("rules");

  // Новое правило: показ словами формы, модель подписана, ход ничего не записал, запись — по нажатию, наблюдающим
  const count0 = (await API.get("/rules")).items.length;
  asstOpen("");
  say("при движении на Запасной вход пиши 5 минут");
  ok(await until(() => document.getElementById("asstApply")), "план правил показан в том же окне");
  ok(kinds[1] === "rules", "в разделе правил просьба с kind: rules");
  ok(/Новое правило «Запись при движении: Запасной вход»/.test(body()) && /Детектор: движение/.test(body()) && /Записывать/.test(body()), "показ словами формы: " + body().slice(0, 200));
  ok(/Слова модели: Create a rule/.test(body()), "сводка модели отдельно и подписана");
  ok(/Только журнал/.test(body()), "рядом — что заведётся наблюдающим");
  ok((await API.get("/rules")).items.length === count0, "ход ничего не записал");
  document.getElementById("asstApply").click();
  ok(await until(() => rows().length === 1), "итог по записям");
  const madeId = (await API.get("/rules")).items.find((x) => x.name === "Запись при движении: Запасной вход").id, made = await server(madeId);
  ok(made.enabled && made.logOnly && made.owner === "" && made.runAsRoleId === null && made.logOnlySince, "заведено наблюдающим, умолчания перевода");
  ok(await until(() => rules.some((x) => x.id === madeId)), "правило пришло в раздел потоком");

  // Правило от модели включённым и действующим форма такой не заводит; выключенное остаётся выключенным
  talk("при движении на Запасной вход пиши 5 минут");
  ok(await until(() => document.getElementById("asstApply")), "снова план");
  await planRules([{ table: "scenarios", op: "create", body: Object.assign({}, asst.plan.rules[0].body, { name: "Действующее от модели", enabled: true, logOnly: false }) },
    { table: "scenarios", op: "create", body: Object.assign({}, asst.plan.rules[0].body, { name: "Выключенное от модели", enabled: false, logOnly: false }) }]);
  ok(/Заведётся выключенным/.test(body()), "выключенное названо");
  document.getElementById("asstApply").click();
  ok(await until(() => rows().join() === "ok,ok"), "обе записи: " + rows().join());
  const all = (await API.get("/rules")).items, live = all.find((x) => x.name === "Действующее от модели"), off = all.find((x) => x.name === "Выключенное от модели");
  ok(live.enabled && live.logOnly, "включённое — только наблюдает");
  ok(!off.enabled, "выключенное — выключенным");

  // Правка: было и станет, выпавшее названо, запись только по нажатию; наблюдения не заводит
  const r0 = await server(R1);
  talk("в правиле Охрана входа ночью убери условия");
  ok(await until(() => document.getElementById("asstApply")), "план правки");
  ok(document.querySelectorAll("[data-asst-gone]").length === r0.conditions.length && /Условие 1/.test(body()) && /выпадает/.test(body()), "выпавшие условия видны до «Применить»: " + body().slice(0, 240));
  ok(/наблюдения нет/.test(body()), "предел назван");
  ok((await server(R1)).version === r0.version, "ход ничего не записал");
  document.getElementById("asstApply").click();
  ok(await until(() => rows().join() === "ok"), "записано");
  const r1 = await server(R1);
  ok(r1.conditions.length === 0 && r1.steps.length === r0.steps.length && r1.logOnly === r0.logOnly && r1.triggers.length === r0.triggers.length, "PUT целиком: чтение поверх изменённого, наблюдения нет");
  talk("в правиле Охрана входа ночью убери шаг");
  ok(await until(() => document.querySelectorAll("[data-asst-gone]").length === 1), "выпавший шаг виден: " + body().slice(0, 240));

  // Чужая версия: правило изменили после показа — строка отказа, чужая правка на месте
  await API.put("/rules/" + R1, Object.assign(ruleBody(rules.find((x) => x.id === R1)), { purpose: "чужая правка" }), (await server(R1)).version);
  document.getElementById("asstApply").click();
  ok(await until(() => rows().join() === "fail"), "VERSION_MISMATCH — отказ строки");
  ok(/изменился/.test(body()) && document.getElementById("asstAgain"), "причина словами, предложено спросить заново");
  const r2 = await server(R1);
  ok(r2.purpose === "чужая правка" && r2.steps.length === r0.steps.length, "чужая правка на месте, шаг не выпал");

  // Частичная запись: какие прошли, какая нет, зависящее от незаписанного не идёт и названо
  const sc = (await API.get("/schedules")).items.find((x) => !x.builtin), { id: scId, version: scV, builtin: scB, ...scBody } = sc;
  talk("при движении на Запасной вход пиши 5 минут");
  ok(await until(() => document.getElementById("asstApply")), "план");
  const base = asst.plan.rules[0].body;
  await planRules([{ table: "scenarios", op: "create", body: Object.assign({}, base, { name: "Прошло" }) },
    { table: "scenarios", op: "update", id: "70000099-0000-4000-8000-000000000000", body: { purpose: "нет такого" } },
    { table: "schedules", op: "create", ref: "bad", body: Object.assign({}, scBody, { name: " " }) },
    { table: "scenarios", op: "create", body: Object.assign({}, base, { name: "Со ссылкой", conditions: [{ kind: "time", scheduleId: "@bad" }] }) },
    { table: "scenarios", op: "create", body: Object.assign({}, base, { name: "Последнее" }) }]);
  document.getElementById("asstApply").click();
  ok(await until(() => rows().length === 5), "по строке на запись, молчаливых пропусков нет");
  ok(rows().join() === "ok,fail,fail,fail,ok", "какие прошли, какие нет: " + rows().join());
  ok(/не записано: не создано «bad»/.test(body()), "зависящая запись названа");
  const names = (await API.get("/rules")).items.map((x) => x.name);
  ok(names.includes("Прошло") && names.includes("Последнее") && !names.includes("Со ссылкой"), "записанное осталось, отката нет");

  // Новое расписание плана: виден по имени, правило получает его id. Форма принимает любой законный RuleWrite
  talk("при движении на Запасной вход пиши 5 минут, новое расписание");
  ok(await until(() => document.getElementById("asstApply")), "план с расписанием");
  ok(/Смена из просьбы/.test(body()) && !/удалённое расписание/.test(body()), "условие называет новое расписание: " + body().slice(0, 260));
  const ruleName = asst.plan.rules[1].body.name + " со сменой";
  asst.plan.rules[1].body.name = ruleName;
  document.getElementById("asstApply").click();
  ok(await until(() => rows().join() === "ok,ok"), "расписание и правило: " + rows().join());
  const withSc = (await API.get("/rules")).items.find((x) => x.name === ruleName), newSc = (await API.get("/schedules")).items.find((x) => x.name === "Смена из просьбы");
  ok(withSc.conditions[0].scheduleId === newSc.id, "ссылка «@ref» — id созданного");
  await planRules([{ table: "scenarios", op: "create", body: Object.assign({}, base, { name: "Детектор от модели", steps: [{ source: "det", action: "detect", target: base.steps[0].target, detectorKind: "motion", minutes: 5 }] }) }]);
  document.getElementById("asstApply").click();
  ok(await until(() => rows().join() === "ok"), "законный RuleWrite с det/detect форма не отказывает");

  // Окно: ссылка на новое расписание — телом окна, без POST /schedules; окно выключено, что бы ни пришло в плане
  const posts = [], post = API.post;
  API.post = (p, ...r) => { posts.push(p); return post(p, ...r); };
  const schCount = async () => (await API.get("/schedules")).items.length;
  const s0 = await schCount();
  talk("заведи окно обслуживания по новому расписанию");
  ok(await until(() => document.getElementById("asstApply")), "план окна");
  ok(/Отдельно не записывается: идёт телом окна/.test(body()) && /Новое окно обслуживания «Окно из просьбы»/.test(body()) && /Заведётся выключенным/.test(body()), "показ окна: " + body().slice(0, 240));
  asst.plan.rules[1].body.enabled = true;
  posts.length = 0;
  document.getElementById("asstApply").click();
  ok(await until(() => rows().join() === "ok,ok"), "окно записано: " + rows().join());
  ok(posts.join() === "/maintenance-windows", "двери: " + posts.join());
  ok(/записано телом окна/.test(body()), "строка расписания названа");
  const w1 = (await API.get("/maintenance-windows")).items.find((x) => x.name === "Окно из просьбы");
  ok(w1 && w1.enabled === false, "новое окно выключено, хотя в плане стояло включённым");
  ok((await API.get("/schedules/" + w1.scheduleId)).owner?.id === w1.id, "расписание принадлежит окну");
  ok(await schCount() === s0 + 1, "расписание одно: своё у окна");

  // Ссылка и от правила, и от окна: расписание — POST /schedules, у правила id, у окна строка объектом
  talk("при движении на Запасной вход пиши 5 минут, новое расписание, окно обслуживания");
  ok(await until(() => document.getElementById("asstApply")), "план с окном и правилом");
  ok(!/Отдельно не записывается/.test(body()), "расписание записывается своей строкой");
  const both = asst.plan.rules[1].body.name + " с окном";
  asst.plan.rules[1].body.name = both;
  posts.length = 0;
  document.getElementById("asstApply").click();
  ok(await until(() => rows().join() === "ok,ok,ok"), "все три записи: " + rows().join());
  ok(posts.join() === "/schedules,/rules,/maintenance-windows", "двери по порядку: " + posts.join());
  const r3 = (await API.get("/rules")).items.find((x) => x.name === both);
  ok((await API.get("/schedules/" + r3.conditions[0].scheduleId)).name === "Смена из просьбы", "у правила — id созданной строки");

  // Окно с готовым расписанием — копия его строки. Правки расписания и окна нет: отказ строкой, без записи
  talk(`заведи окно обслуживания по расписанию ${sc.name}`);
  ok(await until(() => document.getElementById("asstApply")), "план окна с готовым расписанием");
  ok(asst.plan.rules[0].body.schedule.name === sc.name, "копия строки в теле");
  document.getElementById("asstApply").click();
  ok(await until(() => rows().join() === "ok"), "записано: " + rows().join());
  const sc1 = await API.get("/schedules/" + sc.id), w2 = (await API.get("/maintenance-windows")).items.find((x) => x.name === "Окно из просьбы" && x.id !== w1.id);
  await planRules([{ table: "schedules", op: "update", id: sc.id, body: { name: "Нельзя" } }, { table: "windows", op: "update", id: w1.id, body: { enabled: true } }]);
  ok(/только заводит/.test(body()), "отказ виден до «Применить»");
  posts.length = 0;
  const puts = [], put = API.put;
  API.put = (p, ...r) => { puts.push(p); return put(p, ...r); };
  document.getElementById("asstApply").click();
  ok(await until(() => rows().join() === "fail,fail"), "обе строки — отказ: " + rows().join());
  ok(!posts.length && !puts.length, "ни одной записи");
  ok((await API.get("/schedules/" + sc.id)).version === sc1.version && (await API.get("/maintenance-windows/" + w1.id)).enabled === false && w2, "всё на месте");
  API.post = post;
  API.put = put;

  // logOnlySince — дата записи по часам сервера
  const srvDay = localStamp((await API.get("/me")).serverTime).slice(0, 10);
  ok(made.logOnlySince === srvDay, "дата записи: " + made.logOnlySince);

  // Плана нет: вопрос и отказ — как раньше
  talk("при движении на Запасной вход спроси оператора");
  ok(await until(() => /странице консоли/.test(document.getElementById("asstRefused")?.textContent || "")), "отказ со словом о странице консоли");
  ok(!document.getElementById("asstApply"), "плана нет");
  API.stream = stream;
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

  // Настоящая мышь, а не вызов функции: кнопка перерисовывает окно на mousedown и уходит из DOM, окно при этом не закрывается
  goApp("hw");
  const mouse = (el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  const press = (el) => ["mousedown", "mouseup", "click"].forEach((type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })));
  const typed = (t) => { asst.text = t; press(document.getElementById("asstSend")); };
  const popOpen = () => document.getElementById("gopop").classList.contains("open");
  inp.value = "выключи запись Главный вход";
  goInput(inp.value);
  ok(document.getElementById("goAsk"), "кнопка ассистента в поиске");
  mouse(document.getElementById("goAsk"));
  ok(asst && popOpen(), "мышь по кнопке: окно открыто, ход идёт");
  ok(await until(() => document.getElementById("asstApply")), "мышь по кнопке: ход дошёл до плана");
  press(document.getElementById("asstDecline"));
  ok(asst && popOpen() && !document.getElementById("asstApply"), "«Отказаться» мышью: окно открыто");
  mouse(document.body);
  asstOpen("");
  typed("выключи запись");
  ok(await until(() => document.getElementById("asstAsk")), "«Отправить» мышью: вопрос");
  ok(asst && popOpen(), "окно открыто");
  typed("Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "ответ на вопрос мышью: план");
  press(document.getElementById("asstApply"));
  ok(await until(() => /применено/.test(body())), "«Применить» мышью: итог");
  ok(asst && popOpen(), "окно открыто после «Применить»");
  mouse(document.getElementById("asstText"));
  ok(asst && popOpen(), "мышь внутри окна его не закрывает");
  mouse(document.body);
  ok(asst === null && !popOpen(), "мышь мимо закрывает");
  // Выбор строки поиска мышью: окно закрывается, переход выполнен
  inp.value = "";
  goInput("");
  const row = [...document.querySelectorAll("#gopop .gores")].find((x) => /Автоматизация/.test(x.textContent));
  ok(row, "строка раздела в списке");
  mouse(row);
  ok(!popOpen() && app === "rules", "строка мышью: список закрыт, переход выполнен");
  goApp("hw");
});
