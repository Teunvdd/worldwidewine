// Tests voor de serverlogica tegen een echte (lokale) Supabase-opzet: npm test
// Zie tests/helpers/local-supabase.js voor wat er nodig is.
const test = require("node:test");
const assert = require("node:assert");
const local = require("./helpers/local-supabase");

const missing = local.available();
if (missing) {
  test("databasetests", { skip: missing + " — zie tests/helpers/local-supabase.js" }, () => {});
  return;
}

let stack, shop, auth, admin, orders, products;
test.before(async () => {
  stack = await local.start();
  process.env.SUPABASE_URL = stack.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = stack.serviceKey;
  process.env.ADMIN_PASSWORD = "geheim";
  shop = require("../lib/shop");
  auth = require("../lib/auth");
  admin = require("../lib/handlers/admin");
  orders = require("../lib/handlers/orders");
  products = require("../lib/handlers/products");
});
test.after(async () => { if (stack) await stack.stop(); });

const customer = { name: "Test Klant", email: "Test@Example.com", phone: "0612345678", address: "Dorpsstraat 1", postcode: "1234 AB", city: "Utrecht" };
let seq = 0;
const nr = () => "WWW-261012-T" + String(++seq).padStart(3, "0");

test("assortiment wordt gevuld vanuit data/products.js", async () => {
  const list = await shop.getProducts();
  assert.ok(list.length >= 20);
  assert.strictEqual(list[0].stock, null);
});

test("webshopbestelling verlaagt voorraad en maakt een klant aan", async () => {
  await shop.changeStock([{ id: "wiston-estate-brut", set: 5 }], "Geteld");
  const order = await shop.createWebOrder({ orderNumber: nr(), items: [{ id: "wiston-estate-brut", qty: 2 }], delivery: "postnl", payment: "betaalverzoek", customer });
  assert.strictEqual(order.total, 87.95);
  assert.strictEqual(order.status, "nieuw");
  const p = (await shop.getProducts()).find((x) => x.id === "wiston-estate-brut");
  assert.strictEqual(p.stock, 3);
  const c = (await shop.getCustomers()).find((x) => x.email === "test@example.com");
  assert.ok(c);
  assert.strictEqual(order.customerId, c.id);
});

test("te weinig voorraad wordt geweigerd", async () => {
  await assert.rejects(
    shop.createWebOrder({ orderNumber: nr(), items: [{ id: "wiston-estate-brut", qty: 4 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer }),
    /nog maar 3/
  );
  const p = (await shop.getProducts()).find((x) => x.id === "wiston-estate-brut");
  assert.strictEqual(p.stock, 3);
});

test("prijzen komen van de server, niet van de klant", async () => {
  const order = await shop.createWebOrder({ orderNumber: nr(), items: [{ id: "montemercurio-messaggero", qty: 1, price: 0.01 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer });
  assert.strictEqual(order.total, 23);
});

test("annuleren zet de voorraad terug", async () => {
  const number = nr();
  await shop.createWebOrder({ orderNumber: number, items: [{ id: "wiston-estate-brut", qty: 1 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer });
  assert.strictEqual((await shop.getProducts()).find((x) => x.id === "wiston-estate-brut").stock, 2);
  await shop.setOrderStatus(number, "geannuleerd");
  assert.strictEqual((await shop.getProducts()).find((x) => x.id === "wiston-estate-brut").stock, 3);
  await assert.rejects(shop.setOrderStatus(number, "afgerond"), /geannuleerd/);
});

test("kassa: verkopen kan pas na openen van de kassa", async () => {
  await assert.rejects(shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1 }], payment: "pin" }), /Open eerst de kassa/);
  const s = await shop.startSession({ openingCash: 150 });
  assert.strictEqual(s.status, "open");
  assert.strictEqual(s.openingCash, 150);
  await assert.rejects(shop.startSession({ openingCash: 0 }), /al een kassadienst open/);
});

test("kassaverkoop met korting, contant en btw", async () => {
  const { order } = await shop.createPosSale({
    items: [{ id: "wiston-estate-brut", qty: 1 }, { id: "iberico-pata-negra-bellota", qty: 1 }],
    payment: "contant", cashReceived: 50, discount: { type: "percent", value: 10 }
  });
  assert.match(order.number, /^K-\d{6}-001$/);
  assert.strictEqual(order.subtotal, 52);
  assert.strictEqual(order.discount, 5.2);
  assert.strictEqual(order.total, 46.8);
  assert.deepStrictEqual(order.cash, { received: 50, change: 3.2 });
  const v21 = order.vat.find((v) => v.rate === 21), v9 = order.vat.find((v) => v.rate === 9);
  assert.strictEqual(v21.gross, 35.1);
  assert.strictEqual(v9.gross, 11.7);
  assert.strictEqual((await shop.getProducts()).find((x) => x.id === "wiston-estate-brut").stock, 2);
  const second = await shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1 }], payment: "pin" });
  assert.match(second.order.number, /-002$/);
});

test("product alleen in de winkel: wel in kassa, niet in webshop", async () => {
  await shop.saveProduct({ producer: "Huiswijn", name: "Rood van het vat", type: "rood", price: 7.5, webshop: false, stock: 10, ean: "8710000000001" });
  const pub = await shop.publicProducts();
  assert.ok(!pub.some((p) => p.id === "huiswijn-rood-van-het-vat"));
  await assert.rejects(shop.createWebOrder({ orderNumber: nr(), items: [{ id: "huiswijn-rood-van-het-vat", qty: 1 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer }), /niet te bestellen/);
  const { order } = await shop.createPosSale({ items: [{ id: "huiswijn-rood-van-het-vat", qty: 2 }], payment: "pin" });
  assert.strictEqual(order.total, 15);
  await assert.rejects(shop.saveProduct({ producer: "X", name: "Y", price: 1, ean: "8710000000001" }), /barcode/);
});

test("webshop-API verbergt interne velden", async () => {
  await shop.saveProduct({ originalId: "wiston-estate-brut", cost: 20, note: "geheim" });
  const res = await products.handler({ httpMethod: "GET", headers: {} });
  const list = JSON.parse(res.body).products;
  const p = list.find((x) => x.id === "wiston-estate-brut");
  assert.strictEqual(p.cost, undefined);
  assert.strictEqual(p.note, undefined);
  assert.strictEqual(p.price, 39);
});

test("bestel-API geeft nette fouten", async () => {
  const res = await orders.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ orderNumber: nr(), items: [], delivery: "postnl", payment: "online", customer }) });
  assert.strictEqual(res.statusCode, 400);
});

test("admin vereist inloggen", async () => {
  const headers = { host: "localhost:8888" };
  let res = await admin.handler({ httpMethod: "GET", path: "/api/admin/products", headers });
  assert.strictEqual(res.statusCode, 401);
  res = await admin.handler({ httpMethod: "POST", path: "/api/admin/login", headers, body: JSON.stringify({ password: "fout" }) });
  assert.strictEqual(res.statusCode, 401);
  res = await admin.handler({ httpMethod: "POST", path: "/api/admin/login", headers, body: JSON.stringify({ password: "geheim" }) });
  assert.strictEqual(res.statusCode, 200);
  const cookie = res.headers["Set-Cookie"].split(";")[0];
  res = await admin.handler({ httpMethod: "GET", path: "/api/admin/products", headers: Object.assign({ cookie }, headers) });
  assert.strictEqual(res.statusCode, 200);
  // Schrijven zonder de extra header wordt geweigerd
  res = await admin.handler({ httpMethod: "POST", path: "/api/admin/stock", headers: Object.assign({ cookie }, headers), body: JSON.stringify({ changes: [{ id: "wiston-estate-brut", set: 1 }] }) });
  assert.strictEqual(res.statusCode, 403);
  res = await admin.handler({ httpMethod: "POST", path: "/api/admin/stock", headers: Object.assign({ cookie, "x-www-admin": "1" }, headers), body: JSON.stringify({ changes: [{ id: "wiston-estate-brut", set: 1 }] }) });
  assert.strictEqual(res.statusCode, 200);
  // Vervalste cookie
  res = await admin.handler({ httpMethod: "GET", path: "/api/admin/products", headers: Object.assign({ cookie: "www_admin=9999999999999.abc" }, headers) });
  assert.strictEqual(res.statusCode, 401);
});

test("dashboard en export", async () => {
  const d = await shop.dashboard();
  assert.ok(d.today.total > 0);
  assert.ok(d.today.byMethod.contant > 0);
  assert.ok(d.lowStock.some((p) => p.id === "wiston-estate-brut"));
  const login = await admin.handler({ httpMethod: "POST", path: "/api/admin/login", headers: { host: "localhost" }, body: JSON.stringify({ password: "geheim" }) });
  const cookie = login.headers["Set-Cookie"].split(";")[0];
  const res = await admin.handler({ httpMethod: "GET", path: "/api/admin/export/orders", headers: { cookie, host: "localhost" } });
  assert.strictEqual(res.statusCode, 200);
  assert.match(res.body, /Datum;Nummer;Kanaal/);
});

test("online betalen via Mollie: betaling starten en webhook verwerken", async (t) => {
  process.env.MOLLIE_API_KEY = "test_x";
  process.env.SITE_URL = "https://www.worldwidewine.nl";
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    if (String(url).indexOf("https://api.mollie.com/") !== 0) return realFetch(url, opts); // database
    calls.push({ url: String(url), opts });
    if (opts && opts.method === "POST") {
      return new Response(JSON.stringify({ id: "tr_abc", _links: { checkout: { href: "https://mollie.test/pay" } } }), { status: 201 });
    }
    return new Response(JSON.stringify({ id: "tr_abc", status: "paid", metadata: { orderNumber: calls.number } }), { status: 200 });
  };
  t.after(() => { global.fetch = realFetch; delete process.env.MOLLIE_API_KEY; delete process.env.SITE_URL; });

  const number = nr();
  calls.number = number;
  const res = await orders.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ orderNumber: number, items: [{ id: "montemercurio-messaggero", qty: 2 }], delivery: "postnl", payment: "online", customer }) });
  const out = JSON.parse(res.body);
  assert.strictEqual(res.statusCode, 200, res.body);
  assert.strictEqual(out.checkoutUrl, "https://mollie.test/pay");
  const sent = JSON.parse(calls[0].opts.body);
  assert.strictEqual(sent.amount.value, "55.95");
  assert.strictEqual(sent.webhookUrl, "https://www.worldwidewine.nl/api/mollie-webhook");

  const webhook = require("../lib/handlers/mollie-webhook");
  const wh = await webhook.handler({ httpMethod: "POST", headers: {}, body: "id=tr_abc" });
  assert.strictEqual(wh.statusCode, 200);
  const order = await shop.getOrder(number);
  assert.strictEqual(order.paymentStatus, "betaald");
  assert.strictEqual(order.status, "betaald");
});

test("publieke sleutel (anon) kan niets lezen of wijzigen", async () => {
  const { createClient } = require("@supabase/supabase-js");
  const anon = createClient(stack.url, stack.anonKey, { auth: { persistSession: false } });
  for (const table of ["products", "customers", "orders", "order_lines", "stock_movements", "pos_sessions", "settings", "categories"]) {
    const { data, error } = await anon.from(table).select("*").limit(1);
    assert.ok(error || (data && data.length === 0), table + " is leesbaar met de anon-sleutel");
    assert.ok(error, table + " zou een permissiefout moeten geven");
  }
  const rpc = await anon.rpc("www_adjust_stock", { p_changes: [{ id: "wiston-estate-brut", set: 999 }], p_reason: "hack", p_ref: null, p_strict: false });
  assert.ok(rpc.error, "anon mag geen voorraad wijzigen");
  const ins = await anon.from("orders").insert({ number: "X" });
  assert.ok(ins.error);
});

test("gelijktijdige verkopen: geen dubbele bonnummers en nooit te veel verkocht", async () => {
  await shop.changeStock([{ id: "domaine-daridan-cheverny-blanc", set: 20 }, { id: "domaine-de-la-begude-bandol-blanc", set: 5 }], "Geteld");
  // 10 kassaverkopen tegelijk
  const sales = await Promise.all(Array.from({ length: 10 }, () =>
    shop.createPosSale({ items: [{ id: "domaine-daridan-cheverny-blanc", qty: 1 }], payment: "pin" })));
  assert.strictEqual(new Set(sales.map((s) => s.order.number)).size, 10, "unieke bonnummers");
  // 10 webshopbestellingen tegelijk voor een product waarvan er 5 zijn
  const results = await Promise.allSettled(Array.from({ length: 10 }, () =>
    shop.createWebOrder({ orderNumber: nr(), items: [{ id: "domaine-de-la-begude-bandol-blanc", qty: 1 }, { id: "domaine-daridan-cheverny-blanc", qty: 1 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer })));
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.strictEqual(ok, 5, "precies 5 bestellingen mogen slagen");
  results.filter((r) => r.status === "rejected").forEach((r) => assert.match(r.reason.message, /nog maar 0 op voorraad|uitverkocht/));
  const list = await shop.getProducts();
  assert.strictEqual(list.find((p) => p.id === "domaine-de-la-begude-bandol-blanc").stock, 0);
  assert.strictEqual(list.find((p) => p.id === "domaine-daridan-cheverny-blanc").stock, 20 - 10 - 5);
});

test("mislukte bestelling laat geen halve gegevens achter", async () => {
  const number = nr();
  await shop.createWebOrder({ orderNumber: number, items: [{ id: "domaine-daridan-cheverny-blanc", qty: 1 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer });
  const before = (await shop.getProducts()).find((p) => p.id === "domaine-daridan-cheverny-blanc").stock;
  // Zelfde ordernummer nog eens: moet geweigerd worden, en de voorraad mag niet veranderen
  await assert.rejects(shop.createWebOrder({ orderNumber: number, items: [{ id: "domaine-daridan-cheverny-blanc", qty: 1 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer }), /bestaat al/);
  assert.strictEqual((await shop.getProducts()).find((p) => p.id === "domaine-daridan-cheverny-blanc").stock, before);
});

test("product bewerken: velden leegmaken werkt", async () => {
  await shop.saveProduct({ originalId: "rainoldi-zapel-bianco", oldPrice: "", tags: [] });
  const p = (await shop.getProducts()).find((x) => x.id === "rainoldi-zapel-bianco");
  assert.strictEqual(p.oldPrice, undefined);
  assert.deepStrictEqual(p.tags, []);
  assert.strictEqual(p.price, 11.9);
});

test("categorieën: aanmaken, volgorde, toewijzen aan product en verwijderen", async () => {
  const a = await shop.saveCategory({ name: "Italië", color: "#CE542B" });
  const b = await shop.saveCategory({ name: "Bubbels" });
  assert.strictEqual(a.color, "#ce542b");
  await assert.rejects(shop.saveCategory({ name: "italië" }), /bestaat al/);
  await assert.rejects(shop.saveCategory({ name: "  " }), /naam/);
  let list = await shop.orderCategories([b.id, a.id]);
  assert.deepStrictEqual(list.map((c) => c.name), ["Bubbels", "Italië"]);

  await shop.saveProduct({ originalId: "rainoldi-zapel-bianco", categoryId: a.id });
  let p = (await shop.getProducts()).find((x) => x.id === "rainoldi-zapel-bianco");
  assert.strictEqual(p.categoryId, a.id);
  await assert.rejects(shop.saveProduct({ originalId: "rainoldi-zapel-bianco", categoryId: 999999 }), /bestaat niet/);

  // Een product bewerken zonder categorieveld laat de categorie staan.
  await shop.saveProduct({ originalId: "rainoldi-zapel-bianco", name: p.name });
  p = (await shop.getProducts()).find((x) => x.id === "rainoldi-zapel-bianco");
  assert.strictEqual(p.categoryId, a.id);

  await shop.deleteCategory(a.id);
  p = (await shop.getProducts()).find((x) => x.id === "rainoldi-zapel-bianco");
  assert.strictEqual(p.categoryId, undefined);
  await shop.deleteCategory(b.id);

  // Op basis van soort: elke soort een categorie, producten worden ingedeeld.
  list = await shop.categoriesFromTypes({ rood: "Rood", wit: "Wit", rose: "Rosé", mousserend: "Mousserend" });
  assert.ok(list.some((c) => c.name === "Rood"));
  const rood = list.find((c) => c.name === "Rood");
  const all = await shop.getProducts();
  assert.ok(all.filter((x) => x.type === "rood").every((x) => x.categoryId === rood.id));
  for (const c of list) await shop.deleteCategory(c.id);
});

test("kassa: gesplitst betalen, regelkorting en aangepaste prijs", async () => {
  const { order } = await shop.createPosSale({
    items: [{ id: "montemercurio-messaggero", qty: 2, discount: 10 }, { id: "koremans-limoncello", qty: 1, price: 20 }],
    payments: [{ method: "pin", amount: 30 }, { method: "contant", amount: 50 }]
  });
  // 2 × 21,50 (Messaggero, prijs in eerdere test aangepast? nee: 23) − 10% + 20
  const messaggero = order.lines.find((l) => l.id === "montemercurio-messaggero");
  assert.strictEqual(messaggero.discount, 10);
  assert.strictEqual(messaggero.total, Math.round(messaggero.price * 2 * 0.9 * 100) / 100);
  const lim = order.lines.find((l) => l.id === "koremans-limoncello");
  assert.strictEqual(lim.price, 20);
  assert.strictEqual(lim.listPrice, 22);
  assert.strictEqual(order.paymentMethod, "gemengd");
  const cash = order.payments.find((p) => p.method === "contant");
  assert.strictEqual(cash.amount, Math.round((order.total - 30) * 100) / 100);
  assert.strictEqual(order.cash.change, Math.round((50 - cash.amount) * 100) / 100);
  const saved = await shop.getOrder(order.number);
  assert.deepStrictEqual(saved.payments, order.payments);
  assert.strictEqual(saved.lines.find((l) => l.id === "koremans-limoncello").listPrice, 22);
  await assert.rejects(shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1 }], payments: [{ method: "pin", amount: 5 }] }), /lager dan het totaal/);
  await assert.rejects(shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1 }], payments: [{ method: "pin", amount: 500 }] }), /meer met pin/);
});

test("per doos: eigen aantal en prijs, voorraad in flessen, annuleren en kassa", async () => {
  const id = "montemercurio-messaggero";
  await assert.rejects(shop.saveProduct({ originalId: id, caseSize: 1 }), /2 tot 99/);
  // Niet per doos te koop: doos bestellen wordt geweigerd.
  await assert.rejects(
    shop.createWebOrder({ orderNumber: nr(), items: [{ id, qty: 1, box: true }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer }),
    /niet per doos/
  );
  const saved = await shop.saveProduct({ originalId: id, caseSize: 6, casePrice: 120 });
  assert.strictEqual(saved.caseSize, 6);
  assert.strictEqual(saved.casePrice, 120);
  assert.strictEqual((await shop.publicProducts()).find((p) => p.id === id).caseSize, 6);
  await shop.changeStock([{ id, set: 20 }], "Geteld");
  const stock = async () => (await shop.getProducts()).find((p) => p.id === id).stock;

  // Webshop: 1 doos + 2 losse flessen = 8 flessen van de voorraad.
  const number = nr();
  const order = await shop.createWebOrder({ orderNumber: number, items: [{ id, qty: 1, box: true }, { id, qty: 2 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer });
  const fles = order.lines.find((l) => !l.box);
  const doos = order.lines.find((l) => l.box);
  assert.strictEqual(doos.price, 120);
  assert.strictEqual(doos.packSize, 6);
  assert.strictEqual(doos.unit, "doos van 6");
  assert.strictEqual(order.total, 120 + fles.price * 2);
  assert.strictEqual(await stock(), 12);
  const back = (await shop.getOrder(number)).lines.find((l) => l.box);
  assert.strictEqual(back.packSize, 6);

  // Meer dozen dan er flessen zijn: geweigerd.
  await assert.rejects(
    shop.createWebOrder({ orderNumber: nr(), items: [{ id, qty: 3, box: true }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer }),
    /nog maar 12 flessen/
  );
  // Annuleren: alle 8 flessen terug.
  await shop.setOrderStatus(number, "geannuleerd");
  assert.strictEqual(await stock(), 20);

  // Kassa: een doos boekt 6 flessen af.
  const { order: sale } = await shop.createPosSale({ items: [{ id, qty: 1, box: true }], payments: [{ method: "pin", amount: 120 }] });
  assert.strictEqual(sale.total, 120);
  assert.strictEqual(await stock(), 14);

  // Zonder doosprijs: flesprijs × aantal. Uitzetten wist ook de doosprijs.
  const auto = await shop.saveProduct({ originalId: id, caseSize: 12, casePrice: null });
  const { computeOrder } = require("../public/data/order.js");
  const r = computeOrder([{ id, qty: 1, box: true }], null, [auto], require("../public/data/config.js"), { pos: true });
  assert.strictEqual(r.lines[0].price, Math.round(auto.price * 12 * 100) / 100);
  const off = await shop.saveProduct({ originalId: id, caseSize: null, casePrice: 50 });
  assert.strictEqual(off.caseSize, undefined);
  assert.strictEqual(off.casePrice, undefined);
});

test("wijngegevens: alcoholpercentage opslaan, tonen in de webshop en leegmaken", async () => {
  const id = "montemercurio-messaggero";
  await assert.rejects(shop.saveProduct({ originalId: id, alcohol: "120" }), /tussen 0 en 100/);
  const p = await shop.saveProduct({ originalId: id, alcohol: "13,5", grape: "Sangiovese, Merlot", vintage: "2021", size: "75 cl", region: "Toscane", country: "Italië" });
  assert.strictEqual(p.alcohol, 13.5);
  const pub = (await shop.publicProducts()).find((x) => x.id === id);
  assert.strictEqual(pub.alcohol, 13.5);
  assert.strictEqual(pub.vintage, 2021);
  assert.strictEqual(pub.grape, "Sangiovese, Merlot");
  const cleared = await shop.saveProduct({ originalId: id, alcohol: "" });
  assert.strictEqual(cleared.alcohol, undefined);
});

test("kassa sluiten: verwacht kasgeld, telling en verschil", async () => {
  const { session } = await shop.currentSession();
  const expected = session.summary.expectedCash;
  assert.strictEqual(expected, Math.round((150 + (session.summary.byMethod.contant || 0)) * 100) / 100);
  assert.ok(session.summary.count >= 3);
  const closed = await shop.closeSession({ countedCash: expected - 2.5, note: "2,50 te weinig" });
  assert.strictEqual(closed.status, "gesloten");
  assert.strictEqual(closed.difference, -2.5);
  assert.strictEqual((await shop.currentSession()).session, null);
  assert.strictEqual((await shop.currentSession()).lastClosingCash, expected - 2.5);
  await assert.rejects(shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1 }], payment: "pin" }), /Open eerst de kassa/);
  assert.strictEqual((await shop.listSessions())[0].id, closed.id);
});

test("productfoto uploaden", async () => {
  const fs = require("fs"), os = require("os"), path = require("path");
  process.env.WWW_LOCAL_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "www-img-"));
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const p = await shop.setProductImage("wiston-estate-brut", png);
  assert.match(p.image, /^\/uploads\/wiston-estate-brut-.*\.png$/);
  assert.ok(fs.existsSync(path.join(process.env.WWW_LOCAL_UPLOADS, path.basename(p.image))));
  await assert.rejects(shop.setProductImage("wiston-estate-brut", "data:text/html;base64,PGgxPg=="), /JPG/);
  const cleared = await shop.setProductImage("wiston-estate-brut", null);
  assert.strictEqual(cleared.image, undefined);
  delete process.env.WWW_LOCAL_UPLOADS;
});

test("kassa-instellingen: standaardwaarden, opslaan en pincode wordt niet teruggegeven", async () => {
  const s0 = await shop.getPosSettings();
  assert.strictEqual(s0.cashControl, true);
  assert.strictEqual(s0.pinSet, false);
  await assert.rejects(shop.savePosSettings({ pinFor: { closeSession: true } }), /Stel eerst een beheerderspincode in/);
  await assert.rejects(shop.savePosSettings({ pin: "12" }), /4 tot 8 cijfers/);
  await assert.rejects(shop.savePosSettings({ methods: { pin: false, contant: false, tikkie: false, overig: false } }), /minstens één betaalwijze/);
  const s = await shop.savePosSettings({ pin: "4321", quickCash: "5 10 20 50 100", otherLabel: "Cadeaubon", methods: { overig: true } });
  assert.strictEqual(s.pinSet, true);
  assert.strictEqual(s.pinHash, undefined);
  assert.strictEqual(s.pinSalt, undefined);
  assert.deepStrictEqual(s.quickCash, [5, 10, 20, 50]);
  assert.strictEqual(s.methods.overig, true);
  await assert.rejects(shop.verifyPin("0000"), /Onjuiste pincode/);
  assert.strictEqual(await shop.verifyPin("4321"), true);
});

test("kassa-instellingen worden afgedwongen bij verkopen", async () => {
  await shop.startSession({ openingCash: 100 });
  const item = [{ id: "koremans-limoncello", qty: 1 }];
  // betaalwijze uit
  await shop.savePosSettings({ methods: { tikkie: false } });
  await assert.rejects(shop.createPosSale({ items: item, payments: [{ method: "tikkie", amount: 22 }] }), /betaalwijze staat uit/);
  // prijs wijzigen uit
  await shop.savePosSettings({ allowPriceChange: false });
  await assert.rejects(shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1, price: 15 }], payment: "pin" }), /Prijzen wijzigen/);
  // maximale korting
  await shop.savePosSettings({ allowPriceChange: true, maxDiscount: 15 });
  await assert.rejects(shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1, discount: 20 }], payment: "pin" }), /maximum van 15%/);
  await assert.rejects(shop.createPosSale({ items: item, payment: "pin", discount: { type: "amount", value: 10 } }), /maximum van 15%/);
  // pincode voor korting
  await shop.savePosSettings({ pinFor: { discount: true } });
  await assert.rejects(shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1, discount: 10 }], payment: "pin" }), /pincode/);
  const ok = await shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1, discount: 10 }], payment: "pin", managerPin: "4321" });
  assert.strictEqual(ok.order.total, 19.8);
  // geen verkoop boven voorraad
  await shop.changeStock([{ id: "domaine-daridan-cheverny-blanc", set: 1 }], "Geteld");
  await shop.savePosSettings({ allowNegativeStock: false, pinFor: { discount: false } });
  await assert.rejects(shop.createPosSale({ items: [{ id: "domaine-daridan-cheverny-blanc", qty: 2 }], payment: "pin" }), /nog maar 1 op voorraad/);
  await shop.savePosSettings({ allowNegativeStock: true, maxDiscount: 100, methods: { tikkie: true } });
});

test("contant afronden op 5 cent", async () => {
  await shop.savePosSettings({ roundCash: true });
  // 2 × Rosso Tedicciolo € 10 + Zapel € 11,90 = 31,90 → 10% korting = 28,71 → contant 28,70
  const { order } = await shop.createPosSale({ items: [{ id: "montemercurio-tedicciolo", qty: 2 }, { id: "rainoldi-zapel-bianco", qty: 1 }], payment: "contant", cashReceived: 30, discount: { type: "percent", value: 10 } });
  assert.strictEqual(order.total, 28.71);
  assert.deepStrictEqual(order.payments, [{ method: "contant", amount: 28.7 }]);
  assert.strictEqual(order.cash.change, 1.3);
  assert.strictEqual(order.cash.rounding, -0.01);
  // pin wordt niet afgerond
  const pin = await shop.createPosSale({ items: [{ id: "montemercurio-tedicciolo", qty: 1 }, { id: "rainoldi-zapel-bianco", qty: 1 }], payment: "pin", discount: { type: "amount", value: 0.03 } });
  assert.strictEqual(pin.order.payments[0].amount, 21.87);
  await shop.savePosSettings({ roundCash: false });
});

test("kassa zonder kastelling en sluiten met pincode", async () => {
  await shop.savePosSettings({ pinFor: { closeSession: true } });
  await assert.rejects(shop.closeSession({ countedCash: 0 }), /pincode/);
  await shop.savePosSettings({ cashControl: false });
  const closed = await shop.closeSession({ managerPin: "4321" });
  assert.strictEqual(closed.countedCash, null);
  assert.strictEqual(closed.difference, null);
  assert.ok(closed.expectedCash > 0);
  // openen zonder kastelling: beginsaldo = verwacht bedrag van vorige dienst
  const opened = await shop.startSession({ openingCash: 999 });
  assert.strictEqual(opened.openingCash, closed.expectedCash);
  await shop.savePosSettings({ cashControl: true, pinFor: { closeSession: false } });
  await shop.closeSession({ countedCash: opened.openingCash });
});

test("Vercel: functies in api/ werken met req/res, inclusief admin-doorverwijzing en webhook-body", async () => {
  const { Readable } = require("stream");
  function call(file, { method = "GET", url, headers = {}, body = "" }) {
    const req = Readable.from(body ? [Buffer.from(body)] : []);
    Object.assign(req, { method, url, headers });
    return new Promise((resolve) => {
      const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: String(b || "") }); } };
      require(file)(req, res);
    });
  }
  const pr = await call("../api/products.js", { url: "/api/products" });
  assert.strictEqual(pr.status, 200);
  assert.ok(JSON.parse(pr.body).products.length > 20);
  // Admin via /api/admin?path=… (zoals vercel.json doorverwijst)
  const login = await call("../api/admin.js", { method: "POST", url: "/api/admin?path=login", headers: { host: "localhost", "content-type": "application/json" }, body: JSON.stringify({ password: "geheim" }) });
  assert.strictEqual(login.status, 200);
  const cookie = login.headers["set-cookie"].split(";")[0];
  const order = await call("../api/admin.js", { url: "/api/admin?path=orders&months=1", headers: { host: "localhost", cookie } });
  assert.strictEqual(order.status, 200);
  assert.ok(Array.isArray(JSON.parse(order.body).orders));
  const nested = await call("../api/admin.js", { url: "/api/admin?path=pos%2Fsettings", headers: { host: "localhost", cookie } });
  assert.strictEqual(nested.status, 200);
  // Webhook met form-urlencoded body: zonder Mollie-sleutel netjes afgehandeld (geen crash)
  const wh = await call("../api/mollie-webhook.js", { method: "POST", url: "/api/mollie-webhook", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=tr_onbekend" });
  assert.ok(wh.status === 200 || wh.status === 500);
});

test("e-mails via Resend bij een webshopbestelling, en spamval", async (t) => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.MAIL_FROM = "worldwidewine.nl <bestellingen@worldwidewine.nl>";
  const realFetch = global.fetch;
  const mails = [];
  global.fetch = async (url, opts) => {
    if (String(url) === "https://api.resend.com/emails") { mails.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ id: "m" + mails.length }), { status: 200 }); }
    return realFetch(url, opts);
  };
  t.after(() => { global.fetch = realFetch; delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM; });
  const res = await orders.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ orderNumber: nr(), items: [{ id: "montemercurio-messaggero", qty: 1 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer }) });
  assert.strictEqual(res.statusCode, 200, res.body);
  assert.strictEqual(mails.length, 2);
  const toShop = mails.find((m) => m.to[0] === "info@worldwidewine.nl");
  const toCustomer = mails.find((m) => m.to[0] === "test@example.com");
  assert.ok(toShop && /Nieuwe bestelling WWW-/.test(toShop.subject));
  assert.strictEqual(toShop.reply_to, "test@example.com");
  assert.ok(toCustomer && /Bedankt voor je bestelling/.test(toCustomer.subject));
  assert.match(toCustomer.html, /betaalt bij het afhalen/i);
  assert.strictEqual(toCustomer.from, "worldwidewine.nl <bestellingen@worldwidewine.nl>");
  // Spamval: ingevuld verborgen veld → geweigerd, geen mail
  const spam = await orders.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ hp: "http://spam", orderNumber: nr(), items: [{ id: "montemercurio-messaggero", qty: 1 }], delivery: "afhalen-zaandam", payment: "bij-afhalen", customer }) });
  assert.strictEqual(spam.statusCode, 400);
  assert.strictEqual(mails.length, 2);
});

test("site-adres: SITE_URL, anders het productie-adres van Vercel", () => {
  const { siteUrl } = require("../lib/http");
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "worldwidewine.vercel.app";
  assert.strictEqual(siteUrl({ headers: { host: "x" } }), "https://worldwidewine.vercel.app");
  process.env.SITE_URL = "https://www.worldwidewine.nl/";
  assert.strictEqual(siteUrl({ headers: {} }), "https://www.worldwidewine.nl");
  delete process.env.SITE_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  assert.strictEqual(siteUrl({ headers: { "x-forwarded-proto": "https", host: "a.b" } }), "https://a.b");
});

test("duidelijke foutmeldingen bij verkeerde Supabase-instellingen", async () => {
  const { explain } = require("../lib/db");
  assert.match(explain({ code: "42501", message: "permission denied for table products" }), /secret key/);
  assert.match(explain({ code: "PGRST205", message: "Could not find the table 'public.pos_sessions' in the schema cache" }), /setup\.sql/);
  assert.match(explain({ code: "PGRST301", message: "JWSError" }), /sleutel is ongeldig/);
  assert.match(explain({ code: "", message: "TypeError: fetch failed" }), /SUPABASE_URL/);
  // Echte fout met de publieke (anon) sleutel tegen de lokale database
  const { createClient } = require("@supabase/supabase-js");
  const { error } = await createClient(stack.url, stack.anonKey, { auth: { persistSession: false } }).from("products").select("id").limit(1);
  assert.match(explain(error), /niet de anon\/publishable key/);
});
