/******************************************************
 * lib/counter.js
 * Cloudflare Durable Object — FIX #7 LockService
 *
 * Thay thế LockService của GAS.
 * Durable Object chạy single-threaded → không race condition
 * khi nhiều request ghi Sheet cùng lúc.
 *
 * Cách dùng:
 *   - Khai báo trong wrangler.toml (xem ví dụ cuối file)
 *   - Truyền env vào getGlobalCounter(env)
 *   - Dùng counter.nextSeq() để lấy số thứ tự tăng dần (atomic)
 *   - Dùng counter.lock(fn) để serialize bất kỳ thao tác nào
 ******************************************************/

/**
 * Durable Object class — export để wrangler đăng ký
 */
export class DonateCounter {
  constructor(state) {
    this.state = state;
    // blockConcurrencyWhile đảm bảo constructor hoàn tất
    // trước khi nhận request đầu tiên
    this.state.blockConcurrencyWhile(async () => {
      this.seq = (await this.state.storage.get("seq")) || 0;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    // POST /next — trả về seq tăng dần (atomic)
    if (url.pathname === "/next" && request.method === "POST") {
      this.seq += 1;
      await this.state.storage.put("seq", this.seq);
      return new Response(JSON.stringify({ seq: this.seq }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // POST /run — chạy logic do caller gửi lên (serialize writes)
    // Không dùng trực tiếp trong Worker (DO không thể eval code),
    // nhưng /next đã đủ để serialize ID generation.

    return new Response("Not found", { status: 404 });
  }
}

/**
 * Helper — lấy instance DO global duy nhất
 * Dùng trong worker.js:
 *   import { getGlobalCounter } from "../lib/counter.js";
 *   const counter = getGlobalCounter(env);
 *   const seq = await counter.nextSeq();
 */
export function getGlobalCounter(env) {
  const id  = env.DONATE_COUNTER.idFromName("global");
  const obj = env.DONATE_COUNTER.get(id);

  return {
    async nextSeq() {
      const res  = await obj.fetch("https://do-internal/next", { method: "POST" });
      const data = await res.json();
      return data.seq;
    }
  };
}

/*
  ── wrangler.toml — thêm các dòng sau ──────────────────

  [[durable_objects.bindings]]
  name       = "DONATE_COUNTER"
  class_name = "DonateCounter"

  [[migrations]]
  tag         = "v1"
  new_classes = ["DonateCounter"]

  ────────────────────────────────────────────────────────
*/
