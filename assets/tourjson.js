/* Показ как данные: модель пишет JSON, а не код. Здесь он превращается в шаги движка assets/tour.js.
   Шаг: {say, do:[["функция",…литералы]], at:{css, text, in, nth}, act:"click"|"type", text}.
   "do" зовёт только функции из списка карты (TOUR_FNS) и только с литералами: чужого кода на странице нет.
   "at.text" — подстрока без учёта регистра или /регулярка/; сверяется с текстом, aria-label, title, placeholder и value. */
(() => {
  const vis = (e) => e && e.isConnected && e.getClientRects().length > 0;
  const label = (e) => {
    const parts = [];
    for (const x of [e.textContent, e.getAttribute("aria-label"), e.getAttribute("title"), e.getAttribute("placeholder"), e.value]) {
      const v = typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "";
      if (v && !parts.some((p) => p.includes(v))) parts.push(v);
    }
    return parts.join(" · ");
  };
  const matcher = (t) => {
    if (t == null || t === "") return () => true;
    const m = /^\/(.*)\/([a-z]*)$/s.exec(t);
    if (m) {
      const re = new RegExp(m[1], m[2] || "i");
      return (e) => re.test(label(e));
    }
    const low = String(t).toLowerCase();
    return (e) => label(e).toLowerCase().includes(low);
  };
  function resolve(at) {
    if (!at) return null;
    if (typeof at === "string") at = { css: at };
    const ok = matcher(at.text);
    return () => {
      let scope = document;
      if (at.in) {
        scope = [...document.querySelectorAll(at.in)].find(vis);
        if (!scope) return null;
      }
      let all;
      try {
        all = [...scope.querySelectorAll(at.css || "*")];
      } catch (e) {
        throw new Error(`неверный селектор «${at.css}»`);
      }
      const hit = all.filter((e) => vis(e) && ok(e));
      // С текстом и без css — самый глубокий элемент с этим текстом, а не body
      const pick = at.css ? hit : hit.filter((e) => !hit.some((x) => x !== e && e.contains(x)));
      return pick[at.nth || 0] || null;
    };
  }
  function run(calls, fns) {
    for (const c of calls || []) {
      if (!Array.isArray(c) || typeof c[0] !== "string") throw new Error(`шаг do: ждали ["функция",…], пришло ${JSON.stringify(c)}`);
      const [fn, ...args] = c;
      if (!fns.has(fn)) throw new Error(`функции «${fn}» нет в карте`);
      if (typeof window[fn] !== "function") throw new Error(`функции «${fn}» нет на странице`);
      window[fn](...args);
    }
  }
  window.TourJson = {
    resolve,
    compile(spec, fnList) {
      const fns = new Set(fnList);
      return spec.steps.map((s) => ({
        say: s.say || "",
        at: resolve(s.at),
        act: s.act,
        text: s.text,
        before: s.do && s.do.length ? () => run(s.do, fns) : undefined,
      }));
    },
    run,
    // Что видно на экране: для карты и для ответа модели, когда шаг не нашёл цель
    snapshot(limit = 120, scope = "") {
      const sel = 'button,a[href],input,select,textarea,[role=tab],[role=menuitem],[role=option],[data-on-click],[data-pick]';
      const rows = [];
      const seen = new Set();
      // Порядок частей scope — приоритет: сначала окна, потом правая часть, потом дерево
      const hosts = scope ? scope.split(",").flatMap((q) => [...document.querySelectorAll(q.trim())]).filter(vis) : [document];
      const els = [...new Set(hosts.flatMap((h) => [...h.querySelectorAll(sel)]))];
      for (const e of els) {
        if (!vis(e) || e.closest(".tour-panel,.tour-offer,.tour-menu")) continue;
        const r = e.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const cls = [...e.classList].slice(0, 3).map((c) => "." + c).join("");
        const on = e.getAttribute("data-on-click");
        let fn = "";
        try {
          fn = on ? JSON.parse(on).map((c) => (Array.isArray(c) ? c[0] : "")).filter(Boolean).join("+") : "";
        } catch {}
        const host = e.parentElement?.closest("[id]")?.id;
        const t = label(e).slice(0, 50);
        const line = `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${cls}${e.type && e.tagName === "INPUT" ? `[type=${e.type}]` : ""}${t ? ` «${t}»` : ""}${fn ? ` → ${fn}` : ""}${host ? ` в #${host}` : ""}`;
        if (seen.has(line)) continue;
        seen.add(line);
        rows.push(line);
        if (rows.length >= limit) break;
      }
      const dlg = [...document.querySelectorAll("[role=dialog],.mask.open,#bmodal.open")].filter(vis).map((d) => "#" + (d.id || "?"));
      return (dlg.length ? `Открыты окна: ${dlg.join(", ")}\n` : "") + rows.join("\n");
    },
  };
})();
