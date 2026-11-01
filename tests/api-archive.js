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
    const op = await env.ok("POST", "/operations", { idempotencyKey: key(), items: [{ targetId: vol.id, set: { sizeBytes: less - GB } }], expectedVersions: { [vol.id]: res.version } }).catch(() => null);
    assert.ok(op === null, "в операции то же правило");
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

  ApiTest.loaded("api-archive.js");
})();
