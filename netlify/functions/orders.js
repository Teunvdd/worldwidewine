// POST /api/orders — een webshopbestelling plaatsen (en eventueel een Mollie-betaling starten).
const { connect } = require("../lib/store");
const { json, parseBody, siteUrl } = require("../lib/http");
const shop = require("../lib/shop");
const mollie = require("../lib/mollie");

exports.handler = async (event) => {
  connect(event);
  if (event.httpMethod !== "POST") return json(405, { error: "Alleen POST" });
  const input = parseBody(event);
  if (!input) return json(400, { error: "Ongeldige aanvraag." });

  let order;
  try {
    order = await shop.createWebOrder(input);
  } catch (e) {
    if (e.status) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: "De bestelling kon niet worden opgeslagen. Probeer het opnieuw of neem contact met ons op." });
  }

  const out = { number: order.number, total: order.total };
  if (order.paymentMethod === "online") {
    try {
      const payment = await mollie.createPayment(order, siteUrl(event));
      await shop.setPaymentStatus(order.number, "open", payment.id);
      out.checkoutUrl = payment.checkoutUrl;
    } catch (e) {
      console.error(e);
      out.paymentFailed = true; // bestelling staat er wel; klant krijgt een betaalverzoek
    }
  }
  return json(200, out);
};
