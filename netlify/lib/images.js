// Opslag van productfoto's.
// Op Netlify: Supabase Storage (openbare map "product-images", zie supabase/migrations).
// Lokaal (WWW_LOCAL_UPLOADS): in een map op schijf, geserveerd door de dev-server onder /uploads/.
const fs = require("fs");
const path = require("path");
const { db } = require("./db");
const { HttpError } = require("./http");

const BUCKET = "product-images";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function save(productId, buffer, contentType) {
  const name = productId + "-" + Date.now().toString(36) + "." + EXT[contentType];
  if (process.env.WWW_LOCAL_UPLOADS) {
    fs.mkdirSync(process.env.WWW_LOCAL_UPLOADS, { recursive: true });
    fs.writeFileSync(path.join(process.env.WWW_LOCAL_UPLOADS, name), buffer);
    return "/uploads/" + name;
  }
  const storage = db().storage.from(BUCKET);
  const { error } = await storage.upload(name, buffer, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) {
    console.error("Upload mislukt", error);
    throw new HttpError(500, "De foto kon niet worden opgeslagen. Is de opslagmap 'product-images' aangemaakt (zie README)?");
  }
  return storage.getPublicUrl(name).data.publicUrl;
}

module.exports = { save };
