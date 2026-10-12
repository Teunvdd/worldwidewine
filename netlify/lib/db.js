// Verbinding met de Supabase-database.
//
// Nodig (Netlify → Site configuration → Environment variables):
//   SUPABASE_URL               bijv. https://abcdefgh.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  de geheime sleutel (sb_secret_… of de service_role-sleutel)
// Deze sleutel geeft volledige toegang en mag alleen op de server staan, nooit in de browser.
const { createClient } = require("@supabase/supabase-js");
const { HttpError } = require("./http");

let client = null;

function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new HttpError(503, "De database is nog niet ingesteld (SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY, zie README).");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

// Vertaalt databasefouten naar nette meldingen. `unique` geeft per constraint een eigen tekst.
function fail(error, unique) {
  const code = error && error.code;
  if (code === "P0001") return new HttpError(409, error.message);
  if (code === "P0002") return new HttpError(404, error.message);
  if (code === "22P02") return new HttpError(404, "Niet gevonden.");
  if (code === "23505") {
    const text = Object.keys(unique || {}).find((k) => String(error.message + " " + error.details).indexOf(k) >= 0);
    return new HttpError(409, text ? unique[text] : "Dit bestaat al.");
  }
  console.error("Databasefout", error);
  return new HttpError(500, "Er ging iets mis met de database. Probeer het opnieuw.");
}

// Haalt het resultaat op of gooit een nette fout.
async function run(query, unique) {
  const { data, error } = await query;
  if (error) throw fail(error, unique);
  return data;
}

// Haalt alle rijen op, ook als het er meer zijn dan de standaardlimiet van Supabase (1000).
async function all(build) {
  const size = 1000;
  let out = [];
  for (let from = 0; ; from += size) {
    const rows = await run(build().range(from, from + size - 1));
    out = out.concat(rows);
    if (rows.length < size) return out;
  }
}

// Alleen voor tests.
function reset() { client = null; }

module.exports = { db, run, all, reset };
