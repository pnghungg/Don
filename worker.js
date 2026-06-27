/******************************************************
 * functions/worker.js
 * Cloudflare Worker — Donate System API
 *
 * FIXES áp dụng trong file này:
 *  #1  Validation — kiểm tra độ dài name/message sau clean
 *  #6  Rate Limit  — verify Cloudflare Turnstile trên /api/create
 *  #7  LockService — dùng Durable Object (DonateCounter) để
 *                    serialize ID generation, tránh race condition
 ******************************************************/

import { getConfig, STATUS } from "../lib/config.js";
import { appendRow } from "../lib/sheet.js";
import { getGlobalCounter } from "../lib/counter.js";
import {
  api,
  result,
  createId,
  buildQR,
  cleanName,
  cleanMessage,
  cleanAmount,
  isExpired,
  findDonate,
  setStatus,
  addLog,
  getSetting
} from "../lib/utils.js";
import { replaceDictionary } from "../lib/dictionary.js";
import { filterWords, removeSpamChars } from "../lib/filter.js";

// Giới hạn độ dài — phải khớp với MAX_* trong utils.js
const MAX_NAME_LENGTH    = 30;
const MAX_MESSAGE_LENGTH = 300;

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

/******************************************************
 * FIX #6 — Verify Cloudflare Turnstile token
 ******************************************************/
async function verifyTurnstile(config, token, ip) {
  // Nếu TURNSTILE_ENABLED = false hoặc chưa cấu hình secret → bỏ qua
  if (!config.TURNSTILE_ENABLED || !config.TURNSTILE_SECRET) {
    return true;
  }

  if (!token) return false;

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:
          `secret=${encodeURIComponent(config.TURNSTILE_SECRET)}` +
          `&response=${encodeURIComponent(token)}` +
          (ip ? `&remoteip=${encodeURIComponent(ip)}` : "")
      }
    );
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error("Turnstile verify error:", e);
    return false;
  }
}

/******************************************************
 * POST /api/create
 * Body: { name, message, amount, "cf-turnstile-response"? }
 ******************************************************/
async function handleCreate(request, env, config) {
  try {
    const body = await request.json();

    // FIX #6 — Turnstile verification
    const turnstileToken = body["cf-turnstile-response"] || "";
    const clientIp       = request.headers.get("CF-Connecting-IP") || "";
    const turnstileOk    = await verifyTurnstile(config, turnstileToken, clientIp);

    if (!turnstileOk) {
      return api(result(false, null, "Xác minh bảo mật thất bại. Vui lòng thử lại."));
    }

    // Chuẩn hóa dữ liệu
    let name = cleanName(body.name);
    name = await filterWords(config, name);
    name = removeSpamChars(name);

    let message = await replaceDictionary(config, cleanMessage(body.message));
    message = await filterWords(config, message);
    message = removeSpamChars(message);

    const amount = cleanAmount(body.amount);

    // FIX #1 — Validation đầy đủ (empty + độ dài)
    if (!name) {
      return api(result(false, null, "Vui lòng nhập tên."));
    }
    if (name.length > MAX_NAME_LENGTH) {
      return api(result(false, null, `Tên tối đa ${MAX_NAME_LENGTH} ký tự.`));
    }
    if (!message) {
      return api(result(false, null, "Vui lòng nhập lời nhắn."));
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return api(result(false, null, `Lời nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự.`));
    }

    // FIX #7 — Dùng Durable Object để sinh seq atomic,
    // tránh race condition khi nhiều request đến cùng lúc.
    const counter = getGlobalCounter(env);
    const seq     = await counter.nextSeq();

    // ID = PREFIX + seq (zero-padded 8 chữ số) + 2 hex ngẫu nhiên
    // Đảm bảo unique tuyệt đối ngay cả khi gọi đồng thời
    const randomSuffix = Math.floor(Math.random() * 0xff)
      .toString(16)
      .toUpperCase()
      .padStart(2, "0");
    const id = config.CODE_PREFIX + String(seq).padStart(8, "0") + randomSuffix;

    const qr = buildQR(config, id, amount);

    // Lưu Google Sheet
    await appendRow(config, config.SHEET_DONATE, [
      id,
      name,
      message,
      amount,
      new Date().toISOString(),
      STATUS.PENDING,
      ""
    ]);

    await addLog(config, "CREATE", id);

    return api(
      result(
        true,
        {
          id:          id,
          qr:          qr,
          bank:        config.BANK_ID,
          account:     config.ACCOUNT_NUMBER,
          accountName: config.ACCOUNT_NAME,
          amount:      amount,
          expire:      config.QR_EXPIRE_MINUTES
        },
        ""
      )
    );
  } catch (err) {
    await addLog(config, "CREATE_ERROR", err.toString());
    return api(result(false, null, err.toString()));
  }
}

/******************************************************
 * GET /api/read?id=HZXXXXXXXX
 ******************************************************/
async function handleRead(request, config) {
  try {
    const url = new URL(request.url);
    const id  = (url.searchParams.get("id") || "").trim();

    if (id === "") {
      return api({ success: false, error: "Thiếu ID" });
    }

    const donate = await findDonate(config, id);

    if (!donate) {
      return api({ success: false, error: "Không tìm thấy Donate" });
    }

    if (isExpired(config, donate.created)) {
      await setStatus(config, donate.row, STATUS.EXPIRED, donate.id);
      return api({ success: false, error: "QR đã hết hạn" });
    }

    if (config.AUTO_MARK_READ) {
      await setStatus(config, donate.row, STATUS.READ, donate.id);
    }

    await addLog(config, "READ", donate.id);

    return api({
      success: true,
      id:      donate.id,
      name:    donate.name,
      message: donate.message,
      amount:  donate.amount,
      voice:   donate.voice,
      created: donate.created
    });
  } catch (err) {
    await addLog(config, "READ_ERROR", err.toString());
    return api({ success: false, error: err.toString() });
  }
}

/******************************************************
 * GET /api/status?id=HZXXXXXXXX
 ******************************************************/
async function handleStatus(request, config) {
  try {
    const url = new URL(request.url);
    const id  = (url.searchParams.get("id") || "").trim();

    if (id === "") {
      return api({ success: false, error: "Thiếu ID" });
    }

    const donate = await findDonate(config, id);

    if (!donate) {
      return api({ success: false, error: "Không tìm thấy" });
    }

    return api({
      success: true,
      status:  donate.status,
      created: donate.created
    });
  } catch (err) {
    return api({ success: false, error: err.toString() });
  }
}

/******************************************************
 * GET /api/config
 ******************************************************/
async function handleConfig(config) {
  return api({
    success: true,
    data: {
      bank:        config.BANK_ID,
      account:     config.ACCOUNT_NUMBER,
      accountName: config.ACCOUNT_NAME,
      qrStyle:     config.QR_STYLE,
      expire:      config.QR_EXPIRE_MINUTES,
      codePrefix:  config.CODE_PREFIX
    }
  });
}

/******************************************************
 * GET /api/utils
 ******************************************************/
async function handleUtils(request, config) {
  const url = new URL(request.url);
  const key = url.searchParams.get("setting");

  if (key) {
    const value = await getSetting(config, key);
    return api({ success: true, data: { key, value } });
  }

  return api({ success: true, data: { version: "1.1.0" } });
}

/******************************************************
 * Main fetch handler
 ******************************************************/
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return corsPreflight();
    }

    const url    = new URL(request.url);
    const config = getConfig(env);

    try {
      switch (url.pathname) {
        case "/api/create":
          if (request.method !== "POST") {
            return api({ success: false, error: "Method không hỗ trợ" }, 405);
          }
          // Truyền env vào để handleCreate có thể dùng Durable Object
          return await handleCreate(request, env, config);

        case "/api/read":
          return await handleRead(request, config);

        case "/api/status":
          return await handleStatus(request, config);

        case "/api/config":
          return await handleConfig(config);

        case "/api/utils":
          return await handleUtils(request, config);

        default:
          return api({ success: false, error: "Not Found" }, 404);
      }
    } catch (err) {
      await addLog(config, "WORKER_ERROR", err.toString());
      return api({ success: false, error: err.toString() }, 500);
    }
  },

  // FIX #7 — Export Durable Object class để Cloudflare đăng ký
  DonateCounter: (await import("../lib/counter.js")).DonateCounter
};
