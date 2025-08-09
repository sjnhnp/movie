// /api/proxy/[...path].mjs - Vercel Serverless Function (ES Module)

import fetch from 'node-fetch';
import { URL } from 'url'; // 使用 Node.js 内置 URL 处理

// --- 配置 (从环境变量读取) ---
const DEBUG_ENABLED = process.env.DEBUG === 'true';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '86400', 10); // 默认 24 小时
const MAX_RECURSION = parseInt(process.env.MAX_RECURSION || '5', 10); // 默认 5 层

// --- User Agent 处理 ---
// 默认 User Agent 列表
const DEFAULT_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
];

// 初始化 User Agents（只执行一次）
const USER_AGENTS = (() => {
    const agentsJsonString = process.env.USER_AGENTS_JSON;
    if (!agentsJsonString) return DEFAULT_USER_AGENTS;
    
    try {
        const parsedAgents = JSON.parse(agentsJsonString);
        if (Array.isArray(parsedAgents) && parsedAgents.length > 0) {
            console.log(`[代理日志] 已从环境变量加载 ${parsedAgents.length} 个 User Agent。`);
            return parsedAgents;
        }
        console.warn("[代理日志] 环境变量 USER_AGENTS_JSON 不是有效的非空数组，使用默认值。");
    } catch (e) {
        console.error(`[代理日志] 解析环境变量 USER_AGENTS_JSON 出错: ${e.message}。使用默认 User Agent。`);
    }
    return DEFAULT_USER_AGENTS;
})();

// 广告过滤在代理中禁用，由播放器处理
const FILTER_DISCONTINUITY = false;


// --- 辅助函数 ---

function logDebug(message) {
    if (DEBUG_ENABLED) {
        console.log(`[代理日志] ${message}`);
    }
}

// 预编译正则表达式以提高性能
const HTTP_URL_REGEX = /^https?:\/\/.+/i;

/**
 * 从代理请求路径中提取编码后的目标 URL。
 * @param {string} encodedPath - URL 编码后的路径部分 (例如 "https%3A%2F%2F...")
 * @returns {string|null} 解码后的目标 URL，如果无效则返回 null。
 */
function getTargetUrlFromPath(encodedPath) {
    if (!encodedPath) return null;
    
    try {
        const decodedUrl = decodeURIComponent(encodedPath);
        if (HTTP_URL_REGEX.test(decodedUrl)) {
            return decodedUrl;
        }
        // 备选检查：原始路径是否未编码但看起来像 URL？
        if (HTTP_URL_REGEX.test(encodedPath)) {
            logDebug(`警告: 路径未编码但看起来像 URL: ${encodedPath}`);
            return encodedPath;
        }
        return null;
    } catch (e) {
        logDebug(`解码目标 URL 出错: ${encodedPath} - ${e.message}`);
        return null;
    }
}

function getBaseUrl(urlStr) {
    if (!urlStr) return '';
    try {
        const parsedUrl = new URL(urlStr);
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        if (pathSegments.length <= 1) {
            return `${parsedUrl.origin}/`;
        }
        pathSegments.pop();
        return `${parsedUrl.origin}/${pathSegments.join('/')}/`;
    } catch (e) {
        // 备用方法：查找最后一个斜杠
        const lastSlashIndex = urlStr.lastIndexOf('/');
        const protocolIndex = urlStr.indexOf('://');
        if (lastSlashIndex > protocolIndex + 2) {
            return urlStr.substring(0, lastSlashIndex + 1);
        }
        return urlStr + '/';
    }
}

function resolveUrl(baseUrl, relativeUrl) {
    if (!relativeUrl) return '';
    if (HTTP_URL_REGEX.test(relativeUrl)) return relativeUrl;
    if (!baseUrl) return relativeUrl;

    try {
        return new URL(relativeUrl, baseUrl).toString();
    } catch (e) {
        // 简化的备用逻辑
        if (relativeUrl.startsWith('/')) {
            try {
                return new URL(baseUrl).origin + relativeUrl;
            } catch { return relativeUrl; }
        }
        const lastSlash = baseUrl.lastIndexOf('/');
        return lastSlash >= 0 ? baseUrl.substring(0, lastSlash + 1) + relativeUrl : relativeUrl;
    }
}

// ** 已修正：确保生成 /proxy/ 前缀的链接 **
function rewriteUrlToProxy(targetUrl) {
    if (!targetUrl || typeof targetUrl !== 'string') return '';
    // 返回与 vercel.json 的 "source" 和前端 PROXY_URL 一致的路径
    return `/proxy/${encodeURIComponent(targetUrl)}`;
}

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchContentWithType(targetUrl, requestHeaders) {
    const headers = {
        'User-Agent': getRandomUserAgent(),
        'Accept': requestHeaders['accept'] || '*/*',
        'Accept-Language': requestHeaders['accept-language'] || 'zh-CN,zh;q=0.9,en;q=0.8'
    };
    
    // 只在需要时设置 Referer
    try {
        headers['Referer'] = requestHeaders['referer'] || new URL(targetUrl).origin;
    } catch (e) {
        // 忽略 Referer 设置错误
    }

    logDebug(`准备请求目标: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, { headers, redirect: 'follow' });

        if (!response.ok) {
            const err = new Error(`HTTP 错误 ${response.status}: ${response.statusText}. URL: ${targetUrl}`);
            err.status = response.status;
            throw err;
        }

        const content = await response.text();
        const contentType = response.headers.get('content-type') || '';
        logDebug(`请求成功: ${targetUrl}, Content-Type: ${contentType}, 内容长度: ${content.length}`);
        
        return { content, contentType, responseHeaders: response.headers };

    } catch (error) {
        logDebug(`请求异常 ${targetUrl}: ${error.message}`);
        throw new Error(`请求目标 URL 失败 ${targetUrl}: ${error.message}`);
    }
}

function isM3u8Content(content, contentType) {
    if (contentType && (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegurl') || contentType.includes('audio/mpegurl'))) {
        return true;
    }
    return content && typeof content === 'string' && content.trim().startsWith('#EXTM3U');
}

// 预编译正则表达式
const URI_REGEX = /URI="([^"]+)"/;

function processUriLine(line, baseUrl, type) {
    return line.replace(URI_REGEX, (match, uri) => {
        const absoluteUri = resolveUrl(baseUrl, uri);
        logDebug(`处理 ${type} URI: 原始='${uri}', 绝对='${absoluteUri}'`);
        return `URI="${rewriteUrlToProxy(absoluteUri)}"`;
    });
}

function processKeyLine(line, baseUrl) {
    return processUriLine(line, baseUrl, 'KEY');
}

function processMapLine(line, baseUrl) {
    return processUriLine(line, baseUrl, 'MAP');
}

function processMediaPlaylist(url, content) {
    const baseUrl = getBaseUrl(url);
    const lines = content.split('\n');
    const output = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 保留最后一个空行
        if (!line && i === lines.length - 1) {
            output.push(line);
            continue;
        }
        if (!line) continue;
        
        // 处理特殊标签
        if (line.startsWith('#EXT-X-KEY')) {
            output.push(processKeyLine(line, baseUrl));
        } else if (line.startsWith('#EXT-X-MAP')) {
            output.push(processMapLine(line, baseUrl));
        } else if (line.startsWith('#')) {
            // 保留其他 M3U8 标签
            output.push(line);
        } else {
            // 处理 URL 行
            const absoluteUrl = resolveUrl(baseUrl, line);
            logDebug(`重写媒体片段: 原始='${line}', 解析后='${absoluteUrl}'`);
            output.push(rewriteUrlToProxy(absoluteUrl));
        }
    }
    return output.join('\n');
}

async function processM3u8Content(targetUrl, content, recursionDepth = 0) {
    // 判断是主列表还是媒体列表
    if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
        logDebug(`检测到主播放列表: ${targetUrl} (深度: ${recursionDepth})`);
        return await processMasterPlaylist(targetUrl, content, recursionDepth);
    }
    logDebug(`检测到媒体播放列表: ${targetUrl} (深度: ${recursionDepth})`);
    return processMediaPlaylist(targetUrl, content);
}

// 预编译正则表达式
const BANDWIDTH_REGEX = /BANDWIDTH=(\d+)/;
const M3U8_REGEX = /\.m3u8($|\?.*)/i;

async function processMasterPlaylist(url, content, recursionDepth) {
    if (recursionDepth > MAX_RECURSION) {
        throw new Error(`处理主播放列表时，递归深度超过最大限制 (${MAX_RECURSION}): ${url}`);
    }
    
    const baseUrl = getBaseUrl(url);
    const lines = content.split('\n');
    let highestBandwidth = -1;
    let bestVariantUrl = '';

    // 查找最高带宽的流
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            const bandwidthMatch = line.match(BANDWIDTH_REGEX);
            const currentBandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
            
            // 找到下一行的 URI
            for (let j = i + 1; j < lines.length; j++) {
                const uriLine = lines[j].trim();
                if (uriLine && !uriLine.startsWith('#')) {
                    if (currentBandwidth >= highestBandwidth) {
                        highestBandwidth = currentBandwidth;
                        bestVariantUrl = resolveUrl(baseUrl, uriLine);
                    }
                    i = j;
                    break;
                }
            }
        }
    }
    
    // 如果没有找到带宽信息，查找第一个 .m3u8 链接
    if (!bestVariantUrl) {
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#') && M3U8_REGEX.test(trimmedLine)) {
                bestVariantUrl = resolveUrl(baseUrl, trimmedLine);
                logDebug(`备选方案: 找到第一个子播放列表 URI: ${bestVariantUrl}`);
                break;
            }
        }
    }
    
    if (!bestVariantUrl) {
        logDebug(`在主播放列表 ${url} 中未找到有效的子列表 URI，将其作为媒体列表处理。`);
        return processMediaPlaylist(url, content);
    }

    logDebug(`选择的子播放列表 (带宽: ${highestBandwidth}): ${bestVariantUrl}`);
    
    const { content: variantContent, contentType: variantContentType } = await fetchContentWithType(bestVariantUrl, {});

    if (!isM3u8Content(variantContent, variantContentType)) {
        logDebug(`获取的子播放列表 ${bestVariantUrl} 不是 M3U8 (类型: ${variantContentType})，将其作为媒体列表处理。`);
        return processMediaPlaylist(bestVariantUrl, variantContent);
    }

    return await processM3u8Content(bestVariantUrl, variantContent, recursionDepth + 1);
}


// --- Vercel Handler 函数 ---
export default async function handler(req, res) {
    // --- 记录请求开始 ---
    console.info('--- Vercel 代理请求开始 ---');
    console.info('时间:', new Date().toISOString());
    console.info('方法:', req.method);
    console.info('URL:', req.url); // 原始请求 URL (例如 /proxy/...)
    console.info('查询参数:', JSON.stringify(req.query)); // Vercel 解析的查询参数

    // --- 提前设置 CORS 头 ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*'); // 允许所有请求头

    // --- 处理 OPTIONS 预检请求 ---
    if (req.method === 'OPTIONS') {
        console.info("处理 OPTIONS 预检请求");
        res.status(204).setHeader('Access-Control-Max-Age', '86400').end(); // 缓存预检结果 24 小时
        return;
    }

    let targetUrl = null; // 初始化目标 URL

    try { // ---- 开始主处理逻辑的 try 块 ----

        // --- 提取目标 URL ---
        const pathData = req.query["...path"];
        let encodedUrlPath = '';

        if (Array.isArray(pathData)) {
            encodedUrlPath = pathData.join('/');
            console.info(`从 req.query["...path"] (数组) 组合的编码路径: ${encodedUrlPath}`);
        } else if (typeof pathData === 'string') {
            encodedUrlPath = pathData;
            console.info(`从 req.query["...path"] (字符串) 获取的编码路径: ${encodedUrlPath}`);
        } else if (req.url?.startsWith('/proxy/')) {
            encodedUrlPath = req.url.substring(7); // '/proxy/'.length = 7
            console.info(`使用备选方法从 req.url 提取的编码路径: ${encodedUrlPath}`);
        }

        if (!encodedUrlPath) {
            throw new Error("无法从请求中确定编码后的目标路径。");
        }

        // 解析目标 URL
        targetUrl = getTargetUrlFromPath(encodedUrlPath);
        console.info(`解析出的目标 URL: ${targetUrl || 'null'}`); // 记录解析结果

        // 检查目标 URL 是否有效
        if (!targetUrl) {
            // 抛出包含更多上下文的错误
            throw new Error(`无效的代理请求路径。无法从组合路径 "${encodedUrlPath}" 中提取有效的目标 URL。`);
        }

        console.info(`开始处理目标 URL 的代理请求: ${targetUrl}`);

        // --- 获取并处理目标内容 ---
        const { content, contentType, responseHeaders } = await fetchContentWithType(targetUrl, req.headers);

        // --- 如果是 M3U8，处理并返回 ---
        if (isM3u8Content(content, contentType)) {
            console.info(`正在处理 M3U8 内容: ${targetUrl}`);
            const processedM3u8 = await processM3u8Content(targetUrl, content);

            console.info(`成功处理 M3U8: ${targetUrl}`);
            // 发送处理后的 M3U8 响应
            res.status(200)
                .setHeader('Content-Type', 'application/vnd.apple.mpegurl;charset=utf-8')
                .setHeader('Cache-Control', `public, max-age=${CACHE_TTL}`)
                // 移除可能导致问题的原始响应头
                .removeHeader('content-encoding') // 很重要！node-fetch 已解压
                .removeHeader('content-length')   // 长度已改变
                .send(processedM3u8); // 发送 M3U8 文本

        } else {
            // --- 如果不是 M3U8，直接返回原始内容 ---
            console.info(`直接返回非 M3U8 内容: ${targetUrl}, 类型: ${contentType}`);

            // 设置原始响应头，但排除有问题的头
            const excludedHeaders = new Set(['access-control-allow-origin', 'access-control-allow-methods', 
                                           'access-control-allow-headers', 'content-encoding', 'content-length']);
            responseHeaders.forEach((value, key) => {
                if (!excludedHeaders.has(key.toLowerCase())) {
                    res.setHeader(key, value);
                }
            });
            // 设置我们自己的缓存策略
            res.setHeader('Cache-Control', `public, max-age=${CACHE_TTL}`);

            // 发送原始（已解压）内容
            res.status(200).send(content);
        }

    // ---- 结束主处理逻辑的 try 块 ----
    } catch (error) { // ---- 捕获处理过程中的任何错误 ----
        // **检查这个错误是否是 "Assignment to constant variable"**
        console.error(`[代理错误处理 V3] 捕获错误！目标: ${targetUrl || '解析失败'} | 错误类型: ${error.constructor.name} | 错误消息: ${error.message}`);
        console.error(`[代理错误堆栈 V3] ${error.stack}`); // 记录完整的错误堆栈信息

        // 特别标记 "Assignment to constant variable" 错误
        if (error instanceof TypeError && error.message.includes("Assignment to constant variable")) {
             console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
             console.error("捕获到 'Assignment to constant variable' 错误!");
             console.error("请再次检查函数代码及所有辅助函数中，是否有 const 声明的变量被重新赋值。");
             console.error("错误堆栈指向:", error.stack);
             console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        }

        // 尝试从错误对象获取状态码，否则默认为 500
        const statusCode = error.status || 500;

        // 确保在发送错误响应前没有发送过响应头
        if (!res.headersSent) {
             res.setHeader('Content-Type', 'application/json');
             // CORS 头应该已经在前面设置好了
             res.status(statusCode).json({
                success: false,
                error: `代理处理错误: ${error.message}`, // 返回错误消息给前端
                targetUrl: targetUrl // 包含目标 URL 以便调试
            });
        } else {
            // 如果响应头已发送，无法再发送 JSON 错误
            console.error("[代理错误处理 V3] 响应头已发送，无法发送 JSON 错误响应。");
            // 尝试结束响应
             if (!res.writableEnded) {
                 res.end();
             }
        }
    } finally {
         // 记录请求处理结束
         console.info('--- Vercel 代理请求结束 ---');
    }
}