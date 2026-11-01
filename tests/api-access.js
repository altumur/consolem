/* Тесты API: права — применение черновика пакетом, проверки, защита от самоблокировки, синхронизация каталога. */
(() => {
  const { test, makeEnv, assert, FX } = ApiTest;
  const A = FX.access;
  const meId = FX.me.userId;
  const draft = () => {
    const a = JSON.parse(JSON.stringify(A));
    return { roles: a.roles, users: a.users, groups: a.groups, catalogs: a.catalogs };
  };
  const apply = (env, access, opts) =>
    env.call("POST", "/access/apply", Object.assign({ access, history: [], cellHistory: [] }, opts && opts.body), { "If-Match": `"${(opts && opts.version) || A.version}"` });
  const NEW_ID = "9fff0001-0000-4000-8000-000000000001";

  test("Права: применить черновик — роль переименована, новый пользователь с ролью, история с автором, версия +1", async () => {
    const env = await makeEnv();
    const d = draft();
    const role = d.roles.find((r) => !r.global.unr);
    role.name = role.name + " (смена)";
    d.users.push({ id: NEW_ID, login: "new.user", name: "Новый", email: "", enabled: true, roleIds: [role.id], roleUntil: {}, lastLoginDate: null, expiresDate: null, webSessions: 0, mobileSessions: 0, catalogId: null });
    const res = await apply(env, d, { body: { history: [{ text: "Создан пользователь new.user", userId: NEW_ID, roleId: role.id }], cellHistory: [{ roleId: role.id, key: FX.domains[0].id, field: "cam", from: null, to: "FULL" }] } });
    assert.status(res, 200);
    const a = res.body.access;
    assert.eq([res.body.applied, res.headers.etag], [true, `"${a.version}"`], "применено, новая версия в ETag");
    assert.ok(a.version !== A.version, "версия изменилась");
    assert.eq(a.roles.find((r) => r.id === role.id).name, role.name, "роль");
    assert.ok(a.users.some((u) => u.id === NEW_ID && u.roleIds[0] === role.id), "пользователь с ролью");
    const login = A.users.find((u) => u.id === meId).login;
    assert.eq([a.history[0].text, a.history[0].actor, a.history.length], ["Создан пользователь new.user", login, A.history.length + 1], "история: сверху, с автором");
    assert.eq([a.cellHistory.length, a.cellHistory[0].to], [1, "FULL"], "история ячеек");
    assert.eq((await env.ok("GET", "/access")).version, a.version, "перечитано");
  });

  test("Права: dryRun — проверка без записи", async () => {
    const env = await makeEnv();
    const d = draft();
    d.roles[1].name = "Проверка";
    const res = await apply(env, d, { body: { dryRun: true } });
    assert.eq([res.status, res.body.applied, res.body.access], [200, false, null], "только проверено");
    assert.eq((await env.ok("GET", "/access")).roles[1].name, A.roles[1].name, "ничего не записано");
  });

  test("Права: повторы имён и логинов (без учёта регистра) — 409; ссылка в никуда — 422", async () => {
    const env = await makeEnv();
    let d = draft();
    d.users[1].login = d.users[0].login.toUpperCase();
    assert.status(await apply(env, d), 409, "LOGIN_TAKEN");
    d = draft();
    d.roles[1].name = " " + d.roles[0].name.toLowerCase() + " ";
    assert.status(await apply(env, d), 409, "NAME_TAKEN");
    d = draft();
    d.users[1].roleIds = ["8fff9999-0000-4000-8000-000000000000"];
    assert.status(await apply(env, d), 422, "VALIDATION_FAILED", "нет роли");
    d = draft();
    d.groups[0].memberIds.push("9fff9999-0000-4000-8000-000000000000");
    assert.status(await apply(env, d), 422, "VALIDATION_FAILED", "нет пользователя");
  });

  test("Права: защита от самоблокировки — без администраторов и без себя нельзя", async () => {
    const env = await makeEnv();
    let d = draft();
    d.roles.forEach((r) => (r.global.unr = false));
    assert.status(await apply(env, d), 409, "SELF_LOCKOUT", "ни одного администратора");
    d = draft();
    d.users.find((u) => u.id === meId).enabled = false;
    assert.status(await apply(env, d), 409, "SELF_LOCKOUT", "себя выключить");
    d = draft();
    d.users = d.users.filter((u) => u.id !== meId);
    d.groups.forEach((g) => (g.memberIds = g.memberIds.filter((x) => x !== meId)));
    assert.status(await apply(env, d), 409, "SELF_LOCKOUT", "себя удалить");
  });

  test("Права: без версии — 428, старая — 412; состояние синхронизации от клиента не берётся", async () => {
    const env = await makeEnv();
    assert.status(await env.call("POST", "/access/apply", { access: draft(), history: [], cellHistory: [] }), 428, "PRECONDITION_REQUIRED");
    assert.status(await apply(env, draft(), { version: "stale" }), 412, "VERSION_MISMATCH");
  });

  test("Каталог: состояние синхронизации от клиента не берётся", async () => {
    const env = await makeEnv();
    const d = draft();
    d.catalogs[0].status = "err";
    d.catalogs[0].message = "подделка";
    const res = await apply(env, d);
    assert.eq([res.body.access.catalogs[0].status, res.body.access.catalogs[0].message], [A.catalogs[0].status, A.catalogs[0].message], "у сервера");
  }, { needs: ["feature:accessCatalogs"] });

  test("Части прав: возможности нет — 422 NOT_SUPPORTED с полем; значение по умолчанию проходит", async () => {
    const env = await makeEnv({ fixturePatch: { reference: { capabilities: { features: [] } }, access: { catalogs: [], groups: [] } } });
    const base = await env.ok("GET", "/access");
    const fresh = () => {
      const a = JSON.parse(JSON.stringify(base));
      a.users.forEach((u) => { u.webSessions = 0; u.mobileSessions = 0; u.catalogId = null; delete u.syncedGroupId; });
      a.roles.forEach((r) => {
        r.loginSchedule = 0;
        r.supervision = { roleId: null, login: false, export: false };
        r.global.depth = 0;
        r.global.restr = {};
        if (!r.global.unr) r.global.ur = r.global.feat.includes("USERS_RIGHTS_SETUP") ? "ALL" : "NO";
      });
      return { roles: a.roles, users: a.users, groups: a.groups, catalogs: a.catalogs };
    };
    const send = (d) => env.call("POST", "/access/apply", { access: d, history: [], cellHistory: [] }, { "If-Match": `"${base.version}"` });
    const role = (d) => d.roles.find((r) => !r.global.unr);
    const cases = [
      ["global.depth", (d) => (role(d).global.depth = 24)],
      ["global.restr", (d) => (role(d).global.restr = { watermark: true })],
      ["global.ur", (d) => (role(d).global.ur = "ALL")],
      ["loginSchedule", (d) => (role(d).loginSchedule = 1)],
      ["supervision", (d) => (role(d).supervision.login = true)],
      ["webSessions", (d) => (d.users[0].webSessions = 2)],
      ["mobileSessions", (d) => (d.users[0].mobileSessions = 2)],
    ];
    for (const [field, spoil] of cases) {
      const d = fresh();
      spoil(d);
      const res = await send(d);
      assert.status(res, 422, "NOT_SUPPORTED", field);
      assert.eq(res.body.field, field, "путь поля");
    }
    assert.status(await send(fresh()), 200);
  });

  test("Справочник: уровень, функция, запрет, плагин вне reference.access — 422 NOT_SUPPORTED", async () => {
    const env = await makeEnv({ fixturePatch: { reference: { access: { levels: { cam: FX.reference.access.levels.cam.filter((x) => x !== "ONLY_ARCHIVE") } } } } });
    const cases = [
      ["folderAccess.cam", (r) => (r.folderAccess[FX.domains[0].id] = { cam: "ONLY_ARCHIVE" })],
      ["objectAccess.cam", (r) => (r.objectAccess[FX.devices.find((x) => x.type === "camera").id] = { cam: "ONLY_ARCHIVE" })],
      ["global.dCam", (r) => (r.global.dCam = "ONLY_ARCHIVE")],
      ["global.feat", (r) => r.global.feat.push("NO_SUCH_FEATURE")],
      ["objectAccess", (r) => (r.objectAccess["plug:no-such"] = {})],
    ];
    for (const [field, spoil] of cases) {
      const d = draft();
      d.roles.filter((r) => !r.global.unr).forEach((r) => {
        if (r.global.dCam === "ONLY_ARCHIVE") r.global.dCam = "FORBID";
        [r.folderAccess, r.objectAccess].forEach((m) => Object.values(m).forEach((row) => { if (row.cam === "ONLY_ARCHIVE") row.cam = "FORBID"; }));
      });
      spoil(d.roles.find((r) => !r.global.unr));
      const res = await apply(env, d);
      assert.status(res, 422, "NOT_SUPPORTED", field);
      assert.eq(res.body.field, field, "путь поля");
    }
  });

  test("Синхронизация каталога: сразу run, через 1,5 с ok и время; во время — 409; группа отдельно", async () => {
    const env = await makeEnv();
    const c = A.catalogs[0];
    const res = await env.call("POST", `/access/catalogs/${c.id}/sync`, { groupId: null });
    assert.status(res, 202);
    assert.eq(res.body.status, "run", "идёт");
    assert.status(await env.call("POST", `/access/catalogs/${c.id}/sync`, { groupId: null }), 409, "BUSY");
    if (env.frozen) {
      const fired = await env.advance(2);
      assert.ok(fired.some((f) => f.kind === "catalog"), "в ответе часов");
    }
    const now = await env.until(async () => {
      const x = (await env.ok("GET", "/access")).catalogs.find((y) => y.id === c.id);
      return x.status !== "run" && x;
    }, "синхронизация закончилась");
    assert.eq([now.status, Date.parse(now.lastSyncAt) > Date.parse(c.lastSyncAt)], ["ok", true], "закончена");
    const g = A.groups.find((x) => x.source && x.source.catalogId === c.id);
    await env.ok("POST", `/access/catalogs/${c.id}/sync`, { groupId: g.id });
    assert.eq((await env.ok("GET", "/access")).catalogs.find((x) => x.id === c.id).status, "ok", "каталог не трогается при синхронизации группы");
    assert.status(await env.call("POST", "/access/catalogs/bfff9999-0000-4000-8000-000000000000/sync", { groupId: null }), 404, "NOT_FOUND");
  }, { needs: ["syncCatalog"] });

  test("Учётки потоков: создать, пароль один раз, отключить, новый пароль, удалить", async () => {
    const env = await makeEnv();
    const was = (await env.list("/stream-accounts")).length;
    const made = await env.call("POST", "/stream-accounts", { name: "wall-2" });
    assert.status(made, 201);
    assert.ok(made.body.password, "пароль в ответе");
    const row = (await env.list("/stream-accounts")).find((x) => x.name === "wall-2");
    assert.eq([row.disabled, row.password], [false, undefined], "в списке пароля нет");
    assert.status(await env.call("POST", "/stream-accounts", { name: "WALL-2" }), 409, "NAME_TAKEN", "имя занято");
    assert.status(await env.call("POST", "/stream-accounts", { name: "  " }), 422, "NAME_REQUIRED", "пустое");
    assert.eq((await env.ok("PATCH", "/stream-accounts/wall-2", { disabled: true })).disabled, true, "отключена");
    const next = await env.ok("POST", "/stream-accounts/wall-2/password", {});
    assert.ok(next.password && next.password !== made.body.password, "новый пароль");
    assert.status(await env.call("DELETE", "/stream-accounts/wall-2"), 204);
    assert.eq((await env.list("/stream-accounts")).length, was, "удалена");
    assert.status(await env.call("PATCH", "/stream-accounts/wall-2", { disabled: false }), 404, "NOT_FOUND");
  });

  ApiTest.loaded("api-access.js");
})();
