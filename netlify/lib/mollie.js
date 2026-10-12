// Koppeling met Mollie (iDEAL, creditcard, Bancontact).
const API = "https://api.mollie.com/v2/payments";

function headers() {
  return { Authorization: "Bearer " + process.env.MOLLIE_API_KEY, "Content-Type": "application/json" };
}

async function createPayment(order, siteUrl) {
  const body = {
    amount: { currency: "EUR", value: order.total.toFixed(2) },
    description: "WorldWideWine.nl bestelling " + order.number,
    redirectUrl: siteUrl + "/bedankt.html",
    locale: "nl_NL",
    metadata: { orderNumber: order.number }
  };
  // Mollie accepteert alleen een openbaar bereikbare webhook (dus niet lokaal).
  if (/^https:\/\//.test(siteUrl)) body.webhookUrl = siteUrl + "/api/mollie-webhook";
  const res = await fetch(API, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const payment = await res.json().catch(() => ({}));
  if (!res.ok || !payment._links || !payment._links.checkout) {
    console.error("Mollie fout", res.status, payment && payment.detail);
    throw new Error("Betaling kon niet worden gestart.");
  }
  return { id: payment.id, checkoutUrl: payment._links.checkout.href };
}

async function getPayment(id) {
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) throw new Error("Ongeldige betaling.");
  const res = await fetch(API + "/" + id, { headers: headers() });
  if (!res.ok) throw new Error("Mollie status onbekend.");
  return res.json();
}

function toStatus(mollieStatus) {
  if (mollieStatus === "paid") return "betaald";
  if (["failed", "canceled", "expired"].indexOf(mollieStatus) >= 0) return "mislukt";
  return "open";
}

module.exports = { createPayment, getPayment, toStatus };
