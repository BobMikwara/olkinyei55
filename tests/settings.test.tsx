// @vitest-environment jsdom
// tests/settings.test.tsx
// ---------------------------------------------------------------------------
// End-to-end verification of the CMS Settings persistence flow:
//
//   Supabase (stub cms_content) → store loadCloudCmsContent
//   → SettingsManager form (async load / refresh)
//   → store.actions.updateSiteSettings → cloudSaveDocument upsert
//   → public cms_content read → publicSiteSettings
//
// The stub speaks the same PostgREST surface as production for the
// `cms_content` document table (GET + POST upsert + RLS-style failures).
// ---------------------------------------------------------------------------

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";

const STUB_PORT = 4697;
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
const ANON_KEY = "eyJzdHViX2xvY2FsX2Fub25fa2V5X2Zvcl9kZXZlbG9wbWVudF9vbmx5";

let stub: ChildProcess | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;
let store: typeof import("../src/admin/store")["store"] | null = null;
let SettingsManager: typeof import("../src/admin/AdminApp")["SettingsManager"] | null = null;

async function stubRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${STUB_URL}${path}`, init);
  if (!response.ok) throw new Error(`Stub request failed: ${path} ${response.status}`);
  return (await response.json()) as T;
}

async function setFailCms(failCms: boolean) {
  await stubRequest("/__control", {
    method: "POST",
    body: JSON.stringify({ failCms }),
  });
}

async function loadAppModules() {
  vi.resetModules();
  const [storeModule, admin] = await Promise.all([
    import("../src/admin/store"),
    import("../src/admin/AdminApp"),
  ]);
  store = storeModule.store;
  SettingsManager = admin.SettingsManager;
  // The store singleton starts unauthenticated in tests. Sign in as the bundled
  // super admin so the action-level settings permission check passes.
  store!.getState().currentUserId = "u1";
  return store;
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition");
}

async function renderApp(element: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
  return container;
}

async function clickAdvancedTab() {
  const tab = Array.from(container!.querySelectorAll("button"))
    .find((button) => button.textContent?.trim().toLowerCase() === "advanced");
  expect(tab).toBeDefined();
  await act(async () => {
    tab!.click();
  });
}

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
  await stubRequest("/__reset", { method: "POST" });

  // Environment must be set BEFORE the app modules are imported.
  vi.stubEnv("VITE_SUPABASE_URL", STUB_URL);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", ANON_KEY);
  window.localStorage.clear();

  store = await loadAppModules();
  await waitFor(() => store!.getState().siteSettings.maintenanceMode === true);
});

afterAll(() => {
  stub?.kill("SIGTERM");
});

describe("CMS Settings persistence (Supabase cms_content → store → public)", () => {
  it("loads persisted site settings into both the CMS and the public website", async () => {
    const state = store!.getState();
    expect(state.siteSettings.maintenanceMode).toBe(true);
    expect(state.siteSettings.comingSoon).toBe(false);
    expect(state.publicSiteSettings.maintenanceMode).toBe(true);
    expect(state.publicSiteSettings.contactEmail).toBe("journeys@olkinyei.com");
  });

  it("saves a settings change and reloads it after a fresh CMS bootstrap", async () => {
    const ok = await store!.actions.updateSiteSettings({ maintenanceMode: false, comingSoon: true });
    expect(ok).toBe(true);

    let state = store!.getState();
    expect(state.siteSettings.maintenanceMode).toBe(false);
    expect(state.siteSettings.comingSoon).toBe(true);
    // The save also refreshes the public website slice so the gate applies.
    expect(state.publicSiteSettings.maintenanceMode).toBe(false);
    expect(state.publicSiteSettings.comingSoon).toBe(true);

    // Simulate a CMS refresh: reset modules and re-bootstrap from Supabase.
    const reloaded = await loadAppModules();
    await waitFor(() => reloaded!.getState().siteSettings.comingSoon === true);
    state = reloaded!.getState();
    expect(state.siteSettings.maintenanceMode).toBe(false);
    expect(state.siteSettings.comingSoon).toBe(true);
    expect(state.publicSiteSettings.maintenanceMode).toBe(false);
    expect(state.publicSiteSettings.comingSoon).toBe(true);
  });

  it("does not poison the save queue after a failed write", async () => {
    const before = store!.getState().siteSettings.maintenanceMode;
    await setFailCms(true);
    const failed = await store!.actions.updateSiteSettings({ maintenanceMode: !before });
    expect(failed).toBe(false);
    // The optimistic local change is rolled back on a rejected database write.
    expect(store!.getState().siteSettings.maintenanceMode).toBe(before);

    // A later save must still work (a rejected save cannot block future saves).
    await setFailCms(false);
    const ok = await store!.actions.updateSiteSettings({ maintenanceMode: !before });
    expect(ok).toBe(true);
    expect(store!.getState().siteSettings.maintenanceMode).toBe(!before);
  });

  it("syncs the Settings form with persisted values after the async DB load / refresh", async () => {
    // New fresh module stack so the form mounts before/while the DB loads.
    const fresh = await loadAppModules();
    await renderApp(<SettingsManager />);
    await clickAdvancedTab();

    // The DB document in the stub has maintenanceMode=true. Even though the
    // form initially mounted with the seed state, the async loading path must
    // populate the persisted value back into the UI.
    await waitFor(() => {
      const checkbox = container!.querySelector("input[type='checkbox']");
      return checkbox instanceof HTMLInputElement && checkbox.checked === true;
    });
    const maintenance = container!.querySelector<HTMLInputElement>("input[type='checkbox']");
    expect(maintenance?.checked).toBe(true);

    // A persisted change (e.g. a save or another device update) after the form
    // is clean must refresh the displayed switch without manually resetting it.
    const ok = await fresh!.actions.updateSiteSettings({ maintenanceMode: false });
    expect(ok).toBe(true);
    await waitFor(() => {
      const checkbox = container!.querySelector<HTMLInputElement>("input[type='checkbox']");
      return checkbox instanceof HTMLInputElement && checkbox.checked === false;
    });
    expect(container!.querySelector<HTMLInputElement>("input[type='checkbox']")?.checked).toBe(false);
  });
});
