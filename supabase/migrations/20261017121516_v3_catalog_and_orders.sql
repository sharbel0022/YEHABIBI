-- V3 bygger vidare på V2. Inga publika databasanrop: Next.js granskar alla anrop.
create table public.dishes (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  title text not null, description text not null default '', allergens text[] not null default '{}',
  price_ore integer not null check(price_ore between 0 and 10000000),
  portion_label text not null default '1 portion', image_url text,
  active boolean not null default false, sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(), name text not null,
  postal_prefixes text[] not null check(cardinality(postal_prefixes) between 1 and 100 and array_position(postal_prefixes,null) is null and array_to_string(postal_prefixes,',') ~ '^([0-9]{1,5})(,[0-9]{1,5})*$'),
  fee_ore integer not null check(fee_ore between 0 and 10000000), active boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '',
  media_url text, starts_at timestamptz not null, ends_at timestamptz not null check(ends_at > starts_at),
  menu_ids uuid[] not null default '{}', active boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.orders add column delivery_zone_id uuid references public.delivery_zones(id) on delete restrict;
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check(status in ('new','changes_requested','approved','preparing','rejected','ready','completed','cancelled'));
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  dish_id uuid references public.dishes(id) on delete restrict, menu_id uuid references public.menus(id) on delete restrict,
  title text not null, quantity integer not null check(quantity between 1 and 1000),
  unit_price_ore integer not null check(unit_price_ore > 0), total_ore integer not null check(total_ore > 0),
  check((dish_id is null) <> (menu_id is null)), check(total_ore = unit_price_ore * quantity)
);
create index order_items_order_idx on public.order_items(order_id);
create table public.owner_push_tokens (
  token text primary key, admin_user_id uuid not null references auth.users(id) on delete cascade,
  last_ticket_id text, last_ticket_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.dishes enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.campaigns enable row level security;
alter table public.order_items enable row level security;
alter table public.owner_push_tokens enable row level security;
revoke all on public.dishes,public.delivery_zones,public.campaigns,public.order_items,public.owner_push_tokens from public,anon,authenticated;
grant all on public.dishes,public.delivery_zones,public.campaigns,public.order_items,public.owner_push_tokens to service_role;

-- En transaktion sparar order och prissatta rader tillsammans. Ingen SECURITY DEFINER.
-- Endast service_role får köra funktionen; priser och zon hämtas/låses på nytt här.
create or replace function public.create_catering_order(p_order jsonb, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_settings public.business_settings%rowtype;
  v_zone public.delivery_zones%rowtype;
  v_menu public.menus%rowtype;
  v_dish public.dishes%rowtype;
  v_saved public.orders%rowtype;
  v_item jsonb; v_lines jsonb := '[]'::jsonb;
  v_guests integer := (p_order->>'guests')::integer;
  v_menu_id uuid := (p_order->>'menu_id')::uuid;
  v_zone_id uuid := (p_order->>'delivery_zone_id')::uuid;
  v_quantity integer; v_subtotal bigint := 0; v_fee integer := 0;
  v_title text; v_postal text := regexp_replace(p_order->>'postal_code','\s','','g');
begin
  select * into strict v_settings from public.business_settings where id=1 for share;
  if v_guests not between 1 and 1000 then raise exception 'Invalid guest count'; end if;
  if (p_order->>'event_date')::date < (now() at time zone 'Europe/Stockholm')::date + v_settings.min_advance_days
    or (p_order->>'event_date')::date > (now() at time zone 'Europe/Stockholm')::date + 365 then
    raise exception 'Invalid event date';
  end if;
  if p_order->>'fulfillment'='delivery' then
    if not v_settings.delivery_enabled or v_postal !~ '^\d{5}$' or coalesce(p_order->>'address','')='' or coalesce(p_order->>'city','')='' then
      raise exception 'Delivery unavailable';
    end if;
    select * into v_zone from public.delivery_zones where id=v_zone_id and active for share;
    if not found or not exists(select 1 from unnest(v_zone.postal_prefixes) prefix where v_postal like prefix || '%') then
      raise exception 'Address outside delivery zone';
    end if;
    v_fee := v_zone.fee_ore;
  elsif p_order->>'fulfillment'='pickup' then
    if not v_settings.pickup_enabled then raise exception 'Pickup unavailable'; end if;
    v_zone_id := null;
  else raise exception 'Invalid fulfillment';
  end if;
  if p_order->>'payment_preference'='cash' and (p_order->>'fulfillment'<>'pickup' or not v_settings.cash_enabled) then
    raise exception 'Cash requires pickup';
  end if;
  if v_menu_id is not null then
    if jsonb_array_length(p_items) <> 0 then raise exception 'Choose menu or dishes'; end if;
    select * into v_menu from public.menus where id=v_menu_id and active for share;
    if not found or v_menu.price_ore <= 0 or v_guests < v_menu.min_people then raise exception 'Menu unavailable'; end if;
    v_title := v_menu.title; v_subtotal := v_menu.price_ore::bigint * v_guests;
    v_lines := jsonb_build_array(jsonb_build_object('menu_id',v_menu_id,'dish_id',null,'title',v_title,'quantity',v_guests,'unit_price_ore',v_menu.price_ore,'total_ore',v_subtotal));
  else
    if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Invalid dish selection'; end if;
    if (select count(distinct value->>'dish_id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then raise exception 'Duplicate dishes'; end if;
    v_title := 'Egen catering';
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_quantity := (v_item->>'quantity')::integer;
      select * into v_dish from public.dishes where id=(v_item->>'dish_id')::uuid and active for share;
      if not found or v_dish.price_ore <= 0 or v_quantity not between 1 and 1000 then raise exception 'Dish unavailable'; end if;
      v_subtotal := v_subtotal + v_dish.price_ore::bigint * v_quantity;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('menu_id',null,'dish_id',v_dish.id,'title',v_dish.title,'quantity',v_quantity,'unit_price_ore',v_dish.price_ore,'total_ore',v_dish.price_ore::bigint * v_quantity));
    end loop;
  end if;
  if v_subtotal + v_fee > 100000000 or v_subtotal <= 0 then raise exception 'Invalid total'; end if;
  if v_subtotal <> (p_order->>'subtotal_ore')::bigint or v_fee <> (p_order->>'delivery_fee_ore')::integer then
    raise exception 'Price changed; refresh catalog';
  end if;
  insert into public.orders(id,code,tracking_hash,menu_id,menu_title,price_per_person_ore,guests,occasion,event_date,event_time,
    fulfillment,address,postal_code,city,full_name,email,phone,notes,subtotal_ore,delivery_fee_ore,total_ore,
    payment_preference,payment_status,status,delivery_zone_id)
  values((p_order->>'id')::uuid,p_order->>'code',p_order->>'tracking_hash',v_menu_id,v_title,round(v_subtotal::numeric/v_guests),v_guests,
    p_order->>'occasion',(p_order->>'event_date')::date,p_order->>'event_time',p_order->>'fulfillment',
    case when p_order->>'fulfillment'='delivery' then p_order->>'address' else '' end,
    case when p_order->>'fulfillment'='delivery' then v_postal else '' end,
    case when p_order->>'fulfillment'='delivery' then p_order->>'city' else '' end,
    p_order->>'full_name',p_order->>'email',p_order->>'phone',coalesce(p_order->>'notes',''),v_subtotal,v_fee,v_subtotal+v_fee,
    p_order->>'payment_preference','unpaid','new',v_zone_id) returning * into v_saved;
  insert into public.order_items(order_id,dish_id,menu_id,title,quantity,unit_price_ore,total_ore)
  select v_saved.id,(line->>'dish_id')::uuid,(line->>'menu_id')::uuid,line->>'title',
    (line->>'quantity')::integer,(line->>'unit_price_ore')::integer,(line->>'total_ore')::integer from jsonb_array_elements(v_lines) line;
  return to_jsonb(v_saved);
end; $$;
revoke all on function public.create_catering_order(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_catering_order(jsonb,jsonb) to service_role;

-- CAS: ett sent adminanrop får aldrig skriva över en betald order eller nyare session.
create or replace function public.attach_catering_checkout(
  p_order_id uuid,p_expected_status text,p_expected_payment_status text,
  p_expected_session_id text,p_session_id text,p_checkout_url text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_saved public.orders%rowtype;
begin
  if p_expected_status not in ('approved','preparing','ready') or p_expected_payment_status not in ('unpaid','pending','failed')
    or coalesce(p_session_id,'')='' or coalesce(p_checkout_url,'') not like 'https://%' then return null; end if;
  update public.orders set stripe_checkout_session_id=p_session_id,checkout_url=p_checkout_url,payment_status='pending',updated_at=now()
  where id=p_order_id and status=p_expected_status and payment_status=p_expected_payment_status
    and stripe_checkout_session_id is not distinct from p_expected_session_id
  returning * into v_saved;
  if not found then return null; end if;
  return to_jsonb(v_saved);
end; $$;
revoke all on function public.attach_catering_checkout(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.attach_catering_checkout(uuid,text,text,text,text,text) to service_role;
