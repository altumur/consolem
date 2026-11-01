/* Тесты API: виды хранилищ от сервера, архив на весь сервер, запись камеры по виду, том. */
(() => {
  const { test, makeEnv, assert, key, FX } = ApiTest;
  const GB = 1024 ** 3;
  const v = (rec) => ({ "If-Match": `"${rec.version}"` });
  const of = (kind) => FX.archives.find((a) => a.kind === kind);
  const edge = of("edge");
  const backup = of("backup");
  const incidents = of("incidents");
  const closed = FX.archives.find((a) => a.admits === false && a.kind !== "incidents") || null;
  const local = FX.archives.find((a) => a.kind === "local" && a.serverId === backup.serverId);
  const camOn = (sid) => FX.devices.find((d) => d.type === "camera" && d.serverId === sid && !d.extraArchives);
  const cam = camOn(backup.serverId);
  const edgeCam = camOn(edge.serverId);
  const emptySrv = FX.servers.find((s) => s.allocated && s.online && !FX.archives.some((a) => a.kind === "edge" && a.serverId === s.id) && s.disks.some((d) => !d.system && !FX.volumes.some((x) => x.disk === d.disk && FX.archives.some((a) => a.id === x.archiveId && a.serverId === s.id))));
  const freeDisk = (s) => s.disks.find((d) => !d.system && !FX.volumes.some((x) => x.disk === d.disk && FX.archives.some((a) => a.id === x.archiveId && a.serverId === s.id))).disk;
  const body = (over) => ({ name: "Карта", kind: "edge", storage: "block", encrypted: false, retentionDays: 3, provider: null, serverId: emptySrv.id, domainId: null,
    firstVolume: { name: "D", disk: freeDisk(emptySrv), sizeBytes: 64 * GB, mode: "dir", dir: "D:\\Edge" }, ...over });
  const field = (res, code, name, msg) => { assert.status(res, 422, code, msg); assert.eq(res.body.field, name, `${msg}: поле`); };

  test("Виды: справочник — объекты; вид вне списка — 422 NOT_SUPPORTED, field: kind", async () => {
    const env = await makeEnv();
    const ref = await env.ok("GET", "/reference");
    assert.ok(ref.archiveKinds.every((k) => typeof k === "object" && Array.isArray(k.recordModes) && Array.isArray(k.archiveModes)), "объекты");
    assert.ok(["local", "remote", "backup", "edge", "incidents"].every((k) => ref.archiveKinds.some((x) => x.kind === k)), "наши виды");
    assert.ok(ref.recordModes.includes("backup"), "значение backup в reference.recordModes");
    field(await env.call("POST", "/archives", body({ kind: "tape" })), "NOT_SUPPORTED", "kind", "вид вне списка");
    field(await env.call("POST", "/archives/check", { kind: "tape", provider: null, volume: { name: "x", disk: "x", sizeBytes: GB } }), "NOT_SUPPORTED", "kind", "проверка вида вне списка");
    field(await env.call("POST", "/archives/check", { kind: "edge", provider: null, volume: { name: "x", disk: "D:", sizeBytes: GB } }), "NOT_SUPPORTED", "kind", "у edge проверки нет");
  });

  test("Карта сервера: сервер обязателен, одна на сервер, режим из archiveModes, шифрования нет", async () => {
    const env = await makeEnv();
    field(await env.call("POST", "/archives", body({ serverId: null, domainId: FX.domains[0].id })), "VALIDATION_FAILED", "serverId", "без сервера");
    field(await env.call("POST", "/archives", body({ recordMode: "motion" })), "VALIDATION_FAILED", "recordMode", "значения нет в схеме");
    field(await env.call("POST", "/archives", body({ encrypted: true })), "NOT_SUPPORTED", "encrypted", "шифрования нет");
    const made = await env.ok("POST", "/archives", body());
    assert.eq(made.archive.recordMode, "backup", "по умолчанию — при сбое");
    field(await env.call("POST", "/archives", body({ firstVolume: { ...body().firstVolume, dir: "D:\\Edge2" } })), "VALIDATION_FAILED", "serverId", "вторая на сервере");
    const local2 = await env.ok("PATCH", `/archives/${made.archive.id}`, { recordMode: "always" }, v(made.archive));
    assert.eq(local2.recordMode, "always", "режим правится");
    const a = FX.archives.find((x) => x.kind === "local");
    field(await env.call("PATCH", `/archives/${a.id}`, { recordMode: "always" }, v(a)), "NOT_SUPPORTED", "recordMode", "у локального поля нет");
  });

  test("Карта сервера: строка у всех камер сервера только для чтения, запись — отказ, правка и удаление меняют камеры", async () => {
    const env = await makeEnv();
    const c = await env.ok("GET", `/devices/${edgeCam.id}`);
    const row = (c.extraArchives || []).find((x) => x.archiveId === edge.id);
    assert.eq([row.recordMode, row.readOnly], ["backup", true], "строка");
    assert.ok(!(await env.ok("GET", `/devices/${cam.id}`)).extraArchives, "у камеры другого сервера строки нет");
    field(await env.call("PATCH", `/devices/${c.id}`, { extraArchives: [{ archiveId: edge.id, recordMode: "backup", stream: "main" }] }, v(c)), "NOT_SUPPORTED", "extraArchives", "строку не посылают");
    await env.ok("PATCH", `/archives/${edge.id}`, { recordMode: "always" }, v(edge));
    const c2 = await env.ok("GET", `/devices/${c.id}`);
    assert.eq(c2.extraArchives.find((x) => x.archiveId === edge.id).recordMode, "always", "строка показывает режим архива");
    assert.ok(c2.version !== c.version, "видимое изменилось — версия тоже");
    const fresh = await env.ok("GET", `/archives/${edge.id}`);
    assert.status(await env.call("DELETE", `/archives/${edge.id}`, undefined, v(fresh)), 204);
    assert.ok(!((await env.ok("GET", `/devices/${c.id}`)).extraArchives || []).some((x) => x.archiveId === edge.id), "архив снят — строки нет");
  });

  test("Запись камеры по виду: backup — только дополнительный на виде backup, инциденты не привязываются", async () => {
    const env = await makeEnv();
    const c = await env.ok("GET", `/devices/${cam.id}`);
    field(await env.call("PATCH", `/devices/${c.id}`, { recordMode: "backup" }, v(c)), "NOT_SUPPORTED", "recordMode", "основная не бывает backup");
    field(await env.call("PATCH", `/devices/${c.id}`, { archiveId: backup.id, recordMode: "always" }, v(c)), "NOT_SUPPORTED", "archiveId", "архив резерва основным не бывает");
    field(await env.call("PATCH", `/devices/${c.id}`, { extraArchives: [{ archiveId: backup.id, recordMode: "always", stream: "main" }] }, v(c)), "NOT_SUPPORTED", "recordMode", "на архиве резерва только backup");
    field(await env.call("PATCH", `/devices/${c.id}`, { extraArchives: [{ archiveId: local.id, recordMode: "backup", stream: "main" }] }, v(c)), "NOT_SUPPORTED", "recordMode", "backup — только на виде backup");
    field(await env.call("PATCH", `/devices/${c.id}`, { extraArchives: [{ archiveId: incidents.id, recordMode: "always", stream: "main" }] }, v(c)), "NOT_SUPPORTED", "extraArchives", "инциденты");
    const ok = await env.ok("PATCH", `/devices/${c.id}`, { extraArchives: [{ archiveId: backup.id, recordMode: "backup", stream: "main" }] }, v(c));
    assert.eq(ok.extraArchives.map((x) => [x.archiveId, x.recordMode]), [[backup.id, "backup"]], "резерв записан");
  });

  test("Создание камеры: те же правила записи", async () => {
    const env = await makeEnv();
    const device = { type: "camera", name: "Новая", vendor: "Axis", model: "M3106", archiveId: backup.id, recordMode: "backup" };
    const res = await env.ok("POST", "/devices", { idempotencyKey: key(), items: [{ device, domainId: FX.domains[0].id, parentId: null, folderId: null }] });
    assert.eq([res.done.length, res.failed.map((f) => [f.code, f.field])], [0, [["NOT_SUPPORTED", "recordMode"]]], "отказ по строке");
  });

  test("Хранилище снято: резерв на сбой основным не становится", async () => {
    const env = await makeEnv();
    const c = await env.ok("GET", `/devices/${cam.id}`);
    const a = await env.ok("GET", `/archives/${c.archiveId}`);
    await env.ok("PATCH", `/devices/${c.id}`, { extraArchives: [{ archiveId: backup.id, recordMode: "backup", stream: "main" }] }, v(c));
    assert.status(await env.call("DELETE", `/archives/${a.id}`, undefined, v(a)), 204);
    const now = await env.ok("GET", `/devices/${c.id}`);
    assert.eq([now.archiveId, now.recordMode, now.extraArchives.length], [null, "none", 1], "основной нет, резерв остался дополнительным");
  });

  test("Архив не принимает записи: новая привязка — отказ, инциденты всегда false", async () => {
    const env = await makeEnv();
    assert.eq(incidents.admits, false, "инциденты");
    field(await env.call("PATCH", `/archives/${incidents.id}`, { admits: true }, v(incidents)), "VALIDATION_FAILED", "admits", "инциденты всегда false");
    const a = local;
    const off = await env.ok("PATCH", `/archives/${a.id}`, { admits: false }, v(a));
    assert.eq(off.admits, false, "выключено");
    const free = FX.devices.find((d) => d.type === "camera" && d.serverId === a.serverId && d.archiveId !== a.id);
    if (free) field(await env.call("PATCH", `/devices/${free.id}`, { archiveId: a.id, recordMode: "always" }, v(free)), "VALIDATION_FAILED", "archiveId", "новая камера");
    const old = FX.devices.find((d) => d.type === "camera" && d.archiveId === a.id && d.recordMode !== "replica");
    assert.status(await env.call("PATCH", `/devices/${old.id}`, { preRecordSec: 7 }, v(old)), 200, null, "прежняя запись живёт");
    assert.status(await env.call("PATCH", `/devices/${old.id}`, { recordMode: "motion" }, v((await env.ok("GET", `/devices/${old.id}`)))), 200, null, "и правится");
  });

  test("Том: меньший объём — второе подтверждение, то же число; не хранится", async () => {
    const env = await makeEnv();
    const vol = FX.volumes.find((x) => x.sizeBytes > 2 * GB && x.shrinkPendingBytes == null);
    const less = vol.sizeBytes - GB;
    field(await env.call("PATCH", `/volumes/${vol.id}`, { sizeBytes: less }, v(vol)), "VALIDATION_FAILED", "sizeBytes", "без подтверждения");
    field(await env.call("PATCH", `/volumes/${vol.id}`, { sizeBytes: less, confirmShrinkBytes: less + 1 }, v(vol)), "VALIDATION_FAILED", "confirmShrinkBytes", "другое число");
    const res = await env.ok("PATCH", `/volumes/${vol.id}`, { sizeBytes: less, confirmShrinkBytes: less }, v(vol));
    assert.eq([res.sizeBytes, "confirmShrinkBytes" in res], [less, false], "применено");
    field(await env.call("POST", "/operations", { idempotencyKey: key(), items: [{ targetId: vol.id, set: { sizeBytes: less - GB } }], expectedVersions: { [vol.id]: res.version } }), "VALIDATION_FAILED", "sizeBytes", "в операции то же правило");
  });

  test("Том: объявленное уменьшение ждёт подтверждения; выключение — состояние off", async () => {
    const env = await makeEnv();
    const vol = FX.volumes.find((x) => x.shrinkPendingBytes != null);
    const n = vol.shrinkPendingBytes;
    const res = await env.ok("PATCH", `/volumes/${vol.id}`, { sizeBytes: n, confirmShrinkBytes: n }, v(vol));
    assert.eq([res.sizeBytes, "shrinkPendingBytes" in res], [n, false], "подтверждено, ожидания нет");
    const off = await env.ok("PATCH", `/volumes/${vol.id}`, { enabled: false }, { "If-Match": `"${res.version}"` });
    assert.eq([off.enabled, off.state], [false, "off"], "выключен");
    const back = await env.finished((await env.ok("POST", `/operations/${(await env.ok("GET", "/operations")).items[0].id}/revert`)).id);
    assert.eq(back.ok, 1, "выключение откатывается");
    const on = await env.ok("GET", `/volumes/${vol.id}`);
    assert.eq([on.state, on.enabled ?? true], ["ready", true], "снова готов");
  });

  // replica: источник — встроенное хранилище или другой архив этой камеры
  const devs = FX.devices;
  const hasStorage = (d) => devs.some((x) => x.type === "storage" && x.parentId === d.id);
  const free = devs.find((d) => d.type === "camera" && d.archiveId && !d.extraArchives && !d.parentId && hasStorage(d) && d.recordMode === "always" && d.streams?.length > 1) || null;
  const bare = devs.find((d) => d.type === "camera" && d.archiveId && !d.parentId && !hasStorage(d) && !d.extraArchives && d.streams?.length) || null;
  const second = (d) => FX.archives.find((a) => a.id !== d.archiveId && a.domainId === d.domainId && a.kind === "remote" && a.admits !== false);
  const put = (env, d, set) => env.call("PATCH", `/devices/${d.id}`, set, v(d));
  const needs = { needs: ["type:storage"] };

  test("replica: со встроенного — основной поток, поток sub — 422 NOT_SUPPORTED, field: stream", async () => {
    const env = await makeEnv();
    const c = await env.ok("GET", `/devices/${free.id}`);
    const main = c.streams[0].id, sub = c.streams[1].id;
    const ok = await env.ok("PATCH", `/devices/${c.id}`, { recordMode: "replica", replicaFrom: null }, v(c));
    assert.eq([ok.recordMode, ok.replicaFrom ?? null], ["replica", null], "основная забирает со встроенного");
    field(await put(env, ok, { stream: sub }), "NOT_SUPPORTED", "stream", "второй поток");
    const a = second(c);
    field(await put(env, ok, { extraArchives: [{ archiveId: a.id, recordMode: "replica", stream: sub, replicaFrom: null }] }), "NOT_SUPPORTED", "stream", "в строке так же");
    assert.status(await put(env, ok, { extraArchives: [{ archiveId: a.id, recordMode: "replica", stream: main, replicaFrom: null }] }), 200, null, "основной поток можно");
  }, needs);

  test("replica: другой архив камеры, тот же поток; чужой архив, сам у себя, цикл, резерв — 422 VALIDATION_FAILED", async () => {
    const env = await makeEnv();
    const c = await env.ok("GET", `/devices/${free.id}`);
    const main = c.streams[0].id, sub = c.streams[1].id;
    const a = second(c), row = (over) => ({ archiveId: a.id, recordMode: "replica", stream: main, replicaFrom: c.archiveId, ...over });
    const b = FX.archives.find((x) => x.kind === "backup" && x.serverId === c.serverId) || backup;
    assert.status(await put(env, c, { extraArchives: [row()] }), 200, null, "из основного архива");
    const c2 = await env.ok("GET", `/devices/${c.id}`);
    assert.eq(c2.extraArchives[0].replicaFrom, c.archiveId, "источник записан");
    field(await put(env, c2, { extraArchives: [row({ stream: sub })] }), "VALIDATION_FAILED", "stream", "другой поток");
    field(await put(env, c2, { extraArchives: [row({ replicaFrom: FX.archives.find((x) => x.id !== c.archiveId && x.id !== a.id && x.kind === "local").id })] }), "VALIDATION_FAILED", "replicaFrom", "архив не этой камеры");
    field(await put(env, c2, { extraArchives: [row({ replicaFrom: a.id })] }), "VALIDATION_FAILED", "replicaFrom", "сам у себя");
    field(await put(env, c2, { recordMode: "replica", replicaFrom: a.id }), "VALIDATION_FAILED", "replicaFrom", "забирают друг у друга");
    field(await put(env, c2, { extraArchives: [{ archiveId: b.id, recordMode: "backup", stream: main }, row({ replicaFrom: b.id })] }), "VALIDATION_FAILED", "replicaFrom", "резерв источником не бывает");
  }, needs);

  test("replica: без встроенного хранилища — только из другого архива; источник сняли — запись ждёт и говорит причину", async () => {
    const env = await makeEnv();
    const c = await env.ok("GET", `/devices/${bare.id}`);
    const a = second(c);
    field(await put(env, c, { recordMode: "replica" }), "VALIDATION_FAILED", "replicaFrom", "забирать неоткуда");
    const main = c.streams[0].id;
    assert.status(await put(env, c, { extraArchives: [{ archiveId: a.id, recordMode: "replica", stream: main, replicaFrom: c.archiveId }] }), 200, null, "из основного архива");
    const c2 = await env.ok("GET", `/devices/${c.id}`);
    // Сняли основной архив: строка осталась, источник пропал
    const src = await env.ok("GET", `/archives/${c.archiveId}`);
    assert.status(await env.call("DELETE", `/archives/${src.id}`, undefined, v(src)), 204);
    const c3 = await env.ok("GET", `/devices/${c.id}`);
    assert.eq([c3.recordState === "waiting" || c3.extraArchives?.some((x) => x.state === "waiting"), /Источник снят/.test(JSON.stringify(c3))], [true, true], "запись ждёт, причина словами");
    assert.ok(c2.version !== c3.version, "камера изменилась");
  });

  test("replica в наборе: источник из архива, отставание, слово о потере и журнал; план по шагам проверяется целиком", async () => {
    const env = await makeEnv();
    const list = await env.list("/devices");
    const lag = list.find((d) => (d.extraArchives || []).some((x) => x.recordMode === "replica" && x.replicaFrom && x.replicaLagSec != null));
    const row = lag.extraArchives.find((x) => x.replicaFrom);
    assert.ok(row.replicaLagSec > 0 && row.replicaFrom === lag.archiveId, "строка забирает из основного");
    const lost = list.find((d) => d.recordMode === "replica" && /Потеряно/.test(d.recordReason || ""));
    assert.ok(lost && lost.replicaLagSec > 0, "слово о потере и отставание у камеры");
    const j = await env.ok("GET", `/journal?deviceId=${lost.id}`);
    assert.ok(j.items.some((e) => e.kind === "replica.lost"), "потеря — в журнале");
    // Шаги одного плана: сначала режим, потом источник. Проверка — по итогу, а не по шагу
    const a = second(free);
    const c = await env.ok("GET", `/devices/${bare.id}`);
    const main = c.streams[0].id;
    const op = await env.runOperation({ idempotencyKey: key(), items: [
      { targetId: c.id, set: { extraArchives: [{ archiveId: a.id, recordMode: "always", stream: main }] } },
      { targetId: c.id, set: { recordMode: "replica" } },
      { targetId: c.id, set: { replicaFrom: a.id } },
    ], expectedVersions: { [c.id]: c.version } });
    assert.eq(op.ok, 3, "план выполнен");
    assert.eq((await env.ok("GET", `/devices/${c.id}`)).replicaFrom, a.id, "источник на месте");
  }, needs);

  test("Режим не replica: источника и отставания в записи нет; поля сервера правка строки не стирает", async () => {
    const env = await makeEnv();
    const c = (await env.list("/devices")).find((d) => (d.extraArchives || []).some((x) => x.replicaLagSec != null && !x.readOnly));
    const rows = c.extraArchives.filter((x) => !x.readOnly);
    const res = await env.ok("PATCH", `/devices/${c.id}`, { preRecordSec: 9, extraArchives: rows.map((x) => ({ archiveId: x.archiveId, recordMode: x.recordMode, stream: x.stream, replicaFrom: x.replicaFrom, labels: ["gpu"] })) }, v(c));
    const r = res.extraArchives.find((x) => x.replicaLagSec != null);
    assert.ok(r && r.labels.length === 1, "отставание осталось, метка записана");
    const row = (await env.ok("PATCH", `/devices/${c.id}`, { extraArchives: rows.map((x) => ({ archiveId: x.archiveId, recordMode: x.recordMode === "replica" ? "always" : x.recordMode, stream: x.stream })) }, v(res))).extraArchives;
    assert.ok(row.every((x) => x.recordMode !== "always" || (!("replicaFrom" in x) && !("replicaLagSec" in x))), "у другого режима этих полей нет");
  }, needs);

  test("Карта камеры w2c: запись storage, recordMode и sizeBytes правятся, остальное — нет; обычная только чтение", async () => {
    const env = await makeEnv();
    const list = await env.list("/devices");
    const cardRec = list.find((d) => d.type === "storage" && d.writableFields);
    assert.eq([cardRec.writableFields, list.filter((d) => d.type === "storage" && d.writableFields).length], [["recordMode", "sizeBytes"], 1], "одна карта в наборе");
    const res = await env.ok("PATCH", `/devices/${cardRec.id}`, { recordMode: "always", sizeBytes: cardRec.sizeBytes * 2 }, v(cardRec));
    assert.eq([res.recordMode, res.sizeBytes], ["always", cardRec.sizeBytes * 2], "режим и объём");
    field(await env.call("PATCH", `/devices/${cardRec.id}`, { recordMode: "motion" }, v(res)), "VALIDATION_FAILED", "recordMode", "только постоянно или при сбое");
    field(await env.call("PATCH", `/devices/${cardRec.id}`, { name: "Другая" }, v(res)), "NOT_SUPPORTED", "name", "имя постоянное");
    const plain = list.find((d) => d.type === "storage" && !d.writableFields);
    field(await env.call("PATCH", `/devices/${plain.id}`, { sizeBytes: GB }, v(plain)), "NOT_SUPPORTED", "type", "обычное — только чтение");
    assert.ok(!(await env.list("/archives")).some((a) => a.id === cardRec.id), "в GET /archives её нет");
  }, needs);

  // Запись по расписанию, срок и глубина строки, микрофон
  const plainCam = () => FX.devices.find((d) => d.type === "camera" && d.archiveId && d.recordMode === "always" && !d.extraArchives && !d.parentId);

  test("По расписанию: recordScheduleId обязателен, неизвестный — отказ; расписание сняли — запись ждёт", async () => {
    const env = await makeEnv();
    const c = await env.ok("GET", `/devices/${plainCam().id}`);
    const sc = FX.schedules.find((s) => !s.builtin && !s.owner);
    field(await put(env, c, { recordMode: "sched" }), "VALIDATION_FAILED", "recordScheduleId", "без расписания");
    field(await put(env, c, { recordMode: "sched", recordScheduleId: "f0009999-0000-4000-8000-000000000000" }), "VALIDATION_FAILED", "recordScheduleId", "неизвестное");
    const ok = await env.ok("PATCH", `/devices/${c.id}`, { recordMode: "sched", recordScheduleId: sc.id }, v(c));
    assert.eq(ok.recordScheduleId, sc.id, "записано");
    const fresh = await env.ok("GET", `/schedules/${sc.id}`);
    assert.status(await env.call("DELETE", `/schedules/${sc.id}`, undefined, v(fresh)), 204);
    const now = await env.ok("GET", `/devices/${c.id}`);
    assert.eq([now.recordState, /Расписание снято/.test(now.recordReason)], ["waiting", true], "запись ждёт, причина словами");
    assert.status(await put(env, now, { preRecordSec: 3 }), 200, null, "прочие правки идут");
  });

  test("Срок и глубина: у записи свои, глубина больше срока — отказ; срок архива их не трогает", async () => {
    const env = await makeEnv();
    const c = await env.ok("GET", `/devices/${plainCam().id}`);
    const a = await env.ok("GET", `/archives/${c.archiveId}`);
    const res = await env.ok("PATCH", `/devices/${c.id}`, { retentionDays: 10, minDepthDays: 5 }, v(c));
    assert.eq([res.retentionDays, res.minDepthDays], [10, 5], "основная запись");
    field(await put(env, res, { minDepthDays: 11 }), "VALIDATION_FAILED", "minDepthDays", "глубина больше срока");
    await env.ok("PATCH", `/archives/${a.id}`, { retentionDays: 3 }, v(a));
    assert.eq((await env.ok("GET", `/devices/${c.id}`)).retentionDays, 10, "срок записи не изменился");
    const other = FX.archives.find((x) => x.id !== c.archiveId && x.kind === "remote" && x.domainId === c.domainId && x.admits !== false);
    const fresh = await env.ok("GET", `/devices/${c.id}`);
    const row = await env.ok("PATCH", `/devices/${c.id}`, { extraArchives: [{ archiveId: other.id, recordMode: "always", stream: "main", retentionDays: 90, minDepthDays: 30 }] }, v(fresh));
    assert.eq([row.extraArchives[0].retentionDays, row.extraArchives[0].minDepthDays], [90, 30], "строка");
  });

  test("Микрофон записи: запись mic этой камеры, null — первый", async () => {
    const env = await makeEnv();
    const c = FX.devices.find((d) => d.type === "camera" && FX.devices.filter((x) => x.type === "mic" && x.parentId === d.id).length > 1);
    const fresh = await env.ok("GET", `/devices/${c.id}`);
    const mics = FX.devices.filter((x) => x.type === "mic" && x.parentId === c.id);
    assert.eq(fresh.audioDeviceId, mics[1].id, "в наборе — второй");
    const res = await env.ok("PATCH", `/devices/${c.id}`, { audioDeviceId: mics[0].id }, v(fresh));
    assert.eq(res.audioDeviceId, mics[0].id, "выбран");
    field(await put(env, res, { audioDeviceId: FX.devices.find((x) => x.type === "mic" && x.parentId !== c.id).id }), "VALIDATION_FAILED", "audioDeviceId", "чужой микрофон");
    assert.ok(!("audioDeviceId" in (await env.ok("PATCH", `/devices/${c.id}`, { audioDeviceId: null }, v(res)))), "null — поля нет, первый");
  }, needs);

  test("Настройки: сроки событий и тревог", async () => {
    const env = await makeEnv();
    const s = await env.ok("GET", "/settings");
    assert.eq([s.values["events.retentionDays"], s.values["alarms.retentionDays"]], [90, 365], "в наборе");
    const res = await env.ok("PATCH", "/settings", { values: { "events.retentionDays": 30 } }, v(s));
    assert.eq(res.values["events.retentionDays"], 30, "записано");
    assert.status(await env.call("PATCH", "/settings", { values: { "alarms.retentionDays": -1 } }, v(res)), 422, "VALIDATION_FAILED");
  });

  // Обход и скан
  const watched = FX.archiveWatches?.[0];
  const wbody = (over) => ({ deviceId: free.id, detectorKind: "lpr", ...over });

  test("Обход архива: завести, умолчания, правка, снять; отказы", async () => {
    const env = await makeEnv();
    const list = (await env.ok("GET", `/archive-watches?deviceId=${watched.deviceId}`)).items;
    assert.eq([list.length, list[0].through, list[0].overrunSec], [1, list[0].through, 120], "в наборе: дошёл, стёрто 120 с");
    const w = await env.ok("POST", "/archive-watches", wbody({ params: "plate=ru", alarms: ["lpr"], labels: ["gpu"], mask: { shape: "rect", points: [[0, 0], [1, 1]] } }));
    assert.eq([w.start, w.keep, w.preSec, w.postSec, w.joinSec, w.enabled, w.through, w.overrunSec, w.params, w.mask.shape, w.alarms, w.labels], ["now", "none", 5, 5, 30, true, null, 0, "plate=ru", "rect", ["lpr"], ["gpu"]], "умолчания и поля");
    field(await env.call("POST", "/archive-watches", wbody()), "VALIDATION_FAILED", "detectorKind", "тот же вид у той же камеры");
    field(await env.call("POST", "/archive-watches", wbody({ detectorKind: "tape" })), "VALIDATION_FAILED", "detectorKind", "нет такого вида");
    field(await env.call("POST", "/archive-watches", wbody({ detectorKind: "motion", keep: "hits" })), "VALIDATION_FAILED", "archiveId", "сохранять некуда");
    field(await env.call("POST", "/archive-watches", wbody({ detectorKind: "motion", keep: "hits", archiveId: FX.archives.find((a) => a.id !== free.archiveId && a.kind === "local").id })), "VALIDATION_FAILED", "archiveId", "архив не этой камеры");
    field(await env.call("POST", "/archive-watches", wbody({ detectorKind: "motion", mask: { shape: "rect", points: [[0, 0]] } })), "VALIDATION_FAILED", "mask", "маска");
    field(await env.call("POST", "/archive-watches", wbody({ detectorKind: "motion", alarms: ["нет"] })), "VALIDATION_FAILED", "alarms", "вид события");
    field(await env.call("POST", "/archive-watches", wbody({ deviceId: bare.id, detectorKind: "motion" })), "NOT_SUPPORTED", "deviceId", "нет архива устройства");
    const up = await env.ok("PATCH", `/archive-watches/${w.id}`, { keep: "hits", archiveId: free.archiveId, enabled: false }, v(w));
    assert.eq([up.keep, up.archiveId, up.enabled], ["hits", free.archiveId, false], "правка");
    assert.status(await env.call("PATCH", `/archive-watches/${w.id}`, { deviceId: bare.id }, v(up)), 422, "VALIDATION_FAILED", "камера не меняется");
    assert.status(await env.call("PATCH", `/archive-watches/${w.id}`, { enabled: true }, v(w)), 412, "VERSION_MISMATCH");
    assert.status(await env.call("DELETE", `/archive-watches/${w.id}`), 428, "PRECONDITION_REQUIRED");
    assert.status(await env.call("DELETE", `/archive-watches/${w.id}`, undefined, v(up)), 204);
    assert.ok(!(await env.ok("GET", "/archive-watches")).items.some((x) => x.id === w.id), "снят");
  }, { needs: ["createArchiveWatch", "type:storage"] });

  test("Обход архива: снята камера — снят и он; снят архив — только ищет", async () => {
    const env = await makeEnv();
    const a = await env.ok("GET", `/archives/${watched.archiveId}`);
    assert.status(await env.call("DELETE", `/archives/${a.id}`, undefined, v(a)), 204);
    const w = (await env.ok("GET", "/archive-watches")).items[0];
    assert.eq([w.keep, w.archiveId], ["none", null], "сохранять некуда");
    const c = await env.ok("GET", `/devices/${watched.deviceId}`);
    assert.status(await env.call("DELETE", `/devices/${c.id}`, undefined, v(c)), 204);
    assert.eq((await env.ok("GET", "/archive-watches")).items.length, 0, "обхода нет");
  }, { needs: ["createArchiveWatch", "type:storage"] });

  test("Скан архива: итог приходит по часам, поля задачи, отказы, отмена", async () => {
    const env = await makeEnv();
    const c = FX.devices.find((d) => d.type === "camera" && d.archiveId && d.online);
    const span = { deviceId: c.id, archiveId: c.archiveId, detectorKind: "motion", from: "2026-10-28T10:00:00Z", to: "2026-10-28T12:00:00Z" };
    const x = await env.ok("POST", "/archive-scans", { ...span, params: "p", alarms: ["motion"], labels: ["gpu"], mask: { shape: "rect", points: [[0, 0], [1, 1]] } });
    assert.eq([x.state, x.result, x.params, x.alarms, x.labels, x.mask.shape], ["running", null, "p", ["motion"], ["gpu"], "rect"], "идёт");
    if (env.frozen) {
      const fired = await env.advance(2);
      assert.ok(fired.some((f) => f.kind === "archiveScan" && f.id === x.id), "итог в ответе часов");
    }
    const done = await env.until(async () => {
      const it = (await env.ok("GET", `/archive-scans?deviceId=${c.id}`)).items.find((y) => y.id === x.id);
      return it.state !== "running" && it;
    }, "скан закончился");
    assert.eq([done.state, done.result.end, done.result.asked, done.result.covered, done.result.events], ["done", "done", 7200, 7200, 12], "итог");
    field(await env.call("POST", "/archive-scans", { ...span, archiveId: FX.archives.find((a) => a.id !== c.archiveId).id }), "VALIDATION_FAILED", "archiveId", "архив не этой камеры");
    field(await env.call("POST", "/archive-scans", { ...span, to: span.from }), "VALIDATION_FAILED", "to", "пустой отрезок");
    field(await env.call("POST", "/archive-scans", { ...span, detectorKind: "tape" }), "VALIDATION_FAILED", "detectorKind", "нет такого вида");
    assert.status(await env.call("DELETE", `/archive-scans/${x.id}`), 204);
    assert.status(await env.call("DELETE", `/archive-scans/${x.id}`), 404, "NOT_FOUND");
  });

  ApiTest.loaded("api-archive.js");
})();
