-- Add capacity to the existing verified financial engine. Preserve old financial history.
-- All entry points that can reserve capacity lock settings BEFORE an order/attempt.
alter table public.payment_attempts drop constraint payment_attempts_status_check;
alter table public.payment_attempts add constraint payment_attempts_status_check
  check(status in ('creating','pending','paid','expired','refunded','failed'));
alter function public.reserve_catering_payment(uuid,text,text,integer,integer,text) rename to reserve_catering_payment_financial_v43;
create function public.reserve_catering_payment(p_order_id uuid,p_provider text,p_method text,p_revision integer,p_amount_ore integer,p_environment text default 'test')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a jsonb;
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  if not public.prepare_order_capacity_payment(p_order_id) then return null; end if;
  a:=public.reserve_catering_payment_financial_v43(p_order_id,p_provider,p_method,p_revision,p_amount_ore,p_environment);
  if a is not null and a->>'status'='failed' then
    update public.payment_attempts set status=case when provider_payment_id is null then 'creating' else 'pending' end,updated_at=now()
      where id=(a->>'id')::uuid returning to_jsonb(payment_attempts.*) into a;
    update public.orders set payment_status='pending',updated_at=now() where id=p_order_id and payment_status='failed';
  end if;
  return a;
end; $$;

alter function public.apply_catering_payment_event(jsonb) rename to apply_catering_payment_event_financial_v43;
-- A verified late charge can follow a safely cancelled failed attempt. Keep the
-- cancellation, but record the money and route capacity to review. Existing
-- amount/revision/provider/transaction checks still run before this guard.
do $$declare definition text;guard text;begin
  select pg_get_functiondef('public.apply_catering_payment_event_financial_v43(jsonb)'::regprocedure) into definition;
  guard:=$guard$if v_success and v.status not in ('approved','preparing','ready','dispatched','completed') then raise exception 'Order not approved'; end if;$guard$;
  if position(guard in definition)=0 then raise exception 'Unexpected financial authorisation guard';end if;
  definition:=replace(definition,guard,$replacement$if v_success and v.status not in ('approved','preparing','ready','dispatched','completed')
    and not coalesce((v.capacity_status in ('released','review') and v.status in ('cancelled','rejected')),false) then raise exception 'Order not approved'; end if;$replacement$);
  execute definition;
end;$$;
create function public.apply_catering_payment_event(p_event jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v public.orders%rowtype;
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  v_id:=public.apply_catering_payment_event_financial_v43(p_event);
  if v_id is null then return null; end if;
  select * into strict v from public.orders where id=v_id;
  if v.payment_status='paid' and p_event->>'kind'='paid' and (p_event->>'success')::boolean then
    perform public.settle_order_capacity_payment(v_id,'paid');
    if exists(select 1 from public.orders where id=v_id and capacity_status='review') then
      perform public.queue_catering_notification(v_id,'payment_review');
    end if;
  elsif v.payment_status='failed' and p_event->>'event_code'='AUTHORISATION' and not (p_event->>'success')::boolean then
    -- A verified terminal refusal is different from a network timeout or an expired link.
    update public.payment_attempts set status='failed',updated_at=now() where id=v.payment_attempt_id and status not in ('paid','refunded');
    perform public.settle_order_capacity_payment(v_id,'failed');
  elsif v.payment_status='refunded' and p_event->>'kind'='refunded' and (p_event->>'success')::boolean then
    perform public.settle_order_capacity_payment(v_id,'refunded');
    update public.orders set payment_review_required=false,payment_review_reason=null
      where id=v_id and payment_review_reason='capacity_unavailable_after_payment';
  end if;
  return v_id;
end; $$;

alter function public.reserve_catering_refund(uuid,text,text) rename to reserve_catering_refund_financial_v43;
create function public.reserve_catering_refund(p_order_id uuid,p_environment text default 'test',p_provider text default 'adyen')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.orders%rowtype; r jsonb; capacity_exception boolean;
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  select * into v from public.orders where id=p_order_id for update;
  capacity_exception:=v.capacity_status='review' and v.payment_review_required and v.payment_review_reason='capacity_unavailable_after_payment';
  -- Only the known capacity exception permits a refund while flagged. Disputes stay quarantined.
  if capacity_exception then update public.orders set payment_review_required=false where id=p_order_id; end if;
  r:=public.reserve_catering_refund_financial_v43(p_order_id,p_environment,p_provider);
  if capacity_exception then update public.orders set payment_review_required=true where id=p_order_id; end if;
  return r;
end; $$;

alter function public.accept_catering_change(uuid,integer) rename to accept_catering_change_before_capacity_v44;
create function public.accept_catering_change(p_order_id uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  return public.accept_catering_change_before_capacity_v44(p_order_id,p_revision);
end; $$;

revoke all on function public.reserve_catering_payment(uuid,text,text,integer,integer,text),
  public.apply_catering_payment_event(jsonb),public.reserve_catering_refund(uuid,text,text),public.accept_catering_change(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.reserve_catering_payment(uuid,text,text,integer,integer,text),
  public.apply_catering_payment_event(jsonb),public.reserve_catering_refund(uuid,text,text),public.accept_catering_change(uuid,integer)
  to service_role;
