// Winkelinstellingen uit de admin (Winkel → Openingstijden, Bezorgtijden, Bezorggebied).
// Opgeslagen in de tabel settings (key "shop"); zonder opgeslagen waarden gelden de
// standaardwaarden uit public/data/config.js.
const { db, run } = require("./db");
const { HttpError } = require("./http");
const CONFIG = require("../public/data/config.js");
const ORDER = require("../public/data/order.js");

const REGION = "bezorgen-regio";
const STATES = ["open", "afspraak", "dicht"];
const DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const clone = (v) => JSON.parse(JSON.stringify(v));
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
const isTime = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + "T00:00:00Z"));
const toMin = (v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));

function defaults() {
  const r = CONFIG.delivery[REGION];
  return {
    hours: clone(CONFIG.hours),
    deliveryTimes: clone(CONFIG.deliveryTimes),
    area: { postcodes: clone(r.postcodes), price: r.price, freeFrom: r.freeFrom || null }
  };
}

function merge(stored) {
  const d = defaults(), s = stored || {};
  return {
    hours: s.hours || d.hours,
    deliveryTimes: s.deliveryTimes ? Object.assign({}, d.deliveryTimes, s.deliveryTimes) : d.deliveryTimes,
    area: s.area || d.area
  };
}

async function loadRaw() {
  const rows = await run(db().from("settings").select("value").eq("key", "shop"));
  return rows.length ? rows[0].value : null;
}

async function getShopSettings() { return merge(await loadRaw()); }

// ---- Controleren van wat de admin opstuurt ----

// Afwijkende dagen: alleen geldige datums, niet verder terug dan een week en niet verder vooruit dan een jaar.
function cleanDates(input, cleanDay) {
  const out = {}, from = new Date(Date.parse(today() + "T00:00:00Z") - 7 * 864e5).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
  Object.keys(input && typeof input === "object" ? input : {}).sort().slice(0, 500).forEach((k) => {
    if (isDate(k) && k >= from && k <= to) out[k] = cleanDay(input[k], k);
  });
  return out;
}

function cleanHoursDay(v, name) {
  const s = v && STATES.indexOf(v.s) >= 0 ? v.s : "dicht";
  if (s === "dicht") return { s };
  if (!isTime(v.from) || !isTime(v.to) || toMin(v.to) <= toMin(v.from)) {
    throw new HttpError(400, "Vul bij " + name + " een geldige begin- en eindtijd in (eindtijd na begintijd).");
  }
  return { s, from: v.from, to: v.to };
}

function cleanHours(input) {
  const week = {};
  for (let wd = 0; wd < 7; wd++) week[wd] = cleanHoursDay((input.week || {})[wd], DAYS[wd]);
  return { week, dates: cleanDates(input.dates, (v, k) => cleanHoursDay(v, k)) };
}

function cleanWindows(list, name) {
  const out = (Array.isArray(list) ? list : []).slice(0, 6).map((w) => {
    if (!Array.isArray(w) || !isTime(w[0]) || !isTime(w[1]) || toMin(w[1]) <= toMin(w[0])) {
      throw new HttpError(400, "Vul bij " + name + " geldige tijdvakken in (eindtijd na begintijd).");
    }
    return [w[0], w[1]];
  });
  return out.sort((a, b) => toMin(a[0]) - toMin(b[0]));
}

function cleanDeliveryTimes(input) {
  const week = {};
  for (let wd = 0; wd < 7; wd++) {
    const w = cleanWindows((input.week || {})[wd], DAYS[wd]);
    if (w.length) week[wd] = w;
  }
  const leadDays = Math.floor(Number(input.leadDays));
  const daysAhead = Math.floor(Number(input.daysAhead));
  if (!(leadDays >= 0 && leadDays <= 14)) throw new HttpError(400, "Vroegst bezorgen: kies 0 tot 14 dagen na de bestelling.");
  if (!(daysAhead >= 1 && daysAhead <= 90) || daysAhead < leadDays) throw new HttpError(400, "Vooruit bestellen: kies 1 tot 90 dagen.");
  return { week, dates: cleanDates(input.dates, (v, k) => cleanWindows(v, k)), leadDays, daysAhead };
}

function cleanArea(input) {
  const list = Array.isArray(input.postcodes) ? input.postcodes : [];
  if (list.length > 100) throw new HttpError(400, "Maximaal 100 postcodegebieden.");
  const postcodes = list.map((r) => {
    const a = Math.floor(Number(r && r[0])), b = Math.floor(Number(r && r[1]));
    if (!(a >= 1000 && a <= 9999 && b >= 1000 && b <= 9999) || b < a) {
      throw new HttpError(400, "Postcodegebied " + (r && r[0]) + "–" + (r && r[1]) + " klopt niet: gebruik vier cijfers (1000–9999), ‘tot’ niet lager dan ‘van’.");
    }
    return [a, b, String((r && r[2]) || "").trim().slice(0, 80)];
  }).sort((x, y) => x[0] - y[0]);
  const price = Math.round(Number(input.price) * 100) / 100;
  if (!(price >= 0 && price <= 250)) throw new HttpError(400, "Vul geldige bezorgkosten in.");
  let freeFrom = input.freeFrom === "" || input.freeFrom == null ? null : Math.round(Number(input.freeFrom) * 100) / 100;
  if (freeFrom != null && !(freeFrom >= 0 && freeFrom <= 10000)) throw new HttpError(400, "Vul een geldig bedrag in bij ‘gratis vanaf’.");
  return { postcodes, price, freeFrom };
}

// Slaat één of meer onderdelen op: { hours }, { deliveryTimes } en/of { area }.
async function saveShopSettings(input) {
  const v = merge(await loadRaw());
  if (input.hours) v.hours = cleanHours(input.hours);
  if (input.deliveryTimes) v.deliveryTimes = cleanDeliveryTimes(input.deliveryTimes);
  if (input.area) v.area = cleanArea(input.area);
  await run(db().from("settings").upsert({ key: "shop", value: v, updated_at: new Date().toISOString() }, { onConflict: "key" }));
  return v;
}

// De webshopinstellingen met de waarden uit de admin erin: hiermee rekenen afrekenen en server.
function configWith(settings) {
  const c = clone(CONFIG), s = merge(settings);
  c.hours = s.hours;
  c.deliveryTimes = s.deliveryTimes;
  Object.assign(c.delivery[REGION], { postcodes: s.area.postcodes, price: s.area.price, freeFrom: s.area.freeFrom });
  if (s.area.freeFrom == null) delete c.delivery[REGION].freeFrom;
  return c;
}
async function effectiveConfig() { return configWith(await loadRaw()); }

// Voor de website (GET /api/shop-info): openingstijden van deze en volgende week,
// afhaal- en bezorgmomenten en het bezorggebied.
async function publicInfo(now) {
  const c = await effectiveConfig();
  const d = new Date(now || Date.now());
  const day = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const next = new Date(Date.parse(day + "T00:00:00Z") + 7 * 864e5).toISOString().slice(0, 10);
  const r = c.delivery[REGION];
  return {
    today: day,
    hours: { week: c.hours.week, thisWeek: ORDER.weekHours(c, day), nextWeek: ORDER.weekHours(c, next) },
    pickupDays: ORDER.pickupDays(c, d),
    deliveryDays: ORDER.deliveryDays(c, d),
    area: { postcodes: r.postcodes, price: r.price, freeFrom: r.freeFrom == null ? null : r.freeFrom }
  };
}

module.exports = { getShopSettings, saveShopSettings, effectiveConfig, configWith, publicInfo, defaults };
