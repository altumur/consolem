/* Сверка значений со схемами контракта api/openapi.json (api/openapi.js). Ею пользуются встроенный
   сервер (тела запросов → 422 VALIDATION_FAILED), тесты API и самопроверка прототипа (ответы сервера).
   Подмножество JSON Schema, которым пользуется контракт: type (и списком, с null), properties, required,
   additionalProperties, items, enum, $ref, anyOf/oneOf, format, minimum/maximum, pattern, minLength, minItems. Поле, которого
   нет в схеме, — тоже расхождение: контракт описывает всё, что ходит по сети.
   validate — свойства объекта против схемы вида (UnitKind.schema): ошибки с указателем на поле для 422. */
(() => {
  const FORMATS = {
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    date: /^\d{4}-\d\d-\d\d$/,
    "date-time": /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/,
  };
  const kindOf = (v) =>
    v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v === "number" ? "number" : typeof v;

  function check(spec, schema, value, where, out) {
    if (!schema || out.length > 40) return out;
    if (schema.$ref) return check(spec, spec.components.schemas[schema.$ref.split("/").pop()], value, where, out);
    const alts = schema.anyOf || schema.oneOf;
    if (alts) {
      if (alts.some((alt) => !check(spec, alt, value, where, []).length)) return out;
      const errs = check(spec, alts.find((a) => a.type !== "null") || alts[0], value, where, []);
      out.push(...(errs.length ? errs : [`${where}: не подходит ни под один вариант`]));
      return out;
    }
    const types = [].concat(schema.type || []);
    const kind = kindOf(value);
    if (types.length && !types.includes(kind) && !(kind === "integer" && types.includes("number"))) {
      out.push(`${where}: ${kind} вместо ${types.join("|")}`);
      return out;
    }
    if (schema.enum && !schema.enum.includes(value)) out.push(`${where}: ${JSON.stringify(value)} нет в перечислении`);
    if (kind === "string") {
      const re = FORMATS[schema.format];
      if (re && !re.test(value)) out.push(`${where}: ${JSON.stringify(value)} — не ${schema.format}`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${where}: ${JSON.stringify(value)} не подходит под ${schema.pattern}`);
      if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${where}: короче ${schema.minLength}`);
    }
    if (kind === "integer" || kind === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) out.push(`${where}: ${value} меньше ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) out.push(`${where}: ${value} больше ${schema.maximum}`);
    }
    if (kind === "array" && schema.minItems !== undefined && value.length < schema.minItems) out.push(`${where}: меньше ${schema.minItems} элементов`);
    if (kind === "array" && schema.items) value.forEach((item, i) => check(spec, schema.items, item, `${where}[${i}]`, out));
    if (kind === "object") {
      const props = schema.properties || {};
      (schema.required || []).forEach((name) => {
        if (!(name in value)) out.push(`${where}: нет обязательного поля ${name}`);
      });
      const extra = schema.additionalProperties === undefined ? true : schema.additionalProperties;
      Object.entries(value).forEach(([name, v]) => {
        if (props[name]) check(spec, props[name], v, `${where}.${name}`, out);
        else if (extra === false) out.push(`${where}: поле ${name} не описано в контракте`);
        else if (typeof extra === "object") check(spec, extra, v, `${where}.${name}`, out);
      });
    }
    return out;
  }

  // Свойства объекта против схемы вида (UnitKind.schema): ошибки с указателем на поле (JSON Pointer) и словом схемы,
  // а не строки для журнала, как у check. dir: "write" — в запросе (readOnly — ошибка), "read" — в ответе (writeOnly — ошибка).
  // partial — сама правка JSON Merge Patch (RFC 7396): null — удаление, обязательность не проверяется на любой глубине.
  // Сервер проверяет правку так: сначала partial (что прислано), затем слитое целое без partial — обязательность и if/then.
  // Ключевые слова — подмножество JSON Schema 2020-12 из описания JsonSchema контракта; незнакомые и x-* пропускаются
  function validate(schema, value, pointer, opts, out) {
    opts = opts || {};
    out = out || [];
    if (!schema || typeof schema !== "object" || out.length > 40) return out;
    const fail = (keyword, params) => out.push({ field: pointer || "", code: "VALIDATION_FAILED", params: { keyword, ...(params || {}) } });
    // readOnly — до выхода по null: снять системное поле правкой (null) — та же запись, что задать его
    if (opts.dir === "write" && schema.readOnly) return fail("readOnly"), out;
    if (opts.partial && value === null) return out;
    const alts = schema.anyOf || schema.oneOf;
    if (alts) {
      const fits = alts.filter((alt) => !validate(alt, value, pointer, opts, []).length).length;
      if (schema.anyOf ? !fits : fits !== 1) fail(schema.anyOf ? "anyOf" : "oneOf");
    }
    if (opts.dir === "read" && schema.writeOnly && value !== undefined) return fail("writeOnly"), out;
    const types = [].concat(schema.type || []);
    const kind = kindOf(value);
    if (types.length && !types.includes(kind) && !(kind === "integer" && types.includes("number"))) {
      fail("type", { expected: types.join("|") });
      return out;
    }
    if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) fail("const", { value: schema.const });
    if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) fail("enum", { allowed: schema.enum });
    if (kind === "string") {
      const re = FORMATS[schema.format];
      if (re && !re.test(value)) fail("format", { format: schema.format });
      if (schema.pattern) {
        // Шаблон приходит из описания чужого вида: кривой шаблон — не исключение, а ошибка поля
        let re = null;
        try { re = new RegExp(schema.pattern, "u"); } catch (e) { re = null; }
        if (!re || !re.test(value)) fail("pattern", { pattern: schema.pattern });
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) fail("minLength", { limit: schema.minLength });
      if (schema.maxLength !== undefined && value.length > schema.maxLength) fail("maxLength", { limit: schema.maxLength });
    }
    if (kind === "integer" || kind === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) fail("minimum", { limit: schema.minimum });
      if (schema.maximum !== undefined && value > schema.maximum) fail("maximum", { limit: schema.maximum });
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail("exclusiveMinimum", { limit: schema.exclusiveMinimum });
      if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail("exclusiveMaximum", { limit: schema.exclusiveMaximum });
    }
    if (kind === "array") {
      if (schema.minItems !== undefined && value.length < schema.minItems) fail("minItems", { limit: schema.minItems });
      if (schema.maxItems !== undefined && value.length > schema.maxItems) fail("maxItems", { limit: schema.maxItems });
      // Массив в Merge Patch заменяется целиком: его элементы — значения, а не правки
      if (schema.items) value.forEach((item, i) => validate(schema.items, item, `${pointer}/${i}`, { ...opts, partial: false }, out));
    }
    if (kind === "object") {
      const props = schema.properties || {};
      const esc = (name) => String(name).replace(/~/g, "~0").replace(/\//g, "~1");
      // Частичная правка (PATCH) не обязана нести обязательные поля: их проверяет слитое целое
      if (!opts.partial) (schema.required || []).forEach((name) => {
        if (!(name in value)) out.push({ field: `${pointer}/${esc(name)}`, code: "VALIDATION_FAILED", params: { keyword: "required" } });
      });
      Object.entries(value).forEach(([name, v]) => {
        const at = `${pointer}/${esc(name)}`;
        if (props[name]) validate(props[name], v, at, opts, out);
        else if (schema.additionalProperties === false) out.push({ field: at, code: "VALIDATION_FAILED", params: { keyword: "additionalProperties" } });
        else if (schema.additionalProperties && typeof schema.additionalProperties === "object") validate(schema.additionalProperties, v, at, opts, out);
      });
      Object.entries(schema.dependentSchemas || {}).forEach(([name, dep]) => {
        if (name in value) validate(dep, value, pointer, opts, out);
      });
    }
    // В проходе по самой правке условие не решить: в ней нет полей, от которых оно зависит. Решает проверка слитого целого
    if (schema.if && !opts.partial) {
      // Условие проверяется как есть: required внутри if входит в условие; направление чтения/записи к нему не относится
      const branch = validate(schema.if, value, pointer, { partial: opts.partial }, []).length ? schema.else : schema.then;
      if (branch) validate(branch, value, pointer, opts, out);
    }
    (schema.allOf || []).forEach((part) => validate(part, value, pointer, opts, out));
    return out;
  }

  // Операция контракта по методу и пути запроса: шаблон с наименьшим числом параметров
  // (/operations/{id}/pause, а не /operations/{id})
  function operationOf(spec, method, path) {
    const bare = path.split("?")[0];
    let best = null;
    Object.entries(spec.paths).forEach(([template, item]) => {
      const op = item[method.toLowerCase()];
      if (!op) return;
      const names = (template.match(/\{\w+\}/g) || []).length;
      const re = new RegExp(`^${template.replace(/\{\w+\}/g, "[^/]+")}$`);
      if (re.test(bare) && (!best || names < best.names)) best = { template, op, names };
    });
    return best;
  }

  // Тело запроса против requestBody операции: список расхождений, пустой — подходит
  function requestProblems(spec, method, path, body) {
    const found = operationOf(spec, method, path);
    const schema = found && found.op.requestBody && found.op.requestBody.content["application/json"].schema;
    return schema ? check(spec, schema, body === undefined ? {} : body, "body", []) : [];
  }

  // Записанные ответы против схем: { method, template, status, body, kind: "http"|"stream" }
  function problems(spec, recorded) {
    const out = [];
    recorded.forEach((r) => {
      if (r.kind === "stream") {
        check(spec, { $ref: "#/components/schemas/StreamMessage" }, r.body, `поток ${r.body && r.body.type}`, out);
        return;
      }
      const item = spec.paths[r.template];
      const op = item && item[r.method.toLowerCase()];
      if (!op) return out.push(`${r.method} ${r.template}: нет в контракте`);
      if (r.kind === "sse") {
        check(spec, op.responses["200"].content["text/event-stream"].schema, r.body, `${r.method} ${r.template} ${r.body && r.body.type}`, out);
        return;
      }
      const res = op.responses[String(r.status)] || op.responses.default;
      if (!res) return out.push(`${r.method} ${r.template}: код ${r.status} не описан`);
      const resolved = res.$ref ? spec.components.responses[res.$ref.split("/").pop()] : res;
      const content = resolved.content;
      if (!content) {
        if (r.body !== null && r.body !== undefined && r.body !== "") out.push(`${r.method} ${r.template} ${r.status}: тело есть, а в контракте его нет`);
        return;
      }
      const schema = (content["application/json"] || content["application/problem+json"] || {}).schema;
      check(spec, schema, r.body, `${r.method} ${r.template} ${r.status}`, out);
      if (resolved.headers && resolved.headers.ETag && !(r.headers || {}).etag) out.push(`${r.method} ${r.template} ${r.status}: нет заголовка ETag`);
    });
    return out;
  }

  window.ConsolemContract = { check, validate, operationOf, requestProblems, problems };
})();
