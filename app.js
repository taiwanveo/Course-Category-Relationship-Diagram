/* ============================================================
 * 學院 AI 課程分類圖工具 - 主應用程式 (v2)
 * ============================================================ */

// ============================================================
// 全域狀態
// ============================================================
let projectData = null;       // 當前作用中的 diagram（含 components/connectors/board/tagLibrary/assets）
let assets = {};              // 為相容 v1 寫法保留；實際同步到 projectData.assets
let selectedComponentId = null;     // 主要選取（給 property panel 用）
let selectedComponentIds = new Set(); // 多選集合（包含 selectedComponentId 與其他被選的）
let selectedConnectorId = null;
let groupIdCounter = 1;             // 用於建立新群組 ID
let componentIdCounter = 1;
let connectorIdCounter = 1;
let tagIdCounter = 1;
let classIdCounter = 1;

let connectorMode = false;
let connectorFirstId = null;

let clipboardComponent = null;
let clipboardStyle = null;
let activeTagManagerCat = 'audience';
let buttonPaletteSelectedColor = '#3b82f6';
let buttonPaletteForExisting = null;
let pendingTagPickerPosition = null;

let viewportZoom = 1;
let saveDraftTimeout = null;
let renderConnectorsRafId = null;

let activePopupCardId = null;
let classEditState = null;       // { cardId, classId | null, draft }
let uploadState = null;          // { step, file, parsed, columns, selectedColumn, classNames, ... }
let importPendingPayload = null; // { kind:'diagram'|'env', data, conflictId }
let activeMasterPasswordResolve = null;

// 常數
const BUTTON_PALETTE = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b',
    '#0f172a', '#475569', '#78716c', '#525252', '#171717', '#0c4a6e'
];

const DEFAULT_TAG_LIBRARY = {
    audience: [
        { name: '全員', color: '#64748b' },
        { name: '主管', color: '#8b5cf6' },
        { name: '非IT', color: '#0ea5e9' },
        { name: '行政', color: '#06b6d4' },
        { name: '人資', color: '#14b8a6' },
        { name: '業務', color: '#10b981' },
        { name: 'IT',   color: '#3b82f6' },
        { name: '開發', color: '#6366f1' },
        { name: '維運', color: '#a855f7' },
        { name: '架構', color: '#d946ef' }
    ],
    level: [
        { name: '基礎 ★',     color: '#22c55e' },
        { name: '進階 ★★',   color: '#f59e0b' },
        { name: '專業 ★★★', color: '#ef4444' }
    ],
    attribute: [
        { name: '善（會用）',     color: '#06b6d4' },
        { name: '用（流程化）',   color: '#3b82f6' },
        { name: '管（治理）',     color: '#8b5cf6' },
        { name: '造（創新）',     color: '#ec4899' }
    ],
    topic: [
        { name: '生成式 AI',   color: '#3b82f6' },
        { name: '提示工程',   color: '#6366f1' },
        { name: 'RAG/知識庫', color: '#8b5cf6' },
        { name: 'Agent',      color: '#a855f7' },
        { name: '流程自動化', color: '#06b6d4' },
        { name: '資料治理',   color: '#0ea5e9' },
        { name: '雲端 AI',    color: '#0e7490' },
        { name: '資安合規',   color: '#dc2626' }
    ],
    format: [
        { name: '一般課程', color: '#10b981' },
        { name: '工作坊',   color: '#f59e0b' },
        { name: '研討會',   color: '#0ea5e9' },
        { name: '證照',     color: '#dc2626' }
    ]
};

const TAG_CATEGORY_LABELS = {
    audience: 'A. 對象',
    level:    'B. 等級',
    attribute:'C. 屬性',
    topic:    'D. 主題',
    format:   'E. 形式'
};
const TAG_CATEGORY_KEYS = ['audience', 'level', 'attribute', 'topic', 'format'];

const BOARD_PRESETS = {
    '1920x1080': { w: 1920, h: 1080 },
    '2560x1440': { w: 2560, h: 1440 },
    '3200x1800': { w: 3200, h: 1800 },
    '3840x2160': { w: 3840, h: 2160 },
    '5120x2880': { w: 5120, h: 2880 }
};

const PALETTES = [
    { id: 'aurora',  name: 'Aurora 極光',   swatches: ['#6366f1', '#ec4899', '#a855f7'] },
    { id: 'sunset',  name: 'Sunset 黃昏',   swatches: ['#f97316', '#ef4444', '#fbbf24'] },
    { id: 'forest',  name: 'Forest 森林',   swatches: ['#10b981', '#14b8a6', '#84cc16'] },
    { id: 'ocean',   name: 'Ocean 海洋',    swatches: ['#0ea5e9', '#06b6d4', '#3b82f6'] },
    { id: 'minimal', name: 'Minimal 簡約',  swatches: ['#475569', '#64748b', '#94a3b8'] }
];

const LAYOUTS = [
    { id: 'free',          icon: '🖌️',   name: '自由',     desc: '不重排，沿用目前位置' },
    { id: 'tree-h',        icon: '🌳',   name: '樹狀（左→右）', desc: '以根節點為起點，由左至右展開' },
    { id: 'hierarchy-v',   icon: '🪜',   name: '階層（上→下）', desc: '由上往下分層；同層水平排列' },
    { id: 'radial',        icon: '☀️',   name: '放射狀',   desc: '根節點置中，子節點環繞' }
];

// ============================================================
// 啟動
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    boot().catch(err => {
        console.error('啟動失敗', err);
        toast('啟動失敗：' + (err.message || err), 'error');
    });
});

async function boot() {
    applyTheme(AppStorage.Settings.getTheme());
    // boot 階段：只設定 dataset/CSS 變數，不要去動既存卡片的 borderColor
    applyPalette(AppStorage.Settings.getPalette(), { applyToCards: false });
    applyViewMode(AppStorage.Settings.getViewMode(), { silent: true });

    // 嘗試遷移 v1 草稿
    await AppStorage.tryMigrateV1Draft();

    // 載入最近的 diagram
    let lastId = AppStorage.Settings.getLastDiagramId();
    let diagram = lastId ? await AppStorage.getDiagram(lastId) : null;
    if (!diagram) {
        // 找任一存在的 diagram
        const list = await AppStorage.listDiagrams();
        diagram = list[0];
    }
    if (!diagram) {
        // 建立首個空白 diagram
        diagram = createEmptyDiagram('新分類圖', '人工智慧 (AI)');
        await AppStorage.saveDiagram(diagram);
    }
    setActiveDiagram(diagram);
    setupEventListeners();
    if (AppStorage.Settings.isStorageNoticeDismissed()) {
        document.getElementById('storage-notice').classList.add('hidden');
    }
    applyBoardSettings();
    renderCanvas();
    updateStats();
    updateTitleBar();
}

// ============================================================
// Toast 系統
// ============================================================
function toast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toast-container');
    if (!container) { console.log('[toast]', message); return; }
    // 限流：同訊息 2 秒內不重複
    if (container._lastMsg === message && (Date.now() - (container._lastAt || 0)) < 2000) return;
    container._lastMsg = message;
    container._lastAt = Date.now();
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const icon = ({ success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' })[type] || 'ℹ️';
    el.innerHTML = `<span class="toast-icon">${icon}</span><div class="toast-body">${escapeHtml(message)}</div><button class="toast-close" title="關閉">✕</button>`;
    container.appendChild(el);
    const close = () => {
        el.classList.add('fadeout');
        setTimeout(() => el.remove(), 250);
    };
    el.querySelector('.toast-close').addEventListener('click', close);
    setTimeout(close, 4500);
}

// ============================================================
// 主題 / 配色
// ============================================================
function applyTheme(mode) {
    document.documentElement.dataset.theme = (mode === 'dark') ? 'dark' : 'light';
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = (mode === 'dark') ? '☀️' : '🌙';
    AppStorage.Settings.setTheme(mode);
}
function applyPalette(paletteId, opts) {
    opts = opts || {};
    const id = paletteId || 'aurora';
    document.documentElement.dataset.palette = id;
    AppStorage.Settings.setPalette(id);
    // 預設行為：套用到所有既存的課程類別卡（主/子/孤立各用 palette 對應的色）
    if (opts.applyToCards !== false && typeof projectData !== 'undefined' && projectData) {
        applyPaletteToCards(id, { silent: opts.silent });
    }
}

// 取得目前 palette 對應的顏色組合
function getPaletteColors(paletteId) {
    const id = paletteId || AppStorage.Settings.getPalette() || 'aurora';
    const p = PALETTES.find(x => x.id === id) || PALETTES[0];
    return { main: p.swatches[0], sub: p.swatches[1], orphan: p.swatches[2] || p.swatches[0], all: p.swatches };
}

// 把 palette 套到所有既存的課程類別卡（主/子/孤立各使用對應色）
function applyPaletteToCards(paletteId, opts) {
    opts = opts || {};
    if (!projectData) return;
    const cols = getPaletteColors(paletteId);
    const cards = projectData.components.filter(c => c.type === 'course-category');
    if (cards.length === 0) {
        if (!opts.silent) toast(`已切換為「${(PALETTES.find(p => p.id === paletteId) || {}).name || paletteId}」配色方案`, 'info');
        return;
    }
    let count = 0;
    cards.forEach(card => {
        const hasIncoming = projectData.connectors.some(cn => cn.toComponentId === card.id);
        const hasOutgoing = projectData.connectors.some(cn => cn.fromComponentId === card.id);
        let color;
        if (!hasIncoming && hasOutgoing) color = cols.main;       // 主分類
        else if (hasIncoming) color = cols.sub;                    // 子分類
        else color = cols.orphan;                                  // 孤立
        if (card.style.borderColor !== color) {
            card.style.borderColor = color;
            count++;
        }
    });
    if (count > 0) {
        snapshot('auto', `套用配色方案：${(PALETTES.find(p => p.id === paletteId) || {}).name || paletteId}`);
        renderCanvas();
        scheduleSaveDraft();
        if (!opts.silent) toast(`配色方案已套用到 ${count} 張卡片（如不滿意可從「版本」還原）`, 'success');
    } else if (!opts.silent) {
        toast(`已切換為「${(PALETTES.find(p => p.id === paletteId) || {}).name || paletteId}」配色方案`, 'info');
    }
}

// ============================================================
// 顯示模式（完整 ↔ 骨架）
//   full     - 顯示班名數量徽章、班名 hover 預覽、卡片班名行
//   skeleton - 全部隱藏，純展示分類骨架
// ============================================================
function applyViewMode(mode, opts) {
    opts = opts || {};
    const m = (mode === 'skeleton') ? 'skeleton' : 'full';
    document.documentElement.dataset.viewMode = m;
    AppStorage.Settings.setViewMode(m);
    const iconEl = document.getElementById('view-mode-icon');
    const labelEl = document.getElementById('view-mode-label');
    const btnEl = document.getElementById('btn-view-mode');
    // 按鈕採「動作式」：標示「點擊後會切到什麼」，避免使用者誤以為按下會留在當前模式
    // 當前是 full → 按鈕顯示「🦴 切到骨架」（按下會去骨架）
    // 當前是 skeleton → 按鈕顯示「👁️ 切回完整」（按下會回完整）
    if (iconEl) iconEl.textContent = (m === 'skeleton') ? '👁️' : '🦴';
    if (labelEl) labelEl.textContent = (m === 'skeleton') ? '切回完整' : '切到骨架';
    if (btnEl) {
        btnEl.classList.toggle('view-mode-skeleton', m === 'skeleton');
        btnEl.title = (m === 'skeleton')
            ? '當前：骨架模式（班名與標籤已隱藏）。點擊切回完整模式。'
            : '當前：完整模式。點擊切到骨架模式（暫時隱藏班名與標籤）';
    }
    // 只有 projectData 已就緒才重繪（boot 時會在 setActiveDiagram 之後另外觸發 renderCanvas）
    if (typeof projectData !== 'undefined' && projectData && typeof renderCanvas === 'function') {
        renderCanvas();
    }
    if (!opts.silent) {
        toast(m === 'skeleton' ? '已切換為骨架模式（班名暫時隱藏）' : '已切換為完整模式', 'info');
    }
}
function toggleViewMode() {
    const cur = AppStorage.Settings.getViewMode();
    applyViewMode(cur === 'skeleton' ? 'full' : 'skeleton');
}

// ============================================================
// Diagram 載入 / 切換
// ============================================================
function createEmptyDiagram(name, subject) {
    return {
        id: AppStorage.generateUUID(),
        version: '3.0',
        name: name || '新分類圖',
        subject: subject || '人工智慧 (AI)',
        board: { w: 3200, h: 1800, background: { type: 'fineGrid', baseColor: '#ffffff', gridColor: '#e2e8f0' } },
        tagLibrary: buildDefaultTagLibrary(),
        components: [],
        connectors: [],
        assets: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

function buildDefaultTagLibrary() {
    const lib = {};
    Object.keys(DEFAULT_TAG_LIBRARY).forEach(cat => {
        lib[cat] = DEFAULT_TAG_LIBRARY[cat].map(t => ({
            id: 't' + (tagIdCounter++),
            name: t.name,
            color: t.color
        }));
    });
    return lib;
}

function setActiveDiagram(diagram) {
    projectData = diagram;
    assets = projectData.assets || (projectData.assets = {});
    ensureDiagramIntegrity();
    selectedComponentId = null;
    selectedConnectorId = null;
    // 重置 ID counter
    let mc = 0, mn = 0, mt = 0, ml = 0;
    projectData.components.forEach(c => {
        const m = c.id && c.id.match(/^c(\d+)$/);
        if (m) mc = Math.max(mc, parseInt(m[1], 10));
        if (c.props && Array.isArray(c.props.classes)) {
            c.props.classes.forEach(cl => {
                const lm = cl.id && cl.id.match(/^cls(\d+)$/);
                if (lm) ml = Math.max(ml, parseInt(lm[1], 10));
            });
        }
    });
    projectData.connectors.forEach(c => {
        const m = c.id && c.id.match(/^conn(\d+)$/);
        if (m) mn = Math.max(mn, parseInt(m[1], 10));
    });
    TAG_CATEGORY_KEYS.forEach(cat => {
        (projectData.tagLibrary[cat] || []).forEach(t => {
            const m = (t.id || '').match(/^t(\d+)$/);
            if (m) mt = Math.max(mt, parseInt(m[1], 10));
        });
    });
    componentIdCounter = mc + 1;
    connectorIdCounter = mn + 1;
    tagIdCounter = Math.max(tagIdCounter, mt + 1);
    classIdCounter = ml + 1;
    AppStorage.Settings.setLastDiagramId(projectData.id);
}

function ensureDiagramIntegrity() {
    if (!projectData) return;
    if (!projectData.id) projectData.id = AppStorage.generateUUID();
    if (!projectData.name) projectData.name = '未命名分類圖';
    if (!projectData.subject) projectData.subject = '人工智慧 (AI)';
    if (!projectData.board) projectData.board = { w: 3200, h: 1800, background: { type: 'fineGrid', baseColor: '#ffffff', gridColor: '#e2e8f0' } };
    if (!projectData.board.background) projectData.board.background = { type: 'fineGrid', baseColor: '#ffffff', gridColor: '#e2e8f0' };
    if (!projectData.tagLibrary) projectData.tagLibrary = buildDefaultTagLibrary();
    TAG_CATEGORY_KEYS.forEach(cat => {
        if (!Array.isArray(projectData.tagLibrary[cat])) projectData.tagLibrary[cat] = [];
    });
    if (!projectData.seeded) projectData.seeded = {};

    // 自動補齊「屬性」分類預設值（首次開啟、適用於 v1 遷移過來的舊資料）
    // 種完後永久標記，使用者後續刪除不會被覆蓋
    if (!projectData.seeded.attribute) {
        if (projectData.tagLibrary.attribute.length === 0) {
            projectData.tagLibrary.attribute = DEFAULT_TAG_LIBRARY.attribute.map(t => ({
                id: 't' + (tagIdCounter++), name: t.name, color: t.color
            }));
        }
        projectData.seeded.attribute = true;
    }

    // 重命名 v1 殘留：證照模擬 → 證照
    (projectData.tagLibrary.format || []).forEach(t => {
        if (t.name === '證照模擬') t.name = '證照';
    });
    // 同步更新班名上記錄的標籤名稱（class 標籤儲存的是 name 字串）
    projectData.components.forEach(c => {
        if (c.type === 'course-category' && Array.isArray(c.props.classes)) {
            c.props.classes.forEach(cl => {
                if (cl.tags && Array.isArray(cl.tags.format)) {
                    cl.tags.format = cl.tags.format.map(n => n === '證照模擬' ? '證照' : n);
                }
            });
        }
    });

    if (!Array.isArray(projectData.components)) projectData.components = [];
    if (!Array.isArray(projectData.connectors)) projectData.connectors = [];
    if (!projectData.assets) projectData.assets = {};
    // 「靈感班名」清單：場景 B 上傳但不放入圖中的班名暫存區
    if (!Array.isArray(projectData.inspirationClasses)) projectData.inspirationClasses = [];
    // 升級 v1 卡片：補 attribute、classes
    projectData.components.forEach(c => {
        if (c.type === 'course-category') {
            if (!c.props.assignedTags) c.props.assignedTags = {};
            TAG_CATEGORY_KEYS.forEach(cat => {
                if (!Array.isArray(c.props.assignedTags[cat])) c.props.assignedTags[cat] = [];
            });
            if (!Array.isArray(c.props.classes)) c.props.classes = [];
        }
    });
}

async function persistCurrentDiagram() {
    if (!projectData) return;
    projectData.assets = assets;
    try {
        await AppStorage.saveDiagram(projectData);
    } catch (err) {
        console.warn('儲存失敗', err);
        toast('儲存失敗：' + err.message, 'error');
    }
}

function scheduleSaveDraft() {
    if (saveDraftTimeout) clearTimeout(saveDraftTimeout);
    saveDraftTimeout = setTimeout(() => persistCurrentDiagram(), 500);
}

function updateTitleBar() {
    const t = document.getElementById('current-diagram-title');
    const s = document.getElementById('current-diagram-subject');
    if (t) t.textContent = projectData.name || '未命名';
    if (s) s.textContent = projectData.subject ? '學科：' + projectData.subject : '';
}

// ============================================================
// 事件設定
// ============================================================
function setupEventListeners() {
    document.getElementById('btn-library').addEventListener('click', openLibrary);
    document.getElementById('btn-board-settings').addEventListener('click', openBoardSettings);
    document.getElementById('btn-tag-manager').addEventListener('click', openTagManager);
    document.getElementById('btn-theme-palette').addEventListener('click', openThemePalette);
    document.getElementById('btn-ai-settings').addEventListener('click', openAISettings);
    // AI 建構下拉選單（三模式）
    const aiWrap = document.getElementById('ai-action-dropdown-wrap');
    const aiBtn = document.getElementById('btn-upload-classify');
    aiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        aiWrap.classList.toggle('open');
    });
    document.querySelectorAll('#ai-action-dropdown .dropdown-item').forEach(b => {
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            aiWrap.classList.remove('open');
            openUploadWizard(b.dataset.aimode);
        });
    });
    document.addEventListener('click', () => aiWrap.classList.remove('open'));

    // 顯示模式切換（完整 ↔ 骨架）
    document.getElementById('btn-view-mode').addEventListener('click', toggleViewMode);
    // 智慧整理（一鍵）
    document.getElementById('btn-smart-layout').addEventListener('click', () => smartLayout());
    document.getElementById('btn-version-history').addEventListener('click', openVersionHistory);
    document.getElementById('btn-theme-toggle').addEventListener('click', () => {
        const cur = AppStorage.Settings.getTheme();
        applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-import').click());
    document.getElementById('file-import').addEventListener('change', handleImportFile);
    document.getElementById('file-image').addEventListener('change', handleImageFile);
    document.getElementById('storage-notice-close').addEventListener('click', () => {
        AppStorage.Settings.dismissStorageNotice();
        document.getElementById('storage-notice').classList.add('hidden');
    });

    // Export dropdown
    const expWrap = document.getElementById('export-dropdown-wrap');
    const expBtn = document.getElementById('btn-export-menu');
    expBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expWrap.classList.toggle('open');
    });
    document.querySelectorAll('#export-dropdown .dropdown-item').forEach(b => {
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            expWrap.classList.remove('open');
            handleExport(b.dataset.export);
        });
    });
    document.addEventListener('click', () => expWrap.classList.remove('open'));

    // 元件按鈕
    document.querySelectorAll('.component-btn[data-type]').forEach(btn => {
        btn.addEventListener('click', () => addComponent(btn.dataset.type));
    });
    document.getElementById('btn-add-button').addEventListener('click', openButtonPalette);
    document.getElementById('btn-add-tag').addEventListener('click', openTagPicker);
    document.getElementById('btn-connector-mode').addEventListener('click', () => {
        if (connectorMode) exitConnectorMode(); else enterConnectorMode();
    });

    // 縮放控制
    document.getElementById('btn-zoom-in').addEventListener('click', () => setViewportZoom(viewportZoom * 1.2));
    document.getElementById('btn-zoom-out').addEventListener('click', () => setViewportZoom(viewportZoom / 1.2));
    document.getElementById('btn-zoom-100').addEventListener('click', () => setViewportZoom(1));
    document.getElementById('btn-zoom-fit').addEventListener('click', fitZoom);

    // 畫布
    const canvas = document.getElementById('canvas');
    canvas.addEventListener('mousedown', (e) => {
        if (e.target === canvas || e.target.id === 'connector-layer' || e.target.tagName === 'svg') {
            if (e.button === 0 && connectorMode) { exitConnectorMode(); return; }
            // 左鍵在空白處 → 開始框選（marquee）。Shift 為「累加多選」模式
            if (e.button === 0) {
                startMarqueeSelection(e);
            }
        }
    });
    canvas.addEventListener('contextmenu', (e) => {
        if (e.target === canvas || e.target.id === 'connector-layer' || e.target.tagName === 'svg' || e.target.tagName === 'defs' || e.target.tagName === 'g') {
            e.preventDefault();
            showCanvasContextMenu(e);
        }
    });

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', () => hideContextMenu());
    document.addEventListener('contextmenu', (e) => {
        const inCanvas = e.target.closest && e.target.closest('#canvas');
        if (!inCanvas) hideContextMenu();
    });
    window.addEventListener('resize', applyViewportZoom);

    const outer = document.getElementById('canvas-wrapper-outer');
    outer.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            setViewportZoom(viewportZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        }
    }, { passive: false });

    // 畫布平移：Space + 拖曳，或滑鼠中鍵
    setupCanvasPanning();

    // Modals 內部的 listeners
    setupBoardSettingsModal();
    setupTagManagerModal();
    setupButtonPaletteModal();
    setupTagPickerModal();
    setupLibraryModal();
    setupDiagramMetaModal();
    setupThemePaletteModal();
    setupAISettingsModal();
    setupMasterPasswordModal();
    setupUploadModal();
    setupVersionModal();
    setupClassPopupModal();
    setupClassEditModal();
    setupImportConflictModal();

    // 預設 hover preview 隱藏
    document.getElementById('hover-preview').addEventListener('mouseenter', () => hideHoverPreview());

    // 屬性面板開關（mouse-leave 自動收合）
    setupPropertyPanelAutoHide();

    // 左側元件列收合
    setupSidebarLeftToggle();
}

// ============================================================
// 屬性面板：彈出/自動收合
// ============================================================
let propertyPanelHideTimer = null;
const PROPERTY_PANEL_HIDE_DELAY = 1500;

function showPropertyPanel() {
    const sb = document.getElementById('sidebar-right');
    if (sb) sb.classList.add('visible');
    cancelPropertyPanelHide();
}
function hidePropertyPanel() {
    const sb = document.getElementById('sidebar-right');
    if (sb) sb.classList.remove('visible');
}
function schedulePropertyPanelHide() {
    cancelPropertyPanelHide();
    propertyPanelHideTimer = setTimeout(() => {
        const sb = document.getElementById('sidebar-right');
        if (!sb) return;
        // 若內部仍有 input/select/textarea 處於 focus 則不關閉
        if (sb.matches(':focus-within')) return;
        // 若仍有選取，順便取消選取（與面板狀態同步）
        if (selectedComponentId || selectedConnectorId) {
            deselectAll();
        } else {
            hidePropertyPanel();
        }
    }, PROPERTY_PANEL_HIDE_DELAY);
}
function cancelPropertyPanelHide() {
    if (propertyPanelHideTimer) { clearTimeout(propertyPanelHideTimer); propertyPanelHideTimer = null; }
}
function setupPropertyPanelAutoHide() {
    const sb = document.getElementById('sidebar-right');
    if (!sb) return;
    sb.addEventListener('mouseenter', cancelPropertyPanelHide);
    sb.addEventListener('mouseleave', schedulePropertyPanelHide);
    // 任何 input 取得焦點 → 取消關閉計時
    sb.addEventListener('focusin', cancelPropertyPanelHide);
    // 任何 input 失去焦點且滑鼠不在面板內 → 排程關閉
    sb.addEventListener('focusout', () => {
        // 短延遲確保新焦點已更新
        setTimeout(() => {
            if (!sb.matches(':focus-within') && !sb.matches(':hover')) {
                schedulePropertyPanelHide();
            }
        }, 50);
    });
    document.getElementById('btn-close-property-panel').addEventListener('click', () => {
        deselectAll();
    });
}

// ============================================================
// 左側元件列收合
// ============================================================
function setupSidebarLeftToggle() {
    const sb = document.getElementById('sidebar-left');
    const btn = document.getElementById('btn-toggle-sidebar-left');
    if (!sb || !btn) return;
    // 從 LocalStorage 還原
    if (AppStorage.Settings.isSidebarLeftCollapsed && AppStorage.Settings.isSidebarLeftCollapsed()) {
        sb.classList.add('collapsed');
        btn.textContent = '▶';
        btn.title = '展開元件列';
    }
    btn.addEventListener('click', () => {
        const collapsed = sb.classList.toggle('collapsed');
        btn.textContent = collapsed ? '▶' : '◀';
        btn.title = collapsed ? '展開元件列' : '收合元件列';
        if (AppStorage.Settings.setSidebarLeftCollapsed) AppStorage.Settings.setSidebarLeftCollapsed(collapsed);
    });
}

// ============================================================
// 畫布平移：按住 Space + 滑鼠拖曳，或直接用滑鼠中鍵
// ============================================================
function setupCanvasPanning() {
    const outer = document.getElementById('canvas-wrapper-outer');
    if (!outer) return;
    let isSpaceDown = false;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let scrollStartX = 0, scrollStartY = 0;

    function isTypingTarget(el) {
        if (!el) return false;
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function isAnyModalOpen() {
        const modals = document.querySelectorAll('.modal-overlay');
        for (const m of modals) {
            if (m.style.display && m.style.display !== 'none') return true;
        }
        return false;
    }
    document.addEventListener('keydown', (e) => {
        if (e.code !== 'Space') return;
        if (isTypingTarget(e.target)) return;
        if (isAnyModalOpen()) return;
        e.preventDefault();
        if (!isSpaceDown) {
            isSpaceDown = true;
            outer.classList.add('panning-ready');
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.code !== 'Space') return;
        isSpaceDown = false;
        outer.classList.remove('panning-ready');
        if (!isPanning) outer.classList.remove('panning-active');
    });
    // 視窗失焦時重置（切換 tab 後 keyup 不會觸發）
    window.addEventListener('blur', () => {
        isSpaceDown = false;
        outer.classList.remove('panning-ready', 'panning-active');
    });

    // 在 capture 階段攔截，搶在 component / canvas 的 mousedown 之前
    outer.addEventListener('mousedown', (e) => {
        const middle = e.button === 1;
        const spaceLeft = e.button === 0 && isSpaceDown;
        if (!middle && !spaceLeft) return;
        e.preventDefault();
        e.stopPropagation();
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        scrollStartX = outer.scrollLeft;
        scrollStartY = outer.scrollTop;
        outer.classList.add('panning-active');

        const onMove = (ev) => {
            if (!isPanning) return;
            const dx = ev.clientX - panStartX;
            const dy = ev.clientY - panStartY;
            outer.scrollLeft = scrollStartX - dx;
            outer.scrollTop = scrollStartY - dy;
        };
        const onUp = () => {
            isPanning = false;
            outer.classList.remove('panning-active');
            if (!isSpaceDown) outer.classList.remove('panning-ready');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, true);

    // 阻止瀏覽器中鍵預設「自動捲動」（Windows）
    outer.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    outer.addEventListener('contextmenu', (e) => {
        // 中鍵拖曳結束時某些瀏覽器會觸發 contextmenu，這裡僅在平移後屏蔽
    });
}

function handleKeyDown(e) {
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'Escape') {
        if (connectorMode) { exitConnectorMode(); e.preventDefault(); return; }
        hideContextMenu();
        deselectAll();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedComponentIds.size > 0) {
            const ids = Array.from(selectedComponentIds);
            if (ids.length > 1) {
                if (!confirm(`刪除選取的 ${ids.length} 個元件？`)) return;
            }
            ids.forEach(id => deleteComponent(id));
            deselectAll();
            e.preventDefault();
        } else if (selectedConnectorId) { deleteConnector(selectedConnectorId); e.preventDefault(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (selectedComponentIds.size > 0) {
            const ids = Array.from(selectedComponentIds);
            const newIds = [];
            ids.forEach(id => {
                const c = getComponent(id); if (!c) return;
                const dup = JSON.parse(JSON.stringify(c));
                dup.id = 'comp' + (componentIdCounter++);
                dup.x += 30; dup.y += 30;
                dup.zIndex = nextTopZIndex();
                projectData.components.push(dup);
                newIds.push(dup.id);
            });
            renderCanvas();
            selectComponents(newIds);
            scheduleSaveDraft();
            e.preventDefault();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !e.shiftKey) {
        // Ctrl+A：全選所有未鎖定元件
        const allIds = projectData.components.filter(c => !c.locked).map(c => c.id);
        if (allIds.length) selectComponents(allIds);
        e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'g') {
        // Ctrl+G：群組
        groupSelected();
        e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
        // Ctrl+Shift+G：解除群組
        ungroupSelected();
        e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedComponentId) clipboardComponent = JSON.parse(JSON.stringify(getComponent(selectedComponentId)));
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboardComponent) {
            pasteComponent(clipboardComponent.x + 30, clipboardComponent.y + 30);
            e.preventDefault();
        }
    }
}

// ============================================================
// Board / 畫布
// ============================================================
function applyBoardSettings() {
    const canvas = document.getElementById('canvas');
    const board = projectData.board;
    canvas.style.width = board.w + 'px';
    canvas.style.height = board.h + 'px';
    canvas.dataset.bg = board.background.type;
    canvas.style.backgroundColor = board.background.baseColor;
    canvas.style.setProperty('--grid-color', board.background.gridColor);
    const svg = document.getElementById('connector-layer');
    svg.setAttribute('viewBox', `0 0 ${board.w} ${board.h}`);
    svg.setAttribute('width', board.w);
    svg.setAttribute('height', board.h);
    applyViewportZoom();
}

function applyViewportZoom() {
    const canvas = document.getElementById('canvas');
    canvas.style.transform = `scale(${viewportZoom})`;
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper && projectData) {
        const w = projectData.board.w * viewportZoom + 80;
        const h = projectData.board.h * viewportZoom + 80;
        wrapper.style.width = w + 'px';
        wrapper.style.height = h + 'px';
        wrapper.style.minWidth = w + 'px';
        wrapper.style.minHeight = h + 'px';
    }
    document.getElementById('canvas-zoom-info').textContent = `縮放 ${Math.round(viewportZoom * 100)}%`;
}

function setViewportZoom(z) {
    viewportZoom = Math.max(0.1, Math.min(4, z));
    applyViewportZoom();
}

function fitZoom() {
    const outer = document.getElementById('canvas-wrapper-outer');
    const padding = 80;
    const availW = outer.clientWidth - padding;
    const availH = outer.clientHeight - padding;
    const z = Math.min(availW / projectData.board.w, availH / projectData.board.h);
    setViewportZoom(Math.max(0.1, Math.min(2, z)));
}

function renderCanvas() {
    const canvas = document.getElementById('canvas');
    Array.from(canvas.children).forEach(child => {
        if (child.id !== 'connector-layer') canvas.removeChild(child);
    });
    const sorted = [...projectData.components].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    sorted.forEach(comp => {
        try { canvas.appendChild(createComponentElement(comp)); } catch (e) { console.error(e); }
    });
    renderConnectors();
    updateStats();
    // 重新套用多選 / 群組視覺（renderCanvas 會把 .selected 清掉）
    if (typeof refreshSelectionVisuals === 'function' && selectedComponentIds && selectedComponentIds.size > 0) {
        // 過濾掉已被刪除的 id
        selectedComponentIds = new Set(Array.from(selectedComponentIds).filter(id => getComponent(id)));
        if (!selectedComponentIds.has(selectedComponentId)) {
            selectedComponentId = selectedComponentIds.size > 0 ? Array.from(selectedComponentIds)[0] : null;
        }
        refreshSelectionVisuals();
    }
}

function updateStats() {
    if (!projectData) return;
    const cardCount = projectData.components.filter(c => c.type === 'course-category').length;
    const classCount = projectData.components.reduce((acc, c) => acc + (c.type === 'course-category' ? (c.props.classes || []).length : 0), 0);
    const connCount = projectData.connectors.length;
    const compCount = projectData.components.length;
    document.getElementById('canvas-stats').textContent = `類別 ${cardCount} / 班名 ${classCount} / 連線 ${connCount} / 元件 ${compCount}`;
}

// ============================================================
// 元件 - 建立 / 刪除 / 複製 / 層級
// ============================================================
function addComponent(type) {
    const comp = createComponent(type);
    placeNewComponent(comp);
    if (type === 'image') setTimeout(() => document.getElementById('file-image').click(), 30);
}
function placeNewComponent(comp) {
    const offset = (projectData.components.length % 8) * 24;
    comp.x = Math.max(40, Math.min(projectData.board.w - comp.w - 40, comp.x + offset));
    comp.y = Math.max(40, Math.min(projectData.board.h - comp.h - 40, comp.y + offset));
    comp.zIndex = nextTopZIndex();
    projectData.components.push(comp);
    renderCanvas();
    selectComponent(comp.id);
    scheduleSaveDraft();
}
function createComponent(type) {
    const id = 'c' + (componentIdCounter++);
    const base = { id, type, x: 200, y: 200, w: 320, h: 80, locked: false, zIndex: 0, props: {}, style: {} };
    switch (type) {
        case 'course-category':
            base.w = 320; base.h = 150;
            base.props = {
                title: '課程類別',
                subtitle: '副標題（可選）',
                assignedTags: { audience: [], level: [], attribute: [], topic: [], format: [] },
                classes: []
            };
            base.style = {
                fontFamily: "'Noto Sans TC', sans-serif",
                titleFontSize: 22,
                subtitleFontSize: 14,
                color: '#0f172a',
                backgroundColor: '#ffffff',
                borderColor: (typeof getPaletteColors === 'function' ? getPaletteColors().main : '#6366f1'),
                borderWidth: 1,
                borderStyle: 'solid',
                borderRadius: 16,
                padding: 16,
                boxShadow: '',
                textAlign: 'left',
                tagPosition: 'bottom'
            };
            break;
        case 'text': {
            base.w = 240; base.h = 50;
            base.props = { text: '請輸入文字' };
            const userDefault = AppStorage.Settings.getTextDefault && AppStorage.Settings.getTextDefault();
            if (userDefault) {
                base.style = Object.assign({}, userDefault);
                // 正規化舊版 'transparent' 字串
                if (base.style.backgroundColor === 'transparent') {
                    base.style.backgroundColor = '#ffffff';
                    base.style.backgroundOpacity = 0;
                } else if (base.style.backgroundOpacity == null) {
                    base.style.backgroundOpacity = 100;
                }
            } else {
                base.style = { fontFamily: "'Noto Sans TC', sans-serif", fontSize: 20, color: '#0f172a',
                  backgroundColor: '#ffffff', backgroundOpacity: 0, fontWeight: 400, textAlign: 'left' };
            }
            break;
        }
        case 'image':
            base.w = 280; base.h = 200;
            base.props = { assetId: null, keepAspectRatio: true };
            break;
        case 'link':
            base.w = 220; base.h = 36;
            base.props = { text: '連結文字', url: 'https://example.com' };
            base.style = { fontFamily: "'Noto Sans TC', sans-serif", fontSize: 16, color: '#2563eb' };
            break;
        case 'button':
            base.w = 160; base.h = 44;
            base.props = { text: '' };
            base.style = { fontFamily: "'Noto Sans TC', sans-serif", fontSize: 16, backgroundColor: buttonPaletteSelectedColor, color: '#ffffff', fontWeight: 600, borderRadius: 999 };
            break;
        case 'tag':
            base.w = 120; base.h = 30;
            base.props = { name: '標籤', tagCategory: 'topic', tagId: null };
            base.style = { fontFamily: "'Noto Sans TC', sans-serif", fontSize: 13, backgroundColor: '#3b82f6', color: '#ffffff' };
            break;
    }
    return base;
}
function nextTopZIndex() {
    let max = 0;
    projectData.components.forEach(c => { if ((c.zIndex || 0) > max) max = c.zIndex; });
    return max + 1;
}
function nextBottomZIndex() {
    let min = 0;
    projectData.components.forEach(c => { if ((c.zIndex || 0) < min) min = c.zIndex; });
    return min - 1;
}
function getComponent(id) { return projectData.components.find(c => c.id === id); }
function deleteComponent(id) {
    const idx = projectData.components.findIndex(c => c.id === id);
    if (idx < 0) return;
    projectData.components.splice(idx, 1);
    projectData.connectors = projectData.connectors.filter(c => c.fromComponentId !== id && c.toComponentId !== id);
    if (selectedComponentId === id) selectedComponentId = null;
    if (selectedComponentIds && selectedComponentIds.has(id)) selectedComponentIds.delete(id);
    renderCanvas();
    if (selectedComponentIds && selectedComponentIds.size === 0) updatePropertyPanel(null);
    scheduleSaveDraft();
}
function duplicateComponent(id) {
    const c = getComponent(id);
    if (!c) return;
    const dup = JSON.parse(JSON.stringify(c));
    dup.id = 'c' + (componentIdCounter++);
    if (Array.isArray(dup.props.classes)) {
        dup.props.classes = dup.props.classes.map(cl => ({ ...cl, id: 'cls' + (classIdCounter++) }));
    }
    dup.x = Math.min(projectData.board.w - dup.w - 20, dup.x + 30);
    dup.y = Math.min(projectData.board.h - dup.h - 20, dup.y + 30);
    dup.zIndex = nextTopZIndex();
    projectData.components.push(dup);
    renderCanvas();
    selectComponent(dup.id);
    scheduleSaveDraft();
}
function pasteComponent(x, y) {
    if (!clipboardComponent) return;
    const dup = JSON.parse(JSON.stringify(clipboardComponent));
    dup.id = 'c' + (componentIdCounter++);
    if (Array.isArray(dup.props.classes)) {
        dup.props.classes = dup.props.classes.map(cl => ({ ...cl, id: 'cls' + (classIdCounter++) }));
    }
    dup.x = Math.max(0, Math.min(projectData.board.w - dup.w, x));
    dup.y = Math.max(0, Math.min(projectData.board.h - dup.h, y));
    dup.zIndex = nextTopZIndex();
    projectData.components.push(dup);
    renderCanvas();
    selectComponent(dup.id);
    scheduleSaveDraft();
}
function moveComponentLayer(id, dir) {
    const c = getComponent(id); if (!c) return;
    if (dir === 'top') c.zIndex = nextTopZIndex();
    else if (dir === 'bottom') c.zIndex = nextBottomZIndex();
    else if (dir === 'up') c.zIndex = (c.zIndex || 0) + 1;
    else if (dir === 'down') c.zIndex = (c.zIndex || 0) - 1;
    renderCanvas();
    scheduleSaveDraft();
}
function toggleLockComponent(id) {
    const c = getComponent(id); if (!c) return;
    c.locked = !c.locked;
    renderCanvas();
    if (selectedComponentId === id) updatePropertyPanel(c);
    scheduleSaveDraft();
}

// ============================================================
// 元件 - 渲染
// ============================================================
function createComponentElement(comp) {
    const div = document.createElement('div');
    div.className = 'component component-' + comp.type;
    if (comp.type === 'course-category') div.classList.add('component-card');
    div.dataset.componentId = comp.id;
    div.style.left = comp.x + 'px';
    div.style.top = comp.y + 'px';
    div.style.width = comp.w + 'px';
    div.style.height = comp.h + 'px';
    div.style.zIndex = (comp.zIndex || 0) + 5;
    if (comp.locked) div.classList.add('locked');
    switch (comp.type) {
        case 'course-category': renderCategoryCard(div, comp); break;
        case 'text':            renderTextComponent(div, comp); break;
        case 'image':           renderImageComponent(div, comp); break;
        case 'link':            renderLinkComponent(div, comp); break;
        case 'button':          renderButtonComponent(div, comp); break;
        case 'tag':             renderTagComponent(div, comp); break;
    }
    if (selectedComponentIds && selectedComponentIds.has(comp.id)) {
        div.classList.add('selected');
        if (selectedComponentIds.size > 1) div.classList.add('multi-selected');
    }
    setupComponentInteractions(div, comp);
    if (selectedComponentIds && selectedComponentIds.size === 1 && comp.id === selectedComponentId && !comp.locked) {
        addResizeHandles(div, comp);
    }
    return div;
}

function renderCategoryCard(div, comp) {
    div.dataset.tagPosition = comp.style.tagPosition || 'bottom';
    // 偵測是否為主分類（有 outgoing connector 但沒 incoming），給 ::before accent strip 用
    if (typeof projectData !== 'undefined' && projectData) {
        const hasIncoming = projectData.connectors.some(cn => cn.toComponentId === comp.id);
        const hasOutgoing = projectData.connectors.some(cn => cn.fromComponentId === comp.id);
        if (!hasIncoming && hasOutgoing) div.dataset.role = 'main';
        else if (hasIncoming) div.dataset.role = 'sub';
        else delete div.dataset.role;
    }
    const s = comp.style;
    // accent strip 顏色（用 borderColor 當主色，由 CSS ::before 顯示）
    div.style.setProperty('--card-accent', s.borderColor || '#6366f1');
    div.style.background = s.backgroundColor;
    div.style.color = s.color;
    div.style.borderColor = s.borderColor;
    // 預設細邊框（1px），保留使用者自訂 borderWidth
    div.style.borderWidth = (s.borderWidth || 1) + 'px';
    div.style.borderStyle = s.borderStyle || 'solid';
    div.style.borderRadius = (s.borderRadius || 16) + 'px';
    div.style.boxShadow = s.boxShadow || '';
    div.style.fontFamily = s.fontFamily || 'inherit';
    div.style.textAlign = s.textAlign || 'left';

    const body = document.createElement('div');
    body.className = 'card-body';
    body.style.padding = (s.padding || 14) + 'px';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.style.fontSize = (s.titleFontSize || 22) + 'px';
    title.textContent = comp.props.title || '';
    const sub = document.createElement('div');
    sub.className = 'card-subtitle';
    sub.style.fontSize = (s.subtitleFontSize || 14) + 'px';
    sub.textContent = comp.props.subtitle || '';
    if (!comp.props.subtitle) sub.style.display = 'none';
    body.appendChild(title); body.appendChild(sub);

    const classes = comp.props.classes || [];
    const isSkeleton = AppStorage.Settings.getViewMode() === 'skeleton';
    if (!isSkeleton) {
        const classCount = document.createElement('div');
        classCount.className = 'card-classes-count';
        if (classes.length > 0) {
            classCount.innerHTML = `<span>📋 班名：</span><span class="count-badge">${classes.length}</span><span style="opacity:0.7;">（雙擊查看）</span>`;
        } else {
            classCount.innerHTML = `<span style="opacity:0.5;">尚無班名（雙擊新增）</span>`;
        }
        body.appendChild(classCount);
    }
    div.appendChild(body);

    // 標籤群（卡片層級的 assignedTags）— 骨架模式時不顯示
    if (!isSkeleton) {
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'card-tags';
        const at = comp.props.assignedTags || {};
        let total = 0;
        TAG_CATEGORY_KEYS.forEach(cat => {
            (at[cat] || []).forEach(tagId => {
                const tag = findTagById(cat, tagId); if (!tag) return;
                const chip = document.createElement('span');
                chip.className = 'card-tag';
                chip.style.background = tag.color;
                chip.textContent = tag.name;
                chip.title = TAG_CATEGORY_LABELS[cat] + '：' + tag.name;
                tagsWrap.appendChild(chip);
                total++;
            });
        });
        if (total > 0) div.appendChild(tagsWrap);
    }

    // hover 預覽
    div.addEventListener('mouseenter', (e) => showCardHoverPreview(comp, e));
    div.addEventListener('mousemove', (e) => moveHoverPreview(e));
    div.addEventListener('mouseleave', hideHoverPreview);
}

// 將「背景色 hex + 透明度 %」組合為 css 背景值（'transparent' 或 rgba()）
function composeBgColor(bgColor, opacityPercent) {
    if (bgColor == null || bgColor === 'transparent') return '';
    let op = (opacityPercent == null) ? 100 : Number(opacityPercent);
    if (isNaN(op)) op = 100;
    op = Math.max(0, Math.min(100, op));
    if (op === 0) return '';
    const m = String(bgColor).match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return bgColor;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    if (op === 100) return `rgb(${r}, ${g}, ${b})`;
    return `rgba(${r}, ${g}, ${b}, ${(op / 100).toFixed(2)})`;
}

function renderTextComponent(div, comp) {
    const s = comp.style;
    div.textContent = comp.props.text || '';
    div.style.fontFamily = s.fontFamily || 'inherit';
    div.style.fontSize = (s.fontSize || 20) + 'px';
    div.style.color = s.color || '#0f172a';
    div.style.background = composeBgColor(s.backgroundColor, s.backgroundOpacity);
    div.style.fontWeight = s.fontWeight || 400;
    div.style.textAlign = s.textAlign || 'left';
}
function renderImageComponent(div, comp) {
    const img = document.createElement('img');
    if (comp.props.assetId && assets[comp.props.assetId]) img.src = assets[comp.props.assetId];
    else img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="200"><rect width="280" height="200" fill="#f1f5f9" stroke="#cbd5e1"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#64748b" font-family="sans-serif" font-size="16">尚未選擇圖片</text></svg>');
    img.alt = '';
    div.appendChild(img);
}
function renderLinkComponent(div, comp) {
    const a = document.createElement('a');
    a.href = comp.props.url || '#';
    a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg><span>' + escapeHtml(comp.props.text || '連結') + '</span>';
    a.style.fontFamily = comp.style.fontFamily || 'inherit';
    a.style.fontSize = (comp.style.fontSize || 16) + 'px';
    a.style.color = comp.style.color || '#2563eb';
    div.appendChild(a);
}
function renderButtonComponent(div, comp) {
    const s = comp.style;
    div.style.background = s.backgroundColor || '#3b82f6';
    div.style.color = s.color || '#ffffff';
    div.style.fontFamily = s.fontFamily || 'inherit';
    div.style.fontSize = (s.fontSize || 16) + 'px';
    div.style.fontWeight = s.fontWeight || 600;
    div.style.borderRadius = (s.borderRadius != null ? s.borderRadius : 999) + 'px';
    // 預設不顯示文字，僅作純色塊使用；使用者可透過屬性面板隨時加文字
    div.textContent = comp.props.text || '';
}
function renderTagComponent(div, comp) {
    const s = comp.style;
    div.style.background = s.backgroundColor || '#3b82f6';
    div.style.color = s.color || '#ffffff';
    div.style.fontFamily = s.fontFamily || 'inherit';
    div.style.fontSize = (s.fontSize || 13) + 'px';
    div.textContent = comp.props.name || '標籤';
}
function findTagById(cat, id) {
    if (!projectData.tagLibrary[cat]) return null;
    return projectData.tagLibrary[cat].find(t => t.id === id);
}
function findTagByName(cat, name) {
    if (!projectData.tagLibrary[cat]) return null;
    return projectData.tagLibrary[cat].find(t => t.name === name);
}

// ============================================================
// 元件互動：拖曳、雙擊編輯、選取、右鍵
// ============================================================
function setupComponentInteractions(element, component) {
    if (component.type === 'text') {
        element.addEventListener('dblclick', () => beginInlineEdit(element, component, 'text'));
    }
    if (component.type === 'course-category') {
        element.addEventListener('dblclick', (e) => {
            // 不在 inline 編輯區則開啟 popup
            if (e.target.closest('.card-title.editing')) return;
            openClassPopup(component.id);
        });
    }
    element.addEventListener('mousedown', (e) => {
        if (e.button === 2) { e.preventDefault(); return; }
        if (connectorMode) {
            e.preventDefault(); e.stopPropagation();
            handleConnectorClick(component.id);
        }
    });
    element.addEventListener('click', (e) => {
        e.stopPropagation();
        if (connectorMode) return;
        // Shift / Ctrl / Cmd 點擊 → 累加選取（多選）
        const append = e.shiftKey || e.ctrlKey || e.metaKey;
        selectComponent(component.id, { append });
    });
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (connectorMode) { exitConnectorMode(); return; }
        // 若該元件不在目前選取集中，視為單選；若已在則保留多選狀態
        if (!selectedComponentIds.has(component.id)) {
            selectComponent(component.id);
        }
        showComponentContextMenu(e, component);
    });
    if (!component.locked) setupDrag(element, component);
}

function beginInlineEdit(element, component, propKey) {
    if (component.locked) return;
    element.contentEditable = true;
    element.classList.add('editing');
    element.focus();
    requestAnimationFrame(() => {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        sel.removeAllRanges(); sel.addRange(range);
    });
    const onBlur = () => {
        element.contentEditable = false;
        element.classList.remove('editing');
        component.props[propKey] = (element.textContent || '').trim();
        element.removeEventListener('blur', onBlur);
        scheduleSaveDraft();
        if (selectedComponentId === component.id) updatePropertyPanel(component);
    };
    element.addEventListener('blur', onBlur);
}

function setupDrag(element, component) {
    let isDragging = false;
    let dragStarted = false;
    let startX, startY;
    let dragSet = []; // [{ comp, startX, startY, el }]
    const THRESHOLD = 4;
    element.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (component.locked) return;
        if (connectorMode) return;
        if (e.target.classList && e.target.classList.contains('resize-handle')) return;
        const t = (e.target.tagName || '').toUpperCase();
        if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
        if (element.classList.contains('editing')) return;
        e.preventDefault(); e.stopPropagation();
        isDragging = true; dragStarted = false;
        startX = e.clientX; startY = e.clientY;

        // 計算「實際要拖的元件集合」優先順序：
        //   1. 已在 selectedComponentIds 中（多選） → 拖整個 selection
        //   2. 有 groupId → 拖整組
        //   3. 是「主分類」（course-category 且無 incoming、有 outgoing） → 連帶下游所有 card 一起平移
        //   4. 其他 → 只拖自己
        let dragIds;
        if (selectedComponentIds.has(component.id) && selectedComponentIds.size > 1) {
            dragIds = Array.from(selectedComponentIds);
        } else if (component.groupId) {
            dragIds = Array.from(expandSelectionByGroup(component.id));
        } else if (component.type === 'course-category') {
            const hasIncoming = projectData.connectors.some(cn => cn.toComponentId === component.id);
            const hasOutgoing = projectData.connectors.some(cn => cn.fromComponentId === component.id);
            if (!hasIncoming && hasOutgoing) {
                dragIds = Array.from(getDownstreamCardIds(component.id));
            } else {
                dragIds = [component.id];
            }
        } else {
            dragIds = [component.id];
        }
        dragSet = dragIds.map(id => {
            const c = getComponent(id);
            if (!c || c.locked) return null;
            const el = document.querySelector(`[data-component-id="${id}"]`);
            return { comp: c, startX: c.x, startY: c.y, el };
        }).filter(Boolean);

        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.body.style.userSelect = 'none';
    });
    function onMove(e) {
        if (!isDragging) return;
        const dx = (e.clientX - startX) / viewportZoom;
        const dy = (e.clientY - startY) / viewportZoom;
        if (!dragStarted && Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
        if (!dragStarted) {
            dragStarted = true;
            dragSet.forEach(d => d.el && d.el.classList.add('dragging'));
            // 若拖的元件未被選取，則此時才（單）選它
            if (!selectedComponentIds.has(component.id)) {
                selectComponent(component.id);
            }
        }
        e.preventDefault();
        // 計算「整批可移動」的 dx/dy（讓任何元件都不超出畫布邊界）
        let cdx = dx, cdy = dy;
        dragSet.forEach(d => {
            const projX = d.startX + cdx;
            const projY = d.startY + cdy;
            const minDx = -d.startX;
            const maxDx = projectData.board.w - d.comp.w - d.startX;
            const minDy = -d.startY;
            const maxDy = projectData.board.h - d.comp.h - d.startY;
            cdx = Math.max(minDx, Math.min(maxDx, cdx));
            cdy = Math.max(minDy, Math.min(maxDy, cdy));
        });
        dragSet.forEach(d => {
            d.comp.x = d.startX + cdx;
            d.comp.y = d.startY + cdy;
            if (d.el) {
                d.el.style.left = d.comp.x + 'px';
                d.el.style.top = d.comp.y + 'px';
            }
        });
        // 群組外框跟著移
        renderGroupBBox();
        scheduleRenderConnectors();
    }
    function onUp() {
        if (!isDragging) return;
        isDragging = false;
        if (dragStarted) {
            dragSet.forEach(d => d.el && d.el.classList.remove('dragging'));
            scheduleSaveDraft();
            if (selectedComponentIds.size === 1 && selectedComponentId === component.id) updatePropertyPanel(component);
        }
        dragSet = [];
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    }
}

function addResizeHandles(element, component) {
    if (component.locked) return;
    ['nw', 'ne', 'sw', 'se'].forEach(pos => {
        const handle = document.createElement('div');
        handle.className = 'resize-handle ' + pos;
        element.appendChild(handle);
        let startX, startY, startW, startH, startLeft, startTop, active = false;
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault(); e.stopPropagation();
            active = true;
            startX = e.clientX; startY = e.clientY;
            startW = component.w; startH = component.h;
            startLeft = component.x; startTop = component.y;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.body.style.userSelect = 'none';
        });
        function onMove(e) {
            if (!active) return;
            const dx = (e.clientX - startX) / viewportZoom;
            const dy = (e.clientY - startY) / viewportZoom;
            let newW = startW, newH = startH, newX = startLeft, newY = startTop;
            if (pos.includes('e')) newW = Math.max(40, startW + dx);
            if (pos.includes('w')) { newW = Math.max(40, startW - dx); newX = startLeft + (startW - newW); }
            if (pos.includes('s')) newH = Math.max(30, startH + dy);
            if (pos.includes('n')) { newH = Math.max(30, startH - dy); newY = startTop + (startH - newH); }
            if (component.type === 'image' && component.props.keepAspectRatio) {
                const ratio = startW / startH;
                if (Math.abs(dx) > Math.abs(dy)) newH = newW / ratio; else newW = newH * ratio;
            }
            component.w = newW; component.h = newH;
            component.x = Math.max(0, newX); component.y = Math.max(0, newY);
            element.style.width = newW + 'px'; element.style.height = newH + 'px';
            element.style.left = component.x + 'px'; element.style.top = component.y + 'px';
            scheduleRenderConnectors();
        }
        function onUp() {
            if (!active) return;
            active = false;
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (selectedComponentId === component.id) updatePropertyPanel(component);
            scheduleSaveDraft();
        }
    });
}

// ============================================================
// 選取（支援多選 + 群組）
// ============================================================
// 給定一個元件 id，回傳「應該被一起選取的」全部 id（自己 + 同 groupId 成員）
function expandSelectionByGroup(id) {
    const comp = getComponent(id);
    if (!comp || !comp.groupId) return new Set([id]);
    const ids = projectData.components.filter(c => c.groupId === comp.groupId).map(c => c.id);
    return new Set(ids);
}

// 給定一個 card id，回傳「自己 + 所有下游 card」（透過連線往下找子孫，BFS）
// 用於：拖曳主分類時連帶帶動子分類（不論是否群組化）
function getDownstreamCardIds(id) {
    const result = new Set([id]);
    const comp = getComponent(id);
    if (!comp || comp.type !== 'course-category') return result;
    const queue = [id];
    while (queue.length) {
        const cur = queue.shift();
        projectData.connectors.forEach(conn => {
            if (conn.fromComponentId === cur && !result.has(conn.toComponentId)) {
                const child = getComponent(conn.toComponentId);
                if (child && child.type === 'course-category') {
                    result.add(child.id);
                    queue.push(child.id);
                }
            }
        });
    }
    return result;
}

function selectComponent(id, opts) {
    opts = opts || {};
    selectedConnectorId = null;
    if (opts.append) {
        // Shift+click：toggle（若已選則移除；若未選則加入；新元件若有群組則整組加入）
        if (selectedComponentIds.has(id)) {
            // 取消選此元件（若它在群組內，整組一併取消）
            const groupSet = expandSelectionByGroup(id);
            groupSet.forEach(gid => selectedComponentIds.delete(gid));
            // 主要選取改為 set 中任一個（或 null）
            selectedComponentId = selectedComponentIds.size > 0 ? Array.from(selectedComponentIds).pop() : null;
        } else {
            // 加入此元件（若有群組整組加入）
            const groupSet = expandSelectionByGroup(id);
            groupSet.forEach(gid => selectedComponentIds.add(gid));
            selectedComponentId = id;
        }
    } else {
        // 一般點擊：清空後重設（若有群組整組選）
        selectedComponentIds = expandSelectionByGroup(id);
        selectedComponentId = id;
    }
    refreshSelectionVisuals();
    // property panel：單選顯示元件屬性，多選顯示「N 個元件已選取」
    if (selectedComponentIds.size === 1) {
        const comp = getComponent(selectedComponentId);
        updatePropertyPanel(comp);
        showPropertyPanel();
    } else if (selectedComponentIds.size > 1) {
        renderMultiSelectPropertyPanel();
        showPropertyPanel();
    } else {
        updatePropertyPanel(null);
        hidePropertyPanel();
    }
    renderWaypointHandles();
}
// 多選：直接設定一組 id（marquee / Ctrl+A 用）
function selectComponents(ids) {
    selectedConnectorId = null;
    selectedComponentIds = new Set(ids);
    selectedComponentId = ids.length > 0 ? ids[ids.length - 1] : null;
    refreshSelectionVisuals();
    if (selectedComponentIds.size === 1) {
        updatePropertyPanel(getComponent(selectedComponentId));
        showPropertyPanel();
    } else if (selectedComponentIds.size > 1) {
        renderMultiSelectPropertyPanel();
        showPropertyPanel();
    } else {
        updatePropertyPanel(null);
        hidePropertyPanel();
    }
    renderWaypointHandles();
}

// 重新渲染所有選取相關的視覺（.selected class、resize handles、群組外框）
function refreshSelectionVisuals() {
    document.querySelectorAll('.component').forEach(el => el.classList.remove('selected', 'multi-selected', 'in-formal-group'));
    document.querySelectorAll('.connector-path').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.resize-handle').forEach(h => h.remove());
    // 偵測：當前選取是否屬於同一個正式 groupId
    const selComps = Array.from(selectedComponentIds).map(id => getComponent(id)).filter(Boolean);
    const groupIds = new Set(selComps.map(c => c.groupId).filter(Boolean));
    const isFormalGroup = selComps.length >= 2 && groupIds.size === 1 && selComps.every(c => c.groupId);
    selectedComponentIds.forEach(id => {
        const el = document.querySelector(`[data-component-id="${id}"]`);
        if (!el) return;
        el.classList.add('selected');
        if (selectedComponentIds.size > 1) {
            el.classList.add('multi-selected');
            if (isFormalGroup) el.classList.add('in-formal-group');
        }
    });
    // 單選且未鎖定：加 resize handles
    if (selectedComponentIds.size === 1) {
        const id = selectedComponentId;
        const el = document.querySelector(`[data-component-id="${id}"]`);
        const comp = getComponent(id);
        if (el && comp && !comp.locked) addResizeHandles(el, comp);
    }
    renderGroupBBox();
}

// 渲染群組/多選的虛線包圍框（被選取時才顯示）
function renderGroupBBox() {
    // 移除舊的
    document.querySelectorAll('.group-bbox').forEach(el => el.remove());
    if (selectedComponentIds.size < 2) return; // 單選不畫
    const comps = Array.from(selectedComponentIds).map(id => getComponent(id)).filter(Boolean);
    if (comps.length < 2) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    comps.forEach(c => {
        minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h);
    });
    const pad = 8;
    const bbox = document.createElement('div');
    bbox.className = 'group-bbox';
    bbox.style.left = (minX - pad) + 'px';
    bbox.style.top = (minY - pad) + 'px';
    bbox.style.width = (maxX - minX + pad * 2) + 'px';
    bbox.style.height = (maxY - minY + pad * 2) + 'px';
    // 判斷是「同 groupId 整組」還是「臨時多選」
    const groupIds = new Set(comps.map(c => c.groupId).filter(Boolean));
    const isFormalGroup = groupIds.size === 1 && comps.every(c => c.groupId);
    if (isFormalGroup) bbox.classList.add('formal-group');
    document.getElementById('canvas').appendChild(bbox);
}

// 多選時的屬性面板：顯示彙總操作
function renderMultiSelectPropertyPanel() {
    const panel = document.getElementById('property-panel');
    const ids = Array.from(selectedComponentIds);
    const comps = ids.map(id => getComponent(id)).filter(Boolean);
    const groupIds = new Set(comps.map(c => c.groupId).filter(Boolean));
    const isFormalGroup = groupIds.size === 1 && comps.every(c => c.groupId);
    const html = `
        <div class="property-section">
            <div class="property-section-title">多重選取（${ids.length} 個元件）${isFormalGroup ? '<span style="color:var(--primary);font-size:11px;">［正式群組］</span>' : ''}</div>
            <p style="font-size:12px;color:var(--text-muted);margin:6px 0 12px;">
                ${isFormalGroup
                    ? '這些元件已群組。拖曳任一個會整組移動。'
                    : '臨時多選。拖曳任一個會整批移動。可建立正式群組（永久保存）。'}
            </p>
            <div class="property-actions" style="flex-wrap:wrap;gap:6px;">
                ${isFormalGroup
                    ? `<button class="btn btn-small btn-danger" id="btn-multi-ungroup">解除群組（Ctrl+Shift+G）</button>`
                    : `<button class="btn btn-small btn-primary" id="btn-multi-group">建立群組（Ctrl+G）</button>`}
                <button class="btn btn-small" id="btn-multi-align-left">⫷ 左對齊</button>
                <button class="btn btn-small" id="btn-multi-align-center">∥ 水平置中</button>
                <button class="btn btn-small" id="btn-multi-align-right">⫸ 右對齊</button>
                <button class="btn btn-small" id="btn-multi-align-top">⫶ 上對齊</button>
                <button class="btn btn-small" id="btn-multi-align-middle">═ 垂直置中</button>
                <button class="btn btn-small" id="btn-multi-align-bottom">⫶ 下對齊</button>
                <button class="btn btn-small" id="btn-multi-distribute-h">⇔ 水平等距</button>
                <button class="btn btn-small" id="btn-multi-distribute-v">⇕ 垂直等距</button>
                <button class="btn btn-small" id="btn-multi-duplicate">複製全部</button>
                <button class="btn btn-small btn-danger" id="btn-multi-delete">刪除全部</button>
            </div>
        </div>`;
    panel.innerHTML = html;
    bindMultiSelectActions(ids);
}

function bindMultiSelectActions(ids) {
    const $ = (id) => document.getElementById(id);
    if ($('btn-multi-group')) $('btn-multi-group').addEventListener('click', () => groupSelected());
    if ($('btn-multi-ungroup')) $('btn-multi-ungroup').addEventListener('click', () => ungroupSelected());
    if ($('btn-multi-delete')) $('btn-multi-delete').addEventListener('click', () => {
        if (!confirm(`刪除選取的 ${ids.length} 個元件？`)) return;
        ids.forEach(id => deleteComponent(id));
        deselectAll();
    });
    if ($('btn-multi-duplicate')) $('btn-multi-duplicate').addEventListener('click', () => {
        const newIds = [];
        ids.forEach(id => {
            const c = getComponent(id); if (!c) return;
            const dup = JSON.parse(JSON.stringify(c));
            dup.id = 'comp' + (componentIdCounter++);
            dup.x += 30; dup.y += 30;
            dup.zIndex = nextTopZIndex();
            projectData.components.push(dup);
            newIds.push(dup.id);
        });
        renderCanvas(); selectComponents(newIds); scheduleSaveDraft();
    });
    // 對齊（取選取中的最小/中/最大邊界對齊）
    const align = (key) => alignSelected(ids, key);
    if ($('btn-multi-align-left')) $('btn-multi-align-left').addEventListener('click', () => align('left'));
    if ($('btn-multi-align-center')) $('btn-multi-align-center').addEventListener('click', () => align('center'));
    if ($('btn-multi-align-right')) $('btn-multi-align-right').addEventListener('click', () => align('right'));
    if ($('btn-multi-align-top')) $('btn-multi-align-top').addEventListener('click', () => align('top'));
    if ($('btn-multi-align-middle')) $('btn-multi-align-middle').addEventListener('click', () => align('middle'));
    if ($('btn-multi-align-bottom')) $('btn-multi-align-bottom').addEventListener('click', () => align('bottom'));
    if ($('btn-multi-distribute-h')) $('btn-multi-distribute-h').addEventListener('click', () => distributeSelected(ids, 'h'));
    if ($('btn-multi-distribute-v')) $('btn-multi-distribute-v').addEventListener('click', () => distributeSelected(ids, 'v'));
}

function alignSelected(ids, mode) {
    const comps = ids.map(id => getComponent(id)).filter(Boolean);
    if (comps.length < 2) return;
    if (mode === 'left') {
        const x = Math.min(...comps.map(c => c.x));
        comps.forEach(c => c.x = x);
    } else if (mode === 'right') {
        const x = Math.max(...comps.map(c => c.x + c.w));
        comps.forEach(c => c.x = x - c.w);
    } else if (mode === 'center') {
        const cx = comps.reduce((s, c) => s + c.x + c.w / 2, 0) / comps.length;
        comps.forEach(c => c.x = cx - c.w / 2);
    } else if (mode === 'top') {
        const y = Math.min(...comps.map(c => c.y));
        comps.forEach(c => c.y = y);
    } else if (mode === 'bottom') {
        const y = Math.max(...comps.map(c => c.y + c.h));
        comps.forEach(c => c.y = y - c.h);
    } else if (mode === 'middle') {
        const cy = comps.reduce((s, c) => s + c.y + c.h / 2, 0) / comps.length;
        comps.forEach(c => c.y = cy - c.h / 2);
    }
    renderCanvas(); refreshSelectionVisuals(); scheduleSaveDraft();
}
function distributeSelected(ids, axis) {
    const comps = ids.map(id => getComponent(id)).filter(Boolean);
    if (comps.length < 3) { toast('等距分布需要至少 3 個元件', 'warning'); return; }
    if (axis === 'h') {
        comps.sort((a, b) => a.x - b.x);
        const minX = comps[0].x;
        const maxX = comps[comps.length - 1].x;
        const step = (maxX - minX) / (comps.length - 1);
        comps.forEach((c, i) => { if (i > 0 && i < comps.length - 1) c.x = Math.round(minX + step * i); });
    } else {
        comps.sort((a, b) => a.y - b.y);
        const minY = comps[0].y;
        const maxY = comps[comps.length - 1].y;
        const step = (maxY - minY) / (comps.length - 1);
        comps.forEach((c, i) => { if (i > 0 && i < comps.length - 1) c.y = Math.round(minY + step * i); });
    }
    renderCanvas(); refreshSelectionVisuals(); scheduleSaveDraft();
}

// 群組：給選取中的元件分配同一個 groupId
function groupSelected() {
    if (selectedComponentIds.size < 2) { toast('需要選取 2 個以上的元件才能群組', 'warning'); return; }
    const groupId = 'g' + Date.now() + '_' + (groupIdCounter++);
    const ids = Array.from(selectedComponentIds);
    ids.forEach(id => {
        const c = getComponent(id);
        if (c) c.groupId = groupId;
    });
    snapshot('auto', `建立群組（${ids.length} 個元件）`);
    scheduleSaveDraft();
    selectComponents(ids); // 重新整理 panel 顯示「正式群組」
    toast(`已建立群組（${ids.length} 個元件）`, 'success');
}
function ungroupSelected() {
    if (selectedComponentIds.size === 0) return;
    const ids = Array.from(selectedComponentIds);
    let count = 0;
    ids.forEach(id => {
        const c = getComponent(id);
        if (c && c.groupId) { delete c.groupId; count++; }
    });
    if (count === 0) { toast('選取的元件沒有群組關係', 'info'); return; }
    snapshot('auto', `解除群組（${count} 個元件）`);
    scheduleSaveDraft();
    selectComponents(ids);
    toast(`已解除 ${count} 個元件的群組關係`, 'success');
}

function selectConnector(id) {
    selectedConnectorId = id;
    selectedComponentId = null;
    selectedComponentIds = new Set();
    document.querySelectorAll('.component').forEach(el => el.classList.remove('selected', 'multi-selected'));
    document.querySelectorAll('.connector-path').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.resize-handle').forEach(h => h.remove());
    document.querySelectorAll('.group-bbox').forEach(el => el.remove());
    const path = document.querySelector(`[data-connector-id="${id}"].connector-path`);
    if (path) path.classList.add('selected');
    const conn = getConnector(id);
    updatePropertyPanel(null, conn);
    renderWaypointHandles();
    showPropertyPanel();
}
function deselectAll() {
    selectedComponentId = null;
    selectedComponentIds = new Set();
    selectedConnectorId = null;
    document.querySelectorAll('.component').forEach(el => el.classList.remove('selected', 'multi-selected'));
    document.querySelectorAll('.connector-path').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.resize-handle').forEach(h => h.remove());
    document.querySelectorAll('.group-bbox').forEach(el => el.remove());
    updatePropertyPanel(null);
    renderWaypointHandles();
    hidePropertyPanel();
}

// ============================================================
// 框選（Marquee）
//   - 在 canvas 空白處按下左鍵並拖曳超過閾值 → 顯示半透明選取框
//   - mouseup 時把框內的元件全部選起來
//   - 按住 Shift/Ctrl/Cmd：累加到目前選取（不清空原本的）
// ============================================================
function startMarqueeSelection(downEvent) {
    const canvas = document.getElementById('canvas');
    const additive = downEvent.shiftKey || downEvent.ctrlKey || downEvent.metaKey;
    const canvasRect = canvas.getBoundingClientRect();
    // 起點（canvas 內邏輯座標）
    const sx = (downEvent.clientX - canvasRect.left) / viewportZoom;
    const sy = (downEvent.clientY - canvasRect.top) / viewportZoom;
    let curX = sx, curY = sy;
    let started = false;
    const THRESHOLD = 4;
    const prevSelection = additive ? new Set(selectedComponentIds) : new Set();
    if (!additive) deselectAll();

    let marqueeEl = null;
    function ensureMarqueeEl() {
        if (marqueeEl) return marqueeEl;
        marqueeEl = document.createElement('div');
        marqueeEl.className = 'marquee-selection';
        canvas.appendChild(marqueeEl);
        return marqueeEl;
    }
    function updateMarqueeEl() {
        if (!marqueeEl) return;
        const x = Math.min(sx, curX), y = Math.min(sy, curY);
        const w = Math.abs(curX - sx), h = Math.abs(curY - sy);
        marqueeEl.style.left = x + 'px';
        marqueeEl.style.top = y + 'px';
        marqueeEl.style.width = w + 'px';
        marqueeEl.style.height = h + 'px';
    }
    function onMove(e) {
        curX = (e.clientX - canvasRect.left) / viewportZoom;
        curY = (e.clientY - canvasRect.top) / viewportZoom;
        if (!started) {
            const dx = curX - sx, dy = curY - sy;
            if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
            started = true;
            ensureMarqueeEl();
            document.body.style.userSelect = 'none';
        }
        updateMarqueeEl();
        // 即時高亮（可選效果）：套用 marquee-hovering 給命中元件
        const x1 = Math.min(sx, curX), y1 = Math.min(sy, curY);
        const x2 = Math.max(sx, curX), y2 = Math.max(sy, curY);
        document.querySelectorAll('.component').forEach(el => {
            const id = el.dataset.componentId;
            const c = getComponent(id);
            if (!c) return;
            const hit = !(c.x + c.w < x1 || c.x > x2 || c.y + c.h < y1 || c.y > y2);
            el.classList.toggle('marquee-hover', hit);
        });
    }
    function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        document.querySelectorAll('.component').forEach(el => el.classList.remove('marquee-hover'));
        if (marqueeEl) { marqueeEl.remove(); marqueeEl = null; }
        if (!started) return; // 純單擊（沒拖），不變更選取
        const x1 = Math.min(sx, curX), y1 = Math.min(sy, curY);
        const x2 = Math.max(sx, curX), y2 = Math.max(sy, curY);
        const hit = projectData.components.filter(c => {
            return !(c.x + c.w < x1 || c.x > x2 || c.y + c.h < y1 || c.y > y2);
        }).map(c => c.id);
        // 累加模式：將命中的 id 併入 prevSelection；否則直接用 hit
        const finalIds = additive ? Array.from(new Set([...prevSelection, ...hit])) : hit;
        // 群組擴展：任何被選中的若有 groupId，整組納入
        const expanded = new Set(finalIds);
        finalIds.forEach(id => expandSelectionByGroup(id).forEach(g => expanded.add(g)));
        selectComponents(Array.from(expanded));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ============================================================
// 屬性面板
// ============================================================
function updatePropertyPanel(comp, conn) {
    const panel = document.getElementById('property-panel');
    if (conn) { panel.innerHTML = renderConnectorPropertyHTML(conn); bindConnectorPropertyEvents(conn); return; }
    if (!comp) { panel.innerHTML = '<p class="placeholder">請選擇元件以編輯屬性</p>'; return; }
    panel.innerHTML = renderComponentPropertyHTML(comp);
    bindComponentPropertyEvents(comp);
}

function renderComponentPropertyHTML(comp) {
    const commonHeader = `
        <div class="property-section">
            <div class="property-section-title">${getTypeLabel(comp.type)}</div>
            <div class="property-row">
                <div class="property-group"><label>X</label><input type="number" id="prop-x" value="${Math.round(comp.x)}"></div>
                <div class="property-group"><label>Y</label><input type="number" id="prop-y" value="${Math.round(comp.y)}"></div>
            </div>
            <div class="property-row">
                <div class="property-group"><label>寬</label><input type="number" id="prop-w" value="${Math.round(comp.w)}"></div>
                <div class="property-group"><label>高</label><input type="number" id="prop-h" value="${Math.round(comp.h)}"></div>
            </div>
            <div class="property-actions">
                <button class="btn btn-small" id="btn-prop-front">置頂</button>
                <button class="btn btn-small" id="btn-prop-back">置底</button>
                <button class="btn btn-small" id="btn-prop-lock">${comp.locked ? '解鎖' : '鎖定'}</button>
                <button class="btn btn-small" id="btn-prop-duplicate">複製</button>
                <button class="btn btn-small btn-danger" id="btn-prop-delete">刪除</button>
            </div>
        </div>`;
    let body = '';
    if (comp.type === 'course-category') body = renderCardPropertyHTML(comp);
    else if (comp.type === 'text')       body = renderTextPropertyHTML(comp);
    else if (comp.type === 'image')      body = renderImagePropertyHTML(comp);
    else if (comp.type === 'link')       body = renderLinkPropertyHTML(comp);
    else if (comp.type === 'button')     body = renderButtonPropertyHTML(comp);
    else if (comp.type === 'tag')        body = renderTagComponentPropertyHTML(comp);
    return body + commonHeader;
}

function getTypeLabel(type) {
    return ({
        'course-category': '課程類別卡片',
        'text': '文字', 'image': '圖片', 'link': '連結', 'button': '記號色塊', 'tag': '獨立標籤'
    })[type] || type;
}

function renderCardPropertyHTML(comp) {
    const s = comp.style; const p = comp.props;
    return `
        <div class="property-section">
            <div class="property-section-title">內容</div>
            <div class="property-group"><label>主標題</label><input type="text" id="prop-title" value="${escapeAttr(p.title || '')}"></div>
            <div class="property-group"><label>副標題</label><input type="text" id="prop-subtitle" value="${escapeAttr(p.subtitle || '')}"></div>
            <div class="property-actions">
                <button class="btn btn-small btn-primary" id="btn-open-class-popup">📋 管理班名（${(p.classes || []).length}）</button>
            </div>
        </div>
        <div class="property-section">
            <div class="property-section-title">字型與字級</div>
            <div class="property-group"><label>字型</label><select id="prop-fontFamily">${fontFamilyOptions(s.fontFamily)}</select></div>
            <div class="property-row">
                <div class="property-group"><label>主標字級</label><input type="number" id="prop-titleFontSize" value="${s.titleFontSize || 22}" min="8" max="80"></div>
                <div class="property-group"><label>副標字級</label><input type="number" id="prop-subtitleFontSize" value="${s.subtitleFontSize || 14}" min="8" max="60"></div>
            </div>
            <div class="property-group"><label>對齊</label><select id="prop-textAlign">
                <option value="left" ${s.textAlign === 'left' ? 'selected' : ''}>靠左</option>
                <option value="center" ${s.textAlign === 'center' ? 'selected' : ''}>置中</option>
                <option value="right" ${s.textAlign === 'right' ? 'selected' : ''}>靠右</option>
            </select></div>
        </div>
        <div class="property-section">
            <div class="property-section-title">顏色</div>
            <div class="property-group"><label>文字顏色</label>${colorInput('prop-color', s.color || '#0f172a')}</div>
            <div class="property-group"><label>底色</label>${colorInput('prop-backgroundColor', s.backgroundColor || '#ffffff')}</div>
            <div class="property-group"><label>邊框顏色</label>${colorInput('prop-borderColor', s.borderColor || '#2563eb')}</div>
        </div>
        <div class="property-section">
            <div class="property-section-title">邊框與外觀</div>
            <div class="property-row">
                <div class="property-group"><label>邊框粗細</label><input type="number" id="prop-borderWidth" value="${s.borderWidth != null ? s.borderWidth : 2}" min="0" max="20"></div>
                <div class="property-group"><label>邊框樣式</label><select id="prop-borderStyle">
                    <option value="solid" ${s.borderStyle === 'solid' ? 'selected' : ''}>實線</option>
                    <option value="dashed" ${s.borderStyle === 'dashed' ? 'selected' : ''}>虛線</option>
                    <option value="dotted" ${s.borderStyle === 'dotted' ? 'selected' : ''}>點線</option>
                    <option value="double" ${s.borderStyle === 'double' ? 'selected' : ''}>雙線</option>
                    <option value="none" ${s.borderStyle === 'none' ? 'selected' : ''}>無邊框</option>
                </select></div>
            </div>
            <div class="property-row">
                <div class="property-group"><label>圓角</label><input type="number" id="prop-borderRadius" value="${s.borderRadius != null ? s.borderRadius : 14}" min="0" max="60"></div>
                <div class="property-group"><label>內距</label><input type="number" id="prop-padding" value="${s.padding != null ? s.padding : 14}" min="0" max="60"></div>
            </div>
            <div class="property-group"><label>陰影</label><select id="prop-boxShadow">
                <option value="" ${!s.boxShadow ? 'selected' : ''}>無</option>
                <option value="0 1px 3px rgba(0,0,0,0.06)" ${s.boxShadow === '0 1px 3px rgba(0,0,0,0.06)' ? 'selected' : ''}>輕微</option>
                <option value="0 2px 6px rgba(0,0,0,0.08)" ${s.boxShadow === '0 2px 6px rgba(0,0,0,0.08)' ? 'selected' : ''}>淺</option>
                <option value="0 4px 12px rgba(0,0,0,0.12)" ${s.boxShadow === '0 4px 12px rgba(0,0,0,0.12)' ? 'selected' : ''}>中</option>
                <option value="0 10px 25px rgba(0,0,0,0.15)" ${s.boxShadow === '0 10px 25px rgba(0,0,0,0.15)' ? 'selected' : ''}>強</option>
            </select></div>
        </div>
        <div class="property-section">
            <div class="property-section-title">標籤（卡片層級）</div>
            <div class="property-group"><label>標籤位置</label><select id="prop-tagPosition">
                <option value="bottom" ${s.tagPosition === 'bottom' ? 'selected' : ''}>底部</option>
                <option value="topRight" ${s.tagPosition === 'topRight' ? 'selected' : ''}>右上角</option>
            </select></div>
            <div id="tag-checker"></div>
        </div>`;
}

function renderTextPropertyHTML(comp) {
    const s = comp.style; const p = comp.props;
    return `
        <div class="property-section">
            <div class="property-section-title">文字內容</div>
            <div class="property-group"><textarea id="prop-text" rows="3">${escapeHtml(p.text || '')}</textarea></div>
        </div>
        <div class="property-section">
            <div class="property-section-title">字型</div>
            <div class="property-group"><label>字型</label><select id="prop-fontFamily">${fontFamilyOptions(s.fontFamily)}</select></div>
            <div class="property-row">
                <div class="property-group"><label>字級</label><input type="number" id="prop-fontSize" value="${s.fontSize || 20}" min="8" max="200"></div>
                <div class="property-group"><label>粗細</label><select id="prop-fontWeight">
                    <option value="300" ${s.fontWeight == 300 ? 'selected' : ''}>細</option>
                    <option value="400" ${(s.fontWeight == 400 || !s.fontWeight) ? 'selected' : ''}>標準</option>
                    <option value="500" ${s.fontWeight == 500 ? 'selected' : ''}>中等</option>
                    <option value="700" ${s.fontWeight == 700 ? 'selected' : ''}>粗</option>
                    <option value="900" ${s.fontWeight == 900 ? 'selected' : ''}>特粗</option>
                </select></div>
            </div>
            <div class="property-group"><label>對齊</label><select id="prop-textAlign">
                <option value="left" ${s.textAlign === 'left' ? 'selected' : ''}>靠左</option>
                <option value="center" ${s.textAlign === 'center' ? 'selected' : ''}>置中</option>
                <option value="right" ${s.textAlign === 'right' ? 'selected' : ''}>靠右</option>
            </select></div>
        </div>
        <div class="property-section">
            <div class="property-section-title">顏色</div>
            <div class="property-group"><label>文字顏色</label>${colorInput('prop-color', s.color || '#0f172a')}</div>
            <div class="property-group">
                <label>背景顏色</label>
                ${colorInput('prop-backgroundColor', (s.backgroundColor && s.backgroundColor !== 'transparent') ? s.backgroundColor : '#ffffff')}
                <div class="opacity-slider-row">
                    <span style="font-size:11px;color:var(--text-muted);min-width:36px;">透明度</span>
                    <input type="range" id="prop-backgroundOpacity" class="opacity-slider" min="0" max="100" step="1" value="${(s.backgroundOpacity != null) ? s.backgroundOpacity : (s.backgroundColor === 'transparent' || !s.backgroundColor ? 0 : 100)}">
                    <span class="opacity-slider-value" id="prop-backgroundOpacity-value">${(s.backgroundOpacity != null) ? s.backgroundOpacity : (s.backgroundColor === 'transparent' || !s.backgroundColor ? 0 : 100)}%</span>
                </div>
            </div>
        </div>
        <div class="property-section">
            <div class="property-section-title">預設樣式</div>
            <div class="property-group" style="display:flex;gap:6px;flex-direction:column;">
                <button id="prop-text-set-default" class="btn btn-small btn-set-default" title="把目前的字型/顏色/背景儲存為「新增文字方塊」的預設值">⭐ 設定為預設</button>
                <button id="prop-text-clear-default" class="btn btn-small" title="清除目前儲存的預設樣式">🗑️ 清除已存預設</button>
                <small id="prop-text-default-status" style="color:var(--text-muted);font-size:11px;"></small>
            </div>
        </div>`;
}

function renderImagePropertyHTML(comp) {
    const p = comp.props;
    return `
        <div class="property-section">
            <div class="property-section-title">圖片</div>
            <div class="property-actions">
                <button class="btn btn-small btn-primary" id="btn-pick-image">選擇圖片</button>
                <button class="btn btn-small" id="btn-clear-image">清除</button>
            </div>
            <div class="property-group" style="margin-top:8px;">
                <label><input type="checkbox" id="prop-keepAspect" ${p.keepAspectRatio ? 'checked' : ''}> 縮放時保持比例</label>
            </div>
        </div>`;
}
function renderLinkPropertyHTML(comp) {
    const s = comp.style; const p = comp.props;
    return `
        <div class="property-section">
            <div class="property-section-title">連結</div>
            <div class="property-group"><label>顯示文字</label><input type="text" id="prop-text" value="${escapeAttr(p.text || '')}"></div>
            <div class="property-group"><label>網址</label><input type="text" id="prop-url" value="${escapeAttr(p.url || '')}"></div>
            <div class="property-row">
                <div class="property-group"><label>字級</label><input type="number" id="prop-fontSize" value="${s.fontSize || 16}" min="8" max="120"></div>
                <div class="property-group"><label>顏色</label>${colorInput('prop-color', s.color || '#2563eb')}</div>
            </div>
        </div>`;
}
function renderButtonPropertyHTML(comp) {
    const s = comp.style; const p = comp.props;
    return `
        <div class="property-section">
            <div class="property-section-title">按鈕</div>
            <div class="property-group"><label>文字</label><input type="text" id="prop-text" value="${escapeAttr(p.text || '')}"></div>
            <div class="property-row">
                <div class="property-group"><label>底色</label>${colorInput('prop-backgroundColor', s.backgroundColor || '#3b82f6')}</div>
                <div class="property-group"><label>文字顏色</label>${colorInput('prop-color', s.color || '#ffffff')}</div>
            </div>
            <div class="property-row">
                <div class="property-group"><label>字級</label><input type="number" id="prop-fontSize" value="${s.fontSize || 16}" min="8" max="80"></div>
                <div class="property-group"><label>圓角</label><input type="number" id="prop-borderRadius" value="${s.borderRadius != null ? s.borderRadius : 999}" min="0" max="999"></div>
            </div>
            <div class="property-group"><label>字型</label><select id="prop-fontFamily">${fontFamilyOptions(s.fontFamily)}</select></div>
            <div class="property-actions">
                <button class="btn btn-small" id="btn-open-palette">從色票挑選</button>
            </div>
        </div>`;
}
function renderTagComponentPropertyHTML(comp) {
    const s = comp.style; const p = comp.props;
    return `
        <div class="property-section">
            <div class="property-section-title">獨立標籤</div>
            <div class="property-group"><label>名稱</label><input type="text" id="prop-name" value="${escapeAttr(p.name || '')}"></div>
            <div class="property-row">
                <div class="property-group"><label>底色</label>${colorInput('prop-backgroundColor', s.backgroundColor || '#3b82f6')}</div>
                <div class="property-group"><label>文字顏色</label>${colorInput('prop-color', s.color || '#ffffff')}</div>
            </div>
            <div class="property-group"><label>字級</label><input type="number" id="prop-fontSize" value="${s.fontSize || 13}" min="8" max="40"></div>
        </div>`;
}
function renderConnectorPropertyHTML(conn) {
    const s = conn.style || {};
    const fromComp = getComponent(conn.fromComponentId);
    const toComp = getComponent(conn.toComponentId);
    return `
        <div class="property-section">
            <div class="property-section-title">連線</div>
            <div class="property-group"><label>起點 → 終點</label>
                <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(getCardLabel(fromComp))} → ${escapeHtml(getCardLabel(toComp))}</div></div>
            <div class="property-group"><label>路徑樣式</label><select id="prop-conn-route">
                <option value="line" ${conn.routeType === 'line' ? 'selected' : ''}>直線</option>
                <option value="orthogonal" ${conn.routeType === 'orthogonal' ? 'selected' : ''}>兩折</option>
                <option value="curve" ${conn.routeType === 'curve' ? 'selected' : ''}>曲線</option>
            </select></div>
            <div class="property-group"><label>箭頭</label><select id="prop-conn-arrow">
                <option value="none" ${conn.arrow === 'none' ? 'selected' : ''}>無</option>
                <option value="forward" ${conn.arrow === 'forward' ? 'selected' : ''}>單向 →</option>
                <option value="both" ${conn.arrow === 'both' ? 'selected' : ''}>雙向 ↔</option>
            </select></div>
            <div class="property-row">
                <div class="property-group"><label>顏色</label>${colorInput('prop-conn-color', s.color || '#475569')}</div>
                <div class="property-group"><label>粗細</label><input type="number" id="prop-conn-width" value="${s.width || 2}" min="1" max="12"></div>
            </div>
            <div class="property-group"><label>線型</label><select id="prop-conn-dash">
                <option value="solid" ${s.dash === 'solid' ? 'selected' : ''}>實線</option>
                <option value="dashed" ${s.dash === 'dashed' ? 'selected' : ''}>虛線</option>
            </select></div>
            <div class="property-group"><label>中段文字標籤</label><input type="text" id="prop-conn-label" value="${escapeAttr(conn.label || '')}"></div>
            <div class="property-actions">
                <button class="btn btn-small" id="btn-conn-clear-waypoints">清除彎折點</button>
                <button class="btn btn-small btn-danger" id="btn-conn-delete">刪除連線</button>
            </div>
        </div>`;
}
function getCardLabel(comp) {
    if (!comp) return '(已刪除)';
    if (comp.type === 'course-category') return comp.props.title || '未命名類別';
    if (comp.type === 'text') return (comp.props.text || '').slice(0, 20) || '文字';
    if (comp.type === 'tag') return comp.props.name || '標籤';
    return getTypeLabel(comp.type);
}
function fontFamilyOptions(current) {
    const fonts = [
        ["'Noto Sans TC', sans-serif", 'Noto Sans 黑體'],
        ["'Noto Serif TC', serif", 'Noto 明體'],
        ["'Klee One', cursive", 'Klee 手寫'],
        ["'Zen Maru Gothic', sans-serif", 'Zen 圓體'],
        ["'M PLUS Rounded 1c', sans-serif", 'M+ 圓體'],
        ["'Microsoft JhengHei', sans-serif", '微軟正黑體'],
        ["'PMingLiU', serif", '新細明體'],
        ["serif", '系統明體'],
        ["sans-serif", '系統黑體'],
        ["monospace", '等寬字型']
    ];
    return fonts.map(([val, label]) => `<option value="${val}" ${current === val ? 'selected' : ''}>${label}</option>`).join('');
}
function colorInput(idPrefix, value) {
    return `<div class="color-input-group"><input type="color" id="${idPrefix}" value="${value}"><input type="text" id="${idPrefix}-text" value="${value}"></div>`;
}

function bindComponentPropertyEvents(comp) {
    const x = document.getElementById('prop-x');
    if (x) x.addEventListener('change', (e) => { comp.x = parseFloat(e.target.value) || 0; renderCanvas(); scheduleSaveDraft(); });
    const y = document.getElementById('prop-y');
    if (y) y.addEventListener('change', (e) => { comp.y = parseFloat(e.target.value) || 0; renderCanvas(); scheduleSaveDraft(); });
    const w = document.getElementById('prop-w');
    if (w) w.addEventListener('change', (e) => { comp.w = Math.max(20, parseFloat(e.target.value) || 0); renderCanvas(); scheduleSaveDraft(); });
    const h = document.getElementById('prop-h');
    if (h) h.addEventListener('change', (e) => { comp.h = Math.max(20, parseFloat(e.target.value) || 0); renderCanvas(); scheduleSaveDraft(); });
    bindIfExists('btn-prop-front', 'click', () => moveComponentLayer(comp.id, 'top'));
    bindIfExists('btn-prop-back', 'click', () => moveComponentLayer(comp.id, 'bottom'));
    bindIfExists('btn-prop-lock', 'click', () => toggleLockComponent(comp.id));
    bindIfExists('btn-prop-duplicate', 'click', () => duplicateComponent(comp.id));
    bindIfExists('btn-prop-delete', 'click', () => { if (confirm('確定刪除此元件？')) deleteComponent(comp.id); });

    syncColorPair('prop-color', (v) => { comp.style.color = v; renderCanvas(); scheduleSaveDraft(); });
    // text 元件的 backgroundColor 綁定使用更專門的邏輯（含透明度自動拉動），下方會處理
    if (comp.type !== 'text') {
        syncColorPair('prop-backgroundColor', (v) => { comp.style.backgroundColor = v; renderCanvas(); scheduleSaveDraft(); });
    }
    syncColorPair('prop-borderColor', (v) => { comp.style.borderColor = v; renderCanvas(); scheduleSaveDraft(); });

    if (comp.type === 'course-category') {
        bindInput('prop-title', (v) => { comp.props.title = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-subtitle', (v) => { comp.props.subtitle = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-fontFamily', (v) => { comp.style.fontFamily = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-titleFontSize', (v) => { comp.style.titleFontSize = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-subtitleFontSize', (v) => { comp.style.subtitleFontSize = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-textAlign', (v) => { comp.style.textAlign = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-borderWidth', (v) => { comp.style.borderWidth = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-borderStyle', (v) => { comp.style.borderStyle = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-borderRadius', (v) => { comp.style.borderRadius = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-padding', (v) => { comp.style.padding = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-boxShadow', (v) => { comp.style.boxShadow = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-tagPosition', (v) => { comp.style.tagPosition = v; renderCanvas(); scheduleSaveDraft(); });
        bindIfExists('btn-open-class-popup', 'click', () => openClassPopup(comp.id));
        renderTagChecker(comp);
    }
    if (comp.type === 'text') {
        bindInput('prop-text', (v) => { comp.props.text = v; renderCanvas(); scheduleSaveDraft(); }, 'textarea');
        bindInput('prop-fontFamily', (v) => { comp.style.fontFamily = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-fontSize', (v) => { comp.style.fontSize = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-fontWeight', (v) => { comp.style.fontWeight = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-textAlign', (v) => { comp.style.textAlign = v; renderCanvas(); scheduleSaveDraft(); });
        // 背景色：調色盤
        syncColorPair('prop-backgroundColor', (v) => {
            comp.style.backgroundColor = v;
            // 第一次選色時若透明度為 0，自動拉到 100% 以便看到顏色
            if ((comp.style.backgroundOpacity == null || comp.style.backgroundOpacity === 0)) {
                comp.style.backgroundOpacity = 100;
                const opSlider = document.getElementById('prop-backgroundOpacity');
                const opLabel = document.getElementById('prop-backgroundOpacity-value');
                if (opSlider) opSlider.value = 100;
                if (opLabel) opLabel.textContent = '100%';
            }
            renderCanvas(); scheduleSaveDraft();
        });
        // 透明度進度條
        const opSlider = document.getElementById('prop-backgroundOpacity');
        const opLabel = document.getElementById('prop-backgroundOpacity-value');
        if (opSlider) {
            opSlider.addEventListener('input', (e) => {
                const v = parseInt(e.target.value, 10);
                comp.style.backgroundOpacity = v;
                // 從舊資料 (transparent) 拉動 slider → 自動補白色色相
                if (v > 0 && (!comp.style.backgroundColor || comp.style.backgroundColor === 'transparent')) {
                    comp.style.backgroundColor = '#ffffff';
                    const bgPicker = document.getElementById('prop-backgroundColor');
                    const bgText = document.getElementById('prop-backgroundColor-text');
                    if (bgPicker) bgPicker.value = '#ffffff';
                    if (bgText) bgText.value = '#ffffff';
                }
                if (opLabel) opLabel.textContent = v + '%';
                renderCanvas(); scheduleSaveDraft();
            });
        }
        // 設為預設 / 清除預設
        const status = document.getElementById('prop-text-default-status');
        const updateStatus = () => {
            if (!status) return;
            const cur = AppStorage.Settings.getTextDefault && AppStorage.Settings.getTextDefault();
            status.textContent = cur ? '✓ 已儲存使用者預設' : '尚未儲存任何預設';
        };
        updateStatus();
        bindIfExists('prop-text-set-default', 'click', () => {
            const styleSnapshot = {
                fontFamily: comp.style.fontFamily,
                fontSize: comp.style.fontSize,
                fontWeight: comp.style.fontWeight,
                textAlign: comp.style.textAlign,
                color: comp.style.color,
                backgroundColor: comp.style.backgroundColor,
                backgroundOpacity: comp.style.backgroundOpacity
            };
            AppStorage.Settings.setTextDefault(styleSnapshot);
            updateStatus();
            showToast('已設定為新增文字方塊的預設樣式', 'success');
        });
        bindIfExists('prop-text-clear-default', 'click', () => {
            AppStorage.Settings.clearTextDefault();
            updateStatus();
            showToast('已清除使用者預設樣式', 'info');
        });
    }
    if (comp.type === 'image') {
        bindIfExists('btn-pick-image', 'click', () => { selectComponent(comp.id); document.getElementById('file-image').click(); });
        bindIfExists('btn-clear-image', 'click', () => { comp.props.assetId = null; renderCanvas(); scheduleSaveDraft(); });
        const cb = document.getElementById('prop-keepAspect');
        if (cb) cb.addEventListener('change', (e) => { comp.props.keepAspectRatio = e.target.checked; });
    }
    if (comp.type === 'link') {
        bindInput('prop-text', (v) => { comp.props.text = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-url', (v) => { comp.props.url = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-fontSize', (v) => { comp.style.fontSize = v; renderCanvas(); scheduleSaveDraft(); });
    }
    if (comp.type === 'button') {
        bindInput('prop-text', (v) => { comp.props.text = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-fontSize', (v) => { comp.style.fontSize = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-borderRadius', (v) => { comp.style.borderRadius = v; renderCanvas(); scheduleSaveDraft(); });
        bindInput('prop-fontFamily', (v) => { comp.style.fontFamily = v; renderCanvas(); scheduleSaveDraft(); });
        bindIfExists('btn-open-palette', 'click', () => openButtonPaletteForExisting(comp));
    }
    if (comp.type === 'tag') {
        bindInput('prop-name', (v) => { comp.props.name = v; renderCanvas(); scheduleSaveDraft(); });
        bindNumber('prop-fontSize', (v) => { comp.style.fontSize = v; renderCanvas(); scheduleSaveDraft(); });
    }
}

function bindConnectorPropertyEvents(conn) {
    bindInput('prop-conn-route', (v) => { conn.routeType = v; renderConnectors(); scheduleSaveDraft(); });
    bindInput('prop-conn-arrow', (v) => { conn.arrow = v; renderConnectors(); scheduleSaveDraft(); });
    syncColorPair('prop-conn-color', (v) => { conn.style.color = v; renderConnectors(); scheduleSaveDraft(); });
    bindNumber('prop-conn-width', (v) => { conn.style.width = v; renderConnectors(); scheduleSaveDraft(); });
    bindInput('prop-conn-dash', (v) => { conn.style.dash = v; renderConnectors(); scheduleSaveDraft(); });
    bindInput('prop-conn-label', (v) => { conn.label = v; renderConnectors(); scheduleSaveDraft(); });
    bindIfExists('btn-conn-clear-waypoints', 'click', () => { conn.waypoints = []; renderConnectors(); renderWaypointHandles(); scheduleSaveDraft(); });
    bindIfExists('btn-conn-delete', 'click', () => { if (confirm('刪除此連線？')) deleteConnector(conn.id); });
}

function renderTagChecker(comp) {
    const wrap = document.getElementById('tag-checker'); if (!wrap) return;
    wrap.className = 'tag-checker'; wrap.innerHTML = '';
    if (!comp.props.assignedTags) comp.props.assignedTags = { audience: [], level: [], attribute: [], topic: [], format: [] };
    TAG_CATEGORY_KEYS.forEach(cat => {
        const catWrap = document.createElement('div'); catWrap.className = 'tag-checker-cat';
        const lbl = document.createElement('div'); lbl.className = 'tag-checker-cat-label'; lbl.textContent = TAG_CATEGORY_LABELS[cat];
        catWrap.appendChild(lbl);
        const row = document.createElement('div'); row.className = 'tag-checker-row';
        const lib = projectData.tagLibrary[cat] || [];
        if (lib.length === 0) {
            const empty = document.createElement('div'); empty.className = 'tag-checker-empty'; empty.textContent = '（尚無標籤）';
            catWrap.appendChild(empty);
        } else {
            lib.forEach(tag => {
                const chip = document.createElement('span'); chip.className = 'tag-checker-chip';
                chip.textContent = tag.name; chip.style.background = tag.color;
                if ((comp.props.assignedTags[cat] || []).includes(tag.id)) chip.classList.add('checked');
                chip.addEventListener('click', () => {
                    const arr = comp.props.assignedTags[cat] = comp.props.assignedTags[cat] || [];
                    const idx = arr.indexOf(tag.id);
                    if (idx >= 0) arr.splice(idx, 1); else arr.push(tag.id);
                    chip.classList.toggle('checked');
                    renderCanvas(); scheduleSaveDraft();
                });
                row.appendChild(chip);
            });
            catWrap.appendChild(row);
        }
        wrap.appendChild(catWrap);
    });
}
function syncColorPair(idPrefix, onChange) {
    const c = document.getElementById(idPrefix);
    const t = document.getElementById(idPrefix + '-text');
    if (c) c.addEventListener('input', () => { if (t) t.value = c.value; onChange(c.value); });
    if (t) t.addEventListener('input', () => {
        const v = t.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(v) || /^#[0-9A-Fa-f]{3}$/.test(v)) { if (c) c.value = v; onChange(v); }
        else if (v && (v === 'transparent' || /^rgba?\(/.test(v))) onChange(v);
    });
}
function bindInput(id, fn, type) {
    const el = document.getElementById(id); if (!el) return;
    const evt = (type === 'textarea' || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'number')) ? 'input' : 'change';
    el.addEventListener(evt, (e) => fn(e.target.value));
}
function bindNumber(id, fn) {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('input', (e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) fn(n); });
}
function bindIfExists(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }

// ============================================================
// 連線
// ============================================================
function getConnector(id) { return projectData.connectors.find(c => c.id === id); }
function addConnector(fromId, toId) {
    if (fromId === toId) return null;
    const exists = projectData.connectors.find(c => c.fromComponentId === fromId && c.toComponentId === toId);
    if (exists) { selectConnector(exists.id); return exists; }
    const conn = {
        id: 'conn' + (connectorIdCounter++),
        fromComponentId: fromId, toComponentId: toId,
        routeType: 'orthogonal',
        style: { color: '#475569', width: 2, dash: 'solid' },
        arrow: 'forward', label: '', waypoints: []
    };
    projectData.connectors.push(conn);
    renderConnectors();
    selectConnector(conn.id);
    scheduleSaveDraft();
    return conn;
}
function deleteConnector(id) {
    const idx = projectData.connectors.findIndex(c => c.id === id);
    if (idx < 0) return;
    projectData.connectors.splice(idx, 1);
    if (selectedConnectorId === id) selectedConnectorId = null;
    renderConnectors();
    updatePropertyPanel(null);
    scheduleSaveDraft();
}
function clipToRect(center, target, comp) {
    const cx = center.x, cy = center.y;
    const dx = target.x - cx, dy = target.y - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const halfW = comp.w / 2, halfH = comp.h / 2;
    const tX = dx === 0 ? Infinity : Math.abs(halfW / dx);
    const tY = dy === 0 ? Infinity : Math.abs(halfH / dy);
    const t = Math.min(tX, tY);
    return { x: cx + dx * t, y: cy + dy * t };
}
function computeConnectorPath(conn) {
    const fromComp = getComponent(conn.fromComponentId);
    const toComp = getComponent(conn.toComponentId);
    if (!fromComp || !toComp) return null;
    const wp = conn.waypoints || [];
    const fc = { x: fromComp.x + fromComp.w / 2, y: fromComp.y + fromComp.h / 2 };
    const tc = { x: toComp.x + toComp.w / 2, y: toComp.y + toComp.h / 2 };
    const start = clipToRect(fc, wp[0] || tc, fromComp);
    const end = clipToRect(tc, wp[wp.length - 1] || fc, toComp);
    const points = [start, ...wp, end];
    let d = '';
    if (conn.routeType === 'line') {
        d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`;
    } else if (conn.routeType === 'orthogonal') {
        d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            const midX = (a.x + b.x) / 2;
            d += ` L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`;
        }
    } else if (conn.routeType === 'curve') {
        d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            const off = Math.max(40, Math.abs(b.x - a.x) * 0.5);
            d += ` C ${a.x + off} ${a.y}, ${b.x - off} ${b.y}, ${b.x} ${b.y}`;
        }
    }
    return { d, points };
}
function ensureMarker(color) {
    const defs = document.getElementById('connector-defs');
    const id = 'arrow-' + color.replace(/[^a-zA-Z0-9]/g, '');
    if (document.getElementById(id)) return id;
    const m = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    m.setAttribute('id', id);
    m.setAttribute('viewBox', '0 0 10 10');
    m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
    m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7');
    m.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); p.setAttribute('fill', color);
    m.appendChild(p); defs.appendChild(m);
    return id;
}
function scheduleRenderConnectors() {
    if (renderConnectorsRafId) cancelAnimationFrame(renderConnectorsRafId);
    renderConnectorsRafId = requestAnimationFrame(() => { renderConnectors(); renderConnectorsRafId = null; });
}
function renderConnectors() {
    const group = document.getElementById('connector-group');
    const defs = document.getElementById('connector-defs');
    group.innerHTML = ''; defs.innerHTML = '';
    projectData.connectors.forEach(conn => {
        const calc = computeConnectorPath(conn); if (!calc) return;
        const color = conn.style.color || '#475569';
        const width = conn.style.width || 2;
        const dash = conn.style.dash === 'dashed' ? '8 6' : '';
        const markerId = ensureMarker(color);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'connector-path');
        path.setAttribute('d', calc.d);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', width);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('fill', 'none');
        path.style.pointerEvents = 'none';
        if (dash) path.setAttribute('stroke-dasharray', dash);
        if (conn.arrow === 'forward' || conn.arrow === 'both') path.setAttribute('marker-end', `url(#${markerId})`);
        if (conn.arrow === 'both') path.setAttribute('marker-start', `url(#${markerId})`);
        path.dataset.connectorId = conn.id;
        if (selectedConnectorId === conn.id) path.classList.add('selected');
        group.appendChild(path);

        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hit.setAttribute('class', 'connector-hit');
        hit.setAttribute('d', calc.d);
        hit.dataset.connectorId = conn.id;
        hit.addEventListener('click', (e) => { e.stopPropagation(); selectConnector(conn.id); });
        hit.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); selectConnector(conn.id); showConnectorContextMenu(e, conn); });
        hit.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            const pt = svgPointFromEvent(e);
            const newIdx = insertWaypointAtClosest(conn, pt);
            selectConnector(conn.id);
            renderConnectors(); renderWaypointHandles();
            startWaypointDrag(conn, newIdx, e);
        });
        group.appendChild(hit);

        if (conn.label) {
            const points = calc.points;
            const idxM = Math.floor(points.length / 2);
            let mp = points.length % 2 === 1 ? points[idxM] : { x: (points[idxM - 1].x + points[idxM].x) / 2, y: (points[idxM - 1].y + points[idxM].y) / 2 };
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('transform', `translate(${mp.x}, ${mp.y})`);
            const w = Math.max(40, conn.label.length * 14 + 12);
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('class', 'connector-label-bg');
            rect.setAttribute('x', -w / 2); rect.setAttribute('y', -12);
            rect.setAttribute('width', w); rect.setAttribute('height', 24); rect.setAttribute('rx', 6);
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('class', 'connector-label');
            text.setAttribute('text-anchor', 'middle'); text.setAttribute('dy', '0.35em');
            text.textContent = conn.label;
            g.appendChild(rect); g.appendChild(text);
            group.appendChild(g);
        }
    });
    renderWaypointHandles();
}
function renderWaypointHandles() {
    const group = document.getElementById('waypoint-group'); if (!group) return;
    group.innerHTML = '';
    if (!selectedConnectorId) return;
    const conn = getConnector(selectedConnectorId); if (!conn) return;
    (conn.waypoints || []).forEach((wp, i) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('class', 'waypoint-handle');
        c.setAttribute('cx', wp.x); c.setAttribute('cy', wp.y); c.setAttribute('r', 6);
        c.addEventListener('mousedown', (e) => { if (e.button !== 0) return; e.stopPropagation(); startWaypointDrag(conn, i, e); });
        c.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            conn.waypoints.splice(i, 1);
            renderConnectors(); renderWaypointHandles(); scheduleSaveDraft();
        });
        group.appendChild(c);
    });
}
function startWaypointDrag(conn, idx, mouseDownEvent) {
    let active = true;
    const onMove = (e) => {
        if (!active) return;
        const pt = svgPointFromEvent(e);
        conn.waypoints[idx] = { x: pt.x, y: pt.y };
        renderConnectors();
    };
    const onUp = () => {
        active = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        scheduleSaveDraft();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}
function svgPointFromEvent(e) {
    const svg = document.getElementById('connector-layer');
    const rect = svg.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * projectData.board.w / rect.width,
        y: (e.clientY - rect.top) * projectData.board.h / rect.height
    };
}
function insertWaypointAtClosest(conn, pt) {
    const calc = computeConnectorPath(conn); if (!calc) return 0;
    const points = calc.points;
    let bestIdx = 0; let bestDist = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const d = pointToSegmentDist(pt, a, b);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (!conn.waypoints) conn.waypoints = [];
    conn.waypoints.splice(bestIdx, 0, { x: pt.x, y: pt.y });
    return bestIdx;
}
function pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// 連線模式
function enterConnectorMode(startId) {
    connectorMode = true;
    connectorFirstId = startId || null;
    document.body.classList.add('connector-mode');
    document.getElementById('btn-connector-mode').classList.add('active');
    const hint = document.getElementById('connector-hint');
    hint.style.display = 'block';
    if (startId) {
        const comp = getComponent(startId);
        hint.textContent = `連線模式：起點 = 「${getCardLabel(comp)}」，請點選終點（按 Esc 取消）`;
        const el = document.querySelector(`[data-component-id="${startId}"]`);
        if (el) el.classList.add('connector-source');
    } else {
        hint.textContent = '連線模式：請點選第一個元件作為起點（按 Esc 取消）';
    }
}
function exitConnectorMode() {
    connectorMode = false; connectorFirstId = null;
    document.body.classList.remove('connector-mode');
    document.getElementById('btn-connector-mode').classList.remove('active');
    document.getElementById('connector-hint').style.display = 'none';
    document.querySelectorAll('.component.connector-source').forEach(el => el.classList.remove('connector-source'));
}
function handleConnectorClick(componentId) {
    if (!connectorFirstId) {
        connectorFirstId = componentId;
        const comp = getComponent(componentId);
        document.getElementById('connector-hint').textContent = `連線模式：起點 = 「${getCardLabel(comp)}」，請點選終點（按 Esc 取消）`;
        const el = document.querySelector(`[data-component-id="${componentId}"]`);
        if (el) el.classList.add('connector-source');
    } else {
        if (connectorFirstId === componentId) {
            const el = document.querySelector(`[data-component-id="${componentId}"]`);
            if (el) el.classList.remove('connector-source');
            connectorFirstId = null;
            document.getElementById('connector-hint').textContent = '連線模式：請點選第一個元件作為起點（按 Esc 取消）';
            return;
        }
        addConnector(connectorFirstId, componentId);
        exitConnectorMode();
    }
}

// ============================================================
// Hover preview（標籤匯總）
// ============================================================
let hoverHideTimer = null;
function showCardHoverPreview(comp, e) {
    if (comp.type !== 'course-category') return;
    // 骨架模式：完全不顯示 hover 預覽（含標籤、班名）
    if (AppStorage.Settings.getViewMode() === 'skeleton') return;
    if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
    const wrap = document.getElementById('hover-preview');
    const aggregate = aggregateCardTags(comp);
    let html = `<div class="hover-preview-title">${escapeHtml(comp.props.title || '未命名')}</div>`;
    TAG_CATEGORY_KEYS.forEach(cat => {
        const ids = aggregate[cat];
        if (!ids || ids.length === 0) return;
        html += `<div class="hover-preview-section">${TAG_CATEGORY_LABELS[cat]}</div><div class="hover-preview-tags">`;
        ids.forEach(id => {
            const tag = findTagById(cat, id); if (!tag) return;
            html += `<span class="hover-preview-tag" style="background:${tag.color};">${escapeHtml(tag.name)}</span>`;
        });
        html += `</div>`;
    });
    const classes = comp.props.classes || [];
    html += `<div class="hover-preview-section">班名 (${classes.length})</div>`;
    if (classes.length === 0) html += `<div style="font-size:12px;color:var(--text-muted);">尚無班名（雙擊類別新增）</div>`;
    else {
        html += `<div style="font-size:12px;color:var(--text-secondary);max-height:120px;overflow:hidden;line-height:1.5;">`;
        classes.slice(0, 8).forEach(cl => html += `· ${escapeHtml(cl.name)}<br>`);
        if (classes.length > 8) html += `… 共 ${classes.length} 個（雙擊類別查看全部）`;
        html += `</div>`;
    }
    wrap.innerHTML = html;
    wrap.style.display = 'block';
    moveHoverPreview(e);
}
function moveHoverPreview(e) {
    const wrap = document.getElementById('hover-preview');
    if (!wrap || wrap.style.display === 'none') return;
    let x = e.clientX + 16, y = e.clientY + 16;
    const r = wrap.getBoundingClientRect();
    if (x + r.width > window.innerWidth) x = e.clientX - r.width - 16;
    if (y + r.height > window.innerHeight) y = e.clientY - r.height - 16;
    wrap.style.left = x + 'px';
    wrap.style.top = y + 'px';
}
function hideHoverPreview() {
    hoverHideTimer = setTimeout(() => {
        const wrap = document.getElementById('hover-preview');
        if (wrap) wrap.style.display = 'none';
    }, 80);
}
function aggregateCardTags(comp) {
    // 卡片自身標籤 + 所有班名標籤聯集（去重）
    const result = { audience: new Set(), level: new Set(), attribute: new Set(), topic: new Set(), format: new Set() };
    const at = comp.props.assignedTags || {};
    TAG_CATEGORY_KEYS.forEach(cat => (at[cat] || []).forEach(id => result[cat].add(id)));
    (comp.props.classes || []).forEach(cl => {
        if (!cl.tags) return;
        TAG_CATEGORY_KEYS.forEach(cat => {
            (cl.tags[cat] || []).forEach(name => {
                const tag = findTagByName(cat, name);
                if (tag) result[cat].add(tag.id);
            });
        });
    });
    const out = {};
    TAG_CATEGORY_KEYS.forEach(cat => out[cat] = Array.from(result[cat]));
    return out;
}

// ============================================================
// 右鍵選單
// ============================================================
function showCanvasContextMenu(e) {
    const pt = svgPointFromEvent(e);
    const items = [
        { label: '新增課程類別', icon: '📚', action: () => addComponentAt('course-category', pt) },
        { label: '新增文字', icon: '📝', action: () => addComponentAt('text', pt) },
        { label: '新增圖片', icon: '🖼️', action: () => addComponentAt('image', pt) },
        { label: '新增連結', icon: '🔗', action: () => addComponentAt('link', pt) },
        { label: '新增獨立標籤', icon: '🏷️', action: () => openTagPickerAt(pt) },
        { separator: true },
        { label: '貼上', icon: '📋', action: () => pasteComponent(pt.x, pt.y), disabled: !clipboardComponent },
        { separator: true },
        { label: '全選類別卡', icon: '⊞', action: selectAllComponents },
        { label: '對齊到格線', icon: '📐', action: alignAllToGrid },
        { separator: true },
        { label: connectorMode ? '退出連線模式' : '進入連線模式', icon: '↔️', action: () => connectorMode ? exitConnectorMode() : enterConnectorMode() }
    ];
    showContextMenu(e.clientX, e.clientY, items);
}
function showComponentContextMenu(e, comp) {
    const items = [];
    if (comp.type === 'course-category') {
        items.push({ label: '開啟班名清單', icon: '📋', action: () => openClassPopup(comp.id) });
        items.push({ label: '編輯標題', icon: '✏️', action: () => {
            const el = document.querySelector(`[data-component-id="${comp.id}"] .card-title`);
            if (el) {
                el.contentEditable = true;
                el.focus();
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(el);
                sel.removeAllRanges(); sel.addRange(range);
                el.addEventListener('blur', function once() {
                    el.contentEditable = false;
                    comp.props.title = (el.textContent || '').trim();
                    el.removeEventListener('blur', once);
                    renderCanvas(); scheduleSaveDraft();
                });
            }
        }});
    } else if (comp.type === 'text') {
        items.push({ label: '編輯', icon: '✏️', action: () => {
            const el = document.querySelector(`[data-component-id="${comp.id}"]`);
            if (el) beginInlineEdit(el, comp, 'text');
        }});
    } else {
        items.push({ label: '編輯', icon: '✏️', action: () => selectComponent(comp.id) });
    }
    items.push({ separator: true });
    items.push({ label: '從此拉連線到…', icon: '↔️', action: () => enterConnectorMode(comp.id) });
    if (comp.type === 'course-category') {
        items.push({ label: '選取所有下游類別', icon: '⊞', action: () => selectDownstream(comp.id) });
        // 主分類（無 incoming、有 outgoing）才提供「智慧整理此分支」
        const hasIncoming = projectData.connectors.some(cn => cn.toComponentId === comp.id);
        const hasOutgoing = projectData.connectors.some(cn => cn.fromComponentId === comp.id);
        if (!hasIncoming && hasOutgoing) {
            items.push({ label: '✨ 智慧整理此分支', icon: '🧹', action: () => smartLayoutBranch(comp.id) });
        }
    }
    // 群組相關（多選 / 已群組時才有意義）
    const isMulti = selectedComponentIds.size > 1 && selectedComponentIds.has(comp.id);
    if (isMulti) {
        items.push({ separator: true });
        const comps = Array.from(selectedComponentIds).map(id => getComponent(id)).filter(Boolean);
        const groupIds = new Set(comps.map(c => c.groupId).filter(Boolean));
        const isFormalGroup = groupIds.size === 1 && comps.every(c => c.groupId);
        if (isFormalGroup) {
            items.push({ label: '解除群組（Ctrl+Shift+G）', icon: '⛓️', action: () => ungroupSelected() });
        } else {
            items.push({ label: `建立群組（${selectedComponentIds.size} 個元件，Ctrl+G）`, icon: '🔗', action: () => groupSelected() });
        }
    } else if (comp.groupId) {
        items.push({ separator: true });
        items.push({ label: '選取整組', icon: '⊞', action: () => {
            const same = projectData.components.filter(c => c.groupId === comp.groupId).map(c => c.id);
            selectComponents(same);
        }});
        items.push({ label: '解除此元件的群組關係', icon: '⛓️', action: () => {
            delete comp.groupId; renderCanvas(); scheduleSaveDraft(); toast('已從群組移除', 'success');
        }});
    }
    items.push({ separator: true });
    items.push({ label: '複製', icon: '📋', action: () => duplicateComponent(comp.id) });
    items.push({ label: '複製樣式', icon: '🎨', action: () => copyStyle(comp) });
    items.push({ label: '貼上樣式', icon: '🖌️', action: () => pasteStyle(comp), disabled: !clipboardStyle });
    items.push({ separator: true });
    items.push({ label: '置頂', icon: '⬆️', action: () => moveComponentLayer(comp.id, 'top') });
    items.push({ label: '置底', icon: '⬇️', action: () => moveComponentLayer(comp.id, 'bottom') });
    items.push({ label: comp.locked ? '解鎖' : '鎖定', icon: comp.locked ? '🔓' : '🔒', action: () => toggleLockComponent(comp.id) });
    items.push({ separator: true });
    items.push({ label: '對齊到格線', icon: '📐', action: () => alignComponentToGrid(comp) });
    if (comp.type === 'course-category') items.push({ label: '匯出此選取為 PNG', icon: '🖼️', action: () => exportPNG({ component: comp }) });
    items.push({ separator: true });
    items.push({ label: '刪除', icon: '🗑️', action: () => deleteComponent(comp.id), danger: true });
    showContextMenu(e.clientX, e.clientY, items);
}
function showConnectorContextMenu(e, conn) {
    const items = [
        { label: '編輯標籤…', icon: '✏️', action: () => {
            const v = prompt('連線中段文字標籤：', conn.label || '');
            if (v !== null) { conn.label = v; renderConnectors(); scheduleSaveDraft(); }
        }},
        { separator: true },
        { section: '路徑樣式' },
        { label: conn.routeType === 'line' ? '✓ 直線' : '直線', action: () => { conn.routeType = 'line'; renderConnectors(); scheduleSaveDraft(); } },
        { label: conn.routeType === 'orthogonal' ? '✓ 兩折' : '兩折', action: () => { conn.routeType = 'orthogonal'; renderConnectors(); scheduleSaveDraft(); } },
        { label: conn.routeType === 'curve' ? '✓ 曲線' : '曲線', action: () => { conn.routeType = 'curve'; renderConnectors(); scheduleSaveDraft(); } },
        { separator: true },
        { section: '箭頭' },
        { label: conn.arrow === 'none' ? '✓ 無箭頭' : '無箭頭', action: () => { conn.arrow = 'none'; renderConnectors(); scheduleSaveDraft(); } },
        { label: conn.arrow === 'forward' ? '✓ 單向 →' : '單向 →', action: () => { conn.arrow = 'forward'; renderConnectors(); scheduleSaveDraft(); } },
        { label: conn.arrow === 'both' ? '✓ 雙向 ↔' : '雙向 ↔', action: () => { conn.arrow = 'both'; renderConnectors(); scheduleSaveDraft(); } },
        { separator: true },
        { label: '清除彎折點', icon: '🧹', action: () => { conn.waypoints = []; renderConnectors(); renderWaypointHandles(); scheduleSaveDraft(); } },
        { label: '刪除連線', icon: '🗑️', action: () => deleteConnector(conn.id), danger: true }
    ];
    showContextMenu(e.clientX, e.clientY, items);
}
function showContextMenu(x, y, items) {
    const menu = document.getElementById('context-menu');
    menu.innerHTML = '';
    items.forEach(item => {
        if (item.separator) { const sep = document.createElement('div'); sep.className = 'context-menu-separator'; menu.appendChild(sep); return; }
        if (item.section) { const s = document.createElement('div'); s.className = 'context-menu-section'; s.textContent = item.section; menu.appendChild(s); return; }
        const el = document.createElement('div');
        el.className = 'context-menu-item';
        if (item.disabled) el.classList.add('disabled');
        if (item.danger) el.classList.add('danger');
        el.innerHTML = `<span class="icon">${item.icon || ''}</span><span>${item.label}</span>`;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.disabled) return;
            hideContextMenu();
            try { item.action(); } catch (err) { console.error(err); }
        });
        menu.appendChild(el);
    });
    menu.style.display = 'block';
    // 先重置位置避免上次的位置影響高度量測
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    let left = x, top = y;
    if (x + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 8;
    // 防止頂端被截斷（選單比視窗還高時，max-height + overflow-y 已限制高度，這邊保險夾到 8px 邊距）
    if (top < 8) top = 8;
    if (left < 8) left = 8;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
}
function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
}
function addComponentAt(type, pt) {
    const comp = createComponent(type);
    comp.x = Math.max(0, Math.min(projectData.board.w - comp.w, pt.x - comp.w / 2));
    comp.y = Math.max(0, Math.min(projectData.board.h - comp.h, pt.y - comp.h / 2));
    comp.zIndex = nextTopZIndex();
    projectData.components.push(comp);
    renderCanvas();
    selectComponent(comp.id);
    scheduleSaveDraft();
    if (type === 'image') document.getElementById('file-image').click();
}
function openTagPickerAt(pt) { pendingTagPickerPosition = pt; openTagPicker(); }
function selectAllComponents() {
    document.querySelectorAll('.component').forEach(el => el.classList.add('selected'));
    toast(`已標示 ${projectData.components.length} 個元件（提示：目前為視覺強調，多選編輯為後續加強）`, 'info');
}
function selectDownstream(rootId) {
    const visited = new Set(); const stack = [rootId]; const downstream = [];
    while (stack.length) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);
        if (cur !== rootId) downstream.push(cur);
        projectData.connectors.forEach(c => { if (c.fromComponentId === cur) stack.push(c.toComponentId); });
    }
    if (downstream.length === 0) { toast('此卡片沒有下游連線', 'info'); return; }
    document.querySelectorAll('.component.selected').forEach(el => el.classList.remove('selected'));
    downstream.forEach(id => { const el = document.querySelector(`[data-component-id="${id}"]`); if (el) el.classList.add('selected'); });
    toast(`找到 ${downstream.length} 個下游類別並已標示`, 'success');
}
function alignAllToGrid() {
    const g = 20;
    projectData.components.forEach(c => { c.x = Math.round(c.x / g) * g; c.y = Math.round(c.y / g) * g; });
    renderCanvas(); scheduleSaveDraft();
    toast('已對齊到 20px 格線', 'success');
}
function alignComponentToGrid(comp) {
    const g = 20;
    comp.x = Math.round(comp.x / g) * g; comp.y = Math.round(comp.y / g) * g;
    renderCanvas(); scheduleSaveDraft();
}
function copyStyle(comp) { clipboardStyle = JSON.parse(JSON.stringify(comp.style || {})); toast('樣式已複製', 'success'); }
function pasteStyle(comp) {
    if (!clipboardStyle) return;
    comp.style = Object.assign({}, comp.style || {}, JSON.parse(JSON.stringify(clipboardStyle)));
    renderCanvas(); scheduleSaveDraft();
    if (selectedComponentId === comp.id) updatePropertyPanel(comp);
    toast('樣式已貼上', 'success');
}

// ============================================================
// 標籤管理 Modal
// ============================================================
function openTagManager() {
    activeTagManagerCat = 'audience';
    document.querySelectorAll('.tag-tab').forEach(t => t.classList.toggle('active', t.dataset.tagcat === 'audience'));
    renderTagManagerList();
    document.getElementById('tag-manager-overlay').style.display = 'flex';
}
function setupTagManagerModal() {
    document.querySelectorAll('.tag-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            activeTagManagerCat = tab.dataset.tagcat;
            document.querySelectorAll('.tag-tab').forEach(t => t.classList.toggle('active', t === tab));
            renderTagManagerList();
        });
    });
    document.getElementById('tag-add-btn').addEventListener('click', () => {
        const name = document.getElementById('tag-add-name').value.trim();
        const color = document.getElementById('tag-add-color').value;
        if (!name) { toast('請輸入標籤名稱', 'warning'); return; }
        projectData.tagLibrary[activeTagManagerCat].push({ id: 't' + (tagIdCounter++), name, color });
        document.getElementById('tag-add-name').value = '';
        renderTagManagerList(); scheduleSaveDraft();
    });
    document.getElementById('tag-manager-close').addEventListener('click', () => {
        document.getElementById('tag-manager-overlay').style.display = 'none';
        renderCanvas();
        if (selectedComponentId) {
            const c = getComponent(selectedComponentId);
            if (c && c.type === 'course-category') updatePropertyPanel(c);
        }
    });
    document.getElementById('tag-manager-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'tag-manager-overlay') document.getElementById('tag-manager-close').click();
    });
}
function renderTagManagerList() {
    const list = document.getElementById('tag-manager-list');
    const cat = activeTagManagerCat;
    const tags = projectData.tagLibrary[cat] || [];
    list.innerHTML = '';
    if (tags.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--text-muted);">尚無標籤，請新增</div>';
        return;
    }
    tags.forEach((tag, idx) => {
        const item = document.createElement('div');
        item.className = 'tag-manager-item';
        item.innerHTML = `<input type="color" value="${tag.color}"><input type="text" value="${escapeAttr(tag.name)}"><button class="delete-btn" title="刪除">✕</button>`;
        const colorIn = item.querySelector('input[type="color"]');
        const nameIn = item.querySelector('input[type="text"]');
        const delBtn = item.querySelector('.delete-btn');
        colorIn.addEventListener('input', () => { tag.color = colorIn.value; scheduleSaveDraft(); });
        nameIn.addEventListener('input', () => { tag.name = nameIn.value; scheduleSaveDraft(); });
        delBtn.addEventListener('click', () => {
            if (!confirm(`刪除標籤「${tag.name}」？\n所有已勾選此標籤的卡片與班名也會自動移除。`)) return;
            projectData.components.forEach(c => {
                if (c.type === 'course-category') {
                    if (c.props.assignedTags && c.props.assignedTags[cat]) {
                        c.props.assignedTags[cat] = c.props.assignedTags[cat].filter(id => id !== tag.id);
                    }
                    (c.props.classes || []).forEach(cl => {
                        if (cl.tags && Array.isArray(cl.tags[cat])) {
                            cl.tags[cat] = cl.tags[cat].filter(name => name !== tag.name);
                        }
                    });
                }
                if (c.type === 'tag' && c.props.tagId === tag.id) c.props.tagId = null;
            });
            tags.splice(idx, 1);
            renderTagManagerList(); scheduleSaveDraft();
        });
        list.appendChild(item);
    });
}

// ============================================================
// 白板設定 Modal
// ============================================================
function openBoardSettings() {
    const b = projectData.board;
    const sizeKey = `${b.w}x${b.h}`;
    const select = document.getElementById('board-size-preset');
    if (BOARD_PRESETS[sizeKey]) { select.value = sizeKey; document.getElementById('board-custom-size-row').style.display = 'none'; }
    else { select.value = 'custom'; document.getElementById('board-custom-size-row').style.display = 'flex'; }
    document.getElementById('board-w').value = b.w;
    document.getElementById('board-h').value = b.h;
    document.getElementById('board-bg-type').value = b.background.type;
    document.getElementById('board-base-color').value = b.background.baseColor;
    document.getElementById('board-base-color-text').value = b.background.baseColor;
    document.getElementById('board-grid-color').value = b.background.gridColor;
    document.getElementById('board-grid-color-text').value = b.background.gridColor;
    document.getElementById('board-settings-overlay').style.display = 'flex';
}
function setupBoardSettingsModal() {
    document.getElementById('board-size-preset').addEventListener('change', (e) => {
        const v = e.target.value;
        const customRow = document.getElementById('board-custom-size-row');
        if (v === 'custom') customRow.style.display = 'flex';
        else {
            customRow.style.display = 'none';
            const preset = BOARD_PRESETS[v];
            if (preset) { document.getElementById('board-w').value = preset.w; document.getElementById('board-h').value = preset.h; }
        }
    });
    syncColorPair2('board-base-color');
    syncColorPair2('board-grid-color');
    document.getElementById('board-settings-save').addEventListener('click', () => {
        const w = parseInt(document.getElementById('board-w').value, 10) || 3200;
        const h = parseInt(document.getElementById('board-h').value, 10) || 1800;
        projectData.board.w = Math.max(800, w);
        projectData.board.h = Math.max(600, h);
        projectData.board.background.type = document.getElementById('board-bg-type').value;
        projectData.board.background.baseColor = document.getElementById('board-base-color').value;
        projectData.board.background.gridColor = document.getElementById('board-grid-color').value;
        applyBoardSettings(); renderCanvas();
        document.getElementById('board-settings-overlay').style.display = 'none';
        scheduleSaveDraft();
        toast('白板設定已套用', 'success');
    });
    document.getElementById('board-settings-cancel').addEventListener('click', () => document.getElementById('board-settings-overlay').style.display = 'none');
    document.getElementById('board-settings-overlay').addEventListener('click', (e) => { if (e.target.id === 'board-settings-overlay') document.getElementById('board-settings-overlay').style.display = 'none'; });
}
function syncColorPair2(idPrefix) {
    const c = document.getElementById(idPrefix);
    const t = document.getElementById(idPrefix + '-text');
    if (c && t) {
        c.addEventListener('input', () => { t.value = c.value; });
        t.addEventListener('input', () => {
            const v = t.value.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(v) || /^#[0-9A-Fa-f]{3}$/.test(v)) c.value = v;
        });
    }
}

// ============================================================
// 按鈕色票 Modal
// ============================================================
function openButtonPalette() {
    buttonPaletteForExisting = null;
    populateButtonPalette();
    document.getElementById('button-palette-overlay').style.display = 'flex';
}
function openButtonPaletteForExisting(comp) {
    buttonPaletteForExisting = comp;
    buttonPaletteSelectedColor = comp.style.backgroundColor || '#3b82f6';
    populateButtonPalette();
    document.getElementById('palette-custom-color').value = buttonPaletteSelectedColor;
    document.getElementById('palette-custom-color-text').value = buttonPaletteSelectedColor;
    document.getElementById('button-palette-overlay').style.display = 'flex';
}
function populateButtonPalette() {
    const grid = document.getElementById('palette-grid');
    grid.innerHTML = '';
    BUTTON_PALETTE.forEach(color => {
        const sw = document.createElement('div');
        sw.className = 'palette-swatch';
        sw.style.background = color;
        if (color === buttonPaletteSelectedColor) sw.classList.add('selected');
        sw.addEventListener('click', () => {
            buttonPaletteSelectedColor = color;
            document.getElementById('palette-custom-color').value = color;
            document.getElementById('palette-custom-color-text').value = color;
            grid.querySelectorAll('.palette-swatch').forEach(s => s.classList.remove('selected'));
            sw.classList.add('selected');
        });
        grid.appendChild(sw);
    });
}
function setupButtonPaletteModal() {
    syncColorPair2('palette-custom-color');
    document.getElementById('palette-custom-color').addEventListener('input', (e) => {
        buttonPaletteSelectedColor = e.target.value;
        document.querySelectorAll('.palette-swatch').forEach(s => s.classList.remove('selected'));
    });
    document.getElementById('palette-custom-color-text').addEventListener('input', (e) => {
        const v = e.target.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(v) || /^#[0-9A-Fa-f]{3}$/.test(v)) {
            buttonPaletteSelectedColor = v;
            document.querySelectorAll('.palette-swatch').forEach(s => s.classList.remove('selected'));
        }
    });
    document.getElementById('palette-confirm').addEventListener('click', () => {
        if (buttonPaletteForExisting) {
            buttonPaletteForExisting.style.backgroundColor = buttonPaletteSelectedColor;
            renderCanvas();
            updatePropertyPanel(buttonPaletteForExisting);
            scheduleSaveDraft();
        } else addComponent('button');
        document.getElementById('button-palette-overlay').style.display = 'none';
    });
    document.getElementById('palette-cancel').addEventListener('click', () => document.getElementById('button-palette-overlay').style.display = 'none');
    document.getElementById('button-palette-overlay').addEventListener('click', (e) => { if (e.target.id === 'button-palette-overlay') document.getElementById('button-palette-overlay').style.display = 'none'; });
}

// ============================================================
// 獨立標籤 Picker
// ============================================================
function openTagPicker() { populateTagPicker(); document.getElementById('tag-picker-overlay').style.display = 'flex'; }
function populateTagPicker() {
    const grid = document.getElementById('tag-picker-grid');
    grid.innerHTML = '';
    TAG_CATEGORY_KEYS.forEach(cat => {
        const wrap = document.createElement('div');
        const title = document.createElement('div'); title.className = 'tag-picker-cat-title'; title.textContent = TAG_CATEGORY_LABELS[cat];
        wrap.appendChild(title);
        const row = document.createElement('div'); row.className = 'tag-picker-row';
        const tags = projectData.tagLibrary[cat] || [];
        if (tags.length === 0) { const e = document.createElement('div'); e.style.color = 'var(--text-muted)'; e.style.fontSize = '12px'; e.textContent = '（尚無）'; row.appendChild(e); }
        tags.forEach(tag => {
            const chip = document.createElement('span'); chip.className = 'tag-picker-chip';
            chip.textContent = tag.name; chip.style.background = tag.color;
            chip.addEventListener('click', () => {
                const comp = createComponent('tag');
                comp.props.name = tag.name;
                comp.props.tagCategory = cat;
                comp.props.tagId = tag.id;
                comp.style.backgroundColor = tag.color;
                if (pendingTagPickerPosition) {
                    comp.x = Math.max(0, Math.min(projectData.board.w - comp.w, pendingTagPickerPosition.x - comp.w / 2));
                    comp.y = Math.max(0, Math.min(projectData.board.h - comp.h, pendingTagPickerPosition.y - comp.h / 2));
                }
                comp.zIndex = nextTopZIndex();
                projectData.components.push(comp);
                renderCanvas(); selectComponent(comp.id); scheduleSaveDraft();
                document.getElementById('tag-picker-overlay').style.display = 'none';
                pendingTagPickerPosition = null;
            });
            row.appendChild(chip);
        });
        wrap.appendChild(row); grid.appendChild(wrap);
    });
}
function setupTagPickerModal() {
    document.getElementById('tag-picker-cancel').addEventListener('click', () => { document.getElementById('tag-picker-overlay').style.display = 'none'; pendingTagPickerPosition = null; });
    document.getElementById('tag-picker-overlay').addEventListener('click', (e) => { if (e.target.id === 'tag-picker-overlay') { document.getElementById('tag-picker-overlay').style.display = 'none'; pendingTagPickerPosition = null; } });
}

// ============================================================
// 圖片
// ============================================================
function handleImageFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const assetId = 'a' + Date.now() + Math.random().toString(36).slice(2, 6);
        assets[assetId] = reader.result;
        const comp = getComponent(selectedComponentId);
        if (comp && comp.type === 'image') {
            comp.props.assetId = assetId;
        } else {
            const newC = createComponent('image');
            newC.props.assetId = assetId;
            newC.x = 200; newC.y = 200;
            newC.zIndex = nextTopZIndex();
            projectData.components.push(newC);
            selectComponent(newC.id);
        }
        renderCanvas(); scheduleSaveDraft();
        toast('圖片已載入', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// ============================================================
// 我的分類圖 (Library)
// ============================================================
async function openLibrary() {
    await renderLibrary();
    document.getElementById('library-overlay').style.display = 'flex';
}
function setupLibraryModal() {
    document.getElementById('btn-library-new').addEventListener('click', () => openDiagramMeta(null));
    document.getElementById('btn-library-close').addEventListener('click', () => document.getElementById('library-overlay').style.display = 'none');
    document.getElementById('library-overlay').addEventListener('click', (e) => { if (e.target.id === 'library-overlay') document.getElementById('library-overlay').style.display = 'none'; });
    document.getElementById('library-search').addEventListener('input', () => renderLibrary());
}
async function renderLibrary() {
    const list = await AppStorage.listDiagrams();
    const filter = (document.getElementById('library-search').value || '').toLowerCase();
    const filtered = list.filter(d => !filter || (d.name || '').toLowerCase().includes(filter) || (d.subject || '').toLowerCase().includes(filter));
    const wrap = document.getElementById('library-list');
    wrap.innerHTML = '';
    document.getElementById('library-count').textContent = `共 ${list.length} 張`;
    if (filtered.length === 0) {
        wrap.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--text-muted);grid-column:1/-1;">沒有符合條件的分類圖</div>';
        return;
    }
    filtered.forEach(d => {
        const card = document.createElement('div');
        card.className = 'library-card' + (d.id === projectData.id ? ' active' : '');
        const cardCount = (d.components || []).filter(c => c.type === 'course-category').length;
        const classCount = (d.components || []).reduce((a, c) => a + (c.type === 'course-category' ? (c.props.classes || []).length : 0), 0);
        const date = new Date(d.updatedAt || d.createdAt || Date.now()).toLocaleString('zh-TW');
        card.innerHTML = `
            <div class="library-card-name">${escapeHtml(d.name)} ${d.id === projectData.id ? '<span class="library-card-active-badge">作用中</span>' : ''}</div>
            <div class="library-card-subject">學科：${escapeHtml(d.subject || '—')}</div>
            <div class="library-card-stats">📚 類別 ${cardCount} · 📋 班名 ${classCount} · ${date}</div>
            <div class="library-card-actions">
                <button class="btn" data-act="open">${d.id === projectData.id ? '已開啟' : '開啟'}</button>
                <button class="btn" data-act="rename">重命名</button>
                <button class="btn" data-act="dup">複製</button>
                <button class="btn btn-danger" data-act="del">刪除</button>
            </div>`;
        card.querySelector('[data-act="open"]').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (d.id === projectData.id) { toast('已是作用中分類圖', 'info'); return; }
            await switchToDiagram(d.id);
            document.getElementById('library-overlay').style.display = 'none';
        });
        card.querySelector('[data-act="rename"]').addEventListener('click', (e) => { e.stopPropagation(); openDiagramMeta(d); });
        card.querySelector('[data-act="dup"]').addEventListener('click', async (e) => {
            e.stopPropagation();
            const dup = JSON.parse(JSON.stringify(d));
            dup.id = AppStorage.generateUUID();
            dup.name = (d.name || '未命名') + '（複本）';
            dup.createdAt = Date.now(); dup.updatedAt = Date.now();
            await AppStorage.saveDiagram(dup);
            await renderLibrary();
            toast('已複製分類圖', 'success');
        });
        card.querySelector('[data-act="del"]').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`確定刪除「${d.name}」？此操作無法復原（建議先匯出備份）。`)) return;
            await AppStorage.deleteDiagram(d.id);
            if (d.id === projectData.id) {
                const list = await AppStorage.listDiagrams();
                if (list.length > 0) await switchToDiagram(list[0].id);
                else {
                    const empty = createEmptyDiagram('新分類圖', '人工智慧 (AI)');
                    await AppStorage.saveDiagram(empty);
                    setActiveDiagram(empty);
                    applyBoardSettings(); renderCanvas(); updateTitleBar();
                }
            }
            await renderLibrary();
            toast('已刪除', 'success');
        });
        wrap.appendChild(card);
    });
}
async function switchToDiagram(id) {
    await persistCurrentDiagram();
    const d = await AppStorage.getDiagram(id);
    if (!d) { toast('找不到分類圖', 'error'); return; }
    setActiveDiagram(d);
    applyBoardSettings();
    renderCanvas();
    updateTitleBar();
    deselectAll();
    toast(`已切換到「${d.name}」`, 'success');
}

let diagramMetaTarget = null; // null=新增；object=編輯
function openDiagramMeta(target) {
    diagramMetaTarget = target;
    document.getElementById('diagram-meta-title').textContent = target ? '重命名分類圖' : '新增分類圖';
    document.getElementById('diagram-meta-name').value = target ? target.name : '';
    document.getElementById('diagram-meta-subject').value = target ? (target.subject || '人工智慧 (AI)') : '人工智慧 (AI)';
    document.getElementById('diagram-meta-overlay').style.display = 'flex';
    setTimeout(() => document.getElementById('diagram-meta-name').focus(), 50);
}
function setupDiagramMetaModal() {
    document.getElementById('diagram-meta-save').addEventListener('click', async () => {
        const name = document.getElementById('diagram-meta-name').value.trim();
        const subject = document.getElementById('diagram-meta-subject').value.trim() || '人工智慧 (AI)';
        if (!name) { toast('請輸入名稱', 'warning'); return; }
        if (diagramMetaTarget) {
            const d = await AppStorage.getDiagram(diagramMetaTarget.id);
            if (d) {
                d.name = name; d.subject = subject;
                await AppStorage.saveDiagram(d);
                if (d.id === projectData.id) {
                    projectData.name = name; projectData.subject = subject; updateTitleBar();
                }
                toast('已更新', 'success');
            }
        } else {
            const newD = createEmptyDiagram(name, subject);
            await AppStorage.saveDiagram(newD);
            await switchToDiagram(newD.id);
        }
        document.getElementById('diagram-meta-overlay').style.display = 'none';
        renderLibrary();
    });
    document.getElementById('diagram-meta-cancel').addEventListener('click', () => document.getElementById('diagram-meta-overlay').style.display = 'none');
    document.getElementById('diagram-meta-overlay').addEventListener('click', (e) => { if (e.target.id === 'diagram-meta-overlay') document.getElementById('diagram-meta-overlay').style.display = 'none'; });
}

// ============================================================
// 主題 / 配色 / 版型 Modal
// ============================================================
function openThemePalette() {
    const cur = AppStorage.Settings.getTheme();
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === cur));
    renderPaletteOptions();
    renderLayoutOptions();
    document.getElementById('theme-palette-overlay').style.display = 'flex';
}
function setupThemePaletteModal() {
    document.querySelectorAll('.mode-btn').forEach(b => {
        b.addEventListener('click', () => {
            applyTheme(b.dataset.mode);
            document.querySelectorAll('.mode-btn').forEach(x => x.classList.toggle('active', x === b));
        });
    });
    document.getElementById('btn-theme-palette-close').addEventListener('click', () => document.getElementById('theme-palette-overlay').style.display = 'none');
    document.getElementById('theme-palette-overlay').addEventListener('click', (e) => { if (e.target.id === 'theme-palette-overlay') document.getElementById('theme-palette-overlay').style.display = 'none'; });
    document.getElementById('btn-apply-layout').addEventListener('click', () => {
        const lid = AppStorage.Settings.getLayout();
        applyLayout(lid);
        toast(`已套用版型：${(LAYOUTS.find(l => l.id === lid) || {}).name || lid}`, 'success');
    });
}
function renderPaletteOptions() {
    const wrap = document.getElementById('palette-options');
    const cur = AppStorage.Settings.getPalette();
    wrap.innerHTML = '';
    PALETTES.forEach(p => {
        const card = document.createElement('button');
        card.className = 'palette-option' + (p.id === cur ? ' active' : '');
        card.innerHTML = `<div class="palette-option-name">${p.name}</div><div class="palette-option-swatches">${p.swatches.map(c => `<span class="palette-option-swatch" style="background:${c};"></span>`).join('')}</div>`;
        card.addEventListener('click', () => {
            applyPalette(p.id);
            wrap.querySelectorAll('.palette-option').forEach(x => x.classList.toggle('active', x === card));
        });
        wrap.appendChild(card);
    });
}
function renderLayoutOptions() {
    const wrap = document.getElementById('layout-options');
    const cur = AppStorage.Settings.getLayout();
    wrap.innerHTML = '';
    LAYOUTS.forEach(l => {
        const card = document.createElement('button');
        card.className = 'layout-option' + (l.id === cur ? ' active' : '');
        card.innerHTML = `<div class="layout-option-icon">${l.icon}</div><div class="layout-option-name">${l.name}</div><div class="layout-option-desc">${l.desc}</div>`;
        card.addEventListener('click', () => {
            AppStorage.Settings.setLayout(l.id);
            wrap.querySelectorAll('.layout-option').forEach(x => x.classList.toggle('active', x === card));
        });
        wrap.appendChild(card);
    });
}

// ============================================================
// 版型佈局演算法
// ============================================================
function applyLayout(layoutId) {
    const cards = projectData.components.filter(c => c.type === 'course-category');
    if (cards.length === 0) { toast('沒有可佈局的課程類別卡', 'info'); return; }
    if (layoutId === 'free') return;
    const incoming = new Map();
    cards.forEach(c => incoming.set(c.id, []));
    projectData.connectors.forEach(conn => {
        if (incoming.has(conn.toComponentId) && cards.find(c => c.id === conn.fromComponentId)) {
            incoming.get(conn.toComponentId).push(conn.fromComponentId);
        }
    });
    const roots = cards.filter(c => (incoming.get(c.id) || []).length === 0);
    const childrenMap = new Map();
    cards.forEach(c => childrenMap.set(c.id, []));
    projectData.connectors.forEach(conn => {
        if (childrenMap.has(conn.fromComponentId) && cards.find(c => c.id === conn.toComponentId)) {
            childrenMap.get(conn.fromComponentId).push(conn.toComponentId);
        }
    });
    // BFS 取得每個節點的層級
    const level = new Map();
    const queue = [];
    roots.forEach(r => { level.set(r.id, 0); queue.push(r.id); });
    cards.forEach(c => { if (!level.has(c.id)) { level.set(c.id, 0); queue.push(c.id); } }); // 孤立節點視為 root
    while (queue.length) {
        const cur = queue.shift();
        (childrenMap.get(cur) || []).forEach(ch => {
            const nxt = level.get(cur) + 1;
            if (!level.has(ch) || nxt > level.get(ch)) {
                level.set(ch, nxt); queue.push(ch);
            }
        });
    }
    // 同層分組
    const byLevel = new Map();
    cards.forEach(c => {
        const l = level.get(c.id) || 0;
        if (!byLevel.has(l)) byLevel.set(l, []);
        byLevel.get(l).push(c);
    });
    const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);
    const padding = 100;
    const colW = 360, rowH = 200;

    if (layoutId === 'tree-h') {
        sortedLevels.forEach((lv, li) => {
            const arr = byLevel.get(lv);
            const colX = padding + lv * colW;
            const totalH = arr.length * rowH;
            const startY = Math.max(padding, (projectData.board.h - totalH) / 2);
            arr.forEach((card, i) => { card.x = colX; card.y = startY + i * rowH; });
        });
    } else if (layoutId === 'hierarchy-v') {
        sortedLevels.forEach((lv, li) => {
            const arr = byLevel.get(lv);
            const rowY = padding + lv * rowH;
            const totalW = arr.length * colW;
            const startX = Math.max(padding, (projectData.board.w - totalW) / 2);
            arr.forEach((card, i) => { card.x = startX + i * colW; card.y = rowY; });
        });
    } else if (layoutId === 'radial') {
        const cx = projectData.board.w / 2, cy = projectData.board.h / 2;
        const root = roots[0] || cards[0];
        if (root) { root.x = cx - root.w / 2; root.y = cy - root.h / 2; }
        sortedLevels.forEach(lv => {
            if (lv === 0) return;
            const arr = byLevel.get(lv);
            const radius = lv * 350;
            arr.forEach((card, i) => {
                const angle = (i / arr.length) * Math.PI * 2;
                card.x = Math.max(0, Math.min(projectData.board.w - card.w, cx + Math.cos(angle) * radius - card.w / 2));
                card.y = Math.max(0, Math.min(projectData.board.h - card.h, cy + Math.sin(angle) * radius - card.h / 2));
            });
        });
    }
    renderCanvas();
    scheduleSaveDraft();
    snapshot('auto', `套用版型：${layoutId}`);
}

// ============================================================
// 智慧整理：每個主分類各佔一個橫向 row（block），主在左、子分類成 grid 排在右
// 設計目的：
//   - 同一主分類的子分類「緊鄰自己的父節點」，連線最短、不交叉
//   - 不同主分類的 block 上下堆疊，視覺結構清楚
//   - 自動擴張白板，保證所有卡片在畫布內可見
//   - 子分類過多時自動分多行（每行 SUB_PER_ROW 個），避免單行過寬
// ============================================================
function smartLayout(opts) {
    opts = opts || {};
    const showToast = opts.silent !== true;
    const cards = projectData.components.filter(c => c.type === 'course-category');
    if (cards.length === 0) {
        if (showToast) toast('沒有可整理的課程類別卡', 'info');
        return;
    }
    const cardW = Math.max(...cards.map(c => c.w || 320), 320);
    const cardH = Math.max(...cards.map(c => c.h || 140), 140);
    const padding = 100;
    const gapX = 90;            // 子分類同行水平間距
    const gapY = 50;             // 子分類同列垂直間距
    const mainToSubGap = 140;    // 主分類 → 子分類群的水平間距（拉大避免擁擠）
    const blockGap = 80;         // 不同主分類 block 之間的垂直間距
    const subColW = cardW + gapX;
    const subRowH = cardH + gapY;

    // 建立 parent → children
    const childrenMap = new Map();
    cards.forEach(c => childrenMap.set(c.id, []));
    const incomingCount = new Map();
    cards.forEach(c => incomingCount.set(c.id, 0));
    projectData.connectors.forEach(conn => {
        if (childrenMap.has(conn.fromComponentId) && cards.find(c => c.id === conn.toComponentId)) {
            childrenMap.get(conn.fromComponentId).push(conn.toComponentId);
            incomingCount.set(conn.toComponentId, (incomingCount.get(conn.toComponentId) || 0) + 1);
        }
    });
    const roots = cards.filter(c => (incomingCount.get(c.id) || 0) === 0);
    const maxSubs = roots.length ? Math.max(0, ...roots.map(r => childrenMap.get(r.id).length)) : 0;
    let SUB_PER_ROW;
    if (maxSubs >= 9) SUB_PER_ROW = 5;
    else if (maxSubs >= 6) SUB_PER_ROW = 4;
    else SUB_PER_ROW = Math.max(3, maxSubs || 3);

    // 沒有任何 root（圈狀或全孤立）→ 純網格 layout
    if (roots.length === 0) {
        const N = cards.length;
        const cols = Math.max(1, Math.ceil(Math.sqrt(N)));
        const rowsCount = Math.ceil(N / cols);
        cards.sort((a, b) => (a.props.title || '').localeCompare(b.props.title || ''));
        cards.forEach((c, i) => {
            c.x = padding + (i % cols) * subColW;
            c.y = padding + Math.floor(i / cols) * subRowH;
        });
        const neededW = padding * 2 + cols * subColW - gapX;
        const neededH = padding * 2 + rowsCount * subRowH - gapY;
        if (projectData.board.w < neededW) projectData.board.w = Math.ceil(neededW / 100) * 100;
        if (projectData.board.h < neededH) projectData.board.h = Math.ceil(neededH / 100) * 100;
        applyBoardSettings(); renderCanvas(); scheduleSaveDraft();
        if (!opts.skipSnapshot) snapshot('auto', '智慧整理（網格）');
        if (showToast) toast(`已整理 ${N} 張孤立卡片為網格`, 'success');
        return;
    }

    // 計算每個 root 的 block 尺寸
    const blocks = roots.map(root => {
        const subs = childrenMap.get(root.id).map(id => cards.find(c => c.id === id)).filter(Boolean);
        const subCount = subs.length;
        const subRows = Math.max(1, Math.ceil(subCount / SUB_PER_ROW));
        const subCols = Math.min(subCount, SUB_PER_ROW) || 0;
        const blockH = Math.max(cardH, subRows * subRowH - gapY);
        const blockW = subCount > 0 ? cardW + mainToSubGap + subCols * subColW - gapX : cardW;
        return { root, subs, subRows, subCols, blockH, blockW };
    });
    const maxBlockW = Math.max(...blocks.map(b => b.blockW), cardW);
    const totalBlocksH = blocks.reduce((acc, b) => acc + b.blockH, 0) + Math.max(0, blocks.length - 1) * blockGap;

    // 孤立卡片
    const placed = new Set();
    blocks.forEach(b => { placed.add(b.root.id); b.subs.forEach(s => placed.add(s.id)); });
    const orphans = cards.filter(c => !placed.has(c.id));
    let orphanH = 0, orphanCols = 0;
    if (orphans.length > 0) {
        orphanCols = Math.min(orphans.length, SUB_PER_ROW + 1);
        const orphanRows = Math.ceil(orphans.length / orphanCols);
        orphanH = orphanRows * subRowH - gapY + 60;
    }

    // 計算所需白板尺寸 → 自動擴張（永遠以 layout 結果為準）
    const neededW = padding * 2 + Math.max(maxBlockW, orphanCols * subColW - gapX);
    const neededH = padding * 2 + totalBlocksH + orphanH;
    const newBoardW = Math.max(projectData.board.w, Math.ceil(neededW / 100) * 100);
    const newBoardH = Math.max(projectData.board.h, Math.ceil(neededH / 100) * 100);
    const boardChanged = newBoardW !== projectData.board.w || newBoardH !== projectData.board.h;
    projectData.board.w = newBoardW;
    projectData.board.h = newBoardH;

    // 排版：每個 block 一個橫條 row + 自動群組化（同 block 主+子分類分配同一 groupId）
    let curY = padding;
    blocks.forEach(b => {
        b.root.x = padding;
        b.root.y = curY + (b.blockH - cardH) / 2;
        const subStartX = padding + cardW + mainToSubGap;
        const subTotalH = b.subRows * subRowH - gapY;
        const subStartY = curY + (b.blockH - subTotalH) / 2;
        b.subs.forEach((sub, i) => {
            const col = i % SUB_PER_ROW;
            const r = Math.floor(i / SUB_PER_ROW);
            sub.x = subStartX + col * subColW;
            sub.y = subStartY + r * subRowH;
        });
        // 自動群組化（若使用者尚未指定 groupId，或 block 內成員 groupId 不一致 → 統一賦值新 groupId）
        if (opts.autoGroup !== false && b.subs.length > 0) {
            const ids = [b.root.id, ...b.subs.map(s => s.id)];
            const existingGroups = new Set(ids.map(id => getComponent(id) && getComponent(id).groupId).filter(Boolean));
            const allShareSame = existingGroups.size === 1
                && b.root.groupId
                && b.subs.every(s => s.groupId === b.root.groupId);
            if (!allShareSame) {
                const gid = 'g' + Date.now() + '_' + (groupIdCounter++);
                ids.forEach(id => { const c = getComponent(id); if (c) c.groupId = gid; });
            }
        }
        curY += b.blockH + blockGap;
    });

    // 孤立卡片：在最後 block 下方
    if (orphans.length > 0) {
        curY += 30;
        orphans.sort((a, b) => (a.props.title || '').localeCompare(b.props.title || ''));
        orphans.forEach((c, i) => {
            c.x = padding + (i % orphanCols) * subColW;
            c.y = curY + Math.floor(i / orphanCols) * subRowH;
        });
    }

    // 其他元件 clamp
    projectData.components.filter(c => c.type !== 'course-category').forEach(c => {
        c.x = Math.max(0, Math.min(projectData.board.w - c.w, c.x));
        c.y = Math.max(0, Math.min(projectData.board.h - c.h, c.y));
    });

    // 連線重置：清空 waypoints 並改用 orthogonal 路由（直角折線視覺最清楚）
    projectData.connectors.forEach(conn => {
        const fromCard = cards.find(c => c.id === conn.fromComponentId);
        const toCard = cards.find(c => c.id === conn.toComponentId);
        if (!fromCard || !toCard) return;
        conn.waypoints = [];
        if ((incomingCount.get(fromCard.id) || 0) === 0 && (incomingCount.get(toCard.id) || 0) > 0) {
            conn.routeType = 'orthogonal';
        }
    });

    applyBoardSettings();
    renderCanvas();
    scheduleSaveDraft();
    if (!opts.skipSnapshot) snapshot('auto', '智慧整理排版');
    if (showToast) {
        const msg = boardChanged
            ? `已整理 ${cards.length} 張卡片（白板已擴大為 ${projectData.board.w}×${projectData.board.h}）`
            : `已整理 ${cards.length} 張卡片`;
        toast(msg, 'success');
    }
    // 排版完跳到左上角看主結構
    const wrapper = document.getElementById('canvas-wrapper-outer');
    if (wrapper) { wrapper.scrollTop = 0; wrapper.scrollLeft = 0; }
}

// 智慧整理「單一分支」：選取一個主分類後，僅重排該主分類與其直系子分類
// 維持其他分支與元件位置不變，並把此分支放回原本主分類左上角附近
function smartLayoutBranch(rootId) {
    const root = getComponent(rootId);
    if (!root || root.type !== 'course-category') {
        toast('請選取一個課程類別主分類', 'warning');
        return;
    }
    // 收集直系子分類（透過 connector 找）
    const subIds = projectData.connectors
        .filter(c => c.fromComponentId === rootId)
        .map(c => c.toComponentId)
        .filter(id => {
            const x = getComponent(id);
            return x && x.type === 'course-category';
        });
    if (subIds.length === 0) {
        toast('此主分類沒有任何子分類，無需整理', 'info');
        return;
    }
    const subs = subIds.map(id => getComponent(id)).filter(Boolean);
    const allCards = [root, ...subs];
    const cardW = Math.max(...allCards.map(c => c.w || 320), 320);
    const cardH = Math.max(...allCards.map(c => c.h || 140), 140);
    const gapX = 90, gapY = 50;
    const mainToSubGap = 140;
    const subColW = cardW + gapX;
    const subRowH = cardH + gapY;
    const subCount = subs.length;
    let SUB_PER_ROW;
    if (subCount >= 9) SUB_PER_ROW = 5;
    else if (subCount >= 6) SUB_PER_ROW = 4;
    else SUB_PER_ROW = Math.max(3, subCount);
    const subRows = Math.max(1, Math.ceil(subCount / SUB_PER_ROW));
    const subCols = Math.min(subCount, SUB_PER_ROW);
    const blockH = Math.max(cardH, subRows * subRowH - gapY);
    const blockW = cardW + mainToSubGap + subCols * subColW - gapX;

    // 起點：以原本 root 的左上角當錨點（避免整個分支跳到別處）
    const anchorX = root.x;
    const anchorY = root.y - (blockH - cardH) / 2;
    // 計算放置區域，若會超出畫布右下，自動擴張白板
    const needBoardW = anchorX + blockW + 80;
    const needBoardH = anchorY + blockH + 80;
    if (projectData.board.w < needBoardW) projectData.board.w = Math.ceil(needBoardW / 100) * 100;
    if (projectData.board.h < needBoardH) projectData.board.h = Math.ceil(needBoardH / 100) * 100;

    root.x = anchorX;
    root.y = anchorY + (blockH - cardH) / 2;
    const subStartX = anchorX + cardW + mainToSubGap;
    const subTotalH = subRows * subRowH - gapY;
    const subStartY = anchorY + (blockH - subTotalH) / 2;
    subs.forEach((sub, i) => {
        const col = i % SUB_PER_ROW;
        const r = Math.floor(i / SUB_PER_ROW);
        sub.x = subStartX + col * subColW;
        sub.y = subStartY + r * subRowH;
    });
    // 此分支自動群組化
    const ids = [root.id, ...subs.map(s => s.id)];
    const existingGroup = root.groupId;
    const allShareSame = existingGroup && subs.every(s => s.groupId === existingGroup);
    const gid = allShareSame ? existingGroup : ('g' + Date.now() + '_' + (groupIdCounter++));
    ids.forEach(id => { const c = getComponent(id); if (c) c.groupId = gid; });
    // 重置此分支內連線
    projectData.connectors.forEach(conn => {
        if (conn.fromComponentId === rootId && subIds.includes(conn.toComponentId)) {
            conn.waypoints = [];
            conn.routeType = 'orthogonal';
        }
    });
    snapshot('auto', `智慧整理分支：${root.props.title || '未命名主分類'}`);
    applyBoardSettings();
    renderCanvas();
    scheduleSaveDraft();
    toast(`已整理「${root.props.title || '主分類'}」與其下 ${subs.length} 個子分類`, 'success');
}

// ============================================================
// AI 設定 Modal
// ============================================================
function openAISettings() {
    renderAIProviders();
    document.getElementById('ai-settings-overlay').style.display = 'flex';
}
function setupAISettingsModal() {
    document.getElementById('btn-ai-settings-close').addEventListener('click', () => document.getElementById('ai-settings-overlay').style.display = 'none');
    document.getElementById('ai-settings-overlay').addEventListener('click', (e) => { if (e.target.id === 'ai-settings-overlay') document.getElementById('ai-settings-overlay').style.display = 'none'; });
    document.getElementById('btn-set-master-password').addEventListener('click', async () => {
        const pwd = await promptMasterPassword({ confirmRequired: true, title: '設定 / 變更主密碼', desc: '請輸入新主密碼。所有 API Key 會以此密碼加密。請務必記住，遺失後無法復原。' });
        if (pwd) { AppAI.setMasterPassword(pwd); toast('主密碼已設定（僅在此 session 有效）', 'success'); renderAIProviders(); }
    });
    document.getElementById('btn-clear-master-password').addEventListener('click', async () => {
        if (!confirm('將清除主密碼與所有已儲存的 API Key（無法復原）。確定？')) return;
        AppAI.clearMasterPassword();
        await AppStorage.clearApiKeys();
        toast('已清除', 'success');
        renderAIProviders();
    });
}
async function renderAIProviders() {
    const wrap = document.getElementById('ai-providers');
    const list = AppAI.listProviders();
    const stored = await AppStorage.listApiKeys();
    const storedSet = new Set(stored.map(s => s.provider));
    wrap.innerHTML = '';
    list.forEach(p => {
        const card = document.createElement('div');
        card.className = 'ai-provider-card' + (storedSet.has(p.id) ? ' has-key' : '');
        const isMock = p.id === 'mock';
        card.innerHTML = `
            <div class="ai-provider-name">${p.name} ${storedSet.has(p.id) ? '<span style="color:var(--success);font-size:11px;">● 已設定</span>' : (isMock ? '' : '<span style="color:var(--text-muted);font-size:11px;">○ 未設定</span>')}</div>
            <div class="ai-provider-badges">${p.badges.map(b => `<span class="ai-provider-badge">${b}</span>`).join('')}</div>
            <div class="ai-provider-desc">${p.description}</div>
            ${isMock ? '' : `
                <div class="modal-field" style="margin-bottom:6px;">
                    <label>API Key（${p.keyHint || '請參考供應商文件'}）</label>
                    <div class="ai-provider-key-row">
                        <input type="password" placeholder="${p.keyHint || ''}" class="ai-key-input" data-provider="${p.id}">
                        <button class="btn btn-small btn-primary" data-act="save" data-provider="${p.id}">儲存</button>
                    </div>
                </div>
                <div class="modal-field" style="margin-bottom:6px;">
                    <label>模型 <span style="color:var(--text-muted);font-size:11px;">（即時從 ${p.name} API 抓取）</span></label>
                    <div class="ai-provider-key-row">
                        <select class="ai-model-select" data-provider="${p.id}"><option>（按 🔄 重新整理或先儲存 Key）</option></select>
                        <button class="btn btn-small" data-act="refresh-models" data-provider="${p.id}" title="從 API 重新抓取最新模型清單">🔄</button>
                    </div>
                    <small class="ai-model-meta" data-provider="${p.id}"></small>
                </div>
                <div class="ai-provider-actions">
                    <button class="btn" data-act="test" data-provider="${p.id}">測試驗證</button>
                    <button class="btn btn-danger" data-act="del" data-provider="${p.id}">刪除 Key</button>
                    ${p.docs ? `<a href="${p.docs}" target="_blank" rel="noopener" class="btn">📖 取得 Key</a>` : ''}
                </div>
                <div class="ai-provider-status" data-provider="${p.id}"></div>
            `}`;
        wrap.appendChild(card);
    });

    // 載入已快取的模型清單（不打 API）
    for (const p of list) {
        if (p.id === 'mock') continue;
        const sel = wrap.querySelector(`.ai-model-select[data-provider="${p.id}"]`);
        const meta = wrap.querySelector(`.ai-model-meta[data-provider="${p.id}"]`);
        if (!sel) continue;
        try {
            const cached = await AppAI.getCachedModels(p.id);
            if (cached && cached.models && cached.models.length) {
                fillModelSelect(sel, cached.models);
                meta.textContent = `共 ${cached.models.length} 個模型 · 快取於 ${formatTime(cached.fetchedAt)}${cached.fresh ? '' : '（已過期，建議重新整理）'}`;
            } else if (storedSet.has(p.id)) {
                meta.textContent = '尚未抓取，按 🔄 立即從 API 取得最新清單';
            } else {
                meta.textContent = '請先儲存 API Key 再按 🔄';
            }
        } catch (e) { /* 忽略 */ }
    }

    wrap.querySelectorAll('[data-act="save"]').forEach(b => {
        b.addEventListener('click', async () => {
            const pid = b.dataset.provider;
            const input = wrap.querySelector(`.ai-key-input[data-provider="${pid}"]`);
            const v = input.value.trim();
            if (!v) { toast('請貼上 API Key', 'warning'); return; }
            if (!AppAI.hasMasterPasswordInMemory()) {
                const pwd = await promptMasterPassword({ confirmRequired: true, title: '首次需要設定主密碼', desc: '為了加密儲存 API Key，請先設定主密碼。' });
                if (!pwd) return;
                AppAI.setMasterPassword(pwd);
            }
            try {
                await AppAI.saveApiKey(pid, v);
                input.value = '';
                toast(`${pid} 的 API Key 已加密儲存，正在抓取模型清單…`, 'success');
                await renderAIProviders();
                await refreshProviderModels(pid);
            } catch (err) {
                toast('儲存失敗：' + err.message, 'error');
            }
        });
    });
    wrap.querySelectorAll('[data-act="refresh-models"]').forEach(b => {
        b.addEventListener('click', async () => {
            await refreshProviderModels(b.dataset.provider);
        });
    });
    wrap.querySelectorAll('[data-act="test"]').forEach(b => {
        b.addEventListener('click', async () => {
            const pid = b.dataset.provider;
            const status = wrap.querySelector(`.ai-provider-status[data-provider="${pid}"]`);
            const modelSel = wrap.querySelector(`.ai-model-select[data-provider="${pid}"]`);
            const model = modelSel && modelSel.value && !modelSel.value.startsWith('（') ? modelSel.value : '';
            if (!model) { status.textContent = '❌ 請先按 🔄 抓取模型清單再選一個模型'; status.className = 'ai-provider-status err'; return; }
            status.textContent = '測試中…'; status.className = 'ai-provider-status';
            if (!AppAI.hasMasterPasswordInMemory()) {
                const pwd = await promptMasterPassword({ title: '請輸入主密碼', desc: '需要主密碼來解密已儲存的 API Key。' });
                if (!pwd) { status.textContent = '已取消'; return; }
                AppAI.setMasterPassword(pwd);
            }
            try {
                const r = await AppAI.testApiKey(pid, model);
                status.textContent = (r.ok ? '✅ ' : '❌ ') + r.message;
                status.className = 'ai-provider-status ' + (r.ok ? 'ok' : 'err');
            } catch (err) {
                status.textContent = '❌ ' + err.message;
                status.className = 'ai-provider-status err';
            }
        });
    });
    wrap.querySelectorAll('[data-act="del"]').forEach(b => {
        b.addEventListener('click', async () => {
            const pid = b.dataset.provider;
            if (!confirm(`刪除 ${pid} 的 API Key？\n（已快取的模型清單也會清除）`)) return;
            await AppAI.deleteApiKey(pid);
            try { await AppStorage.kvDel('models:' + pid); } catch (e) {}
            toast('已刪除', 'success');
            renderAIProviders();
        });
    });
}

async function refreshProviderModels(providerId) {
    const wrap = document.getElementById('ai-providers');
    const sel = wrap.querySelector(`.ai-model-select[data-provider="${providerId}"]`);
    const meta = wrap.querySelector(`.ai-model-meta[data-provider="${providerId}"]`);
    if (!sel || !meta) return;
    if (!AppAI.hasMasterPasswordInMemory()) {
        const pwd = await promptMasterPassword({ title: '請輸入主密碼', desc: '需要主密碼來解密 API Key 才能呼叫 API。' });
        if (!pwd) return;
        AppAI.setMasterPassword(pwd);
    }
    sel.innerHTML = '<option>抓取中…</option>';
    meta.textContent = '正在從 API 取得最新模型清單…';
    try {
        const r = await AppAI.fetchModels(providerId, { forceRefresh: true });
        fillModelSelect(sel, r.models);
        if (r.source === 'live') {
            meta.textContent = `✅ 已從 API 取得 ${r.models.length} 個模型 · ${formatTime(r.fetchedAt)}`;
            toast(`${providerId} 抓到 ${r.models.length} 個最新模型`, 'success');
            await populateUploadProviderSelect();
        } else if (r.source === 'cache') {
            meta.textContent = `⚠️ API 失敗，使用上次快取（${r.models.length} 個）${r.error ? '：' + r.error.slice(0, 80) : ''}`;
            toast('API 失敗，沿用上次快取', 'warning');
        } else {
            meta.textContent = `⚠️ API 失敗，使用內建備援清單${r.error ? '：' + r.error.slice(0, 80) : ''}`;
            toast('API 失敗，使用備援清單', 'warning');
        }
    } catch (err) {
        sel.innerHTML = '<option>（抓取失敗）</option>';
        meta.textContent = '❌ ' + err.message;
        toast('抓取模型清單失敗：' + err.message, 'error');
    }
}

function fillModelSelect(sel, models, selectedValue) {
    sel.innerHTML = '';
    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        if (selectedValue && selectedValue === m) opt.selected = true;
        sel.appendChild(opt);
    });
}

function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('zh-TW', { hour12: false });
}

// ============================================================
// 主密碼 Modal
// ============================================================
function setupMasterPasswordModal() {
    document.getElementById('master-password-ok').addEventListener('click', () => {
        const v = document.getElementById('master-password-input').value;
        const cv = document.getElementById('master-password-confirm').value;
        const confirmRow = document.getElementById('master-password-confirm-row').style.display !== 'none';
        if (confirmRow && v !== cv) { toast('兩次輸入不一致', 'error'); return; }
        if (!v) { toast('請輸入主密碼', 'warning'); return; }
        document.getElementById('master-password-overlay').style.display = 'none';
        if (activeMasterPasswordResolve) { activeMasterPasswordResolve(v); activeMasterPasswordResolve = null; }
    });
    document.getElementById('master-password-cancel').addEventListener('click', () => {
        document.getElementById('master-password-overlay').style.display = 'none';
        if (activeMasterPasswordResolve) { activeMasterPasswordResolve(null); activeMasterPasswordResolve = null; }
    });
}
function promptMasterPassword(opts) {
    opts = opts || {};
    document.getElementById('master-password-title').textContent = opts.title || '主密碼';
    document.getElementById('master-password-desc').textContent = opts.desc || '請輸入主密碼。';
    document.getElementById('master-password-input').value = '';
    document.getElementById('master-password-confirm').value = '';
    document.getElementById('master-password-confirm-row').style.display = opts.confirmRequired ? 'block' : 'none';
    document.getElementById('master-password-overlay').style.display = 'flex';
    setTimeout(() => document.getElementById('master-password-input').focus(), 50);
    return new Promise(resolve => { activeMasterPasswordResolve = resolve; });
}

// ============================================================
// 上傳資料 → AI 分類 精靈
// 支援三種 mode：
//   'classify'         - 完整 AI 分類（上傳班名 → 分類並貼標籤 → 班名放入卡片）
//   'scaffold-empty'   - 從零建構骨架（無資料，AI 憑空設計）
//   'scaffold-inspired'- 以班名為靈感建構骨架（上傳班名作參考但不放入圖中）
// ============================================================
const UPLOAD_MODE_META = {
    'classify': {
        title: '上傳資料 → AI 自動分類',
        desc: '上傳班名清單，AI 自動歸類成「主分類 → 子分類 → 班名」並建議標籤。班名會直接放入課程類別卡。',
        steps: [1, 2, 3, 4],
        needsFile: true,
        showScaffoldOptions: false
    },
    'scaffold-empty': {
        title: '🏗️ 從零建構骨架',
        desc: '不需要上傳任何資料。AI 會根據學科主題與標籤庫，憑空設計「主分類 → 子分類」兩層骨架。不會產生班名。',
        steps: [3, 4],
        needsFile: false,
        showScaffoldOptions: true
    },
    'scaffold-inspired': {
        title: '💡 以班名為靈感建構骨架',
        desc: '上傳班名清單供 AI 參考，但**不**會把班名放進圖裡。AI 會依這些班名歸納出「主分類 → 子分類」骨架。班名會存在「靈感清單」中供之後查看。',
        steps: [1, 2, 3, 4],
        needsFile: true,
        showScaffoldOptions: true
    }
};
function openUploadWizard(mode) {
    mode = mode || 'classify';
    if (!UPLOAD_MODE_META[mode]) mode = 'classify';
    uploadState = {
        mode,
        step: UPLOAD_MODE_META[mode].steps[0],
        file: null, raw: null, parsed: null, columns: null,
        selectedColumn: 0, classNames: [],
        subject: projectData.subject, prompt: '',
        provider: 'mock', model: '',
        targetMainCount: 0, targetSubCount: 0, attachTags: true
    };
    // UI 上的標題與描述
    document.getElementById('upload-title').textContent = UPLOAD_MODE_META[mode].title;
    document.getElementById('upload-mode-desc').textContent = UPLOAD_MODE_META[mode].desc;
    // 動態調整 stepper 顯示（隱藏不需要的步驟）
    document.querySelectorAll('.upload-stepper .step').forEach(s => {
        const stepNum = parseInt(s.dataset.step, 10);
        s.style.display = UPLOAD_MODE_META[mode].steps.includes(stepNum) ? '' : 'none';
    });
    // 顯示／隱藏 scaffold 選項區
    document.getElementById('upload-scaffold-options').style.display = UPLOAD_MODE_META[mode].showScaffoldOptions ? '' : 'none';

    document.getElementById('upload-overlay').style.display = 'flex';
    showUploadStep(uploadState.step);
    populateUploadProviderSelect();
    // scaffold-empty 進來就直接到 step 3，須先預填學科
    if (mode === 'scaffold-empty') {
        document.getElementById('upload-subject').value = projectData.subject || '';
    }
}
function setupUploadModal() {
    const overlay = document.getElementById('upload-overlay');
    overlay.addEventListener('click', (e) => { if (e.target.id === 'upload-overlay') overlay.style.display = 'none'; });
    document.getElementById('upload-cancel').addEventListener('click', () => overlay.style.display = 'none');
    document.getElementById('upload-prev').addEventListener('click', () => uploadGoStep(uploadState.step - 1));
    document.getElementById('upload-next').addEventListener('click', () => uploadGoStep(uploadState.step + 1));
    const dz = document.getElementById('upload-dropzone');
    dz.addEventListener('click', () => document.getElementById('upload-file-input').click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', (e) => {
        e.preventDefault(); dz.classList.remove('drag-over');
        const file = e.dataTransfer.files[0]; if (file) handleUploadFile(file);
    });
    document.getElementById('upload-file-input').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleUploadFile(f); });
    document.getElementById('upload-provider').addEventListener('change', () => populateUploadModelSelect(false));
    document.getElementById('upload-refresh-models').addEventListener('click', () => populateUploadModelSelect(true));
}
function showUploadStep(n) {
    uploadState.step = n;
    document.querySelectorAll('.upload-stepper .step').forEach(s => s.classList.toggle('active', parseInt(s.dataset.step, 10) === n));
    document.querySelectorAll('.upload-step-pane').forEach(p => p.style.display = (parseInt(p.dataset.step, 10) === n) ? 'block' : 'none');
    const steps = (UPLOAD_MODE_META[uploadState.mode] || UPLOAD_MODE_META.classify).steps;
    const isFirst = n === steps[0];
    const isLast = n === steps[steps.length - 1];
    const isPreLast = n === steps[steps.length - 2]; // 通常是 step 3（送出 AI 前最後一步）
    document.getElementById('upload-prev').style.visibility = isFirst ? 'hidden' : 'visible';
    const nextBtn = document.getElementById('upload-next');
    nextBtn.textContent = isLast ? '完成' : isPreLast ? (uploadState.mode === 'classify' ? '開始 AI 分類' : '開始 AI 建構') : '下一步';
}
function uploadGoStep(n) {
    if (!uploadState) return;
    const steps = (UPLOAD_MODE_META[uploadState.mode] || UPLOAD_MODE_META.classify).steps;
    const idx = steps.indexOf(uploadState.step);
    if (idx < 0) return;
    // 「上一步 / 下一步」實際是在 steps 陣列中前後移
    let targetIdx;
    if (n < uploadState.step) targetIdx = idx - 1;
    else if (n > uploadState.step) targetIdx = idx + 1;
    else targetIdx = idx;
    if (targetIdx < 0) return;
    // 超出最後一步 → 關閉視窗
    if (targetIdx >= steps.length) {
        document.getElementById('upload-overlay').style.display = 'none';
        return;
    }
    const targetStep = steps[targetIdx];
    // 進入 step 2/3/4 前的驗證與資料準備
    if (uploadState.step === 1 && targetStep === 2) {
        if (!uploadState.classNames.length) { toast('請先選擇檔案', 'warning'); return; }
        renderUploadStep2();
    }
    if (targetStep === 3) {
        renderUploadStep3();
    }
    if (targetStep === 4) {
        // scaffold-empty 也需要先驗學科
        if (uploadState.mode === 'scaffold-empty') {
            const subj = (document.getElementById('upload-subject').value || '').trim();
            if (!subj) { toast('請先填學科名稱', 'warning'); return; }
        }
        showUploadStep(4);
        startAIClassify();
        return;
    }
    showUploadStep(targetStep);
}
async function handleUploadFile(file) {
    uploadState.file = file;
    document.getElementById('upload-file-info').style.display = 'block';
    document.getElementById('upload-file-info').textContent = `已選：${file.name}（${(file.size / 1024).toFixed(1)} KB）`;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    uploadState.hasHeader = false;
    uploadState.headerNames = null;
    try {
        if (ext === 'csv') {
            const text = await file.text();
            const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
            uploadState.raw = parsed.data;
            uploadState.columns = (parsed.data[0] || []).map((_, i) => `第 ${i + 1} 欄`);
        } else if (ext === 'xlsx' || ext === 'xls') {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            uploadState.raw = rows;
            uploadState.columns = (rows[0] || []).map((_, i) => `第 ${i + 1} 欄`);
        } else if (ext === 'md' || ext === 'markdown') {
            const text = await file.text();
            const lines = text.split(/\r?\n/).map(l => l.replace(/^[-*+]\s*/, '').replace(/^\d+\.\s*/, '').trim()).filter(l => l && !l.startsWith('#'));
            uploadState.raw = lines.map(l => [l]);
            uploadState.columns = ['班名（文字行）'];
        } else {
            const text = await file.text();
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
            uploadState.raw = lines.map(l => [l]);
            uploadState.columns = ['班名（文字行）'];
        }
        // 自動偵測標題列
        if ((ext === 'csv' || ext === 'xlsx' || ext === 'xls') && uploadState.raw && uploadState.raw.length > 1) {
            uploadState.hasHeader = detectHeaderRow(uploadState.raw);
            if (uploadState.hasHeader) {
                uploadState.headerNames = uploadState.raw[0].map(v => String(v || '').trim());
            }
        }
        // 智慧推測「班名」欄位
        uploadState.selectedColumn = pickClassNameColumn(uploadState.raw, uploadState.headerNames);
        recalcClassNames();
        toast('檔案剖析完成，請進入下一步', 'success');
    } catch (err) {
        console.error(err);
        toast('剖析失敗：' + err.message, 'error');
    }
}

// 啟發式判斷首列是否為標題列：
// - 首列每格都是短字串（≤ 30 字、非空、非純數字）
// - 後續列若任一格與首列「型別不同」（如數字 vs 文字、或長度差距大）→ 視為標題
function detectHeaderRow(rows) {
    if (!rows || rows.length < 2) return false;
    const first = rows[0].map(v => String(v == null ? '' : v).trim());
    if (first.some(v => v === '')) return false;
    const headerHints = /(代號|編號|代碼|序號|名稱|班名|課程|課名|標題|題目|主題|分類|類別|備註|說明|id|name|code|title|subject|class|category)/i;
    if (first.some(v => headerHints.test(v))) return true;
    // 啟發式：首列全都是非數字短文字，且第二列至少一個是數字 → 標題
    const allShortText = first.every(v => v.length <= 30 && !/^-?\d+(\.\d+)?$/.test(v));
    if (!allShortText) return false;
    const second = (rows[1] || []).map(v => String(v == null ? '' : v).trim());
    const secondHasNum = second.some(v => /^-?\d+(\.\d+)?$/.test(v));
    return secondHasNum;
}

// 啟發式挑出「班名」欄位的索引
function pickClassNameColumn(rows, headerNames) {
    if (!rows || rows.length === 0) return 0;
    const cols = (rows[0] || []).length;
    if (cols <= 1) return 0;
    // 規則 1：標題列關鍵字命中
    if (Array.isArray(headerNames)) {
        const goodKeywords = /(班名|課程名|課名|名稱|title|name|subject|class)/i;
        const badKeywords = /(代號|編號|代碼|序號|id|code|no\.?|期別|期數|時數|人數|金額|價格|日期)/i;
        let bestIdx = -1;
        let bestScore = -Infinity;
        headerNames.forEach((h, i) => {
            let s = 0;
            if (goodKeywords.test(h)) s += 10;
            if (badKeywords.test(h)) s -= 10;
            if (s !== 0 && s > bestScore) { bestScore = s; bestIdx = i; }
        });
        if (bestIdx >= 0) return bestIdx;
    }
    // 規則 2：根據資料列特徵打分（避開純代號模式）
    const startRow = Array.isArray(headerNames) ? 1 : 0;
    const sampleN = Math.min(20, rows.length - startRow);
    if (sampleN <= 0) return 0;
    let bestIdx = 0, bestScore = -Infinity;
    for (let c = 0; c < cols; c++) {
        let totalLen = 0;
        let chineseHits = 0;
        let codeLikeHits = 0; // 5-8 字元純英數混合（疑似班代號）
        let pureNumHits = 0;
        let nonEmpty = 0;
        for (let r = startRow; r < startRow + sampleN; r++) {
            const v = String((rows[r] && rows[r][c] != null ? rows[r][c] : '')).trim();
            if (!v) continue;
            nonEmpty++;
            totalLen += v.length;
            if (/[\u4e00-\u9fff]/.test(v)) chineseHits++;
            if (/^[A-Za-z0-9]{3,10}$/.test(v) && /[A-Za-z]/.test(v) && /\d/.test(v)) codeLikeHits++;
            if (/^-?\d+(\.\d+)?$/.test(v)) pureNumHits++;
        }
        if (nonEmpty === 0) continue;
        const avgLen = totalLen / nonEmpty;
        const chineseRate = chineseHits / nonEmpty;
        const codeRate = codeLikeHits / nonEmpty;
        const numRate = pureNumHits / nonEmpty;
        // 平均長度長 + 中文比例高 = 高分；代號形式高 / 純數字高 = 扣分
        const score = avgLen * 1.0 + chineseRate * 30 - codeRate * 40 - numRate * 50;
        if (score > bestScore) { bestScore = score; bestIdx = c; }
    }
    return bestIdx;
}
function recalcClassNames() {
    const col = uploadState.selectedColumn || 0;
    const startRow = uploadState.hasHeader ? 1 : 0;
    const set = new Set();
    const arr = [];
    (uploadState.raw || []).forEach((row, i) => {
        if (i < startRow) return;
        const v = (row[col] == null ? '' : row[col]).toString().trim();
        if (!v) return;
        if (set.has(v)) return;
        set.add(v); arr.push(v);
    });
    uploadState.classNames = arr;
}

function colIndexToLetter(i) {
    let s = '';
    let n = i;
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
}

function renderUploadStep2() {
    const picker = document.getElementById('upload-col-picker');
    picker.innerHTML = '';
    const cols = uploadState.columns || [];

    // 標題列控制（僅 csv/xlsx 顯示）
    const ext = ((uploadState.file && uploadState.file.name) || '').split('.').pop().toLowerCase();
    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:13px;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'upload-has-header';
        cb.checked = !!uploadState.hasHeader;
        const lbl = document.createElement('label');
        lbl.htmlFor = 'upload-has-header';
        lbl.textContent = '檔案首列為標題列（不參與分類）';
        cb.addEventListener('change', () => {
            uploadState.hasHeader = cb.checked;
            uploadState.headerNames = cb.checked ? (uploadState.raw[0] || []).map(v => String(v == null ? '' : v).trim()) : null;
            // 重新智慧挑欄
            uploadState.selectedColumn = pickClassNameColumn(uploadState.raw, uploadState.headerNames);
            recalcClassNames();
            renderUploadStep2();
        });
        headerRow.appendChild(cb);
        headerRow.appendChild(lbl);
        picker.appendChild(headerRow);
    }

    // 卡片式欄位選擇器
    const grid = document.createElement('div');
    grid.className = 'upload-col-grid';
    const startRow = uploadState.hasHeader ? 1 : 0;

    cols.forEach((_, i) => {
        const card = document.createElement('div');
        card.className = 'upload-col-card';
        if (i === uploadState.selectedColumn) card.classList.add('selected');

        // 標題：欄位代號 + 標題列名稱
        const headTxt = (uploadState.headerNames && uploadState.headerNames[i]) || '';
        const colLabel = ext === 'txt' || ext === 'md' || ext === 'markdown' ? '班名' : `${colIndexToLetter(i)} 欄`;
        const title = document.createElement('div');
        title.className = 'upload-col-card-title';
        title.innerHTML = `<input type="radio" name="upload-col" ${i === uploadState.selectedColumn ? 'checked' : ''}> <b>${colLabel}</b>${headTxt ? ` <span class="upload-col-card-header">「${escapeHtml(headTxt)}」</span>` : ''}`;
        card.appendChild(title);

        // 取 5 個範例值
        const samples = [];
        for (let r = startRow; r < (uploadState.raw || []).length && samples.length < 5; r++) {
            const v = String(((uploadState.raw[r] || [])[i] == null ? '' : uploadState.raw[r][i])).trim();
            if (v) samples.push(v);
        }
        const sample = document.createElement('div');
        sample.className = 'upload-col-card-samples';
        sample.innerHTML = samples.length === 0 ? '<i style="color:var(--text-muted);">（空欄位）</i>' :
            samples.map(s => `<span class="upload-col-sample">${escapeHtml(s.length > 40 ? s.slice(0, 40) + '…' : s)}</span>`).join('');
        card.appendChild(sample);

        // 計算非重複筆數
        const set = new Set();
        let total = 0;
        for (let r = startRow; r < (uploadState.raw || []).length; r++) {
            const v = String(((uploadState.raw[r] || [])[i] == null ? '' : uploadState.raw[r][i])).trim();
            if (v) { total++; set.add(v); }
        }
        const stat = document.createElement('div');
        stat.className = 'upload-col-card-stat';
        stat.textContent = `共 ${total} 筆 / ${set.size} 個唯一值`;
        card.appendChild(stat);

        card.addEventListener('click', () => {
            uploadState.selectedColumn = i;
            recalcClassNames();
            renderUploadStep2();
        });
        grid.appendChild(card);
    });
    picker.appendChild(grid);

    const stat = document.createElement('div');
    stat.className = 'upload-col-summary';
    const head = (uploadState.headerNames && uploadState.headerNames[uploadState.selectedColumn]) || '';
    stat.innerHTML = `已選欄位：<b>${colIndexToLetter(uploadState.selectedColumn)} 欄</b>${head ? '「' + escapeHtml(head) + '」' : ''} ─ 共 <b>${uploadState.classNames.length}</b> 筆唯一班名`;
    picker.appendChild(stat);

    renderUploadPreview();
}
function renderUploadPreview() {
    const wrap = document.getElementById('upload-preview');
    const items = uploadState.classNames || [];
    wrap.textContent = items.length === 0 ? '（無資料）' : items.slice(0, 200).map((n, i) => `${i + 1}. ${n}`).join('\n') + (items.length > 200 ? `\n… 共 ${items.length} 筆` : '');
}
function renderUploadStep3() {
    document.getElementById('upload-subject').value = uploadState.subject || projectData.subject;
    document.getElementById('upload-prompt').value = uploadState.prompt || '';
    populateUploadProviderSelect();
}

async function populateUploadProviderSelect() {
    const sel = document.getElementById('upload-provider');
    if (!sel) return;
    const stored = await AppStorage.listApiKeys();
    const storedSet = new Set(stored.map(s => s.provider));
    sel.innerHTML = '';
    AppAI.listProviders().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const status = p.id === 'mock' ? '（離線）' : (storedSet.has(p.id) ? '✓' : '⚠ 未設定 Key');
        opt.textContent = `${p.name} ${status}`;
        sel.appendChild(opt);
    });
    // 還原上次選擇
    const last = AppStorage.Settings.getAIModel();
    if (last && last.includes('|')) {
        const [pid] = last.split('|');
        if (Array.from(sel.options).some(o => o.value === pid)) sel.value = pid;
    }
    await populateUploadModelSelect(false);
}

async function populateUploadModelSelect(forceRefresh) {
    const provSel = document.getElementById('upload-provider');
    const modSel = document.getElementById('upload-model');
    const meta = document.getElementById('upload-model-meta');
    if (!provSel || !modSel) return;
    const pid = provSel.value;
    if (pid === 'mock') {
        modSel.innerHTML = '<option value="mock">mock</option>';
        meta.textContent = 'Mock 模式：不呼叫真實 API，回傳預設範例分類結果';
        return;
    }
    if (forceRefresh && !AppAI.hasMasterPasswordInMemory()) {
        const pwd = await promptMasterPassword({ title: '請輸入主密碼', desc: '需要主密碼解密 API Key 才能呼叫 API。' });
        if (!pwd) return;
        AppAI.setMasterPassword(pwd);
    }
    modSel.innerHTML = '<option>抓取中…</option>';
    meta.textContent = forceRefresh ? '正在從 API 取得最新模型清單…' : '載入快取…';
    try {
        const r = forceRefresh
            ? await AppAI.fetchModels(pid, { forceRefresh: true })
            : await AppAI.fetchModels(pid, { forceRefresh: false });
        const last = AppStorage.Settings.getAIModel();
        let preferred = '';
        if (last && last.startsWith(pid + '|')) preferred = last.substring(pid.length + 1);
        fillModelSelect(modSel, r.models, preferred);
        if (r.source === 'live') meta.textContent = `✅ 已從 API 取得 ${r.models.length} 個模型 · ${formatTime(r.fetchedAt)}（按 🔄 強制更新）`;
        else if (r.source === 'cache') meta.textContent = `📦 快取 ${r.models.length} 個模型 · ${formatTime(r.fetchedAt)}（按 🔄 強制重抓）`;
        else meta.textContent = `⚠️ 使用內建備援清單（${r.models.length} 個）。請設定 API Key 或按 🔄 重試`;
        if (forceRefresh && r.source === 'live') toast(`抓到 ${r.models.length} 個最新模型`, 'success');
    } catch (err) {
        modSel.innerHTML = '<option>（抓取失敗）</option>';
        meta.textContent = '❌ ' + err.message;
        toast('抓取模型清單失敗：' + err.message, 'error');
    }
}
async function startAIClassify() {
    const progress = document.getElementById('upload-progress');
    const result = document.getElementById('upload-result');
    const meta = document.getElementById('upload-progress-meta');
    const elapsedEl = document.getElementById('upload-elapsed');
    const slowTip = document.getElementById('upload-slow-tip');
    const abortBtn = document.getElementById('upload-abort');
    progress.textContent = '正在準備分類…';
    result.textContent = '';
    if (meta) meta.style.display = 'none';
    if (slowTip) slowTip.style.display = 'none';
    if (abortBtn) abortBtn.style.display = '';

    const subject = document.getElementById('upload-subject').value.trim() || projectData.subject;
    const userPrompt = document.getElementById('upload-prompt').value.trim();
    const providerId = document.getElementById('upload-provider').value;
    const model = document.getElementById('upload-model').value;
    if (!model || model.startsWith('（') || model === '抓取中…') {
        progress.textContent = '❌ 請先選一個有效的模型（按 🔄 抓取最新清單）';
        return;
    }
    AppStorage.Settings.setAIModel(`${providerId}|${model}`);

    if (providerId !== 'mock' && !AppAI.hasMasterPasswordInMemory()) {
        const pwd = await promptMasterPassword({ title: '請輸入主密碼', desc: '需要主密碼解密 API Key 才能呼叫真實 AI。' });
        if (!pwd) { progress.textContent = '已取消'; return; }
        AppAI.setMasterPassword(pwd);
    }

    // 經過秒數計時 + 取消按鈕
    const controller = new AbortController();
    const startTs = Date.now();
    let timerId = null;
    const updateTimer = () => {
        const sec = Math.floor((Date.now() - startTs) / 1000);
        if (elapsedEl) elapsedEl.textContent = `已用 ${sec} 秒`;
        if (sec >= 30 && slowTip && providerId === 'gemini' && /2\.5/.test(model)) slowTip.style.display = 'block';
        if (sec >= 60 && slowTip) slowTip.style.display = 'block';
    };
    if (meta) meta.style.display = 'block';
    timerId = setInterval(updateTimer, 1000);
    updateTimer();
    const onAbortClick = () => controller.abort();
    if (abortBtn) abortBtn.addEventListener('click', onAbortClick, { once: true });

    try {
        const mode = (uploadState && uploadState.mode) || 'classify';
        progress.textContent = `呼叫 ${providerId}（${model}）中…請稍候`;
        // 讀取 scaffold 控制（即使 classify 模式也讀，無傷）
        const minMain = parseInt(document.getElementById('upload-min-main').value, 10) || 0;
        const maxMain = parseInt(document.getElementById('upload-max-main').value, 10) || 0;
        const minSub = parseInt(document.getElementById('upload-min-sub').value, 10) || 0;
        const maxSub = parseInt(document.getElementById('upload-max-sub').value, 10) || 0;
        const attachTags = !!document.getElementById('upload-attach-tags').checked;
        // 範圍合理性驗證
        if (minMain && maxMain && minMain > maxMain) {
            progress.textContent = '❌ 主分類數最少不能大於最多';
            return;
        }
        if (minSub && maxSub && minSub > maxSub) {
            progress.textContent = '❌ 子分類數最少不能大於最多';
            return;
        }

        let r;
        if (mode === 'classify') {
            r = await AppAI.classifyClasses(
                uploadState.classNames, subject, userPrompt, providerId, model,
                projectData.tagLibrary, { signal: controller.signal }
            );
        } else {
            // scaffold-empty 或 scaffold-inspired
            const inspirationNames = mode === 'scaffold-inspired' ? uploadState.classNames : [];
            r = await AppAI.buildScaffold(
                subject, userPrompt, providerId, model, projectData.tagLibrary,
                {
                    signal: controller.signal,
                    minMain, maxMain, minSub, maxSub,
                    attachTags, inspirationNames
                }
            );
        }
        progress.textContent = r.fromCache ? '✅ 快取命中（未消耗 API 額度）' : (mode === 'classify' ? '✅ 分類完成' : '✅ 骨架建構完成');
        result.textContent = JSON.stringify(r.parsed, null, 2);
        snapshot('auto', mode === 'classify' ? '套用 AI 分類前自動備份' : '套用 AI 骨架前自動備份');
        applyClassificationResult(r.parsed, subject, { mode, attachTags });
        // 後處理保險的提示
        if (r.parsed && Array.isArray(r.parsed._adjustments) && r.parsed._adjustments.length) {
            toast('系統自動調整：' + r.parsed._adjustments.join('；'), 'warning');
        }
        toast(mode === 'classify' ? 'AI 分類完成並已套用' : 'AI 骨架建構完成並已套用', 'success');
    } catch (err) {
        console.error(err);
        progress.textContent = '❌ 失敗';
        result.textContent = err.message;
        toast('AI 分類失敗：' + err.message, 'error');
    } finally {
        if (timerId) clearInterval(timerId);
        if (abortBtn) abortBtn.removeEventListener('click', onAbortClick);
        // 不隱藏 meta，保留最後耗時供使用者參考；但隱藏取消按鈕
        if (abortBtn) abortBtn.style.display = 'none';
    }
}
function applyClassificationResult(parsed, subject, opts) {
    if (!parsed || !Array.isArray(parsed.categories)) return;
    opts = opts || {};
    const mode = opts.mode || 'classify';
    const isScaffold = mode === 'scaffold-empty' || mode === 'scaffold-inspired';
    if (subject) projectData.subject = subject;
    // 清空既有 cards/connectors（保留其他元件，及只連接其他元件的連線）
    const others = projectData.components.filter(c => c.type !== 'course-category');
    const otherIds = new Set(others.map(o => o.id));
    projectData.components = others;
    projectData.connectors = projectData.connectors.filter(c =>
        otherIds.has(c.fromComponentId) && otherIds.has(c.toComponentId)
    );
    // scaffold-inspired：把上傳的班名存到 inspirationClasses（不放入卡片）
    if (mode === 'scaffold-inspired' && uploadState && Array.isArray(uploadState.classNames)) {
        projectData.inspirationClasses = uploadState.classNames.slice();
    }
    // 建立卡片：每個 category + 每個 subcategory 各一張卡
    const palCols = (typeof getPaletteColors === 'function' ? getPaletteColors() : { main: '#6366f1', sub: '#ec4899' });
    const colW = 360, rowH = 200;
    parsed.categories.forEach((cat, ci) => {
        const catCard = createComponent('course-category');
        catCard.props.title = cat.name;
        catCard.props.subtitle = '主分類';
        catCard.x = 100;
        catCard.y = 100 + ci * rowH * 2;
        catCard.zIndex = nextTopZIndex();
        catCard.style.backgroundColor = '#ffffff';
        catCard.style.borderColor = palCols.main;
        projectData.components.push(catCard);
        (cat.subcategories || []).forEach((sub, si) => {
            const subCard = createComponent('course-category');
            subCard.props.title = sub.name;
            subCard.props.subtitle = `子分類（隸屬：${cat.name}）`;
            subCard.x = 100 + colW + si * (colW * 0.8);
            subCard.y = 100 + ci * rowH * 2 + si * 30;
            subCard.zIndex = nextTopZIndex();
            subCard.style.borderColor = palCols.sub;
            // scaffold 模式：把 sub.tags（若 AI 有附）寫到子卡的 assignedTags 上
            if (isScaffold && sub.tags && typeof sub.tags === 'object') {
                TAG_CATEGORY_KEYS.forEach(cat => {
                    if (Array.isArray(sub.tags[cat])) {
                        subCard.props.assignedTags[cat] = sub.tags[cat].slice();
                    }
                });
            }
            // classify 模式：把 sub.classes 班名加入子卡（scaffold 模式跳過）
            if (!isScaffold) {
                (sub.classes || []).forEach(cls => {
                    subCard.props.classes.push({
                        id: 'cls' + (classIdCounter++),
                        name: cls.name,
                        note: '',
                        tags: cls.tags || { audience: [], level: [], attribute: [], topic: [], format: [] }
                    });
                });
            }
            projectData.components.push(subCard);
            // 建連線（主→子）
            projectData.connectors.push({
                id: 'conn' + (connectorIdCounter++),
                fromComponentId: catCard.id,
                toComponentId: subCard.id,
                routeType: 'orthogonal',
                style: { color: '#475569', width: 2, dash: 'solid' },
                arrow: 'forward',
                label: '', waypoints: []
            });
        });
    });
    // AI 產生後自動套用智慧整理（會自動擴張白板，確保不溢出）
    smartLayout({ silent: true, skipSnapshot: true });
    updateTitleBar();
}

// ============================================================
// 班名 Popup
// ============================================================
function openClassPopup(cardId) {
    const card = getComponent(cardId);
    if (!card || card.type !== 'course-category') return;
    activePopupCardId = cardId;
    document.getElementById('class-popup-title').textContent = '班名清單 - ' + (card.props.title || '未命名類別');
    document.getElementById('class-popup-search').value = '';
    document.getElementById('class-popup-overlay').style.display = 'flex';
    renderClassPopup();
    renderInspirationSection();
}
function setupClassPopupModal() {
    document.getElementById('btn-class-popup-close').addEventListener('click', () => document.getElementById('class-popup-overlay').style.display = 'none');
    document.getElementById('class-popup-overlay').addEventListener('click', (e) => { if (e.target.id === 'class-popup-overlay') document.getElementById('class-popup-overlay').style.display = 'none'; });
    document.getElementById('btn-add-class').addEventListener('click', () => {
        const card = getComponent(activePopupCardId); if (!card) return;
        const cl = { id: 'cls' + (classIdCounter++), name: '新班名', note: '', tags: { audience: [], level: [], attribute: [], topic: [], format: [] } };
        card.props.classes.push(cl);
        renderClassPopup(); renderCanvas(); scheduleSaveDraft();
        openClassEdit(card.id, cl.id);
    });
    document.getElementById('class-popup-search').addEventListener('input', renderClassPopup);
    document.getElementById('class-popup-virtual').addEventListener('scroll', virtualScrollUpdate);
    // 靈感班名：清空、複製
    document.getElementById('btn-inspiration-clear').addEventListener('click', () => {
        if (!projectData.inspirationClasses || !projectData.inspirationClasses.length) return;
        if (!confirm(`確定清空 ${projectData.inspirationClasses.length} 個靈感班名？此動作無法復原。`)) return;
        projectData.inspirationClasses = [];
        renderInspirationSection();
        scheduleSaveDraft();
        toast('已清空靈感班名清單', 'success');
    });
    document.getElementById('btn-inspiration-export').addEventListener('click', async () => {
        const list = projectData.inspirationClasses || [];
        if (!list.length) return;
        try {
            await navigator.clipboard.writeText(list.join('\n'));
            toast(`已複製 ${list.length} 個班名到剪貼簿`, 'success');
        } catch (e) {
            toast('複製失敗：' + e.message, 'error');
        }
    });
}
// 渲染靈感班名 section（僅當有資料時才顯示 details）
function renderInspirationSection() {
    const sec = document.getElementById('inspiration-section');
    const list = (projectData && projectData.inspirationClasses) || [];
    if (!list.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    document.getElementById('inspiration-count').textContent = `共 ${list.length} 個`;
    const wrap = document.getElementById('inspiration-list');
    wrap.innerHTML = '';
    const max = 300;
    list.slice(0, max).forEach(name => {
        const chip = document.createElement('span');
        chip.className = 'inspiration-chip';
        chip.textContent = name;
        wrap.appendChild(chip);
    });
    if (list.length > max) {
        const more = document.createElement('span');
        more.className = 'inspiration-chip inspiration-chip-more';
        more.textContent = `…還有 ${list.length - max} 個`;
        wrap.appendChild(more);
    }
}
const ROW_HEIGHT = 60;
function renderClassPopup() {
    const card = getComponent(activePopupCardId); if (!card) return;
    const filter = (document.getElementById('class-popup-search').value || '').toLowerCase();
    const all = card.props.classes || [];
    const filtered = filter ? all.filter(cl => (cl.name || '').toLowerCase().includes(filter)) : all;
    document.getElementById('class-popup-count').textContent = `共 ${all.length} 個` + (filter ? ` / 過濾後 ${filtered.length}` : '');
    const wrap = document.getElementById('class-popup-virtual');
    const spacer = document.getElementById('class-popup-spacer');
    spacer.style.height = (filtered.length * ROW_HEIGHT) + 'px';
    wrap._filtered = filtered;
    wrap._cardId = activePopupCardId;
    virtualScrollUpdate();
}
function virtualScrollUpdate() {
    const wrap = document.getElementById('class-popup-virtual');
    const items = document.getElementById('class-popup-items');
    const filtered = wrap._filtered || [];
    if (filtered.length === 0) {
        items.style.transform = '';
        items.innerHTML = '<div class="class-row-empty">沒有班名（點擊上方「＋ 新增班名」）</div>';
        return;
    }
    const scrollTop = wrap.scrollTop;
    const viewH = wrap.clientHeight;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
    const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + viewH) / ROW_HEIGHT) + 5);
    items.style.transform = `translateY(${startIdx * ROW_HEIGHT}px)`;
    items.innerHTML = '';
    for (let i = startIdx; i < endIdx; i++) {
        const cl = filtered[i];
        items.appendChild(buildClassRow(cl, wrap._cardId));
    }
}
function buildClassRow(cl, cardId) {
    const row = document.createElement('div');
    row.className = 'class-row';
    row.style.minHeight = ROW_HEIGHT + 'px';
    const name = document.createElement('div'); name.className = 'class-row-name'; name.textContent = cl.name || '(無名)';
    const tags = document.createElement('div'); tags.className = 'class-row-tags';
    TAG_CATEGORY_KEYS.forEach(cat => {
        (cl.tags && cl.tags[cat] || []).forEach(tagName => {
            const tag = findTagByName(cat, tagName);
            const chip = document.createElement('span'); chip.className = 'class-row-tag';
            chip.textContent = tagName;
            chip.style.background = tag ? tag.color : '#94a3b8';
            chip.title = TAG_CATEGORY_LABELS[cat];
            tags.appendChild(chip);
        });
    });
    const acts = document.createElement('div'); acts.className = 'class-row-actions';
    const editBtn = document.createElement('button'); editBtn.className = 'btn btn-small'; editBtn.textContent = '編輯';
    editBtn.addEventListener('click', () => openClassEdit(cardId, cl.id));
    const moveBtn = document.createElement('button'); moveBtn.className = 'btn btn-small'; moveBtn.textContent = '搬移';
    moveBtn.title = '移動到其他類別卡片';
    moveBtn.addEventListener('click', (e) => { e.stopPropagation(); openMoveClassMenu(moveBtn, cardId, cl.id); });
    const delBtn = document.createElement('button'); delBtn.className = 'btn btn-small btn-danger'; delBtn.textContent = '刪除';
    delBtn.addEventListener('click', () => {
        if (!confirm(`刪除班名「${cl.name}」？`)) return;
        const card = getComponent(cardId);
        card.props.classes = card.props.classes.filter(c => c.id !== cl.id);
        renderClassPopup(); renderCanvas(); scheduleSaveDraft();
    });
    acts.appendChild(editBtn); acts.appendChild(moveBtn); acts.appendChild(delBtn);
    row.appendChild(name); row.appendChild(tags); row.appendChild(acts);
    return row;
}

// 浮出小選單：把班名搬到其他類別卡片
function openMoveClassMenu(anchorEl, sourceCardId, classId) {
    closeMoveClassMenu();
    const sourceCard = getComponent(sourceCardId); if (!sourceCard) return;
    const cls = (sourceCard.props.classes || []).find(c => c.id === classId); if (!cls) return;
    const list = buildCategoryCardHierarchy().filter(({ card }) => card.id !== sourceCardId);
    if (list.length === 0) { toast('沒有其他類別卡片可搬移', 'warning'); return; }

    const menu = document.createElement('div');
    menu.id = 'move-class-menu';
    menu.className = 'context-menu';
    menu.style.maxHeight = '320px';
    menu.style.overflowY = 'auto';
    menu.style.minWidth = '240px';
    const head = document.createElement('div');
    head.style.cssText = 'padding:6px 12px;font-size:11px;color:var(--text-muted);border-bottom:1px solid var(--border);';
    head.textContent = `搬移「${cls.name}」到：`;
    menu.appendChild(head);
    list.forEach(({ card, depth }) => {
        const item = document.createElement('div');
        item.className = 'context-menu-item';
        const indent = '　'.repeat(depth) + (depth > 0 ? '└ ' : '');
        item.innerHTML = `<span style="white-space:pre;">${escapeHtml(indent)}</span><span>${escapeHtml(card.props.title || '(未命名)')}</span>`;
        item.title = card.props.subtitle || '';
        item.addEventListener('click', () => {
            sourceCard.props.classes = sourceCard.props.classes.filter(c => c.id !== cls.id);
            if (!Array.isArray(card.props.classes)) card.props.classes = [];
            card.props.classes.push(cls);
            closeMoveClassMenu();
            toast(`已搬移到「${card.props.title}」`, 'success');
            renderClassPopup(); renderCanvas(); scheduleSaveDraft();
        });
        menu.appendChild(item);
    });
    document.body.appendChild(menu);
    const rect = anchorEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, rect.left)) + 'px';
    menu.style.top = (rect.bottom + 4) + 'px';
    // 點外部關閉
    setTimeout(() => document.addEventListener('mousedown', closeMoveClassMenuOnOutside, { capture: true }), 0);
}
function closeMoveClassMenuOnOutside(e) {
    const m = document.getElementById('move-class-menu');
    if (m && !m.contains(e.target)) closeMoveClassMenu();
}
function closeMoveClassMenu() {
    const m = document.getElementById('move-class-menu');
    if (m) m.remove();
    document.removeEventListener('mousedown', closeMoveClassMenuOnOutside, { capture: true });
}

// ============================================================
// 班名編輯 Modal
// ============================================================
function openClassEdit(cardId, classId) {
    const card = getComponent(cardId); if (!card) return;
    const cls = card.props.classes.find(c => c.id === classId); if (!cls) return;
    classEditState = { cardId, classId, draft: JSON.parse(JSON.stringify(cls)) };
    if (!classEditState.draft.tags) classEditState.draft.tags = { audience: [], level: [], attribute: [], topic: [], format: [] };
    document.getElementById('class-edit-title').textContent = '編輯班名 - ' + (cls.name || '');
    document.getElementById('class-edit-name').value = cls.name || '';
    document.getElementById('class-edit-note').value = cls.note || '';
    populateClassEditCardSelect(cardId);
    renderClassEditTags();
    document.getElementById('class-edit-overlay').style.display = 'flex';
}

// 用 connectors 組階層，回傳排序好的卡片清單（含縮排 prefix）
function buildCategoryCardHierarchy() {
    const cards = projectData.components.filter(c => c.type === 'course-category');
    if (cards.length === 0) return [];
    const cardById = {}; cards.forEach(c => cardById[c.id] = c);
    const childrenOf = {}; cards.forEach(c => childrenOf[c.id] = []);
    const parentOf = {};
    projectData.connectors.forEach(conn => {
        if (cardById[conn.fromComponentId] && cardById[conn.toComponentId]) {
            childrenOf[conn.fromComponentId].push(conn.toComponentId);
            parentOf[conn.toComponentId] = conn.fromComponentId;
        }
    });
    const roots = cards.filter(c => !parentOf[c.id]).sort((a, b) => (a.props.title || '').localeCompare(b.props.title || ''));
    const out = [];
    const visited = new Set();
    const walk = (id, depth) => {
        if (visited.has(id)) return; // 防環
        visited.add(id);
        const c = cardById[id];
        out.push({ card: c, depth });
        (childrenOf[id] || []).slice().sort((a, b) => (cardById[a].props.title || '').localeCompare(cardById[b].props.title || '')).forEach(cid => walk(cid, depth + 1));
    };
    roots.forEach(r => walk(r.id, 0));
    // 把孤立的（圖中有環或斷裂）也補上
    cards.forEach(c => { if (!visited.has(c.id)) out.push({ card: c, depth: 0 }); });
    return out;
}

function populateClassEditCardSelect(currentCardId) {
    const sel = document.getElementById('class-edit-card');
    if (!sel) return;
    sel.innerHTML = '';
    const list = buildCategoryCardHierarchy();
    list.forEach(({ card, depth }) => {
        const opt = document.createElement('option');
        opt.value = card.id;
        const indent = '　'.repeat(depth) + (depth > 0 ? '└ ' : '');
        const title = card.props.title || '(未命名)';
        const sub = card.props.subtitle ? ` · ${card.props.subtitle.slice(0, 14)}` : '';
        opt.textContent = `${indent}${title}${sub}`;
        if (card.id === currentCardId) opt.selected = true;
        sel.appendChild(opt);
    });
}

function setupClassEditModal() {
    document.getElementById('btn-class-edit-save').addEventListener('click', () => {
        if (!classEditState) return;
        const sourceCard = getComponent(classEditState.cardId); if (!sourceCard) return;
        const cls = sourceCard.props.classes.find(c => c.id === classEditState.classId); if (!cls) return;
        const targetCardId = document.getElementById('class-edit-card').value;
        const targetCard = getComponent(targetCardId);
        cls.name = document.getElementById('class-edit-name').value.trim() || cls.name;
        cls.note = document.getElementById('class-edit-note').value;
        cls.tags = classEditState.draft.tags;
        // 更換歸屬卡片：從原卡刪除、加入目標卡
        if (targetCard && targetCardId && targetCardId !== classEditState.cardId) {
            sourceCard.props.classes = sourceCard.props.classes.filter(c => c.id !== cls.id);
            if (!Array.isArray(targetCard.props.classes)) targetCard.props.classes = [];
            targetCard.props.classes.push(cls);
            // 更新 popup 視角到新卡片
            activePopupCardId = targetCardId;
            const titleEl = document.getElementById('class-popup-title');
            if (titleEl) titleEl.textContent = '班名清單 - ' + (targetCard.props.title || '未命名類別');
            toast(`已將「${cls.name}」搬移至「${targetCard.props.title}」`, 'success');
        }
        document.getElementById('class-edit-overlay').style.display = 'none';
        renderClassPopup(); renderCanvas(); scheduleSaveDraft();
        toast('班名已更新', 'success');
    });
    document.getElementById('btn-class-edit-cancel').addEventListener('click', () => document.getElementById('class-edit-overlay').style.display = 'none');
    document.getElementById('class-edit-overlay').addEventListener('click', (e) => { if (e.target.id === 'class-edit-overlay') document.getElementById('class-edit-overlay').style.display = 'none'; });
}
function renderClassEditTags() {
    const wrap = document.getElementById('class-edit-tags');
    wrap.innerHTML = '';
    TAG_CATEGORY_KEYS.forEach(cat => {
        const catWrap = document.createElement('div'); catWrap.className = 'tag-checker-cat';
        const lbl = document.createElement('div'); lbl.className = 'tag-checker-cat-label'; lbl.textContent = TAG_CATEGORY_LABELS[cat];
        catWrap.appendChild(lbl);
        const row = document.createElement('div'); row.className = 'tag-checker-row';
        const lib = projectData.tagLibrary[cat] || [];
        lib.forEach(tag => {
            const chip = document.createElement('span'); chip.className = 'tag-checker-chip';
            chip.textContent = tag.name; chip.style.background = tag.color;
            const arr = classEditState.draft.tags[cat] = classEditState.draft.tags[cat] || [];
            if (arr.includes(tag.name)) chip.classList.add('checked');
            chip.addEventListener('click', () => {
                const idx = arr.indexOf(tag.name);
                if (idx >= 0) arr.splice(idx, 1); else arr.push(tag.name);
                chip.classList.toggle('checked');
            });
            row.appendChild(chip);
        });
        if (lib.length === 0) { const e = document.createElement('div'); e.className = 'tag-checker-empty'; e.textContent = '（尚無）'; catWrap.appendChild(e); }
        catWrap.appendChild(row); wrap.appendChild(catWrap);
    });
}

// ============================================================
// 版本歷史
// ============================================================
async function snapshot(kind, note) {
    if (!projectData) return;
    try {
        await AppStorage.addVersion(projectData.id, JSON.parse(JSON.stringify(projectData)), kind, note);
    } catch (err) { console.warn('快照失敗', err); }
}
async function openVersionHistory() { await renderVersionHistory(); document.getElementById('version-overlay').style.display = 'flex'; }
function setupVersionModal() {
    document.getElementById('btn-snapshot-now').addEventListener('click', async () => {
        const note = prompt('版本備註（例如：2026 Q1 定稿版）：', '');
        if (note === null) return;
        await snapshot('manual', note || '手動快照');
        await renderVersionHistory();
        toast('已建立命名版本', 'success');
    });
    document.getElementById('btn-version-close').addEventListener('click', () => document.getElementById('version-overlay').style.display = 'none');
    document.getElementById('version-overlay').addEventListener('click', (e) => { if (e.target.id === 'version-overlay') document.getElementById('version-overlay').style.display = 'none'; });
}
async function renderVersionHistory() {
    const list = await AppStorage.listVersions(projectData.id);
    const wrap = document.getElementById('version-list');
    document.getElementById('version-count').textContent = `共 ${list.length} 筆`;
    wrap.innerHTML = '';
    if (list.length === 0) { wrap.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">尚無版本快照</div>'; return; }
    list.forEach(v => {
        const item = document.createElement('div');
        item.className = 'version-item';
        const date = new Date(v.createdAt).toLocaleString('zh-TW');
        const stats = v.snapshot ? `📚 ${(v.snapshot.components || []).filter(c => c.type === 'course-category').length} 類別 · 🔗 ${(v.snapshot.connectors || []).length} 連線` : '';
        item.innerHTML = `
            <div class="version-item-info">
                <div class="version-item-title">${escapeHtml(v.note || (v.kind === 'auto' ? '自動快照' : '命名版本'))}<span class="version-kind ${v.kind}">${v.kind}</span></div>
                <div class="version-item-meta">${date} · ${stats}</div>
            </div>
            <div class="version-item-actions">
                <button class="btn btn-small" data-act="restore">復原</button>
                <button class="btn btn-small btn-danger" data-act="del">刪除</button>
            </div>`;
        item.querySelector('[data-act="restore"]').addEventListener('click', async () => {
            if (!confirm(`確定復原至此版本？\n${v.note || (v.kind === 'auto' ? '自動快照' : '命名版本')}\n${date}`)) return;
            await snapshot('auto', '復原前自動備份');
            const cur = await AppStorage.getDiagram(projectData.id);
            const restored = JSON.parse(JSON.stringify(v.snapshot));
            restored.id = projectData.id;
            restored.updatedAt = Date.now();
            await AppStorage.saveDiagram(restored);
            setActiveDiagram(restored);
            applyBoardSettings(); renderCanvas(); updateTitleBar();
            await renderVersionHistory();
            toast('已復原至此版本', 'success');
        });
        item.querySelector('[data-act="del"]').addEventListener('click', async () => {
            if (!confirm('刪除此版本快照？')) return;
            await AppStorage.deleteVersion(v.id);
            await renderVersionHistory();
        });
        wrap.appendChild(item);
    });
}

// ============================================================
// 匯出
// ============================================================
function handleExport(kind) {
    if (kind === 'ccrd')      exportCCRD();
    else if (kind === 'png')  exportPNG();
    else if (kind === 'pdf')  exportPDF();
    else if (kind === 'html') exportHTML();
    else if (kind === 'excel')exportExcel();
    else if (kind === 'markdown') exportMarkdown();
    else if (kind === 'env')  exportEnv();
}

async function exportCCRD() {
    try {
        const zip = new JSZip();
        const data = JSON.parse(JSON.stringify(projectData));
        delete data.assets; // assets 另存
        zip.file('project.json', JSON.stringify(data, null, 2));
        const af = zip.folder('assets');
        Object.keys(assets).forEach(id => {
            const data = assets[id];
            if (!data || !data.startsWith('data:')) return;
            const m = data.match(/^data:([^;]+);base64,(.+)$/);
            if (!m) return;
            const mime = m[1]; const b64 = m[2];
            let ext = 'png';
            if (mime.includes('jpeg')) ext = 'jpg';
            else if (mime.includes('png')) ext = 'png';
            else if (mime.includes('gif')) ext = 'gif';
            else if (mime.includes('webp')) ext = 'webp';
            af.file(`${id}.${ext}`, b64, { base64: true });
        });
        zip.file('meta.json', JSON.stringify({ exportedAt: new Date().toISOString(), version: projectData.version, type: 'CourseCategoryRelationshipDiagram' }, null, 2));
        const blob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(blob, (projectData.name || 'diagram') + '.ccrd');
        toast('已匯出 .ccrd', 'success');
    } catch (err) { console.error(err); toast('匯出失敗：' + err.message, 'error'); }
}

async function exportPNG(opt) {
    try {
        if (!window.html2canvas) { toast('html2canvas 未載入', 'error'); return; }
        const target = document.getElementById('canvas');
        const prev = target.style.transform;
        target.style.transform = 'scale(1)';
        document.querySelectorAll('.resize-handle').forEach(h => h.style.display = 'none');
        document.querySelectorAll('.component.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.connector-path.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.waypoint-handle').forEach(el => el.style.display = 'none');
        let opts = { backgroundColor: projectData.board.background.baseColor || '#ffffff', scale: 2, useCORS: true };
        if (opt && opt.component) {
            const c = opt.component;
            opts.x = c.x - 20; opts.y = c.y - 20;
            opts.width = c.w + 40; opts.height = c.h + 40;
            opts.windowWidth = projectData.board.w; opts.windowHeight = projectData.board.h;
        }
        const canvas = await html2canvas(target, opts);
        target.style.transform = prev;
        document.querySelectorAll('.resize-handle').forEach(h => h.style.display = '');
        document.querySelectorAll('.waypoint-handle').forEach(el => el.style.display = '');
        if (selectedComponentId) selectComponent(selectedComponentId);
        if (selectedConnectorId) selectConnector(selectedConnectorId);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = (projectData.name || 'diagram') + '.png';
        a.click();
        toast('已匯出 PNG', 'success');
    } catch (err) {
        console.error(err); toast('匯出 PNG 失敗：' + err.message, 'error');
        document.querySelectorAll('.resize-handle').forEach(h => h.style.display = '');
        document.querySelectorAll('.waypoint-handle').forEach(el => el.style.display = '');
    }
}

async function exportPDF() {
    try {
        if (!window.html2canvas) { toast('html2canvas 未載入', 'error'); return; }
        if (!window.jspdf || !window.jspdf.jsPDF) { toast('jsPDF 未載入', 'error'); return; }
        const target = document.getElementById('canvas');
        const prev = target.style.transform;
        target.style.transform = 'scale(1)';
        document.querySelectorAll('.resize-handle').forEach(h => h.style.display = 'none');
        document.querySelectorAll('.component.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.waypoint-handle').forEach(el => el.style.display = 'none');
        const canvas = await html2canvas(target, { backgroundColor: projectData.board.background.baseColor || '#ffffff', scale: 2, useCORS: true });
        target.style.transform = prev;
        document.querySelectorAll('.resize-handle').forEach(h => h.style.display = '');
        document.querySelectorAll('.waypoint-handle').forEach(el => el.style.display = '');
        if (selectedComponentId) selectComponent(selectedComponentId);
        if (selectedConnectorId) selectConnector(selectedConnectorId);
        const { jsPDF } = window.jspdf;
        const orientation = projectData.board.w >= projectData.board.h ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit: 'pt', format: [projectData.board.w, projectData.board.h] });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, projectData.board.w, projectData.board.h);
        pdf.save((projectData.name || 'diagram') + '.pdf');
        toast('已匯出 PDF', 'success');
    } catch (err) {
        console.error(err); toast('匯出 PDF 失敗：' + err.message, 'error');
        document.querySelectorAll('.resize-handle').forEach(h => h.style.display = '');
        document.querySelectorAll('.waypoint-handle').forEach(el => el.style.display = '');
    }
}

function exportExcel() {
    try {
        if (!window.XLSX) { toast('SheetJS 未載入', 'error'); return; }
        const rows = [['班名', '主分類', '子分類', 'A.對象', 'B.等級', 'C.屬性', 'D.主題', 'E.形式']];
        // 走訪 connectors 找父子關係
        const cardById = {};
        projectData.components.forEach(c => { if (c.type === 'course-category') cardById[c.id] = c; });
        const parentOf = {};
        projectData.connectors.forEach(conn => {
            if (cardById[conn.fromComponentId] && cardById[conn.toComponentId]) {
                parentOf[conn.toComponentId] = conn.fromComponentId;
            }
        });
        Object.values(cardById).forEach(card => {
            const parent = parentOf[card.id] ? cardById[parentOf[card.id]] : null;
            const isMain = !parent;
            const mainName = isMain ? card.props.title : (parent ? parent.props.title : '');
            const subName = isMain ? '' : card.props.title;
            (card.props.classes || []).forEach(cl => {
                rows.push([
                    cl.name || '',
                    mainName || '',
                    subName || '',
                    (cl.tags && cl.tags.audience || []).join(', '),
                    (cl.tags && cl.tags.level || []).join(', '),
                    (cl.tags && cl.tags.attribute || []).join(', '),
                    (cl.tags && cl.tags.topic || []).join(', '),
                    (cl.tags && cl.tags.format || []).join(', ')
                ]);
            });
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '三層結構');
        XLSX.writeFile(wb, (projectData.name || 'diagram') + '.xlsx');
        toast('已匯出 Excel', 'success');
    } catch (err) { console.error(err); toast('匯出 Excel 失敗：' + err.message, 'error'); }
}

function exportMarkdown() {
    try {
        const cardById = {};
        projectData.components.forEach(c => { if (c.type === 'course-category') cardById[c.id] = c; });
        const childrenOf = {}; const parentOf = {};
        Object.keys(cardById).forEach(id => childrenOf[id] = []);
        projectData.connectors.forEach(conn => {
            if (cardById[conn.fromComponentId] && cardById[conn.toComponentId]) {
                childrenOf[conn.fromComponentId].push(conn.toComponentId);
                parentOf[conn.toComponentId] = conn.fromComponentId;
            }
        });
        const roots = Object.values(cardById).filter(c => !parentOf[c.id]);
        let md = `# ${projectData.name || '分類圖'}\n\n學科：${projectData.subject || '-'}\n\n更新時間：${new Date().toLocaleString('zh-TW')}\n\n---\n\n`;
        const renderCard = (card, depth) => {
            const prefix = '#'.repeat(Math.min(6, depth + 2));
            md += `${prefix} ${card.props.title || '未命名'}\n\n`;
            if (card.props.subtitle) md += `> ${card.props.subtitle}\n\n`;
            const at = card.props.assignedTags || {};
            const tagSummary = TAG_CATEGORY_KEYS.filter(cat => (at[cat] || []).length > 0).map(cat => {
                const names = (at[cat] || []).map(id => (findTagById(cat, id) || {}).name).filter(Boolean);
                return `**${TAG_CATEGORY_LABELS[cat]}**：${names.join('、')}`;
            }).join(' / ');
            if (tagSummary) md += `_卡片標籤：${tagSummary}_\n\n`;
            (card.props.classes || []).forEach(cl => {
                md += `- **${cl.name}**`;
                const tags = [];
                TAG_CATEGORY_KEYS.forEach(cat => { (cl.tags && cl.tags[cat] || []).forEach(n => tags.push(`\`${TAG_CATEGORY_LABELS[cat][0]}:${n}\``)); });
                if (tags.length) md += ' ' + tags.join(' ');
                if (cl.note) md += ` _(${cl.note})_`;
                md += '\n';
            });
            md += '\n';
            (childrenOf[card.id] || []).forEach(cid => renderCard(cardById[cid], depth + 1));
        };
        roots.forEach(r => renderCard(r, 0));
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        downloadBlob(blob, (projectData.name || 'diagram') + '.md');
        toast('已匯出 Markdown', 'success');
    } catch (err) { console.error(err); toast('匯出 Markdown 失敗：' + err.message, 'error'); }
}

async function exportHTML() {
    try {
        const safeProject = JSON.stringify(projectData).replace(/<\/script>/gi, '<\\/script>').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        const safeAssets = JSON.stringify(assets).replace(/<\/script>/gi, '<\\/script>').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        let css = '';
        try { const r = await fetch('app.css'); if (r.ok) css = await r.text(); } catch (e) {}
        const viewerScript = buildViewerScript();
        const currentViewMode = AppStorage.Settings.getViewMode();
        const html = `<!DOCTYPE html><html lang="zh-TW" data-theme="${AppStorage.Settings.getTheme()}" data-palette="${AppStorage.Settings.getPalette()}" data-view-mode="${currentViewMode}">
<head><meta charset="UTF-8"><title>${escapeHtml(projectData.name || '分類圖')}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<style>${css}
.viewer-toolbar { position: fixed; top: 12px; left: 12px; right: 12px; display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: var(--bg-card); border-radius: 999px; box-shadow: var(--shadow-md); z-index: 100; }
.viewer-toolbar h1 { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.viewer-toolbar-right { display: flex; gap: 8px; align-items: center; }
.viewer-canvas-wrapper { width: 100vw; height: 100vh; overflow: auto; padding: 60px 20px 20px; box-sizing: border-box; background: var(--bg-canvas-outer); }

/* 篩選面板（可摺疊） */
.filter-panel {
    position: fixed; top: 70px; left: 12px; bottom: 12px;
    width: 320px; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 14px; box-shadow: var(--shadow-md);
    display: flex; flex-direction: column; z-index: 90;
    transform: translateX(0); transition: transform 0.3s ease, opacity 0.3s ease;
    overflow: hidden;
}
.filter-panel.collapsed { transform: translateX(-110%); opacity: 0; pointer-events: none; }
.filter-panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-bottom: 1px solid var(--border);
    background: var(--bg-elev-1, var(--bg-sidebar));
}
.filter-panel-header h3 { font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 0; }
.filter-panel-body { flex: 1; overflow-y: auto; padding: 10px 14px; }
.filter-panel-footer {
    border-top: 1px solid var(--border); padding: 10px 14px;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    background: var(--bg-elev-1, var(--bg-sidebar)); font-size: 12px;
}
.filter-section { margin-bottom: 14px; }
.filter-section-title { font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; letter-spacing: 0.04em; }
.filter-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.filter-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 999px; cursor: pointer;
    font-size: 12px; border: 1.5px solid transparent;
    background: var(--bg-elev-2, #f1f5f9); color: var(--text-primary);
    transition: all 0.15s; user-select: none;
    line-height: 1.4;
}
.filter-chip:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
.filter-chip.active { color: #fff; box-shadow: 0 2px 6px -1px rgba(0,0,0,0.25); }
.filter-chip .chip-count { font-size: 10px; opacity: 0.75; padding-left: 4px; border-left: 1px solid currentColor; margin-left: 2px; }
.filter-stats { font-size: 12px; color: var(--text-secondary); }
.filter-stats b { color: var(--primary, #6366f1); }

.filter-toggle-btn {
    position: fixed; top: 70px; left: 12px; z-index: 95;
    width: 38px; height: 38px; border-radius: 50%;
    background: var(--primary, #6366f1); color: #fff;
    border: none; cursor: pointer; box-shadow: var(--shadow-md);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; transition: transform 0.2s, opacity 0.2s;
}
.filter-toggle-btn:hover { transform: scale(1.08); }
.filter-toggle-btn .badge {
    position: absolute; top: -4px; right: -4px;
    background: #ef4444; color: #fff; font-size: 10px; font-weight: 700;
    border-radius: 999px; padding: 1px 6px; min-width: 18px; text-align: center;
}

/* 篩選結果視覺提示 */
.component.filter-dimmed { opacity: 0.18; filter: saturate(0.4); transition: opacity 0.25s, filter 0.25s; }
.component.filter-hit { box-shadow: 0 0 0 3px rgba(99,102,241,0.45), 0 6px 18px -4px rgba(99,102,241,0.5) !important; }
.connector-path.filter-dimmed { opacity: 0.15; transition: opacity 0.25s; }
.filter-active .component:not(.filter-dimmed):not(.filter-hit) { opacity: 0.95; }

/* 班名 popup 篩選提示 */
.cls-row.cls-filtered { display: none; }
.cls-row-tag {
    display: inline-block; color: #fff; border-radius: 999px;
    padding: 2px 8px; font-size: 11px; margin: 2px 2px 0 0;
}
.cls-row-tag.cls-tag-hit { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--primary, #6366f1); }
</style></head>
<body><div class="viewer-toolbar"><h1>${escapeHtml(projectData.name || '分類圖')} <span style="font-size:11px;color:var(--text-muted);font-weight:400;">學科：${escapeHtml(projectData.subject || '')}</span></h1>
<div class="viewer-toolbar-right">
<button class="btn btn-small" id="vw-view-mode" title="切換顯示模式：完整 ↔ 骨架"><span id="vw-view-mode-icon">${currentViewMode === 'skeleton' ? '👁️' : '🦴'}</span> <span id="vw-view-mode-label">${currentViewMode === 'skeleton' ? '切回完整' : '切到骨架'}</span></button>
<span style="font-size:12px;color:var(--text-muted);" id="zoom-info">縮放 100%</span>
<button class="btn btn-small" id="z-out">−</button>
<button class="btn btn-small" id="z-fit">符合視窗</button>
<button class="btn btn-small" id="z-100">100%</button>
<button class="btn btn-small" id="z-in">+</button>
</div></div>
<button class="filter-toggle-btn" id="filter-toggle-btn" title="標籤篩選 (F)">🔍<span class="badge" id="filter-count-badge" style="display:none;">0</span></button>
<aside class="filter-panel collapsed" id="filter-panel">
    <div class="filter-panel-header">
        <h3>🔍 標籤篩選</h3>
        <div style="display:flex;gap:6px;">
            <button class="btn btn-small" id="filter-clear" title="清除全部篩選">清除</button>
            <button class="btn btn-small" id="filter-close" title="關閉面板">✕</button>
        </div>
    </div>
    <div class="filter-panel-body" id="filter-body"></div>
    <div class="filter-panel-footer">
        <span class="filter-stats" id="filter-stats">顯示全部</span>
        <span style="font-size:11px;color:var(--text-muted);">同類別=任一即可<br>跨類別=須全部符合</span>
    </div>
</aside>
<div class="viewer-canvas-wrapper" id="vw-outer"><div class="canvas-wrapper"><div id="canvas" class="canvas">
<svg id="connector-layer" class="connector-layer" xmlns="http://www.w3.org/2000/svg"><defs id="connector-defs"></defs><g id="connector-group"></g></svg>
</div></div></div>
<script>window.EMBEDDED_PROJECT=${safeProject};window.EMBEDDED_ASSETS=${safeAssets};window.EMBEDDED_VIEW_MODE=${JSON.stringify(currentViewMode)};${viewerScript}</script>
</body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, (projectData.name || 'diagram') + '.html');
        toast('已匯出 HTML（含標籤篩選器）', 'success');
    } catch (err) { console.error(err); toast('匯出 HTML 失敗：' + err.message, 'error'); }
}

function buildViewerScript() {
    return `(function(){
    const projectData = window.EMBEDDED_PROJECT;
    const assets = window.EMBEDDED_ASSETS;
    let viewportZoom = 1;
    let currentViewMode = (window.EMBEDDED_VIEW_MODE === 'skeleton') ? 'skeleton' : 'full';
    const TAG_CATEGORY_KEYS = ${JSON.stringify(TAG_CATEGORY_KEYS)};
    const TAG_CATEGORY_LABELS = ${JSON.stringify(TAG_CATEGORY_LABELS)};

    // 篩選狀態：每個分類存放被選中的「標籤名稱」陣列
    const activeFilters = { audience: [], level: [], attribute: [], topic: [], format: [] };
    let filteredView = null; // { visibleCardIds:Set, classMatches:Object<id, Class[]>, totalClasses, matchedClasses }
    function findTagById(cat, id){ if(!projectData.tagLibrary[cat]) return null; return projectData.tagLibrary[cat].find(t=>t.id===id); }
    function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function applyBoard(){
        const c = document.getElementById('canvas');
        c.style.width = projectData.board.w + 'px'; c.style.height = projectData.board.h + 'px';
        c.dataset.bg = projectData.board.background.type;
        c.style.backgroundColor = projectData.board.background.baseColor;
        c.style.setProperty('--grid-color', projectData.board.background.gridColor);
        const svg = document.getElementById('connector-layer');
        svg.setAttribute('viewBox', '0 0 ' + projectData.board.w + ' ' + projectData.board.h);
        applyZoom();
    }
    function applyZoom(){
        document.getElementById('canvas').style.transform = 'scale(' + viewportZoom + ')';
        const wrap = document.querySelector('.canvas-wrapper');
        if (wrap) {
            wrap.style.width = (projectData.board.w * viewportZoom + 80) + 'px';
            wrap.style.height = (projectData.board.h * viewportZoom + 80) + 'px';
            wrap.style.minWidth = wrap.style.width; wrap.style.minHeight = wrap.style.height;
        }
        document.getElementById('zoom-info').textContent = '縮放 ' + Math.round(viewportZoom * 100) + '%';
    }
    function buildComp(comp){
        const div = document.createElement('div');
        div.className = 'component component-' + comp.type;
        div.dataset.compId = comp.id;
        if (comp.type === 'course-category') div.classList.add('component-card');
        div.style.left = comp.x + 'px'; div.style.top = comp.y + 'px';
        div.style.width = comp.w + 'px'; div.style.height = comp.h + 'px';
        div.style.zIndex = (comp.zIndex||0) + 5;
        div.style.cursor = 'default';
        const s = comp.style || {};
        if (comp.type === 'course-category') {
            div.dataset.tagPosition = s.tagPosition || 'bottom';
            div.style.background = s.backgroundColor; div.style.color = s.color;
            div.style.borderColor = s.borderColor;
            div.style.borderWidth = (s.borderWidth || 2) + 'px';
            div.style.borderStyle = s.borderStyle || 'solid';
            div.style.borderRadius = (s.borderRadius || 14) + 'px';
            div.style.boxShadow = s.boxShadow || '';
            div.style.fontFamily = s.fontFamily || 'inherit';
            div.style.textAlign = s.textAlign || 'left';
            const body = document.createElement('div'); body.className = 'card-body'; body.style.padding = (s.padding || 14) + 'px';
            const title = document.createElement('div'); title.className = 'card-title'; title.style.fontSize = (s.titleFontSize || 22) + 'px'; title.textContent = comp.props.title || '';
            const sub = document.createElement('div'); sub.className = 'card-subtitle'; sub.style.fontSize = (s.subtitleFontSize || 14) + 'px'; sub.textContent = comp.props.subtitle || '';
            if (!comp.props.subtitle) sub.style.display = 'none';
            body.appendChild(title); body.appendChild(sub);
            const cls = (comp.props.classes || []);
            const isSkeleton = currentViewMode === 'skeleton';
            if (cls.length && !isSkeleton) {
                const cc = document.createElement('div'); cc.className = 'card-classes-count';
                cc.innerHTML = '<span>📋 班名：</span><span class="count-badge">' + cls.length + '</span>';
                body.appendChild(cc);
            }
            div.appendChild(body);
            if (!isSkeleton) {
                const tagsW = document.createElement('div'); tagsW.className = 'card-tags';
                let total = 0;
                TAG_CATEGORY_KEYS.forEach(cat => { ((comp.props.assignedTags && comp.props.assignedTags[cat]) || []).forEach(tid => { const t = findTagById(cat, tid); if (!t) return; const chip = document.createElement('span'); chip.className = 'card-tag'; chip.style.background = t.color; chip.textContent = t.name; tagsW.appendChild(chip); total++; }); });
                if (total) div.appendChild(tagsW);
            }
            // dblclick popup：骨架模式不開啟（純展示）
            if (cls.length && !isSkeleton) {
                div.addEventListener('dblclick', () => openClassPopup(comp));
            }
        } else if (comp.type === 'text') {
            div.textContent = comp.props.text || '';
            div.style.fontFamily = s.fontFamily || 'inherit'; div.style.fontSize = (s.fontSize || 20) + 'px';
            div.style.color = s.color || '#0f172a';
            div.style.background = composeBg(s.backgroundColor, s.backgroundOpacity);
            div.style.fontWeight = s.fontWeight || 400; div.style.textAlign = s.textAlign || 'left';
        } else if (comp.type === 'image') {
            const img = document.createElement('img');
            if (comp.props.assetId && assets[comp.props.assetId]) img.src = assets[comp.props.assetId];
            div.appendChild(img);
        } else if (comp.type === 'link') {
            const a = document.createElement('a'); a.href = comp.props.url || '#'; a.target = '_blank';
            a.textContent = comp.props.text || '連結'; a.style.color = s.color || '#2563eb'; a.style.fontSize = (s.fontSize || 16) + 'px';
            div.appendChild(a);
        } else if (comp.type === 'button') {
            div.style.background = s.backgroundColor || '#3b82f6'; div.style.color = s.color || '#fff';
            div.style.fontSize = (s.fontSize || 16) + 'px'; div.style.fontWeight = s.fontWeight || 600;
            div.style.borderRadius = (s.borderRadius != null ? s.borderRadius : 999) + 'px';
            div.textContent = comp.props.text || '按鈕';
        } else if (comp.type === 'tag') {
            div.style.background = s.backgroundColor || '#3b82f6'; div.style.color = s.color || '#fff';
            div.style.fontSize = (s.fontSize || 13) + 'px'; div.textContent = comp.props.name || '標籤';
        }
        return div;
    }
    function getComp(id){ return projectData.components.find(c=>c.id===id); }
    function composeBg(bg, op){
        if (!bg || bg === 'transparent') return '';
        var v = (op == null) ? 100 : Number(op);
        if (isNaN(v)) v = 100;
        v = Math.max(0, Math.min(100, v));
        if (v === 0) return '';
        var m = String(bg).match(/^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i);
        if (!m) return bg;
        var r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
        if (v === 100) return 'rgb(' + r + ',' + g + ',' + b + ')';
        return 'rgba(' + r + ',' + g + ',' + b + ',' + (v/100).toFixed(2) + ')';
    }
    function clipToRect(cx, cy, tx, ty, comp){
        const dx = tx - cx, dy = ty - cy;
        if (dx === 0 && dy === 0) return {x:cx,y:cy};
        const halfW = comp.w/2, halfH = comp.h/2;
        const tX = dx === 0 ? Infinity : Math.abs(halfW/dx);
        const tY = dy === 0 ? Infinity : Math.abs(halfH/dy);
        const t = Math.min(tX, tY);
        return { x: cx + dx * t, y: cy + dy * t };
    }
    function ensureMarker(color){
        const defs = document.getElementById('connector-defs');
        const id = 'arrow-' + color.replace(/[^a-zA-Z0-9]/g, '');
        if (document.getElementById(id)) return id;
        const m = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        m.setAttribute('id', id); m.setAttribute('viewBox', '0 0 10 10');
        m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
        m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7');
        m.setAttribute('orient', 'auto-start-reverse');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); p.setAttribute('fill', color);
        m.appendChild(p); defs.appendChild(m);
        return id;
    }
    function renderConns(){
        const group = document.getElementById('connector-group');
        const defs = document.getElementById('connector-defs');
        group.innerHTML = ''; defs.innerHTML = '';
        projectData.connectors.forEach(conn => {
            const fc = getComp(conn.fromComponentId), tc = getComp(conn.toComponentId);
            if (!fc || !tc) return;
            const fcX = fc.x + fc.w/2, fcY = fc.y + fc.h/2;
            const tcX = tc.x + tc.w/2, tcY = tc.y + tc.h/2;
            const wp = conn.waypoints || [];
            const first = wp[0] || {x:tcX,y:tcY};
            const last = wp[wp.length-1] || {x:fcX,y:fcY};
            const start = clipToRect(fcX, fcY, first.x, first.y, fc);
            const end = clipToRect(tcX, tcY, last.x, last.y, tc);
            const points = [start, ...wp, end];
            let d = '';
            if (conn.routeType === 'orthogonal') {
                d = 'M ' + points[0].x + ' ' + points[0].y;
                for (let i = 1; i < points.length; i++) { const a = points[i-1], b = points[i]; const midX = (a.x + b.x) / 2; d += ' L ' + midX + ' ' + a.y + ' L ' + midX + ' ' + b.y + ' L ' + b.x + ' ' + b.y; }
            } else if (conn.routeType === 'curve') {
                d = 'M ' + points[0].x + ' ' + points[0].y;
                for (let i = 1; i < points.length; i++) { const a = points[i-1], b = points[i]; const off = Math.max(40, Math.abs(b.x - a.x) * 0.5); d += ' C ' + (a.x + off) + ' ' + a.y + ', ' + (b.x - off) + ' ' + b.y + ', ' + b.x + ' ' + b.y; }
            } else {
                d = 'M ' + points[0].x + ' ' + points[0].y;
                for (let i = 1; i < points.length; i++) d += ' L ' + points[i].x + ' ' + points[i].y;
            }
            const color = (conn.style && conn.style.color) || '#475569';
            const width = (conn.style && conn.style.width) || 2;
            const dash = (conn.style && conn.style.dash === 'dashed') ? '8 6' : '';
            const mid = ensureMarker(color);
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d); path.setAttribute('stroke', color); path.setAttribute('stroke-width', width);
            path.setAttribute('fill', 'none');
            if (dash) path.setAttribute('stroke-dasharray', dash);
            if (conn.arrow === 'forward' || conn.arrow === 'both') path.setAttribute('marker-end', 'url(#' + mid + ')');
            if (conn.arrow === 'both') path.setAttribute('marker-start', 'url(#' + mid + ')');
            group.appendChild(path);
            if (conn.label) {
                const idxM = Math.floor(points.length / 2);
                let mp = points.length % 2 === 1 ? points[idxM] : { x: (points[idxM - 1].x + points[idxM].x) / 2, y: (points[idxM - 1].y + points[idxM].y) / 2 };
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.setAttribute('transform', 'translate(' + mp.x + ', ' + mp.y + ')');
                const w = Math.max(40, conn.label.length * 14 + 12);
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('class', 'connector-label-bg');
                rect.setAttribute('x', -w/2); rect.setAttribute('y', -12);
                rect.setAttribute('width', w); rect.setAttribute('height', 24); rect.setAttribute('rx', 6);
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('class', 'connector-label');
                text.setAttribute('text-anchor', 'middle'); text.setAttribute('dy', '0.35em');
                text.textContent = conn.label;
                g.appendChild(rect); g.appendChild(text);
                group.appendChild(g);
            }
        });
    }
    function renderAll(){
        const canvas = document.getElementById('canvas');
        Array.from(canvas.children).forEach(ch => { if (ch.id !== 'connector-layer') canvas.removeChild(ch); });
        const sorted = [...projectData.components].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
        sorted.forEach(comp => canvas.appendChild(buildComp(comp)));
        renderConns();
        applyFilter();
    }

    // ========== 標籤篩選 ==========
    function hasAnyFilter(){
        return TAG_CATEGORY_KEYS.some(cat => (activeFilters[cat] || []).length > 0);
    }
    function classMatches(cls){
        for (let i = 0; i < TAG_CATEGORY_KEYS.length; i++) {
            const cat = TAG_CATEGORY_KEYS[i];
            const sel = activeFilters[cat] || [];
            if (sel.length === 0) continue; // 此類別無篩選
            const ct = (cls.tags && cls.tags[cat]) || [];
            const hit = sel.some(name => ct.indexOf(name) >= 0);
            if (!hit) return false; // 跨類別 AND
        }
        return true;
    }
    function cardLevelMatches(comp){
        // 卡片自身的 assignedTags 是「id 陣列」，要先轉成名字
        for (let i = 0; i < TAG_CATEGORY_KEYS.length; i++) {
            const cat = TAG_CATEGORY_KEYS[i];
            const sel = activeFilters[cat] || [];
            if (sel.length === 0) continue;
            const tagIds = (comp.props && comp.props.assignedTags && comp.props.assignedTags[cat]) || [];
            const tagNames = tagIds.map(id => { const t = findTagById(cat, id); return t ? t.name : null; }).filter(Boolean);
            const hit = sel.some(name => tagNames.indexOf(name) >= 0);
            if (!hit) return false;
        }
        return true;
    }
    function computeFilteredView(){
        if (!hasAnyFilter()) { filteredView = null; return; }
        const visibleCardIds = new Set();
        const classMatchMap = {};
        let totalClasses = 0, matchedClasses = 0;
        projectData.components.forEach(c => {
            if (c.type !== 'course-category') return;
            const cls = c.props.classes || [];
            totalClasses += cls.length;
            const hits = cls.filter(classMatches);
            classMatchMap[c.id] = hits;
            matchedClasses += hits.length;
            if (hits.length > 0) visibleCardIds.add(c.id);
            else if (cls.length === 0 && cardLevelMatches(c)) visibleCardIds.add(c.id);
            else if (cls.length === 0) {
                // 無班名的卡片：保留結構，看祖先傳播
            } else if (cardLevelMatches(c)) {
                visibleCardIds.add(c.id);
            }
        });
        // 向上傳播：若子卡符合，把祖先也標為可見（保留階層）
        const parentOf = {};
        projectData.connectors.forEach(c => { parentOf[c.toComponentId] = c.fromComponentId; });
        const expanded = new Set(visibleCardIds);
        visibleCardIds.forEach(id => {
            let cur = parentOf[id];
            while (cur && !expanded.has(cur)) { expanded.add(cur); cur = parentOf[cur]; }
        });
        filteredView = { visibleCardIds: expanded, classMatchMap, totalClasses, matchedClasses };
    }
    function applyFilter(){
        computeFilteredView();
        const container = document.getElementById('canvas');
        if (!filteredView) {
            document.body.classList.remove('filter-active');
            container.querySelectorAll('.component').forEach(el => el.classList.remove('filter-dimmed', 'filter-hit'));
            document.querySelectorAll('.connector-path').forEach(el => el.classList.remove('filter-dimmed'));
            const stats = document.getElementById('filter-stats');
            if (stats) stats.innerHTML = '顯示全部';
            updateFilterBadge(0);
            // 同步更新所有卡片的「班名統計」回原值
            updateCardClassCounts(null);
            return;
        }
        document.body.classList.add('filter-active');
        const visible = filteredView.visibleCardIds;
        // 課程類別卡片
        container.querySelectorAll('.component').forEach(el => {
            const id = el.dataset.compId;
            if (!id) return;
            const comp = getComp(id);
            if (!comp) return;
            if (comp.type !== 'course-category') {
                // 非類別元件保持顯示
                el.classList.remove('filter-dimmed', 'filter-hit');
                return;
            }
            if (visible.has(id)) {
                const hits = (filteredView.classMatchMap[id] || []).length;
                el.classList.remove('filter-dimmed');
                if (hits > 0 || cardLevelMatches(comp)) el.classList.add('filter-hit');
                else el.classList.remove('filter-hit');
            } else {
                el.classList.add('filter-dimmed');
                el.classList.remove('filter-hit');
            }
        });
        // 連線：兩端都是可見類別卡才顯示
        document.querySelectorAll('.connector-path').forEach(el => {
            // 我們在 renderConns 內未綁定 connector id；改用 group children 索引
            // 簡化：以連線兩端點 id 重新判斷
        });
        // 重新走訪 connectors 套用 dim
        const group = document.getElementById('connector-group');
        const paths = group.querySelectorAll('path');
        let pi = 0;
        projectData.connectors.forEach(conn => {
            const path = paths[pi++];
            if (!path) return;
            const from = conn.fromComponentId, to = conn.toComponentId;
            const fComp = getComp(from), tComp = getComp(to);
            const fOk = !fComp || fComp.type !== 'course-category' || visible.has(from);
            const tOk = !tComp || tComp.type !== 'course-category' || visible.has(to);
            if (fOk && tOk) path.classList.remove('filter-dimmed');
            else path.classList.add('filter-dimmed');
        });
        // 統計
        const stats = document.getElementById('filter-stats');
        if (stats) stats.innerHTML = '顯示班名 <b>' + filteredView.matchedClasses + '</b> / ' + filteredView.totalClasses + '，類別卡片 <b>' + visible.size + '</b>';
        const totalActive = TAG_CATEGORY_KEYS.reduce((s, cat) => s + (activeFilters[cat] || []).length, 0);
        updateFilterBadge(totalActive);
        // 更新卡片上的班名數字（顯示為 命中/總共）
        updateCardClassCounts(filteredView);
    }
    function updateCardClassCounts(view){
        document.querySelectorAll('.component-course-category').forEach(el => {
            const id = el.dataset.compId;
            const cc = el.querySelector('.card-classes-count');
            if (!cc) return;
            const comp = getComp(id);
            if (!comp) return;
            const total = (comp.props.classes || []).length;
            if (!view) {
                cc.innerHTML = '<span>📋 班名：</span><span class="count-badge">' + total + '</span>';
            } else {
                const hits = (view.classMatchMap[id] || []).length;
                cc.innerHTML = '<span>📋 班名：</span><span class="count-badge">' + hits + ' / ' + total + '</span>';
            }
        });
    }
    function updateFilterBadge(n){
        const b = document.getElementById('filter-count-badge');
        if (!b) return;
        if (n > 0) { b.textContent = String(n); b.style.display = 'inline-block'; }
        else b.style.display = 'none';
    }

    // ========== 篩選面板 UI ==========
    function buildFilterPanel(){
        const body = document.getElementById('filter-body');
        if (!body) return;
        body.innerHTML = '';
        // 計算每個標籤在班名中出現的次數
        const usage = {};
        TAG_CATEGORY_KEYS.forEach(cat => {
            usage[cat] = {};
            (projectData.tagLibrary[cat] || []).forEach(t => { usage[cat][t.name] = 0; });
            projectData.components.forEach(c => {
                if (c.type !== 'course-category') return;
                (c.props.classes || []).forEach(cl => {
                    (cl.tags && cl.tags[cat] || []).forEach(name => {
                        if (usage[cat][name] != null) usage[cat][name]++;
                        else usage[cat][name] = 1;
                    });
                });
            });
        });
        TAG_CATEGORY_KEYS.forEach(cat => {
            const tags = (projectData.tagLibrary[cat] || []).filter(t => (usage[cat][t.name] || 0) > 0);
            if (tags.length === 0) return;
            const sec = document.createElement('div');
            sec.className = 'filter-section';
            const title = document.createElement('div');
            title.className = 'filter-section-title';
            title.textContent = TAG_CATEGORY_LABELS[cat] + ' (' + tags.length + ')';
            sec.appendChild(title);
            const chips = document.createElement('div');
            chips.className = 'filter-chips';
            tags.forEach(t => {
                const chip = document.createElement('span');
                chip.className = 'filter-chip';
                chip.dataset.cat = cat;
                chip.dataset.name = t.name;
                const isActive = (activeFilters[cat] || []).indexOf(t.name) >= 0;
                if (isActive) {
                    chip.classList.add('active');
                    chip.style.background = t.color;
                    chip.style.borderColor = t.color;
                } else {
                    chip.style.borderColor = t.color;
                    chip.style.color = t.color;
                }
                chip.innerHTML = escapeHtml(t.name) + '<span class="chip-count">' + (usage[cat][t.name] || 0) + '</span>';
                chip.addEventListener('click', () => {
                    const arr = activeFilters[cat];
                    const idx = arr.indexOf(t.name);
                    if (idx >= 0) arr.splice(idx, 1); else arr.push(t.name);
                    buildFilterPanel();
                    applyFilter();
                });
                chips.appendChild(chip);
            });
            sec.appendChild(chips);
            body.appendChild(sec);
        });
        if (!body.children.length) {
            body.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center;">尚無班名標籤可篩選</div>';
        }
    }

    // ========== 班名 popup（套用篩選） ==========
    function openClassPopup(comp){
        const cls = comp.props.classes || [];
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:200;';
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        const m = document.createElement('div');
        m.style.cssText = 'background:var(--bg-card);color:var(--text-primary);padding:20px;border-radius:14px;max-width:80vw;max-height:80vh;overflow:auto;min-width:480px;';
        const filterOn = hasAnyFilter();
        const matchedSet = new Set((filterOn && filteredView ? (filteredView.classMatchMap[comp.id] || []) : cls).map(c => c.id || c.name));
        const visibleCount = filterOn ? matchedSet.size : cls.length;
        let h = '<h2 style="margin-bottom:6px;">' + escapeHtml(comp.props.title || '') + '</h2>';
        h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">';
        if (filterOn) h += '篩選結果：<b>' + visibleCount + '</b> / ' + cls.length + ' 個班名 · <a href="#" id="cls-show-all" style="color:var(--primary,#6366f1);">顯示全部</a>';
        else h += '共 ' + cls.length + ' 個班名';
        h += '</div>';
        cls.forEach(cl => {
            const match = !filterOn || matchedSet.has(cl.id || cl.name);
            h += '<div class="cls-row ' + (match ? '' : 'cls-filtered') + '" style="padding:8px;border-bottom:1px solid var(--border);">';
            h += '<div style="font-weight:600;">' + escapeHtml(cl.name || '') + '</div>';
            const tagsEl = [];
            TAG_CATEGORY_KEYS.forEach(cat => {
                (cl.tags && cl.tags[cat] || []).forEach(name => {
                    const t = (projectData.tagLibrary[cat] || []).find(x => x.name === name);
                    const isHit = (activeFilters[cat] || []).indexOf(name) >= 0;
                    tagsEl.push('<span class="cls-row-tag ' + (isHit ? 'cls-tag-hit' : '') + '" style="background:' + (t ? t.color : '#94a3b8') + ';">' + escapeHtml(name) + '</span>');
                });
            });
            if (tagsEl.length) h += '<div style="margin-top:4px;">' + tagsEl.join('') + '</div>';
            h += '</div>';
        });
        h += '<div style="text-align:right;margin-top:12px;"><button class="btn" id="cls-close">關閉</button></div>';
        m.innerHTML = h;
        overlay.appendChild(m);
        document.body.appendChild(overlay);
        m.querySelector('#cls-close').addEventListener('click', () => overlay.remove());
        const showAll = m.querySelector('#cls-show-all');
        if (showAll) showAll.addEventListener('click', (e) => {
            e.preventDefault();
            m.querySelectorAll('.cls-row.cls-filtered').forEach(el => el.classList.remove('cls-filtered'));
            showAll.style.display = 'none';
        });
    }

    // 篩選按鈕／面板事件
    function setupFilterUI(){
        buildFilterPanel();
        const btn = document.getElementById('filter-toggle-btn');
        const panel = document.getElementById('filter-panel');
        const syncBtn = () => {
            const open = !panel.classList.contains('collapsed');
            btn.style.opacity = open ? '0' : '1';
            btn.style.pointerEvents = open ? 'none' : 'auto';
        };
        btn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            syncBtn();
        });
        document.getElementById('filter-close').addEventListener('click', () => {
            panel.classList.add('collapsed');
            syncBtn();
        });
        document.getElementById('filter-clear').addEventListener('click', () => {
            TAG_CATEGORY_KEYS.forEach(cat => activeFilters[cat] = []);
            buildFilterPanel();
            applyFilter();
        });
        // F 鍵切換
        document.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            if (e.key === 'f' || e.key === 'F') { e.preventDefault(); btn.click(); }
            if (e.key === 'Escape' && !panel.classList.contains('collapsed')) { panel.classList.add('collapsed'); syncBtn(); }
        });
    }
    document.getElementById('z-in').addEventListener('click', () => { viewportZoom = Math.min(4, viewportZoom * 1.2); applyZoom(); });
    document.getElementById('z-out').addEventListener('click', () => { viewportZoom = Math.max(0.1, viewportZoom / 1.2); applyZoom(); });
    document.getElementById('z-100').addEventListener('click', () => { viewportZoom = 1; applyZoom(); });
    document.getElementById('z-fit').addEventListener('click', () => {
        const o = document.getElementById('vw-outer');
        viewportZoom = Math.min((o.clientWidth - 60) / projectData.board.w, (o.clientHeight - 100) / projectData.board.h);
        applyZoom();
    });
    document.getElementById('vw-outer').addEventListener('wheel', (e) => {
        if (e.ctrlKey) { e.preventDefault(); viewportZoom = Math.max(0.1, Math.min(4, viewportZoom * (e.deltaY < 0 ? 1.1 : 1/1.1))); applyZoom(); }
    }, { passive: false });
    // 顯示模式切換（完整 ↔ 骨架）— 採「動作式」按鈕標籤
    function applyViewMode(){
        document.documentElement.dataset.viewMode = currentViewMode;
        const ic = document.getElementById('vw-view-mode-icon');
        const lb = document.getElementById('vw-view-mode-label');
        if (ic) ic.textContent = currentViewMode === 'skeleton' ? '👁️' : '🦴';
        if (lb) lb.textContent = currentViewMode === 'skeleton' ? '切回完整' : '切到骨架';
        renderAll();
    }
    document.getElementById('vw-view-mode').addEventListener('click', () => {
        currentViewMode = (currentViewMode === 'skeleton') ? 'full' : 'skeleton';
        applyViewMode();
    });
    applyBoard(); renderAll();
    setupFilterUI();
    applyViewMode();
    setTimeout(() => { document.getElementById('z-fit').click(); }, 50);
})();`;
}

async function exportEnv() {
    try {
        const diagrams = await AppStorage.listDiagrams();
        const apiKeys = await AppStorage.listApiKeys();
        const env = {
            type: 'CourseCategoryRelationshipDiagramEnv',
            exportedAt: new Date().toISOString(),
            version: '3.0',
            diagrams,
            apiKeys,
            settings: {
                theme: AppStorage.Settings.getTheme(),
                palette: AppStorage.Settings.getPalette(),
                layout: AppStorage.Settings.getLayout(),
                aiModel: AppStorage.Settings.getAIModel(),
                lastDiagramId: AppStorage.Settings.getLastDiagramId()
            }
        };
        const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json;charset=utf-8' });
        downloadBlob(blob, `course-category-env-${new Date().toISOString().slice(0, 10)}.json`);
        toast('已匯出完整環境（含加密 API Keys）', 'success');
    } catch (err) { console.error(err); toast('匯出失敗：' + err.message, 'error'); }
}

// ============================================================
// 匯入
// ============================================================
async function handleImportFile(e) {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = '';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    try {
        if (ext === 'json') {
            const text = await file.text();
            const data = JSON.parse(text);
            if (data && data.type === 'CourseCategoryRelationshipDiagramEnv') {
                await importEnv(data);
            } else if (data && data.id && data.components) {
                await importDiagramJson(data);
            } else {
                toast('無法辨識的 JSON 結構', 'error');
            }
        } else {
            // 假設為 .ccrd zip
            const zip = await JSZip.loadAsync(file);
            const projectFile = zip.file('project.json');
            if (!projectFile) throw new Error('找不到 project.json');
            const proj = JSON.parse(await projectFile.async('string'));
            const newAssets = {};
            const af = zip.folder('assets');
            if (af) {
                const promises = [];
                af.forEach((rel, f) => {
                    if (f.dir) return;
                    promises.push((async () => {
                        const id = rel.replace(/\.[^/.]+$/, '');
                        const b64 = await f.async('base64');
                        let mime = 'image/png';
                        if (rel.endsWith('.jpg') || rel.endsWith('.jpeg')) mime = 'image/jpeg';
                        else if (rel.endsWith('.gif')) mime = 'image/gif';
                        else if (rel.endsWith('.webp')) mime = 'image/webp';
                        newAssets[id] = `data:${mime};base64,${b64}`;
                    })());
                });
                await Promise.all(promises);
            }
            // 升級 v1 → v3 結構（若需要）
            const upgraded = (proj.version || '').startsWith('3') ? proj : AppStorage.upgradeProjectToV3(proj, newAssets);
            if (!upgraded.id) upgraded.id = AppStorage.generateUUID();
            upgraded.assets = newAssets;
            await importDiagramJson(upgraded);
        }
    } catch (err) {
        console.error(err); toast('匯入失敗：' + err.message, 'error');
    }
}

async function importDiagramJson(data) {
    // 確保結構
    if (!data.id) data.id = AppStorage.generateUUID();
    if (!data.assets) data.assets = {};
    const existing = await AppStorage.getDiagram(data.id);
    if (existing) {
        importPendingPayload = { kind: 'diagram', data };
        document.getElementById('import-conflict-desc').textContent = `本地已有相同 ID 的分類圖「${existing.name}」。要如何處理？`;
        document.getElementById('import-conflict-overlay').style.display = 'flex';
    } else {
        await finishImportDiagram(data, false);
    }
}

async function finishImportDiagram(data, asNew) {
    if (asNew) data.id = AppStorage.generateUUID();
    await AppStorage.saveDiagram(data);
    await switchToDiagram(data.id);
    toast('已匯入並切換', 'success');
}

function setupImportConflictModal() {
    document.getElementById('btn-conflict-overwrite').addEventListener('click', async () => {
        document.getElementById('import-conflict-overlay').style.display = 'none';
        if (importPendingPayload) await finishImportDiagram(importPendingPayload.data, false);
        importPendingPayload = null;
    });
    document.getElementById('btn-conflict-asnew').addEventListener('click', async () => {
        document.getElementById('import-conflict-overlay').style.display = 'none';
        if (importPendingPayload) await finishImportDiagram(importPendingPayload.data, true);
        importPendingPayload = null;
    });
    document.getElementById('btn-conflict-cancel').addEventListener('click', () => {
        document.getElementById('import-conflict-overlay').style.display = 'none';
        importPendingPayload = null;
    });
}

async function importEnv(env) {
    if (!confirm(`即將匯入完整環境（含 ${env.diagrams.length} 張分類圖、${env.apiKeys.length} 把 API Key）。\n會疊加到目前資料庫，相同 ID 視為衝突逐一詢問。是否繼續？`)) return;
    let imported = 0, skipped = 0;
    for (const d of env.diagrams) {
        const existing = await AppStorage.getDiagram(d.id);
        if (existing) {
            const action = prompt(`分類圖「${d.name}」已存在。輸入：\n  o = 覆蓋\n  n = 另存新檔\n  s = 略過`, 's');
            if (action === 'o') { await AppStorage.saveDiagram(d); imported++; }
            else if (action === 'n') { d.id = AppStorage.generateUUID(); await AppStorage.saveDiagram(d); imported++; }
            else skipped++;
        } else { await AppStorage.saveDiagram(d); imported++; }
    }
    if (env.apiKeys && env.apiKeys.length) {
        if (confirm('要一併匯入加密的 API Keys 嗎？匯入後使用時需要原本的主密碼解密。')) {
            for (const k of env.apiKeys) {
                await AppStorage.setApiKey(k.provider, { ciphertext: k.ciphertext, iv: k.iv, salt: k.salt });
            }
        }
    }
    if (env.settings) {
        if (env.settings.theme) applyTheme(env.settings.theme);
        if (env.settings.palette) applyPalette(env.settings.palette);
        if (env.settings.layout) AppStorage.Settings.setLayout(env.settings.layout);
        if (env.settings.aiModel) AppStorage.Settings.setAIModel(env.settings.aiModel);
    }
    toast(`環境匯入完成：${imported} 張匯入 / ${skipped} 張略過`, 'success');
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// ============================================================
// 工具
// ============================================================
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
