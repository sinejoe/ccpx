# Unattended weekly run (cloud routine)

The `ccpx weekly crossword` cloud routine follows this file. It fires every
2 hours from 8am to midnight ET, and each fire does at most one stage of the
Weekly MO, then exits. The fire has no memory of earlier ones, so it works
out where things stand from **git + Gmail** every time. The user is not at
a computer, and every human gate is an email they answer by reply.

This file overrides the interactive habits in `skill/SKILL.md` /
`.claude/project-dry.md` where they conflict (e.g. "give the user the URL"
means "email it"). Everything else in those files applies. Read
`.claude/project-dry.md` and `skill/SKILL.md` before doing any stage work.

## Constants

- Target puzzle: the most recent **Friday (America/New_York) on or before
  today**. `DATE` = `YYYY-MM-DD`, `ID` = `DATE` without dashes.
- Work branch: `claude/solve-wip` (one reusable branch, see "Git rules").
- Preview: `https://solve-<ID>.ccpx.pages.dev`, deployed by direct upload.
- Cloudflare: account `ee6dc5f16660ea40f92271ec5fc1ec2b`, Pages project
  `ccpx`, token in env var `CF_API_TOKEN_CCPX` (Pages Edit). Never print it.
- Email: to `sansjoe@gmail.com`; if a send fails, retry to
  `joe@sinelabs.com`. One Gmail thread per week, subject
  `ccpx <DATE>: <topic>` for the first message. Every later message is a
  **reply in that thread**.
- **Bot marker:** the Gmail connector sends as the user, so sender can't
  tell bot from human. Every message the routine sends starts with the
  line `[ccpx-bot]`. A thread message whose body does not start with
  `[ccpx-bot]` is from the user. Judge only the reply's own text, above
  its "On ... wrote:" line, after trimming leading whitespace: the user's
  replies quote the whole bot mail, marker included.
- Gmail rewrites every URL in stored mail to
  `https://www.google.com/url?q=<real>&...`. Unwrap `q=` before using any
  URL read back from the thread. Leave the links in outgoing mail as they are.
- **Email style: short and plain.** The user reads these on a phone and
  wants them easy to take in. Send only what they need to act on: the
  marker, one or two lines of substance and the ask. No reports, no
  background, no "helpful" notes, no list of what was checked or how, no
  tool or infra details. Anything that went fine goes unmentioned. If
  something broke, say what's broken and what you need from them in one
  or two sentences.
- Setup each fire: `pip install -q pillow numpy` and `npm ci`.

## Work out the stage (every fire)

1. `git fetch origin`. Check whether `puzzles/<DATE>.json` exists on
   `origin/main` and whether its `solution-hashes.txt` exists there.
2. Check `origin/claude/solve-wip` the same way.
3. Search Gmail for the week's thread: `subject:"ccpx <DATE>"`. Read every
   message, then sort them into bot vs. user by the marker.

Then pick the **first** stage that applies:

| Situation | Stage |
|---|---|
| On `origin/main` with hashes, preview gone, "published" mail sent | **Done.** Exit silently. |
| Not built anywhere | **A. Build** |
| Built on the wip branch, no preview email sent yet | **A** (resume at deploy + email) |
| Preview email sent, no user reply containing `crossword:<ID>=` | **Wait.** Exit silently. |
| User solve received, no verdict/question mail after it | **B. Answer check** |
| Bot asked a question, user replied after it | **B** (apply the answer, re-check) |
| Bot mail containing "Reply OK to publish." sent, user replied yes/ok/ship/publish after it | **C. Publish** |
| Verdict sent, user replied with anything else | Treat as a question/correction: **B** |
| Otherwise | **Wait.** Exit silently. |

If a fire can't decide from the evidence, it does nothing destructive.
It sends one short email that describes what it sees and asks, then exits.

## Stage A — Build and send the preview

1. Run `python3 skill/scripts/fetch_issue.py --date <DATE>`.
   - **Issue not on Issuu yet** (script reports no matching doc/byline):
     if it is Friday 10pm ET or later and no thread for `<DATE>` exists,
     send ONE email, subject `ccpx <DATE>: issue not on Issuu yet`, body
     "will keep checking." Otherwise send nothing. Exit.
   - Special issue / no crossword found: email that, then exit.
2. Do `fetch-issue` Step 2, then all of `build-puzzle-json` Steps 1–5,
   exactly as written, including the grid/numbering cross-check. **If the
   cross-check doesn't pass after a careful re-crop/re-parse, stop.**
   Email one line saying the grid didn't read cleanly and the preview is
   on hold, commit nothing and exit. A wrong grid must not
   reach the user's iPad.
3. Validation (`build-puzzle-json` Step 6): Playwright and Chromium are
   preinstalled in the cloud env (`npm root -g`, `/opt/pw-browsers`); don't
   run `playwright install`. Use a short headless script. If it fails
   anyway, do the structural checks in Node (JSON parses, number sets
   match, 225 cells, index.json prepended) and leave it out of the email.
4. Bake last week's official key (`build-puzzle-json` Step 7, and
   `skill/SKILL.md` "Baking in the official solve"). The browser
   verification there can use the same fallback: compare the transcribed
   hashes with last week's existing reference hashes. Entries that
   differ are not errors. Collect them for the email: "the printed key
   has X where the submitted solve had Y". Never phrase this as anyone
   being "wrong".
5. Commit to the wip branch (see "Git rules"): one commit for the new
   puzzle + working-files, plus the bake, the same as recent `main`
   commits (`git log -5`). Push.
6. `CCPX_PREVIEW=1 npm run build`, then
   `CLOUDFLARE_API_TOKEN="$CF_API_TOKEN_CCPX" CLOUDFLARE_ACCOUNT_ID=ee6dc5f16660ea40f92271ec5fc1ec2b npx wrangler pages deploy dist --project-name=ccpx --branch=solve-<ID>`.
   The sandbox blocks curl to `*.pages.dev`. Confirm instead that the CF
   API lists the deployment with status success, and that `dist/index.html`
   contains `devExportBox`.
7. Send the email: subject `ccpx <DATE>: ready to solve`. Body is
   exactly this, nothing more:
   - `[ccpx-bot]`
   - the puzzle title
   - the preview URL
   - "When done, paste the line from the box under the grid as a reply."
   - Only if last week's printed key differed from the submitted solve:
     one line, e.g. "Last week's printed key had SNOWE where the solve had
     SLOWE." Say nothing when it matched.

## Stage B — Answer check

1. Parse the user's newest `crossword:<ID>={"rows":[...]}` from the
   thread (and any plain-language answers to earlier questions, e.g.
   "it's N"). Apply those answers to the grid.
2. Run the answer-check gate from `skill/SKILL.md` "Reference solve"
   step 3 in full: pattern/empty-cell check, every answer read against its
   clue, web-check anything obscure, recent or pop-culture.
3. **Open questions:** reply in the thread with `[ccpx-bot]` and each
   conflict as a short question, nothing else. Example: "23A/11D cross: SNOWE/NIGHTMANURE or
   SLOWE/LIGHTMANURE?". Never "wrong", no cell-by-cell dump. Exit and
   wait.
4. **Clean:** write `puzzles/<DATE>.solution-hashes.txt` (Across first,
   then Down, each sorted by number) and commit it **separately** on
   the wip branch, the same as recent hash commits. Push. Then reply
   with just `[ccpx-bot]` and "All answers check out. Reply OK to publish."
   Never publish in this stage. (The local-only
   `working-files/<DATE>/solution.txt` plaintext copy can't persist from the cloud; the next
   local session writes it from the solve string in this thread.)

## Stage C — Publish (only after an explicit OK reply)

1. `node build.js` (default production build) must succeed.
2. Move `main` to the wip branch head (see "Git rules") and push `main`.
3. Poll `https://ccpx.fyi/puzzles/index.json` (cache-busting query) for
   up to 15 minutes until `<ID>` is newest. Confirm `https://ccpx.fyi/`
   does not contain `devExportBox`.
4. Delete every preview deployment for branch `solve-<ID>`, and any
   other `solve-*` preview older than this week. Use
   `GET .../pages/projects/ccpx/deployments?env=preview` (the branch is in
   `deployment_trigger.metadata.branch`), then
   `DELETE .../deployments/<id>?force=true`, then re-list and confirm
   zero remain. Never delete a production deployment.
5. Reply with `[ccpx-bot]` and "Published: https://ccpx.fyi". If any step
   failed, say in one or two sentences which one and what's still up,
   and don't claim success.

## Git rules

The cloud git proxy **cannot delete remote branches**, and it probably
can't force-push either. So the routine reuses one branch and only ever
fast-forwards:

- Start of Stage A: `git checkout -B claude/solve-wip origin/main`. If
  `origin/claude/solve-wip` exists and is **not** an ancestor of
  `origin/main` (an unfinished or abandoned earlier week), don't
  overwrite it. Push to `claude/solve-<ID>` instead and mention it in the
  email.
- Publishing: if `origin/main` moved since the branch was cut, run
  `git merge origin/main` on the wip branch first (no rebase, no force).
  Then `git push origin claude/solve-wip:main`. Since that's a
  fast-forward, the wip branch head is an ancestor of `main` again,
  ready for next week.
- Never force-push and never push to `main` outside Stage C. Never touch
  other branches.
- Pushes to `claude/*` don't build a Cloudflare preview: the Pages
  project excludes that pattern. Previews come only from the
  direct-upload deploy in Stage A.

## Hard rules (from `CLAUDE.md` / project-dry, restated because they're easy to break unattended)

- Solve framing: never "wrong", no per-cell flags. It's *a* submitted
  solve, not an official key.
- Puzzle data and code/doc changes go in separate commits. This routine
  only ever makes puzzle-data commits. It never edits `index.html`,
  `build.js` or this file.
- Never print or commit a secret.
- Don't hand-transcribe the grid or guess a clue's direction from its
  printed column (see `CLAUDE.md`).
