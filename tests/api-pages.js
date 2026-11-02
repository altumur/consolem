/* Тесты API: страницы и дерево по запросу. Общее правило страницы на каждом перечне, фильтры, строка устройства,
   дерево, папки, поток с наблюдением, итог домена, предел выбора. */
(() => {
  const { test, makeEnv, assert, FX } = ApiTest;
  const did = FX.domains[0].id;
  const noServer = ({ serverId, ...d }) => d;
  const q = (path, params) => path + (path.includes("?") ? "&" : "?") + new URLSearchParams(params).toString();
  // Перечень → как читается. У каждого из таблицы предложения: limit, cursor, порядок не меняется, чужой курсор отвергается
  const LISTS = [
    ["/devices"], ["/folders"], ["/archives"], ["/volumes"], ["/journal"], ["/operations"],
    ["/access/users"], ["/access/groups"], ["/access/history"], ["/access/cell-history"],
    ["/archive-watches", "listArchiveWatches"], ["/archive-scans", "listArchiveScans"],
  ];
  async function allPages(env, path, limit) {
    const got = [];
    let cursor = null;
    let guard = 0;
    do {
      const res = await env.ok("GET", q(path, Object.assign({ limit }, cursor ? { cursor } : {})));
      assert.ok(res.items.length <= limit, `${path}: не больше limit`);
      got.push(...res.items);
      cursor = res.nextCursor || null;
      assert.ok(++guard < 2000, `${path}: страницы кончаются`);
    } while (cursor);
    return got;
  }

  test("Страницы: каждый перечень из таблицы — limit, cursor, обход целиком, чужой и просроченный курсор", async () => {
    const env = await makeEnv();
    for (const [path, op] of LISTS) {
      if (op && !ApiTest.can(op)) continue;
      const whole = await allPages(env, path, 1000);
      const small = await allPages(env, path, 3);
      const key = (x) => x.id || x.objectId;
      assert.eq(small.map(key), whole.map(key), `${path}: мелкие страницы дают то же и в том же порядке`);
      const first = await env.ok("GET", q(path, { limit: 1 }));
      if (whole.length > 1) {
        assert.ok(first.nextCursor, `${path}: есть продолжение`);
        assert.status(await env.call("GET", q(path, { limit: 1, cursor: "чужой" })), 422, "INVALID_CURSOR", `${path}: чужой курсор`);
        const other = await env.ok("GET", q(LISTS.find(([p]) => p !== path)[0], { limit: 1 }));
        if (other.nextCursor) assert.status(await env.call("GET", q(path, { limit: 1, cursor: other.nextCursor })), 422, "INVALID_CURSOR", `${path}: курсор другого перечня`);
      } else assert.ok(!first.nextCursor, `${path}: конец — без nextCursor`);
      assert.status(await env.call("GET", q(path, { limit: 0 })), 422, "VALIDATION_FAILED", `${path}: limit 0`);
      assert.status(await env.call("GET", q(path, { limit: 1001 })), 422, "VALIDATION_FAILED", `${path}: limit 1001`);
    }
  });

  test("Страницы: курсор живёт круг вида, просроченный — 422 INVALID_CURSOR", async () => {
    const env = await makeEnv();
    const first = await env.ok("GET", "/devices?limit=1");
    await env.advance(21 * 60);
    assert.status(await env.call("GET", q("/devices", { limit: 1, cursor: first.nextCursor })), 422, "INVALID_CURSOR");
  }, { needs: ["clock"] });

  test("Страницы: вставка не сдвигает, строки не теряются и не повторяются", async () => {
    const env = await makeEnv();
    const a = await env.ok("GET", "/folders?limit=2");
    await env.ok("POST", "/folders", { name: "Новая", domainId: did, parentId: null });
    const rest = await env.pages(q("/folders", { limit: 3, cursor: a.nextCursor }));
    const ids = a.items.concat(rest).map((f) => f.id);
    assert.eq(new Set(ids).size, ids.length, "без повторов");
    assert.ok(FX.folders.every((f) => ids.includes(f.id)), "ни одна не потеряна");
  });

  test("Устройства: только строка, полная запись — по id с folderIds; total только без фильтра", async () => {
    const env = await makeEnv();
    const page = await env.ok("GET", "/devices?limit=5");
    assert.eq(page.total, FX.devices.length, "total без фильтра");
    const row = page.items[0];
    ["ip", "vendor", "archiveId", "streams", "folderIds"].forEach((k) => assert.ok(!(k in row), `${k} нет в строке`));
    const full = await env.ok("GET", `/devices/${row.id}`);
    assert.eq([full.name, full.type], [row.name, row.type], "та же запись");
    const inFolder = FX.folders.find((f) => f.deviceIds.length);
    assert.ok((await env.ok("GET", `/devices/${inFolder.deviceIds[0]}`)).folderIds.includes(inFolder.id), "folderIds");
    assert.ok(!("total" in (await env.ok("GET", q("/devices", { q: "а" })))), "с фильтром total нет");
  });

  test("Устройства: фильтр идёт ограниченным проходом, пустая страница с nextCursor законна, обход находит всё", async () => {
    const env = await makeEnv();
    const lim = (await env.ok("GET", "/reference")).limits.scanPartsMax;
    assert.ok(lim > 0, "scanPartsMax объявлен");
    const cam = FX.devices.find((d) => d.type === "camera");
    let cursor = null, found = [], empties = 0, n = 0;
    do {
      const res = await env.ok("GET", q("/devices", Object.assign({ q: cam.name, domainId: cam.domainId }, cursor ? { cursor } : {})));
      if (!res.items.length && res.nextCursor) empties++;
      found.push(...res.items.map((d) => d.id));
      cursor = res.nextCursor || null;
      n++;
    } while (cursor);
    assert.ok(found.includes(cam.id), "нашлась");
    assert.ok(n > 1, "за один запрос весь домен не просмотрен");
    assert.ok(empties > 0, "пустая страница с nextCursor");
    const both = await env.pages(q("/devices", { status: "off,license", type: "camera,ipsrv" }));
    assert.ok(both.every((d) => ["camera", "ipsrv"].includes(d.type) && (!d.enabled || d.licenseExceeded)), "status и type — это ИЛИ внутри себя");
  });

  test("Устройства: один член — порядок по имени; ids — до idsMax; папка — постоянная цена, скрытое не показывается", async () => {
    const hidden = FX.folders.find((f) => f.deviceIds.length > 2);
    const env = await makeEnv({ fixturePatch: { stand: { hiddenIds: hidden.deviceIds.slice(0, 2) } } });
    const s = FX.devices.find((d) => d.serverId && !d.parentId).serverId;
    const names = (await env.pages(q("/devices", { serverId: s }))).map((d) => d.name);
    assert.eq(names, names.slice().sort(), "по имени внутри сервера");
    const ids = FX.devices.slice(0, 3).map((d) => d.id);
    assert.eq((await env.ok("GET", q("/devices", { ids: ids.join(",") }))).items.map((d) => d.id), ids, "ids");
    const many = Array.from({ length: 201 }, () => ids[0]).join(",");
    assert.status(await env.call("GET", q("/devices", { ids: many })), 422, "VALIDATION_FAILED", "больше idsMax");
    const page = await env.ok("GET", q("/devices", { folderId: hidden.id, limit: 1 }));
    assert.ok(page.items.length <= 1, "страница короче");
    const shown = await env.folderIds(hidden.id);
    assert.eq(shown.length, hidden.deviceIds.length - 2, "без права view не показаны");
    assert.ok((await env.pages(q("/devices", { archiveId: FX.archives[0].id }))).length >= 0, "хранилище");
  });

  test("Строка камеры-кластера: без сервера и родителя, r<revision>, hasChildren — «может быть»", async () => {
    const env = await makeEnv({ fixturePatch: { devices: FX.devices.map((d) => (d.type === "camera" && !d.parentId && d.name === "Главный вход" ? noServer(d) : d)) } });
    const cam = FX.devices.find((d) => d.name === "Главный вход");
    const [row] = (await env.ok("GET", q("/devices", { ids: cam.id }))).items;
    assert.eq([row.serverId, row.parentId, row.hasChildren], [null, null, true], "поля");
    assert.ok(/^r\d+$/.test(row.version), `версия ${row.version}`);
    const tree = await env.pages(q("/tree/children", { layout: "servers", parentId: cam.domainId }));
    assert.ok(tree.some((n) => n.id === cam.id && n.kind === "device"), "под доменом");
    assert.ok(!(await env.pages(q("/tree/children", { layout: "detectors", parentId: cam.domainId }))).some((n) => n.id === cam.id), "в detectors сводного списка нет");
  });

  test("/objects/delete: обе формы version, r<revision> не видит правку записи, предел selectMax", async () => {
    const pick = FX.devices.filter((d) => d.type === "camera" && !d.parentId && d.archiveId).slice(0, 3);
    const off = pick.map((d) => d.id);
    const env = await makeEnv({ fixturePatch: { devices: FX.devices.map((d) => (off.includes(d.id) ? noServer(d) : d)) } });
    const del = (id, version) => env.ok("POST", "/objects/delete", { idempotencyKey: ApiTest.key(), items: [{ id, version }] });
    const row = async (id) => (await env.ok("GET", q("/devices", { ids: id }))).items[0];
    assert.eq((await del(pick[0].id, (await row(pick[0].id)).version)).done, [pick[0].id], "r<revision>");
    assert.eq((await del(pick[1].id, (await env.ok("GET", `/devices/${pick[1].id}`)).version)).done, [pick[1].id], "Device.version");
    const was = await row(pick[2].id);
    let full = await env.ok("GET", `/devices/${pick[2].id}`);
    full = await env.ok("PATCH", `/devices/${full.id}`, { retentionDays: 3 }, { "If-Match": `"${full.version}"` });
    assert.eq((await row(pick[2].id)).version, was.version, "правка записи revision не двигает");
    await env.ok("PATCH", `/devices/${full.id}`, { name: "Другое имя" }, { "If-Match": `"${full.version}"` });
    assert.eq((await del(pick[2].id, was.version)).failed[0].code, "VERSION_MISMATCH", "правка строки останавливает");
    const items = Array.from({ length: 501 }, (x, i) => ({ id: FX.devices[i % FX.devices.length].id, version: "1" }));
    assert.status(await env.call("POST", "/objects/delete", { idempotencyKey: ApiTest.key(), items }), 422, "VALIDATION_FAILED", "больше selectMax");
  });

  test("Дерево: верхний уровень, дети, порядок, parentCount, узла нет — 404", async () => {
    const env = await makeEnv();
    const top = await env.pages(q("/tree/children", { layout: "servers" }));
    assert.eq(top.map((n) => n.kind), FX.domains.map(() => "domain"), "домены");
    const res = await env.ok("GET", q("/tree/children", { layout: "servers", parentId: did, limit: 2 }));
    assert.ok(res.nextCursor && res.parentCount > 2, "страницы и parentCount");
    const kids = await env.pages(q("/tree/children", { layout: "servers", parentId: did }));
    assert.ok(kids.some((n) => n.kind === "server") && kids.some((n) => n.kind === "unalloc"), "серверы и нераспределённые");
    const un = kids.find((n) => n.kind === "unalloc");
    assert.ok((await env.pages(q("/tree/children", { layout: "servers", parentId: un.id }))).every((n) => n.kind === "server"), "внутри — серверы");
    const srv = FX.devices.find((d) => d.serverId && !d.parentId).serverId;
    const devs = await env.pages(q("/tree/children", { layout: "servers", parentId: srv }));
    assert.ok(devs.every((n) => n.kind === "device" && n.row && n.row.id === n.id), "устройства со строкой");
    const f = FX.folders.find((x) => x.deviceIds.length);
    const inside = await env.pages(q("/tree/children", { layout: "folders", parentId: f.id }));
    assert.eq(inside.filter((n) => n.kind === "device").length, f.deviceIds.length, "состав папки");
    const parent = FX.devices.find((d) => d.parentId).parentId;
    assert.ok((await env.pages(q("/tree/children", { layout: "servers", parentId: parent }))).every((n) => n.row.parentId === parent), "дети устройства");
    assert.status(await env.call("GET", q("/tree/children", { layout: "servers", parentId: "нет" })), 404, "NOT_FOUND");
    assert.status(await env.call("GET", q("/tree/children", { layout: "другая" })), 422, "VALIDATION_FAILED");
    const a = FX.archives.find((x) => FX.volumes.some((v) => v.archiveId === x.id));
    assert.ok((await env.pages(q("/tree/children", { layout: "archives", parentId: a.id }))).every((n) => n.kind === "volume"), "тома");
  });

  test("Дерево: цепочки от корня; камера в нескольких папках — несколько; до idsMax", async () => {
    const env = await makeEnv();
    const twice = FX.devices.find((d) => FX.folders.filter((f) => f.deviceIds.includes(d.id)).length > 1) || FX.devices.find((d) => FX.folders.some((f) => f.deviceIds.includes(d.id)));
    const n = FX.folders.filter((f) => f.deviceIds.includes(twice.id)).length;
    const res = await env.ok("GET", q("/tree/paths", { layout: "folders", ids: twice.id }));
    assert.eq(res.items[0].chains.length, n, "цепочек столько же, сколько папок");
    res.items[0].chains.forEach((c) => assert.eq([c[0].kind, c[c.length - 1].id], ["domain", twice.id], "от домена до объекта"));
    const srv = await env.ok("GET", q("/tree/paths", { layout: "servers", ids: twice.id }));
    assert.ok(srv.items[0].chains[0].some((x) => x.kind === "server") || !twice.serverId, "через сервер");
    assert.eq((await env.ok("GET", q("/tree/paths", { layout: "servers", ids: "нет" }))).items, [], "нет объекта — нет строки");
    assert.status(await env.call("GET", q("/tree/paths", { layout: "servers", ids: Array(201).fill(twice.id).join(",") })), 422, "VALIDATION_FAILED");
  });

  test("Папка: состав через POST /folders/{id}/devices, одна операция, откат папок — fail NOT_SUPPORTED, предел selectMax", async () => {
    const env = await makeEnv();
    const f = FX.folders.find((x) => x.deviceIds.length > 1);
    const add = FX.devices.find((d) => d.domainId === f.domainId && d.type === "camera" && !d.parentId && !f.deviceIds.includes(d.id));
    const res = await env.ok("POST", `/folders/${f.id}/devices`, { add: [add.id], remove: [f.deviceIds[0]] });
    assert.ok(res.version !== f.version && !("deviceIds" in res), "версия, состава в записи нет");
    const ids = await env.folderIds(f.id);
    assert.ok(ids.includes(add.id) && !ids.includes(f.deviceIds[0]), "добавлено и убрано");
    const [op] = await env.pages("/operations?limit=1");
    assert.eq(op.items.length, 2, "одна операция на два шага");
    const back = await env.finished((await env.ok("POST", `/operations/${op.id}/revert`)).id, 100);
    assert.eq(back.items.map((x) => [x.state, x.code, x.params && x.params.reason]), [["fail", "NOT_SUPPORTED", "folders"], ["fail", "NOT_SUPPORTED", "folders"]], "папки вне отката: шаг говорит словом");
    assert.ok((await env.folderIds(f.id)).includes(add.id), "состав не вернулся");
    const many = Array.from({ length: 501 }, () => add.id);
    assert.status(await env.call("POST", `/folders/${f.id}/devices`, { add: many, remove: [] }), 422, "VALIDATION_FAILED", "больше selectMax");
  });

  test("Домен: stateSummary — числа не пересекаются, выключенные вне total, отставание на круг, unread, нет круга — нет поля", async () => {
    const env = await makeEnv();
    const cams = FX.devices.filter((d) => d.domainId === did && d.type === "camera");
    const s = (await env.ok("GET", `/domains/${did}`)).stateSummary;
    assert.eq(s.total, cams.filter((d) => d.enabled !== false).length, "выключенные вне total");
    assert.ok(s.offline + s.silent <= s.total, "не пересекаются");
    assert.ok(Date.parse(s.at) > 0 && !("unread" in s), "время есть, unread нет");
    const cam = cams.find((d) => d.enabled !== false && d.online !== false);
    await env.ok("POST", "/test/events", { type: "device.signal", deviceId: cam.id, online: false });
    assert.eq((await env.ok("GET", `/domains/${did}`)).stateSummary.offline, s.offline, "отстаёт на круг");
    if (env.frozen) {
      await env.advance(21 * 60);
      assert.eq((await env.ok("GET", `/domains/${did}`)).stateSummary.offline, s.offline + 1, "новый круг");
    }
    const part = await makeEnv({ fixturePatch: { stand: { unread: 3 } } });
    assert.eq((await part.ok("GET", `/domains/${did}`)).stateSummary.unread, 3, "unread");
    const none = await makeEnv({ fixturePatch: { stand: { summaryOff: true } } });
    assert.ok(!("stateSummary" in (await none.ok("GET", `/domains/${did}`))), "круг не прошёл — поля нет");
  });

  test("Поток: stream.hello первым, события устройств — только по наблюдению и детям, tree.changed, предел watchMax", async () => {
    const env = await makeEnv();
    const cam = FX.devices.find((d) => d.type === "camera" && !d.parentId && d.serverId);
    const other = FX.devices.find((d) => d.type === "camera" && !d.parentId && d.serverId && d.serverId !== cam.serverId);
    const seen = [];
    let hello = null;
    const stop = ApiTest.subscribeForTest((m) => {
      if (m.type === "stream.hello") hello = m;
      seen.push(m);
    }, [cam.id]);
    await ApiTest.settle();
    assert.ok(hello && hello.clientId && seen[0] === hello, "hello первым");
    const rename = async (d, name) => env.ok("PATCH", `/devices/${d.id}`, { name }, { "If-Match": await env.etag(`/devices/${d.id}`) });
    await rename(cam, "А");
    await rename(other, "Б");
    await env.ok("GET", "/me");
    await ApiTest.settle();
    const dev = seen.filter((m) => m.kind === "device").map((m) => m.entityId);
    assert.ok(dev.includes(cam.id) && !dev.includes(other.id), "только наблюдаемое");
    const tree = seen.filter((m) => m.type === "tree.changed");
    assert.ok(tree.some((m) => m.layout === "servers" && m.parentIds.includes(other.serverId)), "ветка вне наблюдения — tree.changed");
    assert.status(await env.call("PUT", `/stream/${hello.clientId}/watch`, { ids: Array.from({ length: 201 }, (x, i) => String(i)) }), 422, "VALIDATION_FAILED", "больше watchMax");
    assert.status(await env.call("PUT", "/stream/нет/watch", { ids: [] }), 404, "NOT_FOUND");
    await env.ok("PUT", `/stream/${hello.clientId}/watch`, { ids: [cam.serverId] });
    await ApiTest.settle();
    seen.length = 0;
    await rename(cam, "В");
    await ApiTest.settle();
    assert.ok(seen.some((m) => m.kind === "device" && m.entityId === cam.id), "дети наблюдаемого");
    stop();
  });

  test("Права: снимок без людей, перечни страницами, объекты роли, apply изменениями, чужая правка — 412", async () => {
    const env = await makeEnv();
    const acc = await env.ok("GET", "/access");
    assert.ok(acc.roles.every((r) => typeof r.objectAccessCount === "number" && !("objectAccess" in r)), "счёт вместо списка");
    const role = FX.access.roles.find((r) => Object.keys(r.objectAccess).length);
    if (role) {
      const objs = await env.pages(`/access/roles/${role.id}/objects`);
      assert.eq(objs.length, Object.keys(role.objectAccess).length, "объекты роли");
      assert.eq(acc.roles.find((r) => r.id === role.id).objectAccessCount, objs.length, "счёт совпал");
    }
    assert.status(await env.call("GET", "/access/roles/нет/objects"), 404, "NOT_FOUND");
    const u = FX.access.users.find((x) => x.login);
    assert.ok((await env.pages(q("/access/users", { q: u.login }))).some((x) => x.id === u.id), "поиск");
    const target = FX.access.users.find((x) => x.id !== FX.me.userId && !x.catalogId);
    const res = await env.ok("POST", "/access/apply", { version: acc.version, changes: [{ kind: "user", id: target.id, op: "set", value: Object.assign({}, target, { name: "Изменён" }) }], history: [], cellHistory: [] });
    assert.ok(res.access.version !== acc.version, "новая версия");
    assert.status(await env.call("POST", "/access/apply", { version: acc.version, changes: [], history: [], cellHistory: [] }), 412, "VERSION_MISMATCH", "чужая правка");
    assert.eq((await env.pages(q("/access/users", { q: "Изменён" }))).map((x) => x.id), [target.id], "записано");
    assert.ok((await env.pages("/access/users")).length === FX.access.users.length, "остальные на месте");
  });

  test("Поиск в сети: страницы у candidates", async () => {
    const env = await makeEnv();
    const did2 = FX.discovery[0].domainId;
    const res = await env.ok("GET", `/domains/${did2}/discovery?limit=1`);
    assert.ok(res.candidates.length <= 1 && res.total >= res.candidates.length, "страница");
    if (res.total > 1) assert.eq((await env.ok("GET", `/domains/${did2}/discovery?limit=1&cursor=${encodeURIComponent(res.nextCursor)}`)).candidates.length, 1, "вторая");
  }, { needs: ["getDiscovery"] });

  test("Запуски правила: страницы", async () => {
    const env = await makeEnv();
    const f = FX.ruleFires[0];
    const all = await env.pages(`/rules/${f.ruleId}/fires`);
    assert.eq(all.length, FX.ruleFires.filter((x) => x.ruleId === f.ruleId).length, "все");
    assert.ok((await env.ok("GET", `/rules/${f.ruleId}/fires?limit=1`)).items.length === 1, "одна");
  });
  const SCEN = ["getScenarios", "putScenarios", "getScenariosStatus"];
  const scen = (over) => {
    const cams = FX.devices.filter((d) => d.type === "camera" && d.domainId === did);
    return Object.assign({ name: "Ворота — двор", when: { deviceId: cams[0].id, kind: "motion" }, then: { deviceId: cams[1].id, action: "preset", n: 3 }, enabled: true }, over);
  };
  test("Документ V/07.5: чтение, запись целиком, версия, 412 на чужую правку, отказы формы, состояние из пульса", async () => {
    const env = await makeEnv();
    const doc = await env.ok("GET", `/domains/${did}/scenarios`);
    assert.eq(doc.items, [], "пусто");
    const put = (items, version) => env.call("PUT", `/domains/${did}/scenarios`, { items }, { "If-Match": `"${version}"` });
    const one = await put([scen()], doc.version);
    assert.status(one, 200);
    assert.ok(one.body.version !== doc.version && one.headers.etag === `"${one.body.version}"`, "новая версия в ETag");
    assert.status(await put([scen()], doc.version), 412, "VERSION_MISMATCH", "чужая правка");
    assert.status(await env.call("PUT", `/domains/${did}/scenarios`, { items: [] }), 428, "PRECONDITION_REQUIRED");
    const v = one.body.version;
    assert.status(await put([scen(), scen()], v), 409, "NAME_TAKEN", "повтор имени");
    assert.status(await put([scen({ then: { deviceId: scen().then.deviceId, action: "preset", n: 1, port: 2 } })], v), 422, "VALIDATION_FAILED", "n и port вместе");
    assert.status(await put([scen({ then: { deviceId: scen().then.deviceId, action: "output" } })], v), 422, "VALIDATION_FAILED", "нет номера");
    const notCam = FX.devices.find((d) => d.type !== "camera");
    assert.status(await put([scen({ then: { deviceId: notCam.id, action: "preset", n: 1 } })], v), 422, "VALIDATION_FAILED", "цель не камера");
    assert.status(await put([scen({ when: { deviceId: scen().when.deviceId, kind: "нет" } })], v), 422, "VALIDATION_FAILED", "нет такого вида");
    assert.status(await put([scen({ then: { deviceId: scen().then.deviceId, action: "preset", n: 1, validForSec: 5 } })], v), 422, "VALIDATION_FAILED", "срок вне границ");
    assert.eq((await env.ok("GET", `/domains/${did}/scenarios/status`)).items, [], "в пульсе нет — строки нет");
    const status = { name: "Ворота — двор", phase: "running", asked: 2, outcomes: { performed: 1, refused: 1, expired: 0, unknown: 0 } };
    await env.ok("POST", "/test/events", { type: "scenario.outcome", domainId: did, name: status.name, status });
    assert.eq((await env.ok("GET", `/domains/${did}/scenarios/status`)).items[0].asked, 2, "состояние");
    assert.eq((await env.ok("GET", `/domains/${did}/scenarios`)).version, v, "состояние версию не двигает");
    assert.eq((await env.pages("/operations")).length, 0, "вне отката, /operations не пишется");
  }, { needs: SCEN });
  test("Документ V/07.5: без admin домена — 403, без связи с доменом — 409", async () => {
    const adm = FX.access.roles.find((r) => r.global.unr);
    const reader = FX.access.users.find((u) => u.enabled && !u.roleIds.includes(adm.id) && !FX.access.groups.some((g) => g.memberIds.includes(u.id) && g.roleIds.includes(adm.id)));
    const env = await makeEnv({ actAs: reader.login });
    const doc = await env.ok("GET", `/domains/${did}/scenarios`);
    assert.status(await env.call("PUT", `/domains/${did}/scenarios`, { items: [] }, { "If-Match": `"${doc.version}"` }), 403, "PERMISSION_DENIED");
    const off = await makeEnv({ fixturePatch: { domains: FX.domains.map((d) => (d.id === did ? Object.assign({}, d, { online: false }) : d)) } });
    const dd = await off.ok("GET", `/domains/${did}/scenarios`);
    assert.status(await off.call("PUT", `/domains/${did}/scenarios`, { items: [] }, { "If-Match": `"${dd.version}"` }), 409, "SERVER_OFFLINE");
  }, { needs: SCEN });

  ApiTest.loaded("api-pages.js");
})();
