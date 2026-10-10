#!/usr/bin/env node
/*!
 * Discord Markdown 交付前檢查
 * 用法：node check.js <draft.md>   或   cat draft.md | node check.js
 *
 * 1. 以轉換器跑一次草稿：任一 stat 非 0，代表草稿仍含轉換器會改寫的語法。
 * 2. 對轉換結果（程式碼圍欄除外）檢查轉換器不會處理的語法：圖片、任務清單、
 *    HTML 標籤、註腳、巢狀引用、非 http(s) 連結、殘留 LaTeX、CJK 半形冒號、
 *    以及 2,000 字元上限。
 * 結束碼 0 = 全部通過；1 = 有待修正項目（逐行列出）。
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { convert } = require(path.join(__dirname, "converter.js"));

const LIMIT = 2000;
const CJK_RE = /[㐀-䶿一-鿿豈-﫿぀-ヿ]/;
const FENCE_RE = /^ {0,3}(?:```|~~~)/;

const CHECKS = [
  { id: "image", re: /!\[[^\]]*\]\([^)]*\)/, msg: "圖片語法 ![]() 不會顯示；改貼圖片網址或上傳附件" },
  { id: "task-list", re: /^ *(?:[-*+]|\d+[.)]) \[[ xX]\]/, msg: "任務清單 - [ ] 不支援；改用一般清單" },
  { id: "footnote", re: /\[\^[^\]]+\]/, msg: "註腳 [^n] 不支援；改為行內說明或括號" },
  { id: "nested-quote", re: /^ *> *>/, msg: "巢狀引用 > > 不支援；改為單層 > 或 >>>" },
  { id: "html", re: /<\/?(?:details|summary|br|p|div|span|table|tr|td|th|img|a|b|i|u|s|strong|em|code|pre|ul|ol|li|h[1-6]|sup|sub|kbd)\b[^>]*>/i, msg: "HTML 標籤不會渲染；改用 Discord Markdown 語法" },
  { id: "link-scheme", re: /\[[^\]]*\]\(\s*<?(?!https?:\/\/|#)[a-zA-Z][a-zA-Z0-9+.-]*:/, msg: "連結僅支援 http(s)://；其他協定改為純文字或行內程式碼" },
  { id: "latex", re: /\$\\[a-zA-Z]+/, msg: "殘留 LaTeX 指令；改寫為 Unicode 或 Emoji" },
  { id: "cjk-colon", re: /\*\*[^*\n]*[\u3400-\u9FFF][^*\n]*\*\*(?:（[^）]*）)?: /, msg: "CJK 標題後請用全形冒號「：」且不加空格" }
];

function read(argv) {
  const file = argv[2];
  if (file && file !== "-") return fs.readFileSync(file, "utf8");
  return fs.readFileSync(0, "utf8");
}

function lint(markdown) {
  const findings = [];
  let inFence = false;
  markdown.split("\n").forEach((line, i) => {
    if (FENCE_RE.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    for (const c of CHECKS) {
      if (c.re.test(line)) findings.push({ line: i + 1, id: c.id, msg: c.msg, text: line.trim() });
    }
  });
  return findings;
}

function main() {
  const input = read(process.argv);
  const { markdown, stats } = convert(input);
  const findings = lint(markdown);
  const length = Array.from(markdown).length;
  const statHits = Object.entries(stats).filter(([, n]) => n > 0);

  console.log("stats :", JSON.stringify(stats));
  console.log("length:", length, length > LIMIT ? `(超過 ${LIMIT} 字元上限，請分段)` : "(OK)");

  let problems = 0;
  if (statHits.length) {
    problems += statHits.length;
    console.log("\n轉換器改寫了以下項目（草稿應直接寫成轉換後的形式）：");
    for (const [k, n] of statHits) console.log(`  - ${k}: ${n}`);
  }
  if (findings.length) {
    problems += findings.length;
    console.log("\n轉換器不會處理、需手動修正的項目：");
    for (const f of findings) console.log(`  - 第 ${f.line} 行 [${f.id}] ${f.msg}\n      ${f.text}`);
  }
  if (length > LIMIT) problems += 1;

  console.log(problems ? `\n未通過：${problems} 項待修正` : "\n通過：可直接貼進 Discord");
  process.exit(problems ? 1 : 0);
}

main();
