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
    pin: "Pin", contant: "Contant", tikkie: "Tikkie", overig: "Anders"
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
    refreshBadges();
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

  return {
    $: $, $$: $$, esc: esc, euro: euro, date: date, parseNum: parseNum,
    api: api, load: load, invalidate: invalidate, toast: toast, modal: modal, closeModal: closeModal,
    confirm: confirmBox, formData: formData, busy: busy, register: register, route: route, start: start,
    refreshBadges: refreshBadges, statusBadge: statusBadge, stockBadge: stockBadge, productName: productName,
    TYPES: TYPES, STATUS: STATUS, PAYMENT: PAYMENT,
    computeOrder: window.WWW_ORDER.computeOrder, CONFIG: window.WWW_CONFIG
  };
})();
