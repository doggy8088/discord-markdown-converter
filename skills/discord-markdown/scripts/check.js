#!/usr/bin/env node
/*!
 * Discord Markdown 交付前檢查
 * 用法：node check.js <draft.md>   或   cat draft.md | node check.js
 *
 * 1. 以轉換器跑一次草稿：任一 stat 非 0，代表草稿仍含轉換器會改寫的語法。
 * 2. 對「原始草稿」逐行檢查轉換器不會處理的語法（行號對應草稿；程式碼圍欄與
 *    行內程式碼不檢查）：圖片、任務清單、HTML 標籤（可跨行）、~~~ 圍欄、註腳、巢狀引用、定義清單、
 *    Setext 標題、非 http(s) 連結、參考式連結、殘留 LaTeX、CJK 標籤後的半形冒號。
 * 3. 轉換結果長度不得超過 2,000 字元。
 * 結束碼 0 = 全部通過；1 = 有待修正項目（逐行列出）。
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { convert } = require(path.join(__dirname, "converter.js"));

const LIMIT = 2000;
/* 與 converter.js 的 CJK_RE 相同範圍（含假名） */
const CJK = "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u3040-\\u30FF";
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_RE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const BLOCK_RE = /^ {0,3}(?:#{1,6}(?:\s|$)|>)/;

/* 單行檢查：re 對該行（已遮蔽行內程式碼）測試 */
const LINE_CHECKS = [
  { id: "image", re: /!\[[^\]]*\]/, msg: "圖片語法 ![alt](url)、![alt][ref]、![ref] 不會顯示；改貼圖片網址或上傳附件" },
  { id: "task-list", re: /^ *(?:>\s*)*(?:[-*+]|\d{1,9}[.)])\s+\[[ xX]\]/, msg: "任務清單 - [ ] 不支援（引用內亦同）；改用一般清單" },
  { id: "footnote", re: /\[\^[^\]]+\]/, msg: "註腳 [^n] 不支援；改為行內說明或括號" },
  { id: "nested-quote", re: /^ *>\s*>(?!>)/, msg: "巢狀引用 > > / >> 不支援；改為單層 > 或 >>>" },
  { id: "definition-list", re: /^ {0,3}:\s+\S/, msg: "定義清單（: 開頭的定義行）不支援；改為「**詞**：說明」" },
  /* 一般連結（非圖片）目的地必須以 http:// 或 https:// 開頭；相對路徑、#錨點、其他協定一律不可用。
     自動連結 <scheme:…> 亦同；<t:…>、<a:…> 等單字母前綴與 <id:…> 為 Discord 語法，不視為協定 */
  { id: "link-scheme", re: /(?<!!)\[[^\]]*\]\(\s*<?(?!https?:\/\/)[^)\s>]|<(?!https?:\/\/|id:)[a-zA-Z][a-zA-Z0-9+.-]+:[^>\s]*>/i, msg: "連結僅支援 http(s)://；相對路徑、錨點與其他協定（含 <mailto:…> 等自動連結）改為純文字或行內程式碼" },
  /* 參考式連結 [text][ref]、[text][] 與其定義行 [ref]: url（涵蓋捷徑式 [ref]）；[^n]: 為註腳，另由 footnote 處理 */
  { id: "reference-link", re: /(?<!!)\[[^\]]*\]\[[^\]]*\]|^ {0,3}\[[^\]^][^\]]*\]:\s+\S/, msg: "參考式連結 [text][ref] 與 [ref]: url 定義不支援；改為行內 [text](https://url)" },
  /* $$…$$ 一律；$\cmd；含 \ ^ _ { } 的 $…$；或不含空白且含 + = * / 的 $…$（如 $x+y$、$2+2=4$）。
     金額「$5 and $10」「$5 + $10」「$100-$200」因含空白或僅有 - 而不會命中 */
  { id: "latex", re: /\$\$[^$\n]+\$\$|\$\\[a-zA-Z]+|\$[^$\n]*[\\^_{}][^$\n]*\$|\$[^$\s]*[+=*\/][^$\s]*\$/, msg: "殘留 LaTeX／TeX 數學；改寫為 Unicode 或 Emoji 純文字" },
  { id: "cjk-colon", re: new RegExp("\\*\\*[^*\\n]*[" + CJK + "][^*\\n]*\\*\\*(?:（[^）]*）)?:"), msg: "CJK 標題後請用全形冒號「：」且不加空格" }
];

/* HTML 標籤可能跨行（<img\n src="…">），故對遮蔽後的全文比對；
   <https://…> 自動連結與 <@id> <#id> <t:…> 等 Discord 語法因 tag 名後接 : 或非字母而不會命中 */
const HTML_RE = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g;
const HTML_MSG = "HTML 標籤不會渲染；改用 Discord Markdown 語法";

/* 遮蔽行內程式碼：`…` 與 ``…`` 內容換成等長空白，保留原行號與欄位 */
function maskInlineCode(line) {
  return line
    .replace(/\\`/g, "  ") /* 逸出的 \` 是字面反引號，不是分隔符 */
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, function (m) { return " ".repeat(m.length); });
}

function isSetextUnderline(line, prev) {
  if (prev == null || prev.trim() === "" || BLOCK_RE.test(prev) || LIST_RE.test(prev)) return false;
  return /^ {0,3}=+\s*$/.test(line) || /^ {0,3}-+\s*$/.test(line);
}

function lint(source) {
  const findings = [];
  const lines = source.split("\n");
  const masked = []; /* 遮蔽圍欄與行內程式碼後的各行，供跨行檢查 */
  let fence = null; /* { ch, len } */
  let prev = null;
  lines.forEach((raw, i) => {
    const m = FENCE_OPEN_RE.exec(raw);
    if (fence) {
      /* 只有同字元且長度不短於開頭者才算結尾 */
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len && raw.trim() === m[1].trim()) fence = null;
      masked.push("");
      prev = null;
      return;
    }
    if (m) {
      fence = { ch: m[1][0], len: m[1].length };
      /* Discord 只認反引號圍欄；~~~ 會連同內容原樣顯示 */
      if (fence.ch === "~") findings.push({ line: i + 1, id: "tilde-fence", msg: "~~~ 圍欄在 Discord 不是程式碼區塊；改用 ```", text: raw.trim() });
      masked.push("");
      prev = null;
      return;
    }

    if (isSetextUnderline(raw, prev)) {
      findings.push({ line: i + 1, id: "setext-heading", msg: "底線式標題（=== / ---）不支援；改為 #、##、###", text: raw.trim() });
    }
    const line = maskInlineCode(raw);
    masked.push(line);
    for (const c of LINE_CHECKS) {
      if (c.re.test(line)) findings.push({ line: i + 1, id: c.id, msg: c.msg, text: raw.trim() });
    }
    prev = raw;
  });

  /* 跨行 HTML 標籤 */
  const text = masked.join("\n");
  let h;
  HTML_RE.lastIndex = 0;
  while ((h = HTML_RE.exec(text)) !== null) {
    const lineNo = text.slice(0, h.index).split("\n").length;
    findings.push({ line: lineNo, id: "html", msg: HTML_MSG, text: lines[lineNo - 1].trim() });
  }
  findings.sort((a, b) => a.line - b.line);
  return findings;
}

function read(argv) {
  const file = argv[2];
  if (file && file !== "-") return fs.readFileSync(file, "utf8");
  return fs.readFileSync(0, "utf8");
}

function main() {
  const input = read(process.argv);
  const { markdown, stats } = convert(input);
  const findings = lint(input);
  const length = Array.from(markdown).length;
  const statHits = Object.entries(stats).filter(([, n]) => n > 0);

  console.log("stats :", JSON.stringify(stats));
  console.log("length:", length, length > LIMIT ? `(轉換後超過 ${LIMIT} 字元上限，請分段)` : "(OK)");

  let problems = 0;
  if (statHits.length) {
    problems += statHits.length;
    console.log("\n轉換器改寫了以下項目（草稿應直接寫成轉換後的形式）：");
    for (const [k, n] of statHits) console.log(`  - ${k}: ${n}`);
  }
  if (findings.length) {
    problems += findings.length;
    console.log("\n轉換器不會處理、需手動修正的項目（行號為草稿行號）：");
    for (const f of findings) console.log(`  - 第 ${f.line} 行 [${f.id}] ${f.msg}\n      ${f.text}`);
  }
  if (length > LIMIT) problems += 1;

  console.log(problems ? `\n未通過：${problems} 項待修正` : "\n通過：可直接貼進 Discord");
  process.exit(problems ? 1 : 0);
}

if (require.main === module) main();
module.exports = { lint, maskInlineCode };
