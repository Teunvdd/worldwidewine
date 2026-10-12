/* Bestellingen: webshop én winkel, met status en details. */
(function () {
  var e = A.esc, eu = A.euro;
  var filters = { q: "", channel: "", status: "open", months: 3 };

  var NEXT = {
    nieuw: ["betaald", "klaar", "verzonden", "afgerond", "geannuleerd"],
    betaald: ["klaar", "verzonden", "afgerond", "geannuleerd"],
    klaar: ["afgerond", "verzonden", "geannuleerd"],
    verzonden: ["afgerond", "geannuleerd"],
    afgerond: ["geannuleerd"],
    geannuleerd: []
  };

  function matches(o) {
    if (filters.channel && o.channel !== filters.channel) return false;
    if (filters.status === "open" && ["nieuw", "betaald", "klaar"].indexOf(o.status) < 0) return false;
    if (filters.status && filters.status !== "open" && o.status !== filters.status) return false;
    if (filters.q) {
      var hay = [o.number, o.customer && o.customer.name, o.customer && o.customer.email, o.customer && o.customer.city]
        .concat(o.lines.map(function (l) { return l.name; })).join(" ").toLowerCase();
      if (hay.indexOf(filters.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function render(el) {
    return A.api("GET", "orders?months=" + filters.months).then(function (j) {
      var orders = j.orders;
      el.innerHTML =
        "<header class='page-head'><div><h1>Bestellingen</h1><p class='muted'>Webshop en winkel samen</p></div>" +
        "<a class='btn' href='/api/admin/export/orders?months=12' download>Exporteren (Excel)</a></header>" +
        "<div class='toolbar'>" +
          "<input type='search' id='o-q' placeholder='Zoek op nummer, klant of product' value='" + e(filters.q) + "'>" +
          select("o-channel", filters.channel, [["", "Webshop + winkel"], ["webshop", "Webshop"], ["winkel", "Winkel"]]) +
          select("o-status", filters.status, [["open", "Te verwerken"], ["", "Alle statussen"]].concat(Object.keys(A.STATUS).map(function (s) { return [s, A.STATUS[s]]; }))) +
          select("o-months", String(filters.months), [["1", "Deze maand"], ["3", "3 maanden"], ["12", "12 maanden"], ["24", "24 maanden"]]) +
        "</div>" +
        "<div class='card card-flush'><table class='table table-hover'><thead><tr><th>Bestelling</th><th>Klant</th><th>Bezorging / betaling</th><th>Status</th><th class='num'>Totaal</th></tr></thead><tbody id='o-rows'></tbody></table></div>";

      function draw() {
        var list = orders.filter(matches);
        el.querySelector("#o-rows").innerHTML = list.length ? list.map(function (o) {
          return "<tr class='clickable' data-order='" + e(o.number) + "'>" +
            "<td><strong>" + e(o.number) + "</strong><span class='tag tag-" + o.channel + "'>" + (o.channel === "winkel" ? "Winkel" : "Webshop") + "</span><br><span class='muted small'>" + A.date(o.createdAt, true) + "</span></td>" +
            "<td>" + e((o.customer && (o.customer.name || o.customer.email)) || "—") + "</td>" +
            "<td><span class='small'>" + e(o.channel === "winkel" ? "Kassa" : o.deliveryLabel) + "<br><span class='muted'>" + e(A.PAYMENT[o.paymentMethod] || o.paymentMethod) + " · " + e(o.paymentStatus) + "</span></span></td>" +
            "<td>" + A.statusBadge(o.status) + "</td><td class='num'><strong>" + eu(o.total) + "</strong></td></tr>";
        }).join("") : "<tr><td colspan='5' class='empty-inline'>Geen bestellingen gevonden.</td></tr>";
      }
      draw();

      el.querySelector("#o-q").addEventListener("input", function () { filters.q = this.value; draw(); });
      el.querySelector("#o-channel").addEventListener("change", function () { filters.channel = this.value; draw(); });
      el.querySelector("#o-status").addEventListener("change", function () { filters.status = this.value; draw(); });
      el.querySelector("#o-months").addEventListener("change", function () { filters.months = Number(this.value); A.route(); });
      el.querySelector("#o-rows").addEventListener("click", function (ev) {
        var tr = ev.target.closest("[data-order]");
        if (tr) A.showOrder(tr.dataset.order, function () { A.route(); });
      });
    });
  }

  function select(id, value, options) {
    return "<select id='" + id + "'>" + options.map(function (o) {
      return "<option value='" + e(o[0]) + "'" + (o[0] === value ? " selected" : "") + ">" + e(o[1]) + "</option>";
    }).join("") + "</select>";
  }

  A.showOrder = function (number, onChange) {
    A.api("GET", "orders/" + encodeURIComponent(number)).then(function (j) {
      var o = j.order, c = o.customer || {};
      var next = NEXT[o.status] || [];
      var body = A.modal("Bestelling " + o.number,
        "<div class='order-head'>" + A.statusBadge(o.status) + "<span class='tag tag-" + o.channel + "'>" + (o.channel === "winkel" ? "Winkel" : "Webshop") + "</span><span class='muted'>" + A.date(o.createdAt, true) + "</span></div>" +
        "<div class='grid-2 gap-sm'>" +
          "<div><h3>Klant</h3>" + (c.name || c.email ? "<p>" + e(c.name) + "<br>" + (c.email ? "<a href='mailto:" + e(c.email) + "'>" + e(c.email) + "</a><br>" : "") + (c.phone ? "<a href='tel:" + e(c.phone) + "'>" + e(c.phone) + "</a><br>" : "") +
            (c.address ? e(c.address) + "<br>" + e(c.postcode) + " " + e(c.city) : "") + "</p>" : "<p class='muted'>Geen klant gekoppeld</p>") + "</div>" +
          "<div><h3>" + (o.channel === "winkel" ? "Betaling" : "Bezorging & betaling") + "</h3><p>" + (o.deliveryLabel ? e(o.deliveryLabel) + "<br>" : "") +
            e(A.PAYMENT[o.paymentMethod] || o.paymentMethod) + " — <strong>" + e(o.paymentStatus) + "</strong>" +
            (o.pickupMoment ? "<br>Afhaalmoment: " + e(o.pickupMoment) : "") + "</p>" +
            (o.notes ? "<p class='note'>" + e(o.notes) + "</p>" : "") + "</div>" +
        "</div>" +
        "<table class='table'><thead><tr><th>Product</th><th class='num'>Aantal</th><th class='num'>Prijs</th><th class='num'>Totaal</th></tr></thead><tbody>" +
        o.lines.map(function (l) { return "<tr><td>" + e(l.name) + " <span class='muted small'>" + e(l.unit) + "</span></td><td class='num'>" + l.qty + "</td><td class='num'>" + eu(l.price) + "</td><td class='num'>" + eu(l.total) + "</td></tr>"; }).join("") +
        "</tbody><tfoot>" +
          (o.discount ? "<tr><td colspan='3'>Korting</td><td class='num'>− " + eu(o.discount) + "</td></tr>" : "") +
          (o.shipping ? "<tr><td colspan='3'>Verzending</td><td class='num'>" + eu(o.shipping) + "</td></tr>" : "") +
          "<tr class='total'><td colspan='3'>Totaal</td><td class='num'>" + eu(o.total) + "</td></tr>" +
          (o.vat || []).map(function (v) { return "<tr class='muted small'><td colspan='3'>waarvan btw " + v.rate + "%</td><td class='num'>" + eu(v.vat) + "</td></tr>"; }).join("") +
        "</tfoot></table>" +
        "<h3>Geschiedenis</h3><ul class='timeline'>" + o.history.slice().reverse().map(function (h) {
          return "<li><span class='muted small'>" + A.date(h.at, true) + "</span> " + A.statusBadge(h.status) + " " + e(h.note || "") + "</li>";
        }).join("") + "</ul>" +
        (next.length ? "<h3>Status wijzigen</h3><div class='status-actions'>" + next.map(function (s) {
          return "<button class='btn" + (s === "geannuleerd" ? " btn-danger-ghost" : " btn-primary-ghost") + "' data-status='" + s + "'>" + e(A.STATUS[s]) + "</button>";
        }).join("") + "</div><p class='muted small'>Bij annuleren gaat de voorraad automatisch terug.</p>" : "") +
        "<div class='actions'><button class='btn' id='o-print'>" + (o.channel === "winkel" ? "Bon afdrukken" : "Pakbon afdrukken") + "</button>" +
        (c.email && o.channel === "webshop" ? "<a class='btn' href='mailto:" + e(c.email) + "?subject=" + encodeURIComponent("Je bestelling " + o.number + " bij WorldWideWine.nl") + "'>Klant mailen</a>" : "") +
        "<button class='btn btn-primary' data-modal-close>Sluiten</button></div>",
        { wide: true });

      body.querySelector("#o-print").addEventListener("click", function () {
        (A.posSettings ? Promise.resolve() : A.api("GET", "pos/settings").then(function (r) { A.posSettings = r.settings; }).catch(function () {}))
          .then(function () { A.printReceipt(o); });
      });
      body.querySelectorAll("[data-status]").forEach(function (b) {
        b.addEventListener("click", function () {
          var s = b.dataset.status;
          var go = s === "geannuleerd" ? A.confirm("Bestelling annuleren?", "De producten gaan terug in de voorraad. Een eventuele online betaling moet je zelf terugboeken in Mollie.", "Annuleren", true) : Promise.resolve(true);
          go.then(function (ok) {
            if (!ok) return A.showOrder(number, onChange);
            A.busy(b, true);
            A.api("POST", "orders/" + encodeURIComponent(number) + "/status", { status: s }).then(function () {
              A.toast("Status gewijzigd naar " + A.STATUS[s]);
              A.invalidate("orders", "products");
              A.refreshBadges();
              A.closeModal();
              if (onChange) onChange();
            }).catch(function (err) { A.busy(b, false); A.toast(err.message, "error"); });
          });
        });
      });
    }).catch(function (err) { A.toast(err.message, "error"); });
  };

  A.register("bestellingen", { render: render });
})();
