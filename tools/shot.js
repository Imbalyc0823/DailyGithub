#!/usr/bin/env node
/**
 * 用 Chrome DevTools Protocol 以指定视口宽度截图（headless 窗口有最小宽度限制，需走 CDP 模拟）。
 *
 *   node tools/shot.js <url> <out.png> [width] [height]
 */
"use strict";

var cp = require("child_process");
var fs = require("fs");
var os = require("os");
var path = require("path");

var url = process.argv[2];
var out = process.argv[3];
var W = parseInt(process.argv[4] || "390", 10);
var H = parseInt(process.argv[5] || "1400", 10);

var CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find(function (p) { return fs.existsSync(p); });

var port = 9333;
var userDir = path.join(os.tmpdir(), "cdp-shot-profile");

var child = cp.spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-port=" + port,
  "--user-data-dir=" + userDir,
  "--no-first-run", "--no-default-browser-check",
  "about:blank"
], { stdio: "ignore" });

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  var list = null;
  for (var i = 0; i < 40; i++) {
    try {
      var r = await fetch("http://127.0.0.1:" + port + "/json/list");
      list = await r.json();
      if (list.length) break;
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  if (!list || !list.length) throw new Error("无法连接 Chrome");

  var ws = new WebSocket(list[0].webSocketDebuggerUrl);
  var id = 0, waiting = {};
  ws.addEventListener("message", function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && waiting[m.id]) { waiting[m.id](m); delete waiting[m.id]; }
  });
  await new Promise(function (r) { ws.addEventListener("open", r); });

  function send(method, params) {
    return new Promise(function (resolve) {
      var mid = ++id;
      waiting[mid] = resolve;
      ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
    });
  }

  await send("Emulation.setDeviceMetricsOverride", {
    width: W, height: H, deviceScaleFactor: 2, mobile: W < 700
  });
  await send("Page.enable");
  await send("Page.navigate", { url: url });
  await sleep(2600);

  var res = await send("Runtime.evaluate", {
    expression: "JSON.stringify({w:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight})",
    returnByValue: true
  });
  console.error("metrics " + res.result.result.value);

  var shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.error("saved " + out);

  ws.close();
  child.kill();
}

main().catch(function (e) { console.error(e.message); try { child.kill(); } catch (x) {} process.exit(1); });
