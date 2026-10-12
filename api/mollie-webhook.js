// Vercel-serverfunctie: /api/mollie-webhook
const { adapt } = require("../lib/vercel");
module.exports = adapt(require("../lib/handlers/mollie-webhook").handler);
