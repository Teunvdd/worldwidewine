/* Nieuwspagina: lijst met berichten en een bericht in zijn geheel (nieuws.html#link-van-bericht). */
(function () {
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };
  var $ = function (id) { return document.getElementById(id); };
  var items = [];

  function date(iso) { return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }); }

  // Tekst van de admin: lege regel = nieuwe alinea, enter = nieuwe regel, **vet**, links worden klikbaar.
  function inline(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
  function paragraphs(text) {
    return String(text || "").trim().split(/\n\s*\n/).map(function (p) {
      return "<p>" + p.split("\n").map(inline).join("<br>") + "</p>";
    }).join("");
  }
  function excerpt(text, n) {
    var t = String(text || "").replace(/\*\*/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t;
  }
  function media(it, cls) {
    return it.image ? '<img class="' + cls + '" src="' + esc(it.image) + '" alt="" loading="lazy">'
      : '<div class="' + cls + ' news-noimg" aria-hidden="true"><span>W</span></div>';
  }

  function showList() {
    $("news-article").hidden = true;
    $("news-list-view").hidden = false;
    document.title = "Nieuws — WorldWideWine.nl";
    $("news-list").innerHTML = items.length ? items.map(function (it, i) {
      return '<article class="news-card' + (i === 0 ? " news-card-first" : "") + '">' +
        '<a class="news-card-media" href="#' + esc(it.slug) + '">' + media(it, "news-img") + "</a>" +
        '<div class="news-card-body"><time datetime="' + esc(it.publishedAt) + '">' + date(it.publishedAt) + "</time>" +
        '<h2><a href="#' + esc(it.slug) + '">' + esc(it.title) + "</a></h2>" +
        "<p>" + esc(excerpt(it.body, i === 0 ? 260 : 150)) + "</p>" +
        '<a class="link-arrow" href="#' + esc(it.slug) + '">Lees verder</a></div></article>';
    }).join("") : '<p class="news-empty">Er is nog geen nieuws. Kom binnenkort terug!</p>';
  }

  function showItem(it) {
    $("news-list-view").hidden = true;
    var el = $("news-article");
    el.hidden = false;
    document.title = it.title + " — WorldWideWine.nl";
    el.innerHTML = '<a class="news-back" href="#">← Alle berichten</a>' +
      '<time datetime="' + esc(it.publishedAt) + '">' + date(it.publishedAt) + "</time>" +
      "<h1>" + esc(it.title) + "</h1>" +
      (it.image ? '<img class="news-hero" src="' + esc(it.image) + '" alt="">' : "") +
      '<div class="news-body">' + paragraphs(it.body) + "</div>" +
      '<p class="news-foot"><a class="btn" href="webshop.html">Naar de webshop</a> <a class="news-back" href="#">← Meer nieuws</a></p>';
    window.scrollTo(0, 0);
  }

  function route() {
    var slug = decodeURIComponent(location.hash.slice(1));
    var it = slug && items.find(function (x) { return x.slug === slug; });
    if (it) showItem(it); else showList();
  }

  fetch("/api/news", { headers: { Accept: "application/json" } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { items = d.news || []; route(); })
    .catch(function () { $("news-list").innerHTML = '<p class="news-empty">Het nieuws kan nu niet worden geladen. Probeer het later opnieuw.</p>'; });
  window.addEventListener("hashchange", route);
})();
