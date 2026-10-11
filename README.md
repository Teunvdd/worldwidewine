# WorldWideWine.nl — website & webshop

Nieuwe website met eigen webshop voor WorldWideWine.nl, wijnimporteur met eigen winkel in Zaandam.

De site bestaat uit HTML, CSS en JavaScript, zonder build-stap en zonder abonnementskosten. Online betalen loopt via Mollie (iDEAL, creditcard, Bancontact) en een kleine serverfunctie op Netlify.

## Pagina's

| Pagina | Inhoud |
|---|---|
| `index.html` | Homepage: over ons, uitgelichte wijnen, producenten, proeverijen, zakelijk, openingstijden, contact |
| `webshop.html` | Catalogus met zoeken, filters (soort, land, prijs, acties, per doos), sorteren en productdetails |
| `afrekenen.html` | Afrekenen: bezorgmethode, gegevens, betaalwijze, 18+-bevestiging |
| `bedankt.html` | Bevestiging met ordernummer en overzicht |
| `voorwaarden.html` | Algemene voorwaarden & privacy (**concept**) |

## Hoe de webshop werkt

1. De klant kiest wijnen. De winkelwagen wordt in de browser bewaard.
2. Bij het afrekenen kiest de klant hoe de bestelling wordt ontvangen:
   - **Afhalen** in Zaandam of Weesp (gratis)
   - **Bezorgen** in Zaandam, Weesp en omgeving (€ 7,50, gratis vanaf € 100)
   - **PostNL** door heel Nederland (€ 9,95, gratis vanaf € 150, maximaal 18 flessen)
3. Daarna de betaalwijze:
   - **Direct online betalen** via Mollie (alleen als dit is ingeschakeld, zie hieronder)
   - **Betalen bij afhalen** (pin of contant, alleen bij afhalen)
   - **Betaalverzoek per e-mail**: je stuurt zelf een Tikkie of betaallink
4. De bestelling komt binnen als e-mail via Netlify Forms. Bij online betalen staat de betaling ook in het Mollie-dashboard, met hetzelfde ordernummer (bijv. `WWW-261011-AB3K`).

Regels die automatisch worden gecontroleerd:
- Producten met `pickupOnly` (zoals de ham) kunnen alleen worden afgehaald.
- Meer dan 18 flessen kan niet met PostNL. Een doos van 6 telt als 6 flessen.
- Producten zonder prijs (Lauretana per pallet) tonen een knop "Offerte aanvragen" in plaats van "In winkelwagen".
- Het te betalen bedrag wordt op de server opnieuw berekend uit de echte prijzen, dus een klant kan de prijs niet in de browser aanpassen.

## Producten beheren

Alle producten staan in **`data/products.js`**. Bovenin dat bestand staat uitgelegd wat elk veld betekent. Zo werk je ermee:
- **Prijs wijzigen:** pas `price` aan.
- **Actie:** zet de oude prijs in `oldPrice` en voeg `"actie"` toe aan `tags`.
- **Uitverkocht:** zet `stock: false`.
- **Op de homepage tonen:** voeg `"uitgelicht"` toe aan `tags`. De eerste 4 worden getoond.
- **Foto toevoegen:** zet de foto in `assets/producten/` en vul `image` in. Zonder foto wordt automatisch een getekende fles getoond.

Verzendkosten, gratis-verzendgrenzen en afhaallocaties staan in **`data/config.js`**.

## Online zetten (Netlify, gratis)

1. Maak een account op [netlify.com](https://www.netlify.com) en kies **Add new site → Import from GitHub**. Selecteer deze repository. Er is geen build-commando nodig, `netlify.toml` regelt de rest.
2. **Bestellingen per e-mail ontvangen:** ga in Netlify naar *Forms → bestelling → Form notifications* en voeg een e-mailmelding toe naar info@worldwidewine.nl.
3. **Online betalen inschakelen (optioneel):**
   - Maak een account op [mollie.com](https://www.mollie.com). Je hebt een KvK-nummer en een zakelijke rekening nodig. Activeer iDEAL en eventueel creditcard of Bancontact.
   - Zet de API-sleutel in Netlify bij *Site configuration → Environment variables* als `MOLLIE_API_KEY`. Test eerst met de sleutel die begint met `test_`, en zet daarna de `live_`-sleutel.
   - Zet in `data/config.js` de regel `onlinePayments` op `true`.
   - Mollie rekent per transactie (iDEAL ca. € 0,30). Er is geen abonnement.
4. **Domein koppelen:** voeg `worldwidewine.nl` toe bij *Domain management* en pas de DNS aan bij de domeinregistrar. Zeg pas daarna het Wix-abonnement op.

> Werkt de site zonder Netlify, bijvoorbeeld als je `index.html` lokaal opent of via een andere hosting? Dan wordt bij een bestelling het mailprogramma van de klant geopend met de bestelling al ingevuld. Er gaat dus geen bestelling verloren.

## Graag controleren voordat de site live gaat

De producten en prijzen komen van de oude webshop, zoals die in zoekmachines te vinden was. Controleer daarom:

- [ ] **Prijzen en assortiment** in `data/products.js`: kloppen de prijzen, en zijn alle wijnen nog leverbaar? Twee prijzen zijn afgeleid: de losse fles Torre a Cona Vermentino (€ 20, berekend uit de doosprijs) en de producent van de Garganega.
- [ ] **Smaakomschrijvingen**: die zijn nieuw geschreven. Pas ze gerust aan.
- [ ] **Verzendkosten** in `data/config.js` (€ 7,50 lokaal, € 9,95 PostNL, en de gratis-grenzen) zijn voorstellen.
- [ ] **Voorwaarden & privacy** (`voorwaarden.html`): concepttekst, laten nakijken.
- [ ] **Openingstijden**: nu vrijdag 09:00 – 19:00, overige dagen op afspraak.
- [ ] **Over ons** en de quote "Onze filosofie" op de homepage.
- [ ] **PostNL**: voor alcohol is een leeftijdscheck bij aflevering nodig (PostNL-optie "Leeftijdscheck 18+").
- [ ] **Foto's** van de flessen, de winkel en Hans & Pauline maken de site veel persoonlijker.
