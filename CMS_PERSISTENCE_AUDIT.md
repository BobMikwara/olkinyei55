# CMS Persistence & Global Synchronization Audit

**Goal:** every CMS-managed value must live in the shared Supabase database and
reach every browser/device, with **no** authoritative use of `localStorage`,
`sessionStorage`, or static/mock data.

Architecture now enforced throughout the app:

```
CMS form ──▶ Supabase ──▶ public website (all browsers / devices / sessions)
```

---

## 1. What was audited

Every CMS section, its data source **before** this audit, and its source **after**:

| CMS section | Table | Before | After |
| --- | --- | --- | --- |
| Site settings (logo, brand, colors, contact, social, analytics, maintenance/coming-soon, robots) | `cms_content('site_settings')` | DB + localStorage shadow | **DB only** |
| Pages (hero, headings, SEO, published) | `cms_content('pages')` | DB + localStorage shadow | **DB only** |
| Safari packages (price, Included, Not Included, itinerary, SEO, publish) | `packages` | DB (already) | DB |
| Blog / Journal | `blog_posts` | DB (already) | DB |
| Testimonials | `testimonials` | DB (already) | DB |
| Destinations | `destinations` | **localStorage only** | **DB** |
| Guides | `guides` | **localStorage only** (create/edit) | **DB** |
| Vehicles | `vehicles` | **localStorage only** (create/edit) | **DB** |
| Customers | `customers` | **localStorage only** (edit) | **DB** |
| Media library / gallery | `media_assets` *(new)* | **localStorage only** | **DB** |
| Bookings / reservations | `bookings` | DB + localStorage bridge | **DB** (localStorage demo-only) |
| Staff / profiles / audit | `profiles`, `audit_logs` | DB (already) | DB |

---

## 2. Root cause fixed: localStorage was authoritative

`src/admin/store.ts` persisted the entire CMS state to a single localStorage
key (`olkinyei-admin-v2`) and **loaded it back as the source of truth** for
every collection. Even the cloud-backed collections (packages, blog,
testimonials, pages, settings) seeded from that localStorage snapshot before
the database load replaced it — so a stale browser could briefly (or, on a
failed fetch, permanently) show outdated content.

**Fix (`loadState` / `persist` / cross-tab `storage` handler):**

- When Supabase is configured (`hasCloudBackend`), localStorage may only restore
  **non-content state** (theme preference + the session-restore hint). It can
  never seed CMS content — the database is the only content source.
- When Supabase is **not** configured, the documented demo mode still persists
  content locally, and the public slices are now derived from the staff slices
  so a single edit propagates to the public site in that mode too.
- The cross-tab `storage` event listener is now a no-op for content in cloud
  mode (Realtime + cloud reloads are the transport), preventing one tab's stale
  localStorage snapshot from overwriting database state in another tab.

## 3. LocalStorage-only collections moved to the database

Destinations, guides, vehicles, customers, and media were previously read and
written **only** in browser state. They now follow the exact same pattern as
packages/blog/testimonials:

- **Load** from Supabase (staff view via the authenticated client, public view
  via the anonymous client — RLS returns only published/active rows to anon).
- **Save** via `INSERT/UPDATE` with the id minted by Postgres (seed ids like
  `"d1"`/`"g1"` are not uuids, so they upsert on their natural key: `slug`,
  `fleet_code`, `email`).
- **Realtime** subscriptions for `destinations`, `guides`, `vehicles`,
  `customers`, `media_assets` keep every open tab in sync.
- **Delete/archive** writes the archive flag (or deletes) to the database.

Schema changes live in `supabase/cms_global_sync.sql` (adds the full column set
to `guides`/`vehicles`/`customers`, creates `media_assets`, RLS + grants +
realtime, and seeds matching demo data).

## 4. Public website now reads the database

Previously the public site rendered **static** `src/data.ts` arrays for
destinations and the gallery, and **hardcoded** guide HTML in the "Our Story"
page. Those now read the shared store:

- Destinations page + map → `public.destinations`
- "Your Guides" section → `public.guides`
- Field Notes gallery + Instagram strip → `public.media_assets`

Static seeds remain only as the offline fallback when the database is empty or
unreachable.

## 5. "False success" eliminated

`createPackage`/`updatePackage` already verified the write; the new actions
(`createDestination`, `updateDestination`, `deleteDestination`, `createGuide`,
`updateGuide`, `createVehicle`, `updateVehicle`, `updateCustomer`, `createMedia`,
`updateMedia`, `deleteMedia`) now do the same:

1. optimistic UI update,
2. database write,
3. on failure → **roll back** and show an error toast,
4. on success → re-read the public slice and show a success toast.

The destination / guide / vehicle / customer / media editors now `await` the
save and **only close on success**, so an admin never loses typed input to a
silently failed save.

## 6. Booking localStorage bridge removed (cloud mode)

The public booking form and the CMS booking pipeline no longer read or write
the `olkinyei-bookings` localStorage key when a cloud backend is configured.
Bookings flow through Supabase (`persistBooking` + Realtime + `getCloudBookings`).
The localStorage path remains only for demo mode.

## 7. Dead legacy admin removed

`src/App.tsx` contained an unreachable legacy `AdminPanel` that wrote prices,
gallery, blog, and content edits to `olkinyei-prices`, `olkinyei-gallery-admin`,
`olkinyei-blog-posts`, and `olkinyei-content`. It was dead code (never opened)
and has been removed along with those localStorage keys.

---

## Migration & verification

Run the SQL in this order:

```
1. supabase/schema.sql
2. supabase/auth_schema_sync.sql
3. supabase/role_canonicalization.sql
4. supabase/blog_posts_sync.sql
5. supabase/bookings_hardening.sql
6. supabase/cms_content.sql
7. supabase/packages_sync.sql
8. supabase/testimonials_moderation.sql
9. supabase/testimonials_sources.sql
10. supabase/cms_global_sync.sql   ← new
```

Verification queries:

```sql
-- Every CMS collection is populated (destinations/guides/vehicles/customers/media):
select 'destinations' t, count(*) from public.destinations
union all select 'guides', count(*) from public.guides
union all select 'vehicles', count(*) from public.vehicles
union all select 'customers', count(*) from public.customers
union all select 'media', count(*) from public.media_assets;

-- Anonymous visitors see published content only:
set role anon; select count(*) from public.destinations; reset role;   -- all published
set role anon; select count(*) from public.guides; reset role;         -- active only
set role anon; select count(*) from public.media_assets; reset role;   -- published, non-archived
```

Functional checks:

1. Change a package price / Included item → open another browser (incognito) →
   value appears; refresh + reopen still correct.
2. Change the logo / phone / footer → another device shows it immediately.
3. Edit a destination or guide → the public map / "Your Guides" updates.
4. Publish/unpublish a blog post or package → appears/disappears globally.
5. Archive a guide/vehicle/customer → stops appearing (public guide) / leaves
   the directory, while existing bookings keep their reference.
6. Delete a testimonial → removed from the public site.
7. Toggle maintenance/coming-soon → every visitor sees the gate; the CMS
   (`/#/admin`) is never gated.
8. Seed stale `olkinyei-admin-v2` data in localStorage, then make a newer edit
   from the CMS → the newer database value wins (localStorage is ignored for
   content in cloud mode).

## Remaining legitimate browser storage (intentional, non-content)

- `olkinyei-intro` (sessionStorage) — skips the intro loader on repeat visits.
- theme preference — UI preference, not content.
- session-restore hint + Supabase auth storage — credentials/session, never content.
- demo-mode localStorage content — only active when **no** Supabase backend is
  configured (the documented design-review fallback).
