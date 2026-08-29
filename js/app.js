/*!
 * Discord Markdown 轉換器 — 頁面互動邏輯
 * MIT License © 2026 Will 保哥
 */
(function () {
  "use strict";

  function $(sel) { return document.querySelector(sel); }

  var DISCORD_LIMIT = 2000;    /* Discord 一般會員單則訊息上限 */
  var DISCORD_LIMIT_NITRO = 4000; /* Nitro 會員上限 */

  var root = document.documentElement;
  var themeBtn = $("#theme-toggle");
  var inputEl = $("#input");
  var outputEl = $("#output");
  var convertBtn = $("#convert");
  var clampEl = $("#clamp-headings");
  var statsBar = $("#stats-bar");
  var warningBar = $("#warning-bar");
  var inputCount = $("#input-count");
  var outputCount = $("#output-count");
  var limitBadge = $("#limit-badge");
  var convertTooltip = $("#convert-tooltip");
  var toastEl = null;
  var debounceTimer = null;

  /* ---------- 作業系統快捷鍵偵測 ---------- */
  var isMac = false;
  try {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      isMac = /Mac/i.test(navigator.userAgentData.platform);
    } else {
      isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent || "");
    }
  } catch (e) {
    isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || "");
  }
  var shortcutText = isMac ? "Cmd + Enter" : "Ctrl + Enter";
  var tooltipText = "轉換（" + shortcutText + "）";
  if (convertTooltip) convertTooltip.textContent = tooltipText;
  if (convertBtn) convertBtn.setAttribute("aria-label", tooltipText);

  /* ---------- 主題切換 ---------- */
  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    try { localStorage.setItem("dmc-theme", theme); } catch (e) { /* 忽略 */ }
  }
  themeBtn.addEventListener("click", function () {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
  });

  /* ---------- 選項持久化 ---------- */
  try {
    var savedClamp = localStorage.getItem("dmc-clamp");
    if (savedClamp === "0") clampEl.checked = false;
  } catch (e) { /* 忽略 */ }
  clampEl.addEventListener("change", function () {
    try { localStorage.setItem("dmc-clamp", clampEl.checked ? "1" : "0"); } catch (e) { /* 忽略 */ }
    if (inputEl.value.trim()) {
      clearTimeout(debounceTimer);
      doConvert();
    }
  });

  /* ---------- 轉換 ---------- */
  function doConvert() {
    clearTimeout(debounceTimer);
    if (!inputEl.value.trim()) {
      outputEl.value = "";
      statsBar.textContent = "";
      warningBar.hidden = true;
      updateCounters();
      return;
    }
    var result = DiscordMarkdown.convert(inputEl.value, {
      clampHeadings: clampEl.checked
    });
    outputEl.value = result.markdown;
    renderStats(result.stats);
    updateCounters();
  }

  function scheduleConvert() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      doConvert();
    }, 500);
  }

  function renderStats(s) {
    var parts = [];
    if (s.tables) parts.push("表格轉清單 × " + s.tables);
    if (s.hr) parts.push("移除分隔線 × " + s.hr);
    if (s.blanks) parts.push("清除空白行 × " + s.blanks);
    if (s.latex) parts.push("LaTeX 符號轉換 × " + s.latex);
    if (s.headingsClamped) parts.push("標題降級 × " + s.headingsClamped);
    if (s.fileLinks) parts.push("移除 file:// 連結 × " + s.fileLinks);
    statsBar.textContent = parts.length ? "轉換完成：" + parts.join("、") : "轉換完成：內容已符合 Discord 格式";

    if (s.headingsClamped > 0) {
      warningBar.textContent =
        "⚠️ Discord 僅支援 H1–H3 標題，已自動將 " + s.headingsClamped +
        " 個 H4 以上標題降級為 ###（可於上方選項關閉）。";
      warningBar.hidden = false;
    } else {
      warningBar.hidden = true;
    }
  }

  /* ---------- 字數統計與 Discord 上限提醒 ---------- */
  function updateCounters() {
    var inLen = inputEl.value.length;
    var outLen = outputEl.value.length;
    inputCount.textContent = inLen.toLocaleString("zh-Hant") + " 字元";
    outputCount.textContent = outLen.toLocaleString("zh-Hant") + " 字元";

    if (!outLen) {
      limitBadge.hidden = true;
      return;
    }
    limitBadge.hidden = false;
    limitBadge.className = "limit-badge";
    if (outLen > DISCORD_LIMIT) {
      limitBadge.classList.add("over");
      limitBadge.textContent =
        "超過 " + DISCORD_LIMIT.toLocaleString("zh-Hant") + " 字元上限（Nitro 為 " +
        DISCORD_LIMIT_NITRO.toLocaleString("zh-Hant") + "），建議分段傳送";
    } else if (outLen > DISCORD_LIMIT * 0.9) {
      limitBadge.classList.add("warn");
      limitBadge.textContent = "接近 " + DISCORD_LIMIT.toLocaleString("zh-Hant") + " 字元上限";
    } else {
      limitBadge.textContent = "在 Discord 訊息上限內 ✔";
    }
  }

  inputEl.addEventListener("input", function () {
    updateCounters();
    if (!inputEl.value.trim()) {
      clearTimeout(debounceTimer);
      outputEl.value = "";
      statsBar.textContent = "";
      warningBar.hidden = true;
      updateCounters();
      return;
    }
    scheduleConvert();
  });

  convertBtn.addEventListener("click", function () {
    doConvert();
    if (inputEl.value.trim()) toast("已轉換 ✔");
  });

  /* Ctrl / Cmd + Enter 快速轉換 */
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      doConvert();
      if (inputEl.value.trim()) toast("已轉換 ✔");
    }
  });

  /* ---------- 複製 ---------- */
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
  }

  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
    } else {
      legacyCopy(text, done);
    }
  }
  function legacyCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("複製失敗，請手動選取"); }
    document.body.removeChild(ta);
  }

  $("#copy-output").addEventListener("click", function () {
    if (!outputEl.value) { toast("請先轉換內容"); return; }
    copyText(outputEl.value, function () { toast("已複製到剪貼簿 📋"); });
  });

  /* ---------- 下載 ---------- */
  $("#download-output").addEventListener("click", function () {
    if (!outputEl.value) { toast("請先轉換內容"); return; }
    var blob = new Blob([outputEl.value], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "discord-markdown.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("已下載 discord-markdown.md 💾");
  });

  /* ---------- 範例與清空 ---------- */
  $("#load-sample").addEventListener("click", function () {
    var sample = document.getElementById("sample-markdown").textContent;
    inputEl.value = sample.replace(/^\n+/, "").replace(/\s+$/, "");
    doConvert();
    toast("已載入範例 📄");
  });

  $("#clear-input").addEventListener("click", function () {
    inputEl.value = "";
    outputEl.value = "";
    statsBar.textContent = "";
    warningBar.hidden = true;
    updateCounters();
    inputEl.focus();
  });

  updateCounters();
})();