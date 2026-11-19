/* Библиотека для автора своей страницы подсистемы (UnitKind.setupUi.mode: iframe). Страница подключает файл
   обычным <script src="setup-bridge.js">, без сборки и зависимостей, и получает window.SetupBridge. Протокол setup/1
   описывает api/SETUP-UI.md, сообщения — api/setup-ui.schema.json. Библиотеку проверяет tools/check_setup_bridge.js
   (python3 tools/check_api.py).

   Страница пишет настройки объекта только через session.change(черновик): правку записывает consolem своим
   «Применить». Сама страница настройки не сохраняет и кнопок «Сохранить» не рисует.

     SetupBridge.connect({fields, origin, onDraft, onApplied, onErrors, onRevert, onTheme, onFlush, autoHeight}) → Promise<Session>
       отправляет ready сразу, обещание сбывается на init от consolem.
     Session: init, host, unit, readOnly, theme, draft; change(patch) → boolean; invalid(fields, message?); height(px).
     SetupBridge.merge(base, patch) — JSON Merge Patch (RFC 7396); SetupBridge.diff(base, next) → patch. */
(() => {
  const PROTO = "setup/1";
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  // Ключ __proto__ из JSON менял бы прототип результата: merge и diff его пропускают
  const keys = (o) => Object.keys(o).filter((k) => k !== "__proto__");

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
    if (!origin && loc.ancestorOrigins && loc.ancestorOrigins.length) origin = String(loc.ancestorOrigins[0]);
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
      function onInit(m) {
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
          if (o.onDraft) o.onDraft(session.draft);
        },
        applied(m) {
          session.unit = m.unit;
          session.draft = sentDraft = {};
          if (o.onApplied) o.onApplied(m.unit);
        },
        revert(m) {
          session.unit = m.unit;
          session.draft = sentDraft = {};
          if (o.onRevert) o.onRevert(m.unit);
        },
        errors(m) {
          if (o.onErrors) o.onErrors(m.problem);
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
