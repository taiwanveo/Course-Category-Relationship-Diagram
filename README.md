# 學院 AI 課程分類圖工具（v2）

一個純前端、單機可用的「課程類別關係圖」設計工具，並整合 AI 自動分類流程。專為中華電信學院（或任何學院／企業大學）整理大量課程而生：把上百個班名透過 AI 自動歸納成「主分類 ↔ 子分類 ↔ 班名」三層樹狀結構，並標上五大類標籤，讓學員、主管、講師都能一眼看懂課程地圖。

> **v2 重點突破**：AI 自動分類、Light/Dark 主題、多版型佈局、多分類圖管理、版本歷史、Excel/Markdown 三層匯出。

---

## 一、核心功能

### 1. AI 自動分類

- 支援三家供應商：**OpenAI**、**Google Gemini**、**xAI Grok**
- 內建 **Mock 離線模式**，未設定 API Key 也能體驗整體流程
- API Key 以 **Web Crypto AES-GCM + PBKDF2（200,000 iterations）** 加密後存於 IndexedDB，須由使用者主密碼派生金鑰，無外傳
- AI 結果有 **Hash 快取**（資料 + 模型 + 提示詞）以避免重複付費
- UI 上會顯示各家供應商的特性標籤（免費／付費／回應速度／品質）

### 2. 資料上傳與前處理

支援匯入 **CSV、Excel (.xlsx / .xls)、TXT、Markdown** 檔，自動：

1. 剖析資料、選擇要使用的「班名」欄位
2. 去除空白與重複
3. 輸入學科名稱（預設「人工智慧 (AI)」，可推廣到其他學科）
4. 選用提示詞欄位，可額外指定分類偏好
5. 呼叫 AI → 自動完成分類 + 標籤建議 → 套用到畫布

### 3. 五大類標籤系統

| 類別 | 預設項目 |
|------|---------|
| A. 對象 | 全員 / 主管 / 非IT (行政、人資、業務) / IT (開發、維運、架構) |
| B. 等級 | 基礎 ★ / 進階 ★★ / 專業 ★★★ |
| C. 屬性 | 善（會用）/ 用（流程化）/ 管（治理）/ 造（創新） |
| D. 主題 | 生成式 AI、提示工程、RAG/知識庫、Agent、流程自動化、資料治理、雲端 AI、資安合規 |
| E. 形式 | 一般課程 / 工作坊 / 研討會 / 證照班 |

所有預設都可在「標籤管理」介面中**自由新增、改名、改色、刪除**。標籤以彩色立體膠囊顯示，同類同色，便於辨識。

### 4. 三層結構呈現

| 層級 | 內容 | 呈現位置 |
|------|------|---------|
| 第一層 | 類別 ↔ 子類別 | 畫布主視圖（卡片 + 連線） |
| 第二層 | 各分類底下的班名 | **雙擊類別卡** 跳出 popup（支援 50+ 班名虛擬捲動） |
| 第三層 | 每個班名上的標籤 | 滑鼠 **hover 子類別** 顯示標籤匯總 / popup 內列出 |

### 5. 多種版型佈局

一鍵套用，保留所有連線關係：

- 自由佈局（不變動位置）
- 樹狀（左 → 右）
- 階層（上 → 下）
- 放射狀

### 6. 主題與配色

- **Light / Dark 模式**：頂部太陽月亮按鈕一鍵切換，主題立即生效
- **5 套配色方案**：Aurora（極光）/ Sunset（黃昏）/ Forest（森林）/ Ocean（海洋）/ Minimal（簡約）

### 7. 多分類圖管理

- 「我的分類圖」庫：新增 / 切換 / 重命名 / 複製 / 刪除 / 匯出 / 匯入
- 每張分類圖獨立儲存，含自己的標籤庫、學科名稱、版型設定
- 自動記住「最近開啟的分類圖」，重開瀏覽器時直接還原

### 8. 版本歷史

- AI 重新分類、版型變動等重大編輯**自動快照**
- 可手動建立**命名版本**（例如：「2026 Q1 定稿版」）
- 可預覽、復原、刪除任一版本
- 自動快照超過 30 筆會清掉最舊的；命名版本不受清理影響

### 9. 狀態回饋

- 右上角 **Toast 通知**（成功 / 警告 / 錯誤 / 資訊四色），重要動作自動提示
- 內建限流，避免短時間內重複訊息

---

## 二、儲存與跨裝置遷移

採用**雙軌儲存策略**，純前端、單機使用，跨裝置透過匯出/匯入 JSON 完成遷移。

### LocalStorage（輕量、同步、UI 啟動就要讀）

主題模式、版型、配色、AI 模型、最近開啟分類圖 ID。

### IndexedDB（大型、結構化，使用 Dexie.js 包裝）

| Store | 用途 |
|-------|------|
| `diagrams` | 完整分類圖（節點、連線、標籤、班名） |
| `versions` | 版本歷史快照 |
| `apiKeys` | 加密後的 API Key |
| `aiCache` | AI 結果快取 |
| `uploads` | 上傳的原始資料 |
| `kv` / `settings` | 其他偏好設定 |

### 匯出格式

| 格式 | 用途 |
|------|------|
| `.ccrd` | 編輯用單一分類圖（含資源），可再匯入 |
| `.xlsx` | 三層結構 Excel（班名 / 主分類 / 子分類 / 五類標籤） |
| `.md` | 三層結構 Markdown |
| `.png` | 整張白板高解析度圖 |
| `.pdf` | 與白板尺寸相符的 PDF |
| `.html` | 內嵌資料的唯讀檢視器（含縮放、雙擊看班名） |
| `env.json` | 完整環境（所有分類圖 + 加密 API Keys + UI 偏好） |

### 匯入

- 可自動辨識 `.ccrd` 編輯檔、單一分類圖 JSON、完整環境 JSON
- 衝突偵測（同 ID 已存在）→ 提供「**覆蓋 / 另存新檔 / 取消**」選項
- 環境匯入需要原本的主密碼才能解密 API Key
- **完全相容 v1 `.ccrd`**，會自動升級到 v3 結構（補上「屬性」標籤類、班名容器）

---

## 三、操作小提示

| 操作 | 說明 |
| --- | --- |
| **雙擊課程類別卡** | 開啟班名清單 popup |
| **Hover 課程類別卡** | 顯示標籤匯總預覽 |
| 雙擊文字 | 直接編輯文字內容 |
| 滑鼠右鍵（畫布或元件） | 動態內容選單 |
| Esc | 取消連線模式 / 取消選取 |
| Delete / Backspace | 刪除選取元件或連線 |
| Ctrl+D | 複製選取元件 |
| Ctrl+C / Ctrl+V | 複製貼上元件 |
| Ctrl+滑鼠滾輪 | 縮放白板 |
| 拖曳連線中段 | 新增彎折點 |
| 雙擊彎折點 | 刪除彎折點 |

---

## 四、安裝與啟動

### 直接開啟

雙擊 `index.html` 即可使用（建議 Chrome、Edge）。

### 本機開發伺服器（建議）

「匯出 HTML」會 fetch `app.css` 內嵌；用 `file://` 直開可能受 CORS 限制。建議用簡單 HTTP server：

```bash
# Python 3
python -m http.server 8080

# 或 Node.js
npx --yes http-server -p 8080 -c-1
```

---

## 五、檔案結構

```
.
├── index.html      主頁面（含所有 modal 骨架）
├── app.css         所有樣式（含 Light/Dark、5 套配色、3D 卡片）
├── app.js          主應用邏輯（多分類圖、班名、popup、版型、匯出）
├── storage.js      Dexie.js 儲存抽象（diagrams/versions/apiKeys/aiCache）
├── ai.js           AI 整合（Web Crypto 加密、3 家 + Mock 提供商）
└── README.md
```

---

## 六、第三方相依（CDN 載入）

| 套件 | 用途 |
|------|------|
| [Dexie.js 4.x](https://dexie.org/) | IndexedDB 友善包裝 |
| [JSZip](https://stuk.github.io/jszip/) | `.ccrd` zip 編輯存檔 |
| [SheetJS (xlsx)](https://sheetjs.com/) | Excel 匯入／匯出 |
| [PapaParse](https://www.papaparse.com/) | CSV 剖析 |
| [html2canvas](https://html2canvas.hertzen.com/) | 匯出 PNG / PDF |
| [jsPDF](https://github.com/parallax/jsPDF) | 匯出 PDF |
| Google Fonts | Noto Sans TC、Klee One、Zen Maru、M+ Rounded 等 |
| **Web Crypto API**（瀏覽器原生） | API Key AES-GCM + PBKDF2 加密 |

---

## 七、資料模型（v3）

```js
// 一張分類圖
{
  id: 'uuid',
  version: '3.0',
  name: '人工智慧課程分類圖',
  subject: '人工智慧 (AI)',
  board: { w, h, background: { type, baseColor, gridColor } },
  tagLibrary: {
    audience: [...], level: [...], attribute: [...], topic: [...], format: [...]
  },
  components: [
    {
      id, type: 'course-category',
      x, y, w, h, locked, zIndex,
      props: {
        title, subtitle,
        assignedTags: { audience: [tagId], level: [], attribute: [], topic: [], format: [] },
        classes: [
          { id, name, note, tags: { audience: [name], level: [], attribute: [], topic: [], format: [] } }
        ]
      },
      style: { ... }
    },
    // text / image / link / button / tag 元件
  ],
  connectors: [
    { id, fromComponentId, toComponentId, routeType: 'line'|'orthogonal'|'curve',
      style: { color, width, dash }, arrow: 'none'|'forward'|'both', label, waypoints: [{x,y}] }
  ],
  assets: { 'aXXX': 'data:image/png;base64,...' }
}
```

---

## 八、AI 設定流程

1. 點擊頂部「**AI 設定**」 → 設定**主密碼**（會以 PBKDF2 派生金鑰加密所有 API Key）
2. 在對應供應商貼上 API Key（會立即加密儲存到 IndexedDB）
3. 按「測試驗證」確認 Key 有效
4. 之後若重新整理瀏覽器，使用 AI 時系統會詢問主密碼一次以解密
5. **遺失主密碼即無法復原**（建議用密碼管理器保存）

---

## 九、跨裝置使用

- 所有資料**僅儲存於本瀏覽器**，換裝置或換瀏覽器須做匯出 → 匯入
- 建議定期使用「匯出 → 完整環境 JSON」做備份（可匯入到別台電腦繼續編輯）
- 重灌系統前務必先匯出！

---

## 十、版本歷程

- **v3 (2026)**：AI 整合、多分類圖、班名 popup、版型切換、版本歷史、Light/Dark、Excel/Markdown 匯出
- **v2 (MVP)**：單一白板版的課程類別關係圖工具（4 類標籤、卡片、連線、右鍵選單、`.ccrd`/PNG/PDF/HTML 匯出）
- **v1**：互動教學簡報製作器（已重構，被 v2 取代）

---

歡迎在「我的分類圖」中試試看「**新增分類圖** → 點擊 AI 分類 → 選 Mock 供應商」就能離線體驗整套流程！
