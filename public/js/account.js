/* Mijn account: inloggen met een code per e-mail, bestellingen met afhaal- of bezorginformatie,
 * eigen gegevens en de nieuwsbrief. */
window.WWW.ready.then(function () {
  var W = window.WWW, esc = W.esc, euro = W.euro;
  var box = document.getElementById("account");
  var SHOP = "Westzijde 358, 1506 GK Zaandam";
  var state = { email: "", devCode: null };

  function api(method, body) {
    return fetch("/api/account", {
      method: method, credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      var isJson = (r.headers.get("Content-Type") || "").indexOf("application/json") >= 0;
      if (!isJson) throw new Error("Mijn account is op dit moment niet bereikbaar. Probeer het later opnieuw.");
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Er ging iets mis."); return j; });
    });
  }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.innerHTML = "<span class='spinner spinner-sm'></span>" + esc(label); }
    else { btn.disabled = false; btn.textContent = btn.dataset.label; }
  }
  function errorBox(form, msg) {
    var el = form.querySelector(".form-error");
    el.textContent = msg || ""; el.hidden = !msg;
  }
  function date(iso, withTime) {
    var d = new Date(iso);
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) +
      (withTime ? ", " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "");
  }

  // ---- Inloggen ----
  function showLogin() {
    document.getElementById("account-head").hidden = true;
    box.innerHTML =
      "<div class='account-login'><form class='account-card' id='code-form' novalidate>" +
        "<h1>Inloggen</h1><p class='muted'>Vul je e-mailadres in. We sturen je een code van zes cijfers; een wachtwoord is niet nodig.</p>" +
        "<label class='field'>E-mailadres<input type='email' name='email' autocomplete='email' required value='" + esc(state.email) + "'></label>" +
        "<p class='form-error' role='alert' hidden></p>" +
        "<button class='btn btn-block' type='submit'>Stuur mij een code</button>" +
      "</form></div>";
    var form = box.querySelector("#code-form");
    form.email.focus();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      if (!form.checkValidity() || !email) return errorBox(form, "Vul een geldig e-mailadres in.");
      var btn = form.querySelector("button"); busy(btn, true, "Code versturen…"); errorBox(form);
      api("POST", { action: "code", email: email }).then(function (r) {
        state.email = email; state.devCode = r.devCode || null; showCode();
      }).catch(function (err) { busy(btn, false); errorBox(form, err.message); });
    });
  }

  function showCode() {
    document.getElementById("account-head").hidden = true;
    box.innerHTML =
      "<div class='account-login'><form class='account-card' id='login-form' novalidate>" +
        "<h1>Vul je code in</h1><p class='muted'>We hebben een code van zes cijfers gestuurd naar <strong>" + esc(state.email) + "</strong>. Kijk ook even bij je ongewenste e-mail. De code is 15 minuten geldig.</p>" +
        (state.devCode ? "<p class='notice'>Testomgeving zonder e-mail: je code is <strong>" + esc(state.devCode) + "</strong></p>" : "") +
        "<label class='field'>Code<input name='code' class='code-input' inputmode='numeric' autocomplete='one-time-code' maxlength='6' pattern='[0-9]{6}' required placeholder='••••••'></label>" +
        "<p class='form-error' role='alert' hidden></p>" +
        "<button class='btn btn-block' type='submit'>Inloggen</button>" +
        "<p class='account-alt'><button type='button' class='link-btn' id='other-email'>Ander e-mailadres</button> · <button type='button' class='link-btn' id='resend'>Stuur een nieuwe code</button></p>" +
      "</form></div>";
    var form = box.querySelector("#login-form");
    form.code.focus();
    form.code.addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 6);
      if (this.value.length === 6) form.requestSubmit();
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!/^\d{6}$/.test(form.code.value)) return errorBox(form, "Vul de zes cijfers van de code in.");
      var btn = form.querySelector("button[type=submit]"); busy(btn, true, "Inloggen…"); errorBox(form);
      api("POST", { action: "login", email: state.email, code: form.code.value }).then(load)
        .catch(function (err) { busy(btn, false); errorBox(form, err.message); form.code.select(); });
    });
    box.querySelector("#other-email").addEventListener("click", showLogin);
    box.querySelector("#resend").addEventListener("click", function () {
      var b = this; b.disabled = true;
      api("POST", { action: "code", email: state.email }).then(function (r) { state.devCode = r.devCode || null; showCode(); })
        .catch(function (err) { b.disabled = false; errorBox(form, err.message); });
    });
  }

  // ---- Bestellingen ----
  function isPostnl(o) { return o.delivery === "postnl"; }
  function statusText(o) {
    if (o.channel === "winkel") return "Gekocht in de winkel";
    return {
      nieuw: "Ontvangen", betaald: "Betaald, we gaan aan de slag",
      klaar: o.pickup ? "Klaar om af te halen" : "Klaar voor verzending",
      verzonden: isPostnl(o) ? "Verzonden met PostNL" : "Onderweg naar je toe",
      afgerond: o.pickup ? "Afgehaald" : "Afgeleverd", geannuleerd: "Geannuleerd"
    }[o.status] || o.status;
  }
  function steps(o) {
    var list = o.pickup ? [["nieuw", "Ontvangen"], ["klaar", "Klaar om af te halen"], ["afgerond", "Afgehaald"]]
      : [["nieuw", "Ontvangen"], ["klaar", "Klaargezet"], ["verzonden", isPostnl(o) ? "Verzonden" : "Onderweg"], ["afgerond", "Afgeleverd"]];
    var rank = { nieuw: 0, betaald: 0, klaar: 1, verzonden: o.pickup ? 1 : 2, afgerond: list.length - 1 }[o.status];
    return "<ol class='order-steps'>" + list.map(function (s, i) {
      return "<li class='" + (i < rank ? "done" : i === rank ? "current" : "") + "'><span></span>" + esc(s[1]) + "</li>";
    }).join("") + "</ol>";
  }
  function payText(o) {
    if (o.channel === "winkel") return o.paymentLabel;
    if (o.paymentStatus === "betaald") return "Betaald (" + o.paymentLabel.toLowerCase() + ")";
    if (o.paymentMethod === "bij-afhalen") return "Je betaalt bij het afhalen (pin of contant)";
    if (o.paymentMethod === "betaalverzoek") return "Nog te betalen: je ontvangt een betaallink per e-mail";
    return "Betaling nog niet ontvangen";
  }
  function whenText(o) {
    if (o.pickup) return o.pickupMoment ? "Afhalen op <strong>" + esc(o.pickupMoment) + "</strong>" : "Afhalen in de winkel";
    if (isPostnl(o)) return "Wordt verzonden met <strong>PostNL</strong>";
    return "Wij <strong>bezorgen</strong> je bestelling zelf" + (o.pickupMoment ? " op <strong>" + esc(o.pickupMoment) + "</strong>" : "");
  }
  function active(o) { return o.channel !== "winkel" && ["afgerond", "geannuleerd"].indexOf(o.status) < 0; }

  function orderCard(o, open) {
    var shopOrder = o.channel === "winkel";
    var addr = o.address && o.address.address ? esc(o.address.address) + ", " + esc(o.address.postcode) + " " + esc(o.address.city) : "";
    return "<details class='order-card" + (o.status === "geannuleerd" ? " is-cancelled" : "") + "'" + (open ? " open" : "") + ">" +
      "<summary><span class='oc-main'><strong>" + (shopOrder ? "Aankoop in de winkel" : "Bestelling " + esc(o.number)) + "</strong>" +
        "<span class='muted'>" + date(o.createdAt) + " · " + o.lines.reduce(function (n, l) { return n + l.qty; }, 0) + " artikel(en)</span></span>" +
        "<span class='oc-status status-" + esc(o.status) + "'>" + esc(statusText(o)) + "</span>" +
        "<strong class='oc-total'>" + euro(o.total) + "</strong></summary>" +
      "<div class='oc-body'>" +
        (shopOrder || o.status === "geannuleerd" ? "" : steps(o)) +
        "<div class='oc-info'>" +
          (shopOrder ? "<div><h4>Waar</h4><p>In de winkel, " + SHOP + "<br><span class='muted'>Bonnummer " + esc(o.number) + "</span></p></div>"
            : "<div><h4>" + (o.pickup ? "Afhalen" : "Levering") + "</h4><p>" + whenText(o) +
              (o.pickup ? "<br><span class='muted'>" + SHOP + "</span>" : addr ? "<br><span class='muted'>" + addr + "</span>" : "") + "</p></div>") +
          "<div><h4>Betaling</h4><p>" + esc(payText(o)) + "</p></div>" +
        "</div>" +
        "<table class='oc-lines'>" + o.lines.map(function (l) {
          return "<tr><td>" + l.qty + " ×</td><td>" + esc(l.name) + (l.box ? " <span class='muted'>(" + esc(l.unit) + ")</span>" : "") + "</td><td class='num'>" + euro(l.total) + "</td></tr>";
        }).join("") +
          (o.discount ? "<tr class='oc-sum'><td></td><td>Korting</td><td class='num'>− " + euro(o.discount) + "</td></tr>" : "") +
          (shopOrder ? "" : "<tr class='oc-sum'><td></td><td>" + (o.pickup ? "Afhalen" : "Verzending") + "</td><td class='num'>" + (o.shipping ? euro(o.shipping) : "gratis") + "</td></tr>") +
          "<tr class='oc-total-row'><td></td><td>Totaal (incl. btw)</td><td class='num'>" + euro(o.total) + "</td></tr></table>" +
        "<div class='oc-actions'><button type='button' class='btn btn-small' data-reorder='" + esc(o.number) + "'>Opnieuw bestellen</button>" +
          "<a class='link-arrow' href='mailto:info@worldwidewine.nl?subject=" + encodeURIComponent("Vraag over " + (shopOrder ? "bon " : "bestelling ") + o.number) + "'>Vraag over deze bestelling</a></div>" +
      "</div></details>";
  }

  function highlight(o) {
    return "<article class='next-up'><p class='eyebrow'>" + (o.pickup ? "Je volgende afhaalmoment" : "Onderweg") + "</p>" +
      "<h2>" + (o.pickup && o.pickupMoment ? esc(o.pickupMoment.replace(/^./, function (c) { return c.toUpperCase(); })) : esc(statusText(o))) + "</h2>" +
      "<p>" + (o.pickup ? "In de winkel aan de " + SHOP + ". " + esc(payText(o)) + "." : whenText(o) + ". " + esc(payText(o)) + ".") + "</p>" +
      "<p class='muted'>Bestelling " + esc(o.number) + " · " + esc(statusText(o)) + "</p>" +
      (o.pickup ? "<a class='link-arrow' href='https://www.google.com/maps/search/?api=1&amp;query=Westzijde+358+1506+GK+Zaandam' target='_blank' rel='noopener'>Route plannen</a>" : "") +
    "</article>";
  }

  // ---- Ingelogd ----
  function showAccount(data) {
    var p = data.profile, orders = data.orders;
    var upcoming = orders.filter(active);
    var first = (p.name || "").split(" ")[0];
    document.getElementById("account-title").textContent = first ? "Hoi " + first + "!" : "Welkom!";
    document.getElementById("account-head").hidden = false;
    box.innerHTML =
      "<div class='account-grid'><div class='account-main'>" +
        upcoming.map(highlight).join("") +
        "<section><h2 class='account-h'>Mijn bestellingen</h2>" +
        (orders.length ? orders.map(function (o, i) { return orderCard(o, i === 0 && active(o)); }).join("")
          : "<div class='account-card empty-orders'><p>Je hebt nog geen bestellingen bij ons met dit e-mailadres.</p><a class='btn' href='webshop.html'>Naar de webshop</a></div>") +
        "</section></div>" +
      "<aside class='account-side'>" +
        "<section class='account-card'><h2>Nieuwsbrief</h2>" +
          "<label class='toggle'><input type='checkbox' id='newsletter'" + (p.newsletter ? " checked" : "") + "><span class='toggle-ui' aria-hidden='true'></span>" +
          "<span>Ik ontvang graag de nieuwsbrief met nieuwe wijnen, acties en proeverijen.</span></label>" +
          "<p class='muted small' id='newsletter-msg'>Hooguit een paar keer per maand. Je kunt je altijd hier weer afmelden.</p></section>" +
        "<form class='account-card' id='profile-form'><h2>Mijn gegevens</h2>" +
          "<p class='muted small'>Ingelogd als <strong>" + esc(p.email) + "</strong>. We vullen deze gegevens alvast in bij je volgende bestelling.</p>" +
          "<label class='field'>Naam<input name='name' autocomplete='name' value='" + esc(p.name) + "'></label>" +
          "<label class='field'>Telefoonnummer<input name='phone' type='tel' autocomplete='tel' value='" + esc(p.phone) + "'></label>" +
          "<label class='field'>Straat en huisnummer<input name='address' autocomplete='street-address' value='" + esc(p.address) + "'></label>" +
          "<div class='field-row'><label class='field'>Postcode<input name='postcode' autocomplete='postal-code' value='" + esc(p.postcode) + "'></label>" +
          "<label class='field'>Plaats<input name='city' autocomplete='address-level2' value='" + esc(p.city) + "'></label></div>" +
          "<p class='form-error' role='alert' hidden></p>" +
          "<button class='btn btn-block' type='submit'>Gegevens opslaan</button></form>" +
        "<section class='account-card'><h2>Vragen?</h2><p class='muted small'>Bel of app ons, of mail met je bestelnummer erbij.</p>" +
          "<p><a href='tel:+31683172704'>+31 6 83 17 27 04</a><br><a href='https://wa.me/31683172704' target='_blank' rel='noopener'>WhatsApp</a><br><a href='mailto:info@worldwidewine.nl'>info@worldwidewine.nl</a></p></section>" +
        "<button class='btn btn-ghost btn-block' id='logout' type='button'>Uitloggen</button>" +
      "</aside></div>";

    // Gegevens alvast klaarzetten voor het afrekenen.
    try { sessionStorage.setItem("wwwProfile", JSON.stringify(p)); } catch (e) {}

    box.querySelector("#newsletter").addEventListener("change", function () {
      var cb = this, msg = box.querySelector("#newsletter-msg");
      cb.disabled = true;
      api("POST", { action: "profile", newsletter: cb.checked }).then(function (r) {
        cb.disabled = false;
        msg.textContent = r.profile.newsletter ? "✓ Je bent aangemeld voor de nieuwsbrief." : "Je bent afgemeld voor de nieuwsbrief.";
      }).catch(function (err) { cb.disabled = false; cb.checked = !cb.checked; msg.textContent = err.message; });
    });
    var form = box.querySelector("#profile-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector("button"); busy(btn, true, "Opslaan…"); errorBox(form);
      api("POST", { action: "profile", name: form.name.value, phone: form.phone.value, address: form.address.value, postcode: form.postcode.value, city: form.city.value })
        .then(function (r) {
          busy(btn, false); btn.textContent = "✓ Opgeslagen";
          try { sessionStorage.setItem("wwwProfile", JSON.stringify(r.profile)); } catch (e2) {}
          setTimeout(function () { btn.textContent = "Gegevens opslaan"; }, 2000);
        })
        .catch(function (err) { busy(btn, false); errorBox(form, err.message); });
    });
    box.querySelector("#logout").addEventListener("click", function () {
      api("POST", { action: "logout" }).then(function () { try { sessionStorage.removeItem("wwwProfile"); } catch (e) {} state.email = p.email; showLogin(); });
    });
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-reorder]");
      if (!b) return;
      var o = orders.find(function (x) { return x.number === b.dataset.reorder; });
      var added = 0, missing = 0;
      o.lines.forEach(function (l) {
        var prod = W.byId[l.id];
        if (prod && !W.soldOut(prod) && prod.price != null) { W.Cart.add(l.id, l.qty, l.box); added++; } else missing++;
      });
      b.textContent = added ? "✓ In je winkelwagen" + (missing ? " (" + missing + " niet meer leverbaar)" : "") : "Niet meer leverbaar";
      if (added) { var open = document.querySelector(".cart-btn[data-cart-open]"); if (open) open.click(); }
    });
  }

  function load() {
    return api("GET").then(function (r) { if (r.loggedIn) showAccount(r); else showLogin(); })
      .catch(function (err) { box.innerHTML = "<div class='account-card'><p>" + esc(err.message) + "</p></div>"; });
  }
  load();
});
