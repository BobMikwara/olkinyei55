// @vitest-environment jsdom
// tests/settings-ui.test.tsx
// ---------------------------------------------------------------------------
// Browser-level verification of the CMS Settings screen against the Supabase
// REST stub, using the exact components the production bundle ships:
//
//   render Settings → toggle Maintenance mode → click "Save changes"
//   → row written to cms_content → public website renders the closed screen
//   → reload the CMS → the toggle is still on
//   → disable → save → the public website is normal again
//
// It also covers the two defects that made Settings look broken:
//   * the form was seeded once, before cms_content finished loading, so it
//     showed (and re-saved) stale defaults;
//   * a failed save reported success and left no visible error.
// ---------------------------------------------------------------------------

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";

const STUB_PORT = 4694;
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
const ANON_KEY = "eyJzdHViX2xvY2FsX2Fub25fa2V5X2Zvcl9kZXZlbG9wbWVudF9vbmx5";

let stub: ChildProcess | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function stubRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${STUB_URL}${path}`, init);
  if (!response.ok) throw new Error(`Stub request failed: ${path} ${response.status}`);
  return (await response.json()) as T;
}

type CmsRow = { id: string; content: Record<string, unknown> };

async function storedSettings(): Promise<Record<string, unknown>> {
  const rows = await stubRequest<CmsRow[]>("/__cms_content");
  return rows.find((row) => row.id === "site_settings")?.content ?? {};
}

async function seedSettings(content: Record<string, unknown>) {
  await stubRequest("/__cms_content", { method: "POST", body: JSON.stringify({ id: "site_settings", content }) });
}

async function renderApp(element: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(element); });
  return container;
}

async function unmount() {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  container = null;
}

async function tick(ms = 60) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function waitUntil(check: () => boolean, timeoutMs = 8000, label = "condition") {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await tick();
    if (check()) return;
  }
  throw new Error(`Timed out waiting for ${label}.\nDOM:\n${container?.textContent?.slice(0, 1000) ?? "(empty)"}`);
}

/** The Maintenance mode / Coming soon checkboxes on the Advanced tab. */
function toggles(): HTMLInputElement[] {
  return [...(container?.querySelectorAll('input[type="checkbox"]') ?? [])] as HTMLInputElement[];
}

function buttonByText(text: string): HTMLButtonElement | null {
  return [...(container?.querySelectorAll("button") ?? [])].find((node) => node.textContent?.includes(text)) as HTMLButtonElement ?? null;
}

/**
 * Flips a checkbox the way a user does. React installs a value tracker on the
 * DOM node, so assigning `checked` directly is de-duplicated and the change
 * event is ignored; the native setter must be used to update the tracker.
 */
async function setChecked(node: HTMLInputElement, checked: boolean) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "checked")!.set!;
  await act(async () => {
    setter.call(node, checked);
    node.dispatchEvent(new Event("click", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(node: HTMLElement | null) {
  if (!node) throw new Error("Cannot click a missing element.");
  await act(async () => { node.click(); });
}

async function openAdvancedTab() {
  await click(buttonByText("advanced"));
  await tick();
}

/** Mounts the real Settings screen the CMS renders. */
async function mountSettings() {
  const { SettingsManager } = await import("../src/admin/AdminApp");
  const { store } = await import("../src/admin/store");
  await renderApp(<SettingsManager />);
  await tick();
  return store;
}

/** Mounts the real public website entry point. */
async function mountPublicSite() {
  const App = (await import("../src/App")).default;
  await renderApp(<App />);
  await tick();
}

describe("CMS Settings screen (form → save → database → public website)", () => {
  beforeAll(async () => {
    stub = spawn("node", ["scripts/supabase-stub.mjs", String(STUB_PORT)], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try { await fetch(`${STUB_URL}/__requests`); break; } catch { await new Promise((r) => setTimeout(r, 150)); }
    }
    vi.stubEnv("VITE_SUPABASE_URL", STUB_URL);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", ANON_KEY);
  });

  afterAll(async () => {
    await unmount();
    stub?.kill("SIGTERM");
  });

  beforeEach(async () => {
    await unmount();
    await stubRequest("/__reset", { method: "POST" });
    window.localStorage.clear();
    vi.resetModules();
  });

  it("STALE FORM — the form adopts settings that arrive from the database after mount", async () => {
    await seedSettings({ brandName: "Loaded From Database", maintenanceMode: true });
    await mountSettings();

    // The brand field must show the database value, not the bundled default.
    await waitUntil(
      () => [...(container?.querySelectorAll("input") ?? [])].some((node) => (node as HTMLInputElement).value === "Loaded From Database"),
      8000,
      "brand name loaded from the database",
    );

    await openAdvancedTab();
    expect(toggles()[0]?.checked).toBe(true);
  });

  it("MAINTENANCE MODE — enable, save, persist, and gate the public website", async () => {
    const store = await mountSettings();
    await openAdvancedTab();

    const maintenance = toggles()[0];
    expect(maintenance.checked).toBe(false);
    await setChecked(maintenance, true);
    await click(buttonByText("Save"));
    await waitUntil(() => store.getState().publicSiteSettings.maintenanceMode === true, 8000, "public settings updated");

    // 1. It reached the database.
    expect((await storedSettings()).maintenanceMode).toBe(true);
    // 2. No error was raised.
    expect(container?.textContent).not.toContain("Settings were not saved");
    // 3. The public website is gated.
    await unmount();
    await mountPublicSite();
    await waitUntil(() => Boolean(container?.textContent?.includes("TEMPORARILY CLOSED")), 8000, "maintenance screen");
  });

  it("REFRESH — a fresh CMS load still shows maintenance mode enabled", async () => {
    await seedSettings({ maintenanceMode: true });
    await mountSettings();
    await openAdvancedTab();
    await waitUntil(() => toggles()[0]?.checked === true, 8000, "maintenance toggle restored after reload");
  });

  it("DISABLE — turning maintenance mode off returns the public website to normal", async () => {
    await seedSettings({ maintenanceMode: true });
    const store = await mountSettings();
    await openAdvancedTab();
    await waitUntil(() => toggles()[0]?.checked === true, 8000, "seeded maintenance mode");

    await setChecked(toggles()[0], false);
    await click(buttonByText("Save"));
    await waitUntil(() => store.getState().publicSiteSettings.maintenanceMode === false, 8000, "public gate cleared");

    expect((await storedSettings()).maintenanceMode).toBe(false);
    await unmount();
    await mountPublicSite();
    await waitUntil(() => !container?.textContent?.includes("TEMPORARILY CLOSED"), 8000, "normal website");
  });

  it("COMING SOON — enable, save, and gate the public website", async () => {
    const store = await mountSettings();
    await openAdvancedTab();

    await setChecked(toggles()[1], true);
    await click(buttonByText("Save"));
    await waitUntil(() => store.getState().publicSiteSettings.comingSoon === true, 8000, "coming soon published");

    expect((await storedSettings()).comingSoon).toBe(true);
    await unmount();
    await mountPublicSite();
    await waitUntil(() => Boolean(container?.textContent?.includes("OPENING SOON")), 8000, "coming soon screen");
  });

  it("ERROR VISIBILITY — a rejected save shows an on-screen error, not a success", async () => {
    const store = await mountSettings();
    await openAdvancedTab();
    await stubRequest("/__control", { method: "POST", body: JSON.stringify({ failCmsWrite: true }) });

    await setChecked(toggles()[0], true);
    await click(buttonByText("Save"));
    await waitUntil(() => Boolean(container?.textContent?.includes("Settings were not saved")), 8000, "visible save error");

    expect(container?.textContent).toContain("row-level security");
    // Nothing was written, and the optimistic value was rolled back.
    expect((await storedSettings()).maintenanceMode).toBeUndefined();
    expect(store.getState().siteSettings.maintenanceMode).toBe(false);

    await stubRequest("/__control", { method: "POST", body: JSON.stringify({ failCmsWrite: false }) });
  });

  it("RECOVERY — a save that follows a failed save still reaches the database", async () => {
    const store = await mountSettings();
    await openAdvancedTab();
    await stubRequest("/__control", { method: "POST", body: JSON.stringify({ failCmsWrite: true }) });

    await setChecked(toggles()[0], true);
    await click(buttonByText("Save"));
    await waitUntil(() => Boolean(container?.textContent?.includes("Settings were not saved")), 8000, "first save fails");

    // The queue must not stay poisoned by the rejected save.
    await stubRequest("/__control", { method: "POST", body: JSON.stringify({ failCmsWrite: false }) });
    await click(buttonByText("Save"));
    await waitUntil(() => store.getState().publicSiteSettings.maintenanceMode === true, 8000, "retry succeeds");

    expect((await storedSettings()).maintenanceMode).toBe(true);
  });

  it("OTHER SETTINGS — a brand edit saves and reaches the public website", async () => {
    const store = await mountSettings();
    const brandInput = [...(container?.querySelectorAll("input") ?? [])][0] as HTMLInputElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(brandInput, "Olkinyei Expeditions Ltd");
      brandInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonByText("Save"));
    await waitUntil(() => store.getState().publicSiteSettings.brandName === "Olkinyei Expeditions Ltd", 8000, "brand published");

    expect((await storedSettings()).brandName).toBe("Olkinyei Expeditions Ltd");
  });
});
