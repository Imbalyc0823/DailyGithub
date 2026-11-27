#!/usr/bin/env node
/**
 * 采集 GitHub Trending 榜单 + 各仓库 README 摘要与配图。
 *
 *   node tools/collect.js                # 采集 daily(zh/global) + weekly(zh/global)
 *   node tools/collect.js --only=daily   # 只采集日报
 *
 * 产出：tools/.cache/<YYYY-MM-DD>.json（供人工撰写导读、生成数据文件）
 *       tools/.cache/img/<owner__name>.<ext>（原始配图，待 tools/img-to-jpg.py 转换）
 */
"use strict";

var fs = require("fs");
var path = require("path");
var https = require("https");
var dns = require("dns");

/* 本机 DNS 把 raw.githubusercontent.com 解析成 :: / 0.0.0.0（污染），
   而同一 CDN 段的 IP 可直连。这里对这一个域名做固定 IP 解析，其余走系统 DNS。 */
var RAW_HOST = "raw.githubusercontent.com";
var RAW_IPS = ["185.199.111.133", "185.199.108.133", "185.199.109.133", "185.199.110.133"];
var rawIpIdx = 0;

function lookup(hostname, opts, cb) {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  if (hostname === RAW_HOST) {
    var ip = RAW_IPS[rawIpIdx++ % RAW_IPS.length];
    if (opts && opts.all) return cb(null, [{ address: ip, family: 4 }]);
    return cb(null, ip, 4);
  }
  return dns.lookup(hostname, opts, cb);
}

var ROOT = path.resolve(__dirname, "..");
var CACHE = path.join(ROOT, "tools", ".cache");
var IMGDIR = path.join(CACHE, "img");

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var BOARDS = [
  { key: "daily_zh", since: "daily", lang: "zh", url: "https://github.com/trending?since=daily&spoken_language_code=zh" },
  { key: "daily_global", since: "daily", lang: "", url: "https://github.com/trending?since=daily" },
  { key: "weekly_zh", since: "weekly", lang: "zh", url: "https://github.com/trending?since=weekly&spoken_language_code=zh" },
  { key: "weekly_global", since: "weekly", lang: "", url: "https://github.com/trending?since=weekly" }
];

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function get(url, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    var tries = 0;
    (function attempt() {
      var req = https.get(url, {
        headers: { "User-Agent": UA, "Accept": opts.accept || "*/*" },
        rejectUnauthorized: false,
        timeout: 20000,
        lookup: lookup
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && tries < 4) {
          tries++;
          res.resume();
          var next = res.headers.location.indexOf("http") === 0
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          return get(next, opts).then(resolve, reject);
        }
        var chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks), type: res.headers["content-type"] || "" });
        });
      });
      req.on("timeout", function () { req.destroy(new Error("timeout")); });
      req.on("error", function (e) {
        if (tries < 3) { tries++; return setTimeout(attempt, 700 * tries); }
        reject(e);
      });
    })();
  });
}

function decode(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- 榜单解析 ---------- */

function parseTrending(html) {
  var out = [];
  var blocks = html.split('<article class="Box-row"').slice(1);
  blocks.forEach(function (b) {
    var link = /<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"\/]+)\/([^"\/]+)"/.exec(b);
    if (!link) return;
    var owner = link[1], name = link[2];

    var descM = /<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(b);
    var desc = descM ? decode(descM[1]) : "";

    var langM = /itemprop="programmingLanguage">([^<]+)</.exec(b);
    var lang = langM ? decode(langM[1]) : "—";

    var starM = new RegExp('href="/' + owner + '/' + name + '/stargazers"[^>]*>([\\s\\S]*?)</a>').exec(b);
    var stars = starM ? parseInt(decode(starM[1]).replace(/[^\d]/g, ""), 10) || 0 : 0;

    var todayM = /([\d,]+)\s+stars?\s+(?:today|this week)/.exec(decode(b));
    var today = todayM ? parseInt(todayM[1].replace(/,/g, ""), 10) : 0;

    out.push({ owner: owner, name: name, desc: desc, lang: lang, stars: stars, today: today });
  });
  return out;
}

/* ---------- README 抓取 ---------- */

var README_NAMES = ["README.md", "readme.md", "README.MD", "Readme.md", "README.rst", "README_EN.md"];

async function fetchReadme(owner, name) {
  for (var b of ["HEAD", "main", "master"]) {
    for (var f of README_NAMES) {
      var url = "https://raw.githubusercontent.com/" + owner + "/" + name + "/" + b + "/" + f;
      try {
        var r = await get(url, { accept: "text/plain" });
        if (r.status === 200 && r.body.length > 80) {
          return { path: b + "/" + f, text: r.body.toString("utf8") };
        }
      } catch (e) { /* 继续尝试 */ }
    }
  }
  return null;
}

/* 从 README 取：首段正文（去徽章/图片/HTML）+ 第一张可用图片 */
function readmeDigest(md) {
  if (!md) return { excerpt: "", img: "" };

  var text = md.replace(/<!--[\s\S]*?-->/g, "");

  // 图片：优先非徽章（shields / badge / icon）的截图
  var imgs = [];
  var re = /!\[[^\]]*\]\(\s*([^)\s]+)|<img[^>]+src="([^"]+)"/g, m;
  while ((m = re.exec(text))) {
    var src = m[1] || m[2] || "";
    if (!src) continue;
    if (/^data:/.test(src)) continue;
    var low = src.toLowerCase();
    if (/(shields\.io|badge|badgen|travis|codecov|circleci|coveralls|visitor|star-history|profile-count|npmjs\.com\/package|pypi\.org|gitee\.com\/badge)/.test(low)) continue;
    if (/\.(svg)(\?|$)/.test(low)) continue;
    if (/\.(png|jpe?g|gif|webp)(\?|$)/.test(low) || /user-images|user-attachments|githubusercontent|raw\.github/.test(low)) {
      imgs.push(src);
    }
  }

  // 正文：按块切分，取第一段像「介绍」的文字
  var lines = text.split(/\r?\n/);
  var paras = [], buf = [];
  var inFence = false;
  lines.forEach(function (ln) {
    if (/^\s*(```|~~~)/.test(ln)) { inFence = !inFence; }
    var isBlock = inFence || /^\s*$/.test(ln) || /^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>|\||<)/.test(ln) ||
      /^\s*(\[!\[|!\[|<img|<p|<div|<a\s)/i.test(ln) || /^\s*(---|===|\*\*\*)/.test(ln);
    if (isBlock) {
      if (buf.length) { paras.push(buf.join(" ")); buf = []; }
      if (inFence) return;
      if (/^\s*(#{1,6}\s)/.test(ln)) { paras.push("##H " + decode(ln)); }
    } else {
      buf.push(ln.trim());
    }
  });
  if (buf.length) paras.push(buf.join(" "));

  var picked = [];
  paras.forEach(function (p) {
    if (p.indexOf("##H ") === 0) {
      if (picked.length) return;
      var h = p.slice(4);
      if (h.length > 2 && h.length < 90) picked.push("[标题] " + h);
      return;
    }
    var t = decode(p);
    if (t.length < 30) return;
    if (/^(安装|安装方法|Usage|Install|License|贡献|Contributing|Star History|目录|Table of Contents)/i.test(t)) return;
    if (picked.filter(function (x) { return x.indexOf("[标题]") !== 0; }).length >= 2) return;
    picked.push(t.slice(0, 420));
  });

  return { excerpt: picked.join("\n"), img: imgs[0] || "" };
}

function absImg(src, owner, name) {
  if (!src) return "";
  if (/^https?:\/\//.test(src)) return src;
  if (src.indexOf("//") === 0) return "https:" + src;
  var base = "https://raw.githubusercontent.com/" + owner + "/" + name + "/HEAD/";
  return base + src.replace(/^\.?\//, "");
}

async function main() {
  var only = (process.argv.find(function (a) { return a.indexOf("--only=") === 0; }) || "").split("=")[1];
  var today = new Date();
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var dateStr = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());

  fs.mkdirSync(IMGDIR, { recursive: true });

  var boards = BOARDS.filter(function (b) { return !only || b.since === only; });
  var result = { date: dateStr, collectedAt: null, boards: {} };
  var seen = {};

  /* 当 github.com 页面直连不通时，可先用别的通道（WebFetch 等）把两个榜单落成
     { daily_zh: [{owner,name,desc,lang,stars,today}], daily_global: [...] }，
     再用 --boards=<file> 让本脚本只负责 README / 配图。 */
  var boardsFile = (process.argv.find(function (a) { return a.indexOf("--boards=") === 0; }) || "").split("=")[1];

  for (var b of boards) {
    if (boardsFile) {
      var manual = JSON.parse(fs.readFileSync(boardsFile, "utf8"))[b.key] || [];
      result.boards[b.key] = { url: b.url, since: b.since, lang: b.lang, list: manual };
      process.stderr.write("→ " + b.key + " ... " + manual.length + " repos (本地榜单文件)\n");
      manual.forEach(function (x) { seen[x.owner + "/" + x.name] = true; });
      continue;
    }
    process.stderr.write("→ " + b.key + " ... ");
    var r = await get(b.url);
    var list = parseTrending(r.body.toString("utf8"));
    result.boards[b.key] = { url: b.url, since: b.since, lang: b.lang, list: list };
    process.stderr.write(list.length + " repos\n");
    list.forEach(function (x) { seen[x.owner + "/" + x.name] = true; });
    await sleep(400);
  }

  var repos = Object.keys(seen);
  process.stderr.write("\nREADME: " + repos.length + " 个仓库\n");

  var detail = {};
  var reuse = process.argv.indexOf("--reuse-detail") !== -1;
  if (reuse) {
    var cacheFile = path.join(CACHE, dateStr + ".json");
    if (fs.existsSync(cacheFile)) {
      detail = JSON.parse(fs.readFileSync(cacheFile, "utf8")).detail || {};
      process.stderr.write("复用已有 README / 配图缓存：" + Object.keys(detail).length + " 条\n");
    }
  }
  var i = 0;
  for (var repo of repos) {
    if (reuse && detail[repo] && detail[repo].readmePath) continue;
    i++;
    var parts = repo.split("/");
    var info = { readmePath: "", excerpt: "", img: "", imgLocal: "", imgFound: false };
    try {
      var rd = await fetchReadme(parts[0], parts[1]);
      if (rd) {
        info.readmePath = rd.path;
        var d = readmeDigest(rd.text);
        info.excerpt = d.excerpt;
        if (d.img) {
          var url = absImg(d.img, parts[0], parts[1]);
          info.img = url;
          var ext = (/\.(png|jpe?g|gif|webp)/i.exec(url.split("?")[0]) || [, "png"])[1].toLowerCase();
          var fname = parts[0] + "__" + parts[1] + "." + ext;
          var fp = path.join(IMGDIR, fname);
          try {
            var im = await get(url, { accept: "image/*" });
            if (im.status === 200 && im.body.length > 3000 && /image/.test(im.type)) {
              fs.writeFileSync(fp, im.body);
              info.imgFound = true;
              info.imgFile = fname;
              info.imgBytes = im.body.length;
            }
          } catch (e) { /* 图片失败不影响主流程 */ }
        }
      }
    } catch (e) {
      info.error = String(e && e.message || e);
    }
    detail[repo] = info;
    if (i % 8 === 0) process.stderr.write("  " + i + "/" + repos.length + "\n");
    await sleep(120);
  }

  result.collectedAt = dateStr + " " + pad(today.getHours()) + ":" + pad(today.getMinutes()) + " GMT+8";
  result.detail = detail;

  var out = path.join(CACHE, dateStr + ".json");
  fs.writeFileSync(out, JSON.stringify(result, null, 1), "utf8");
  process.stderr.write("\n✓ " + out + "\n");
  process.stdout.write(out + "\n");
}

main().catch(function (e) { console.error(e); process.exit(1); });
