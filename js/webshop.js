/* Catalogus: filteren, zoeken, sorteren en productdetail. */
(function () {
  var W = window.WWW;
  var P = W.PRODUCTS;
  var $ = function (id) { return document.getElementById(id); };

  var PRICES = [
    { key: "tot15", label: "Tot € 15", test: function (p) { return p < 15; } },
    { key: "15-25", label: "€ 15 – € 25", test: function (p) { return p >= 15 && p <= 25; } },
    { key: "25-50", label: "€ 25 – € 50", test: function (p) { return p > 25 && p <= 50; } },
    { key: "50plus", label: "Meer dan € 50", test: function (p) { return p > 50; } }
  ];

  function countBy(fn) {
    var c = {};
    P.forEach(function (p) { var k = fn(p); if (k) c[k] = (c[k] || 0) + 1; });
    return c;
  }

  function checkboxes(container, name, entries) {
    container.innerHTML = entries.map(function (e) {
      return '<label class="check"><input type="checkbox" name="' + name + '" value="' + W.esc(e.value) + '"> ' +
        W.esc(e.label) + ' <span class="count">' + e.count + "</span></label>";
    }).join("");
  }

  var typeCounts = countBy(function (p) { return p.type; });
  checkboxes($("f-type"), "type", Object.keys(W.TYPES).filter(function (t) { return typeCounts[t]; })
    .map(function (t) { return { value: t, label: W.TYPES[t], count: typeCounts[t] }; }));

  var countryCounts = countBy(function (p) { return p.country; });
  checkboxes($("f-country"), "country", Object.keys(countryCounts).sort()
    .map(function (c) { return { value: c, label: c, count: countryCounts[c] }; }));

  checkboxes($("f-price"), "price", PRICES.map(function (r) {
    return { value: r.key, label: r.label, count: P.filter(function (p) { return p.price != null && r.test(p.price); }).length };
  }));

  function checked(name) {
    return Array.prototype.map.call(document.querySelectorAll('input[name="' + name + '"]:checked'), function (i) { return i.value; });
  }

  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function apply() {
    var q = norm($("q").value.trim());
    var types = checked("type"), countries = checked("country"), prices = checked("price");
    var sale = $("f-sale").checked, cases = $("f-case").checked;

    var list = P.filter(function (p) {
      if (types.length && types.indexOf(p.type) < 0) return false;
      if (countries.length && countries.indexOf(p.country) < 0) return false;
      if (prices.length && !(p.price != null && PRICES.some(function (r) { return prices.indexOf(r.key) >= 0 && r.test(p.price); }))) return false;
      if (sale && !p.oldPrice) return false;
      if (cases && p.unit !== "doos van 6") return false;
      if (q) {
        var hay = norm([p.name, p.producer, p.region, p.country, p.grape, W.TYPES[p.type], p.vintage].join(" "));
        if (!q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; })) return false;
      }
      return true;
    });

    var sort = $("sort").value;
    var price = function (p) { return p.price == null ? Infinity : p.price; };
    if (sort === "prijs-op") list.sort(function (a, b) { return price(a) - price(b); });
    if (sort === "prijs-af") list.sort(function (a, b) { return (b.price || 0) - (a.price || 0); });
    if (sort === "naam") list.sort(function (a, b) { return (a.producer + a.name).localeCompare(b.producer + b.name, "nl"); });
    if (sort === "aanbevolen") {
      var score = function (p) { return (p.tags || []).indexOf("uitgelicht") >= 0 ? 0 : p.oldPrice ? 1 : p.price == null ? 3 : 2; };
      list.sort(function (a, b) { return score(a) - score(b); });
    }

    $("grid").innerHTML = list.map(W.card).join("");
    $("empty").hidden = list.length > 0;
    $("result-count").textContent = list.length === 1 ? "1 product" : list.length + " producten";
  }

  function reset() {
    document.querySelectorAll(".filters input[type=checkbox]").forEach(function (i) { i.checked = false; });
    $("q").value = "";
    apply();
  }

  $("filters").addEventListener("input", apply);
  $("sort").addEventListener("change", apply);
  $("filters-reset").addEventListener("click", reset);
  document.addEventListener("click", function (e) { if (e.target.closest("[data-reset]")) reset(); });

  // Filters op mobiel als uitklapscherm
  $("filters-open").addEventListener("click", function () { document.body.classList.add("filters-shown", "no-scroll"); });
  $("filters-done").addEventListener("click", function () { document.body.classList.remove("filters-shown", "no-scroll"); });

  // Startfilter via link, bijv. webshop.html?soort=rood
  var params = new URLSearchParams(location.search);
  var startType = params.get("soort");
  if (startType) {
    var box = document.querySelector('input[name="type"][value="' + CSS.escape(startType) + '"]');
    if (box) box.checked = true;
  }
  if (params.get("actie")) $("f-sale").checked = true;
  if (params.get("q")) $("q").value = params.get("q");
  apply();

  // ---- Productdetail ----
  var modal = $("product-modal");
  var lastFocus;

  function detail(p) {
    var rows = [
      ["Wijnhuis", p.producer], ["Soort", W.TYPES[p.type]], ["Land", p.country], ["Streek", p.region],
      ["Druif", p.grape], ["Jaargang", p.vintage], ["Inhoud", p.size]
    ].filter(function (r) { return r[1]; });
    return '<div class="pm-media">' + W.art(p, "lg") + W.badges(p) + "</div>" +
      '<div class="pm-body">' +
        '<p class="product-producer">' + W.esc(p.producer) + "</p>" +
        '<h2 id="pm-title">' + W.esc(p.name) + "</h2>" +
        '<p class="pm-price">' + W.priceHtml(p) + ' <small>' + W.esc(p.unit) + "</small></p>" +
        "<p>" + W.esc(p.description) + "</p>" +
        '<dl class="specs">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + W.esc(r[1]) + "</dd>"; }).join("") + "</dl>" +
        '<div class="pm-actions">' + W.buyButton(p) + "</div>" +
        (p.pickupOnly ? '<p class="muted">Dit product is alleen af te halen in Zaandam of Weesp.</p>' : "") +
        (p.price != null && !p.pickupOnly ? '<p class="muted">Gratis afhalen · bezorging in de regio · PostNL door heel Nederland</p>' : "") +
      "</div>";
  }

  function openProduct(id, push) {
    var p = W.byId[id];
    if (!p) return;
    lastFocus = document.activeElement;
    $("pm").innerHTML = detail(p);
    modal.hidden = false;
    document.body.classList.add("no-scroll");
    document.title = p.producer + " " + p.name + " — WorldWideWine.nl";
    if (push) history.pushState(null, "", "#" + id);
    modal.querySelector(".modal-close").focus();
  }

  function closeProduct(fromHistory) {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("no-scroll");
    document.title = "Webshop — WorldWideWine.nl";
    if (!fromHistory && location.hash) history.pushState(null, "", location.pathname + location.search);
    if (lastFocus) lastFocus.focus();
  }

  document.addEventListener("click", function (e) {
    var o = e.target.closest("[data-open]");
    if (o) { e.preventDefault(); openProduct(o.getAttribute("data-open"), true); return; }
    if (e.target.closest("[data-close]")) closeProduct();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeProduct(); });
  window.addEventListener("popstate", function () {
    var id = location.hash.slice(1);
    if (W.byId[id]) openProduct(id, false); else closeProduct(true);
  });
  if (location.hash && W.byId[location.hash.slice(1)]) openProduct(location.hash.slice(1), false);
})();
