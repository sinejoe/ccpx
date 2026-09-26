// First-party usage counter: the page POSTs {e, p, v} here (see "Usage
// counts" in index.html) and each event becomes one Analytics Engine data
// point. Served from ccpx.fyi itself so ad blockers that eat Cloudflare's
// third-party Web Analytics beacon don't hide real players.
//
// Stored per event: event name, puzzle id, coarse geo (country / region /
// city from Cloudflare's edge lookup), mobile-vs-desktop, and the random
// visitor id the page keeps in localStorage. Never the IP or user agent.
//
// Dataset schema (keep in sync with the queries in .claude/project-dry.md):
//   blob1 event   blob2 puzzle   blob3 country   blob4 region
//   blob5 city    blob6 device   index1 visitor id
const EVENTS = new Set(['load', 'start', 'complete']);
const PUZZLE_RE = /^\d{8}$/; // puzzle id, e.g. 20260925
const VISITOR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function onRequestPost({ request, env }) {
  if (!env.USAGE) {
    console.error('functions/api/e.js: USAGE Analytics Engine binding missing (check wrangler.toml)');
    return new Response(null, { status: 503 });
  }
  let body;
  try {
    body = JSON.parse(await request.text());
  } catch (err) {
    return new Response(null, { status: 400 });
  }
  const event = String(body?.e ?? '');
  const puzzle = String(body?.p ?? '');
  const visitor = String(body?.v ?? '');
  if (!EVENTS.has(event) || !PUZZLE_RE.test(puzzle) || !VISITOR_RE.test(visitor)) {
    return new Response(null, { status: 400 });
  }
  const cf = request.cf ?? {};
  const ua = request.headers.get('user-agent') ?? '';
  env.USAGE.writeDataPoint({
    blobs: [
      event,
      puzzle,
      cf.country ?? '',
      cf.region ?? '',
      cf.city ?? '',
      /Mobi|Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop',
    ],
    indexes: [visitor],
  });
  return new Response(null, { status: 204 });
}
