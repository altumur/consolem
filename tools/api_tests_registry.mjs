#!/usr/bin/env node
/* Реестр тестов API без запуска: имя, файл, слой, since, needs каждого теста и слой каждого файла.
   Загружает API и файлы тестов в порядке tests/api.html, строку ApiTest.run() не выполняет.

   Запуск из корня репозитория:  node tools/api_tests_registry.mjs [--api DIR] [--tests DIR]
   В stdout — JSON {files: {"api-x.js": слой|null}, tests: [{name, file, layer, since, needs}]}.
   Файл тестов упал при загрузке — код выхода 1, имя файла в stderr. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
const arg = (name, def) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : def);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.resolve(ROOT, arg("api", "api"));
const TESTS_DIR = path.resolve(ROOT, arg("tests", "tests"));

const page = fs.readFileSync(path.join(TESTS_DIR, "api.html"), "utf8");
const srcs = [...page.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);

globalThis.location = { search: "", href: `file://${TESTS_DIR}/api.html`, protocol: "file:" };
globalThis.document = { currentScript: null, scripts: [], getElementById: () => null, documentElement: { dataset: {} } };

const names = [];
let broken = null;
for (const src of srcs) {
  const name = src.split("/").pop();
  const file = src.startsWith("../api/") ? path.join(API_DIR, src.slice(7)) : path.join(TESTS_DIR, src);
  const isTest = /^api-.+\.js$/.test(name) && !src.startsWith("../api/");
  document.currentScript = isTest ? { getAttribute: () => name } : null;
  if (isTest) names.push(name);
  try {
    require(file);
  } catch (err) {
    broken = name;
    console.error(`${name} не загрузился: ${err && err.message}`);
    break;
  }
}
if (broken) process.exit(1);
const reg = ApiTest.registry();
const files = {};
for (const name of names) files[name] = reg.files[name.replace(/\.js$/, "")] ?? null;
process.stdout.write(JSON.stringify({ files, tests: reg.tests }));
