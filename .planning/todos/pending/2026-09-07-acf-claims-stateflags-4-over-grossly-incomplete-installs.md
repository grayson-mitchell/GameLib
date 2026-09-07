---
created: 2026-09-07
title: "Two GameLib-written ACFs claim StateFlags=4 (complete) over grossly incomplete installs — Steam will never verify or repair them"
area: steam-depot
status: OPEN
severity: critical
split_from: .planning/todos/pending/2026-08-27-steam-depot-install-fails-with-unclassified-generic-error.md
debug_session: .planning/debug/steam-depot-unclassified-generic-error.md
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/reconcile.ts
---

## Why this is split out

Found while actioning the 2026-08-27 UNCLASSIFIED-generic-error todo. It is a
**distinct and more severe defect** than the diagnostic gap that todo asked about,
it affects live user data on this machine right now, and it is not what that todo
was about. Recorded separately rather than folded in.

## Measured 2026-09-07

Swept all 19 GameLib-written ACFs (identified by the presence of
`BytesToDownload`/`BytesDownloaded`, which bottled-Steam-written manifests omit —
that distinction is what makes this NOT the case dismissed as `not-a-bug` in
`.planning/debug/steam-native-false-completion.md`) and compared each
`SizeOnDisk` against real bytes on disk:

| appId | title | StateFlags | claimed | real on disk | delta |
| --- | --- | --- | --- | --- | --- |
| 38410 | Fallout 2 | **4** | 591,399,306 | 258,221,501 | **-56.3%** |
| 718850 | Age of Wonders Planetfall | **4** | 17,151,298,416 | 3,560,381,799 | **-79.2%** |

The other 17 match within 0.0%. `StateFlags "4"` means full ownership — **Steam
runs no verify pass**, so neither install will ever be detected or repaired. The
user gets a game that silently does not work.

## Two DIFFERENT shapes, do not assume one cause

- **38410** — one manifest entry (`master.dat`, ~333 MB) exists on disk as an
  empty DIRECTORY. Shortfall is byte-exactly that one file (333,177,805).
- **718850** — 1315 files present, 24 empty dirs, 13.6 GB absent spread across many
  files. **Not established**: this may instead be unowned/unselected DLC depots
  entering the `selectAllDepots` base+DLC union, which would make its `SizeOnDisk`
  overstatement a plan-accounting bug rather than a download failure.

## Suspected mechanism (NOT established)

`SizeOnDisk` for 38410 is byte-exactly `InstalledDepots` 38414 (88,913,882) +
38415 (502,485,424) — a **manifest-derived sum**. `finalizeToSteam`'s own doc
comment says it must never be one:

> measure REAL bytes on disk (never a manifest-derived sum — spike 001: a summed
> total overshoots multi-depot installs by 236MB)

For a genuinely complete install the sum and the real measurement coincide, so
this is only observable on incomplete ones — which is exactly where it matters and
exactly where no test looks.

Separately, `canWriteFullOwnership` requires `failures.length === 0 &&
allFilesVerified && allModesApplied`. For 38410 that gate plausibly passed
*legitimately*: if `master.dat`'s plan entry carried `DIRECTORY_FLAG (64)`, the
mkdir succeeds, `reconcile.ts`'s `directoryVerified` passes on the retry, and no
failure is ever recorded. If so the defect is upstream in flag handling, and the
gate is an accessory rather than the cause.

## What to do

1. Determine whether `SizeOnDisk` is written from a real on-disk measurement or a
   manifest sum, and pin it with a test against an INCOMPLETE install (the only
   case that discriminates).
2. Decide whether the completeness gate should independently cross-check measured
   bytes against the manifest total before granting StateFlags=4 — i.e. fail closed
   to the 1026 verify-handoff on a material shortfall, which is exactly the
   recovery path that exists for this.
3. Establish 718850's shape before assuming it shares 38410's cause.

## Live damage, not yet repaired

Both ACFs are still on disk claiming completeness. Repair is a user decision (Steam
"Verify integrity of game files", or reinstall) — **not** something to do silently
while investigating, and deliberately not done here.
