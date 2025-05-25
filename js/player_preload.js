// File: js/player_preload.js

/**
 * 集数预加载功能 (Episode Preloading Feature)
 * Relies on global variables:
 * - window.PLAYER_CONFIG (especially PLAYER_CONFIG.enablePreloading, PLAYER_CONFIG.preloadCount, PLAYER_CONFIG.debugMode)
 * - window.currentEpisodes (array of episode URLs, defined in player_app.js)
 * - window.currentEpisodeIndex (current episode index, defined in player_app.js)
 * - window.dp (DPlayer instance, defined in player_app.js)
 * - window.playEpisode (function to play an episode, defined in player_app.js)
 */
(function () {
    // Helper to get preload count from global PLAYER_CONFIG or use a default
    function getPreloadCount() {
        return (window.PLAYER_CONFIG && typeof window.PLAYER_CONFIG.preloadCount !== 'undefined')
            ? parseInt(window.PLAYER_CONFIG.preloadCount, 10)
            : 2; // Default to 2 if not specified
    }

    // Simple check for CacheStorage API support
    function supportsCacheStorage() {
        return 'caches' in window && typeof window.caches.open === 'function';
    }

    // Helper to detect slow network conditions (very basic)
    function isSlowNetwork() {
        try {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            return connection && connection.effectiveType && /2g|slow-2g/i.test(connection.effectiveType);
        } catch (e) {
            return false; // Default to not slow if API is unavailable
        }
    }

    // Ensure global episode variables are accessible if they are not already on window scope
    // This function might be less necessary if player_app.js correctly manages these as true globals or on window object.
    function syncGlobalEpisodes() {
        if (typeof currentEpisodes !== "undefined" && typeof window.currentEpisodes === "undefined") {
            window.currentEpisodes = currentEpisodes;
        }
        if (typeof currentEpisodeIndex !== "undefined" && typeof window.currentEpisodeIndex === "undefined") {
            window.currentEpisodeIndex = currentEpisodeIndex;
        }
    }

    /**
     * Preloads the m3u8 and first few TS segments of the next N episodes.
     */
    async function preloadNextEpisodeParts(count) {
        const preloadCount = typeof count === 'number' ? count : getPreloadCount();

        if (!(window.PLAYER_CONFIG && window.PLAYER_CONFIG.enablePreloading)) {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading disabled by PLAYER_CONFIG.enablePreloading.');
            return;
        }

        if (isSlowNetwork()) {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Skipping preloading due to slow network.');
            return;
        }

        syncGlobalEpisodes(); // Ensure access to currentEpisodes and currentEpisodeIndex

        if (!window.currentEpisodes || !Array.isArray(window.currentEpisodes) || typeof window.currentEpisodeIndex !== 'number') {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Skipping, episode data or current index is missing or invalid.');
            return;
        }

        const currentIndex = window.currentEpisodeIndex;
        const totalEpisodes = window.currentEpisodes.length;

        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
            console.log(`[Preload] Starting preload. Current index: ${currentIndex}, Total episodes: ${totalEpisodes}, Preload count: ${preloadCount}`);
        }

        for (let offset = 1; offset <= preloadCount; offset++) {
            const episodeIdxToPreload = currentIndex + offset;
            if (episodeIdxToPreload >= totalEpisodes) {
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Reached end of playlist. No more episodes to preload after index ${episodeIdxToPreload - 1}.`);
                break;
            }

            const nextEpisodeUrl = window.currentEpisodes[episodeIdxToPreload];
            if (!nextEpisodeUrl) {
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Skipped empty URL at episode index ${episodeIdxToPreload}.`);
                continue;
            }

            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                console.log(`[Preload] Attempting to preload episode ${episodeIdxToPreload + 1}: ${nextEpisodeUrl}`);
            }

            try {
                const m3u8Response = await fetch(nextEpisodeUrl, { method: "GET" });
                if (!m3u8Response.ok) {
                    if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Failed to fetch M3U8 for ${nextEpisodeUrl}. Status: ${m3u8Response.status}`);
                    continue;
                }
                const m3u8Text = await m3u8Response.text();
                const tsUrls = [];
                const baseUrlForSegments = nextEpisodeUrl.substring(0, nextEpisodeUrl.lastIndexOf('/') + 1);

                m3u8Text.split('\n').forEach(line => {
                    const trimmedLine = line.trim();
                    // Basic TS segment detection, might need refinement for more complex M3U8s
                    if (trimmedLine && !trimmedLine.startsWith("#") && (trimmedLine.endsWith(".ts") || trimmedLine.includes(".ts?")) && tsUrls.length < 3) {
                        tsUrls.push(trimmedLine.startsWith("http") ? trimmedLine : baseUrlForSegments + trimmedLine);
                    }
                });

                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                    console.log(`[Preload] M3U8 for episode ${episodeIdxToPreload + 1} parsed. Found ${tsUrls.length} TS segments to preload.`);
                }

                for (const tsUrl of tsUrls) {
                    if (supportsCacheStorage()) {
                        try {
                            const cache = await caches.open('libretv-preload-segments'); // Cache name
                            const cachedResponse = await cache.match(tsUrl);
                            if (!cachedResponse) {
                                const segmentResponse = await fetch(tsUrl, { method: "GET" });
                                if (segmentResponse.ok) {
                                    await cache.put(tsUrl, segmentResponse.clone());
                                    if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] TS segment cached: ${tsUrl}`);
                                } else if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                                    console.log(`[Preload] Failed to fetch TS segment: ${tsUrl}`);
                                }
                            } else {
                                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] TS segment already in cache: ${tsUrl}`);
                            }
                        } catch (cacheEx) {
                            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] TS caching failed for ${tsUrl}: ${cacheEx}`);
                        }
                    } else { // Fallback if Cache API is not supported - just fetch
                        try {
                            const segmentResponse = await fetch(tsUrl, { method: "GET" });
                            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                                if (segmentResponse.ok) console.log(`[Preload] TS segment fetched (no cache): ${tsUrl}`);
                                else console.log(`[Preload] Failed to fetch TS segment (no cache): ${tsUrl}`);
                            }
                        } catch (fetchEx) {
                            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] TS fetch exception (no cache) for ${tsUrl}: ${fetchEx}`);
                        }
                    }
                }
            } catch (e) {
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Error preloading M3U8 for ${nextEpisodeUrl}: ${e}`);
            }
        }
    }
    // Expose to global scope for direct calls if needed, or for other scripts
    window.preloadNextEpisodeParts = preloadNextEpisodeParts;

    /** Setup event listeners for automatic preloading triggers **/
    function safeRegisterPreloadEvents() {
        syncGlobalEpisodes(); // Ensure globals are up-to-date

        if (!(window.PLAYER_CONFIG && window.PLAYER_CONFIG.enablePreloading)) {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading event registration skipped: disabled by PLAYER_CONFIG.enablePreloading.');
            return;
        }

        // Check if dependent variables are ready
        if (!window.currentEpisodes || !Array.isArray(window.currentEpisodes) || typeof window.currentEpisodeIndex !== 'number') {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading event registration deferred: episode data not ready.');
            setTimeout(safeRegisterPreloadEvents, 500); // Retry after a short delay
            return;
        }

        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Registering preload events.');

        // Preload on next episode button mouseenter/touchstart
        const nextBtn = document.getElementById('next-episode'); // Assuming ID from your player_app.js
        if (nextBtn && !nextBtn._preloadHooked_mouseenter_touchstart) {
            nextBtn._preloadHooked_mouseenter_touchstart = true;
            nextBtn.addEventListener('mouseenter', () => preloadNextEpisodeParts(getPreloadCount()), { passive: true });
            nextBtn.addEventListener('touchstart', () => preloadNextEpisodeParts(getPreloadCount()), { passive: true });
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Next button hover/touch events registered.');
        }

        // Preload when video is nearing its end
        function setupTimeUpdatePreloadListener() {
            if (window.dp && window.dp.video && typeof window.dp.video.addEventListener === 'function' && !window.dp._preloadHooked_timeupdate) {
                window.dp._preloadHooked_timeupdate = true;
                window.dp.video.addEventListener('timeupdate', function () {
                    if (window.dp.video.duration && window.dp.video.currentTime > window.dp.video.duration - 12) { // 12 seconds before end
                        preloadNextEpisodeParts(getPreloadCount());
                    }
                });
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Video timeupdate event for preloading registered.');
            }
        }

        if (window.dp && window.dp.video) {
            setupTimeUpdatePreloadListener();
        } else {
            let tries = 0;
            const timer = setInterval(() => {
                if (window.dp && window.dp.video) {
                    setupTimeUpdatePreloadListener();
                    clearInterval(timer);
                }
                if (++tries > 50) { // Try for ~10 seconds
                    clearInterval(timer);
                    if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.warn('[Preload] DPlayer instance not found after 10s for timeupdate listener.');
                }
            }, 200);
        }

        // Preload when clicking on an episode in the grid
        const episodesListContainer = document.getElementById('episode-grid'); // Assuming ID from your player_app.js
        if (episodesListContainer && !episodesListContainer._preloadHooked_click) {
            episodesListContainer._preloadHooked_click = true;
            episodesListContainer.addEventListener('click', function (e) {
                const button = e.target.closest('button.episode-button'); // Assuming class from your player_app.js
                if (button) {
                    setTimeout(() => preloadNextEpisodeParts(getPreloadCount()), 200); // Delay slightly to allow main click action
                }
            });
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Episode grid click event registered.');
        }
    }

    // Trigger initial preload after a short delay to allow player_app.js to initialize episodes
    function triggerFirstPreload(retryCount = 0) {
        syncGlobalEpisodes();
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.enablePreloading &&
            window.currentEpisodes && Array.isArray(window.currentEpisodes) && window.currentEpisodes.length > 0 &&
            typeof window.currentEpisodeIndex === 'number') {

            if (window.PLAYER_CONFIG.debugMode) console.log('[Preload] Triggering initial preload.');
            preloadNextEpisodeParts();
        } else if (retryCount < 20) { // Retry for ~10 seconds
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Initial preload deferred, try ${retryCount + 1}. Episode data not ready.`);
            setTimeout(() => triggerFirstPreload(retryCount + 1), 500);
        } else {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.warn('[Preload] Initial preload failed after multiple retries: episode data not available.');
        }
    }

    // Hook into playEpisode function from player_app.js
    // This requires playEpisode to be globally accessible or for this script to load after player_app.js
    // and for player_app.js to make playEpisode assignable on window.
    function enhancePlayEpisodeForPreloading() {
        if (typeof window.playEpisode === 'function') {
            const originalPlayEpisode = window.playEpisode;
            if (!originalPlayEpisode._preloadEnhanced) {
                window.playEpisode = function (...args) {
                    // Call original function
                    originalPlayEpisode.apply(this, args);
                    // After switching episode, trigger preload
                    if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading after episode switch.');
                    setTimeout(() => preloadNextEpisodeParts(getPreloadCount()), 250);
                };
                window.playEpisode._preloadEnhanced = true; // Mark as enhanced
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] playEpisode function enhanced for preloading.');
            }
        } else if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
            console.warn('[Preload] window.playEpisode not found for enhancing. Preload on episode switch might not work.');
        }
    }


    // DOMContentLoaded is used to ensure that PLAYER_CONFIG and other necessary elements/scripts might be loaded.
    // player_app.js also uses DOMContentLoaded, so order might matter or use a more robust ready check.
    document.addEventListener('DOMContentLoaded', function () {
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
            console.log('[Preload] DOMContentLoaded, initializing preload features.');
        }

        // Make sure player_app.js has had a chance to define its globals
        // This timeout helps, but a more robust event system would be better
        setTimeout(() => {
            syncGlobalEpisodes(); // Sync global vars
            safeRegisterPreloadEvents(); // Setup event-based preloads
            triggerFirstPreload(); // Initial preload
            enhancePlayEpisodeForPreloading(); // Hook into playEpisode
        }, 500); // Delay to allow player_app.js to potentially set up currentEpisodes etc.
    });

})();