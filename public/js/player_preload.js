(function () {
    // --- 模块级变量 ---
    // let isPreloadingActive = false;
    const preloadedEpisodeUrls = new Set();
    const inFlightEpisodeUrls = new Set();
    let lastPreloadIndex = -1;
    let eventsRegistered = false;
    let isPreloadingInProgress = false;
    let timeUpdateListener = null;
    // let nextButtonHoverListener = null;
    // let nextButtonTouchListener = null;
    let episodeGridClickListener = null;

    // --- 辅助函数 ---

    function getPreloadCount() {
        // 直接使用 PLAYER_CONFIG 中的值
        return PLAYER_CONFIG.preloadCount;
    }

    function supportsCacheStorage() {
        return 'caches' in window && typeof window.caches.open === 'function';
    }

    function isSlowNetwork() {
        try {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            return connection && connection.effectiveType && /2g|slow-2g/i.test(connection.effectiveType);
        } catch (e) {
            return false;
        }
    }

    // --- 核心预加载逻辑 ---

    async function preloadNextEpisodeParts(customStartIndex = null) {
        let preloadCancelled = false;

        // 添加取消函数
        window.cancelCurrentPreload = () => {
            preloadCancelled = true;
            isPreloadingInProgress = false;
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Current preload cancelled');
        };

        if (isPreloadingInProgress) {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Aborted: another preload is already in progress.');
            return;
        }

        if (!PLAYER_CONFIG.enablePreloading) {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading is globally disabled.');
            return;
        }

        if (isSlowNetwork()) {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Skipping preloading due to slow network.');
            return;
        }

        if (!window.currentEpisodes || !Array.isArray(window.currentEpisodes)) {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Skipping, episode data is missing.');
            return;
        }

        // 使用自定义起始索引或当前索引
        const startIndex = customStartIndex !== null ? customStartIndex : window.currentEpisodeIndex;

        isPreloadingInProgress = true;
        if (PLAYER_CONFIG.debugMode) console.log('[Preload] Lock acquired, starting preload cycle.');

        try {
            const preloadCount = getPreloadCount();
            const currentIndex = startIndex;
            const totalEpisodes = window.currentEpisodes.length;

            if (PLAYER_CONFIG.debugMode) {
                console.log(`[Preload] Start index: ${startIndex}, Current index: ${currentIndex}, Total: ${totalEpisodes}, Count: ${preloadCount}`);
            }

            /* ---------- 跳过已缓存集数 ---------- */
            const maxTryLimit = Math.min(preloadCount * 3, 15); // 限制最多尝试多少集，防止无限循环
            for (let offset = 1, loaded = 0, tried = 0; loaded < preloadCount && tried < maxTryLimit; offset++, tried++) {

                // ① 计算要尝试的剧集索引
                const episodeIdxToPreload = startIndex + offset;
                if (episodeIdxToPreload >= totalEpisodes) break;     // 已到末尾

                // ② 拿到播放地址
                const episodeString = window.currentEpisodes[episodeIdxToPreload];
                const nextEpisodeUrl = episodeString ? episodeString.split('$').pop() : null;
                if (!nextEpisodeUrl || !nextEpisodeUrl.startsWith('http')) continue; // 无效地址

                // ③ 如果已经预加载过 → 直接跳过
                if (preloadedEpisodeUrls.has(nextEpisodeUrl) ||
                    inFlightEpisodeUrls.has(nextEpisodeUrl)) {
                    if (PLAYER_CONFIG.debugMode)
                        console.log(`[Preload] Skip cached ep ${episodeIdxToPreload + 1}`);
                    loaded++;
                    continue;    // 进入下一轮 offset
                }
                inFlightEpisodeUrls.add(nextEpisodeUrl);   // 标记为“正在抓取”

                /* ===== 拉 m3u8 → 抓 3 个 ts” 的逻辑 ===== */
                try {
                    let m3u8Response;
                    try {
                        m3u8Response = await fetch(nextEpisodeUrl, { method: "GET", mode: 'cors' });
                    } catch (e) {
                        if (PLAYER_CONFIG.debugMode) console.log(`[Preload] Direct fetch failed for ${nextEpisodeUrl}, trying proxy...`);
                        // 如果直接抓取失败（可能是CORS），尝试通过代理抓取
                        const proxyUrl = typeof PROXY_URL !== 'undefined' ? PROXY_URL + encodeURIComponent(nextEpisodeUrl) : null;
                        if (proxyUrl) {
                            m3u8Response = await fetch(proxyUrl);
                        } else {
                            throw e;
                        }
                    }

                    if (!m3u8Response || !m3u8Response.ok) {
                        if (PLAYER_CONFIG.debugMode) console.log(`[Preload] Failed to fetch m3u8 for ep ${episodeIdxToPreload + 1}`);
                        continue;
                    }

                    const m3u8Text = await m3u8Response.text();
                    const tsUrls = [];
                    const baseUrlForSegments = nextEpisodeUrl.substring(0, nextEpisodeUrl.lastIndexOf('/') + 1);

                    const lines = m3u8Text.split('\n');
                    for (let i = 0; i < lines.length && tsUrls.length < 3; i++) {
                        const line = lines[i].trim();
                        if (line && !line.startsWith("#")) {
                            // 修正：更通用的 URI 提取逻辑
                            let fullTsUrl = line.startsWith("http") ? line : new URL(line, baseUrlForSegments).href;

                            // 检查是否是子播放列表（嵌套 m3u8）
                            if (fullTsUrl.includes('.m3u8')) {
                                try {
                                    const subM3u8Resp = await fetch(fullTsUrl);
                                    if (subM3u8Resp.ok) {
                                        const subText = await subM3u8Resp.text();
                                        const subLines = subText.split('\n');
                                        const subBaseUrl = fullTsUrl.substring(0, fullTsUrl.lastIndexOf('/') + 1);
                                        for (const subLine of subLines) {
                                            const tl = subLine.trim();
                                            if (tl && !tl.startsWith("#") && tsUrls.length < 3) {
                                                tsUrls.push(tl.startsWith("http") ? tl : new URL(tl, subBaseUrl).href);
                                            }
                                        }
                                    }
                                } catch (e) { /* ignore sub m3u8 failure */ }
                            } else {
                                tsUrls.push(fullTsUrl);
                            }
                        }
                    }

                    let tsCached = 0;                                 // ☆ 统计成功缓存数

                    for (const tsUrl of tsUrls) {
                        if (preloadCancelled) break;
                        try {
                            if (supportsCacheStorage()) {
                                const cache = await caches.open('video-preload-cache');
                                const cachedResponse = await cache.match(tsUrl);
                                if (!cachedResponse) {
                                    const segmentResponse = await fetch(tsUrl, { method: "GET", mode: 'cors' });
                                    if (segmentResponse.ok) {
                                        await cache.put(tsUrl, segmentResponse.clone());
                                        tsCached++;                       // ☆ 成功 +1
                                    }
                                } else {
                                    tsCached++;                           // ☆ 已在缓存里也算成功
                                }
                            } else {
                                const segmentResponse = await fetch(tsUrl, { method: "GET", mode: 'cors' });
                                segmentResponse.ok && tsCached++;
                            }
                        } catch (tsErr) {
                            if (PLAYER_CONFIG.debugMode) console.warn(`[Preload] TS fetch failed: ${tsUrl}`, tsErr);
                        }
                    }

                    // 只有真正缓存到 ≥1 个 ts，才认为这一集预加载完成
                    if (tsCached > 0 && !preloadedEpisodeUrls.has(nextEpisodeUrl)) {
                        preloadedEpisodeUrls.add(nextEpisodeUrl);   // 真正完成          
                        loaded++;
                        if (PLAYER_CONFIG.debugMode)
                            console.log(`[Preload] ✔ ep ${episodeIdxToPreload + 1} cached (${tsCached} ts)`);
                    } else {
                        if (PLAYER_CONFIG.debugMode)
                            console.log(`[Preload] ✖ ep ${episodeIdxToPreload + 1} had no ts cached, ignore`);
                    }
                } catch (e) {
                    if (PLAYER_CONFIG.debugMode) console.error('[Preload] error during episode fetch:', e);
                } finally {
                    inFlightEpisodeUrls.delete(nextEpisodeUrl);
                }
            }
        } catch (e) {
            if (PLAYER_CONFIG.debugMode) console.error(`[Preload] Fatal error in preload cycle:`, e);
        } finally {
            isPreloadingInProgress = false;
            preloadCancelled = false; // 确保状态重置
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Lock released, preload cycle finished');
        }
    }

    function registerPreloadEvents() {
        if (!window.player) {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Player not ready, deferring event registration.');
            setTimeout(registerPreloadEvents, 200);
            return;
        }

        timeUpdateListener = () => {
            if (window.player.duration && window.player.currentTime > window.player.duration - 15) {
                preloadNextEpisodeParts();
            }
        };
        window.player.addEventListener('time-update', timeUpdateListener);

        /* 悬停和触摸触发预加载
        const nextBtn = document.getElementById('next-episode');
         if (nextBtn) {
        nextButtonHoverListener = () => preloadNextEpisodeParts();
            nextButtonTouchListener = () => preloadNextEpisodeParts();
            nextBtn.addEventListener('mouseenter', nextButtonHoverListener, { passive: true });
            nextBtn.addEventListener('touchstart', nextButtonTouchListener, { passive: true });
          }
          */
        const episodesListContainer = document.getElementById('episode-grid');
        if (episodesListContainer) {
            episodeGridClickListener = (e) => {
                const btn = e.target.closest('button[data-index]');
                if (!btn) return;

                // 目标集数（原始索引）
                const targetIndex = parseInt(btn.dataset.index, 10);

                /* 先取消正在进行的预加载（如有） */
                if (typeof window.cancelCurrentPreload === 'function') {
                    window.cancelCurrentPreload();
                }

                // 延迟一点点，等 doEpisodeSwitch 启动后再预加载
                setTimeout(() => {
                    preloadNextEpisodeParts(targetIndex);
                }, 200);
            };
            episodesListContainer.addEventListener('click', episodeGridClickListener);
        }

        if (PLAYER_CONFIG.debugMode) console.log('[Preload] All event listeners registered.');
    }

    function unregisterPreloadEvents() {
        if (window.player && timeUpdateListener) {
            window.player.removeEventListener('time-update', timeUpdateListener);
            timeUpdateListener = null;
        }
        /*
        const nextBtn = document.getElementById('next-episode');
        if (nextBtn) {
            if (nextButtonHoverListener) nextBtn.removeEventListener('mouseenter', nextButtonHoverListener);
            if (nextButtonTouchListener) nextBtn.removeEventListener('touchstart', nextButtonTouchListener);
            nextButtonHoverListener = null;
            nextButtonTouchListener = null;
        }
        */
        const episodesListContainer = document.getElementById('episode-grid');
        if (episodesListContainer && episodeGridClickListener) {
            episodesListContainer.removeEventListener('click', episodeGridClickListener);
            episodeGridClickListener = null;
        }
        if (PLAYER_CONFIG.debugMode) console.log('[Preload] All event listeners unregistered.');
    }


    function startPreloading() {
        // 防重：同一集已处理就直接返回
        if (window.currentEpisodeIndex === lastPreloadIndex) {
            return;
        }
        lastPreloadIndex = window.currentEpisodeIndex;

        // 确保播放器等环境已就绪
        if (window.player &&
            window.currentEpisodes &&
            typeof window.currentEpisodeIndex === 'number') {

            if (PLAYER_CONFIG.debugMode)
                console.log('[Preload] System ready, starting preloading features.');

            // 事件只注册一次
            if (!eventsRegistered) {
                registerPreloadEvents();
                eventsRegistered = true;
            }

            preloadNextEpisodeParts();  // 立即触发一次预加载
        } else {
            // 如果环境未就绪，可以保留轮询检查的逻辑
            let tries = 0;
            const initialCheck = setInterval(() => {
                if (window.player &&
                    window.currentEpisodes &&
                    typeof window.currentEpisodeIndex === 'number') {

                    clearInterval(initialCheck);

                    if (!eventsRegistered) {
                        registerPreloadEvents();
                        eventsRegistered = true;
                    }

                    preloadNextEpisodeParts();
                } else if (++tries > 50) {
                    clearInterval(initialCheck);
                }
            }, 200);
        }
    }

    function stopPreloading() {
        unregisterPreloadEvents();
        if (PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading stopped.');
    }

    function enhancePlayEpisodeForPreloading() {
        // const originalPlayEpisode = window.playEpisode;
        // if (originalPlayEpisode && !originalPlayEpisode._preloadEnhanced) {
        //     window.playEpisode = function (...args) {
        //         originalPlayEpisode.apply(this, args);
        //         setTimeout(() => preloadNextEpisodeParts(), 250);
        //     };
        //     window.playEpisode._preloadEnhanced = true;
        //     if (PLAYER_CONFIG.debugMode) console.log('[Preload] playEpisode function enhanced.');
        // }
    }

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(() => {
            // 直接使用 PLAYER_CONFIG 中的值
            const isEnabled = PLAYER_CONFIG.enablePreloading;
            if (isEnabled) {
                startPreloading();
            } else {

                if (PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading is disabled by user setting on page load.');
            }
        }, 500);
    });

    window.startPreloading = startPreloading;
    window.stopPreloading = stopPreloading;
    window.preloadNextEpisodeParts = preloadNextEpisodeParts;
    window.preloadedEpisodeUrls = preloadedEpisodeUrls;


})();