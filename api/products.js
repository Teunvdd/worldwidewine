// Vercel-serverfunctie: /api/products
const { adapt } = require("../lib/vercel");
module.exports = adapt(require("../lib/handlers/products").handler);
