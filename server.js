// 使用 ESM import 语法，与项目保持一致

import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { createHash } from 'crypto'; // 使用 Node.js 内置 crypto

// 模拟浏览器环境的 sha256 函数
async function sha256(str) {
    return createHash('sha256').update(str).digest('hex');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// -- 中间件：向HTML注入环境变量 --
async function injectEnvVars(html) {
    const password = process.env.PASSWORD || "";
    const settingsPassword = process.env.SETTINGS_PASSWORD || "";

    let passwordHash = "";
    let settingsPasswordHash = "";

    if (password) {
        passwordHash = await sha256(password);
    }
    if (settingsPassword) {
        settingsPasswordHash = await sha256(settingsPassword);
    }

    html = html.replace(
        /window\.__ENV__\.PASSWORD\s*=\s*["']\{\{PASSWORD\}\}["'];?/g,
        `window.__ENV__.PASSWORD = "${passwordHash}";`
    );

    html = html.replace(
        /window\.__ENV__\.SETTINGS_PASSWORD\s*=\s*["']\{\{SETTINGS_PASSWORD\}\}["'];?/g,
        `window.__ENV__.SETTINGS_PASSWORD = "${settingsPasswordHash}";`
    );

    return html;
}

// -- API 代理处理器 --
app.get('/proxy/*', async (req, res) => {
    // Vercel/CF的代理路径是 /proxy/https://... , Express 会解析成 /proxy/https:/...
    // 我们需要从 req.url 中重新获取完整的编码后 URL
    const encodedTargetUrl = req.url.replace('/proxy/', '');
    if (!encodedTargetUrl) {
        return res.status(400).send('Target URL is required.');
    }

    const targetUrl = decodeURIComponent(encodedTargetUrl);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': req.headers['referer'] || new URL(targetUrl).origin,
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error fetching ${targetUrl}: ${response.status} ${response.statusText}`, errorText);
            return res.status(response.status).send(`Failed to fetch from target: ${response.statusText}`);
        }
        
        response.headers.forEach((value, name) => {
            if (!['content-encoding', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) {
                res.setHeader(name, value);
            }
        });

        response.body.pipe(res);

    } catch (error) {
        console.error(`Proxy error for ${targetUrl}:`, error);
        res.status(500).send(`Proxy error: ${error.message}`);
    }
});

// -- 提供静态文件服务，并为HTML注入环境变量 --
app.use(express.static(path.join(__dirname, '/')));

app.get('*.html', async (req, res, next) => {
    const filePath = path.join(__dirname, req.path);
    try {
        const html = await fs.readFile(filePath, 'utf-8');
        const modifiedHtml = await injectEnvVars(html);
        res.send(modifiedHtml);
    } catch (error) {
        // 如果文件不存在，则交由下一个处理器处理（即下面的 * 处理器）
        next();
    }
});

// 对于所有其他GET请求，都返回注入了环境变量的 index.html
// 这对于单页面应用（SPA）的路由是必要的
app.get('*', async (req, res) => {
    try {
        const indexPath = path.join(__dirname, 'index.html');
        const html = await fs.readFile(indexPath, 'utf-8');
        const modifiedHtml = await injectEnvVars(html);
        res.send(modifiedHtml);
    } catch (error) {
        res.status(404).send('Not Found');
    }
});

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});