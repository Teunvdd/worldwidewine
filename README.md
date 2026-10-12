# WorldWideWine.nl — website, webshop, admin & kassa  

Website, webshop, admin-omgeving en kassa (POS) voor WorldWideWine.nl, wijnimporteur met eigen winkel in Zaandam.

De webshop en de kassa werken met **dezelfde producten, prijzen, voorraad en klanten**. Een verkoop in de winkel verlaagt de voorraad in de webshop, en een webshop-bestelling verschijnt meteen in de admin.

De website en de serverfuncties draaien op **Vercel**. De gegevens staan in een **Supabase**-database (Postgres). Online betalen loopt via **Mollie**, en e-mails gaan via **Resend**.

> Let op: het gratis Hobby-abonnement van Vercel is volgens Vercel niet bedoeld voor commercieel gebruik. Voor een winkel heb je **Vercel Pro** nodig ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)).

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
- **Kassa (POS):** een volledig-schermkassa in de stijl van Odoo, bedoeld voor een vaste desktop in de winkel. Je opent hem via **Kassa openen** in de admin. Zie "Kassa" hieronder.
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

Alle onderdelen werken met één Supabase-database. Die heeft tabellen voor `products`, `customers`, `orders`, `order_lines` en `stock_movements`.

- De **webshop** leest het assortiment via `/api/products` en plaatst bestellingen via `/api/orders`.
- De **admin en kassa** werken via `/api/admin/*`. Dat kan alleen na inloggen.
- **Mollie** meldt betalingen via `/api/mollie-webhook`.

- **Prijzen en voorraad worden op de server gecontroleerd.** Een klant kan in de browser geen prijs aanpassen, en de webshop verkoopt niet meer dan er is.
- **Voorraad en bestellingen worden in één databasetransactie verwerkt** (functies in `supabase/migrations`). Als de webshop en de kassa tegelijk verkopen, gaat er niets mis. Getest met 10 gelijktijdige bestellingen voor 5 flessen: er slagen er precies 5.
- **Beveiliging:** alleen de serverfuncties op Vercel kunnen bij de database, met de geheime sleutel. Row Level Security staat aan, en de publieke sleutels van Supabase (anon/publishable) geven geen toegang.
- Bij de eerste start wordt de database gevuld met het assortiment uit `public/data/products.js`. Daarna beheer je alles in de admin.
- Zonder server, bijvoorbeeld als je `index.html` lokaal opent, valt de webshop terug op `public/data/products.js`. Bestellingen gaan dan per e-mail.

## Online zetten

### 1. Database (Supabase)

1. Maak een gratis account op [supabase.com](https://supabase.com) en een nieuw project. Kies als regio **EU (Frankfurt of Amsterdam)**, in verband met de AVG.
2. Ga naar **SQL Editor → New query**, plak de hele inhoud van **`supabase/setup.sql`** en klik op **Run**. Dit maakt alle tabellen, functies, rechten en de opslagmap voor productfoto's aan. Je kunt het bestand veilig opnieuw uitvoeren. Het zijn de bestanden uit `supabase/migrations/` achter elkaar; latere wijzigingen komen als nieuw bestand in die map.
3. Noteer bij **Project Settings → API (Data API / API Keys)**:
   - de **Project URL**, bijvoorbeeld `https://abcdefgh.supabase.co`;
   - de **secret key** (`sb_secret_…`) of de oude **service_role**-sleutel. Deel deze sleutel nooit en zet hem niet in de website zelf.
4. **Back-ups en abonnement:** controleer bij Supabase welke back-ups bij je abonnement horen. Voor een winkel raad ik het Pro-abonnement met dagelijkse back-ups aan. Gratis projecten worden bovendien gepauzeerd na een periode zonder activiteit. Met *Bestellingen → Exporteren* kun je ook zelf regelmatig een kopie maken.

Bij het eerste bezoek wordt de database automatisch gevuld met het startassortiment uit `public/data/products.js`. Je kunt producten daarna ook in Supabase zelf bekijken onder **Table Editor**, maar wijzig ze bij voorkeur in de admin.

### 2. Website (Vercel)

1. Ga in Vercel naar **Add New… → Project** en importeer deze GitHub-repository.
   - **Framework Preset:** Other. Laat Build Command en Output Directory leeg; `vercel.json` regelt dat. De website staat in `public/`, de serverfuncties in `api/`.
2. **Environment Variables** (bij het importeren, of later via *Settings → Environment Variables*):

   | Naam | Waarde | |
   |---|---|---|
   | `SUPABASE_URL` | de Project URL uit stap 1 | verplicht |
   | `SUPABASE_SERVICE_ROLE_KEY` | de secret key uit stap 1 | verplicht |
   | `ADMIN_PASSWORD` | een sterk wachtwoord voor de admin, bijv. een zin van 4+ woorden | verplicht |
   | `SITE_URL` | het adres van de site, bijv. `https://www.worldwidewine.nl` | aanbevolen |
   | `MOLLIE_API_KEY` | de Mollie-sleutel (`test_…` of `live_…`) | voor online betalen |
   | `RESEND_API_KEY` | de API-sleutel van Resend | voor e-mails |
   | `MAIL_FROM` | afzender, bijv. `worldwidewine.nl <bestellingen@worldwidewine.nl>` | voor e-mails |
   | `SHOP_EMAIL` | waar bestelmeldingen heen gaan (standaard info@worldwidewine.nl) | optioneel |
   | `ADMIN_SECRET` | een lange willekeurige tekst; wijzigen logt iedereen uit | optioneel |

   Na het wijzigen van een variabele: *Deployments → ⋯ → Redeploy*.
3. **E-mails (Resend):**
   - Maak een gratis account op [resend.com](https://resend.com). Voeg bij **Domains** het domein `worldwidewine.nl` toe en zet de DNS-records die Resend toont bij je domeinregistrar.
   - Maak bij **API Keys** een sleutel aan en zet die als `RESEND_API_KEY`.
   - Bij elke webshopbestelling krijgt de winkel een melding en de klant een bevestiging. Bestellingen staan daarnaast altijd in de admin.
4. **Online betalen (optioneel):** maak een account op [mollie.com](https://www.mollie.com) en zet de API-sleutel als `MOLLIE_API_KEY`. Test eerst met de `test_`-sleutel, daarna de `live_`-sleutel.
   - Zodra de sleutel is ingesteld, verschijnt "Direct online betalen" automatisch bij het afrekenen.
   - Betalingen worden via de webhook (`/api/mollie-webhook`) automatisch op "betaald" gezet.
5. **Domein koppelen:** *Settings → Domains* → voeg `worldwidewine.nl` en `www.worldwidewine.nl` toe en volg de DNS-instructies. Zeg daarna het Wix-abonnement op.

## Kassa

### Dagelijks gebruik
1. **Openen:** in de admin klik je op **Kassa openen** (op het overzicht of onder *Kassa*). Tel het wisselgeld in de la en vul het beginsaldo in. De kassa gaat daarna op volledig scherm.
2. **Verkopen:**
   - De producten staan links, de bon rechts. Met de knoppen boven de producten kies je een **categorie** (zie hieronder).
   - Producten toevoeg je door op een productkaart te tikken, de barcode te scannen of te zoeken.
   - Kies naast de bon **Aantal**, **Korting** of **Prijs** en typ met het **toetsenblok** de nieuwe waarde voor de geselecteerde regel. ⌫ wist een cijfer; **Verwijder** haalt de regel weg.
   - **Bonkorting** geeft korting op de hele bon, **Klant** koppelt een klant aan de verkoop.
3. **Betalen:** op het betaalscherm kies je **Pin**, **Contant** of **Tikkie**.
   - Gesplitst betalen kan ook, bijvoorbeeld € 50 pin en de rest contant.
   - Bij contant typ je het ontvangen bedrag, of tik je op +10, +20 of +50 voor een briefje. Het wisselgeld wordt meteen getoond.
   - **Valideren** rondt de verkoop af. Daarna kun je de bon afdrukken of direct een nieuwe bestelling beginnen.
4. **Sluiten (dagafsluiting):** klik op het tandwiel rechtsboven in de kassa en kies **Kassa sluiten**. Je ziet de omzet per betaalwijze en wat er in de la hoort te zitten. Vul in wat je telt; het verschil wordt bewaard. Het **kassarapport (Z)** kun je afdrukken. Alle diensten staan in de admin onder *Kassa*.

**Sneltoetsen:**
- Cijfers, ⌫, komma en Delete werken als het toetsenblok.
- Pijltjes ↑/↓ kiezen een andere regel.
- Enter gaat naar betalen of valideert de betaling.
- Esc gaat terug van het betaalscherm.
- Een barcodescanner wordt automatisch herkend, ook zonder op het zoekveld te klikken.

### Categorieën
In de admin onder **Kassa → Categorieën** (links in het menu) maak je categorieën aan, bijvoorbeeld *Rood*, *Italië* of *Cadeaus*. Je kunt ze hernoemen, een kleur geven, verwijderen en de volgorde bepalen. Die volgorde zie je terug in de kassa.
- Per product kies je de categorie bij het product zelf (veld **Categorie (kassa)**).
- Nog geen categorieën? Met één klik maak je ze aan op basis van soort (Rood, Wit, Rosé, …); alle producten worden dan meteen ingedeeld.
- Producten zonder categorie staan in de kassa onder **Overig**. Zolang er geen categorieën zijn, deelt de kassa in op soort.
- Bij een bestaande database: voer na deze update **`supabase/setup.sql`** nog één keer uit in Supabase → SQL Editor.

### Per doos verkopen
Een product kan naast per fles ook per doos te koop zijn. Dat stel je per product in: open het product in de admin onder **Producten** en vink bij **Per doos** aan: **Ook per doos te koop**.
- **Flessen per doos**: bijvoorbeeld 6 of 12.
- **Prijs per doos**: laat je dit leeg, dan kost een doos de flesprijs × het aantal. Vul je een bedrag in, dan geldt die prijs (bijvoorbeeld met doosvoordeel).
- De voorraad blijft in losse flessen. Een verkochte doos boekt het aantal flessen in de doos af; annuleren zet ze terug.
- **Webshop:** de knop *In winkelwagen* krijgt rechts een doosje met een pijltje. Daarmee open je een keuzemenu: **Per fles** of **Per doos van 6**, met de doosprijs, de prijs per fles en het voordeel. In de winkelwagen staat de doos als eigen regel. Is er niet genoeg voorraad voor een hele doos, dan is die keuze uitgeschakeld.
- **Kassa:** een product dat per doos te koop is, heeft een doos-label op de kaart. Tik je erop, dan kies je **Fles** of **Doos**. Een gescande barcode voegt altijd een fles toe.
- Bij een bestaande database: voer na deze update **`supabase/setup.sql`** nog één keer uit in Supabase → SQL Editor (of alleen `supabase/migrations/20261016000000_per_doos.sql`).

### Kassa-instellingen
In de admin onder **Kassa-instellingen** bepaal je hoe de kassa werkt. De server controleert deze instellingen ook; ze zijn dus niet te omzeilen via het kassascherm.

| Onderdeel | Instellingen |
|---|---|
| Kassadienst | Kastelling aan/uit (uit: de kassa opent direct en sluit zonder telling), beginsaldo (laatst geteld of vast bedrag), waarschuwing bij kasverschil |
| Betaalwijzen | Pin, contant, Tikkie en een eigen betaalwijze (bijv. cadeaubon) aan/uit, snelknoppen voor contant, contant afronden op 5 cent |
| Verkopen | Prijs wijzigen toestaan, korting toestaan met een maximum in %, verkopen bij voorraad 0 |
| Kassascherm | Productfoto's tonen, voorraad tonen, grootte van de productkaarten |
| Kassabon | Automatisch afdrukken, btw-specificatie, klantnaam, eigen tekst boven- en onderaan (met voorbeeldbon) |
| Beheerderspincode | Pincode van 4–8 cijfers. Kies voor welke handelingen die nodig is: prijs wijzigen, korting, regel verwijderen, kassa sluiten, kassa verlaten |

De pincode wordt versleuteld opgeslagen en is bedoeld om handelingen van medewerkers in de kassa af te schermen. Wie het admin-wachtwoord heeft, kan de instellingen altijd wijzigen.

### De kassacomputer instellen
- **Kioskmodus (aanbevolen):** maak een snelkoppeling naar Google Chrome met
  `chrome --kiosk https://www.worldwidewine.nl/admin/#pos`.
  - De kassa start dan altijd op volledig scherm, zonder adresbalk of tabbladen.
  - Afsluiten doe je met Alt+F4 (Windows) of Cmd+Q (Mac).
  - Log één keer in; daarna blijf je 12 uur ingelogd.
- Zonder kioskmodus schakel je volledig scherm aan of uit via het tandwiel rechtsboven (**Volledig scherm**), of met F11.
- **Barcodescanner:** een USB- of Bluetooth-scanner werkt direct. Koppel de barcode eerst aan het product: *Producten → product → Barcode*. Je kunt daar ook in scannen.
- **Pinapparaat:** het pinapparaat werkt los van de kassa. Laat de klant pinnen en klik dan op Valideren.
- **Bonprinter:** elke bonprinter van 80 mm die als printer in Windows of macOS is geïnstalleerd werkt. Kies bij het afdrukken die printer en zet de marges op "geen". In kioskmodus kun je Chrome starten met `--kiosk-printing`; dan wordt de bon zonder printvenster op de standaardprinter afgedrukt.
- Voor de kassa is internet nodig. Valt het internet uit, gebruik dan tijdelijk de hotspot van je telefoon.

### Producteigenschappen en webshopfilters
Per product vul je in de admin onder **Producten** bij **Eigenschappen** in: **Soort**, **Land**, **Regio**, **Druivensoort**, **Oogstjaar**, **Inhoud** en **Alcohol volume (%)**. Alles is vrij in te vullen, bijvoorbeeld Soort *Oranje wijn* of *Port*. Typ je een vaste soort (Rood, Wit, Rosé, Mousserend, Likeur, Delicatessen, Water), dan wordt die herkend: die bepaalt ook de getekende fles en het automatische btw-tarief (9% voor delicatessen en water). Bij een andere soort is dat 21%, tenzij je bij Btw iets anders kiest.
- Deze gegevens staan in de webshop bij het product en zijn daar filters (links). Een filter verschijnt pas als minstens één product die gegevens heeft.
- Meerdere druiven scheid je met een komma, bijvoorbeeld *Sangiovese, Merlot*: het product verschijnt dan bij beide druiven.
- Tijdens het typen stelt het formulier bestaande waarden voor. Zo blijft de schrijfwijze gelijk en krijg je geen dubbele filters (*Italië* en *Italie*).
- **Prijs** en **Alcohol volume** filter je met een schuifje met twee handvatten.
- Bij een bestaande database: voer na deze update **`supabase/setup.sql`** nog één keer uit (of alleen `supabase/migrations/20261017000000_alcohol.sql` en `20261018000000_soort_vrij.sql`).

### Producten in één keer aanpassen
In de productlijst zet je vinkjes voor de producten (of met het vinkje bovenaan alle producten die je nu ziet). Er verschijnt een balk waarmee je ze in één keer **actief** of **niet actief** maakt of **verwijdert**.

### Productfoto's
- Foto's voeg je toe in de admin: *Producten → product*. Sleep een foto op het fotovak of klik op *Foto kiezen…*.
- De foto wordt automatisch verkleind en opgeslagen in Supabase Storage (map `product-images`).
- Je ziet hem in de kassa én in de webshop.
- Producten zonder foto krijgen een getekende fles in de kleur van de wijnsoort.

## Lokaal draaien en testen

Vereist Node.js 22 of nieuwer.

```bash
npm install
cp .env.example .env   # en vul SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en ADMIN_PASSWORD in
npm run dev            # http://localhost:8888 — admin op /admin/
npm test               # tests voor voorraad, bestellingen, kassa, beveiliging en Mollie
```

Gebruik voor het testen bij voorkeur een **apart Supabase-project**, niet de echte winkeldatabase.

**Zonder Supabase-account** kan het ook, als Postgres en [PostgREST](https://postgrest.org) op je computer staan:
- `npm test` start dan zelf een tijdelijke database die is opgezet zoals Supabase (zelfde rollen en sleutels).
- `WWW_LOCAL_DB=1 npm run dev` doet hetzelfde voor de lokale testserver.
- Zie `tests/helpers/local-supabase.js` voor de instellingen (`WWW_TEST_PG`, `POSTGREST_BIN`). Zonder deze programma's worden de databasetests overgeslagen.

**Later iets aan de database veranderen?** Voeg een nieuw bestand toe in `supabase/migrations/` en voer het uit in de SQL Editor. Herhaal daarin voor nieuwe tabellen de `revoke … from anon, authenticated` en `enable row level security`. Supabase geeft nieuwe tabellen namelijk standaard publieke rechten.

## Bestanden

| Pad | Inhoud |
|---|---|
| `public/` | De website zelf (alles wat Vercel publiceert) |
| `public/data/products.js` | Startassortiment (en reserve als de server niet bereikbaar is) |
| `public/data/config.js` | Verzendkosten, afhaallocaties, contactgegevens |
| `public/data/order.js` | Berekening van bestelling, korting, verzending en btw. Gedeeld door webshop, kassa en server |
| `public/admin/` | Admin-omgeving en kassa |
| `api/` | Vercel-serverfuncties: `products`, `orders`, `payment-status`, `mollie-webhook`, `admin` |
| `lib/` | Serverlogica: database (`db.js`), bedrijfslogica (`shop.js`), inloggen, Mollie, e-mail, foto's; `lib/handlers/` bevat de functies, `lib/vercel.js` koppelt ze aan Vercel |
| `vercel.json` | Vercel-instellingen: publicatiemap, doorverwijzing `/api/admin/*`, beveiligingsheaders |
| `supabase/setup.sql` | Complete database-installatie (alle migraties achter elkaar) |
| `supabase/migrations/` | Databaseschema per wijziging |
| `tests/` | Automatische tests (plus `helpers/local-supabase.js`) |
| `.env.example` | Voorbeeld van de instellingen voor lokaal gebruik |

## Graag controleren voordat de site live gaat

- [ ] **Prijzen en assortiment:** controleer en corrigeer ze in de admin onder Producten. De gegevens komen van de oude webshop zoals die in zoekmachines te vinden was.
- [ ] **Voorraad tellen:** zet onder Voorraad per product het aantal ("= Geteld"). Zolang er "—" staat, wordt de voorraad niet bijgehouden.
- [ ] **Barcodes** koppelen voor snel scannen in de kassa.
- [ ] **Verzendkosten** in `public/data/config.js` (€ 7,50 lokaal, € 9,95 PostNL, met gratis-grenzen) zijn voorstellen.
- [ ] **Voorwaarden & privacy:** dit is een concepttekst; laat hem nakijken.
- [ ] **PostNL:** gebruik bij alcohol de optie "Leeftijdscheck 18+".
- [ ] **Kassabon:** controleer bij je boekhouder of de bon voldoet (bedrijfsgegevens, btw).
- [ ] **Foto's** van de flessen toevoegen (veld "Foto" bij het product).
