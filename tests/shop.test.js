// Tests voor de serverlogica: npm test
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.WWW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "www-test-"));
process.env.ADMIN_PASSWORD = "geheim";
const shop = require("../netlify/lib/shop");
const auth = require("../netlify/lib/auth");
const admin = require("../netlify/functions/admin");
const orders = require("../netlify/functions/orders");
const products = require("../netlify/functions/products");

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
