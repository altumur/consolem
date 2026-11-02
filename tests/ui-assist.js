/* Сценарии интерфейса: ассистент. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until }) => {
  // Вход — из поиска: вместо «Ничего не найдено» кнопка, набранное уходит просьбой, запрос поиска снимается
  const inp = document.getElementById("gq");
  inp.value = "выключи запись Главный вход";
  goInput(inp.value);
  ok(document.getElementById("goAsk") && !/Ничего не найдено/.test(document.getElementById("gopop").textContent), "вместо «Ничего не найдено» — кнопка ассистента");
  ok(document.getElementById("goAsk").textContent === "Новый запрос ассистенту" && document.getElementById("goAsk").hasAttribute("data-empty"), "«Новый запрос ассистенту», поиск ничего не нашёл");
  asstFromSearch();
  ok(await until(() => document.getElementById("asstApply")), "из поиска — сразу план");
  ok(inp.value === "" && treeQ === "", "запрос поиска снят");
  goClose();
  const camId = (await uiDevices()).find((d) => d.type === "camera" && d.name.includes("Главный вход")).id;
  const before = (await API.get(`/devices/${camId}`)).recordMode;
  // Ответ и уточнение — в поле под ответом, клавиатурой, как человек. Строка поиска — новая просьба, новый разговор
  const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const enter = () => key(inp, "Enter");
  const typeQ = (t) => { inp.value = t; inp.dispatchEvent(new Event("input", { bubbles: true })); };
  const field = () => document.getElementById("asstText");
  const typeF = (t) => { const f = field(); f.focus(); f.value = t; f.dispatchEvent(new Event("input", { bubbles: true })); };
  const say = (t) => { typeF(t); key(field(), "Enter"); };
  const typeKeys = (e, t) => [...t].forEach((ch) => { key(e, ch); e.value += ch; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true })); });
  const body = () => document.getElementById("gopop").textContent;
  const PH = "Имя, IP, раздел, настройка…";

  // Вопрос и ответ
  asstOpen("");
  ok(document.getElementById("gopop").classList.contains("asst") && !document.getElementById("bmodal").classList.contains("open"), "ассистент на месте списка, окна нет");
  ok(field() && field().placeholder === "Просьба" && document.getElementById("asstSend")?.textContent === "Отправить", "под панелью своё поле и «Отправить»");
  ok(document.activeElement === field(), "курсор в поле просьбы");
  ok(!document.getElementById("asstClose") && !document.getElementById("asstNew") && !document.getElementById("asstKind") && !document.querySelector("[data-asst-kind]"), "«Закрыть», «Нового разговора» и типа нет");
  ok(inp.placeholder === PH, "подсказка строки поиска прежняя: " + inp.placeholder);
  say("выключи запись");
  ok(await until(() => document.getElementById("asstAsk")), "ассистент спросил");
  ok(field() && field().placeholder === "Ваш ответ" && field().value === "", "поле под вопросом, подпись «Ваш ответ», отправленное снято");
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
  ok(!document.getElementById("asstNew"), "«Нового разговора» нет и при итоге");
  goClose();

  // План правил. Поля типа нет ни в каком разделе: что за реплика, решает сервер по словам
  const kinds = [], stream = API.stream;
  API.stream = (p, b, ...r) => { kinds.push("kind" in b ? b.kind : "-"); return stream(p, b, ...r); };
  const R1 = "70000001-0000-4000-8000-000000000000";
  const server = (id) => API.get("/rules/" + id);
  const rows = () => [...document.querySelectorAll("[data-asst-row]")].map((e) => e.dataset.asstRow);
  const talk = (t) => { goClose(); asstOpen(""); say(t); };
  const planRules = async (rules) => { asst.plan = null; asst.result = null; asstEvent(asst, { type: "plan", summary: "Test", context: "c", rules }); return until(() => document.getElementById("asstApply")); };
  asstOpen("");
  say("выключи запись Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "план устройств, как раньше");
  ok(kinds.join() === "-", "вне раздела правил поля kind нет");
  ok(!!asst.plan.items && !asst.plan.rules, "плана правил нет — поведение прежнее");
  document.getElementById("asstDecline").click();
  goClose();
  goApp("rules");

  // Новое правило: показ словами формы, модель подписана, ход ничего не записал, запись — по нажатию, наблюдающим
  const count0 = (await API.get("/rules")).items.length;
  asstOpen("");
  say("при движении на Запасной вход пиши 5 минут");
  ok(await until(() => document.getElementById("asstApply")), "план правил показан в том же окне");
  ok(kinds[1] === "-", "в разделе правил поля kind тоже нет: план правил — по словам просьбы");
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

  // Вопрос оператору и эскалация — план, как любое новое правило: наблюдающим или выключенным, запуск никого не спрашивает
  const planned = async (said, word) => {
    talk(said);
    ok(await until(() => document.getElementById("asstApply")), "план: " + said);
    ok(word.test(body()), "шаг виден в плане: " + body().replace(/\s+/g, " ").slice(0, 240));
    const name = asst.plan.rules[0].body.name;
    document.getElementById("asstApply").click();
    ok(await until(() => rows().join() === "ok"), "записано: " + rows().join());
    return (await API.get("/rules")).items.find((x) => x.name === name);
  };
  const a1 = await planned("при движении на Запасной вход спроси оператора", /Спросить|Подтвердить движение/);
  ok(a1.enabled && a1.logOnly && a1.steps[0].control === "ask" && a1.steps[0].roleId === "80000003-0000-4000-8000-000000000000", "ask: «Только журнал», роль из просьбы");
  const a2 = await planned("эскалация при движении на Запасной вход", /Эскалац/);
  ok(a2.enabled && a2.logOnly && a2.steps[1].control === "escalate" && a2.steps[1].levels.length === 2, "escalate: «Только журнал»");
  await API.post("/rules/update", { idempotencyKey: opKey(), items: [a1, a2].map((x) => ({ ruleId: x.id, version: x.version, set: { enabled: false } })) });
  const a3 = await planned("при движении на Служебный вход спроси оператора, выключенным", /Заведётся выключенным/);
  ok(a3.enabled === false && a3.steps[0].control === "ask", "просили выключенным — выключено");
  const a4 = await planned("эскалация при движении на Служебный вход, выключенным", /Заведётся выключенным/);
  ok(a4.enabled === false && a4.steps[1].control === "escalate", "эскалация выключенным");
  ok(!(await API.get("/rule-prompts")).items.length, "вопросов нет");

  // Плана нет: вопрос и отказ — как раньше
  talk("проверь архив на Запасной вход");
  ok(await until(() => /странице консоли/.test(document.getElementById("asstRefused")?.textContent || "")), "отказ со словом о странице консоли");
  ok(!document.getElementById("asstApply"), "плана нет");
  API.stream = stream;
  goClose();

  // Настоящая мышь, а не вызов функции: кнопка перерисовывает окно на mousedown и уходит из DOM, окно при этом не закрывается
  goApp("hw");
  const mouse = (el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  const press = (el) => ["mousedown", "mouseup", "click"].forEach((type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })));
  // «Отправить» мышью
  const typed = (t) => { typeF(t); press(document.getElementById("asstSend")); };
  const popOpen = () => document.getElementById("gopop").classList.contains("open");
  inp.value = "выключи запись Главный вход";
  goInput(inp.value);
  ok(document.getElementById("goAsk"), "кнопка ассистента в поиске");
  mouse(document.getElementById("goAsk"));
  ok(asst && popOpen(), "мышь по кнопке: окно открыто, ход идёт");
  ok(await until(() => document.getElementById("asstApply")), "мышь по кнопке: ход дошёл до плана");
  ok(!document.getElementById("asstNew") && !document.getElementById("asstClose") && document.getElementById("asstSend")?.textContent === "Уточнить", "при плане «Уточнить», «Закрыть» и «Нового разговора» нет");
  press(document.getElementById("asstDecline"));
  ok(asst && popOpen() && !document.getElementById("asstApply"), "«Отказаться» мышью: окно открыто");
  goClose();
  asstOpen("");
  typed("выключи запись");
  ok(await until(() => document.getElementById("asstAsk")), "«Отправить» мышью: вопрос");
  ok(asst && popOpen(), "окно открыто");
  typed("Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "ответ на вопрос мышью: план");
  press(document.getElementById("asstApply"));
  ok(await until(() => /применено/.test(body())), "«Применить» мышью: итог");
  ok(asst && popOpen(), "окно открыто после «Применить»");
  mouse(field());
  ok(asst && popOpen(), "мышь в поле окна его не закрывает");
  mouse(document.getElementById("asstBlock"));
  ok(asst && popOpen(), "мышь внутри окна его не закрывает");

  // Уточнить план словами: обычный ход с context плана, план снят сразу, новый показан целиком
  goClose();
  asstOpen("");
  const said = [];
  API.stream = (p, b, ...r) => { said.push(b); return stream(p, b, ...r); };
  typed("включи запись Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "план для уточнения");
  const box = field(), planContext = asst.context;
  ok(box && box.placeholder === "Уточнить" && document.activeElement === box, "поле под планом, подпись «Уточнить», курсор в нём");
  ok(inp.placeholder === PH, "строка поиска под планом прежняя");
  ok(!/Секрет/.test(document.getElementById("asstBlock").textContent), "«Секрет» под планом нет");
  press(document.getElementById("asstSend"));
  ok(document.getElementById("asstApply"), "пустое уточнение план не снимает");
  typeF("и Переговорная");
  key(field(), "Enter");
  ok(asst.busy && !asst.plan && !document.getElementById("asstApply"), "идёт ход: плана и «Применить» нет");
  ok(document.querySelectorAll("#asstBlock .asst-said").length === 1 && document.querySelector("#asstBlock .asst-said").textContent === "› и Переговорная", "из разговора видна только последняя просьба");
  ok(said[1].context === planContext && said[1].text === "и Переговорная", "ход с context плана");
  ok(await until(() => document.getElementById("asstApply")), "новый план");
  ok(/Камеры: \d+/.test(body()) && /recordMode: none → always/.test(body()) && asst.context !== planContext && asst.context.includes("Переговорная"), "новый план целиком, было → станет: " + body().slice(0, 200));
  ok(document.activeElement === field(), "курсор снова в поле");
  say("поменяй маску сети");
  ok(await until(() => document.getElementById("asstRefused")), "уточнение кончилось отказом");
  ok(!asst.plan && !document.getElementById("asstApply"), "отказ: прежний план не вернулся");
  ok(document.querySelector("#asstBlock .asst-said").textContent === "› поменяй маску сети" && !document.querySelector("[data-asst-dropped]"), "видна последняя просьба, снятия планов не показаны");
  goClose();
  asstOpen("");
  typed("включи запись Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "снова план");
  asst.context = null;
  say("включи");
  ok(await until(() => document.getElementById("asstAsk")), "уточнение кончилось вопросом");
  ok(!asst.plan && !document.getElementById("asstApply"), "вопрос: прежний план не вернулся");
  API.stream = stream;

  // Клик мимо и Esc скрывают панель, разговор живёт, клик в строке поиска возвращает её в том же состоянии
  const blockEl = document.getElementById("asstBlock"), listEl = document.getElementById("goList");
  const seeing = () => asst && popOpen() && blockEl.getBoundingClientRect().height > 0;
  const keyQ = (k) => key(inp, k);
  goApp("hw");
  asstOpen("");
  say("включи запись");
  ok(await until(() => document.getElementById("asstAsk")), "вопрос ассистента");
  // После разговора клик в строку поиска и печать: ответ ассистента курсор и текст не забирает
  say("Главный вход");
  ok(document.activeElement === field(), "ответ пишут в поле: курсор там");
  press(inp);
  inp.focus();
  ok(await until(() => document.getElementById("asstApply")), "ответ дошёл до плана");
  ok(document.activeElement === inp && inp.value === "", "конец хода курсор из пустой строки поиска не забрал: " + document.activeElement?.id);
  typeKeys(inp, "камера");
  ok(document.activeElement === inp && inp.value === "камера", "курсор и набранное в строке поиска: " + document.activeElement?.id + " «" + inp.value + "»");
  ok(seeing() && document.getElementById("asstApply"), "панель с планом над поиском");
  typeQ("");
  asstOpen("");
  say("включи запись");
  ok(await until(() => document.getElementById("asstAsk")), "снова вопрос ассистента");
  const ctx = asst.context, talkId = asst;
  typeF("недописанный ответ");
  press(document.getElementById("tree"));
  ok(!popOpen() && asst === talkId && asst.ask && asst.context === ctx, "клик мимо скрыл панель, разговор на месте");
  press(inp);
  ok(seeing() && document.getElementById("asstAsk"), "клик в строке поиска вернул панель в том же состоянии");
  ok(field().value === "недописанный ответ", "набранное в поле на месте");
  keyQ("Escape");
  ok(!popOpen() && asst === talkId, "Esc в строке поиска скрыл панель, разговор на месте");
  inp.dispatchEvent(new FocusEvent("focus"));
  inp.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  ok(seeing(), "вернулась снова");
  field().focus();
  key(field(), "Escape");
  ok(!popOpen() && asst === talkId && asst.text === "недописанный ответ", "Esc в поле скрыл панель, разговор и набранное на месте");
  press(inp);
  ok(seeing(), "и снова вернулась");
  typeF("");

  // Ниже диалога — всё обычное поиска, порядок: диалог, потом секции. Ввод панель не закрывает
  ok(blockEl.compareDocumentPosition(listEl) & Node.DOCUMENT_POSITION_FOLLOWING, "секции поиска идут ниже диалога");
  ok(/Разделы/.test(listEl.textContent) && !/Разделы/.test(blockEl.textContent), "пустая строка: разделы под диалогом");
  typeQ("вход");
  ok(seeing() && document.getElementById("asstAsk"), "ввод текста панель не закрывает");
  ok(/В дереве|Не в дереве/.test(listEl.textContent), "под диалогом — результаты: " + listEl.textContent.slice(0, 80));
  typeQ("");
  say("Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "ответ в поле под вопросом: тот же разговор");
  ok(asst === talkId && asst.said.length === 2, "разговор тот же");
  typeQ("вход");
  ok(document.getElementById("asstApply"), "поиск при плане план не трогает");
  keyQ("ArrowDown");
  ok(goNav, "стрелка выбрала строку списка");
  typeQ("");
  goNav = false;
  // Enter в строке поиска, когда нашлось, — фильтр, как раньше: ассистенту не уходит, план на месте
  // Нашлось: «Новый запрос ассистенту» есть, над диалогом, но Enter — фильтр, как раньше: ассистенту не уходит, план на месте
  typeQ("вход");
  const askBtn = () => document.getElementById("goAsk");
  ok(askBtn() && !askBtn().hasAttribute("data-empty") && askBtn().textContent === "Новый запрос ассистенту", "нашлось — кнопка ассистента есть");
  ok(askBtn().compareDocumentPosition(blockEl) & Node.DOCUMENT_POSITION_FOLLOWING, "кнопка над окном ассистента");
  ok(blockEl.compareDocumentPosition(listEl) & Node.DOCUMENT_POSITION_FOLLOWING && /В дереве|Не в дереве/.test(listEl.textContent), "под окном — результаты поиска");
  ok(askBtn().getBoundingClientRect().bottom <= blockEl.getBoundingClientRect().top + 1 && askBtn().getBoundingClientRect().height > 0, "на экране кнопка выше диалога");
  enter();
  ok(!popOpen() && asst === talkId && asst.plan && !asst.busy && treeQ === "вход", "Enter при найденном — фильтр, план на месте");
  clearTreeQ();
  press(inp);
  ok(seeing() && document.getElementById("asstApply"), "панель вернулась с планом");
  ok(!askBtn(), "пустая строка — кнопки ассистента нет");

  // Просьба из строки поиска — новый разговор: context, план и секреты забыты
  const sent = [];
  API.stream = (p, b, ...r) => { sent.push(b); return stream(p, b, ...r); };
  asst.secrets = ["qwerty"];
  asstRender();
  ok(document.querySelector("#asstBlock .asst-sec input"), "поле секрета у заглушки есть");
  press(document.getElementById("tree"));
  ok(!popOpen() && asst.secrets[0] === "qwerty", "скрытая панель секрет не забывает");
  press(inp);
  const talking = asst;
  typeQ("абырвалг которого нет");
  ok(document.getElementById("goAsk"), "ничего не найдено — кнопка ассистента");
  enter();
  ok(asst && asst !== talking && talking.secrets.length === 0 && !asst.secrets.length && !asst.plan, "Enter в строке поиска — новый разговор: план и секреты забыты");
  ok(sent.length === 1 && sent[0].text === "абырвалг которого нет" && !("context" in sent[0]) && !("secrets" in sent[0]), "ход без прежнего context и секретов");
  ok(asst.said.length === 1 && document.querySelector("#asstBlock .asst-said").textContent === "› абырвалг которого нет" && inp.value === "" && treeQ === "", "в разговоре одна реплика, строка поиска очищена");
  ok(await until(() => !asst.busy), "ход кончился");
  // Идущий ход снимается: новая просьба мышью по кнопке поиска
  say("выключи запись");
  const busyTalk = asst, sig = asst.abort.signal;
  ok(asst.busy, "ход идёт");
  typeQ("абырвалг ещё раз");
  mouse(document.getElementById("goAsk"));
  ok(sig.aborted && asst !== busyTalk && asst.said.join() === "абырвалг ещё раз", "кнопка поиска: идущий ход снят, разговор новый");
  ok(await until(() => !asst.busy), "новый ход кончился");
  // Кнопка и при найденном: мышью — новый разговор с набранным, хотя поиск что-то нашёл
  const before2 = asst;
  typeQ("вход");
  ok(askBtn() && !askBtn().hasAttribute("data-empty"), "нашлось, кнопка есть");
  mouse(askBtn());
  ok(asst !== before2 && asst.said.join() === "вход" && inp.value === "" && treeQ === "", "кнопка при найденном мышью — новый разговор, строка очищена");
  ok(await until(() => !asst.busy), "ход кончился");
  API.stream = stream;
  goClose();

  // Раздел тип не решает, панель переживает переход
  asstOpen("");
  const after = [];
  API.stream = (p, b, ...r) => { after.push("kind" in b ? b.kind : "-"); return stream(p, b, ...r); };
  goApp("rules");
  ok(seeing(), "переход: панель на месте");
  say("убери условие");
  ok(await until(() => !asst.busy && after.length), "ход после перехода");
  API.stream = stream;
  ok(after[0] === "-" && asst.ask === "Какое правило изменить?", "после перехода поля kind нет, о правилах — по словам просьбы: " + asst.ask);
  goApp("hw");
  await apiReload();
  ok(seeing(), "перечитывание данных: панель на месте");
  const inCard = document.querySelector("main input:not([type=checkbox]):not([disabled])");
  if (inCard) {
    inCard.focus();
    asstEvent(asst, { type: "question", text: "Какой?", context: "c" });
    ok(document.activeElement === inCard, "ответ ассистента не забирает курсор из карточки");
  }
  ok(!document.getElementById("asstNew"), "«Нового разговора» нет");
  // Список поиска — как раньше: клик мимо закрывает
  typeQ("камера");
  ok(popOpen(), "список поиска открыт");
  press(document.getElementById("tree"));
  ok(!popOpen(), "клик мимо закрывает список поиска");
  clearTreeQ();
  // Выбор строки поиска мышью: окно закрывается, переход выполнен
  inp.value = "";
  goInput("");
  const row = [...document.querySelectorAll("#gopop .gores")].find((x) => /Автоматизация/.test(x.textContent));
  ok(row, "строка раздела в списке");
  mouse(row);
  ok(!popOpen() && app === "rules", "строка мышью: список закрыт, переход выполнен");
  goApp("hw");
});
