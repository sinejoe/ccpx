# Project DRY Notes

> Read this file before scanning the repo for config, credentials, connection info, or "how do
> I run X" answers. Update it whenever you learn something new that belongs here. Never write
> actual secret values - locations/references only.

## Overview

`ccpx.fyi` — a static, single-page crossword player for the Charleston City Paper's weekly
Jonesin' crossword. No framework, no server: `index.html` is one self-contained HTML/CSS/JS
file that fetches puzzle data as JSON at runtime. Puzzle data lives in `puzzles/<date>.json`
(+ `puzzles/index.json` as the newest-first manifest). `build.js` (Node, `npm run build`)
minifies the HTML and generates per-puzzle static variants into `dist/`, which Cloudflare
Pages serves. The weekly content pipeline is implemented as Claude Code skills under `skill/`.

## Resources & Services

- **Cloudflare Pages** — project `ccpx`, account id `ee6dc5f16660ea40f92271ec5fc1ec2b`.
  Builds from git integration on push to `main` (there is **no** `.github/workflows` — don't
  go looking for CI config). Build command `npm run build`, output dir `dist`.
- **Cloudflare DNS/zone** — `ccpx.fyi`, zone id `dea22632210f991842d6a0da8c0e9829`.
- **Issuu** — source of the weekly issue. Publisher listing:
  `https://issuu.com/charlestoncitypaper`. Static endpoints used by
  `skill/scripts/fetch_issue.py`:
  - `https://issuu.com/charlestoncitypaper/docs/<slug>` (JSON-LD block carries the doc id)
  - `https://svg.issuu.com/<doc-id>/page_<n>.svg` — one fetch yields both the full-res page
    JPEG (base64 data URI inside `<image>`) and the complete vector text layer.
  - Deep link to a page/spread: append `/<page>` to the doc URL.
  Full rationale and dead ends: `skill/references/workflow_notes.md`.
- **npm devDeps** — `html-minifier-terser` (build), `sharp` (OG grid PNGs via
  `generate_og_image.js`).

## Credentials & Secrets (locations only, never values)

- `CF_API_TOKEN_SINE` — shell environment variable; the Cloudflare API token used for
  `wrangler pages deploy` and direct REST calls against the `ccpx` Pages project.
  (`CF_API_TOKEN_CDC` exists in the same shell for a different property.)
  Defined in `~/.secrets/tools/cloudflare.env`; `~/.profile:81` sources every `*.env` in
  `~/.secrets/tools/` at shell startup, so they're already in the environment — no sourcing
  step needed. (`paypal.env` and `porkbun.env` sit alongside it; same pattern.)
- `.claude-env` (gitignored) holds only the CF account shortname `sansjoe`, no secret value.
- Nothing in this repo needs a credential to *build* or *serve* — only to deploy.

## Connections

- **Production:** `https://ccpx.fyi/` (current puzzle at `/`, older ones at
  `/archive/<id>`). `_redirects` is a single line, `/archive/*  /  200` — the archive routes
  are real generated directories; this rule is the SPA-ish fallback.
- **Preview:** `https://<branch>.ccpx.pages.dev` from `wrangler pages deploy dist
  --project-name=ccpx --branch=solve-<puzzle-id>`. Preview deploys are **unlisted but
  unauthenticated** — see Gotchas.
- **Local:** `python3 -m http.server 8842` from the repo root. `file://` is blocked by some
  sandboxed browser tooling, so always serve rather than opening the file directly.

## Methods & Conventions

### Weekly pipeline (the thing that repeats)

`skill/SKILL.md` is the router. Order of operations every week:

1. `python3 skill/scripts/fetch_issue.py` → `working-files/<date>/{page.jpg,svg_text.json,meta.json}`.
   Then hand-fill `puzzleTitle` / `byline` / `constructor` into `meta.json`.
2. `python3 skill/scripts/extract_grid.py working-files/<date>/page.jpg --crop x0,y0,x1,y1`
   → grid pattern + auto-numbering summary (keep it; it's the Step 3 cross-check).
3. Reconstruct clues from `svg_text.json`'s `flatText`. **All Across clues come first in the
   left column; Down starts partway down that same column and continues into the right
   column.** Printed column position does not equal direction — assuming it did shipped a
   real bug.
4. Write `puzzles/<date>.json`, prepend to `puzzles/index.json`, verify in a real browser.
5. Bake last week's official solve in (see below), then commit + push.

### puzzles/<date>.json key order (match it; diffs stay clean)

`id, date, kickerDate, title, subtitle, solutionSalt, solutionHashesFile, pattern, across, down`
— with `solutionSource` and `officialSolutionUrl` appended only once the official printed key
has been transcribed. `id` is the date with dashes stripped (`2026-09-18` → `20260918`).
`kickerDate` is `Mon DD YYYY`. Use real unicode punctuation (curly quotes, em dash); the page
writes these via `textContent`, not `innerHTML`.

### Solution hashes

`puzzles/<date>.solution-hashes.txt`, one line per entry: `<num><A|D>-<sha256hex(solutionSalt + word)>`.
Salt is `ccpxwd-<year>-ref-solve`. **File order convention: every Across entry first sorted by
number, then every Down entry sorted by number.** Interleaving them produces a huge spurious
diff. Plaintext solutions never ship.

Numbering follows `index.html`'s `computeNumbers()`: row-major scan, a cell starts a number if
it starts an Across entry and/or a Down entry. Before trusting a transcription, assert the
resulting Across/Down number sets exactly equal that JSON's existing clue-number lists.

### Reference solve for the current week

1. `CCPX_PREVIEW=1 npm run build`
2. `npx wrangler pages deploy dist --project-name=ccpx --branch=solve-<id>`
3. Give the user the `*.pages.dev` URL — **not** localhost. They solve on a separate device.
4. They paste back `crossword:<id>={"rows":[...]}` from the in-page copy box.
5. Sanity-pass every answer against its clue before writing hashes.
6. **Delete the preview deployment once production is live.** Non-optional.

`CCPX_PREVIEW=1` is the only thing that keeps the dev export box in the build; a production
build strips those `dev-export-box:start/end` marker regions from `index.html` outright and
`build.js` throws if any `devExportBox`/`devExportText`/`isPreviewHost` reference survives the
strip. The box must not exist in public source, not merely be runtime-gated.

### Deleting a preview deployment

```
curl -s -H "Authorization: Bearer $CF_API_TOKEN_SINE" \
  "https://api.cloudflare.com/client/v4/accounts/ee6dc5f16660ea40f92271ec5fc1ec2b/pages/projects/ccpx/deployments?env=preview"
# then DELETE .../deployments/<id>?force=true
```

### Commits

Puzzle data and code/feature changes go in **separate commits**. Branch is `main`; Pages
deploys on push.

### Testing

Real browser only (Playwright MCP, borrowing the current Chrome profile); jsdom is
discouraged and the user's main Chrome is off limits. Useful selectors:

- grid cells: `#grid` children, `SIZE*SIZE` total (225 for 15×15); inputs are
  `.cell[data-r][data-c] > input`
- clue lists are **divs**, not `ul`: `document.getElementById('acrossList').children.length`
  (same for `downList`). `#acrossList li` matches nothing.
- To fill a cell programmatically: set `input.value` then
  `input.dispatchEvent(new Event('input',{bubbles:true}))`.

## Gotchas & Notes

- **`extract_grid.py` has never worked bare.** Always pass `--crop`; other dark page content
  confuses line detection. `--crop 20,80,1400,1400` worked for 2026-09-18.
- **`printed_solution_grid_CANDIDATE.jpg` routinely has bad bounds** (it grabbed a large ad
  once). Expect to re-crop from `page.jpg` with PIL — `(840,2470,1390,3000)` upscaled 3× with
  LANCZOS was right for the 2026-09-18 issue — and delete both crops once the letters are in
  the hashes file. The crop is gitignored scratch, not an artifact.
- **Preview deploys are unauthenticated.** Obscurity isn't the plan; they get deleted the
  moment production goes live.
- **`timeout` does not exist on this machine** (macOS, no coreutils). Use the Bash tool's own
  `timeout` parameter. Chained `sleep` is blocked by the harness — poll with
  `until curl -sf <url>; do sleep 10; done` instead.
- **Playwright's browser may not be installed:** `Browser "chrome-for-testing" is not
  installed` → `npx --yes @playwright/mcp install-browser chrome-for-testing`.
- **Cloudflare analytics limits on this zone:** `botScore` and `clientRefererHost` are not
  queryable, and `httpRequestsAdaptiveGroups` caps at a 1-day window per query.
- **`index.html` UI logic that looks like cruft isn't.** Arrow-key nav, click-vs-focus
  orientation, typing-replaces-not-inserts, backspace order, instant-vs-smooth scroll, and
  focus-mode sizing are all deliberate regression fixes. `HANDOFF.md` documented them; it was
  removed from the repo but is recoverable via
  `git log --diff-filter=D -- HANDOFF.md` / `git show <sha>:HANDOFF.md`.
- **No on-site admin/import panel.** The export/import feature was deliberately removed. Any
  new way to submit or update a reference solve needs a conversation with the user first.
- **Solve-framing rules are hard requirements:** never call a mismatch "wrong", never flag
  individual cells, always make clear it's *a* submitted solve rather than an official answer
  key, and keep the completion indicator a persistent badge — never a popup.
- **`puzzles/*.solution.json`** files are gitignored local scratch and fully redundant — each
  regenerates its committed hashes byte-for-byte.
- `.jekyll-cache/` is stale; nothing here uses Jekyll.

## Superseded (kept for history, don't rely on these)

- *2026-09-18* — "Cloudflare tokens live in `~/.env.secrets`" (from
  `reference_cf_api_tokens.md`). No such file; it's `~/.secrets/tools/cloudflare.env`,
  auto-sourced via `~/.profile:81`.
- *2026-09-18* — "The dev export box is absent from the DOM on preview builds" (recorded as an
  unresolved bug in an earlier session's topup state). Did not reproduce anywhere; it was a
  stale dev server, not a code defect.
- *2026-09-18* — "Reference solving is done over localhost." It's done over a Cloudflare Pages
  preview URL, because the user solves on a separate device.
- See also `skill/references/workflow_notes.md` for two more retired beliefs: the
  `<YYMMDD>fullbookweb` doc-slug pattern (404s; resolve the slug from the listing page), and
  the claim that `image.isu.pub` was unreachable without a browser (it's reachable; the SVG
  endpoint is better anyway).

---
**Last updated:** 2026-09-18 — initial scan; corrected the Cloudflare token location.
