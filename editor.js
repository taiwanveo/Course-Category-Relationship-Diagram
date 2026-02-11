// ============================================
// 互動教學簡報製作器 - Editor
// ============================================

// 全域狀態
let projectData = null;
let currentChapterId = null;
let currentSlideId = null;
let selectedComponentId = null;
let componentIdCounter = 1;
let assets = {}; // 存放圖片資料（base64 或 blob）
const DRAFT_STORAGE_KEY = 'interactive-presentation-editor-draft';
const DRAFT_ASSETS_KEY = 'interactive-presentation-editor-draft-assets';
let saveDraftTimeout = null;
/** localStorage 約 5–10MB/網域，無法調大；改用 IndexedDB 存草稿可達數百 MB，圖片較不易消失。 */

const DRAFT_DB_NAME = 'InteractivePresentationDraft';
const DRAFT_DB_VERSION = 1;
const DRAFT_STORE_NAME = 'draft';
/** 編輯器「播放」預覽時，專案與圖片暫存於 IndexedDB（主）＋ localStorage（輔，容量不足可略過），供 player.html?preview=1 讀取 */
const PREVIEW_DB_NAME = 'InteractivePresentationPreview';
const PREVIEW_DB_VERSION = 1;
const PREVIEW_STORE_NAME = 'preview';
const PREVIEW_PROJECT_KEY = 'it-slide-preview-project';
const PREVIEW_ASSETS_KEY = 'it-slide-preview-assets';

// 初始化（改為非同步載入草稿：先試 IndexedDB，再試 localStorage）
document.addEventListener('DOMContentLoaded', () => {
    loadDraft().then(loaded => {
        if (!loaded) initProject();
        setupEventListeners();
        renderCanvas();
        renderThumbnails();
        scheduleSaveDraft();
    });
});

// ============================================
// 專案資料初始化
// ============================================

function initProject() {
    projectData = {
        version: "1.0",
        projectId: generateUUID(),
        title: "新專案",
        theme: {
            palette: {
                bg: "#F9F7F5",
                text: "#000000",
                primary: "#4aa3ff",
                success: "#34c759",
                warning: "#ffcc00",
                danger: "#ff3b30"
            },
            fonts: {
                heading: "'Noto Sans TC', 'Microsoft JhengHei', 'PMingLiU', sans-serif",
                body: "'Noto Sans TC', 'Microsoft JhengHei', 'PMingLiU', sans-serif",
                mono: "monospace"
            }
        },
        stylePresets: {
            tipBox: { fill: "#d7f5dd", color: "#0b3d1a" },
            cautionBox: { fill: "#fff2cc", color: "#5a4100" },
            alertBox: { fill: "#ffd6d6", color: "#5a0b0b" },
            buttonBlue: { fill: "#3B82F6", color: "#ffffff", borderRadius: "999px", padding: "10px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", textAlign: "center" },
            buttonGreen: { fill: "#22c55e", color: "#ffffff", borderRadius: "999px", padding: "10px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", textAlign: "center" },
            buttonYellow: { fill: "#eab308", color: "#ffffff", borderRadius: "999px", padding: "10px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", textAlign: "center" }
        },
        welcomePage: {
            backgroundImage: null,
            description: ''
        },
        chapters: [
            {
                id: "ch1",
                title: "第1章",
                slides: [
                    {
                        id: "s1",
                        title: "第1頁",
                        slideName: "",
                        canvas: { w: 1280, h: 720 },
                        background: { type: "solid", value: "#F9F7F5" },
                        components: []
                    }
                ]
            }
        ]
    };
    
    currentChapterId = projectData.chapters[0].id;
    currentSlideId = projectData.chapters[0].slides[0].id;
    selectedComponentId = null;
    updateChapterSlideSelects();
}

function scheduleSaveDraft() {
    if (saveDraftTimeout) clearTimeout(saveDraftTimeout);
    saveDraftTimeout = setTimeout(saveDraft, 800);
}

function showDraftAssetsQuotaWarning() {
    let el = document.getElementById('draft-assets-quota-warning');
    if (el) {
        el.classList.remove('hide');
        if (el._hideTimer) clearTimeout(el._hideTimer);
    } else {
        el = document.createElement('div');
        el.id = 'draft-assets-quota-warning';
        el.className = 'draft-assets-quota-warning';
        el.textContent = '圖片暫存因瀏覽器儲存空間不足未儲存，編輯中部分圖片可能消失。請盡快「匯出播放簡報」或「匯出編輯存檔」備份。';
        document.getElementById('app').appendChild(el);
    }
    el._hideTimer = setTimeout(() => { el.classList.add('hide'); }, 12000);
}

function openDraftDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains(DRAFT_STORE_NAME)) {
                e.target.result.createObjectStore(DRAFT_STORE_NAME);
            }
        };
    });
}

function saveDraft() {
    if (!projectData) return;
    const payload = {
        projectData,
        currentChapterId,
        currentSlideId,
        componentIdCounter,
        savedAt: new Date().toISOString()
    };
    const payloadStr = JSON.stringify(payload);
    const assetsStr = JSON.stringify(assets);
    openDraftDB().then(db => {
        const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite');
        const store = tx.objectStore(DRAFT_STORE_NAME);
        store.put(payloadStr, 'payload');
        store.put(assetsStr, 'assets');
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
        });
    }).then(() => {
        try { localStorage.setItem(DRAFT_STORAGE_KEY, payloadStr); localStorage.setItem(DRAFT_ASSETS_KEY, assetsStr); } catch (_) {}
    }).catch(() => {
        try {
            localStorage.setItem(DRAFT_STORAGE_KEY, payloadStr);
            localStorage.setItem(DRAFT_ASSETS_KEY, assetsStr);
        } catch (eAssets) {
            if (eAssets.name === 'QuotaExceededError') showDraftAssetsQuotaWarning();
        }
    });
}

function loadDraft() {
    return openDraftDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DRAFT_STORE_NAME, 'readonly');
            const store = tx.objectStore(DRAFT_STORE_NAME);
            let payloadStr = null, assetsStr = null;
            store.get('payload').onsuccess = (e) => { payloadStr = e.target.result; };
            store.get('assets').onsuccess = (e) => { assetsStr = e.target.result; };
            tx.oncomplete = () => { db.close(); resolve({ payload: payloadStr, assets: assetsStr }); };
            tx.onerror = () => reject(tx.error);
        });
    }).then(data => {
        const payloadStr = data.payload;
        const assetsStr = data.assets;
        if (!payloadStr) return false;
        const data_ = JSON.parse(payloadStr);
        if (!data_.projectData || !Array.isArray(data_.projectData.chapters) || data_.projectData.chapters.length === 0) return false;
        projectData = data_.projectData;
        if (!projectData.welcomePage) projectData.welcomePage = { backgroundImage: null, description: '' };
        assets = (assetsStr ? JSON.parse(assetsStr) : null) || data_.assets || {};
        currentChapterId = data_.currentChapterId || projectData.chapters[0].id;
        const ch = projectData.chapters.find(c => c.id === currentChapterId);
        if (!ch) currentChapterId = projectData.chapters[0].id;
        const slide = (ch || projectData.chapters[0]).slides.find(s => s.id === (data_.currentSlideId || ''));
        currentSlideId = (slide && slide.id) || (ch || projectData.chapters[0]).slides[0].id;
        componentIdCounter = typeof data_.componentIdCounter === 'number' ? data_.componentIdCounter : 1;
        updateChapterSlideSelects();
        return true;
    }).catch(() => {
        try {
            const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data.projectData || !Array.isArray(data.projectData.chapters) || data.projectData.chapters.length === 0) return false;
            projectData = data.projectData;
            if (!projectData.welcomePage) projectData.welcomePage = { backgroundImage: null, description: '' };
            const assetsRaw = localStorage.getItem(DRAFT_ASSETS_KEY);
            assets = (assetsRaw ? JSON.parse(assetsRaw) : null) || data.assets || {};
            currentChapterId = data.currentChapterId || projectData.chapters[0].id;
            const ch = projectData.chapters.find(c => c.id === currentChapterId);
            if (!ch) currentChapterId = projectData.chapters[0].id;
            const slide = (ch || projectData.chapters[0]).slides.find(s => s.id === (data.currentSlideId || ''));
            currentSlideId = (slide && slide.id) || (ch || projectData.chapters[0]).slides[0].id;
            componentIdCounter = typeof data.componentIdCounter === 'number' ? data.componentIdCounter : 1;
            updateChapterSlideSelects();
            return true;
        } catch (e) {
            return false;
        }
    });
}

function openPreviewDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(PREVIEW_DB_NAME, PREVIEW_DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
                e.target.result.createObjectStore(PREVIEW_STORE_NAME);
            }
        };
    });
}

/** 將預覽資料寫入 IndexedDB（主），成功後再試寫 localStorage（輔）；任一成功即可供播放器讀取 */
function savePreviewToStorage() {
    const payloadStr = JSON.stringify(projectData);
    const assetsStr = JSON.stringify(assets);
    const tryLocalStorage = () => {
        try {
            localStorage.setItem(PREVIEW_PROJECT_KEY, payloadStr);
            localStorage.setItem(PREVIEW_ASSETS_KEY, assetsStr);
        } catch (e) {
            if (e.name === 'QuotaExceededError') { /* 略過，IndexedDB 已有資料 */ }
        }
    };
    return openPreviewDB().then(db => {
        const tx = db.transaction(PREVIEW_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PREVIEW_STORE_NAME);
        store.put(payloadStr, 'project');
        store.put(assetsStr, 'assets');
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
        });
    }).then(tryLocalStorage).catch(() => {
        try {
            localStorage.setItem(PREVIEW_PROJECT_KEY, payloadStr);
            localStorage.setItem(PREVIEW_ASSETS_KEY, assetsStr);
        } catch (e2) {
            throw new Error('預覽資料無法寫入（IndexedDB 與 localStorage 皆失敗）');
        }
    });
}

function normalizeProjectOrder(project) {
    if (!project || !Array.isArray(project.chapters)) return;

    const isAutoChapterTitle = (title) => typeof title === 'string' && /^第\d+章$/.test(title);
    const isAutoSlideTitle = (title) => typeof title === 'string' && /^第\d+頁$/.test(title);

    const getOrderValue = (item, type) => {
        if (typeof item.order === 'number') return { type: 'order', value: item.order };
        const regex = type === 'chapter' ? /^第(\d+)章$/ : /^第(\d+)頁$/;
        const match = typeof item.title === 'string' ? item.title.match(regex) : null;
        if (match) return { type: 'title', value: parseInt(match[1], 10) };
        return null;
    };

    project.chapters.forEach((chapter, index) => {
        chapter._originalIndex = index;
        if (Array.isArray(chapter.slides)) {
            chapter.slides.forEach((slide, slideIndex) => {
                slide._originalIndex = slideIndex;
            });
        }
    });

    project.chapters.sort((a, b) => {
        const ao = getOrderValue(a, 'chapter');
        const bo = getOrderValue(b, 'chapter');
        if (ao && bo && ao.value !== bo.value) return ao.value - bo.value;
        if (ao && !bo) return -1;
        if (!ao && bo) return 1;
        return (a._originalIndex || 0) - (b._originalIndex || 0);
    });

    project.chapters.forEach((chapter, index) => {
        delete chapter._originalIndex;
        chapter.order = index;
        if (isAutoChapterTitle(chapter.title)) {
            chapter.title = `第${index + 1}章`;
        }

        if (Array.isArray(chapter.slides)) {
            chapter.slides.sort((a, b) => {
                const ao = getOrderValue(a, 'slide');
                const bo = getOrderValue(b, 'slide');
                if (ao && bo && ao.value !== bo.value) return ao.value - bo.value;
                if (ao && !bo) return -1;
                if (!ao && bo) return 1;
                return (a._originalIndex || 0) - (b._originalIndex || 0);
            });

            chapter.slides.forEach((slide, slideIndex) => {
                delete slide._originalIndex;
                slide.order = slideIndex;
                if (slide.slideName === undefined) slide.slideName = '';
                if (isAutoSlideTitle(slide.title)) {
                    slide.title = `第${slideIndex + 1}頁`;
                }
            });
        }
    });
}

// ============================================
// 歡迎頁編輯
// ============================================

function setupWelcomeEdit() {
    const overlay = document.getElementById('welcome-edit-overlay');
    const btnOpen = document.getElementById('btn-welcome-edit');
    const btnSave = document.getElementById('welcome-edit-save');
    const btnCancel = document.getElementById('welcome-edit-cancel');
    const btnBg = document.getElementById('welcome-bg-btn');
    const btnBgClear = document.getElementById('welcome-bg-clear');
    const inputBg = document.getElementById('welcome-bg-input');
    const previewBg = document.getElementById('welcome-bg-preview');
    const textDesc = document.getElementById('welcome-description');

    function ensureWelcomePage() {
        if (!projectData) return;
        if (!projectData.welcomePage) projectData.welcomePage = { backgroundImage: null, description: '' };
    }

    function openModal() {
        ensureWelcomePage();
        textDesc.value = projectData.welcomePage.description || '';
        if (projectData.welcomePage.backgroundImage) {
            previewBg.style.backgroundImage = 'url(' + projectData.welcomePage.backgroundImage + ')';
            previewBg.style.minHeight = '120px';
        } else {
            previewBg.style.backgroundImage = '';
            previewBg.style.minHeight = '80px';
        }
        overlay.style.display = 'flex';
    }

    function closeModal() {
        overlay.style.display = 'none';
    }

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);
    if (btnSave) btnSave.addEventListener('click', () => {
        ensureWelcomePage();
        projectData.welcomePage.description = (textDesc && textDesc.value) ? textDesc.value.trim() : '';
        closeModal();
        scheduleSaveDraft();
    });
    if (btnBg && inputBg) btnBg.addEventListener('click', () => inputBg.click());
    if (inputBg) inputBg.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            ensureWelcomePage();
            projectData.welcomePage.backgroundImage = reader.result;
            previewBg.style.backgroundImage = 'url(' + reader.result + ')';
            previewBg.style.minHeight = '120px';
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });
    if (btnBgClear) btnBgClear.addEventListener('click', () => {
        ensureWelcomePage();
        projectData.welcomePage.backgroundImage = null;
        previewBg.style.backgroundImage = '';
        previewBg.style.minHeight = '80px';
    });
}

// ============================================
// 事件監聽器設定
// ============================================

function setupEventListeners() {
    // 工具列按鈕
    document.getElementById('btn-new').addEventListener('click', () => {
        if (!confirm('確定要開新檔案嗎？目前編輯內容將被清空。（已儲存的編輯存檔仍可透過「匯入編輯存檔」載入）')) return;
        initProject();
        saveDraft();
        updateChapterSlideSelects();
        renderCanvas();
        renderThumbnails();
        deselectComponent();
        if (document.getElementById('property-panel')) {
            document.getElementById('property-panel').innerHTML = '<p class="placeholder">請選擇元件以編輯屬性</p>';
        }
    });
    
    document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('file-import').click();
    });
    
    document.getElementById('btn-export').addEventListener('click', () => {
        exportProject();
        scheduleSaveDraft();
    });
    document.getElementById('btn-export-player').addEventListener('click', () => {
        exportPlayer();
        scheduleSaveDraft();
    });
    document.getElementById('btn-preview').addEventListener('click', () => {
        if (!projectData || !projectData.chapters || projectData.chapters.length === 0) {
            alert('目前沒有可播放的內容，請先新增章節與頁面。');
            return;
        }
        savePreviewToStorage()
            .then(() => { window.open('player.html?preview=1&fullscreen=1', '_blank', 'noopener'); })
            .catch((e) => { alert('無法開啟預覽：' + (e.message || '請稍後再試')); });
    });

    setupWelcomeEdit();

    // 檔案輸入
    document.getElementById('file-import').addEventListener('change', handleImport);
    document.getElementById('file-image').addEventListener('change', handleImageUpload);
    document.getElementById('file-link-thumbnail').addEventListener('change', handleLinkThumbnailUpload);
    document.getElementById('file-video').addEventListener('change', handleVideoUpload);
    document.getElementById('file-audio').addEventListener('change', handleAudioUpload);
    
    // 元件按鈕（僅有 data-type 的按鈕，避免預設按鈕重複觸發）
    document.querySelectorAll('.component-btn[data-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            addComponent(type);
        });
    });
    
    // 樣式預設按鈕
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            addComponentWithPreset('text', preset);
        });
    });
    
    // 章節與頁面管理
    document.getElementById('btn-add-chapter').addEventListener('click', addChapter);
    document.getElementById('btn-add-slide').addEventListener('click', addSlide);
    document.getElementById('chapter-select').addEventListener('change', (e) => {
        currentChapterId = e.target.value;
        const chapter = getCurrentChapter();
        if (chapter && chapter.slides.length > 0) {
            currentSlideId = chapter.slides[0].id;
        }
        updateChapterSlideSelects();
        renderCanvas();
        const slideSelect = document.getElementById('slide-select');
        if (slideSelect) slideSelect.value = currentSlideId;
    });
    document.getElementById('slide-select').addEventListener('change', (e) => {
        currentSlideId = e.target.value;
        updateChapterSlideSelects();
        renderCanvas();
    });
    const slideNameInput = document.getElementById('slide-name-input');
    if (slideNameInput) {
        slideNameInput.addEventListener('input', () => {
            const slide = getCurrentSlide();
            if (slide) {
                slide.slideName = slideNameInput.value.trim();
                scheduleSaveDraft();
                renderThumbnails();
            }
        });
    }
    
    // 畫布點擊（取消選擇）
    const canvas = document.getElementById('canvas');
    if (canvas) {
        canvas.addEventListener('click', (e) => {
            // 確保 e.target 是有效的 DOM 元素
            if (e.target && e.target.nodeType === Node.ELEMENT_NODE) {
                if (e.target === e.currentTarget || (e.target.classList && e.target.classList.contains('canvas'))) {
                    deselectComponent();
                }
            }
        });
    }
}

// ============================================
// 元件管理
// ============================================

function addComponent(type) {
    const slide = getCurrentSlide();
    if (!slide) return;
    
    const component = createComponent(type);
    slide.components.push(component);
    renderCanvas();
    selectComponent(component.id);
    scheduleSaveDraft();
}

/** 內建樣式預設（舊專案/匯入檔若無 stylePresets 時仍可正確套用） */
const DEFAULT_STYLE_PRESETS = {
    tipBox: { fill: '#d7f5dd', color: '#0b3d1a' },
    cautionBox: { fill: '#fff2cc', color: '#5a4100' },
    alertBox: { fill: '#ffd6d6', color: '#5a0b0b' },
    buttonBlue: { fill: '#3B82F6', color: '#ffffff', borderRadius: '999px', padding: '10px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.12)', textAlign: 'center' },
    buttonGreen: { fill: '#22c55e', color: '#ffffff', borderRadius: '999px', padding: '10px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.12)', textAlign: 'center' },
    buttonYellow: { fill: '#eab308', color: '#ffffff', borderRadius: '999px', padding: '10px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.12)', textAlign: 'center' }
};

function addComponentWithPreset(type, preset) {
    const slide = getCurrentSlide();
    if (!slide) return;
    
    const component = createComponent(type);
    const presetStyle = (projectData.stylePresets && projectData.stylePresets[preset]) || DEFAULT_STYLE_PRESETS[preset];
    
    if (presetStyle) {
        component.style = {
            ...component.style,
            backgroundColor: presetStyle.fill,
            color: presetStyle.color,
            borderRadius: presetStyle.borderRadius || '8px',
            padding: presetStyle.padding || '12px'
        };
        if (presetStyle.boxShadow) component.style.boxShadow = presetStyle.boxShadow;
        if (presetStyle.textAlign) component.style.textAlign = presetStyle.textAlign;
    }
    
    // 預設樣式在文字開頭加入對應圖示（僅 Tip / Caution / Alert）
    const presetIcons = { tipBox: '💡 ', cautionBox: '⚠️ ', alertBox: '🚨 ' };
    if (type === 'text' && presetIcons[preset]) {
        component.props.text = (presetIcons[preset] || '') + (component.props.text || '新文字');
    }
    // 按鈕預設使用「按鈕」為預設文字
    const buttonPresets = { buttonBlue: true, buttonGreen: true, buttonYellow: true };
    if (type === 'text' && buttonPresets[preset]) {
        component.props.text = component.props.text || '按鈕';
    }
    
    slide.components.push(component);
    renderCanvas();
    selectComponent(component.id);
    scheduleSaveDraft();
}

function createComponent(type) {
    const id = `c${componentIdCounter++}`;
    const baseComponent = {
        id: id,
        type: type,
        x: 100,
        y: 100,
        w: 300,
        h: 100,
        props: {},
        style: {}
    };
    
    // 根據類型設定預設值
    switch (type) {
        case 'text':
            baseComponent.props = { text: '新文字' };
            baseComponent.style = {
                fontSize: '24px',
                color: '#000000',
                fontFamily: "'Iansui', 'Microsoft JhengHei', 'Noto Sans TC', 'PMingLiU', 'DFKai-SB', sans-serif"
            };
            baseComponent.w = 400;
            baseComponent.h = 60;
            break;
            
        case 'image':
            baseComponent.props = { assetId: null, keepAspectRatio: true };
            baseComponent.w = 300;
            baseComponent.h = 200;
            break;
            
        case 'link':
            baseComponent.props = { text: '連結文字', url: 'https://example.com', showThumbnail: false, thumbnailUrl: '', thumbnailAssetId: null };
            baseComponent.style = {
                fontSize: '16px',
                color: '#000000',
                fontFamily: "'Iansui', 'Microsoft JhengHei', 'Noto Sans TC', 'PMingLiU', 'DFKai-SB', sans-serif",
                textDecoration: 'none'
            };
            baseComponent.w = 200;
            baseComponent.h = 40;
            break;

        case 'embed':
            baseComponent.props = { url: 'https://example.com' };
            baseComponent.w = 640;
            baseComponent.h = 360;
            break;

        case 'table':
            baseComponent.props = {
                rows: 3,
                cols: 4,
                headerRow: true,
                cells: [
                    ['標題1', '標題2', '標題3', '標題4'],
                    ['A1', 'A2', 'A3', 'A4'],
                    ['B1', 'B2', 'B3', 'B4']
                ]
            };
            baseComponent.style = { fontSize: '14px', borderColor: '#ccc' };
            baseComponent.w = 500;
            baseComponent.h = 180;
            break;
            
        case 'code':
            baseComponent.props = { code: 'console.log("Hello");', language: 'javascript' };
            baseComponent.style = {
                fontSize: '14px',
                fontFamily: projectData.theme.fonts.mono,
                backgroundColor: '#1e1e1e',
                color: '#d4d4d4',
                padding: '12px',
                borderRadius: '4px'
            };
            baseComponent.w = 600;
            baseComponent.h = 200;
            break;
            
        case 'quiz-single':
            baseComponent.props = {
                question: '問題？',
                options: ['選項1', '選項2', '選項3'],
                correctIndex: 1,
                showCorrectAnswer: true
            };
            baseComponent.w = 500;
            baseComponent.h = 300;
            break;
            
        case 'drag-order':
            baseComponent.props = {
                question: '請使用滑鼠拖曳以排序',
                items: ['項目1', '項目2', '項目3'],
                correctOrder: [1, 2, 3],
                showCorrectAnswer: true,
                layout: 'list'  // 'list' = 列表內拖曳排序；'slots' = 左側卡片拖到右側格位
            };
            baseComponent.w = 500;
            baseComponent.h = 400;
            break;
            
        case 'quiz-multiple':
            baseComponent.props = {
                question: '請複選（至少選 2 個正確答案）',
                options: ['選項1', '選項2', '選項3', '選項4'],
                correctIndices: [0, 1],
                showCorrectAnswer: true
            };
            baseComponent.w = 500;
            baseComponent.h = 320;
            break;

        case 'video':
            baseComponent.props = { url: '', source: 'url', assetId: null, autoplay: false, muted: true };
            baseComponent.w = 560;
            baseComponent.h = 315;
            break;
        case 'list':
            baseComponent.props = { items: ['項目一', '項目二', '項目三'], listType: 'bullet' };
            baseComponent.style = { fontSize: '18px', color: '#333' };
            baseComponent.w = 400;
            baseComponent.h = 120;
            break;
        case 'fill-blank':
            baseComponent.props = {
                question: '請在底線處填入答案：_____ 是程式語言。',
                answers: ['Python'],
                showCorrectAnswer: true
            };
            baseComponent.w = 500;
            baseComponent.h = 120;
            break;
        case 'chart':
            baseComponent.props = {
                chartType: 'bar',
                labels: ['A', 'B', 'C'],
                values: [30, 50, 20]
            };
            baseComponent.w = 400;
            baseComponent.h = 260;
            break;
        case 'matching':
            baseComponent.props = {
                question: '請將左側與右側配對',
                leftItems: ['1', '2', '3'],
                rightItems: ['A', 'B', 'C'],
                correctPairs: [[0, 0], [1, 1], [2, 2]],
                showCorrectAnswer: true
            };
            baseComponent.w = 500;
            baseComponent.h = 280;
            break;
        case 'shape':
            baseComponent.props = { shapeType: 'rect', fill: '#3B82F6', stroke: '#1d4ed8', strokeWidth: 2 };
            baseComponent.w = 120;
            baseComponent.h = 80;
            break;
        case 'progress':
            baseComponent.props = { current: 2, total: 5, label: '步驟' };
            baseComponent.w = 400;
            baseComponent.h = 60;
            break;
        case 'audio':
            baseComponent.props = { url: '', assetId: null };
            baseComponent.w = 320;
            baseComponent.h = 56;
            break;
        case 'timeline':
            baseComponent.props = {
                events: [
                    { label: '事件一', date: '2024-01' },
                    { label: '事件二', date: '2024-06' },
                    { label: '事件三', date: '2025-01' }
                ]
            };
            baseComponent.w = 500;
            baseComponent.h = 200;
            break;
        case 'collapsible':
            baseComponent.props = { title: '點擊展開', content: '這裡是隱藏內容。\n可多行輸入，換行會保留顯示。', defaultOpen: false, titleFontSize: 18, contentFontSize: 16 };
            baseComponent.w = 400;
            baseComponent.h = 80;
            break;
        case 'timer':
            baseComponent.props = { mode: 'countdown', countdownSeconds: 60, showButtons: true, label: '', timeFontSize: 48 };
            baseComponent.w = 240;
            baseComponent.h = 140;
            break;
    }
    
    return baseComponent;
}

function getComponent(id) {
    const slide = getCurrentSlide();
    if (!slide) return null;
    return slide.components.find(c => c.id === id);
}

function deleteComponent(id) {
    const slide = getCurrentSlide();
    if (!slide) return;
    
    const index = slide.components.findIndex(c => c.id === id);
    if (index > -1) {
        slide.components.splice(index, 1);
        if (selectedComponentId === id) {
            deselectComponent();
        }
        renderCanvas();
        scheduleSaveDraft();
    }
}

/** 複製元件（含屬性與內容），新元件略為偏移避免完全重疊 */
function duplicateComponent(id) {
    const slide = getCurrentSlide();
    if (!slide) return;
    const source = getComponent(id);
    if (!source) return;
    
    const newId = `c${componentIdCounter++}`;
    const clone = {
        id: newId,
        type: source.type,
        x: source.x + 20,
        y: source.y + 20,
        w: source.w,
        h: source.h,
        props: JSON.parse(JSON.stringify(source.props || {})),
        style: JSON.parse(JSON.stringify(source.style || {}))
    };
    // 邊界內
    clone.x = Math.max(0, Math.min(1280 - clone.w, clone.x));
    clone.y = Math.max(0, Math.min(720 - clone.h, clone.y));
    
    slide.components.push(clone);
    renderCanvas();
    selectComponent(clone.id);
    scheduleSaveDraft();
}

/** 圖層：上移一層（與上一層交換）或下移一層（與下一層交換） */
function moveComponentLayer(id, direction) {
    const slide = getCurrentSlide();
    if (!slide) return;
    const index = slide.components.findIndex(c => c.id === id);
    if (index < 0) return;
    const len = slide.components.length;
    if (direction === 'up' && index < len - 1) {
        [slide.components[index], slide.components[index + 1]] = [slide.components[index + 1], slide.components[index]];
    } else if (direction === 'down' && index > 0) {
        [slide.components[index - 1], slide.components[index]] = [slide.components[index], slide.components[index - 1]];
    } else return;
    renderCanvas();
    const component = getComponent(id);
    if (component) updatePropertyPanel(component);
    scheduleSaveDraft();
}

// ============================================
// 畫布渲染
// ============================================

function renderCanvas() {
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('畫布元素不存在');
        return;
    }
    
    const slide = getCurrentSlide();
    
    if (!slide) {
        canvas.innerHTML = '';
        return;
    }
    
    // 設定背景
    if (slide.background.type === 'solid') {
        canvas.style.backgroundColor = slide.background.value;
    }
    
    // 清空畫布
    canvas.innerHTML = '';
    
    // 安全範圍：播放器底部工具列約 70px，標示避免元件被遮住
    const safeZone = document.createElement('div');
    safeZone.className = 'editor-safe-zone';
    safeZone.setAttribute('aria-hidden', 'true');
    safeZone.innerHTML = '<span class="editor-safe-zone-label">工具列區域（播放時可能遮住）</span>';
    canvas.appendChild(safeZone);
    
    // 計算畫布縮放比例，保持 16:9 比例
    updateCanvasScale();
    
    // 渲染所有元件
    slide.components.forEach(component => {
        try {
            const element = createComponentElement(component);
            if (element && canvas) {
                canvas.appendChild(element);
            }
        } catch (error) {
            console.error('渲染元件失敗:', component, error);
        }
    });
    
    // 如果沒有選中元件，更新屬性面板
    if (!selectedComponentId) {
        updatePropertyPanel(null);
    }
    
    // 畫布依 wrapper 空間重新縮放，填滿編輯區
    updateCanvasScale();
    // 左側即時預覽縮圖同步更新
    renderThumbnails();
}

// ============================================
// 畫布縮放計算（保持 16:9 比例）
// ============================================

function updateCanvasScale() {
    const canvas = document.getElementById('canvas');
    const wrapper = document.getElementById('canvas-wrapper');
    
    if (!canvas || !wrapper) return;
    
    // 以 wrapper 的可用空間為準，讓畫布依比例放大至填滿（紅箭頭方向填滿）
    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;
    
    if (wrapperWidth <= 0 || wrapperHeight <= 0) return;
    
    const scaleByWidth = wrapperWidth / 1280;
    const scaleByHeight = wrapperHeight / 720;
    const scale = Math.min(scaleByWidth, scaleByHeight);
    
    canvas.style.transform = `scale(${scale})`;
    canvas.style.transformOrigin = 'center center';
}

// 監聽視窗大小變化
let canvasResizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(canvasResizeTimeout);
    canvasResizeTimeout = setTimeout(() => {
        updateCanvasScale();
    }, 100);
});

// 初始化時計算縮放
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateCanvasScale, 100);
});

function createComponentElement(component) {
    const div = document.createElement('div');
    div.className = 'component';
    div.dataset.componentId = component.id;
    
    // 設定位置和大小
    div.style.left = component.x + 'px';
    div.style.top = component.y + 'px';
    div.style.width = component.w + 'px';
    div.style.height = component.h + 'px';
    
    // 根據類型建立內容
    switch (component.type) {
        case 'text':
            div.className += ' component-text';
            div.contentEditable = false;
            div.textContent = component.props.text || '';
            applyStyles(div, component.style);
            div.addEventListener('dblclick', () => {
                const currentText = (div.textContent || '').trim();
                const defaultTexts = ['新文字', '💡 新文字', '⚠️ 新文字', '🚨 新文字', '按鈕'];
                const isDefault = defaultTexts.includes(currentText);
                if (isDefault) {
                    div.textContent = '';
                    updateComponentProps(component.id, { text: '' });
                }
                div.contentEditable = true;
                div.classList.add('editing');
                div.focus();
                if (!isDefault && currentText.length > 0) {
                    requestAnimationFrame(() => {
                        const sel = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(div);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    });
                }
            });
            div.addEventListener('blur', () => {
                div.contentEditable = false;
                div.classList.remove('editing');
                let savedText = (div.textContent || '').trim();
                const presetIcon = getPresetIconForText(component);
                if (presetIcon && !savedText.startsWith(presetIcon.trim())) {
                    savedText = presetIcon + savedText;
                }
                updateComponentProps(component.id, { text: savedText });
                div.textContent = savedText;
            });
            break;
            
        case 'image':
            div.className += ' component-image';
            const img = document.createElement('img');
            if (component.props.assetId && assets[component.props.assetId]) {
                img.src = assets[component.props.assetId];
            } else {
                img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="200"%3E%3Crect width="300" height="200" fill="%23333"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3E無圖片%3C/text%3E%3C/svg%3E';
            }
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            div.appendChild(img);
            break;
            
        case 'link':
            div.className += ' component-link';
            const linkWrap = document.createElement('div');
            linkWrap.className = 'component-link-inner';
            linkWrap.style.display = 'flex';
            linkWrap.style.alignItems = 'center';
            linkWrap.style.gap = '10px';
            linkWrap.style.width = '100%';
            linkWrap.style.height = '100%';
            if (component.props.showThumbnail && (component.props.thumbnailUrl || (component.props.thumbnailAssetId && assets[component.props.thumbnailAssetId]))) {
                const thumbImg = document.createElement('img');
                thumbImg.className = 'link-thumbnail';
                thumbImg.alt = '';
                if (component.props.thumbnailAssetId && assets[component.props.thumbnailAssetId]) {
                    thumbImg.src = assets[component.props.thumbnailAssetId];
                } else {
                    thumbImg.src = component.props.thumbnailUrl || '';
                }
                thumbImg.onerror = () => { thumbImg.style.display = 'none'; };
                linkWrap.appendChild(thumbImg);
            }
            const link = document.createElement('a');
            link.href = component.props.url || '#';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const externalIconSvg = '<span class="link-external-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span>';
            const linkTextEscaped = (component.props.text || '連結').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            link.innerHTML = externalIconSvg + ' <span class="link-text">' + linkTextEscaped + '</span>';
            applyStyles(link, component.style);
            link.style.flex = '1';
            link.style.justifyContent = (component.style.textAlign === 'center' ? 'center' : component.style.textAlign === 'right' ? 'flex-end' : 'flex-start');
            linkWrap.appendChild(link);
            div.appendChild(linkWrap);
            break;

        case 'embed':
            div.className += ' component-embed';
            const embedUrl = (component.props.url || '').trim();
            if (embedUrl) {
                const iframe = document.createElement('iframe');
                iframe.src = embedUrl;
                iframe.title = '內嵌網頁';
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                div.appendChild(iframe);
            } else {
                div.innerHTML = '<div class="editor-embed-placeholder">請在右側屬性輸入要內嵌的網址</div>';
            }
            break;

        case 'table':
            div.className += ' component-table';
            const tableRows = component.props.rows || 3;
            const tableCols = component.props.cols || 4;
            const headerRow = component.props.headerRow !== false;
            const cells = component.props.cells || [];
            let tableHtml = '<table class="editor-table-preview"><tbody>';
            for (let r = 0; r < tableRows; r++) {
                const tag = (headerRow && r === 0) ? 'th' : 'td';
                tableHtml += '<tr>';
                for (let c = 0; c < tableCols; c++) {
                    const cellText = (cells[r] && cells[r][c] !== undefined) ? String(cells[r][c]).replace(/</g, '&lt;') : '';
                    tableHtml += `<${tag}>${cellText}</${tag}>`;
                }
                tableHtml += '</tr>';
            }
            tableHtml += '</tbody></table>';
            div.innerHTML = tableHtml;
            break;
            
        case 'code':
            div.className += ' component-code';
            const codeContainer = document.createElement('div');
            codeContainer.className = 'editor-code-wrap';
            codeContainer.style.cssText = 'height: 100%; overflow: auto; position: relative; display: flex; flex-direction: column; padding: 10px;';
            const copyBtn = document.createElement('button');
            const copyIconSvg = '<span class="editor-copy-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>';
            copyBtn.className = 'btn btn-small editor-code-copy';
            copyBtn.style.cssText = 'align-self: flex-end; margin-bottom: 8px; display: inline-flex; align-items: center; gap: 6px;';
            copyBtn.innerHTML = copyIconSvg + '複製程式碼';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(component.props.code || '');
                copyBtn.innerHTML = copyIconSvg + '已複製!';
                setTimeout(() => { copyBtn.innerHTML = copyIconSvg + '複製程式碼'; }, 2000);
            });
            const pre = document.createElement('pre');
            pre.style.margin = '0'; pre.style.flex = '1';
            pre.style.overflowX = 'hidden'; pre.style.overflowY = 'auto';
            pre.style.whiteSpace = 'pre-wrap'; pre.style.wordWrap = 'break-word'; pre.style.wordBreak = 'break-word';
            pre.style.padding = '12px'; pre.style.borderRadius = '6px';
            const code = document.createElement('code');
            let lang = (component.props.language || 'javascript').toLowerCase().replace(/\s/g, '');
            if (lang === 'html' || lang === 'xml') lang = 'markup';
            const codeText = component.props.code || '';
            code.className = lang && lang !== 'plaintext' ? `language-${lang}` : '';
            if (typeof Prism !== 'undefined' && lang && lang !== 'plaintext' && Prism.languages[lang]) {
                try {
                    code.innerHTML = Prism.highlight(codeText, Prism.languages[lang], lang);
                } catch (e) {
                    code.textContent = codeText;
                }
            } else {
                code.textContent = codeText;
            }
            pre.appendChild(code);
            if (component.style && component.style.fontSize) pre.style.fontSize = component.style.fontSize;
            codeContainer.appendChild(copyBtn);
            codeContainer.appendChild(pre);
            div.appendChild(codeContainer);
            break;
            
        case 'quiz-single':
            div.className += ' component-quiz';
            const showAnswerSingle = component.props.showCorrectAnswer !== false;
            div.innerHTML = `<div class="editor-quiz-wrap">
                <h3>${component.props.question || '問題'}</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    ${(component.props.options || []).map((opt, idx) => 
                        `<li class="editor-quiz-opt">${opt || `選項 ${idx + 1}`}</li>`
                    ).join('')}
                    ${(component.props.options || []).length === 0 ? '<li class="editor-quiz-opt" style="color:#888;font-style:italic">尚無選項</li>' : ''}
                </ul>
                ${showAnswerSingle ? `<div class="editor-quiz-answer">正確答案：選項 ${component.props.correctIndex || 1}</div>` : ''}
            </div>`;
            applyQuizDragFontSize(div, component);
            break;
            
        case 'drag-order': {
            div.className += ' component-drag-order';
            const showAnswerDrag = component.props.showCorrectAnswer !== false;
            const dragLayout = component.props.layout || 'list';
            const dragItems = component.props.items || [];
            if (dragLayout === 'slots') {
                // 左側卡片 + 右側格位預覽（編輯時僅靜態顯示）
                div.classList.add('editor-drag-slots-preview');
                div.innerHTML = `<div class="editor-drag-wrap editor-drag-wrap-slots">
                    <h3>${(component.props.question || '將左側項目拖曳到右側對應位置').replace(/</g, '&lt;')}</h3>
                    <div class="editor-drag-slots-row">
                        <div class="editor-drag-source-preview">
                            <ul style="list-style: none; padding: 0; margin: 0;">
                                ${dragItems.map((item, idx) => `<li class="editor-drag-item">${(item || `項目 ${idx + 1}`).replace(/</g, '&lt;')}</li>`).join('')}
                                ${dragItems.length === 0 ? '<li class="editor-drag-item" style="color:#888;font-style:italic">尚無項目</li>' : ''}
                            </ul>
                        </div>
                        <div class="editor-drag-slots-preview-right">
                            ${dragItems.map((_, i) => `<div class="editor-drag-slot-preview"><span class="editor-drag-slot-num">${i + 1}</span><span class="editor-drag-slot-placeholder">放置區</span></div>`).join('')}
                        </div>
                    </div>
                    ${showAnswerDrag ? `<div class="editor-quiz-answer">正確順序：${(component.props.correctOrder || []).join(', ') || '未設定'}</div>` : ''}
                </div>`;
            } else {
                div.innerHTML = `<div class="editor-drag-wrap">
                    <h3>${(component.props.question || '請使用滑鼠拖曳以排序').replace(/</g, '&lt;')}</h3>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        ${dragItems.map((item, idx) => `<li class="editor-drag-item">${(item || `項目 ${idx + 1}`).replace(/</g, '&lt;')}</li>`).join('')}
                        ${dragItems.length === 0 ? '<li class="editor-drag-item" style="color:#888;font-style:italic">尚無項目</li>' : ''}
                    </ul>
                    ${showAnswerDrag ? `<div class="editor-quiz-answer">正確順序：${(component.props.correctOrder || []).join(', ') || '未設定'}</div>` : ''}
                </div>`;
            }
            applyQuizDragFontSize(div, component);
            break;
        }
            
        case 'quiz-multiple':
            div.className += ' component-quiz-multiple';
            const correctIndices = component.props.correctIndices || [0, 1];
            const opts = component.props.options || [];
            div.innerHTML = `<div class="editor-quiz-wrap">
                <h3>${component.props.question || '複選題'}</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    ${opts.map((opt, idx) => 
                        `<li class="editor-quiz-opt"><label><input type="checkbox" disabled> ${opt || `選項 ${idx + 1}`}</label></li>`
                    ).join('')}
                    ${opts.length === 0 ? '<li class="editor-quiz-opt" style="color:#888">尚無選項</li>' : ''}
                </ul>
                <div class="editor-quiz-answer">正確選項：${correctIndices.map(i => i + 1).join(', ')}（至少 2 個）</div>
            </div>`;
            applyQuizDragFontSize(div, component);
            break;

        case 'video':
            div.className += ' component-video';
            const vidUrl = (component.props.url || '').trim();
            const vidAsset = component.props.assetId && assets[component.props.assetId];
            if (vidUrl || vidAsset) {
                const vid = document.createElement(component.props.source === 'asset' && vidAsset ? 'video' : 'iframe');
                vid.style.width = '100%';
                vid.style.height = '100%';
                vid.style.border = 'none';
                if (vid.tagName === 'VIDEO') {
                    vid.src = vidAsset;
                    vid.controls = true;
                } else {
                    const yt = vidUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
                    vid.src = yt ? `https://www.youtube.com/embed/${yt[1]}` : vidUrl;
                }
                div.appendChild(vid);
            } else {
                div.innerHTML = '<div class="editor-embed-placeholder">請設定影片網址或上傳影片</div>';
            }
            break;
        case 'list':
            div.className += ' component-list';
            const listType = component.props.listType || 'bullet';
            const listTag = listType === 'numbered' ? 'ol' : 'ul';
            const listItems = (component.props.items || []).map(s => String(s).replace(/</g, '&lt;')).join('</li><li>');
            div.innerHTML = `<${listTag} class="editor-list-preview"><li>${listItems || '尚無項目'}</li></${listTag}>`;
            if (component.style) applyStyles(div.querySelector(listTag), component.style);
            break;
        case 'fill-blank':
            div.className += ' component-fill-blank';
            div.innerHTML = `<div class="editor-fill-blank-wrap"><p>${(component.props.question || '請填入答案').replace(/</g, '&lt;')}</p><div class="editor-quiz-answer">正確答案：${(component.props.answers || []).join(', ')}</div></div>`;
            break;
        case 'chart':
            div.className += ' component-chart';
            const cLabels = component.props.labels || [];
            const cValues = component.props.values || [];
            div.innerHTML = `<div class="editor-chart-preview"><span class="editor-chart-type">${component.props.chartType || 'bar'}</span><div>${cLabels.map((l, i) => `${l}: ${cValues[i] != null ? cValues[i] : 0}`).join(' | ')}</div></div>`;
            break;
        case 'matching':
            div.className += ' component-matching';
            const leftItems = component.props.leftItems || [];
            const rightItems = component.props.rightItems || [];
            div.innerHTML = `<div class="editor-matching-wrap"><h3>${(component.props.question || '配對題').replace(/</g, '&lt;')}</h3><div class="editor-matching-preview">左：${leftItems.join(', ')} | 右：${rightItems.join(', ')}</div></div>`;
            break;
        case 'shape':
            div.className += ' component-shape';
            const st = component.props.shapeType || 'rect';
            const fill = component.props.fill || '#3B82F6';
            div.style.backgroundColor = fill;
            div.style.borderRadius = st === 'circle' ? '50%' : '0';
            if (component.props.stroke) {
                div.style.border = `${component.props.strokeWidth || 2}px solid ${component.props.stroke}`;
            }
            if (st === 'arrow') div.innerHTML = '<div style="width:0;height:0;border:20px solid transparent;border-left-color:inherit;margin:auto;"></div>';
            break;
        case 'progress':
            div.className += ' component-progress';
            const cur = component.props.current != null ? component.props.current : 2;
            const tot = component.props.total || 5;
            const lab = component.props.label || '步驟';
            div.innerHTML = `<div class="editor-progress-wrap"><span class="editor-progress-label">${lab}</span><span class="editor-progress-value">${cur} / ${tot}</span><div class="editor-progress-bar"><div class="editor-progress-fill" style="width:${(cur/tot)*100}%"></div></div></div>`;
            break;
        case 'audio':
            div.className += ' component-audio';
            const audUrl = (component.props.url || '').trim();
            const audAsset = component.props.assetId && assets[component.props.assetId];
            if (audUrl || audAsset) {
                const aud = document.createElement('audio');
                aud.controls = true;
                aud.src = audAsset || audUrl;
                aud.style.width = '100%';
                div.appendChild(aud);
            } else {
                div.innerHTML = '<div class="editor-embed-placeholder">請設定音訊網址或上傳音檔</div>';
            }
            break;
        case 'timeline':
            div.className += ' component-timeline';
            const evs = component.props.events || [];
            div.innerHTML = `<div class="editor-timeline-wrap">${evs.map(e => `<div class="editor-timeline-item"><span class="editor-timeline-date">${String(e.date || '').replace(/</g, '&lt;')}</span><span class="editor-timeline-label">${String(e.label || '').replace(/</g, '&lt;')}</span></div>`).join('') || '<div class="editor-timeline-item">尚無事件</div>'}</div>`;
            break;
        case 'collapsible':
            div.className += ' component-collapsible';
            const open = component.props.defaultOpen;
            const titleFs = component.props.titleFontSize != null ? component.props.titleFontSize : 18;
            const contentFs = component.props.contentFontSize != null ? component.props.contentFontSize : 16;
            const contentEsc = (component.props.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
            div.innerHTML = `<div class="editor-collapsible-wrap"><button type="button" class="editor-collapsible-title" style="font-size:${titleFs}px">${(component.props.title || '點擊展開').replace(/</g, '&lt;')} ${open ? '▼' : '▶'}</button><div class="editor-collapsible-content" style="display:${open ? 'block' : 'none'}; font-size:${contentFs}px; white-space:pre-wrap; word-break:break-word">${contentEsc}</div></div>`;
            break;
        case 'timer':
            div.className += ' component-timer';
            const mode = component.props.mode || 'countdown';
            const sec = component.props.countdownSeconds != null ? component.props.countdownSeconds : 60;
            const timerLabel = component.props.label || '';
            const timeFs = component.props.timeFontSize != null ? component.props.timeFontSize : 48;
            div.innerHTML = `<div class="editor-timer-wrap"><div class="editor-timer-label">${(timerLabel || '計時器').replace(/</g, '&lt;')}</div><span class="editor-timer-display" style="font-size:${timeFs}px">${mode === 'countdown' ? sec + ' 秒' : '0:00'}</span><span class="editor-timer-hint">${mode === 'countdown' ? '倒數' : '碼表'}</span></div>`;
            break;
    }
    
    // 點擊選擇
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        selectComponent(component.id);
    });
    
    // 拖曳功能
    setupDrag(div, component);
    
    // 縮放功能
    setupResize(div, component);
    
    return div;
}

/** Tip/Caution/Alert 依背景色判斷預設圖示，儲存時保留圖示 */
function getPresetIconForText(component) {
    if (!component || component.type !== 'text' || !component.style || !component.style.backgroundColor) return null;
    const bg = (component.style.backgroundColor || '').toLowerCase().replace(/\s/g, '');
    if (bg.includes('#d7f5dd') || bg.includes('d7f5dd')) return '💡 ';
    if (bg.includes('#fff2cc') || bg.includes('fff2cc')) return '⚠️ ';
    if (bg.includes('#ffd6d6') || bg.includes('ffd6d6')) return '🚨 ';
    return null;
}

function applyStyles(element, styles) {
    if (!styles) return;
    Object.keys(styles).forEach(key => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        let value = styles[key];
        // 如果是 fontSize 且沒有單位，加上 px
        if (key === 'fontSize' && typeof value === 'number') {
            value = value + 'px';
        }
        element.style[cssKey] = value;
    });
}

/** 單選／複選／拖曳排序：套用 component.style.fontSize 到標題、選項、答案區（縮放後重新渲染時保留字體大小） */
function applyQuizDragFontSize(div, component) {
    const base = parseFloat(component.style && component.style.fontSize) || 16;
    if (base <= 0) return;
    const wrap = div.querySelector('.editor-quiz-wrap, .editor-drag-wrap');
    if (!wrap) return;
    const h3 = wrap.querySelector('h3');
    const opts = wrap.querySelectorAll('.editor-quiz-opt, .editor-drag-item');
    const answer = wrap.querySelector('.editor-quiz-answer');
    if (h3) h3.style.fontSize = base + 'px';
    opts.forEach(el => { el.style.fontSize = (base * 14 / 16) + 'px'; });
    if (answer) answer.style.fontSize = (base * 12 / 16) + 'px';
}

// ============================================
// 拖曳與縮放
// ============================================

function setupDrag(element, component) {
    let isDragging = false;
    let dragStarted = false; // 僅在實際移動後才視為拖曳，方便文字元件雙擊編輯
    let startX, startY, startLeft, startTop;
    const DRAG_THRESHOLD = 5;
    let animationFrameId = null;
    let canvas = null;
    let scale = 1;
    const isTextComponent = component.type === 'text';

    function updateCanvasInfo() {
        canvas = document.getElementById('canvas');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            scale = rect.width / 1280;
        }
    }
    updateCanvasInfo();

    element.addEventListener('mousedown', (e) => {
        if (!e.target || e.target.nodeType !== Node.ELEMENT_NODE) return;
        if (e.target.classList && e.target.classList.contains('resize-handle')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;

        e.preventDefault();
        e.stopPropagation();

        startX = e.clientX;
        startY = e.clientY;
        startLeft = component.x;
        startTop = component.y;
        dragStarted = false;
        isDragging = true;
        updateCanvasInfo();

        document.addEventListener('mousemove', handleDrag, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        document.body.style.userSelect = 'none';
    });
    
    function handleDrag(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (isTextComponent && !dragStarted) {
            if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
            dragStarted = true;
            element.classList.add('dragging');
        } else if (!isTextComponent && !dragStarted) {
            dragStarted = true;
            element.classList.add('dragging');
        }
        e.preventDefault();
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
            if (!isDragging || !canvas) return;
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            const newX = Math.max(0, Math.min(1280 - component.w, startLeft + deltaX / scale));
            const newY = Math.max(0, Math.min(720 - component.h, startTop + deltaY / scale));
            element.style.left = newX + 'px';
            element.style.top = newY + 'px';
        });
    }
    
    function stopDrag() {
        if (!isDragging) return;
        isDragging = false;
        if (dragStarted) element.classList.remove('dragging');
        document.body.style.userSelect = '';
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (dragStarted && canvas) {
            const rect = element.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            const relativeX = (rect.left - canvasRect.left) / scale;
            const relativeY = (rect.top - canvasRect.top) / scale;
            component.x = Math.round(relativeX * 100) / 100;
            component.y = Math.round(relativeY * 100) / 100;
        }
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', stopDrag);
    }
}

function setupResize(element, component) {
    // 建立四個縮放控制點
    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${pos}`;
        element.appendChild(handle);
        
        let isResizing = false;
        let startX, startY, startW, startH, startLeft, startTop, startFontSize = null;
        
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startW = component.w;
            startH = component.h;
            startLeft = component.x;
            startTop = component.y;
            if (component.type === 'text' || component.type === 'link' || component.type === 'code') {
                startFontSize = parseFloat(component.style.fontSize) || (component.type === 'link' ? 16 : component.type === 'code' ? 14 : 24);
            } else if (component.type === 'quiz-single' || component.type === 'quiz-multiple' || component.type === 'drag-order') {
                const titleEl = element.querySelector('.editor-quiz-wrap h3, .editor-drag-wrap h3');
                startFontSize = titleEl ? parseFloat(getComputedStyle(titleEl).fontSize) : (parseFloat(component.style.fontSize) || 16);
            } else {
                startFontSize = null;
            }
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
        });
        
        let resizeAnimationFrameId = null;
        let canvas = null;
        let scale = 1;
        
        function updateCanvasInfo() {
            canvas = document.getElementById('canvas');
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                scale = rect.width / 1280;
            }
        }
        
        function handleResize(e) {
            if (!isResizing) return;
            
            e.preventDefault();
            
            if (!canvas) updateCanvasInfo();
            
            // 使用 requestAnimationFrame 優化效能
            if (resizeAnimationFrameId) {
                cancelAnimationFrame(resizeAnimationFrameId);
            }
            
            resizeAnimationFrameId = requestAnimationFrame(() => {
                if (!isResizing) return;
                
                const deltaX = (e.clientX - startX) / scale;
                const deltaY = (e.clientY - startY) / scale;
            
            let newW = startW;
            let newH = startH;
            let newX = startLeft;
            let newY = startTop;
            
            if (pos.includes('e')) {
                newW = Math.max(50, startW + deltaX);
            }
            if (pos.includes('w')) {
                newW = Math.max(50, startW - deltaX);
                newX = Math.max(0, startLeft + deltaX);
            }
            if (pos.includes('s')) {
                newH = Math.max(30, startH + deltaY);
            }
            if (pos.includes('n')) {
                newH = Math.max(30, startH - deltaY);
                newY = Math.max(0, startTop + deltaY);
            }
            
            // 如果是圖片且設定保持比例
            if (component.type === 'image' && component.props.keepAspectRatio) {
                const aspectRatio = startW / startH;
                if (pos.includes('e') || pos.includes('w')) {
                    newH = newW / aspectRatio;
                    if (pos.includes('n')) {
                        newY = startTop - (newH - startH);
                    }
                } else {
                    newW = newH * aspectRatio;
                    if (pos.includes('w')) {
                        newX = startLeft - (newW - startW);
                    }
                }
            }
            
                // 直接更新樣式，不更新 component（減少重繪）
                element.style.width = newW + 'px';
                element.style.height = newH + 'px';
                element.style.left = newX + 'px';
                element.style.top = newY + 'px';
                
                // 文字類／測驗／拖曳：縮放時字體一併等比縮放
                if (startFontSize != null && startW > 0 && startH > 0) {
                    const scaleW = newW / startW;
                    const scaleH = newH / startH;
                    const scaleFactor = (scaleW + scaleH) / 2;
                    const newFontSize = Math.max(8, Math.min(200, Math.round(startFontSize * scaleFactor * 10) / 10));
                    if (component.type === 'text') {
                        if (element) element.style.fontSize = newFontSize + 'px';
                    } else if (component.type === 'link') {
                        const a = element.querySelector('a');
                        if (a) a.style.fontSize = newFontSize + 'px';
                    } else if (component.type === 'code') {
                        const pre = element.querySelector('pre');
                        if (pre) pre.style.fontSize = newFontSize + 'px';
                    } else if (component.type === 'quiz-single' || component.type === 'quiz-multiple' || component.type === 'drag-order') {
                        const wrap = element.querySelector('.editor-quiz-wrap, .editor-drag-wrap');
                        const h3 = wrap && wrap.querySelector('h3');
                        const opts = wrap ? wrap.querySelectorAll('.editor-quiz-opt, .editor-drag-item') : [];
                        const answer = wrap && wrap.querySelector('.editor-quiz-answer');
                        if (h3) h3.style.fontSize = newFontSize + 'px';
                        opts.forEach(el => { el.style.fontSize = (newFontSize * 14 / 16) + 'px'; });
                        if (answer) answer.style.fontSize = (newFontSize * 12 / 16) + 'px';
                    }
                }
            });
        }
        
        function stopResize() {
            if (!isResizing) return;
            
            isResizing = false;
            document.body.style.userSelect = '';
            
            if (resizeAnimationFrameId) {
                cancelAnimationFrame(resizeAnimationFrameId);
                resizeAnimationFrameId = null;
            }
            
            // 更新 component 資料（只在縮放結束時更新一次，使用視覺縮放比例）
            const rect = element.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            const scale = canvasRect.width / 1280;
            
            component.w = rect.width / scale;
            component.h = rect.height / scale;
            component.x = (rect.left - canvasRect.left) / scale;
            component.y = (rect.top - canvasRect.top) / scale;
            
            // 文字類元件：同步儲存縮放後的 font size
            if (startFontSize != null && startW > 0 && startH > 0) {
                const scaleW = component.w / startW;
                const scaleH = component.h / startH;
                const scaleF = (scaleW + scaleH) / 2;
                const newFontSize = Math.max(8, Math.min(200, Math.round(startFontSize * scaleF * 10) / 10));
                component.style.fontSize = newFontSize + 'px';
            }
            
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
            updatePropertyPanel(component);
            scheduleSaveDraft();
        }
    });
}

// ============================================
// 選擇與屬性面板
// ============================================

function selectComponent(id) {
    selectedComponentId = id;
    
    // 更新視覺選中狀態
    document.querySelectorAll('.component').forEach(el => {
        el.classList.remove('selected');
    });
    const element = document.querySelector(`[data-component-id="${id}"]`);
    if (element) {
        element.classList.add('selected');
    }
    
    // 更新屬性面板
    const component = getComponent(id);
    updatePropertyPanel(component);
}

function deselectComponent() {
    selectedComponentId = null;
    document.querySelectorAll('.component').forEach(el => {
        el.classList.remove('selected');
    });
    updatePropertyPanel(null);
}

function updatePropertyPanel(component) {
    const panel = document.getElementById('property-panel');
    
    if (!component) {
        panel.innerHTML = '<p class="placeholder">請選擇元件以編輯屬性</p>';
        return;
    }
    
    let html = '';
    
    const round2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : parseFloat(v) || 0);
    html += `
        <div class="property-row">
            <div class="property-group property-group-short">
                <label>位置 X</label>
                <input type="number" id="prop-x" value="${round2(component.x)}" step="1">
            </div>
            <div class="property-group property-group-short">
                <label>位置 Y</label>
                <input type="number" id="prop-y" value="${round2(component.y)}" step="1">
            </div>
        </div>
        <div class="property-row">
            <div class="property-group property-group-short">
                <label>寬度</label>
                <input type="number" id="prop-w" value="${round2(component.w)}" step="1">
            </div>
            <div class="property-group property-group-short">
                <label>高度</label>
                <input type="number" id="prop-h" value="${round2(component.h)}" step="1">
            </div>
        </div>
        <div class="property-row property-row-buttons">
            <button class="btn btn-small btn-compact" id="btn-copy-component">複製元件</button>
            <button class="btn btn-small btn-compact" id="btn-delete-component">刪除元件</button>
        </div>
        <div class="property-row property-row-buttons">
            <button class="btn btn-small btn-compact" id="btn-layer-up" title="上移一圖層">上移圖層</button>
            <button class="btn btn-small btn-compact" id="btn-layer-down" title="下移一圖層">下移圖層</button>
        </div>
    `;
    
    // 根據類型顯示特定屬性
    switch (component.type) {
        case 'text':
            html += `
                <div class="property-group">
                    <label>文字內容</label>
                    <textarea id="prop-text">${component.props.text || ''}</textarea>
                </div>
                <div class="property-group">
                    <label>文字對齊</label>
                    <div class="text-align-buttons">
                        <button type="button" class="btn btn-small prop-textAlign ${(component.style.textAlign || 'left') === 'left' ? 'active' : ''}" data-align="left" title="靠左對齊">靠左</button>
                        <button type="button" class="btn btn-small prop-textAlign ${(component.style.textAlign || 'left') === 'center' ? 'active' : ''}" data-align="center" title="置中對齊">置中</button>
                        <button type="button" class="btn btn-small prop-textAlign ${(component.style.textAlign || 'left') === 'right' ? 'active' : ''}" data-align="right" title="靠右對齊">靠右</button>
                    </div>
                </div>
                <div class="property-group">
                    <label>字型</label>
                    <select id="prop-fontFamily">
                        <option value="'Iansui', 'Microsoft JhengHei', 'Noto Sans TC', 'PMingLiU', 'DFKai-SB', sans-serif">芫荽體</option>
                        <option value="'Noto Sans TC', 'Microsoft JhengHei', PMingLiU, sans-serif">Noto Sans TC</option>
                        <option value="'Microsoft JhengHei', PMingLiU, sans-serif">微軟正黑體</option>
                        <option value="PMingLiU, 'Microsoft JhengHei', sans-serif">新細明體</option>
                        <option value="'DFKai-SB', KaiTi, serif">標楷體</option>
                        <option value="'Klee One', 'Noto Sans TC', sans-serif">Klee One</option>
                        <option value="'IBM Plex Sans JP', 'Noto Sans TC', sans-serif">IBM Plex Sans JP</option>
                        <option value="'Zen Maru Gothic', 'Noto Sans TC', sans-serif">Zen Maru Gothic</option>
                        <option value="'Zen Old Mincho', 'Noto Sans TC', serif">Zen Old Mincho</option>
                        <option value="'Yusei Magic', 'Noto Sans TC', sans-serif">Yusei Magic</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>字體大小</label>
                    <div class="font-size-control">
                        <button type="button" class="btn btn-font-minus" id="prop-fontSize-minus" title="縮小">−</button>
                        <input type="number" id="prop-fontSize" value="${parseInt(component.style.fontSize) || 24}" min="8" max="120">
                        <button type="button" class="btn btn-font-plus" id="prop-fontSize-plus" title="放大">+</button>
                    </div>
                </div>
                <div class="property-group">
                    <label>文字顏色</label>
                    <div class="color-input-group">
                        <input type="color" id="prop-color" value="${component.style.color || '#ffffff'}">
                        <input type="text" id="prop-color-text" value="${component.style.color || '#ffffff'}">
                    </div>
                </div>
                <div class="property-group">
                    <label>背景顏色</label>
                    <div class="color-input-group">
                        <input type="color" id="prop-bgColor" value="${component.style.backgroundColor || '#000000'}">
                        <input type="text" id="prop-bgColor-text" value="${component.style.backgroundColor || '#000000'}">
                    </div>
                </div>
                <div class="property-row property-row-radius-bold-underline">
                    <div class="property-group property-group-short">
                        <label>圓角</label>
                        <input type="number" id="prop-borderRadius" value="${parseInt(component.style.borderRadius) || 0}" class="input-half-width">
                    </div>
                    <div class="property-group property-group-inline">
                        <label><input type="checkbox" id="prop-fontWeight" ${(component.style.fontWeight === 'bold') ? 'checked' : ''}> 粗體</label>
                    </div>
                    <div class="property-group property-group-inline">
                        <label><input type="checkbox" id="prop-textDecoration" ${(component.style.textDecoration === 'underline') ? 'checked' : ''}> 底線</label>
                    </div>
                </div>
            `;
            break;
            
        case 'image':
            html += `
                <div class="property-group">
                    <label>圖片</label>
                    <button class="btn btn-secondary" id="btn-change-image">選擇圖片</button>
                </div>
                <div class="property-group">
                    <label>保持比例</label>
                    <input type="checkbox" id="prop-keepAspectRatio" ${component.props.keepAspectRatio ? 'checked' : ''}>
                </div>
            `;
            break;
            
        case 'link':
            html += `
                <div class="property-group">
                    <label>連結文字</label>
                    <input type="text" id="prop-link-text" value="${(component.props.text || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group">
                    <label>連結網址</label>
                    <input type="text" id="prop-link-url" value="${(component.props.url || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-link-showThumbnail" ${component.props.showThumbnail ? 'checked' : ''}> 顯示連結縮圖（如 Line 分享預覽）</label>
                </div>
                <div class="property-group prop-link-thumbnail-url-wrap">
                    <label>縮圖圖片網址</label>
                    <input type="text" id="prop-link-thumbnailUrl" placeholder="https://..." value="${(component.props.thumbnailUrl || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group prop-link-thumbnail-asset-wrap">
                    <label>或選擇上傳圖片為縮圖</label>
                    <button type="button" class="btn btn-small" id="prop-link-thumbnail-pick">選擇圖片</button>
                </div>
                <div class="property-group">
                    <label>字型</label>
                    <select id="prop-link-fontFamily">
                        <option value="'Iansui', 'Microsoft JhengHei', 'Noto Sans TC', 'PMingLiU', 'DFKai-SB', sans-serif">芫荽體</option>
                        <option value="'Noto Sans TC', 'Microsoft JhengHei', PMingLiU, sans-serif">Noto Sans TC</option>
                        <option value="'Microsoft JhengHei', PMingLiU, sans-serif">微軟正黑體</option>
                        <option value="PMingLiU, 'Microsoft JhengHei', sans-serif">新細明體</option>
                        <option value="'DFKai-SB', KaiTi, serif">標楷體</option>
                        <option value="'Klee One', 'Noto Sans TC', sans-serif">Klee One</option>
                        <option value="'IBM Plex Sans JP', 'Noto Sans TC', sans-serif">IBM Plex Sans JP</option>
                        <option value="'Zen Maru Gothic', 'Noto Sans TC', sans-serif">Zen Maru Gothic</option>
                        <option value="'Zen Old Mincho', 'Noto Sans TC', serif">Zen Old Mincho</option>
                        <option value="'Yusei Magic', 'Noto Sans TC', sans-serif">Yusei Magic</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>字體大小</label>
                    <div class="font-size-control">
                        <button type="button" class="btn btn-font-minus" id="prop-link-fontSize-minus" title="縮小">−</button>
                        <input type="number" id="prop-link-fontSize" value="${parseInt(component.style.fontSize) || 16}" min="8" max="120">
                        <button type="button" class="btn btn-font-plus" id="prop-link-fontSize-plus" title="放大">+</button>
                    </div>
                </div>
                <div class="property-group">
                    <label>顏色</label>
                    <div class="color-input-group">
                        <input type="color" id="prop-link-color" value="${component.style.color || '#000000'}">
                        <input type="text" id="prop-link-color-text" value="${component.style.color || '#000000'}">
                    </div>
                </div>
                <div class="property-group">
                    <label>文字對齊</label>
                    <div class="text-align-buttons">
                        <button type="button" class="btn btn-small prop-link-textAlign ${(component.style.textAlign || 'left') === 'left' ? 'active' : ''}" data-align="left" title="靠左對齊">靠左</button>
                        <button type="button" class="btn btn-small prop-link-textAlign ${(component.style.textAlign || 'left') === 'center' ? 'active' : ''}" data-align="center" title="置中對齊">置中</button>
                        <button type="button" class="btn btn-small prop-link-textAlign ${(component.style.textAlign || 'left') === 'right' ? 'active' : ''}" data-align="right" title="靠右對齊">靠右</button>
                    </div>
                </div>
            `;
            break;

        case 'embed':
            html += `
                <div class="property-group">
                    <label>內嵌網址</label>
                    <input type="text" id="prop-embed-url" placeholder="https://..." value="${(component.props.url || '').replace(/"/g, '&quot;')}">
                </div>
                <p class="property-hint">支援可被 iframe 內嵌的網頁，部分網站可能因 X-Frame-Options 無法內嵌。</p>
            `;
            break;

        case 'table': {
            const rows = Math.max(1, parseInt(component.props.rows, 10) || 3);
            const cols = Math.max(1, parseInt(component.props.cols, 10) || 4);
            const cells = component.props.cells || [];
            // 網格編輯：每格一個輸入框，Tab 鍵可在儲存格間移動
            const gridRowsHtml = Array.from({ length: rows }, (_, r) => {
                const rowCells = Array.from({ length: cols }, (_, c) => {
                    const val = (cells[r] && cells[r][c] !== undefined) ? String(cells[r][c]) : '';
                    const escaped = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
                    return `<td><input type="text" class="table-cell-input" data-row="${r}" data-col="${c}" value="${escaped}" placeholder=""></td>`;
                }).join('');
                return `<tr>${rowCells}</tr>`;
            }).join('');
            html += `
                <div class="property-row property-row-short">
                    <div class="property-group property-group-short">
                        <label>列數</label>
                        <input type="number" id="prop-table-rows" value="${rows}" min="1" max="20">
                    </div>
                    <div class="property-group property-group-short">
                        <label>欄數</label>
                        <input type="number" id="prop-table-cols" value="${cols}" min="1" max="10">
                    </div>
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-table-headerRow" ${component.props.headerRow !== false ? 'checked' : ''}> 第一列為表頭</label>
                </div>
                <div class="property-group" id="prop-table-cells-wrap">
                    <label>儲存格內容（可用 Tab 鍵切換到下一格）</label>
                    <div class="table-cells-editor-wrap">
                        <table class="table-editor-grid">
                            <tbody>${gridRowsHtml}</tbody>
                        </table>
                    </div>
                </div>
            `;
            break;
        }
            
        case 'code':
            const langVal = (component.props.language || 'javascript').toLowerCase();
            html += `
                <div class="property-group">
                    <label>程式碼</label>
                    <textarea id="prop-code" style="font-family: monospace;">${component.props.code || ''}</textarea>
                </div>
                <div class="property-group">
                    <label>語言（用於語法標示）</label>
                    <select id="prop-language">
                        <option value="javascript" ${langVal === 'javascript' ? 'selected' : ''}>JavaScript</option>
                        <option value="typescript" ${langVal === 'typescript' ? 'selected' : ''}>TypeScript</option>
                        <option value="python" ${langVal === 'python' ? 'selected' : ''}>Python</option>
                        <option value="html" ${langVal === 'html' ? 'selected' : ''}>HTML</option>
                        <option value="css" ${langVal === 'css' ? 'selected' : ''}>CSS</option>
                        <option value="json" ${langVal === 'json' ? 'selected' : ''}>JSON</option>
                        <option value="xml" ${langVal === 'xml' ? 'selected' : ''}>XML</option>
                        <option value="bash" ${langVal === 'bash' ? 'selected' : ''}>Bash</option>
                        <option value="plaintext" ${langVal === 'plaintext' ? 'selected' : ''}>純文字</option>
                    </select>
                </div>
            `;
            break;
            
        case 'quiz-single':
            const optsSingle = component.props.options || [];
            const correctSingle = Math.max(1, Math.min((component.props.correctIndex || 1), optsSingle.length || 1));
            html += `
                <div class="property-group">
                    <label>問題</label>
                    <input type="text" id="prop-question" value="${component.props.question || ''}">
                </div>
                <div class="property-group">
                    <label>選項（每行一個）</label>
                    <textarea id="prop-options">${optsSingle.join('\n')}</textarea>
                </div>
                <div class="property-group">
                    <label>正確答案（選一個）</label>
                    <div id="prop-correct-single-wrap" class="correct-answer-wrap">
                        ${optsSingle.map((opt, idx) => `<label class="correct-option-row"><input type="radio" name="prop-correct-single" value="${idx + 1}" ${(idx + 1) === correctSingle ? 'checked' : ''}> ${opt || `選項 ${idx + 1}`}</label>`).join('')}
                        ${optsSingle.length === 0 ? '<span class="hint">請先輸入選項</span>' : ''}
                    </div>
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-showCorrectAnswer" ${component.props.showCorrectAnswer !== false ? 'checked' : ''}> 顯示正確解答</label>
                </div>
            `;
            break;
            
        case 'drag-order': {
            const dragLayout = component.props.layout || 'list';
            html += `
                <div class="property-group">
                    <label>版面</label>
                    <select id="prop-drag-layout">
                        <option value="list" ${dragLayout === 'list' ? 'selected' : ''}>列表內拖曳排序</option>
                        <option value="slots" ${dragLayout === 'slots' ? 'selected' : ''}>左側拖到右側格位</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>問題</label>
                    <input type="text" id="prop-drag-question" value="${(component.props.question || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group">
                    <label>項目（每行一個）</label>
                    <textarea id="prop-drag-items">${(component.props.items || []).join('\n')}</textarea>
                </div>
                <div class="property-group">
                    <label>正確順序（用逗號分隔項目編號，例如：1,2,3）</label>
                    <input type="text" id="prop-correctOrder" value="${(component.props.correctOrder || []).join(',')}">
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-drag-showCorrectAnswer" ${component.props.showCorrectAnswer !== false ? 'checked' : ''}> 顯示正確解答</label>
                </div>
            `;
            break;
        }
            
        case 'quiz-multiple':
            const optsMulti = component.props.options || [];
            const correctMulti = component.props.correctIndices || [0, 1];
            html += `
                <div class="property-group">
                    <label>問題</label>
                    <input type="text" id="prop-multi-question" value="${component.props.question || ''}">
                </div>
                <div class="property-group">
                    <label>選項（每行一個）</label>
                    <textarea id="prop-multi-options">${optsMulti.join('\n')}</textarea>
                </div>
                <div class="property-group">
                    <label>正確選項（至少勾選 2 個）</label>
                    <div id="prop-correct-multi-wrap" class="correct-answer-wrap">
                        ${optsMulti.map((opt, idx) => `<label class="correct-option-row"><input type="checkbox" class="prop-correct-multi" value="${idx}" ${correctMulti.includes(idx) ? 'checked' : ''}> ${opt || `選項 ${idx + 1}`}</label>`).join('')}
                        ${optsMulti.length === 0 ? '<span class="hint">請先輸入選項</span>' : ''}
                        <span class="hint hint-multi" style="display:${optsMulti.length > 0 && correctMulti.length < 2 ? 'block' : 'none'}">至少需勾選 2 個正確選項</span>
                    </div>
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-multi-showCorrectAnswer" ${component.props.showCorrectAnswer !== false ? 'checked' : ''}> 顯示正確解答</label>
                </div>
            `;
            break;

        case 'video':
            html += `
                <div class="property-group">
                    <label>來源</label>
                    <select id="prop-video-source">
                        <option value="url" ${(component.props.source || 'url') === 'url' ? 'selected' : ''}>YouTube / 網址</option>
                        <option value="asset" ${component.props.source === 'asset' ? 'selected' : ''}>上傳影片</option>
                    </select>
                </div>
                <div class="property-group prop-video-url-wrap">
                    <label>影片網址（YouTube / 一般）</label>
                    <input type="text" id="prop-video-url" placeholder="https://..." value="${(component.props.url || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group prop-video-asset-wrap" style="display:${component.props.source === 'asset' ? 'block' : 'none'}">
                    <label>影片檔案</label>
                    <button type="button" class="btn btn-small" id="prop-video-pick">選擇影片</button>
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-video-autoplay" ${component.props.autoplay ? 'checked' : ''}> 自動播放</label>
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-video-muted" ${component.props.muted !== false ? 'checked' : ''}> 靜音（建議勾選以利自動播放）</label>
                </div>
            `;
            break;
        case 'list':
            html += `
                <div class="property-group">
                    <label>列表樣式</label>
                    <select id="prop-list-type">
                        <option value="bullet" ${(component.props.listType || 'bullet') === 'bullet' ? 'selected' : ''}>項目符號</option>
                        <option value="numbered" ${component.props.listType === 'numbered' ? 'selected' : ''}>編號</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>項目（每行一個）</label>
                    <textarea id="prop-list-items" rows="6">${(component.props.items || []).join('\n')}</textarea>
                </div>
            `;
            break;
        case 'fill-blank':
            html += `
                <div class="property-group">
                    <label>題目（底線 _____ 代表填空處）</label>
                    <input type="text" id="prop-fill-question" value="${(component.props.question || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group">
                    <label>正確答案（多個填空用逗號分隔）</label>
                    <input type="text" id="prop-fill-answers" value="${(component.props.answers || []).join(', ').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-fill-showCorrectAnswer" ${component.props.showCorrectAnswer !== false ? 'checked' : ''}> 顯示正確解答</label>
                </div>
            `;
            break;
        case 'chart':
            html += `
                <div class="property-group">
                    <label>圖表類型</label>
                    <select id="prop-chart-type">
                        <option value="bar" ${(component.props.chartType || 'bar') === 'bar' ? 'selected' : ''}>長條圖</option>
                        <option value="pie" ${component.props.chartType === 'pie' ? 'selected' : ''}>圓餅圖</option>
                        <option value="line" ${component.props.chartType === 'line' ? 'selected' : ''}>折線圖</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>標籤（逗號分隔）</label>
                    <input type="text" id="prop-chart-labels" value="${(component.props.labels || []).join(', ').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group">
                    <label>數值（逗號分隔）</label>
                    <input type="text" id="prop-chart-values" value="${(component.props.values || []).join(', ').replace(/"/g, '&quot;')}">
                </div>
            `;
            break;
        case 'matching':
            html += `
                <div class="property-group">
                    <label>題目</label>
                    <input type="text" id="prop-matching-question" value="${(component.props.question || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group">
                    <label>左側項目（每行一個）</label>
                    <textarea id="prop-matching-left">${(component.props.leftItems || []).join('\n')}</textarea>
                </div>
                <div class="property-group">
                    <label>右側項目（每行一個，順序須與正確配對一致）</label>
                    <textarea id="prop-matching-right">${(component.props.rightItems || []).join('\n')}</textarea>
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-matching-showCorrectAnswer" ${component.props.showCorrectAnswer !== false ? 'checked' : ''}> 顯示正確解答</label>
                </div>
            `;
            break;
        case 'shape':
            html += `
                <div class="property-group">
                    <label>形狀</label>
                    <select id="prop-shape-type">
                        <option value="rect" ${(component.props.shapeType || 'rect') === 'rect' ? 'selected' : ''}>矩形</option>
                        <option value="circle" ${component.props.shapeType === 'circle' ? 'selected' : ''}>圓形</option>
                        <option value="arrow" ${component.props.shapeType === 'arrow' ? 'selected' : ''}>箭頭</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>填滿顏色</label>
                    <div class="color-input-group">
                        <input type="color" id="prop-shape-fill" value="${component.props.fill || '#3B82F6'}">
                        <input type="text" id="prop-shape-fill-text" value="${component.props.fill || '#3B82F6'}">
                    </div>
                </div>
                <div class="property-group">
                    <label>邊框顏色</label>
                    <input type="text" id="prop-shape-stroke" value="${(component.props.stroke || '').replace(/"/g, '&quot;')}" placeholder="留空則無邊框">
                </div>
                <div class="property-group">
                    <label>邊框粗細</label>
                    <input type="number" id="prop-shape-strokeWidth" value="${component.props.strokeWidth != null ? component.props.strokeWidth : 2}" min="0">
                </div>
            `;
            break;
        case 'progress':
            html += `
                <div class="property-group">
                    <label>標籤文字</label>
                    <input type="text" id="prop-progress-label" value="${(component.props.label || '步驟').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-row property-row-short">
                    <div class="property-group property-group-short">
                        <label>目前</label>
                        <input type="number" id="prop-progress-current" value="${component.props.current != null ? component.props.current : 2}" min="0">
                    </div>
                    <div class="property-group property-group-short">
                        <label>總計</label>
                        <input type="number" id="prop-progress-total" value="${component.props.total || 5}" min="1">
                    </div>
                </div>
            `;
            break;
        case 'audio':
            html += `
                <div class="property-group">
                    <label>音訊網址</label>
                    <input type="text" id="prop-audio-url" placeholder="https://..." value="${(component.props.url || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group">
                    <label>或上傳音檔</label>
                    <button type="button" class="btn btn-small" id="prop-audio-pick">選擇音檔</button>
                </div>
            `;
            break;
        case 'timeline':
            html += `
                <div class="property-group">
                    <label>事件（每行一則，格式：日期|標題，例如 2024-01|第一季）</label>
                    <textarea id="prop-timeline-events" rows="8">${(component.props.events || []).map(e => `${e.date || ''}|${e.label || ''}`).join('\n')}</textarea>
                </div>
            `;
            break;
        case 'collapsible':
            const collTitleFs = component.props.titleFontSize != null ? component.props.titleFontSize : 18;
            const collContentFs = component.props.contentFontSize != null ? component.props.contentFontSize : 16;
            const collContentVal = (component.props.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            html += `
                <div class="property-group">
                    <label>標題（可點擊展開）</label>
                    <input type="text" id="prop-collapsible-title" value="${(component.props.title || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="property-group">
                    <label>標題字體大小</label>
                    <input type="number" id="prop-collapsible-titleFontSize" value="${collTitleFs}" min="12" max="72">
                </div>
                <div class="property-group">
                    <label>內容（Enter 換行會保留顯示）</label>
                    <textarea id="prop-collapsible-content" rows="5" placeholder="多行輸入，換行會如實顯示">${collContentVal}</textarea>
                </div>
                <div class="property-group">
                    <label>內容字體大小</label>
                    <input type="number" id="prop-collapsible-contentFontSize" value="${collContentFs}" min="12" max="48">
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-collapsible-defaultOpen" ${component.props.defaultOpen ? 'checked' : ''}> 預設展開</label>
                </div>
            `;
            break;
        case 'timer':
            html += `
                <div class="property-group">
                    <label>計時器名稱（顯示在時間上方）</label>
                    <input type="text" id="prop-timer-label" value="${(component.props.label || '').replace(/"/g, '&quot;')}" placeholder="例如：限時作答">
                </div>
                <div class="property-group">
                    <label>模式</label>
                    <select id="prop-timer-mode">
                        <option value="countdown" ${(component.props.mode || 'countdown') === 'countdown' ? 'selected' : ''}>倒數</option>
                        <option value="stopwatch" ${component.props.mode === 'stopwatch' ? 'selected' : ''}>碼表</option>
                    </select>
                </div>
                <div class="property-group prop-timer-countdown-wrap">
                    <label>倒數秒數</label>
                    <input type="number" id="prop-timer-countdownSeconds" value="${component.props.countdownSeconds != null ? component.props.countdownSeconds : 60}" min="1">
                </div>
                <div class="property-group">
                    <label>時間數字字體大小</label>
                    <input type="number" id="prop-timer-timeFontSize" value="${component.props.timeFontSize != null ? component.props.timeFontSize : 48}" min="24" max="120">
                </div>
                <div class="property-group">
                    <label><input type="checkbox" id="prop-timer-showButtons" ${component.props.showButtons !== false ? 'checked' : ''}> 顯示開始/暫停按鈕</label>
                </div>
            `;
            break;
    }
    
    panel.innerHTML = html;
    
    // 綁定事件
    setupPropertyListeners(component);
}

function setupPropertyListeners(component) {
    const round2 = (v) => Math.round(parseFloat(v) * 100) / 100;
    document.getElementById('prop-x').addEventListener('input', (e) => {
        component.x = round2(e.target.value);
        updateComponentPosition(component.id);
    });
    document.getElementById('prop-y').addEventListener('input', (e) => {
        component.y = round2(e.target.value);
        updateComponentPosition(component.id);
    });
    document.getElementById('prop-w').addEventListener('input', (e) => {
        component.w = Math.max(10, round2(e.target.value));
        updateComponentSize(component.id);
    });
    document.getElementById('prop-h').addEventListener('input', (e) => {
        component.h = Math.max(10, round2(e.target.value));
        updateComponentSize(component.id);
    });
    
    document.getElementById('btn-copy-component').addEventListener('click', () => {
        duplicateComponent(component.id);
    });
    document.getElementById('btn-delete-component').addEventListener('click', () => {
        if (confirm('確定要刪除此元件嗎？')) {
            deleteComponent(component.id);
        }
    });
    const slide = getCurrentSlide();
    const compIndex = slide ? slide.components.findIndex(c => c.id === component.id) : -1;
    const compLen = slide ? slide.components.length : 0;
    const btnDown = document.getElementById('btn-layer-down');
    const btnUp = document.getElementById('btn-layer-up');
    if (btnDown) {
        btnDown.disabled = compIndex <= 0;
        btnDown.addEventListener('click', () => moveComponentLayer(component.id, 'down'));
    }
    if (btnUp) {
        btnUp.disabled = compIndex < 0 || compIndex >= compLen - 1;
        btnUp.addEventListener('click', () => moveComponentLayer(component.id, 'up'));
    }
    
    // 根據類型綁定特定事件
    switch (component.type) {
        case 'text': {
            const fontFamilySelect = document.getElementById('prop-fontFamily');
            if (fontFamilySelect) fontFamilySelect.value = component.style.fontFamily || "'Iansui', 'Microsoft JhengHei', 'Noto Sans TC', 'PMingLiU', 'DFKai-SB', sans-serif";
            document.getElementById('prop-text').addEventListener('input', (e) => {
                updateComponentProps(component.id, { text: e.target.value });
                const element = document.querySelector(`[data-component-id="${component.id}"]`);
                if (element) element.textContent = e.target.value;
            });
            document.getElementById('prop-fontFamily').addEventListener('change', (e) => {
                component.style.fontFamily = e.target.value;
                updateComponentStyle(component.id);
            });
            const updateTextFontSize = (px) => {
                px = Math.max(8, Math.min(120, px));
                component.style.fontSize = px + 'px';
                const input = document.getElementById('prop-fontSize');
                if (input) input.value = px;
                updateComponentStyle(component.id);
            };
            document.getElementById('prop-fontSize').addEventListener('input', (e) => {
                updateTextFontSize(parseInt(e.target.value, 10) || 24);
            });
            document.getElementById('prop-fontSize-minus').addEventListener('click', () => {
                const cur = parseInt(document.getElementById('prop-fontSize').value, 10) || 24;
                updateTextFontSize(cur - 2);
            });
            document.getElementById('prop-fontSize-plus').addEventListener('click', () => {
                const cur = parseInt(document.getElementById('prop-fontSize').value, 10) || 24;
                updateTextFontSize(cur + 2);
            });
            document.getElementById('prop-color').addEventListener('input', (e) => {
                component.style.color = e.target.value;
                document.getElementById('prop-color-text').value = e.target.value;
                updateComponentStyle(component.id);
            });
            document.getElementById('prop-color-text').addEventListener('input', (e) => {
                component.style.color = e.target.value;
                document.getElementById('prop-color').value = e.target.value;
                updateComponentStyle(component.id);
            });
            document.getElementById('prop-bgColor').addEventListener('input', (e) => {
                component.style.backgroundColor = e.target.value;
                document.getElementById('prop-bgColor-text').value = e.target.value;
                updateComponentStyle(component.id);
            });
            document.getElementById('prop-bgColor-text').addEventListener('input', (e) => {
                component.style.backgroundColor = e.target.value;
                document.getElementById('prop-bgColor').value = e.target.value;
                updateComponentStyle(component.id);
            });
            document.getElementById('prop-borderRadius').addEventListener('input', (e) => {
                component.style.borderRadius = (parseInt(e.target.value) || 0) + 'px';
                updateComponentStyle(component.id);
            });
            document.getElementById('prop-fontWeight').addEventListener('change', (e) => {
                component.style.fontWeight = e.target.checked ? 'bold' : 'normal';
                updateComponentStyle(component.id);
            });
            document.getElementById('prop-textDecoration').addEventListener('change', (e) => {
                component.style.textDecoration = e.target.checked ? 'underline' : 'none';
                updateComponentStyle(component.id);
            });
            document.querySelectorAll('.prop-textAlign').forEach(btn => {
                btn.addEventListener('click', () => {
                    component.style.textAlign = btn.dataset.align;
                    updateComponentStyle(component.id);
                    document.querySelectorAll('.prop-textAlign').forEach(b => b.classList.toggle('active', b.dataset.align === btn.dataset.align));
                });
            });
            }
            break;
            
        case 'image':
            document.getElementById('btn-change-image').addEventListener('click', () => {
                document.getElementById('file-image').click();
            });
            document.getElementById('prop-keepAspectRatio').addEventListener('change', (e) => {
                updateComponentProps(component.id, { keepAspectRatio: e.target.checked });
            });
            break;
            
        case 'link': {
            const linkFontSelect = document.getElementById('prop-link-fontFamily');
            if (linkFontSelect) linkFontSelect.value = component.style.fontFamily || "'Iansui', 'Microsoft JhengHei', 'Noto Sans TC', 'PMingLiU', 'DFKai-SB', sans-serif";
            document.getElementById('prop-link-text').addEventListener('input', (e) => {
                updateComponentProps(component.id, { text: e.target.value });
                renderCanvas();
            });
            document.getElementById('prop-link-url').addEventListener('input', (e) => {
                updateComponentProps(component.id, { url: e.target.value });
                renderCanvas();
            });
            document.getElementById('prop-link-showThumbnail').addEventListener('change', (e) => {
                updateComponentProps(component.id, { showThumbnail: e.target.checked });
                renderCanvas();
            });
            document.getElementById('prop-link-thumbnailUrl').addEventListener('input', (e) => {
                updateComponentProps(component.id, { thumbnailUrl: e.target.value.trim(), thumbnailAssetId: null });
                renderCanvas();
            });
            const thumbPick = document.getElementById('prop-link-thumbnail-pick');
            if (thumbPick) thumbPick.addEventListener('click', () => document.getElementById('file-link-thumbnail').click());
            document.getElementById('prop-link-fontFamily').addEventListener('change', (e) => {
                updateComponentStyleProp(component.id, 'fontFamily', e.target.value);
                renderCanvas();
            });
            const updateLinkFontSize = (px) => {
                px = Math.max(8, Math.min(120, px));
                component.style.fontSize = px + 'px';
                const input = document.getElementById('prop-link-fontSize');
                if (input) input.value = px;
                updateComponentStyle(component.id);
                renderCanvas();
            };
            document.getElementById('prop-link-fontSize').addEventListener('input', (e) => {
                updateLinkFontSize(parseInt(e.target.value, 10) || 16);
            });
            document.getElementById('prop-link-fontSize-minus').addEventListener('click', () => {
                const cur = parseInt(document.getElementById('prop-link-fontSize').value, 10) || 16;
                updateLinkFontSize(cur - 2);
            });
            document.getElementById('prop-link-fontSize-plus').addEventListener('click', () => {
                const cur = parseInt(document.getElementById('prop-link-fontSize').value, 10) || 16;
                updateLinkFontSize(cur + 2);
            });
            document.getElementById('prop-link-color').addEventListener('input', (e) => {
                updateComponentStyleProp(component.id, 'color', e.target.value);
                document.getElementById('prop-link-color-text').value = e.target.value;
                renderCanvas();
            });
            document.getElementById('prop-link-color-text').addEventListener('input', (e) => {
                updateComponentStyleProp(component.id, 'color', e.target.value);
                document.getElementById('prop-link-color').value = e.target.value;
                renderCanvas();
            });
            document.querySelectorAll('.prop-link-textAlign').forEach(btn => {
                btn.addEventListener('click', () => {
                    updateComponentStyleProp(component.id, 'textAlign', btn.dataset.align);
                    document.querySelectorAll('.prop-link-textAlign').forEach(b => b.classList.toggle('active', b.dataset.align === btn.dataset.align));
                    renderCanvas();
                });
            });
            }
            break;

        case 'embed':
            document.getElementById('prop-embed-url').addEventListener('input', (e) => {
                updateComponentProps(component.id, { url: e.target.value.trim() });
                renderCanvas();
            });
            break;

        case 'table': {
            const rowsCount = Math.max(1, parseInt(component.props.rows, 10) || 3);
            const colsCount = Math.max(1, parseInt(component.props.cols, 10) || 4);

            document.getElementById('prop-table-rows').addEventListener('input', (e) => {
                const r = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1));
                const cols = Math.max(1, parseInt(component.props.cols, 10) || 4);
                const cells = component.props.cells || [];
                const newCells = resizeTableCells(cells, r, cols);
                updateComponentProps(component.id, { rows: r, cells: newCells });
                renderCanvas();
                const updated = getComponent(component.id);
                if (updated) showPropertyPanel(updated);
            });
            document.getElementById('prop-table-cols').addEventListener('input', (e) => {
                const c = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
                const rows = Math.max(1, parseInt(component.props.rows, 10) || 3);
                const cells = component.props.cells || [];
                const newCells = resizeTableCells(cells, rows, c);
                updateComponentProps(component.id, { cols: c, cells: newCells });
                renderCanvas();
                const updated = getComponent(component.id);
                if (updated) showPropertyPanel(updated);
            });
            document.getElementById('prop-table-headerRow').addEventListener('change', (e) => {
                updateComponentProps(component.id, { headerRow: e.target.checked });
                renderCanvas();
            });

            const cellsWrap = document.getElementById('prop-table-cells-wrap');
            if (cellsWrap) {
                // 從網格收集所有儲存格內容並更新元件
                function syncTableCellsFromGrid() {
                    const table = cellsWrap.querySelector('.table-editor-grid');
                    if (!table) return;
                    const trs = table.querySelectorAll('tbody tr');
                    const newCells = Array.from(trs).map(tr =>
                        Array.from(tr.querySelectorAll('.table-cell-input')).map(inp => inp.value)
                    );
                    updateComponentProps(component.id, { cells: newCells });
                    renderCanvas();
                }
                cellsWrap.addEventListener('input', (e) => {
                    if (e.target.classList.contains('table-cell-input')) syncTableCellsFromGrid();
                });
                // Tab：在儲存格間移動焦點，不離開表單
                cellsWrap.addEventListener('keydown', (e) => {
                    if (e.target.classList.contains('table-cell-input') && e.key === 'Tab') {
                        const inputs = Array.from(cellsWrap.querySelectorAll('.table-cell-input'));
                        const idx = inputs.indexOf(e.target);
                        if (idx === -1) return;
                        const next = e.shiftKey ? inputs[idx - 1] : inputs[idx + 1];
                        if (next) {
                            e.preventDefault();
                            next.focus();
                        }
                    }
                });
            }
            break;
        }
            
        case 'code':
            document.getElementById('prop-code').addEventListener('input', (e) => {
                updateComponentProps(component.id, { code: e.target.value });
                renderCanvas();
            });
            document.getElementById('prop-language').addEventListener('change', (e) => {
                updateComponentProps(component.id, { language: e.target.value });
                renderCanvas();
            });
            break;
            
        case 'quiz-single':
            document.getElementById('prop-question').addEventListener('input', (e) => {
                updateComponentProps(component.id, { question: e.target.value });
                renderCanvas();
            });
            document.getElementById('prop-options').addEventListener('input', (e) => {
                const options = e.target.value.split('\n').filter(o => o.trim());
                updateComponentProps(component.id, { options });
                renderCanvas();
                showPropertyPanel(component);
            });
            document.querySelectorAll('input[name="prop-correct-single"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        updateComponentProps(component.id, { correctIndex: parseInt(e.target.value, 10) });
                        renderCanvas();
                    }
                });
            });
            document.getElementById('prop-showCorrectAnswer').addEventListener('change', (e) => {
                updateComponentProps(component.id, { showCorrectAnswer: e.target.checked });
                renderCanvas();
            });
            break;
            
        case 'drag-order':
            const propDragLayout = document.getElementById('prop-drag-layout');
            if (propDragLayout) {
                propDragLayout.addEventListener('change', (e) => {
                    updateComponentProps(component.id, { layout: e.target.value });
                    renderCanvas();
                });
            }
            document.getElementById('prop-drag-question').addEventListener('input', (e) => {
                updateComponentProps(component.id, { question: e.target.value });
                renderCanvas();
            });
            document.getElementById('prop-drag-items').addEventListener('input', (e) => {
                const items = e.target.value.split('\n').filter(i => i.trim());
                updateComponentProps(component.id, { items });
                renderCanvas();
            });
            document.getElementById('prop-correctOrder').addEventListener('input', (e) => {
                const order = e.target.value.split(',').map(n => {
                    const num = parseInt(n.trim());
                    return isNaN(num) ? null : Math.max(1, num);
                }).filter(n => n !== null);
                updateComponentProps(component.id, { correctOrder: order });
                renderCanvas();
            });
            document.getElementById('prop-drag-showCorrectAnswer').addEventListener('change', (e) => {
                updateComponentProps(component.id, { showCorrectAnswer: e.target.checked });
                renderCanvas();
            });
            break;
            
        case 'quiz-multiple':
            document.getElementById('prop-multi-question').addEventListener('input', (e) => {
                updateComponentProps(component.id, { question: e.target.value });
                renderCanvas();
            });
            document.getElementById('prop-multi-options').addEventListener('input', (e) => {
                const options = e.target.value.split('\n').filter(o => o.trim());
                updateComponentProps(component.id, { options });
                renderCanvas();
                showPropertyPanel(component);
            });
            const updateMultiCorrect = () => {
                const checked = Array.from(document.querySelectorAll('.prop-correct-multi:checked')).map(el => parseInt(el.value, 10));
                updateComponentProps(component.id, { correctIndices: checked });
                renderCanvas();
                const hint = document.querySelector('#prop-correct-multi-wrap .hint-multi');
                if (hint) hint.style.display = checked.length >= 2 ? 'none' : 'block';
            };
            document.querySelectorAll('.prop-correct-multi').forEach(cb => {
                cb.addEventListener('change', updateMultiCorrect);
            });
            const multiShowEl = document.getElementById('prop-multi-showCorrectAnswer');
            if (multiShowEl) {
                multiShowEl.addEventListener('change', (e) => {
                    updateComponentProps(component.id, { showCorrectAnswer: e.target.checked });
                    renderCanvas();
                });
            }
            break;

        case 'video':
            const propVideoSource = document.getElementById('prop-video-source');
            if (propVideoSource) {
                propVideoSource.addEventListener('change', (e) => {
                    const source = e.target.value;
                    updateComponentProps(component.id, { source });
                    const wrap = document.querySelector('.prop-video-asset-wrap');
                    if (wrap) wrap.style.display = source === 'asset' ? 'block' : 'none';
                    renderCanvas();
                });
            }
            const propVideoUrl = document.getElementById('prop-video-url');
            if (propVideoUrl) propVideoUrl.addEventListener('input', (e) => { updateComponentProps(component.id, { url: e.target.value.trim() }); renderCanvas(); });
            const propVideoPick = document.getElementById('prop-video-pick');
            if (propVideoPick) propVideoPick.addEventListener('click', () => document.getElementById('file-video') && document.getElementById('file-video').click());
            const propVideoAutoplay = document.getElementById('prop-video-autoplay');
            if (propVideoAutoplay) propVideoAutoplay.addEventListener('change', (e) => { updateComponentProps(component.id, { autoplay: e.target.checked }); renderCanvas(); });
            const propVideoMuted = document.getElementById('prop-video-muted');
            if (propVideoMuted) propVideoMuted.addEventListener('change', (e) => { updateComponentProps(component.id, { muted: e.target.checked }); renderCanvas(); });
            break;
        case 'list':
            const propListType = document.getElementById('prop-list-type');
            if (propListType) propListType.addEventListener('change', (e) => { updateComponentProps(component.id, { listType: e.target.value }); renderCanvas(); });
            const propListItems = document.getElementById('prop-list-items');
            if (propListItems) propListItems.addEventListener('input', (e) => { updateComponentProps(component.id, { items: e.target.value.split('\n').map(s => s.trim()) }); renderCanvas(); });
            break;
        case 'fill-blank':
            const propFillQ = document.getElementById('prop-fill-question');
            if (propFillQ) propFillQ.addEventListener('input', (e) => { updateComponentProps(component.id, { question: e.target.value }); renderCanvas(); });
            const propFillA = document.getElementById('prop-fill-answers');
            if (propFillA) propFillA.addEventListener('input', (e) => { updateComponentProps(component.id, { answers: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }); renderCanvas(); });
            const propFillShow = document.getElementById('prop-fill-showCorrectAnswer');
            if (propFillShow) propFillShow.addEventListener('change', (e) => { updateComponentProps(component.id, { showCorrectAnswer: e.target.checked }); renderCanvas(); });
            break;
        case 'chart':
            const propChartType = document.getElementById('prop-chart-type');
            if (propChartType) propChartType.addEventListener('change', (e) => { updateComponentProps(component.id, { chartType: e.target.value }); renderCanvas(); });
            const propChartLabels = document.getElementById('prop-chart-labels');
            if (propChartLabels) propChartLabels.addEventListener('input', (e) => { updateComponentProps(component.id, { labels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }); renderCanvas(); });
            const propChartValues = document.getElementById('prop-chart-values');
            if (propChartValues) propChartValues.addEventListener('input', (e) => { updateComponentProps(component.id, { values: e.target.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)) }); renderCanvas(); });
            break;
        case 'matching':
            const propMatchQ = document.getElementById('prop-matching-question');
            if (propMatchQ) propMatchQ.addEventListener('input', (e) => { updateComponentProps(component.id, { question: e.target.value }); renderCanvas(); });
            const propMatchLeft = document.getElementById('prop-matching-left');
            if (propMatchLeft) propMatchLeft.addEventListener('input', (e) => { updateComponentProps(component.id, { leftItems: e.target.value.split('\n').map(s => s.trim()) }); renderCanvas(); });
            const propMatchRight = document.getElementById('prop-matching-right');
            if (propMatchRight) propMatchRight.addEventListener('input', (e) => { updateComponentProps(component.id, { rightItems: e.target.value.split('\n').map(s => s.trim()) }); renderCanvas(); });
            const propMatchShow = document.getElementById('prop-matching-showCorrectAnswer');
            if (propMatchShow) propMatchShow.addEventListener('change', (e) => { updateComponentProps(component.id, { showCorrectAnswer: e.target.checked }); renderCanvas(); });
            break;
        case 'shape':
            const propShapeType = document.getElementById('prop-shape-type');
            if (propShapeType) propShapeType.addEventListener('change', (e) => { updateComponentProps(component.id, { shapeType: e.target.value }); renderCanvas(); });
            const propShapeFill = document.getElementById('prop-shape-fill');
            if (propShapeFill) propShapeFill.addEventListener('input', (e) => { updateComponentProps(component.id, { fill: e.target.value }); renderCanvas(); });
            const propShapeFillText = document.getElementById('prop-shape-fill-text');
            if (propShapeFillText) propShapeFillText.addEventListener('input', (e) => { updateComponentProps(component.id, { fill: e.target.value }); renderCanvas(); });
            const propShapeStroke = document.getElementById('prop-shape-stroke');
            if (propShapeStroke) propShapeStroke.addEventListener('input', (e) => { updateComponentProps(component.id, { stroke: e.target.value }); renderCanvas(); });
            const propShapeStrokeW = document.getElementById('prop-shape-strokeWidth');
            if (propShapeStrokeW) propShapeStrokeW.addEventListener('input', (e) => { updateComponentProps(component.id, { strokeWidth: Math.max(0, parseInt(e.target.value, 10) || 0) }); renderCanvas(); });
            break;
        case 'progress':
            const propProgressLabel = document.getElementById('prop-progress-label');
            if (propProgressLabel) propProgressLabel.addEventListener('input', (e) => { updateComponentProps(component.id, { label: e.target.value }); renderCanvas(); });
            const propProgressCur = document.getElementById('prop-progress-current');
            if (propProgressCur) propProgressCur.addEventListener('input', (e) => { updateComponentProps(component.id, { current: Math.max(0, parseInt(e.target.value, 10) || 0) }); renderCanvas(); });
            const propProgressTot = document.getElementById('prop-progress-total');
            if (propProgressTot) propProgressTot.addEventListener('input', (e) => { updateComponentProps(component.id, { total: Math.max(1, parseInt(e.target.value, 10) || 1) }); renderCanvas(); });
            break;
        case 'audio':
            const propAudioUrl = document.getElementById('prop-audio-url');
            if (propAudioUrl) propAudioUrl.addEventListener('input', (e) => { updateComponentProps(component.id, { url: e.target.value.trim() }); renderCanvas(); });
            const propAudioPick = document.getElementById('prop-audio-pick');
            if (propAudioPick) propAudioPick.addEventListener('click', () => document.getElementById('file-audio') && document.getElementById('file-audio').click());
            break;
        case 'timeline':
            const propTimelineEvents = document.getElementById('prop-timeline-events');
            if (propTimelineEvents) propTimelineEvents.addEventListener('input', (e) => {
                const events = e.target.value.split('\n').map(line => {
                    const parts = line.split('|').map(s => s.trim());
                    return { date: parts[0] || '', label: parts[1] || '' };
                }).filter(e => e.date || e.label);
                updateComponentProps(component.id, { events });
                renderCanvas();
            });
            break;
        case 'collapsible':
            const propCollTitle = document.getElementById('prop-collapsible-title');
            if (propCollTitle) propCollTitle.addEventListener('input', (e) => { updateComponentProps(component.id, { title: e.target.value }); renderCanvas(); });
            const propCollTitleFs = document.getElementById('prop-collapsible-titleFontSize');
            if (propCollTitleFs) propCollTitleFs.addEventListener('input', (e) => { updateComponentProps(component.id, { titleFontSize: Math.max(12, Math.min(72, parseInt(e.target.value, 10) || 18)) }); renderCanvas(); });
            const propCollContent = document.getElementById('prop-collapsible-content');
            if (propCollContent) propCollContent.addEventListener('input', (e) => { updateComponentProps(component.id, { content: e.target.value }); renderCanvas(); });
            const propCollContentFs = document.getElementById('prop-collapsible-contentFontSize');
            if (propCollContentFs) propCollContentFs.addEventListener('input', (e) => { updateComponentProps(component.id, { contentFontSize: Math.max(12, Math.min(48, parseInt(e.target.value, 10) || 16)) }); renderCanvas(); });
            const propCollOpen = document.getElementById('prop-collapsible-defaultOpen');
            if (propCollOpen) propCollOpen.addEventListener('change', (e) => { updateComponentProps(component.id, { defaultOpen: e.target.checked }); renderCanvas(); });
            break;
        case 'timer':
            const propTimerLabel = document.getElementById('prop-timer-label');
            if (propTimerLabel) propTimerLabel.addEventListener('input', (e) => { updateComponentProps(component.id, { label: e.target.value }); renderCanvas(); });
            const propTimerMode = document.getElementById('prop-timer-mode');
            if (propTimerMode) propTimerMode.addEventListener('change', (e) => { updateComponentProps(component.id, { mode: e.target.value }); renderCanvas(); });
            const propTimerSec = document.getElementById('prop-timer-countdownSeconds');
            if (propTimerSec) propTimerSec.addEventListener('input', (e) => { updateComponentProps(component.id, { countdownSeconds: Math.max(1, parseInt(e.target.value, 10) || 60) }); renderCanvas(); });
            const propTimerTimeFs = document.getElementById('prop-timer-timeFontSize');
            if (propTimerTimeFs) propTimerTimeFs.addEventListener('input', (e) => { updateComponentProps(component.id, { timeFontSize: Math.max(24, Math.min(120, parseInt(e.target.value, 10) || 48)) }); renderCanvas(); });
            const propTimerBtns = document.getElementById('prop-timer-showButtons');
            if (propTimerBtns) propTimerBtns.addEventListener('change', (e) => { updateComponentProps(component.id, { showButtons: e.target.checked }); renderCanvas(); });
            break;
    }
}

function updateComponentProps(id, props) {
    const component = getComponent(id);
    if (component) {
        component.props = { ...component.props, ...props };
        scheduleSaveDraft();
    }
}

function updateComponentStyleProp(id, styleProp, value) {
    const component = getComponent(id);
    if (component) {
        if (!component.style) component.style = {};
        component.style[styleProp] = value;
        scheduleSaveDraft();
    }
}

function updateComponentStyle(id) {
    const component = getComponent(id);
    if (!component) return;
    const element = document.querySelector(`[data-component-id="${id}"]`);
    if (element) {
        applyStyles(element, component.style);
    }
    scheduleSaveDraft();
}

function updateComponentPosition(id) {
    const component = getComponent(id);
    if (!component) return;
    const element = document.querySelector(`[data-component-id="${id}"]`);
    if (element) {
        element.style.left = component.x + 'px';
        element.style.top = component.y + 'px';
    }
    scheduleSaveDraft();
}

function updateComponentSize(id) {
    const component = getComponent(id);
    if (!component) return;
    const element = document.querySelector(`[data-component-id="${id}"]`);
    if (element) {
        element.style.width = component.w + 'px';
        element.style.height = component.h + 'px';
    }
    scheduleSaveDraft();
}

// ============================================
// 圖片上傳處理
// ============================================

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!selectedComponentId) {
        alert('請先選擇一個圖片元件');
        return;
    }
    
    const component = getComponent(selectedComponentId);
    if (!component || component.type !== 'image') {
        alert('請先選擇圖片元件');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        assets[assetId] = event.target.result;
        component.props.assetId = assetId;
        renderCanvas();
        scheduleSaveDraft();
    };
    reader.readAsDataURL(file);
}

function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!selectedComponentId) return;
    const component = getComponent(selectedComponentId);
    if (!component || component.type !== 'video') return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const assetId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        assets[assetId] = ev.target.result;
        updateComponentProps(component.id, { assetId, source: 'asset' });
        renderCanvas();
        scheduleSaveDraft();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function handleAudioUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!selectedComponentId) return;
    const component = getComponent(selectedComponentId);
    if (!component || component.type !== 'audio') return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const assetId = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        assets[assetId] = ev.target.result;
        updateComponentProps(component.id, { assetId });
        renderCanvas();
        scheduleSaveDraft();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

/** 依新列數／欄數調整表格 cells 二維陣列，不足補空字串 */
function resizeTableCells(cells, newRows, newCols) {
    const result = [];
    for (let r = 0; r < newRows; r++) {
        const row = [];
        const srcRow = cells[r];
        for (let c = 0; c < newCols; c++) {
            row.push(srcRow && srcRow[c] !== undefined ? String(srcRow[c]) : '');
        }
        result.push(row);
    }
    return result;
}

function handleLinkThumbnailUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!selectedComponentId) return;
    const component = getComponent(selectedComponentId);
    if (!component || component.type !== 'link') return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const assetId = `thumb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        assets[assetId] = event.target.result;
        updateComponentProps(component.id, { thumbnailAssetId: assetId, thumbnailUrl: '' });
        renderCanvas();
        scheduleSaveDraft();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// ============================================
// 章節與頁面管理
// ============================================

function getCurrentChapter() {
    return projectData.chapters.find(c => c.id === currentChapterId);
}

function getCurrentSlide() {
    const chapter = getCurrentChapter();
    if (!chapter) return null;
    return chapter.slides.find(s => s.id === currentSlideId);
}

function addChapter() {
    const chapterId = `ch${Date.now()}`;
    const slideId = `s${Date.now()}`;
    
    const newChapter = {
        id: chapterId,
        title: `第${projectData.chapters.length + 1}章`,
        slides: [
            {
                id: slideId,
                title: '第1頁',
                slideName: '',
                canvas: { w: 1280, h: 720 },
                background: { type: 'solid', value: '#F9F7F5' },
                components: []
            }
        ]
    };
    
    projectData.chapters.push(newChapter);
    currentChapterId = chapterId;
    currentSlideId = slideId;
    updateChapterSlideSelects();
    renderCanvas();
    scheduleSaveDraft();
}

function addSlide() {
    const chapter = getCurrentChapter();
    if (!chapter) return;
    
    const slideId = `s${Date.now()}`;
    const newSlide = {
        id: slideId,
        title: `第${chapter.slides.length + 1}頁`,
        slideName: '',
        canvas: { w: 1280, h: 720 },
        background: { type: 'solid', value: '#F9F7F5' },
        components: []
    };
    
    chapter.slides.push(newSlide);
    currentSlideId = slideId;
    updateChapterSlideSelects();
    renderCanvas();
    scheduleSaveDraft();
}

/** 刪除指定頁面（由縮圖右上角叉叉觸發；至少保留 1 頁） */
function deleteSlideByRef(chapter, slide) {
    if (!projectData || !chapter || !slide) return;
    const totalSlides = projectData.chapters.reduce((sum, ch) => sum + (ch.slides || []).length, 0);
    if (totalSlides <= 1) {
        alert('至少需保留一頁，無法刪除。');
        return;
    }
    if (!confirm('確定要刪除此頁面嗎？')) return;

    const slideIndex = chapter.slides.indexOf(slide);
    if (slideIndex < 0) return;
    const wasCurrent = chapter.id === currentChapterId && slide.id === currentSlideId;
    chapter.slides.splice(slideIndex, 1);

    if (chapter.slides.length === 0) {
        const chIndex = projectData.chapters.indexOf(chapter);
        projectData.chapters.splice(chIndex, 1);
        const nextChapter = projectData.chapters[Math.min(chIndex, projectData.chapters.length - 1)];
        if (nextChapter && nextChapter.slides.length > 0) {
            currentChapterId = nextChapter.id;
            currentSlideId = nextChapter.slides[0].id;
        }
    } else if (wasCurrent) {
        const nextIndex = Math.min(slideIndex, chapter.slides.length - 1);
        currentSlideId = chapter.slides[nextIndex].id;
    }
    updateChapterSlideSelects();
    renderThumbnails();
    renderCanvas();
    scheduleSaveDraft();
}

/** 依「全列表」順序取得某頁的全球索引（0-based） */
function getGlobalIndexBySlide(chapterId, slideId) {
    if (!projectData) return -1;
    let idx = 0;
    for (const ch of projectData.chapters) {
        for (const s of ch.slides || []) {
            if (ch.id === chapterId && s.id === slideId) return idx;
            idx++;
        }
    }
    return -1;
}

/** 依全球索引取得該位置的章節與該章內的索引 */
function getChapterAndIndexByGlobalIndex(globalIndex) {
    if (!projectData || globalIndex < 0) return null;
    let idx = 0;
    for (const ch of projectData.chapters) {
        const len = (ch.slides || []).length;
        for (let i = 0; i < len; i++) {
            if (idx === globalIndex) return { chapter: ch, indexInChapter: i };
            idx++;
        }
    }
    return null;
}

/** 從全列表中移除指定全球索引的頁面，並回傳該頁面物件 */
function removeSlideAtGlobalIndex(globalIndex) {
    const pos = getChapterAndIndexByGlobalIndex(globalIndex);
    if (!pos) return null;
    const slide = pos.chapter.slides.splice(pos.indexInChapter, 1)[0];
    if (pos.chapter.slides.length === 0) {
        const chIdx = projectData.chapters.indexOf(pos.chapter);
        projectData.chapters.splice(chIdx, 1);
    }
    return slide;
}

/** 在全列表的指定全球索引位置插入頁面（可跨章節） */
function insertSlideAtGlobalIndex(globalIndex, slide) {
    if (!projectData || !slide) return;
    if (projectData.chapters.length === 0) {
        projectData.chapters.push({ id: 'ch1', title: '第 1 章', slides: [slide] });
        return;
    }
    let idx = 0;
    for (let ci = 0; ci < projectData.chapters.length; ci++) {
        const ch = projectData.chapters[ci];
        const len = (ch.slides || []).length;
        for (let si = 0; si <= len; si++) {
            if (idx === globalIndex) {
                ch.slides.splice(si, 0, slide);
                return;
            }
            idx++;
        }
    }
    projectData.chapters[projectData.chapters.length - 1].slides.push(slide);
}

/** 將頁面從全列表的 fromGlobal 移到 toGlobal（拖曳或上/下移後呼叫） */
function moveSlideByGlobalIndex(fromGlobal, toGlobal) {
    if (fromGlobal === toGlobal) return;
    const slide = removeSlideAtGlobalIndex(fromGlobal);
    if (!slide) return;
    // 移除後，「目前列表」中要插入的全球索引就是 toGlobal（插入到該位置前）
    insertSlideAtGlobalIndex(toGlobal, slide);
    updateChapterSlideSelects();
    renderThumbnails();
    renderCanvas();
    scheduleSaveDraft();
}

function updateChapterSlideSelects() {
    const chapterSelect = document.getElementById('chapter-select');
    const slideSelect = document.getElementById('slide-select');
    const statsEl = document.getElementById('chapter-stats');
    
    if (statsEl && projectData) {
        const totalCh = projectData.chapters.length;
        const totalSl = projectData.chapters.reduce((sum, ch) => sum + (ch.slides ? ch.slides.length : 0), 0);
        statsEl.textContent = `共 ${totalCh} 章、${totalSl} 頁`;
    }
    chapterSelect.innerHTML = '';
    projectData.chapters.forEach(chapter => {
        const option = document.createElement('option');
        option.value = chapter.id;
        option.textContent = chapter.title;
        if (chapter.id === currentChapterId) option.selected = true;
        chapterSelect.appendChild(option);
    });
    
    const chapter = getCurrentChapter();
    slideSelect.innerHTML = '';
    if (chapter) {
        chapter.slides.forEach(slide => {
            const option = document.createElement('option');
            option.value = slide.id;
            option.textContent = slide.title;
            if (slide.id === currentSlideId) option.selected = true;
            slideSelect.appendChild(option);
        });
    }
    const slideNameInput = document.getElementById('slide-name-input');
    if (slideNameInput) {
        const slide = getCurrentSlide();
        slideNameInput.value = (slide && (slide.slideName || '')) || '';
    }
    renderThumbnails();
}

const THUMB_WIDTH = 140;
const THUMB_HEIGHT = 79;
const THUMB_SCALE = THUMB_WIDTH / 1280;

/** 元件類型對應左側按鈕圖示（與 editor.html 一致） */
const COMPONENT_TYPE_ICONS = {
    text: '📝',
    image: '🖼️',
    link: '🔗',
    embed: '🌐',
    table: '📋',
    code: '💻',
    'quiz-single': '❓',
    'quiz-multiple': '☑️',
    'drag-order': '↕️',
    video: '🎬',
    list: '📌',
    'fill-blank': '✏️',
    chart: '📊',
    matching: '🔀',
    shape: '⬛',
    progress: '📈',
    audio: '🔊',
    timeline: '📅',
    collapsible: '📂',
    timer: '⏱️',
    tipBox: '💡',
    cautionBox: '⚠️',
    alertBox: '🚨'
};

function getComponentIcon(comp) {
    if (comp.type === 'text' && comp.style && comp.style.backgroundColor) {
        const bg = (comp.style.backgroundColor || '').toLowerCase().replace(/\s/g, '');
        if (bg.includes('#d7f5dd') || bg.includes('d7f5dd')) return COMPONENT_TYPE_ICONS.tipBox;
        if (bg.includes('#fff2cc') || bg.includes('fff2cc')) return COMPONENT_TYPE_ICONS.cautionBox;
        if (bg.includes('#ffd6d6') || bg.includes('ffd6d6')) return COMPONENT_TYPE_ICONS.alertBox;
    }
    return COMPONENT_TYPE_ICONS[comp.type] || '▪️';
}

/** 為單一投影片建立即時預覽縮圖 DOM（含左上角膠囊章節-頁碼：名稱、元件圖示標籤） */
function buildThumbnailPreview(slide, chNum, slNum) {
    const wrap = document.createElement('div');
    wrap.className = 'thumbnail-preview-wrap';
    const bg = slide.background && slide.background.type === 'solid' ? slide.background.value : '#F9F7F5';
    wrap.style.backgroundColor = bg;
    wrap.style.width = THUMB_WIDTH + 'px';
    wrap.style.height = THUMB_HEIGHT + 'px';
    wrap.style.position = 'relative';
    wrap.style.overflow = 'hidden';
    wrap.style.borderRadius = '8px';

    const nameStr = (slide.slideName || '').trim();
    const pillLabel = nameStr
        ? `${chNum}-${slNum}：${nameStr.length > 5 ? nameStr.slice(0, 5) + '...' : nameStr}`
        : `${chNum}-${slNum}`;
    const pill = document.createElement('span');
    pill.className = 'thumbnail-pill';
    pill.textContent = pillLabel;
    wrap.appendChild(pill);

    const content = document.createElement('div');
    content.style.position = 'absolute';
    content.style.left = '0';
    content.style.top = '0';
    content.style.width = '1280px';
    content.style.height = '720px';
    content.style.transformOrigin = '0 0';
    content.style.transform = `scale(${THUMB_SCALE})`;
    content.style.pointerEvents = 'none';

    (slide.components || []).forEach(comp => {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = comp.x + 'px';
        el.style.top = comp.y + 'px';
        el.style.width = comp.w + 'px';
        el.style.height = comp.h + 'px';
        el.style.overflow = 'hidden';
        if (comp.type === 'text') {
            el.style.fontSize = '12px';
            el.style.lineHeight = '1.2';
            el.style.padding = '2px';
            el.style.wordBreak = 'break-word';
            el.textContent = (comp.props && comp.props.text) ? String(comp.props.text).slice(0, 80) : '';
            if (comp.style) {
                if (comp.style.backgroundColor) el.style.backgroundColor = comp.style.backgroundColor;
                if (comp.style.color) el.style.color = comp.style.color;
            }
        } else if (comp.type === 'image') {
            el.style.background = '#ddd';
            if (comp.props && comp.props.assetId && assets[comp.props.assetId]) {
                const img = document.createElement('img');
                img.src = assets[comp.props.assetId];
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'contain';
                el.appendChild(img);
            }
        } else {
            el.style.backgroundColor = 'rgba(0,0,0,0.06)';
            el.style.borderRadius = '2px';
        }
        content.appendChild(el);
    });

    (slide.components || []).forEach(comp => {
        const icon = getComponentIcon(comp);
        const badge = document.createElement('span');
        badge.className = 'thumbnail-component-badge';
        badge.textContent = icon;
        const right = (comp.x + comp.w) * THUMB_SCALE;
        const bottom = (comp.y + comp.h) * THUMB_SCALE;
        badge.style.position = 'absolute';
        badge.style.left = (right - 16) + 'px';
        badge.style.top = (bottom - 16) + 'px';
        badge.style.width = '14px';
        badge.style.height = '14px';
        badge.style.borderRadius = '50%';
        badge.style.background = 'rgba(255,255,255,0.95)';
        badge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.25)';
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.justifyContent = 'center';
        badge.style.fontSize = '9px';
        badge.style.lineHeight = '1';
        badge.style.pointerEvents = 'none';
        badge.style.zIndex = '3';
        wrap.appendChild(badge);
    });

    wrap.appendChild(content);
    return wrap;
}

function renderThumbnails() {
    const list = document.getElementById('thumbnail-list');
    if (!list || !projectData) return;
    list.innerHTML = '';
    const totalSlides = projectData.chapters.reduce((s, ch) => s + (ch.slides || []).length, 0);
    let globalIndex = 0;
    let chIndex = 0;
    projectData.chapters.forEach(chapter => {
        (chapter.slides || []).forEach((slide, slIndex) => {
            const curGlobal = globalIndex;
            const isFirst = curGlobal === 0;
            const isLast = curGlobal === totalSlides - 1;

            const item = document.createElement('div');
            item.className = 'thumbnail-item';
            item.dataset.chapterId = chapter.id;
            item.dataset.slideId = slide.id;
            item.dataset.globalIndex = String(curGlobal);
            if (chapter.id === currentChapterId && slide.id === currentSlideId) item.classList.add('active');

            const chNum = chIndex + 1;
            const slNum = slIndex + 1;
            const preview = buildThumbnailPreview(slide, chNum, slNum);

            const contentWrap = document.createElement('div');
            contentWrap.className = 'thumbnail-item-content';
            contentWrap.appendChild(preview);

            if (totalSlides > 1) {
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'thumbnail-delete-btn';
                delBtn.innerHTML = '×';
                delBtn.setAttribute('aria-label', '刪除此頁');
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    deleteSlideByRef(chapter, slide);
                });
                contentWrap.appendChild(delBtn);
            }

            const leftControls = document.createElement('div');
            leftControls.className = 'thumbnail-left-controls';

            const dragHandle = document.createElement('span');
            dragHandle.className = 'thumbnail-drag-handle';
            dragHandle.draggable = true;
            dragHandle.setAttribute('aria-label', '拖曳以調整順序');
            dragHandle.innerHTML = '⋮⋮';

            dragHandle.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.dropEffect = 'move';
                e.dataTransfer.setData('text/plain', `${chapter.id}:${slide.id}`);
                e.dataTransfer.setData('application/json', JSON.stringify({ chapterId: chapter.id, slideId: slide.id }));
                item.classList.add('thumbnail-dragging');
            });
            dragHandle.addEventListener('dragend', () => {
                list.querySelectorAll('.thumbnail-item').forEach(el => el.classList.remove('thumbnail-dragging', 'thumbnail-drag-over'));
            });

            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = 'thumbnail-move-btn thumbnail-move-up';
            upBtn.setAttribute('aria-label', '上移一頁');
            upBtn.innerHTML = '↑';
            upBtn.disabled = isFirst;
            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!isFirst) moveSlideByGlobalIndex(curGlobal, curGlobal - 1);
            });

            const downBtn = document.createElement('button');
            downBtn.type = 'button';
            downBtn.className = 'thumbnail-move-btn thumbnail-move-down';
            downBtn.setAttribute('aria-label', '下移一頁');
            downBtn.innerHTML = '↓';
            downBtn.disabled = isLast;
            downBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!isLast) moveSlideByGlobalIndex(curGlobal, curGlobal + 1);
            });

            leftControls.appendChild(dragHandle);
            leftControls.appendChild(upBtn);
            leftControls.appendChild(downBtn);

            item.appendChild(leftControls);
            item.appendChild(contentWrap);

            item.addEventListener('dragenter', (e) => {
                e.preventDefault();
                if (e.dataTransfer.types.includes('text/plain')) {
                    item.classList.add('thumbnail-drag-over');
                }
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('thumbnail-drag-over');
            });
            item.addEventListener('dragleave', (e) => {
                if (!item.contains(e.relatedTarget)) item.classList.remove('thumbnail-drag-over');
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                item.classList.remove('thumbnail-drag-over');
                const text = e.dataTransfer.getData('text/plain') || '';
                const [srcChapterId, srcSlideId] = text.split(':');
                if (!srcChapterId || !srcSlideId) return;
                const targetChapterId = item.dataset.chapterId;
                const targetSlideId = item.dataset.slideId;
                if (srcChapterId === targetChapterId && srcSlideId === targetSlideId) return;
                const fromGlobal = getGlobalIndexBySlide(srcChapterId, srcSlideId);
                const toGlobal = getGlobalIndexBySlide(targetChapterId, targetSlideId);
                if (fromGlobal !== -1 && toGlobal !== -1) {
                    moveSlideByGlobalIndex(fromGlobal, toGlobal);
                }
            });

            contentWrap.addEventListener('click', (e) => {
                if (e.target.closest('.thumbnail-delete-btn') || e.target.closest('.thumbnail-left-controls')) return;
                currentChapterId = chapter.id;
                currentSlideId = slide.id;
                const chapterSelect = document.getElementById('chapter-select');
                const slideSelect = document.getElementById('slide-select');
                if (chapterSelect) chapterSelect.value = chapter.id;
                if (slideSelect) slideSelect.value = slide.id;
                const slideNameInput = document.getElementById('slide-name-input');
                if (slideNameInput) slideNameInput.value = slide.slideName || '';
                list.querySelectorAll('.thumbnail-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                renderCanvas();
                deselectComponent();
            });

            list.appendChild(item);
            globalIndex++;
        });
        chIndex++;
    });
}

// ============================================
// 匯入匯出
// ============================================

async function exportProject() {
    try {
        const zip = new JSZip();
        
        normalizeProjectOrder(projectData);

        // 加入 project.json
        zip.file('project.json', JSON.stringify(projectData, null, 2));
        
        // 加入 assets
        const assetsFolder = zip.folder('assets');
        Object.keys(assets).forEach(assetId => {
            const base64Data = assets[assetId];
            let ext = 'png';
            if (base64Data.startsWith('data:image/jpeg')) ext = 'jpg';
            else if (base64Data.startsWith('data:image/png')) ext = 'png';
            else if (base64Data.startsWith('data:image/gif')) ext = 'gif';
            else if (base64Data.startsWith('data:image/webp')) ext = 'webp';
            else if (base64Data.startsWith('data:video/')) ext = base64Data.includes('webm') ? 'webm' : 'mp4';
            else if (base64Data.startsWith('data:audio/')) ext = base64Data.includes('ogg') ? 'ogg' : base64Data.includes('webm') ? 'weba' : 'mp3';
            const base64 = base64Data.split(',')[1];
            assetsFolder.file(`${assetId}.${ext}`, base64, { base64: true });
        });
        
        // 加入 meta.json
        const meta = {
            exportedAt: new Date().toISOString(),
            version: projectData.version
        };
        zip.file('meta.json', JSON.stringify(meta, null, 2));
        
        // 產生 zip 檔案
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectData.title || 'project'}.itslide`;
        a.click();
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('匯出失敗:', error);
        alert('匯出失敗：' + error.message);
    }
}

async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const zip = new JSZip();
        const zipData = await zip.loadAsync(file);
        
        // 讀取 project.json
        const projectJson = await zipData.file('project.json').async('string');
        projectData = JSON.parse(projectJson);
        if (!projectData.welcomePage) projectData.welcomePage = { backgroundImage: null, description: '' };
        normalizeProjectOrder(projectData);
        
        // 讀取 assets
        assets = {};
        const assetsFolder = zipData.folder('assets');
        if (assetsFolder) {
            // 使用 JSZip 的 forEach 方法正確遍歷檔案
            const assetPromises = [];
            assetsFolder.forEach((relativePath, file) => {
                if (!file.dir) {
                    assetPromises.push((async () => {
                        try {
                            const assetId = relativePath.replace(/\.[^/.]+$/, '');
                            const base64 = await file.async('base64');
                            let mimeType = 'image/png';
                            if (relativePath.endsWith('.jpg') || relativePath.endsWith('.jpeg')) mimeType = 'image/jpeg';
                            else if (relativePath.endsWith('.gif')) mimeType = 'image/gif';
                            else if (relativePath.endsWith('.webp')) mimeType = 'image/webp';
                            else if (relativePath.endsWith('.mp4')) mimeType = 'video/mp4';
                            else if (relativePath.endsWith('.webm')) mimeType = 'video/webm';
                            else if (relativePath.endsWith('.ogg')) mimeType = 'audio/ogg';
                            else if (relativePath.endsWith('.weba')) mimeType = 'audio/webm';
                            else if (relativePath.endsWith('.mp3')) mimeType = 'audio/mpeg';
                            else if (relativePath.endsWith('.wav')) mimeType = 'audio/wav';
                            assets[assetId] = `data:${mimeType};base64,${base64}`;
                        } catch (error) {
                            console.error(`載入圖片失敗: ${relativePath}`, error);
                        }
                    })());
                }
            });
            
            // 等待所有 assets 載入完成
            await Promise.all(assetPromises);
        }
        
        // 還原當前章節和頁面
        if (projectData.chapters.length > 0) {
            currentChapterId = projectData.chapters[0].id;
            if (projectData.chapters[0].slides.length > 0) {
                currentSlideId = projectData.chapters[0].slides[0].id;
            }
        }
        
        // 更新 componentIdCounter（避免 ID 衝突）
        let maxId = 0;
        projectData.chapters.forEach(chapter => {
            chapter.slides.forEach(slide => {
                slide.components.forEach(component => {
                    const match = component.id.match(/^c(\d+)$/);
                    if (match) {
                        const idNum = parseInt(match[1]);
                        if (idNum > maxId) maxId = idNum;
                    }
                });
            });
        });
        componentIdCounter = maxId + 1;
        
        updateChapterSlideSelects();
        
        // 確保 assets 載入後再渲染畫布
        // 使用 Promise 確保所有 assets 都載入完成
        const assetPromises = Object.keys(assets).map(assetId => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve(); // 即使載入失敗也繼續
                img.src = assets[assetId];
            });
        });
        
        Promise.all(assetPromises).then(() => {
            renderCanvas();
            renderThumbnails();
            scheduleSaveDraft();
            const assetCount = Object.keys(assets).length;
            if (assetCount > 0) {
                alert(`匯入成功！已載入 ${assetCount} 個圖片資源`);
            } else {
                alert('匯入成功！');
            }
        });
    } catch (error) {
        console.error('匯入失敗:', error);
        alert('匯入失敗：' + error.message);
    }
    
    e.target.value = '';
}

async function exportPlayer() {
    try {
        const defaultName = '新專案';
        const filename = prompt('請輸入匯出的檔名（單一 HTML 檔）：', defaultName);
        if (filename === null) return;
        const baseName = (filename && filename.trim()) ? filename.trim() : defaultName;

        // 讀取 player.html, player.css, player.js
        let playerHtmlContent = '';
        let playerCssContent = '';
        let playerJsContent = '';
        try {
            const [resHtml, resCss, resJs] = await Promise.all([
                fetch('player.html'),
                fetch('player.css'),
                fetch('player.js')
            ]);
            if (resHtml.ok) playerHtmlContent = await resHtml.text();
            if (resCss.ok) playerCssContent = await resCss.text();
            if (resJs.ok) playerJsContent = await resJs.text();
        } catch (e) {
            console.warn('讀取 player 檔案失敗:', e);
        }
        if (!playerHtmlContent || !playerCssContent || !playerJsContent) {
            alert('無法讀取 player.html / player.css / player.js，請確認檔案存在。');
            return;
        }

        // 移除 live-server 注入的區塊，避免匯出檔嘗試 WebSocket 與報錯
        playerHtmlContent = playerHtmlContent.replace(/<!-- Code injected by live-server -->[\s\S]*?<\/script>\s*/gi, '');

        // 專案、圖片、歡迎頁嵌入腳本（單檔開啟時一律先顯示歡迎頁，再點播放進入全螢幕簡報）
        // 1) JSON 中可能含 </script> 或 \u003c/script>，會讓 HTML 提早關閉 <script>，必須跳脫
        // 2) JSON 字串中若有 U+2028 / U+2029，在 JS 中為行終止符會造成 SyntaxError，須改為 \u2028 / \u2029
        const welcomePage = projectData.welcomePage || { backgroundImage: null, description: '' };
        let embedData = 'window.EMBEDDED_PROJECT=' + JSON.stringify(projectData) + ';window.EMBEDDED_ASSETS=' + JSON.stringify(assets) + ';window.EMBEDDED_WELCOME_PAGE=' + JSON.stringify(welcomePage) + ';';
        embedData = embedData.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        embedData = embedData.replace(/<\/script>/gi, '<\\/script>');

        const safeJs = playerJsContent.replace(/<\/script>/gi, '<\\/script>');
        // 單檔 HTML：內嵌 CSS、內嵌 JS、內嵌專案與圖片；替換 player.css 連結與 player.js 腳本
        let singleHtml = playerHtmlContent
            .replace(/<link\s+rel="stylesheet"\s+href="player\.css"\s*\/?>\s*/i, '<style>\n' + playerCssContent + '\n</style>\n')
            .replace(/<script\s+[^>]*src\s*=\s*["']player\.js["'][^>]*>\s*<\/script>/i, '<script>' + embedData + '<\/script>\n<script>\n' + safeJs + '\n<\/script>');

        const blob = new Blob([singleHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = baseName + '.html';
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('匯出失敗:', error);
        alert('匯出失敗：' + error.message);
    }
}

// ============================================
// 工具函數
// ============================================

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
