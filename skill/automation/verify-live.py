#!/usr/bin/env python3
"""Wait for the pushed commit to go live on ccpx.fyi after a publish.

Stage C step 3 of RUNBOOK.md. The cloud sandbox's proxy blocks ccpx.fyi
itself (403), so this asks the Cloudflare API instead: it polls the ccpx
project's production deployments for up to 15 minutes until the one built from
the checked-out HEAD commit has finished with status success. It also checks the
local production build (dist/index.html, from Stage C step 1) has no
devExportBox. Exits 0 when live, 1 otherwise.

Needs CF_API_TOKEN_CCPX (Pages read on the ccpx project). Takes no arguments,
so the routine can allow exactly `python3 skill/automation/verify-live.py`.
"""

import json
import os
import subprocess
import sys
import time
import urllib.request

ACCOUNT = 'ee6dc5f16660ea40f92271ec5fc1ec2b'
BASE = ('https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT +
        '/pages/projects/ccpx/deployments')
TIMEOUT_S = 15 * 60
POLL_S = 20


def production_deployments(token):
    req = urllib.request.Request(BASE + '?env=production&per_page=10',
                                 headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req, timeout=30) as res:
        body = json.load(res)
    if not body.get('success', False):
        raise RuntimeError('list failed: %s' % body.get('errors', []))
    return body.get('result', [])


def main():
    token = os.environ.get('CF_API_TOKEN_CCPX', '')
    if not token:
        raise SystemExit('CF_API_TOKEN_CCPX is not set')
    want = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True,
                          text=True, check=True).stdout.strip()

    if os.path.exists('dist/index.html'):
        with open('dist/index.html') as f:
            if 'devExportBox' in f.read():
                print('dist/index.html contains devExportBox (preview build)')
                sys.exit(1)

    deadline = time.time() + TIMEOUT_S
    state = 'no production deployment for %s yet' % want[:7]
    while True:
        try:
            for dep in production_deployments(token):
                commit = dep.get('deployment_trigger', {}).get('metadata', {}).get('commit_hash', '')
                if commit != want:
                    continue
                stage = dep.get('latest_stage', {})
                state = '%s %s' % (stage.get('name', ''), stage.get('status', ''))
                if stage.get('name', '') == 'deploy' and stage.get('status', '') == 'success':
                    print('live:', want[:7])
                    return
                if stage.get('status', '') == 'failure':
                    print('production build failed for %s: %s' % (want[:7], state))
                    sys.exit(1)
                break
        except Exception as e:  # network hiccup
            print('poll error:', e)
        if time.time() >= deadline:
            print('not live after 15 min: %s' % state)
            sys.exit(1)
        time.sleep(POLL_S)


if __name__ == '__main__':
    main()
