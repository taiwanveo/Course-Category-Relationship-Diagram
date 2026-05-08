/* ============================================================
 * 儲存層（Dexie + LocalStorage）
 * - LocalStorage：theme/palette/layout/aiModel/lastDiagramId/storageNoticeDismissed/v1MigrationDone
 * - IndexedDB（Dexie）：diagrams / versions / settings / apiKeys / aiCache / uploads / kv
 * ============================================================ */

// 全域命名空間
window.AppStorage = (function () {
    const DB_NAME = 'CourseCategoryDiagramApp';
    const DB_VERSION = 1;

    const db = new Dexie(DB_NAME);
    db.version(DB_VERSION).stores({
        diagrams: 'id, name, subject, updatedAt',
        versions: '++id, diagramId, createdAt, kind',
        settings: 'key',
        apiKeys: 'provider',           // provider, ciphertext, iv, salt
        aiCache: 'key, createdAt',     // key=hash, value=result
        uploads: '++id, diagramId, createdAt',
        kv: 'key'                       // 一般 key/value
    });

    // ============================================================
    // LocalStorage 包裝
    // ============================================================
    const LS_KEYS = {
        theme: 'ccrd:theme',
        palette: 'ccrd:palette',
        layout: 'ccrd:layout',
        aiModel: 'ccrd:aiModel',
        lastDiagramId: 'ccrd:lastDiagramId',
        storageNoticeDismissed: 'ccrd:storageNoticeDismissed',
        v1MigrationDone: 'ccrd:v1MigrationDone',
        sidebarLeftCollapsed: 'ccrd:sidebarLeftCollapsed',
        textDefault: 'ccrd:default:text',
        cardDefault: 'ccrd:default:card',
        viewMode: 'ccrd:viewMode'
    };

    function lsGet(key, def) {
        try {
            const v = localStorage.getItem(key);
            return v == null ? def : v;
        } catch (e) { return def; }
    }
    function lsSet(key, val) {
        try { localStorage.setItem(key, val); } catch (e) {}
    }
    function lsDel(key) {
        try { localStorage.removeItem(key); } catch (e) {}
    }

    const Settings = {
        getTheme() { return lsGet(LS_KEYS.theme, 'light'); },
        setTheme(v) { lsSet(LS_KEYS.theme, v); },
        getPalette() { return lsGet(LS_KEYS.palette, 'aurora'); },
        setPalette(v) { lsSet(LS_KEYS.palette, v); },
        getLayout() { return lsGet(LS_KEYS.layout, 'free'); },
        setLayout(v) { lsSet(LS_KEYS.layout, v); },
        getAIModel() { return lsGet(LS_KEYS.aiModel, ''); },
        setAIModel(v) { lsSet(LS_KEYS.aiModel, v); },
        getLastDiagramId() { return lsGet(LS_KEYS.lastDiagramId, null); },
        setLastDiagramId(v) { v == null ? lsDel(LS_KEYS.lastDiagramId) : lsSet(LS_KEYS.lastDiagramId, v); },
        isStorageNoticeDismissed() { return lsGet(LS_KEYS.storageNoticeDismissed, '') === '1'; },
        dismissStorageNotice() { lsSet(LS_KEYS.storageNoticeDismissed, '1'); },
        isV1MigrationDone() { return lsGet(LS_KEYS.v1MigrationDone, '') === '1'; },
        markV1MigrationDone() { lsSet(LS_KEYS.v1MigrationDone, '1'); },
        isSidebarLeftCollapsed() { return lsGet(LS_KEYS.sidebarLeftCollapsed, '') === '1'; },
        setSidebarLeftCollapsed(v) { lsSet(LS_KEYS.sidebarLeftCollapsed, v ? '1' : '0'); },
        getTextDefault() {
            try { const v = lsGet(LS_KEYS.textDefault, ''); return v ? JSON.parse(v) : null; } catch (e) { return null; }
        },
        setTextDefault(style) {
            try { lsSet(LS_KEYS.textDefault, JSON.stringify(style || {})); } catch (e) {}
        },
        clearTextDefault() { lsDel(LS_KEYS.textDefault); },
        // 課程類別卡的使用者自訂預設樣式
        getCardDefault() {
            try { const v = lsGet(LS_KEYS.cardDefault, ''); return v ? JSON.parse(v) : null; } catch (e) { return null; }
        },
        setCardDefault(style) {
            try { lsSet(LS_KEYS.cardDefault, JSON.stringify(style || {})); } catch (e) {}
        },
        clearCardDefault() { lsDel(LS_KEYS.cardDefault); },
        // 顯示模式：'full'（顯示班名等所有資訊） | 'skeleton'（只顯示分類骨架）
        getViewMode() {
            const v = lsGet(LS_KEYS.viewMode, 'full');
            return v === 'skeleton' ? 'skeleton' : 'full';
        },
        setViewMode(v) {
            lsSet(LS_KEYS.viewMode, v === 'skeleton' ? 'skeleton' : 'full');
        }
    };

    // ============================================================
    // 分類圖 CRUD
    // ============================================================
    async function listDiagrams() {
        return db.diagrams.orderBy('updatedAt').reverse().toArray();
    }
    async function getDiagram(id) {
        return db.diagrams.get(id);
    }
    async function saveDiagram(diagram) {
        if (!diagram.id) throw new Error('diagram.id required');
        diagram.updatedAt = Date.now();
        await db.diagrams.put(diagram);
        return diagram;
    }
    async function deleteDiagram(id) {
        await db.transaction('rw', db.diagrams, db.versions, db.uploads, async () => {
            await db.diagrams.delete(id);
            await db.versions.where('diagramId').equals(id).delete();
            await db.uploads.where('diagramId').equals(id).delete();
        });
    }

    // ============================================================
    // 版本快照
    // ============================================================
    async function listVersions(diagramId) {
        return db.versions.where('diagramId').equals(diagramId).reverse().sortBy('createdAt');
    }
    async function addVersion(diagramId, snapshot, kind, note) {
        const row = {
            diagramId,
            createdAt: Date.now(),
            kind: kind || 'auto',  // 'auto' | 'manual'
            note: note || '',
            snapshot
        };
        await db.versions.add(row);
        // 自動清理 auto 版本（保留 N 筆）
        const KEEP_AUTO = 30;
        const autos = await db.versions
            .where('diagramId').equals(diagramId)
            .filter(v => v.kind === 'auto')
            .reverse().sortBy('createdAt');
        if (autos.length > KEEP_AUTO) {
            const toDelete = autos.slice(KEEP_AUTO);
            await db.versions.bulkDelete(toDelete.map(v => v.id));
        }
    }
    async function getVersion(id) {
        return db.versions.get(id);
    }
    async function deleteVersion(id) {
        await db.versions.delete(id);
    }

    // ============================================================
    // API Keys（已加密內容）
    // ============================================================
    async function setApiKey(provider, encrypted) {
        await db.apiKeys.put({ provider, ...encrypted });
    }
    async function getApiKey(provider) {
        return db.apiKeys.get(provider);
    }
    async function listApiKeys() {
        return db.apiKeys.toArray();
    }
    async function deleteApiKey(provider) {
        await db.apiKeys.delete(provider);
    }
    async function clearApiKeys() {
        await db.apiKeys.clear();
    }

    // ============================================================
    // AI 結果快取
    // ============================================================
    async function getAICache(key) {
        const row = await db.aiCache.get(key);
        return row ? row.value : null;
    }
    async function setAICache(key, value) {
        await db.aiCache.put({ key, value, createdAt: Date.now() });
        // 自動清理超過 30 天的快取
        const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
        await db.aiCache.where('createdAt').below(cutoff).delete();
    }

    // ============================================================
    // Uploads
    // ============================================================
    async function addUpload(diagramId, fileName, parsedRows) {
        return db.uploads.add({
            diagramId, fileName, parsedRows, createdAt: Date.now()
        });
    }

    // ============================================================
    // KV / 全域設定（補充 LocalStorage 不夠用之處）
    // ============================================================
    async function kvGet(key, def) {
        const row = await db.kv.get(key);
        return row ? row.value : def;
    }
    async function kvSet(key, value) {
        await db.kv.put({ key, value });
    }
    async function kvDel(key) {
        await db.kv.delete(key);
    }

    // ============================================================
    // v1 草稿遷移
    // 舊 v1 db: 'CourseCategoryDiagram', store 'draft'
    // ============================================================
    async function tryMigrateV1Draft() {
        if (Settings.isV1MigrationDone()) return null;
        try {
            const v1db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('CourseCategoryDiagram');
                req.onerror = () => reject(req.error);
                req.onsuccess = () => resolve(req.result);
                req.onupgradeneeded = () => { /* 沒有舊資料 */ };
            });
            if (!v1db || !v1db.objectStoreNames.contains('draft')) {
                Settings.markV1MigrationDone();
                v1db && v1db.close();
                return null;
            }
            const [payloadStr, assetsStr] = await Promise.all([
                new Promise(res => {
                    const tx = v1db.transaction('draft', 'readonly');
                    const r = tx.objectStore('draft').get('project');
                    r.onsuccess = () => res(r.result);
                    r.onerror = () => res(null);
                }),
                new Promise(res => {
                    const tx = v1db.transaction('draft', 'readonly');
                    const r = tx.objectStore('draft').get('assets');
                    r.onsuccess = () => res(r.result);
                    r.onerror = () => res(null);
                })
            ]);
            v1db.close();
            if (!payloadStr) {
                Settings.markV1MigrationDone();
                return null;
            }
            const payload = JSON.parse(payloadStr);
            if (!payload || !payload.projectData) {
                Settings.markV1MigrationDone();
                return null;
            }
            const assets = assetsStr ? (JSON.parse(assetsStr) || {}) : {};
            const diagram = upgradeProjectToV3(payload.projectData, assets);
            await saveDiagram(diagram);
            Settings.setLastDiagramId(diagram.id);
            Settings.markV1MigrationDone();
            return diagram;
        } catch (e) {
            console.warn('v1 草稿遷移失敗或無資料', e);
            Settings.markV1MigrationDone();
            return null;
        }
    }

    // ============================================================
    // v1 → v3 結構升級
    // ============================================================
    function upgradeProjectToV3(v1Project, v1Assets) {
        const id = v1Project.projectId || generateUUID();
        const tagLib = v1Project.tagLibrary || {};
        // 補上第 5 類「屬性」
        if (!Array.isArray(tagLib.attribute)) {
            tagLib.attribute = [];
        }
        // 為班名分類做空白準備
        const components = (v1Project.components || []).map(c => {
            if (c.type === 'course-category') {
                if (!c.props.classes) c.props.classes = [];
                if (!c.props.assignedTags.attribute) c.props.assignedTags.attribute = [];
            }
            return c;
        });
        return {
            id,
            version: '3.0',
            name: v1Project.title || '未命名分類圖',
            subject: v1Project.subject || '人工智慧 (AI)',
            board: v1Project.board || { w: 3200, h: 1800, background: { type: 'fineGrid', baseColor: '#ffffff', gridColor: '#e2e8f0' } },
            tagLibrary: tagLib,
            components,
            connectors: v1Project.connectors || [],
            assets: v1Assets || {},
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    return {
        db,
        Settings,
        listDiagrams, getDiagram, saveDiagram, deleteDiagram,
        listVersions, addVersion, getVersion, deleteVersion,
        setApiKey, getApiKey, listApiKeys, deleteApiKey, clearApiKeys,
        getAICache, setAICache,
        addUpload,
        kvGet, kvSet, kvDel,
        tryMigrateV1Draft, upgradeProjectToV3, generateUUID
    };
})();
