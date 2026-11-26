/* ==========================================================================
   开源日报 · renderer
   数据以 window.GH_TRENDING[date] 形式由 data/*.js 注入（无需 fetch，file:// 可用）
   ========================================================================== */

(function () {
  "use strict";

  var DATA = window.GH_TRENDING || {};

  var LANG_COLOR = {
    Python: "#3572A5", JavaScript: "#e3c53f", TypeScript: "#3178C6",
    Go: "#00ADD8", Java: "#B07219", C: "#5b5b5b", "C++": "#F34B7D",
    HTML: "#E34C26", Shell: "#89E051", Markdown: "#083FA1",
    Rust: "#DEA584", CSS: "#563d7c", Vue: "#41b883", Ruby: "#701516",
    PHP: "#4F5D95", Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB"
  };

  var state = { date: null, view: "all", q: "", period: "daily" };

  /* 某一天在「日报 / 周报」周期下的数据体；周报缺失时返回 null */
  function setOf(date) {
    var day = DATA[date];
    if (!day) return null;
    return state.period === "weekly" ? (day.weekly || null) : day;
  }

  function dateKeys() {
    return Object.keys(DATA)
      .filter(function (k) { return state.period === "weekly" ? !!DATA[k].weekly : true; })
      .sort().reverse();
  }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(n) { return Number(n || 0).toLocaleString("en-US"); }

  function repoUrl(r) { return "https://github.com/" + r.owner + "/" + r.name; }

  /* 长仓库名在窄屏会从单词中间断开，改成只在 / - _ . 之后折行 */
  function wrappable(s) {
    return esc(s).replace(/([/\-_.])/g, "$1<wbr>");
  }

  var TINTS = [
    ["#efe6d6", "#8a6b3f"], ["#e6e9ef", "#4a5c7a"], ["#f0e2dc", "#9c5540"],
    ["#e7ece4", "#4f6b52"], ["#ece6ef", "#6b5377"], ["#f2ebd9", "#8a7440"]
  ];

  function tintOf(r) {
    var s = r.owner + r.name, n = 0;
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i);
    return TINTS[n % TINTS.length];
  }

  function langDot(lang) {
    var c = LANG_COLOR[lang] || "#8b8375";
    return '<span class="dot" style="background:' + c + '"></span>';
  }

  function monoHTML(r, t) {
    return '<div class="media-fallback mono" style="--fb-bg:' + t[0] + ";--fb-ink:" + t[1] + '">' +
      "<b>" + esc((r.name.charAt(0) || "?").toUpperCase()) + "</b></div>";
  }

  function coverHTML(r, t) {
    return '<div class="media-fallback cover" style="--fb-bg:' + t[0] + ";--fb-ink:" + t[1] + '">' +
      '<span class="cover-owner">' + esc(r.owner) + "</span>" +
      '<b class="cover-name">' + esc(r.name) + "</b>" +
      '<span class="cover-foot">github · trending</span>' +
    "</div>";
  }

  /* 有 README 截图时用图，否则用排版式书封 / 字母牌兜底。
     长条形 logo（宽高比偏离 16:9）改用 contain，避免被裁成半截文字。 */
  function mediaHTML(r, cls, mode) {
    var t = tintOf(r);
    var fb = mode === "feat" ? coverHTML(r, t) : monoHTML(r, t);
    var ratio = r.imgW && r.imgH ? r.imgW / r.imgH : 16 / 9;
    var fit = ratio < 1.35 || ratio > 2.05 ? " fit-contain" : "";
    var img = r.img
      ? '<img src="' + esc(r.img) + '" alt="' + esc(r.owner + "/" + r.name) + ' 预览图" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
      : "";
    return '<div class="' + cls + (r.img ? " has-img" : "") + (r.img ? fit : "") + '">' + fb + img + "</div>";
  }

  function bindImages(root) {
    $$("img", root).forEach(function (img) {
      var done = function () { img.classList.add("is-ready"); };
      if (img.complete && img.naturalWidth > 0) { done(); return; }
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", function () {
        img.remove();
      }, { once: true });
    });
  }

  function matches(r) {
    if (!state.q) return true;
    var hay = [r.owner, r.name, r.desc, r.intro, r.tag, r.lang].join(" ").toLowerCase();
    return hay.indexOf(state.q) !== -1;
  }

  function featHTML(r, i, gl) {
    return '<a class="feat reveal" href="' + repoUrl(r) + '" target="_blank" rel="noopener noreferrer">' +
      mediaHTML(r, "feat-media", "feat") +
      '<span class="rank-badge">NO.' + String(i + 1).padStart(2, "0") + "</span>" +
      '<div class="feat-body">' +
        '<h3 class="repo-name"><span class="owner">' + esc(r.owner) + " /</span> " + esc(r.name) +
          '<span class="arrow">↗</span></h3>' +
        '<p class="feat-desc">' + esc(r.desc) + "</p>" +
        '<p class="feat-intro"><span class="intro-k">导读</span>' + esc(r.intro) + "</p>" +
        '<div class="feat-foot">' +
          '<span class="lang">' + langDot(r.lang) + esc(r.lang) + "</span>" +
          '<span class="tag">' + esc(r.tag) + "</span>" +
          '<span class="stars"><span class="n">' + num(r.stars) + '</span>stars <span class="today">+' + num(r.today) + "</span>" + gl + "</span>" +
        "</div>" +
      "</div>" +
    "</a>";
  }

  function rowHTML(r, i, gl) {
    return '<a class="row reveal" href="' + repoUrl(r) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="row-rank">' + String(i + 1).padStart(2, "0") + "</span>" +
      mediaHTML(r, "row-thumb", "row") +
      '<div class="row-main">' +
        '<h3 class="repo-name"><span class="owner">' + esc(r.owner) + " /</span> " + esc(r.name) +
          '<span class="arrow">↗</span></h3>' +
        '<p class="row-desc">' + esc(r.desc) + "</p>" +
        '<p class="row-intro"><span class="intro-k">导读</span>' + esc(r.intro) + "</p>" +
        '<div class="row-tags">' +
          '<span class="lang">' + langDot(r.lang) + esc(r.lang) + "</span>" +
          '<span class="tag">' + esc(r.tag) + "</span>" +
        "</div>" +
      "</div>" +
      '<div class="row-side">' +
        '<span class="stars"><span class="n">' + num(r.stars) + '</span>stars</span>' +
        '<span class="stars"><span class="today">+' + num(r.today) + "</span>" + gl + "</span>" +
      "</div>" +
    "</a>";
  }

  function boardHTML(list, gl) {
    if (!list.length) {
      return '<div class="empty">没有匹配的项目 · 换个关键词试试</div>';
    }
    var head = list.slice(0, 3);
    var rest = list.slice(3);

    var html = '<div class="featured">' + head.map(function (r, i) { return featHTML(r, i, gl); }).join("") + "</div>";

    if (rest.length) {
      html += '<div class="rows">' + rest.map(function (r, i) { return rowHTML(r, i + 3, gl); }).join("") + "</div>";
    }
    return html;
  }

  function sectionHTML(id, kicker, title, en, note, src, list, gl) {
    return '<section class="board" id="board-' + id + '" data-board="' + id + '">' +
      '<div class="section-head">' +
        '<div class="section-lead">' +
          '<span class="section-num">' + kicker + "</span>" +
          '<h2 class="section-title"><span class="cn">' + title + '</span><span class="en">' + en + "</span></h2>" +
          '<p class="section-note">' + esc(note) + "</p>" +
        "</div>" +
        '<a class="src-link" href="' + esc(src) + '" target="_blank" rel="noopener noreferrer">查看原始榜单 ↗</a>' +
      "</div>" +
      boardHTML(list, gl) +
    "</section>";
  }

  function render() {
    var day = DATA[state.date];
    var set = setOf(state.date);
    if (!day || !set) return;

    var weekly = state.period === "weekly";
    var gl = weekly ? "本周" : "今日";

    $("#hero-title-cn").textContent = weekly ? "开源周报" : "开源日报";
    $("#hero-date").textContent = weekly ? set.range : day.date.replace(/-/g, ".");
    $("#hero-stamp").textContent = weekly ? "WEEKLY" : "DAILY";
    $("#hero-kicker").textContent = weekly
      ? "GitHub Trending · Weekly Roll-up"
      : "GitHub Trending · Daily Snapshot";
    $("#hero-label").textContent = weekly
      ? day.label + " · " + set.label + "（" + set.range + "）"
      : day.label + " · " + day.weekday;
    $("#hero-collected").textContent = set.collectedAt || day.collectedAt;
    $("#lab-gain").textContent = weekly ? "本周新增星标" : "今日新增星标";
    $("#lab-top").textContent = weekly ? "本周领跑" : "今日领跑";

    var noteWrap = $("#hero-note");
    if (noteWrap) {
      var note = weekly ? "" : (day.note || "");
      $("#hero-note-text").textContent = note;
      $("#hero-note-k").textContent = weekly ? "本周观察" : "今日观察";
      noteWrap.hidden = !note;
    }

    var zh = set.zh.filter(matches);
    var gl_ = set.global.filter(matches);
    var since = weekly ? "since=weekly" : "since=daily";

    var host = $("#boards");
    host.innerHTML =
      sectionHTML("zh", "Folio 01", "中文版", "Chinese Repositories",
        "spoken_language_code=zh · " + since + " · 按 GitHub 榜单顺序排列 · " + zh.length + " 个仓库",
        set.sources.zh, zh, gl) +
      sectionHTML("global", "Folio 02", "全球版", "Global Repositories",
        since + " · 按 GitHub 榜单顺序排列 · " + gl_.length + " 个仓库",
        set.sources.global, gl_, gl);

    bindImages(host);
    applyView();
    observeReveal();
    renderStats(set, set.zh.length + set.global.length, weekly);
  }

  function applyView() {
    $$(".board").forEach(function (b) {
      b.hidden = state.view !== "all" && b.dataset.board !== state.view;
    });
  }

  function observeReveal() {
    var els = $$(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach(function (e) { io.observe(e); });
  }

  function renderStats(day, shown, weekly) {
    var all = day.zh.concat(day.global);
    var total = all.reduce(function (s, r) { return s + (r.today || 0); }, 0);
    var top = all.slice().sort(function (a, b) { return b.today - a.today; })[0];
    var word = weekly ? "本周" : "今日";

    $("#stat-count").innerHTML = shown + "<small>个</small>";
    $("#stat-gain").innerHTML = "+" + num(total) + "<small>stars</small>";
    $("#stat-top").innerHTML = '<a href="' + repoUrl(top) + '" target="_blank" rel="noopener noreferrer">' +
      wrappable(top.owner + "/" + top.name) + "</a>";
    $("#stat-top-note").textContent = word + " +" + num(top.today) + " · " + top.tag;

    $("#result-count").textContent = state.q
      ? shown + " 个匹配结果"
      : day.zh.length + " + " + day.global.length + " 个仓库";
  }

  function fillDates() {
    var keys = dateKeys();
    var sel = $("#date-select");
    sel.innerHTML = keys.map(function (k) {
      return '<option value="' + k + '">' + k + "</option>";
    }).join("");
    sel.value = state.date;
  }

  /* 周报按钮：只有存在周报数据时才出现 */
  function syncPeriods() {
    var hasWeekly = Object.keys(DATA).some(function (k) { return !!DATA[k].weekly; });
    $$(".period").forEach(function (btn) {
      var on = btn.dataset.period === state.period;
      btn.setAttribute("aria-selected", String(on));
      if (btn.dataset.period === "weekly") btn.hidden = !hasWeekly;
    });
  }

  function readUrl() {
    var p = new URLSearchParams(location.search);
    var d = p.get("date");
    var v = p.get("view");
    var period = p.get("period");
    state.period = period === "weekly" ? "weekly" : "daily";
    var keys = dateKeys();
    state.date = DATA[d] && keys.indexOf(d) !== -1 ? d : keys[0];
    state.view = ["zh", "global"].indexOf(v) !== -1 ? v : "all";
  }

  function writeUrl() {
    var p = new URLSearchParams(location.search);
    p.set("date", state.date);
    if (state.period === "weekly") { p.set("period", "weekly"); } else { p.delete("period"); }
    if (state.view === "all") { p.delete("view"); } else { p.set("view", state.view); }
    try {
      history.replaceState(null, "", location.pathname + "?" + p.toString());
    } catch (e) { /* file:// 下静默失败 */ }
  }

  function init() {
    if (!Object.keys(DATA).length) {
      $("#boards").innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }
    readUrl();
    fillDates();
    syncPeriods();

    $$(".period").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (state.period === btn.dataset.period) return;
        state.period = btn.dataset.period;
        var keys = dateKeys();
        if (keys.indexOf(state.date) === -1) state.date = keys[0];
        syncPeriods();
        fillDates();
        render();
        writeUrl();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    $$(".mode").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.view = btn.dataset.view;
        $$(".mode").forEach(function (b) {
          b.setAttribute("aria-selected", String(b === btn));
        });
        applyView();
        writeUrl();
        var y = $(".board:not([hidden])");
        if (state.view !== "all" && y) {
          var top = y.getBoundingClientRect().top + window.scrollY - 78;
          window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        }
      });
    });

    $$(".mode").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.dataset.view === state.view));
    });

    $("#date-select").addEventListener("change", function (e) {
      state.date = e.target.value;
      render();
      writeUrl();
    });

    var input = $("#search");
    if (input) {
      input.addEventListener("input", function (e) {
        state.q = e.target.value.trim().toLowerCase();
        render();
      });
    }

    render();

    if (state.view !== "all") {
      var b = $('.board[data-board="' + state.view + '"]');
      if (b) b.hidden = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
