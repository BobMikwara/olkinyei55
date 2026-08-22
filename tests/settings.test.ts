// tests/settings.test.ts
// ---------------------------------------------------------------------------
// End-to-end verification of the CMS Settings save/load system:
//
//   Settings form → store.actions.updateSiteSettings → cloudSaveDocument
//   → Supabase public.cms_content (id = 'site_settings')
//   → loadPublicCmsContent → state.publicSiteSettings
//   → the public website gate (maintenanceMode / comingSoon)
//
// The stub implements the real cms_content surface from
// supabase/cms_content.sql (primary key, id check constraint, jsonb content,
// updated_at trigger, PostgREST upsert semantics), so these tests exercise the
// exact write/read path the deployed bundle runs.
// ---------------------------------------------------------------------------

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { SiteSettings } from "../src/admin/types";

const STUB_PORT = 4697;
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
const ANON_KEY = "eyJzdHViX2xvY2FsX2Fub25fa2V5X2Zvcl9kZXZlbG9wbWVudF9vbmx5";

let stub: ChildProcess | null = null;

async function stubRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${STUB_URL}${path}`, init);
  if (!response.ok) throw new Error(`Stub request failed: ${path} ${response.status}`);
  return (await response.json()) as T;
}

type CmsRow = { id: string; content: unknown; updated_at: string };

async function storedSettings(): Promise<Partial<SiteSettings>> {
  const rows = await stubRequest<CmsRow[]>("/__cms_content");
  const row = rows.find((entry) => entry.id === "site_settings");
  return (row?.content ?? {}) as Partial<SiteSettings>;
}

async function seedSettings(content: Partial<SiteSettings>) {
  await stubRequest("/__cms_content", {
    method: "POST",
    body: JSON.stringify({ id: "site_settings", content }),
  });
}

async function setControl(control: Record<string, boolean>) {
  await stubRequest("/__control", { method: "POST", body: JSON.stringify(control) });
}

type RequestLog = { method: string; table: string; query: Record<string, string> }[];

async function requestLog(): Promise<RequestLog> {
  return stubRequest<RequestLog>("/__requests");
}

/** Boots a fresh store singleton, exactly like a browser page load. */
async function bootStore(env: { url?: string; key?: string } = { url: STUB_URL, key: ANON_KEY }) {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (env.url !== undefined) vi.stubEnv("VITE_SUPABASE_URL", env.url);
  if (env.key !== undefined) vi.stubEnv("VITE_SUPABASE_ANON_KEY", env.key);
  const storeModule = await import("../src/admin/store");
  // Let the bootstrap reads settle (they are fired at module evaluation).
  await settle();
  return storeModule.store;
}

async function settle(ms = 120) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until the predicate passes, so async cloud round trips are observed. */
async function waitFor(check: () => boolean, timeoutMs = 5000, label = "condition") {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

describe("CMS Settings persistence (form → Supabase cms_content → public website)", () => {
  beforeAll(async () => {
    stub = spawn("node", ["scripts/supabase-stub.mjs", String(STUB_PORT)], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
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

  beforeEach(async () => {
    await stubRequest("/__reset", { method: "POST" });
    globalThis.localStorage?.clear();
  });

  it("SAVE — Maintenance mode is written to cms_content and awaited", async () => {
    const store = await bootStore();

    await store.actions.updateSiteSettings({ maintenanceMode: true });

    const saved = await storedSettings();
    expect(saved.maintenanceMode).toBe(true);
    // The whole document is persisted, not just the changed key.
    expect(saved.brandName).toBeTruthy();

    const writes = (await requestLog()).filter((entry) => entry.table === "cms_content" && entry.method !== "GET");
    expect(writes.length).toBeGreaterThan(0);
  });

  it("RELOAD — a fresh CMS page load reads maintenance mode back from the database", async () => {
    await seedSettings({ maintenanceMode: true, brandName: "Olkinyei" });

    const store = await bootStore();
    await waitFor(() => store.getState().siteSettings.maintenanceMode === true, 5000, "staff settings reload");

    expect(store.getState().siteSettings.maintenanceMode).toBe(true);
  });

  it("PUBLIC — maintenance mode reaches publicSiteSettings for the website gate", async () => {
    const store = await bootStore();
    expect(store.getState().publicSiteSettings.maintenanceMode).toBe(false);

    await store.actions.updateSiteSettings({ maintenanceMode: true });
    await waitFor(() => store.getState().publicSiteSettings.maintenanceMode === true, 5000, "public gate");

    expect(store.getState().publicSiteSettings.maintenanceMode).toBe(true);
  });

  it("DISABLE — turning maintenance mode off persists false, not a dropped key", async () => {
    await seedSettings({ maintenanceMode: true });
    const store = await bootStore();
    await waitFor(() => store.getState().siteSettings.maintenanceMode === true, 5000, "seeded maintenance mode");

    await store.actions.updateSiteSettings({ maintenanceMode: false });

    const saved = await storedSettings();
    expect(saved.maintenanceMode).toBe(false);
    await waitFor(() => store.getState().publicSiteSettings.maintenanceMode === false, 5000, "public gate cleared");
  });

  it("COMING SOON — enables, persists across a reload, and disables again", async () => {
    const store = await bootStore();
    await store.actions.updateSiteSettings({ comingSoon: true });
    expect((await storedSettings()).comingSoon).toBe(true);
    await waitFor(() => store.getState().publicSiteSettings.comingSoon === true, 5000, "coming soon gate");

    const reloaded = await bootStore();
    await waitFor(() => reloaded.getState().siteSettings.comingSoon === true, 5000, "coming soon after reload");

    await reloaded.actions.updateSiteSettings({ comingSoon: false });
    expect((await storedSettings()).comingSoon).toBe(false);
    await waitFor(() => reloaded.getState().publicSiteSettings.comingSoon === false, 5000, "coming soon cleared");
  });

  it("OTHER SETTINGS — logo, contact, analytics and site information round trip", async () => {
    const store = await bootStore();

    await store.actions.updateSiteSettings({
      brandName: "Olkinyei Expeditions",
      tagline: "Considered journeys",
      logo: "https://cdn.example.com/logo.svg",
      contactEmail: "journeys@olkinyei.test",
      reservationsEmail: "reservations@olkinyei.test",
      phone: "+255 700 000 001",
      whatsapp: "+255 700 000 002",
      primaryColor: "#20251e",
      analytics: { ga4: "G-TEST123", gtm: "GTM-TEST", fbPixel: "9876543210", clarity: "clr-test" },
    });

    const saved = await storedSettings();
    expect(saved.brandName).toBe("Olkinyei Expeditions");
    expect(saved.logo).toBe("https://cdn.example.com/logo.svg");
    expect(saved.contactEmail).toBe("journeys@olkinyei.test");
    expect(saved.reservationsEmail).toBe("reservations@olkinyei.test");
    expect(saved.phone).toBe("+255 700 000 001");
    expect(saved.whatsapp).toBe("+255 700 000 002");
    expect(saved.primaryColor).toBe("#20251e");
    expect(saved.analytics?.ga4).toBe("G-TEST123");

    const reloaded = await bootStore();
    await waitFor(() => reloaded.getState().publicSiteSettings.contactEmail === "journeys@olkinyei.test", 5000, "public contact email");
    expect(reloaded.getState().publicSiteSettings.analytics.ga4).toBe("G-TEST123");
    expect(reloaded.getState().siteSettings.logo).toBe("https://cdn.example.com/logo.svg");
  });

  it("ERROR SURFACING — a rejected write reports the failure instead of a success toast", async () => {
    const store = await bootStore();
    await setControl({ failCmsWrite: true });

    await expect(store.actions.updateSiteSettings({ maintenanceMode: true })).rejects.toThrow();

    const notifications = store.getState().notifications;
    expect(notifications.some((entry) => entry.type === "error")).toBe(true);
    expect(notifications.some((entry) => entry.type === "success")).toBe(false);
    expect((await storedSettings()).maintenanceMode).toBeUndefined();

    await setControl({ failCmsWrite: false });
  });

  it("UNCONFIGURED — with no Supabase backend the save reports the misconfiguration", async () => {
    const store = await bootStore({ url: "", key: "" });

    await expect(store.actions.updateSiteSettings({ maintenanceMode: true })).rejects.toThrow();
    const notifications = store.getState().notifications;
    expect(notifications.some((entry) => entry.type === "error")).toBe(true);
    expect(notifications.some((entry) => entry.type === "success")).toBe(false);
  });
});
