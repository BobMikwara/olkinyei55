// src/lib/packageModel.ts
// ---------------------------------------------------------------------------
// THE single frontend package model.
//
// Every safari package the PUBLIC website renders — listing cards, the
// redesigned full-page details, More Journeys, the booking form — flows
// through this module. Both entry points (the listing query on
// `public.packages` and the details-page by-slug query on `public.packages`)
// converge on the exact same `Safari` shape, so a card and its details page
// can never interpret the same Supabase row differently.
//
//   Supabase row (public.packages)
//        ↓
//   packageRowToSafari() / safariPackageToSafari()
//        ↓
//   Safari (frontend model)
//        ↓
//   Cards → Details page → More Journeys → Booking CTA
//
// Field mapping (existing database → frontend model), nothing invented:
//   hero_image → image            gallery       → gallery
//   price_usd  → price            description   → description
//   published  → published        archived      → archived
// ---------------------------------------------------------------------------

import type { Safari } from "../data";
import type { SafariPackage } from "../admin/types";

/** Raw `public.packages` row as returned by the Supabase REST API. */
export type DbPackageRow = {
  id: string;
  slug: string;
  title: string;
  region: string;
  duration: string;
  nights?: number | null;
  price_usd?: number | null;
  price?: number | null;
  discount?: number | null;
  hero_image?: string | null;
  image?: string | null;
  gallery?: unknown;
  summary?: string | null;
  description?: string | null;
  signature?: string | null;
  highlights?: unknown;
  included?: unknown;
  excluded?: unknown;
  availability?: unknown;
  country?: unknown;
  parks?: unknown;
  wildlife?: unknown;
  difficulty?: string | null;
  tags?: unknown;
  featured?: boolean | null;
  published?: boolean | null;
  archived?: boolean | null;
  coordinates?: [number, number] | null;
  seo_title?: string | null;
  seo_description?: string | null;
  publish_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

/** Coerce jsonb / text[] / newline strings into a clean string array. */
export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch { /* treat as a delimited list */ }
    return trimmed.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

/** The database stores the price in `price_usd` (older rows may use `price`). */
export function packagePriceFromRow(row: DbPackageRow): number {
  const raw = row.price_usd ?? row.price ?? 0;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Normalizes a raw Supabase row into the public `Safari` model.
 * Optional fields degrade gracefully — a missing image/gallery/description
 * must never make an otherwise-valid published package disappear.
 */
export function packageRowToSafari(row: DbPackageRow): Safari {
  const image = String(row.hero_image ?? row.image ?? "").trim();
  const gallery = asStringArray(row.gallery).filter((url) => url.trim().length > 0);
  const summary = String(row.summary ?? "").trim();
  const description = String(row.description ?? "").trim();
  const signature = String(row.signature ?? "").trim();
  const title = String(row.title ?? "").trim();
  const slug = String(row.slug ?? "").trim() || row.id;
  return {
    id: slug || row.id,
    slug,
    title,
    region: String(row.region ?? "").trim(),
    duration: String(row.duration ?? "").trim(),
    nights: Number(row.nights ?? 0) || 0,
    price: packagePriceFromRow(row),
    image,
    gallery: gallery.length > 0 ? gallery : (image ? [image] : []),
    summary,
    description: description || summary,
    signature,
    highlights: asStringArray(row.highlights),
    included: asStringArray(row.included),
    excluded: asStringArray(row.excluded),
    availability: asStringArray(row.availability),
    coordinates: (Array.isArray(row.coordinates) && row.coordinates.length === 2
      ? [Number(row.coordinates[0]) || 0, Number(row.coordinates[1]) || 0]
      : [0, 0]) as [number, number],
    country: asStringArray(row.country) as Safari["country"],
    parks: asStringArray(row.parks),
    wildlife: asStringArray(row.wildlife),
    tags: asStringArray(row.tags),
    featured: Boolean(row.featured),
    seo: {
      title: String(row.seo_title ?? "").trim() || title,
      description: String(row.seo_description ?? "").trim() || summary,
    },
  };
}

/**
 * Normalizes the admin-store `SafariPackage` model into the public `Safari`
 * model — the same destination shape as `packageRowToSafari`, so the listing
 * and the details page always agree.
 */
export function safariPackageToSafari(pkg: SafariPackage): Safari {
  const image = String(pkg.image ?? "").trim();
  const gallery = (pkg.gallery ?? []).filter((url) => url.trim().length > 0);
  const summary = String(pkg.summary ?? "").trim();
  const description = String(pkg.description ?? "").trim();
  const slug = String(pkg.slug ?? "").trim() || pkg.id;
  return {
    id: slug || pkg.id,
    slug,
    title: pkg.title,
    region: pkg.region,
    duration: pkg.duration,
    nights: Number(pkg.nights ?? 0) || 0,
    price: Number(pkg.price) || 0,
    image,
    gallery: gallery.length > 0 ? gallery : (image ? [image] : []),
    summary,
    description: description || summary,
    signature: String(pkg.signature ?? "").trim(),
    highlights: [...(pkg.highlights ?? [])],
    included: [...(pkg.included ?? [])],
    excluded: [...(pkg.excluded ?? [])],
    availability: [...(pkg.availability ?? [])],
    coordinates: pkg.coordinates,
    country: pkg.country ? [...pkg.country] : undefined,
    parks: pkg.parks ? [...pkg.parks] : undefined,
    wildlife: pkg.wildlife ? [...pkg.wildlife] : undefined,
    tags: pkg.tags ? [...pkg.tags] : undefined,
    featured: Boolean(pkg.featured),
    seo: pkg.seo
      ? { title: pkg.seo.title || pkg.title, description: pkg.seo.description || summary }
      : { title: pkg.title, description: summary },
  };
}

/** Minimal identity a package needs before it can be shown or linked. */
export function hasSafariIdentity(safari: Safari): boolean {
  return Boolean(safari.title && (safari.slug || safari.id));
}
