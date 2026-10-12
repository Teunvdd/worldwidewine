// Vercel-serverfunctie: /api/payment-status
const { adapt } = require("../lib/vercel");
module.exports = adapt(require("../lib/handlers/payment-status").handler);
