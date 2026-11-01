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
  // Хранилище и том — в той же стопке: строка называет их, размер тома не возвращается
  const remote = arch.find((a) => a.kind === "network" && a.vols.length);
  await API.patch(`/archives/${remote.id}`, { retentionDays: 77 }, hwVer.get(remote.id));
  ok(await until(() => logOps[0]?.items[0]?.targetId === remote.id), "правка хранилища в журнале операций");
  ok(document.getElementById("main").textContent.includes(locName(remote)), "строка называет хранилище");
  const volV = remote.vols[0], volR = await API.get(`/volumes/${volV.id}`);
  await API.patch(`/volumes/${volV.id}`, { sizeBytes: volR.sizeBytes + 1024 ** 3 }, volR.version);
  ok(await until(() => logOps[0]?.items[0]?.targetId === volV.id && btn("data-op", logOps[0])), "правка тома — верхняя");
  const volOp = logOps[0];
  btn("data-op", volOp).click();
  ok(await until(() => /не выполнено/.test(document.getElementById("tt")?.textContent || "")), "размер тома не вернулся: «не выполнено» в тосте");
  // Откат — тоже операция: пока он идёт, объект занят, правка отказывает до запроса, потом снова можно
  goApp("log");
  logGo("ops");
  const plan = await API.post("/operations", { idempotencyKey: "ui-ops-busy", items: ["D", "E", "F", "G", "H", "I", "J", "K"].map((short) => ({ targetId: cam.id, set: { short } })), expectedVersions: { [cam.id]: hwVer.get(cam.id) } });
  ok(await until(() => logOps[0]?.id === plan.id && btn("data-op", logOps[0])), "операция из восьми шагов — верхняя");
  const posts = [];
  const patch0 = API.patch;
  API.patch = (...a) => (posts.push(a[0]), patch0(...a));
  btn("data-op", logOps[0]).click();
  ok(await until(() => busyIds().has(cam.id)), "идёт откат: камера занята");
  ok(busyRefuse(cam.id) && /групповая операция/.test(document.getElementById("tt")?.textContent || ""), "правка отказывает тостом");
  pick(cam.id, { force: true });
  goApp("hw");
  ok(/Над объектом выполняется групповая операция/.test(document.getElementById("main").textContent), "в карточке — надпись");
  ok(!posts.length, "до сервера правка не дошла");
  API.patch = patch0;
  ok(await until(() => !busyIds().size), "откат закончился");
  ok(!busyRefuse(cam.id) && !/Над объектом выполняется/.test(document.getElementById("main").textContent), "после окончания снова можно");
  goApp("log");
  logGo("ops");
  // Висячий id в папке: устройство удалено, папка ещё его называет — дерево его пропускает
  goApp("hw");
  const f = folders[0];
  f.items = [...(f.items || []), "30009999-0000-4000-8000-000000000000"];
  let thrown = null;
  try { paint(); } catch (e) { thrown = e; }
  ok(!thrown, "id удалённого устройства в папке не ломает дерево" + (thrown ? ": " + thrown.message : ""));
  f.items.pop();
});
