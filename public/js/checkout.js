/* Afrekenpagina: bezorgmethode, gegevens, betaalwijze en bestelling plaatsen. */
// Openingstijden, bezorgtijden en bezorggebied komen uit de admin (via /api/shop-info).
// Zonder server rekenen we met de standaardwaarden uit config.js.
function loadShopInfo() {
  return fetch("/api/shop-info", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok && (r.headers.get("Content-Type") || "").indexOf("application/json") >= 0 ? r.json() : null; })
    .catch(function () { return null; });
}
window.WWW.ready.then(loadShopInfo).then(function (info) {
  var W = window.WWW;
  var CONFIG = W.CONFIG;
  var region = CONFIG.delivery["bezorgen-regio"];
  if (info && info.area && region) {
    region.postcodes = info.area.postcodes;
    region.price = info.area.price;
    if (info.area.freeFrom == null) delete region.freeFrom; else region.freeFrom = info.area.freeFrom;
  }
  var computeOrder = window.WWW_ORDER.computeOrder;
  var ORDER = window.WWW_ORDER;
  var form = document.getElementById("checkout-form");
  var $ = function (id) { return document.getElementById(id); };

  var PAYMENTS = {
    online: {
      label: "Direct online betalen",
      detail: "iDEAL, creditcard of Bancontact via Mollie. Je bestelling wordt na betaling direct verwerkt."
    },
    "bij-afhalen": {
      label: "Betalen bij afhalen",
      detail: "Met pin of contant in de winkel."
    },
    betaalverzoek: {
      label: "Betaalverzoek per e-mail",
      detail: "We bevestigen je bestelling en sturen je een betaallink. Na betaling maken we je bestelling klaar."
    }
  };

  function radio(name, key, opt, extra) {
    return '<label class="option"><input type="radio" name="' + name + '" value="' + key + '" required>' +
      '<span class="option-body"><span class="option-title">' + W.esc(opt.label) +
      (extra ? '<span class="option-price">' + extra + "</span>" : "") + "</span>" +
      '<span class="option-detail">' + W.esc(opt.detail) + "</span></span></label>";
  }

  function deliveryPrice(d, subtotal) {
    if (!d.price) return "Gratis";
    if (d.freeFrom && subtotal >= d.freeFrom) return "Gratis";
    return W.euro(d.price);
  }

  function value(name) {
    var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]');
    return el && (el.type === "radio" || el.type === "checkbox") ? (el.checked ? el.value : "") : (el ? el.value.trim() : "");
  }

  function renderOptions() {
    var items = W.Cart.items();
    var base = computeOrder(items, null, W.PRODUCTS, CONFIG);
    var current = value("bezorging");
    $("delivery-options").innerHTML = Object.keys(CONFIG.delivery).map(function (k) {
      return radio("bezorging", k, CONFIG.delivery[k], deliveryPrice(CONFIG.delivery[k], base.subtotal));
    }).join("");
    if (current) {
      var again = form.querySelector('[name="bezorging"][value="' + current + '"]');
      if (again) again.checked = true;
    }
    form.querySelectorAll('[name="bezorging"]').forEach(function (input) {
      var d = CONFIG.delivery[input.value];
      var blocked = (base.pickupOnly && !d.pickup) || (d.maxBottles && base.bottles > d.maxBottles);
      input.disabled = !!blocked;
      if (blocked) input.checked = false;
      input.closest(".option").classList.toggle("is-disabled", !!blocked);
    });

    var notes = [];
    if (base.pickupOnly) notes.push("Je bestelling bevat producten die alleen af te halen zijn.");
    var postnl = CONFIG.delivery.postnl;
    if (postnl && base.bottles > postnl.maxBottles) notes.push("PostNL is niet mogelijk boven " + postnl.maxBottles + " flessen (je hebt er " + base.bottles + ").");
    $("delivery-notice").hidden = !notes.length;
    $("delivery-notice").textContent = notes.join(" ");
  }

  function renderPayments() {
    var d = CONFIG.delivery[value("bezorging")];
    var current = value("betaling");
    var keys = [];
    if (W.state.onlinePayments) keys.push("online");
    if (d && d.pickup) keys.push("bij-afhalen");
    keys.push("betaalverzoek");
    $("payment-options").innerHTML = keys.map(function (k) { return radio("betaling", k, PAYMENTS[k]); }).join("");
    var pick = form.querySelector('[name="betaling"][value="' + current + '"]') || form.querySelector('[name="betaling"]');
    if (pick) pick.checked = true;
  }

  function renderFields() {
    var d = CONFIG.delivery[value("bezorging")];
    var ship = !!(d && !d.pickup), pick = !!(d && d.pickup);
    $("address-fields").hidden = !ship;
    $("pickup-fields").hidden = !pick;
    form.querySelectorAll("[data-address]").forEach(function (i) { i.required = ship; });
    form.querySelectorAll("[data-pickup]").forEach(function (i) { i.required = pick; });
    renderArea();
  }

  // ---- Afhalen: dag en tijd kiezen ----
  // Agenda: maanden met de dagen waarop afgehaald kan worden, daarnaast de tijden van de gekozen dag.
  var days = info ? info.pickupDays : ORDER.pickupDays(CONFIG);
  var byDate = {};
  days.forEach(function (d) { byDate[d.date] = d; });
  var MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
  var iso = function (y, m, d) { return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"); };
  var monthOf = function (date) { var a = date.split("-").map(Number); return { y: a[0], m: a[1] - 1 }; };
  var todayIso = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  var calMonth = days.length ? monthOf(days[0].date) : monthOf(todayIso);
  var firstMonth = calMonth, lastMonth = days.length ? monthOf(days[days.length - 1].date) : calMonth;
  var mIndex = function (x) { return x.y * 12 + x.m; };

  function renderCalendar() {
    var y = calMonth.y, m = calMonth.m, chosen = value("afhaaldag");
    var startWd = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7; // maandag = 0
    var count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var cells = "";
    for (var i = 0; i < startWd; i++) cells += "<span class='cal-day is-empty'></span>";
    for (var d = 1; d <= count; d++) {
      var date = iso(y, m, d), ok = !!byDate[date];
      var cls = "cal-day" + (ok ? " is-open" : "") + (date === chosen ? " is-selected" : "") + (date === todayIso ? " is-today" : "");
      cells += ok ? "<button type='button' class='" + cls + "' data-day='" + date + "' aria-pressed='" + (date === chosen) + "' aria-label='" + W.esc(cap(byDate[date].label)) + "'>" + d + "</button>"
        : "<span class='" + cls + "' aria-hidden='true'>" + d + "</span>";
    }
    $("pick-cal").innerHTML =
      "<div class='cal-head'><button type='button' class='cal-nav' data-cal='-1' aria-label='Vorige maand'" + (mIndex(calMonth) <= mIndex(firstMonth) ? " disabled" : "") + ">‹</button>" +
        "<strong>" + cap(MONTHS[m]) + " " + y + "</strong>" +
        "<button type='button' class='cal-nav' data-cal='1' aria-label='Volgende maand'" + (mIndex(calMonth) >= mIndex(lastMonth) ? " disabled" : "") + ">›</button></div>" +
      "<div class='cal-grid'>" + ["ma", "di", "wo", "do", "vr", "za", "zo"].map(function (w) { return "<span class='cal-wd'>" + w + "</span>"; }).join("") + cells + "</div>";
  }

  function renderSlots() {
    var day = byDate[value("afhaaldag")], chosen = value("afhaaltijd");
    if (!days.length) { $("pick-slots").innerHTML = "<p class='slots-empty'>Er zijn op dit moment geen afhaalmomenten beschikbaar. Bel ons op +31 6 83 17 27 04, dan maken we samen een afspraak.</p>"; return; }
    if (!day) { $("pick-slots").innerHTML = "<p class='slots-empty'>Kies eerst een dag in de agenda.</p>"; return; }
    var parts = [["Ochtend", 0, 12], ["Middag", 12, 17], ["Avond", 17, 24]];
    $("pick-slots").innerHTML = "<p class='slots-day'>" + W.esc(cap(day.label)) + "</p>" + parts.map(function (p) {
      var list = day.times.filter(function (t) { var h = Number(t.slice(0, 2)); return h >= p[1] && h < p[2]; });
      return list.length ? "<p class='slots-part'>" + p[0] + "</p><div class='slot-list'>" + list.map(function (t) {
        return "<button type='button' class='slot" + (t === chosen ? " is-selected" : "") + "' data-time='" + t + "' aria-pressed='" + (t === chosen) + "'>" + t + "</button>";
      }).join("") + "</div>" : "";
    }).join("");
  }

  function renderPickSummary() {
    var m = pickupMoment(), el = $("pick-summary");
    el.hidden = !m;
    el.innerHTML = m ? "✓ Je haalt je bestelling op <strong>" + W.esc(m) + "</strong>." : "";
  }

  function chooseDay(date) {
    form.elements.afhaaldag.value = date;
    var day = byDate[date];
    if (!day || day.times.indexOf(form.elements.afhaaltijd.value) < 0) form.elements.afhaaltijd.value = "";
    renderCalendar(); renderSlots(); renderPickSummary();
  }

  function renderPickupDays() {
    if (days.length && !byDate[value("afhaaldag")]) form.elements.afhaaldag.value = days[0].date; // eerste mogelijke dag alvast open
    renderCalendar(); renderSlots(); renderPickSummary();
  }

  $("pick").addEventListener("click", function (e) {
    var nav = e.target.closest("[data-cal]"), day = e.target.closest("[data-day]"), slot = e.target.closest("[data-time]");
    if (nav) {
      var n = mIndex(calMonth) + Number(nav.dataset.cal);
      calMonth = { y: Math.floor(n / 12), m: n % 12 };
      renderCalendar();
    } else if (day) chooseDay(day.dataset.day);
    else if (slot) {
      form.elements.afhaaltijd.value = slot.dataset.time;
      renderSlots(); renderPickSummary();
      $("pick").classList.remove("is-missing");
    }
  });
  function pickupMoment() {
    var day = days.find(function (d) { return d.date === value("afhaaldag"); });
    return day && value("afhaaltijd") ? ORDER.pickupLabel(day, value("afhaaltijd")) : "";
  }

  // ---- Bezorgen in de regio: postcode controleren ----
  function renderArea() {
    var d = CONFIG.delivery[value("bezorging")], el = $("area-check");
    var ok = d && d.postcodes ? ORDER.deliversTo(d, value("postcode")) : null;
    el.hidden = ok === null;
    el.className = "field-wide area-check " + (ok ? "is-ok" : "is-bad");
    el.textContent = ok ? "✓ Goed nieuws: we bezorgen zelf op dit adres."
      : "Op deze postcode bezorgen we helaas niet zelf. Kies verzenden met PostNL of afhalen in de winkel.";
  }

  function renderSummary() {
    var order = computeOrder(W.Cart.items(), value("bezorging") || null, W.PRODUCTS, CONFIG, { postcode: value("postcode") });
    var empty = !order.lines.length;
    $("checkout-empty").hidden = !empty;
    $("checkout-grid").hidden = empty;
    if (empty) return order;
    $("summary-lines").innerHTML = order.lines.map(function (l) {
      var p = W.byId[l.id];
      return '<div class="sum-line">' + W.art(p, "sm") +
        '<div><p class="product-producer">' + W.esc(p.producer) + "</p><p>" + W.esc(p.name) + '</p><p class="muted">' + l.qty + " × " + (l.box ? W.esc(l.unit) + " à " : "") + W.euro(l.price) + "</p></div>" +
        "<strong>" + W.euro(l.total) + "</strong></div>";
    }).join("");
    $("sum-subtotal").textContent = W.euro(order.subtotal);
    $("sum-shipping").textContent = order.delivery ? (order.shipping ? W.euro(order.shipping) : "Gratis") : "Kies hiernaast";
    $("sum-total").textContent = W.euro(order.total);
    var d = order.delivery;
    $("sum-free").textContent = d && d.freeFrom && order.subtotal < d.freeFrom
      ? "Nog " + W.euro(d.freeFrom - order.subtotal) + " tot gratis " + (d.maxBottles ? "verzending" : "bezorging") + "."
      : "";
    return order;
  }

  function renderAll() { renderOptions(); renderFields(); renderPayments(); renderSummary(); }

  form.addEventListener("change", function (e) {
    if (e.target.name === "bezorging") { renderFields(); renderPayments(); renderSummary(); }
  });
  // Ingelogd via Mijn account: gegevens alvast invullen.
  try {
    var prof = JSON.parse(sessionStorage.getItem("wwwProfile") || "null");
    if (prof) [["naam", "name"], ["email", "email"], ["telefoon", "phone"], ["adres", "address"], ["postcode", "postcode"], ["plaats", "city"]].forEach(function (f) {
      if (form.elements[f[0]] && !form.elements[f[0]].value && prof[f[1]]) form.elements[f[0]].value = prof[f[1]];
    });
  } catch (err) {}
  form.elements.postcode.addEventListener("input", function () { renderArea(); });
  renderPickupDays();
  document.addEventListener("cart:change", renderAll);
  renderAll();

  // ---- Bestelling plaatsen ----
  function orderNumber() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return "WWW-" + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" +
      Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function summaryText(order, data) {
    var lines = order.lines.map(function (l) { return l.qty + " × " + l.name + " (" + l.unit + ") — " + W.euro(l.total); });
    var who = [data.naam, data.email, data.telefoon];
    if (!order.delivery.pickup) who.push(data.adres, data.postcode + " " + data.plaats);
    return [
      "Ordernummer: " + data.ordernummer, "",
      lines.join("\n"), "",
      "Subtotaal: " + W.euro(order.subtotal),
      "Verzending: " + (order.shipping ? W.euro(order.shipping) : "gratis") + " — " + order.delivery.label,
      "Totaal: " + W.euro(order.total), "",
      "Betaling: " + PAYMENTS[data.betaling].label,
      data.afhaalmoment ? "Afhalen: " + data.afhaalmoment : "",
      data.opmerkingen ? "Opmerkingen: " + data.opmerkingen : "", "",
      who.join("\n")
    ].filter(function (l, i, a) { return l !== "" || a[i - 1] !== ""; }).join("\n");
  }

  function showError(msg) {
    $("form-error").textContent = msg;
    $("form-error").hidden = false;
  }

  function busy(on) {
    $("submit").disabled = on;
    $("submit").textContent = on ? "Bezig…" : "Bestelling plaatsen";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    $("form-error").hidden = true;
    if (!value("bezorging")) return showError("Kies hoe je je bestelling wilt ontvangen.");
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      var bad = form.querySelector(":invalid:not([type=hidden])");
      if (bad) bad.focus();
      return showError("Controleer de gemarkeerde velden.");
    }
    var order = computeOrder(W.Cart.items(), value("bezorging"), W.PRODUCTS, CONFIG, { postcode: value("postcode") });
    if (order.errors.length) return showError(order.errors.join(" "));
    if (order.delivery.pickup && (!value("afhaaldag") || !value("afhaaltijd"))) {
      $("pick").classList.add("is-missing");
      $("pick").scrollIntoView({ behavior: "smooth", block: "center" });
      return showError("Kies in de agenda een dag en tijd waarop je je bestelling komt ophalen.");
    }

    var data = {};
    ["naam", "email", "telefoon", "adres", "postcode", "plaats", "afhaaldag", "afhaaltijd", "opmerkingen", "bezorging", "betaling"]
      .forEach(function (n) { data[n] = value(n); });
    data.afhaalmoment = order.delivery.pickup ? pickupMoment() : "";
    data.ordernummer = orderNumber();
    var text = summaryText(order, data);
    var saved = { number: data.ordernummer, order: order, data: data, text: text, payment: data.betaling };
    busy(true);

    function viaMail() {
      // Geen server beschikbaar (bijv. lokaal geopend): bestelling per e-mail versturen.
      saved.viaMail = true;
      store(saved);
      location.href = "mailto:" + CONFIG.email + "?subject=" + encodeURIComponent("Bestelling " + data.ordernummer) +
        "&body=" + encodeURIComponent(text);
      setTimeout(function () { W.Cart.clear(); location.href = "bedankt.html"; }, 800);
    }

    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: data.ordernummer,
        hp: form.elements.website.value, // spamval: echte klanten vullen dit verborgen veld niet in
        items: W.Cart.items(),
        delivery: data.bezorging,
        payment: data.betaling,
        notes: data.opmerkingen,
        pickupDate: data.afhaaldag,
        pickupTime: data.afhaaltijd,
        newsletter: form.elements.nieuwsbrief.checked,
        customer: { name: data.naam, email: data.email, phone: data.telefoon, address: data.adres, postcode: data.postcode, city: data.plaats }
      })
    })
      .then(function (r) {
        var isJson = (r.headers.get("Content-Type") || "").indexOf("application/json") >= 0;
        if (!isJson || r.status === 404 || r.status === 405) return { offline: true };
        return r.json().then(function (j) { return { ok: r.ok, body: j }; });
      }, function () { return { offline: true }; })
      .then(function (res) {
        if (res.offline) {
          // Geen bestel-API bereikbaar (bijv. lokaal geopend): bestelling per e-mail.
          return viaMail();
        }
        if (!res.ok) {
          busy(false);
          return showError(res.body.error || "Je bestelling kon niet worden geplaatst.");
        }
        // Bestelling staat in het systeem; de server stuurt de e-mails.
        if (res.body.checkoutUrl) {
          store(saved);
          W.Cart.clear();
          location.href = res.body.checkoutUrl;
        } else {
          if (res.body.paymentFailed) { saved.payment = "betaalverzoek"; saved.paymentFailed = true; }
          finish(saved);
        }
      });
  });

  function store(saved) {
    try { sessionStorage.setItem("wwwLastOrder", JSON.stringify(saved)); } catch (e) {}
  }
  function finish(saved) {
    store(saved);
    W.Cart.clear();
    location.href = "bedankt.html";
  }
});
