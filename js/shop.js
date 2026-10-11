/* Winkelwagen en gedeelde webshop-functies. Gebruikt op alle pagina's. */
(function () {
  var PRODUCTS = window.WWW_PRODUCTS || [];
  var CONFIG = window.WWW_CONFIG || {};
  var KEY = "wwwCart";
  var byId = {};
  PRODUCTS.forEach(function (p) { byId[p.id] = p; });

  var TYPES = {
    rood: "Rood", wit: "Wit", rose: "Rosé", mousserend: "Mousserend",
    likeur: "Likeur", delicatessen: "Delicatessen", water: "Water"
  };

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
      return Array.isArray(items) ? items.filter(function (i) { return byId[i.id] && i.qty > 0; }) : [];
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
    add: function (id, qty) {
      var p = byId[id];
      if (!p || p.price == null || p.stock === false) return;
      var items = read();
      var found = items.find(function (i) { return i.id === id; });
      if (found) found.qty = Math.min(99, found.qty + (qty || 1));
      else items.push({ id: id, qty: qty || 1 });
      write(items);
      toast(p);
    },
    set: function (id, qty) {
      var items = read();
      var found = items.find(function (i) { return i.id === id; });
      if (!found) return;
      if (qty <= 0) items = items.filter(function (i) { return i.id !== id; });
      else found.qty = Math.min(99, qty);
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
      p.type === "water" ? "art-water" : "art-wine art-" + p.type;
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
    if (p.stock === false) out.push('<span class="badge badge-out">Uitverkocht</span>');
    return out.length ? '<div class="badges">' + out.join("") + "</div>" : "";
  }

  function buyButton(p, cls) {
    if (p.price == null) {
      return '<a class="btn ' + (cls || "") + '" href="mailto:' + esc(CONFIG.email) + "?subject=" +
        encodeURIComponent("Offerte: " + p.producer + " " + p.name) + '">Offerte aanvragen</a>';
    }
    if (p.stock === false) return '<button class="btn ' + (cls || "") + '" disabled>Uitverkocht</button>';
    return '<button class="btn ' + (cls || "") + '" data-add="' + esc(p.id) + '">In winkelwagen</button>';
  }

  function card(p) {
    var meta = [TYPES[p.type], p.country, p.region].filter(Boolean).join(" · ");
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
    var items = read();
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
      var p = byId[i.id];
      subtotal += p.price * i.qty;
      return '<div class="line">' + art(p, "sm") +
        '<div class="line-info"><p class="product-producer">' + esc(p.producer) + "</p>" +
        '<p class="line-name">' + esc(p.name) + "</p>" +
        '<div class="qty"><button data-qty="' + esc(p.id) + '" data-delta="-1" aria-label="Eén minder">−</button>' +
        "<span>" + i.qty + "</span>" +
        '<button data-qty="' + esc(p.id) + '" data-delta="1" aria-label="Eén meer">+</button></div></div>' +
        '<div class="line-price">' + euro(p.price * i.qty) +
        '<button class="link-btn" data-remove="' + esc(p.id) + '">Verwijder</button></div></div>';
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
  function toast(p) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = "<span>✓ <strong>" + esc(p.producer) + "</strong> " + esc(p.name) + ' toegevoegd</span><button class="link-btn" data-cart-open>Bekijk winkelwagen</button>';
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 3500);
  }

  // ---- Events ----
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-add],[data-cart-open],[data-cart-close],[data-qty],[data-remove]");
    if (!t) return;
    if (t.hasAttribute("data-add")) { e.preventDefault(); Cart.add(t.getAttribute("data-add"), 1); }
    else if (t.hasAttribute("data-cart-open")) { e.preventDefault(); if (toastEl) toastEl.classList.remove("show"); open(); }
    else if (t.hasAttribute("data-cart-close")) { e.preventDefault(); close(); }
    else if (t.hasAttribute("data-qty")) {
      var id = t.getAttribute("data-qty");
      var item = read().find(function (i) { return i.id === id; });
      if (item) Cart.set(id, item.qty + Number(t.getAttribute("data-delta")));
    }
    else if (t.hasAttribute("data-remove")) Cart.set(t.getAttribute("data-remove"), 0);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer && !drawer.hidden) close();
  });
  window.addEventListener("storage", function (e) { if (e.key === KEY) render(); });

  buildDrawer();
  render();

  window.WWW = {
    Cart: Cart, PRODUCTS: PRODUCTS, CONFIG: CONFIG, TYPES: TYPES, byId: byId,
    euro: euro, esc: esc, art: art, card: card, priceHtml: priceHtml, badges: badges, buyButton: buyButton
  };
})();
