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
 *   8. 移除 file:// 本地檔案連結，僅保留連結文字（Discord 不支援 file:// 協定連結）
 *   9. 程式碼圍欄（結尾須與開頭同字元且不短於開頭）與行內程式碼內容原封不動
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
  var FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
  var HR_RE = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

  function isHeading(line) { return HEADING_RE.test(line); }
  function isListItem(line) { return LIST_RE.test(line); }
  function isQuote(line) { return QUOTE_RE.test(line); }
  function isFence(line) { return FENCE_RE.test(line); }
  /* 圍欄開頭：回傳 { ch, len }；結尾須同字元且長度不短於開頭、整行只有圍欄字元 */
  var QUOTE_PREFIX_RE = /^ {0,3}(?:>\s?)+/;
  /* 圍欄可位於引用內（> ```js），判斷前先去掉 > 前綴 */
  function fenceOpen(raw) {
    var line = raw.replace(QUOTE_PREFIX_RE, "");
    var m = FENCE_RE.exec(line);
    if (!m) return null;
    /* 反引號圍欄的資訊字串不得含反引號（```foo``` 是同一行的行內程式碼，不是圍欄） */
    if (m[1][0] === "`" && line.slice(m[0].length).indexOf("`") !== -1) return null;
    return { ch: m[1][0], len: m[1].length };
  }
  function fenceCloses(raw, fence) {
    var line = raw.replace(QUOTE_PREFIX_RE, "");
    var m = FENCE_RE.exec(line);
    return !!m && m[1][0] === fence.ch && m[1].length >= fence.len && line.trim() === m[1];
  }
  /* 行內程式碼（`…`、``…``）的 [start, end) 區間（CommonMark 規則）：
     區間外的 \ 逸出下一個字元（\` 不是分隔符、\\ 是字面反斜線）；
     區間內的 \ 是字面字元，不逸出反引號；結尾須為等長的反引號串。 */
  function inlineCodeRanges(line) {
    var ranges = [];
    if (line.indexOf("`") === -1) return ranges;
    var n = line.length;
    var i = 0;
    while (i < n) {
      var ch = line[i];
      if (ch === "\\") { i += 2; continue; }
      if (ch !== "`") { i += 1; continue; }
      var len = 0;
      while (line[i + len] === "`") len += 1;
      var j = i + len;
      var closed = false;
      while (j < n) {
        if (line[j] !== "`") { j += 1; continue; }
        var l2 = 0;
        while (line[j + l2] === "`") l2 += 1;
        if (l2 === len) { ranges.push([i, j + l2]); i = j + l2; closed = true; break; }
        j += l2;
      }
      if (!closed) i += len; /* 無配對結尾：這串反引號是字面字元 */
    }
    return ranges;
  }
  function insideRanges(ranges, start, end) {
    for (var r = 0; r < ranges.length; r++) {
      if (start >= ranges[r][0] && end <= ranges[r][1]) return true;
    }
    return false;
  }
  /* 只對行內程式碼以外的片段套用 fn */
  function outsideInlineCode(line, fn) {
    var ranges = inlineCodeRanges(line);
    if (!ranges.length) return fn(line);
    var out = "";
    var last = 0;
    ranges.forEach(function (rg) {
      out += fn(line.slice(last, rg[0])) + line.slice(rg[0], rg[1]);
      last = rg[1];
    });
    return out + fn(line.slice(last));
  }
  function isBlank(line) { return line.trim() === ""; }
  function isSpecial(line) { return isHeading(line) || isListItem(line) || isQuote(line); }

  /* 水平分隔線；引用內的 > --- 亦視為分隔線（Discord 同樣不支援） */
  function isHR(line) {
    var t = line.trim().replace(/^(?:>\s*)+/, "").trim();
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
    return outsideInlineCode(line, function (seg) { return replaceLatexSegment(seg, stats); });
  }

  function replaceLatexSegment(line, stats) {
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

  /* 移除 file:// 本地檔案連結，僅保留連結文字（Discord 不支援 file:// 協定） */
  var FILE_LINK_RE = /(?<![!\\])\[((?:`[^`]*`|\[[^\]]*\]|[^\[\]])*)\]\(\s*(?:<file:\/{1,3}[^>]*>|file:\/{1,3}(?:[^\s()]+|\([^\s()]+\))*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gi;

  /* 連結文字本身常含行內程式碼（[`src/a.rs`](file://…)），故不切段，只跳過整個落在行內程式碼內的連結 */
  function replaceFileLinks(line, stats) {
    if (line.toLowerCase().indexOf("file:") === -1) return line;
    var ranges = inlineCodeRanges(line);
    return line.replace(FILE_LINK_RE, function (match, text, offset) {
      if (insideRanges(ranges, offset, offset + match.length)) return match;
      stats.fileLinks += 1;
      return text;
    });
  }

  /* 標題：去掉行首縮排（Discord 要求 # 在行首），H4+ 降級為 ### */
  function clampHeading(line) {
    var m = /^( {0,3})(#{1,6})(?:\s|$)/.exec(line);
    if (!m) return line;
    var hashes = m[2].length > 3 ? "###" : m[2];
    return hashes + line.slice(m[1].length + m[2].length);
  }

  /**
   * 將標準 Markdown 轉換為 Discord 適用的 Markdown。
   * @param {string} input 原始 Markdown 文字
   * @param {object} [options] { clampHeadings: boolean } 是否將 H4 以上標題降級為 ###（預設 true）
   * @returns {{ markdown: string, stats: { tables: number, hr: number, blanks: number, headingsClamped: number, latex: number, fileLinks: number } }}
   */
  function convert(input, options) {
    var opts = options || {};
    if (opts.clampHeadings === undefined) opts.clampHeadings = true; /* Discord 僅支援 H1–H3 */
    var stats = { tables: 0, hr: 0, blanks: 0, headingsClamped: 0, latex: 0, fileLinks: 0 };
    var text = String(input == null ? "" : input).replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").replace(/\n+$/, "");
    var lines = text.split("\n");

    /* Pass 1：表格 → 清單、移除水平分隔線、（選配）標題壓縮、移除 file:// 連結 */
    var transformed = [];
    var inFence = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (inFence) { if (fenceCloses(line, inFence)) inFence = null; transformed.push(line); continue; }
      var open1 = fenceOpen(line);
      if (open1) { inFence = open1; transformed.push(line); continue; }

      line = replaceLatexLine(line, stats); /* LaTeX → Emoji / Unicode */
      line = replaceFileLinks(line, stats); /* 移除 file:// 連結，僅保留文字 */

      if (isHR(line)) { stats.hr += 1; continue; }

      if (isHeading(line)) {
        if (opts.clampHeadings) {
          var clamped = clampHeading(line);
          if (/^ {0,3}#{4,}(?:\s|$)/.test(line)) stats.headingsClamped += 1;
          transformed.push(clamped);
        } else {
          transformed.push(line.replace(/^ {0,3}#/, "#"));
        }
        continue;
      }

      if (!isBlank(line) && line.indexOf("|") !== -1 && !isHeading(line) &&
          i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
        var headers = splitCells(line);
        var rows = [];
        var j = i + 2;
        while (j < lines.length && !isBlank(lines[j]) && lines[j].indexOf("|") !== -1 && !isFence(lines[j])) {
          var rowLine = replaceFileLinks(replaceLatexLine(lines[j], stats), stats);
          rows.push(splitCells(rowLine));
          j++;
        }
        Array.prototype.push.apply(transformed, convertTable(headers, rows, stats));
        i = j - 1;
        continue;
      }

      /* 1) 形式的編號清單 Discord 不支援，改為 1. */
      transformed.push(line.replace(/^( *(?:>\s*)*\d{1,9})\)(\s)/, "$1.$2"));
    }

    /* Pass 2：移除標題／清單／引用前後的空白行（程式碼圍欄內容不受影響） */
    var out = [];
    var pendingBlank = false;
    var fence = null;
    for (var k = 0; k < transformed.length; k++) {
      var ln = transformed[k];
      if (fence) {
        if (fenceCloses(ln, fence)) fence = null;
        out.push(ln);
        continue;
      }
      var open2 = fenceOpen(ln);
      if (open2) {
        /* 圍欄前的空白行只在前一行是一般段落時保留；標題／清單／引用之後一律不留 */
        if (pendingBlank && out.length > 0 && !isSpecial(out[out.length - 1])) { out.push(""); stats.blanks -= 1; }
        pendingBlank = false;
        out.push(ln);
        fence = open2;
        continue;
      }
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

  return { convert: convert, inlineCodeRanges: inlineCodeRanges };
});