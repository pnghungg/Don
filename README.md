# Donate Xu Xu — Cloudflare Worker + Pages

Hệ thống donate realtime dùng Cloudflare Worker (API) + Cloudflare Pages (frontend) + Google Sheets (database).

---

## Changelog v1.1.0

| # | Vấn đề | Fix |
|---|--------|-----|
| 1 | Validation thiếu giới hạn độ dài | `cleanName` ≤30 ký tự, `cleanMessage` ≤300 ký tự trong `utils.js` + validate phía frontend `script.js` + server double-check trong `worker.js` |
| 2 | Không retry khi Google API lỗi 429/5xx | `sheetsFetch` retry 3 lần, exponential backoff 500ms→1000ms→2000ms trong `google.js` |
| 4 | Bank info hardcode trong code | `BANK_ID`, `ACCOUNT_NUMBER`, `ACCOUNT_NAME` đọc từ `env` (fallback hardcode). Đổi trong `wrangler.toml [vars]` hoặc `wrangler secret put` |
| 5 | `fetch()` frontend không có timeout | `AbortController` + 15s timeout trong `script.js` |
| 6 | Không có Rate Limit | Tích hợp Cloudflare Turnstile (miễn phí). Bật/tắt qua `TURNSTILE_ENABLED` trong `wrangler.toml` |
| 7 | Không có LockService (race condition) | Durable Object `DonateCounter` trong `lib/counter.js` — serialize ID generation, tránh trùng ID khi nhiều request đến cùng lúc |

---

## Cài đặt

### 1. Clone và cài dependencies

```bash
npm install
```

### 2. Upload Secrets

```bash
wrangler secret put SPREADSHEET_ID
wrangler secret put GOOGLE_CLIENT_EMAIL
wrangler secret put GOOGLE_PRIVATE_KEY
wrangler secret put GOOGLE_PROJECT_ID
wrangler secret put TURNSTILE_SECRET      # nếu dùng Turnstile (FIX #6)
```

Đổi thông tin ngân hàng (tùy chọn, FIX #4):
```bash
wrangler secret put ACCOUNT_NUMBER
wrangler secret put ACCOUNT_NAME
wrangler secret put BANK_ID
```

### 3. Cấu hình wrangler.toml

Chỉnh `[vars]` trong `wrangler.toml` cho phù hợp:

```toml
[vars]
BANK_ID           = "VCB"
ACCOUNT_NUMBER    = "1048883539"
ACCOUNT_NAME      = "TRẦN THỊ MINH LY"
TURNSTILE_ENABLED = "true"   # bật Turnstile
```

### 4. Cấu hình Turnstile (FIX #6)

1. Truy cập https://dash.cloudflare.com → Turnstile → Add Site
2. Chọn **Managed** widget, lấy **Site Key** và **Secret Key**
3. Thay `YOUR_TURNSTILE_SITE_KEY` trong `pages/index.html`
4. Upload Secret Key: `wrangler secret put TURNSTILE_SECRET`
5. Đặt `TURNSTILE_ENABLED = "true"` trong `wrangler.toml`

Để tắt Turnstile (ví dụ môi trường dev):
```toml
TURNSTILE_ENABLED = "false"
```

### 5. Durable Object (FIX #7)

Đã cấu hình sẵn trong `wrangler.toml`. Lần đầu deploy sẽ tự tạo migration:

```bash
wrangler deploy
```

### 6. Deploy

```bash
wrangler deploy
```

---

## Cấu trúc file

```
donate-cloudflare/
├── functions/
│   └── worker.js          # Cloudflare Worker (API)
├── lib/
│   ├── cache.js            # Cache helper
│   ├── config.js           # Cấu hình (FIX #4)
│   ├── counter.js          # Durable Object (FIX #7)
│   ├── dictionary.js       # Từ điển thay thế
│   ├── filter.js           # Lọc từ cấm
│   ├── google.js           # Google Sheets API + retry (FIX #2)
│   ├── sheet.js            # Sheet helpers
│   └── utils.js            # Tiện ích + validation (FIX #1)
├── pages/
│   ├── index.html          # Frontend (FIX #6 Turnstile)
│   ├── script.js           # JS frontend (FIX #1 #5 #6)
│   └── style.css
├── .env.example
├── package.json
├── README.md
└── wrangler.toml           # Config (FIX #4 #7)
```

---

## Google Sheet cần có các sheet:

| Sheet | Cột |
|-------|-----|
| Donate | ID, Name, Message, Amount, Created, Status, Voice |
| Settings | Key, Value |
| Dictionary | From, To |
| FilterWords | Word |
| Logs | Time, Action, Detail |
