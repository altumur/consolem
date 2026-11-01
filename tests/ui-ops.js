/* Сценарии интерфейса: журнал операций и откат цепочкой. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until }) => {
  const cam = (await API.get("/devices")).items.find((d) => d.type === "camera");
  const a = await API.patch(`/devices/${cam.id}`, { short: "A" }, cam.version);
  await API.patch(`/devices/${cam.id}`, { short: "B" }, a.version);
  goApp("log");
  logGo("ops");
  ok(await until(() => document.querySelectorAll("[data-op]").length >= 2), "обе правки в журнале операций");
  ok(/правка/.test(document.getElementById("main").textContent), "одиночная правка подписана");
  // Цепочка: младшая, затем старшая
  document.querySelector("[data-op]").click();
  ok(await until(() => find(cam.id)?.n.short === "A"), "младшая откачена");
  const left = logOps.find((o) => o.revertible && o.single && !o.revertOf && o.items[0].targetId === cam.id);
  ok(left, "старшая ещё откатывается");
  opRevert(left.id);
  ok(await until(() => (find(cam.id)?.n.short ?? "") === (cam.short ?? "")), "старшая откачена: значение как в начале");
  // Висячий id в папке: устройство удалено, папка ещё его называет — дерево его пропускает
  goApp("hw");
  const f = folders[0];
  f.items = [...(f.items || []), "30009999-0000-4000-8000-000000000000"];
  let thrown = null;
  try { paint(); } catch (e) { thrown = e; }
  ok(!thrown, "id удалённого устройства в папке не ломает дерево" + (thrown ? ": " + thrown.message : ""));
  f.items.pop();
});
