#!/usr/bin/env node
/* 视口截图（可指定滚动位置，并强制显示 reveal 元素）
 * node shot-scroll.js <url> <out.png> <width> <height> <scrollY> */
"use strict";
var cp = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
var url = process.argv[2], out = process.argv[3];
var W = parseInt(process.argv[4] || "1440", 10);
var H = parseInt(process.argv[5] || "1000", 10);
var Y = parseInt(process.argv[6] || "0", 10);

var CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(function (p) { return fs.existsSync(p); });
var port = 9334, userDir = path.join(os.tmpdir(), "cdp-shot-profile-2");
var child = cp.spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-port=" + port, "--user-data-dir=" + userDir,
  "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  var list = null;
  for (var i = 0; i < 40; i++) {
    try { var r = await fetch("http://127.0.0.1:" + port + "/json/list"); list = await r.json(); if (list.length) break; } catch (e) {}
    await sleep(250);
  }
  if (!list || !list.length) throw new Error("无法连接 Chrome");
  var ws = new WebSocket(list[0].webSocketDebuggerUrl), id = 0, waiting = {};
  ws.addEventListener("message", function (ev) { var m = JSON.parse(ev.data); if (m.id && waiting[m.id]) { waiting[m.id](m); delete waiting[m.id]; } });
  await new Promise(function (r) { ws.addEventListener("open", r); });
  function send(method, params) { return new Promise(function (resolve) { var mid = ++id; waiting[mid] = resolve; ws.send(JSON.stringify({ id: mid, method: method, params: params || {} })); }); }

  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1.5, mobile: W < 700 });
  await send("Page.enable");
  await send("Page.navigate", { url: url });
  await sleep(2500);
  await send("Runtime.evaluate", { expression: "var s=document.createElement('style');s.textContent='.reveal{opacity:1!important;transform:none!important}';document.head.appendChild(s);window.scrollTo(0," + Y + ");" });
  await sleep(1200);
  var m = await send("Runtime.evaluate", { expression: "JSON.stringify({h:document.documentElement.scrollHeight,y:window.scrollY})", returnByValue: true });
  console.error("metrics " + m.result.result.value);
  var shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.error("saved " + out);
  ws.close(); child.kill();
}
main().catch(function (e) { console.error(e.message); try { child.kill(); } catch (x) {} process.exit(1); });
