// src/lib/cms.ts
// Central CMS data-access layer — Supabase is the SINGLE source of truth.
//
// Pipeline enforced here:
//   CMS form  ──▶  Supabase  ──▶  public website (every browser / device)
//
// PUBLIC helpers use the ANON client so the same RLS the public site depends on
// is always exercised, and they apply explicit published/active/archived
// filters (not just RLS) so a permissive policy can never leak drafts to the
// site. STAFF helpers use the AUTHENTICATED client for writes.
//
// These functions THROW on error rather than returning `[]` silently, so a
// broken read (wrong table, wrong filter, RLS denial, wrong project) is
// surfaced to the caller and never mistaken for "no content exists".
// Diagnostics are logged with table / query / filter / record count / error.

import { supabase, supabasePublic } from "./supabase";

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function shouldLogPublicDiagnostics(): boolean {
  if (typeof window === "undefined") return import.meta.env.DEV;
  const host = window.location.hostname.toLowerCase();
  return import.meta.env.DEV || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app") || host.endsWith(".e2b.app") || host.includes("preview");
}

function logPublicRead(label: string, details: Record<string, unknown>) {
  if (!shouldLogPublicDiagnostics()) return;
  console.log(`[PUBLIC ${label}]`, details);
}

function logPublicError(label: string, error: unknown, details: Record<string, unknown> = {}) {
  if (!shouldLogPublicDiagnostics()) return;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[PUBLIC ${label}] Query failed: ${message}`, details);
}

function logError(operation: string, table: string, error: unknown, id?: string) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[CMS] ${operation} failed — table=${table}${id ? ` id=${id}` : ""}: ${msg}`);
}

function isMissingColumnError(message: string): boolean {
  return /could not find the '[^']+' column/i.test(message)
    || /schema cache/i.test(message)
    || /column .+ does not exist/i.test(message);
}

function assertCloud(): boolean {
  if (!supabase) {
    if (import.meta.env.DEV) console.warn("[CMS] Supabase is not configured — operating in demo mode.");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Site settings (cms_content id=site_settings)
// ---------------------------------------------------------------------------

export async function getSiteSettings() {
  const client = supabasePublic ?? supabase;
  if (!client) throw new Error("Cloud not configured");
  const { data, error } = await client.from("cms_content").select("content").eq("id", "site_settings").single();
  if (error) { logError("getSiteSettings", "cms_content", error); throw error; }
  return data?.content ?? null;
}

export async function updateSiteSettings(content: unknown) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("cms_content")
    .upsert({ id: "site_settings", content, updated_at: new Date().toISOString() })
    .select("content")
    .single();
  if (error) { logError("updateSiteSettings", "cms_content", error); throw error; }
  return data.content;
}

// ---------------------------------------------------------------------------
// Pages (cms_content id=pages)
// ---------------------------------------------------------------------------

export async function getPages() {
  const client = supabasePublic ?? supabase;
  if (!client) throw new Error("Cloud not configured");
  const { data, error } = await client.from("cms_content").select("content").eq("id", "pages").single();
  if (error) { logError("getPages", "cms_content", error); throw error; }
  return data?.content ?? [];
}

export async function updatePages(content: unknown) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("cms_content")
    .upsert({ id: "pages", content, updated_at: new Date().toISOString() })
    .select("content")
    .single();
  if (error) { logError("updatePages", "cms_content", error); throw error; }
  return data.content;
}

// ---------------------------------------------------------------------------
// Packages (public.packages) — public reads filter published=true
// ---------------------------------------------------------------------------

export async function getPackages(publishedOnly = true): Promise<Record<string, unknown>[]> {
  const client = publishedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  const table = "packages";
  const filter = publishedOnly ? "published = true" : "all rows";
  try {
    let base = client.from(table).select("*");
    if (publishedOnly) base = base.eq("published", true);
    let { data, error } = await base.order("created_at", { ascending: false });
    if (error && isMissingColumnError((error as { message: string }).message)) {
      ({ data, error } = await base.order("updated_at", { ascending: false }));
    }
    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    logPublicRead("SAFARIS", { table, query: `select * where ${filter} order by created_at/updated_at desc`, filter, recordCount: rows.length });
    return rows;
  } catch (error) {
    logPublicError("SAFARIS", error, { table, filter, hint: "Run supabase/packages_sync.sql, then confirm anon SELECT is permitted on public.packages." });
    throw error;
  }
}

export async function getPackageBySlug(slug: string) {
  const client = supabasePublic ?? supabase;
  if (!client) throw new Error("Cloud not configured");
  const { data, error } = await client.from("packages").select("*").eq("published", true).eq("slug", slug).single();
  if (error) { logError("getPackageBySlug", "packages", error, slug); throw error; }
  return data;
}

export async function createPackage(payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("packages").insert(payload).select("*").single();
  if (error) { logError("createPackage", "packages", error); throw error; }
  return data;
}

export async function updatePackage(id: string, payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("packages").update(payload).eq("id", id).select("*").single();
  if (error) { logError("updatePackage", "packages", error, id); throw error; }
  return data;
}

export async function deletePackage(id: string) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { error } = await supabase!.from("packages").delete().eq("id", id);
  if (error) { logError("deletePackage", "packages", error, id); throw error; }
}

// ---------------------------------------------------------------------------
// Destinations (public.destinations) — public reads filter published=true
// ---------------------------------------------------------------------------

export async function getDestinations(publishedOnly = true): Promise<Record<string, unknown>[]> {
  const client = publishedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  const table = "destinations";
  const filter = publishedOnly ? "published = true" : "all rows";
  try {
    let base = client.from(table).select("*");
    if (publishedOnly) base = base.eq("published", true);
    const { data, error } = await base.order("name", { ascending: true });
    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    logPublicRead("DESTINATIONS", { table, query: `select * where ${filter} order by name asc`, filter, recordCount: rows.length });
    return rows;
  } catch (error) {
    logPublicError("DESTINATIONS", error, { table, filter, hint: "Run supabase/cms_global_sync.sql, then confirm anon SELECT is permitted on public.destinations." });
    throw error;
  }
}

export async function createDestination(payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("destinations").insert(payload).select("*").single();
  if (error) { logError("createDestination", "destinations", error); throw error; }
  return data;
}

export async function updateDestination(id: string, payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("destinations").update(payload).eq("id", id).select("*").single();
  if (error) { logError("updateDestination", "destinations", error, id); throw error; }
  return data;
}

export async function deleteDestination(id: string) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { error } = await supabase!.from("destinations").delete().eq("id", id);
  if (error) { logError("deleteDestination", "destinations", error, id); throw error; }
}

// ---------------------------------------------------------------------------
// Guides (public.guides) — public reads filter active=true
// ---------------------------------------------------------------------------

export async function getGuides(activeOnly = true): Promise<Record<string, unknown>[]> {
  const client = activeOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  const table = "guides";
  const filter = activeOnly ? "active = true and archived = false" : "all rows";
  try {
    let { data, error } = await client.from(table).select("*").eq("active", true).eq("archived", false).order("name", { ascending: true });
    if (error && isMissingColumnError((error as { message: string }).message)) {
      ({ data, error } = await client.from(table).select("*").eq("active", true).order("name", { ascending: true }));
    }
    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    logPublicRead("GUIDES", { table, query: `select * where ${filter} order by name asc`, filter, recordCount: rows.length });
    return rows;
  } catch (error) {
    logPublicError("GUIDES", error, { table, filter, hint: "Run supabase/cms_global_sync.sql, then confirm anon SELECT is permitted on public.guides." });
    throw error;
  }
}

export async function createGuide(payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("guides").insert(payload).select("*").single();
  if (error) { logError("createGuide", "guides", error); throw error; }
  return data;
}

export async function updateGuide(id: string, payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("guides").update(payload).eq("id", id).select("*").single();
  if (error) { logError("updateGuide", "guides", error, id); throw error; }
  return data;
}

export async function deleteGuide(id: string) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { error } = await supabase!.from("guides").update({ archived: true, active: false }).eq("id", id);
  if (error) { logError("deleteGuide", "guides", error, id); throw error; }
}

// ---------------------------------------------------------------------------
// Vehicles (public.vehicles) — staff only
// ---------------------------------------------------------------------------

export async function getVehicles() {
  if (!supabase) throw new Error("Cloud not configured");
  const { data, error } = await supabase.from("vehicles").select("*").order("fleet_code", { ascending: true });
  if (error) { logError("getVehicles", "vehicles", error); throw error; }
  return data ?? [];
}

export async function createVehicle(payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("vehicles").insert(payload).select("*").single();
  if (error) { logError("createVehicle", "vehicles", error); throw error; }
  return data;
}

export async function updateVehicle(id: string, payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("vehicles").update(payload).eq("id", id).select("*").single();
  if (error) { logError("updateVehicle", "vehicles", error, id); throw error; }
  return data;
}

export async function deleteVehicle(id: string) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { error } = await supabase!.from("vehicles").update({ archived: true }).eq("id", id);
  if (error) { logError("deleteVehicle", "vehicles", error, id); throw error; }
}

// ---------------------------------------------------------------------------
// Customers (public.customers) — staff only
// ---------------------------------------------------------------------------

export async function getCustomers() {
  if (!supabase) throw new Error("Cloud not configured");
  const { data, error } = await supabase.from("customers").select("*").order("name", { ascending: true });
  if (error) { logError("getCustomers", "customers", error); throw error; }
  return data ?? [];
}

export async function createCustomer(payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("customers").insert(payload).select("*").single();
  if (error) { logError("createCustomer", "customers", error); throw error; }
  return data;
}

export async function updateCustomer(id: string, payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("customers").update(payload).eq("id", id).select("*").single();
  if (error) { logError("updateCustomer", "customers", error, id); throw error; }
  return data;
}

export async function deleteCustomer(id: string) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { error } = await supabase!.from("customers").update({ archived: true }).eq("id", id);
  if (error) { logError("deleteCustomer", "customers", error, id); throw error; }
}

// ---------------------------------------------------------------------------
// Media (public.media_assets) — public reads filter published + archived
// ---------------------------------------------------------------------------

export async function getMediaAssets(publishedOnly = true): Promise<Record<string, unknown>[]> {
  const client = publishedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  const table = "media_assets";
  const filter = publishedOnly ? "archived = false and published = true" : "all rows";
  try {
    let base = client.from(table).select("*");
    if (publishedOnly) base = base.eq("archived", false).eq("published", true);
    const { data, error } = await base.order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    logPublicRead("MEDIA", { table, query: `select * where ${filter} order by created_at desc`, filter, recordCount: rows.length });
    return rows;
  } catch (error) {
    logPublicError("MEDIA", error, { table, filter, hint: "Run supabase/cms_global_sync.sql, then confirm anon SELECT is permitted on public.media_assets." });
    throw error;
  }
}

export async function createMediaAsset(payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("media_assets").insert(payload).select("*").single();
  if (error) { logError("createMediaAsset", "media_assets", error); throw error; }
  return data;
}

export async function updateMediaAsset(id: string, payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("media_assets").update(payload).eq("id", id).select("*").single();
  if (error) { logError("updateMediaAsset", "media_assets", error, id); throw error; }
  return data;
}

export async function deleteMediaAsset(id: string) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { error } = await supabase!.from("media_assets").update({ archived: true }).eq("id", id);
  if (error) { logError("deleteMediaAsset", "media_assets", error, id); throw error; }
}

// ---------------------------------------------------------------------------
// Blog (public.blog_posts) — public reads filter published_at is not null
// ---------------------------------------------------------------------------

export async function getBlogPosts(publishedOnly = true): Promise<Record<string, unknown>[]> {
  const client = publishedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  const table = "blog_posts";
  const filter = publishedOnly ? "published_at is not null" : "all rows";
  try {
    let base = client.from(table).select("*");
    if (publishedOnly) base = base.not("published_at", "is", null);
    const { data, error } = await base.order("published_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    logPublicRead("BLOG", { table, query: `select * where ${filter} order by published_at desc nulls last`, filter, recordCount: rows.length });
    return rows;
  } catch (error) {
    logPublicError("BLOG", error, { table, filter, hint: "Run supabase/blog_posts_sync.sql, then confirm anon SELECT is permitted on public.blog_posts." });
    throw error;
  }
}

export async function createBlogPost(payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("blog_posts").insert(payload).select("*").single();
  if (error) { logError("createBlogPost", "blog_posts", error); throw error; }
  return data;
}

export async function updateBlogPost(id: string, payload: Record<string, unknown>) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { data, error } = await supabase!.from("blog_posts").update(payload).eq("id", id).select("*").single();
  if (error) { logError("updateBlogPost", "blog_posts", error, id); throw error; }
  return data;
}

export async function deleteBlogPost(id: string) {
  if (!assertCloud()) throw new Error("Cloud not configured");
  const { error } = await supabase!.from("blog_posts").delete().eq("id", id);
  if (error) { logError("deleteBlogPost", "blog_posts", error, id); throw error; }
}

// ---------------------------------------------------------------------------
// Testimonials (public.testimonials) — public reads filter approved
// ---------------------------------------------------------------------------

export async function getTestimonials(approvedOnly = true): Promise<Record<string, unknown>[]> {
  const client = approvedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  const table = "testimonials";
  const filter = approvedOnly ? "status = 'approved'" : "all rows";
  try {
    let base = client.from(table).select("*");
    if (approvedOnly) base = base.eq("status", "approved");
    const { data, error } = await base.order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    logPublicRead("TESTIMONIALS", { table, query: `select * where ${filter} order by created_at desc`, filter, recordCount: rows.length });
    return rows;
  } catch (error) {
    logPublicError("TESTIMONIALS", error, { table, filter, hint: "Run supabase/testimonials_moderation.sql and testimonials_sources.sql, then confirm anon SELECT is permitted on public.testimonials." });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Bookings (public.bookings) — read helper for admin, write via lib/supabase persistBooking
// ---------------------------------------------------------------------------

export async function getBookings() {
  if (!supabase) throw new Error("Cloud not configured");
  const { data, error } = await supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) { logError("getBookings", "bookings", error); throw error; }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Realtime — single subscription layer (one channel per table family)
// ---------------------------------------------------------------------------

type RealtimeHandler = () => void | Promise<void>;

export function subscribeToCmsTables(handlers: {
  onCmsContent?: (payload: unknown) => void;
  onPackages?: RealtimeHandler;
  onDestinations?: RealtimeHandler;
  onGuides?: RealtimeHandler;
  onVehicles?: RealtimeHandler;
  onCustomers?: RealtimeHandler;
  onMedia?: RealtimeHandler;
  onBlogPosts?: RealtimeHandler;
  onTestimonials?: RealtimeHandler;
  onBookings?: RealtimeHandler;
}) {
  const publicClient = supabasePublic;
  const staffClient = supabase;
  if (!publicClient && !staffClient) return null;

  const client = staffClient ?? publicClient;
  if (!client) return null;

  return client.channel("cms-global-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "cms_content" }, (payload) => handlers.onCmsContent?.(payload.new))
    .on("postgres_changes", { event: "*", schema: "public", table: "packages" }, () => handlers.onPackages?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "destinations" }, () => handlers.onDestinations?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "guides" }, () => handlers.onGuides?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () => handlers.onVehicles?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => handlers.onCustomers?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "media_assets" }, () => handlers.onMedia?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "blog_posts" }, () => handlers.onBlogPosts?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "testimonials" }, () => handlers.onTestimonials?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => handlers.onBookings?.())
    .subscribe();
}
