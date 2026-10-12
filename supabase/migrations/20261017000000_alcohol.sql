-- Alcoholpercentage per product (bijv. 13,5). Wordt getoond in de webshop en is een filter.
-- Uitvoeren na de eerdere migraties: Supabase → SQL Editor → plakken → Run.

alter table public.products add column if not exists alcohol numeric(4,1)
  check (alcohol is null or (alcohol >= 0 and alcohol <= 100));

-- PostgREST (de API van Supabase) direct de nieuwe kolom laten zien.
notify pgrst, 'reload schema';
