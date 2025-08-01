/**
 * 先按 sortPriority 升序，再按速度值降序。
 * 无测速(检测中 / 空) 的速度值记为 -1，这样被排到最后。
 */
function sortBySpeed(arr) {

    const speedVal = (v) => {
        if (!v || v === '检测中...' || v === 'pending') return -1; // 无测速
        if (v === '连接超时') return 0;
        if (v === '连接正常') return 1e3;
        if (v === '极速') return 1e5;
        const m = v.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/i);
        if (m) {
            const num = parseFloat(m[1]);
            return m[2].toUpperCase() === 'MB/S' ? num * 1024 : num; // 统一成 KB/s
        }
        return 1;  // 兜底
    };

    arr.sort((a, b) => {
        const prA = a.sortPriority ?? 50;
        const prB = b.sortPriority ?? 50;
        if (prA !== prB) return prA - prB;          // 先比 priority
        return speedVal(b.loadSpeed) - speedVal(a.loadSpeed); // 再比速度值(大→小)
    });
}

/* 把测速完成后的值写进已存在的卡片速度标签 */
function refreshSpeedBadges(results) {
    results.forEach(it => {
        const badge = document.querySelector(
            `.card-hover[data-id="${it.vod_id}"][data-source-code="${it.source_code}"] [data-field="speed-tag"]`
        );
        if (badge && isValidSpeedValue(it.loadSpeed)) {
            badge.textContent = it.loadSpeed;
            badge.classList.remove('hidden');
            badge.style.backgroundColor = '#16a34a';
        }
    });
}

// 主应用程序逻辑 使用AppState进行状态管理，DOMCache进行DOM元素缓存
const AppState = (function () {
    const state = new Map();
    return {
        set: function (key, value) { state.set(key, value); },
        get: function (key) { return state.get(key); },
        initialize: function (initialData = {}) {
            for (const key in initialData) {
                if (initialData.hasOwnProperty(key)) {
                    state.set(key, initialData[key]);
                }
            }
        }
    };
})();

const DOMCache = (function () {
    const cache = new Map();
    return {
        set: function (key, element) { if (element) cache.set(key, element); },
        get: function (key) { return cache.get(key); },
        init: function (elementsToCache) {
            for (const key in elementsToCache) {
                if (elementsToCache.hasOwnProperty(key)) {
                    const element = document.getElementById(elementsToCache[key]);
                    if (element) cache.set(key, element);
                }
            }
        }
    };
})();

//文本净化函数
function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function playVideo(episodeString, title, episodeIndex, sourceName = '', sourceCode = '', vodId = '', year = '', typeName = '', videoKey = '') {
    if (!episodeString) {
        showToast('无效的视频链接', 'error');
        return;
    }
    let playUrl = episodeString;
    if (episodeString.includes('$')) {
        playUrl = episodeString.split('$')[1];
    }
    if (!playUrl || !playUrl.startsWith('http')) {
        showToast('视频链接格式无效', 'error');
        console.error('解析出的播放链接无效:', playUrl);
        return;
    }
    const isSpecialSource = !sourceCode.startsWith('custom_') && API_SITES[sourceCode] && API_SITES[sourceCode].detail;
    if (isSpecialSource) {
        const detailUrl = `/api/detail?id=${vodId}&source=${sourceCode}`;
        try {
            const response = await fetch(detailUrl);
            const data = await response.json();
            if (data.code === 200 && Array.isArray(data.episodes)) {
                playUrl = data.episodes[episodeIndex];
            }
        } catch (e) {
            console.log('后台获取真实地址失败（播放前）', e);
        }
    }
    AppState.set('currentEpisodeIndex', episodeIndex);
    AppState.set('currentVideoTitle', title);
    if (typeof addToViewingHistory === 'function') {
        const videoInfoForHistory = {
            url: playUrl,
            title: title,
            episodeIndex: episodeIndex,
            sourceName: sourceName,
            sourceCode: sourceCode,
            vod_id: vodId,
            year: year,
            typeName: typeName,
            episodes: AppState.get('currentEpisodes') || []
        };
        addToViewingHistory(videoInfoForHistory);
    }
    const originalEpisodeNames = AppState.get('originalEpisodeNames') || [];
    localStorage.setItem('originalEpisodeNames', JSON.stringify(originalEpisodeNames));
    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', playUrl);
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', episodeIndex.toString());
    if (vodId) playerUrl.searchParams.set('id', vodId);
    if (sourceName) playerUrl.searchParams.set('source', sourceName);
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);
    if (year) playerUrl.searchParams.set('year', year);
    if (typeName) playerUrl.searchParams.set('typeName', typeName);
    if (videoKey) playerUrl.searchParams.set('videoKey', videoKey);
    const universalId = generateUniversalId(title, year, episodeIndex);
    playerUrl.searchParams.set('universalId', universalId);
    const adOn = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled);
    playerUrl.searchParams.set('af', adOn ? '1' : '0');
    window.location.href = playerUrl.toString();
}

function generateUniversalId(title, year, episodeIndex) {
    // 提取核心标题和归一化
    const normalizedTitle = getCoreTitle(title).toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
    const normalizedYear = year ? String(year) : 'unknown';
    return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
}


function playPreviousEpisode() {
    const currentIndex = AppState.get('currentEpisodeIndex');
    const episodes = AppState.get('currentEpisodes');
    if (currentIndex > 0 && episodes && episodes.length > 0) {
        const prevIndex = currentIndex - 1;
        AppState.set('currentEpisodeIndex', prevIndex);
        localStorage.setItem('currentEpisodeIndex', prevIndex.toString());
        const title = AppState.get('currentVideoTitle');
        playVideo(episodes[prevIndex], title, prevIndex);
    } else {
        showToast('已经是第一集了', 'info');
    }
}

function playNextEpisode() {
    const currentIndex = AppState.get('currentEpisodeIndex');
    const episodes = AppState.get('currentEpisodes');
    if (episodes && currentIndex < episodes.length - 1) {
        const nextIndex = currentIndex + 1;
        AppState.set('currentEpisodeIndex', nextIndex);
        localStorage.setItem('currentEpisodeIndex', nextIndex.toString());
        const title = AppState.get('currentVideoTitle');
        playVideo(episodes[nextIndex], title, nextIndex);
    } else {
        showToast('已经是最后一集了', 'info');
    }
}

async function playFromHistory(url, title, episodeIndex, playbackPosition = 0, typeName = '') {
    let historyItem = null;
    let episodesList = [];
    let vodId = '',
        actualSourceName = '',
        actualSourceCode = '',
        videoYear = '',
        currentVideoTypeName = '';
    try {
        const history = JSON.parse(localStorage.getItem('viewingHistory') || '[]');
        historyItem = history.find(item => item.url === url && item.title === title && item.episodeIndex === episodeIndex);
        if (historyItem) {
            vodId = historyItem.vod_id || '';
            actualSourceName = historyItem.sourceName || '';
            actualSourceCode = historyItem.sourceCode || '';
            videoYear = historyItem.year || '';
            currentVideoTypeName = historyItem.typeName || '';
        }
    } catch (e) {
        console.error("读取历史记录失败:", e);
    }
    if (historyItem && Array.isArray(historyItem.episodes) && historyItem.episodes.length > 0 && historyItem.episodes[0].includes('$')) {
        episodesList = historyItem.episodes;
    } else if (vodId && actualSourceCode) {
        try {
            let apiUrl = `/api/detail?id=${encodeURIComponent(vodId)}&source=${encodeURIComponent(actualSourceCode)}`;
            const apiInfo = typeof APISourceManager !== 'undefined' ? APISourceManager.getSelectedApi(actualSourceCode) : null;
            if (apiInfo && apiInfo.isCustom && apiInfo.url) {
                apiUrl += `&customApi=${encodeURIComponent(apiInfo.url)}`;
            }
            const detailResp = await fetch(apiUrl);
            if (!detailResp.ok) throw new Error(`API请求失败: ${detailResp.status}`);
            const detailData = await detailResp.json();
            if (detailData.code === 200 && Array.isArray(detailData.episodes) && detailData.episodes.length > 0) {
                episodesList = detailData.episodes;
            } else {
                if (historyItem && Array.isArray(historyItem.episodes) && historyItem.episodes.length > 0) {
                    episodesList = historyItem.episodes;
                } else {
                    throw new Error(detailData.msg || 'API返回数据无效');
                }
            }
        } catch (e) {
            episodesList = AppState.get('currentEpisodes') || JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
        }
    } else {
        episodesList = AppState.get('currentEpisodes') || JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
    }

    // 统一处理原始剧集名称
    let namesToStore = [];
    // 1. 最佳来源：从刚获取的 episodesList 解析
    if (episodesList.length > 0 && typeof episodesList[0] === 'string' && episodesList[0].includes('$')) {
        namesToStore = episodesList.map(ep => ep.split('$')[0].trim());
    }
    // 2. 备用来源：从历史记录项中恢复
    else if (historyItem && Array.isArray(historyItem.originalEpisodeNames) && historyItem.originalEpisodeNames.length > 0) {
        namesToStore = historyItem.originalEpisodeNames;
    }

    // 3. 根据结果更新 localStorage
    if (namesToStore.length > 0) {
        localStorage.setItem('originalEpisodeNames', JSON.stringify(namesToStore));
    } else {
        // 如果两种方式都获取不到，则清空旧缓存，避免显示错误的名称
        localStorage.removeItem('originalEpisodeNames');
    }

    if (episodesList.length > 0) {
        AppState.set('currentEpisodes', episodesList);
        localStorage.setItem('currentEpisodes', JSON.stringify(episodesList));
    }
    let actualEpisodeIndex = episodeIndex;
    if (actualEpisodeIndex >= episodesList.length) {
        actualEpisodeIndex = episodesList.length > 0 ? episodesList.length - 1 : 0;
    }
    let finalUrl = (episodesList.length > 0 && episodesList[actualEpisodeIndex]) ?
        episodesList[actualEpisodeIndex] : url;

    if (typeof finalUrl === 'string' && finalUrl.includes('$')) {
        finalUrl = finalUrl.split('$')[1];
    }
    AppState.set('currentEpisodeIndex', actualEpisodeIndex);
    AppState.set('currentVideoTitle', title);
    localStorage.setItem('currentEpisodeIndex', actualEpisodeIndex.toString());
    localStorage.setItem('currentVideoTitle', title);

    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', finalUrl);
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', actualEpisodeIndex.toString());
    if (vodId) playerUrl.searchParams.set('id', vodId);
    if (actualSourceName) playerUrl.searchParams.set('source', actualSourceName);
    if (actualSourceCode) playerUrl.searchParams.set('source_code', actualSourceCode);
    if (videoYear) playerUrl.searchParams.set('year', videoYear);
    // 将 typeName 传递给播放器（优先使用传入的参数，其次使用历史记录中的）
    const finalTypeName = typeName || currentVideoTypeName;
    if (finalTypeName) playerUrl.searchParams.set('typeName', finalTypeName);
    if (playbackPosition > 0) playerUrl.searchParams.set('position', playbackPosition.toString());
    const uid = generateUniversalId(title, videoYear, actualEpisodeIndex);
    playerUrl.searchParams.set('universalId', uid);
    const adOn = typeof getBoolConfig !== 'undefined' && typeof PLAYER_CONFIG !== 'undefined' ? getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled) : PLAYER_CONFIG?.adFilteringEnabled ?? false;
    playerUrl.searchParams.set('af', adOn ? '1' : '0');
    window.location.href = playerUrl.toString();
}

function getBoolConfig(key, defaultValue) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
}

// 搜索缓存相关函数
function getSearchCacheKey(query, selectedAPIs) {
    const sortedCopy = [...selectedAPIs].sort();   // 不破坏原数组
    return `searchCache_${query}_${sortedCopy.join('_')}`;
}

function checkSearchCache(query, selectedAPIs) {
    try {
        const cacheKey = getSearchCacheKey(query, selectedAPIs);
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return { canUseCache: false };

        const cacheData = JSON.parse(cached);
        const now = Date.now();
        const expireTime = SEARCH_CACHE_CONFIG.expireTime;

        if (now - cacheData.timestamp > expireTime) {
            localStorage.removeItem(cacheKey);
            return { canUseCache: false };
        }

        // 检查API是否有变化
        const cachedAPIs = cacheData.selectedAPIs || [];
        const added = selectedAPIs.filter(api => !cachedAPIs.includes(api));
        const removed = cachedAPIs.filter(api => !selectedAPIs.includes(api));

        return {
            canUseCache: added.length === 0 && removed.length === 0,
            results: cacheData.results || [],
            newAPIs: added
        };
    } catch (e) {
        console.warn('检查搜索缓存失败:', e);
        return { canUseCache: false };
    }
}

function saveSearchCache(query, selectedAPIs, results) {
    try {
        const cacheKey = getSearchCacheKey(query, selectedAPIs);
        const cacheData = {
            timestamp: Date.now(),
            selectedAPIs: [...selectedAPIs],
            results: results
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('保存搜索缓存失败:', e);
    }
}

/* ============================================================
 *  后台测速：使用 SpeedTester，但不阻塞 UI
 * ============================================================ */
function backgroundSpeedUpdate(results) {
    return new Promise(resolve => {
        const concurrency = 2;          // 同时跑 2 条线路即可
        let cursor = 0;
        const isPending = v => !v || v === '检测中...' || v === 'pending';
        let remain = results.filter(r => isPending(r.loadSpeed)).length;
        if (remain === 0) return resolve();  // 没有要测的

        async function worker() {
            while (cursor < results.length) {
                const item = results[cursor++];
                if (!item || !isPending(item.loadSpeed)) continue;

                /* ———原来的测速 try/catch 整段保留——— */
                try {
                    const [tested] = await window.SpeedTester
                        .testSources([item], { concurrency: 1 });
                    if (tested && tested.loadSpeed !== 'N/A') {
                        item.loadSpeed = tested.loadSpeed;
                        item.sortPriority = tested.sortPriority;
                    } else {
                        item.loadSpeed = '连接超时';
                        item.sortPriority = 99;
                    }

                    /* ------------ ① 写回 sessionStorage + localStorage 缓存 ------------ */
                    try {
                        const q = AppState.get('latestQuery');
                        const ap = AppState.get('latestAPIs') || [];
                        if (q && ap.length) {
                            const cacheKey = getSearchCacheKey(q, ap);
                            const uniqKey = `${item.source_code}_${item.vod_id}`;

                            /* sessionStorage.searchResults（本页刷新用） */
                            const srRaw = sessionStorage.getItem('searchResults');
                            if (srRaw) {
                                const sr = JSON.parse(srRaw);
                                const i = sr.findIndex(r => `${r.source_code}_${r.vod_id}` === uniqKey);
                                if (i !== -1) {
                                    sr[i] = { ...sr[i], ...item };
                                    sessionStorage.setItem('searchResults', JSON.stringify(sr));
                                }
                            }

                            /* localStorage 长期缓存（30 天） */
                            const obj = JSON.parse(localStorage.getItem(cacheKey) || '{}');
                            if (obj.results) {
                                const j = obj.results.findIndex(r => `${r.source_code}_${r.vod_id}` === uniqKey);
                                if (j !== -1) {
                                    obj.results[j] = { ...obj.results[j], ...item };
                                    localStorage.setItem(cacheKey, JSON.stringify(obj));
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('写回测速缓存失败:', e);
                    }

                } catch {
                    item.loadSpeed = '连接超时';
                    item.sortPriority = 99;
                }

                /* ---- 更新缓存、弹窗显示（原逻辑不变） ---- */
                updateModalSpeedDisplay(item);

                const key = `${item.source_code}_${item.vod_id}`;
                const vMap = AppState.get('videoDataMap') || new Map();
                vMap.set(key, item);
                AppState.set('videoDataMap', vMap);
                sessionStorage.setItem(
                    'videoDataCache',
                    JSON.stringify(Array.from(vMap.entries()))
                );

                /* ---- 计数，全部结束后刷 UI 并 resolve ---- */
                if (--remain === 0) {
                    refreshSpeedBadges(results);   // ★ 把全部测速结果写进现有卡片
                    resolve();
                }
            }
        }
        // 启动并发 worker
        Array(concurrency).fill(0).forEach(worker);
    });
}

function isValidSpeedValue(speed) {
    if (!speed || speed === 'N/A' || speed === '连接超时' || speed === '未知' || speed === '检测失败') {
        return false;
    }
    // 只显示包含数字+单位的速度值
    return /^\d+(\.\d+)?\s*(KB\/s|MB\/s|kb\/s|mb\/s)$/i.test(speed);
}

function updateModalSpeedDisplay(item) {
    // 更新弹窗中对应项目的速度显示
    const modal = document.getElementById('modal');
    if (!modal || modal.style.display === 'none') return;

    const speedElement = modal.querySelector(`[data-vod-id="${item.vod_id}"] .speed-tag`);
    if (speedElement && item.loadSpeed && isValidSpeedValue(item.loadSpeed)) {
        speedElement.textContent = item.loadSpeed;
        speedElement.style.display = 'inline-block';
    }
}

document.addEventListener('DOMContentLoaded', function () {
    initializeAppState();
    initializeDOMCache();
    APISourceManager.init();
    initializeEventListeners();
    renderSearchHistory();
    restoreSearchFromCache();
});

function initializeAppState() {
    const selectedAPIsRaw = localStorage.getItem('selectedAPIs');
    AppState.initialize({
        'selectedAPIs': JSON.parse(selectedAPIsRaw || JSON.stringify(window.DEFAULT_SELECTED_APIS)),
        'customAPIs': JSON.parse(localStorage.getItem('customAPIs') || '[]'),
        'currentEpisodeIndex': 0,
        'currentEpisodes': [],
        'currentVideoTitle': '',
        'episodesReversed': false
    });
    if (selectedAPIsRaw === null) {
        localStorage.setItem('selectedAPIs', JSON.stringify(window.DEFAULT_SELECTED_APIS));
    }
    try {
        const cachedData = sessionStorage.getItem('videoDataCache');
        let restoredMap = new Map();
        if (cachedData) {
            const rawArr = JSON.parse(cachedData);
            if (rawArr.length > 0 && !String(rawArr[0][0]).includes('_')) {
                console.warn("检测到旧版视频缓存，已清除。");
            } else {
                restoredMap = new Map(rawArr);
            }
        }
        AppState.set('videoDataMap', restoredMap);
    } catch (e) {
        console.error('从 sessionStorage 恢复视频元数据缓存失败:', e);
        AppState.set('videoDataMap', new Map());
    }
}

function initializeDOMCache() {
    DOMCache.init({
        searchInput: 'searchInput',
        searchResults: 'searchResults',
        searchForm: 'searchForm',
        searchHistoryContainer: 'searchHistory',
        apiCheckboxes: 'apiCheckboxes',
        customApisList: 'customApisList',
        selectedApiCount: 'selectedApiCount',
        addCustomApiForm: 'addCustomApiForm',
        customApiName: 'customApiName',
        customApiUrl: 'customApiUrl',
        customApiDetail: 'customApiDetail',
        customApiIsAdult: 'customApiIsAdult',
        yellowFilterToggle: 'yellowFilterToggle',
        adFilteringToggle: 'adFilterToggle',
        speedDetectionToggle: 'speedDetectionToggle',
        preloadingToggle: 'preloadingToggle',
        preloadCountInput: 'preloadCountInput'
    });
}

function initializeEventListeners() {
    const searchForm = DOMCache.get('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            search();
        });
    }
    const adFilteringToggle = DOMCache.get('adFilteringToggle');
    if (adFilteringToggle) {
        adFilteringToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, enabled.toString());
            showToast(enabled ? '已启用广告过滤' : '已禁用广告过滤', 'info');
        });
        adFilteringToggle.checked = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled);
    }
    const yellowFilterToggle = DOMCache.get('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('yellowFilterEnabled', enabled.toString());
            showToast(enabled ? '已启用黄色内容过滤' : '已禁用黄色内容过滤', 'info');
        });
        yellowFilterToggle.checked = getBoolConfig('yellowFilterEnabled', true);
    }
    const speedDetectionToggle = DOMCache.get('speedDetectionToggle');
    if (speedDetectionToggle) {
        speedDetectionToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem(PLAYER_CONFIG.speedDetectionStorage, enabled.toString());
            showToast(enabled ? '已启用画质速度检测' : '已禁用画质速度检测', 'info');
        });
        speedDetectionToggle.checked = getBoolConfig(PLAYER_CONFIG.speedDetectionStorage, PLAYER_CONFIG.speedDetectionEnabled);
    }
    const preloadingToggle = DOMCache.get('preloadingToggle');
    if (preloadingToggle) {
        // 直接使用 PLAYER_CONFIG 中的值
        preloadingToggle.checked = PLAYER_CONFIG.enablePreloading;

        preloadingToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('preloadingEnabled', enabled.toString());
            // 更新 PLAYER_CONFIG 中的值
            PLAYER_CONFIG.enablePreloading = enabled;
            showToast(enabled ? '已启用预加载' : '已禁用预加载', 'info');
        });
    }

    const preloadCountInput = DOMCache.get('preloadCountInput');
    if (preloadCountInput) {
        // 直接使用 PLAYER_CONFIG 中的值
        preloadCountInput.value = PLAYER_CONFIG.preloadCount;

        preloadCountInput.addEventListener('change', (e) => {
            let count = parseInt(e.target.value);
            if (isNaN(count) || count < 1) count = 1;
            else if (count > 10) count = 10;
            e.target.value = count;
            localStorage.setItem('preloadCount', count.toString());
            // 更新 PLAYER_CONFIG 中的值
            PLAYER_CONFIG.preloadCount = count;
            showToast(`预加载数量已设置为 ${count}`, 'info');
        });
    }
}

function search(options = {}) {
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
        sessionStorage.removeItem('videoSourceMap');
    } catch (e) {
        console.error('清除 sessionStorage 失败:', e);
    }
    const searchInput = DOMCache.get('searchInput');
    const searchResultsContainer = DOMCache.get('searchResults');
    if (!searchInput || !searchResultsContainer) {
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
    }
    const queryFromInput = searchInput.value.trim();
    const query = options.doubanQuery || queryFromInput;
    if (!query) {
        if (typeof showToast === 'function') showToast('请输入搜索内容', 'warning');
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
    }
    let isNormalSearch = !options.doubanQuery;
    if (isNormalSearch && typeof showLoading === 'function') {
        showLoading(`正在搜索“${query}”`);
    }
    if (!options.doubanQuery) {
        if (typeof saveSearchHistory === 'function') saveSearchHistory(query);
    }
    const selectedAPIs = AppState.get('selectedAPIs');
    if (!selectedAPIs || selectedAPIs.length === 0) {
        if (typeof showToast === 'function') showToast('请至少选择一个API源', 'warning');
        if (isNormalSearch && typeof hideLoading === 'function') hideLoading();
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
    }
    performSearch(query, selectedAPIs)
        .then(resultsData => {
            renderSearchResults(resultsData, options.doubanQuery ? query : null);
            // 缓存结果已加载，无需额外提示
        })
        .catch(error => {
            if (searchResultsContainer) searchResultsContainer.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
        })
        .finally(() => {
            if (isNormalSearch && typeof hideLoading === 'function') hideLoading();
            if (typeof options.onComplete === 'function') options.onComplete();
        });
}

// 搜索结果 → Map / sessionStorage 公用写入
function rebuildVideoCaches(results) {
    // 1. videoDataMap
    const videoDataMap = new Map();
    results.forEach(item => {
        if (item && item.vod_id) {
            const uniqueKey = `${item.source_code}_${item.vod_id}`;
            videoDataMap.set(uniqueKey, item);
        }
    });
    AppState.set('videoDataMap', videoDataMap);
    sessionStorage.setItem(
        'videoDataCache',
        JSON.stringify(Array.from(videoDataMap.entries()))
    );

    // 2. videoSourceMap  (给播放器的线路切换使用)
    const videoSourceMap = new Map();
    results.forEach(item => {
        if (item && item.vod_id) {
            const key = `${item.vod_name}|${item.vod_year || ''}`;
            if (!videoSourceMap.has(key)) videoSourceMap.set(key, []);
            videoSourceMap.get(key).push(item);
        }
    });
    sessionStorage.setItem(
        'videoSourceMap',
        JSON.stringify(Array.from(videoSourceMap.entries()))
    );
}

/* ============================================================
 *  在后台异步完善画质（不阻塞 UI）
 * ============================================================ */
function backgroundQualityUpdate(results) {
    const concurrency = 2;          // 同时跑 2 个任务即可
    let cursor = 0;

    async function worker() {
        while (cursor < results.length) {
            const item = results[cursor++];
            if (!item || item.detectionMethod !== 'pending') continue;  // 只处理待检测项

            /* -------- 调用画质检测 -------- */
            let firstEpisodeUrl = '';
            if (item.vod_play_url) {
                const firstSeg = item.vod_play_url.split('#')[0];
                firstEpisodeUrl = firstSeg.includes('$') ? firstSeg.split('$')[1] : firstSeg;
            }

            try {
                const q = await window.precheckSource(
                    firstEpisodeUrl,
                    item.m3u8Content || null    // 把 m3u8 文本传进去
                );

                // 属性更新，确保只更新画质相关字段
                // 这样就不会意外覆盖由其他进程（如速度检测）写入的数据
                if (q) {
                    if (q.quality) {
                        item.quality = q.quality;
                    }
                    if (q.detectionMethod) {
                        item.detectionMethod = q.detectionMethod;
                    }
                }
            } catch {
                item.quality = '检测失败';
                item.detectionMethod = 'failed';
            }

            /* -------- 更新缓存 -------- */
            const key = `${item.source_code}_${item.vod_id}`;
            const videoDataMap = AppState.get('videoDataMap') || new Map();
            videoDataMap.set(key, item);
            AppState.set('videoDataMap', videoDataMap);
            sessionStorage.setItem('videoDataCache', JSON.stringify(Array.from(videoDataMap.entries())));

            /* -------- 更新页面标签 -------- */
            updateQualityBadgeUI(key, item.quality);
            /* -------- 同步回 sessionStorage.searchResults -------- */
            try {
                const cachedResultsRaw = sessionStorage.getItem('searchResults');
                if (cachedResultsRaw) {
                    const arr = JSON.parse(cachedResultsRaw);
                    const idx = arr.findIndex(
                        it => `${it.source_code}_${it.vod_id}` === key
                    );
                    if (idx !== -1) {
                        arr[idx] = { ...arr[idx], ...item };
                        sessionStorage.setItem('searchResults', JSON.stringify(arr));
                    }
                }
            } catch (e) {
                console.warn('写回 searchResults 失败：', e);
            }

            /* ============================================================
              *   把最终检测结果写回 30 天搜索缓存
           * ============================================================ */
            try {
                /* ------------ 生成缓存键 ------------ */
                const q = AppState.get('latestQuery');
                const ap = AppState.get('latestAPIs') || [];
                if (!q || ap.length === 0) return;   // 关键参数缺失直接跳过

                const cacheKey = getSearchCacheKey(q, ap);

                /* ------------ 取出缓存对象 ------------ */
                let cacheObj;
                try {
                    cacheObj = JSON.parse(localStorage.getItem(cacheKey) || '{}');
                } catch {
                    cacheObj = {};
                }

                /* 若缓存骨架不存在，则新建 */
                if (!cacheObj.timestamp) {
                    cacheObj.timestamp = Date.now();
                    cacheObj.selectedAPIs = [...ap];
                    cacheObj.results = [];
                }

                /* ------------ 更新 / 追加当前条目 ------------ */
                const resultsArr = Array.isArray(cacheObj.results) ? cacheObj.results : [];
                const idx = resultsArr.findIndex(r => `${r.source_code}_${r.vod_id}` === key);

                if (idx !== -1) {
                    resultsArr[idx] = { ...resultsArr[idx], ...item };
                } else {
                    resultsArr.push({ ...item });
                }

                cacheObj.results = resultsArr;

                // 写回 localStorage
                localStorage.setItem(cacheKey, JSON.stringify(cacheObj));

            } catch (e) {
                console.warn('写回搜索缓存失败:', e);
            }
        }
    }

    // 开启并发worker
    Array(concurrency).fill(0).forEach(worker);
}

async function performSearch(query, selectedAPIs) {
    // 把本次搜索信息存进全局，供后台线程写缓存用
    AppState.set('latestQuery', query);
    AppState.set('latestAPIs', [...selectedAPIs]);

    // 检查是否启用速度检测
    const speedDetectionEnabled = getBoolConfig(PLAYER_CONFIG.speedDetectionStorage, PLAYER_CONFIG.speedDetectionEnabled);

    /* ============================================================
     * 1) 先检查 30 天搜索结果缓存 —— 与速度检测无关
     * ============================================================ */
    const cacheResult = checkSearchCache(query, selectedAPIs);
    if (cacheResult.canUseCache) {
        // 显示“正在加载缓存”提示
        if (typeof showLoading === 'function') {
            showLoading(`正加载 “${query}” 的搜索结果`);
        }

        // 把缓存填回 videoDataMap / videoSourceMap，立即可渲染
        rebuildVideoCaches(cacheResult.results);

        // 若打开了速度检测，则后台刷新速度；画质检测随配置而定
        // 1) 速度：只有待测条目才补测
        if (speedDetectionEnabled &&
            cacheResult.results.some(r => !r.loadSpeed || r.loadSpeed === '检测中...')) {

            backgroundSpeedUpdate(cacheResult.results).then(() => {
                sortBySpeed(cacheResult.results);              // 统一排序
                rebuildVideoCaches(cacheResult.results);       // 刷新缓存
                refreshSpeedBadges(cacheResult.results);       // ★ 把速度写回卡片
                //renderSearchResults(cacheResult.results);      // 如要丝滑可换 reorderResultCards
                reorderResultCards(cacheResult.results);
            });
        }

        // 2) 画质：只要存在 pending 项就补测
        if (cacheResult.results.some(
            r => r.detectionMethod === 'pending' || r.quality === '检测中...')) {
            setTimeout(() => backgroundQualityUpdate(cacheResult.results), 120);
        }

        // 让用户至少看到 300 ms loading，保持体验
        return new Promise(resolve => {
            setTimeout(() => resolve(cacheResult.results), 300);
        });
    }

    const customAPIsFromStorage = JSON.parse(localStorage.getItem('customAPIs') || '[]');
    AppState.set('customAPIs', customAPIsFromStorage);
    const searchPromises = selectedAPIs.map(apiId => {
        let apiUrl = `/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`;
        if (apiId.startsWith('custom_')) {
            const customIndex = parseInt(apiId.replace('custom_', ''));
            const customApi = APISourceManager.getCustomApiInfo(customIndex);
            if (customApi && customApi.url) {
                apiUrl += `&customApi=${encodeURIComponent(customApi.url)}`;
            } else {
                return Promise.resolve({ code: 400, msg: `自定义API ${apiId} 无效`, list: [], apiId });
            }
        }
        return fetch(apiUrl)
            .then(response => response.json())
            .then(data => ({ ...data, apiId: apiId, apiName: APISourceManager.getSelectedApi(apiId)?.name || apiId }))
            .catch(error => ({ code: 400, msg: `API(${apiId})搜索失败: ${error.message}`, list: [], apiId }));
    }).filter(Boolean);
    try {
        const initialResults = await Promise.all(searchPromises);
        let allResults = [];
        initialResults.forEach(result => {
            if (result.code === 200 && Array.isArray(result.list)) {
                result.list.forEach(item => {
                    allResults.push({
                        ...item,
                        source_name: result.apiName,
                        source_code: result.apiId,
                        api_url: result.apiId.startsWith('custom_') ? APISourceManager.getCustomApiInfo(parseInt(result.apiId.replace('custom_', '')))?.url : ''
                    });
                });
            }
        });
        let checkedResults = allResults;

        // 只有启用速度检测时才进行测速 —— 改成后台异步，不阻塞 UI
        if (speedDetectionEnabled) {

            /* 1. 立即返回占位数据，速度/画质均标记“检测中...” */
            const quickResults = allResults.map(item => ({
                ...item,
                loadSpeed: '检测中...',
                pingTime: -1,
                sortPriority: 50,
                quality: '检测中...',
                detectionMethod: 'pending'
            }));
            // 占位阶段也按照“速度优先”排好
            sortBySpeed(quickResults);
            // 把占位结果写进缓存，页面可马上渲染
            rebuildVideoCaches(quickResults);

            /* 2. 后台启动测速 → 画质检测（互不阻塞） */
            /* 先测速，等全部测速完成后再重新排序并刷新界面 */
            backgroundSpeedUpdate(quickResults).then(() => {
                sortBySpeed(quickResults);
                rebuildVideoCaches(quickResults);
                refreshSpeedBadges(quickResults);
                reorderResultCards(quickResults);

                // 把最终排序结果写回缓存
                sessionStorage.setItem('searchResults', JSON.stringify(quickResults));
                saveSearchCache(query, selectedAPIs, quickResults); // 覆盖 30 天缓存
            });


            backgroundQualityUpdate(quickResults);

            /* 3. 立即把 quickResults 作为 30 天缓存的初始值写入 */
            saveSearchCache(query, selectedAPIs, quickResults);

            /* 4. 用占位结果作为函数的立即返回值 */
            checkedResults = quickResults;

        } else {
            // 不检测时，设置默认值以保持数据结构一致
            checkedResults = allResults.map(item => ({
                ...item,
                quality: '未知',
                loadSpeed: 'N/A',
                pingTime: -1,
                detectionMethod: 'disabled',
                sortPriority: 50
            }));
            sortBySpeed(checkedResults);

            // 在关闭检测时，结果是最终的，所以在这里重建并保存缓存
            rebuildVideoCaches(checkedResults);
            saveSearchCache(query, selectedAPIs, checkedResults);
        }
        return checkedResults;
    } catch (error) {
        console.error("执行搜索或预检测时出错:", error);
        return [];
    }
}

function renderSearchResults(allResults, doubanSearchedTitle = null) {
    const searchResultsContainer = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const searchResultsCountElement = getElement('searchResultsCount');
    if (!searchResultsContainer || !resultsArea || !searchResultsCountElement) return;
    const yellowFilterEnabled = getBoolConfig('yellowFilterEnabled', true);
    if (yellowFilterEnabled) {
        allResults = allResults.filter(item => {
            const title = item.vod_name || '';
            const type = item.type_name || '';
            return !/(伦理片|福利片|写真)/.test(type) && !/(伦理|写真|福利|成人|情色|AV)/i.test(title);
        });
    }
    try {
        const query = (DOMCache.get('searchInput')?.value || '').trim();
        if (query && allResults.length > 0) {
            sessionStorage.setItem('searchQuery', query);
            sessionStorage.setItem('searchResults', JSON.stringify(allResults));
            sessionStorage.setItem('searchSelectedAPIs', JSON.stringify(AppState.get('selectedAPIs')));
        }
    } catch (e) {
        console.error("缓存搜索结果失败:", e);
    }
    searchResultsContainer.innerHTML = '';
    resultsArea.classList.remove('hidden');
    searchResultsCountElement.textContent = allResults.length.toString();
    if (allResults.length === 0) {
        let messageTitle = doubanSearchedTitle ? `关于 <strong class="text-pink-400">《${sanitizeText(doubanSearchedTitle)}》</strong> 未找到结果` : '没有找到匹配的结果';
        let messageSuggestion = "请尝试其他关键词或更换数据源。";
        searchResultsContainer.innerHTML = `
            <div class="col-span-full text-center py-10 sm:py-16">
                <svg class="mx-auto h-12 w-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <h3 class="mt-2 text-lg font-medium text-gray-300">${messageTitle}</h3>
                <p class="mt-1 text-sm text-gray-500">${messageSuggestion}</p>
            </div>`;
        const searchArea = getElement('searchArea');
        if (searchArea) {
            searchArea.classList.add('flex-1');
            searchArea.classList.remove('mb-8');
        }
        getElement('doubanArea')?.classList.add('hidden');
        return;
    }
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    const fragment = document.createDocumentFragment();
    allResults.forEach(item => {
        fragment.appendChild(createResultItemUsingTemplate(item));
    });
    gridContainer.appendChild(fragment);
    searchResultsContainer.appendChild(gridContainer);
    // 在渲染结果后同步预加载状态
    if (typeof window.startPreloading !== 'undefined' && typeof window.stopPreloading !== 'undefined') {
        const preloadEnabled = localStorage.getItem('preloadEnabled') !== 'false';
        if (preloadEnabled) {
            // 确保预加载在搜索结果页面正确初始化
            setTimeout(() => {
                if (typeof window.startPreloading === 'function') {
                    window.startPreloading();
                }
            }, 100);
        } else {
            if (typeof window.stopPreloading === 'function') {
                window.stopPreloading();
            }
        }
    }
    const searchArea = getElement('searchArea');
    if (searchArea) {
        searchArea.classList.remove('flex-1');
        searchArea.classList.add('mb-8');
        searchArea.classList.remove('hidden');
    }
    getElement('doubanArea')?.classList.add('hidden');
}

function restoreSearchFromCache() {
    try {
        const cachedQuery = sessionStorage.getItem('searchQuery');
        const cachedResults = sessionStorage.getItem('searchResults');
        const cachedSelectedAPIs = sessionStorage.getItem('searchSelectedAPIs');
        if (cachedQuery && cachedResults) {
            const searchInput = DOMCache.get('searchInput');
            if (searchInput) searchInput.value = cachedQuery;
            if (cachedSelectedAPIs) {
                try {
                    AppState.set('selectedAPIs', JSON.parse(cachedSelectedAPIs));
                } catch (e) {
                    console.warn('恢复API选择状态失败:', e);
                }
            }
            const parsed = JSON.parse(cachedResults);
            // 若缓存里已有速度，则先排一次
            sortBySpeed(parsed);
            renderSearchResultsFromCache(parsed);
            /* ------------ 关键：发现 pending 就补检测 ------------ */
            const speedDetectionEnabled =
                getBoolConfig(PLAYER_CONFIG.speedDetectionStorage,
                    PLAYER_CONFIG.speedDetectionEnabled);

            /* —— 先补测速（若需要） —— */
            if (speedDetectionEnabled &&
                parsed.some(r => !r.loadSpeed || r.loadSpeed === '检测中...')) {

                backgroundSpeedUpdate(parsed).then(() => {
                    sortBySpeed(parsed);
                    rebuildVideoCaches(parsed);
                    refreshSpeedBadges(parsed);
                    reorderResultCards(parsed);

                    // 把最终排序结果写回缓存
                    try {
                        const query = sessionStorage.getItem('searchQuery');
                        const apis = JSON.parse(sessionStorage.getItem('searchSelectedAPIs') || '[]');
                        sessionStorage.setItem('searchResults', JSON.stringify(parsed));
                        if (query && apis.length > 0) saveSearchCache(query, apis, parsed);
                    } catch (e) { console.error("回写缓存失败", e) }
                });
            }

            /* —— 再补画质（若需要） —— */
            if (parsed.some(r =>
                r.detectionMethod === 'pending' ||
                r.quality === '检测中...')) {
                setTimeout(() => backgroundQualityUpdate(parsed), 120);
            }

            if (typeof closeModal === 'function') closeModal();

        }
    } catch (e) {
        console.error('恢复搜索状态失败:', e);
    }
}

function renderSearchResultsFromCache(cachedResults) {
    const searchResultsContainer = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const searchResultsCountElement = getElement('searchResultsCount');
    if (!searchResultsContainer || !resultsArea || !searchResultsCountElement) return;
    resultsArea.classList.remove('hidden');
    searchResultsCountElement.textContent = cachedResults.length.toString();
    searchResultsContainer.innerHTML = '';
    if (cachedResults.length > 0) {
        const gridContainer = document.createElement('div');
        gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
        const fragment = document.createDocumentFragment();
        cachedResults.forEach(item => {
            try {
                fragment.appendChild(createResultItemUsingTemplate(item));
            } catch (error) {
                console.error('渲染缓存结果项失败:', error);
            }
        });
        gridContainer.appendChild(fragment);
        searchResultsContainer.appendChild(gridContainer);
        // 刷速度标签，让已测条目立即显示
        refreshSpeedBadges(cachedResults);
    }
    const searchArea = getElement('searchArea');
    if (searchArea) {
        searchArea.classList.remove('flex-1');
        searchArea.classList.add('mb-8');
        searchArea.classList.remove('hidden');
    }
    getElement('doubanArea')?.classList.add('hidden');
}

// 获取视频详情
async function getVideoDetail(id, sourceCode, apiUrl = '') {
    if (!id || !sourceCode) {
        showToast('无效的视频信息', 'error');
        return;
    }

    const searchResults = DOMCache.get('searchResults');
    if (searchResults) {
        searchResults.innerHTML = '<div class="text-center py-4"><div class="spinner"></div><p class="mt-2 text-gray-400">正在获取视频信息，请稍候...</p></div>';
    }

    try {
        // 将原来复杂的获取和解析逻辑，替换为对新辅助函数的单行调用
        const data = await fetchSpecialDetail(id, sourceCode);
        const episodes = data.episodes;

        if (episodes.length === 0) {
            throw new Error('未找到剧集信息');
        }

        // 保存视频信息到状态
        AppState.set('currentEpisodes', episodes);
        AppState.set('currentVideoTitle', data.videoInfo?.title || '未知视频');
        AppState.set('currentEpisodeIndex', 0);

        // 保存到localStorage（用于播放器页面）
        localStorage.setItem('currentEpisodes', JSON.stringify(episodes));
        localStorage.setItem('currentVideoTitle', data.videoInfo?.title || '未知视频');
        localStorage.setItem('currentEpisodeIndex', '0');

        // 添加到观看历史
        if (data.videoInfo && typeof addToViewingHistory === 'function') {
            addToViewingHistory(data.videoInfo);
        }

        // 使用playVideo函数播放第一集
        const firstEpisode = episodes[0];
        // 尝试从API表查 sourceName
        let sourceName = '';
        if (sourceCode.startsWith('custom_') && window.APISourceManager?.getCustomApiInfo) {
            try {
                const idx = parseInt(sourceCode.replace('custom_', ''));
                sourceName = window.APISourceManager.getCustomApiInfo(idx)?.name || '';
            } catch { }
        } else if (window.API_SITES && window.API_SITES[sourceCode]) {
            sourceName = window.API_SITES[sourceCode].name;
        }
        playVideo(
            firstEpisode,
            data.videoInfo?.title || '未知视频',
            0,
            sourceName,
            sourceCode,
            id
        );
    } catch (error) {
        if (searchResults) {
            searchResults.innerHTML = `<div class="text-center py-4 text-red-400">获取视频详情失败: ${error.message}</div>`;
        }
        showToast('获取视频详情失败: ' + error.message, 'error');
    }
}

// 解析HTML中的剧集列表
function parseHtmlEpisodeList(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const episodes = [];

        // 选择所有播放列表项
        const items = doc.querySelectorAll('.stui-content__playlist li a.copy_text');

        items.forEach(item => {
            // 获取剧集名称（第一个文本节点）
            let name = "";
            for (const node of item.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    name = node.textContent.trim();
                    break;
                }
            }

            // 获取URL（hidden-xs span的内容）
            const urlSpan = item.querySelector('span.hidden-xs');
            let url = urlSpan ? urlSpan.textContent.trim() : '';

            // 移除URL开头的$符号（如果存在）
            if (url.startsWith('$')) {
                url = url.substring(1);
            }

            if (name && url) {
                episodes.push(`${name}$${url}`);
            }
        });

        return episodes;
    } catch (e) {
        console.error("解析HTML剧集失败", e);
        return [];
    }
}

// 解析vod_play_url格式
function parseVodPlayUrl(vodPlayUrl) {
    const episodes = [];

    // 第一步：按#分割不同剧集
    const segments = vodPlayUrl.split('#');

    segments.forEach(segment => {
        // 第二步：每个segment按$分割名称和URL
        const parts = segment.split('$');

        if (parts.length >= 2) {
            // 获取名称（第一部分）
            const name = parts[0].trim();
            // 获取URL（最后部分）
            const url = parts[parts.length - 1].trim();

            // 过滤无效条目
            if (name && url && url.startsWith('http')) {
                episodes.push(`${name}$${url}`);
            }
        }
    });

    return episodes;
}

// 重置到首页
function resetToHome() {
    const searchInput = DOMCache.get('searchInput');
    const searchResults = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const doubanArea = getElement('doubanArea');
    const searchArea = getElement('searchArea');

    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';

    // 回到「初始版面」
    /* ---- 恢复搜索区默认样式 ---- */
    if (searchArea) {
        searchArea.classList.add('flex-1');
        searchArea.classList.remove('mb-8');
        searchArea.classList.remove('hidden');
    }

    /* ---- 隐藏结果区 ---- */
    resultsArea?.classList.add('hidden');

    /* ---- 视用户设置决定是否显示豆瓣区 ---- */
    if (doubanArea) {
        const showDouban = getBoolConfig('doubanEnabled', false);
        doubanArea.classList.toggle('hidden', !showDouban);

        // 如果豆瓣热门应该显示，则调用其专属的检查加载函数
        if (showDouban && typeof window.reloadDoubanIfNeeded === 'function') {
            window.reloadDoubanIfNeeded();
        }
    }

    // 清理搜索缓存
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
    } catch (e) {
        console.error('清理搜索缓存失败:', e);
    }

    renderSearchHistory();
}

// 导出需要在全局访问的函数
window.search = search;
window.getVideoDetail = getVideoDetail;
window.resetToHome = resetToHome;
window.playVideo = playVideo;
window.playPreviousEpisode = playPreviousEpisode;
window.playNextEpisode = playNextEpisode;
window.playFromHistory = playFromHistory;

function createResultItemUsingTemplate(item) {
    const template = document.getElementById('search-result-template');
    if (!template) return document.createDocumentFragment();
    const clone = template.content.cloneNode(true);
    const cardElement = clone.querySelector('.card-hover');
    cardElement.videoData = item;
    const imgElement = clone.querySelector('.result-img');
    if (imgElement) {
        imgElement.src = item.vod_pic && item.vod_pic.startsWith('http') ? item.vod_pic : 'https://via.placeholder.com/100x150/191919/555555?text=No+Image';
        imgElement.alt = item.vod_name || '未知标题';
        imgElement.onerror = function () {
            this.onerror = null;
            this.src = 'https://via.placeholder.com/100x150/191919/555555?text=Error';
            this.classList.add('object-contain');
        };
    }
    const titleElement = clone.querySelector('.result-title');
    if (titleElement) {
        titleElement.textContent = item.vod_name || '未知标题';
        titleElement.title = item.vod_name || '未知标题';
    }
    const typeElement = clone.querySelector('.result-type');
    if (typeElement) {
        if (item.type_name) {
            typeElement.textContent = item.type_name;
            typeElement.classList.remove('hidden');
        } else {
            typeElement.classList.add('hidden');
        }
    }
    const yearElement = clone.querySelector('.result-year');
    if (yearElement) {
        if (item.vod_year) {
            yearElement.textContent = item.vod_year;
            yearElement.classList.remove('hidden');
        } else {
            yearElement.classList.add('hidden');
        }
    }
    const remarksElement = clone.querySelector('.result-remarks');
    if (remarksElement) {
        if (item.vod_remarks) {
            remarksElement.textContent = item.vod_remarks;
            remarksElement.classList.remove('hidden');
        } else {
            remarksElement.classList.add('hidden');
        }
    }
    const sourceNameElement = clone.querySelector('.result-source-name');
    if (sourceNameElement) {
        if (item.source_name) {
            sourceNameElement.textContent = item.source_name;
            sourceNameElement.className = 'result-source-name text-xs text-gray-400';
        } else {
            sourceNameElement.className = 'result-source-name hidden';
        }
    }
    const sourceContainer = clone.querySelector('.result-source');
    if (sourceContainer) {
        // 检查是否启用画质检测
        const speedDetectionEnabled = getBoolConfig(PLAYER_CONFIG.speedDetectionStorage, PLAYER_CONFIG.speedDetectionEnabled);
        if (speedDetectionEnabled) {
            const qualityBadge = document.createElement('span');
            const qualityId = `${item.source_code}_${item.vod_id}`;
            qualityBadge.setAttribute('data-quality-id', qualityId);
            updateQualityBadgeUI(qualityId, item.quality || '未知', qualityBadge); // 直接调用更新函数

            const quality = item.quality || '未知';
            const isRetryable = ['未知', '检测失败', '检测超时', '编码不支持', '播放失败', '无有效链接'].includes(quality);

            // 如果状态是可重试的，就给它绑定手动重测的点击事件
            if (isRetryable) {
                qualityBadge.style.cursor = 'pointer';
                qualityBadge.title = '点击重新检测';
                qualityBadge.onclick = (event) => {
                    // 阻止事件冒泡，这样就不会触发父级卡片的弹窗事件了
                    event.stopPropagation();

                    // 调用手动重测函数
                    manualRetryDetection(qualityId, item);
                };
            }

            sourceContainer.appendChild(qualityBadge);
        }
    }
    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.name = item.vod_name || '';
    cardElement.dataset.sourceCode = item.source_code || '';
    if (item.api_url) cardElement.dataset.apiUrl = item.api_url;
    cardElement.dataset.videoKey = `${item.vod_name}|${item.vod_year || ''}`;
    cardElement.dataset.year = item.vod_year || '';
    cardElement.dataset.typeName = item.type_name || '';
    cardElement.dataset.remarks = item.vod_remarks || '';
    cardElement.dataset.area = item.vod_area || '';
    cardElement.dataset.actor = item.vod_actor || '';
    cardElement.dataset.director = item.vod_director || '';
    cardElement.dataset.blurb = item.vod_blurb || '';
    /* 让列节点本身带上标识，便于重排 */
    const wrapper = cardElement.closest('[data-list-col]') || cardElement.parentElement;
    if (wrapper) {
        wrapper.dataset.id = item.vod_id || '';
        wrapper.dataset.sourceCode = item.source_code || '';
    }

    cardElement.onclick = handleResultClick;
    return clone;
}

function handleResultClick(event) {
    // 如果点击的是画质标签，不执行卡片点击逻辑
    if (event.target.classList.contains('quality-badge')) {
        return;
    }

    const card = event.currentTarget;
    const { id, name, sourceCode, apiUrl = '', year, typeName, videoKey, blurb, remarks, area, actor, director } = card.dataset;
    if (typeof showVideoEpisodesModal === 'function') {
        showVideoEpisodesModal(id, name, sourceCode, apiUrl, { year, typeName, videoKey, blurb, remarks, area, actor, director });
    } else {
        console.error('showVideoEpisodesModal function not found!');
        showToast('无法加载剧集信息', 'error');
    }
}

window.handleResultClick = handleResultClick;
window.copyLinks = copyLinks;
window.toggleEpisodeOrderUI = toggleEpisodeOrderUI;

async function showVideoEpisodesModal(id, title, sourceCode, apiUrl, fallbackData) {
    const videoDataMap = AppState.get('videoDataMap');
    const uniqueVideoKey = `${sourceCode}_${id}`;
    const videoData = videoDataMap ? videoDataMap.get(uniqueVideoKey) : null;
    if (!videoData) {
        hideLoading();
        showToast('缓存中找不到视频数据，请刷新后重试', 'error');
        return;
    }
    let episodes = [];
    const originalEpisodeNames = [];
    if (videoData.vod_play_url) {
        const playFroms = (videoData.vod_play_from || '').split('$$$');
        const urlGroups = videoData.vod_play_url.split('$$$');
        const selectedApi = APISourceManager.getSelectedApi(sourceCode);
        const sourceName = selectedApi ? selectedApi.name : '';
        let sourceIndex = playFroms.indexOf(sourceName);
        if (sourceIndex === -1) sourceIndex = 0;
        if (urlGroups[sourceIndex]) {
            episodes = urlGroups[sourceIndex].split('#').filter(item => item && item.includes('$'));
            episodes.forEach(ep => {
                const parts = ep.split('$');
                originalEpisodeNames.push(parts[0].trim());
            });
        }
    }
    AppState.set('originalEpisodeNames', originalEpisodeNames);

    // 3. 后台异步获取真实地址（不阻塞弹窗显示）
    const isSpecialSource = !sourceCode.startsWith('custom_') && API_SITES[sourceCode] && API_SITES[sourceCode].detail;

    // 将 isCustomSpecialSource 的定义移到这里，并与 isSpecialSource 合并判断
    const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
    const apiInfo = APISourceManager.getCustomApiInfo(customIndex);
    const isCustomSpecialSource = sourceCode.startsWith('custom_') && apiInfo?.detail;

    if (isSpecialSource || isCustomSpecialSource) {
        setTimeout(async () => {
            try {
                // 直接调用新的辅助函数获取数据
                const detailData = await fetchSpecialDetail(id, sourceCode);

                // 使用获取到的真实地址更新UI
                episodes = detailData.episodes;
                AppState.set('currentEpisodes', episodes);
                localStorage.setItem('currentEpisodes', JSON.stringify(episodes));

                const episodeGrid = document.querySelector('#modalContent [data-field="episode-buttons-grid"]');
                if (episodeGrid) {
                    episodeGrid.innerHTML = renderEpisodeButtons(episodes, title, sourceCode, sourceNameForDisplay, effectiveTypeName);
                }
            } catch (e) {
                console.log('后台获取真实地址失败:', e.message);
            }
        }, 500);
    }

    // 4. 渲染弹窗（原代码逻辑）
    hideLoading(); // 移除加载提示，立即显示弹窗
    const effectiveTitle = videoData.vod_name || title;
    const effectiveTypeName = videoData.type_name || fallbackData.typeName;
    const sourceNameForDisplay = videoData.source_name || APISourceManager.getSelectedApi(sourceCode)?.name || '未知源';
    AppState.set('currentEpisodes', episodes);
    AppState.set('currentVideoTitle', effectiveTitle);
    AppState.set('currentSourceName', sourceNameForDisplay);
    AppState.set('currentSourceCode', sourceCode);
    AppState.set('currentVideoId', id);
    AppState.set('currentVideoYear', videoData.vod_year || fallbackData.year);
    AppState.set('currentVideoTypeName', effectiveTypeName);
    AppState.set('currentVideoKey', fallbackData.videoKey);
    localStorage.setItem('currentEpisodes', JSON.stringify(episodes));
    localStorage.setItem('currentVideoTitle', effectiveTitle);
    const template = document.getElementById('video-details-template');
    if (!template) return showToast('详情模板未找到!', 'error');
    const modalContent = template.content.cloneNode(true);
    const fields = {
        type: effectiveTypeName || '未知',
        year: videoData.vod_year || fallbackData.year || '未知',
        area: videoData.vod_area || fallbackData.area || '未知',
        director: videoData.vod_director || fallbackData.director || '未知',
        actor: videoData.vod_actor || fallbackData.actor || '未知',
        remarks: videoData.vod_remarks || fallbackData.remarks || '无',
        description: (videoData.vod_blurb || fallbackData.blurb || '暂无简介。').replace(/<[^>]+>/g, '').trim(),
        'episode-count': episodes.length,
    };
    for (const [key, value] of Object.entries(fields)) {
        const el = modalContent.querySelector(`[data-field="${key}"]`);
        if (el) el.textContent = value;
    }

    // 渲染画质标签（在showVideoEpisodesModal函数里）
    const qualityTagElement = modalContent.querySelector('[data-field="quality-tag"]');
    if (qualityTagElement) {
        const speedDetectionEnabled = getBoolConfig(PLAYER_CONFIG.speedDetectionStorage, PLAYER_CONFIG.speedDetectionEnabled);
        if (speedDetectionEnabled) {
            const sourceProvidedQuality = videoData.vod_quality;
            const detectedQuality = videoData.quality;
            const finalQuality = sourceProvidedQuality || detectedQuality || '未知';
            updateQualityBadgeUI(uniqueVideoKey, finalQuality, qualityTagElement);
        } else {
            // 关闭画质检测时隐藏标签
            qualityTagElement.classList.add('hidden');
        }
    }

    const speedTagElement = modalContent.querySelector('[data-field="speed-tag"]');
    if (speedTagElement && videoData.loadSpeed && isValidSpeedValue(videoData.loadSpeed)) {
        speedTagElement.textContent = videoData.loadSpeed;
        speedTagElement.classList.remove('hidden');
        speedTagElement.style.backgroundColor = '#16a34a';
    }
    const episodeButtonsGrid = modalContent.querySelector('[data-field="episode-buttons-grid"]');
    const varietyShowTypes = ['综艺', '脱口秀', '真人秀', '纪录片'];
    const isVarietyShow = varietyShowTypes.some(type => effectiveTypeName && effectiveTypeName.includes(type));
    if (episodeButtonsGrid) {
        if (isVarietyShow) {
            episodeButtonsGrid.className = 'variety-grid-layout';
        }
        episodeButtonsGrid.innerHTML = renderEpisodeButtons(episodes, effectiveTitle, sourceCode, sourceNameForDisplay, effectiveTypeName);
    }
    modalContent.querySelector('[data-action="copy-links"]').addEventListener('click', copyLinks);
    modalContent.querySelector('[data-action="toggle-order"]').addEventListener('click', () => {
        toggleEpisodeOrderUI(episodeButtonsGrid);
    });
    const orderIcon = modalContent.querySelector('[data-field="order-icon"]');
    if (orderIcon) {
        orderIcon.style.transform = (AppState.get('episodesReversed') || false) ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    showModal(modalContent, `${effectiveTitle} (${sourceNameForDisplay})`);
}

function toggleEpisodeOrderUI(container) {
    if (!container) {
        container = document.querySelector('#modalContent [data-field="episode-buttons-grid"]');
        if (!container) return;
    }
    let currentReversedState = AppState.get('episodesReversed') || false;
    AppState.set('episodesReversed', !currentReversedState);
    const episodes = AppState.get('currentEpisodes');
    const title = AppState.get('currentVideoTitle');
    const sourceName = AppState.get('currentSourceName');
    const sourceCode = AppState.get('currentSourceCode');
    const typeName = AppState.get('currentVideoTypeName');
    if (episodes && title && sourceCode) {
        container.innerHTML = renderEpisodeButtons(episodes, title, sourceCode, sourceName || '', typeName);
    }
    const toggleBtn = document.querySelector('#modal [data-action="toggle-order"]');
    const orderIcon = document.querySelector('#modal [data-field="order-icon"]');
    if (toggleBtn && orderIcon) {
        const reversed = AppState.get('episodesReversed');
        toggleBtn.title = reversed ? '切换为正序排列' : '切换为倒序排列';
        orderIcon.style.transform = reversed ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

function renderEpisodeButtons(episodes, videoTitle, sourceCode, sourceName, typeName) {
    if (!episodes || episodes.length === 0) {
        return '<p class="text-center text-gray-500 col-span-full">暂无剧集信息</p>';
    }
    const currentReversedState = AppState.get('episodesReversed') || false;
    const vodId = AppState.get('currentVideoId') || '';
    const year = AppState.get('currentVideoYear') || '';
    const videoKey = AppState.get('currentVideoKey') || '';
    const realEpisodes = AppState.get('currentEpisodes') || episodes;
    const displayEpisodes = currentReversedState ? [...realEpisodes].reverse() : [...realEpisodes];
    const varietyShowTypes = ['综艺', '脱口秀', '真人秀'];
    const isVarietyShow = varietyShowTypes.some(type => typeName && typeName.includes(type));
    return displayEpisodes.map((episodeString, displayIndex) => {
        const originalIndex = currentReversedState ? (episodes.length - 1 - displayIndex) : displayIndex;
        const originalEpisodeNames = AppState.get('originalEpisodeNames') || [];
        const originalName = originalEpisodeNames[originalIndex] || '';
        const parts = (episodeString || '').split('$');
        const episodeName = parts.length > 1 ? parts[0].trim() : '';
        let buttonText = '';
        let buttonTitle = '';
        let buttonClasses = '';
        if (isVarietyShow) {
            buttonText = originalName || episodeName || `第${originalIndex + 1}集`;
            buttonTitle = buttonText;
            buttonClasses = 'episode-btn';
        } else {
            if (originalName && (originalName || isNaN(parseInt(originalName, 10)))) {
                buttonText = originalName;
            } else if (episodeName && isNaN(parseInt(episodeName, 10))) {
                buttonText = episodeName;
            } else {
                buttonText = `第 ${originalIndex + 1} 集`;
            }
            buttonTitle = buttonText;
            buttonClasses = 'episode-btn px-2 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs sm:text-sm transition-colors truncate';
        }
        const safeVideoTitle = encodeURIComponent(videoTitle);
        const safeSourceName = encodeURIComponent(sourceName);
        let playUrl = episodeString;
        if (episodeString.includes('$')) {
            playUrl = episodeString.split('$').pop();
        }
        return `
            <button 
                onclick="playVideo('${playUrl}', decodeURIComponent('${safeVideoTitle}'), ${originalIndex}, decodeURIComponent('${safeSourceName}'), '${sourceCode}', '${vodId}', '${year}', '${typeName}', '${videoKey}')" 
                class="${buttonClasses}"
                data-index="${originalIndex}"
                title="${buttonTitle}" 
            >
                ${buttonText}
            </button>`;
    }).join('');
}

function copyLinks() {
    const reversed = AppState.get('episodesReversed') || false;
    const episodesToCopy = AppState.get('currentEpisodes');
    if (!episodesToCopy || episodesToCopy.length === 0) {
        showToast('没有可复制的链接', 'warning');
        return;
    }
    const actualEpisodes = reversed ? [...episodesToCopy].reverse() : [...episodesToCopy];
    const linkList = actualEpisodes.join('\r\n');
    navigator.clipboard.writeText(linkList).then(() => {
        showToast('所有剧集链接已复制', 'success');
    }).catch(err => {
        console.error('复制链接失败:', err);
        showToast('复制失败，请检查浏览器权限', 'error');
    });
}

window.showVideoEpisodesModal = showVideoEpisodesModal;

// 更新画质标签的UI显示
function updateQualityBadgeUI(qualityId, quality, badgeElement) {
    const badge = badgeElement || document.querySelector(`.quality-badge[data-quality-id="${qualityId}"]`);
    if (!badge) return;

    const cardElement = badge.closest('.card-hover');
    const videoData = cardElement ? cardElement.videoData : null;

    badge.textContent = quality;
    badge.className = 'quality-badge text-xs font-medium py-0.5 px-1.5 rounded';
    badge.title = '';
    badge.style.cursor = 'default';
    badge.onclick = null;

    // 根据画质设置不同的颜色（使用小写并增加更多情况）
    switch (String(quality).toLowerCase()) {
        case '4k':
            badge.classList.add('bg-amber-500', 'text-white');
            break;
        case '2k':
        case '1080p':
            badge.classList.add('bg-purple-600', 'text-purple-100');
            break;
        case '720p':
            badge.classList.add('bg-blue-600', 'text-blue-100');
            break;
        case '高清':
        case '480p':
            badge.classList.add('bg-green-600', 'text-green-100');
            break;
        case 'sd':
        case '标清':
            badge.classList.add('bg-gray-500', 'text-gray-100');
            break;
        case '检测失败':
        case '检测超时':
        case '编码不支持':
        case '播放失败':
        case '未知':
        case '无有效链接':
            badge.classList.add('bg-red-600', 'text-red-100');
            badge.title = '点击重新检测';
            badge.style.cursor = 'pointer';
            if (videoData) {
                badge.onclick = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    manualRetryDetection(qualityId, videoData);
                };
            }
            break;
        default:
            badge.classList.add('bg-gray-600', 'text-gray-200');
            break;
    }
}

async function manualRetryDetection(qualityId, videoData) {
    const badge = document.querySelector(`.quality-badge[data-quality-id="${qualityId}"]`);
    if (!badge || badge.textContent === '检测中...') return; // 防止重复点击

    // 1. 更新UI，告知用户正在检测
    badge.textContent = '检测中...';
    badge.className = 'quality-badge text-xs font-medium py-0.5 px-1.5 rounded bg-gray-500 text-white';
    badge.style.cursor = 'default';
    badge.title = '正在检测，请稍候';
    badge.onclick = null; // 暂时禁用点击

    try {
        // 2. 先进行速度测试
        const [speedResult] = await window.SpeedTester.testSources([videoData], { concurrency: 1 });

        // ★ 把 m3u8 文本写回 videoData 以便后续重用
        if (speedResult && speedResult.m3u8Content) {
            videoData.m3u8Content = speedResult.m3u8Content;
        }

        // 3. 再进行画质检测
        let firstEpisodeUrl = '';
        if (videoData && videoData.vod_play_url) {
            const firstSegment = videoData.vod_play_url.split('#')[0];
            firstEpisodeUrl = firstSegment.includes('$') ? firstSegment.split('$')[1] : firstSegment;
        }

        let qualityResult = { quality: '未知', detectionMethod: 'none' };
        if (firstEpisodeUrl) {
            qualityResult = await window.precheckSource(
                firstEpisodeUrl,
                videoData.m3u8Content || null      // ★ 复用文本，避免再下
            );

        }

        // 4. 合并结果
        const testedResult = {
            ...videoData,
            ...speedResult, // 包含速度信息
            quality: qualityResult.quality, // 覆盖为真实画质
            detectionMethod: qualityResult.detectionMethod // 使用画质检测的方法
        };

        showToast(`检测完成: ${testedResult.quality} - ${testedResult.loadSpeed}`, 'success', 2000);

        // 5. 更新全局数据缓存
        const videoDataMap = AppState.get('videoDataMap');
        if (videoDataMap) {
            videoDataMap.set(qualityId, testedResult);
            // 同时更新sessionStorage中的缓存
            sessionStorage.setItem('videoDataCache', JSON.stringify(Array.from(videoDataMap.entries())));
        }

        // 6. 更新附加到卡片DOM元素上的数据
        const cardElement = badge.closest('.card-hover');
        if (cardElement) {
            cardElement.videoData = testedResult;
        }

        // 7. 更新UI显示
        updateQualityBadgeUI(qualityId, testedResult.quality, badge);

        // 8. 如果弹窗打开，也更新弹窗中的速度显示
        const modal = document.getElementById('modal');
        if (modal && !modal.classList.contains('hidden')) {
            const modalSpeedTag = modal.querySelector('[data-field="speed-tag"]');
            if (modalSpeedTag && testedResult.loadSpeed && isValidSpeedValue(testedResult.loadSpeed)) {
                modalSpeedTag.textContent = testedResult.loadSpeed;
                modalSpeedTag.classList.remove('hidden');
                modalSpeedTag.style.backgroundColor = '#16a34a';
            }
        }

        // 在手动更新单个条目后，立即同步更新两个核心的“搜索结果列表”缓存
        try {
            // 1. 更新 sessionStorage 中的搜索结果列表
            const searchResultsRaw = sessionStorage.getItem('searchResults');
            if (searchResultsRaw) {
                const resultsArray = JSON.parse(searchResultsRaw);
                const indexToUpdate = resultsArray.findIndex(item => `${item.source_code}_${item.vod_id}` === qualityId);

                if (indexToUpdate !== -1) {
                    // 用最新的、完整的结果替换掉旧的
                    resultsArray[indexToUpdate] = testedResult;
                    sessionStorage.setItem('searchResults', JSON.stringify(resultsArray));

                    // 2. 更新 localStorage 中的长期缓存
                    const q = AppState.get('latestQuery');
                    const ap = AppState.get('latestAPIs') || [];
                    if (q && ap.length > 0) {
                        saveSearchCache(q, ap, resultsArray);
                    }
                }
            }
        } catch (e) {
            console.warn('手动重测后，回写搜索结果缓存列表失败:', e);
        }

    } catch (error) {
        console.error('手动重新检测失败:', error);
        // 如果出错，也在UI上明确显示失败
        updateQualityBadgeUI(qualityId, '检测失败', badge);
    }
}

window.manualRetryDetection = manualRetryDetection;

function reorderResultCards(sorted) {
    const grid = document.querySelector('#searchResults .grid');
    if (!grid) return;

    // 以“列节点”而非 card.parentElement 作为单位
    const colMap = new Map();
    grid.querySelectorAll('[data-id][data-source-code]').forEach(col => {
        colMap.set(`${col.dataset.sourceCode}_${col.dataset.id}`, col);
    });

    const frag = document.createDocumentFragment();
    sorted.forEach(r => {
        const key = `${r.source_code}_${r.vod_id}`;
        const col = colMap.get(key);
        if (col) frag.appendChild(col);
    });
    grid.appendChild(frag);
}
// 专门用于获取特殊源（内置或自定义）真实播放地址的辅助函数
async function fetchSpecialDetail(id, sourceCode) {
    const detailUrl = `/api/detail?id=${id}&source=${sourceCode}`;

    const response = await fetch(detailUrl);
    if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
    }
    const data = await response.json();
    if (data.code !== 200 || !Array.isArray(data.episodes) || data.episodes.length === 0) {
        throw new Error(data.msg || '未能获取到有效的剧集信息');
    }
    return data;
}