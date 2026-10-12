/* Winkelwagen en gedeelde webshop-functies. Gebruikt op alle pagina's. */
(function () {
  // Startwaarde uit data/products.js; wordt vervangen door het live assortiment uit de admin.
  var PRODUCTS = (window.WWW_PRODUCTS || []).slice();
  var CONFIG = window.WWW_CONFIG || {};
  var KEY = "wwwCart";
  var byId = {};
  function index() {
    Object.keys(byId).forEach(function (k) { delete byId[k]; });
    PRODUCTS.forEach(function (p) { byId[p.id] = p; });
  }
  index();

  var state = { live: false, onlinePayments: !!CONFIG.onlinePayments };
  var ready = fetch("/api/products", { headers: { Accept: "application/json" } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (!data || !Array.isArray(data.products)) throw new Error("geen data");
      PRODUCTS.length = 0;
      Array.prototype.push.apply(PRODUCTS, data.products);
      index();
      state.live = true;
      state.onlinePayments = !!data.onlinePayments;
    })
    .catch(function () { /* geen server (bijv. lokaal geopend): startassortiment gebruiken */ })
    .then(function () { render(); return PRODUCTS; });

  function soldOut(p) { return p.stock === false || (typeof p.stock === "number" && p.stock <= 0); }

  // Per doos (instelbaar per product): aantal flessen in de doos en de doosprijs.
  var ORDER = window.WWW_ORDER || {};
  function caseSize(p) { return ORDER.caseSize ? ORDER.caseSize(p) : null; }
  function casePrice(p) { return ORDER.casePrice ? ORDER.casePrice(p) : null; }
  function keyOf(i) { return i.id + (i.box ? "|doos" : ""); }
  function unitSize(p, box) { return box ? caseSize(p) || 1 : 1; }
  function unitPrice(p, box) { return box ? casePrice(p) : p.price; }
  function caseSoldOut(p) { return soldOut(p) || (typeof p.stock === "number" && p.stock < caseSize(p)); }
  // Maximaal aantal van deze regel: de voorraad (in flessen) min wat de andere regel van hetzelfde product al gebruikt.
  function maxQty(p, box, items) {
    if (typeof p.stock !== "number") return 99;
    var used = (items || []).filter(function (i) { return i.id === p.id && !!i.box !== !!box; })
      .reduce(function (t, i) { return t + i.qty * unitSize(p, i.box); }, 0);
    return Math.max(0, Math.min(99, Math.floor((p.stock - used) / unitSize(p, box))));
  }

  var TYPES = {
    rood: "Rood", wit: "Wit", rose: "Rosé", mousserend: "Mousserend",
    likeur: "Likeur", delicatessen: "Delicatessen", water: "Water"
  };
  // Soort is vrij in te vullen; de vaste soorten hebben een nette naam.
  function typeLabel(t) { return TYPES[t] || t || ""; }

  function euro(n) {
    return "€ " + Number(n).toFixed(2).replace(".", ",");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- Opslag ----
  function read() {
    try {
      var items = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(items) ? items.filter(function (i) { return i && typeof i.id === "string" && i.qty > 0; }) : [];
    } catch (e) { return memory; }
  }
  var memory = [];
  function write(items) {
    memory = items;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    render();
    document.dispatchEvent(new CustomEvent("cart:change"));
  }

  var Cart = {
    items: read,
    count: function () { return read().reduce(function (s, i) { return s + i.qty; }, 0); },
    // box: true = per doos
    add: function (id, qty, box) {
      var p = byId[id];
      box = !!box;
      if (!p || unitPrice(p, box) == null || (box ? caseSoldOut(p) : soldOut(p))) return;
      var items = read();
      var found = items.find(function (i) { return keyOf(i) === keyOf({ id: id, box: box }); });
      var limit = maxQty(p, box, items);
      if ((found ? found.qty : 0) >= limit) { toast(p, "Meer is er helaas niet op voorraad."); return; }
      if (found) found.qty = Math.min(limit, found.qty + (qty || 1));
      else items.push(box ? { id: id, qty: Math.min(limit, qty || 1), box: true } : { id: id, qty: Math.min(limit, qty || 1) });
      write(items);
      toast(p, null, box);
    },
    set: function (key, qty) {
      var items = read();
      var found = items.find(function (i) { return keyOf(i) === key; });
      if (!found) return;
      if (qty <= 0) items = items.filter(function (i) { return keyOf(i) !== key; });
      else found.qty = Math.min(byId[found.id] ? maxQty(byId[found.id], found.box, items) : 99, qty);
      write(items);
    },
    clear: function () { write([]); }
  };

  // ---- Weergave van een fles / product ----
  function art(p, size) {
    if (p.image) {
      return '<img class="product-img" src="' + esc(p.image) + '" alt="' + esc(p.producer + " " + p.name) + '" loading="lazy">';
    }
    var shape = p.type === "mousserend" ? "art-sparkling" :
      p.type === "likeur" ? "art-liqueur" :
      p.type === "delicatessen" ? "art-deli" :
      p.type === "water" ? "art-water" : "art-wine" + (TYPES[p.type] ? " art-" + p.type : "");
    var initials = (p.producer || "").replace(/^(Domaine|Château|Champagne|Weingut)\s+/i, "")
      .split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join("");
    var cases = p.unit === "doos van 6" ? '<span class="art-case">6×</span>' : "";
    return '<div class="art ' + shape + (size ? " art-" + size : "") + '" aria-hidden="true"><span class="art-body"><span class="art-label">' + esc(initials) + "</span></span>" + cases + "</div>";
  }

  function priceHtml(p) {
    if (p.price == null) return '<span class="price">Prijs op aanvraag</span>';
    return (p.oldPrice ? '<s class="price-old">' + euro(p.oldPrice) + "</s> " : "") +
      '<span class="price">' + euro(p.price) + "</span>";
  }

  function badges(p) {
    var out = [];
    (p.tags || []).forEach(function (t) {
      if (t === "actie") out.push('<span class="badge badge-sale">Actie</span>');
      if (t === "nieuw") out.push('<span class="badge badge-new">Nieuw</span>');
      if (t === "bio") out.push('<span class="badge badge-bio">Bio</span>');
    });
    if (p.pickupOnly) out.push('<span class="badge">Alleen afhalen</span>');
    if (soldOut(p)) out.push('<span class="badge badge-out">Uitverkocht</span>');
    else if (typeof p.stock === "number" && p.stock <= 3) out.push('<span class="badge badge-low">Nog ' + p.stock + "</span>");
    return out.length ? '<div class="badges">' + out.join("") + "</div>" : "";
  }

  var BOX_ICON = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>';
  var BOTTLE_ICON = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2h4v4l1.5 3v12a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V9L10 6z"/><path d="M8.5 13h7"/></svg>';
  var CHEVRON = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  // Winkelwagenknop. Is het product ook per doos te koop, dan krijgt de knop een tweede deel
  // (doosje + pijltje) dat een keuzemenu opent: per fles of per doos.
  function buyButton(p, cls) {
    cls = cls || "";
    if (p.price == null) {
      return '<a class="btn ' + cls + '" href="mailto:' + esc(CONFIG.email) + "?subject=" +
        encodeURIComponent("Offerte: " + p.producer + " " + p.name) + '">Offerte aanvragen</a>';
    }
    if (soldOut(p)) return '<button class="btn ' + cls + '" disabled>Uitverkocht</button>';
    var main = '<button class="btn ' + cls + ' buy-main" data-add="' + esc(p.id) + '">In winkelwagen</button>';
    var n = caseSize(p), price = casePrice(p);
    if (!n || price == null) return main;
    var perBottle = price / n;
    var save = p.price > perBottle + 0.004 ? Math.round((1 - perBottle / p.price) * 100) : 0;
    var off = caseSoldOut(p);
    return '<div class="buy-split">' + main +
      '<button class="btn ' + cls + ' buy-more" data-buy-menu aria-haspopup="true" aria-expanded="false" aria-label="Kies per fles of per doos" title="Ook per doos te koop">' +
        BOX_ICON + CHEVRON + "</button>" +
      '<div class="buy-menu" role="menu" hidden>' +
        '<button class="buy-opt" role="menuitem" data-add="' + esc(p.id) + '"><span class="buy-ic">' + BOTTLE_ICON + "</span>" +
          '<span class="buy-txt"><strong>Per fles</strong><small>' + esc(p.size || "1 fles") + "</small></span>" +
          '<span class="buy-price">' + euro(p.price) + "</span></button>" +
        '<button class="buy-opt buy-opt-box" role="menuitem" data-add-box="' + esc(p.id) + '"' + (off ? " disabled" : "") + '><span class="buy-ic">' + BOX_ICON + "</span>" +
          '<span class="buy-txt"><strong>Per doos van ' + n + "</strong><small>" + (off ? "Niet genoeg op voorraad" : euro(perBottle) + " per fles" + (save ? " · " + save + "% voordeel" : "")) + "</small></span>" +
          '<span class="buy-price">' + euro(price) + "</span></button>" +
      "</div></div>";
  }

  function closeBuyMenus(except) {
    document.querySelectorAll(".buy-split.open").forEach(function (el) {
      if (el === except) return;
      el.classList.remove("open");
      el.querySelector(".buy-menu").hidden = true;
      el.querySelector(".buy-more").setAttribute("aria-expanded", "false");
    });
  }

  function card(p) {
    var meta = [typeLabel(p.type), p.country, p.region].filter(Boolean).join(" · ");
    return '<article class="product">' +
      '<a class="product-media" href="webshop.html#' + esc(p.id) + '" data-open="' + esc(p.id) + '">' + art(p) + badges(p) + "</a>" +
      '<div class="product-body">' +
        '<p class="product-producer">' + esc(p.producer) + "</p>" +
        '<h3 class="product-name"><a href="webshop.html#' + esc(p.id) + '" data-open="' + esc(p.id) + '">' + esc(p.name) + "</a></h3>" +
        '<p class="product-meta">' + esc(meta) + "</p>" +
        '<div class="product-foot"><div class="product-price">' + priceHtml(p) +
          '<small>' + esc(p.unit === "fles" ? p.size : p.unit) + "</small></div>" +
          buyButton(p, "btn-small") + "</div>" +
      "</div></article>";
  }

  // ---- Winkelwagen-paneel ----
  var drawer, list, totalEl, countEls;
  function buildDrawer() {
    drawer = document.createElement("div");
    drawer.className = "drawer";
    drawer.hidden = true;
    drawer.innerHTML =
      '<div class="drawer-backdrop" data-cart-close></div>' +
      '<aside class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title">' +
        '<header class="drawer-head"><h2 id="drawer-title">Winkelwagen</h2>' +
        '<button class="icon-btn" data-cart-close aria-label="Sluiten">×</button></header>' +
        '<div class="drawer-list"></div>' +
        '<footer class="drawer-foot">' +
          '<div class="drawer-total"><span>Subtotaal</span><strong></strong></div>' +
          '<p class="muted">Verzendkosten worden bij het afrekenen berekend. Afhalen is gratis.</p>' +
          '<a class="btn btn-block" href="afrekenen.html">Afrekenen</a>' +
          '<button class="link-btn" data-cart-close>Verder winkelen</button>' +
        "</footer>" +
      "</aside>";
    document.body.appendChild(drawer);
    list = drawer.querySelector(".drawer-list");
    totalEl = drawer.querySelector(".drawer-total strong");
  }

  function render() {
    var items = read().filter(function (i) { return byId[i.id] && unitPrice(byId[i.id], i.box) != null; });
    countEls = countEls || document.querySelectorAll("[data-cart-count]");
    var count = items.reduce(function (s, i) { return s + i.qty; }, 0);
    countEls.forEach(function (el) { el.textContent = count; el.hidden = count === 0; });
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="drawer-empty"><p>Je winkelwagen is nog leeg.</p><a class="btn btn-ghost" href="webshop.html">Bekijk de wijnen</a></div>';
      drawer.querySelector(".drawer-foot").hidden = true;
      return;
    }
    drawer.querySelector(".drawer-foot").hidden = false;
    var subtotal = 0;
    list.innerHTML = items.map(function (i) {
      var p = byId[i.id], k = keyOf(i), price = unitPrice(p, i.box);
      subtotal += price * i.qty;
      return '<div class="line">' + art(p, "sm") +
        '<div class="line-info"><p class="product-producer">' + esc(p.producer) + "</p>" +
        '<p class="line-name">' + esc(p.name) + (i.box ? ' <span class="line-case">' + BOX_ICON + " doos van " + caseSize(p) + "</span>" : "") + "</p>" +
        '<div class="qty"><button data-qty="' + esc(k) + '" data-delta="-1" aria-label="Eén minder">−</button>' +
        "<span>" + i.qty + "</span>" +
        '<button data-qty="' + esc(k) + '" data-delta="1" aria-label="Eén meer">+</button></div></div>' +
        '<div class="line-price">' + euro(price * i.qty) +
        '<button class="link-btn" data-remove="' + esc(k) + '">Verwijder</button></div></div>';
    }).join("");
    totalEl.textContent = euro(subtotal);
  }

  var lastFocus;
  function open() {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.classList.add("no-scroll");
    requestAnimationFrame(function () { drawer.classList.add("open"); });
    drawer.querySelector(".icon-btn").focus();
  }
  function close() {
    drawer.classList.remove("open");
    document.body.classList.remove("no-scroll");
    setTimeout(function () { drawer.hidden = true; }, 250);
    if (lastFocus) lastFocus.focus();
  }

  var toastEl, toastTimer;
  function toast(p, message, box) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = (message ? "<span>" + esc(message) + "</span>" : "<span>✓ " + (box ? "Doos van " + caseSize(p) + " " : "") + "<strong>" + esc(p.producer) + "</strong> " + esc(p.name) + " toegevoegd</span>") + '<button class="link-btn" data-cart-open>Bekijk winkelwagen</button>';
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 3500);
  }

  // ---- Events ----
  document.addEventListener("click", function (e) {
    var menuBtn = e.target.closest("[data-buy-menu]");
    closeBuyMenus(menuBtn && menuBtn.parentNode);
    if (menuBtn) {
      e.preventDefault();
      var split = menuBtn.parentNode, show = !split.classList.contains("open");
      split.classList.toggle("open", show);
      var menu = split.querySelector(".buy-menu");
      menu.hidden = !show;
      menuBtn.setAttribute("aria-expanded", String(show));
      // Te weinig ruimte onder de knop? Dan klapt het menu naar boven uit. Valt het links buiten
      // het scherm (smalle telefoon), dan schuift het naar rechts.
      split.classList.remove("up");
      menu.style.right = "";
      if (show) {
        var r = menu.getBoundingClientRect();
        if (r.bottom > window.innerHeight - 8) split.classList.add("up");
        if (r.left < 8) menu.style.right = (r.left - 8) + "px";
      }
      return;
    }
    var t = e.target.closest("[data-add],[data-add-box],[data-cart-open],[data-cart-close],[data-qty],[data-remove]");
    if (!t) return;
    if (t.hasAttribute("data-add")) { e.preventDefault(); Cart.add(t.getAttribute("data-add"), 1); }
    else if (t.hasAttribute("data-add-box")) { e.preventDefault(); Cart.add(t.getAttribute("data-add-box"), 1, true); }
    else if (t.hasAttribute("data-cart-open")) { e.preventDefault(); if (toastEl) toastEl.classList.remove("show"); open(); }
    else if (t.hasAttribute("data-cart-close")) { e.preventDefault(); close(); }
    else if (t.hasAttribute("data-qty")) {
      var key = t.getAttribute("data-qty");
      var item = read().find(function (i) { return keyOf(i) === key; });
      if (item) Cart.set(key, item.qty + Number(t.getAttribute("data-delta")));
    }
    else if (t.hasAttribute("data-remove")) Cart.set(t.getAttribute("data-remove"), 0);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.querySelector(".buy-split.open")) { e.stopImmediatePropagation(); closeBuyMenus(); return; }
    if (e.key === "Escape" && drawer && !drawer.hidden) close();
  });
  window.addEventListener("storage", function (e) { if (e.key === KEY) render(); });

  buildDrawer();
  render();

  window.WWW = {
    Cart: Cart, PRODUCTS: PRODUCTS, CONFIG: CONFIG, TYPES: TYPES, typeLabel: typeLabel, byId: byId, ready: ready, state: state, soldOut: soldOut,
    euro: euro, esc: esc, art: art, card: card, priceHtml: priceHtml, badges: badges, buyButton: buyButton,
    caseSize: caseSize, casePrice: casePrice, BOX_ICON: BOX_ICON
  };
})();
