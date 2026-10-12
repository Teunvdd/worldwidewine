// GET /api/payment-status?order=WWW-... — betaalstatus voor de bedankpagina.
const { connect } = require("../lib/store");
const { json } = require("../lib/http");
const shop = require("../lib/shop");
const mollie = require("../lib/mollie");

exports.handler = async (event) => {
  connect(event);
  const number = String((event.queryStringParameters || {}).order || "");
  if (!/^WWW-\d{6}-[A-Z0-9]{4}$/.test(number)) return json(400, { error: "Ongeldig ordernummer." });
  try {
    let order = await shop.getOrder(number);
    if (!order) return json(404, { error: "Onbekende bestelling." });
    if (order.molliePaymentId && order.paymentStatus === "open" && process.env.MOLLIE_API_KEY) {
      const payment = await mollie.getPayment(order.molliePaymentId);
      order = await shop.setPaymentStatus(number, mollie.toStatus(payment.status));
    }
    return json(200, { status: order.paymentStatus });
  } catch (e) {
    console.error(e);
    return json(502, { error: "Status onbekend." });
  }
};
