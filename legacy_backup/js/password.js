// 密码保护功能

// 在文件顶部添加一个全局变量来跟踪验证目的
window.verifyingPurpose = 'main'; // 'main' 或 'settings'

// 只从全局读取，不再声明const，避免重复
const PASSWORD_CONFIG = window.PASSWORD_CONFIG;
if (!PASSWORD_CONFIG) {
    console.warn('PASSWORD_CONFIG 未定义，密码功能默认关闭');
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
 * 检查用户是否已通过“设置”的密码验证
 */
function isSettingsPasswordVerified() {
    try {
        const settingsHash = window.__ENV__?.SETTINGS_PASSWORD;
        if (!settingsHash || /^0+$/.test(settingsHash)) return true; // 如果未设置密码，则视为通过

        const raw = localStorage.getItem(PASSWORD_CONFIG.settingsLocalStorageKey) || '{}';
        const { verified, timestamp, passwordHash } = JSON.parse(raw);

        // 检查通过、未过期、且为当前设置密码的哈希
        return !!(verified && timestamp && passwordHash === settingsHash && Date.now() < timestamp + PASSWORD_CONFIG.verificationTTL);
    } catch (e) {
        console.error('设置密码验证状态判断异常:', e);
        return false;
    }
}

/**
 * 校验输入密码是否正确（异步SHA-256）
 * @param {string} password - 用户输入的密码
 * @param {string} correctHash - 正确的密码哈希
 */
async function verifyPassword(password, correctHash) {
    if (!correctHash) return false;

    try {
        const inputHash = await sha256(password);
        return inputHash === correctHash;
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
        const input = document.getElementById('passwordInput');
        if (input) {
            input.value = ''; // 清空输入框
        }
        hidePasswordError(); // 确保错误提示是隐藏的

        const closeButton = document.getElementById('closePasswordModalButton');
        if (closeButton) {
            // 仅当验证目的是'settings'时才显示关闭按钮
            if (window.verifyingPurpose === 'settings') {
                closeButton.classList.remove('hidden');
            } else {
                closeButton.classList.add('hidden');
            }
        }

        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('passwordInput')?.focus(), 80);
    }
}

function hidePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.style.display = 'none';
        // 确保关闭时，关闭按钮也被隐藏
        document.getElementById('closePasswordModalButton')?.classList.add('hidden');
    }
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
    const purpose = window.verifyingPurpose || 'main';

    const targetHash = purpose === 'settings'
        ? window.__ENV__?.SETTINGS_PASSWORD
        : window.__ENV__?.PASSWORD;

    if (await verifyPassword(pwd, targetHash)) {
        hidePasswordError();
        hidePasswordModal();
        if (purpose === 'main') {
            localStorage.setItem(PASSWORD_CONFIG.localStorageKey, JSON.stringify({
                verified: true,
                timestamp: Date.now(),
                passwordHash: targetHash
            }));
            document.dispatchEvent(new CustomEvent('passwordVerified'));
        } else if (purpose === 'settings') {
            localStorage.setItem(PASSWORD_CONFIG.settingsLocalStorageKey, JSON.stringify({
                verified: true,
                timestamp: Date.now(),
                passwordHash: targetHash
            }));
            document.dispatchEvent(new CustomEvent('settingsPasswordVerified'));
        }
    } else {
        showPasswordError();
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

/**
 * 初始化密码弹窗的事件监听器
 */
function initPasswordModalListeners() {
    const closeButton = document.getElementById('closePasswordModalButton');
    if (closeButton && !closeButton._listenerAttached) {
        closeButton.addEventListener('click', hidePasswordModal);
        closeButton._listenerAttached = true;
    }

    const submitBtn = document.getElementById('passwordSubmitBtn');
    if (submitBtn && !submitBtn.onclick) {
        submitBtn.addEventListener('click', handlePasswordSubmit);
    }

    const input = document.getElementById('passwordInput');
    if (input && !input._passwordEvtBinded) {
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') handlePasswordSubmit();
        });
        input._passwordEvtBinded = true;
    }
}

/**
 * 初始化密码保护入口
 */
function initPasswordProtection() {
    if (!isPasswordProtected()) return;

    // 未认证弹出密码框
    if (!isPasswordVerified()) {
        showPasswordModal();
    }
}

// DOM加载完成自动初始化
document.addEventListener('DOMContentLoaded', () => {
    initPasswordProtection();
    initPasswordModalListeners(); // 统一初始化所有监听器
});


// DOM加载完成自动初始化
document.addEventListener('DOMContentLoaded', initPasswordProtection);