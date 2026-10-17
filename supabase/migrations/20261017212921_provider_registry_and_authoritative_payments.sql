-- Provider-neutral authoritative engine. Production registers only Adyen.
-- A different provider must be deliberately installed by service_role; no public configuration can register one.
create table public.payment_provider_registry (
  provider text not null check(provider ~ '^[a-z][a-z0-9_]{0,39}$'),
  environment text not null check(environment in ('test','live')),
  checkout_base_url text not null check(checkout_base_url ~ '^https://[^[:space:]@?#]+/$' or
    (environment='test' and checkout_base_url ~ '^http://(127[.]0[.]0[.]1|localhost|10[.]0[.]2[.]2|192[.]168[.][0-9]{1,3}[.][0-9]{1,3}|10[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}):[0-9]{1,5}/[^[:space:]@?#]*/$')),
  active boolean not null default true, primary key(provider,environment)
);
alter table public.payment_provider_registry enable row level security;
revoke all on public.payment_provider_registry from public,anon,authenticated;
grant select,insert,update,delete on public.payment_provider_registry to service_role;
insert into public.payment_provider_registry(provider,environment,checkout_base_url) values
  ('adyen','test','https://test.adyen.link/'),('adyen','live','https://eu.adyen.link/');

create or replace function public.reserve_catering_payment(p_order_id uuid,p_provider text,p_method text,p_revision integer,p_amount_ore integer,p_environment text default 'test')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; a public.payment_attempts%rowtype; v_id uuid;
begin
  select * into v from public.orders where id=p_order_id for update;
  if not found or not exists(select 1 from public.payment_provider_registry where provider=p_provider and environment=p_environment and active) or coalesce(p_method,'') not in ('swish','card','apple_pay','google_pay')
    or coalesce(p_environment,'') not in ('test','live')
    or v.status not in ('approved','preparing','ready') or v.payment_status in ('paid','refunded') or v.payment_review_required
    or v.proposal is not null or v.quote_revision<>v.accepted_revision or v.quote_revision is distinct from p_revision
    or v.total_ore is distinct from p_amount_ore or v.total_ore<=0 or v.cash_received_at is not null
    -- Historical pending Stripe sessions must be reconciled separately, never charged through a second provider.
    or v.stripe_checkout_session_id is not null and v.payment_provider is null then return null; end if;
  select * into a from public.payment_attempts where order_id=v.id and quote_revision=v.quote_revision;
  if found then
    if a.provider<>p_provider or a.method<>p_method or a.amount_ore<>p_amount_ore or a.environment<>p_environment then return null; end if;
    return to_jsonb(a);
  end if;
  if v.payment_status='pending' or exists(select 1 from public.payment_attempts where order_id=v.id) then return null; end if;
  v_id:=gen_random_uuid();
  insert into public.payment_attempts(id,order_id,provider,environment,method,amount_ore,currency,quote_revision,provider_reference,idempotency_key)
    values(v_id,v.id,p_provider,p_environment,p_method,v.total_ore,'SEK',v.quote_revision,'yh-'||v_id::text,v_id::text) returning * into a;
  update public.orders set payment_provider=p_provider,payment_method=p_method,payment_preference=p_method,
    payment_attempt_id=a.id,payment_status='pending',updated_at=now() where id=v.id;
  return to_jsonb(a);
end; $$;

create or replace function public.attach_catering_payment(p_attempt_id uuid,p_provider_payment_id text,p_checkout_url text,p_expires_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; a public.payment_attempts%rowtype;
begin
  select o.* into v from public.orders o join public.payment_attempts x on x.order_id=o.id where x.id=p_attempt_id for update of o;
  if not found then return null; end if;
  select * into strict a from public.payment_attempts where id=p_attempt_id for update;
  if coalesce(p_provider_payment_id,'')='' or p_provider_payment_id !~ '^[A-Za-z0-9_-]{1,100}$'
    or p_checkout_url is distinct from ((select checkout_base_url from public.payment_provider_registry where provider=a.provider and environment=a.environment and active)||p_provider_payment_id)
    or p_expires_at is null
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

drop function public.reserve_catering_refund(uuid,text);
create or replace function public.reserve_catering_refund(p_order_id uuid,p_environment text default 'test',p_provider text default 'adyen')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; a public.payment_attempts%rowtype; r public.payment_refunds%rowtype; v_id uuid;
begin
  select * into v from public.orders where id=p_order_id for update;
  if not found or v.payment_provider is distinct from p_provider or not exists(select 1 from public.payment_provider_registry where provider=p_provider and environment=p_environment and active) or v.payment_review_required then return null; end if;
  select * into a from public.payment_attempts where id=v.payment_attempt_id;
  if not found or a.environment is distinct from p_environment then return null; end if;
  select * into r from public.payment_refunds where order_id=v.id;
  if found then return to_jsonb(r)||jsonb_build_object('environment',a.environment); end if;
  if v.payment_status<>'paid' or a.status<>'paid' or a.transaction_reference is null
    or a.amount_ore<>v.total_ore then return null; end if;
  v_id:=gen_random_uuid();
  insert into public.payment_refunds(id,order_id,attempt_id,provider,amount_ore,currency,transaction_reference,provider_reference,idempotency_key)
    values(v_id,v.id,a.id,a.provider,a.amount_ore,'SEK',a.transaction_reference,'refund-'||v_id::text,v_id::text) returning * into r;
  update public.orders set payment_refund_status='pending',updated_at=now() where id=v.id;
  return to_jsonb(r)||jsonb_build_object('environment',a.environment);
end; $$;

create or replace function public.apply_catering_payment_event(p_event jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; a public.payment_attempts%rowtype; r public.payment_refunds%rowtype;
  v_code text:=p_event->>'event_code'; v_kind text:=p_event->>'kind'; v_success boolean:=(p_event->>'success')::boolean;
  v_psp text:=p_event->>'transaction_reference'; v_original text:=p_event->>'original_reference'; v_inserted integer; v_expected_kind text;
  v_adverse boolean; v_quarantine boolean:=false; v_amount integer:=(p_event->>'amount_ore')::integer;
begin
  if not exists(select 1 from public.payment_provider_registry where provider=p_event->>'provider' and environment=p_event->>'environment' and active) or coalesce(p_event->>'event_id','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_event->>'environment','') not in ('test','live')
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
    select * into a from public.payment_attempts where provider=p_event->>'provider' and transaction_reference=coalesce(v_original,v_psp);
  else
    select * into a from public.payment_attempts where provider=p_event->>'provider' and provider_reference=p_event->>'reference';
  end if;
  if not found then raise exception 'Payment event does not match a reserved payment'; end if;
  select * into strict v from public.orders where id=a.order_id for update;
  select * into strict a from public.payment_attempts where id=a.id for update;
  if a.environment is distinct from p_event->>'environment' then raise exception 'Payment environment mismatch'; end if;
  -- Return the order ID on duplicates so delivery of a durable pending notification is retried.
  if exists(select 1 from public.payment_provider_events where provider=p_event->>'provider' and event_id=p_event->>'event_id' and order_id=v.id) then return v.id; end if;
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
  insert into public.payment_provider_events(provider,environment,event_id,order_id,attempt_id,event_code,kind,amount_ore,currency,transaction_reference,original_reference,success)
    values(p_event->>'provider',a.environment,p_event->>'event_id',v.id,a.id,v_code,v_kind,v_amount,'SEK',v_psp,v_original,v_success) on conflict do nothing;
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
-- The previous identity-blind refund overload was removed above.
revoke all on function public.reserve_catering_refund(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_catering_refund(uuid,text,text) to service_role;
