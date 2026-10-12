// Vercel-serverfunctie: /api/shop-info
const { adapt } = require("../lib/vercel");
module.exports = adapt(require("../lib/handlers/shop-info").handler);
