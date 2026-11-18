/* Покрытие профилей (часть 07): какие поля вида ручной экран показывает. Сценарий UiCheck, как tests/ui-*.js, но лежит
   вне tests/: check_ui.py его не гоняет, запускает tools/profile_coverage.py (он же кладёт перед сценарием window.PCOV_DATA:
   исключения профиля и схемы полей состояния из api/profiles/*.json — GET /kinds отдаёт только их имена).
   ?pcov=<профиль>&units=N — прогон профиля, ?pcov=selfcheck — самопроверка инструмента.

   Мера — возмущение: поле объекта меняется в кэше страницы (hwApplyUnit), вкладки экрана перерисовываются, разметка
   сравнивается со снимком без правки. Поле «показано», если хоть один снимок отличается. Виды экрана у объекта — вкладки
   его карточки, вкладки карточки родителя с ручным экраном (поток и детектор в камере) и окно детектора (карточка без
   вкладок). «Не показано» — повод проверить: поле может быть видно только при условии, в окне или в режиме правки. */

const PCOV = window.PCOV_DATA || { allow: {}, status: {} };
const pcovClone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const pcovSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pcovKindOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const pcovSettle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

// Значение «с нуля» по схеме: поле есть в схеме, а у объекта его нет
function pcovSample(s, ctx) {
  s = s || {};
  if ("const" in s) return pcovClone(s.const);
  if (s.enum && s.enum.length) return pcovClone(s.enum[0]);
  if (s.default !== undefined) return pcovClone(s.default);
  const ref = s["x-ref"], refs = ref && ctx?.refs ? ctx.refs(ref) || [] : [];
  if (refs.length) return refs[0];
  const t = [].concat(s.type || []).find((x) => x !== "null");
  if (t === "boolean") return true;
  if (t === "integer" || t === "number") {
    const lo = s.minimum !== undefined ? s.minimum : s.exclusiveMinimum, hi = s.maximum !== undefined ? s.maximum : s.exclusiveMaximum;
    const v = lo !== undefined && hi !== undefined ? (lo + hi) / 2 : lo !== undefined ? (s.minimum !== undefined ? lo : lo + 1) : hi !== undefined ? hi - 1 : 0;
    return t === "integer" ? Math.ceil(v) : v;
  }
  if (t === "string") {
    if (s.format === "ipv4") return "10.0.0.1";
    if (s.format === "uuid") return "00000000-0000-4000-8000-0000000000cc";
    if (s.format === "date-time") return "2026-01-01T00:00:00Z";
    if (s.format === "date") return "2026-01-01";
    // Шаблон (pattern) не разобрать: несколько обычных строк, первая подходящая
    const len = Math.max(1, s.minLength || 1);
    return ["x".repeat(len), "x.txt", "x.prl", "COM1", "a1", "1"].find((v) => (!s.pattern || new RegExp(s.pattern).test(v)) && v.length >= len && (s.maxLength === undefined || v.length <= s.maxLength)) || "x".repeat(len);
  }
  if (t === "array") return Array.from({ length: s.minItems || 0 }, () => pcovSample(s.items, ctx));
  if (t === "object") {
    const o = {};
    (s.required || []).forEach((k) => (o[k] = pcovSample((s.properties || {})[k], ctx)));
    return o;
  }
  return undefined;
}

// Другой символ того же рода: цифра — следующая цифра, буква — следующая буква
function pcovNextChar(c) {
  if (/[0-8]/.test(c)) return String(+c + 1);
  if (c === "9") return "0";
  if (/[a-eA-E]/.test(c)) return String.fromCharCode(c.charCodeAt(0) + 1);
  if (c === "f" || c === "F") return c === "f" ? "a" : "A";
  if (/[g-yG-Y]/.test(c)) return String.fromCharCode(c.charCodeAt(0) + 1);
  return c === "x" ? "y" : "x";
}

function pcovPerturbStr(s, cur) {
  const fits = (v) => (s.maxLength === undefined || v.length <= s.maxLength) && (s.minLength === undefined || v.length >= s.minLength) &&
    (!s.pattern || new RegExp(s.pattern).test(v));
  if (s.format === "ipv4" && /^\d+\.\d+\.\d+\.\d+$/.test(cur)) {
    const p = cur.split(".").map(Number);
    p[3] = p[3] >= 254 ? p[3] - 1 : p[3] + 1;
    return { ok: true, value: p.join(".") };
  }
  if ((s.format === "date-time" || s.format === "date") && !isNaN(Date.parse(cur))) {
    const d = new Date(Date.parse(cur) + 86400e3).toISOString();
    return { ok: true, value: s.format === "date" ? d.slice(0, 10) : d.replace(/\.000Z$/, "Z") };
  }
  const last = cur.slice(-1);
  const cands = [cur.slice(0, -1) + pcovNextChar(last), cur + "x", cur + "1", "x" + cur];
  if (s.format !== "uuid") cands.unshift(cur + "x");
  const v = cands.find((x) => x !== cur && fits(x));
  return v === undefined ? { ok: false, why: "строку не изменить в границах схемы" } : { ok: true, value: v };
}

function pcovPerturbIn(s, value, ctx) {
  s = s || {};
  const alts = s.anyOf || s.oneOf;
  if (alts) {
    const V = window.ConsolemContract?.validate;
    const fit = alts.filter((a) => !V || !V(a, value, "", {}).length);
    for (const a of fit.length ? fit : alts) {
      const r = pcovPerturbIn(Object.assign({}, s, { anyOf: undefined, oneOf: undefined }, a), value, ctx);
      if (r.ok) return r;
    }
    return { ok: false, why: "ни один вариант схемы не меняется" };
  }
  if ("const" in s) return { ok: false, why: "постоянное значение (const)" };
  const cur = value === undefined ? s.default : value;
  const types = [].concat(s.type || []);
  const nullable = types.includes("null");
  if (s.enum) {
    const i = s.enum.findIndex((e) => pcovSame(e, cur));
    if (s.enum.length < 2 && i >= 0) return nullable && cur !== null ? { ok: true, value: null } : { ok: false, why: "в перечне одно значение" };
    return { ok: true, value: pcovClone(i < 0 ? s.enum[0] : s.enum[(i + 1) % s.enum.length]) };
  }
  const ref = s["x-ref"];
  if (ref && pcovKindOf(cur) !== "array") {
    const refs = ctx?.refs ? ctx.refs(ref) || [] : [];
    const other = refs.find((x) => x !== cur);
    if (other !== undefined) return { ok: true, value: other };
    if (nullable && cur !== null && cur !== undefined) return { ok: true, value: null };
    return { ok: false, why: "нет другого объекта нужного профиля" };
  }
  if (cur === undefined || cur === null) {
    const v = pcovSample(Object.assign({}, s, { default: undefined, type: types.filter((t) => t !== "null") }), ctx);
    if (v === undefined || v === null) return { ok: false, why: types.length === 1 && nullable ? "схема допускает только null" : "нет значения, и схема его не подсказывает" };
    return { ok: true, value: v };
  }
  const k = pcovKindOf(cur);
  if (types.length && !types.includes(k) && !(k === "integer" && types.includes("number"))) return { ok: false, why: `значение ${k}, а схема ${types.join("|")}` };
  if (k === "boolean") return { ok: true, value: !cur };
  if (k === "integer" || k === "number") {
    const step = s.multipleOf || 1, inb = (v) => (s.maximum === undefined || v <= s.maximum) && (s.minimum === undefined || v >= s.minimum) &&
      (s.exclusiveMaximum === undefined || v < s.exclusiveMaximum) && (s.exclusiveMinimum === undefined || v > s.exclusiveMinimum);
    if (inb(cur + step)) return { ok: true, value: cur + step };
    if (inb(cur - step)) return { ok: true, value: cur - step };
    return { ok: false, why: "одно значение в границах" };
  }
  if (k === "string") return pcovPerturbStr(s, cur);
  if (k === "array") {
    const min = s.minItems || 0, max = s.maxItems === undefined ? Infinity : s.maxItems;
    if (cur.length > min) return { ok: true, value: cur.slice(0, -1) };
    if (cur.length < max) {
      const last = cur[cur.length - 1];
      let item;
      if (cur.length) { const r = pcovPerturbIn(s.items, last, ctx); item = r.ok ? r.value : pcovClone(last); }
      else item = pcovSample(s.items, ctx);
      if (item === undefined) return { ok: false, why: "элемент массива не построить по схеме" };
      return { ok: true, value: cur.concat([item]) };
    }
    return { ok: false, why: "массив на пределе minItems и maxItems" };
  }
  if (k === "object") {
    const props = s.properties || {};
    const names = [...Object.keys(props).filter((n) => n in cur), ...Object.keys(cur).filter((n) => !(n in props))];
    for (const n of names) {
      const r = pcovPerturbIn(props[n] || { type: pcovKindOf(cur[n]) }, cur[n], ctx);
      if (r.ok) return { ok: true, value: Object.assign({}, cur, { [n]: r.value }) };
    }
    return { ok: false, why: "у объекта нет поля, которое можно изменить" };
  }
  return { ok: false, why: `значение ${k} не изменить` };
}

// Другое значение поля по схеме: перечень — следующее, логическое — обратное, число — на шаг в границах, адрес — соседний,
// строка — длиннее или с другим последним символом в границах, массив — без последнего или с ещё одним элементом,
// ссылка (x-ref) — другой объект нужного профиля (ctx.refs(ref) → uid по порядку). Значение проходит ConsolemContract.validate
function pcovPerturb(schema, value, ctx) {
  const r = pcovPerturbIn(schema || {}, value, ctx);
  if (!r.ok) return r;
  if (pcovSame(r.value, value)) return { ok: false, why: "новое значение совпало со старым" };
  const V = window.ConsolemContract?.validate;
  const errs = V && schema ? V(schema, r.value, "", {}) : [];
  if (errs.length) return { ok: false, why: "новое значение не по схеме: " + errs.map((e) => e.params?.keyword || e.code).join(", ") };
  return r;
}

// Снимок вида: разметка #main и открытого окна без style, время — HH:MM, значения полей ввода дописаны
function pcovSnap(view) {
  const roots = [document.getElementById("main"), ...document.querySelectorAll(".confirm.on, .mask.on")].filter(Boolean);
  const parts = [view ? String(view.key || view) : ""];
  roots.forEach((r) => {
    const vals = [...r.querySelectorAll("input, select, textarea")].map((el) => (el.type === "checkbox" || el.type === "radio" ? el.checked : el.value));
    const c = r.cloneNode(true);
    c.removeAttribute("style");
    c.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));
    parts.push(c.outerHTML.replace(/\d\d:\d\d(:\d\d)?/g, "HH:MM"), JSON.stringify(vals).replace(/\d\d:\d\d(:\d\d)?/g, "HH:MM"));
  });
  return parts.join("\n");
}

// ?debug=1 (profile_coverage.py --debug): в отчёте — где снимки разошлись
const PCOV_DEBUG = new URLSearchParams(location.search).get("debug") === "1";
function pcovDiff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(Math.max(0, i - 80), i + 80) + " ⇒ " + b.slice(Math.max(0, i - 80), i + 80);
}

// Показать вид: карточку объекта на вкладке (pick) или окно; уже открытую карточку — сменой вкладки
async function pcovShow(v) {
  if (v.open) v.open();
  else if (sel !== v.at) pick(v.at, { force: true, tab: v.tab || undefined });
  else { if (v.tab) tab = v.tab; gear(); }
  // Вкладка дочитывает данные (журнал, сработки): ждать, пока разметка не перестанет меняться
  await pcovSettle();
  let prev = pcovSnap(v);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 20));
    const cur = pcovSnap(v);
    if (cur === prev) return;
    prev = cur;
  }
}

// Виды экрана объекта u: вкладки своей карточки (или окно, куда ведёт pick: поддетектор — окно детектора), вкладки
// карточки родителя с ручным экраном
async function pcovViews(u) {
  const out = [], seen = new Set();
  const add = (n, at, tabId, open) => {
    const key = `${n.type}:${tabId || ""}`;
    if (seen.has(at + key)) return;
    seen.add(at + key);
    out.push({ key, at, tab: tabId, open });
  };
  const tabsOf = (n) => { const t = tabsFor(n).map((x) => x[0]); return t.length ? t : [null]; };
  // Сначала карточка родителя: она дочитывает дочерние (поддетекторы окна детектора — dwSubsEnsure)
  const p0 = u.parentId && find(u.parentId)?.n;
  if (p0 && !isSchemaNode(p0)) { pick(p0.id, { force: true }); await pcovSettle(); }
  if (find(u.uid)) {
    const isDet = handScreenOf(u.kind) === "det" && find(u.uid)?.p;
    const open = isDet ? () => detFromCam(u.uid) : () => pick(u.uid, { force: true });
    open();
    await pcovSettle();
    const land = find(sel)?.n;
    if (land && !isSchemaNode(land)) {
      if (sel === u.uid) tabsOf(land).forEach((t) => add(land, u.uid, t, t ? null : open));
      else add(land, sel, null, open);
    }
  }
  const p = u.parentId && find(u.parentId)?.n;
  if (p && !isSchemaNode(p)) {
    pick(p.id, { force: true });
    await pcovSettle();
    tabsOf(p).forEach((t) => add(p, p.id, t, null));
  }
  return out;
}

// Кэш страницы с объектом u: hwApplyUnit; на время применения GET /units и GET /units/{uid} отдают u (поток камеры
// перечитывается с сервера — hwStreamsRead)
async function pcovApply(u) {
  const realGet = API.get;
  const as = (x) => (x && x.uid === u.uid ? pcovClone(u) : x);
  API.get = function (path, params) {
    return realGet.call(this, path, params).then((r) => {
      if (path === `/units/${u.uid}`) return as(r);
      if (path === "/units" && r && Array.isArray(r.items)) return Object.assign({}, r, { items: r.items.map(as) });
      return r;
    });
  };
  try {
    await hwApplyUnit(pcovClone(u));
    // Окно детектора держит черновик и сохранённые настройки (dw.cfg, dw.saved): поле, которое пропало и вернулось, черновик
    // счёл бы правкой пользователя, и окно перестало бы следовать объекту. Прогон открывает окно заново, как после перехода
    if (typeof dw !== "undefined" && dw && dw.cfg) [u.uid, u.parentId].forEach((id) => { if (id && !dw.sent?.[id]) ["cfg", "saved", "sig"].forEach((m) => dw[m] && delete dw[m][id]); });
    await pcovSettle();
  } finally { API.get = realGet; }
}

// Поле u: {where, schema, value}; где оно лежит в объекте
function pcovField(u, f, where, schema) {
  // Строка-момент без format (…At у полей состояния): меняется как дата и время, иначе экран получил бы «x» вместо даты
  const v0 = where === "status" ? u.status?.observed?.[f] : u.properties?.[f];
  if (schema && !schema.format && !schema.enum && [].concat(schema.type || []).includes("string") &&
    (/At$/.test(f) || (typeof v0 === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v0)))) schema = Object.assign({}, schema, { format: "date-time" });
  if (where === "status") return { where, schema, value: u.status?.observed?.[f] };
  if (schema?.writeOnly) return { where: "secrets", schema: { type: "boolean" }, value: !!u.secrets?.[f] };
  return { where, schema, value: u.properties?.[f] };
}
// Объект с другим значением поля — и с другой версией, как после настоящей правки: окно детектора перечитывает
// объект только по смене версии (dwSig)
function pcovSet(u, f, where, value) {
  const v = pcovClone(u);
  v.version = String(u.version) + "~pcov";
  if (where === "status") { v.status = v.status || {}; v.status.observed = Object.assign({}, v.status.observed, { [f]: value }); }
  else if (where === "secrets") { v.secrets = Object.assign({}, v.secrets); if (value) v.secrets[f] = true; else delete v.secrets[f]; }
  else v.properties = Object.assign({}, v.properties, { [f]: value });
  return v;
}

// Объекты вида: до 40 первых по uid, полное чтение; жадный выбор — каждый следующий даёт больше новых значений перечней
async function pcovObjects(kind) {
  const rows = (await uiUnitsAll({ kind })).sort((a, b) => (a.uid < b.uid ? -1 : 1)).slice(0, 40);
  return Promise.all(rows.map((r) => API.get(`/units/${r.uid}`)));
}
function pcovChoose(pool, kind, n) {
  const ps = kindProps(kind);
  const enumF = Object.keys(ps).filter((f) => ps[f].enum || [].concat(ps[f].type || []).includes("boolean"));
  const pairs = (u) => enumF.map((f) => f + "=" + JSON.stringify(u.properties?.[f] === undefined ? ps[f].default : u.properties[f]));
  const seen = new Set(), out = [], left = pool.slice();
  while (out.length < n && left.length) {
    let best = 0, score = -1;
    left.forEach((u, i) => { const s = pairs(u).filter((p) => !seen.has(p)).length; if (s > score) { score = s; best = i; } });
    const u = left.splice(best, 1)[0];
    pairs(u).forEach((p) => seen.add(p));
    out.push(u);
  }
  return out;
}

const pcovRefCache = new Map();
async function pcovRefs(kinds) {
  // Ссылки всех схем видов: заранее, чтобы pcovPerturb работал без ожиданий
  const refs = [];
  kinds.forEach((k) => {
    const walk = (s) => {
      if (!s || typeof s !== "object") return;
      if (s["x-ref"]) refs.push(s["x-ref"]);
      Object.values(s).forEach((x) => typeof x === "object" && walk(x));
    };
    walk(kindProps(k));
  });
  for (const r of refs) {
    const key = JSON.stringify(r);
    if (pcovRefCache.has(key)) continue;
    // x-ref: implements (профили), kinds или kind (виды) — объекты всех названных
    const qs = [...[].concat(r.implements || []).map((implements) => ({ implements })), ...[].concat(r.kinds || r.kind || []).map((kind) => ({ kind }))];
    const uids = new Set();
    for (const q of qs) (await uiUnitsAll(q)).forEach((u) => uids.add(u.uid));
    pcovRefCache.set(key, [...uids].sort());
  }
}
const pcovCtx = { refs: (r) => pcovRefCache.get(JSON.stringify(r)) || [] };

// Отчёт профиля: {id, version, kinds:[{kind, screen, units, views, fields, coverage}], summary:{keep, remove, add, untested}}.
// opts: units — объектов на вид; objects — объекты вместо чтения с сервера (самопроверка); fields — только эти поля
async function pcovRun(profileId, opts) {
  opts = opts || {};
  const N = opts.units || 2, prof = KIND_PROFILES.get(profileId);
  const allow = opts.allow || PCOV.allow || {}, keepOk = allow.keep || {}, extraOk = allow.extra || {};
  const rep = { id: profileId, version: prof?.version || null, kinds: [], summary: { keep: [], remove: [], add: [], untested: [] } };
  if (!prof) { rep.note = "профиля нет в GET /kinds"; return rep; }
  const own = profileProps(prof), status = prof.status || [];
  const screenProfile = profileId in SCREEN_OF_PROFILE;
  const kinds = profileKinds(profileId);
  await pcovRefs(kinds);
  goApp("hw");
  if (cardDraft) { cardRestore(); gear(); }
  const formAllWas = new Map(formAllByKind);
  formAllByKind.clear();
  try {
    for (const k of kinds) {
      const pool = opts.objects ? opts.objects.filter((u) => u.kind === k) : await pcovObjects(k);
      if (!pool.length) continue;
      const ps = kindProps(k);
      // Поля всех знакомых профилей вида: «сверх профиля» — только то, чего нет ни в одном
      const known = new Set((KINDS.get(k)?.implements || []).filter((id) => KIND_PROFILES.has(id)).flatMap((id) => profileProps(KIND_PROFILES.get(id))));
      let names = [...own.map((f) => [f, "properties"]), ...status.map((f) => [f, "status"])];
      if (screenProfile) names = names.concat(Object.keys(ps).filter((f) => !own.includes(f)).map((f) => [f, "properties"]));
      if (opts.fields) names = names.filter(([f]) => opts.fields.includes(f));
      const fields = {};
      names.forEach(([f, where]) => {
        fields[f] = { inProfile: own.includes(f) || (where === "status" && status.includes(f)), tried: false, shown: false };
        if (where === "status") fields[f].status = true;
        if (!fields[f].inProfile && known.has(f)) fields[f].otherProfile = true;
      });
      const entry = { kind: k, screen: screenFor(k), units: [], views: [], fields };
      const viewNames = new Set();
      for (const base of pcovChoose(pool, k, N)) {
        // Строка перечня без полной записи — дочитать, как при клике (hwFull только для строк: домен, папка и том — не строки)
        await hwEnsure([base.parentId, base.uid].filter((id) => id && !find(id) && !isSubdetKind(k))).catch(() => {});
        for (const id of [base.parentId, base.uid]) if (id && find(id)?.n?._row) await hwFull(id).catch(() => {});
        const views = await pcovViews(base);
        if (!views.length) continue;
        await pcovApply(base);
        entry.units.push(base.uid);
        // Снимки без возмущения: два подряд должны совпасть, иначе вид неустойчив и выходит из прогона
        const snap0 = new Map(), live = [];
        for (const v of views) {
          // Разовый таймер вкладки (подпись живого видео) может сработать между снимками: до трёх пар
          let a, b;
          for (let i = 0; i < 3 && (i === 0 || a !== b); i++) { await pcovShow(v); a = pcovSnap(v); await pcovShow(v); b = pcovSnap(v); }
          if (a === b) { snap0.set(v, a); live.push(v); viewNames.add(v.key); }
          else {
            viewNames.add(v.key + " (неустойчив)");
            if (PCOV_DEBUG) (entry.unstable = entry.unstable || []).push(v.key + ": " + pcovDiff(a, b));
          }
        }
        for (const [f, where] of names) {
          const fld = pcovField(base, f, where, where === "status" ? PCOV.status?.[f] : ps[f]);
          // Поле профиля, которого у вида нет (профиль на несколько видов: СКУД) — не «не проверено», а «нет у вида»
          if (!fld.schema && fld.value === undefined) { if (!fields[f].tried) Object.assign(fields[f], { absent: true, why: "поля нет в схеме вида и у объекта" }); continue; }
          delete fields[f].absent;
          const r = pcovPerturb(fld.schema || { type: pcovKindOf(fld.value) }, fld.value, pcovCtx);
          if (!r.ok) { if (!fields[f].tried) fields[f].why = r.why; continue; }
          fields[f].tried = true;
          delete fields[f].why;
          const diff = new Map();
          let crash = null, at = null;
          try {
            await pcovApply(pcovSet(base, f, fld.where, r.value));
            for (const v of live) { at = v.key; await pcovShow(v); const sn = pcovSnap(v); if (sn !== snap0.get(v)) diff.set(v, sn); }
          } catch (e) { crash = `${at || "применение"}: ${e.message || e}`; }
          await pcovApply(base);
          // Экран упал на новом значении — значит, читает поле: «показано» с причиной; снимки «до» — заново
          if (crash) {
            Object.assign(fields[f], { shown: true, error: crash });
            fields[f].views = [...new Set([...(fields[f].views || []), (at || "?") + " (ошибка экрана)"])];
            for (const v of live) { await pcovShow(v); snap0.set(v, pcovSnap(v)); }
            continue;
          }
          // Отличие сверяется со снимком сразу после возврата: вкладка, которая меняется сама (журнал, сработки), иначе
          // дала бы «показано» любому полю. Возврат не вернул разметку — снимок «до» берётся заново
          const hit = [];
          for (const [v, sn] of diff) {
            await pcovShow(v);
            const s0 = pcovSnap(v);
            snap0.set(v, s0);
            if (sn === s0) continue;
            // Вторая проба на этом виде: вкладка, что меняется со временем (простой плеера, лента событий), не совпадёт
            // с возмущением дважды
            await pcovApply(pcovSet(base, f, fld.where, r.value));
            await pcovShow(v);
            const sn2 = pcovSnap(v);
            await pcovApply(base);
            await pcovShow(v);
            const s02 = pcovSnap(v);
            snap0.set(v, s02);
            if (sn2 === s02) continue;
            hit.push(v.key);
            if (PCOV_DEBUG) (fields[f].diff = fields[f].diff || []).push(v.key + ": " + pcovDiff(s0, sn));
          }
          if (hit.length) {
            fields[f].shown = true;
            fields[f].views = [...new Set([...(fields[f].views || []), ...hit])];
          }
        }
        // Объект — как на сервере
        await pcovApply(await API.get(`/units/${base.uid}`));
      }
      if (!entry.units.length) continue;
      entry.views = [...viewNames];
      entry.coverage = screenCoverage(k, Object.keys(fields).filter((f) => fields[f].shown && !fields[f].status));
      rep.kinds.push(entry);
    }
  } finally {
    formAllWas.forEach((v, k) => formAllByKind.set(k, v));
  }
  if (!rep.kinds.length) rep.note = "нет видов профиля, которые открывает ручной экран";
  const all = [...own, ...status];
  const shownAny = (f) => rep.kinds.some((k) => k.fields[f]?.shown);
  const triedAny = (f) => rep.kinds.some((k) => k.fields[f]?.tried);
  const S = rep.summary;
  S.keep = all.filter(shownAny);
  S.untested = all.filter((f) => !triedAny(f) && !(f in keepOk));
  S.remove = all.filter((f) => !shownAny(f) && triedAny(f) && !(f in keepOk));
  // «Сверх профиля» — у профиля, который выбирает экран; вторичные (live, ptz, …) его не повторяют
  if (screenProfile) S.add = [...new Set(rep.kinds.flatMap((k) => Object.keys(k.fields).filter((f) => {
    const x = k.fields[f];
    return x.shown && !x.inProfile && !x.otherProfile && !(f in extraOk);
  })))];
  return rep;
}

async function pcovSelfcheck(ok) {
  const ids = (await uiUnitsAll({ implements: "vms.archive/1" })).map((u) => u.uid).sort();
  const [archA, archB] = ids;
  const ctx = { refs: () => ids };
  const P = (s, v) => pcovPerturb(s, v, ctx);
  ok(P({ enum: ["a", "b"] }, "a").value === "b" && !P({ enum: ["a"] }, "a").ok, "перечень: другое значение; одно значение — не проверить");
  ok(P({ type: "boolean" }, true).value === false && P({ type: "integer", maximum: 5 }, 5).value === 4 && P({ type: "integer", multipleOf: 10 }, 20).value === 30, "логическое и число в границах");
  ok(P({ type: "string", format: "ipv4" }, "10.0.0.1").value === "10.0.0.2" && P({ type: "string", maxLength: 3 }, "abc").value.length === 3, "адрес и строка в границах");
  ok(P({ type: "array", minItems: 1, items: { type: "string" } }, ["x"]).value.length === 2 && P({ type: "array", items: { type: "string" } }, ["x", "y"]).value.length === 1, "массив: убрать или добавить элемент");
  ok(P({ type: ["string", "null"], "x-ref": { implements: ["vms.archive/1"] } }, archA).value === archB, "ссылка — на другой объект нужного профиля");

  // Камера набора; в схему вида camera на время самопроверки добавлено covHidden:{type:"string"}, у объекта covHidden:"a".
  // Поле «Видео» — ptz (поворот и пресеты), а не fps из плана: к/с камеры карточка не показывает. Узел камеры держит его
  // в _f["к/с"] (DEV_FLD) для групповой правки и копирования настроек, а «Видео» показывает к/с потоков
  const camK = KINDS.get("camera"), camWas = camK.schema;
  const camU = (await uiUnitsAll({ kind: "camera" })).sort((a, b) => (a.uid < b.uid ? -1 : 1))[0];
  const cam = await API.get(`/units/${camU.uid}`);
  let rep = null;
  camK.schema = Object.assign({}, camWas, { properties: Object.assign({}, camWas.properties, { covHidden: { type: "string" } }) });
  try {
    const r = await pcovRun("vms.camera/1", { units: 1, fields: ["ptz", "covHidden"], objects: [pcovSet(cam, "covHidden", "properties", "a")] });
    rep = r.kinds.find((k) => k.kind === "camera");
  } finally {
    camK.schema = camWas;
    await pcovApply(cam);
  }
  ok(rep?.fields.ptz.shown === true && rep.fields.ptz.views.includes("camera:vid"), "ptz камеры виден (вкладка «Видео»): " + JSON.stringify(rep?.fields.ptz));
  ok(rep?.fields.covHidden.tried === true && rep.fields.covHidden.shown === false, "поле, которое экран не читает, — не показано: " + JSON.stringify(rep?.fields.covHidden));

  // Поток камеры: виден в карточке камеры (родителя)
  const st = (await uiUnitsAll({ parentId: cam.uid, implements: "vms.stream/1" })).sort((a, b) => (a.uid < b.uid ? -1 : 1))[0];
  const streamRep = st ? (await pcovRun("vms.stream/1", { units: 1, fields: ["res"], objects: [await API.get(`/units/${st.uid}`)] })).kinds[0] : null;
  ok(streamRep?.fields.res.shown === true && streamRep.fields.res.views.some((v) => v.startsWith("camera:")), "поле потока видно в карточке камеры (родителя): " + JSON.stringify(streamRep?.fields.res));

  // Касса: в наборе нет кассы с rs232 — одна касса переводится на rs232 возмущением protocol. Среди объектов — две
  // одинаковые кассы и касса rs232: жадный выбор двух объектов должен взять кассу rs232
  const ev = await API.get(`/units/${(await uiUnitsAll({ kind: "eventsrc" }))[0].uid}`);
  const protoS = kindProps("eventsrc").protocol;
  let rs = ev;
  for (let i = 0; i < 5 && rs.properties?.protocol !== "rs232"; i++) rs = pcovSet(rs, "protocol", "properties", pcovPerturb(protoS, rs.properties?.protocol, ctx).value);
  let posRep = null;
  try {
    posRep = (await pcovRun("vms.pos/1", { units: 2, fields: ["baudRate"], objects: [ev, pcovClone(ev), rs] })).kinds[0];
  } finally {
    await pcovApply(ev);
  }
  ok(posRep?.fields.baudRate.shown === true, "baudRate кассы виден: среди объектов есть касса с protocol rs232: " + JSON.stringify(posRep?.fields.baudRate));
}

UiCheck(async ({ ok }) => {
  const q = new URLSearchParams(location.search), mode = q.get("pcov") || "";
  if (typeof screenFor !== "function" || typeof handScreenFields !== "function") { ok(false, "NOPAGE на странице нет screenFor и handScreenFields"); return; }
  if (mode === "selfcheck") return pcovSelfcheck(ok);
  if (!KIND_PROFILES.has(mode)) { ok(false, `профиля ${mode} нет в GET /kinds`); return; }
  const rep = await pcovRun(mode, { units: Math.max(1, +q.get("units") || 2) });
  ok(true, "COVERAGE " + JSON.stringify(rep));
});
