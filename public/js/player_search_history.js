/**
 * 播放页搜索和历史功能
 * 复用首页的搜索和历史逻辑，但适配播放页的UI结构
 */

// 播放页专用的状态管理
const PlayerPageState = {
    isSearchPanelOpen: false,
    isHistoryPanelOpen: false,
    searchResults: [],
    currentSearchQuery: ''
};

/**
 * 初始化播放页的搜索和历史功能
 */
function initPlayerSearchHistory() {
    // 确保在DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPlayerSearchHistory);
    } else {
        // 使用setTimeout确保所有元素都已渲染
        setTimeout(setupPlayerSearchHistory, 100);
    }
}

/**
 * 设置播放页的搜索和历史功能
 */
function setupPlayerSearchHistory() {
    // 初始化AppState（如果还没有初始化）
    if (typeof AppState !== 'undefined' && !AppState.get('selectedAPIs')) {
        const selectedAPIsRaw = localStorage.getItem('selectedAPIs');
        const selectedAPIs = selectedAPIsRaw ? JSON.parse(selectedAPIsRaw) : (window.DEFAULT_SELECTED_APIS || []);
        AppState.set('selectedAPIs', selectedAPIs);

        const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');
        AppState.set('customAPIs', customAPIs);
    }

    // 初始化API源管理器
    if (typeof APISourceManager !== 'undefined' && APISourceManager.init) {
        APISourceManager.init();
    }

    // 初始化事件监听器
    setupPlayerEventListeners();

    // 初始化搜索历史显示（播放页专用版本）
    renderPlayerSearchHistory();
    // 重新绑定搜索历史标签的点击事件
    setTimeout(() => {
        const recentSearches = document.getElementById('recentSearches');
        if (recentSearches) {
            // 移除旧的事件监听器，添加新的
            recentSearches.removeEventListener('click', handlePlayerSearchTagClick);
            recentSearches.addEventListener('click', handlePlayerSearchTagClick);
        }
    }, 100);

    // 设置面板自动关闭
    setupPlayerPanelAutoClose();
}

/**
 * 设置播放页的事件监听器
 */
function setupPlayerEventListeners() {
    // 历史按钮
    const historyButton = document.getElementById('historyButton');
    if (historyButton) {
        historyButton.addEventListener('click', togglePlayerHistory);
    }

    // 搜索按钮
    const searchButton = document.getElementById('searchButton');
    if (searchButton) {
        searchButton.addEventListener('click', togglePlayerSearch);
    }

    // 关闭历史面板按钮
    const closeHistoryButton = document.getElementById('closeHistoryPanelButton');
    if (closeHistoryButton) {
        closeHistoryButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closePlayerHistory();
        });
    }

    // 关闭搜索面板按钮
    const closeSearchButton = document.getElementById('closeSearchPanelButton');
    if (closeSearchButton) {
        closeSearchButton.addEventListener('click', closePlayerSearch);
    }

    // 搜索表单
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', handlePlayerSearch);
    }

    // 历史列表点击事件
    const historyList = document.getElementById('historyList');
    if (historyList) {
        historyList.addEventListener('click', handlePlayerHistoryClick);
    }

    // 搜索历史标签点击事件
    const recentSearches = document.getElementById('recentSearches');
    if (recentSearches) {
        recentSearches.removeEventListener('click', handlePlayerSearchTagClick);
        recentSearches.addEventListener('click', handlePlayerSearchTagClick);
    }

    // 关闭模态框按钮
    const closeModalButton = document.getElementById('closeModalButton');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closePlayerModal);
    }

    // ESC键关闭面板
    document.addEventListener('keydown', handlePlayerKeydown);

    // 清除搜索历史按钮
    const clearSearchHistory = document.getElementById('clearSearchHistory');
    if (clearSearchHistory) {
        clearSearchHistory.addEventListener('click', handleClearSearchHistory);
    }
}

/**
 * 切换历史面板
 */
function togglePlayerHistory(e) {
    if (e) e.stopPropagation();

    const historyPanel = document.getElementById('historyPanel');
    if (!historyPanel) return;

    if (PlayerPageState.isHistoryPanelOpen) {
        closePlayerHistory();
    } else {
        openPlayerHistory();
    }
}

/**
 * 打开历史面板
 */
function openPlayerHistory() {
    const historyPanel = document.getElementById('historyPanel');
    if (!historyPanel) return;

    // 关闭搜索面板
    closePlayerSearch();

    historyPanel.classList.add('show');
    historyPanel.style.transform = 'translateX(0)';
    historyPanel.setAttribute('aria-hidden', 'false');
    PlayerPageState.isHistoryPanelOpen = true;

    // 加载历史记录
    if (typeof loadViewingHistory === 'function') {
        loadViewingHistory();
    }
}

/**
 * 关闭历史面板
 */
function closePlayerHistory() {
    const historyPanel = document.getElementById('historyPanel');
    if (!historyPanel) return;

    historyPanel.classList.remove('show');
    historyPanel.style.transform = 'translateX(-100%)';
    historyPanel.setAttribute('aria-hidden', 'true');
    PlayerPageState.isHistoryPanelOpen = false;
}

/**
 * 切换搜索面板
 */
function togglePlayerSearch(e) {
    if (e) e.stopPropagation();

    if (PlayerPageState.isSearchPanelOpen) {
        closePlayerSearch();
    } else {
        openPlayerSearch();
    }
}

/**
 * 打开搜索面板
 */
function openPlayerSearch() {
    const searchPanel = document.getElementById('searchPanel');
    if (!searchPanel) return;

    // 关闭历史面板
    closePlayerHistory();

    searchPanel.classList.remove('hidden');
    searchPanel.setAttribute('aria-hidden', 'false');
    PlayerPageState.isSearchPanelOpen = true;

    // 聚焦搜索框
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        setTimeout(() => searchInput.focus(), 100);
    }

    // 渲染搜索历史（播放页专用版本）
    renderPlayerSearchHistory();
}

/**
 * 关闭搜索面板
 */
function closePlayerSearch() {
    const searchPanel = document.getElementById('searchPanel');
    if (!searchPanel) return;

    searchPanel.classList.add('hidden');
    searchPanel.setAttribute('aria-hidden', 'true');
    PlayerPageState.isSearchPanelOpen = false;

    // 清空搜索结果
    const searchResults = document.getElementById('searchResults');
    const searchResultsArea = document.getElementById('searchResultsArea');
    if (searchResults) searchResults.innerHTML = '';
    if (searchResultsArea) searchResultsArea.classList.add('hidden');
}

/**
 * 处理搜索表单提交
 */
function handlePlayerSearch(e) {
    e.preventDefault();

    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    const query = searchInput.value.trim();
    if (!query) {
        if (typeof showToast === 'function') {
            showToast('请输入搜索内容', 'warning');
        }
        return;
    }

    PlayerPageState.currentSearchQuery = query;

    // 保存搜索历史（播放页专用版本）
    savePlayerSearchHistory(query);

    // 执行搜索
    performPlayerSearch(query);
}

/**
 * 执行搜索
 */
async function performPlayerSearch(query) {
    const searchResultsArea = document.getElementById('searchResultsArea');
    const searchResults = document.getElementById('searchResults');
    const searchResultsCount = document.getElementById('searchResultsCount');

    if (!searchResults || !searchResultsArea) return;

    // 保存播放页搜索状态
    sessionStorage.setItem('playerSearchPerformed', 'true');
    sessionStorage.setItem('playerSearchQuery', query);

    // 显示加载状态
    if (typeof showLoading === 'function') {
        showLoading(`正在搜索"${query}"`);
    }

    try {
        // 获取选中的API源
        let selectedAPIs = AppState.get('selectedAPIs');
        if (!selectedAPIs) {
            // 尝试从localStorage获取
            const storedAPIs = localStorage.getItem('selectedAPIs');
            if (storedAPIs) {
                selectedAPIs = JSON.parse(storedAPIs);
                AppState.set('selectedAPIs', selectedAPIs);
            } else {
                selectedAPIs = window.DEFAULT_SELECTED_APIS || [];
            }
        }

        if (!selectedAPIs || selectedAPIs.length === 0) {
            if (typeof showToast === 'function') {
                showToast('请至少选择一个API源', 'warning');
            }
            return;
        }

        // 调用首页的完整搜索函数，确保排序和速度检测功能
        let results;
        if (typeof performSearch === 'function') {
            results = await performSearch(query, selectedAPIs);
        } else {
            // 备用搜索逻辑
            results = await performBasicSearch(query, selectedAPIs);
        }

        // 显示搜索结果
        renderPlayerSearchResults(results);

        // 更新结果计数
        if (searchResultsCount) {
            searchResultsCount.textContent = results.length;
        }

        // 显示结果区域
        searchResultsArea.classList.remove('hidden');

        // 如果启用了速度检测，且结果中有需要检测的项目，触发后台速度更新
        const speedDetectionEnabled = getBoolConfig(PLAYER_CONFIG.speedDetectionStorage, PLAYER_CONFIG.speedDetectionEnabled);
        if (speedDetectionEnabled && results.some(item => !item.loadSpeed || item.loadSpeed === '检测中...')) {
            // 延迟触发速度检测，确保DOM已渲染
            setTimeout(() => {
                if (typeof backgroundSpeedUpdate === 'function') {
                    backgroundSpeedUpdate(results).then(() => {
                        // 重新排序并刷新速度标签
                        if (typeof sortBySpeed === 'function') {
                            sortBySpeed(results);
                        }
                        refreshPlayerSpeedBadges(results);
                        // 重新渲染以应用新的排序
                        renderPlayerSearchResults(results);
                    }).catch(error => {
                        console.error('播放页速度检测失败:', error);
                    });
                } else {
                    // 如果没有backgroundSpeedUpdate函数，至少刷新现有的速度标签
                    refreshPlayerSpeedBadges(results);
                }
            }, 200);
        } else {
            // 如果没有启用速度检测，至少刷新现有的速度标签
            setTimeout(() => {
                refreshPlayerSpeedBadges(results);
            }, 100);
        }

    } catch (error) {
        console.error('搜索出错:', error);
        if (searchResults) {
            searchResults.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
        }
    } finally {
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
    }
}

/**
 * 备用搜索逻辑
 */
async function performBasicSearch(query, selectedAPIs) {
    const searchPromises = selectedAPIs.map(async (apiId) => {
        try {
            let apiUrl = `/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`;

            if (apiId.startsWith('custom_')) {
                const customIndex = parseInt(apiId.replace('custom_', ''));
                const customApi = APISourceManager?.getCustomApiInfo(customIndex);
                if (customApi && customApi.url) {
                    apiUrl += `&customApi=${encodeURIComponent(customApi.url)}`;
                } else {
                    return [];
                }
            }

            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.code === 200 && Array.isArray(data.list)) {
                return data.list.map(item => ({
                    ...item,
                    source_name: apiId.startsWith('custom_')
                        ? (APISourceManager?.getCustomApiInfo(parseInt(apiId.replace('custom_', '')))?.name || '自定义源')
                        : (API_SITES[apiId]?.name || apiId),
                    source_code: apiId,
                    loadSpeed: '检测中...',
                    quality: '检测中...',
                    detectionMethod: 'pending'
                }));
            }
            return [];
        } catch (error) {
            console.error(`API ${apiId} 搜索失败:`, error);
            return [];
        }
    });

    const results = await Promise.all(searchPromises);
    return results.flat();
}

/**
 * 渲染搜索结果
 */
function renderPlayerSearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;

    if (!results || results.length === 0) {
        searchResults.innerHTML = '<div class="text-center py-8 text-gray-400">未找到相关内容</div>';
        return;
    }

    // 应用黄色内容过滤
    const yellowFilterEnabled = getBoolConfig('yellowFilterEnabled', true);
    if (yellowFilterEnabled) {
        results = results.filter(item => {
            const title = item.vod_name || '';
            const type = item.type_name || '';
            return !/(伦理片|福利片|写真)/.test(type) && !/(伦理|写真|福利|成人|情色|AV)/i.test(title);
        });
    }

    // 应用排序（与首页保持一致）
    if (typeof sortBySpeed === 'function') {
        sortBySpeed(results);
    }

    // 使用模板渲染搜索结果
    renderSearchResultsWithTemplate(results);
}

/**
 * 基础搜索结果渲染（备用）
 */
function renderBasicSearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;

    const fragment = document.createDocumentFragment();

    // 创建网格容器
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';

    results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card-hover bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all duration-300 cursor-pointer';
        card.dataset.id = item.vod_id;
        card.dataset.sourceCode = item.source_code;
        card.onclick = () => handlePlayerSearchResultClick(item);

        // 构建速度标签
        let speedBadge = '';
        if (item.loadSpeed && isValidSpeedValue(item.loadSpeed)) {
            speedBadge = `<span class="speed-tag inline-block px-2 py-1 text-xs rounded-full bg-green-600 text-white ml-2">${item.loadSpeed}</span>`;
        } else {
            speedBadge = `<span data-field="speed-tag" class="speed-tag hidden inline-block px-2 py-1 text-xs rounded-full bg-green-600 text-white ml-2"></span>`;
        }

        card.innerHTML = `
            <div class="flex items-start gap-4">
                <div class="flex-1">
                    <h3 class="text-white font-medium text-lg mb-2">${sanitizeText(item.vod_name || '')}</h3>
                    <div class="flex flex-wrap gap-2 text-sm text-gray-400 items-center">
                        <span>${sanitizeText(item.type_name || '')}</span>
                        ${item.vod_year ? `<span>·</span><span>${item.vod_year}</span>` : ''}
                        <span>·</span>
                        <span class="text-blue-400">${sanitizeText(item.source_name || '')}</span>
                        ${speedBadge}
                    </div>
                    ${item.vod_content ? `<p class="text-gray-300 text-sm mt-2 line-clamp-2">${sanitizeText(item.vod_content.slice(0, 100))}...</p>` : ''}
                </div>
            </div>
        `;

        gridContainer.appendChild(card);
    });

    searchResults.innerHTML = '';
    searchResults.appendChild(gridContainer);
}

/**
 * 使用模板渲染搜索结果
 */
function renderSearchResultsWithTemplate(results) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;

    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    gridContainer.id = 'results'; // 添加ID以匹配CSS选择器

    const fragment = document.createDocumentFragment();

    results.forEach(item => {
        const resultCard = createResultItemUsingTemplate(item);
        if (resultCard) {
            fragment.appendChild(resultCard);
        }
    });

    gridContainer.appendChild(fragment);
    searchResults.innerHTML = '';
    searchResults.appendChild(gridContainer);
}

/**
 * 使用模板创建搜索结果项
 */
function createResultItemUsingTemplate(item) {
    const template = document.getElementById('search-result-template');
    if (!template) return null;

    const clone = template.content.cloneNode(true);
    const cardElement = clone.querySelector('.card-hover');

    if (!cardElement) return null;

    // 设置数据属性
    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.sourceCode = item.source_code || '';

    // 填充封面图片
    const picElement = cardElement.querySelector('[data-field="pic"]');
    if (picElement && item.vod_pic) {
        picElement.src = item.vod_pic;
        picElement.alt = item.vod_name || '视频封面';
    }

    // 填充标题
    const titleElement = cardElement.querySelector('[data-field="title"]');
    if (titleElement) {
        titleElement.textContent = item.vod_name || '';
        titleElement.title = item.vod_name || '';
    }

    // 填充类型
    const typeElement = cardElement.querySelector('[data-field="type"]');
    if (typeElement && item.type_name) {
        typeElement.textContent = item.type_name;
        typeElement.classList.remove('hidden');
    }

    // 填充年份
    const yearElement = cardElement.querySelector('[data-field="year"]');
    if (yearElement && item.vod_year) {
        yearElement.textContent = item.vod_year;
        yearElement.classList.remove('hidden');
    }

    // 填充备注/更新状态
    const remarksElement = cardElement.querySelector('[data-field="remarks"]');
    if (remarksElement && item.vod_remarks) {
        remarksElement.textContent = item.vod_remarks;
        remarksElement.classList.remove('hidden');
    }

    // 填充数据源
    const sourceElement = cardElement.querySelector('[data-field="source"]');
    if (sourceElement) {
        sourceElement.textContent = item.source_name || '';
    }

    // 速度标签处理
    const speedElement = cardElement.querySelector('[data-field="speed-tag"]');
    if (speedElement) {
        if (item.loadSpeed && isValidSpeedValue(item.loadSpeed)) {
            speedElement.textContent = item.loadSpeed;
            speedElement.classList.remove('hidden');
            // 设置速度标签的颜色
            speedElement.className = 'text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-green-500 text-green-300';
        } else if (item.loadSpeed === '检测中...') {
            speedElement.textContent = '检测中...';
            speedElement.classList.remove('hidden');
            speedElement.className = 'text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-yellow-500 text-yellow-300';
        } else {
            // 如果没有速度信息，隐藏标签
            speedElement.classList.add('hidden');
        }
    }

    // 画质标签处理
    const qualityElement = cardElement.querySelector('[data-field="quality-tag"]');
    if (qualityElement) {
        // 初始化画质标签
        initializeQualityTag(qualityElement, item);

        // 添加画质标签点击事件
        qualityElement.addEventListener('click', (e) => {
            e.stopPropagation();
            handleQualityTagClick(qualityElement, item);
        });
    }

    // 添加卡片点击事件（打开详情）
    cardElement.addEventListener('click', (e) => {
        e.preventDefault();
        handlePlayerSearchResultClick(item);
    });

    return cardElement;
}

/**
 * 显示视频详情
 */
function showPlayerVideoDetail(item) {
    const template = document.getElementById('video-details-template');
    if (!template) return;

    const clone = template.content.cloneNode(true);

    // 填充详情数据
    const typeElement = clone.querySelector('[data-field="type"]');
    if (typeElement) typeElement.textContent = item.type_name || '未知';

    const yearElement = clone.querySelector('[data-field="year"]');
    if (yearElement) yearElement.textContent = item.vod_year || '未知';

    const areaElement = clone.querySelector('[data-field="area"]');
    if (areaElement) areaElement.textContent = item.vod_area || '未知';

    const langElement = clone.querySelector('[data-field="lang"]');
    if (langElement) langElement.textContent = item.vod_lang || '未知';

    const directorElement = clone.querySelector('[data-field="director"]');
    if (directorElement) directorElement.textContent = item.vod_director || '未知';

    const actorElement = clone.querySelector('[data-field="actor"]');
    if (actorElement) actorElement.textContent = item.vod_actor || '未知';

    const sourceElement = clone.querySelector('[data-field="source"]');
    if (sourceElement) sourceElement.textContent = item.source_name || '未知';

    const contentElement = clone.querySelector('[data-field="content"]');
    if (contentElement) contentElement.textContent = item.vod_content || '暂无简介';

    // 处理剧集列表
    const episodesContainer = clone.querySelector('[data-field="episodesContainer"]');
    if (episodesContainer && item.vod_play_url) {
        const episodes = item.vod_play_url.split('#').filter(ep => ep.trim());
        
        // 设置集数
        const episodeCountElement = clone.querySelector('[data-field="episode-count"]');
        if (episodeCountElement) {
            episodeCountElement.textContent = episodes.length;
        }

        // 获取选集按钮容器
        const episodeButtonsGrid = clone.querySelector('[data-field="episode-buttons-grid"]');
        if (episodeButtonsGrid) {
            // 判断是否为综艺节目
            const varietyShowTypes = ['综艺', '脱口秀', '真人秀', '纪录片'];
            const isVarietyShow = varietyShowTypes.some(type => item.type_name && item.type_name.includes(type));
            
            // 根据类型设置容器样式
            if (isVarietyShow) {
                episodeButtonsGrid.className = 'variety-grid-layout';
            } else {
                episodeButtonsGrid.className = 'grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2';
            }

            episodeButtonsGrid.innerHTML = '';

            episodes.forEach((episode, index) => {
                if (episode.trim()) {
                    const episodeButton = document.createElement('button');
                    
                    let episodeName = `第${index + 1}集`;
                    if (episode.includes('$')) {
                        episodeName = episode.split('$')[0] || episodeName;
                    }

                    // 根据是否为综艺决定按钮样式和文本
                    if (isVarietyShow) {
                        // 综艺：使用原始名称，应用综艺专用样式
                        episodeButton.className = 'episode-btn';
                        episodeButton.textContent = episodeName;
                        episodeButton.title = episodeName;
                    } else {
                        // 非综艺：使用标准样式
                        episodeButton.className = 'episode-btn px-2 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs sm:text-sm transition-colors truncate';
                        episodeButton.textContent = episodeName;
                        episodeButton.title = episodeName;
                    }

                    episodeButton.addEventListener('click', () => {
                        // 重置搜索状态
                        PlayerSearchState.isFromSearch = false;
                        closePlayerModal();
                        closePlayerSearch();

                        // 播放选中的剧集
                        const playerUrl = new URL('player.html', window.location.origin);
                        let playUrl = episode;
                        if (episode.includes('$')) {
                            playUrl = episode.split('$')[1];
                        }

                        playerUrl.searchParams.set('url', playUrl);
                        playerUrl.searchParams.set('title', item.vod_name);
                        playerUrl.searchParams.set('index', index.toString());
                        if (item.vod_id) playerUrl.searchParams.set('id', item.vod_id);
                        if (item.source_name) playerUrl.searchParams.set('source', item.source_name);
                        if (item.source_code) playerUrl.searchParams.set('source_code', item.source_code);
                        if (item.vod_year) playerUrl.searchParams.set('year', item.vod_year);
                        if (item.type_name) playerUrl.searchParams.set('typeName', item.type_name);

                        const universalId = generateUniversalId(item.vod_name, item.vod_year, index);
                        playerUrl.searchParams.set('universalId', universalId);

                        const adOn = getBoolConfig('adFilteringEnabled', false);
                        playerUrl.searchParams.set('af', adOn ? '1' : '0');

                        window.location.href = playerUrl.toString();
                    });

                    episodeButtonsGrid.appendChild(episodeButton);
                }
            });
        }
    }

    // 显示模态框
    if (typeof showModal === 'function') {
        showModal(clone, item.vod_name || '视频详情');
    }
}

/**
 * 检查速度值是否有效
 */
function isValidSpeedValue(speed) {
    if (!speed || speed === 'N/A' || speed === '连接超时' || speed === '未知' || speed === '检测失败') {
        return false;
    }
    return /^\d+(\.\d+)?\s*(KB\/s|MB\/s|kb\/s|mb\/s)$/i.test(speed);
}

/**
 * 播放页搜索状态跟踪
 */
const PlayerSearchState = {
    isFromSearch: false,
    searchQuery: '',
    searchResults: []
};

/**
 * 处理搜索结果点击
 */
function handlePlayerSearchResultClick(item) {
    try {
        // 设置状态标记，表示弹窗是从搜索结果打开的
        PlayerSearchState.isFromSearch = true;

        // 显示详情模态框
        showPlayerVideoDetail(item);
    } catch (error) {
        console.error('处理搜索结果点击失败:', error);
        if (typeof showToast === 'function') {
            showToast('打开视频详情失败', 'error');
        }
    }
}

/**
 * 处理历史记录点击
 */
function handlePlayerHistoryClick(e) {
    // 复用首页的历史点击处理逻辑
    if (typeof handleHistoryListClick === 'function') {
        handleHistoryListClick(e);
    }

    // 关闭历史面板
    closePlayerHistory();
}

/**
 * 处理搜索标签点击
 */
function handlePlayerSearchTagClick(e) {
    // 处理删除按钮点击
    const delSpan = e.target.closest('span[data-deletequery]');
    if (delSpan) {
        if (typeof deleteSingleSearchHistory === 'function') {
            deleteSingleSearchHistory(delSpan.dataset.deletequery);
        }
        e.stopPropagation();
        return;
    }

    // 标签点击（只有非X按钮才允许搜索）
    const tagBtn = e.target.closest('.search-tag');
    if (tagBtn && !e.target.closest('span[data-deletequery]')) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            const query = tagBtn.textContent.trim();
            searchInput.value = query;

            // 直接执行搜索
            PlayerPageState.currentSearchQuery = query;
            performPlayerSearch(query);
        }
        return;
    }
}

/**
 * 关闭模态框
 */
function closePlayerModal() {
    if (typeof closeModal === 'function') {
        closeModal();
    }

    // 如果是从搜索结果打开的，返回搜索结果
    if (PlayerSearchState.isFromSearch) {
        PlayerSearchState.isFromSearch = false;
        openPlayerSearch();
    }
}

/**
 * 处理键盘事件
 */
function handlePlayerKeydown(e) {
    // 检查是否在输入框中
    const activeElement = document.activeElement;
    const isInInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
    );

    // ESC键关闭面板
    if (e.key === 'Escape') {
        if (PlayerPageState.isSearchPanelOpen) {
            closePlayerSearch();
            e.preventDefault();
        } else if (PlayerPageState.isHistoryPanelOpen) {
            closePlayerHistory();
            e.preventDefault();
        }
    }

    // 快捷键（仅在非输入状态下生效）
    if (!isInInput) {
        // Ctrl+F 或 / 键打开搜索
        if ((e.ctrlKey && e.key === 'f') || e.key === '/') {
            e.preventDefault();
            openPlayerSearch();
        }

        // H键打开历史
        if (e.key === 'h' || e.key === 'H') {
            e.preventDefault();
            togglePlayerHistory();
        }
    }
}

/**
 * 设置面板自动关闭
 */
function setupPlayerPanelAutoClose() {
    document.addEventListener('click', function (event) {
        // 检查点击的元素
        const historyButton = document.getElementById('historyButton');
        const searchButton = document.getElementById('searchButton');
        const historyPanel = document.getElementById('historyPanel');
        const searchPanel = document.getElementById('searchPanel');

        // 如果点击的是按钮或面板内部，不做处理
        if (historyButton && historyButton.contains(event.target)) return;
        if (searchButton && searchButton.contains(event.target)) return;
        if (historyPanel && historyPanel.contains(event.target)) return;
        if (searchPanel && searchPanel.contains(event.target)) return;

        // 关闭面板
        if (PlayerPageState.isHistoryPanelOpen) {
            closePlayerHistory();
        }
        // 注意：搜索面板是模态框，不需要自动关闭
    });
}

/**
 * 文本净化函数
 */
function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 生成视频统一标识符（复用播放页逻辑）
 */
function generateUniversalId(title, year, episodeIndex) {
    if (typeof getCoreTitle === 'function') {
        const coreTitle = getCoreTitle(title);
        const normalizedTitle = coreTitle.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
        const normalizedYear = year ? String(year) : 'unknown';
        return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
    }
    // 备用逻辑
    const normalizedTitle = title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
    const normalizedYear = year ? String(year) : 'unknown';
    return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
}

/**
 * 初始化画质标签
 */
function initializeQualityTag(element, item) {
    // 如果已有画质信息，直接显示
    if (item.quality && item.quality !== '检测中...') {
        updateQualityTag(element, item.quality);
        return;
    }

    // 开始画质检测
    element.textContent = '检测中...';
    element.className = 'quality-tag text-xs font-medium py-0.5 px-1.5 rounded bg-gray-500 text-white cursor-pointer transition-colors hover:opacity-80';

    // 异步检测画质
    detectVideoQuality(item).then(quality => {
        updateQualityTag(element, quality);
        // 更新item对象中的画质信息
        item.quality = quality;
    }).catch(error => {
        console.error('画质检测失败:', error);
        updateQualityTag(element, '检测失败');
        item.quality = '检测失败';
    });
}

// 防抖机制，避免频繁点击
const qualityDetectionDebounce = new Map();

/**
 * 画质标签点击处理
 */
function handleQualityTagClick(element, item) {
    const currentQuality = element.textContent;

    // 如果正在检测中，忽略点击
    if (currentQuality === '检测中...') {
        return;
    }

    // 如果是未知、检测失败或检测超时，允许重测
    if (currentQuality === '未知' || currentQuality === '检测失败' || currentQuality === '检测超时') {
        const itemKey = `${item.vod_id}_${item.source_code}`;

        // 防抖：如果2秒内已经点击过，忽略
        if (qualityDetectionDebounce.has(itemKey)) {
            const lastClick = qualityDetectionDebounce.get(itemKey);
            if (Date.now() - lastClick < 2000) {
                return;
            }
        }

        qualityDetectionDebounce.set(itemKey, Date.now());

        element.textContent = '检测中...';
        element.className = 'quality-tag text-xs font-medium py-0.5 px-1.5 rounded bg-gray-500 text-white cursor-pointer transition-colors hover:opacity-80';

        // 执行画质重测
        detectVideoQuality(item, true).then(quality => {
            updateQualityTag(element, quality);
            item.quality = quality;
            // 清除防抖记录
            qualityDetectionDebounce.delete(itemKey);
        }).catch(error => {
            console.error('画质重测失败:', error);
            updateQualityTag(element, '检测失败');
            item.quality = '检测失败';
            // 清除防抖记录
            qualityDetectionDebounce.delete(itemKey);
        });
    }
}

/**
 * 更新画质标签显示
 */
function updateQualityTag(element, quality) {
    element.textContent = quality;

    // 根据画质设置不同颜色（与首页保持一致）
    const qualityColors = {
        '4K': 'bg-amber-500 text-white',
        '2K': 'bg-purple-600 text-purple-100',
        '1080p': 'bg-purple-600 text-purple-100',
        '720p': 'bg-blue-600 text-blue-100',
        '高清': 'bg-green-600 text-green-100',
        '480p': 'bg-green-600 text-green-100',
        'SD': 'bg-gray-500 text-gray-100',
        '标清': 'bg-gray-500 text-gray-100',
        '未知': 'bg-red-600 text-red-100',
        '检测失败': 'bg-red-600 text-red-100',
        '检测超时': 'bg-red-600 text-red-100',
        '编码不支持': 'bg-red-600 text-red-100',
        '播放失败': 'bg-red-600 text-red-100',
        '无有效链接': 'bg-red-600 text-red-100',
        '检测中...': 'bg-gray-500 text-white'
    };

    const colorClass = qualityColors[quality] || qualityColors['未知'];
    element.className = `quality-tag text-xs font-medium py-0.5 px-1.5 rounded ${colorClass} cursor-pointer transition-colors hover:opacity-80`;

    // 设置提示文本
    if (quality === '未知' || quality === '检测失败' || quality === '检测超时') {
        element.title = '点击重新检测画质';
    } else if (quality === '检测中...') {
        element.title = '正在检测画质...';
    } else {
        element.title = `画质: ${quality}`;
    }
}

/**
 * 检测视频画质
 */
async function detectVideoQuality(item, forceRetest = false) {
    try {
        // 如果没有播放链接，返回未知
        if (!item.vod_play_url) {
            return '未知';
        }

        // 获取第一个播放链接进行检测
        const episodes = item.vod_play_url.split('#');
        if (episodes.length === 0) {
            return '未知';
        }

        let playUrl = episodes[0];
        if (playUrl.includes('$')) {
            playUrl = playUrl.split('$')[1];
        }

        if (!playUrl || !playUrl.startsWith('http')) {
            return '未知';
        }

        // 添加超时控制
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('检测超时')), 10000); // 10秒超时
        });

        // 使用画质检测器
        let detectionPromise;
        if (typeof window.comprehensiveQualityCheck === 'function') {
            detectionPromise = window.comprehensiveQualityCheck(playUrl);
        } else if (typeof window.simplePrecheckSource === 'function') {
            detectionPromise = window.simplePrecheckSource(playUrl);
        } else {
            // 备用检测逻辑
            detectionPromise = basicQualityDetection(playUrl);
        }

        const result = await Promise.race([detectionPromise, timeoutPromise]);
        return result.quality || '未知';

    } catch (error) {
        console.error('画质检测出错:', error);
        if (error.message === '检测超时') {
            return '检测超时';
        }
        return '检测失败';
    }
}

/**
 * 基础画质检测（备用方案）
 */
async function basicQualityDetection(url) {
    try {
        // 基于URL关键词的简单检测
        const qualityKeywords = {
            '4K': [/4k/i, /2160p/i, /3840x2160/i, /超高清/i, /uhd/i],
            '2K': [/2k/i, /1440p/i, /2560x1440/i, /qhd/i],
            '1080p': [/1080p/i, /fhd/i, /1920x1080/i, /全高清/i, /fullhd/i],
            '720p': [/720p/i, /hd/i, /1280x720/i, /高清/i],
            '480p': [/480p/i, /854x480/i, /sd/i],
            'SD': [/240p/i, /360p/i, /标清/i, /low/i]
        };

        for (const [quality, patterns] of Object.entries(qualityKeywords)) {
            if (patterns.some(pattern => pattern.test(url))) {
                return quality;
            }
        }

        return '未知';
    } catch (error) {
        return '检测失败';
    }
}

/**
 * 刷新播放页搜索结果中的速度标签
 */
function refreshPlayerSpeedBadges(results) {
    results.forEach(item => {
        const badge = document.querySelector(
            `.card-hover[data-id="${item.vod_id}"][data-source-code="${item.source_code}"] [data-field="speed-tag"]`
        );
        if (badge && item.loadSpeed && isValidSpeedValue(item.loadSpeed)) {
            badge.textContent = item.loadSpeed;
            badge.classList.remove('hidden');
            badge.className = 'text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-green-500 text-green-300';
        }
    });
}



/**
 * 播放页专用的保存搜索历史函数（不触发重复渲染）
 */
function savePlayerSearchHistory(query) {
    if (!query || !query.trim()) return;
    query = query.trim().slice(0, 50).replace(/[<>"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '"': '&quot;'
    })[c]);

    // 获取搜索历史
    let history = typeof getSearchHistory === 'function' ? getSearchHistory() : [];
    const now = Date.now();

    // 2个月有效、去重
    history = history.filter(item =>
        typeof item === 'object' && item.timestamp && (now - item.timestamp < 5184000000) &&
        item.text !== query
    );

    // 新项在最前
    history.unshift({ text: query, timestamp: now });
    if (history.length > (window.MAX_HISTORY_ITEMS || 5)) {
        history = history.slice(0, (window.MAX_HISTORY_ITEMS || 5));
    }

    try {
        localStorage.setItem(window.SEARCH_HISTORY_KEY || 'searchHistory', JSON.stringify(history));
    } catch (e) {
        // 空间不足时清理
        localStorage.removeItem(window.SEARCH_HISTORY_KEY || 'searchHistory');
        try {
            localStorage.setItem(window.SEARCH_HISTORY_KEY || 'searchHistory', JSON.stringify(history.slice(0, 3)));
        } catch (e2) {
            // 两次都失败则放弃
        }
    }

    // 使用播放页专用的渲染函数，不会创建重复的header
    renderPlayerSearchHistory();
}

/**
 * 播放页专用的搜索历史渲染函数
 */
function renderPlayerSearchHistory() {
    const historyContainer = document.getElementById('recentSearches');
    if (!historyContainer) return;

    // 获取搜索历史
    const history = typeof getSearchHistory === 'function' ? getSearchHistory() : [];
    if (!history.length) {
        historyContainer.innerHTML = '';
        return;
    }

    const frag = document.createDocumentFragment();

    // 仅生成搜索标签
    history.forEach(item => {
        // 外部包裹，让标签和 x 对齐
        const tagWrap = document.createElement('div');
        tagWrap.className = 'inline-flex items-center mb-2 mr-2';

        const tag = document.createElement('button');
        tag.className = 'search-tag';
        tag.textContent = item.text;
        if (item.timestamp) {
            tag.title = `搜索于: ${new Date(item.timestamp).toLocaleString()}`;
        }

        // 删除按钮
        const deleteBtn = document.createElement('span');
        deleteBtn.className =
            'ml-2 text-gray-400 hover:text-red-500 cursor-pointer select-none flex items-center';
        deleteBtn.setAttribute('role', 'button');
        deleteBtn.setAttribute('aria-label', '删除');
        deleteBtn.dataset.deletequery = item.text;
        deleteBtn.style.fontSize = '1.15em';
        deleteBtn.innerHTML =
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="pointer-events:none;">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>' +
            '</svg>';

        tagWrap.appendChild(tag);
        tagWrap.appendChild(deleteBtn);
        frag.appendChild(tagWrap);
    });

    // 先清空，再插入标签
    historyContainer.innerHTML = '';
    historyContainer.appendChild(frag);
}

/**
 * 处理清除搜索历史
 */
function handleClearSearchHistory(e) {
    e.preventDefault();
    e.stopPropagation();

    if (typeof clearSearchHistory === 'function') {
        clearSearchHistory();
        // 重新渲染搜索历史（播放页专用版本）
        renderPlayerSearchHistory();
        if (typeof showToast === 'function') {
            showToast('搜索历史已清除', 'info');
        }
    }
}

/**
 * 获取布尔配置值
 */
function getBoolConfig(key, defaultValue) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
}

// 导出函数到全局作用域
window.initPlayerSearchHistory = initPlayerSearchHistory;
window.togglePlayerHistory = togglePlayerHistory;
window.togglePlayerSearch = togglePlayerSearch;

// 自动初始化
initPlayerSearchHistory();