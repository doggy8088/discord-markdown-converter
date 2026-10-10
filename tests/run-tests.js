"use strict";
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { convert } = require("../js/converter.js");

let failures = 0;

function check(name, actual, expected) {
  const a = String(actual).replace(/\s+$/, "");
  const e = String(expected).replace(/\s+$/, "");
  if (a === e) {
    console.log(`PASS: ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${name}`);
    const aL = a.split("\n");
    const eL = e.split("\n");
    for (let i = 0; i < Math.max(aL.length, eL.length); i++) {
      if (aL[i] !== eL[i]) {
        console.error(`  line ${i + 1}:
    expected: ${JSON.stringify(eL[i])}
    actual:   ${JSON.stringify(aL[i])}`);
      }
    }
  }
}

/* 1. 使用者提供的完整範例（黃金測試） */
const input = readFileSync(path.join(__dirname, "input.md"), "utf8");
const expected = readFileSync(path.join(__dirname, "expected.md"), "utf8");
const result = convert(input);
check("使用者範例（完整比對）", result.markdown, expected);

/* 2. 多列表格 → 巢狀清單 */
check(
  "多列表格轉巢狀清單",
  convert("| 服務 | 狀態 | 延遲 |\n|---|---|---|\n| API | 正常 | 120ms |\n| Web | 異常 | 500ms |").markdown,
  "- **服務**：API\n  - **狀態**：正常\n  - **延遲**：120ms\n- **服務**：Web\n  - **狀態**：異常\n  - **延遲**：500ms"
);

/* 3. 英文表格使用半形冒號 */
check(
  "英文表格半形冒號",
  convert("| Name | Score |\n|---|---|\n| Alice | 90 |").markdown,
  "- **Name**: Alice\n- **Score**: 90"
);

/* 4. H4+ 標題預設降級為 H3（規則 7） */
check(
  "H4+ 標題預設降級",
  convert("#### 標題四\n##### 標題五\n###### 標題六").markdown,
  "### 標題四\n### 標題五\n### 標題六"
);

/* 5. clampHeadings: false 時保留原標題層級 */
check(
  "關閉標題降級",
  convert("#### 標題四", { clampHeadings: false }).markdown,
  "#### 標題四"
);

/* 6. LaTeX → Emoji / Unicode（規則 6） */
check(
  "LaTeX 符號轉換",
  convert("A $\\rightarrow$ B $\\alpha$ C $\\infty$ D $\\leq$ 5").markdown,
  "A ➡️ B α C ∞ D ≤ 5"
);
check(
  "LaTeX 顯示數學與 sqrt",
  convert("$$\\sum$$ 與 $\\sqrt{2}$").markdown,
  "∑ 與 √2"
);
check("LaTeX text 命令", convert("$\\text{OK}$").markdown, "OK");
check("未知 LaTeX 保留原樣", convert("$\\foo$ 保留").markdown, "$\\foo$ 保留");
check("金額符號不受影響", convert("花了 $100.42 美元").markdown, "花了 $100.42 美元");

/* 7. 程式碼圍欄內容不受影響（--- 與 LaTeX 保留） */
check(
  "程式碼圍欄不受影響",
  convert("前文\n\n```js\nconst a = 1;\n\n---\n# not a heading\n$a = $b;\n\n```\n\n後文").markdown,
  "前文\n\n```js\nconst a = 1;\n\n---\n# not a heading\n$a = $b;\n\n```\n\n後文"
);

/* 8. 段落之間的空行保留 */
check("段落之間保留空行", convert("第一段。\n\n第二段。").markdown, "第一段。\n\n第二段。");

/* 9. 逸出管線符號 \| */
check(
  "逸出管線符號",
  convert("| 名稱 | 說明 |\n|---|---|\n| a \\| b | 含管線 |").markdown,
  "- **名稱**：a | b\n- **說明**：含管線"
);

/* 10. * * * 與 - - - 分隔線也會被移除 */
check("替代分隔線樣式", convert("上文\n\n* * *\n\n- - -\n\n___\n\n下文").markdown, "上文\n\n下文");

/* 11. 僅表頭的表格 */
check("僅表頭的表格", convert("| A | B |\n|---|---|").markdown, "");

/* 12. 移除 file:// 本地檔案連結（規則 8） */
check(
  "file:// 連結轉換為行內程式碼文字",
  convert("[`src/clients.rs`](file:///Users/will/projects/zerotype-win/src/clients.rs#L1218)").markdown,
  "`src/clients.rs`"
);
check(
  "file:// 純文字連結",
  convert("[clients.rs](file:///C:/projects/zerotype/src/clients.rs)").markdown,
  "clients.rs"
);
check(
  "file:// localhost 與尖括號語法",
  convert("[hosts](file://localhost/etc/hosts) 與 [test](<file:///Users/will/test.rs>)").markdown,
  "hosts 與 test"
);
check(
  "file:// 連結含標題屬性",
  convert('[clients.rs](file:///path/test.rs "檔案標題") 與 [app.rs](file:///path/app.rs \'單引號\')').markdown,
  "clients.rs 與 app.rs"
);
check(
  "混合網頁連結與 file:// 連結",
  convert("參考 [官方網站](https://example.com) 與 [`src/main.rs`](file:///path/to/main.rs)").markdown,
  "參考 [官方網站](https://example.com) 與 `src/main.rs`"
);
check(
  "連續 file:// 連結",
  convert("[`a.rs`](file:///a)[`b.rs`](file:///b)").markdown,
  "`a.rs``b.rs`"
);
check(
  "表格中包含 file:// 連結",
  convert("| 檔案 | 說明 |\n|---|---|\n| [`src/clients.rs`](file:///path/src/clients.rs) | 用戶端 |").markdown,
  "- **檔案**：`src/clients.rs`\n- **說明**：用戶端"
);
check(
  "程式碼圍欄內的 file:// 連結不受影響",
  convert("```\n[`src/clients.rs`](file:///path/src/clients.rs)\n```").markdown,
  "```\n[`src/clients.rs`](file:///path/src/clients.rs)\n```"
);

/* 13. 統計數據 */
const stats = convert("a\n\n---\n\n### H\n\n- x\n\n> q\n\n[`a.rs`](file:///a)\n\nb")["stats"];
check(
  "統計數據",
  JSON.stringify(stats),
  JSON.stringify({ tables: 0, hr: 1, blanks: 5, headingsClamped: 0, latex: 0, fileLinks: 1 })
);

/* 14. 黃金測試的統計數據 */
check(
  "範例統計數據",
  JSON.stringify(result.stats),
  JSON.stringify({ tables: 1, hr: 3, blanks: 14, headingsClamped: 3, latex: 3, fileLinks: 0 })
);

/* 15. Skill 隨附的轉換器副本必須與 js/converter.js 完全相同 */
check(
  "Skill 轉換器副本與 js/converter.js 同步",
  readFileSync(path.join(__dirname, "..", "skills", "discord-markdown", "scripts", "converter.js"), "utf8"),
  readFileSync(path.join(__dirname, "..", "js", "converter.js"), "utf8")
);

/* 16. Skill 檢查腳本：乾淨草稿結束碼 0；每種不支援語法都要被抓到 */
const { spawnSync } = require("node:child_process");
const CHECK = path.join(__dirname, "..", "skills", "discord-markdown", "scripts", "check.js");
function runCheck(input) {
  const r = spawnSync(process.execPath, [CHECK], { input, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}
check("check.js 乾淨草稿通過", runCheck(
  "### 標題\n- **欄位**：值\n  - **子項**：ok\n>>> 整段引用\n> 單層引用\n[a](https://x) [b](http://y) <https://z> <@123> <t:1700000000:R>\n" +
  "金額 $100 與 $200 之間、$5 + $10、$100-$200\n<a:wave:123> <:smile:456> <id:customize>\n段落後接圍欄\n\n```\ncode\n```\n`<div>` 與 `![img](https://x)` 與 ``- [ ] `in code` `` 與 `$\\alpha$` 與 `[x](file:///a)`\n```\n![fence](x) - [ ] <b>ok</b>\n~~~\n---\nstill in fence\n```"
).code, 0);
check("check.js 引用內圍欄的內容不檢查", runCheck("> ```js\n> ![x](https://x) <b>x</b>\n> ```").code, 0);
check("check.js 巢狀括號的 https 連結不誤報", runCheck("[a [b]](https://x)").code, 0);
check("check.js 偶數反斜線後的反引號仍是行內程式碼", runCheck("\\\\`![x](https://x)`").code, 0);
check("check.js 圍欄內跨行 HTML 不誤報", runCheck("```\n<img\nsrc=\"https://x\">\n```").code, 0);
const dirty = [
  ["image", "![img](https://x/y.png)"],
  ["image", "![alt][logo]"],
  ["image", "![logo]"],
  ["task-list", "-   [ ] todo"],
  ["task-list", "> - [ ] todo"],
  ["footnote", "見註腳[^1]"],
  ["nested-quote", "> > nested"],
  ["nested-quote", ">> nested"],
  ["definition-list", "Term\n: definition"],
  ["html", "<section>x</section>"],
  ["html", "<br/>"],
  ["html", "<img\nsrc=\"https://x\">"],
  ["tilde-fence", "~~~\n![img](https://x)\n~~~"],
  ["link-scheme", "[n](notion://x)"],
  ["link-scheme", "[guide](./guide.md)"],
  ["link-scheme", "[s](#intro)"],
  ["link-scheme", "<mailto:user@example.com>"],
  ["link-scheme", "<ftp://example.com>"],
  ["link-scheme", "[x]()"],
  ["link-scheme", "[x]( )"],
  ["plus-list", "+ item"],
  ["paren-ordered", "1) item"],
  ["html", "<!-- hidden note"],
  ["link-scheme", "[a [b]](ftp://example.com)"],
  ["link-scheme", "[a \\] b](ftp://example.com)"],
  ["reference-link", "> [docs]\n> [docs]: https://example.com"],
  ["image", "`a\\` ![x](https://x)`"],
  ["html", "<!-- hidden note -->"],
  ["html", "<!--\nmulti\n-->"],
  ["indented-heading", "  # heading"],
  ["quoted-table", "> | A | B |\n> |---|---|\n> | 1 | 2 |"],
  ["image", "```foo```\n![x](https://x)"],
  ["task-list", "\uFEFF- [ ] todo"],
  ["reference-link", "[guide][docs]"],
  ["reference-link", "[guide][]"],
  ["reference-link", "[docs]: https://example.com"],
  ["image", "\\`![x](https://x)\\`"],
  ["latex", "$\\foo$"],
  ["latex", "$x^2 + y^2$"],
  ["latex", "$$a_i$$"],
  ["latex", "$x+y$"],
  ["latex", "$2+2=4$"],
  ["cjk-colon", "**欄位**:值"],
  ["cjk-colon", "**モデル**: 値"],
  ["setext-heading", "Heading\n======"],
  ["setext-heading", "Heading\n------"]
];
for (const [id, line] of dirty) {
  const r = runCheck(line);
  check(`check.js 抓到 [${id}] ← ${JSON.stringify(line)}`, r.code === 1 && r.out.includes(`[${id}]`), true);
}
check("check.js 行號對應草稿而非轉換結果",
  runCheck("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\n\n![img](https://x)").out.includes("第 7 行 [image]"), true);
check("check.js 圍欄結尾須與開頭同字元", runCheck("```\n~~~\n```\n![x](https://x)").out.includes("[image]"), true);
check("check.js 註腳定義不重複報為參考式連結", runCheck("[^1]: note").out.includes("[reference-link]"), false);

/* 17. 轉換器：圍欄結尾須與開頭配對；行內程式碼內容不改寫 */
check("圍欄內 ~~~ 與 --- 原封不動",
  convert("```\n~~~\n---\n$\\alpha$\n```").markdown, "```\n~~~\n---\n$\\alpha$\n```");
check("圍欄結尾長度不短於開頭", convert("````\n```\n---\n````").markdown, "````\n```\n---\n````");
check("行內程式碼內的 LaTeX 與 file:// 不改寫",
  convert("`$\\alpha$` 與 `[a](file:///x)` 但 $\\alpha$ 會轉").markdown, "`$\\alpha$` 與 `[a](file:///x)` 但 α 會轉");
check("逸出反引號不視為行內程式碼", convert("\\`$\\alpha$\\`").markdown, "\\`α\\`");
check("偶數反斜線後的反引號仍是分隔符", convert("\\\\`$\\alpha$`").markdown, "\\\\`$\\alpha$`");
check("1) 編號清單改為 1.", convert("1) 一\n2) 二\n> 3) 三").markdown, "1. 一\n2. 二\n> 3. 三");
check("引用內的圍欄原封不動", convert("> ```js\n> $\\alpha$ [a](file:///x)\n> ---\n> ```").markdown, "> ```js\n> $\\alpha$ [a](file:///x)\n> ---\n> ```");
check("只有標記的 #### 也降級", convert("####\n##### ").markdown, "###\n### ");
check("只有標記的 #### 計入 headingsClamped", convert("####").stats.headingsClamped, 1);
check("標題與圍欄之間不留空白行", convert("# H\n\n```\nx\n```").markdown, "# H\n```\nx\n```");
check("段落與圍欄之間保留空白行", convert("p\n\n```\nx\n```").markdown, "p\n\n```\nx\n```");
check("行內程式碼內的反斜線不逸出反引號", convert("`a\\` $\\alpha$`").markdown, "`a\\` α`");
check("inlineCodeRanges 匯出且結果正確", JSON.stringify(require("../js/converter.js").inlineCodeRanges("x `a` \\`b\\` ``c`d`` e")), "[[2,5],[12,19]]");
check("同一行閉合的反引號不是圍欄", convert("```foo```\n\n---\n\n後文").markdown, "```foo```\n\n後文");
check("標題去掉行首縮排", convert("  ## 標題\n   #### 深").markdown, "## 標題\n### 深");
check("關閉降級時仍去掉標題縮排", convert("  #### 深", { clampHeadings: false }).markdown, "#### 深");
check("引用內的分隔線移除", convert("> 引用\n> ---\n> 後文").markdown, "> 引用\n> 後文");
check("引用內的分隔線計入 hr", convert("> ---").stats.hr, 1);
check("段落與圍欄間保留的空白行不計入 blanks",
  JSON.stringify(convert("text\n\n```\ncode\n```").stats.blanks) + " " + convert("text\n\n```\ncode\n```").markdown,
  "0 text\n\n```\ncode\n```");
check("行內程式碼不計入 stats", JSON.stringify(convert("`$\\alpha$` `[a](file:///x)`").stats),
  JSON.stringify({ tables: 0, hr: 0, blanks: 0, headingsClamped: 0, latex: 0, fileLinks: 0 }));
check("check.js 轉換器 stats 非 0 視為未通過", runCheck("| a | b |\n|---|---|\n| 1 | 2 |").code, 1);
check("check.js 引用內分隔線由轉換器 stats 回報", runCheck("> 引用\n> ---").out.includes("hr: 1"), true);
check("check.js 跨行 HTML 回報開頭行號", runCheck("第一行\n<img\nsrc=\"https://x\">").out.includes("第 2 行 [html]"), true);
const deep = runCheck("#### 深標題");
check("check.js H4+ 由轉換器 stats 回報", deep.code === 1 && deep.out.includes("headingsClamped"), true);
check("check.js 超過 2,000 字元視為未通過", runCheck("x".repeat(2001)).code, 1);

console.log(failures === 0 ? "\n全部測試通過 ✔" : `\n${failures} 項測試失敗 ✘`);
process.exit(failures === 0 ? 0 : 1);