/* Показ прототипа: виртуальный курсор сам проходит сценарий и подписывает каждый шаг, чтобы смотрящий не искал, что изменилось.
   Шаги задаёт прототип: Tour.offer("Подпись кнопки", шаги). С ?demo в адресе показ стартует сам, с ?selftest его нет.
   Шаг: {say:"текст", at:()=>элемент, act:"click"|"type"|"look", text:"что ввести", before:()=>…}.
   Клики и ввод настоящие: идут через обычные обработчики страницы и контракт. Данные встроенного сервера живут до перезагрузки,
   поэтому запуск по кнопке и «Показать снова» перезагружают страницу. Не часть продукта: в index.html не переносится. */
(() => {
  const CSS = `
.tour-block{position:fixed;inset:0;z-index:100000;background:transparent}
.tour-cur{position:fixed;left:0;top:0;width:22px;height:22px;z-index:100003;pointer-events:none;transition:transform .75s cubic-bezier(.45,.05,.25,1);filter:drop-shadow(0 2px 3px #0009)}
.tour-cur svg{display:block;width:22px;height:22px;transition:transform .12s}
.tour-cur.down svg{transform:scale(.8)}
.tour-ring{position:fixed;left:0;top:0;z-index:100001;pointer-events:none;border:2px solid var(--one-focus-ring,#3b82f6);border-radius:8px;box-shadow:0 0 0 4px color-mix(in srgb,var(--one-focus-ring,#3b82f6) 28%,transparent);transition:opacity .2s}
.tour-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;z-index:100002;pointer-events:none;border-radius:50%;border:2px solid var(--one-focus-ring,#3b82f6);animation:tour-rip .45s ease-out forwards}
@keyframes tour-rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.5);opacity:0}}
.tour-panel{position:fixed;left:16px;bottom:16px;z-index:100004;width:min(400px,calc(100vw - 32px));box-sizing:border-box;padding:14px 16px;background:var(--p,#1a2129);color:var(--tx,#e4e9ef);border:1px solid var(--ln,#2d3743);border-radius:10px;box-shadow:0 10px 32px #0007;font-size:14px;line-height:1.45}
.tour-panel.top{bottom:auto;top:16px}
.tour-n{font-size:12px;color:var(--mu,#97a4b3);margin:0 0 4px}
.tour-say{margin:0 0 12px;min-height:40px}
.tour-bar{height:3px;margin:0 0 10px;background:var(--ln,#2d3743);border-radius:2px;overflow:hidden}
.tour-bar i{display:block;height:100%;background:var(--one-focus-ring,#3b82f6);transition:width .3s}
.tour-btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.tour-offer{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:15;display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border:0;border-radius:999px;background:var(--one-focus-ring,#3b82f6);color:#fff;font:600 13px/1 inherit;cursor:pointer;box-shadow:0 6px 18px #0006}
.tour-offer[hidden]{display:none}
.tour-offer:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media(prefers-reduced-motion:reduce){.tour-cur{transition:none}.tour-ripple{display:none}}`;
  const ARROW = '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 2l13.5 11.2-6.3.5 3.6 6.9-2.7 1.4-3.6-7L4 19z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  const reduced = () => matchMedia("(prefers-reduced-motion:reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const make = (tag, cls, html) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  };
  const button = (label, cls, fn) => {
    const b = make("button", cls);
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  };

  // Показ всегда с начала и на чистых данных: сценарий рассчитан на набор, каким он был при загрузке
  const restart = () => {
    const u = new URL(location.href);
    u.searchParams.set("demo", "");
    location.href = u.href;
  };

  function run(steps) {
    let paused = false, stopped = false, skip = false, target = null, frame = 0;
    const block = make("div", "tour-block"), cur = make("div", "tour-cur", ARROW), ring = make("div", "tour-ring"), panel = make("div", "tour-panel");
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    const n = make("p", "tour-n"), bar = make("div", "tour-bar", "<i></i>"), say = make("p", "tour-say"), btns = make("div", "tour-btns");
    panel.append(n, bar, say, btns);
    const pauseBtn = button("Пауза", "btn s", () => setPaused(!paused));
    const nextBtn = button("Дальше", "btn s", () => { skip = true; });
    const stopBtn = button("Стоп", "btn s", stop);
    btns.append(pauseBtn, nextBtn, stopBtn);
    ring.style.opacity = "0";
    cur.style.transform = `translate(${innerWidth / 2}px,${innerHeight / 2}px)`;
    document.body.append(block, ring, cur, panel);
    function setPaused(v) {
      paused = v;
      pauseBtn.textContent = v ? "Продолжить" : "Пауза";
    }
    // Клавиши на время показа — только его: стрелка иначе пойдёт по дереву, Esc закроет окно
    const key = (e) => {
      if (e.key === "Tab" || (e.key === "Enter" && panel.contains(e.target))) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.type !== "keydown") return;
      if (e.key === "Escape") stop();
      else if (e.key === " ") setPaused(!paused);
      else if (e.key === "ArrowRight") skip = true;
    };
    const KEYS = ["keydown", "keypress", "keyup"];
    KEYS.forEach((t) => window.addEventListener(t, key, true));
    // Подсветка следует за элементом: окно перерисовывается, поэтому искать его заново на каждом кадре
    const follow = () => {
      if (stopped) return;
      const el = target && target();
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        ring.style.opacity = "1";
        ring.style.transform = `translate(${r.left - 4}px,${r.top - 4}px)`;
        ring.style.width = `${r.width + 8}px`;
        ring.style.height = `${r.height + 8}px`;
        // Панель там, где меньше закрывает цель. Решение зависит только от цели, поэтому большая цель не дёргает панель туда-сюда
        const p = panel.getBoundingClientRect();
        const covered = (top) => Math.max(0, Math.min(r.right, p.right) - Math.max(r.left, p.left)) * Math.max(0, Math.min(r.bottom, top + p.height) - Math.max(r.top, top));
        panel.classList.toggle("top", covered(16) < covered(innerHeight - 16 - p.height));
      } else ring.style.opacity = "0";
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    function clear() {
      stopped = true;
      cancelAnimationFrame(frame);
      KEYS.forEach((t) => window.removeEventListener(t, key, true));
      block.remove(); cur.remove(); ring.remove();
    }
    function stop() {
      clear();
      panel.remove();
      offerShow(true);
    }
    function finish(title, text) {
      clear();
      n.textContent = title;
      bar.remove();
      say.textContent = text;
      btns.replaceChildren(
        button("Показать снова", "btn s", restart),
        button("Закрыть", "btn pri s", () => { panel.remove(); offerShow(true); })
      );
    }
    // Ждать, уважая паузу; «Дальше» обрывает ожидание
    async function hold(ms) {
      let left = ms;
      skip = false;
      while ((left > 0 || paused) && !stopped && !skip) {
        await sleep(50);
        if (!paused) left -= 50;
      }
      skip = false;
    }
    async function waitFor(at) {
      for (let i = 0; i < 100 && !stopped; i++) {
        const el = at();
        if (el && el.isConnected && el.getClientRects().length) return el;
        await sleep(50);
      }
      return null;
    }
    const point = (el) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(r.left + Math.min(r.width / 2, 60), innerWidth - 24), y = Math.min(r.top + Math.min(r.height / 2, 18), innerHeight - 24);
      cur.style.transform = `translate(${x}px,${y}px)`;
      return [x, y];
    };
    async function press(el) {
      const [x, y] = point(el);
      await sleep(reduced() ? 0 : 780);
      cur.classList.add("down");
      const rip = make("div", "tour-ripple");
      rip.style.left = `${x}px`;
      rip.style.top = `${y}px`;
      document.body.append(rip);
      setTimeout(() => rip.remove(), 500);
      await sleep(120);
      cur.classList.remove("down");
    }
    async function type(el, text) {
      el.focus();
      for (const ch of text) {
        if (stopped) return;
        while (paused && !stopped) await sleep(50);
        el.value += ch;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        if (!reduced()) await sleep(38);
      }
    }
    (async () => {
      for (let i = 0; i < steps.length && !stopped; i++) {
        const s = steps[i];
        n.textContent = `Шаг ${i + 1} из ${steps.length}`;
        bar.firstChild.style.width = `${Math.round(((i + 1) / steps.length) * 100)}%`;
        say.textContent = s.say;
        if (s.before) await s.before();
        const el = s.at ? await waitFor(s.at) : null;
        if (stopped) return;
        if (s.at && !el) {
          finish("Показ прервался", "На экране нет того, что нужно показать дальше. Обычно дело в узком окне: в нём карточка скрыта. Откройте окно пошире.");
          return;
        }
        target = s.at || null;
        if (el) {
          el.scrollIntoView({ block: "nearest" });
          point(el);
        }
        await hold(Math.max(2500, s.say.length * 55));
        if (stopped) return;
        if (el && s.act === "click") {
          const fresh = s.at() || el;
          await press(fresh);
          if (stopped) return;
          fresh.click();
          await sleep(350);
        } else if (el && s.act === "type") {
          await press(el);
          await type(s.at() || el, s.text);
          await sleep(300);
        }
      }
      if (!stopped) finish("Всё", "Показ окончен. Теперь можно попробовать самому: всё на экране настоящее.");
    })();
  }

  let offerEl = null;
  const offerShow = (v) => { if (offerEl) offerEl.hidden = !v; };
  window.Tour = {
    offer(label, steps) {
      if (/[?&]selftest(-run)?\b/.test(location.search)) return;
      const mount = () => {
        const st = make("style", "");
        st.textContent = CSS;
        document.head.append(st);
        offerEl = button(`▶ ${label}`, "tour-offer", restart);
        document.body.append(offerEl);
        if (/[?&]demo\b/.test(location.search)) {
          offerShow(false);
          run(steps);
        }
      };
      if (window.appReady) window.appReady.then(mount);
      else mount();
    },
  };
})();
