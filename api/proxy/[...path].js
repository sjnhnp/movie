import fetch from 'node-fetch';
import { URL } from 'url';

// --- 配置 (从环境变量读取) ---
const DEBUG_ENABLED = process.env.DEBUG === 'true';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '86400', 10); // 默认 24 小时
const MAX_RECURSION = parseInt(process.env.MAX_RECURSION || '5', 10); // 默认 5 层
const LARGE_MAX_BYTES = parseInt(process.env.LARGE_MAX_MB || '32', 10) * 1024 * 1024; // 默认 32MB

// --- User Agent 处理 ---
// 默认 User Agent 列表
let USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
];

// 尝试从环境变量读取并解析 USER_AGENTS_JSON
try {
    const agentsJsonString = process.env.USER_AGENTS_JSON;
    if (agentsJsonString) {
        const parsedAgents = JSON.parse(agentsJsonString);
        if (Array.isArray(parsedAgents) && parsedAgents.length > 0) {
            USER_AGENTS = parsedAgents;
            if (DEBUG_ENABLED) console.log(`[代理日志] 已从环境变量加载 ${USER_AGENTS.length} 个 User Agent。`);
        } else {
            console.warn("[代理日志] 环境变量 USER_AGENTS_JSON 不是有效的非空数组，使用默认值。");
        }
    }
} catch (e) {
    console.error(`[代理日志] 解析环境变量 USER_AGENTS_JSON 出错: ${e.message}。使用默认 User Agent。`);
}

// 常量定义
const M3U8_CONTENT_TYPES = [
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'audio/mpegurl'
];

const RE_URI = /URI\s*=\s*"([^"]+)"/g;
const RE_OTHER_URI = /\b([A-Z0-9_-]*?URI)\s*=\s*"([^"]+)"/gi;

// --- CORS 头部 ---
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400'
};

// --- 辅助函数 ---
function logDebug(message) {
    if (DEBUG_ENABLED) {
        console.log(`[代理日志] ${message}`);
    }
}

/**
 * 从代理请求路径中提取编码后的目标 URL。
 * @param {string} encodedPath - URL 编码后的路径部分
 * @returns {string|null} 解码后的目标 URL，如果无效则返回 null。
 */
function getTargetUrlFromPath(encodedPath) {
    if (!encodedPath) {
        logDebug("getTargetUrlFromPath 收到空路径。");
        return null;
    }

    try {
        const decodedUrl = decodeURIComponent(encodedPath);
        // 检查是否是一个 HTTP/HTTPS URL
        if (decodedUrl.match(/^https?:\/\/.+/i)) {
            return decodedUrl;
        } else {
            logDebug(`无效的解码 URL 格式: ${decodedUrl}`);
            // 备选检查：原始路径是否未编码但看起来像 URL？
            if (encodedPath.match(/^https?:\/\/.+/i)) {
                logDebug(`警告: 路径未编码但看起来像 URL: ${encodedPath}`);
                return encodedPath;
            }
            return null;
        }
    } catch (e) {
        logDebug(`解码目标 URL 出错: ${encodedPath} - ${e.message}`);
        return null;
    }
}

/**
 * 获取 URL 的基础路径
 * @param {string} urlStr - 原始 URL
 * @returns {string} 基础 URL 路径
 */
function getBaseUrl(urlStr) {
    if (!urlStr) return '';
    try {
        const url = new URL(urlStr);
        if (!url.pathname || url.pathname === "/") return `${url.origin}/`;
        const parts = url.pathname.split('/');
        parts.pop();
        return `${url.origin}${parts.join('/')}/`;
    } catch (e) {
        logDebug(`获取 BaseUrl 失败: "${urlStr}": ${e.message}`);
        // 备用方法：查找最后一个斜杠
        const protoEnd = urlStr.indexOf("://");
        if (protoEnd === -1) return urlStr;
        const lastSlash = urlStr.lastIndexOf("/");
        return lastSlash > protoEnd + 2
            ? urlStr.slice(0, lastSlash + 1)
            : urlStr.endsWith("/")
                ? urlStr
                : `${urlStr}/`;
    }
}

/**
 * 缓存式相对 URL 解析
 * @param {string} baseUrl - 基础 URL
 * @param {string} relativeUrl - 相对 URL
 * @param {Map} cache - URL 解析缓存
 * @returns {string} 解析后的绝对 URL
 */
function resolveUrl(baseUrl, relativeUrl, cache = new Map()) {
    if (!relativeUrl) return '';
    if (relativeUrl.match(/^https?:\/\/.+/i)) {
        return relativeUrl; // 已经是绝对 URL
    }
    if (!baseUrl) return relativeUrl; // 没有基础 URL 无法解析

    const key = `${baseUrl}|${relativeUrl}`;
    if (cache.has(key)) return cache.get(key);

    try {
        // 使用 URL 构造函数处理相对路径
        const resolved = new URL(relativeUrl, baseUrl).toString();
        cache.set(key, resolved);
        return resolved;
    } catch (e) {
        logDebug(`URL 解析失败: base="${baseUrl}", relative="${relativeUrl}". 错误: ${e.message}`);

        // 简单的备用逻辑
        if (relativeUrl.startsWith('/')) {
            try {
                const baseOrigin = new URL(baseUrl).origin;
                return `${baseOrigin}${relativeUrl}`;
            } catch {
                return relativeUrl; // 如果 baseUrl 也无效，返回原始相对路径
            }
        } else {
            // 假设相对于包含基础URL资源的目录
            return `${getBaseUrl(baseUrl)}${relativeUrl}`;
        }
    }
}

/**
 * 创建代理 URL
 * @param {string} targetUrl - 目标 URL
 * @returns {string} 代理 URL 路径
 */
function rewriteUrlToProxy(targetUrl) {
    if (!targetUrl || typeof targetUrl !== 'string') return '';
    return `/proxy/${encodeURIComponent(targetUrl)}`;
}

/**
 * 随机获取一个 User Agent
 * @returns {string} 随机 User Agent
 */
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 检查内容是否是 M3U8 格式
 * @param {string} content - 响应内容
 * @param {string} contentType - 内容类型
 * @returns {boolean} 是否为 M3U8 内容
 */
function isM3u8Content(content, contentType) {
    if (!content) return false;

    // 检查内容类型
    if (contentType && M3U8_CONTENT_TYPES.some(ct => contentType.toLowerCase().includes(ct))) {
        return true;
    }

    // 检查内容本身
    return typeof content === 'string' && content.trim().startsWith('#EXTM3U');
}

/**
 * 创建获取远程内容的请求头
 * @param {Object} requestHeaders - 原始请求头
 * @param {string} targetUrl - 目标 URL
 * @returns {Object} 请求头对象
 */
function createFetchHeaders(requestHeaders, targetUrl) {
    const headers = {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/x-mpegurl, video/*;q=0.75, image/*;q=0.6, application/json;q=0.6, */*;q=0.5',
    };

    // 添加 Accept-Language 如果存在
    if (requestHeaders['accept-language']) {
        headers['Accept-Language'] = requestHeaders['accept-language'];
    }

    // 设置 Referer
    try {
        headers['Referer'] = new URL(targetUrl).origin;
    } catch (e) {
        if (requestHeaders['referer']) {
            headers['Referer'] = requestHeaders['referer'];
        }
    }

    return headers;
}

/**
 * 判断是否是大文件
 * @param {number} contentLength - 内容长度
 * @param {string} contentType - 内容类型
 * @returns {boolean} 是否为大文件
 */
function isLargeFile(contentLength, contentType) {
    // 如果明确知道文件很大
    if (contentLength > LARGE_MAX_BYTES) return true;

    // 如果是明确的二进制媒体类型
    const binaryTypes = ['video/', 'audio/', 'application/octet-stream', 'image/'];
    if (contentType && binaryTypes.some(type => contentType.startsWith(type)) && contentLength > 1024 * 1024) {
        return true;
    }

    return false;
}

/**
 * 处理 URL 行的 KEY 和 MAP 等值
 * @param {string} line - M3U8 行内容 
 * @param {string} baseUrl - 基础 URL
 * @param {Map} cache - URL 缓存
 * @returns {string} 处理后的行
 */
function processUriLine(line, baseUrl, cache) {
    // 处理 URI="..." 格式
    let result = line.replace(RE_URI, (_, uri) => {
        const absoluteUri = resolveUrl(baseUrl, uri, cache);
        return `URI="${rewriteUrlToProxy(absoluteUri)}"`;
    });

    // 处理其他可能的 *URI="..." 格式 
    result = result.replace(RE_OTHER_URI, (match, attr, uri) => {
        if (!uri.includes("://")) return match;
        const absoluteUri = resolveUrl(baseUrl, uri, cache);
        return `${attr}="${rewriteUrlToProxy(absoluteUri)}"`;
    });

    return result;
}

/**
 * 抓取远程内容，支持流式处理和内容转换
 * @param {string} targetUrl - 目标 URL
 * @param {Object} requestHeaders - 原始请求头
 * @returns {Promise<Object>} 响应内容对象
 */
async function fetchContentWithType(targetUrl, requestHeaders) {
    const headers = createFetchHeaders(requestHeaders, targetUrl);
    logDebug(`准备请求目标: ${targetUrl}`);

    let response;
    try {
        response = await fetch(targetUrl, { headers, redirect: 'follow' });
    } catch (error) {
        throw new Error(`网络请求失败 ${targetUrl}: ${error.message}`);
    }

    // 检查响应是否成功
    if (!response.ok) {
        const errorText = await response.text().catch(() => '<无法读取>').then(t => t.substring(0, 200));
        throw new Error(`HTTP ${response.status}: ${response.statusText}. URL: ${targetUrl}. Body: ${errorText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

    // 检测是否为文本内容
    const isText = contentType.includes('text/') ||
        M3U8_CONTENT_TYPES.some(t => contentType.toLowerCase().includes(t)) ||
        contentType.includes('application/json');

    let content;
    let isStream = false;

    // 大文件处理策略
    if (!isText && isLargeFile(contentLength, contentType)) {
        logDebug(`检测到大文件: ${contentLength} 字节, 类型: ${contentType}`);
        // Vercel 环境不支持流式响应，需要完整缓冲
        content = await response.buffer();
        isStream = false;
    } else {
        // 中小文件或文本内容直接读取
        const buffer = await response.buffer();

        // 根据内容类型确定如何处理
        if (isText) {
            content = buffer.toString('utf-8');
        } else {
            content = buffer;
        }
        isStream = false;
    }

    logDebug(`请求成功: ${targetUrl}, 内容类型: ${contentType}, 大小: ${typeof content === 'string' ? content.length : content.byteLength}`);

    return { content, contentType, responseHeaders: response.headers, isStream };
}

/**
 * 处理媒体播放列表内容
 * @param {string} url - 播放列表 URL
 * @param {string} content - 播放列表内容
 * @param {Map} cache - URL 解析缓存
 * @returns {string} 处理后的播放列表内容
 */
function processMediaPlaylist(url, content, cache = new Map()) {
    const baseUrl = getBaseUrl(url);
    const newline = content.includes('\r\n') ? '\r\n' : '\n';

    const lines = content.split(/\r?\n/);
    const output = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 跳过空行，但保留最后一个空行
        if (!line) {
            if (i === lines.length - 1) output.push('');
            continue;
        }

        // 处理特殊标签
        if (line.startsWith('#EXT-X-KEY') || line.startsWith('#EXT-X-MAP')) {
            output.push(processUriLine(line, baseUrl, cache));
            continue;
        }

        // 处理 EXTINF 标签
        if (line.startsWith('#EXTINF')) {
            output.push(line);
            continue;
        }

        // 处理 URL 行
        if (!line.startsWith('#')) {
            const absoluteUrl = resolveUrl(baseUrl, line, cache);
            output.push(rewriteUrlToProxy(absoluteUrl));
            continue;
        }

        // 保留其他标签
        output.push(line);
    }

    return output.join(newline);
}

/**
 * 查找主播放列表中的第一个变体 URL
 * @param {string} content - 播放列表内容
 * @param {string} baseUrl - 基础 URL
 * @param {Map} cache - URL 解析缓存
 * @returns {string} 变体 URL
 */
function findFirstVariantUrl(content, baseUrl, cache = new Map()) {
    const lines = content.split(/\r?\n/);
    let highestBandwidth = -1;
    let bestVariantUrl = '';

    // 查找最高带宽的流
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 处理 EXT-X-MEDIA 标签
        if (line.startsWith('#EXT-X-MEDIA')) {
            const uriMatch = line.match(/URI\s*=\s*"([^"]+)"/);
            if (uriMatch) {
                const absoluteUri = resolveUrl(baseUrl, uriMatch[1], cache);
                logDebug(`变体 (MEDIA): ${absoluteUri}`);
                return absoluteUri;
            }
        }

        // 处理 EXT-X-STREAM-INF 标签
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
            const currentBandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;

            // 寻找下一行的 URI
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j].trim();
                if (!nextLine || nextLine.startsWith('#')) continue;

                // 找到了 URI 行
                const absoluteUri = resolveUrl(baseUrl, nextLine, cache);

                // 如果带宽更高或尚未找到变体
                if (currentBandwidth > highestBandwidth || !bestVariantUrl) {
                    highestBandwidth = currentBandwidth;
                    bestVariantUrl = absoluteUri;
                    logDebug(`找到变体 (STREAM-INF, 带宽=${currentBandwidth}): ${absoluteUri}`);
                }

                i = j; // 跳过已处理的 URI 行
                break;
            }
        }
    }

    // 如果找不到带宽信息，尝试找到第一个 .m3u8 链接
    if (!bestVariantUrl) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('#') && line.match(/\.m3u8($|\?.*)/i)) {
                bestVariantUrl = resolveUrl(baseUrl, line, cache);
                logDebug(`找到第一个 .m3u8 链接: ${bestVariantUrl}`);
                break;
            }
        }
    }

    return bestVariantUrl;
}

/**
 * 处理主播放列表内容
 * @param {string} url - 播放列表 URL
 * @param {string} content - 播放列表内容
 * @param {number} recursionDepth - 递归深度
 * @param {Object} requestHeaders - 原始请求头
 * @param {Map} cache - URL 解析缓存
 * @returns {Promise<string>} 处理后的播放列表内容
 */
async function processMasterPlaylist(url, content, recursionDepth, requestHeaders, cache = new Map()) {
    // 检查递归深度
    if (recursionDepth > MAX_RECURSION) {
        throw new Error(`处理主播放列表时，递归深度超过最大限制 (${MAX_RECURSION}): ${url}`);
    }

    const baseUrl = getBaseUrl(url);
    const variantUrl = findFirstVariantUrl(content, baseUrl, cache);

    // 如果没有找到变体 URL
    if (!variantUrl) {
        logDebug(`在主播放列表 ${url} 中未找到有效的变体 URL，将作为媒体列表处理。`);
        return processMediaPlaylist(url, content, cache);
    }

    logDebug(`选择的变体播放列表: ${variantUrl}`);

    try {
        // 请求变体播放列表
        const { content: variantContent, contentType } = await fetchContentWithType(variantUrl, requestHeaders);

        // 检查获取的内容是否是 M3U8
        if (!isM3u8Content(variantContent, contentType)) {
            logDebug(`获取的变体播放列表 ${variantUrl} 不是 M3U8 格式，作为媒体列表处理。`);
            return processMediaPlaylist(variantUrl, variantContent, cache);
        }

        // 递归处理变体播放列表
        return await processM3u8Content(variantUrl, variantContent, recursionDepth + 1, requestHeaders, cache);
    } catch (error) {
        logDebug(`处理变体播放列表 ${variantUrl} 失败: ${error.message}`);
        // 失败后回退到处理原始内容
        return processMediaPlaylist(url, content, cache);
    }
}

/**
 * 递归处理 M3U8 内容
 * @param {string} targetUrl - 目标 URL
 * @param {string} content - M3U8 内容
 * @param {number} recursionDepth - 递归深度
 * @param {Object} requestHeaders - 原始请求头
 * @param {Map} cache - URL 解析缓存
 * @returns {Promise<string>} 处理后的 M3U8 内容
 */
async function processM3u8Content(targetUrl, content, recursionDepth = 0, requestHeaders = {}, cache = new Map()) {
    // 判断是主列表还是媒体列表
    const isMaster = content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:');

    if (isMaster) {
        logDebug(`检测到主播放列表: ${targetUrl} (深度: ${recursionDepth})`);
        return await processMasterPlaylist(targetUrl, content, recursionDepth, requestHeaders, cache);
    }

    logDebug(`检测到媒体播放列表: ${targetUrl} (深度: ${recursionDepth})`);
    return processMediaPlaylist(targetUrl, content, cache);
}

/**
 * 过滤和准备响应头
 * @param {Headers} originalHeaders - 原始响应头
 * @returns {Object} 过滤后的响应头
 */
function prepareResponseHeaders(originalHeaders) {
    const headers = {};

    // 复制需要的响应头
    const headersToKeep = [
        'content-type',
        'content-language',
        'content-disposition',
        'cache-control',
        'expires',
        'last-modified',
        'etag'
    ];

    for (const key of headersToKeep) {
        const value = originalHeaders.get(key);
        if (value) headers[key] = value;
    }

    // 设置缓存控制
    headers['Cache-Control'] = `public, max-age=${CACHE_TTL}`;
    headers['Surrogate-Control'] = `public, max-age=${CACHE_TTL}`;
    headers['CDN-Cache-Control'] = `public, max-age=${CACHE_TTL}`;

    // 设置 CORS 头
    Object.assign(headers, CORS_HEADERS);

    return headers;
}

// --- Vercel Handler 函数 ---
export default async function handler(req, res) {
    // --- 记录请求开始 ---
    const startTime = Date.now();
    logDebug(`请求开始: ${req.url}`);

    // --- 提前设置 CORS 头 ---
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(key, value);
    }

    // --- 处理 OPTIONS 预检请求 ---
    if (req.method === 'OPTIONS') {
        logDebug("处理 OPTIONS 预检请求");
        return res.status(204).end();
    }

    let targetUrl = null; // 初始化目标 URL
    const urlCache = new Map(); // URL 解析缓存

    try {
        // --- 提取目标 URL ---
        const pathData = req.query["...path"];
        let encodedUrlPath = '';

        if (pathData) {
            if (Array.isArray(pathData)) {
                encodedUrlPath = pathData.join('/');
            } else if (typeof pathData === 'string') {
                encodedUrlPath = pathData;
            }
        }

        // 备选方案：尝试从 req.url 提取
        if (!encodedUrlPath && req.url && req.url.startsWith('/proxy/')) {
            encodedUrlPath = req.url.substring('/proxy/'.length);
        }

        // 如果仍然为空，则无法继续
        if (!encodedUrlPath) {
            throw new Error("无法从请求中确定编码后的目标路径。");
        }

        // 解析目标 URL
        targetUrl = getTargetUrlFromPath(encodedUrlPath);
        logDebug(`解析出的目标 URL: ${targetUrl || 'null'}`);

        // 检查目标 URL 是否有效
        if (!targetUrl) {
            throw new Error(`无效的代理请求路径: "${encodedUrlPath}"`);
        }

        // --- 获取并处理目标内容 ---
        const { content, contentType, responseHeaders, isStream } = await fetchContentWithType(targetUrl, req.headers);

        // --- 如果是 M3U8，处理并返回 ---
        if (isM3u8Content(content, contentType)) {
            logDebug(`正在处理 M3U8 内容: ${targetUrl}`);
            const processedM3u8 = await processM3u8Content(targetUrl, content, 0, req.headers, urlCache);

            logDebug(`成功处理 M3U8: ${targetUrl}`);
            // 发送处理后的 M3U8 响应
            return res.status(200)
                .setHeader('Content-Type', 'application/vnd.apple.mpegurl')
                .setHeader('Cache-Control', `public, max-age=${CACHE_TTL}`)
                .send(processedM3u8);
        }

        // --- 如果不是 M3U8，直接返回原始内容 ---
        logDebug(`直接返回非 M3U8 内容: ${targetUrl}, 类型: ${contentType}`);

        // 设置响应头
        const headers = prepareResponseHeaders(responseHeaders);
        Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
        });

        // 发送原始内容
        return res.status(200).send(content);

    } catch (error) {
        // 错误处理
        logDebug(`代理错误: ${error.message}`);
        if (error.stack) logDebug(`错误堆栈: ${error.stack}`);

        // 尝试从错误对象获取状态码，否则默认为 500
        const statusCode = error.status || 500;

        // 确保在发送错误响应前没有发送过响应头
        if (!res.headersSent) {
            return res.status(statusCode).json({
                success: false,
                error: `代理处理错误: ${error.message}`,
                targetUrl: targetUrl
            });
        } else {
            // 如果响应头已发送，无法再发送 JSON 错误
            logDebug("响应头已发送，无法发送 JSON 错误响应。");
            if (!res.writableEnded) {
                res.end();
            }
            return;
        }
    } finally {
        // 记录请求处理时间
        logDebug(`请求处理完成，耗时: ${Date.now() - startTime}ms`);
    }
}