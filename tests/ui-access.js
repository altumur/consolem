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
  const admRole = accRoles().find((r) => r.own.unr);
  accSt().users.forEach((x) => (x.roles = x.roles.filter((id) => id !== admRole.id)));
  accSt().groups.forEach((x) => (x.roles = x.roles.filter((id) => id !== admRole.id)));
  accEdited();
  accPlan();
  await confirmWith(null);
  ok(await until(() => /без администратора|лишит вас входа/.test(toastText())), "сервер отказал: «" + toastText() + "»");
  ok(accVer === v1 && accSrv().roles.some((r) => r.own.unr), "на сервере не изменилось");
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
