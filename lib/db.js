// Verbinding met de Supabase-database.
//
// Nodig (Vercel → Settings → Environment Variables):
//   SUPABASE_URL               bijv. https://abcdefgh.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  de geheime sleutel (sb_secret_… of de service_role-sleutel)
// Deze sleutel geeft volledige toegang en mag alleen op de server staan, nooit in de browser.
const { createClient } = require("@supabase/supabase-js");
const { HttpError } = require("./http");

let client = null;

function db() {
  if (!client) {
    const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
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
  if (code === "23503") return new HttpError(409, "Deze categorie of dit product bestaat niet (meer). Vernieuw de pagina.");
  if (code === "23505") {
    const text = Object.keys(unique || {}).find((k) => String(error.message + " " + error.details).indexOf(k) >= 0);
    return new HttpError(409, text ? unique[text] : "Dit bestaat al.");
  }
  console.error("Databasefout", error);
  return new HttpError(500, explain(error));
}

// Begrijpelijke uitleg bij de meest voorkomende instellingsfouten.
function explain(error) {
  const code = String((error && error.code) || "");
  const msg = String((error && error.message) || "") + " " + String((error && error.details) || "");
  if (code === "PGRST204" || code === "42703" || /Could not find the '.*' column|column .* does not exist/i.test(msg)) {
    return "De database mist een nieuwe kolom. Voer supabase/setup.sql opnieuw uit in Supabase → SQL Editor. (" + (code || "kolom ontbreekt") + ")";
  }
  if (code === "42P01" || code === "PGRST205" || /does not exist|Could not find the table/i.test(msg)) {
    return "De databasetabellen ontbreken. Voer supabase/setup.sql uit in Supabase → SQL Editor. (" + (code || "tabel ontbreekt") + ")";
  }
  if (code === "PGRST202" || /Could not find the function/i.test(msg)) {
    return "De databasefuncties ontbreken of zijn verouderd. Voer supabase/setup.sql (opnieuw) uit in Supabase → SQL Editor. (" + code + ")";
  }
  if (code === "42501" || /permission denied/i.test(msg)) {
    return "Geen toegang tot de database. Gebruik bij SUPABASE_SERVICE_ROLE_KEY de secret key (sb_secret_…) of service_role-sleutel, niet de anon/publishable key. (42501)";
  }
  if (/^PGRST30/.test(code) || /Invalid API key|JWSError|JWT|No API key/i.test(msg)) {
    return "De Supabase-sleutel is ongeldig. Kopieer de secret key opnieuw naar SUPABASE_SERVICE_ROLE_KEY (zonder spaties) en deploy opnieuw. (" + (code || "sleutel") + ")";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo|bad port/i.test(msg)) {
    return "Supabase is niet bereikbaar. Controleer SUPABASE_URL (bijv. https://abcdefgh.supabase.co, zonder /rest/v1) en of het project niet is gepauzeerd.";
  }
  return "Er ging iets mis met de database" + (code ? " (" + code + ")" : "") + ": " + String(error && error.message || "onbekende fout").slice(0, 160);
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

module.exports = { db, run, all, reset, explain };
