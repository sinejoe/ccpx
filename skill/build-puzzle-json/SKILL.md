---
name: charleston-citypaper-build-puzzle-json
description: Parse an already-fetched Charleston City Paper crossword page (working-files/<date>/page.jpg + svg_text.json + meta.json, produced by the charleston-citypaper-fetch-issue skill) into puzzles/<date>.json and add it to puzzles/index.json. Use this once the raw page image and SVG text layer are already saved to working-files/ and the user wants them turned into this week's playable puzzle data. Do NOT use this to go fetch a new issue -- that's the separate charleston-citypaper-fetch-issue skill.
---

# Build this week's puzzle JSON

Second half of the two-step weekly pipeline. Deterministic and
mechanical by design — everything here operates on files already sitting
in `working-files/<date>/`, with no network fetching, so it's safe to
re-run as many times as needed while chasing down a transcription error
without touching Issuu again.

If `working-files/<date>/` doesn't exist or is missing `page.jpg` /
`svg_text.json` / `meta.json`, stop and run
`charleston-citypaper-fetch-issue` first.

## Step 1 — Extract the grid pattern

```bash
python3 ../scripts/extract_grid.py working-files/<date>/page.jpg
```

If other dark page content confuses line detection, pass a rough crop
(`--crop x0,y0,x1,y1` — doesn't need to be pixel-exact). This prints the
detected `.`/`#` pattern and an auto-numbering summary: how many
Across/Down entries it implies and their exact numbers. **Keep this
summary** — it's the cross-check for Step 3.

## Step 2 — Reconstruct clue text from the SVG text layer

Read `working-files/<date>/svg_text.json` — shape is `{source, nodes:
[{x, y, text}, ...], flatText}`. `x`/`y` are real page-pixel coordinates
(same space as `page.jpg`), one entry per glyph/text-run in document
order. `flatText` is those same nodes already joined in that order — on
the one issue this was tested against, document order alone reproduced
clean, correctly-sequenced Across-then-Down clue text with no need to
group by `y`/reconstruct lines from coordinates. Start from `flatText`;
fall back to grouping `nodes` by rounded `y` (glyphs on the same printed
line share a y-value) only if `flatText` looks jumbled or interleaved.

**Read the clue-layout convention in
`../references/workflow_notes.md` ("Clue-list layout convention") before
splitting into Across vs. Down** — this puzzle's two printed text columns
do NOT align with the Across/Down split; assuming they do has caused a
real shipped bug (a swapped clue pair) before. All Across clues run
first in the left column; Down starts partway down that same column and
continues into the right column, so the top of the right column is a
continuation of Down, not a new section.

## Step 3 — Verify before trusting either extraction

Compare the auto-numbering summary from Step 1 against the clue numbers
you transcribed in Step 2: same count, same specific numbers, 1 through
the highest with no gaps. If they don't match, first suspect the clue
transcription (easy to misread a number in small print) before
suspecting the grid extraction (a direct pixel measurement, historically
reliable). Do not proceed to Step 4 on a mismatch — re-crop/re-parse
instead.

## Step 4 — Write puzzles/<date>.json

Schema (authoritative — `index.html`'s `loadPuzzleData()` consumes this
shape directly):

```json
{
  "id": "<date as YYYYMMDD, e.g. 2026-08-14 -> 20260814>",
  "date": "<date>",
  "kickerDate": "<Mon DD YYYY, e.g. Aug 14 2026>",
  "title": "<puzzleTitle from meta.json>",
  "subtitle": "<byline from meta.json>",
  "solutionSalt": "ccpxwd-<year>-ref-solve",
  "solutionHashesFile": "puzzles/<date>.solution-hashes.txt",
  "solutionSource": "<optional: 'official' if solutionHashesFile was transcribed from the printed answer key in a later issue; omit/'reference' for a submitted solve>",
  "officialSolutionUrl": "<optional: only set alongside solutionSource:'official' -- from meta.json's officialSolutionUrl, the later issue's viewer URL where the printed grid appears>",
  "pattern": [ /* 15 rows from Step 1 */ ],
  "across": [ /* [number, "clue text"] from Step 2 */ ],
  "down": [ /* [number, "clue text"] from Step 2 */ ]
}
```

Use real unicode punctuation (curly quotes, em dash) in the JSON
strings, not HTML entities — `index.html` writes these fields via
`textContent`, not `innerHTML`.

`solutionHashesFile` does not need to exist yet for *this* week's new
puzzle — the completion badge just shows "Grid complete" with no
match/mismatch comparison until either a later week's run bakes in the
official solve (Step 7), or a reference solve is captured now by
having someone solve it live in a Playwright browser window and
handing the finished grid back (see `../SKILL.md` "Reference solve for
the current week"). There is no on-site admin panel for this — that
was deliberately removed and stays removed.

## Step 5 — Add it to puzzles/index.json

Prepend a new entry (newest first):

```json
{ "id": "<id>", "date": "<date>", "title": "<title>", "file": "puzzles/<date>.json" }
```

## Step 6 — Validate before handing back

```bash
python3 -c "import json; json.load(open('puzzles/<date>.json')); json.load(open('puzzles/index.json'))"
```

Then serve the repo locally (`python3 -m http.server 8842`) and check in
a real browser (Playwright, or just open it) that:
- `document.getElementById('grid').children.length` is `SIZE*SIZE`
  (225 for a 15×15).
- The Across/Down list lengths on the page match Step 1's auto-numbering
  counts.
- The header (kicker/title/subtitle) and `<title>` show this week's
  puzzle, not a stale one.

Only move on to Step 7 once these checks pass.

## Step 7 — Bake in last week's official solve

Standard part of every weekly run, not optional busywork — do this
before reporting the whole pipeline done. `fetch_issue.py` (in
`fetch-issue/SKILL.md` Step 1) already cropped last (the prior) week's
printed solution grid to
`working-files/<the-prior-week's-date>/printed_solution_grid_CANDIDATE.jpg`
and merged `officialSolutionUrl`/`officialSolutionPage` into that
prior week's `meta.json`. Use it to upgrade that already-published
`puzzles/<prior-date>.json`:

1. Confirm the crop's bounds visually — re-crop tighter (see
   `extract_grid.py`-style cropping, or plain PIL) if other page
   content bled in, and upscale if letters aren't legible.
2. Transcribe the solved grid's letters. Use the prior week's
   already-published `pattern` field as ground truth for black-cell
   positions rather than re-reading them from the image — only the
   letters in white cells need transcribing, which also gives you a
   free cross-check (spot-verify a few words against that puzzle's own
   clue list, e.g. a themed answer you can recognize).
3. Compute `sha256hex(solutionSalt + word)` for every Across/Down word
   (same per-cell numbering algorithm `index.html`'s `computeNumbers()`
   uses: scan row-major, a cell starts a number if it starts an Across
   and/or Down entry) and write `<num><A/D>-<hash>` lines, one per
   entry, to that puzzle's `solutionHashesFile` path. Assert the
   resulting Across/Down number sets exactly match that JSON's existing
   `across`/`down` clue-number lists before trusting the output — a
   mismatch means a transcription error, not a grid-structure error
   (the pattern was already known-good).
4. Set `"solutionSource": "official"` and `"officialSolutionUrl"` (from
   that prior week's `meta.json`) on `puzzles/<prior-date>.json`.
5. Verify in a real browser: load `?puzzle=<prior-id>`, fill the grid
   via `input.dispatchEvent(new Event('input',{bubbles:true}))` with
   the transcribed letters, and confirm the completion badge reads the
   "match ... official answer key from a later issue" wording.
6. Delete the crop (`printed_solution_grid_CANDIDATE.jpg`, and any
   re-crop you made from `page.jpg`). Its letters now live in the hashes
   file, so the image is spent scratch — it's gitignored, and it doesn't
   stay on disk either.

Skip only if the crop is unusable or the prior week has no published
puzzle (e.g. a gap week) — note why in your final report if so, since
the default expectation is that this step runs every time.

Framing rules for the match/mismatch UI are in the repo's `CLAUDE.md`:
never call anything "wrong", never flag individual cells, always make
clear this is the official key, not live cell-by-cell grading.
