// GET /api/products — het actuele assortiment met prijzen en voorraad voor de webshop.
const { json } = require("../http");
const shop = require("../shop");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Alleen GET" });
  try {
    return json(200, { products: await shop.publicProducts(), onlinePayments: shop.onlinePaymentsEnabled() });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: e.status ? e.message : "Assortiment kon niet worden geladen." });
  }
};
