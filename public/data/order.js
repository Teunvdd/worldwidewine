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
    if (!p) return false;
    if (p.price == null && !pos) return false; // prijs op aanvraag: alleen in de kassa, met ingevoerde prijs
    if (p.active === false) return false;
    if (!pos && p.webshop === false) return false;
    if (p.stock === false) return false;
    if (!pos && hasStockCount(p) && p.stock <= 0) return false;
    return true;
  }

  // Per doos: aantal flessen in een doos (null = niet per doos te koop) en de prijs van een doos.
  function caseSize(p) { return p && p.caseSize >= 2 ? Math.floor(p.caseSize) : null; }
  function casePrice(p) {
    if (!caseSize(p)) return null;
    if (p.casePrice != null) return p.casePrice;
    return p.price == null ? null : round(p.price * caseSize(p));
  }
  // Sleutel van een regel: fles en doos van hetzelfde product zijn aparte regels.
  function lineKey(item) { return item.id + (item.box ? "|doos" : ""); }

  // ---- Bezorggebied (postcode) ----
  function postcodeNumber(pc) { var m = /^\s*([1-9][0-9]{3})/.exec(String(pc || "")); return m ? Number(m[1]) : null; }
  // true/false voor een bezorgwijze met een postcodegebied; null als er nog geen (geldige) postcode is.
  function deliversTo(delivery, postcode) {
    if (!delivery || !delivery.postcodes) return true;
    var n = postcodeNumber(postcode);
    if (n == null) return null;
    return delivery.postcodes.some(function (r) { return n >= r[0] && n <= r[1]; });
  }

  // ---- Afhaalmomenten (in Nederlandse tijd) ----
  var DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  var MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  function amsterdamNow(now) {
    var parts = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now || new Date()).forEach(function (x) { parts[x.type] = x.value; });
    return { date: parts.year + "-" + parts.month + "-" + parts.day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  }
  function toMin(hhmm) { var a = String(hhmm).split(":"); return Number(a[0]) * 60 + Number(a[1] || 0); }
  function hhmm(min) { return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
  // Lijst met dagen waarop afgehaald kan worden: [{ date: "2026-10-16", label: "vrijdag 16 oktober", times: ["09:00", …] }]
  function pickupDays(config, now) {
    var p = (config && config.pickup) || {};
    var hours = p.hours || {}, slot = p.slotMinutes || 30, closed = p.closedDates || [];
    var t = amsterdamNow(now), start = t.date.split("-").map(Number), out = [];
    for (var i = 0; i <= (p.daysAhead || 42); i++) {
      var d = new Date(Date.UTC(start[0], start[1] - 1, start[2] + i));
      var iso = d.toISOString().slice(0, 10), wd = d.getUTCDay(), h = hours[wd];
      if (!h || closed.indexOf(iso) >= 0) continue;
      var from = toMin(h[0]), to = toMin(h[1]), times = [];
      if (i === 0) from = Math.max(from, Math.ceil((t.minutes + (p.leadMinutes || 0)) / slot) * slot);
      for (var m = from; m + slot <= to; m += slot) times.push(hhmm(m));
      if (times.length) out.push({ date: iso, label: DAYS[wd] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(), times: times });
    }
    return out;
  }
  function pickupLabel(day, time) { return day.label + " " + day.year + " om " + time + " uur"; }

  function vatRate(p) {
    if (typeof p.vat === "number") return p.vat;
    return p.type === "delicatessen" || p.type === "water" ? 9 : 21;
  }

  /*
   * items:    [{ id, qty, box }] — box: true = per doos. In de kassa ook { price } (aangepaste prijs)
   *           en { discount } (korting % op de regel)
   * options:  { pos: true }          kassa: geen bezorging, ook producten die niet online staan,
   *                                  verkopen boven de geregistreerde voorraad is toegestaan
   *           { discount: { type: "percent" | "amount", value } }
   *           { postcode: "1012 AB" }   controleert of we op dat adres bezorgen (bezorgen in de regio)
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
    var extra = {};

    var keys = [];
    (items || []).forEach(function (item) {
      var id = item && item.id;
      var qty = Math.floor(Number(item && item.qty));
      if (!byId[id] || !(qty > 0)) return;
      var key = lineKey({ id: id, box: !!item.box });
      if (!merged[key]) { merged[key] = { id: id, box: !!item.box, qty: 0 }; keys.push(key); }
      merged[key].qty += qty;
      if (pos) {
        // Aangepaste prijs of regelkorting (alleen in de kassa)
        var e = extra[key] = extra[key] || {};
        if (item.price != null && item.price !== "" && Number(item.price) >= 0) e.price = round(Number(item.price));
        if (Number(item.discount) > 0) e.discount = Math.min(100, round(Number(item.discount)));
      }
    });

    // Voorraad telt in flessen: per product de flessen van losse flessen en dozen samen.
    var need = {};
    keys.forEach(function (key) {
      var m = merged[key], p = byId[m.id];
      need[m.id] = (need[m.id] || 0) + Math.min(m.qty, MAX_QTY) * (m.box ? caseSize(p) || 1 : 1);
    });
    var stockChecked = {};

    keys.forEach(function (key) {
      var m = merged[key];
      var p = byId[m.id];
      var qty = Math.min(m.qty, MAX_QTY);
      var x = extra[key] || {};
      var size = m.box ? caseSize(p) : 1;
      var name = p.producer + " " + p.name;
      if (!isAvailable(p, pos)) {
        errors.push(name + " is " + (hasStockCount(p) && p.stock <= 0 ? "uitverkocht." : "niet te bestellen."));
        return;
      }
      if (m.box && !size) { errors.push(name + " is niet per doos te koop."); return; }
      if (hasStockCount(p) && need[m.id] > p.stock) {
        if (pos) {
          if (!stockChecked[m.id]) warnings.push(name + ": volgens het systeem nog " + p.stock + " op voorraad.");
        } else {
          if (!stockChecked[m.id]) errors.push("Van " + name + " zijn er nog maar " + p.stock + (m.box || need[m.id] !== qty ? " flessen" : "") + " op voorraad.");
          stockChecked[m.id] = true;
          return;
        }
        stockChecked[m.id] = true;
      }
      var base = m.box ? casePrice(p) : p.price;
      var price = x.price != null ? x.price : base;
      if (price == null) { errors.push("Vul een prijs in voor " + name + "."); return; }
      var lineDiscount = x.discount || 0;
      var lineTotal = round(price * qty * (1 - lineDiscount / 100));
      var line = {
        id: p.id, key: key, name: p.producer + " — " + p.name, unit: m.box ? "doos van " + size : p.unit,
        qty: qty, price: price, total: lineTotal, vat: vatRate(p)
      };
      if (m.box) { line.box = true; line.packSize = size; }
      if (lineDiscount) line.discount = lineDiscount;
      if (price !== base) line.listPrice = base;
      lines.push(line);
      subtotal += lineTotal;
      bottles += (p.bottles || 0) * qty * size;
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
        if (deliversTo(delivery, options.postcode) === false) {
          errors.push("Op postcode " + String(options.postcode).trim().toUpperCase() + " bezorgen we helaas niet zelf. Kies verzenden met PostNL of afhalen in de winkel.");
        }
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

  var api = { computeOrder: computeOrder, isAvailable: isAvailable, vatRate: vatRate, round: round,
    caseSize: caseSize, casePrice: casePrice, lineKey: lineKey,
    deliversTo: deliversTo, pickupDays: pickupDays, pickupLabel: pickupLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WWW_ORDER = api;
})(this);
