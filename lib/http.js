// Kleine hulpfuncties voor de serverfuncties.
function json(statusCode, body, headers) {
  return {
    statusCode,
    headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, headers || {}),
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function cookies(event) {
  const header = (event.headers && (event.headers.cookie || event.headers.Cookie)) || "";
  const out = {};
  header.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

// Het adres van de site, bijv. voor de terugkeer na een Mollie-betaling.
// SITE_URL (aanbevolen), anders het productie-adres van Vercel, anders het adres van het verzoek.
function siteUrl(event) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "");
  const h = (event && event.headers) || {};
  return (h["x-forwarded-proto"] || "http") + "://" + (h["x-forwarded-host"] || h.host || "localhost");
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function str(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 200); }

module.exports = { json, parseBody, cookies, siteUrl, HttpError, str };
