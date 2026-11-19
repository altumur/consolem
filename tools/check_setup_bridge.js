/* Проверка библиотеки страницы api/setup-bridge.js по протоколу setup/1 (api/SETUP-UI.md): tools/check_api.py читает
   отсюда JSON со списком отказов (пустой — всё хорошо). Окно поддельное: parent.postMessage пишет [сообщение, адресат],
   addEventListener("message") копит обработчики, location.ancestorOrigins, document.referrer и ResizeObserver — свои
   в каждом сценарии. Каждое отправленное сообщение сверяется со схемой своего type в api/setup-ui.schema.json
   (ConsolemContract.check) и должно идти к consolem (x-direction: toHost). */
global.window = global;
// Папка API — первый аргумент (по умолчанию api): node tools/check_setup_bridge.js [DIR]
const API = require("path").resolve(__dirname, "..", process.argv[2] || "api");
require(API + "/contract.js");
const schema = require(API + "/setup-ui.schema.json");
const shape = { components: { schemas: schema.$defs } };
const bad = [];
const fail = (where, text) => bad.push(`${where}: ${text}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Поддельное окно ──
const PARENT = { postMessage: (msg, target) => sent.push([JSON.parse(JSON.stringify(msg)), target]) };
const STRANGER = { postMessage() {} };
let sent = [], listeners = [], observers = [];
global.parent = PARENT;
global.addEventListener = (type, fn) => { if (type === "message") listeners.push(fn); };
global.removeEventListener = (type, fn) => { listeners = listeners.filter((f) => f !== fn); };
global.document = { referrer: "", documentElement: { scrollHeight: 0 } };
global.location = { ancestorOrigins: [], href: "https://door.example/setup/index.html" };
global.ResizeObserver = class {
  constructor(fn) { this.fn = fn; observers.push(this); }
  observe() {}
  disconnect() {}
};
// Новый сценарий: своё происхождение consolem, пустые журналы
// page — своё происхождение страницы: "https" (настоящая дверь), "file" (страница с диска), "null" (рамка без allow-same-origin)
const PAGES = {
  https: { protocol: "https:", origin: "https://door.example" },
  file: { protocol: "file:", origin: "null" },
  null: { protocol: "http:", origin: "null" },
};
let consoleErrors = [];
console.error = (...a) => consoleErrors.push(a.join(" "));
function env({ ancestors = ["https://console.example"], referrer = "", page = "https" } = {}) {
  sent = []; listeners = []; observers = []; consoleErrors = [];
  location.ancestorOrigins = ancestors;
  location.protocol = PAGES[page].protocol;
  global.origin = PAGES[page].origin;
  document.referrer = referrer;
  document.documentElement.scrollHeight = 0;
}
const post = (data, { origin = "https://console.example", source = PARENT } = {}) =>
  listeners.slice().forEach((fn) => fn({ data, origin, source }));
const tick = () => new Promise((r) => setTimeout(r, 0));

const UNIT = schema.examples.find((e) => e.type === "init").unit;
const INIT = (over = {}) => ({
  proto: "setup/1", type: "init", uid: UNIT.uid, kind: UNIT.kind, lang: "ru",
  theme: { mode: "dark", tokens: { "--one-fg": "#e6e8eb" } }, readOnly: false, unit: UNIT, draft: {},
  host: { proto: "setup/1", apply: "button" }, ...over,
});

// Сообщение библиотеки — по схеме своего type, направление toHost
const checked = new Set();
function audit(where) {
  sent.forEach(([msg], i) => {
    const key = `${where}#${i}`;
    if (checked.has(key)) return;
    checked.add(key);
    const def = schema.$defs[msg && msg.type];
    if (!def || !def["x-direction"]) return fail(where, `сообщение ${JSON.stringify(msg)} — нет в схеме`);
    if (def["x-direction"] !== "toHost") fail(where, `сообщение ${msg.type} идёт странице, а не consolem`);
    window.ConsolemContract.check(shape, def, msg, `${where}: ${msg.type}`, bad);
  });
}
const types = () => sent.map(([m]) => m.type);

// Сценарий: подключиться и получить init (или не получить)
async function connected(opts = {}, init = INIT(), from = {}) {
  let session = null;
  const p = window.SetupBridge.connect(opts).then((s) => (session = s));
  post(init, from);
  await tick();
  return { session, p };
}

async function run() {
  require(API + "/setup-bridge.js");
  if (!window.SetupBridge) return fail("загрузка", "window.SetupBridge нет");
  const B = window.SetupBridge;

  // 1 connect шлёт ready сразу, на происхождение consolem
  env();
  B.connect({ fields: ["/properties/code_length"] });
  if (!same(sent, [[{ proto: "setup/1", type: "ready", fields: ["/properties/code_length"] }, "https://console.example"]]))
    fail("1 ready", `отправлено ${JSON.stringify(sent)}`);
  audit("1");

  // 2 init из чужого окна или с чужого происхождения — обещание не сбылось
  for (const [label, from] of [["чужое окно", { source: STRANGER }], ["чужое происхождение", { origin: "https://evil.example" }]]) {
    env();
    const { session } = await connected({}, INIT(), from);
    if (session) fail(`2 ${label}`, "connect сбылся на init не от consolem");
  }

  // 3 верный init
  env();
  let init = INIT();
  let { session: s } = await connected({}, init);
  if (!s) fail("3 init", "connect не сбылся");
  else {
    if (!same(s.host, init.host)) fail("3 init", `host ${JSON.stringify(s.host)}`);
    if (s.readOnly !== false) fail("3 init", `readOnly ${s.readOnly}`);
    if (!same(s.unit, init.unit)) fail("3 init", "unit не из init");
    if (!same(s.init, init)) fail("3 init", "init не сохранён");
    if (!same(s.draft, {})) fail("3 init", `draft ${JSON.stringify(s.draft)}`);
  }

  // 4 change и flush
  env();
  let flushCalls = 0, sess4 = null;
  ({ session: s } = await connected({ autoHeight: false, onFlush: () => { flushCalls++; if (sess4.pending) sess4.change(sess4.pending); } }));
  sess4 = s;
  sent = [];
  if (s.change({ beep: false }) !== true) fail("4 change", "change вернул не true");
  if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "change", patch: { beep: false } }])) fail("4 change", `отправлено ${JSON.stringify(sent)}`);
  if (!same(s.draft, { beep: false })) fail("4 change", `draft ${JSON.stringify(s.draft)}`);
  audit("4a");
  sent = [];
  post({ proto: "setup/1", type: "flush", seq: 7 });
  if (flushCalls !== 1) fail("4 flush", `onFlush вызван ${flushCalls} раз`);
  if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "flushed", seq: 7 }])) fail("4 flush", `отправлено ${JSON.stringify(sent)}`);
  audit("4b");
  // ввод не отправлен до flush: onFlush отдаёт его — сначала change, потом flushed
  sent = [];
  s.pending = { beep: false, code_length: 8 };
  post({ proto: "setup/1", type: "flush", seq: 8 });
  if (!same(types(), ["change", "flushed"])) fail("4 flush с вводом", `отправлено ${JSON.stringify(types())}`);
  else if (!same(sent[0][0].patch, s.pending) || sent[1][0].seq !== 8) fail("4 flush с вводом", `отправлено ${JSON.stringify(sent)}`);
  audit("4c");
  // onFlush возвращает черновик: библиотека сама отправляет change, если он отличается от отправленного
  env();
  let back = { beep: true };
  ({ session: s } = await connected({ autoHeight: false, onFlush: () => back }));
  sent = [];
  post({ proto: "setup/1", type: "flush", seq: 1 });
  if (!same(types(), ["change", "flushed"]) || !same(sent[0][0].patch, back)) fail("4 flush с возвратом", `отправлено ${JSON.stringify(sent)}`);
  sent = [];
  post({ proto: "setup/1", type: "flush", seq: 2 });
  if (!same(types(), ["flushed"])) fail("4 flush без новой правки", `отправлено ${JSON.stringify(types())}`);
  audit("4d");

  // 5 только просмотр
  env();
  ({ session: s } = await connected({ autoHeight: false }, INIT({ readOnly: true })));
  sent = [];
  if (!s || s.readOnly !== true) fail("5 readOnly", "readOnly не true");
  else if (s.change({ beep: false }) !== false) fail("5 readOnly", "change вернул не false");
  if (sent.length) fail("5 readOnly", `отправлено ${JSON.stringify(sent)}`);

  // 6 незнакомый type и другая версия протокола — без исключения и без вызовов
  env();
  let calls = 0;
  const count = () => calls++;
  const all = { autoHeight: false, onDraft: count, onApplied: count, onErrors: count, onRevert: count, onTheme: count, onFlush: count };
  ({ session: s } = await connected(all));
  sent = [];
  try {
    post({ proto: "setup/1", type: "nope" });
    post({ proto: "setup/2", type: "init" });
    post({ proto: "setup/2", type: "draft", patch: { beep: true } });
    post("строка");
    post(null);
  } catch (e) { fail("6 незнакомое", `исключение ${e.message}`); }
  if (calls || sent.length) fail("6 незнакомое", `вызовов ${calls}, отправлено ${sent.length}`);
  // init второй раз и другая версия init до первого — не принимаются
  env();
  let got = null;
  B.connect({}).then((x) => (got = x));
  post({ ...INIT(), proto: "setup/2" });
  await tick();
  if (got) fail("6 init setup/2", "connect сбылся на setup/2");

  // 7 непрозрачное происхождение (правило стенда): отправка с "*", приём с "null" и "file://" —
  // только у страницы с диска или с непрозрачным своим происхождением
  for (const [anc, page] of [["null", "null"], ["file://", "file"], ["null", "file"]]) {
    for (const origin of ["null", "file://"]) {
      env({ ancestors: [anc], page });
      const { session } = await connected({}, INIT(), { origin });
      if (!same(sent[0], [{ proto: "setup/1", type: "ready" }, "*"])) fail(`7 предок ${anc}`, `ready ${JSON.stringify(sent[0])}`);
      if (!session) fail(`7 предок ${anc}`, `init с origin ${origin} не принят`);
    }
    env({ ancestors: [anc], page });
    const { session } = await connected({}, INIT(), { origin: "https://evil" });
    if (session) fail(`7 предок ${anc}`, "init с origin https://evil принят");
    env({ ancestors: [anc], page });
    const { session: s7 } = await connected({}, INIT(), { origin: "null", source: STRANGER });
    if (s7) fail(`7 предок ${anc}`, "init из чужого окна принят");
  }
  // referrer на file: и пусто — тоже непрозрачное
  for (const [label, o] of [["referrer file:", { referrer: "file:///home/x/index.html", page: "file" }], ["пусто", { referrer: "", page: "null" }]]) {
    env(o);
    delete location.ancestorOrigins;
    const { session } = await connected({}, INIT(), { origin: "file://" });
    if (!sent[0] || sent[0][1] !== "*") fail(`7 ${label}`, `ready ${JSON.stringify(sent[0])}`);
    if (!session) fail(`7 ${label}`, "init с file:// не принят");
  }
  // 7б настоящая страница (https) без происхождения consolem: нет ancestorOrigins (Firefox) и referrer (no-referrer),
  // или предок непрозрачный. Правила стенда нет: connect отказывает, сообщений нет, причина — в консоли
  for (const [label, o] of [["нет ancestorOrigins и referrer", { referrer: "" }], ["предок null", { ancestors: ["null"] }], ["предок file://", { ancestors: ["file://"] }]]) {
    env(o);
    if (!o.ancestors) delete location.ancestorOrigins;
    let res = "ждёт";
    B.connect({}).then(() => (res = "сбылся"), () => (res = "отказ"));
    post(INIT(), { origin: "null" });
    post(INIT(), { origin: "file://" });
    await tick();
    if (res !== "отказ") fail(`7б ${label}`, `connect: ${res}`);
    if (sent.length) fail(`7б ${label}`, `отправлено ${JSON.stringify(sent)}`);
    if (!consoleErrors.length) fail(`7б ${label}`, "в консоли нет причины");
  }
  // opts.origin — происхождение consolem явно: главнее ancestorOrigins и referrer
  env({ referrer: "" });
  delete location.ancestorOrigins;
  ({ session: s } = await connected({ origin: "https://console.example" }));
  if (!sent[0] || sent[0][1] !== "https://console.example") fail("7б opts.origin", `ready ${JSON.stringify(sent[0])}`);
  if (!s) fail("7б opts.origin", "init не принят");
  env({ ancestors: ["https://other.example"] });
  ({ session: s } = await connected({ origin: "https://console.example" }));
  if (!sent[0] || sent[0][1] !== "https://console.example") fail("7б opts.origin главнее", `ready ${JSON.stringify(sent[0])}`);
  // known origin не принимает "null"
  env();
  ({ session: s } = await connected({}, INIT(), { origin: "null" }));
  if (s) fail("7 известное происхождение", "init с origin null принят");

  // 8 ancestorOrigins нет — происхождение из referrer
  env({ referrer: "https://console.example/x" });
  delete location.ancestorOrigins;
  ({ session: s } = await connected({}));
  if (!sent[0] || sent[0][1] !== "https://console.example") fail("8 referrer", `ready ${JSON.stringify(sent[0])}`);
  if (!s) fail("8 referrer", "init не принят");
  env({ ancestors: [], referrer: "https://console.example/x" });
  ({ session: s } = await connected({}));
  if (!sent[0] || sent[0][1] !== "https://console.example") fail("8 пустой ancestorOrigins", `ready ${JSON.stringify(sent[0])}`);

  // 9 высота: вручную и ResizeObserver, одно значение два раза подряд — одно сообщение
  env();
  ({ session: s } = await connected({}));
  sent = [];
  s.height(480);
  if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "height", px: 480 }])) fail("9 height", `отправлено ${JSON.stringify(sent)}`);
  sent = [];
  if (observers.length !== 1) fail("9 autoHeight", `ResizeObserver создан ${observers.length} раз`);
  else {
    document.documentElement.scrollHeight = 612;
    observers[0].fn([]);
    observers[0].fn([]);
    if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "height", px: 612 }])) fail("9 autoHeight", `отправлено ${JSON.stringify(sent)}`);
  }
  audit("9");
  env();
  ({ session: s } = await connected({ autoHeight: false }));
  if (observers.length) fail("9 autoHeight:false", "ResizeObserver создан");

  // 10 errors, applied, revert, draft, theme
  env();
  const seen = [];
  ({ session: s } = await connected({
    autoHeight: false,
    onErrors: (p) => seen.push(["errors", p]), onApplied: (u) => seen.push(["applied", u]),
    onRevert: (u) => seen.push(["revert", u]), onDraft: (p) => seen.push(["draft", p]), onTheme: (t) => seen.push(["theme", t]),
  }));
  const problem = schema.examples.find((e) => e.type === "errors").problem;
  post({ proto: "setup/1", type: "errors", problem });
  if (!same(seen.pop(), ["errors", problem])) fail("10 errors", "onErrors не получил problem");
  s.change({ beep: false });
  const unit2 = { ...UNIT, version: "2" };
  post({ proto: "setup/1", type: "applied", unit: unit2 });
  if (!same(seen.pop(), ["applied", unit2])) fail("10 applied", "onApplied не получил unit");
  if (!same(s.draft, {}) || !same(s.unit, unit2)) fail("10 applied", `draft ${JSON.stringify(s.draft)}, unit ${s.unit && s.unit.version}`);
  post({ proto: "setup/1", type: "draft", patch: { backlight: "high" } });
  if (!same(seen.pop(), ["draft", { backlight: "high" }])) fail("10 draft", "onDraft не получил patch");
  if (!same(s.draft, { backlight: "high" })) fail("10 draft", `draft ${JSON.stringify(s.draft)}`);
  const unit3 = { ...UNIT, version: "3" };
  post({ proto: "setup/1", type: "revert", unit: unit3 });
  if (!same(seen.pop(), ["revert", unit3])) fail("10 revert", "onRevert не получил unit");
  if (!same(s.draft, {}) || !same(s.unit, unit3)) fail("10 revert", `draft ${JSON.stringify(s.draft)}`);
  const theme = { mode: "light", tokens: { "--one-fg": "#111" } };
  post({ proto: "setup/1", type: "theme", theme });
  if (!same(seen.pop(), ["theme", theme])) fail("10 theme", "onTheme не получил theme");

  // 11 invalid
  env();
  ({ session: s } = await connected({ autoHeight: false }));
  sent = [];
  s.invalid(["/properties/display_text"], "Текст длиннее 16 знаков");
  s.invalid([]);
  if (!same(sent.map(([m]) => m), [
    { proto: "setup/1", type: "invalid", fields: ["/properties/display_text"], message: "Текст длиннее 16 знаков" },
    { proto: "setup/1", type: "invalid", fields: [] },
  ])) fail("11 invalid", `отправлено ${JSON.stringify(sent)}`);
  audit("11");

  // 12 merge и diff
  const m = B.merge({ a: 1, b: { c: 1 } }, { b: { c: null }, d: 2 });
  if (!same(m, { a: 1, b: {}, d: 2 })) fail("12 merge", JSON.stringify(m));
  const base = { a: 1, b: { c: 1 } };
  B.merge(base, { a: 2, b: { c: 2 } });
  if (!same(base, { a: 1, b: { c: 1 } })) fail("12 merge", "base изменился");
  if (!same(B.merge({ a: 1 }, { a: [1, 2] }), { a: [1, 2] })) fail("12 merge", "массив не целиком");
  for (const [a, b, want] of [
    [{ a: 1, b: 2, c: [1] }, { a: 1, b: 3, c: [1], d: 4 }, { b: 3, d: 4 }],
    [{ a: 1 }, {}, { a: null }],
    [{ a: 1, b: { c: 1 } }, { a: 1, b: { c: 1 } }, {}],
    [{ b: { c: 1, d: 2 } }, { b: { c: 1 } }, { b: { d: null } }],
    [{ c: [1, 2] }, { c: [1] }, { c: [1] }],
  ]) {
    const d = B.diff(a, b);
    if (!same(d, want)) fail("12 diff", `diff(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${JSON.stringify(d)}, ждали ${JSON.stringify(want)}`);
    if (!same(B.merge(a, d), b)) fail("12 diff", `merge(base, diff) ≠ next для ${JSON.stringify(b)}`);
  }
  audit("конец");

  page13();
}

// 13 тестовая страница стенда api/plugins/security_controller/setup/ (SETUP-UI.md, «Чего страница не делает»): код только
// в файлах — setup-bridge.js и page.js, без <script> без src и атрибутов on…; без fetch, XMLHttpRequest, WebSocket и /api/:
// данные страница берёт из init. ready.fields из page.js — поля схемы security_controller/KEYPAD в demo.json, кроме
// lock_after_tries: на нём проверяют строку покрытия и ошибки «не на странице»
function page13() {
  const fs = require("fs"), path = require("path"), vm = require("vm");
  const rel = "plugins/security_controller/setup";
  const dir = path.join(API, rel);
  const text = {};
  for (const f of ["index.html", "page.js", "page.css"]) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) fail("13 страница", `api/${rel}/${f} нет`);
    else text[f] = fs.readFileSync(p, "utf8");
  }
  if (!text["index.html"] || !text["page.js"]) return;
  const html = text["index.html"].replace(/<!--[\s\S]*?-->/g, "");
  const tags = html.match(/<script\b[^>]*>/gi) || [];
  const srcs = tags.map((t) => (t.match(/\ssrc\s*=\s*["']([^"']+)["']/i) || [])[1]);
  if (srcs.some((s) => !s)) fail("13 страница", "index.html: <script> без src — код только в файлах");
  if (!same(srcs, ["../../../setup-bridge.js", "page.js"])) fail("13 страница", `index.html: скрипты ${JSON.stringify(srcs)}, ждали ../../../setup-bridge.js и page.js`);
  for (const [f, t] of Object.entries(text)) {
    const on = t.match(/<[^>]*\son[a-z]+\s*=/i);
    if (on) fail("13 страница", `${f}: атрибут on… в разметке — ${on[0].slice(-40)}`);
    for (const word of ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "/api/"])
      if (t.includes(word)) fail("13 страница", `${f}: ${word} — страница стенда работает без запросов, данные — из init`);
  }
  // page.js на поддельном окне: SetupBridge.connect только запоминает opts, документ отвечает на всё пустышкой
  const blank = new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.iterator ? function* () {} : k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : blank),
    apply: () => blank,
    construct: () => blank,
    set: () => true,
  });
  const calls = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, URLSearchParams, URL, JSON, Math, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout() {}, document: blank, navigator: { language: "ru" }, parent: {},
    location: { search: "?lang=ru", protocol: "file:", href: "file:///x/index.html" },
    SetupBridge: { proto: "setup/1", connect: (o) => { calls.push(o); return new Promise(() => {}); }, merge: window.SetupBridge.merge, diff: window.SetupBridge.diff },
  };
  ctx.window = ctx;
  try { vm.runInNewContext(text["page.js"], ctx, { filename: "page.js" }); } catch (e) { return fail("13 page.js", `исключение ${e.message}`); }
  if (calls.length !== 1) return fail("13 page.js", `SetupBridge.connect вызван ${calls.length} раз`);
  const demo = require(API + "/fixtures/demo.json");
  const keypad = (demo.kinds || []).find((k) => k.kind === "security_controller/KEYPAD");
  if (!keypad) return fail("13 page.js", "в demo.json нет вида security_controller/KEYPAD");
  const want = Object.keys(keypad.schema.properties).filter((k) => k !== "lock_after_tries").map((k) => `/properties/${k}`);
  const got = calls[0] && calls[0].fields;
  if (!same(got, want)) fail("13 page.js", `ready.fields ${JSON.stringify(got)}, ждали ${JSON.stringify(want)}`);
}

run().then(() => console.log(JSON.stringify(bad)), (e) => console.log(JSON.stringify([...bad, `исключение: ${e && e.stack}`])));
