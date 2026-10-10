---
name: discord-markdown
description: Write Markdown that renders correctly when pasted into a Discord message. Use when the output is destined for Discord (a channel post, DM, announcement, bot message, or "format this for Discord"), or when converting an existing Markdown document for Discord.
---

# Discord Markdown

Discord renders a small subset of Markdown and renders it *literally*: every blank line becomes visible vertical space, and unsupported syntax shows up as raw characters. Write for that renderer from the start rather than writing standard Markdown and hoping.

Rules 1 to 5, and the `file://` case of rule 6, are transformations that the bundled converter (`scripts/converter.js`, a copy of this repo's `js/converter.js`) performs mechanically. Rule 8 is a guarantee the converter makes. The rest are authoring rules. The checker in `scripts/check.js` covers both groups; see the final section.

## Supported syntax

| Element | Write |
| --- | --- |
| Headings | `# `, `## `, `### ` only (three levels) |
| Subtext (small grey line) | `-# text` |
| Bold / italic / underline / strike | `**b**`, `*i*`, `__u__`, `~~s~~` |
| Spoiler | `\|\|hidden\|\|` |
| Inline code / code block | `` `code` ``, fenced ```` ```lang ```` block |
| Quote | `> line` (single) or `>>> ` (rest of message) |
| Bullet list | `- item` or `* item`; nest with exactly two leading spaces |
| Numbered list | `1. item` |
| Link | `[text](https://url)`; wrap as `<https://url>` to suppress the embed card |

## Rules

Each rule names what to write instead of the unsupported form.

1. **Tables become lists.** Discord has no tables. A one-row table becomes a flat list of `**Header**: value` items. A multi-row table becomes a nested list: the first column is the top-level item, the remaining columns are its sub-items indented by two spaces. Move a parenthesised unit out of the bold: `**總花費**（USD）：$152.39`.
2. **Headings stop at `###`.** Write `###` for anything that would be H4 or deeper. Flatten or use bold text for finer structure.
3. **No blank lines around headings, list items, or quotes.** Put a heading, list item, or `>` line directly against its neighbours. Separate plain paragraphs with a single blank line only.
4. **No horizontal rules.** Drop `---`, `***`, `___`. Use a heading or `-# ` subtext to mark a section change.
5. **LaTeX becomes Unicode or emoji.** `$\rightarrow$` → ➡️, `$\alpha$` → α, `$\leq$` → ≤, `$\infty$` → ∞, `$\sqrt{2}$` → √2. Write the symbol directly.
6. **Links point at `http(s)://` only.** A `file://` or other-scheme link renders as broken text. Write the file path as inline code with no link: `` `src/clients.rs` ``.
7. **Colon style follows the language.** CJK content uses a full-width colon with no space (`**欄位**：值`). Latin content uses `: ` (`**Field**: value`).
8. **Code blocks are untouched.** Everything inside a fence is preserved verbatim, including `---` and `$...$`. Put content that must survive literally inside a fence.
9. **One message is 2,000 characters.** Bot and webhook messages go through the API and are always capped at 2,000. A human Nitro subscriber can post up to 4,000, but target 2,000 unless told the sender is a Nitro user. Split longer output at a heading boundary and label the parts.

Not supported at all, so leave them out: HTML, images via `![]()`, task lists `- [ ]`, footnotes, nested blockquotes, definition lists, and `<details>`.

## Example

Standard Markdown:

```markdown
### 一、 使用的模型

| 模型名稱 | 成功請求數 | 總花費 (USD) |
| :--- | :---: | :---: |
| `openai/glm-5.2` | 269 | **$152.39** |

---

#### 關鍵數據特徵

* 2026-08-26：344 次請求 $\rightarrow$ 5,344 萬 tokens
```

Discord Markdown:

```markdown
### 一、 使用的模型
- **模型名稱**：`openai/glm-5.2`
- **成功請求數**：269
- **總花費**（USD）：$152.39
### 關鍵數據特徵
* 2026-08-26：344 次請求 ➡️ 5,344 萬 tokens
```

## Check before delivering

Run the checker bundled beside this file. The path is relative to this `SKILL.md`, so it works from any working directory once the skill is installed.

```bash
node <path-to-this-skill>/scripts/check.js draft.md
# or: cat draft.md | node <path-to-this-skill>/scripts/check.js
```

The checker runs the converter and then lints the result outside code fences. It reports, with line numbers:

- A non-zero converter stat: the draft still contains a form that rules 1 to 6 rewrite. Write the converted form directly.
- Unsupported constructs the converter passes through untouched: images, task lists, HTML tags, footnotes, nested quotes, non-`http(s)` link schemes, leftover `$\...$` LaTeX, and a half-width colon after a CJK bold label.
- Length over 2,000 characters.

Done when the checker exits `0` (it prints `通過`) for the message, or for each part of a split message. One thing it cannot judge: that a split lands on a heading boundary. Confirm that by eye.
