/* Тесты API: страницы и дерево по запросу. Общее правило страницы на каждом перечне, фильтры /units, краткий объект,
   дерево, папки, поток с наблюдением, итог домена, предел выбора. */
(() => {
  const { test, makeEnv, assert, FX } = ApiTest;
  const did = FX.domains[0].id;
  const noServer = ({ serverId, ...d }) => d;
  const q = (path, params) => path + (path.includes("?") ? "&" : "?") + new URLSearchParams(params).toString();
  // Перечень → как читается. У каждого из таблицы предложения: limit, cursor, порядок не меняется, чужой курсор отвергается
  const LISTS = [
    ["/units"], ["/units?kind=folder"], ["/units?kind=archive.network"], ["/units?kind=volume"], ["/journal"], ["/operations"],
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
      const key = (x) => x.id || x.uid || x.objectId;
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
    const first = await env.ok("GET", "/units?limit=1");
    await env.advance(21 * 60);
    assert.status(await env.call("GET", q("/units", { limit: 1, cursor: first.nextCursor })), 422, "INVALID_CURSOR");
  }, { needs: ["clock"] });

  test("Страницы: вставка не сдвигает, строки не теряются и не повторяются", async () => {
    const env = await makeEnv();
    const a = await env.ok("GET", "/units?kind=folder&limit=2");
    const made = await env.ok("POST", "/units", { idempotencyKey: ApiTest.key(), items: [{ kind: "folder", name: "Новая", domainId: did, properties: {} }] });
    assert.eq(made.failed, [], "папка создана");
    const rest = await env.pages(q("/units?kind=folder", { limit: 3, cursor: a.nextCursor }));
    const ids = a.items.concat(rest).map((f) => f.uid);
    assert.eq(new Set(ids).size, ids.length, "без повторов");
    assert.ok(FX.folders.every((f) => ids.includes(f.id)), "ни одна не потеряна");
  });

  test("Страницы: отбор только по implements — по индексу вида, страницы полные, порядок прежний; kind — проход, как type у /devices", async () => {
    const env = await makeEnv();
    for (const filter of ["implements=vms.camera/1", "implements=vms.camera/1,vms.folder/1", `implements=vms.camera/1&domainId=${did}`]) {
      const whole = await env.pages(`/units?${filter}&limit=1000`);
      assert.ok(whole.length > 6, `${filter}: строк больше страницы`);
      const sizes = [];
      const walked = [];
      let cursor = null;
      do {
        const page = await env.ok("GET", q("/units?" + filter, Object.assign({ limit: 4 }, cursor ? { cursor } : {})));
        sizes.push(page.items.length);
        page.items.forEach((u) => walked.push(u.uid));
        cursor = page.nextCursor || null;
      } while (cursor);
      assert.eq(walked, whole.map((u) => u.uid), `${filter}: обход курсором равен порядку без разбивки`);
      assert.eq(new Set(walked).size, walked.length, `${filter}: без повторов`);
      assert.ok(sizes.slice(0, -1).every((n) => n === 4) && sizes[sizes.length - 1] >= 1, `${filter}: страницы полные до конца (${sizes.join(",")})`);
    }
    // kind= — как type у /devices в базе: ограниченный проход в порядке разделов. Встроенный сервер дописывает страницу до
    // limit или бюджета времени (api/README.md, «Страницы ограниченного прохода»): на demo все камеры — первой страницей.
    // Бэкенд вправе отдать её короче, с nextCursor
    const all = await env.pages("/units?implements=vms.camera/1&limit=1000");
    const first = await env.ok("GET", "/units?kind=camera&limit=200");
    if (!ApiTest.external) assert.ok(all.length < 200 && first.items.length === all.length && !first.nextCursor, `kind=camera: первая страница дописана до конца (${first.items.length} из ${all.length})`);
    assert.eq(first.items.map((u) => u.uid), all.slice(0, first.items.length).map((u) => u.uid), "kind=camera: те же строки в том же порядке, что по индексу");
    assert.eq((await env.pages("/units?kind=camera&limit=200")).map((u) => u.uid), all.map((u) => u.uid), "kind=camera: обход курсором находит всё");
    // kind= вместе с domainId — по индексу вида: страница полная, хранилище на месте, порядок прежний
    const arch = await env.ok("GET", `/units?kind=archive.incidents&domainId=${did}&limit=1`);
    const archAll = await env.pages(`/units?implements=vms.archive/1&domainId=${did}&limit=1000`);
    const wantA = archAll.filter((u) => u.kind === "archive.incidents").map((u) => u.uid);
    assert.ok(wantA.length >= 1 && arch.items.length === 1 && arch.items[0].kind === "archive.incidents", "kind+domainId: полная страница с хранилищем");
    assert.eq((await env.pages(`/units?kind=archive.incidents,camera&domainId=${did}&limit=3`)).filter((u) => u.kind === "archive.incidents").map((u) => u.uid), wantA, "kind+domainId: несколько видов, обход курсором");
  });

  test("Поиск q без fields — как /devices?q= базы: имя, короткое имя, номер, адрес, производитель, модель; часть uid не ищется", async () => {
    const env = await makeEnv();
    const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е");
    const textHit = (text, ...vals) => vals.some((v) => v != null && norm(v).includes(norm(text).trim()));
    const devs = new Set(FX.devices.map((d) => d.id));
    for (const text of ["1", "Склад", "192.168", "Hik"]) {
      // Ожидание — правило /devices?q= базы над записями устройств набора
      const want = FX.devices.filter((d) => textHit(text, d.name, d.short, d.identifier, d.ip, d.vendor, d.model)).map((d) => d.id).sort();
      const got = await allPages(env, q("/units", { q: text }), 200);
      assert.eq(got.filter((u) => devs.has(u.uid)).map((u) => u.uid).sort(), want, `«${text}»: те же устройства`);
      assert.ok(got.every((u) => u.match && u.match.field !== "uid"), `«${text}»: по части uid не находится`);
    }
    // Весь uid — находится, match.field — uid
    const one = FX.devices.find((d) => d.type === "camera");
    assert.eq((await allPages(env, q("/units", { q: one.id }), 200)).map((u) => [u.uid, u.match.field]), [[one.id, "uid"]], "uid целиком");
  }, { needs: ["listUnits"] });

  test("Объекты: total только без фильтра, папки объекта — Unit.folders по uid", async () => {
    const env = await makeEnv();
    const page = await env.ok("GET", "/units?limit=5");
    assert.eq(page.total, (await env.pages("/units")).length, "total без фильтра");
    const inFolder = FX.folders.find((f) => f.deviceIds.length);
    assert.ok((await env.ok("GET", `/units/${inFolder.deviceIds[0]}`)).folders.includes(inFolder.id), "folders");
    assert.ok(!("total" in (await env.ok("GET", q("/units", { q: "а" })))), "с фильтром total нет");
  });

  // Обход отбора страницами: найденное, число запросов, пустые страницы с nextCursor
  async function walk(env, params, limit) {
    let cursor = null, found = [], empties = 0, n = 0, sizes = [];
    do {
      const res = await env.ok("GET", q("/units", Object.assign({}, params, limit ? { limit } : {}, cursor ? { cursor } : {})));
      if (!res.items.length && res.nextCursor) empties++;
      found.push(...res.items.map((u) => u.uid));
      sizes.push(res.items.length);
      cursor = res.nextCursor || null;
      assert.ok(++n < 2000, "страницы кончаются");
    } while (cursor);
    return { found, empties, n, sizes };
  }

  test("Объекты: фильтр идёт ограниченным проходом — страница дописывается до limit, бюджета времени или конца разделов", async () => {
    const env = await makeEnv();
    const lim = (await env.ok("GET", "/reference")).limits.scanPartsMax;
    assert.ok(lim > 0, "scanPartsMax объявлен");
    const cam = FX.devices.find((d) => d.type === "camera");
    const rare = await walk(env, { q: cam.name, domainId: cam.domainId });
    assert.ok(rare.found.includes(cam.id), "нашлась");
    // Дописывание — рекомендация бэкенду (api/README.md, «Страницы ограниченного прохода»), а не норма: числа запросов — у
    // встроенного сервера. demo мал: весь домен — в бюджете одного запроса, хотя разделов больше scanPartsMax
    if (!ApiTest.external) assert.eq([rare.n, rare.empties], [1, 0], "встроенный сервер: редкое имя — одной страницей, без пустых");
    // Частый отбор с малым limit: страницы полные, короче — только последняя; ничего не теряется и не повторяется
    const all = await walk(env, { q: "1" }, 200);
    const small = await walk(env, { q: "1" }, 7);
    assert.eq(small.found, all.found, "limit 7: те же объекты в том же порядке");
    if (!ApiTest.external) assert.ok(small.sizes.slice(0, -1).every((x) => x === 7), `встроенный сервер: страницы полные, кроме последней: ${small.sizes.join(" ")}`);
  });

  test("Объекты: бэкенд вправе страницу не дописывать — пустая страница с nextCursor законна, обход находит всё", async () => {
    // Образец порядка — с дописыванием; makeEnv сбрасывает стенд, поэтому сначала он
    const all = await walk(await makeEnv(), { q: "1" }, 7);
    // stand.sparsePages — встроенный сервер как бэкенд, который не дописывает: ровно scanPartsMax разделов на запрос
    const env = await makeEnv({ fixturePatch: { stand: { sparsePages: true } } });
    const cam = FX.devices.find((d) => d.type === "camera");
    const rare = await walk(env, { q: cam.name, domainId: cam.domainId });
    assert.ok(rare.found.includes(cam.id), "нашлась");
    if (!ApiTest.external) {
      assert.ok(rare.n > 1, "за один запрос весь домен не просмотрен");
      assert.ok(rare.empties > 0, "пустая страница с nextCursor");
    }
    const sparse = await walk(env, { q: "1" }, 7);
    assert.eq(sparse.found, all.found, "те же объекты в том же порядке, что и с дописыванием");
  });

  test("Объекты: status и kind — ИЛИ внутри себя", async () => {
    const env = await makeEnv();
    const both = await env.pages(q("/units", { status: "off,license", kind: "camera,ipsrv" }));
    const off = (u) => u.properties.enabled === false || ((u.status || {}).observed || {}).licenseExceeded === true;
    assert.ok(both.length && both.every((u) => ["camera", "ipsrv"].includes(u.kind) && off(u)), "status и kind — это ИЛИ внутри себя");
  });

  test("Объекты: один член — порядок по имени; ids — до idsMax; папка — постоянная цена, скрытое не показывается", async () => {
    const hidden = FX.folders.find((f) => f.deviceIds.length > 2);
    const env = await makeEnv({ fixturePatch: { stand: { hiddenIds: hidden.deviceIds.slice(0, 2) } } });
    const s = FX.devices.find((d) => d.serverId && !d.parentId).serverId;
    const names = (await env.pages(q("/units", { serverId: s }))).map((u) => u.name);
    assert.eq(names, names.slice().sort(), "по имени внутри сервера");
    const ids = FX.devices.slice(0, 3).map((d) => d.id);
    assert.eq((await env.ok("GET", q("/units", { ids: ids.join(",") }))).items.map((u) => u.uid), ids, "ids");
    const many = Array.from({ length: 201 }, () => ids[0]).join(",");
    assert.status(await env.call("GET", q("/units", { ids: many })), 422, "VALIDATION_FAILED", "больше idsMax");
    const page = await env.ok("GET", q("/units", { folderId: hidden.id, limit: 1 }));
    assert.ok(page.items.length <= 1, "страница короче");
    const shown = await env.folderIds(hidden.id);
    assert.eq(shown.length, hidden.deviceIds.length - 2, "без права view не показаны");
    const arch = FX.archives[0].id;
    assert.ok((await env.pages(q("/units", { archiveId: arch }))).every((u) => u.properties.archiveId === arch || (u.properties.extraArchives || []).some((x) => x.archiveId === arch)), "хранилище");
  });

  test("Камера-кластер: без сервера и родителя, hasChildren — «может быть»; в дереве — под доменом", async () => {
    const env = await makeEnv({ fixturePatch: { devices: FX.devices.map((d) => (d.type === "camera" && !d.parentId && d.name === "Главный вход" ? noServer(d) : d)) } });
    const cam = FX.devices.find((d) => d.name === "Главный вход");
    const [u] = (await env.ok("GET", q("/units", { ids: cam.id }))).items;
    assert.eq([u.properties.serverId == null, u.parentId, u.hasChildren], [true, null, true], "поля");
    const tree = await env.pages(q("/tree/children", { layout: "servers", parentId: cam.domainId }));
    assert.ok(tree.some((n) => n.id === cam.id && n.kind === "camera"), "под доменом");
    assert.ok(!(await env.pages(q("/tree/children", { layout: "detectors", parentId: cam.domainId }))).some((n) => n.id === cam.id), "в detectors сводного списка нет");
  });

  test("/objects/delete: version — Unit.version, правка любого поля её двигает; предел selectMax", async () => {
    const pick = FX.devices.filter((d) => d.type === "camera" && !d.parentId && d.archiveId).slice(0, 2);
    const off = pick.map((d) => d.id);
    const env = await makeEnv({ fixturePatch: { devices: FX.devices.map((d) => (off.includes(d.id) ? noServer(d) : d)) } });
    const del = (id, version) => env.ok("POST", "/objects/delete", { idempotencyKey: ApiTest.key(), items: [{ id, version }] });
    assert.eq((await del(pick[0].id, (await env.ok("GET", `/units/${pick[0].id}`)).version)).done, [pick[0].id], "Unit.version");
    const was = await env.ok("GET", `/units/${pick[1].id}`);
    await env.ok("PATCH", `/units/${was.uid}`, { properties: { retentionDays: 3 } }, { "If-Match": `"${was.version}"` });
    assert.eq((await del(pick[1].id, was.version)).failed[0].code, "VERSION_MISMATCH", "правка свойства останавливает");
    const items = Array.from({ length: 501 }, (x, i) => ({ id: FX.devices[i % FX.devices.length].id, version: "1" }));
    assert.status(await env.call("POST", "/objects/delete", { idempotencyKey: ApiTest.key(), items }), 422, "VALIDATION_FAILED", "больше selectMax");
  }, { needs: ["deleteObjects", "patchUnit"] });

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
    assert.ok(devs.length && devs.every((n) => n.unit && n.kind === n.unit.kind && n.unit.uid === n.id), "узлы с кратким объектом, вид узла — вид объекта");
    const f = FX.folders.find((x) => x.deviceIds.length);
    const inside = await env.pages(q("/tree/children", { layout: "folders", parentId: f.id }));
    assert.ok(f.deviceIds.every((id) => inside.some((n) => n.id === id)), "состав папки");
    const parent = FX.devices.find((d) => d.parentId).parentId;
    assert.ok((await env.pages(q("/tree/children", { layout: "servers", parentId: parent }))).every((n) => n.unit.parentId === parent), "дети устройства — любых видов");
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

  test("Папка: состав — шаги folders (Unit.folders) одной операции, откат папок — fail NOT_SUPPORTED, предел selectMax", async () => {
    const env = await makeEnv();
    const f = FX.folders.find((x) => x.deviceIds.length > 1);
    const add = FX.devices.find((d) => d.domainId === f.domainId && d.type === "camera" && !d.parentId && !f.deviceIds.includes(d.id));
    const [a, r] = await Promise.all([add.id, f.deviceIds[0]].map((id) => env.ok("GET", `/units/${id}`)));
    const run = await env.runOperation({ idempotencyKey: ApiTest.key(), items: [
      { uid: a.uid, folders: (a.folders || []).concat(f.id) },
      { uid: r.uid, folders: (r.folders || []).filter((x) => x !== f.id) },
    ], expectedVersions: { [a.uid]: a.version, [r.uid]: r.version } });
    assert.eq(run.items.map((x) => x.state), ["ok", "ok"], "шаги выполнены");
    const folder = await env.ok("GET", `/units/${f.id}`);
    assert.ok(!("deviceIds" in folder.properties), "состава в папке нет");
    const ids = (await env.pages(`/units?folderId=${f.id}`)).map((u) => u.uid);
    assert.ok(ids.includes(add.id) && !ids.includes(f.deviceIds[0]), "добавлено и убрано");
    const [op] = await env.pages("/operations?limit=1");
    assert.eq(op.items.length, 2, "одна операция на два шага");
    const back = await env.finished((await env.ok("POST", `/operations/${op.id}/revert`)).id, 100);
    assert.eq(back.items.map((x) => [x.state, x.code, x.params && x.params.reason]), [["fail", "NOT_SUPPORTED", "folders"], ["fail", "NOT_SUPPORTED", "folders"]], "папки вне отката: шаг говорит словом");
    assert.ok((await env.pages(`/units?folderId=${f.id}`)).some((u) => u.uid === add.id), "состав не вернулся");
    // Предел выбора за раз: шагов по папкам (folders, patch только с folders) в одной операции — до selectMax, как у состава
    // папки в базе; прочим шагам предела нет
    const max = (await env.ok("GET", "/reference")).limits.selectMax;
    const ver = { [add.id]: (await env.ok("GET", `/units/${add.id}`)).version };
    const ops = (step) => env.call("POST", "/operations", { idempotencyKey: ApiTest.key(), items: Array.from({ length: max + 1 }, (x, i) => step(i)), expectedVersions: ver });
    const big = await ops(() => ({ uid: add.id, folders: [f.id] }));
    assert.status(big, 422, "VALIDATION_FAILED", "шагов folders больше selectMax");
    assert.eq(big.body.field, "items", "поле");
    assert.status(await ops(() => ({ uid: add.id, patch: { folders: [f.id] } })), 422, "VALIDATION_FAILED", "шагов patch {folders} больше selectMax");
    assert.status(await ops((i) => ({ uid: add.id, patch: { name: `Имя ${i}` } })), 202, null, "шагов patch не по папкам больше selectMax — проходит");
  });

  test("Домен: status.observed.stateSummary — числа не пересекаются, выключенные вне total, отставание на круг, unread, нет круга — нет поля", async () => {
    const env = await makeEnv();
    const cams = FX.devices.filter((d) => d.domainId === did && d.type === "camera");
    // Итог круга — вычисляемое хуком vms.domain/1: у объекта домена в status.observed
    const summary = async (e) => ((await e.ok("GET", `/units/${did}`)).status.observed || {}).stateSummary;
    const s = await summary(env);
    assert.eq(s.total, cams.filter((d) => d.enabled !== false).length, "выключенные вне total");
    assert.ok(s.offline + s.silent <= s.total, "не пересекаются");
    assert.ok(Date.parse(s.at) > 0 && !("unread" in s), "время есть, unread нет");
    const cam = cams.find((d) => d.enabled !== false && d.online !== false);
    await env.ok("POST", "/test/events", { type: "device.signal", deviceId: cam.id, online: false });
    assert.eq((await summary(env)).offline, s.offline, "отстаёт на круг");
    if (env.frozen) {
      await env.advance(21 * 60);
      assert.eq((await summary(env)).offline, s.offline + 1, "новый круг");
    }
    const part = await makeEnv({ fixturePatch: { stand: { unread: 3 } } });
    assert.eq((await summary(part)).unread, 3, "unread");
    const none = await makeEnv({ fixturePatch: { stand: { summaryOff: true } } });
    assert.eq(await summary(none), undefined, "круг не прошёл — поля нет");
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
    const rename = async (d, name) => env.ok("PATCH", `/units/${d.id}`, { name }, { "If-Match": await env.etag(`/units/${d.id}`) });
    await rename(cam, "А");
    await rename(other, "Б");
    await env.ok("GET", "/me");
    await ApiTest.settle();
    const dev = seen.filter((m) => m.type === "entity.changed").map((m) => m.entityId);
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
    assert.ok(seen.some((m) => m.type === "entity.changed" && m.entityId === cam.id), "дети наблюдаемого");
    stop();
  });

  test("Поток: PUT не тому экземпляру — 404, новый поток держит список из запроса открытия, предел watch", async () => {
    const env = await makeEnv();
    const cam = FX.devices.find((d) => d.type === "camera" && !d.parentId && d.serverId);
    const other = FX.devices.find((d) => d.type === "camera" && !d.parentId && d.serverId && d.serverId !== cam.serverId);
    const seen = [], hellos = [];
    const stop = ApiTest.subscribeForTest((m) => {
      if (m.type === "stream.hello") hellos.push(m.clientId);
      seen.push(m);
    });
    await ApiTest.settle();
    assert.status(await env.call("GET", `/stream?watch=${Array.from({ length: 201 }, (x, i) => i).join(",")}`), 422, "VALIDATION_FAILED", "больше watchMax");
    const big = await env.call("GET", `/stream?watch=${Array.from({ length: 201 }, (x, i) => i).join(",")}`);
    assert.eq(big.body.field, "watch", "поле");
    assert.status(await env.call("POST", "/test/stream-elsewhere"), 204);
    assert.status(await env.call("PUT", `/stream/${hellos[0]}/watch`, { ids: [cam.id] }), 404, "NOT_FOUND", "поток на другом экземпляре");
    stop.reopen([cam.id]);
    await ApiTest.settle();
    assert.eq(hellos.length, 2, "новый поток — новый hello");
    assert.ok(hellos[1] !== hellos[0], "новый clientId");
    seen.length = 0;
    const rename = async (d, name) => env.ok("PATCH", `/units/${d.id}`, { name }, { "If-Match": await env.etag(`/units/${d.id}`) });
    await rename(cam, "А");
    await rename(other, "Б");
    await ApiTest.settle();
    const dev = seen.filter((m) => m.type === "entity.changed").map((m) => m.entityId);
    assert.ok(dev.includes(cam.id) && !dev.includes(other.id), "список из запроса работает без PUT");
    assert.status(await env.call("PUT", `/stream/${hellos[1]}/watch`, { ids: [other.id] }), 204);
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
