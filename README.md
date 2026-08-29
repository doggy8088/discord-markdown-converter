# Discord Markdown 轉換器

將標準 Markdown 一鍵轉換為 **Discord 頻道適用的 Markdown 格式**。純前端運作，無需後端、無需上傳，貼上、轉換、複製，直接貼進 Discord。

🔗 線上版：<https://discord-markdown-converter.gh.miniasp.com/>

## 功能特色

- ⚡ **即時自動轉換** — 輸入 Markdown 自動以 debounce 500ms 即時轉換，亦支援快捷鍵（macOS: `Cmd+Enter` / Windows: `Ctrl+Enter`）與手動轉換鈕。
- 📋 **表格自動轉清單** — Discord 不支援 Markdown 表格。單列表格轉為「**欄位**：值」清單，多列表格轉為巢狀清單；中文表格自動使用全形冒號。
- ✂️ **移除水平分隔線** — `---`、`***`、`___` 等分隔線整行移除。
- 🧹 **清理空白行** — 標題（`#`）、清單（`-`、`*`、`1.`）與引用（`>`）前後不加空白行。
- ➡️ **LaTeX → Emoji / Unicode** — Discord 不支援 LaTeX。`$\rightarrow$` → ➡️、`$\alpha$` → α、`$\infty$` → ∞，支援 90+ 常用符號。
- 🔗 **移除 file:// 本地檔案連結** — Discord 不支援 `file://` 協定連結。例如 <code>[\`src/clients.rs\`](file:///path/src/clients.rs)</code> 會自動去除連結，僅保留文字 <code>\`src/clients.rs\`</code>。
- 🔽 **H4+ 標題整體降級** — Discord 僅支援 H1–H3，`####` 以上標題自動降級為 `###` 並統計警告（可於頁面選項關閉）。
- 🛡️ **程式碼區塊原封不動** — 「```」圍欄內容完整保留，不會被誤改。
- 📊 **字數計數與上限提醒** — Discord 單則訊息上限 2,000 字元（Nitro 4,000），超量自動提醒分段。
- 🌙 **深色／淺色主題** — 跟隨系統設定，可手動切換並記住偏好。

## 轉換規則緣起

規則綜合三種來源：

1. **Discord 官方文件**：僅支援 `#`–`###` 三級標題；不支援表格與水平分隔線。
2. **社群轉換經驗**：表格改以清單或程式碼區塊呈現、多餘空白行應移除（Markdown Guide 的 Discord 參考、各家 Discord Markdown formatter 工具）。
3. **Will 保哥的實戰經驗**：表格轉清單、標題／清單／引用前後不加空白行、移除 `---`、LaTeX 符號轉 Emoji、移除 file:// 連結、H4+ 標題降級。

## 使用方式

直接用瀏覽器開啟 `index.html` 即可使用，或部署到任何靜態網站（GitHub Pages、Netlify、Cloudflare Pages 等）：

```bash
# 本機預覽
open index.html

# 或用任意靜態伺服器
npx serve .
```

操作流程：左側貼上 Markdown → 自動轉換（或按按鈕／快捷鍵）→ 右側複製／下載結果。

## 開發與測試

核心轉換邏輯在 [`js/converter.js`](js/converter.js)（UMD 模組，瀏覽器與 Node 皆可載入）：

```bash
node tests/run-tests.js    # 轉換器單元測試（含黃金測試）
node tests/verify-page.js  # 頁面完整性驗證（meta、資源、範例一致性）
```

測試包含「Will 保哥提供的完整實例」黃金測試（輸入輸出逐字比對）與各邊界案例（多列表格、英文表格、LaTeX、程式碼圍欄、逸出管線等）。

## 專案結構

```
├── index.html              # 主頁面（SEO / OpenGraph / 結構化資料）
├── css/style.css            # 版面樣式（深色／淺色主題）
├── js/converter.js          # 核心轉換邏輯
├── js/app.js                # 頁面互動
├── assets/img/              # 圖片素材（og-image、hero、icon 原始檔）
├── favicon.ico              # 傳統 favicon（16/32/48）
├── favicon.svg              # 向量 favicon
├── favicon-*.png             # 各尺寸 PNG favicon
├── apple-touch-icon.png     # iPhone / iPad 主畫面圖示
├── android-chrome-*.png     # Android 主畫面圖示
├── site.webmanifest         # PWA 資訊清單
├── CNAME                    # GitHub Pages 自訂網域
├── LICENSE                  # MIT 授權條款
└── tests/                   # 測試（Node 執行）
```

## 部署說明

本站部署於 GitHub Pages，自訂網域 `discord-markdown-converter.gh.miniasp.com`（DNS CNAME 指向 `doggy8088.github.io`），`og:image` 等 meta 均已使用絕對網址，Facebook 分享卡可直接抓取。

## 授權

[MIT](LICENSE) © 2026 Will 保哥