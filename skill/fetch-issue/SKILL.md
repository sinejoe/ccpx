---
name: charleston-citypaper-fetch-issue
description: Find this week's (or a specific week's) Charleston City Paper issue on Issuu, locate the crossword page inside it, and save the raw page image plus its SVG text layer to working-files/ for a later parsing step. Use this when the user asks to "find/fetch/grab this week's crossword", "check for the new issue", or otherwise wants the raw source material pulled down -- NOT when they already have an image, and NOT when they're ready to turn already-fetched material into puzzles/*.json (that's the separate charleston-citypaper-build-puzzle-json skill).
---

# Fetch this week's Charleston City Paper issue

First half of the two-step weekly pipeline. This skill's only job is to
locate the crossword page for a given week and save raw artifacts to
`working-files/<date>/` — it does **not** parse the grid or clues. Hand
off to `charleston-citypaper-build-puzzle-json` for that.

## Step 1 — Run the fetch script

```bash
python3 skill/scripts/fetch_issue.py                    # newest available issue
python3 skill/scripts/fetch_issue.py --date 2026-08-07   # a specific week
```

This is plain HTTP + regex against Issuu's static endpoints — **no
browser automation needed** (that used to be the whole point of this
skill; it no longer is, see `../references/workflow_notes.md` for why).
It:

1. Finds the issue's doc page URL for the requested (or newest) date.
2. Pulls the Issuu doc id out of the doc page's JSON-LD block.
3. Scans that issue's pages via `svg.issuu.com/<doc-id>/page_<n>.svg`
   looking for the crossword's byline text, stopping at the first match
   — a few seconds for a typical ~24-page issue, no visual judgment
   needed since the page number drifts weekly and can't be assumed.
4. Extracts the embedded full-resolution page JPEG and the full vector
   text layer (with real page-pixel coordinates) from that one page's
   SVG file, and writes:
   - `working-files/<date>/page.jpg`
   - `working-files/<date>/svg_text.json` — `{source, nodes: [{x, y,
     text}, ...], flatText}`
   - `working-files/<date>/meta.json` — `date`, `docId`, `pageNumber`,
     `sourceUrl` filled in; `puzzleTitle`/`byline`/`constructor` left
     `null` (see Step 2)
5. Best-effort crops the **previous** week's printed solution grid (this
   week's page always includes it) into
   `working-files/<the-prior-week's-date>/printed_solution_grid_CANDIDATE.jpg`
   — unverified bounds, confirm visually before trusting it for
   anything. Also merges `officialSolutionUrl` (this issue's doc URL) and
   `officialSolutionPage` (this issue's crossword page number — the
   solution grid sits on that same page) into the *prior* week's
   `meta.json`, so a source link can be shown to players later. See "Last
   week's solution grid" below.

If the script's page-discovery scan fails (crossword byline text
doesn't match, e.g. a special guide issue with a different or no
puzzle), fall back to the manual browser method in
`../references/workflow_notes.md` ("Manual/fallback: finding the page
visually").

## Step 2 — Fill in title/byline/constructor

The script can't reliably pull `puzzleTitle` / `byline` / `constructor`
out of the raw text layer (the title is often a themed phrase mixed in
with grid-adjacent text, not a clean labeled field). Read
`working-files/<date>/svg_text.json`'s `flatText` (or just look at
`page.jpg`) and fill those three fields into `meta.json` by hand before
moving on to `build-puzzle-json`.

## Last week's solution grid

Every issue prints last week's completed grid as a small solution key.
The fetch script opportunistically crops it and drops it in the *prior*
week's `working-files/` directory, since that's the puzzle it belongs
to. Treat it strictly as short-lived scratch for whoever builds
that prior week's puzzle JSON later — it gets deleted as soon as its
letters are transcribed into that week's solution hashes (it's
gitignored, and `build-puzzle-json` Step 7 removes it). It is not wired
into anything on its own, and turning it into an on-site "official answer key" feature is
a separate product decision. Discuss with the user first per the
`SOLUTION`-framing rules in the repo's `CLAUDE.md` before building
anything that surfaces it to players.

## Step 3 — Done

Tell the user the raw material is saved to `working-files/<date>/`
(`page.jpg`, `svg_text.json`, `meta.json`) and that
`charleston-citypaper-build-puzzle-json` is the next step to turn it into
`puzzles/<date>.json`.
