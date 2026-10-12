// Vercel-serverfunctie: /api/news
const { adapt } = require("../lib/vercel");
module.exports = adapt(require("../lib/handlers/news").handler);
