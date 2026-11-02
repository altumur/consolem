#!/usr/bin/env node
/* Сценарий tools/check_live.py: настоящая мышь по CDP, настоящие кадры. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [chrome, root] = process.argv.slice(2);
const PORT = 9400 + (process.pid % 400);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "consolem-live-"));
const url = `file://${root}/index.html`;
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox", "--allow-file-access-from-files", `--user-data-dir=${prof}`, "--window-size=1500,1000", `--remote-debugging-port=${PORT}`, url], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, m) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) failed++;
};
async function tabs() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const p = l.find((t) => t.type === "page");
      if (p) return p;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error("Chrome не поднялся");
}
const page = await tabs();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const wait = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) (wait.get(m.id)(m.result), wait.delete(m.id));
};
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await cmd("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
const until = async (x, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await ev(x)) return true; await sleep(100); } return false; };
const box = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.hidden)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return r.width?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`);
async function click(sel) {
  const b = await box(sel);
  if (!b) return false;
  await cmd("Input.dispatchMouseEvent", { type: "mouseMoved", x: b.x, y: b.y });
  await cmd("Input.dispatchMouseEvent", { type: "mousePressed", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await sleep(40);
  await cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await sleep(100);
  return true;
}
const video = () => ev(`(()=>{const v=document.querySelector("#main video");return v?{w:v.videoWidth,h:v.videoHeight,t:v.currentTime,paused:v.paused}:null})()`);

try {
  await ev("window.appReady");
  await sleep(500);
  await ev(`window.uiCam=devicePool.find(n=>n.type==="camera"&&n.online!==false&&!n._row)||devicePool.find(n=>n.type==="camera"&&n.online!==false);pick(uiCam.id,{force:true});null`);
  await until(`!uiCam._row&&sel===uiCam.id`);
  ok(await click(`#main .tab:nth-child(2)`), "закладка «Просмотр»: мышью");
  ok(await until(`tab==="view"`), "открылась");
  ok(await click(`[data-live-go]`), "«Смотреть»: мышью");
  ok(await until(`/Идёт/.test(document.querySelector("[data-live-state]").textContent)`), "идёт: " + (await ev(`document.querySelector("[data-live-state]").textContent`)));
  ok(await until(`document.querySelector("#main video")?.videoWidth>0`), "кадры пришли");
  const a = await video();
  await sleep(2000);
  const b = await video();
  ok(a?.w === 640 && a?.h === 360, `video.videoWidth×videoHeight ${a?.w}×${a?.h}`);
  ok(b?.t > a?.t + 1, `currentTime растёт: ${a?.t.toFixed(2)} → ${b?.t.toFixed(2)} за 2 с`);
  ok(!b?.paused, "не на паузе");
  ok(/настоящего видео на стенде нет/.test(await ev(`document.querySelector(".live-note").textContent`)), "подпись на кадре: не камера");
  if (process.env.SHOT) fs.writeFileSync(process.env.SHOT, Buffer.from((await cmd("Page.captureScreenshot", { format: "png" })).data, "base64"));
  ok(await click(`[data-live-go]`), "«Остановить»: мышью");
  ok(await until(`!ConsolemWhepStub.sessions.size`), "сессия снята");
  ok(await until(`document.querySelector("#main video")?.srcObject===null||!document.querySelector("#main video")`), "поток элемента снят");
} catch (e) {
  ok(false, "исключение: " + e.message);
}
const gone = new Promise((r) => proc.once("exit", r));
proc.kill();
await Promise.race([gone, sleep(3000)]);
try {
  fs.rmSync(prof, { recursive: true, force: true, maxRetries: 3 });
} catch (e) {}
process.exit(failed ? 1 : 0);
