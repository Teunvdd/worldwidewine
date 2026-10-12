/*
 * Instellingen van de webshop. Wordt gebruikt door de website en door de betaalfunctie op de server.
 * Bedragen in euro, inclusief btw.
 */
(function (root) {
  var CONFIG = {
    shopName: "WorldWideWine.nl",
    email: "info@worldwidewine.nl",
    phone: "+31683172704",

    // Online betalen via Mollie wordt automatisch aangezet zodra MOLLIE_API_KEY is ingesteld
    // bij de hosting (zie README). Deze waarde geldt alleen zonder server (bijv. lokaal geopend).
    onlinePayments: false,

    // Afrekenen: zo kan de klant zijn bestelling ontvangen.
    delivery: {
      "afhalen-zaandam": {
        label: "Afhalen in de winkel",
        detail: "Westzijde 358, Zaandam. Kies hieronder op welke dag en hoe laat je komt.",
        price: 0, pickup: true
      },
      "bezorgen-regio": {
        label: "Bezorgen in Amsterdam en omstreken",
        detail: "Wij bezorgen zelf in Amsterdam, Zaandam, Weesp en omgeving. Vul je postcode in om te zien of we bij je bezorgen. Bij levering vragen we om legitimatie (18+).",
        price: 7.50, freeFrom: 100, pickup: false,
        // Postcodes waar we zelf bezorgen (van – tot, de vier cijfers). Pas gerust aan.
        postcodes: [
          [1000, 1121],   // Amsterdam, Diemen, Duivendrecht, Landsmeer
          [1170, 1171],   // Badhoevedorp
          [1180, 1191],   // Amstelveen, Ouder-Amstel
          [1380, 1384],   // Weesp
          [1398, 1399],   // Muiden
          [1500, 1509],   // Zaandam
          [1520, 1531],   // Wormerveer, Oostzaan
          [1540, 1547],   // Koog aan de Zaan, Zaandijk, Westzaan
          [1560, 1567]    // Krommenie, Assendelft
        ]
      },
      "postnl": {
        label: "Verzenden met PostNL (heel Nederland)",
        detail: "Maximaal 18 flessen per bestelling. Met leeftijdscheck bij aflevering.",
        price: 9.95, freeFrom: 150, maxBottles: 18, pickup: false
      }
    },

    // Afhalen: op welke dagen en tijden klanten bij het afrekenen een afhaalmoment kunnen kiezen.
    // Dagen: 1 = maandag … 6 = zaterdag, 0 = zondag. Een dag die er niet staat is dicht.
    pickup: {
      hours: { 1: ["10:00", "18:00"], 2: ["10:00", "18:00"], 3: ["10:00", "18:00"], 4: ["10:00", "18:00"], 5: ["09:00", "19:00"], 6: ["10:00", "17:00"] },
      slotMinutes: 30,      // om het halfuur
      leadMinutes: 120,     // vandaag pas vanaf twee uur na nu
      daysAhead: 42,        // tot zes weken vooruit
      closedDates: []       // bijv. ["2026-12-25", "2026-12-26"]
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
  else root.WWW_CONFIG = CONFIG;
})(this);
