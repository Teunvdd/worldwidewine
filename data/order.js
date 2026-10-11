/*
 * Berekent een bestelling: regels, subtotaal, verzendkosten en totaal.
 * Dezelfde code draait in de browser en op de server, zodat het te betalen
 * bedrag altijd uit de echte prijzen wordt berekend.
 */
(function (root) {
  var MAX_QTY = 99;

  function round(n) { return Math.round(n * 100) / 100; }

  // items: [{ id, qty }]
  function computeOrder(items, deliveryKey, products, config) {
    var byId = {};
    products.forEach(function (p) { byId[p.id] = p; });

    var lines = [];
    var errors = [];
    var subtotal = 0;
    var bottles = 0;
    var pickupOnly = false;

    (items || []).forEach(function (item) {
      var p = byId[item && item.id];
      var qty = Math.floor(Number(item && item.qty));
      if (!p || !(qty > 0)) return;
      if (p.price == null || p.stock === false) {
        errors.push(p.producer + " " + p.name + " is niet online te bestellen.");
        return;
      }
      qty = Math.min(qty, MAX_QTY);
      var lineTotal = round(p.price * qty);
      lines.push({ id: p.id, name: p.producer + " — " + p.name, unit: p.unit, qty: qty, price: p.price, total: lineTotal });
      subtotal += lineTotal;
      bottles += (p.bottles || 0) * qty;
      if (p.pickupOnly) pickupOnly = true;
    });
    subtotal = round(subtotal);

    var delivery = deliveryKey ? config.delivery[deliveryKey] : null;
    var shipping = 0;
    if (deliveryKey && !delivery) errors.push("Kies een geldige verzendmethode.");
    if (delivery) {
      if (pickupOnly && !delivery.pickup) {
        errors.push("Je bestelling bevat producten die alleen af te halen zijn. Kies voor afhalen.");
      }
      if (delivery.maxBottles && bottles > delivery.maxBottles) {
        errors.push("Met PostNL kunnen we maximaal " + delivery.maxBottles + " flessen per bestelling versturen (je hebt er " + bottles + "). Kies voor afhalen of lokale bezorging, of verdeel je bestelling.");
      }
      shipping = delivery.freeFrom && subtotal >= delivery.freeFrom ? 0 : delivery.price;
    }
    if (!lines.length) errors.push("Je winkelwagen is leeg.");

    return {
      lines: lines,
      subtotal: subtotal,
      shipping: round(shipping),
      total: round(subtotal + shipping),
      bottles: bottles,
      pickupOnly: pickupOnly,
      delivery: delivery,
      deliveryKey: delivery ? deliveryKey : null,
      errors: errors
    };
  }

  var api = { computeOrder: computeOrder };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WWW_ORDER = api;
})(this);
