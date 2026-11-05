/* Тесты API: выгрузка записей (ADR-0117) — права, сутки с записью, проверка заказа, задание с ходом и итогом, отмена, повтор
   неудачных, ссылка на файл и срок, пределы, кадр, закладка-отрезок. В базе (tests/) таких тестов нет.
   Модель: камера заказа — объект по uid (ExportCamera.uid, ExportPart.uid, ExportFile.uid), вид — с профилем vms.camera/1;
   сутки с записью — предметный путь /units/{uid}/recording-days. Ошибки заказа — с field, JSON Pointer по телу. */
(() => {
  const { test, makeEnv, assert, FX, key } = ApiTest;
  const H = 3600000;
  const iso = (ms) => new Date(ms).toISOString();
  const cams = FX.devices.filter((d) => d.type === "camera" && d.archiveId && d.online && d.serverId);
  const [cam, cam2] = cams;
  const offline = FX.devices.find((d) => d.type === "camera" && d.archiveId && d.online === false);
  const det = FX.devices.find((d) => d.type === "det");
  const url = "https://b/backend/";
  // Шкала стенда — сетка 4 ч: в каждой ячейке запись 3 ч, дальше дыра (api/profiles.js, camSpans). Ячейка 5 — запись
  // целиком, конец ячейки 6 — дыра без записи
  const grid = (env) => Math.floor(env.now / (4 * H)) * 4 * H;
  const full = (env) => ({ from: iso(grid(env) - 20 * H + 10 * 60000), to: iso(grid(env) - 20 * H + 40 * 60000) });
  const gap = (env) => ({ from: iso(grid(env) - 21 * H + 5 * 60000), to: iso(grid(env) - 20 * H - 5 * 60000) });
  const half = (env) => ({ from: iso(grid(env) - 20 * H - 30 * 60000), to: iso(grid(env) - 20 * H + 30 * 60000) });
  const video = (env, over) => Object.assign({ mode: "video", cameras: [{ uid: cam.id }], periods: [full(env)], format: "mkv" }, over);
  const errs = (check) => check.errors.map((e) => [e.code, e.field]);
  const refused = (r, status, code, field, msg) => {
    assert.status(r, status, code, msg);
    assert.eq(r.body.field, field, `${msg}: field`);
  };
  const done = (env, id) => env.until(async () => {
    const x = await env.ok("GET", `/exports/${id}`);
    return x.state !== "queued" && x.state !== "running" && x;
  }, `выгрузка ${id} закончилась`);

  test("Права на выгрузку: GET /me/export по uid — камера, детектор, камера без связи; запрет — allowed: false; ids сверх idsMax — 422", async () => {
    const env = await makeEnv();
    const ids = [cam.id, det.id].concat(offline ? [offline.id] : []);
    const g = await env.ok("GET", `/me/export?ids=${ids.join(",")}`);
    assert.ok(g.allowed && !g.passwordRequired && !g.privacyForced, "по умолчанию можно, без пароля");
    assert.eq(g.devices.map((d) => d.uid), ids, "по uid, в порядке ids");
    assert.ok(!g.devices.some((d) => "deviceId" in d), "deviceId нет: uid");
    assert.eq([g.devices[0].archive, g.devices[0].live], [true, true], "камера на связи");
    assert.eq([g.devices[1].archive, g.devices[1].live], [false, false], "детектор — не камера");
    if (offline) assert.eq([g.devices[2].archive, g.devices[2].live], [true, false], "без связи — только запись");
    const no = await (await makeEnv({ fixturePatch: { stand: { exportGrant: { allowed: false, passwordRequired: true } } } })).ok("GET", `/me/export?ids=${cam.id}`);
    assert.ok(!no.allowed && no.passwordRequired && !no.devices[0].archive, "запрет и пароль по политике");
    const many = Array.from({ length: (FX.reference.limits.idsMax || 200) + 1 }, () => cam.id).join(",");
    assert.status(await env.call("GET", `/me/export?ids=${many}`), 422, "VALIDATION_FAILED");
    const ref = (await env.ok("GET", "/reference")).export;
    assert.ok(ref && ref.formats.some((f) => f.id === "mkv") && ref.limits.maxCameras > 0, "справочник выгрузки");
  }, { needs: ["getExportGrant", "getReference"] });

  test("Сутки с записью: /units/{uid}/recording-days — 31 сутки, окно дат; не камера — /kind; нет объекта — 404; конец раньше начала — /to", async () => {
    const env = await makeEnv();
    const r = await env.ok("GET", `/units/${cam.id}/recording-days`);
    assert.eq(r.days.length, 31, "последние 31 сутки");
    assert.ok(r.days[r.days.length - 1].recorded && !r.days[0].recorded, "свежие сутки с записью, месяц назад — без");
    assert.eq(r.unavailable, [], "всё ответило");
    const w = await env.ok("GET", `/units/${cam.id}/recording-days?from=2026-10-01&to=2026-10-03`);
    assert.eq(w.days.map((d) => d.date), ["2026-10-01", "2026-10-02", "2026-10-03"], "окно дат");
    refused(await env.call("GET", `/units/${det.id}/recording-days`), 422, "NOT_SUPPORTED", "/kind", "детектор без vms.camera/1");
    assert.status(await env.call("GET", "/units/00000000-0000-4000-8000-000000000000/recording-days"), 404, "NOT_FOUND");
    refused(await env.call("GET", `/units/${cam.id}/recording-days?from=2026-10-03&to=2026-10-01`), 422, "VALIDATION_FAILED", "/to", "конец раньше начала");
    refused(await env.call("GET", `/units/${cam.id}/recording-days?from=2024-01-01&to=2026-10-01`), 422, "VALIDATION_FAILED", "/from", "больше года");
  }, { needs: ["getUnitRecordingDays", "implements:vms.camera/1"] });

  test("Проверка заказа: ok, имена файлов по uid; ошибки у полей указателем — отрезок, область, формат, кодек, не камера, нет объекта, без записи, пароль", async () => {
    const env = await makeEnv();
    const ok = await env.ok("POST", "/exports/check", video(env));
    assert.ok(ok.ok && !ok.errors.length && ok.transcode === false, "заказ пройдёт без перекодирования");
    assert.eq(ok.files.length, 1, "файл на камеру");
    assert.eq(ok.files[0].uid, cam.id, "файл — по uid камеры");
    assert.ok(/\.mkv$/.test(ok.files[0].name) && ok.estimate.bytes > 0, "имя и оценка");
    assert.eq(ok.noRecording, [], "запись есть");
    const p = await env.ok("POST", "/exports/check", video(env, { periods: [full(env), gap(env)] }));
    assert.eq(errs(p), [["NO_RECORDING", "/periods/1"]], "второй отрезок без записи");
    assert.eq(p.noRecording, [{ camera: 0, period: 1 }], "номера в заказе");
    const bad = await env.ok("POST", "/exports/check", video(env, { cameras: [{ uid: cam.id, area: { x: 0.5, y: 0, w: 0.6, h: 1 } }], periods: [{ from: full(env).to, to: full(env).from }] }));
    assert.eq(errs(bad), [["VALIDATION_FAILED", "/cameras/0/area"], ["VALIDATION_FAILED", "/periods/0/to"]], "область за кадром, конец раньше начала");
    assert.eq(errs(await env.ok("POST", "/exports/check", video(env, { format: "jpg" }))), [["NOT_SUPPORTED", "/format"]], "кадровый формат у видео");
    const tr = await env.ok("POST", "/exports/check", video(env, { quality: { codec: "h264" } }));
    assert.ok(tr.ok && tr.transcode, "кодек не source — перекодирование");
    assert.eq(errs(await env.ok("POST", "/exports/check", video(env, { quality: { codec: "vp9" } }))), [["NOT_SUPPORTED", "/quality/codec"]], "кодека нет у формата");
    const notCam = await env.ok("POST", "/exports/check", video(env, { cameras: [{ uid: det.id }] }));
    assert.eq(errs(notCam), [["NOT_SUPPORTED", "/cameras/0"]], "детектор — не камера");
    assert.eq(notCam.errors[0].params.profile, "vms.camera/1", "чего не хватает виду");
    assert.eq(errs(await env.ok("POST", "/exports/check", video(env, { cameras: [{ uid: "00000000-0000-4000-8000-000000000000" }] }))), [["NOT_FOUND", "/cameras/0"]], "нет объекта");
    // Тело не по схеме: камера — uid, deviceId базы — 422 с указателем
    const old = await env.call("POST", "/exports/check", video(env, { cameras: [{ deviceId: cam.id }] }));
    assert.status(old, 422, "VALIDATION_FAILED", "deviceId вместо uid");
    assert.ok(String(old.body.field).startsWith("/cameras/0"), `указатель на камеру: ${old.body.field}`);
    const pw = await (await makeEnv({ fixturePatch: { stand: { exportGrant: { passwordRequired: true } } } })).ok("POST", "/exports/check", video(env));
    assert.eq(errs(pw), [["PASSWORD_REQUIRED", "/password"]], "пароль по политике");
  }, { needs: ["checkExport", "feature:exportVideo", "feature:exportArea", "feature:exportTranscode"] });

  test("Выгрузка: 202 и задание по uid, ход export.progress, итог export.finished, файл, ссылка; повтор ключа — то же задание; срок — expired и 410", async () => {
    const env = await makeEnv();
    const got = [];
    const stop = ApiTest.subscribeForTest((m) => m.kind === "exportJob" && got.push(m));
    await ApiTest.settle();
    const body = video(env, { idempotencyKey: key(), password: "секрет-1", comment: "для суда" });
    const r = await env.call("POST", "/exports", body);
    assert.status(r, 202);
    const x = r.body;
    assert.eq(r.headers.location, `/exports/${x.id}`, "Location");
    assert.eq(x.state, "queued", "в очереди");
    assert.eq(x.parts.map((p) => [p.uid, p.state]), [[cam.id, "wait"]], "часть — по uid камеры");
    assert.ok(!("password" in x.request) && !("idempotencyKey" in x.request) && x.request.comment === "для суда", "пароля в задании нет");
    assert.eq((await env.ok("POST", "/exports", body)).id, x.id, "повтор ключа — то же задание");
    const end = await done(env, x.id);
    assert.eq(end.state, "done", "готово");
    assert.eq([end.parts[0].state, end.parts[0].percent, end.progress.percent], ["ok", 100, 100], "часть и ход");
    assert.eq(end.files.length, 1, "файл");
    assert.eq(end.files[0].uid, cam.id, "файл — по uid камеры");
    assert.ok(/\.zip$/.test(end.files[0].name) && end.files[0].mediaType === "application/zip" && end.files[0].sizeBytes > 0, "с паролем — zip");
    await ApiTest.settle();
    stop();
    assert.ok(got.some((m) => m.type === "export.progress" && m.entityId === x.id && m.payload.parts[0].uid === cam.id), "ход потоком");
    const fin = got.find((m) => m.type === "export.finished" && m.entityId === x.id);
    assert.ok(fin && fin.payload.state === "done" && fin.payload.files.length === 1, "итог потоком");
    assert.ok(got.some((m) => m.type === "entity.created" && m.entityId === x.id), "создано");
    assert.ok((await env.list("/exports?mine=true")).some((e) => e.id === x.id), "в своих");
    assert.eq((await env.list("/exports?state=running,queued")).length, 0, "идущих нет");
    const link = await env.ok("POST", `/exports/${x.id}/files/${end.files[0].id}/link`);
    assert.ok(link.url.startsWith("stub://") && Date.parse(link.expiresAt) > env.now, "ссылка со сроком");
    assert.status(await env.call("POST", `/exports/${x.id}/files/нет/link`), 404, "NOT_FOUND");
    // Срок файлов — сутки: дождаться его можно только на остановленных часах
    if (!env.frozen) return;
    await env.advance((FX.reference.export.limits.keepSec || 86400) + 1);
    const gone = await env.ok("GET", `/exports/${x.id}`);
    assert.eq([gone.state, gone.files], ["expired", []], "файлы удалены по сроку");
    assert.status(await env.call("POST", `/exports/${x.id}/files/${end.files[0].id}/link`), 410, "EXPORT_EXPIRED");
  }, { needs: ["createExport", "getExport", "listExports", "getExportFileLink", "feature:exportVideo", "feature:exportPassword"] });

  test("Отмена и повтор неудачных: частичный успех, retry-failed — новое задание с retryOf по неудачным камерам; cancel — cancelled, повтор — 409", async () => {
    const env = await makeEnv({ fixturePatch: { stand: { exportFail: { [cam2.id]: "unreachable" } } } });
    const x = await env.ok("POST", "/exports", video(env, { cameras: [{ uid: cam.id }, { uid: cam2.id }] }));
    const end = await done(env, x.id);
    assert.eq(end.state, "done", "частичный успех — готово");
    assert.eq(end.parts.map((p) => [p.uid, p.state, p.code]), [[cam.id, "ok", undefined], [cam2.id, "fail", "unreachable"]], "части по камерам");
    assert.eq(end.files.map((f) => f.uid), [cam.id], "файл — только удачной");
    const again = await env.call("POST", `/exports/${x.id}/retry-failed`, {});
    assert.status(again, 202);
    assert.eq([again.body.retryOf, again.body.request.cameras.map((c) => c.uid)], [x.id, [cam2.id]], "повтор — неудачная камера");
    assert.status(await env.call("POST", `/exports/${again.body.id}/retry-failed`, {}), 409, "NOT_RUNNABLE", "идущее не повторяется");
    const all = await done(env, again.body.id);
    assert.eq(all.state, "failed", "ни одна часть не вышла");
    const ok = await env.ok("POST", "/exports", video(env));
    await done(env, ok.id);
    assert.status(await env.call("POST", `/exports/${ok.id}/retry-failed`, {}), 409, "NOT_RUNNABLE", "неудачных нет");
    const run = await env.ok("POST", "/exports", video(env));
    const c = await env.ok("POST", `/exports/${run.id}/cancel`);
    assert.eq([c.state, c.files, c.parts[0].state], ["cancelled", [], "cancel"], "отменено");
    assert.status(await env.call("POST", `/exports/${run.id}/cancel`), 409, "NOT_RUNNABLE");
    assert.status(await env.call("POST", "/exports/00000000-0000-4000-8000-000000000000/cancel"), 404, "NOT_FOUND");
    const r = await env.call("POST", `/exports/${run.id}/retry-failed`, {});
    assert.status(r, 202, null, "отменённое повторяется");
  }, { needs: ["createExport", "cancelExport", "retryExport", "getExport", "feature:exportMultiCamera"] });

  test("Удаление, пределы и права: DELETE — 204, потом 404; камер сверх maxCameras — LIMIT_EXCEEDED; активных сверх предела — 409 BUSY; запрет — 403 с указателем; без записи — NO_RECORDING", async () => {
    const env = await makeEnv();
    const x = await env.ok("POST", "/exports", video(env));
    assert.status(await env.call("DELETE", `/exports/${x.id}`), 204);
    assert.status(await env.call("GET", `/exports/${x.id}`), 404, "NOT_FOUND");
    assert.status(await env.call("DELETE", `/exports/${x.id}`), 404, "NOT_FOUND");
    const L = FX.reference.export.limits;
    const many = await env.call("POST", "/exports", video(env, { cameras: Array.from({ length: L.maxCameras + 1 }, () => ({ uid: cam.id })) }));
    refused(many, 422, "LIMIT_EXCEEDED", "/cameras", "камер сверх предела");
    assert.eq(many.body.params, { limit: "maxCameras", max: L.maxCameras }, "какой предел");
    refused(await env.call("POST", "/exports", video(env, { periods: [gap(env)] })), 422, "NO_RECORDING", "/periods/0", "без записи");
    refused(await env.call("POST", "/exports", video(env, { cameras: [{ uid: det.id }] })), 422, "NOT_SUPPORTED", "/cameras/0", "не камера");
    for (let i = 0; i < L.maxActivePerUser; i++) await env.ok("POST", "/exports", video(env));
    const busy = await env.call("POST", "/exports", video(env));
    assert.status(busy, 409, "BUSY");
    assert.eq(busy.body.params.max, L.maxActivePerUser, "предел активных");
    refused(await (await makeEnv({ fixturePatch: { stand: { exportDenied: [cam.id] } } })).call("POST", "/exports", video(env)), 403, "PERMISSION_DENIED", "/cameras/0", "нет права на камеру");
    assert.status(await (await makeEnv({ fixturePatch: { stand: { exportGrant: { allowed: false } } } })).call("POST", "/exports", video(env)), 403, "PERMISSION_DENIED", "нет права на выгрузку");
    const far = await (await makeEnv({ fixturePatch: { stand: { otherCluster: { [cam.id]: url } } } })).call("POST", "/exports", video(env));
    refused(far, 409, "OTHER_CLUSTER", "/cameras/0", "другой кластер");
    assert.eq(far.body.params.url, url, "ссылка");
    refused(await (await makeEnv({ fixturePatch: { stand: { exportGrant: { passwordRequired: true } } } })).call("POST", "/exports", video(env)), 422, "PASSWORD_REQUIRED", "/password", "пароль по политике");
  }, { needs: ["createExport", "deleteExport", "getExport", "feature:exportVideo"] });

  test("Кадр: из архива в момент at — jpg; живой — с камеры на связи, без связи — 409 DEVICE_OFFLINE; кадр — одной камеры; отрезок с дырой — partial", async () => {
    const env = await makeEnv();
    const at = full(env).from;
    const f = await env.ok("POST", "/exports", { mode: "frame", cameras: [{ uid: cam.id }], at, format: "jpg" });
    assert.eq(Date.parse(f.parts[0].at), Date.parse(at), "момент части");
    const fe = await done(env, f.id);
    assert.eq([fe.state, fe.files[0].mediaType, fe.files[0].uid], ["done", "image/jpeg", cam.id], "кадр готов");
    refused(await env.call("POST", "/exports", { mode: "frame", cameras: [{ uid: cam.id }], at: gap(env).from, format: "jpg" }), 422, "NO_RECORDING", "/at", "в момент записи нет");
    const two = await env.call("POST", "/exports", { mode: "frame", cameras: [{ uid: cam.id }, { uid: cam2.id }], at, format: "jpg" });
    assert.status(two, 422, "NOT_SUPPORTED", "кадр — одной камеры");
    const live = await env.ok("POST", "/exports", { mode: "frame", source: "live", cameras: [{ uid: cam.id }], format: "jpg" });
    assert.eq((await done(env, live.id)).state, "done", "живой кадр");
    if (offline) refused(await env.call("POST", "/exports", { mode: "frame", source: "live", cameras: [{ uid: offline.id }], format: "jpg" }), 409, "DEVICE_OFFLINE", "/cameras/0", "без связи");
    const h = await done(env, (await env.ok("POST", "/exports", video(env, { periods: [half(env)] }))).id);
    assert.eq([h.state, h.parts[0].partial], ["done", true], "отдано то, что есть");
  }, { needs: ["createExport", "getExport", "feature:exportFrame", "feature:exportLiveFrame"] });

  test("Закладка — момент или отрезок: type, to; у отрезка to позже occurred, иначе 422 /to; to у момента — 422; отрезок в окне по пересечению", async () => {
    const env = await makeEnv();
    const U = `/units/${cam.id}/bookmarks`;
    const m = await env.ok("POST", U, { note: "момент", occurred: "2026-10-01T10:00:00Z" });
    assert.eq([m.type, "to" in m], ["moment", false], "нет type — момент");
    const s = await env.call("POST", U, { note: "отрезок", type: "span", occurred: "2026-10-01T08:00:00Z", to: "2026-10-01T09:30:00Z" });
    assert.status(s, 201);
    assert.eq([s.body.type, s.body.to], ["span", "2026-10-01T09:30:00Z"], "отрезок");
    refused(await env.call("POST", U, { note: "x", type: "span", occurred: "2026-10-01T08:00:00Z", to: "2026-10-01T07:00:00Z" }), 422, "VALIDATION_FAILED", "/to", "конец раньше начала");
    refused(await env.call("POST", U, { note: "x", type: "span", occurred: "2026-10-01T08:00:00Z" }), 422, "VALIDATION_FAILED", "/to", "отрезок без конца");
    refused(await env.call("POST", U, { note: "x", to: "2026-10-01T09:00:00Z" }), 422, "VALIDATION_FAILED", "/to", "конец у момента");
    const w = await env.ok("GET", `${U}?from=2026-10-01T09:00:00Z&to=2026-10-01T09:10:00Z`);
    assert.eq(w.items.map((x) => x.note), ["отрезок"], "отрезок пересекает окно, момент — нет");
    assert.ok((await env.list(U)).every((x) => x.type === "moment" || x.type === "span"), "у каждой — тип");
  }, { needs: ["createUnitBookmark", "listUnitBookmarks"] });

  // Чужое задание: в наборе его нет, поэтому кладём в стенд готовое, от другого администратора
  const foreign = (env) => {
    const other = FX.access.users.find((u) => u.id !== FX.me.userId && u.enabled);
    const at = full(env);
    return {
      id: "0b6d0c0e-1111-4222-8333-444455556666", state: "done", createdAt: at.from, by: other.login,
      progress: { percent: 100, done: 1, total: 1 },
      parts: [{ uid: cam.id, state: "fail", percent: 0, code: "unreachable", from: at.from, to: at.to }],
      files: [{ id: "f1", uid: cam.id, name: "чужой.mkv", mediaType: "video/x-matroska", sizeBytes: 10, expiresAt: iso(env.now + 86400000) }],
      request: { mode: "video", cameras: [{ uid: cam.id }], periods: [at], format: "mkv" },
      enforced: { privacy: false, watermark: false, password: false }, transcode: false,
    };
  };

  test("Чужое задание: удаление, отмена, повтор неудачных и ссылка на файл — только автору, иначе 403 PERMISSION_DENIED; читать можно", async () => {
    const probe = await makeEnv();
    const env = await makeEnv({ fixturePatch: { exports: [foreign(probe)] } });
    const id = foreign(probe).id;
    assert.eq((await env.ok("GET", `/exports/${id}`)).id, id, "читать чужое можно");
    assert.status(await env.call("DELETE", `/exports/${id}`), 403, "PERMISSION_DENIED", "удаляет автор");
    assert.status(await env.call("POST", `/exports/${id}/cancel`), 403, "PERMISSION_DENIED", "отменяет автор");
    assert.status(await env.call("POST", `/exports/${id}/retry-failed`, {}), 403, "PERMISSION_DENIED", "повторяет автор");
    assert.status(await env.call("POST", `/exports/${id}/files/f1/link`), 403, "PERMISSION_DENIED", "файл получает автор");
    assert.eq((await env.ok("GET", `/exports/${id}`)).id, id, "задание на месте");
  }, { needs: ["getExport", "deleteExport", "cancelExport", "retryExport", "getExportFileLink"] });

  test("«В один файл»: несколько камер — один файл без uid; одна камера — файл с uid", async () => {
    const env = await makeEnv();
    const x = await env.ok("POST", "/exports", video(env, { cameras: [{ uid: cam.id }, { uid: cam2.id }], singleFile: true, name: "общий" }));
    const end = await done(env, x.id);
    assert.eq(end.state, "done", "готово");
    assert.eq(end.files.length, 1, "один файл на всех");
    assert.ok(!("uid" in end.files[0]), "у общего файла камеры нет");
    assert.ok(/^общий\[.*\]\.mkv$/.test(end.files[0].name), `имя по заказу: ${end.files[0].name}`);
    const one = await done(env, (await env.ok("POST", "/exports", video(env, { singleFile: true }))).id);
    assert.eq(one.files.map((f) => f.uid), [cam.id], "с одной камерой «в один файл» ничего не меняет");
  }, { needs: ["createExport", "getExport", "feature:exportVideo", "feature:exportMultiCamera", "feature:exportSingleFile"] });

  test("Повтор неудачных с паролем: пароль по политике в задании не хранится — без него 422 /password, с ним 202; отказ политики — 403 с текстом", async () => {
    const env = await makeEnv({ fixturePatch: { stand: { exportFail: { [cam2.id]: "unreachable" }, exportGrant: { passwordRequired: true } } } });
    const x = await env.ok("POST", "/exports", video(env, { cameras: [{ uid: cam.id }, { uid: cam2.id }], password: "секрет-1" }));
    const end = await done(env, x.id);
    assert.eq(end.parts.map((p) => p.state), ["ok", "fail"], "вторая камера не вышла");
    assert.ok(end.enforced.password && !("password" in end.request), "пароль по политике, самого пароля в задании нет");
    refused(await env.call("POST", `/exports/${x.id}/retry-failed`, {}), 422, "PASSWORD_REQUIRED", "/password", "без пароля");
    const again = await env.call("POST", `/exports/${x.id}/retry-failed`, { password: "секрет-2" });
    assert.status(again, 202);
    assert.eq([again.body.retryOf, again.body.request.cameras.map((c) => c.uid)], [x.id, [cam2.id]], "повтор — неудачная камера");
    assert.ok(!("password" in again.body.request), "пароля в новом задании нет");
  }, { needs: ["createExport", "retryExport", "getExport", "feature:exportMultiCamera", "feature:exportPassword"] });

  test("Отказ политики: exportGrant.refusal — 403 с его текстом, в проверке заказа и при создании; камеры и поля не названы", async () => {
    const msg = "Выгрузка запрещена политикой смены";
    const env = await makeEnv({ fixturePatch: { stand: { exportGrant: { refusal: msg } } } });
    const r = await env.call("POST", "/exports", video(env));
    assert.status(r, 403, "PERMISSION_DENIED");
    assert.eq(r.body.message, msg, "текст отказа");
    assert.ok(!r.body.field, "без указателя");
    const chk = await env.ok("POST", "/exports/check", video(env));
    assert.ok(chk.errors.some((e) => e.code === "PERMISSION_DENIED" && e.message === msg), "в проверке тот же отказ");
  }, { needs: ["createExport", "checkExport", "feature:exportVideo"] });

  ApiTest.loaded("api-export.js");
})();
