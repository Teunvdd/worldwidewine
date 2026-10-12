/* Productbeheer: alles wat in de webshop en de kassa staat. */
(function () {
  var e = A.esc, eu = A.euro;
  var filters = { q: "", type: "", cat: "", show: "" };
  var cats = []; // productcategorieën (voor de kassa); null = tabel ontbreekt nog
  var COLORS = ["#ce542b", "#a9441f", "#7a1f2b", "#c0414f", "#e0a33a", "#5c6b2c", "#2f7a4a", "#2c6e8f", "#5b4a8a", "#6e625c"];

  function loadCats(force) {
    return A.load("categories", force).then(function (c) { cats = c || []; return cats; }, function () { cats = null; return null; });
  }
  function catById(id) { return (cats || []).find(function (c) { return c.id === id; }); }

  function render(el) {
    return Promise.all([A.load("products", true), loadCats(true)]).then(function (res) {
      var products = res[0];
      el.innerHTML =
        "<header class='page-head'><div><h1>Producten</h1><p class='muted'>" + products.length + " producten · wijzigingen zijn direct zichtbaar in de webshop en de kassa</p></div>" +
        "<div class='actions'><button class='btn' id='p-cats'>Categorieën</button><button class='btn btn-primary' id='p-new'>+ Nieuw product</button></div></header>" +
        (cats === null ? "<p class='notice notice-warn'>Categorieën zijn nog niet beschikbaar: voer <strong>supabase/setup.sql</strong> opnieuw uit in Supabase → SQL Editor.</p>" : "") +
        "<div class='toolbar'>" +
          "<input type='search' id='p-q' placeholder='Zoek op naam, wijnhuis, barcode…' value='" + e(filters.q) + "'>" +
          "<select id='p-type'><option value=''>Alle soorten</option>" + A.typesIn(products).map(function (t) { return "<option value='" + e(t) + "'" + (filters.type === t ? " selected" : "") + ">" + e(A.typeLabel(t)) + "</option>"; }).join("") + "</select>" +
          (cats && cats.length ? "<select id='p-cat'><option value=''>Alle categorieën</option><option value='none'" + (filters.cat === "none" ? " selected" : "") + ">Zonder categorie</option>" +
            cats.map(function (c) { return "<option value='" + c.id + "'" + (String(filters.cat) === String(c.id) ? " selected" : "") + ">" + e(c.name) + "</option>"; }).join("") + "</select>" : "") +
          "<select id='p-show'>" + [["", "Alle producten"], ["webshop", "Online te koop"], ["winkel", "Alleen in de winkel"], ["inactief", "Niet actief"], ["actie", "In de actie"]]
            .map(function (o) { return "<option value='" + o[0] + "'" + (filters.show === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
        "</div>" +
        "<div class='card card-flush'><table class='table table-hover'><thead><tr><th>Product</th><th>Soort / categorie</th><th class='num'>Prijs</th><th class='num'>Voorraad</th><th>Zichtbaar</th></tr></thead><tbody id='p-rows'></tbody></table></div>";

      function draw() {
        var q = filters.q.toLowerCase();
        var list = products.filter(function (p) {
          if (filters.type && p.type !== filters.type) return false;
          if (filters.cat === "none" && p.categoryId) return false;
          if (filters.cat && filters.cat !== "none" && String(p.categoryId) !== filters.cat) return false;
          if (filters.show === "webshop" && (p.webshop === false || p.active === false)) return false;
          if (filters.show === "winkel" && p.webshop !== false) return false;
          if (filters.show === "inactief" && p.active !== false) return false;
          if (filters.show === "actie" && !p.oldPrice) return false;
          return !q || [p.name, p.producer, p.ean, p.region, p.country, p.id].join(" ").toLowerCase().indexOf(q) >= 0;
        }).sort(function (a, b) { return (a.producer + a.name).localeCompare(b.producer + b.name, "nl"); });
        el.querySelector("#p-rows").innerHTML = list.map(function (p) {
          var vis = p.active === false ? "<span class='tag tag-off'>Niet actief</span>" : p.webshop === false ? "<span class='tag tag-winkel'>Alleen winkel</span>" : "<span class='tag tag-webshop'>Webshop + winkel</span>";
          return "<tr class='clickable' data-id='" + e(p.id) + "'><td><div class='p-cell'><span class='thumb'>" + A.productArt(p) + "</span><span><span class='muted small'>" + e(p.producer) + "</span><br><strong>" + e(p.name) + "</strong>" + (p.vintage ? " <span class='muted'>" + p.vintage + "</span>" : "") + "</span></div></td>" +
            "<td>" + e(A.typeLabel(p.type)) + "<br>" + catTag(p) + "<span class='muted small'>" + e(p.unit) + (p.caseSize ? " · ook per doos van " + p.caseSize : "") + "</span></td>" +
            "<td class='num'>" + (p.price == null ? "<span class='muted'>op aanvraag</span>" : (p.oldPrice ? "<s class='muted small'>" + eu(p.oldPrice) + "</s> " : "") + eu(p.price)) + "</td>" +
            "<td class='num'>" + A.stockBadge(p) + "</td><td>" + vis + "</td></tr>";
        }).join("") || "<tr><td colspan='5' class='empty-inline'>Geen producten gevonden.</td></tr>";
      }
      draw();

      el.querySelector("#p-q").addEventListener("input", function () { filters.q = this.value; draw(); });
      el.querySelector("#p-type").addEventListener("change", function () { filters.type = this.value; draw(); });
      el.querySelector("#p-show").addEventListener("change", function () { filters.show = this.value; draw(); });
      var pc = el.querySelector("#p-cat");
      if (pc) pc.addEventListener("change", function () { filters.cat = this.value; draw(); });
      el.querySelector("#p-cats").addEventListener("click", function () {
        if (cats === null) return A.toast("Voer eerst supabase/setup.sql opnieuw uit in Supabase.", "error");
        manageCategories();
      });
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

  // Bestaande waarden als suggesties, zodat schrijfwijzen gelijk blijven (één filter per land, regio, …).
  function datalists() {
    var list = A.cacheOf("products") || [];
    return ["country", "region", "grape", "size"].map(function (k) {
      var vals = {};
      list.forEach(function (x) { if (x[k]) String(x[k]).split(/\s*[,/&+]\s*/).forEach(function (v) { if (v) vals[v] = 1; }); });
      return "<datalist id='dl-" + k + "'>" + Object.keys(vals).sort().map(function (v) { return "<option value='" + e(v) + "'>"; }).join("") + "</datalist>";
    }).join("");
  }

  function edit(p) {
    var isNew = !p;
    p = p || { type: "rood", unit: "fles", bottles: 1, active: true, webshop: true, minStock: 6, size: "75 cl" };
    var tags = p.tags || [];
    var body = A.modal(isNew ? "Nieuw product" : A.productName(p),
      "<form id='p-form' class='form-grid'>" +
        field("Wijnhuis / merk", "producer", p.producer, "required autofocus") +
        field("Naam", "name", p.name, "required") +
        // Eigenschappen van het product. Ze staan in de webshop bij het product en worden daar
        // automatisch filters. Alles is vrij in te vullen; bestaande waarden worden voorgesteld.
        "<h3 class='span-2 form-sub'>Eigenschappen</h3>" +
        "<label class='field'>Soort<input name='type' value='" + e(A.typeLabel(p.type)) + "' list='dl-type' maxlength='40' required placeholder='bijv. Rood of Oranje wijn'>" +
          "<datalist id='dl-type'>" + Object.keys(A.TYPES).concat(A.typesIn(A.cacheOf("products")).filter(function (t) { return !A.TYPES[t]; }))
            .map(function (t) { return "<option value='" + e(A.typeLabel(t)) + "'>"; }).join("") + "</datalist></label>" +
        field("Land", "country", p.country, "list='dl-country' placeholder='bijv. Italië'") +
        field("Regio", "region", p.region, "list='dl-region' placeholder='bijv. Toscane'") +
        field("Druivensoort", "grape", p.grape, "list='dl-grape' placeholder='bijv. Sangiovese, Merlot'") +
        field("Oogstjaar", "vintage", p.vintage, "inputmode='numeric' placeholder='bijv. 2021'") +
        field("Inhoud", "size", p.size, "list='dl-size' placeholder='bijv. 75 cl'") +
        field("Alcohol volume (%)", "alcohol", p.alcohol != null ? String(p.alcohol).replace(".", ",") : "", "inputmode='decimal' placeholder='bijv. 13,5'") +
        datalists() +
        "<h3 class='span-2 form-sub'>Verkoop</h3>" +
        (cats ? "<label class='field'>Categorie (kassa)<select name='categoryId'><option value=''>— Geen categorie —</option>" +
          cats.map(function (c) { return "<option value='" + c.id + "'" + (p.categoryId === c.id ? " selected" : "") + ">" + e(c.name) + "</option>"; }).join("") +
          "</select></label>" : "") +
        "<label class='field'>Eenheid<select name='unit'>" + ["fles", "doos van 6", "stuk", "pallet"].map(function (u) { return "<option" + (p.unit === u ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></label>" +
        field("Prijs (€, incl. btw)", "price", p.price != null ? String(p.price).replace(".", ",") : "", "inputmode='decimal' placeholder='leeg = op aanvraag'") +
        field("Oude prijs bij actie (€)", "oldPrice", p.oldPrice != null ? String(p.oldPrice).replace(".", ",") : "", "inputmode='decimal'") +
        field("Inkoopprijs (€, alleen intern)", "cost", p.cost != null ? String(p.cost).replace(".", ",") : "", "inputmode='decimal'") +
        "<label class='field'>Btw<select name='vat'><option value=''>Automatisch</option><option value='21'" + (p.vat === 21 ? " selected" : "") + ">21%</option><option value='9'" + (p.vat === 9 ? " selected" : "") + ">9%</option></select></label>" +
        field("Aantal flessen (voor PostNL-limiet)", "bottles", p.bottles, "inputmode='numeric'") +
        field("Barcode (EAN)", "ean", p.ean, "inputmode='numeric' placeholder='Scan of typ de barcode'") +
        (isNew ? field("Voorraad", "stock", "", "inputmode='numeric' placeholder='leeg = niet bijhouden'") : "<div class='field'>Voorraad<span class='static'>" + A.stockBadge(p) + " <a href='#voorraad'>wijzigen bij Voorraad</a></span></div>") +
        field("Melding bij voorraad ≤", "minStock", p.minStock, "inputmode='numeric'") +
        "<div class='field span-2'>Foto<div class='img-edit'><span class='thumb' id='p-thumb'>" + A.productArt(p) + "</span>" +
          "<span class='img-edit-actions'><label class='btn btn-sm'>Foto kiezen…<input type='file' id='p-file' accept='image/jpeg,image/png,image/webp' hidden></label>" +
          "<button type='button' class='btn btn-sm btn-ghost' id='p-img-remove'" + (p.image ? "" : " hidden") + ">Foto verwijderen</button>" +
          "<span class='muted small'>Wordt gebruikt in de kassa en de webshop. Zonder foto tonen we een getekende fles.</span></span></div></div>" +
        "<label class='field span-2'>Omschrijving<textarea name='description' rows='4'>" + e(p.description) + "</textarea></label>" +
        "<label class='field span-2'>Interne notitie<textarea name='note' rows='2' placeholder='Alleen zichtbaar in de admin'>" + e(p.note) + "</textarea></label>" +
        // Per doos: zelfde product (voorraad in flessen), maar ook als doos te koop met eigen aantal en prijs.
        "<fieldset class='span-2 checks case-box' id='p-case'><legend>Per doos</legend>" +
          check("Ook per doos te koop", "caseOn", !!p.caseSize) +
          "<div class='case-fields'>" +
            field("Flessen per doos", "caseSize", p.caseSize || 6, "inputmode='numeric'") +
            field("Prijs per doos (€)", "casePrice", p.casePrice != null ? String(p.casePrice).replace(".", ",") : "", "inputmode='decimal'") +
          "</div>" +
          "<p class='muted small case-help' id='p-case-help'></p>" +
        "</fieldset>" +
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
    // Doosvelden alleen aan als "Ook per doos" aangevinkt is; de standaardprijs volgt uit de flesprijs.
    function caseUi() {
      var on = form.caseOn.checked;
      form.caseSize.disabled = form.casePrice.disabled = !on;
      body.querySelector("#p-case").classList.toggle("is-off", !on);
      var n = Math.floor(A.parseNum(form.caseSize.value)) || 0, price = A.parseNum(form.price.value);
      var auto = n >= 2 && price != null ? A.euro(Math.round(price * n * 100) / 100) : null;
      form.casePrice.placeholder = auto ? "leeg = " + auto : "leeg = flesprijs × aantal";
      body.querySelector("#p-case-help").textContent = !on ? "Vink aan als klanten dit product ook per doos kunnen kopen. De voorraad blijft in flessen."
        : "Een doos boekt " + (n >= 2 ? n : "het aantal") + " flessen af van de voorraad." + (auto ? " Zonder doosprijs kost een doos " + auto + "." : "");
    }
    ["caseOn", "caseSize", "price"].forEach(function (n) { form[n].addEventListener("input", caseUi); form[n].addEventListener("change", caseUi); });
    caseUi();
    var pendingImage; // undefined = ongewijzigd, "" = verwijderen, anders data-URL
    body.querySelector("#p-file").addEventListener("change", function () {
      var file = this.files && this.files[0];
      if (!file) return;
      resizeImage(file, 900).then(function (dataUrl) {
        pendingImage = dataUrl;
        body.querySelector("#p-thumb").innerHTML = "<img class='p-img' src='" + dataUrl + "' alt=''>";
        body.querySelector("#p-img-remove").hidden = false;
      }).catch(function () { A.toast("Deze foto kan niet worden gelezen.", "error"); });
    });
    body.querySelector("#p-img-remove").addEventListener("click", function () {
      pendingImage = "";
      body.querySelector("#p-thumb").innerHTML = A.productArt(Object.assign({}, p, { image: null }));
      this.hidden = true;
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var d = A.formData(form);
      var input = {
        originalId: isNew ? undefined : p.id,
        producer: d.producer, name: d.name, type: d.type, unit: d.unit,
        price: A.parseNum(d.price), oldPrice: A.parseNum(d.oldPrice), cost: A.parseNum(d.cost), vat: d.vat,
        country: d.country, region: d.region, grape: d.grape, vintage: d.vintage, size: d.size, bottles: d.bottles,
        ean: d.ean, minStock: d.minStock, description: d.description, note: d.note,
        active: d.active, webshop: d.webshop, pickupOnly: d.pickupOnly,
        tags: ["uitgelicht", "actie", "nieuw", "bio"].filter(function (t) { return d["tag_" + t]; })
      };
      if (isNew) input.stock = d.stock;
      if (d.alcohol || p.alcohol != null) input.alcohol = d.alcohol; // kolom bestaat pas na migratie 20261017
      // Alleen meesturen als het nodig is (de kolommen bestaan pas na migratie 20261016).
      if (d.caseOn || p.caseSize) {
        input.caseSize = d.caseOn ? d.caseSize : null;
        input.casePrice = d.caseOn ? A.parseNum(d.casePrice) : null;
      }
      if (cats) input.categoryId = d.categoryId || null;
      var btn = form.querySelector(".btn-primary");
      A.busy(btn, true, "Opslaan…");
      A.api("POST", "products", input).then(function (res) {
        if (pendingImage === undefined) return;
        A.busy(btn, true, "Foto uploaden…");
        return A.api("POST", "products/" + encodeURIComponent(res.product.id) + "/image", { image: pendingImage || null });
      }).then(function () {
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

  function catTag(p) {
    var c = p.categoryId && catById(p.categoryId);
    return c ? "<span class='cat-tag'><i style='background:" + (c.color || "#cbbcb0") + "'></i>" + e(c.name) + "</span> " : "";
  }

  // ---- Categorieën beheren (de knoppen boven de producten in de kassa) ----
  function manageCategories() {
    var body = A.modal("Categorieën",
      "<p class='muted'>Categorieën verdelen de producten in de kassa over de knoppen boven het productoverzicht. " +
        "Stel per product de categorie in bij het product zelf. De volgorde hier is de volgorde in de kassa.</p>" +
      "<div class='cat-list' id='cat-list'></div>" +
      "<form class='cat-add' id='cat-add'><input name='name' placeholder='Nieuwe categorie, bijv. Italiaanse wijn' maxlength='40' required autofocus>" +
        "<button class='btn btn-primary'>+ Toevoegen</button></form>" +
      "<div class='actions'><span class='spacer'></span><button class='btn' data-modal-close>Klaar</button></div>",
      { wide: true, onClose: function () { A.invalidate("categories"); A.route(); } });
    var list = body.querySelector("#cat-list");

    function draw() {
      list.innerHTML = cats.length ? cats.map(function (c, i) {
        return "<div class='cat-row' data-cid='" + c.id + "'>" +
          "<span class='cat-move'><button type='button' class='icon-btn' data-up='" + i + "'" + (i ? "" : " disabled") + " title='Omhoog'>▲</button>" +
          "<button type='button' class='icon-btn' data-down='" + i + "'" + (i < cats.length - 1 ? "" : " disabled") + " title='Omlaag'>▼</button></span>" +
          "<input class='cat-name' value='" + e(c.name) + "' maxlength='40' aria-label='Naam'>" +
          "<span class='cat-colors'>" + COLORS.map(function (col) {
            return "<button type='button' class='swatch" + (c.color === col ? " active" : "") + "' data-color='" + col + "' style='background:" + col + "' title='Kleur'></button>";
          }).join("") + "<button type='button' class='swatch swatch-none" + (!c.color ? " active" : "") + "' data-color='' title='Geen kleur'></button></span>" +
          "<span class='muted small cat-count'></span>" +
          "<button type='button' class='btn btn-sm btn-danger-ghost' data-del='" + c.id + "'>Verwijderen</button></div>";
      }).join("") : "<div class='empty-inline'>Nog geen categorieën." +
        "<br><button type='button' class='btn btn-sm' id='cat-types'>Maak categorieën op basis van soort (Rood, Wit, …)</button></div>";
      var counts = {};
      (A.cacheOf("products") || []).forEach(function (p) { if (p.categoryId) counts[p.categoryId] = (counts[p.categoryId] || 0) + 1; });
      list.querySelectorAll(".cat-row").forEach(function (row) {
        var n = counts[row.dataset.cid] || 0;
        row.querySelector(".cat-count").textContent = n + (n === 1 ? " product" : " producten");
      });
      var ft = list.querySelector("#cat-types");
      if (ft) ft.addEventListener("click", function () {
        A.busy(ft, true, "Bezig…");
        A.api("POST", "categories/from-types", { labels: A.TYPES }).then(function (r) {
          cats = r.categories; A.invalidate("products");
          return A.load("products", true);
        }).then(function () { draw(); A.toast("Categorieën aangemaakt en producten ingedeeld"); })
          .catch(function (err) { A.busy(ft, false); A.toast(err.message, "error"); });
      });
    }
    draw();

    function save(c, changes) {
      return A.api("POST", "categories", Object.assign({ id: c.id, name: c.name, color: c.color }, changes)).then(function (r) {
        Object.assign(c, r.category); draw();
      }).catch(function (err) { A.toast(err.message, "error"); draw(); });
    }
    function move(from, to) {
      var c = cats.splice(from, 1)[0];
      cats.splice(to, 0, c); draw();
      A.api("POST", "categories/order", { ids: cats.map(function (x) { return x.id; }) })
        .then(function (r) { cats = r.categories; draw(); })
        .catch(function (err) { A.toast(err.message, "error"); });
    }

    list.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      var row = b.closest(".cat-row");
      var c = row && cats.find(function (x) { return String(x.id) === row.dataset.cid; });
      if (b.dataset.up) return move(Number(b.dataset.up), Number(b.dataset.up) - 1);
      if (b.dataset.down) return move(Number(b.dataset.down), Number(b.dataset.down) + 1);
      if (b.dataset.color !== undefined && c) return save(c, { color: b.dataset.color || null });
      if (b.dataset.del && c) {
        if (!window.confirm("Categorie ‘" + c.name + "’ verwijderen? De producten blijven bestaan en krijgen geen categorie.")) return;
        A.api("DELETE", "categories/" + c.id).then(function () {
          cats = cats.filter(function (x) { return x !== c; });
          (A.cacheOf("products") || []).forEach(function (p) { if (p.categoryId === c.id) p.categoryId = null; });
          draw(); A.toast("Categorie verwijderd");
        }).catch(function (err) { A.toast(err.message, "error"); });
      }
    });
    list.addEventListener("change", function (ev) {
      if (!ev.target.classList.contains("cat-name")) return;
      var row = ev.target.closest(".cat-row");
      var c = cats.find(function (x) { return String(x.id) === row.dataset.cid; });
      var name = ev.target.value.trim();
      if (!name) { ev.target.value = c.name; return; }
      if (name !== c.name) save(c, { name: name });
    });
    body.querySelector("#cat-add").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var form = this, input = form.elements.namedItem("name"), name = input.value.trim();
      if (!name) return;
      A.api("POST", "categories", { name: name, color: COLORS[cats.length % COLORS.length] }).then(function (r) {
        cats.push(r.category); form.reset(); draw(); input.focus();
      }).catch(function (err) { A.toast(err.message, "error"); });
    });
  }

  // Verkleint een foto in de browser (max. 900 px, JPEG), zodat uploaden snel gaat.
  function resizeImage(file, max) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("foto")); };
      img.src = url;
    });
  }

  A.register("producten", { render: render });
})();
