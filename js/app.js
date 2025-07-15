// 主应用程序逻辑 使用AppState进行状态管理，DOMCache进行DOM元素缓存
// Basic AppState Implementation
const AppState = (function () {
    const state = new Map();
    return {
        set: function (key, value) {
            state.set(key, value);
        },
        get: function (key) {
            return state.get(key);
        },
        // Method to initialize multiple values
        initialize: function (initialData = {}) {
            for (const key in initialData) {
                if (initialData.hasOwnProperty(key)) {
                    state.set(key, initialData[key]);
                }
            }
        }
    };
})();

// Basic DOMCache Implementation
const DOMCache = (function () {
    const cache = new Map();
    return {
        set: function (key, element) {
            if (element) {
                cache.set(key, element);
            }
        },
        get: function (key) {
            return cache.get(key);
        },
        // Initialize multiple elements
        init: function (elementsToCache) {
            for (const key in elementsToCache) {
                if (elementsToCache.hasOwnProperty(key)) {
                    const element = document.getElementById(elementsToCache[key]);
                    if (element) {
                        cache.set(key, element);
                    }
                }
            }
        }
    };
})();

// 显示详情
function showDetails(element) {
    const id = element.dataset.id;
    const sourceCode = element.dataset.source;
    console.log(`STUB: showDetails called for element with ID: ${id}, Source: ${sourceCode}`);
}

//文本净化函数
function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function playVideo(episodeString, title, episodeIndex, sourceName = '', sourceCode = '', vodId = '', year = '', typeName = '', videoKey = '') {
    if (!episodeString) {
        showToast('无效的视频链接', 'error');
        return;
    }

    // 分割剧集字符串，提取真实的URL用于播放
    let playUrl = episodeString;
    if (episodeString.includes('$')) {
        const parts = episodeString.split('$');
        playUrl = parts[parts.length - 1];
    }

    if (!playUrl || !playUrl.startsWith('http')) {
        showToast('视频链接格式无效', 'error');
        console.error('解析出的播放链接无效:', playUrl);
        return;
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
            episodes: AppState.get('currentEpisodes') || []
        };
        addToViewingHistory(videoInfoForHistory);
    }

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

// 生成视频统一标识符，用于跨线路共享播放进度
function generateUniversalId(title, year, episodeIndex) {
    // 移除标题中的特殊字符和空格，转换为小写   
    const normalizedTitle = title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
    const normalizedYear = year ? year : 'unknown';
    return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
}

// 播放上一集
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

// 播放下一集
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

async function playFromHistory(url, title, episodeIndex, playbackPosition = 0) {
    console.log(`[App - playFromHistory] Called with: url=${url}, title=${title}, epIndex=${episodeIndex}, pos=${playbackPosition}`);

    let historyItem = null;
    let episodesList = [];
    let vodId = '', actualSourceName = '', actualSourceCode = '', videoYear = '';

    try {
        const history = JSON.parse(localStorage.getItem('viewingHistory') || '[]');
        historyItem = history.find(item =>
            item.url === url &&
            item.title === title &&
            item.episodeIndex === episodeIndex
        );

        if (historyItem) {
            vodId = historyItem.vod_id || '';
            actualSourceName = historyItem.sourceName || '';
            actualSourceCode = historyItem.sourceCode || '';
            videoYear = historyItem.year || '';
        }
    } catch (e) {
        console.error("读取历史记录失败:", e);
    }

    // 优先尝试拉取最新数据
    if (vodId && actualSourceCode) {
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
                // 只要成功获取，就直接使用最新的数据，不再进行复杂校验
                episodesList = detailData.episodes;
                console.log("[playFromHistory] 成功获取最新剧集列表，直接使用。");
            } else {
                // 如果API返回错误码，则回退
                throw new Error(detailData.msg || 'API返回数据无效');
            }
        } catch (e) {
            // 任何失败（网络、API错误等），都安全回退到使用历史记录中的数据
            console.warn(`[playFromHistory] 获取最新数据失败 (${e.message})，回退到历史数据。`);
            if (historyItem && Array.isArray(historyItem.episodes) && historyItem.episodes.length > 0) {
                episodesList = historyItem.episodes;
            }
        }
    } else if (historyItem && Array.isArray(historyItem.episodes)) {
        // 如果历史项中没有ID，直接使用历史的episodes
        episodesList = historyItem.episodes;
    }

    // 如果到这里 episodesList 依然为空，做最后一次补救
    if (episodesList.length === 0) {
        episodesList = AppState.get('currentEpisodes') || JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
    }

    // --- 后续跳转逻辑 ---
    if (episodesList.length > 0) {
        AppState.set('currentEpisodes', episodesList);
        localStorage.setItem('currentEpisodes', JSON.stringify(episodesList));
    }

    let actualEpisodeIndex = episodeIndex;
    // 确保索引在有效范围内
    if (actualEpisodeIndex >= episodesList.length) {
        actualEpisodeIndex = episodesList.length > 0 ? episodesList.length - 1 : 0;
    }

    // 关键：finalUrl 必须从更新后的 episodesList 中获取
    const finalUrl = (episodesList.length > 0 && episodesList[actualEpisodeIndex]) ? episodesList[actualEpisodeIndex] : url;

    AppState.set('currentEpisodeIndex', actualEpisodeIndex);
    AppState.set('currentVideoTitle', title);
    localStorage.setItem('currentEpisodeIndex', actualEpisodeIndex.toString());
    localStorage.setItem('currentVideoTitle', title);

    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', finalUrl); // 使用最终确定的URL
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', actualEpisodeIndex.toString());
    if (vodId) playerUrl.searchParams.set('id', vodId);
    if (actualSourceName) playerUrl.searchParams.set('source', actualSourceName);
    if (actualSourceCode) playerUrl.searchParams.set('source_code', actualSourceCode);
    if (videoYear) playerUrl.searchParams.set('year', videoYear); // 确保年份信息被传递
    if (playbackPosition > 0) playerUrl.searchParams.set('position', playbackPosition.toString());

    const uid = generateUniversalId(title, videoYear, actualEpisodeIndex);
    playerUrl.searchParams.set('universalId', uid);

    const adOn = typeof getBoolConfig !== 'undefined' && typeof PLAYER_CONFIG !== 'undefined'
        ? getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled)
        : PLAYER_CONFIG?.adFilteringEnabled ?? false;
    playerUrl.searchParams.set('af', adOn ? '1' : '0');

    window.location.href = playerUrl.toString();
}

//从localStorage获取布尔配置
function getBoolConfig(key, defaultValue) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
}

// 应用程序初始化
document.addEventListener('DOMContentLoaded', function () {

    // 初始化应用状态
    initializeAppState();

    // 初始化DOM缓存
    initializeDOMCache();

    // 初始化API源管理器
    APISourceManager.init();

    // 初始化事件监听器
    initializeEventListeners();

    // 加载搜索历史
    renderSearchHistory();

    // 恢复搜索状态
    restoreSearchFromCache();
});

/**
 * 初始化应用状态
 * 从localStorage加载初始状态并设置到AppState，如果localStorage为空则写入默认值
 */
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
        if (cachedData) {
            // 将存储的数组转换回 Map 对象
            const restoredMap = new Map(JSON.parse(cachedData));
            AppState.set('videoDataMap', restoredMap);
            console.log('已从 sessionStorage 恢复视频元数据缓存:', restoredMap);
        } else {
            // 如果缓存不存在，确保 videoDataMap 是一个空的 Map
            AppState.set('videoDataMap', new Map());
        }
    } catch (e) {
        console.error('从 sessionStorage 恢复视频元数据缓存失败:', e);
        AppState.set('videoDataMap', new Map());
    }
}

// 初始化DOM缓存 缓存频繁访问的DOM元素
function initializeDOMCache() {
    // 缓存搜索相关元素
    DOMCache.set('searchInput', document.getElementById('searchInput'));
    DOMCache.set('searchResults', document.getElementById('searchResults'));
    DOMCache.set('searchForm', document.getElementById('searchForm'));
    DOMCache.set('searchHistoryContainer', document.getElementById('searchHistory'));

    // 缓存API相关元素
    DOMCache.set('apiCheckboxes', document.getElementById('apiCheckboxes'));
    DOMCache.set('customApisList', document.getElementById('customApisList'));
    DOMCache.set('selectedApiCount', document.getElementById('selectedApiCount'));
    DOMCache.set('addCustomApiForm', document.getElementById('addCustomApiForm'));
    DOMCache.set('customApiName', document.getElementById('customApiName'));
    DOMCache.set('customApiUrl', document.getElementById('customApiUrl'));
    DOMCache.set('customApiIsAdult', document.getElementById('customApiIsAdult'));

    // 缓存过滤器相关元素
    DOMCache.set('yellowFilterToggle', document.getElementById('yellowFilterToggle'));
    DOMCache.set('adFilteringToggle', document.getElementById('adFilterToggle'));

    // 缓存预加载相关元素
    DOMCache.set('preloadingToggle', document.getElementById('preloadingToggle'));
    // (fix) ID is preloadCountInput, not preloadCount
    DOMCache.set('preloadCountInput', document.getElementById('preloadCountInput'));
}

// 初始化事件监听器
function initializeEventListeners() {
    // 搜索表单提交事件
    const searchForm = DOMCache.get('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', function (e) {
            e.preventDefault();
            search();
        });
    }

    // 搜索输入框事件
    const searchInput = DOMCache.get('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            // 可以添加实时搜索建议等功能
        });
    }

    // 广告过滤开关事件
    const adFilteringToggle = DOMCache.get('adFilteringToggle');
    if (adFilteringToggle) {
        adFilteringToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, enabled.toString());
            showToast(enabled ? '已启用广告过滤' : '已禁用广告过滤', 'info');
        });

        // 初始化开关状态 - 使用getBoolConfig
        adFilteringToggle.checked = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled);

    }

    // 黄色内容过滤开关事件
    const yellowFilterToggle = DOMCache.get('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem('yellowFilterEnabled', enabled.toString());
            showToast(enabled ? '已启用黄色内容过滤' : '已禁用黄色内容过滤', 'info');
        });

        // 初始化开关状态 - 使用getBoolConfig
        yellowFilterToggle.checked = getBoolConfig('yellowFilterEnabled', true);
    }

    // 预加载开关事件
    const preloadingToggle = DOMCache.get('preloadingToggle');
    if (preloadingToggle) {
        preloadingToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem('preloadingEnabled', enabled.toString());

            PLAYER_CONFIG.enablePreloading = enabled;

            showToast(enabled ? '已启用预加载' : '已禁用预加载', 'info');

            const preloadCountInput = DOMCache.get('preloadCountInput');
            if (preloadCountInput) {
                preloadCountInput.disabled = !enabled;
            }
        });

        // 初始化开关状态 - 使用getBoolConfig
        const preloadingEnabled = getBoolConfig('preloadingEnabled', true);
        preloadingToggle.checked = preloadingEnabled;

        PLAYER_CONFIG.enablePreloading = preloadingEnabled;

        // 更新预加载数量输入框的可用性
        const preloadCountInput = DOMCache.get('preloadCountInput');
        if (preloadCountInput) {
            preloadCountInput.disabled = !preloadingEnabled;
        }
    }

    // 预加载数量输入事件
    const preloadCountInput = DOMCache.get('preloadCountInput');
    if (preloadCountInput) {
        preloadCountInput.addEventListener('change', function (e) {
            let count = parseInt(e.target.value);
            if (isNaN(count) || count < 1) {
                count = 1;
                e.target.value = '1';
            } else if (count > 10) {
                count = 10;
                e.target.value = '10';
            }

            localStorage.setItem('preloadCount', count.toString());
            PLAYER_CONFIG.preloadCount = count;

            showToast(`预加载数量已设置为 ${count}`, 'info');
        });

        // 初始化预加载数量
        const savedCount = localStorage.getItem('preloadCount');
        const preloadCount = savedCount ? parseInt(savedCount) : 2;
        preloadCountInput.value = preloadCount;
        PLAYER_CONFIG.preloadCount = preloadCount;
    }
}

// 初始化UI组件
function initializeUIComponents() {
    // 初始化任何需要的UI组件
}

// 执行搜索
function search(options = {}) {
    // 在每次新搜索开始时，强制清除所有旧的搜索结果缓存
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
        sessionStorage.removeItem('videoSourceMap');
        console.log('[缓存] 已在执行新搜索前清除旧缓存。');
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
        if (searchResultsContainer) searchResultsContainer.innerHTML = '<div class="text-center py-4 text-gray-400">请至少选择一个API源</div>';
        if (isNormalSearch && typeof hideLoading === 'function') hideLoading();
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
    }

    performSearch(query, selectedAPIs)
        .then(resultsData => {
            renderSearchResults(resultsData, options.doubanQuery ? query : null);
        })
        .catch(error => {
            if (searchResultsContainer) searchResultsContainer.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
        })
        .finally(() => {
            if (isNormalSearch && typeof hideLoading === 'function') {
                hideLoading();
            }
            if (typeof options.onComplete === 'function') {
                options.onComplete();
            }
        });
}

// 执行搜索请求
async function performSearch(query, selectedAPIs) {
    const searchPromises = selectedAPIs.map(apiId => {
        let apiUrl = `/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`;
        if (apiId.startsWith('custom_')) {
            const customIndex = parseInt(apiId.replace('custom_', ''));
            const customApi = APISourceManager.getCustomApiInfo(customIndex);
            if (customApi && customApi.url) {
                apiUrl += `&customApi=${encodeURIComponent(customApi.url)}`;
            } else {
                return Promise.resolve({ code: 400, msg: `自定义API ${apiId} 未找到或URL无效`, list: [], apiId });
            }
        }

        return fetch(apiUrl)
            .then(response => response.json())
            .then(data => ({ ...data, apiId: apiId, apiName: APISourceManager.getSelectedApi(apiId)?.name || apiId }))
            .catch(error => ({
                code: 400,
                msg: `API(${apiId})搜索失败: ${error.message}`,
                list: [],
                apiId: apiId
            }));
    }).filter(Boolean);

    try {
        const results = await Promise.all(searchPromises);

        const videoDataMap = AppState.get('videoDataMap') || new Map();
        results.forEach(result => {
            if (result.code === 200 && Array.isArray(result.list)) {
                result.list.forEach(item => {
                    if (item.vod_id) {
                        item.source_name = result.apiName;
                        item.source_code = result.apiId;
                        videoDataMap.set(item.vod_id.toString(), item);
                    }
                });
            }
        });

        AppState.set('videoDataMap', videoDataMap);
        try {
            // Map 不能直接序列化，先转换为数组再存
            sessionStorage.setItem('videoDataCache', JSON.stringify(Array.from(videoDataMap.entries())));
            console.log('视频元数据已缓存至 AppState 和 sessionStorage');
        } catch (e) {
            console.error('缓存视频元数据到 sessionStorage 失败:', e);
        }

        return results;
    } catch (error) {
        console.error("执行搜索或缓存时出错:", error);
        return [];
    }
}

function renderSearchResults(results, doubanSearchedTitle = null) {
    const searchResultsContainer = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const searchResultsCountElement = getElement('searchResultsCount');

    if (!searchResultsContainer || !resultsArea || !searchResultsCountElement) return;

    let allResults = [];
    results.forEach(result => {
        if (result.code === 200 && Array.isArray(result.list) && result.list.length > 0) {
            const resultsWithSource = result.list.map(item => ({
                ...item,
                source_name: result.apiName || (typeof API_SITES !== 'undefined' && API_SITES[result.apiId]?.name) || '未知来源',
                source_code: result.apiId,
                api_url: result.apiId.startsWith('custom_') && typeof APISourceManager !== 'undefined' ?
                    APISourceManager.getCustomApiInfo(parseInt(result.apiId.replace('custom_', '')))?.url : ''
            }));
            allResults = allResults.concat(resultsWithSource);
        }
    });

    const yellowFilterEnabled = getBoolConfig('yellowFilterEnabled', true);
    if (yellowFilterEnabled) {
        allResults = allResults.filter(item => {
            const title = item.vod_name || '';
            const type = item.type_name || '';
            return !/(伦理片|福利片|写真)/.test(type) && !/(伦理|写真|福利|成人|情色|AV)/i.test(title);
        });
    }

    // 处理并存储搜索结果到 sessionStorage
    try {
        const videoSourceMap = {};
        allResults.forEach(item => {
            const key = `${item.vod_name}|${item.vod_year || ''}`;
            if (!videoSourceMap[key]) {
                videoSourceMap[key] = [];
            }
            // 将完整的 item 对象存入，以便播放页获取所有元数据
            videoSourceMap[key].push(item);
        });
        sessionStorage.setItem('videoSourceMap', JSON.stringify(videoSourceMap));
    } catch (e) {
        console.error("存储搜索结果到 sessionStorage 失败:", e);
    }

    searchResultsContainer.innerHTML = ''; // 先清空旧内容

    if (allResults.length === 0) {
        resultsArea.classList.remove('hidden');
        searchResultsCountElement.textContent = '0';

        let messageTitle;
        let messageSuggestion;

        if (doubanSearchedTitle) {
            messageTitle = `关于 <strong class="text-pink-400">《${sanitizeText(doubanSearchedTitle)}》</strong> 未找到结果`;
            messageSuggestion = "请尝试使用其他关键词搜索，或检查您的数据源选择。";
        } else {
            messageTitle = '没有找到匹配的结果';
            messageSuggestion = "请尝试其他关键词或更换数据源。";
        }

        searchResultsContainer.innerHTML = `
            <div class="col-span-full text-center py-10 sm:py-16">
                <svg class="mx-auto h-12 w-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-300">${messageTitle}</h3>
                <p class="mt-1 text-sm text-gray-500">${messageSuggestion}</p>
            </div>
        `;
        // 确保 searchArea 布局正确
        const searchArea = getElement('searchArea');
        if (searchArea) {
            searchArea.classList.add('flex-1');
            searchArea.classList.remove('mb-8');
        }
        // 一定要把豆瓣区收起来
        getElement('doubanArea')?.classList.add('hidden');
        return;
    }

    // 如果有结果，正常渲染
    resultsArea.classList.remove('hidden');
    searchResultsCountElement.textContent = allResults.length.toString();

    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

    const fragment = document.createDocumentFragment();
    allResults.forEach(item => {
        try {
            fragment.appendChild(createResultItemUsingTemplate(item));
        } catch (error) {
        }
    });
    gridContainer.appendChild(fragment);
    searchResultsContainer.appendChild(gridContainer);

    // 调整搜索区域布局
    const searchArea = getElement('searchArea');
    if (searchArea) {
        searchArea.classList.remove('flex-1');
        searchArea.classList.add('mb-8');
        searchArea.classList.remove('hidden');
    }
    getElement('doubanArea')?.classList.add('hidden');

    // 缓存搜索结果到 sessionStorage
    try {
        const searchInput = DOMCache.get('searchInput');
        const query = searchInput ? searchInput.value.trim() : '';

        if (query && allResults.length > 0) {
            // 缓存搜索关键词
            sessionStorage.setItem('searchQuery', query);

            // 缓存搜索结果
            sessionStorage.setItem('searchResults', JSON.stringify(allResults));

            // 缓存当前的API选择状态
            const selectedAPIs = AppState.get('selectedAPIs');
            if (selectedAPIs) {
                sessionStorage.setItem('searchSelectedAPIs', JSON.stringify(selectedAPIs));
            }

            console.log('[缓存] 搜索结果已保存到 sessionStorage');
        }
    } catch (e) {
        console.error('缓存搜索结果失败:', e);
    }
}

function restoreSearchFromCache() {
    try {
        const cachedQuery = sessionStorage.getItem('searchQuery');
        const cachedResults = sessionStorage.getItem('searchResults');
        const cachedSelectedAPIs = sessionStorage.getItem('searchSelectedAPIs');

        if (cachedQuery && cachedResults) {
            console.log('[恢复] 从 sessionStorage 恢复搜索状态');

            // 恢复搜索关键词到输入框
            const searchInput = DOMCache.get('searchInput');
            if (searchInput) {
                searchInput.value = cachedQuery;
            }

            // 恢复API选择状态
            if (cachedSelectedAPIs) {
                try {
                    const selectedAPIs = JSON.parse(cachedSelectedAPIs);
                    AppState.set('selectedAPIs', selectedAPIs);
                } catch (e) {
                    console.warn('恢复API选择状态失败:', e);
                }
            }

            // 直接恢复搜索结果显示
            const parsedResults = JSON.parse(cachedResults);
            renderSearchResultsFromCache(parsedResults);

            // 确保关闭弹窗
            if (typeof closeModal === 'function') {
                closeModal();
            }

            console.log('[恢复] 搜索状态恢复完成，显示了', parsedResults.length, '个结果');
        } else {
            console.log('[恢复] 没有找到缓存的搜索数据');
        }
    } catch (e) {
        console.error('恢复搜索状态失败:', e);
    }
}

// 恢复缓存结果的渲染函数
function renderSearchResultsFromCache(cachedResults) {
    const searchResultsContainer = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const searchResultsCountElement = getElement('searchResultsCount');

    if (!searchResultsContainer || !resultsArea || !searchResultsCountElement) return;

    // 显示结果区域
    resultsArea.classList.remove('hidden');
    searchResultsCountElement.textContent = cachedResults.length.toString();

    // 清空并重新渲染
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
    }

    // 调整搜索区域布局
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
        let url = `/api/detail?id=${id}&source=${sourceCode}`;

        // 对于自定义API，添加customApi参数
        if (sourceCode === 'custom' && apiUrl) {
            url += `&customApi=${encodeURIComponent(apiUrl)}&useDetail=true`;
        }

        const response = await fetch(url);
        const data = await response.json();

        // +++ 剧集解析逻辑 - 支持多种格式 +++
        let episodes = [];

        // 情况1：标准episodes数组
        if (Array.isArray(data.episodes) && data.episodes.length > 0) {
            episodes = data.episodes;
        }
        // 情况2：从vod_play_url解析
        else if (data.vod_play_url) {
            console.warn("使用备用字段 vod_play_url 解析剧集");
            episodes = parseVodPlayUrl(data.vod_play_url);
        }
        // 情况3：从HTML内容解析（当响应是HTML时）
        else if (typeof data === 'string' && data.includes('stui-content__playlist')) {
            console.warn("从HTML内容解析剧集数据");
            episodes = parseHtmlEpisodeList(data);
        }

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
window.showDetails = showDetails;
window.playFromHistory = playFromHistory;

function createResultItemUsingTemplate(item) {
    const template = document.getElementById('search-result-template');
    if (!template) {
        console.error("搜索结果模板未找到！");
        return document.createDocumentFragment();
    }

    const clone = template.content.cloneNode(true);
    const cardElement = clone.querySelector('.card-hover');
    if (!cardElement) {
        console.error("卡片元素 (.card-hover) 在模板克隆中未找到，项目:", item);
        return document.createDocumentFragment();
    }

    const imgElement = clone.querySelector('.result-img');
    if (imgElement) {
        imgElement.src = item.vod_pic && item.vod_pic.startsWith('http') ?
            item.vod_pic : 'https://via.placeholder.com/100x150/191919/555555?text=No+Image';
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
            sourceNameElement.className = 'result-source-name bg-[#222222] text-xs text-gray-200 px-2 py-1 rounded-md';
        } else {
            sourceNameElement.className = 'result-source-name hidden';
        }
    }

    // --- 存储所有可用的元数据 ---
    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.name = item.vod_name || '';
    cardElement.dataset.sourceCode = item.source_code || '';
    if (item.api_url) {
        cardElement.dataset.apiUrl = item.api_url;
    }
    cardElement.dataset.videoKey = `${item.vod_name}|${item.vod_year || ''}`;

    // 存储来自搜索列表的元数据
    cardElement.dataset.year = item.vod_year || '';
    cardElement.dataset.typeName = item.type_name || '';
    cardElement.dataset.remarks = item.vod_remarks || '';
    cardElement.dataset.area = item.vod_area || '';
    cardElement.dataset.actor = item.vod_actor || '';
    cardElement.dataset.director = item.vod_director || '';
    cardElement.dataset.blurb = item.vod_blurb || '';

    cardElement.onclick = handleResultClick;

    return clone;
}

function handleResultClick(event) {
    const card = event.currentTarget;
    const {
        id,
        name,
        sourceCode,
        apiUrl = '',
        year,
        typeName,
        videoKey,
        blurb,
        remarks,
        area,
        actor,
        director
    } = card.dataset;

    if (typeof showVideoEpisodesModal === 'function') {
        // 将所有数据传递给弹窗函数
        showVideoEpisodesModal(id, name, sourceCode, apiUrl, {
            year, typeName, videoKey, blurb, remarks, area, actor, director
        });
    } else {
        console.error('showVideoEpisodesModal function not found!');
        showToast('无法加载剧集信息', 'error');
    }
}

window.handleResultClick = handleResultClick;
window.copyLinks = copyLinks;
window.toggleEpisodeOrderUI = toggleEpisodeOrderUI;

// 显示视频剧集模态框
async function showVideoEpisodesModal(id, title, sourceCode, apiUrl, fallbackData) {
    showLoading('处理中...');
    const videoDataMap = AppState.get('videoDataMap');
    const videoData = videoDataMap ? videoDataMap.get(id.toString()) : null;
    if (!videoData) {
        hideLoading();
        showToast('缓存中找不到视频数据，请刷新后重试', 'error');
        console.error(`无法从 AppState 缓存中找到 vod_id 为 ${id} 的视频数据。`);
        return;
    }

    let episodes = [];
    if (videoData.vod_play_url) {
        const playFroms = (videoData.vod_play_from || '').split('$$$');
        const urlGroups = videoData.vod_play_url.split('$$$');
        const selectedApi = APISourceManager.getSelectedApi(sourceCode);
        const sourceName = selectedApi ? selectedApi.name : '';
        let sourceIndex = playFroms.indexOf(sourceName);
        if (sourceIndex === -1) {
            console.warn(`源名称 "${sourceName}" 未在播放列表源 [${playFroms.join(', ')}] 中找到，将默认使用第一个源。`);
            sourceIndex = 0;
        }
        if (urlGroups[sourceIndex]) {
            episodes = urlGroups[sourceIndex].split('#').filter(item => item && item.includes('$'));
        }
    }

    if (episodes.length === 0) {
        hideLoading();
        showToast('解析剧集列表失败', 'error');
        console.error('解析后的 episodes 数组为空。原始 videoData:', videoData);
        return;
    }

    hideLoading();
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

    const episodeButtonsGrid = modalContent.querySelector('[data-field="episode-buttons-grid"]');
    const varietyShowTypes = ['综艺', '脱口秀', '真人秀', '纪录片'];
    const isVarietyShow = varietyShowTypes.some(type => effectiveTypeName && effectiveTypeName.includes(type));

    if (episodeButtonsGrid) {
        if (isVarietyShow) {
            // 综艺
            episodeButtonsGrid.className = 'variety-grid-layout';
        }

        // 渲染按钮
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

    const tempDiv = document.createElement('div');
    tempDiv.appendChild(modalContent);
    showModal(tempDiv.innerHTML, `${effectiveTitle} (${sourceNameForDisplay})`);
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
    const displayEpisodes = currentReversedState ? [...episodes].reverse() : [...episodes];

    const varietyShowTypes = ['综艺', '脱口秀', '真人秀'];
    const isVarietyShow = varietyShowTypes.some(type => typeName && typeName.includes(type));

    return displayEpisodes.map((episodeString, displayIndex) => {
        const originalIndex = currentReversedState ? (episodes.length - 1 - displayIndex) : displayIndex;
        const parts = (episodeString || '').split('$');
        const episodeName = parts.length > 1 ? parts[0].trim() : '';

        let buttonText = '';
        let buttonTitle = '';
        let buttonClasses = '';

        if (isVarietyShow) {
            // 综艺节目
            buttonText = episodeName || `第${originalIndex + 1}集`;
            buttonTitle = buttonText;
            buttonClasses = 'episode-btn';
        } else {
            // 非综艺节目
            buttonText = `第 ${originalIndex + 1} 集`;
            buttonTitle = buttonText;
            buttonClasses = 'episode-btn px-2 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs sm:text-sm transition-colors truncate';
        }

        const safeVideoTitle = encodeURIComponent(videoTitle);
        const safeSourceName = encodeURIComponent(sourceName);

        // 从剧集字符串中提取真实的播放URL
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

// 复制视频链接到剪贴板
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

// 切换剧集排序UI并更新状态
function toggleEpisodeOrderUI() {
    const container = document.getElementById('episodeButtonsContainer');
    const orderIcon = document.getElementById('orderIcon');
    const toggleBtn = document.getElementById('toggleEpisodeOrderBtn');

    if (!container || !orderIcon || !toggleBtn) return;

    let currentReversedState = AppState.get('episodesReversed') || false;
    currentReversedState = !currentReversedState;
    AppState.set('episodesReversed', currentReversedState);

    // 更新图标的旋转状态
    orderIcon.style.transform = currentReversedState ? 'rotate(180deg)' : 'rotate(0deg)';

    // 更新按钮的 title 属性来提供状态反馈
    toggleBtn.title = currentReversedState ? '切换为正序排列' : '切换为倒序排列';

    // 重新渲染集数按钮部分 (保持不变)
    const episodes = AppState.get('currentEpisodes');
    const title = AppState.get('currentVideoTitle');
    const sourceName = AppState.get('currentSourceName');
    const sourceCode = AppState.get('currentSourceCode');

    if (episodes && title && sourceCode) {
        const newButtonsHtml = renderEpisodeButtons(episodes, title, sourceCode, sourceName || '');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newButtonsHtml;
        const buttonsContainerFromRender = tempDiv.querySelector('#episodeButtonsContainer');
        if (buttonsContainerFromRender) {
            container.innerHTML = buttonsContainerFromRender.innerHTML;
        } else {
            const parsedDoc = new DOMParser().parseFromString(newButtonsHtml, 'text/html');
            const newEpisodeButtonsContent = parsedDoc.getElementById('episodeButtonsContainer');
            if (newEpisodeButtonsContent) {
                container.innerHTML = newEpisodeButtonsContent.innerHTML;
            } else {
                console.error("无法从 renderEpisodeButtons 的输出中提取集数按钮。");
            }
        }
    } else {
        console.error("无法重新渲染剧集按钮：缺少必要的状态信息。");
    }
}

window.showVideoEpisodesModal = showVideoEpisodesModal;