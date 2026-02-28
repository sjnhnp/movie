(function () {
    const originalWarn = console.warn;
    console.warn = function (...args) {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com should not be used in production')) {
            return;
        }
        originalWarn.apply(console, args);
    };
})();
