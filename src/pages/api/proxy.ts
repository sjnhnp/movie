import type { APIRoute } from 'astro';

const DEBUG_ENABLED = import.meta.env.DEBUG === 'true';
const CACHE_TTL = parseInt(import.meta.env.CACHE_TTL || '86400', 10);
const MAX_RECURSION = parseInt(import.meta.env.MAX_RECURSION || '5', 10);

let USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
];

function logDebug(message: string) {
    if (DEBUG_ENABLED) {
        console.log(`[Proxy Log] ${message}`);
    }
}

function getBaseUrl(urlStr: string): string {
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
        const lastSlashIndex = urlStr.lastIndexOf('/');
        if (lastSlashIndex > urlStr.indexOf('://') + 2) {
            return urlStr.substring(0, lastSlashIndex + 1);
        }
        return urlStr + '/';
    }
}

function resolveUrl(baseUrl: string, relativeUrl: string): string {
    if (!relativeUrl) return '';
    if (relativeUrl.match(/^https?:\/\/.+/i)) return relativeUrl;
    if (!baseUrl) return relativeUrl;

    try {
        return new URL(relativeUrl, baseUrl).toString();
    } catch (e) {
        if (relativeUrl.startsWith('/')) {
            try {
                const baseOrigin = new URL(baseUrl).origin;
                return `${baseOrigin}${relativeUrl}`;
            } catch { return relativeUrl; }
        } else {
            return `${baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1)}${relativeUrl}`;
        }
    }
}

function rewriteUrlToProxy(targetUrl: string): string {
    if (!targetUrl || typeof targetUrl !== 'string') return '';
    return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
}

function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchContentWithType(targetUrl: string, requestHeaders: Headers) {
    const headers: Record<string, string> = {
        'User-Agent': getRandomUserAgent(),
        'Accept': requestHeaders.get('accept') || '*/*',
        'Accept-Language': requestHeaders.get('accept-language') || 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    const referer = requestHeaders.get('referer');
    if (referer) {
        headers['Referer'] = referer;
    } else {
        try {
            headers['Referer'] = new URL(targetUrl).origin;
        } catch { }
    }

    logDebug(`Fetching: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, { headers, redirect: 'follow' });
        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            const err = new Error(`HTTP Error ${response.status}: ${response.statusText}. URL: ${targetUrl}. Body: ${errorBody.substring(0, 200)}`) as any;
            err.status = response.status;
            throw err;
        }

        const content = await response.text();
        const contentType = response.headers.get('content-type') || '';
        return { content, contentType, responseHeaders: response.headers };
    } catch (error) {
        throw new Error(`Fetch failed for ${targetUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function isM3u8Content(content: string, contentType: string): boolean {
    if (contentType && (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegurl') || contentType.includes('audio/mpegurl'))) {
        return true;
    }
    return !!(content && typeof content === 'string' && content.trim().startsWith('#EXTM3U'));
}

function processKeyLine(line: string, baseUrl: string): string {
    return line.replace(/URI="([^"]+)"/, (match, uri) => {
        const absoluteUri = resolveUrl(baseUrl, uri);
        return `URI="${rewriteUrlToProxy(absoluteUri)}"`;
    });
}

function processMapLine(line: string, baseUrl: string): string {
    return line.replace(/URI="([^"]+)"/, (match, uri) => {
        const absoluteUri = resolveUrl(baseUrl, uri);
        return `URI="${rewriteUrlToProxy(absoluteUri)}"`;
    });
}

function processMediaPlaylist(url: string, content: string): string {
    const baseUrl = getBaseUrl(url);
    const lines = content.split('\n');
    const output: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line && i === lines.length - 1) { output.push(line); continue; }
        if (!line) continue;
        if (line.startsWith('#EXT-X-KEY')) { output.push(processKeyLine(line, baseUrl)); continue; }
        if (line.startsWith('#EXT-X-MAP')) { output.push(processMapLine(line, baseUrl)); continue; }
        if (line.startsWith('#EXTINF')) { output.push(line); continue; }
        if (!line.startsWith('#')) {
            const absoluteUrl = resolveUrl(baseUrl, line);
            output.push(rewriteUrlToProxy(absoluteUrl)); continue;
        }
        output.push(line);
    }
    return output.join('\n');
}

async function processM3u8Content(targetUrl: string, content: string, recursionDepth = 0): Promise<string> {
    if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
        return await processMasterPlaylist(targetUrl, content, recursionDepth);
    }
    return processMediaPlaylist(targetUrl, content);
}

async function processMasterPlaylist(url: string, content: string, recursionDepth: number): Promise<string> {
    if (recursionDepth > MAX_RECURSION) {
        throw new Error(`Max recursion depth reached (${MAX_RECURSION}) for: ${url}`);
    }
    const baseUrl = getBaseUrl(url);
    const lines = content.split('\n');
    let highestBandwidth = -1;
    let bestVariantUrl = '';

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);
            const currentBandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
            let variantUriLine = '';
            for (let j = i + 1; j < lines.length; j++) {
                const line = lines[j].trim();
                if (line && !line.startsWith('#')) { variantUriLine = line; i = j; break; }
            }
            if (variantUriLine && currentBandwidth >= highestBandwidth) {
                highestBandwidth = currentBandwidth;
                bestVariantUrl = resolveUrl(baseUrl, variantUriLine);
            }
        }
    }
    if (!bestVariantUrl) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('#') && line.match(/\.m3u8($|\?.*)/i)) {
                bestVariantUrl = resolveUrl(baseUrl, line);
                break;
            }
        }
    }
    if (!bestVariantUrl) {
        return processMediaPlaylist(url, content);
    }

    const { content: variantContent, contentType: variantContentType } = await fetchContentWithType(bestVariantUrl, new Headers());

    if (!isM3u8Content(variantContent, variantContentType)) {
        return processMediaPlaylist(bestVariantUrl, variantContent);
    }

    return await processM3u8Content(bestVariantUrl, variantContent, recursionDepth + 1);
}

export const GET: APIRoute = async ({ request, url }) => {
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response('Target URL is required.', { status: 400 });
    }

    try {
        const { content, contentType, responseHeaders } = await fetchContentWithType(targetUrl, request.headers);

        const returnHeaders = new Headers();
        returnHeaders.set('Access-Control-Allow-Origin', '*');
        returnHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        returnHeaders.set('Access-Control-Allow-Headers', '*');
        returnHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);

        if (isM3u8Content(content, contentType)) {
            const processedM3u8 = await processM3u8Content(targetUrl, content);
            returnHeaders.set('Content-Type', 'application/vnd.apple.mpegurl;charset=utf-8');
            return new Response(processedM3u8, { status: 200, headers: returnHeaders });
        } else {
            responseHeaders.forEach((value, key) => {
                const lowerKey = key.toLowerCase();
                if (!lowerKey.startsWith('access-control-') &&
                    lowerKey !== 'content-encoding' &&
                    lowerKey !== 'content-length') {
                    returnHeaders.set(key, value);
                }
            });
            returnHeaders.set('Content-Type', contentType || 'application/octet-stream');
            return new Response(content, { status: 200, headers: returnHeaders });
        }

    } catch (error) {
        console.error(`Proxy error for ${targetUrl}:`, error);
        return new Response(JSON.stringify({
            success: false,
            error: `Proxy error: ${error instanceof Error ? error.message : String(error)}`,
            targetUrl
        }), {
            status: (error as any).status || 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
        });
    }
};

export const OPTIONS: APIRoute = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Max-Age': '86400'
        }
    });
};
