/**
 * StorageCache - A high-performance wrapper for localStorage with memory caching and debounced persistence.
 * Designed to minimize synchronous disk I/O while maintaining cross-tab consistency.
 */
(function (window) {
    class StorageCache {
        constructor() {
            this.cache = {};
            this.pendingWrites = new Set();
            this.debounceTimer = null;
            this.DEBOUNCE_DELAY = 1000; // 1 second
            this._init();
        }

        /**
         * Initialize the cache by loading all existing localStorage data.
         * Set up listeners for cross-tab synchronization and page unload.
         */
        _init() {
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    this.cache[key] = localStorage.getItem(key);
                }
            } catch (e) {
                if (typeof Logger !== 'undefined') Logger.error('[StorageCache] Initialization failed:', e);
            }

            // Sync with other tabs/windows
            window.addEventListener('storage', (e) => {
                if (e.key === null) {
                    // localStorage.clear() was called in another tab
                    this.cache = {};
                } else {
                    // A specific item was updated or removed in another tab
                    if (e.newValue === null) {
                        delete this.cache[e.key];
                    } else {
                        this.cache[e.key] = e.newValue;
                    }
                }
            });

            // Ensure all pending data is saved when the user leaves the page
            window.addEventListener('beforeunload', () => this.flush());
            window.addEventListener('pagehide', () => this.flush());
        }

        /**
         * Get an item from the memory cache.
         * @param {string} key 
         * @returns {string|null}
         */
        getItem(key) {
            const val = this.cache[key];
            return val !== undefined ? val : null;
        }

        /**
         * Set an item in the memory cache and schedule it for persistence.
         * @param {string} key 
         * @param {any} value 
         * @param {boolean} immediate If true, bypass debounce and save to disk immediately.
         */
        setItem(key, value, immediate = true) {
            const stringValue = String(value);

            // If the value hasn't changed, skip the update
            if (this.cache[key] === stringValue && !this.pendingWrites.has(key)) {
                return;
            }

            this.cache[key] = stringValue;

            if (immediate) {
                try {
                    localStorage.setItem(key, stringValue);
                    this.pendingWrites.delete(key);
                } catch (e) {
                    if (typeof Logger !== 'undefined') Logger.error(`[StorageCache] Immediate write failed for ${key}:`, e);
                }
            } else {
                this.pendingWrites.add(key);
                this._scheduleFlush();
            }
        }

        /**
         * Remove an item from the cache and disk.
         * @param {string} key 
         */
        removeItem(key) {
            delete this.cache[key];
            this.pendingWrites.delete(key);
            try {
                localStorage.removeItem(key);
            } catch (e) {
                if (typeof Logger !== 'undefined') Logger.error(`[StorageCache] Removal failed for ${key}:`, e);
            }
        }

        /**
         * Clear all data from the cache and disk.
         */
        clear() {
            this.cache = {};
            this.pendingWrites.clear();
            try {
                localStorage.clear();
            } catch (e) {
                if (typeof Logger !== 'undefined') Logger.error('[StorageCache] Clear failed:', e);
            }
        }

        /**
         * Schedule a flush operation to move data from memory to disk.
         */
        _scheduleFlush() {
            if (this.debounceTimer) return;
            this.debounceTimer = setTimeout(() => {
                this.flush();
            }, this.DEBOUNCE_DELAY);
        }

        /**
         * Synchronously persist all pending writes to localStorage.
         */
        flush() {
            if (this.pendingWrites.size === 0) return;

            if (typeof Logger !== 'undefined' && this.pendingWrites.size > 1) {
                Logger.debug(`[StorageCache] Persisting ${this.pendingWrites.size} items...`);
            }

            this.pendingWrites.forEach(key => {
                const value = this.cache[key];
                if (value !== undefined) {
                    try {
                        localStorage.setItem(key, value);
                    } catch (e) {
                        if (typeof Logger !== 'undefined') Logger.error(`[StorageCache] Persistence failed for ${key}:`, e);
                    }
                }
            });

            this.pendingWrites.clear();
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = null;
            }
        }

        /**
         * Helper to check if a key exists.
         */
        hasOwnProperty(key) {
            return this.cache[key] !== undefined;
        }

        /**
         * Get the number of stored items.
         */
        get length() {
            return Object.keys(this.cache).length;
        }
    }

    // Expose as a global singleton
    window.AppStorage = new StorageCache();
})(window);
