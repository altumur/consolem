/* Тесты API: добавление устройств, групповое изменение, удаление, детекторы, поиск в сети. */
(() => {
  const { test, makeEnv, assert, key, FX } = ApiTest;
  const d1 = FX.domains[0];
  const folder = FX.folders.find((f) => f.domainId === d1.id && !f.parentId);
  const cam = FX.devices.find((d) => d.type === "camera" && d.name === "Главный вход");
  const v = (rec) => ({ "If-Match": `"${rec.version}"` });
  const create = (items) => ({ idempotencyKey: key(), items });
  const newCam = (over) => ({ type: "camera", name: "Камера — тест", ip: "10.9.9.9", port: 80, vendor: "Hikvision", model: "DS-2CD2143G2", login: "admin", password: "x", ...over });

  test("Добавить: камера с папкой — номер выдал сервер, пароль скрыт, в папке, дочерний детектор создан", async () => {
    const env = await makeEnv();
    const res = await env.ok("POST", "/devices", create([{ device: newCam({ recordMode: "motion", children: [{ type: "det", name: "Детектор движения", builtin: true }] }), domainId: d1.id, parentId: null, folderId: folder.id }]));
    assert.eq([res.done.length, res.failed.length], [1, 0], "создано");
    const [c, det] = res.done[0].devices;
    const max = Math.max(...FX.devices.filter((d) => ["camera", "ipsrv", "eventsrc", "acfa"].includes(d.type)).map((d) => Number(d.identifier || (/^\d+$/.test(d.short || "") ? d.short : 0)) || 0));
    assert.eq([c.identifier, c.hasPassword, "password" in c, c.enabled, c.online], [String(max + 1), true, false, true, true], "камера");
    assert.eq([det.type, det.parentId, det.domainId], ["det", c.id, d1.id], "детектор под камерой");
    assert.eq(res.done[0].folders[0].deviceIds.slice(-1), [c.id], "в папке");
    assert.eq((await env.list("/devices")).length, FX.devices.length + 2, "в списке");
  });

  test("Добавить: частичный успех — занятый номер, чужой родитель, папка другого домена", async () => {
    const env = await makeEnv();
    // Чужой родитель и папка другого домена — только если в наборе есть второй домен
    const d2 = FX.domains[1];
    const alien = FX.folders.find((f) => f.domainId !== d1.id);
    const rows = [
      [{ device: newCam({ name: "ок" }), domainId: d1.id, parentId: null, folderId: null }, null],
      [{ device: newCam({ identifier: cam.identifier }), domainId: d1.id, parentId: null, folderId: null }, "IDENTIFIER_TAKEN"],
    ];
    if (d2) rows.push([{ device: { type: "det", name: "Детектор" }, domainId: d2.id, parentId: cam.id, folderId: null }, "PARENT_MISMATCH"]);
    if (alien) rows.push([{ device: newCam(), domainId: d1.id, parentId: null, folderId: alien.id }, "VALIDATION_FAILED"]);
    const res = await env.ok("POST", "/devices", create(rows.map((r) => r[0])));
    assert.eq(res.done.map((x) => x.index), [0], "выполнено");
    assert.eq(res.failed.map((x) => [x.index, x.code]), rows.map((r, i) => [i, r[1]]).slice(1), "отказы");
  });

  test("Добавить: дочерний объект под камерой и служба сервера; повтор с тем же ключом — второй раз не создаёт", async () => {
    const env = await makeEnv();
    const s = FX.servers.find((x) => x.allocated && x.online);
    // Дочерний — детектор: датчики находит сервер; служба — если есть email-оповещатели
    const child = { type: "det", name: "Детектор — тест", detectorKind: "motion" };
    const rows = [{ device: child, domainId: cam.domainId, parentId: cam.id, folderId: null }];
    if (ApiTest.can("type:email")) rows.push({ device: { type: "email", name: "Email — тест", serverId: s.id, smtp: "smtp.local" }, domainId: s.domainId, parentId: null, folderId: null });
    const body = create(rows);
    const a = await env.ok("POST", "/devices", body);
    const b = await env.ok("POST", "/devices", body);
    assert.eq(b, a, "тот же ответ");
    assert.eq(a.done[0].devices[0].parentId, cam.id, "дочерний — под камерой");
    if (rows[1]) assert.eq(a.done[1].devices[0].serverId, s.id, "служба — на сервере");
    assert.eq((await env.list("/devices")).length, FX.devices.length + rows.length, "создано один раз");
  });

  test("Добавить из найденного: строка уходит из итога поиска", async () => {
    const env = await makeEnv();
    const disc = FX.discovery[0];
    const c = FX.network.find((x) => x.id === disc.candidateIds[0]);
    await env.ok("POST", "/devices", create([{ device: newCam({ ip: c.ip, mac: c.mac }), domainId: disc.domainId, parentId: null, folderId: null, candidateId: c.id }]));
    const now = await env.ok("GET", `/domains/${disc.domainId}/discovery`);
    assert.ok(!now.candidates.some((x) => x.id === c.id), "добавленное — не в найденных");
  }, { needs: ["getDiscovery"] });

  test("Изменить сразу: несколько устройств одним запросом, устаревшая версия — в failed", async () => {
    const env = await makeEnv();
    const cams = FX.devices.filter((d) => d.type === "camera" && d.archiveId).slice(0, 3);
    const a = FX.archives.find((x) => x.id !== cams[0].archiveId);
    const res = await env.ok("POST", "/devices/update", { idempotencyKey: key(), items: [
      { deviceId: cams[0].id, version: cams[0].version, set: { extraArchives: [{ archiveId: a.id, recordMode: "always", stream: "main" }] } },
      { deviceId: cams[1].id, version: cams[1].version, set: { recordMode: "motion" } },
      { deviceId: cams[2].id, version: "stale", set: { recordMode: "none" } },
    ] });
    assert.eq([res.done.length, res.failed.map((f) => f.code)], [2, ["VERSION_MISMATCH"]], "частичный успех");
    assert.eq((await env.ok("GET", `/devices/${cams[1].id}`)).recordMode, "motion", "изменено");
    assert.eq((await env.ok("GET", `/devices/${cams[2].id}`)).recordMode, cams[2].recordMode, "не тронуто");
  });

  test("Определить модель: по адресу; неизвестный производитель — null", async () => {
    const env = await makeEnv();
    const m = await env.ok("POST", "/devices/probe", { ip: "10.1.2.3", port: 80, vendor: "Axis" });
    assert.ok(FX.reference.deviceModels.find((x) => x.vendor === "Axis").models.includes(m.model), `модель Axis: ${m.model}`);
    assert.eq(await env.ok("POST", "/devices/probe", { ip: "10.1.2.3", port: 80, vendor: "Axis" }), m, "повторяется");
    assert.eq((await env.ok("POST", "/devices/probe", { ip: "10.1.2.3", port: 80, vendor: "Noname" })).model, null, "неизвестный");
  });

  test("Удалить устройство: вместе с дочерними, из папок и из записи по детекторам", async () => {
    const env = await makeEnv();
    const kids = FX.devices.filter((d) => d.parentId === cam.id);
    const det = kids.find((d) => d.type === "det");
    const other = FX.devices.find((d) => d.type === "camera" && d.id !== cam.id);
    await env.ok("PATCH", `/devices/${other.id}`, { recordDetectorIds: [det.id] }, v(other));
    assert.status(await env.call("DELETE", `/devices/${det.id}`), 428, "PRECONDITION_REQUIRED");
    assert.status(await env.call("DELETE", `/devices/${cam.id}`, undefined, v(cam)), 204);
    const ids = new Set((await env.list("/devices")).map((d) => d.id));
    assert.ok(!ids.has(cam.id) && kids.every((k) => !ids.has(k.id)), `удалено с дочерними: ${kids.length}`);
    assert.ok((await env.list("/folders")).every((f) => !f.deviceIds.includes(cam.id)), "в папках нет");
    assert.eq((await env.ok("GET", `/devices/${other.id}`)).recordDetectorIds, [], "запись по детектору — без него");
    assert.status(await env.call("DELETE", `/devices/${cam.id}`, undefined, v(cam)), 404, "NOT_FOUND");
  });

  test("Детектор из карточки камеры: шаг create, «Отменить» удаляет созданное", async () => {
    const env = await makeEnv();
    const op = await env.runOperation({ idempotencyKey: key(), items: [{ targetId: cam.id, create: { type: "det", name: "Новый детектор", detectorKind: "motion", sensitivity: 12 } }], expectedVersions: { [cam.id]: cam.version } });
    const id = op.items[0].createdId;
    assert.eq([op.ok, (await env.ok("GET", `/devices/${id}`)).parentId], [1, cam.id], "создан под камерой");
    const back = await env.ok("POST", `/operations/${op.id}/revert`);
    assert.eq((await env.finished(back.id)).ok, 1, "откат выполнен");
    assert.status(await env.call("GET", `/devices/${id}`), 404, "NOT_FOUND", "созданного нет");
    assert.status(await env.call("POST", "/operations", { idempotencyKey: key(), items: [{ targetId: cam.id, create: { type: "det", name: "x" }, set: { name: "y" } }], expectedVersions: { [cam.id]: cam.version } }), 422, "VALIDATION_FAILED", "create вместе с set");
  });

  test("Поиск в сети: найденное по одному в своём порядке, итог заменяет прежний; во время — 409; остановка", async () => {
    const env = await makeEnv();
    const did = d1.id;
    const expect = FX.network.filter((c) => c.domainIds.includes(did)).map((c) => c.id);
    const seen = [];
    const stop = ApiTest.subscribeForTest((m) => m.kind === "discovery" && m.entityId === did && seen.push(m.type));
    await ApiTest.settle();
    const res = await env.call("POST", `/domains/${did}/discovery`);
    assert.status(res, 202);
    assert.eq([res.body.state, res.body.candidates.map((c) => c.id)], ["searching", expect.slice(0, 1)], "начат, прежний итог сброшен, первая находка — сразу");
    assert.status(await env.call("POST", `/domains/${did}/discovery`), 409, "BUSY");
    const done = await env.until(async () => {
      const x = await env.ok("GET", `/domains/${did}/discovery`);
      return x.state === "done" && x;
    }, "поиск закончился");
    assert.eq([done.state, done.progress, done.candidates.map((c) => c.id)], ["done", 100, expect], "найдено всё, по порядку");
    await ApiTest.settle();
    stop();
    assert.eq([seen.filter((t) => t === "discovery.progress").length, seen.filter((t) => t === "discovery.finished").length], [expect.length, 1], "в потоке");
    await env.ok("POST", `/domains/${did}/discovery`);
    const stopped = await env.ok("DELETE", `/domains/${did}/discovery`);
    assert.eq(stopped.state, "stopped", "остановлен");
    assert.status(await env.call("DELETE", "/domains/10009999-0000-4000-8000-000000000000/discovery"), 404, "NOT_FOUND");
  }, { needs: ["startDiscovery", "getDiscovery", "stopDiscovery"] });

  /* ===== Виды, которые находит сервер ===== */

  const typed = (type, name, fn) => test(name, fn, { needs: [`type:${type}`] });
  const anyOf = async (env, type, more) => (await env.list("/devices")).find((d) => d.type === type && (!more || more(d)));

  typed("sensor", "Находки сервера: не создаются и не удаляются, 422 NOT_SUPPORTED, field: type", async () => {
    const env = await makeEnv();
    const parent = await anyOf(env, "camera");
    const res = await env.ok("POST", "/devices", create([{ device: { type: "sensor", name: "Датчик", channel: 3 }, domainId: parent.domainId, parentId: parent.id, folderId: null }]));
    assert.eq([res.done.length, res.failed[0].code, res.failed[0].field], [0, "NOT_SUPPORTED", "type"], "строкой в failed");
    const nested = await env.ok("POST", "/devices", create([{ device: newCam({ children: [{ type: "mic", name: "Микрофон" }] }), domainId: cam.domainId, parentId: null, folderId: null }]));
    assert.eq(nested.failed[0].code, "NOT_SUPPORTED", "и в children");
    const step = await env.call("POST", "/operations", { idempotencyKey: key(), items: [{ targetId: parent.id, create: { type: "relay", name: "Реле" } }], expectedVersions: { [parent.id]: parent.version } });
    assert.status(step, 422, "NOT_SUPPORTED", "шаг create — до выполнения");
    const s = await anyOf(env, "sensor");
    const del = await env.call("DELETE", `/devices/${s.id}`, undefined, { "If-Match": `"${s.version}"` });
    assert.status(del, 422, "NOT_SUPPORTED", "DELETE");
    assert.eq(del.body.field, "type", "field");
    const bulk = await env.ok("POST", "/objects/delete", { idempotencyKey: key(), items: [{ id: s.id, version: s.version }] });
    assert.eq(bulk.failed[0].code, "NOT_SUPPORTED", "пакетом");
  });

  typed("sensor", "Находки сервера: правятся только поля из writableFields, у вида без полей — field: type", async () => {
    const env = await makeEnv();
    const s = await anyOf(env, "sensor");
    const h = { "If-Match": `"${s.version}"` };
    const bad = await env.call("PATCH", `/devices/${s.id}`, { channel: 9 }, h);
    assert.status(bad, 422, "NOT_SUPPORTED", "номер не правится");
    assert.eq(bad.body.field, "channel", "поле названо");
    const ok = await env.ok("PATCH", `/devices/${s.id}`, { name: "Ворота", enabled: false, norm: "closed" }, h);
    assert.eq([ok.name, ok.enabled, ok.norm], ["Ворота", false, "closed"], "имя, включение, norm");
    const ch = await anyOf(env, "channel");
    const none = await env.call("PATCH", `/devices/${ch.id}`, { name: "x" }, { "If-Match": `"${ch.version}"` });
    assert.status(none, 422, "NOT_SUPPORTED", "у канала ничего");
    assert.eq(none.body.field, "type", "field: type");
    const st = await anyOf(env, "storage");
    assert.status(await env.call("PATCH", `/devices/${st.id}`, { enabled: false }, { "If-Match": `"${st.version}"` }), 422, "NOT_SUPPORTED", "у хранилища ничего");
  });

  typed("sensor", "Справочник: deviceParams не предлагает pulse, debounce, gain, vol, acodec", async () => {
    const env = await makeEnv();
    const p = (await env.ok("GET", "/reference")).deviceParams;
    assert.eq([p.sensor.map((x) => x.key), p.relay.map((x) => x.key), p.mic, p.spk], [["norm"], ["norm"], undefined, undefined], "только norm");
  });

  typed("ipsrv", "ipsrv: с записью устройства создаётся, правится своими полями, DELETE оставляет камеры без родителя", async () => {
    const env = await makeEnv();
    const nvr = await anyOf(env, "ipsrv", (d) => !d.derived && d.subtype === "nvr");
    const cams = (await env.list("/devices")).filter((d) => d.parentId === nvr.id && d.type === "camera");
    assert.ok(cams.length > 0, "у регистратора есть камеры");
    const bad = await env.call("PATCH", `/devices/${nvr.id}`, { ip: "10.0.0.1" }, { "If-Match": `"${nvr.version}"` });
    assert.status(bad, 422, "NOT_SUPPORTED", "адрес не правится");
    const same = await env.ok("PATCH", `/devices/${nvr.id}`, { lat: 55.1, mac: "00:11:22:33:44:66" }, { "If-Match": `"${nvr.version}"` });
    assert.eq([same.lat, same.mac], [55.1, "00:11:22:33:44:66"], "координаты и mac");
    assert.status(await env.call("DELETE", `/devices/${nvr.id}`, undefined, { "If-Match": `"${same.version}"` }), 204);
    const after = await env.ok("GET", `/devices/${cams[0].id}`);
    assert.eq(after.parentId, null, "камера осталась без родителя");
    assert.status(await env.call("GET", `/devices/${nvr.id}`), 404, "NOT_FOUND", "записи нет");
    const made = await env.ok("POST", "/devices", create([{ device: { type: "ipsrv", subtype: "io", name: "Блок входов", ip: "10.0.0.2", port: 80 }, domainId: nvr.domainId, parentId: null, folderId: null }]));
    assert.eq(made.done[0].devices[0].type, "ipsrv", "создаётся");
  });

  typed("ipsrv", "ipsrv без записи: PATCH, DELETE, folderIds — 422 NOT_SUPPORTED", async () => {
    const env = await makeEnv();
    const nvr = await anyOf(env, "ipsrv", (d) => d.derived);
    const h = { "If-Match": `"${nvr.version}"` };
    assert.status(await env.call("PATCH", `/devices/${nvr.id}`, { name: "x" }, h), 422, "NOT_SUPPORTED", "PATCH");
    assert.status(await env.call("DELETE", `/devices/${nvr.id}`, undefined, h), 422, "NOT_SUPPORTED", "DELETE");
    const step = await env.call("POST", "/operations", { idempotencyKey: key(), items: [{ targetId: nvr.id, folderIds: [] }], expectedVersions: { [nvr.id]: nvr.version } });
    assert.status(step, 422, "NOT_SUPPORTED", "folderIds");
  });

  typed("ipsrv", "Записи появляются и пропадают сами, у камеры меняется родитель", async () => {
    const env = await makeEnv();
    const c = await anyOf(env, "camera", (d) => !d.parentId);
    const res = await env.ok("POST", "/test/events", { type: "device.found", deviceId: c.id, found: { type: "sensor", name: "Вход 7", channel: 7 } });
    assert.eq((await env.ok("GET", `/devices/${res.deviceId}`)).channel, 7, "запись появилась, номер с пропуском");
    await env.ok("POST", "/test/events", { type: "device.lost", deviceId: res.deviceId });
    assert.status(await env.call("GET", `/devices/${res.deviceId}`), 404, "NOT_FOUND", "пропала");
    const nvr = await anyOf(env, "ipsrv");
    await env.ok("POST", "/test/events", { type: "device.parent", deviceId: c.id, parentId: nvr.id });
    assert.eq((await env.ok("GET", `/devices/${c.id}`)).parentId, nvr.id, "родитель сменился");
  });

  test("Адрес камеры: без rtspUrl и без vendor, model — 422, rtspUrl читается и пишется, снять последний адрес нельзя", async () => {
    const env = await makeEnv();
    const row = (device) => create([{ device, domainId: d1.id, parentId: null, folderId: null }]);
    const none = await env.ok("POST", "/devices", row({ type: "camera", name: "Без адреса", ip: "10.1.1.1", port: 80 }));
    assert.eq([none.failed[0].code, none.failed[0].field], ["VALIDATION_FAILED", "rtspUrl"], "нужен адрес");
    const res = await env.ok("POST", "/devices", row({ type: "camera", name: "По адресу", rtspUrl: "rtsp://10.1.1.1/main" }));
    const c = res.done[0].devices[0];
    assert.eq(c.rtspUrl, "rtsp://10.1.1.1/main", "адрес в записи");
    const bad = await env.call("PATCH", `/devices/${c.id}`, { rtspUrl: null }, v(c));
    assert.status(bad, 422, "VALIDATION_FAILED", "адрес один, снять нельзя");
    assert.eq(bad.body.field, "rtspUrl", "поле");
    const next = await env.ok("PATCH", `/devices/${c.id}`, { rtspUrl: "rtsp://10.1.1.2/main" }, v(c));
    assert.eq(next.rtspUrl, "rtsp://10.1.1.2/main", "правится");
  });

  test("MAC камеры — только из поиска: без candidateId не хранится, PATCH — 422 NOT_SUPPORTED", async () => {
    const env = await makeEnv();
    const res = await env.ok("POST", "/devices", create([{ device: newCam({ mac: "00:11:22:33:44:77" }), domainId: d1.id, parentId: null, folderId: null }]));
    const c = res.done[0].devices[0];
    assert.eq(c.mac, undefined, "принят и не сохранён");
    const bad = await env.call("PATCH", `/devices/${c.id}`, { mac: "00:11:22:33:44:88" }, v(c));
    assert.status(bad, 422, "NOT_SUPPORTED", "правки нет");
    assert.eq(bad.body.field, "mac", "поле");
  });

  /* ===== Потоки, разрешение, живое видео ===== */

  test("Потоки: добавить, изменить, удалить; основной — это Device.res и fps; запись ссылается на id потока", async () => {
    const env = await makeEnv();
    const c = (await env.list("/devices")).find((d) => d.type === "camera" && d.streams?.length >= 2 && d.online);
    const add = await env.call("POST", `/devices/${c.id}/streams`, { name: "Для облака", res: "1280x720", fps: 10 });
    assert.status(add, 201);
    const st = add.body.streams.at(-1);
    assert.eq([st.name, st.width, st.height, st.fps], ["Для облака", 1280, 720, 10], "поток с размером");
    const named = await env.ok("PATCH", `/devices/${c.id}/streams/${st.id}`, { name: "Облако" });
    assert.eq(named.streams.at(-1).name, "Облако", "имя");
    const main = await env.ok("PATCH", `/devices/${c.id}/streams/${c.streams[0].id}`, { fps: 15 });
    assert.eq(main.fps, 15, "основной поток — это Device.fps");
    const again = await env.ok("PATCH", `/devices/${c.id}`, { fps: 20 }, v(main));
    assert.eq(again.streams[0].fps, 20, "и наоборот");
    assert.status(await env.call("PATCH", `/devices/${c.id}`, { stream: "нет-такого" }, v(again)), 422, "VALIDATION_FAILED", "неизвестный поток");
    const used = await env.ok("PATCH", `/devices/${c.id}`, { stream: st.id }, v(again));
    assert.status(await env.call("DELETE", `/devices/${c.id}/streams/${st.id}`), 422, "VALIDATION_FAILED", "по потоку идёт запись");
    await env.ok("PATCH", `/devices/${c.id}`, { stream: c.streams[0].id }, v(used));
    const left = await env.ok("DELETE", `/devices/${c.id}/streams/${st.id}`);
    assert.eq(left.streams.length, c.streams.length, "удалён");
    assert.status(await env.call("DELETE", `/devices/${c.id}/streams/${c.streams[0].id}`), 422, "NOT_SUPPORTED", "основной остаётся");
    assert.status(await env.call("DELETE", `/devices/${c.id}/streams/нет`), 404, "NOT_FOUND");
    const s = await env.list("/devices");
    const det = s.find((d) => d.type === "det");
    assert.status(await env.call("POST", `/devices/${det.id}/streams`, { name: "x" }), 422, "NOT_SUPPORTED", "только у камеры");
  });

  test("Разрешение: латинская x, из resOptions; нет списка — ввод руками; codec только чтение, у потока откат", async () => {
    const env = await makeEnv();
    const list = await env.list("/devices");
    const c = list.find((d) => d.type === "camera" && d.resOptions);
    assert.status(await env.call("PATCH", `/devices/${c.id}`, { res: "1920×1080" }, v(c)), 422, "VALIDATION_FAILED", "кириллический знак умножения не проходит");
    assert.status(await env.call("PATCH", `/devices/${c.id}`, { res: "7680x4320" }, v(c)), 422, "VALIDATION_FAILED", "вне вариантов");
    const bad = await env.call("PATCH", `/devices/${c.id}`, { codec: "H.265" }, v(c));
    assert.status(bad, 422, "NOT_SUPPORTED", "кодек только чтение");
    const free = list.find((d) => d.type === "camera" && !d.resOptions);
    assert.eq((await env.ok("PATCH", `/devices/${free.id}`, { res: "1024x768" }, v(free))).res, "1024x768", "руками");
    const before = free.streams.length;
    await env.ok("POST", `/devices/${free.id}/streams`, { name: "Новый" });
    const op = (await env.ok("GET", "/operations")).items[0];
    await env.finished((await env.ok("POST", `/operations/${op.id}/revert`)).id);
    assert.eq((await env.ok("GET", `/devices/${free.id}`)).streams.length, before, "правка потока откатывается");
  });

  test("Живое видео: адрес, токен, срок; без связи — 409 DEVICE_OFFLINE; не камера — 422", async () => {
    const env = await makeEnv();
    const list = await env.list("/devices");
    const c = list.find((d) => d.type === "camera" && d.online);
    const live = await env.ok("POST", `/devices/${c.id}/live`, { width: 640, height: 360 });
    assert.ok(live.whepUrl && live.token && Date.parse(live.expiresAt) > 0, "ответ");
    const off = list.find((d) => d.type === "camera" && d.online === false);
    assert.status(await env.call("POST", `/devices/${off.id}/live`, { width: 640, height: 360 }), 409, "DEVICE_OFFLINE");
    const det = list.find((d) => d.type === "det");
    assert.status(await env.call("POST", `/devices/${det.id}/live`, { width: 640, height: 360 }), 422, "NOT_SUPPORTED");
  });

  /* ===== Детекторы ===== */

  const optsCam = async (env) => (await env.list("/devices")).find((d) => d.detectorOptions);
  const addDet = async (env, c, device) => env.ok("POST", "/devices", create([{ device: { type: "det", ...device }, domainId: c.domainId, parentId: c.id, folderId: null }]));

  test("Встроенный детектор: шаблон из detectorOptions, без них — 422; чувствительность по диапазону, нет настройки — 422", async () => {
    const env = await makeEnv();
    const c = await optsCam(env);
    const bad = await addDet(env, c, { name: "Нет такого", builtin: true, template: "нет" });
    assert.eq([bad.failed[0].code, bad.failed[0].field], ["VALIDATION_FAILED", "template"], "шаблона нет");
    const noOpts = (await env.list("/devices")).find((d) => d.type === "camera" && !d.detectorOptions);
    assert.eq((await addDet(env, noOpts, { name: "Нельзя", builtin: true })).failed[0].field, "builtin", "камера не умеет");
    const res = await addDet(env, c, { name: "Лица", builtin: true, template: "tmpl.face", detectorKind: "other", sensitivity: 50, enabled: false });
    const d = res.done[0].devices[0];
    assert.status(await env.call("PATCH", `/devices/${d.id}`, { sensitivity: 95 }, v(d)), 422, "VALIDATION_FAILED", "вне диапазона");
    const t = (await env.list("/devices")).find((x) => x.template === "tmpl.tamper");
    const none = await env.call("PATCH", `/devices/${t.id}`, { sensitivity: 5 }, v(t));
    assert.status(none, 422, "NOT_SUPPORTED", "настройки нет");
    assert.eq(none.body.field, "sensitivity", "поле");
  });

  test("Несовместимые детекторы: включение — 409 BUSY с params.reason, шаг операции — fail BUSY", async () => {
    const env = await makeEnv();
    const c = await optsCam(env);
    const list = await env.list("/devices");
    const t = list.find((x) => x.parentId === c.id && x.template === "tmpl.tamper") || (await addDet(env, c, { name: "Корпус", builtin: true, template: "tmpl.tamper", detectorKind: "other" })).done[0].devices[0];
    const face = (await addDet(env, c, { name: "Лица", builtin: true, template: "tmpl.face", detectorKind: "other", enabled: false })).done[0].devices[0];
    const res = await env.call("PATCH", `/devices/${face.id}`, { enabled: true }, v(face));
    assert.status(res, 409, "BUSY", "вместе нельзя");
    assert.eq([res.body.params.reason, res.body.params.with], ["incompatible", t.id], "причина и с кем");
    const op = await env.runOperation({ idempotencyKey: key(), items: [{ targetId: face.id, set: { enabled: true } }], expectedVersions: { [face.id]: face.version } });
    assert.eq([op.items[0].code, op.items[0].params.reason], ["BUSY", "incompatible"], "по шагу");
    const off = await env.ok("PATCH", `/devices/${t.id}`, { enabled: false }, v(t));
    assert.eq(off.enabled, false, "выключили первый");
    assert.eq((await env.ok("PATCH", `/devices/${face.id}`, { enabled: true }, v(face))).enabled, true, "теперь можно");
  });

  test("Зона: rect, polygon, line в долях кадра, неверная — 422 field: zone; два детектора одного вида; stream и params серверного", async () => {
    const env = await makeEnv();
    const c = await optsCam(env);
    const a = (await addDet(env, c, { name: "Линия 1", detectorKind: "linecross", zone: { shape: "line", points: [[0.1, 0.1], [0.9, 0.9]] } })).done[0].devices[0];
    const b = (await addDet(env, c, { name: "Линия 2", detectorKind: "linecross", stream: c.streams?.[0]?.id, params: "a=1" })).done[0].devices[0];
    assert.eq([a.zone.shape, b.params], ["line", "a=1"], "две записи одного вида, у каждой своё");
    const h = v(a);
    assert.status(await env.call("PATCH", `/devices/${a.id}`, { zone: { shape: "polygon", points: [[0, 0], [1, 1]] } }, h), 422, "VALIDATION_FAILED", "мало точек");
    assert.status(await env.call("PATCH", `/devices/${a.id}`, { zone: { shape: "line", points: [[0, 0], [1.2, 1]] } }, h), 422, "VALIDATION_FAILED", "за кадром");
    const z = await env.ok("PATCH", `/devices/${a.id}`, { zone: { shape: "rect", points: [[0.2, 0.2], [0.4, 0.4]] } }, h);
    assert.eq(z.zone.shape, "rect", "сохранена");
    assert.eq((await env.ok("PATCH", `/devices/${a.id}`, { zone: null }, v(z))).zone, undefined, "сброшена");
  });

  /* ===== PTZ ===== */

  const ptzCam = async (env) => (await env.list("/devices")).find((d) => d.ptz && d.online);

  test("Пресеты: задать, переименовать, удалить, откат; камера без PTZ — 422", async () => {
    const env = await makeEnv();
    const c = await ptzCam(env);
    const was = c.presets.length;
    const at = (r, n) => r.presets.find((x) => x.n === n);
    // PUT {} сохраняет положение и создаёт запись без подписи
    const pos = await env.ok("PUT", `/devices/${c.id}/presets/9`, {});
    assert.eq(at(pos, 9), { n: 9, name: "" }, "сохранённый без имени виден");
    assert.ok(c.presetMax >= 9, "предел в записи");
    const set = await env.ok("PUT", `/devices/${c.id}/presets/9`, { name: "Ворота" });
    assert.eq(set.presets.at(-1), { n: 9, name: "Ворота" }, "имя задано, номера по порядку");
    assert.ok(set.version !== c.version, "версия записи изменилась");
    const same = await env.ok("PUT", `/devices/${c.id}/presets/9`, {});
    assert.eq(at(same, 9).name, "Ворота", "без имени — положение, имя прежнее");
    const blank = await env.ok("PUT", `/devices/${c.id}/presets/9`, { name: "" });
    assert.eq(at(blank, 9), { n: 9, name: "" }, "пустое снимает подпись, запись остаётся");
    const made = await env.ok("PUT", `/devices/${c.id}/presets/8`, { name: "" });
    assert.eq(at(made, 8), { n: 8, name: "" }, "PUT {name} создаёт запись, пустое имя тоже");
    assert.status(await env.call("PUT", `/devices/${c.id}/presets/${c.presetMax + 1}`, {}), 404, "NOT_FOUND", "выше предела");
    assert.status(await env.call("DELETE", `/devices/${c.id}/presets/${c.presetMax + 1}`), 404, "NOT_FOUND", "и удаление");
    await env.ok("DELETE", `/devices/${c.id}/presets/8`);
    const gone = await env.ok("DELETE", `/devices/${c.id}/presets/9`);
    assert.eq(gone.presets.length, was, "снимает запись только DELETE");
    assert.eq((await env.ok("DELETE", `/devices/${c.id}/presets/9`)).presets.length, was, "записи нет — отказа нет");
    const flat = (await env.list("/devices")).find((d) => d.type === "camera" && !d.ptz);
    const no = await env.call("PUT", `/devices/${flat.id}/presets/1`, {});
    assert.status(no, 422, "NOT_SUPPORTED", "без PTZ");
    assert.eq(no.body.field, "ptz", "поле");
    assert.eq((await env.ok("PUT", `/devices/${flat.id}/presets/1`, { name: "Без PTZ" })).presets[0].name, "Без PTZ", "имя ptz не судит");
    assert.status(await env.call("PUT", `/devices/${flat.id}/presets/1`, { name: "" }), 200);
    assert.eq((await env.ok("DELETE", `/devices/${flat.id}/presets/1`)).presets.length, 0, "DELETE снимает запись и без ptz");
    const offline = await env.ok("POST", "/test/events", { type: "device.signal", deviceId: c.id, online: false });
    assert.eq(offline.applied, true, "камера без связи");
    assert.status(await env.call("PUT", `/devices/${c.id}/presets/7`, {}), 409, "DEVICE_OFFLINE", "положение судит связь");
    assert.status(await env.call("PUT", `/devices/${c.id}/presets/7`, { name: "Ночь" }), 200);
    assert.status(await env.call("DELETE", `/devices/${c.id}/presets/7`), 200);
  });

  test("Аренда PTZ: срок от ttlSec, продление, стоп, скорости от -1 до 1", async () => {
    const env = await makeEnv();
    const c = await ptzCam(env);
    const a = await env.ok("PUT", `/devices/${c.id}/ptz`, { pan: 0.5, tilt: -0.5, ttlSec: 3 });
    assert.ok(Date.parse(a.expiresAt) > 0, "срок");
    assert.status(await env.call("PUT", `/devices/${c.id}/ptz`, { pan: 2, ttlSec: 3 }), 422, "VALIDATION_FAILED", "скорость вне диапазона");
    assert.status(await env.call("PUT", `/devices/${c.id}/ptz`, { zoom: 1 }), 422, "VALIDATION_FAILED", "срок обязателен");
    assert.status(await env.call("DELETE", `/devices/${c.id}/ptz`), 204);
    assert.status(await env.call("DELETE", `/devices/${c.id}/ptz`), 204, null, "аренды нет — тоже стоп");
    await env.ok("POST", "/test/events", { type: "device.signal", deviceId: c.id, online: false, fault: "conn" });
    assert.status(await env.call("PUT", `/devices/${c.id}/ptz`, { pan: 1, ttlSec: 1 }), 409, "DEVICE_OFFLINE", "без связи");
  });

  /* ===== Источник событий ===== */

  const pos = (over) => create([{ device: { type: "eventsrc", name: "Касса", vendor: "PosXml", model: "PosXml Device", ip: "10.3.3.3", port: 2600, ...over }, domainId: d1.id, parentId: null, folderId: null }]);

  test("Источник: 0.0.0.0 и :: — 422 field: ip; без сервера выбирает система и предупреждает; второй на порт не запустится", async () => {
    const env = await makeEnv();
    assert.eq((await env.ok("POST", "/devices", pos({ ip: "0.0.0.0" }))).failed[0].field, "ip", "все адреса");
    assert.eq((await env.ok("POST", "/devices", pos({ ip: "::" }))).failed[0].code, "VALIDATION_FAILED", "и в IPv6");
    const a = (await env.ok("POST", "/devices", pos())).done[0].devices[0];
    assert.ok(a.serverId && a.faultText, "сервер выбран, предупреждение есть");
    assert.status(await env.call("PATCH", `/devices/${a.id}`, { ip: "::" }, v(a)), 422, "VALIDATION_FAILED", "и при правке");
    const s = FX.servers.find((x) => x.allocated && x.online && x.id !== a.serverId) || FX.servers.find((x) => x.id === a.serverId);
    const b = (await env.ok("POST", "/devices", pos({ serverId: a.serverId }))).done[0].devices[0];
    assert.eq([b.online, /занят/.test(b.faultText)], [false, true], "второй на порт — причина в состоянии");
    const moved = await env.ok("PATCH", `/devices/${a.id}`, { serverId: s.id }, v(a));
    assert.eq(moved.serverId, s.id, "сервер источника — запись");
  }, { needs: ["type:eventsrc"] });

  test("Правило: вид text у источника, match по слову; номера нет", async () => {
    const env = await makeEnv();
    const ref = await env.ok("GET", "/reference");
    const t = ref.ruleTriggers.find((x) => x.kind === "text");
    assert.eq([t.deviceTypes, t.match[0].id], [["eventsrc"], "word"], "вид объявлен");
  }, { needs: ["type:eventsrc"] });

  /* ===== Единицы СКУД ===== */

  const acs = async (env) => {
    const list = await env.list("/devices");
    return { list, root: list.find((d) => d.type === "acfa" && !d.parentId), lock: list.find((d) => d.type === "acfa_lock" && d.operations?.length) };
  };
  const unit = (env, device, parent, folderId = null) => env.ok("POST", "/devices", create([{ device, domainId: parent.domainId, parentId: parent.id, folderId }]));
  const inAcs = { needs: ["type:acfa"] };

  test("Единица СКУД: шаблон из unitOptions, адрес path, правка model — 422; в папку нельзя; родитель — acfa, камера, ipsrv", async () => {
    const env = await makeEnv();
    const { root, list } = await acs(env);
    const res = await unit(env, { type: "acfa_lock", name: "Дверь", model: "tmpl.door", path: "door/9" }, root);
    const d = res.done[0].devices[0];
    assert.eq([d.model, d.path], ["tmpl.door", "door/9"], "создана");
    const bad = await env.call("PATCH", `/devices/${d.id}`, { model: "tmpl.zone" }, v(d));
    assert.status(bad, 422, "NOT_SUPPORTED", "шаблон не правится");
    assert.eq(bad.body.field, "model", "поле");
    assert.eq((await env.ok("PATCH", `/devices/${d.id}`, { path: "door/10", properties: { mode: "locked" } }, v(d))).path, "door/10", "адрес правится");
    assert.eq((await unit(env, { type: "acfa_lock", name: "Нет шаблона", model: "нет" }, root)).failed[0].field, "model", "шаблона нет");
    const f = FX.folders.find((x) => x.domainId === root.domainId);
    assert.eq((await unit(env, { type: "acfa_sensor", name: "В папку" }, root, f.id)).failed[0].code, "NOT_SUPPORTED", "папки нет");
    const cam = list.find((x) => x.type === "camera");
    assert.eq((await unit(env, { type: "acfa_sensor", name: "Считыватель" }, cam)).done.length, 1, "под камерой");
    const ip = list.find((x) => x.type === "ipsrv" && !x.derived);
    assert.eq((await unit(env, { type: "acfa_lock", name: "Замок" }, ip)).done.length, 1, "под ipsrv");
    const sensor = list.find((x) => x.type === "sensor");
    assert.eq((await unit(env, { type: "acfa_lock", name: "Нельзя" }, sensor)).failed[0].code, "PARENT_MISMATCH", "под датчиком — нет");
  }, inAcs);

  test("Реле: в СКУД заводит оператор, вне СКУД — 422; контроллер: acfa с родителем, без своего подключения, снимается с вложенным", async () => {
    const env = await makeEnv();
    const { root, lock, list } = await acs(env);
    assert.eq((await unit(env, { type: "relay", name: "Реле двери", path: "r/1" }, lock)).done.length, 1, "под замком");
    const cam = list.find((x) => x.type === "camera");
    assert.eq((await unit(env, { type: "relay", name: "Реле" }, cam)).failed[0].code, "NOT_SUPPORTED", "под камерой — находка сервера");
    assert.eq((await unit(env, { type: "acfa", name: "Контроллер", ip: "10.0.0.5" }, root)).failed[0].field, "ip", "адреса нет");
    const c = (await unit(env, { type: "acfa", name: "Контроллер", path: "c/1" }, root)).done[0].devices[0];
    assert.status(await env.call("PATCH", `/devices/${c.id}`, { vendor: "x" }, v(c)), 422, "NOT_SUPPORTED", "подключения нет");
    const kid = (await unit(env, { type: "acfa_lock", name: "Дверь" }, c)).done[0].devices[0];
    assert.status(await env.call("DELETE", `/devices/${c.id}`, undefined, v(c)), 204);
    assert.status(await env.call("GET", `/devices/${kid.id}`), 404, "NOT_FOUND", "вложенное снято");
  }, inAcs);

  test("Команда единицы: выполняется, нет команды — 409 DEVICE_REFUSED, без связи — 409 DEVICE_OFFLINE", async () => {
    const env = await makeEnv();
    const { lock, list } = await acs(env);
    assert.eq((await env.ok("POST", `/devices/${lock.id}/operations/${lock.operations[0]}`, {})).done, true, "выполнено");
    const no = await env.call("POST", `/devices/${lock.id}/operations/fly`, {});
    assert.status(no, 409, "DEVICE_REFUSED", "команды нет");
    assert.eq(no.body.params.reason, "noOperation", "причина");
    const cam = list.find((x) => x.type === "camera");
    assert.status(await env.call("POST", `/devices/${cam.id}/operations/open`, {}), 422, "NOT_SUPPORTED", "у камеры команд нет");
    await env.ok("POST", "/test/events", { type: "device.signal", deviceId: lock.id, online: false, fault: "conn" });
    assert.status(await env.call("POST", `/devices/${lock.id}/operations/${lock.operations[0]}`, {}), 409, "DEVICE_OFFLINE");
  }, inAcs);

  test("Правило: действие unit с operation, вид unit с word; output на реле двери — 422 NOT_SUPPORTED", async () => {
    const env = await makeEnv();
    const ref = await env.ok("GET", "/reference");
    assert.ok(ref.ruleTriggers.some((x) => x.kind === "unit") && ref.ruleActions.some((x) => x.action === "unit"), "объявлены");
    const { list } = await acs(env);
    const by = new Map(list.map((d) => [d.id, d]));
    const relay = list.find((d) => d.type === "relay" && by.get(d.parentId)?.type === "acfa_lock");
    const cur = (await env.list("/rules"))[0];
    const CONTENT = ["name", "enabled", "logOnly", "logOnlySince", "start", "runMode", "operatorMenu", "ratePerMinute", "windowSec", "runAt", "repeat", "triggers", "conditions", "steps", "owner", "purpose", "serverId", "runAsRoleId", "allowChain"];
    const body = (steps) => Object.assign(Object.fromEntries(CONTENT.map((k) => [k, cur[k]])), { steps });
    const target = { include: [{ kind: "device", id: relay.id }], exclude: [], gone: [], fromEvent: false };
    const res = await env.call("PUT", `/rules/${cur.id}`, body([{ source: "vms", action: "output", target, pulseMs: 500 }]), { "If-Match": `"${cur.version}"` });
    assert.status(res, 422, "NOT_SUPPORTED", "команда идёт операцией");
    await env.ok("PUT", `/rules/${cur.id}`, body([{ source: "vms", action: "unit", target, operation: "on" }]), { "If-Match": `"${cur.version}"` });
  }, inAcs);

  /* ===== Профиль при добавлении ===== */

  test("Профиль при добавлении: разовый выбор, в записи его нет; default — умолчания; template — копия с камеры той же модели", async () => {
    const env = await makeEnv();
    const row = (device) => create([{ device, domainId: d1.id, parentId: null, folderId: null }]);
    const cur = (await env.ok("POST", "/devices", row(newCam({ configMode: "current" })))).done[0].devices[0];
    assert.eq([cur.configMode, cur.res], [undefined, undefined], "current: ничего не меняет, в ответе поля нет");
    const bad = await env.call("PATCH", `/devices/${cur.id}`, { configMode: "default" }, v(cur));
    assert.status(bad, 422, "NOT_SUPPORTED", "PATCH");
    const def = (await env.ok("POST", "/devices", row(newCam({ configMode: "default" })))).done[0].devices[0];
    assert.ok(def.res && def.fps, "default: умолчания модели");
    assert.eq((await env.ok("POST", "/devices", row({ type: "camera", name: "Только адрес", rtspUrl: "rtsp://1", configMode: "default" }))).failed[0].field, "configMode", "без модели — нельзя");
    const src = (await env.list("/devices")).find((d) => d.type === "camera" && d.streams?.length > 1 && d.vendor && d.model && !d.parentId);
    const good = (await env.ok("POST", "/devices", row(newCam({ vendor: src.vendor, model: src.model, configMode: "template", templateId: src.id })))).done[0].devices[0];
    assert.eq([good.res, good.fps, good.streams.length, good.templateId], [src.res, src.fps, src.streams.length, undefined], "копия потоков, связи нет");
    assert.ok(good.ip !== src.ip && good.name !== src.name && !good.recordDetectorIds, "адрес, имя, записи не копируются");
    assert.eq((await env.ok("POST", "/devices", row(newCam({ model: "Другая", configMode: "template", templateId: src.id })))).failed[0].field, "templateId", "другая модель");
    assert.eq((await env.ok("POST", "/devices", row(newCam({ configMode: "template" })))).failed[0].field, "templateId", "нет источника");
  });

  test("Метки, тревожные виды, строка записи: хранятся; состояние только чтение", async () => {
    const env = await makeEnv();
    const c = (await env.list("/devices")).find((d) => d.type === "camera" && d.archiveId);
    const res = await env.ok("PATCH", `/devices/${c.id}`, { labels: ["gpu"], alarmKinds: ["motion"] }, v(c));
    assert.eq([res.labels, res.alarmKinds], [["gpu"], ["motion"]], "камера");
    const ref = await env.ok("GET", "/reference");
    assert.ok(ref.eventKinds.includes("motion") && ref.serverLabels.length > 0, "варианты из справочника");
    const a = FX.archives.find((x) => x.id !== c.archiveId);
    const x = await env.ok("PATCH", `/devices/${c.id}`, { extraArchives: [{ archiveId: a.id, recordMode: "always", labels: ["archive"] }] }, v(res));
    assert.eq(x.extraArchives[0].labels, ["archive"], "метка строки записи");
  });

  ApiTest.loaded("api-devices.js");
})();
