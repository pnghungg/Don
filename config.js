/******************************************************
 * lib/config.js
 * Cấu hình hệ thống — tương đương Config.gs
 *
 * FIX #4 — BANK_ID, ACCOUNT_NUMBER, ACCOUNT_NAME đọc từ
 *           env (Cloudflare Secret / Var), fallback về
 *           hardcode để backward-compatible.
 ******************************************************/

export function getConfig(env) {
  return {
    // ===========================
    // Google Sheet
    // ===========================
    SHEET_ID:           env.SPREADSHEET_ID,
    SHEET_DONATE:       "Donate",
    SHEET_SETTINGS:     "Settings",
    SHEET_DICTIONARY:   "Dictionary",
    SHEET_FILTERWORDS:  "FilterWords",
    SHEET_LOG:          "Logs",

    // ===========================
    // VietQR — FIX #4: đọc từ env, fallback hardcode
    // ===========================
    BANK_ID:        env.BANK_ID         || "VCB",
    ACCOUNT_NUMBER: env.ACCOUNT_NUMBER  || "1048883539",
    ACCOUNT_NAME:   env.ACCOUNT_NAME    || "TRẦN THỊ MINH LY",
    QR_STYLE:       env.QR_STYLE        || "compact2",
    QR_EXPIRE_MINUTES: Number(env.QR_EXPIRE_MINUTES) || 30,

    // ===========================
    // Donate
    // ===========================
    CODE_PREFIX: env.CODE_PREFIX || "HZ",

    // ===========================
    // Turnstile — FIX #6
    // ===========================
    TURNSTILE_SECRET:  env.TURNSTILE_SECRET  || "",
    TURNSTILE_ENABLED: env.TURNSTILE_ENABLED !== "false", // default true

    // ===========================
    // Shortcut
    // ===========================
    AUTO_MARK_READ: true,

    // ===========================
    // Log
    // ===========================
    DEBUG: env.DEBUG !== "false", // default true

    // ===========================
    // Google Service Account (Cloudflare Secrets)
    // ===========================
    GOOGLE_CLIENT_EMAIL: env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY:  env.GOOGLE_PRIVATE_KEY,
    GOOGLE_PROJECT_ID:   env.GOOGLE_PROJECT_ID
  };
}

/******************************************************
 * Donate Status
 ******************************************************/
export const STATUS = {
  PENDING: "pending",
  READ:    "read",
  EXPIRED: "expired"
};

/******************************************************
 * Dictionary mặc định (seed dữ liệu tham khảo)
 ******************************************************/
export const DEFAULT_DICTIONARY = {
  xuxu: "Xu Xu",
  hzz:  "Hà Zú Zú"
};

/******************************************************
 * Version
 ******************************************************/
export const VERSION = "1.1.0";
