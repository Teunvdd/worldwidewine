/* Nieuws: berichten voor de pagina Nieuws op de website (nieuws.html). */
(function () {
  var e = A.esc;

  function status(n) {
    if (!n.published) return "<span class='tag tag-off'>Concept</span>";
    if (new Date(n.publishedAt) > new Date()) return "<span class='tag tag-winkel'>Gepland</span>";
    return "<span class='tag tag-webshop'>Op de website</span>";
  }

  function render(el) {
    return A.api("GET", "news").then(function (r) {
      var list = r.news || [];
      el.innerHTML =
        "<header class='page-head'><div><h1>Nieuws</h1><p class='muted'>Berichten op de pagina <a href='/nieuws.html' target='_blank' rel='noopener'>Nieuws</a> van de website, nieuwste eerst.</p></div>" +
          "<div class='actions'><button class='btn btn-primary' id='n-new'>+ Nieuw bericht</button></div></header>" +
        "<div class='card card-flush'><table class='table table-hover'><thead><tr><th>Bericht</th><th>Datum</th><th>Status</th></tr></thead><tbody>" +
          (list.map(function (n) {
            return "<tr class='clickable' data-nid='" + n.id + "'><td><div class='p-cell'><span class='thumb news-thumb'>" +
              (n.image ? "<img class='p-img' src='" + e(n.image) + "' alt=''>" : "") + "</span>" +
              "<span><strong>" + e(n.title) + "</strong><br><span class='muted small'>" + e(n.body.replace(/\*\*/g, "").slice(0, 90)) + (n.body.length > 90 ? "…" : "") + "</span></span></div></td>" +
              "<td>" + A.date(n.publishedAt) + "</td><td>" + status(n) + "</td></tr>";
          }).join("") || "<tr><td colspan='3' class='empty-inline'>Nog geen berichten. Klik op ‘+ Nieuw bericht’ om te beginnen.</td></tr>") +
        "</tbody></table></div>";
      el.querySelector("#n-new").addEventListener("click", function () { edit(null); });
      el.querySelector("tbody").addEventListener("click", function (ev) {
        var tr = ev.target.closest("[data-nid]");
        if (tr) edit(list.find(function (n) { return String(n.id) === tr.dataset.nid; }));
      });
    });
  }

  function edit(n) {
    var isNew = !n;
    n = n || { title: "", body: "", published: true, publishedAt: new Date().toISOString() };
    var day = new Date(n.publishedAt).toLocaleDateString("sv-SE"); // jjjj-mm-dd
    var body = A.modal(isNew ? "Nieuw bericht" : "Bericht bewerken",
      "<form id='n-form' class='form-grid'>" +
        "<label class='field span-2'>Titel<input name='title' value='" + e(n.title) + "' maxlength='160' required autofocus placeholder='bijv. Nieuwe jaargang Brunello binnen'></label>" +
        "<div class='field span-2'>Foto<div class='img-edit news-img-edit' id='n-drop'><span class='thumb' id='n-thumb'>" + (n.image ? "<img class='p-img' src='" + e(n.image) + "' alt=''>" : "") + "</span>" +
          "<span class='img-edit-actions'><label class='btn btn-sm'>Foto kiezen…<input type='file' id='n-file' accept='image/jpeg,image/png,image/webp' hidden></label>" +
          "<button type='button' class='btn btn-sm btn-ghost' id='n-img-remove'" + (n.image ? "" : " hidden") + ">Foto verwijderen</button>" +
          "<span class='muted small'>Sleep een foto hierheen of kies er een. Liggend formaat werkt het mooist.</span></span>" +
          "<span class='drop-hint'>Laat los om de foto te gebruiken</span></div></div>" +
        "<label class='field span-2'>Tekst<textarea name='body' rows='12' placeholder='Schrijf hier je bericht…'>" + e(n.body) + "</textarea>" +
          "<span class='muted small'>Een lege regel begint een nieuwe alinea. **zo** wordt vet. Links (https://…) worden klikbaar.</span></label>" +
        "<label class='field'>Datum<input type='date' name='date' value='" + e(day) + "' required></label>" +
        "<div class='field'>Zichtbaarheid<label class='check'><input type='checkbox' name='published'" + (n.published ? " checked" : "") + "> Op de website zetten</label>" +
          "<span class='muted small'>Uit = concept, alleen zichtbaar in de admin. Een datum in de toekomst verschijnt pas op die dag.</span></div>" +
        "<div class='actions span-2'>" + (isNew ? "" : "<button type='button' class='btn btn-danger-ghost' id='n-delete'>Verwijderen</button>" +
          (n.published ? "<a class='btn btn-ghost' href='/nieuws.html#" + e(n.slug) + "' target='_blank' rel='noopener'>Bekijk op de website ↗</a>" : "")) +
          "<span class='spacer'></span><button type='button' class='btn' data-modal-close>Annuleren</button><button class='btn btn-primary'>" + (isNew ? "Plaatsen" : "Opslaan") + "</button></div>" +
      "</form>", { wide: true });

    var form = body.querySelector("form");
    var pendingImage; // undefined = ongewijzigd, "" = verwijderen, anders data-URL
    function useFile(file) {
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return A.toast("Kies een JPG-, PNG- of WebP-foto.", "error");
      A.resizeImage(file, 1600).then(function (dataUrl) {
        pendingImage = dataUrl;
        body.querySelector("#n-thumb").innerHTML = "<img class='p-img' src='" + dataUrl + "' alt=''>";
        body.querySelector("#n-img-remove").hidden = false;
      }).catch(function () { A.toast("Deze foto kan niet worden gelezen.", "error"); });
    }
    body.querySelector("#n-file").addEventListener("change", function () { useFile(this.files && this.files[0]); });
    body.querySelector("#n-img-remove").addEventListener("click", function () {
      pendingImage = ""; body.querySelector("#n-thumb").innerHTML = ""; this.hidden = true;
    });
    var drop = body.querySelector("#n-drop"), depth = 0;
    drop.addEventListener("dragenter", function (ev) { ev.preventDefault(); depth++; drop.classList.add("dragging"); });
    drop.addEventListener("dragover", function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; });
    drop.addEventListener("dragleave", function () { if (--depth <= 0) { depth = 0; drop.classList.remove("dragging"); } });
    drop.addEventListener("drop", function (ev) {
      ev.preventDefault(); depth = 0; drop.classList.remove("dragging");
      useFile(ev.dataTransfer.files && ev.dataTransfer.files[0]);
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      // Datum: de gekozen dag, met de tijd van nu (vandaag) of 08:00 (andere dag), zodat volgorde en planning kloppen.
      var d = form.date.value, today = new Date().toLocaleDateString("sv-SE");
      var when = d === today ? new Date() : new Date(d + "T08:00:00");
      if (!isNew && d === new Date(n.publishedAt).toLocaleDateString("sv-SE")) when = new Date(n.publishedAt);
      var input = { title: form.title.value.trim(), body: form.body.value, published: form.published.checked, publishedAt: when.toISOString() };
      if (pendingImage !== undefined) input.image = pendingImage;
      var btn = form.querySelector(".btn-primary");
      A.busy(btn, true, pendingImage ? "Foto uploaden…" : "Opslaan…");
      A.api("POST", isNew ? "news" : "news/" + n.id, input).then(function () {
        A.closeModal(); A.toast(isNew ? "Bericht geplaatst" : "Bericht opgeslagen"); A.route();
      }).catch(function (err) { A.busy(btn, false); A.toast(err.message, "error"); });
    });
    var del = body.querySelector("#n-delete");
    if (del) del.addEventListener("click", function () {
      A.confirm("Bericht verwijderen?", "‘" + n.title + "’ verdwijnt van de website. Dit kan niet ongedaan worden gemaakt.", "Verwijderen", true).then(function (ok) {
        if (!ok) return;
        A.api("DELETE", "news/" + n.id).then(function () { A.toast("Bericht verwijderd"); A.route(); })
          .catch(function (err) { A.toast(err.message, "error"); });
      });
    });
  }

  A.register("nieuws", { render: render });
})();
