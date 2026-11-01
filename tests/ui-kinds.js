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

  // Производители и модели — из справочника, своё вводится руками; адрес — rtspUrl
  const ref = await API.get("/reference");
  ok(Object.keys(DEVICE_MODELS).length === ref.deviceModels.length, "модели из reference.deviceModels");
  wizd = initDeviceWizard(addContext());
  ok(/<datalist id="devModelList"/.test(deviceManualHtml()) && /RTSP/.test(deviceManualHtml()), "модель с подсказками, поле RTSP в ручном добавлении");
  ok(!/MAC-адрес/.test(deviceManualHtml()), "MAC вручную не вводится: он только из поиска");
  const withUrl = of("camera", (d) => d.rtspUrl);
  open(withUrl.id);
  ok(document.querySelector('[data-df="RTSP"]')?.value === withUrl.rtspUrl, "карточка показывает rtspUrl");
  const noUrl = of("camera", (d) => !d.rtspUrl && !d.parentId);
  open(noUrl.id);
  ok(document.querySelector('[data-df="RTSP"]')?.value === "", "адреса нет — поле пустое, а не собранное из IP");

  // Видео: своего не подставляем, потоки строками, разрешение — из вариантов
  const video = of("camera", (d) => d.resOptions && d.online);
  open(video.id, "vid");
  ok(document.querySelector('[data-df="Разрешение"]')?.tagName === "SELECT" && !/H\.265|4096|Битрейт/.test(main().textContent), "разрешение — выбор из resOptions, H.265 и битрейта нет");
  ok(await until(() => liveSessions.get(video.id)?.whepUrl), "живое видео запрошено через POST /devices/{id}/live");
  ok(await until(() => /Кадр-заглушка/.test(main().textContent)), "вместо видео — кадр-заглушка");
  const free = of("camera", (d) => !d.resOptions && !d.parentId);
  open(free.id, "vid");
  ok(document.querySelector('[data-df="Разрешение"]')?.tagName === "INPUT", "нет вариантов — ввод руками");
  open(video.id, "vid");
  const rowsBefore = main().querySelectorAll("[data-stream]").length;
  streamAdd(video.id);
  ok(await until(() => main().querySelectorAll("[data-stream]").length === rowsBefore + 1), "поток добавлен строкой");
  const added = find(video.id).n.streams.at(-1);
  streamDel(video.id, added.id);
  ok(await until(() => document.getElementById("confirmCountInp")), "удаление потока — с вводом числа");
  await confirmWith(1);
  ok(await until(() => find(video.id).n.streams.length === rowsBefore), "поток удалён после отсчёта");
  open(video.id, "rec");
  ok(!main().querySelector("select") || [...main().querySelectorAll("option")].some((o) => o.textContent === "Второй") || !camArchs(find(video.id).n).length, "поток записи — из потоков камеры");

  // Детекторы: встроенный — из того, что умеет камера; зона рисуется мышью и уходит на сервер
  const camD = devices.find((d) => d.detectorOptions && devices.some((x) => x.parentId === d.id && x.type === "det" && x.detectorKind === "linecross" && x.builtin));
  open(camD.id, "det");
  addDetector(camD.id);
  const draftId = detSel;
  ok(!!main().textContent.includes("Где работает"), "новый детектор: выбор, где работает");
  detPlace(camD.id, draftId, "tmpl.tamper");
  ok(![...main().querySelectorAll("[data-df]")].some((e) => e.dataset.df === "Чувствительность"), "у шаблона без чувствительности поля нет");
  detPlace(camD.id, draftId, "tmpl.line");
  ok([...main().querySelectorAll("[data-df]")].some((e) => e.dataset.df === "Чувствительность") && /1–100/.test(main().textContent), "диапазон шаблона показан");
  ok(/линия/i.test(main().textContent), "детектору линии без линии — подсказка");
  zoneMode(draftId, "line");
  const svg = () => main().querySelector(`[data-zone="${draftId}"]`);
  ok(!!svg(), "кадр с зоной");
  const at = (t, fx, fy, el = svg()) => {
    const r = el.getBoundingClientRect();
    (t === "mousedown" ? el : window).dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy }));
  };
  const box = svg().getBoundingClientRect();
  ok(box.width > 0 && box.height > 0, "кадр занял место: " + Math.round(box.width) + "×" + Math.round(box.height));
  at("mousedown", 0.25, 0.5);
  at("mousemove", 0.5, 0.6);
  at("mouseup", 0.75, 0.5);
  const dz = camDetectors(find(camD.id).n).find((d) => d.id === draftId);
  ok(dz.zone?.shape === "line" && Math.abs(dz.zone.points[0][0] - 0.25) < 0.01 && Math.abs(dz.zone.points[1][0] - 0.75) < 0.01, "линия нарисована мышью, в долях кадра");
  cardApply();
  const made = async () => (await API.get("/devices")).items.find((d) => d.parentId === camD.id && d.template === "tmpl.line" && d.zone?.shape === "line");
  await until(() => !bq || bq.finished);
  const rec = await made();
  ok(!!rec && rec.builtin === true, "создан встроенный детектор с шаблоном и зоной");
  // Полигон на готовом детекторе, «Сбросить»
  const line = devices.find((d) => d.parentId === camD.id && d.type === "det" && !d.builtin);
  open(line.id);
  zoneMode(line.id, "polygon");
  const pg = () => main().querySelector(`[data-zone="${line.id}"]`);
  [[0.2, 0.2], [0.8, 0.2], [0.5, 0.8]].forEach(([x, y]) => at("mousedown", x, y, pg()));
  zoneClose(line.id);
  ok(find(line.id).n.zone?.shape === "polygon" && find(line.id).n.zone.points.length === 3, "полигон из трёх точек");
  ok(/Показать план/.test(document.getElementById("cardFoot")?.textContent || ""), "зона — в черновике карточки");
  cardApply();
  await until(() => !bq || bq.finished);
  ok((await API.get(`/devices/${line.id}`)).zone?.points.length === 3, "зона на сервере");
  open(line.id);
  // Несовместимый: отказ сказан своими словами
  const clash = problemText({ problem: { code: "BUSY", params: { reason: "incompatible", with: line.id } } });
  ok(/несовместим/.test(clash), "несовместимый детектор: " + clash);
  ok(TRIGGER_KINDS.some((k) => k.kind === "other") && ruleDetOthers().some((x) => x[1] === "Вскрытие корпуса"), "другой вид выбирается в правиле по имени шаблона");

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
