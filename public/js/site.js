(function () {
  // Jaartal in footer
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Header schaduw bij scrollen
  var header = document.querySelector('.site-header');
  function onScroll() { header.classList.toggle('scrolled', window.scrollY > 10); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobiel menu
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  });
  if (nav) nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Elementen laten infaden
  var targets = document.querySelectorAll('.section-head, .card, .bottle, .producers li, .visit-card, .split > *');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
  }

  // Leeftijdscheck (18+)
  var gate = document.getElementById('age-gate');
  var confirmed = false;
  try { confirmed = localStorage.getItem('wwwAge18') === 'ja'; } catch (e) {}
  if (gate && !confirmed) {
    gate.hidden = false;
    document.getElementById('age-yes').focus();
  }
  if (gate) document.getElementById('age-yes').addEventListener('click', function () {
    try { localStorage.setItem('wwwAge18', 'ja'); } catch (e) {}
    gate.hidden = true;
  });

  // Contactformulier: opent het mailprogramma met een ingevuld bericht
  var form = document.getElementById('contact-form');
  if (!form) return;
  var note = form.querySelector('.form-note');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) {
      note.textContent = 'Vul alstublieft je naam, e-mailadres en bericht in.';
      return;
    }
    var d = new FormData(form);
    var subject = d.get('onderwerp') + ' — ' + d.get('naam');
    var body = d.get('bericht') + '\n\n' + d.get('naam') + '\n' + d.get('email');
    window.location.href = 'mailto:info@worldwidewine.nl?subject=' +
      encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    note.textContent = 'Je mailprogramma wordt geopend. Bedankt voor je bericht!';
  });
})();
