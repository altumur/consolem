/* Тесты API: «Оборудование» — правка устройства и групповые операции (план карточки и выборки). */
(() => {
  const { test, makeEnv, assert, key, FX } = ApiTest;
  const UNKNOWN = "30009999-0000-4000-8000-000000000000";
  const byName = (name, type) => FX.devices.find((d) => d.name === name && (!type || d.type === type));
  // Камера сервера без связи и камера с превышенной лицензией — из набора (в системе без лицензий её нет)
  const offlineServer = FX.servers.find((s) => !s.online && s.allocated);
  const camOffline = FX.devices.find((d) => d.type === "camera" && d.serverId === offlineServer.id);
  const camLicense = FX.devices.find((d) => d.type === "camera" && d.licenseExceeded);
  const cam = byName("Главный вход", "camera");
  const folderOf = (id) => FX.folders.filter((f) => f.deviceIds.includes(id)).map((f) => f.id);
  const otherFolder = FX.folders.find((f) => f.domainId === cam.domainId && !f.deviceIds.includes(cam.id));
  const plan = (items, versions) => ({ idempotencyKey: key(), items, expectedVersions: versions });

  /* ===== PATCH /devices/{id} — сразу, без очереди (переименование в дереве) ===== */

  test("Устройство: переименовать — 200, версия +1, ETag, изменение в потоке", async () => {
    const env = await makeEnv();
    const seen = [];
    const stop = ApiTest.subscribeForTest((m) => m.entityId === cam.id && seen.push(m.type), [cam.id]);
    await ApiTest.settle();
    const res = await env.call("PATCH", `/devices/${cam.id}`, { name: "Главный вход — новый" }, { "If-Match": await env.etag(`/devices/${cam.id}`) });
    assert.status(res, 200);
    assert.eq(res.body.name, "Главный вход — новый", "имя");
    assert.ok(res.body.version !== cam.version, "версия изменилась");
    assert.eq(res.headers.etag, `"${res.body.version}"`, "ETag — новая версия");
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).name, "Главный вход — новый", "сохранено");
    await ApiTest.settle();
    stop();
    assert.ok(seen.includes("entity.changed"), "в потоке");
  });

  test("Устройство: без If-Match — 428, старая версия — 412 с актуальной записью", async () => {
    const env = await makeEnv();
    assert.status(await env.call("PATCH", `/devices/${cam.id}`, { name: "x" }), 428, "PRECONDITION_REQUIRED");
    const stale = await env.etag(`/devices/${cam.id}`);
    await env.ok("PATCH", `/devices/${cam.id}`, { short: "1a" }, { "If-Match": stale });
    const res = await env.call("PATCH", `/devices/${cam.id}`, { name: "x" }, { "If-Match": stale });
    assert.status(res, 412, "VERSION_MISMATCH");
    assert.eq(res.body.current.short, "1a", "актуальная запись в теле");
    assert.ok(res.body.current.version !== cam.version, "у неё новая версия");
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).name, cam.name, "ничего не изменилось");
  });

  test("Устройство: пустое имя — 422 NAME_REQUIRED; чужое поле или тип — 422 VALIDATION_FAILED; нет устройства — 404", async () => {
    const env = await makeEnv();
    const h = { "If-Match": `"${cam.version}"` };
    assert.status(await env.call("PATCH", `/devices/${cam.id}`, { name: "  " }, h), 422, "NAME_REQUIRED");
    assert.status(await env.call("PATCH", `/devices/${cam.id}`, { colour: "red" }, h), 422, "VALIDATION_FAILED", "поля нет в контракте");
    assert.status(await env.call("PATCH", `/devices/${cam.id}`, { port: "80" }, h), 422, "VALIDATION_FAILED", "строка вместо числа");
    assert.status(await env.call("PATCH", `/devices/${cam.id}`, { recordMode: "forever" }, h), 422, "VALIDATION_FAILED", "не из перечисления");
    assert.status(await env.call("PATCH", `/devices/${cam.id}`, { archiveId: "50009999-0000-4000-8000-000000000000" }, h), 422, "VALIDATION_FAILED", "нет хранилища");
    assert.status(await env.call("PATCH", `/devices/${UNKNOWN}`, { name: "x" }, h), 404, "NOT_FOUND");
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).version, cam.version, "версия не изменилась");
  });

  test("Устройство: null убирает поле; пароль не возвращается, только hasPassword", async () => {
    const env = await makeEnv();
    let d = await env.ok("PATCH", `/devices/${cam.id}`, { identifier: null, login: "admin", password: "s3cret" }, { "If-Match": `"${cam.version}"` });
    assert.ok(!("identifier" in d), "поле убрано");
    assert.eq([d.login, d.hasPassword, "password" in d], ["admin", true, false], "пароль скрыт");
    d = await env.ok("PATCH", `/devices/${cam.id}`, { password: null }, { "If-Match": `"${d.version}"` });
    assert.ok(!d.hasPassword, "пароль снят");
  });

  /* ===== POST /operations — план карточки и выборки ===== */

  test("Операция: план карточки — шаги по одному, итог ok, объект и папки изменены, ход в потоке", async () => {
    const env = await makeEnv();
    const seen = [];
    const stop = ApiTest.subscribeForTest((m) => m.kind === "operation" && seen.push(m.type));
    await ApiTest.settle();
    const folders = folderOf(cam.id).concat(otherFolder.id);
    const res = await env.call("POST", "/operations", plan([
      { targetId: cam.id, set: { name: "Вход — главный" } },
      { targetId: cam.id, set: { recordMode: "motion", preRecordSec: 7 } },
      { targetId: cam.id, folderIds: folders },
    ], { [cam.id]: cam.version }));
    assert.status(res, 202);
    assert.eq([res.body.state, res.body.total, res.body.done], ["running", 3, 0], "принята, ещё не выполнялась");
    if (env.frozen) {
      await env.advance(0);
      assert.eq((await env.ok("GET", `/operations/${res.body.id}`)).done, 0, "часы стоят — шаги ждут");
    }
    const done = await env.finished(res.body.id);
    assert.eq([done.state, done.ok, done.failed, done.items.map((x) => x.state)], ["done", 3, 0, ["ok", "ok", "ok"]], "итог");
    const d = await env.ok("GET", `/devices/${cam.id}`);
    assert.eq([d.name, d.recordMode, d.preRecordSec], ["Вход — главный", "motion", 7], "устройство");
    assert.eq(d.version, done.items[2].version, "версия — та, что дал последний шаг");
    assert.eq((await env.folderIds(otherFolder.id)).slice(-1), [cam.id], "добавлено в папку");
    await ApiTest.settle();
    stop();
    assert.eq([seen.filter((t) => t === "operation.progress").length, seen.filter((t) => t === "operation.finished").length], [3, 1], "ход в потоке");
  });

  test("Операция: версия объекта не та, что в плане — 412, ничего не выполняется; версии нет — 428", async () => {
    const env = await makeEnv();
    const res = await env.call("POST", "/operations", plan([{ targetId: cam.id, set: { name: "x" } }], { [cam.id]: "stale" }));
    assert.status(res, 412, "VERSION_MISMATCH");
    assert.eq(res.body.current.id, cam.id, "актуальная запись в теле");
    assert.status(await env.call("POST", "/operations", plan([{ targetId: cam.id, set: { name: "x" } }], {})), 428, "PRECONDITION_REQUIRED");
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).name, cam.name, "не изменилось");
  });

  test("Операция: шаг с set и folderIds сразу, папка чужого домена, нет устройства — отказ до выполнения", async () => {
    const env = await makeEnv();
    const v = { [cam.id]: cam.version };
    assert.status(await env.call("POST", "/operations", plan([{ targetId: cam.id, set: { name: "x" }, folderIds: [] }], v)), 422, "VALIDATION_FAILED", "оба");
    assert.status(await env.call("POST", "/operations", plan([{ targetId: cam.id }], v)), 422, "VALIDATION_FAILED", "ни одного");
    const alien = FX.folders.find((f) => f.domainId !== cam.domainId);
    if (alien) assert.status(await env.call("POST", "/operations", plan([{ targetId: cam.id, folderIds: [alien.id] }], v)), 422, "VALIDATION_FAILED", "чужой домен");
    assert.status(await env.call("POST", "/operations", plan([{ targetId: UNKNOWN, set: { name: "x" } }], { [UNKNOWN]: "1" })), 404, "NOT_FOUND");
    assert.status(await env.call("POST", "/operations", { idempotencyKey: key(), items: [], expectedVersions: {} }), 422, "VALIDATION_FAILED", "пустой план");
  });

  test("Операция: повтор с тем же idempotencyKey — та же операция, второй раз не выполняется", async () => {
    const env = await makeEnv();
    const body = plan([{ targetId: cam.id, set: { short: "1b" } }], { [cam.id]: cam.version });
    const a = await env.call("POST", "/operations", body);
    const b = await env.call("POST", "/operations", body);
    assert.status(b, 202);
    assert.eq(b.body.id, a.body.id, "та же операция");
    const op = await env.finished(a.body.id);
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).version, op.items[0].version, "изменение одно: версия — та, что дал единственный шаг");
  });

  // Длинная операция: 20 камер на серверах со связью, cam — последним шагом. Пока она идёт, с ней можно
  // делать что угодно и при часах, которые не остановить
  function longPlan() {
    const online = new Set(FX.servers.filter((s) => s.online).map((s) => s.id));
    const cams = FX.devices.filter((d) => d.type === "camera" && d.id !== cam.id && online.has(d.serverId)).slice(0, 19).concat(cam);
    return plan(cams.map((c) => ({ targetId: c.id, set: { short: c.short || "x" } })), Object.fromEntries(cams.map((c) => [c.id, c.version])));
  }

  test("Операция: над объектом уже идёт другая — 409 BUSY", async () => {
    const env = await makeEnv();
    await env.ok("POST", "/operations", longPlan());
    assert.status(await env.call("POST", "/operations", plan([{ targetId: cam.id, set: { short: "1d" } }], { [cam.id]: cam.version })), 409, "BUSY");
  });

  test("Операция: пока идёт, её объекты не меняются и другими запросами — 409 BUSY, в пакетной правке — failed BUSY; после отмены — можно", async () => {
    const env = await makeEnv();
    const res = await env.ok("POST", "/operations", longPlan());
    const free = FX.devices.find((d) => !res.items.some((x) => x.targetId === d.id));
    const h = { "If-Match": `"${cam.version}"` };
    const patch = await env.call("PATCH", `/devices/${cam.id}`, { short: "1h" }, h);
    assert.status(patch, 409, "BUSY", "одиночная правка");
    assert.eq(patch.body.params, { targetId: cam.id }, "какой объект занят");
    assert.status(await env.call("DELETE", `/devices/${cam.id}`, undefined, h), 409, "BUSY", "удаление");
    const batch = await env.ok("POST", "/devices/update", { idempotencyKey: key(), items: [
      { deviceId: cam.id, version: cam.version, set: { short: "1h" } },
      { deviceId: free.id, version: free.version, set: { short: "1i" } },
    ] });
    assert.eq([batch.failed, batch.done.map((d) => [d.id, d.short])], [[{ deviceId: cam.id, code: "BUSY" }], [[free.id, "1i"]]], "занятое — failed, остальное выполнено");
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).short, cam.short, "занятое не изменилось");
    // cam — последний шаг: при любых часах к отмене он ещё ждёт
    const cancelled = await env.ok("POST", `/operations/${res.id}/cancel`);
    assert.eq(cancelled.items[cancelled.items.length - 1].state, "cancel", "шаг cam отменён");
    const d = await env.ok("PATCH", `/devices/${cam.id}`, { short: "1h" }, h);
    assert.eq(d.short, "1h", "после отмены правка проходит");
  });

  test("Операция: папку, в которую ещё не выполненный шаг кладёт объект, удалить нельзя — 409 BUSY; переименовать можно", async () => {
    const env = await makeEnv();
    const dev = await env.ok("GET", `/devices/${cam.id}`);
    const folder = FX.folders.find((f) => f.domainId === dev.domainId && !f.deviceIds.includes(cam.id));
    if (!folder) return;
    const p = longPlan();
    p.items[p.items.length - 1] = { targetId: cam.id, folderIds: [folder.id] };
    const res = await env.ok("POST", "/operations", p);
    const h = { "If-Match": `"${folder.version}"` };
    const del = await env.call("DELETE", `/folders/${folder.id}`, undefined, h);
    assert.status(del, 409, "BUSY", "удаление папки из шага");
    assert.eq(del.body.params, { targetId: folder.id }, "занята сама папка");
    const renamed = await env.ok("PATCH", `/folders/${folder.id}`, { name: folder.name + " 2" }, h);
    assert.eq(renamed.name, folder.name + " 2", "переименование проходит");
    await env.ok("POST", `/operations/${res.id}/cancel`);
    assert.status(await env.call("DELETE", `/folders/${folder.id}`, undefined, { "If-Match": `"${renamed.version}"` }), 204, null, "после отмены — удаляется");
  });

  test("Операция: частичный успех — сервер без связи и превышенная лицензия дают fail с кодом, остальное выполняется", async () => {
    const env = await makeEnv();
    const items = [{ targetId: cam.id, set: { short: "1e" } }, { targetId: camOffline.id, set: { short: "9z" } }];
    const versions = { [cam.id]: cam.version, [camOffline.id]: camOffline.version };
    if (camLicense) {
      const lic = await env.ok("PATCH", `/devices/${camLicense.id}`, { enabled: false }, { "If-Match": `"${camLicense.version}"` });
      items.push({ targetId: camLicense.id, set: { enabled: true } });
      versions[camLicense.id] = lic.version;
    }
    const op = await env.runOperation(plan(items, versions));
    assert.eq(op.items.map((x) => [x.state, x.code]), [["ok", null], ["fail", "SERVER_OFFLINE"]].concat(camLicense ? [["fail", "LICENSE_EXCEEDED"]] : []), "по шагам");
    assert.eq([op.ok, op.failed], [1, items.length - 1], "счётчики");
    assert.eq((await env.ok("GET", `/devices/${camOffline.id}`)).short, camOffline.short, "без связи — не изменилось");
    if (camLicense) assert.eq((await env.ok("GET", `/devices/${camLicense.id}`)).enabled, false, "лицензия — осталось выключенным");
    return camLicense ? "" : "камер с превышенной лицензией в наборе нет";
  });

  test("Операция: пауза — шаги стоят; продолжить — идут; отменить оставшееся — cancel", async () => {
    const env = await makeEnv();
    const res = await env.ok("POST", "/operations", longPlan());
    if (env.frozen) await env.advance(1);
    const paused = await env.ok("POST", `/operations/${res.id}/pause`);
    assert.eq(paused.state, "paused", "пауза");
    await env.wait(env.frozen ? 5 : 1);
    const still = await env.ok("GET", `/operations/${res.id}`);
    assert.eq(still.done, paused.done, "на паузе не выполняется");
    assert.status(await env.call("POST", `/operations/${res.id}/pause`), 409, "BUSY", "уже на паузе");
    assert.eq((await env.ok("POST", `/operations/${res.id}/resume`)).state, "running", "продолжить");
    assert.status(await env.call("POST", `/operations/${res.id}/resume`), 409, "BUSY", "уже идёт");
    // Часы стоят — дать пройти секунде и проверить, что шаги пошли; идут — отменить сразу, пока есть что отменять
    if (env.frozen) await env.advance(1);
    const cancelled = await env.ok("POST", `/operations/${res.id}/cancel`);
    assert.eq(cancelled.state, "done", "завершена");
    assert.ok(cancelled.cancelled > 0 && cancelled.ok >= paused.done && cancelled.ok + cancelled.failed + cancelled.cancelled === cancelled.total, `выполненное осталось, оставшееся отменено: ok ${cancelled.ok}, cancel ${cancelled.cancelled}`);
    if (env.frozen) assert.ok(cancelled.ok > paused.done, "после «продолжить» шаги шли");
    assert.status(await env.call("POST", `/operations/${res.id}/cancel`), 409, "BUSY", "уже завершена");
  });

  test("Операция: «Повторить неудачные» — новая операция только с неудачными шагами", async () => {
    const env = await makeEnv();
    const op = await env.runOperation(plan([
      { targetId: cam.id, set: { short: "1f" } },
      { targetId: camOffline.id, set: { short: "9y" } },
    ], { [cam.id]: cam.version, [camOffline.id]: camOffline.version }));
    const res = await env.call("POST", `/operations/${op.id}/retry-failed`);
    assert.status(res, 202);
    assert.eq([res.body.retryOf, res.body.items.map((x) => x.targetId)], [op.id, [camOffline.id]], "что повторяется");
    assert.eq((await env.finished(res.body.id)).items[0].code, "SERVER_OFFLINE", "сервер всё ещё без связи");
    const clean = await env.runOperation(plan([{ targetId: cam.id, set: { short: "1g" } }], { [cam.id]: (await env.ok("GET", `/devices/${cam.id}`)).version }));
    assert.status(await env.call("POST", `/operations/${clean.id}/retry-failed`), 409, "BUSY", "неудачных нет");
  });

  test("Операция: «Отменить» — объекты возвращаются к «до» обратной операцией, второй раз нельзя", async () => {
    const env = await makeEnv();
    const before = folderOf(cam.id);
    const op = await env.runOperation(plan([
      { targetId: cam.id, set: { name: "Временное имя", recordMode: "motion" } },
      { targetId: cam.id, folderIds: before.concat(otherFolder.id) },
    ], { [cam.id]: cam.version }));
    const res = await env.call("POST", `/operations/${op.id}/revert`);
    assert.status(res, 202);
    assert.eq(res.body.revertOf, op.id, "чья отмена");
    const back = await env.finished(res.body.id);
    assert.eq([back.ok, back.failed], [1, 1], "поля вернулись, папки вне отката");
    assert.eq(back.items.map((x) => x.code), ["NOT_SUPPORTED", null], "шаг папок — fail");
    const d = await env.ok("GET", `/devices/${cam.id}`);
    assert.eq([d.name, d.recordMode], [cam.name, cam.recordMode], "поля вернулись");
    const twice = await env.call("POST", `/operations/${op.id}/revert`);
    assert.status(twice, 409, "NOT_REVERTIBLE", "второй раз");
    assert.eq(twice.body.params.reason, "reverted", "причина");
    assert.status(await env.call("GET", `/operations/${UNKNOWN}`), 404, "NOT_FOUND");
  });

  // Правка сервера в стопку не входит: только так чужая правка остаётся под последней операцией
  const liveServer = () => FX.servers.find((s) => s.online && s.allocated);

  test("Операция: «Отменить» после чужой правки того же поля — шаг отката fail VERSION_MISMATCH, чужое не затирается", async () => {
    const env = await makeEnv();
    const s = liveServer();
    const op = await env.runOperation(plan([{ targetId: s.id, set: { name: "Моё имя" } }], { [s.id]: s.version }));
    await env.ok("PATCH", `/servers/${s.id}`, { name: "Чужое имя" }, { "If-Match": `"${op.items[0].version}"` });
    const res = await env.ok("POST", `/operations/${op.id}/revert`);
    const done = await env.finished(res.id);
    assert.eq(done.items.map((x) => [x.state, x.code]), [["fail", "VERSION_MISMATCH"]], "откат не выполнен");
    assert.eq((await env.ok("GET", `/servers/${s.id}`)).name, "Чужое имя", "чужая правка цела");
  });

  test("Операция: правка другого поля откату не мешает", async () => {
    const env = await makeEnv();
    const s = liveServer();
    const op = await env.runOperation(plan([{ targetId: s.id, set: { name: "Моё имя" } }], { [s.id]: s.version }));
    await env.ok("PATCH", `/servers/${s.id}`, { ip: "10.9.9.9" }, { "If-Match": `"${op.items[0].version}"` });
    const res = await env.ok("POST", `/operations/${op.id}/revert`);
    assert.eq((await env.finished(res.id)).ok, 1, "откат выполнен");
    const now = await env.ok("GET", `/servers/${s.id}`);
    assert.eq([now.name, now.ip], [s.name, "10.9.9.9"], "своё вернулось, чужое цело");
  });

  test("Одиночная правка — операция из одного шага: откат строго по стопке, с верхней", async () => {
    const env = await makeEnv();
    const group = await env.runOperation(plan([{ targetId: cam.id, set: { name: "Групповое" } }], { [cam.id]: cam.version }));
    const one = await env.ok("PATCH", `/devices/${cam.id}`, { name: "Одиночное" }, { "If-Match": `"${group.items[0].version}"` });
    const list = await env.ok("GET", "/operations", undefined);
    assert.eq(list.items[0].single, true, "новая сверху, одиночная");
    assert.eq([list.items[0].total, list.items[0].state, list.items[0].items[0].targetId], [1, "done", cam.id], "форма операции");
    assert.eq(list.items.map((x) => x.revertible), [true, false], "кнопка только у последней");
    // Старшая раньше младшей — отказ целиком, ничего не меняется
    const early = await env.call("POST", `/operations/${group.id}/revert`);
    assert.status(early, 409, "NOT_REVERTIBLE", "младшая не откачена");
    assert.eq(early.body.params.reason, "notLast", "причина");
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).name, one.name, "не тронуто");
    const back = await env.ok("POST", `/operations/${list.items[0].id}/revert`);
    assert.eq((await env.call("POST", `/operations/${group.id}/revert`)).body.params.reason, "notLast", "пока идёт откат, предыдущая ждёт");
    await env.finished(back.id);
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).name, "Групповое", "назад на шаг");
    const after = await env.ok("GET", "/operations");
    assert.eq(after.items.find((x) => x.id === group.id).revertible, true, "после отмены младшей откатывается предыдущая");
    assert.eq(after.items[0].revertOf, list.items[0].id, "откат — строкой списка");
    assert.eq(after.items[0].revertible, false, "откат не откатывается");
    const undo = await env.call("POST", `/operations/${after.items[0].id}/revert`);
    assert.status(undo, 409, "NOT_REVERTIBLE", "откат отката");
    assert.eq(undo.body.params.reason, "isRevert", "причина");
  });

  test("Откат по стопке: новая правка после отмены становится верхней", async () => {
    const env = await makeEnv();
    const a = await env.ok("PATCH", `/devices/${cam.id}`, { name: "Первое" }, { "If-Match": `"${cam.version}"` });
    const first = (await env.ok("GET", "/operations")).items[0];
    const b = await env.ok("PATCH", `/devices/${cam.id}`, { name: "Второе" }, { "If-Match": `"${a.version}"` });
    const second = (await env.ok("GET", "/operations")).items[0];
    await env.finished((await env.ok("POST", `/operations/${second.id}/revert`)).id);
    const c = await env.ok("GET", `/devices/${cam.id}`);
    await env.ok("PATCH", `/devices/${cam.id}`, { name: "Третье" }, { "If-Match": `"${c.version}"` });
    const list = (await env.ok("GET", "/operations")).items;
    assert.eq(list.filter((x) => x.revertible).length, 1, "верхняя одна");
    assert.eq(list[0].revertible, true, "верхняя — новая правка");
    assert.eq((await env.call("POST", `/operations/${first.id}/revert`)).body.params.reason, "notLast", "первая снова под ней");
    assert.eq((await env.call("POST", `/operations/${second.id}/revert`)).body.params.reason, "reverted", "откаченная вне стопки");
    assert.ok(b.version !== c.version, "версии разные");
  });

  test("Откат одиночных правок: создание снимается, удаление и пароль — NOT_SUPPORTED, операции без шагов нет", async () => {
    const env = await makeEnv();
    const c = (await env.list("/devices")).find((d) => d.type === "camera" && d.id !== cam.id);
    await env.ok("PATCH", `/devices/${c.id}`, { password: "новый" }, { "If-Match": `"${c.version}"` });
    const op = (await env.ok("GET", "/operations")).items[0];
    const back = await env.ok("POST", `/operations/${op.id}/revert`);
    assert.eq((await env.finished(back.id)).items[0].code, "NOT_SUPPORTED", "пароль не возвращается");
    const fresh = await env.ok("GET", `/devices/${c.id}`);
    await env.call("DELETE", `/devices/${c.id}`, undefined, { "If-Match": `"${fresh.version}"` });
    const del = (await env.ok("GET", "/operations")).items[0];
    const res = await env.ok("POST", `/operations/${del.id}/revert`);
    assert.eq((await env.finished(res.id)).items[0].code, "NOT_SUPPORTED", "удаление не возвращается");
  });

  // Повтор: как в редакторе. Отменённое — правки имени, новая правка очищает стопку
  const edits = async (env, ...names) => {
    let v = (await env.ok("GET", `/devices/${cam.id}`)).version;
    const out = [];
    for (const name of names) {
      v = (await env.ok("PATCH", `/devices/${cam.id}`, { name }, { "If-Match": `"${v}"` })).version;
      out.push((await env.ok("GET", "/operations")).items[0]);
    }
    return out;
  };
  const undo = async (env, op) => env.finished((await env.ok("POST", `/operations/${op.id}/revert`)).id);
  const redo = async (env, op) => env.finished((await env.ok("POST", `/operations/${op.id}/redo`)).id);
  const nameNow = async (env) => (await env.ok("GET", `/devices/${cam.id}`)).name;

  test("Повтор: после отмены значения возвращаются новой операцией, она снова верхняя и отменяется", async () => {
    const env = await makeEnv();
    const [a] = await edits(env, "Первое");
    assert.eq((await env.call("POST", `/operations/${a.id}/redo`)).body.params.reason, "stale", "не отменялась — повторять нечего");
    await undo(env, a);
    assert.eq(await nameNow(env), cam.name, "отменено");
    const row = (await env.ok("GET", "/operations")).items.find((x) => x.id === a.id);
    assert.eq([row.redoable, row.revertible], [true, false], "у отменённой — только повтор");
    const res = await env.ok("POST", `/operations/${a.id}/redo`);
    assert.eq(res.redoOf, a.id, "чей повтор");
    const done = await env.finished(res.id);
    assert.eq([done.ok, await nameNow(env)], [1, "Первое"], "значение снова то");
    const list = (await env.ok("GET", "/operations")).items;
    assert.eq([list[0].id, list[0].revertible, list[0].redoable], [res.id, true, false], "повтор — верхний в стопке");
    assert.eq(list.find((x) => x.id === a.id).redoable, false, "повторено");
    await undo(env, done);
    assert.eq(await nameNow(env), cam.name, "повтор отменяется как обычная операция");
    await redo(env, done);
    assert.eq(await nameNow(env), "Первое", "и снова повторяется");
  });

  test("Повтор: цепочка — отменили B, затем A, повторяется сначала A, потом B", async () => {
    const env = await makeEnv();
    const [a, b] = await edits(env, "A", "B");
    await undo(env, b);
    await undo(env, a);
    const early = await env.call("POST", `/operations/${b.id}/redo`);
    assert.status(early, 409, "NOT_REVERTIBLE", "B раньше A");
    assert.eq(early.body.params.reason, "notLast", "причина");
    await redo(env, a);
    assert.eq(await nameNow(env), "A", "сначала A");
    await redo(env, b);
    assert.eq(await nameNow(env), "B", "потом B");
  });

  test("Повтор: новая правка очищает его целиком, откат отменённого не очищает", async () => {
    const env = await makeEnv();
    const [a, b] = await edits(env, "A", "B");
    await undo(env, b);
    await undo(env, a);
    await edits(env, "Новая");
    const list = (await env.ok("GET", "/operations")).items;
    assert.eq(list.some((x) => x.redoable), false, "повторять нечего");
    for (const op of [a, b]) assert.eq((await env.call("POST", `/operations/${op.id}/redo`)).body.params.reason, "stale", "очищено");
  });

  test("Повтор: чужая правка поля — шаг fail VERSION_MISMATCH, чужое цело; созданное не создаётся заново; не откатившееся не повторяется", async () => {
    const env = await makeEnv();
    const s = liveServer();
    const op = await env.runOperation(plan([{ targetId: s.id, set: { name: "Моё имя" } }], { [s.id]: s.version }));
    await env.finished((await env.ok("POST", `/operations/${op.id}/revert`)).id);
    const was = await env.ok("GET", `/servers/${s.id}`);
    await env.ok("PATCH", `/servers/${s.id}`, { name: "Чужое имя" }, { "If-Match": `"${was.version}"` });
    const done = await redo(env, op);
    assert.eq(done.items.map((x) => [x.state, x.code]), [["fail", "VERSION_MISMATCH"]], "шаг не выполнен");
    assert.eq((await env.ok("GET", `/servers/${s.id}`)).name, "Чужое имя", "чужая правка цела");
    const c = await env.ok("GET", `/devices/${cam.id}`);
    // Создание с правкой той же камеры: откат создания сверяет созданный детектор, а не камеру — снимается и он
    const made = await env.runOperation(plan([{ targetId: cam.id, create: { type: "det", name: "Новый", detectorKind: "motion", sensitivity: 5 } }, { targetId: cam.id, set: { short: "1z" } }], { [cam.id]: c.version }));
    const back = await undo(env, made);
    assert.eq(back.items.map((x) => [x.state, x.code]), [["ok", null], ["ok", null]], "откатились и поле, и создание");
    assert.status(await env.call("GET", `/devices/${made.items[0].createdId}`), 404, "NOT_FOUND", "детектора нет");
    const again = await redo(env, made);
    assert.eq(again.items.map((x) => [x.state, x.code]), [["fail", "NOT_SUPPORTED"], ["ok", null]], "создание не повторяется, поле повторено");
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).short, "1z", "поле повторено");
    // Созданное меняли после: откат его не снимает, этот шаг и не повторяется
    const c2 = await env.ok("GET", `/devices/${cam.id}`);
    const kept = await env.runOperation(plan([{ targetId: cam.id, create: { type: "det", name: "Живой", detectorKind: "motion", sensitivity: 5 } }, { targetId: cam.id, set: { short: "2z" } }], { [cam.id]: c2.version }));
    const live = kept.items[0].createdId;
    const edited = await env.ok("PATCH", `/devices/${live}`, { name: "Живой-2" }, { "If-Match": `"${(await env.ok("GET", `/devices/${live}`)).version}"` });
    const rename = (await env.ok("GET", "/operations")).items[0];
    assert.eq((await undo(env, rename)).ok, 1, "сначала — правка детектора");
    const part = await undo(env, kept);
    assert.eq(part.items.map((x) => [x.state, x.code]), [["ok", null], ["fail", "NOT_SUPPORTED"]], "поле вернулось, изменённое созданное осталось");
    assert.status(await env.call("GET", `/devices/${live}`), 200, null, "детектор на месте");
    assert.ok(edited.version !== (await env.ok("GET", `/devices/${live}`)).version, "у него своя версия");
    const third = await redo(env, kept);
    assert.eq(third.items.map((x) => [x.state, x.code]), [["ok", null]], "повторён только откатившийся шаг");
    assert.eq((await env.ok("GET", `/devices/${cam.id}`)).short, "2z", "поле повторено");
    // Создание, которое откат снял, заново не создаётся
    const v = (await env.ok("GET", `/devices/${cam.id}`)).version;
    const one = await env.runOperation(plan([{ targetId: cam.id, create: { type: "det", name: "Второй", detectorKind: "motion", sensitivity: 5 } }], { [cam.id]: v }));
    assert.eq((await undo(env, one)).ok, 1, "снято откатом");
    const fresh = await redo(env, one);
    assert.eq(fresh.items.map((x) => [x.state, x.code]), [["fail", "NOT_SUPPORTED"]], "создание не повторяется");
    assert.status(await env.call("GET", `/devices/${one.items[0].createdId}`), 404, "NOT_FOUND", "снятое не вернулось");
  });

  ApiTest.loaded("api-hardware.js");
})();
