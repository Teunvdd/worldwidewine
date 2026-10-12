// GET /api/news — gepubliceerde nieuwsberichten voor de website.
const { json } = require("../http");
const news = require("../news");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Alleen GET" });
  try {
    return json(200, { news: await news.publicNews() });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: e.status ? e.message : "Nieuws kon niet worden geladen." });
  }
};
