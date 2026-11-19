/* Проверка библиотеки страницы api/setup-bridge.js по протоколу setup/1 (api/SETUP-UI.md): tools/check_api.py читает
   отсюда JSON {"problems": [отказы], "scenarios": N} (пустой список — всё хорошо). Окно поддельное: parent.postMessage пишет [сообщение, адресат],
   addEventListener("message") копит обработчики, location.ancestorOrigins, document.referrer и ResizeObserver — свои
   в каждом сценарии. PARENT.postMessage сверяет каждое отправленное сообщение со схемой своего type в
   api/setup-ui.schema.json (ConsolemContract.check): сообщение должно идти к consolem (x-direction: toHost). */
global.window = global;
// Папка API — первый аргумент (по умолчанию api): node tools/check_setup_bridge.js [DIR]
const API = require("path").resolve(__dirname, "..", process.argv[2] || "api");
require(API + "/contract.js");
const schema = require(API + "/setup-ui.schema.json");
const shape = { components: { schemas: schema.$defs } };
const bad = [];
const fail = (where, text) => bad.push(`${where}: ${text}`);
// Сценарии, которые прошёл прогон: их число check_api.py печатает в итоге
const scenes = new Set();
const scene = (n) => scenes.add(n);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Поддельное окно ──
// Каждое сообщение библиотеки — по схеме своего type, направление toHost. Проверка — в момент отправки
let posted = 0;
function audit(msg) {
  const where = `сообщение ${++posted} ${JSON.stringify(msg).slice(0, 120)}`;
  const def = schema.$defs[msg && msg.type];
  if (!def || !def["x-direction"]) return fail(where, "нет в схеме");
  if (def["x-direction"] !== "toHost") fail(where, `${msg.type} идёт странице, а не consolem`);
  window.ConsolemContract.check(shape, def, msg, `${where}: ${msg.type}`, bad);
}
const PARENT = {
  postMessage: (msg, target) => {
    const m = JSON.parse(JSON.stringify(msg));
    audit(m);
    sent.push([m, target]);
  },
};
const STRANGER = { postMessage() {} };
let sent = [], listeners = [], observers = [];
global.parent = PARENT;
global.addEventListener = (type, fn) => { if (type === "message") listeners.push(fn); };
global.removeEventListener = (type, fn) => { listeners = listeners.filter((f) => f !== fn); };
global.document = { referrer: "", documentElement: { scrollHeight: 0 }, body: { bottom: 0, mb: "0px", getBoundingClientRect() { return { top: 0, bottom: this.bottom, height: this.bottom }; } } };
global.getComputedStyle = (el) => ({ marginBottom: el.mb || "0px" });
global.scrollY = 0;
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
  document.body.bottom = 0; document.body.mb = "0px"; global.scrollY = 0;
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
  scene("1");
  env();
  B.connect({ fields: ["/properties/code_length"] });
  if (!same(sent, [[{ proto: "setup/1", type: "ready", fields: ["/properties/code_length"] }, "https://console.example"]]))
    fail("1 ready", `отправлено ${JSON.stringify(sent)}`);

  // 2 init из чужого окна или с чужого происхождения — обещание не сбылось
  scene("2");
  for (const [label, from] of [["чужое окно", { source: STRANGER }], ["чужое происхождение", { origin: "https://evil.example" }]]) {
    env();
    const { session } = await connected({}, INIT(), from);
    if (session) fail(`2 ${label}`, "connect сбылся на init не от consolem");
  }

  // 3 верный init
  scene("3");
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
  scene("4");
  env();
  let flushCalls = 0, sess4 = null;
  ({ session: s } = await connected({ autoHeight: false, onFlush: () => { flushCalls++; if (sess4.pending) sess4.change(sess4.pending); } }));
  sess4 = s;
  sent = [];
  if (s.change({ beep: false }) !== true) fail("4 change", "change вернул не true");
  if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "change", patch: { beep: false } }])) fail("4 change", `отправлено ${JSON.stringify(sent)}`);
  if (!same(s.draft, { beep: false })) fail("4 change", `draft ${JSON.stringify(s.draft)}`);
  sent = [];
  post({ proto: "setup/1", type: "flush", seq: 7 });
  if (flushCalls !== 1) fail("4 flush", `onFlush вызван ${flushCalls} раз`);
  if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "flushed", seq: 7 }])) fail("4 flush", `отправлено ${JSON.stringify(sent)}`);
  // ввод не отправлен до flush: onFlush отдаёт его — сначала change, потом flushed
  sent = [];
  s.pending = { beep: false, code_length: 8 };
  post({ proto: "setup/1", type: "flush", seq: 8 });
  if (!same(types(), ["change", "flushed"])) fail("4 flush с вводом", `отправлено ${JSON.stringify(types())}`);
  else if (!same(sent[0][0].patch, s.pending) || sent[1][0].seq !== 8) fail("4 flush с вводом", `отправлено ${JSON.stringify(sent)}`);
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

  // 5 только просмотр
  scene("5");
  env();
  ({ session: s } = await connected({ autoHeight: false }, INIT({ readOnly: true })));
  sent = [];
  if (!s || s.readOnly !== true) fail("5 readOnly", "readOnly не true");
  else if (s.change({ beep: false }) !== false) fail("5 readOnly", "change вернул не false");
  if (sent.length) fail("5 readOnly", `отправлено ${JSON.stringify(sent)}`);

  // 6 незнакомый type и другая версия протокола — без исключения и без вызовов
  scene("6");
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
  scene("7");
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
  scene("7б");
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
  scene("8");
  env({ referrer: "https://console.example/x" });
  delete location.ancestorOrigins;
  ({ session: s } = await connected({}));
  if (!sent[0] || sent[0][1] !== "https://console.example") fail("8 referrer", `ready ${JSON.stringify(sent[0])}`);
  if (!s) fail("8 referrer", "init не принят");
  env({ ancestors: [], referrer: "https://console.example/x" });
  ({ session: s } = await connected({}));
  if (!sent[0] || sent[0][1] !== "https://console.example") fail("8 пустой ancestorOrigins", `ready ${JSON.stringify(sent[0])}`);

  // 9 высота: вручную и ResizeObserver, одно значение два раза подряд — одно сообщение
  scene("9");
  env();
  ({ session: s } = await connected({}));
  sent = [];
  s.height(480);
  if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "height", px: 480 }])) fail("9 height", `отправлено ${JSON.stringify(sent)}`);
  sent = [];
  if (observers.length !== 1) fail("9 autoHeight", `ResizeObserver создан ${observers.length} раз`);
  else {
    document.body.bottom = 600; document.body.mb = "12px";
    observers[0].fn([]);
    observers[0].fn([]);
    if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "height", px: 612 }])) fail("9 autoHeight", `отправлено ${JSON.stringify(sent)}`);
    // Содержимое стало короче: высота — по содержимому (body), а не documentElement.scrollHeight, который не меньше рамки
    sent = [];
    document.documentElement.scrollHeight = 612;
    document.body.bottom = 288;
    observers[0].fn([]);
    if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "height", px: 300 }])) fail("9 autoHeight короче", `отправлено ${JSON.stringify(sent)}`);
  }
  env();
  ({ session: s } = await connected({ autoHeight: false }));
  if (observers.length) fail("9 autoHeight:false", "ResizeObserver создан");

  // 10 errors, applied, revert, draft, theme
  scene("10");
  env();
  const seen = [];
  ({ session: s } = await connected({
    autoHeight: false,
    onErrors: (p) => seen.push(["errors", p]), onApplied: (u, st) => seen.push(st === undefined ? ["applied", u] : ["applied", u, st]),
    onRevert: (u) => seen.push(["revert", u]), onDraft: (p, st) => seen.push(st === undefined ? ["draft", p] : ["draft", p, st]), onTheme: (t) => seen.push(["theme", t]),
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
  // Шаг 2: steps у draft и applied — вторым аргументом onDraft и onApplied
  const dsteps = [{ step: 1, op: "patchUnit", label: "Изменить «Датчик»" }];
  post({ proto: "setup/1", type: "draft", patch: { backlight: "high" }, steps: dsteps });
  if (!same(seen.pop(), ["draft", { backlight: "high" }, dsteps])) fail("10 draft steps", "onDraft не получил steps");
  const asteps = [{ step: 1, state: "ok" }];
  post({ proto: "setup/1", type: "applied", unit: unit2, steps: asteps });
  if (!same(seen.pop(), ["applied", unit2, asteps])) fail("10 applied steps", "onApplied не получил steps");
  post({ proto: "setup/1", type: "draft", patch: { backlight: "high" } });
  seen.pop();
  const unit3 = { ...UNIT, version: "3" };
  post({ proto: "setup/1", type: "revert", unit: unit3 });
  if (!same(seen.pop(), ["revert", unit3])) fail("10 revert", "onRevert не получил unit");
  if (!same(s.draft, {}) || !same(s.unit, unit3)) fail("10 revert", `draft ${JSON.stringify(s.draft)}`);
  const theme = { mode: "light", tokens: { "--one-fg": "#111" } };
  post({ proto: "setup/1", type: "theme", theme });
  if (!same(seen.pop(), ["theme", theme])) fail("10 theme", "onTheme не получил theme");

  // 11 invalid
  scene("11");
  env();
  ({ session: s } = await connected({ autoHeight: false }));
  sent = [];
  s.invalid(["/properties/display_text"], "Текст длиннее 16 знаков");
  s.invalid([]);
  if (!same(sent.map(([m]) => m), [
    { proto: "setup/1", type: "invalid", fields: ["/properties/display_text"], message: "Текст длиннее 16 знаков" },
    { proto: "setup/1", type: "invalid", fields: [] },
  ])) fail("11 invalid", `отправлено ${JSON.stringify(sent)}`);

  // 12 merge и diff
  scene("12");
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
  // ключ из Object.prototype — тоже свой ключ: снятый toString — null, новый constructor — значение
  const dp = B.diff({ toString: 1 }, { constructor: 2 });
  if (!same(dp, { toString: null, constructor: 2 })) fail("12 diff hasOwnProperty", `diff = ${JSON.stringify(dp)}, ждали {"toString":null,"constructor":2}`);
  // __proto__ из JSON не меняет прототип ни в merge, ни в diff
  const evil = JSON.parse('{"__proto__": {"polluted": 1}, "a": 1}');
  for (const [label, r] of [["merge", B.merge({}, evil)], ["diff", B.diff({}, evil)]]) {
    if (Object.getPrototypeOf(r) !== Object.prototype || "polluted" in r || ({}).polluted !== undefined)
      fail(`12 ${label} __proto__`, "прототип результата изменился");
    if (!same(r, { a: 1 })) fail(`12 ${label} __proto__`, `результат ${JSON.stringify(r)}`);
  }

  // 14 flush: onFlush с исключением, seq не по схеме, только просмотр, черновик от consolem
  scene("14");
  env();
  ({ session: s } = await connected({ autoHeight: false, onFlush: () => { throw new Error("сбой страницы"); } }));
  sent = [];
  try { post({ proto: "setup/1", type: "flush", seq: 3 }); } catch (e) { fail("14 onFlush бросил", `исключение ушло наружу: ${e.message}`); }
  if (!same(sent.map(([m]) => m), [{ proto: "setup/1", type: "flushed", seq: 3 }])) fail("14 onFlush бросил", `отправлено ${JSON.stringify(sent)}`);
  if (!consoleErrors.some((t) => t.includes("сбой страницы"))) fail("14 onFlush бросил", "ошибки нет в консоли");
  env();
  let flushes = 0;
  ({ session: s } = await connected({ autoHeight: false, onFlush: () => { flushes++; } }));
  sent = [];
  for (const seq of ["7", 1.5, 0, -1, null, undefined, true]) post({ proto: "setup/1", type: "flush", seq });
  if (sent.length || flushes) fail("14 seq не целое от 1", `onFlush ${flushes} раз, отправлено ${JSON.stringify(sent)}`);
  env();
  ({ session: s } = await connected({ autoHeight: false, onFlush: () => ({ beep: false }) }, INIT({ readOnly: true })));
  sent = [];
  post({ proto: "setup/1", type: "flush", seq: 1 });
  if (!same(types(), ["flushed"])) fail("14 flush при readOnly", `отправлено ${JSON.stringify(types())}`);
  env();
  ({ session: s } = await connected({ autoHeight: false, onFlush: () => ({ backlight: "high" }) }));
  post({ proto: "setup/1", type: "draft", patch: { backlight: "high" } });
  sent = [];
  post({ proto: "setup/1", type: "flush", seq: 1 });
  if (!same(types(), ["flushed"])) fail("14 flush после draft", `черновик ушёл обратно: ${JSON.stringify(types())}`);

  // 15 opts.origin: путь отрезан, "*" и непрозрачное — отказ
  scene("15");
  env({ ancestors: [] });
  ({ session: s } = await connected({ origin: "https://console.example/app/index.html" }));
  if (!sent[0] || sent[0][1] !== "https://console.example") fail("15 opts.origin с путём", `ready ${JSON.stringify(sent[0])}`);
  if (!s) fail("15 opts.origin с путём", "init не принят");
  for (const origin of ["*", "null", "не адрес"]) {
    env();
    let res = "ждёт";
    B.connect({ origin }).then(() => (res = "сбылся"), () => (res = "отказ"));
    post(INIT());
    await tick();
    if (res !== "отказ") fail(`15 opts.origin ${origin}`, `connect: ${res}`);
    if (sent.length) fail(`15 opts.origin ${origin}`, `отправлено ${JSON.stringify(sent)}`);
    if (!consoleErrors.length) fail(`15 opts.origin ${origin}`, "в консоли нет причины");
  }
  // своё происхождение непрозрачное, но consolem известен (https): init с "null" не принят
  env({ page: "null" });
  ({ session: s } = await connected({}, INIT(), { origin: "null" }));
  if (s) fail("15 непрозрачная страница, известный consolem", "init с origin null принят");
  if (!sent[0] || sent[0][1] !== "https://console.example") fail("15 непрозрачная страница, известный consolem", `ready ${JSON.stringify(sent[0])}`);

  // 16 шаг 2: session.call — id по своему счётчику, ответ по id, чужой id пропущен, срок 30 с
  scene("16");
  const BRIDGE = { ops: { getUnit: "read", runUnitAction: "act", patchUnit: "draft" }, messages: ["call", "subscribe", "unsubscribe", "navigate", "confirm"], limits: { calls: 8, subscriptions: 16, watch: 199 } };
  env();
  ({ session: s } = await connected({ autoHeight: false }, INIT({ host: { proto: "setup/1", apply: "button", bridge: BRIDGE } })));
  if (!s || typeof s.call !== "function") fail("16 call", "у session нет call");
  else {
    sent = [];
    const got = [];
    s.call("getUnit", { params: { uid: "u1" } }).then((r) => got.push(["a", r]));
    s.call("runUnitAction", { params: { uid: "u1", action: "ARM" }, body: { idempotencyKey: "k" } }).then((r) => got.push(["b", r]));
    const calls = sent.map(([m]) => m);
    if (calls.length !== 2 || calls.some((m) => m.type !== "call") || calls[0].id === calls[1].id || !same(calls[0].params, { uid: "u1" }) || calls[0].op !== "getUnit" || "body" in calls[0] || !same(calls[1].body, { idempotencyKey: "k" }))
      fail("16 call", `отправлено ${JSON.stringify(calls)}`);
    const [ia, ib] = calls.map((m) => m.id);
    post({ proto: "setup/1", type: "result", id: "чужой", ok: true, status: 200, body: {} });
    post({ proto: "setup/1", type: "result", id: ib, ok: false, status: 0, problem: { code: "CANCELLED", message: "нет" } });
    post({ proto: "setup/1", type: "result", id: ia, ok: true, status: 200, body: { uid: "u1" }, etag: '"3"' }, { source: STRANGER });
    await tick();
    if (got.length !== 1 || got[0][0] !== "b" || got[0][1].problem.code !== "CANCELLED" || got[0][1].id !== ib || "proto" in got[0][1] || "type" in got[0][1])
      fail("16 result по id", `ответы ${JSON.stringify(got)}`);
    post({ proto: "setup/1", type: "result", id: ia, ok: true, status: 200, body: { uid: "u1" }, etag: '"3"' });
    post({ proto: "setup/1", type: "result", id: ia, ok: true, status: 200, body: { uid: "второй раз" } });
    await tick();
    if (got.length !== 2 || got[1][0] !== "a" || !same(got[1][1], { id: ia, ok: true, status: 200, body: { uid: "u1" }, etag: '"3"' }))
      fail("16 result по id", `ответы ${JSON.stringify(got)}`);
    // Срок ответа 30 с: поддельный setTimeout ловит таймер библиотеки
    const realSetTimeout = global.setTimeout, timers = [];
    global.setTimeout = (fn, ms) => (ms >= 30000 ? (timers.push([fn, ms]), timers.length) : realSetTimeout(fn, ms));
    let late = null;
    sent = [];
    s.call("getUnit", { params: { uid: "u2" } }).then((r) => (late = r));
    global.setTimeout = realSetTimeout;
    const lateId = sent[0] && sent[0][0].id;
    if (timers.length !== 1 || timers[0][1] !== 30000) fail("16 срок", `таймеры ${JSON.stringify(timers.map((t) => t[1]))}`);
    else {
      timers[0][0]();
      await tick();
      if (!late || late.ok !== false || late.status !== 0 || !late.problem || late.problem.code !== "UPSTREAM_UNAVAILABLE" || late.id !== lateId)
        fail("16 срок", `ответ ${JSON.stringify(late)}`);
      post({ proto: "setup/1", type: "result", id: lateId, ok: true, status: 200, body: {} });
      await tick();
      if (late.ok !== false) fail("16 срок", "поздний ответ изменил итог");
    }
    // call не бросает: кривые аргументы — тоже сообщение по схеме
    sent = [];
    let odd = null;
    try { s.call("getUnit").then((r) => (odd = r)); } catch (e) { fail("16 call без параметров", `исключение ${e.message}`); }
    if (!sent.length || "params" in sent[0][0]) fail("16 call без параметров", `отправлено ${JSON.stringify(sent)}`);
    // Ответ снимает таймер срока: иначе Node ждал бы его 30 с
    if (sent.length) post({ proto: "setup/1", type: "result", id: sent[0][0].id, ok: false, status: 0, problem: { code: "VALIDATION_FAILED", message: "нет uid", field: "/params/uid" } });
    await tick();
    if (!odd || odd.problem.field !== "/params/uid") fail("16 call без параметров", `ответ ${JSON.stringify(odd)}`);
  }

  // 17 шаг 2: can и bridge; хост шага 1 — call без сообщения, NOT_SUPPORTED
  scene("17");
  env();
  ({ session: s } = await connected({ autoHeight: false }, INIT({ host: { proto: "setup/1", apply: "button", bridge: BRIDGE } })));
  if (!s || s.bridge !== true || s.can("getUnit") !== "read" || s.can("patchUnit") !== "draft" || s.can("testReset") !== null || s.can("toString") !== null)
    fail("17 can с мостом", `bridge ${s && s.bridge}, can ${s && typeof s.can === "function" ? [s.can("getUnit"), s.can("testReset"), s.can("toString")] : "нет"}`);
  env();
  ({ session: s } = await connected({ autoHeight: false }));
  if (!s || s.bridge !== false || typeof s.can !== "function" || s.can("getUnit") !== null) fail("17 хост шага 1", `bridge ${s && s.bridge}`);
  else {
    sent = [];
    let r1 = null;
    s.call("getUnit", { params: { uid: "u1" } }).then((r) => (r1 = r));
    await tick();
    if (sent.length) fail("17 хост шага 1", `call отправил ${JSON.stringify(sent)}`);
    if (!r1 || r1.ok !== false || r1.status !== 0 || r1.problem.code !== "NOT_SUPPORTED") fail("17 хост шага 1", `ответ ${JSON.stringify(r1)}`);
  }

  // 18 шаг 2: subscribe — result, event по sub, отписка шлёт unsubscribe; отказ — обещание отклонено с problem;
  // navigate и confirm — сообщения по схеме, ответ по id; хост шага 1 — без сообщений
  scene("18");
  env();
  ({ session: s } = await connected({ autoHeight: false }, INIT({ host: { proto: "setup/1", apply: "button", bridge: BRIDGE } })));
  if (!s || typeof s.subscribe !== "function" || typeof s.navigate !== "function" || typeof s.confirm !== "function")
    fail("18 методы", `subscribe ${s && typeof s.subscribe}, navigate ${s && typeof s.navigate}, confirm ${s && typeof s.confirm}`);
  else {
    sent = [];
    const evs = [];
    let off = null;
    s.subscribe({ entityIds: ["u1"], types: ["entity.changed"], junk: 1 }, (m) => evs.push(m)).then((f) => (off = f));
    const sub = sent[0] && sent[0][0];
    if (!sub || sub.type !== "subscribe" || !same(sub.entityIds, ["u1"]) || !same(sub.types, ["entity.changed"]) || "kinds" in sub || "junk" in sub)
      fail("18 subscribe", `отправлено ${JSON.stringify(sent)}`);
    post({ proto: "setup/1", type: "event", sub: sub && sub.id, message: { type: "entity.changed", entityId: "u1" } });
    post({ proto: "setup/1", type: "result", id: sub && sub.id, ok: true, status: 200, body: { sub: sub && sub.id } });
    await tick();
    if (typeof off !== "function") fail("18 subscribe", "обещание не дало функцию отписки");
    post({ proto: "setup/1", type: "event", sub: sub && sub.id, message: { type: "entity.changed", entityId: "u1" } });
    post({ proto: "setup/1", type: "event", sub: "чужая", message: { type: "entity.changed", entityId: "u2" } });
    await tick();
    if (evs.length !== 1 || evs[0].entityId !== "u1") fail("18 event", `события ${JSON.stringify(evs)}`);
    sent = [];
    if (off) { off(); off(); }
    if (sent.length !== 1 || sent[0][0].type !== "unsubscribe" || sent[0][0].sub !== (sub && sub.id)) fail("18 отписка", `отправлено ${JSON.stringify(sent)}`);
    post({ proto: "setup/1", type: "event", sub: sub && sub.id, message: { type: "entity.changed", entityId: "u1" } });
    await tick();
    if (evs.length !== 1) fail("18 отписка", "событие после отписки дошло");
    // Отказ (BUSY) — обещание отклонено, ошибка несёт problem
    sent = [];
    let why = null;
    s.subscribe({ kinds: ["k"] }, () => {}).then(() => (why = "сбылось"), (e) => (why = e));
    post({ proto: "setup/1", type: "result", id: sent[0] && sent[0][0].id, ok: false, status: 0, problem: { code: "BUSY", message: "предел" } });
    await tick();
    if (!why || !why.problem || why.problem.code !== "BUSY") fail("18 отказ подписки", `итог ${why && (why.message || why)}`);
    // navigate: ответ только при отказе или на тот же объект
    sent = [];
    let nav = null;
    s.navigate("u2", "acc").then((r) => (nav = r));
    const nm = sent[0] && sent[0][0];
    if (!nm || nm.type !== "navigate" || nm.uid !== "u2" || nm.tab !== "acc") fail("18 navigate", `отправлено ${JSON.stringify(sent)}`);
    post({ proto: "setup/1", type: "result", id: nm && nm.id, ok: false, status: 0, problem: { code: "CANCELLED", message: "нет" } });
    await tick();
    if (!nav || nav.problem.code !== "CANCELLED") fail("18 navigate", `ответ ${JSON.stringify(nav)}`);
    sent = [];
    s.navigate("u3");
    if (!sent[0] || "tab" in sent[0][0]) fail("18 navigate без вкладки", `отправлено ${JSON.stringify(sent)}`);
    // confirm: поля по схеме, итог — boolean
    sent = [];
    let yes = null, no = null;
    s.confirm({ title: "Т", text: "Х", lose: ["a"], count: 2, extra: 1 }).then((v) => (yes = v));
    const cm = sent[0] && sent[0][0];
    if (!cm || cm.type !== "confirm" || cm.title !== "Т" || cm.count !== 2 || !same(cm.lose, ["a"]) || "keep" in cm || "extra" in cm) fail("18 confirm", `отправлено ${JSON.stringify(sent)}`);
    post({ proto: "setup/1", type: "result", id: cm && cm.id, ok: true, status: 200, body: { confirmed: true } });
    s.confirm({ title: "Т", text: "Х" }).then((v) => (no = v));
    const cm2 = sent[1] && sent[1][0];
    post({ proto: "setup/1", type: "result", id: cm2 && cm2.id, ok: false, status: 0, problem: { code: "BUSY", message: "занято" } });
    await tick();
    if (yes !== true || no !== false) fail("18 confirm", `итоги ${yes} ${no}`);
  }
  env();
  ({ session: s } = await connected({ autoHeight: false }));
  if (s && typeof s.subscribe === "function") {
    sent = [];
    let why = null, nav = null, c = null;
    s.subscribe({ kinds: ["k"] }, () => {}).catch((e) => (why = e));
    s.navigate("u1").then((r) => (nav = r));
    s.confirm({ title: "Т", text: "Х" }).then((v) => (c = v));
    await tick();
    if (sent.length || !why || why.problem.code !== "NOT_SUPPORTED" || !nav || nav.problem.code !== "NOT_SUPPORTED" || c !== false)
      fail("18 хост шага 1", `отправлено ${JSON.stringify(sent)}, итоги ${why && why.problem && why.problem.code} ${JSON.stringify(nav)} ${c}`);
  }

  await page13();
}

// 13 тестовая страница стенда api/plugins/security_controller/setup/ (SETUP-UI.md, «Чего страница не делает»): код только
// в файлах — setup-bridge.js и page.js, без <script> без src и атрибутов on…, в page.js без .onX =, setAttribute("on…")
// и innerHTML; без fetch, XMLHttpRequest, WebSocket и /api/:
// данные страница берёт из init. ready.fields из page.js — поля схемы security_controller/KEYPAD в demo.json, кроме
// lock_after_tries: на нём проверяют строку покрытия и ошибки «не на странице»
async function page13() {
  scene("13");
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
  // page.js: обработчики — только addEventListener, разметка — без innerHTML (образец для автора страницы)
  const js = text["page.js"].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const [re, why] of [
    [/\.on[a-z]+\s*=(?!=)/i, "обработчик свойством .onX = — нужен addEventListener"],
    [/setAttribute\(\s*["'`]on/i, "атрибут on… через setAttribute — нужен addEventListener"],
    [/\b(inner|outer)HTML\b|insertAdjacentHTML/, "разметка строкой (innerHTML) — нужны textContent и элементы"],
  ]) {
    const hit = js.match(re);
    if (hit) fail("13 page.js", `${why}: ${hit[0]}`);
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
  await page13errors(text["index.html"], text["page.js"]);
}

// ── Маленький DOM для page.js: разбор index.html, простые селекторы (тег, #id, .класс, [атрибут], [атрибут="…"],
// потомок через пробел, список через запятую) и те свойства элементов, которые трогает page.js ──
function miniDom(html) {
  const VOID = new Set(["input", "meta", "link", "br", "img", "hr"]);
  const make = (tag, attrs, parent) => {
    const el = {
      tagName: tag.toUpperCase(), attrs, parent, children: [], listeners: {}, style: { setProperty() {} },
      classList: null, textContent: "", value: "", checked: false, disabled: false, type: attrs.type || "",
      get id() { return this.attrs.id || ""; },
      get hidden() { return "hidden" in this.attrs; },
      set hidden(v) { if (v) this.attrs.hidden = ""; else delete this.attrs.hidden; },
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) { return all(this).filter((e) => e !== this && matches(e, sel, this)); },
      closest(sel) { for (let e = this; e; e = e.parent) if (e.tagName && matches(e, sel)) return e; return null; },
    };
    const cls = () => new Set((el.attrs.class || "").split(/\s+/).filter(Boolean));
    el.classList = {
      contains: (c) => cls().has(c),
      toggle(c, on) { const s = cls(); const want = on === undefined ? !s.has(c) : !!on; if (want) s.add(c); else s.delete(c); el.attrs.class = [...s].join(" "); return want; },
    };
    return el;
  };
  const all = (root) => root.children.flatMap((c) => [c, ...all(c)]);
  function one(el, part) {
    const m = part.match(/^([a-z0-9]*)((?:[#.][\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i);
    if (!m) throw new Error(`селектор ${part} — маленький DOM его не знает`);
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    for (const [, kind, name, val] of m[2].matchAll(/([#.]|\[)([\w-]+)(?:="([^"]*)")?\]?/g)) {
      if (kind === "#" && el.attrs.id !== name) return false;
      if (kind === "." && !el.classList.contains(name)) return false;
      if (kind === "[" && (!(name in el.attrs) || (val !== undefined && el.attrs[name] !== val))) return false;
    }
    return true;
  }
  function matches(el, sel, scope) {
    return sel.split(",").some((group) => {
      const parts = group.trim().split(/\s+/);
      if (!one(el, parts[parts.length - 1])) return false;
      let i = parts.length - 2;
      for (let e = el.parent; e && e !== scope && i >= 0; e = e.parent) if (e.tagName && one(e, parts[i])) i--;
      return i < 0;
    });
  }
  const root = make("#root", {}, null);
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  let at = root;
  for (const [, close, tag, rest] of body.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/gi)) {
    if (close) { if (at.parent) at = at.parent; continue; }
    const attrs = {};
    for (const [, k, v] of rest.matchAll(/([\w-]+)(?:\s*=\s*"([^"]*)")?/g)) attrs[k] = v === undefined ? "" : v;
    const el = make(tag.toLowerCase(), attrs, at);
    at.children.push(el);
    if (!VOID.has(tag.toLowerCase()) && tag.toLowerCase() !== "script") at = el;
  }
  const docEl = make("html", {}, null);
  return {
    title: "", documentElement: docEl,
    getElementById: (id) => all(root).find((e) => e.attrs.id === id) || null,
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
  };
}

// 13 ошибки consolem на тестовой странице: ошибка поля на скрытой вкладке отмечает кнопку вкладки;
// в поле ошибок над формой — подпись поля, а не указатель, если страница знает подпись
async function page13errors(html, js) {
  const vm = require("vm");
  const doc = miniDom(html);
  let opts = null;
  const session = {
    init: { lang: "ru" }, readOnly: false, theme: null, draft: {},
    unit: { properties: { code_length: 6, display_text: "Код", backlight: "low", beep: true, lock_after_tries: 5 } },
    change() { return true; }, invalid() {},
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, URLSearchParams, URL, JSON, Math, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout() {}, document: doc, navigator: { language: "ru" }, parent: {},
    location: { search: "?lang=ru", protocol: "file:", href: "file:///x/index.html" },
    SetupBridge: { proto: "setup/1", connect: (o) => { opts = o; return Promise.resolve(session); }, merge: window.SetupBridge.merge, diff: window.SetupBridge.diff },
  };
  ctx.window = ctx;
  try { vm.runInNewContext(js, ctx, { filename: "page.js" }); } catch (e) { return fail("13 ошибки на странице", `исключение ${e.message}`); }
  await tick();
  if (!opts || !opts.onErrors) return fail("13 ошибки на странице", "connect без onErrors");
  const tab = (name) => doc.querySelector(`[data-tab="${name}"]`);
  const box = doc.getElementById("error");
  const panel = doc.querySelector('[data-panel="screen"]');
  if (!panel || !panel.hidden) return fail("13 ошибки на странице", "вкладка «Экран» не скрыта при старте — случай не проверить");
  try {
    opts.onErrors({ code: "VALIDATION_FAILED", message: "Ошибка", errors: [
      { code: "VALIDATION_FAILED", field: "/properties/display_text", message: "Текст длиннее 32 знаков" },
      { code: "VALIDATION_FAILED", field: "/properties/lock_after_tries", message: "Больше 10" },
      { code: "VALIDATION_FAILED", field: "/properties/zzz", message: "Нет поля" },
    ] });
  } catch (e) { return fail("13 ошибки на странице", `исключение ${e.message}`); }
  if (!tab("screen").classList.contains("bad")) fail("13 ошибки на странице", "ошибка поля на скрытой вкладке «Экран» не отметила кнопку вкладки");
  if (tab("code").classList.contains("bad")) fail("13 ошибки на странице", "кнопка вкладки «Код» отмечена без ошибки на ней");
  if (!box.textContent.includes("Блокировать после попыток")) fail("13 ошибки на странице", `в поле ошибок нет подписи поля: ${JSON.stringify(box.textContent)}`);
  if (box.textContent.includes("/properties/lock_after_tries")) fail("13 ошибки на странице", `в поле ошибок указатель, хотя подпись известна: ${JSON.stringify(box.textContent)}`);
  if (!box.textContent.includes("/properties/zzz")) fail("13 ошибки на странице", `поле без подписи — нет указателя: ${JSON.stringify(box.textContent)}`);
  opts.onErrors({ code: "VALIDATION_FAILED", message: "Ошибка", field: "/properties/code_length" });
  if (tab("screen").classList.contains("bad") || !tab("code").classList.contains("bad"))
    fail("13 ошибки на странице", "новые ошибки не сняли отметку прежней вкладки или не отметили свою");
}

// Вывод для check_api.py: {"problems": […], "scenarios": N}
const report = (problems) => console.log(JSON.stringify({ problems, scenarios: scenes.size }));
run().then(() => report(bad), (e) => report([...bad, `исключение: ${e && e.stack}`]));
