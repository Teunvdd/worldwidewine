/* Kassa (POS) voor de winkel, in de stijl van Odoo:
 *   #kassa  beheer in de admin: kassa openen, sluiten, overzicht van diensten
 *   #pos    de kassa zelf, op volledig scherm: productkaarten, bon met numpad, betaalscherm, bonscherm
 */
(function () {
  var e = A.esc, eu = A.euro;
  var round = function (n) { return Math.round(n * 100) / 100; };
  // Eenvoudige lijnicoontjes (kleuren mee met de tekst), net zo strak als ＋ % €.
  function svg(d) { return "<svg viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + d + "</svg>"; }
  var ICON = {
    trash: svg("<path d='M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'/>"),
    tag: svg("<path d='M3 12V4h8l10 10-8 8z'/><circle cx='7.5' cy='8.5' r='1.3'/>"),
    receipt: svg("<path d='M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6'/>"),
    user: svg("<circle cx='12' cy='8' r='4'/><path d='M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5'/>")
  };
  var METHODS = [
    { key: "pin", label: "Pin", icon: "▭" },
    { key: "contant", label: "Contant", icon: "€" },
    { key: "tikkie", label: "Tikkie", icon: "↗" }
  ];

  // ================================================================ Kassabeheer (#kassa)

  function renderManage(el) {
    return Promise.all([A.api("GET", "pos/session"), A.api("GET", "pos/sessions")]).then(function (res) {
      var cur = res[0].session, sessions = res[1].sessions;
      el.innerHTML =
        "<header class='page-head'><div><h1>Kassa</h1><p class='muted'>Open de kassa aan het begin van de dag en sluit hem aan het eind van de dag af.</p></div>" +
        "<a class='btn' href='#kassa-instellingen'>⚙ Kassa-instellingen</a></header>" +
        "<section class='card kassa-status " + (cur ? "is-open" : "is-closed") + "'>" +
          (cur
            ? "<div><span class='dot'></span><strong>De kassa is open</strong> sinds " + A.date(cur.openedAt, true) + "<br><span class='muted'>" +
                cur.summary.count + " bonnen · omzet " + eu(cur.summary.total) + " · in de la verwacht " + eu(cur.summary.expectedCash) + "</span></div>" +
              "<div class='actions'><button class='btn' id='k-close'>Kassa sluiten</button><button class='btn btn-primary btn-lg' id='k-open'>Naar de kassa</button></div>"
            : "<div><span class='dot'></span><strong>De kassa is gesloten</strong><br><span class='muted'>Laatst geteld in de la: " + eu(res[0].lastClosingCash) + "</span></div>" +
              "<div class='actions'><button class='btn btn-primary btn-lg' id='k-open'>Kassa openen</button></div>") +
        "</section>" +
        "<p class='muted small'>Tip: zet de kassacomputer in kioskmodus, dan opent de kassa direct op volledig scherm (zie README).</p>" +
        "<section class='card card-flush'><table class='table table-hover'><thead><tr><th>Dienst</th><th>Geopend</th><th>Gesloten</th><th class='num'>Bonnen</th><th class='num'>Omzet</th><th class='num'>Pin</th><th class='num'>Contant</th><th class='num'>Verschil kas</th></tr></thead><tbody>" +
        (sessions.length ? sessions.map(function (s) {
          var sm = s.summary || {}, bm = sm.byMethod || {};
          var diff = s.difference == null ? "—" : "<span class='" + (Math.abs(s.difference) < 0.005 ? "num-up" : "num-down") + "'>" + (s.difference > 0 ? "+" : "") + eu(s.difference) + "</span>";
          return "<tr class='clickable' data-session='" + s.id + "'><td>#" + s.id + (s.status === "open" ? " <span class='status status-nieuw'>Open</span>" : "") + "</td><td>" + A.date(s.openedAt, true) + "</td><td>" + (s.closedAt ? A.date(s.closedAt, true) : "—") + "</td>" +
            "<td class='num'>" + (sm.count == null ? "—" : sm.count) + "</td><td class='num'>" + (sm.total == null ? "—" : eu(sm.total)) + "</td><td class='num'>" + (bm.pin ? eu(bm.pin) : "—") + "</td><td class='num'>" + (bm.contant ? eu(bm.contant) : "—") + "</td><td class='num'>" + diff + "</td></tr>";
        }).join("") : "<tr><td colspan='8' class='empty-inline'>Nog geen kassadiensten.</td></tr>") +
        "</tbody></table></section>";

      el.querySelector("#k-open").addEventListener("click", function () { A.openPos(); });
      var c = el.querySelector("#k-close");
      if (c) c.addEventListener("click", function () { closeDialog(function () { A.route(); }); });
      el.querySelectorAll("[data-session]").forEach(function (tr) {
        tr.addEventListener("click", function () {
          var s = sessions.find(function (x) { return String(x.id) === tr.dataset.session; });
          if (s.status === "open") return A.openPos();
          showZReport(s);
        });
      });
    });
  }

  function showZReport(s) {
    var body = A.modal("Kassarapport dienst #" + s.id, "<div class='receipt-preview'>" + A.zReportHtml(s) + "</div>" +
      "<div class='actions'><button class='btn' id='z-print'>Afdrukken</button><button class='btn btn-primary' data-modal-close>Sluiten</button></div>", { narrow: true });
    body.querySelector("#z-print").addEventListener("click", function () { A.printHtml(A.zReportHtml(s)); });
  }

  // Beheerderspincode vragen (als die voor deze handeling is ingesteld).
  // Geeft een Promise met de pincode, "" als er geen nodig is, of null bij annuleren.
  var PIN_TEXT = { priceChange: "prijs wijzigen", discount: "korting geven", deleteLine: "regel verwijderen", closeSession: "kassa sluiten", exitPos: "kassa verlaten" };
  A.askPin = function (settings, action, known) {
    if (!settings || !settings.pinSet || !settings.pinFor || !settings.pinFor[action]) return Promise.resolve("");
    if (known) return Promise.resolve(known);
    return new Promise(function (resolve) {
      var pin = "";
      var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "back"];
      var body = A.modal("Beheerderspincode", "<p class='center muted'>Pincode nodig voor: <strong>" + e(PIN_TEXT[action] || action) + "</strong></p>" +
        "<div class='pin-dots' id='pin-dots'></div><p class='center error-text' id='pin-err'></p>" +
        "<div class='numpad numpad-pin'>" + keys.map(function (k) { return "<button class='np-key' data-pk='" + k + "'>" + (k === "back" ? "⌫" : k === "C" ? "Wis" : k) + "</button>"; }).join("") + "</div>" +
        "<div class='actions'><button class='btn' data-modal-close>Annuleren</button><button class='btn btn-primary' id='pin-ok'>OK</button></div>",
        { narrow: true, onClose: function () { document.removeEventListener("keydown", onKey, true); resolve(null); } });
      function dots() { body.querySelector("#pin-dots").innerHTML = pin ? pin.split("").map(function () { return "<span>●</span>"; }).join("") : "<span class='muted'>····</span>"; }
      function submit() {
        if (!pin) return;
        var btn = body.querySelector("#pin-ok"); A.busy(btn, true, "…");
        A.api("POST", "pos/verify-pin", { pin: pin }).then(function () {
          document.removeEventListener("keydown", onKey, true);
          var p = pin; A.closeModalSilently(); resolve(p);
        }).catch(function (err) { A.busy(btn, false); pin = ""; dots(); body.querySelector("#pin-err").textContent = err.message; });
      }
      function key(k) {
        if (k === "back") pin = pin.slice(0, -1); else if (k === "C") pin = ""; else if (pin.length < 8) pin += k;
        body.querySelector("#pin-err").textContent = ""; dots();
      }
      function onKey(ev) {
        if (/^\d$/.test(ev.key)) { ev.preventDefault(); ev.stopPropagation(); key(ev.key); }
        else if (ev.key === "Backspace") { ev.preventDefault(); ev.stopPropagation(); key("back"); }
        else if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); submit(); }
      }
      document.addEventListener("keydown", onKey, true);
      body.addEventListener("click", function (ev) { var b = ev.target.closest("[data-pk]"); if (b) key(b.dataset.pk); });
      body.querySelector("#pin-ok").addEventListener("click", submit);
      dots();
    });
  };

  // Kassa sluiten (met of zonder kastelling). done() wordt aangeroepen na het sluiten.
  function closeDialog(done, knownPin) {
    A.api("GET", "pos/session").then(function (res) {
      var s = res.session, set = res.settings || {};
      if (!s) { A.toast("De kassa is al gesloten."); return done && done(); }
      return A.askPin(set, "closeSession", knownPin).then(function (pin) {
        if (pin === null) return;
        var sm = s.summary;
        var count = set.cashControl !== false;
        var body = A.modal("Kassa sluiten",
          "<dl class='close-sum'>" +
            "<dt>Geopend</dt><dd>" + A.date(s.openedAt, true) + "</dd>" +
            "<dt>Aantal bonnen</dt><dd>" + sm.count + "</dd>" +
            "<dt>Omzet</dt><dd><strong>" + eu(sm.total) + "</strong></dd>" +
            Object.keys(sm.byMethod).map(function (m) { return "<dt>— " + e(A.PAYMENT[m] || m) + "</dt><dd>" + eu(sm.byMethod[m]) + "</dd>"; }).join("") +
            (sm.rounding ? "<dt>— Afronding contant</dt><dd>" + eu(sm.rounding) + "</dd>" : "") +
            "<dt>Beginsaldo kas</dt><dd>" + eu(s.openingCash) + "</dd>" +
            "<dt>Verwacht in de la</dt><dd><strong>" + eu(sm.expectedCash) + "</strong></dd>" +
          "</dl>" +
          (count ? "<label class='field'>Geteld in de kassalade (€)<input id='cl-count' inputmode='decimal' autofocus placeholder='0,00'></label><p class='change' id='cl-diff'></p>"
                 : "<p class='muted small'>Kastelling staat uit (Kassa-instellingen). De dienst wordt gesloten zonder telling.</p>") +
          "<label class='field'><span>Notitie <span class='muted'>(optioneel)</span></span><input id='cl-note' placeholder='Bijv. 20 euro afgeroomd'></label>" +
          "<div class='actions'><button class='btn' data-modal-close>Annuleren</button><button class='btn btn-primary btn-lg' id='cl-ok'" + (count ? " disabled" : "") + ">Kassa sluiten</button></div>",
          { narrow: true });
        var input = body.querySelector("#cl-count");
        var bigDiff = false;
        function upd() {
          var v = A.parseNum(input.value);
          var ok = v != null && v >= 0;
          var btn = body.querySelector("#cl-ok");
          btn.disabled = !ok;
          if (!ok) { body.querySelector("#cl-diff").textContent = ""; return; }
          var d = round(v - sm.expectedCash);
          bigDiff = set.maxCashDifference != null && Math.abs(d) > set.maxCashDifference + 0.001;
          btn.textContent = bigDiff ? "Toch sluiten" : "Kassa sluiten";
          body.querySelector("#cl-diff").innerHTML = Math.abs(d) < 0.005 ? "<span class='num-up'>Kas klopt ✓</span>" :
            "Verschil: <strong class='num-down'>" + (d > 0 ? "+" : "") + eu(d) + "</strong>" +
            (bigDiff ? "<br><small class='warn'>Groter dan " + eu(set.maxCashDifference) + ". Tel nog eens na, of noteer de reden.</small>" : "");
        }
        if (input) input.addEventListener("input", upd);
        body.querySelector("#cl-ok").addEventListener("click", function () {
          var btn = this;
          A.busy(btn, true);
          A.api("POST", "pos/session/close", { countedCash: input ? A.parseNum(input.value) : null, note: body.querySelector("#cl-note").value, managerPin: pin })
            .then(function (r) { A.closeModal(); showZReport(r.session); A.toast("Kassa gesloten"); if (done) done(); })
            .catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
        });
      });
    }).catch(function (err) { A.toast(err.message, "error"); });
  }

  A.register("kassa", { render: renderManage });

  // ================================================================ De kassa (#pos)

  var S, root, keyHandler, fsHandler;

  function freshTicket() { return { items: [], selected: null, discount: null, customer: null }; }
  function save() { try { localStorage.setItem("wwwPosTicket2", JSON.stringify(S.ticket)); } catch (x) {} }
  function restore() {
    try { var t = JSON.parse(localStorage.getItem("wwwPosTicket2") || "null"); if (t && Array.isArray(t.items)) return t; } catch (x) {}
    return freshTicket();
  }
  function byId(id) { return S.products.find(function (p) { return p.id === id; }); }
  function sellable(p) { return p.active !== false; }
  function totals() { return A.computeOrder(S.ticket.items, null, S.products, A.CONFIG, { pos: true, discount: S.ticket.discount }); }
  function line(id) { return S.ticket.items.find(function (i) { return i.id === id; }); }

  function renderPos(el) {
    document.body.classList.add("pos-mode");
    S = { settings: {}, pin: "", screen: "products", products: [], session: null, lastClosingCash: 0, type: "", q: "",
      ticket: restore(), pad: { mode: "qty", buffer: "" }, pay: { lines: [], selected: -1, buffer: "" }, lastOrder: null, scan: "", scanAt: 0, scanTimer: null };
    var cats = A.load("categories", true).catch(function () { return []; }); // tabel ontbreekt nog: indelen op soort
    return Promise.all([A.api("GET", "pos/session"), A.load("products", true), cats]).then(function (res) {
      S.categories = res[2] || [];
      S.session = res[0].session; S.lastClosingCash = res[0].suggestedOpeningCash != null ? res[0].suggestedOpeningCash : (res[0].lastClosingCash || 0); S.products = res[1];
      S.settings = res[0].settings || {};
      A.posSettings = S.settings;
      A.PAYMENT.overig = S.settings.otherLabel || "Anders";
      S.screen = S.session ? "products" : "open";
      el.innerHTML =
        "<div class='pos2'>" +
          "<header class='pos-top'>" +
            "<img src='/assets/logo-light.png' alt='worldwidewine.nl' class='pos-logo'>" +
            "<div class='pos-search'><input type='search' id='pos-q' placeholder='Zoek product of scan barcode…' autocomplete='off'></div>" +
            "<div class='pos-session' id='pos-session'></div>" +
            "<div class='pos-top-actions'>" +
              "<button class='top-btn' data-act='fullscreen' title='Volledig scherm (F11)'>⛶</button>" +
              "<button class='top-btn' data-act='close-session'>Kassa sluiten</button>" +
              "<button class='top-btn' data-act='exit'>← Admin</button>" +
            "</div>" +
          "</header>" +
          "<div class='pos-screen' id='pos-screen'></div>" +
        "</div>";
      root = el.querySelector(".pos2");
      root.addEventListener("click", onClick);
      root.querySelector("#pos-q").addEventListener("input", function () { S.q = this.value; drawGrid(); });
      root.querySelector("#pos-q").addEventListener("keydown", onSearchKey);
      keyHandler = onKey;
      document.addEventListener("keydown", keyHandler);
      fsHandler = function () { var b = root.querySelector("[data-act=fullscreen]"); if (b) b.classList.toggle("active", A.isFullscreen()); };
      document.addEventListener("fullscreenchange", fsHandler);
      fsHandler();
      draw();
      // Zonder kastelling opent de kassa direct.
      if (!S.session && S.settings.cashControl === false) autoOpen();
    });
  }

  function leavePos() {
    document.body.classList.remove("pos-mode");
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    if (fsHandler) document.removeEventListener("fullscreenchange", fsHandler);
    keyHandler = fsHandler = null;
  }

  function draw() {
    root.classList.toggle("no-session", !S.session);
    root.querySelector(".pos-search").style.visibility = S.screen === "products" ? "visible" : "hidden";
    root.querySelector("[data-act=close-session]").hidden = !S.session;
    root.querySelector("#pos-session").innerHTML = S.session
      ? "<span class='dot'></span>Dienst #" + S.session.id + " · sinds " + new Date(S.session.openedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
      : "<span class='dot off'></span>Kassa gesloten";
    var scr = root.querySelector("#pos-screen");
    if (S.screen === "open") scr.innerHTML = openScreen();
    else if (S.screen === "products") { scr.innerHTML = productScreen(); drawGrid(); drawTicket(); }
    else if (S.screen === "payment") { scr.innerHTML = paymentScreen(); drawPayment(); }
    else if (S.screen === "receipt") scr.innerHTML = receiptScreen();
    var f = scr.querySelector("[autofocus]");
    if (f) f.focus();
  }

  // ---------------------------------------------------------------- Kassa openen

  function openScreen() {
    return "<div class='pos-open'><div class='pos-open-card'>" +
      "<img src='/assets/logo.png' alt='worldwidewine.nl' class='pos-open-logo'>" +
      "<h1>Kassa openen</h1>" +
      (S.settings.cashControl === false
        ? "<p class='muted'>De kassa is gesloten.</p>"
        : "<p class='muted'>Tel het wisselgeld in de kassalade en vul het beginsaldo in.</p>" +
          "<label class='field'>Beginsaldo kassalade (€)<input id='open-cash' inputmode='decimal' value='" + String(Number(S.lastClosingCash || 0).toFixed(2)).replace(".", ",") + "' autofocus></label>") +
      "<button class='btn btn-primary btn-lg btn-block' data-act='open-session'>Kassa openen</button>" +
      "<button class='link' data-act='exit'>Terug naar de admin</button>" +
    "</div></div>";
  }

  function autoOpen() {
    A.api("POST", "pos/session/open", {}).then(function (r) { S.session = r.session; S.screen = "products"; draw(); })
      .catch(function (err) { A.toast(err.message, "error"); });
  }

  function doOpenSession(btn) {
    var inp = root.querySelector("#open-cash");
    var v = inp ? A.parseNum(inp.value) || 0 : 0;
    A.busy(btn, true);
    A.api("POST", "pos/session/open", { openingCash: v }).then(function (r) {
      S.session = r.session; S.screen = "products"; A.enterFullscreen(); draw(); A.toast("Kassa geopend");
    }).catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
  }

  // ---------------------------------------------------------------- Productscherm

  // Knoppen boven de producten: de categorieën uit Producten → Categorieën. Zijn er nog geen
  // categorieën, dan delen we in op soort (Rood, Wit, …).
  function filters() {
    var live = S.products.filter(sellable);
    if (S.categories && S.categories.length) {
      var list = S.categories.filter(function (c) { return live.some(function (p) { return p.categoryId === c.id; }); })
        .map(function (c) { return { key: "c" + c.id, label: c.name, color: c.color, test: function (p) { return p.categoryId === c.id; } }; });
      var known = {};
      S.categories.forEach(function (c) { known[c.id] = true; });
      if (live.some(function (p) { return !known[p.categoryId]; })) list.push({ key: "none", label: "Overig", test: function (p) { return !known[p.categoryId]; } });
      return list;
    }
    return Object.keys(A.TYPES).filter(function (t) { return live.some(function (p) { return p.type === t; }); })
      .map(function (t) { return { key: "t" + t, label: A.TYPES[t], test: function (p) { return p.type === t; } }; });
  }

  function productScreen() {
    var chips = filters();
    if (S.type && !chips.some(function (c) { return c.key === S.type; })) S.type = "";
    var tools = [
      { key: "qty", icon: "＋", label: "Aantal" },
      { key: "disc", icon: "%", label: "Korting", off: S.settings.allowDiscount === false },
      { key: "price", icon: "€", label: "Prijs", off: S.settings.allowPriceChange === false },
      { key: "C", icon: ICON.trash, label: "Verwijder", cls: " po-tool-del" }
    ];
    return "<div class='pos-main'>" +
      "<section class='pos-products'>" +
        "<div class='chips' id='pos-types'><button class='chip" + (!S.type ? " active" : "") + "' data-type=''>Alles</button>" +
          chips.map(function (c) {
            return "<button class='chip" + (S.type === c.key ? " active" : "") + "' data-type='" + e(c.key) + "'" + (c.color ? " style='--cc:" + c.color + "'" : "") + ">" +
              (c.color ? "<i class='chip-dot'></i>" : "") + e(c.label) + "</button>";
          }).join("") +
        "</div>" +
        "<div class='pp-grid size-" + (S.settings.cardSize || "normaal") + (S.settings.showImages === false ? " no-images" : "") + "' id='pp-grid'></div>" +
      "</section>" +
      "<section class='pos-order'>" +
        "<div class='po-body'>" +
          "<div class='po-ticket' id='po-lines'></div>" +
          "<nav class='po-tools'>" + tools.map(function (t) {
            return "<button class='po-tool" + (t.key !== "C" ? " np-mode" : "") + (t.cls || "") + "' data-key='" + t.key + "'" + (t.off ? " disabled title='Uitgezet in Kassa-instellingen'" : "") + ">" +
              "<span class='po-tool-icon'>" + t.icon + "</span>" + t.label + "</button>";
          }).join("") +
            "<button class='po-tool po-tool-sep' data-act='ticket-discount' id='po-tdisc'" + (S.settings.allowDiscount === false ? " disabled" : "") + "><span class='po-tool-icon'>" + ICON.tag + "</span>Bonkorting</button>" +
            "<button class='po-tool' data-act='clear'><span class='po-tool-icon'>" + ICON.receipt + "</span>Nieuwe bon</button>" +
          "</nav>" +
        "</div>" +
        "<div class='po-numpad' id='po-numpad' hidden></div>" +
        "<footer class='po-bar'>" +
          "<button class='po-bar-btn' data-act='customer' id='po-customer'></button>" +
          "<button class='po-pay' data-act='pay' id='po-pay'><span class='po-pay-label'>Betalen ›</span><strong id='po-pay-total'></strong></button>" +
        "</footer>" +
      "</section>" +
    "</div>";
  }

  function visible() {
    var q = S.q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    var chip = S.type && filters().find(function (c) { return c.key === S.type; });
    return S.products.filter(function (p) {
      if (!sellable(p)) return false;
      if (chip && !chip.test(p)) return false;
      if (!q) return true;
      var hay = [p.name, p.producer, p.region, p.country, p.grape, p.ean, p.vintage].join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) { return (a.producer + a.name).localeCompare(b.producer + b.name, "nl"); });
  }

  function drawGrid() {
    var grid = root && root.querySelector("#pp-grid");
    if (!grid) return;
    var list = visible();
    grid.innerHTML = list.length ? list.map(function (p) {
      var stock = S.settings.showStock !== false && typeof p.stock === "number" ? "<span class='pp-stock " + (p.stock <= 0 ? "out" : p.stock <= (p.minStock == null ? 6 : p.minStock) ? "low" : "") + "'>" + p.stock + "</span>" : "";
      return "<button class='pp-card' data-add='" + e(p.id) + "'>" +
        (S.settings.showImages === false
          ? "<span class='pp-noimg'><span class='pp-price'>" + (p.price == null ? "prijs?" : eu(p.price)) + "</span>" + stock + "</span>"
          : "<span class='pp-img'>" + A.productArt(p) + "<span class='pp-price'>" + (p.price == null ? "prijs?" : eu(p.price)) + "</span>" + stock + "</span>") +
        "<span class='pp-name'><small>" + e(p.producer) + "</small><span class='pp-title'>" + e(p.name) + "</span></span></button>";
    }).join("") : "<p class='empty-inline'>Geen producten gevonden.</p>";
  }

  function drawTicket() {
    var box = root.querySelector("#po-lines");
    if (!box) return;
    var t = totals();
    if (S.ticket.selected && !line(S.ticket.selected)) S.ticket.selected = S.ticket.items.length ? S.ticket.items[S.ticket.items.length - 1].id : null;
    var byLine = {};
    t.lines.forEach(function (l) { byLine[l.id] = l; });
    var vat = t.vat.reduce(function (s, v) { return s + v.vat; }, 0);
    var modeHint = { disc: "typ korting", price: "typ prijs" }[S.pad.mode];
    box.innerHTML = S.ticket.items.length
      ? S.ticket.items.map(function (it) {
          var p = byId(it.id), l = byLine[it.id];
          if (!p) return "";
          var sel = it.id === S.ticket.selected;
          var detail = "<b>" + it.qty + "</b> " + e(p.unit || "stuk") + " à " + (l ? eu(l.price) : "<em>prijs invoeren</em>") +
            (l && l.listPrice != null ? " <s>" + eu(l.listPrice) + "</s>" : "") +
            (it.discount ? " · <span class='po-disc'>−" + String(it.discount).replace(".", ",") + "% korting</span>" : "");
          return "<div class='po-line" + (sel ? " selected" : "") + "' data-line='" + e(it.id) + "'>" +
            "<div class='po-line-main'><span class='po-name'>" + e(A.productName(p)) + "</span><strong>" + (l ? eu(l.total) : "—") + "</strong></div>" +
            "<div class='po-line-sub'>" + detail + (sel && modeHint && S.pad.open ? " <span class='po-mode-hint'>" + modeHint + "</span>" : "") + "</div></div>";
        }).join("") +
        "<div class='po-sum'>" +
          (t.errors.length ? "<p class='po-warn'>" + t.errors.map(e).join("<br>") + "</p>" : "") +
          (t.warnings.length ? "<p class='po-warn'>⚠ " + t.warnings.map(e).join("<br>⚠ ") + "</p>" : "") +
          (t.discount ? "<div class='po-sum-row'>Bonkorting" + (S.ticket.discount.type === "percent" ? " " + S.ticket.discount.value + "%" : "") + ": − " + eu(t.discount) + "</div>" : "") +
          "<div class='po-sum-total'>Totaal: " + eu(t.total) + "</div>" +
          "<div class='po-sum-row'>Btw: " + eu(vat) + "</div>" +
        "</div>"
      : "<div class='po-empty'><span>🛒</span>Tik op een product of scan een barcode</div>";
    var sel = box.querySelector(".selected");
    if (sel) sel.scrollIntoView({ block: "nearest" });

    root.querySelector("#po-pay-total").textContent = eu(t.total);
    root.querySelector("#po-pay").disabled = !t.lines.length || t.errors.length > 0;
    var c = S.ticket.customer;
    root.querySelector("#po-customer").innerHTML = "<span class='po-bar-icon'>" + ICON.user + "</span><span class='po-bar-label'>" + (c ? e(c.name || c.email) : "Klant") + "</span>";
    root.querySelector("#po-customer").classList.toggle("active", !!c);
    root.querySelector("#po-tdisc").classList.toggle("active", !!S.ticket.discount);
    root.querySelectorAll(".np-mode").forEach(function (b) { b.classList.toggle("active", !!S.pad.open && b.dataset.key === S.pad.mode); });
    drawPad();
  }

  // Toetsenblok als pop-up naast de bon: verschijnt pas als je op een regel (of Aantal/Korting/Prijs) tikt.
  var PAD_MODES = [
    { key: "qty", label: "Aantal" },
    { key: "disc", label: "Korting", off: function () { return S.settings.allowDiscount === false; } },
    { key: "price", label: "Prijs", off: function () { return S.settings.allowPriceChange === false; } }
  ];

  function openPad(mode) {
    if (!line(S.ticket.selected)) return;
    S.pad.open = true; S.pad.buffer = "";
    if (mode) S.pad.mode = mode;
    drawTicket();
  }

  function closePad() {
    if (!S.pad.open) return;
    S.pad.open = false; S.pad.buffer = ""; S.pad.mode = "qty";
    drawTicket();
  }

  function drawPad() {
    var box = root.querySelector("#po-numpad");
    if (!box) return;
    var it = line(S.ticket.selected), p = it && byId(it.id);
    if (!S.pad.open || !p) { S.pad.open = false; box.hidden = true; box.innerHTML = ""; return; }
    var cur = S.pad.mode === "qty" ? String(it.qty)
      : S.pad.mode === "disc" ? (it.discount ? String(it.discount).replace(".", ",") : "0")
      : it.price != null ? String(it.price).replace(".", ",") : p.price != null ? String(p.price).replace(".", ",") : "";
    var unit = { qty: "", disc: " %", price: "" }[S.pad.mode];
    var pre = S.pad.mode === "price" ? "€ " : "";
    var key = function (k, label, cls) { return "<button class='nk" + (cls || "") + "' data-key='" + k + "'>" + label + "</button>"; };
    box.hidden = false;
    box.innerHTML =
      "<div class='nk-head'>" +
        "<div class='nk-modes'>" + PAD_MODES.map(function (m) {
          var off = m.off && m.off();
          return "<button class='nk-mode" + (S.pad.mode === m.key ? " active" : "") + "' data-key='" + m.key + "'" + (off ? " disabled" : "") + ">" + m.label + "</button>";
        }).join("") + "</div>" +
        "<div class='nk-name'>" + e(A.productName(p)) + "</div>" +
        "<div class='nk-value" + (S.pad.buffer ? "" : " is-current") + "'>" + pre + e(S.pad.buffer || cur) + unit + "</div>" +
      "</div>" +
      "<div class='nk-keys'>" +
        key("1", "1") + key("2", "2") + key("3", "3") + key("back", "⌫", " nk-back") +
        key("4", "4") + key("5", "5") + key("6", "6") + key(",", ",", S.pad.mode === "qty" ? " nk-off" : "") +
        key("7", "7") + key("8", "8") + key("9", "9") + "<button class='nk nk-ok' data-act='pad-ok'>OK</button>" +
        key("clr", "Wis", " nk-clr") + key("0", "0") + key("00", "00") +
      "</div>";
  }

  function addProduct(id) {
    var p = byId(id);
    if (!p || !sellable(p)) return;
    var it = line(id);
    if (it) it.qty += 1; else S.ticket.items.push(it = { id: id, qty: 1 });
    S.ticket.selected = id;
    S.pad.buffer = "";
    S.pad.mode = p.price == null && it.price == null ? "price" : "qty";
    S.pad.open = S.pad.mode === "price"; // zonder prijs meteen het toetsenblok tonen
    save(); drawTicket();
    var card = root.querySelector("[data-add='" + CSS.escape(id) + "']");
    if (card) { card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash"); }
  }

  function applyBuffer() {
    var it = line(S.ticket.selected);
    if (!it) return;
    var b = S.pad.buffer;
    var v = b === "" ? null : Number(b.replace(",", "."));
    if (S.pad.mode === "qty") {
      if (v === null || v < 1) { S.pad.buffer = ""; return removeSelected(); }
      else it.qty = Math.min(999, Math.floor(v));
    } else if (S.pad.mode === "disc") {
      var max = S.settings.maxDiscount == null ? 100 : S.settings.maxDiscount;
      if (v === null || !v) delete it.discount;
      else if (v > max) { S.pad.buffer = S.pad.buffer.slice(0, -1); A.toast("Maximale korting is " + max + "%.", "error"); return; }
      else it.discount = v;
    } else if (S.pad.mode === "price") {
      if (v === null) delete it.price; else it.price = v;
    }
    save(); drawTicket();
  }

  // Handeling vrijgeven met de beheerderspincode (één keer per bon).
  function unlock(action) {
    if (S.unlocked && S.unlocked[action]) return Promise.resolve(true);
    return A.askPin(S.settings, action, "").then(function (pin) {
      if (pin === null) return false;
      if (pin) { S.pin = pin; S.unlocked = S.unlocked || {}; S.unlocked[action] = true; }
      return true;
    });
  }

  function removeSelected() {
    return unlock("deleteLine").then(function (ok) {
      if (!ok) return;
      S.ticket.items = S.ticket.items.filter(function (x) { return x.id !== S.ticket.selected; });
      S.ticket.selected = null; S.pad.buffer = ""; S.pad.mode = "qty"; S.pad.open = false;
      save(); drawTicket();
    });
  }

  function padKey(k) {
    if (S.screen === "payment") return payKey(k);
    if (S.screen !== "products") return;
    if (k === "qty" || k === "disc" || k === "price") {
      if (k === "price" && S.settings.allowPriceChange === false) return A.toast("Prijs wijzigen staat uit in de Kassa-instellingen.", "error");
      if (k === "disc" && S.settings.allowDiscount === false) return A.toast("Korting geven staat uit in de Kassa-instellingen.", "error");
      var action = k === "price" ? "priceChange" : k === "disc" ? "discount" : null;
      if (!line(S.ticket.selected)) return A.toast("Kies eerst een regel op de bon.");
      if (!action) return openPad(k);
      return unlock(action).then(function (ok) { if (ok) openPad(k); });
    }
    if (!line(S.ticket.selected)) return;
    if (k === "C") return removeSelected();
    if (k === "clr") { S.pad.buffer = ""; return drawPad(); }
    if (k === "00") { padKey("0"); return padKey("0"); }
    if (k === "back") {
      if (!S.pad.buffer) { // lege invoer: terug naar standaard / regel weg
        S.pad.buffer = "";
      } else S.pad.buffer = S.pad.buffer.slice(0, -1);
      return applyBuffer();
    }
    if (k === ",") { if (S.pad.mode === "qty" || S.pad.buffer.indexOf(",") >= 0) return; S.pad.buffer = (S.pad.buffer || "0") + ","; return applyBuffer(); }
    if (/^\d$/.test(k)) {
      if (S.pad.buffer.length >= 7) return;
      var dec = S.pad.buffer.split(",")[1];
      if (dec && dec.length >= 2) return;
      S.pad.buffer += k;
      applyBuffer();
    }
  }

  // ---------------------------------------------------------------- Betaalscherm

  function goPay() {
    var t = totals();
    if (!t.lines.length || t.errors.length) return;
    S.screen = "payment"; S.pad.open = false;
    S.pay = { lines: [], selected: -1, buffer: "" };
    draw();
  }

  function paymentScreen() {
    var t = totals();
    return "<div class='pay2'>" +
      "<section class='pay-methods'>" +
        "<h2>Betaalwijze</h2>" +
        methods().map(function (m) { return "<button class='pm-btn pm-" + m.key + "' data-method='" + m.key + "'><span>" + m.icon + "</span>" + e(m.label) + "</button>"; }).join("") +
        "<div class='pay-lines' id='pay-lines'></div>" +
      "</section>" +
      "<section class='pay-center'>" +
        "<div class='pay-due'><span>Te betalen</span><strong>" + eu(t.total) + "</strong></div>" +
        "<div class='pay-status' id='pay-status'></div>" +
        "<div class='quick-pay'>" +
          "<button class='qp-btn' data-key='exact'>Gepast</button>" +
          (S.settings.methods && S.settings.methods.contant === false ? "" : (S.settings.quickCash || [10, 20, 50]).map(function (v) { return "<button class='qp-btn' data-key='+" + v + "'>€ " + String(v).replace(".", ",") + "</button>"; }).join("")) +
        "</div>" +
        "<div class='numpad numpad-pay'>" +
          ["1", "2", "3", "back", "4", "5", "6", "C", "7", "8", "9", "00", "0", ","].map(function (k) {
            return "<button class='np-key" + (k === "back" ? " np-back" : "") + (k === "0" || k === "," ? " np-wide" : "") + "' data-key='" + k + "'>" + (k === "back" ? "⌫" : k === "C" ? "Wis" : k) + "</button>";
          }).join("") +
        "</div>" +
        "<div class='pay-actions'>" +
          "<button class='btn btn-lg' data-act='back'>← Terug</button>" +
          "<button class='btn btn-primary btn-lg pay-validate' data-act='validate' id='pay-validate'>Valideren</button>" +
        "</div>" +
        "<p class='muted small center'>" + (S.ticket.customer ? "Klant: " + e(S.ticket.customer.name || S.ticket.customer.email) : "Geen klant gekoppeld") + "</p>" +
      "</section>" +
    "</div>";
  }

  function methods() {
    var on = S.settings.methods || { pin: true, contant: true, tikkie: true };
    return METHODS.concat([{ key: "overig", label: S.settings.otherLabel || "Anders", icon: "★" }])
      .filter(function (m) { return on[m.key]; })
      .map(function (m) { return m.key === "overig" ? m : Object.assign({}, m, { label: A.PAYMENT[m.key] || m.label }); });
  }

  // Zelfde berekening als op de server (incl. afronden van contant op 5 cent).
  function payState() {
    var t = totals();
    var sum = function (f) { return round(S.pay.lines.filter(f).reduce(function (s, l) { return s + (l.amount || 0); }, 0)); };
    var nonCash = sum(function (l) { return l.method !== "contant"; });
    var cashGiven = sum(function (l) { return l.method === "contant"; });
    var hasCash = S.pay.lines.some(function (l) { return l.method === "contant"; });
    var cashPart = round(t.total - nonCash);
    var cashDue = S.settings.roundCash && hasCash ? round(Math.round(cashPart * 20) / 20) : cashPart;
    var paid = round(nonCash + cashGiven);
    var remaining = hasCash ? round(cashDue - cashGiven) : round(t.total - nonCash);
    var change = hasCash && cashGiven > cashDue ? round(cashGiven - cashDue) : (!hasCash && nonCash > t.total ? round(nonCash - t.total) : 0);
    var tooMuchCard = nonCash > t.total + 0.001;
    var ok = S.pay.lines.length > 0 && remaining <= 0.001 && !tooMuchCard;
    return { total: t.total, paid: paid, remaining: remaining, change: change, ok: ok, tooMuchCard: tooMuchCard,
      rounding: hasCash ? round(cashDue - cashPart) : 0, cashDue: cashDue };
  }

  function drawPayment() {
    var st = payState();
    root.querySelector("#pay-lines").innerHTML = S.pay.lines.map(function (l, i) {
      return "<div class='pay-line" + (i === S.pay.selected ? " selected" : "") + "' data-pline='" + i + "'>" +
        "<span>" + e(A.PAYMENT[l.method]) + "</span><strong>" + eu(l.amount || 0) + "</strong>" +
        "<button class='pl-del' data-pdel='" + i + "' aria-label='Verwijderen'>×</button></div>";
    }).join("") || "<p class='muted small'>Kies hierboven hoe de klant betaalt. Gesplitst betalen kan ook.</p>";
    root.querySelector("#pay-status").innerHTML =
      (st.rounding ? "<div class='ps-row muted'><span>Afronding contant</span><span>" + (st.rounding > 0 ? "+ " : "− ") + eu(Math.abs(st.rounding)) + "</span></div>" : "") +
      "<div class='ps-row'><span>Betaald</span><strong>" + eu(st.paid) + "</strong></div>" +
      (st.remaining > 0.004 ? "<div class='ps-row ps-remaining'><span>Nog te betalen</span><strong>" + eu(st.remaining) + "</strong></div>" : "") +
      (st.change > 0.004 ? "<div class='ps-row ps-change'><span>" + (st.tooMuchCard ? "Te veel (alleen contant kan wisselgeld)" : "Wisselgeld") + "</span><strong>" + eu(st.change) + "</strong></div>" : "");
    root.querySelector("#pay-validate").disabled = !st.ok;
  }

  function addPayment(method) {
    var st = payState();
    var amount = st.remaining > 0 ? st.remaining : 0;
    if (method === "contant" && S.settings.roundCash) amount = round(Math.round(amount * 20) / 20);
    var existing = S.pay.lines.findIndex(function (l) { return l.method === method; });
    if (existing >= 0) { S.pay.selected = existing; }
    else { S.pay.lines.push({ method: method, amount: amount }); S.pay.selected = S.pay.lines.length - 1; }
    S.pay.buffer = "";
    drawPayment();
  }

  function payKey(k) {
    var l = S.pay.lines[S.pay.selected];
    if (!l) {
      var first = methods()[0];
      if (!first) return;
      if (/^\d$/.test(k) || k === "exact" || k.charAt(0) === "+") { addPayment(methods().some(function (m) { return m.key === "contant"; }) ? "contant" : first.key); l = S.pay.lines[S.pay.selected]; } else return;
    }
    if (k === "exact") {
      // Gepast: precies het resterende bedrag op de geselecteerde betaalregel
      var rest = round(payState().remaining + (l.amount || 0));
      if (l.method === "contant" && S.settings.roundCash) rest = round(Math.round(rest * 20) / 20);
      l.amount = Math.max(0, rest); S.pay.buffer = ""; return drawPayment();
    }
    if (k === "00") { if (!S.pay.buffer || S.pay.buffer.indexOf(",") >= 0) return; S.pay.buffer += "00"; l.amount = round(Number(S.pay.buffer)); return drawPayment(); }
    // +10/+20/+50: eerste druk = "klant geeft een briefje van …", daarna optellen
    if (k.charAt(0) === "+") { l.amount = round((S.pay.buffer ? l.amount : 0) + Number(k.slice(1))); S.pay.buffer = String(l.amount).replace(".", ","); return drawPayment(); }
    if (k === "C") { S.pay.buffer = ""; l.amount = 0; return drawPayment(); }
    if (k === "back") S.pay.buffer = S.pay.buffer.slice(0, -1);
    else if (k === ",") { if (S.pay.buffer.indexOf(",") >= 0) return; S.pay.buffer = (S.pay.buffer || "0") + ","; }
    else if (/^\d$/.test(k)) {
      var dec = S.pay.buffer.split(",")[1];
      if ((dec && dec.length >= 2) || S.pay.buffer.length >= 8) return;
      S.pay.buffer += k;
    }
    l.amount = S.pay.buffer ? round(Number(S.pay.buffer.replace(",", "."))) : 0;
    drawPayment();
  }

  function validate(btn) {
    var st = payState();
    if (!st.ok) return;
    A.busy(btn, true, "Bezig…");
    A.api("POST", "pos", {
      items: S.ticket.items, discount: S.ticket.discount, customerId: S.ticket.customer && S.ticket.customer.id, managerPin: S.pin || undefined,
      payments: S.pay.lines.map(function (l) { return { method: l.method, amount: l.amount }; })
    }).then(function (res) {
      S.lastOrder = res.order;
      S.ticket = freshTicket(); save();
      S.unlocked = {}; S.pin = "";
      S.screen = "receipt"; draw();
      if (S.settings.autoPrint) A.printReceipt(res.order);
      A.invalidate("products", "orders", "customers");
      A.load("products", true).then(function (list) { S.products = list; });
    }).catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
  }

  // ---------------------------------------------------------------- Bonscherm

  function receiptScreen() {
    var o = S.lastOrder;
    return "<div class='rc2'>" +
      "<div class='rc-left'>" +
        "<div class='rc-done'>✓</div><h1>Betaald</h1><p class='rc-total'>" + eu(o.total) + "</p>" +
        (o.cash && o.cash.change > 0 ? "<p class='rc-change'>Wisselgeld <strong>" + eu(o.cash.change) + "</strong></p>" : "") +
        "<div class='rc-actions'>" +
          "<button class='btn btn-lg' data-act='print'>🖨 Bon afdrukken</button>" +
          "<button class='btn btn-primary btn-lg' data-act='new' autofocus>Nieuwe bestelling →</button>" +
        "</div>" +
      "</div>" +
      "<div class='rc-right'><div class='receipt-preview'>" + A.receiptHtml(o) + "</div></div>" +
    "</div>";
  }

  // ---------------------------------------------------------------- Klant en bonkorting

  function customerDialog() {
    A.load("customers").then(function (list) {
      var body = A.modal("Klant koppelen", "<input type='search' id='cust-q' placeholder='Zoek op naam, e-mail of telefoon' autofocus>" +
        "<div class='pick-list' id='cust-list'></div>" +
        (S.ticket.customer ? "<button class='btn btn-block' id='cust-none'>Geen klant</button>" : "") +
        "<p class='muted small'>Nieuwe klant? Voeg die toe onder Klanten in de admin.</p>", { narrow: true });
      var q = body.querySelector("#cust-q");
      function drawList() {
        var v = q.value.toLowerCase();
        var hits = list.filter(function (c) { return !v || [c.name, c.email, c.phone, c.company].join(" ").toLowerCase().indexOf(v) >= 0; }).slice(0, 30);
        body.querySelector("#cust-list").innerHTML = hits.map(function (c) {
          return "<button class='pick' data-id='" + e(c.id) + "'><strong>" + e(c.name || c.email) + "</strong><span class='muted small'>" + e([c.email, c.phone].filter(Boolean).join(" · ")) + "</span></button>";
        }).join("") || "<p class='empty-inline'>Geen klanten gevonden.</p>";
      }
      q.addEventListener("input", drawList); drawList();
      body.addEventListener("click", function (ev) {
        if (ev.target.closest("#cust-none")) { S.ticket.customer = null; save(); drawTicket(); return A.closeModal(); }
        var b = ev.target.closest(".pick");
        if (!b) return;
        var c = list.find(function (x) { return x.id === b.dataset.id; });
        S.ticket.customer = { id: c.id, name: c.name, email: c.email };
        save(); drawTicket(); A.closeModal();
      });
    });
  }

  function ticketDiscountDialog() {
    if (S.settings.allowDiscount === false) return A.toast("Korting geven staat uit in de Kassa-instellingen.", "error");
    unlock("discount").then(function (ok) { if (ok) ticketDiscountForm(); });
  }

  function ticketDiscountForm() {
    var d = S.ticket.discount || { type: "percent", value: "" };
    var body = A.modal("Korting op de hele bon", "<form id='disc-form'>" +
      "<div class='seg'><label><input type='radio' name='type' value='percent'" + (d.type === "percent" ? " checked" : "") + "> Percentage</label>" +
      "<label><input type='radio' name='type' value='amount'" + (d.type === "amount" ? " checked" : "") + "> Bedrag (€)</label></div>" +
      "<label class='field'>Korting<input name='value' inputmode='decimal' value='" + e(d.value) + "' autofocus></label>" +
      "<div class='quick'>" + [5, 10, 15, 20].map(function (n) { return "<button type='button' class='btn' data-pct='" + n + "'>" + n + "%</button>"; }).join("") + "</div>" +
      "<div class='actions'><button type='button' class='btn' id='disc-remove'>Geen korting</button><button class='btn btn-primary'>Toepassen</button></div></form>", { narrow: true });
    var form = body.querySelector("form");
    body.querySelectorAll("[data-pct]").forEach(function (b) { b.addEventListener("click", function () { form.type.value = "percent"; form.value.value = b.dataset.pct; }); });
    body.querySelector("#disc-remove").addEventListener("click", function () { S.ticket.discount = null; save(); drawTicket(); A.closeModal(); });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = A.parseNum(form.value.value);
      var max = S.settings.maxDiscount == null ? 100 : S.settings.maxDiscount;
      var t = totals();
      var pct = form.type.value === "percent" ? v : (t.subtotal > 0 ? v / t.subtotal * 100 : 0);
      if (v > 0 && pct > max + 0.001) return A.toast("Maximale korting is " + max + "%.", "error");
      S.ticket.discount = v > 0 ? { type: form.type.value, value: v } : null;
      save(); drawTicket(); A.closeModal();
    });
  }

  // ---------------------------------------------------------------- Invoer

  function onClick(ev) {
    // Tik buiten het toetsenblok: toetsenblok dicht.
    if (S.pad && S.pad.open && !ev.target.closest(".po-numpad, .po-line, .np-mode")) closePad();
    var t = ev.target.closest("[data-act],[data-key],[data-add],[data-line],[data-type],[data-method],[data-pline],[data-pdel]");
    if (!t) return;
    if (t.dataset.add) return addProduct(t.dataset.add);
    if (t.dataset.key) return padKey(t.dataset.key);
    if (t.dataset.line) { S.ticket.selected = t.dataset.line; return openPad("qty"); }
    if (t.dataset.type !== undefined && t.classList.contains("chip")) {
      S.type = t.dataset.type;
      root.querySelectorAll("#pos-types .chip").forEach(function (c) { c.classList.toggle("active", c === t); });
      return drawGrid();
    }
    if (t.dataset.method) return addPayment(t.dataset.method);
    if (t.dataset.pdel) { ev.stopPropagation(); S.pay.lines.splice(Number(t.dataset.pdel), 1); S.pay.selected = S.pay.lines.length - 1; S.pay.buffer = ""; return drawPayment(); }
    if (t.dataset.pline) { S.pay.selected = Number(t.dataset.pline); S.pay.buffer = ""; return drawPayment(); }
    switch (t.dataset.act) {
      case "fullscreen": return A.isFullscreen() ? A.exitFullscreen() : A.enterFullscreen();
      case "exit":
        return A.askPin(S.settings, "exitPos", "").then(function (pin) {
          if (pin === null) return;
          A.exitFullscreen(); location.hash = "#kassa";
        });
      case "close-session":
        if (S.ticket.items.length) return A.toast("Reken eerst de open bon af of maak hem leeg.", "error");
        return closeDialog(function () {
          S.session = null; S.screen = "open";
          A.api("GET", "pos/session").then(function (r) {
            S.lastClosingCash = r.suggestedOpeningCash != null ? r.suggestedOpeningCash : (r.lastClosingCash || 0);
            draw();
          });
        });
      case "open-session": return doOpenSession(t);
      case "pad-ok": return closePad();
      case "pay": return goPay();
      case "back": S.screen = "products"; return draw();
      case "validate": return validate(t);
      case "print": return A.printReceipt(S.lastOrder);
      case "new": S.screen = "products"; S.q = ""; root.querySelector("#pos-q").value = ""; return draw();
      case "customer": return customerDialog();
      case "ticket-discount": return ticketDiscountDialog();
      case "clear":
        if (!S.ticket.items.length) return;
        return A.confirm("Nieuwe bon?", "De huidige bon wordt leeggemaakt.", "Leegmaken", true).then(function (ok) {
          if (ok) { S.ticket = freshTicket(); save(); drawTicket(); }
        });
    }
  }

  function findByCode(code) {
    return S.products.find(function (p) { return p.ean && p.ean === code && sellable(p); });
  }

  function onSearchKey(ev) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    var v = this.value.trim();
    if (!v) return;
    var hit = findByCode(v);
    var list = visible();
    if (!hit && list.length === 1) hit = list[0];
    if (hit) { addProduct(hit.id); this.value = ""; S.q = ""; drawGrid(); }
    else A.toast(/^\d{6,14}$/.test(v) ? "Barcode " + v + " is niet gekoppeld aan een product." : "Kies een product uit de lijst.", "error");
  }

  // Toetsenbord: cijfers gaan naar het toetsenblok. Een barcodescanner typt heel snel
  // een reeks cijfers gevolgd door Enter; die wordt als barcode herkend.
  function onKey(ev) {
    if (!document.getElementById("modal").hidden) return;
    var tag = (ev.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var now = Date.now();
    if (/^[0-9]$/.test(ev.key)) {
      ev.preventDefault();
      clearTimeout(S.scanTimer);
      if (now - S.scanAt > 60 && S.scan) { var prev = S.scan; S.scan = ""; prev.split("").forEach(function (k) { padKey(k); }); }
      S.scan += ev.key; S.scanAt = now;
      var buffered = S.scan;
      S.scanTimer = setTimeout(function () {
        // Geen Enter binnen korte tijd: het was gewoon typen.
        buffered.split("").forEach(function (k) { padKey(k); });
        S.scan = "";
      }, 70);
      return;
    }
    if (ev.key === "Enter") {
      if (S.scan.length >= 6 && now - S.scanAt < 100) {
        ev.preventDefault();
        clearTimeout(S.scanTimer);
        var code = S.scan; S.scan = "";
        if (S.screen !== "products") return;
        var p = findByCode(code);
        if (p) addProduct(p.id); else A.toast("Barcode " + code + " is niet gekoppeld aan een product.", "error");
        return;
      }
      ev.preventDefault();
      if (S.screen === "products" && S.pad.open) closePad();
      else if (S.screen === "products") goPay();
      else if (S.screen === "payment") { var b = root.querySelector("#pay-validate"); if (b && !b.disabled) validate(b); }
      else if (S.screen === "receipt") { S.screen = "products"; draw(); }
      else if (S.screen === "open") { var o = root.querySelector("[data-act=open-session]"); if (o) doOpenSession(o); }
      return;
    }
    if (ev.key === "Backspace") { ev.preventDefault(); return padKey("back"); }
    if (ev.key === "," || ev.key === ".") { ev.preventDefault(); return padKey(","); }
    if (ev.key === "Delete") { ev.preventDefault(); return padKey("C"); }
    if (ev.key === "Escape" && S.pad.open) return closePad();
    if (ev.key === "Escape" && S.screen === "payment") { S.screen = "products"; return draw(); }
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      if (S.screen !== "products" || !S.ticket.items.length) return;
      ev.preventDefault();
      var i = S.ticket.items.findIndex(function (x) { return x.id === S.ticket.selected; });
      i = Math.max(0, Math.min(S.ticket.items.length - 1, i + (ev.key === "ArrowUp" ? -1 : 1)));
      S.ticket.selected = S.ticket.items[i].id; S.pad.buffer = ""; if (!S.pad.open) S.pad.mode = "qty"; drawTicket();
    }
  }

  A.register("pos", { render: renderPos, leave: leavePos });
})();

/* ---------------------------------------------------------------- Kassabon en kassarapport (gedeeld) */

A.receiptHead = function (set) {
  var extra = set && set.receiptHeader ? "<p class='r-center r-pre'>" + A.esc(set.receiptHeader) + "</p>" : "";
  return "<p class='r-center r-shop'>worldwidewine.nl</p><p class='r-center r-tag'>DRANKEN EN CULINAIRE PROJECTEN</p>" +
    "<p class='r-center'>Westzijde 358, 1506 GK Zaandam<br>06 83 17 27 04 · info@worldwidewine.nl<br>KvK 32134785</p>" + extra;
};

// set: kassa-instellingen (kop/voettekst, btw en klant tonen). Zonder set: de laatst geladen instellingen.
A.receiptHtml = function (o, set) {
  set = set || A.posSettings || {};
  var e = A.esc, eu = A.euro;
  var label = function (m) { return m === "overig" ? (set.otherLabel || A.PAYMENT.overig || "Anders") : (A.PAYMENT[m] || m); };
  var payments = o.payments && o.payments.length ? o.payments : [{ method: o.paymentMethod, amount: o.total }];
  var footer = set.receiptFooter != null ? set.receiptFooter : "Bedankt en proost!\nGeen 18, geen alcohol.";
  return "<div class='receipt'>" + A.receiptHead(set) +
    "<p class='r-center'>" + A.date(o.createdAt, true) + "<br>Bon " + e(o.number) + "</p><hr>" +
    o.lines.map(function (l) {
      var gross = Math.round(l.price * l.qty * 100) / 100;
      return "<div class='r-line'><span>" + l.qty + " × " + e(l.name) + "</span><span>" + eu(l.discount ? gross : l.total) + "</span></div>" +
        (l.qty > 1 || l.listPrice != null ? "<div class='r-sub'>à " + eu(l.price) + (l.listPrice != null ? " (normaal " + eu(l.listPrice) + ")" : "") + "</div>" : "") +
        (l.discount ? "<div class='r-line r-sub'><span>korting " + String(l.discount).replace(".", ",") + "%</span><span>− " + eu(gross - l.total) + "</span></div>" : "");
    }).join("") + "<hr>" +
    (o.discount ? "<div class='r-line'><span>Subtotaal</span><span>" + eu(o.subtotal) + "</span></div><div class='r-line'><span>Korting op bon</span><span>− " + eu(o.discount) + "</span></div>" : "") +
    (o.shipping ? "<div class='r-line'><span>Verzending</span><span>" + eu(o.shipping) + "</span></div>" : "") +
    "<div class='r-line r-total'><span>TOTAAL</span><span>" + eu(o.total) + "</span></div>" +
    (o.cash && o.cash.rounding ? "<div class='r-line'><span>Afronding contant</span><span>" + eu(o.cash.rounding) + "</span></div>" : "") +
    payments.map(function (pm) {
      var shown = pm.method === "contant" && o.cash ? o.cash.received : pm.amount;
      return "<div class='r-line'><span>" + e(label(pm.method)) + "</span><span>" + eu(shown) + "</span></div>";
    }).join("") +
    (o.cash && o.cash.change ? "<div class='r-line'><span>Wisselgeld</span><span>" + eu(o.cash.change) + "</span></div>" : "") +
    (set.receiptShowVat !== false ? "<hr><div class='r-line r-small'><span>Btw</span><span>over</span><span>btw</span></div>" +
      (o.vat || []).map(function (v) { return "<div class='r-line r-small'><span>" + v.rate + "%</span><span>" + eu(v.gross - v.vat) + "</span><span>" + eu(v.vat) + "</span></div>"; }).join("") : "") +
    (set.receiptShowCustomer !== false && o.customer && o.customer.name ? "<hr><p class='r-center'>Klant: " + e(o.customer.name) + "</p>" : "") +
    (footer ? "<hr><p class='r-center r-pre'>" + e(footer) + "</p>" : "") + "</div>";
};

A.zReportHtml = function (s) {
  var e = A.esc, eu = A.euro, sm = s.summary || {};
  var set = A.posSettings || {};
  var label = function (m) { return m === "overig" ? (set.otherLabel || "Anders") : (A.PAYMENT[m] || m); };
  var row = function (a, b, cls) { return "<div class='r-line" + (cls ? " " + cls : "") + "'><span>" + a + "</span><span>" + b + "</span></div>"; };
  return "<div class='receipt'>" + A.receiptHead() +
    "<p class='r-center r-shop'>KASSARAPPORT (Z)</p><p class='r-center'>Dienst #" + s.id + "</p><hr>" +
    row("Geopend", A.date(s.openedAt, true)) + row("Gesloten", s.closedAt ? A.date(s.closedAt, true) : "nog open") + "<hr>" +
    row("Aantal bonnen", sm.count || 0) +
    row("Omzet", eu(sm.total || 0), "r-total") +
    Object.keys(sm.byMethod || {}).map(function (m) { return row("  " + e(label(m)), eu(sm.byMethod[m])); }).join("") +
    (sm.rounding ? row("  Afronding contant", eu(sm.rounding)) : "") +
    (sm.discount ? row("Gegeven korting", eu(sm.discount)) : "") + "<hr>" +
    "<div class='r-line r-small'><span>Btw</span><span>over</span><span>btw</span></div>" +
    (sm.vat || []).map(function (v) { return "<div class='r-line r-small'><span>" + v.rate + "%</span><span>" + eu(v.gross - v.vat) + "</span><span>" + eu(v.vat) + "</span></div>"; }).join("") + "<hr>" +
    row("Beginsaldo kas", eu(s.openingCash)) +
    row("Contante verkopen", eu((sm.byMethod && sm.byMethod.contant) || 0)) +
    row("Verwacht in de la", eu(s.expectedCash != null ? s.expectedCash : sm.expectedCash || 0)) +
    (s.countedCash != null ? row("Geteld", eu(s.countedCash)) + row("Verschil", (s.difference > 0 ? "+" : "") + eu(s.difference), "r-total")
      : (s.status === "gesloten" ? row("Kastelling", "uit") : "")) +
    (s.note ? "<hr><p>" + e(s.note) + "</p>" : "") + "</div>";
};

A.printReceipt = function (o) { A.printHtml(A.receiptHtml(o)); };
