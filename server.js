import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';

// sha256 函数保持不变
async function sha256(str) {
    return createHash('sha256').update(str).digest('hex');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// -- 中间件：向HTML注入环境变量 -- (函数保持不变)
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

// -- API 代理处理器 -- (保持不变)
app.get('/proxy/*', async (req, res) => {
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


// --- 核心修改：调整路由和静态文件服务顺序 ---

// 1. 先提供静态文件服务 (JS, CSS, images, etc.)
//    注意：我们通过 index: false 来阻止 express.static 自动服务 index.html
app.use(express.static(path.join(__dirname, '/'), {
    index: false
}));

// 2. 对于所有其他GET请求，都视为SPA路由，返回注入了环境变量的 index.html
//    这会捕获 /、/player.html 以及任何不存在的路径
app.get('*', async (req, res) => {
    try {
        // 根据请求路径判断是返回 index.html 还是 player.html
        const page = req.path.includes('player.html') ? 'player.html' : 'index.html';
        const indexPath = path.join(__dirname, page);
        const html = await fs.readFile(indexPath, 'utf-8');
        const modifiedHtml = await injectEnvVars(html);
        res.send(modifiedHtml);
    } catch (error) {
        console.error("Error serving HTML:", error);
        res.status(404).send('Not Found');
    }
});


app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});