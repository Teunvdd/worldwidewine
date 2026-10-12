/* Winkel: openingstijden (per week), bezorgtijden en bezorggebied.
 * De website, het afrekenen en de server gebruiken deze instellingen direct. */
(function () {
  var e = A.esc, O = window.WWW_ORDER;
  var DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  var MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  var ORDER_WD = [1, 2, 3, 4, 5, 6, 0]; // maandag eerst
  var STATES = [["open", "Open"], ["afspraak", "Op afspraak"], ["dicht", "Dicht"]];

  // ---- Datums (als "2026-10-12", in Nederlandse tijd) ----
  function todayIso() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }); }
  function utc(iso) { var a = iso.split("-").map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2])); }
  function addDays(iso, n) { var d = utc(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function mondayOf(iso) { return addDays(iso, -((utc(iso).getUTCDay() + 6) % 7)); }
  function weekNumber(iso) { // ISO-weeknummer
    var d = utc(iso); d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7);
    var jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - jan4) / 864e5 - 3 + (jan4.getUTCDay() + 6) % 7) / 7);
  }
  function short(iso) { var d = utc(iso); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()].slice(0, 3); }
  function range(monday) {
    var a = utc(monday), b = utc(addDays(monday, 6));
    return a.getUTCDate() + (a.getUTCMonth() !== b.getUTCMonth() ? " " + MONTHS[a.getUTCMonth()] : "") + " – " + b.getUTCDate() + " " + MONTHS[b.getUTCMonth()] + " " + b.getUTCFullYear();
  }
  function longDate(iso) { var d = utc(iso); return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var settings = null, defaults = null;
  var shownWeek = { hours: null, delivery: null };
  function load() {
    return A.api("GET", "shop-settings").then(function (r) { settings = r.settings; defaults = r.defaults; return r; });
  }
  function save(part, value, msg) {
    var body = {}; body[part] = value;
    return A.api("POST", "shop-settings", body).then(function (r) { settings = r.settings; A.toast(msg || "Opgeslagen"); return r; });
  }

  // ---- Bewerken van één dag ----
  // Openingstijden: { s, from, to }
  var HOURS = {
    part: "hours",
    std: function (wd) { return clean(settings.hours.week[wd]); },
    dates: function () { return settings.hours.dates || {}; },
    cell: function (v, key) {
      v = v || { s: "dicht" };
      var off = v.s === "dicht";
      return "<td class='wk-state'><select data-k='" + key + "' data-f='s' aria-label='Status'>" + STATES.map(function (s) {
          return "<option value='" + s[0] + "'" + (v.s === s[0] ? " selected" : "") + ">" + s[1] + "</option>";
        }).join("") + "</select></td>" +
        "<td class='wk-times'><span class='time-range" + (off ? " is-off" : "") + "'><input type='time' step='900' data-k='" + key + "' data-f='from' value='" + e(v.from || "10:00") + "'" + (off ? " disabled" : "") + " aria-label='Van'>" +
        "<span>–</span><input type='time' step='900' data-k='" + key + "' data-f='to' value='" + e(v.to || "18:00") + "'" + (off ? " disabled" : "") + " aria-label='Tot'></span></td>";
    },
    read: function (root, key) {
      var q = function (f) { return root.querySelector("[data-k='" + key + "'][data-f='" + f + "']").value; };
      var s = q("s");
      return s === "dicht" ? { s: "dicht" } : { s: s, from: q("from"), to: q("to") };
    },
    wire: function (root) {
      root.addEventListener("change", function (ev) {
        if (ev.target.dataset.f !== "s") return;
        var tr = ev.target.closest("tr"), off = ev.target.value === "dicht";
        tr.querySelector(".time-range").classList.toggle("is-off", off);
        tr.querySelectorAll("input[type=time]").forEach(function (i) { i.disabled = off; });
      });
    },
    summary: function (v) { return v.s === "dicht" ? "Dicht" : (v.s === "afspraak" ? "Op afspraak " : "") + v.from + " – " + v.to; }
  };
  function clean(v) { return v && v.s && v.s !== "dicht" ? { s: v.s, from: v.from, to: v.to } : { s: "dicht" }; }

  // Bezorgtijden: [["17:00", "21:00"], …]
  function windowHtml(key, w) {
    return "<span class='win'><input type='time' step='900' data-w='from' value='" + e(w[0]) + "' aria-label='Van'><span>–</span>" +
      "<input type='time' step='900' data-w='to' value='" + e(w[1]) + "' aria-label='Tot'>" +
      "<button type='button' class='win-x' data-win-remove aria-label='Tijdvak verwijderen'>×</button></span>";
  }
  var DELIVERY = {
    part: "deliveryTimes",
    std: function (wd) { return settings.deliveryTimes.week[wd] || []; },
    dates: function () { return settings.deliveryTimes.dates || {}; },
    cell: function (v, key) {
      v = v || [];
      return "<td class='wk-state'><label class='switch switch-sm'><input type='checkbox' data-k='" + key + "' data-f='on'" + (v.length ? " checked" : "") + "><span class='slider' aria-hidden='true'></span>" +
        "<span class='set-text'>" + (v.length ? "Bezorgen" : "Geen bezorging") + "</span></label></td>" +
        "<td class='wk-times'><div class='wins' data-k='" + key + "' data-f='wins'" + (v.length ? "" : " hidden") + ">" + v.map(function (w) { return windowHtml(key, w); }).join("") +
        "<button type='button' class='btn btn-sm btn-ghost' data-win-add>+ Tijdvak</button></div></td>";
    },
    read: function (root, key) {
      if (!root.querySelector("[data-k='" + key + "'][data-f='on']").checked) return [];
      return Array.prototype.map.call(root.querySelectorAll("[data-k='" + key + "'][data-f='wins'] .win"), function (w) {
        return [w.querySelector("[data-w=from]").value, w.querySelector("[data-w=to]").value];
      }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    },
    wire: function (root) {
      root.addEventListener("change", function (ev) {
        if (ev.target.dataset.f !== "on") return;
        var tr = ev.target.closest("tr"), wins = tr.querySelector(".wins");
        wins.hidden = !ev.target.checked;
        tr.querySelector(".set-text").textContent = ev.target.checked ? "Bezorgen" : "Geen bezorging";
        if (ev.target.checked && !wins.querySelector(".win")) wins.querySelector("[data-win-add]").insertAdjacentHTML("beforebegin", windowHtml("", ["17:00", "21:00"]));
      });
      root.addEventListener("click", function (ev) {
        var add = ev.target.closest("[data-win-add]"), rm = ev.target.closest("[data-win-remove]");
        if (add) {
          var last = add.parentNode.querySelectorAll(".win"), prev = last.length ? last[last.length - 1].querySelector("[data-w=to]").value : "15:00";
          var h = Math.min(Number(prev.slice(0, 2)) + 1, 21);
          add.insertAdjacentHTML("beforebegin", windowHtml("", [String(h).padStart(2, "0") + ":00", String(Math.min(h + 3, 23)).padStart(2, "0") + ":00"]));
          root.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (rm) {
          var box = rm.closest(".wins"), tr = rm.closest("tr");
          rm.closest(".win").remove();
          if (!box.querySelector(".win")) { var on = tr.querySelector("[data-f=on]"); on.checked = false; on.dispatchEvent(new Event("change", { bubbles: true })); }
          root.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    },
    summary: function (v) { return v.length ? v.map(function (w) { return w[0] + " – " + w[1]; }).join(", ") : "Geen bezorging"; }
  };

  // Tabel met zeven dagen. rows: [{ key, label, sub, value, badge }]
  function dayTable(kind, rows) {
    return "<table class='table wk-table'><tbody>" + rows.map(function (r) {
      return "<tr" + (r.past ? " class='is-past'" : "") + "><th class='wk-day'><strong>" + e(r.label) + "</strong>" + (r.sub ? "<span class='muted small'>" + e(r.sub) + "</span>" : "") + "</th>" +
        kind.cell(r.value, r.key) + "<td class='wk-badge'>" + (r.badge || "") + "</td></tr>";
    }).join("") + "</tbody></table>";
  }

  // ---- Pagina met weekoverzicht + standaardweek ----
  function weekPage(el, kind, opts) {
    var which = kind === HOURS ? "hours" : "delivery";
    var monday = shownWeek[which] || mondayOf(todayIso());
    var dirty = false;

    function weekRows() {
      var dates = kind.dates(), today = todayIso();
      return [0, 1, 2, 3, 4, 5, 6].map(function (i) {
        var iso = addDays(monday, i), wd = utc(iso).getUTCDay(), changed = iso in dates;
        var v = changed ? dates[iso] : kind.std(wd);
        return { key: iso, label: cap(DAYS[wd]), sub: short(iso), value: v, past: iso < today,
          badge: changed ? "<span class='tag tag-winkel' title='Standaard: " + e(kind.summary(kind.std(wd))) + "'>Afwijkend</span>" : "<span class='tag'>Standaard</span>" };
      });
    }

    function draw() {
      var dates = kind.dates();
      var changedCount = [0, 1, 2, 3, 4, 5, 6].filter(function (i) { return addDays(monday, i) in dates; }).length;
      var isThis = monday === mondayOf(todayIso());
      var upcoming = Object.keys(dates).filter(function (d) { return d >= todayIso(); }).sort();
      el.innerHTML =
        "<header class='page-head'><div><h1>" + opts.title + "</h1><p class='muted'>" + opts.intro + "</p></div></header>" +
        "<div class='wk-layout'><div>" +
        "<section class='card wk-card'>" +
          "<div class='wk-nav'><button type='button' class='icon-btn' id='wk-prev' aria-label='Vorige week'>‹</button>" +
            "<div class='wk-title'><strong>Week " + weekNumber(monday) + (isThis ? " · deze week" : "") + "</strong><span class='muted'>" + range(monday) + "</span></div>" +
            "<button type='button' class='icon-btn' id='wk-next' aria-label='Volgende week'>›</button>" +
            "<span class='spacer'></span>" + (isThis ? "" : "<button type='button' class='btn btn-sm' id='wk-today'>Naar deze week</button>") +
            "<input type='date' id='wk-jump' class='wk-jump' value='" + monday + "' aria-label='Ga naar week'></div>" +
          "<p class='muted small wk-hint'>" + (changedCount ? changedCount + " " + (changedCount === 1 ? "dag wijkt" : "dagen wijken") + " af van de standaardweek." : "Deze week volgt de standaardweek. Pas een dag aan om alleen deze week af te wijken.") + "</p>" +
          "<form id='wk-form'>" + dayTable(kind, weekRows()) +
          "<div class='actions'><button type='button' class='btn btn-ghost' id='wk-reset'" + (changedCount ? "" : " disabled") + ">Terug naar standaardweek</button>" +
            "<button type='button' class='btn btn-ghost' id='wk-copy'>Kopieer naar volgende week</button><span class='spacer'></span>" +
            "<span class='muted small' id='wk-dirty'></span><button class='btn btn-primary' id='wk-save'>Week opslaan</button></div></form>" +
        "</section>" +
        "<section class='card'><h2>Standaardweek</h2><p class='muted small'>Geldt voor elke week, behalve voor de dagen die je hierboven per week aanpast.</p>" +
          "<form id='std-form'>" + dayTable(kind, ORDER_WD.map(function (wd) { return { key: "w" + wd, label: cap(DAYS[wd]), value: kind.std(wd) }; })) +
          (opts.extra ? opts.extra() : "") +
          "<div class='actions'><button class='btn btn-primary' id='std-save'>Standaardweek opslaan</button></div></form>" +
        "</section></div>" +
        "<aside><section class='card'><h2>Afwijkende dagen</h2>" +
          (upcoming.length ? "<ul class='wk-list'>" + upcoming.map(function (d) {
            return "<li><button type='button' class='link-btn' data-go='" + d + "'><strong>" + cap(longDate(d)) + "</strong><span class='muted'>" + e(kind.summary(dates[d])) + "</span></button></li>";
          }).join("") + "</ul>" : "<p class='muted small'>Nog geen afwijkende dagen gepland.</p>") +
        "</section>" + (opts.aside ? opts.aside() : "") + "</aside></div>";
      wire();
    }

    function go(newMonday) {
      if (dirty) return A.confirm("Wijzigingen niet opgeslagen", "Je hebt deze week aangepast maar nog niet opgeslagen. Toch naar een andere week?", "Ja, niet opslaan").then(function (ok) { if (ok) { dirty = false; go(newMonday); } });
      monday = shownWeek[which] = newMonday;
      dirty = false;
      draw();
    }

    // Zet een week in de afwijkingen: alleen dagen die anders zijn dan de standaardweek.
    function applyWeek(dates, start, values) {
      values.forEach(function (v, i) {
        var iso = addDays(start, i), std = kind.std(utc(iso).getUTCDay());
        if (same(v, std)) delete dates[iso]; else dates[iso] = v;
      });
    }
    function readWeek(form) { return [0, 1, 2, 3, 4, 5, 6].map(function (i) { return kind.read(form, addDays(monday, i)); }); }
    function current() { return JSON.parse(JSON.stringify(settings[kind.part])); }

    function wire() {
      var wf = el.querySelector("#wk-form"), sf = el.querySelector("#std-form");
      kind.wire(wf); kind.wire(sf);
      [wf].forEach(function (f) { f.addEventListener("input", mark); f.addEventListener("change", mark); });
      function mark() { dirty = true; el.querySelector("#wk-dirty").textContent = "Niet opgeslagen"; }
      el.querySelector("#wk-prev").addEventListener("click", function () { go(addDays(monday, -7)); });
      el.querySelector("#wk-next").addEventListener("click", function () { go(addDays(monday, 7)); });
      var t = el.querySelector("#wk-today"); if (t) t.addEventListener("click", function () { go(mondayOf(todayIso())); });
      el.querySelector("#wk-jump").addEventListener("change", function () { if (this.value) go(mondayOf(this.value)); });
      el.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { go(mondayOf(b.dataset.go)); }); });

      wf.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var v = current(); applyWeek(v.dates, monday, readWeek(wf));
        var btn = el.querySelector("#wk-save"); A.busy(btn, true, "Opslaan…");
        save(kind.part, v, "Week " + weekNumber(monday) + " opgeslagen").then(function () { dirty = false; draw(); })
          .catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
      });
      el.querySelector("#wk-reset").addEventListener("click", function () {
        A.confirm("Terug naar standaardweek?", "De aanpassingen voor week " + weekNumber(monday) + " worden verwijderd.", "Terugzetten").then(function (ok) {
          if (!ok) return;
          var v = current();
          for (var i = 0; i < 7; i++) delete v.dates[addDays(monday, i)];
          save(kind.part, v, "Week " + weekNumber(monday) + " volgt weer de standaardweek").then(function () { dirty = false; draw(); })
            .catch(function (err) { A.toast(err.message, "error"); });
        });
      });
      el.querySelector("#wk-copy").addEventListener("click", function () {
        var btn = this, values = readWeek(wf), next = addDays(monday, 7);
        var v = current(); applyWeek(v.dates, monday, values); applyWeek(v.dates, next, values);
        A.busy(btn, true, "Kopiëren…");
        save(kind.part, v, "Gekopieerd naar week " + weekNumber(next)).then(function () { dirty = false; go(next); })
          .catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
      });
      sf.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var v = current();
        ORDER_WD.forEach(function (wd) { v.week[wd] = kind.read(sf, "w" + wd); });
        if (kind === DELIVERY) ORDER_WD.forEach(function (wd) { if (!v.week[wd].length) delete v.week[wd]; });
        if (opts.collect) Object.assign(v, opts.collect(sf));
        var btn = el.querySelector("#std-save"); A.busy(btn, true, "Opslaan…");
        // Afwijkende dagen die nu gelijk zijn aan de nieuwe standaard zijn niet meer nodig.
        Object.keys(v.dates).forEach(function (d) {
          var wd = utc(d).getUTCDay(), std = kind === HOURS ? clean(v.week[wd]) : v.week[wd] || [];
          if (same(v.dates[d], std)) delete v.dates[d];
        });
        save(kind.part, v, "Standaardweek opgeslagen").then(function () { draw(); })
          .catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
      });
      if (opts.wire) opts.wire(el);
    }

    draw();
  }

  // ---- Openingstijden ----
  function renderHours(el) {
    return load().then(function () {
      weekPage(el, HOURS, {
        title: "Openingstijden",
        intro: "Stel per week in wanneer de winkel open is. De website toont deze tijden en klanten kunnen binnen deze tijden een afhaalmoment kiezen (ook op dagen ‘op afspraak’).",
        aside: function () {
          return "<section class='card'><h2>Zo werkt het</h2><ul class='help-list'>" +
            "<li><strong>Open</strong>: de winkel is open; zo staat het op de website.</li>" +
            "<li><strong>Op afspraak</strong>: op de website staat ‘op afspraak’. Klanten kunnen binnen deze tijden wel een afhaalmoment kiezen.</li>" +
            "<li><strong>Dicht</strong>: geen afhalen mogelijk.</li>" +
            "<li>Wijkt een week af (vakantie, feestdag)? Ga naar die week en pas de dagen aan. De standaardweek blijft gewoon gelden voor de andere weken.</li></ul></section>";
        }
      });
    });
  }

  // ---- Bezorgtijden ----
  function renderDelivery(el) {
    return load().then(function () {
      var b = settings.deliveryTimes;
      var leadOpts = [[0, "Dezelfde dag (vanaf een uur van tevoren)"], [1, "De volgende dag"], [2, "Over 2 dagen"], [3, "Over 3 dagen"], [7, "Over een week"]];
      var aheadOpts = [[7, "1 week"], [14, "2 weken"], [21, "3 weken"], [28, "4 weken"], [42, "6 weken"], [60, "2 maanden"], [90, "3 maanden"]];
      function opt(list, cur) {
        if (!list.some(function (o) { return o[0] === cur; })) list = list.concat([[cur, cur + " dagen"]]);
        return list.map(function (o) { return "<option value='" + o[0] + "'" + (o[0] === cur ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
      }
      weekPage(el, DELIVERY, {
        title: "Bezorgtijden",
        intro: "Op deze dagen en tijdvakken bezorgen we zelf in Amsterdam en omstreken. Klanten kiezen bij het afrekenen een dag en tijdvak.",
        extra: function () {
          return "<div class='set-row'><span class='set-label'>Vroegst bezorgen<small>Hoe snel na het bestellen kan een klant een moment kiezen?</small></span><select name='leadDays'>" + opt(leadOpts, b.leadDays) + "</select></div>" +
            "<div class='set-row'><span class='set-label'>Vooruit bestellen<small>Hoe ver vooruit kan een klant een moment kiezen?</small></span><select name='daysAhead'>" + opt(aheadOpts, b.daysAhead) + "</select></div>";
        },
        collect: function (f) { return { leadDays: Number(f.leadDays.value), daysAhead: Number(f.daysAhead.value) }; },
        aside: function () {
          var days = O.deliveryDays({ deliveryTimes: settings.deliveryTimes }).slice(0, 6);
          return "<section class='card'><h2>Wat de klant nu ziet</h2>" + (days.length ? "<ul class='wk-list'>" + days.map(function (d) {
            return "<li><strong>" + cap(d.label) + "</strong><span class='muted'>" + d.windows.map(function (w) { return w.replace("-", " – "); }).join(", ") + "</span></li>";
          }).join("") + "</ul>" : "<p class='muted small'>Er zijn de komende tijd geen bezorgmomenten. Klanten kunnen dan niet kiezen voor bezorgen in de regio.</p>") +
          "<p class='muted small'>Bezorggebied en -kosten stel je in bij <a href='#bezorggebied'>Bezorggebied</a>.</p></section>";
        }
      });
    });
  }

  // ---- Bezorggebied ----
  function renderArea(el) {
    return load().then(function () {
      var a = settings.area;
      function money(v) { return v == null ? "" : Number(v).toFixed(2).replace(".", ","); }
      function row(r) {
        return "<tr><td><input class='pc-in' inputmode='numeric' maxlength='4' pattern='[1-9][0-9]{3}' data-f='from' value='" + e(r[0]) + "' aria-label='Van postcode' required></td>" +
          "<td><input class='pc-in' inputmode='numeric' maxlength='4' pattern='[1-9][0-9]{3}' data-f='to' value='" + e(r[1]) + "' aria-label='Tot en met postcode' required></td>" +
          "<td><input data-f='name' maxlength='80' value='" + e(r[2] || "") + "' placeholder='bijv. Amsterdam-Noord' aria-label='Omschrijving'></td>" +
          "<td class='num'><button type='button' class='icon-btn' data-remove aria-label='Gebied verwijderen'>×</button></td></tr>";
      }
      el.innerHTML =
        "<header class='page-head'><div><h1>Bezorggebied</h1><p class='muted'>Postcodes waar we zelf bezorgen (‘Bezorgen in Amsterdam en omstreken’). Bij het afrekenen ziet de klant direct of we op zijn adres bezorgen; daarbuiten kan hij kiezen voor PostNL of afhalen.</p></div></header>" +
        "<form id='area-form' class='wk-layout'><div>" +
        "<section class='card card-flush'><table class='table area-table'><thead><tr><th>Van</th><th>Tot en met</th><th>Omschrijving</th><th></th></tr></thead><tbody id='area-rows'>" +
          a.postcodes.map(row).join("") + "</tbody></table>" +
          "<div class='actions area-actions'><button type='button' class='btn' id='area-add'>+ Postcodegebied</button>" +
          "<button type='button' class='btn btn-ghost' id='area-default'>Standaardgebied herstellen</button><span class='spacer'></span>" +
          "<span class='muted small' id='area-dirty'></span><button class='btn btn-primary' id='area-save'>Opslaan</button></div></section>" +
        "<section class='card set-card'><h2>Bezorgkosten</h2>" +
          "<div class='set-row'><span class='set-label'>Bezorgkosten</span><span class='in-prefix'>€<input name='price' inputmode='decimal' class='in-money' value='" + money(a.price) + "' required></span></div>" +
          "<div class='set-row'><span class='set-label'>Gratis bezorgen vanaf<small>Leeg laten = altijd bezorgkosten.</small></span><span class='in-prefix'>€<input name='freeFrom' inputmode='decimal' class='in-money' value='" + money(a.freeFrom) + "'></span></div>" +
        "</section></div>" +
        "<aside><section class='card'><h2>Postcode controleren</h2><p class='muted small'>Bezorgen we op dit adres? (met de gebieden zoals ze nu op het scherm staan)</p>" +
          "<input id='pc-test' placeholder='1234 AB' maxlength='7' autocomplete='off'><p class='pc-result' id='pc-result'></p></section>" +
          "<section class='card'><h2>Tip</h2><p class='muted small'>Gebruik de eerste vier cijfers van de postcode. Eén postcode? Vul dan bij ‘van’ en ‘tot en met’ hetzelfde in.</p></section></aside>" +
        "</form>";

      var form = el.querySelector("#area-form"), rows = el.querySelector("#area-rows");
      function num(v) { return v === "" ? "" : Number(String(v).replace(",", ".")); }
      function collect() {
        return {
          postcodes: Array.prototype.map.call(rows.querySelectorAll("tr"), function (tr) {
            var q = function (f) { return tr.querySelector("[data-f=" + f + "]").value.trim(); };
            return [Number(q("from")), Number(q("to")), q("name")];
          }),
          price: num(form.price.value.trim()), freeFrom: num(form.freeFrom.value.trim())
        };
      }
      function test() {
        var v = el.querySelector("#pc-test").value, out = el.querySelector("#pc-result");
        var n = O.postcodeNumber(v);
        if (n == null) { out.textContent = ""; out.className = "pc-result"; return; }
        var hit = collect().postcodes.find(function (r) { return n >= r[0] && n <= r[1]; });
        out.className = "pc-result " + (hit ? "is-ok" : "is-bad");
        out.textContent = hit ? "✓ We bezorgen op " + n + (hit[2] ? " (" + hit[2] + ")" : "") + "." : "✗ " + n + " valt buiten het bezorggebied.";
      }
      function mark() { el.querySelector("#area-dirty").textContent = "Niet opgeslagen"; test(); }
      form.addEventListener("input", function (ev) { if (ev.target.id !== "pc-test") mark(); else test(); });
      el.querySelector("#area-add").addEventListener("click", function () {
        rows.insertAdjacentHTML("beforeend", row(["", "", ""])); rows.lastElementChild.querySelector("input").focus(); mark();
      });
      el.querySelector("#area-default").addEventListener("click", function () {
        rows.innerHTML = defaults.area.postcodes.map(row).join(""); mark();
      });
      rows.addEventListener("click", function (ev) { if (ev.target.closest("[data-remove]")) { ev.target.closest("tr").remove(); mark(); } });
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var btn = el.querySelector("#area-save"); A.busy(btn, true, "Opslaan…");
        save("area", collect(), "Bezorggebied opgeslagen").then(function () { A.route(); })
          .catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
      });
    });
  }

  A.register("openingstijden", { render: renderHours });
  A.register("bezorgtijden", { render: renderDelivery });
  A.register("bezorggebied", { render: renderArea });
})();
