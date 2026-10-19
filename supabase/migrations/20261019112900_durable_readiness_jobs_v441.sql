-- Local readiness only: this migration installs no scheduler and sends no messages.
-- All workers use service_role, short transactions and fenced, recoverable leases.
alter table public.payment_attempts
  add column merchant_account text check(length(merchant_account) between 1 and 200),
  add column reconciliation_checked_at timestamptz,
  add column reconciliation_next_check_at timestamptz not null default (now()+interval '5 minutes'),
  add column reconciliation_reason text,
  add column reconciliation_manual_review boolean not null default false,
  add column last_verified_event_at timestamptz;

-- Existing attempts deliberately retain NULL merchant snapshots. Backfill only
-- after an operator has independently verified the original account; never infer
-- the historical merchant from today's environment variables.
alter function public.reserve_catering_payment(uuid,text,text,integer,integer,text) rename to reserve_catering_payment_capacity_v44;
create function public.reserve_catering_payment(p_order_id uuid,p_provider text,p_method text,p_revision integer,p_amount_ore integer,p_environment text default 'test',p_merchant_account text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a jsonb;existed boolean;
begin
  if p_merchant_account is not null and length(p_merchant_account) not between 1 and 200 then return null;end if;
  perform 1 from public.direct_order_settings where id=1 for update;
  existed:=exists(select 1 from public.payment_attempts where order_id=p_order_id and quote_revision=p_revision);
  a:=public.reserve_catering_payment_capacity_v44(p_order_id,p_provider,p_method,p_revision,p_amount_ore,p_environment);
  if a is null then return null;end if;
  -- Only a newly created attempt can acquire an account snapshot through this API.
  if not existed then
    update public.payment_attempts set merchant_account=p_merchant_account where id=(a->>'id')::uuid returning to_jsonb(payment_attempts.*) into a;
  end if;
  if p_merchant_account is not null and a->>'merchant_account' is distinct from p_merchant_account then return null;end if;
  return a;
end;$$;

alter function public.reserve_catering_refund(uuid,text,text) rename to reserve_catering_refund_before_jobs_v441;
create function public.reserve_catering_refund(p_order_id uuid,p_environment text default 'test',p_provider text default 'adyen')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
  r:=public.reserve_catering_refund_before_jobs_v441(p_order_id,p_environment,p_provider);
  if r is null then return null;end if;
  return r||jsonb_build_object('merchant_account',(select merchant_account from public.payment_attempts where id=(r->>'attempt_id')::uuid));
end;$$;

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('payment_event','kitchen_watchdog','reconciliation','release_capacity')),
  payload jsonb not null default '{}',dedupe_key text not null unique,
  status text not null default 'pending' check(status in ('pending','leased','completed','dead')),
  available_at timestamptz not null default now(),lease_owner text,lease_token uuid,lease_expires_at timestamptz,
  attempts integer not null default 0,max_attempts integer not null default 8 check(max_attempts between 1 and 20),
  last_error text,created_at timestamptz not null default now(),completed_at timestamptz
);
create index background_jobs_due_idx on public.background_jobs(available_at,created_at) where status in ('pending','leased');
create table public.payment_event_inbox (
  provider text not null,event_id text not null,attempt_id uuid not null references public.payment_attempts(id),
  payload jsonb not null,job_id uuid not null references public.background_jobs(id),
  received_at timestamptz not null default now(),processed_at timestamptz,
  primary key(provider,event_id)
);
alter table public.background_jobs enable row level security;
alter table public.payment_event_inbox enable row level security;
revoke all on public.background_jobs,public.payment_event_inbox from public,anon,authenticated;
grant select,insert,update,delete on public.background_jobs,public.payment_event_inbox to service_role;

create function public.enqueue_catering_payment_events(p_events jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare e jsonb;a public.payment_attempts%rowtype;j uuid;n integer:=0;normal jsonb;expected text;adverse boolean;
begin
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) not between 1 and 100 then raise exception 'Invalid event batch';end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if coalesce(e->>'event_id','') !~ '^[a-f0-9]{64}$' or coalesce(e->>'environment','') not in ('test','live')
      or coalesce(e->>'transaction_reference','')='' or e->>'currency' is distinct from 'SEK'
      or coalesce(e->>'event_code','') not in ('AUTHORISATION','CAPTURE','CAPTURE_FAILED','REFUND','REFUND_FAILED','REFUNDED_REVERSED','CHARGEBACK','SETTLED_REVERSED')
      or jsonb_typeof(e->'success') is distinct from 'boolean' then raise exception 'Invalid payment event';end if;
    expected:=case when e->>'event_code'='AUTHORISATION' then case when (e->>'success')::boolean then 'paid' else 'failed' end
      when e->>'event_code'='CAPTURE' then case when (e->>'success')::boolean then 'paid' else 'review' end
      when e->>'event_code'='REFUND' then case when (e->>'success')::boolean then 'refunded' else 'review' end else 'review' end;
    if e->>'kind' is distinct from expected then raise exception 'Invalid event kind';end if;
    adverse:=e->>'event_code' in ('REFUND','REFUND_FAILED','REFUNDED_REVERSED','CAPTURE_FAILED','CHARGEBACK','SETTLED_REVERSED')
      or (e->>'event_code'='CAPTURE' and not (e->>'success')::boolean);
    -- Bind adverse events by original transaction and authorisations by reserved reference.
    select * into a from public.payment_attempts where provider=e->>'provider' and
      (case when adverse then transaction_reference=coalesce(e->>'original_reference',e->>'transaction_reference') else provider_reference=e->>'reference' end);
    if not found and adverse then
      -- A capture may share a delivery batch with an authorisation that has only
      -- reached this inbox. Its signed reserved reference safely preserves the
      -- evidence; the financial worker still verifies original PSP after auth.
      select * into a from public.payment_attempts where provider=e->>'provider' and transaction_reference is null and provider_reference=e->>'reference';
    end if;
    if not found then raise exception 'Payment event does not match a reserved payment';end if;
    if a.environment is distinct from e->>'environment' or a.merchant_account is null or a.merchant_account is distinct from e->>'merchant_account'
      or a.currency is distinct from e->>'currency' or a.amount_ore is distinct from (e->>'amount_ore')::integer then raise exception 'Payment identity or amount mismatch';end if;
    -- Store only the signed, normalised financial evidence; no raw payload, PII or sessions.
    normal:=jsonb_build_object('provider',a.provider,'environment',a.environment,'merchant_account',a.merchant_account,
      'event_id',e->>'event_id','event_code',e->>'event_code','kind',expected,'success',(e->>'success')::boolean,
      'reference',e->>'reference','transaction_reference',e->>'transaction_reference','original_reference',e->>'original_reference',
      'amount_ore',a.amount_ore,'currency',a.currency);
    if exists(select 1 from public.payment_event_inbox where provider=a.provider and event_id=e->>'event_id') then
      if not exists(select 1 from public.payment_event_inbox where provider=a.provider and event_id=e->>'event_id' and payload=normal) then raise exception 'Conflicting duplicate payment event';end if;
      continue;
    end if;
    insert into public.background_jobs(kind,payload,dedupe_key) values('payment_event',jsonb_build_object('provider',a.provider,'event_id',e->>'event_id'),'payment:'||a.provider||':'||(e->>'event_id'))
      on conflict(dedupe_key) do update set dedupe_key=excluded.dedupe_key returning id into j;
    insert into public.payment_event_inbox(provider,event_id,attempt_id,payload,job_id) values(a.provider,e->>'event_id',a.id,normal,j) on conflict do nothing;
    if found then n:=n+1;end if;
    if not exists(select 1 from public.payment_event_inbox where provider=a.provider and event_id=e->>'event_id' and payload=normal) then raise exception 'Conflicting duplicate payment event';end if;
  end loop;
  return n;
end;$$;

create function public.claim_background_jobs(p_worker text,p_limit integer default 20,p_lease_seconds integer default 60,p_now timestamptz default clock_timestamp())
returns setof public.background_jobs language plpgsql security invoker set search_path='' as $$
begin
  if length(trim(coalesce(p_worker,''))) not between 1 and 100 or p_limit not between 1 and 100 or p_lease_seconds not between 5 and 900 then raise exception 'Invalid worker lease';end if;
  update public.background_jobs set status='dead',lease_owner=null,lease_token=null,lease_expires_at=null,last_error='Lease expired after retry limit'
    where status='leased' and lease_expires_at<=p_now and attempts>=max_attempts;
  return query with due as (select id from public.background_jobs
    where (status='pending' and available_at<=p_now or status='leased' and lease_expires_at<=p_now) and attempts<max_attempts
    order by available_at,created_at,id for update skip locked limit p_limit)
  update public.background_jobs j set status='leased',lease_owner=p_worker,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempts=attempts+1
    from due where j.id=due.id returning j.*;
end;$$;
create function public.complete_background_job(p_id uuid,p_lease_token uuid,p_now timestamptz default clock_timestamp()) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.background_jobs set status='completed',completed_at=p_now,lease_owner=null,lease_token=null,lease_expires_at=null,last_error=null
    where id=p_id and status='leased' and lease_token=p_lease_token and lease_expires_at>p_now;
  return found;
end;$$;
create function public.fail_background_job(p_id uuid,p_lease_token uuid,p_error text,p_retry_after_seconds integer default null,p_now timestamptz default clock_timestamp()) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.background_jobs set status=case when attempts>=max_attempts then 'dead' else 'pending' end,
    available_at=p_now+make_interval(secs=>greatest(least(604800,coalesce(p_retry_after_seconds,0)),least(3600,30*power(2,attempts-1))::integer)),
    last_error=left(coalesce(p_error,'Worker failure'),500),lease_owner=null,lease_token=null,lease_expires_at=null
    where id=p_id and status='leased' and lease_token=p_lease_token and lease_expires_at>p_now;
  return found;
end;$$;

alter table public.order_notifications add column available_at timestamptz not null default now(),
  add column lease_owner text,add column lease_token uuid,add column lease_expires_at timestamptz,
  add column attempts integer not null default 0,add column first_attempt_at timestamptz,add column dead_at timestamptz,add column last_error text;
create index order_notifications_due_idx on public.order_notifications(available_at) where delivered_at is null and superseded_at is null and dead_at is null;
create function public.claim_catering_notifications(p_worker text,p_limit integer default 20,p_lease_seconds integer default 60,p_now timestamptz default clock_timestamp(),p_order_id uuid default null)
returns setof public.order_notifications language plpgsql security invoker set search_path='' as $$
begin
  if length(trim(coalesce(p_worker,''))) not between 1 and 100 or p_limit not between 1 and 100 or p_lease_seconds not between 5 and 900 then raise exception 'Invalid worker lease';end if;
  update public.order_notifications set dead_at=p_now,lease_owner=null,lease_token=null,lease_expires_at=null,last_error='Lease expired after retry limit'
    where delivered_at is null and superseded_at is null and dead_at is null and lease_expires_at<=p_now and attempts>=8;
  return query with due as (select event_key from public.order_notifications where delivered_at is null and superseded_at is null and dead_at is null
    and (p_order_id is null or order_id=p_order_id) and available_at<=p_now and (lease_expires_at is null or lease_expires_at<=p_now) and attempts<8
    order by created_at,event_key for update skip locked limit p_limit)
  update public.order_notifications n set lease_owner=p_worker,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,p_now)
    from due where n.event_key=due.event_key returning n.*;
end;$$;

create function public.finish_payment_reconciliation_job(p_id uuid,p_lease_token uuid,p_reason text,p_manual_review boolean,p_next_check_at timestamptz,p_now timestamptz default clock_timestamp())
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.background_jobs%rowtype;
begin
  select * into j from public.background_jobs where id=p_id and lease_token=p_lease_token and status='leased' and lease_expires_at>p_now and kind='reconciliation' for update;
  if not found then return false;end if;
  perform public.record_payment_reconciliation((j.payload->>'attempt_id')::uuid,p_reason,p_manual_review,p_next_check_at);
  return public.complete_background_job(j.id,p_lease_token,p_now);
end;$$;
-- Partial delivery is saved under the same fence before a later retry. Delivery
-- identifiers stay stable, but a process dying after an external send can repeat it.
create function public.complete_catering_notification(p_event_key text,p_lease_token uuid,p_customer_delivered boolean,p_owner_delivered boolean,p_superseded boolean default false,p_now timestamptz default clock_timestamp())
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.order_notifications set
    customer_delivered_at=case when p_customer_delivered then coalesce(customer_delivered_at,p_now) else customer_delivered_at end,
    owner_delivered_at=case when p_owner_delivered then coalesce(owner_delivered_at,p_now) else owner_delivered_at end,
    delivered_at=case when (customer_delivered_at is not null or p_customer_delivered) and (owner_delivered_at is not null or p_owner_delivered) and not p_superseded then p_now else delivered_at end,
    superseded_at=case when p_superseded then p_now else superseded_at end,
    lease_owner=case when p_superseded or (customer_delivered_at is not null or p_customer_delivered) and (owner_delivered_at is not null or p_owner_delivered) then null else lease_owner end,
    lease_token=case when p_superseded or (customer_delivered_at is not null or p_customer_delivered) and (owner_delivered_at is not null or p_owner_delivered) then null else lease_token end,
    lease_expires_at=case when p_superseded or (customer_delivered_at is not null or p_customer_delivered) and (owner_delivered_at is not null or p_owner_delivered) then null else lease_expires_at end
    where event_key=p_event_key and lease_token=p_lease_token and lease_expires_at>p_now and dead_at is null and delivered_at is null and superseded_at is null;
  return found;
end;$$;
create function public.fail_catering_notification(p_event_key text,p_lease_token uuid,p_error text,p_retry_after_seconds integer default null,p_now timestamptz default clock_timestamp())
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.order_notifications set available_at=p_now+make_interval(secs=>greatest(least(604800,coalesce(p_retry_after_seconds,0)),least(3600,30*power(2,attempts-1))::integer)),
    dead_at=case when attempts>=8 or first_attempt_at<=p_now-interval '23 hours' then p_now else null end,last_error=left(coalesce(p_error,'Delivery failure'),500),lease_owner=null,lease_token=null,lease_expires_at=null
    where event_key=p_event_key and lease_token=p_lease_token and lease_expires_at>p_now and delivered_at is null and superseded_at is null;
  return found;
end;$$;

alter table public.direct_order_settings add column reminder_minutes integer not null default 2 check(reminder_minutes between 1 and 120),
  add column escalation_minutes integer not null default 5 check(escalation_minutes between 1 and 240),
  add column preparation_reminder_minutes integer not null default 30 check(preparation_reminder_minutes between 1 and 1440),
  add column job_health_required boolean not null default false,
  add column job_health_max_age_seconds integer not null default 180 check(job_health_max_age_seconds between 60 and 3600),
  add column notification_reception_available boolean not null default false,
  add column notification_backup_approved boolean not null default false,
  add column pause_reason text;
alter table public.order_notifications drop constraint order_notifications_kind_check;
alter table public.order_notifications add constraint order_notifications_kind_check check(kind in
  ('new','reviewing','approved','changes_requested','rejected','preparing','ready','dispatched','completed','cancelled','payment_available','paid','refunded','failed','payment_review','payment_request','kitchen_reminder','kitchen_escalation','preparation_reminder'));

create or replace function public.run_kitchen_watchdog(p_now timestamptz default clock_timestamp()) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.direct_order_settings%rowtype;o public.orders%rowtype;k text;alerts jsonb:='[]';n integer:=0;
begin
  select * into strict s from public.direct_order_settings where id=1 for update;
  if s.watchdog_enabled then
    for o in select * from public.orders where capacity_status='confirmed' and status in ('approved','preparing') and confirmed_at is not null
      and (acknowledged_at is null and confirmed_at<=p_now-make_interval(mins=>s.reminder_minutes)
        or preparation_starts_at between p_now and p_now+make_interval(mins=>s.preparation_reminder_minutes)) order by confirmed_at,id limit 100 loop
      for k in select kind from (values
        ('kitchen_reminder',o.acknowledged_at is null and o.confirmed_at<=p_now-make_interval(mins=>s.reminder_minutes)),
        ('kitchen_escalation',o.acknowledged_at is null and o.confirmed_at<=p_now-make_interval(mins=>s.escalation_minutes)),
        ('preparation_reminder',o.preparation_starts_at between p_now and p_now+make_interval(mins=>s.preparation_reminder_minutes))) v(kind,due) where due loop
        insert into public.order_notifications(event_key,order_id,kind,payload,customer_delivered_at,created_at,available_at)
          values(o.id::text||':'||k||':'||coalesce(case when k='preparation_reminder' then o.preparation_starts_at else o.confirmed_at end::text,''),o.id,k,
            jsonb_build_object('id',o.id,'code',o.code,'status',o.status,'scheduled_at',o.scheduled_at,'preparation_starts_at',o.preparation_starts_at,'alert_kind',k,'backup_requested',k='kitchen_escalation' and s.notification_backup_approved),p_now,p_now,p_now) on conflict do nothing;
        if found then n:=n+1;end if;
      end loop;
      if o.acknowledged_at is null and o.confirmed_at<=p_now-make_interval(mins=>s.acknowledgement_minutes) then
        alerts:=alerts||jsonb_build_array(jsonb_build_object('id',o.id,'code',o.code,'confirmed_at',o.confirmed_at));
      end if;
    end loop;
    if s.auto_pause_unacknowledged and jsonb_array_length(alerts)>0 then
      update public.direct_order_settings set paused=true,pause_reason='unacknowledged_kitchen_order' where id=1;s.paused:=true;
    end if;
  end if;
  return jsonb_build_object('paused',s.paused,'alerts',alerts,'queued',n);
end;$$;

create function public.enqueue_background_maintenance(p_now timestamptz default clock_timestamp()) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer:=0;added integer;a public.payment_attempts%rowtype;
begin
  insert into public.background_jobs(kind,dedupe_key,available_at) values
    ('kitchen_watchdog','watchdog:'||date_trunc('minute',p_now)::text,p_now),('release_capacity','release:'||date_trunc('minute',p_now)::text,p_now) on conflict do nothing;
  get diagnostics added=row_count;n:=n+added;
  for a in select * from public.payment_attempts where reconciliation_next_check_at<=p_now
    and (status in ('creating','pending','expired') or reconciliation_manual_review or exists(select 1 from public.payment_refunds r where r.attempt_id=payment_attempts.id and r.status in ('creating','pending','needs_review')))
    order by reconciliation_next_check_at,id limit 20 loop
    insert into public.background_jobs(kind,payload,dedupe_key,available_at) values('reconciliation',jsonb_build_object('attempt_id',a.id),
      'reconcile:'||a.id::text||':'||a.reconciliation_next_check_at::text,p_now) on conflict do nothing;
    if found then n:=n+1;end if;
  end loop;
  return n;
end;$$;

create function public.record_payment_reconciliation(p_attempt_id uuid,p_reason text,p_manual_review boolean default true,p_next_check_at timestamptz default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.payment_attempts%rowtype;
begin
  perform 1 from public.direct_order_settings where id=1 for update;
  select * into a from public.payment_attempts where id=p_attempt_id;
  if not found then return false;end if;
  perform 1 from public.orders where id=a.order_id for update;
  update public.payment_attempts set reconciliation_checked_at=clock_timestamp(),reconciliation_next_check_at=coalesce(p_next_check_at,clock_timestamp()+interval '1 hour'),
    reconciliation_reason=left(p_reason,200),reconciliation_manual_review=p_manual_review where id=a.id;
  -- No inferred payment status, retry charge or capacity release. Preserve any
  -- stronger existing chargeback/refund/capacity quarantine reason.
  if p_manual_review then
    update public.orders set payment_review_required=true,payment_review_reason=coalesce(payment_review_reason,'reconciliation_required'),checkout_url=null
      where id=a.order_id and payment_status not in ('paid','refunded');
    perform public.queue_catering_notification(a.order_id,'payment_review');
  end if;
  return true;
end;$$;

create function public.execute_database_job(p_id uuid,p_lease_token uuid,p_now timestamptz default clock_timestamp()) returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.background_jobs%rowtype;e public.payment_event_inbox%rowtype;
begin
  select * into j from public.background_jobs where id=p_id and lease_token=p_lease_token and status='leased' and lease_expires_at>p_now for update;
  if not found then return false;end if;
  if j.kind='payment_event' then
    select * into strict e from public.payment_event_inbox where job_id=j.id for update;
    if e.processed_at is null then
      perform public.apply_catering_payment_event(e.payload);
      update public.payment_event_inbox set processed_at=p_now where provider=e.provider and event_id=e.event_id;
      update public.payment_attempts set last_verified_event_at=p_now where id=e.attempt_id;
    end if;
  elsif j.kind='kitchen_watchdog' then perform public.run_kitchen_watchdog(p_now);
  elsif j.kind='release_capacity' then perform public.release_expired_capacity_holds();
  else raise exception 'Job requires a provider reconciliation handler';end if;
  return public.complete_background_job(j.id,p_lease_token,p_now);
end;$$;

create function public.background_job_health(p_now timestamptz default clock_timestamp()) returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object(
    'last_watchdog_success_at',(select max(completed_at) from public.background_jobs where kind='kitchen_watchdog' and status='completed'),
    'pending_jobs',(select count(*) from public.background_jobs where status in ('pending','leased')),
    'oldest_pending_at',(select min(created_at) from public.background_jobs where status in ('pending','leased')),
    'dead_jobs',(select count(*) from public.background_jobs where status='dead'),
    'pending_notifications',(select count(*) from public.order_notifications where delivered_at is null and superseded_at is null and dead_at is null),
    'oldest_notification_at',(select min(created_at) from public.order_notifications where delivered_at is null and superseded_at is null and dead_at is null),
    'dead_notifications',(select count(*) from public.order_notifications where dead_at is not null),
    'health_required',s.job_health_required,'reception_available',s.notification_reception_available,
    'healthy',s.notification_reception_available and exists(select 1 from public.background_jobs where kind='kitchen_watchdog' and status='completed' and completed_at>=p_now-make_interval(secs=>s.job_health_max_age_seconds))
      and not exists(select 1 from public.order_notifications where delivered_at is null and superseded_at is null and owner_delivered_at is null
        and (dead_at is not null or created_at<p_now-make_interval(secs=>s.job_health_max_age_seconds))),
    'paused',s.paused,'pause_reason',s.pause_reason) from public.direct_order_settings s where id=1;
$$;
-- Gating happens on the same settings lock as capacity reservation. Existing
-- requests and verified old payments continue even while new orders are paused.
alter function public.get_direct_availability(jsonb,timestamptz) rename to get_direct_availability_before_jobs_v441;
create function public.get_direct_availability(p_input jsonb,p_now timestamptz default clock_timestamp()) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;health jsonb;
begin
  health:=public.background_job_health(p_now);
  if (health->>'health_required')::boolean and not (health->>'healthy')::boolean then
    return jsonb_build_object('enabled',false,'reason','Köket är tillfälligt pausat medan mottagningen kontrolleras.','slots','[]'::jsonb);
  end if;
  result:=public.get_direct_availability_before_jobs_v441(p_input,p_now);return result;
end;$$;

-- Explicit ACLs: no job or financial inbox function is a public RPC.
revoke all on function public.reserve_catering_payment(uuid,text,text,integer,integer,text,text),public.reserve_catering_refund(uuid,text,text),
  public.enqueue_catering_payment_events(jsonb),public.claim_background_jobs(text,integer,integer,timestamptz),
  public.complete_background_job(uuid,uuid,timestamptz),public.fail_background_job(uuid,uuid,text,integer,timestamptz),
  public.claim_catering_notifications(text,integer,integer,timestamptz,uuid),public.complete_catering_notification(text,uuid,boolean,boolean,boolean,timestamptz),
  public.fail_catering_notification(text,uuid,text,integer,timestamptz),public.enqueue_background_maintenance(timestamptz),
  public.record_payment_reconciliation(uuid,text,boolean,timestamptz),public.execute_database_job(uuid,uuid,timestamptz),
  public.background_job_health(timestamptz),public.get_direct_availability(jsonb,timestamptz),
  public.finish_payment_reconciliation_job(uuid,uuid,text,boolean,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_catering_payment(uuid,text,text,integer,integer,text,text),public.reserve_catering_refund(uuid,text,text),
  public.enqueue_catering_payment_events(jsonb),public.claim_background_jobs(text,integer,integer,timestamptz),
  public.complete_background_job(uuid,uuid,timestamptz),public.fail_background_job(uuid,uuid,text,integer,timestamptz),
  public.claim_catering_notifications(text,integer,integer,timestamptz,uuid),public.complete_catering_notification(text,uuid,boolean,boolean,boolean,timestamptz),
  public.fail_catering_notification(text,uuid,text,integer,timestamptz),public.enqueue_background_maintenance(timestamptz),
  public.record_payment_reconciliation(uuid,text,boolean,timestamptz),public.execute_database_job(uuid,uuid,timestamptz),
  public.background_job_health(timestamptz),public.get_direct_availability(jsonb,timestamptz),
  public.finish_payment_reconciliation_job(uuid,uuid,text,boolean,timestamptz,timestamptz) to service_role;

-- Disabling NEW sessions in the registry must not disable evidence for attempts
-- already made. All original amount/revision/provider/quarantine checks remain.
do $$declare definition text;old_guard text;begin
  select pg_get_functiondef('public.apply_catering_payment_event_financial_v43(jsonb)'::regprocedure) into definition;
  old_guard:='where provider=p_event->>''provider'' and environment=p_event->>''environment'' and active)';
  if position(old_guard in definition)=0 then raise exception 'Unexpected financial provider guard';end if;
  execute replace(definition,old_guard,'where provider=p_event->>''provider'' and environment=p_event->>''environment'')');
end;$$;
