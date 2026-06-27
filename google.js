/******************************************************
 * lib/google.js
 * Xác thực Google bằng Service Account (REST)
 *
 * FIX #2 — Retry 3 lần với exponential backoff cho 429/5xx
 ******************************************************/

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

// HTTP status codes đáng retry
const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500; // 500ms → 1000ms → 2000ms

// Cache access token trong bộ nhớ isolate
let cachedToken = null;
let cachedTokenExpiry = 0;

function base64url(input) {
  let base64;

  if (typeof input === "string") {
    base64 = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToBinary(pem) {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "")
    .replace(/\n/g, "")
    .replace(/\s+/g, "");

  const binaryString = atob(clean);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

async function importPrivateKey(pem) {
  const binaryDer = pemToBinary(pem);

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function createSignedJWT(config) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };

  const claimSet = {
    iss: config.GOOGLE_CLIENT_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claimSet));
  const signingInput = `${encodedHeader}.${encodedClaim}`;

  const key = await importPrivateKey(config.GOOGLE_PRIVATE_KEY);

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Lấy Access Token (JWT Bearer flow), có cache
 */
export async function getAccessToken(config) {
  const now = Date.now();

  if (cachedToken && now < cachedTokenExpiry) {
    return cachedToken;
  }

  const jwt = await createSignedJWT(config);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=" +
      encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" +
      encodeURIComponent(jwt)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Không lấy được Google Access Token: " + text);
  }

  const data = await response.json();

  cachedToken = data.access_token;
  cachedTokenExpiry = now + (data.expires_in - 60) * 1000;

  return cachedToken;
}

/**
 * FIX #2 — sheetsFetch với retry 3 lần + exponential backoff
 */
async function sheetsFetchOnce(config, path, options = {}) {
  const token = await getAccessToken(config);
  const url = `${SHEETS_API}/${config.SHEET_ID}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Google Sheets API lỗi (${response.status}): ${text}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

export async function sheetsFetch(config, path, options = {}) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await sheetsFetchOnce(config, path, options);
    } catch (err) {
      const isLast = attempt === MAX_RETRIES - 1;

      // Không retry nếu là lần cuối hoặc lỗi không retryable
      if (isLast || !RETRYABLE_STATUS.includes(err.status)) {
        throw err;
      }

      // Force refresh token nếu bị 401
      if (err.status === 401) {
        cachedToken = null;
        cachedTokenExpiry = 0;
      }

      // Exponential backoff: 500ms, 1000ms, 2000ms
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(
        `[sheetsFetch] lỗi ${err.status}, thử lại lần ${attempt + 1}/${MAX_RETRIES - 1} sau ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
