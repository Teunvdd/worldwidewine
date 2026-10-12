# Werkafspraken voor Claude

- **Wijzigingen altijd via een pull request naar `main`**, nooit direct op `main` pushen.
  Vercel weigert deploys van commits die niet aan een GitHub-account van het project gekoppeld zijn;
  de merge door de eigenaar zorgt dat de deploy wel lukt.
- Gebruik daarvoor de werkbranch, start die steeds opnieuw vanaf de nieuwste `main`.
- Draai `npm test` voor het pushen (zie `tests/helpers/local-supabase.js` voor wat er nodig is).
- Verandert de database? Voeg een nieuw bestand toe in `supabase/migrations/`, voeg het ook toe
  aan `supabase/setup.sql` en zeg erbij dat setup.sql opnieuw uitgevoerd moet worden.
- Teksten op de site en in de admin zijn in het Nederlands.
