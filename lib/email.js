// E-mails via Resend (https://resend.com): een melding naar de winkel bij elke webshopbestelling
// en een bevestiging naar de klant.
//
// Instellingen (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY   de API-sleutel van Resend (zonder sleutel worden er geen e-mails verstuurd)
//   MAIL_FROM        afzender, bijv. "worldwidewine.nl <bestellingen@worldwidewine.nl>"
//                    (het domein moet in Resend geverifieerd zijn)
//   SHOP_EMAIL       ontvanger van de bestelmeldingen (standaard info@worldwidewine.nl)
const CONFIG = require("../public/data/config.js");

const PAYMENT = { online: "Online betaald (iDEAL/creditcard)", "bij-afhalen": "Betalen bij afhalen", betaalverzoek: "Betaalverzoek per e-mail" };

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euro = (n) => "€ " + Number(n || 0).toFixed(2).replace(".", ",");

function enabled() { return !!process.env.RESEND_API_KEY; }

async function send(to, subject, html, replyTo) {
  if (!enabled()) return { skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || "worldwidewine.nl <onboarding@resend.dev>",
      to: Array.isArray(to) ? to : [to], subject, html, reply_to: replyTo || undefined
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error("E-mail versturen mislukt (" + res.status + "): " + detail.slice(0, 200));
  }
  return res.json();
}

function linesTable(o) {
  return "<table cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%;font-size:14px'>" +
    o.lines.map((l) => "<tr><td style='border-bottom:1px solid #eee'>" + l.qty + " × " + esc(l.name) + (l.box ? " (" + esc(l.unit) + ")" : "") + "</td><td align='right' style='border-bottom:1px solid #eee;white-space:nowrap'>" + euro(l.total) + "</td></tr>").join("") +
    "<tr><td>Verzending</td><td align='right'>" + (o.shipping ? euro(o.shipping) : "gratis") + "</td></tr>" +
    "<tr><td><strong>Totaal (incl. btw)</strong></td><td align='right'><strong>" + euro(o.total) + "</strong></td></tr></table>";
}

function layout(title, body) {
  return "<div style='font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f1a17'>" +
    "<p style='font-size:22px;font-weight:bold;margin:0 0 4px'><span style='color:#ce542b'>w</span><span style='color:#e59b78'>orld</span><span style='color:#ce542b'>w</span><span style='color:#e59b78'>ide</span><span style='color:#ce542b'>w</span><span style='color:#e59b78'>ine</span><span style='color:#ce542b'>.nl</span></p>" +
    "<p style='font-size:10px;letter-spacing:3px;margin:0 0 24px'>DRANKEN EN CULINAIRE PROJECTEN</p>" +
    "<h2 style='font-size:18px'>" + esc(title) + "</h2>" + body +
    "<p style='font-size:12px;color:#6e625c;margin-top:28px'>worldwidewine.nl · Westzijde 358, 1506 GK Zaandam · 06 83 17 27 04 · info@worldwidewine.nl<br>Geen 18, geen alcohol.</p></div>";
}

const momentLabel = (o) => (o.delivery && o.delivery.indexOf("afhalen") === 0 ? "Afhaalmoment" : "Bezorgmoment");

function nextSteps(o) {
  const pickup = o.delivery && o.delivery.indexOf("afhalen") === 0;
  if (o.paymentMethod === "betaalverzoek") return "Je ontvangt van ons een betaalverzoek. Na betaling maken we je bestelling klaar" + (pickup ? " om af te halen." : " voor levering.");
  if (o.paymentMethod === "bij-afhalen") return "Je betaalt bij het afhalen met pin of contant. We laten je weten wanneer je bestelling klaarstaat.";
  return "Zodra je betaling binnen is, maken we je bestelling klaar" + (pickup ? " om af te halen." : " voor levering.");
}

// Verstuurt beide e-mails. Fouten worden gelogd maar laten de bestelling niet mislukken.
async function orderPlaced(o) {
  if (!enabled()) return;
  const c = o.customer || {};
  const shopTo = process.env.SHOP_EMAIL || CONFIG.email;
  const address = c.address ? esc(c.address) + "<br>" + esc(c.postcode) + " " + esc(c.city) : "";
  const jobs = [
    send(shopTo, "Nieuwe bestelling " + o.number + " — " + euro(o.total),
      layout("Nieuwe webshopbestelling " + o.number,
        "<p><strong>" + esc(c.name) + "</strong><br><a href='mailto:" + esc(c.email) + "'>" + esc(c.email) + "</a><br>" + esc(c.phone) + (address ? "<br>" + address : "") + "</p>" +
        "<p><strong>" + esc(o.deliveryLabel) + "</strong><br>" + esc(PAYMENT[o.paymentMethod] || o.paymentMethod) +
        (o.pickupMoment ? "<br>" + momentLabel(o) + ": " + esc(o.pickupMoment) : "") + (o.notes ? "<br>Opmerking: " + esc(o.notes) : "") + "</p>" +
        linesTable(o) + "<p>Bekijk en verwerk de bestelling in de admin.</p>"), c.email),
    send(c.email, "Bedankt voor je bestelling " + o.number,
      layout("Bedankt voor je bestelling!",
        "<p>Hoi " + esc((c.name || "").split(" ")[0]) + ",</p><p>We hebben je bestelling <strong>" + esc(o.number) + "</strong> goed ontvangen.</p>" +
        linesTable(o) +
        "<p><strong>" + esc(o.deliveryLabel) + "</strong>" + (o.pickupMoment ? "<br>" + momentLabel(o) + ": " + esc(o.pickupMoment) : "") +
          (address && o.delivery && o.delivery.indexOf("afhalen") !== 0 ? "<br>" + address : "") + "</p>" +
        "<p>" + esc(nextSteps(o)) + "</p><p>Vragen? Beantwoord gewoon deze e-mail of bel 06 83 17 27 04.</p><p>Proost!<br>worldwidewine.nl</p>"), shopTo)
  ];
  const results = await Promise.allSettled(jobs);
  results.forEach((r) => { if (r.status === "rejected") console.error(r.reason); });
}

module.exports = { orderPlaced, enabled, send, layout, esc };
