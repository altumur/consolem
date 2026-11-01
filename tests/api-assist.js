/* Тесты API: ассистент — ход разговора потоком, вопрос, план, отказ, ошибка, секрет. */
(() => {
  const { test, makeEnv, assert } = ApiTest;
  const NEED = { needs: ["assistTurn"] };
  const types = (got) => got.map((m) => m.type).join(",");

  test("Ассистент: план на камеры, «Применить» — POST /devices/update, старый план — VERSION_MISMATCH", async () => {
    const env = await makeEnv();
    const got = await env.stream("/assist/turns", { text: "выключи запись на камерах Главный вход" });
    const plan = got[got.length - 1];
    assert.eq(plan.type, "plan", "последнее сообщение");
    assert.ok(got[0].type === "progress", "сначала ход работы");
    assert.ok(plan.items.length > 0, "камеры выбраны");
    const items = plan.items.map(({ deviceId, version, set }) => ({ deviceId, version, set }));
    const res = await env.ok("POST", "/devices/update", { idempotencyKey: "assist-apply-1", items });
    assert.eq([res.done.length, res.failed.length], [items.length, 0], "применено");
    assert.eq(res.done[0].recordMode, "none", "значение");
    const again = await env.ok("POST", "/devices/update", { idempotencyKey: "assist-apply-2", items });
    assert.eq(again.failed[0].code, "VERSION_MISMATCH", "устройство изменилось после плана");
    return `устройств ${items.length}`;
  }, NEED);

  test("Ассистент: вопрос, ответ с context — план; разговор держит клиент", async () => {
    const env = await makeEnv();
    const first = await env.stream("/assist/turns", { text: "включи запись" });
    const q = first[first.length - 1];
    assert.eq([q.type, q.text], ["question", "На каких камерах?"], "уточнение");
    const second = await env.stream("/assist/turns", { text: "Главный вход", context: q.context });
    assert.eq(second[second.length - 1].type, "plan", "по ответу — план");
    return types(first);
  }, NEED);

  test("Ассистент: отказ по полю и ошибка завершают поток", async () => {
    const env = await makeEnv();
    const no = await env.stream("/assist/turns", { text: "поменяй маску сети" });
    const end = no[no.length - 1];
    assert.eq([end.type, end.field], ["refused", "netmask"], "отказ");
    const bad = await env.stream("/assist/turns", { text: "сбой" });
    assert.eq(bad[bad.length - 1].code, "UPSTREAM_UNAVAILABLE", "ошибка");
  }, NEED);

  test("Ассистент: секрет идёт в set и не показывается в пояснении и в context", async () => {
    const env = await makeEnv();
    const got = await env.stream("/assist/turns", { text: "смени пароль Главный вход на секрет № 2", secrets: ["первый", "второй-S3CRET"] });
    const plan = got[got.length - 1];
    assert.eq(plan.items[0].set.password, "второй-S3CRET", "значение в set");
    const shown = JSON.stringify([plan.summary, plan.context, plan.items.map((x) => x.changes)]);
    assert.ok(!shown.includes("S3CRET"), "значения нет в пояснении и context");
    assert.ok(!("before" in plan.items[0].changes[0]), "«было» у секрета нет");
  }, NEED);

  test("Ассистент: пустая просьба — 422", async () => {
    const env = await makeEnv();
    assert.status(await env.call("POST", "/assist/turns", { text: "" }), 422, "VALIDATION_FAILED");
  }, NEED);
  ApiTest.loaded("api-assist.js");
})();
