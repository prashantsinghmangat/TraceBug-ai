const PRICE = 129;

const toast = document.getElementById("toast");
const totalEl = document.getElementById("total");

function money(n) {
  return "$" + n.toFixed(2);
}

function showToast(msg, ok) {
  toast.textContent = msg;
  toast.classList.toggle("ok", !!ok);
  toast.hidden = false;
}

function applyCoupon(code) {
  const coupon = window.COUPONS[code];
  const total = PRICE * (1 - coupon.discount);
  totalEl.textContent = money(total);
  showToast(code + " applied — " + Math.round(coupon.discount * 100) + "% off", true);
}

document.getElementById("applyBtn").addEventListener("click", () => {
  const code = document.getElementById("coupon").value.trim().toUpperCase();
  if (!code) return;
  try {
    applyCoupon(code);
  } catch (err) {
    showToast("Something went wrong applying the coupon.");
    console.error(err);
  }
});

document.getElementById("orderBtn").addEventListener("click", () => {
  showToast("Order placed for " + totalEl.textContent + ". Thank you!", true);
});
