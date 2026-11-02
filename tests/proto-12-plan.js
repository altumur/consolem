/* Прототип 12: план добавления устройств. Один вход в шапке, три источника в один план, в системе ничего
   нет до «Применить», отказы — по строкам, повтор неудачных. Запуск:
   python3 tools/check_ui.py --page index_12_plan-dobavleniya.html tests/proto-12-plan.js */
UiCheck(async ({ ok, until, confirmWith }) => {
  goApp("hw");
  const d1 = domains[0];
  const headText = () => [...document.querySelectorAll("#main .hd-act button")].map((b) => b.textContent.trim());
  // 1. Шапка домена: один вход, остальное — в меню стрелки
  pick(d1.id);
  goTab("gen");
  let head = headText();
  ok(head.filter((t) => /^Добавить устройства/.test(t)).length === 1, "в шапке домена один вход: " + head.join(" | "));
  ok(!head.some((t) => /^(Найденные|Вручную|Из файла)$|^Хранилище/.test(t)), "в шапке нет «Найденные», «Вручную», «Из файла», «Хранилище»");
  document.querySelector("#main .btn-split-arrow").click();
  let menu = document.getElementById("tctx");
  ok(menu.classList.contains("open") && /Сервер…/.test(menu.textContent) && !/Хранилище/.test(menu.textContent), "меню стрелки у домена — без хранилища: " + menu.textContent.trim().replace(/\s+/g, " "));
  closeTreeCtx();
  const srv = servers.find((s) => !isUnallocated(s.id) && SERVER_DOMAIN[s.id] === d1.id) || servers.find((s) => !isUnallocated(s.id));
  pick(srv.id);
  goTab("gen");
  head = headText();
  ok(head.filter((t) => /^Добавить устройства/.test(t)).length === 1 && !head.some((t) => /^(Найденные|Вручную|Из файла)$|^Хранилище/.test(t)), "у сервера — тоже один вход");
  document.querySelector("#main .btn-split-arrow").click();
  menu = document.getElementById("tctx");
  ok(/Службу…/.test(menu.textContent) && /Хранилище…/.test(menu.textContent), "меню стрелки у сервера: " + menu.textContent.trim().replace(/\s+/g, " "));
  closeTreeCtx();

  // 2. Три источника — в один план; на сервере пока ничего
  pick(d1.id);
  goTab("gen");
  // детектор движения у камеры — тоже запись списка: считаем устройства без детекторов
  const countDev = async () => (await uiDevices()).filter((d) => d.type !== "det").length;
  const n0 = await countDev();
  const addBtn = [...document.querySelectorAll("#main .hd-act button")].find((b) => /^Добавить устройства/.test(b.textContent.trim()));
  addBtn.click();
  ok(document.getElementById("wiz").classList.contains("open") && !!document.getElementById("planPanel"), "ящик открыт, справа панель плана");
  ok(/Отметьте устройства слева/.test(document.getElementById("planPanel").textContent), "пустой план подсказывает, что делать");
  ok(document.querySelectorAll(".plan-tab").length === (can("startDiscovery") ? 3 : 2) && /Добавить устройства/.test(document.getElementById("wizT").textContent), "три вкладки и заголовок «Добавить устройства»");
  ok(!/Добавить вручную|Добавить из файла|К результатам поиска/.test(document.getElementById("wizFoot").textContent), "в подвале нет старых кнопок вкладок");
  const srvSel = document.getElementById("planSrv");
  const onlineSrv = planServerList().filter((s) => s.online !== false);
  ok(!srvSel || [...srvSel.options].filter((o) => o.disabled).length === planServerList().length - onlineSrv.length, "офлайн-серверы в списке погашены");
  ok(await until(() => wizd.devState === "done" && wizd.devResults.length > 2), "поиск в сети завершён: " + wizd.devResults.length);
  // у двух находок общий адрес (конфликт MAC): в план берём по одному адресу
  const good = wizd.devResults.filter((r, i, l) => r.status === "ok" && l.findIndex((x) => x.ip === r.ip) === i).slice(0, 2);
  good[0].user = "admin";
  good[0].pass = "secret";
  good.forEach((r) => wizd.devSelected.add(r.id));
  planAddFound();
  ok(addPlan.rows.length === 2 && addPlan.rows.every((x) => x.source === "found"), "найденные — в плане: " + addPlan.rows.length);
  ok(good.every((r) => r.planned) && selectableDeviceResults().every((r) => !r.planned), "в списке слева они помечены и не выбираются");
  ok(document.querySelectorAll("#wbd .dev-result.planned").length >= 2 && /В плане/.test(document.querySelector("#wbd .dev-result.planned").textContent), "строки слева — «В плане»");
  planAddFound([good[0]]);
  ok(addPlan.rows.length === 2, "тот же адрес второй раз не добавляется");
  const sid = planServerId();
  ok(addPlan.rows.every((x) => x.serverId === sid && planAllowedArchives(x.serverId, x.domainId).some((a) => a.id === x.r.arch || !x.r.arch)), "строки на выбранном сервере, архив — из его списка");
  setDeviceTab("manual");
  Object.assign(wizd.manual, { type: "camera", ip: "10.7.7.1", port: "80", vendor: "Axis", model: "P3245-LV", user: "admin", pass: "pw1", name: "Ручная камера", identifier: "", short: "", rtsp: "" });
  planAddManual();
  ok(addPlan.rows.length === 3 && addPlan.rows[2].source === "manual", "ручная камера — в плане");
  ok(wizd.manual.ip === "" && wizd.manual.name === "" && wizd.manual.vendor === "Axis" && wizd.manual.user === "admin" && wizd.manual.pass === "pw1", "форма очищена, производитель и логин остались");
  ok(document.activeElement?.id === "devManIp", "курсор — в поле IP");
  setDeviceTab("csv");
  const row = (o) => ({ id: "csv" + o.ip, short: "", identifier: "", port: "80", user: "admin", pass: "1", group: "", arch: "", record: "none", lat: "", lon: "", azimuth: "", errors: [], ...o });
  wizd.csvRows = [row({ name: "Камера из файла", ip: "10.7.7.2", vendor: "Axis", model: "P3245-LV" })];
  planAddCsv();
  ok(addPlan.rows.length === 4 && addPlan.rows[3].source === "csv" && wizd.csvRows[0].planned, "строка файла — в плане");
  ok(/В плане/.test(document.getElementById("wbd").textContent) && /План · 4/.test(document.getElementById("planPanel").textContent), "панель: «План · 4»");
  ok((await countDev()) === n0 && (await uiDevices()).every((d) => !["10.7.7.1", "10.7.7.2"].includes(d.ip)), "на сервере устройств столько же: " + n0);

  // 3. Убрать и «Очистить» с «Вернуть»
  setDeviceTab("search");
  const gone = addPlan.rows[1];
  planRemove(gone.pid);
  ok(addPlan.rows.length === 3 && !good[1].planned && selectableDeviceResults().includes(good[1]), "убранная строка снова доступна слева");
  good[1].user = "admin";
  good[1].pass = "";
  wizd.devSelected.add(good[1].id);
  planAddFound();
  ok(addPlan.rows.length === 4, "и добавляется снова");
  planClear();
  ok(addPlan.rows.length === 0 && !good[0].planned && !wizd.csvRows[0].planned, "план очищен, метки сняты");
  document.querySelector("#ttu-planclear .ttu-act").click();
  ok(addPlan.rows.length === 4 && good[0].planned && wizd.csvRows[0].planned, "«Вернуть» вернуло 4 строки и метки");
  ok(!document.getElementById("confirm").classList.contains("open"), "без окна подтверждения");

  // 4. Ошибки и предупреждения
  const camId = (await uiDevices()).find((d) => d.type === "camera" && d.identifier).id;
  const takenId = (await API.get("/devices/" + camId)).identifier;
  const csvRow = addPlan.rows.find((x) => x.source === "csv");
  csvRow.r.identifier = takenId;
  ok(planRowIssues(csvRow).some((i) => i.err && /уже используется/.test(i.text)), "занятый ID — ошибка строки");
  planRender();
  const nOk = planOkRows().length;
  ok(nOk === 3 && /Применить план \(3\)/.test(document.getElementById("planApplyBtn").textContent), "в «Применить» — только строки без ошибок: 3");
  ok(/1 строка с ошибкой останется в плане/.test(document.getElementById("planFoot").textContent), "строка про оставшиеся с ошибками");
  const noPass = addPlan.rows.find((x) => x.src === good[1]);
  ok(noPass && planRowIssues(noPass).some((i) => !i.err && /Нет пароля/.test(i.text)), "без пароля — предупреждение, не ошибка");
  ok(planOkRows().includes(noPass), "строка с предупреждением применяется");
  const expand = document.querySelector(`.plan-row[data-pid="${csvRow.pid}"] .plan-row-main`);
  expand.click();
  ok(document.querySelector(`.plan-row[data-pid="${csvRow.pid}"] .plan-edit`) && document.querySelector(`.plan-row[data-pid="${csvRow.pid}"] input[type=password]`), "строка раскрывается: поля и пароль");

  // 5. Применить: один POST /devices, подтверждение из-за предупреждения
  const posts = [];
  const realPost = API.post;
  API.post = function (path, body, ...rest) {
    if (path === "/devices") posts.push(body);
    return realPost.call(this, path, body, ...rest);
  };
  planApply();
  const dlg = document.getElementById("confirm");
  ok(dlg.classList.contains("open") && /Применить план/.test(document.getElementById("confirmTitle").textContent) && /Нет логина или пароля — добавятся выключенными: 1/.test(document.getElementById("confirmMsg").textContent), "предупреждение — окно: " + document.getElementById("confirmMsg").textContent);
  ok(!document.getElementById("confirmCountInp"), "число вводить не нужно");
  ok(document.getElementById("confirmOk").textContent === "Добавить 3", "кнопка «Добавить 3»");
  const applyRows = planOkRows().slice();
  await confirmWith();
  ok(await until(() => !addPlan.applying && addPlan.added.length === 3), "план применён");
  ok(posts.length === 1 && posts[0].items.length === 3, "ушёл один POST /devices на 3 устройства");
  const after = await uiDevices();
  ok(after.filter((d) => d.type !== "det").length === n0 + 3, "на сервере +3 устройства: " + (n0 + 3));
  const made = applyRows.map((x) => after.find((d) => d.ip === x.r.ip));
  ok(made.every(Boolean) && made.every((d, i) => d.serverId === applyRows[i].serverId), "устройства на выбранном сервере");
  ok(made.every((d, i) => (d.archiveId || d.archives?.[0]?.archiveId || null) === (applyRows[i].r.arch || null) || !applyRows[i].r.arch), "архив — выбранный в строке");
  ok(addPlan.rows.length === 1 && addPlan.rows[0] === csvRow && csvRow.state === "plan", "строка с ошибкой осталась в плане");
  ok(good[0].added && good[0].addedId && !good[0].planned, "исходная строка слева — «добавлено»");
  ok(/Добавлено \(3\)/.test(document.getElementById("planPanel").textContent) && document.querySelectorAll("#planPanel .plan-added-row .lk-act").length === 3, "раздел «Добавлено (3)» со ссылками");
  const nodeNoPass = after.find((d) => d.ip === noPass.r.ip);
  ok(nodeNoPass.enabled === false, "без пароля добавлено выключенным");
  document.querySelector("#planPanel .plan-added-row .lk-act").click();
  ok(!document.getElementById("wiz").classList.contains("open") && sel_ok(), "«Перейти» открыло устройство");
  function sel_ok() {
    return !!find(sel);
  }
  ok(await until(() => document.querySelector("#main .acc-flash, .acc-flash")), "переход подсвечен");

  // 6. Отказ по строке и повтор только неудачных
  planRemove(csvRow.pid);
  pick(d1.id);
  goTab("gen");
  planOpen("manual");
  await API.post("/devices", { idempotencyKey: "occupy-9001", items: [{ device: { type: "camera", name: "Занято", identifier: "9001", rtspUrl: "rtsp://10.9.9.9/1" }, domainId: d1.id, parentId: null, folderId: null }] }).then((r) => ok(r.done.length === 1, "занято: " + JSON.stringify(r.failed)), (e) => ok(false, "occupy " + JSON.stringify(e)));
  const mk = (ip, id) => {
    Object.assign(wizd.manual, { type: "camera", ip, port: "80", vendor: "Axis", model: "P3245-LV", user: "admin", pass: "pw", name: "Камера " + ip, identifier: id, short: "", rtsp: "" });
    planAddManual();
  };
  mk("10.7.8.1", "");
  mk("10.7.8.2", "9001");
  ok(addPlan.rows.length === 2 && planOkRows().length === 2, "две строки; занятость «9001» кэш интерфейса не видит");
  posts.length = 0;
  planApply();
  ok(await until(() => !addPlan.applying && posts.length === 1), "ушёл один запрос");
  const bad = addPlan.rows;
  ok(bad.length === 1 && bad[0].state === "fail" && bad[0].code === "IDENTIFIER_TAKEN", "отказ по строке остался в плане: " + bad[0]?.code);
  ok(/не добавлено 1/.test(document.getElementById("planPanel").textContent) && /Повторить неудачные/.test(document.getElementById("planFoot").textContent), "сводка и «Повторить неудачные»");
  ok(/уже используется/i.test(document.getElementById("planPanel").textContent), "причина — по-русски");
  planEdit(bad[0].pid, "name", "Камера 10.7.8.2 (правка)");
  ok(planFailIssue(bad[0]) === null && bad[0].state === "fail", "правка снимает прежнюю причину, строка остаётся к повтору");
  planEdit(bad[0].pid, "identifier", "");
  const nFail = await countDev();
  posts.length = 0;
  planRetry();
  ok(await until(() => !addPlan.applying && posts.length === 1), "повтор — один запрос");
  ok(posts[0].items.length === 1, "в повторе только неудачная строка");
  ok(addPlan.rows.length === 0 && (await countDev()) === nFail + 1, "после повтора план пуст, устройство добавлено");

  // Обрыв связи: строки целы, ключ повтора тот же
  mk("10.7.8.3", "");
  const keys = [];
  let cut = true;
  API.post = function (path, body, ...rest) {
    if (path === "/devices") {
      keys.push(body.idempotencyKey);
      if (cut) {
        cut = false;
        return Promise.reject(new TypeError("Failed to fetch"));   // ответа нет: связь оборвалась
      }
    }
    return realPost.call(this, path, body, ...rest);
  };
  planApply();
  ok(await until(() => !addPlan.applying && keys.length === 1), "первый запрос оборвался");
  ok(addPlan.rows.length === 1 && addPlan.rows[0].state === "plan" && !!addPlan.key, "строка на месте, ключ запомнен");
  planApply();
  ok(await until(() => !addPlan.applying && addPlan.rows.length === 0), "повтор прошёл");
  ok(keys.length === 2 && keys[0] === keys[1], "повтор — с тем же ключом");
  API.post = realPost;

  // 7. План переживает закрытие ящика и переход
  planOpen("manual");
  mk("10.7.8.4", "");
  closeWizard();
  ok(addPlan.rows.length === 1, "после закрытия ящика план на месте");
  const other = servers.find((s) => !isUnallocated(s.id) && s.id !== srv.id) || srv;
  pick(other.id);
  goTab("gen");
  ok(addPlan.rows.length === 1, "и после перехода к другому узлу");
  ok(/· 1/.test(headText().find((t) => /^Добавить устройства/.test(t))), "в шапке — счётчик: " + headText().find((t) => /^Добавить устройства/.test(t)));
  planOpen("manual");
  ok(document.querySelectorAll("#planPanel .plan-row").length === 1, "после повторного открытия строка в панели");
  closeWizard();
  addPlan.rows = [];
  planTouch();

  // F4: ошибки строки исправляются в самой строке
  pick(d1.id);
  goTab("gen");
  planOpen("manual");
  mk("10.7.9.1", "");
  const fixRow = addPlan.rows[0];
  planEdit(fixRow.pid, "vendor", "");
  ok(planRowIssues(fixRow).some((i) => i.err && /производителя/.test(i.text)) && planOkRows().length === 0, "без производителя — ошибка строки");
  fixRow.open = true;
  planRender();
  ok(["ip", "port", "vendor", "model", "identifier", "user"].every((k) => document.querySelector(`.plan-row[data-pid="${fixRow.pid}"] [data-pf="${k}"]`)), "в форме строки — адрес, порт, производитель, модель, ID");
  planEdit(fixRow.pid, "vendor", "Axis");
  ok(planOkRows().length === 1, "правка производителя возвращает строку в «готово»");
  planRemove(fixRow.pid);

  // F1: таблица «Устройства» за открытым ящиком не отбирает у него wizd
  closeWizard();
  pick(d1.id);
  goTab("cams");
  planOpen("manual");
  gear();
  ok(wizd.mode === "device-add" && !wizd.lanOwner && planInDrawer(), "после перерисовки таблицы за ящиком wizd остался ящика");
  mk("10.7.9.2", "");
  ok(/План · 1/.test(document.getElementById("planPanel").textContent), "панель видит добавленную строку: «План · 1»");
  planApply();
  ok(await until(() => !addPlan.applying && addPlan.added.length === 1), "применено при открытой вкладке «Устройства»");
  ok(/Добавлено \(1\)/.test(document.getElementById("planPanel").textContent) && !/идёт…/.test(document.getElementById("planPanel").textContent), "панель показывает «Добавлено (1)», а не «идёт…»");
  await API.post("/devices", { idempotencyKey: "occupy-9002", items: [{ device: { type: "camera", name: "Занято 2", identifier: "9002", rtspUrl: "rtsp://10.9.9.8/1" }, domainId: d1.id, parentId: null, folderId: null }] });
  // кэш интерфейса уже знает «9002» из потока событий: на время проверки отключаем его знание, чтобы отказал сервер
  const realTaken = planIdTaken;
  planIdTaken = () => false;
  mk("10.7.9.3", "9002");
  planApply();
  ok(await until(() => !addPlan.applying && planFailRows().length === 1), "отказ при открытой таблице");
  ok(/уже используется/i.test(document.getElementById("planPanel").textContent) && /Повторить неудачные/.test(document.getElementById("planFoot").textContent), "причина и «Повторить» видны в панели");
  planIdTaken = realTaken;
  planEdit(planFailRows()[0].pid, "identifier", "");
  planRetry();
  ok(await until(() => !addPlan.applying && addPlan.rows.length === 0), "F4: повтор после исправления ID прошёл");
  ok((await uiDevices()).some((d) => d.ip === "10.7.9.3"), "строка с исправленным ID добавлена");
  closeWizard();

  // F3: два кандидата с одним адресом — разные строки
  planOpen();
  await until(() => wizd.devState === "done");
  const twins = wizd.devResults.filter((r) => r.ip === wizd.devResults[0].ip);
  if (twins.length > 1) {
    planAddFound([twins[0]]);
    ok(twins[0].planned && !twins[1].planned && selectableDeviceResults().includes(twins[1]), "F3: двойник по адресу не помечен «В плане»");
    planAddFound([twins[1]]);
    ok(addPlan.rows.length === 2 && planRowIssues(addPlan.rows[1]).some((i) => i.err), "F3: оба в плане, повтор адреса — ошибка второй строки");
    planRemove(addPlan.rows[0].pid);
    ok(!twins[0].planned && twins[1].planned === addPlan.rows[0].pid, "F3: «Убрать» снимает свою строку, а не чужую");
  } else ok(true, "F3: двойников в наборе нет");
  planClear();
  closeWizard();

  // F5: ящик открыт на втором домене — поиск и папка из него
  if (domains.length > 1) {
    const d2 = domains[1];
    pick(d2.id);
    goTab("gen");
    planOpen();
    ok(wizd.domain === d2.id && wizd.searchDomain === d2.id, "F5: поиск идёт в домене ящика: " + wizd.searchDomain);
    wizardFolder();
    ok(folderDomain(wizd.folder) === d2.id, "F5: папка ящика — из его домена");
    closeWizard();
    pick(foundId(d2.id));
    ok(addContext().domain === null && initDeviceWizard(addContext()).domain === d2.id, "F6: из «Найденных» домена 2 мастер — домена 2");
  } else ok(true, "F5/F6: второго домена нет");

  // F7: хранилище привязано к серверу — строка из сети встаёт на этот сервер
  pick(d1.id);
  goTab("cams");
  await until(() => lan.state === "done" && lan.net.length > 0);
  const localArch = arch.find((a) => a.server && SERVER_DOMAIN[a.server] === d1.id && planServerList(d1.id).some((s) => s.id === a.server && s.online !== false));
  const netRow = lan.net.find((r) => r.status !== "bad" && r.vendor);
  if (localArch && netRow) {
    lanPrefill(find(lan.owner).n, netRow);
    netRow.arch = localArch.id;
    ok(planFromLan("n:" + netRow.id), "F7: строка из сети в плане");
    const lr = addPlan.rows[addPlan.rows.length - 1];
    ok(lr.serverId === localArch.server && lr.r.arch === localArch.id && !lr.archWas, "F7: сервер — хранилища, архив не заменён");
    planRemove(lr.pid);
  } else ok(true, "F7: нет подходящего хранилища сервера или строки сети");

  // F8: регистратор из файла встаёт на сервер строки; у него нет предупреждения об архиве
  planOpen("csv");
  const nvrRow = row({ name: "NVR из файла", ip: "10.7.9.5", vendor: "Dahua", model: "Dahua NVR 5216" });
  wizd.csvRows = [nvrRow];
  planAddCsv();
  const nrow = addPlan.rows[addPlan.rows.length - 1];
  ok(!planRowIssues(nrow).some((i) => /архив/i.test(i.text)), "F8: у регистратора из файла нет предупреждения об архиве");
  planApply();
  ok(await until(() => !addPlan.applying && addPlan.added.length === 1), "F8: регистратор применён");
  const nvrId = addPlan.added[0].id;
  ok((await API.get("/devices/" + nvrId)).serverId === nrow.serverId, "F8: регистратор — на сервере строки");
  closeWizard();
  addPlan.rows = [];
  planTouch();

  // A1: строка файла — камера: архив, папка, предупреждение; регистратор — нет
  pick(d1.id);
  goTab("gen");
  const online = planServerList(d1.id).filter((x) => x.online !== false);
  planOpen("csv");
  wizd.csvRows = [row({ name: "Камера A1", ip: "10.7.10.1", vendor: "Axis", model: "P3245-LV" }), row({ name: "NVR A1", ip: "10.7.10.2", vendor: "Dahua", model: "Dahua NVR 5216" })];
  planAddCsv();
  const [camR, nvrR] = addPlan.rows;
  ok(planIsCam(camR) && !planIsCam(nvrR), "A1: камера из файла — камера, регистратор — нет");
  ok(planRowIssues(camR).some((i) => /Без архива/.test(i.text)) && !planRowIssues(nvrR).some((i) => /Без архива/.test(i.text)), "A1: у камеры «Без архива», у регистратора нет");
  camR.open = true;
  planRender();
  ok(document.querySelector(`.plan-row[data-pid="${camR.pid}"] [data-pf="arch"]`) && document.querySelector(`.plan-row[data-pid="${camR.pid}"] [data-pf="group"]`), "A1: у камеры из файла есть выбор архива и папки");

  // A3: заголовок сервера есть и при одной группе
  planRemove(nvrR.pid);
  ok(document.querySelector("#planPanel .plan-grp") && document.querySelector("#planPanel .plan-grp").textContent.includes(locName(find(camR.serverId).n)), "A3: у одной группы есть заголовок сервера");
  if (online.length > 1) {
    const other = online.find((x) => x.id !== camR.serverId);
    planSetServer(other.id);
    ok(document.querySelector("#planPanel .plan-grp").textContent.includes(locName(find(camR.serverId).n)) && camR.serverId !== other.id, "A3: после смены сервера в строке панель всё равно показывает сервер строки");
  }

  // Фокус в поле строки переживает перерисовку, как при приходе находок
  setDeviceTab("search");
  await until(() => wizd.devState === "done");
  camR.open = true;
  planRender();
  document.querySelector(`.plan-row[data-pid="${camR.pid}"] [data-pf="pass"]`).focus();
  wizd.devResults.unshift({ ...wizd.devResults[0], id: "fnew-1" }, { ...wizd.devResults[0], id: "fnew-2" });
  renderDeviceWizard();
  ok(document.activeElement?.dataset?.pf === "pass" && document.activeElement.closest(".plan-row")?.dataset.pid === camR.pid, "фокус остался в пароле своей строки");
  planClear();

  // F1: «Найденные» под открытым ящиком не подменяют его мастера
  setDeviceTab("manual");
  wizd.manual.ip = "1.2.3.4";
  const keepW = wizd;
  pick(foundId(d1.id));
  ok(wizd === keepW && wizd.deviceTab === "manual" && wizd.manual.ip === "1.2.3.4" && planInDrawer(), "F1: после выбора «Найденных» wizd, вкладка и форма те же");
  closeWizard();

  // F5: папка выбрана в домене 1, ящик открыт на домене 2
  if (domains.length > 1) {
    const d2 = domains[1];
    const f1 = flatFolders().find((f) => folderDomain(f.id) === d1.id);
    pick(f1.id);
    pick(d2.id);
    planOpen("manual");
    ok(wizd.domain === d2.id && folderDomain(wizd.folder) === d2.id, "F5: папка ящика — из его домена, не из прежней выборки");
    mk("10.7.11.1", "");
    const fr = addPlan.rows[addPlan.rows.length - 1];
    ok(fr.folderId === wizd.folder && document.querySelector("#wbd .dev-manual select option[value='']") !== null, "F5: папка строки совпадает с папкой формы");
    planClear();
    closeWizard();
  } else ok(true, "F5: второго домена нет");

  // F7: сервер в строке «Сервер» главнее привязки архива найденного
  if (online.length > 1) {
    pick(d1.id);
    goTab("gen");
    planOpen();
    await until(() => wizd.devState === "done");
    const sA = planServerId(), sB = online.find((x) => x.id !== sA).id;
    const archA = arch.find((a) => a.server === sA);
    const fr0 = wizd.devResults.find((r) => r.status === "ok");
    if (archA) fr0.arch = archA.id;   // предустановка прежнего сервера
    planSetServer(sB);
    planAddFound([fr0]);
    const fr1 = addPlan.rows[addPlan.rows.length - 1];
    ok(fr1.serverId === sB, "F7: строка встала на сервер из строки «Сервер»");
    ok(planAllowedArchives(sB, fr1.domainId).some((x) => x.id === fr1.r.arch) || !fr1.r.arch, "F7: у строки архив, доступный серверу из строки «Сервер»");
    ok(!planRowIssues(fr1).some((i) => /недоступен/.test(i.text)) && !fr1.archWas, "F7: без предупреждения об архиве, которого человек не выбирал");
    planClear();
    closeWizard();
  } else ok(true, "F7: в домене один сервер");
  addPlan.rows = [];
  planTouch();

  // U3: меню стрелки берёт фокус и возвращает его по Esc
  pick(d1.id);
  goTab("gen");
  const arrow = document.querySelector("#main .btn-split-arrow");
  arrow.focus();
  arrow.click();
  ok(document.getElementById("tctx").contains(document.activeElement), "U3: после открытия фокус в меню");
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok(!document.getElementById("tctx").classList.contains("open") && document.activeElement === arrow, "U3: по Esc фокус вернулся на стрелку");

  // U1, U2: фокус на строке плана
  planOpen("manual");
  mk("10.7.12.1", "");
  const u = addPlan.rows[0];
  u.open = true;
  planRender();
  const mainBtn = document.querySelector(`.plan-row[data-pid="${u.pid}"] .plan-row-main`);
  mainBtn.focus();
  renderDeviceWizard();
  ok(document.activeElement?.classList.contains("plan-row-main") && document.activeElement.closest(".plan-row").dataset.pid === u.pid, "U1: фокус на кнопке строки пережил перерисовку ящика");
  const rowEl = document.querySelector(`.plan-row[data-pid="${u.pid}"]`);
  const ttl = planRowTitle(u).title;
  ok(["name", "user", "identifier"].every((k) => rowEl.querySelector(`[data-pf="${k}"]`).getAttribute("aria-label").endsWith(" · " + ttl)) && rowEl.querySelector('[data-pf="arch"]').getAttribute("aria-label").endsWith(" · " + ttl) && rowEl.querySelector('[data-pf="pass"]').getAttribute("aria-label").endsWith(" · " + ttl), "U2: подписи полей называют строку: " + ttl);
  planRemove(u.pid);
  ok(document.activeElement === document.querySelector(".plan-tab.on"), "U1: после последней строки фокус на активной вкладке");

  // U6, U7: строка таблицы «Устройства» в плане
  closeWizard();
  pick(d1.id);
  goTab("cams");
  await until(() => lan.state === "done" && lan.net.length > 0);
  const lk = lan.net.find((r) => r.status !== "bad" && r.vendor && !r.planned && lanRows(find(lan.owner).n).some((x) => x.key === "n:" + r.id));
  planFromLanOne("n:" + lk.id);
  ok(/всего 1/.test(document.getElementById("tt")?.textContent || ""), "U7: тост из таблицы — со счётом «всего»");
  lanSetQ(lk.ip);   // строка сети может оказаться не на первой странице
  const chk = document.querySelector("tr.lan-net input.ts-chk:disabled");
  ok(chk && /плане/i.test(chk.title), "U6: у погашенной отметки строки плана есть причина: " + (chk && chk.title));
  planClear();
  addPlan.rows = [];
  planTouch();

  // Срез 2. Любое хранилище, сетевое тоже, создают на сервере; с домена входа нет
  const d2Nas = (n) => ["", "", "nas" + n, "vms"].join(String.fromCharCode(92));
  const d2Dom = domains[0];
  const d2Srv = servers.find((s) => !isUnallocated(s.id) && SERVER_DOMAIN[s.id] === d2Dom.id);
  const srvMenu = (n) => { openTreeCtx(n, { x: 10, y: 10 }); const t = document.getElementById("tctx").textContent; closeTreeCtx(); return t; };
  ok(!/Создать хранилище/.test(srvMenu(d2Dom)), "хранилище: в меню дерева домена его нет");
  ok(/Создать хранилище/.test(srvMenu(d2Srv)), "хранилище: в меню дерева сервера есть");
  pick(d2Dom.id);
  goTab("gen");
  ok(!/Хранилище/.test(document.querySelector(".dom-acts").textContent), "хранилище: в «Действиях» домена его нет");
  ok(addSplitItems(d2Dom).every(([l]) => !/Хранилище/.test(l)), "хранилище: в меню кнопки домена его нет");
  ok(addSplitItems(d2Dom).some(([l]) => /Серверы по IP/.test(l)), "в меню кнопки домена — серверы по IP");
  ok(addSplitItems(d2Srv).some(([l]) => /Хранилище/.test(l)), "хранилище: в меню кнопки сервера есть");
  goTab("srvs");
  const d2Main = () => document.querySelector("#main");
  const d2CreateBtns = () => [...d2Main().querySelectorAll("button")].filter((b) => /хранилище/i.test(b.textContent));
  ok(d2CreateBtns().length === 0, "вкладка «Серверы» домена: кнопок создания хранилища нет");
  ok(/создают на сервере/.test(d2Main().querySelector("[data-arch-where]")?.textContent || ""), "вкладка «Серверы» домена: подсказка, где создавать");

  // Созданные раньше хранилища домена не пропадают; нет их — нет и списка
  const d2List = () => /Сетевые хранилища домена/.test(d2Main().textContent);
  const d2Had = domainArchives(d2Dom.id).length;
  ok(d2List() === (d2Had > 0), "список хранилищ домена — только когда они есть: " + d2Had);
  addArchive(d2Dom.id);
  anSet("name", "Старое хранилище домена", true);
  anSet("disk", d2Nas(79), true);
  anSet("user", "svc", true);
  const d2Body0 = anArchive();
  archNewCancel();
  const d2Shared = await API.post("/archives", d2Body0);
  ok(await until(() => domainArchives(d2Dom.id).some((a) => a.id === d2Shared.archive.id)), "хранилище домена пришло событием");
  paint();
  ok(d2List() && d2Main().textContent.includes("Старое хранилище домена"), "созданное раньше хранилище домена видно в списке");

  const d2Empty = domains.find((x) => !domainArchives(x.id).length);
  ok(!!d2Empty, "есть домен без своих хранилищ");
  pick(d2Empty.id);
  goTab("srvs");
  ok(!d2List(), "у домена без хранилищ списка нет");
  const d2Srvs = d2Empty.servers;
  d2Empty.servers = [];
  paint();
  ok(/сначала добавьте сервер/.test(d2Main().querySelector("[data-arch-where]")?.textContent || ""), "домен без серверов: сначала добавить сервер");
  d2Empty.servers = d2Srvs;
  paint();

  // С сервера: все виды, сервер подставлен и не меняется, «Весь домен» нет; сетевое привязано к нему
  const d2Body = () => document.getElementById("bmBody");
  addArchive(d2Srv.id);
  ok(d2Body().querySelectorAll(".an-kind").length === refArchKinds.length && an.server === d2Srv.id && !an.shared, "диалог сервера: все виды, сервер подставлен");
  ok(!d2Body().querySelector(".an-srv select") && !/Весь домен/.test(d2Body().textContent), "диалог сервера: сервер не выбирают, «Весь домен» нет");
  ok(d2Body().querySelector(".an-srv input")?.value.startsWith(locName(d2Srv)) && d2Body().querySelector(".an-srv input").disabled, "диалог сервера: имя сервера видно, поле не меняется");
  ok(locName(d2Srv) && document.getElementById("bmTitle").textContent.includes(locName(d2Srv)), "диалог сервера: сервер в заголовке");
  ok(!d2Body().querySelector("[data-arch-where]"), "диалог сервера: у локального подсказки нет");
  anSet("kind", "network");
  ok(/только этот сервер/.test(d2Body().querySelector("[data-arch-where]")?.textContent || ""), "диалог сервера: у сетевого видно, что оно этого сервера");
  ok(!d2Body().querySelector(".an-srv select") && an.server === d2Srv.id, "диалог сервера: смена вида сервер не сбрасывает");
  anSet("disk", d2Nas(78), true);
  anSet("user", "svc", true);
  anSet("name", "Сетевое на сервере — срез 2", true);
  ok(!anBlock(), "диалог сервера: можно создать — " + anBlock());
  ok(anArchive().serverId === d2Srv.id && anArchive().domainId === null, "диалог сервера: в запросе сервер, домена нет");
  ok(anArchive().firstVolume.disk === d2Nas(78), "путь NAS дошёл до запроса: " + anArchive().firstVolume.disk);
  createArchive();
  ok(await until(() => arch.some((a) => a.name === "Сетевое на сервере — срез 2")), "сетевое хранилище создано с сервера");
  const d2Rec = await API.get("/archives/" + arch.find((a) => a.name === "Сетевое на сервере — срез 2").id);
  ok(d2Rec.serverId === d2Srv.id, "на сервере: сетевое хранилище этого сервера, serverId " + d2Rec.serverId);
  ok(serverArchives(d2Srv.id).some((a) => a.id === d2Rec.id), "оно в списке хранилищ сервера");
  pick(d2Srv.id);
  goTab("disk");
  ok([...d2Main().querySelectorAll("button")].some((b) => /Хранилище…/.test(b.textContent)), "вкладка дисков сервера: кнопка создания");

  // Нет операции createArchive — нигде не предлагается
  const d2Can = CAPS.operations;
  CAPS.operations = new Set([...d2Can].filter((o) => o !== "createArchive"));
  ok(!can("createArchive"), "операция снята");
  ok(!/Создать хранилище/.test(srvMenu(d2Srv)) && addSplitItems(d2Srv).every(([l]) => !/Хранилище/.test(l)), "без операции: в меню сервера нет");
  paint();
  ok(![...d2Main().querySelectorAll("button")].some((b) => /Хранилище…/.test(b.textContent)), "без операции: кнопки на вкладке дисков нет");
  pick(d2Dom.id);
  goTab("srvs");
  ok(!d2Main().querySelector("[data-arch-where]"), "без операции: подсказки на домене нет");
  CAPS.operations = d2Can;
  goTab("gen");
});
