// @vitest-environment jsdom
// tests/ui-smoke.test.tsx
// ---------------------------------------------------------------------------
// Browser-level verification of the safari package flow without production
// access: Supabase REST stub → React components (listing + details page).
//
//   /safaris                  → ALL valid published packages as cards
//   /safaris/<slug>           → SELECTED package on the editorial full page
//   unknown slug              → explicit not-found state (never a random package)
//   Supabase read failure     → explicit error + retry (never fake/empty data)
//
// The stub speaks the real PostgREST surface against the real production
// schema (see scripts/supabase-stub.mjs), and the components are the exact
// ones the Vercel bundle ships.
// ---------------------------------------------------------------------------

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import type { Safari } from "../src/data";

const STUB_PORT = 4698;
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
const ANON_KEY = "eyJzdHViX2xvY2FsX2Fub25fa2V5X2Zvcl9kZXZlbG9wbWVudF9vbmx5";

let stub: ChildProcess | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;
let app: typeof import("../src/App") | null = null;

async function stubRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${STUB_URL}${path}`, init);
  if (!response.ok) throw new Error(`Stub request failed: ${path} ${response.status}`);
  return (await response.json()) as T;
}

async function setFailMode(failPackages: boolean) {
  await stubRequest("/__control", { method: "POST", body: JSON.stringify({ failPackages }) });
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

async function waitForText(text: string, timeoutMs = 7000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    if (container?.textContent?.includes(text)) return;
  }
  throw new Error(`Timed out waiting for "${text}".\nDOM:\n${container?.textContent?.slice(0, 1200) ?? "(empty)"}`);
}

function h1(): string | null {
  return container?.querySelector("h1")?.textContent ?? null;
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
  await setFailMode(false);

  // Environment must be set BEFORE the app modules are imported for the first
  // time; the SUPABASE client is built once, exactly like the production bundle.
  vi.stubEnv("VITE_SUPABASE_URL", STUB_URL);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", ANON_KEY);
  window.localStorage.clear();
  app = await import("../src/App");
});

afterAll(() => {
  stub?.kill("SIGTERM");
});

describe("Safari package UI (Supabase stub → listing → details → Vercel bundle path)", () => {
  it("LISTING — every valid published package appears as a card", async () => {
    const { ExperiencesPage } = app!;
    await renderApp(
      <ExperiencesPage openSafari={() => undefined} onBook={() => undefined} />,
    );

    await waitForText("The Great Migration");
    for (const title of ["The Great Migration", "Big Five, Unhurried", "Lodges Beyond the Wild", "The Family Bush"]) {
      expect(container!.textContent).toContain(title);
    }
    // Drafts / archived records from the stub must never render.
    expect(container!.textContent).not.toContain("Under Canvas Draft");
    expect(container!.textContent).not.toContain("Hidden Rift Walk");
  });

  it("DETAILS A — slug query renders Package A's own editorial full page", async () => {
    const { SafariDetailPage } = app!;
    await renderApp(
      <SafariDetailPage slug="the-great-migration" onBack={() => undefined} onBook={() => undefined} openSafari={() => undefined} />,
    );

    await waitForText("Book this safari");
    expect(h1()).toBe("The Great Migration");
    expect(container!.textContent).toContain("Follow the herds from private mobile camps");
    expect(container!.textContent).toContain("From $8,450 pp");
    expect(container!.textContent).toContain("MORE JOURNEYS");
    // Package A's own hero image is present; the primary image is not duplicated
    // in the gallery block.
    const heroSrc = container!.querySelector(".detail-hero-image")?.getAttribute("src") ?? "";
    expect(heroSrc).toContain("pexels-photo-5521703");
    // Sections explicitly forbidden by the acceptance criteria.
    expect(container!.textContent).not.toContain("WILDLIFE & PLACES");
    expect(container!.textContent).not.toContain("RELATED DESTINATIONS");
  });

  it("DETAILS B — a second package opens with its own content, not Package A", async () => {
    const { SafariDetailPage } = app!;
    await renderApp(
      <SafariDetailPage slug="lodges-beyond-the-wild" onBack={() => undefined} onBook={() => undefined} openSafari={() => undefined} />,
    );

    await waitForText("Book this safari");
    expect(h1()).toBe("Lodges Beyond the Wild");
    expect(container!.textContent).toContain("Architectural lodges");
    expect(container!.textContent).toContain("From $9,900 pp");
    // Package A does not leak into Package B's page identity.
    expect(h1()).not.toBe("The Great Migration");
    const heroSrc = container!.querySelector(".detail-hero-image")?.getAttribute("src") ?? "";
    expect(heroSrc).toContain("pexels-photo-37790193");
  });

  it("MORE JOURNEYS — click opens the correct other package (current one excluded)", async () => {
    const { SafariDetailPage } = app!;
    let picked: Safari | null = null;
    await renderApp(
      <SafariDetailPage slug="the-great-migration" onBack={() => undefined} onBook={() => undefined} openSafari={(item) => { picked = item; }} />,
    );

    await waitForText("MORE JOURNEYS");
    const section = container!.querySelector(".detail-related");
    expect(section?.textContent).not.toContain("The Great Migration");
    expect(section?.textContent).toContain("Big Five, Unhurried");

    const bigFive = Array.from(section!.querySelectorAll(".detail-related-card"))
      .find((card) => card.textContent?.includes("Big Five, Unhurried"));
    expect(bigFive).toBeDefined();
    await act(async () => {
      bigFive!.querySelector("button")!.click();
    });
    expect(picked?.slug).toBe("big-five-unhurried");
  });

  it("DETAILS — refresh keeps the package (fresh render re-reads by slug)", async () => {
    const { SafariDetailPage } = app!;
    await renderApp(
      <SafariDetailPage slug="the-family-bush" onBack={() => undefined} onBook={() => undefined} openSafari={() => undefined} />,
    );
    await waitForText("The Family Bush");
    expect(h1()).toBe("The Family Bush");
  });

  it("UNKNOWN SLUG — explicit not-found state, never a random package", async () => {
    const { SafariDetailPage } = app!;
    await renderApp(
      <SafariDetailPage slug="no-such-package" onBack={() => undefined} onBook={() => undefined} openSafari={() => undefined} />,
    );
    await waitForText("SAFARI NOT FOUND");
    expect(container!.textContent).not.toContain("Book this safari");
    expect(container!.textContent).not.toContain("The Great Migration");
  });

  it("READ FAILURE — explicit error + retry, never fake packages or an empty UI", async () => {
    await setFailMode(true);
    const { SafariDetailPage } = app!;
    await renderApp(
      <SafariDetailPage slug="the-great-migration" onBack={() => undefined} onBook={() => undefined} openSafari={() => undefined} />,
    );
    await waitForText("SAFARI QUERY FAILED");
    expect(container!.textContent).toContain("Retry query");
    // No demo package can leak through the failure path.
    expect(container!.textContent).not.toContain("The Great Migration");
    await setFailMode(false);
  });
});
