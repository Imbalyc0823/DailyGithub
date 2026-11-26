#!/usr/bin/env node
/**
 * 把某一日的趋势数据导出为 Markdown 文档（日报 / 周报各一份）。
 *
 * 用法：
 *   node tools/build-report.js                          # 最新一天，日报 + 周报
 *   node tools/build-report.js 2026-11-22               # 指定日期
 *   node tools/build-report.js 2026-11-22 --period=daily
 *
 * 输出：reports/github-trending-<YYYYMMDD>-<HHmmss>.md
 *       reports/github-trending-weekly-<YYYYMMDD>-<HHmmss>.md
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var DATA_DIR = path.join(ROOT, "assets", "js", "data");
var OUT_DIR = path.join(ROOT, "reports");

global.window = {};
fs.readdirSync(DATA_DIR)
  .filter(function (f) { return /^\d{4}-\d{2}-\d{2}\.js$/.test(f); })
  .sort()
  .forEach(function (f) { require(path.join(DATA_DIR, f)); });

var DB = global.window.GH_TRENDING || {};
var keys = Object.keys(DB).sort().reverse();
if (!keys.length) { console.error("没有找到任何日期数据"); process.exit(1); }

var date = process.argv[2] && DB[process.argv[2]] ? process.argv[2] : keys[0];
var day = DB[date];
var only = (process.argv.find(function (a) { return a.indexOf("--period=") === 0; }) || "").split("=")[1];

function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) {
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
function n(v) { return Number(v || 0).toLocaleString("en-US"); }
function repoUrl(r) { return "https://github.com/" + r.owner + "/" + r.name; }
function sum(list, f) { return list.reduce(function (s, x) { return s + (x[f] || 0); }, 0); }

function table(list, gainWord) {
  var rows = list.map(function (r, i) {
    return "| " + (i + 1) + " | [" + r.owner + "/" + r.name + "](" + repoUrl(r) + ") | " +
      (r.lang || "—") + " | " + n(r.stars) + " | +" + n(r.today) + " | " + r.tag + " |";
  });
  return [
    "| # | 仓库 | 语言 | 星标 | " + gainWord + " | 一句话 |",
    "| --- | --- | --- | ---: | ---: | --- |"
  ].concat(rows).join("\n");
}

function details(list, gainWord) {
  return list.map(function (r, i) {
    var out = [];
    out.push("### " + (i + 1) + ". " + r.owner + " / " + r.name);
    out.push("");
    out.push("> " + (r.desc || "（仓库无描述）"));
    out.push("");
    if (r.img) {
      out.push("![" + r.owner + "/" + r.name + " README 配图](../" + r.img + ")");
      out.push("");
    }
    out.push("**导读**：" + r.intro);
    out.push("");
    out.push("- 语言：" + (r.lang || "—"));
    out.push("- 星标：" + n(r.stars) + "（" + gainWord + " +" + n(r.today) + "）");
    out.push("- 标签：" + r.tag);
    out.push("- 仓库：<" + repoUrl(r) + ">");
    out.push("");
    return out.join("\n");
  }).join("\n");
}

function build(period) {
  var set = period === "weekly" ? day.weekly : day;
  if (!set) return null;

  var isWeekly = period === "weekly";
  var gainWord = isWeekly ? "本周" : "今日";
  var all = set.zh.concat(set.global);
  var top = all.slice().sort(function (a, b) { return b.today - a.today; }).slice(0, 5);
  var stamp2 = stamp(new Date());

  var lines = [
    "# GitHub Trending " + (isWeekly ? "周报" : "日报") + " · " + (isWeekly ? set.label + "（" + set.range + "）" : date),
    "",
    "> " + (isWeekly ? day.label + " " + day.weekday + " · " + set.label + " " + set.range : day.label + " " + day.weekday) +
      " ｜ 采集时间 " + (set.collectedAt || day.collectedAt),
    "> 数据来源：[中文榜](" + set.sources.zh + ") · [全球榜](" + set.sources.global + ")",
    "",
    "共收录 **" + all.length + "** 个仓库（中文版 " + set.zh.length + "，全球版 " + set.global.length +
      "），" + gainWord + "新增星标合计 **+" + n(sum(all, "today")) + "**。",
    ""
  ];

  if (!isWeekly && day.note) {
    lines.push("> **编者按 · 今日观察**");
    lines.push("> " + day.note);
    lines.push("");
  }

  lines.push("## " + gainWord + " Top 5（按" + gainWord + "新增星标）");
  lines.push("");

  top.forEach(function (r, i) {
    lines.push((i + 1) + ". **[" + r.owner + "/" + r.name + "](" + repoUrl(r) + ")** — +" +
      n(r.today) + " · " + r.tag);
  });

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 一、中文版 · " + set.zh.length + " 个仓库");
  lines.push("");
  lines.push("来源：<" + set.sources.zh + ">");
  lines.push("");
  lines.push(table(set.zh, gainWord));
  lines.push("");
  lines.push(details(set.zh, gainWord));
  lines.push("---");
  lines.push("");
  lines.push("## 二、全球版 · " + set.global.length + " 个仓库");
  lines.push("");
  lines.push("来源：<" + set.sources.global + ">");
  lines.push("");
  lines.push(table(set.global, gainWord));
  lines.push("");
  lines.push(details(set.global, gainWord));
  lines.push("---");
  lines.push("");
  lines.push("## 说明");
  lines.push("");
  lines.push("- 榜单顺序与字段取自 GitHub Trending " + (isWeekly ? "每周榜（since=weekly）" : "每日榜（since=daily）") +
    "，星标数与「" + gainWord + "新增」为采集时刻页面展示值。");
  lines.push("- 「简介」为仓库在 GitHub 上的原始描述；「导读」为基于 README 的整理与中文编译，非逐字翻译。");
  lines.push("- 配图取自仓库 README，已等比缩放并转存为 jpg（最长边 ≤ 1024px、单张 < 1MB）；文中路径相对于项目根目录，版权归原作者所有。");
  lines.push("- 网页版：打开 `index.html`，右上角切换「日报 / 周报」与日期。");
  lines.push("- 本文档由 `tools/build-report.js` 于 " + new Date().toLocaleString("zh-CN") + " 生成。");
  lines.push("");

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  var name = (isWeekly ? "github-trending-weekly-" : "github-trending-") + stamp2 + ".md";
  var file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, lines.join("\n"), "utf8");
  return file;
}

var out = [];
if (only !== "weekly") { var a = build("daily"); if (a) out.push(a); }
if (only !== "daily" && day.weekly) { var b = build("weekly"); if (b) out.push(b); }
if (!out.length) { console.error("无可导出的周期数据"); process.exit(1); }
console.log(out.join("\n"));
