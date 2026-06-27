/******************************************************
 * script.js
 * Donate Xu Xu — Frontend (Cloudflare Pages)
 *
 * FIX #1 — Validate độ dài name/message trước khi gửi
 * FIX #5 — Thêm timeout 15s + AbortController
 * FIX #6 — Gửi cf-turnstile-response nếu Turnstile bật
 ******************************************************/

const API_BASE = "";

// FIX #1 — Giới hạn khớp với server (utils.js / worker.js)
const MAX_NAME_LENGTH    = 30;
const MAX_MESSAGE_LENGTH = 300;

// FIX #5 — Timeout fetch (ms)
const FETCH_TIMEOUT_MS = 15000;

function createQR() {
  const name    = document.getElementById("name").value.trim();
  const message = document.getElementById("message").value.trim();
  const amount  = document.getElementById("amount").value.trim();

  // FIX #1 — Validate phía client trước khi gửi
  if (name === "") {
    alert("Vui lòng nhập tên.");
    return;
  }
  if (name.length > MAX_NAME_LENGTH) {
    alert(`Tên tối đa ${MAX_NAME_LENGTH} ký tự (hiện tại: ${name.length}).`);
    return;
  }
  if (message === "") {
    alert("Vui lòng nhập lời nhắn.");
    return;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    alert(`Lời nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự (hiện tại: ${message.length}).`);
    return;
  }

  const btn = document.getElementById("createBtn");
  btn.disabled = true;
  btn.innerHTML = "⏳ Đang tạo QR...";

  // FIX #6 — Đọc Turnstile token nếu widget có trên trang
  const turnstileEl = document.querySelector(".cf-turnstile [name='cf-turnstile-response']")
    || document.querySelector("input[name='cf-turnstile-response']");
  const turnstileToken = turnstileEl ? turnstileEl.value : "";

  // FIX #5 — AbortController để timeout sau FETCH_TIMEOUT_MS
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  fetch(API_BASE + "/api/create", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    signal:  controller.signal,
    body: JSON.stringify({
      name:    name,
      message: message,
      amount:  amount,
      "cf-turnstile-response": turnstileToken
    })
  })
    .then((response) => {
      clearTimeout(timeoutId);
      return response.json();
    })
    .then((res) => showResult(res))
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        showError({ message: "Hết thời gian chờ (15s). Vui lòng kiểm tra mạng và thử lại." });
      } else {
        showError(err);
      }
    });
}

function showResult(res) {
  const btn = document.getElementById("createBtn");
  btn.disabled = false;
  btn.innerHTML = "🎀 TẠO QR";

  console.log("Response:", res);

  if (!res || !res.success) {
    alert(res?.error || "Không thể tạo QR.");
    return;
  }

  const data = res.data;

  console.log("QR URL:", data.qr);

  const img = document.getElementById("qr");

  img.onload = function () {
    console.log("✅ QR tải thành công");
  };

  img.onerror = function (e) {
    console.error("❌ QR tải thất bại", e);
    alert("Không thể tải ảnh QR.\n\n" + data.qr);
  };

  img.src = data.qr + "&t=" + Date.now();

  document.getElementById("code").textContent    = data.id;
  document.getElementById("bank").textContent    = data.bank;
  document.getElementById("account").textContent = data.account;
  document.getElementById("owner").textContent   = data.accountName;
  document.getElementById("expire").textContent  = data.expire + " phút";

  document.getElementById("result").style.display = "block";

  document.getElementById("result").scrollIntoView({ behavior: "smooth" });
}

function showError(err) {
  const btn = document.getElementById("createBtn");
  btn.disabled = false;
  btn.innerHTML = "🎁 TẠO QR";

  alert("Lỗi: " + (err && err.message ? err.message : err));
}

function copyCode() {
  const code = document.getElementById("code").textContent;
  navigator.clipboard.writeText(code).then(() => alert("Đã sao chép mã: " + code));
}

function newDonate() {
  document.getElementById("name").value    = "";
  document.getElementById("message").value = "";
  document.getElementById("amount").value  = "";
  document.getElementById("result").style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createPetal() {
  const p = document.createElement("div");
  p.className = "petal";
  p.innerHTML = Math.random() > 0.5 ? "🌸" : "💮";
  p.style.left              = Math.random() * 100 + "vw";
  p.style.fontSize          = (18 + Math.random() * 16) + "px";
  p.style.animationDuration = (6 + Math.random() * 6) + "s";
  document.querySelector(".petals").appendChild(p);
  setTimeout(() => p.remove(), 12000);
}

setInterval(createPetal, 350);

async function downloadQR() {
  const img = document.getElementById("qr");

  if (!img.src) {
    alert("Chưa có mã QR.");
    return;
  }

  try {
    const response = await fetch(img.src);
    const blob     = await response.blob();
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");

    a.href     = url;
    a.download = "DonateQR.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Không thể tải QR.");
    console.log(err);
  }
}
