# AGENTS.md

給在本專案工作的 AI Agent 的必要規則。專案概要見 `README.md`。

## 開始工作前：確認 git hook 已啟用

`core.hooksPath` 存在本機 `.git/config`，不會隨 clone 同步，新 clone 預設是沒啟用的。
每次開始工作時先檢查：

```sh
git config --get core.hooksPath
```

輸出不是 `.githooks`（包括沒有輸出）時，執行下面這行啟用，並告知使用者已啟用：

```sh
git config core.hooksPath .githooks
```

這只改本 repo 的本機設定，不影響其他專案。如果已經設成別的路徑，不要覆蓋，先詢問使用者。

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
（hook 的啟用方式見最上方「開始工作前」。）
不要用 `--no-verify` 跳過它；被擋下時照上面的步驟修正。
