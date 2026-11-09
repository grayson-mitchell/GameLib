---
created: 2026-11-09T22:40:00.000Z
title: 'Cancelling a stale Steam queue head deletes a complete install (data loss)'
area: steam-install
severity: critical
platform: any
ready: code
files:
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/storeManagers/steam/cancelDelete.ts
  - src/backend/storeManagers/steam/gameInstallDepot.ts
---

Severity is `critical` because data was lost: under the triage vocabulary, data loss is critical.

## What happened (73-18 live gate, 2026-11-09, Rust pipeline default)

1. Project Zomboid (108600) was mid-install in GameLib when GameLib was Force Quit (UAT item 9).
   It stayed in the persisted download queue as the head.
2. The Steam client then found GameLib's `StateFlags 1026` appmanifest in the real library,
   finished the download itself, and marked it Fully Installed at 22:17:57 (content_log:
   `AppID 108600 state changed : Fully Installed`, BuildID 25485521).
3. On the next launch the queue logged `108600 is a persisted Steam queue head — surfacing as
   resumable, NOT auto-resuming on launch`.
4. At 22:32:40 the operator added DREDGE to the queue. Starting the queue started the stale
   head 108600 first, resolving `installdir ... from acf` of the now-complete install.
5. The operator cancelled it: `[depot-rust] outcome appId=108600 mode=install status=cancelled
   acf=1026 ... bytes=0` (22:32:54). The no-op job's finalize rewrote Steam's `StateFlags 4`
   manifest to 1026.
6. `SteamCancelDelete: removed partial install for appId 108600 (.../common/ProjectZomboid)`
   (22:32:57) deleted the complete 8.2 GB tree and its appmanifest. Zomboid is now
   uninstalled.

## Root cause (three layers, any one of them breaks the chain)

- **The queue head is never revalidated.** A persisted Steam queue head is not dropped, or
  rechecked, when the app has become fully installed outside GameLib (Steam client takeover,
  manual install). Starting the queue for another title starts it anyway.
- **A cancelled job downgrades a complete manifest.** A job that fetched 0 bytes over a tree
  that was complete before it started still finalizes `StateFlags 1026` on cancel.
- **Cancel-delete reads the wrong manifest state.** `cancelDelete.ts` refuses only when the
  appmanifest has `StateFlags & 4`. It reads the manifest *after* the cancelled job's finalize
  has rewritten it, so the guard sees 1026 and treats the pre-existing complete install as
  "partial".

## TS pipeline exposure

This is very likely not Rust-specific. The queue and cancel-delete layers are shared TS code,
and the `cancelDelete.ts` header says the TS `finalize()` "writes appmanifest_<appId>.acf ...
on every outcome, cancel included", so the TS path would downgrade the manifest the same way.
Not reproduced on `GAMELIB_DEPOT_PIPELINE=ts`.

## Fix direction

- Revalidate a persisted Steam queue head against the on-disk appmanifest (StateFlags 4 and
  buildid current) before starting it, and drop it if it is already installed.
- Capture the manifest's StateFlags before the job starts. Cancel-delete must refuse if the
  title was installed (`& 4`) at job start, whatever finalize wrote afterwards.
- Consider making a cancelled job that fetched 0 bytes leave an existing `StateFlags 4`
  manifest untouched.

Regression test: a queue head whose manifest flips to 4 while it is queued, cancelled after
starting, must leave the tree and manifest in place.

Evidence: `73-UAT.md` Gaps (phase 73). The full log is in the 73-18 executor's scratchpad
(not committed).
