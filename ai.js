/* ============================================================
 * AI 整合層
 * - Web Crypto AES-GCM + PBKDF2 加密 API Key
 * - OpenAI / Gemini / Grok / Mock 提供商
 * - classifyClasses() 統一介面
 * ============================================================ */

window.AppAI = (function () {
    let masterPassword = null;   // 僅在 session 記憶體中
    let derivedKeys = new Map(); // salt(b64) -> CryptoKey

    // ============================================================
    // 加密工具
    // ============================================================
    function bytesToB64(bytes) {
        let binary = '';
        const arr = new Uint8Array(bytes);
        for (let i = 0; i < arr.byteLength; i++) binary += String.fromCharCode(arr[i]);
        return btoa(binary);
    }
    function b64ToBytes(b64) {
        const binary = atob(b64);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        return arr;
    }

    async function deriveKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptWithMaster(plaintext) {
        if (!masterPassword) throw new Error('尚未設定主密碼');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(masterPassword, salt);
        const enc = new TextEncoder();
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            enc.encode(plaintext)
        );
        return {
            ciphertext: bytesToB64(ciphertext),
            iv: bytesToB64(iv),
            salt: bytesToB64(salt)
        };
    }

    async function decryptWithMaster(record, password) {
        const pwd = password || masterPassword;
        if (!pwd) throw new Error('尚未設定主密碼');
        const salt = b64ToBytes(record.salt);
        const iv = b64ToBytes(record.iv);
        const key = await deriveKey(pwd, salt);
        const dec = new TextDecoder();
        try {
            const plain = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                b64ToBytes(record.ciphertext)
            );
            return dec.decode(plain);
        } catch (e) {
            throw new Error('主密碼錯誤或資料已損毀');
        }
    }

    // ============================================================
    // 主密碼狀態
    // ============================================================
    function setMasterPassword(pwd) {
        masterPassword = pwd;
    }
    function clearMasterPassword() {
        masterPassword = null;
    }
    function hasMasterPasswordInMemory() {
        return masterPassword != null;
    }

    // ============================================================
    // API Key 管理
    // ============================================================
    async function saveApiKey(provider, plainKey) {
        const enc = await encryptWithMaster(plainKey);
        await AppStorage.setApiKey(provider, enc);
    }
    async function loadApiKey(provider) {
        const row = await AppStorage.getApiKey(provider);
        if (!row) return null;
        return await decryptWithMaster(row);
    }
    async function deleteApiKey(provider) {
        await AppStorage.deleteApiKey(provider);
    }

    // ============================================================
    // Provider 設定
    // ============================================================
    // 注意：fallbackModels 僅在 API 抓取失敗時做最後備援，實際以即時抓取為準。
    const PROVIDERS = {
        openai: {
            id: 'openai',
            name: 'OpenAI',
            badges: ['付費', '回應穩定', '分類品質高', '額度依方案'],
            defaultModel: 'gpt-4o-mini',
            fallbackModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o3-mini', 'o1-mini'],
            description: '需要 OpenAI 帳號 API Key（sk-...）。gpt-4o-mini 為最經濟選擇，適合大量分類任務。',
            keyHint: 'sk-...',
            docs: 'https://platform.openai.com/api-keys'
        },
        gemini: {
            id: 'gemini',
            name: 'Google Gemini',
            badges: ['有免費額度', '回應快速', '對中文友好'],
            defaultModel: 'gemini-1.5-flash',
            fallbackModels: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
            description: 'Google AI Studio 提供免費額度，flash 系列回應快速。需要 Google AI Studio API Key。',
            keyHint: 'AIza...',
            docs: 'https://aistudio.google.com/apikey'
        },
        grok: {
            id: 'grok',
            name: 'xAI Grok',
            badges: ['付費', '較長 context', '訓練資料較新'],
            defaultModel: 'grok-2-latest',
            fallbackModels: ['grok-2-latest', 'grok-3', 'grok-4', 'grok-beta'],
            description: 'xAI 平台 API Key（xai-...），訓練資料較新但成本較高。',
            keyHint: 'xai-...',
            docs: 'https://console.x.ai/'
        },
        mock: {
            id: 'mock',
            name: 'Mock（離線示範）',
            badges: ['免費', '離線可用', '示範用'],
            defaultModel: 'mock',
            fallbackModels: ['mock'],
            description: '不呼叫真實 AI，回傳預設範例分類結果。可用於快速試用整體流程。',
            keyHint: '',
            docs: ''
        }
    };

    // ============================================================
    // 即時抓取模型清單（各家專屬 API）
    // ============================================================
    const MODELS_CACHE_TTL = 60 * 60 * 1000; // 1 小時

    async function fetchOpenAIModels(apiKey) {
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': 'Bearer ' + apiKey }
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`OpenAI 列出模型失敗 ${res.status}: ${text.slice(0, 240)}`);
        }
        const data = await res.json();
        const models = (data.data || [])
            .map(m => m.id)
            .filter(id => /^(gpt-|chatgpt-|o[1-9])/i.test(id))
            .sort();
        return models;
    }

    async function fetchGeminiModels(apiKey) {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`
        );
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Gemini 列出模型失敗 ${res.status}: ${text.slice(0, 240)}`);
        }
        const data = await res.json();
        const models = (data.models || [])
            .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .map(m => (m.name || '').replace(/^models\//, ''))
            .filter(Boolean)
            .sort();
        return models;
    }

    async function fetchGrokModels(apiKey) {
        const res = await fetch('https://api.x.ai/v1/models', {
            headers: { 'Authorization': 'Bearer ' + apiKey }
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Grok 列出模型失敗 ${res.status}: ${text.slice(0, 240)}`);
        }
        const data = await res.json();
        const models = (data.data || data.models || [])
            .map(m => m.id || m.name)
            .filter(Boolean)
            .sort();
        return models;
    }

    async function getCachedModels(providerId) {
        const row = await AppStorage.kvGet('models:' + providerId);
        if (row && row.fetchedAt && (Date.now() - row.fetchedAt) < MODELS_CACHE_TTL) {
            return { models: row.models, fetchedAt: row.fetchedAt, fresh: true };
        }
        if (row && row.models) {
            return { models: row.models, fetchedAt: row.fetchedAt, fresh: false };
        }
        return null;
    }

    /**
     * 取得指定提供商的可用模型清單。
     * @param {string} providerId
     * @param {object} opt - { forceRefresh: boolean, allowFallback: boolean }
     * @returns {Promise<{ models:string[], source:'cache'|'live'|'fallback', fetchedAt?:number }>}
     */
    async function fetchModels(providerId, opt) {
        opt = opt || {};
        const provider = getProvider(providerId);
        if (provider.id === 'mock') {
            return { models: ['mock'], source: 'live' };
        }
        if (!opt.forceRefresh) {
            const cached = await getCachedModels(providerId);
            if (cached && cached.fresh) {
                return { models: cached.models, source: 'cache', fetchedAt: cached.fetchedAt };
            }
        }
        const apiKey = await loadApiKey(providerId);
        if (!apiKey) {
            // 沒有 key 就回備援
            return { models: provider.fallbackModels.slice(), source: 'fallback' };
        }
        try {
            let models;
            if (provider.id === 'openai') models = await fetchOpenAIModels(apiKey);
            else if (provider.id === 'gemini') models = await fetchGeminiModels(apiKey);
            else if (provider.id === 'grok') models = await fetchGrokModels(apiKey);
            else throw new Error('未知的 provider: ' + providerId);
            if (!models || models.length === 0) throw new Error('API 回應為空清單');
            await AppStorage.kvSet('models:' + providerId, { models, fetchedAt: Date.now() });
            return { models, source: 'live', fetchedAt: Date.now() };
        } catch (err) {
            // API 失敗：回傳過期快取或 fallback
            const stale = await AppStorage.kvGet('models:' + providerId);
            if (stale && stale.models) {
                return { models: stale.models, source: 'cache', fetchedAt: stale.fetchedAt, error: err.message };
            }
            if (opt.allowFallback !== false) {
                return { models: provider.fallbackModels.slice(), source: 'fallback', error: err.message };
            }
            throw err;
        }
    }

    function listProviders() {
        return Object.values(PROVIDERS);
    }

    function getProvider(id) {
        return PROVIDERS[id] || PROVIDERS.mock;
    }

    // ============================================================
    // Prompt 構建
    // ============================================================
    function buildClassifyPrompt(rawClassNames, subject, userPrompt, tagLibrary, categoryLabels) {
        const labels = categoryLabels && typeof categoryLabels === 'object' && Object.keys(categoryLabels).length > 0
            ? categoryLabels
            : { audience: 'A.對象', level: 'B.等級', attribute: 'C.屬性', topic: 'D.主題', format: 'E.形式' };
        const keys = Object.keys(labels);
        const tagsHint = keys.map(cat => {
            const lib = (tagLibrary && tagLibrary[cat]) || [];
            return `${labels[cat]}：${lib.map(t => t.name).join('、') || '（無）'}`;
        }).join('\n');
        const exampleTagsBlock = keys.map(k => `"${k}": []`).join(', ');

        const categoryGuide = `
你是一個課程分類助手。請依據「${subject}」這個學科，把下列班名歸類成「主分類 → 子分類 → 班名」的三層樹。

可用的標籤（請從中挑選，不要創造新標籤名稱）：
${tagsHint}

對每個班名，請從以上各類標籤庫中挑選最合適的（每類可挑 0-3 個）。
重要：每個 tag 的字串必須與上方標籤庫「完全一致」，包含括號與括號內的補充字（例如必須寫「善（會用）」而不是「善」）。
若你不確定，寧可少打一個標籤，也不要寫不一致的縮寫。

請只回傳純 JSON（不要使用 markdown code fence 或多餘說明），格式：
{
  "categories": [
    {
      "name": "主分類名",
      "subcategories": [
        {
          "name": "子分類名",
          "classes": [
            { "name": "班名", "tags": { ${exampleTagsBlock} } }
          ]
        }
      ]
    }
  ]
}`;
        const userExtra = userPrompt ? `\n額外要求：${userPrompt}\n` : '';
        const list = rawClassNames.map((n, i) => `${i + 1}. ${n}`).join('\n');
        return `${categoryGuide}${userExtra}\n要分類的班名清單（共 ${rawClassNames.length} 個）：\n${list}\n\n請依語意去除明顯不屬於「${subject}」領域的項目，並合併重複名稱。`;
    }

    // ============================================================
    // 提供商實作
    // ============================================================
    // 統一的 fetch 含 timeout + 外部 abort signal 整合
    async function fetchWithTimeout(url, opts, timeoutMs, externalSignal) {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(new DOMException('AI 呼叫逾時（' + Math.round(timeoutMs / 1000) + ' 秒未回應）', 'TimeoutError')), timeoutMs);
        const onExternalAbort = () => controller.abort(externalSignal && externalSignal.reason ? externalSignal.reason : new DOMException('使用者取消', 'AbortError'));
        if (externalSignal) {
            if (externalSignal.aborted) controller.abort(externalSignal.reason || new DOMException('使用者取消', 'AbortError'));
            else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }
        try {
            const res = await fetch(url, Object.assign({}, opts, { signal: controller.signal }));
            return res;
        } finally {
            clearTimeout(t);
            if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        }
    }

    function describeFetchError(err, providerName) {
        if (err && err.name === 'TimeoutError') return providerName + ' 呼叫逾時：' + err.message;
        if (err && err.name === 'AbortError') return '已取消 ' + providerName + ' 呼叫';
        return providerName + ' 呼叫失敗：' + (err && err.message ? err.message : String(err));
    }

    async function callOpenAI(model, prompt, apiKey, opts) {
        opts = opts || {};
        try {
            const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: '你是嚴謹的課程分類助手，回應務必為純 JSON。' },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.2
                })
            }, opts.timeoutMs || 180000, opts.signal);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`OpenAI API ${res.status}: ${text}`);
            }
            const data = await res.json();
            const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!content) throw new Error('OpenAI 回應內容為空');
            return content;
        } catch (e) {
            if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error(describeFetchError(e, 'OpenAI'));
            throw e;
        }
    }

    async function callGemini(model, prompt, apiKey, opts) {
        opts = opts || {};
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        // 對於 thinking 系列模型（例：gemini-2.5-pro / 2.5-flash），預設逾時延長
        const m = (model || '').toLowerCase();
        const isThinking = /2\.5/.test(m);
        const isFlashThinking = isThinking && /flash/.test(m);
        const timeoutMs = opts.timeoutMs || (isThinking ? 240000 : 120000);
        try {
            const body = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
            };
            // gemini-2.5-flash 系列可關閉 thinking 以加快回應（pro 系列不支援關閉）
            if (isFlashThinking) {
                body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
            }
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }, timeoutMs, opts.signal);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Gemini API ${res.status}: ${text}`);
            }
            const data = await res.json();
            const txt = data.candidates && data.candidates[0] && data.candidates[0].content
                && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
                && data.candidates[0].content.parts[0].text;
            if (!txt) throw new Error('Gemini 回應內容為空（可能因安全過濾或模型輸出被截斷）');
            return txt;
        } catch (e) {
            if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error(describeFetchError(e, 'Gemini'));
            throw e;
        }
    }

    async function callGrok(model, prompt, apiKey, opts) {
        opts = opts || {};
        try {
            const res = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: '你是嚴謹的課程分類助手，回應務必為純 JSON。' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.2
                })
            }, opts.timeoutMs || 180000, opts.signal);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Grok API ${res.status}: ${text}`);
            }
            const data = await res.json();
            const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!content) throw new Error('Grok 回應內容為空');
            return content;
        } catch (e) {
            if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error(describeFetchError(e, 'Grok'));
            throw e;
        }
    }

    function callMock(rawClassNames, subject, tagLibrary) {
        // 假分類：把班名平均分到 3 個分類
        const cats = [
            { name: subject + ' - 基礎概念', subs: ['入門認知', '工具初探'] },
            { name: subject + ' - 應用實作', subs: ['工作坊演練', '專案實戰'] },
            { name: subject + ' - 治理與合規', subs: ['風險與合規', '組織導入'] }
        ];
        const result = { categories: cats.map(c => ({ name: c.name, subcategories: c.subs.map(s => ({ name: s, classes: [] })) })) };
        const tagPick = (cat) => {
            const lib = (tagLibrary && tagLibrary[cat]) || [];
            return lib.length > 0 ? [lib[Math.floor(Math.random() * lib.length)].name] : [];
        };
        rawClassNames.forEach((n, i) => {
            const ci = i % cats.length;
            const si = Math.floor(i / cats.length) % 2;
            result.categories[ci].subcategories[si].classes.push({
                name: n,
                tags: {
                    audience: tagPick('audience'),
                    level: tagPick('level'),
                    attribute: tagPick('attribute'),
                    topic: tagPick('topic'),
                    format: tagPick('format')
                }
            });
        });
        return JSON.stringify(result);
    }

    // ============================================================
    // Prompt 構建（場景 A / B：建構骨架）
    //   - 場景 A：scaffold-empty —— 完全憑空（無班名）
    //   - 場景 B：scaffold-inspired —— 以使用者上傳的班名作為靈感（不寫入圖）
    // 與 buildClassifyPrompt 不同：
    //   - 不要求 AI 把班名寫到 classes 陣列，只要求骨架
    //   - 可指定主分類數、每主分類的子分類數
    //   - 標籤改為「給每個子分類附建議標籤」（可選）
    // ============================================================
    function buildScaffoldPrompt(subject, userPrompt, tagLibrary, opts) {
        opts = opts || {};
        const labels = opts.categoryLabels && typeof opts.categoryLabels === 'object' && Object.keys(opts.categoryLabels).length > 0
            ? opts.categoryLabels
            : { audience: 'A.對象', level: 'B.等級', attribute: 'C.屬性', topic: 'D.主題', format: 'E.形式' };
        const keys = Object.keys(labels);
        const tagsHint = keys.map(cat => {
            const lib = (tagLibrary && tagLibrary[cat]) || [];
            return `${labels[cat]}：${lib.map(t => t.name).join('、') || '（無）'}`;
        }).join('\n');

        // 規模範圍（min-max）。0 / NaN 表示該方向不限制
        const minMain = Math.max(0, parseInt(opts.minMain, 10) || 0);
        const maxMain = Math.max(0, parseInt(opts.maxMain, 10) || 0);
        const minSub = Math.max(0, parseInt(opts.minSub, 10) || 0);
        const maxSub = Math.max(0, parseInt(opts.maxSub, 10) || 0);
        const attachTags = !!opts.attachTags;
        const inspirationNames = Array.isArray(opts.inspirationNames) ? opts.inspirationNames : [];
        const isInspired = inspirationNames.length > 0;

        const scaleHint = (() => {
            const parts = [];
            if (minMain && maxMain) parts.push(`請設計 **${minMain} 至 ${maxMain} 個主分類**（這是嚴格範圍，不能少於 ${minMain} 個，也不要超過 ${maxMain} 個）`);
            else if (minMain) parts.push(`請設計**至少 ${minMain} 個主分類**`);
            else if (maxMain) parts.push(`請設計**最多 ${maxMain} 個主分類**`);
            else parts.push('請依學科特性自行決定主分類數量（建議 3–8 個）');
            if (minSub && maxSub) parts.push(`每個主分類包含 **${minSub} 至 ${maxSub} 個子分類**（嚴格範圍，不能少於 ${minSub}、不要超過 ${maxSub}）`);
            else if (minSub) parts.push(`每個主分類**至少 ${minSub} 個子分類**`);
            else if (maxSub) parts.push(`每個主分類**最多 ${maxSub} 個子分類**`);
            else parts.push('每個主分類的子分類數量自行決定（建議 2–5 個）');
            return parts.join('，') + '。';
        })();

        const tagsBlock = attachTags
            ? `

請為**每個子分類**從下方標籤庫挑選最適合的建議標籤（每類 0-3 個，僅能挑選現有標籤名，不要創造新名稱）：
${tagsHint}

回傳格式中，每個子分類附 "tags" 物件（與班名相同結構）。`
            : `

**不需**附加標籤（tags 欄位請省略或保留空物件）。`;

        const inspirationBlock = isInspired
            ? `

下方是使用者提供的「靈感班名清單」（共 ${inspirationNames.length} 個）。請以這些班名為**參考靈感**思考分類架構，但**不要把班名寫入回傳的 JSON**——產出的只是分類骨架，班名僅用來幫你判斷學科實際的開課樣貌：
${inspirationNames.slice(0, 200).map((n, i) => `${i + 1}. ${n}`).join('\n')}${inspirationNames.length > 200 ? `\n...（其餘 ${inspirationNames.length - 200} 個省略）` : ''}`
            : '';

        const userExtra = userPrompt ? `\n額外要求：${userPrompt}\n` : '';

        return `你是一個課程分類架構師。請依據「${subject}」這個學科，設計一份「主分類 → 子分類」**兩層分類骨架**。

${scaleHint}${tagsBlock}${inspirationBlock}${userExtra}

請只回傳純 JSON（不要使用 markdown code fence 或多餘說明），格式如下（所有 classes 陣列必須是空陣列 []）：
{
  "categories": [
    {
      "name": "主分類名",
      "subcategories": [
        {
          "name":           "子分類名",${attachTags ? `
          "tags": { ${keys.map(k => `"${k}": []`).join(', ')} },` : ''}
          "classes": []
        }
      ]
    }
  ]
}

注意：classes 陣列必須**保持空陣列**，這次任務只負責產出骨架，不分配具體班名。`;
    }

    // ============================================================
    // 統一介面：classifyClasses
    // ============================================================
    async function classifyClasses(rawClassNames, subject, userPrompt, providerId, model, tagLibrary, opts) {
        opts = opts || {};
        const provider = getProvider(providerId);
        const prompt = buildClassifyPrompt(rawClassNames, subject, userPrompt, tagLibrary, opts.categoryLabels);

        // 快取 key
        const cacheKey = await sha256(JSON.stringify({ p: providerId, m: model, s: subject, u: userPrompt, n: rawClassNames }));
        const cached = await AppStorage.getAICache(cacheKey);
        if (cached) {
            return { fromCache: true, raw: cached, parsed: tryParseJson(cached) };
        }

        let raw;
        if (provider.id === 'mock') {
            raw = callMock(rawClassNames, subject, tagLibrary);
        } else {
            const apiKey = await loadApiKey(provider.id);
            if (!apiKey) throw new Error(`尚未設定 ${provider.name} 的 API Key`);
            const callOpts = { signal: opts.signal, timeoutMs: opts.timeoutMs };
            if (provider.id === 'openai') raw = await callOpenAI(model || provider.defaultModel, prompt, apiKey, callOpts);
            else if (provider.id === 'gemini') raw = await callGemini(model || provider.defaultModel, prompt, apiKey, callOpts);
            else if (provider.id === 'grok') raw = await callGrok(model || provider.defaultModel, prompt, apiKey, callOpts);
            else throw new Error('未知的 AI provider: ' + provider.id);
        }

        const parsed = tryParseJson(raw);
        if (!parsed || !Array.isArray(parsed.categories)) {
            throw new Error('AI 回應無法解析為預期格式（需含 categories 陣列）');
        }
        await AppStorage.setAICache(cacheKey, raw);
        return { fromCache: false, raw, parsed };
    }

    // ============================================================
    // 統一介面：buildScaffold（憑空 / 以靈感班名建構骨架）
    // opts: { targetMainCount, targetSubCount, attachTags, inspirationNames, signal, timeoutMs }
    // 回傳結構同 classifyClasses，但每個 subcategory.classes 都是空陣列
    // ============================================================
    async function buildScaffold(subject, userPrompt, providerId, model, tagLibrary, opts) {
        opts = opts || {};
        const provider = getProvider(providerId);
        const prompt = buildScaffoldPrompt(subject, userPrompt, tagLibrary, opts);

        const cacheKey = await sha256(JSON.stringify({
            kind: 'scaffold', p: providerId, m: model, s: subject, u: userPrompt,
            mnm: opts.minMain || 0, mxm: opts.maxMain || 0,
            mns: opts.minSub || 0, mxs: opts.maxSub || 0,
            tag: !!opts.attachTags, ins: opts.inspirationNames || []
        }));
        const cached = await AppStorage.getAICache(cacheKey);
        if (cached) {
            return { fromCache: true, raw: cached, parsed: tryParseJson(cached) };
        }

        let raw;
        if (provider.id === 'mock') {
            raw = callMockScaffold(subject, tagLibrary, opts);
        } else {
            const apiKey = await loadApiKey(provider.id);
            if (!apiKey) throw new Error(`尚未設定 ${provider.name} 的 API Key`);
            const callOpts = { signal: opts.signal, timeoutMs: opts.timeoutMs };
            if (provider.id === 'openai') raw = await callOpenAI(model || provider.defaultModel, prompt, apiKey, callOpts);
            else if (provider.id === 'gemini') raw = await callGemini(model || provider.defaultModel, prompt, apiKey, callOpts);
            else if (provider.id === 'grok') raw = await callGrok(model || provider.defaultModel, prompt, apiKey, callOpts);
            else throw new Error('未知的 AI provider: ' + provider.id);
        }

        const parsed = tryParseJson(raw);
        if (!parsed || !Array.isArray(parsed.categories)) {
            throw new Error('AI 回應無法解析為預期格式（需含 categories 陣列）');
        }
        // 強制清空 classes（保險：避免 AI 沒遵守規則）
        parsed.categories.forEach(cat => {
            (cat.subcategories || []).forEach(sub => { sub.classes = []; });
        });
        // ============================
        // 後處理：強制 min-max 範圍保險
        // ============================
        const minMain = parseInt(opts.minMain, 10) || 0;
        const maxMain = parseInt(opts.maxMain, 10) || 0;
        const minSub = parseInt(opts.minSub, 10) || 0;
        const maxSub = parseInt(opts.maxSub, 10) || 0;
        const adjustments = [];
        // 主分類：截斷
        if (maxMain > 0 && parsed.categories.length > maxMain) {
            adjustments.push(`主分類已從 ${parsed.categories.length} 截斷為上限 ${maxMain}`);
            parsed.categories = parsed.categories.slice(0, maxMain);
        }
        // 主分類：補空白
        if (minMain > 0 && parsed.categories.length < minMain) {
            const needed = minMain - parsed.categories.length;
            for (let i = 0; i < needed; i++) {
                parsed.categories.push({
                    name: `（待命名主分類 ${parsed.categories.length + 1}）`,
                    subcategories: []
                });
            }
            adjustments.push(`主分類不足，已補 ${needed} 個空白卡到下限 ${minMain}`);
        }
        // 子分類：每個主分類獨立檢查
        let subClippedCount = 0, subPaddedCount = 0;
        parsed.categories.forEach(cat => {
            if (!Array.isArray(cat.subcategories)) cat.subcategories = [];
            if (maxSub > 0 && cat.subcategories.length > maxSub) {
                subClippedCount += cat.subcategories.length - maxSub;
                cat.subcategories = cat.subcategories.slice(0, maxSub);
            }
            if (minSub > 0 && cat.subcategories.length < minSub) {
                const need = minSub - cat.subcategories.length;
                for (let i = 0; i < need; i++) {
                    cat.subcategories.push({
                        name: `（待命名子分類 ${cat.subcategories.length + 1}）`,
                        classes: []
                    });
                }
                subPaddedCount += need;
            }
        });
        if (subClippedCount) adjustments.push(`子分類截斷 ${subClippedCount} 個（超過上限 ${maxSub}）`);
        if (subPaddedCount) adjustments.push(`子分類補白 ${subPaddedCount} 個（不足下限 ${minSub}）`);
        if (adjustments.length) parsed._adjustments = adjustments;
        await AppStorage.setAICache(cacheKey, raw);
        return { fromCache: false, raw, parsed };
    }

    // Mock 骨架：給離線示範用，照 opts 規模回傳
    function callMockScaffold(subject, tagLibrary, opts) {
        opts = opts || {};
        // 規模：優先用 min-max 中位數；若都沒給，預設 4 主／3 子
        const minMain = parseInt(opts.minMain, 10) || 0;
        const maxMain = parseInt(opts.maxMain, 10) || 0;
        const minSub = parseInt(opts.minSub, 10) || 0;
        const maxSub = parseInt(opts.maxSub, 10) || 0;
        const mainCount = (minMain && maxMain) ? Math.round((minMain + maxMain) / 2) : (minMain || maxMain || 4);
        const subCount = (minSub && maxSub) ? Math.round((minSub + maxSub) / 2) : (minSub || maxSub || 3);
        const attachTags = !!opts.attachTags;
        const pickFirst = (cat, n) => ((tagLibrary && tagLibrary[cat]) || []).slice(0, n).map(t => t.name);
        const cats = [];
        for (let i = 0; i < mainCount; i++) {
            const subs = [];
            for (let j = 0; j < subCount; j++) {
                const sub = { name: `${subject}-子分類 ${i + 1}.${j + 1}`, classes: [] };
                if (attachTags) {
                    sub.tags = {
                        audience: pickFirst('audience', 1), level: pickFirst('level', 1),
                        attribute: pickFirst('attribute', 1), topic: pickFirst('topic', 1),
                        format: pickFirst('format', 1)
                    };
                }
                subs.push(sub);
            }
            cats.push({ name: `${subject}-主分類 ${i + 1}`, subcategories: subs });
        }
        return JSON.stringify({ categories: cats });
    }

    function tryParseJson(text) {
        if (!text) return null;
        try { return JSON.parse(text); } catch (e) {}
        // 嘗試從 markdown code fence 中抽取
        const m = text.match(/```(?:json)?\s*([\s\S]+?)```/i);
        if (m) {
            try { return JSON.parse(m[1]); } catch (e) {}
        }
        // 嘗試找第一個 { 與最後一個 } 之間
        const i = text.indexOf('{');
        const j = text.lastIndexOf('}');
        if (i >= 0 && j > i) {
            try { return JSON.parse(text.substring(i, j + 1)); } catch (e) {}
        }
        return null;
    }

    async function sha256(str) {
        const buf = new TextEncoder().encode(str);
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ============================================================
    // 測試 API Key（簡單呼叫一次小 prompt）
    // ============================================================
    async function testApiKey(providerId, model) {
        const provider = getProvider(providerId);
        if (provider.id === 'mock') return { ok: true, message: 'Mock 模式無需驗證' };
        const apiKey = await loadApiKey(provider.id);
        if (!apiKey) throw new Error('尚未儲存 API Key');
        const testPrompt = '請回傳純 JSON：{"ok":true}';
        const callOpts = { timeoutMs: 30000 };
        try {
            let raw;
            if (provider.id === 'openai') raw = await callOpenAI(model || provider.defaultModel, testPrompt, apiKey, callOpts);
            else if (provider.id === 'gemini') raw = await callGemini(model || provider.defaultModel, testPrompt, apiKey, callOpts);
            else if (provider.id === 'grok') raw = await callGrok(model || provider.defaultModel, testPrompt, apiKey, callOpts);
            return { ok: true, message: '驗證成功，回應前 60 字：' + (raw || '').slice(0, 60) };
        } catch (e) {
            return { ok: false, message: e.message };
        }
    }

    return {
        // 主密碼
        setMasterPassword, clearMasterPassword, hasMasterPasswordInMemory,
        encryptWithMaster, decryptWithMaster,
        // API Key
        saveApiKey, loadApiKey, deleteApiKey,
        // Provider
        listProviders, getProvider,
        // 模型清單（即時抓取）
        fetchModels, getCachedModels,
        // 推論
        classifyClasses, buildScaffold, testApiKey, sha256
    };
})();
