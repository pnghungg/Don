/******************************************************
 * lib/sheet.js
 * Thao tác đọc / ghi Google Sheet qua REST API
 * (thay thế cho donateSheet()/settingsSheet()/...
 *  getRange()/getValues()/appendRow()/setValue() của Apps Script)
 ******************************************************/

import { sheetsFetch } from "./google.js";

function columnLetter(col) {
  let letter = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

/**
 * Đọc toàn bộ dữ liệu (từ dòng 2, tức bỏ qua header) của 1 sheet.
 * numCols: số cột cần đọc (giống getRange(2,1,lastRow-1,numCols))
 */
export async function getValues(config, sheetName, numCols, maxRows = 20000) {
  const range = `A2:${columnLetter(numCols)}${maxRows + 1}`;
  const path = `/values/${encodeURIComponent(
    sheetName + "!" + range
  )}?valueRenderOption=UNFORMATTED_VALUE`;

  const data = await sheetsFetch(config, path, { method: "GET" });

  return data.values || [];
}

/**
 * Thêm 1 dòng vào cuối sheet (giống sheet.appendRow([...]))
 */
export async function appendRow(config, sheetName, row) {
  const path = `/values/${encodeURIComponent(
    sheetName + "!A1"
  )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  return sheetsFetch(config, path, {
    method: "POST",
    body: JSON.stringify({ values: [row] })
  });
}

/**
 * Cập nhật 1 ô (row, col đều bắt đầu từ 1)
 * Giống sheet.getRange(row,col).setValue(value)
 */
export async function updateCell(config, sheetName, row, col, value) {
  const cell = `${columnLetter(col)}${row}`;
  const path = `/values/${encodeURIComponent(
    sheetName + "!" + cell
  )}?valueInputOption=USER_ENTERED`;

  return sheetsFetch(config, path, {
    method: "PUT",
    body: JSON.stringify({ values: [[value]] })
  });
}
