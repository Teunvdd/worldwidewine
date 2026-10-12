/* Bedankpagina: toont de bestelling en (bij online betalen) de betaalstatus. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem("wwwLastOrder") || "null"); } catch (e) {}
  if (!saved) return;

  $("order-no").hidden = false;
  $("order-no").textContent = "Ordernummer: " + saved.number;
  $("order-text").hidden = false;
  $("order-text").textContent = saved.text;

  var pickup = saved.order && saved.order.delivery && saved.order.delivery.pickup;
  var steps = {
    "bij-afhalen": "Je betaalt bij het afhalen met pin of contant. We laten je weten wanneer je bestelling klaarstaat.",
    "betaalverzoek": "Je ontvangt van ons een bevestiging met een betaallink. Na betaling maken we je bestelling klaar" +
      (pickup ? " om af te halen." : " en " + (saved.data.bezorging === "postnl" ? "versturen we hem met PostNL." : "bezorgen we hem bij je thuis.")),
    "online": "We controleren je betaling…"
  };

  function setSteps(text) { $("next-steps").innerHTML = "<p>" + window.WWW.esc(text) + "</p>"; }

  if (saved.viaMail) {
    $("thanks-title").textContent = "Bijna klaar!";
    $("thanks-lead").textContent = "Je mailprogramma is geopend met je bestelling. Verstuur die e-mail om je bestelling definitief te maken.";
    setSteps("Is er geen e-mail geopend? Stuur dan het overzicht hieronder naar info@worldwidewine.nl, of bel ons.");
    return;
  }

  if (saved.paymentFailed) {
    setSteps("Online betalen lukte op dit moment niet, maar je bestelling is wel ontvangen. " + steps.betaalverzoek);
    return;
  }

  setSteps(steps[saved.payment] || steps.betaalverzoek);

  if (saved.payment === "online") {
    fetch("/api/payment-status?order=" + encodeURIComponent(saved.number))
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (s.status === "betaald") {
          setSteps("Je betaling is gelukt. " + (pickup ? "We laten je weten wanneer je bestelling klaarstaat." : "We maken je bestelling zo snel mogelijk klaar voor verzending."));
        } else if (s.status === "open") {
          setSteps("Je betaling wordt nog verwerkt. Je ontvangt een bevestiging zodra die binnen is.");
        } else {
          $("thanks-title").textContent = "Betaling niet gelukt";
          $("thanks-lead").textContent = "Je bestelling is wel ontvangen, maar de betaling is niet afgerond.";
          setSteps("Geen zorgen: we sturen je een betaalverzoek per e-mail. Je kunt ook bij het afhalen betalen.");
        }
      })
      .catch(function () { setSteps("We hebben je bestelling ontvangen. Je ontvangt een bevestiging zodra de betaling binnen is."); });
  }
})();
