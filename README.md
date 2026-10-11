# WorldWideWine.nl — nieuwe website

Een nieuwe website voor WorldWideWine.nl, de wijnimporteur met eigen winkel in Zaandam.

Het is een statische site met alleen HTML, CSS en JavaScript, zonder build-stap. Open `index.html` in een browser om hem te bekijken.

## Bestanden

| Bestand | Inhoud |
|---|---|
| `index.html` | Alle teksten en secties |
| `styles.css` | Vormgeving: kleuren, lettertypes, layout |
| `script.js` | Mobiel menu, leeftijdscheck (18+), contactformulier (opent het mailprogramma) |
| `assets/` | Logo (wereldbol met wijnglas) |
| `favicon.svg` | Icoontje in het browsertabblad |

## Secties

Home · Over ons · Onze wijnen (categorieën en uitgelichte wijnen) · Producenten · Proeverijen · Zakelijk (relatiegeschenken, horeca, Lauretana) · Bezoek & bestellen (openingstijden, afhalen, bezorgen) · Contact · Footer met NIX18-melding en KvK-nummer.

## Graag controleren voordat de site live gaat

De teksten zijn samengesteld uit wat online over de oude site te vinden was. Controleer daarom:

- [ ] **Openingstijden**: nu staat er vrijdag 09:00–19:00, overige dagen op afspraak.
- [ ] **Producenten**: Torre a Cona, Montemercurio, Rainoldi, Blauensteiner, Domaine Bernard, Wiston Estate en Lauretana. Klopt de lijst, en zijn ze allemaal nog leverbaar?
- [ ] **Uitgelichte wijnen**: kloppen de smaakomschrijvingen?
- [ ] **Over ons**: de tekst en de quote onder "Onze filosofie" zijn een voorstel. Pas ze gerust aan in jullie eigen woorden.
- [ ] **Proeverijen**: kloppen de opties (in de winkel, aan huis, op locatie)? Eventueel prijzen toevoegen.
- [ ] **Afhalen in Weesp**: bestaat deze mogelijkheid nog?
- [ ] **Foto's**: echte foto's van de winkel, de flessen en Hans & Pauline maken de site nog veel persoonlijker. Zet ze in `assets/`, dan bouwen we ze in.

## Webshop

De knoppen "Webshop" en "Afhaalafspraak" verwijzen nu naar de bestaande Wix-pagina's (`/webshop` en `/book-online`). Die blijven alleen werken zolang de Wix-site online is. Als de webshop verhuist (bijvoorbeeld naar Shopify of WooCommerce), hoeven alleen die links te worden aangepast.

## Online zetten

De site kan op elke gewone webhosting draaien. Gratis kan het ook via **GitHub Pages**, **Netlify** of **Cloudflare Pages**. Koppel daarna het domein `worldwidewine.nl` via de DNS-instellingen bij de domeinregistrar.
