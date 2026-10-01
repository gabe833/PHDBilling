// PHD Billing — MagicDoor connector (Supabase Edge Function "magicdoor")
// ---------------------------------------------------------------------
// Step 1 of the MagicDoor sync: proves the key works and reports which
// MagicDoor endpoints exist and what fields they return, WITHOUT returning
// any tenant names, addresses, emails, phone numbers or amounts.
// That report is what the full sync is written against.
//
// Secrets it reads (Edge Functions → Secrets):
//   MAGICDOOR_API_KEY   the read-only key from MagicDoor
// Supabase provides SUPABASE_URL and SUPABASE_ANON_KEY automatically.
//
// Only people active on the console's Team list can call it.

const AUTH_URL = "https://auth.magicdoor.com/api-keys/token";
const API = "https://api.portal.magicdoor.com";

// Likely resource names, taken from the permissions MagicDoor lists.
// Anything that doesn't exist simply comes back as 404 in the report.
const CANDIDATES = [
  "properties", "units", "leases", "tenants",
  "lease-charges", "lease-charge-credits", "lease-deposits", "lease-late-fees",
  "lease-processing-fees", "lease-ledger-transfers",
  "payment-collects", "transactions", "payment-settlements",
  "management-fees", "management-fee-credits",
  "owner-distributions", "owner-contributions", "owners",
  "rental-application-fees",
  "vendor-bills", "vendors", "work-orders", "maintenance-requests",
];
// Places an API description (OpenAPI / Swagger) is commonly published.
const SPEC_PATHS = [
  "/company-app/swagger/v1/swagger.json", "/swagger/v1/swagger.json",
  "/company-app/openapi.json", "/openapi.json",
  "/company-app/swagger.json", "/swagger.json",
  "/company-app/v3/api-docs", "/v3/api-docs",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- MagicDoor token (about 15 minutes; renewed a minute early) ----------
let token = "", tokenUntil = 0;
async function mdToken(): Promise<string> {
  if (token && Date.now() < tokenUntil) return token;
  const key = (Deno.env.get("MAGICDOOR_API_KEY") || "").trim();
  if (!key) throw new Error("MAGICDOOR_API_KEY is not set in Edge Functions → Secrets");
  const r = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 401) throw new Error("MagicDoor rejected the key (401). It may be mistyped, revoked or expired, or its owner was deactivated.");
  if (!r.ok) throw new Error(`MagicDoor sign-in failed: ${r.status}`);
  const d = await r.json();
  if (!d.accessToken) throw new Error("MagicDoor sign-in returned no token");
  token = d.accessToken;
  tokenUntil = Date.now() + Math.max(60, Number(d.expiresIn || 900) - 60) * 1000;
  return token;
}
async function mdGet(path: string): Promise<{ status: number; body: unknown; text: string }> {
  const t = await mdToken();
  const r = await fetch(API + path, {
    headers: { Authorization: "Bearer " + t, Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  const text = await r.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body, text };
}

// ---------- shape report: field names and types only, never values ----------
const ENUM_KEY = /(status|type|kind|frequency|method|state|category|period|cycle|recurrence|direction|role)$/i;
function typeOf(key: string, v: unknown): unknown {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return v.length ? [mergeShapes(v.slice(0, 5).map((x) => typeOf(key, x)))] : ["(empty)"];
  if (typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = typeOf(k, x);
    return o;
  }
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "decimal";
  if (typeof v === "boolean") return "bool";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return "datetime";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "date";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return "uuid";
  if (/^-?\d+(\.\d+)?$/.test(s)) return "numeric-string";
  if (ENUM_KEY.test(key) && s.length <= 40 && !/@|\d{3}/.test(s)) return "enum:" + s;   // e.g. status "Active"
  return "string";
}
function mergeShapes(list: unknown[]): unknown {
  const objs = list.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
  if (objs.length !== list.length || !objs.length) {
    const kinds = [...new Set(list.map((x) => JSON.stringify(x)))].map((x) => JSON.parse(x));
    return kinds.length === 1 ? kinds[0] : kinds;
  }
  const out: Record<string, unknown> = {};
  for (const o of objs) for (const [k, v] of Object.entries(o)) {
    if (!(k in out) || out[k] === "null") out[k] = v;
    else if (JSON.stringify(out[k]) !== JSON.stringify(v) && v !== "null") {
      const a = String(out[k]), b = String(v);
      out[k] = a.startsWith("enum:") && b.startsWith("enum:") ? [...new Set([...a.split(" | "), b])].join(" | ") : out[k];
    }
  }
  return out;
}
// top level: where the list is, how many came back, and the paging fields (numbers/bools only)
function describe(body: unknown) {
  if (Array.isArray(body)) return { list: "(top-level array)", count: body.length, item: mergeShapes(body.slice(0, 5).map((x) => typeOf("", x))) };
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const listKey = Object.keys(o).find((k) => Array.isArray(o[k]));
    const paging: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === listKey) continue;
      paging[k] = typeof v === "number" || typeof v === "boolean" ? v : typeOf(k, v);
    }
    if (listKey) {
      const arr = o[listKey] as unknown[];
      return { list: listKey, count: arr.length, paging, item: mergeShapes(arr.slice(0, 5).map((x) => typeOf("", x))) };
    }
    return { list: null, paging, item: typeOf("", body) };
  }
  return { list: null, note: "not JSON" };
}

async function discover() {
  const out: Record<string, unknown> = { at: new Date().toISOString(), auth: "ok" };
  await mdToken();
  // an API description, if MagicDoor publishes one, lists every endpoint
  for (const p of SPEC_PATHS) {
    try {
      const r = await mdGet(p);
      const b = r.body as Record<string, unknown> | null;
      if (r.status === 200 && b && typeof b === "object" && b.paths) {
        const paths = b.paths as Record<string, Record<string, unknown>>;
        out.spec = { at: p, endpoints: Object.entries(paths).map(([path, ops]) => Object.keys(ops).filter((m) => /^(get|post|put|patch|delete)$/i.test(m)).map((m) => m.toUpperCase() + " " + path)).flat() };
        break;
      }
    } catch { /* try the next one */ }
  }
  const endpoints: Record<string, unknown> = {};
  const queue = [...CANDIDATES];
  async function worker() {
    while (queue.length) {
      const name = queue.shift()!;
      const path = "/company-app/" + name;
      try {
        const r = await mdGet(path);
        endpoints[path] = r.status === 200
          ? { status: 200, ...describe(r.body) }
          : { status: r.status, error: r.text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "(email)").slice(0, 160) };
      } catch (e) {
        endpoints[path] = { status: "failed", error: String((e as Error).message || e).slice(0, 160) };
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  out.endpoints = Object.fromEntries(CANDIDATES.map((n) => ["/company-app/" + n, endpoints["/company-app/" + n]]));
  return out;
}

// ---------- only active Team members may call this ----------
async function isStaff(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return false;
  const url = Deno.env.get("SUPABASE_URL")!;
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const r = await fetch(url + "/rest/v1/rpc/is_staff", {
    method: "POST",
    headers: { apikey, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    if (!(await isStaff(req))) return json({ error: "Not on the team list" }, 403);
    const { mode } = await req.json().catch(() => ({ mode: "" }));
    if (mode === "ping") { await mdToken(); return json({ ok: true }); }
    if (mode === "discover") return json(await discover());
    return json({ error: "Unknown mode" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 502);
  }
});
