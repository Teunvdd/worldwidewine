// /api/account — Mijn account voor klanten.
//   GET                          → { loggedIn, profile, orders }
//   POST { action: "code", email }            → stuurt een inlogcode
//   POST { action: "login", email, code }     → logt in (cookie)
//   POST { action: "profile", name, …, newsletter } → gegevens opslaan
//   POST { action: "logout" }
const { json, parseBody, HttpError } = require("../http");
const account = require("../account");
const shop = require("../shop");

async function handle(event) {
  const who = account.sessionEmail(event);
  if (event.httpMethod === "GET") {
    if (!who) return json(200, { loggedIn: false });
    return json(200, Object.assign({ loggedIn: true }, await shop.customerAccount(who)));
  }
  if (event.httpMethod !== "POST") throw new HttpError(405, "Niet toegestaan.");
  const body = parseBody(event);
  if (!body) throw new HttpError(400, "Ongeldige aanvraag.");
  switch (body.action) {
    case "code": return json(200, await account.requestCode(body));
    case "login": {
      const cookie = await account.verifyCode(body, event);
      return json(200, { ok: true }, { "Set-Cookie": cookie });
    }
    case "logout": return json(200, { ok: true }, { "Set-Cookie": account.clearSession(event) });
    case "profile":
      if (!who) throw new HttpError(401, "Log opnieuw in.");
      return json(200, { profile: await shop.saveOwnProfile(who, body) });
  }
  throw new HttpError(400, "Onbekende actie.");
}

exports.handler = async (event) => {
  try {
    return await handle(event);
  } catch (e) {
    if (e.status) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: "Er ging iets mis. Probeer het later opnieuw." });
  }
};
