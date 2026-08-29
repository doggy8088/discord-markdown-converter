/*!
 * Discord Markdown 轉換器 — 核心轉換邏輯
 * 將標準 Markdown 轉換為 Discord 頻道適用的 Markdown 格式。
 *
 * 轉換規則：
 *   1. Markdown 表格 → 清單格式（Discord 不支援表格）
 *   2. 移除水平分隔線（--- / *** / ___）
 *   3. 標題前後不加空白行
 *   4. 清單前後不加空白行
 *   5. 引用（>）前後不加空白行
 *   6. LaTeX 數學語法（$\rightarrow$ 等）轉換為 Emoji 或 Unicode 符號（Discord 不支援）
 *   7. H4 以上標題整體降級為 ###（Discord 僅支援 H1–H3），可統計警告數量
 *
 * MIT License © 2026 Will 保哥
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DiscordMarkdown = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF]/;

  var HEADING_RE = /^ {0,3}#{1,6}(?:\s|$)/;
  var LIST_RE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
  var QUOTE_RE = /^ {0,3}>/;
  var FENCE_RE = /^ {0,3}(?:```|~~~)/;
  var HR_RE = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

  function isHeading(line) { return HEADING_RE.test(line); }
  function isListItem(line) { return LIST_RE.test(line); }
  function isQuote(line) { return QUOTE_RE.test(line); }
  function isFence(line) { return FENCE_RE.test(line); }
  function isBlank(line) { return line.trim() === ""; }
  function isSpecial(line) { return isHeading(line) || isListItem(line) || isQuote(line); }

  function isHR(line) {
    var t = line.trim();
    return !!t && t.indexOf("|") === -1 && HR_RE.test(t);
  }

  function isTableDelimiter(line) {
    var t = line.trim();
    if (t.indexOf("-") === -1 || t.indexOf("|") === -1) return false;
    return /^[|:\-\s]+$/.test(t);
  }

  /* 依未轉義的 | 切分儲存格，並將 \| 還原為 | */
  function splitCells(line) {
    var t = line.trim();
    if (t.charCodeAt(0) === 0x7c) t = t.slice(1); // 去掉行首 |
    if (t.slice(-1) === "|" && t.slice(-2) !== "\\|") t = t.slice(0, -1); // 去掉行尾 |
    var cells = [];
    var cur = "";
    for (var k = 0; k < t.length; k++) {
      var ch = t[k];
      if (ch === "\\" && t[k + 1] === "|") { cur += "|"; k++; continue; }
      if (ch === "|") { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells.map(function (c) { return c.trim(); });
  }

  /* 若整個字串被 ** 包住，拆掉外層粗體（清單項目的標題已是粗體，避免重複強調） */
  function stripFullBold(s) {
    var m = /^\*\*([\s\S]+)\*\*$/.exec(s);
    return m ? m[1].trim() : s;
  }

  /* 標題尾端的括號註記移出粗體，例：「總花費 (USD)」→「**總花費**（USD）」 */
  function formatHeader(header) {
    var m = /^(.*?)\s*[（(]([^（）()]*)[)）]$/.exec(header);
    if (m && m[1].trim() && m[2].length <= 16) {
      return { core: m[1].trim(), suffix: "（" + m[2] + "）" };
    }
    return { core: header, suffix: "" };
  }

  /* LaTeX 數學語法 → Emoji / Unicode 符號（Discord 不支援 LaTeX） */
  var LATEX_MAP = {
    /* 箭頭 */
    to: "➡️", rightarrow: "➡️", longrightarrow: "➡️",
    gets: "⬅️", leftarrow: "⬅️", longleftarrow: "⬅️",
    Rightarrow: "⇒", Longrightarrow: "⇒", Leftarrow: "⇐", Longleftarrow: "⇐",
    leftrightarrow: "↔️", Leftrightarrow: "⇔", updownarrow: "↕️",
    uparrow: "⬆️", downarrow: "⬇️", Updownarrow: "⇕",
    mapsto: "↦", nearrow: "↗️", searrow: "↘️", swarrow: "↙️", nwarrow: "↖️",
    hookrightarrow: "↪", hookleftarrow: "↩",
    /* 關係與比較 */
    infty: "∞", approx: "≈", neq: "≠", ne: "≠",
    leq: "≤", le: "≤", geq: "≥", ge: "≥", equiv: "≡", simeq: "≃", cong: "≅",
    sim: "∼", propto: "∝", prec: "≺", succ: "≻",
    /* 運算 */
    times: "×", div: "÷", pm: "±", mp: "∓", cdot: "·", ast: "∗",
    oplus: "⊕", ominus: "⊖", otimes: "⊗", oslash: "⊘", circledast: "⊛",
    sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮",
    /* 集合與邏輯 */
    in: "∈", notin: "∉", ni: "∋",
    subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇",
    nsubseteq: "⊈", nsupseteq: "⊉",
    cup: "∪", cap: "∩", setminus: "∖", emptyset: "∅", varnothing: "∅",
    forall: "∀", exists: "∃", nexists: "∄", neg: "¬", lnot: "¬",
    land: "∧", wedge: "∧", lor: "∨", vee: "∨",
    /* 幾何與雜項 */
    perp: "⊥", parallel: "∥", angle: "∠", triangle: "△", square: "□",
    bullet: "•", circ: "○", star: "★", dagger: "†", ddagger: "‡",
    checkmark: "✓", surd: "√", partial: "∂", nabla: "∇", hbar: "ℏ", ell: "ℓ",
    aleph: "ℵ", Re: "ℜ", Im: "ℑ", prime: "′", degree: "°", deg: "°",
    cdots: "⋯", ldots: "…", dots: "…", vdots: "⋮", ddots: "⋱",
    /* 撲克牌 */
    clubsuit: "♣", diamondsuit: "♦", heartsuit: "♥", spadesuit: "♠",
    /* 希臘字母（小寫） */
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
    zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
    lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π", varpi: "ϖ",
    rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ",
    phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
    /* 希臘字母（大寫） */
    Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
    Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
    /* 貨幣與符號 */
    pounds: "£", copyright: "©", register: "®", trademark: "™", sqrt: "√"
  };

  function replaceLatexLine(line, stats) {
    if (line.indexOf("$") === -1 || line.indexOf("\\") === -1) return line;
    var out = line;
    var replace = function (m, cmd) {
      var rep = LATEX_MAP[cmd];
      if (rep == null) return m; /* 無對應符號者保持原樣 */
      stats.latex += 1;
      return rep;
    };
    /* $$顯示數學$$ 優先處理 */
    out = out.replace(/\$\$\s*\\([a-zA-Z]+)\s*\$\$/g, replace);
    out = out.replace(/\$\s*\\([a-zA-Z]+)\s*\$/g, replace);
    /* \sqrt{x} → √x */
    out = out.replace(/\$\s*\\sqrt\s*\{([^{}]*)\}\s*\$/g, function (m, inner) {
      stats.latex += 1;
      return "√" + inner;
    });
    /* \text{...} 等文字命令 → 取出內容 */
    out = out.replace(/\$\s*\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|textbf|textit|texttt)\s*\{([^{}]*)\}\s*\$/g, function (m, inner) {
      stats.latex += 1;
      return inner;
    });
    return out;
  }

  function convertTable(headers, rows, stats) {
    stats.tables += 1;
    var hasCJK = false;
    headers.forEach(function (h) { if (CJK_RE.test(h)) hasCJK = true; });
    rows.forEach(function (r) { r.forEach(function (c) { if (CJK_RE.test(c)) hasCJK = true; }); });
    var colon = hasCJK ? "：" : ": ";

    function item(h, v) {
      var fh = formatHeader(stripFullBold(String(h == null ? "" : h)));
      var value = stripFullBold(String(v == null ? "" : v)).trim();
      if (!fh.core && !value) return null;
      if (!fh.core) return value;
      if (!value) return "**" + fh.core + "**" + fh.suffix;
      return "**" + fh.core + "**" + fh.suffix + colon + value;
    }

    var out = [];
    if (rows.length === 1) {
      var row = rows[0];
      for (var j = 0; j < Math.max(headers.length, row.length); j++) {
        var it = item(headers[j], row[j]);
        if (it) out.push("- " + it);
      }
    } else {
      rows.forEach(function (row) {
        var top = item(headers[0], row[0]);
        if (top) out.push("- " + top);
        for (var j2 = 1; j2 < Math.max(headers.length, row.length); j2++) {
          var sub = item(headers[j2], row[j2]);
          if (sub) out.push("  - " + sub);
        }
      });
    }
    return out;
  }

  function clampHeading(line) {
    var m = /^( {0,3})(#{1,6})(\s)/.exec(line);
    if (m && m[2].length > 3) return m[1] + "###" + line.slice(m[0].length - 1);
    return line;
  }

  /**
   * 將標準 Markdown 轉換為 Discord 適用的 Markdown。
   * @param {string} input 原始 Markdown 文字
   * @param {object} [options] { clampHeadings: boolean } 是否將 H4 以上標題降級為 ###（預設 true）
   * @returns {{ markdown: string, stats: { tables: number, hr: number, blanks: number, headingsClamped: number, latex: number } }}
   */
  function convert(input, options) {
    var opts = options || {};
    if (opts.clampHeadings === undefined) opts.clampHeadings = true; /* Discord 僅支援 H1–H3 */
    var stats = { tables: 0, hr: 0, blanks: 0, headingsClamped: 0, latex: 0 };
    var text = String(input == null ? "" : input).replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").replace(/\n+$/, "");
    var lines = text.split("\n");

    /* Pass 1：表格 → 清單、移除水平分隔線、（選配）標題壓縮 */
    var transformed = [];
    var inFence = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (isFence(line)) { inFence = !inFence; transformed.push(line); continue; }
      if (inFence) { transformed.push(line); continue; }

      line = replaceLatexLine(line, stats); /* LaTeX → Emoji / Unicode */

      if (isHR(line)) { stats.hr += 1; continue; }

      if (isHeading(line) && opts.clampHeadings) {
        var clamped = clampHeading(line);
        if (clamped !== line) stats.headingsClamped += 1;
        transformed.push(clamped);
        continue;
      }

      if (!isBlank(line) && line.indexOf("|") !== -1 && !isHeading(line) &&
          i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
        var headers = splitCells(line);
        var rows = [];
        var j = i + 2;
        while (j < lines.length && !isBlank(lines[j]) && lines[j].indexOf("|") !== -1 && !isFence(lines[j])) {
          rows.push(splitCells(lines[j]));
          j++;
        }
        Array.prototype.push.apply(transformed, convertTable(headers, rows, stats));
        i = j - 1;
        continue;
      }

      transformed.push(line);
    }

    /* Pass 2：移除標題／清單／引用前後的空白行（程式碼圍欄內容不受影響） */
    var out = [];
    var pendingBlank = false;
    var fence = false;
    for (var k = 0; k < transformed.length; k++) {
      var ln = transformed[k];
      if (isFence(ln)) {
        if (pendingBlank && out.length > 0) out.push("");
        pendingBlank = false;
        out.push(ln);
        fence = !fence;
        continue;
      }
      if (fence) { out.push(ln); continue; }
      if (isBlank(ln)) { pendingBlank = true; stats.blanks += 1; continue; }
      var special = isSpecial(ln);
      if (special || (out.length > 0 && isSpecial(out[out.length - 1]))) {
        out.push(ln); /* 前面的空白行直接丟棄 */
      } else {
        if (pendingBlank && out.length > 0) { out.push(""); stats.blanks -= 1; }
        out.push(ln);
      }
      pendingBlank = false;
    }

    return { markdown: out.join("\n"), stats: stats };
  }

  return { convert: convert };
});