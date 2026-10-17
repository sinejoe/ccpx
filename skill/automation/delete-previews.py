#!/usr/bin/env python3
"""Delete the ccpx Cloudflare Pages preview deployments left by a week's run.

Stage C step 4 of RUNBOOK.md. Deletes every *preview* deployment whose branch
is `claude/solve-wip` or starts with `solve-`, then re-lists and exits 1 if
any remain. Never touches production deployments.

Needs CF_API_TOKEN_CCPX (Pages Edit on the ccpx project). Takes no arguments,
so the routine can allow exactly `python3 skill/automation/delete-previews.py`.
"""

import json
import os
import sys
import urllib.request

ACCOUNT = 'ee6dc5f16660ea40f92271ec5fc1ec2b'
BASE = ('https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT +
        '/pages/projects/ccpx/deployments')


def api(method, url, token):
    req = urllib.request.Request(url, method=method,
                                 headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req, timeout=30) as res:
        body = json.load(res)
    if not body.get('success', False):
        raise SystemExit('%s %s failed: %s' % (method, url, body.get('errors', [])))
    return body


def targets(token):
    found = []
    page = 1
    while True:
        body = api('GET', '%s?env=preview&per_page=25&page=%d' % (BASE, page), token)
        result = body.get('result', [])
        for dep in result:
            if dep.get('environment', '') != 'preview':
                continue
            branch = dep.get('deployment_trigger', {}).get('metadata', {}).get('branch', '')
            if branch == 'claude/solve-wip' or branch.startswith('solve-'):
                found.append((dep.get('id', ''), branch))
        total = body.get('result_info', {}).get('total_pages', 1)
        if page >= total or not result:
            return found
        page += 1


def main():
    token = os.environ.get('CF_API_TOKEN_CCPX', '')
    if not token:
        raise SystemExit('CF_API_TOKEN_CCPX is not set')

    for dep_id, branch in targets(token):
        api('DELETE', '%s/%s?force=true' % (BASE, dep_id), token)
        print('deleted', dep_id, branch)

    left = targets(token)
    for dep_id, branch in left:
        print('still up', dep_id, branch)
    print('previews left:', len(left))
    sys.exit(1 if left else 0)


if __name__ == '__main__':
    main()
