// 全局常量配置
const PROXY_URL = '/proxy/';
const SEARCH_HISTORY_KEY = 'videoSearchHistory';
const MAX_HISTORY_ITEMS = 5;

// 搜索缓存配置
const SEARCH_CACHE_CONFIG = {
    expireTime: 15 * 24 * 60 * 60 * 1000, // 默认15天效期
    enabled: true // 是否启用搜索缓存
};

window.SEARCH_CACHE_CONFIG = SEARCH_CACHE_CONFIG;

// 密码保护配置
window.PASSWORD_CONFIG = window.PASSWORD_CONFIG || {
    localStorageKey: 'passwordVerified',
    settingsLocalStorageKey: 'settingsPasswordVerified', // 设置按钮密码
    verificationTTL: 90 * 24 * 60 * 60 * 1000, // 90天验证有效期 
};
// 网站信息配置
const SITE_CONFIG = {
    name: 'x',
    url: '',
    description: '',
    logo: '',
    version: ''
};

window.SITE_CONFIG = SITE_CONFIG;

// API站点配置
const API_SITES = {
    bfzy: { api: 'https://bfzyapi.com/api.php/provide/vod', name: '暴风资源' },
    mozhua: { api: 'https://mozhuazy.com/api.php/provide/vod', name: '魔爪资源' },
    dyttzy: { api: 'https://caiji.dyttzyapi.com/api.php/provide/vod', name: '电影天堂', detail: 'https://caiji.dyttzyapi.com' },
    tyyszy: { api: 'https://tyyszy.com/api.php/provide/vod', name: '天涯资源' },
    mdzy: { api: 'https://www.mdzyapi.com/api.php/provide/vod', name: '魔都资源' },
    maotai: { api: 'https://caiji.maotaizy.cc/api.php/provide/vod', name: '茅台资源' },
    yzzy: { api: 'https://api.yzzy-api.com/inc/apijson.php', name: '优质资源' },
    ruyi: { api: 'https://cj.rycjapi.com/api.php/provide/vod', name: '如意资源' },
    wolong: { api: 'https://wolongzyw.com/api.php/provide/vod', name: '卧龙资源' },
    wwzy: { api: 'https://wwzy.tv/api.php/provide/vod', name: '旺旺短剧' },
    dbzy: { api: 'https://caiji.dbzy5.com/api.php/provide/vod', name: '豆瓣资源' },
    hwba: { api: 'https://cjhwba.com/api.php/provide/vod', name: '华为吧资源' },
    jmzy: { api: 'https://api.jmzy.com/api.php/provide/vod', name: '金马资源' },
    zy360: { api: 'https://360zy.com/api.php/provide/vod', name: '360资源' },
    jisu: { api: 'https://jszyapi.com/api.php/provide/vod', name: '极速资源', detail: 'https://jszyapi.com' },
    zuid: { api: 'https://api.zuidapi.com/api.php/provide/vod', name: '最大资源' },
    baidu: { api: 'https://api.apibdzy.com/api.php/provide/vod', name: '百度云资源' },
    wujin: { api: 'https://api.wujinapi.me/api.php/provide/vod', name: '无尽资源' },
    ikun: { api: 'https://ikunzyapi.com/api.php/provide/vod', name: 'iKun资源' },
    // huya: { api: 'https://www.huyaapi.com/api.php/provide/vod', name: '虎牙资源', detail: 'https://www.huyaapi.com' },  
};

window.API_SITES = API_SITES;
const DEFAULT_SELECTED_APIS = ["mozhua", "bfzy", "dyttzy", "maotai", "tyyszy", "mdzy"];
window.DEFAULT_SELECTED_APIS = DEFAULT_SELECTED_APIS;

// 聚合搜索配置
const AGGREGATED_SEARCH_CONFIG = {
    enabled: true,
    timeout: 8000, // 单个源超时时间（毫秒） 
    maxResults: 10000,
    parallelRequests: true,
    showSourceBadges: true
};

// API请求配置
const API_CONFIG = {
    search: {
        path: '?ac=videolist&wd=', // 更新：仅含查询参数 
        pagePath: '?ac=videolist&wd={query}&pg={page}', // 新增：分页路径模板 
        maxPages: 50, // 新增：最大获取页数 
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', // 
            'Accept': 'application/json'
        }
    },
    detail: {
        path: '?ac=videolist&ids=', // 更新：仅含查询参数 
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', // 
            'Accept': 'application/json'
        }
    }
};

// 正则表达式模式
const M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g;

// 自定义播放器URL
const CUSTOM_PLAYER_URL = 'player.html';

// 预加载集数开关
const DEFAULTS = {
    enablePreloading: true, // 预加载 
    preloadCount: 1,       // 预加载集数 
    debugMode: false      // 调试模式 
};

// 播放器配置
const PLAYER_CONFIG = {
    autoplay: true,
    allowFullscreen: true,
    width: '100%',
    height: '600',
    timeout: 15000, // 播放器加载超时时间 
    autoPlayNext: true, // 默认启用自动连播功能 
    adFilteringEnabled: getBoolConfig('adFilteringEnabled', true), // 默认关闭分片广告过滤，开启会导致某些资源卡住 
    adFilteringStorage: 'adFilteringEnabled', // 存储广告过滤设置的键名 
    speedDetectionEnabled: getBoolConfig('speedDetectionEnabled', true), // 默认启用画质速度检测
    speedDetectionStorage: 'speedDetectionEnabled', // 存储画质速度检测设置的键名
    enablePreloading: getBoolConfig('preloadingEnabled', DEFAULTS.enablePreloading),
    preloadCount: getIntConfig('preloadCount', DEFAULTS.preloadCount, 1, 10),
    debugMode: getBoolConfig('debugMode', DEFAULTS.debugMode),
};

window.PLAYER_CONFIG = PLAYER_CONFIG;

// 错误消息本地化
const ERROR_MESSAGES = {
    NETWORK_ERROR: '网络连接错误，请检查网络设置',
    TIMEOUT_ERROR: '请求超时，服务器响应时间过长',
    API_ERROR: 'API接口返回错误，请尝试更换数据源',
    PLAYER_ERROR: '播放器加载失败，请尝试其他视频源',
    UNKNOWN_ERROR: '发生未知错误，请刷新页面重试'
};
// 安全配置
const SECURITY_CONFIG = {
    enableXSSProtection: true,  // 启用XSS保护 
    sanitizeUrls: true,         // 清理URL 
    maxQueryLength: 100        // 最大搜索长度 
};
// 自定义API配置
const CUSTOM_API_CONFIG = {
    separator: ',',           // 分隔符 
    maxSources: 5,           // 最大允许的自定义源数量 
    testTimeout: 5000,       // 测试超时时间(毫秒) 
    namePrefix: 'Custom-',    // 自定义源名称前缀 
    validateUrl: true,        // 验证URL格式 
    cacheResults: true,       // 缓存测试结果 
    cacheExpiry: 5184000000, // 缓存过期时间(2个月) 
    adultPropName: 'isAdult'  // 成人内容标记属性名 
};

// 隐藏内置黄色采集站API的变量
const HIDE_BUILTIN_ADULT_APIS = true;

function getBoolConfig(key, def) {
    try {
        const v = localStorage.getItem(key);
        if (v === null) return def;
        return v === 'true' || v === true;
    } catch (e) {
        console.warn(`Error reading boolean config for ${key}:`, e);
        return def;
    }
}

function getIntConfig(key, def, min = 0, max = 10) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return def;
        const v = parseInt(typeof raw === 'string' ? raw : String(raw));
        return (!isNaN(v) && v >= min && v <= max) ? v : def;
    } catch (e) {
        console.warn(`Error reading integer config for ${key}:`, e);
        return def;
    }
}

// 确保预加载配置在首次访问时生效
if (localStorage.getItem('preloadingEnabled') === null) {
    localStorage.setItem('preloadingEnabled', DEFAULTS.enablePreloading.toString());
}
if (localStorage.getItem('preloadCount') === null) {
    localStorage.setItem('preloadCount', DEFAULTS.preloadCount.toString());
}
if (localStorage.getItem('debugMode') === null) {
    localStorage.setItem('debugMode', DEFAULTS.debugMode.toString());
}