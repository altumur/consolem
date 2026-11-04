/* Тесты API: хранилища и тома. */
(() => {
  const { test, makeEnv, assert, key, FX } = ApiTest;
  const GB = 1024 ** 3;
  const v = (rec) => ({ "If-Match": `"${rec.version}"` });
  // Свободный диск сервера: на нём нет томов локальных хранилищ этого сервера
  const usedDisks = (sid) =>
    new Set(FX.volumes.filter((x) => FX.archives.some((a) => a.id === x.archiveId && a.kind === "local" && a.serverId === sid)).map((x) => x.disk));
  // Сервер, у которого свободных дисков хватит на три тома
  const srv = FX.servers.find((s) => s.allocated && s.online && s.disks.filter((d) => !d.system && !usedDisks(s.id).has(d.disk)).length >= 3);
  const freeDisks = srv.disks.filter((d) => !d.system && !usedDisks(srv.id).has(d.disk)).map((d) => d.disk);
  const localArch = FX.archives.find((a) => a.kind === "local" && a.serverId === srv.id) || null;
  const offlineArch = FX.archives.find((a) => a.serverId && !FX.servers.find((s) => s.id === a.serverId).online);
  // Шифрование — необязательная возможность: без неё хранилища создаются нешифрованными
  const enc = () => ApiTest.can("feature:archiveEncryption");
  const local = (over) => ({ name: "Хранилище — тест", kind: "local", storage: "object", encrypted: enc(), retentionDays: 14, provider: null, serverId: srv.id, domainId: null,
    firstVolume: { name: `${freeDisks[0]}\\AxxonArchive\\Тест`, disk: freeDisks[0], sizeBytes: 500 * GB, mode: "dir", dir: `${freeDisks[0]}\\AxxonArchive\\Тест` }, ...over });

  test("Хранилище: создать локальное с первым томом — 201, оба в списках", async () => {
    const env = await makeEnv();
    const res = await env.call("POST", "/archives", local());
    assert.status(res, 201);
    const { archive, volumes } = res.body;
    assert.eq([archive.kind, archive.storage, archive.encrypted, archive.serverId, volumes.length, volumes[0].state, volumes[0].usedPercent], ["local", "object", enc(), srv.id, 1, "ready", 0], "запись");
    assert.ok((await env.list("/archives")).some((a) => a.id === archive.id), "хранилище в списке");
    assert.eq((await env.ok("GET", `/volumes/${volumes[0].id}`)).archiveId, archive.id, "том в списке");
  });

  // Вид с адресом bucket: система может объявить network и так, форма и сервер судят по адресу
  const BUCKET = { fixturePatch: { reference: { archiveKinds: FX.reference.archiveKinds.map((k) => (k.kind === "network" ? { ...k, address: "bucket" } : k)) } } };

  test("Хранилище: блочное не шифруется; бакет — всегда объектное; раздел целиком — неотформатирован", async () => {
    const env = await makeEnv(BUCKET);
    const block = await env.ok("POST", "/archives", local({ storage: "block", encrypted: enc(), firstVolume: { name: freeDisks[0], disk: freeDisks[0], sizeBytes: 4096 * GB, mode: "part" } }));
    assert.eq([block.archive.encrypted, block.volumes[0].state], [false, "unfmt"], "блочное, раздел");
    const cloud = await env.ok("POST", "/archives", { name: "Облако", kind: "network", storage: "block", encrypted: enc(), retentionDays: 30, provider: "s3", serverId: null, domainId: FX.domains[0].id,
      firstVolume: { name: "s3://b/v", disk: "s3", sizeBytes: 10240 * GB, bucket: "b", region: "eu-central-1", path: "v", keyId: "AKIA", secret: "s" } });
    assert.eq([cloud.archive.storage, cloud.archive.encrypted, cloud.volumes[0].hasSecret, "secret" in cloud.volumes[0]], ["object", enc(), true, false], "облачное, секрет скрыт");
  });

  test("Хранилище: отказы — нет имени, двух владельцев, локальное без сервера, облако без бакета, чужой диск", async () => {
    const env = await makeEnv();
    assert.status(await env.call("POST", "/archives", local({ name: " " })), 422, "NAME_REQUIRED");
    assert.status(await env.call("POST", "/archives", local({ domainId: FX.domains[0].id })), 422, "VALIDATION_FAILED", "два владельца");
    assert.status(await env.call("POST", "/archives", local({ serverId: null, domainId: FX.domains[0].id })), 422, "VALIDATION_FAILED", "локальное — на сервере");
    const bucket = await makeEnv(BUCKET);
    assert.status(await bucket.call("POST", "/archives", { ...local(), kind: "network", provider: "s3", firstVolume: { name: "x", disk: "s3", sizeBytes: GB } }), 422, "VALIDATION_FAILED", "без бакета");
    await makeEnv();
    assert.status(await env.call("POST", "/archives", local({ firstVolume: { name: "Z:", disk: "Z:", sizeBytes: GB, mode: "dir" } })), 422, "VALIDATION_FAILED", "нет такого диска");
    assert.status(await env.call("POST", "/archives", local({ serverId: "20009999-0000-4000-8000-000000000000" })), 404, "NOT_FOUND");
  });

  test("Том: добавить на свободный диск; тот же диск в этом хранилище и раздел на занятом диске — 409 DISK_TAKEN", async () => {
    const env = await makeEnv();
    const { archive } = await env.ok("POST", "/archives", local());
    const second = freeDisks[1];
    const res = await env.call("POST", `/archives/${archive.id}/volumes`, { name: second, disk: second, sizeBytes: 500 * GB, mode: "dir", dir: `${second}\\A` });
    assert.status(res, 201);
    assert.status(await env.call("POST", `/archives/${archive.id}/volumes`, { name: second, disk: second, sizeBytes: GB, mode: "dir" }), 409, "DISK_TAKEN", "тот же диск");
    const other = await env.ok("POST", "/archives", local({ name: "Второе", firstVolume: { name: freeDisks[2], disk: freeDisks[2], sizeBytes: GB, mode: "dir" } }));
    assert.status(await env.call("POST", `/archives/${other.archive.id}/volumes`, { name: second, disk: second, sizeBytes: GB, mode: "part" }), 409, "DISK_TAKEN", "раздел на диске с томами");
    assert.status(await env.call("POST", `/archives/20009999-0000-4000-8000-000000000000/volumes`, { name: "x", disk: "x", sizeBytes: GB }), 404, "NOT_FOUND");
  }, { needs: ["createVolume"] });

  test("Хранилище и том: PATCH с версией; пароль NAS — только запись", async () => {
    const env = await makeEnv();
    const a = FX.archives.find((x) => x.kind === "network");
    const res = await env.ok("PATCH", `/archives/${a.id}`, { name: "NAS — главный", retentionDays: 90 }, v(a));
    assert.eq([res.name, res.retentionDays], ["NAS — главный", 90], "хранилище");
    assert.ok(res.version !== a.version, "версия изменилась");
    assert.status(await env.call("PATCH", `/archives/${a.id}`, { kind: "local" }, { "If-Match": `"${res.version}"` }), 422, "VALIDATION_FAILED", "вид не меняют");
    const vol = FX.volumes.find((x) => x.archiveId === a.id);
    const pv = await env.ok("PATCH", `/volumes/${vol.id}`, { login: "VMS\\svc2", password: "p@ss", sizeBytes: 2048 * GB, confirmShrinkBytes: 2048 * GB }, v(vol));
    assert.eq([pv.login, pv.hasPassword, "password" in pv, pv.sizeBytes], ["VMS\\svc2", true, false, 2048 * GB], "том");
    assert.status(await env.call("PATCH", `/volumes/${vol.id}`, { state: "ready" }, { "If-Match": `"${pv.version}"` }), 422, "VALIDATION_FAILED", "состояние — только «Форматировать»");
    assert.status(await env.call("PATCH", `/volumes/${vol.id}`, { name: "x" }), 428, "PRECONDITION_REQUIRED");
  });

  test("Том: форматировать — сразу format, через 1,5 с ready и 0%; повторно во время — 409", async () => {
    const env = await makeEnv();
    const vol = FX.volumes.find((x) => x.usedPercent > 0);
    const res = await env.call("POST", `/volumes/${vol.id}/format`);
    assert.status(res, 202);
    assert.eq(res.body.state, "format", "начато");
    assert.status(await env.call("POST", `/volumes/${vol.id}/format`), 409, "BUSY");
    if (env.frozen) {
      const fired = await env.advance(2);
      assert.ok(fired.some((f) => f.kind === "volume" && f.id === vol.id), "в ответе часов — форматирование завершилось");
    }
    const done = await env.until(async () => {
      const x = await env.ok("GET", `/volumes/${vol.id}`);
      return x.state === "ready" && x;
    }, "форматирование закончилось");
    assert.eq([done.state, done.usedPercent], ["ready", 0], "готов, пуст");
  });

  test("Том: удалить — 204, его нет; хранилище остаётся", async () => {
    const env = await makeEnv();
    const vol = FX.volumes[0];
    assert.status(await env.call("DELETE", `/volumes/${vol.id}`, undefined, v(vol)), 204);
    assert.status(await env.call("GET", `/volumes/${vol.id}`), 404, "NOT_FOUND");
    assert.status(await env.call("GET", `/archives/${vol.archiveId}`), 200, null, "хранилище на месте");
  }, { needs: ["deleteVolume"] });

  test("Хранилище: удалить — тома удалены, камеры остаются: основным — следующее, без него запись выключена", async () => {
    const env = await makeEnv();
    const a = localArch || FX.archives.find((x) => x.serverId);
    const other = FX.archives.find((x) => x.id !== a.id);
    const cams = FX.devices.filter((d) => d.type === "camera" && d.archiveId === a.id);
    assert.ok(cams.length >= 2, `камер, которые пишут в «${a.name}»: ${cams.length}`);
    await env.ok("PATCH", `/devices/${cams[0].id}`, { extraArchives: [{ archiveId: other.id, recordMode: "motion", stream: "sub" }] }, v(cams[0]));
    assert.status(await env.call("DELETE", `/archives/${a.id}`, undefined, v(a)), 204);
    const c0 = await env.ok("GET", `/devices/${cams[0].id}`);
    const c1 = await env.ok("GET", `/devices/${cams[1].id}`);
    assert.eq([c0.archiveId, c0.recordMode, c0.stream, c0.extraArchives], [other.id, "motion", "sub", []], "следующее стало основным");
    assert.eq([c1.archiveId, c1.recordMode], [null, "none"], "без хранилищ — не пишет");
    assert.eq((await env.list("/volumes")).filter((x) => x.archiveId === a.id).length, 0, "томов нет");
    assert.eq((await env.list("/devices")).length, FX.devices.length, "камеры на месте");
  });

  test("Проверка подключения: NAS без пользователя и облако без бакета — не подключились", async () => {
    const env = await makeEnv();
    const nas = { name: "\\\\nas\\v", disk: "\\\\nas\\v", sizeBytes: GB };
    assert.eq(await env.ok("POST", "/archives/check", { kind: "network", provider: null, volume: { ...nas, login: "svc" } }), { ok: true, code: null }, "NAS");
    assert.eq(await env.ok("POST", "/archives/check", { kind: "network", provider: null, volume: nas }), { ok: false, code: "CONNECTION_FAILED" }, "NAS без пользователя");
    const bucket = await makeEnv(BUCKET);
    assert.eq((await bucket.ok("POST", "/archives/check", { kind: "network", provider: "s3", volume: { name: "x", disk: "s3", sizeBytes: GB } })).ok, false, "бакета нет");
  });

  test("Операция: план карточек хранилища и тома; хранилище сервера без связи — fail SERVER_OFFLINE", async () => {
    const env = await makeEnv();
    const a = FX.archives.find((x) => x.kind === "network");
    const vol = FX.volumes.find((x) => x.archiveId === a.id);
    const op = await env.runOperation({ idempotencyKey: key(), items: [
      { targetId: a.id, set: { retentionDays: 120 } },
      { targetId: vol.id, set: { sizeBytes: 100 * GB, confirmShrinkBytes: 100 * GB } },
      { targetId: offlineArch.id, set: { retentionDays: 1 } },
    ], expectedVersions: { [a.id]: a.version, [vol.id]: vol.version, [offlineArch.id]: offlineArch.version } });
    assert.eq(op.items.map((x) => [x.state, x.code]), [["ok", null], ["ok", null], ["fail", "SERVER_OFFLINE"]], "по шагам");
    assert.eq((await env.ok("GET", `/volumes/${vol.id}`)).sizeBytes, 100 * GB, "том изменён");
  });

  // Откат: правки хранилищ и томов — в той же стопке, что правки устройств
  const undo = async (env, op) => env.finished((await env.ok("POST", `/operations/${op.id}/revert`)).id);
  // Верхняя в стопке: самая новая строка списка может быть сам откат
  const top = async (env) => (await env.ok("GET", "/operations")).items.find((x) => x.revertible);

  test("Откат: правка хранилища и имени тома — одиночные операции, значения возвращаются", async () => {
    const env = await makeEnv();
    const a = FX.archives.find((x) => x.kind === "network");
    const vol = FX.volumes.find((x) => x.archiveId === a.id);
    await env.ok("PATCH", `/archives/${a.id}`, { retentionDays: 90 }, v(a));
    const opA = await top(env);
    assert.eq([opA.single, opA.revertible, opA.items[0].targetId], [true, true, a.id], "правка хранилища — в стопке");
    await env.ok("PATCH", `/volumes/${vol.id}`, { name: "Том — другое имя" }, v(vol));
    const opV = await top(env);
    assert.eq([opV.single, opV.items[0].targetId], [true, vol.id], "правка тома — в стопке");
    assert.eq((await undo(env, opV)).ok, 1, "имя тома возвращено");
    assert.eq((await env.ok("GET", `/volumes/${vol.id}`)).name, vol.name, "имя как было");
    assert.eq((await undo(env, opA)).ok, 1, "срок возвращён");
    assert.eq((await env.ok("GET", `/archives/${a.id}`)).retentionDays, a.retentionDays, "срок как был");
  });

  test("Откат: адрес и размер тома — шаг fail NOT_SUPPORTED; прочие шаги той же операции идут", async () => {
    const env = await makeEnv();
    const a = FX.archives.find((x) => x.kind === "network");
    const vol = FX.volumes.find((x) => x.archiveId === a.id);
    const op = await env.runOperation({ idempotencyKey: key(), items: [
      { targetId: a.id, set: { retentionDays: 120 } },
      { targetId: vol.id, set: { disk: "\\\\nas99\\vms" } },
      { targetId: vol.id, set: { login: "VMS\\svc9" } },
    ], expectedVersions: { [a.id]: a.version, [vol.id]: vol.version } });
    const back = await undo(env, op);
    assert.eq(back.items.map((x) => [x.state, x.code]), [["ok", null], ["fail", "NOT_SUPPORTED"], ["ok", null]], "по шагам, назад");
    const now = await env.ok("GET", `/volumes/${vol.id}`);
    assert.eq([now.disk, now.login], ["\\\\nas99\\vms", vol.login], "адрес остался, логин вернулся");
    assert.eq((await env.ok("GET", `/archives/${a.id}`)).retentionDays, a.retentionDays, "срок вернулся");
    const big = await env.ok("PATCH", `/volumes/${vol.id}`, { sizeBytes: now.sizeBytes + GB }, { "If-Match": `"${now.version}"` });
    const size = await undo(env, await top(env));
    assert.eq(size.items.map((x) => [x.state, x.code]), [["fail", "NOT_SUPPORTED"]], "размер не возвращается");
    assert.eq((await env.ok("GET", `/volumes/${vol.id}`)).sizeBytes, big.sizeBytes, "размер остался");
  });

  test("Откат: созданное хранилище и том снимаются; с записью камеры или изменённое — NOT_SUPPORTED", async () => {
    const env = await makeEnv();
    const made = await env.ok("POST", "/archives", local());
    const added = await env.ok("POST", `/archives/${made.archive.id}/volumes`, { name: freeDisks[1], disk: freeDisks[1], sizeBytes: GB, mode: "dir", dir: `${freeDisks[1]}\\A` });
    assert.eq((await undo(env, await top(env))).ok, 1, "том снят");
    assert.status(await env.call("GET", `/volumes/${added.id}`), 404, "NOT_FOUND", "тома нет");
    assert.eq((await undo(env, await top(env))).ok, 1, "хранилище снято");
    assert.status(await env.call("GET", `/archives/${made.archive.id}`), 404, "NOT_FOUND", "хранилища нет");
    assert.status(await env.call("GET", `/volumes/${made.volumes[0].id}`), 404, "NOT_FOUND", "и его первого тома");
    // Хранилище, в которое уже пишет камера, откат не снимает: привязка не откатилась — шаг менял пароль
    const second = await env.ok("POST", "/archives", local({ name: "С камерой" }));
    const create = await top(env);
    const cam = FX.devices.find((d) => d.type === "camera" && !d.archiveId && !d.parentId);
    await env.ok("PATCH", `/devices/${cam.id}`, { archiveId: second.archive.id, recordMode: "always", password: "новый" }, v(cam));
    assert.eq((await undo(env, await top(env))).items.map((x) => x.code), ["NOT_SUPPORTED"], "пароль не возвращается");
    assert.eq((await undo(env, create)).items.map((x) => [x.state, x.code]), [["fail", "NOT_SUPPORTED"]], "камера всё ещё пишет туда");
    assert.status(await env.call("GET", `/archives/${second.archive.id}`), 200, null, "хранилище на месте");
    // Созданное меняли: откат правки вернул значение, но запись уже не та, что создана
    const third = await env.ok("POST", "/archives", local({ name: "Третье", firstVolume: { name: freeDisks[2], disk: freeDisks[2], sizeBytes: GB, mode: "dir", dir: `${freeDisks[2]}\\A` } }));
    const make = await top(env);
    await env.ok("PATCH", `/archives/${third.archive.id}`, { retentionDays: 3 }, v(third.archive));
    await undo(env, await top(env));
    assert.eq((await undo(env, make)).items.map((x) => [x.state, x.code]), [["fail", "NOT_SUPPORTED"]], "изменённое не снимается");
  }, { needs: ["createVolume"] });

  test("Откат: удаление хранилища и тома, форматирование — в стопке, шаг fail NOT_SUPPORTED", async () => {
    const env = await makeEnv();
    const vol = FX.volumes.find((x) => x.usedPercent > 0 && x.archiveId !== FX.volumes[0].archiveId);
    await env.ok("POST", `/volumes/${vol.id}/format`);
    assert.eq((await undo(env, await top(env))).items.map((x) => x.code), ["NOT_SUPPORTED"], "записи не возвращаются");
    const a = FX.archives.find((x) => x.kind === "network");
    assert.status(await env.call("DELETE", `/archives/${a.id}`, undefined, v(a)), 204);
    assert.eq((await undo(env, await top(env))).items.map((x) => x.code), ["NOT_SUPPORTED"], "хранилище не возвращается");
  });

  ApiTest.loaded("api-storage.js");
})();
