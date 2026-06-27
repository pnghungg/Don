/******************************************************
 * lib/utils.js
 * Hàm tiện ích chung — tương đương Utils.gs
 ******************************************************/

import { getValues, appendRow, updateCell } from "./sheet.js";
import { cacheGet, cachePut, cacheDelete } from "./cache.js";

// Giới hạn độ dài (giữ nguyên như bản GAS gốc)
const MAX_NAME_LENGTH    = 30;
const MAX_MESSAGE_LENGTH = 300;

/******************************************************
 * JSON API Response
 ******************************************************/
export function api(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

/******************************************************
 * Kết quả trả về
 ******************************************************/
export function result(success, data, error) {
  return {
    success: success,
    data: data || null,
    error: error || ""
  };
}

/******************************************************
 * Sinh ID — VD: HZ8A21F93C
 ******************************************************/
export function createId(config) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return config.CODE_PREFIX + hex.substring(0, 10);
}

/******************************************************
 * QR — VietQR
 ******************************************************/
export function buildQR(config, id, amount) {
  let url =
    "https://img.vietqr.io/image/" +
    config.BANK_ID +
    "-" +
    config.ACCOUNT_NUMBER +
    "-" +
    config.QR_STYLE +
    ".png?addInfo=" +
    encodeURIComponent(id);

  if (Number(amount) > 0) {
    url += "&amount=" + amount;
  }

  return url;
}

/******************************************************
 * FIX #1 — Validation: giới hạn độ dài name/message
 ******************************************************/
export function cleanName(name) {
  if (!name) return "";
  return name.trim().replace(/\s+/g, " ").substring(0, MAX_NAME_LENGTH);
}

export function cleanMessage(msg) {
  if (!msg) return "";
  return msg.trim().substring(0, MAX_MESSAGE_LENGTH);
}

export function cleanAmount(amount) {
  const n = Number(String(amount).replace(/[^\d]/g, ""));
  return isNaN(n) ? 0 : n;
}

/******************************************************
 * Expired
 ******************************************************/
export function isExpired(config, created) {
  return (
    Date.now() - new Date(created).getTime() >
    config.QR_EXPIRE_MINUTES * 60 * 1000
  );
}

/******************************************************
 * Find Donate (cache 5 phút)
 ******************************************************/
export async function findDonate(config, id) {
  const cacheKey = "donate_" + id;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const rows = await getValues(config, config.SHEET_DONATE, 7);

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] == id) {
      const donate = {
        row: i + 2,
        id: rows[i][0],
        name: rows[i][1],
        message: rows[i][2],
        amount: rows[i][3],
        created: rows[i][4],
        status: rows[i][5],
        voice: rows[i][6]
      };

      await cachePut(cacheKey, donate, 300);
      return donate;
    }
  }

  return null;
}

/******************************************************
 * Update Status
 ******************************************************/
export async function setStatus(config, row, status, id) {
  await updateCell(config, config.SHEET_DONATE, row, 6, status);
  await cacheDelete("donate_" + id);
}

/******************************************************
 * Log
 ******************************************************/
export async function addLog(config, action, detail) {
  if (!config.DEBUG) return;

  try {
    await appendRow(config, config.SHEET_LOG, [
      new Date().toISOString(),
      action,
      detail
    ]);
  } catch (e) {
    console.error("addLog error:", e);
  }
}

/******************************************************
 * Read Setting (cache 10 phút)
 ******************************************************/
export async function getSetting(config, key) {
  const cacheKey = "settings";
  let settings = await cacheGet(cacheKey);

  if (!settings) {
    const rows = await getValues(config, config.SHEET_SETTINGS, 2);

    settings = {};
    rows.forEach((row) => {
      settings[String(row[0])] = row[1];
    });

    await cachePut(cacheKey, settings, 600);
  }

  return settings[key] !== undefined ? settings[key] : "";
}
