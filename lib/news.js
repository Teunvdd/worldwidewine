// Nieuwsberichten: lijst voor de website en beheer in de admin (Supabase-tabel "news").
const { db, run } = require("./db");
const { HttpError, str } = require("./http");
const images = require("./images");

const fromRow = (r) => ({
  id: r.id, slug: r.slug, title: r.title, body: r.body || "", image: r.image || null,
  published: r.published !== false, publishedAt: new Date(r.published_at).toISOString(),
  updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null
});

const slugify = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "bericht";

const UNIQUE = { news_slug_key: "Er bestaat al een bericht met deze link." };

// Alle berichten (admin), nieuwste eerst.
async function listNews() {
  return (await run(db().from("news").select("*").order("published_at", { ascending: false }).limit(500))).map(fromRow);
}

// Gepubliceerde berichten voor de website (niet met een datum in de toekomst).
async function publicNews() {
  const rows = await run(db().from("news").select("*").eq("published", true).lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false }).limit(100));
  return rows.map(fromRow);
}

async function uniqueSlug(base) {
  let slug = base, n = 1;
  for (;;) {
    const rows = await run(db().from("news").select("id").eq("slug", slug));
    if (!rows.length) return slug;
    slug = base + "-" + ++n;
  }
}

// Opslaan. image: undefined = ongewijzigd, "" = foto weg, data-URL = nieuwe foto.
async function saveNews(input) {
  const title = str(input.title, 160).trim();
  if (!title) throw new HttpError(400, "Geef het bericht een titel.");
  const body = String(input.body == null ? "" : input.body).slice(0, 20000);
  const row = { title, body, published: input.published !== false, updated_at: new Date().toISOString() };
  if (input.publishedAt) {
    const d = new Date(input.publishedAt);
    if (isNaN(d)) throw new HttpError(400, "Ongeldige datum.");
    row.published_at = d.toISOString();
  }
  const id = input.id ? Number(input.id) : null;
  // De link (slug) wordt bij het plaatsen gemaakt en blijft daarna gelijk, ook als de titel verandert.
  const slug = id ? null : await uniqueSlug(slugify(title));
  if (slug) row.slug = slug;
  if (input.image !== undefined) {
    if (!input.image) row.image = null;
    else {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(input.image));
      if (!m) throw new HttpError(400, "Gebruik een foto in JPG-, PNG- of WebP-formaat.");
      const buffer = Buffer.from(m[2], "base64");
      if (buffer.length > 3 * 1024 * 1024) throw new HttpError(400, "De foto is te groot (maximaal 3 MB).");
      row.image = await images.save("nieuws-" + (slug || id), buffer, m[1]);
    }
  }
  const rows = id
    ? await run(db().from("news").update(row).eq("id", id).select(), UNIQUE)
    : await run(db().from("news").insert(row).select(), UNIQUE);
  if (!rows.length) throw new HttpError(404, "Bericht niet gevonden.");
  return fromRow(rows[0]);
}

async function deleteNews(id) {
  const rows = await run(db().from("news").delete().eq("id", Number(id)).select("id"));
  if (!rows.length) throw new HttpError(404, "Bericht niet gevonden.");
}

module.exports = { listNews, publicNews, saveNews, deleteNews, slugify };
