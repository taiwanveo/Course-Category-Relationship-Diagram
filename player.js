// ============================================
// 互動教學簡報播放器 - Player
// ============================================

let projectData = null;
let assets = {};
let revealInstance = null; // 自訂切換時不再使用 Reveal API，保留變數供現有判斷使用
let currentChapterIndex = 0;
let currentSlideIndex = 0;
/** 目前投影片在「全部 section 從頭數」的索引 (0-based) */
let currentGlobalSlideIndex = 0;

/** 左右箭頭佔用的寬度（用於計算簡報可視寬度） */
const ARROW_SPACE = 140;

/**
 * 取得簡報「可視區域」的寬高（依 .reveal 的實際顯示範圍），避免被底部工具列或瀏覽器介面遮擋時比例錯誤。
 * 使用 .reveal 完整寬高，畫布由 CSS 置中，左右箭頭為 overlay 不佔版面。
 */
function getSlideAvailableSize() {
    const revealEl = document.querySelector('.reveal');
    if (!revealEl) {
        return {
            width: Math.max(100, window.innerWidth),
            height: Math.max(100, window.innerHeight - 70)
        };
    }
    const rect = revealEl.getBoundingClientRect();
    return {
        width: Math.max(100, rect.width),
        height: Math.max(100, rect.height)
    };
}

function runPlayerInit() {
    (async () => {
        console.log('[初始化] 開始');
        setupHelp();
        setupFullscreen();
        await loadProject();
        console.log('[loadProject完成] projectData:', projectData ? `${projectData.chapters.length}章` : 'null');

        const urlParams = new URLSearchParams(window.location.search);
        const wantFullscreen = urlParams.get('fullscreen') === '1';
        const hasWelcomePage = typeof window.EMBEDDED_WELCOME_PAGE !== 'undefined' && window.EMBEDDED_WELCOME_PAGE;

        if (hasWelcomePage && projectData) {
            showWelcomeScreen();
            return;
        }

        initializeReveal();
        setupNavigation();
        console.log('[初始化流程完成]');

        if (wantFullscreen) {
            showPreviewFullscreenPrompt();
        }
    })();
}

/** 預覽模式：全螢幕須由本頁面內手勢觸發，故顯示覆蓋層＋「全螢幕播放」按鈕，點擊後進入全螢幕 */
function showPreviewFullscreenPrompt() {
    const overlay = document.createElement('div');
    overlay.id = 'preview-fullscreen-prompt';
    overlay.className = 'preview-fullscreen-prompt';
    overlay.innerHTML = '<p>全螢幕播放</p>';
    overlay.addEventListener('click', function once() {
        overlay.removeEventListener('click', once);
        overlay.remove();
        try {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
            else if (el.msRequestFullscreen) el.msRequestFullscreen();
        } catch (err) {
            console.warn('無法進入全螢幕:', err);
        }
    });
    document.body.appendChild(overlay);
}

function showWelcomeScreen() {
    const welcome = window.EMBEDDED_WELCOME_PAGE;
    const screenEl = document.getElementById('welcome-screen');
    const bgEl = document.getElementById('welcome-background');
    const textEl = document.getElementById('welcome-text');
    const playBtn = document.getElementById('welcome-play-btn');
    const revealEl = document.querySelector('.reveal');
    if (!screenEl || !playBtn) return;

    const hasContent = welcome && (welcome.backgroundImage || (welcome.description && welcome.description.trim()));
    const isDefaultWelcome = !hasContent;

    if (isDefaultWelcome) {
        if (bgEl) {
            bgEl.style.backgroundImage = '';
            bgEl.style.backgroundColor = 'var(--bg-main)';
        }
        if (textEl) textEl.style.display = 'none';
        playBtn.textContent = '全螢幕播放';
        screenEl.classList.add('welcome-screen-default');
    } else {
        screenEl.classList.remove('welcome-screen-default');
        if (bgEl) {
            bgEl.style.backgroundColor = '';
            if (welcome.backgroundImage) bgEl.style.backgroundImage = 'url(' + welcome.backgroundImage + ')';
            else bgEl.style.backgroundImage = '';
        }
        if (textEl) {
            textEl.style.display = '';
            textEl.textContent = welcome.description || '';
        }
        playBtn.textContent = '播放';
    }

    screenEl.style.display = 'flex';
    if (revealEl) revealEl.style.display = 'none';

    playBtn.addEventListener('click', function onPlay() {
        playBtn.removeEventListener('click', onPlay);
        try {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
            else if (el.msRequestFullscreen) el.msRequestFullscreen();
        } catch (err) {
            console.warn('無法進入全螢幕:', err);
        }
        screenEl.style.display = 'none';
        if (revealEl) revealEl.style.display = '';
        initializeReveal();
        setupNavigation();
    });
}
// 單一 HTML 檔（file://）開啟時，內嵌腳本執行完才解析到本 script，DOMContentLoaded 可能已觸發，需依 readyState 決定用 listener 或直接執行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runPlayerInit);
} else {
    runPlayerInit();
}

// ============================================
// 操作提示設定
// ============================================

function setupHelp() {
    const btnHelp = document.getElementById('btn-help');
    const helpOverlay = document.getElementById('help-overlay');
    const btnCloseHelp = document.getElementById('btn-close-help');
    
    // 檢查是否已經看過提示（使用 localStorage）
    const hasSeenHelp = localStorage.getItem('hasSeenHelp');
    
    // 如果沒看過，自動顯示提示
    if (!hasSeenHelp && helpOverlay) {
        setTimeout(() => {
            helpOverlay.classList.add('show');
        }, 1000);
    }
    
    // 幫助按鈕點擊事件
    if (btnHelp && helpOverlay) {
        btnHelp.addEventListener('click', () => {
            helpOverlay.classList.add('show');
        });
    }
    
    // 關閉提示
    if (btnCloseHelp && helpOverlay) {
        btnCloseHelp.addEventListener('click', () => {
            helpOverlay.classList.remove('show');
            localStorage.setItem('hasSeenHelp', 'true');
        });
    }
    
    // 點擊背景關閉
    if (helpOverlay) {
        helpOverlay.addEventListener('click', (e) => {
            if (e.target === helpOverlay) {
                helpOverlay.classList.remove('show');
                localStorage.setItem('hasSeenHelp', 'true');
            }
        });
    }
}

// ============================================
// 全螢幕播放（結束時：單檔→退回歡迎頁；預覽→關閉視窗）
// ============================================

function setupFullscreen() {
    const btn = document.getElementById('btn-fullscreen');
    if (!btn) return;

    const isSingleFileWithWelcome = typeof window.EMBEDDED_WELCOME_PAGE !== 'undefined' && window.EMBEDDED_WELCOME_PAGE;
    const isPreviewMode = new URLSearchParams(window.location.search).get('preview') === '1';

    function updateFullscreenIcon() {
        const icon = btn.querySelector('i');
        if (!icon) return;
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        icon.className = isFs ? 'fas fa-times' : 'fas fa-expand';
        btn.title = isFs ? '結束播放' : '全螢幕播放';
    }

    function onExitedFullscreen() {
        if (isPreviewMode) {
            window.close();
            if (window.opener) window.opener.focus();
        } else if (isSingleFileWithWelcome) {
            const screenEl = document.getElementById('welcome-screen');
            const revealEl = document.querySelector('.reveal');
            if (screenEl) screenEl.style.display = 'flex';
            if (revealEl) revealEl.style.display = 'none';
        }
    }

    btn.addEventListener('click', () => {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        if (!isFs) {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
            else if (el.msRequestFullscreen) el.msRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
        }
    });

    function handleFullscreenChange() {
        const wasFs = btn.dataset.wasFullscreen === '1';
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        btn.dataset.wasFullscreen = isFs ? '1' : '0';
        if (wasFs && !isFs) onExitedFullscreen();
        updateFullscreenIcon();
        window.dispatchEvent(new Event('resize'));
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    btn.dataset.wasFullscreen = document.fullscreenElement ? '1' : '0';
    updateFullscreenIcon();
}

// ============================================
// 預覽資料讀取（IndexedDB 優先，其次 localStorage）
// ============================================

const PREVIEW_DB_NAME = 'InteractivePresentationPreview';
const PREVIEW_DB_VERSION = 1;
const PREVIEW_STORE_NAME = 'preview';

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

function loadPreviewFromStorage() {
    return openPreviewDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PREVIEW_STORE_NAME, 'readonly');
            const store = tx.objectStore(PREVIEW_STORE_NAME);
            let projectStr = null, assetsStr = null;
            store.get('project').onsuccess = (e) => { projectStr = e.target.result; };
            store.get('assets').onsuccess = (e) => { assetsStr = e.target.result; };
            tx.oncomplete = () => {
                db.close();
                if (projectStr) {
                    resolve({
                        projectData: JSON.parse(projectStr),
                        assets: (assetsStr ? JSON.parse(assetsStr) : null) || {}
                    });
                } else {
                    resolve(null);
                }
            };
            tx.onerror = () => reject(tx.error);
        });
    }).catch(() => {
        try {
            const raw = localStorage.getItem('it-slide-preview-project');
            const assetsRaw = localStorage.getItem('it-slide-preview-assets');
            if (raw) {
                return {
                    projectData: JSON.parse(raw),
                    assets: (assetsRaw ? JSON.parse(assetsRaw) : null) || {}
                };
            }
        } catch (e) {}
        return null;
    });
}

// ============================================
// 載入專案資料
// ============================================

async function loadProject() {
    try {
        // 優先使用編輯器匯出時嵌入的專案資料（支援 file:// 直接開啟）
        if (typeof window.EMBEDDED_PROJECT !== 'undefined' && window.EMBEDDED_PROJECT) {
            projectData = window.EMBEDDED_PROJECT;
            if (typeof window.EMBEDDED_ASSETS !== 'undefined' && window.EMBEDDED_ASSETS) {
                assets = window.EMBEDDED_ASSETS;
            }
            normalizeProjectOrder(projectData);
            hideLoading();
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('preview') === '1') {
            try {
                const data = await loadPreviewFromStorage();
                if (data) {
                    projectData = data.projectData;
                    assets = data.assets || {};
                    normalizeProjectOrder(projectData);
                    hideLoading();
                    return;
                }
            } catch (e) {
                console.warn('預覽資料讀取失敗', e);
            }
            showError('無法取得預覽內容。<br><br>請在編輯器點「播放」按鈕後再試，或關閉此視窗回到編輯頁面。', true);
            return;
        }

        // 嘗試從 URL 參數讀取 project.json 路徑
        const projectPath = urlParams.get('project') || 'project.json';

        const response = await fetch(projectPath);
        if (!response.ok) {
            showError('無法載入專案。<br><br>請使用編輯器「匯出播放簡報」產生的單一 HTML 檔開啟，或從編輯器點「播放」預覽。');
            return;
        }

        projectData = await response.json();
        normalizeProjectOrder(projectData);
        await loadAssets();
        hideLoading();
    } catch (error) {
        console.error('載入專案失敗:', error);
        if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
            showError('無法載入專案。<br><br>請使用編輯器「匯出播放簡報」產生的單一 HTML 檔開啟，或從編輯器點「播放」預覽。');
        } else {
            showError('載入專案失敗：' + error.message);
        }
    }
}

async function loadAssets() {
    // 嘗試載入 assets 目錄中的圖片
    // 這裡假設 assets 在與 player.html 同目錄的 assets/ 資料夾中
    // 實際使用時，assets 會從匯出的 Player 網站中載入
    
    // 如果 project.json 中有 assetId，我們會在渲染時處理
    // 這裡可以預載入一些資源
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
                if (isAutoSlideTitle(slide.title)) {
                    slide.title = `第${slideIndex + 1}頁`;
                }
            });
        }
    });
}

function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.remove('hidden');
        loading.innerHTML = `
            <div class="loading-spinner"></div>
            <p>載入中...</p>
        `;
    }
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.add('hidden');
    }
}

function showError(message) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.remove('hidden');
        loading.innerHTML = `
            <div style="text-align: center;">
                <p style="color: #ff3b30; font-size: 18px; margin-bottom: 20px;">❌ ${message}</p>
            </div>
        `;
    }
}

// ============================================
// 初始化 Reveal.js
// ============================================

function initializeReveal() {
    if (!projectData) {
        console.error('projectData 不存在，無法初始化 Reveal.js');
        return;
    }
    
    const slidesContainer = document.getElementById('slides-container');
    if (!slidesContainer) {
        console.error('slides-container 元素不存在');
        return;
    }
    
    // 清空現有內容
    slidesContainer.innerHTML = '';
    
    // 轉換 chapters 和 slides 為 reveal.js 格式
    projectData.chapters.forEach((chapter, chapterIndex) => {
        if (!chapter || !chapter.slides) {
            console.warn(`章節 ${chapterIndex} 資料不完整`, chapter);
            return;
        }
        
        chapter.slides.forEach((slide, slideIndex) => {
            try {
                console.log(`[開始建立Section] 章${chapterIndex+1}-頁${slideIndex+1}`, slide);
                const section = createSlideSection(slide, chapterIndex, slideIndex);
                if (section && slidesContainer) {
                    slidesContainer.appendChild(section);
                    console.log(`[Section已掛載] 總數: ${slidesContainer.children.length}`);
                }
            } catch (error) {
                console.error(`建立投影片失敗 (章節 ${chapterIndex}, 頁面 ${slideIndex}):`, error);
            }
        });
    });
    
    console.log(`[完成] 總共建立 ${slidesContainer.children.length} 個sections`);

    const revealElement = document.querySelector('.reveal');
    if (revealElement) revealElement.style.pointerEvents = 'auto';

    // 自訂切換：不依賴 Reveal 版面，一次只顯示一張 section（用 .current）
    const sections = slidesContainer.querySelectorAll('section');
    const totalSlides = sections.length;
    if (totalSlides === 0) return;

    // 依 hash 決定起始頁（例如 #/2-3），否則第一張
    let startGlobalIndex = 0;
    const hash = window.location.hash;
    const hashMatch = hash && hash.match(/^#?\/(\d+)-(\d+)$/);
    if (hashMatch) {
        const ch = parseInt(hashMatch[1], 10) - 1;
        const sl = parseInt(hashMatch[2], 10) - 1;
        for (let i = 0; i < sections.length; i++) {
            if (parseInt(sections[i].dataset.chapterIndex, 10) === ch && parseInt(sections[i].dataset.slideIndex, 10) === sl) {
                startGlobalIndex = i;
                break;
            }
        }
    }
    showSlideByIndex(startGlobalIndex);

    // 監聽 hash 變更（例如瀏覽器上一頁）
    window.addEventListener('hashchange', () => {
        const m = window.location.hash.match(/^#?\/(\d+)-(\d+)$/);
        if (m) {
            const ch = parseInt(m[1], 10) - 1;
            const sl = parseInt(m[2], 10) - 1;
            goToSlide(ch, sl);
        }
    });

    // 鍵盤左右鍵
    document.addEventListener('keydown', (e) => {
        if (e.target.closest('input') || e.target.closest('textarea')) return;
        const sectionsList = document.getElementById('slides-container')?.querySelectorAll('section') || [];
        const total = sectionsList.length;
        if (e.key === 'ArrowLeft' && currentGlobalSlideIndex > 0) {
            e.preventDefault();
            showSlideByIndex(currentGlobalSlideIndex - 1);
        } else if (e.key === 'ArrowRight' && currentGlobalSlideIndex < total - 1) {
            e.preventDefault();
            showSlideByIndex(currentGlobalSlideIndex + 1);
        }
    });

    setupNavArrows();
    updateNavigation();
    const chapterButtons = document.getElementById('chapter-buttons');
    if (chapterButtons && chapterButtons.children.length === 0) {
        createChapterButtons();
    }
}

/**
 * 依「全部 section 的索引」切換到那一張，並更新 .current、狀態與 hash
 */
function showSlideByIndex(globalIndex) {
    const slidesContainer = document.getElementById('slides-container');
    if (!slidesContainer) return;
    const sections = slidesContainer.querySelectorAll('section');
    const total = sections.length;
    if (globalIndex < 0 || globalIndex >= total) return;

    currentGlobalSlideIndex = globalIndex;
    const section = sections[globalIndex];
    currentChapterIndex = parseInt(section.dataset.chapterIndex, 10);
    currentSlideIndex = parseInt(section.dataset.slideIndex, 10);

    sections.forEach((s, i) => {
        const isCurrent = i === globalIndex;
        s.classList.toggle('current', isCurrent);
        // 用 inline !important 覆蓋任何 Reveal.js 或主題的隱藏規則
        s.style.setProperty('opacity', isCurrent ? '1' : '0', 'important');
        s.style.setProperty('visibility', isCurrent ? 'visible' : 'hidden', 'important');
        s.style.setProperty('pointer-events', isCurrent ? 'auto' : 'none', 'important');
    });
    window.location.hash = `#/${currentChapterIndex + 1}-${currentSlideIndex + 1}`;
    updateNavigation();
    updateNavArrows();
}

// ============================================
// 建立投影片區塊
// ============================================

function createSlideSection(slide, chapterIndex, slideIndex) {
    const section = document.createElement('section');
    section.dataset.chapterIndex = chapterIndex;
    section.dataset.slideIndex = slideIndex;
    
    // 初始隱藏（由 showSlideByIndex 控制顯示），用 important 覆蓋 Reveal 預設
    section.style.setProperty('opacity', '0', 'important');
    section.style.setProperty('visibility', 'hidden', 'important');
    section.style.setProperty('pointer-events', 'none', 'important');
    
    // 設定背景 - 直接用 style 而非 data-background-color，避免 Reveal.js 的 .slide-background 覆蓋內容
    if (slide.background && slide.background.type === 'solid') {
        // 如果背景是黑色(#000000)，使用預設淺色背景，相容舊版專案
        const bgColor = (slide.background.value === '#000000') ? '#F9F7F5' : slide.background.value;
        section.style.backgroundColor = bgColor;
    } else {
        section.style.backgroundColor = '#F9F7F5';
    }
    
    // 建立畫布容器（填滿 section 的可用空間）
    const canvas = document.createElement('div');
    canvas.className = 'slide-canvas';
    
    // 依 .reveal 的實際可視區域計算尺寸；一般視窗下縮為 75% 以完整呈現並置中，全螢幕下維持 100%
    const calculateCanvasSize = () => {
        const { width: w, height: h } = getSlideAvailableSize();
        let s = Math.min(w / 1280, h / 720);
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        if (!isFullscreen) s *= 0.75;
        return {
            width: 1280 * s,
            height: 720 * s,
            maxWidth: w,
            maxHeight: h
        };
    };
    
    const { width: displayWidth, height: displayHeight, maxWidth, maxHeight } = calculateCanvasSize();
    
    canvas.style.cssText = `
        width: ${displayWidth}px;
        height: ${displayHeight}px;
        max-width: ${maxWidth}px;
        max-height: ${maxHeight}px;
        pointer-events: none;
    `;
    
    const updateCanvasSize = () => {
        const { width: newWidth, height: newHeight, maxWidth: newMaxW, maxHeight: newMaxH } = calculateCanvasSize();
        canvas.style.width = `${newWidth}px`;
        canvas.style.height = `${newHeight}px`;
        canvas.style.maxWidth = `${newMaxW}px`;
        canvas.style.maxHeight = `${newMaxH}px`;
    };
    
    // 使用 ResizeObserver 監聽 section 大小變化
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            updateCanvasSize();
        });
        resizeObserver.observe(section);
    } else {
        // 降級方案：使用 window resize
        window.addEventListener('resize', updateCanvasSize);
    }
    
    // 渲染所有元件
    console.log(`[創建Section] 章${chapterIndex+1}-頁${slideIndex+1}, 元件數: ${slide.components ? slide.components.length : 0}`, slide.components);
    if (slide.components && Array.isArray(slide.components)) {
        slide.components.forEach((component, componentIndex) => {
            try {
                if (!component || !component.type) {
                    console.warn('元件資料不完整:', component);
                    return;
                }
                const element = createComponentElement(component, slide, componentIndex);
                if (element && canvas) {
                    canvas.appendChild(element);
                    console.log(`[元件已添加] 章${chapterIndex+1}-頁${slideIndex+1}, 元件${componentIndex+1}: ${component.type}`, element);
                }
            } catch (error) {
                console.error('渲染元件失敗:', component, error);
            }
        });
    } else {
        console.warn('slide.components 不存在或不是陣列:', slide);
    }
    
    section.appendChild(canvas);
    console.log(`[Section完成] 章${chapterIndex+1}-頁${slideIndex+1}, canvas子元素數: ${canvas.children.length}`);
    
    // 在 section 已掛載到 DOM 後再設定拖曳排序互動，避免 interact.js 的 contains 錯誤
    requestAnimationFrame(() => {
        const dragOrderDivs = canvas.querySelectorAll('.component-drag-order');
        dragOrderDivs.forEach(div => {
            const idx = parseInt(div.dataset.componentIndex, 10);
            if (!isNaN(idx) && slide.components && slide.components[idx]) {
                try {
                    setupDragOrderInteractions(div, slide.components[idx]);
                } catch (err) {
                    console.error('設定拖曳排序互動失敗:', err);
                }
            }
        });
    });
    
    return section;
}

// ============================================
// 建立元件元素
// ============================================

function createComponentElement(component, slide, componentIndex) {
    if (!component || !component.type) {
        console.error('元件資料不完整:', component);
        return null;
    }
    
    const div = document.createElement('div');
    div.className = 'slide-component';
    if (componentIndex !== undefined) {
        div.dataset.componentIndex = String(componentIndex);
    }
    
    // 確保基本屬性存在
    const x = component.x !== undefined ? component.x : 0;
    const y = component.y !== undefined ? component.y : 0;
    const w = component.w !== undefined ? component.w : 100;
    const h = component.h !== undefined ? component.h : 100;
    
    div.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${w}px;
        height: ${h}px;
        pointer-events: auto;
        display: block;
        visibility: visible;
        opacity: 1;
    `;
    
    // 應用樣式
    if (component.style) {
        Object.keys(component.style).forEach(key => {
            const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            div.style[cssKey] = component.style[key];
        });
    }
    
    // 確保元件可以接收事件（但不會阻止 reveal.js 的點擊翻頁）
    if (component.type === 'quiz-single' || component.type === 'drag-order' || component.type === 'quiz-multiple') {
        div.style.pointerEvents = 'auto';
    } else {
        div.style.pointerEvents = 'auto';
    }
    
    // 根據類型建立內容
    switch (component.type) {
        case 'text':
            div.className += ' component-text';
            div.textContent = component.props.text || '';
            break;
            
        case 'image':
            div.className += ' component-image';
            const img = document.createElement('img');
            if (component.props.assetId && assets[component.props.assetId]) {
                // 直接使用 assets 物件中的 base64 資料
                img.src = assets[component.props.assetId];
            } else if (component.props.assetId) {
                // 如果 assets 物件中沒有，嘗試從 assets 目錄載入
                const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
                let triedExtensions = 0;
                
                function tryLoadImage(extIndex) {
                    if (extIndex >= extensions.length) {
                        // 所有格式都失敗，顯示預設圖片
                        img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="200"%3E%3Crect width="300" height="200" fill="%23333"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3E無圖片%3C/text%3E%3C/svg%3E';
                        return;
                    }
                    
                    const ext = extensions[extIndex];
                    const assetPath = `assets/${component.props.assetId}.${ext}`;
                    img.src = assetPath;
                    
                    img.onerror = () => {
                        triedExtensions++;
                        tryLoadImage(extIndex + 1);
                    };
                }
                
                tryLoadImage(0);
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
            const linkWrapPlayer = document.createElement('div');
            linkWrapPlayer.className = 'component-link-inner';
            linkWrapPlayer.style.display = 'flex';
            linkWrapPlayer.style.alignItems = 'center';
            linkWrapPlayer.style.gap = '10px';
            linkWrapPlayer.style.width = '100%';
            linkWrapPlayer.style.height = '100%';
            if (component.props.showThumbnail && (component.props.thumbnailUrl || (component.props.thumbnailAssetId && assets[component.props.thumbnailAssetId]))) {
                const thumbImg = document.createElement('img');
                thumbImg.className = 'link-thumbnail';
                thumbImg.alt = '';
                if (component.props.thumbnailAssetId && assets[component.props.thumbnailAssetId]) {
                    thumbImg.src = assets[component.props.thumbnailAssetId];
                } else if (component.props.thumbnailUrl) {
                    thumbImg.src = component.props.thumbnailUrl;
                }
                thumbImg.onerror = () => { thumbImg.style.display = 'none'; };
                linkWrapPlayer.appendChild(thumbImg);
            }
            const link = document.createElement('a');
            link.href = component.props.url || '#';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const externalIconSpan = document.createElement('span');
            externalIconSpan.className = 'link-external-icon';
            externalIconSpan.setAttribute('aria-hidden', 'true');
            externalIconSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
            const linkTextSpan = document.createElement('span');
            linkTextSpan.className = 'link-text';
            linkTextSpan.textContent = component.props.text || '連結';
            link.appendChild(externalIconSpan);
            link.appendChild(document.createTextNode(' '));
            link.appendChild(linkTextSpan);
            link.style.display = 'flex';
            link.style.alignItems = 'center';
            link.style.gap = '6px';
            link.style.flex = '1';
            if (component.style) {
                Object.keys(component.style).forEach(key => {
                    if (key === 'textDecoration') return;
                    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                    link.style[cssKey] = component.style[key];
                });
            }
            link.style.textDecoration = 'none';
            linkWrapPlayer.appendChild(link);
            div.appendChild(linkWrapPlayer);
            break;

        case 'embed':
            div.className += ' component-embed';
            div.style.overflow = 'hidden';
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
                const embedPlaceholder = document.createElement('div');
                embedPlaceholder.className = 'player-embed-placeholder';
                embedPlaceholder.textContent = '未設定內嵌網址';
                div.appendChild(embedPlaceholder);
            }
            break;

        case 'table':
            div.className += ' component-table';
            div.style.overflow = 'auto';
            div.style.padding = '8px';
            const tRows = component.props.rows || 3;
            const tCols = component.props.cols || 4;
            const tHeader = component.props.headerRow !== false;
            const tCells = component.props.cells || [];
            const table = document.createElement('table');
            table.className = 'player-table';
            const tbody = document.createElement('tbody');
            for (let r = 0; r < tRows; r++) {
                const tr = document.createElement('tr');
                const tag = tHeader && r === 0 ? 'th' : 'td';
                for (let c = 0; c < tCols; c++) {
                    const cell = document.createElement(tag);
                    const val = tCells[r] && tCells[r][c] !== undefined ? String(tCells[r][c]) : '';
                    cell.textContent = val;
                    tr.appendChild(cell);
                }
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            div.appendChild(table);
            break;
            
        case 'code':
            div.className += ' component-code';
            div.style.display = 'block';
            div.style.overflow = 'hidden';
            div.style.padding = '12px';
            const codeContainer = document.createElement('div');
            codeContainer.className = 'player-code-wrap';
            codeContainer.style.cssText = 'width: 100%; height: 100%; overflow: auto; display: flex; flex-direction: column;';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = '複製程式碼';
            copyBtn.style.cssText = 'align-self: flex-end; margin-bottom: 8px; flex-shrink: 0;';
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(component.props.code || '');
                copyBtn.textContent = '已複製!';
                setTimeout(() => { copyBtn.textContent = '複製程式碼'; }, 2000);
            });
            const pre = document.createElement('pre');
            pre.className = 'player-code-block';
            pre.style.margin = '0';
            pre.style.flex = '1';
            pre.style.padding = '12px';
            pre.style.overflowX = 'hidden';
            pre.style.overflowY = 'auto';
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.wordWrap = 'break-word';
            pre.style.wordBreak = 'break-word';
            pre.style.boxSizing = 'border-box';
            if (component.style && component.style.fontSize) pre.style.fontSize = component.style.fontSize;
            const code = document.createElement('code');
            let lang = (component.props.language || 'javascript').toLowerCase().replace(/\s/g, '');
            // Prism 使用 markup 表示 HTML/XML
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
            codeContainer.appendChild(copyBtn);
            codeContainer.appendChild(pre);
            div.appendChild(codeContainer);
            break;
            
        case 'quiz-single':
            div.className += ' component-quiz';
            div.style.display = 'block';
            div.style.overflow = 'auto';
            div.innerHTML = createQuizHTML(component);
            // 綁定互動事件
            try {
                setupQuizInteractions(div, component);
            } catch (error) {
                console.error('設定測驗互動失敗:', error);
            }
            break;
            
        case 'drag-order':
            div.className += ' component-drag-order';
            div.style.display = 'block';
            div.style.overflow = 'auto';
            div.innerHTML = createDragOrderHTML(component);
            break;
            
        case 'quiz-multiple':
            div.className += ' component-quiz-multiple';
            div.style.display = 'block';
            div.style.overflow = 'auto';
            div.innerHTML = createQuizMultipleHTML(component);
            try {
                setupQuizMultipleInteractions(div, component);
            } catch (err) {
                console.error('設定複選題互動失敗:', err);
            }
            break;

        case 'video':
            div.className += ' component-video';
            div.style.overflow = 'hidden';
            const vidUrl = (component.props.url || '').trim();
            const vidAsset = component.props.assetId && assets[component.props.assetId];
            if (vidUrl || vidAsset) {
                if (component.props.source === 'asset' && vidAsset) {
                    const vid = document.createElement('video');
                    vid.src = vidAsset;
                    vid.controls = true;
                    vid.style.width = '100%';
                    vid.style.height = '100%';
                    if (component.props.autoplay) vid.autoplay = true;
                    if (component.props.muted !== false) vid.muted = true;
                    div.appendChild(vid);
                } else {
                    const iframe = document.createElement('iframe');
                    let src = vidUrl;
                    const yt = vidUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
                    if (yt) src = `https://www.youtube.com/embed/${yt[1]}?autoplay=${component.props.autoplay ? 1 : 0}`;
                    iframe.src = src;
                    iframe.title = '影片';
                    iframe.style.width = '100%';
                    iframe.style.height = '100%';
                    iframe.style.border = 'none';
                    div.appendChild(iframe);
                }
            } else {
                const ph = document.createElement('div');
                ph.className = 'player-embed-placeholder';
                ph.textContent = '未設定影片';
                div.appendChild(ph);
            }
            break;
        case 'list':
            div.className += ' component-list';
            const listType = component.props.listType || 'bullet';
            const listTag = listType === 'numbered' ? 'ol' : 'ul';
            const listEl = document.createElement(listTag);
            listEl.className = 'player-list';
            (component.props.items || []).forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                listEl.appendChild(li);
            });
            if ((component.props.items || []).length === 0) {
                const li = document.createElement('li');
                li.textContent = '尚無項目';
                listEl.appendChild(li);
            }
            div.appendChild(listEl);
            break;
        case 'fill-blank':
            div.className += ' component-fill-blank';
            div.style.display = 'block';
            div.style.overflow = 'auto';
            div.innerHTML = createFillBlankHTML(component);
            try {
                setupFillBlankInteractions(div, component);
            } catch (err) {
                console.error('設定填空題互動失敗:', err);
            }
            break;
        case 'chart':
            div.className += ' component-chart';
            div.style.overflow = 'auto';
            renderChart(div, component);
            break;
        case 'matching':
            div.className += ' component-matching';
            div.style.display = 'block';
            div.style.overflow = 'hidden';
            div.innerHTML = createMatchingHTML(component);
            try {
                setupMatchingInteractions(div, component);
            } catch (err) {
                console.error('設定配對題互動失敗:', err);
            }
            break;
        case 'shape':
            div.className += ' component-shape';
            const st = component.props.shapeType || 'rect';
            const fill = component.props.fill || '#3B82F6';
            div.style.backgroundColor = fill;
            div.style.borderRadius = st === 'circle' ? '50%' : '0';
            if (component.props.stroke) {
                div.style.border = `${component.props.strokeWidth != null ? component.props.strokeWidth : 2}px solid ${component.props.stroke}`;
            }
            if (st === 'arrow') {
                const arr = document.createElement('div');
                arr.className = 'player-shape-arrow';
                arr.style.width = '0';
                arr.style.height = '0';
                arr.style.borderWidth = '20px';
                arr.style.borderStyle = 'solid';
                arr.style.borderColor = `transparent transparent transparent ${fill}`;
                div.appendChild(arr);
            }
            break;
        case 'progress':
            div.className += ' component-progress';
            const cur = component.props.current != null ? component.props.current : 2;
            const tot = component.props.total || 5;
            const lab = component.props.label || '步驟';
            const progWrap = document.createElement('div');
            progWrap.className = 'player-progress-wrap';
            progWrap.innerHTML = `<span class="player-progress-label">${lab}</span><span class="player-progress-value">${cur} / ${tot}</span><div class="player-progress-bar"><div class="player-progress-fill" style="width:${(cur / tot) * 100}%"></div></div>`;
            div.appendChild(progWrap);
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
                const ph = document.createElement('div');
                ph.className = 'player-embed-placeholder';
                ph.textContent = '未設定音訊';
                div.appendChild(ph);
            }
            break;
        case 'timeline':
            div.className += ' component-timeline';
            const evs = component.props.events || [];
            const tlWrap = document.createElement('div');
            tlWrap.className = 'player-timeline-h';
            const track = document.createElement('div');
            track.className = 'player-timeline-track';
            tlWrap.appendChild(track);
            const nodesWrap = document.createElement('div');
            nodesWrap.className = 'player-timeline-nodes';
            evs.forEach((e, i) => {
                const isOdd = i % 2 === 0;
                const node = document.createElement('div');
                node.className = 'player-timeline-node' + (isOdd ? ' player-timeline-node-odd' : ' player-timeline-node-even');
                const bubbleTop = document.createElement('div');
                bubbleTop.className = 'player-timeline-bubble player-timeline-bubble-top';
                const bubbleBottom = document.createElement('div');
                bubbleBottom.className = 'player-timeline-bubble player-timeline-bubble-bottom';
                const bubbleContent = `<span class="player-timeline-date">${escapeHtml(e.date || '')}</span><span class="player-timeline-label">${escapeHtml(e.label || '')}</span>`;
                if (isOdd) {
                    bubbleTop.innerHTML = bubbleContent;
                    bubbleBottom.innerHTML = '&nbsp;';
                } else {
                    bubbleTop.innerHTML = '&nbsp;';
                    bubbleBottom.innerHTML = bubbleContent;
                }
                const dot = document.createElement('div');
                dot.className = 'player-timeline-dot';
                node.appendChild(bubbleTop);
                node.appendChild(dot);
                node.appendChild(bubbleBottom);
                nodesWrap.appendChild(node);
            });
            if (evs.length === 0) {
                const emptyNode = document.createElement('div');
                emptyNode.className = 'player-timeline-node player-timeline-empty';
                emptyNode.textContent = '尚無事件';
                nodesWrap.appendChild(emptyNode);
            }
            tlWrap.appendChild(nodesWrap);
            div.appendChild(tlWrap);
            break;
        case 'collapsible':
            div.className += ' component-collapsible';
            div.style.display = 'block';
            const collOpen = component.props.defaultOpen;
            const collTitleFs = component.props.titleFontSize != null ? component.props.titleFontSize : 18;
            const collContentFs = component.props.contentFontSize != null ? component.props.contentFontSize : 16;
            const collTitle = document.createElement('button');
            collTitle.type = 'button';
            collTitle.className = 'player-collapsible-title';
            collTitle.style.fontSize = collTitleFs + 'px';
            collTitle.textContent = (component.props.title || '點擊展開') + (collOpen ? ' ▼' : ' ▶');
            const collContent = document.createElement('div');
            collContent.className = 'player-collapsible-content';
            collContent.style.display = collOpen ? 'block' : 'none';
            collContent.style.fontSize = collContentFs + 'px';
            collContent.style.whiteSpace = 'pre-wrap';
            collContent.style.wordBreak = 'break-word';
            collContent.textContent = component.props.content || '';
            collTitle.addEventListener('click', () => {
                const isOpen = collContent.style.display === 'block';
                collContent.style.display = isOpen ? 'none' : 'block';
                collTitle.textContent = (component.props.title || '點擊展開') + (isOpen ? ' ▶' : ' ▼');
            });
            div.appendChild(collTitle);
            div.appendChild(collContent);
            break;
        case 'timer':
            div.className += ' component-timer';
            div.style.display = 'block';
            div.innerHTML = createTimerHTML(component);
            setupTimerInteractions(div, component);
            break;
    }
    
    return div;
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================
// 填空題、圖表、配對題、計時器
// ============================================

function createFillBlankHTML(component) {
    const question = component.props.question || '請填入答案';
    const answers = component.props.answers || [];
    const showAnswer = component.props.showCorrectAnswer !== false;
    const parts = question.split(/\_{2,}/);
    let blanksHtml = '';
    parts.forEach((p, i) => {
        blanksHtml += escapeHtml(p);
        if (i < parts.length - 1) {
            blanksHtml += `<input type="text" class="fill-blank-input" data-index="${i}" placeholder="填空">`;
        }
    });
    return `<h3>填空題</h3><p class="fill-blank-question">${blanksHtml}</p><button type="button" class="fill-blank-check">檢查答案</button><div class="fill-blank-result" style="display:none;"></div>${showAnswer ? '<div class="fill-blank-correct" style="display:none;"></div>' : ''}`;
}

function setupFillBlankInteractions(container, component) {
    const inputs = container.querySelectorAll('.fill-blank-input');
    const checkBtn = container.querySelector('.fill-blank-check');
    const resultEl = container.querySelector('.fill-blank-result');
    const correctEl = container.querySelector('.fill-blank-correct');
    const answers = component.props.answers || [];
    if (!checkBtn) return;
    checkBtn.addEventListener('click', () => {
        const userAnswers = Array.from(inputs).map(inp => inp.value.trim());
        const correct = answers.map((a, i) => String(a).trim() === (userAnswers[i] || ''));
        const allCorrect = correct.length === answers.length && correct.every(Boolean);
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.textContent = allCorrect ? '答對了！' : '再試一次';
            resultEl.className = 'fill-blank-result ' + (allCorrect ? 'correct' : 'incorrect');
        }
        if (correctEl && component.props.showCorrectAnswer !== false) {
            correctEl.style.display = 'block';
            correctEl.textContent = '正確答案：' + answers.join(', ');
        }
    });
}

function renderChart(container, component) {
    const type = component.props.chartType || 'bar';
    const labels = component.props.labels || [];
    const values = component.props.values || [];
    const sum = values.reduce((a, b) => a + b, 0) || 1;
    const wrap = document.createElement('div');
    wrap.className = 'player-chart-wrap';
    if (type === 'pie') {
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
        let soFar = 0;
        const gradientParts = values.map((v, i) => {
            const start = (soFar / sum) * 100;
            soFar += v;
            const end = (soFar / sum) * 100;
            return `${colors[i % colors.length]} ${start}% ${end}%`;
        });
        const one = document.createElement('div');
        one.className = 'player-chart-pie';
        one.style.width = '180px';
        one.style.height = '180px';
        one.style.borderRadius = '50%';
        one.style.background = `conic-gradient(${gradientParts.join(', ')})`;
        wrap.appendChild(one);
        const leg = document.createElement('div');
        leg.className = 'player-chart-legend';
        labels.forEach((l, i) => {
            const sp = document.createElement('span');
            sp.textContent = `${l || ''}: ${values[i] != null ? values[i] : 0}`;
            leg.appendChild(sp);
        });
        wrap.appendChild(leg);
    } else {
        const maxVal = Math.max(...values, 1);
        const bars = document.createElement('div');
        bars.className = 'player-chart-bars';
        labels.forEach((l, i) => {
            const barWrap = document.createElement('div');
            barWrap.className = 'player-chart-bar-wrap';
            barWrap.innerHTML = `<span class="player-chart-label">${escapeHtml(l || '')}</span><div class="player-chart-bar"><div class="player-chart-bar-fill" style="width:${(values[i] != null ? values[i] : 0) / maxVal * 100}%"></div></div><span class="player-chart-value">${values[i] != null ? values[i] : 0}</span>`;
            bars.appendChild(barWrap);
        });
        wrap.appendChild(bars);
    }
    container.appendChild(wrap);
}

function createMatchingHTML(component) {
    const left = component.props.leftItems || [];
    const right = component.props.rightItems || [];
    const showAnswer = component.props.showCorrectAnswer !== false;
    const leftList = left.map((l, i) => `<li class="matching-left-item" data-index="${i}" tabindex="0">${escapeHtml(l)}</li>`).join('');
    const rightList = right.map((r, i) => `<li class="matching-right-item" data-index="${i}" tabindex="0">${escapeHtml(r)}</li>`).join('');
    return `<div class="matching-card">
        <h3 class="matching-question">${escapeHtml(component.props.question || '配對題')}</h3>
        <p class="matching-hint">點選左側一項，再點選右側一項完成配對（連連看）</p>
        <div class="matching-lines-wrap">
            <svg class="matching-lines-svg" aria-hidden="true"></svg>
            <div class="matching-columns-container">
                <div class="matching-columns"><ul class="matching-left">${leftList}</ul><ul class="matching-right">${rightList}</ul></div>
            </div>
        </div>
        <button type="button" class="matching-check btn-matching">檢查答案</button>
        <div class="matching-result" style="display:none;"></div>${showAnswer ? '<div class="matching-correct" style="display:none;"></div>' : ''}
    </div>`;
}

/** 依可用高度縮放配對區，使所有項目可見（自適應）；縮放後重繪連線 */
function fitMatchingColumns(container) {
    const wrap = container.querySelector('.matching-lines-wrap');
    const columnsContainer = container.querySelector('.matching-columns-container');
    const columns = container.querySelector('.matching-columns');
    if (!wrap || !columnsContainer || !columns) return;
    const availableHeight = wrap.clientHeight;
    const availableWidth = wrap.clientWidth;
    if (availableHeight <= 0 || availableWidth <= 0) return;
    columns.style.transform = '';
    const contentHeight = columns.scrollHeight;
    const contentWidth = columns.scrollWidth;
    let scale = 1;
    if (contentHeight > availableHeight) scale = Math.max(0.25, availableHeight / contentHeight);
    if (contentWidth > availableWidth) {
        const scaleW = Math.max(0.25, availableWidth / contentWidth);
        scale = Math.min(scale, scaleW);
    }
    columns.style.transformOrigin = 'top center';
    columns.style.transform = `scale(${scale})`;
    updateMatchingLines(container);
}

/** 依目前配對狀態重繪連接線（連連看） */
function updateMatchingLines(container) {
    const wrap = container.querySelector('.matching-lines-wrap');
    const svg = container.querySelector('.matching-lines-svg');
    const leftItems = container.querySelectorAll('.matching-left-item');
    const rightItems = container.querySelectorAll('.matching-right-item');
    if (!wrap || !svg || !leftItems.length || !rightItems.length) return;
    const wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width <= 0 || wrapRect.height <= 0) return;
    svg.setAttribute('width', wrapRect.width);
    svg.setAttribute('height', wrapRect.height);
    svg.setAttribute('viewBox', `0 0 ${wrapRect.width} ${wrapRect.height}`);
    svg.innerHTML = '';
    rightItems.forEach((rightEl) => {
        const matched = rightEl.dataset.matched;
        if (matched === undefined || matched === '') return;
        const leftIdx = parseInt(matched, 10);
        const leftEl = leftItems[leftIdx];
        if (!leftEl) return;
        const leftRect = leftEl.getBoundingClientRect();
        const rightRect = rightEl.getBoundingClientRect();
        const y1 = leftRect.top - wrapRect.top + leftRect.height / 2;
        const y2 = rightRect.top - wrapRect.top + rightRect.height / 2;
        const x1 = leftRect.right - wrapRect.left;
        const x2 = rightRect.left - wrapRect.left;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--primary-blue, #2563eb)');
        path.setAttribute('stroke-width', '4');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('class', 'matching-line-path');
        svg.appendChild(path);
        const len = path.getTotalLength();
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
        path.style.transition = 'stroke-dashoffset 0.7s ease-out';
        requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
    });
}

function setupMatchingInteractions(container, component) {
    const leftItems = container.querySelectorAll('.matching-left-item');
    const rightItems = container.querySelectorAll('.matching-right-item');
    const checkBtn = container.querySelector('.matching-check');
    const resultEl = container.querySelector('.matching-result');
    const wrap = container.querySelector('.matching-lines-wrap');
    const correctPairs = component.props.correctPairs || [];
    const pairMap = {};
    if (correctPairs.length) {
        correctPairs.forEach(([l, r]) => { pairMap[l] = r; });
    } else {
        leftItems.forEach((_, i) => { pairMap[i] = i; });
        rightItems.forEach((_, i) => { if (pairMap[i] === undefined) pairMap[i] = i; });
    }
    let selectedLeft = null;

    function drawLines() {
        requestAnimationFrame(() => {
            fitMatchingColumns(container);
        });
    }

    if (wrap) {
        const ro = new ResizeObserver(drawLines);
        ro.observe(wrap);
        requestAnimationFrame(() => { fitMatchingColumns(container); });
    }

    leftItems.forEach(el => {
        el.addEventListener('click', () => {
            leftItems.forEach(e => e.classList.remove('selected'));
            el.classList.add('selected');
            selectedLeft = parseInt(el.dataset.index, 10);
        });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    });
    rightItems.forEach(el => {
        el.addEventListener('click', () => {
            if (selectedLeft === null) return;
            const prevRightWithSameLeft = Array.from(rightItems).find(r => r !== el && r.dataset.matched === String(selectedLeft));
            if (prevRightWithSameLeft) {
                delete prevRightWithSameLeft.dataset.matched;
                prevRightWithSameLeft.classList.remove('paired');
            }
            el.dataset.matched = String(selectedLeft);
            el.classList.add('paired');
            el.classList.add('just-paired');
            setTimeout(() => el.classList.remove('just-paired'), 500);
            leftItems.forEach(e => e.classList.remove('selected'));
            selectedLeft = null;
            drawLines();
        });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    });
    if (checkBtn && resultEl) {
        checkBtn.addEventListener('click', () => {
            let correct = 0;
            rightItems.forEach(r => {
                const leftIdx = r.dataset.matched != null ? parseInt(r.dataset.matched, 10) : -1;
                const rightIdx = parseInt(r.dataset.index, 10);
                if (pairMap[leftIdx] === rightIdx) correct++;
            });
            const total = rightItems.length;
            resultEl.style.display = 'block';
            resultEl.textContent = `答對 ${correct} / ${total}`;
            resultEl.className = 'matching-result ' + (correct === total ? 'matching-result-full' : '');
        });
    }
    drawLines();
}

function createTimerHTML(component) {
    const mode = component.props.mode || 'countdown';
    const sec = component.props.countdownSeconds != null ? component.props.countdownSeconds : 60;
    const showBtns = component.props.showButtons !== false;
    const label = component.props.label || '';
    const timeFs = component.props.timeFontSize != null ? component.props.timeFontSize : 48;
    return `<div class="player-timer-card">
        <div class="player-timer-label">${escapeHtml(label)}</div>
        <div class="player-timer-display" style="font-size:${timeFs}px">${mode === 'countdown' ? formatTimerSec(sec) : '0:00'}</div>
        <div class="player-timer-mode-hint">${mode === 'countdown' ? '倒數計時' : '碼表'}</div>
        ${showBtns ? '<div class="player-timer-btns"><button type="button" class="player-timer-start">開始</button><button type="button" class="player-timer-pause" style="display:none">暫停</button></div>' : ''}
    </div>`;
}

function formatTimerSec(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' + s : s}`;
}

function setupTimerInteractions(container, component) {
    const display = container.querySelector('.player-timer-display');
    const startBtn = container.querySelector('.player-timer-start');
    const pauseBtn = container.querySelector('.player-timer-pause');
    const mode = component.props.mode || 'countdown';
    const totalSec = component.props.countdownSeconds != null ? component.props.countdownSeconds : 60;
    let remaining = totalSec;
    let elapsed = 0;
    let intervalId = null;
    function updateDisplay() {
        if (!display) return;
        if (mode === 'countdown') display.textContent = formatTimerSec(remaining);
        else display.textContent = formatTimerSec(elapsed);
    }
    function tick() {
        if (mode === 'countdown') {
            remaining--;
            if (remaining <= 0) {
                clearInterval(intervalId);
                remaining = 0;
            }
        } else {
            elapsed++;
        }
        updateDisplay();
    }
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (intervalId) return;
            if (mode === 'countdown') remaining = totalSec;
            else elapsed = 0;
            updateDisplay();
            intervalId = setInterval(tick, 1000);
            startBtn.style.display = 'none';
            if (pauseBtn) pauseBtn.style.display = 'inline-block';
        });
    }
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (intervalId) clearInterval(intervalId);
            intervalId = null;
            if (startBtn) startBtn.style.display = 'inline-block';
            pauseBtn.style.display = 'none';
        });
    }
}

// ============================================
// 單選題元件
// ============================================

function createQuizHTML(component) {
    const options = (component.props.options || []).map((opt, idx) => 
        `<li class="quiz-option" data-index="${idx}">${opt}</li>`
    ).join('');
    const showAnswer = component.props.showCorrectAnswer === true;
    return `
        <h3>${component.props.question || '問題'}</h3>
        <ul class="quiz-options">
            ${options}
        </ul>
        <div class="quiz-result" style="display: none;"></div>
        ${showAnswer ? '<div class="quiz-correct-answer" style="display:none;"></div>' : ''}
        <button class="quiz-reset-btn" style="display: none;">重新作答</button>
    `;
}

function setupQuizInteractions(container, component) {
    const options = container.querySelectorAll('.quiz-option');
    const resetBtn = container.querySelector('.quiz-reset-btn');
    const resultEl = container.querySelector('.quiz-result');
    const correctAnswerEl = container.querySelector('.quiz-correct-answer');
    let answered = false;
    
    options.forEach((option, index) => {
        option.addEventListener('click', () => {
            if (answered) return;
            
            answered = true;
            const correctIndex = (component.props.correctIndex || 1) - 1;
            const userIndex = index;
            const isCorrect = userIndex === correctIndex;
            const showAnswer = component.props.showCorrectAnswer === true;
            
            options.forEach((opt, idx) => {
                opt.classList.add('disabled');
                if (idx === correctIndex) {
                    if (isCorrect || showAnswer) opt.classList.add('correct');
                } else if (idx === userIndex) {
                    opt.classList.add('incorrect');
                }
            });
            
            if (resultEl) {
                resultEl.style.display = 'block';
                if (isCorrect) {
                    resultEl.textContent = '你答對了';
                    resultEl.className = 'quiz-result correct';
                } else {
                    resultEl.textContent = showAnswer ? '答錯了，請再想想看。正確答案：選項 ' + (correctIndex + 1) : '答錯了，請再想想看。';
                    resultEl.className = 'quiz-result incorrect';
                }
            }
            if (correctAnswerEl && showAnswer && !isCorrect) {
                correctAnswerEl.textContent = '正確答案：選項 ' + (correctIndex + 1);
                correctAnswerEl.style.display = 'block';
            }
            resetBtn.style.display = 'block';
        });
    });
    
    resetBtn.addEventListener('click', () => {
        answered = false;
        options.forEach(opt => {
            opt.classList.remove('correct', 'incorrect', 'disabled');
        });
        if (resultEl) {
            resultEl.style.display = 'none';
            resultEl.textContent = '';
            resultEl.className = 'quiz-result';
        }
        if (correctAnswerEl) correctAnswerEl.style.display = 'none';
        resetBtn.style.display = 'none';
    });
}

// ============================================
// 複選題元件
// ============================================

function createQuizMultipleHTML(component) {
    const correctIndices = component.props.correctIndices || [0, 1];
    const options = (component.props.options || []).map((opt, idx) => 
        `<li class="quiz-multi-option"><label><input type="checkbox" class="quiz-multi-checkbox" data-index="${idx}"> ${opt}</label></li>`
    ).join('');
    return `
        <h3>${component.props.question || '複選題（至少選 2 個）'}</h3>
        <ul class="quiz-multi-options">
            ${options}
        </ul>
        <button class="quiz-multi-submit" type="button">送出答案</button>
        <div class="quiz-multi-result" style="display: none;"></div>
        <button class="quiz-multi-reset" type="button" style="display: none;">重新作答</button>
    `;
}

function setupQuizMultipleInteractions(container, component) {
    const checkboxes = container.querySelectorAll('.quiz-multi-checkbox');
    const submitBtn = container.querySelector('.quiz-multi-submit');
    const resultEl = container.querySelector('.quiz-multi-result');
    const resetBtn = container.querySelector('.quiz-multi-reset');
    const correctIndices = (component.props.correctIndices || [0, 1]).slice().sort((a, b) => a - b);
    let answered = false;

    submitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (answered) return;
        answered = true;
        const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => parseInt(cb.dataset.index, 10)).sort((a, b) => a - b);
        const correctSet = JSON.stringify(correctIndices);
        const userSet = JSON.stringify(selected);
        const isCorrect = correctSet === userSet;
        checkboxes.forEach(cb => {
            cb.disabled = true;
            const idx = parseInt(cb.dataset.index, 10);
            if (correctIndices.includes(idx)) {
                cb.parentElement.classList.add('correct');
            }
            if (!correctIndices.includes(idx) && cb.checked) {
                cb.parentElement.classList.add('incorrect');
            }
        });
        resultEl.style.display = 'block';
        let resultText = isCorrect ? '答對了！' : '答錯了，請再想想看。';
        if (component.props.showCorrectAnswer !== false) {
            resultText += ' 正確選項：' + correctIndices.map(i => i + 1).join(', ');
        }
        resultEl.textContent = resultText;
        resultEl.className = 'quiz-multi-result ' + (isCorrect ? 'correct' : 'incorrect');
        submitBtn.style.display = 'none';
        resetBtn.style.display = 'block';
    });

    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        answered = false;
        checkboxes.forEach(cb => {
            cb.checked = false;
            cb.disabled = false;
            cb.parentElement.classList.remove('correct', 'incorrect');
        });
        resultEl.style.display = 'none';
        submitBtn.style.display = 'block';
        resetBtn.style.display = 'none';
    });
}

// ============================================
// 拖曳排序元件
// ============================================

function createDragOrderHTML(component) {
    const layout = component.props.layout || 'list';
    const items = component.props.items || [];
    const showAnswer = component.props.showCorrectAnswer !== false;

    if (layout === 'slots') {
        // 左側卡片 + 右側格位（將左側拖到右側對應位置）
        const itemsHtml = items.map((item, idx) =>
            `<li class="drag-item" data-index="${idx}">${String(item).replace(/</g, '&lt;')}</li>`
        ).join('');
        const slotsCount = Math.max(items.length, 1);
        const slotsHtml = Array.from({ length: slotsCount }, (_, i) =>
            `<div class="drag-slot" data-slot-index="${i}">
                <span class="drag-slot-number">${i + 1}</span>
                <div class="drag-slot-drop">${''}</div>
            </div>`
        ).join('');
        return `
            <h3>${(component.props.question || '將左側的步驟拖曳到右側對應的位置').replace(/</g, '&lt;')}</h3>
            <div class="drag-order-slots-layout">
                <div class="drag-order-source">
                    <ul class="drag-items-list">${itemsHtml}</ul>
                </div>
                <div class="drag-order-slots">${slotsHtml}</div>
            </div>
            ${showAnswer ? '<div class="drag-correct-answer" style="display:none;"></div>' : ''}
            <button class="drag-order-reset-btn" style="display: none;">重新排序</button>
        `;
    }

    // 原有：列表內拖曳排序
    const itemsListHtml = items.map((item, idx) =>
        `<li class="drag-item" data-index="${idx}">${String(item).replace(/</g, '&lt;')}</li>`
    ).join('');
    return `
        <h3>${(component.props.question || '請排序').replace(/</g, '&lt;')}</h3>
        <ul class="drag-items-list">
            ${itemsListHtml}
        </ul>
        ${showAnswer ? '<div class="drag-correct-answer" style="display:none;"></div>' : ''}
        <button class="drag-order-reset-btn" style="display: none;">重新排序</button>
    `;
}

/**
 * 左側拖到右側格位：設定可拖曳項目與 dropzone，並檢查正確順序
 */
function setupDragOrderSlotsInteractions(container, component) {
    const sourceList = container.querySelector('.drag-order-source .drag-items-list');
    const slots = container.querySelectorAll('.drag-order-slots .drag-slot');
    const resetBtn = container.querySelector('.drag-order-reset-btn');
    const correctOrder = (component.props.correctOrder || []).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    let isChecking = false;

    if (!sourceList || !slots.length) {
        console.warn('拖曳格位版面缺少來源列表或格位');
        return;
    }

    function getSourceList() {
        return container.querySelector('.drag-order-source .drag-items-list');
    }

    function checkOrderSlots() {
        if (isChecking) return;
        isChecking = true;
        const slotEls = container.querySelectorAll('.drag-order-slots .drag-slot');
        const filledCount = Array.from(slotEls).filter(slot => {
            const dropZone = slot.querySelector('.drag-slot-drop');
            return dropZone && dropZone.querySelector('.drag-item');
        }).length;
        const allFilled = filledCount === slotEls.length;

        if (!allFilled) {
            // 尚未全部放滿：不顯示正確答案、不標記對錯，僅清除既有標記
            slotEls.forEach((slot) => {
                const dropZone = slot.querySelector('.drag-slot-drop');
                const item = dropZone && dropZone.querySelector('.drag-item');
                if (item && item.nodeType === Node.ELEMENT_NODE) {
                    item.classList.remove('correct-position', 'incorrect-position');
                }
            });
            const correctAnswerEl = container.querySelector('.drag-correct-answer');
            if (correctAnswerEl) correctAnswerEl.style.display = 'none';
            if (resetBtn) resetBtn.style.display = 'none';
            isChecking = false;
            return;
        }

        // 全部格位都滿了：才標記對錯並顯示正確答案
        slotEls.forEach((slot, slotIndex) => {
            const dropZone = slot.querySelector('.drag-slot-drop');
            const item = dropZone && dropZone.querySelector('.drag-item');
            const expectedOneBased = correctOrder[slotIndex];
            const expectedIndex = expectedOneBased != null ? expectedOneBased - 1 : -1;
            if (item && item.nodeType === Node.ELEMENT_NODE) {
                const actualIndex = parseInt(item.dataset.index, 10);
                item.classList.remove('correct-position', 'incorrect-position');
                if (actualIndex === expectedIndex) {
                    item.classList.add('correct-position');
                } else {
                    item.classList.add('incorrect-position');
                }
            }
        });
        const correctAnswerEl = container.querySelector('.drag-correct-answer');
        if (correctAnswerEl && component.props.showCorrectAnswer !== false) {
            correctAnswerEl.textContent = '正確順序：' + (component.props.correctOrder || []).join(', ');
            correctAnswerEl.style.display = 'block';
        }
        if (resetBtn) resetBtn.style.display = 'block';
        isChecking = false;
    }

    function resetSlots() {
        const list = getSourceList();
        if (!list) return;
        const allItems = container.querySelectorAll('.drag-item');
        const sorted = Array.from(allItems).filter(el => el && el.nodeType === Node.ELEMENT_NODE)
            .sort((a, b) => parseInt(a.dataset.index, 10) - parseInt(b.dataset.index, 10));
        sorted.forEach(item => {
            item.classList.remove('correct-position', 'incorrect-position', 'dragging');
            item.style.transform = '';
            item.removeAttribute('data-x');
            item.removeAttribute('data-y');
            list.appendChild(item);
        });
        container.querySelectorAll('.drag-slot-drop').forEach(drop => {
            while (drop.firstChild) drop.removeChild(drop.firstChild);
        });
        const correctAnswerEl = container.querySelector('.drag-correct-answer');
        if (correctAnswerEl) correctAnswerEl.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
    }

    // 可拖曳項目：左側列表內的 .drag-item
    let items = container.querySelectorAll('.drag-order-source .drag-item');
    items = Array.from(items).filter(el => el && el.nodeType === Node.ELEMENT_NODE);

    items.forEach(item => {
        interact(item).draggable({
            inertia: false,
            autoScroll: false,
            listeners: {
                start: (e) => {
                    if (e.target && e.target.nodeType === Node.ELEMENT_NODE) {
                        e.target.classList.add('dragging');
                        e.target.style.zIndex = '1000';
                    }
                },
                move: (e) => {
                    const t = e.target;
                    if (!t || t.nodeType !== Node.ELEMENT_NODE) return;
                    const x = (parseFloat(t.getAttribute('data-x')) || 0) + e.dx;
                    const y = (parseFloat(t.getAttribute('data-y')) || 0) + e.dy;
                    t.setAttribute('data-x', x);
                    t.setAttribute('data-y', y);
                    t.style.transform = `translate(${x}px, ${y}px)`;
                },
                end: (e) => {
                    if (e.target && e.target.nodeType === Node.ELEMENT_NODE) {
                        e.target.classList.remove('dragging');
                        e.target.style.zIndex = '';
                        const list = getSourceList();
                        if (list && !e.target.closest('.drag-slot-drop')) {
                            list.appendChild(e.target);
                            e.target.setAttribute('data-x', 0);
                            e.target.setAttribute('data-y', 0);
                            e.target.style.transform = '';
                        }
                    }
                }
            }
        });
    });

    // 每個格位的放置區為 dropzone
    container.querySelectorAll('.drag-slot-drop').forEach(dropZone => {
        if (!dropZone || dropZone.nodeType !== Node.ELEMENT_NODE) return;
        interact(dropZone).dropzone({
            accept: '.drag-item',
            overlap: 0.25,
            ondrop: (e) => {
                const dragged = e.relatedTarget;
                if (!dragged || dragged.nodeType !== Node.ELEMENT_NODE) return;
                const existing = dropZone.querySelector('.drag-item');
                const list = getSourceList();
                if (existing && list) list.appendChild(existing);
                dragged.setAttribute('data-x', 0);
                dragged.setAttribute('data-y', 0);
                dragged.style.transform = '';
                dropZone.appendChild(dragged);
                requestAnimationFrame(checkOrderSlots);
            }
        });
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', resetSlots);
    }
}

function setupDragOrderInteractions(container, component) {
    if (typeof interact === 'undefined') {
        console.error('Interact.js 未載入');
        return;
    }
    
    // 確保 container 是有效的 DOM 元素且已掛載到 document（避免 interact.js contains 錯誤）
    if (!container || !container.nodeType || container.nodeType !== Node.ELEMENT_NODE) {
        console.error('container 不是有效的 DOM 元素:', container);
        return;
    }
    if (!document.body.contains(container)) {
        console.warn('container 尚未掛載到 document，略過拖曳設定');
        return;
    }

    const layout = component.props.layout || 'list';
    if (layout === 'slots') {
        setupDragOrderSlotsInteractions(container, component);
        return;
    }
    
    const itemsList = container.querySelector('.drag-items-list');
    if (!itemsList || !itemsList.nodeType || itemsList.nodeType !== Node.ELEMENT_NODE) {
        console.error('itemsList 不是有效的 DOM 元素:', itemsList);
        return;
    }
    
    let items = container.querySelectorAll('.drag-item');
    if (!items || items.length === 0) {
        console.warn('沒有找到拖曳項目');
        return;
    }
    
    // 將 NodeList 轉換為陣列，並過濾出有效的元素
    const validItems = Array.from(items).filter(item => 
        item && item.nodeType === Node.ELEMENT_NODE
    );
    
    if (validItems.length === 0) {
        console.warn('沒有有效的拖曳項目');
        return;
    }
    
    const resetBtn = container.querySelector('.drag-order-reset-btn');
    const correctOrder = component.props.correctOrder || [];
    let isChecking = false;
    
    // 設定拖曳功能（優化設定以提升流暢度）
    // interact 可以接受選擇器字串、單個元素或元素陣列
    validItems.forEach(item => {
        interact(item).draggable({
            inertia: false, // 關閉慣性，讓操作更直接
            modifiers: [
                interact.modifiers.restrictRect({
                    restriction: itemsList,
                    endOnly: true
                })
            ],
            autoScroll: false, // 關閉自動滾動，減少卡頓
            listeners: {
                start: (event) => {
                    if (event.target && event.target.nodeType === Node.ELEMENT_NODE) {
                        event.target.classList.add('dragging');
                        // 提升 z-index 確保拖曳項目在最上層
                        event.target.style.zIndex = '1000';
                    }
                },
                move: (event) => {
                    const target = event.target;
                    if (!target || target.nodeType !== Node.ELEMENT_NODE) return;
                    
                    const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                    const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                    
                    // 使用 transform 而非直接設定位置，效能更好
                    target.setAttribute('data-x', x);
                    target.setAttribute('data-y', y);
                    target.style.transform = `translate(${x}px, ${y}px)`;
                },
                end: (event) => {
                    if (event.target && event.target.nodeType === Node.ELEMENT_NODE) {
                        event.target.classList.remove('dragging');
                        event.target.style.zIndex = '';
                    }
                }
            }
        });
        
        // 使用 interact 的 onend 事件處理排序（優化版本）
        interact(item).on('dragend', (event) => {
            const target = event.target;
            if (!target || target.nodeType !== Node.ELEMENT_NODE) return;
            
            // 計算新位置
            const targetRect = target.getBoundingClientRect();
            const targetCenterY = targetRect.top + targetRect.height / 2;
            
            // 重新取得列表（因為可能已經改變）
            const currentItems = container.querySelectorAll('.drag-item');
            const currentItemsArray = Array.from(currentItems).filter(item => 
                item && item.nodeType === Node.ELEMENT_NODE
            );
            
            let newIndex = 0;
            currentItemsArray.forEach((item, index) => {
                if (item !== target && item.nodeType === Node.ELEMENT_NODE) {
                    const rect = item.getBoundingClientRect();
                    const centerY = rect.top + rect.height / 2;
                    if (targetCenterY > centerY) {
                        newIndex = index + 1;
                    }
                }
            });
            
            const oldIndex = currentItemsArray.indexOf(target);
            if (oldIndex !== newIndex) {
                // 重新排序
                if (newIndex > oldIndex) {
                    if (currentItemsArray[newIndex + 1]) {
                        itemsList.insertBefore(target, currentItemsArray[newIndex + 1]);
                    } else {
                        itemsList.appendChild(target);
                    }
                } else {
                    itemsList.insertBefore(target, currentItemsArray[newIndex]);
                }
                
                // 重置 transform
                target.setAttribute('data-x', 0);
                target.setAttribute('data-y', 0);
                target.style.transform = 'translate(0px, 0px)';
                
                // 使用 requestAnimationFrame 優化檢查順序
                requestAnimationFrame(() => {
                    checkOrder();
                });
            } else {
                // 重置位置
                target.setAttribute('data-x', 0);
                target.setAttribute('data-y', 0);
                target.style.transform = 'translate(0px, 0px)';
            }
        });
    });
    
    // 檢查順序
    function checkOrder() {
        if (isChecking) return;
        isChecking = true;
        
        // 重新取得當前列表
        const currentItems = container.querySelectorAll('.drag-item');
        const currentItemsArray = Array.from(currentItems).filter(item => 
            item && item.nodeType === Node.ELEMENT_NODE
        );
        
        // 清除所有標記
        currentItemsArray.forEach(item => {
            if (item.nodeType === Node.ELEMENT_NODE) {
                item.classList.remove('correct-position', 'incorrect-position');
            }
        });
        
        // 檢查每個項目
        // correctOrder 是從1開始的（1-based），需要轉換為陣列索引（0-based）
        let allCorrect = true;
        currentItemsArray.forEach((item, currentIndex) => {
            if (!item || item.nodeType !== Node.ELEMENT_NODE) return;
            
            const originalIndex = parseInt(item.dataset.index); // 0-based 陣列索引
            const originalNumber = originalIndex + 1; // 轉換為1-based編號
            const expectedPosition = correctOrder.indexOf(originalNumber); // 在correctOrder中的位置（0-based）
            
            if (expectedPosition === currentIndex) {
                item.classList.add('correct-position');
            } else {
                item.classList.add('incorrect-position');
                allCorrect = false;
            }
        });
        
        if (allCorrect && correctOrder.length > 0) {
            currentItemsArray.forEach(item => {
                if (item.nodeType === Node.ELEMENT_NODE) {
                    item.classList.remove('incorrect-position');
                    item.classList.add('correct-position');
                }
            });
        }
        const correctAnswerEl = container.querySelector('.drag-correct-answer');
        if (correctAnswerEl) {
            correctAnswerEl.textContent = '正確順序：' + (component.props.correctOrder || []).join(', ');
            correctAnswerEl.style.display = 'block';
        }
        if (resetBtn && resetBtn.nodeType === Node.ELEMENT_NODE) {
            resetBtn.style.display = 'block';
        }
        isChecking = false;
    }
    
    // 重做功能
    if (resetBtn && resetBtn.nodeType === Node.ELEMENT_NODE) {
        resetBtn.addEventListener('click', () => {
            // 重置順序
            const currentItems = container.querySelectorAll('.drag-item');
            const sortedItems = Array.from(currentItems).filter(item => 
                item && item.nodeType === Node.ELEMENT_NODE
            ).sort((a, b) => {
            return parseInt(a.dataset.index) - parseInt(b.dataset.index);
        });
        
            sortedItems.forEach(item => {
                if (item.nodeType === Node.ELEMENT_NODE) {
                    item.setAttribute('data-x', 0);
                    item.setAttribute('data-y', 0);
                    item.style.transform = 'translate(0px, 0px)';
                    item.classList.remove('correct-position', 'incorrect-position', 'dragging');
                    if (itemsList && itemsList.nodeType === Node.ELEMENT_NODE) {
                        itemsList.appendChild(item);
                    }
                }
            });
            const correctAnswerEl = container.querySelector('.drag-correct-answer');
            if (correctAnswerEl) correctAnswerEl.style.display = 'none';
            
            // 重新取得列表並重新設定 interact
            const newItems = container.querySelectorAll('.drag-item');
            const newValidItems = Array.from(newItems).filter(item => 
                item && item.nodeType === Node.ELEMENT_NODE
            );
            
            // 重新設定拖曳功能
            newValidItems.forEach(item => {
                interact(item).draggable({
                    inertia: false,
                    modifiers: [
                        interact.modifiers.restrictRect({
                            restriction: itemsList,
                            endOnly: true
                        })
                    ],
                    autoScroll: false,
                    listeners: {
                        start: (event) => {
                            if (event.target && event.target.nodeType === Node.ELEMENT_NODE) {
                                event.target.classList.add('dragging');
                                event.target.style.zIndex = '1000';
                            }
                        },
                        move: (event) => {
                            const target = event.target;
                            if (!target || target.nodeType !== Node.ELEMENT_NODE) return;
                            
                            const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                            const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                            
                            target.setAttribute('data-x', x);
                            target.setAttribute('data-y', y);
                            target.style.transform = `translate(${x}px, ${y}px)`;
                        },
                        end: (event) => {
                            if (event.target && event.target.nodeType === Node.ELEMENT_NODE) {
                                event.target.classList.remove('dragging');
                                event.target.style.zIndex = '';
                            }
                        }
                    }
                });
            });
            
            if (resetBtn && resetBtn.nodeType === Node.ELEMENT_NODE) {
                resetBtn.style.display = 'none';
            }
        });
    }
}

// ============================================
// 底部導覽
// ============================================

function setupNavigation() {
    if (!projectData) return;
    
    // 建立章節圓形按鈕
    createChapterButtons();
    
    // 更新目前位置顯示
    updateCurrentSlideInfo();
}

function createChapterButtons() {
    const chapterButtons = document.getElementById('chapter-buttons');
    chapterButtons.innerHTML = '';
    
    if (!projectData) return;
    
    projectData.chapters.forEach((chapter, index) => {
        const button = document.createElement('span');
        button.className = 'chapter-number';
        button.textContent = (index + 1).toString();
        button.dataset.chapterIndex = index;
        
        // 點擊事件
        button.addEventListener('click', () => {
            goToChapter(index);
        });
        
        chapterButtons.appendChild(button);
    });
    
    // 更新活動狀態
    updateChapterButtons();
}

function updateChapterButtons() {
    const buttons = document.querySelectorAll('.chapter-number');
    buttons.forEach((button, index) => {
        if (index === currentChapterIndex) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

function goToChapter(chapterIndex) {
    if (!projectData || chapterIndex < 0 || chapterIndex >= projectData.chapters.length) return;
    
    // 跳到該章節的第一頁（與編輯器一致：點章節 = 該章第 1 頁）
    goToSlide(chapterIndex, 0);
}

function goToSlide(chapterIndex, slideIndex) {
    if (!projectData) return;
    const chapter = projectData.chapters[chapterIndex];
    if (!chapter || slideIndex < 0 || slideIndex >= chapter.slides.length) return;

    const slidesContainer = document.getElementById('slides-container');
    if (!slidesContainer) {
        updateChapterButtons();
        updateCurrentSlideInfo();
        return;
    }
    const sections = slidesContainer.querySelectorAll('section');
    for (let i = 0; i < sections.length; i++) {
        const ch = parseInt(sections[i].dataset.chapterIndex, 10);
        const sl = parseInt(sections[i].dataset.slideIndex, 10);
        if (ch === chapterIndex && sl === slideIndex) {
            showSlideByIndex(i);
            return;
        }
    }
    updateChapterButtons();
    updateCurrentSlideInfo();
}

function updateCurrentSlideInfo(horizontalIndex, verticalIndex) {
    // 依目前顯示的 section 的 data-chapter-index / data-slide-index 來顯示章節-頁面，與編輯器一致
    const slidesContainer = document.getElementById('slides-container');
    if (slidesContainer && horizontalIndex !== undefined && horizontalIndex !== null) {
        const sections = slidesContainer.querySelectorAll('section');
        const section = sections[horizontalIndex];
        if (section) {
            const ch = section.dataset.chapterIndex;
            const sl = section.dataset.slideIndex;
            if (ch !== undefined && sl !== undefined) {
                currentChapterIndex = parseInt(ch, 10);
                currentSlideIndex = parseInt(sl, 10);
            }
        }
    }
    
    // 更新章節按鈕狀態
    updateChapterButtons();
    
    // 更新資訊文字（格式：章節-頁面，例如：5-1）
    const chapterNum = currentChapterIndex + 1;
    const slideNum = currentSlideIndex + 1;
    const currentInfo = document.getElementById('current-info');
    if (currentInfo) {
        currentInfo.textContent = `${chapterNum}-${slideNum}`;
    }
}

function updateNavigation() {
    updateChapterButtons();
    updateCurrentSlideInfo();
    updateNavArrows();
}

// ============================================
// 翻頁箭頭按鈕
// ============================================

function setupNavArrows() {
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (currentGlobalSlideIndex > 0) {
                showSlideByIndex(currentGlobalSlideIndex - 1);
            }
        });
    }
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const slidesContainer = document.getElementById('slides-container');
            const total = slidesContainer ? slidesContainer.querySelectorAll('section').length : 0;
            if (currentGlobalSlideIndex < total - 1) {
                showSlideByIndex(currentGlobalSlideIndex + 1);
            }
        });
    }
    
    // 初始更新按鈕狀態
    updateNavArrows();
}

function updateNavArrows() {
    const slidesContainer = document.getElementById('slides-container');
    const total = slidesContainer ? slidesContainer.querySelectorAll('section').length : 0;
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const isFirst = total === 0 || currentGlobalSlideIndex === 0;
    const isLast = total === 0 || currentGlobalSlideIndex === total - 1;
    
    if (btnPrev) {
        if (isFirst) {
            btnPrev.style.opacity = '0.3';
            btnPrev.style.cursor = 'not-allowed';
            btnPrev.disabled = true;
        } else {
            btnPrev.style.opacity = '1';
            btnPrev.style.cursor = 'pointer';
            btnPrev.disabled = false;
        }
    }
    
    if (btnNext) {
        if (isLast) {
            btnNext.style.opacity = '0.3';
            btnNext.style.cursor = 'not-allowed';
            btnNext.disabled = true;
        } else {
            btnNext.style.opacity = '1';
            btnNext.style.cursor = 'pointer';
            btnNext.disabled = false;
        }
    }
}
