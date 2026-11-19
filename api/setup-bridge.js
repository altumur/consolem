/* Библиотека для автора своей страницы подсистемы (UnitKind.setupUi.mode: iframe). Страница подключает файл
   обычным <script src="setup-bridge.js">, без сборки и зависимостей, и получает window.SetupBridge. Протокол setup/1
   описывает api/SETUP-UI.md, сообщения — api/setup-ui.schema.json. Библиотеку проверяет tools/check_setup_bridge.js
   (python3 tools/check_api.py).

   Страница пишет настройки объекта только через session.change(черновик): правку записывает consolem своим
   «Применить». Сама страница настройки не сохраняет и кнопок «Сохранить» не рисует.

     SetupBridge.connect({fields, origin, onDraft, onApplied, onErrors, onRevert, onTheme, onFlush, autoHeight}) → Promise<Session>
       отправляет ready сразу, обещание сбывается на init от consolem.
     Session: init, host, unit, readOnly, theme, draft; change(patch) → boolean; invalid(fields, message?); height(px).
     Шаг 2 (мост к механизму): bridge — есть ли init.host.bridge; can(op) → "read" | "act" | "draft" | null;
       call(op, {params, body}) → Promise<{id, ok, status, body?, problem?, etag?}> — не бросает, срок ответа 30 с.
       subscribe({entityIds?, kinds?, types?}, onEvent(message)) → Promise<() => void> — функция отписки; отказ consolem
         (BUSY, VALIDATION_FAILED) или хост без subscribe — обещание отклонено, у ошибки поле problem.
       navigate(uid, tab?) → Promise<{id, ok, status, problem?}> — удачный переход ответа не получает: рамку закрыли.
       confirm({title, text, lose?, keep?, count?, okLabel?}) → Promise<boolean> — true, если человек подтвердил.
       У navigate и confirm срока ответа нет: отвечает человек.
     SetupBridge.merge(base, patch) — JSON Merge Patch (RFC 7396); SetupBridge.diff(base, next) → patch. */
(() => {
  const PROTO = "setup/1";
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  // Ключ __proto__ из JSON менял бы прототип результата: merge и diff его пропускают
  const keys = (o) => Object.keys(o).filter((k) => k !== "__proto__");
  // Шаг 2: срок ответа consolem на call
  const CALL_MS = 30000;

  // RFC 7396: null снимает ключ, объект сливается рекурсивно, всё остальное (и массив) заменяет целиком. base не меняется
  function merge(base, patch) {
    if (!isObj(patch)) return copy(patch);
    const out = isObj(base) ? copy(base) : {};
    keys(patch).forEach((k) => {
      if (patch[k] === null) delete out[k];
      else out[k] = merge(out[k], patch[k]);
    });
    return out;
  }

  // Правка от base к next: снятый ключ — null, вложенные объекты — рекурсивно, массивы и прочее — целиком.
  // merge(base, diff(base, next)) = next, если в next нет значений null: null в правке снимает ключ
  function diff(base, next) {
    const out = {};
    const a = isObj(base) ? base : {};
    const b = isObj(next) ? next : {};
    keys(a).forEach((k) => {
      if (!has(b, k)) out[k] = null;
    });
    keys(b).forEach((k) => {
      if (has(a, k) && isObj(a[k]) && isObj(b[k])) {
        const d = diff(a[k], b[k]);
        if (Object.keys(d).length) out[k] = d;
      } else if (!has(a, k) || !same(a[k], b[k])) out[k] = copy(b[k]);
    });
    return out;
  }

  // Происхождение consolem: opts.origin (через new URL(…).origin; "*" и непрозрачное — отказ), иначе location.ancestorOrigins[0], иначе происхождение document.referrer.
  // Известное — отправка и приём только на него. Непрозрачное или неизвестное ("null", "file://", пусто) — правило стенда
  // из SETUP-UI.md, «Адрес и рамка» (отправка с "*", приём с "null" и "file://"), но только у страницы с диска
  // (location.protocol "file:") или с непрозрачным своим происхождением (window.origin "null", рамка без allow-same-origin).
  // Настоящая страница без происхождения consolem (Firefox без ancestorOrigins и no-referrer) — отказ: null
  function hostOrigin(explicit) {
    const loc = window.location || {};
    if (explicit) {
      let origin = "";
      try { origin = new URL(String(explicit)).origin; } catch (e) { origin = ""; }
      return origin && origin !== "null" ? { target: origin, accept: [origin] } : null;
    }
    let origin = "";
    if (loc.ancestorOrigins && loc.ancestorOrigins.length) origin = String(loc.ancestorOrigins[0]);
    if (!origin) {
      const ref = (window.document && window.document.referrer) || "";
      if (/^file:/i.test(ref)) origin = "file://";
      else {
        try { origin = ref ? new URL(ref).origin : ""; } catch (e) { origin = ""; }
      }
    }
    if (origin && origin !== "null" && !/^file:/i.test(origin)) return { target: origin, accept: [origin] };
    const opaquePage = loc.protocol === "file:" || window.origin === "null";
    return opaquePage ? { target: "*", accept: ["null", "file://"] } : null;
  }

  function connect(opts) {
    const o = opts || {};
    const host = hostOrigin(o.origin);
    if (!host) {
      const why = o.origin
        ? `SetupBridge: connect({origin: ${JSON.stringify(String(o.origin))}}) — не происхождение http или https. Передать происхождение consolem, например "https://console.example"`
        : "SetupBridge: происхождение consolem неизвестно (нет location.ancestorOrigins и document.referrer). Передать его в connect({origin})";
      console.error(why);
      return Promise.reject(new Error(why));
    }
    const send = (msg) => window.parent.postMessage({ proto: PROTO, ...msg }, host.target);
    let session = null;
    let sentDraft = null; // последний черновик, который ушёл consolem или пришёл от него
    let lastPx = null;
    // Шаг 2: вызовы без ответа по id; номер id — свой счётчик библиотеки
    const pending = new Map();
    let callSeq = 0;
    // Шаг 2: подписки — sub → onEvent
    const subs = new Map();

    return new Promise((resolve) => {
      function sendChange(patch) {
        const p = copy(isObj(patch) ? patch : {});
        send({ type: "change", patch: p });
        session.draft = p;
        sentDraft = p;
      }
      function sendHeight(px) {
        const v = Math.max(0, Math.round(Number(px) || 0));
        if (v === lastPx) return;
        lastPx = v;
        send({ type: "height", px: v });
      }
      // Высота содержимого: низ body с его нижним полем. documentElement.scrollHeight не меньше высоты рамки,
      // поэтому по нему рамка только растёт. Без body — scrollHeight
      function contentHeight() {
        const doc = window.document;
        const body = doc && doc.body;
        if (!body || typeof body.getBoundingClientRect !== "function") return doc.documentElement.scrollHeight;
        const mb = parseFloat((window.getComputedStyle ? window.getComputedStyle(body).marginBottom : "") || "0") || 0;
        return Math.ceil(body.getBoundingClientRect().bottom + (window.scrollY || 0) + mb);
      }
      function startAutoHeight() {
        const R = window.ResizeObserver;
        const doc = window.document;
        const root = doc && (doc.body || doc.documentElement);
        if (!R || !root) return;
        new R(() => sendHeight(contentHeight())).observe(root);
      }
      // Отказ без ответа consolem: тот же вид, что result
      const refuse = (id, code, message) => ({ id, ok: false, status: 0, problem: { code, message } });
      function call(op, args) {
        const a = isObj(args) ? args : {};
        const id = "c" + ++callSeq;
        if (!session.bridge) return Promise.resolve(refuse(id, "NOT_SUPPORTED", "consolem — хост шага 1: моста нет"));
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            if (pending.delete(id)) resolve(refuse(id, "UPSTREAM_UNAVAILABLE", "consolem не ответил за 30 секунд"));
          }, CALL_MS);
          pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
          const msg = { type: "call", id, op: String(op) };
          if (isObj(a.params)) msg.params = copy(a.params);
          if (a.body !== undefined) msg.body = copy(a.body);
          send(msg);
        });
      }
      // Сообщение шага 2 без срока ответа: navigate, confirm, subscribe. Хост не принимает type — отказ без сообщения
      function ask(type, fields) {
        const id = type[0] + ++callSeq;
        const msgs = session.bridge && Array.isArray(session.host.bridge.messages) ? session.host.bridge.messages : [];
        if (msgs.indexOf(type) < 0) return Promise.resolve(refuse(id, "NOT_SUPPORTED", `consolem не принимает ${type}`));
        return new Promise((resolve) => {
          pending.set(id, resolve);
          send({ type, id, ...fields });
        });
      }
      const strs = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
      function subscribe(filter, onEvent) {
        const f = isObj(filter) ? filter : {};
        const fields = {};
        ["entityIds", "kinds", "types"].forEach((k) => { if (strs(f[k])) fields[k] = f[k].slice(); });
        return ask("subscribe", fields).then((r) => {
          if (!r.ok) {
            const e = new Error(`SetupBridge: subscribe — ${r.problem && r.problem.code}`);
            e.problem = r.problem;
            throw e;
          }
          const sub = r.body && typeof r.body.sub === "string" ? r.body.sub : r.id;
          subs.set(sub, typeof onEvent === "function" ? onEvent : () => {});
          let on = true;
          return () => {
            if (!on) return;
            on = false;
            subs.delete(sub);
            send({ type: "unsubscribe", sub });
          };
        });
      }
      function navigate(uid, tab) {
        const fields = { uid: String(uid) };
        if (typeof tab === "string" && tab) fields.tab = tab;
        return ask("navigate", fields);
      }
      function confirm(opts) {
        const c = isObj(opts) ? opts : {};
        const fields = { title: String(c.title || ""), text: String(c.text || "") };
        if (strs(c.lose)) fields.lose = c.lose.slice();
        if (strs(c.keep)) fields.keep = c.keep.slice();
        if (Number.isInteger(c.count) && c.count >= 1) fields.count = c.count;
        if (typeof c.okLabel === "string" && c.okLabel) fields.okLabel = c.okLabel;
        return ask("confirm", fields).then((r) => r.ok === true && !!r.body && r.body.confirmed === true);
      }
      function onInit(m) {
        const bridge = isObj(m.host) && isObj(m.host.bridge) && isObj(m.host.bridge.ops) ? m.host.bridge : null;
        session = {
          init: m,
          host: m.host,
          unit: m.unit,
          readOnly: m.readOnly === true,
          theme: m.theme,
          draft: isObj(m.draft) ? m.draft : {},
          change(patch) {
            if (session.readOnly) return false;
            sendChange(patch);
            return true;
          },
          invalid(fields, message) {
            const msg = { type: "invalid", fields: Array.isArray(fields) ? fields.slice() : [] };
            if (typeof message === "string" && message) msg.message = message;
            send(msg);
          },
          height: sendHeight,
          bridge: !!bridge,
          can(op) {
            const v = bridge && has(bridge.ops, op) ? bridge.ops[op] : null;
            return v === "read" || v === "act" || v === "draft" ? v : null;
          },
          call,
          subscribe,
          navigate,
          confirm,
        };
        sentDraft = session.draft;
        if (o.autoHeight !== false) startAutoHeight();
        resolve(session);
      }
      // Сообщения consolem после init. Незнакомый type пропускается
      const HANDLERS = {
        draft(m) {
          session.draft = isObj(m.patch) ? m.patch : {};
          sentDraft = session.draft;
          // Шаг 2: steps — шаги моста в черновике consolem, вторым аргументом
          if (o.onDraft) Array.isArray(m.steps) ? o.onDraft(session.draft, m.steps) : o.onDraft(session.draft);
        },
        applied(m) {
          session.unit = m.unit;
          session.draft = sentDraft = {};
          // Шаг 2: steps — итог шагов моста, вторым аргументом
          if (o.onApplied) Array.isArray(m.steps) ? o.onApplied(m.unit, m.steps) : o.onApplied(m.unit);
        },
        revert(m) {
          session.unit = m.unit;
          session.draft = sentDraft = {};
          if (o.onRevert) o.onRevert(m.unit);
        },
        errors(m) {
          if (o.onErrors) o.onErrors(m.problem);
        },
        // Шаг 2: ответ на call — по id; чужой или поздний id пропускается
        result(m) {
          const done = typeof m.id === "string" && pending.get(m.id);
          if (!done) return;
          pending.delete(m.id);
          const r = {};
          keys(m).forEach((k) => { if (k !== "proto" && k !== "type") r[k] = m[k]; });
          done(r);
        },
        // Шаг 2: событие потока по подписке; чужой или снятый sub пропускается
        event(m) {
          const fn = typeof m.sub === "string" && subs.get(m.sub);
          if (fn && isObj(m.message)) fn(m.message);
        },
        theme(m) {
          session.theme = m.theme;
          if (o.onTheme) o.onTheme(m.theme);
        },
        // onFlush отдаёт неотправленный ввод синхронно: зовёт session.change или возвращает черновик. Затем flushed,
        // даже если onFlush бросил исключение: иначе consolem ждёт ответа 2 секунды. flush с seq не по схеме
        // (не целое число от 1) библиотека пропускает
        flush(m) {
          if (!Number.isInteger(m.seq) || m.seq < 1) return;
          try {
            const back = o.onFlush ? o.onFlush() : undefined;
            if (isObj(back) && !session.readOnly && !same(back, sentDraft)) sendChange(back);
          } catch (e) {
            console.error("SetupBridge: onFlush бросил исключение, библиотека всё равно отправляет flushed", e);
          } finally {
            send({ type: "flushed", seq: m.seq });
          }
        },
      };

      window.addEventListener("message", (e) => {
        if (!e || e.source !== window.parent || host.accept.indexOf(e.origin) < 0) return;
        const m = e.data;
        if (!isObj(m) || m.proto !== PROTO || typeof m.type !== "string") return;
        if (!session) {
          if (m.type === "init") onInit(m);
          return;
        }
        if (Object.prototype.hasOwnProperty.call(HANDLERS, m.type)) HANDLERS[m.type](m);
      });

      const ready = { type: "ready" };
      if (Array.isArray(o.fields)) ready.fields = o.fields.slice();
      send(ready);
    });
  }

  window.SetupBridge = { proto: PROTO, connect, merge, diff };
})();
