/* Klantbeheer: webshopklanten worden automatisch aangemaakt, winkelklanten handmatig. */
(function () {
  var e = A.esc, eu = A.euro;
  var q = "";
  var pg = { page: 1 };

  function render(el) {
    return A.load("customers", true).then(function (customers) {
      el.innerHTML =
        "<header class='page-head'><div><h1>Klanten</h1><p class='muted'>" + customers.length + " klanten · webshopklanten worden automatisch toegevoegd</p></div>" +
        "<button class='btn btn-primary' id='c-new'>+ Nieuwe klant</button></header>" +
        "<div class='toolbar'><input type='search' id='c-q' placeholder='Zoek op naam, e-mail, telefoon of plaats' value='" + e(q) + "'></div>" +
        "<div class='card card-flush'><table class='table table-hover'><thead><tr><th>Klant</th><th>Contact</th><th>Plaats</th><th class='num'>Bestellingen</th><th class='num'>Besteed</th><th>Laatst</th></tr></thead><tbody id='c-rows'></tbody></table></div>" +
        "<div id='c-pager'></div>";

      function draw() {
        var v = q.toLowerCase();
        var list = customers.filter(function (c) {
          return !v || [c.name, c.email, c.phone, c.city, c.company].join(" ").toLowerCase().indexOf(v) >= 0;
        }).sort(function (a, b) { return ((b.stats && b.stats.last) || b.createdAt || "") < ((a.stats && a.stats.last) || a.createdAt || "") ? -1 : 1; });
        var paged = A.paginate(list, pg);
        el.querySelector("#c-pager").innerHTML = paged.html;
        el.querySelector("#c-rows").innerHTML = paged.items.map(function (c) {
          return "<tr class='clickable' data-id='" + e(c.id) + "'><td><strong>" + e(c.name || "—") + "</strong>" + (c.company ? "<br><span class='muted small'>" + e(c.company) + "</span>" : "") + "</td>" +
            "<td class='small'>" + e(c.email || "") + "<br>" + e(c.phone || "") + "</td><td>" + e(c.city || "") + "</td>" +
            "<td class='num'>" + c.stats.orders + "</td><td class='num'>" + eu(c.stats.spent) + "</td><td class='small muted'>" + A.date(c.stats.last) + "</td></tr>";
        }).join("") || "<tr><td colspan='6' class='empty-inline'>Geen klanten gevonden.</td></tr>";
      }
      draw();
      A.bindPager(el.querySelector("#c-pager"), pg, draw);
      el.querySelector("#c-q").addEventListener("input", function () { q = this.value; pg.page = 1; draw(); });
      el.querySelector("#c-new").addEventListener("click", function () { edit(null); });
      el.querySelector("#c-rows").addEventListener("click", function (ev) {
        var tr = ev.target.closest("[data-id]");
        if (tr) show(customers.find(function (c) { return c.id === tr.dataset.id; }));
      });
    });
  }

  function show(c) {
    A.load("orders", true).then(function (orders) {
      var mine = orders.filter(function (o) { return o.customerId === c.id; });
      var body = A.modal(c.name || c.email,
        "<div class='grid-2 gap-sm'><div><h3>Contact</h3><p>" + (c.company ? e(c.company) + "<br>" : "") +
          (c.email ? "<a href='mailto:" + e(c.email) + "'>" + e(c.email) + "</a><br>" : "") + (c.phone ? "<a href='tel:" + e(c.phone) + "'>" + e(c.phone) + "</a><br>" : "") +
          (c.address ? e(c.address) + "<br>" + e(c.postcode || "") + " " + e(c.city || "") : "") + "</p>" +
          (c.newsletter ? "<p><span class='tag tag-webshop'>Wil nieuwsbrief</span></p>" : "") + "</div>" +
        "<div><h3>Samenvatting</h3><p>" + c.stats.orders + " bestellingen · " + eu(c.stats.spent) + "<br><span class='muted small'>Klant sinds " + A.date(c.createdAt) + (c.source === "webshop" ? " (via webshop)" : "") + "</span></p>" +
          (c.note ? "<p class='note'>" + e(c.note) + "</p>" : "") + "</div></div>" +
        "<h3>Bestellingen (laatste 3 maanden)</h3>" +
        (mine.length ? "<table class='table table-hover'><tbody>" + mine.map(function (o) {
          return "<tr class='clickable' data-order='" + e(o.number) + "'><td>" + e(o.number) + "<br><span class='muted small'>" + A.date(o.createdAt, true) + "</span></td><td>" + A.statusBadge(o.status) + "</td><td class='num'>" + eu(o.total) + "</td></tr>";
        }).join("") + "</tbody></table>" : "<p class='empty-inline'>Geen recente bestellingen.</p>") +
        "<div class='actions'><button class='btn' id='c-edit'>Bewerken</button><button class='btn btn-primary' data-modal-close>Sluiten</button></div>", { wide: true });
      body.querySelector("#c-edit").addEventListener("click", function () { edit(c); });
      body.querySelectorAll("[data-order]").forEach(function (tr) { tr.addEventListener("click", function () { A.showOrder(tr.dataset.order); }); });
    });
  }

  function edit(c) {
    var isNew = !c;
    c = c || {};
    var f = function (label, name, attrs, cls) {
      return "<label class='field " + (cls || "") + "'>" + label + "<input name='" + name + "' value='" + e(c[name] || "") + "' " + (attrs || "") + "></label>";
    };
    var body = A.modal(isNew ? "Nieuwe klant" : "Klant bewerken",
      "<form class='form-grid'>" + f("Naam", "name", "autofocus") + f("Bedrijf", "company") +
        f("E-mail", "email", "type='email'") + f("Telefoon", "phone", "type='tel'") +
        f("Adres", "address", "", "span-2") + f("Postcode", "postcode") + f("Plaats", "city") +
        "<label class='field span-2'>Notitie<textarea name='note' rows='3' placeholder='Bijv. voorkeuren, vaste wijnen, kerstpakket'>" + e(c.note || "") + "</textarea></label>" +
        "<label class='check span-2'><input type='checkbox' name='newsletter'" + (c.newsletter ? " checked" : "") + "> Wil de nieuwsbrief ontvangen (toestemming gegeven)</label>" +
        "<div class='actions span-2'>" + (isNew ? "" : "<button type='button' class='btn btn-danger-ghost' id='c-del'>Verwijderen</button>") +
        "<span class='spacer'></span><button type='button' class='btn' data-modal-close>Annuleren</button><button class='btn btn-primary'>Opslaan</button></div></form>", { wide: true });
    var form = body.querySelector("form");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var d = A.formData(form);
      if (!isNew) d.id = c.id;
      var btn = form.querySelector(".btn-primary");
      A.busy(btn, true, "Opslaan…");
      A.api("POST", "customers", d).then(function () {
        A.toast("Klant opgeslagen"); A.invalidate("customers"); A.closeModal(); A.route();
      }).catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
    });
    var del = body.querySelector("#c-del");
    if (del) del.addEventListener("click", function () {
      A.confirm("Klant verwijderen?", "De klantgegevens worden verwijderd (bijv. op verzoek van de klant, AVG). Bestellingen blijven bewaard voor de administratie.", "Verwijderen", true).then(function (ok) {
        if (!ok) return;
        A.api("DELETE", "customers/" + encodeURIComponent(c.id)).then(function () {
          A.toast("Klant verwijderd"); A.invalidate("customers"); A.route();
        }).catch(function (err) { A.toast(err.message, "error"); });
      });
    });
  }

  A.register("klanten", { render: render });
})();
