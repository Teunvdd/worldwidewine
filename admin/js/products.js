/* Productbeheer: alles wat in de webshop en de kassa staat. */
(function () {
  var e = A.esc, eu = A.euro;
  var filters = { q: "", type: "", show: "" };

  function render(el) {
    return A.load("products", true).then(function (products) {
      el.innerHTML =
        "<header class='page-head'><div><h1>Producten</h1><p class='muted'>" + products.length + " producten · wijzigingen zijn direct zichtbaar in de webshop en de kassa</p></div>" +
        "<button class='btn btn-primary' id='p-new'>+ Nieuw product</button></header>" +
        "<div class='toolbar'>" +
          "<input type='search' id='p-q' placeholder='Zoek op naam, wijnhuis, barcode…' value='" + e(filters.q) + "'>" +
          "<select id='p-type'><option value=''>Alle soorten</option>" + Object.keys(A.TYPES).map(function (t) { return "<option value='" + t + "'" + (filters.type === t ? " selected" : "") + ">" + A.TYPES[t] + "</option>"; }).join("") + "</select>" +
          "<select id='p-show'>" + [["", "Alle producten"], ["webshop", "Online te koop"], ["winkel", "Alleen in de winkel"], ["inactief", "Niet actief"], ["actie", "In de actie"]]
            .map(function (o) { return "<option value='" + o[0] + "'" + (filters.show === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
        "</div>" +
        "<div class='card card-flush'><table class='table table-hover'><thead><tr><th>Product</th><th>Soort</th><th class='num'>Prijs</th><th class='num'>Voorraad</th><th>Zichtbaar</th></tr></thead><tbody id='p-rows'></tbody></table></div>";

      function draw() {
        var q = filters.q.toLowerCase();
        var list = products.filter(function (p) {
          if (filters.type && p.type !== filters.type) return false;
          if (filters.show === "webshop" && (p.webshop === false || p.active === false)) return false;
          if (filters.show === "winkel" && p.webshop !== false) return false;
          if (filters.show === "inactief" && p.active !== false) return false;
          if (filters.show === "actie" && !p.oldPrice) return false;
          return !q || [p.name, p.producer, p.ean, p.region, p.country, p.id].join(" ").toLowerCase().indexOf(q) >= 0;
        }).sort(function (a, b) { return (a.producer + a.name).localeCompare(b.producer + b.name, "nl"); });
        el.querySelector("#p-rows").innerHTML = list.map(function (p) {
          var vis = p.active === false ? "<span class='tag tag-off'>Niet actief</span>" : p.webshop === false ? "<span class='tag tag-winkel'>Alleen winkel</span>" : "<span class='tag tag-webshop'>Webshop + winkel</span>";
          return "<tr class='clickable' data-id='" + e(p.id) + "'><td><span class='muted small'>" + e(p.producer) + "</span><br><strong>" + e(p.name) + "</strong>" + (p.vintage ? " <span class='muted'>" + p.vintage + "</span>" : "") + "</td>" +
            "<td>" + e(A.TYPES[p.type] || p.type) + "<br><span class='muted small'>" + e(p.unit) + "</span></td>" +
            "<td class='num'>" + (p.price == null ? "<span class='muted'>op aanvraag</span>" : (p.oldPrice ? "<s class='muted small'>" + eu(p.oldPrice) + "</s> " : "") + eu(p.price)) + "</td>" +
            "<td class='num'>" + A.stockBadge(p) + "</td><td>" + vis + "</td></tr>";
        }).join("") || "<tr><td colspan='5' class='empty-inline'>Geen producten gevonden.</td></tr>";
      }
      draw();

      el.querySelector("#p-q").addEventListener("input", function () { filters.q = this.value; draw(); });
      el.querySelector("#p-type").addEventListener("change", function () { filters.type = this.value; draw(); });
      el.querySelector("#p-show").addEventListener("change", function () { filters.show = this.value; draw(); });
      el.querySelector("#p-new").addEventListener("click", function () { edit(null); });
      el.querySelector("#p-rows").addEventListener("click", function (ev) {
        var tr = ev.target.closest("[data-id]");
        if (tr) edit(products.find(function (p) { return p.id === tr.dataset.id; }));
      });
    });
  }

  function field(label, name, value, attrs, cls) {
    return "<label class='field " + (cls || "") + "'>" + label + "<input name='" + name + "' value='" + e(value == null ? "" : value) + "' " + (attrs || "") + "></label>";
  }
  function check(label, name, on) {
    return "<label class='check'><input type='checkbox' name='" + name + "'" + (on ? " checked" : "") + "> " + label + "</label>";
  }

  function edit(p) {
    var isNew = !p;
    p = p || { type: "rood", unit: "fles", bottles: 1, active: true, webshop: true, minStock: 6, size: "75 cl" };
    var tags = p.tags || [];
    var body = A.modal(isNew ? "Nieuw product" : A.productName(p),
      "<form id='p-form' class='form-grid'>" +
        field("Wijnhuis / merk", "producer", p.producer, "required autofocus") +
        field("Naam", "name", p.name, "required") +
        "<label class='field'>Soort<select name='type'>" + Object.keys(A.TYPES).map(function (t) { return "<option value='" + t + "'" + (p.type === t ? " selected" : "") + ">" + A.TYPES[t] + "</option>"; }).join("") + "</select></label>" +
        "<label class='field'>Eenheid<select name='unit'>" + ["fles", "doos van 6", "stuk", "pallet"].map(function (u) { return "<option" + (p.unit === u ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></label>" +
        field("Prijs (€, incl. btw)", "price", p.price != null ? String(p.price).replace(".", ",") : "", "inputmode='decimal' placeholder='leeg = op aanvraag'") +
        field("Oude prijs bij actie (€)", "oldPrice", p.oldPrice != null ? String(p.oldPrice).replace(".", ",") : "", "inputmode='decimal'") +
        field("Inkoopprijs (€, alleen intern)", "cost", p.cost != null ? String(p.cost).replace(".", ",") : "", "inputmode='decimal'") +
        "<label class='field'>Btw<select name='vat'><option value=''>Automatisch</option><option value='21'" + (p.vat === 21 ? " selected" : "") + ">21%</option><option value='9'" + (p.vat === 9 ? " selected" : "") + ">9%</option></select></label>" +
        field("Land", "country", p.country) + field("Streek", "region", p.region) +
        field("Druif", "grape", p.grape) + field("Jaargang", "vintage", p.vintage, "inputmode='numeric'") +
        field("Inhoud", "size", p.size) + field("Aantal flessen (voor PostNL-limiet)", "bottles", p.bottles, "inputmode='numeric'") +
        field("Barcode (EAN)", "ean", p.ean, "inputmode='numeric' placeholder='Scan of typ de barcode'") +
        (isNew ? field("Voorraad", "stock", "", "inputmode='numeric' placeholder='leeg = niet bijhouden'") : "<div class='field'>Voorraad<span class='static'>" + A.stockBadge(p) + " <a href='#voorraad'>wijzigen bij Voorraad</a></span></div>") +
        field("Melding bij voorraad ≤", "minStock", p.minStock, "inputmode='numeric'") +
        field("Foto (pad of URL)", "image", p.image, "placeholder='assets/producten/naam.jpg'", "span-2") +
        "<label class='field span-2'>Omschrijving<textarea name='description' rows='4'>" + e(p.description) + "</textarea></label>" +
        "<label class='field span-2'>Interne notitie<textarea name='note' rows='2' placeholder='Alleen zichtbaar in de admin'>" + e(p.note) + "</textarea></label>" +
        "<fieldset class='span-2 checks'><legend>Instellingen</legend>" +
          check("Actief (te koop)", "active", p.active !== false) +
          check("Tonen in de webshop", "webshop", p.webshop !== false) +
          check("Alleen afhalen", "pickupOnly", p.pickupOnly) +
          check("Uitgelicht op homepage", "tag_uitgelicht", tags.indexOf("uitgelicht") >= 0) +
          check("Actie", "tag_actie", tags.indexOf("actie") >= 0) +
          check("Nieuw", "tag_nieuw", tags.indexOf("nieuw") >= 0) +
          check("Biologisch", "tag_bio", tags.indexOf("bio") >= 0) +
        "</fieldset>" +
        "<div class='actions span-2'>" + (isNew ? "" : "<button type='button' class='btn btn-danger-ghost' id='p-delete'>Verwijderen</button>") +
        "<span class='spacer'></span><button type='button' class='btn' data-modal-close>Annuleren</button><button class='btn btn-primary'>Opslaan</button></div>" +
      "</form>", { wide: true });

    var form = body.querySelector("form");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var d = A.formData(form);
      var input = {
        originalId: isNew ? undefined : p.id,
        producer: d.producer, name: d.name, type: d.type, unit: d.unit,
        price: A.parseNum(d.price), oldPrice: A.parseNum(d.oldPrice), cost: A.parseNum(d.cost), vat: d.vat,
        country: d.country, region: d.region, grape: d.grape, vintage: d.vintage, size: d.size, bottles: d.bottles,
        ean: d.ean, minStock: d.minStock, image: d.image, description: d.description, note: d.note,
        active: d.active, webshop: d.webshop, pickupOnly: d.pickupOnly,
        tags: ["uitgelicht", "actie", "nieuw", "bio"].filter(function (t) { return d["tag_" + t]; })
      };
      if (isNew) input.stock = d.stock;
      var btn = form.querySelector(".btn-primary");
      A.busy(btn, true, "Opslaan…");
      A.api("POST", "products", input).then(function () {
        A.toast("Product opgeslagen");
        A.invalidate("products");
        A.closeModal();
        A.route();
      }).catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
    });
    var del = body.querySelector("#p-delete");
    if (del) del.addEventListener("click", function () {
      A.confirm("Product verwijderen?", "Tip: zet een product liever op ‘niet actief’, dan blijft het in de geschiedenis bewaard.", "Verwijderen", true).then(function (ok) {
        if (!ok) return edit(p);
        A.api("DELETE", "products/" + encodeURIComponent(p.id)).then(function () {
          A.toast("Product verwijderd"); A.invalidate("products"); A.route();
        }).catch(function (err) { A.toast(err.message, "error"); });
      });
    });
  }

  A.register("producten", { render: render });
})();
