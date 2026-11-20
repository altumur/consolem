/* Слои тестов API: чистые функции, без обращения к странице и серверу. Работают в браузере (tests/api.html)
   и в Node (tools/check_test_layers.py, tools/api_tests_registry.mjs).
   Слой — строка: "mechanism", "video" или "profile:<id>" (id — как Profile.id, с /N: profile:vms.camera/1).
   Условие в needs теста: "profile:<id>" или "profile:<id>@<M.m>" — профиль объявлен, а при @ его версия не младше M.m. */
(() => {
  const PROFILE_RE = /^profile:([A-Za-z0-9_.-]+\/[0-9]+)$/;

  // Слой из строки: { type, profile? } или null, если строка не слой
  function parseLayer(s) {
    if (s === "mechanism" || s === "video") return { type: s };
    const m = typeof s === "string" && PROFILE_RE.exec(s);
    return m ? { type: "profile", profile: m[1] } : null;
  }

  // Подпись слоя в отчёте
  function layerTitle(s) {
    const l = parseLayer(s);
    if (!l) return String(s);
    return l.type === "mechanism" ? "механизм" : l.type === "video" ? "API видео" : l.profile;
  }

  // Версии "M.m" сравниваются по числам: 1.10 старше 1.9
  function versionAtLeast(have, need) {
    const a = String(have).split(".").map(Number);
    const b = String(need).split(".").map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return true;
  }

  // Профили, которые объявила система: id → { version, usable }.
  // Профиль объявлен, если его называет implements хоть одного вида; usable — хоть один такой вид проходит usableKind.
  // version — из profiles[] с тем же id, иначе null.
  function declaredProfiles(kindsBody, usableKind) {
    const out = new Map();
    if (!kindsBody) return out;
    const versions = new Map((kindsBody.profiles || []).map((p) => [p.id, p.version === undefined ? null : p.version]));
    (kindsBody.items || []).forEach((item) => {
      (item.implements || []).forEach((id) => {
        const have = out.get(id) || { version: versions.has(id) ? versions.get(id) : null, usable: false };
        if (usableKind(item.kind)) have.usable = true;
        out.set(id, have);
      });
    });
    return out;
  }

  // Причина, по которой тест с условием token пропускается, или null, если условие выполнено
  function profileLack(token, declared) {
    const m = /^profile:([A-Za-z0-9_.-]+\/[0-9]+)(?:@([0-9]+(?:\.[0-9]+)*))?$/.exec(token);
    if (!m) return `условие ${token} не разобрано`;
    const [, id, since] = m;
    const have = declared.get(id);
    if (!have) {
      const name = id.split("/")[0];
      const other = [...declared.keys()].find((k) => k.split("/")[0] === name);
      return other ? `объявлен ${other}, тест — для ${id}` : `профиль ${id} не объявлен`;
    }
    if (!have.usable) return `профиль ${id} объявлен, но с его видом нельзя работать: объекта нет в наборе, завести его нельзя`;
    if (since && have.version === null) return `система не назвала версию профиля ${id}, тесту нужна ${since}`;
    if (since && !versionAtLeast(have.version, since)) return `система объявила ${id} ${have.version}, тесту нужна ${since}`;
    return null;
  }

  // operationId операции, которой нет в caps.operations, или null: операции нет в контракте, она служебная
  // (тег test-support) или система её объявила
  function undeclaredOperation(spec, caps, method, path) {
    const found = ConsolemContract.operationOf(spec, method, path);
    if (!found || (found.op.tags || []).includes("test-support")) return null;
    const id = found.op.operationId;
    return (caps.operations || []).includes(id) ? null : id;
  }

  window.ConsolemTestLayers = { parseLayer, layerTitle, versionAtLeast, declaredProfiles, profileLack, undeclaredOperation };
})();
