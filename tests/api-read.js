/* Тесты API: чтение всех разделов, ошибки адресов, служебные операции стенда. */
(() => {
  ApiTest.fileLayer("mechanism");
  const { test, makeEnv, assert, FX, AREA, FOLDER } = ApiTest;
  const UNKNOWN = "30009999-0000-4000-8000-000000000000";
  const DAY = 86400000;
  // Разделы набора → где их читают: объекты — в /units (по профилю; устройства — по видам устройств), правила — своим путём
  const DEVICE_KINDS = [...new Set(FX.devices.map((d) => d.type))].sort();
  const TABLES = [["domains", `/units?implements=${AREA}`], ["servers", "/units?implements=vms.server/1"], ["devices", `/units?kind=${DEVICE_KINDS.join(",")}`],
    ["folders", `/units?implements=${FOLDER}`], ["archives", "/units?implements=vms.archive/1"], ["volumes", "/units?implements=vms.volume/1"], ["rules", "/rules"]];
  const idOf = (r) => r.uid || r.id;
  // Журнал стенда: встроенный сервер добавляет к записям набора stand.journal.count своих (0.8.0); бэкенд без них — только набор
  const JOURNAL_SIZES = [FX.journal.length, FX.journal.length + ((FX.stand && FX.stand.journal && FX.stand.journal.count) || 0)];
  const one = (path, id) => (path.startsWith("/units") ? `/units/${id}` : `${path}/${id}`);

  test("Чтение: каждая коллекция отдаёт столько записей, сколько в эталонном наборе", async () => {
    const env = await makeEnv();
    const sizes = [];
    for (const [table, path] of TABLES) {
      const list = await env.list(path);
      assert.eq(list.length, FX[table].length, table);
      // Порядок выбирает сервер у страниц: важно, что он один и тот же при повторе и все записи на месте
      assert.eq(list.map(idOf).sort(), FX[table].map((r) => r.id).sort(), `${table}: те же записи`);
      assert.eq((await env.list(path)).map(idOf), list.map(idOf), `${table}: порядок не меняется между чтениями`);
      sizes.push(`${table} ${list.length}`);
    }
    return sizes.join(", ");
  }, { needs: ["kind:camera"] });

  // Разделы приложения: код → операции, без которых раздел не показать (копия SECTION_OPS из tools/mechanism.py)
  const SECTION_OPS = { objects: ["listKinds", "listUnits", "getTreeChildren"], automation: ["listRules"], access: ["getAccess"],
    settings: ["getSettings"], "vms.export": ["listExports"], journal: ["listJournal"] };

  test("Разделы: capabilities.sections — коды уникальны, у раздела механизма объявлены его операции", async () => {
    const env = await makeEnv();
    const caps = (await env.ok("GET", "/reference")).capabilities;
    assert.ok(Array.isArray(caps.sections), "capabilities.sections — массив");
    const ids = caps.sections.map((s) => s.id);
    assert.eq(new Set(ids).size, ids.length, "коды разделов уникальны");
    ids.forEach((id) => assert.ok(/^[a-z][A-Za-z0-9_.-]*$/.test(id), `${id}: код по шаблону`));
    for (const id of ids) {
      for (const op of SECTION_OPS[id] || []) assert.ok(caps.operations.includes(op), `раздел ${id}: операция ${op} объявлена`);
    }
    return `разделов ${ids.length}: ${ids.join(", ")}`;
  }, { needs: ["getReference"], layer: "mechanism" });

  test("Чтение одной записи: тело как в списке, версия в ETag", async () => {
    const env = await makeEnv();
    for (const [table, path] of TABLES) {
      const first = (await env.list(path))[0];
      const res = await env.call("GET", one(path, idOf(first)));
      assert.status(res, 200, null, table);
      assert.eq(res.body, first, `${table}: запись`);
      assert.eq(res.headers.etag, `"${first.version}"`, `${table}: ETag`);
    }
  }, { needs: ["kind:camera"] });

  test("Нет записи — 404 NOT_FOUND; нет операции — 404 NO_ROUTE", async () => {
    const env = await makeEnv();
    for (const [table, path] of TABLES) {
      assert.status(await env.call("GET", one(path, UNKNOWN)), 404, "NOT_FOUND", table);
    }
    if (ApiTest.can("getDiscovery")) assert.status(await env.call("GET", `/units/${UNKNOWN}/discovery`), 404, "NOT_FOUND", "поиск у неизвестного объекта");
    assert.status(await env.call("GET", `/rules/${UNKNOWN}/fires`), 404, "NOT_FOUND", "срабатывания неизвестного правила");
    assert.status(await env.call("GET", "/no-such-thing"), 404, "NO_ROUTE");
  });

  test("Текущий администратор и часы сервера: me набора, время — сейчас по стенду", async () => {
    const env = await makeEnv();
    const me = await env.ok("GET", "/me");
    const u = FX.access.users.find((x) => x.id === FX.me.userId);
    assert.eq([me.userId, me.login], [u.id, u.login], "кто");
    assert.eq(me.timezone, FX.timezone, "часовой пояс системы");
    if (env.frozen) assert.eq(Date.parse(me.serverTime), env.now, "часы сервера — часы стенда");
    else assert.ok(Math.abs(Date.parse(me.serverTime) - Date.now()) < 120000, `часы сервера — сейчас: ${me.serverTime}`);
  });

  test("Времена набора сдвинуты на «сейчас − capturedAt»: моменты — точно, даты — на целые сутки", async () => {
    const env = await makeEnv();
    const shift = env.now - Date.parse(FX.capturedAt);
    const journal = await env.list("/journal");
    const moved = Date.parse(journal.find((e) => e.id === FX.journal[0].id).at) - Date.parse(FX.journal[0].at);
    // Часы идут — между сдвигом набора и ответом сброса проходит доля секунды
    if (env.frozen) assert.eq(moved, shift, "момент в журнале");
    else assert.ok(Math.abs(moved - shift) < 5000, `момент в журнале: сдвиг ${moved} вместо ${shift}`);
    const access = await env.access();
    const u = FX.access.users.find((x) => x.lastLoginDate);
    const got = access.users.find((x) => x.id === u.id).lastLoginDate;
    assert.eq((Date.parse(got) - Date.parse(u.lastLoginDate)) / DAY, Math.round(shift / DAY), "дата последнего входа");
  });

  test("Справочники: коды, без подписей", async () => {
    const env = await makeEnv();
    const ref = await env.ok("GET", "/reference");
    // Справочники видов — в описаниях видов: в reference их нет
    const moved = ["deviceKinds", "deviceParams", "ipServerSubtypes", "detectorKinds", "archiveKinds", "storageTypes", "volumeStates", "unitOptions"];
    assert.eq(moved.filter((k) => k in ref), [], "справочники видов — в /kinds");
    assert.eq(["deviceTypes", "foundDeviceTypes", "unitTypes", "writableFields"].filter((k) => k in ref.capabilities), [], "виды и правимое — не в capabilities");
    if (ApiTest.can("kind:det")) {
      const det = await env.ok("GET", "/kinds/det");
      assert.ok(!JSON.stringify(det.schema.properties.detectorKind.enum).match(/[а-яё]/i), "виды детекторов — кодами");
    }
  }, { needs: ["kind:camera"] });

  // Справочник механизма (с 0.32.0): ключи reference и reference.limits — только механизма (tools/mechanism.py, B3 и B4).
  // Справочники VMS — в описаниях видов и в ответах путей профилей; ruleChecks обязательно. Те же списки — REFERENCE_KEYS и
  // LIMIT_KEYS в tools/mechanism.py: меняя один, поменять и другой
  const REFERENCE_KEYS = ["ruleActions", "ruleConditions", "ruleChecks", "ruleControls", "ruleFeatures", "ruleStarts", "ruleTargets",
    "ruleCrossDomainActions", "access", "limits", "capabilities"];
  const LIMIT_KEYS = ["pageMax", "idsMax", "selectMax", "watchMax", "scanPartsMax", "fileMaxBytes", "filesPerTurnMax", "fileTypes"];
  test("Справочник механизма: ключи reference и reference.limits — только механизма, ruleChecks есть", async () => {
    const env = await makeEnv();
    const ref = await env.ok("GET", "/reference");
    assert.eq(Object.keys(ref).filter((k) => !REFERENCE_KEYS.includes(k)), [], "ключи reference вне механизма");
    assert.eq(Object.keys(ref.limits || {}).filter((k) => !LIMIT_KEYS.includes(k)), [], "ключи reference.limits вне механизма");
    assert.ok(Array.isArray(ref.ruleChecks), "reference.ruleChecks — массив");
    return `ключей ${Object.keys(ref).length}, пределов ${Object.keys(ref.limits || {}).length}`;
  }, { needs: ["getReference"] });

  // Справочники VMS — в описаниях видов (с 0.30.0): производители и модели, метки серверов, порт сервера
  test("Справочники в видах: модели — examples у vendor и allOf по vendor, метки сервера — examples, порт сервера — default", async () => {
    const env = await makeEnv();
    const all = (await env.ok("GET", "/kinds")).items;
    const of = (p) => all.filter((k) => (k.implements || []).includes(p));
    let models = 0;
    for (const k of of("vms.camera/1")) {
      const pr = k.schema.properties;
      const vendors = (pr.vendor && pr.vendor.examples) || [];
      assert.ok(vendors.length > 0, `${k.kind}: vendor.examples — производители`);
      for (const part of (k.schema.allOf || []).filter((x) => x.if && x.if.properties && x.if.properties.vendor)) {
        const v = part.if.properties.vendor.const, m = part.then && part.then.properties && part.then.properties.model;
        assert.ok(vendors.includes(v), `${k.kind}: модели ${v} — производитель из examples`);
        assert.ok(m && Array.isArray(m.examples) && m.examples.length > 0, `${k.kind}: модели ${v} — then.model.examples`);
        models++;
      }
    }
    for (const k of of("vms.server/1")) {
      const pr = k.schema.properties;
      assert.ok(Array.isArray(pr.labels.items.examples), `${k.kind}: labels.items.examples — метки серверов`);
      assert.ok(Number.isInteger(pr.port.default), `${k.kind}: port.default — порт сервера`);
    }
    return `видов камеры ${of("vms.camera/1").length}, производителей с моделями ${models}`;
  }, { needs: ["listKinds", "implements:vms.camera/1", "implements:vms.server/1"] });

  test("Сценарии: kinds и maxItems у документа сценариев — виды событий и предел, в ответе PUT те же", async () => {
    const env = await makeEnv();
    const did = FX.domains[0].id;
    const doc = await env.ok("GET", `/units/${did}/scenarios`);
    assert.ok(Array.isArray(doc.kinds) && doc.kinds.length > 0 && doc.kinds.every((k) => typeof k === "string"), "GET: виды событий — коды");
    assert.ok(Number.isInteger(doc.maxItems) && doc.maxItems >= doc.items.length, "GET: предел не меньше числа сценариев");
    const put = await env.ok("PUT", `/units/${did}/scenarios`, { items: doc.items }, { "If-Match": `"${doc.version}"` });
    assert.eq([put.kinds, put.maxItems], [doc.kinds, doc.maxItems], "PUT: то же в ответе");
  }, { needs: ["getScenarios", "putScenarios", "implements:vms.scenarios/1"], layer: "profile:vms.scenarios/1" });

  test("Поиск в сети: ipScanMax у документа поиска — предел адресов одного поиска", async () => {
    const env = await makeEnv();
    const d = await env.ok("GET", `/units/${FX.domains[0].id}/discovery`);
    assert.ok(Number.isInteger(d.ipScanMax) && d.ipScanMax > 0, "предел адресов одного поиска");
  }, { needs: ["getDiscovery", "implements:vms.discovery/1"], layer: "profile:vms.discovery/1" });

  test("Возможности системы: объявлены в справочниках, как в наборе; обязательный минимум есть", async () => {
    const env = await makeEnv();
    const caps = (await env.ok("GET", "/reference")).capabilities;
    assert.eq(caps, FX.reference.capabilities, "как в наборе");
    const known = new Set(Object.values(ApiTest.spec.paths).flatMap((item) => Object.values(item).map((o) => o && o.operationId)));
    assert.eq(caps.operations.filter((id) => !known.has(id)), [], "операции — из контракта");
    assert.eq(["getMe", "getReference", "stream"].filter((id) => !caps.operations.includes(id)), [], "минимум");
    assert.eq(caps.operations.filter((id) => ["testReset", "testClock", "testEvent"].includes(id)), [], "служебных стенда — нет");
    const kinds = ApiTest.can("listKinds") ? (await env.ok("GET", "/kinds")).items.map((k) => k.kind) : [];
    return `операций ${caps.operations.length}, видов: ${kinds.length}; необязательные: ${caps.features.join(", ") || "нет"}`;
  });

  test("Неподдержанные вид устройства и настройки — 422 NOT_SUPPORTED, ничего не меняется", async () => {
    const env = await makeEnv();
    const caps = ApiTest.caps();
    const notes = [];
    // Вид, которого система не объявила (нет в /kinds), — NOT_SUPPORTED с указателем /kind
    const kinds = ApiTest.can("listKinds") ? (await env.ok("GET", "/kinds")).items.map((k) => k.kind) : [];
    const type = ["mic", "sensor", "relay", "eventsrc", "acfa", "email"].find((t) => !kinds.includes(t));
    const dom = FX.domains[0];
    if (type && caps.operations.includes("createUnits")) {
      const res = await env.ok("POST", "/units", { idempotencyKey: ApiTest.key(), items: [{ kind: type, parentId: null, domainId: dom.id, name: "Не тот вид", properties: {} }] });
      assert.eq([res.done.length, res.failed.map((x) => [x.code, x.field])], [0, [["NOT_SUPPORTED", "/kind"]]], `вид ${type}`);
      assert.ok(!(await env.list(`/units?q=${encodeURIComponent("Не тот вид")}`)).some((u) => u.name === "Не тот вид"), "не создано");
      notes.push(`вид ${type}`);
    }
    const srv = FX.servers.find((s) => s.allocated && s.online);
    for (const [feature, patch] of [["serverRoles", { role: "standby" }], ["serverNetwork", { dns: "10.0.0.53" }]]) {
      if (caps.features.includes(feature)) continue;
      const res = await env.call("PATCH", `/units/${srv.id}`, { properties: patch }, { "If-Match": `"${srv.version}"` });
      assert.status(res, 422, "NOT_SUPPORTED", feature);
      assert.eq(res.body.field, `/properties/${Object.keys(patch)[0]}`, `${feature}: поле`);
      notes.push(feature);
    }
    if (!caps.features.includes("archiveEncryption")) {
      const a = FX.archives[0];
      assert.status(await env.call("PATCH", `/units/${a.id}`, { properties: { encrypted: true } }, { "If-Match": `"${a.version}"` }), 422, "NOT_SUPPORTED", "шифрование");
      assert.eq((await env.ok("GET", `/units/${a.id}`)).version, a.version, "хранилище не изменилось");
      notes.push("archiveEncryption");
    }
    return notes.length ? `проверено: ${notes.join(", ")}` : "система поддерживает всё — проверять нечего";
  }, { needs: ["kind:camera"] });

  test("Права, опции, лицензии: снимок с версией в ETag", async () => {
    const env = await makeEnv();
    const acc = await env.call("GET", "/access");
    assert.status(acc, 200);
    assert.eq(acc.headers.etag, `"${acc.body.version}"`, "ETag прав");
    assert.eq((await env.pages("/access/users")).length, FX.access.users.length, "пользователи");
    assert.ok(!("users" in acc.body) && !("history" in acc.body), "снимок без людей и истории");
    const st = await env.call("GET", "/settings");
    assert.eq(st.headers.etag, `"${st.body.version}"`, "ETag опций");
    assert.eq(st.body.values["sec.2fa"], "off", "значения опций — кодами");
    if (ApiTest.can("listLicenses")) assert.eq((await env.list("/licenses")).map((l) => l.kind), FX.licenses.map((l) => l.kind), "лицензии");
  }, { needs: ["getSettings"] });

  test("Журнал: новые первыми, фильтр по категории", async () => {
    const env = await makeEnv();
    const all = await env.list("/journal");
    assert.ok(JOURNAL_SIZES.includes(all.length), `все записи: ${all.length}, ждём ${JOURNAL_SIZES.join(" или ")}`);
    const ids = new Set(all.map((e) => e.id));
    assert.ok(FX.journal.every((e) => ids.has(e.id)), "записи набора на месте");
    assert.ok(all.every((e, i) => !i || all[i - 1].at >= e.at), "по убыванию времени");
    const alarms = await env.list("/journal?category=alarm");
    assert.ok(alarms.length && alarms.every((e) => e.category === "alarm"), "только тревоги");
    assert.eq(alarms.length, all.filter((e) => e.category === "alarm").length, "все тревоги");
  });

  test("Срабатывания правила: только этого правила, новые первыми", async () => {
    const env = await makeEnv();
    const rule = (await env.list("/rules"))[0];
    const fires = await env.list(`/rules/${rule.id}/fires`);
    assert.eq(fires.length, FX.ruleFires.filter((f) => f.ruleId === rule.id).length, "число");
    assert.ok(fires.every((f, i) => f.ruleId === rule.id && (!i || fires[i - 1].at >= f.at)), "своё и по убыванию");
  });

  test("Поиск в сети: последний итог домена — найденные устройства; домен без поиска — idle", async () => {
    const env = await makeEnv();
    const known = FX.discovery[0];
    const d = await env.ok("GET", `/units/${known.domainId}/discovery`);
    assert.eq(d.state, "done", "состояние");
    assert.eq(d.candidates.map((c) => c.id), known.candidateIds, "найденные");
    const silent = FX.domains.find((x) => !FX.discovery.some((y) => y.domainId === x.id));
    const idle = await env.ok("GET", `/units/${silent.id}/discovery`);
    assert.eq([idle.state, idle.candidates.length], ["idle", 0], "без поиска");
  }, { needs: ["getDiscovery"], layer: "profile:vms.discovery/1" });

  test("Стенд: fixturePatch меняет набор только на этот прогон", async () => {
    const env = await makeEnv({ fixturePatch: { timezone: "UTC" } });
    assert.eq((await env.ok("GET", "/me")).timezone, "UTC", "с изменением");
    const again = await makeEnv();
    assert.eq((await again.ok("GET", "/me")).timezone, FX.timezone, "следующий сброс — исходный набор");
  });

  test("Стенд: actAs — прогон от имени другого администратора", async () => {
    const other = FX.access.users.find((u) => u.id !== FX.me.userId && u.enabled);
    const env = await makeEnv({ actAs: other.login });
    assert.eq((await env.ok("GET", "/me")).login, other.login, "кто");
    assert.status(await env.call("POST", "/test/reset", { fixture: "demo", actAs: "no-such-login" }), 404, "NOT_FOUND", "нет такого логина");
    assert.status(await env.call("POST", "/test/reset", { fixture: "other" }), 422, "VALIDATION_FAILED", "нет такого набора — не по контракту");
  });

  test("Стенд: часы стоят и идут только по /test/clock; назад — нельзя", async () => {
    const env = await makeEnv();
    const t0 = Date.parse((await env.ok("GET", "/me")).serverTime);
    await new Promise((r) => setTimeout(r, 20));
    assert.eq(Date.parse((await env.ok("GET", "/me")).serverTime), t0, "стоят");
    await env.advance(90);
    assert.eq(Date.parse((await env.ok("GET", "/me")).serverTime), t0 + 90000, "сдвинулись на 90 с");
    assert.status(await env.call("POST", "/test/clock", { advanceSec: -5 }), 422, "VALIDATION_FAILED", "назад");
    assert.status(await env.call("POST", "/test/clock", {}), 422, "VALIDATION_FAILED", "без advanceSec");
  }, { needs: ["clock"] });

  test("Стенд: устройство потеряло и вернуло связь — запись и поток, версия не растёт", async () => {
    const env = await makeEnv();
    const cam = (await env.list("/units?kind=camera")).find((u) => (u.status || {}).link !== "offline");
    const seen = [];
    const stop = ApiTest.subscribeForTest((m) => m.entityId === cam.uid && seen.push(m), [cam.uid]);
    await ApiTest.settle();
    const obs = (u) => (u.status || {}).observed || {};
    assert.status(await env.call("POST", "/test/events", { type: "device.signal", deviceId: cam.uid, online: false, fault: "auth" }), 200);
    let now = await env.ok("GET", `/units/${cam.uid}`);
    assert.eq([now.status.link, obs(now).fault, now.version], ["offline", "auth", cam.version], "без связи");
    assert.status(await env.call("POST", "/test/events", { type: "device.signal", deviceId: cam.uid, online: true }), 200);
    now = await env.ok("GET", `/units/${cam.uid}`);
    assert.eq([now.status.link, "fault" in obs(now)], ["online", false], "связь вернулась");
    assert.status(await env.call("POST", "/test/events", { type: "device.fault", deviceId: cam.uid, fault: "drv" }), 200, null, "причина");
    assert.eq(obs(await env.ok("GET", `/units/${cam.uid}`)).fault, "drv", "причина записана");
    assert.status(await env.call("POST", "/test/events", { type: "device.signal", deviceId: "30009999-0000-4000-8000-000000000000", online: true }), 404, "NOT_FOUND");
    await ApiTest.settle();
    stop();
    assert.ok(seen.filter((m) => m.type === "entity.changed").length >= 2, `в потоке — изменения записи: ${seen.length}`);
  }, { needs: ["kind:camera", "testEvent"] });

  test("Журнал: отбор по устройству, подсистеме, времени, limit; truncated и withheldCount", async () => {
    const env = await makeEnv();
    const all = await env.ok("GET", "/journal");
    const size = (await env.list("/journal")).length;
    assert.ok(JOURNAL_SIZES.includes(size), `записей: ${size}`);
    assert.eq([all.items.length, all.truncated, all.withheldCount], [Math.min(200, size), size > 200, 0], "без отбора — первая страница");
    const some = FX.journal.find((e) => e.deviceId);
    if (some) {
      const by = await env.ok("GET", `/journal?deviceId=${some.deviceId}`);
      assert.ok(by.items.length > 0 && by.items.every((e) => e.deviceId === some.deviceId), "по устройству");
    }
    const src = await env.ok("GET", "/journal?source=backend");
    assert.ok(src.items.every((e) => e.source === "backend"), "по подсистеме");
    const one = await env.ok("GET", "/journal?limit=1");
    assert.eq([one.items.length, one.truncated], [1, size > 1], "limit");
    const at = all.items[0].occurredAt || all.items[0].at;
    const late = await env.ok("GET", `/journal?from=${at}`);
    assert.ok(late.items.length >= 1, "со времени");
    const none = await env.ok("GET", "/journal?to=2000-01-01T00:00:00Z");
    assert.eq(none.items.length, 0, "по время");
  }, { needs: ["listJournal"] });

  ApiTest.loaded("api-read.js");
})();
