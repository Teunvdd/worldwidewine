-- Kassadiensten (openen/sluiten met kastelling), gesplitste betalingen,
-- korting/prijs per bonregel en productfoto's.
--
-- Uitvoeren na 20261012000000_init.sql: Supabase → SQL Editor → plakken → Run.

-- ---------------------------------------------------------------- kassadiensten

create table if not exists public.pos_sessions (
  id             bigint generated always as identity primary key,
  status         text not null default 'open' check (status in ('open', 'gesloten')),
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  opening_cash   numeric(10,2) not null default 0,   -- beginsaldo in de kassalade
  expected_cash  numeric(10,2),                      -- beginsaldo + contante verkopen
  counted_cash   numeric(10,2),                      -- geteld bij sluiten
  difference     numeric(10,2),                      -- geteld - verwacht
  summary        jsonb,                              -- omzet per betaalwijze, aantal bonnen
  note           text
);
-- Er kan maar één kassadienst tegelijk open zijn.
create unique index if not exists pos_sessions_one_open on public.pos_sessions ((true)) where status = 'open';

alter table public.orders add column if not exists pos_session_id bigint references public.pos_sessions(id) on delete set null;
alter table public.orders add column if not exists payments jsonb;           -- [{ "method": "pin", "amount": 12.5 }, …]
create index if not exists orders_pos_session_idx on public.orders (pos_session_id);

alter table public.order_lines add column if not exists discount numeric(5,2) not null default 0;   -- korting % op de regel
alter table public.order_lines add column if not exists list_price numeric(10,2);                   -- normale prijs (bij aangepaste prijs)

-- Bestelling opslaan: nu ook met korting en normale prijs per regel.
create or replace function public.www_create_order(p_order jsonb, p_lines jsonb, p_strict boolean, p_reason text)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform public.www_adjust_stock(
    (select coalesce(jsonb_agg(jsonb_build_object('id', l->>'id', 'delta', -((l->>'qty')::integer))), '[]'::jsonb)
       from jsonb_array_elements(p_lines) l),
    p_reason, p_order->>'number', p_strict);

  insert into public.orders
  select * from jsonb_populate_record(null::public.orders, p_order);

  insert into public.order_lines (order_number, line_no, product_id, name, unit, qty, price, total, vat, discount, list_price)
  select p_order->>'number', t.ord, t.l->>'id', t.l->>'name', t.l->>'unit',
         (t.l->>'qty')::integer, (t.l->>'price')::numeric, (t.l->>'total')::numeric, (t.l->>'vat')::smallint,
         coalesce((t.l->>'discount')::numeric, 0), (t.l->>'listPrice')::numeric
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);
end;
$$;

-- ---------------------------------------------------------------- rechten

alter table public.pos_sessions enable row level security;
revoke all on public.pos_sessions from anon, authenticated;
grant all on public.pos_sessions to service_role;
revoke execute on function public.www_create_order(jsonb, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.www_create_order(jsonb, jsonb, boolean, text) to service_role;

-- ---------------------------------------------------------------- productfoto's
-- Openbare opslagmap voor productfoto's (Supabase Storage). Iedereen mag de foto's bekijken;
-- uploaden kan alleen via de admin (service_role).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
