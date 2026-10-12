// Bedrijfslogica: assortiment, voorraad, bestellingen, kassa en klanten (Supabase).
const { db, run, all } = require("./db");
const { HttpError, str } = require("./http");
const SEED = require("../../data/products.js");
const CONFIG = require("../../data/config.js");
const { computeOrder, round } = require("../../data/order.js");
const images = require("./images");

const TYPES = ["rood", "wit", "rose", "mousserend", "likeur", "delicatessen", "water"];
const STATUSES = ["nieuw", "betaald", "klaar", "verzonden", "afgerond", "geannuleerd"];
const PAYMENT_LABELS = {
  online: "Online (Mollie)", "bij-afhalen": "Bij afhalen", betaalverzoek: "Betaalverzoek",
  pin: "Pin", contant: "Contant", tikkie: "Tikkie / betaalverzoek", overig: "Anders", gemengd: "Gemengd"
};
const POS_METHODS = ["pin", "contant", "tikkie", "overig"];

const now = () => new Date().toISOString();
// Datum in Nederlandse tijd (de server draait op UTC), als "2026-10-12".
const localDay = (d) => new Date(d || Date.now()).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
const onlinePaymentsEnabled = () => !!process.env.MOLLIE_API_KEY;
const num = (v) => (v == null ? null : Number(v));

// ---------------- Omzetten tussen database (snake_case) en app (camelCase) ----------------

const PRODUCT_FIELDS = {
  id: "id", name: "name", producer: "producer", type: "type", country: "country", region: "region",
  grape: "grape", vintage: "vintage", size: "size", unit: "unit", bottles: "bottles", price: "price",
  oldPrice: "old_price", cost: "cost", vat: "vat", tags: "tags", pickupOnly: "pickup_only", stock: "stock",
  minStock: "min_stock", ean: "ean", webshop: "webshop", active: "active", image: "image",
  description: "description", note: "note"
};
const MONEY = ["price", "oldPrice", "cost"];

function fromProductRow(r) {
  const p = {};
  Object.keys(PRODUCT_FIELDS).forEach((k) => {
    let v = r[PRODUCT_FIELDS[k]];
    if (MONEY.indexOf(k) >= 0) v = num(v);
    if (v !== null && v !== undefined && v !== "") p[k] = v;
  });
  p.tags = r.tags || [];
  p.stock = r.stock == null ? null : r.stock;
  p.price = num(r.price);
  return p;
}

function toProductRow(p) {
  const row = {};
  Object.keys(PRODUCT_FIELDS).forEach((k) => {
    if (k === "id" && !p.id) return;
    row[PRODUCT_FIELDS[k]] = p[k] === undefined || p[k] === "" ? null : p[k];
  });
  row.tags = p.tags || [];
  row.pickup_only = !!p.pickupOnly;
  row.webshop = p.webshop !== false;
  row.active = p.active !== false;
  if (row.bottles == null) row.bottles = 1;
  if (!row.unit) row.unit = "fles";
  return row;
}

const ORDER_FIELDS = {
  number: "number", channel: "channel", createdAt: "created_at", status: "status",
  paymentMethod: "payment_method", paymentStatus: "payment_status", molliePaymentId: "mollie_payment_id",
  subtotal: "subtotal", discount: "discount", discountInfo: "discount_info", shipping: "shipping", total: "total",
  vat: "vat", delivery: "delivery", deliveryLabel: "delivery_label", customerId: "customer_id",
  customer: "customer", notes: "notes", pickupMoment: "pickup_moment", cash: "cash", history: "history",
  posSessionId: "pos_session_id", payments: "payments"
};

function toOrderRow(o) {
  const row = {};
  Object.keys(ORDER_FIELDS).forEach((k) => { row[ORDER_FIELDS[k]] = o[k] === undefined ? null : o[k]; });
  return row;
}

function fromOrderRow(r) {
  const o = {};
  Object.keys(ORDER_FIELDS).forEach((k) => { o[k] = r[ORDER_FIELDS[k]]; });
  ["subtotal", "discount", "shipping", "total"].forEach((k) => { o[k] = num(o[k]) || 0; });
  o.createdAt = new Date(o.createdAt).toISOString();
  o.lines = (r.order_lines || []).sort((a, b) => a.line_no - b.line_no).map((l) => {
    const line = { id: l.product_id, name: l.name, unit: l.unit, qty: l.qty, price: num(l.price), total: num(l.total), vat: l.vat };
    if (num(l.discount)) line.discount = num(l.discount);
    if (l.list_price != null) line.listPrice = num(l.list_price);
    return line;
  });
  if (!o.payments) o.payments = o.paymentMethod && o.paymentMethod !== "gemengd" ? [{ method: o.paymentMethod, amount: o.total }] : [];
  o.history = o.history || [];
  o.vat = o.vat || [];
  return o;
}

const CUSTOMER_FIELDS = ["id", "name", "email", "phone", "address", "postcode", "city", "company", "note", "newsletter", "source"];
function fromCustomerRow(r) {
  const c = { createdAt: r.created_at };
  CUSTOMER_FIELDS.forEach((k) => { if (r[k] !== null && r[k] !== undefined) c[k] = r[k]; });
  return c;
}

// ---------------- Assortiment ----------------

async function getProducts() {
  let rows = await all(() => db().from("products").select("*").order("producer").order("name"));
  if (!rows.length) {
    // Eerste keer: database vullen met het startassortiment uit data/products.js.
    const seed = SEED.map((p) => toProductRow(Object.assign({ stock: null, minStock: 6, active: true, webshop: true }, p)));
    await run(db().from("products").upsert(seed, { onConflict: "id", ignoreDuplicates: true }));
    rows = await all(() => db().from("products").select("*").order("producer").order("name"));
  }
  return rows.map(fromProductRow);
}

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
  const money = (v) => (v === "" || v == null ? null : Math.round(Number(v) * 100) / 100);
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
  ["price", "oldPrice", "cost"].forEach((k) => { if (k in input) p[k] = money(input[k]); });
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
  if ([p.price, p.oldPrice, p.cost, p.vintage, p.minStock].some((v) => v != null && !Number.isFinite(v))) throw new HttpError(400, "Controleer de getallen.");
  return p;
}

const PRODUCT_UNIQUE = { products_ean_key: "Deze barcode is al aan een ander product gekoppeld.", products_pkey: "Er bestaat al een product met deze code." };

async function saveProduct(input) {
  if (input.originalId) {
    const rows = await run(db().from("products").select("*").eq("id", input.originalId));
    if (!rows.length) throw new HttpError(404, "Product niet gevonden.");
    const p = cleanProduct(input, fromProductRow(rows[0]));
    const row = toProductRow(p);
    delete row.stock; // voorraad alleen via voorraadmutaties
    row.updated_at = now();
    const saved = await run(db().from("products").update(row).eq("id", p.id).select(), PRODUCT_UNIQUE);
    return fromProductRow(saved[0]);
  }
  const p = cleanProduct(input, null);
  p.stock = input.stock === "" || input.stock == null ? null : Math.floor(Number(input.stock));
  if (p.stock != null && !Number.isFinite(p.stock)) throw new HttpError(400, "Ongeldige voorraad.");
  if (p.minStock == null) p.minStock = 6;
  const saved = await run(db().from("products").insert(toProductRow(p)).select(), PRODUCT_UNIQUE);
  if (p.stock != null) {
    await run(db().from("stock_movements").insert({ product_id: p.id, name: p.producer + " — " + p.name, before: null, after: p.stock, delta: null, reason: "Nieuw product" }));
  }
  return fromProductRow(saved[0]);
}

async function deleteProduct(id) {
  const rows = await run(db().from("products").delete().eq("id", id).select("id"));
  if (!rows.length) throw new HttpError(404, "Product niet gevonden.");
}

// ---------------- Voorraad ----------------

// changes: [{ id, delta }] of [{ id, set }]. Met strict worden negatieve voorraden geweigerd.
async function changeStock(changes, reason, ref, strict) {
  return run(db().rpc("www_adjust_stock", { p_changes: changes, p_reason: reason, p_ref: ref || null, p_strict: !!strict }));
}

async function stockLog(months) {
  const since = new Date(Date.now() - (months || 3) * 31 * 864e5).toISOString();
  const rows = await run(db().from("stock_movements").select("*").gte("at", since).order("at", { ascending: false }).limit(500));
  return rows.map((m) => ({ at: new Date(m.at).toISOString(), id: m.product_id, name: m.name, before: m.before, after: m.after, delta: m.delta, reason: m.reason, ref: m.ref }));
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

const CUSTOMER_UNIQUE = { customers_email_key: "Er is al een klant met dit e-mailadres." };

async function getCustomers() {
  return (await all(() => db().from("customers").select("*").order("name"))).map(fromCustomerRow);
}

async function saveCustomer(input) {
  const row = (c) => ({
    name: c.name || null, email: c.email || null, phone: c.phone || null, address: c.address || null,
    postcode: c.postcode || null, city: c.city || null, company: c.company || null, note: c.note || null,
    newsletter: !!c.newsletter
  });
  if (input.id) {
    const found = await run(db().from("customers").select("*").eq("id", input.id));
    if (!found.length) throw new HttpError(404, "Klant niet gevonden.");
    const c = cleanCustomer(input, fromCustomerRow(found[0]));
    return fromCustomerRow((await run(db().from("customers").update(row(c)).eq("id", input.id).select(), CUSTOMER_UNIQUE))[0]);
  }
  const c = cleanCustomer(input, null);
  return fromCustomerRow((await run(db().from("customers").insert(Object.assign(row(c), { source: "winkel" })).select(), CUSTOMER_UNIQUE))[0]);
}

// Webshopklant: zoeken op e-mail, anders aanmaken. Contactgegevens worden bijgewerkt.
async function upsertCustomerFromOrder(data) {
  const email = str(data.email, 200).toLowerCase();
  if (!email) return null;
  const row = { email };
  ["name", "phone", "address", "postcode", "city"].forEach((k) => { if (data[k]) row[k] = str(data[k], 200); });
  const saved = await run(db().from("customers").upsert(row, { onConflict: "email" }).select("id"));
  return saved[0].id;
}

async function deleteCustomer(id) {
  const rows = await run(db().from("customers").delete().eq("id", id).select("id"));
  if (!rows.length) throw new HttpError(404, "Klant niet gevonden.");
}

// ---------------- Bestellingen ----------------

function monthsAgo(n) {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1), 1)).toISOString();
}

async function listOrders(months) {
  const since = monthsAgo(months || 3);
  const rows = await all(() => db().from("orders").select("*, order_lines(*)").gte("created_at", since).order("created_at", { ascending: false }));
  return rows.map(fromOrderRow);
}

async function getOrder(number) {
  const rows = await run(db().from("orders").select("*, order_lines(*)").eq("number", number));
  return rows.length ? fromOrderRow(rows[0]) : null;
}

function orderLines(result) {
  return result.lines.map((l) => {
    const line = { id: l.id, name: l.name, unit: l.unit, qty: l.qty, price: l.price, total: l.total, vat: l.vat };
    if (l.discount) line.discount = l.discount;
    if (l.listPrice != null) line.listPrice = l.listPrice;
    return line;
  });
}

async function saveNewOrder(order, strict, reason) {
  await run(db().rpc("www_create_order", { p_order: toOrderRow(order), p_lines: order.lines, p_strict: strict, p_reason: reason }),
    { orders_pkey: "Dit ordernummer bestaat al." });
  return order;
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
  order.customerId = await upsertCustomerFromOrder(customer);
  // Voorraad afboeken en bestelling opslaan in één transactie; weigert bij te weinig voorraad.
  return saveNewOrder(order, true, "Webshopbestelling");
}

async function nextReceiptNumber() {
  const day = localDay().replace(/-/g, "").slice(2);
  const n = await run(db().rpc("www_next_receipt", { p_day: day }));
  return "K-" + day + "-" + String(n).padStart(3, "0");
}

// ---------------- Kassadiensten ----------------

function fromSessionRow(r) {
  return {
    id: r.id, status: r.status, openedAt: new Date(r.opened_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    openingCash: num(r.opening_cash) || 0, expectedCash: num(r.expected_cash), countedCash: num(r.counted_cash),
    difference: num(r.difference), summary: r.summary, note: r.note
  };
}

async function openSession() {
  const rows = await run(db().from("pos_sessions").select("*").eq("status", "open"));
  return rows.length ? fromSessionRow(rows[0]) : null;
}

// Omzet en kas van een dienst, berekend uit de kassaverkopen.
async function sessionSummary(session) {
  const rows = await all(() => db().from("orders").select("*, order_lines(*)").eq("pos_session_id", session.id).order("created_at"));
  const orders = rows.map(fromOrderRow).filter((o) => o.status !== "geannuleerd");
  const byMethod = {};
  orders.forEach((o) => o.payments.forEach((pm) => { byMethod[pm.method] = round((byMethod[pm.method] || 0) + pm.amount); }));
  const vat = {};
  orders.forEach((o) => (o.vat || []).forEach((v) => { vat[v.rate] = vat[v.rate] || { rate: v.rate, gross: 0, vat: 0 }; vat[v.rate].gross = round(vat[v.rate].gross + v.gross); vat[v.rate].vat = round(vat[v.rate].vat + v.vat); }));
  return {
    count: orders.length,
    total: round(orders.reduce((t, o) => t + o.total, 0)),
    discount: round(orders.reduce((t, o) => t + (o.discount || 0), 0) + orders.reduce((t, o) => t + o.lines.reduce((u, l) => u + (l.discount ? round(l.price * l.qty) - l.total : 0), 0), 0)),
    byMethod,
    vat: Object.values(vat).sort((a, b) => a.rate - b.rate),
    expectedCash: round(session.openingCash + (byMethod.contant || 0))
  };
}

async function currentSession() {
  const session = await openSession();
  if (!session) return { session: null, lastClosingCash: await lastClosingCash() };
  return { session: Object.assign(session, { summary: await sessionSummary(session) }) };
}

async function lastClosingCash() {
  const rows = await run(db().from("pos_sessions").select("counted_cash").eq("status", "gesloten").order("closed_at", { ascending: false }).limit(1));
  return rows.length ? num(rows[0].counted_cash) : 0;
}

async function startSession(input) {
  const opening = round(Number(input.openingCash) || 0);
  if (opening < 0) throw new HttpError(400, "Beginsaldo kan niet negatief zijn.");
  const rows = await run(db().from("pos_sessions").insert({ opening_cash: opening, note: str(input.note, 300) || null }).select(),
    { pos_sessions_one_open: "Er is al een kassadienst open." });
  return fromSessionRow(rows[0]);
}

async function closeSession(input) {
  const session = await openSession();
  if (!session) throw new HttpError(409, "Er is geen kassadienst open.");
  const counted = input.countedCash === "" || input.countedCash == null ? null : round(Number(input.countedCash));
  if (counted == null || !(counted >= 0)) throw new HttpError(400, "Vul het getelde bedrag in de kassalade in.");
  const summary = await sessionSummary(session);
  const rows = await run(db().from("pos_sessions").update({
    status: "gesloten", closed_at: now(), expected_cash: summary.expectedCash, counted_cash: counted,
    difference: round(counted - summary.expectedCash), summary, note: str(input.note, 500) || session.note
  }).eq("id", session.id).eq("status", "open").select());
  if (!rows.length) throw new HttpError(409, "Deze kassadienst is al gesloten.");
  return fromSessionRow(rows[0]);
}

async function listSessions() {
  const rows = await run(db().from("pos_sessions").select("*").order("opened_at", { ascending: false }).limit(60));
  return rows.map(fromSessionRow);
}

// Kassaverkoop in de winkel. Betalen kan gesplitst: payments = [{ method, amount }].
// Bij contant mag het bedrag hoger zijn dan nodig; het verschil is wisselgeld.
async function createPosSale(input) {
  const session = await openSession();
  if (!session) throw new HttpError(409, "Open eerst de kassa.");
  const discount = input.discount && Number(input.discount.value) > 0
    ? { type: input.discount.type === "percent" ? "percent" : "amount", value: Number(input.discount.value) } : null;

  const products = await getProducts();
  const result = computeOrder((input.items || []).slice(0, 200), null, products, CONFIG, { pos: true, discount });
  if (result.errors.length) throw new HttpError(400, result.errors.join(" "));

  // Betalingen (oude aanroep met één betaalwijze blijft werken)
  let given = Array.isArray(input.payments) ? input.payments
    : [{ method: input.payment, amount: input.payment === "contant" && input.cashReceived != null && input.cashReceived !== "" ? input.cashReceived : result.total }];
  given = given.slice(0, 10).map((pm) => ({ method: pm && pm.method, amount: round(Number(pm && pm.amount)) }))
    .filter((pm) => pm.amount > 0 || result.total === 0);
  if (!given.length || given.some((pm) => POS_METHODS.indexOf(pm.method) < 0 || !Number.isFinite(pm.amount))) {
    throw new HttpError(400, "Kies een betaalwijze.");
  }
  const nonCash = round(given.filter((pm) => pm.method !== "contant").reduce((t, pm) => t + pm.amount, 0));
  const cashGiven = round(given.filter((pm) => pm.method === "contant").reduce((t, pm) => t + pm.amount, 0));
  if (nonCash > result.total + 0.001) throw new HttpError(400, "Er is meer met pin/Tikkie betaald dan het totaal.");
  if (round(nonCash + cashGiven) < result.total - 0.001) throw new HttpError(400, "Het betaalde bedrag is lager dan het totaal.");
  const cashPart = round(result.total - nonCash);
  const payments = [];
  given.forEach((pm) => {
    const amount = pm.method === "contant" ? 0 : pm.amount;
    const same = payments.find((x) => x.method === pm.method);
    if (pm.method !== "contant") { if (same) same.amount = round(same.amount + amount); else payments.push({ method: pm.method, amount }); }
  });
  if (cashGiven > 0 && cashPart > 0) payments.push({ method: "contant", amount: cashPart });
  if (!payments.length) payments.push({ method: given[0].method, amount: result.total });
  const cash = cashGiven > 0 ? { received: cashGiven, change: round(cashGiven - cashPart) } : null;
  const method = payments.length > 1 ? "gemengd" : payments[0].method;

  let customer = null, customerId = null;
  if (input.customerId) {
    const rows = await run(db().from("customers").select("*").eq("id", String(input.customerId))).catch(() => []);
    if (rows.length) { const c = rows[0]; customerId = c.id; customer = { name: c.name || "", email: c.email || "", phone: c.phone || "" }; }
  }

  const number = await nextReceiptNumber();
  const createdAt = now();
  const order = {
    number, channel: "winkel", createdAt, status: "afgerond",
    paymentMethod: method, paymentStatus: "betaald", payments, posSessionId: session.id,
    lines: orderLines(result), subtotal: result.subtotal, discount: result.discount, discountInfo: discount,
    shipping: 0, total: result.total, vat: result.vat, cash, customerId, customer,
    notes: str(input.notes, 500), delivery: null, deliveryLabel: null, pickupMoment: null, molliePaymentId: null,
    history: [{ at: createdAt, status: "afgerond", note: "Kassaverkoop (" + payments.map((pm) => PAYMENT_LABELS[pm.method]).join(" + ") + ")" }]
  };
  await saveNewOrder(order, false, "Verkoop winkel");
  return { order, warnings: result.warnings };
}

// ---------------- Productfoto's ----------------

async function setProductImage(id, dataUrl) {
  const found = await run(db().from("products").select("id").eq("id", id));
  if (!found.length) throw new HttpError(404, "Product niet gevonden.");
  let url = null;
  if (dataUrl) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
    if (!m) throw new HttpError(400, "Gebruik een foto in JPG-, PNG- of WebP-formaat.");
    const buffer = Buffer.from(m[2], "base64");
    if (buffer.length > 3 * 1024 * 1024) throw new HttpError(400, "De foto is te groot (maximaal 3 MB).");
    url = await images.save(id, buffer, m[1]);
  }
  const rows = await run(db().from("products").update({ image: url, updated_at: now() }).eq("id", id).select());
  return fromProductRow(rows[0]);
}

async function setOrderStatus(number, status, note) {
  if (STATUSES.indexOf(status) < 0) throw new HttpError(400, "Onbekende status.");
  await run(db().rpc("www_set_order_status", { p_number: number, p_status: status, p_note: str(note, 300) }));
  return getOrder(number);
}

async function setPaymentStatus(number, paymentStatus, molliePaymentId) {
  await run(db().rpc("www_set_payment_status", { p_number: number, p_payment_status: paymentStatus, p_mollie_id: molliePaymentId || null }));
  return getOrder(number);
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
  posToday.forEach((o) => o.payments.forEach((pm) => { byMethod[pm.method] = round((byMethod[pm.method] || 0) + pm.amount); }));
  const month = valid.filter((o) => localDay(o.createdAt).slice(0, 7) === today.slice(0, 7));

  // Best verkocht deze maand
  const sold = {};
  month.forEach((o) => o.lines.forEach((l) => {
    const k = l.id || l.name;
    sold[k] = sold[k] || { id: l.id, name: l.name, qty: 0, total: 0 };
    sold[k].qty += l.qty; sold[k].total = round(sold[k].total + l.total);
  }));

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
  CONFIG, TYPES, STATUSES, PAYMENT_LABELS, onlinePaymentsEnabled,
  getProducts, publicProducts, saveProduct, deleteProduct,
  changeStock, stockLog,
  getCustomers, saveCustomer, deleteCustomer,
  listOrders, getOrder, createWebOrder, createPosSale, setOrderStatus, setPaymentStatus,
  currentSession, startSession, closeSession, listSessions, setProductImage,
  dashboard
};
