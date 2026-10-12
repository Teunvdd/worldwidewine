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
// Eerste beschikbare afhaalmoment (afhalen vraagt een dag en tijd).
const slot = () => { const d = require("../public/data/order.js").pickupDays(require("../public/data/config.js"))[0]; return { pickupDate: d.date, pickupTime: d.times[0] }; };

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
    shop.createWebOrder({ orderNumber: nr(), items: [{ id: "wiston-estate-brut", qty: 4 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer }),
    /nog maar 3/
  );
  const p = (await shop.getProducts()).find((x) => x.id === "wiston-estate-brut");
  assert.strictEqual(p.stock, 3);
});

test("prijzen komen van de server, niet van de klant", async () => {
  const order = await shop.createWebOrder({ orderNumber: nr(), items: [{ id: "montemercurio-messaggero", qty: 1, price: 0.01 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer });
  assert.strictEqual(order.total, 23);
});

test("annuleren zet de voorraad terug", async () => {
  const number = nr();
  await shop.createWebOrder({ orderNumber: number, items: [{ id: "wiston-estate-brut", qty: 1 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer });
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
  await assert.rejects(shop.createWebOrder({ orderNumber: nr(), items: [{ id: "huiswijn-rood-van-het-vat", qty: 1 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer }), /niet te bestellen/);
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
  for (const table of ["products", "customers", "orders", "order_lines", "stock_movements", "pos_sessions", "settings", "categories", "news", "customer_logins"]) {
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
    shop.createWebOrder({ orderNumber: nr(), items: [{ id: "domaine-de-la-begude-bandol-blanc", qty: 1 }, { id: "domaine-daridan-cheverny-blanc", qty: 1 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer })));
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.strictEqual(ok, 5, "precies 5 bestellingen mogen slagen");
  results.filter((r) => r.status === "rejected").forEach((r) => assert.match(r.reason.message, /nog maar 0 op voorraad|uitverkocht/));
  const list = await shop.getProducts();
  assert.strictEqual(list.find((p) => p.id === "domaine-de-la-begude-bandol-blanc").stock, 0);
  assert.strictEqual(list.find((p) => p.id === "domaine-daridan-cheverny-blanc").stock, 20 - 10 - 5);
});

test("mislukte bestelling laat geen halve gegevens achter", async () => {
  const number = nr();
  await shop.createWebOrder({ orderNumber: number, items: [{ id: "domaine-daridan-cheverny-blanc", qty: 1 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer });
  const before = (await shop.getProducts()).find((p) => p.id === "domaine-daridan-cheverny-blanc").stock;
  // Zelfde ordernummer nog eens: moet geweigerd worden, en de voorraad mag niet veranderen
  await assert.rejects(shop.createWebOrder({ orderNumber: number, items: [{ id: "domaine-daridan-cheverny-blanc", qty: 1 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer }), /bestaat al/);
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
    shop.createWebOrder({ orderNumber: nr(), items: [{ id, qty: 1, box: true }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer }),
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
  const order = await shop.createWebOrder({ orderNumber: number, items: [{ id, qty: 1, box: true }, { id, qty: 2 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer });
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
    shop.createWebOrder({ orderNumber: nr(), items: [{ id, qty: 3, box: true }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer }),
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

test("soort is vrij in te vullen; vaste soorten worden herkend", async () => {
  const id = "koremans-limoncello";
  const before = (await shop.getProducts()).find((x) => x.id === id).type;
  const free = await shop.saveProduct({ originalId: id, type: "Oranje wijn" });
  assert.strictEqual(free.type, "Oranje wijn");
  assert.strictEqual((await shop.publicProducts()).find((x) => x.id === id).type, "Oranje wijn");
  assert.strictEqual((await shop.saveProduct({ originalId: id, type: "Rosé" })).type, "rose");
  assert.strictEqual((await shop.saveProduct({ originalId: id, type: "ROOD" })).type, "rood");
  await assert.rejects(shop.saveProduct({ originalId: id, type: "  " }), /soort/);
  await shop.saveProduct({ originalId: id, type: before });
});

test("import uit Excel: bijwerken op code, nieuw product, voorraad en fouten per rij", async () => {
  const id = "montemercurio-messaggero";
  const before = (await shop.getProducts()).find((x) => x.id === id);
  const res = await shop.importProducts([
    { _row: 2, id: "Montemercurio Messaggero", price: 25.5, region: "Toscane", stock: 33, category: "Import test" },
    { _row: 3, id: "nieuw-import-product", producer: "Testhuis", name: "Importwijn", type: "Oranje wijn", price: 12, stock: 7, webshop: false },
    { _row: 4, producer: "Testhuis", name: "Kapot", price: "abc" },
    { _row: 5, id: id, alcohol: 250 }
  ]);
  assert.strictEqual(res.updated, 1);
  assert.strictEqual(res.created, 1);
  assert.strictEqual(res.stock, 1);
  assert.deepStrictEqual(res.errors.map((x) => x.row), [4, 5]);
  const all = await shop.getProducts();
  const upd = all.find((x) => x.id === id);
  assert.strictEqual(upd.price, 25.5);
  assert.strictEqual(upd.region, "Toscane");
  assert.strictEqual(upd.stock, 33);
  assert.strictEqual(upd.name, before.name); // niet in het bestand → ongewijzigd
  const cat = (await shop.getCategories()).find((c) => c.name === "Import test");
  assert.strictEqual(upd.categoryId, cat.id);
  const nieuw = all.find((x) => x.id === "nieuw-import-product");
  assert.strictEqual(nieuw.type, "Oranje wijn");
  assert.strictEqual(nieuw.stock, 7);
  assert.strictEqual(nieuw.webshop, false);
  const log = await shop.stockLog(1);
  assert.ok(log.some((m) => m.id === id && m.reason === "Import uit Excel" && m.after === 33));
  await shop.deleteProduct("nieuw-import-product");
  await shop.saveProduct({ originalId: id, price: before.price, region: before.region || "", categoryId: null });
  await shop.deleteCategory(cat.id);
});

test("nieuws: plaatsen met foto, concept en gepland niet zichtbaar, bewerken en verwijderen", async () => {
  const fs = require("fs"), os = require("os"), path = require("path");
  const news = require("../lib/news");
  const newsApi = require("../lib/handlers/news");
  process.env.WWW_LOCAL_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "www-news-"));
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await assert.rejects(news.saveNews({ title: "  " }), /titel/);
  const a = await news.saveNews({ title: "Nieuwe jaargang Brunello!", body: "Eerste alinea.\n\nTweede.", image: png });
  assert.strictEqual(a.slug, "nieuwe-jaargang-brunello");
  assert.match(a.image, /^\/uploads\/nieuws-nieuwe-jaargang-brunello-.*\.png$/);
  const b = await news.saveNews({ title: "Nieuwe jaargang Brunello", body: "x" });
  assert.strictEqual(b.slug, "nieuwe-jaargang-brunello-2");
  const draft = await news.saveNews({ title: "Concept", body: "", published: false });
  const later = await news.saveNews({ title: "Gepland", body: "", publishedAt: new Date(Date.now() + 86400000).toISOString() });
  const res = await newsApi.handler({ httpMethod: "GET", headers: {} });
  const pub = JSON.parse(res.body).news.map((n) => n.title);
  assert.ok(pub.includes(a.title) && pub.includes(b.title));
  assert.ok(!pub.includes("Concept") && !pub.includes("Gepland"));
  // Bewerken: titel wijzigt, link blijft gelijk; foto weghalen.
  const edited = await news.saveNews({ id: a.id, title: "Brunello 2019 is binnen", body: a.body, image: "" });
  assert.strictEqual(edited.slug, a.slug);
  assert.strictEqual(edited.image, null);
  assert.strictEqual((await news.listNews()).length, 4);
  for (const n of [a, b, draft, later]) await news.deleteNews(n.id);
  await assert.rejects(news.deleteNews(a.id), /niet gevonden/);
  delete process.env.WWW_LOCAL_UPLOADS;
});

test("afrekenen: afhaalmoment verplicht en geldig, bezorgen alleen binnen het postcodegebied", async () => {
  const items = [{ id: "montemercurio-messaggero", qty: 1 }];
  await assert.rejects(shop.createWebOrder({ orderNumber: nr(), items, delivery: "afhalen-zaandam", payment: "bij-afhalen", customer }), /dag en tijd/);
  await assert.rejects(shop.createWebOrder({ orderNumber: nr(), items, delivery: "afhalen-zaandam", pickupDate: "2020-01-03", pickupTime: "10:00", payment: "bij-afhalen", customer }), /dag en tijd/);
  const s = slot();
  const order = await shop.createWebOrder({ orderNumber: nr(), items, delivery: "afhalen-zaandam", ...s, payment: "bij-afhalen", customer });
  assert.match(order.pickupMoment, new RegExp(" om " + s.pickupTime + " uur$"));
  assert.strictEqual((await shop.getOrder(order.number)).pickupMoment, order.pickupMoment);
  await shop.setOrderStatus(order.number, "geannuleerd");
  // Utrecht (1234 AB is buiten het gebied) → geweigerd; Amsterdam → goed.
  await assert.rejects(shop.createWebOrder({ orderNumber: nr(), items, delivery: "bezorgen-regio", payment: "betaalverzoek", customer }), /bezorgen we helaas niet/);
  const amsCustomer = Object.assign({}, customer, { postcode: "1012 AB", city: "Amsterdam" });
  const ams = await shop.createWebOrder({ orderNumber: nr(), items, delivery: "bezorgen-regio", payment: "betaalverzoek", customer: amsCustomer });
  assert.strictEqual(ams.delivery, "bezorgen-regio");
  assert.strictEqual(ams.pickupMoment, null);
  await shop.setOrderStatus(ams.number, "geannuleerd");
});

test("winkel: openingstijden, afhaaltijden per week en bezorggebied uit de admin", async () => {
  const shopinfo = require("../lib/shopinfo");
  const ORDER = require("../public/data/order.js");
  const items = [{ id: "montemercurio-messaggero", qty: 1 }];
  const s0 = await shopinfo.getShopSettings();
  assert.strictEqual(s0.hours.week[5].s, "open");
  assert.strictEqual(s0.area.price, 7.5);

  // Ongeldige invoer wordt geweigerd.
  await assert.rejects(shopinfo.saveShopSettings({ hours: { week: { 1: { s: "open", from: "18:00", to: "10:00" } } } }), /maandag/);
  await assert.rejects(shopinfo.saveShopSettings({ area: { postcodes: [[1100, 1000, "x"]], price: 5 } }), /klopt niet/);
  await assert.rejects(shopinfo.saveShopSettings({ pickup: { week: {}, leadMinutes: 60, daysAhead: 500 } }), /Vooruit plannen/);
  await assert.rejects(shopinfo.saveShopSettings({ pickup: { week: { 2: [["12:00", "11:00"]] }, leadMinutes: 60, daysAhead: 14 } }), /dinsdag/);

  // Openingstijden gaan over de website; een dag dicht zetten bewaart alleen die afwijking.
  const first = slot();
  await shopinfo.saveShopSettings({ hours: { week: s0.hours.week, dates: { [first.pickupDate]: { s: "dicht" }, "2020-01-01": { s: "dicht" } } } });
  const s1 = await shopinfo.getShopSettings();
  assert.deepStrictEqual(Object.keys(s1.hours.dates), [first.pickupDate]); // oude datums worden opgeruimd
  const info = await shopinfo.publicInfo();
  assert.strictEqual(info.hours.thisWeek.length, 7);

  // Afhaaltijden: die dag geen afhalen → verdwijnt uit de afhaalmomenten en wordt geweigerd.
  await shopinfo.saveShopSettings({ pickup: Object.assign({}, s0.pickup, { dates: { [first.pickupDate]: [] } }) });
  assert.ok((await shopinfo.publicInfo()).pickupDays.every((d) => d.date !== first.pickupDate));
  await assert.rejects(shop.createWebOrder({ orderNumber: nr(), items, delivery: "afhalen-zaandam", ...first, payment: "bij-afhalen", customer }), /dag en tijd/);
  // Alleen nog zondag 12:00–13:00, elk kwartier.
  await shopinfo.saveShopSettings({ pickup: { week: { 0: [["12:00", "13:00"]] }, dates: {}, slotMinutes: 15, leadMinutes: 60, daysAhead: 14 } });
  const days = (await shopinfo.publicInfo()).pickupDays;
  assert.ok(days.length >= 1 && days.every((d) => d.label.startsWith("zondag")));
  assert.deepStrictEqual(days[days.length - 1].times, ["12:00", "12:15", "12:30", "12:45"]);
  const sun = await shop.createWebOrder({ orderNumber: nr(), items, delivery: "afhalen-zaandam", pickupDate: days[days.length - 1].date, pickupTime: "12:45", payment: "bij-afhalen", customer });
  assert.match(sun.pickupMoment, /^zondag .* om 12:45 uur$/);
  await shop.setOrderStatus(sun.number, "geannuleerd");

  // Bezorggebied: alleen Utrecht, andere prijs, altijd bezorgkosten.
  await shopinfo.saveShopSettings({ area: { postcodes: [[1234, 1234, "Testgebied"]], price: 4.5, freeFrom: "" } });
  const amsCustomer = Object.assign({}, customer, { postcode: "1012 AB", city: "Amsterdam" });
  const input = { items, delivery: "bezorgen-regio", payment: "betaalverzoek" };
  await assert.rejects(shop.createWebOrder(Object.assign({ orderNumber: nr(), customer: amsCustomer }, input)), /bezorgen we helaas niet/);
  const o = await shop.createWebOrder(Object.assign({ orderNumber: nr(), customer }, input));
  assert.strictEqual(o.shipping, 4.5);
  await shop.setOrderStatus(o.number, "geannuleerd");

  // Via de admin-API en de publieke API.
  const login = await admin.handler({ httpMethod: "POST", path: "/api/admin/login", headers: {}, body: JSON.stringify({ password: "geheim" }) });
  const cookie = login.headers["Set-Cookie"].split(";")[0];
  const get = await admin.handler({ httpMethod: "GET", path: "/api/admin/shop-settings", headers: { cookie } });
  assert.strictEqual(JSON.parse(get.body).settings.area.price, 4.5);
  const pub = await require("../lib/handlers/shop-info").handler({ httpMethod: "GET", headers: {} });
  const body = JSON.parse(pub.body);
  assert.strictEqual(body.area.freeFrom, null);
  assert.ok(Array.isArray(body.pickupDays) && Array.isArray(body.tastingPhotos));
  assert.strictEqual(ORDER.deliversTo({ postcodes: body.area.postcodes }, "1234 AB"), true);

  // Terug naar de standaardwaarden voor de andere tests.
  const d = shopinfo.defaults();
  await shopinfo.saveShopSettings(d);
});

test("foto's proeverijen: toevoegen, volgorde, onderschrift en verwijderen", async () => {
  const shopinfo = require("../lib/shopinfo");
  const png = "data:image/png;base64," + Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c30000000049454e44ae426082", "hex").toString("base64");
  process.env.WWW_LOCAL_UPLOADS = process.env.WWW_LOCAL_UPLOADS || require("path").join(require("os").tmpdir(), "www-test-uploads");
  await assert.rejects(shopinfo.addTastingPhoto("data:text/plain;base64,aGFsbG8="), /JPG/);
  await shopinfo.addTastingPhoto(png, "Proeverij in de winkel");
  const list = await shopinfo.addTastingPhoto(png);
  assert.strictEqual(list.length, 2);
  // Volgorde omdraaien; onbekende adressen worden genegeerd.
  const swapped = await shopinfo.saveTastingPhotos([{ url: list[1].url, caption: "Bij een klant thuis" }, list[0], { url: "https://evil.example/x.jpg" }]);
  assert.deepStrictEqual(swapped.map((p) => p.caption), ["Bij een klant thuis", "Proeverij in de winkel"]);
  assert.strictEqual((await shopinfo.publicInfo()).tastingPhotos.length, 2);
  assert.deepStrictEqual(await shopinfo.saveTastingPhotos([]), []);
});

test("mijn account: inloggen met code, bestellingen met afhaalmoment, gegevens en nieuwsbrief", async () => {
  const handler = require("../lib/handlers/account").handler;
  const call = (method, body, cookie) => handler({ httpMethod: method, headers: Object.assign({ host: "localhost" }, cookie ? { cookie } : {}), body: body ? JSON.stringify(body) : undefined });
  const mail = "Klant.Account@example.com";
  // Bestelling met afhaalmoment en toestemming voor de nieuwsbrief.
  const s = slot();
  const order = await shop.createWebOrder({ orderNumber: nr(), items: [{ id: "montemercurio-messaggero", qty: 1 }], delivery: "afhalen-zaandam", ...s, payment: "bij-afhalen", newsletter: true, customer: Object.assign({}, customer, { email: mail }) });

  // Zonder e-maildienst en zonder testmodus kan er niet worden ingelogd.
  delete process.env.WWW_DEV_LOGIN;
  assert.strictEqual((await call("POST", { action: "code", email: mail })).statusCode, 503);
  process.env.WWW_DEV_LOGIN = "1";
  assert.strictEqual(JSON.parse((await call("GET")).body).loggedIn, false);
  assert.strictEqual((await call("POST", { action: "code", email: "geen-adres" })).statusCode, 400);
  const sent = JSON.parse((await call("POST", { action: "code", email: mail })).body);
  assert.match(sent.devCode, /^\d{6}$/);
  const wrong = sent.devCode === "000000" ? "111111" : "000000";
  const bad = await call("POST", { action: "login", email: mail, code: wrong });
  assert.strictEqual(bad.statusCode, 400);
  assert.match(JSON.parse(bad.body).error, /klopt niet/);
  const ok = await call("POST", { action: "login", email: mail, code: sent.devCode });
  assert.strictEqual(ok.statusCode, 200);
  const cookie = ok.headers["Set-Cookie"].split(";")[0];
  // De code werkt maar één keer.
  assert.strictEqual((await call("POST", { action: "login", email: mail, code: sent.devCode })).statusCode, 400);

  const me = JSON.parse((await call("GET", null, cookie)).body);
  assert.strictEqual(me.loggedIn, true);
  assert.strictEqual(me.profile.email, mail.toLowerCase());
  assert.strictEqual(me.profile.newsletter, true);
  const mine = me.orders.find((o) => o.number === order.number);
  assert.ok(mine && mine.pickup && mine.pickupMoment === order.pickupMoment);
  assert.strictEqual(mine.lines[0].qty, 1);
  assert.strictEqual(mine.customer, undefined); // geen interne velden

  // Afmelden voor de nieuwsbrief en gegevens wijzigen.
  const saved = JSON.parse((await call("POST", { action: "profile", newsletter: false, phone: "0687654321" }, cookie)).body).profile;
  assert.strictEqual(saved.newsletter, false);
  assert.strictEqual(saved.phone, "0687654321");
  // Zonder (of met een vervalste) sessie geen gegevens.
  assert.strictEqual((await call("POST", { action: "profile", newsletter: true })).statusCode, 401);
  assert.strictEqual(JSON.parse((await call("GET", null, cookie.replace(/.$/, "x"))).body).loggedIn, false);

  // Na 5 foute pogingen is de code ongeldig.
  const again = JSON.parse((await call("POST", { action: "code", email: mail })).body);
  for (let i = 0; i < 5; i++) await call("POST", { action: "login", email: mail, code: again.devCode === "000000" ? "111111" : "000000" });
  assert.strictEqual((await call("POST", { action: "login", email: mail, code: again.devCode })).statusCode, 400);
  await shop.setOrderStatus(order.number, "geannuleerd");
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
  const res = await orders.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ orderNumber: nr(), items: [{ id: "montemercurio-messaggero", qty: 1 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer }) });
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
  const spam = await orders.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ hp: "http://spam", orderNumber: nr(), items: [{ id: "montemercurio-messaggero", qty: 1 }], delivery: "afhalen-zaandam", ...slot(), payment: "bij-afhalen", customer }) });
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
