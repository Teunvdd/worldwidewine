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
  shop = require("../netlify/lib/shop");
  auth = require("../netlify/lib/auth");
  admin = require("../netlify/functions/admin");
  orders = require("../netlify/functions/orders");
  products = require("../netlify/functions/products");
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
  process.env.URL = "https://www.worldwidewine.nl";
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
  t.after(() => { global.fetch = realFetch; delete process.env.MOLLIE_API_KEY; delete process.env.URL; });

  const number = nr();
  calls.number = number;
  const res = await orders.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ orderNumber: number, items: [{ id: "montemercurio-messaggero", qty: 2 }], delivery: "postnl", payment: "online", customer }) });
  const out = JSON.parse(res.body);
  assert.strictEqual(res.statusCode, 200, res.body);
  assert.strictEqual(out.checkoutUrl, "https://mollie.test/pay");
  const sent = JSON.parse(calls[0].opts.body);
  assert.strictEqual(sent.amount.value, "55.95");
  assert.strictEqual(sent.webhookUrl, "https://www.worldwidewine.nl/api/mollie-webhook");

  const webhook = require("../netlify/functions/mollie-webhook");
  const wh = await webhook.handler({ httpMethod: "POST", headers: {}, body: "id=tr_abc" });
  assert.strictEqual(wh.statusCode, 200);
  const order = await shop.getOrder(number);
  assert.strictEqual(order.paymentStatus, "betaald");
  assert.strictEqual(order.status, "betaald");
});

test("publieke sleutel (anon) kan niets lezen of wijzigen", async () => {
  const { createClient } = require("@supabase/supabase-js");
  const anon = createClient(stack.url, stack.anonKey, { auth: { persistSession: false } });
  for (const table of ["products", "customers", "orders", "order_lines", "stock_movements", "pos_sessions", "settings"]) {
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
