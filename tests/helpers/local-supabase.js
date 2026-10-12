// Start een lokale "mini-Supabase" voor de tests: een lege Postgres-database met het
// schema uit supabase/migrations, en PostgREST ervoor (dezelfde API die Supabase gebruikt).
//
// Nodig: een lokale Postgres en het programma `postgrest` (https://postgrest.org).
//   WWW_TEST_PG     verbinding met Postgres (standaard postgres://postgres:postgres@127.0.0.1:5432/postgres)
//   POSTGREST_BIN   pad naar postgrest (standaard: postgrest uit het PATH)
// Ontbreekt een van beide, dan worden de databasetests overgeslagen.
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PG = process.env.WWW_TEST_PG || "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const POSTGREST = process.env.POSTGREST_BIN || "postgrest";

function psql(url, args, input) {
  const r = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-X"].concat(args), { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error("psql: " + (r.stderr || r.error));
  return r.stdout;
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function jwt(payload, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = b64({ alg: "HS256", typ: "JWT" }) + "." + b64(payload);
  return body + "." + crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

function available() {
  const pg = spawnSync("psql", [PG, "-X", "-c", "select 1"], { encoding: "utf8" });
  if (pg.status !== 0) return "Postgres niet bereikbaar via " + PG;
  const pr = spawnSync(POSTGREST, ["--version"], { encoding: "utf8" });
  if (pr.status !== 0) return "postgrest niet gevonden (" + POSTGREST + ")";
  return null;
}

async function start() {
  const dbName = "www_test_" + crypto.randomBytes(4).toString("hex");
  psql(PG, ["-c", "create database " + dbName]);
  const url = PG.replace(/\/[^/?]*(\?|$)/, "/" + dbName + "$1");

  // Rollen zoals in Supabase (bestaan per Postgres-server, dus alleen aanmaken als ze ontbreken).
  psql(url, [], `
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    grant usage on schema public to anon, authenticated, service_role;
    -- Supabase geeft standaard rechten op nieuwe tabellen aan alle rollen; de migratie moet die weer intrekken.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const dir = path.join(ROOT, "supabase", "migrations");
  fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().forEach((f) => psql(url, ["-f", path.join(dir, f)]));

  const secret = crypto.randomBytes(32).toString("hex");
  const restPort = await freePort();
  const proc = spawn(POSTGREST, [], {
    env: Object.assign({}, process.env, {
      PGRST_DB_URI: url, PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: secret, PGRST_SERVER_PORT: String(restPort), PGRST_LOG_LEVEL: "crit"
    }),
    stdio: "ignore"
  });

  // Supabase serveert PostgREST onder /rest/v1; een kleine proxy bootst dat na.
  const proxyPort = await freePort();
  const proxy = http.createServer((req, res) => {
    const target = req.url.replace(/^\/rest\/v1/, "") || "/";
    const fwd = http.request({ host: "127.0.0.1", port: restPort, path: target, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    fwd.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
    req.pipe(fwd);
  }).listen(proxyPort);

  // Wachten tot PostgREST klaar is.
  const serviceKey = jwt({ role: "service_role", iss: "test" }, secret);
  const anonKey = jwt({ role: "anon", iss: "test" }, secret);
  for (let i = 0; i < 100; i++) {
    const ok = await fetch("http://127.0.0.1:" + restPort + "/products?limit=1", { headers: { Authorization: "Bearer " + serviceKey } })
      .then((r) => r.ok).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    url: "http://127.0.0.1:" + proxyPort, serviceKey, anonKey, dbUrl: url,
    async stop() {
      proc.kill();
      await new Promise((r) => proxy.close(r));
      await new Promise((r) => setTimeout(r, 200));
      try { psql(PG, ["-c", "drop database if exists " + dbName + " with (force)"]); } catch (e) { /* opruimen mislukt */ }
    }
  };
}

module.exports = { available, start, psql };
