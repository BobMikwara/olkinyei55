-- ============================================================================
-- CMS GLOBAL SYNC — persist every CMS-managed entity to the shared database
-- ============================================================================
-- The public website and the Studio CMS previously diverged for several
-- entities (destinations, guides, vehicles, customers, media). Those records
-- lived only in the browser's localStorage, so edits never reached other
-- devices. This migration makes the database the single source of truth for
-- every CMS collection and adds the columns the client models require.
--
-- EXTENDS (never drops):
--   * public.guides        (created in schema.sql, archived cols in packages_sync.sql)
--   * public.vehicles      (created in schema.sql, archived cols in packages_sync.sql)
--   * public.customers     (created in packages_sync.sql)
--   * public.destinations  (created in packages_sync.sql — already complete)
-- CREATES:
--   * public.media_assets  (Media Library; also drives the public gallery)
--
-- Idempotent: safe to run repeatedly. Run AFTER schema.sql and packages_sync.sql.
-- ============================================================================

-- ---------- 1. Guides: full editorial model ----------
alter table public.guides add column if not exists slug text;
alter table public.guides add column if not exists title text not null default '';
alter table public.guides add column if not exists gallery jsonb not null default '[]'::jsonb;
alter table public.guides add column if not exists languages jsonb not null default '[]'::jsonb;
alter table public.guides add column if not exists years_in_field integer not null default 0;
alter table public.guides add column if not exists locations jsonb not null default '[]'::jsonb;
alter table public.guides add column if not exists rating numeric(3,2) not null default 5.0;
alter table public.guides add column if not exists assignments integer not null default 0;
alter table public.guides add column if not exists availability jsonb not null default '{}'::jsonb;
alter table public.guides add column if not exists email text;
alter table public.guides add column if not exists phone text;
alter table public.guides add column if not exists created_at timestamptz not null default now();

update public.guides set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) where slug is null;

create unique index if not exists guides_slug_key on public.guides (slug) where slug is not null;

-- ---------- 2. Vehicles: full fleet model ----------
alter table public.vehicles add column if not exists type text not null default 'Land Cruiser';
alter table public.vehicles add column if not exists capacity integer not null default 6;
alter table public.vehicles add column if not exists image text;
alter table public.vehicles add column if not exists driver_id uuid;
alter table public.vehicles add column if not exists last_service date;
alter table public.vehicles add column if not exists next_service date;
alter table public.vehicles add column if not exists insurance text;
alter table public.vehicles add column if not exists mileage integer not null default 0;
alter table public.vehicles add column if not exists notes text not null default '';
alter table public.vehicles add column if not exists created_at timestamptz not null default now();

-- ---------- 3. Customers: full CRM model ----------
alter table public.customers add column if not exists total_bookings integer not null default 0;
alter table public.customers add column if not exists total_spent integer not null default 0;
alter table public.customers add column if not exists lifetime_value text not null default 'New';
alter table public.customers add column if not exists first_trip date;
alter table public.customers add column if not exists last_trip date;
alter table public.customers add column if not exists wishlist jsonb not null default '[]'::jsonb;

-- ---------- 4. Media assets (Media Library + public gallery) ----------
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  thumbnail text,
  type text not null default 'image' check (type in ('image', 'video', 'pdf', 'document')),
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

alter table public.media_assets enable row level security;
drop policy if exists "Anyone can read published media" on public.media_assets;
drop policy if exists "Staff can manage media assets" on public.media_assets;
create policy "Anyone can read published media" on public.media_assets
  for select using (published = true and archived = false);
create policy "Staff can manage media assets" on public.media_assets
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant select on public.media_assets to anon, authenticated;
grant insert, update, delete on public.media_assets to authenticated;

-- ---------- 5. Realtime for every CMS-managed collection ----------
do $$
declare
  t text;
begin
  foreach t in array array['media_assets', 'destinations', 'guides', 'vehicles', 'customers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- Seed data (matches the bundled demo seeds, so a fresh database matches the
-- design review experience). ON CONFLICT DO NOTHING keeps re-runs safe.
-- ============================================================================

insert into public.destinations (slug, name, country, coordinates, best_time, animal, image, gallery, description, long_description, activities, featured, published, seo_title, seo_description)
values
('serengeti', 'Serengeti', 'Tanzania', '[45,56]', 'June to October', 'Wildebeest', 'https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600', '[]', 'An immense grassland theatre where weather, predator and prey write each day anew.', 'The Serengeti is a living stage where two million wildebeest, zebra and gazelle follow the rains in an ancient rhythm.', '[]', true, true, 'Serengeti National Park | Tanzania', 'The endless plains of the Serengeti, home to the Great Migration.'),
('ngorongoro', 'Ngorongoro', 'Tanzania', '[51,67]', 'Year-round', 'Black rhino', 'https://images.pexels.com/photos/26052069/pexels-photo-26052069.jpeg?auto=compress&cs=tinysrgb&w=1600', '[]', 'A volcanic caldera sheltering one of the greatest concentrations of wildlife on Earth.', 'The Ngorongoro Crater is a UNESCO World Heritage site, a volcanic caldera six hundred metres deep.', '[]', true, true, 'Ngorongoro Crater | Tanzania', 'A volcanic caldera sheltering one of the greatest concentrations of wildlife on Earth.'),
('tarangire', 'Tarangire', 'Tanzania', '[58,73]', 'June to October', 'Elephant', 'https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600', '[]', 'Baobab country, seasonal rivers and magnificent elephant families moving through dust.', 'Tarangire is a land of giants, ancient baobabs and the river that draws them together.', '[]', true, true, 'Tarangire National Park | Tanzania', 'Baobab country and magnificent elephant herds.'),
('lake-manyara', 'Lake Manyara', 'Tanzania', '[54,70]', 'June to September', 'Flamingo', 'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600', '[]', 'A forest-fringed lake beneath the Rift escarpment, alive with primates and birdlife.', 'A forest-fringed lake beneath the Rift escarpment.', '[]', false, true, 'Lake Manyara | Tanzania', 'A forest-fringed lake alive with primates and birdlife.'),
('maasai-mara', 'Maasai Mara', 'Kenya', '[39,43]', 'July to October', 'Lion', 'https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600', '[]', 'Golden plains, private conservancies and intimate access to the migration northern reach.', 'The Maasai Mara is Kenya most celebrated reserve, the northern terminus of the Great Migration.', '[]', true, true, 'Maasai Mara | Kenya', 'Kenya premier wildlife reserve and home to the Great Migration.'),
('amboseli', 'Amboseli', 'Kenya', '[65,45]', 'June to October', 'Elephant', 'https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600', '[]', 'Ancient elephant paths under the snow-capped presence of Kilimanjaro.', 'Amboseli is where Kilimanjaro meets the plains and ancient elephant matriarchs walk.', '[]', true, true, 'Amboseli National Park | Kenya', 'Ancient elephant herds against the backdrop of Kilimanjaro.'),
('tsavo', 'Tsavo', 'Kenya', '[73,54]', 'June to October', 'Red elephant', 'https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600', '[]', 'Vast, untamed and rust-red: Kenya at its most elemental and gloriously uncrowded.', 'Vast, untamed and rust-red.', '[]', false, true, 'Tsavo | Kenya', 'Kenya at its most elemental and gloriously uncrowded.'),
('kilimanjaro', 'Mount Kilimanjaro', 'Tanzania', '[68,60]', 'January to March', 'Colobus', 'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600', '[]', 'Glaciers above cloud forest, with private routes selected for time and acclimatisation.', 'Glaciers above cloud forest.', '[]', false, true, 'Mount Kilimanjaro | Tanzania', 'Glaciers above cloud forest with private routes.')
on conflict (slug) do nothing;

insert into public.guides (slug, name, title, speciality, bio, portrait_url, gallery, languages, years_in_field, locations, rating, assignments, availability, active, email, phone)
values
('daniel-ole-nkoitoi', 'Daniel Ole Nkoitoi', 'Senior Safari Guide', 'Predator behaviour', 'Born in the Loita Plains and raised between Maasai storytelling and university-trained ecology, Daniel has spent nineteen years reading the Serengeti.', 'https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=800', '[]', '["Maa","Swahili","English"]', 19, '["Maasai Mara","Serengeti","Ngorongoro"]', 4.98, 142, '{"2026-06":"on_trip","2026-07":"available","2026-08":"available","2026-09":"on_trip"}', true, 'daniel@olkinyei.com', '+254 700 123 456'),
('neema-lema', 'Neema Lema', 'Photographic Guide', 'Wildlife photography', 'Neema began as a camera assistant on film productions in the Mara and has become one of East Africa most sought-after photographic guides.', 'https://images.pexels.com/photos/1239295/pexels-photo-1239295.jpeg?auto=compress&cs=tinysrgb&w=800', '[]', '["Swahili","English","French"]', 11, '["Serengeti","Ndutu","Maasai Mara"]', 4.94, 87, '{"2026-06":"available","2026-07":"on_trip","2026-08":"available","2026-09":"available"}', true, 'neema@olkinyei.com', '+254 700 234 567'),
('joseph-mollel', 'Joseph Mollel', 'Walking Safari Guide', 'Walking safaris, ecology', 'Joseph trained as a field ranger before joining Olkinyei. He reads the land the way most people read books.', 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=800', '[]', '["Swahili","English"]', 14, '["Tarangire","Lake Eyasi","Ngorongoro Highlands"]', 4.92, 64, '{"2026-06":"available","2026-07":"available","2026-08":"on_trip","2026-09":"available"}', true, 'joseph@olkinyei.com', '+255 700 345 678'),
('saidi-mwangi', 'Saidi Mwangi', 'Family Safari Specialist', 'Family expeditions', 'Saidi has guided more than a hundred families through East Africa and has an uncanny ability to make a seven-year-old feel like an honoured colleague.', 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=800', '[]', '["Swahili","English","German"]', 12, '["Maasai Mara","Amboseli","Laikipia"]', 4.96, 118, '{"2026-06":"available","2026-07":"available","2026-08":"available","2026-09":"on_trip"}', true, 'saidi@olkinyei.com', '+254 700 456 789')
on conflict (slug) do nothing;

insert into public.vehicles (fleet_code, model, type, base, capacity, status, last_service, next_service, insurance, mileage, notes)
values
('OLK-01', 'Toyota Land Cruiser V8', 'Land Cruiser', 'Nairobi', 6, 'Ready', '2026-04-10', '2026-07-10', 'INS-2026-0142', 89400, 'Primary vehicle for Mara operations. Fitted with HF radio and charging stations.'),
('OLK-02', 'Toyota Land Cruiser V8', 'Land Cruiser', 'Arusha', 6, 'In field', '2026-03-28', '2026-06-28', 'INS-2026-0143', 112800, 'Currently on Serengeti rotation with guide Daniel.'),
('OLK-03', 'Toyota Land Cruiser V8', 'Land Cruiser', 'Nairobi', 7, 'Ready', '2026-04-22', '2026-07-22', 'INS-2026-0144', 64200, 'Family configuration with extended seating and first aid upgrade.'),
('OLK-04', 'Custom Photography Land Cruiser', 'Photography Vehicle', 'Arusha', 4, 'Ready', '2026-04-05', '2026-07-05', 'INS-2026-0145', 72500, 'Fitted with removable roof, beanbag mounts, power inverter and camera storage.'),
('OLK-05', 'Toyota Land Cruiser V8', 'Land Cruiser', 'Mara', 6, 'Service due', '2025-12-18', '2026-03-18', 'INS-2026-0146', 145600, 'Scheduled for full service next week. Currently on light duties only.'),
('OLK-06', 'Cessna 208 Caravan', 'Light Aircraft', 'Wilson', 12, 'Ready', '2026-04-18', '2026-06-18', 'INS-2026-0147', 4200, 'Charter operations between Wilson, Mara, and Serengeti airstrips.')
on conflict (fleet_code) do nothing;

insert into public.customers (name, email, phone, country, avatar, notes, tags, total_bookings, total_spent, lifetime_value, first_trip, last_trip, wishlist)
values
('Amelia Whitfield', 'amelia.whitfield@northstar.co.uk', '+44 7700 900123', 'United Kingdom', 'https://images.pexels.com/photos/1239295/pexels-photo-1239295.jpeg?auto=compress&cs=tinysrgb&w=200', 'Anniversary celebrations, loves photography, prefers quiet camps.', '["photography","anniversary","returning"]', 3, 48200, 'Platinum', '2022-08-14', '2026-07-18', '["Photographic safari","Gorilla trekking"]'),
('Jonathan & Sofia Reyes', 's.reyes@meridian.capital', '+1 212 555 0198', 'United States', 'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=200', 'Honeymoon gift from parents. First trip to Africa.', '["honeymoon","first-timers"]', 1, 22400, 'Gold', '2026-08-02', '2026-08-02', '["Hot-air balloon","Maasai village"]'),
('Henrik Lindqvist', 'h.lindqvist@nordicframe.se', '+46 70 555 1234', 'Sweden', 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=200', 'Nordic Film Collective. Professional photographer.', '["professional","film-crew","returning"]', 2, 31600, 'Gold', '2024-07-10', '2026-09-12', '["Chimpanzee trekking","Zanzibar"]'),
('The Bergström Family', 'anna.bergstrom@klartext.nu', '+46 73 221 9876', 'Sweden', 'https://images.pexels.com/photos/1065084/pexels-photo-1065084.jpeg?auto=compress&cs=tinysrgb&w=200', 'Family of five. Children aged 7, 10, 12.', '["family","returning","multi-generational"]', 4, 82400, 'Platinum', '2020-07-14', '2026-06-28', '["Gorilla trekking","Zanzibar extension"]'),
('Victoria Tanaka', 'v.tanaka@meridian.jp', '+81 90 1234 5678', 'Japan', 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=200', 'Architecture and design enthusiast.', '["luxury","design","returning"]', 2, 54800, 'Platinum', '2024-06-18', '2026-07-05', '["Ruaha","Mahale Mountains"]'),
('Elena Rossi', 'e.rossi@wildlens.it', '+39 338 765 4321', 'Italy', 'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=200', 'Wildlife documentary team. Minimal footprint requirement.', '["documentary","minimal-footprint"]', 1, 7900, 'Silver', '2026-09-04', '2026-09-04', '["Okavango","South Luangwa"]')
on conflict (email) do nothing;

insert into public.media_assets (url, thumbnail, type, name, alt, category, tags, size, dimensions, copyright, uploaded_by, folder, published)
values
('https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600', 'https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=400', 'image', 'Migration herd aerial', 'Wildebeest herd seen from the air during the Great Migration', 'Wildlife', '["migration","aerial","wildebeest"]', 2840000, '{"width":9504,"height":6336}', 'Hugo Sykes', 'u3', 'Wildlife / Migration', true),
('https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600', 'https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=400', 'image', 'Lion resting', 'Lion resting under dappled shade in Maasai Mara', 'Wildlife', '["lion","predator","portrait"]', 1920000, '{"width":6016,"height":4012}', 'Philipp Schwarz', 'u3', 'Wildlife / Predators', true),
('https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600', 'https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=400', 'image', 'Luxury lodge patio', 'Elegant outdoor patio at modern safari lodge', 'Lodges', '["lodge","luxury","architecture"]', 3450000, '{"width":7421,"height":4255}', 'Magda Ehlers', 'u3', 'Lodges / Luxury', true),
('https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600', 'https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=400', 'image', 'Cheetah portrait', 'Cheetah observing across the grassland', 'Wildlife', '["cheetah","predator","portrait"]', 2780000, '{"width":8192,"height":5464}', 'Magda Ehlers', 'u3', 'Wildlife / Predators', true),
('https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600', 'https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=400', 'image', 'Elephant family', 'Elephant family walking through green savanna', 'Wildlife', '["elephant","family","savanna"]', 2350000, '{"width":6000,"height":4000}', 'Princely Pixels', 'u3', 'Wildlife / Mammals', true),
('https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=1600', 'https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=400', 'image', 'Maasai guide portrait', 'Maasai guide in traditional attire', 'People', '["maasai","guide","portrait"]', 2180000, '{"width":6000,"height":4000}', 'Jonathan Shembere', 'u3', 'People / Guides', true),
('https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600', 'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=400', 'image', 'Giraffe at sunset', 'Giraffe in the last light of day', 'Wildlife', '["giraffe","sunset","portrait"]', 2240000, '{"width":6000,"height":4000}', 'Francesco Ungaro', 'u3', 'Wildlife / Mammals', true),
('https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600', 'https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=400', 'image', 'Wildebeest gathering', 'Wildebeest gathering across the plain', 'Migration', '["migration","herd"]', 2440000, '{"width":6000,"height":4000}', 'Magda Ehlers', 'u3', 'Wildlife / Migration', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verification:
--   select 'destinations' t, count(*) from public.destinations
--   union all select 'guides', count(*) from public.guides
--   union all select 'vehicles', count(*) from public.vehicles
--   union all select 'customers', count(*) from public.customers
--   union all select 'media', count(*) from public.media_assets;
--   set role anon; select name from public.destinations; reset role;  -- all published
-- ---------------------------------------------------------------------------
