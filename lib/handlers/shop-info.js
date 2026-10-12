// GET /api/shop-info — openingstijden, afhaal- en bezorgmomenten en bezorggebied voor de website.
const { json } = require("../http");
const shopinfo = require("../shopinfo");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Alleen GET" });
  try {
    return json(200, await shopinfo.publicInfo());
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: e.status ? e.message : "Winkelgegevens konden niet worden geladen." });
  }
};
