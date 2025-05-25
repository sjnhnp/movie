// functions/proxy/[[path]].js
// -----------------------------------------------------------------------------
//     • 智能缓存 & M3U8 重写
// -----------------------------------------------------------------------------

import { kvHelper } from "../utils/kv-helper.js";

// -----------------------------------------------------------------------------
//  常量与正则
// -----------------------------------------------------------------------------
const RE_URI = /URI\s*=\s*"([^"]+)"/g;
const RE_OTHER_URI = /\b([A-Z0-9_-]*?URI)\s*=\s*"([^"]+)"/gi;

const DEFAULT_CACHE_TTL = 86400; // 24 h
const DEFAULT_MAX_RECURSION = 5;
const DEFAULT_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
];
const DEFAULT_LARGE_MAX_MB = 32; // 超过此阈值即视为“大文件”

const KV_RAW_PREFIX = "proxy_raw:";
const KV_M3U8_PROCESSED_PREFIX = "m3u8_processed:";

const M3U8_CONTENT_TYPES = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
];

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};
const OPTIONS_HEADERS = { ...COMMON_HEADERS, "Access-Control-Max-Age": "86400" };

// -----------------------------------------------------------------------------
//  工具函数
// -----------------------------------------------------------------------------
export const parseNumberEnv = (env, key, def = 0) => {
  const raw = env[key];
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  return Number.isNaN(n) || n < 0 ? def : n;
};

export const parseJsonArrayEnv = (env, key, def = []) => {
  const raw = env[key];
  if (typeof raw !== "string" || !raw.trim()) return def;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : def;
  } catch {
    return def;
  }
};

// 取 URL 目录部分
const getBaseUrl = (urlStr) => {
  try {
    const url = new URL(urlStr);
    if (!url.pathname || url.pathname === "/") return `${url.origin}/`;
    const parts = url.pathname.split("/");
    parts.pop();
    return `${url.origin}${parts.join("/")}/`;
  } catch {
    const protoEnd = urlStr.indexOf("://");
    if (protoEnd === -1) return urlStr;
    const lastSlash = urlStr.lastIndexOf("/");
    return lastSlash > protoEnd + 2
      ? urlStr.slice(0, lastSlash + 1)
      : urlStr.endsWith("/")
        ? urlStr
        : `${urlStr}/`;
  }
};

const isM3u8Content = (content, contentType) =>
  (contentType &&
    M3U8_CONTENT_TYPES.some((ct) => contentType.toLowerCase().includes(ct))) ||
  (typeof content === "string" && content.trimStart().startsWith("#EXTM3U"));

const logDebug = (debugEnabled, msg) => {
  if (debugEnabled) console.log(`[Proxy] ${msg}`);
};

const resolveUrl = (baseUrl, relativeUrl, cache, logFn) => {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  const key = `${baseUrl}|${relativeUrl}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const abs = new URL(relativeUrl, baseUrl).toString();
    cache.set(key, abs);
    return abs;
  } catch (e) {
    logFn(`URL resolve failed (${relativeUrl}): ${e.message}`);
    return relativeUrl;
  }
};

const rewriteUrlToProxy = (url) =>
  `/proxy/${encodeURIComponent(url)}`;

const safeJsonParse = (str, def = null, logFn) => {
  if (typeof str !== "string") return def;
  try {
    return JSON.parse(str);
  } catch (e) {
    logFn?.(`JSON parse error: ${e.message}`);
    return def;
  }
};

// -- Base64 辅助 ---------------------------------------------------------------
const abToBase64 = (ab) => {
  const u8 = new Uint8Array(ab);
  const CHUNK = 0x8000;
  const parts = [];
  for (let i = 0; i < u8.length; i += CHUNK) {
    parts.push(String.fromCharCode(...u8.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(""));
};

const base64ToAb = (b64) => {
  const CHUNK = 0x8000;
  let pos = 0;
  const len = b64.length;
  const bytes = new Uint8Array((len >> 2) * 3 + 3);
  let offset = 0;
  while (pos < len) {
    const slice = b64.slice(pos, pos + CHUNK);
    const bin = atob(slice);
    for (let i = 0; i < bin.length; i++) bytes[offset++] = bin.charCodeAt(i);
    pos += CHUNK;
  }
  return bytes.subarray(0, offset).buffer;
};

// -----------------------------------------------------------------------------
//  响应包装
// -----------------------------------------------------------------------------
const createResponse = (request, body, status = 200, headers = {}) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: OPTIONS_HEADERS });
  return new Response(body, { status, headers: { ...COMMON_HEADERS, ...headers } });
};

const createM3u8Response = (request, body, ttl) =>
  createResponse(request, body, 200, {
    "Content-Type": "application/vnd.apple.mpegurl",
    "Cache-Control": `public, max-age=${ttl}`,
  });

// ——细抠 #6：同时写 Surrogate-Control + CDN-Cache-Control-----------------------
const stripHopByHopHeaders = (headers) =>
  [
    "set-cookie",
    "cookie",
    "authorization",
    "www-authenticate",
    "proxy-authenticate",
    "server",
    "x-powered-by",
  ].forEach((h) => headers.delete(h));

const createOtherResponse = (request, body, status, originHeaders, ttl) => {
  const h = new Headers(originHeaders);
  stripHopByHopHeaders(h);
  const browserTtl = Math.max(1, Math.floor(ttl / 4));
  h.set("Cache-Control", `public, max-age=${browserTtl}`);
  h.set("Surrogate-Control", `public, max-age=${ttl}`);
  h.set("CDN-Cache-Control", `public, max-age=${ttl}`);
  return createResponse(request, body, status, h);
};

// -----------------------------------------------------------------------------
//  网络抓取
// -----------------------------------------------------------------------------
const createFetchHeaders = (req, targetUrl, agents) => {
  const h = new Headers();
  h.set("User-Agent", agents[Math.floor(Math.random() * agents.length)]);
  h.set(
    "Accept",
    "application/x-mpegurl, video/*;q=0.75, image/*;q=0.6, application/json;q=0.6, */*;q=0.5",
  );
  const al = req.headers.get("Accept-Language");
  if (al) h.set("Accept-Language", al);
  try {
    h.set("Referer", new URL(targetUrl).origin);
  } catch {
    const ref = req.headers.get("Referer");
    if (ref) h.set("Referer", ref);
  }
  return h;
};

// --①：无 Content-Length 时流式阈值探测 + 安全返回 ArrayBuffer ------------- ★
const decideStreamOrBuffer = async (resp, isText, threshold, logFn) => {
  const reader = resp.body.getReader();
  let total = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (!isText && total > threshold) {
      logFn("switch → stream (size exceeded)");
      const tailStream = new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          const pump = () =>
            reader
              .read()
              .then(({ value, done }) => {
                if (done) {
                  controller.close();
                  return;
                }
                controller.enqueue(value);
                return pump();
              })
              .catch((e) => controller.error(e)); // 细抠 #2：捕获上游异常 ★
          pump();
        },
      });
      return { content: tailStream, isStream: true };
    }
  }

  // 未超阈值：合并缓冲并拷贝 ArrayBuffer，彻底与原 Uint8Array 解耦 ——细抠 #1
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  const arrBuf = buf.slice().buffer; // ★
  return { content: isText ? new TextDecoder().decode(buf) : arrBuf, isStream: false };
};

/**
 * 抓取任意资源。
 * @returns {{content:string|ArrayBuffer|ReadableStream, contentType:string,
 * responseHeaders:Headers, isStream:boolean}}
 */
const fetchContentWithType = async (targetUrl, originalRequest, cfg, logFn) => {
  const headers = createFetchHeaders(originalRequest, targetUrl, cfg.USER_AGENTS);
  logFn(`Workspace → ${targetUrl}`);

  let resp;
  try {
    resp = await fetch(targetUrl, { headers, redirect: "follow" });
  } catch (e) {
    throw new Error(`Network error fetching ${targetUrl}: ${e.message}`);
  }
  if (!resp.ok) {
    const msg = (await resp.text().catch(() => "<unreadable>")).slice(0, 80);
    throw new Error(`HTTP ${resp.status}: ${msg}`);
  }

  const contentType = resp.headers.get("Content-Type") || "";
  const isText =
    /^text\//i.test(contentType) ||
    M3U8_CONTENT_TYPES.some((t) => contentType.toLowerCase().includes(t));

  const contentLength = Number(resp.headers.get("Content-Length") || 0);

  if (!isText && contentLength > cfg.LARGE_MAX_BYTES) {
    return { content: resp.body, contentType, responseHeaders: resp.headers, isStream: true };
  }

  if (!isText && contentLength === 0) {
    const { content, isStream } = await decideStreamOrBuffer(
      resp,
      isText,
      cfg.LARGE_MAX_BYTES,
      logFn,
    );
    return { content, contentType, responseHeaders: resp.headers, isStream };
  }

  const buf = await resp.arrayBuffer();
  const content = isText ? new TextDecoder().decode(buf) : buf;
  return { content, contentType, responseHeaders: resp.headers, isStream: false };
};

// -----------------------------------------------------------------------------
//  M3U8 处理
// -----------------------------------------------------------------------------
const processUriLine = (line, baseUrl, cache, logFn) => {
  let out = line.replace(RE_URI, (_, uri) => {
    const abs = resolveUrl(baseUrl, uri, cache, logFn);
    return `URI="${rewriteUrlToProxy(abs)}"`;
  });
  out = out.replace(RE_OTHER_URI, (match, attr, uri) => {
    if (!uri.includes("://")) return match;
    const abs = resolveUrl(baseUrl, uri, cache, logFn);
    return `${attr}="${rewriteUrlToProxy(abs)}"`;
  });
  return out;
};

// -------- 媒体播放列表 ---------------------------------------------------------
const processMediaPlaylist = (targetUrl, content, cache, logFn) => {
  const base = getBaseUrl(targetUrl);
  const newline = /\r\n/.test(content) ? "\r\n" : "\n";
  const finalLines = content
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return "";
      if (t.startsWith("#EXT-X-KEY") || t.startsWith("#EXT-X-MAP"))
        return processUriLine(t, base, cache, logFn);
      if (t.startsWith("#")) return t;
      const abs = resolveUrl(base, t, cache, logFn);
      return rewriteUrlToProxy(abs);
    });

  return finalLines.join(newline);
};

// -------- Master 播放列表 ------------------------------------------------------
const findFirstVariantUrl = (content, baseUrl, cache, logFn) => {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("#EXT-X-MEDIA")) {
      const m = l.match(/URI\s*=\s*"([^"]+)"/);
      if (m) {
        const abs = resolveUrl(baseUrl, m[1], cache, logFn);
        logFn(`Variant (MEDIA) → ${abs}`);
        return abs;
      }
    }
    if (l.startsWith("#EXT-X-STREAM-INF")) {
      for (let j = i + 1; j < lines.length; j++) {
        const cand = lines[j].trim();
        if (!cand || cand.startsWith("#")) continue;
        const abs = resolveUrl(baseUrl, cand, cache, logFn);
        logFn(`Variant (STREAM-INF) → ${abs}`);
        return abs;
      }
    }
  }
  return "";
};

const processMasterPlaylist = async (
  targetUrl,
  content,
  depth,
  ctx,
  cfg,
  cache,
  logFn,
  kv,
) => {
  if (depth > cfg.MAX_RECURSION) throw new Error("Max recursion depth reached");

  const variantUrl = findFirstVariantUrl(content, getBaseUrl(targetUrl), cache, logFn);
  if (!variantUrl) {
    logFn("No variant found – fallback to media playlist");
    return processMediaPlaylist(targetUrl, content, cache, logFn);
  }

  const cacheKey = `${KV_M3U8_PROCESSED_PREFIX}${variantUrl}`;
  const processedHit = kv ? await kv.get(cacheKey) : null;
  if (processedHit) {
    logFn("[KV hit – processed M3U8]");
    return processedHit;
  }

  const { content: varContent, contentType } = await fetchContentWithType(
    variantUrl,
    ctx.request,
    cfg,
    logFn,
  );

  const processed = await processM3u8Recursive(
    variantUrl,
    varContent,
    contentType,
    depth + 1,
    ctx,
    cfg,
    cache,
    logFn,
    kv,
  );

  if (kv) {
    kv.put(cacheKey, processed, { expirationTtl: cfg.CACHE_TTL }).catch((e) => logFn(`KV put err: ${e.message}`));
  }
  return processed;
};

const processM3u8Recursive = async (
  targetUrl,
  content,
  contentType,
  depth,
  ctx,
  cfg,
  cache,
  logFn,
  kv,
) => {
  const isMaster =
    content.includes("#EXT-X-STREAM-INF") || content.includes("#EXT-X-MEDIA:");
  return isMaster
    ? processMasterPlaylist(targetUrl, content, depth, ctx, cfg, cache, logFn, kv)
    : processMediaPlaylist(targetUrl, content, cache, logFn);
};

// -----------------------------------------------------------------------------
//  主处理函数
// -----------------------------------------------------------------------------
export const onRequest = async (ctx) => {
  const { request, env } = ctx;
  const DEBUG = env.DEBUG === "true";
  const log = (m) => logDebug(DEBUG, m);

  const cfg = {
    CACHE_TTL: parseNumberEnv(env, "CACHE_TTL", DEFAULT_CACHE_TTL),
    MAX_RECURSION: parseNumberEnv(env, "MAX_RECURSION", DEFAULT_MAX_RECURSION),
    USER_AGENTS: parseJsonArrayEnv(env, "USER_AGENTS_JSON", DEFAULT_USER_AGENTS),
    LARGE_MAX_BYTES:
      parseNumberEnv(env, "LARGE_MAX_MB", DEFAULT_LARGE_MAX_MB) * 1024 * 1024,
  };

  // 提取目标 URL
  const urlObj = new URL(request.url);
  const { pathname } = urlObj;
  const encoded = pathname.slice(7); // 去掉 "/proxy/"
  let targetUrl;
  try {
    targetUrl = decodeURIComponent(encoded);
  } catch {
    targetUrl = encoded;
  }
  if (!/^https?:\/\//i.test(targetUrl))
    return createResponse(request, "Bad Request: invalid target URL", 400);
  log(`Target → ${targetUrl}`);

  // KV 辅助
  const kv = env.LIBRETV_PROXY_KV ? kvHelper(env.LIBRETV_PROXY_KV, cfg.CACHE_TTL, log) : null;

  // RAW 缓存
  const rawKey = `${KV_RAW_PREFIX}${targetUrl}`;
  const rawVal = kv ? await kv.get(rawKey) : null;
  const rawCacheObj = rawVal ? safeJsonParse(rawVal, null, log) : null;

  let body,
    contentType,
    originHeaders;

  if (rawCacheObj) {
    log("[KV hit – raw]");
    body = rawCacheObj.isBase64 ? base64ToAb(rawCacheObj.body) : rawCacheObj.body;
    originHeaders = new Headers(Object.entries(rawCacheObj.headers));
    contentType = originHeaders.get("content-type") || "";
  } else {
    const fetched = await fetchContentWithType(targetUrl, request, cfg, log);
    body = fetched.content;
    contentType = fetched.contentType;
    originHeaders = fetched.responseHeaders;

    // 仅缓存“非流式”结果
    if (kv && !fetched.isStream) {
      const rawBody = typeof body === "string" ? body : abToBase64(body);
      kv
        .put(
          rawKey,
          JSON.stringify({
            body: rawBody,
            isBase64: typeof body !== "string",
            headers: Object.fromEntries([...originHeaders].map(([k, v]) => [k.toLowerCase(), v])),
          }),
          { expirationTtl: cfg.CACHE_TTL },
        )
        .catch((e) => log(`KV put err: ${e.message}`));
    }
  }

  // M3U8 智能处理
  if (isM3u8Content(body, contentType)) {
    log("M3U8 detected → processing");
    if (typeof body !== "string") body = new TextDecoder().decode(body);
    const cache = new Map();
    const processed = await processM3u8Recursive(
      targetUrl,
      body,
      contentType,
      0,
      ctx,
      cfg,
      cache,
      log,
      kv,
    );
    return createM3u8Response(request, processed, cfg.CACHE_TTL);
  }

  // 其它资源直传
  return createOtherResponse(request, body, 200, originHeaders, cfg.CACHE_TTL);
};

// -----------------------------------------------------------------------------
//  CORS 预检
// -----------------------------------------------------------------------------
export const onOptions = () => new Response(null, { status: 204, headers: OPTIONS_HEADERS });
