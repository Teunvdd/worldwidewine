-- Verkoop per doos: per product instelbaar (aantal flessen per doos en eventueel een eigen doosprijs).
-- De voorraad blijft in losse flessen; een verkochte doos boekt het aantal flessen in de doos af.
-- Uitvoeren na de eerdere migraties: Supabase → SQL Editor → plakken → Run.

alter table public.products add column if not exists case_size integer
  check (case_size is null or case_size between 2 and 99);                        -- leeg = niet per doos te koop
alter table public.products add column if not exists case_price numeric(10,2)
  check (case_price is null or case_price >= 0);                                  -- leeg = flesprijs × aantal

alter table public.order_lines add column if not exists pack_size integer not null default 1
  check (pack_size >= 1);                                                         -- flessen per verkochte eenheid

-- Bestelling opslaan: voorraad afboeken in flessen (aantal × flessen per eenheid).
create or replace function public.www_create_order(p_order jsonb, p_lines jsonb, p_strict boolean, p_reason text)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform public.www_adjust_stock(
    (select coalesce(jsonb_agg(jsonb_build_object('id', l->>'id',
       'delta', -((l->>'qty')::integer * coalesce((l->>'packSize')::integer, 1)))), '[]'::jsonb)
       from jsonb_array_elements(p_lines) l),
    p_reason, p_order->>'number', p_strict);

  insert into public.orders
  select * from jsonb_populate_record(null::public.orders, p_order);

  insert into public.order_lines (order_number, line_no, product_id, name, unit, qty, price, total, vat, discount, list_price, pack_size)
  select p_order->>'number', t.ord, t.l->>'id', t.l->>'name', t.l->>'unit',
         (t.l->>'qty')::integer, (t.l->>'price')::numeric, (t.l->>'total')::numeric, (t.l->>'vat')::smallint,
         coalesce((t.l->>'discount')::numeric, 0), (t.l->>'listPrice')::numeric,
         coalesce((t.l->>'packSize')::integer, 1)
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);
end;
$$;

-- Status wijzigen: bij annuleren gaan ook de flessen uit dozen terug op voorraad.
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
      (select coalesce(jsonb_agg(jsonb_build_object('id', product_id, 'delta', qty * pack_size)), '[]'::jsonb)
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

-- PostgREST (de API van Supabase) direct de nieuwe kolommen laten zien.
notify pgrst, 'reload schema';
