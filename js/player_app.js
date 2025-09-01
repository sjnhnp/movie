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
let adFilteringEnabled = false;
let universalId = '';
let isWebFullscreen = false;

// 网页全屏功能
function toggleWebFullscreen() {
    const playerContainer = document.querySelector('.player-container');
    const playerRegion = document.getElementById('player-region');

    // 切换状态
    isWebFullscreen = !isWebFullscreen;
    console.log(`Toggling web fullscreen. New state: ${isWebFullscreen}`);

    if (isWebFullscreen) {
        // 进入网页全屏
        playerContainer.style.position = 'fixed';
        playerContainer.style.top = '0';
        playerContainer.style.left = '0';
        playerContainer.style.width = '100vw';
        playerContainer.style.height = '100vh';
        playerContainer.style.zIndex = '9999';
        playerContainer.style.background = '#000';

        playerRegion.style.height = '100vh';

        // 隐藏其他元素，包括顶部导航栏
        const elementsToHide = [
            'header',
            '.flex.items-center.justify-between.p-6',
            '.p-6.bg-white\\/5',
            '#episodes-container'
        ];

        elementsToHide.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.style.display = 'none';
            });
        });

        // 添加网页全屏状态CSS类
        document.body.classList.add('web-fullscreen-active');
        playerContainer.classList.add('web-fullscreen-active');

        addWebFullscreenExitHint();
        showToast('已进入网页全屏，按W或ESC键退出', 'info', 3000);
    } else {
        // 退出网页全屏
        playerContainer.style.position = '';
        playerContainer.style.top = '';
        playerContainer.style.left = '';
        playerContainer.style.width = '';
        playerContainer.style.height = '';
        playerContainer.style.zIndex = '';
        playerContainer.style.background = '';

        playerRegion.style.height = '60vh';

        // 显示其他元素
        const elementsToShow = [
            'header',
            '.flex.items-center.justify-between.p-6',
            '.p-6.bg-white\\/5',
            '#episodes-container'
        ];

        elementsToShow.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.style.display = '';
            });
        });

        // 移除网页全屏状态CSS类
        document.body.classList.remove('web-fullscreen-active');
        if (playerContainer) {
            playerContainer.classList.remove('web-fullscreen-active');
        }

        removeWebFullscreenExitHint();
        showToast('已退出网页全屏', 'info', 1500);
    }
    // 统一在函数末尾更新按钮状态
    updateWebFullscreenControlButton();
}

// 添加网页全屏键盘快捷键支持
function addWebFullscreenKeyboardShortcut() {
    // 避免重复添加事件监听器
    if (window.webFullscreenKeyboardAdded) return;
    window.webFullscreenKeyboardAdded = true;

    document.addEventListener('keydown', (event) => {
        // 检查是否在输入框中，如果是则不处理快捷键
        const activeElement = document.activeElement;
        if (activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        )) {
            return;
        }

        // W键切换网页全屏
        if (event.key === 'w' || event.key === 'W') {
            event.preventDefault();
            toggleWebFullscreen();
        }

        // ESC键仅在网页全屏模式下退出
        if (event.key === 'Escape' && isWebFullscreen) {
            event.preventDefault();
            toggleWebFullscreen(); // 调用同一个函数来处理退出逻辑
        }
    });
}

// 添加网页全屏退出提示
function addWebFullscreenExitHint() {
    // 避免重复添加
    if (document.getElementById('web-fullscreen-exit-hint')) return;

    const playerRegion = document.getElementById('player-region');
    if (!playerRegion) return;

    // 创建退出提示元素
    const exitHint = document.createElement('div');
    exitHint.id = 'web-fullscreen-exit-hint';
    exitHint.innerHTML = `
        <div style="
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            z-index: 10000;
            pointer-events: none;
            backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            opacity: 0;
            transition: opacity 0.3s ease;
        ">
            按 W 或 ESC 键退出网页全屏
        </div>
    `;

    playerRegion.appendChild(exitHint);

    // 显示提示
    setTimeout(() => {
        const hint = exitHint.querySelector('div');
        if (hint) hint.style.opacity = '1';
    }, 100);

    // 3秒后自动隐藏
    setTimeout(() => {
        const hint = exitHint.querySelector('div');
        if (hint) hint.style.opacity = '0';
        // 动画结束后移除元素，保持DOM清洁
        setTimeout(() => exitHint.remove(), 300);
    }, 3000);
}

// 移除网页全屏退出提示
function removeWebFullscreenExitHint() {
    const exitHint = document.getElementById('web-fullscreen-exit-hint');
    if (exitHint) {
        exitHint.remove();
    }
}

// 初始化自定义右侧控制条
function initCustomRightControls() {
    // 避免重复初始化
    if (window.customRightControlsInitialized) return;
    window.customRightControlsInitialized = true;

    const webFullscreenBtn = document.getElementById('web-fullscreen-control-btn');
    const isMobile = () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || /Mobi|Android/i.test(navigator.userAgent);

    if (isMobile() && webFullscreenBtn) {
        webFullscreenBtn.style.display = 'none'; // 在移动端默认隐藏

        let longPressTimer;
        let touchStartX;
        let touchStartY;

        const playerRegion = document.getElementById('player-region');

        if (playerRegion) {
            const handleTouchStart = (e) => {
                if (e.touches.length === 1) { // 仅处理单指触摸
                    const touch = e.touches[0];
                    touchStartX = touch.clientX;
                    touchStartY = touch.clientY;

                    // 如果触摸点在已经显示的按钮上，则不启动计时器，允许用户直接点击
                    if (webFullscreenBtn.contains(e.target)) {
                        clearTimeout(longPressTimer);
                        return;
                    }

                    longPressTimer = setTimeout(() => {
                        webFullscreenBtn.style.display = 'block'; // 长按后显示按钮

                        // 3秒后自动隐藏
                        setTimeout(() => {
                            if (webFullscreenBtn) {
                                webFullscreenBtn.style.display = 'none';
                            }
                        }, 3000);
                    }, 500); // 500毫秒定义为长按
                }
            };

            const handleTouchMove = (e) => {
                if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    // 如果手指移动超过10像素，则取消长按计时器
                    if (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10) {
                        clearTimeout(longPressTimer);
                    }
                }
            };

            const handleTouchEnd = () => {
                clearTimeout(longPressTimer);
            };

            playerRegion.addEventListener('touchstart', handleTouchStart);
            playerRegion.addEventListener('touchmove', handleTouchMove);
            playerRegion.addEventListener('touchend', handleTouchEnd);
            playerRegion.addEventListener('touchcancel', handleTouchEnd); // 处理触摸取消事件
        }
    }

    // 绑定网页全屏按钮点击事件
    if (webFullscreenBtn) {
        webFullscreenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWebFullscreen();
        });
    }

    // 监听播放器状态变化，同步右侧控制条显示/隐藏
    if (player) {
        // 监听播放器控制条显示/隐藏事件
        player.addEventListener('controls-change', (event) => {
            const rightControls = document.getElementById('custom-right-controls');
            if (rightControls) {
                if (event.detail) {
                    rightControls.style.opacity = '1';
                    rightControls.style.pointerEvents = 'auto';
                } else {
                    rightControls.style.opacity = '0';
                    rightControls.style.pointerEvents = 'none';
                }
            }
        });

        // 监听鼠标进入/离开播放器区域
        const playerRegion = document.getElementById('player-region');
        if (playerRegion) {
            let hideTimeout;

            playerRegion.addEventListener('mouseenter', () => {
                clearTimeout(hideTimeout);
                const rightControls = document.getElementById('custom-right-controls');
                if (rightControls && player.dataset.started) {
                    rightControls.style.opacity = '1';
                    rightControls.style.pointerEvents = 'auto';
                }
            });

            playerRegion.addEventListener('mouseleave', () => {
                hideTimeout = setTimeout(() => {
                    const rightControls = document.getElementById('custom-right-controls');
                    if (rightControls) { // 移除了 !isWebFullscreen 条件
                        rightControls.style.opacity = '0';
                        rightControls.style.pointerEvents = 'none';
                    }
                }, 3000); // 3秒后隐藏
            });
        }
    }
}

function updateWebFullscreenControlButton(button) {
    // 如果没有传入按钮元素，就通过ID查找
    if (!button) {
        button = document.getElementById('web-fullscreen-control-btn');
    }

    if (button) {
        // 根据当前状态设置不同的图标
        button.innerHTML = isWebFullscreen ?
            // "退出网页全屏" 图标
            `<svg class="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.913 6.45826V9.56817C19.913 9.68695 20.0566 9.74644 20.1406 9.66245L24.0458 5.75727C24.3061 5.49692 24.7283 5.49692 24.9886 5.75727L26.2143 6.98293C26.4746 7.24328 26.4746 7.66539 26.2143 7.92573L22.3093 11.8306C22.2253 11.9146 22.2848 12.0583 22.4036 12.0583H25.5137C25.8819 12.0583 26.1804 12.3567 26.1804 12.7249V14.4583C26.1804 14.8265 25.8819 15.1249 25.5137 15.1249L19.2468 15.1249C19.2466 15.1249 19.2469 15.1249 19.2468 15.1249H17.5137C17.1455 15.1249 16.8463 14.8265 16.8463 14.4583V6.45826C16.8463 6.09007 17.1448 5.7916 17.513 5.7916H19.2463C19.6145 5.7916 19.913 6.09007 19.913 6.45826Z" fill="currentColor" />
                <path d="M9.73054 19.9416C9.84933 19.9416 9.90882 20.0852 9.82482 20.1692L5.91991 24.0741C5.65956 24.3345 5.65956 24.7566 5.91991 25.0169L7.14556 26.2426C7.40591 26.5029 7.82802 26.5029 8.08837 26.2426L11.9935 22.3374C12.0775 22.2534 12.2212 22.3129 12.2212 22.4317V25.5416C12.2212 25.9098 12.5196 26.2083 12.8878 26.2083H14.6212C14.9893 26.2083 15.2878 25.9098 15.2878 25.5416L15.2878 17.5416C15.2878 17.1734 14.9893 16.8749 14.6212 16.8749H6.62046C6.25227 16.8749 5.9538 17.1734 5.9538 17.5416V19.2749C5.9538 19.6431 6.25227 19.9416 6.62046 19.9416H9.73054Z" fill="currentColor" />
            </svg>` :
            // "进入网页全屏" 图标
            `<svg class="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.3183 12.4856L21.2231 8.58073C21.3071 8.49674 21.2476 8.35312 21.1288 8.35312H18.0189C17.6507 8.35312 17.3522 8.05464 17.3522 7.68645V5.95312C17.3522 5.58493 17.6507 5.28645 18.0189 5.28645H26.0189C26.387 5.28645 26.6862 5.58493 26.6862 5.95312V13.9531C26.6862 14.3213 26.3877 14.6198 26.0196 14.6198H24.2862C23.918 14.6198 23.6196 14.3213 23.6196 13.9531V10.8431C23.6196 10.7243 23.4759 10.6648 23.3919 10.7488L19.4867 14.6541C19.2264 14.9144 18.8043 14.9144 18.5439 14.6541L17.3183 13.4284C17.0579 13.1681 17.0579 12.7459 17.3183 12.4856Z" fill="currentColor" />
                <path d="M6.1153 26.7135H14.1153C14.4835 26.7135 14.782 26.4151 14.782 26.0469V24.3135C14.782 23.9453 14.4835 23.6469 14.1153 23.6469H11.0053C10.8865 23.6469 10.827 23.5033 10.911 23.4193L14.8159 19.5144C15.0763 19.254 15.0763 18.8319 14.8159 18.5716L13.5903 17.3459C13.3299 17.0856 12.9078 17.0856 12.6474 17.3459L8.74222 21.2512C8.65822 21.3351 8.5146 21.2757 8.5146 21.1569L8.51461 18.0469C8.51461 17.6787 8.21613 17.3802 7.84794 17.3802H6.11461C5.74642 17.3802 5.44794 17.6787 5.44794 18.0469V26.0469C5.44794 26.4151 5.74711 26.7135 6.1153 26.7135Z" fill="currentColor" />
            </svg>`;

        button.setAttribute('aria-label', isWebFullscreen ? '退出网页全屏' : '网页全屏');
        button.setAttribute('title', isWebFullscreen ? '退出网页全屏 (W)' : '网页全屏 (W)');

        // 直接在按钮上切换CSS类，使其能响应 .web-fullscreen-active 的样式
        button.classList.toggle('web-fullscreen-active', isWebFullscreen);
    }
}

// 生成视频统一标识符，用于跨线路共享播放进度
function generateUniversalId(title, year, episodeIndex) {
    // 1. 先提取核心标题
    const coreTitle = getCoreTitle(title);
    // 2. 再对核心标题进行归一化
    const normalizedTitle = coreTitle.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
    const normalizedYear = year ? year : 'unknown';
    return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
}

// 实用工具函数
function hidePlayerOverlays() {
    const errorElement = document.getElementById('error');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

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
    hidePlayerOverlays();

    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold');
        if (errorTextElement) errorTextElement.textContent = message;
        errorElement.style.display = 'flex';
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

    const raw = (currentEpisodes && currentEpisodes.length > 0) ? currentEpisodes[0] : '';
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

// 根据广告过滤设置，异步处理视频URL。
async function processVideoUrl(url) {
    // 如果未启用广告过滤，直接返回原始 URL
    if (!adFilteringEnabled) {
        return url;
    }

    try {
        // 1. 拉取 m3u8 文本
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) throw new Error(`无法获取 m3u8，状态 ${resp.status}`);
        const m3u8Text = await resp.text();

        // 2. 广告过滤 & URL 补全
        const adPatterns = [
            /#EXT-X-DISCONTINUITY/i,
            /MOMENT-START/i,
            /\/\/.*\.(ts|jpg|png)\?ad=/i
        ];
        const lines = m3u8Text.split('\n');
        const baseUrl = url;
        const cleanLines = [];

        for (let line of lines) {
            if (adPatterns.some(p => p.test(line))) {
                continue;
            }

            if (line.startsWith('#EXT-X-KEY')) {
                const uriMatch = line.match(/URI="([^"]+)"/);
                if (uriMatch && uriMatch[1]) {
                    const relativeUri = uriMatch[1];
                    try {
                        const absoluteUri = new URL(relativeUri, baseUrl).href;
                        line = line.replace(relativeUri, absoluteUri);
                    } catch (e) {
                        console.warn('加密密钥 URL 补全失败，保留原行:', line, e);
                    }
                }
            }

            else if (line && !line.startsWith('#') && /\.(ts|m3u8)(\?|$)/i.test(line.trim())) {
                try {
                    line = new URL(line.trim(), baseUrl).href;
                } catch (e) {
                    console.warn('URL 补全失败，保留原行:', line, e);
                }
            }
            cleanLines.push(line);
        }

        const filteredM3u8 = cleanLines.join('\n');

        const blob = new Blob([filteredM3u8], { type: 'application/vnd.apple.mpegurl' });
        return URL.createObjectURL(blob);

    } catch (err) {
        console.error('广告过滤或 URL 补全失败：', err);
        showToast('广告过滤失败，播放原始地址', 'warning');
        return url;
    }
}

// --- 播放器核心逻辑 ---
async function initPlayer(videoUrl, title) {
    // 直接获取在 HTML 中声明好的播放器元素
    player = document.getElementById('player');
    window.player = player;

    if (!player) {
        showError("播放器元素 (#player) 未在HTML中找到");
        return;
    }

    // 在设置新源之前，清理可能存在的旧Blob URL
    if (player.currentSrc && player.currentSrc.startsWith('blob:')) {
        URL.revokeObjectURL(player.currentSrc);
    }

    const processedUrl = await processVideoUrl(videoUrl);

    // 为播放器设置属性
    player.title = title;
    player.src = { src: processedUrl, type: 'application/x-mpegurl' };

    // 确保核心事件监听器只被添加一次
    if (!player.dataset.listenersAdded) {
        addPlayerEventListeners();
        player.dataset.listenersAdded = 'true';
    }

    handleSkipIntroOutro(player);

    // 应用保存的播放速率
    const savedSpeed = localStorage.getItem('playbackSpeed') || '1';
    player.playbackRate = parseFloat(savedSpeed);

    // 网页全屏功能初始化
    addWebFullscreenKeyboardShortcut();

    // 等待播放器完全初始化后再初始化右侧控制条
    setTimeout(() => {
        initCustomRightControls();
    }, 100);
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
        clearVideoProgressForEpisode(
            universalId || generateUniversalId(currentVideoTitle, currentVideoYear, currentEpisodeIndex)
        );
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
    hidePlayerOverlays();

    if (isNavigatingToEpisode || index < 0 || index >= currentEpisodes.length) {
        return;
    }
    universalId = generateUniversalId(currentVideoTitle, currentVideoYear, index);

    // 保存原始索引（用于预加载计算）
    const originalIndex = window.currentEpisodeIndex;

    if (player && player.currentTime > 5) {
        saveVideoSpecificProgress();
    }

    isNavigatingToEpisode = true;

    const rememberOn = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY) !== 'false';
    if (rememberOn) {
        const currentUniversalId = generateUniversalId(currentVideoTitle, currentVideoYear, index);
        const allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgress = allProgress[currentUniversalId];
        if (savedProgress && savedProgress > 5) {
            const wantsToResume = await showProgressRestoreModal({
                title: "继续播放？",
                content: `《${currentVideoTitle}》第 ${index + 1} 集，<br> <span style="color:#00ccff">${formatPlayerTime(savedProgress)}</span> `,
                confirmText: "YES",
                cancelText: "NO"
            });

            if (wantsToResume) {
                nextSeekPosition = savedProgress;
            } else {
                clearVideoProgressForEpisode(currentUniversalId);
                nextSeekPosition = 0;
            }
        } else {
            nextSeekPosition = 0;
        }
    } else {
        nextSeekPosition = 0;
    }

    // 传递原始索引到 doEpisodeSwitch
    doEpisodeSwitch(index, currentEpisodes[index], originalIndex);
}

async function doEpisodeSwitch(index, episodeString, originalIndex) {
    let playUrl = episodeString;
    if (episodeString && episodeString.includes('$')) {
        playUrl = episodeString.split('$')[1];
    }
    // 特殊源链接补充协议校验（避免相对路径问题）
    if (playUrl && !playUrl.startsWith('http') && playUrl.startsWith('//')) {
        playUrl = 'https:' + playUrl; // 补全https协议
    }

    // 增加一个检查，确保一个有效的URL
    if (!playUrl || !playUrl.startsWith('http')) {
        showError(`无效的播放链接: ${playUrl || '链接为空'}`);
        console.error("解析出的播放链接无效:", playUrl);
        isNavigatingToEpisode = false;
        return;
    }

    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index;

    updateUIForNewEpisode();
    updateBrowserHistory(playUrl);

    if (player) {
        const processedUrl = await processVideoUrl(playUrl);
        player.src = { src: processedUrl, type: 'application/x-mpegurl' };
        // 在调用预加载前添加状态检查
        if (typeof preloadNextEpisodeParts === 'function') {
            // 取消之前的预加载
            if (typeof window.cancelCurrentPreload === 'function') {
                window.cancelCurrentPreload();
            }
            // 延迟触发预加载，确保状态同步
            setTimeout(() => {
                const preloadEnabled = localStorage.getItem('preloadEnabled') !== 'false';
                if (preloadEnabled && typeof preloadNextEpisodeParts === 'function') {
                    preloadNextEpisodeParts(index).catch(e => {
                        console.error('Preload error:', e);
                    });
                }
            }, 500);
        }
        player.play().catch(e => console.warn("Autoplay after episode switch was prevented.", e));
    }
}

(async function initializePage() {
    // 从localStorage加载最新的custom API配置
    const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');
    AppState.set('customAPIs', customAPIs);

    document.addEventListener('DOMContentLoaded', async () => {
        const urlParams = new URLSearchParams(window.location.search);

        adFilteringEnabled = urlParams.get('af') === '1';
        universalId = urlParams.get('universalId') || '';
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

        const sourceMapJSON = localStorage.getItem('videoSourceMap');
        if (sourceMapJSON) {
            try {
                // 从JSON重建Map
                const sourceMap = new Map(JSON.parse(sourceMapJSON));

                const coreClickedTitle = getCoreTitle(currentVideoTitle, currentVideoTypeName);
                const relevantSources = [];

                // 遍历Map中的每一个线路列表
                for (const sourceList of sourceMap.values()) {
                    const sourceItem = sourceList[0];
                    if (!sourceItem) continue;

                    // 使用与搜索时相同的核心标题提取逻辑进行匹配
                    const coreKeyTitle = getCoreTitle(sourceItem.vod_name, sourceItem.type_name);
                    const clickedYear = currentVideoYear;
                    const keyYear = sourceItem.vod_year;

                    // 如果核心标题匹配且年份兼容，则认为属于同一作品，加入备选列表
                    if (coreKeyTitle === coreClickedTitle && (!clickedYear || !keyYear || keyYear === clickedYear)) {
                        relevantSources.push(...sourceList);
                    }
                }
                availableAlternativeSources = relevantSources;
            } catch (e) {
                console.error("从 localStorage 构建聚合线路列表失败:", e);
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

        // 初始化搜索和历史功能
        if (typeof initPlayerSearchHistory === 'function') {
            initPlayerSearchHistory();
        }

        const positionFromUrl = urlParams.get('position');
        if (positionFromUrl) {
            nextSeekPosition = parseInt(positionFromUrl);
        } else {
            const rememberOn = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY) !== 'false';
            if (rememberOn) {
                const allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                const savedProgress = universalId ? allProgress[universalId] : undefined;

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
                        clearVideoProgressForEpisode(universalId);
                        nextSeekPosition = 0;
                    }
                }
            }
        }

        // 若为自定义detail源，且初始地址无效，自动重新请求
        const sourceCode = urlParams.get('source_code') || '';
        const isCustomSpecialSource = sourceCode.startsWith('custom_') &&
            APISourceManager.getCustomApiInfo(parseInt(sourceCode.replace('custom_', '')))?.detail;

        // 若初始地址无效（无m3u8链接），二次请求真实地址
        if (isCustomSpecialSource && (!episodeUrlForPlayer || !episodeUrlForPlayer.includes('.m3u8'))) {
            try {
                const vodId = urlParams.get('id');
                const customIndex = parseInt(sourceCode.replace('custom_', ''));
                const apiInfo = APISourceManager.getCustomApiInfo(customIndex);
                // 重新调用地址获取接口
                const detailResult = await handleCustomApiSpecialDetail(vodId, apiInfo.detail);
                const detailData = JSON.parse(detailResult);
                if (detailData.code === 200 && detailData.episodes.length > 0) {
                    // 更新播放地址为最新获取的地址
                    episodeUrlForPlayer = detailData.episodes[urlParams.get('index') || 0];
                    // 同步更新缓存，避免下次重复请求
                    localStorage.setItem('currentEpisodes', JSON.stringify(detailData.episodes));
                }
            } catch (e) {
                console.log('播放页二次请求地址失败（不影响现有体验）:', e);
            }
        }

        if (episodeUrlForPlayer) {
            await initPlayer(episodeUrlForPlayer, currentVideoTitle);
        } else {
            showError('没有可播放的视频链接。');
        }
    });
})();

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
    setupPlaySettingsEvents();
    document.addEventListener('keydown', handleKeyboardShortcuts);
    document.addEventListener('click', handleDocumentClick);
    // 添加触摸事件监听，用于移动端菜单关闭
    document.addEventListener('touchstart', handleDocumentTouch);
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

    newUrlForBrowser.searchParams.set(
        'universalId',
        generateUniversalId(currentVideoTitle, currentVideoYear, currentEpisodeIndex)
    );
    newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());
    newUrlForBrowser.searchParams.delete('position');

    window.history.pushState({ path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex }, '', newUrlForBrowser.toString());
}

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', () => {
            const playerSearchPerformed = sessionStorage.getItem('playerSearchPerformed');

            if (playerSearchPerformed === 'true') {
                // 清除播放页搜索状态
                sessionStorage.removeItem('playerSearchPerformed');
                sessionStorage.removeItem('playerSearchQuery');

                // 回到首页并尝试恢复搜索状态
                window.location.href = 'index.html?restore_search=true';
            } else {
                window.location.href = 'index.html';
            }
        });
    }



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

    // 播放设置按钮
    const playSettingsButton = document.getElementById('play-settings-button');
    if (playSettingsButton) playSettingsButton.addEventListener('click', togglePlaySettingsDropdown);
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
            timestamp: Date.now(),
            year: currentVideoYear,
            typeName: currentVideoTypeName
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
                year: currentVideoYear,
                episodes: window.currentEpisodes,
                typeName: currentVideoTypeName
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

    const currentUniversalId = generateUniversalId(currentVideoTitle, currentVideoYear, currentEpisodeIndex);

    const currentTime = Math.floor(player.currentTime);
    const duration = Math.floor(player.duration);

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.95) {
        try {
            let allProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            allProgresses[currentUniversalId] = currentTime;
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgresses));
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

function clearVideoProgressForEpisode(universalId) {
    try {
        let allProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        if (allProgresses[universalId]) {
            delete allProgresses[universalId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgresses));
        }
    } catch (e) {
        console.error(`清除进度失败:`, e);
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
    if (container) { container.classList.toggle('hidden', currentEpisodes.length <= 1); }

    const countSpan = document.getElementById('episodes-count');
    if (countSpan) { countSpan.textContent = `共 ${currentEpisodes.length} 集`; }

    // 定义综艺类型关键词
    const varietyShowTypes = ['综艺', '脱口秀', '真人秀'];
    const isVarietyShow = varietyShowTypes.some(type => currentVideoTypeName && currentVideoTypeName.includes(type));

    // 根据类型切换容器的CSS类
    if (isVarietyShow) {
        // 综艺
        grid.className = 'episode-grid-container variety-grid-layout';
    } else {
        // 非综艺
        grid.className = 'episode-grid grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2';
    }

    grid.innerHTML = '';
    if (!currentEpisodes.length) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }

    // 读取localStorage中保存的原始剧集名称
    const originalEpisodeNames = JSON.parse(localStorage.getItem('originalEpisodeNames') || '[]');

    const orderedEpisodes = episodesReversed ? [...currentEpisodes].reverse() : [...currentEpisodes];
    orderedEpisodes.forEach((episodeData, index) => {
        const originalIndex = episodesReversed ? (currentEpisodes.length - 1 - index) : index;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.index = originalIndex;

        const parts = (episodeData || '').split('$');
        const episodeName = parts.length > 1 ? parts[0].trim() : '';

        // 优先使用原始剧集名称
        // 从保存的原始名称中取对应索引的名称（如“20200101”）
        const originalName = originalEpisodeNames[originalIndex] || '';

        // 根据是否为综艺决定按钮文本和标题
        if (isVarietyShow) {
            // 综艺：优先用原始名称，其次用剧集数据中的名称，最后用索引
            btn.textContent = originalName || episodeName || `第${originalIndex + 1}集`;
            btn.title = btn.textContent;
        } else {
            // 非综艺：
            // 1 采用优先原始名称
            //const originalName = (originalEpisodeNames && originalEpisodeNames[originalIndex]) || '';
            //btn.textContent = originalName || (originalIndex + 1).toString();
            // btn.title = originalName || `第${originalIndex + 1}集`;

            // 2 采用默认索引
            btn.textContent = originalIndex + 1;
            // 1和2 共有
            btn.title = `第 ${originalIndex + 1} 集`;
        }

        // 高亮当前播放的集数
        if (originalIndex === currentEpisodeIndex) {
            btn.classList.add('episode-active');
        }

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
        episodeInfoSpan.style.display = 'flex'; // 显示集数信息
        const episodesCountEl = document.getElementById('episodes-count');
        if (episodesCountEl) episodesCountEl.textContent = `共 ${totalEpisodes} 集`;
    } else {
        episodeInfoSpan.textContent = '';
        episodeInfoSpan.style.display = 'none'; // 隐藏集数信息
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

    // 1. 切换锁定状态
    isScreenLocked = !isScreenLocked;
    player.keyDisabled = isScreenLocked;

    const playerContainer = document.querySelector('.player-container');
    const lockButton = document.getElementById('lock-button');
    const lockIcon = document.getElementById('lock-icon');

    // 2. 切换主容器和锁屏按钮的激活 Class
    playerContainer?.classList.toggle('player-locked', isScreenLocked);
    lockButton?.classList.toggle('lock-active', isScreenLocked);

    // 3. 【核心修复】精准禁用/启用其他所有控件及其容器
    const controlBar = document.querySelector('.player-control-bar');
    if (controlBar) {
        // 遍历所有按钮的父容器
        const buttonContainers = controlBar.querySelectorAll('.control-btn-container');
        buttonContainers.forEach(container => {
            const button = container.querySelector('button');
            // 如果容器内的按钮不是锁屏按钮
            if (button && button.id !== 'lock-button') {
                // 为整个容器添加禁用样式和inert属性
                container.classList.toggle('control-disabled', isScreenLocked);
                container.toggleAttribute('inert', isScreenLocked);

                // 锁屏时，确保其关联的下拉菜单是隐藏的
                if (isScreenLocked) {
                    const dropdown = container.querySelector('[id$="-dropdown"]');
                    dropdown?.classList.add('hidden');
                }
            }
        });
    }

    // 单独处理上一集/下一集/选集区域
    document.getElementById('prev-episode')?.toggleAttribute('inert', isScreenLocked);
    document.getElementById('next-episode')?.toggleAttribute('inert', isScreenLocked);
    document.getElementById('episodes-container')?.toggleAttribute('inert', isScreenLocked);

    // 4. 更新锁屏按钮的图标和提示信息
    if (lockIcon) {
        if (isScreenLocked) {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
            showMessage('屏幕已锁定', 'info', 2000);
        } else {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
            showMessage('屏幕已解锁', 'info', 1500);
        }
    }

    // 5. 恢复：为视频元素添加/移除单击事件
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
        // 先检查当前状态，如果要显示则关闭其他菜单
        const isHidden = dropdown.classList.contains('hidden');
        if (isHidden) {
            closeAllDropdowns();
            dropdown.classList.remove('hidden');
        } else {
            dropdown.classList.add('hidden');
        }
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
        // 先检查当前状态，如果要显示则关闭其他菜单
        const isHidden = dropdown.classList.contains('hidden');
        if (isHidden) {
            closeAllDropdowns();
        }
        dropdown.innerHTML = '';

        const currentId = vodIdForPlayer;

        if (availableAlternativeSources.length > 1) {
            availableAlternativeSources.forEach(source => {
                const item = document.createElement('button');

                const vodName = source.vod_name || '';
                const remarks = source.vod_remarks || '';

                const allVersionTags = ['国语', '国', '粤语', '粤', '台配', '台', '中字', '普通话', '高清', 'HD', '修复版', 'TC', '蓝光', '4K'];
                const seasonRegex = /(第[一二三四五六七八九十\d]+[季部]|Season\s*\d+)/i;

                const foundTags = [];
                allVersionTags.forEach(tag => {
                    if (vodName.includes(tag)) {
                        foundTags.push(tag);
                    }
                });

                // 简单的去重：为了避免 "国语" 和 "国" 同时被匹配
                if (foundTags.includes('国语') && foundTags.includes('国')) {
                    foundTags.splice(foundTags.indexOf('国'), 1);
                }
                if (foundTags.includes('粤语') && foundTags.includes('粤')) {
                    foundTags.splice(foundTags.indexOf('粤'), 1);
                }
                if (foundTags.includes('台配') && foundTags.includes('台')) {
                    foundTags.splice(foundTags.indexOf('台'), 1);
                }

                const seasonMatch = vodName.match(seasonRegex);
                if (seasonMatch) {
                    foundTags.push(seasonMatch[0]);
                }
                if (remarks) {
                    foundTags.push(remarks);
                }

                let tagsDisplay = '';
                if (foundTags.length > 0) {
                    tagsDisplay = `(${foundTags.join(', ')})`;
                }
                item.textContent = `${source.source_name} ${tagsDisplay}`.trim();

                item.dataset.sourceCode = source.source_code;
                item.dataset.vodId = source.vod_id;
                item.className = 'w-full text-left px-3 py-2 rounded text-sm transition-colors hover:bg-gray-700';

                if (String(source.vod_id) === currentId) {
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
        if (isHidden) {
            dropdown.classList.remove('hidden');
        } else {
            dropdown.classList.add('hidden');
        }
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
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
        const targetSourceItem = availableAlternativeSources.find(
            item => String(item.vod_id) === newVodId
        );
        if (!targetSourceItem) {
            throw new Error(`未能在可用线路中找到ID为“${newVodId}”的线路信息。`);
        }

        const detailRes = await fetch(`/api/detail?id=${newVodId}&source=${newSourceCode}`);
        const detailData = await detailRes.json();
        if (detailData.code !== 200 || !detailData.episodes || !detailData.episodes.length === 0) {
            throw new Error(`在线路“${targetSourceItem.source_name}”上获取剧集列表失败`);
        }

        const newEps = detailData.episodes;
        const timeToSeek = player.currentTime;

        vodIdForPlayer = newVodId;
        // 更新剧集列表（变量、全局、localStorage）
        currentEpisodes = newEps;
        window.currentEpisodes = newEps;
        localStorage.setItem('currentEpisodes', JSON.stringify(newEps));
        if (window.preloadedEpisodeUrls) window.preloadedEpisodeUrls.clear();
        if (window.inFlightEpisodeUrls) window.inFlightEpisodeUrls.clear();

        // 清空本页已缓存的预加载地址
        if (window.preloadedEpisodeUrls) {
            window.preloadedEpisodeUrls.clear();
        }
        // 重置预加载状态
        if (typeof window.cancelCurrentPreload === 'function') {
            window.cancelCurrentPreload();
        }
        // 重新初始化预加载（如果启用）
        const preloadEnabled = localStorage.getItem('preloadEnabled') !== 'false';
        if (preloadEnabled && typeof startPreloading === 'function') {
            setTimeout(() => {
                startPreloading();
            }, 300);
        }

        currentVideoTitle = targetSourceItem.vod_name;
        currentVideoYear = targetSourceItem.vod_year;
        // 没拿到新线路的类型时沿用旧值
        currentVideoTypeName = targetSourceItem.type_name || currentVideoTypeName;
        window.currentVideoTypeName = currentVideoTypeName;

        let targetEpisodeIndex = currentEpisodeIndex;
        if (targetEpisodeIndex >= newEps.length) {
            targetEpisodeIndex = newEps.length > 0 ? newEps.length - 1 : 0;
        }
        const newEpisodeUrl = newEps[targetEpisodeIndex];
        const newUrlForBrowser = new URL(window.location.href);

        newUrlForBrowser.searchParams.set('url', newEpisodeUrl);
        newUrlForBrowser.searchParams.set('title', currentVideoTitle);
        newUrlForBrowser.searchParams.set('index', String(targetEpisodeIndex));
        newUrlForBrowser.searchParams.set('id', newVodId);
        newUrlForBrowser.searchParams.set('source', targetSourceItem.source_name);
        newUrlForBrowser.searchParams.set('source_code', newSourceCode);
        if (currentVideoYear) newUrlForBrowser.searchParams.set('year', currentVideoYear);
        newUrlForBrowser.searchParams.set('typeName', currentVideoTypeName);

        const newVideoKey = `${currentVideoTitle}|${currentVideoYear || ''}`;
        newUrlForBrowser.searchParams.set('videoKey', newVideoKey);

        universalId = generateUniversalId(currentVideoTitle, currentVideoYear, targetEpisodeIndex);
        newUrlForBrowser.searchParams.set('universalId', universalId);

        window.history.replaceState({}, '', newUrlForBrowser.toString());

        nextSeekPosition = timeToSeek;
        const processedUrl = await processVideoUrl(newEpisodeUrl);

        player.src = { src: processedUrl, type: 'application/x-mpegurl' };
        player.title = currentVideoTitle;

        player.play();

        renderEpisodes();
        updateEpisodeInfo();

        const dropdown = document.getElementById('line-switch-dropdown');
        if (dropdown) dropdown.innerHTML = '';

        if (loadingEl) loadingEl.style.display = 'none';
        showMessage(`已切换到线路: ${targetSourceItem.source_name}`, 'success');

    } catch (err) {
        console.error("切换线路失败:", err);
        showError(`切换失败: ${err.message}`);
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

// 播放设置下拉菜单功能
function togglePlaySettingsDropdown() {
    const dropdown = document.getElementById('play-settings-dropdown');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');

    // 如果要显示设置菜单，先关闭其他下拉菜单
    if (isHidden) {
        closeAllDropdowns();
        dropdown.classList.remove('hidden');
        // 确保播放设置事件已初始化
        setupPlaySettingsEvents();
    } else {
        dropdown.classList.add('hidden');
    }
}

function setupPlaySettingsEvents() {
    // 设置自动播放切换
    const autoplayToggle = document.getElementById('autoplay-next');
    if (autoplayToggle && !autoplayToggle.hasAttribute('data-initialized')) {
        // 从localStorage读取设置
        const savedAutoplay = localStorage.getItem('autoplayEnabled');
        autoplayEnabled = savedAutoplay !== 'false';
        autoplayToggle.checked = autoplayEnabled;

        autoplayToggle.addEventListener('change', function (event) {
            autoplayEnabled = event.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled.toString());
            const messageText = autoplayEnabled ? '已开启自动播放下一集' : '已关闭自动播放下一集';
            showMessage(messageText, 'info');
        });

        autoplayToggle.setAttribute('data-initialized', 'true');
    }

    // 设置播放速率
    const speedSelect = document.getElementById('playback-speed-select');
    if (speedSelect && !speedSelect.hasAttribute('data-initialized')) {
        // 从localStorage读取设置
        const savedSpeed = localStorage.getItem('playbackSpeed') || '1';
        speedSelect.value = savedSpeed;

        // 应用当前速率到播放器
        if (player && player.playbackRate !== undefined) {
            player.playbackRate = parseFloat(savedSpeed);
        }

        speedSelect.addEventListener('change', function (event) {
            const speed = parseFloat(event.target.value);
            localStorage.setItem('playbackSpeed', speed.toString());

            if (player && player.playbackRate !== undefined) {
                player.playbackRate = speed;
                const speedText = speed === 1 ? '正常速度' : `${speed}x 速度`;
                showMessage(`播放速率已设置为 ${speedText}`, 'info');
            }
        });


        speedSelect.setAttribute('data-initialized', 'true');
    }

    // 设置分片广告过滤
    const adFilterToggle = document.getElementById('adFilterToggle');
    if (adFilterToggle && !adFilterToggle.hasAttribute('data-initialized')) {
        // 从URL参数初始化开关状态
        const urlParams = new URLSearchParams(window.location.search);
        adFilteringEnabled = urlParams.get('af') === '1';
        adFilterToggle.checked = adFilteringEnabled;

        adFilterToggle.addEventListener('change', async function (event) {
            adFilteringEnabled = event.target.checked;
            // 更新localStorage（保持与首页同步）
            localStorage.setItem('adFilteringEnabled', adFilteringEnabled.toString());
            // 更新URL中的af参数，以便刷新或分享时保留设置
            const url = new URL(window.location);
            url.searchParams.set('af', adFilteringEnabled ? '1' : '0');
            window.history.replaceState({}, '', url);
            showToast(adFilteringEnabled ? '已开启分片广告过滤' : '已关闭分片广告过滤', 'info');
            // 关键步骤：重新加载播放器以应用设置
            if (player) {
                const originalUrl = new URLSearchParams(window.location.search).get('url');
                if (!originalUrl) return;
                const resumeAt = player.currentTime || 0;   // 记下当前位置
                // 预设置下次定位位置（用于播放器内部状态同步）
                nextSeekPosition = resumeAt;

                const processedUrl = await processVideoUrl(originalUrl);
                // 清理旧 blob URL（如有）
                if (player.currentSrc && player.currentSrc.startsWith('blob:')) {
                    URL.revokeObjectURL(player.currentSrc);
                }

                // 定义恢复函数（优先使用loadedmetadata确保定位准确）
                function restorePosition() {
                    if (resumeAt > 0 && player.duration > resumeAt) {
                        player.currentTime = resumeAt;
                    }
                    player.removeEventListener('loadedmetadata', restorePosition);
                }

                // 只使用loadedmetadata事件确保在元数据加载完成后定位
                player.addEventListener('loadedmetadata', restorePosition, { once: true });

                // 真正换源
                player.src = { src: processedUrl, type: 'application/x-mpegurl' };

                // 播放时直接从指定位置开始
                player.play().then(() => {
                    if (resumeAt > 0) {
                        player.currentTime = resumeAt;
                    }
                }).catch(e => console.warn('重新加载播放失败:', e));
            }
        });

        adFilterToggle.setAttribute('data-initialized', 'true');
    }

    // 设置预加载开关
    const preloadToggle = document.getElementById('preloadToggle');
    if (preloadToggle && !preloadToggle.hasAttribute('data-initialized')) {
        // 修正：直接使用 PLAYER_CONFIG 中的值
        preloadToggle.checked = PLAYER_CONFIG.enablePreloading;

        // 添加事件监听器以响应变化
        preloadToggle.addEventListener('change', function () {
            localStorage.setItem('preloadingEnabled', this.checked.toString());
            // 更新 PLAYER_CONFIG 中的值
            PLAYER_CONFIG.enablePreloading = this.checked;
            showToast(this.checked ? '预加载已开启' : '预加载已关闭', 'info');
            // 触发预加载逻辑（新增：开关变化时立即生效）
            if (this.checked) {
                startPreloading();
            } else {
                stopPreloading();
            }
        });
        preloadToggle.setAttribute('data-initialized', 'true');
    }

    // 设置自定义预加载集数
    const preloadEpisodeCountInput = document.getElementById('preloadEpisodeCount');
    if (preloadEpisodeCountInput && !preloadEpisodeCountInput.hasAttribute('data-initialized')) {
        // 修正：直接使用 PLAYER_CONFIG 中的值
        preloadEpisodeCountInput.value = PLAYER_CONFIG.preloadCount;

        // 添加事件监听器以响应变化
        preloadEpisodeCountInput.addEventListener('change', function () {
            const count = parseInt(this.value, 10);
            // 验证输入值是否为有效的正数（限制1-10集，与首页逻辑一致）
            if (count >= 1 && count <= 10) {
                localStorage.setItem('preloadEpisodeCount', count.toString());
                // 更新 PLAYER_CONFIG 中的值
                PLAYER_CONFIG.preloadCount = count;
                showToast(`预加载集数已设置为 ${count}`, 'info');
                // 触发预加载逻辑（新增：集数变化时立即生效）
                if (localStorage.getItem('preloadingEnabled') !== 'false') {
                    startPreloading();
                }
            } else {
                // 如果输入无效，则恢复之前的值
                this.value = PLAYER_CONFIG.preloadCount;
                showToast('请输入1-10之间的有效数字', 'error');
            }
        });
        preloadEpisodeCountInput.setAttribute('data-initialized', 'true');
    }
}

function closeAllDropdowns() {
    const dropdowns = [
        'play-settings-dropdown',
        'line-switch-dropdown',
        'skip-control-dropdown'
    ];

    dropdowns.forEach(id => {
        const dropdown = document.getElementById(id);
        if (dropdown && !dropdown.classList.contains('hidden')) {
            dropdown.classList.add('hidden');
        }
    });
}

// 处理文档点击事件，用于关闭下拉菜单
function handleDocumentClick(event) {
    const playSettingsContainer = document.querySelector('.play-settings-container');
    const lineSwitchContainer = document.querySelector('.line-switch-container');
    const skipControlContainer = document.querySelector('.skip-control-container');

    // 如果点击不在任何下拉容器内，关闭所有下拉菜单
    if (playSettingsContainer && !playSettingsContainer.contains(event.target)) {
        const dropdown = document.getElementById('play-settings-dropdown');
        if (dropdown && !dropdown.classList.contains('hidden')) {
            dropdown.classList.add('hidden');
        }
    }

    if (lineSwitchContainer && !lineSwitchContainer.contains(event.target)) {
        const dropdown = document.getElementById('line-switch-dropdown');
        if (dropdown && !dropdown.classList.contains('hidden')) {
            dropdown.classList.add('hidden');
        }
    }

    if (skipControlContainer && !skipControlContainer.contains(event.target)) {
        const dropdown = document.getElementById('skip-control-dropdown');
        if (dropdown && !dropdown.classList.contains('hidden')) {
            dropdown.classList.add('hidden');
        }
    }
}

// 处理移动端触摸事件，用于关闭下拉菜单
function handleDocumentTouch(event) {
    const playSettingsContainer = document.querySelector('.play-settings-container');
    const lineSwitchContainer = document.querySelector('.line-switch-container');
    const skipControlContainer = document.querySelector('.skip-control-container');

    // 如果触摸不在任何下拉容器内，关闭所有下拉菜单
    const isOutsideAllContainers =
        (!playSettingsContainer || !playSettingsContainer.contains(event.target)) &&
        (!lineSwitchContainer || !lineSwitchContainer.contains(event.target)) &&
        (!skipControlContainer || !skipControlContainer.contains(event.target));

    if (isOutsideAllContainers) {
        closeAllDropdowns();
    }
}

function retryLastAction() {
    hidePlayerOverlays();

    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'none';

    if (!lastFailedAction) {
        if (player && player.currentSrc) {
            console.log("重试：重新加载当前视频源。");
            player.src = player.currentSrc; // 重新设置源
            player.play().catch(e => console.error("重试播放失败", e));
        }
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
            player.play().catch(e => console.error("重试播放失败", e));
        }
    }
}

window.playNextEpisode = playNextEpisode;
window.playPreviousEpisode = playPreviousEpisode;
window.copyLinks = copyLinks;
window.toggleEpisodeOrder = toggleEpisodeOrder;
window.toggleLockScreen = toggleLockScreen;