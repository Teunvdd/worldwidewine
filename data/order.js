/*
 * Berekent een bestelling: regels, subtotaal, korting, verzendkosten, btw en totaal.
 * Dezelfde code draait in de browser, op de server en in de kassa, zodat het
 * te betalen bedrag altijd uit de echte prijzen en voorraad wordt berekend.
 */
(function (root) {
  var MAX_QTY = 99;

  function round(n) { return Math.round(n * 100) / 100; }

  function hasStockCount(p) { return typeof p.stock === "number"; }

  // Is een product online (of in de kassa) te koop?
  function isAvailable(p, pos) {
    if (!p || p.price == null) return false;
    if (p.active === false) return false;
    if (!pos && p.webshop === false) return false;
    if (p.stock === false) return false;
    if (!pos && hasStockCount(p) && p.stock <= 0) return false;
    return true;
  }

  function vatRate(p) {
    if (typeof p.vat === "number") return p.vat;
    return p.type === "delicatessen" || p.type === "water" ? 9 : 21;
  }

  /*
   * items:    [{ id, qty }]
   * options:  { pos: true }          kassa: geen bezorging, ook producten die niet online staan,
   *                                  verkopen boven de geregistreerde voorraad is toegestaan
   *           { discount: { type: "percent" | "amount", value } }
   */
  function computeOrder(items, deliveryKey, products, config, options) {
    options = options || {};
    var pos = !!options.pos;
    var byId = {};
    products.forEach(function (p) { byId[p.id] = p; });

    var lines = [];
    var errors = [];
    var warnings = [];
    var subtotal = 0;
    var bottles = 0;
    var pickupOnly = false;
    var merged = {};

    (items || []).forEach(function (item) {
      var id = item && item.id;
      var qty = Math.floor(Number(item && item.qty));
      if (!byId[id] || !(qty > 0)) return;
      merged[id] = (merged[id] || 0) + qty;
    });

    Object.keys(merged).forEach(function (id) {
      var p = byId[id];
      var qty = Math.min(merged[id], MAX_QTY);
      if (!isAvailable(p, pos)) {
        errors.push(p.producer + " " + p.name + " is " + (hasStockCount(p) && p.stock <= 0 ? "uitverkocht." : "niet te bestellen."));
        return;
      }
      if (hasStockCount(p) && qty > p.stock) {
        if (pos) warnings.push(p.producer + " " + p.name + ": volgens het systeem nog " + p.stock + " op voorraad.");
        else {
          errors.push("Van " + p.producer + " " + p.name + " zijn er nog maar " + p.stock + " op voorraad.");
          return;
        }
      }
      var lineTotal = round(p.price * qty);
      lines.push({
        id: p.id, name: p.producer + " — " + p.name, unit: p.unit,
        qty: qty, price: p.price, total: lineTotal, vat: vatRate(p)
      });
      subtotal += lineTotal;
      bottles += (p.bottles || 0) * qty;
      if (p.pickupOnly) pickupOnly = true;
    });
    subtotal = round(subtotal);

    // Korting (kassa)
    var discount = 0;
    var d = options.discount;
    if (d && Number(d.value) > 0) {
      discount = d.type === "percent" ? subtotal * Math.min(Number(d.value), 100) / 100 : Math.min(Number(d.value), subtotal);
      discount = round(discount);
    }

    var delivery = null;
    var shipping = 0;
    if (!pos) {
      delivery = deliveryKey ? config.delivery[deliveryKey] : null;
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
    }
    if (!lines.length && !errors.length) errors.push("Je winkelwagen is leeg.");

    // Btw-specificatie (prijzen zijn incl. btw). Korting wordt naar rato verdeeld,
    // verzendkosten vallen onder het hoge tarief.
    var factor = subtotal > 0 ? (subtotal - discount) / subtotal : 1;
    var vatGroups = {};
    lines.forEach(function (l) { vatGroups[l.vat] = (vatGroups[l.vat] || 0) + l.total * factor; });
    if (shipping) vatGroups[21] = (vatGroups[21] || 0) + shipping;
    var vat = Object.keys(vatGroups).sort().map(function (rate) {
      var gross = round(vatGroups[rate]);
      return { rate: Number(rate), gross: gross, vat: round(gross * rate / (100 + Number(rate))) };
    });

    return {
      lines: lines,
      subtotal: subtotal,
      discount: discount,
      shipping: round(shipping),
      total: round(subtotal - discount + shipping),
      vat: vat,
      bottles: bottles,
      pickupOnly: pickupOnly,
      delivery: delivery,
      deliveryKey: delivery ? deliveryKey : null,
      errors: errors,
      warnings: warnings
    };
  }

  var api = { computeOrder: computeOrder, isAvailable: isAvailable, vatRate: vatRate, round: round };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WWW_ORDER = api;
})(this);
