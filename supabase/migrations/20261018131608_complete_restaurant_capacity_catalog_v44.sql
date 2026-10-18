-- Complete V4.4 is additive. Existing order/payment/history rows are not repriced.
alter table public.menus
  add column package_group text not null default '',add column size_label text not null default '',
  add column catering_price_ore integer check(catering_price_ore between 0 and 10000000),
  add column availability_state text not null default 'available' check(availability_state in ('available','paused','sold_out')),
  add column kitchen_units integer not null default 1 check(kitchen_units between 1 and 10000),
  add column allowed_addon_ids uuid[] not null default '{}';
update public.menus set catering_price_ore=price_ore;
alter table public.dishes add column direct_addon_enabled boolean not null default false,
  add column kitchen_units integer not null default 1 check(kitchen_units between 1 and 10000),
  add column preparation_minutes integer not null default 0 check(preparation_minutes between 0 and 1440);
alter table public.delivery_zones add column capacity_per_slot integer not null default 4 check(capacity_per_slot between 1 and 1000),
  add column max_package_quantity integer not null default 10 check(max_package_quantity between 1 and 100),
  add column delivery_window_minutes integer not null default 15 check(delivery_window_minutes between 5 and 120);
alter table public.campaigns add column order_cutoff_at timestamptz,
  add column fulfillment_dates date[] not null default '{}',add column quantity_limit integer check(quantity_limit between 1 and 1000000);
alter table public.direct_order_settings add column hold_minutes integer not null default 15 check(hold_minutes between 1 and 60),
  add column delivery_capacity_per_slot integer not null default 4 check(delivery_capacity_per_slot between 1 and 1000),
  add column watchdog_enabled boolean not null default false,add column acknowledgement_minutes integer not null default 5 check(acknowledgement_minutes between 1 and 120),
  add column auto_pause_unacknowledged boolean not null default false;
-- Capacity now represents work units, rather than counting unrelated orders.
-- All public ordering remains disabled until configured; the initial unit budget is editable.
update public.direct_order_settings set capacity_per_slot=greatest(capacity_per_slot,100);
alter table public.orders add column campaign_id uuid references public.campaigns(id),
  add column capacity_status text check(capacity_status in ('held','confirmed','released','review')),
  add column hold_expires_at timestamptz,add column preparation_starts_at timestamptz,add column confirmed_at timestamptz,
  add column kitchen_units integer,add column preparation_minutes integer,
  add column delivery_travel_minutes integer,add column delivery_window_minutes integer,
  add column capacity_payment_pinned boolean not null default false,
  add column acknowledged_at timestamptz,add column acknowledged_by uuid references auth.users(id),
  add column packing_checklist jsonb not null default '{}',add column packed_at timestamptz,
  add column kitchen_issue text check(kitchen_issue in ('no_show','delivery_delayed','other')),add column kitchen_note text;
create table public.capacity_reservations (
  id uuid primary key default gen_random_uuid(),order_id uuid references public.orders(id),
  source text not null check(source in ('direct','catering','manual')),resource text not null check(resource in ('kitchen','delivery')),
  zone_id uuid references public.delivery_zones(id),starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),
  units integer not null check(units between 1 and 1000000),state text not null check(state in ('held','confirmed','released','review')),
  expires_at timestamptz,reason text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),
  released_by uuid references auth.users(id),released_at timestamptz,
  unique(order_id,resource),check(resource='delivery' or zone_id is null),check(source='manual' or order_id is not null)
);
create index capacity_reservations_active_idx on public.capacity_reservations(resource,starts_at,ends_at) where state in ('held','confirmed');
alter table public.capacity_reservations enable row level security;
revoke all on public.capacity_reservations from public,anon,authenticated;
grant select,insert,update on public.capacity_reservations to service_role;

create function public.direct_product_quote(p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.menus%rowtype;d public.dishes%rowtype;a jsonb; q integer:=(p_input->>'quantity')::integer;
  n integer;subtotal bigint;units integer;prep integer;lines jsonb;addons jsonb:=coalesce(p_input->'addons','[]');
begin
  select * into m from public.menus where id=(p_input->>'menu_id')::uuid and active and direct_order_enabled and availability_state='available';
  if not found or m.price_ore<=0 or q not between 1 and 100 then return null;end if;
  if jsonb_typeof(addons)<>'array' or jsonb_array_length(addons)>20 or
    (select count(distinct value->>'dish_id') from jsonb_array_elements(addons))<>jsonb_array_length(addons) then return null;end if;
  subtotal:=m.price_ore::bigint*q;units:=m.kitchen_units*q;
  prep:=m.preparation_minutes+((q-1)/m.extra_preparation_every)*m.extra_preparation_minutes;
  lines:=jsonb_build_array(jsonb_build_object('menu_id',m.id,'dish_id',null,'title',m.title || case when m.size_label<>'' then ' · '||m.size_label else '' end,
    'quantity',q,'unit_label','paket','unit_price_ore',m.price_ore,'total_ore',subtotal));
  for a in select value from jsonb_array_elements(addons) loop
    n:=(a->>'quantity')::integer;
    select * into d from public.dishes where id=(a->>'dish_id')::uuid and active and direct_addon_enabled and id=any(m.allowed_addon_ids);
    if not found or d.price_ore<=0 or n not between 1 and 100 then return null;end if;
    subtotal:=subtotal+d.price_ore::bigint*n;units:=units+d.kitchen_units*n;prep:=greatest(prep,d.preparation_minutes);
    lines:=lines||jsonb_build_array(jsonb_build_object('menu_id',null,'dish_id',d.id,'title',d.title,'quantity',n,'unit_label',d.portion_label,'unit_price_ore',d.price_ore,'total_ore',d.price_ore::bigint*n));
  end loop;
  if subtotal not between 1 and 100000000 or units>1000000 then return null;end if;
  return jsonb_build_object('lines',lines,'subtotal_ore',subtotal,'kitchen_units',units,'preparation_minutes',prep);
end;$$;

-- Check actual concurrent load at reservation boundaries, rather than summing
-- non-overlapping jobs across a longer candidate window.
create function public.capacity_fits(p_resource text,p_zone_id uuid,p_start timestamptz,p_end timestamptz,p_units integer,p_exclude_order uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare lim integer;zone_lim integer;peak bigint;
begin
  if p_end<=p_start or p_units<1 then return false;end if;
  select case when p_resource='kitchen' then capacity_per_slot else delivery_capacity_per_slot end into strict lim from public.direct_order_settings where id=1;
  select coalesce(max(load),0) into peak from (
    select coalesce((select sum(r.units) from public.capacity_reservations r where r.resource=p_resource and r.state in ('held','confirmed')
      and (p_exclude_order is null or r.order_id is distinct from p_exclude_order) and r.starts_at<=probe and r.ends_at>probe),0) load
    from (select p_start probe union select starts_at from public.capacity_reservations where resource=p_resource and state in ('held','confirmed') and starts_at>=p_start and starts_at<p_end) probes
  ) loads;
  if peak+p_units>lim then return false;end if;
  if p_resource='delivery' and p_zone_id is not null then
    select capacity_per_slot into strict zone_lim from public.delivery_zones where id=p_zone_id;
    select coalesce(max(load),0) into peak from (
      select coalesce((select sum(r.units) from public.capacity_reservations r where r.resource='delivery' and r.zone_id=p_zone_id and r.state in ('held','confirmed')
        and (p_exclude_order is null or r.order_id is distinct from p_exclude_order) and r.starts_at<=probe and r.ends_at>probe),0) load
      from (select p_start probe union select starts_at from public.capacity_reservations where resource='delivery' and zone_id=p_zone_id and state in ('held','confirmed') and starts_at>=p_start and starts_at<p_end) probes
    ) loads;
    if peak+p_units>zone_lim then return false;end if;
  end if;
  return true;
end;$$;

create function public.release_expired_capacity_holds() returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  with expired as (
    select o.id from public.orders o where o.capacity_status='held' and o.hold_expires_at<=clock_timestamp()
      and not coalesce(o.payment_review_required,false) and o.payment_status not in ('paid','refunded')
      and not exists(select 1 from public.payment_attempts a where a.order_id=o.id and a.status in ('creating','pending')) for update
  ), changed as (update public.orders o set capacity_status='released',hold_expires_at=null,capacity_payment_pinned=false where o.id in(select id from expired) returning id)
  update public.capacity_reservations set state='released',expires_at=null where order_id in(select id from changed) and state='held';
  get diagnostics n=row_count;return n;
end;$$;

create function public.run_kitchen_watchdog(p_now timestamptz default clock_timestamp()) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.direct_order_settings%rowtype;alerts jsonb;
begin
  select * into strict s from public.direct_order_settings where id=1 for update;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'created_at',created_at,'confirmed_at',confirmed_at)),'[]') into alerts
  from public.orders where s.watchdog_enabled and order_type='direct' and capacity_status='confirmed' and confirmed_at is not null
    and status in ('approved','preparing') and acknowledged_at is null and confirmed_at<=p_now-make_interval(mins=>s.acknowledgement_minutes);
  if s.watchdog_enabled and s.auto_pause_unacknowledged and jsonb_array_length(alerts)>0 then
    update public.direct_order_settings set paused=true where id=1;s.paused:=true;
  end if;
  return jsonb_build_object('paused',s.paused,'alerts',alerts);
end;$$;

-- Preserve the proven DST/opening engine, remove its obsolete order-count capacity
-- and let the public wrapper add authoritative work units, add-ons and campaigns.
alter function public.get_direct_availability(jsonb,timestamptz) rename to get_direct_availability_v44;
do $$declare definition text;old_count text;begin
  select pg_get_functiondef('public.get_direct_availability_v44(jsonb,timestamptz)'::regprocedure) into definition;
  definition:=replace(definition,chr(13),'');
  old_count:=$old$(select count(*) from public.orders o where o.order_type='direct' and o.status not in ('cancelled','rejected')
          and o.scheduled_at<candidate+make_interval(mins=>v_settings.interval_minutes)
          and o.scheduled_at+make_interval(mins=>o.slot_interval_minutes)>candidate)$old$;
  if position(old_count in definition)=0 then raise exception 'Unexpected V4.4 availability definition';end if;
  definition:=replace(definition,old_count,'0');
  definition:=replace(definition,'limit 500','limit 10000');
  definition:=replace(definition,'v_prep := coalesce(v_menu.preparation_minutes + ((v_quantity-1)/v_menu.extra_preparation_every)*v_menu.extra_preparation_minutes,0);',
    'v_prep := greatest(coalesce(v_menu.preparation_minutes + ((v_quantity-1)/v_menu.extra_preparation_every)*v_menu.extra_preparation_minutes,0),coalesce((p_input->>''_preparation_minutes'')::integer,0));');
  execute definition;
end;$$;

create function public.campaign_allows(p_campaign_id uuid,p_menu_id uuid,p_quantity integer,p_slot timestamptz,p_exclude_order uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.campaigns%rowtype;used bigint;
begin
  if p_campaign_id is null then return true;end if;
  select * into c from public.campaigns where id=p_campaign_id and active;
  if not found or not p_menu_id=any(c.menu_ids) or clock_timestamp()<c.starts_at or clock_timestamp()>c.ends_at
    or (c.order_cutoff_at is not null and clock_timestamp()>c.order_cutoff_at)
    or (cardinality(c.fulfillment_dates)>0 and not (p_slot at time zone 'Europe/Stockholm')::date=any(c.fulfillment_dates)) then return false;end if;
  select coalesce(sum(package_quantity),0) into used from public.orders where campaign_id=p_campaign_id and order_type='direct'
    and (capacity_status in ('held','confirmed') or status in ('preparing','ready','dispatched','completed'))
    and status not in ('cancelled','rejected') and (p_exclude_order is null or id<>p_exclude_order);
  return c.quantity_limit is null or used+p_quantity<=c.quantity_limit;
end;$$;

create function public.effective_direct_campaign(p_menu_id uuid,p_requested uuid default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare restricted uuid;
begin
  select id into restricted from public.campaigns where active and p_menu_id=any(menu_ids)
    and (order_cutoff_at is not null or cardinality(fulfillment_dates)>0 or quantity_limit is not null)
    order by (clock_timestamp() between starts_at and ends_at) desc,
      case when starts_at>clock_timestamp() then 0 else 1 end,starts_at desc,id limit 1;
  if restricted is not null then return restricted;end if;
  return p_requested;
end;$$;

create function public.get_direct_availability(p_input jsonb,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare base jsonb;product jsonb;slot jsonb;slots jsonb:='[]';s public.direct_order_settings%rowtype;z public.delivery_zones%rowtype;
  arrival timestamptz;ready_at timestamptz;prep_start timestamptz;ending timestamptz;units integer;prep integer;window_mins integer:=0;campaign uuid;
begin
  perform public.run_kitchen_watchdog(p_now);perform public.release_expired_capacity_holds();
  select * into strict s from public.direct_order_settings where id=1;
  product:=public.direct_product_quote(p_input);
  campaign:=public.effective_direct_campaign((p_input->>'menu_id')::uuid,(p_input->>'campaign_id')::uuid);
  base:=public.get_direct_availability_v44(p_input||jsonb_build_object('_preparation_minutes',greatest(coalesce((product->>'preparation_minutes')::integer,0),s.interval_minutes)),p_now);
  if product is null then return base||jsonb_build_object('enabled',false,'reason','Paketet eller ett tillbehör är pausat, slutsålt eller inte tillgängligt.','slots','[]'::jsonb);end if;
  if p_input->>'campaign_id' is not null and campaign is distinct from (p_input->>'campaign_id')::uuid then return base||jsonb_build_object('enabled',false,'reason','Paketet hör till en annan aktiv kampanj. Uppdatera menyn.','slots','[]'::jsonb);end if;
  select * into z from public.delivery_zones where id=(base->>'delivery_zone_id')::uuid;
  if p_input->>'fulfillment'='delivery' then
    if (p_input->>'quantity')::integer>z.max_package_quantity then return base||jsonb_build_object('enabled',false,'reason','Antalet paket överskrider leveranszonens gräns. Välj hämtning eller catering.','slots','[]'::jsonb);end if;
    window_mins:=coalesce(z.delivery_window_minutes,15);
  end if;
  units:=(product->>'kitchen_units')::integer;prep:=(product->>'preparation_minutes')::integer+s.capacity_buffer_minutes;
  for slot in select value from jsonb_array_elements(base->'slots') loop
    arrival:=(slot->>'starts_at')::timestamptz;ready_at:=arrival-make_interval(mins=>coalesce(z.travel_minutes,0));
    prep_start:=ready_at-make_interval(mins=>greatest(prep,s.interval_minutes));ending:=arrival+make_interval(mins=>greatest(window_mins,s.interval_minutes));
    if public.campaign_allows(campaign,(p_input->>'menu_id')::uuid,(p_input->>'quantity')::integer,arrival)
      and public.capacity_fits('kitchen',null,prep_start,ready_at,units)
      and (p_input->>'fulfillment'<>'delivery' or public.capacity_fits('delivery',z.id,ready_at,ending,1)) then
      slots:=slots||jsonb_build_array(slot||jsonb_build_object('ends_at',arrival+make_interval(mins=>window_mins),'preparation_starts_at',prep_start));
      if jsonb_array_length(slots)>=500 then exit;end if;
    end if;
  end loop;
  return base||product||jsonb_build_object('slots',slots,'total_ore',(product->>'subtotal_ore')::bigint+(base->>'delivery_fee_ore')::integer,'delivery_window_minutes',window_mins,'campaign_id',campaign)
    ||case when jsonb_array_length(slots)=0 and (base->>'enabled')::boolean then jsonb_build_object('reason','Tiderna, kapaciteten eller kampanjens tillgänglighet är slut. Välj nästa tillgängliga dag eller hämtning.') else '{}'::jsonb end;
end;$$;

create function public.reserve_order_capacity(p_order_id uuid,p_state text default 'confirmed') returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype;s public.direct_order_settings%rowtype;z public.delivery_zones%rowtype;
  ready_at timestamptz;ending timestamptz;expires timestamptz;
begin
  select * into strict s from public.direct_order_settings where id=1 for update;
  select * into strict o from public.orders where id=p_order_id for update;
  if o.capacity_status is null then return true;end if;
  select * into z from public.delivery_zones where id=o.delivery_zone_id for share;
  ready_at:=o.scheduled_at-make_interval(mins=>case when o.fulfillment='delivery' then coalesce(o.delivery_travel_minutes,z.travel_minutes,0) else 0 end);
  ending:=o.scheduled_at+make_interval(mins=>greatest(o.slot_interval_minutes,coalesce(o.delivery_window_minutes,z.delivery_window_minutes,0)));
  if o.preparation_starts_at<=clock_timestamp() or not public.capacity_fits('kitchen',null,o.preparation_starts_at,ready_at,o.kitchen_units,o.id)
    or (o.fulfillment='delivery' and (not z.active or (o.order_type='direct' and (not z.direct_enabled or z.travel_minutes is null))
      or coalesce(o.package_quantity,1)>z.max_package_quantity or not public.capacity_fits('delivery',z.id,ready_at,ending,1,o.id)))
    or (o.order_type='direct' and not public.campaign_allows(o.campaign_id,o.menu_id,o.package_quantity,o.scheduled_at,o.id)) then return false;end if;
  expires:=case when p_state='held' then clock_timestamp()+make_interval(mins=>s.hold_minutes) else null end;
  insert into public.capacity_reservations(order_id,source,resource,starts_at,ends_at,units,state,expires_at)
    values(o.id,o.order_type,'kitchen',o.preparation_starts_at,ready_at,o.kitchen_units,p_state,expires)
    on conflict(order_id,resource) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,units=excluded.units,state=excluded.state,expires_at=excluded.expires_at;
  if o.fulfillment='delivery' then
    insert into public.capacity_reservations(order_id,source,resource,zone_id,starts_at,ends_at,units,state,expires_at)
      values(o.id,o.order_type,'delivery',z.id,ready_at,ending,1,p_state,expires)
      on conflict(order_id,resource) do update set zone_id=excluded.zone_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,state=excluded.state,expires_at=excluded.expires_at;
  end if;
  update public.orders set capacity_status=p_state,hold_expires_at=expires,
    confirmed_at=case when p_state='confirmed' then coalesce(confirmed_at,clock_timestamp()) else confirmed_at end where id=o.id;
  return true;
end;$$;

create or replace function public.create_direct_order(p_order jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.direct_order_settings%rowtype;b public.business_settings%rowtype;m public.menus%rowtype;z public.delivery_zones%rowtype;o public.orders%rowtype;
  key uuid:=(p_order->>'request_id')::uuid;q integer:=(p_order->>'quantity')::integer;t timestamptz:=(p_order->>'scheduled_at')::timestamptz;
  quote jsonb;chosen jsonb;line jsonb;cash_confirmed boolean;
begin
  if key is null or coalesce(p_order->>'request_hash','')!~'^[a-f0-9]{64}$' then raise exception 'Missing request fingerprint';end if;
  perform 1 from public.direct_order_settings where id=1 for update;
  perform pg_advisory_xact_lock(hashtextextended(key::text,0));
  select * into o from public.orders where request_id=key;
  if found then
    if o.request_hash is distinct from p_order->>'request_hash' or o.order_type<>'direct' then raise exception 'Request key already used';end if;
    return to_jsonb(o)||jsonb_build_object('_created',false);
  end if;
  select * into strict s from public.direct_order_settings where id=1;
  select * into strict b from public.business_settings where id=1 for share;
  select * into m from public.menus where id=(p_order->>'menu_id')::uuid for share;
  perform 1 from public.dishes where active for share;perform 1 from public.delivery_zones where active for share;
  perform 1 from public.campaigns where id=(p_order->>'campaign_id')::uuid for share;
  quote:=public.get_direct_availability(p_order,clock_timestamp());
  select value into chosen from jsonb_array_elements(quote->'slots') where (value->>'starts_at')::timestamptz=t;
  if not (quote->>'enabled')::boolean or chosen is null then raise exception 'Slot unavailable; refresh availability';end if;
  if (quote->>'total_ore')::bigint is distinct from (p_order->>'expected_total_ore')::bigint or (quote->>'total_ore')::bigint not between 1 and 100000000 then raise exception 'Price changed; refresh availability';end if;
  if p_order->>'fulfillment'='delivery' and (trim(coalesce(p_order->>'address',''))='' or trim(coalesce(p_order->>'city',''))='') then raise exception 'Delivery address required';end if;
  if p_order->>'payment_preference'='cash' and (p_order->>'fulfillment'<>'pickup' or not b.cash_enabled) then raise exception 'Cash requires pickup';end if;
  if p_order->>'payment_preference'='unpaid' and not b.allow_unpaid_requests then raise exception 'Unpaid requests disabled';end if;
  if coalesce(p_order->>'payment_preference','') not in ('swish','card','apple_pay','google_pay','cash','unpaid') then raise exception 'Invalid payment preference';end if;
  cash_confirmed:=s.auto_approve and p_order->>'payment_preference'='cash';
  select * into z from public.delivery_zones where id=(quote->>'delivery_zone_id')::uuid;
  insert into public.orders(id,code,tracking_hash,request_id,request_hash,menu_id,menu_title,price_per_person_ore,guests,occasion,
    event_date,event_time,fulfillment,address,postal_code,city,full_name,email,phone,notes,subtotal_ore,delivery_fee_ore,total_ore,
    payment_preference,payment_status,status,delivery_zone_id,order_type,package_quantity,scheduled_at,slot_interval_minutes,
    campaign_id,capacity_status,hold_expires_at,preparation_starts_at,preparation_minutes,kitchen_units,confirmed_at,delivery_travel_minutes,delivery_window_minutes,items_snapshot)
  values((p_order->>'id')::uuid,p_order->>'code',p_order->>'tracking_hash',key,p_order->>'request_hash',m.id,m.title,m.price_ore,q*m.package_portions,'hemma',
    (t at time zone 'Europe/Stockholm')::date,to_char(t at time zone 'Europe/Stockholm','HH24:MI'),p_order->>'fulfillment',
    case when p_order->>'fulfillment'='delivery' then p_order->>'address' else '' end,
    case when p_order->>'fulfillment'='delivery' then regexp_replace(p_order->>'postal_code','\s','','g') else '' end,
    case when p_order->>'fulfillment'='delivery' then p_order->>'city' else '' end,
    p_order->>'full_name',p_order->>'email',p_order->>'phone',coalesce(p_order->>'notes',''),(quote->>'subtotal_ore')::integer,
    (quote->>'delivery_fee_ore')::integer,(quote->>'total_ore')::integer,p_order->>'payment_preference','unpaid',case when s.auto_approve then 'approved' else 'new' end,
    (quote->>'delivery_zone_id')::uuid,'direct',q,t,s.interval_minutes,(quote->>'campaign_id')::uuid,'held',clock_timestamp()+make_interval(mins=>s.hold_minutes),
    (chosen->>'preparation_starts_at')::timestamptz,(quote->>'preparation_minutes')::integer,(quote->>'kitchen_units')::integer,null,coalesce(z.travel_minutes,0),coalesce(z.delivery_window_minutes,0),
    (select jsonb_agg(value||jsonb_build_object('item_id',coalesce(value->>'dish_id',value->>'menu_id'),'line_total_ore',value->'total_ore')) from jsonb_array_elements(quote->'lines'))) returning * into o;
  insert into public.order_items(order_id,menu_id,dish_id,item_id,title,quantity,unit_label,unit_price_ore,total_ore)
    select o.id,(value->>'menu_id')::uuid,(value->>'dish_id')::uuid,(value->>'dish_id')::uuid,value->>'title',(value->>'quantity')::integer,value->>'unit_label',
      (value->>'unit_price_ore')::integer,(value->>'total_ore')::integer from jsonb_array_elements(quote->'lines');
  if not public.reserve_order_capacity(o.id,case when cash_confirmed then 'confirmed' else 'held' end) then raise exception 'Capacity changed';end if;
  select * into strict o from public.orders where id=o.id;return to_jsonb(o)||jsonb_build_object('_created',true);
end;$$;

-- Catering keeps its review/revision engine and explicit per-guest pricing.
do $$declare definition text;begin
  select pg_get_functiondef('public.create_catering_order_v3(jsonb,jsonb)'::regprocedure) into definition;
  definition:=replace(definition,'v_menu.price_ore','coalesce(v_menu.catering_price_ore,v_menu.price_ore)');execute definition;
end;$$;
alter function public.create_catering_order(jsonb,jsonb) rename to create_catering_order_slots_v44;
create function public.create_catering_order(p_order jsonb,p_items jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb;o public.orders%rowtype;m public.menus%rowtype;z public.delivery_zones%rowtype;c public.campaigns%rowtype;units integer;prep integer;s public.direct_order_settings%rowtype;t timestamptz;
begin
  select * into strict s from public.direct_order_settings where id=1 for update;
  saved:=public.create_catering_order_slots_v44(p_order,p_items);
  if saved->>'_created'='false' then return saved;end if;
  select * into strict o from public.orders where id=(saved->>'id')::uuid;
  if o.menu_id is not null then
    select * into strict m from public.menus where id=o.menu_id;
    if m.availability_state<>'available' then raise exception 'Menu unavailable';end if;
    units:=ceil(o.guests::numeric/m.package_portions)::integer*m.kitchen_units;prep:=m.preparation_minutes;
  else
    select coalesce(sum(i.quantity*d.kitchen_units),1),greatest(coalesce(max(d.preparation_minutes),0),30) into units,prep
      from public.order_items i join public.dishes d on d.id=i.dish_id where i.order_id=o.id;
  end if;
  t:=(o.event_date+o.event_time::time) at time zone 'Europe/Stockholm';
  if p_order->>'campaign_id' is not null then
    select * into c from public.campaigns where id=(p_order->>'campaign_id')::uuid and active for share;
    if not found or clock_timestamp()<c.starts_at or clock_timestamp()>c.ends_at or (c.order_cutoff_at is not null and clock_timestamp()>c.order_cutoff_at)
      or (cardinality(c.menu_ids)>0 and not coalesce(o.menu_id=any(c.menu_ids),false))
      or (cardinality(c.fulfillment_dates)>0 and not o.event_date=any(c.fulfillment_dates)) then raise exception 'Campaign unavailable';end if;
  end if;
  select * into z from public.delivery_zones where id=o.delivery_zone_id;
  update public.orders set campaign_id=(p_order->>'campaign_id')::uuid,capacity_status='released',kitchen_units=units,preparation_minutes=prep,scheduled_at=t,slot_interval_minutes=s.interval_minutes,
    delivery_travel_minutes=coalesce(z.travel_minutes,0),delivery_window_minutes=coalesce(z.delivery_window_minutes,0),
    preparation_starts_at=t-make_interval(mins=>greatest(prep+s.capacity_buffer_minutes,s.interval_minutes)+case when o.fulfillment='delivery' then coalesce(z.travel_minutes,0) else 0 end) where id=o.id returning * into o;
  return to_jsonb(o)||jsonb_build_object('_created',true);
end;$$;

-- Financial callers lock settings before order rows. No timer frees an in-flight attempt.
create function public.prepare_order_capacity_payment(p_order_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype;s public.direct_order_settings%rowtype;
begin
  select * into strict s from public.direct_order_settings where id=1 for update;
  select * into o from public.orders where id=p_order_id for update;
  if not found then return false;end if;
  if o.capacity_status is null then return true;end if;
  if o.capacity_status='review' or o.payment_review_required or o.preparation_starts_at<=clock_timestamp() or o.status not in ('approved','preparing','ready') then return false;end if;
  if o.capacity_status='confirmed' then return true;end if;
  if o.capacity_status='held' and (o.hold_expires_at>clock_timestamp() or exists(select 1 from public.payment_attempts where order_id=o.id and status in ('creating','pending'))) then
    update public.orders set capacity_payment_pinned=true where id=o.id;return true;end if;
  -- A failed attempt can explicitly retry, without repricing accepted order lines.
  if o.payment_status='failed' and not exists(select 1 from public.payment_attempts where order_id=o.id and status in ('creating','pending')) then
    if public.reserve_order_capacity(o.id,'held') then update public.orders set capacity_payment_pinned=true where id=o.id;return true;end if;
  end if;
  return false;
end;$$;

create function public.settle_order_capacity_payment(p_order_id uuid,p_outcome text) returns void language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype;owned boolean;
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.capacity_status is null then return;end if;
  if p_outcome='paid' then
    if o.capacity_status='confirmed' then return;end if;
    owned:=o.capacity_status='held' and o.preparation_starts_at>clock_timestamp()
      and exists(select 1 from public.capacity_reservations where order_id=o.id and resource='kitchen' and state='held')
      and (o.hold_expires_at>clock_timestamp() or o.capacity_payment_pinned);
    if owned then
      update public.capacity_reservations set state='confirmed',expires_at=null where order_id=o.id and state='held';
      update public.orders set capacity_status='confirmed',hold_expires_at=null,capacity_payment_pinned=false,confirmed_at=coalesce(confirmed_at,clock_timestamp()) where id=o.id;
    else
      update public.capacity_reservations set state='review',expires_at=null where order_id=o.id and state='held';
      update public.orders set capacity_status='review',hold_expires_at=null,capacity_payment_pinned=false,payment_review_required=true,payment_review_reason='capacity_unavailable_after_payment' where id=o.id;
    end if;
  elsif p_outcome in ('failed','refunded') then
    if p_outcome='failed' and o.capacity_status='confirmed' then return;end if;
    update public.capacity_reservations set state='released',expires_at=null where order_id=o.id;
    update public.orders set capacity_status='released',hold_expires_at=null,capacity_payment_pinned=false,
      payment_review_required=case when p_outcome='refunded' and payment_review_reason='capacity_unavailable_after_payment' then false else payment_review_required end,
      payment_review_reason=case when p_outcome='refunded' and payment_review_reason='capacity_unavailable_after_payment' then null else payment_review_reason end where id=o.id;
  else raise exception 'Invalid capacity payment outcome';end if;
end;$$;

create function public.capacity_order_status_trigger() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.capacity_status is null then return new;end if;
  if new.status in ('cancelled','rejected') and old.status not in ('cancelled','rejected') then
    update public.capacity_reservations set state='released',expires_at=null where order_id=new.id;
    update public.orders set capacity_status='released',hold_expires_at=null,capacity_payment_pinned=false where id=new.id;
  elsif new.status='approved' and old.status<>'approved' and (new.order_type='catering' or new.payment_preference='cash') and new.capacity_status<>'confirmed' then
    if not public.reserve_order_capacity(new.id,'confirmed') then raise exception 'Kitchen or delivery capacity unavailable';end if;
  end if;
  return new;
end;$$;
create trigger capacity_order_status after update of status on public.orders for each row execute function public.capacity_order_status_trigger();

create function public.create_manual_capacity_hold(p_input jsonb,p_admin_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.capacity_reservations%rowtype;a timestamptz:=(p_input->>'starts_at')::timestamptz;b timestamptz:=(p_input->>'ends_at')::timestamptz;
  units integer:=(p_input->>'units')::integer;resource text:=p_input->>'resource';zone uuid:=(p_input->>'zone_id')::uuid;
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  if p_admin_id is null or resource not in ('kitchen','delivery') or units not between 1 and 1000000
    or a<=clock_timestamp() or b<=a or b>a+interval '7 days' or length(trim(coalesce(p_input->>'reason',''))) not between 2 and 1000 then raise exception 'Invalid manual capacity hold';end if;
  if resource='kitchen' then zone:=null;end if;
  if not public.capacity_fits(resource,zone,a,b,units) then raise exception 'Capacity unavailable';end if;
  insert into public.capacity_reservations(source,resource,zone_id,starts_at,ends_at,units,state,reason,created_by)
    values('manual',resource,zone,a,b,units,'confirmed',p_input->>'reason',p_admin_id) returning * into r;
  return to_jsonb(r);
end;$$;
create function public.release_manual_capacity_hold(p_hold_id uuid,p_admin_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  if p_admin_id is null then return false;end if;
  update public.capacity_reservations set state='released',released_by=p_admin_id,released_at=clock_timestamp() where id=p_hold_id and source='manual' and state='confirmed';return found;
end;$$;

create function public.transition_kitchen_order(p_order_id uuid,p_action text,p_admin_id uuid,p_admin_note text default null,p_expected_status text default null,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype;next_status text;packing jsonb;
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  if p_admin_id is null then return null;end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or (p_expected_status is not null and o.status<>p_expected_status) then return null;end if;
  if p_action='acknowledge' then
    update public.orders set acknowledged_at=coalesce(acknowledged_at,clock_timestamp()),acknowledged_by=coalesce(acknowledged_by,p_admin_id),updated_at=clock_timestamp() where id=o.id returning * into o;return to_jsonb(o);
  elsif p_action='packing' then
    packing:=p_data->'packing_checklist';
    if o.status not in ('approved','preparing','ready') or jsonb_typeof(packing)<>'object' or
      exists(select 1 from unnest(array['packages','extras','sauces_bread','allergen_labels','order_number']) key where jsonb_typeof(packing->key) is distinct from 'boolean') then return null;end if;
    update public.orders set packing_checklist=packing,packed_at=case when not exists(select 1 from jsonb_each(packing) where value<>'true') then clock_timestamp() else null end,updated_at=clock_timestamp() where id=o.id returning * into o;return to_jsonb(o);
  elsif p_action='issue' then
    if p_data->>'kitchen_issue' is not null and p_data->>'kitchen_issue' not in ('no_show','delivery_delayed','other') then return null;end if;
    if length(coalesce(p_data->>'kitchen_note',''))>1000 then return null;end if;
    update public.orders set kitchen_issue=p_data->>'kitchen_issue',kitchen_note=p_data->>'kitchen_note',updated_at=clock_timestamp() where id=o.id returning * into o;return to_jsonb(o);
  end if;
  if p_action in ('preparing','ready','dispatched','complete') and (o.payment_review_required or o.payment_refund_status is not null or o.capacity_status in ('held','released','review')) then return null;end if;
  if p_action='review' and o.status='new' then next_status:='reviewing';
  elsif p_action='approve' and o.status in ('new','reviewing') then
    if o.capacity_status is not null and not public.reserve_order_capacity(o.id,case when o.order_type='catering' or o.payment_preference='cash' then 'confirmed' else 'held' end) then return null;end if;next_status:='approved';
  elsif p_action='reject' and o.status in ('new','reviewing','changes_requested') then next_status:='rejected';
  elsif p_action='cancel' and o.status in ('new','reviewing','changes_requested','approved') and
    (o.payment_status in ('unpaid','refunded') or (o.payment_status='failed' and o.capacity_status='released'
      and not exists(select 1 from public.payment_attempts where order_id=o.id and status in ('creating','pending')))) then next_status:='cancelled';
  elsif p_action='preparing' and o.status='approved' and (o.payment_status='paid' or o.payment_preference='cash') then next_status:='preparing';
  elsif p_action='ready' and o.fulfillment='pickup' and o.status in ('approved','preparing') and (o.payment_status='paid' or o.payment_preference='cash') and (o.capacity_status is null or o.packed_at is not null) then next_status:='ready';
  elsif p_action='dispatched' and o.fulfillment='delivery' and o.status in ('approved','preparing','ready') and o.payment_status='paid' and (o.capacity_status is null or o.packed_at is not null) then next_status:='dispatched';
  elsif p_action='complete' and o.status in ('approved','preparing','ready','dispatched') and o.payment_status='paid' and (o.capacity_status is null or o.packed_at is not null) then next_status:='completed';
  else return null;end if;
  update public.orders set status=next_status,admin_note=coalesce(p_admin_note,admin_note),updated_at=clock_timestamp() where id=o.id returning * into o;return to_jsonb(o);
end;$$;

-- Existing accepted future obligations must still consume capacity. This backfill
-- never changes their money, status or promised local date/time, and deliberately
-- permits existing overload so subsequent orders see it and cannot worsen it.
do $$declare o public.orders%rowtype;m public.menus%rowtype;z public.delivery_zones%rowtype;s public.direct_order_settings%rowtype;
  scheduled timestamptz;ready_at timestamptz;prep_start timestamptz;units integer;prep integer;reservation_state text;expires timestamptz;pinned boolean;
begin
  select * into strict s from public.direct_order_settings where id=1;
  for o in select * from public.orders where capacity_status is null and status in ('approved','preparing','ready','dispatched')
    and coalesce(scheduled_at,(event_date+event_time::time) at time zone 'Europe/Stockholm')>clock_timestamp() loop
    select * into m from public.menus where id=o.menu_id;select * into z from public.delivery_zones where id=o.delivery_zone_id;
    scheduled:=coalesce(o.scheduled_at,(o.event_date+o.event_time::time) at time zone 'Europe/Stockholm');
    if o.menu_id is not null then
      units:=case when o.order_type='direct' then coalesce(o.package_quantity,1)*m.kitchen_units else ceil(o.guests::numeric/m.package_portions)::integer*m.kitchen_units end;
      prep:=m.preparation_minutes+case when o.order_type='direct' then ((coalesce(o.package_quantity,1)-1)/m.extra_preparation_every)*m.extra_preparation_minutes else 0 end;
    else
      select greatest(coalesce(sum(i.quantity*d.kitchen_units),1),1),greatest(coalesce(max(d.preparation_minutes),0),30) into units,prep
        from public.order_items i left join public.dishes d on d.id=i.dish_id where i.order_id=o.id;
    end if;
    ready_at:=scheduled-make_interval(mins=>case when o.fulfillment='delivery' then coalesce(z.travel_minutes,0) else 0 end);
    prep_start:=ready_at-make_interval(mins=>greatest(prep+s.capacity_buffer_minutes,coalesce(o.slot_interval_minutes,s.interval_minutes)));
    pinned:=exists(select 1 from public.payment_attempts where order_id=o.id and status in ('creating','pending'));
    reservation_state:=case when o.order_type='catering' or o.payment_status='paid' or o.payment_preference='cash' then 'confirmed' else 'held' end;
    expires:=case when reservation_state='held' then clock_timestamp()+make_interval(mins=>s.hold_minutes) else null end;
    update public.orders set scheduled_at=scheduled,slot_interval_minutes=coalesce(slot_interval_minutes,s.interval_minutes),kitchen_units=units,preparation_minutes=prep,
      delivery_travel_minutes=coalesce(z.travel_minutes,0),delivery_window_minutes=coalesce(z.delivery_window_minutes,0),
      preparation_starts_at=prep_start,capacity_status=reservation_state,hold_expires_at=expires,capacity_payment_pinned=pinned where id=o.id;
    insert into public.capacity_reservations(order_id,source,resource,starts_at,ends_at,units,state,expires_at,reason)
      values(o.id,o.order_type,'kitchen',prep_start,ready_at,units,reservation_state,expires,'Accepted before capacity migration');
    if o.fulfillment='delivery' then
      insert into public.capacity_reservations(order_id,source,resource,zone_id,starts_at,ends_at,units,state,expires_at,reason)
        values(o.id,o.order_type,'delivery',o.delivery_zone_id,ready_at,scheduled+make_interval(mins=>greatest(coalesce(o.slot_interval_minutes,s.interval_minutes),coalesce(z.delivery_window_minutes,0))),1,reservation_state,expires,'Accepted before capacity migration');
    end if;
  end loop;
end;$$;

-- Every added callable entry point is private and runs with the caller's rights.
revoke all on function public.effective_direct_campaign(uuid,uuid),public.direct_product_quote(jsonb),public.capacity_fits(text,uuid,timestamptz,timestamptz,integer,uuid),
  public.release_expired_capacity_holds(),public.run_kitchen_watchdog(timestamptz),public.campaign_allows(uuid,uuid,integer,timestamptz,uuid),
  public.get_direct_availability(jsonb,timestamptz),public.reserve_order_capacity(uuid,text),public.create_direct_order(jsonb),public.create_catering_order(jsonb,jsonb),
  public.prepare_order_capacity_payment(uuid),public.settle_order_capacity_payment(uuid,text),public.capacity_order_status_trigger(),
  public.create_manual_capacity_hold(jsonb,uuid),public.release_manual_capacity_hold(uuid,uuid),public.transition_kitchen_order(uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.effective_direct_campaign(uuid,uuid),public.direct_product_quote(jsonb),public.capacity_fits(text,uuid,timestamptz,timestamptz,integer,uuid),
  public.release_expired_capacity_holds(),public.run_kitchen_watchdog(timestamptz),public.campaign_allows(uuid,uuid,integer,timestamptz,uuid),
  public.get_direct_availability(jsonb,timestamptz),public.reserve_order_capacity(uuid,text),public.create_direct_order(jsonb),public.create_catering_order(jsonb,jsonb),
  public.prepare_order_capacity_payment(uuid),public.settle_order_capacity_payment(uuid,text),public.capacity_order_status_trigger(),
  public.create_manual_capacity_hold(jsonb,uuid),public.release_manual_capacity_hold(uuid,uuid),public.transition_kitchen_order(uuid,text,uuid,text,text,jsonb) to service_role;
