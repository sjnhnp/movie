// ==========================================================
//              测速模块
// ==========================================================

const SpeedTester = (() => {

    const PROXY_URL = '/proxy/'; // 使用代理避免跨域问题
    const TEST_TIMEOUT = 8000; // 每个网络请求的超时时间为8秒

    // 带超时的fetch请求，支持降级机制
    async function fetchWithTimeout(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT);

        try {
            // 方法1：先尝试直接请求
            try {
                const response = await fetch(url, {
                    signal: controller.signal,
                    mode: 'cors'
                });
                if (response.ok) {
                    return response;
                }
            } catch (corsError) {
                console.log('直接请求失败，尝试代理:', corsError.message);
            }

            // 方法2：使用代理
            if (typeof PROXY_URL !== 'undefined') {
                const response = await fetch(PROXY_URL + encodeURIComponent(url), {
                    signal: controller.signal
                });
                if (response.ok) {
                    return response;
                }
                throw new Error(`代理请求失败! 状态: ${response.status}`);
            } else {
                throw new Error('代理不可用且直接请求失败');
            }
        } finally {
            clearTimeout(timer);
        }
    }

    // 从M3U8内容中解析出第一个视频分片(.ts文件)的URL
    function getFirstSegmentUrl(m3u8Content, baseUrl) {
        const lines = m3u8Content.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                return new URL(trimmedLine, baseUrl).href;
            }
        }
        return null;
    }

    // 测试单个视频源
    async function testSingleSource(source) {
        const result = {
            ...source,
            speed: 0, // 速度初始化为0
            loadSpeed: 'N/A', // 兼容现有代码的字段
            latency: -1,
            pingTime: -1, // 兼容现有代码
            sortPriority: 50,
            m3u8Content: null  // ★ 预占位，稍后把已下载的 m3u8 文本放进来
        };

        if (!source.vod_play_url) return result;

        const firstEpisodeUrl = (source.vod_play_url.split('#')[0].split('$').pop() || '').trim();
        if (!firstEpisodeUrl || !firstEpisodeUrl.startsWith('http')) return result;

        try {
            // 1. 获取M3U8播放列表并测量延迟
            const startTime = performance.now();
            const m3u8Response = await fetchWithTimeout(firstEpisodeUrl);
            result.latency = Math.round(performance.now() - startTime);
            const m3u8Content = await m3u8Response.text();
            result.m3u8Content = m3u8Content;   // ★ 把文本交给 result，后面画质检测可直接用            
            // 2. 从M3U8中找到第一个分片地址
            const segmentUrl = getFirstSegmentUrl(m3u8Content, firstEpisodeUrl);

            if (segmentUrl) {
                // 3. 下载第一个分片并测量速度
                const segmentStartTime = performance.now();
                const segmentResponse = await fetchWithTimeout(segmentUrl);
                const segmentData = await segmentResponse.arrayBuffer();
                const duration = (performance.now() - segmentStartTime) / 1000;

                if (duration > 0 && segmentData.byteLength > 0) {
                    const speedBps = segmentData.byteLength / duration;
                    const speedKBps = Math.round(speedBps / 1024);
                    result.speed = speedKBps;
                    result.pingTime = result.latency;

                    // 格式化为现有代码期望的格式
                    if (speedKBps >= 1024) {
                        const speedMBps = (speedKBps / 1024).toFixed(1);
                        result.loadSpeed = `${speedMBps}MB/s`;
                    } else if (speedKBps > 0) {
                        result.loadSpeed = `${speedKBps}KB/s`;
                    }

                    // 根据速度设置排序优先级（速度越快优先级越高）
                    if (speedKBps >= 2048) { // >= 2MB/s
                        result.sortPriority = 10;
                    } else if (speedKBps >= 1024) { // >= 1MB/s
                        result.sortPriority = 20;
                    } else if (speedKBps >= 512) { // >= 512KB/s
                        result.sortPriority = 30;
                    } else if (speedKBps > 0) {
                        result.sortPriority = 40;
                    }
                }
            }
            return result;

        } catch (error) {
            console.log(`测试源失败 ${source.source_name}:`, error.message);
            // 失败时设置合理的默认值
            result.loadSpeed = 'N/A';
            result.sortPriority = 99;
            return result;
        }
    }

    // 并发测试一组视频源
    async function testSources(sources, options = {}) {
        const { concurrency = 4, onProgress } = options;
        const results = [];
        const queue = [...sources];

        async function worker() {
            while (queue.length > 0) {
                const source = queue.shift();
                if (source) {
                    const testedSource = await testSingleSource(source);
                    results.push(testedSource);
                    if (onProgress) {
                        onProgress(testedSource);
                    }
                }
            }
        }

        const workers = Array(concurrency).fill(null).map(() => worker());
        await Promise.all(workers);

        return results;
    }

    return {
        testSources,
    };
})();

window.SpeedTester = SpeedTester;