(function () {
    // --- 模块级变量 ---
    let isPreloadingActive = false;
    let isPreloadingInProgress = false; // [FIX] 添加状态锁，防止重复执行
    let timeUpdateListener = null;
    // let nextButtonHoverListener = null;
    // let nextButtonTouchListener = null;
    let episodeGridClickListener = null;

    // --- 辅助函数 ---

    function getPreloadCount() {
        const count = localStorage.getItem('preloadCount');
        return count ? parseInt(count, 10) : 2;
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
        if (isPreloadingInProgress) {
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Aborted: another preload is already in progress.');
            return;
        }

        if (!isPreloadingActive) {
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

            for (let offset = 1; offset <= preloadCount; offset++) {
                const episodeIdxToPreload = currentIndex + offset;
                if (episodeIdxToPreload >= totalEpisodes) {
                    if (PLAYER_CONFIG.debugMode) console.log(`[Preload] Reached end of playlist.`);
                    break;
                }

                const episodeString = window.currentEpisodes[episodeIdxToPreload];
                const nextEpisodeUrl = episodeString ? episodeString.split('$').pop() : null;

                if (!nextEpisodeUrl || !nextEpisodeUrl.startsWith('http')) {
                    if (PLAYER_CONFIG.debugMode) console.log(`[Preload] Skipped invalid URL at index ${episodeIdxToPreload}.`);
                    continue;
                }

                if (PLAYER_CONFIG.debugMode) {
                    console.log(`[Preload] Attempting to preload episode ${episodeIdxToPreload + 1} (index: ${episodeIdxToPreload}): ${nextEpisodeUrl}`);
                }

                try {
                    const m3u8Response = await fetch(nextEpisodeUrl, { method: "GET", mode: 'cors' });
                    if (!m3u8Response.ok) {
                        if (PLAYER_CONFIG.debugMode) console.log(`[Preload] Failed to fetch M3U8 for ${nextEpisodeUrl}. Status: ${m3u8Response.status}`);
                        continue;
                    }
                    const m3u8Text = await m3u8Response.text();
                    const tsUrls = [];
                    const baseUrlForSegments = nextEpisodeUrl.substring(0, nextEpisodeUrl.lastIndexOf('/') + 1);

                    m3u8Text.split('\n').forEach(line => {
                        const trimmedLine = line.trim();
                        if (trimmedLine && !trimmedLine.startsWith("#") && (trimmedLine.endsWith(".ts") || trimmedLine.includes(".ts?")) && tsUrls.length < 3) {
                            tsUrls.push(trimmedLine.startsWith("http") ? trimmedLine : new URL(trimmedLine, baseUrlForSegments).href);
                        }
                    });

                    if (PLAYER_CONFIG.debugMode) {
                        console.log(`[Preload] M3U8 for episode ${episodeIdxToPreload + 1} parsed. Found ${tsUrls.length} TS segments.`);
                    }

                    for (const tsUrl of tsUrls) {
                        if (supportsCacheStorage()) {
                            const cache = await caches.open('video-preload-cache');
                            const cachedResponse = await cache.match(tsUrl);
                            if (!cachedResponse) {
                                const segmentResponse = await fetch(tsUrl, { method: "GET", mode: 'cors' });
                                if (segmentResponse.ok) {
                                    await cache.put(tsUrl, segmentResponse.clone());
                                    if (PLAYER_CONFIG.debugMode) console.log(`[Preload] TS segment cached: ${tsUrl}`);
                                }
                            }
                        } else {
                            await fetch(tsUrl, { method: "GET", mode: 'cors' });
                        }
                    }
                } catch (e) {
                    if (PLAYER_CONFIG.debugMode) console.error(`[Preload] Error preloading for ${nextEpisodeUrl}:`, e);
                }
            }
        } finally {
            // 解锁，允许下一次预加载
            isPreloadingInProgress = false;
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] Lock released, preload cycle finished.');
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
                if (e.target.closest('button[data-index]')) {
                    setTimeout(() => preloadNextEpisodeParts(), 200);
                }
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
        if (isPreloadingActive) {
            // 如果已激活，重新触发预加载（使用新设置）
            preloadNextEpisodeParts();
            return;
        }
        isPreloadingActive = true;

        let tries = 0;
        const initialCheck = setInterval(() => {
            if (window.player && window.currentEpisodes && typeof window.currentEpisodeIndex === 'number') {
                clearInterval(initialCheck);
                if (PLAYER_CONFIG.debugMode) console.log('[Preload] System ready, starting preloading features.');
                registerPreloadEvents();
                preloadNextEpisodeParts(); // 立即触发一次预加载
            } else if (++tries > 50) {
                clearInterval(initialCheck);
                if (PLAYER_CONFIG.debugMode) console.warn('[Preload] Failed to start: player or episode data not available.');
            }
        }, 200);
    }

    function stopPreloading() {
        if (!isPreloadingActive) return;
        isPreloadingActive = false;
        unregisterPreloadEvents();
        if (PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading stopped.');
    }

    function enhancePlayEpisodeForPreloading() {
        const originalPlayEpisode = window.playEpisode;
        if (originalPlayEpisode && !originalPlayEpisode._preloadEnhanced) {
            window.playEpisode = function (...args) {
                originalPlayEpisode.apply(this, args);
                setTimeout(() => preloadNextEpisodeParts(), 250);
            };
            window.playEpisode._preloadEnhanced = true;
            if (PLAYER_CONFIG.debugMode) console.log('[Preload] playEpisode function enhanced.');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(() => {
            const isEnabled = localStorage.getItem('preloadingEnabled') !== 'false';
            if (isEnabled) {
                startPreloading();
            } else {
                if (PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading is disabled by user setting on page load.');
            }
            enhancePlayEpisodeForPreloading();
        }, 500);
    });

    window.startPreloading = startPreloading;
    window.stopPreloading = stopPreloading;
    window.preloadNextEpisodeParts = preloadNextEpisodeParts;

})();