/* Overzicht: omzet, open bestellingen, voorraadmeldingen. */
A.register("dashboard", {
  render: function (el) {
    return A.api("GET", "dashboard").then(function (d) {
      var e = A.esc, eu = A.euro;
      var methods = Object.keys(d.today.byMethod);
      el.innerHTML =
        "<header class='page-head'><div><h1>Overzicht</h1><p class='muted'>" + e(new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })) + "</p></div>" +
        "<a class='btn btn-primary btn-lg' href='#kassa'>Kassa openen</a></header>" +

        "<section class='kpis'>" +
          kpi("Vandaag", eu(d.today.total), d.today.count + (d.today.count === 1 ? " verkoop" : " verkopen")) +
          kpi("Winkel vandaag", eu(d.today.winkel), methods.length ? methods.map(function (m) { return e(A.PAYMENT[m] || m) + " " + eu(d.today.byMethod[m]); }).join(" · ") : "Nog geen kassaverkopen") +
          kpi("Afgelopen 7 dagen", eu(d.week.total), "") +
          kpi("Deze maand", eu(d.month.total), "Webshop " + eu(d.month.webshop) + " · Winkel " + eu(d.month.winkel)) +
        "</section>" +

        "<div class='grid-2'>" +
          "<section class='card'><header class='card-head'><h2>Te verwerken webshopbestellingen</h2><a href='#bestellingen'>Alle bestellingen →</a></header>" +
          (d.openOrders.length ? "<table class='table'><tbody>" + d.openOrders.map(function (o) {
            return "<tr class='clickable' data-order='" + e(o.number) + "'><td><strong>" + e(o.number) + "</strong><br><span class='muted small'>" + A.date(o.createdAt, true) + "</span></td>" +
              "<td>" + e(o.customer && o.customer.name) + "<br><span class='muted small'>" + e(o.deliveryLabel || "") + "</span></td>" +
              "<td>" + A.statusBadge(o.status) + "</td><td class='num'>" + eu(o.total) + "</td></tr>";
          }).join("") + "</tbody></table>" : "<p class='empty-inline'>Alles is verwerkt. 🎉</p>") +
          "</section>" +

          "<section class='card'><header class='card-head'><h2>Bijna op of uitverkocht</h2><a href='#voorraad'>Voorraad →</a></header>" +
          (d.lowStock.length ? "<table class='table'><tbody>" + d.lowStock.map(function (p) {
            return "<tr><td>" + e(A.productName(p)) + "</td><td class='num'>" + A.stockBadge(p) + "</td></tr>";
          }).join("") + "</tbody></table>" : "<p class='empty-inline'>Geen voorraadmeldingen. Producten zonder geteld aantal worden niet gecontroleerd.</p>") +
          "</section>" +
        "</div>" +

        "<section class='card'><header class='card-head'><h2>Best verkocht deze maand</h2></header>" +
        (d.topProducts.length ? "<table class='table'><thead><tr><th>Product</th><th class='num'>Aantal</th><th class='num'>Omzet</th></tr></thead><tbody>" +
          d.topProducts.map(function (t) { return "<tr><td>" + e(t.name) + "</td><td class='num'>" + t.qty + "</td><td class='num'>" + eu(t.total) + "</td></tr>"; }).join("") +
          "</tbody></table>" : "<p class='empty-inline'>Nog geen verkopen deze maand.</p>") +
        "</section>";

      el.querySelectorAll("[data-order]").forEach(function (tr) {
        tr.addEventListener("click", function () { A.showOrder(tr.dataset.order); });
      });
    });

    function kpi(label, value, sub) {
      return "<div class='kpi'><span class='kpi-label'>" + label + "</span><strong class='kpi-value'>" + value + "</strong><span class='kpi-sub'>" + sub + "</span></div>";
    }
  }
});
