-- V4: återförsök, tydliga offerter och separata betalningsnotiser. Historiken bevaras.
alter table public.orders
  add column request_id uuid unique,
  add column request_hash text,
  add column quote_revision integer not null default 1 check(quote_revision > 0),
  add column accepted_revision integer not null default 1 check(accepted_revision > 0),
  add column proposal jsonb,
  add column quote_history jsonb not null default '[]'::jsonb,
  add column price_adjustment_ore integer not null default 0;
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check(status in
  ('new','reviewing','changes_requested','approved','preparing','rejected','ready','dispatched','completed','cancelled'));

-- Bevara den tidigare prisfunktionen; omslaget låser samma återförsöksnyckel atomärt.
alter function public.create_catering_order(jsonb,jsonb) rename to create_catering_order_v3;
create function public.create_catering_order(p_order jsonb,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_saved jsonb; v_existing public.orders%rowtype; v_key uuid := (p_order->>'request_id')::uuid;
begin
  if v_key is not null then
    if coalesce(p_order->>'request_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Missing request fingerprint'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_key::text,0));
    select * into v_existing from public.orders where request_id=v_key;
    if found then
      if v_existing.request_hash is distinct from p_order->>'request_hash' then raise exception 'Request key already used'; end if;
      return to_jsonb(v_existing) || jsonb_build_object('_created',false);
    end if;
  end if;
  v_saved := public.create_catering_order_v3(p_order,p_items);
  update public.orders set request_id=v_key,request_hash=p_order->>'request_hash' where id=(v_saved->>'id')::uuid;
  return v_saved || jsonb_build_object('_created',true);
end; $$;

-- Ägaren godkänner förslaget, kunden måste därefter uttryckligen acceptera revisionen.
-- Ett prisbyte ändrar aldrig ursprungliga orderrader eller deras styckpriser.
create function public.propose_catering_change(p_order_id uuid,p_expected_revision integer,p_total_ore integer,p_note text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.orders%rowtype; v_proposal jsonb; v_total integer;
begin
  select * into v from public.orders where id=p_order_id for update;
  if not found or v.status not in ('new','reviewing','changes_requested') or v.payment_status<>'unpaid'
    or v.quote_revision is distinct from p_expected_revision then return null; end if;
  v_total := coalesce(p_total_ore,v.total_ore);
  if v_total<=v.delivery_fee_ore or v_total>100000000 or length(trim(coalesce(p_note,''))) not between 1 and 1000 then
    raise exception 'Invalid proposal';
  end if;
  v_proposal := jsonb_build_object('revision',v.quote_revision+1,'message',trim(p_note),
    'subtotal_ore',v_total-v.delivery_fee_ore,'delivery_fee_ore',v.delivery_fee_ore,'total_ore',v_total,
    'price_adjustment_ore',v_total-v.delivery_fee_ore-v.subtotal_ore+v.price_adjustment_ore,'created_at',now());
  update public.orders set status='changes_requested',proposal=v_proposal,quote_revision=v.quote_revision+1,
    quote_history=quote_history || jsonb_build_array(jsonb_build_object('previous_total_ore',v.total_ore,'proposal',v_proposal)),
    admin_note=p_note,checkout_url=null,stripe_checkout_session_id=null,updated_at=now()
    where id=p_order_id returning * into v;
  return to_jsonb(v);
end; $$;

create function public.accept_catering_change(p_order_id uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.orders%rowtype;
begin
  select * into v from public.orders where id=p_order_id for update;
  if not found then return null; end if;
  if v.status='approved' and v.accepted_revision=p_revision and v.proposal is null then return to_jsonb(v) || jsonb_build_object('_accepted',false); end if;
  if v.status<>'changes_requested' or v.payment_status<>'unpaid' or v.proposal is null or v.quote_revision is distinct from p_revision
    or (v.proposal->>'revision')::integer<>p_revision then return null; end if;
  update public.orders set
    subtotal_ore=(proposal->>'subtotal_ore')::integer,total_ore=(proposal->>'total_ore')::integer,
    price_per_person_ore=round((proposal->>'subtotal_ore')::numeric/guests),
    price_adjustment_ore=(proposal->>'price_adjustment_ore')::integer,
    accepted_revision=p_revision,proposal=null,status='approved',updated_at=now()
    where id=p_order_id returning * into v;
  return to_jsonb(v) || jsonb_build_object('_accepted',true);
end; $$;

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
      and proposal is null and quote_revision=accepted_revision
      and stripe_checkout_session_id is not distinct from p_expected_session_id returning * into v_saved;
  if not found then return null; end if;
  return to_jsonb(v_saved);
end; $$;

create table public.order_push_tokens (
  order_id uuid not null references public.orders(id) on delete cascade,
  token text not null check(token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'),
  last_ticket_id text,last_ticket_at timestamptz,
  updated_at timestamptz not null default now(),primary key(order_id,token)
);
create function public.register_catering_push(p_order_id uuid,p_token text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.orders where id=p_order_id for update;
  if not found or coalesce(p_token,'') !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' then return false; end if;
  if not exists(select 1 from public.order_push_tokens where order_id=p_order_id and token=p_token)
    and (select count(*) from public.order_push_tokens where order_id=p_order_id)>=5 then return false; end if;
  insert into public.order_push_tokens(order_id,token) values(p_order_id,p_token)
    on conflict(order_id,token) do update set updated_at=now();
  return true;
end; $$;
create table public.order_notifications (
  event_key text primary key,order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check(kind in ('paid','refunded','failed')),
  push_claimed boolean not null default false,customer_delivered_at timestamptz,owner_delivered_at timestamptz,delivered_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.order_push_tokens enable row level security;
alter table public.order_notifications enable row level security;
revoke all on public.order_push_tokens,public.order_notifications from public,anon,authenticated;
grant all on public.order_push_tokens,public.order_notifications to service_role;

-- Betalstatus och beständig meddelandekö uppdateras i samma transaktion.
-- Olika Stripe-event för samma betalning får heller inte skicka dubbla kvittenser.
create or replace function public.apply_stripe_event(
  p_event_id text,p_event_type text,p_order_id uuid,p_session_id text,p_payment_intent text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v public.orders%rowtype; v_inserted integer; v_changed integer;
begin
  if p_event_type not in ('paid','failed','refunded') then return false; end if;
  select * into v from public.orders where id=p_order_id for update;
  if not found or v.payment_preference='cash' or not coalesce((
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
  if v_changed=1 then
    insert into public.order_notifications(event_key,order_id,kind)
      values(p_order_id::text||':'||p_event_type||':'||v.quote_revision,p_order_id,p_event_type) on conflict do nothing;
  end if;
  return v_changed=1;
end; $$;

revoke all on function public.create_catering_order(jsonb,jsonb),
  public.propose_catering_change(uuid,integer,integer,text),public.accept_catering_change(uuid,integer),
  public.register_catering_push(uuid,text),
  public.attach_catering_checkout(uuid,text,text,text,text,text),public.apply_stripe_event(text,text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.create_catering_order(jsonb,jsonb),
  public.propose_catering_change(uuid,integer,integer,text),public.accept_catering_change(uuid,integer),
  public.register_catering_push(uuid,text),
  public.attach_catering_checkout(uuid,text,text,text,text,text),public.apply_stripe_event(text,text,uuid,text,text)
  to service_role;
