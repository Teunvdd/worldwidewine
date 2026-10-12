// Vercel-serverfunctie: /api/orders
const { adapt } = require("../lib/vercel");
module.exports = adapt(require("../lib/handlers/orders").handler);
