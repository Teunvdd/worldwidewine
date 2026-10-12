// /api/admin/* — alles voor de admin-omgeving en de kassa. Alleen na inloggen.
const { connect } = require("../lib/store");
const { json, parseBody, HttpError } = require("../lib/http");
const auth = require("../lib/auth");
const shop = require("../lib/shop");

function route(event) {
  const p = (event.path || "").replace(/^.*?\/admin\/?/, "");
  return p.split("/").filter(Boolean).map(decodeURIComponent);
}

function csv(rows) {
  const cell = (v) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@]/.test(s)) s = "'" + s; // geen formules uit klantinvoer
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // Puntkomma en komma als decimaalteken: opent direct goed in Nederlandse Excel.
  return "﻿" + rows.map((r) => r.map((v) => cell(typeof v === "number" ? String(v).replace(".", ",") : v)).join(";")).join("\r\n");
}

async function handle(event) {
  const [resource, id, action] = route(event);
  const method = event.httpMethod;
  const body = method === "GET" || method === "DELETE" ? {} : parseBody(event);
  if (body === null) throw new HttpError(400, "Ongeldige aanvraag.");

  // ---- Sessie ----
  if (resource === "login" && method === "POST") {
    if (!auth.configured()) throw new HttpError(503, "Stel eerst ADMIN_PASSWORD in bij de hosting (zie README).");
    if (!auth.checkPassword(body.password || "")) {
      await new Promise((r) => setTimeout(r, 800));
      throw new HttpError(401, "Onjuist wachtwoord.");
    }
    return json(200, { ok: true }, { "Set-Cookie": auth.createSession(event) });
  }
  if (resource === "logout") return json(200, { ok: true }, { "Set-Cookie": auth.clearSession(event) });
  if (resource === "session") return json(200, { loggedIn: auth.isLoggedIn(event), configured: auth.configured() });

  if (!auth.isLoggedIn(event)) throw new HttpError(401, "Log opnieuw in.");
  // Extra bescherming tegen verzoeken vanaf andere websites.
  const h = event.headers || {};
  if (method !== "GET" && (h["x-www-admin"] || h["X-WWW-Admin"]) !== "1") throw new HttpError(403, "Niet toegestaan.");

  switch (resource) {
    case "dashboard":
      return json(200, await shop.dashboard());

    case "products":
      if (method === "GET") return json(200, { products: await shop.getProducts(), types: shop.TYPES });
      if (method === "POST") return json(200, { product: await shop.saveProduct(body) });
      if (method === "DELETE" && id) { await shop.deleteProduct(id); return json(200, { ok: true }); }
      break;

    case "stock":
      if (method === "GET" && id === "log") return json(200, { log: await shop.stockLog(3) });
      if (method === "POST") {
        const changes = (Array.isArray(body.changes) ? body.changes : []).slice(0, 500);
        if (!changes.length) throw new HttpError(400, "Geen wijzigingen.");
        const reason = String(body.reason || "Correctie").slice(0, 100);
        return json(200, { moves: await shop.changeStock(changes, reason, String(body.ref || "").slice(0, 60) || null) });
      }
      break;

    case "customers":
      if (method === "GET") {
        const [customers, orders] = await Promise.all([shop.getCustomers(), shop.listOrders(24)]);
        const stats = {};
        orders.forEach((o) => {
          if (!o.customerId || o.status === "geannuleerd") return;
          const s = stats[o.customerId] = stats[o.customerId] || { orders: 0, spent: 0, last: null };
          s.orders++; s.spent = Math.round((s.spent + o.total) * 100) / 100;
          if (!s.last || o.createdAt > s.last) s.last = o.createdAt;
        });
        return json(200, { customers: customers.map((c) => Object.assign({}, c, { stats: stats[c.id] || { orders: 0, spent: 0, last: null } })) });
      }
      if (method === "POST") return json(200, { customer: await shop.saveCustomer(body) });
      if (method === "DELETE" && id) { await shop.deleteCustomer(id); return json(200, { ok: true }); }
      break;

    case "orders":
      if (method === "GET" && !id) {
        const months = Math.min(24, Math.max(1, Number((event.queryStringParameters || {}).months) || 3));
        return json(200, { orders: await shop.listOrders(months) });
      }
      if (method === "GET" && id) {
        const order = await shop.getOrder(id);
        if (!order) throw new HttpError(404, "Bestelling niet gevonden.");
        return json(200, { order });
      }
      if (method === "POST" && id && action === "status") {
        return json(200, { order: await shop.setOrderStatus(id, body.status, body.note) });
      }
      break;

    case "pos":
      if (method === "POST") return json(200, await shop.createPosSale(body));
      break;

    case "export":
      if (method === "GET" && id === "orders") {
        const months = Math.min(24, Math.max(1, Number((event.queryStringParameters || {}).months) || 12));
        const orders = await shop.listOrders(months);
        const rows = [["Datum", "Nummer", "Kanaal", "Status", "Betaalwijze", "Klant", "E-mail", "Subtotaal", "Korting", "Verzending", "Totaal", "Btw 21%", "Btw 9%"]];
        orders.forEach((o) => {
          const v = (r) => ((o.vat || []).find((x) => x.rate === r) || { vat: 0 }).vat;
          rows.push([new Date(o.createdAt).toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" }).slice(0, 16), o.number, o.channel, o.status, shop.PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod,
            (o.customer && o.customer.name) || "", (o.customer && o.customer.email) || "", o.subtotal, o.discount || 0, o.shipping || 0, o.total, v(21), v(9)]);
        });
        return {
          statusCode: 200,
          headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bestellingen.csv"', "Cache-Control": "no-store" },
          body: csv(rows)
        };
      }
      break;
  }
  throw new HttpError(404, "Onbekende actie.");
}

exports.handler = async (event) => {
  connect(event);
  try {
    return await handle(event);
  } catch (e) {
    if (e.status) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: e.message || "Er ging iets mis." });
  }
};
