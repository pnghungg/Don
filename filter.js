/******************************************************
 * lib/filter.js
 * Lọc từ cấm (FilterWords) + chống spam ký tự lặp
 * (tương đương loadFilterWords()/filterWords()/removeSpamChars()
 *  trong Utils.gs)
 ******************************************************/

import { getValues } from "./sheet.js";
import { cacheGet, cachePut } from "./cache.js";

const CACHE_KEY = "filterwords";
const CACHE_TTL = 600; // 10 phút — giống bản gốc

export async function loadFilterWords(config) {
  const cached = await cacheGet(CACHE_KEY);
  if (cached) return cached;

  const rows = await getValues(config, config.SHEET_FILTERWORDS, 1);

  const words = rows
    .map((row) => row[0])
    .filter(Boolean)
    .map(String);

  await cachePut(CACHE_KEY, words, CACHE_TTL);

  return words;
}

export async function filterWords(config, text) {
  if (!text) return "";

  let result = text;
  const words = await loadFilterWords(config);

  words.forEach((word) => {
    const reg = new RegExp(
      word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi"
    );
    result = result.replace(reg, "**");
  });

  return result;
}

export function removeSpamChars(text) {
  if (!text) return "";
  return text.replace(/(.)\1{3,}/g, "$1$1$1");
}
