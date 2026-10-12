// Mijn account: de klant logt in met een eenmalige code die we naar zijn e-mailadres sturen.
// Geen wachtwoorden; de sessie is een ondertekende cookie die 30 dagen geldig is.
const crypto = require("crypto");
const { db, run } = require("./db");
const { HttpError, cookies, str } = require("./http");
const email = require("./email");

const COOKIE = "www_klant";
const DAYS = 30;
const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;     // foute pogingen per code
const MAX_CODES_HOUR = 5;   // codes per e-mailadres per uur

function secret() {
  const base = process.env.CUSTOMER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new HttpError(503, "Inloggen is nog niet beschikbaar.");
  return crypto.createHash("sha256").update("www-klant:" + base).digest();
}
const hmac = (v) => crypto.createHmac("sha256", secret()).update(v).digest("base64url");
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function cleanEmail(v) {
  const e = str(v, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpError(400, "Vul een geldig e-mailadres in.");
  return e;
}

function cookieAttrs(event) {
  const host = (event.headers && event.headers.host) || "";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return "; Path=/; HttpOnly; SameSite=Lax" + (local ? "" : "; Secure");
}

// Stuurt een code van 6 cijfers. Zonder e-maildienst (lokaal testen met WWW_DEV_LOGIN=1) komt de code in het antwoord.
async function requestCode(input) {
  const e = cleanEmail(input.email);
  const dev = process.env.WWW_DEV_LOGIN === "1";
  if (!email.enabled() && !dev) throw new HttpError(503, "Inloggen per e-mail is nog niet beschikbaar. Neem contact met ons op.");
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const recent = await run(db().from("customer_logins").select("id").eq("email", e).gte("created_at", since));
  if (recent.length >= MAX_CODES_HOUR) throw new HttpError(429, "Je hebt al een paar codes aangevraagd. Probeer het over een uur opnieuw.");
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await run(db().from("customer_logins").insert({ email: e, code_hash: hmac(e + ":" + code), expires_at: new Date(Date.now() + CODE_MINUTES * 60000).toISOString() }));
  if (email.enabled()) {
    await email.send(e, "Je inlogcode: " + code, email.layout("Je inlogcode",
      "<p>Gebruik deze code om in te loggen op Mijn account:</p>" +
      "<p style='font-size:30px;letter-spacing:8px;font-weight:700;margin:18px 0'>" + code + "</p>" +
      "<p>De code is " + CODE_MINUTES + " minuten geldig. Heb je niet geprobeerd in te loggen? Dan kun je deze e-mail negeren.</p>"));
    return { sent: true };
  }
  return { sent: true, devCode: code };
}

async function verifyCode(input, event) {
  const e = cleanEmail(input.email);
  const code = str(input.code, 10).replace(/\s/g, "");
  const rows = await run(db().from("customer_logins").select("*").eq("email", e).eq("used", false)
    .gte("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1));
  const row = rows[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) throw new HttpError(400, "Deze code is verlopen. Vraag een nieuwe code aan.");
  if (!/^\d{6}$/.test(code) || !safeEqual(row.code_hash, hmac(e + ":" + code))) {
    await run(db().from("customer_logins").update({ attempts: row.attempts + 1 }).eq("id", row.id));
    await new Promise((r) => setTimeout(r, 500));
    throw new HttpError(400, row.attempts + 1 >= MAX_ATTEMPTS ? "Te veel pogingen. Vraag een nieuwe code aan." : "Deze code klopt niet.");
  }
  await run(db().from("customer_logins").update({ used: true }).eq("id", row.id));
  const exp = Date.now() + DAYS * 864e5;
  const value = Buffer.from(e).toString("base64url") + "." + exp;
  return COOKIE + "=" + value + "." + hmac(value) + cookieAttrs(event) + "; Max-Age=" + DAYS * 86400;
}

// Het e-mailadres van de ingelogde klant, of null.
function sessionEmail(event) {
  const v = cookies(event)[COOKIE];
  if (!v) return null;
  const [who, exp, sig] = v.split(".");
  if (!who || !exp || !sig || Number(exp) < Date.now()) return null;
  if (!safeEqual(sig, hmac(who + "." + exp))) return null;
  return Buffer.from(who, "base64url").toString("utf8");
}

function clearSession(event) { return COOKIE + "=" + cookieAttrs(event) + "; Max-Age=0"; }

module.exports = { requestCode, verifyCode, sessionEmail, clearSession };
