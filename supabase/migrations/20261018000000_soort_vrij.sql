-- Soort vrij in te vullen per product (bijv. "Oranje wijn" of "Port"). De vaste soorten
-- (rood, wit, rose, mousserend, likeur, delicatessen, water) blijven werken zoals voorheen.
-- Uitvoeren na de eerdere migraties: Supabase → SQL Editor → plakken → Run.

alter table public.products drop constraint if exists products_type_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_type_len') then
    alter table public.products add constraint products_type_len check (length(trim(type)) between 1 and 40);
  end if;
end $$;
