// Vercel-serverfunctie: /api/account
const { adapt } = require("../lib/vercel");
module.exports = adapt(require("../lib/handlers/account").handler);
