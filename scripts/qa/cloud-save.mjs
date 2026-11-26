// Cloud save, real browser, two devices (DB2+DB3). The "Supabase" is a Playwright route handler answering the real REST paths
// (GoTrue /auth/v1/*, PostgREST /rest/v1/game_saves, the save_put RPC) with per-user isolation and compare-and-swap, so what is
// exercised is the app's real auth adapter, transport, sync client and panel; what is NOT exercised is a real Postgres/RLS.
// Flow: sign up + link + sync on device A -> device B (different local save) signs in -> conflict shows both saves ->
// "use the cloud save" backs up and adopts it -> offline never breaks play -> mobile has no overflow.
// Usage: node scripts/qa/cloud-save.mjs [http://127.0.0.1:5551/] [/tmp/cls-qa/cloud-save]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = process.argv[2] || "http://127.0.0.1:5551/";
const OUT = process.argv[3] || "/tmp/cls-qa/cloud-save";
// LIVE=1 (SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY): no fake at all, the browsers talk to the real project; the checks that peek into
// the fake's tables are skipped (scripts/db/verify-live.mjs proves the database side). Offline uses the browser's real offline mode.
const LIVE = !!process.env.SUPABASE_URL;
const API = LIVE ? process.env.SUPABASE_URL.replace(/\/+$/, "") : "https://qa-fake.supabase.co"; // fake host must be under *.supabase.co: the only external host the page CSP allows
const PUB_KEY = LIVE ? process.env.SUPABASE_PUBLISHABLE_KEY : "sb_publishable_test";
const EMAIL = LIVE ? `cls-live-${Date.now().toString(36)}@example.com` : "p@x.co";
const PASSWORD = "password1-live";
const live = (label, ok, detail) => (LIVE ? console.log(`SKIP ${label} (live: covered by verify-live.mjs)`) : check(label, ok, detail));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);
};

// ---- the fake backend (one per run, shared by both devices) ----
const users = new Map(); const tokens = new Map(); const rows = new Map(); let n = 0;
const server = { offline: false, requests: [] };
const json = (status, body) => ({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(body) });
const session = (id, email) => { const t = `tok-${(n += 1)}`; tokens.set(t, id); return { access_token: t, refresh_token: `r${n}`, expires_in: 3600, user: { id, email } }; };
async function handle(route) {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  const url = new URL(req.url());
  const h = req.headers();
  server.requests.push({ path: url.pathname, apikey: h.apikey, auth: h.authorization });
  if (server.offline) return route.abort("internetdisconnected");
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  if (url.pathname === "/auth/v1/signup") {
    if (users.has(body.email)) return route.fulfill(json(400, { msg: "User already registered" }));
    users.set(body.email, { id: `user-${(n += 1)}`, password: body.password });
    return route.fulfill(json(200, session(users.get(body.email).id, body.email)));
  }
  if (url.pathname === "/auth/v1/token") {
    const u = users.get(body.email);
    return route.fulfill(!u || u.password !== body.password ? json(400, { error_description: "Invalid login credentials" }) : json(200, session(u.id, body.email)));
  }
  if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
  const uid = tokens.get((h.authorization || "").replace("Bearer ", ""));
  if (!uid) return route.fulfill(json(401, { message: "JWT required" }));
  if (url.pathname === "/rest/v1/game_saves") {
    const r = rows.get(`${uid}|career`);
    return route.fulfill(json(200, r ? [{ revision: r.revision, schema_version: r.schemaVersion, save_data: r.data, updated_at: "2026-11-26T12:00:00Z" }] : []));
  }
  if (url.pathname === "/rest/v1/rpc/save_put") {
    const k = `${uid}|${body.p_slot}`; const r = rows.get(k) || { revision: 0, lastKey: null };
    if (r.lastKey === body.p_idempotency_key) return route.fulfill(json(200, { revision: r.revision }));
    if (body.p_expected_revision !== r.revision) return route.fulfill(json(200, { conflict: true, revision: r.revision }));
    rows.set(k, { revision: r.revision + 1, schemaVersion: body.p_schema_version, data: body.p_data, lastKey: body.p_idempotency_key });
    return route.fulfill(json(200, { revision: r.revision + 1 }));
  }
  return route.fulfill(json(404, {}));
}

async function device(label, who, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  if (!LIVE) await ctx.route(`${API}/**`, handle);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ who, api, key }) => {
    const acc = await import("/js/data/account.js");
    const a = acc.createAccount("John"); a.onboardingDone = true; acc.saveAccount(a); acc.setActiveAccountId(a.id);
    const root = await import("/js/data/saveRoot.js");
    root.writeRootSave(root.createRootState({ profile: { accountId: a.id, settings: { who }, accessibility: {} } }), localStorage);
    localStorage.setItem("cls_cloud_flag_v1", "1");
    localStorage.setItem("cls_cloud_config_v1", JSON.stringify({ url: api, key }));
  }, { who, api: API, key: PUB_KEY });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("[data-cloud-panel]", { timeout: 25000 });
  return { label, ctx, page, errors };
}
const act = (d, name) => d.page.click(`[data-cloud-panel] [data-cloud-action="${name}"]`);
const panel = (d) => d.page.$eval("[data-cloud-panel]", (el) => el.innerText.replace(/\s+/g, " "));
const waitText = (d, re) => d.page.waitForFunction((src) => new RegExp(src).test(document.querySelector("[data-cloud-panel]")?.innerText || ""), re.source, { timeout: 15000 }).catch(async (e) => {
  console.log(`  [debug] waiting for ${re} on ${d.label}; panel says: ${await panel(d)}; requests: ${server.requests.map((r) => r.path).join(",")}; errors: ${d.errors.join("|")}`);
  throw e;
});
const who = (d) => d.page.evaluate(() => JSON.parse(localStorage.getItem("cls_root_v3")).profile.settings.who);

// ---- device A ("mac") ----
const A = await device("mac", "mac");
check("flag on: the cloud panel exists, says guests/offline are fine", /不登录也能正常游玩/.test(await panel(A)));
await A.page.fill('[data-cloud-form] [name="email"]', EMAIL);
await A.page.fill('[data-cloud-form] [name="password"]', PASSWORD);
await act(A, "sign-up");
await waitText(A, /确认绑定/);
live("signed in; nothing uploads until the player confirms the link", rows.size === 0 && /绑定不会改变/.test(await panel(A)));
await act(A, "link");
await waitText(A, /立即同步/);
await act(A, "sync");
await waitText(A, /已同步/);
live("sync uploads revision 1 under that user", rows.size === 1 && [...rows.values()][0].revision === 1);
live("requests carry the publishable key and the user's token", server.requests.filter((r) => r.path.startsWith("/rest/")).every((r) => r.apikey === "sb_publishable_test" && /^Bearer tok-/.test(r.auth)));
check("a last-sync time is shown", !/还没有同步过/.test(await panel(A)));

// ---- device B ("phone", a different local save for the same player) ----
const B = await device("phone", "phone", { width: 390, height: 844 });
await B.page.fill('[data-cloud-form] [name="email"]', EMAIL);
await B.page.fill('[data-cloud-form] [name="password"]', PASSWORD);
await act(B, "sign-in");
await waitText(B, /确认绑定/);
await act(B, "link");
await waitText(B, /立即同步/);
await act(B, "sync");
await waitText(B, /发现两个不同的生涯存档/);
const compare = await panel(B);
check("conflict names both saves and offers both choices", /本机存档/.test(compare) && /云端存档/.test(compare) && /使用云端进度/.test(compare) && /保留本机进度/.test(compare) && /先备份/.test(compare), compare.slice(0, 200));
check("nothing was overwritten by the conflict (local save intact)", (await who(B)) === "phone");
check("mobile: no horizontal overflow in the conflict state", await B.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await B.page.locator("[data-cloud-panel]").screenshot({ path: `${OUT}/mobile-conflict.png` });
await act(B, "restore");
await waitText(B, /已恢复云端进度/);
check("restore adopted the cloud save", (await who(B)) === "mac");
check("the replaced save was backed up first", await B.page.evaluate(() => /phone/.test(localStorage.getItem("cls_cloud_backup_v1") || "")));

// ---- offline never breaks play ----
if (LIVE) await B.ctx.setOffline(true); else server.offline = true;
await act(B, "sync");
await waitText(B, /现在连不上云端/);
check("offline: a clear message, local save untouched", (await who(B)) === "mac");
if (LIVE) await B.ctx.setOffline(false); else server.offline = false;
await act(B, "sync");
await waitText(B, /已同步/);
check("back online: syncs again", true);

// ---- isolation (fake mode only; live isolation = verify-live.mjs) ----
if (!LIVE) {
const other = await B.page.evaluate(async (api) => {
  const s = await (await fetch(`${api}/auth/v1/signup`, { method: "POST", headers: { apikey: "k" }, body: JSON.stringify({ email: "other@x.co", password: PASSWORD }) })).json();
  const rowsSeen = await (await fetch(`${api}/rest/v1/game_saves?slot=eq.career`, { headers: { apikey: "k", Authorization: `Bearer ${s.access_token}` } })).json();
  const anon = await fetch(`${api}/rest/v1/game_saves?slot=eq.career`, { headers: { apikey: "k" } });
  return { rowsSeen, anonStatus: anon.status };
}, API);
check("another signed-in user sees no rows; anonymous is refused", other.rowsSeen.length === 0 && other.anonStatus === 401);
}
await A.page.screenshot({ path: `${OUT}/desktop-synced.png`, fullPage: true });
check("no page errors on either device", A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(" | "));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
