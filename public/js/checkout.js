/* Afrekenpagina: bezorgmethode, gegevens, betaalwijze en bestelling plaatsen. */
window.WWW.ready.then(function () {
  var W = window.WWW;
  var CONFIG = W.CONFIG;
  var computeOrder = window.WWW_ORDER.computeOrder;
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
    var ship = !!(d && !d.pickup);
    $("address-fields").hidden = !ship;
    $("pickup-fields").hidden = !(d && d.pickup);
    form.querySelectorAll("[data-address]").forEach(function (i) { i.required = ship; });
  }

  function renderSummary() {
    var order = computeOrder(W.Cart.items(), value("bezorging") || null, W.PRODUCTS, CONFIG);
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
      data.afhaalmoment ? "Afhaalmoment: " + data.afhaalmoment : "",
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
    var order = computeOrder(W.Cart.items(), value("bezorging"), W.PRODUCTS, CONFIG);
    if (order.errors.length) return showError(order.errors.join(" "));

    var data = {};
    ["naam", "email", "telefoon", "adres", "postcode", "plaats", "afhaalmoment", "opmerkingen", "bezorging", "betaling"]
      .forEach(function (n) { data[n] = value(n); });
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
        pickupMoment: data.afhaalmoment,
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
