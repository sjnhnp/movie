// File: js/player_app.js

// Add this helper function at the top of js/player_app.js
if (typeof showToast !== 'function' || typeof showMessage !== 'function') {
    console.warn("UI notification functions (showToast/showMessage) are not available. Notifications might not work.");
}

function SQuery(selector, callback, timeout = 5000, interval = 100) {
    let elapsedTime = 0;
    const check = () => {
        const element = document.querySelector(selector); // Using querySelector
        if (element) {
            callback(element);
        } else {
            elapsedTime += interval;
            if (elapsedTime < timeout) {
                setTimeout(check, interval);
            } else {
                console.error(`[SQuery] Element '${selector}' NOT FOUND by SQuery after ${timeout}ms.`);
            }
        }
    };
    check();
}

// 检查 localStorage 可用性，iOS/私密模式等特殊环境下友好提示
function testLocalStorageAvailable() {
    try {
        localStorage.setItem('__ls_test__', '1');
        localStorage.removeItem('__ls_test__');
        return true;
    } catch (e) {
        return false;
    }
}

// 递归禁止contextmenu，防止安卓右半边长按出现系统菜单
function disableContextMenuDeep(element) {
    if (!element) return;
    element.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false });
    for (const child of element.children || []) {
        disableContextMenuDeep(child);
    }
}

// 自动加属性防止安卓video系统菜单
function patchAndroidVideoHack() {
    if (!/Android/i.test(navigator.userAgent)) return;
    setTimeout(function () {
        const wrap = document.querySelector('#dplayer .dplayer-video-wrap');
        const dplayerMain = document.getElementById('dplayer');
        if (wrap) disableContextMenuDeep(wrap);
        if (dplayerMain) disableContextMenuDeep(dplayerMain);
        const dpvideo = wrap ? wrap.querySelector('video') : null;
        if (dpvideo) {
            disableContextMenuDeep(dpvideo);
            // 这些属性可减少系统菜单
            dpvideo.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
            dpvideo.setAttribute('webkit-playsinline', 'true');
            dpvideo.setAttribute('playsinline', 'true');
        }
    }, 800); // 确保DPlayer结构已渲染
}

const SKIP_INTRO_KEY = 'skipIntroTime';
const SKIP_OUTRO_KEY = 'skipOutroTime';

function setupSkipControls() {
    // 初始化 UI 元素
    const skipButton = document.getElementById('skip-control-button');
    const dropdown = document.getElementById('skip-control-dropdown');
    const skipIntroInput = document.getElementById('skip-intro-input');
    const skipOutroInput = document.getElementById('skip-outro-input');
    const applyBtn = document.getElementById('apply-skip-settings');
    const resetBtn = document.getElementById('reset-skip-settings');

    if (!skipButton || !dropdown || !skipIntroInput || !skipOutroInput || !applyBtn || !resetBtn) {
        console.error("跳过片头片尾功能的 HTML 元素未正确加载！");
        return;
    }

    // 显示 / 隐藏菜单
    skipButton.addEventListener('click', () => {
        if (dropdown.classList.contains('hidden')) {
            dropdown.classList.remove('hidden');
            dropdown.classList.add('block');
        } else {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('block');
        }
    });


    // 应用设置按钮
    applyBtn.addEventListener('click', () => {
        const introTime = parseInt(skipIntroInput.value) || 0;
        const outroTime = parseInt(skipOutroInput.value) || 0;

        localStorage.setItem(SKIP_INTRO_KEY, introTime);
        localStorage.setItem(SKIP_OUTRO_KEY, outroTime);

        if (typeof showToast === 'function') {
            showToast('跳过时间设置已保存', 'success');
        }
        dropdown.classList.remove('active'); // 收起设置框
    });

    // 重置时间
    resetBtn.addEventListener('click', () => {
        localStorage.removeItem(SKIP_INTRO_KEY);
        localStorage.removeItem(SKIP_OUTRO_KEY);
        skipIntroInput.value = '';
        skipOutroInput.value = '';

        if (typeof showToast === 'function') {
            showToast('跳过时间设置已重置', 'success');
        }
    });

    // 从 localStorage 中加载初始值
    const savedIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    const savedOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;

    skipIntroInput.value = savedIntroTime;
    skipOutroInput.value = savedOutroTime;
}

function setupSkipDropdownEvents() {
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('skip-control-dropdown');
        const skipButton = document.getElementById('skip-control-button');
        if (!skipButton || !dropdown) return;

        if (skipButton.contains(event.target)) {
            // 已由 setupSkipControls 单独处理
        } else if (!dropdown.contains(event.target)) {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('block');
        }
    });

}

// 自动跳过片头和片尾
function handleSkipIntroOutro(dpInstance) {
    if (!dpInstance || !dpInstance.video) return;
    const video = dpInstance.video;

    // 跳过片头
    const skipIntroTime = parseInt(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    // 解绑旧
    if (video._skipIntroHandler) {
        video.removeEventListener('loadedmetadata', video._skipIntroHandler);
    }
    if (skipIntroTime > 0) {
        video._skipIntroHandler = function () {
            if (video.duration > skipIntroTime && video.currentTime < skipIntroTime) {
                video.currentTime = skipIntroTime;
                if (typeof showToast === 'function') showToast(`已跳过${skipIntroTime}秒片头`, 'info');
            }
        };
        video.addEventListener('loadedmetadata', video._skipIntroHandler);
    } else {
        video._skipIntroHandler = null;
    }

    // 跳过片尾
    const skipOutroTime = parseInt(localStorage.getItem(SKIP_OUTRO_KEY)) || 0;
    if (video._skipOutroHandler) {
        video.removeEventListener('timeupdate', video._skipOutroHandler);
    }
    if (skipOutroTime > 0) {
        video._skipOutroHandler = function () {
            if (!video) return;
            const remain = video.duration - video.currentTime;
            if (remain <= skipOutroTime && !video.paused) {
                if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
                    playNextEpisode();
                } else {
                    video.pause();
                    if (typeof showToast === 'function') showToast(`已跳过${skipOutroTime}秒片尾`, 'info');
                }
            }
        };
        video.addEventListener('timeupdate', video._skipOutroHandler);
    } else {
        video._skipOutroHandler = null;
    }
}


// 初始化跳过功能
document.addEventListener('DOMContentLoaded', () => {
    // 初始化 UI 控件
    setupSkipControls();

    // 新增 Dropdown 菜单显示/隐藏的事件处理
    setupSkipDropdownEvents();

    // 初始化其他页面功能
    initializePageContent();
});


/**
 * 展示自定义的“记住进度恢复”弹窗，并Promise化回调
 * @param {Object} opts 配置对象：title,content,confirmText,cancelText
 * @returns {Promise<boolean>} 用户点击确定:true / 取消:false
 */
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
            modal.classList.remove("active");
            document.body.style.overflow = "";
            // 解绑事件, 避免内存泄漏
            btnCancel.onclick = btnConfirm.onclick = null;
            document.removeEventListener("keydown", handler);
            setTimeout(() => resolve(result), 180);
        }

        btnCancel.onclick = () => close(false);
        btnConfirm.onclick = () => close(true);

        function handler(e) {
            if (e.key === "Escape") close(false);
            if (e.key === "Enter") close(true);
        }
        setTimeout(() => btnConfirm.focus(), 120); // 自动聚焦确定
        document.addEventListener("keydown", handler);

        modal.classList.add("active");
        document.body.style.overflow = "hidden"; // 防止弹窗时页面滚动
    });
}

// --- 模块内变量 ---
let isNavigatingToEpisode = false;   // 正在换集时置 true，避免误保存
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let dp = null; // DPlayer instance
let currentHls = null;
let autoplayEnabled = true;
let isUserSeeking = false;
let videoHasEnded = false;
let userClickedPosition = null;
let shortcutHintTimeout = null;
let progressSaveInterval = null;
let isScreenLocked = false;
let nextSeekPosition = 0; // Stores the position to seek to for the next episode
let _tempUrlForCustomHls = ''; // Temporary holder for the URL if DPlayer options are stale in customType
let lastTapTimeForDoubleTap = 0;
let vodIdForPlayer = ''; // 新增全局变量存储从URL获取的 VOD ID

// ✨ 新实现：统一在这里生成『剧集级』或『全集级』标识
function getShowIdentifier(perEpisode = true) {
    const sc = new URLSearchParams(window.location.search).get('source_code') || 'unknown_source';
    const vid = vodIdForPlayer || '';          // 外部传过来的 vod_id
    const ep = perEpisode ? `_ep${currentEpisodeIndex}` : '';

    // 1) 只要有 vod_id，就用它
    if (vid) return `${currentVideoTitle}_${sc}_${vid}${ep}`;

    // 2) vod_id 没有？对链接取指纹
    const raw = currentEpisodes[currentEpisodeIndex] || '';
    const urlKey = raw.split('/').pop().split(/[?#]/)[0]     // 取文件名
        || (raw.length > 32 ? raw.slice(-32) : raw); // 链接太怪时兜底
    return `${currentVideoTitle}_${sc}_${urlKey}${ep}`;
}

const DOUBLE_TAP_INTERVAL = 300; // 双击的最大时间间隔 (毫秒)

const REMEMBER_EPISODE_PROGRESS_ENABLED_KEY = 'playerRememberEpisodeProgressEnabled'; // 开关状态的键名
const VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY = 'videoSpecificEpisodeProgresses'; // 各视频各集进度的键名

// ==== 广告分片起止标记 ====
const AD_START_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="ad"/i,
    /#EXT-X-SCTE35-OUT/i,
    /#EXTINF:[\d.]+,\s*ad/i,
];
const AD_END_PATTERNS = [
    /#EXT-X-DATERANGE:.*CLASS="content"/i,
    /#EXT-X-SCTE35-IN/i,
    /#EXT-X-DISCONTINUITY/i,   // 保险：有些源用 DISCONTINUITY 结束广告
];

// ==== 全局开关：是否去广告（缺省 true，可被 config.js 覆盖） ====
let adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true;

function isMobile() {
    return /Mobile|Tablet|iPod|iPhone|iPad|Android|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}

// 辅助函数：格式化时间)
function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 将需要在 player_preload.js 中访问的变量挂载到 window
window.currentEpisodes = [];
window.currentEpisodeIndex = 0;
// window.PLAYER_CONFIG is set by config.js
// window.dp will be set after DPlayer initialization
// window.playEpisode will be set later

/**
 * 关闭“记住进度”时，清除当前视频在 localStorage 中保存的所有集数进度
 */
function clearCurrentVideoAllEpisodeProgresses() {
    try {
        const all = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || "{}");
        const showId = getShowIdentifier(false);

        // 如果存在该视频的进度记录，则删除
        if (all[showId]) {
            delete all[showId];
            localStorage.setItem(
                VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY,
                JSON.stringify(all)
            );

            // 给用户一个清除成功的提示
            const msg = `已清除《${currentVideoTitle}》的所有集数播放进度`;
            if (typeof showMessage === "function") showMessage(msg, "success");
            else if (typeof showToast === "function") showToast(msg, "success");
        }
    } catch (e) {
        console.error("清除特定视频集数进度失败:", e);
    }
}

function setupRememberEpisodeProgressToggle() {
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle) return;

    // 1. 从 localStorage 初始化开关状态
    const savedSetting = localStorage.getItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY);
    if (savedSetting !== null) {
        toggle.checked = savedSetting === 'true';
    } else {
        toggle.checked = true; // 默认开启
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, 'true');
    }

    // 2. 监听开关变化，并保存到 localStorage
    toggle.addEventListener('change', function (event) {
        const isChecked = event.target.checked;
        localStorage.setItem(REMEMBER_EPISODE_PROGRESS_ENABLED_KEY, isChecked.toString());
        if (typeof showToast === 'function') { // 确保 showToast 可用
            const messageText = isChecked ? '将记住本视频的各集播放进度' : '将不再记住本视频的各集播放进度';
            if (typeof window.showMessage === 'function') { // 优先用 player_app.js 内的
                window.showMessage(messageText, 'info');
            } else if (typeof window.showToast === 'function') { // 备用 ui.js 的
                window.showToast(messageText, 'info');
            }
        }
        // (可选逻辑) 如果用户关闭功能，是否清除当前视频已保存的特定进度？
        if (!isChecked) {
            clearCurrentVideoAllEpisodeProgresses(); // 需要实现此函数
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    // Existing password check and initializePageContent call
    if (typeof window.isPasswordVerified === 'function' && typeof window.isPasswordProtected === 'function') {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
            const loadingEl = document.getElementById('loading');
            if (loadingEl) loadingEl.style.display = 'none';
            return;
        }
    } else {
        console.warn("Password functions (isPasswordProtected/isPasswordVerified) not found. Assuming no password protection.");
    }
    initializePageContent();
});

// Listen for password verification success event
document.addEventListener('passwordVerified', () => {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = 'flex';              // 原来的
        document.documentElement.classList.add('show-loading'); // ← 新增
    }
    initializePageContent();
});

function initializePageContent() {
    if (!testLocalStorageAvailable()) {
        showMessage('当前浏览器本地存储不可用，播放进度记忆将失效', 'warning');
    }
    //  console.log('[PlayerApp Debug] initializePageContent starting...');
    const urlParams = new URLSearchParams(window.location.search);
    let episodeUrlForPlayer = urlParams.get('url'); // 先用 let，后续可能修改
    let title = urlParams.get('title');
    vodIdForPlayer = urlParams.get('id') || '';
    // 把可能的多层编码全部拆掉
    function fullyDecode(str) {
        try {
            let prev, cur = str;
            do { prev = cur; cur = decodeURIComponent(cur); } while (cur !== prev);
            return cur;
        } catch { return str; }   // 遇到非法编码就放弃
    }
    title = title ? fullyDecode(title) : '';
    const sourceCodeFromUrl = urlParams.get('source_code'); // 重命名以区分

    // 兼容旧链接里的 ep=
    let index = parseInt(
        urlParams.get('index') || urlParams.get('ep') || '0',
        10
    );
    let indexForPlayer = index; // 先用 let，后续可能修改

    // 先用 URL⟨episodes=⟩ → 再退回 localStorage（双保险）
    const episodesListParam = urlParams.get('episodes');

    const reversedFromUrl = urlParams.get('reversed');

    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    window.currentVideoTitle = currentVideoTitle;

    // Initialize episodes from localStorage or URL parameter
    try {
        let episodesSource = localStorage.getItem('currentEpisodes');
        if (episodesListParam) {
            try {
                currentEpisodes = JSON.parse(decodeURIComponent(episodesListParam));
                //  console.log("[PlayerApp] Episodes loaded from URL parameter.");
            } catch (e) {
                console.warn("[PlayerApp] Failed to parse episodes from URL, falling back to localStorage.", e);
                currentEpisodes = episodesSource ? JSON.parse(episodesSource) : [];
            }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
            //  console.log("[PlayerApp] Episodes loaded from localStorage.");
        } else {
            currentEpisodes = [];
            //  console.log("[PlayerApp] No episode data found in URL or localStorage.");
        }
        window.currentEpisodes = currentEpisodes; // Expose globally

        // Validate index
        if (currentEpisodes.length > 0 && (index < 0 || index >= currentEpisodes.length)) {
            console.warn(`[PlayerApp] Invalid episode index ${index} for ${currentEpisodes.length} episodes. Resetting to 0.`);
            index = 0;
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index.toString());
            window.history.replaceState({}, '', newUrl.toString());
        }
        // currentEpisodeIndex 的最终值将在进度恢复逻辑后确定
        indexForPlayer = index; // indexForPlayer 将持有用户最初意图的集数
        window.currentEpisodeIndex = currentEpisodeIndex; // Expose globally

        if (reversedFromUrl !== null) {
            episodesReversed = reversedFromUrl === 'true';
            localStorage.setItem('episodesReversed', episodesReversed.toString());
        } else {
            episodesReversed = localStorage.getItem('episodesReversed') === 'true';
        }
    } catch (e) {
        console.error('[PlayerApp] Error initializing episode data:', e);
        currentEpisodes = []; window.currentEpisodes = [];
        indexForPlayer = 0; // 如果出错，默认第一集
        episodesReversed = false;
    }

    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';

    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';
    const autoplayToggle =
        document.getElementById('autoplay-next') ||
        document.getElementById('autoplayToggle');
    if (autoplayToggle) {
        autoplayToggle.checked = autoplayEnabled;
        autoplayToggle.addEventListener('change', function (e) {
            autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled.toString());
        });
    }

    // --- 新增：记住进度开关初始化及进度恢复逻辑 ---
    setupRememberEpisodeProgressToggle(); // 初始化开关状态和事件监听

    // 新进度分支代码，直接替换你 initializePageContent 里判断播放进度和episodeUrlForPlayer、indexForPlayer的那大段 if/else！

    const positionFromUrl = urlParams.get('position');
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;

    if (positionFromUrl) {
        // ★1. 只要有position参数（即从历史进度跳转），强制用url和index
        episodeUrlForPlayer = urlParams.get('url');
        indexForPlayer = parseInt(urlParams.get('index') || '0', 10);
        // ---------- 下面是弹窗断点逻辑（你的原有弹窗代码完整贴入这里，结构无须再裁剪/再分支）----------
    } else if (shouldRestoreSpecificProgress && currentEpisodes.length > 0) {
        const showId = getShowIdentifier(false); // <--- 使用新的函数获取剧集ID
        let allSpecificProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        const savedProgressDataForShow = allSpecificProgresses[showId]; // <--- 用 showId 获取该剧的进度对象

        if (savedProgressDataForShow) {
            const resumeIndex = indexForPlayer;
            const positionToResume =
                savedProgressDataForShow[resumeIndex.toString()] // <--- 从剧集对象中获取特定集的进度
                    ? parseInt(savedProgressDataForShow[resumeIndex.toString()])
                    : 0;

            if ((!urlParams.has('index') || urlParams.get('index') === null) &&
                typeof savedProgressDataForShow.lastPlayedEpisodeIndex === 'number' && // <--- 从剧集对象中获取
                savedProgressDataForShow.lastPlayedEpisodeIndex >= 0 &&
                savedProgressDataForShow.lastPlayedEpisodeIndex < currentEpisodes.length) {
                indexForPlayer = savedProgressDataForShow.lastPlayedEpisodeIndex; // <--- 从剧集对象中获取
            }

            if (positionToResume > 5 && currentEpisodes[resumeIndex]) {
                showProgressRestoreModal({
                    title: "继续播放？",
                    content: `发现《${currentVideoTitle}》第 ${resumeIndex + 1} 集的播放记录，<br>是否从 <span style="color:#00ccff">${formatPlayerTime(positionToResume)}</span> 继续播放？`,
                    confirmText: "继续播放",
                    cancelText: "从头播放"
                }).then(wantsToResume => {
                    if (wantsToResume) {
                        episodeUrlForPlayer = currentEpisodes[resumeIndex];
                        indexForPlayer = resumeIndex;

                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('url', episodeUrlForPlayer);
                        newUrl.searchParams.set('index', indexForPlayer.toString());
                        newUrl.searchParams.set('position', positionToResume.toString());
                        newUrl.searchParams.set('id', vodIdForPlayer); // <--- 确保 id 也存在

                        window.history.replaceState({}, '', newUrl.toString());

                        if (typeof window.showMessage === 'function') {
                            window.showMessage(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                        } else if (typeof window.showToast === 'function') {
                            window.showToast(`将从 ${formatPlayerTime(positionToResume)} 继续播放`, 'info');
                        }
                    } else {
                        // 用户选择从头播放，清除该集的特定进度
                        try {
                            const show_Id_for_clear = getShowIdentifier(false); // 获取当前节目的ID
                            const all_prog = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
                            if (all_prog[show_Id_for_clear] && all_prog[show_Id_for_clear][indexForPlayer.toString()]) {
                                delete all_prog[show_Id_for_clear][indexForPlayer.toString()];
                                // (可选) 检查是否清空了所有集数的进度，如果是，也可以删除 lastPlayedEpisodeIndex
                                localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(all_prog));
                            }
                        } catch (e) { console.warn('清除本集特定进度失败：', e); }
                        episodeUrlForPlayer = currentEpisodes[indexForPlayer];
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('url', episodeUrlForPlayer);
                        newUrl.searchParams.set('index', indexForPlayer.toString());
                        newUrl.searchParams.delete('position');
                        newUrl.searchParams.set('id', vodIdForPlayer);
                        window.history.replaceState({}, '', newUrl.toString());
                        if (typeof showMessage === 'function') showMessage('已从头开始播放', 'info');
                        else if (typeof showToast === 'function') showToast('已从头开始播放', 'info');
                    }
                    initializePageContent(); // 重新初始化以应用选择
                });
                return;
            } else {
                episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
            }
        } else {
            episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
        }
    } else {
        episodeUrlForPlayer = currentEpisodes[indexForPlayer] || urlParams.get('url');
    }

    // --- 最终确定要播放的集数和URL ---
    currentEpisodeIndex = indexForPlayer; // 最终确定全局的当前集数索引
    window.currentEpisodeIndex = currentEpisodeIndex;
    if (currentEpisodes.length > 0 && (!episodeUrlForPlayer || !currentEpisodes.includes(episodeUrlForPlayer))) {
        episodeUrlForPlayer = currentEpisodes[currentEpisodeIndex]; // 再次确保播放的URL是正确的
        if (episodeUrlForPlayer) { // 如果从 currentEpisodes 成功获取，更新URL参数
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('url', episodeUrlForPlayer);
            window.history.replaceState({}, '', newUrl.toString());
        }
    }

    // --- 更新页面标题和视频标题元素 ---
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;

    if (episodeUrlForPlayer) {
        initPlayer(episodeUrlForPlayer, sourceCodeFromUrl); // 使用 sourceCodeFromUrl
        const finalUrlParams = new URLSearchParams(window.location.search); // 获取可能已更新的URL参数
        const finalPositionToSeek = finalUrlParams.get('position');

        // ★ seek 优化：只要 positionFromUrl 存在，立即绑定 loadedmetadata 来 seek，兼容安卓
        if (positionFromUrl) {
            let seeked = false;
            const positionNum = parseInt(positionFromUrl, 10);
            dp.on('loadedmetadata', () => {
                if (seeked) return;
                if (dp && dp.video && dp.video.duration > 0 && !isNaN(positionNum) && positionNum > 0 && positionNum < dp.video.duration - 1) {
                    try {
                        if (typeof dp.seek === 'function') dp.seek(positionNum);
                        else dp.video.currentTime = positionNum;
                    } catch (e) {
                        dp.video.currentTime = positionNum;
                    }
                    if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(positionNum);
                }
                seeked = true;
            });
        }
    } else {
        showError('无效的视频链接');
    }

    updateEpisodeInfo();
    // Use requestAnimationFrame for initial render to ensure DOM is ready
    requestAnimationFrame(() => {
        renderEpisodes();
        //   console.log('[PlayerApp] renderEpisodes called via requestAnimationFrame in initializePageContent');
    });
    updateButtonStates();
    updateOrderButton();
    setupLineSwitching();

    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000); // Delay progress bar setup slightly

    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', function () {
        saveCurrentProgress();
        saveVideoSpecificProgress();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
            saveVideoSpecificProgress(); // 补充：隐藏时也保存特定进度
        }
    });

    // Ensure critical functions from ui.js are globally available
    let checkUICounter = 0; // Declared with let
    const checkUIInterval = setInterval(() => {
        if (typeof window.addToViewingHistory === 'function' || checkUICounter > 20) { // Check for 2s
            clearInterval(checkUIInterval);
            if (typeof window.addToViewingHistory !== 'function') {
                console.error("UI functions like addToViewingHistory did not become available.");
            }
        }
        checkUICounter++; // Increment counter
    }, 100);

    // Bind custom control buttons after a slight delay
    setTimeout(setupPlayerControls, 100);
}

// --- Ad Filtering Loader (Using Legacy Logic) ---
class EnhancedAdFilterLoader extends Hls.DefaultConfig.loader {
    static cueStart = AD_START_PATTERNS;
    static cueEnd = AD_END_PATTERNS;
    static strip(content) {
        const lines = content.split('\n');
        let inAd = false, out = [];

        for (const l of lines) {
            if (!inAd && this.cueStart.some(re => re.test(l))) { inAd = true; continue; }
            if (inAd && this.cueEnd.some(re => re.test(l))) { inAd = false; continue; }
            if (!inAd && !/^#EXT-X-DISCONTINUITY/.test(l)) out.push(l);

        }
        return out.join('\n');
    }

    load(ctx, cfg, cbs) {
        if ((ctx.type === 'manifest' || ctx.type === 'level') && window.PLAYER_CONFIG?.adFilteringEnabled !== false) {
            const orig = cbs.onSuccess;
            cbs.onSuccess = (r, s, ctx2) => { r.data = EnhancedAdFilterLoader.strip(r.data); orig(r, s, ctx2); };
        }
        super.load(ctx, cfg, cbs);
    }
}

// --- Player Initialization ---
function initPlayer(videoUrl, sourceCode) {
    if (!videoUrl) {
        showError("视频链接无效");
        return;
    }
    if (!Hls || !DPlayer) {
        showError("播放器组件加载失败，请刷新");
        return;
    }

    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    adFilteringEnabled = window.PLAYER_CONFIG?.adFilteringEnabled ?? true;

    const hlsConfig = {
        debug: debugMode || false,
        loader: adFilteringEnabled ? EnhancedAdFilterLoader : Hls.DefaultConfig.loader,
        skipDateRanges: adFilteringEnabled,
        enableWorker: true, lowLatencyMode: false, backBufferLength: 90, maxBufferLength: 30,
        maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000, maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6, fragLoadingMaxRetryTimeout: 64000, fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3, manifestLoadingRetryDelay: 1000, levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000, startLevel: -1, abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7, abrMaxWithRealBitrate: true,
        stretchShortVideoTrack: true, appendErrorMaxRetry: 5, liveSyncDurationCount: 3,
        liveDurationInfinity: false
    };

    try {
        dp = new DPlayer({
            container: document.getElementById('dplayer'),
            autoplay: true, theme: '#00ccff', preload: 'auto', loop: false, lang: 'zh-cn',
            hotkey: true, mutex: true, volume: 0.7, screenshot: true, preventClickToggle: false,
            airplay: true, chromecast: true,
            // Inside initPlayer function:
            // ...
            video: {
                url: videoUrl, type: 'hls',
                // In js/player_app.js -> initPlayer -> video.customType.hls
                customType: {
                    hls: function (video, player) { // `video` is DPlayer's video element, `player` is the DPlayer instance
                        // Use the URL passed directly to switchVideo (via _tempUrlForCustomHls) or from player options.
                        const newSourceUrlToLoad = _tempUrlForCustomHls || (player.options.video && player.options.video.url);
                        _tempUrlForCustomHls = ''; // Clear after use, ensuring it's only used once per switchVideo call

                        console.log(`[CustomHLS] Initializing. Target URL: "${newSourceUrlToLoad}". DPlayer options URL: "${player.options.video ? player.options.video.url : 'N/A'}"`);

                        if (!newSourceUrlToLoad) {
                            console.error("[CustomHLS] CRITICAL: No valid source URL provided to load.");
                            if (typeof showError === 'function') showError("视频链接无效，无法加载。"); // Show error in UI
                            // Trigger DPlayer's error event manually if HLS setup can't proceed
                            if (player && typeof player.error === 'function') {
                                player.error('No valid source URL for HLS customType.');
                            }
                            return; // Stop further execution if no URL
                        }

                        // 1. Destroy any existing HLS instance
                        if (window.currentHls) {
                            console.log("[CustomHLS] Previous HLS instance (window.currentHls) detected. Destroying it.");
                            window.currentHls.destroy(); // This should also detach media if attached
                            window.currentHls = null; // Clear the reference
                        } else {
                            console.log("[CustomHLS] No previous HLS instance (window.currentHls) found to destroy.");
                        }

                        // 2. Aggressively reset the HTML video element state
                        console.log("[CustomHLS] Resetting video element: pause, remove src/source attributes, call load().");
                        video.pause();
                        video.removeAttribute('src'); // Remove direct src attribute
                        // Remove any child <source> elements
                        while (video.firstChild) {
                            video.removeChild(video.firstChild);
                        }
                        // Setting src to empty or calling load() can help reset the media element's internal state.
                        _tempUrlForCustomHls         // This is important to prevent the browser from holding onto the previous stream.
                        video.src = ""; // Setting to empty can sometimes help clear buffers
                        video.load();   // This tells the browser to discard the current media resource state.

                        // 3. Create and configure the new HLS instance
                        console.log("[CustomHLS] Creating new HLS.js instance.");
                        const hls = new Hls(hlsConfig); // hlsConfig should be defined with ad filtering etc.
                        window.currentHls = hls; // Store the new instance

                        // 4. Setup HLS event listeners for the new instance
                        hls.on(Hls.Events.ERROR, function (event, data) {
                            console.error(`[CustomHLS] HLS.js Error. Fatal: ${data.fatal}. Type: ${data.type}. Details: ${data.details}. URL: ${data.url || newSourceUrlToLoad}`, data);
                            if (data.fatal) {
                                if (player && typeof player.error === 'function') { // Use DPlayer's error mechanism
                                    player.error(`HLS.js fatal error: ${data.type} - ${data.details}`);
                                }
                            } else if (data.details === 'bufferSeekOverHole' || data.details === 'bufferAppendError' || data.details === 'bufferNudgeOnStall') {
                                console.warn(`[CustomHLS] HLS.js non-fatal media warning: ${data.details}. Attempting recovery if possible.`);
                                // HLS.js often tries to recover from these. If seeking, it might indicate a bad spot in the stream.
                                if (data.type === Hls.ErrorTypes.MEDIA_ERROR && typeof hls.recoverMediaError === 'function') {
                                    try { hls.recoverMediaError(); } catch (e) { console.error("Error on hls.recoverMediaError()", e); }
                                }
                            }
                        });
                        hls.on(Hls.Events.MANIFEST_LOADED, function (event, data) {
                            console.log(`[CustomHLS] HLS.js Manifest loaded successfully for: ${data.url}`);
                            // DPlayer usually handles play if autoplay is on.
                        });
                        // Add other essential HLS event logging (FRAG_LOADED, LEVEL_LOADED for loading UI)
                        hls.on(Hls.Events.FRAG_LOADED, () => {
                            const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
                            // console.log("[CustomHLS] Fragment loaded.");
                        });
                        hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
                            const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
                            // console.log(`[CustomHLS] Level loaded. Bitrate: ${data.bitrate}`);
                        });


                        // 5. Attach HLS to the media element and load the source
                        console.log(`[CustomHLS] Attaching media element to new HLS instance.`);
                        hls.attachMedia(video);

                        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
                            console.log(`[CustomHLS] Media element attached. Loading source via hls.loadSource(): ${newSourceUrlToLoad}`);
                            hls.loadSource(newSourceUrlToLoad);
                        });
                    }
                }
            }
        });
        window.dp = dp; // Expose DPlayer instance globally
        if (debugMode) console.log("[PlayerApp] DPlayer instance created.");

        // Add DPlayer event listeners
        addDPlayerEventListeners();

        // 安卓特殊hack，防止右半屏菜单
        patchAndroidVideoHack();
        // 添加跳过功能
        handleSkipIntroOutro(dp);

    } catch (playerError) {
        console.error("Failed to initialize DPlayer:", playerError);
        showError("播放器初始化失败");
    }
}

function addDPlayerEventListeners() {
    if (!dp) return;
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    const playerVideoWrap = document.querySelector('#dplayer .dplayer-video-wrap'); // 获取 videoWrap

    dp.on('fullscreen', () => {
        if (debugMode) console.log("[PlayerApp] DPlayer event: fullscreen");
        if (window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('landscape').catch(err => console.warn('屏幕方向锁定失败:', err));
        }
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton && fsButton.querySelector('svg')) {
            fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
            fsButton.setAttribute('aria-label', '退出全屏');
        }
    });

    dp.on('fullscreen_cancel', () => {
        if (debugMode) console.log("[PlayerApp] DPlayer event: fullscreen_cancel");
        if (window.screen.orientation && window.screen.orientation.unlock) {
            window.screen.orientation.unlock();
        }
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton && fsButton.querySelector('svg')) {
            fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
            fsButton.setAttribute('aria-label', '全屏');
        }
    });


    dp.on('loadedmetadata', function () {
        const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
        if (debugMode) console.log(`[PlayerApp][loadedmetadata] 事件已触发。dp 是否有效: ${!!(dp && dp.video)}, 视频时长: ${dp && dp.video ? dp.video.duration : 'N/A'}`);

        // 隐藏加载提示
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
            document.documentElement.classList.remove('show-loading');
        }
        videoHasEnded = false; // 为新加载的视频重置结束标记

        // 如果有精确点击进度条的功能，重新设置
        if (typeof setupProgressBarPreciseClicks === 'function') setupProgressBarPreciseClicks();

        // 安全地尝试跳转（seek）到之前记住的播放位置 (nextSeekPosition)
        if (nextSeekPosition > 0 && dp && dp.video && dp.video.duration > 0) {
            if (nextSeekPosition < dp.video.duration) { // 确保跳转位置在视频有效时长内
                if (typeof dp.seek === 'function') { // 再次检查 seek 方法是否存在
                    console.log(`[PlayerApp][loadedmetadata] 尝试跳转到 nextSeekPosition: ${nextSeekPosition}`);
                    dp.seek(nextSeekPosition); // 执行跳转
                    if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(nextSeekPosition);
                } else {
                    console.error("[PlayerApp][loadedmetadata] dp.seek 不是一个函数！无法恢复播放位置。");
                }
            } else {
                console.warn(`[PlayerApp][loadedmetadata] nextSeekPosition (${nextSeekPosition}) 超出或等于视频时长 (${dp.video.duration})。不进行跳转。`);
            }
        }
        nextSeekPosition = 0; // 无论成功与否，用后重置

        // 为新加载的剧集（在其初始状态或跳转后的状态）保存到观看历史
        if (typeof saveToHistory === 'function') {
            // console.log("[PlayerApp][loadedmetadata] 为新剧集调用 saveToHistory。");
            saveToHistory(); // 此函数应能获取到跳转（如果发生）后的当前时间
        }
        // 启动或重置周期性保存播放进度的计时器
        if (typeof startProgressSaveInterval === 'function') {
            // console.log("[PlayerApp][loadedmetadata] 调用 startProgressSaveInterval。");
            startProgressSaveInterval();
        }

        isNavigatingToEpisode = false; // 重置“正在切换剧集”的标记
        if (debugMode) console.log("[PlayerApp][loadedmetadata] isNavigatingToEpisode 已重置为 false。");

        // ---- 修改核心：延迟并更安全地调用 dp.play() ----
        setTimeout(() => {
            if (!dp || !dp.video) {
                console.warn("[PlayerApp][loadedmetadata][timeout] dp 或 dp.video 在 setTimeout 回调执行时已不再有效。无法尝试播放。");
                return;
            }

            if (dp.video.paused) {
                const playFunction = dp.play;

                if (typeof playFunction === 'function') {
                    const dplayerAutoplayOption = dp.options && dp.options.autoplay;
                    const customAutoplayEnabled = typeof autoplayEnabled !== 'undefined' ? autoplayEnabled : true;

                    if (dplayerAutoplayOption || customAutoplayEnabled) {
                        console.log(`[PlayerApp][loadedmetadata][timeout] 视频已暂停。尝试调用 dp.play()。DPlayer 内置 autoplay: ${dplayerAutoplayOption}, 自定义 autoplayEnabled: ${customAutoplayEnabled}`);
                        try {
                            const playPromise = playFunction.call(dp);
                            if (playPromise && typeof playPromise.catch === 'function') {
                                playPromise.catch(e => {
                                    console.warn("[PlayerApp][loadedmetadata][timeout] dp.play() Promise 被浏览器阻止或发生错误。用户可能需要手动点击播放按钮。", e);
                                });
                            } else if (playPromise === undefined) {
                                console.log("[PlayerApp][loadedmetadata][timeout] dp.play() returned undefined. Play might have been attempted or prevented without a promise.");
                                // Autoplay might be blocked by the browser, and DPlayer's play() might return undefined in such cases
                                // without throwing a catchable promise error. User might need to interact.
                            }
                        } catch (syncError) {
                            console.warn("[PlayerApp][loadedmetadata][timeout]调用 dp.play() 时发生同步错误。", syncError);
                        }
                    } else {
                        // console.log("[PlayerApp][loadedmetadata][timeout] 视频已暂停，但所有自动播放选项均已禁用。");
                    }
                } else {
                    console.error("[PlayerApp][loadedmetadata][timeout] 严重错误：dp.play (在延迟后检查) 仍然不是一个函数！DPlayer 实例状态:", dp);
                }
            } else {
                // console.log("[PlayerApp][loadedmetadata][timeout] 视频已在播放中或不处于可检查暂停的状态。");
            }
        }, 100);
        // ---- 修改核心结束 ----
    });

    dp.on('error', function (e) {
        console.error("DPlayer error event:", e);
        if (dp.video && dp.video.currentTime > 1) { // Allow errors if playing for >1s
            if (debugMode) console.log('DPlayer error ignored as video was playing.');
            return;
        }
        showError('播放器遇到错误，请检查视频源');
    });

    setupLongPressSpeedControl();
    // 新增：调用双击处理函数
    if (playerVideoWrap) {
        setupDoubleClickToPlayPause(dp, playerVideoWrap);
    }

    dp.on('seeking', function () { if (debugMode) console.log("[PlayerApp] DPlayer event: seeking"); isUserSeeking = true; videoHasEnded = false; });
    dp.on('seeked', function () {
        if (debugMode) console.log("[PlayerApp] DPlayer event: seeked");
        // Adjust if seeked very close to the end
        if (dp.video && dp.video.duration > 0) {
            const timeFromEnd = dp.video.duration - dp.video.currentTime;
            if (timeFromEnd < 0.3 && isUserSeeking) {
                dp.video.currentTime = Math.max(0, dp.video.currentTime - 1);
            }
        }
        setTimeout(() => { isUserSeeking = false; }, 200); // Reset seeking flag after a short delay
    });

    dp.on('pause', function () {
        if (debugMode) console.log("[PlayerApp] DPlayer event: pause");
        saveVideoSpecificProgress();
        // saveCurrentProgress(); // 可选：如果也想在暂停时更新观看历史列表
    });
    dp.on('seeking', saveVideoSpecificProgress); // 兼容iOS
    dp.on('seeked', saveVideoSpecificProgress); // 兼容iOS

    dp.on('ended', function () {
        videoHasEnded = true;
        saveCurrentProgress(); // Ensure final progress is saved
        clearVideoProgress(); // Clear progress for *this specific video*
        if (!autoplayEnabled) return;       // 用户关掉了自动连播
        const nextIdx = currentEpisodeIndex + 1;   // 始终 +1（上一条回复已统一）
        if (nextIdx < currentEpisodes.length) {
            setTimeout(() => {
                // 再确认一下确实播完 & 没有人在拖动
                if (videoHasEnded && !isUserSeeking) playEpisode(nextIdx);
            }, 1000);                       // 1 s 延迟，防误触
        } else {
            if (debugMode) console.log('[PlayerApp] 已到最后一集，自动连播停止');
        }
    });

    dp.on('timeupdate', function () {
        // Reset ended flag if user seeks back after video ended
        if (dp.video && dp.video.duration > 0) {
            if (isUserSeeking && dp.video.currentTime > dp.video.duration * 0.95) {
                videoHasEnded = false;
            }
        }
    });

    // Add a timeout to show a message if loading takes too long
    setTimeout(function () {
        // Check if player exists, video exists, AND readyState suggests still loading/not enough data
        if (dp && dp.video && dp.video.readyState < 3 && !videoHasEnded) {
            const loadingEl = document.getElementById('loading');
            if (loadingEl && loadingEl.style.display !== 'none') {
                loadingEl.innerHTML = `<div class="loading-spinner"></div><div>视频加载时间较长...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源或刷新</div>`;
                if (debugMode) console.warn("[PlayerApp] Loading timeout reached.");
            }
        }
    }, 15000); // Increased timeout to 15s

    // Native fullscreen integration for DPlayer's *internal* button actions
    (function () {
        const dplayerElement = document.getElementById('dplayer');
        if (dplayerElement) {
            dp.on('fullscreen', () => { // DPlayer *enters* its fullscreen mode
                if (document.fullscreenElement || document.webkitFullscreenElement) return; // Already native FS
                if (dplayerElement.requestFullscreen) dplayerElement.requestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed:', err));
                else if (dplayerElement.webkitRequestFullscreen) dplayerElement.webkitRequestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed (webkit):', err));
            });
            dp.on('fullscreen_cancel', () => { // DPlayer *exits* its fullscreen mode
                if (!document.fullscreenElement && !document.webkitFullscreenElement) return; // Not in native FS
                if (document.exitFullscreen) document.exitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed:', err));
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed (webkit):', err));
            });
        }
    })();
}

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', () => { window.location.href = 'index.html'; });
    }

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (dp && dp.fullScreen && typeof dp.fullScreen.toggle === 'function') {
                dp.fullScreen.toggle();
            } else {
                const playerContainer = document.getElementById('dplayer');
                if (playerContainer) {
                    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                        if (playerContainer.requestFullscreen) playerContainer.requestFullscreen().catch(err => console.error("Fallback FS error:", err));
                        else if (playerContainer.webkitRequestFullscreen) playerContainer.webkitRequestFullscreen().catch(err => console.error("Fallback FS error (webkit):", err));
                    } else {
                        if (document.exitFullscreen) document.exitFullscreen().catch(err => console.error("Fallback exit FS error:", err));
                        else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.error("Fallback exit FS error (webkit):", err));
                    }
                }
            }
        });
    }

    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            const urlParamsRetry = new URLSearchParams(window.location.search);
            const videoUrlRetry = urlParamsRetry.get('url');
            const sourceCodeRetry = urlParamsRetry.get('source_code');
            if (videoUrlRetry) {
                const errorEl = document.getElementById('error'); if (errorEl) errorEl.style.display = 'none';
                const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'flex';
                _tempUrlForCustomHls = videoUrlRetry;
                if (dp && dp.video) {
                    //  console.log("[PlayerApp] Retrying: Switching video.");
                    dp.switchVideo({ url: videoUrlRetry, type: 'hls' });
                    dp.play();
                } else {
                    //    console.log("[PlayerApp] Retrying: Re-initializing player.");
                    initPlayer(videoUrlRetry, sourceCodeRetry);
                }
            } else {
                showError('无法重试，视频链接无效');
            }
        });
    }

    const prevEpisodeBtn = document.getElementById('prev-episode');
    if (prevEpisodeBtn) prevEpisodeBtn.addEventListener('click', window.playPreviousEpisode); // Use global

    const nextEpisodeBtn = document.getElementById('next-episode');
    if (nextEpisodeBtn) nextEpisodeBtn.addEventListener('click', window.playNextEpisode); // Use global

    const orderBtn = document.getElementById('order-button');
    if (orderBtn) orderBtn.addEventListener('click', toggleEpisodeOrder); // toggleEpisodeOrder is local

    // Add lock button event listener
    const lockButton = document.getElementById('lock-button');
    if (lockButton) lockButton.addEventListener('click', toggleLockScreen);
}

function saveVideoSpecificProgress() {
    if (isNavigatingToEpisode) return;
    const toggle = document.getElementById('remember-episode-progress-toggle');
    if (!toggle || !toggle.checked) { return; }

    if (!dp || !dp.video || typeof currentVideoTitle === 'undefined' || typeof currentEpisodeIndex !== 'number' || !currentEpisodes || currentEpisodes.length === 0) {
        return;
    }

    const currentTime = Math.floor(dp.video.currentTime);
    const duration = Math.floor(dp.video.duration);

    const showId = getShowIdentifier(false); // <--- 使用新的函数获取剧集ID

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.95) {
        try {
            let allShowsProgresses = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
            if (!allShowsProgresses[showId]) { // <--- 如果该剧还没有进度对象，则创建
                allShowsProgresses[showId] = {};
            }
            // 保存当前集数的进度
            allShowsProgresses[showId][currentEpisodeIndex.toString()] = currentTime; // <--- 在剧集对象下保存特定集的进度
            // 记录这个视频最后播放到哪一集
            allShowsProgresses[showId].lastPlayedEpisodeIndex = currentEpisodeIndex; // <--- 在剧集对象下记录
            allShowsProgresses[showId].totalEpisodes = currentEpisodes.length; // (可选)

            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allShowsProgresses));
        } catch (e) {
            console.error('保存特定视频集数进度失败:', e);
        }
    }
}

// （可选）用于在关闭“记住进度”时清除当前视频的集数进度
function clearCurrentVideoSpecificEpisodeProgresses() {
    const showId = getShowIdentifier(false);

    try {
        const allProgress = JSON.parse(localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}');
        if (allProgress[showId]) {
            delete allProgress[showId];
            localStorage.setItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY, JSON.stringify(allProgress));

            if (typeof showToast === 'function') {
                showToast(`已清除《${currentVideoTitle}》的各集播放进度`, 'info');
            }
        }
    } catch (e) {
        console.error('清除特定视频集数进度失败:', e);
    }
}

function showError(message) {
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    if (dp && dp.video && dp.video.currentTime > 1 && !debugMode) { // Show error even if playing if debug mode is on
        console.warn('Ignoring error as video is playing:', message);
        return;
    }
    const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold'); // More specific
        if (errorTextElement) errorTextElement.textContent = message;
        else errorElement.children[1].textContent = message; // Fallback
        errorElement.style.display = 'flex';
    }
    if (typeof window.showMessage === 'function') window.showMessage(message, 'error'); // Use global showMessage from ui.js
    else console.error("showMessage function not found. Error:", message);
}

function setupProgressBarPreciseClicks() {
    if (!dp) return;
    // Need to wait slightly for DPlayer to render its progress bar
    setTimeout(() => {
        const progressBar = document.querySelector('#dplayer .dplayer-bar-wrap');
        if (!progressBar) { console.warn('DPlayer进度条元素未找到 (.dplayer-bar-wrap)'); return; }
        progressBar.removeEventListener('click', handleProgressBarClick);
        progressBar.removeEventListener('touchend', handleProgressBarTouch);
        progressBar.addEventListener('click', handleProgressBarClick);
        progressBar.addEventListener('touchend', handleProgressBarTouch);
    }, 500); // Delay setup
}

function handleProgressBarClick(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const clickTime = percentage * dp.video.duration;
    userClickedPosition = clickTime;
    dp.seek(clickTime);
}

function handleProgressBarTouch(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.changedTouches || !e.changedTouches[0] || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const offsetX = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const touchTime = percentage * dp.video.duration;
    userClickedPosition = touchTime;
    dp.seek(touchTime);
}

function handleKeyboardShortcuts(e) {
    if (!dp || (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))) return;
    if (isScreenLocked && (e.key !== 'f' && e.key !== 'F' && e.key !== "Escape")) return;
    let actionText = '', direction = '';
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    switch (e.key) {
        case 'ArrowLeft':
            if (e.altKey) { if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { dp.seek(Math.max(0, dp.video.currentTime - 5)); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowRight':
            if (e.altKey) { if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { dp.seek(Math.min(dp.video.duration, dp.video.currentTime + 5)); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageUp': if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageDown': if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case ' ': // Spacebar for play/pause
            dp.toggle(); actionText = dp.video.paused ? '暂停' : '播放'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowUp': dp.volume(Math.min(1, dp.video.volume + 0.1)); actionText = `音量 ${Math.round(dp.video.volume * 100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowDown': dp.volume(Math.max(0, dp.video.volume - 0.1)); actionText = `音量 ${Math.round(dp.video.volume * 100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'f': dp.fullScreen.toggle(); actionText = '切换全屏'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break; // 'f' for fullscreen toggle
    }
    if (actionText && typeof showShortcutHint === 'function') showShortcutHint(actionText, direction);
}

function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcut-hint');
    if (!hintElement) return;
    if (shortcutHintTimeout) clearTimeout(shortcutHintTimeout);
    const keyElement = document.getElementById('shortcut-key');
    const actionElement = document.getElementById('shortcut-action');
    if (keyElement && actionElement) {
        if (direction === 'left') keyElement.innerHTML = '◀';
        else if (direction === 'right') keyElement.innerHTML = '▶';
        else keyElement.innerHTML = ''; // Clear for actions like play/pause/volume
        actionElement.textContent = text;
    }
    hintElement.classList.add('show');
    shortcutHintTimeout = setTimeout(() => hintElement.classList.remove('show'), 1500);
}

// 在 js/player_app.js 文件中，可以放在 setupLongPressSpeedControl 函数的上方或下方

/**
 * 设置双击播放/暂停功能
 * @param {object} dpInstance DPlayer 实例
 * @param {HTMLElement} videoWrapElement 视频的包装元素 (通常是 .dplayer-video-wrap)
 */
function setupDoubleClickToPlayPause(dpInstance, videoWrapElement) {
    if (!dpInstance || !videoWrapElement) {
        console.warn('[DoubleClick] DPlayer instance or video wrap element not provided.');
        return;
    }

    if (videoWrapElement._doubleTapListenerAttached) {
        return; // 防止重复绑定监听器
    }

    videoWrapElement.addEventListener('touchend', function (e) {
        if (isScreenLocked) { // isScreenLocked 是您代码中已有的全局变量
            return; // 屏幕锁定时，不响应双击
        }

        // 选择器数组，用于判断触摸是否发生在DPlayer的控件上
        const controlSelectors = [
            '.dplayer-controller', // DPlayer 主控制条区域
            '.dplayer-setting',    // 设置菜单
            '.dplayer-comment',    // 弹幕相关（如果启用并可交互）
            '.dplayer-notice',     // 播放器通知
            '#episode-grid button',// 外部的选集按钮
            // 可以根据需要添加其他自定义的、位于 videoWrapElement 内的交互控件选择器
        ];

        let tappedOnControl = false;
        for (const selector of controlSelectors) {
            if (e.target.closest(selector)) {
                tappedOnControl = true;
                break;
            }
        }

        if (tappedOnControl) {
            // 如果点击发生在控件上，则重置lastTapTimeForDoubleTap，避免影响下一次真正的视频区域点击
            lastTapTimeForDoubleTap = 0;
            return; // 不执行双击播放/暂停逻辑
        }

        const currentTime = new Date().getTime();
        if ((currentTime - lastTapTimeForDoubleTap) < DOUBLE_TAP_INTERVAL) {
            // 检测到双击
            if (dpInstance && typeof dpInstance.toggle === 'function') {
                dpInstance.toggle(); // 切换播放/暂停状态
            }
            lastTapTimeForDoubleTap = 0; // 重置时间戳，防止连续三次点击被误判
        } else {
            // 单击 (或者是双击的第一次点击)
            lastTapTimeForDoubleTap = currentTime;
        }
        // DPlayer 自己的单击事件会处理UI显隐，我们这里不需要额外操作
        // 也不要在这里调用 e.preventDefault() 或 e.stopPropagation()，除非有非常明确的理由
    }, { passive: true }); // 使用 passive: true 明确表示我们不阻止默认的单击行为

    videoWrapElement._doubleTapListenerAttached = true; // 添加标记，表示已绑定
}

function setupLongPressSpeedControl() {
    if (!dp) return;
    const playerVideoWrap = document.querySelector('#dplayer .dplayer-video-wrap');
    if (!playerVideoWrap) {
        console.warn('DPlayer video wrap for long press not found.');
        return;
    }

    let longPressTimer = null;
    let originalSpeed = 1.0;
    let speedChangedByLongPress = false; // Flag to track if speed was changed by our long press

    // TOUCHSTART: Handles setting up the long press for speed change
    playerVideoWrap.addEventListener('touchstart', function (e) {
        if (isScreenLocked) return;

        const touchX = e.touches[0].clientX;
        const rect = playerVideoWrap.getBoundingClientRect();

        // Only set up long press if touch starts on the right half
        if (touchX > rect.left + rect.width / 2) {
            // DO NOT call e.preventDefault() here.
            // This allows DPlayer to handle short taps normally for UI toggle.
            // Context menu will be handled by the 'contextmenu' event listener.

            originalSpeed = dp.video.playbackRate;
            if (longPressTimer) clearTimeout(longPressTimer);

            speedChangedByLongPress = false; // Reset before setting timer

            longPressTimer = setTimeout(() => {
                if (isScreenLocked || !dp || !dp.video || dp.video.paused) {
                    speedChangedByLongPress = false; // Ensure flag is false if bailing
                    return;
                }
                dp.speed(2.0);
                speedChangedByLongPress = true; // Set flag only if speed actually changes
                if (typeof showMessage === 'function') showMessage('播放速度: 2.0x', 'info', 1000);
            }, 300);
        } else {
            // Touch started on the left half, clear any pending long press timer from a previous touch
            if (longPressTimer) clearTimeout(longPressTimer);
            speedChangedByLongPress = false;
        }
    }, { passive: true }); // IMPORTANT: Use passive: true if not calling preventDefault

    // TOUCHEND / TOUCHCANCEL: Handles reverting speed if long press occurred
    const endLongPress = function () {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;

        if (speedChangedByLongPress) {
            if (dp && dp.video) {
                dp.speed(originalSpeed);
            }
            if (typeof showMessage === 'function') showMessage(`播放速度: ${originalSpeed.toFixed(1)}x`, 'info', 1000);
        }
        speedChangedByLongPress = false; // Reset flag on touch end/cancel
    };

    playerVideoWrap.addEventListener('touchend', endLongPress);
    playerVideoWrap.addEventListener('touchcancel', endLongPress);

    // CONTEXTMENU: Handles preventing the context menu on mobile for the right half
    // Add this listener only once
    if (!playerVideoWrap._contextMenuListenerAttached) {
        playerVideoWrap.addEventListener('contextmenu', function (e) {
            if (!isMobile()) return; // Only act on mobile

            const rect = playerVideoWrap.getBoundingClientRect();
            // Use event's clientX for coordinate. For contextmenu from touch, this is usually the touch point.
            if (e.clientX > rect.left + rect.width / 2) {
                e.preventDefault(); // Prevent context menu if on the right half on mobile
            }
        });
        playerVideoWrap._contextMenuListenerAttached = true;
    }
}

function showPositionRestoreHint(position) {
    if (typeof showMessage !== 'function' || !position || position < 10) return;
    const minutes = Math.floor(position / 60);
    const seconds = Math.floor(position % 60);
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    showMessage(`已从 ${formattedTime} 继续播放`, 'info');
}

function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) { console.warn("Message element not found"); return; }

    let bgColorClass = ({ error: 'bg-red-500', success: 'bg-green-500', warning: 'bg-yellow-500', info: 'bg-blue-500' })[type] || 'bg-blue-500';

    // Reset classes and apply new ones
    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm ${bgColorClass} text-white transition-opacity duration-300 opacity-0`;
    messageElement.textContent = text;

    // Force reflow to apply initial opacity-0 before transitioning
    void messageElement.offsetWidth;

    messageElement.classList.remove('opacity-0');
    messageElement.classList.add('opacity-100');

    // Clear previous timeout if exists
    if (messageElement._messageTimeout) {
        clearTimeout(messageElement._messageTimeout);
    }

    messageElement._messageTimeout = setTimeout(() => {
        messageElement.classList.remove('opacity-100');
        messageElement.classList.add('opacity-0');
        messageElement._messageTimeout = null;
    }, duration);
}

function toggleLockScreen() {
    isScreenLocked = !isScreenLocked;
    const playerContainer = document.querySelector('.player-container');
    const lockButton = document.getElementById('lock-button');
    const lockIcon = document.getElementById('lock-icon'); // 确保SVG元素有此ID

    if (playerContainer) {
        playerContainer.classList.toggle('player-locked', isScreenLocked);
    }

    if (lockButton && lockIcon) {
        if (isScreenLocked) {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-unlock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
            lockButton.setAttribute('aria-label', '解锁屏幕');
            if (typeof showMessage === 'function') showMessage('屏幕已锁定', 'info'); // 或者 showToast
        } else {
            lockIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-lock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
            lockButton.setAttribute('aria-label', '锁定屏幕');
            if (typeof showMessage === 'function') showMessage('屏幕已解锁', 'info'); // 或者 showToast
        }
    }
}

function renderEpisodes() {
    const grid = document.getElementById('episode-grid');
    if (!grid) { setTimeout(renderEpisodes, 100); return; }
    // ★ 让选集区域可见 / 隐藏
    const container = document.getElementById('episodes-container');
    if (container) {
        if (currentEpisodes.length > 1) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    }

    // ★ 更新“共 x 集”文字
    const countSpan = document.getElementById('episodes-count');
    if (countSpan) countSpan.textContent = `共 ${currentEpisodes.length} 集`;

    grid.innerHTML = '';

    if (!currentEpisodes.length) {
        grid.innerHTML =
            '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }

    const order = [...Array(currentEpisodes.length).keys()];
    if (episodesReversed) order.reverse();          // 倒序显示

    order.forEach(idx => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = idx === currentEpisodeIndex
            ? 'p-2 rounded episode-active'
            : 'p-2 rounded bg-[#222] hover:bg-[#333] text-gray-300';
        btn.textContent = idx + 1;
        btn.dataset.index = idx;                  // 关键：把真实下标写到 data 上
        grid.appendChild(btn);
    });

    /* 只在父层做一次事件代理，彻底避免闭包 */
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

    // 只有在剧集总数 > 1 时才显示题注
    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        const totalEpisodes = window.currentEpisodes.length;
        const currentDisplayNumber = window.currentEpisodeIndex + 1; // 1-based

        // 题注样式：第 x / y 集
        episodeInfoSpan.textContent = `第 ${currentDisplayNumber} / ${totalEpisodes} 集`;

        // 同步顶部 “共 n 集” 小字
        const episodesCountEl = document.getElementById('episodes-count');
        if (episodesCountEl) {
            episodesCountEl.textContent = `共 ${totalEpisodes} 集`;
        }
    } else {
        // 如果只有单集或数据缺失，就清空题注
        episodeInfoSpan.textContent = '';
    }
}

// 复制播放链接
function copyLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || (dp && dp.video && dp.video.src) || ''; // 尝试从播放器获取当前链接作为备选

    if (!linkUrl) {
        if (typeof showToast === 'function') {
            showToast('没有可复制的视频链接', 'warning');
        } else {
            alert('没有可复制的视频链接');
        }
        return;
    }

    navigator.clipboard.writeText(linkUrl).then(() => {
        if (typeof showToast === 'function') { // 检查 showToast 是否可用
            showToast('当前视频链接已复制', 'success');
        } else {
            console.error("showToast function is not available in player_app.js");
            alert('当前视频链接已复制 (showToast unavailable)'); // 降级提示
        }
    }).catch(err => {
        console.error('复制链接失败:', err);
        if (typeof showToast === 'function') {
            showToast('复制失败，请检查浏览器权限', 'error');
        } else {
            console.error("showToast function is not available in player_app.js");
            alert('复制失败 (showToast unavailable)'); // 降级提示
        }
    });
}

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    updateOrderButton(); // 更新排序按钮的视觉状态
    renderEpisodes();    // 重新渲染集数列表以反映新的排序
}

function updateOrderButton() {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    // 清空原 path 后填充新图标
    icon.innerHTML = episodesReversed
        ? '<polyline points="18 15 12 9 6 15"></polyline>'  // ⬆️  倒序
        : '<polyline points="6 9 12 15 18 9"></polyline>';  // ⬇️  正序
}

function playPreviousEpisode() {
    if (!currentEpisodes.length) return;
    const prevIdx = currentEpisodeIndex - 1;          // 无论正序 / 倒序都减 1
    if (prevIdx >= 0) {
        playEpisode(prevIdx);
    } else showMessage('已经是第一集了', 'info');
}
window.playPreviousEpisode = playPreviousEpisode;

function playNextEpisode() {
    if (!currentEpisodes.length) return;
    const nextIdx = currentEpisodeIndex + 1;          // 始终加 1
    if (nextIdx < currentEpisodes.length) {
        playEpisode(nextIdx);
    } else showMessage('已经是最后一集了', 'info');
}
window.playNextEpisode = playNextEpisode;

function updateButtonStates() {
    const prevButton = document.getElementById('prev-episode');
    const nextButton = document.getElementById('next-episode');
    const totalEpisodes = window.currentEpisodes ? window.currentEpisodes.length : 0;

    if (prevButton) {
        // "Previous" button is disabled if currentEpisodeIndex is 0 (first actual episode)
        prevButton.disabled = window.currentEpisodeIndex <= 0;
        prevButton.classList.toggle('opacity-50', prevButton.disabled);
        prevButton.classList.toggle('cursor-not-allowed', prevButton.disabled);
    }
    if (nextButton) {
        // "Next" button is disabled if currentEpisodeIndex is the last actual episode
        nextButton.disabled = window.currentEpisodeIndex >= totalEpisodes - 1;
        nextButton.classList.toggle('opacity-50', nextButton.disabled);
        nextButton.classList.toggle('cursor-not-allowed', nextButton.disabled);
    }
}

function saveCurrentProgress() {
    if (!dp || !dp.video || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = dp.video.currentTime;
    const duration = dp.video.duration;

    // Only save if meaningful progress has been made and video hasn't practically ended
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) { // Check against 98% to avoid saving if "ended" event was missed
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex],
                episodeIndex: window.currentEpisodeIndex,
                vod_id: vodIdForPlayer || '', // <--- 使用全局的 vodIdForPlayer
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

function startProgressSaveInterval() {
    if (progressSaveInterval) clearInterval(progressSaveInterval);
    progressSaveInterval = setInterval(() => {
        saveCurrentProgress(); // 这个是保存到“观看历史列表”的
        saveVideoSpecificProgress(); // 新增调用，保存特定视频的集数进度
    }, 8000); // Save every 8 seconds，iOS 建议
}

function saveToHistory() { // This is more like an "initial save" or "episode change save"
    if (!dp || !dp.video || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            vod_id: vodIdForPlayer || '', // <--- 使用全局的 vodIdForPlayer
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || 'unknown_source',
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            episodes: window.currentEpisodes,
            playbackPosition: Math.floor(dp.video.currentTime),
            duration: Math.floor(dp.video.duration) || 0,
            timestamp: Date.now()
        };
        window.addToViewingHistory(videoInfo);
    } catch (e) {
        console.error('保存到历史记录失败:', e);
    }
}

function clearVideoProgress() { // This seems to clear localStorage progress, not related to viewing history
    const progressKey = `videoProgress_${getVideoId()}`;
    try {
        localStorage.removeItem(progressKey);
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('已清除 localStorage 播放进度记录 for ' + progressKey);
    } catch (e) { console.error('清除 localStorage 播放进度记录失败', e); }
}

function getVideoId() {
    const sourceCode = new URLSearchParams(window.location.search).get('source_code') || 'unknown';
    return `${encodeURIComponent(currentVideoTitle)}_${sourceCode}_ep${window.currentEpisodeIndex}`;
}

/**
 * 跳播到指定集数；已就绪时仅切流，不再整页刷新
 * @param {number} index 目标集数索引（0-based）
 */

function playEpisode(index) {
    if (!dp) {
        if (typeof showError === 'function') showError("播放器遇到问题，无法切换。");
        return;
    }
    if (!currentEpisodes || index < 0 || index >= currentEpisodes.length) {
        if (typeof showError === 'function') showError("无效的剧集选择。");
        return;
    }
    if (isNavigatingToEpisode && currentEpisodeIndex === index) {
        return;
    }

    if (dp.video && dp.video.src && typeof currentEpisodeIndex === 'number' && currentEpisodes[currentEpisodeIndex] && dp.video.currentTime > 5) {
        saveVideoSpecificProgress();
    }

    isNavigatingToEpisode = true;

    const oldEpisodeIndexForRevertOnError = currentEpisodeIndex;
    const rememberEpisodeProgressToggle = document.getElementById('remember-episode-progress-toggle');
    const shouldRestoreSpecificProgress = rememberEpisodeProgressToggle ? rememberEpisodeProgressToggle.checked : true;

    const newEpisodeUrl = currentEpisodes[index];
    if (!newEpisodeUrl || typeof newEpisodeUrl !== 'string' || !newEpisodeUrl.trim()) {
        currentEpisodeIndex = oldEpisodeIndexForRevertOnError;
        window.currentEpisodeIndex = oldEpisodeIndexForRevertOnError;
        isNavigatingToEpisode = false;
        if (typeof showError === 'function') showError("此剧集链接无效，无法播放。");
        return;
    }

    // 进度恢复弹窗逻辑整合
    nextSeekPosition = 0;
    if (shouldRestoreSpecificProgress) {
        const showId = getShowIdentifier(false);   // 与 saveVideoSpecificProgress 保持一致
        const allSpecificProgresses = JSON.parse(
            localStorage.getItem(VIDEO_SPECIFIC_EPISODE_PROGRESSES_KEY) || '{}'
        );
        const savedProgressDataForVideo = allSpecificProgresses[showId];

        if (savedProgressDataForVideo) {
            const positionToResume = savedProgressDataForVideo[index.toString()]
                ? parseInt(savedProgressDataForVideo[index.toString()])
                : 0;
            // 判断是否弹窗
            if (positionToResume > 5 && currentEpisodes[index]) {
                showProgressRestoreModal({
                    title: "继续播放？",
                    content: `《${currentVideoTitle}》第 ${index + 1} 集有播放记录，<br>是否从 <span style="color:#00ccff">${formatPlayerTime(positionToResume)}</span> 继续播放？`,
                    confirmText: "继续播放",
                    cancelText: "从头播放"
                }).then(wantsToResume => {
                    if (wantsToResume) {
                        nextSeekPosition = positionToResume;
                    } else {
                        nextSeekPosition = 0;
                    }
                    doEpisodeSwitch(index, newEpisodeUrl);
                });
                return;
            }
        }
    }

    // 没有弹窗场景直接切换
    doEpisodeSwitch(index, newEpisodeUrl);
}

// 提取实际切集逻辑为独立函数
function doEpisodeSwitch(index, url) {
    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index;
    const newEpisodeUrl = url;

    // 更新UI
    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    document.title = `${currentVideoTitle} - 第 ${currentEpisodeIndex + 1} 集 - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = `${currentVideoTitle} (第 ${currentEpisodeIndex + 1} 集)`;
    if (typeof updateEpisodeInfo === 'function') updateEpisodeInfo();
    if (typeof renderEpisodes === 'function') renderEpisodes();
    if (typeof updateButtonStates === 'function') updateButtonStates();

    // Loading
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        const loadingTextEl = loadingEl.querySelector('div:last-child');
        if (loadingTextEl) loadingTextEl.textContent = '正在加载剧集...';
        loadingEl.style.display = 'flex';
        document.documentElement.classList.add('show-loading');
    }
    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'none';

    // 切视频
    _tempUrlForCustomHls = newEpisodeUrl;
    dp.video.pause();
    dp.switchVideo({ url: newEpisodeUrl, type: 'hls' });
    patchAndroidVideoHack();
    if (typeof handleSkipIntroOutro === 'function' && dp) handleSkipIntroOutro(dp);
    videoHasEnded = false;

    // 更新url
    const newUrlForBrowser = new URL(window.location.href);
    newUrlForBrowser.searchParams.set('url', newEpisodeUrl);
    newUrlForBrowser.searchParams.set('title', currentVideoTitle);
    newUrlForBrowser.searchParams.set('index', currentEpisodeIndex.toString());

    const currentSourceCode = new URLSearchParams(window.location.search).get('source_code');
    if (currentSourceCode) newUrlForBrowser.searchParams.set('source_code', currentSourceCode);

    const adFilteringStorageKey = (PLAYER_CONFIG && PLAYER_CONFIG.adFilteringStorage) ? PLAYER_CONFIG.adFilteringStorage : 'adFilteringEnabled';
    const adFilteringActive = (typeof getBoolConfig === 'function') ? getBoolConfig(adFilteringStorageKey, false) : false;
    newUrlForBrowser.searchParams.set('af', adFilteringActive ? '1' : '0');
    newUrlForBrowser.searchParams.delete('position');
    window.history.pushState(
        { path: newUrlForBrowser.toString(), episodeIndex: currentEpisodeIndex },
        '',
        newUrlForBrowser.toString()
    );
}

window.playEpisode = playEpisode;

/**
 * 设置线路切换功能 (优化版)
 * - 增加了 touchend 事件处理，以兼容移动端设备。
 * - 动态判断菜单弹出方向（向上或向下）。
 * - 使用 guard flag 确保事件监听器只绑定一次。
 */
function setupLineSwitching() {
    const button = document.getElementById('line-switch-button');
    const dropdown = document.getElementById('line-switch-dropdown');
    if (!button || !dropdown) return;

    // 1. 使用 guard flag 防止重复绑定事件监听器
    if (button._lineSwitchListenerAttached) {
        return;
    }

    // 2. 封装核心的菜单更新和显示/隐藏逻辑
    const updateAndToggleMenu = (event) => {
        event.stopPropagation();

        // 动态生成菜单内容
        const currentSourceCode = new URLSearchParams(window.location.search).get('source_code');
        const selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '[]');
        const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');
        dropdown.innerHTML = '';

        const availableSources = [];
        if (selectedAPIs.length > 0) {
            selectedAPIs.forEach(sourceCode => {
                let apiInfo = {};
                if (sourceCode.startsWith('custom_')) {
                    const index = parseInt(sourceCode.replace('custom_', ''));
                    const customApi = customAPIs[index];
                    if (customApi) apiInfo = { name: customApi.name };
                } else if (window.API_SITES && window.API_SITES[sourceCode]) {
                    apiInfo = { name: window.API_SITES[sourceCode].name };
                }
                if (apiInfo.name) {
                    availableSources.push({ name: apiInfo.name, code: sourceCode });
                }
            });
        }

        if (availableSources.length > 0) {
            availableSources.forEach(source => {
                const item = document.createElement('button');
                item.textContent = source.name;
                item.dataset.sourceCode = source.code;
                item.className = 'w-full text-left px-3 py-2 rounded text-sm transition-colors';
                if (source.code === currentSourceCode) {
                    item.classList.add('line-active');
                    item.disabled = true;
                }
                dropdown.appendChild(item);
            });
        } else {
            dropdown.innerHTML = `<div class="text-center text-sm text-gray-500 py-2">无可用线路</div>`;
        }

        // --- 新增：动态定位逻辑 ---
        // 仅在准备显示菜单时计算位置
        if (dropdown.classList.contains('hidden')) {
            const buttonRect = button.getBoundingClientRect();
            const spaceBelow = window.innerHeight - buttonRect.bottom;

            // 使用辅助类来测量高度，避免闪烁
            dropdown.classList.add('measure-height');
            const dropdownHeight = dropdown.offsetHeight;
            dropdown.classList.remove('measure-height');

            // 如果下方空间不足，且上方空间足够，则向上弹出
            if (spaceBelow < (dropdownHeight + 10) && buttonRect.top > dropdownHeight) {
                dropdown.classList.add('dropdown-top');
            } else {
                dropdown.classList.remove('dropdown-top');
            }
        }
        // --- 动态定位逻辑结束 ---

        // 切换菜单的可见性
        dropdown.classList.toggle('hidden');
    };

    // 3. 为桌面端和移动端绑定事件
    button.addEventListener('click', updateAndToggleMenu);
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        updateAndToggleMenu(e);
    });

    // 4. 设置 flag，表示监听器已附加
    button._lineSwitchListenerAttached = true;

    // 5. 为下拉菜单和文档本身绑定一次性事件
    if (!dropdown._actionListener) {
        dropdown.addEventListener('click', (e) => {
            const target = e.target.closest('button[data-source-code]');
            if (target && !target.disabled) {
                dropdown.classList.add('hidden');
                switchLine(target.dataset.sourceCode);
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

/**
 * 切换线路的核心逻辑
 * @param {string} newSourceCode - 新的数据源标识
 */
async function switchLine(newSourceCode) {
    if (!dp || !currentVideoTitle) {
        showError("无法切换线路：播放器或视频信息丢失");
        return;
    }

    const timeToSeek = dp.video.currentTime;
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    if (loadingEl) {
        const loadingTextEl = loadingEl.querySelector('div:last-child');
        if (loadingTextEl) loadingTextEl.textContent = '正在切换线路...';
        loadingEl.style.display = 'flex';
    }
    if (errorEl) errorEl.style.display = 'none';

    try {
        // 1. 获取新线路的API信息
        const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');
        let apiInfo = {};
        let isCustom = newSourceCode.startsWith('custom_');
        if (isCustom) {
            const index = parseInt(newSourceCode.replace('custom_', ''));
            apiInfo = customAPIs[index];
        } else {
            apiInfo = window.API_SITES[newSourceCode];
        }

        if (!apiInfo) throw new Error(`未找到线路 ${newSourceCode} 的信息`);

        // 2. 在新线路上搜索视频以获取新的 vod_id
        let searchUrl = `/api/search?wd=${encodeURIComponent(currentVideoTitle)}&source=${newSourceCode}`;
        if (isCustom) {
            searchUrl += `&customApi=${encodeURIComponent(apiInfo.url)}`;
        }

        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (searchData.code !== 200 || !searchData.list || searchData.list.length === 0) {
            throw new Error(`在线路“${apiInfo.name}”上未找到《${currentVideoTitle}》`);
        }

        // 简单匹配第一个结果，可以优化为更精确的匹配
        const newVodId = searchData.list[0].vod_id;
        if (!newVodId) throw new Error("新线路返回的数据中缺少视频ID");

        // 3. 使用新的 vod_id 获取视频详情
        let detailUrl = `/api/detail?id=${newVodId}&source=${newSourceCode}`;
        if (isCustom) {
            detailUrl += `&customApi=${encodeURIComponent(apiInfo.url)}`;
        }

        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();

        if (detailData.code !== 200 || !detailData.episodes || detailData.episodes.length === 0) {
            throw new Error(`在线路“${apiInfo.name}”上获取剧集列表失败`);
        }

        // 4. 切换播放
        const newEpisodes = detailData.episodes;
        if (currentEpisodeIndex >= newEpisodes.length) {
            throw new Error(`新线路的剧集数(${newEpisodes.length})少于当前集数(${currentEpisodeIndex + 1})`);
        }
        const newEpisodeUrl = newEpisodes[currentEpisodeIndex];

        // 更新全局剧集列表
        currentEpisodes = newEpisodes;
        window.currentEpisodes = newEpisodes;
        localStorage.setItem('currentEpisodes', JSON.stringify(newEpisodes));

        // 更新浏览器URL
        const newUrlForBrowser = new URL(window.location.href);
        newUrlForBrowser.searchParams.set('source_code', newSourceCode);
        newUrlForBrowser.searchParams.set('source', apiInfo.name);
        newUrlForBrowser.searchParams.set('id', newVodId);
        newUrlForBrowser.searchParams.set('url', newEpisodeUrl);
        window.history.replaceState({}, '', newUrlForBrowser.toString());

        // 设置跳转时间并切换视频
        nextSeekPosition = timeToSeek;
        _tempUrlForCustomHls = newEpisodeUrl;
        dp.switchVideo({ url: newEpisodeUrl, type: 'hls' });

        // 更新UI
        renderEpisodes();
        // setupLineSwitching(); // 重新渲染线路列表以更新active状态
        showMessage(`已切换到线路: ${apiInfo.name}`, 'success');

    } catch (err) {
        console.error("切换线路失败:", err);
        showError(err.message || "切换线路失败，请重试");
        if (loadingEl) loadingEl.style.display = 'none';
    }
}