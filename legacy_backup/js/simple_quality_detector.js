// ================================
// 画质检测模块
// ================================

// 辅助函数，根据宽高正确判断画质
function getQualityStringFromDimensions(width, height) {
    if (!width || !height) return '未知';

    // 采用“或”逻辑，并设置弹性阈值，完美兼容所有宽高比
    if (width >= 3800 || height >= 2100) return '4K';
    if (width >= 2500 || height >= 1400) return '2K';
    if (width >= 1800 || height >= 1000) return '1080p'; // 1920x804 或 1080x1920 都会落入此区间
    if (width >= 1200 || height >= 700) return '720p';
    if (width >= 800 || height >= 460) return '480p';

    return 'SD';
}


// 画质检测函数 - 主要通过URL分析和简单的网络测试
async function simplePrecheckSource(m3u8Url) {
    // 第一步：校验 URL
    if (!m3u8Url || !m3u8Url.includes('.m3u8')) {
        return { quality: '检测失败', loadSpeed: 'N/A', pingTime: -1 };
    }

    // 第二步：文件名关键词快速识别 (最高优先级)
    const qualityKeywords = {
        '4K': [/4k/i, /2160p/i, /3840x2160/i, /超高清/i, /uhd/i],
        '2K': [/2k/i, /1440p/i, /2560x1440/i, /qhd/i],
        '1080p': [/1080p/i, /fhd/i, /1920x1080/i, /全高清/i, /fullhd/i],
        '720p': [/720p/i, /hd/i, /1280x720/i, /高清/i],
        '480p': [/480p/i, /854x480/i, /sd/i],
        'SD': [/240p/i, /360p/i, /标清/i, /low/i]
    };
    for (const [quality, patterns] of Object.entries(qualityKeywords)) {
        if (patterns.some(pattern => pattern.test(m3u8Url))) {
            return { quality, loadSpeed: '快速识别', pingTime: 0 };
        }
    }

    // 第三步：进行实际的网络测速
    const startTime = performance.now();
    try {
        const response = await fetch(m3u8Url, { method: 'GET', mode: 'cors', signal: AbortSignal.timeout(5000) });
        const firstByteTime = performance.now() - startTime;
        let actualLoadSpeed = '未知';
        if (response.ok) {
            const reader = response.body?.getReader();
            if (reader) {
                const downloadStart = performance.now();
                let totalBytes = 0;
                let chunks = 0;
                while (chunks < 3) {
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
                    try {
                        const result = await Promise.race([reader.read(), timeoutPromise]);
                        if (result.done) break;
                        totalBytes += result.value.length;
                        chunks++;
                        const elapsed = (performance.now() - downloadStart) / 1000;
                        if (elapsed > 0.5) {
                            const speedKBps = (totalBytes / 1024) / elapsed;
                            actualLoadSpeed = speedKBps >= 1024 ? `${(speedKBps / 1024).toFixed(1)} MB/s` : `${Math.round(speedKBps)} KB/s`;
                            break;
                        }
                    } catch (timeoutError) { break; }
                }
                reader.cancel();
            }
        }
        const pingTime = Math.round(firstByteTime);

        let quality = '未知';

        // 优先级 1: 检查是否是现代CDN哈希URL
        const hashMatch = m3u8Url.match(/[a-f0-9]{20,}/i);
        if (hashMatch) {
            quality = '1080p';
            console.log('启发式规则匹配：长哈希值URL，猜测为 1080p');
        } else {
            // 优先级 2: 如果不是CDN URL，才进行数字分析
            const numbers = m3u8Url.match(/\d+/g) || [];
            const commonResolutions = [3840, 2560, 1920, 1280, 854, 720, 480];
            let foundResolution = null;

            // 使用严格的数字检查，只匹配精确的数字
            for (const res of commonResolutions) {
                if (numbers.some(n => parseInt(n) === res)) {
                    foundResolution = res;
                    break;
                }
            }

            if (foundResolution) {
                if (foundResolution >= 3840) quality = '4K';
                else if (foundResolution >= 2560) quality = '2K';
                else if (foundResolution >= 1920) quality = '1080p';
                else if (foundResolution >= 1280) quality = '720p';
                else if (foundResolution >= 854) quality = '480p';
                else quality = 'SD';
            } else {
                // 优先级 3: 最后的备用方案，融合码率和文件名长度
                const bitrateMatch = m3u8Url.match(/(\d+)kb/i);
                if (bitrateMatch) {
                    const bitrate = parseInt(bitrateMatch[1]);
                    if (bitrate >= 5000) quality = '4K';
                    else if (bitrate >= 3000) quality = '1080p';
                    else if (bitrate >= 1500) quality = '720p';
                    else if (bitrate >= 800) quality = '480p';
                    else quality = 'SD';
                } else {
                    const filename = m3u8Url.split('/').pop().replace('.m3u8', '');
                    if (filename.length > 30) quality = '1080p';
                    else if (filename.length > 20) quality = '720p';
                }
            }
        }

        return { quality, loadSpeed: actualLoadSpeed, pingTime };
    } catch (error) {
        return { quality: '检测失败', loadSpeed: '连接超时', pingTime: Math.round(performance.now() - startTime) };
    }
}

// 尝试通过创建video元素来检测画质（无CORS限制）
async function videoElementDetection(m3u8Url) {
    return new Promise((resolve) => {
        // 首先尝试直接解析m3u8内容获取RESOLUTION信息
        tryParseM3u8Resolution(m3u8Url).then(m3u8Result => {
            if (m3u8Result.quality !== '未知') {
                resolve(m3u8Result);
                return;
            }

            // 如果m3u8解析失败，回退到video元素检测
            performVideoElementDetection(m3u8Url).then(resolve);
        }).catch(() => {
            // 如果m3u8解析出错，回退到video元素检测
            performVideoElementDetection(m3u8Url).then(resolve);
        });
    });
}

// 尝试解析m3u8文件中的RESOLUTION信息
async function tryParseM3u8Resolution(m3u8Url, prefetchedContent = null) {
    try {
        // 尝试多种方式获取m3u8内容
        let content = prefetchedContent || null; // ★ 若已传入，直接使用

        // 方法1：直接请求（可能有CORS限制）
        try {
            const response = await fetch(m3u8Url, {
                method: 'GET',
                mode: 'cors',
                signal: AbortSignal.timeout(3000)
            });

            if (response.ok) {
                content = await response.text();
            }
        } catch (corsError) {
            console.log('直接请求失败，尝试代理:', corsError.message);

            // 方法2：使用代理（如果可用）
            if (typeof PROXY_URL !== 'undefined') {
                try {
                    const proxyUrl = PROXY_URL + encodeURIComponent(m3u8Url);
                    const proxyResponse = await fetch(proxyUrl, {
                        signal: AbortSignal.timeout(3000)
                    });

                    if (proxyResponse.ok) {
                        content = await proxyResponse.text();
                    }
                } catch (proxyError) {
                    console.log('代理请求也失败:', proxyError.message);
                }
            }
        }

        if (content) {
            // 查找RESOLUTION信息
            const resolutionMatch = content.match(/RESOLUTION=(\d+)x(\d+)/);
            if (resolutionMatch) {
                const width = parseInt(resolutionMatch[1]);
                const height = parseInt(resolutionMatch[2]);

                console.log(`找到RESOLUTION: ${width}x${height}`);

                const quality = getQualityStringFromDimensions(width, height);

                return {
                    quality,
                    loadSpeed: `${width}x${height}`,
                    pingTime: 0
                };
            }

            // 查找BANDWIDTH信息（如果没有RESOLUTION）
            const bandwidthMatch = content.match(/BANDWIDTH=(\d+)/);
            if (bandwidthMatch) {
                const bandwidth = parseInt(bandwidthMatch[1]);
                console.log(`找到BANDWIDTH: ${bandwidth}`);

                let quality = 'SD';
                if (bandwidth >= 15000000) quality = '4K';
                else if (bandwidth >= 8000000) quality = '2K';
                else if (bandwidth >= 3000000) quality = '1080p';
                else if (bandwidth >= 1500000) quality = '720p';
                else if (bandwidth >= 800000) quality = '480p';

                return {
                    quality,
                    loadSpeed: `${Math.round(bandwidth / 1000)}kb/s`,
                    pingTime: 0
                };
            }
        }
    } catch (error) {
        console.warn('M3U8解析错误:', error.message);
    }

    return { quality: '未知', loadSpeed: 'N/A', pingTime: -1 };
}

// 使用video元素进行检测
async function performVideoElementDetection(m3u8Url) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        video.style.display = 'none';
        video.style.position = 'absolute';
        video.style.top = '-9999px';
        video.style.width = '1px';
        video.style.height = '1px';

        const startTime = performance.now();
        let resolved = false;

        const cleanup = () => {
            if (video.parentNode) {
                video.pause();
                video.src = '';
                video.parentNode.removeChild(video);
            }
        };

        const resolveOnce = (result) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve(result);
            }
        };

        const timeout = setTimeout(() => {
            resolveOnce({
                quality: '检测超时',
                loadSpeed: 'N/A',
                pingTime: Math.round(performance.now() - startTime)
            });
        }, 5000); // 5秒超时

        const checkResolution = () => {
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (width > 0 && height > 0) {
                const pingTime = Math.round(performance.now() - startTime);

                const quality = getQualityStringFromDimensions(width, height);

                resolveOnce({
                    quality,
                    loadSpeed: `${width}x${height}`,
                    pingTime
                });
            }
        };

        video.onloadedmetadata = () => {
            video.play().catch(() => {
                resolveOnce({ quality: '播放失败', loadSpeed: 'N/A', pingTime: -1 });
            });
        };

        video.ontimeupdate = checkResolution;
        video.onresize = checkResolution;

        video.onerror = () => {
            resolveOnce({
                quality: '播放失败',
                loadSpeed: 'N/A',
                pingTime: Math.round(performance.now() - startTime)
            });
        };

        document.body.appendChild(video);
        video.src = m3u8Url;
    });
}


// 综合画质检测函数
async function comprehensiveQualityCheck(m3u8Url, prefetchedContent = null) {

    // 并行执行所有检测方法
    const detectionPromises = [];
    
    // 1. M3U8 RESOLUTION解析（最准确）
    detectionPromises.push(
        tryParseM3u8Resolution(m3u8Url, prefetchedContent)
            .then(result => ({ ...result, method: 'm3u8_resolution', priority: 1 }))
            .catch(() => ({ quality: '未知', loadSpeed: 'N/A', pingTime: -1, method: 'm3u8_resolution', priority: 1 }))
    );
    // 2. Video元素检测（次准确）
    detectionPromises.push(
        Promise.race([
            performVideoElementDetection(m3u8Url),
            new Promise((resolve) => setTimeout(() => resolve({
                quality: '检测超时',
                loadSpeed: 'N/A',
                pingTime: -1
            }), 3000))
        ]).then(result => ({ ...result, method: 'video_element', priority: 2 }))
            .catch(() => ({ quality: '播放失败', loadSpeed: 'N/A', pingTime: -1, method: 'video_element', priority: 2 }))
    );

    // 3. 关键词识别（较准确）
    const keywordResult = await checkKeywordQuality(m3u8Url);
    if (keywordResult) {
        detectionPromises.push(
            Promise.resolve({
                quality: keywordResult,
                loadSpeed: '极速',
                pingTime: 0,
                method: 'keyword',
                priority: 3
            })
        );
    }

    // 4. 简单检测（备选）
    detectionPromises.push(
        simplePrecheckSource(m3u8Url)
            .then(result => ({ ...result, method: 'simple_analysis', priority: 4 }))
            .catch(() => ({ quality: '检测失败', loadSpeed: 'N/A', pingTime: -1, method: 'simple_analysis', priority: 4 }))
    );

    // 等待所有检测完成
    const results = await Promise.all(detectionPromises);

    console.log('所有检测结果:', results);

    // 按优先级选择最佳结果
    let bestResult = null;

    // 优先级1: M3U8 RESOLUTION解析
    const m3u8Result = results.find(r => r.method === 'm3u8_resolution');
    if (m3u8Result && m3u8Result.quality !== '未知') {
        console.log('采用M3U8 RESOLUTION解析结果:', m3u8Result.quality);
        bestResult = m3u8Result;
    }

    // 优先级2: Video元素检测
    if (!bestResult) {
        const videoResult = results.find(r => r.method === 'video_element');
        if (videoResult &&
            videoResult.quality !== '检测超时' &&
            videoResult.quality !== '播放失败' &&
            videoResult.quality !== '高清' &&
            videoResult.quality !== '未知') {
            console.log('采用Video元素检测结果:', videoResult.quality);
            bestResult = videoResult;
        }
    }

    // 优先级3: 关键词识别
    if (!bestResult) {
        const keywordResult = results.find(r => r.method === 'keyword');
        if (keywordResult) {
            console.log('采用关键词识别结果:', keywordResult.quality);
            bestResult = keywordResult;
        }
    }

    // 优先级4: 简单检测
    if (!bestResult) {
        const simpleResult = results.find(r => r.method === 'simple_analysis');
        if (simpleResult && simpleResult.quality !== '检测失败' && simpleResult.quality !== '未知') {
            console.log('采用简单检测结果:', simpleResult.quality);
            bestResult = simpleResult;
        }
    }

    // 如果所有方法都失败，返回明确的'未知'
    if (!bestResult) {
        console.log('所有检测方法都失败，返回未知');
        bestResult = {
            quality: '未知', // 不再猜测，返回真实状态
            loadSpeed: 'N/A',
            pingTime: -1,
            method: 'fallback',
            priority: 99
        };
    }

    // 合并加载速度信息（优先使用简单检测的网络测速结果）
    const simpleResult = results.find(r => r.method === 'simple_analysis');
    if (simpleResult && simpleResult.loadSpeed &&
        simpleResult.loadSpeed.match(/\d+(\.\d+)?\s*(KB\/s|MB\/s)$/)) {
        bestResult.loadSpeed = simpleResult.loadSpeed;
        bestResult.pingTime = simpleResult.pingTime;
    }

    console.log('最终选择的结果:', bestResult);

    return {
        quality: bestResult.quality,
        loadSpeed: bestResult.loadSpeed,
        pingTime: bestResult.pingTime,
        detectionMethod: bestResult.method,
        sortPriority: bestResult.priority
    };
}

// 单独的关键词检测函数
async function checkKeywordQuality(m3u8Url) {
    const qualityKeywords = {
        '4K': [/4k/i, /2160p/i, /3840x2160/i, /超高清/i, /uhd/i],
        '2K': [/2k/i, /1440p/i, /2560x1440/i, /qhd/i],
        '1080p': [/1080p/i, /fhd/i, /1920x1080/i, /全高清/i, /fullhd/i],
        '720p': [/720p/i, /hd/i, /1280x720/i, /高清/i],
        '480p': [/480p/i, /854x480/i, /sd/i],
        'SD': [/240p/i, /360p/i, /标清/i, /low/i]
    };

    for (const [quality, patterns] of Object.entries(qualityKeywords)) {
        if (patterns.some(pattern => pattern.test(m3u8Url))) {
            return quality;
        }
    }

    return null;
}

// 导出函数
if (typeof window !== 'undefined') {
    // 替换原有的precheckSource函数
    window.precheckSource = comprehensiveQualityCheck;
    window.simplePrecheckSource = simplePrecheckSource;
    window.videoElementDetection = videoElementDetection;
    window.comprehensiveQualityCheck = comprehensiveQualityCheck;
    window.tryParseM3u8Resolution = tryParseM3u8Resolution;
    window.performVideoElementDetection = performVideoElementDetection;
}

// Node.js环境支持
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        simplePrecheckSource,
        videoElementDetection,
        comprehensiveQualityCheck
    };
}