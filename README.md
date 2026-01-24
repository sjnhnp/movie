[README content generated from README_legacy.md but adapted for Astro structure]

# X - 纯粹的在线播放器 (Astro 重构版)

> * **采用的播放器**: [**Vidstack Player**](https://github.com/vidstack/player)
> * **技术栈**: Astro + Tailwind CSS + Node.js (SSR)

## 🚀 特色功能

(功能与原版保持一致，包括无感排序、缓存、历史记录、设置面板等)

### 后端/架构 (Backend/Architecture)

*   **Astro SSR**: 采用服务端渲染，提供更快的首屏加载速度。
*   **内置代理**: 移植了原版的代理逻辑到 `src/pages/proxy`，无需额外部署后端。
*   **密码保护**: 
    * 支持 `PASSWORD` 环境变量设置全站密码。
    * 支持 `SETTINGS_PASSWORD` 环境变量设置设置面板密码。

## 部署指南 (Deployment)

本项目支持一键部署到多个平台。

### Cloudflare Pages (推荐)

1.  **Fork 本仓库** 到您的 GitHub。
2.  登录 Cloudflare Dashboard，进入 **Workers & Pages** -> **Create Application** -> **Pages** -> **Connect to Git**。
3.  选择您的仓库，配置如下：
    *   **Production branch**: `astro-migration` (或合并后的 `main`)
    *   **Framework preset**: `Astro`
    *   **Build command**: `npm run build:cf`
    *   **Output directory**: `dist`
4.  **环境变量设置** (Environment Variables):
    *   进入 **Settings** -> **Environment variables**，添加：
        *   `NODE_VERSION`: `20` (建议显式指定)
        *   `PASSWORD`: (可选) 全站访问密码
        *   `SETTINGS_PASSWORD`: (可选) 设置面板访问密码

### Vercel / Netlify

*   **Vercel**: Build Command: `npm run build:vercel`, Output Directory: `dist`
*   **Netlify**: Build Command: `npm run build:netlify`, Output Directory: `dist`

### Docker

```bash
docker run -d \
  -p 8080:8080 \
  -e PASSWORD="your-secret-password" \
  -e SETTINGS_PASSWORD="your-settings-password" \
  --restart unless-stopped \
  --name movie \
  ghcr.io/your-username/movie:astro
```

## 配置修改

虽然主要逻辑迁移到了 Astro，仍可以通过修改 `public/js/config.js` 等文件进行前端配置：

*   **`public/js/config.js`**: 设置默认 API、广告过滤默认值等。
*   **`public/js/douban.js`**: 豆瓣推荐开关。

## 许可证 (License)

本项目遵循与[**Libretv**](https://github.com/LibreSpark/LibreTV)项目相同的许可证。
