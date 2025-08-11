import { URL } from 'url';
import { Readable } from 'stream';

// --- 配置 (从环境变量读取，更健壮) ---
/**
 * 安全地从环境变量解析数字。
 * @param {string} key - 环境变量键名。
 * @param {number} defaultValue - 默认值。
 * @returns {number} 解析后的数字或默认值。
 */
function parseNumberEnv(key, defaultValue) {
    const value = process.env[key];
    if (value == null || value === '') return defaultValue;
    const num = Number(value);
    return !isNaN(num) && num >= 0 ? num : defaultValue;
}

/**
 * 安全地从环境变量解析 JSON 数组。
 * @param {string} key - 环境变量键名。
 * @param {Array<string>} defaultValue - 默认值。
 * @returns {Array<string>} 解析后的数组或默认值。
 */
function parseJsonArrayEnv(key, defaultValue) {
    const value = process.env[key];
    if (typeof value !== 'string' || !value.trim()) return defaultValue;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultValue;
    } catch {
        console.warn(`[代理警告] 解析环境变量 ${key} 失败，使用默认值。`);
        return defaultValue;
    }
}

const DEBUG_ENABLED = process.env.DEBUG === 'true';
const CACHE_TTL = parseNumberEnv('CACHE_TTL', 86400); // 默认 24 小时
const MAX_RECURSION = parseNumberEnv('MAX_RECURSION', 5); // 默认 5 层
const USER_AGENTS = parseJsonArrayEnv('USER_AGENTS_JSON', [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
]);


// --- 辅助函数 (优化与整合) ---

function logDebug(message) {
    if (DEBUG_ENABLED) {
        console.log(`[代理日志] ${message}`);
    }
}

/**
 * 从代理请求路径中提取编码后的目标 URL。
 * @param {string | string[]} pathData - Vercel 提供的路径数据。
 * @param {string} requestUrl - 原始请求 URL 作为备选。
 * @returns {string|null} 解码后的目标 URL，如果无效则返回 null。
 */
function getTargetUrlFromRequest(pathData, requestUrl) {
    let encodedPath = '';
    if (Array.isArray(pathData)) {
        encodedPath = pathData.join('/');
    } else if (typeof pathData === 'string') {
        encodedPath = pathData;
    }

    if (!encodedPath && requestUrl && requestUrl.startsWith('/proxy/')) {
        encodedPath = requestUrl.substring('/proxy/'.length);
        logDebug(`备选：从 req.url 提取路径: ${encodedPath}`);
    }

    if (!encodedPath) return null;

    try {
        const decodedUrl = decodeURIComponent(encodedPath);
        if (decodedUrl.match(/^https?:\/\/.+/i)) {
            return decodedUrl;
        }
        logDebug(`无效的解码 URL 格式: ${decodedUrl}`);
        return null;
    } catch (e) {
        logDebug(`解码目标 URL 出错: ${encodedPath} - ${e.message}`);
        return null;
    }
}

const getBaseUrl = (urlStr) => {
    try {
        const url = new URL(urlStr);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length <= 1) return `${url.origin}/`;
        parts.pop();
        return `${url.origin}/${parts.join('/')}/`;
    } catch (e) {
        const lastSlash = urlStr.lastIndexOf('/');
        const protoEnd = urlStr.indexOf('://');
        return lastSlash > (protoEnd !== -1 ? protoEnd + 2 : 0) ? urlStr.substring(0, lastSlash + 1) : urlStr + '/';
    }
};

const resolveUrl = (baseUrl, relativeUrl, cache) => {
    if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
    const cacheKey = `${baseUrl}|${relativeUrl}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    try {
        const absoluteUrl = new URL(relativeUrl, baseUrl).toString();
        cache.set(cacheKey, absoluteUrl);
        return absoluteUrl;
    } catch (e) {
        logDebug(`URL 解析失败: base="${baseUrl}", relative="${relativeUrl}"`);
        return relativeUrl; // fallback
    }
};

const rewriteUrlToProxy = (targetUrl) => `/proxy/${encodeURIComponent(targetUrl)}`;
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const isM3u8ContentType = (contentType) => contentType && (contentType.includes('mpegurl') || contentType.includes('application/vnd.apple.mpegurl'));
const isM3u8Content = (content, contentType) => isM3u8ContentType(contentType) || (typeof content === 'string' && content.trim().startsWith('#EXTM3U'));

// --- 网络与 M3U8 处理 (核心优化区) ---

/**
 * 抓取目标资源，但不立即读取响应体。
 * @returns {Promise<{response: Response, contentType: string}>} 返回原始 Response 对象和内容类型。
 */
async function fetchResource(targetUrl, requestHeaders) {
    const headers = {
        'User-Agent': getRandomUserAgent(),
        'Accept': requestHeaders['accept'] || '*/*',
        'Referer': requestHeaders['referer'] || new URL(targetUrl).origin,
    };
    logDebug(`请求目标: ${targetUrl}`);
    const response = await fetch(targetUrl, { headers, redirect: 'follow' });

    if (!response.ok) {
        const err = new Error(`HTTP 错误 ${response.status}: ${response.statusText}. URL: ${targetUrl}`);
        err.status = response.status;
        throw err;
    }
    const contentType = response.headers.get('content-type') || '';
    return { response, contentType };
}

/**
 * 简化版：直接查找第一个子播放列表URL，而非最高码率。
 * 这避免了复杂的解析和不必要的等待，对于大多数场景足够好。
 */
const findFirstVariantUrl = (content, baseUrl, cache) => {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // 优先检查 URI 在 #EXT-X-STREAM-INF 之后的行
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j].trim();
                if (nextLine && !nextLine.startsWith('#')) {
                    return resolveUrl(baseUrl, nextLine, cache);
                }
            }
        }
        // 备选方案：检查 #EXT-X-MEDIA 中的 URI
        if (line.startsWith('#EXT-X-MEDIA')) {
            const uriMatch = line.match(/URI="([^"]+)"/);
            if (uriMatch) {
                return resolveUrl(baseUrl, uriMatch[1], cache);
            }
        }
    }
    return null;
};

function processMediaPlaylist(url, content, cache) {
    const baseUrl = getBaseUrl(url);
    const lines = content.split('\n');
    return lines.map(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#EXT')) {
            // 统一处理所有带 URI 的标签
            if (trimmedLine.includes('URI="')) {
                return trimmedLine.replace(/URI="([^"]+)"/, (match, uri) => {
                    const absoluteUri = resolveUrl(baseUrl, uri, cache);
                    return `URI="${rewriteUrlToProxy(absoluteUri)}"`;
                });
            }
            return line; // 保留原始行（包括空行和其他标签）
        }
        // 处理媒体片段 URL
        const absoluteUrl = resolveUrl(baseUrl, trimmedLine, cache);
        return rewriteUrlToProxy(absoluteUrl);
    }).join('\n');
}

async function processM3u8(targetUrl, content, recursionDepth = 0, cache) {
    if (recursionDepth > MAX_RECURSION) {
        throw new Error(`M3U8 递归处理超过最大深度 (${MAX_RECURSION})`);
    }

    const isMaster = content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:');

    if (isMaster) {
        logDebug(`处理主播放列表: ${targetUrl} (深度: ${recursionDepth})`);
        const baseUrl = getBaseUrl(targetUrl);
        const variantUrl = findFirstVariantUrl(content, baseUrl, cache);

        if (!variantUrl) {
            logDebug("在主播放列表中未找到子列表，按媒体列表处理。");
            return processMediaPlaylist(targetUrl, content, cache);
        }

        logDebug(`选择的子列表: ${variantUrl}`);
        const { response: variantResponse } = await fetchResource(variantUrl, {});
        const variantContent = await variantResponse.text();

        // 递归处理子列表
        return await processM3u8(variantUrl, variantContent, recursionDepth + 1, cache);
    } else {
        logDebug(`处理媒体播放列表: ${targetUrl}`);
        return processMediaPlaylist(targetUrl, content, cache);
    }
}


// --- Vercel Handler 函数 (重构后) ---
export default async function handler(req, res) {
    // --- 1. 预处理和 CORS ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        return res.status(204).setHeader('Access-Control-Max-Age', '86400').end();
    }

    let targetUrl = null;

    try {
        // --- 2. 提取和验证目标 URL ---
        // Vercel 将 `[...path]` 路由参数放入 `req.query.path`
        targetUrl = getTargetUrlFromRequest(req.query.path, req.url);

        if (!targetUrl) {
            return res.status(400).json({ success: false, error: '无效的目标 URL。' });
        }
        console.info(`[代理请求] ${targetUrl}`);

        // --- 3. 抓取资源 ---
        const { response, contentType } = await fetchResource(targetUrl, req.headers);

        // --- 4. 判断内容类型并处理 ---
        const isM3u8 = isM3u8Content(null, contentType) || targetUrl.endsWith('.m3u8');

        if (isM3u8) {
            // **M3U8 文件: 必须完整读取和处理**
            const content = await response.text();
            if (!content.trim().startsWith('#EXTM3U')) {
                // 如果内容不是M3U8，即使文件扩展名或类型暗示是，也按原始文件流式传输
                logDebug(`内容与M3U8类型不符，转为流式传输: ${targetUrl}`);
                // 将文本转回流进行统一处理
                return streamResponse(res, Readable.from(content), response.headers, contentType);
            }

            console.info(`正在处理 M3U8: ${targetUrl}`);
            const urlResolutionCache = new Map(); // 为单次请求创建URL解析缓存
            const processedM3u8 = await processM3u8(targetUrl, content, 0, urlResolutionCache);

            res.status(200)
                .setHeader('Content-Type', 'application/vnd.apple.mpegurl;charset=utf-8')
                .setHeader('Cache-Control', `public, max-age=${CACHE_TTL}`)
                .send(processedM3u8);

        } else {
            // **非 M3U8 文件 (如 .ts, .key, 图片): 直接流式传输**
            console.info(`流式传输非 M3U8 内容: ${targetUrl}, 类型: ${contentType}`);
            streamResponse(res, response.body, response.headers, contentType);
        }

    } catch (error) {
        console.error(`[代理错误] 目标: ${targetUrl || '解析失败'} | 错误: ${error.message}`);
        console.error(error.stack);
        const statusCode = error.status || 500;
        if (!res.headersSent) {
            res.status(statusCode).json({
                success: false,
                error: `代理处理错误: ${error.message}`,
                targetUrl: targetUrl,
            });
        }
    }
}

/**
 * 将源响应的流式内容传输到客户端。
 * @param {import('http').ServerResponse} res - Vercel 的响应对象。
 * @param {ReadableStream} bodyStream - 源响应的正文流。
 * @param {Headers} originHeaders - 源响应的头。
 * @param {string} contentType - 内容类型。
 */
function streamResponse(res, bodyStream, originHeaders, contentType) {
    // 复制必要的原始响应头
    originHeaders.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        // 过滤掉逐跳首部和可能引起问题的首部
        if (![
            'content-encoding', // Vercel/fetch会自动处理解压
            'content-length',   // 长度在流式传输中未知
            'transfer-encoding',
            'connection',
            'keep-alive',
            'host',
        ].includes(lowerKey) && !lowerKey.startsWith('access-control-')) {
            res.setHeader(key, value);
        }
    });

    // 确保 Content-Type 被设置
    if (contentType) {
        res.setHeader('Content-Type', contentType);
    }

    res.setHeader('Cache-Control', `public, max-age=${CACHE_TTL}`);
    res.status(200);

    // 使用 pipe 将源流直接导向响应流，这是最高效的方式
    Readable.fromWeb(bodyStream).pipe(res);
}
