// GET /api/products — het actuele assortiment met prijzen en voorraad voor de webshop.
const { connect } = require("../lib/store");
const { json } = require("../lib/http");
const shop = require("../lib/shop");

exports.handler = async (event) => {
  connect(event);
  if (event.httpMethod !== "GET") return json(405, { error: "Alleen GET" });
  try {
    return json(200, { products: await shop.publicProducts(), onlinePayments: shop.onlinePaymentsEnabled() });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Assortiment kon niet worden geladen." });
  }
};
