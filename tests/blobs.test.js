// Test de Netlify Blobs-opslag (met de lokale Blobs-server van Netlify),
// inclusief gelijktijdige voorraadwijzigingen vanuit webshop en kassa.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { BlobsServer } = require("@netlify/blobs/server");

// De lokale Blobs-emulator wijkt op drie punten af van de echte Netlify-opslag:
// hij stuurt bij lezen geen etag mee, de etag hangt af van de bestandstijd (niet de inhoud),
// en de controle bij conditioneel opslaan is niet atomair. Voor deze test passen we dat aan,
// zodat de herhaal-logica in netlify/lib/store.js tegen realistisch servergedrag wordt getest.
const crypto = require("crypto");
BlobsServer.generateETag = async function (filePath) {
  try { return '"' + crypto.createHash("sha256").update(await fs.promises.readFile(filePath)).digest("hex") + '"'; } catch (e) { return ""; }
};
const originalHandle = BlobsServer.prototype.handleRequest;
let queue = Promise.resolve();
BlobsServer.prototype.handleRequest = function (req, res) {
  const run = queue.then(() => originalHandle.call(this, req, res));
  queue = run.catch(() => {});
  return run;
};
const originalGet = BlobsServer.prototype.get;
BlobsServer.prototype.get = async function (req) {
  const res = await originalGet.call(this, req);
  if (res.status !== 200) return res;
  const match = this.parseAPIRequest(req);
  const { dataPath, key } = this.getLocalPaths(match && match.url ? match.url : new URL(req.url || "", this.address));
  if (!key) return res;
  const headers = new Headers(res.headers);
  headers.set("etag", await BlobsServer.generateETag(dataPath));
  return new Response(await res.arrayBuffer(), { status: 200, headers });
};

test("gelijktijdige verkopen overschrijven elkaar niet", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "www-blobs-"));
  const server = new BlobsServer({ directory: dir, token: "test-token", port: 0 });
  const { port } = await server.start();
  t.after(() => server.stop());

  delete process.env.WWW_DATA_DIR;
  const url = "http://localhost:" + port;
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: url, uncachedEdgeURL: url, token: "test-token", siteID: "site" })).toString("base64");
  const shop = require("../netlify/lib/shop");

  await shop.changeStock([{ id: "koremans-limoncello", set: 20 }], "Geteld");
  await Promise.all(Array.from({ length: 10 }, () => shop.createPosSale({ items: [{ id: "koremans-limoncello", qty: 1 }], payment: "pin" })));
  const p = (await shop.getProducts()).find((x) => x.id === "koremans-limoncello");
  assert.strictEqual(p.stock, 10);
  const sales = (await shop.listOrders(1)).filter((o) => o.channel === "winkel");
  assert.strictEqual(sales.length, 10);
  assert.strictEqual(new Set(sales.map((o) => o.number)).size, 10, "unieke bonnummers");
});
