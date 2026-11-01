/* Сценарии интерфейса: журнал операций и откат цепочкой. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until }) => {
  const cam = (await API.get("/devices")).items.find((d) => d.type === "camera");
  const a = await API.patch(`/devices/${cam.id}`, { short: "A" }, cam.version);
  await API.patch(`/devices/${cam.id}`, { short: "B" }, a.version);
  goApp("log");
  logGo("ops");
  ok(await until(() => logOps.length >= 2), "обе правки в журнале операций");
  ok(/правка/.test(document.getElementById("main").textContent), "одиночная правка подписана");
  // Стопка: кнопка только у последней, предыдущая получает её после отмены последней
  const [younger, older] = logOps;
  const btn = (attr, op) => document.querySelector(`[${attr}][data-root="${op.id}"]`);
  ok(document.querySelectorAll("[data-op]").length === 1, "кнопка «Отменить» только у последней строки");
  ok(!btn("data-op", older), "у старшей кнопки нет");
  ok(!document.querySelector("[data-redo]"), "повторять нечего");
  btn("data-op", younger).click();
  ok(await until(() => find(cam.id)?.n.short === "A"), "младшая откачена");
  ok(await until(() => btn("data-op", older)), "после отмены младшей кнопка появилась у старшей");
  ok(document.querySelectorAll("[data-op]").length === 1, "«Отменить» по-прежнему одна");
  ok(await until(() => btn("data-redo", younger)), "у отменённой младшей — «Повторить»");
  btn("data-op", older).click();
  ok(await until(() => (find(cam.id)?.n.short ?? "") === (cam.short ?? "")), "старшая откачена: значение как в начале");
  ok(await until(() => btn("data-redo", older) && !btn("data-redo", younger)), "цепочка: повтор сначала у отменённой последней");
  ok(/откат/.test(document.getElementById("main").textContent), "откат виден строкой");
  btn("data-redo", older).click();
  ok(await until(() => find(cam.id)?.n.short === "A"), "повторена старшая");
  ok(await until(() => btn("data-redo", younger)), "затем повтор младшей");
  ok(/повтор/.test(document.getElementById("main").textContent), "повтор подписан");
  btn("data-redo", younger).click();
  ok(await until(() => find(cam.id)?.n.short === "B"), "повторена младшая");
  ok(await until(() => btn("data-op", younger) && !document.querySelector("[data-redo]")), "у младшей снова «Отменить», повторять нечего");
  btn("data-op", younger).click();
  ok(await until(() => find(cam.id)?.n.short === "A"), "повтор отменён как обычная операция");
  ok(await until(() => btn("data-redo", younger)), "и снова повторяется");
  await API.patch(`/devices/${cam.id}`, { short: "C" }, hwVer.get(cam.id));
  ok(await until(() => !document.querySelector("[data-redo]")), "новая правка очищает повтор");
  // Висячий id в папке: устройство удалено, папка ещё его называет — дерево его пропускает
  goApp("hw");
  const f = folders[0];
  f.items = [...(f.items || []), "30009999-0000-4000-8000-000000000000"];
  let thrown = null;
  try { paint(); } catch (e) { thrown = e; }
  ok(!thrown, "id удалённого устройства в папке не ломает дерево" + (thrown ? ": " + thrown.message : ""));
  f.items.pop();
});
