/* Общее правило страницы на встроенном сервере: tools/check_api.py читает отсюда JSON со списком расхождений.
   Каждый перечень таблицы предложения: limit, обход до конца без потерь и повторов, чужой курсор, пределы limit. Пустая страница
   с nextCursor на фильтре и в папке. Обе формы version в /objects/delete. */
global.window = global;
require("../api/contract.js");
require("../api/server.js");
const fx = require("../api/fixtures/demo.json");
const openapi = require("../api/openapi.json");
const s = window.ConsolemServer.create({ fixture: fx, fixtures: { demo: fx }, openapi, autoTick: false, testSupport: true });
const bad = [];
const get = (p) => s.handle("GET", p);
const sep = (p) => (p.includes("?") ? "&" : "?");
const rule = fx.ruleFires[0].ruleId, did = fx.domains[0].id;
const LISTS = ["/devices", "/archives", "/volumes", "/folders", "/journal", "/operations", `/rules/${rule}/fires`, "/archive-watches", "/archive-scans",
  "/access/users", "/access/groups", "/access/history", "/access/cell-history", `/access/roles/${fx.access.roles[0].id}/objects`, `/tree/children?layout=servers&parentId=${did}`];
const recCam = fx.devices.find((d) => d.type === "camera" && d.archiveId);
LISTS.push(`/devices/${recCam.id}/timeline`, `/devices/${recCam.id}/holds`, `/devices/${recCam.id}/bookmarks`);
[["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"], ["2026-01-02T00:00:00Z", "2026-01-02T01:00:00Z"]].forEach(([from, to]) => {
  s.handle("POST", `/devices/${recCam.id}/holds`, { from, to });
  s.handle("POST", `/devices/${recCam.id}/bookmarks`, { note: "проба", occurred: from });
});
s.handle("PATCH", `/devices/${fx.devices[0].id}`, { name: "Проба" }, { "If-Match": `"${fx.devices[0].version}"` });
for (const path of LISTS) {
  const all = [];
  let cursor = null, n = 0;
  do {
    const r = get(`${path}${sep(path)}limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (r.status !== 200) { bad.push(`${path}: ${r.status}`); break; }
    if (r.body.items.length > 1) bad.push(`${path}: больше limit`);
    all.push(...r.body.items);
    cursor = r.body.nextCursor || null;
    if (++n > 3000) { bad.push(`${path}: страницы не кончаются`); break; }
  } while (cursor);
  const key = (x) => x.id || x.objectId || x.spanId;
  if (new Set(all.map(key)).size !== all.length) bad.push(`${path}: повтор строки`);
  const whole = get(`${path}${sep(path)}limit=1000`).body;
  if (whole.items.length !== all.length) bad.push(`${path}: обход дал ${all.length} из ${whole.items.length}`);
  if (get(`${path}${sep(path)}limit=0`).status !== 422 || get(`${path}${sep(path)}limit=1001`).status !== 422) bad.push(`${path}: limit вне 1–1000`);
  if (get(`${path}${sep(path)}cursor=чужой`).body.code !== "INVALID_CURSOR") bad.push(`${path}: чужой курсор`);
}
// Пустая страница с живым nextCursor законна
const cam = fx.devices.find((d) => d.type === "camera");
let empties = 0, cur = null;
do {
  const r = get(`/devices?q=${encodeURIComponent(cam.name)}${cur ? `&cursor=${encodeURIComponent(cur)}` : ""}`).body;
  if (!r.items.length && r.nextCursor) empties++;
  cur = r.nextCursor || null;
} while (cur);
if (!empties) bad.push("/devices: нет пустой страницы с nextCursor");
// Обе формы version
const a = fx.devices.find((d) => d.type === "camera" && !d.parentId && d.serverId);
const del = (id, version) => s.handle("POST", "/objects/delete", { idempotencyKey: `probe-${id}-${version}`, items: [{ id, version }] }).body;
if (del(a.id, a.version + "x").failed[0]?.code !== "VERSION_MISMATCH") bad.push("/objects/delete: чужая версия прошла");
if (del(a.id, "r1").done[0] !== a.id) bad.push("/objects/delete: форма r<revision> не принята");
const b = fx.devices.find((d) => d.type === "camera" && !d.parentId && d.serverId && d.id !== a.id);
if (del(b.id, get(`/devices/${b.id}`).body.version).done[0] !== b.id) bad.push("/objects/delete: форма Device.version не принята");
console.log(JSON.stringify(bad));
process.exit(0);
