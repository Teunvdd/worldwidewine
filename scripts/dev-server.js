// Lokale testserver: draait de website en de serverfuncties zonder Netlify.
// Gegevens worden opgeslagen in de map .data/ (niet in git).
//
//   npm run dev            → http://localhost:8888  (admin-wachtwoord: "admin")
//   PORT=3000 npm run dev
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 8888;
process.env.WWW_DATA_DIR = process.env.WWW_DATA_DIR || path.join(ROOT, ".data");
if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = "admin";
  console.log('Let op: lokaal admin-wachtwoord is "admin". Stel ADMIN_PASSWORD in om dit te wijzigen.');
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json" };
const forms = [];

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const body = Buffer.concat(chunks).toString("utf8");
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.split("/")[2];
      const file = path.join(ROOT, "netlify/functions", name + ".js");
      if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      const event = {
        httpMethod: req.method, path: url.pathname, headers: req.headers, body,
        queryStringParameters: Object.fromEntries(url.searchParams)
      };
      try {
        const r = await require(file).handler(event);
        res.writeHead(r.statusCode, r.headers || {});
        return res.end(r.body || "");
      } catch (e) {
        console.error(e); res.writeHead(500); return res.end(String(e));
      }
    }
    if (req.method === "POST") { // nabootsing van Netlify Forms
      forms.push(Object.fromEntries(new URLSearchParams(body)));
      console.log("Formulier ontvangen:", forms[forms.length - 1]["form-name"]);
      res.writeHead(200); return res.end("ok");
    }
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || /[\\/]\.(data|git)|node_modules|netlify[\\/]/.test(file)) { res.writeHead(404); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end("Niet gevonden"); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
}).listen(PORT, () => console.log("WorldWideWine.nl draait op http://localhost:" + PORT + "  (admin: /admin/)"));
