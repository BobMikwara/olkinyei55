// tests/setup.ts
// Minimal browser globals so the browser store (src/admin/store.ts) can be
// imported and exercised in the node test environment. Only the surfaces the
// store touches at module load / during public reads are shimmed.
//
// When a test opts into a real DOM (jsdom via `@vitest-environment jsdom`),
// the real window/document/localStorage are kept — only the APIs jsdom does
// not implement (WebSocket connectivity, observers, matchMedia) are shimmed.

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

const noop = () => { /* no-op */ };

// Realtime cannot reach the stub; a never-connecting socket keeps the store's
// channel subscriptions inert during tests (they are exercised via the REST
// read path, which is what the public package flow depends on).
class NoopWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = 3;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  addEventListener() { /* never connects */ }
  removeEventListener() { /* no-op */ }
  send() { /* no-op */ }
  close() { /* no-op */ }
}

(globalThis as Record<string, unknown>).WebSocket = NoopWebSocket;

const hasRealDom = typeof window !== "undefined"
  && typeof document !== "undefined"
  && typeof document.createElement === "function"
  && typeof window.location === "object";

if (!hasRealDom) {
  const storage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();

  (globalThis as Record<string, unknown>).localStorage = storage;
  (globalThis as Record<string, unknown>).sessionStorage = sessionStorage;
  (globalThis as Record<string, unknown>).window = {
    localStorage: storage,
    sessionStorage,
    addEventListener: noop,
    removeEventListener: noop,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    location: { hostname: "localhost", pathname: "/safaris", hash: "", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    history: { pushState: noop },
    scrollTo: noop,
  };
  (globalThis as Record<string, unknown>).document = {
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({
      setAttribute: noop,
      appendChild: noop,
      remove: noop,
      addEventListener: noop,
      focus: noop,
      style: {},
      classList: { add: noop, remove: noop },
    }),
    body: { appendChild: noop, contains: () => false, style: {} },
    documentElement: { style: { setProperty: noop } },
    head: { appendChild: noop },
    title: "",
    visibilityState: "visible",
  };
} else {
  // jsdom: provide the browser APIs React/Framer Motion expect but jsdom lacks.
  const target = globalThis as Record<string, unknown>;
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) as MediaQueryList;
  }
  if (!("IntersectionObserver" in window)) {
    target.IntersectionObserver = class {
      observe() { /* no-op */ }
      unobserve() { /* no-op */ }
      disconnect() { /* no-op */ }
      takeRecords() { return []; }
    };
  }
  if (!("ResizeObserver" in window)) {
    target.ResizeObserver = class {
      observe() { /* no-op */ }
      unobserve() { /* no-op */ }
      disconnect() { /* no-op */ }
    };
  }
  if (typeof window.scrollTo !== "function") window.scrollTo = noop as typeof window.scrollTo;
}
