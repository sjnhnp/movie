// /functions/sha256.js
// 兼容 Cloudflare Workers/Pages Functions 的 SHA-256 工具
export async function sha256(str) {
    // 边缘环境原生提供 TextEncoder/crypto.subtle
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
