/* Kassa voor de winkel: producten zoeken of scannen, afrekenen, bon afdrukken. */
(function () {
  var e = A.esc, eu = A.euro;
  var ticket = { items: [], discount: null, customer: null };
  var products = [];
  var filterType = "";
  var root;

  function save() { try { localStorage.setItem("wwwPosTicket", JSON.stringify(ticket)); } catch (x) {} }
  function restore() {
    try { var t = JSON.parse(localStorage.getItem("wwwPosTicket") || "null"); if (t && Array.isArray(t.items)) ticket = t; } catch (x) {}
  }

  function byId(id) { return products.find(function (p) { return p.id === id; }); }
  function sellable(p) { return p.active !== false && p.price != null; }

  function totals() {
    return A.computeOrder(ticket.items, null, products, A.CONFIG, { pos: true, discount: ticket.discount });
  }

  function add(id, qty) {
    var p = byId(id);
    if (!p || !sellable(p)) return;
    var line = ticket.items.find(function (i) { return i.id === id; });
    if (line) line.qty += qty || 1; else ticket.items.push({ id: id, qty: qty || 1 });
    save(); drawTicket();
    flash(id);
  }
  function setQty(id, qty) {
    ticket.items = ticket.items.map(function (i) { return i.id === id ? { id: id, qty: qty } : i; }).filter(function (i) { return i.qty > 0; });
    save(); drawTicket();
  }
  function clearTicket() { ticket = { items: [], discount: null, customer: null }; save(); drawTicket(); }

  function flash(id) {
    var tile = root.querySelector("[data-pos-add='" + CSS.escape(id) + "']");
    if (tile) { tile.classList.remove("flash"); void tile.offsetWidth; tile.classList.add("flash"); }
  }

  function render(el) {
    root = el;
    restore();
    return A.load("products", true).then(function (list) {
      products = list;
      el.innerHTML =
        "<div class='pos'>" +
          "<section class='pos-catalog'>" +
            "<div class='pos-search'>" +
              "<input type='search' id='pos-q' placeholder='Zoek product of scan barcode…' autocomplete='off' autofocus>" +
            "</div>" +
            "<div class='chips' id='pos-types'>" +
              "<button class='chip active' data-type=''>Alles</button>" +
              Object.keys(A.TYPES).filter(function (t) { return products.some(function (p) { return p.type === t && sellable(p); }); })
                .map(function (t) { return "<button class='chip' data-type='" + t + "'>" + A.TYPES[t] + "</button>"; }).join("") +
            "</div>" +
            "<div class='pos-grid' id='pos-grid'></div>" +
          "</section>" +
          "<section class='pos-ticket'>" +
            "<header class='pos-ticket-head'><h2>Bon</h2><button class='link' id='pos-clear'>Leegmaken</button></header>" +
            "<div class='pos-customer' id='pos-customer'></div>" +
            "<div class='pos-lines' id='pos-lines'></div>" +
            "<div class='pos-summary' id='pos-summary'></div>" +
            "<div class='pos-pay'>" +
              "<button class='pay pay-pin' data-pay='pin'>Pin</button>" +
              "<button class='pay pay-cash' data-pay='contant'>Contant</button>" +
              "<button class='pay pay-other' data-pay='tikkie'>Tikkie</button>" +
            "</div>" +
          "</section>" +
        "</div>";

      drawGrid();
      drawTicket();

      var q = el.querySelector("#pos-q");
      q.addEventListener("input", drawGrid);
      q.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        var v = q.value.trim();
        if (!v) return;
        // Barcodescanners typen de code en sturen een Enter.
        var hit = products.find(function (p) { return p.ean && p.ean === v; });
        var matches = visible();
        if (!hit && matches.length === 1) hit = matches[0];
        if (hit) { add(hit.id); q.value = ""; drawGrid(); }
        else A.toast(/^\d{8,14}$/.test(v) ? "Barcode " + v + " is niet gekoppeld aan een product." : "Kies een product uit de lijst.", "error");
      });
      el.querySelector("#pos-types").addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-type]");
        if (!b) return;
        filterType = b.dataset.type;
        el.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("active", c === b); });
        drawGrid();
      });
      el.querySelector(".pos").addEventListener("click", onClick);
    });
  }

  function visible() {
    var q = (root.querySelector("#pos-q").value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    return products.filter(function (p) {
      if (!sellable(p)) return false;
      if (filterType && p.type !== filterType) return false;
      if (!q) return true;
      var hay = [p.name, p.producer, p.region, p.country, p.grape, p.ean, p.vintage].join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) { return (a.producer + a.name).localeCompare(b.producer + b.name, "nl"); });
  }

  function drawGrid() {
    var list = visible();
    root.querySelector("#pos-grid").innerHTML = list.length ? list.map(function (p) {
      return "<button class='tile tile-" + e(p.type) + "' data-pos-add='" + e(p.id) + "'>" +
        "<span class='tile-producer'>" + e(p.producer) + "</span>" +
        "<span class='tile-name'>" + e(p.name) + "</span>" +
        "<span class='tile-foot'><strong>" + eu(p.price) + "</strong>" + A.stockBadge(p) + "</span></button>";
    }).join("") : "<p class='empty-inline'>Geen producten gevonden.</p>";
  }

  function drawTicket() {
    if (!root || !root.querySelector("#pos-lines")) return;
    var t = totals();
    root.querySelector("#pos-customer").innerHTML = ticket.customer
      ? "<span>👤 " + e(ticket.customer.name || ticket.customer.email) + "</span><button class='link' data-pos-customer-clear>Verwijder</button>"
      : "<button class='link' data-pos-customer>+ Klant koppelen</button>";
    root.querySelector("#pos-lines").innerHTML = t.lines.length ? t.lines.map(function (l) {
      var p = byId(l.id);
      return "<div class='pos-line'>" +
        "<div class='pos-line-name'><span>" + e(p.producer) + "</span>" + e(p.name) + "<small>" + eu(l.price) + (p.unit !== "fles" ? " · " + e(p.unit) : "") + "</small></div>" +
        "<div class='qty'><button data-pos-qty='" + e(l.id) + "' data-d='-1' aria-label='Eén minder'>−</button><span>" + l.qty + "</span><button data-pos-qty='" + e(l.id) + "' data-d='1' aria-label='Eén meer'>+</button></div>" +
        "<strong class='num'>" + eu(l.total) + "</strong></div>";
    }).join("") : "<p class='pos-empty'>Tik op een product of scan een barcode.</p>";

    root.querySelector("#pos-summary").innerHTML =
      (t.warnings.length ? "<p class='warn small'>⚠ " + t.warnings.map(e).join("<br>⚠ ") + "</p>" : "") +
      "<div class='row'><span>Subtotaal</span><span>" + eu(t.subtotal) + "</span></div>" +
      "<div class='row'><button class='link' data-pos-discount>" + (t.discount ? "Korting" + (ticket.discount.type === "percent" ? " " + ticket.discount.value + "%" : "") + " (wijzig)" : "+ Korting") + "</button><span>" + (t.discount ? "− " + eu(t.discount) : "") + "</span></div>" +
      "<div class='row row-total'><span>Totaal</span><span>" + eu(t.total) + "</span></div>";
    root.querySelectorAll("[data-pay]").forEach(function (b) { b.disabled = !t.lines.length; });
  }

  function onClick(ev) {
    var t = ev.target.closest("[data-pos-add],[data-pos-qty],[data-pay],[data-pos-discount],[data-pos-customer],[data-pos-customer-clear],#pos-clear");
    if (!t) return;
    if (t.dataset.posAdd) add(t.dataset.posAdd);
    else if (t.dataset.posQty) {
      var line = ticket.items.find(function (i) { return i.id === t.dataset.posQty; });
      if (line) setQty(line.id, line.qty + Number(t.dataset.d));
    }
    else if (t.dataset.pay) pay(t.dataset.pay);
    else if (t.hasAttribute("data-pos-discount")) discountDialog();
    else if (t.hasAttribute("data-pos-customer")) customerDialog();
    else if (t.hasAttribute("data-pos-customer-clear")) { ticket.customer = null; save(); drawTicket(); }
    else if (t.id === "pos-clear" && ticket.items.length) A.confirm("Bon leegmaken?", "Alle producten worden van de bon gehaald.", "Leegmaken", true).then(function (ok) { if (ok) clearTicket(); });
  }

  function discountDialog() {
    var d = ticket.discount || { type: "percent", value: "" };
    var body = A.modal("Korting", "<form id='disc-form'>" +
      "<div class='seg'><label><input type='radio' name='type' value='percent'" + (d.type === "percent" ? " checked" : "") + "> Percentage</label>" +
      "<label><input type='radio' name='type' value='amount'" + (d.type === "amount" ? " checked" : "") + "> Bedrag (€)</label></div>" +
      "<label class='field'>Korting<input name='value' inputmode='decimal' value='" + e(d.value) + "' autofocus></label>" +
      "<div class='quick'>" + [5, 10, 15, 20].map(function (n) { return "<button type='button' class='btn' data-pct='" + n + "'>" + n + "%</button>"; }).join("") + "</div>" +
      "<div class='actions'><button type='button' class='btn' id='disc-remove'>Geen korting</button><button class='btn btn-primary'>Toepassen</button></div></form>", { narrow: true });
    var form = body.querySelector("form");
    body.querySelectorAll("[data-pct]").forEach(function (b) {
      b.addEventListener("click", function () { form.type.value = "percent"; form.value.value = b.dataset.pct; });
    });
    body.querySelector("#disc-remove").addEventListener("click", function () { ticket.discount = null; save(); drawTicket(); A.closeModal(); });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = A.parseNum(form.value.value);
      ticket.discount = v > 0 ? { type: form.type.value, value: v } : null;
      save(); drawTicket(); A.closeModal();
    });
  }

  function customerDialog() {
    A.load("customers").then(function (list) {
      var body = A.modal("Klant koppelen", "<input type='search' id='cust-q' placeholder='Zoek op naam, e-mail of telefoon' autofocus>" +
        "<div class='pick-list' id='cust-list'></div><p class='muted small'>Nieuwe klant? Voeg die toe onder Klanten.</p>", { narrow: true });
      var q = body.querySelector("#cust-q");
      function draw() {
        var v = q.value.toLowerCase();
        var hits = list.filter(function (c) { return !v || [c.name, c.email, c.phone, c.company].join(" ").toLowerCase().indexOf(v) >= 0; }).slice(0, 30);
        body.querySelector("#cust-list").innerHTML = hits.map(function (c) {
          return "<button class='pick' data-id='" + e(c.id) + "'><strong>" + e(c.name || c.email) + "</strong><span class='muted small'>" + e([c.email, c.phone].filter(Boolean).join(" · ")) + "</span></button>";
        }).join("") || "<p class='empty-inline'>Geen klanten gevonden.</p>";
      }
      q.addEventListener("input", draw); draw();
      body.addEventListener("click", function (ev) {
        var b = ev.target.closest(".pick");
        if (!b) return;
        var c = list.find(function (x) { return x.id === b.dataset.id; });
        ticket.customer = { id: c.id, name: c.name, email: c.email };
        save(); drawTicket(); A.closeModal();
      });
    });
  }

  function pay(method) {
    var t = totals();
    if (!t.lines.length) return;
    if (method === "contant") return cashDialog(t);
    var label = method === "pin" ? "Pinbetaling" : "Tikkie / betaalverzoek";
    var body = A.modal(label, "<p class='pay-amount'>" + eu(t.total) + "</p>" +
      "<p class='muted center'>" + (method === "pin" ? "Laat de klant pinnen op de pinautomaat. Bevestig hieronder als de betaling is gelukt." : "Stuur het betaalverzoek en bevestig zodra het is betaald.") + "</p>" +
      "<div class='actions'><button class='btn' data-modal-close>Annuleren</button><button class='btn btn-primary btn-lg' id='pay-ok'>Betaald</button></div>", { narrow: true });
    body.querySelector("#pay-ok").addEventListener("click", function () { complete(method, null, this); });
  }

  function cashDialog(t) {
    var body = A.modal("Contant", "<p class='pay-amount'>" + eu(t.total) + "</p>" +
      "<label class='field'>Ontvangen<input id='cash-in' inputmode='decimal' placeholder='0,00' autofocus></label>" +
      "<div class='quick'>" + [t.total, 10, 20, 50, 100].filter(function (v, i, a) { return v >= t.total && a.indexOf(v) === i; }).slice(0, 4)
        .map(function (v) { return "<button type='button' class='btn' data-cash='" + v + "'>" + (v === t.total ? "Gepast" : eu(v)) + "</button>"; }).join("") + "</div>" +
      "<p class='change' id='cash-change'></p>" +
      "<div class='actions'><button class='btn' data-modal-close>Annuleren</button><button class='btn btn-primary btn-lg' id='cash-ok' disabled>Afrekenen</button></div>", { narrow: true });
    var input = body.querySelector("#cash-in");
    function update() {
      var v = A.parseNum(input.value);
      var ok = v != null && v >= t.total - 0.001;
      body.querySelector("#cash-ok").disabled = !ok;
      body.querySelector("#cash-change").innerHTML = ok ? "Wisselgeld: <strong>" + eu(Math.round((v - t.total) * 100) / 100) + "</strong>" : v ? "Nog " + eu(t.total - v) + " te ontvangen" : "";
    }
    input.addEventListener("input", update);
    body.querySelectorAll("[data-cash]").forEach(function (b) { b.addEventListener("click", function () { input.value = String(b.dataset.cash).replace(".", ","); update(); }); });
    body.querySelector("#cash-ok").addEventListener("click", function () { complete("contant", A.parseNum(input.value), this); });
    input.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !body.querySelector("#cash-ok").disabled) body.querySelector("#cash-ok").click(); });
  }

  function complete(method, cashReceived, btn) {
    A.busy(btn, true);
    A.api("POST", "pos", {
      items: ticket.items, payment: method, discount: ticket.discount,
      cashReceived: cashReceived, customerId: ticket.customer && ticket.customer.id
    }).then(function (res) {
      clearTicket();
      A.invalidate("products", "orders", "customers");
      A.load("products", true).then(function (list) { products = list; drawGrid(); });
      receiptDialog(res.order);
      A.refreshBadges();
    }).catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
  }

  function receiptDialog(order) {
    var body = A.modal("Verkoop afgerond", "<div class='receipt-preview'>" + A.receiptHtml(order) + "</div>" +
      (order.cash ? "<p class='change'>Wisselgeld: <strong>" + eu(order.cash.change) + "</strong></p>" : "") +
      "<div class='actions'><button class='btn' id='rc-print'>Bon afdrukken</button><button class='btn btn-primary btn-lg' data-modal-close autofocus>Nieuwe verkoop</button></div>",
      { narrow: true, onClose: function () { var q = document.getElementById("pos-q"); if (q) q.focus(); } });
    body.querySelector("#rc-print").addEventListener("click", function () { A.printReceipt(order); });
  }

  A.register("kassa", { render: render });
})();

/* Kassabon (gedeeld met Bestellingen). */
A.receiptHtml = function (o) {
  var e = A.esc, eu = A.euro;
  return "<div class='receipt'>" +
    "<p class='r-center r-shop'>worldwidewine.nl</p><p class='r-center r-tag'>DRANKEN EN CULINAIRE PROJECTEN</p>" +
    "<p class='r-center'>Westzijde 358, 1506 GK Zaandam<br>06 83 17 27 04 · info@worldwidewine.nl<br>KvK 32134785</p>" +
    "<p class='r-center'>" + A.date(o.createdAt, true) + "<br>Bon " + e(o.number) + "</p><hr>" +
    o.lines.map(function (l) {
      return "<div class='r-line'><span>" + l.qty + " × " + e(l.name) + "</span><span>" + eu(l.total) + "</span></div>" +
        (l.qty > 1 ? "<div class='r-sub'>à " + eu(l.price) + "</div>" : "");
    }).join("") + "<hr>" +
    (o.discount ? "<div class='r-line'><span>Subtotaal</span><span>" + eu(o.subtotal) + "</span></div><div class='r-line'><span>Korting</span><span>− " + eu(o.discount) + "</span></div>" : "") +
    (o.shipping ? "<div class='r-line'><span>Verzending</span><span>" + eu(o.shipping) + "</span></div>" : "") +
    "<div class='r-line r-total'><span>TOTAAL</span><span>" + eu(o.total) + "</span></div>" +
    "<div class='r-line'><span>" + e(A.PAYMENT[o.paymentMethod] || o.paymentMethod) + "</span><span>" + eu(o.cash ? o.cash.received : o.total) + "</span></div>" +
    (o.cash ? "<div class='r-line'><span>Wisselgeld</span><span>" + eu(o.cash.change) + "</span></div>" : "") + "<hr>" +
    "<div class='r-line r-small'><span>Btw</span><span>over</span><span>btw</span></div>" +
    (o.vat || []).map(function (v) { return "<div class='r-line r-small'><span>" + v.rate + "%</span><span>" + eu(v.gross - v.vat) + "</span><span>" + eu(v.vat) + "</span></div>"; }).join("") +
    "<hr><p class='r-center'>Bedankt en proost!<br>Geen 18, geen alcohol.</p></div>";
};

A.printReceipt = function (o) {
  var el = document.getElementById("receipt-print");
  el.innerHTML = A.receiptHtml(o);
  document.body.classList.add("printing-receipt");
  setTimeout(function () {
    window.print();
    document.body.classList.remove("printing-receipt");
  }, 50);
};
