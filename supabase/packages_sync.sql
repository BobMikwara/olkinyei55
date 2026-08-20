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

-- ============================================================================
-- Seed / migration data for safari packages (included / excluded arrays)
-- ============================================================================
-- These inserts preserve the existing Included / Not Included values that
-- were previously hardcoded in src/data.ts. Each row uses its slug as the
-- conflict key so re-running is safe (ON CONFLICT DO NOTHING). The database
-- minted UUID for `id` is left to the default.
-- ============================================================================

insert into public.packages (slug, title, region, duration, price_usd, summary, hero_image, included, excluded, published, nights, gallery, description, signature, highlights, availability, country, parks, wildlife, difficulty, tags, featured, archived, coordinates, seo_title, seo_description, publish_date, created_at, updated_at)
values
('great-migration', 'The Great Migration', 'Serengeti + Maasai Mara', '9 days / 8 nights', 8450, 'Follow the herds from private mobile camps to the fabled Mara River crossings.', 'https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600', '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water"]'::jsonb, '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb, true, 8, '["https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600"]'::jsonb, 'A nine-day expedition tracking two million animals across the Serengeti-Mara ecosystem. We position private mobile camps along the migration route, moving with the herds as they respond to rain and river crossings.', 'River crossings, predator country, private mobile camp', '["Mara River crossings","Private mobile camp","Predator tracking","Balloon safari option"]'::jsonb, '["Jun","Jul","Aug","Sep","Oct"]'::jsonb, '["Tanzania","Kenya"]'::jsonb, '["Serengeti","Maasai Mara","Ngorongoro"]'::jsonb, '["Wildebeest","Zebra","Lion","Cheetah","Crocodile"]'::jsonb, 'Moderate', '["migration","big-five","signature"]'::jsonb, true, false, '[35,42]'::jsonb, 'The Great Migration Safari | Olkinyei Expeditions', 'A nine-day private expedition following two million animals across the Serengeti and Maasai Mara.', null, now(), now()),
('big-five', 'Big Five, Unhurried', 'Ngorongoro + Serengeti', '7 days / 6 nights', 6200, 'A patient, private search for East Africa''s icons, led by the rhythms of the wild.', 'https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600', '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water"]'::jsonb, '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb, true, 6, '["https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/26052069/pexels-photo-26052069.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600"]'::jsonb, 'Seven days dedicated to the patient observation of Africa''s most iconic species across the Ngorongoro Crater and central Serengeti.', 'Crater floor, lion territories, elephant herds', '["Ngorongoro Crater floor","Black rhino tracking","Elephant herds","Lion prides"]'::jsonb, '["Jan","Feb","Jun","Jul","Aug","Sep"]'::jsonb, '["Tanzania"]'::jsonb, '["Ngorongoro","Serengeti","Tarangire"]'::jsonb, '["Lion","Leopard","Elephant","Buffalo","Rhino"]'::jsonb, 'Gentle', '["big-five","first-time"]'::jsonb, true, false, '[42,57]'::jsonb, 'Big Five Safari | Ngorongoro & Serengeti', 'A patient seven-day search for the Big Five across the Ngorongoro Crater and Serengeti.', null, now(), now()),
('luxury-lodge', 'Lodges Beyond the Wild', 'Northern Tanzania', '8 days / 7 nights', 9900, 'Architectural lodges, intuitive service and vast landscapes with every detail considered.', 'https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600', '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water","Selected premium drinks and laundry"]'::jsonb, '["International flights and visas","Travel insurance","Personal purchases","Guide gratuities"]'::jsonb, true, 7, '["https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600"]'::jsonb, 'Eight nights in some of East Africa''s most considered architectural lodges, where design meets the wild.', 'Design lodges, bush dining, optional helicopter flight', '["Architectural lodges","Private guides","Bush dining","Helicopter transfers"]'::jsonb, '["All year"]'::jsonb, '["Tanzania"]'::jsonb, '["Serengeti","Ngorongoro","Tarangire","Lake Manyara"]'::jsonb, '["Lion","Elephant","Giraffe","Leopard"]'::jsonb, 'Gentle', '["luxury","design","lodge"]'::jsonb, true, false, '[56,52]'::jsonb, 'Luxury Lodge Safari | Tanzania', 'Eight nights in East Africa''s most considered architectural lodges.', null, now(), now()),
('family', 'The Family Bush', 'Laikipia + Maasai Mara', '8 days / 7 nights', 5750, 'A flexible, deeply engaging journey designed for curious young explorers and their families.', 'https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600', '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water","Private family vehicle throughout"]'::jsonb, '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb, true, 7, '["https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600"]'::jsonb, 'An eight-day family expedition balancing wildlife excitement with genuine rest, built around child-friendly pacing and activities.', 'Junior ranger program, private house, gentle pacing', '["Junior ranger program","Private family vehicle","Child-friendly camps","Cultural encounters"]'::jsonb, '["Feb","Mar","Jun","Jul","Aug","Dec"]'::jsonb, '["Kenya","Tanzania"]'::jsonb, '["Maasai Mara","Laikipia","Amboseli"]'::jsonb, '["Elephant","Giraffe","Lion","Zebra"]'::jsonb, 'Gentle', '["family","kids","flexible"]'::jsonb, false, false, '[62,32]'::jsonb, 'Family Safari | Kenya & Tanzania', 'A family-friendly safari balancing wildlife excitement with genuine rest.', null, now(), now()),
('honeymoon', 'Wildly, Together', 'Serengeti + Zanzibar', '11 days / 10 nights', 11200, 'Private plains, lantern dinners and an Indian Ocean epilogue created for two.', 'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600', '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Internal scheduled flights","Private celebration dinner"]'::jsonb, '["International flights and visas","Travel insurance","Spa treatments","Premium drinks"]'::jsonb, true, 10, '["https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600"]'::jsonb, 'An eleven-day romantic journey combining the wild drama of the Serengeti with an Indian Ocean island epilogue.', 'Private plunge pool, hot-air balloon, island retreat', '["Hot-air balloon","Private dinners","Ocean retreat","Couples spa"]'::jsonb, '["Jan","Feb","Jun","Jul","Aug","Sep","Oct"]'::jsonb, '["Tanzania"]'::jsonb, '["Serengeti","Ngorongoro"]'::jsonb, '["Lion","Elephant","Giraffe"]'::jsonb, 'Gentle', '["honeymoon","romantic","island"]'::jsonb, true, false, '[46,67]'::jsonb, 'Honeymoon Safari | Serengeti & Zanzibar', 'An eleven-day romantic journey combining Serengeti wildlife with an Indian Ocean retreat.', null, now(), now()),
('photographic', 'The Photographer''s Light', 'Ndutu + Serengeti', '10 days / 9 nights', 9300, 'A specialist-led expedition with low-angle vehicles and time to wait for the frame.', 'https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600', '["Professional photographic guide","All park fees and conservancy levies","Full-board handpicked accommodation","Photography vehicle with charging stations"]'::jsonb, '["International flights and visas","Camera equipment","Travel insurance"]'::jsonb, true, 9, '["https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600"]'::jsonb, 'Ten days in the field with a specialist photographic guide, built around light, patience, and the frame.', 'Pro guide, beanbags, editing suite, golden-hour drives', '["Professional guide","Photography vehicle","Editing suite","Golden-hour drives"]'::jsonb, '["Jan","Feb","Mar","Jun","Sep","Oct"]'::jsonb, '["Tanzania"]'::jsonb, '["Ndutu","Serengeti"]'::jsonb, '["Cheetah","Lion","Leopard","Wildebeest"]'::jsonb, 'Moderate', '["photography","specialist"]'::jsonb, false, false, '[39,59]'::jsonb, 'Photographic Safari | Tanzania', 'A specialist photographic expedition with dedicated vehicles and golden-hour drives.', null, now(), now()),
('walking', 'On Foot in the Rift', 'Tarangire + Lake Eyasi', '6 days / 5 nights', 4800, 'Read tracks, notice the small worlds and move through the landscape at nature''s pace.', 'https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600', '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water","Armed walking ranger"]'::jsonb, '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb, true, 5, '["https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=1600"]'::jsonb, 'Read tracks, notice the small worlds and move through the landscape at nature''s pace.', 'Private walking guide, fly camp, Hadzabe encounter', '["Private walking guide","Fly camp","Hadzabe encounter"]'::jsonb, '["Jun","Jul","Aug","Sep","Oct"]'::jsonb, '["Tanzania"]'::jsonb, '["Tarangire","Lake Eyasi"]'::jsonb, '["Elephant","Giraffe","Leopard","Wildebeest"]'::jsonb, 'Moderate', '["walking","ecology"]'::jsonb, false, false, '[52,62]'::jsonb, 'Walking Safari | Tarangire & Lake Eyasi', 'A walking safari through Tarangire and Lake Eyasi with expert guides.', null, now(), now()),
('under-canvas', 'Under Canvas', 'Maasai Mara Conservancies', '5 days / 4 nights', 3950, 'Canvas walls, hot bucket showers and the rare luxury of falling asleep to the wild.', 'https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600', '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water"]'::jsonb, '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb, true, 4, '["https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600","https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600"]'::jsonb, 'Canvas walls, hot bucket showers and the rare luxury of falling asleep to the wild.', 'Private conservancy, night drives, fireside suppers', '["Private conservancy","Night drives","Fireside suppers"]'::jsonb, '["Jun","Jul","Aug","Sep","Oct","Nov"]'::jsonb, '["Kenya"]'::jsonb, '["Maasai Mara"]'::jsonb, '["Lion","Wildebeest","Leopard","Zebra"]'::jsonb, 'Gentle', '["camping","mara","wildlife"]'::jsonb, false, false, '[30,34]'::jsonb, 'Canvas Safari | Maasai Mara', 'A luxury under-canvas experience in private Maasai Mara conservancies.', null, now(), now())
on conflict (slug) do update set
  included = excluded.included,
  excluded = excluded.excluded,
  nights = excluded.nights,
  gallery = excluded.gallery,
  description = excluded.description,
  signature = excluded.signature,
  highlights = excluded.highlights,
  availability = excluded.availability,
  country = excluded.country,
  parks = excluded.parks,
  wildlife = excluded.wildlife,
  difficulty = excluded.difficulty,
  tags = excluded.tags,
  featured = excluded.featured,
  archived = excluded.archived,
  coordinates = excluded.coordinates,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  publish_date = excluded.publish_date,
  updated_at = now();
