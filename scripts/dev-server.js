// Lokale testserver: draait de website en de serverfuncties zoals op Vercel.
//
//   npm run dev                → gebruikt de Supabase-database uit .env (zie .env.example)
//   WWW_LOCAL_DB=1 npm run dev → start een tijdelijke lokale database (Postgres + PostgREST nodig,
//                                gegevens verdwijnen bij afsluiten)
//   PORT=3000 npm run dev
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 8888;

// .env inlezen (KEY=waarde per regel)
try {
  fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch (e) { /* geen .env */ }

if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = "admin";
  console.log('Let op: lokaal admin-wachtwoord is "admin". Stel ADMIN_PASSWORD in om dit te wijzigen.');
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json" };
const PUBLIC = path.join(ROOT, "public");

// Bootst Vercel na: statische bestanden uit public/, serverfuncties uit api/,
// en de doorverwijzing /api/admin/<pad> → /api/admin?path=<pad> uit vercel.json.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/")) {
    let name = url.pathname.split("/")[2];
    if (name === "admin") {
      const rest = url.pathname.replace(/^\/api\/admin\/?/, "");
      url.searchParams.set("path", rest);
      req.url = "/api/admin?" + url.searchParams.toString();
    }
    const file = path.join(ROOT, "api", name + ".js");
    if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    try { return await require(file)(req, res); }
    catch (e) { console.error(e); res.writeHead(500); return res.end(String(e)); }
  }

  if (url.pathname.startsWith("/uploads/") && process.env.WWW_LOCAL_UPLOADS) {
    const name = path.basename(decodeURIComponent(url.pathname));
    return fs.readFile(path.join(process.env.WWW_LOCAL_UPLOADS, name), (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(name)] || "application/octet-stream" });
      res.end(data);
    });
  }

  let file = path.join(PUBLIC, decodeURIComponent(url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(404); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) {
      return fs.readFile(path.join(PUBLIC, "404.html"), (e2, page) => { res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end(page || "Niet gevonden"); });
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

(async () => {
  if (process.env.WWW_LOCAL_DB) {
    const local = require("../tests/helpers/local-supabase");
    const missing = local.available();
    if (missing) { console.error("Lokale database niet mogelijk: " + missing); process.exit(1); }
    const stack = await local.start();
    process.env.SUPABASE_URL = stack.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = stack.serviceKey;
    process.env.WWW_LOCAL_UPLOADS = process.env.WWW_LOCAL_UPLOADS || path.join(ROOT, ".data", "uploads");
    // Zonder e-maildienst: de inlogcode voor Mijn account verschijnt dan op het scherm.
    if (!process.env.RESEND_API_KEY) process.env.WWW_DEV_LOGIN = "1";
    console.log("Tijdelijke lokale database gestart.");
    const stop = () => stack.stop().then(() => process.exit(0));
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
  } else if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Let op: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreken. Zet ze in .env (zie .env.example) of gebruik WWW_LOCAL_DB=1.");
  }
  server.listen(PORT, () => console.log("WorldWideWine.nl draait op http://localhost:" + PORT + "  (admin: /admin/)"));
})();
