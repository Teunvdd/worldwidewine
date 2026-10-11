// Maakt een Mollie-betaling aan. Het bedrag wordt hier opnieuw berekend uit de
// echte prijzen in data/products.js, zodat het niet in de browser te wijzigen is.
const PRODUCTS = require("../../data/products.js");
const CONFIG = require("../../data/config.js");
const { computeOrder } = require("../../data/order.js");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Alleen POST" });

  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return json(503, { error: "Online betalen is nog niet ingesteld." });

  let input;
  try { input = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Ongeldige aanvraag." }); }

  const orderNumber = String(input.orderNumber || "");
  if (!/^WWW-\d{6}-[A-Z0-9]{4}$/.test(orderNumber)) return json(400, { error: "Ongeldig ordernummer." });

  const items = Array.isArray(input.items) ? input.items.slice(0, 100) : [];
  const order = computeOrder(items, String(input.delivery || ""), PRODUCTS, CONFIG);
  if (!order.deliveryKey) order.errors.push("Kies een verzendmethode.");
  if (order.errors.length) return json(400, { error: order.errors.join(" ") });

  const siteUrl = (process.env.URL || "").replace(/\/$/, "");
  const customer = input.customer || {};

  const res = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: order.total.toFixed(2) },
      description: CONFIG.shopName + " bestelling " + orderNumber,
      redirectUrl: siteUrl + "/bedankt.html",
      locale: "nl_NL",
      metadata: {
        orderNumber,
        name: String(customer.name || "").slice(0, 100),
        email: String(customer.email || "").slice(0, 100),
        delivery: order.deliveryKey,
        lines: order.lines.map((l) => l.qty + "x " + l.id).join(", ").slice(0, 900)
      }
    })
  });

  const payment = await res.json().catch(() => ({}));
  if (!res.ok || !payment._links || !payment._links.checkout) {
    console.error("Mollie fout", res.status, payment && payment.detail);
    return json(502, { error: "Betaling kon niet worden gestart." });
  }

  return json(200, { checkoutUrl: payment._links.checkout.href, paymentId: payment.id });
};
