// Opslag van producten, bestellingen, klanten en voorraadmutaties.
//
// Op Netlify: Netlify Blobs (ingebouwde opslag, geen extra account nodig).
// Lokaal (scripts/dev-server.js en tests): JSON-bestanden in de map WWW_DATA_DIR.
const fs = require("fs");
const path = require("path");

const STORE_NAME = "worldwidewine";
let blobStore = null;

function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (key) => path.join(dir, key.replace(/[^a-z0-9_-]/gi, "_") + ".json");
  return {
    async get(key) {
      try { return JSON.parse(fs.readFileSync(file(key), "utf8")); } catch (e) { return null; }
    },
    async set(key, value) {
      const f = file(key);
      fs.writeFileSync(f + ".tmp", JSON.stringify(value, null, 1));
      fs.renameSync(f + ".tmp", f);
    },
    // Lokaal draait alles in één proces, dus lezen-wijzigen-schrijven is veilig.
    async update(key, fn, fallback) {
      const current = await this.get(key);
      const next = await fn(current == null ? fallback : current);
      await this.set(key, next);
      return next;
    }
  };
}

function netlifyStore() {
  const { getStore } = require("@netlify/blobs");
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  return {
    async get(key) { return store.get(key, { type: "json" }); },
    async set(key, value) { await store.setJSON(key, value); },
    // Voorkomt dat twee gelijktijdige wijzigingen (bijv. webshop en kassa) elkaar
    // overschrijven: schrijf alleen als het document sinds het lezen niet is veranderd.
    async update(key, fn, fallback) {
      for (let attempt = 0; attempt < 25; attempt++) {
        const found = await store.getWithMetadata(key, { type: "json" });
        const current = found ? found.data : fallback;
        const next = await fn(JSON.parse(JSON.stringify(current)));
        // Zonder versiecode (etag) kan niet conditioneel worden opgeslagen; dan gewoon opslaan.
        const opts = !found ? { onlyIfNew: true } : found.etag ? { onlyIfMatch: found.etag } : {};
        const res = await store.setJSON(key, next, opts);
        if (!res || res.modified !== false) return next;
        // Even wachten (met wat willekeur) zodat gelijktijdige verzoeken elkaar niet blijven raken.
        await new Promise((r) => setTimeout(r, Math.min(400, 15 * (attempt + 1)) + Math.random() * 60));
      }
      throw new Error("Opslaan mislukt door gelijktijdige wijziging, probeer opnieuw.");
    }
  };
}

// Moet aan het begin van elke functie worden aangeroepen met het event.
function connect(event) {
  if (process.env.WWW_DATA_DIR) return;
  if (!blobStore) {
    try { require("@netlify/blobs").connectLambda(event); } catch (e) { /* lokaal zonder blobs */ }
  }
}

function db() {
  if (process.env.WWW_DATA_DIR) return fileStore(process.env.WWW_DATA_DIR);
  if (!blobStore) blobStore = netlifyStore();
  return blobStore;
}

module.exports = { db, connect };
