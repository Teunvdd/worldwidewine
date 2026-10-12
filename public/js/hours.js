/* Openingstijden en bezorgkosten op de website, zoals ingesteld in de admin (Winkel).
 * Vult elementen met data-hours-table, data-hours-line, data-hours-short, data-area-price en data-area-free.
 * Zonder server blijven de standaardwaarden uit config.js staan. */
(function () {
  var ORDER = window.WWW_ORDER, CONFIG = window.WWW_CONFIG || {};
  if (!ORDER || !document.querySelector("[data-hours-table], [data-hours-line], [data-hours-short], [data-area-price], [data-area-free]")) return;
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var euro = function (n) { return "€\u00a0" + (n % 1 ? n.toFixed(2).replace(".", ",") : String(n)); };
  var short = function (t) { return t.replace(/^0/, "").replace(":00", ""); }; // "09:00" → "9"

  function fill(info) {
    var week = info.hours.thisWeek, today = info.today;
    var open = week.filter(function (d) { return d.s === "open"; });
    var byAppointment = week.some(function (d) { return d.s === "afspraak"; });

    document.querySelectorAll("[data-hours-table]").forEach(function (t) {
      var days = week.slice(), cap0 = days[0].label.split(" ").slice(1).join(" "), capN = days[6].label.split(" ").slice(1).join(" ");
      t.innerHTML = "<caption>Deze week · " + esc(cap0) + " – " + esc(capN) + "</caption>" + days.map(function (d) {
        var v = d.s === "open" ? d.from + " – " + d.to : d.s === "afspraak" ? "op afspraak" : "gesloten";
        return "<tr class='" + (d.date === today ? "is-today " : "") + (d.s !== "open" ? "is-quiet" : "") + "'><th>" + esc(cap(d.label.split(" ")[0])) +
          (d.date === today ? " <span class='today'>vandaag</span>" : "") + "</th><td>" + esc(v) + "</td></tr>";
      }).join("");
    });

    var line = open.length
      ? open.map(function (d) { return cap(d.label.split(" ")[0]) + " " + d.from + " – " + d.to; }).join(", ") + (byAppointment ? ", andere dagen op afspraak." : ".")
      : byAppointment ? "Deze week alleen op afspraak." : "Deze week gesloten.";
    document.querySelectorAll("[data-hours-line]").forEach(function (el) { el.textContent = line; });

    var t = week.find(function (d) { return d.date === today; });
    var shortText = t && t.s === "open" ? "vandaag open " + short(t.from) + "–" + short(t.to) + " uur"
      : open.length ? open.map(function (d) { return d.label.split(" ")[0] + " " + short(d.from) + "–" + short(d.to) + " uur"; }).join(", ")
      : "op afspraak";
    document.querySelectorAll("[data-hours-short]").forEach(function (el) { el.textContent = shortText; });

    document.querySelectorAll("[data-area-price]").forEach(function (el) { el.textContent = euro(info.area.price); });
    document.querySelectorAll("[data-area-free]").forEach(function (el) {
      el.textContent = info.area.freeFrom != null ? ", gratis vanaf " + euro(info.area.freeFrom) : "";
    });
  }

  function local() {
    var r = (CONFIG.delivery || {})["bezorgen-regio"] || {};
    var today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    return { today: today, hours: { thisWeek: ORDER.weekHours(CONFIG, today) }, area: { price: r.price, freeFrom: r.freeFrom == null ? null : r.freeFrom } };
  }

  fetch("/api/shop-info", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok && (r.headers.get("Content-Type") || "").indexOf("application/json") >= 0 ? r.json() : null; })
    .catch(function () { return null; })
    .then(function (info) { fill(info || local()); });
})();
