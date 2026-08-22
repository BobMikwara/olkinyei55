-- ============================================================================
-- RESTORE PUBLIC (ANONYMOUS) READS — WITHOUT TOUCHING CMS DATA
-- ============================================================================
--
-- WHY THIS EXISTS
--   The public website reads CMS content with the ANONYMOUS Supabase client.
--   If the anon role cannot SELECT a table (missing/over-restrictive RLS
--   policy, or a missing GRANT), the public read returns an empty result while
--   the CMS — which uses the authenticated/service-role path — still sees every
--   record. The site then looks like "packages/destinations disappeared" even
--   though they exist in Supabase.
--
-- WHAT THIS DOES
--   * Re-creates the *only* policies that matter for public reads: SELECT
--     (anonymous) policies that limit anon to published/active content.
--   * Grants anon + authenticated SELECT on those tables.
--   * Keeps staff management policies untouched (authenticated only).
--
-- WHAT THIS DOES **NOT** DO
--   * NO DELETE / UPDATE / INSERT on existing rows.
--   * NO TRUNCATE. NO DROP TABLE. NO reseeding.
--   * Does NOT disable Row Level Security globally.
--   * Does NOT grant the `service_role` key to any client code.
--
-- SAFE TO RE-RUN (idempotent).
--
-- RUN THIS  (Supabase SQL editor or `supabase db push`):
--   supabase/public_read_restore.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SAFARI PACKAGES (public.packages)
--    Anon may read published rows. The CMS hides a package by setting
--    published = false (and archived = true), so `published = true` alone is
--    both correct and safe on every schema version (published exists in all of
--    them; archived does not).
-- ---------------------------------------------------------------------------
alter table public.packages enable row level security;

drop policy if exists "Public can read published packages" on public.packages;
drop policy if exists "Anyone can read published packages" on public.packages;
drop policy if exists "Public packages readable" on public.packages;

create policy "Public can read published packages"
  on public.packages
  for select
  to anon, authenticated
  using (published = true);

grant select on public.packages to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. DESTINATIONS (public.destinations)
--    Anon may read published rows.
-- ---------------------------------------------------------------------------
alter table public.destinations enable row level security;

drop policy if exists "Public can read published destinations" on public.destinations;
drop policy if exists "Anyone can read published destinations" on public.destinations;
drop policy if exists "Public destinations readable" on public.destinations;

create policy "Public can read published destinations"
  on public.destinations
  for select
  to anon, authenticated
  using (published = true);

grant select on public.destinations to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. GUIDES (public.guides)
--    Anon may read active guides only.
-- ---------------------------------------------------------------------------
alter table public.guides enable row level security;

drop policy if exists "Public can read active guides" on public.guides;
drop policy if exists "Anyone can read active guides" on public.guides;
drop policy if exists "Public guides readable" on public.guides;

create policy "Public can read active guides"
  on public.guides
  for select
  to anon, authenticated
  using (active = true);

grant select on public.guides to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. MEDIA ASSETS (public.media_assets)
--    Anon may read published, non-archived assets. `archived` and `published`
--    exist on every `media_assets` schema (the table was created with them).
-- ---------------------------------------------------------------------------
alter table public.media_assets enable row level security;

drop policy if exists "Public can read published media" on public.media_assets;
drop policy if exists "Anyone can read published media" on public.media_assets;
drop policy if exists "Public media readable" on public.media_assets;

create policy "Public can read published media"
  on public.media_assets
  for select
  to anon, authenticated
  using (published = true and archived = false);

grant select on public.media_assets to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. BLOG POSTS (public.blog_posts)
--    Anon may read posts whose published_at is in the past. `published_at`
--    exists on every schema version.
-- ---------------------------------------------------------------------------
alter table public.blog_posts enable row level security;

drop policy if exists "Public can read published posts" on public.blog_posts;
drop policy if exists "Anyone can read published posts" on public.blog_posts;
drop policy if exists "Public posts readable" on public.blog_posts;

create policy "Public can read published posts"
  on public.blog_posts
  for select
  to anon, authenticated
  using (archived = false and published_at is not null and published_at <= now());

grant select on public.blog_posts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. TESTIMONIALS (public.testimonials)
--    Anon may read approved/published testimonials only. `published` exists on
--    every schema version and is kept in sync with `status` by the moderation
--    trigger; the frontend re-filters on status = 'approved'.
-- ---------------------------------------------------------------------------
alter table public.testimonials enable row level security;

drop policy if exists "Public can read published testimonials" on public.testimonials;
drop policy if exists "Anyone can read published testimonials" on public.testimonials;
drop policy if exists "Public testimonials readable" on public.testimonials;

create policy "Public can read published testimonials"
  on public.testimonials
  for select
  to anon, authenticated
  using (published = true);

grant select on public.testimonials to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. CMS CONTENT (public.cms_content)
--    Brand + page settings are public by design (no sensitive data).
-- ---------------------------------------------------------------------------
alter table public.cms_content enable row level security;

drop policy if exists "Public can read cms content" on public.cms_content;
drop policy if exists "Anyone can read cms content" on public.cms_content;

create policy "Public can read cms content"
  on public.cms_content
  for select
  to anon, authenticated
  using (true);

grant select on public.cms_content to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. VERIFICATION
--    Expected: the same record count as the CMS sees, with anon limited to
--    published content. If these return fewer rows than the CMS, the change
--    being made to the CMS (published flag) is not the problem — RLS is.
-- ---------------------------------------------------------------------------
set local role anon;
select
  'packages'      as table_name, count(*) as anon_rows from public.packages
  union all select 'destinations', count(*) from public.destinations
  union all select 'guides',       count(*) from public.guides
  union all select 'media_assets', count(*) from public.media_assets
  union all select 'blog_posts',   count(*) from public.blog_posts
  union all select 'testimonials', count(*) from public.testimonials;
reset role;
