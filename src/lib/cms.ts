// src/lib/cms.ts
// Central CMS data-access layer — Supabase is the SINGLE source of truth.
// ALL CMS reads and writes go through this module so the pipeline is
// consistent, auditable, and free of localStorage / demo-data fallbacks.
// Public helpers use the ANONYMOUS client (RLS evaluates published=true);
// staff helpers use the AUTHENTICATED client (RLS evaluates is_staff()).

import { supabase, supabasePublic, hasCloudBackend } from "./supabase";

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function assertCloud(): boolean {
  if (!hasCloudBackend) {
    if (import.meta.env.DEV) console.warn("[CMS] Supabase is not configured — operating in demo mode.");
    return false;
  }
  return true;
}

function logError(operation: string, table: string, error: unknown, id?: string) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[CMS] ${operation} failed — table=${table}${id ? ` id=${id}` : ""}: ${msg}`);
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
// Packages (public.packages)
// ---------------------------------------------------------------------------

export async function getPackages(publishedOnly = true) {
  const client = publishedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  let q = client.from("packages").select("*").order("created_at", { ascending: false });
  if (publishedOnly) q = q.eq("published", true);
  const { data, error } = await q;
  if (error) { logError("getPackages", "packages", error); throw error; }
  return data ?? [];
}

export async function getPackageBySlug(slug: string) {
  const client = supabasePublic ?? supabase;
  if (!client) throw new Error("Cloud not configured");
  const { data, error } = await client.from("packages").select("*").eq("slug", slug).single();
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
// Destinations (public.destinations)
// ---------------------------------------------------------------------------

export async function getDestinations(publishedOnly = true) {
  const client = publishedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  let q = client.from("destinations").select("*").order("name", { ascending: true });
  if (publishedOnly) q = q.eq("published", true);
  const { data, error } = await q;
  if (error) { logError("getDestinations", "destinations", error); throw error; }
  return data ?? [];
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
// Guides (public.guides)
// ---------------------------------------------------------------------------

export async function getGuides(activeOnly = true) {
  const client = activeOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  let q = client.from("guides").select("*").order("name", { ascending: true });
  if (activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) { logError("getGuides", "guides", error); throw error; }
  return data ?? [];
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
// Vehicles (public.vehicles)
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
// Customers (public.customers)
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
// Media (public.media_assets)
// ---------------------------------------------------------------------------

export async function getMediaAssets(publishedOnly = true) {
  const client = publishedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  let q = client.from("media_assets").select("*").order("created_at", { ascending: false });
  if (publishedOnly) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) { logError("getMediaAssets", "media_assets", error); throw error; }
  return data ?? [];
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
// Blog (public.blog_posts)
// ---------------------------------------------------------------------------

export async function getBlogPosts(publishedOnly = true) {
  const client = publishedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  let q = client.from("blog_posts").select("*").order("published_at", { ascending: false, nullsFirst: false });
  if (publishedOnly) q = q.not("published_at", "is", null);
  const { data, error } = await q;
  if (error) { logError("getBlogPosts", "blog_posts", error); throw error; }
  return data ?? [];
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
// Testimonials (public.testimonials)
// ---------------------------------------------------------------------------

export async function getTestimonials(approvedOnly = true) {
  const client = approvedOnly ? (supabasePublic ?? supabase) : supabase;
  if (!client) throw new Error("Cloud not configured");
  let q = client.from("testimonials").select("*").order("created_at", { ascending: false });
  if (approvedOnly) q = q.eq("status", "approved");
  const { data, error } = await q;
  if (error) { logError("getTestimonials", "testimonials", error); throw error; }
  return data ?? [];
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

  // Prefer the staff client for the subscription when available, otherwise
  // fall back to the public client. Never create two channels for the same table.
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
