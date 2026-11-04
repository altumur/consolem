/* Сценарии интерфейса: права — ссылки на «Оборудование», черновик и «Применить» пакетом, отказ сервера,
   удаление с вводом числа и отсчётом, синхронизация каталога. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until, confirmWith }) => {
  goApp("acc");
  const toastText = () => document.getElementById("tt")?.textContent || "";
  // Права ролей ведут в «Оборудование»: папки и объекты — те же id
  const op = accRoles().find((r) => Object.keys(r.groups).length);
  ok(Object.keys(op.groups).every((k) => folderById(k) || domainById(k)), "права роли «" + op.n + "» — на существующие папки: " + Object.keys(op.groups).length);
  ok(Object.keys(op.objs).filter((k) => !k.includes(":")).every((k) => find(k) || archById(k)), "исключения — на существующие объекты");
  ok(accIssues().length === 20, "проверка: " + accIssues().length);
  // Правка в черновике → «Применить» → сервер
  const u = accUsers().find((x) => x.login === "olga");
  accSetUser(u.id, "email", "olga@new.local");
  const nu = { id: accNewId(), login: "tester", name: "Тестов", email: "", on: true, roles: [op.id], last: null, created: accIso(0), until: {}, expires: "", web: 0, mobile: 0, ldap: "" };
  accSt().users.push(nu);
  accEdited();
  const lines = accPlanLines().length;
  ok(lines >= 2, "в черновике изменений: " + lines);
  const v0 = accVer;
  accPlan();
  await confirmWith(null);
  ok(await until(() => accVer !== v0), "применено, версия " + accVer);
  const v1 = accVer;
  const a = await uiAccess();
  ok(a.users.find((x) => x.id === u.id).email === "olga@new.local", "на сервере — новый e-mail");
  ok(a.users.some((x) => x.id === nu.id && x.login === "tester" && x.roleIds[0] === op.id), "новый пользователь с UUID и ролью");
  ok(a.history[0].actor === ACC_ME && accSrv().log[0].who === ACC_ME, "история — с автором " + ACC_ME + ": «" + a.history[0].text.slice(0, 50) + "»");
  ok(!accPlanLines().length, "черновик чист");
  // Классы доступа — из описаний видов (/kinds): строка умолчания на класс (access.class и access.also), подпись —
  // подпись класса, уровни — access.levels. Вид, уровня которого в ролях набора нет (security_controller), — такая же
  // строка: уровень выдаётся, уходит в Role.kindAccess и после перечитывания снимка на месте
  {
    const SC = "security_controller", CTRL = "30000294-0000-4000-8000-000000000000";
    const row = ACC_DEFS.find((d) => d[2] === SC), lv = (ACC_LV[SC] || []).map((l) => l[0]).join();
    ok(row && row[1] === "Охранные контроллеры" && lv === "view,edit,admin", "строка класса из описаний видов: «" + (row && row[1]) + "», уровни " + lv);
    ok(["cam", "tel", "acfa", "test.unknown"].every((c) => ACC_DEFS.some((d) => d[2] === c)), "основной класс, also камеры и вид без класса (своим кодом) — строки умолчаний");
    ok(ACC_DEFS.filter((d) => d[2] === "cam").length === 1, "класс один раз, хотя у него несколько видов");
    const evs = devicePool.find((n) => n.type === "eventsrc");
    ok(!evs || (accObjFields(evs) || []).join() === "pos", "у источника событий один тип доступа, как в базе: " + (evs && accObjFields(evs)));
    const ctrl = find(CTRL)?.n;
    ok(ctrl && (accObjFields(ctrl) || []).join() === SC, "права на объект контроллера — по его классу: " + (ctrl && accObjFields(ctrl)));
    const gd = accRoles().find((x) => x.n === "Охрана");
    ok(!(row[0] in gd.own), "у роли «Охрана» уровня класса нет");
    accGo("role:" + gd.id, "defs");
    const box = document.querySelector(`[data-def="${row[0]}"] select`);
    ok(box && [...box.options].map((o) => o.value).filter(Boolean).join() === "view,edit,admin", "выбор уровня класса в карточке роли");
    box.value = "edit";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    ok(accRole(gd.id).own[row[0]] === "edit" && accPlanLines().some((x) => /Охранные контроллеры/.test(x)), "строка плана — подписью класса: " + accPlanLines().join(" | ").slice(0, 200));
    // Умолчание класса базы («Камеры») — строка плана как в базе, без хвоста «по умолчанию»; класс незнакомого вида назван
    const defCamSel = () => document.querySelector('[data-def="k:cam"] select');
    const defCamWas = defCamSel()?.value, defCamTo = [...(defCamSel()?.options || [])].map((o) => o.value).find((v) => v && v !== defCamWas);
    defCamSel().value = defCamTo;
    defCamSel().dispatchEvent(new Event("change", { bubbles: true }));
    ok(accRole(gd.id).own["k:cam"] === defCamTo && !accPlanLines().some((x) => /Камеры —/.test(x)) && accPlanLines().some((x) => /Охранные контроллеры —/.test(x)), "умолчание класса базы — без хвоста, как в базе: " + accPlanLines().join(" | ").slice(0, 200));
    defCamSel().value = defCamWas;
    defCamSel().dispatchEvent(new Event("change", { bubbles: true }));
    ok(accToApi(accSt()).roles.find((x) => x.id === gd.id).kindAccess[SC] === "edit" && !Object.keys(accToApi(accSt()).roles[0].global).some((k) => k.includes(":")), "в запросе — Role.kindAccess, в global классов нет");
    const vk = accVer;
    accPlan();
    await confirmWith(null);
    ok(await until(() => accVer !== vk), "применено, версия " + accVer);
    const srvRole = (await uiAccess()).roles.find((x) => x.id === gd.id);
    ok(srvRole.kindAccess[SC] === "edit" && srvRole.kindAccess.cam === "FORBID" && srvRole.kindAccess.sens === "VIEW", "на сервере kindAccess: " + JSON.stringify(srvRole.kindAccess));
    accGo("role:" + gd.id, "defs");
    ok(accRole(gd.id).g[row[0]] === "edit" && document.querySelector(`[data-def="${row[0]}"] select`)?.value === "edit", "класс security_controller появился в роли, уровень сохраняется");
    ok(!accPlanLines().length, "черновик чист");
    // Команде объекта не хватает уровня класса: 403 PERMISSION_DENIED с params.right {class, level} — словами,
    // подписью класса и уровня из описания вида, а не кодом
    const postW = API.post;
    API.post = (p, ...r) => (/^\/units\/[^/]+\/actions\//.test(p) ? Promise.reject({ status: 403, problem: { code: "PERMISSION_DENIED", message: "Команде ARM нужен уровень edit", params: { right: { class: SC, level: "edit" } } } }) : postW(p, ...r));
    unitAct(CTRL, "ARM");
    const denied = await until(() => /Нет права/.test(toastText()));
    API.post = postW;
    ok(denied && /^Поставить на охрану: Нет права: «Охранные контроллеры» — нужен уровень «Правка» или выше/.test(toastText()), "403 команды называет класс и уровень: «" + toastText() + "»");
    // Уровни не беднеют: у всех видов класса cam (камера, поток; у источника событий also cam нет, как в базе) описание урезало уровни, у камеры
    // ещё и новый — строка роли держит все уровни справочника в его порядке, новый уровень вида — после них
    const camAll = (ACC_LV.cam || []).map((l) => l[0]);
    const kindsNow = (await API.get("/kinds")).items, orig = new Map();
    const cut = (k) => {
      const x = JSON.parse(JSON.stringify(k));
      if (x.kind === "camera") x.access.levels = ["FORBID", "FULL", "PTZ_ONLY"];
      else if (x.access?.class === "cam") x.access.levels = ["FORBID", "MON"];
      (x.access?.also || []).forEach((c) => { if (c.class === "cam") c.levels = ["FORBID", "ARCHIVE"]; });
      return x;
    };
    const camKinds = kindsNow.filter((k) => k.access && [k.access, ...(k.access.also || [])].some((c) => c.class === "cam"));
    ok(camKinds.length >= 2 && !camKinds.some((k) => k.kind === "eventsrc"), "видов класса cam: " + camKinds.map((k) => k.kind).join());
    let rawW = null;
    const puts = await Promise.all(camKinds.map((k) => { orig.set(k.kind, k); return API.raw("PUT", `/test/kinds/${encodeURIComponent(k.kind)}`, cut(k)); }));
    if (puts.some((r) => r.status >= 300)) {
      // Стенда со служебными операциями нет — новое описание отдаёт перехваченный GET /kinds
      rawW = API.raw;
      API.raw = function (method, path, body, headers) {
        if (method !== "GET" || path !== "/kinds") return rawW.call(this, method, path, body, headers);
        return rawW.call(this, method, path, body).then((r) => Object.assign({}, r, { status: 200, headers: Object.assign({}, r.headers, { etag: '"ui-access-cut"' }),
          body: Object.assign({}, r.body, { items: r.body.items.map((k) => (orig.has(k.kind) ? cut(k) : k)) }) }));
      };
      apiOnEvent({ type: "kinds.changed", kinds: [...orig.keys()] });
    }
    ok(await until(() => (KINDS.get("camera")?.access.levels || []).join() === "FORBID,FULL,PTZ_ONLY"), "описание камеры перечитано: " + KINDS.get("camera")?.access.levels);
    accGo("role:" + gd.id, "defs");
    const camRow = ACC_DEFS.find((d) => d[2] === "cam"), camSel = document.querySelector(`[data-def="${camRow[0]}"] select`);
    const camOpts = camSel ? [...camSel.options].map((o) => o.value).filter(Boolean) : [];
    ok((ACC_LV.cam || []).map((l) => l[0]).join() === camAll.concat("PTZ_ONLY").join() && camOpts.join() === camAll.concat("PTZ_ONLY").join(),
      "уровни класса не беднеют: справочник по порядку, новый уровень вида — после: " + camOpts.join());
    // Описания — обратно
    if (rawW) { API.raw = rawW; apiOnEvent({ type: "kinds.changed", kinds: [...orig.keys()] }); }
    else await Promise.all([...orig.values()].map((k) => API.raw("PUT", `/test/kinds/${encodeURIComponent(k.kind)}`, k)));
    ok(await until(() => (KINDS.get("camera")?.access.levels || []).join() === orig.get("camera").access.levels.join()) && (ACC_LV.cam || []).map((l) => l[0]).join() === camAll.join(), "описания вернулись, уровни cam прежние");

    // Папки: колонка класса вида, чьи объекты кладутся в папки (capability folders) — security_controller; уровень на папку
    // уходит в Role.folderAccess[uid папки][класс] и после перечитывания с сервера на месте
    accGo("role:" + gd.id, "groups");
    const gj = ACC_GF.findIndex((x) => x[0] === SC);
    const ths = [...document.querySelectorAll(".acc-mx tr:nth-child(2) th")].map((x) => x.textContent);
    ok(gj >= 0 && ths[gj] === "Охранные контроллеры" && ACC_GF.some((x) => x[0] === "test.unknown") && !ACC_GF.some((x) => x[0] === "test.perunit"),
      "колонка класса в матрице папок: " + ths.slice(-3).join(" | "));
    const gi = accMxRows.findIndex((x) => !x.ro && folderById(x.gid)), gid = accMxRows[gi]?.gid;
    const cell = accCellAt(gi, gj);
    cell.click();
    const viewBtn = [...document.querySelectorAll("#accMenu button")].find((x) => x.textContent === "Просмотр");
    ok(!!viewBtn, "у ячейки — уровни класса: " + [...document.querySelectorAll("#accMenu button")].map((x) => x.textContent).join("|"));
    viewBtn.click();
    ok(accRole(gd.id).groups[gid]?.[SC] === "view" && accPlanLines().some((x) => /охранные контроллеры: не задано → Просмотр/i.test(x)), "уровень на папку — в черновике, строка плана подписью класса: " + accPlanLines().join(" | ").slice(0, 200));
    const vf = accVer;
    accPlan();
    await confirmWith(null);
    ok(await until(() => accVer !== vf), "применено, версия " + accVer);
    const srvG = (await uiAccess()).roles.find((x) => x.id === gd.id).folderAccess[gid];
    ok(srvG && srvG[SC] === "view", "на сервере folderAccess[папка]: " + JSON.stringify(srvG));
    accGo("role:" + gd.id, "groups");
    ok(accRole(gd.id).groups[gid]?.[SC] === "view" && accCellAt(gi, ACC_GF.findIndex((x) => x[0] === SC))?.textContent.includes("Просмотр") && !accPlanLines().length,
      "колонка security_controller: уровень на папку после перечитывания на месте");
  }
  // Мастер новой роли: селекты шага «Права» меняют права роли — и на экране, и в итоге
  const wzBack = [accSel, accTab];
  accWzOpen();
  const wzName = document.querySelector("#accWizBd input[type=text]");
  wzName.value = "Роль из мастера";
  wzName.dispatchEvent(new Event("input", { bubbles: true }));
  accWzNext();
  const wzSel = (label) => document.querySelector(`#accWizBd select[aria-label="${label}"]`);
  const wzMap = wzSel("Карты").value, wzPick = [...wzSel("Карты").options].map((o) => o.value).find((v) => v !== wzMap);
  wzSel("Карты").value = wzPick;
  wzSel("Карты").dispatchEvent(new Event("change", { bubbles: true }));
  ok(accWz.g.map === wzPick && wzSel("Карты").value === wzPick, "мастер: выбранное право запомнено: " + accWz.g.map);
  ok(/Заполнено вручную/.test(document.getElementById("accWizBd").textContent), "мастер: «Заполнено вручную» после выбора");
  accWzNext();
  accWzNext();
  accWzNext();
  const wzRole = accRoles().find((x) => x.n === "Роль из мастера");
  ok(wzRole && wzRole.own.map === wzPick, "мастер: роль в черновике с выбранным правом: " + (wzRole && wzRole.own.map));
  accGo(...wzBack);
  if (wzRole) accSt().roles.splice(accSt().roles.indexOf(wzRole), 1);
  accEdited();
  // Отказ сервера: без администраторов — 409, снимок не меняется
  const vNo = accVer;
  const admRole = accRoles().find((r) => r.own.unr);
  accSt().users.forEach((x) => (x.roles = x.roles.filter((id) => id !== admRole.id)));
  accSt().groups.forEach((x) => (x.roles = x.roles.filter((id) => id !== admRole.id)));
  accEdited();
  accPlan();
  await confirmWith(null);
  ok(await until(() => /без администратора|лишит вас входа/.test(toastText())), "сервер отказал: «" + toastText() + "»");
  ok(accVer === vNo && accSrv().roles.some((r) => r.own.unr), "на сервере не изменилось");
  ACC.ed = accClone(ACC.srv);
  accResolveAll();
  // Встроенная роль «Администратор»: переключателя нет, права не меняются, удалить нельзя, назначать можно
  accGo("role:" + admRole.id, "global");
  const mainText = () => document.querySelector("#main, main")?.textContent || document.body.textContent;
  ok(!/Неограниченный доступ/.test(mainText()) && /Встроенная роль/.test(mainText()), "переключателя нет, надпись о встроенной роли");
  ok(accRoles().filter((r) => r.own.unr).length === 1, "встроенная роль одна");
  accDeleteRole(admRole.id);
  ok(/удалить нельзя/.test(toastText()), "удалить нельзя: «" + toastText() + "»");
  accTabGo("members");
  ok(document.querySelector("#main, main")?.querySelector("button"), "вкладка «Пользователи» открыта");
  accTabGo("global");
  ok(accIssues().every((x) => !x.act || !x.act[1].includes("accDeleteRole('" + admRole.id)), "в «Проверке» встроенную роль удалить не предлагают");
  // Срок у последнего администратора: «Проверка» считает только бессрочных, правка с ним не проходит
  const others = accUsers().filter((x) => accProven(x) && x.login !== ACC_ME);
  ok(accAdminCount() >= 1, "бессрочных администраторов: " + accAdminCount());
  ok(!accGuard((st) => st.users.forEach((x) => { if (accProven(x, st)) x.expires = accIso(30); })), "срок всем администраторам — отказ формы, бессрочных: " + others.length);
  // Пароль: смена — в черновик, на сервер только при «Применить», в снимке значения нет
  const pu = accUsers().find((x) => !x.ldap && x.on && !accHasUnr(x, accSrv()));
  accPwdOpen(pu.id);
  ok(/не короче/.test(document.getElementById("bmBody").textContent), "политика из справочника в окне пароля");
  accPwSet("x");
  accPwSave();
  ok(accPw && !accUser(pu.id).pwd, "слабый пароль в черновик не идёт");
  accPwSet("Abcdef12");
  accPwSave();
  ok(accUser(pu.id).pwd === "Abcdef12" && accPlanLines().some((x) => /пароль/i.test(x)), "новый пароль — строкой плана");
  ok(!accPlanLines().join(" ").includes("Abcdef12"), "значение в план не попало");
  const vp = accVer;
  accPlan();
  await confirmWith(null);
  ok(await until(() => accVer !== vp), "применено");
  ok(!accUser(pu.id).pwd && !JSON.stringify(await API.get("/access")).includes("Abcdef12"), "значения нет ни в черновике, ни в снимке");
  // Не администратор: «Администратора» не назначить, на карточке администратора предупреждение
  const meWas = ACC_ME, plainU = accUsers().find((x) => !accHasUnr(x, accSrv()) && x.on);
  ACC_ME = plainU.login;
  ok(!accMeAdmin(), "вошёл не администратор");
  accGo("user:" + accUsers().find((x) => x.login === meWas).id, "gen");
  ok(/менять его может только администратор/.test(document.querySelector("#main, main")?.textContent || ""), "предупреждение на карточке администратора");
  ACC_ME = meWas;
  accGo("roles");
  // Повышение: отказ сервера с подсказкой сменить пароль
  const risky = accUsers().find((x) => x.pwAdmin === false);
  accAssign(risky.id, admRole.id, true);
  ok(/сначала смените/.test(toastText()), "предупреждение при назначении: «" + toastText() + "»");
  accPlan();
  await confirmWith(null);
  ok(await until(() => /сначала смените его/.test(toastText())), "отказ сервера с подсказкой");
  ACC.ed = accClone(ACC.srv);
  accResolveAll();
  // Учётка потока: доступ к камерам — черновиком, через «Применить»
  if (can("feature:streamGrants")) {
    await streamAccsLoad();
    accGo("streams");
    ok(/папк|камер/.test(document.querySelector('[data-stream-acc="videowall"]')?.textContent || ""), "в списке учёток — сводка доступа");
    accGo("stream:videowall");
    const domS = domainFilter || domains[0].id;
    const beforeN = accStreamCams(accStream("videowall"), domS).length;
    ok(beforeN > 0, "учётка видит камер: " + beforeN);
    accStreamAll("videowall", true);
    ok(accStreamCams(accStream("videowall"), domS).length === accCams(domS).length, "все камеры");
    ok(accPlanLines().some((x) => /Доступ учётки потока/.test(x)), "строка плана");
    const vs0 = accVer;
    accPlan();
    await confirmWith(null);
    ok(await until(() => accVer !== vs0), "применено");
    ok((await API.get("/access")).streamGrants.find((x) => x.account === "videowall").all === true, "на сервере — все камеры");
  }
  // Итог считается как may: исключение только внутри своей роли, между ролями наибольшее
  const dom0 = domains[0].id, cam0 = accCams(dom0)[0];
  const fx = (over) => {
    accSt().roles.filter((x) => !x.own.unr).forEach((x) => { delete x.objs[cam0.id]; });
    over();
    accResolveAll();
    return accEffIn(accSt(), probe, cam0.id, dom0, "cam");
  };
  const [ra, rb] = accRoles().filter((x) => !x.own.unr);
  const probe = { id: accNewId(), login: "probe", name: "", email: "", on: true, roles: [ra.id, rb.id], last: null, created: accIso(0), until: {}, expires: "", web: 0, mobile: 0, ldap: "" };
  accSt().users.push(probe);
  ra.groups = { [dom0]: { cam: "FULL" } };
  rb.groups = { [dom0]: { cam: "ARCHIVE" } };
  let e = fx(() => { ra.objs[cam0.id] = { cam: "FORBID" }; });
  ok(e.by === "max" && e.lv === "ARCHIVE", "исключение «Нет» в одной роли, папка другой роли — итог от другой: " + e.lv);
  ok(accExCuts(ra, cam0.id, "cam", dom0).some((x) => x.u.id === probe.id), "исключение снимает права: без него был бы «Полный»");
  const why = accEffWhyHtml(e, "cam");
  ok(/acc-why-off/.test(why.lines) && /наибольшее по ролям/.test(why.foot), "«Почему так»: правило названо, низшая роль зачёркнута");
  e = fx(() => { ra.objs[cam0.id] = { cam: "MON" }; rb.objs[cam0.id] = { cam: "ONLY_ARCHIVE" }; });
  ok(e.by === "join" && e.lv === "ARCHIVE", "«Просмотр» и «Просмотр архива» вместе — «Просмотр и архив»: " + e.lv);
  ACC.ed = accClone(ACC.srv);
  accResolveAll();
  // Администратор: исключения других ролей на него не действуют
  const padm = accUsers().find((x) => x.login === ACC_ME);
  const eAdm = accEffIn(accSt(), padm, cam0.id, dom0, "cam");
  ok(eAdm.by === "unr" && eAdm.lv === "FULL", "администратор: итог — встроенная роль");
  // Удаление пользователя: число, отсчёт, затем — в черновик
  const del = accUsers().find((x) => x.login === "tester");
  accDeleteUser(del.id);
  ok(document.getElementById("confirmOk").disabled, "«Удалить» неактивна до ввода числа");
  await confirmWith(1);
  ok(pendingDelHas(del.id) && accUser(del.id), "отсчёт с «Отменить», пока ещё в черновике");
  ok(await until(() => !accUser(del.id), 30000), "по истечении — удалён из черновика");
  // Удаление роли — так же
  const ext = accRoles().find((r) => r.n === "Подрядчик") || accRoles().find((r) => !r.own.unr && r.id !== op.id);
  accDeleteRole(ext.id, true);
  await confirmWith(1);
  ok(pendingDelHas(ext.id), "роль: отсчёт");
  ok(await until(() => !accRole(ext.id), 30000), "роль удалена из черновика");
  const v2 = accVer;
  accPlan();
  await confirmWith(null);
  ok(await until(() => accVer !== v2), "применено");
  const b = await uiAccess();
  ok(!b.users.some((x) => x.id === del.id) && !b.roles.some((x) => x.id === ext.id), "на сервере — ни пользователя, ни роли");
  // Синхронизация каталога
  const c = accCats()[0];
  accSyncRun(c.id);
  ok(await until(() => accCat(c.id).status === "run"), "синхронизация идёт");
  ok(await until(() => accCat(c.id).status === "ok" && /завершена/.test(toastText())), "завершена: «" + toastText() + "»");
  // Синхронизацию ведёт сервер: после неё «Применить» проходит без 412
  const vs = accVer;
  accSetUser(u.id, "email", "olga@after.sync");
  accPlan();
  await confirmWith(null);
  ok(await until(() => accVer !== vs), "после синхронизации «Применить» проходит: версия " + vs + " → " + accVer);
  // Роль на весь домен: применено не везде — форма говорит это и даёт повтор
  const realPost = API.post;
  const role = accRoles().find((r) => !r.own.unr);
  accLast.roles.find((r) => r.id === role.id).spread = [{ cluster: "Кластер2", state: "refused" }];
  paint();
  ok(await until(() => /Применено не везде/.test(document.getElementById("accSpread")?.textContent || "") && /Кластер2/.test(document.getElementById("accSpread").textContent)), "расхождение видно в разделе");
  let sent = null;
  API.post = (path, data) => (path === "/access/apply" ? ((sent = data), Promise.resolve({ applied: true, notApplied: [{ cluster: "Кластер2", code: "SERVER_OFFLINE" }], clusters: 2 })) : realPost(path, data));
  document.getElementById("accRetry").click();
  ok(await until(() => sent && /Применено не везде/.test(toastText())), "повтор: «применено» не говорим");
  ok(sent.retryClusters[0] === "Кластер2" && !sent.changes.length, "повтор идёт только на кластер");
  API.post = realPost;
});
