// 全局常量配置
const PROXY_URL = '/proxy/';
const SEARCH_HISTORY_KEY = 'videoSearchHistory';
const MAX_HISTORY_ITEMS = 5;

// 搜索缓存配置
const SEARCH_CACHE_CONFIG = {
    expireTime: 15 * 24 * 60 * 60 * 1000, // 默认15天效期
    enabled: true // 是否启用搜索缓存
};

if (typeof window !== 'undefined') window.SEARCH_CACHE_CONFIG = SEARCH_CACHE_CONFIG;

// 密码保护配置
if (typeof window !== 'undefined') {
    window.PASSWORD_CONFIG = window.PASSWORD_CONFIG || {
        localStorageKey: 'passwordVerified',
        settingsLocalStorageKey: 'settingsPasswordVerified', // 设置按钮密码
        verificationTTL: 90 * 24 * 60 * 60 * 1000, // 90天验证有效期 
    };
}

// 网站信息配置
const SITE_CONFIG = {
    name: 'x',
    url: '',
    description: '',
    logo: '',
    version: ''
};

if (typeof window !== 'undefined') window.SITE_CONFIG = SITE_CONFIG;

// API站点配置
const API_SITES = {
    zuid: { api: 'https://api.zuidapi.com/api.php/provide/vod', name: '最大资源' },
    yzzy: { api: 'https://api.yzzy-api.com/inc/apijson.php', name: '优质资源' },
    bfzy: { api: 'https://bfzyapi.com/api.php/provide/vod', name: '暴风资源' },
    mdzy: { api: 'https://www.mdzyapi.com/api.php/provide/vod', name: '魔都资源' },
    maotai: { api: 'https://caiji.maotaizy.cc/api.php/provide/vod', name: '茅台资源' },
    wolong: { api: 'https://wolongzyw.com/api.php/provide/vod', name: '卧龙资源' },
    dyttzy: { api: 'https://caiji.dyttzyapi.com/api.php/provide/vod', name: '电影天堂', detail: 'https://caiji.dyttzyapi.com' },
    ruyi: { api: 'https://cj.rycjapi.com/api.php/provide/vod', name: '如意资源' },
    dbzy: { api: 'https://caiji.dbzy5.com/api.php/provide/vod', name: '豆瓣资源' },
    wwzy: { api: 'https://wwzy.tv/api.php/provide/vod', name: '旺旺短剧' },
    hwba: { api: 'https://cjhwba.com/api.php/provide/vod', name: '华为吧资源' },
    jmzy: { api: 'https://api.jmzy.com/api.php/provide/vod', name: '金马资源' },
    zy360: { api: 'https://360zy.com/api.php/provide/vod', name: '360资源' },
    baidu: { api: 'https://api.apibdzy.com/api.php/provide/vod', name: '百度云资源' },
    wujin: { api: 'https://api.wujinapi.me/api.php/provide/vod', name: '无尽资源' },
    ikun: { api: 'https://ikunzyapi.com/api.php/provide/vod', name: 'iKun资源' },
    tyyszy: { api: 'https://tyyszy.com/api.php/provide/vod', name: '天涯资源' },
};

if (typeof window !== 'undefined') window.API_SITES = API_SITES;
const DEFAULT_SELECTED_APIS = ["zuid", "yzzy", "mdzy", "bfzy", "maotai", "wolong"];
if (typeof window !== 'undefined') window.DEFAULT_SELECTED_APIS = DEFAULT_SELECTED_APIS;

// 聚合搜索配置
const AGGREGATED_SEARCH_CONFIG = {
    enabled: true,
    timeout: 8000, // 单个源超时时间（毫秒） 
    maxResults: 10000,
    parallelRequests: true,
    showSourceBadges: true
};

const API_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    },
    search: {
        path: '?ac=videolist&wd=',
        pagePath: '?ac=videolist&wd={query}&pg={page}',
        maxPages: 50,
    },
    detail: {
        path: '?ac=videolist&ids=',
    }
};

// 正则表达式模式
const M3U8_PATTERN = /\$https?:\/\/[^"'\s\$]+?\.m3u8(?![a-zA-Z0-9])(?:[\?#][^"'\s\$]*)?/g;

// 自定义播放器URL
const CUSTOM_PLAYER_URL = 'player.html';

// 隐藏内置黄色采集站API的变量
const HIDE_BUILTIN_ADULT_APIS = true;
if (typeof window !== 'undefined') window.HIDE_BUILTIN_ADULT_APIS = HIDE_BUILTIN_ADULT_APIS;

// 预加载配置默认值
const DEFAULTS = {
    enablePreloading: false, // 预加载 
    preloadCount: 2,       // 预加载集数 
    debugMode: false      // 调试模式 
};

/**
 * 安全地获取配置，兼容 AppStorage 和 localStorage
 */
function getBoolConfig(key, def) {
    try {
        let v = null;
        if (typeof AppStorage !== 'undefined') {
            v = AppStorage.getItem(key);
        } else if (typeof localStorage !== 'undefined') {
            v = localStorage.getItem(key);
        }

        if (v === null) return def;
        return v === 'true' || v === true;
    } catch (e) {
        if (typeof Logger !== 'undefined') Logger.warn(`Error reading boolean config for ${key}:`, e);
        else console.warn(`Error reading boolean config for ${key}:`, e);
        return def;
    }
}

function getIntConfig(key, def, min = 0, max = 10) {
    try {
        let raw = null;
        if (typeof AppStorage !== 'undefined') {
            raw = AppStorage.getItem(key);
        } else if (typeof localStorage !== 'undefined') {
            raw = localStorage.getItem(key);
        }

        if (raw === null) return def;
        const v = parseInt(typeof raw === 'string' ? raw : String(raw));
        return (!isNaN(v) && v >= min && v <= max) ? v : def;
    } catch (e) {
        if (typeof Logger !== 'undefined') Logger.warn(`Error reading integer config for ${key}:`, e);
        else console.warn(`Error reading integer config for ${key}:`, e);
        return def;
    }
}

// 播放器配置
const PLAYER_CONFIG = {
    autoplay: true,
    allowFullscreen: true,
    width: '100%',
    height: '600',
    timeout: 15000, // 播放器加载超时时间 
    autoPlayNext: true, // 默认启用自动连播功能 
    adFilteringEnabled: getBoolConfig('adFilteringEnabled', false), // 默认关闭分片广告过滤
    adFilteringStorage: 'adFilteringEnabled', // 存储广告过滤设置的键名 
    speedDetectionEnabled: getBoolConfig('speedDetectionEnabled', false), // 默认启用画质速度检测
    speedDetectionStorage: 'speedDetectionEnabled', // 存储画质速度检测设置的键名
    enablePreloading: getBoolConfig('preloadingEnabled', DEFAULTS.enablePreloading),
    preloadCount: getIntConfig('preloadCount', DEFAULTS.preloadCount, 1, 10),
    debugMode: getBoolConfig('debugMode', DEFAULTS.debugMode),
};

if (typeof window !== 'undefined') window.PLAYER_CONFIG = PLAYER_CONFIG;

// 确保预加载配置存在默认值
(function ensureDefaults() {
    try {
        const storage = (typeof AppStorage !== 'undefined' ? AppStorage : localStorage);
        if (!storage) return;

        if (storage.getItem('preloadingEnabled') === null) {
            storage.setItem('preloadingEnabled', DEFAULTS.enablePreloading.toString());
        }
        if (storage.getItem('preloadCount') === null) {
            storage.setItem('preloadCount', DEFAULTS.preloadCount.toString());
        }
        if (storage.getItem('debugMode') === null) {
            storage.setItem('debugMode', DEFAULTS.debugMode.toString());
        }
    } catch (e) {
        // Ignore initialization errors
    }
})();
