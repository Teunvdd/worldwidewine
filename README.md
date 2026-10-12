# WorldWideWine.nl — website, webshop, admin & kassa

Website, webshop, admin-omgeving en kassa (POS) voor WorldWideWine.nl, wijnimporteur met eigen winkel in Zaandam.

De webshop en de kassa werken met **dezelfde producten, prijzen, voorraad en klanten**. Een verkoop in de winkel verlaagt de voorraad in de webshop, en een webshop-bestelling verschijnt meteen in de admin.

Alles draait op Netlify: statische pagina's plus serverfuncties, met Netlify Blobs als database. Er is geen eigen server of los database-abonnement nodig. Online betalen loopt via Mollie.

## Onderdelen

| Adres | Wat |
|---|---|
| `/` | Homepage |
| `/webshop.html` | Webshop met zoeken en filters. Toont live prijzen en voorraad |
| `/afrekenen.html`, `/bedankt.html` | Afrekenen (afhalen, bezorgen, PostNL) en bevestiging |
| `/voorwaarden.html` | Voorwaarden & privacy (**concept**) |
| **`/admin/`** | **Admin-omgeving en kassa** (met wachtwoord) |

### Admin-omgeving (`/admin/`)

- **Overzicht:** omzet van vandaag, deze week en deze maand (webshop en winkel apart), het kassatotaal van vandaag per betaalwijze (handig bij de dagafsluiting), te verwerken bestellingen, voorraadmeldingen en de best verkochte producten.
- **Kassa (POS):** voor de winkel, werkt op een computer en op een tablet.
  - Producten zoeken, op soort filteren of een **barcode scannen**. Een USB- of Bluetooth-barcodescanner werkt direct, want die "typt" de code.
  - Aantallen aanpassen, korting geven (procent of bedrag) en een klant aan de verkoop koppelen.
  - Afrekenen met **pin**, **contant** (met wisselgeldberekening) of **Tikkie**.
  - Een **kassabon** met btw-specificatie, af te drukken op een bonprinter van 80 mm of een gewone printer.
  - Een bon die nog niet is afgerekend blijft bewaard als de pagina per ongeluk sluit.
  - Producten die je uitzet voor de webshop (bijv. huiswijn van het vat) staan wel in de kassa.
- **Bestellingen:** webshop en winkel samen, met zoeken en filters.
  - Status wijzigen: nieuw → betaald → klaar → verzonden → afgerond, of geannuleerd. **Bij annuleren gaat de voorraad automatisch terug.**
  - Een pakbon of bon afdrukken, en de klant mailen.
  - **Exporteren naar Excel (CSV)** voor de boekhouding, met de btw per tarief.
- **Producten:** toevoegen, wijzigen en verwijderen.
  - Velden: prijs, actieprijs, inkoopprijs (alleen intern), btw 21% of 9%, barcode, foto en omschrijving.
  - Instellingen: actief, tonen in de webshop, alleen afhalen, uitgelicht, actie, nieuw, bio.
- **Voorraad:** voorraad bijwerken met "+ Ontvangst", "− Breuk/eigen gebruik" of "= Geteld". Je stelt per product in vanaf welk aantal je een melding krijgt, en er is een geschiedenis van alle mutaties.
  - Producten zonder geteld aantal ("—") worden niet bijgehouden en zijn altijd te koop.
  - De webshop verkoopt nooit meer dan er op voorraad is.
  - In de kassa mag je wel verkopen als het systeem 0 aangeeft (het product ligt immers op de toonbank); je krijgt dan een waarschuwing.
- **Klanten:** webshopklanten worden automatisch aangemaakt op basis van hun e-mailadres. Winkelklanten voeg je zelf toe.
  - Per klant: contactgegevens, notities, toestemming voor de nieuwsbrief en de bestelgeschiedenis.
  - Een klant verwijderen kan op verzoek (AVG). Bestellingen blijven bewaard voor de administratie.

## Hoe de koppeling werkt

Alle onderdelen werken met één database (Netlify Blobs) met daarin producten, voorraad, bestellingen en klanten:

- De **webshop** leest het assortiment via `/api/products` en plaatst bestellingen via `/api/orders`.
- De **admin en kassa** werken via `/api/admin/*`. Dat kan alleen na inloggen.
- **Mollie** meldt betalingen via `/api/mollie-webhook`.


- **Prijzen en voorraad worden op de server gecontroleerd.** Een klant kan in de browser geen prijs aanpassen, en de webshop verkoopt niet meer dan er is.
- Als de webshop en de kassa tegelijk dezelfde voorraad wijzigen, gaat er niets verloren. Dat wordt gecontroleerd met een versiecode (getest met 10 gelijktijdige verkopen).
- Bij de eerste start wordt de database gevuld met het assortiment uit `data/products.js`. Daarna beheer je alles in de admin.
- Zonder server, bijvoorbeeld als je `index.html` lokaal opent, valt de webshop terug op `data/products.js`. Bestellingen gaan dan per e-mail.

## Online zetten (Netlify)

1. Maak een account op [netlify.com](https://www.netlify.com) en kies **Add new site → Import from GitHub**. Kies deze repository. Een build-commando is niet nodig; `netlify.toml` regelt de rest.
2. **Admin-wachtwoord instellen (verplicht voor de admin):** ga naar *Site configuration → Environment variables* en voeg toe:
   - `ADMIN_PASSWORD`: een sterk wachtwoord, bijvoorbeeld een zin van minstens 4 woorden.
   - `ADMIN_SECRET` (optioneel): een lange willekeurige tekst. Als je die verandert, wordt iedereen uitgelogd.

   Deploy daarna opnieuw (*Deploys → Trigger deploy*).
3. **Bestellingen per e-mail ontvangen:** *Forms → bestelling → Form notifications* → e-mailmelding naar info@worldwidewine.nl. Bestellingen staan daarnaast altijd in de admin.
4. **Online betalen (optioneel):** maak een account op [mollie.com](https://www.mollie.com) en zet de API-sleutel als `MOLLIE_API_KEY`. Test eerst met de `test_`-sleutel, daarna de `live_`-sleutel.
   - Zodra de sleutel is ingesteld, verschijnt "Direct online betalen" automatisch bij het afrekenen.
   - Betalingen worden via de webhook automatisch op "betaald" gezet.
5. **Domein koppelen:** voeg `worldwidewine.nl` toe bij *Domain management*. Zeg daarna het Wix-abonnement op.

### In de winkel

- Open `https://www.worldwidewine.nl/admin/#kassa` op de kassacomputer of tablet en zet hem als bladwijzer of beginscherm.
- **Barcodescanner:** sluit hem aan en scan in het zoekveld. Koppel de barcode eerst aan het product: Producten → product → Barcode (je kunt daar ook in scannen).
- **Pinapparaat:** het pinapparaat werkt los van de kassa. Laat de klant pinnen en tik dan op "Betaald".
- **Bonprinter:** elke bonprinter van 80 mm die als printer in Windows of macOS is geïnstalleerd werkt. Kies bij het afdrukken die printer en zet de marges op "geen".
- Voor de kassa is internet nodig. Valt internet uit, gebruik dan tijdelijk de hotspot van je telefoon.

## Lokaal draaien en testen

Vereist Node.js 18 of nieuwer.

```bash
npm install
npm run dev     # http://localhost:8888 — admin op /admin/ met wachtwoord "admin"
npm test        # tests voor voorraad, bestellingen, kassa, inloggen en Mollie
```

Lokaal worden de gegevens opgeslagen in de map `.data/` (staat niet in git).

## Bestanden

| Pad | Inhoud |
|---|---|
| `data/products.js` | Startassortiment (en reserve als de server niet bereikbaar is) |
| `data/config.js` | Verzendkosten, afhaallocaties, contactgegevens |
| `data/order.js` | Berekening van bestelling, korting, verzending en btw. Gedeeld door webshop, kassa en server |
| `netlify/functions/` | Serverfuncties: `products`, `orders`, `payment-status`, `mollie-webhook`, `admin` |
| `netlify/lib/` | Opslag, inloggen, Mollie, bedrijfslogica |
| `admin/` | Admin-omgeving en kassa |
| `tests/` | Automatische tests |

## Graag controleren voordat de site live gaat

- [ ] **Prijzen en assortiment:** controleer en corrigeer ze in de admin onder Producten. De gegevens komen van de oude webshop zoals die in zoekmachines te vinden was.
- [ ] **Voorraad tellen:** zet onder Voorraad per product het aantal ("= Geteld"). Zolang er "—" staat, wordt de voorraad niet bijgehouden.
- [ ] **Barcodes** koppelen voor snel scannen in de kassa.
- [ ] **Verzendkosten** in `data/config.js` (€ 7,50 lokaal, € 9,95 PostNL, met gratis-grenzen) zijn voorstellen.
- [ ] **Voorwaarden & privacy:** dit is een concepttekst; laat hem nakijken.
- [ ] **PostNL:** gebruik bij alcohol de optie "Leeftijdscheck 18+".
- [ ] **Kassabon:** controleer bij je boekhouder of de bon voldoet (bedrijfsgegevens, btw).
- [ ] **Foto's** van de flessen toevoegen (veld "Foto" bij het product).
