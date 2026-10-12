// Inloggen voor de admin-omgeving met één wachtwoord (ADMIN_PASSWORD).
// De sessie is een ondertekende cookie die 12 uur geldig is.
const crypto = require("crypto");
const { cookies } = require("./http");

const COOKIE = "www_admin";
const HOURS = 12;

function secret() {
  const base = process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD;
  if (!base) return null;
  return crypto.createHash("sha256").update("www-admin:" + base).digest();
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const h = (s) => crypto.createHash("sha256").update(String(s)).digest();
  return crypto.timingSafeEqual(h(password), h(expected));
}

function cookieAttrs(event) {
  const host = (event.headers && event.headers.host) || "";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return "; Path=/; HttpOnly; SameSite=Strict" + (local ? "" : "; Secure");
}

function createSession(event) {
  const exp = Date.now() + HOURS * 3600 * 1000;
  const value = exp + "." + sign(String(exp));
  return COOKIE + "=" + value + cookieAttrs(event) + "; Max-Age=" + HOURS * 3600;
}

function clearSession(event) {
  return COOKIE + "=" + cookieAttrs(event) + "; Max-Age=0";
}

function isLoggedIn(event) {
  if (!secret()) return false;
  const value = cookies(event)[COOKIE];
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp));
}

module.exports = { checkPassword, createSession, clearSession, isLoggedIn, configured: () => !!secret() };
