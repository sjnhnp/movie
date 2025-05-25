// ================================
// API请求与聚合处理优化版
// ================================

// 通用fetch，支持超时并返回JSON
async function fetchWithTimeout(targetUrl, options, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(targetUrl, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`请求失败: ${response.status} ${response.statusText} for ${targetUrl}`);
        return await response.json(); // 期望JSON响应
    } catch (error) {
        clearTimeout(timer);
        if (error instanceof Error && !(error.message.includes(targetUrl))) {
            error.message = `Error fetching JSON from ${targetUrl}: ${error.message}`;
        }
        throw error;
    }
}

// 新增：通用fetch，支持超时并返回TEXT (用于HTML抓取)
async function fetchTextWithTimeout(targetUrl, options, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(targetUrl, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`请求失败: ${response.status} ${response.statusText} for ${targetUrl}`);
        return await response.text(); // 期望TEXT响应
    } catch (error) {
        clearTimeout(timer);
        if (error instanceof Error && !(error.message.includes(targetUrl))) {
            error.message = `Error fetching text from ${targetUrl}: ${error.message}`;
        }
        throw error;
    }
}


// 处理特殊片源详情 (内置源，需要HTML抓取)
async function handleSpecialSourceDetail(id, sourceCode) {
    try {
        const detailPageUrl = `${API_SITES[sourceCode].detail}/index.php/vod/detail/id/${id}.html`;
        // 使用 fetchTextWithTimeout 获取 HTML 内容
        const htmlContent = await fetchTextWithTimeout(
            PROXY_URL + encodeURIComponent(detailPageUrl),
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'] } }
        );

        let matches = [];
        if (sourceCode === 'ffzy') {
            matches = htmlContent.match(/\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g) || [];
        }
        if (matches.length === 0) {
            matches = htmlContent.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
        }
        matches = Array.from(new Set(matches)).map(link => {
            link = link.slice(1);
            const idx = link.indexOf('(');
            return idx > -1 ? link.slice(0, idx) : link;
        });

        if (matches.length === 0) {
            throw new Error(`未能从${API_SITES[sourceCode].name}源获取到有效的播放地址`);
        }

        const title = (htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/) || [, ''])[1].trim();
        const desc = (htmlContent.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/) || [, ''])[1]
            .replace(/<[^>]+>/g, ' ').trim();

        return JSON.stringify({
            code: 200, episodes: matches, detailUrl: detailPageUrl,
            videoInfo: {
                title,
                desc,
                source_name: API_SITES[sourceCode].name,
                source_code: sourceCode
            }
        });
    } catch (e) {
        console.error(`${API_SITES[sourceCode]?.name || sourceCode}详情获取失败:`, e);
        // 将原始错误信息传递出去，方便调试
        throw new Error(`获取${API_SITES[sourceCode]?.name || sourceCode}详情失败: ${e.message}`);
    }
}

// 处理自定义API特殊详情 (自定义源，需要HTML抓取)
async function handleCustomApiSpecialDetail(id, customApiDetailBaseUrl) {
    try {
        const detailPageUrl = `${customApiDetailBaseUrl}/index.php/vod/detail/id/${id}.html`;
        // 使用 fetchTextWithTimeout 获取 HTML 内容
        const htmlContent = await fetchTextWithTimeout(
            PROXY_URL + encodeURIComponent(detailPageUrl),
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'], 'Accept': 'application/json' } } // Accept header for custom APIs can remain, as some might check it.
        );

        const matches = (htmlContent && htmlContent.match(M3U8_PATTERN) || [])
            .map(link => {
                link = link.slice(1);
                const idx = link.indexOf('(');
                return idx > -1 ? link.slice(0, idx) : link;
            });

        if (matches.length === 0) {
            throw new Error('未能从自定义API源获取到有效的播放地址');
        }

        const title = (htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/) || [, ''])[1].trim();
        const desc = (htmlContent.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/) || [, ''])[1]
            .replace(/<[^>]+>/g, ' ').trim();

        return JSON.stringify({
            code: 200, episodes: matches, detailUrl: detailPageUrl,
            videoInfo: {
                title, desc,
                source_name: '自定义源',
                source_code: 'custom'
            }
        });
    } catch (e) {
        console.error('自定义API详情获取失败:', e);
        throw new Error(`获取自定义API详情失败: ${e.message}`);
    }
}

// 注意：此函数在当前客户端聚合模式下可能未被直接调用。
// 聚合搜索由 app.js 中的 performSearch 函数通过多次调用 /api/search 实现。
async function handleAggregatedSearch(searchQuery) {
    const availableSources = Object.keys(API_SITES)
        .filter(key => key !== 'aggregated' && key !== 'custom');
    if (availableSources.length === 0) throw new Error('没有可用的API源');

    const requests = availableSources.map(source =>
        fetchWithTimeout(
            PROXY_URL + encodeURIComponent(`${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`),
            { headers: API_CONFIG.search.headers },
            AGGREGATED_SEARCH_CONFIG.timeout
        ).catch(err => {
            console.warn(`${source}源搜索失败:`, err);
            return null;
        })
    );
    try {
        const results = await Promise.all(requests);
        let all = [];
        results.forEach((r, i) => {
            if (r && Array.isArray(r.list))
                all.push(...r.list.map(item => ({
                    ...item,
                    source_name: API_SITES[availableSources[i]].name,
                    source_code: availableSources[i]
                })));
        });
        if (!all.length) {
            return JSON.stringify({
                code: 200, list: [], msg: '所有源均无搜索结果'
            });
        }
        const seen = new Set(), unique = [];
        for (const item of all) {
            const k = `${item.source_code}_${item.vod_id}`;
            if (!seen.has(k)) {
                seen.add(k); unique.push(item);
            }
        }
        unique.sort((a, b) => {
            const na = a.vod_name || '', nb = b.vod_name || '';
            const cmp = na.localeCompare(nb);
            return cmp !== 0 ? cmp :
                (a.source_name || '').localeCompare(b.source_name || '');
        });
        return JSON.stringify({ code: 200, list: unique });
    } catch (err) {
        console.error('聚合搜索处理错误:', err);
        return JSON.stringify({
            code: 400,
            msg: '聚合搜索处理失败: ' + err.message, list: []
        });
    }
}

// 注意：此函数在当前客户端聚合模式下可能未被直接调用。
// 自定义API的聚合搜索由 app.js 中的 performSearch 函数处理。
async function handleMultipleCustomSearch(searchQuery, customApiUrls) {
    const apiUrls = customApiUrls.split(CUSTOM_API_CONFIG.separator)
        .map(url => url.trim())
        .filter(url => /^https?:\/\//.test(url))
        .slice(0, CUSTOM_API_CONFIG.maxSources);
    if (!apiUrls.length) throw new Error('没有提供有效的自定义API地址');

    const requests = apiUrls.map((apiUrl, i) =>
        fetchWithTimeout(
            PROXY_URL + encodeURIComponent(`${apiUrl}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`),
            { headers: API_CONFIG.search.headers },
            CUSTOM_API_CONFIG.testTimeout
        ).catch(err => {
            console.warn(`自定义API ${i + 1} 搜索失败:`, err);
            return null;
        })
    );
    try {
        const results = await Promise.all(requests);
        let all = [];
        results.forEach((r, i) => {
            if (r && Array.isArray(r.list))
                all.push(...r.list.map(item => ({
                    ...item,
                    source_name: `${CUSTOM_API_CONFIG.namePrefix}${i + 1}`,
                    source_code: 'custom',
                    api_url: apiUrls[i]
                })));
        });
        if (!all.length) {
            return JSON.stringify({
                code: 200, list: [], msg: '所有自定义API源均无搜索结果'
            });
        }
        const seen = new Set(), unique = [];
        for (const item of all) {
            const k = `${item.api_url || ''}_${item.vod_id}`;
            if (!seen.has(k)) {
                seen.add(k);
                unique.push(item);
            }
        }
        return JSON.stringify({ code: 200, list: unique });
    } catch (err) {
        console.error('自定义API聚合搜索处理错误:', err);
        return JSON.stringify({
            code: 400,
            msg: '自定义API聚合搜索处理失败: ' + err.message,
            list: []
        });
    }
}

// ================================
// API请求主处理函数
// ================================
async function handleApiRequest(url) {
    const customApi = url.searchParams.get('customApi') || ''; // customApi 是自定义源的基础URL
    const source = url.searchParams.get('source') || 'heimuer';

    try {
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery) throw new Error('缺少搜索参数');

            if (source.startsWith('custom_') && !customApi) {
                 throw new Error('使用自定义API时必须提供API地址 (customApi参数)');
            }
            if (!source.startsWith('custom_') && !API_SITES[source]) {
                throw new Error('无效的API来源');
            }

            const apiUrl = source.startsWith('custom_')
                ? `${customApi}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`
                : `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
            
            try {
                const result = await fetchWithTimeout( // Expects JSON
                    PROXY_URL + encodeURIComponent(apiUrl),
                    { headers: API_CONFIG.search.headers }
                );
                if (!result || !Array.isArray(result.list)) throw new Error('API返回的数据格式无效');

                result.list.forEach(item => {
                    item.source_name = source.startsWith('custom_') ? (window.APISourceManager?.getCustomApiInfo(parseInt(source.replace('custom_','')))?.name || '自定义源') : API_SITES[source].name;
                    item.source_code = source;
                    if (source.startsWith('custom_')) {
                        item.api_url = customApi;
                    }
                });
                return JSON.stringify({ code: 200, list: result.list });
            } catch (error) {
                const errorMsg = error.name === 'AbortError' ? '搜索请求超时'
                    : error.name === 'SyntaxError' ? 'API返回的数据格式无效'
                    : error.message;
                return JSON.stringify({
                    code: 400,
                    msg: `搜索失败: ${errorMsg}`,
                    list: []
                });
            }
        }

        if (url.pathname === '/api/detail') {
            const id = url.searchParams.get('id');
            const sourceCode = url.searchParams.get('source') || 'heimuer';
            if (!id) throw new Error('缺少视频ID参数');
            if (!/^[\w-]+$/.test(id)) throw new Error('无效的视频ID格式');

            try {
                // 优先处理配置了 detail 页面的内置源 (需要HTML抓取)
                if (!sourceCode.startsWith('custom_') && API_SITES[sourceCode] && API_SITES[sourceCode].detail) {
                    return await handleSpecialSourceDetail(id, sourceCode);
                }
                // 处理需要HTML抓取的自定义源
                else if (sourceCode.startsWith('custom_') && url.searchParams.get('useDetail') === 'true') {
                    const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
                    const apiInfo = window.APISourceManager.getCustomApiInfo(customIndex); // APISourceManager should be globally available
                    if (apiInfo) {
                        const detailScrapeUrl = apiInfo.detail || customApi; // customApi is base URL from query
                        return await handleCustomApiSpecialDetail(id, detailScrapeUrl);
                    } else {
                        throw new Error(`自定义API信息未找到 (source: ${sourceCode})`);
                    }
                }
                // 标准API详情 (JSON)
                else {
                    const detailUrl = sourceCode.startsWith('custom_')
                        ? `${customApi}${API_CONFIG.detail.path}${id}` // customApi is base URL from query
                        : `${API_SITES[sourceCode].api}${API_CONFIG.detail.path}${id}`; // API_SITES[sourceCode].api is full path
                    
                    const result = await fetchWithTimeout( // Expects JSON
                        PROXY_URL + encodeURIComponent(detailUrl),
                        { headers: API_CONFIG.detail.headers }
                    );
                    if (!result || !Array.isArray(result.list) || !result.list.length)
                        throw new Error('获取到的详情内容无效');
                    
                    const videoDetail = result.list[0];
                    let episodes = [];

                    if (videoDetail.vod_play_url) {
                        const mainSource = videoDetail.vod_play_url.split('$$$')[0] || '';
                        episodes = mainSource.split('#')
                            .map(ep => {
                                const [, link] = ep.split('$');
                                return link && (link.startsWith('http://') || link.startsWith('https://')) ? link : '';
                            })
                            .filter(Boolean);
                    }
                    if (!episodes.length && videoDetail.vod_content) {
                        const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
                        episodes = matches.map(link => link.replace(/^\$/, ''));
                    }

                    return JSON.stringify({
                        code: 200,
                        episodes,
                        detailUrl, // Keep original detailUrl for reference
                        videoInfo: {
                            title: videoDetail.vod_name,
                            cover: videoDetail.vod_pic,
                            desc: videoDetail.vod_content,
                            type: videoDetail.type_name,
                            year: videoDetail.vod_year,
                            area: videoDetail.vod_area,
                            director: videoDetail.vod_director,
                            actor: videoDetail.vod_actor,
                            remarks: videoDetail.vod_remarks,
                            source_name: sourceCode.startsWith('custom_')
                                ? (window.APISourceManager?.getCustomApiInfo(parseInt(sourceCode.replace('custom_','')))?.name || '自定义源')
                                : (API_SITES && API_SITES[sourceCode] ? API_SITES[sourceCode].name : '未知来源'),
                            source_code: sourceCode
                        }
                    });
                }
            } catch (error) {
                 // Log the error with more context before re-throwing or returning
                console.error(`Error in detail processing for source ${sourceCode}, id ${id}:`, error);
                const errorMsg = error.name === 'AbortError' ? '详情请求超时'
                    : error.name === 'SyntaxError' ? '详情数据格式无效' // Should be less common now with fetchTextWithTimeout
                    : error.message;
                return JSON.stringify({
                    code: 400,
                    msg: `获取详情失败: ${errorMsg}`, // Pass the specific error message
                    episodes: []
                });
            }
        }
        throw new Error('未知的API路径');
    } catch (error) { // Catches errors from the main try block (e.g., "未知的API路径")
        console.error('API处理错误 (outer):', error);
        return JSON.stringify({
            code: 400,
            msg: error && error.message ? error.message : '请求处理失败',
            list: [],
            episodes: []
        });
    }
}

// 原始fetch函数
const originalFetch = window.fetch;

// 拦截全局fetch，处理API请求
window.fetch = async function (input, init) {
    let requestUrl;
    if (typeof input === 'string') {
        requestUrl = new URL(input, window.location.origin);
    } else if (input && input.url) {
        requestUrl = new URL(input.url, window.location.origin);
    }
    if (requestUrl && requestUrl.pathname.startsWith('/api/')) {
        if (window.isPasswordProtected && window.isPasswordVerified) {
            if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                return new Response(JSON.stringify({
                    code: 401,
                    msg: 'Unauthorized: 需要密码验证',
                    list: [],
                    episodes: []
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
        try {
            const data = await handleApiRequest(requestUrl);
            return new Response(data, {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            });
        } catch (err) { // This catch is for unexpected errors within handleApiRequest itself if it doesn't return a stringified JSON
            console.error("Error during API request handling in fetch override:", err);
            return new Response(JSON.stringify({
                code: 500,
                msg: '服务器内部错误: ' + (err.message || '未知错误'),
                list: [],
                episodes: []
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    return originalFetch.apply(this, arguments);
};

// 站点可用性测试
async function testSiteAvailability(apiUrl) {
    try {
        const response = await fetch('/api/search?wd=test&customApi=' + encodeURIComponent(apiUrl), {
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data && data.code !== 400 && Array.isArray(data.list);
    } catch (e) {
        console.error('站点可用性测试失败:', e);
        return false;
    }
}
