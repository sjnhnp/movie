// ================================
// API请求与聚合处理
// ================================

async function fetchWithTimeout(targetUrl, options, timeout = 10000, responseType = 'json') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(targetUrl, { ...options, signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`请求失败: ${response.status} ${response.statusText} for ${targetUrl}`);
        // 根据类型返回结果
        return responseType === 'text' ? await response.text() : await response.json();
    } catch (error) {
        clearTimeout(timer);
        // 统一错误信息前缀（区分类型）
        const typeText = responseType === 'text' ? 'text' : 'JSON';
        if (error instanceof Error && !(error.message.includes(targetUrl))) {
            error.message = `Error fetching ${typeText} from ${targetUrl}: ${error.message}`;
        }
        throw error;
    }
}

// 处理特殊片源详情 (内置源，需要HTML抓取)
async function handleSpecialSourceDetail(id, sourceCode) {
    try {
        const detailPageUrl = `${API_SITES[sourceCode].detail}/index.php/vod/detail/id/${id}.html`;
        const htmlContent = await fetchWithTimeout(
            PROXY_URL + encodeURIComponent(detailPageUrl),
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'] } },
            10000,
            'text'
        );

        let matches = [];
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
        const fullUrl = PROXY_URL + encodeURIComponent(detailPageUrl); // 使用代理避免跨域
        // 增加超时控制（10秒），避免无限等待
        const htmlContent = await fetchWithTimeout(
            fullUrl,
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'] } },
            10000, // 超时时间10秒
            'text'
        );

        // 优化1：增加多种播放地址正则匹配（兼容不同格式）
        let matches = [];
        // 匹配带$前缀的地址
        matches = htmlContent.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
        // 匹配不带$前缀的地址
        if (matches.length === 0) {
            matches = htmlContent.match(/(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
        }
        // 匹配带参数的地址
        if (matches.length === 0) {
            matches = htmlContent.match(/(https?:\/\/[^"'\s]+?\.m3u8\?[^"'\s]+)/g) || [];
        }

        // 优化2：清洗地址（移除多余字符）
        matches = Array.from(new Set(matches)).map(link => {
            link = link.startsWith('$') ? link.slice(1) : link; // 移除可能的$前缀
            link = link.split('?')[0] + '?' + link.split('?').slice(1).join('?'); // 保留参数
            return link;
        }).filter(link => link.startsWith('http') && link.includes('.m3u8')); // 过滤无效地址

        if (matches.length === 0) {
            throw new Error('未提取到真实播放地址（三次尝试后将自动修复）');
        }

        // 优化3：立即保存真实地址到缓存（供下次使用）
        localStorage.setItem('customApiRealUrls_' + id, JSON.stringify(matches));

        return JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl: detailPageUrl,
            videoInfo: { title: '自定义源播放', source_name: '自定义API', source_code: 'custom' }
        });
    } catch (e) {
        console.error('自定义API detail源解析失败（本次尝试）', e);
        // 即使失败，也保存空地址到缓存（避免重复无效请求）
        localStorage.setItem('customApiRealUrls_' + id, JSON.stringify([]));
        throw e; // 抛出错误，触发重试逻辑
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
                    item.source_name = source.startsWith('custom_') ? (window.APISourceManager?.getCustomApiInfo(parseInt(source.replace('custom_', '')))?.name || '自定义源') : API_SITES[source].name;
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

                // 处理需要HTML抓取的自定义源（有 detail 字段就走特殊抓取）
                else if (sourceCode.startsWith('custom_')) {
                    const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
                    const apiInfo = window.APISourceManager.getCustomApiInfo(customIndex);
                    if (apiInfo && apiInfo.detail) {
                        // 直接用 detail 字段
                        return await handleCustomApiSpecialDetail(id, apiInfo.detail);
                    }
                }

                // 标准API详情 (JSON)
                else {
                    const detailUrl = sourceCode.startsWith('custom_')
                        ? `${customApi}${API_CONFIG.detail.path}${id}`
                        : `${API_SITES[sourceCode].api}${API_CONFIG.detail.path}${id}`;

                    const result = await fetchWithTimeout(
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
                        detailUrl,
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
                                ? (window.APISourceManager?.getCustomApiInfo(parseInt(sourceCode.replace('custom_', '')))?.name || '自定义源')
                                : (API_SITES && API_SITES[sourceCode] ? API_SITES[sourceCode].name : '未知来源'),
                            source_code: sourceCode
                        }
                    });
                }
            } catch (error) {
                console.error(`Error in detail processing for source ${sourceCode}, id ${id}:`, error);
                const errorMsg = error.name === 'AbortError' ? '详情请求超时'
                    : error.name === 'SyntaxError' ? '详情数据格式无效'
                        : error.message;
                return JSON.stringify({
                    code: 400,
                    msg: `获取详情失败: ${errorMsg}`,
                    episodes: []
                });
            }
        }
        throw new Error('未知的API路径');
    } catch (error) {
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
        } catch (err) {
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


function resolveUrl(baseUrl, relativeUrl) {
    // 空字符串直接返回
    if (!relativeUrl) {
        return '';
    }

    // —— 1. 协议相对 URL，如 //cdn.example.com/lib.js —— 
    if (relativeUrl.startsWith('//')) {
        try {
            const { protocol } = new URL(baseUrl);
            return protocol + relativeUrl;
        } catch (e) {
            console.warn(`Protocol-relative URL 解析失败:`, e);
            return relativeUrl;
        }
    }

    // —— 2. 绝对 URL：以 scheme: 开头（包括 http: data: blob: 等） —— 
    if (/^[a-z][a-z0-9+.-]*:/i.test(relativeUrl)) {
        return relativeUrl;
    }

    // —— 3. 其余情况交给 URL API 处理 —— 
    try {
        return new URL(relativeUrl, baseUrl).toString();
    } catch (e) {
        console.warn(`URL 解析失败: base="${baseUrl}", relative="${relativeUrl}"`, e);
        // —— 4. 回退到简单拼接 —— 
        let base = baseUrl;
        let rel = relativeUrl;

        const baseEndsSlash = base.endsWith('/');
        const relStartsSlash = rel.startsWith('/');
        if (baseEndsSlash && relStartsSlash) {
            // 去重斜杠
            rel = rel.slice(1);
        } else if (!baseEndsSlash && !relStartsSlash) {
            // 缺少斜杠
            base += '/';
        }
        return base + rel;
    }
}