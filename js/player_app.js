// 动态导入 VidstackPlayer
// import { PlyrLayout, VidstackPlayer } from 'https://cdn.vidstack.io/player'; //plyr layout
import { VidstackPlayer, VidstackPlayerLayout } from 'https://cdn.vidstack.io/player';

// --- 常量定义 ---
const SKIP_INTRO_KEY = 'skipIntroTime';
const SKIP_OUTRO_KEY = 'skipOutroTime';
const REMEMBER_EPISODE_PROGRESS_ENABLED_KEY = 'playerRememberEpisodeProgressEnabled';
const VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY = 'videoSpecificEpisodeProgresses';

// --- 全局变量 ---
let player = null;
let isNavigatingToEpisode = false;
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let autoplayEnabled = true;
let isUserSeeking = false;
let videoHasEnded = false;
let progressSaveInterval = null;
let isScreenLocked = false;
let nextSeekPosition = 0;
let vodIdForPlayer = '';
let currentVideoYear = '';
let currentVideoTypeName = '';
let lastFailedAction = null;
let availableAlternativeSources = [];
// 新增：用于存储广告过滤状态的全局变量
let adFilteringEnabled = false;

// 实用工具函数
function showToast(message, type = 'info', duration = 3000) {

    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;

    const bgColors = {
        'error': 'bg-red-500',
        'success': 'bg-green-500',
        'info': 'bg-blue-500',
        'warning': 'bg-yellow-500'
    };
    const bgColor = bgColors[type] || bgColors.info;

    toast.className = `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${bgColor} text-white z-[2147483647] pointer-events-none`;
    toastMessage.textContent = message;

    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.opacity = '0';
    }, duration);
}

function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) { return; }

    let bgColorClass = ({ error: 'bg-red-500', success: 'bg-green-500', warning: 'bg-yellow-500', info: 'bg-blue-500' })[type] || 'bg-blue-500';

    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm ${bgColorClass} text-white transition-opacity duration-300 opacity-0`;
    messageElement.textContent = text;
    messageElement.classList.remove('hidden');

    void messageElement.offsetWidth;
    messageElement.classList.add('opacity-100');

    if (messageElement._messageTimeout) clearTimeout(messageElement._messageTimeout);

    messageElement._messageTimeout = setTimeout(() => {
        messageElement.classList.remove('opacity-100');
        messageElement.classList.add('opacity-0');
        setTimeout(() => messageElement.classList.add('hidden'), 300);
    }, duration);
}


function showError(message) {
    const loadingEl = document.getElementById('loading');
    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold');
        if (errorTextElement) errorTextElement.textContent = message;
        errorElement.style.display = 'flex';
        if (loadingEl) {
            loadingEl.classList.remove('hidden');
            loadingEl.style.display = 'flex';
        }
    }
    showMessage(message, 'error');
}


function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getShowIdentifier(perEpisode = true) {
    const urlParams = new URLSearchParams(window.location.search);
    const sc = urlParams.get('source_code') || 'unknown_source';
    const vid = vodIdForPlayer || urlParams.get('id') || '';
    const ep = perEpisode ? `_ep${currentEpisodeIndex}` : '';

    if (vid) return `${currentVideoTitle}_${sc}_${vid}${ep}`;

    const raw = currentEpisodes[currentEpisodeIndex] || '';
    if (!raw) return `${currentVideoTitle}_${sc}${ep}`;

    const urlKey = raw.split('/').pop().split(/[?#]/)[0] || (raw.length > 32 ? raw.slice(-32) : raw);
    return `${currentVideoTitle}_${sc}_${urlKey}${ep}`;
}

function showProgressRestoreModal(opts) {
    return new Promise(resolve => {
        const modal = document.getElementById("progress-restore-modal");
        const contentDiv = modal?.querySelector('.progress-modal-content');
        const titleDiv = modal?.querySelector('.progress-modal-title');
        const btnCancel = modal?.querySelector('#progress-restore-cancel');
        const btnConfirm = modal?.querySelector('#progress-restore-confirm');
        if (!modal || !contentDiv || !titleDiv || !btnCancel || !btnConfirm) return resolve(false);

        titleDiv.textContent = opts.title || "继续播放？";
        contentDiv.innerHTML = opts.content || "";
        btnCancel.textContent = opts.cancelText || "取消";
        btnConfirm.textContent = opts.confirmText || "确定";

        function close(result) {
            modal.style.display = 'none';
            document.body.style.overflow = "";
            btnCancel.onclick = btnConfirm.onclick = null;
            document.removeEventListener("keydown", handler);
            resolve(result);
        }

        btnCancel.onclick = () => close(false);
        btnConfirm.onclick = () => close(true);

        function handler(e) {
            if (e.key === "Escape") close(false);
            if (e.key === "Enter") close(true);
        }

        modal.style.display = 'flex';
        setTimeout(() => btnConfirm.focus(), 120);
        document.addEventListener("keydown", handler);
        document.body.style.overflow = "hidden";
    });
}


// --- 新增：广告过滤核心逻辑 ---

/**
 * 根据广告过滤设置，异步处理视频URL。
 * @param {string} url 原始视频URL
 * @returns {Promise<string>} 处理后的视频URL (可能是原始URL或Blob URL)
 */
async function processVideoUrl(url) {
    // 如果未启用广告过滤，直接返回原始URL
    if (!adFilteringEnabled) {
        return url;
    }

    try {
        // 步骤 1: 手动获取M3U8文件
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`无法获取M3U8文件，状态码: ${response.status}`);
        }
        let m3u8Text = await response.text();

        // 步骤 2: 过滤M3U8内容
        // 这是一个通用的过滤规则，主要移除广告插入点。
        // 您可能需要根据视频源的广告特征进行调整。
        const adPatterns = [
            /#EXT-X-DISCONTINUITY/gi,       // 常见广告插入标记
            /MOMENT-START/gi,               // 某些源的广告标记
            /https?:\/\/.*\.(ts|jpg|gif|png)\?ad=/gi // 过滤带ad参数的链接
        ];

        let lines = m3u8Text.split('\n');
        let cleanLines = [];
        let isAdSegment = false;

        for (const line of lines) {
            // 检查当前行是否是广告标记
            if (adPatterns.some(pattern => pattern.test(line))) {
                isAdSegment = true;
                continue; // 跳过广告标记行
            }

            // 如果是广告片段，则跳过
            if (isAdSegment && (line.trim().endsWith('.ts') || line.trim().endsWith('.jpg'))) {
                // 在下一个非广告片段开始时重置
                if (!adPatterns.some(pattern => pattern.test(line))) {
                    isAdSegment = false;
                }
                continue;
            }

            cleanLines.push(line);
        }

        const cleanM3u8Text = cleanLines.join('\n');

        // 步骤 3 & 4: 创建Blob和Blob URL
        const blob = new Blob([cleanM3u8Text], { type: 'application/vnd.apple.mpegurl' });
        const blobUrl = URL.createObjectURL(blob);

        console.log("广告过滤已应用，使用新的Blob URL进行播放。");
        return blobUrl;

    } catch (error) {
        console.error("广告过滤失败:", error);
        showToast("广告过滤失败，将播放原始视频", "warning");
        return url; // 过滤失败时，返回原始URL
    }
}


// --- 播放器核心逻辑 ---

async function initPlayer(videoUrl, title) {
    const playerContainer = document.getElementById('player');
    if (!playerContainer) {
        showError("播放器容器 (#player) 未找到");
        return;
    }

    if (player) {
        // 清理旧的Blob URL
        if (player.currentSrc && player.currentSrc.startsWith('blob:')) {
            URL.revokeObjectURL(player.currentSrc);
        }
        player.destroy();
        player = null;
    }

    // 【修改】在创建播放器前处理URL
    const processedUrl = await processVideoUrl(videoUrl);

    try {
        player = await VidstackPlayer.create({
            target: playerContainer,
            // 【修改】使用处理过的URL
            src: { src: processedUrl, type: 'application/x-mpegurl' },
            title: title,
            autoplay: true,
            preload: 'auto',
            layout: new VidstackPlayerLayout(),
            // layout: new PlyrLayout(),
            // controls: true,
            playsInline: true,
            crossOrigin: true,
            layout: new VidstackPlayerLayout(),
            keyTarget: 'document',
            keyShortcuts: {
                togglePaused: 'k Space',
                toggleMuted: 'm',
                togglePictureInPicture: 'i',
                // toggleFullscreen: 'f',
                seekBackward: ['j', 'J', 'ArrowLeft'],
                seekForward: ['l', 'L', 'ArrowRight'],
                volumeUp: 'ArrowUp',
                volumeDown: 'ArrowDown',
                speedUp: '>',
                slowDown: '<',
            }
        });
        window.player = player;
        addPlayerEventListeners();
        handleSkipIntroOutro(player);
    } catch (error) {
        console.error("Vidstack Player 创建失败:", error);
        showError("播放器初始化失败");
    }
}

function addPlayerEventListeners() {
    if (!player) return;

    player.addEventListener('fullscreen-change', (event) => {
        const isFullscreen = event.detail;
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton) {
            fsButton.innerHTML = isFullscreen ?
                `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>` :
                `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
            fsButton.setAttribute('aria-label', isFullscreen ? '退出全屏' : '全屏');
        }
    });

    player.addEventListener('loaded-metadata', () => {
        document.getElementById('loading').style.display = 'none';
        videoHasEnded = false;
        handleSkipIntroOutro(player);
        if (nextSeekPosition > 0 && player.duration > 0 && nextSeekPosition < player.duration) {
            player.currentTime = nextSeekPosition;
            showMessage(`已从 ${formatPlayerTime(nextSeekPosition)} 继续播放`, 'info');
        }
        nextSeekPosition = 0;
        saveToHistory();
        startProgressSaveInterval();
        isNavigatingToEpisode = false;
    });

    player.addEventListener('contextmenu', (event) => {
        if (isScreenLocked) {
            event.preventDefault();
            showMessage('屏幕已锁定，请先解锁', 'info', 2000);
        }
    });

    player.addEventListener('error', (event) => {
        console.error("Vidstack Player Error:", event.detail);
        showError('播放器遇到错误，请检查视频源');
    });

    player.addEventListener('end', () => {
        videoHasEnded = true;
        saveCurrentProgress();
        clearVideoProgressForEpisode(currentEpisodeIndex);
        if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
            setTimeout(() => {
                if (videoHasEnded && !isUserSeeking) playNextEpisode();
            }, 1000);
        }
    });

    player.addEventListener('seeking', () => { isUserSeeking = true; });
    player.addEventListener('seeked', () => {
        setTimeout(() => { isUserSeeking = false; }, 200);
        saveVideoSpecificProgress();
    });
    player.addEventListener('pause', saveVideoSpecificProgress);
}

async function playEpisode(index) {
    if (isNavigatingToEpisode || index < 0 || index >= currentEpisodes.length) {
        return;
    }

    if (player && player.currentTime > 5) {
        saveVideoSpecificProgress();
    }

    isNavigatingToEpisode = true;

    const rememberOn = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY) !== 'false';
    if (rememberOn) {
        const showId = getShowIdentifier(false);
        const allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgress = allProgress[showId]?.[index];

        if (savedProgress && savedProgress > 5) {
            const wantsToResume = await showProgressRestoreModal({
                title: "继续播放？",
                content: `《${currentVideoTitle}》第 ${index + 1}，<br> <span style="color:#00ccff">${formatPlayerTime(savedProgress)}</span> `,
                confirmText: "YES",
                cancelText: "NO"
            });

            if (wantsToResume) {
                nextSeekPosition = savedProgress;
            } else {
                clearVideoProgressForEpisode(index);
                nextSeekPosition = 0;
            }
        } else {
            nextSeekPosition = 0;
        }
    } else {
        nextSeekPosition = 0;
    }

    doEpisodeSwitch(index, currentEpisodes[index]);
}

async function doEpisodeSwitch(index, url) {
    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index;

    updateUIForNewEpisode();
    updateBrowserHistory(url);

    if (player) {
        // 【修改】切换剧集时也要经过URL处理
        const processedUrl = await processVideoUrl(url);
        player.src = { src: processedUrl, type: 'application/x-mpegurl' };
        player.play().catch(e => console.warn("Autoplay after episode switch was prevented.", e));
    }
}


(async function initializePage() {
    document.addEventListener('DOMContentLoaded', async () => {
        const urlParams = new URLSearchParams(window.location.search);

        // 【修改】读取 af 参数
        adFilteringEnabled = urlParams.get('af') === '1';

        let episodeUrlForPlayer = urlParams.get('url');

        function fullyDecode(str) {
            try {
                let prev, cur = str;
                do { prev = cur; cur = decodeURIComponent(cur); } while (cur !== prev);
                return cur;
            } catch { return str; }
        }
        currentVideoTitle = urlParams.get('title') ? fullyDecode(urlParams.get('title')) : '视频播放';
        currentEpisodeIndex = parseInt(urlParams.get('index') || '0', 10);
        vodIdForPlayer = urlParams.get('id') || '';
        currentVideoYear = urlParams.get('year') || '';
        currentVideoTypeName = urlParams.get('typeName') || '';

        const sourceMapJSON = sessionStorage.getItem('videoSourceMap');
        if (sourceMapJSON) {
            try {
                const sourceMap = JSON.parse(sourceMapJSON);
                const videoKey = urlParams.get('videoKey');
                if (videoKey && sourceMap[videoKey]) {
                    availableAlternativeSources = sourceMap[videoKey];
                } else {
                    const titleParam = urlParams.get('title') ? decodeURIComponent(urlParams.get('title')) : '';
                    const yearParam = urlParams.get('year') || '';
                    const fallbackKey = `${titleParam}|${yearParam}`;
                    if (sourceMap[fallbackKey]) {
                        availableAlternativeSources = sourceMap[fallbackKey];
                    } else {
                        for (const key in sourceMap) {
                            if (key.startsWith(`${titleParam}|`)) {
                                availableAlternativeSources = sourceMap[key];
                                break;
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("从 sessionStorage 读取线路失败:", e);
                availableAlternativeSources = [];
            }
        }

        try {
            currentEpisodes = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
            if (!episodeUrlForPlayer && currentEpisodes[currentEpisodeIndex]) {
                episodeUrlForPlayer = currentEpisodes[currentEpisodeIndex];
            }
        } catch {
            currentEpisodes = [];
        }

        window.currentEpisodes = currentEpisodes;
        window.currentEpisodeIndex = currentEpisodeIndex;

        setupAllUI();

        const positionFromUrl = urlParams.get('position');
        if (positionFromUrl) {
            nextSeekPosition = parseInt(positionFromUrl);
        } else {
            const rememberOn = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY) !== 'false';
            if (rememberOn) {
                const showId = getShowIdentifier(false);
                const allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                const savedProgress = allProgress[showId]?.[currentEpisodeIndex];

                if (savedProgress && savedProgress > 5) {
                    const wantsToResume = await showProgressRestoreModal({
                        title: "继续播放？",
                        content: `《${currentVideoTitle}》第 ${currentEpisodeIndex + 1} 集，<br> <span style="color:#00ccff">${formatPlayerTime(savedProgress)}</span> `,
                        confirmText: "YES",
                        cancelText: "NO"
                    });

                    if (wantsToResume) {
                        nextSeekPosition = savedProgress;
                    } else {
                        clearVideoProgressForEpisode(currentEpisodeIndex);
                        nextSeekPosition = 0;
                    }
                }
            }
        }

        if (episodeUrlForPlayer) {
            await initPlayer(episodeUrlForPlayer, currentVideoTitle);
        } else {
            showError('没有可播放的视频链接。');
        }
    });
})();

// ... 此处省略其他所有未改变的函数，如 setupAllUI, updateUIForNewEpisode, updateBrowserHistory, etc. ...
// 请将您文件中从 setupAllUI 开始到文件末尾的所有函数粘贴到这里
function setupAllUI() {
    updateEpisodeInfo();
    renderEpisodes();
    setupPlayerControls();
    updateButtonStates();
    updateOrderButton();
    setupLineSwitching();
    setupSkipControls();
    setupSkipDropdownEvents();
    setupRememberEpisodeProgressToggle();
    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', () => {
        saveCurrentProgress();
        saveVideoSpecificProgress();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
            saveVideoSpecificProgress();
        }
    });
}

function updateUIForNewEpisode() {
    updateEpisodeInfo();
    renderEpisodes();
    updateButtonStates();
}

function updateBrowserHistory(newEpisodeUrl) {
    const newUrlForBrowser = new URL(window.location.href);
    newUrlForBrowser.searchParams.set('url', newEpisodeUrl);
    newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());
    newUrlForBrowser.searchParams.delete('position');
    window.history.pushState({ path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex }, '', newUrlForBrowser.toString());
}

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) backButton.addEventListener('click', () => { window.location.href = 'index.html'; });

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (player) {
                if (player.state.fullscreen) {
                    player.exitFullscreen();
                } else {
                    player.enterFullscreen();
                }
            }
        });
    }

    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', retryLastAction);
    }

    const prevEpisodeBtn = document.getElementById('prev-episode');
    if (prevEpisodeBtn) prevEpisodeBtn.addEventListener('click', playPreviousEpisode);

    const nextEpisodeBtn = document.getElementById('next-episode');
    if (nextEpisodeBtn) nextEpisodeBtn.addEventListener('click', playNextEpisode);

    const orderBtn = document.getElementById('order-button');
    if (orderBtn) orderBtn.addEventListener('click', toggleEpisodeOrder);

    const lockButton = document.getElementById('lock-button');
    if (lockButton) lockButton.addEventListener('click', toggleLockScreen);
}


function handleKeyboardShortcuts(e) {
    if (!player || (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName))) return;

    if (isScreenLocked && !['f', 'F', 'Escape'].includes(e.key)) {
        e.preventDefault();
        return;
    }

    let actionText = '';

    switch (e.key) {
        case 'ArrowLeft':
            // e.preventDefault(); // REMOVE THIS LINE
            if (e.altKey) {
                playPreviousEpisode();
                actionText = '上一集';
            }
            //else {
            //   player.currentTime -= 10;
            //  actionText = '后退 10s';
            //  }

            break;

        case 'ArrowRight':
            // e.preventDefault(); // REMOVE THIS LINE

            if (e.altKey) {
                playNextEpisode();
                actionText = '下一集';
            }
            //else {
            //   player.currentTime += 10;
            //   actionText = '前进 10s';
            //}
            break;

        case 'f':
        case 'F':
            // e.preventDefault(); // REMOVE THIS LINE
            if (player) {
                if (player.state.fullscreen) {
                    player.exitFullscreen();
                } else {
                    player.enterFullscreen();
                }
                actionText = '切换全屏';
            }
            break;
    }

    if (actionText) {
        showToast(actionText, 'info', 1500);
    }
}

function saveToHistory() {
    if (!player || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            vod_id: vodIdForPlayer || '',
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            episodes: window.currentEpisodes,
            playbackPosition: Math.floor(player.currentTime),
            duration: Math.floor(player.duration) || 0,
            timestamp: Date.now()
        };
        window.addToViewingHistory(videoInfo);
    } catch (e) {
        console.error('保存到历史记录失败:', e);
    }
}

function saveCurrentProgress() {
    if (!player || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = player.currentTime;
    const duration = player.duration;
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) {
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex],
                episodeIndex: window.currentEpisodeIndex,
                vod_id: vodIdForPlayer || '',
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
                sourceName: new URLSearchParams(window.location.search).get('source') || '',
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                episodes: window.currentEpisodes
            };
            window.addToViewingHistory(videoInfo);
        } catch (e) {
            console.error('保存播放进度失败:', e);
        }
    }
}

function saveVideoSpecificProgress() {
    if (isNavigatingToEpisode) return;
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle || !toggle.checked || !player) return;

    const currentTime = Math.floor(player.currentTime);
    const duration = Math.floor(player.duration);
    const showId = getShowIdentifier(false);

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.95) {
        try {
            let allShowsProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            if (!allShowsProgresses[showId]) allShowsProgresses[showId] = {};
            allShowsProgresses[showId][currentEpisodeIndex.toString()] = currentTime;
            allShowsProgresses[showId].lastPlayedEpisodeIndex = currentEpisodeIndex;
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allShowsProgresses));
        } catch (e) {
            console.error('保存特定视频集数进度失败:', e);
        }
    }
}

function startProgressSaveInterval() {
    if (progressSaveInterval) clearInterval(progressSaveInterval);
    progressSaveInterval = setInterval(() => {
        saveCurrentProgress();
        saveVideoSpecificProgress();
    }, 8000);
}

function clearVideoProgressForEpisode(episodeIndex) {
    try {
        const showId = getShowIdentifier(false);
        let allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');

        if (allProgress[showId] && allProgress[showId][episodeIndex] !== undefined) {
            delete allProgress[showId][episodeIndex];
            const keys = Object.keys(allProgress[showId]);
            if (keys.length === 0 || (keys.length === 1 && keys[0] === 'lastPlayedEpisodeIndex')) {
                delete allProgress[showId];
            }
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgress));
        }
    } catch (e) {
        console.error(`清除第 ${episodeIndex + 1} 集的进度失败:`, e);
    }
}

function clearCurrentVideoAllEpisodeProgresses() {
    try {
        const showId = getShowIdentifier(false);
        let allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        if (allProgress[showId]) {
            delete allProgress[showId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgress));
        }
    } catch (e) {
        console.error('清除当前视频所有集数进度失败:', e);
    }
}

function renderEpisodes() {
    const grid = document.getElementById('episode-grid');
    if (!grid) { setTimeout(renderEpisodes, 100); return; }
    const container = document.getElementById('episodes-container');
    if (container) {
        container.classList.toggle('hidden', currentEpisodes.length <= 1);
    }
    const countSpan = document.getElementById('episodes-count');
    if (countSpan) countSpan.textContent = `共 ${currentEpisodes.length} 集`;
    grid.innerHTML = '';
    if (!currentEpisodes.length) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }
    const order = [...Array(currentEpisodes.length).keys()];
    if (episodesReversed) order.reverse();
    order.forEach(idx => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = idx === currentEpisodeIndex ? 'p-2 rounded episode-active' : 'p-2 rounded bg-[#222] hover:bg-[#333] text-gray-300';
        btn.textContent = idx + 1;
        btn.dataset.index = idx;
        grid.appendChild(btn);
    });
    if (!grid._sListenerBound) {
        grid.addEventListener('click', evt => {
            const target = evt.target.closest('button[data-index]');
            if (target) playEpisode(+target.dataset.index);
        });
        grid._sListenerBound = true;
    }
    updateEpisodeInfo();
    updateButtonStates();
}

function updateEpisodeInfo() {
    const episodeInfoSpan = document.getElementById('episode-info-span');
    if (!episodeInfoSpan) return;
    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    const totalEpisodes = window.currentEpisodes ? window.currentEpisodes.length : 0;
    if (currentVideoTitle && totalEpisodes > 1) {
        document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    } else if (currentVideoTitle) {
        document.title = `${currentVideoTitle} - ${siteName}`;
    } else {
        document.title = siteName;
    }
    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        const currentDisplayNumber = window.currentEpisodeIndex + 1;
        episodeInfoSpan.textContent = `第 ${currentDisplayNumber} / ${totalEpisodes} 集`;
        const episodesCountEl = document.getElementById('episodes-count');
        if (episodesCountEl) episodesCountEl.textContent = `共 ${totalEpisodes} 集`;
    } else {
        episodeInfoSpan.textContent = '';
    }
}

function updateButtonStates() {
    const prevButton = document.getElementById('prev-episode');
    const nextButton = document.getElementById('next-episode');
    const totalEpisodes = window.currentEpisodes ? window.currentEpisodes.length : 0;
    if (prevButton) {
        prevButton.disabled = window.currentEpisodeIndex <= 0;
        prevButton.classList.toggle('opacity-50', prevButton.disabled);
        prevButton.classList.toggle('cursor-not-allowed', prevButton.disabled);
    }
    if (nextButton) {
        nextButton.disabled = window.currentEpisodeIndex >= totalEpisodes - 1;
        nextButton.classList.toggle('opacity-50', nextButton.disabled);
        nextButton.classList.toggle('cursor-not-allowed', nextButton.disabled);
    }
}

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    updateOrderButton();
    renderEpisodes();
}

function updateOrderButton() {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    icon.innerHTML = episodesReversed ?
        '<polyline points="18 15 12 9 6 15"></polyline>' :
        '<polyline points="6 9 12 15 18 9"></polyline>';
}

function copyLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || (player ? player.src : '');
    if (!linkUrl) {
        if (typeof showToast === 'function') showToast('没有可复制的视频链接', 'warning');
        return;
    }
    navigator.clipboard.writeText(linkUrl).then(() => {
        if (typeof showToast === 'function') showToast('当前视频链接已复制', 'success');
    }).catch(err => {
        console.error('复制链接失败:', err);
        if (typeof showToast === 'function') showToast('复制失败，请检查浏览器权限', 'error');
    });
}

function toggleLockScreen() {
    if (!player) {
        console.warn("播放器未初始化，无法锁定屏幕。");
        return;
    }
    isScreenLocked = !isScreenLocked;
    player.keyDisabled = isScreenLocked;
    const playerContainer = document.querySelector('.player-container');
    const lockIcon = document.getElementById('lock-icon');
    const elementsToToggle = document.querySelectorAll('.plyr, .plyr__controls, .vds-controls, .vds-gestures, header, .player-control-bar, #episodes-container, #prev-episode, #next-episode');

    if (playerContainer) {
        playerContainer.classList.toggle('player-locked', isScreenLocked);
    }
    elementsToToggle.forEach(el => {
        if (el) {
            el.inert = isScreenLocked;
        }
    });

    if (lockIcon) {
        if (isScreenLocked) {
            lockIcon.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>`;
            showMessage('屏幕已锁定', 'info', 2500);
        } else {
            lockIcon.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>`;
            showMessage('屏幕已解锁', 'info', 1500);
        }
    }

    const mediaElement = player.querySelector('video');
    if (mediaElement) {
        mediaElement.removeEventListener('click', handleMediaClick);
        if (isScreenLocked) {
            mediaElement.addEventListener('click', handleMediaClick);
        }
    }
}

function handleMediaClick(e) {
    e.stopPropagation();
    if (!player) return;
    if (player.paused) {
        player.play();
    } else {
        player.pause();
    }
    showToast(player.paused ? '播放' : '暂停', 'info', 1000);
}

function handleSkipIntroOutro(playerInstance) {
    if (!playerInstance) return;
    const skipIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    if (skipIntroTime > 0) {
        playerInstance.addEventListener('loaded-metadata', () => {
            if (playerInstance.duration > skipIntroTime && playerInstance.currentTime < skipIntroTime) {
                playerInstance.currentTime = skipIntroTime;
                if (typeof showToast === 'function') showToast(`已跳过${skipIntroTime}秒片头`, 'info');
            }
        }, { once: true });
    }
    const skipOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
    if (skipOutroTime > 0) {
        playerInstance.addEventListener('time-update', () => {
            if (!playerInstance || playerInstance.paused) return;
            const remain = playerInstance.duration - playerInstance.currentTime;
            if (remain <= skipOutroTime) {
                if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
                    playNextEpisode();
                } else {
                    playerInstance.pause();
                    if (typeof showToast === 'function') showToast(`已跳过${skipOutroTime}秒片尾`, 'info');
                }
            }
        });
    }
}

function setupSkipControls() {
    const skipButton = document.getElementById('skip-control-button');
    const dropdown = document.getElementById('skip-control-dropdown');
    const skipIntroInput = document.getElementById('skip-intro-input');
    const skipOutroInput = document.getElementById('skip-outro-input');
    const applyBtn = document.getElementById('apply-skip-settings');
    const resetBtn = document.getElementById('reset-skip-settings');
    if (!skipButton || !dropdown || !skipIntroInput || !skipOutroInput || !applyBtn || !resetBtn) return;
    skipButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const lineDropdown = document.getElementById('line-switch-dropdown');
        if (lineDropdown) lineDropdown.classList.add('hidden');
        dropdown.classList.toggle('hidden');
    });
    applyBtn.addEventListener('click', () => {
        const introTime = parseInt(skipIntroInput.value) || 0;
        const outroTime = parseInt(skipOutroInput.value) || 0;
        localStorage.setItem(SKIP_INTRO_KEY, introTime);
        localStorage.setItem(SKIP_OUTRO_KEY, outroTime);
        if (typeof showToast === 'function') showToast('跳过时间设置已保存', 'success');
        dropdown.classList.add('hidden');
    });
    resetBtn.addEventListener('click', () => {
        localStorage.removeItem(SKIP_INTRO_KEY);
        localStorage.removeItem(SKIP_OUTRO_KEY);
        skipIntroInput.value = '';
        skipOutroInput.value = '';
        if (typeof showToast === 'function') showToast('跳过时间设置已重置', 'success');
    });
    const savedIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    const savedOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
    skipIntroInput.value = savedIntroTime > 0 ? savedIntroTime : '';
    skipOutroInput.value = savedOutroTime > 0 ? savedOutroTime : '';
}

function setupSkipDropdownEvents() {
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('skip-control-dropdown');
        const skipButton = document.getElementById('skip-control-button');
        if (dropdown && !dropdown.classList.contains('hidden') && !skipButton.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

function setupLineSwitching() {
    const button = document.getElementById('line-switch-button');
    const dropdown = document.getElementById('line-switch-dropdown');
    if (!button || !dropdown) return;
    const showLinesFromCache = (event) => {
        event.stopPropagation();
        const skipDropdown = document.getElementById('skip-control-dropdown');
        if (skipDropdown) skipDropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        const currentSourceCode = new URLSearchParams(window.location.search).get('source_code');
        if (availableAlternativeSources.length > 1) {
            availableAlternativeSources.forEach(source => {
                const item = document.createElement('button');
                item.textContent = source.name;
                item.dataset.sourceCode = source.code;
                item.dataset.vodId = source.vod_id;
                item.className = 'w-full text-left px-3 py-2 rounded text-sm transition-colors hover:bg-gray-700';
                if (source.code === currentSourceCode) {
                    item.classList.add('line-active', 'bg-blue-600', 'text-white');
                    item.disabled = true;
                } else {
                    item.classList.add('text-gray-300');
                }
                dropdown.appendChild(item);
            });
        } else {
            dropdown.innerHTML = `<div class="text-center text-sm text-gray-500 py-2">无其他可用线路</div>`;
        }
        dropdown.classList.toggle('hidden');
    };
    if (!button._lineSwitchListenerAttached) {
        button.addEventListener('click', showLinesFromCache);
        button._lineSwitchListenerAttached = true;
    }
    if (!dropdown._actionListener) {
        dropdown.addEventListener('click', (e) => {
            const target = e.target.closest('button[data-source-code]');
            if (target && !target.disabled) {
                dropdown.classList.add('hidden');
                switchLine(target.dataset.sourceCode, target.dataset.vodId);
            }
        });
        dropdown._actionListener = true;
    }
    if (!document._docClickListenerForLineSwitch) {
        document.addEventListener('click', (e) => {
            if (!dropdown.classList.contains('hidden') && !button.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
        document._docClickListenerForLineSwitch = true;
    }
}

async function switchLine(newSourceCode, newVodId) {
    if (!player || !currentVideoTitle) {
        showError("无法切换线路：播放器或视频信息丢失");
        return;
    }
    if (!newVodId) {
        showError("切换失败：缺少目标视频ID。");
        return;
    }
    const timeToSeek = player.currentTime;
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    if (loadingEl) loadingEl.style.display = 'flex';
    if (errorEl) errorEl.style.display = 'none';
    let apiInfo;
    try {
        apiInfo = APISourceManager.getSelectedApi(newSourceCode);
        if (!apiInfo) throw new Error(`未找到线路 ${newSourceCode} 的信息`);
        let detailUrl = `/api/detail?id=${newVodId}&source=${newSourceCode}`;
        if (apiInfo.isCustom) {
            detailUrl += `&customApi=${encodeURIComponent(apiInfo.url)}`;
        }
        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();
        if (detailData.code !== 200 || !detailData.episodes || detailData.episodes.length === 0) {
            throw new Error(`在线路“${apiInfo.name}”上获取剧集列表失败`);
        }
        const newEpisodes = detailData.episodes;
        if (currentEpisodeIndex >= newEpisodes.length) {
            throw new Error(`新线路的剧集数(${newEpisodes.length})少于当前集数(${currentEpisodeIndex + 1})`);
        }
        const newEpisodeUrl = newEpisodes[currentEpisodeIndex];
        currentEpisodes = newEpisodes;
        window.currentEpisodes = newEpisodes;
        localStorage.setItem('currentEpisodes', JSON.stringify(newEpisodes));
        const newUrlForBrowser = new URL(window.location.href);
        newUrlForBrowser.searchParams.set('source_code', newSourceCode);
        newUrlForBrowser.searchParams.set('source', apiInfo.name);
        newUrlForBrowser.searchParams.set('id', newVodId);
        newUrlForBrowser.searchParams.set('url', newEpisodeUrl);
        window.history.replaceState({}, '', newUrlForBrowser.toString());
        nextSeekPosition = timeToSeek;
        const processedUrl = await processVideoUrl(newEpisodeUrl); // 切换时也处理
        player.src = { src: processedUrl, type: 'application/x-mpegurl' };
        player.play();
        renderEpisodes();
        showMessage(`已切换到线路: ${apiInfo.name}`, 'success');
        if (loadingEl) loadingEl.style.display = 'none';
    } catch (err) {
        console.error("切换线路失败:", err);
        lastFailedAction = { type: 'switchLine', payload: { sourceCode: newSourceCode, vodId: newVodId } };
        const lineName = apiInfo ? apiInfo.name : '未知线路';
        const errorMessage = err.message.includes(lineName) ? err.message : `在“${lineName}”上切换失败: ${err.message}`;
        showError(errorMessage);
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
    }
}

function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
    }
}

function setupRememberEpisodeProgressToggle() {
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle) return;
    const savedSetting = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY);
    toggle.checked = savedSetting !== 'false';
    toggle.addEventListener('change', function (event) {
        const isChecked = event.target.checked;
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, isChecked.toString());
        const messageText = isChecked ? '将记住本视频的各集播放进度' : '将不再记住本视频的各集播放进度';
        showMessage(messageText, 'info');
        if (!isChecked) {
            clearCurrentVideoAllEpisodeProgresses();
        }
    });
}

function retryLastAction() {
    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'none';
    if (!lastFailedAction) {
        return;
    }
    if (lastFailedAction.type === 'switchLine') {
        const { sourceCode, vodId } = lastFailedAction.payload;
        console.log(`重试：切换到线路 ${sourceCode} (ID: ${vodId})`);
        lastFailedAction = null;
        switchLine(sourceCode, vodId);
    } else {
        console.log("重试：未知操作类型，执行默认重载。");
        lastFailedAction = null;
        if (player && player.currentSrc) {
            player.src = player.currentSrc;
            player.play();
        }
    }
}

window.playNextEpisode = playNextEpisode;
window.playPreviousEpisode = playPreviousEpisode;
window.copyLinks = copyLinks;
window.toggleEpisodeOrder = toggleEpisodeOrder;
window.toggleLockScreen = toggleLockScreen;