/* Файл нейросети (прототип 74, пробел CX2 против Axxon One): окно нейросетевого трекера → раздел «Нейросеть»,
   окно трекера объектов → раздел «Нейрофильтр». Стандартная нейросеть и «что ищет», свой файл из папки моделей сервера,
   путь вручную с «Проверить файл» (без проверки путь не применяется), процессор и ошибка несовпадения, «Не применено»,
   «Применить» (только выбор нейросети и вместе с настройками детектора) и «Сбросить», английские тексты раздела.
   Данные — заглушка в памяти страницы (в контракте 0.13.0 полей нет).
   На странице без раздела (index.html до переноса) сценарий только отмечает, что проверять нечего.
   Запуск: python3 tools/check_ui.py --page index_74_fajl-nejroseti.html tests/ui-fajl-nejroseti.js */
UiCheck(async ({ ok, until }) => {
  if (typeof nnSecHtml !== "function") { ok(true, "раздела «Нейросеть» на этой странице нет: проверять нечего"); return; }
  const NEU = "30000027-0002-4000-8000-000000000000"; // «Нейросетевой трекер»
  const TRK = "30000027-0001-4000-8000-000000000000"; // «Трекер объектов»
  const sec = () => document.querySelector("[data-nn-sec]");
  const txt = () => sec()?.textContent || "";
  const err = () => sec()?.querySelector(".nt.err")?.textContent || "";
  const nnRows = (id) => dwDiffRows(detNodeOf(id)).filter((r) => r.keys[0] === "nn");
  const sel = () => sec().querySelector("select.nn-sel");
  const pick = async (v) => { const s = sel(); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); await until(() => sel()?.value === v); };
  const typePath = (v) => { const i = sec().querySelector(".nn-path input"); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); };
  const btn = (t) => [...sec().querySelectorAll("button")].find((b) => b.textContent.trim() === t);
  const checkBtn = async () => { btn("Проверить файл").click(); await until(() => sec()?.querySelector(".nt")); };

  goApp("hw");
  await hwEnsure([NEU, TRK]);
  openNode(NEU, { app: "hw" });
  ok(await until(() => sec()), "окно нейросетевого трекера: раздел «Нейросеть»");
  ok(sec().querySelector("h4").textContent.startsWith("Нейросеть"), "заголовок раздела — «Нейросеть»");
  ok(sel().value === "std" && sel().options[0].textContent === "Стандартная нейросеть (подбирает сервер)", "первый пункт и выбор по умолчанию — стандартная нейросеть");
  ok(sel().options[sel().options.length - 1].value === "@path", "последний пункт — «Указать путь вручную…»");
  ok(txt().includes("person_gpu.ann"), "карточка называет файл стандартной нейросети для процессора GPU");
  ok(!nnRows(NEU).length, "без правок в плане нет строк нейросети");

  // Что ищет стандартная нейросеть и процессор меняют имя файла
  const what = sec().querySelector(".nn-card select");
  what.value = "vehicle"; what.dispatchEvent(new Event("change", { bubbles: true }));
  ok(await until(() => txt().includes("vehicle_gpu.ann")), "«Машина» — файл vehicle_gpu.ann");
  btn("CPU").click();
  ok(await until(() => txt().includes("vehicle_cpu.ann")), "процессор CPU — файл vehicle_cpu.ann");
  ok(nnRows(NEU).length === 2, "в плане две строки: процессор и файл нейросети");

  // Свой файл не для этого процессора: ошибка у поля, «Применить» не проходит
  await pick("people_topview_v3.ann");
  ok(/работает только на GPU NVIDIA/.test(err()), "файл только для GPU на CPU — ошибка у поля");
  const saved0 = JSON.stringify(nn.saved[NEU]);
  dwApply(NEU);
  ok(JSON.stringify(nn.saved[NEU]) === saved0, "с ошибкой «Применить» не сохраняет выбор");
  const fix = [...sec().querySelectorAll(".nn-err button")].find((b) => b.textContent.includes("GPU NVIDIA"));
  ok(!!fix, "у ошибки есть кнопка «Выбрать GPU NVIDIA»");
  fix.click();
  await until(() => !err());
  ok(nn.draft[NEU].proc === "gpu" && !err(), "кнопка выбрала GPU NVIDIA, ошибка ушла");
  ok(txt().includes("Человек (вид сверху)") && txt().includes("640 × 640") && txt().includes("46 МБ"), "карточка файла: объекты, вход нейросети, размер");

  // «Применить»: только правки нейросети — консоль сохраняет их в странице без операции
  dwApply(NEU);
  ok(nn.saved[NEU].net.file.endsWith("/people_topview_v3.ann") && !nnRows(NEU).length, "«Применить» сохранил файл, строк в плане нет");

  // Путь вручную: без проверки и с отказом проверки «Применить» не проходит
  await pick("@path");
  ok(await until(() => sec().querySelector(".nn-path")), "«Указать путь вручную…» открывает поле пути");
  typePath("/opt/AxxonSoft/DetectorPack/NeuroSDK/parking_cars_v1.ann");
  const saved1 = JSON.stringify(nn.saved[NEU]);
  dwApply(NEU);
  ok(JSON.stringify(nn.saved[NEU]) === saved1, "непроверенный путь «Применить» не сохраняет");
  ok(/Проверить файл/.test(nnProblem(detNodeOf(NEU), "neural")?.t || ""), "ошибка просит нажать «Проверить файл»");
  typePath("/opt/models/people.onnx"); await checkBtn();
  ok(/формате \*\.ann/.test(err()), "файл не *.ann — ошибка с допустимым форматом");
  dwApply(NEU);
  ok(JSON.stringify(nn.saved[NEU]) === saved1, "путь с отказом проверки «Применить» не сохраняет");
  typePath("/opt/models/missing.ann"); await checkBtn();
  ok(/не нашёл файл/.test(err()) && /сервере детектора/.test(err()), "файла нет — ошибка называет сервер детектора");
  typePath("/opt/AxxonSoft/DetectorPack/NeuroSDK/parking_cars_v1.ann"); await checkBtn();
  ok(/Сервер нашёл файл/.test(txt()) && txt().includes("512 × 512"), "файл есть — «Сервер нашёл файл» и карточка файла");
  typePath("/opt/AxxonSoft/DetectorPack/NeuroSDK/parking_cars_v2.ann");
  ok(!/Сервер нашёл файл/.test(txt()) && !sec().querySelector(".nn-card"), "правка пути убирает старый итог проверки и карточку");

  // «Сбросить» возвращает сохранённый выбор
  dwRevert(NEU);
  ok(await until(() => sel()?.value === "people_topview_v3.ann") && !nnRows(NEU).length, "«Сбросить» вернул сохранённый файл");

  // Вместе с настройками детектора: отказ «Применить» не сохраняет выбор нейросети
  btn("CPU").click(); await until(() => nn.draft[NEU].proc === "cpu");
  btn("GPU NVIDIA").click(); await until(() => nn.draft[NEU].proc === "gpu");
  await pick("parking_cars_v1.ann");
  const dc = dwC(detNodeOf(NEU)); dc.conf = dc.conf === 50 ? 60 : 50;
  const realBq = bq; bq = { finished: false };
  const saved2 = JSON.stringify(nn.saved[NEU]);
  dwApply(NEU);
  bq = realBq;
  ok(JSON.stringify(nn.saved[NEU]) === saved2 && nnRows(NEU).length > 0, "групповая операция идёт: выбор нейросети остался в «Не применено»");
  dwRevert(NEU);

  // Трекер объектов: нейрофильтр — свой файл обязателен
  openNode(TRK, { app: "hw" });
  ok(await until(() => sec() && sec().querySelector("h4").textContent.startsWith("Нейрофильтр")), "окно трекера объектов: раздел «Нейрофильтр»");
  ok(!sec().querySelector("select.nn-sel"), "нейрофильтр выключен — выбора файла нет");
  sec().querySelector('[role="switch"]').click();
  await until(() => sec().querySelector("select.nn-sel"));
  ok(![...sel().options].some((o) => o.value === "std") && sel().options[0].textContent === "Выбрать файл…", "у нейрофильтра нет стандартной нейросети, первый пункт — «Выбрать файл…»");
  ok(/Без файла нейрофильтр не работает/.test(err()), "без файла — ошибка у поля");
  await pick("moving_filter_v2.ann");
  ok(!err() && nnRows(TRK).length === 2, "файл выбран: ошибки нет, в плане нейрофильтр и файл");
  await pick("");
  ok(/Без файла нейрофильтр не работает/.test(err()), "снова «Выбрать файл…» — снова ошибка «нет файла»");
  const saved3 = JSON.stringify(nn.saved[TRK]);
  dwApply(TRK);
  ok(JSON.stringify(nn.saved[TRK]) === saved3, "без файла «Применить» не сохраняет нейрофильтр");
  await pick("moving_filter_v2.ann");
  dwApply(TRK);
  ok(nn.saved[TRK].flt.on && nn.saved[TRK].flt.file.endsWith("/moving_filter_v2.ann"), "«Применить» сохранил нейрофильтр");

  // Английский: в разделе нет русского текста, кроме данных (имён файлов и путей) и общих слов словаря
  setUiLang("en");
  openNode(NEU, { app: "hw" });
  await until(() => sec() && /Neural network/.test(txt()));
  const left = (sec().innerText.match(/[А-Яа-яЁё][^\n]*/g) || []).filter((l) => !/Центр|Сервер —|Офис/.test(l));
  ok(/Neural network/.test(txt()) && !left.length, `английский: русского текста в разделе нет${left.length ? ` (${left.slice(0, 3).join(" | ")})` : ""}`);
  ok(!/Vehicle|Refresh the list/.test(document.body.innerText), "словарь прототипа не меняет общие переводы");
  setUiLang("ru");
});
