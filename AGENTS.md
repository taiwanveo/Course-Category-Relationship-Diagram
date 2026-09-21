# AGENTS.md

給在本專案工作的 AI Agent 的必要規則。專案概要見 `README.md`。

## 修改 app.css 或匯出圖示後，必須重新產生 export-bundle.js

`export-bundle.js` 由 `tools/build-export-bundle.js` 自動產生，內含 `app.css` 與
`assets/dot.png`、`assets/dots.png`、`assets/classification.png` 的打包內容。
使用者以 `file://` 直接開啟 `index.html` 時，「匯出 → HTML（唯讀檢視器）」靠它內嵌樣式；
沒有同步的話，匯出檔會套用舊樣式，甚至變成空白畫面。

只要改動上述任一檔案：

1. 執行 `node tools/build-export-bundle.js`
2. 執行 `node tools/build-export-bundle.js --check`，確認輸出「已同步」
3. 把 `export-bundle.js` 和原檔放在同一個 commit

不要手動編輯 `export-bundle.js`。

`.githooks/pre-commit` 會在 commit 時自動檢查這件事，沒同步就擋下。
每個 clone 需啟用一次：`git config core.hooksPath .githooks`。
不要用 `--no-verify` 跳過它；被擋下時照上面的步驟修正。
