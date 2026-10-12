// POST /api/mollie-webhook — Mollie meldt hier een gewijzigde betaalstatus.
const shop = require("../shop");
const mollie = require("../mollie");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString() : event.body || "";
  const id = new URLSearchParams(raw).get("id") || "";
  try {
    // Status altijd zelf bij Mollie opvragen; de inhoud van de melding wordt niet vertrouwd.
    const payment = await mollie.getPayment(id);
    const number = payment.metadata && payment.metadata.orderNumber;
    if (number) await shop.setPaymentStatus(number, mollie.toStatus(payment.status), payment.id);
    return { statusCode: 200, body: "" };
  } catch (e) {
    console.error(e);
    return { statusCode: e.status === 404 ? 200 : 500, body: "" };
  }
};
