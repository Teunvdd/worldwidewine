/*
 * Instellingen van de webshop. Wordt gebruikt door de website en door de betaalfunctie op de server.
 * Bedragen in euro, inclusief btw.
 */
(function (root) {
  var CONFIG = {
    shopName: "WorldWideWine.nl",
    email: "info@worldwidewine.nl",
    phone: "+31683172704",

    // Online betalen via Mollie (iDEAL, creditcard, Bancontact).
    // Zet op true zodra MOLLIE_API_KEY is ingesteld bij de hosting (zie README).
    onlinePayments: false,

    delivery: {
      "afhalen-zaandam": {
        label: "Afhalen in de winkel in Zaandam",
        detail: "Westzijde 358, Zaandam. Open op vrijdag 09:00 – 19:00, andere dagen op afspraak.",
        price: 0, pickup: true
      },
      "afhalen-weesp": {
        label: "Afhalen in Weesp",
        detail: "Op afspraak. Wij nemen contact met je op om een moment te plannen.",
        price: 0, pickup: true
      },
      "bezorgen-lokaal": {
        label: "Bezorgen in Zaandam, Weesp en omgeving",
        detail: "Wij bezorgen zelf. Bij levering vragen we om legitimatie (18+).",
        price: 7.50, freeFrom: 100, pickup: false
      },
      "postnl": {
        label: "Verzenden met PostNL (heel Nederland)",
        detail: "Maximaal 18 flessen per bestelling. Met leeftijdscheck bij aflevering.",
        price: 9.95, freeFrom: 150, maxBottles: 18, pickup: false
      }
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
  else root.WWW_CONFIG = CONFIG;
})(this);
