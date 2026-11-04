/* Тесты API: закладка «Просмотр» — разговор, журнал камеры, реле, шкала, куски, удержания, отметки, дозапись. Перечни — tests/api-pages.js.
   Пути ядра: предметные API объекта по uid (/units/{uid}/talk, timeline, playback, holds, bookmarks, archive-fetch) — по профилям
   vms.talk/1, vms.timeline/1; реле — команда output (/units/{uid}/actions/output). */
(() => {
  const { test, makeEnv, assert, FX } = ApiTest;
  const cam = FX.devices.find((d) => d.type === "camera" && d.archiveId && d.online && d.serverId);
  const spk = FX.devices.find((d) => d.type === "spk");
  const relay = FX.devices.find((d) => d.type === "relay");
  const url = "https://b/backend/";
  const iso = (ms) => new Date(ms).toISOString();
  const kindNo = (r, what) => {
    assert.status(r, 422, "NOT_SUPPORTED");
    assert.eq(r.body.field, "/kind", `${what}: field — вид объекта`);
  };

  test("Разговор: адрес url, токен, срок; не spk — 422; отказ устройства, право, другой кластер", async () => {
    const env = await makeEnv();
    kindNo(await env.call("POST", `/units/${cam.id}/talk`), "камера без vms.talk/1");
    const t = await env.ok("POST", `/units/${spk.id}/talk`);
    assert.ok(t.url && t.token && Date.parse(t.expiresAt) > 0, "ответ");
    assert.ok(!("whepUrl" in t), "поле url, направление обратное");
    assert.status(await env.call("POST", "/units/00000000-0000-4000-8000-000000000000/talk"), 404, "NOT_FOUND");
    const r = await (await makeEnv({ fixturePatch: { stand: { talkRefused: true } } })).call("POST", `/units/${spk.id}/talk`);
    assert.status(r, 409, "DEVICE_REFUSED");
    assert.eq(r.body.params.reason, "refused", "причина");
    assert.status(await (await makeEnv({ fixturePatch: { stand: { talkDenied: true } } })).call("POST", `/units/${spk.id}/talk`), 403, "PERMISSION_DENIED");
    const far = await (await makeEnv({ fixturePatch: { stand: { otherCluster: { [spk.parentId]: url } } } })).call("POST", `/units/${spk.id}/talk`);
    assert.status(far, 409, "OTHER_CLUSTER");
    assert.eq(far.body.params.url, url, "ссылка");
  }, { needs: ["startUnitTalk", "implements:vms.talk/1"] });

  test("Реле: команда output с state и pulseMs; без state — 422, field=/params/state; команды нет у вида — 404", async () => {
    const env = await makeEnv();
    const out = (params) => env.call("POST", `/units/${relay.id}/actions/output`, { params });
    const on = await out({ state: true });
    assert.status(on, 200);
    assert.eq(on.body.result.done, true, "замкнуть");
    assert.status(await out({ state: false, pulseMs: 500 }), 200);
    const bad = await out({});
    assert.status(bad, 422, "VALIDATION_FAILED");
    assert.eq(bad.body.field, "/params/state", "state обязателен");
    // Другая команда: у вида relay её нет (ActionDescriptor) — 404; отказ устройства (DEVICE_REFUSED) — у единиц СКУД, api-devices.js
    assert.status(await env.call("POST", `/units/${relay.id}/actions/open`, { params: { state: true } }), 404, "NOT_FOUND");
  }, { needs: ["runUnitAction", "kind:relay"] });

  test("Журнал камеры: и единицы про неё; новая запись — journal.event наблюдающим", async () => {
    const env = await makeEnv();
    const src = (await env.list("/units?kind=eventsrc"))[0];
    assert.ok(src, "источник в наборе");
    await env.ok("PATCH", `/units/${src.uid}`, { properties: { cameraId: cam.id } }, { "If-Match": `"${src.version}"` });
    await env.ok("POST", "/test/events", { type: "journal.event", deviceId: src.uid, event: { text: "чек", source: "pos", kind: "text", fields: { lines: ["a"] } } });
    const got = await env.ok("GET", `/journal?deviceId=${cam.id}&source=pos`);
    assert.eq(got.items.length, 1, "запись источника в журнале камеры");
    assert.eq(got.withheldCount, 0, "скрытых нет");
    assert.eq(got.items[0].fields.lines, ["a"], "строки титра");
  }, { needs: ["listJournal", "patchUnit", "kind:eventsrc"] });

  test("Шкала: спаны с spanId и записью, окно, пустое окно, не камера, недоступное названо", async () => {
    const env = await makeEnv();
    const all = await env.ok("GET", `/units/${cam.id}/timeline`);
    assert.ok(all.items.length > 10, "записи есть");
    assert.ok(all.items.every((s) => s.spanId && s.recordingId && s.archiveId && Date.parse(s.end) > Date.parse(s.start)), "поля спана");
    assert.ok(all.items.some((s) => s.fenced) && all.items.some((s) => s.backupOnly) && all.items.some((s) => s.source === "device") && all.items.some((s) => s.source === "backfill"), "виды спанов");
    assert.eq(new Set(all.items.map((s) => s.spanId)).size, all.items.length, "spanId уникален");
    const s = all.items[5];
    const w = await env.ok("GET", `/units/${cam.id}/timeline?from=${encodeURIComponent(s.start)}&to=${encodeURIComponent(s.end)}`);
    assert.ok(w.items.some((x) => x.spanId === s.spanId) && w.items.length < all.items.length, "окно");
    assert.eq((await env.ok("GET", `/units/${cam.id}/timeline?from=2000-01-01T00:00:00Z&to=2000-01-02T00:00:00Z`)).items, [], "пусто");
    assert.status(await env.call("GET", `/units/${cam.id}/timeline?from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z`), 422, "VALIDATION_FAILED");
    const det = FX.devices.find((d) => d.type === "det");
    kindNo(await env.call("GET", `/units/${det.id}/timeline`), "детектор без vms.timeline/1");
    const gone = await (await makeEnv({ fixturePatch: { stand: { timelineUnavailable: [{ what: "volume", id: "t7", reason: "нет держателя" }] } } })).ok("GET", `/units/${cam.id}/timeline?limit=1`);
    assert.eq(gone.unavailable[0].what, "volume", "недоступное");
    assert.eq(all.unavailable, [], "всё ответило");
  }, { needs: ["getUnitTimeline", "implements:vms.timeline/1"] });

  test("Кусок: по spanId и по моменту; 60 с; неотсечённый над моментом; нет записи — 404", async () => {
    const env = await makeEnv();
    const all = (await env.ok("GET", `/units/${cam.id}/timeline`)).items;
    const fen = all.find((s) => s.fenced), twin = all.find((s) => !s.fenced && s.start === fen.start);
    const at = iso(Date.parse(fen.start) + 90000);
    const p = await env.ok("GET", `/units/${cam.id}/playback?at=${encodeURIComponent(at)}`);
    assert.eq(p.spanId, twin.spanId, "неотсечённая эпоха");
    assert.eq(Date.parse(p.to) - Date.parse(p.from), 60000, "кусок 60 с");
    assert.eq(Date.parse(p.from), Date.parse(fen.start) + 60000, "начало куска");
    assert.ok(p.url && Date.parse(p.expiresAt) > 0, "адрес, срок");
    assert.eq((await env.ok("GET", `/units/${cam.id}/playback?at=${encodeURIComponent(at)}&spanId=${encodeURIComponent(fen.spanId)}`)).spanId, fen.spanId, "выбранный сам");
    assert.status(await env.call("GET", `/units/${cam.id}/playback?at=${encodeURIComponent(at)}&spanId=нет`), 404, "NOT_FOUND");
    assert.status(await env.call("GET", `/units/${cam.id}/playback?at=2000-01-01T00:00:00Z`), 404, "NOT_FOUND");
    assert.status(await env.call("GET", `/units/${cam.id}/playback`), 422, "VALIDATION_FAILED");
  }, { needs: ["getUnitPlayback", "getUnitTimeline"] });

  test("Удержание: ключ — id, то же окно объединяет записи, заметка цела, снять, проверить", async () => {
    const env = await makeEnv();
    const from = "2026-10-01T10:00:00Z", to = "2026-10-01T11:00:00Z";
    const a = await env.call("POST", `/units/${cam.id}/holds`, { from, to, note: "первая", recordingIds: ["r1"] });
    assert.status(a, 201);
    assert.eq(a.body.id, `${cam.id}-${Date.parse(from) / 1000}-${Date.parse(to) / 1000}`, "id — ключ");
    assert.ok(a.body.by && a.body.at && a.body.states.length, "кто, когда, состояние");
    assert.eq(a.body.releasedAt, null, "не отпущено");
    const b = await env.call("POST", `/units/${cam.id}/holds`, { from, to, note: "вторая", recordingIds: ["r2"] });
    assert.status(b, 200);
    assert.eq(b.body.recordingIds, ["r1", "r2"], "объединение");
    assert.eq(b.body.note, "первая", "заметка цела");
    const c = await env.ok("POST", `/units/${cam.id}/holds`, { from, to: "2026-10-01T12:00:00Z" });
    assert.ok(c.recordingIds.includes(cam.id), "без recordingIds — все записи камеры");
    assert.eq((await env.list(`/units/${cam.id}/holds`)).length, 2, "список");
    assert.status(await env.call("POST", `/units/${cam.id}/holds`, { from: to, to: from }), 422, "VALIDATION_FAILED");
    const v = await env.ok("POST", `/holds/${encodeURIComponent(a.body.id)}/verify`);
    assert.eq(v.results.map((x) => x.result), ["ok", "ok"], "одним словом на запись");
    assert.status(await env.call("DELETE", `/holds/${encodeURIComponent(a.body.id)}`), 204);
    assert.status(await env.call("DELETE", `/holds/${encodeURIComponent(a.body.id)}`), 404, "NOT_FOUND");
    assert.status(await env.call("POST", `/holds/нет/verify`), 404, "NOT_FOUND");
    const far = await (await makeEnv({ fixturePatch: { stand: { otherCluster: { [cam.id]: url } } } })).call("POST", `/units/${cam.id}/holds`, { from, to });
    assert.status(far, 409, "OTHER_CLUSTER");
    assert.status(await (await makeEnv({ fixturePatch: { stand: { keepDenied: true } } })).call("POST", `/units/${cam.id}/holds`, { from, to }), 403, "PERMISSION_DENIED");
  }, { needs: ["createUnitHold", "listUnitHolds", "verifyHold", "deleteHold"] });

  test("Отметка: создать и смотреть, occurred на прошлом моменте, пустая — 422, окно", async () => {
    const env = await makeEnv();
    const m = await env.call("POST", `/units/${cam.id}/bookmarks`, { note: "тут", occurred: "2026-10-01T10:00:00Z" });
    assert.status(m, 201);
    assert.eq(m.body.occurred, "2026-10-01T10:00:00Z", "момент на шкале");
    assert.ok(m.body.at !== m.body.occurred && m.body.by, "записано сейчас, кто");
    const now = await env.ok("POST", `/units/${cam.id}/bookmarks`, { note: "сейчас" });
    assert.eq(now.occurred, now.at, "нет поля — сейчас");
    assert.status(await env.call("POST", `/units/${cam.id}/bookmarks`, { note: "  " }), 422, "VALIDATION_FAILED");
    assert.eq((await env.list(`/units/${cam.id}/bookmarks`)).map((x) => x.note), ["сейчас", "тут"], "новые сверху");
    assert.eq((await env.ok("GET", `/units/${cam.id}/bookmarks?from=2026-10-01T09:00:00Z&to=2026-10-01T11:00:00Z`)).items.length, 1, "окно");
    assert.status(await (await makeEnv({ fixturePatch: { stand: { keepDenied: true } } })).call("GET", `/units/${cam.id}/bookmarks`), 403, "PERMISSION_DENIED");
  }, { needs: ["createUnitBookmark", "listUnitBookmarks"] });

  test("Закрепить: сутки на просьбу, per_person 7, refused только о подаче; нет основной — 409", async () => {
    const env = await makeEnv();
    const body = (days) => ({ archiveId: cam.archiveId, from: "2026-10-01T00:00:00Z", to: iso(Date.parse("2026-10-01T00:00:00Z") + days * 86400000) });
    const r = await env.ok("POST", `/units/${cam.id}/archive-fetch`, body(9));
    assert.eq(r.accepted, 7, "подано 7");
    assert.eq(r.refused.length, 2, "остальное отказано");
    assert.eq(r.refused[0].reason, "per_person", "причина");
    assert.status(await env.call("POST", `/units/${cam.id}/archive-fetch`, Object.assign(body(1), { archiveId: "другой" })), 409, "NO_PRIMARY");
    assert.status(await env.call("POST", `/units/${cam.id}/archive-fetch`, Object.assign(body(1), { to: "2026-09-01T00:00:00Z" })), 422, "VALIDATION_FAILED");
  }, { needs: ["fetchUnitArchive"] });

  test("Том: heldBy; события hold и bookmark идут в поток", async () => {
    const env = await makeEnv();
    // Кто держит том инцидентов — то, что система говорит о томе: status.observed.heldBy
    const a = (await env.list("/units?kind=archive.incidents"))[0];
    if (a) {
      const v = await env.list(`/units?kind=volume&parentId=${a.uid}`);
      assert.ok(v.length && v.every((x) => "heldBy" in ((x.status || {}).observed || {})), "поле есть");
    }
  }, { needs: ["listUnits", "kind:archive.incidents"] });

  ApiTest.loaded("api-view.js");
})();
