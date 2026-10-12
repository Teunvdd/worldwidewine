/* Kassa-instellingen: alles wat bepaalt hoe de kassa werkt. */
(function () {
  var e = A.esc, eu = A.euro;

  function sw(name, label, help, on, extra) {
    return "<div class='set-row'><label class='switch'><input type='checkbox' name='" + name + "'" + (on ? " checked" : "") + (extra || "") + "><span class='slider' aria-hidden='true'></span>" +
      "<span class='set-text'><strong>" + label + "</strong>" + (help ? "<small>" + help + "</small>" : "") + "</span></label></div>";
  }
  function money(v) { return v == null ? "" : String(Number(v).toFixed(2)).replace(".", ","); }

  function render(el) {
    return A.api("GET", "pos/settings").then(function (res) {
      var s = res.settings;
      A.posSettings = s;
      el.innerHTML =
        "<header class='page-head'><div><h1>Kassa-instellingen</h1><p class='muted'>Wijzigingen gelden direct voor de kassa (na opnieuw openen van het kassascherm).</p></div>" +
        "<a class='btn' href='#kassa'>← Kassa</a></header>" +
        "<form id='set-form' class='settings'>" +
        "<div class='settings-main'>" +

        "<section class='card set-card'><h2>Kassadienst</h2>" +
          sw("cashControl", "Kastelling", "Bij openen het beginsaldo invullen en bij sluiten de kassalade tellen. Uit: de kassa opent direct en sluit zonder telling.", s.cashControl) +
          "<div class='set-sub'>" +
            "<div class='set-row'><span class='set-label'>Beginsaldo kassalade<small>Zonder kastelling wordt dit automatisch gebruikt.</small></span><div class='seg'>" +
              "<label><input type='radio' name='openingCashMode' value='last'" + (s.openingCashMode !== "fixed" ? " checked" : "") + "> Laatst getelde bedrag</label>" +
              "<label><input type='radio' name='openingCashMode' value='fixed'" + (s.openingCashMode === "fixed" ? " checked" : "") + "> Vast bedrag</label>" +
              "<input name='openingCashFixed' inputmode='decimal' class='in-money' value='" + money(s.openingCashFixed) + "' aria-label='Vast beginsaldo'></div></div>" +
          "</div><div class='set-sub' data-when='cashControl'>" +
            "<div class='set-row'><span class='set-label'>Waarschuwen bij kasverschil groter dan</span><span class='in-prefix'>€<input name='maxCashDifference' inputmode='decimal' class='in-money' value='" + money(s.maxCashDifference) + "'></span></div>" +
          "</div>" +
        "</section>" +

        "<section class='card set-card'><h2>Betaalwijzen</h2>" +
          sw("m_pin", "Pin", "", s.methods.pin) +
          sw("m_contant", "Contant", "", s.methods.contant) +
          sw("m_tikkie", "Tikkie / betaalverzoek", "", s.methods.tikkie) +
          sw("m_overig", "Eigen betaalwijze", "Bijvoorbeeld een cadeaubon of op rekening.", s.methods.overig) +
          "<div class='set-sub' data-when='m_overig'><div class='set-row'><span class='set-label'>Naam eigen betaalwijze</span><input name='otherLabel' maxlength='30' value='" + e(s.otherLabel) + "'></div></div>" +
          "<div class='set-sub' data-when='m_contant'>" +
            "<div class='set-row'><span class='set-label'>Snelknoppen contant (€)<small>Maximaal 4 bedragen, gescheiden door een spatie</small></span><input name='quickCash' value='" + e(s.quickCash.join(" ")) + "'></div>" +
            sw("roundCash", "Contant afronden op 5 cent", "Het contante bedrag wordt afgerond op € 0,05, zoals gebruikelijk in Nederland. Pin wordt niet afgerond.", s.roundCash) +
          "</div>" +
        "</section>" +

        "<section class='card set-card'><h2>Verkopen</h2>" +
          sw("allowPriceChange", "Prijs wijzigen in de kassa", "De knop ‘Prijs’ op het toetsenblok.", s.allowPriceChange) +
          sw("allowDiscount", "Korting geven", "Korting per regel en op de hele bon.", s.allowDiscount) +
          "<div class='set-sub' data-when='allowDiscount'><div class='set-row'><span class='set-label'>Maximale korting</span><span class='in-prefix'><input name='maxDiscount' inputmode='decimal' class='in-money' value='" + String(s.maxDiscount).replace(".", ",") + "'>%</span></div></div>" +
          sw("allowNegativeStock", "Verkopen als de voorraad op 0 staat", "Handig als de voorraad in het systeem niet helemaal klopt. Uit: de kassa weigert dan de verkoop.", s.allowNegativeStock) +
        "</section>" +

        "<section class='card set-card'><h2>Kassascherm</h2>" +
          sw("showImages", "Productfoto's tonen", "Uit: compacte knoppen met alleen tekst.", s.showImages) +
          sw("showStock", "Voorraad tonen op de productkaarten", "", s.showStock) +
          "<div class='set-row'><span class='set-label'>Grootte productkaarten</span><div class='seg'>" +
            ["klein", "normaal", "groot"].map(function (z) { return "<label><input type='radio' name='cardSize' value='" + z + "'" + (s.cardSize === z ? " checked" : "") + "> " + z.charAt(0).toUpperCase() + z.slice(1) + "</label>"; }).join("") +
          "</div></div>" +
        "</section>" +

        "<section class='card set-card'><h2>Kassabon</h2>" +
          sw("autoPrint", "Bon automatisch afdrukken", "Na elke betaling direct de bon printen. Met Chrome in kioskmodus en --kiosk-printing zonder printvenster.", s.autoPrint) +
          sw("receiptShowVat", "Btw-specificatie op de bon", "", s.receiptShowVat) +
          sw("receiptShowCustomer", "Klantnaam op de bon", "", s.receiptShowCustomer) +
          "<div class='set-row set-col'><span class='set-label'>Extra tekst bovenaan<small>Bijvoorbeeld je btw-nummer of openingstijden</small></span><textarea name='receiptHeader' rows='2' maxlength='300'>" + e(s.receiptHeader) + "</textarea></div>" +
          "<div class='set-row set-col'><span class='set-label'>Tekst onderaan</span><textarea name='receiptFooter' rows='3' maxlength='300'>" + e(s.receiptFooter) + "</textarea></div>" +
        "</section>" +

        "<section class='card set-card'><h2>Beheerderspincode</h2>" +
          "<p class='muted small'>Met een pincode bescherm je handelingen in de kassa, bijvoorbeeld als medewerkers afrekenen. De admin zelf blijft beveiligd met het admin-wachtwoord.</p>" +
          "<div class='set-row'><span class='set-label'>Pincode<small>" + (s.pinSet ? "Er is een pincode ingesteld." : "Nog geen pincode ingesteld.") + "</small></span>" +
            "<span class='pin-edit'><input name='pin' inputmode='numeric' autocomplete='new-password' type='password' maxlength='8' placeholder='" + (s.pinSet ? "Nieuwe pincode" : "4 tot 8 cijfers") + "'>" +
            (s.pinSet ? "<button type='button' class='btn btn-sm btn-ghost' id='pin-remove'>Verwijderen</button>" : "") + "</span></div>" +
          "<div class='set-sub' id='pin-actions'><p class='set-label'>Pincode vragen bij:</p>" +
            sw("p_priceChange", "Prijs wijzigen", "", s.pinFor.priceChange) +
            sw("p_discount", "Korting geven", "", s.pinFor.discount) +
            sw("p_deleteLine", "Regel van de bon verwijderen", "", s.pinFor.deleteLine) +
            sw("p_closeSession", "Kassa sluiten", "", s.pinFor.closeSession) +
            sw("p_exitPos", "Kassa verlaten (terug naar de admin)", "", s.pinFor.exitPos) +
          "</div>" +
        "</section>" +
        "</div>" +

        "<aside class='settings-side'><div class='card'><h2>Voorbeeld kassabon</h2><div class='receipt-preview' id='set-preview'></div></div></aside>" +

        "<div class='save-bar'><span class='muted small' id='set-dirty'></span><button class='btn btn-primary btn-lg' id='set-save'>Opslaan</button></div>" +
        "</form>";

      var form = el.querySelector("#set-form");
      var removePin = false;

      function collect() {
        var d = A.formData(form);
        var out = {
          cashControl: d.cashControl, openingCashMode: d.openingCashMode, openingCashFixed: A.parseNum(d.openingCashFixed) || 0,
          maxCashDifference: A.parseNum(d.maxCashDifference) || 0,
          methods: { pin: d.m_pin, contant: d.m_contant, tikkie: d.m_tikkie, overig: d.m_overig },
          otherLabel: d.otherLabel, quickCash: d.quickCash, roundCash: d.roundCash,
          allowPriceChange: d.allowPriceChange, allowDiscount: d.allowDiscount, maxDiscount: A.parseNum(d.maxDiscount) || 0,
          allowNegativeStock: d.allowNegativeStock, showImages: d.showImages, showStock: d.showStock, cardSize: d.cardSize,
          autoPrint: d.autoPrint, receiptShowVat: d.receiptShowVat, receiptShowCustomer: d.receiptShowCustomer,
          receiptHeader: d.receiptHeader, receiptFooter: d.receiptFooter,
          pinFor: { priceChange: d.p_priceChange, discount: d.p_discount, deleteLine: d.p_deleteLine, closeSession: d.p_closeSession, exitPos: d.p_exitPos }
        };
        if (d.pin) out.pin = d.pin; else if (removePin) out.pin = "";
        return out;
      }

      function refresh() {
        // Onderdelen tonen/verbergen die van een schakelaar afhangen
        form.querySelectorAll("[data-when]").forEach(function (box) {
          var on = form.querySelector("[name='" + box.dataset.when + "']").checked;
          box.classList.toggle("is-off", !on);
          box.querySelectorAll("input, textarea, select").forEach(function (i) { i.disabled = !on; });
        });
        var hasPin = (s.pinSet && !removePin) || !!form.querySelector("[name=pin]").value;
        form.querySelector("#pin-actions").classList.toggle("is-off", !hasPin);
        form.querySelectorAll("#pin-actions input").forEach(function (i) { i.disabled = !hasPin; if (!hasPin) i.checked = false; });
        // Voorbeeldbon
        var c = collect();
        var preview = Object.assign({}, s, c, { methods: c.methods });
        el.querySelector("#set-preview").innerHTML = A.receiptHtml(sampleOrder(), preview);
      }

      form.addEventListener("input", function () { el.querySelector("#set-dirty").textContent = "Niet opgeslagen wijzigingen"; refresh(); });
      form.addEventListener("change", refresh);
      var rm = el.querySelector("#pin-remove");
      if (rm) rm.addEventListener("click", function () { removePin = true; rm.textContent = "Wordt verwijderd bij opslaan"; rm.disabled = true; refresh(); });
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var btn = el.querySelector("#set-save");
        A.busy(btn, true, "Opslaan…");
        A.api("POST", "pos/settings", collect()).then(function (r) {
          A.posSettings = r.settings;
          A.toast("Kassa-instellingen opgeslagen");
          A.route();
        }).catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
      });
      refresh();
    });
  }

  function sampleOrder() {
    return {
      number: "K-000000-001", createdAt: new Date().toISOString(), total: 41.4, subtotal: 46, discount: 4.6,
      lines: [{ name: "Montemercurio — Vino Nobile “Messaggero”", qty: 2, price: 23, total: 46, vat: 21 }],
      payments: [{ method: "contant", amount: 41.4 }], cash: { received: 50, change: 8.6 },
      vat: [{ rate: 21, gross: 41.4, vat: 7.19 }], customer: { name: "Jan Jansen" }
    };
  }

  A.register("kassa-instellingen", { render: render });
})();
