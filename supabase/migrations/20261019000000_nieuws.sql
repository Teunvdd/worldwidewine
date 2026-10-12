-- Nieuwsberichten voor de pagina Nieuws op de website (beheer in de admin).
-- Uitvoeren na de eerdere migraties: Supabase → SQL Editor → plakken → Run.

create table if not exists public.news (
  id            bigint generated always as identity primary key,
  slug          text not null unique,
  title         text not null check (length(trim(title)) between 1 and 160),
  body          text not null default '',
  image         text,
  published     boolean not null default true,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists news_published_idx on public.news (published, published_at desc);

alter table public.news enable row level security;
revoke all on public.news from anon, authenticated;
grant all on public.news to service_role;

notify pgrst, 'reload schema';
