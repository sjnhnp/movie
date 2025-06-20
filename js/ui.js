// =================== 全局常量、工具 =====================

// 搜索与历史相关常量
window.MAX_HISTORY_ITEMS = window.MAX_HISTORY_ITEMS || 30;
window.SEARCH_HISTORY_KEY = window.SEARCH_HISTORY_KEY || 'searchHistory';

// UI样式类型
const TOAST_BG_COLORS = {
    'error': 'bg-red-500',
    'success': 'bg-green-500',
    'info': 'bg-blue-500',
    'warning': 'bg-yellow-500'
};
const HISTORY_MAX_ITEMS = 50;           // 观看历史最大数量

/**
 * 实际切换设置面板的函数
 */
function actuallyToggleSettingsPanel() {
    togglePanel('settingsPanel', 'historyPanel');
}

/**
 * 设置面板开关 - 增加了密码验证逻辑
 * @param {Event} e 事件对象
 */
// js/ui.js

function toggleSettings(e) {
    e?.stopPropagation();

    const settingsPasswordHash = window.__ENV__?.SETTINGS_PASSWORD;
    const isProtected = settingsPasswordHash && settingsPasswordHash.length === 64 && !/^0+$/.test(settingsPasswordHash);

    if (isProtected && typeof isSettingsPasswordVerified === 'function' && !isSettingsPasswordVerified()) {
        window.verifyingPurpose = 'settings';
        const modal = getElement('passwordModal');
        const title = getElement('passwordModalTitle');
        const p = modal?.querySelector('p');

        if (title) title.textContent = "设置项验证";
        if (p) p.textContent = "请输入密码以访问设置";

        if (typeof showPasswordModal === 'function') {
            showPasswordModal();
        }
    } else {
        // 如果没有设置密码，或者已经验证通过，直接打开
        actuallyToggleSettingsPanel();
    }
}

/**
 * 生成「剧 + 集」唯一标识  
 * - 优先：title + sourceCode + vod_id + _epX  
 * - 兜底：title + sourceCode + url 最后一段 + _epX  
 */
function getUniqueEpisodeId(v) {
    const getUrlKey = (raw = '') =>
        (raw.split('/').pop().split(/[?#]/)[0] || raw).slice(-80); // 取文件名或 URL 尾部

    const sc = v.sourceCode || 'unknown_source';
    const vid = v.vod_id || '';
    const ep = (typeof v.episodeIndex === 'number') ? `_ep${v.episodeIndex}` : '';

    if (vid) return `${v.title}_${sc}_${vid}${ep}`;
    return `${v.title}_${sc}_${getUrlKey(v.url)}${ep}`;
}

// DOM元素缓存
const domCache = new Map();

/**
 * 获取DOM元素（带缓存）
 * @param {string} id 元素ID
 * @returns {HTMLElement|null} DOM元素
 */
// ui.js 里替换 getElement 的实现 —— 失效即更新缓存
function getElement(id) {
    const cached = domCache.get(id);
    if (cached && cached.isConnected) {
        return cached;
    }
    const fresh = document.getElementById(id);
    if (fresh) domCache.set(id, fresh);
    return fresh;
}


/**
 * 检查密码保护
 * @returns {boolean} 是否通过密码验证
 */
function checkPasswordProtection() {
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof showPasswordModal === 'function') showPasswordModal();
            return false;
        }
    }
    return true;
}

/**
 * 集中管理面板切换逻辑
 * @param {string} panelIdToShow 要显示的面板ID
 * @param {string} panelIdToHide 要隐藏的面板ID（可选）
 * @param {Function} onShowCallback 面板显示后的回调函数（可选）
 * @returns {boolean} 是否成功切换面板
 */
function togglePanel(panelIdToShow, panelIdToHide, onShowCallback) {
    if (!checkPasswordProtection()) return false;

    const panelToShow = getElement(panelIdToShow);
    if (!panelToShow) return false;

    // 切换目标面板
    const isShowing = panelToShow.classList.toggle('show');
    panelToShow.setAttribute('aria-hidden', !isShowing);

    // 如果指定了要隐藏的面板，确保它被关闭
    if (panelIdToHide) {
        const panelToHide = getElement(panelIdToHide);
        if (panelToHide && panelToHide.classList.contains('show')) {
            panelToHide.classList.remove('show');
            panelToHide.setAttribute('aria-hidden', 'true');
        }
    }

    // 如果面板被显示且有回调，执行回调
    if (isShowing && typeof onShowCallback === 'function') {
        onShowCallback();
    }

    return true;
}

// =============== UI相关函数 =============================

/**
 * 历史面板开关
 * @param {Event} e 事件对象
 */
function toggleHistory(e) {
    if (e) e.stopPropagation();
    togglePanel('historyPanel', 'settingsPanel', loadViewingHistory);
}

// ------------- Toast功能（支持队列） -------------
const toastQueue = [];
let isShowingToast = false;

/** 
 * 显示消息Toast（支持消息队列，背景色可变更）
 * @param {string} message 消息内容
 * @param {string} type 消息类型 (error|success|info|warning)
 */
function showToast(message, type = 'error') {
    toastQueue.push({ message, type });
    if (!isShowingToast) showNextToast();
}

/**
 * 显示下一条Toast消息
 */
function showNextToast() {
    if (!toastQueue.length) return isShowingToast = false;
    isShowingToast = true;
    const { message, type } = toastQueue.shift();
    const toast = getElement('toast');
    const toastMessage = getElement('toastMessage');
    if (!toast || !toastMessage) return;

    // 设置样式
    const bg = TOAST_BG_COLORS[type] || TOAST_BG_COLORS.error;
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${bg} text-white z-50`;
    toastMessage.textContent = message;

    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-100%)';
        setTimeout(showNextToast, 300);
    }, 3000);
}

// ----------- Loading区域 --------------
let loadingTimeoutId = null;

/** 
 * 显示Loading
 * @param {string} message 加载提示文本
 */
function showLoading(message = '加载中...') {
    if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
    const loading = getElement('loading');
    if (!loading) return;
    const p = loading.querySelector('p');
    if (p) p.textContent = message;
    loading.style.display = 'flex';
    loadingTimeoutId = setTimeout(() => {
        hideLoading();
        showToast('操作超时，请稍后重试', 'warning');
    }, 30000);
}

/** 
 * 隐藏Loading
 */
function hideLoading() {
    if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
    const loading = getElement('loading');
    if (loading) loading.style.display = 'none';
}

// ----------- 模态框管理 --------------
let lastFocusedElement = null;

/** 
 * 显示模态框
 * @param {string} content 模态框内容
 * @param {string} title 模态框标题（可选）
 */
function showModal(content, title = '') {
    const modal = getElement('modal');
    const modalContent = getElement('modalContent');
    const modalTitle = getElement('modalTitle');

    if (!modal || !modalContent) return;

    // 保存当前焦点元素，以便关闭时恢复
    lastFocusedElement = document.activeElement;

    // 设置内容
    modalContent.innerHTML = content;
    if (modalTitle && title) modalTitle.textContent = title;

    // 显示模态框
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    // 设置焦点陷阱
    setupFocusTrap(modal);

    // 将焦点移至模态框内的第一个可聚焦元素
    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusableElements.length) {
        focusableElements[0].focus();
    } else {
        modal.focus();
    }
}

/**
 * 设置焦点陷阱
 * @param {HTMLElement} container 需要设置焦点陷阱的容器
 */
function setupFocusTrap(container) {
    container.addEventListener('keydown', function (e) {
        // 如果按下的不是Tab键，不处理
        if (e.key !== 'Tab') return;

        const focusableElements = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusableElements.length) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        // Shift+Tab 从第一个元素循环到最后一个
        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        }
        // Tab 从最后一个元素循环到第一个
        else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    });
}

/** 
 * 关闭详情弹窗
 */
function closeModal() {
    const modal = getElement('modal');
    const modalContent = getElement('modalContent');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    if (modalContent) modalContent.innerHTML = '';

    // 恢复焦点
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
    }
}

// ========== 搜索历史相关 ================

/** 
 * 获取历史（兼容老新格式）
 * @returns {Array} 搜索历史数组
 */
function getSearchHistory() {
    try {
        const data = localStorage.getItem(SEARCH_HISTORY_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(item => typeof item === 'string' ? { text: item, timestamp: 0 } : item)
            .filter(item => item && item.text);
    } catch (e) {
        console.error('获取搜索历史出错:', e);
        return [];
    }
}

/** 
 * 保存搜索历史，记录时间戳，去重，控量，防止XSS
 * @param {string} query 搜索关键词
 */
function saveSearchHistory(query) {
    if (!query || !query.trim()) return;
    query = query.trim().slice(0, 50).replace(/[<>"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '"': '&quot;'
    })[c]);
    let history = getSearchHistory();
    const now = Date.now();
    // 2个月有效、去重
    history = history.filter(item =>
        typeof item === 'object' && item.timestamp && (now - item.timestamp < 5184000000) &&
        item.text !== query
    );
    // 新项在最前
    history.unshift({ text: query, timestamp: now });
    if (history.length > MAX_HISTORY_ITEMS) history = history.slice(0, MAX_HISTORY_ITEMS);
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        // 空间不足时清理
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        try {
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 3)));
        } catch (e2) {
            // 两次都失败则放弃
        }
    }
    renderSearchHistory();
}

/**
 * 处理搜索标签点击事件
 * @param {Event} e 事件对象
 */
function handleSearchTagClick(e) {
    // 删除按钮点击
    const delSpan = e.target.closest('span[data-deletequery]');
    if (delSpan) {
        deleteSingleSearchHistory(delSpan.dataset.deletequery);
        e.stopPropagation();
        return;
    }

    // 标签点击（只有非X按钮才允许搜索）
    const tagBtn = e.target.closest('.search-tag');
    if (tagBtn && !e.target.closest('span[data-deletequery]')) {
        const searchInput = getElement('searchInput');
        if (searchInput) {
            searchInput.value = tagBtn.textContent.trim();
            if (typeof search === 'function') search();
        }
        return;
    }
}


/**
 * 渲染搜索历史标签
 */
function renderSearchHistory() {
    const historyContainer = getElement('recentSearches');
    if (!historyContainer) return;
    const history = getSearchHistory();
    if (!history.length) { historyContainer.innerHTML = ''; return; }

    const frag = document.createDocumentFragment();

    // 标题与清空按钮
    const header = document.createElement('div');
    header.className = "flex justify-between items-center w-full mb-2";

    const titleDiv = document.createElement('div');
    titleDiv.className = "text-gray-500";
    titleDiv.textContent = "最近搜索:";

    const clearBtn = document.createElement('button');
    clearBtn.id = "clearHistoryBtn";
    clearBtn.className = "text-gray-500 hover:text-white transition-colors";
    clearBtn.setAttribute('aria-label', "清除搜索历史");
    clearBtn.textContent = "清除搜索历史";
    clearBtn.onclick = clearSearchHistory;

    header.appendChild(titleDiv);
    header.appendChild(clearBtn);
    frag.appendChild(header);

    // 渲染每个标签，自带删除x按钮
    history.forEach(item => {
        // 外部包裹，让标签和x对齐
        const tagWrap = document.createElement('div');
        tagWrap.className = 'inline-flex items-center mb-2 mr-2';

        // 核心：只用你自己的search-tag class!
        const tag = document.createElement('button');
        tag.className = 'search-tag';
        tag.textContent = item.text;
        if (item.timestamp) tag.title = `搜索于: ${new Date(item.timestamp).toLocaleString()}`;

        // 删除按钮
        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'ml-2 text-gray-400 hover:text-red-500 cursor-pointer select-none flex items-center';
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

    historyContainer.innerHTML = '';
    historyContainer.appendChild(frag);
}


/**
 * 删除单条搜索历史
 * @param {string} query 要删除的标签内容
 */
function deleteSingleSearchHistory(query) {
    try {
        let history = getSearchHistory();
        // 防XSS与历史一致
        history = history.filter(item => item.text !== query);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
        renderSearchHistory(); // 重新渲染
    } catch (e) {
        console.error('删除单条搜索历史失败:', e);
        showToast('删除单条搜索历史失败', 'error');
    }
}

/**
 * 清除搜索历史
 */
function clearSearchHistory() {
    if (!checkPasswordProtection()) return;

    try {
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        renderSearchHistory();
        showToast('搜索历史已清除', 'success');
    } catch (e) {
        console.error('清除搜索历史失败:', e);
        showToast('清除搜索历史失败', 'error');
    }
}

// ========== 观看历史相关 ================

/** 
 * 时间戳人性化显示
 * @param {number} timestamp 时间戳
 * @returns {string} 格式化后的时间字符串
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp), now = new Date();
    const diff = now - date;
    if (diff < 3600000) return `${Math.max(0, Math.floor(diff / 60000)) || '刚刚'}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}
        ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 获取观看历史
 * @returns {Array} 观看历史数组
 */
function getViewingHistory() {
    try {
        const data = localStorage.getItem('viewingHistory');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('获取观看历史失败:', e);
        return [];
    }
}

/**
 * 处理历史列表点击事件
 * @param {Event} e 事件对象
 */
function handleHistoryListClick(e) {
    // 处理删除按钮点击
    const deleteButton = e.target.closest('.history-item-delete-btn');
    if (deleteButton) {
        e.stopPropagation();
        const historyItem = deleteButton.closest('.history-item');
        // Use the correct dataset attribute
        if (historyItem && historyItem.dataset.internalId) {
            deleteHistoryItem(historyItem.dataset.internalId); // Use internalId
        }
        return;
    }

    // 处理历史项点击
    const historyItem = e.target.closest('.history-item');
    if (historyItem) {
        const url = historyItem.dataset.url;
        const title = historyItem.dataset.title;
        const episodeIndex = parseInt(historyItem.dataset.episodeIndex, 10);
        const playbackPosition = parseInt(historyItem.dataset.playbackPosition, 10);
        playFromHistory(url, title, episodeIndex, playbackPosition);
    }
}

/** 
 * mm:ss时间格式
 * @param {number} seconds 秒数
 * @returns {string} 格式化后的时间字符串
 */
function formatPlaybackTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 增加/更新历史（同标题合并，每标题仅一条记录）
 * @param {Object} videoInfo 视频信息对象
 */
function addToViewingHistory(videoInfo) {

    if (!checkPasswordProtection()) return;
    try {
        let history = getViewingHistory();

        // 使用统一工具生成「剧 + 集」级唯一键，避免同名不同集互相覆盖
        const internalShowIdentifier = getUniqueEpisodeId(videoInfo);

        const idx = history.findIndex(item => item.internalShowIdentifier === internalShowIdentifier);

        if (idx !== -1) { // 如果这部剧已在历史中
            const item = history[idx];
            // 更新为最新观看的这一集的信息
            item.url = videoInfo.url; // 当前播放的特定集的URL
            item.episodeIndex = videoInfo.episodeIndex;
            item.playbackPosition = videoInfo.playbackPosition;
            item.duration = videoInfo.duration;
            item.timestamp = Date.now();
            // 如果新的videoInfo提供了更完整的剧集列表，则更新
            if (videoInfo.episodes && videoInfo.episodes.length > 0) {
                // 简单的检查，如果长度不同或第一个元素不同，就认为需要更新（可以做得更复杂）
                if (!item.episodes || item.episodes.length !== videoInfo.episodes.length || (item.episodes[0] !== videoInfo.episodes[0])) {
                    item.episodes = [...videoInfo.episodes];
                }
            }
            // 其他信息如 title, sourceName, sourceCode, vod_id, internalShowIdentifier 应该保持不变
            item.sourceName = videoInfo.sourceName || item.sourceName; // 保留旧的，除非新的明确提供

            history.splice(idx, 1); // 移除旧条目
            history.unshift(item);  // 将更新后的条目移到最前面
        } else { // 如果是新的剧集条目
            const newItem = {
                title: videoInfo.title,
                url: videoInfo.url,
                episodeIndex: videoInfo.episodeIndex,
                sourceName: videoInfo.sourceName,
                sourceCode: videoInfo.sourceCode,
                vod_id: videoInfo.vod_id,
                internalShowIdentifier: internalShowIdentifier, // 保存这个内部标识符
                playbackPosition: videoInfo.playbackPosition,
                duration: videoInfo.duration,
                timestamp: Date.now(),
                episodes: (videoInfo.episodes && videoInfo.episodes.length > 0) ? [...videoInfo.episodes] : []
            };
            history.unshift(newItem);
        }

        if (history.length > HISTORY_MAX_ITEMS) { // HISTORY_MAX_ITEMS 在 ui.js 定义 [cite: 1059]
            history.splice(HISTORY_MAX_ITEMS);
        }
        localStorage.setItem('viewingHistory', JSON.stringify(history));
    } catch (e) {
        console.error('保存观看历史失败:', e);
    }
}

/**
 * 清空观看历史
 */
function clearViewingHistory() {
    if (!checkPasswordProtection()) return;

    try {
        localStorage.removeItem('viewingHistory');
        loadViewingHistory();
        showToast('观看历史已清除', 'success');
    } catch (e) {
        console.error('清除观看历史失败:', e);
        showToast('清除观看历史失败', 'error');
    }
}

/**
 * 渲染历史面板
 */
function loadViewingHistory() {
    const historyList = getElement('historyList');
    if (!historyList) return;
    const history = getViewingHistory();
    if (!history.length) {
        historyList.innerHTML = `<div class="text-center text-gray-500 py-8">暂无观看记录</div>`;
        return;
    }

    const frag = document.createDocumentFragment();

    history.forEach(item => {
        // 防XSS
        const safeTitle = (item.title || '').replace(/[<>"']/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        const safeSource = (item.sourceName || '未知来源').replace(/[<>"']/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        const episodeText = item.episodeIndex !== undefined ? `第${item.episodeIndex + 1}集` : '';

        const historyItem = document.createElement('div');
        historyItem.className = 'history-item cursor-pointer relative group';
        historyItem.dataset.url = item.url;
        historyItem.dataset.title = safeTitle;
        historyItem.dataset.episodeIndex = item.episodeIndex || 0;
        historyItem.dataset.playbackPosition = item.playbackPosition || 0;
        historyItem.dataset.internalId = item.internalShowIdentifier;

        // 构建历史项内容
        const historyInfo = document.createElement('div');
        historyInfo.className = 'history-info';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'history-title';
        titleDiv.innerHTML = safeTitle;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'history-meta';

        if (episodeText) {
            const episodeSpan = document.createElement('span');
            episodeSpan.className = 'history-episode';
            episodeSpan.innerHTML = episodeText;
            metaDiv.appendChild(episodeSpan);

            const separatorSpan = document.createElement('span');
            separatorSpan.className = 'history-separator mx-1';
            separatorSpan.innerHTML = '·';
            metaDiv.appendChild(separatorSpan);
        }

        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'history-source';
        sourceSpan.innerHTML = safeSource;
        metaDiv.appendChild(sourceSpan);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'history-time';
        timeDiv.textContent = formatTimestamp(item.timestamp);

        historyInfo.appendChild(titleDiv);
        historyInfo.appendChild(metaDiv);

        // 进度条
        if (item.playbackPosition && item.duration && item.playbackPosition > 10 && item.playbackPosition < item.duration * 0.95) {
            const progressDiv = document.createElement('div');
            progressDiv.className = 'history-progress';

            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';

            const progressFilled = document.createElement('div');
            progressFilled.className = 'progress-filled';
            progressFilled.style.width = `${Math.round(item.playbackPosition / item.duration * 100)}%`;

            const progressText = document.createElement('div');
            progressText.className = 'progress-text';
            progressText.textContent = `${formatPlaybackTime(item.playbackPosition)} / ${formatPlaybackTime(item.duration)}`;

            progressBar.appendChild(progressFilled);
            progressDiv.appendChild(progressBar);
            progressDiv.appendChild(progressText);
            historyInfo.appendChild(progressDiv);
        }

        historyInfo.appendChild(timeDiv);
        historyItem.appendChild(historyInfo);

        // 删除按钮
        const deleteButton = document.createElement('button');
        deleteButton.className = 'history-item-delete-btn absolute right-2 top-2 transition-opacity duration-200 text-gray-400 hover:text-red-400 p-1 rounded-full hover:bg-gray-800 z-10';
        deleteButton.title = '删除记录';
        deleteButton.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>`;

        historyItem.appendChild(deleteButton);
        frag.appendChild(historyItem);
    });

    historyList.innerHTML = '';
    historyList.appendChild(frag);
    if (history.length > 5) historyList.classList.add('pb-4');

    // 移除旧的事件监听器和添加新的事件委托的代码已移至attachEventListeners函数
}

/**
 * 初始化事件监听器
 */
function attachEventListeners() {
    // 设置按钮事件
    const settingsButton = getElement('settingsButton');
    if (settingsButton) {
        settingsButton.addEventListener('click', toggleSettings);
    }

    // 新增：监听设置密码验证成功的事件
    document.addEventListener('settingsPasswordVerified', actuallyToggleSettingsPanel);

    // 观看历史按钮
    const historyButton = getElement('historyButton');
    if (historyButton) {
        historyButton.addEventListener('click', toggleHistory);
    }

    // 关闭设置面板按钮
    const closeSettingsPanelButton = getElement('closeSettingsPanelButton');
    if (closeSettingsPanelButton) {
        closeSettingsPanelButton.addEventListener('click', toggleSettings);
    }

    // 关闭历史面板按钮  ← 新增这一段
    const closeHistoryPanelButton = getElement('closeHistoryPanelButton');
    if (closeHistoryPanelButton) {
        closeHistoryPanelButton.addEventListener('click', toggleHistory);
    }

    // 清空观看历史按钮
    const clearViewingHistoryButton = getElement('clearViewingHistoryButton');
    if (clearViewingHistoryButton) {
        clearViewingHistoryButton.addEventListener('click', clearViewingHistory);
    }

    // 关闭模态框按钮
    const closeModalButton = getElement('closeModalButton');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeModal);
    }

    // 优化：将委托事件监听器移到这里一次性设置
    // 搜索历史标签点击事件委托
    const recentSearches = getElement('recentSearches');
    if (recentSearches) {
        recentSearches.addEventListener('click', handleSearchTagClick);
    }

    // 观看历史列表点击事件委托
    const historyList = getElement('historyList');
    if (historyList) {
        historyList.addEventListener('click', handleHistoryListClick);
    }

    // 初始化其他可能的事件监听器
    initializeAdditionalListeners();
}

/**
 * 初始化其他可能的事件监听器
 */
function initializeAdditionalListeners() {
    // API选择按钮 - 保留单独的事件监听器
    // 注: 由于这些按钮数量有限且不会动态变化，使用单独的事件监听器更直接清晰
    // 如果未来这些按钮会动态增减，可考虑改为事件委托模式
    const apiSelectButtons = document.querySelectorAll('[data-action="selectAllAPIs"]');
    if (apiSelectButtons.length > 0) {
        const apiSelectHandler = function () {
            const selectAll = this.dataset.value === 'true';
            if (typeof window.selectAllAPIs === 'function') {
                window.selectAllAPIs(selectAll);
            }
        };

        apiSelectButtons.forEach(button => {
            button.addEventListener('click', apiSelectHandler);
        });
    }

    // 自定义API管理
    const addCustomApiButton = document.querySelector('[data-action="showAddCustomApiForm"]');
    if (addCustomApiButton && typeof window.showAddCustomApiForm === 'function') {
        addCustomApiButton.addEventListener('click', window.showAddCustomApiForm);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    // 初始化事件监听器
    attachEventListeners();

    // 初始化搜索历史
    renderSearchHistory();
    setupPanelAutoClose();
});

// 导出公共函数
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.closeModal = closeModal;
window.toggleSettings = toggleSettings;
window.toggleHistory = toggleHistory;
window.addToViewingHistory = addToViewingHistory;
window.clearViewingHistory = clearViewingHistory;
// window.playFromHistory = playFromHistory;
window.saveSearchHistory = saveSearchHistory;
window.clearSearchHistory = clearSearchHistory;
window.renderSearchHistory = renderSearchHistory;
window.deleteSingleSearchHistory = deleteSingleSearchHistory;

/**
 * 设置面板自动关闭功能
 * 当用户点击面板外区域时自动关闭面板
 */
function setupPanelAutoClose() {
    document.addEventListener('click', function (event) {
        // 检查是否点击了设置按钮或历史按钮
        const settingsButton = document.getElementById('settingsButton');
        const historyButton = document.getElementById('historyButton');
        const settingsPanel = document.getElementById('settingsPanel');
        const historyPanel = document.getElementById('historyPanel');

        // 如果点击的是设置按钮或设置面板内部，不做处理
        if (settingsButton && settingsButton.contains(event.target)) return;
        if (settingsPanel && settingsPanel.contains(event.target)) return;

        // 如果点击的是历史按钮或历史面板内部，不做处理
        if (historyButton && historyButton.contains(event.target)) return;
        if (historyPanel && historyPanel.contains(event.target)) return;

        // 关闭设置面板
        if (settingsPanel && settingsPanel.classList.contains('show')) {
            settingsPanel.classList.remove('show');
            settingsPanel.setAttribute('aria-hidden', 'true');
        }

        // 关闭历史面板
        if (historyPanel && historyPanel.classList.contains('show')) {
            historyPanel.classList.remove('show');
            historyPanel.setAttribute('aria-hidden', 'true');
        }
    });
}

// 在DOMContentLoaded事件中调用setupPanelAutoClose
document.addEventListener('DOMContentLoaded', function () {
    setupPanelAutoClose();
});

/**
 * 删除单条观看历史
 * @param {string} internalId 要删除的记录的 internalShowIdentifier
 */
function deleteHistoryItem(internalId) {
    try {
        let history = getViewingHistory();
        // 使用 internalShowIdentifier 来确保删除正确的条目
        const updatedHistory = history.filter(item => item.internalShowIdentifier !== internalId);

        if (history.length !== updatedHistory.length) {
            localStorage.setItem('viewingHistory', JSON.stringify(updatedHistory));
            loadViewingHistory(); // 重新渲染历史记录列表
            showToast('已删除该条记录', 'success');
        } else {
            showToast('未找到要删除的记录', 'warning');
        }
    } catch (e) {
        console.error('删除观看历史失败:', e);
        showToast('删除历史记录失败', 'error');
    }
}