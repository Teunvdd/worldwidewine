-- Productcategorieën (o.a. voor de knoppen boven de producten in de kassa).
-- Uitvoeren na de eerdere migraties: Supabase → SQL Editor → plakken → Run.

create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text not null check (length(trim(name)) between 1 and 40),
  color       text check (color is null or color ~ '^#[0-9a-f]{6}$'),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists categories_name_key on public.categories (lower(name));

alter table public.products add column if not exists category_id bigint references public.categories(id) on delete set null;
create index if not exists products_category_idx on public.products (category_id);

alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;
grant all on public.categories to service_role;

-- PostgREST (de API van Supabase) direct de nieuwe kolom laten zien.
notify pgrst, 'reload schema';
