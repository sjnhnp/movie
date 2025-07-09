/**
 * 主应用程序逻辑
 * 使用AppState进行状态管理，DOMCache进行DOM元素缓存
 */

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

// STUB 实现 - 处理缺失的函数定义
/**
 * 显示详情
 * @param {HTMLElement} element - 包含数据属性的元素
 */
function showDetails(element) {
    const id = element.dataset.id;
    const sourceCode = element.dataset.source;
    // const name = element.querySelector('.result-title').textContent; // 获取名称的示例
    // const customApiUrl = element.dataset.customApi;
    console.log(`STUB: showDetails called for element with ID: ${id}, Source: ${sourceCode}`);
    // 潜在地使用这些数据属性获取并显示详情
}

/**
 * 文本净化函数
 * 重要：这是一个基本的存根。真实实现需要强大的XSS保护。
 * @param {string} text - 需要净化的文本
 * @returns {string} - 净化后的文本
 */
function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 播放视频
 * @param {string} url - 视频URL
 * @param {string} title - 视频标题
 * @param {number} episodeIndex - 集数索引
 * @param {string} sourceName - 来源名称
 * @param {string} sourceCode - 来源代码
 */
function playVideo(url, title, episodeIndex, sourceName = '', sourceCode = '', vodId = '', year = '', typeName = '', videoKey = '') {
    if (!url) {
        showToast('无效的视频链接', 'error');
        return;
    }
    AppState.set('currentEpisodeIndex', episodeIndex);
    AppState.set('currentVideoTitle', title);

    if (typeof addToViewingHistory === 'function') {
        const videoInfoForHistory = {
            url: url,
            title: title,
            episodeIndex: episodeIndex,
            sourceName: sourceName,
            sourceCode: sourceCode,
            vod_id: vodId,
            episodes: AppState.get('currentEpisodes') || []
        };
        addToViewingHistory(videoInfoForHistory);
    }

    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', url);
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', episodeIndex.toString());
    if (vodId) {
        playerUrl.searchParams.set('id', vodId);
    }

    if (sourceName) playerUrl.searchParams.set('source', sourceName);
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);
    if (year) playerUrl.searchParams.set('year', year);
    if (typeName) playerUrl.searchParams.set('typeName', typeName);
    if (videoKey) {
        playerUrl.searchParams.set('videoKey', videoKey);
    }
    // ← 在这一行后面，插入广告过滤开关参数
    const adOn = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled);
    playerUrl.searchParams.set('af', adOn ? '1' : '0');

    window.location.href = playerUrl.toString();
}


/**
 * 播放上一集
 */
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

/**
 * 播放下一集
 */
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

function playFromHistory(url, title, episodeIndex, playbackPosition = 0) {
    console.log(`[App - playFromHistory] Called with: url=${url}, title=${title}, epIndex=${episodeIndex}, pos=${playbackPosition}`);

    let historyItem = null;
    let episodesList = [];
    try {
        const history = JSON.parse(localStorage.getItem('viewingHistory') || '[]');
        historyItem = history.find(item =>
            item.url === url &&
            item.title === title &&
            item.episodeIndex === episodeIndex
        );

        if (historyItem) {
            console.log("[App - playFromHistory] Found historyItem:", historyItem);
            // Only use the episode list from history if it's a valid, non-empty array.
            if (historyItem.episodes && Array.isArray(historyItem.episodes) && historyItem.episodes.length > 0) {
                episodesList = historyItem.episodes;
            }
        } else {
            console.warn("[App - playFromHistory] Could not find exact match in viewingHistory. Will try with currentEpisodes.");
            episodesList = AppState.get('currentEpisodes') || JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
        }
    } catch (e) {
        console.error("Error accessing or parsing viewingHistory:", e);
        episodesList = AppState.get('currentEpisodes') || JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
    }

    // 更新 AppState 和 localStorage 以反映即将播放的剧集信息
    AppState.set('currentEpisodeIndex', episodeIndex);
    AppState.set('currentVideoTitle', title);
    // Only update localStorage if we have a valid list. This prevents overwriting with an empty array.
    if (episodesList.length > 0) {
        AppState.set('currentEpisodes', episodesList);
        localStorage.setItem('currentEpisodes', JSON.stringify(episodesList));
    } else {
        // 如果没有剧集列表，播放器可能会遇到问题，这里可以考虑是否要阻止播放或提示
        console.warn(`[App - playFromHistory] No episodes list found for "${title}". Player might not have full context.`);
    }
    localStorage.setItem('currentEpisodeIndex', episodeIndex.toString());
    localStorage.setItem('currentVideoTitle', title);


    // 从 historyItem 中获取 vod_id, sourceName, sourceCode (如果存在)
    const vodId = historyItem ? historyItem.vod_id || '' : '';
    const actualSourceName = historyItem ? historyItem.sourceName || '' : ''; // 使用 historyItem 中的 sourceName
    const actualSourceCode = historyItem ? historyItem.sourceCode || '' : ''; // 使用 historyItem 中的 sourceCode

    // 构建播放器 URL
    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', url); // 这是特定集的URL
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', episodeIndex.toString());

    if (vodId) {
        playerUrl.searchParams.set('id', vodId); // 传递 vod_id
    }
    if (actualSourceName) {
        // player_app.js 会从 URL search param 'source' 读取 sourceName
        playerUrl.searchParams.set('source', actualSourceName);
    }
    if (actualSourceCode) {
        playerUrl.searchParams.set('source_code', actualSourceCode);
    }
    if (playbackPosition > 0) {
        playerUrl.searchParams.set('position', playbackPosition.toString());
    }

    // 添加广告过滤参数 (PLAYER_CONFIG 和 getBoolConfig 应在 app.js 或其引用的 config.js 中可用)
    const adOn = typeof getBoolConfig !== 'undefined' && typeof PLAYER_CONFIG !== 'undefined' ?
        getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled) : PLAYER_CONFIG?.adFilteringEnabled ?? false;
    playerUrl.searchParams.set('af', adOn ? '1' : '0');

    console.log(`[App - playFromHistory] Navigating to player: ${playerUrl.toString()}`);
    window.location.href = playerUrl.toString();
}

/**
 * 从localStorage获取布尔配置
 * @param {string} key - 配置键
 * @param {boolean} defaultValue - 默认值
 * @returns {boolean} - 配置值
 */
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

// js/app.js

/**
 * 初始化应用状态
 * 从localStorage加载初始状态并设置到AppState，如果localStorage为空则写入默认值
 */
function initializeAppState() {
    // 移除硬编码的默认列表
    const selectedAPIsRaw = localStorage.getItem('selectedAPIs');

    // 初始化 AppState，如果localStorage为空，则使用从config.js读取的全局默认值
    AppState.initialize({
        'selectedAPIs': JSON.parse(selectedAPIsRaw || JSON.stringify(window.DEFAULT_SELECTED_APIS)),
        'customAPIs': JSON.parse(localStorage.getItem('customAPIs') || '[]'),
        'currentEpisodeIndex': 0,
        'currentEpisodes': [],
        'currentVideoTitle': '',
        'episodesReversed': false
    });

    // 如果localStorage中没有selectedAPIs，则将默认值写入
    if (selectedAPIsRaw === null) {
        // 使用从config.js读取的全局默认值
        localStorage.setItem('selectedAPIs', JSON.stringify(window.DEFAULT_SELECTED_APIS));
    }
}

/**
 * 初始化DOM缓存
 * 缓存频繁访问的DOM元素
 */
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

/**
 * 初始化事件监听器
 */
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

            // 注意：这里直接修改PLAYER_CONFIG。更健壮的解决方案可能涉及在config.js模块中使用setter
            PLAYER_CONFIG.enablePreloading = enabled;

            showToast(enabled ? '已启用预加载' : '已禁用预加载', 'info');

            // 更新预加载数量输入框的可用性
            const preloadCountInput = DOMCache.get('preloadCountInput');
            if (preloadCountInput) {
                preloadCountInput.disabled = !enabled;
            }
        });

        // 初始化开关状态 - 使用getBoolConfig
        const preloadingEnabled = getBoolConfig('preloadingEnabled', true);
        preloadingToggle.checked = preloadingEnabled;

        // 注意：这里直接修改PLAYER_CONFIG。更健壮的解决方案可能涉及在config.js模块中使用setter
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

            // 注意：这里直接修改PLAYER_CONFIG。更健壮的解决方案可能涉及在config.js模块中使用setter
            PLAYER_CONFIG.preloadCount = count;

            showToast(`预加载数量已设置为 ${count}`, 'info');
        });

        // 初始化预加载数量
        const savedCount = localStorage.getItem('preloadCount');
        const preloadCount = savedCount ? parseInt(savedCount) : 2;
        preloadCountInput.value = preloadCount;

        // 注意：这里直接修改PLAYER_CONFIG。更健壮的解决方案可能涉及在config.js模块中使用setter
        PLAYER_CONFIG.preloadCount = preloadCount;
    }
}

/**
 * 初始化UI组件
 */
function initializeUIComponents() {
    // 初始化任何需要的UI组件
}

/**
 * 执行搜索
 * @param {object} options - 搜索选项，可以包含 doubanQuery 和 onComplete 回调
 */

function search(options = {}) {
    // --- 新增：在每次新搜索开始时，强制清除所有旧的搜索结果缓存 ---
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
        sessionStorage.removeItem('videoSourceMap'); // 确保这个也清除
        console.log('[缓存] 已在执行新搜索前清除旧缓存。');
    } catch (e) {
        console.error('清除 sessionStorage 失败:', e);
    }
    // --- 新增结束 ---

    const searchInput = DOMCache.get('searchInput');
    const searchResultsContainer = DOMCache.get('searchResults');

    if (!searchInput || !searchResultsContainer) {
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
    }

    const queryFromInput = searchInput.value.trim(); // 用户在输入框实际输入的内容
    const query = options.doubanQuery || queryFromInput; // 优先用豆瓣的query，否则用输入框的

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

/**
 * 执行搜索请求
 * @param {string} query - 搜索查询
 * @param {Array} selectedAPIs - 选中的API列表
 * @returns {Promise} - 搜索结果Promise
 */
async function performSearch(query, selectedAPIs) {
    // 创建搜索请求数组
    const searchPromises = selectedAPIs.map(apiId => {
        if (apiId.startsWith('custom_')) {
            // 自定义API搜索
            const customIndex = parseInt(apiId.replace('custom_', ''));
            const customApi = APISourceManager.getCustomApiInfo(customIndex);
            if (customApi) {
                return fetch(`/api/search?wd=${encodeURIComponent(query)}&source=${apiId}&customApi=${encodeURIComponent(customApi.url)}`)
                    .then(response => response.json())
                    .then(data => ({
                        ...data,
                        apiId: apiId,
                        apiName: customApi.name
                    }))
                    .catch(error => ({
                        code: 400,
                        msg: `自定义API(${customApi.name})搜索失败: ${error.message}`,
                        list: [],
                        apiId: apiId
                    }));
            }
        } else {
            // 内置API搜索
            return fetch(`/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`)
                .then(response => response.json())
                .then(data => ({
                    ...data,
                    apiId: apiId,
                    apiName: API_SITES[apiId]?.name || apiId
                }))
                .catch(error => ({
                    code: 400,
                    msg: `API(${API_SITES[apiId]?.name || apiId})搜索失败: ${error.message}`,
                    list: [],
                    apiId: apiId
                }));
        }
    }).filter(Boolean);

    // 等待所有搜索完成
    return Promise.all(searchPromises);
}

function renderSearchResults(results, doubanSearchedTitle = null) {
    const searchResultsContainer = DOMCache.get('searchResults'); // 这个是放置所有结果卡片或无结果提示的容器
    const resultsArea = getElement('resultsArea'); // 这个是包含 searchResultsCount 和 searchResultsContainer 的外层区域
    const searchResultsCountElement = getElement('searchResultsCount'); // “X个结果”的元素

    if (!searchResultsContainer || !resultsArea || !searchResultsCountElement) return;

    let allResults = [];
    // 我们不再关心错误的具体信息，只收集成功的结果
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

    // 【新增】处理并存储搜索结果到 sessionStorage
    try {
        const videoSourceMap = {};
        allResults.forEach(item => {
            const key = `${item.vod_name}|${item.vod_year || ''}`;
            if (!videoSourceMap[key]) {
                videoSourceMap[key] = [];
            }
            // 只存储必要信息
            videoSourceMap[key].push({
                name: item.source_name,
                code: item.source_code,
                vod_id: item.vod_id
            });
        });
        sessionStorage.setItem('videoSourceMap', JSON.stringify(videoSourceMap));
    } catch (e) {
        console.error("存储搜索结果到 sessionStorage 失败:", e);
    }

    searchResultsContainer.innerHTML = ''; // 先清空旧内容

    if (allResults.length === 0) {
        resultsArea.classList.remove('hidden'); // 确保结果区域可见以显示提示
        searchResultsCountElement.textContent = '0'; // 更新结果计数为0

        let messageTitle;
        let messageSuggestion;

        if (doubanSearchedTitle) {
            messageTitle = `关于 <strong class="text-pink-400">《${sanitizeText(doubanSearchedTitle)}》</strong> 未找到结果`;
            messageSuggestion = "请尝试使用其他关键词搜索，或检查您的数据源选择。";
        } else {
            messageTitle = '没有找到匹配的结果';
            messageSuggestion = "请尝试其他关键词或更换数据源。";
        }

        // 使用类似老代码的结构和样式 (Tailwind CSS) - 已移除错误详情部分
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
    // 确保这里的 class 与 index.html 中 #results 的 class 一致或兼容
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

    const fragment = document.createDocumentFragment();
    allResults.forEach(item => {
        try {
            fragment.appendChild(createResultItemUsingTemplate(item));
        } catch (error) {
            // ... error handling for card creation
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

// 在 js/app.js 中添加专门用于恢复缓存结果的渲染函数
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

/**
 * 获取视频详情
 * @param {string} id - 视频ID
 * @param {string} sourceCode - 来源代码
 * @param {string} apiUrl - API URL（对于自定义API）
 */
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

        if (data.code !== 200 || !Array.isArray(data.episodes) || data.episodes.length === 0) {
            throw new Error(data.msg || '获取视频详情失败');
        }

        // 保存视频信息到状态
        AppState.set('currentEpisodes', data.episodes);
        AppState.set('currentVideoTitle', data.videoInfo?.title || '未知视频');
        AppState.set('currentEpisodeIndex', 0);

        // 保存到localStorage（用于播放器页面）
        localStorage.setItem('currentEpisodes', JSON.stringify(data.episodes));
        localStorage.setItem('currentVideoTitle', data.videoInfo?.title || '未知视频');
        localStorage.setItem('currentEpisodeIndex', '0');

        // 添加到观看历史
        if (data.videoInfo && typeof addToViewingHistory === 'function') {
            addToViewingHistory(data.videoInfo);
        }

        // 使用playVideo函数播放第一集
        const firstEpisode = data.episodes[0];
        playVideo(
            firstEpisode,
            data.videoInfo?.title || '未知视频',
            0,
            selectedApi.name || '', // sourceName
            sourceCode,
            id // vod_id
        );
    } catch (error) {
        if (searchResults) {
            searchResults.innerHTML = `<div class="text-center py-4 text-red-400">获取视频详情失败: ${error.message}</div>`;
        }
        showToast('获取视频详情失败: ' + error.message, 'error');
    }
}

/**
 * 重置到首页
 */
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
        searchArea.classList.add('flex-1');   // 重新撑满页面
        searchArea.classList.remove('mb-8');  // 移除搜索结果页加的外边距
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
        const errorDiv = document.createElement('div');
        errorDiv.className = 'card-hover bg-[#222] rounded-lg overflow-hidden p-2 text-red-400';
        errorDiv.innerHTML = `<h3>加载错误</h3><p class="text-xs">无法显示此项目</p>`;
        return errorDiv;
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
            sourceNameElement.textContent = item.source_name; // 设置文本内容
            sourceNameElement.className = 'result-source-name bg-[#222222] text-xs text-gray-200 px-2 py-1 rounded-md';

        } else {
            // 如果没有 source_name，则确保元素是隐藏的
            sourceNameElement.className = 'result-source-name hidden';
        }
    }

    // 创建一个唯一的视频标识符
    const videoKey = `${item.vod_name}|${item.vod_year || ''}`;
    cardElement.dataset.videoKey = videoKey;

    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.name = item.vod_name || '';
    cardElement.dataset.sourceCode = item.source_code || '';
    cardElement.dataset.year = item.vod_year || '';
    cardElement.dataset.typeName = item.type_name || '';
    if (item.api_url) {
        cardElement.dataset.apiUrl = item.api_url;
    }
    cardElement.onclick = handleResultClick;

    return clone;
}

// Add the handler function (if not already present) 
function handleResultClick(event) {
    const card = event.currentTarget;
    const id = card.dataset.id;
    const name = card.dataset.name;
    const sourceCode = card.dataset.sourceCode;
    const apiUrl = card.dataset.apiUrl || '';
    const year = card.dataset.year;
    const typeName = card.dataset.typeName;
    const videoKey = card.dataset.videoKey;

    if (typeof showVideoEpisodesModal === 'function') {
        // 【修改】将年份和类型传递下去
        showVideoEpisodesModal(id, name, sourceCode, apiUrl, year, typeName, videoKey);
    } else {
        console.error('showVideoEpisodesModal function not found!');
        showToast('无法加载剧集信息', 'error');
    }
}

window.handleResultClick = handleResultClick;
window.copyLinks = copyLinks;
window.toggleEpisodeOrderUI = toggleEpisodeOrderUI;

/**
 * 显示视频剧集模态框
 * @param {string} id - 视频ID
 * @param {string} title - 视频标题
 * @param {string} sourceCode - 来源代码
 */
// 在 app.js 中

async function showVideoEpisodesModal(id, title, sourceCode, apiUrl, year, typeName, videoKey) {
    showLoading('加载剧集信息...');

    // 确保 APISourceManager 和 getSelectedApi 方法可用
    if (typeof APISourceManager === 'undefined' || typeof APISourceManager.getSelectedApi !== 'function') {
        hideLoading();
        showToast('数据源管理器不可用', 'error');
        console.error('APISourceManager or getSelectedApi is not defined.');
        return;
    }
    const selectedApi = APISourceManager.getSelectedApi(sourceCode);

    if (!selectedApi) {
        hideLoading();
        showToast('未找到有效的数据源', 'error');
        console.error('Selected API is null for sourceCode:', sourceCode);
        return;
    }

    try {
        let detailApiUrl = `/api/detail?id=${encodeURIComponent(id)}&source=${encodeURIComponent(sourceCode)}`;
        if (selectedApi.isCustom && selectedApi.url) {
            detailApiUrl += `&customApi=${encodeURIComponent(selectedApi.url)}`;
        }

        const response = await fetch(detailApiUrl);
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();

        hideLoading();

        if (data.code !== 200 || !data.episodes || data.episodes.length === 0) {
            let errorMessage = data.msg || (data.videoInfo && data.videoInfo.msg) || (data.list && data.list.length > 0 && data.list[0] && data.list[0].msg) || '未找到剧集信息';
            showToast(errorMessage, 'warning');
            console.warn('获取剧集详情数据问题:', data, `Requested URL: ${detailApiUrl}`);
            return;
        }

        AppState.set('currentEpisodes', data.episodes);
        AppState.set('currentVideoTitle', title);
        AppState.set('currentSourceName', selectedApi.name);
        AppState.set('currentSourceCode', sourceCode);
        AppState.set('currentVideoYear', year);
        AppState.set('currentVideoTypeName', typeName);
        AppState.set('currentVideoKey', videoKey);

        // ← 在这里，紧接着写入 localStorage，player.html 会读取这两项
        localStorage.setItem('currentEpisodes', JSON.stringify(data.episodes));
        localStorage.setItem('currentVideoTitle', title);

        const episodeButtonsHtml = renderEpisodeButtons(data.episodes, title, sourceCode, selectedApi.name);
        showModal(episodeButtonsHtml, `${title} (${selectedApi.name})`);

    } catch (error) {
        hideLoading();
        console.error('获取剧集信息失败 (catch block):', error, `Requested URL: ${detailApiUrl}`);
        showToast(`获取剧集信息失败: ${error.message}`, 'error');
    }
}

function renderEpisodeButtons(episodes, videoTitle, sourceCode, sourceName) {
    if (!episodes || episodes.length === 0) return '<p class="text-center text-gray-500">暂无剧集信息</p>';
    const currentReversedState = AppState.get('episodesReversed') || false;
    const vodId = AppState.get('currentVideoId') || '';
    const year = AppState.get('currentVideoYear') || '';
    const typeName = AppState.get('currentVideoTypeName') || '';
    const videoKey = AppState.get('currentVideoKey') || '';

    let html = `
    <div class="mb-4 flex justify-end items-center space-x-2">
        <div class="text-sm text-gray-400 mr-auto">共 ${episodes.length} 集</div>
        <button onclick="copyLinks()"
                title="复制所有剧集链接"
                class="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
        </button>

        <button id="toggleEpisodeOrderBtn" onclick="toggleEpisodeOrderUI()" 
                title="${currentReversedState ? '切换为正序排列' : '切换为倒序排列'}" /* 添加 title 提示 */
                class="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center">
            <svg id="orderIcon" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="transition: transform 0.3s ease;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
        </button>
    </div>
    <div id="episodeButtonsContainer" class="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">`;

    const displayEpisodes = currentReversedState ? [...episodes].reverse() : [...episodes];

    displayEpisodes.forEach((episodeUrl, displayIndex) => {
        const originalIndex = currentReversedState ? (episodes.length - 1 - displayIndex) : displayIndex;
        const safeVideoTitle = encodeURIComponent(videoTitle);
        const safeSourceName = encodeURIComponent(sourceName);

        html += `
        <button 
            onclick="playVideo('${episodeUrl}', decodeURIComponent('${safeVideoTitle}'), ${originalIndex}, decodeURIComponent('${safeSourceName}'), '${sourceCode}', '${vodId}', '${year}', '${typeName}', '${videoKey}')" 
            class="episode-btn px-2 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs sm:text-sm transition-colors truncate"
            data-index="${originalIndex}"
            title="第 ${originalIndex + 1} 集" 
        >
            第 ${originalIndex + 1} 集      
        </button>`;
    });
    html += '</div>';

    requestAnimationFrame(() => {
        const orderIcon = document.getElementById('orderIcon');
        if (orderIcon) {
            orderIcon.style.transform = currentReversedState ? 'rotate(180deg)' : 'rotate(0deg)';
        }
        // 更新 title 提示
        const toggleBtn = document.getElementById('toggleEpisodeOrderBtn');
        if (toggleBtn) {
            const currentReversed = AppState.get('episodesReversed') || false;
            toggleBtn.title = currentReversed ? '切换为正序排列' : '切换为倒序排列';
        }
    });
    return html;
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

/**
 * 切换剧集排序UI并更新状态
 */

function toggleEpisodeOrderUI() {
    const container = document.getElementById('episodeButtonsContainer');
    // const orderTextElement = document.getElementById('orderText'); // 该元素已被删除
    const orderIcon = document.getElementById('orderIcon');
    const toggleBtn = document.getElementById('toggleEpisodeOrderBtn'); // 获取按钮本身

    if (!container || !orderIcon || !toggleBtn) return; // 确保按钮也存在

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
        // 从返回的完整 HTML（包括外部的控制按钮div）中提取出集数按钮容器的内容
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

// 将函数暴露给全局作用域
window.showVideoEpisodesModal = showVideoEpisodesModal;