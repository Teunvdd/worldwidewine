/* Slideshow met foto's van proeverijen (beheer in de admin: Website → Foto's proeverijen). */
(function () {
  var box = document.getElementById("slideshow");
  if (!box) return;
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function start(photos) {
    if (!photos || !photos.length) return;
    box.hidden = false;
    box.parentNode.classList.add("has-slides");
    box.innerHTML = "<div class='slides'>" + photos.map(function (p, i) {
      return "<figure class='slide" + (i ? "" : " is-active") + "' aria-hidden='" + (i ? "true" : "false") + "'>" +
        "<img src='" + esc(p.url) + "' alt='" + esc(p.caption || "Foto van een proeverij") + "'" + (i ? " loading='lazy'" : "") + ">" +
        (p.caption ? "<figcaption>" + esc(p.caption) + "</figcaption>" : "") + "</figure>";
    }).join("") + "</div>" +
      (photos.length > 1 ? "<button class='slide-nav prev' type='button' aria-label='Vorige foto'>‹</button><button class='slide-nav next' type='button' aria-label='Volgende foto'>›</button>" +
        "<div class='slide-dots'>" + photos.map(function (p, i) { return "<button type='button' aria-label='Foto " + (i + 1) + "'" + (i ? "" : " aria-current='true'") + "></button>"; }).join("") + "</div>" : "");
    if (photos.length < 2) return;

    var slides = box.querySelectorAll(".slide"), dots = box.querySelectorAll(".slide-dots button"), cur = 0, timer;
    function show(n) {
      cur = (n + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle("is-active", i === cur); s.setAttribute("aria-hidden", i === cur ? "false" : "true"); });
      dots.forEach(function (d, i) { if (i === cur) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
    }
    function play() { stop(); if (!still) timer = setInterval(function () { show(cur + 1); }, 5000); }
    function stop() { clearInterval(timer); }
    box.querySelector(".prev").addEventListener("click", function () { show(cur - 1); play(); });
    box.querySelector(".next").addEventListener("click", function () { show(cur + 1); play(); });
    dots.forEach(function (d, i) { d.addEventListener("click", function () { show(i); play(); }); });
    box.addEventListener("mouseenter", stop);
    box.addEventListener("mouseleave", play);
    var x0 = null;
    box.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1));
      play();
    });
    play();
  }

  fetch("/api/shop-info", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (info) { start(info && info.tastingPhotos); })
    .catch(function () {});
})();
