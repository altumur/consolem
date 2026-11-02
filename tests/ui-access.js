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
  const a = await API.get("/access");
  ok(a.users.find((x) => x.id === u.id).email === "olga@new.local", "на сервере — новый e-mail");
  ok(a.users.some((x) => x.id === nu.id && x.login === "tester" && x.roleIds[0] === op.id), "новый пользователь с UUID и ролью");
  ok(a.history[0].actor === ACC_ME && accSrv().log[0].who === ACC_ME, "история — с автором " + ACC_ME + ": «" + a.history[0].text.slice(0, 50) + "»");
  ok(!accPlanLines().length, "черновик чист");
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
  accPlan();
  await confirmWith(null);
  ok(await until(() => accVer !== v1), "применено");
  const b = await API.get("/access");
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
});
