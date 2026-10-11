// Geeft de status van een Mollie-betaling terug (voor de bedankpagina).
const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return json(503, { error: "Online betalen is nog niet ingesteld." });

  const id = String((event.queryStringParameters || {}).id || "");
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) return json(400, { error: "Ongeldige betaling." });

  const res = await fetch("https://api.mollie.com/v2/payments/" + id, {
    headers: { Authorization: "Bearer " + apiKey }
  });
  if (!res.ok) return json(502, { error: "Status onbekend." });
  const payment = await res.json();
  return json(200, { status: payment.status });
};
