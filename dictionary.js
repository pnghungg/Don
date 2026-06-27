/******************************************************
 * lib/dictionary.js
 * Load Dictionary từ Sheet + thay thế từ trong message
 * (tương đương loadDictionary()/replaceDictionary() trong Utils.gs)
 ******************************************************/

import { getValues } from "./sheet.js";
import { cacheGet, cachePut } from "./cache.js";

const CACHE_KEY = "dictionary";
const CACHE_TTL = 600; // 10 phút — giống bản gốc

export async function loadDictionary(config) {
  const cached = await cacheGet(CACHE_KEY);
  if (cached) return cached;

  const rows = await getValues(config, config.SHEET_DICTIONARY, 2);

  const dict = {};

  rows.forEach((row) => {
    const key = String(row[0] || "").trim().toLowerCase();
    const value = String(row[1] || "").trim();
    if (key) dict[key] = value;
  });

  await cachePut(CACHE_KEY, dict, CACHE_TTL);

  return dict;
}

export async function replaceDictionary(config, text) {
  if (!text) return "";

  let result = text;
  const dict = await loadDictionary(config);

  Object.keys(dict).forEach((key) => {
    const reg = new RegExp(key, "gi");
    result = result.replace(reg, dict[key]);
  });

  return result;
}
