-- V4.4: the existing database owns both catering and direct package orders.
-- Real installations remain disabled until the owner explicitly configures and enables them.
alter table public.menus
  add column direct_order_enabled boolean not null default false,
  add column catering_enabled boolean not null default true,
  add column package_portions integer not null default 1 check(package_portions between 1 and 10),
  add column preparation_minutes integer not null default 30 check(preparation_minutes between 1 and 1440),
  add column extra_preparation_minutes integer not null default 0 check(extra_preparation_minutes between 0 and 1440),
  add column extra_preparation_every integer not null default 5 check(extra_preparation_every between 1 and 100);
alter table public.delivery_zones
  add column direct_enabled boolean not null default false,
  add column travel_minutes integer check(travel_minutes between 0 and 480);
alter table public.orders
  add column order_type text not null default 'catering' check(order_type in ('catering','direct')),
  add column package_quantity integer check(package_quantity between 1 and 100),
  add column scheduled_at timestamptz,
  add column slot_interval_minutes integer check(slot_interval_minutes between 5 and 120),
  add constraint orders_direct_schedule_check check(order_type <> 'direct' or (scheduled_at is not null and package_quantity is not null and slot_interval_minutes is not null));
create index orders_direct_slot_idx on public.orders(scheduled_at) where order_type='direct' and status not in ('cancelled','rejected');

create table public.direct_order_settings (
  id smallint primary key default 1 check(id=1), enabled boolean not null default false,
  paused boolean not null default false, auto_approve boolean not null default false,
  interval_minutes integer not null default 15 check(interval_minutes between 5 and 120),
  min_advance_minutes integer not null default 15 check(min_advance_minutes between 0 and 10080),
  capacity_per_slot integer not null default 4 check(capacity_per_slot between 1 and 1000),
  capacity_buffer_minutes integer not null default 0 check(capacity_buffer_minutes between 0 and 1440),
  max_days_ahead integer not null default 14 check(max_days_ahead between 1 and 30),
  weekly_hours jsonb not null default '[]' check(jsonb_typeof(weekly_hours)='array' and jsonb_array_length(weekly_hours)<=7),
  special_hours jsonb not null default '[]' check(jsonb_typeof(special_hours)='array' and jsonb_array_length(special_hours)<=100),
  blocked_slots jsonb not null default '[]' check(jsonb_typeof(blocked_slots)='array' and jsonb_array_length(blocked_slots)<=200),
  updated_at timestamptz not null default now()
);
insert into public.direct_order_settings(id,weekly_hours)
select 1,jsonb_agg(jsonb_build_object('weekday',day,'closed',true,'opens_at','10:00','closes_at','22:00','cutoff_at','21:00',
  'pickup_from','10:00','pickup_until','22:00','delivery_from','10:00','delivery_until','22:00')) from generate_series(0,6) day;
alter table public.direct_order_settings enable row level security;
revoke all on public.direct_order_settings from public,anon,authenticated;
grant select,update on public.direct_order_settings to service_role;

-- p_now is an internal test seam, never taken from an HTTP request or a phone clock.
-- UTC candidates are projected into Stockholm wall time, preserving both autumn folds
-- and naturally omitting nonexistent spring minutes. Durations are elapsed UTC minutes.
create function public.get_direct_availability(p_input jsonb,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_settings public.direct_order_settings%rowtype; v_business public.business_settings%rowtype;
  v_menu public.menus%rowtype; v_zone public.delivery_zones%rowtype;
  v_quantity integer := (p_input->>'quantity')::integer; v_mode text := p_input->>'fulfillment';
  v_postal text := regexp_replace(coalesce(p_input->>'postal_code',''),'\s','','g');
  v_fee integer := 0; v_travel integer := 0; v_prep integer := 0; v_reason text;
  v_day date; v_hours jsonb; v_open timestamp; v_close timestamp; v_cutoff timestamp;
  v_from timestamp; v_until timestamp; v_open_instant timestamptz; v_close_instant timestamptz; v_cutoff_instant timestamptz;
  v_from_instant timestamptz; v_until_instant timestamptz; v_day_slots jsonb;
  v_slots jsonb := '[]'; v_result jsonb; v_enabled boolean := true;
begin
  select * into strict v_settings from public.direct_order_settings where id=1;
  select * into strict v_business from public.business_settings where id=1;
  select * into v_menu from public.menus where id=(p_input->>'menu_id')::uuid and active and direct_order_enabled;
  if not found or v_menu.price_ore<=0 or v_quantity not between 1 and 100 then
    v_reason := 'Paketet är inte tillgängligt för direktbeställning.';
  elsif not v_settings.enabled or v_settings.paused then
    v_reason := 'Köket tar inte emot direktbeställningar just nu.';
  elsif v_mode='pickup' and (not v_business.pickup_enabled or trim(v_business.pickup_address)='') then
    v_reason := 'Hämtning är inte konfigurerad. Kontakta köket.';
  elsif v_mode='delivery' then
    select * into v_zone from public.delivery_zones z where z.active and z.direct_enabled and z.travel_minutes is not null
      and v_postal ~ '^[0-9]{5}$'
      and exists(select 1 from unnest(z.postal_prefixes) prefix where v_postal like prefix || '%')
      order by (select max(length(prefix)) from unnest(z.postal_prefixes) prefix where v_postal like prefix || '%') desc,z.fee_ore,z.id limit 1;
    if not v_business.delivery_enabled or not found or
      (p_input->>'delivery_zone_id' is not null and (p_input->>'delivery_zone_id')::uuid<>v_zone.id) then
      v_reason := 'Hemleverans erbjuds inte till postnumret. Välj hämtning.';
    else v_fee := v_zone.fee_ore; v_travel := v_zone.travel_minutes; end if;
  elsif v_mode<>'pickup' then v_reason := 'Välj hämtning eller hemleverans.';
  end if;
  v_prep := coalesce(v_menu.preparation_minutes + ((v_quantity-1)/v_menu.extra_preparation_every)*v_menu.extra_preparation_minutes,0);
  v_result := jsonb_build_object('server_now',p_now,'timezone','Europe/Stockholm','pickup_address',v_business.pickup_address,
    'preparation_minutes',v_prep,'subtotal_ore',coalesce(v_menu.price_ore::bigint*v_quantity,0),'delivery_fee_ore',v_fee,
    'total_ore',coalesce(v_menu.price_ore::bigint*v_quantity,0)+v_fee,'delivery_zone_id',v_zone.id);
  if v_reason is not null then return v_result || jsonb_build_object('enabled',false,'reason',v_reason,'slots','[]'::jsonb); end if;
  -- Yesterday is included so an overnight kitchen can serve after midnight.
  for v_day in select ((p_now at time zone 'Europe/Stockholm')::date+i) from generate_series(-1,v_settings.max_days_ahead) i loop
    select value into v_hours from jsonb_array_elements(v_settings.special_hours) where value->>'date'=v_day::text;
    if not found then
      select value into v_hours from jsonb_array_elements(v_settings.weekly_hours) where (value->>'weekday')::integer=extract(dow from v_day)::integer;
    end if;
    if v_hours is null or coalesce((v_hours->>'closed')::boolean,true) then continue; end if;
    v_open := v_day+(v_hours->>'opens_at')::time;
    v_close := v_day+(v_hours->>'closes_at')::time;
    if v_close<=v_open then v_close:=v_close+interval '1 day'; end if;
    v_cutoff:=v_day+(v_hours->>'cutoff_at')::time;
    if v_cutoff<v_open then v_cutoff:=v_cutoff+interval '1 day'; end if;
    v_cutoff:=least(v_cutoff,v_close);
    v_from:=v_day+(case when v_mode='pickup' then v_hours->>'pickup_from' else v_hours->>'delivery_from' end)::time;
    v_until:=v_day+(case when v_mode='pickup' then v_hours->>'pickup_until' else v_hours->>'delivery_until' end)::time;
    if v_from<v_open then v_from:=v_from+interval '1 day'; end if;
    if v_until<=v_open then v_until:=v_until+interval '1 day'; end if;
    -- Ambiguous starts use the earliest occurrence; ends/cutoffs use the latest.
    -- Compare real instants afterwards: local comparisons can create an artificial
    -- closing/reopening gap in autumn's repeated hour.
    select min(candidate) filter(where wall_time>=v_open and wall_time<=v_close),
      max(candidate) filter(where wall_time>=v_open and wall_time<=v_close),
      max(candidate) filter(where wall_time>=v_open and wall_time<=v_cutoff),
      min(candidate) filter(where wall_time>=greatest(v_from,v_open) and wall_time<=least(v_until,v_close)),
      max(candidate) filter(where wall_time>=greatest(v_from,v_open) and wall_time<=least(v_until,v_close))
      into v_open_instant,v_close_instant,v_cutoff_instant,v_from_instant,v_until_instant
      from (select candidate,candidate at time zone 'Europe/Stockholm' wall_time from generate_series(
      (v_day::timestamp at time zone 'UTC')-interval '3 hours',((v_day+2)::timestamp at time zone 'UTC')+interval '3 hours',interval '1 minute') candidate
      ) actual_minutes;
    if v_open_instant is null or v_cutoff_instant is null or v_from_instant is null then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('starts_at',s.candidate,'event_date',to_char(s.local_time,'YYYY-MM-DD'),
      'event_time',to_char(s.local_time,'HH24:MI'),
      -- Include the UTC offset so autumn's repeated 02:30 remains distinguishable.
      'label',to_char(s.local_time,'YYYY-MM-DD HH24:MI') || ' (' || case when extract(epoch from (s.local_time-(s.candidate at time zone 'UTC')))=7200 then 'CEST +02:00' else 'CET +01:00' end || ')',
      'remaining_capacity',v_settings.capacity_per_slot-s.used) order by s.candidate),'[]'::jsonb) into v_day_slots
    from (
      select candidate,candidate at time zone 'Europe/Stockholm' local_time,
        (select count(*) from public.orders o where o.order_type='direct' and o.status not in ('cancelled','rejected')
          and o.scheduled_at<candidate+make_interval(mins=>v_settings.interval_minutes)
          and o.scheduled_at+make_interval(mins=>o.slot_interval_minutes)>candidate) used
      from generate_series((v_day::timestamp at time zone 'UTC')-interval '3 hours',
        ((v_day+2)::timestamp at time zone 'UTC')+interval '3 hours',interval '1 minute') candidate
      where mod(extract(hour from candidate at time zone 'Europe/Stockholm')::integer*60+extract(minute from candidate at time zone 'Europe/Stockholm')::integer,v_settings.interval_minutes)=0
      and candidate>=p_now+make_interval(mins=>v_settings.min_advance_minutes)
      and candidate>=greatest(p_now,v_open_instant)+make_interval(mins=>v_prep+v_settings.capacity_buffer_minutes+v_travel)
      and candidate-make_interval(mins=>v_travel)<=v_cutoff_instant
      and candidate>=greatest(v_open_instant,v_from_instant)
      and candidate<=least(v_close_instant,v_until_instant)
      and candidate at time zone 'Europe/Stockholm'<=(p_now at time zone 'Europe/Stockholm')::date+v_settings.max_days_ahead+time '23:59'
      and not exists(select 1 from jsonb_array_elements(v_settings.blocked_slots) blocked
        where candidate<(blocked->>'ends_at')::timestamptz and candidate+make_interval(mins=>v_settings.interval_minutes)>(blocked->>'starts_at')::timestamptz)
      -- A special calendar date replaces that date's previous-day carry too.
      and not exists(select 1 from jsonb_array_elements(v_settings.special_hours) special
        where special->>'date'=(candidate at time zone 'Europe/Stockholm')::date::text
          and ((special->>'closed')::boolean or (candidate at time zone 'Europe/Stockholm')::date<>v_day))
    ) s where s.used<v_settings.capacity_per_slot;
    v_slots:=v_slots || v_day_slots;
  end loop;
  select coalesce(jsonb_agg(slot order by (slot->>'starts_at')::timestamptz),'[]'::jsonb) into v_slots
    from (select slot from (select distinct value slot from jsonb_array_elements(v_slots)) deduplicated
      order by (slot->>'starts_at')::timestamptz limit 500) unique_slots;
  return v_result || jsonb_build_object('enabled',true,'slots',v_slots) ||
    case when jsonb_array_length(v_slots)=0 then jsonb_build_object('reason','Inga lediga tider. Prova ett annat antal eller kontakta köket.') else '{}'::jsonb end;
end; $$;

create function public.create_direct_order(p_order jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_settings public.direct_order_settings%rowtype; v_business public.business_settings%rowtype;
  v_menu public.menus%rowtype; v_zone public.delivery_zones%rowtype; v_saved public.orders%rowtype;
  v_key uuid:=(p_order->>'request_id')::uuid; v_quantity integer:=(p_order->>'quantity')::integer;
  v_slot timestamptz:=(p_order->>'scheduled_at')::timestamptz; v_quote jsonb;
begin
  if v_key is null or coalesce(p_order->>'request_hash','')!~'^[a-f0-9]{64}$' then raise exception 'Missing request fingerprint'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key::text,0));
  select * into v_saved from public.orders where request_id=v_key;
  if found then
    if v_saved.request_hash is distinct from p_order->>'request_hash' or v_saved.order_type<>'direct' then raise exception 'Request key already used'; end if;
    return to_jsonb(v_saved)||jsonb_build_object('_created',false);
  end if;
  -- This singleton row serializes capacity checks/reservations, including concurrent requests
  -- for the last slot and admin pauses/settings edits. No check-then-insert race exists.
  select * into strict v_settings from public.direct_order_settings where id=1 for update;
  select * into strict v_business from public.business_settings where id=1 for share;
  select * into v_menu from public.menus where id=(p_order->>'menu_id')::uuid for share;
  -- Price, prep, flags and postal-zone configuration cannot change before commit.
  perform 1 from public.delivery_zones where active for share;
  v_quote:=public.get_direct_availability(p_order,clock_timestamp());
  if not (v_quote->>'enabled')::boolean or not exists(select 1 from jsonb_array_elements(v_quote->'slots') slot where (slot->>'starts_at')::timestamptz=v_slot) then
    raise exception 'Slot unavailable; refresh availability';
  end if;
  if (v_quote->>'total_ore')::bigint is distinct from (p_order->>'expected_total_ore')::bigint or (v_quote->>'total_ore')::bigint not between 1 and 100000000 then
    raise exception 'Price changed; refresh availability';
  end if;
  if p_order->>'fulfillment'='delivery' and (trim(coalesce(p_order->>'address',''))='' or trim(coalesce(p_order->>'city',''))='') then raise exception 'Delivery address required'; end if;
  if p_order->>'payment_preference'='cash' and (p_order->>'fulfillment'<>'pickup' or not v_business.cash_enabled) then raise exception 'Cash requires pickup'; end if;
  if p_order->>'payment_preference'='unpaid' and not v_business.allow_unpaid_requests then raise exception 'Unpaid requests disabled'; end if;
  if coalesce(p_order->>'payment_preference','') not in ('swish','card','apple_pay','google_pay','cash','unpaid') then raise exception 'Invalid payment preference'; end if;
  insert into public.orders(id,code,tracking_hash,request_id,request_hash,menu_id,menu_title,price_per_person_ore,guests,occasion,
    event_date,event_time,fulfillment,address,postal_code,city,full_name,email,phone,notes,subtotal_ore,delivery_fee_ore,total_ore,
    payment_preference,payment_status,status,delivery_zone_id,order_type,package_quantity,scheduled_at,slot_interval_minutes)
  values((p_order->>'id')::uuid,p_order->>'code',p_order->>'tracking_hash',v_key,p_order->>'request_hash',v_menu.id,v_menu.title,v_menu.price_ore,
    least(1000,v_quantity*v_menu.package_portions),'hemma',(v_slot at time zone 'Europe/Stockholm')::date,to_char(v_slot at time zone 'Europe/Stockholm','HH24:MI'),
    p_order->>'fulfillment',case when p_order->>'fulfillment'='delivery' then p_order->>'address' else '' end,
    case when p_order->>'fulfillment'='delivery' then regexp_replace(p_order->>'postal_code','\s','','g') else '' end,
    case when p_order->>'fulfillment'='delivery' then p_order->>'city' else '' end,
    p_order->>'full_name',p_order->>'email',p_order->>'phone',coalesce(p_order->>'notes',''),(v_quote->>'subtotal_ore')::integer,
    (v_quote->>'delivery_fee_ore')::integer,(v_quote->>'total_ore')::integer,p_order->>'payment_preference','unpaid',
    case when v_settings.auto_approve then 'approved' else 'new' end,(v_quote->>'delivery_zone_id')::uuid,'direct',v_quantity,v_slot,v_settings.interval_minutes) returning * into v_saved;
  insert into public.order_items(order_id,menu_id,title,quantity,unit_label,unit_price_ore,total_ore)
    values(v_saved.id,v_menu.id,v_menu.title,v_quantity,'paket',v_menu.price_ore,v_saved.subtotal_ore);
  return to_jsonb(v_saved)||jsonb_build_object('_created',true);
end; $$;

-- The existing quote/review/payment path remains authoritative for catering.
alter function public.create_catering_order(jsonb,jsonb) rename to create_catering_order_v43;
create function public.create_catering_order(p_order jsonb,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.orders where request_id=(p_order->>'request_id')::uuid) and p_order->>'menu_id' is not null then
    perform 1 from public.menus where id=(p_order->>'menu_id')::uuid and catering_enabled for share;
    if not found then raise exception 'Menu requires direct ordering'; end if;
  end if;
  return public.create_catering_order_v43(p_order,p_items);
end; $$;
revoke all on function public.get_direct_availability(jsonb,timestamptz),public.create_direct_order(jsonb),public.create_catering_order(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.get_direct_availability(jsonb,timestamptz),public.create_direct_order(jsonb),public.create_catering_order(jsonb,jsonb) to service_role;
