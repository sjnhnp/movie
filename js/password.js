// 密码保护功能

// ========== 配置项校验 ==========

// 只从全局读取，不再声明const，避免重复
const PASSWORD_CONFIG = window.PASSWORD_CONFIG;
if (!PASSWORD_CONFIG) {
    console.warn('PASSWORD_CONFIG 未定义，密码功能默认关闭');
    // 可选兜底（如果你担心某些页面不引入config.js）
    // window.PASSWORD_CONFIG = { localStorageKey: 'passwordVerified', verificationTTL: 12*60*60*1000 };
    // 或强制return，停止执行
}
/**
 * 检查是否设置了密码保护（依赖 window.__ENV__ 挂载的 PASSWORD SHA256 哈希）
 */
function isPasswordProtected() {
    // 只有存在64位非全0哈希才算有效
    const pwd = window.__ENV__?.PASSWORD;
    return typeof pwd === 'string' && pwd.length === 64 && !/^0+$/.test(pwd);
}

/**
 * 检查用户是否已通过密码验证（localStorage + hash 校验 + 过期校验）
 */
function isPasswordVerified() {
    try {
        if (!isPasswordProtected()) return true;
        const raw = localStorage.getItem(PASSWORD_CONFIG.localStorageKey) || '{}';
        const { verified, timestamp, passwordHash } = JSON.parse(raw);
        const envHash = window.__ENV__?.PASSWORD;
        // 检查通过、未过期、且为当前密码
        return !!(verified && timestamp && passwordHash === envHash && Date.now() < timestamp + PASSWORD_CONFIG.verificationTTL);
    } catch (e) {
        console.error('密码验证状态判断异常:', e);
        return false;
    }
}

// 全局导出，用于外部判断
window.isPasswordProtected = isPasswordProtected;
window.isPasswordVerified = isPasswordVerified;

/**
 * 校验输入密码是否正确（异步SHA-256）
 */
async function verifyPassword(password) {
    const correctHash = window.__ENV__?.PASSWORD;
    if (!correctHash) return false;

    try {
        // 直接调用本地 sha256 函数
        const inputHash = await sha256(password);
        const isValid = inputHash === correctHash;
        if (isValid) {
            localStorage.setItem(PASSWORD_CONFIG.localStorageKey, JSON.stringify({
                verified: true,
                timestamp: Date.now(),
                passwordHash: correctHash
            }));
        }
        return isValid;
    } catch (error) {
        console.error('SHA-256 计算失败:', error);
        return false;
    }
}

/**
 * Web端/HTTP 用SHA-256实现，可用原生crypto或window._jsSha256_fallback兜底。
 * 强烈建议在 cloudflare pages HTTPS 环境下用原生crypto。
 */
async function sha256(message) {
    if (window.crypto?.subtle?.digest) {
        try {
            const buf = new TextEncoder().encode(message);
            const hash = await window.crypto.subtle.digest('SHA-256', buf);
            return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            // 落后浏览器兼容性兜底
        }
    }
    // 修改：使用 _jsSha256_fallback 作为同步库版本的别名
    if (typeof window._jsSha256_fallback === 'function') {
        return window._jsSha256_fallback(message);
    }
    throw new Error('No SHA-256 implementation available.');
}

// ========== 密码弹窗及错误提示 ==========
function showPasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('passwordInput')?.focus(), 80);
    }
}

function hidePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.style.display = 'none';
}

function showPasswordError() {
    document.getElementById('passwordError')?.classList.remove('hidden');
}

function hidePasswordError() {
    document.getElementById('passwordError')?.classList.add('hidden');
}

/**
 * 密码提交事件处理（失败清空并refocus）
 */
async function handlePasswordSubmit() {
    const input = document.getElementById('passwordInput');
    const pwd = input ? input.value.trim() : '';
    if (await verifyPassword(pwd)) {
        hidePasswordError();
        hidePasswordModal();
        document.dispatchEvent(new CustomEvent('passwordVerified'));
    } else {
        showPasswordError();
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

/**
 * 初始化密码保护入口
 */
function initPasswordProtection() {
    if (!isPasswordProtected()) return;

    // 未认证弹出密码框及事件
    if (!isPasswordVerified()) {
        showPasswordModal();
        const submitBtn = document.getElementById('passwordSubmitBtn');
        if (submitBtn) {
            // 只绑定一次
            if (!submitBtn.onclick) submitBtn.addEventListener('click', handlePasswordSubmit);
        }
        const input = document.getElementById('passwordInput');
        if (input) {
            if (!input._passwordEvtBinded) { // 避免重复绑定
                input.addEventListener('keypress', function (e) {
                    if (e.key === 'Enter') handlePasswordSubmit();
                });
                input._passwordEvtBinded = true;
            }
        }
    }
}

// DOM加载完成自动初始化
document.addEventListener('DOMContentLoaded', initPasswordProtection);
