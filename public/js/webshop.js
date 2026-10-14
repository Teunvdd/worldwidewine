/* Catalogus: filteren, zoeken, sorteren en productdetail. */
window.WWW.ready.then(function () {
  var W = window.WWW;
  var P = W.PRODUCTS;
  var $ = function (id) { return document.getElementById(id); };

  function countBy(fn) {
    var c = {};
    P.forEach(function (p) { [].concat(fn(p)).forEach(function (k) { if (k) c[k] = (c[k] || 0) + 1; }); });
    return c;
  }

  // Druiven: "Sangiovese, Merlot" telt voor beide druiven.
  function grapes(p) { return p.grape ? String(p.grape).split(/\s*[,/&+]\s*|\s+en\s+/i).map(function (g) { return g.trim(); }).filter(Boolean) : []; }

  var MORE = 6; // langere lijsten: eerst 6 tonen, de rest achter "Toon meer"
  function checkboxes(name, entries) {
    var container = $("f-" + name);
    var box = container.closest("fieldset");
    box.hidden = !entries.length;
    container.innerHTML = entries.map(function (e, i) {
      return '<label class="check' + (i >= MORE ? " more" : "") + '"><input type="checkbox" name="' + name + '" value="' + W.esc(e.value) + '"> ' +
        W.esc(e.label) + ' <span class="count">' + e.count + "</span></label>";
    }).join("") + (entries.length > MORE ? '<button type="button" class="link-btn show-more" data-more>Toon alle ' + entries.length + "</button>" : "");
  }
  function list(name, fn, sort) {
    var c = countBy(fn);
    checkboxes(name, Object.keys(c).sort(sort || function (a, b) { return a.localeCompare(b, "nl"); })
      .map(function (k) { return { value: k, label: k, count: c[k] }; }));
  }

  var typeCounts = countBy(function (p) { return p.type; });
  // Vaste soorten eerst (in vaste volgorde), daarna de zelf ingevulde soorten op alfabet.
  checkboxes("type", Object.keys(W.TYPES).filter(function (t) { return typeCounts[t]; })
    .concat(Object.keys(typeCounts).filter(function (t) { return !W.TYPES[t]; }).sort(function (a, b) { return a.localeCompare(b, "nl"); }))
    .map(function (t) { return { value: t, label: W.typeLabel(t), count: typeCounts[t] }; }));
  list("country", function (p) { return p.country; });
  list("region", function (p) { return p.region; });
  list("grape", grapes);
  list("vintage", function (p) { return p.vintage ? String(p.vintage) : null; }, function (a, b) { return b - a; });
  list("size", function (p) { return p.size; }, function (a, b) { return sizeCl(a) - sizeCl(b) || a.localeCompare(b); });

  // Inhoud sorteren: "37,5 cl" < "75 cl" < "1,5 l".
  function sizeCl(s) {
    var m = String(s).replace(",", ".").match(/([\d.]+)\s*(ml|cl|l)/i);
    if (!m) return 1e9;
    return Number(m[1]) * ({ ml: 0.1, cl: 1, l: 100 })[m[2].toLowerCase()];
  }

  // ---- Schuifjes met twee handvatten (prijs en alcohol) ----
  function slider(name, values, step, fmt) {
    var el = $("f-" + name);
    var box = el.closest("fieldset");
    if (!values.length) { box.hidden = true; return null; }
    var min = Math.floor(Math.min.apply(null, values) / step) * step;
    var max = Math.ceil(Math.max.apply(null, values) / step) * step;
    if (max <= min) max = min + step;
    el.innerHTML =
      '<div class="range-values"><span data-lo></span><span data-hi></span></div>' +
      '<div class="range-track"><div class="range-fill"></div>' +
        '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + min + '" aria-label="Minimum" data-r="lo">' +
        '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + max + '" aria-label="Maximum" data-r="hi">' +
      "</div>";
    var lo = el.querySelector("[data-r=lo]"), hi = el.querySelector("[data-r=hi]"), fill = el.querySelector(".range-fill");
    function draw(moved) {
      var a = Number(lo.value), b = Number(hi.value);
      if (a > b) { if (moved === lo) lo.value = a = b; else hi.value = b = a; }
      fill.style.left = (a - min) / (max - min) * 100 + "%";
      fill.style.right = (max - b) / (max - min) * 100 + "%";
      el.querySelector("[data-lo]").textContent = fmt(a);
      el.querySelector("[data-hi]").textContent = fmt(b);
      // Het handvat dat bovenaan ligt moet bereikbaar blijven als ze elkaar raken.
      lo.style.zIndex = a >= max - step ? 3 : 1;
    }
    [lo, hi].forEach(function (r) { r.addEventListener("input", function () { draw(r); }); });
    draw();
    return {
      // Volle breedte = geen filter (dan blijven ook producten zonder waarde zichtbaar).
      test: function (v) {
        var a = Number(lo.value), b = Number(hi.value);
        if (a <= min && b >= max) return true;
        return v != null && v >= a && (b >= max || v <= b);
      },
      reset: function () { lo.value = min; hi.value = max; draw(); }
    };
  }
  var euro0 = function (v) { return "€ " + v; };
  var priceRange = slider("price", P.filter(function (p) { return p.price != null; }).map(function (p) { return p.price; }), 1, euro0);
  var alcRange = slider("alcohol", P.filter(function (p) { return p.alcohol != null; }).map(function (p) { return p.alcohol; }), 0.5,
    function (v) { return String(v).replace(".", ",") + "%"; });

  function checked(name) {
    return Array.prototype.map.call(document.querySelectorAll('input[name="' + name + '"]:checked'), function (i) { return i.value; });
  }

  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  // ---- Pagina's: 24 wijnen per pagina ----
  var PER = 24, current = [], page = 1;
  function pagerHtml(total) {
    var pages = Math.ceil(total / PER);
    if (pages <= 1) return "";
    var out = [], last = 0;
    for (var i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
        if (i - last > 1) out.push('<span class="pager-gap">…</span>');
        out.push('<button type="button" class="pager-btn' + (i === page ? " is-current" : "") + '" data-page="' + i + '"' + (i === page ? ' aria-current="page"' : "") + ">" + i + "</button>");
        last = i;
      }
    }
    return '<button type="button" class="pager-btn pager-step" data-page="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + ' aria-label="Vorige pagina">‹<span class="pager-label"> Vorige</span></button>' +
      out.join("") +
      '<button type="button" class="pager-btn pager-step" data-page="' + (page + 1) + '"' + (page >= pages ? " disabled" : "") + ' aria-label="Volgende pagina"><span class="pager-label">Volgende </span>›</button>';
  }
  function show() {
    var pages = Math.max(1, Math.ceil(current.length / PER));
    page = Math.min(Math.max(1, page), pages);
    $("grid").innerHTML = current.slice((page - 1) * PER, page * PER).map(W.card).join("");
    $("pager").innerHTML = pagerHtml(current.length);
    var from = (page - 1) * PER + 1, to = Math.min(current.length, page * PER);
    $("result-count").textContent = current.length === 1 ? "1 product"
      : current.length > PER ? from + "–" + to + " van " + current.length + " producten" : current.length + " producten";
  }
  $("pager").addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]");
    if (!b || b.disabled) return;
    page = Number(b.dataset.page);
    show();
    var top = document.querySelector(".results");
    if (top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
  });

  function apply() {
    var q = norm($("q").value.trim());
    var f = {};
    ["type", "country", "region", "grape", "vintage", "size"].forEach(function (n) { f[n] = checked(n); });
    var sale = $("f-sale").checked, cases = $("f-case").checked;
    var any = function (sel, vals) { return !sel.length || [].concat(vals).some(function (v) { return v != null && sel.indexOf(String(v)) >= 0; }); };

    var list = P.filter(function (p) {
      if (!any(f.type, p.type) || !any(f.country, p.country) || !any(f.region, p.region)) return false;
      if (!any(f.grape, grapes(p)) || !any(f.vintage, p.vintage) || !any(f.size, p.size)) return false;
      if (priceRange && !priceRange.test(p.price)) return false;
      if (alcRange && !alcRange.test(p.alcohol)) return false;
      if (sale && !p.oldPrice) return false;
      if (cases && p.unit !== "doos van 6" && !W.caseSize(p)) return false;
      if (q) {
        var hay = norm([p.name, p.producer, p.region, p.country, p.grape, W.typeLabel(p.type), p.vintage, p.size].join(" "));
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

    current = list;
    page = 1;
    show();
    $("empty").hidden = list.length > 0;
  }

  function reset() {
    document.querySelectorAll(".filters input[type=checkbox]").forEach(function (i) { i.checked = false; });
    if (priceRange) priceRange.reset();
    if (alcRange) alcRange.reset();
    setTimeout(badges);
    $("q").value = "";
    apply();
  }

  $("filters").addEventListener("input", apply);
  $("sort").addEventListener("change", apply);
  $("filters-reset").addEventListener("click", reset);
  document.addEventListener("click", function (e) { if (e.target.closest("[data-reset]")) reset(); });
  $("filters").addEventListener("click", function (e) {
    var b = e.target.closest("[data-more]");
    if (!b) return;
    var open = b.parentNode.classList.toggle("show-all");
    b.textContent = open ? "Toon minder" : "Toon alle " + b.parentNode.querySelectorAll(".check").length;
  });

  // ---- Filtergroepen: eerst dichtgeklapt, open met een tik op de kop ----
  var CHEV = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  Array.prototype.forEach.call(document.querySelectorAll("#filters fieldset"), function (fs, i) {
    var legend = fs.querySelector("legend");
    var body = document.createElement("div");
    body.className = "f-body";
    body.id = "f-body-" + i;
    while (legend.nextSibling) body.appendChild(legend.nextSibling);
    fs.appendChild(body);
    legend.innerHTML = '<button type="button" class="f-toggle" aria-expanded="false" aria-controls="' + body.id + '"><span>' + legend.textContent + '</span><span class="f-badge" hidden></span>' + CHEV + "</button>";
    fs.classList.add("f-closed");
  });
  function setOpen(fs, open) {
    fs.classList.toggle("f-closed", !open);
    fs.querySelector(".f-toggle").setAttribute("aria-expanded", String(open));
  }
  $("filters").addEventListener("click", function (e) {
    var t = e.target.closest(".f-toggle");
    if (t) { var fs = t.closest("fieldset"); setOpen(fs, fs.classList.contains("f-closed")); }
  });
  // Bij een dichte groep laat een bolletje zien hoeveel filters er aan staan.
  function badges() {
    Array.prototype.forEach.call(document.querySelectorAll("#filters fieldset"), function (fs) {
      var n = fs.querySelectorAll("input[type=checkbox]:checked").length;
      var r = fs.querySelectorAll("input[type=range]");
      if (r.length === 2 && (Number(r[0].value) > Number(r[0].min) || Number(r[1].value) < Number(r[1].max))) n++;
      var b = fs.querySelector(".f-badge");
      b.hidden = !n; b.textContent = n;
    });
  }
  $("filters").addEventListener("input", badges);

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
  // Groepen waarin via de link al iets aangevinkt is, staan open.
  Array.prototype.forEach.call(document.querySelectorAll("#filters fieldset"), function (fs) { if (fs.querySelector("input:checked")) setOpen(fs, true); });
  apply();
  badges();

  // ---- Productdetail ----
  var modal = $("product-modal");
  var lastFocus;

  function detail(p) {
    var rows = [
      ["Wijnhuis", p.producer], ["Soort", W.typeLabel(p.type)], ["Land", p.country], ["Regio", p.region],
      ["Druivensoort", p.grape], ["Oogstjaar", p.vintage], ["Inhoud", p.size],
      ["Alcohol", p.alcohol != null ? String(p.alcohol).replace(".", ",") + "% vol." : null]
    ].filter(function (r) { return r[1]; });
    return '<div class="pm-media' + (p.image ? " has-photo" : "") + '">' + W.art(p, "lg") + W.badges(p) + "</div>" +
      '<div class="pm-body">' +
        '<p class="product-producer">' + W.esc(p.producer) + "</p>" +
        '<h2 id="pm-title">' + W.esc(p.name) + "</h2>" +
        '<p class="pm-price">' + W.priceHtml(p) + ' <small>' + W.esc(p.unit) + "</small></p>" +
        '<div class="pm-actions">' + W.buyButton(p) + "</div>" +
        (p.description ? '<div class="pm-desc" id="pm-desc"><p>' + W.esc(p.description) + "</p></div>" +
          '<button type="button" class="link-btn pm-more" id="pm-more" aria-controls="pm-desc" aria-expanded="false" hidden>Lees meer</button>' : "") +
        '<dl class="specs">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + W.esc(r[1]) + "</dd>"; }).join("") + "</dl>" +
        (p.pickupOnly ? '<p class="muted">Dit product is alleen af te halen in Zaandam of Weesp.</p>' : "") +
        (p.price != null && !p.pickupOnly ? '<p class="muted">Gratis afhalen · bezorging in de regio · PostNL door heel Nederland</p>' : "") +
      "</div>";
  }

  function openProduct(id, push) {
    var p = W.byId[id];
    if (!p) return;
    lastFocus = document.activeElement;
    $("pm").innerHTML = detail(p);
    $("pm").classList.remove("is-expanded");
    modal.hidden = false;
    modal.querySelector(".modal-panel").scrollTop = 0;
    // Lange omschrijving inkorten tot een paar regels, met "Lees meer".
    var desc = $("pm-desc"), more = $("pm-more");
    if (desc && more) {
      desc.classList.add("is-clamped");
      more.hidden = desc.scrollHeight <= desc.clientHeight + 2;
      if (more.hidden) desc.classList.remove("is-clamped");
      more.onclick = function () {
        var open = desc.classList.toggle("is-clamped") === false;
        $("pm").classList.toggle("is-expanded", open);
        more.textContent = open ? "Minder tonen" : "Lees meer";
        more.setAttribute("aria-expanded", String(open));
      };
    }
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
});
