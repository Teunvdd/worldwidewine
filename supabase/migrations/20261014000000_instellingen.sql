-- Instellingen (o.a. kassa-instellingen uit de admin).
-- Uitvoeren na de eerdere migraties: Supabase → SQL Editor → plakken → Run.

create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

alter table public.settings enable row level security;
revoke all on public.settings from anon, authenticated;
grant all on public.settings to service_role;
