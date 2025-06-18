这是一个基于 [**LibreSpark/LibreTV**](https://github.com/LibreSpark/LibreTV) 的深度优化分支，在保留其核心功能的基础上，进行了大量代码重构，并增加了多项提升用户体验的实用功能。

## 🚀 主要特性与上游差异

### 首页 (Homepage)

- **⚙️ 设置项**：新增：“预加载集数”功能+开关，优化性能与流量控制。
- **📺 M3U直播**：集成 M3U 电视直播播放器入口 ([项目地址](https://github.com/sjnhnp/m3u-player))。
- **🏡 集数弹窗播放进度**：“继续观看”弹窗同样支持按**单集进度**恢复播放。
- **🔍 豆瓣热门历史处理**：由“豆瓣热门”推荐产生的搜索结果将不再计入个人搜索历史。
- **📖 观看历史保存类别**：观看历史会独立`保存每一集的记录`，而非仅记录到整部剧。

### 播放页 (Player Page)

- **▶️ 播放器**：核心沿用稳定性高的 DPlayer。
- **🧠 记住进度**：独立于“观看历史”的**每一集**播放进度记忆。
- **🛠️ 兼容性修复**：解决部分浏览器切换集数后无法自动播放的问题。
- **⌨️ 全局快捷键**：在播放页任意位置均可使用快捷键控制播放。
- **⏩ 跳过片头/片尾**：支持自定义跳过时长（秒）。
- **🔒 锁屏优化**：锁屏状态下，依然可以通过右上角按钮或 `F` 键进入全屏。
- **↩️ 返回优化**：点击“返回”按钮可立即回到之前的搜索结果页，操作更直观。
- **✨ UI优化**：当视频仅有单集时，`自动隐藏集数列表区域`。
- **🔀 无缝换线**：切换不同线路时，能`保持当前播放进度`，实现无缝切换。
- **📱 安卓端触摸优化**：实现Android移动端中央播放/暂停按钮+播放控制条`自动隐藏`
    | 操作 | 触摸位置 | 触发行为 |
    | :--- | :--- | :--- |
    | **单击/长按** | 播放器区域 | 显示中央暂停/播放按钮与控制条 |
    | **长按** | 播放器右侧区域 | 快进2x，松手后1x |
    | **双击** | 播放器区域 | 暂停/播放 |
    | **锁屏状态下，需要系统返回手势** |  | 退出全屏 |

### 🔧 代码
- 大量代码经过重构，提升可维护性和性能。

## 部署指南 (Deployment)

本项目可一键部署于 Cloudflare Pages 或 Vercel。基础部署流程请参考 [**上游项目文档**](https://github.com/LibreSpark/LibreTV)。

### cloudflare pages / vercel 环境变量

#### 1. KV Namespace Binding
- **变量名称 (Variable name):** `LIBRETV_PROXY_KV`
- **KV 命名空间 (KV namespace):** 选择您创建的KV

#### 2. Variables and Secrets
- **变量名称 (Variable name):** `PASSWORD`
- **密钥值 (text):** 网站密码保护

#### 3. Variables and Secrets
- **变量名称 (Variable name):** `SETTINGS_PASSWORD`
- **密钥值 (text):** 首页设置按钮密码保护

### 配置修改 
```
1、file：js/config.js

// 预加载集数开关
const DEFAULTS = { 
    enablePreloading: true, // 预加载 
    preloadCount: 2,       // 预加载集数 
    debugMode: false      // 调试模式 
};

//默认数据源
const DEFAULT_SELECTED_APIS = 

//去广告开关
filterAds: false, // 是否启用广告过滤，默认关闭
adFilteringEnabled: getBoolConfig('adFilteringEnabled', false), //默认关闭

2、file：douban.js

//豆瓣热门默认开启关闭，若需要默认开启，修改两个false为true。
  const isEnabled = utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, false) === true;
  doubanToggle.checked = isEnabled;

  // 如果是首次加载且 localStorage 中没有设置过，则强制写入 true
  if (localStorage.getItem(CONFIG.STORAGE_KEYS.ENABLED) === null) {
    utils.storage.set(CONFIG.STORAGE_KEYS.ENABLED, false);
  }

```

## 许可证 (License)

本项目遵循与上游项目相同的许可证。
