// Bedrijfslogica: assortiment, voorraad, bestellingen, kassa en klanten.
const crypto = require("crypto");
const { db } = require("./store");
const { HttpError, str } = require("./http");
const SEED = require("../../data/products.js");
const CONFIG = require("../../data/config.js");
const { computeOrder, round } = require("../../data/order.js");

const TYPES = ["rood", "wit", "rose", "mousserend", "likeur", "delicatessen", "water"];
const STATUSES = ["nieuw", "betaald", "klaar", "verzonden", "afgerond", "geannuleerd"];
const PAYMENT_LABELS = {
  online: "Online (Mollie)", "bij-afhalen": "Bij afhalen", betaalverzoek: "Betaalverzoek",
  pin: "Pin", contant: "Contant", tikkie: "Tikkie / betaalverzoek", overig: "Anders"
};

const now = () => new Date().toISOString();
// Datum in Nederlandse tijd (de server draait op UTC), als "2026-10-12".
const localDay = (d) => new Date(d || Date.now()).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
const monthKey = (iso) => iso.slice(0, 7);
const pad = (n) => String(n).padStart(2, "0");

const onlinePaymentsEnabled = () => !!process.env.MOLLIE_API_KEY;

// ---------------- Assortiment ----------------

function seedCatalog() {
  return {
    products: SEED.map((p) => Object.assign({ stock: null, minStock: 6, active: true, webshop: true }, p)),
    updatedAt: now()
  };
}

async function getCatalog() {
  const store = db();
  let catalog = await store.get("catalog");
  if (!catalog) {
    catalog = await store.update("catalog", (c) => c || seedCatalog(), null);
  }
  return catalog;
}

async function getProducts() { return (await getCatalog()).products; }

// Wat de webshop mag zien.
function publicProduct(p) {
  const out = Object.assign({}, p);
  delete out.ean; delete out.minStock; delete out.cost; delete out.note;
  if (typeof p.stock === "number") out.stock = Math.max(0, p.stock);
  return out;
}

async function publicProducts() {
  return (await getProducts()).filter((p) => p.active !== false && p.webshop !== false).map(publicProduct);
}

function cleanProduct(input, existing) {
  const p = Object.assign({}, existing || {});
  const num = (v) => (v === "" || v == null ? null : Math.round(Number(v) * 100) / 100);
  const int = (v) => (v === "" || v == null ? null : Math.floor(Number(v)));

  if (!existing) {
    p.id = str(input.id || (input.producer + " " + input.name), 80).toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!p.id) throw new HttpError(400, "Geef het product een naam.");
  }
  ["name", "producer", "country", "region", "grape", "size", "unit", "ean", "image", "note"].forEach((k) => {
    if (k in input) p[k] = str(input[k], k === "note" ? 1000 : 200);
  });
  if ("description" in input) p.description = str(input.description, 2000);
  if ("type" in input) {
    if (TYPES.indexOf(input.type) < 0) throw new HttpError(400, "Onbekende soort.");
    p.type = input.type;
  }
  if ("vintage" in input) p.vintage = int(input.vintage);
  if ("bottles" in input) p.bottles = input.bottles === "" || input.bottles == null ? null : Math.max(0, int(input.bottles) || 0);
  ["price", "oldPrice", "cost"].forEach((k) => { if (k in input) p[k] = num(input[k]); });
  if ("vat" in input) p.vat = input.vat === "" || input.vat == null ? null : Number(input.vat) === 9 ? 9 : 21;
  if ("minStock" in input) p.minStock = int(input.minStock);
  if ("tags" in input) p.tags = (Array.isArray(input.tags) ? input.tags : []).map((t) => str(t, 30)).filter(Boolean);
  ["pickupOnly", "webshop", "active"].forEach((k) => { if (k in input) p[k] = !!input[k]; });

  if (!p.name) throw new HttpError(400, "Naam is verplicht.");
  if (!p.producer) throw new HttpError(400, "Wijnhuis / merk is verplicht.");
  if (!p.type) p.type = "rood";
  if (!p.unit) p.unit = "fles";
  if (p.bottles == null) p.bottles = p.unit === "doos van 6" ? 6 : 1;
  if (p.price != null && !(p.price >= 0)) throw new HttpError(400, "Ongeldige prijs.");
  for (const k of ["oldPrice", "cost", "vintage", "minStock"]) if (p[k] == null) delete p[k];
  if (p.vat == null) delete p.vat;
  return p;
}

async function saveProduct(input) {
  let saved;
  await db().update("catalog", (c) => {
    c = c || seedCatalog();
    const i = input.originalId ? c.products.findIndex((x) => x.id === input.originalId) : -1;
    if (input.originalId && i < 0) throw new HttpError(404, "Product niet gevonden.");
    const p = cleanProduct(input, i >= 0 ? c.products[i] : null);
    if (i < 0) {
      if (c.products.some((x) => x.id === p.id)) throw new HttpError(409, "Er bestaat al een product met deze code (" + p.id + ").");
      p.stock = input.stock === "" || input.stock == null ? null : Math.floor(Number(input.stock));
      if (p.minStock == null) p.minStock = 6;
      c.products.push(p);
    } else c.products[i] = p;
    if (p.ean && c.products.some((x) => x !== p && x.ean && x.ean === p.ean)) throw new HttpError(409, "Deze barcode is al aan een ander product gekoppeld.");
    c.updatedAt = now();
    saved = p;
    return c;
  }, null);
  return saved;
}

async function deleteProduct(id) {
  await db().update("catalog", (c) => {
    c = c || seedCatalog();
    const before = c.products.length;
    c.products = c.products.filter((p) => p.id !== id);
    if (c.products.length === before) throw new HttpError(404, "Product niet gevonden.");
    c.updatedAt = now();
    return c;
  }, null);
}

// ---------------- Voorraad ----------------

// changes: [{ id, delta }] of [{ id, set }]. Met strict worden negatieve voorraden geweigerd.
async function changeStock(changes, reason, ref, strict) {
  const moves = [];
  await db().update("catalog", (c) => {
    c = c || seedCatalog();
    moves.length = 0;
    changes.forEach((ch) => {
      const p = c.products.find((x) => x.id === ch.id);
      if (!p) throw new HttpError(404, "Product " + ch.id + " niet gevonden.");
      const before = typeof p.stock === "number" ? p.stock : null;
      let after;
      if ("set" in ch) after = ch.set === null || ch.set === "" ? null : Math.floor(Number(ch.set));
      else {
        if (before === null) return; // voorraad wordt niet bijgehouden
        after = before + Math.floor(Number(ch.delta));
      }
      if (after !== null && !Number.isFinite(after)) throw new HttpError(400, "Ongeldig aantal.");
      if (strict && after !== null && after < 0) {
        throw new HttpError(409, "Van " + p.producer + " " + p.name + " zijn er nog maar " + Math.max(0, before) + " op voorraad.");
      }
      p.stock = after;
      moves.push({ at: now(), id: p.id, name: p.producer + " — " + p.name, before, after, delta: after === null || before === null ? null : after - before, reason, ref: ref || null });
    });
    c.updatedAt = now();
    return c;
  }, null);
  if (moves.length) {
    await db().update("stocklog-" + monthKey(now()), (log) => (log || []).concat(moves), []);
  }
  return moves;
}

async function stockLog(months) {
  const keys = recentMonths(months || 2);
  const parts = await Promise.all(keys.map((k) => db().get("stocklog-" + k)));
  return [].concat.apply([], parts.map((x) => x || [])).sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ---------------- Klanten ----------------

function cleanCustomer(input, existing) {
  const c = Object.assign({}, existing || {});
  ["name", "email", "phone", "address", "postcode", "city", "company", "note"].forEach((k) => {
    if (k in input) c[k] = str(input[k], k === "note" ? 2000 : 200);
  });
  if (c.email) c.email = c.email.toLowerCase();
  if ("newsletter" in input) c.newsletter = !!input.newsletter;
  if (!c.name && !c.email) throw new HttpError(400, "Vul minstens een naam of e-mailadres in.");
  return c;
}

async function getCustomers() { return (await db().get("customers")) || []; }

async function saveCustomer(input) {
  let saved;
  await db().update("customers", (list) => {
    list = list || [];
    const i = input.id ? list.findIndex((x) => x.id === input.id) : -1;
    if (input.id && i < 0) throw new HttpError(404, "Klant niet gevonden.");
    const c = cleanCustomer(input, i >= 0 ? list[i] : null);
    if (c.email && list.some((x, j) => j !== i && x.email === c.email)) throw new HttpError(409, "Er is al een klant met dit e-mailadres.");
    if (i < 0) { c.id = "k_" + crypto.randomBytes(5).toString("hex"); c.createdAt = now(); list.push(c); }
    else list[i] = c;
    saved = c;
    return list;
  }, []);
  return saved;
}

// Webshopklant: zoeken op e-mail, anders aanmaken. Contactgegevens worden bijgewerkt.
async function upsertCustomerFromOrder(data) {
  const email = str(data.email, 200).toLowerCase();
  if (!email) return null;
  let id;
  await db().update("customers", (list) => {
    list = list || [];
    let c = list.find((x) => x.email === email);
    if (!c) { c = { id: "k_" + crypto.randomBytes(5).toString("hex"), email, createdAt: now(), source: "webshop" }; list.push(c); }
    ["name", "phone", "address", "postcode", "city"].forEach((k) => { if (data[k]) c[k] = str(data[k], 200); });
    id = c.id;
    return list;
  }, []);
  return id;
}

async function deleteCustomer(id) {
  await db().update("customers", (list) => {
    const next = (list || []).filter((c) => c.id !== id);
    if (next.length === (list || []).length) throw new HttpError(404, "Klant niet gevonden.");
    return next;
  }, []);
}

// ---------------- Bestellingen ----------------

function recentMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(x.getUTCFullYear() + "-" + pad(x.getUTCMonth() + 1));
  }
  return out;
}

async function listOrders(months) {
  const keys = recentMonths(months || 3);
  const parts = await Promise.all(keys.map((k) => db().get("orders-" + k)));
  return [].concat.apply([], parts.map((x) => x || [])).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function findOrderMonth(number) {
  for (const k of recentMonths(24)) {
    const list = await db().get("orders-" + k);
    if (list && list.some((o) => o.number === number)) return k;
  }
  return null;
}

async function getOrder(number) {
  const k = await findOrderMonth(number);
  if (!k) return null;
  return (await db().get("orders-" + k)).find((o) => o.number === number);
}

async function updateOrder(number, fn) {
  const k = await findOrderMonth(number);
  if (!k) throw new HttpError(404, "Bestelling niet gevonden.");
  let updated;
  await db().update("orders-" + k, (list) => {
    const o = list.find((x) => x.number === number);
    if (!o) throw new HttpError(404, "Bestelling niet gevonden.");
    fn(o);
    updated = o;
    return list;
  }, []);
  return updated;
}

async function insertOrder(order) {
  await db().update("orders-" + monthKey(order.createdAt), (list) => {
    list = list || [];
    if (list.some((o) => o.number === order.number)) throw new HttpError(409, "Dit ordernummer bestaat al.");
    list.push(order);
    return list;
  }, []);
  return order;
}

function orderLines(result) {
  return result.lines.map((l) => ({ id: l.id, name: l.name, unit: l.unit, qty: l.qty, price: l.price, total: l.total, vat: l.vat }));
}

// Webshopbestelling: prijzen en voorraad worden hier opnieuw gecontroleerd.
async function createWebOrder(input) {
  const number = str(input.orderNumber, 40);
  if (!/^WWW-\d{6}-[A-Z0-9]{4}$/.test(number)) throw new HttpError(400, "Ongeldig ordernummer.");
  const payment = ["online", "bij-afhalen", "betaalverzoek"].indexOf(input.payment) >= 0 ? input.payment : null;
  if (!payment) throw new HttpError(400, "Kies een betaalwijze.");
  if (payment === "online" && !onlinePaymentsEnabled()) throw new HttpError(400, "Online betalen is niet beschikbaar.");

  const c = input.customer || {};
  const customer = {
    name: str(c.name, 100), email: str(c.email, 120).toLowerCase(), phone: str(c.phone, 40),
    address: str(c.address, 150), postcode: str(c.postcode, 10).toUpperCase(), city: str(c.city, 80)
  };
  if (!customer.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email) || !customer.phone) {
    throw new HttpError(400, "Vul je naam, e-mailadres en telefoonnummer in.");
  }

  const products = await getProducts();
  const items = (Array.isArray(input.items) ? input.items : []).slice(0, 100);
  const result = computeOrder(items, str(input.delivery, 40), products, CONFIG);
  if (!result.deliveryKey) result.errors.push("Kies hoe je je bestelling wilt ontvangen.");
  if (result.errors.length) throw new HttpError(400, result.errors.join(" "));
  if (!result.delivery.pickup && (!customer.address || !customer.postcode || !customer.city)) {
    throw new HttpError(400, "Vul je adres in.");
  }
  if (payment === "bij-afhalen" && !result.delivery.pickup) throw new HttpError(400, "Betalen bij afhalen kan alleen bij afhalen.");

  // Voorraad direct reserveren; weigert als er inmiddels te weinig is.
  await changeStock(result.lines.map((l) => ({ id: l.id, delta: -l.qty })), "Webshopbestelling", number, true);

  const createdAt = now();
  const order = {
    number, channel: "webshop", createdAt, status: "nieuw",
    paymentMethod: payment, paymentStatus: "open",
    lines: orderLines(result), subtotal: result.subtotal, discount: 0, shipping: result.shipping,
    total: result.total, vat: result.vat,
    delivery: result.deliveryKey, deliveryLabel: result.delivery.label,
    customer, notes: str(input.notes, 1000), pickupMoment: str(input.pickupMoment, 200),
    history: [{ at: createdAt, status: "nieuw", note: "Besteld via de webshop" }]
  };
  try {
    order.customerId = await upsertCustomerFromOrder(customer);
    await insertOrder(order);
  } catch (e) {
    await changeStock(result.lines.map((l) => ({ id: l.id, delta: l.qty })), "Bestelling mislukt, voorraad terug", number);
    throw e;
  }
  return order;
}

async function nextReceiptNumber() {
  const day = localDay().replace(/-/g, "").slice(2);
  let n;
  await db().update("counters", (c) => {
    c = c || {};
    c.pos = c.posDay === day ? (c.pos || 0) + 1 : 1;
    c.posDay = day;
    n = c.pos;
    return c;
  }, {});
  return "K-" + day + "-" + String(n).padStart(3, "0");
}

// Kassaverkoop in de winkel.
async function createPosSale(input) {
  const method = ["pin", "contant", "tikkie", "overig"].indexOf(input.payment) >= 0 ? input.payment : null;
  if (!method) throw new HttpError(400, "Kies een betaalwijze.");
  const discount = input.discount && Number(input.discount.value) > 0
    ? { type: input.discount.type === "percent" ? "percent" : "amount", value: Number(input.discount.value) } : null;

  const products = await getProducts();
  const result = computeOrder((input.items || []).slice(0, 200), null, products, CONFIG, { pos: true, discount });
  if (result.errors.length) throw new HttpError(400, result.errors.join(" "));

  let cash = null;
  if (method === "contant" && input.cashReceived != null && input.cashReceived !== "") {
    const received = round(Number(input.cashReceived));
    if (!(received >= result.total)) throw new HttpError(400, "Ontvangen bedrag is lager dan het totaal.");
    cash = { received, change: round(received - result.total) };
  }

  let customer = null, customerId = null;
  if (input.customerId) {
    const c = (await getCustomers()).find((x) => x.id === input.customerId);
    if (c) { customerId = c.id; customer = { name: c.name || "", email: c.email || "", phone: c.phone || "" }; }
  }

  const number = await nextReceiptNumber();
  await changeStock(result.lines.map((l) => ({ id: l.id, delta: -l.qty })), "Verkoop winkel", number);

  const createdAt = now();
  const order = {
    number, channel: "winkel", createdAt, status: "afgerond",
    paymentMethod: method, paymentStatus: "betaald",
    lines: orderLines(result), subtotal: result.subtotal, discount: result.discount, discountInfo: discount,
    shipping: 0, total: result.total, vat: result.vat, cash, customerId, customer,
    notes: str(input.notes, 500),
    history: [{ at: createdAt, status: "afgerond", note: "Kassaverkoop (" + PAYMENT_LABELS[method] + ")" }]
  };
  await insertOrder(order);
  return { order, warnings: result.warnings };
}

async function setOrderStatus(number, status, note) {
  if (STATUSES.indexOf(status) < 0) throw new HttpError(400, "Onbekende status.");
  let restore = null;
  const order = await updateOrder(number, (o) => {
    if (o.status === status) return;
    if (o.status === "geannuleerd") throw new HttpError(400, "Een geannuleerde bestelling kan niet meer worden gewijzigd.");
    if (status === "geannuleerd") restore = o.lines;
    if (status === "betaald") o.paymentStatus = "betaald";
    o.status = status;
    o.history.push({ at: now(), status, note: str(note, 300) });
  });
  if (restore) {
    await changeStock(restore.map((l) => ({ id: l.id, delta: l.qty })), "Bestelling geannuleerd", number);
  }
  return order;
}

async function setPaymentStatus(number, paymentStatus, molliePaymentId) {
  return updateOrder(number, (o) => {
    if (molliePaymentId) o.molliePaymentId = molliePaymentId;
    if (o.paymentStatus === paymentStatus) return;
    o.paymentStatus = paymentStatus;
    if (paymentStatus === "betaald" && o.status === "nieuw") o.status = "betaald";
    o.history.push({ at: now(), status: o.status, note: "Betaling: " + paymentStatus });
  });
}

// ---------------- Dashboard ----------------

async function dashboard() {
  const [orders, products] = await Promise.all([listOrders(2), getProducts()]);
  const today = localDay();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const valid = orders.filter((o) => o.status !== "geannuleerd");
  const sum = (list) => round(list.reduce((s, o) => s + o.total, 0));
  const todays = valid.filter((o) => localDay(o.createdAt) === today);
  const posToday = todays.filter((o) => o.channel === "winkel");
  const byMethod = {};
  posToday.forEach((o) => { byMethod[o.paymentMethod] = round((byMethod[o.paymentMethod] || 0) + o.total); });
  const month = valid.filter((o) => localDay(o.createdAt).slice(0, 7) === today.slice(0, 7));

  // Best verkocht deze maand
  const sold = {};
  month.forEach((o) => o.lines.forEach((l) => { sold[l.id] = sold[l.id] || { id: l.id, name: l.name, qty: 0, total: 0 }; sold[l.id].qty += l.qty; sold[l.id].total = round(sold[l.id].total + l.total); }));

  return {
    today: { total: sum(todays), count: todays.length, webshop: sum(todays.filter((o) => o.channel === "webshop")), winkel: sum(posToday), byMethod },
    week: { total: sum(valid.filter((o) => o.createdAt >= weekAgo)) },
    month: { total: sum(month), webshop: sum(month.filter((o) => o.channel === "webshop")), winkel: sum(month.filter((o) => o.channel === "winkel")), count: month.length },
    openOrders: valid.filter((o) => o.channel === "webshop" && ["nieuw", "betaald", "klaar"].indexOf(o.status) >= 0).slice(0, 20),
    lowStock: products.filter((p) => p.active !== false && typeof p.stock === "number" && p.stock <= (p.minStock == null ? 6 : p.minStock))
      .sort((a, b) => a.stock - b.stock),
    topProducts: Object.values(sold).sort((a, b) => b.qty - a.qty).slice(0, 5)
  };
}

module.exports = {
  CONFIG, TYPES, onlinePaymentsEnabled, STATUSES, PAYMENT_LABELS,
  getCatalog, getProducts, publicProducts, saveProduct, deleteProduct,
  changeStock, stockLog,
  getCustomers, saveCustomer, deleteCustomer,
  listOrders, getOrder, createWebOrder, createPosSale, setOrderStatus, setPaymentStatus,
  dashboard
};
