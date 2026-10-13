-- Cedar Mezze v1: Run in the catering business's Supabase SQL editor.
-- All customer and admin data is server-only; NO public RLS policies for orders.
create extension if not exists pgcrypto;

create table if not exists public.business_settings (
  id smallint primary key default 1 check (id = 1),
  brand_name text not null default 'Cedar Mezze',
  tagline text not null default 'Mer än mat – en del av vår kultur.',
  description text not null default 'Äkta libanesisk catering',
  service_area text not null default 'Västerås med omnejd',
  location_city text not null default 'Västerås',
  contact_email text not null default '', contact_phone text not null default '',
  hero_video_url text, hero_poster_url text default '/images/hero.webp',
  google_review_url text, google_maps_url text,
  instagram_url text, facebook_url text, tiktok_url text,
  pickup_address text not null default '',
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  cash_enabled boolean not null default true,
  delivery_fee_ore integer not null default 0 check(delivery_fee_ore >= 0),
  min_advance_days integer not null default 2 check(min_advance_days between 0 and 90),
  updated_at timestamptz not null default now()
);
insert into public.business_settings(id) values(1) on conflict (id) do nothing;

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, title text not null, description text not null default '',
  included text[] not null default '{}', allergens text[] not null default '{}',
  price_ore integer not null check(price_ore >= 0),
  min_people integer not null default 10 check(min_people between 1 and 1000),
  image_url text, active boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, tracking_hash text not null,
  menu_id uuid references public.menus(id) on delete restrict,
  menu_title text not null, price_per_person_ore integer not null,
  guests integer not null check(guests between 1 and 1000),
  occasion text not null check (occasion in ('hemma','fest','foretag')),
  event_date date not null, event_time text not null,
  fulfillment text not null check(fulfillment in ('delivery','pickup')),
  address text not null default '', postal_code text not null default '', city text not null default '',
  full_name text not null, email text not null, phone text not null, notes text not null default '',
  subtotal_ore integer not null, delivery_fee_ore integer not null default 0, total_ore integer not null,
  payment_preference text not null check(payment_preference in ('swish','card','apple_pay','cash')),
  payment_status text not null default 'unpaid' check(payment_status in ('unpaid','pending','paid','refunded','failed')),
  status text not null default 'new' check(status in ('new','changes_requested','approved','rejected','ready','completed','cancelled')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  checkout_url text,
  admin_note text,
  terms_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists orders_payment_intent_idx on public.orders(stripe_payment_intent_id);
create index if not exists orders_tracking_idx on public.orders(code, tracking_hash);

create table if not exists public.order_rate_limits (
  key_hash text not null,
  bucket_start timestamptz not null,
  hits integer not null default 0,
  primary key(key_hash,bucket_start)
);
create table if not exists public.payment_events (
  event_id text primary key,
  event_type text not null,
  order_id uuid not null references public.orders(id),
  created_at timestamptz not null default now()
);

create or replace function public.consume_order_limit(p_key_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if length(p_key_hash) <> 64 then return false; end if;
  insert into public.order_rate_limits(key_hash,bucket_start,hits)
  values(p_key_hash,date_trunc('hour',now()),1)
  on conflict(key_hash,bucket_start) do update set hits=public.order_rate_limits.hits+1
  returning hits into n;
  return n <= 5;
end; $$;

-- Atomic/idempotent reconciliation: event-id and order payment status commit together.
create or replace function public.apply_stripe_event(
  p_event_id text, p_event_type text, p_order_id uuid,
  p_session_id text, p_payment_intent text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare inserted integer;
begin
  if p_event_type not in ('paid','failed','refunded') then return false; end if;
  if not exists (select 1 from public.orders where id=p_order_id and
    (stripe_checkout_session_id=p_session_id or stripe_payment_intent_id=p_payment_intent)) then
    raise exception 'Stripe event does not match an existing order';
  end if;
  insert into public.payment_events(event_id,event_type,order_id)
  values(p_event_id,p_event_type,p_order_id) on conflict(event_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted=0 then return false; end if;
  if p_event_type='paid' then
    update public.orders set payment_status='paid',
      stripe_payment_intent_id=coalesce(p_payment_intent,stripe_payment_intent_id),updated_at=now()
      where id=p_order_id and payment_status not in ('paid','refunded');
  elsif p_event_type='refunded' then
    update public.orders set payment_status='refunded',updated_at=now() where id=p_order_id;
  elsif p_event_type='failed' then
    update public.orders set payment_status='failed',updated_at=now()
      where id=p_order_id and payment_status not in ('paid','refunded');
  end if;
  return true;
end; $$;

alter table public.business_settings enable row level security;
alter table public.menus enable row level security;
alter table public.orders enable row level security;
alter table public.order_rate_limits enable row level security;
alter table public.payment_events enable row level security;
-- No access granted to anon/authenticated: all DB calls live in protected server routes.
revoke all on public.business_settings,public.menus,public.orders,public.order_rate_limits,public.payment_events from anon,authenticated;
revoke all on function public.consume_order_limit(text) from public,anon,authenticated;
revoke all on function public.apply_stripe_event(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.consume_order_limit(text) to service_role;
grant execute on function public.apply_stripe_event(text,text,uuid,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('catering-media','catering-media',true,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict(id) do nothing;
-- Storage upload only through verified server-side admin; public images/video can be read by anyone.
create policy "Catering public media read" on storage.objects for select to anon using (bucket_id='catering-media');
