/* Тесты API: домен шире кластера, запрос 2026-11-01-182545Z пп. 7–11, 13, 16, 17 и дополнение пп. 4, 5. */
(() => {
  const { test, makeEnv, assert, FX } = ApiTest;
  const d1 = FX.domains[0];
  const cam = FX.devices.find((d) => d.type === "camera" && !d.parentId && d.serverId && d.online && d.domainId === d1.id);
  const w2c = (over) => Object.assign({ id: "39999999-0000-4000-8000-000000000000", type: "camera", parentId: null, domainId: d1.id, name: "Камера w2c", online: true, enabled: true, direct: false, writableFields: ["name", "enabled"], ptz: true, version: "1" }, over);
  const withCam = (over) => ({ devices: FX.devices.concat(w2c(over)) });
  const server = FX.servers.find((s) => s.allocated && s.online && s.domainId === d1.id);

  test("Запись камеры w2c: приёмник — настройка, serverId наблюдение, снять, сервера нет — 422", async () => {
    const env = await makeEnv({ fixturePatch: withCam() });
    const id = w2c().id;
    const put = (b) => env.call("PUT", `/devices/${id}/recording-target`, b);
    const res = await put({ serverId: server.id, copies: [] });
    assert.status(res, 200);
    assert.eq([res.body.recordingTarget, res.body.serverId], [{ serverId: server.id, copies: [] }, server.id], "назначено");
    assert.status(await put({ serverId: "20009999-0000-4000-8000-000000000000", copies: [] }), 422, "VALIDATION_FAILED");
    const off = await put({ serverId: null, copies: [] });
    assert.ok(!("recordingTarget" in off.body) && !("serverId" in off.body), "снято");
    assert.status(await env.call("PUT", `/devices/${FX.devices.find((x) => x.type === "det").id}/recording-target`, { serverId: server.id, copies: [] }), 422, "NOT_SUPPORTED");
  }, { needs: ["putRecordingTarget"] });

  test("Копии записи: список серверов, порядок значим; копия — кластер: повтор, чужой, кластер основного и два сервера кластера — 422", async () => {
    // Свои серверы: кластер — начало имени, наборы называют серверы по-разному
    const names = ["К1/Сервер а", "К1/Сервер б", "К2/Сервер а", "К2/Сервер б", "К3/Сервер а", "Сервер один"];
    const made = names.map((name, i) => Object.assign({}, server, { id: `2000aaa${i}-0000-4000-8000-000000000000`, name, fingerprint: undefined }));
    const env = await makeEnv({ fixturePatch: Object.assign(withCam(), { servers: FX.servers.concat(JSON.parse(JSON.stringify(made))) }) });
    const put = (b) => env.call("PUT", `/devices/${w2c().id}/recording-target`, b);
    const [main, twin, a, a2, b, solo] = made.map((s) => s.id);
    const res = await put({ serverId: main, copies: [b, a, solo] });
    assert.eq(res.body.recordingTarget, { serverId: main, copies: [b, a, solo] }, "порядок как прислан");
    assert.eq((await env.ok("GET", `/devices/${w2c().id}`)).recordingTarget.copies, [b, a, solo], "и на чтении");
    assert.eq((await put({ serverId: main, copies: [a, b] })).body.recordingTarget.copies, [a, b], "порядок сменился");
    const bad = async (copies, what) => {
      const r = await put({ serverId: main, copies });
      assert.status(r, 422, "VALIDATION_FAILED", what);
      assert.eq(r.body.field, "copies", what);
    };
    await bad([a, a], "повтор");
    await bad(["20009999-0000-4000-8000-000000000000"], "несуществующий");
    await bad([main], "сам основной");
    await bad([twin], "сервер кластера основного");
    await bad([a, a2], "два сервера одного кластера");
    assert.eq((await env.ok("GET", `/devices/${w2c().id}`)).recordingTarget.copies, [a, b], "отказ ничего не менял");
    assert.eq((await put({ serverId: main, copies: [] })).body.recordingTarget.copies, [], "пусто — копий нет");
    const off = await put({ serverId: null, copies: [a] });
    assert.status(off, 422, "VALIDATION_FAILED", "снятие с копиями");
    assert.status(await put({ serverId: main, copies: 2 }), 422, "VALIDATION_FAILED", "число — прежний контракт, больше не принимается");
  }, { needs: ["putRecordingTarget"] });

  test("Камера w2c: адресные поля не пишутся, молчание — DEVICE_OFFLINE, движение арендой недоступно, пресет можно", async () => {
    const env = await makeEnv({ fixturePatch: withCam() });
    const id = w2c().id;
    const r = await env.ok("GET", `/devices/${id}`);
    assert.eq([r.direct, "ip" in r], [false, false], "адреса нет");
    assert.status(await env.call("PATCH", `/devices/${id}`, { ip: "10.0.0.1" }, { "If-Match": `"${r.version}"` }), 422, "NOT_SUPPORTED", "адрес не пишется");
    assert.status(await env.call("PUT", `/devices/${id}/ptz`, { pan: 0.1, tilt: 0, zoom: 0, focus: 0, ttlSec: 2 }), 422, "NOT_SUPPORTED", "аренда");
    assert.status(await env.call("PUT", `/devices/${id}/presets/1`, { name: "Ворота" }), 200, null, "подпись пресета правкой");
    const pos = await env.call("PUT", `/devices/${id}/presets/1`, {});
    assert.status(pos, 409, "OTHER_CLUSTER", "положение на камере за NAT");
    assert.ok(!pos.body.params || !pos.body.params.url, "ссылки на вход нет");
    const off = await makeEnv({ fixturePatch: withCam({ online: false }) });
    const o = await off.ok("GET", `/devices/${id}`);
    assert.status(await off.call("PATCH", `/devices/${id}`, { name: "x" }, { "If-Match": `"${o.version}"` }), 409, "DEVICE_OFFLINE");
  });

  test("Правка при молчащем сервере — 409 SERVER_OFFLINE; другой кластер — OTHER_CLUSTER со ссылкой", async () => {
    const quiet = FX.servers.find((s) => s.allocated && !s.online);
    const onIt = FX.devices.find((x) => x.serverId === quiet.id);
    const env = await makeEnv();
    if (onIt) assert.status(await env.call("PATCH", `/devices/${onIt.id}`, { name: "x" }, { "If-Match": `"${onIt.version}"` }), 409, "SERVER_OFFLINE");
    const url = "https://cluster-b/backend/";
    const other = await makeEnv({ fixturePatch: { stand: { otherCluster: { [cam.id]: url } } } });
    const res = await other.call("POST", `/devices/${cam.id}/live`, { width: 640, height: 360 });
    assert.status(res, 409, "OTHER_CLUSTER");
    assert.eq(res.body.params.url, url, "ссылка на вход");
    // Камера w2c за NAT, вошли не через кластер приёмника: та же дверь, та же кнопка
    const id = w2c().id;
    const nat = await makeEnv({ fixturePatch: Object.assign(withCam({}), { stand: { otherCluster: { [id]: url } } }) });
    const far = await nat.call("POST", `/devices/${id}/live`, { width: 640, height: 360 });
    assert.status(far, 409, "OTHER_CLUSTER");
    assert.eq(far.body.params.url, url, "камера за NAT: ссылка на вход");
    // Вошли через него: обычный адрес
    assert.ok((await (await makeEnv({ fixturePatch: withCam({}) })).ok("POST", `/devices/${id}/live`, { width: 640, height: 360 })).whepUrl, "через свой кластер — адрес");
  }, { needs: ["startLive"] });

  test("Определение модели: логин и пароль необязательны, без них система вправе не назвать", async () => {
    const env = await makeEnv({ fixturePatch: { stand: { probeNeedsLogin: true } } });
    const vendor = FX.reference.deviceModels[0].vendor;
    assert.eq((await env.ok("POST", "/devices/probe", { ip: "10.1.1.1", port: 80, vendor })).model, null, "без входа");
    assert.ok((await env.ok("POST", "/devices/probe", { ip: "10.1.1.1", port: 80, vendor, login: "a", password: "b" })).model, "с входом");
  }, { needs: ["probeDevice"] });

  test("Приём в домен: отпечаток сверяется, только администратор домена, камера становится записью camera", async () => {
    const knock = FX.servers.find((s) => !s.allocated && s.domainId === d1.id && s.fingerprint && s.class !== "camera");
    const env = await makeEnv();
    const item = (s, over) => Object.assign({ serverId: s.id, version: s.version, domainId: s.domainId, allocated: true }, over);
    const key = () => ApiTest.key();
    const bad = await env.ok("POST", "/servers/assign", { idempotencyKey: key(), items: [item(knock, { fingerprint: "чужой" })] });
    assert.eq(bad.failed[0].code, "FINGERPRINT_MISMATCH", "чужая коробка");
    const none = await env.ok("POST", "/servers/assign", { idempotencyKey: key(), items: [item(knock)] });
    assert.eq(none.failed[0].code, "FINGERPRINT_MISMATCH", "без сверки");
    const ok = await env.ok("POST", "/servers/assign", { idempotencyKey: key(), items: [item(knock, { fingerprint: knock.fingerprint })] });
    assert.eq(ok.done.map((x) => x.id), [knock.id], "принят");
    const back = await env.ok("POST", "/servers/assign", { idempotencyKey: key(), items: [{ serverId: knock.id, version: ok.done[0].version, domainId: d1.id, allocated: false }] });
    assert.eq(back.done[0].allocated, false, "исключён");
    const adm = FX.access.roles.find((r) => r.global.unr);
    const man = FX.access.users.find((u) => u.enabled && !u.roleIds.includes(adm.id) && !FX.access.groups.some((g) => g.memberIds.includes(u.id) && g.roleIds.includes(adm.id)));
    const plain = await makeEnv({ actAs: man.login });
    assert.status(await plain.call("POST", "/servers/assign", { idempotencyKey: key(), items: [item(knock, { fingerprint: knock.fingerprint })] }), 403, "PERMISSION_DENIED");
    const cam2 = FX.servers.find((s) => !s.allocated && s.class === "camera" && s.domainId === d1.id);
    const seen = [];
    const env2 = await makeEnv();
    const stop = ApiTest.subscribeForTest((m) => seen.push(m), [d1.id]);
    await ApiTest.settle();
    await env2.ok("POST", "/servers/assign", { idempotencyKey: key(), items: [item(cam2, { fingerprint: cam2.fingerprint })] });
    await ApiTest.settle();
    stop();
    assert.ok(seen.some((m) => m.type === "entity.deleted" && m.kind === "server" && m.entityId === cam2.id), "запись сервера снята");
    assert.ok(seen.some((m) => m.type === "entity.created" && m.kind === "device"), "появилась камера");
    assert.ok(!(await env2.list("/servers")).some((s) => s.id === cam2.id), "сервера нет");
  });

  test("Папки без связи с доменом: 409 SERVER_OFFLINE, шаг fail, создание с папкой — 422", async () => {
    const f = FX.folders.find((x) => x.domainId === d1.id);
    const env = await makeEnv();
    await env.ok("POST", "/test/events", { type: "domain.link", domainId: d1.id, online: false });
    assert.status(await env.call("POST", "/folders", { name: "x", domainId: d1.id, parentId: null }), 409, "SERVER_OFFLINE");
    assert.status(await env.call("PATCH", `/folders/${f.id}`, { name: "x" }, { "If-Match": `"${f.version}"` }), 409, "SERVER_OFFLINE");
    assert.status(await env.call("DELETE", `/folders/${f.id}`, undefined, { "If-Match": `"${f.version}"` }), 409, "SERVER_OFFLINE");
    assert.status(await env.call("POST", `/folders/${f.id}/devices`, { add: [], remove: [] }), 409, "SERVER_OFFLINE");
    const res = await env.ok("POST", "/devices", { idempotencyKey: ApiTest.key(), items: [{ device: { type: "camera", name: "Новая", rtspUrl: "rtsp://10.0.0.9/1" }, domainId: d1.id, parentId: null, folderId: f.id }] });
    assert.eq([res.failed[0].code, res.failed[0].field], ["VALIDATION_FAILED", "folderId"], "создание с папкой");
  });

  ApiTest.loaded("api-cluster.js");
})();
