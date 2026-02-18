import { sha256 } from '../js/sha256.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const response = await next();
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/html")) {
    let html = await response.text();

    let password = env.PASSWORD || "";
    let settingsPassword = env.SETTINGS_PASSWORD || "";

    // 增强健壮性：去除可能的首尾空格以及误加的引号
    password = password.trim();
    if ((password.startsWith('"') && password.endsWith('"')) || (password.startsWith("'") && password.endsWith("'"))) {
      password = password.substring(1, password.length - 1);
    }
    settingsPassword = settingsPassword.trim();
    if ((settingsPassword.startsWith('"') && settingsPassword.endsWith('"')) || (settingsPassword.startsWith("'") && settingsPassword.endsWith("'"))) {
      settingsPassword = settingsPassword.substring(1, settingsPassword.length - 1);
    }

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