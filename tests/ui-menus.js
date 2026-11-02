/* Сценарии интерфейса: меню «Ещё» открывается рядом со своей кнопкой, за край экрана не выходит.
   Обработчики идут через один слушатель на документе: currentTarget должен быть кнопкой. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until, sleep }) => {
  const menu = () => document.getElementById("tctx");
  const button = (scope) => [...document.querySelectorAll(`${scope} button`)].find((b) => b.textContent.trim().startsWith("Ещё") && b.offsetParent !== null);
  // Открыть по настоящему клику, через диспетчер
  async function check(name, btn) {
    ok(!!btn, name + ": кнопка «Ещё» есть");
    if (!btn) return;
    closeTreeCtx();
    await sleep(1);
    const b = btn.getBoundingClientRect();
    btn.click();
    await sleep(1);
    const m = menu(), r = m.getBoundingClientRect();
    ok(m.classList.contains("open") && m.textContent.trim().length > 0, name + ": меню открыто");
    // Рядом: касается кнопки по обеим осям; длинное меню может и перекрыть её, если места нет ни сверху, ни снизу
    const near = r.top <= b.bottom + 12 && r.bottom >= b.top - 12 && r.left <= b.right + 12 && r.right >= b.left - 12;
    ok(near, `${name}: меню рядом с кнопкой: ${Math.round(r.left)},${Math.round(r.top)} у кнопки ${Math.round(b.left)},${Math.round(b.bottom)}`);
    ok(r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, name + ": не за краем экрана");
    closeTreeCtx();
  }
  const open = (id) => { goApp("hw"); pick(id, { force: true }); };
  const cam = (await uiDevices()).find((d) => d.type === "camera");
  open(domains[0].id);
  await check("домен", button("#main"));
  open(servers.find((s) => !isUnallocated(s.id)).id);
  await check("сервер", button("#main"));
  open(cam.id);
  await check("камера", button("#main"));
  // Правило
  goApp("rules");
  const rule = (await API.get("/rules")).items[0];
  ruleOpen(rule.id);
  await sleep(1);
  await check("правило", button("#main"));
  // Выборка: две камеры
  open(cam.id);
  const other = (await uiDevices()).find((d) => d.type === "camera" && d.id !== cam.id);
  treeSel.clear();
  treeSel.add(cam.id); treeSel.add(other.id);
  selMode = true;
  renderTree();
  gear();
  await sleep(1);
  await check("выборка", button("body"));
  treeSel.clear();
  selMode = false;
});
