// First-party usage counter: the page POSTs {e, p, v, m, t} here (see
// "Usage counts" in index.html) and each event becomes one Analytics Engine
// data point. Served from ccpx.fyi itself so ad blockers that eat
// Cloudflare's third-party Web Analytics beacon don't hide real players.
//
// Stored per event: event name, puzzle id, coarse geo (country / region /
// city from Cloudflare's edge lookup), device and browser (parsed from the
// user agent -- the raw string isn't kept), the "me" label for known
// people, and the random visitor id the page keeps in localStorage (one per
// browser, so each of someone's devices shows up separately). Never the IP.
//
// Dataset schema (keep in sync with the queries in .claude/project-dry.md):
//   blob1 event   blob2 puzzle   blob3 country   blob4 region
//   blob5 city    blob6 device   blob7 me (label, '' = public)
//   blob8 browser                index1 visitor id
// interest = tapped "Want solve times & streaks?" (feature not built yet)
const EVENTS = new Set(['load', 'start', 'complete', 'interest']);
const PUZZLE_RE = /^\d{8}$/; // puzzle id, e.g. 20260925
const VISITOR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// ?me=<name> values that get recorded as a label: joe = the site owner,
// cc = Claude Code's own test runs. Any other name is recorded as public.
const KNOWN_ME = new Set(['joe', 'cc']);

// Coarse device/browser from the user agent. Order matters: iPadOS Safari
// reports "Macintosh", so a Mac UA with touch points is an iPad; Edge and
// most iOS browsers also contain "Chrome"/"Safari", so check them first.
function describeDevice(ua, touchPoints) {
  let device = 'Other';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) device = 'iPad';
  else if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/Android/.test(ua)) device = /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  else if (/Macintosh/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows';
  else if (/CrOS/.test(ua)) device = 'Chromebook';
  else if (/Linux/.test(ua)) device = 'Linux';

  let browser = 'Other';
  if (/bot|crawl|spider|Headless/i.test(ua)) browser = 'Bot/headless';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome/.test(ua)) browser = 'Chrome';
  else if (/Safari/.test(ua)) browser = 'Safari';
  return { device, browser };
}

export async function onRequestPost({ request, env }) {
  if (!env.ANALYTICS_ENGINE) {
    console.error('functions/api/e.js: ANALYTICS_ENGINE binding missing (check wrangler.toml)');
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
  const me = String(body?.m ?? '');
  const touchPoints = Number(body?.t ?? 0) || 0;
  const cf = request.cf ?? {};
  const { device, browser } = describeDevice(request.headers.get('user-agent') ?? '', touchPoints);
  // Crawlers and headless browsers aren't players: accept the beacon but
  // don't record it. (Playwright test runs use real Chrome, so ?me=cc still counts.)
  if (browser === 'Bot/headless') return new Response(null, { status: 204 });
  env.ANALYTICS_ENGINE.writeDataPoint({
    blobs: [
      event,
      puzzle,
      cf.country ?? '',
      cf.region ?? '',
      cf.city ?? '',
      device,
      KNOWN_ME.has(me) ? me : '',
      browser,
    ],
    indexes: [visitor],
  });
  return new Response(null, { status: 204 });
}
