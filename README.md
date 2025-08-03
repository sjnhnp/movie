# X - 纯粹的在线播放器

> * **采用的播放器**: [**Vidstack Player**](https://github.com/vidstack/player) 

> 采用dplayer版本请移步到分支[for-dplayer](https://github.com/sjnhnp/movie/tree/for-dplayer)

## 🚀 特别的

### 首页 (Homepage)
* **选集按钮文本，其它默认索引**:
    * **综艺节目**: 选集按钮文本为原始期数名称，比如`20250707(第1期)`，不再是`1234···`
    * **非综艺的非纯数字**: 优先使用原始名称，比如`HD/TC/高清`
* **搜索结果**: 
    * **无感排序**: 单纯根据下载速度，最快-最慢-N/A，
    * **自定义缓存**: 可自定义保存天数
        - 缓存效期内，同关键字搜索`秒开`结果
        - 更改不同数据源，可强制更新缓存
    * **画质和速度**: 
        - 后台自动更新，自动更新画质标签，自动排序，不阻塞UI体验
        - 若画质标签显示`未知`，可手动点击`未知`重新检测，存入缓存
        - 显示位置：搜索结果卡片、集数弹窗。速度只在弹窗。
* **历史记录**:
    * **观看历史**: 独立保存每一集的观看记录
    * **搜索历史**: 由“豆瓣热门”产生的搜索不会计入个人搜索历史。
* **设置面板**:
    * **分片广告过滤**: 如果开启后有些数据源会卡住，请关闭。
    * **播放预加载**：自定义预加载集数+开关。
    * **画质速度检测**：开关
* **视频简介**: 准确从数据源获取
    
### 播放页 (Player Page)
> mac windows ios android safari chrome firefox 
>> - 播放器控制条功能按钮：非全屏+全屏下，或都会稍有不同
>> - 操作提示消息或也有差异
>> - 以上请知悉

* **观看历史+搜索**: 与首页一致
* **无缝线路切换**: 
    - 跨线路共享所有播放进度+相同剧集命名不同的切换线路聚合，比如港剧/美剧
    - 线路显示更新状态，比如`已完结`
* **记住进度**: 独立于观看历史，记住每集的播放进度
* **播放预加载**: 启用后会自动预加载
* **去广告+预加载**: 去广告实时生效，预加载下一次
* **跳过片头/片尾**: 秒。
* **锁屏功能**: 锁定屏幕后，仅保留播放画面区域的播放/暂停、右上角全屏、锁屏按钮可操作。
* **单集隐藏**
* **投屏+画中画**: 有些浏览器按钮在全屏下才会出现。
* **全局快捷键**: 在播放页任意位置均可使用键盘快捷键控制播放，需要特别说明如下
    - w：进入/退出网页全屏
    - esc：退出网页全屏/全屏
    - 双击/双指单击：左右/快进退、中央区域/全屏
    - 双指缩放网页，包括播放器区域
    - f：进入/退出全屏
    - m：静音
    - 左右滑动：进度条
    - alt+左右：上/下集
  
### 后端/架构 (Backend/Architecture)

* **密码保护**:
    * 支持为整个网站设置访问密码。
    * 支持为首页的“设置”按钮单独设置密码。

## 部署指南 (Deployment)

可一键部署于 Cloudflare Pages/Vercel。基础部署流程请参考 [**Libretv**](https://github.com/LibreSpark/LibreTV)。

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

### fork之后自动同步本项目

必须手动去自己的仓库里启用 Actions之后，才会按照预设的时间（每天凌晨4点）自动同步更新。

## 配置修改

您可以通过修改以下JS文件来进行个性化配置：

* **`js/config.js`**
    * `const DEFAULT_SELECTED_APIS`: 设置首次访问时默认选中的数据源。
    * `adFilteringEnabled: getBoolConfig('adFilteringEnabled', true)`: 分片广告过滤功能的默认开关状态。
    * `speedDetectionEnabled: getBoolConfig('speedDetectionEnabled', true)`: 画质和速度检测功能的默认开关状态
    * `const MAX_HISTORY_ITEMS`：搜索历史标签最大数，默认5


    ```
    // 预加载集数开关
    const DEFAULTS = {
        enablePreloading: true, // 预加载 
        preloadCount: 2,       // 预加载集数 
        debugMode: false      // 调试模式 
    };
    ```

    ```
    // 搜索结果缓存
    const SEARCH_CACHE_CONFIG = {
        expireTime: 15 * 24 * 60 * 60 * 1000, // 默认15天效期
        enabled: true // 是否启用搜索缓存
    };
    ```

* **`js/douban.js`**
    * 要修改豆瓣热门推荐功能的默认开关状态，请找到以下代码行，并将 `false` 修改为 `true`。
      ```javascript
      // 将下面两行的 false 修改为 true
      const isEnabled = utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, false) === true;
      if (localStorage.getItem(CONFIG.STORAGE_KEYS.ENABLED) === null) {
        utils.storage.set(CONFIG.STORAGE_KEYS.ENABLED, false);
      }
      ```

* **`index.html`**

    ```
        <!-- 比如Facebook抓取的预览 -->
    <meta property="og:title" content="X" />
    <meta property="og:description" content="TV Aggregation" />
    <meta property="og:image" content="https://yourwebsite.com/images/tv1.png" />
    <meta property="og:url" content="https://yourwebsite.com" />
    <meta property="og:type" content="website" />
     
    ```

## 许可证 (License)

本项目遵循与上游项目相同的许可证。

## 感谢
- [**Libretv**](https://github.com/LibreSpark/LibreTV)
- [**Vidstack Player**](https://github.com/vidstack/player) 