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

console.log(failures === 0 ? "\n全部測試通過 ✔" : `\n${failures} 項測試失敗 ✘`);
process.exit(failures === 0 ? 0 : 1);