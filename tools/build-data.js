#!/usr/bin/env node
/**
 * 生成当日数据文件 assets/js/data/<date>.js
 *
 * 数据来源：tools/.cache/<date>.json（collect.js 采集）+ <date>.mapping.json（img-to-jpg.py 转换）
 * 文案来源：COPY（本文件内人工撰写的「导读 / 一句话」），缺失时回退到历史日期数据里的同仓库文案。
 *
 * 用法：node tools/build-data.js 2026-11-22
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var CACHE = path.join(ROOT, "tools", ".cache");

var date = process.argv[2];
if (!date) { console.error("用法: node tools/build-data.js YYYY-MM-DD"); process.exit(1); }

var cache = JSON.parse(fs.readFileSync(path.join(CACHE, date + ".json"), "utf8"));
var mapFile = path.join(CACHE, date + ".mapping.json");
var IMG = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, "utf8")) : {};

/* 历史数据：同仓库复用已写好的文案 */
global.window = {};
fs.readdirSync(path.join(ROOT, "assets", "js", "data"))
  .filter(function (f) { return /^\d{4}-\d{2}-\d{2}\.js$/.test(f) && f.indexOf(date) === -1; })
  .sort()
  .forEach(function (f) { require(path.join(ROOT, "assets", "js", "data", f)); });
var OLD = {};
Object.keys(global.window.GH_TRENDING || {}).forEach(function (k) {
  var d = global.window.GH_TRENDING[k];
  [d.zh, d.global, (d.weekly || {}).zh, (d.weekly || {}).global].forEach(function (list) {
    (list || []).forEach(function (r) {
      var key = r.owner + "/" + r.name;
      if (!OLD[key]) OLD[key] = { tag: r.tag, intro: r.intro };
    });
  });
});

/* ---------- 人工文案 ---------- */
var COPY = require(path.join(__dirname, "copy-" + date + ".json"));

function pick(repo) {
  var c = COPY[repo] || OLD[repo];
  if (!c || !c.intro) throw new Error("缺少文案: " + repo);
  return c;
}

function build(list) {
  return list.map(function (r) {
    var key = r.owner + "/" + r.name;
    var c = pick(key);
    var o = {
      owner: r.owner, name: r.name, lang: r.lang,
      stars: r.stars, today: r.today,
      desc: r.desc,
      intro: c.intro,
      tag: c.tag
    };
    if (IMG[key]) {
      var im = IMG[key];
      if (typeof im === "string") {
        o.img = im;
      } else {
        o.img = im.src;
        o.imgW = im.w;
        o.imgH = im.h;
      }
    }
    return o;
  });
}

function pad(n) { return String(n).padStart(2, "0"); }

var d = new Date(date + "T12:00:00");
var WEEK = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

/* 本周区间：以周日为终点往前推 6 天 */
function weekRange(dt) {
  var end = new Date(dt.getTime());
  var start = new Date(dt.getTime() - 6 * 864e5);
  var f = function (x) { return pad(x.getMonth() + 1) + "." + pad(x.getDate()); };
  return f(start) + " – " + f(end);
}

function weekNo(dt) {
  var t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  var day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}

var dayData = {
  date: date,
  label: d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日",
  weekday: WEEK[d.getDay()],
  collectedAt: cache.collectedAt,
  sources: {
    zh: cache.boards.daily_zh.url,
    global: cache.boards.daily_global.url
  },
  zh: build(cache.boards.daily_zh.list),
  global: build(cache.boards.daily_global.list)
};

/* 当日编者按（可选）：copy 文件里的 _note，缺失时前端回落到固定导语 */
if (COPY._note) dayData.note = COPY._note;

if (cache.boards.weekly_zh) {
  dayData.weekly = {
    label: d.getFullYear() + " 年第 " + weekNo(d) + " 周",
    range: weekRange(d),
    collectedAt: cache.collectedAt,
    sources: {
      zh: cache.boards.weekly_zh.url,
      global: cache.boards.weekly_global.url
    },
    zh: build(cache.boards.weekly_zh.list),
    global: build(cache.boards.weekly_global.list)
  };
}

var head = [
  "/* GitHub Trending 快照 · " + date,
  " * 数据来源：https://github.com/trending?since=daily&spoken_language_code=zh",
  " *           https://github.com/trending?since=daily",
  dayData.weekly ? " *           https://github.com/trending?since=weekly&spoken_language_code=zh" : null,
  dayData.weekly ? " *           https://github.com/trending?since=weekly" : null,
  " * 采集时间：" + cache.collectedAt,
  " * 说明：stars / today 为采集时刻页面展示值（weekly 段的 today 为本周新增星标）；",
  " *       intro 为基于 README 的导读（全球版为中文编译）；img 为 README 配图转存后的本地 jpg。",
  " * 由 tools/build-data.js 生成，请勿手工编辑。",
  " */",
  "window.GH_TRENDING = window.GH_TRENDING || {};",
  ""
].filter(Boolean).join("\n");

var body = "window.GH_TRENDING[\"" + date + "\"] = " +
  JSON.stringify(dayData, null, 1)
    .replace(/^/gm, "")
  + ";\n";

var out = path.join(ROOT, "assets", "js", "data", date + ".js");
fs.writeFileSync(out, head + "\n" + body, "utf8");

console.log(out);
console.log("zh=" + dayData.zh.length + " global=" + dayData.global.length +
  " weekly=" + (dayData.weekly ? dayData.weekly.zh.length + "/" + dayData.weekly.global.length : "-") +
  " img=" + Object.keys(IMG).length);
