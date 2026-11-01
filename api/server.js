/* Встроенный сервер прототипа. Отвечает на запросы ровно по контракту api/openapi.json и хранит всё,
   что в продукте хранит бэкенд: оборудование, хранилища, правила, права, опции, журнал. Интерфейс
   разговаривает с ним только через api/client.js — теми же запросами, что с настоящим бэкендом.
   Работает в той же вкладке: страница открывается и с диска (file://), и с сайта.

   Данные — эталонный набор api/fixtures/demo.json (api/fixture.js): его же загружает бэкенд на тестовом
   стенде. Записи хранятся в том виде, в каком уходят в ответах.

   Параметры create(): fixture — набор, с которым сервер стартует; fixtures — наборы по имени для
   POST /test/reset (по умолчанию { demo: fixture }); openapi — контракт (api/openapi.js): по нему
   проверяются тела запросов и находится operationId запроса; now — часы; autoTick: false — шаги операций
   не выполняются сами, только по /test/clock; testSupport: true — служебные операции тестового стенда /test/….

   Что система умеет — reference.capabilities набора: операции не из списка отвечают 404 NO_ROUTE,
   виды устройств и необязательные настройки не из списка — 422 NOT_SUPPORTED. Так один сервер
   изображает и систему со всем контрактом (demo), и систему с его частью (one-domain). */
(() => {
  // Изменения на один прогон стенда — JSON Merge Patch (RFC 7396): объекты сливаются, null удаляет поле,
  // массивы и значения заменяются целиком. Исходник не меняется
  function mergePatch(target, patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return clone(patch);
    const out = target && typeof target === "object" && !Array.isArray(target) ? clone(target) : {};
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null) delete out[key];
      else out[key] = mergePatch(out[key], value);
    });
    return out;
  }
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const DAY = 86400000;
  const GB = 1024 ** 3;
  const TB = 1024 ** 4;
  const DATE = /^\d{4}-\d\d-\d\d$/;
  const MOMENT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

  // Набор снят в capturedAt: каждая дата и каждый момент сдвигаются на «сейчас − capturedAt», даты — на
  // целые сутки. Так «вошёл вчера» и «истекает через неделю» остаются правдой в любой день
  function shiftTimes(node, ms) {
    const days = Math.round(ms / DAY);
    const walk = (v) => {
      if (typeof v === "string") {
        if (MOMENT.test(v)) return new Date(Date.parse(v) + ms).toISOString().replace(/\.\d{3}Z$/, "Z");
        if (DATE.test(v)) return new Date(Date.parse(v + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
        return v;
      }
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [walk(k), walk(x)]));
      return v;
    };
    return walk(node);
  }

  // Вид записи — первая цифра UUID (api/README.md, «Идентификаторы»): сервер продолжает номера набора
  const KIND = { operation: "0", domain: "1", server: "2", device: "3", folder: "4", archive: "5", volume: "6", rule: "7", fire: "d", history: "e",
    // «Автоматизация»: первая цифра «f», вид — во второй группе UUID
    schedule: "f-0001", dayGroup: "f-0002", mode: "f-0003", window: "f-0004", ruleVersion: "f-0005" };
  const TABLES = { domains: "domain", servers: "server", devices: "device", folders: "folder", archives: "archive", volumes: "volume", rules: "rule" };
  // Ответ на запрос с ключом повтора помнится 10 минут: повтор получает его же и ничего не выполняет снова
  const IDEMPOTENCY_MS = 10 * 60 * 1000;
  // Движок «Автоматизации» (api/rule-engine.js): расписания, режим объекта, запуски правил
  const Engine = typeof window !== "undefined" && window.ConsolemRuleEngine ? window.ConsolemRuleEngine : require("./rule-engine.js");
  // Содержимое правила: то, что правит администратор и что хранят версии истории
  const RULE_CONTENT = ["name", "enabled", "logOnly", "logOnlySince", "start", "runMode", "operatorMenu", "ratePerMinute", "windowSec", "runAt", "repeat",
    "triggers", "conditions", "steps", "owner", "purpose", "serverId", "runAsRoleId", "allowChain"];
  const STREAM_DEPTH = 500;
  // Стопка отката: сколько операций и как долго сервер помнит, что вернуть
  const UNDO_KEEP = 50;
  const UNDO_MS = 7 * 86400000;

  function create(opts) {
    const SPEC = opts.openapi || null;
    const FIXTURES = opts.fixtures || { demo: opts.fixture };
    const FIXTURE = opts.fixture || FIXTURES.demo;
    // operationId по методу и шаблону пути контракта: {deviceId} и {id} — одно и то же
    const shape = (template) => template.replace(/\{\w+\}/g, "{}");
    const OPERATION = {};
    if (SPEC)
      Object.entries(SPEC.paths).forEach(([path, item]) =>
        Object.entries(item).forEach(([m, o]) => o && o.operationId && (OPERATION[`${m.toUpperCase()} ${shape(path)}`] = o.operationId))
      );
    const testSupport = !!opts.testSupport;

    // Часы. Тестовый стенд их останавливает и сдвигает (/test/clock), иначе идут вместе с настоящими
    const realNow = opts.now || (() => Date.now());
    const clock = { frozenAt: null, offset: 0 };
    const now = () => (clock.frozenAt != null ? clock.frozenAt : realNow() + clock.offset);
    const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

    let db = null;
    let me = null;
    // Пароли — отдельно от записей: в ответах их нет, только hasPassword
    let secrets = new Map();
    const seq = {};
    let ops = new Map();
    // Стопка повтора: отменённые операции, последняя отменённая — в конце
    let redoStack = [];
    const answered = new Map();

    function load(fixture) {
      db = shiftTimes(clone(fixture), now() - Date.parse(fixture.capturedAt));
      // Расписания и особые дни — календарь (праздники, даты ярмарки): их даты не сдвигаются
      db.schedules = clone(fixture.schedules || []);
      db.dayGroups = clone(fixture.dayGroups || []);
      lastMode = null;
      me = db.me.userId;
      secrets = new Map();
      ops = new Map();
      redoStack = [];
      formatting = new Map();
      searches = new Map();
      syncing = new Map();
      answered.clear();
      // Номера новых id — после самых больших в наборе
      Object.keys(seq).forEach((k) => delete seq[k]);
      JSON.stringify(db).replace(/"id":"([0-9a-f])(\d{7})-(\d{4})-4000-8000-0{12}"/g, (m, kind, n, sub) => {
        const k = sub === "0000" ? kind : `${kind}-${sub}`;
        seq[k] = Math.max(seq[k] || 0, Number(n));
        return m;
      });
    }
    const uuid = (kind) => {
      const k = KIND[kind];
      const [first, sub] = k.split("-");
      seq[k] = (seq[k] || 0) + 1;
      return `${first}${String(seq[k]).padStart(7, "0")}-${sub || "0000"}-4000-8000-000000000000`;
    };
    const engine = Engine.forDb(() => db);
    let lastMode = null;
    const byId = (table, id) => db[table].find((r) => r.id === id) || null;
    // Возможности системы — из набора: так же их объявляет бэкенд в GET /reference
    const caps = () => db.reference.capabilities;
    const can = (feature) => caps().features.includes(feature);

    /* ===== Поток событий ===== */

    let seqEvent = 0;
    const history = [];
    const listeners = new Set();
    function send(type, fields) {
      const message = Object.assign({ id: String(++seqEvent), type, at: iso(now()) }, fields || {});
      history.push(message);
      if (history.length > STREAM_DEPTH) history.shift();
      listeners.forEach((fn) => setTimeout(() => fn(clone(message)), 0));
    }
    const changed = (kind, rec) => send("entity.changed", { kind, entityId: rec.id, version: rec.version });
    // Переподключение с Last-Event-ID: пропущенное досылается; если его уже нет — stream.reset,
    // и клиент перечитывает всё
    function subscribe(fn, lastEventId) {
      if (lastEventId != null && lastEventId !== "") {
        const i = history.findIndex((m) => m.id === String(lastEventId));
        const missed = i >= 0 ? history.slice(i + 1) : [{ id: String(seqEvent), type: "stream.reset", at: iso(now()), payload: {} }];
        missed.forEach((m) => setTimeout(() => fn(clone(m)), 0));
      }
      listeners.add(fn);
      return () => listeners.delete(fn);
    }

    /* ===== Ответы ===== */

    function problem(status, code, message, extra) {
      return { status, body: Object.assign({ code, message }, extra || {}) };
    }
    // Версия записи — непрозрачная строка (контракт): клиенты сравнивают её только на равенство. Встроенный
    // сервер берёт её из общего счётчика: у одной записи она растёт скачками и никогда не повторяется — так
    // никто не опирается на «+1», а старая версия не совпадёт с новой
    let versionSeq = 0;
    const newVersion = () => `v${(++versionSeq).toString(36)}`;
    const bump = (rec) => (rec.version = newVersion());
    const etag = (rec) => `"${rec.version}"`;
    const one = (rec, status) => ({ status: status || 200, body: rec, headers: { ETag: etag(rec) } });
    const items = (list) => ({ status: 200, body: { items: list } });
    const parseMatch = (h) => (h == null ? null : String(h).replace(/^W\//, "").replace(/"/g, "").trim());
    // Версия из If-Match: нет заголовка — 428, не совпала — 412 с актуальной записью; над записью идёт
    // групповая операция — 409 BUSY
    function precondition(rec, headers) {
      const v = parseMatch(headers["if-match"]);
      if (v == null || v === "") return problem(428, "PRECONDITION_REQUIRED", "Нужен заголовок If-Match с версией записи");
      if (v !== rec.version) return problem(412, "VERSION_MISMATCH", "Запись изменилась с момента чтения", { current: clone(rec) });
      return lockedProblem([rec.id]);
    }
    // Объекты групповой операции, пока она не завершена, другим запросам не меняются: первый занятый из ids — 409
    // test — busy для правок; held для удалений: там занято и то, на что ссылается ждущий шаг
    function lockedProblem(ids, test = busy) {
      const at = ids.findIndex(test);
      return at >= 0 ? problem(409, "BUSY", "Над объектом выполняется групповая операция", { params: { targetId: ids[at] } }) : null;
    }

    /* ===== Устройства ===== */

    function device(rec) {
      const out = clone(rec);
      if (secrets.has(rec.id)) out.hasPassword = true;
      return out;
    }
    // Сервер устройства: свой (камера, регистратор, детектор, служба) или ближайшего родителя
    function serverOf(dev) {
      for (let d = dev; d; d = d.parentId ? byId("devices", d.parentId) : null) if (d.serverId) return byId("servers", d.serverId);
      return null;
    }
    const offline = (s) => !!s && s.online === false && s.allocated;

    /* ----- Детекторы ----- */

    const parentOf = (d) => (d.parentId ? byId("devices", d.parentId) : null);
    const detOption = (d, cam) => ((cam || parentOf(d) || {}).detectorOptions || []).find((o) => o.template === d.template) || null;
    function zoneProblem(z) {
      if (!z) return null;
      const n = z.points.length;
      const fits = (z.shape === "polygon" ? n >= 3 : n === 2) && z.points.every((p) => p.length === 2 && p.every((v) => v >= 0 && v <= 1));
      return fits ? null : problem(422, "VALIDATION_FAILED", "Зона: rect и line — две точки, polygon — от трёх, доли от 0 до 1", { field: "zone" });
    }
    // Чувствительность — своя у детектора; настройки нет — и поля нет
    function sensProblem(d, value, cam) {
      const o = detOption(d, cam);
      if (value == null || !o) return null;
      if (o.sensitivityMin == null) return problem(422, "NOT_SUPPORTED", "У детектора нет чувствительности", { field: "sensitivity" });
      return value < o.sensitivityMin || value > o.sensitivityMax ? problem(422, "VALIDATION_FAILED", `Чувствительность от ${o.sensitivityMin} до ${o.sensitivityMax}`, { field: "sensitivity" }) : null;
    }
    // Включённый детектор, с которым этот на одном канале вместе не работает
    function conflictWith(d, cam) {
      const own = detOption(d, cam);
      if (!own) return null;
      return db.devices.find((x) => {
        if (x.parentId !== (cam ? cam.id : d.parentId) || x.id === d.id || x.type !== "det" || x.enabled === false) return false;
        const o = detOption(x, cam);
        return !!o && ((own.conflicts || []).includes(o.template) || (o.conflicts || []).includes(own.template));
      }) || null;
    }
    const conflictParams = (x) => ({ reason: "incompatible", with: x.id });
    const detProblem = (rec, patch) => (rec.type === "det" ? zoneProblem(patch.zone) || sensProblem(rec, patch.sensitivity) : null);
    // Включение несовместимого: в запросе — 409, в групповой операции — fail шага
    function clashProblem(rec, patch) {
      const x = rec.type === "det" && patch.enabled === true && rec.enabled === false ? conflictWith(rec) : null;
      return x ? problem(409, "BUSY", "Детектор несовместим с включённым на этом канале", { field: "enabled", params: conflictParams(x) }) : null;
    }
    // Новый детектор: шаблон из того, что умеет камера. cam — запись родителя, если она уже есть
    function detCreateProblem(spec, cam) {
      if (spec.type !== "det") return null;
      const bad = zoneProblem(spec.zone);
      if (bad) return { code: "VALIDATION_FAILED", field: "zone" };
      if (!spec.builtin || !cam) return null;
      if (!cam.detectorOptions) return { code: "NOT_SUPPORTED", field: "builtin" };
      if (!detOption(spec, cam)) return { code: "VALIDATION_FAILED", field: "template" };
      const s = sensProblem(spec, spec.sensitivity, cam);
      if (s) return { code: s.body.code, field: "sensitivity" };
      if (spec.enabled !== false && conflictWith(spec, cam)) return { code: "BUSY", field: "enabled" };
      return null;
    }

    /* ----- Потоки камеры ----- */

    const RES = /^(\d+)x(\d+)$/;
    const sizeOf = (res) => {
      const m = RES.exec(res || "");
      return m ? { width: Number(m[1]), height: Number(m[2]) } : {};
    };
    const streamsOf = (rec) => rec.streams || [];
    // Разрешение — из вариантов устройства, если устройство их назвало
    const resProblem = (options, res) => (res != null && options && !options.includes(res) ? problem(422, "VALIDATION_FAILED", `Разрешение ${res} камера не поддерживает`, { field: "res" }) : null);
    // Поток записи — один из потоков камеры
    function streamRefProblem(rec, patch) {
      if (!rec.streams) return null;
      const known = (id) => id == null || rec.streams.some((s) => s.id === id);
      if ("stream" in patch && !known(patch.stream)) return problem(422, "VALIDATION_FAILED", `Нет потока ${patch.stream}`, { field: "stream" });
      return (patch.extraArchives || []).some((x) => !known(x.stream)) ? problem(422, "VALIDATION_FAILED", "Нет такого потока", { field: "extraArchives" }) : null;
    }
    // Новый состав потоков: основной поток — это Device.res, Device.fps. Правка — одиночная операция в стопке
    function setStreams(rec, next) {
      const patch = { streams: next };
      const main = next[0];
      if (main) ["res", "fps"].forEach((k) => { if (main[k] !== rec[k]) patch[k] = main[k] == null ? null : main[k]; });
      const before = applyPatch(rec, patch);
      changed("device", rec);
      recordSingle([setStep(rec, patch, before)]);
      return one(device(rec));
    }

    /* ----- Виды устройств: что находит сервер, что заводит оператор ----- */

    const found = (type) => (caps().foundDeviceTypes || []).includes(type);
    const unitType = (type) => (caps().unitTypes || []).includes(type);
    const ACS = new Set(["acfa", "acfa_sensor", "acfa_lock", "acfa_fence"]);
    // Единица СКУД: вид acfa_* или вид-единица под родителем из СКУД (реле замка)
    const isUnit = (d) => {
      if (!unitType(d.type)) return false;
      if (!found(d.type)) return true;
      const p = d.parentId ? byId("devices", d.parentId) : null;
      return !!p && ACS.has(p.type);
    };
    // Вид, который можно создать под этим родителем. parent — запись или описание родителя из children
    const creatable = (spec, parent) => caps().deviceTypes.includes(spec.type) && (!found(spec.type) || (unitType(spec.type) && !!parent && ACS.has(parent.type)));
    const alienType = (spec, parent) => !creatable(spec, parent) || (spec.children || []).some((c) => alienType(c, spec));
    // В папках лежат камеры, регистраторы с записью, источники событий, СКУД; входы, выходы и единицы — нет
    const folderable = (d) => !found(d.type) && !unitType(d.type) && !d.derived;
    // Что можно менять у записи: capabilities.writableFields; у выведенного ipsrv — ничего
    function fieldProblem(rec, patch) {
      const w = (caps().writableFields || {})[rec.type];
      if (!rec.derived && !w) return null;
      if (rec.derived || !w.length) return problem(422, "NOT_SUPPORTED", "У этой записи нет правок", { field: "type" });
      const field = Object.keys(patch).find((k) => !w.includes(k) || (k === "path" && !isUnit(rec)));
      return field ? problem(422, "NOT_SUPPORTED", `Поле ${field} у этого вида не правится`, { field }) : null;
    }
    // Правка не оставляет камеру без адреса
    const addressProblem = (rec, patch) => {
      if (rec.type !== "camera" || rec.parentId || !["rtspUrl", "vendor", "model"].some((k) => k in patch)) return null;
      return hasAddress(Object.assign({}, rec, patch)) ? null : problem(422, "VALIDATION_FAILED", "Нужен адрес камеры или производитель и модель", { field: "rtspUrl" });
    };
    const videoProblem = (rec, patch) => resProblem(rec.resOptions, patch.res) || streamRefProblem(rec, patch);
    // Device.res, Device.fps — это основной поток
    function syncMain(rec, patch) {
      const main = streamsOf(rec)[0];
      if (!main || !("res" in patch || "fps" in patch)) return;
      ["res", "fps"].forEach((k) => { if (k in rec) main[k] = rec[k]; else delete main[k]; });
      Object.assign(main, sizeOf(main.res));
    }
    const deleteProblem = (d) => (d.derived || (found(d.type) && !isUnit(d)) ? problem(422, "NOT_SUPPORTED", "Запись не удаляется: её ведёт сервер", { field: "type" }) : null);

    // Проверка изменения до выполнения: ссылки ведут в существующие записи, имя не пустое
    function patchProblem(patch) {
      if ("name" in patch && !String(patch.name || "").trim()) return problem(422, "NAME_REQUIRED", "Имя не может быть пустым", { field: "name" });
      const refs = { serverId: "servers", archiveId: "archives", cameraId: "devices" };
      for (const [field, table] of Object.entries(refs)) {
        if (patch[field] != null && !byId(table, patch[field])) return problem(422, "VALIDATION_FAILED", `Нет записи ${patch[field]}`, { field });
      }
      for (const x of patch.extraArchives || []) {
        if (!byId("archives", x.archiveId)) return problem(422, "VALIDATION_FAILED", `Нет хранилища ${x.archiveId}`, { field: "extraArchives" });
      }
      return null;
    }
    // Объект изменения по id: устройство, сервер или домен — у каждого своя схема изменения
    const KINDS = [
      ["devices", "device", "DevicePatch"],
      ["servers", "server", "ServerPatch"],
      ["domains", "domain", "DomainPatch"],
      ["archives", "archive", "ArchivePatch"],
      ["volumes", "volume", "VolumePatch"],
    ];
    function targetOf(id) {
      for (const [table, kind, schema] of KINDS) {
        const rec = byId(table, id);
        if (rec) return { table, kind, schema, rec };
      }
      return null;
    }
    const view = (t) => (t.kind === "device" ? device(t.rec) : t.kind === "volume" ? volume(t.rec) : clone(t.rec));

    /* ===== Тома ===== */

    // Форматирование идёт по часам сервера: том → когда закончится
    const FORMAT_MS = 1500;
    let formatting = new Map();
    function volume(rec) {
      const out = clone(rec);
      if (secrets.has(rec.id)) out.hasPassword = true;
      if (secrets.has(rec.id + ":secret")) out.hasSecret = true;
      return out;
    }
    // Том годится для хранилища: у локального — диск его сервера, не занятый разделом и не повторяющийся
    // в этом хранилище; у облачного — бакет
    function volumeProblem(a, v) {
      if (!String(v.disk || "").trim()) return problem(422, "VALIDATION_FAILED", "Укажите диск или путь", { field: "disk" });
      if (a.kind === "cloud" && !String(v.bucket || "").trim()) return problem(422, "VALIDATION_FAILED", "Укажите бакет", { field: "bucket" });
      if (a.kind !== "local") return null;
      const s = byId("servers", a.serverId);
      if (!s.disks.some((d) => d.disk === v.disk)) return problem(422, "VALIDATION_FAILED", `На сервере нет диска ${v.disk}`, { field: "disk" });
      const onDisk = db.volumes.filter((x) => x.disk === v.disk && db.archives.some((y) => y.id === x.archiveId && y.kind === "local" && y.serverId === a.serverId));
      if (onDisk.some((x) => x.archiveId === a.id || x.mode === "part") || (v.mode === "part" && onDisk.length))
        return problem(409, "DISK_TAKEN", `Диск ${v.disk} занят`, { field: "disk" });
      return null;
    }
    function newVolume(a, spec) {
      const v = { id: uuid("volume"), archiveId: a.id, name: spec.name, disk: spec.disk, sizeBytes: spec.sizeBytes, usedPercent: 0,
        // Раздел целиком подключают неотформатированным: форматируют отдельно, когда решат
        state: a.kind === "local" && spec.mode === "part" ? "unfmt" : "ready", online: true };
      Object.entries(spec).forEach(([k, x]) => {
        if (k === "password") secrets.set(v.id, x);
        else if (k === "secret") secrets.set(v.id + ":secret", x);
        else if (!(k in v)) v[k] = clone(x);
      });
      v.version = newVersion();
      db.volumes.push(v);
      return v;
    }
    function domainNameProblem(name, exceptId) {
      const v = String(name || "").trim();
      if (!v) return problem(422, "NAME_REQUIRED", "Укажите имя домена", { field: "name" });
      if (db.domains.some((d) => d.id !== exceptId && d.name.trim().toLowerCase() === v.toLowerCase())) return problem(409, "NAME_TAKEN", "Домен с таким именем уже есть", { field: "name" });
      return null;
    }
    // Изменение — по схеме своего вида и по смыслу: ссылки ведут в существующие записи, имя не пустое,
    // имя домена не занято
    function setProblem(t, patch) {
      if (SPEC && window.ConsolemContract) {
        const errs = window.ConsolemContract.check(SPEC, { $ref: `#/components/schemas/${t.schema}` }, patch, "set", []);
        if (errs.length) {
          const field = (errs[0].match(/^set\.?([^:\s[]*)/) || [])[1];
          return problem(422, "VALIDATION_FAILED", errs.slice(0, 3).join("; "), field ? { field } : {});
        }
      }
      if (t.kind === "domain" && "name" in patch) return domainNameProblem(patch.name, t.rec.id);
      return (t.kind === "device" ? fieldProblem(t.rec, patch) || addressProblem(t.rec, patch) || videoProblem(t.rec, patch) || detProblem(t.rec, patch) : null) || featureProblem(t.kind, patch) || patchProblem(patch);
    }
    // Необязательные настройки, которых в системе нет (capabilities.features), менять нельзя
    const FEATURE_FIELDS = { server: { role: "serverRoles", netmask: "serverNetwork", gateway: "serverNetwork", dns: "serverNetwork" } };
    function featureProblem(kind, patch) {
      const field = Object.keys(patch).find((k) => FEATURE_FIELDS[kind] && FEATURE_FIELDS[kind][k] && !can(FEATURE_FIELDS[kind][k]));
      if (field) return problem(422, "NOT_SUPPORTED", `Система не поддерживает: ${field}`, { field });
      if (kind === "archive" && patch.encrypted === true && !can("archiveEncryption")) return problem(422, "NOT_SUPPORTED", "Система не поддерживает шифрование хранилищ", { field: "encrypted" });
      return null;
    }
    // Значения до изменения — для отката: поля, которых не было, — null
    function applyPatch(rec, patch) {
      const before = {};
      Object.entries(patch).forEach(([k, v]) => {
        if (k === "password" || k === "secret") {
          const sk = k === "password" ? rec.id : rec.id + ":secret";
          before[k] = secrets.has(sk) ? secrets.get(sk) : null;
          if (v === null || v === "") secrets.delete(sk);
          else secrets.set(sk, v);
          return;
        }
        before[k] = k in rec ? clone(rec[k]) : null;
        if (v === null) delete rec[k];
        else rec[k] = clone(v);
      });
      bump(rec);
      return before;
    }

    /* ===== Устройства: создание и удаление ===== */

    // Номер устройства (ID в системе) — у камер, регистраторов, источников событий и СКУД; без своего
    // номера считается короткое имя, если оно числом
    const NUMBERED = new Set(["camera", "ipsrv", "eventsrc", "acfa"]);
    const numberOf = (d) => (d.identifier != null && d.identifier !== "" ? String(d.identifier) : /^\d+$/.test(String(d.short || "")) ? String(d.short) : "");
    function nextIdentifier() {
      return String(Math.max(0, ...db.devices.filter((d) => NUMBERED.has(d.type)).map((d) => Number(numberOf(d)) || 0)) + 1);
    }
    // Адрес камеры: свой rtspUrl или адрес драйвера по производителю и модели
    const hasAddress = (d) => !!d.rtspUrl || (!!d.vendor && !!d.model);
    function createProblem(spec, domainId, parentId, folderId) {
      if (!byId("domains", domainId)) return { code: "NOT_FOUND", field: "domainId" };
      if (parentId) {
        const p = byId("devices", parentId);
        if (!p) return { code: "NOT_FOUND", field: "parentId" };
        if (p.domainId !== domainId) return { code: "PARENT_MISMATCH", field: "parentId" };
      }
      if (alienType(spec, parentId ? byId("devices", parentId) : null)) return { code: "NOT_SUPPORTED", field: "type" };
      if (folderId) {
        const f = byId("folders", folderId);
        if (!f || f.domainId !== domainId) return { code: "VALIDATION_FAILED", field: "folderId" };
        if (!folderable(spec)) return { code: "NOT_SUPPORTED", field: "folderId" };
      }
      const bad = patchProblem(spec);
      if (bad) return { code: bad.body.code, field: bad.body.field };
      if (spec.type === "camera" && !parentId && !hasAddress(spec)) return { code: "VALIDATION_FAILED", field: "rtspUrl" };
      const det = detCreateProblem(spec, parentId ? byId("devices", parentId) : null);
      if (det) return det;
      if (NUMBERED.has(spec.type) && spec.identifier != null && spec.identifier !== "") {
        if (db.devices.some((d) => NUMBERED.has(d.type) && numberOf(d) === String(spec.identifier))) return { code: "IDENTIFIER_TAKEN", field: "identifier" };
      }
      for (const c of spec.children || []) {
        const e = patchProblem(c);
        if (e) return { code: e.body.code, field: "children" };
      }
      return null;
    }
    // Устройство с дочерними — родитель первым, как в списке устройств
    function createDevice(spec, domainId, parentId, folderId) {
      const bad = createProblem(spec, domainId, parentId, folderId);
      if (bad) return bad;
      const devices = [];
      const make = (s, parent) => {
        const d = { id: uuid("device"), type: s.type, parentId: parent, domainId };
        Object.entries(s).forEach(([k, v]) => {
          if (k === "children" || k === "type") return;
          if (k === "password") {
            if (v) secrets.set(d.id, v);
            return;
          }
          d[k] = clone(v);
        });
        if (!parent && NUMBERED.has(s.type) && (d.identifier == null || d.identifier === "")) d.identifier = nextIdentifier();
        if (!("enabled" in d)) d.enabled = true;
        d.online = true;
        if (s.type === "camera") d.streams = [Object.assign({ id: "main", name: "Основной", online: true }, d.res ? { res: d.res, ...sizeOf(d.res) } : {}, d.fps ? { fps: d.fps } : {})];
        d.version = newVersion();
        db.devices.push(d);
        devices.push(d);
        send("entity.created", { kind: "device", entityId: d.id, version: d.version });
        (s.children || []).forEach((c) => make(c, d.id));
      };
      make(spec, parentId || null);
      const folders = [];
      if (folderId) {
        const f = byId("folders", folderId);
        f.deviceIds = f.deviceIds.concat(devices[0].id);
        bump(f);
        changed("folder", f);
        folders.push(f);
      }
      return { devices, folders };
    }
    // Что пропадает с записью: дочерние. Камеры регистратора остаются — снимается только запись устройства
    function goneWith(rec) {
      const gone = withChildren(rec.id);
      if (rec.type !== "ipsrv") return gone;
      db.devices.filter((d) => d.parentId === rec.id && d.type === "camera").forEach((c) => withChildren(c.id).forEach((x) => gone.delete(x)));
      return gone;
    }
    // Вместе с дочерними; ссылки на него убираются из папок и из записи по детекторам
    function removeDevice(id) {
      const gone = goneWith(byId("devices", id));
      db.devices.filter((d) => d.parentId === id && !gone.has(d.id)).forEach((c) => {
        c.parentId = null;
        bump(c);
        changed("device", c);
      });
      const names = new Map(db.devices.filter((d) => gone.has(d.id)).map((d) => [d.id, d.name]));
      db.devices = db.devices.filter((d) => !gone.has(d.id));
      rulesGone(names);
      db.folders.forEach((f) => {
        if (!f.deviceIds.some((x) => gone.has(x))) return;
        f.deviceIds = f.deviceIds.filter((x) => !gone.has(x));
        bump(f);
        changed("folder", f);
      });
      db.devices.forEach((d) => {
        if (!(d.recordDetectorIds || []).some((x) => gone.has(x))) return;
        d.recordDetectorIds = d.recordDetectorIds.filter((x) => !gone.has(x));
        bump(d);
        changed("device", d);
      });
      gone.forEach((x) => {
        secrets.delete(x);
        wasRemoved.add(x);
        send("entity.deleted", { kind: "device", entityId: x });
      });
    }

    // Папка — вместе с подпапками; сами устройства остаются в системе
    function removeFolder(f) {
      const gone = withSubfolders(f);
      db.folders = db.folders.filter((x) => !gone.has(x.id));
      gone.forEach((id) => send("entity.deleted", { kind: "folder", entityId: id }));
    }
    // Хранилище — с томами. Камеры остаются: основным становится первое дополнительное хранилище, без него
    // запись выключается
    function removeArchive(a) {
      db.devices.forEach((d) => {
        const extra = (d.extraArchives || []).filter((x) => x.archiveId !== a.id);
        const main = d.archiveId === a.id;
        if (!main && extra.length === (d.extraArchives || []).length) return;
        if (d.extraArchives) d.extraArchives = extra;
        if (main) {
          const next = extra.shift();
          if (next) Object.assign(d, { archiveId: next.archiveId, recordMode: next.recordMode, stream: next.stream });
          else Object.assign(d, { archiveId: null, recordMode: "none" });
        }
        bump(d);
        changed("device", d);
      });
      db.volumes.filter((v) => v.archiveId === a.id).forEach(removeVolume);
      db.archives = db.archives.filter((x) => x !== a);
      send("entity.deleted", { kind: "archive", entityId: a.id });
    }
    // Правило — с историей версий и своими расписаниями, если они больше нигде не используются;
    // журнал его запусков остаётся
    function removeRule(r) {
      db.rules = db.rules.filter((x) => x !== r);
      db.ruleVersions = db.ruleVersions.filter((v) => v.ruleId !== r.id);
      send("entity.deleted", { kind: "rule", entityId: r.id });
      db.schedules.filter((sc) => sc.owner && sc.owner.kind === "rule" && sc.owner.id === r.id && !scheduleUsed(sc.id)).forEach(removeSchedule);
    }
    function removeVolume(v) {
      db.volumes = db.volumes.filter((x) => x !== v);
      formatting.delete(v.id);
      send("entity.deleted", { kind: "volume", entityId: v.id });
    }
    // Запись с потомками по parentId: устройство — с дочерними, папка — с подпапками
    function subtree(table, id) {
      const all = new Set([id]);
      for (let grew = true; grew; ) {
        grew = false;
        db[table].forEach((x) => {
          if (x.parentId && all.has(x.parentId) && !all.has(x.id)) {
            all.add(x.id);
            grew = true;
          }
        });
      }
      return all;
    }
    const withChildren = (id) => subtree("devices", id);
    const withSubfolders = (f) => subtree("folders", f.id);
    // Что меняет удаление записи (для проверки на групповую операцию): устройство — с дочерними и камеры, что
    // записывают по его детекторам; папка — состав, то есть папки лежащих в ней устройств; хранилище — с томами
    // и камерами, что в него пишут
    function touchedBy(table, rec) {
      if (table === "devices") {
        const gone = withChildren(rec.id);
        return [...gone].concat(db.devices.filter((d) => (d.recordDetectorIds || []).some((x) => gone.has(x))).map((d) => d.id));
      }
      if (table === "folders") {
        const gone = withSubfolders(rec);
        return [...gone].concat(db.folders.filter((f) => gone.has(f.id)).flatMap((f) => f.deviceIds));
      }
      if (table === "archives") {
        const writes = (d) => d.archiveId === rec.id || (d.extraArchives || []).some((x) => x.archiveId === rec.id);
        return [rec.id].concat(db.volumes.filter((v) => v.archiveId === rec.id).map((v) => v.id), db.devices.filter(writes).map((d) => d.id));
      }
      return [rec.id];
    }

    /* ===== Автоматизация ===== */

    const ruleView = (r) => clone(r);
    const content = (r) => Object.fromEntries(RULE_CONTENT.map((k) => [k, clone(r[k])]));
    const myLogin = () => (db.access.users.find((u) => u.id === me) || {}).login || "";
    // Цели правила (и вложенные — в шагах, ожидаемом событии): fn(target) → новая цель
    function eachTarget(c, fn) {
      c.triggers.forEach((t) => (t.target = fn(t.target)));
      c.conditions.forEach((x) => "target" in x && (x.target = fn(x.target)));
      const walk = (l) => l.forEach((a) => {
        if ("target" in a) a.target = fn(a.target);
        if (a.event) a.event.target = fn(a.event.target);
        walk(a.yes || []);
        walk(a.no || []);
      });
      walk(c.steps);
    }
    // Удалённое устройство остаётся в цели битым элементом — по имени; исключение удалённого просто снимается.
    // В версиях истории — так же, иначе «Сравнить» покажет удаление как правку
    function rulesGone(names) {
      if (!names.size) return;
      const fix = (t) => {
        if (!t) return t;
        const hit = t.include.filter((x) => x.kind === "device" && names.has(x.id));
        if (!hit.length && !t.exclude.some((x) => names.has(x))) return t;
        return Object.assign({}, t, { include: t.include.filter((x) => !hit.includes(x)), exclude: t.exclude.filter((x) => !names.has(x)),
          gone: [...t.gone, ...hit.map((x) => names.get(x.id))] });
      };
      db.rules.forEach((r) => {
        const was = JSON.stringify(r);
        eachTarget(r, fix);
        if (JSON.stringify(r) === was) return;
        bump(r);
        changed("rule", r);
      });
      db.ruleVersions.forEach((v) => eachTarget(v.rule, fix));
    }
    // Версия истории: что стало после изменения. undo убирает версию, которую отменяет, если она последняя
    // was — кто и когда менял правило и с какого дня оно «в наблюдении» до этой правки. «Отменить»
    // правки возвращает их: отменённое изменение не считается изменением (версия записи — всё равно новая)
    const ruleMeta = (r) => ({ changedAt: r.changedAt, changedBy: r.changedBy, logOnlySince: r.logOnlySince });
    function pushVersion(r, note, was) {
      const h = db.ruleVersions.filter((v) => v.ruleId === r.id);
      if (note && note.code === "undo") {
        const last = h[h.length - 1];
        if (last && last.number === note.params.number) {
          db.ruleVersions = db.ruleVersions.filter((v) => v !== last);
          if (last.was) Object.assign(r, last.was);
          return;
        }
      }
      db.ruleVersions.push({ id: uuid("ruleVersion"), ruleId: r.id, number: h.length ? h[h.length - 1].number + 1 : 1, at: iso(now()), by: myLogin(), note: note || null, rule: content(r), was: was || null });
    }
    const versionView = (v) => { const out = clone(v); delete out.was; return out; };
    // Номер входа и выхода — в записи. Поле правила, если оно есть, значит то же самое
    function portIssue(c) {
      const off = (target, port) => (target ? target.include : []).some((x) => {
        const d = x.kind === "device" ? byId("devices", x.id) : null;
        return !!d && d.channel != null && d.channel !== Number(port);
      });
      if (c.triggers.some((t) => t.kind === "io.input" && t.match.port != null && off(t.target, t.match.port))) return "trigger.portMismatch";
      const walk = (l) => l.some((a) => (a.action === "output" && a.port != null && off(a.target, a.port)) || walk(a.yes || []) || walk(a.no || []));
      return walk(c.steps) ? "action.portMismatch" : null;
    }
    function ruleProblem(c) {
      if (!String(c.name || "").trim()) return problem(422, "NAME_REQUIRED", "Укажите название правила", { field: "name" });
      const port = portIssue(c);
      if (port) return problem(422, "RULE_INVALID", "Номер входа или выхода не совпал с записью", { params: { issue: { code: port, params: {} } } });
      if (c.enabled) {
        const why = engine.issue(Object.assign({ id: null }, c));
        if (why) return problem(422, "RULE_INVALID", "Правило с ошибкой нельзя включить: исправьте ошибку или выключите правило", { params: { issue: why } });
      }
      return null;
    }
    const stateNote = (r) => ({ code: "state", params: { mode: !r.enabled ? "off" : r.logOnly ? "watch" : "on" } });
    const sysToday = () => engine.stamp(now()).slice(0, 10);
    function storeFire(f) {
      const rec = Object.assign({ id: uuid("fire") }, f);
      db.ruleFires.push(rec);
      send("entity.created", { kind: "ruleFire", entityId: rec.id, payload: { ruleId: rec.ruleId } });
      return rec;
    }
    // Владелец расписания — существующее окно обслуживания или правило
    const ownerProblem = (o) =>
      o && !byId(o.kind === "rule" ? "rules" : "maintenanceWindows", o.id) ? problem(422, "VALIDATION_FAILED", `Владельца расписания ${o.id} нет`, { field: "owner" }) : null;
    // Где используется расписание: режимы, условия «Время», окна обслуживания
    const scheduleUsed = (id) =>
      db.modes.items.some((m) => m.scheduleId === id) || db.maintenanceWindows.some((w) => w.scheduleId === id) ||
      db.rules.some((r) => r.conditions.some((c) => c.kind === "time" && c.scheduleId === id));
    const never = () => (db.schedules.find((s) => s.builtin && s.kind === "never") || {}).id || null;
    function removeSchedule(sc) {
      db.schedules = db.schedules.filter((x) => x !== sc);
      send("entity.deleted", { kind: "schedule", entityId: sc.id });
      if (db.modes.items.some((m) => m.scheduleId === sc.id)) {
        db.modes.items.forEach((m) => m.scheduleId === sc.id && (m.scheduleId = null));
        bump(db.modes);
        send("entity.changed", { kind: "modes", version: db.modes.version });
      }
      db.rules.forEach((r) => {
        const hit = r.conditions.filter((c) => c.kind === "time" && c.scheduleId === sc.id);
        if (!hit.length) return;
        hit.forEach((c) => (c.scheduleId = never()));
        bump(r);
        changed("rule", r);
      });
      db.maintenanceWindows.forEach((w) => {
        if (w.scheduleId !== sc.id) return;
        w.scheduleId = never();
        bump(w);
        changed("maintenanceWindow", w);
      });
    }
    const modeCurrent = () => {
      const m = db.modeManual, live = m && db.modes.items.some((x) => x.id === m.modeId) && (!m.until || Date.parse(m.until) > now());
      return { modeId: engine.modeNow(now()), manual: live ? { until: m.until || null } : null };
    };
    // Смена текущего режима (по расписанию или вручную) — событием objectMode
    function modeTick() {
      const m = engine.modeNow(now());
      if (lastMode !== null && m !== lastMode) send("entity.changed", { kind: "objectMode", entityId: m });
      lastMode = m;
    }

    /* ===== Права ===== */

    const SYNC_MS = 1500;
    let syncing = new Map();
    const lower = (s) => String(s || "").trim().toLowerCase();
    // Сегодня по часам и часовому поясу системы — для сроков назначений
    function today() {
      const p = new Intl.DateTimeFormat("en-CA", { timeZone: db.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now()));
      return p;
    }
    // Кто сейчас администратор с неограниченным доступом: включён, роль с unr — личная или группы, срок не истёк
    function admins(a) {
      const unr = new Set(a.roles.filter((r) => r.global.unr).map((r) => r.id));
      const t = today();
      const live = (until) => !until || until >= t;
      return a.users.filter((u) => {
        if (!u.enabled || (u.expiresDate && u.expiresDate < t)) return false;
        if (u.roleIds.some((r) => unr.has(r) && live(u.roleUntil[r]))) return true;
        return a.groups.some((g) => g.memberIds.includes(u.id) && live(g.rolesUntil) && g.roleIds.some((r) => unr.has(r)));
      });
    }
    function accessProblem(a) {
      const dup = (list, key, code, what) => {
        const seen = new Set();
        for (const x of list) {
          const k = lower(x[key]);
          if (!k) return problem(422, "NAME_REQUIRED", `Пустое имя: ${what}`, { field: key });
          if (seen.has(k)) return problem(409, code, `${what} «${x[key]}» повторяется`, { field: key, params: { value: x[key] } });
          seen.add(k);
        }
        return null;
      };
      const bad =
        dup(a.roles, "name", "NAME_TAKEN", "Роль") || dup(a.users, "login", "LOGIN_TAKEN", "Логин") || dup(a.groups, "name", "NAME_TAKEN", "Группа") || dup(a.catalogs, "name", "NAME_TAKEN", "Каталог");
      if (bad) return bad;
      const ids = (list) => new Set(list.map((x) => x.id));
      const roles = ids(a.roles), users = ids(a.users), groups = ids(a.groups), cats = ids(a.catalogs);
      const all = [...roles, ...users, ...groups, ...cats];
      if (new Set(all).size !== all.length) return problem(422, "VALIDATION_FAILED", "id повторяются", { field: "id" });
      const miss = (cond, what) => (cond ? null : problem(422, "VALIDATION_FAILED", `Ссылка никуда не ведёт: ${what}`, { field: what }));
      for (const r of a.roles) {
        const e = miss(!r.supervision.roleId || roles.has(r.supervision.roleId), "supervision.roleId");
        if (e) return e;
      }
      for (const u of a.users) {
        const e =
          miss(u.roleIds.every((x) => roles.has(x)) && Object.keys(u.roleUntil).every((x) => roles.has(x)), "roleIds") ||
          miss(!u.catalogId || cats.has(u.catalogId), "catalogId") ||
          miss(!u.syncedGroupId || groups.has(u.syncedGroupId), "syncedGroupId");
        if (e) return e;
      }
      for (const g of a.groups) {
        const e = miss(g.roleIds.every((x) => roles.has(x)), "groups.roleIds") || miss(g.memberIds.every((x) => users.has(x)), "memberIds") || miss(!g.source || cats.has(g.source.catalogId), "source.catalogId");
        if (e) return e;
      }
      // Защита от самоблокировки: администратор остаётся, и текущий — среди них
      const left = admins(a);
      if (!left.length) return problem(409, "SELF_LOCKOUT", "Не останется ни одного администратора с неограниченным доступом");
      if (!left.some((u) => u.id === me)) return problem(409, "SELF_LOCKOUT", "Вы потеряете неограниченный доступ или вход");
      return null;
    }

    /* ===== Поиск устройств в сети ===== */

    // Находка — раз в 140 мс по часам сервера: столько, сколько в макете
    const DISCOVERY_STEP_MS = 140;
    let searches = new Map();
    const wasRemoved = new Set();
    function discoveryOf(domainId) {
      let d = db.discovery.find((x) => x.domainId === domainId);
      if (!d) db.discovery.push((d = { domainId, state: "idle", progress: 0, startedAt: null, finishedAt: null, candidateIds: [] }));
      return d;
    }
    function candidate(id) {
      const c = clone(db.network.find((x) => x.id === id));
      delete c.domainIds;
      return c;
    }
    function discoveryView(domainId) {
      const d = db.discovery.find((x) => x.domainId === domainId);
      if (!d) return { domainId, state: "idle", progress: 0, startedAt: null, finishedAt: null, candidates: [] };
      return { domainId, state: d.state, progress: d.progress, startedAt: d.startedAt || null, finishedAt: d.finishedAt || null, candidates: d.candidateIds.map(candidate) };
    }
    function finishDiscovery(domainId, state) {
      searches.delete(domainId);
      const d = discoveryOf(domainId);
      Object.assign(d, { state, finishedAt: iso(now()) });
      if (state === "done") d.progress = 100;
      send("discovery.finished", { kind: "discovery", entityId: domainId, payload: { state, progress: d.progress } });
    }
    function tickDiscovery(fired) {
      searches.forEach((s, domainId) => {
        while (searches.has(domainId) && s.nextAt <= now()) {
          const id = s.queue.shift();
          const d = discoveryOf(domainId);
          d.candidateIds.push(id);
          d.progress = Math.round(((s.total - s.queue.length) / s.total) * 100);
          send("discovery.progress", { kind: "discovery", entityId: domainId, payload: { progress: d.progress, candidate: candidate(id) } });
          s.nextAt += DISCOVERY_STEP_MS;
          if (!s.queue.length) {
            finishDiscovery(domainId, "done");
            fired.push({ kind: "discovery", id: domainId });
          }
        }
      });
    }

    /* ===== Папки устройства ===== */

    const foldersOf = (deviceId) => db.folders.filter((f) => f.deviceIds.includes(deviceId)).map((f) => f.id);
    function setFolders(deviceId, folderIds) {
      const before = foldersOf(deviceId);
      db.folders.forEach((f) => {
        const has = f.deviceIds.includes(deviceId);
        const want = folderIds.includes(f.id);
        if (has === want) return;
        f.deviceIds = want ? f.deviceIds.concat(deviceId) : f.deviceIds.filter((x) => x !== deviceId);
        bump(f);
        changed("folder", f);
      });
      return before;
    }

    /* ===== Групповые операции ===== */

    // Шаг выполняется за 90–230 мс: столько, сколько в макете шла очередь. Разброс — от номера шага,
    // чтобы ход был живым и при этом повторялся от прогона к прогону
    const stepMs = (i) => 90 + ((i * 53) % 141);
    // Почему операцию нельзя откатить: null — можно
    const undoing = (x) => (x.revertOf || x.redoOf) && x.state !== "done";
    // Стопка отката — законченные операции с удачными шагами, не откачанные и не сами откаты. Откатить можно только
    // верхнюю: самую новую по концу, при равенстве — созданную позже. Пока идёт откат, верхней нет
    function undoTop() {
      const all = [...ops.values()];
      if (all.some(undoing)) return null;
      return all.filter((x) => x.state === "done" && !x.revertOf && !x.reverted && x.items.some((i) => i.state === "ok"))
        .reduce((top, x) => (!top || Date.parse(x.finishedAt) >= Date.parse(top.finishedAt) ? x : top), null);
    }
    const revertReason = (op) =>
      op.revertOf ? "isRevert" : op.state !== "done" ? "running" : op.reverted ? "reverted" : !op.items.some((x) => x.state === "ok") ? "empty" : now() - Date.parse(op.finishedAt) > UNDO_MS ? "expired" : undoTop() !== op ? "notLast" : null;
    // Почему отменённую операцию нельзя повторить: null — можно. Очищенное и просроченное — stale
    function redoReason(op) {
      if (!redoStack.includes(op.id) || now() - Date.parse(op.finishedAt) > UNDO_MS) return "stale";
      return redoStack[redoStack.length - 1] !== op.id || [...ops.values()].some(undoing) ? "notLast" : null;
    }
    // Поля записи, которые изменил шаг: откат сверяет именно их
    const fieldsOf = (rec, set) => Object.fromEntries(Object.keys(set).filter((k) => k !== "password" && k !== "secret").map((k) => [k, k in rec ? clone(rec[k]) : null]));
    const sameFields = (rec, want) => Object.entries(want).every(([k, v]) => JSON.stringify(k in rec ? rec[k] : null) === JSON.stringify(v));
    // Одиночная правка — законченная операция из одного шага. Так откат идёт цепочкой назад и через правки
    // по одной. Ответ правки не меняется, id — из GET /operations
    function recordSingle(steps) {
      if (!steps.length) return;
      const at = iso(now());
      redoStack = [];
      const op = { id: uuid("operation"), state: "done", createdAt: at, finishedAt: at, revertOf: null, redoOf: null, retryOf: null, single: true, nextAt: 0,
        items: steps.map((x, index) => Object.assign({ index, state: "ok", code: null, req: {} }, x)) };
      ops.set(op.id, op);
      trimOps();
      send("operation.finished", { kind: "operation", entityId: op.id, payload: { state: "done", ok: op.items.length, failed: 0, cancelled: 0 } });
    }
    function trimOps() {
      const done = [...ops.values()].filter((op) => op.state === "done");
      done.slice(0, Math.max(0, done.length - UNDO_KEEP)).forEach((op) => ops.delete(op.id));
    }
    const setStep = (rec, set, before) => ({ targetId: rec.id, version: rec.version, before: { set: before }, after: fieldsOf(rec, set), secret: "password" in set || "secret" in set });
    const opView = (op) => ({
      id: op.id,
      state: op.state,
      createdAt: op.createdAt,
      finishedAt: op.finishedAt,
      revertOf: op.revertOf,
      redoOf: op.redoOf || null,
      retryOf: op.retryOf,
      single: !!op.single,
      revertible: !revertReason(op),
      redoable: !redoReason(op),
      total: op.items.length,
      done: op.items.filter((x) => x.state !== "wait" && x.state !== "run").length,
      ok: op.items.filter((x) => x.state === "ok").length,
      failed: op.items.filter((x) => x.state === "fail").length,
      cancelled: op.items.filter((x) => x.state === "cancel").length,
      items: op.items.map((x) => {
        const out = { index: x.index, targetId: x.targetId, state: x.state, code: x.code };
        if (x.version !== undefined) out.version = x.version;
        if (x.createdId) out.createdId = x.createdId;
        if (x.params) out.params = x.params;
        return out;
      }),
    });
    const pending = (fn) => [...ops.values()].some((op) => op.state !== "done" && op.items.some((x) => (x.state === "wait" || x.state === "run") && fn(x)));
    const busy = (targetId) => pending((x) => x.targetId === targetId);
    // Папка из folderIds или хранилище из set.archiveId ещё не выполненного шага: удалить их — шаг молча
    // выполнится не так, как просили. Менять можно, удалять нельзя
    const held = (id) => busy(id) || pending((x) => (x.req.folderIds || []).includes(id) || (x.req.set || {}).archiveId === id || ((x.req.set || {}).extraArchives || []).some((e) => e.archiveId === id));

    function startOperation(requests, extra) {
      // Новая правка очищает повтор; откат и повтор сами стопку не трогают
      if (!extra || !(extra.revertOf || extra.redoOf)) redoStack = [];
      const op = Object.assign(
        {
          id: uuid("operation"),
          state: "running",
          createdAt: iso(now()),
          finishedAt: null,
          revertOf: null,
          retryOf: null,
          items: requests.map((r, index) => ({ index, targetId: r.targetId, state: "wait", code: null, req: r })),
          nextAt: now() + stepMs(0),
        },
        extra || {}
      );
      ops.set(op.id, op);
      return op;
    }

    // Отказы — как в очереди макета: сервер устройства без связи не примет изменение; включить
    // камеру с превышенной лицензией нельзя; версия объекта для отката не совпала — его меняли после
    function runItem(op, item) {
      if (item.req.undoable === false) return Object.assign(item, { state: "fail", code: "NOT_SUPPORTED" });
      const t = targetOf(item.targetId);
      if (!t) return Object.assign(item, { state: "fail", code: "NOT_FOUND" });
      const rec = t.rec;
      if (item.req.expect !== undefined && rec.version !== item.req.expect) return Object.assign(item, { state: "fail", code: "VERSION_MISMATCH" });
      if (item.req.expectFields && !sameFields(rec, item.req.expectFields)) return Object.assign(item, { state: "fail", code: "VERSION_MISMATCH" });
      // Изменение устройства применяет его сервер, изменение сервера — сам сервер; домен — без сервера
      const archiveServer = (a) => (a && a.serverId ? byId("servers", a.serverId) : null);
      const via =
        t.kind === "device" ? serverOf(rec) : t.kind === "server" ? rec : t.kind === "archive" ? archiveServer(rec) : t.kind === "volume" ? archiveServer(byId("archives", rec.archiveId)) : null;
      if (offline(via)) return Object.assign(item, { state: "fail", code: "SERVER_OFFLINE" });
      if (item.req.set) {
        if (t.kind === "device" && item.req.set.enabled === true && rec.licenseExceeded) return Object.assign(item, { state: "fail", code: "LICENSE_EXCEEDED" });
        const clash = rec.type === "det" && item.req.set.enabled === true && rec.enabled === false ? conflictWith(rec) : null;
        if (clash) return Object.assign(item, { state: "fail", code: "BUSY", params: conflictParams(clash) });
        item.before = { set: applyPatch(rec, item.req.set) };
        if (t.kind === "device") syncMain(rec, item.req.set);
        item.after = fieldsOf(rec, item.req.set);
        item.secret = "password" in item.req.set || "secret" in item.req.set;
        changed(t.kind, rec);
      } else if (item.req.create) {
        const res = createDevice(item.req.create, rec.domainId, rec.id, null);
        if (res.code) return Object.assign(item, { state: "fail", code: res.code });
        item.createdId = res.devices[0].id;
        item.before = { remove: item.createdId };
      } else if (item.req.remove) {
        if (byId("devices", item.req.remove)) removeDevice(item.req.remove);
        item.before = {};
      } else {
        item.before = { folderIds: setFolders(rec.id, item.req.folderIds) };
      }
      return Object.assign(item, { state: "ok", code: null, version: rec.version });
    }

    function finish(op, fired) {
      op.state = "done";
      op.finishedAt = iso(now());
      // Отмена, которая что-то вернула, открывает повтор
      if (op.revertOf && op.items.some((x) => x.state === "ok")) redoStack.push(op.revertOf);
      trimOps();
      const v = opView(op);
      send("operation.finished", { kind: "operation", entityId: op.id, payload: { state: v.state, ok: v.ok, failed: v.failed, cancelled: v.cancelled } });
      if (fired) fired.push({ kind: "operation", id: op.id });
    }

    // Всё, что к этому моменту должно было выполниться
    function tick() {
      const fired = [];
      syncing.forEach((s, cid) => {
        if (s.at > now()) return;
        syncing.delete(cid);
        const c = db.access.catalogs.find((x) => x.id === cid);
        if (!c) return;
        const at = iso(now());
        if (!s.groupId) Object.assign(c, { status: "ok", lastSyncAt: at, durationSec: 7, message: "" });
        db.access.groups.filter((g) => g.source && g.source.catalogId === cid && (!s.groupId || g.id === s.groupId)).forEach((g) => Object.assign(g.source, { status: "ok", at, message: "" }));
        bump(db.access);
        send("entity.changed", { kind: "access", version: db.access.version });
        fired.push({ kind: "catalog", id: cid });
      });
      tickDiscovery(fired);
      modeTick();
      formatting.forEach((at, id) => {
        if (at > now()) return;
        formatting.delete(id);
        const v = byId("volumes", id);
        if (!v) return;
        Object.assign(v, { state: "ready", usedPercent: 0 });
        bump(v);
        changed("volume", v);
        fired.push({ kind: "volume", id });
      });
      ops.forEach((op) => {
        while (op.state === "running" && op.nextAt <= now()) {
          const item = op.items.find((x) => x.state === "wait");
          if (!item) {
            finish(op, fired);
            break;
          }
          runItem(op, item);
          const v = opView(op);
          send("operation.progress", { kind: "operation", entityId: op.id, payload: { item: v.items[item.index], done: v.done, total: v.total } });
          op.nextAt += stepMs(item.index + 1);
          if (!op.items.some((x) => x.state === "wait")) finish(op, fired);
        }
      });
      return fired;
    }

    function opById(id) {
      const op = ops.get(id);
      return op ? op : null;
    }

    /* ===== Маршруты ===== */

    const notFound = (what) => problem(404, "NOT_FOUND", `${what} не найден(а)`);
    function getter(table, label) {
      const show = (r) => (table === "devices" ? device(r) : table === "volumes" ? volume(r) : clone(r));
      return [
        ["GET", `/${table}`, () => items(db[table].map(show))],
        [
          "GET",
          `/${table}/{id}`,
          (p) => {
            const rec = byId(table, p.id);
            return rec ? one(show(rec)) : notFound(label);
          },
        ],
      ];
    }

    const ROUTES = [
      [
        "GET",
        "/me",
        () => {
          const u = db.access.users.find((x) => x.id === me);
          return { status: 200, body: { userId: u.id, login: u.login, name: u.name, serverTime: iso(now()), timezone: db.timezone } };
        },
      ],
      ["GET", "/reference", () => ({ status: 200, body: clone(db.reference) })],
      ...getter("domains", "Домен"),
      ...getter("servers", "Сервер"),
      ...getter("devices", "Устройство"),
      ...getter("folders", "Папка"),
      ...getter("archives", "Хранилище"),
      ...getter("volumes", "Том"),
      ...getter("rules", "Правило"),
      [
        "PATCH",
        "/devices/{id}",
        (p, q, body, headers) => {
          const rec = byId("devices", p.id);
          if (!rec) return notFound("Устройство");
          const bad = precondition(rec, headers) || fieldProblem(rec, body) || addressProblem(rec, body) || videoProblem(rec, body) || detProblem(rec, body) || clashProblem(rec, body) || patchProblem(body);
          if (bad) return bad;
          const before = applyPatch(rec, body);
          syncMain(rec, body);
          changed("device", rec);
          recordSingle([setStep(rec, body, before)]);
          return one(device(rec));
        },
      ],
      [
        "POST",
        "/devices/{id}/live",
        (p) => {
          const rec = byId("devices", p.id);
          if (!rec) return notFound("Устройство");
          if (rec.type !== "camera") return problem(422, "NOT_SUPPORTED", "Живое видео — только у камеры", { field: "type" });
          if (rec.online === false) return problem(409, "DEVICE_OFFLINE", "Камера без связи");
          // Встроенный сервер видео не отдаёт: адрес-заглушка, форма показывает картинку
          return { status: 200, body: { whepUrl: `stub://live/${rec.id}`, token: `stub-${newVersion()}`, expiresAt: iso(now() + 60000) } };
        },
      ],
      [
        "POST",
        "/devices/{id}/streams",
        (p, q, body) => {
          const rec = byId("devices", p.id);
          if (!rec) return notFound("Устройство");
          if (rec.type !== "camera") return problem(422, "NOT_SUPPORTED", "Потоки — только у камеры", { field: "type" });
          if (!String(body.name).trim()) return problem(422, "NAME_REQUIRED", "Укажите имя потока", { field: "name" });
          const locked = lockedProblem([rec.id]);
          if (locked) return locked;
          let n = 1;
          while (streamsOf(rec).some((s) => s.id === `s${n}`)) n++;
          const res = setStreams(rec, streamsOf(rec).concat(Object.assign({ id: `s${n}`, online: true }, clone(body), { name: body.name.trim() }, sizeOf(body.res))));
          return Object.assign(res, { status: 201 });
        },
      ],
      [
        "PATCH",
        "/devices/{id}/streams/{streamId}",
        (p, q, body) => {
          const rec = byId("devices", p.id);
          if (!rec) return notFound("Устройство");
          const st = streamsOf(rec).find((s) => s.id === p.streamId);
          if (!st) return notFound("Поток");
          if ("name" in body && !String(body.name).trim()) return problem(422, "NAME_REQUIRED", "Укажите имя потока", { field: "name" });
          const bad = resProblem(st.resOptions, body.res) || lockedProblem([rec.id]);
          if (bad) return bad;
          return setStreams(rec, streamsOf(rec).map((s) => (s === st ? Object.assign(clone(s), clone(body), sizeOf(body.res)) : clone(s))));
        },
      ],
      [
        "DELETE",
        "/devices/{id}/streams/{streamId}",
        (p) => {
          const rec = byId("devices", p.id);
          if (!rec) return notFound("Устройство");
          const i = streamsOf(rec).findIndex((s) => s.id === p.streamId);
          if (i < 0) return notFound("Поток");
          if (i === 0) return problem(422, "NOT_SUPPORTED", "Основной поток не удаляется", { field: "streamId" });
          const used = rec.stream === p.streamId || (rec.extraArchives || []).some((x) => x.stream === p.streamId) || db.devices.some((d) => d.parentId === rec.id && d.stream === p.streamId);
          if (used) return problem(422, "VALIDATION_FAILED", "Поток используется записью или детектором", { field: "stream" });
          const locked = lockedProblem([rec.id]);
          if (locked) return locked;
          return setStreams(rec, streamsOf(rec).filter((s) => s.id !== p.streamId));
        },
      ],
      /* ----- Домены ----- */
      [
        "POST",
        "/domains",
        (p, q, body) => {
          const bad = domainNameProblem(body.name);
          if (bad) return bad;
          const d = { id: uuid("domain"), name: body.name.trim(), license: "", online: true, version: newVersion() };
          db.domains.push(d);
          send("entity.created", { kind: "domain", entityId: d.id, version: d.version });
          return one(clone(d), 201);
        },
      ],
      [
        "PATCH",
        "/domains/{id}",
        (p, q, body, headers) => {
          const t = targetOf(p.id);
          if (!t || t.kind !== "domain") return notFound("Домен");
          const bad = precondition(t.rec, headers) || setProblem(t, body);
          if (bad) return bad;
          if ("name" in body) body.name = body.name.trim();
          applyPatch(t.rec, body);
          changed("domain", t.rec);
          return one(clone(t.rec));
        },
      ],
      [
        "DELETE",
        "/domains/{id}",
        (p, q, body, headers) => {
          const d = byId("domains", p.id);
          if (!d) return notFound("Домен");
          const bad = precondition(d, headers);
          if (bad) return bad;
          if (db.domains.length < 2) return problem(409, "LAST_DOMAIN", "Последний домен удалить нельзя");
          const inside = (r) => r.domainId === d.id;
          const busyWith = db.servers.some(inside) || db.folders.some(inside) || db.devices.some(inside) || db.archives.some(inside);
          const to = q.moveTo ? byId("domains", q.moveTo) : null;
          if (busyWith && (!to || to.id === d.id)) return problem(422, "DOMAIN_NOT_EMPTY", "Укажите домен, куда перенести содержимое", { field: "moveTo" });
          const locked = lockedProblem([db.servers, db.devices, db.archives].flatMap((t) => t.filter(inside).map((r) => r.id)));
          if (locked) return locked;
          // Ничего не пропадает: серверы становятся нераспределёнными в домене moveTo, папки, устройства и
          // сетевые хранилища меняют домен, найденное поиском переходит туда же
          const move = (table, kind, extra) =>
            db[table].filter(inside).forEach((r) => {
              Object.assign(r, { domainId: to.id }, extra || {});
              bump(r);
              changed(kind, r);
            });
          if (to) {
            move("servers", "server", { allocated: false });
            move("folders", "folder");
            move("devices", "device");
            move("archives", "archive");
            const from = db.discovery.find((x) => x.domainId === d.id);
            if (from) {
              const into = db.discovery.find((x) => x.domainId === to.id);
              if (into) into.candidateIds = into.candidateIds.concat(from.candidateIds.filter((c) => !into.candidateIds.includes(c)));
              else from.domainId = to.id;
            }
            db.network.forEach((c) => (c.domainIds = [...new Set(c.domainIds.map((x) => (x === d.id ? to.id : x)))]));
          }
          db.discovery = db.discovery.filter((x) => x.domainId !== d.id);
          db.domains = db.domains.filter((x) => x !== d);
          send("entity.deleted", { kind: "domain", entityId: d.id });
          return { status: 204, body: null };
        },
      ],

      /* ----- Серверы ----- */
      [
        "POST",
        "/servers",
        (p, q, body) => {
          if (!byId("domains", body.domainId)) return notFound("Домен");
          const ip = String(body.ip).trim();
          if (!/^[\w.-]+$/.test(ip)) return problem(422, "INVALID_IP", "Неверный адрес", { field: "ip" });
          if (db.servers.some((s) => s.ip.toLowerCase() === ip.toLowerCase() && s.port === body.port)) return problem(409, "ADDRESS_TAKEN", "Сервер с таким адресом уже есть", { field: "ip" });
          // Найденный опросом сервер сообщает о себе имя, нагрузку и диски; встроенный сервер их придумывает
          const s = {
            id: uuid("server"),
            name: `Сервер — ${ip}`,
            ip,
            port: body.port,
            role: "node",
            domainId: body.domainId,
            allocated: false,
            online: true,
            telemetry: { cpu: 5, ram: 18, net: 2, disk: 0 },
            gpu: null,
            disks: [["C:", 256 * GB, true], ["D:", 4 * TB], ["E:", 6 * TB], ["F:", 8 * TB], ["G:", 12 * TB]].map(([disk, sizeBytes, system]) => ({ disk, sizeBytes, system: !!system })),
            version: newVersion(),
          };
          db.servers.push(s);
          send("entity.created", { kind: "server", entityId: s.id, version: s.version });
          return one(clone(s), 201);
        },
      ],
      [
        "PATCH",
        "/servers/{id}",
        (p, q, body, headers) => {
          const t = targetOf(p.id);
          if (!t || t.kind !== "server") return notFound("Сервер");
          const bad = precondition(t.rec, headers) || setProblem(t, body);
          if (bad) return bad;
          applyPatch(t.rec, body);
          changed("server", t.rec);
          return one(clone(t.rec));
        },
      ],
      [
        "POST",
        "/servers/probe",
        (p, q, body) => {
          const max = db.reference.limits.ipScanMax;
          if (body.targets.length > max) return problem(422, "IP_RANGE_TOO_LARGE", `За раз — не больше ${max} адресов`, { params: { max } });
          // Отвечает ли адрес — у встроенного сервера по хешу адреса: так же, как в макете на константах
          const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0);
          const items = body.targets.map(({ ip, port }) => {
            const s = db.servers.find((x) => x.ip.toLowerCase() === ip.toLowerCase() && x.port === port);
            if (s) return { ip, port, status: s.allocated ? "in-domain" : "found", serverId: s.id, domainId: s.allocated ? s.domainId : null };
            return { ip, port, status: hash(`${ip}:${port}`) % 3 === 0 ? "dead" : "found", serverId: null, domainId: null };
          });
          return { status: 200, body: { items } };
        },
      ],
      [
        "POST",
        "/servers/assign",
        (p, q, body) => {
          const done = [];
          const failed = [];
          body.items.forEach((x) => {
            const s = byId("servers", x.serverId);
            if (!s) return failed.push({ serverId: x.serverId, code: "NOT_FOUND" });
            if (!byId("domains", x.domainId)) return failed.push({ serverId: x.serverId, code: "NOT_FOUND" });
            if (s.version !== x.version) return failed.push({ serverId: x.serverId, code: "VERSION_MISMATCH" });
            if (busy(s.id)) return failed.push({ serverId: x.serverId, code: "BUSY" });
            if (s.domainId !== x.domainId || s.allocated !== x.allocated) {
              Object.assign(s, { domainId: x.domainId, allocated: x.allocated });
              bump(s);
              // Добавленный встаёт в конец списка — там, где его и ждут увидеть
              db.servers = db.servers.filter((r) => r !== s).concat(s);
              changed("server", s);
            }
            done.push(clone(s));
          });
          return { status: 200, body: { done, failed } };
        },
      ],

      /* ----- Папки ----- */
      [
        "POST",
        "/folders",
        (p, q, body) => {
          if (!byId("domains", body.domainId)) return notFound("Домен");
          if (!String(body.name).trim()) return problem(422, "NAME_REQUIRED", "Укажите имя папки", { field: "name" });
          if (body.parentId) {
            const parent = byId("folders", body.parentId);
            if (!parent) return notFound("Папка");
            if (parent.domainId !== body.domainId) return problem(422, "VALIDATION_FAILED", "Родительская папка — в другом домене", { field: "parentId" });
          }
          const f = { id: uuid("folder"), name: body.name.trim(), domainId: body.domainId, parentId: body.parentId, deviceIds: [], version: newVersion() };
          db.folders.push(f);
          send("entity.created", { kind: "folder", entityId: f.id, version: f.version });
          return one(clone(f), 201);
        },
      ],
      [
        "PATCH",
        "/folders/{id}",
        (p, q, body, headers) => {
          const f = byId("folders", p.id);
          if (!f) return notFound("Папка");
          const bad = precondition(f, headers);
          if (bad) return bad;
          if ("name" in body && !String(body.name).trim()) return problem(422, "NAME_REQUIRED", "Укажите имя папки", { field: "name" });
          const alien = (body.deviceIds || []).find((id) => {
            const d = byId("devices", id);
            return !d || d.domainId !== f.domainId;
          });
          if (alien) return problem(422, "VALIDATION_FAILED", `Устройства ${alien} нет в домене папки`, { field: "deviceIds" });
          if ((body.deviceIds || []).some((id) => !folderable(byId("devices", id)) && !f.deviceIds.includes(id))) return problem(422, "NOT_SUPPORTED", "Эта запись в папки не входит", { field: "deviceIds" });
          // Состав папки — это папки устройства: добавить или убрать устройство групповой операции нельзя
          if (body.deviceIds) {
            const moved = body.deviceIds.filter((id) => !f.deviceIds.includes(id)).concat(f.deviceIds.filter((id) => !body.deviceIds.includes(id)));
            const locked = lockedProblem(moved);
            if (locked) return locked;
          }
          if ("name" in body) body.name = body.name.trim();
          if (body.deviceIds) body.deviceIds = [...new Set(body.deviceIds)];
          applyPatch(f, body);
          changed("folder", f);
          return one(clone(f));
        },
      ],
      [
        "DELETE",
        "/folders/{id}",
        (p, q, body, headers) => {
          const f = byId("folders", p.id);
          if (!f) return notFound("Папка");
          const bad = precondition(f, headers) || lockedProblem(touchedBy("folders", f), held);
          if (bad) return bad;
          removeFolder(f);
          return { status: 204, body: null };
        },
      ],
      /* ----- Хранилища и тома ----- */
      [
        "POST",
        "/archives",
        (p, q, body) => {
          if (!String(body.name).trim()) return problem(422, "NAME_REQUIRED", "Укажите имя хранилища", { field: "name" });
          if ((body.serverId == null) === (body.domainId == null)) return problem(422, "VALIDATION_FAILED", "Владелец — ровно один из serverId и domainId", { field: "serverId" });
          if (body.serverId && !byId("servers", body.serverId)) return notFound("Сервер");
          if (body.domainId && !byId("domains", body.domainId)) return notFound("Домен");
          if (body.kind === "local" && !body.serverId) return problem(422, "VALIDATION_FAILED", "Локальное хранилище — на сервере", { field: "serverId" });
          const unsupported = featureProblem("archive", body);
          if (unsupported) return unsupported;
          const a = {
            id: uuid("archive"),
            name: body.name.trim(),
            kind: body.kind,
            storage: body.kind === "cloud" ? "object" : body.storage,
            // Шифрование — только у объектного и облачного
            encrypted: !!body.encrypted && (body.kind === "cloud" || body.storage === "object"),
            retentionDays: body.retentionDays,
            provider: body.kind === "cloud" ? body.provider : null,
            serverId: body.serverId,
            domainId: body.domainId,
            version: newVersion(),
          };
          const bad = volumeProblem(a, body.firstVolume);
          if (bad) return bad;
          db.archives.push(a);
          const v = newVolume(a, body.firstVolume);
          send("entity.created", { kind: "archive", entityId: a.id, version: a.version });
          send("entity.created", { kind: "volume", entityId: v.id, version: v.version });
          return { status: 201, body: { archive: clone(a), volumes: [volume(v)] } };
        },
      ],
      [
        "POST",
        "/archives/check",
        (p, q, body) => {
          // Встроенный сервер не ходит в сеть: подключение «удаётся», если заполнено то, без чего не подключиться
          const v = body.volume;
          const missing = body.kind === "remote" ? !v.disk.trim() || !String(v.login || "").trim() : body.kind === "cloud" ? !String(v.bucket || "").trim() : false;
          return { status: 200, body: { ok: !missing, code: missing ? "CONNECTION_FAILED" : null } };
        },
      ],
      [
        "PATCH",
        "/archives/{id}",
        (p, q, body, headers) => {
          const t = targetOf(p.id);
          if (!t || t.kind !== "archive") return notFound("Хранилище");
          const bad = precondition(t.rec, headers) || setProblem(t, body);
          if (bad) return bad;
          applyPatch(t.rec, body);
          changed("archive", t.rec);
          return one(clone(t.rec));
        },
      ],
      [
        "DELETE",
        "/archives/{id}",
        (p, q, body, headers) => {
          const a = byId("archives", p.id);
          if (!a) return notFound("Хранилище");
          const bad = precondition(a, headers) || lockedProblem(touchedBy("archives", a), held);
          if (bad) return bad;
          removeArchive(a);
          return { status: 204, body: null };
        },
      ],
      [
        "POST",
        "/archives/{id}/volumes",
        (p, q, body) => {
          const a = byId("archives", p.id);
          if (!a) return notFound("Хранилище");
          const bad = volumeProblem(a, body);
          if (bad) return bad;
          const v = newVolume(a, body);
          send("entity.created", { kind: "volume", entityId: v.id, version: v.version });
          return one(volume(v), 201);
        },
      ],
      [
        "PATCH",
        "/volumes/{id}",
        (p, q, body, headers) => {
          const t = targetOf(p.id);
          if (!t || t.kind !== "volume") return notFound("Том");
          const bad = precondition(t.rec, headers) || setProblem(t, body);
          if (bad) return bad;
          applyPatch(t.rec, body);
          changed("volume", t.rec);
          return one(volume(t.rec));
        },
      ],
      [
        "DELETE",
        "/volumes/{id}",
        (p, q, body, headers) => {
          const v = byId("volumes", p.id);
          if (!v) return notFound("Том");
          const bad = precondition(v, headers);
          if (bad) return bad;
          removeVolume(v);
          return { status: 204, body: null };
        },
      ],
      [
        "POST",
        "/volumes/{id}/format",
        (p) => {
          const v = byId("volumes", p.id);
          if (!v) return notFound("Том");
          if (v.state === "format") return problem(409, "BUSY", "Том уже форматируется");
          const locked = lockedProblem([v.id]);
          if (locked) return locked;
          v.state = "format";
          bump(v);
          formatting.set(v.id, now() + FORMAT_MS);
          changed("volume", v);
          return one(volume(v), 202);
        },
      ],
      /* ----- Устройства: добавить, изменить сразу, удалить, определить модель ----- */
      [
        "POST",
        "/devices",
        (p, q, body) => {
          const done = [];
          const failed = [];
          body.items.forEach((x, index) => {
            // MAC камеры, источника и СКУД — только из поиска
            if (!x.candidateId && ["camera", "eventsrc", "acfa"].includes(x.device.type)) delete x.device.mac;
            const res = createDevice(x.device, x.domainId, x.parentId, x.folderId);
            if (res.code) return failed.push(Object.assign({ index, code: res.code }, res.field ? { field: res.field } : {}));
            if (x.candidateId) {
              const d = db.discovery.find((y) => y.domainId === x.domainId);
              if (d) d.candidateIds = d.candidateIds.filter((c) => c !== x.candidateId);
            }
            done.push({ index, devices: res.devices.map(device), folders: res.folders.map(clone) });
            recordSingle([{ targetId: res.devices[0].id, version: res.devices[0].version, createdId: res.devices[0].id, before: { remove: res.devices[0].id } }]);
          });
          return { status: 200, body: { done, failed } };
        },
      ],
      [
        "POST",
        "/devices/update",
        (p, q, body) => {
          const done = [];
          const failed = [];
          const steps = [];
          body.items.forEach((x) => {
            const t = targetOf(x.deviceId);
            if (!t || t.kind !== "device") return failed.push({ deviceId: x.deviceId, code: "NOT_FOUND" });
            if (t.rec.version !== x.version) return failed.push({ deviceId: x.deviceId, code: "VERSION_MISMATCH" });
            if (busy(x.deviceId)) return failed.push({ deviceId: x.deviceId, code: "BUSY" });
            const bad = setProblem(t, x.set) || clashProblem(t.rec, x.set);
            if (bad) return failed.push(Object.assign({ deviceId: x.deviceId, code: bad.body.code }, bad.body.field ? { field: bad.body.field } : {}));
            const before = applyPatch(t.rec, x.set);
            syncMain(t.rec, x.set);
            changed("device", t.rec);
            steps.push(setStep(t.rec, x.set, before));
            done.push(device(t.rec));
          });
          recordSingle(steps);
          return { status: 200, body: { done, failed } };
        },
      ],
      [
        "POST",
        "/devices/probe",
        (p, q, body) => {
          // Модель «сообщает» устройство; у встроенного сервера — по сумме чисел адреса, как в макете
          const models = (db.reference.deviceModels.find((m) => m.vendor === body.vendor) || {}).models || [];
          if (!models.length) return { status: 200, body: { model: null } };
          const sum = body.ip.split(".").reduce((s, x) => s + (Number(x) || 0), 0);
          return { status: 200, body: { model: models[Math.abs(sum) % models.length] } };
        },
      ],
      [
        "DELETE",
        "/devices/{id}",
        (p, q, body, headers) => {
          const d = byId("devices", p.id);
          if (!d) return notFound("Устройство");
          const bad = precondition(d, headers) || deleteProblem(d) || lockedProblem(touchedBy("devices", d), held);
          if (bad) return bad;
          removeDevice(d.id);
          recordSingle([{ targetId: d.id, version: d.version, before: { deleted: true } }]);
          return { status: 204, body: null };
        },
      ],
      [
        "POST",
        "/domains/{id}/discovery",
        (p) => {
          if (!byId("domains", p.id)) return notFound("Домен");
          const job = discoveryOf(p.id);
          if (job.state === "searching") return problem(409, "BUSY", "Поиск в сети домена уже идёт");
          // Новый поиск заменяет итог прежнего: найденное появляется по одному, как при настоящем опросе
          Object.assign(job, { state: "searching", progress: 0, startedAt: iso(now()), finishedAt: null, candidateIds: [] });
          // Первая находка — сразу, следующие — раз в 140 мс
          searches.set(p.id, { queue: db.network.filter((c) => c.domainIds.includes(p.id)).map((c) => c.id), total: 0, nextAt: now() });
          searches.get(p.id).total = searches.get(p.id).queue.length;
          if (!searches.get(p.id).total) finishDiscovery(p.id, "done");
          else tickDiscovery([]);
          return { status: 202, body: discoveryView(p.id) };
        },
      ],
      [
        "DELETE",
        "/domains/{id}/discovery",
        (p) => {
          if (!byId("domains", p.id)) return notFound("Домен");
          if (searches.has(p.id)) finishDiscovery(p.id, "stopped");
          return { status: 200, body: discoveryView(p.id) };
        },
      ],
      [
        "POST",
        "/objects/delete",
        (p, q, body) => {
          const done = [];
          const failed = [];
          const steps = [];
          const kinds = { devices: (r) => removeDevice(r.id), folders: removeFolder, archives: removeArchive, volumes: removeVolume, rules: removeRule };
          body.items.forEach((x) => {
            const table = Object.keys(kinds).find((k) => byId(k, x.id));
            // Уже удалён вместе с родителем из этого же запроса — тоже удалён
            if (!table) return done.includes(x.id) || wasRemoved.has(x.id) ? done.push(x.id) : failed.push({ id: x.id, code: "NOT_FOUND" });
            const rec = byId(table, x.id);
            if (rec.version !== x.version) return failed.push({ id: x.id, code: "VERSION_MISMATCH" });
            if (table === "devices" && deleteProblem(rec)) return failed.push({ id: x.id, code: "NOT_SUPPORTED" });
            if (lockedProblem(touchedBy(table, rec), held)) return failed.push({ id: x.id, code: "BUSY" });
            kinds[table](rec);
            done.push(x.id);
            if (table === "devices") steps.push({ targetId: rec.id, version: rec.version, before: { deleted: true } });
          });
          wasRemoved.clear();
          recordSingle(steps);
          return { status: 200, body: { done, failed } };
        },
      ],
      [
        "PUT",
        "/rules/{id}",
        (p, q, body, headers) => {
          const r = byId("rules", p.id);
          if (!r) return notFound("Правило");
          const bad = precondition(r, headers) || ruleProblem(body);
          if (bad) return bad;
          const was = ruleMeta(r);
          RULE_CONTENT.forEach((k) => (r[k] = clone(body[k])));
          Object.assign(r, { changedAt: iso(now()), changedBy: myLogin() });
          bump(r);
          pushVersion(r, body.historyNote, was);
          changed("rule", r);
          return one(ruleView(r));
        },
      ],
      [
        "PATCH",
        "/settings",
        (p, q, body, headers) => {
          const s = db.settings;
          const bad = precondition(s, headers);
          if (bad) return bad;
          Object.assign(s.values, clone(body.values));
          bump(s);
          send("entity.changed", { kind: "settings", version: s.version });
          return one(clone(s));
        },
      ],
      [
        "POST",
        "/access/apply",
        (p, q, body, headers) => {
          const a = db.access;
          const bad = precondition(a, headers);
          if (bad) return bad;
          const next = clone(body.access);
          // Состояние синхронизации ведёт сервер: у существующих каталогов и групп — его значения
          next.catalogs.forEach((c) => {
            const was = a.catalogs.find((x) => x.id === c.id);
            if (was) ["status", "lastSyncAt", "nextSyncAt", "durationSec", "message", "entries"].forEach((k) => (c[k] = clone(was[k])));
          });
          next.groups.forEach((g) => {
            const was = a.groups.find((x) => x.id === g.id);
            if (was && was.source && g.source) ["status", "at", "message"].forEach((k) => (g.source[k] = was.source[k]));
          });
          const why = accessProblem(next);
          if (why) return why;
          if (body.dryRun) return { status: 200, body: { applied: false, access: null }, headers: { ETag: etag(a) } };
          const actor = (a.users.find((u) => u.id === me) || {}).login || "";
          const at = iso(now());
          const stamp = (kind, x) => Object.assign({ id: uuid(kind), at, actor }, clone(x));
          Object.assign(a, next, {
            history: body.history.map((h) => stamp("history", h)).concat(a.history),
            cellHistory: body.cellHistory.map((h) => stamp("history", h)).concat(a.cellHistory || []),
          });
          bump(a);
          send("entity.changed", { kind: "access", version: a.version });
          return { status: 200, body: { applied: true, access: clone(a) }, headers: { ETag: etag(a) } };
        },
      ],
      [
        "POST",
        "/access/catalogs/{id}/sync",
        (p, q, body) => {
          const c = db.access.catalogs.find((x) => x.id === p.id);
          if (!c) return notFound("Каталог");
          if (body.groupId && !db.access.groups.some((g) => g.id === body.groupId && g.source && g.source.catalogId === c.id)) return notFound("Группа каталога");
          if (syncing.has(c.id)) return problem(409, "BUSY", "Синхронизация уже идёт");
          const mine = (g) => g.source && g.source.catalogId === c.id && (!body.groupId || g.id === body.groupId);
          if (!body.groupId) c.status = "run";
          db.access.groups.filter(mine).forEach((g) => (g.source.status = "run"));
          syncing.set(c.id, { at: now() + SYNC_MS, groupId: body.groupId });
          bump(db.access);
          send("entity.changed", { kind: "access", version: db.access.version });
          return { status: 202, body: clone(c) };
        },
      ],
      [
        "GET",
        "/domains/{id}/discovery",
        (p) => (byId("domains", p.id) ? { status: 200, body: discoveryView(p.id) } : notFound("Домен")),
      ],
      [
        "GET",
        "/rules/{id}/fires",
        (p) => (byId("rules", p.id) ? items(db.ruleFires.filter((f) => f.ruleId === p.id).sort((a, b) => b.at.localeCompare(a.at)).map(clone)) : notFound("Правило")),
      ],
      [
        "POST",
        "/rules",
        (p, q, body) => {
          const bad = ruleProblem(body);
          if (bad) return bad;
          const at = iso(now());
          const r = Object.assign({ id: uuid("rule") }, content(body), { createdAt: at, createdBy: myLogin(), changedAt: at, changedBy: myLogin(), mute: null,
            order: Math.max(0, ...db.rules.map((x) => x.order)) + 1, version: newVersion() });
          db.rules.push(r);
          pushVersion(r, { code: "created", params: {} });
          send("entity.created", { kind: "rule", entityId: r.id, version: r.version });
          return one(ruleView(r), 201);
        },
      ],
      [
        "POST",
        "/rules/update",
        (p, q, body) => {
          const done = [], failed = [];
          body.items.forEach((x) => {
            const r = byId("rules", x.ruleId);
            if (!r) return failed.push({ ruleId: x.ruleId, code: "NOT_FOUND" });
            if (r.version !== x.version) return failed.push({ ruleId: x.ruleId, code: "VERSION_MISMATCH" });
            const set = x.set, was = stateNote(r).params.mode, meta = ruleMeta(r);
            const next = Object.assign({}, r, "enabled" in set ? { enabled: set.enabled } : {}, "logOnly" in set ? { logOnly: set.logOnly } : {});
            if (next.enabled && !r.enabled && engine.issue(next)) return failed.push({ ruleId: x.ruleId, code: "RULE_INVALID" });
            if ("enabled" in set || "logOnly" in set) {
              if (next.enabled && next.logOnly && !(r.enabled && r.logOnly)) next.logOnlySince = sysToday();
              if (next.enabled && !next.logOnly) next.logOnlySince = null;
              ["enabled", "logOnly", "logOnlySince"].forEach((k) => (r[k] = next[k]));
              Object.assign(r, { changedAt: iso(now()), changedBy: myLogin() });
            }
            if ("mute" in set) r.mute = set.mute ? { since: iso(now()), until: set.mute.until, by: myLogin(), reason: set.mute.reason || "" } : null;
            bump(r);
            if (stateNote(r).params.mode !== was || x.historyNote) pushVersion(r, x.historyNote || stateNote(r), meta);
            changed("rule", r);
            done.push(ruleView(r));
          });
          return { status: 200, body: { done, failed } };
        },
      ],
      [
        "POST",
        "/rules/reorder",
        (p, q, body) => {
          for (const x of body.items) {
            const r = byId("rules", x.ruleId);
            if (!r) return notFound("Правило");
            if (r.version !== x.version) return problem(412, "VERSION_MISMATCH", "Правило изменилось с момента чтения", { current: ruleView(r), params: { ruleId: r.id } });
          }
          const out = body.items.map((x) => {
            const r = byId("rules", x.ruleId);
            if (r.order === x.order) return r;
            r.order = x.order;
            bump(r);
            changed("rule", r);
            return r;
          });
          return { status: 200, body: { items: out.map(ruleView) } };
        },
      ],
      [
        "POST",
        "/rules/test",
        (p, q, body) => {
          const saved = body.ruleId ? byId("rules", body.ruleId) : null;
          if (body.ruleId && !saved) return notFound("Правило");
          if (body.log && !saved) return problem(422, "VALIDATION_FAILED", "Записать в журнал можно проверку сохранённого правила", { field: "log" });
          const r = Object.assign({ id: body.ruleId || null, mute: saved ? saved.mute : null, order: saved ? saved.order : 0 }, clone(body.rule));
          const at = body.at ? Date.parse(body.at) : now();
          const pre = r.enabled ? [] : [{ code: "testOff", params: {}, ok: true, reason: null }];
          let events;
          if (r.start === "event") {
            events = (body.events || []).map((e) => ({ source: e.source, kind: e.kind, match: e.match || {}, deviceId: e.deviceId, at: iso(at) }));
            pre.push(...engine.eventChecks(r, events));
          }
          const f = engine.fire(r, { by: "test", at, now: !body.at, watch: true, events, pre, br: body.branches || {} });
          if (body.log) return { status: 200, body: storeFire(f) };
          return { status: 200, body: Object.assign({ id: uuid("fire") }, f) };
        },
      ],
      [
        "POST",
        "/rules/{id}/run",
        (p) => {
          const r = byId("rules", p.id);
          if (!r) return notFound("Правило");
          const why = !r.enabled ? { code: "off" } : engine.issue(r);
          if (why) return problem(409, "NOT_RUNNABLE", "Правило сейчас не запустить", { params: { reason: why } });
          return { status: 201, body: storeFire(engine.fire(r, { via: "manual", at: now(), now: true, i: 0 })) };
        },
      ],
      ["GET", "/rules/{id}/versions", (p) => (byId("rules", p.id) ? items(db.ruleVersions.filter((v) => v.ruleId === p.id).map(versionView)) : notFound("Правило"))],
      [
        "POST",
        "/rules/{id}/fires/{fireId}/retry",
        (p) => {
          const r = byId("rules", p.id);
          const f = db.ruleFires.find((x) => x.id === p.fireId && x.ruleId === p.id);
          if (!r || !f) return notFound(r ? "Запуск" : "Правило");
          const why = !r.enabled ? { code: "off" } : r.logOnly ? { code: "logOnly" } : engine.issue(r);
          if (why) return problem(409, "NOT_RUNNABLE", "Правило сейчас не запустить", { params: { reason: why } });
          if (!f.steps.some(engine.retryable)) return problem(409, "NOT_RUNNABLE", "В запуске нет невыполненных шагов", { params: { reason: { code: "nothing" } } });
          return { status: 201, body: storeFire(engine.retry(r, f, now())) };
        },
      ],
      /* ----- Расписания, особые дни, режимы объекта, окна обслуживания ----- */
      ...getter("schedules", "Расписание"),
      [
        "POST",
        "/schedules",
        (p, q, body) => {
          if (!String(body.name || "").trim()) return problem(422, "NAME_REQUIRED", "Укажите название расписания", { field: "name" });
          if (ownerProblem(body.owner)) return ownerProblem(body.owner);
          const sc = Object.assign({ id: uuid("schedule") }, clone(body), { builtin: false, version: newVersion() });
          db.schedules.push(sc);
          send("entity.created", { kind: "schedule", entityId: sc.id, version: sc.version });
          return one(clone(sc), 201);
        },
      ],
      [
        "PUT",
        "/schedules/{id}",
        (p, q, body, headers) => {
          const sc = byId("schedules", p.id);
          if (!sc) return notFound("Расписание");
          const bad = precondition(sc, headers);
          if (bad) return bad;
          if (sc.builtin) return problem(409, "BUILTIN", "Встроенное расписание не правится");
          if (!String(body.name || "").trim()) return problem(422, "NAME_REQUIRED", "Укажите название расписания", { field: "name" });
          if (ownerProblem(body.owner)) return ownerProblem(body.owner);
          Object.assign(sc, clone(body));
          bump(sc);
          changed("schedule", sc);
          return one(clone(sc));
        },
      ],
      [
        "DELETE",
        "/schedules/{id}",
        (p, q, body, headers) => {
          const sc = byId("schedules", p.id);
          if (!sc) return notFound("Расписание");
          const bad = precondition(sc, headers);
          if (bad) return bad;
          if (sc.builtin) return problem(409, "BUILTIN", "Встроенное расписание не удаляется");
          removeSchedule(sc);
          return { status: 204 };
        },
      ],
      ...getter("dayGroups", "Группа дат").map(([m, path, fn]) => [m, path.replace("/dayGroups", "/day-groups"), fn]),
      [
        "POST",
        "/day-groups",
        (p, q, body) => {
          if (!String(body.name || "").trim()) return problem(422, "NAME_REQUIRED", "Укажите название группы", { field: "name" });
          const g = Object.assign({ id: uuid("dayGroup") }, clone(body), { version: newVersion() });
          db.dayGroups.push(g);
          send("entity.created", { kind: "dayGroup", entityId: g.id, version: g.version });
          return one(clone(g), 201);
        },
      ],
      [
        "PUT",
        "/day-groups/{id}",
        (p, q, body, headers) => {
          const g = byId("dayGroups", p.id);
          if (!g) return notFound("Группа дат");
          const bad = precondition(g, headers);
          if (bad) return bad;
          if (!String(body.name || "").trim()) return problem(422, "NAME_REQUIRED", "Укажите название группы", { field: "name" });
          Object.assign(g, clone(body));
          bump(g);
          changed("dayGroup", g);
          return one(clone(g));
        },
      ],
      [
        "DELETE",
        "/day-groups/{id}",
        (p, q, body, headers) => {
          const g = byId("dayGroups", p.id);
          if (!g) return notFound("Группа дат");
          const bad = precondition(g, headers);
          if (bad) return bad;
          db.dayGroups = db.dayGroups.filter((x) => x !== g);
          send("entity.deleted", { kind: "dayGroup", entityId: g.id });
          // Из расписаний пропадают особые дни этой группы: в эти даты действуют их обычные интервалы
          db.schedules.forEach((sc) => {
            if (!sc.overrides.some((o) => o.dayGroupId === g.id)) return;
            sc.overrides = sc.overrides.filter((o) => o.dayGroupId !== g.id);
            bump(sc);
            changed("schedule", sc);
          });
          return { status: 204 };
        },
      ],
      ["GET", "/modes", () => one(clone(db.modes))],
      [
        "PUT",
        "/modes",
        (p, q, body, headers) => {
          const M = db.modes;
          const bad = precondition(M, headers);
          if (bad) return bad;
          const ids = new Set(body.items.map((m) => m.id));
          const sys = M.items.find((m) => m.system && !ids.has(m.id));
          if (sys) return problem(409, "BUILTIN", "Системный режим не удаляется", { params: { modeId: sys.id } });
          if (!ids.has(body.otherwise)) return problem(422, "VALIDATION_FAILED", "Режим «иначе» — один из режимов", { field: "otherwise" });
          const blank = body.items.find((m) => !String(m.name || "").trim());
          if (blank) return problem(422, "NAME_REQUIRED", "Укажите название режима", { field: "items" });
          const gone = M.items.filter((m) => !ids.has(m.id)).map((m) => m.id);
          Object.assign(M, { items: clone(body.items), otherwise: body.otherwise });
          bump(M);
          send("entity.changed", { kind: "modes", version: M.version });
          // Удалённый режим уходит из условий «Режим объекта»; включённый вручную — снимается
          db.rules.forEach((r) => {
            const hit = r.conditions.filter((c) => c.kind === "mode" && (c.modeIds || []).some((x) => gone.includes(x)));
            if (!hit.length) return;
            hit.forEach((c) => (c.modeIds = c.modeIds.filter((x) => !gone.includes(x))));
            bump(r);
            changed("rule", r);
          });
          if (db.modeManual && gone.includes(db.modeManual.modeId)) db.modeManual = null;
          modeTick();
          return one(clone(M));
        },
      ],
      ["GET", "/modes/current", () => ({ status: 200, body: modeCurrent() })],
      [
        "POST",
        "/modes/current",
        (p, q, body) => {
          if (body.modeId && !db.modes.items.some((m) => m.id === body.modeId)) return notFound("Режим");
          db.modeManual = body.modeId ? { modeId: body.modeId, until: body.until || null } : null;
          send("entity.changed", { kind: "objectMode", entityId: engine.modeNow(now()) });
          lastMode = engine.modeNow(now());
          return { status: 200, body: modeCurrent() };
        },
      ],
      ...getter("maintenanceWindows", "Окно обслуживания").map(([m, path, fn]) => [m, path.replace("/maintenanceWindows", "/maintenance-windows"), fn]),
      [
        "POST",
        "/maintenance-windows",
        (p, q, body) => {
          if (!String(body.name || "").trim()) return problem(422, "NAME_REQUIRED", "Укажите название окна", { field: "name" });
          const w = { id: uuid("window"), name: body.name, scheduleId: null, ruleIds: clone(body.ruleIds), enabled: body.enabled, version: newVersion() };
          const sc = Object.assign({ id: uuid("schedule") }, clone(body.schedule), { builtin: false, owner: { kind: "maintenanceWindow", id: w.id }, version: newVersion() });
          w.scheduleId = sc.id;
          db.schedules.push(sc);
          db.maintenanceWindows.push(w);
          send("entity.created", { kind: "schedule", entityId: sc.id, version: sc.version });
          send("entity.created", { kind: "maintenanceWindow", entityId: w.id, version: w.version });
          return { status: 201, body: { window: clone(w), schedule: clone(sc) } };
        },
      ],
      [
        "PUT",
        "/maintenance-windows/{id}",
        (p, q, body, headers) => {
          const w = byId("maintenanceWindows", p.id);
          if (!w) return notFound("Окно обслуживания");
          const bad = precondition(w, headers);
          if (bad) return bad;
          if (!String(body.name || "").trim()) return problem(422, "NAME_REQUIRED", "Укажите название окна", { field: "name" });
          if (!byId("schedules", body.scheduleId)) return problem(422, "VALIDATION_FAILED", "Расписания нет", { field: "scheduleId" });
          Object.assign(w, clone(body));
          bump(w);
          changed("maintenanceWindow", w);
          return one(clone(w));
        },
      ],
      [
        "DELETE",
        "/maintenance-windows/{id}",
        (p, q, body, headers) => {
          const w = byId("maintenanceWindows", p.id);
          if (!w) return notFound("Окно обслуживания");
          const bad = precondition(w, headers);
          if (bad) return bad;
          db.maintenanceWindows = db.maintenanceWindows.filter((x) => x !== w);
          send("entity.deleted", { kind: "maintenanceWindow", entityId: w.id });
          // Своё расписание окна — вместе с ним, если больше нигде не используется
          db.schedules.filter((sc) => sc.owner && sc.owner.id === w.id && !scheduleUsed(sc.id)).forEach(removeSchedule);
          return { status: 204 };
        },
      ],
      ["GET", "/access", () => one(clone(db.access))],
      ["GET", "/settings", () => one(clone(db.settings))],
      ["GET", "/licenses", () => items(clone(db.licenses))],
      ["GET", "/journal", (p, q) => items(db.journal.filter((e) => !q.category || e.category === q.category).map(clone))],
      // Ассистент — заглушка с записанными ходами: модели у встроенного сервера нет. Поток — массивом сообщений,
      // клиент отдаёт их по одному, петля пишет строками data:
      ["POST", "/assist/turns", (p, q, body) => ({ status: 200, body: assistStub(body), headers: { "Content-Type": "text/event-stream" } })],
      // Поток встроенного сервера — subscribe(); по HTTP его отдаёт петля (tests/loopback-sw.js) или бэкенд
      ["GET", "/stream", () => problem(404, "NO_ROUTE", "Поток событий встроенного сервера — subscribe()")],

      [
        "POST",
        "/operations",
        (p, q, body) => {
          for (const [i, r] of body.items.entries()) {
            if ([r.set, r.folderIds, r.create].filter(Boolean).length !== 1) return problem(422, "VALIDATION_FAILED", "У шага ровно одно из set, folderIds и create", { field: `items[${i}]` });
            const t = targetOf(r.targetId);
            if (!t) return problem(404, "NOT_FOUND", `Объект ${r.targetId} не найден`, { params: { targetId: r.targetId } });
            if (r.set) {
              const bad = setProblem(t, r.set);
              if (bad) return bad;
            }
            if (r.create) {
              if (t.kind !== "device") return problem(422, "VALIDATION_FAILED", "Дочерние — только у устройства", { field: `items[${i}].create` });
              const e = createProblem(r.create, t.rec.domainId, t.rec.id, null);
              if (e) return problem(422, e.code === "IDENTIFIER_TAKEN" ? "VALIDATION_FAILED" : e.code, "Шаг create не пройдёт", { field: `items[${i}].create` });
            }
            if (r.folderIds) {
              if (t.kind !== "device") return problem(422, "VALIDATION_FAILED", "В папках лежат только устройства", { field: `items[${i}].folderIds` });
              const dev = t.rec;
              const wrong = r.folderIds.find((f) => {
                const folder = byId("folders", f);
                return !folder || folder.domainId !== dev.domainId;
              });
              if (wrong) return problem(422, "VALIDATION_FAILED", `Папки ${wrong} нет в домене устройства`, { field: `items[${i}].folderIds` });
              if (!folderable(dev)) return problem(422, "NOT_SUPPORTED", "Эта запись в папки не входит", { field: "folderIds" });
            }
          }
          const targets = [...new Set(body.items.map((r) => r.targetId))];
          const missing = targets.find((t) => !(t in body.expectedVersions));
          if (missing) return problem(428, "PRECONDITION_REQUIRED", "Для каждого объекта нужна версия, по которой построен план", { params: { targetId: missing } });
          for (const id of targets) {
            const t = targetOf(id);
            if (t.rec.version !== body.expectedVersions[id]) return problem(412, "VERSION_MISMATCH", "Объект изменился с момента построения плана", { current: view(t), params: { targetId: id } });
          }
          const taken = targets.find(busy);
          if (taken) return problem(409, "BUSY", "Над объектом выполняется другая операция", { params: { targetId: taken } });
          return { status: 202, body: opView(startOperation(body.items.map(clone))) };
        },
      ],
      ["GET", "/operations", (p, q) => items([...ops.values()].reverse().slice(0, Number(q.limit) || UNDO_KEEP).map(opView))],
      ["GET", "/operations/{id}", (p) => (opById(p.id) ? { status: 200, body: opView(opById(p.id)) } : notFound("Операция"))],
      [
        "POST",
        "/operations/{id}/pause",
        (p) => {
          const op = opById(p.id);
          if (!op) return notFound("Операция");
          if (op.state !== "running") return problem(409, "BUSY", "Операция не выполняется");
          op.state = "paused";
          return { status: 200, body: opView(op) };
        },
      ],
      [
        "POST",
        "/operations/{id}/resume",
        (p) => {
          const op = opById(p.id);
          if (!op) return notFound("Операция");
          if (op.state !== "paused") return problem(409, "BUSY", "Операция не на паузе");
          op.state = "running";
          op.nextAt = now() + stepMs(op.items.filter((x) => x.state !== "wait").length);
          return { status: 200, body: opView(op) };
        },
      ],
      [
        "POST",
        "/operations/{id}/cancel",
        (p) => {
          const op = opById(p.id);
          if (!op) return notFound("Операция");
          if (op.state === "done") return problem(409, "BUSY", "Операция уже завершена");
          op.items.forEach((x) => {
            if (x.state === "wait") Object.assign(x, { state: "cancel", code: null });
          });
          finish(op);
          return { status: 200, body: opView(op) };
        },
      ],
      [
        "POST",
        "/operations/{id}/retry-failed",
        (p) => {
          const op = opById(p.id);
          if (!op) return notFound("Операция");
          const failed = op.items.filter((x) => x.state === "fail");
          if (op.state !== "done" || !failed.length) return problem(409, "BUSY", "Повторять нечего: операция не завершена или неудачных шагов нет");
          // Повтор и откат — новые операции: занятый другой операцией объект они тоже не трогают
          const lockedRetry = lockedProblem(failed.map((x) => x.req.targetId));
          if (lockedRetry) return lockedRetry;
          return { status: 202, body: opView(startOperation(failed.map((x) => ({ targetId: x.req.targetId, set: x.req.set, folderIds: x.req.folderIds, create: x.req.create })).map(stripUndefined), { retryOf: op.id })) };
        },
      ],
      [
        "POST",
        "/operations/{id}/revert",
        (p) => {
          const op = opById(p.id);
          if (!op) return notFound("Операция");
          const reason = revertReason(op);
          if (reason) return problem(409, "NOT_REVERTIBLE", "Откатить нельзя", { params: { reason } });
          const done = op.items.filter((x) => x.state === "ok");
          // Кроме самих объектов — то, что откат удалит: созданное шагом устройство с дочерними
          const removes = done.map((x) => x.before.remove && byId("devices", x.before.remove)).filter(Boolean);
          const lockedRevert = lockedProblem(done.map((x) => x.targetId).filter((id) => targetOf(id)).concat(removes.flatMap((d) => touchedBy("devices", d))), held);
          if (lockedRevert) return lockedRevert;
          op.reverted = true;
          // Шаги — в обратном порядке. Шаг сверяет значения своих полей с записанными: другое значение — объект
          // меняли после, шаг не выполняется. Удаление, папки и секреты назад не возвращаются
          const requests = done.slice().reverse().map((x) =>
            stripUndefined({
              targetId: x.targetId,
              set: x.before.set,
              remove: x.before.remove,
              expect: x.before.remove ? x.version : undefined,
              expectFields: x.after,
              undoable: x.before.deleted || x.before.folderIds || x.secret ? false : undefined,
            })
          );
          return { status: 202, body: opView(startOperation(requests, { revertOf: op.id })) };
        },
      ],
      [
        "POST",
        "/operations/{id}/redo",
        (p) => {
          const op = opById(p.id);
          if (!op) return notFound("Операция");
          const reason = redoReason(op);
          if (reason) return problem(409, "NOT_REVERTIBLE", "Повторить нельзя", { params: { reason } });
          const undo = [...ops.values()].filter((x) => x.revertOf === op.id).pop();
          // Только то, что отмена вернула: её удачные шаги в исходном порядке. Откат снял созданное — заново не создаётся
          const done = undo.items.filter((x) => x.state === "ok").reverse();
          const locked = lockedProblem(done.map((x) => x.targetId).filter((id) => targetOf(id)), held);
          if (locked) return locked;
          redoStack.pop();
          const requests = done.map((x) => (x.req.remove ? { targetId: x.targetId, undoable: false } : { targetId: x.targetId, set: x.req.expectFields, expectFields: x.req.set }));
          return { status: 202, body: opView(startOperation(requests, { redoOf: op.id })) };
        },
      ],
    ];
    function stripUndefined(o) {
      Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
      return o;
    }

    /* ===== Тестовый стенд: только с testSupport, в боевой системе этих операций нет ===== */

    const TEST_ROUTES = [
      [
        "POST",
        "/test/reset",
        (p, q, body) => {
          const base = FIXTURES[body.fixture];
          if (!base) return problem(404, "NOT_FOUND", `Набора ${body.fixture} нет`);
          // Часы останавливаются: время в тестах идёт только по /test/clock
          clock.frozenAt = body.freezeClock === false ? null : realNow() + clock.offset;
          load(body.fixturePatch ? mergePatch(base, body.fixturePatch) : base);
          if (body.actAs) {
            const u = db.access.users.find((x) => x.login === body.actAs);
            if (!u) return problem(404, "NOT_FOUND", `Пользователя ${body.actAs} нет`);
            me = u.id;
          }
          send("test.reset", { payload: {} });
          return { status: 200, body: { fixture: body.fixture, now: iso(now()), frozen: clock.frozenAt != null } };
        },
      ],
      [
        "POST",
        "/test/clock",
        (p, q, body) => {
          const ms = body.advanceSec * 1000;
          // Время идёт шагами: всё, что наступило по пути, выполняется в свой момент, а не разом в конце
          const fired = [];
          const target = now() + ms;
          for (let t = now(); ; ) {
            const due = Math.min(target, ...[...ops.values()].filter((o) => o.state === "running").map((o) => o.nextAt), ...formatting.values(), ...[...searches.values()].map((s) => s.nextAt), ...[...syncing.values()].map((s) => s.at));
            if (clock.frozenAt != null) clock.frozenAt = Math.max(t, due);
            else clock.offset += Math.max(t, due) - now();
            fired.push(...tick());
            t = now();
            if (t >= target) break;
          }
          return { status: 200, body: { now: iso(now()), fired } };
        },
      ],
      [
        "POST",
        "/test/events",
        (p, q, body) => {
          const dev = byId("devices", body.deviceId);
          if (!dev) return notFound("Устройство");
          // Сервер сам находит и теряет записи, когда устройство ответило иначе
          if (body.type === "device.found") {
            if (!body.found) return problem(422, "VALIDATION_FAILED", "Нужно found", { field: "found" });
            const d = Object.assign({ id: uuid("device"), type: body.found.type, parentId: dev.id, domainId: dev.domainId, name: body.found.name, online: true, enabled: true, version: newVersion() }, body.found.channel != null ? { channel: body.found.channel } : {});
            db.devices.push(d);
            send("entity.created", { kind: "device", entityId: d.id, version: d.version });
            return { status: 200, body: { applied: true, deviceId: d.id } };
          }
          if (body.type === "device.lost") {
            removeDevice(dev.id);
            return { status: 200, body: { applied: true } };
          }
          if (body.type === "device.parent") {
            dev.parentId = body.parentId || null;
            bump(dev);
            changed("device", dev);
            return { status: 200, body: { applied: true } };
          }
          if (body.type === "device.signal") {
            if (typeof body.online !== "boolean") return problem(422, "VALIDATION_FAILED", "Нужно online", { field: "online" });
            dev.online = body.online;
            if (dev.online) delete dev.fault;
            else dev.fault = body.fault || dev.fault || "conn";
          } else {
            if (body.fault) dev.fault = body.fault;
            else delete dev.fault;
          }
          // Связь — состояние, а не настройка: версия не растёт, иначе правка администратора упала бы с 412
          send("entity.changed", { kind: "device", entityId: dev.id, version: dev.version, payload: { status: true } });
          return { status: 200, body: { applied: true } };
        },
      ],
    ];

    // Заглушка ассистента: разбор — по словам просьбы, чтобы сценарии были предсказуемы. Это не модель, план здесь
    // никто не проверяет: у бэкенда проверяет код. «сбой» — error, «маска сети» — refused, нет действия или камер — question
    const ASSIST_STOP = ["камер", "запис", "включ", "выклу", "парол", "секре", "смени", "всех", "этаж"];
    function assistStub(body) {
      const said = `${(body.context || "").replace(/^stub:/, "")} ${body.text}`.trim();
      const low = said.toLowerCase();
      const context = `stub:${said}`;
      const at = iso(now());
      const out = [{ type: "progress", at, text: "читаю камеры" }];
      const last = (e) => out.concat(Object.assign({ at }, e));
      if (/сбой/.test(low)) return last({ type: "error", code: "UPSTREAM_UNAVAILABLE", message: "модель не отвечает" });
      if (/маск[аиу] сети/.test(low)) return last({ type: "refused", text: "Маски сети нет среди полей устройства.", context, field: "netmask" });
      const secret = (low.match(/секрет\D*(\d+)/) || [])[1];
      const set = /парол/.test(low) ? null : /выключи.*запис/.test(low) ? { recordMode: "none" } : /включи.*запис/.test(low) ? { recordMode: "always" } : /выключи/.test(low) ? { enabled: false } : /включи/.test(low) ? { enabled: true } : undefined;
      if (set === undefined) return last({ type: "question", text: "Что изменить на камерах?", context });
      if (!set && !(body.secrets || [])[Number(secret) - 1]) return last({ type: "question", text: "Какой секрет поставить паролем?", context });
      const words = low.split(/[^а-яёa-z0-9]+/).map((w) => w.slice(0, 5)).filter((w) => w.length >= 4 && !ASSIST_STOP.includes(w));
      // Частичных правок и пустых строк в плане нет: камера, где значение уже такое, в план не идёт
      const already = (d) => set && Object.entries(set).every(([k, v]) => d[k] === v);
      const found = db.devices.filter((d) => d.type === "camera" && words.some((w) => d.name.toLowerCase().includes(w)) && !already(d));
      if (!found.length) return last({ type: "question", text: "На каких камерах?", context });
      out.push({ type: "progress", at, text: "проверяю план" });
      const items = found.map((d) => {
        if (!set) {
          return { deviceId: d.id, version: d.version, set: { password: body.secrets[Number(secret) - 1] }, name: d.name,
            changes: [{ field: "password", after: `новый (секрет № ${secret})`, why: "просьба" }] };
        }
        const [[field, after]] = Object.entries(set);
        return { deviceId: d.id, version: d.version, set, name: d.name, changes: [{ field, before: d[field], after, why: "просьба" }] };
      });
      return last({ type: "plan", summary: `Камеры: ${found.length}`, context, items });
    }

    const compile = (list, test) =>
      list.map(([method, template, fn]) => {
        const names = [];
        const re = new RegExp(`^${template.replace(/\{(\w+)\}/g, (m, name) => (names.push(name), "([^/]+)"))}$`);
        return { method, template, re, names, fn, test };
      });
    const compiled = compile(ROUTES, false).concat(compile(TEST_ROUTES, true));

    function handle(method, url, body, headers) {
      const [path, query = ""] = String(url).split("?");
      const q = {};
      new URLSearchParams(query).forEach((v, k) => (q[k] = v));
      const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
      const fits = compiled.filter((r) => r.method === method && r.re.test(path)).sort((a, b) => a.names.length - b.names.length);
      const route = fits[0];
      if (!route) return problem(404, "NO_ROUTE", `${method} ${path}: такой операции нет`);
      if (route.test && !testSupport) return problem(404, "TEST_SUPPORT_OFF", "Служебные операции тестового стенда выключены");
      const operationId = OPERATION[`${method} ${shape(route.template)}`];
      if (!route.test && operationId && !caps().operations.includes(operationId)) return problem(404, "NO_ROUTE", `${method} ${path}: система этого не поддерживает (${operationId} нет в capabilities)`);
      const m = path.match(route.re);
      const params = {};
      route.names.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
      // Тело — по контракту: что не подходит под схему, сервер не выполняет
      if (SPEC && method !== "GET" && window.ConsolemContract) {
        const errs = window.ConsolemContract.requestProblems(SPEC, method, path, body);
        if (errs.length) {
          const field = (errs[0].match(/^body\.?([^:\s[]*)/) || [])[1] || undefined;
          return problem(422, "VALIDATION_FAILED", errs.slice(0, 3).join("; "), field ? { field } : {});
        }
      }
      // Перед запросом — всё, что уже наступило по времени: шаги операций не ждут следующего такта
      if (!route.test) tick();
      const key = method === "POST" && body && body.idempotencyKey ? `${method} ${path} ${body.idempotencyKey}` : null;
      answered.forEach((a, k) => now() - a.at >= IDEMPOTENCY_MS && answered.delete(k));
      if (key && answered.has(key)) return clone(answered.get(key).res);
      const res = route.fn(params, q, body || {}, h);
      const out = { status: res.status, body: res.body === undefined ? null : res.body, headers: res.headers || {} };
      if (key && res.status < 300) answered.set(key, { at: now(), res: clone(out) });
      return out;
    }

    load(FIXTURE);
    if (opts.autoTick !== false) setInterval(tick, 40);

    return {
      handle,
      subscribe,
      routes: compiled.map((r) => `${r.method} ${r.template}`),
    };
  }

  window.ConsolemServer = { create };
})();
