// Koppelt een serverfunctie (event → { statusCode, headers, body }) aan Vercel (req, res).
// Zo blijft de bedrijfslogica los van het hostingplatform.

async function rawBody(req) {
  // Vercel leest de body pas als req.body wordt opgevraagd; de stream is dan nog beschikbaar.
  const chunks = [];
  try { for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk); } catch (e) { /* al gelezen */ }
  if (chunks.length) return Buffer.concat(chunks).toString("utf8");
  if (req.body == null) return "";
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const type = String(req.headers["content-type"] || "");
  return type.indexOf("application/x-www-form-urlencoded") >= 0 ? new URLSearchParams(req.body).toString() : JSON.stringify(req.body);
}

function adapt(handler) {
  return async function (req, res) {
    const url = new URL(req.url, "http://localhost");
    const event = {
      httpMethod: req.method,
      path: url.pathname,
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: req.method === "GET" || req.method === "HEAD" ? "" : await rawBody(req)
    };
    let result;
    try {
      result = await handler(event);
    } catch (e) {
      console.error(e);
      result = { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Er ging iets mis." }) };
    }
    res.statusCode = result.statusCode || 200;
    Object.entries(result.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    res.end(result.body || "");
  };
}

module.exports = { adapt };
