---
created: 2026-11-05T12:00:00.000Z
title: "Downloads tab loses its completed-download history after navigating away and back"
area: downloads
files:
  - src/frontend/screens/DownloadManager/index.tsx (finished list load, lines 67-71; clear handlers, 77-91)
  - src/backend/downloadmanager/downloadqueue.ts (addToFinished, getQueueInformation)
  - src/frontend/helpers/electronStores.ts (downloadManagerStore)
severity: medium
platform: any
ready: live-gate
---

## Problem

Reported by the operator on 2026-11-05: open the Downloads tab, see the completed
downloads history, switch to another tab, come back, and the history is gone.

Not yet reproduced or diagnosed. The screen keeps the list only in component state
(`finishedElem`) and refills it on mount from `getDMQueueInformation().finished`,
which the backend reads from its `downloadManager` store `'finished'` key. So the
list is empty on return only if that backend key is empty at that moment.

Candidates to check, unverified:

- The clear handlers write `'finished'` through the frontend `downloadManagerStore`.
  If that store is not the same backing file the sidecar's `downloadManager` store
  reads, the two can diverge. Separately, check whether anything writes `[]` there
  without a Clear click.
- Something on the backend resets or prunes `'finished'` between visits
  (`pruneUnknownRunnerElements`, or an entry whose runner fails `isRunner`).
- Steam-managed downloads (`SteamManagedItem`) may show in the live view but never
  pass through `addToFinished`, so they would not survive a remount.

Note: another session had uncommitted DownloadManager work in the tree on
2026-11-05. Re-check against HEAD before diagnosing.

## Solution

Reproduce first: finish a download (one Epic/GOG, one Steam), leave the Downloads
tab, come back. Record which entries vanish and what `'finished'` holds in the
sidecar's store at that moment. Fix depends on which candidate holds.

Live gate: completed entries persist across tab switches and across an app
restart, and Clear still empties the list.

## Resolution

Resolved 2026-11-10. Plan 69-12 moved the finished list into the
`downloadsState` store (refresh and clear actions, registered at boot), so it
no longer depends on the Downloads tab remounting. Confirmed live in the Phase
69 D-16 gate (69-UAT.md items 7, 8 and 9 all pass, including across restart).
