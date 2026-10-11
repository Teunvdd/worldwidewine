/*
 * Assortiment van de webshop.
 *
 * Een product toevoegen of aanpassen: kopieer een blok { ... } en pas de velden aan.
 *   id         unieke code, alleen kleine letters, cijfers en streepjes (wordt ook de link)
 *   name       naam van de wijn
 *   producer   wijnhuis
 *   type       rood | wit | rose | mousserend | likeur | delicatessen | water
 *   country    land
 *   region     streek / appellation
 *   grape      druif (optioneel)
 *   vintage    jaargang (optioneel)
 *   size       inhoud, bijv. "75 cl"
 *   unit       "fles" of "doos van 6"
 *   bottles    aantal flessen (telt mee voor de PostNL-limiet van 18 flessen)
 *   price      prijs in euro incl. btw. null = prijs op aanvraag (niet online te bestellen)
 *   oldPrice   oude prijs bij een actie (optioneel)
 *   tags       ["nieuw", "actie", "bio", "uitgelicht"] (optioneel)
 *   pickupOnly true = alleen afhalen (bijv. verse producten)
 *   stock      false = tijdelijk uitverkocht
 *   image      pad naar een foto, bijv. "assets/producten/montemercurio-messaggero.jpg" (optioneel)
 *   description korte omschrijving
 */
(function (root) {
  var PRODUCTS = [
    {
      id: "torre-a-cona-vermentino",
      name: "Vermentino DOC",
      producer: "Torre a Cona",
      type: "wit", country: "Italië", region: "Toscane", grape: "Vermentino", vintage: 2024,
      size: "75 cl", unit: "fles", bottles: 1, price: 20.00,
      tags: ["uitgelicht"],
      description: "Fris en zilt, met tonen van citrus, groene appel en witte bloemen. Van het historische landgoed Torre a Cona in de heuvels bij Florence. Heerlijk bij vis, schaaldieren en zomerse gerechten."
    },
    {
      id: "torre-a-cona-vermentino-doos",
      name: "Vermentino DOC — doos van 6",
      producer: "Torre a Cona",
      type: "wit", country: "Italië", region: "Toscane", grape: "Vermentino", vintage: 2024,
      size: "6 × 75 cl", unit: "doos van 6", bottles: 6, price: 108.00, oldPrice: 120.00,
      tags: ["actie"],
      description: "Onze populaire Vermentino per doos, met doosvoordeel. Fris, zilt en veelzijdig: de ideale huiswijn voor de zomer."
    },
    {
      id: "montemercurio-messaggero",
      name: "Vino Nobile di Montepulciano DOCG “Messaggero”",
      producer: "Montemercurio",
      type: "rood", country: "Italië", region: "Montepulciano, Toscane", grape: "Sangiovese (Prugnolo Gentile)",
      size: "75 cl", unit: "fles", bottles: 1, price: 23.00,
      tags: ["uitgelicht"],
      description: "Sangiovese met diepgang van een kleine, ambachtelijke producent in Montepulciano. Rijp rood fruit, kruidigheid en een lange, zijdezachte afdronk. Bij wild, stoofvlees en belegen kazen."
    },
    {
      id: "montemercurio-tedicciolo",
      name: "Rosso Toscana IGT “Tedicciolo”",
      producer: "Montemercurio",
      type: "rood", country: "Italië", region: "Toscane",
      size: "75 cl", unit: "fles", bottles: 1, price: 10.00, oldPrice: 11.00,
      tags: ["actie"],
      description: "Het toegankelijke broertje van de Messaggero. Sappig en soepel, met kersen en een vleugje kruiden. Een fijne doordrinker bij pasta en pizza."
    },
    {
      id: "dezzani-langhe-nebbiolo-doos",
      name: "Langhe Nebbiolo — doos van 6",
      producer: "Dezzani",
      type: "rood", country: "Italië", region: "Langhe, Piëmont", grape: "Nebbiolo",
      size: "6 × 75 cl", unit: "doos van 6", bottles: 6, price: 68.40, oldPrice: 72.00,
      tags: ["actie"],
      description: "Nebbiolo uit de Langhe: elegant, met rode kers, rozen en zachte tannines. Per doos met voordeel."
    },
    {
      id: "rainoldi-zapel-bianco",
      name: "Zapel Bianco",
      producer: "Aldo Rainoldi",
      type: "wit", country: "Italië", region: "Valtellina, Lombardije",
      size: "75 cl", unit: "fles", bottles: 1, price: 11.90, oldPrice: 17.00,
      tags: ["actie"],
      description: "Frisse witte wijn van Aldo Rainoldi, het bekende wijnhuis uit de Valtellina aan de voet van de Alpen. Levendig en aromatisch, als aperitief of bij lichte gerechten."
    },
    {
      id: "garganega-garda",
      name: "Garganega — Garda DOC",
      producer: "Garda DOC",
      type: "wit", country: "Italië", region: "Garda, Veneto", grape: "Garganega",
      size: "75 cl", unit: "fles", bottles: 1, price: 14.00,
      description: "Garganega, de druif van de Soave, van de oevers van het Gardameer. Zacht en fruitig, met amandel en witte perzik."
    },
    {
      id: "vezzani-pinot-grigio-doos",
      name: "Pinot Grigio — doos van 6",
      producer: "Vezzani",
      type: "wit", country: "Italië", grape: "Pinot Grigio",
      size: "6 × 75 cl", unit: "doos van 6", bottles: 6, price: 34.20, oldPrice: 36.00,
      tags: ["actie"],
      description: "Frisse, ongecompliceerde Pinot Grigio. Voordelig per doos, perfect voor feestjes en borrels."
    },
    {
      id: "bel-moro-pinot-grigio-rosato-doos",
      name: "Pinot Grigio Rosato — doos van 6",
      producer: "Bel Moro",
      type: "rose", country: "Italië", grape: "Pinot Grigio",
      size: "6 × 75 cl", unit: "doos van 6", bottles: 6, price: 32.40,
      description: "Lichte, droge rosé van Pinot Grigio. Zomers fris met rood fruit. Een voordelige doos voor op het terras."
    },
    {
      id: "blauensteiner-gruner-veltliner-wilbling",
      name: "Grüner Veltliner “Wilbling”",
      producer: "Weingut Leopold Blauensteiner",
      type: "wit", country: "Oostenrijk", region: "Wagram", grape: "Grüner Veltliner",
      size: "75 cl", unit: "fles", bottles: 1, price: 13.00,
      tags: ["bio"],
      description: "Biodynamisch geteelde Grüner Veltliner: fris, met groene appel, citrus en het typische witte-pepertje. Bij Aziatisch, salades en asperges."
    },
    {
      id: "domaine-bernard-pouilly-fuisse",
      name: "Pouilly-Fuissé",
      producer: "Domaine Bernard",
      type: "wit", country: "Frankrijk", region: "Bourgogne (Mâconnais)", grape: "Chardonnay",
      size: "75 cl", unit: "fles", bottles: 1, price: 44.00,
      tags: ["uitgelicht"],
      description: "Volle, elegante Chardonnay uit het zuiden van de Bourgogne. Rijp geel fruit, boter en een mineralige finale. Voor een feestelijk diner."
    },
    {
      id: "karel-de-graaf-meursault-les-narvaux",
      name: "Meursault “Les Narvaux”",
      producer: "Karel de Graaf",
      type: "wit", country: "Frankrijk", region: "Bourgogne (Côte de Beaune)", grape: "Chardonnay",
      size: "75 cl", unit: "fles", bottles: 1, price: 73.00,
      description: "Meursault van de lieu-dit Les Narvaux, hoog op de helling. Rijk en verfijnd, met hazelnoot, citrus en een strakke mineraliteit."
    },
    {
      id: "domaine-daridan-cheverny-blanc",
      name: "Cheverny Blanc",
      producer: "Domaine Daridan",
      type: "wit", country: "Frankrijk", region: "Loire", grape: "Sauvignon Blanc & Chardonnay",
      size: "75 cl", unit: "fles", bottles: 1, price: 14.00,
      description: "Frisse witte wijn uit de Loire, met citrus, kruisbes en een fijne zuurgraad. Bij geitenkaas en visgerechten."
    },
    {
      id: "domaine-de-la-begude-bandol-blanc",
      name: "Bandol Blanc",
      producer: "Domaine de la Bégude",
      type: "wit", country: "Frankrijk", region: "Bandol, Provence",
      size: "75 cl", unit: "fles", bottles: 1, price: 24.00,
      description: "Zeldzame witte Bandol van de Provençaalse kust. Kruidig en rond, met witte bloemen en een zilte frisheid."
    },
    {
      id: "filles-de-septembre-impertinence",
      name: "Impertinence",
      producer: "Domaine Les Filles de Septembre",
      type: "rood", country: "Frankrijk", region: "Côtes de Thongue, Languedoc",
      size: "75 cl", unit: "fles", bottles: 1, price: 12.00,
      description: "Zonnige, sappige rode wijn uit de Languedoc van de broers Géraud. Vol rijp fruit, makkelijk te drinken."
    },
    {
      id: "filles-de-septembre-danae",
      name: "Danaë",
      producer: "Domaine Les Filles de Septembre",
      type: "rood", country: "Frankrijk", region: "Côtes de Thongue, Languedoc",
      size: "75 cl", unit: "fles", bottles: 1, price: 14.00,
      description: "Kruidige rode wijn uit het zuiden van Frankrijk, met donker fruit en garrigue. Bij gegrild vlees."
    },
    {
      id: "filles-de-septembre-clos-marine",
      name: "Clos Marine",
      producer: "Domaine Les Filles de Septembre",
      type: "rood", country: "Frankrijk", region: "Côtes de Thongue, Languedoc",
      size: "75 cl", unit: "fles", bottles: 1, price: 16.00,
      description: "De meest serieuze wijn van het domein: diep, rond en kruidig met een lange afdronk."
    },
    {
      id: "leyre-loup-morgon-2017",
      name: "Morgon",
      producer: "Domaine de Leyre-Loup",
      type: "rood", country: "Frankrijk", region: "Beaujolais", grape: "Gamay", vintage: 2017,
      size: "75 cl", unit: "fles", bottles: 1, price: 14.00,
      description: "Cru uit de Beaujolais met inmiddels mooie rijping. Kers, framboos en een aardse toets. Licht gekoeld schenken."
    },
    {
      id: "domaine-la-colliere-cotes-du-rhone-doos",
      name: "Côtes du Rhône — doos van 6",
      producer: "Domaine la Collière",
      type: "rood", country: "Frankrijk", region: "Rhône", vintage: 2020,
      size: "6 × 75 cl", unit: "doos van 6", bottles: 6, price: 64.80, oldPrice: 72.00,
      tags: ["actie"],
      description: "Warme, kruidige Côtes du Rhône met rijp rood fruit. 10% doosvoordeel."
    },
    {
      id: "chateau-routas-rose-jeroboam",
      name: "Château Routas Rosé — Jeroboam 3 liter",
      producer: "Château Routas",
      type: "rose", country: "Frankrijk", region: "Coteaux Varois en Provence", vintage: 2023,
      size: "300 cl", unit: "fles", bottles: 1, price: 71.00,
      description: "Bleke, droge Provence-rosé in een indrukwekkende 3-literfles. De blikvanger op elk feest."
    },
    {
      id: "wiston-estate-brut",
      name: "Brut — English Sparkling Wine",
      producer: "Wiston Estate",
      type: "mousserend", country: "Engeland", region: "Sussex", grape: "Chardonnay, Pinot Noir, Pinot Meunier",
      size: "75 cl", unit: "fles", bottles: 1, price: 39.00,
      tags: ["uitgelicht"],
      description: "Engelse mousserende wijn volgens de traditionele methode, van de krijtheuvels van de South Downs. Strak, fijn en verrassend: een echte ontdekking."
    },
    {
      id: "champagne-vollereaux-brut-rose",
      name: "Champagne Brut Rosé de Saignée",
      producer: "Champagne Vollereaux",
      type: "mousserend", country: "Frankrijk", region: "Champagne",
      size: "75 cl", unit: "fles", bottles: 1, price: 38.00,
      description: "Rosé champagne gemaakt via saignée: intens van kleur, met aardbei, framboos en een romige mousse."
    },
    {
      id: "koremans-limoncello",
      name: "Limoncello",
      producer: "Koreman's",
      type: "likeur", country: "Nederland",
      size: "50 cl", unit: "fles", bottles: 1, price: 22.00,
      description: "Bekroond met goud op de International Wine & Spirits Competition 2021. Frisse citroenlikeur, ijskoud geschonken als digestief."
    },
    {
      id: "iberico-pata-negra-bellota",
      name: "Ibérico Pata Negra Bellota — 100 gram gesneden",
      producer: "Ibérico",
      type: "delicatessen", country: "Spanje",
      size: "100 gram", unit: "stuk", bottles: 0, price: 13.00,
      pickupOnly: true,
      description: "De beste Spaanse ham, van eikelgevoerde Ibérico-varkens. Vers gesneden. Alleen af te halen in Zaandam of Weesp."
    },
    {
      id: "lauretana-water-pallet",
      name: "Lauretana mineraalwater — per pallet",
      producer: "Lauretana",
      type: "water", country: "Italië", region: "Monte Rosa, Alpen",
      size: "glas of PET, 0,5 / 1,0 / 1,5 liter", unit: "pallet", bottles: 0, price: null,
      description: "Het lichtste mineraalwater van Europa (14 mg/l), gebotteld aan de bron in de Italiaanse Alpen. Plat of licht bruisend, in glas of PET. Levering per pallet binnen circa 2 à 3 weken. Vraag een offerte aan."
    }
  ];

  if (typeof module !== "undefined" && module.exports) module.exports = PRODUCTS;
  else root.WWW_PRODUCTS = PRODUCTS;
})(this);
