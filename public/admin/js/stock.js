/* Voorraadbeheer: tellen, ontvangst boeken, correcties en mutatiegeschiedenis. */
(function () {
  var e = A.esc;
  var q = "", onlyLow = false;
  var pg = { page: 1 };

  function render(el) {
    return Promise.all([A.load("products", true), A.api("GET", "stock/log")]).then(function (res) {
      var products = res[0], log = res[1].log;
      el.innerHTML =
        "<header class='page-head'><div><h1>Voorraad</h1><p class='muted'>Vul een aantal in en kies wat je wilt doen. Webshop en kassa werken met dezelfde voorraad.</p></div></header>" +
        "<div class='toolbar'>" +
          "<input type='search' id='s-q' placeholder='Zoek product' value='" + e(q) + "'>" +
          "<label class='check'><input type='checkbox' id='s-low'" + (onlyLow ? " checked" : "") + "> Alleen bijna op / uitverkocht</label>" +
        "</div>" +
        "<div class='card card-flush'><table class='table'><thead><tr><th>Product</th><th class='num'>Nu</th><th>Wijzigen</th></tr></thead><tbody id='s-rows'></tbody></table></div>" +
        "<div id='s-pager'></div>" +
        "<section class='card'><header class='card-head'><h2>Laatste mutaties</h2></header>" +
        (log.length ? "<table class='table'><thead><tr><th>Wanneer</th><th>Product</th><th>Reden</th><th class='num'>Mutatie</th><th class='num'>Na</th></tr></thead><tbody>" +
          log.slice(0, 60).map(function (m) {
            return "<tr><td class='small muted'>" + A.date(m.at, true) + "</td><td>" + e(m.name) + "</td><td>" + e(m.reason) + (m.ref ? " <span class='muted small'>" + e(m.ref) + "</span>" : "") + "</td>" +
              "<td class='num " + (m.delta > 0 ? "num-up" : m.delta < 0 ? "num-down" : "") + "'>" + (m.delta == null ? "—" : (m.delta > 0 ? "+" : "") + m.delta) + "</td><td class='num'>" + (m.after == null ? "niet bijhouden" : m.after) + "</td></tr>";
          }).join("") + "</tbody></table>" : "<p class='empty-inline'>Nog geen voorraadmutaties.</p>") +
        "</section>";

      function draw() {
        var v = q.toLowerCase();
        var list = products.filter(function (p) {
          if (onlyLow && !(typeof p.stock === "number" && p.stock <= (p.minStock == null ? 6 : p.minStock))) return false;
          return !v || [p.name, p.producer, p.ean].join(" ").toLowerCase().indexOf(v) >= 0;
        }).sort(function (a, b) { return (a.producer + a.name).localeCompare(b.producer + b.name, "nl"); });
        var paged = A.paginate(list, pg);
        el.querySelector("#s-pager").innerHTML = paged.html;
        el.querySelector("#s-rows").innerHTML = paged.items.map(function (p) {
          return "<tr data-id='" + e(p.id) + "'><td><span class='muted small'>" + e(p.producer) + "</span><br><strong>" + e(p.name) + "</strong> <span class='muted small'>" + e(p.unit) + "</span></td>" +
            "<td class='num'>" + A.stockBadge(p) + "</td>" +
            "<td><div class='stock-edit'><input type='number' step='1' inputmode='numeric' placeholder='aantal' aria-label='Aantal'>" +
            "<button class='btn btn-sm' data-act='in' title='Bij de voorraad optellen'>+ Ontvangst</button>" +
            "<button class='btn btn-sm' data-act='out' title='Van de voorraad aftrekken'>− Breuk/eigen gebruik</button>" +
            "<button class='btn btn-sm' data-act='set' title='Voorraad op dit aantal zetten'>= Geteld</button>" +
            (typeof p.stock === "number" ? "<button class='btn btn-sm btn-ghost' data-act='off' title='Voorraad niet meer bijhouden'>Niet bijhouden</button>" : "") +
            "</div></td></tr>";
        }).join("") || "<tr><td colspan='3' class='empty-inline'>Geen producten gevonden.</td></tr>";
      }
      draw();
      A.bindPager(el.querySelector("#s-pager"), pg, draw);

      el.querySelector("#s-q").addEventListener("input", function () { q = this.value; pg.page = 1; draw(); });
      el.querySelector("#s-low").addEventListener("change", function () { onlyLow = this.checked; pg.page = 1; draw(); });
      el.querySelector("#s-rows").addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && ev.target.matches("input")) { ev.preventDefault(); ev.target.closest("tr").querySelector("[data-act=set]").click(); }
      });
      el.querySelector("#s-rows").addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-act]");
        if (!b) return;
        var tr = b.closest("tr"), id = tr.dataset.id, act = b.dataset.act;
        var p = products.find(function (x) { return x.id === id; });
        var n = Math.floor(Number(tr.querySelector("input").value));
        var change, reason;
        if (act === "off") { change = { id: id, set: null }; reason = "Voorraad niet meer bijhouden"; }
        else {
          if (!(tr.querySelector("input").value !== "" && n >= 0)) { A.toast("Vul eerst een aantal in.", "error"); tr.querySelector("input").focus(); return; }
          if (act === "set") { change = { id: id, set: n }; reason = "Geteld"; }
          else if (typeof p.stock !== "number") {
            if (act === "out") { A.toast("De voorraad van dit product wordt nog niet bijgehouden. Tel eerst en kies ‘= Geteld’.", "error"); return; }
            change = { id: id, set: n }; reason = "Ontvangst";
          }
          else { change = { id: id, delta: act === "in" ? n : -n }; reason = act === "in" ? "Ontvangst" : "Breuk / eigen gebruik"; }
        }
        A.busy(b, true, "…");
        A.api("POST", "stock", { changes: [change], reason: reason }).then(function () {
          A.toast("Voorraad bijgewerkt: " + A.productName(p));
          A.invalidate("products");
          A.route();
        }).catch(function (err) { A.busy(b, false); A.toast(err.message, "error"); });
      });
    });
  }

  A.register("voorraad", { render: render });
})();
