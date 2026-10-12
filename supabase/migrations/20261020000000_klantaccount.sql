-- Mijn account: klanten loggen in met een eenmalige code per e-mail.
-- Uitvoeren na de eerdere migraties: Supabase → SQL Editor → plakken → Run.

create table if not exists public.customer_logins (
  id          bigint generated always as identity primary key,
  email       text not null,
  code_hash   text not null,
  attempts    integer not null default 0,
  used        boolean not null default false,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists customer_logins_email_idx on public.customer_logins (email, created_at desc);

alter table public.customer_logins enable row level security;
revoke all on public.customer_logins from anon, authenticated;
grant all on public.customer_logins to service_role;

notify pgrst, 'reload schema';
