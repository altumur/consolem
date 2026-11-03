/* Показ прототипа: виртуальный курсор сам проходит сценарий и подписывает каждый шаг, чтобы смотрящий не искал, что изменилось.
   Шаги задаёт прототип: Tour.offer("Подпись кнопки", шаги). С ?demo в адресе показ стартует сам, с ?selftest его нет.
   Шаг: {say:"текст", at:()=>элемент, act:"click"|"type", text:"что ввести", before:()=>…}.
   Шаги идут сами. Панель остаётся и после последнего шага: «Назад» и «Дальше» проходят их вручную, «Закрыть» отдаёт страницу.
   Клики и ввод настоящие: идут через обычные обработчики страницы и контракт. Данные встроенного сервера живут до перезагрузки,
   поэтому запуск и «Назад» перезагружают страницу: ?demo=N быстро проходит шаги до N и ждёт на нём. Не часть продукта: в index.html не переносится. */
(() => {
  const CSS = `
.tour-block{position:fixed;inset:0;z-index:100000;background:transparent}
.tour-cur{position:fixed;left:0;top:0;width:22px;height:22px;z-index:100003;pointer-events:none;transition:transform .75s cubic-bezier(.45,.05,.25,1);filter:drop-shadow(0 2px 3px #0009)}
.tour-cur svg{display:block;width:22px;height:22px;transition:transform .12s}
.tour-cur.down svg{transform:scale(.8)}
.tour-ring{position:fixed;left:0;top:0;z-index:100001;pointer-events:none;border:2px solid var(--one-focus-ring,#3b82f6);border-radius:8px;box-shadow:0 0 0 4px color-mix(in srgb,var(--one-focus-ring,#3b82f6) 28%,transparent);transition:opacity .2s}
.tour-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;z-index:100002;pointer-events:none;border-radius:50%;border:2px solid var(--one-focus-ring,#3b82f6);animation:tour-rip .45s ease-out forwards}
@keyframes tour-rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.5);opacity:0}}
.tour-panel{position:fixed;left:16px;bottom:16px;z-index:100004;width:min(420px,calc(100vw - 32px));box-sizing:border-box;padding:14px 16px;background:var(--p,#1a2129);color:var(--tx,#e4e9ef);border:1px solid var(--ln,#2d3743);border-radius:10px;box-shadow:0 10px 32px #0007;font-size:14px;line-height:1.45}
.tour-panel.top{bottom:auto;top:16px}
.tour-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px}
.tour-n{font-size:12px;color:var(--mu,#97a4b3);margin:0}
.tour-speed{display:flex;gap:2px}
.tour-speed button{min-width:30px;height:24px;padding:0 6px;border:0;border-radius:5px;background:transparent;color:var(--mu,#97a4b3);font:600 12px/1 inherit;cursor:pointer}
.tour-speed button:hover{color:var(--tx,#e4e9ef)}
.tour-speed button[aria-pressed="true"]{background:var(--one-focus-ring,#3b82f6);color:#fff}
.tour-say{margin:0 0 12px;min-height:40px}
.tour-hint{margin:-4px 0 12px;font-size:12px;color:var(--mu,#97a4b3)}
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
  // Скорость переживает перезагрузку на «Назад» и новый запуск
  const SPEEDS = [1, 2, 4, 8];
  const loadSpeed = () => {
    try {
      const v = Number(localStorage.getItem("tourSpeed"));
      return SPEEDS.includes(v) ? v : 1;
    } catch {
      return 1;
    }
  };
  const saveSpeed = (v) => {
    try {
      localStorage.setItem("tourSpeed", String(v));
    } catch {}
  };
  // Показ всегда на чистых данных: сценарий рассчитан на набор, каким он был при загрузке
  const reloadAt = (step) => {
    const u = new URL(location.href);
    u.searchParams.set("demo", step == null ? "" : String(step));
    // Без якоря: адрес с одним только якорем страницу не перезагрузит
    u.hash = "";
    location.href = u.href;
  };

  function run(steps, startAt) {
    const last = steps.length - 1;
    let i = 0, paused = false, stopped = false, skip = false, back = false, ended = false, target = null, frame = 0, speed = loadSpeed();
    const block = make("div", "tour-block"), cur = make("div", "tour-cur", ARROW), ring = make("div", "tour-ring"), panel = make("div", "tour-panel");
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    const n = make("p", "tour-n"), bar = make("div", "tour-bar", "<i></i>"), say = make("p", "tour-say"), hint = make("p", "tour-hint"), btns = make("div", "tour-btns");
    hint.textContent = "Показ окончен. «Назад» пройдёт шаги заново, «Закрыть» вернёт страницу: можно попробовать самому.";
    hint.hidden = true;
    const top = make("div", "tour-top"), speeds = make("div", "tour-speed");
    speeds.setAttribute("role", "group");
    speeds.setAttribute("aria-label", "Скорость показа");
    const speedBtns = SPEEDS.map((v) => {
      const b = button(`×${v}`, "", () => setSpeed(v));
      speeds.append(b);
      return b;
    });
    function setSpeed(v) {
      speed = v;
      saveSpeed(v);
      speedBtns.forEach((b, k) => b.setAttribute("aria-pressed", String(SPEEDS[k] === v)));
      cur.style.transitionDuration = `${0.75 / v}s`;
    }
    setSpeed(speed);
    top.append(n, speeds);
    panel.append(top, bar, say, hint, btns);
    const goBack = () => {
      if (i > 0) back = true;
    };
    const goNext = () => {
      skip = true;
    };
    const backBtn = button("Назад", "btn s", goBack);
    const pauseBtn = button("Пауза", "btn s", () => (ended ? reloadAt() : setPaused(!paused)));
    const nextBtn = button("Дальше", "btn s", goNext);
    btns.append(backBtn, pauseBtn, nextBtn, button("Закрыть", "btn s", stop));
    ring.style.opacity = "0";
    cur.style.transform = `translate(${innerWidth / 2}px,${innerHeight / 2}px)`;
    document.body.append(block, ring, cur, panel);
    function setPaused(v) {
      paused = v;
      pauseBtn.textContent = v ? "Продолжить" : "Пауза";
    }
    function setEnded(v) {
      ended = v;
      hint.hidden = !v;
      nextBtn.disabled = v;
      pauseBtn.textContent = v ? "Показать снова" : paused ? "Продолжить" : "Пауза";
    }
    // Клавиши на время показа — только его: стрелка иначе пойдёт по дереву, Esc закроет окно
    const key = (e) => {
      e.stopImmediatePropagation();
      // Enter и пробел на кнопке панели нажимают её
      if ((e.key === "Enter" || e.key === " ") && panel.contains(e.target)) return;
      e.preventDefault();
      if (e.type !== "keydown") return;
      if (e.key === "Tab") {
        // Фокус ходит только по панели
        const all = [...panel.querySelectorAll("button:not(:disabled)")];
        const at = all.indexOf(document.activeElement);
        all[(at + (e.shiftKey ? -1 : 1) + all.length) % all.length]?.focus();
      } else if (e.key === "Escape") stop();
      else if (e.key === " " && !ended) setPaused(!paused);
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goBack();
      else if (SPEEDS.includes(Number(e.key))) setSpeed(Number(e.key));
    };
    const KEYS = ["keydown", "keypress", "keyup"];
    KEYS.forEach((t) => window.addEventListener(t, key, true));
    // Подсветка следует за элементом: окно перерисовывается, поэтому искать его заново на каждом кадре
    const place = () => {
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
    };
    const follow = () => {
      if (stopped) return;
      place();
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
    function broken() {
      clear();
      n.textContent = "Показ прервался";
      speeds.remove();
      bar.remove();
      say.textContent = "На экране нет того, что нужно показать дальше. Обычно дело в узком окне: в нём карточка скрыта. Откройте окно пошире.";
      btns.replaceChildren(button("Показать снова", "btn s", () => reloadAt()), button("Закрыть", "btn pri s", stop));
    }
    function draw(s) {
      n.textContent = `Шаг ${i + 1} из ${steps.length}`;
      bar.firstChild.style.width = `${Math.round(((i + 1) / steps.length) * 100)}%`;
      say.textContent = s.say;
      backBtn.disabled = i === 0;
    }
    // Ждать, уважая паузу; «Дальше» и «Назад» обрывают ожидание. Нажатые, пока курсор кликал или вводил, сработают здесь
    async function hold(ms) {
      let left = ms;
      while ((left > 0 || paused) && !stopped && !skip && !back) {
        await sleep(50);
        if (!paused) left -= 50 * speed;
      }
      skip = false;
    }
    async function waitFor(at) {
      for (let t = 0; t < 100 && !stopped; t++) {
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
      await sleep(reduced() ? 0 : 780 / speed);
      cur.classList.add("down");
      const rip = make("div", "tour-ripple");
      rip.style.left = `${x}px`;
      rip.style.top = `${y}px`;
      document.body.append(rip);
      setTimeout(() => rip.remove(), 500);
      await sleep(120 / speed);
      cur.classList.remove("down");
    }
    async function type(el, text) {
      el.focus();
      for (const ch of text) {
        if (stopped) return;
        el.value += ch;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        if (!reduced()) await sleep(38 / speed);
      }
    }
    // Шаги до нужного — без курсора и ожиданий: они только восстанавливают состояние
    async function rewind() {
      n.textContent = `Шаг ${startAt + 1} из ${steps.length}`;
      say.textContent = "Перематываю…";
      cur.style.opacity = "0";
      for (i = 0; i < startAt && !stopped; i++) {
        const s = steps[i];
        if (s.before) await s.before();
        const el = s.at ? await waitFor(s.at) : null;
        if (stopped) return;
        if (s.at && !el) return broken();
        if (el && s.act === "click") el.click();
        else if (el && s.act === "type") {
          el.value = s.text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        await sleep(30);
      }
      cur.style.opacity = "";
      skip = false;
      setPaused(true);
    }
    (async () => {
      if (startAt !== null) await rewind();
      while (!stopped) {
        const s = steps[i];
        draw(s);
        if (s.before) await s.before();
        const el = s.at ? await waitFor(s.at) : null;
        if (stopped) return;
        if (s.at && !el) return broken();
        target = s.at || null;
        if (el) {
          el.scrollIntoView({ block: "nearest" });
          point(el);
        }
        place();
        if (i === last) {
          setEnded(true);
          while (!stopped && !back) await sleep(50);
        } else await hold(Math.max(2500, s.say.length * 55));
        if (stopped) return;
        if (back) return reloadAt(i - 1);
        if (el && s.act === "click") {
          const fresh = s.at() || el;
          await press(fresh);
          if (stopped) return;
          fresh.click();
          await sleep(350 / speed);
        } else if (el && s.act === "type") {
          await press(el);
          await type(s.at() || el, s.text);
          await sleep(300 / speed);
        }
        i++;
      }
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
        offerEl = button(`▶ ${label}`, "tour-offer", () => reloadAt());
        document.body.append(offerEl);
        const demo = new URLSearchParams(location.search).get("demo");
        if (demo !== null) {
          offerShow(false);
          // ?demo — сам с начала, ?demo=N — ждёт на шаге
          const at = demo === "" ? NaN : Number(demo);
          run(steps, Number.isInteger(at) ? Math.max(0, Math.min(at, steps.length - 1)) : null);
        }
      };
      if (window.appReady) window.appReady.then(mount);
      else mount();
    },
  };
})();
