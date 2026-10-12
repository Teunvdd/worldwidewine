// Vercel-serverfunctie: /api/admin/* (alles voor de admin en de kassa).
// vercel.json stuurt /api/admin/<pad> hierheen als /api/admin?path=<pad>.
const { adapt } = require("../lib/vercel");
module.exports = adapt(require("../lib/handlers/admin").handler);
