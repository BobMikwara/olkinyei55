// scripts/supabase-stub.mjs
// ---------------------------------------------------------------------------
// Local Supabase-compatible REST stub for end-to-end data-flow verification.
//
// Serves the SAME endpoints the public frontend uses:
//   GET /rest/v1/packages?select=*&order=created_at.desc&published=eq.true
//   GET /rest/v1/packages?select=*&slug=eq.<slug>&published=eq.true
// plus the other tables the store bootstraps (returned empty).
//
// Rows are written against the REAL production schema (supabase/schema.sql +
// supabase/packages_sync.sql): id, slug, title, region, duration, nights,
// price_usd, hero_image, gallery, summary, description, signature,
// highlights, included, excluded, availability, country, parks, wildlife,
// difficulty, tags, featured, published, archived, coordinates, seo_title,
// seo_description, publish_date, created_at, updated_at.
//
// It also stores the two CMS documents exactly like public.cms_content
// (supabase/cms_content.sql): id text primary key ('site_settings' | 'pages'),
// content jsonb, updated_at timestamptz — with PostgREST upsert semantics so
// the Settings save/load round trip can be verified end to end.
//
// Control endpoints (for failure-mode testing and request assertions):
//   POST /__control  { failPackages: true|false }   -> toggle RLS-like 500s
//                    { failCmsWrite: true|false }   -> RLS-denied cms writes
//                    { failCmsRead:  true|false }   -> broken cms reads
//   GET  /__cms_content                             -> current stored documents
//   POST /__cms_content { id, content }             -> seed a document directly
//   GET  /__requests                                -> recent request log
//   POST /__reset                                   -> clear log, reset mode
//
// Run:  node scripts/supabase-stub.mjs  [port]
// ---------------------------------------------------------------------------

import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.argv[2] || process.env.STUB_PORT || 4600);
const HOST = process.env.STUB_HOST || "127.0.0.1";

// --- CMS data as it exists in Supabase (public.packages) -------------------
const now = new Date().toISOString();
const packages = [
  {
    id: "a1b2c3d4-0000-4000-8000-000000000001",
    slug: "the-great-migration",
    title: "The Great Migration",
    region: "Serengeti + Maasai Mara",
    duration: "9 days / 8 nights",
    nights: 8,
    price_usd: 8450,
    hero_image: "https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600",
    gallery: [
      "https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600",
      "https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600",
      "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600",
    ],
    summary: "Follow the herds from private mobile camps to the fabled Mara River crossings.",
    description: "A nine-day expedition timed to the great herds, ending at the Mara River.",
    signature: "River crossings, predator country, private mobile camp",
    highlights: ["River crossing mornings", "Private mobile camp", "Big-cat territories"],
    included: ["Full-board private camp", "Private guide and vehicle", "Conservancy fees", "Airport transfers"],
    excluded: ["International flights", "Premium champagne", "Balloon safari"],
    availability: ["Jun", "Jul", "Aug", "Sep", "Oct"],
    country: ["Kenya", "Tanzania"],
    parks: ["Maasai Mara", "Serengeti"],
    wildlife: ["Wildebeest", "Zebra", "Crocodile"],
    difficulty: "Moderate",
    tags: ["migration", "photography"],
    featured: true,
    published: true,
    archived: false,
    coordinates: [35, 42],
    seo_title: "The Great Migration Safari | Olkinyei Expeditions",
    seo_description: "Nine days following the herds across the Serengeti and the Mara.",
    publish_date: now,
    created_at: "2026-05-01T08:00:00.000Z",
    updated_at: "2026-08-20T09:30:00.000Z",
  },
  {
    id: "a1b2c3d4-0000-4000-8000-000000000002",
    slug: "big-five-unhurried",
    title: "Big Five, Unhurried",
    region: "Ngorongoro + Serengeti",
    duration: "7 days / 6 nights",
    nights: 6,
    price_usd: 6200,
    hero_image: "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600",
    gallery: [
      "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600",
      "https://images.pexels.com/photos/26052069/pexels-photo-26052069.jpeg?auto=compress&cs=tinysrgb&w=1600",
    ],
    summary: "A patient, private search for East Africa's icons, led by the rhythms of the wild.",
    description: "",
    signature: "Crater floor, lion territories, elephant herds",
    highlights: [],
    included: ["Private guide", "Lodges and camps", "All park fees"],
    excluded: ["Flights", "Travel insurance"],
    availability: ["Jan", "Feb", "Jun", "Jul"],
    country: ["Tanzania"],
    parks: ["Ngorongoro", "Serengeti"],
    wildlife: ["Lion", "Rhino", "Elephant"],
    difficulty: "Gentle",
    tags: ["big five"],
    featured: false,
    published: true,
    archived: false,
    coordinates: [42, 57],
    seo_title: null,
    seo_description: null,
    publish_date: now,
    created_at: "2026-04-20T08:00:00.000Z",
    updated_at: "2026-08-18T09:30:00.000Z",
  },
  {
    id: "a1b2c3d4-0000-4000-8000-000000000003",
    slug: "lodges-beyond-the-wild",
    title: "Lodges Beyond the Wild",
    region: "Northern Tanzania",
    duration: "8 days / 7 nights",
    nights: 7,
    price_usd: 9900,
    hero_image: "https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600",
    gallery: [],
    summary: "Architectural lodges, intuitive service and vast landscapes with every detail considered.",
    description: null,
    signature: "",
    highlights: [],
    included: [],
    excluded: [],
    availability: [],
    country: ["Tanzania"],
    parks: [],
    wildlife: [],
    difficulty: "Moderate",
    tags: [],
    featured: false,
    published: true,
    archived: false,
    coordinates: [56, 52],
    seo_title: null,
    seo_description: null,
    publish_date: now,
    created_at: "2026-04-10T08:00:00.000Z",
    updated_at: "2026-08-15T09:30:00.000Z",
  },
  {
    id: "a1b2c3d4-0000-4000-8000-000000000004",
    slug: "the-family-bush",
    title: "The Family Bush",
    region: "Laikipia + Maasai Mara",
    duration: "8 days / 7 nights",
    nights: 7,
    price_usd: 5750,
    hero_image: "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600",
    gallery: ["https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600"],
    summary: "A flexible, deeply engaging journey designed for curious young explorers and their families.",
    description: "A family safari with a junior ranger program and gentle pacing.",
    signature: "Junior ranger program, private house, gentle pacing",
    highlights: ["Junior ranger mornings", "Private family house", "Swimming between drives"],
    included: ["Family house", "Junior ranger program", "All meals"],
    excluded: ["International flights"],
    availability: ["Feb", "Mar", "Jun", "Jul", "Aug", "Dec"],
    country: ["Kenya"],
    parks: ["Laikipia", "Maasai Mara"],
    wildlife: ["Elephant", "Giraffe"],
    difficulty: "Gentle",
    tags: ["family"],
    featured: false,
    published: true,
    archived: false,
    coordinates: [62, 32],
    seo_title: null,
    seo_description: null,
    publish_date: now,
    created_at: "2026-03-25T08:00:00.000Z",
    updated_at: "2026-08-10T09:30:00.000Z",
  },
  // Draft — must NEVER reach the public site.
  {
    id: "a1b2c3d4-0000-4000-8000-000000000005",
    slug: "under-canvas-draft",
    title: "Under Canvas (draft)",
    region: "Maasai Mara Conservancies",
    duration: "5 days / 4 nights",
    nights: 4,
    price_usd: 3950,
    hero_image: "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600",
    gallery: [],
    summary: "Canvas walls, hot bucket showers and the rare luxury of falling asleep to the wild.",
    description: null,
    signature: "Private conservancy, night drives, fireside suppers",
    highlights: [],
    included: [],
    excluded: [],
    availability: ["Jun", "Jul"],
    country: ["Kenya"],
    parks: ["Maasai Mara"],
    wildlife: [],
    difficulty: "Moderate",
    tags: [],
    featured: false,
    published: false,
    archived: false,
    coordinates: [30, 34],
    seo_title: null,
    seo_description: null,
    publish_date: null,
    created_at: "2026-03-01T08:00:00.000Z",
    updated_at: "2026-03-05T09:30:00.000Z",
  },
  // Archived — must NEVER reach the public site.
  {
    id: "a1b2c3d4-0000-4000-8000-000000000006",
    slug: "old-rift-walk",
    title: "Old Rift Walk",
    region: "Tarangire + Lake Eyasi",
    duration: "6 days / 5 nights",
    nights: 5,
    price_usd: 4800,
    hero_image: "https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600",
    gallery: [],
    summary: "A retired walking route.",
    description: null,
    signature: "",
    highlights: [],
    included: [],
    excluded: [],
    availability: [],
    country: ["Tanzania"],
    parks: ["Tarangire"],
    wildlife: [],
    difficulty: "Moderate",
    tags: [],
    featured: false,
    published: true,
    archived: true,
    coordinates: [52, 62],
    seo_title: null,
    seo_description: null,
    publish_date: null,
    created_at: "2026-02-01T08:00:00.000Z",
    updated_at: "2026-02-10T09:30:00.000Z",
  },
];

const EMPTY_TABLES = ["blog_posts", "testimonials", "destinations", "guides", "media_assets", "vehicles", "customers", "bookings"];

// --- public.cms_content (supabase/cms_content.sql) --------------------------
// Seeded exactly like the migration: two rows, empty documents.
const cmsContent = new Map([
  ["site_settings", { id: "site_settings", content: {}, updated_at: now }],
  ["pages", { id: "pages", content: [], updated_at: now }],
]);

function resetCmsContent() {
  cmsContent.clear();
  cmsContent.set("site_settings", { id: "site_settings", content: {}, updated_at: new Date().toISOString() });
  cmsContent.set("pages", { id: "pages", content: [], updated_at: new Date().toISOString() });
}

let failPackages = false;
let failCmsWrite = false;
let failCmsRead = false;
const requests = [];

function sortRows(rows, orderParam) {
  if (!orderParam) return rows;
  const [column, direction] = orderParam.split(".");
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[column] ?? "";
    const bv = b[column] ?? "";
    if (av === bv) return 0;
    return (av > bv ? 1 : -1) * dir;
  });
}

function filterRows(rows, params) {
  let out = rows;
  for (const [column, value] of params) {
    if (column === "select" || column === "order" || column === "limit" || column === "offset") continue;
    const parts = value.split(".");
    const op = parts[0];
    const wantedRaw = parts.slice(1).join(".");
    const wanted = wantedRaw === "true" ? true : wantedRaw === "false" ? false : wantedRaw;
    if (op === "eq") {
      out = out.filter((row) => String(row[column]) === String(wanted));
    } else if (op === "not.is") {
      out = out.filter((row) => row[column] !== null && row[column] !== "null");
    }
  }
  return out;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const params = new URLSearchParams(url.search);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, prefer");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const readBody = () => new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
  });

  if (req.method === "POST" && path === "/__control") {
    void readBody().then((body) => {
      try {
        const control = JSON.parse(body || "{}");
        if (typeof control.failPackages === "boolean") failPackages = control.failPackages;
        if (typeof control.failCmsWrite === "boolean") failCmsWrite = control.failCmsWrite;
        if (typeof control.failCmsRead === "boolean") failCmsRead = control.failCmsRead;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, failPackages, failCmsWrite, failCmsRead }));
      } catch {
        res.writeHead(400); res.end();
      }
    });
    return;
  }

  if (path === "/__cms_content") {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([...cmsContent.values()]));
      return;
    }
    if (req.method === "POST") {
      void readBody().then((body) => {
        try {
          const row = JSON.parse(body || "{}");
          cmsContent.set(row.id, { id: row.id, content: row.content, updated_at: new Date().toISOString() });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400); res.end();
        }
      });
      return;
    }
  }

  if (req.method === "POST" && path === "/__reset") {
    requests.length = 0;
    failPackages = false;
    failCmsWrite = false;
    failCmsRead = false;
    resetCmsContent();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && path === "/__requests") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(requests));
    return;
  }

  if (path.startsWith("/rest/v1/")) {
    const table = path.replace("/rest/v1/", "").split("?")[0];
    requests.push({ method: req.method, table, query: Object.fromEntries(params) });

    if (table === "cms_content") {
      const prefer = String(req.headers.prefer ?? "");
      const wantsObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object");

      if (req.method === "GET") {
        if (failCmsRead) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: "42501", message: "permission denied for table cms_content", hint: "RLS policy rejected the SELECT", details: null }));
          return;
        }
        const rows = sortRows(filterRows([...cmsContent.values()], params), params.get("order"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(rows));
        return;
      }

      if (req.method === "POST" || req.method === "PATCH") {
        void readBody().then((raw) => {
          if (failCmsWrite) {
            // Exactly what a failing "Staff can write cms content" policy returns.
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ code: "42501", message: 'new row violates row-level security policy for table "cms_content"', hint: null, details: null }));
            return;
          }
          let payload;
          try { payload = JSON.parse(raw || "{}"); } catch { res.writeHead(400); res.end(); return; }
          const incoming = Array.isArray(payload) ? payload : [payload];
          const written = [];

          for (const row of incoming) {
            const id = row.id ?? (params.get("id") ?? "").replace(/^eq\./, "");
            // id check constraint from supabase/cms_content.sql.
            if (id !== "site_settings" && id !== "pages") {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ code: "23514", message: 'new row for relation "cms_content" violates check constraint "cms_content_id_check"' }));
              return;
            }
            const exists = cmsContent.has(id);
            if (req.method === "POST" && exists && !prefer.includes("resolution=merge-duplicates")) {
              res.writeHead(409, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ code: "23505", message: 'duplicate key value violates unique constraint "cms_content_pkey"' }));
              return;
            }
            if (row.content === undefined && !exists) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ code: "23502", message: 'null value in column "content" violates not-null constraint' }));
              return;
            }
            const current = cmsContent.get(id);
            const next = {
              id,
              content: row.content === undefined ? current.content : row.content,
              // The BEFORE UPDATE trigger overrides any client-supplied value.
              updated_at: new Date().toISOString(),
            };
            cmsContent.set(id, next);
            written.push(next);
          }

          if (!prefer.includes("return=representation")) {
            res.writeHead(204);
            res.end();
            return;
          }
          const select = params.get("select");
          const project = (row) => {
            if (!select || select === "*") return row;
            const keys = select.split(",").map((key) => key.trim());
            return Object.fromEntries(keys.map((key) => [key, row[key]]));
          };
          const body = written.map(project);
          res.writeHead(wantsObject ? 200 : 201, {
            "Content-Type": wantsObject ? "application/vnd.pgrst.object+json" : "application/json",
          });
          res.end(JSON.stringify(wantsObject ? body[0] : body));
        });
        return;
      }
    }

    if (table === "packages" && failPackages) {
      // Realistic RLS-denied response, exactly what a broken policy returns.
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: "42501", message: "permission denied for table packages", hint: "RLS policy rejected the anonymous SELECT", details: null }));
      return;
    }

    if (table === "packages") {
      // Emulate the production roles:
      //  - anon (public site — the query carries published=eq.true) sees only
      //    rows matching the RLS policy: published = true and archived = false.
      //  - authenticated staff (no published filter in the query) see all rows
      //    via the is_staff() policy.
      const isAnon = params.has("published");
      const visible = isAnon
        ? packages.filter((row) => row.published === true && row.archived !== true)
        : packages;
      const rows = sortRows(filterRows(visible, params), params.get("order"));
      const wantsSingle = params.has("slug");
      if (wantsSingle) {
        // PostgREST single-row semantics: when the row is hidden by RLS or
        // does not exist, respond 406 with an EMPTY body (this is exactly what
        // real PostgREST does — postgrest-js surfaces it as error.message "").
        if (rows.length === 0) {
          res.writeHead(406, { "Content-Type": "application/json" });
          res.end("");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/vnd.pgrst.object+json" });
        res.end(JSON.stringify(rows[0]));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rows));
      return;
    }

    if (EMPTY_TABLES.includes(table)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: `No stub route for table ${table}` }));
    return;
  }

  res.writeHead(404);
  res.end();
});

// Accept (and keep idle) the Realtime websocket so the frontend's channel
// subscriptions never spam the console — REST is the transport under test.
server.on("upgrade", (request, socket) => {
  if (!request.url || !request.url.startsWith("/realtime/v1/websocket")) {
    socket.destroy();
    return;
  }
  const key = request.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.on("data", () => { /* keep the socket open, answer nothing */ });
  socket.on("error", () => { /* ignore */ });
});

server.listen(PORT, HOST, () => {
  console.log(`[stub] Supabase-compatible stub listening on http://${HOST}:${PORT}`);
  console.log(`[stub] ${packages.length} package rows: ${packages.filter((p) => p.published && !p.archived).length} published, ${packages.filter((p) => !p.published).length} draft, ${packages.filter((p) => p.archived).length} archived`);
});
