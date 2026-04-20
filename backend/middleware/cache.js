/**
 * cache.js — Redis-backed route caching with in-memory fallback
 *
 * Usage in routes:
 *   const { cacheMiddleware, invalidateCache } = require('../middleware/cache');
 *   router.get('/heavy-route', cacheMiddleware(120), handler);
 *
 * Redis is used when REDIS_URL is set in .env.
 * Falls back to a simple in-process LRU Map when Redis is unavailable so the
 * server always starts even without Redis.
 *
 * Add to backend/.env (optional):
 *   REDIS_URL=redis://localhost:6379
 */

const REDIS_URL = process.env.REDIS_URL;

// ── In-memory fallback LRU ─────────────────────────────────────────────────
const MAX_MEM_ENTRIES = 500;
const memStore = new Map();   // key → { value, expiresAt }

function memSet(key, value, ttlSeconds) {
  // Evict oldest entry if at capacity
  if (memStore.size >= MAX_MEM_ENTRIES) {
    const firstKey = memStore.keys().next().value;
    memStore.delete(firstKey);
  }
  memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function memGet(key) {
  const entry = memStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { memStore.delete(key); return null; }
  return entry.value;
}

function memDel(pattern) {
  // pattern is a prefix string (e.g. '/api/reports')
  for (const key of memStore.keys()) {
    if (key.startsWith(pattern)) memStore.delete(key);
  }
}

// ── Redis client (optional) ────────────────────────────────────────────────
let redisClient = null;
let redisReady  = false;

if (REDIS_URL) {
  (async () => {
    try {
      // Dynamic import so the server doesn't crash when 'redis' isn't installed
      const { createClient } = await import('redis');
      redisClient = createClient({ url: REDIS_URL });

      redisClient.on('error', err => {
        if (redisReady) console.warn('⚠️  Redis error (falling back to memory):', err.message);
        redisReady = false;
      });

      redisClient.on('ready', () => {
        redisReady = true;
        console.log('✅ Redis connected — route caching enabled');
      });

      await redisClient.connect();
    } catch (err) {
      console.warn('⚠️  Redis not available — using in-memory cache:', err.message);
    }
  })();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function makeCacheKey(req) {
  // Include path + sorted query string so ?a=1&b=2 and ?b=2&a=1 hit same key
  const sorted = new URLSearchParams(
    Object.entries(req.query).sort(([a], [b]) => a.localeCompare(b))
  ).toString();
  // Scope per user role so admin and dept users never share a cache entry
  const scope = req.user ? `${req.user.role}:${req.user.department || 'all'}` : 'anon';
  return `cache:${scope}:${req.path}${sorted ? '?' + sorted : ''}`;
}

async function cacheGet(key) {
  if (redisReady) {
    try {
      const raw = await redisClient.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { /* fallback */ }
  }
  return memGet(key);
}

async function cacheSet(key, value, ttlSeconds) {
  if (redisReady) {
    try {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
      return;
    } catch (_) { /* fallback */ }
  }
  memSet(key, value, ttlSeconds);
}

async function cacheDel(pattern) {
  if (redisReady) {
    try {
      // Use SCAN to safely delete keys matching pattern
      const prefix = `cache:*${pattern}*`;
      let cursor = 0;
      do {
        const result = await redisClient.scan(cursor, { MATCH: prefix, COUNT: 100 });
        cursor = result.cursor;
        if (result.keys.length) await redisClient.del(result.keys);
      } while (cursor !== 0);
      return;
    } catch (_) { /* fallback */ }
  }
  memDel(pattern);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * cacheMiddleware(ttlSeconds)
 * Express middleware that caches GET responses.
 *
 * @param {number} ttl  Time-to-live in seconds (default: 60)
 */
function cacheMiddleware(ttl = 60) {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = makeCacheKey(req);

    try {
      const cached = await cacheGet(key);
      if (cached !== null) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }
    } catch (_) { /* ignore cache read errors */ }

    // Intercept res.json to store response in cache
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      res.setHeader('X-Cache', 'MISS');
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try { await cacheSet(key, body, ttl); } catch (_) {}
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * invalidateCache(pattern)
 * Call after writes to clear cached entries whose keys contain `pattern`.
 *
 * @param {string} pattern  Substring to match against cache keys (e.g. '/reports')
 */
async function invalidateCache(pattern) {
  try { await cacheDel(pattern); } catch (_) {}
}

module.exports = { cacheMiddleware, invalidateCache };
