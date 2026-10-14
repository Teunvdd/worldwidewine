-- Database leegmaken: alle producten, bestellingen, kassabonnen, klanten, voorraadmutaties,
-- kassadiensten, nieuwsberichten, kassacategorieën en inlogcodes worden verwijderd.
-- De instellingen (kassa-instellingen, openingstijden, afhaaltijden, bezorggebied) blijven staan.
--
-- LET OP: dit kan niet ongedaan worden gemaakt. Maak eventueel eerst een export
-- (admin → Producten → Exporteren en admin → Bestellingen → Exporteren).
--
-- Uitvoeren: Supabase → SQL Editor → plakken → Run.
-- Doe dit pas als de versie van de website live staat waarin het startassortiment maar één keer
-- wordt geplaatst; anders verschijnen de 25 voorbeeldproducten na het leegmaken opnieuw.

begin;

truncate table
  public.order_lines,
  public.orders,
  public.stock_movements,
  public.pos_sessions,
  public.customer_logins,
  public.customers,
  public.news,
  public.products,
  public.categories
restart identity cascade;

-- Bonnummers per dag opnieuw laten beginnen.
truncate table public.counters;

-- Onthouden dat het startassortiment al eens is geplaatst, zodat het niet terugkomt.
insert into public.settings (key, value) values ('seeded', 'true'::jsonb)
on conflict (key) do nothing;

commit;

-- Wil je ook alle instellingen terug naar de standaardwaarden? Voer dan ook dit uit:
--   delete from public.settings where key in ('pos', 'shop');
--
-- Foto's (producten en nieuws) staan apart in Supabase → Storage → product-images.
-- Die kun je daar selecteren en verwijderen; voor de website is dat niet nodig.
