#!/usr/bin/env python3
"""Wait for the newest puzzle to go live on ccpx.fyi after a publish.

Stage C step 3 of RUNBOOK.md. Reads the newest puzzle id from the checked-out
puzzles/index.json, polls https://ccpx.fyi/puzzles/index.json (cache-busted)
for up to 15 minutes until that id is first, then checks the live page has no
devExportBox. Exits 0 when live, 1 otherwise.

Takes no arguments, so the routine can allow exactly
`python3 skill/automation/verify-live.py`.
"""

import json
import sys
import time
import urllib.request

SITE = 'https://ccpx.fyi'
TIMEOUT_S = 15 * 60
POLL_S = 20


def fetch(path):
    url = '%s%s?cb=%d' % (SITE, path, int(time.time() * 1000))
    req = urllib.request.Request(url, headers={'User-Agent': 'ccpx-verify-live'})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode('utf-8')


def main():
    with open('puzzles/index.json') as f:
        local = json.load(f)
    if not local:
        raise SystemExit('puzzles/index.json is empty')
    want = local[0].get('id', '')
    if not want:
        raise SystemExit('newest entry in puzzles/index.json has no id')

    deadline = time.time() + TIMEOUT_S
    newest = ''
    while True:
        try:
            live = json.loads(fetch('/puzzles/index.json'))
            newest = live[0].get('id', '') if live else ''
        except Exception as e:  # network hiccup or a deploy in progress
            print('poll error:', e)
        if newest == want:
            break
        if time.time() >= deadline:
            print('not live after 15 min: newest is %r, want %r' % (newest, want))
            sys.exit(1)
        time.sleep(POLL_S)

    if 'devExportBox' in fetch('/'):
        print('live, but the page contains devExportBox (preview build on production)')
        sys.exit(1)
    print('live:', want)


if __name__ == '__main__':
    main()
