export function kvHelper(kv, ttl, log = console.warn) {
    return {
      async get(key, type = "text") {
        try { return await kv.get(key, type); }
        catch (e) { log(`[KV WARN] ${e.message}`); }
      },
      put(key, val) {
        return kv.put(key, val, { expirationTtl: ttl })
                 .catch(e => log(`[KV WARN] ${e.message}`));
      }
    };
  }
  