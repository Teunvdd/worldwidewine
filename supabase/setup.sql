-- WorldWideWine.nl — complete database-installatie voor Supabase
-- Plak dit hele bestand in Supabase → SQL Editor → New query, en klik op Run.
-- (Dit zijn de bestanden uit supabase/migrations achter elkaar. Je kunt het veilig opnieuw uitvoeren.)

-- ================================================================
-- 20261012000000_init.sql
-- ================================================================
-- WorldWideWine.nl — databaseschema voor Supabase
--
-- Uitvoeren: Supabase dashboard → SQL Editor → plak dit bestand → Run.
-- (of met de Supabase CLI: supabase db push)
--
-- Beveiliging: alle tabellen hebben Row Level Security aan zonder policies, en de
-- publieke rollen (anon, authenticated) hebben geen rechten. Alleen de serverfuncties
-- op Vercel (met de service_role-sleutel) kunnen lezen en schrijven.

-- ---------------------------------------------------------------- tabellen

create table if not exists public.products (
  id           text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null,
  producer     text not null,
  type         text not null check (type in ('rood', 'wit', 'rose', 'mousserend', 'likeur', 'delicatessen', 'water')),
  country      text,
  region       text,
  grape        text,
  vintage      integer,
  size         text,
  unit         text not null default 'fles',
  bottles      integer not null default 1 check (bottles >= 0),
  price        numeric(10,2) check (price >= 0),          -- null = prijs op aanvraag
  old_price    numeric(10,2),
  cost         numeric(10,2),                             -- inkoopprijs, alleen intern
  vat          smallint check (vat in (9, 21)),           -- null = automatisch
  tags         text[] not null default '{}',
  pickup_only  boolean not null default false,
  stock        integer,                                   -- null = voorraad niet bijhouden
  min_stock    integer default 6,
  ean          text unique,
  webshop      boolean not null default true,
  active       boolean not null default true,
  image        text,
  description  text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  email       text unique check (email is null or email = lower(email)),
  phone       text,
  address     text,
  postcode    text,
  city        text,
  company     text,
  note        text,
  newsletter  boolean not null default false,
  source      text not null default 'webshop',
  created_at  timestamptz not null default now()
);

create table if not exists public.orders (
  number             text primary key,
  channel            text not null check (channel in ('webshop', 'winkel')),
  created_at         timestamptz not null default now(),
  status             text not null check (status in ('nieuw', 'betaald', 'klaar', 'verzonden', 'afgerond', 'geannuleerd')),
  payment_method     text not null,
  payment_status     text not null default 'open' check (payment_status in ('open', 'betaald', 'mislukt')),
  mollie_payment_id  text,
  subtotal           numeric(10,2) not null,
  discount           numeric(10,2) not null default 0,
  discount_info      jsonb,
  shipping           numeric(10,2) not null default 0,
  total              numeric(10,2) not null,
  vat                jsonb not null default '[]',
  delivery           text,
  delivery_label     text,
  customer_id        uuid references public.customers(id) on delete set null,
  customer           jsonb,                                -- gegevens zoals op het moment van bestellen
  notes              text,
  pickup_moment      text,
  cash               jsonb,
  history            jsonb not null default '[]'
);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_customer_idx on public.orders (customer_id);

create table if not exists public.order_lines (
  order_number  text not null references public.orders(number) on delete cascade,
  line_no       integer not null,
  product_id    text references public.products(id) on delete set null,
  name          text not null,
  unit          text,
  qty           integer not null check (qty > 0),
  price         numeric(10,2) not null,
  total         numeric(10,2) not null,
  vat           smallint not null,
  primary key (order_number, line_no)
);
create index if not exists order_lines_product_idx on public.order_lines (product_id);

create table if not exists public.stock_movements (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  product_id  text references public.products(id) on delete set null,
  name        text not null,
  before      integer,
  after       integer,
  delta       integer,
  reason      text not null,
  ref         text
);
create index if not exists stock_movements_at_idx on public.stock_movements (at desc);

create table if not exists public.counters (
  key    text primary key,
  day    text not null,
  value  integer not null
);

-- ---------------------------------------------------------------- functies
-- Deze functies draaien elk in één transactie, zodat webshop en kassa elkaar
-- nooit in de weg zitten (rijen worden vergrendeld tijdens de wijziging).

-- Voorraad wijzigen. p_changes: [{ "id": "...", "delta": -2 }] of [{ "id": "...", "set": 12 | null }]
-- Met p_strict = true wordt een negatieve voorraad geweigerd (webshop).
create or replace function public.www_adjust_stock(p_changes jsonb, p_reason text, p_ref text, p_strict boolean)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  ch jsonb;
  p public.products%rowtype;
  v_before integer;
  v_after integer;
  v_moves jsonb := '[]'::jsonb;
begin
  -- Vaste volgorde voorkomt deadlocks tussen gelijktijdige bestellingen.
  for ch in select e from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) e order by e->>'id' loop
    select * into p from public.products where id = ch->>'id' for update;
    if not found then
      raise exception 'Product % niet gevonden.', ch->>'id' using errcode = 'P0002';
    end if;
    v_before := p.stock;
    if ch ? 'set' then
      v_after := case when jsonb_typeof(ch->'set') = 'null' or ch->>'set' = '' then null else (ch->>'set')::integer end;
    else
      if v_before is null then continue; end if;   -- voorraad wordt niet bijgehouden
      v_after := v_before + (ch->>'delta')::integer;
    end if;
    if p_strict and v_after is not null and v_after < 0 then
      raise exception 'Van % % zijn er nog maar % op voorraad.', p.producer, p.name, greatest(0, coalesce(v_before, 0))
        using errcode = 'P0001';
    end if;
    update public.products set stock = v_after, updated_at = now() where id = p.id;
    insert into public.stock_movements (product_id, name, before, after, delta, reason, ref)
    values (p.id, p.producer || ' — ' || p.name, v_before, v_after,
            case when v_after is null or v_before is null then null else v_after - v_before end, p_reason, p_ref);
    v_moves := v_moves || jsonb_build_object('id', p.id, 'before', v_before, 'after', v_after);
  end loop;
  return v_moves;
end;
$$;

-- Bestelling of kassaverkoop opslaan en voorraad afboeken, in één transactie.
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

  insert into public.order_lines (order_number, line_no, product_id, name, unit, qty, price, total, vat)
  select p_order->>'number', t.ord, t.l->>'id', t.l->>'name', t.l->>'unit',
         (t.l->>'qty')::integer, (t.l->>'price')::numeric, (t.l->>'total')::numeric, (t.l->>'vat')::smallint
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);
end;
$$;

-- Status van een bestelling wijzigen. Bij annuleren gaat de voorraad terug.
create or replace function public.www_set_order_status(p_number text, p_status text, p_note text)
returns void
language plpgsql
set search_path = public
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where number = p_number for update;
  if not found then raise exception 'Bestelling niet gevonden.' using errcode = 'P0002'; end if;
  if o.status = p_status then return; end if;
  if o.status = 'geannuleerd' then
    raise exception 'Een geannuleerde bestelling kan niet meer worden gewijzigd.' using errcode = 'P0001';
  end if;
  if p_status = 'geannuleerd' then
    perform public.www_adjust_stock(
      (select coalesce(jsonb_agg(jsonb_build_object('id', product_id, 'delta', qty)), '[]'::jsonb)
         from public.order_lines where order_number = p_number and product_id is not null),
      'Bestelling geannuleerd', p_number, false);
  end if;
  update public.orders set
    status = p_status,
    payment_status = case when p_status = 'betaald' then 'betaald' else payment_status end,
    history = history || jsonb_build_object('at', now(), 'status', p_status, 'note', coalesce(p_note, ''))
  where number = p_number;
end;
$$;

-- Betaalstatus bijwerken (Mollie). Een betaalde nieuwe bestelling wordt 'betaald'.
create or replace function public.www_set_payment_status(p_number text, p_payment_status text, p_mollie_id text)
returns void
language plpgsql
set search_path = public
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where number = p_number for update;
  if not found then raise exception 'Bestelling niet gevonden.' using errcode = 'P0002'; end if;
  update public.orders set mollie_payment_id = coalesce(p_mollie_id, mollie_payment_id) where number = p_number;
  if o.payment_status = p_payment_status then return; end if;
  update public.orders set
    payment_status = p_payment_status,
    status = case when p_payment_status = 'betaald' and status = 'nieuw' then 'betaald' else status end,
    history = history || jsonb_build_object('at', now(),
      'status', case when p_payment_status = 'betaald' and status = 'nieuw' then 'betaald' else status end,
      'note', 'Betaling: ' || p_payment_status)
  where number = p_number;
end;
$$;

-- Volgend bonnummer voor de kassa (telt per dag opnieuw vanaf 1).
create or replace function public.www_next_receipt(p_day text)
returns integer
language sql
set search_path = public
as $$
  insert into public.counters as c (key, day, value) values ('pos', p_day, 1)
  on conflict (key) do update
    set value = case when c.day = excluded.day then c.value + 1 else 1 end, day = excluded.day
  returning value;
$$;

-- ---------------------------------------------------------------- rechten

alter table public.products        enable row level security;
alter table public.customers       enable row level security;
alter table public.orders          enable row level security;
alter table public.order_lines     enable row level security;
alter table public.stock_movements enable row level security;
alter table public.counters        enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.www_adjust_stock(jsonb, text, text, boolean),
                           public.www_create_order(jsonb, jsonb, boolean, text),
                           public.www_set_order_status(text, text, text),
                           public.www_set_payment_status(text, text, text),
                           public.www_next_receipt(text)
  from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.www_adjust_stock(jsonb, text, text, boolean),
                          public.www_create_order(jsonb, jsonb, boolean, text),
                          public.www_set_order_status(text, text, text),
                          public.www_set_payment_status(text, text, text),
                          public.www_next_receipt(text)
  to service_role;

-- ================================================================
-- 20261013000000_kassa.sql
-- ================================================================
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

-- ================================================================
-- 20261014000000_instellingen.sql
-- ================================================================
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

-- ================================================================
-- 20261015000000_categorieen.sql
-- ================================================================
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
