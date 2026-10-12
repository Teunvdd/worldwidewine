/* Slideshow op de pagina Proeverijen. De foto's staan vast in proeverijen.html (assets/proeverijen/).
 * Een foto die (nog) niet bestaat wordt overgeslagen; zonder foto's blijft alleen de tekst staan. */
(function () {
  var box = document.getElementById("slideshow");
  if (!box) return;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var figs = Array.prototype.slice.call(box.querySelectorAll(".slide"));

  // Wacht tot elke foto geladen of mislukt is en houd alleen de goede over.
  Promise.all(figs.map(function (f) {
    var img = f.querySelector("img");
    img.loading = "eager";
    return new Promise(function (done) {
      if (img.complete) return done(img.naturalWidth > 0);
      img.addEventListener("load", function () { done(true); });
      img.addEventListener("error", function () { done(false); });
    });
  })).then(function (ok) {
    figs.forEach(function (f, i) { if (!ok[i]) f.remove(); });
    start(box.querySelectorAll(".slide"));
  });

  function start(slides) {
    if (!slides.length) return;
    box.hidden = false;
    box.parentNode.classList.add("has-slides");
    slides.forEach(function (s, i) { s.classList.toggle("is-active", !i); s.setAttribute("aria-hidden", i ? "true" : "false"); });
    if (slides.length < 2) return;
    box.insertAdjacentHTML("beforeend", "<button class='slide-nav prev' type='button' aria-label='Vorige foto'>‹</button><button class='slide-nav next' type='button' aria-label='Volgende foto'>›</button>" +
      "<div class='slide-dots'>" + Array.prototype.map.call(slides, function (s, i) { return "<button type='button' aria-label='Foto " + (i + 1) + "'" + (i ? "" : " aria-current='true'") + "></button>"; }).join("") + "</div>");

    var dots = box.querySelectorAll(".slide-dots button"), cur = 0, timer;
    function show(n) {
      cur = (n + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle("is-active", i === cur); s.setAttribute("aria-hidden", i === cur ? "false" : "true"); });
      dots.forEach(function (d, i) { if (i === cur) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
    }
    function stop() { clearInterval(timer); }
    function play() { stop(); if (!still) timer = setInterval(function () { show(cur + 1); }, 5000); }
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
})();
