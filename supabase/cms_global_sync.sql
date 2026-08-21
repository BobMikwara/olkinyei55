-- ============================================================================
-- OLIKNYEI CMS GLOBAL SYNC
-- ============================================================================
-- PURPOSE
-- ============================================================================
-- Make Supabase the SINGLE SOURCE OF TRUTH for all CMS-managed collections.
--
-- CMS collections covered:
--   1. destinations
--   2. guides
--   3. vehicles
--   4. customers
--   5. media_assets
--
-- This migration:
--   * Adds required CMS columns.
--   * Creates required unique indexes.
--   * Cleans duplicate unique values before indexes are created.
--   * Enables RLS.
--   * Allows public users to read public content.
--   * Allows staff to manage CMS content.
--   * Enables Supabase Realtime.
--   * Adds automatic updated_at timestamps.
--   * Seeds demo records.
--   * Uses ON CONFLICT DO NOTHING everywhere.
--
-- IMPORTANT:
--   Run AFTER:
--     schema.sql
--     packages_sync.sql
--
-- IMPORTANT:
--   This migration does NOT drop CMS tables.
--   Existing records are preserved except duplicate records that prevent
--   required unique indexes from being created.
-- ============================================================================


-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================

create extension if not exists pgcrypto;


-- ============================================================================
-- 1. DESTINATIONS
-- ============================================================================

alter table public.destinations
  add column if not exists slug text;

alter table public.destinations
  add column if not exists name text not null default '';

alter table public.destinations
  add column if not exists country text not null default 'Tanzania';

alter table public.destinations
  add column if not exists coordinates jsonb not null default '[]'::jsonb;

alter table public.destinations
  add column if not exists best_time text not null default '';

alter table public.destinations
  add column if not exists animal text not null default '';

alter table public.destinations
  add column if not exists image text;

alter table public.destinations
  add column if not exists gallery jsonb not null default '[]'::jsonb;

alter table public.destinations
  add column if not exists description text not null default '';

alter table public.destinations
  add column if not exists long_description text not null default '';

alter table public.destinations
  add column if not exists activities jsonb not null default '[]'::jsonb;

alter table public.destinations
  add column if not exists featured boolean not null default false;

alter table public.destinations
  add column if not exists published boolean not null default true;

alter table public.destinations
  add column if not exists seo_title text;

alter table public.destinations
  add column if not exists seo_description text;

alter table public.destinations
  add column if not exists created_at timestamptz not null default now();

alter table public.destinations
  add column if not exists updated_at timestamptz not null default now();


-- Generate slugs for existing records.
update public.destinations
set slug = lower(
  regexp_replace(
    trim(name),
    '[^a-zA-Z0-9]+',
    '-',
    'g'
  )
)
where slug is null
   or trim(slug) = '';


-- Remove trailing hyphens.
update public.destinations
set slug = regexp_replace(slug, '-+$', '')
where slug is not null;


-- Remove duplicate destination slugs.
-- The oldest/smallest id is retained.
delete from public.destinations d
where d.id is not null
  and exists (
    select 1
    from public.destinations d2
    where d2.slug = d.slug
      and d2.id < d.id
  );


-- Normal UNIQUE index.
create unique index if not exists destinations_slug_key
on public.destinations (slug);


-- ============================================================================
-- 2. GUIDES
-- ============================================================================

alter table public.guides
  add column if not exists slug text;

alter table public.guides
  add column if not exists name text not null default '';

alter table public.guides
  add column if not exists title text not null default '';

alter table public.guides
  add column if not exists speciality text not null default '';

alter table public.guides
  add column if not exists bio text not null default '';

alter table public.guides
  add column if not exists portrait_url text;

alter table public.guides
  add column if not exists gallery jsonb not null default '[]'::jsonb;

alter table public.guides
  add column if not exists languages jsonb not null default '[]'::jsonb;

alter table public.guides
  add column if not exists years_in_field integer not null default 0;

alter table public.guides
  add column if not exists locations jsonb not null default '[]'::jsonb;

alter table public.guides
  add column if not exists rating numeric(3,2) not null default 5.0;

alter table public.guides
  add column if not exists assignments integer not null default 0;

alter table public.guides
  add column if not exists availability jsonb not null default '{}'::jsonb;

alter table public.guides
  add column if not exists active boolean not null default true;

alter table public.guides
  add column if not exists email text;

alter table public.guides
  add column if not exists phone text;

alter table public.guides
  add column if not exists created_at timestamptz not null default now();

alter table public.guides
  add column if not exists updated_at timestamptz not null default now();


-- Generate missing slugs.
update public.guides
set slug = lower(
  regexp_replace(
    trim(
      case
        when nullif(name, '') is not null then name
        when nullif(title, '') is not null then title
        else 'guide'
      end
    ),
    '[^a-zA-Z0-9]+',
    '-',
    'g'
  )
)
where slug is null
   or trim(slug) = '';


update public.guides
set slug = regexp_replace(slug, '-+$', '')
where slug is not null;


-- Remove the previous partial index if it exists.
drop index if exists public.guides_slug_key;


-- Remove duplicate guide slugs.
delete from public.guides g
where g.id is not null
  and exists (
    select 1
    from public.guides g2
    where g2.slug = g.slug
      and g2.id < g.id
  );


-- Normal UNIQUE index.
create unique index if not exists guides_slug_key
on public.guides (slug);


-- ============================================================================
-- 3. VEHICLES
-- ============================================================================

alter table public.vehicles
  add column if not exists fleet_code text;

alter table public.vehicles
  add column if not exists model text not null default '';

alter table public.vehicles
  add column if not exists type text not null default 'Land Cruiser';

alter table public.vehicles
  add column if not exists base text not null default 'Arusha';

alter table public.vehicles
  add column if not exists capacity integer not null default 6;

alter table public.vehicles
  add column if not exists status text not null default 'Ready';

alter table public.vehicles
  add column if not exists image text;

alter table public.vehicles
  add column if not exists driver_id uuid;

alter table public.vehicles
  add column if not exists last_service date;

alter table public.vehicles
  add column if not exists next_service date;

alter table public.vehicles
  add column if not exists insurance text;

alter table public.vehicles
  add column if not exists mileage integer not null default 0;

alter table public.vehicles
  add column if not exists notes text not null default '';

alter table public.vehicles
  add column if not exists created_at timestamptz not null default now();

alter table public.vehicles
  add column if not exists updated_at timestamptz not null default now();


-- Generate fleet codes for vehicles that do not have one.
with numbered as (
  select
    id,
    row_number() over (order by id) as rn
  from public.vehicles
  where fleet_code is null
     or trim(fleet_code) = ''
)
update public.vehicles v
set fleet_code = 'OLK-' || lpad(numbered.rn::text, 2, '0')
from numbered
where v.id = numbered.id;


-- Remove duplicate fleet codes.
delete from public.vehicles v
where v.id is not null
  and exists (
    select 1
    from public.vehicles v2
    where v2.fleet_code = v.fleet_code
      and v2.id < v.id
  );


-- Normal UNIQUE index.
create unique index if not exists vehicles_fleet_code_key
on public.vehicles (fleet_code);


-- ============================================================================
-- 4. CUSTOMERS
-- ============================================================================

alter table public.customers
  add column if not exists name text not null default '';

alter table public.customers
  add column if not exists email text;

alter table public.customers
  add column if not exists phone text;

alter table public.customers
  add column if not exists country text;

alter table public.customers
  add column if not exists avatar text;

alter table public.customers
  add column if not exists notes text not null default '';

alter table public.customers
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table public.customers
  add column if not exists total_bookings integer not null default 0;

alter table public.customers
  add column if not exists total_spent integer not null default 0;

alter table public.customers
  add column if not exists lifetime_value text not null default 'New';

alter table public.customers
  add column if not exists first_trip date;

alter table public.customers
  add column if not exists last_trip date;

alter table public.customers
  add column if not exists wishlist jsonb not null default '[]'::jsonb;

alter table public.customers
  add column if not exists created_at timestamptz not null default now();

alter table public.customers
  add column if not exists updated_at timestamptz not null default now();


-- Empty email values become NULL.
update public.customers
set email = null
where email is not null
  and trim(email) = '';


-- Remove duplicate emails.
delete from public.customers c
where c.id is not null
  and c.email is not null
  and exists (
    select 1
    from public.customers c2
    where c2.id < c.id
      and c2.email is not null
      and lower(trim(c2.email)) = lower(trim(c.email))
  );


-- Remove any previous expression index.
drop index if exists public.customers_email_key;


-- Unique email index.
create unique index if not exists customers_email_key
on public.customers (lower(trim(email)));


-- ============================================================================
-- 5. MEDIA ASSETS
-- ============================================================================

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),

  url text not null,

  thumbnail text,

  type text not null default 'image'
    check (
      type in (
        'image',
        'video',
        'pdf',
        'document'
      )
    ),

  name text not null,

  alt text not null default '',

  category text not null default 'Uncategorized',

  tags jsonb not null default '[]'::jsonb,

  size bigint not null default 0,

  dimensions jsonb,

  duration integer,

  copyright text not null default '',

  uploaded_by text,

  folder text not null default 'Uploads',

  published boolean not null default true,

  archived boolean not null default false,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);


-- ============================================================================
-- 6. UPDATED_AT FUNCTION
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================================

drop trigger if exists destinations_set_updated_at
on public.destinations;

create trigger destinations_set_updated_at
before update on public.destinations
for each row
execute function public.set_updated_at();


drop trigger if exists guides_set_updated_at
on public.guides;

create trigger guides_set_updated_at
before update on public.guides
for each row
execute function public.set_updated_at();


drop trigger if exists vehicles_set_updated_at
on public.vehicles;

create trigger vehicles_set_updated_at
before update on public.vehicles
for each row
execute function public.set_updated_at();


drop trigger if exists customers_set_updated_at
on public.customers;

create trigger customers_set_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();


drop trigger if exists media_assets_set_updated_at
on public.media_assets;

create trigger media_assets_set_updated_at
before update on public.media_assets
for each row
execute function public.set_updated_at();


-- ============================================================================
-- 8. ROW LEVEL SECURITY — DESTINATIONS
-- ============================================================================

alter table public.destinations enable row level security;

drop policy if exists "Anyone can read published destinations"
on public.destinations;

drop policy if exists "Staff can manage destinations"
on public.destinations;


create policy "Anyone can read published destinations"
on public.destinations
for select
to anon, authenticated
using (
  published = true
);


create policy "Staff can manage destinations"
on public.destinations
for all
to authenticated
using (
  public.is_staff()
)
with check (
  public.is_staff()
);


grant select
on public.destinations
to anon, authenticated;

grant insert, update, delete
on public.destinations
to authenticated;


-- ============================================================================
-- 9. ROW LEVEL SECURITY — GUIDES
-- ============================================================================

alter table public.guides enable row level security;

drop policy if exists "Anyone can read active guides"
on public.guides;

drop policy if exists "Staff can manage guides"
on public.guides;


create policy "Anyone can read active guides"
on public.guides
for select
to anon, authenticated
using (
  active = true
);


create policy "Staff can manage guides"
on public.guides
for all
to authenticated
using (
  public.is_staff()
)
with check (
  public.is_staff()
);


grant select
on public.guides
to anon, authenticated;

grant insert, update, delete
on public.guides
to authenticated;


-- ============================================================================
-- 10. ROW LEVEL SECURITY — VEHICLES
-- ============================================================================

alter table public.vehicles enable row level security;

drop policy if exists "Anyone can read vehicles"
on public.vehicles;

drop policy if exists "Staff can manage vehicles"
on public.vehicles;


create policy "Anyone can read vehicles"
on public.vehicles
for select
to anon, authenticated
using (
  true
);


create policy "Staff can manage vehicles"
on public.vehicles
for all
to authenticated
using (
  public.is_staff()
)
with check (
  public.is_staff()
);


grant select
on public.vehicles
to anon, authenticated;

grant insert, update, delete
on public.vehicles
to authenticated;


-- ============================================================================
-- 11. ROW LEVEL SECURITY — CUSTOMERS
-- ============================================================================

alter table public.customers enable row level security;

drop policy if exists "Staff can read customers"
on public.customers;

drop policy if exists "Staff can manage customers"
on public.customers;


create policy "Staff can read customers"
on public.customers
for select
to authenticated
using (
  public.is_staff()
);


create policy "Staff can manage customers"
on public.customers
for all
to authenticated
using (
  public.is_staff()
)
with check (
  public.is_staff()
);


grant select, insert, update, delete
on public.customers
to authenticated;


-- ============================================================================
-- 12. ROW LEVEL SECURITY — MEDIA
-- ============================================================================

alter table public.media_assets enable row level security;

drop policy if exists "Anyone can read published media"
on public.media_assets;

drop policy if exists "Staff can manage media assets"
on public.media_assets;


create policy "Anyone can read published media"
on public.media_assets
for select
to anon, authenticated
using (
  published = true
  and archived = false
);


create policy "Staff can manage media assets"
on public.media_assets
for all
to authenticated
using (
  public.is_staff()
)
with check (
  public.is_staff()
);


grant select
on public.media_assets
to anon, authenticated;

grant insert, update, delete
on public.media_assets
to authenticated;


-- ============================================================================
-- 13. SUPABASE REALTIME
-- ============================================================================
-- Realtime makes database changes available to every open CMS/public tab.
-- The check prevents "already member of publication" errors.


do $$
declare
  table_name text;
begin

  foreach table_name in array array[
    'destinations',
    'guides',
    'vehicles',
    'customers',
    'media_assets'
  ]
  loop

    if exists (
      select 1
      from pg_tables
      where schemaname = 'public'
        and tablename = table_name
    )
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    )
    then

      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );

    end if;

  end loop;

end $$;


-- ============================================================================
-- 14. DESTINATION SEED DATA
-- ============================================================================
-- IMPORTANT:
-- ON CONFLICT DO NOTHING intentionally has NO conflict target.
-- This avoids PostgreSQL 42P10 conflict-target inference errors.


insert into public.destinations
(
  slug,
  name,
  country,
  coordinates,
  best_time,
  animal,
  image,
  gallery,
  description,
  long_description,
  activities,
  featured,
  published,
  seo_title,
  seo_description
)
values

(
  'serengeti',
  'Serengeti',
  'Tanzania',
  '[45,56]'::jsonb,
  'June to October',
  'Wildebeest',
  'https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600',
  '[]'::jsonb,
  'An immense grassland theatre where weather, predator and prey write each day anew.',
  'The Serengeti is a living stage where two million wildebeest, zebra and gazelle follow the rains in an ancient rhythm.',
  '[]'::jsonb,
  true,
  true,
  'Serengeti National Park | Tanzania',
  'The endless plains of the Serengeti, home to the Great Migration.'
),

(
  'ngorongoro',
  'Ngorongoro',
  'Tanzania',
  '[51,67]'::jsonb,
  'Year-round',
  'Black rhino',
  'https://images.pexels.com/photos/26052069/pexels-photo-26052069.jpeg?auto=compress&cs=tinysrgb&w=1600',
  '[]'::jsonb,
  'A volcanic caldera sheltering one of the greatest concentrations of wildlife on Earth.',
  'The Ngorongoro Crater is a UNESCO World Heritage site, a volcanic caldera six hundred metres deep.',
  '[]'::jsonb,
  true,
  true,
  'Ngorongoro Crater | Tanzania',
  'A volcanic caldera sheltering one of the greatest concentrations of wildlife on Earth.'
),

(
  'tarangire',
  'Tarangire',
  'Tanzania',
  '[58,73]'::jsonb,
  'June to October',
  'Elephant',
  'https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600',
  '[]'::jsonb,
  'Baobab country, seasonal rivers and magnificent elephant families moving through dust.',
  'Tarangire is a land of giants, ancient baobabs and the river that draws them together.',
  '[]'::jsonb,
  true,
  true,
  'Tarangire National Park | Tanzania',
  'Baobab country and magnificent elephant herds.'
),

(
  'lake-manyara',
  'Lake Manyara',
  'Tanzania',
  '[54,70]'::jsonb,
  'June to September',
  'Flamingo',
  'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600',
  '[]'::jsonb,
  'A forest-fringed lake beneath the Rift escarpment, alive with primates and birdlife.',
  'A forest-fringed lake beneath the Rift escarpment.',
  '[]'::jsonb,
  false,
  true,
  'Lake Manyara | Tanzania',
  'A forest-fringed lake alive with primates and birdlife.'
),

(
  'maasai-mara',
  'Maasai Mara',
  'Kenya',
  '[39,43]'::jsonb,
  'July to October',
  'Lion',
  'https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600',
  '[]'::jsonb,
  'Golden plains, private conservancies and intimate access to the migration northern reach.',
  'The Maasai Mara is Kenya most celebrated reserve, the northern terminus of the Great Migration.',
  '[]'::jsonb,
  true,
  true,
  'Maasai Mara | Kenya',
  'Kenya premier wildlife reserve and home to the Great Migration.'
),

(
  'amboseli',
  'Amboseli',
  'Kenya',
  '[65,45]'::jsonb,
  'June to October',
  'Elephant',
  'https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600',
  '[]'::jsonb,
  'Ancient elephant paths under the snow-capped presence of Kilimanjaro.',
  'Amboseli is where Kilimanjaro meets the plains and ancient elephant matriarchs walk.',
  '[]'::jsonb,
  true,
  true,
  'Amboseli National Park | Kenya',
  'Ancient elephant herds against the backdrop of Kilimanjaro.'
),

(
  'tsavo',
  'Tsavo',
  'Kenya',
  '[73,54]'::jsonb,
  'June to October',
  'Red elephant',
  'https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600',
  '[]'::jsonb,
  'Vast, untamed and rust-red: Kenya at its most elemental and gloriously uncrowded.',
  'Vast, untamed and rust-red.',
  '[]'::jsonb,
  false,
  true,
  'Tsavo | Kenya',
  'Kenya at its most elemental and gloriously uncrowded.'
),

(
  'kilimanjaro',
  'Mount Kilimanjaro',
  'Tanzania',
  '[68,60]'::jsonb,
  'January to March',
  'Colobus',
  'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600',
  '[]'::jsonb,
  'Glaciers above cloud forest, with private routes selected for time and acclimatisation.',
  'Glaciers above cloud forest.',
  '[]'::jsonb,
  false,
  true,
  'Mount Kilimanjaro | Tanzania',
  'Glaciers above cloud forest with private routes.'
)

on conflict do nothing;


-- ============================================================================
-- 15. GUIDE SEED DATA
-- ============================================================================

insert into public.guides
(
  slug,
  name,
  title,
  speciality,
  bio,
  portrait_url,
  gallery,
  languages,
  years_in_field,
  locations,
  rating,
  assignments,
  availability,
  active,
  email,
  phone
)
values

(
  'daniel-ole-nkoitoi',
  'Daniel Ole Nkoitoi',
  'Senior Safari Guide',
  'Predator behaviour',
  'Born in the Loita Plains and raised between Maasai storytelling and university-trained ecology, Daniel has spent nineteen years reading the Serengeti.',
  'https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=800',
  '[]'::jsonb,
  '["Maa","Swahili","English"]'::jsonb,
  19,
  '["Maasai Mara","Serengeti","Ngorongoro"]'::jsonb,
  4.98,
  142,
  '{"2026-06":"on_trip","2026-07":"available","2026-08":"available","2026-09":"on_trip"}'::jsonb,
  true,
  'daniel@olkinyei.com',
  '+254 700 123 456'
),

(
  'neema-lema',
  'Neema Lema',
  'Photographic Guide',
  'Wildlife photography',
  'Neema began as a camera assistant on film productions in the Mara and has become one of East Africa most sought-after photographic guides.',
  'https://images.pexels.com/photos/1239295/pexels-photo-1239295.jpeg?auto=compress&cs=tinysrgb&w=800',
  '[]'::jsonb,
  '["Swahili","English","French"]'::jsonb,
  11,
  '["Serengeti","Ndutu","Maasai Mara"]'::jsonb,
  4.94,
  87,
  '{"2026-06":"available","2026-07":"on_trip","2026-08":"available","2026-09":"available"}'::jsonb,
  true,
  'neema@olkinyei.com',
  '+254 700 234 567'
),

(
  'joseph-mollel',
  'Joseph Mollel',
  'Walking Safari Guide',
  'Walking safaris, ecology',
  'Joseph trained as a field ranger before joining Olkinyei. He reads the land the way most people read books.',
  'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=800',
  '[]'::jsonb,
  '["Swahili","English"]'::jsonb,
  14,
  '["Tarangire","Lake Eyasi","Ngorongoro Highlands"]'::jsonb,
  4.92,
  64,
  '{"2026-06":"available","2026-07":"available","2026-08":"on_trip","2026-09":"available"}'::jsonb,
  true,
  'joseph@olkinyei.com',
  '+255 700 345 678'
),

(
  'saidi-mwangi',
  'Saidi Mwangi',
  'Family Safari Specialist',
  'Family expeditions',
  'Saidi has guided more than a hundred families through East Africa and has an uncanny ability to make a seven-year-old feel like an honoured colleague.',
  'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=800',
  '[]'::jsonb,
  '["Swahili","English","German"]'::jsonb,
  12,
  '["Maasai Mara","Amboseli","Laikipia"]'::jsonb,
  4.96,
  118,
  '{"2026-06":"available","2026-07":"available","2026-08":"available","2026-09":"on_trip"}'::jsonb,
  true,
  'saidi@olkinyei.com',
  '+254 700 456 789'
)

on conflict do nothing;


-- ============================================================================
-- 16. VEHICLE SEED DATA
-- ============================================================================

insert into public.vehicles
(
  fleet_code,
  model,
  type,
  base,
  capacity,
  status,
  last_service,
  next_service,
  insurance,
  mileage,
  notes
)
values

(
  'OLK-01',
  'Toyota Land Cruiser V8',
  'Land Cruiser',
  'Nairobi',
  6,
  'Ready',
  '2026-04-10',
  '2026-07-10',
  'INS-2026-0142',
  89400,
  'Primary vehicle for Mara operations. Fitted with HF radio and charging stations.'
),

(
  'OLK-02',
  'Toyota Land Cruiser V8',
  'Land Cruiser',
  'Arusha',
  6,
  'In field',
  '2026-03-28',
  '2026-06-28',
  'INS-2026-0143',
  112800,
  'Currently on Serengeti rotation with guide Daniel.'
),

(
  'OLK-03',
  'Toyota Land Cruiser V8',
  'Land Cruiser',
  'Nairobi',
  7,
  'Ready',
  '2026-04-22',
  '2026-07-22',
  'INS-2026-0144',
  64200,
  'Family configuration with extended seating and first aid upgrade.'
),

(
  'OLK-04',
  'Custom Photography Land Cruiser',
  'Photography Vehicle',
  'Arusha',
  4,
  'Ready',
  '2026-04-05',
  '2026-07-05',
  'INS-2026-0145',
  72500,
  'Fitted with removable roof, beanbag mounts, power inverter and camera storage.'
),

(
  'OLK-05',
  'Toyota Land Cruiser V8',
  'Land Cruiser',
  'Mara',
  6,
  'Service due',
  '2025-12-18',
  '2026-03-18',
  'INS-2026-0146',
  145600,
  'Scheduled for full service next week. Currently on light duties only.'
),

(
  'OLK-06',
  'Cessna 208 Caravan',
  'Light Aircraft',
  'Wilson',
  12,
  'Ready',
  '2026-04-18',
  '2026-06-18',
  'INS-2026-0147',
  4200,
  'Charter operations between Wilson, Mara, and Serengeti airstrips.'
)

on conflict do nothing;


-- ============================================================================
-- 17. CUSTOMER SEED DATA
-- ============================================================================

insert into public.customers
(
  name,
  email,
  phone,
  country,
  avatar,
  notes,
  tags,
  total_bookings,
  total_spent,
  lifetime_value,
  first_trip,
  last_trip,
  wishlist
)
values

(
  'Amelia Whitfield',
  'amelia.whitfield@northstar.co.uk',
  '+44 7700 900123',
  'United Kingdom',
  'https://images.pexels.com/photos/1239295/pexels-photo-1239295.jpeg?auto=compress&cs=tinysrgb&w=200',
  'Anniversary celebrations, loves photography, prefers quiet camps.',
  '["photography","anniversary","returning"]'::jsonb,
  3,
  48200,
  'Platinum',
  '2022-08-14',
  '2026-07-18',
  '["Photographic safari","Gorilla trekking"]'::jsonb
),

(
  'Jonathan & Sofia Reyes',
  's.reyes@meridian.capital',
  '+1 212 555 0198',
  'United States',
  'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=200',
  'Honeymoon gift from parents. First trip to Africa.',
  '["honeymoon","first-timers"]'::jsonb,
  1,
  22400,
  'Gold',
  '2026-08-02',
  '2026-08-02',
  '["Hot-air balloon","Maasai village"]'::jsonb
),

(
  'Henrik Lindqvist',
  'h.lindqvist@nordicframe.se',
  '+46 70 555 1234',
  'Sweden',
  'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=200',
  'Nordic Film Collective. Professional photographer.',
  '["professional","film-crew","returning"]'::jsonb,
  2,
  31600,
  'Gold',
  '2024-07-10',
  '2026-09-12',
  '["Chimpanzee trekking","Zanzibar"]'::jsonb
),

(
  'The Bergström Family',
  'anna.bergstrom@klartext.nu',
  '+46 73 221 9876',
  'Sweden',
  'https://images.pexels.com/photos/1065084/pexels-photo-1065084.jpeg?auto=compress&cs=tinysrgb&w=200',
  'Family of five. Children aged 7, 10, 12.',
  '["family","returning","multi-generational"]'::jsonb,
  4,
  82400,
  'Platinum',
  '2020-07-14',
  '2026-06-28',
  '["Gorilla trekking","Zanzibar extension"]'::jsonb
),

(
  'Victoria Tanaka',
  'v.tanaka@meridian.jp',
  '+81 90 1234 5678',
  'Japan',
  'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=200',
  'Architecture and design enthusiast.',
  '["luxury","design","returning"]'::jsonb,
  2,
  54800,
  'Platinum',
  '2024-06-18',
  '2026-07-05',
  '["Ruaha","Mahale Mountains"]'::jsonb
),

(
  'Elena Rossi',
  'e.rossi@wildlens.it',
  '+39 338 765 4321',
  'Italy',
  'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=200',
  'Wildlife documentary team. Minimal footprint requirement.',
  '["documentary","minimal-footprint"]'::jsonb,
  1,
  7900,
  'Silver',
  '2026-09-04',
  '2026-09-04',
  '["Okavango","South Luangwa"]'::jsonb
)

on conflict do nothing;


-- ============================================================================
-- 18. MEDIA SEED DATA
-- ============================================================================

insert into public.media_assets
(
  url,
  thumbnail,
  type,
  name,
  alt,
  category,
  tags,
  size,
  dimensions,
  copyright,
  uploaded_by,
  folder,
  published
)
values

(
  'https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=400',
  'image',
  'Migration herd aerial',
  'Wildebeest herd seen from the air during the Great Migration',
  'Wildlife',
  '["migration","aerial","wildebeest"]'::jsonb,
  2840000,
  '{"width":9504,"height":6336}'::jsonb,
  'Hugo Sykes',
  'u3',
  'Wildlife / Migration',
  true
),

(
  'https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=400',
  'image',
  'Lion resting',
  'Lion resting under dappled shade in Maasai Mara',
  'Wildlife',
  '["lion","predator","portrait"]'::jsonb,
  1920000,
  '{"width":6016,"height":4012}'::jsonb,
  'Philipp Schwarz',
  'u3',
  'Wildlife / Predators',
  true
),

(
  'https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=400',
  'image',
  'Luxury lodge patio',
  'Elegant outdoor patio at modern safari lodge',
  'Lodges',
  '["lodge","luxury","architecture"]'::jsonb,
  3450000,
  '{"width":7421,"height":4255}'::jsonb,
  'Magda Ehlers',
  'u3',
  'Lodges / Luxury',
  true
),

(
  'https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=400',
  'image',
  'Cheetah portrait',
  'Cheetah observing across the grassland',
  'Wildlife',
  '["cheetah","predator","portrait"]'::jsonb,
  2780000,
  '{"width":8192,"height":5464}'::jsonb,
  'Magda Ehlers',
  'u3',
  'Wildlife / Predators',
  true
),

(
  'https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=400',
  'image',
  'Elephant family',
  'Elephant family walking through green savanna',
  'Wildlife',
  '["elephant","family","savanna"]'::jsonb,
  2350000,
  '{"width":6000,"height":4000}'::jsonb,
  'Princely Pixels',
  'u3',
  'Wildlife / Mammals',
  true
),

(
  'https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=400',
  'image',
  'Maasai guide portrait',
  'Maasai guide in traditional attire',
  'People',
  '["maasai","guide","portrait"]'::jsonb,
  2180000,
  '{"width":6000,"height":4000}'::jsonb,
  'Jonathan Shembere',
  'u3',
  'People / Guides',
  true
),

(
  'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=400',
  'image',
  'Giraffe at sunset',
  'Giraffe in the last light of day',
  'Wildlife',
  '["giraffe","sunset","portrait"]'::jsonb,
  2240000,
  '{"width":6000,"height":4000}'::jsonb,
  'Francesco Ungaro',
  'u3',
  'Wildlife / Mammals',
  true
),

(
  'https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=400',
  'image',
  'Wildebeest gathering',
  'Wildebeest gathering across the plain',
  'Migration',
  '["migration","herd"]'::jsonb,
  2440000,
  '{"width":6000,"height":4000}'::jsonb,
  'Magda Ehlers',
  'u3',
  'Wildlife / Migration',
  true
)

on conflict do nothing;


-- ============================================================================
-- 19. VERIFICATION — RECORD COUNTS
-- ============================================================================

select
  'destinations' as table_name,
  count(*) as record_count
from public.destinations

union all

select
  'guides',
  count(*)
from public.guides

union all

select
  'vehicles',
  count(*)
from public.vehicles

union all

select
  'customers',
  count(*)
from public.customers

union all

select
  'media_assets',
  count(*)
from public.media_assets;


-- ============================================================================
-- 20. VERIFICATION — UNIQUE INDEXES
-- ============================================================================

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'destinations_slug_key',
    'guides_slug_key',
    'vehicles_fleet_code_key',
    'customers_email_key'
  )
order by
  tablename,
  indexname;


-- ============================================================================
-- 21. VERIFICATION — REALTIME
-- ============================================================================

select
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'destinations',
    'guides',
    'vehicles',
    'customers',
    'media_assets'
  )
order by tablename;


-- ============================================================================
-- 22. FINAL CMS GLOBAL SYNC CHECK
-- ============================================================================

select
  table_name,
  exists (
    select 1
    from pg_publication_tables rpt
    where rpt.pubname = 'supabase_realtime'
      and rpt.schemaname = 'public'
      and rpt.tablename = table_name
  ) as realtime_enabled
from (
  values
    ('destinations'),
    ('guides'),
    ('vehicles'),
    ('customers'),
    ('media_assets')
) as cms_tables(table_name);


-- ============================================================================
-- END OF CMS GLOBAL SYNC MIGRATION
-- ============================================================================
