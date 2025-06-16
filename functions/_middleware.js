import { sha256 } from '../js/sha256.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const response = await next();
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/html")) {
    let html = await response.text();

    const password = env.PASSWORD || "";
    const settingsPassword = env.SETTINGS_PASSWORD || ""; // 新增：读取设置密码

    let passwordHash = "";
    let settingsPasswordHash = ""; // 新增：设置密码的哈希

    if (password) {
      passwordHash = await sha256(password);
    }
    if (settingsPassword) { // 新增
      settingsPasswordHash = await sha256(settingsPassword); // 新增
    }

    // 注入主密码哈希
    html = html.replace(
      /window\.__ENV__\.PASSWORD\s*=\s*["']\{\{PASSWORD\}\}["'];?/,
      `window.__ENV__.PASSWORD = "${passwordHash}";`
    );

    // 新增：注入设置密码哈希
    html = html.replace(
      /window\.__ENV__\.SETTINGS_PASSWORD\s*=\s*["']\{\{SETTINGS_PASSWORD\}\}["'];?/,
      `window.__ENV__.SETTINGS_PASSWORD = "${settingsPasswordHash}";`
    );

    return new Response(html, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  return response;
}