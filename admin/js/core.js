/* Admin: basis (inloggen, API, navigatie, vensters, meldingen). */
var A = (function () {
  var views = {};
  var cache = {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var TYPES = { rood: "Rood", wit: "Wit", rose: "Rosé", mousserend: "Mousserend", likeur: "Likeur", delicatessen: "Delicatessen", water: "Water" };
  var STATUS = {
    nieuw: "Nieuw", betaald: "Betaald", klaar: "Klaar", verzonden: "Verzonden", afgerond: "Afgerond", geannuleerd: "Geannuleerd"
  };
  var PAYMENT = {
    online: "Online (Mollie)", "bij-afhalen": "Bij afhalen", betaalverzoek: "Betaalverzoek",
    pin: "Pin", contant: "Contant", tikkie: "Tikkie", overig: "Anders", gemengd: "Gemengd"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function euro(n) {
    var v = Number(n || 0);
    return (v < 0 ? "− " : "") + "€ " + Math.abs(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function date(iso, withTime) {
    if (!iso) return "—";
    var d = new Date(iso);
    var s = d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
    return withTime ? s + " " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : s;
  }
  function parseNum(v) { return v === "" || v == null ? null : Number(String(v).replace(",", ".")); }

  // ---- API ----
  function api(method, path, body) {
    var opts = { method: method, headers: { Accept: "application/json" }, credentials: "same-origin" };
    if (method !== "GET") opts.headers["X-WWW-Admin"] = "1";
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch("/api/admin/" + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && path !== "login") { showLogin(); }
        if (!r.ok) { var e = new Error(j.error || "Er ging iets mis (" + r.status + ")."); e.status = r.status; throw e; }
        return j;
      });
    }, function () { throw new Error("Geen verbinding met de server. Controleer de internetverbinding."); });
  }

  // Gedeelde gegevens, met eenvoudige cache per sessie.
  function load(name, force) {
    if (!force && cache[name]) return Promise.resolve(cache[name]);
    var path = { products: "products", customers: "customers", orders: "orders?months=3" }[name];
    return api("GET", path).then(function (j) { cache[name] = j[name]; return cache[name]; });
  }
  function invalidate() { Array.prototype.forEach.call(arguments, function (n) { delete cache[n]; }); }

  // ---- Meldingen en vensters ----
  var toastTimer;
  function toast(msg, type) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (type ? " toast-" + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, type === "error" ? 6000 : 3000);
  }

  var lastFocus, onClose;
  function modal(title, html, opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    onClose = opts.onClose || null;
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = html;
    $(".modal-panel").className = "modal-panel" + (opts.wide ? " modal-wide" : "") + (opts.narrow ? " modal-narrow" : "");
    $("#modal").hidden = false;
    var first = $("#modal-body [autofocus]") || $("#modal-body input, #modal-body select, #modal-body textarea, #modal-body button");
    if (first) first.focus();
    return $("#modal-body");
  }
  function closeModal() {
    if ($("#modal").hidden) return;
    $("#modal").hidden = true;
    $("#modal-body").innerHTML = "";
    var cb = onClose; onClose = null;
    if (cb) cb();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function confirmBox(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var body = modal(title, "<p>" + esc(text) + "</p><div class='actions'><button class='btn' data-modal-close>Annuleren</button>" +
        "<button class='btn " + (danger ? "btn-danger" : "btn-primary") + "' id='confirm-ok'>" + esc(okLabel || "OK") + "</button></div>",
        { narrow: true, onClose: function () { resolve(false); } });
      body.querySelector("#confirm-ok").addEventListener("click", function () { onClose = null; closeModal(); resolve(true); });
    });
  }

  document.addEventListener("click", function (e) { if (e.target.closest("[data-modal-close]")) { e.preventDefault(); closeModal(); } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  // Formulier uitlezen naar object (checkboxen als true/false).
  function formData(form) {
    var out = {};
    $$("input, select, textarea", form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") out[el.name] = el.checked;
      else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value.trim();
    });
    return out;
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Bezig…"; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  // ---- Navigatie ----
  var current = null;
  function register(name, view) { views[name] = view; }

  function route() {
    var name = (location.hash || "#dashboard").slice(1).split("/")[0] || "dashboard";
    if (!views[name]) name = "dashboard";
    if (current && views[current].leave) views[current].leave();
    current = name;
    $$("#menu a").forEach(function (a) { a.classList.toggle("active", a.dataset.view === name); });
    document.body.dataset.view = name;
    var el = $("#view");
    el.innerHTML = "<div class='loading'>Laden…</div>";
    Promise.resolve(views[name].render(el)).catch(function (e) {
      el.innerHTML = "<div class='empty'><p>" + esc(e.message) + "</p><button class='btn' onclick='location.reload()'>Opnieuw proberen</button></div>";
    });
    if (name !== "pos") refreshBadges();
  }

  // ---- Volledig scherm (kassa) ----
  function enterFullscreen() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn && !isFullscreen()) { try { var r = fn.call(el); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
  }
  function exitFullscreen() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn && isFullscreen()) { try { var r = fn.call(document); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
  }
  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  // Kassa openen: moet direct vanuit een klik worden aangeroepen (anders weigert de browser volledig scherm).
  function openPos() { enterFullscreen(); location.hash = "#pos"; }

  // Afdrukken van een bon of rapport
  function printHtml(html) {
    var el = document.getElementById("receipt-print");
    el.innerHTML = html;
    document.body.classList.add("printing-receipt");
    setTimeout(function () { window.print(); document.body.classList.remove("printing-receipt"); }, 50);
  }

  function refreshBadges() {
    api("GET", "dashboard").then(function (d) {
      var open = d.openOrders.filter(function (o) { return o.status === "nieuw" || o.status === "betaald"; }).length;
      $("#open-count").hidden = !open; $("#open-count").textContent = open;
      $("#low-count").hidden = !d.lowStock.length; $("#low-count").textContent = d.lowStock.length;
    }).catch(function () {});
  }

  // ---- Inloggen ----
  function showLogin(message) {
    $("#app").hidden = true;
    $("#login").hidden = false;
    if (message) { $("#login-error").textContent = message; $("#login-error").hidden = false; }
    $("#login-form [name=password]").focus();
  }
  function showApp() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    route();
  }

  function start() {
    $("#login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $("#login-form button");
      busy(btn, true);
      $("#login-error").hidden = true;
      api("POST", "login", { password: $("#login-form [name=password]").value })
        .then(function () { $("#login-form").reset(); showApp(); })
        .catch(function (err) { $("#login-error").textContent = err.message; $("#login-error").hidden = false; })
        .then(function () { busy(btn, false); });
    });
    $("#logout").addEventListener("click", function () {
      api("POST", "logout").then(function () { cache = {}; showLogin(); });
    });
    window.addEventListener("hashchange", function () { if (!$("#app").hidden) route(); });

    api("GET", "session").then(function (s) {
      if (!s.configured) return showLogin("Er is nog geen admin-wachtwoord ingesteld. Zet ADMIN_PASSWORD bij de hosting (zie README).");
      if (s.loggedIn) showApp(); else showLogin();
    }).catch(function () {
      showLogin("De server is niet bereikbaar. De admin werkt alleen als de site op Netlify draait (of via npm run dev).");
    });
  }

  // ---- Kleine weergavehulpjes ----
  function statusBadge(s) { return "<span class='status status-" + esc(s) + "'>" + esc(STATUS[s] || s) + "</span>"; }
  function stockBadge(p) {
    if (typeof p.stock !== "number") return "<span class='stock stock-none' title='Voorraad wordt niet bijgehouden'>—</span>";
    var min = p.minStock == null ? 6 : p.minStock;
    var cls = p.stock <= 0 ? "stock-out" : p.stock <= min ? "stock-low" : "stock-ok";
    return "<span class='stock " + cls + "'>" + p.stock + "</span>";
  }
  function productName(p) { return p.producer + " — " + p.name; }

  // Foto van het product, of anders een getekende fles in de kleur van de soort.
  var ART = {
    rood: ["#4a1219", "#7a1f2b"], wit: ["#6b7a2e", "#9aab52"], rose: ["#d98a8f", "#f0b9b5"],
    mousserend: ["#1f3324", "#3d5c43"], likeur: ["#d8c22a", "#f2e46a"], delicatessen: ["#9c3b35", "#d77a72"], water: ["#6aa3c0", "#cfe6ef"]
  };
  function productArt(p, cls) {
    if (p.image) return "<img class='p-img " + (cls || "") + "' src='" + esc(p.image) + "' alt='' loading='lazy'>";
    var c = ART[p.type] || ART.rood;
    var id = "g" + Math.random().toString(36).slice(2, 8);
    var initials = (p.producer || "").replace(/^(Domaine|Château|Champagne|Weingut)\s+/i, "").split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0); }).join("").toUpperCase();
    var grad = "<defs><linearGradient id='" + id + "' x1='0' x2='1'><stop offset='0' stop-color='" + c[0] + "'/><stop offset='.55' stop-color='" + c[1] + "'/><stop offset='1' stop-color='" + c[0] + "'/></linearGradient></defs>";
    var shape;
    if (p.type === "delicatessen") {
      shape = "<ellipse cx='60' cy='86' rx='38' ry='30' fill='url(#" + id + ")'/><ellipse cx='60' cy='86' rx='16' ry='12' fill='#f6e6d6'/>";
    } else if (p.type === "likeur") {
      shape = "<rect x='44' y='24' width='32' height='12' rx='3' fill='#2a1a1c'/><rect x='38' y='36' width='44' height='92' rx='8' fill='url(#" + id + ")'/>" +
        "<rect x='42' y='66' width='36' height='34' rx='3' fill='#fbf7f3'/><text x='60' y='89' text-anchor='middle' font-family='Georgia,serif' font-weight='700' font-size='14' fill='#a9441f'>" + esc(initials) + "</text>";
    } else {
      var wide = p.type === "mousserend" || p.type === "water";
      var w = wide ? 16 : 12;
      var cap = p.type === "mousserend" ? "#d9c27a" : p.type === "water" ? "#2b5d77" : "#ce542b";
      shape = "<rect x='53' y='12' width='14' height='12' rx='2' fill='" + cap + "'/>" +
        "<path d='M54 24h12v22c0 6 " + w + " 10 " + w + " 22v66a6 6 0 0 1-6 6H" + (60 - w) + "a6 6 0 0 1-6-6V68c0-12 " + w + "-16 " + w + "-22Z' fill='url(#" + id + ")'/>" +
        "<rect x='44' y='76' width='32' height='30' rx='3' fill='#fbf7f3'/><rect x='44' y='76' width='32' height='3' fill='#e08a62'/>" +
        "<text x='60' y='97' text-anchor='middle' font-family='Georgia,serif' font-weight='700' font-size='12' fill='#a9441f'>" + esc(initials) + "</text>";
    }
    var cases = p.unit === "doos van 6" ? "<rect x='78' y='112' width='30' height='16' rx='3' fill='#a9441f'/><text x='93' y='124' text-anchor='middle' font-family='Arial,sans-serif' font-weight='700' font-size='10' fill='#fff'>6×</text>" : "";
    return "<svg class='p-img p-art " + (cls || "") + "' viewBox='0 0 120 140' role='img' aria-hidden='true'>" + grad + shape + cases + "</svg>";
  }

  return {
    $: $, $$: $$, esc: esc, euro: euro, date: date, parseNum: parseNum,
    api: api, load: load, invalidate: invalidate, toast: toast, modal: modal, closeModal: closeModal,
    confirm: confirmBox, formData: formData, busy: busy, register: register, route: route, start: start,
    enterFullscreen: enterFullscreen, exitFullscreen: exitFullscreen, isFullscreen: isFullscreen, openPos: openPos, printHtml: printHtml,
    refreshBadges: refreshBadges, statusBadge: statusBadge, stockBadge: stockBadge, productName: productName, productArt: productArt,
    TYPES: TYPES, STATUS: STATUS, PAYMENT: PAYMENT,
    computeOrder: window.WWW_ORDER.computeOrder, CONFIG: window.WWW_CONFIG
  };
})();
