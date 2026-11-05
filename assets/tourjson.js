/* Показ как данные: модель пишет JSON, а не код. Здесь он превращается в шаги движка assets/tour.js.
   Шаг: {say, do:[["функция",…литералы]], at:{css, text, in, nth}, act:"click"|"type", text}.
   "do" зовёт только функции из списка карты (TOUR_FNS) и только с литералами: чужого кода на странице нет.
   "at.text" — подстрока без учёта регистра или /регулярка/; сверяется с текстом, aria-label, title, placeholder и value. */
(() => {
  const vis = (e) => e && e.isConnected && e.getClientRects().length > 0;
  const label = (e) => {
    const parts = [];
    // У флажка своего текста нет: его подпись — label или строка, в которой он стоит
    const box = e.tagName === "INPUT" && /^(checkbox|radio)$/.test(e.type);
    // У списка — выбранный пункт, затем остальные через «/»
    if (e.tagName === "SELECT") {
      const all = [...e.options].map((o) => o.textContent.trim());
      return `выбрано «${e.selectedOptions[0]?.textContent.trim() || ""}» · пункты: ${all.join(" / ")}`;
    }
    const own = box ? (e.labels && e.labels[0] ? e.labels[0].textContent : e.closest("tr,li,label,.row,.it,div")?.textContent) : e.textContent;
    for (const x of [own, e.getAttribute("aria-label"), e.getAttribute("title"), e.getAttribute("placeholder"), box ? "" : e.value]) {
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
  // {"$now":"-10m"} — момент «сейчас минус 10 минут» строкой ISO; s, m, h, d. Для «последних N минут» в выгрузке и журнале
  const lit = (v) => {
    if (Array.isArray(v)) return v.map(lit);
    if (v && typeof v === "object") {
      // $now — как время пишут в полях консоли: «05.11.2026 10:20:00» (местное); $iso — строкой ISO для API
      const key = Object.keys(v).length === 1 && (typeof v.$now === "string" ? "$now" : typeof v.$iso === "string" ? "$iso" : null);
      if (key) {
        const m = /^([+-]\d+)([smhd])$/.exec(v[key].trim()) || (v[key].trim() === "" ? [0, "0", "s"] : null);
        if (!m) throw new Error(`${key}: ждали вид «-10m», пришло «${v[key]}»`);
        const d = new Date(Date.now() + Number(m[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2]]);
        if (key === "$iso") return d.toISOString();
        const z = (n) => String(n).padStart(2, "0");
        return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
      }
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, lit(x)]));
    }
    return v;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function run(calls, fns) {
    for (const c of calls || []) {
      if (!Array.isArray(c) || typeof c[0] !== "string") throw new Error(`шаг do: ждали ["функция",…], пришло ${JSON.stringify(c)}`);
      const [fn, ...args] = c;
      if (!fns.has(fn)) throw new Error(`функции «${fn}» нет в карте`);
      if (typeof window[fn] !== "function") throw new Error(`функции «${fn}» нет на странице`);
      window[fn](...lit(args));
    }
  }
  window.TourJson = {
    resolve,
    compile(spec, fnList) {
      const fns = new Set(fnList);
      // Движок шлёт полю только input; поля, что сохраняют значение по change или потере фокуса, его не получат.
      // Поэтому следующий шаг первым делом подтверждает поле предыдущего ввода: change и blur
      const commitPrev = (k) => {
        const prev = spec.steps[k - 1];
        if (!prev || prev.act !== "type") return;
        const el = resolve(prev.at)();
        if (el && el.isConnected) {
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.blur();
        }
      };
      return spec.steps.map((s, k) => ({
        say: s.say || "",
        at: resolve(s.at),
        // "select" движку не нужен: пункт выбирается до шага, а шаг обводит список с выбранным значением
        act: s.act === "select" ? undefined : s.act,
        text: s.text,
        // Ввод заменяет значение поля: движок дописывает к тому, что там уже есть, поэтому до шага поле очищается
        before: (s.do && s.do.length) || s.act === "type" || s.act === "select" || spec.steps[k - 1]?.act === "type" ? async () => {
          commitPrev(k);
          if (s.do && s.do.length) run(s.do, fns);
          if (s.act !== "type" && s.act !== "select") return;
          const at = resolve(s.at);
          for (let k = 0; k < 100; k++) {
            const el = at && at();
            if (el && el.isConnected && el.getClientRects().length && s.act === "select") {
              const want = matcher(s.text);
              const o = [...(el.options || [])].find((x) => want({ textContent: x.textContent, value: x.value, getAttribute: () => null, tagName: "OPTION" }));
              if (!o) throw new Error(`в списке нет пункта «${s.text}»`);
              el.value = o.value;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              return;
            }
            if (el && el.isConnected && el.getClientRects().length) {
              el.value = "";
              el.dispatchEvent(new Event("input", { bubbles: true }));
              return;
            }
            await wait(50);
          }
        } : undefined,
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
        const t = label(e).slice(0, e.tagName === "SELECT" ? 220 : 60);
        const line = `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${cls}${e.tagName === "INPUT" && e.getAttribute("type") ? `[type=${e.getAttribute("type")}]` : ""}${t ? ` «${t}»` : ""}${fn ? ` → ${fn}` : ""}${host ? ` в #${host}` : ""}`;
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
