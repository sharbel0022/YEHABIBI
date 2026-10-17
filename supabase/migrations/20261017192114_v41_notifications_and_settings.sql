-- V4.1: bevara normaliserade zoner och köa varje orderhändelse atomärt.
alter table public.order_notifications add column payload jsonb not null default '{}'::jsonb;
alter table public.order_notifications add column superseded_at timestamptz;
alter table public.order_notifications drop constraint order_notifications_kind_check;
alter table public.order_notifications add constraint order_notifications_kind_check check(kind in
  ('new','reviewing','approved','changes_requested','rejected','preparing','ready','dispatched','completed','cancelled','payment_available','paid','refunded','failed'));

create function public.queue_catering_notification(p_order_id uuid,p_kind text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v public.orders%rowtype; v_key text; v_payload jsonb; v_inserted integer;
begin
  select * into strict v from public.orders where id=p_order_id;
  v_key := v.id::text||':'||p_kind||':'||v.quote_revision;
  if p_kind in ('approved','payment_available','failed') then v_key := v_key||':'||coalesce(v.stripe_checkout_session_id,'none'); end if;
  v_payload := to_jsonb(v)||jsonb_build_object(
    'included',coalesce((select to_jsonb(included) from public.menus where id=v.menu_id),'[]'::jsonb),
    'review_url',(select google_review_url from public.business_settings where id=1));
  insert into public.order_notifications(event_key,order_id,kind,payload) values(v_key,v.id,p_kind,v_payload) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted=1;
end; $$;
revoke all on function public.queue_catering_notification(uuid,text) from public,anon,authenticated;
grant execute on function public.queue_catering_notification(uuid,text) to service_role;

create function public.queue_order_update() returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_kind text;
begin
  if TG_OP='INSERT' then v_kind := 'new';
  elsif new.payment_status is distinct from old.payment_status and new.payment_status in ('paid','refunded','failed') then v_kind := new.payment_status;
  elsif new.status is distinct from old.status or (new.status='changes_requested' and new.quote_revision<>old.quote_revision) then v_kind := new.status;
  elsif new.checkout_url is distinct from old.checkout_url and new.checkout_url is not null then v_kind := 'payment_available';
  end if;
  if v_kind is not null then perform public.queue_catering_notification(new.id,v_kind); end if;
  return new;
end; $$;
revoke all on function public.queue_order_update() from public,anon,authenticated;
grant execute on function public.queue_order_update() to service_role;
create trigger queue_catering_order_update after insert or update on public.orders for each row execute function public.queue_order_update();
create or replace function public.update_catering_settings(p_settings jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v public.business_settings%rowtype; zone jsonb;
begin
  select * into strict v from public.business_settings where id=1 for update;
  v := jsonb_populate_record(v,p_settings);
  update public.business_settings set
    brand_name=v.brand_name,tagline=v.tagline,description=v.description,service_area=v.service_area,location_city=v.location_city,
    contact_email=v.contact_email,contact_phone=v.contact_phone,hero_video_url=v.hero_video_url,hero_poster_url=v.hero_poster_url,
    google_review_url=v.google_review_url,google_maps_url=v.google_maps_url,instagram_url=v.instagram_url,facebook_url=v.facebook_url,tiktok_url=v.tiktok_url,
    pickup_address=v.pickup_address,delivery_enabled=v.delivery_enabled,pickup_enabled=v.pickup_enabled,cash_enabled=v.cash_enabled,
    delivery_fee_ore=v.delivery_fee_ore,min_advance_days=v.min_advance_days,custom_min_people=v.custom_min_people,
    delivery_zones=v.delivery_zones,campaign_title=v.campaign_title,campaign_description=v.campaign_description,campaign_image_url=v.campaign_image_url,
    campaign_start_date=v.campaign_start_date,campaign_end_date=v.campaign_end_date,campaign_enabled=v.campaign_enabled,updated_at=now() where id=1;
  insert into public.delivery_zones(name,postal_prefixes,fee_ore,active,legacy_key)
  values('Grundavgift (V2)',array['0','1','2','3','4','5','6','7','8','9'],v.delivery_fee_ore,v.delivery_enabled,'base')
  on conflict(legacy_key) do update set fee_ore=excluded.fee_ore,updated_at=now();
  update public.delivery_zones set active=false,updated_at=now() where legacy_key like 'prefix:%';
  for zone in select value from jsonb_array_elements(v.delivery_zones) loop
    insert into public.delivery_zones(name,postal_prefixes,fee_ore,active,legacy_key)
    values(zone->>'name',array[zone->>'postal_prefix'],(zone->>'fee_ore')::integer,true,'prefix:'||(zone->>'postal_prefix'))
    on conflict(legacy_key) do update set name=excluded.name,postal_prefixes=excluded.postal_prefixes,fee_ore=excluded.fee_ore,active=true,updated_at=now();
  end loop;
  insert into public.campaigns(title,description,media_url,starts_at,ends_at,active,legacy_key)
  values(v.campaign_title,v.campaign_description,v.campaign_image_url,
    coalesce(v.campaign_start_date,'1970-01-01'::date)::timestamp at time zone 'Europe/Stockholm',
    ((coalesce(v.campaign_end_date,'9999-12-30'::date)+1)::timestamp at time zone 'Europe/Stockholm')-interval '1 millisecond',v.campaign_enabled,'settings')
  on conflict(legacy_key) do update set title=excluded.title,description=excluded.description,media_url=excluded.media_url,
    starts_at=excluded.starts_at,ends_at=excluded.ends_at,active=excluded.active,updated_at=now();
  return true;
end; $$;
revoke all on function public.update_catering_settings(jsonb) from public,anon,authenticated;
grant execute on function public.update_catering_settings(jsonb) to service_role;

-- En redan avstämd händelse förblir idempotent även efter sessionsförnyelse.
create or replace function public.apply_stripe_event(
  p_event_id text,p_event_type text,p_order_id uuid,p_session_id text,p_payment_intent text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v public.orders%rowtype; v_inserted integer; v_changed integer;
begin
  if p_event_type not in ('paid','failed','refunded') then return false; end if;
  select * into v from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order does not exist'; end if;
  if exists(select 1 from public.payment_events where event_id=p_event_id and order_id=p_order_id) then return false; end if;
  if v.payment_preference='cash' or not coalesce((
    (p_event_type in ('paid','failed') and v.stripe_checkout_session_id=p_session_id) or
    (p_event_type='refunded' and v.stripe_payment_intent_id=p_payment_intent)),false) then
    raise exception 'Stripe event does not match an existing order';
  end if;
  if p_event_type='paid' and (v.proposal is not null or v.quote_revision<>v.accepted_revision
    or v.status not in ('approved','preparing','ready','dispatched','completed')) then raise exception 'Order not approved'; end if;
  insert into public.payment_events(event_id,event_type,order_id) values(p_event_id,p_event_type,p_order_id)
    on conflict(event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted=0 then return false; end if;
  update public.orders set payment_status=p_event_type,
    stripe_payment_intent_id=coalesce(p_payment_intent,stripe_payment_intent_id),updated_at=now()
    where id=p_order_id and (
      (p_event_type='paid' and payment_status not in ('paid','refunded')) or
      (p_event_type='failed' and payment_status not in ('paid','refunded','failed')) or
      (p_event_type='refunded' and payment_status='paid'));
  get diagnostics v_changed = row_count;
  return v_changed=1;
end; $$;

