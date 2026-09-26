# Charleston City Paper Crossword

An interactive, playable browser crossword built from the Charleston
City Paper's weekly print crossword (syndicated "Jonesin'" puzzles by
Matt Jones).

## Play it

Live at https://ccpx.fyi. Locally, serve the directory (e.g.
`python3 -m http.server 8842`) rather than opening `index.html` via
`file://` — it fetches puzzle data with `fetch()`, which most
browsers block on `file://` URLs.

Progress autosaves to `localStorage`; a status badge shows whether a
finished grid matches the reference solve, when one has been set for
that week's puzzle.

## Contents

- `index.html` — static shell: grid, clues, typing/keyboard nav,
  autosave, completion badge. Loads puzzle data at runtime rather
  than hardcoding it.
- `puzzles/index.json` — list of available puzzles (`{id, date,
  title, file}`, newest first). `index.html` picks the entry matching
  `?puzzle=<id>` or defaults to the newest.
- `puzzles/<date>.json` — one week's grid pattern, across/down clues,
  header text, and a pointer to that week's solution-hash file.
- `puzzles/<date>.solution-hashes.txt` — salted per-answer hashes
  used to check a finished grid against the reference solve, without
  shipping the plaintext solution.
- `skill/` — a Claude Code skill that automates building a new week's
  puzzle: `skill/fetch-issue/` finds the current issue on Issuu and
  saves the raw page image/text layer; `skill/build-puzzle-json/`
  parses that into a new `puzzles/<date>.json` entry.
- `_redirects` — Cloudflare Pages rewrite rule: `/archive/<id>` serves
  `index.html` directly (200, no real redirect) so the pretty archive
  URLs work without a matching file on disk. `index.html` reads the
  puzzle id straight out of `location.pathname`. `?puzzle=<id>` still
  works too as a plain query-string alternative.
- `404.html` — plain not-found page for genuinely missing URLs.
- `functions/api/e.js` + `wrangler.toml` — a Cloudflare Pages Function that
  records anonymous usage counts (page load / started / completed, puzzle id,
  coarse geo, random visitor id) to Workers Analytics Engine. Only
  `ccpx.fyi` sends events. Visiting with `?who=<label>` tags that
  browser's events (e.g. the site owner's devices) without excluding them.
- `build.js` / `package.json` — `npm run build` minifies
  `index.html`/`archive.html`/`404.html` into `dist/` (comments
  stripped, inline JS/CSS minified) and copies `puzzles/` and
  `_redirects` through untouched. Cloudflare Pages runs this on every
  push to `main` and serves `dist/`.

## Status

Live at https://ccpx.fyi. See `CLAUDE.md` for project-specific
instructions on working in this repo.
