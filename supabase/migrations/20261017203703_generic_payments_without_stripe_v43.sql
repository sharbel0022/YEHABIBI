-- V4.3: additive, provider-neutral payments. Historical Stripe references remain read-only history.
alter table public.business_settings add column allow_unpaid_requests boolean not null default false;
alter table public.orders drop constraint orders_payment_preference_check;
alter table public.orders add constraint orders_payment_preference_check
  check(payment_preference in ('swish','card','apple_pay','google_pay','cash','unpaid'));
alter table public.orders
  add column payment_provider text check(payment_provider ~ '^[a-z][a-z0-9_]{0,39}$'),
  add column provider_payment_id text,
  add column payment_attempt_id uuid,
  add column payment_transaction_reference text,
  add column payment_method text check(payment_method in ('swish','card','apple_pay','google_pay','cash')),
  add column payment_refund_status text check(payment_refund_status in ('pending','confirmed','needs_review')),
  add column payment_review_required boolean not null default false,
  add column payment_review_reason text,
  add column cash_received_at timestamptz,
  add column cash_received_by uuid references auth.users(id);
create unique index orders_provider_payment_idx on public.orders(payment_provider,provider_payment_id) where provider_payment_id is not null;

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  provider text not null check(provider ~ '^[a-z][a-z0-9_]{0,39}$'), method text not null check(method in ('swish','card','apple_pay','google_pay')),
  amount_ore integer not null check(amount_ore between 1 and 100000000), currency text not null check(currency='SEK'),
  quote_revision integer not null check(quote_revision>0),
  provider_reference text not null unique, idempotency_key text not null unique,
  provider_payment_id text, checkout_url text, transaction_reference text,
  expires_at timestamptz, status text not null default 'creating' check(status in ('creating','pending','paid','expired','refunded')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(order_id,quote_revision), unique(provider,provider_payment_id), unique(provider,transaction_reference)
);
alter table public.orders add constraint orders_payment_attempt_fk foreign key(payment_attempt_id) references public.payment_attempts(id);
create table public.payment_provider_events (
  provider text not null check(provider ~ '^[a-z][a-z0-9_]{0,39}$'), event_id text not null,
  order_id uuid not null references public.orders(id), attempt_id uuid not null references public.payment_attempts(id),
  event_code text not null, kind text not null check(kind in ('paid','failed','refunded','review')),
  amount_ore integer not null, currency text not null check(currency='SEK'),
  transaction_reference text not null, original_reference text,
  success boolean not null, created_at timestamptz not null default now(), primary key(provider,event_id)
);
create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
  attempt_id uuid not null unique references public.payment_attempts(id), provider text not null check(provider ~ '^[a-z][a-z0-9_]{0,39}$'),
  amount_ore integer not null check(amount_ore between 1 and 100000000), currency text not null check(currency='SEK'),
  transaction_reference text not null, provider_reference text not null unique, idempotency_key text not null unique,
  provider_refund_id text unique, status text not null default 'creating' check(status in ('creating','pending','confirmed','needs_review')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.payment_attempts enable row level security;
alter table public.payment_provider_events enable row level security;
alter table public.payment_refunds enable row level security;
revoke all on public.payment_attempts,public.payment_provider_events,public.payment_refunds from public,anon,authenticated;
grant select,insert,update on public.payment_attempts,public.payment_provider_events,public.payment_refunds to service_role;

-- Disable obsolete privileged entry points, including service_role. Never discard old payment_events/history.
revoke all on function public.attach_catering_checkout(uuid,text,text,text,text,text),
  public.apply_stripe_event(text,text,uuid,text,text) from public,anon,authenticated,service_role;

alter function public.create_catering_order(jsonb,jsonb) rename to create_catering_order_v4;
create function public.create_catering_order(p_order jsonb,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_settings public.business_settings%rowtype;
begin
  -- A retry of an existing accepted request remains idempotent if the business later disables unpaid requests.
  if exists(select 1 from public.orders where request_id=(p_order->>'request_id')::uuid) then
    return public.create_catering_order_v4(p_order,p_items);
  end if;
  select * into strict v_settings from public.business_settings where id=1 for share;
  if p_order->>'payment_preference'='unpaid' and not v_settings.allow_unpaid_requests then raise exception 'Unpaid requests disabled'; end if;
  if coalesce(p_order->>'payment_preference','') not in ('swish','card','apple_pay','google_pay','cash','unpaid') then raise exception 'Invalid payment preference'; end if;
  return public.create_catering_order_v4(p_order,p_items);
end; $$;

-- Original line prices and historical provider references survive every price proposal.
create or replace function public.propose_catering_change(p_order_id uuid,p_expected_revision integer,p_total_ore integer,p_note text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; v_proposal jsonb; v_total integer;
begin
  select * into v from public.orders where id=p_order_id for update;
  if not found or v.status not in ('new','reviewing','changes_requested') or v.payment_status<>'unpaid'
    or v.payment_attempt_id is not null or v.payment_review_required
    or v.quote_revision is distinct from p_expected_revision then return null; end if;
  v_total:=coalesce(p_total_ore,v.total_ore);
  if v_total<=v.delivery_fee_ore or v_total>100000000 or length(trim(coalesce(p_note,''))) not between 1 and 1000 then raise exception 'Invalid proposal'; end if;
  v_proposal:=jsonb_build_object('revision',v.quote_revision+1,'message',trim(p_note),
    'subtotal_ore',v_total-v.delivery_fee_ore,'delivery_fee_ore',v.delivery_fee_ore,'total_ore',v_total,
    'price_adjustment_ore',v_total-v.delivery_fee_ore-v.subtotal_ore+v.price_adjustment_ore,'created_at',now());
  update public.orders set status='changes_requested',proposal=v_proposal,quote_revision=v.quote_revision+1,
    quote_history=quote_history||jsonb_build_array(jsonb_build_object('previous_total_ore',v.total_ore,'proposal',v_proposal)),
    admin_note=p_note,checkout_url=null,updated_at=now() where id=p_order_id returning * into v;
  return to_jsonb(v);
end; $$;
alter function public.update_catering_settings(jsonb) rename to update_catering_settings_v41;
create function public.update_catering_settings(p_settings jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform public.update_catering_settings_v41(p_settings);
  if p_settings ? 'allow_unpaid_requests' then
    if jsonb_typeof(p_settings->'allow_unpaid_requests')<>'boolean' then raise exception 'Invalid unpaid setting'; end if;
    update public.business_settings set allow_unpaid_requests=(p_settings->>'allow_unpaid_requests')::boolean where id=1;
  end if;
  return true;
end; $$;

-- The order lock serializes reservations, customer acceptance, callbacks, refunds and cash receipt.
-- One attempt per accepted revision remains reserved even after expiry/ambiguous network failures.
create function public.reserve_catering_payment(p_order_id uuid,p_provider text,p_method text,p_revision integer,p_amount_ore integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; a public.payment_attempts%rowtype; v_id uuid;
begin
  select * into v from public.orders where id=p_order_id for update;
  if not found or p_provider is distinct from 'adyen' or coalesce(p_method,'') not in ('swish','card','apple_pay','google_pay')
    or v.status not in ('approved','preparing','ready') or v.payment_status in ('paid','refunded') or v.payment_review_required
    or v.proposal is not null or v.quote_revision<>v.accepted_revision or v.quote_revision is distinct from p_revision
    or v.total_ore is distinct from p_amount_ore or v.total_ore<=0 or v.cash_received_at is not null
    -- Historical pending Stripe sessions must be reconciled separately, never charged through a second provider.
    or v.stripe_checkout_session_id is not null and v.payment_provider is null then return null; end if;
  select * into a from public.payment_attempts where order_id=v.id and quote_revision=v.quote_revision;
  if found then
    if a.provider<>p_provider or a.method<>p_method or a.amount_ore<>p_amount_ore then return null; end if;
    return to_jsonb(a);
  end if;
  if v.payment_status='pending' or exists(select 1 from public.payment_attempts where order_id=v.id) then return null; end if;
  v_id:=gen_random_uuid();
  insert into public.payment_attempts(id,order_id,provider,method,amount_ore,currency,quote_revision,provider_reference,idempotency_key)
    values(v_id,v.id,p_provider,p_method,v.total_ore,'SEK',v.quote_revision,'yh-'||v_id::text,v_id::text) returning * into a;
  update public.orders set payment_provider=p_provider,payment_method=p_method,payment_preference=p_method,
    payment_attempt_id=a.id,payment_status='pending',updated_at=now() where id=v.id;
  return to_jsonb(a);
end; $$;

create function public.attach_catering_payment(p_attempt_id uuid,p_provider_payment_id text,p_checkout_url text,p_expires_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; a public.payment_attempts%rowtype;
begin
  select o.* into v from public.orders o join public.payment_attempts x on x.order_id=o.id where x.id=p_attempt_id for update of o;
  if not found then return null; end if;
  select * into strict a from public.payment_attempts where id=p_attempt_id for update;
  if coalesce(p_provider_payment_id,'')='' or p_provider_payment_id !~ '^[A-Za-z0-9_-]{1,100}$'
    or coalesce(p_checkout_url,'') !~ '^https://test[.]adyen[.]link/' or p_expires_at is null
    or v.payment_attempt_id<>a.id or v.total_ore<>a.amount_ore or v.quote_revision<>a.quote_revision
    or a.provider_payment_id is not null and a.provider_payment_id<>p_provider_payment_id then return null; end if;
  update public.payment_attempts set provider_payment_id=p_provider_payment_id,checkout_url=p_checkout_url,expires_at=p_expires_at,
    status=case when status='creating' then 'pending' else status end,updated_at=now() where id=a.id;
  -- A fast callback may already have paid/refunded: attachment must never move it back to pending.
  update public.orders set provider_payment_id=p_provider_payment_id,
    payment_status=case when payment_status='failed' then 'pending' else payment_status end,
    checkout_url=case when payment_status in ('paid','refunded') or payment_review_required then null else p_checkout_url end,
    updated_at=now() where id=v.id returning * into v;
  return to_jsonb(v);
end; $$;
create function public.expire_catering_payment(p_attempt_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; a public.payment_attempts%rowtype;
begin
  select o.* into v from public.orders o join public.payment_attempts x on x.order_id=o.id where x.id=p_attempt_id for update of o;
  if not found then return null; end if;
  select * into strict a from public.payment_attempts where id=p_attempt_id for update;
  if a.status not in ('paid','refunded') then
    update public.payment_attempts set status='expired',updated_at=now() where id=a.id;
    update public.orders set checkout_url=null,payment_review_required=true,payment_review_reason='link_expired_reconcile',updated_at=now()
      where id=v.id and payment_status not in ('paid','refunded') returning * into v;
    perform public.queue_catering_notification(a.order_id,'payment_review');
  end if;
  return to_jsonb(v);
end; $$;

create function public.reserve_catering_refund(p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; a public.payment_attempts%rowtype; r public.payment_refunds%rowtype; v_id uuid;
begin
  select * into v from public.orders where id=p_order_id for update;
  if not found or v.payment_provider is distinct from 'adyen' or v.payment_review_required then return null; end if;
  select * into r from public.payment_refunds where order_id=v.id;
  if found then return to_jsonb(r); end if;
  select * into a from public.payment_attempts where id=v.payment_attempt_id;
  if not found or v.payment_status<>'paid' or a.status<>'paid' or a.transaction_reference is null
    or a.amount_ore<>v.total_ore then return null; end if;
  v_id:=gen_random_uuid();
  insert into public.payment_refunds(id,order_id,attempt_id,provider,amount_ore,currency,transaction_reference,provider_reference,idempotency_key)
    values(v_id,v.id,a.id,a.provider,a.amount_ore,'SEK',a.transaction_reference,'refund-'||v_id::text,v_id::text) returning * into r;
  update public.orders set payment_refund_status='pending',updated_at=now() where id=v.id;
  return to_jsonb(r);
end; $$;
create function public.attach_catering_refund(p_refund_id uuid,p_provider_refund_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; r public.payment_refunds%rowtype;
begin
  select o.* into v from public.orders o join public.payment_refunds x on x.order_id=o.id where x.id=p_refund_id for update of o;
  if not found then return null; end if;
  select * into strict r from public.payment_refunds where id=p_refund_id for update;
  if coalesce(p_provider_refund_id,'')='' or r.provider_refund_id is not null and r.provider_refund_id<>p_provider_refund_id then return null; end if;
  update public.payment_refunds set provider_refund_id=p_provider_refund_id,
    status=case when status='creating' then 'pending' else status end,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end; $$;

create function public.record_catering_cash_payment(p_order_id uuid,p_admin_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype;
begin
  select * into v from public.orders where id=p_order_id for update;
  if not found or p_admin_id is null
    or v.fulfillment<>'pickup' or v.payment_preference<>'cash' or v.payment_provider is not null
    or v.payment_attempt_id is not null or v.proposal is not null or v.quote_revision<>v.accepted_revision
    or v.payment_review_required or v.status not in ('approved','preparing','ready','completed') then return null; end if;
  if v.payment_status='paid' and v.cash_received_at is not null then return to_jsonb(v); end if;
  if v.payment_status<>'unpaid' then return null; end if;
  update public.orders set payment_status='paid',payment_method='cash',cash_received_by=p_admin_id,cash_received_at=now(),updated_at=now()
    where id=v.id returning * into v;
  return to_jsonb(v);
end; $$;

alter table public.order_notifications drop constraint order_notifications_kind_check;
alter table public.order_notifications add constraint order_notifications_kind_check check(kind in
  ('new','reviewing','approved','changes_requested','rejected','preparing','ready','dispatched','completed','cancelled','payment_available','paid','refunded','failed','payment_review','payment_request'));
-- Payment link IDs replace inactive Stripe IDs in outbox dedupe; snapshots remain immutable.
create or replace function public.queue_catering_notification(p_order_id uuid,p_kind text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; v_key text; v_payload jsonb; v_inserted integer;
begin
  select * into strict v from public.orders where id=p_order_id;
  v_key:=v.id::text||':'||p_kind||':'||v.quote_revision;
  if p_kind in ('approved','payment_available','failed') then v_key:=v_key||':'||coalesce(v.provider_payment_id,'none'); end if;
  if p_kind='payment_review' then v_key:=v_key||':'||coalesce(v.payment_review_reason,'unknown'); end if;
  v_payload:=to_jsonb(v)||jsonb_build_object(
    'included',coalesce((select to_jsonb(included) from public.menus where id=v.menu_id),'[]'::jsonb),
    'review_url',(select google_review_url from public.business_settings where id=1));
  insert into public.order_notifications(event_key,order_id,kind,payload) values(v_key,v.id,p_kind,v_payload) on conflict do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted=1;
end; $$;

-- Only the backend calls this after verifying HMAC. All comparisons are rechecked under the order lock.
create function public.apply_catering_payment_event(p_event jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; a public.payment_attempts%rowtype; r public.payment_refunds%rowtype;
  v_code text:=p_event->>'event_code'; v_kind text:=p_event->>'kind'; v_success boolean:=(p_event->>'success')::boolean;
  v_psp text:=p_event->>'transaction_reference'; v_original text:=p_event->>'original_reference'; v_inserted integer; v_expected_kind text;
  v_adverse boolean; v_quarantine boolean:=false; v_amount integer:=(p_event->>'amount_ore')::integer;
begin
  if p_event->>'provider' is distinct from 'adyen' or coalesce(p_event->>'event_id','') !~ '^[a-f0-9]{64}$'
    or coalesce(v_psp,'')='' or p_event->>'currency' is distinct from 'SEK' or v_amount is null or v_amount<=0
    or coalesce(v_code,'') not in ('AUTHORISATION','CAPTURE','CAPTURE_FAILED','REFUND','REFUND_FAILED','REFUNDED_REVERSED','CHARGEBACK','SETTLED_REVERSED') then raise exception 'Invalid payment event'; end if;
  v_expected_kind:=case when v_code='AUTHORISATION' then case when v_success then 'paid' else 'failed' end
    when v_code='CAPTURE' then case when v_success then 'paid' else 'review' end
    when v_code='REFUND' then case when v_success then 'refunded' else 'review' end else 'review' end;
  if v_kind is distinct from v_expected_kind or v_success is null then raise exception 'Invalid event kind'; end if;
  v_adverse:=v_code in ('REFUND','REFUND_FAILED','REFUNDED_REVERSED','CAPTURE_FAILED','CHARGEBACK','SETTLED_REVERSED') or (v_code='CAPTURE' and not v_success);
  if v_adverse then
    -- Merchant-dashboard refunds, partial disputes and late scheme failures are real adverse changes too.
    -- Their signed original PSP binds a known transaction even without a local refund reservation.
    select * into a from public.payment_attempts where provider='adyen' and transaction_reference=coalesce(v_original,v_psp);
  else
    select * into a from public.payment_attempts where provider='adyen' and provider_reference=p_event->>'reference';
  end if;
  if not found then raise exception 'Payment event does not match a reserved payment'; end if;
  select * into strict v from public.orders where id=a.order_id for update;
  select * into strict a from public.payment_attempts where id=a.id for update;
  -- Return the order ID on duplicates so delivery of a durable pending notification is retried.
  if exists(select 1 from public.payment_provider_events where provider='adyen' and event_id=p_event->>'event_id' and order_id=v.id) then return v.id; end if;
  if v.payment_attempt_id is distinct from a.id or v.payment_provider is distinct from a.provider or v.payment_preference='cash'
    or v_amount is distinct from a.amount_ore or v.total_ore<>a.amount_ore
    or v.quote_revision<>a.quote_revision or v.accepted_revision<>a.quote_revision or v.proposal is not null then
    if v_adverse then v_quarantine:=true; else raise exception 'Payment amount or revision mismatch'; end if;
  end if;
  if v_code='AUTHORISATION' then
    if v_success and a.transaction_reference is not null and a.transaction_reference<>v_psp then raise exception 'Unexpected second payment'; end if;
    if v_success and v.status not in ('approved','preparing','ready','dispatched','completed') then raise exception 'Order not approved'; end if;
    if v_kind is distinct from (case when v_success then 'paid' else 'failed' end) then raise exception 'Invalid event kind'; end if;
  elsif v_code in ('CAPTURE','CAPTURE_FAILED','CHARGEBACK','SETTLED_REVERSED') then
    if a.transaction_reference is null or a.transaction_reference is distinct from coalesce(v_original,v_psp) then raise exception 'Payment transaction mismatch'; end if;
  else
    select * into r from public.payment_refunds where attempt_id=a.id for update;
    if not found or r.transaction_reference is distinct from v_original or r.amount_ore<>v_amount
      or r.provider_refund_id is not null and r.provider_refund_id<>v_psp
      or r.provider_refund_id is null and r.provider_reference is distinct from p_event->>'reference' then v_quarantine:=true; end if;
  end if;
  insert into public.payment_provider_events(provider,event_id,order_id,attempt_id,event_code,kind,amount_ore,currency,transaction_reference,original_reference,success)
    values('adyen',p_event->>'event_id',v.id,a.id,v_code,v_kind,v_amount,'SEK',v_psp,v_original,v_success) on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then return v.id; end if;
  if v_quarantine then
    update public.orders set payment_review_required=true,payment_review_reason='unmatched_'||v_code,checkout_url=null,
      payment_refund_status=case when v_code in ('REFUND','REFUND_FAILED','REFUNDED_REVERSED') then 'needs_review' else payment_refund_status end,
      updated_at=now() where id=v.id;
    -- An unmatched external event must not overwrite the locally reserved refund's identity.
    if r.id is not null then update public.payment_refunds set status='needs_review',updated_at=now() where id=r.id; end if;
    perform public.queue_catering_notification(v.id,'payment_review');
  elsif v_code in ('AUTHORISATION','CAPTURE') and v_success then
    update public.payment_attempts set status=case when status='refunded' then status else 'paid' end,
      transaction_reference=coalesce(transaction_reference,v_psp),updated_at=now() where id=a.id;
    update public.orders set payment_status='paid',checkout_url=null,
      payment_review_required=case when payment_review_reason='link_expired_reconcile' then false else payment_review_required end,
      payment_review_reason=case when payment_review_reason='link_expired_reconcile' then null else payment_review_reason end,
      payment_transaction_reference=coalesce(payment_transaction_reference,v_psp),updated_at=now()
      where id=v.id and payment_status not in ('paid','refunded');
  elsif v_code='AUTHORISATION' and not v_success then
    -- A refused attempt does not close a Pay by Link page. Reuse the same link for retries.
    update public.orders set payment_status='failed',updated_at=now() where id=v.id and payment_status not in ('paid','refunded');
  elsif v_code='REFUND' and v_success then
    if r.status<>'needs_review' then
      update public.payment_refunds set provider_refund_id=v_psp,status='confirmed',updated_at=now() where id=r.id;
      update public.payment_attempts set status='refunded',updated_at=now() where id=a.id;
      update public.orders set payment_status='refunded',payment_refund_status='confirmed',checkout_url=null,updated_at=now() where id=v.id;
    end if;
  else
    -- Refund/capture can fail after an earlier success. Preserve payment history and require reconciliation.
    if v_code in ('REFUND','REFUND_FAILED','REFUNDED_REVERSED') then
      update public.payment_refunds set provider_refund_id=v_psp,status='needs_review',updated_at=now() where id=r.id;
      update public.orders set payment_refund_status='needs_review' where id=v.id;
    end if;
    update public.orders set payment_review_required=true,payment_review_reason=v_code,checkout_url=null,updated_at=now() where id=v.id;
    perform public.queue_catering_notification(v.id,'payment_review');
  end if;
  return v.id;
end; $$;

revoke all on function public.create_catering_order(jsonb,jsonb),public.update_catering_settings(jsonb),
  public.reserve_catering_payment(uuid,text,text,integer,integer),public.attach_catering_payment(uuid,text,text,timestamptz),
  public.expire_catering_payment(uuid),public.reserve_catering_refund(uuid),public.attach_catering_refund(uuid,text),
  public.record_catering_cash_payment(uuid,uuid),public.apply_catering_payment_event(jsonb)
  from public,anon,authenticated;
grant execute on function public.create_catering_order(jsonb,jsonb),public.update_catering_settings(jsonb),
  public.reserve_catering_payment(uuid,text,text,integer,integer),public.attach_catering_payment(uuid,text,text,timestamptz),
  public.expire_catering_payment(uuid),public.reserve_catering_refund(uuid),public.attach_catering_refund(uuid,text),
  public.record_catering_cash_payment(uuid,uuid),public.apply_catering_payment_event(jsonb)
  to service_role;
