/******************************************************
 * lib/cache.js
 * Thay thế CacheService.getScriptCache() bằng
 * Cloudflare Cache API (caches.default).
 *
 * Lưu ý: Cache API của Cloudflare là cache theo edge
 * location (không đồng bộ tuyệt đối toàn cầu như
 * CacheService của Apps Script). Với mục đích giảm số
 * lần gọi Google Sheets API (Dictionary/FilterWords/
 * Settings/Donate) thì hoàn toàn phù hợp.
 ******************************************************/

const CACHE_HOST = "https://cache.internal";

function cacheKeyToRequest(key) {
  return new Request(`${CACHE_HOST}/${encodeURIComponent(key)}`);
}

export async function cacheGet(key) {
  try {
    const cache = caches.default;
    const request = cacheKeyToRequest(key);
    const response = await cache.match(request);

    if (!response) return null;

    return await response.json();
  } catch (e) {
    // Cache API có thể không khả dụng trong vài môi trường (ví dụ wrangler dev cũ)
    return null;
  }
}

export async function cachePut(key, value, ttlSeconds) {
  try {
    const cache = caches.default;
    const request = cacheKeyToRequest(key);

    const response = new Response(JSON.stringify(value), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${ttlSeconds}`
      }
    });

    await cache.put(request, response);
  } catch (e) {
    // Bỏ qua nếu cache không khả dụng — chỉ ảnh hưởng hiệu năng, không ảnh hưởng logic
  }
}

export async function cacheDelete(key) {
  try {
    const cache = caches.default;
    const request = cacheKeyToRequest(key);
    await cache.delete(request);
  } catch (e) {
    // ignore
  }
}
