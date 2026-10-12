/* Foto's voor de slideshow op de pagina Proeverijen. */
(function () {
  var e = A.esc;

  function render(el) {
    return A.api("GET", "tasting-photos").then(function (r) { draw(el, r.photos || []); });
  }

  function draw(el, photos) {
    el.innerHTML =
      "<header class='page-head'><div><h1>Foto's proeverijen</h1><p class='muted'>Deze foto's lopen als slideshow op de pagina <a href='/proeverijen.html' target='_blank' rel='noopener'>Proeverijen</a>, in deze volgorde. Liggende foto's werken het mooist.</p></div></header>" +
      "<div class='card photo-drop' id='ph-drop'><div><strong>Sleep foto's hierheen</strong><span class='muted small'>of</span>" +
        "<label class='btn btn-primary'>Foto's kiezen…<input type='file' id='ph-file' accept='image/jpeg,image/png,image/webp' multiple hidden></label>" +
        "<span class='muted small'>JPG, PNG of WebP. Je kunt er meerdere tegelijk kiezen.</span></div><span class='drop-hint'>Laat los om toe te voegen</span></div>" +
      (photos.length ? "<div class='photo-grid' id='ph-grid'>" + photos.map(function (p, i) {
        return "<figure class='photo-card' data-i='" + i + "'><div class='photo-img'><img src='" + e(p.url) + "' alt=''><span class='photo-n'>" + (i + 1) + "</span></div>" +
          "<input class='photo-cap' data-cap='" + i + "' maxlength='140' value='" + e(p.caption) + "' placeholder='Onderschrift (optioneel)' aria-label='Onderschrift'>" +
          "<div class='photo-tools'><button type='button' class='btn btn-sm' data-move='-1'" + (i ? "" : " disabled") + " aria-label='Naar voren'>←</button>" +
          "<button type='button' class='btn btn-sm' data-move='1'" + (i < photos.length - 1 ? "" : " disabled") + " aria-label='Naar achteren'>→</button>" +
          "<span class='spacer'></span><button type='button' class='btn btn-sm btn-danger-ghost' data-del>Verwijderen</button></div></figure>";
      }).join("") + "</div>" : "<div class='card'><p class='empty-inline'>Nog geen foto's. Zolang er geen foto's zijn, toont de pagina Proeverijen alleen de tekst.</p></div>");

    function save(list, msg) {
      return A.api("POST", "tasting-photos", { photos: list }).then(function (r) { if (msg) A.toast(msg); draw(el, r.photos); })
        .catch(function (err) { A.toast(err.message, "error"); });
    }
    function upload(files) {
      files = Array.prototype.filter.call(files || [], function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); });
      if (!files.length) return A.toast("Kies JPG-, PNG- of WebP-foto's.", "error");
      var drop = el.querySelector("#ph-drop"), done = 0, last = null;
      drop.classList.add("busy");
      drop.querySelector("strong").textContent = "Uploaden… 0 van " + files.length;
      files.reduce(function (chain, f) {
        return chain.then(function () {
          return A.resizeImage(f, 1800).then(function (dataUrl) { return A.api("POST", "tasting-photos/add", { image: dataUrl }); })
            .then(function (r) { last = r.photos; done++; drop.querySelector("strong").textContent = "Uploaden… " + done + " van " + files.length; })
            .catch(function (err) { A.toast(f.name + ": " + err.message, "error"); });
        });
      }, Promise.resolve()).then(function () {
        if (done) A.toast(done === 1 ? "Foto toegevoegd" : done + " foto's toegevoegd");
        if (last) draw(el, last); else render(el);
      });
    }

    el.querySelector("#ph-file").addEventListener("change", function () { upload(this.files); });
    var drop = el.querySelector("#ph-drop"), depth = 0;
    drop.addEventListener("dragenter", function (ev) { ev.preventDefault(); depth++; drop.classList.add("dragging"); });
    drop.addEventListener("dragover", function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; });
    drop.addEventListener("dragleave", function () { if (--depth <= 0) { depth = 0; drop.classList.remove("dragging"); } });
    drop.addEventListener("drop", function (ev) { ev.preventDefault(); depth = 0; drop.classList.remove("dragging"); upload(ev.dataTransfer.files); });

    var grid = el.querySelector("#ph-grid");
    if (!grid) return;
    function current() {
      return photos.map(function (p, i) { return { url: p.url, caption: grid.querySelector("[data-cap='" + i + "']").value }; });
    }
    grid.addEventListener("change", function (ev) { if (ev.target.dataset.cap != null) save(current(), "Onderschrift opgeslagen"); });
    grid.addEventListener("click", function (ev) {
      var card = ev.target.closest(".photo-card"); if (!card) return;
      var i = Number(card.dataset.i), list = current();
      var mv = ev.target.closest("[data-move]");
      if (mv) {
        var j = i + Number(mv.dataset.move);
        var t = list[i]; list[i] = list[j]; list[j] = t;
        return save(list);
      }
      if (ev.target.closest("[data-del]")) {
        A.confirm("Foto verwijderen?", "De foto verdwijnt uit de slideshow op de pagina Proeverijen.", "Verwijderen", true).then(function (ok) {
          if (ok) { list.splice(i, 1); save(list, "Foto verwijderd"); }
        });
      }
    });
  }

  A.register("proeverij-fotos", { render: render });
})();
