#!/usr/bin/env node
// 產生 export-bundle.js：把 app.css 與匯出 HTML 需要的圖片打包成 JS。
//
// 為什麼需要：用 file:// 直接開 index.html 時，瀏覽器禁止 fetch 本機檔案，
// 也禁止讀取 styleSheets.cssRules / canvas.toDataURL，唯一能帶進資料的方式是 <script src>。
// exportHTML() 在 fetch 失敗時會動態載入這個檔案當備援。
//
// 用法：
//   node tools/build-export-bundle.js          重新產生 export-bundle.js
//   node tools/build-export-bundle.js --check  只檢查是否與 app.css / assets 同步（不同步 exit 1）
//
// 修改 app.css 或下列圖片後，記得重新執行並一併 commit。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'export-bundle.js');
const CSS_FILE = 'app.css';
const IMAGES = ['assets/dot.png', 'assets/dots.png', 'assets/classification.png'];

function build() {
    const hash = crypto.createHash('sha256');
    // 統一 LF：core.autocrlf 會讓 checkout 出的 app.css 變 CRLF，避免 --check 因換行不同而誤判
    const css = fs.readFileSync(path.join(ROOT, CSS_FILE), 'utf8').replace(/\r\n/g, '\n');
    hash.update(css);
    const images = {};
    for (const rel of IMAGES) {
        const buf = fs.readFileSync(path.join(ROOT, rel));
        hash.update(rel).update(buf);
        images[rel] = 'data:image/png;base64,' + buf.toString('base64');
    }
    const bundle = { sourceHash: hash.digest('hex').slice(0, 16), css, images };
    return '// 自動產生，請勿手動編輯。來源：app.css + assets/*.png\n'
        + '// 重新產生：node tools/build-export-bundle.js\n'
        + 'window.__EXPORT_BUNDLE__ = ' + JSON.stringify(bundle) + ';\n';
}

const content = build();
if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== content) {
        console.error('export-bundle.js 與 app.css / assets 不同步，請執行：node tools/build-export-bundle.js');
        process.exit(1);
    }
    console.log('export-bundle.js 已同步');
} else {
    fs.writeFileSync(OUT, content);
    console.log('已產生 export-bundle.js（' + Math.round(content.length / 1024) + ' KB）');
}
