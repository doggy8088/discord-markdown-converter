"use strict";
/* 開發用驗證：頁面內嵌範例是否與測試 fixture 完全一致、資源引用是否存在 */
const { readFileSync, existsSync } = require("node:fs");

const html = readFileSync("index.html", "utf8");

/* 1. 內嵌範例 === input.md */
const m = html.match(/<script type="text\/plain" id="sample-markdown">([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: sample script not found"); process.exit(1); }
const sample = m[1].replace(/^\n+/, "").replace(/\s+$/, "");
const fixture = readFileSync("tests/input.md", "utf8").replace(/^\uFEFF/, "").replace(/\n+$/, "");
if (sample === fixture) console.log("PASS: 內嵌範例與 input.md 完全一致");
else {
  console.error("FAIL: 內嵌範例與 input.md 不一致");
  const a = sample.split("\n"), b = fixture.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { console.error(`  line ${i + 1}:\n    sample:  ${JSON.stringify(a[i])}\n    fixture: ${JSON.stringify(b[i])}`); break; }
  }
  process.exit(1);
}

/* 2. 資源引用是否存在 */
const refs = [...html.matchAll(/(?:href|src|srcset)="([^"]+)"/g)]
  .flatMap((r) => r[1].split(",").map((s) => s.trim().split(" ")[0]))
  .filter((u) => !/^(https?:|#|mailto:)/.test(u));
let missing = 0;
for (const ref of new Set(refs)) {
  if (existsSync(ref)) console.log(`OK   ${ref}`);
  else { console.error(`MISS ${ref}`); missing++; }
}

/* 3. og:image 尺寸宣告與實際檔案一致 */
const og = require("node:child_process").execSync(
  "sips -g pixelWidth -g pixelHeight assets/img/og-image.png", { encoding: "utf8" });
const w = /pixelWidth: (\d+)/.exec(og)[1], h = /pixelHeight: (\d+)/.exec(og)[1];
const ogw = /og:image:width" content="(\d+)"/.exec(html)?.[1];
const ogh = /og:image:height" content="(\d+)"/.exec(html)?.[1];
console.log(ogw === w && ogh === h ? `PASS: og:image 尺寸宣告 ${w}x${h} 與檔案一致` : `FAIL: og:image 宣告 ${ogw}x${ogh}，實際 ${w}x${h}`);

/* 4. 基本標籤檢查 */
const mustHave = [
  'rel="icon"', 'rel="apple-touch-icon"', 'rel="manifest"',
  'property="og:image"', 'name="twitter:card"', 'application/ld+json',
  'data-theme', '© 2026', 'will.fans'
];
for (const t of mustHave) {
  if (html.includes(t)) console.log(`OK   含 ${t}`);
  else { console.error(`MISS 缺少 ${t}`); missing++; }
}

/* 5. (c) 不得出現（須用 ©） */
if (/\(c\)/i.test(html) || /\(c\)/i.test(readFileSync("LICENSE", "utf8")) || /\(c\)/i.test(readFileSync("README.md", "utf8"))) {
  console.error("FAIL: 發現 (c)，應改用 ©");
  missing++;
} else console.log("PASS: 版權符號使用 © 而非 (c)");

process.exit(missing ? 1 : 0);