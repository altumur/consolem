/* Сценарии интерфейса: виды устройств, которые находит сервер, карточки только для чтения. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until, confirmWith }) => {
  const devices = (await API.get("/devices")).items;
  const of = (t, more) => devices.find((d) => d.type === t && (!more || more(d)));
  const main = () => document.getElementById("main");
  const open = (id, t = "gen") => { pick(id, { force: true }); goTab(t); };

  // Мастер: находки сервера не заводятся, единицы СКУД — только в СКУД
  const types = (cat) => (WIZ[cat]?.types || []).map((t) => t[0]);
  ok(!["sensor", "relay", "mic"].some((t) => types("io").includes(t)), "датчик, реле и микрофон не заводятся: их находит сервер");
  ok(!types("svc").includes("spk"), "динамика сервера нет");
  ok(types("acfa").includes("relay"), "реле в СКУД заводится");

  // Датчик: имя, включение, norm; номер и лишние настройки — нет
  const s = of("sensor");
  open(s.id);
  ok(!document.querySelector('[data-df="Номер"]') && [...main().querySelectorAll("input[disabled]")].some((i) => i.value === String(s.channel)), "номер датчика только для чтения");
  ok(main().textContent.includes("Нормальное состояние") && !/Задержка срабатывания|Импульс/.test(main().textContent), "параметры — из справочника: только norm");
  ok(!!main().querySelector('.sw[role="switch"]'), "включение правится");

  // Канал и хранилище — только чтение, без переключателя
  open(of("channel").id);
  ok(!main().querySelector('.sw[role="switch"]') && !main().querySelector("[data-df]"), "у канала ничего не правится");
  open(of("storage").id);
  ok(!main().querySelector('.sw[role="switch"]') && !main().querySelector("[data-df]"), "у встроенного хранилища ничего не правится");
  const owner = devices.find((d) => d.type === "camera" && devices.some((x) => x.parentId === d.id && x.type === "storage"));
  open(owner.id, "rec");
  ok(!/Форматировать|Выгрузить записи/.test(main().textContent), "кнопок без операций нет");
  ok(!/IP-устройство с хранилищем/.test(deviceManualHtmlSafe()), "пункта «IP-устройство с хранилищем» нет");

  // Удаление: находка и выведенный регистратор — нет
  ok(!canTreeCtxDelete(find(s.id).n), "датчик не удаляется");
  const derived = of("ipsrv", (d) => d.derived);
  ok(!canTreeCtxDelete(find(derived.id).n), "выведенный регистратор не удаляется");
  open(derived.id);
  ok(/своей записи у него нет/.test(main().textContent) && !main().querySelector("[data-df]"), "выведенный регистратор: подпись, поля только для чтения");
  ok(deviceFoldersCardHtml(find(derived.id).n) === "", "папку выведенному не предлагаем");

  // Вход сквозной по устройству: номера с пропуском, правило берёт его из записи
  const gap = devices.filter((d) => d.type === "sensor" && d.channel === 7);
  ok(gap.length > 0 && !!find(gap[0].id), "вход с номером 7 в дереве");
  const k = TRIGGER_KINDS.find((x) => x.kind === "io.input");
  ok(k.match.length === 1 && k.match[0].id === "value" && k.match[0].opts.join() === "active,normal", "уточнение входа — из справочника, номера нет");
  ok(!ACTION_KINDS.find((x) => x.action === "output").fields.some((x) => x.id === "port"), "у реле нет поля «Выход №»");

  // Запись регистратора снимается, камеры остаются
  const nvr = of("ipsrv", (d) => d.subtype === "nvr" && !d.derived);
  const cam = devices.find((d) => d.parentId === nvr.id && d.type === "camera");
  ok(canTreeCtxDelete(find(nvr.id).n), "регистратор с записью удаляется");
  deleteTreeNode(nvr.id);
  ok(await until(() => /останутся без родителя/.test(document.getElementById("confirmMsg")?.textContent || document.body.textContent)), "в подтверждении сказано, что камеры останутся");
  closeConfirmSafe();
  await API.del(`/devices/${nvr.id}`, hwVer.get(nvr.id));
  hwRemoveDevice(nvr.id);
  ok(!!find(cam.id) && !find(cam.id).p, "камера осталась в дереве без родителя");

  // Запись меняет родителя: у камеры появился регистратор
  const top = devices.find((d) => d.type === "camera" && !d.parentId);
  hwApplyDevice({ ...(await API.get(`/devices/${top.id}`)), parentId: derived.id });
  ok(find(top.id)?.p?.id === derived.id, "камера переехала под ipsrv");

  function deviceManualHtmlSafe() {
    wizd = initDeviceWizard(addContext());
    return deviceManualHtml();
  }
  function closeConfirmSafe() {
    document.querySelector("#confirm .btn:not(.pri), #confirmCancel")?.click();
  }
});
