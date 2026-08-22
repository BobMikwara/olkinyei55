// tests/dataflow.test.ts
// ---------------------------------------------------------------------------
// End-to-end verification of the safari package data flow WITHOUT a browser:
//
//   Supabase (stub) → store loadPublicPackages → publicPackages (SafariPackage)
//   → packageRowToSafari/safariPackageToSafari → Safari model
//   → getPackageBySlug (details page query)
//
// The stub implements the real Supabase REST surface (filters, ordering, RLS-
// style 500s) against the REAL production schema, so these tests exercise the
// exact read path the Vercel bundle runs.
// ---------------------------------------------------------------------------

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

const STUB_PORT = 4699;
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
const ANON_KEY = "eyJzdHViX2xvY2FsX2Fub25fa2V5X2Zvcl9kZXZlbG9wbWVudF9vbmx5";

let stub: ChildProcess | null = null;

async function stubRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${STUB_URL}${path}`, init);
  if (!response.ok) throw new Error(`Stub request failed: ${path} ${response.status}`);
  return (await response.json()) as T;
}

async function setFailMode(failPackages: boolean) {
  await stubRequest("/__control", { method: "POST", body: JSON.stringify({ failPackages }) });
}

type RequestLog = { method: string; table: string; query: Record<string, string> }[];

async function requestLog(): Promise<RequestLog> {
  return stubRequest<RequestLog>("/__requests");
}

/** Loads the app modules with the given env, returning fresh singletons. */
async function loadAppModules(env: { url?: string; key?: string }) {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (env.url !== undefined) vi.stubEnv("VITE_SUPABASE_URL", env.url);
  if (env.key !== undefined) vi.stubEnv("VITE_SUPABASE_ANON_KEY", env.key);
  const [storeModule, cms, model] = await Promise.all([
    import("../src/admin/store"),
    import("../src/lib/cms"),
    import("../src/lib/packageModel"),
  ]);
  // The store singleton lives on the module's `store` export.
  return { store: storeModule.store, cms, model };
}

describe("Safari packages data flow (Supabase → listing → details)", () => {
  beforeAll(async () => {
    stub = spawn("node", ["scripts/supabase-stub.mjs", String(STUB_PORT)], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Wait for the stub to come up.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        await fetch(`${STUB_URL}/__requests`);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
  });

  afterAll(() => {
    stub?.kill("SIGTERM");
  });

  it("TEST 1 — listing query: requests published packages only, with the canonical filter", async () => {
    await stubRequest("/__reset", { method: "POST" });
    const { store } = await loadAppModules({ url: STUB_URL, key: ANON_KEY });

    await store.refreshPublicPackages();

    const log = await requestLog();
    const packageRequests = log.filter((entry) => entry.table === "packages");
    expect(packageRequests.length).toBeGreaterThan(0);
    // The exact publication filter the CMS data model defines — the PUBLIC
    // listing query must carry `published=eq.true` (the staff query has no
    // filter, which is correct, and must not be confused with the public one).
    const publicListing = packageRequests.find((entry) => entry.query.published !== undefined);
    expect(publicListing).toBeDefined();
    expect(publicListing!.query.published).toBe("eq.true");
    expect(publicListing!.query.select).toBe("*");
    expect(publicListing!.query.order).toBe("created_at.desc");

    // RLS-equivalent filtering in the stub leaves 4 published, non-archived rows.
    const state = store.getState();
    expect(state.publicPackages).toHaveLength(4);
    expect(state.publicPackagesStatus).toBe("success");
    expect(state.publicPackages.map((p) => p.slug).sort()).toEqual([
      "big-five-unhurried",
      "lodges-beyond-the-wild",
      "the-family-bush",
      "the-great-migration",
    ]);
    // Draft and archived rows must never surface.
    expect(state.publicPackages.some((p) => p.slug === "under-canvas-draft")).toBe(false);
    expect(state.publicPackages.some((p) => p.slug === "old-rift-walk")).toBe(false);
  });

  it("TEST 2 — normalizer maps the existing database columns to the frontend model", async () => {
    const { store, model } = await loadAppModules({ url: STUB_URL, key: ANON_KEY });
    await store.refreshPublicPackages();

    const migration = store.getState().publicPackages.find((p) => p.slug === "the-great-migration")!;
    const safari = model.safariPackageToSafari(migration);
    expect(safari.title).toBe("The Great Migration");
    expect(safari.slug).toBe("the-great-migration");
    expect(safari.image).toContain("pexels-photo-5521703");      // hero_image → image
    expect(safari.price).toBe(8450);                              // price_usd → price
    expect(safari.gallery).toHaveLength(3);                       // gallery jsonb → string[]
    expect(safari.highlights).toHaveLength(3);
    expect(safari.included.length).toBeGreaterThan(0);
    expect(safari.excluded.length).toBeGreaterThan(0);
    expect(safari.availability).toContain("Jul");

    // A row with no description still renders (summary fallback)…
    const bigFive = store.getState().publicPackages.find((p) => p.slug === "big-five-unhurried")!;
    const bigFiveSafari = model.safariPackageToSafari(bigFive);
    expect(bigFiveSafari.description).toBe(bigFiveSafari.summary);

    // …and a package with almost no optional fields still exists as a model.
    const lodges = store.getState().publicPackages.find((p) => p.slug === "lodges-beyond-the-wild")!;
    const lodgesSafari = model.safariPackageToSafari(lodges);
    expect(lodgesSafari.title).toBe("Lodges Beyond the Wild");
    expect(lodgesSafari.image).toContain("pexels-photo-37790193");
    expect(model.hasSafariIdentity(lodgesSafari)).toBe(true);
  });

  it("TEST 3 — details query follows the slug: getPackageBySlug selects the matching published package only", async () => {
    await stubRequest("/__reset", { method: "POST" });
    const { cms } = await loadAppModules({ url: STUB_URL, key: ANON_KEY });

    const row = await cms.getPackageBySlug("big-five-unhurried");
    expect(row).not.toBeNull();
    expect((row as { title: string }).title).toBe("Big Five, Unhurried");

    // Wrong / unknown slug → null (not-found), never another package.
    const missing = await cms.getPackageBySlug("does-not-exist");
    expect(missing).toBeNull();

    // A draft row exists in the CMS but the public query must not return it.
    const draft = await cms.getPackageBySlug("under-canvas-draft");
    expect(draft).toBeNull();

    const log = await requestLog();
    const detailRequests = log.filter((entry) => entry.query?.slug);
    expect(detailRequests.length).toBeGreaterThan(0);
    for (const entry of detailRequests) {
      expect(entry.query.published).toBe("eq.true");
    }
  });

  it("TEST 4 — a failed read surfaces an error state; never fake data, never []", async () => {
    await setFailMode(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const { store } = await loadAppModules({ url: STUB_URL, key: ANON_KEY });

    await store.refreshPublicPackages();

    const state = store.getState();
    expect(state.publicPackagesStatus).toBe("error");
    expect(state.publicPackagesError).toContain("permission denied");
    // The UI must not be left with seed/demo packages as a substitute.
    expect(state.publicPackages).toHaveLength(0);

    // The failure is exposed in development logging, not swallowed.
    const logged = JSON.stringify([...consoleError.mock.calls, ...consoleLog.mock.calls]);
    expect(logged).toContain("SAFARIS");
    expect(logged).toContain("request-started");

    consoleError.mockRestore();
    consoleLog.mockRestore();
    await setFailMode(false);
  });

  it("TEST 5 — recovery: after the read path heals, the retry returns the real packages", async () => {
    await setFailMode(true);
    const { store } = await loadAppModules({ url: STUB_URL, key: ANON_KEY });

    await store.refreshPublicPackages(); // fails
    const failed = store.getState();
    expect(failed.publicPackagesStatus).toBe("error");
    expect(failed.publicPackages).toHaveLength(0);

    // Heal the backend and retry through the same public entry point the
    // retry button and the focus/visibility self-heal both use.
    await setFailMode(false);
    await store.refreshPublicPackages();
    const state = store.getState();
    expect(state.publicPackagesStatus).toBe("success");
    expect(state.publicPackages).toHaveLength(4);
  });

  it("TEST 6 — an unconfigured build shows NO fake packages (no localStorage/seed fallback)", async () => {
    const { store } = await loadAppModules({ url: "", key: "" });

    const state = store.getState();
    // In this mode the public site must render the "Supabase not configured"
    // diagnostic — the public package slice is empty, never the seed arrays.
    expect(state.publicPackages).toHaveLength(0);
    expect(state.publicPackagesStatus).toBe("unconfigured");
  });
});
