-- ============================================================================
-- SAFARI PACKAGES — cloud sync so CMS edits reach the public website
-- ============================================================================
-- EXTENDS public.packages (created in schema.sql). Nothing dropped, no rows
-- deleted. The public site currently renders a static array; after this
-- migration the database becomes the single source of truth.
--
-- Also adds soft-delete columns to guides / vehicles / customers so CMS
-- deletion never destroys historical bookings or invoices.
--
-- Idempotent: safe to run repeatedly.
-- ============================================================================

-- ---------- 1. Packages: columns the CMS edits ----------
alter table public.packages add column if not exists nights integer not null default 0;
alter table public.packages add column if not exists discount integer;
alter table public.packages add column if not exists gallery jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists description text not null default '';
alter table public.packages add column if not exists signature text not null default '';
alter table public.packages add column if not exists highlights jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists availability jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists country jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists parks jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists wildlife jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists difficulty text not null default 'Moderate';
alter table public.packages add column if not exists tags jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists featured boolean not null default false;
alter table public.packages add column if not exists archived boolean not null default false;
alter table public.packages add column if not exists coordinates jsonb not null default '[0,0]'::jsonb;
alter table public.packages add column if not exists seo_title text;
alter table public.packages add column if not exists seo_description text;
alter table public.packages add column if not exists publish_date timestamptz;
alter table public.packages add column if not exists created_at timestamptz not null default now();

alter table public.packages drop constraint if exists packages_difficulty_check;
alter table public.packages
  add constraint packages_difficulty_check
  check (difficulty in ('Gentle', 'Moderate', 'Active', 'Expedition'));

create index if not exists packages_published_idx on public.packages(published) where archived = false;
create index if not exists packages_slug_idx on public.packages(slug);

create or replace function public.packages_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists packages_touch_trigger on public.packages;
create trigger packages_touch_trigger
  before update on public.packages
  for each row execute function public.packages_touch();

-- Public read must NOT call a helper function: if is_staff() were missing the
-- whole SELECT fails for anonymous visitors and the site shows no packages.
alter table public.packages enable row level security;
drop policy if exists "Public can read published packages" on public.packages;
drop policy if exists "Staff can manage packages" on public.packages;
drop policy if exists "Anyone can read published packages" on public.packages;
drop policy if exists "Staff can read every package" on public.packages;

create policy "Anyone can read published packages" on public.packages
  for select using (published = true and archived = false);

create policy "Staff can read every package" on public.packages
  for select to authenticated using (public.is_staff());

create policy "Staff can manage packages" on public.packages
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select on public.packages to anon, authenticated;
grant insert, update, delete on public.packages to authenticated;

-- ---------- 2. Destinations table (frontend currently uses static data) ----------
create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country text not null,
  coordinates jsonb not null default '[0,0]'::jsonb,
  best_time text,
  animal text,
  image text not null default '',
  gallery jsonb not null default '[]'::jsonb,
  description text not null default '',
  long_description text not null default '',
  activities jsonb not null default '[]'::jsonb,
  featured boolean not null default false,
  published boolean not null default true,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.destinations enable row level security;
drop policy if exists "Anyone can read published destinations" on public.destinations;
drop policy if exists "Staff can manage destinations" on public.destinations;

create policy "Anyone can read published destinations" on public.destinations
  for select using (published = true);

create policy "Staff can manage destinations" on public.destinations
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select on public.destinations to anon, authenticated;
grant insert, update, delete on public.destinations to authenticated;

-- ---------- 3. Soft delete for guides / vehicles / customers ----------
-- Historical bookings and invoices reference these rows. Deleting them
-- outright would orphan or destroy business records, so the CMS archives
-- instead and the public site simply stops showing archived entries.

alter table public.guides add column if not exists archived boolean not null default false;
alter table public.guides add column if not exists archived_at timestamptz;
alter table public.guides add column if not exists archived_by uuid;

alter table public.vehicles add column if not exists archived boolean not null default false;
alter table public.vehicles add column if not exists archived_at timestamptz;
alter table public.vehicles add column if not exists archived_by uuid;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  country text,
  avatar text,
  notes text,
  tags jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_email_key on public.customers (lower(email));

alter table public.customers enable row level security;
drop policy if exists "Staff can manage customers" on public.customers;
create policy "Staff can manage customers" on public.customers
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.customers to authenticated;

-- Guides are shown publicly; archived ones disappear from the website.
drop policy if exists "Public can read active guides" on public.guides;
drop policy if exists "Anyone can read active guides" on public.guides;
create policy "Anyone can read active guides" on public.guides
  for select using (active = true and archived = false);

-- ---------- 4. Realtime ----------
do $$
declare
  t text;
begin
  foreach t in array array['packages', 'destinations', 'guides', 'vehicles', 'customers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verification:
--   select slug, title, price_usd, published, archived from public.packages;
--   set role anon; select slug, price_usd from public.packages; reset role;
--   -- anon must see published, non-archived rows only
-- ---------------------------------------------------------------------------
