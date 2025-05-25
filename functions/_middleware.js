import { sha256 } from './sha256.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const response = await next();
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    let html = await response.text();
    const password = env.PASSWORD || "";
    let passwordHash = "";
    if (password) {
      passwordHash = await sha256(password);
    }
    // 最佳实践：用正则宽松匹配替换
    html = html.replace(
      /window\.__ENV__\.PASSWORD\s*=\s*["']\{\{PASSWORD\}\}["'];?/,
      `window.__ENV__.PASSWORD = "${passwordHash}"; // SHA-256 hash`
    );
    // 可选调试输出: 将 hash 或密码是否注入打印到页面底部
    // html += `<div style="display:none">DEBUG-PASSWORD-HASH: ${passwordHash}</div>`;
    return new Response(html, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
  return response;
}
