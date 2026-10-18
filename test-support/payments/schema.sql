-- Installed ONLY by the private local launcher, after the unchanged production migration chain.
create table public.test_environment_guard (
  id boolean primary key default true check(id), isolation_id uuid not null,
  secret_hash text not null check(secret_hash ~ '^[a-f0-9]{64}$')
);
create table public.test_payment_sessions (
  id text primary key, attempt_id uuid not null unique references public.payment_attempts(id),
  reference text not null, amount_ore integer not null check(amount_ore>0), currency text not null check(currency='SEK'),
  method text not null, return_url text not null, checkout_url text not null,
  status text not null default 'active' check(status in ('active','completed','expired')),
  last_outcome text check(last_outcome in ('success','decline','cancel','expire','delay')),
  delayed_event_id text,
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table public.test_payment_deliveries (
  event_id text primary key, session_id text not null references public.test_payment_sessions(id),
  payload jsonb not null, delivered_at timestamptz, created_at timestamptz not null default now()
);
alter table public.test_environment_guard enable row level security;
alter table public.test_payment_sessions enable row level security;
alter table public.test_payment_deliveries enable row level security;
revoke all on public.test_environment_guard,public.test_payment_sessions,public.test_payment_deliveries from public,anon,authenticated;
grant select,insert,update on public.test_environment_guard,public.test_payment_sessions,public.test_payment_deliveries to service_role;

-- Serialize simulator outcomes before delivery. A browser never writes an order payment status.
create function public.test_prepare_payment_delivery(p_session_id text,p_action text,p_event_id text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.test_payment_sessions%rowtype; saved jsonb;
begin
  select * into s from public.test_payment_sessions where id=p_session_id for update;
  if not found or p_action not in ('success','decline','cancel','expire','refund','delay') then raise exception 'Invalid test session'; end if;
  if s.status='completed' and p_action not in ('success','refund','delay') then raise exception 'Test payment already completed'; end if;
  if p_action='refund' and s.status<>'completed' then raise exception 'Test payment not completed'; end if;
  insert into public.test_payment_deliveries(event_id,session_id,payload) values(p_event_id,s.id,p_payload) on conflict do nothing;
  select payload into strict saved from public.test_payment_deliveries where event_id=p_event_id;
  if p_action<>'refund' then
    update public.test_payment_sessions set status=case when p_action in ('success','delay') then 'completed' when p_action='expire' then 'expired' else 'active' end,
      last_outcome=p_action,delayed_event_id=case when p_action='delay' then p_event_id else delayed_event_id end where id=s.id;
  end if;
  return saved;
end; $$;
revoke all on function public.test_prepare_payment_delivery(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.test_prepare_payment_delivery(text,text,text,jsonb) to service_role;
