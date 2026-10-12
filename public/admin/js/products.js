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
        "<div class='actions'><button class='btn' id='p-import'>" + ICON_UP + "Importeren</button><button class='btn' id='p-export'>" + ICON_DOWN + "Exporteren</button>" +
          "<button class='btn btn-primary' id='p-new'>+ Nieuw product</button><input type='file' id='p-import-file' accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' hidden></div></header>" +
        (cats === null ? "<p class='notice notice-warn'>Categorieën zijn nog niet beschikbaar: voer <strong>supabase/setup.sql</strong> opnieuw uit in Supabase → SQL Editor.</p>" : "") +
        "<div class='toolbar'>" +
          "<input type='search' id='p-q' placeholder='Zoek op naam, wijnhuis, barcode…' value='" + e(filters.q) + "'>" +
          "<select id='p-type'><option value=''>Alle soorten</option>" + A.typesIn(products).map(function (t) { return "<option value='" + e(t) + "'" + (filters.type === t ? " selected" : "") + ">" + e(A.typeLabel(t)) + "</option>"; }).join("") + "</select>" +
          (cats && cats.length ? "<select id='p-cat'><option value=''>Alle categorieën</option><option value='none'" + (filters.cat === "none" ? " selected" : "") + ">Zonder categorie</option>" +
            cats.map(function (c) { return "<option value='" + c.id + "'" + (String(filters.cat) === String(c.id) ? " selected" : "") + ">" + e(c.name) + "</option>"; }).join("") + "</select>" : "") +
          "<select id='p-show'>" + [["", "Alle producten"], ["webshop", "Online te koop"], ["winkel", "Alleen in de winkel"], ["inactief", "Niet actief"], ["actie", "In de actie"]]
            .map(function (o) { return "<option value='" + o[0] + "'" + (filters.show === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
        "</div>" +
        "<div class='bulk-bar' id='p-bulk' hidden><strong id='p-bulk-n'></strong>" +
          "<button class='btn btn-sm' data-bulk='active'>Actief maken</button><button class='btn btn-sm' data-bulk='inactive'>Niet actief</button>" +
          "<button class='btn btn-sm btn-danger-ghost' data-bulk='delete'>Verwijderen</button><button class='link' data-bulk='none'>Selectie wissen</button></div>" +
        "<div class='card card-flush'><table class='table table-hover'><thead><tr><th class='sel-col'><input type='checkbox' id='p-all' aria-label='Alles selecteren'></th><th>Product</th><th>Soort / categorie</th><th class='num'>Prijs</th><th class='num'>Voorraad</th><th>Zichtbaar</th></tr></thead><tbody id='p-rows'></tbody></table></div>";

      var selected = {}, shown = [];
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
        shown = list;
        el.querySelector("#p-rows").innerHTML = list.map(function (p) {
          var vis = p.active === false ? "<span class='tag tag-off'>Niet actief</span>" : p.webshop === false ? "<span class='tag tag-winkel'>Alleen winkel</span>" : "<span class='tag tag-webshop'>Webshop + winkel</span>";
          return "<tr class='clickable" + (selected[p.id] ? " is-selected" : "") + "' data-id='" + e(p.id) + "'><td class='sel-col'><input type='checkbox' data-sel aria-label='Selecteren'" + (selected[p.id] ? " checked" : "") + "></td><td><div class='p-cell'><span class='thumb'>" + A.productArt(p) + "</span><span><span class='muted small'>" + e(p.producer) + "</span><br><strong>" + e(p.name) + "</strong>" + (p.vintage ? " <span class='muted'>" + p.vintage + "</span>" : "") + "</span></div></td>" +
            "<td>" + e(A.typeLabel(p.type)) + "<br>" + catTag(p) + "<span class='muted small'>" + e(p.unit) + (p.caseSize ? " · ook per doos van " + p.caseSize : "") + "</span></td>" +
            "<td class='num'>" + (p.price == null ? "<span class='muted'>op aanvraag</span>" : (p.oldPrice ? "<s class='muted small'>" + eu(p.oldPrice) + "</s> " : "") + eu(p.price)) + "</td>" +
            "<td class='num'>" + A.stockBadge(p) + "</td><td>" + vis + "</td></tr>";
        }).join("") || "<tr><td colspan='6' class='empty-inline'>Geen producten gevonden.</td></tr>";
        drawBulk();
      }
      // Selectie: balk met acties zodra er iets aangevinkt is.
      function drawBulk() {
        var ids = Object.keys(selected);
        el.querySelector("#p-bulk").hidden = !ids.length;
        el.querySelector("#p-bulk-n").textContent = ids.length + (ids.length === 1 ? " product geselecteerd" : " producten geselecteerd");
        var all = el.querySelector("#p-all"), n = shown.filter(function (p) { return selected[p.id]; }).length;
        all.checked = shown.length > 0 && n === shown.length;
        all.indeterminate = n > 0 && n < shown.length;
      }
      draw();
      el.querySelector("#p-all").addEventListener("change", function () {
        var on = this.checked;
        shown.forEach(function (p) { if (on) selected[p.id] = true; else delete selected[p.id]; });
        draw();
      });
      el.querySelector("#p-bulk").addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-bulk]");
        if (!b) return;
        var ids = Object.keys(selected), act = b.dataset.bulk;
        if (act === "none") { selected = {}; return draw(); }
        var go = function () {
          A.busy(b, true, "Bezig…");
          var calls = ids.map(function (id) {
            return act === "delete" ? A.api("DELETE", "products/" + encodeURIComponent(id))
              : A.api("POST", "products", { originalId: id, active: act === "active" });
          });
          Promise.allSettled(calls).then(function (res) {
            var failed = res.filter(function (r) { return r.status === "rejected"; });
            A.toast(failed.length ? failed.length + " van de " + ids.length + " lukte niet: " + failed[0].reason.message
              : act === "delete" ? ids.length + " verwijderd" : ids.length + " bijgewerkt", failed.length ? "error" : undefined);
            A.invalidate("products"); A.route();
          });
        };
        if (act !== "delete") return go();
        A.confirm(ids.length === 1 ? "Product verwijderen?" : ids.length + " producten verwijderen?",
          "Dit kan niet ongedaan worden gemaakt. Tip: zet producten liever op ‘niet actief’, dan blijven ze in de geschiedenis bewaard.", "Verwijderen", true)
          .then(function (ok) { if (ok) go(); });
      });

      el.querySelector("#p-q").addEventListener("input", function () { filters.q = this.value; draw(); });
      el.querySelector("#p-type").addEventListener("change", function () { filters.type = this.value; draw(); });
      el.querySelector("#p-show").addEventListener("change", function () { filters.show = this.value; draw(); });
      var pc = el.querySelector("#p-cat");
      if (pc) pc.addEventListener("change", function () { filters.cat = this.value; draw(); });
      el.querySelector("#p-new").addEventListener("click", function () { edit(null); });
      el.querySelector("#p-export").addEventListener("click", function () { exportExcel(products); });
      var importFile = el.querySelector("#p-import-file");
      el.querySelector("#p-import").addEventListener("click", function () { importFile.value = ""; importFile.click(); });
      importFile.addEventListener("change", function () { if (this.files[0]) importExcel(this.files[0], products); });
      el.querySelector("#p-rows").addEventListener("click", function (ev) {
        var tr = ev.target.closest("[data-id]");
        if (ev.target.closest(".sel-col")) {
          if (!tr) return;
          var box = tr.querySelector("[data-sel]");
          if (ev.target !== box) box.checked = !box.checked;
          if (box.checked) selected[tr.dataset.id] = true; else delete selected[tr.dataset.id];
          tr.classList.toggle("is-selected", box.checked);
          return drawBulk();
        }
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
        "<div class='field span-2'>Foto<div class='img-edit' id='p-drop'><span class='thumb' id='p-thumb'>" + A.productArt(p) + "</span>" +
          "<span class='img-edit-actions'><label class='btn btn-sm'>Foto kiezen…<input type='file' id='p-file' accept='image/jpeg,image/png,image/webp' hidden></label>" +
          "<button type='button' class='btn btn-sm btn-ghost' id='p-img-remove'" + (p.image ? "" : " hidden") + ">Foto verwijderen</button>" +
          "<span class='muted small'>Sleep een foto hierheen of kies er een. Wordt gebruikt in de kassa en de webshop. Zonder foto tonen we een getekende fles.</span></span>" +
          "<span class='drop-hint'>Laat los om de foto te gebruiken</span></div></div>" +
        "<label class='field span-2'>Omschrijving<textarea name='description' rows='4'>" + e(p.description) + "</textarea></label>" +
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
    function useFile(file) {
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return A.toast("Kies een JPG-, PNG- of WebP-foto.", "error");
      resizeImage(file, 900).then(function (dataUrl) {
        pendingImage = dataUrl;
        body.querySelector("#p-thumb").innerHTML = "<img class='p-img' src='" + dataUrl + "' alt=''>";
        body.querySelector("#p-img-remove").hidden = false;
      }).catch(function () { A.toast("Deze foto kan niet worden gelezen.", "error"); });
    }
    body.querySelector("#p-file").addEventListener("change", function () { useFile(this.files && this.files[0]); });
    // Foto slepen en neerzetten op het fotovak.
    var drop = body.querySelector("#p-drop"), depth = 0;
    drop.addEventListener("dragenter", function (ev) { ev.preventDefault(); depth++; drop.classList.add("dragging"); });
    drop.addEventListener("dragover", function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; });
    drop.addEventListener("dragleave", function () { if (--depth <= 0) { depth = 0; drop.classList.remove("dragging"); } });
    drop.addEventListener("drop", function (ev) {
      ev.preventDefault(); depth = 0; drop.classList.remove("dragging");
      useFile(ev.dataTransfer.files && ev.dataTransfer.files[0]);
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

  // ---- Import en export via Excel ----
  var ICON_UP = "<svg viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'/></svg>";
  var ICON_DOWN = "<svg viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'/></svg>";
  var yesNo = function (v) { return v === false ? "nee" : "ja"; };
  // Kolommen in het Excel-bestand: kop, veld, soort (tekst, getal, ja/nee), breedte.
  var COLS = [
    ["Code", "id", "text", 26], ["Wijnhuis", "producer", "text", 24], ["Naam", "name", "text", 30], ["Soort", "type", "text", 14],
    ["Land", "country", "text", 14], ["Regio", "region", "text", 16], ["Druivensoort", "grape", "text", 22], ["Oogstjaar", "vintage", "num", 10],
    ["Inhoud", "size", "text", 10], ["Alcohol (%)", "alcohol", "num", 11], ["Eenheid", "unit", "text", 12],
    ["Prijs", "price", "num", 10], ["Oude prijs", "oldPrice", "num", 11], ["Inkoopprijs", "cost", "num", 11], ["Btw (%)", "vat", "num", 9],
    ["Flessen per doos", "caseSize", "num", 15], ["Doosprijs", "casePrice", "num", 11],
    ["Voorraad", "stock", "num", 10], ["Melding bij voorraad", "minStock", "num", 18], ["Barcode", "ean", "text", 16],
    ["Aantal flessen (PostNL)", "bottles", "num", 20], ["Categorie (kassa)", "category", "text", 18],
    ["Webshop", "webshop", "bool", 10], ["Actief", "active", "bool", 9], ["Alleen afhalen", "pickupOnly", "bool", 14],
    ["Kenmerken", "tags", "text", 22], ["Omschrijving", "description", "text", 50], ["Interne notitie", "note", "text", 30]
  ];

  function exportExcel(products) {
    var catName = {};
    (cats || []).forEach(function (c) { catName[c.id] = c.name; });
    var rows = [COLS.map(function (c) { return c[0]; })].concat(products.slice()
      .sort(function (a, b) { return (a.producer + a.name).localeCompare(b.producer + b.name, "nl"); })
      .map(function (p) {
        return COLS.map(function (c) {
          var k = c[1], v = p[k];
          if (k === "type") return A.typeLabel(v);
          if (k === "category") return catName[p.categoryId] || "";
          if (k === "tags") return (p.tags || []).join(", ");
          if (c[2] === "bool") return k === "pickupOnly" ? (p.pickupOnly ? "ja" : "nee") : yesNo(v);
          if (k === "ean") return v ? String(v) : "";
          return v == null ? "" : v;
        });
      }));
    var blob = A.xlsx.write(rows, { sheet: "Producten", widths: COLS.map(function (c) { return c[3]; }) });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "producten-" + new Date().toISOString().slice(0, 10) + ".xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    A.toast(products.length + " producten geëxporteerd");
  }

  // Kopnaam → kolom (hoofdletters, spaties en tekens maken niet uit; de veldnaam mag ook).
  function headerKey(h) {
    var n = String(h == null ? "" : h).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    var alias = { streek: "region", druif: "grape", jaargang: "vintage", maat: "size", alcohol: "alcohol", alcoholvolume: "alcohol", btw: "vat", categorie: "category", omschrijving: "description", notitie: "note" };
    var hit = COLS.find(function (c) { return c[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") === n || c[1].toLowerCase() === n; });
    return hit ? hit[1] : alias[n] || null;
  }
  function cellValue(kind, v) {
    if (v == null || (typeof v === "string" && !v.trim())) return kind === "bool" ? undefined : "";
    if (kind === "num") {
      if (typeof v === "number") return v;
      var n = Number(String(v).replace(/[€%\s]/g, "").replace(",", "."));
      return isNaN(n) ? String(v) : n;
    }
    if (kind === "bool") {
      if (typeof v === "boolean") return v;
      var t = String(v).trim().toLowerCase();
      return ["ja", "j", "yes", "y", "1", "x", "waar", "true"].indexOf(t) >= 0 ? true : ["nee", "n", "no", "0", "onwaar", "false"].indexOf(t) >= 0 ? false : undefined;
    }
    return typeof v === "number" ? String(v) : String(v).trim();
  }

  function importExcel(file, products) {
    var body = A.modal("Producten importeren", "<div class='loading'><span class='spinner'></span>Bestand lezen…</div>", { wide: true });
    A.xlsx.read(file).then(function (sheet) {
      var head = (sheet[0] || []).map(headerKey);
      var kinds = {};
      COLS.forEach(function (c) { kinds[c[1]] = c[2]; });
      if (!head.some(Boolean)) throw new Error("De eerste rij moet de kolomnamen bevatten (bijv. Code, Wijnhuis, Naam, Prijs). Exporteer eerst om een voorbeeld te krijgen.");
      var known = {};
      products.forEach(function (p) { known[p.id] = true; });
      var rows = [], problems = [];
      sheet.slice(1).forEach(function (r, i) {
        if (!r || !r.some(function (v) { return v != null && String(v).trim() !== ""; })) return;
        var row = { _row: i + 2 };
        head.forEach(function (k, c) {
          if (!k) return;
          var v = cellValue(kinds[k], r[c]);
          if (v === undefined) return;
          // Verplichte velden en de code: een lege cel betekent "niet wijzigen".
          if (v === "" && ["id", "producer", "name", "type"].indexOf(k) >= 0) return;
          if (k === "tags") v = String(v).split(/\s*[,;]\s*/).map(function (t) { return t.toLowerCase(); }).filter(Boolean);
          row[k] = v;
        });
        var code = row.id ? String(row.id).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";
        row._update = !!(code && known[code]);
        if (!row._update && (!row.name || !row.producer)) problems.push("Rij " + row._row + ": voor een nieuw product zijn Wijnhuis en Naam nodig.");
        else rows.push(row);
      });
      var upd = rows.filter(function (r) { return r._update; }).length;
      var cols = head.filter(Boolean).map(function (k) { return COLS.find(function (c) { return c[1] === k; })[0]; });
      body.innerHTML =
        "<p><strong>" + rows.length + "</strong> " + (rows.length === 1 ? "rij" : "rijen") + " gevonden: <strong>" + (rows.length - upd) + "</strong> nieuw, <strong>" + upd + "</strong> bijwerken (op Code).</p>" +
        "<p class='muted small'>Kolommen die worden overgenomen: " + e(cols.join(", ")) + ". Andere velden blijven zoals ze zijn. Een lege cel maakt het veld leeg (behalve bij Code, Wijnhuis, Naam en Soort). " +
          "Een andere voorraad wordt als voorraadmutatie (‘Import uit Excel’) opgeslagen.</p>" +
        (problems.length ? "<div class='notice notice-warn'>" + problems.slice(0, 8).map(e).join("<br>") + (problems.length > 8 ? "<br>… en nog " + (problems.length - 8) : "") + "<br>Deze rijen worden overgeslagen.</div>" : "") +
        "<div class='actions'><button class='btn' data-modal-close>Annuleren</button><span class='spacer'></span><button class='btn btn-primary' id='imp-go'" + (rows.length ? "" : " disabled") + ">" + rows.length + " producten importeren</button></div>";
      body.querySelector("#imp-go").addEventListener("click", function () {
        var btn = this, total = { created: 0, updated: 0, stock: 0, errors: [] };
        A.busy(btn, true, "Importeren…");
        // In porties van 50, zodat een groot bestand niet in één keer naar de server gaat.
        var chunks = [];
        for (var i = 0; i < rows.length; i += 50) chunks.push(rows.slice(i, i + 50));
        chunks.reduce(function (prev, chunk, n) {
          return prev.then(function () {
            btn.lastChild.textContent = "Importeren… " + Math.min(rows.length, (n + 1) * 50) + " / " + rows.length;
            return A.api("POST", "products/import", { rows: chunk.map(function (r) { var o = Object.assign({}, r); delete o._update; return o; }) })
              .then(function (res) { ["created", "updated", "stock"].forEach(function (k) { total[k] += res[k]; }); total.errors = total.errors.concat(res.errors); });
          });
        }, Promise.resolve()).then(function () {
          body.innerHTML = "<p><strong>Klaar.</strong> " + total.created + " nieuw, " + total.updated + " bijgewerkt" + (total.stock ? ", voorraad van " + total.stock + " aangepast" : "") + ".</p>" +
            (total.errors.length ? "<div class='notice notice-warn'><strong>" + total.errors.length + " rij(en) niet geïmporteerd:</strong><br>" +
              total.errors.slice(0, 20).map(function (x) { return "Rij " + x.row + ": " + e(x.message); }).join("<br>") + "</div>" : "") +
            "<div class='actions'><span class='spacer'></span><button class='btn btn-primary' data-modal-close>Sluiten</button></div>";
          A.invalidate("products", "categories"); A.route();
        }).catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
      });
    }).catch(function (err) {
      body.innerHTML = "<p class='notice notice-warn'>" + e(err.message) + "</p><div class='actions'><span class='spacer'></span><button class='btn' data-modal-close>Sluiten</button></div>";
    });
  }

  // ---- Kassacategorieën (de knoppen boven de producten in de kassa): eigen pagina ----
  function renderCategories(el) {
    return Promise.all([A.load("products", true), loadCats(true)]).then(function () {
      if (cats === null) {
        el.innerHTML = "<header class='page-head'><div><h1>Kassacategorieën</h1></div></header>" +
          "<p class='notice notice-warn'>Categorieën zijn nog niet beschikbaar: voer <strong>supabase/setup.sql</strong> opnieuw uit in Supabase → SQL Editor.</p>";
        return;
      }
      el.innerHTML =
        "<header class='page-head'><div><h1>Kassacategorieën</h1><p class='muted'>De knoppen boven de producten in de kassa, in deze volgorde. " +
          "De categorie van een product stel je in bij het product zelf.</p></div></header>" +
        "<form class='card cat-add' id='cat-add'><input name='name' placeholder='Nieuwe categorie, bijv. Italiaanse wijn' maxlength='40' required>" +
          "<button class='btn btn-primary'>+ Toevoegen</button></form>" +
        "<div class='card card-flush'><table class='table cat-table'><thead><tr><th class='cat-move-col'>Volgorde</th><th>Naam</th><th>Kleur</th><th class='num'>Producten</th><th></th></tr></thead>" +
          "<tbody id='cat-list'></tbody></table></div>";
      var list = el.querySelector("#cat-list");

      function draw() {
        var counts = {};
        (A.cacheOf("products") || []).forEach(function (p) { if (p.categoryId) counts[p.categoryId] = (counts[p.categoryId] || 0) + 1; });
        list.innerHTML = cats.length ? cats.map(function (c, i) {
          return "<tr class='cat-row' data-cid='" + c.id + "'>" +
            "<td><span class='cat-move'><button type='button' class='icon-btn' data-up='" + i + "'" + (i ? "" : " disabled") + " title='Omhoog' aria-label='Omhoog'>▲</button>" +
              "<button type='button' class='icon-btn' data-down='" + i + "'" + (i < cats.length - 1 ? "" : " disabled") + " title='Omlaag' aria-label='Omlaag'>▼</button></span></td>" +
            "<td><input class='cat-name' value='" + e(c.name) + "' maxlength='40' aria-label='Naam'></td>" +
            "<td><span class='cat-colors'>" + COLORS.map(function (col) {
              return "<button type='button' class='swatch" + (c.color === col ? " active" : "") + "' data-color='" + col + "' style='background:" + col + "' title='Kleur'></button>";
            }).join("") + "<button type='button' class='swatch swatch-none" + (!c.color ? " active" : "") + "' data-color='' title='Geen kleur'></button></span></td>" +
            "<td class='num'>" + (counts[c.id] || 0) + "</td>" +
            "<td class='num'><button type='button' class='btn btn-sm btn-danger-ghost' data-del='" + c.id + "'>Verwijderen</button></td></tr>";
        }).join("") : "<tr><td colspan='5' class='empty-inline'>Nog geen categorieën." +
          "<br><button type='button' class='btn btn-sm' id='cat-types'>Maak categorieën op basis van soort (Rood, Wit, …)</button></td></tr>";
        var ft = list.querySelector("#cat-types");
        if (ft) ft.addEventListener("click", function () {
          A.busy(ft, true, "Bezig…");
          A.api("POST", "categories/from-types", { labels: A.TYPES }).then(function (r) {
            cats = r.categories; A.invalidate("products", "categories");
            return A.load("products", true);
          }).then(function () { draw(); A.toast("Categorieën aangemaakt en producten ingedeeld"); })
            .catch(function (err) { A.busy(ft, false); A.toast(err.message, "error"); });
        });
      }
      draw();

      function save(c, changes) {
        return A.api("POST", "categories", Object.assign({ id: c.id, name: c.name, color: c.color }, changes)).then(function (r) {
          Object.assign(c, r.category); A.invalidate("categories"); draw();
        }).catch(function (err) { A.toast(err.message, "error"); draw(); });
      }
      function move(from, to) {
        var c = cats.splice(from, 1)[0];
        cats.splice(to, 0, c); draw();
        A.api("POST", "categories/order", { ids: cats.map(function (x) { return x.id; }) })
          .then(function (r) { cats = r.categories; A.invalidate("categories"); draw(); })
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
          A.confirm("Categorie verwijderen?", "‘" + c.name + "’ wordt verwijderd. De producten blijven bestaan en krijgen geen categorie.", "Verwijderen", true).then(function (ok) {
            if (!ok) return;
            A.api("DELETE", "categories/" + c.id).then(function () {
              cats = cats.filter(function (x) { return x !== c; });
              (A.cacheOf("products") || []).forEach(function (p) { if (p.categoryId === c.id) p.categoryId = null; });
              A.invalidate("categories"); draw(); A.toast("Categorie verwijderd");
            }).catch(function (err) { A.toast(err.message, "error"); });
          });
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
      el.querySelector("#cat-add").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var form = this, input = form.elements.namedItem("name"), name = input.value.trim();
        if (!name) return;
        A.api("POST", "categories", { name: name, color: COLORS[cats.length % COLORS.length] }).then(function (r) {
          cats.push(r.category); A.invalidate("categories"); form.reset(); draw(); input.focus();
        }).catch(function (err) { A.toast(err.message, "error"); });
      });
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

  A.resizeImage = resizeImage; // ook gebruikt voor nieuwsfoto's
  A.register("producten", { render: render });
  A.register("kassa-categorieen", { render: renderCategories });
})();
