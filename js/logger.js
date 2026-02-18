/**
 * Logger utility for centralized logging control
 */
(function (window) {
    const Logger = {
        get isEnabled() {
            // Production check: If window.__ENV__.NODE_ENV is 'production' and debug_mode is not forced
            const isProd = window.__ENV__ && window.__ENV__.NODE_ENV === 'production';
            const storageDebug = localStorage.getItem('debug_mode');
            const debugMode = (window.DEFAULTS && window.DEFAULTS.debugMode) || false;

            if (isProd && storageDebug !== 'true') return false;
            return storageDebug === 'true' || debugMode || !isProd;
        },

        log(...args) {
            if (this.isEnabled) {
                console.log('[LOG]', ...args);
            }
        },

        info(...args) {
            if (this.isEnabled) {
                console.info('[INFO]', ...args);
            }
        },

        warn(...args) {
            if (this.isEnabled) {
                console.warn('[WARN]', ...args);
            }
        },

        error(...args) {
            console.error('[ERROR]', ...args);
        },

        debug(...args) {
            if (this.isEnabled) {
                console.debug('[DEBUG]', ...args);
            }
        },

        trace(...args) {
            if (this.isEnabled) {
                console.trace('[TRACE]', ...args);
            }
        }
    };

    window.Logger = Logger;
})(window);
