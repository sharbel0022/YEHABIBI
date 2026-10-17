-- V2: Bygg eget, prissatta rätter och en tidsstyrd kampanj.
-- Kör EFTER 0001. Behåll den gamla orderhistoriken oförändrad.
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null check (category in ('kalla_meze','varma_meze','grill','vegetariskt','brod_saser','dessert')),
  unit_label text not null default 'styck',
  unit_price_ore integer not null check (unit_price_ore >= 0 and unit_price_ore <= 1000000),
  suggested_per_person numeric(5,2) not null default 0 check (suggested_per_person between 0 and 20),
  allergens text[] not null default '{}',
  image_url text,
  active boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Snapshoten gör att ett prisbyte aldrig ändrar gamla beställningar.
alter table public.orders add column if not exists items_snapshot jsonb not null default '[]'::jsonb;
alter table public.orders add constraint orders_items_snapshot_array check (jsonb_typeof(items_snapshot) = 'array');

alter table public.business_settings
  add column if not exists custom_min_people integer not null default 5 check (custom_min_people between 1 and 100),
  add column if not exists delivery_zones jsonb not null default '[]'::jsonb,
  add column if not exists campaign_title text not null default '',
  add column if not exists campaign_description text not null default '',
  add column if not exists campaign_image_url text,
  add column if not exists campaign_start_date date,
  add column if not exists campaign_end_date date,
  add column if not exists campaign_enabled boolean not null default false;

alter table public.menu_items enable row level security;
revoke all on public.menu_items from anon, authenticated;
grant select, insert, update, delete on public.menu_items to service_role;

-- Ingen direkt klientåtkomst till kundbeställningar eller rätter.
-- Admin använder service_role enbart i serverns behörighetskontrollerade API.
