# X - 深度优化重构的在线影音播放器

这是一个基于 [**LibreSpark/LibreTV**](https://github.com/LibreSpark/LibreTV) 的深度优化重构分支。本项目在保留上游核心功能的基础上，进行了大量代码重构，采用 [**Vidstack Player**](https://github.com/vidstack/player) 作为新的播放器，并增加了多项提升用户体验的实用功能。

> 采用dplayer版本请移步到分支[for-dplayer](https://github.com/sjnhnp/movie/tree/for-dplayer)

## 🚀 主要特性

### 首页 (Homepage)

* **聚合搜索**: 支持同时从多个内置及自定义的数据源搜索视频资源。
* **豆瓣热门**: 可在首页展示豆瓣热门电影和电视剧推荐，并支持分类切换/新增、换一批和标签管理功能。
* **M3U 直播入口**: 集成了M3U电视直播播放器的外部链接，方便观看电视直播。默认是[项目地址](https://github.com/sjnhnp/m3u-player)
* **历史记录**:
    * **观看历史**: 独立保存每一集的观看记录，而非仅记录整部剧。支持进度条显示和从指定位置继续播放。
    * **搜索历史**: 自动保存用户搜索词条，方便快速再次搜索。由“豆瓣热门”产生的搜索结果不会计入个人搜索历史。
* **灵活的数据源管理**:
    * 支持全选、全不选、仅选择普通资源等快捷操作。
    * 允许用户添加、编辑和删除自定义API源。
* **内容过滤**:
    * **黄色内容过滤**: 可一键过滤分类为“伦理片”或标题包含敏感词的成人内容。
    * **分片广告过滤**: 可选的广告过滤功能，默认/建议关闭，因为有些资源站会卡住。
    * **播放预加载**：自定义预加载集数+开关。
    
### 播放页 (Player Page)
> mac windows ios android safari chrome firefox 
>> - 播放器控制条功能按钮：非全屏+全屏下，或都会稍有不同
>> - 操作提示消息或也有差异
>> - 以上请知悉

* **现代播放核心**: 采用高度可定制的[**Vidstack Player**](https://github.com/vidstack/player) 作为播放器。
* **无缝线路切换**: 切换不同线路时（即搜索结果数据源），能够保持当前的播放进度，实现无缝切换体验。
* **智能进度记忆**:
    * 独立于观看历史，可记住每一集的具体播放进度。
    * 当再次播放同一集时，会弹窗提示是否从上次的进度继续观看。
* **播放预加载**: 启用后会自动预加载接下来几个未看剧集的`m3u8`文件和视频分片，优化切换和启动速度。
* **跳过片头/片尾**: 支持在设置中自定义需要跳过的片头和片尾秒数。
* **锁屏功能**: 锁定屏幕后可防止误触，仅保留播放/暂停和全屏操作。
* **单集隐藏**: 只有一集的情况下，不显示剧集区域选择
* **投屏+画中画**: 有些浏览器按钮在全屏下才会出现
* **全局快捷键**: 在播放页任意位置均可使用快捷键（如空格、方向键等）控制播放。

| 按键 | 功能 | 详细说明 |
| :--- | :--- | :--- |
| `k` 或 `Space` | 切换播放/暂停 | 切换视频的播放和暂停状态。 |
| `m` | 切换静音 | 开启或关闭播放器的声音。 |
| `i` | 退出画中画 | 回到主画面 |
| `ArrowUp` (↑) | 增加音量 | 调高音量。 |
| `ArrowDown` (↓) | 减小音量 | 调低音量。 |
| `ArrowLeft` (←) 或 `J`| 后退 10秒 | 将播放进度后退 10 秒。 |
| `Alt` + `ArrowLeft` | 上一集 | 切换到上一个剧集进行播放。 |
| `ArrowRight` (→) 或`L`| 前进 10秒 | 将播放进度快进 10 秒。 |
| `Alt` + `ArrowRight` | 下一集 | 切换到下一个剧集进行播放。 |
| `f` 或 `F` | 切换全屏 | 包括锁屏时，进入或退出全屏播放模式。 |
| `>` (Shift + .) | 加速播放 | 提高视频播放速度。 |
| `<` (Shift + ,) | 减速播放 | 降低视频播放速度。 |
| `Escape` | 退出全屏/锁屏 | 当处于全屏或锁屏状态时，按下此键可退出。 |

### 📱 移动端触摸操作

| 操作 | 触摸位置 | 触发行为 |
| :--- | :--- | :--- |
| **单击** | 锁屏状态下 | 暂停|
| **双击** | 左侧/右侧 | 快退10s/快进10s |
| **左右滑动** | 播放器区域 | 进度条回退/前进|
| **Android系统返回手势** | 锁屏状态下 | 退出全屏播放 |
| **ios系统拖拉** | 锁屏状态下 | 退出全屏播放 |

### 🖥️ 桌面端鼠标操作 

| 操作区域 | 动作 | 功能 |
| :--- | :--- | :--- |
| **首页** | | |
| 搜索框 | 输入文字后点击“搜索”按钮 | 根据关键词从选定的数据源进行搜索。 |
| 历史/设置 | 点击左上角“历史”按钮 | 打开或关闭观看历史侧边栏。 |
| **播放页** | | |
| 鼠标单击| 包括锁屏时| 暂停/播放 |
| 鼠标双击| 非锁屏时| 全屏/退出全屏 |
| 功能按钮 | 点击“返回”按钮 | 返回到搜索结果 |
| | 点击“画中画”按钮 | 画中画 |
| | 点击“投屏”按钮 | 投屏 |
| | 点击“线路”按钮 | 展开或收起可用线路列表，点击具体线路可无缝切换并保持进度。 |
| | 点击“跳过设置”按钮 | 展开或收起用于设置跳过片头/片尾时长的菜单。 |
| | 点击“复制链接”按钮 | 将当前播放视频的链接复制到剪贴板。 |
| | 点击“排序”按钮 | 切换剧集列表的正序或倒序排列。 |
| | 点击“锁定”按钮 | 锁定/解锁屏幕，防止误触。 |

### 后端/架构 (Backend/Architecture)

* **密码保护**:
    * 支持为整个网站设置访问密码。
    * 支持为首页的“设置”按钮单独设置密码。
    * 密码在 Cloudflare 的边缘函数中通过 SHA-256 进行哈希处理后注入到前端页面，增强了安全性。

## 部署指南 (Deployment)

本项目可一键部署于 Cloudflare Pages/vercel。基础部署流程请参考 [**上游项目文档**](https://github.com/LibreSpark/LibreTV)。

### 可选：环境变量 (Environment Variables)

1.  **KV Namespace Binding**
    * **变量名称 (Variable name):** `LIBRETV_PROXY_KV`
    * **KV 命名空间 (KV namespace):** (选择您为此项目创建的KV)
2.  **环境变量 (Environment Variables)**
    * **变量名称 (Variable name):** `PASSWORD`
        * **值 (Value):** 用于设置网站的全局访问密码。
    * **变量名称 (Variable name):** `SETTINGS_PASSWORD`
        * **值 (Value):** 用于为首页的“设置”按钮单独设置密码。

### docker安装方式，密码可以根据自己的需要是否保留

#### Docker
```
docker run -d \
  -p 8080:8080 \
  -e PASSWORD="your-secret-password" \
  -e SETTINGS_PASSWORD="your-settings-password" \
  --restart unless-stopped \
  --name movie \
  ghcr.io/sjnhnp/movie:latest
```

#### Docker Compose
`docker-compose.yml` 文件：
```
services:
  movie:
    build: .
    image: ghcr.io/sjnhnp/movie:latest
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - PASSWORD=your-secret-password
      - SETTINGS_PASSWORD=your-settings-password
    restart: unless-stopped
```

## 配置修改

您可以通过修改以下JS文件来进行个性化配置：

* **`js/config.js`**
    * `DEFAULTS`:
        * `enablePreloading`: 播放预加载功能的默认开关状态。
        * `preloadCount`: 默认预加载的集数。
    * `DEFAULT_SELECTED_APIS`: 设置首次访问时默认选中的数据源。
    * `PLAYER_CONFIG.adFilteringEnabled`: 分片广告过滤功能的默认开关状态。

* **`js/douban.js`**
    * 要修改豆瓣热门推荐功能的默认开关状态，请找到以下代码行，并将 `false` 修改为 `true`。
      ```javascript
      // 将下面两行的 false 修改为 true
      const isEnabled = utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, false) === true;
      if (localStorage.getItem(CONFIG.STORAGE_KEYS.ENABLED) === null) {
        utils.storage.set(CONFIG.STORAGE_KEYS.ENABLED, false);
      }
      ```

## 许可证 (License)

本项目遵循与上游项目相同的许可证。