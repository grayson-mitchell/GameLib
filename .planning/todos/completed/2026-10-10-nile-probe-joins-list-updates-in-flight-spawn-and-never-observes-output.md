---
created: 2026-10-09T21:30:00.000Z
title: 'nile sign-in probe joins listUpdateableGames() in-flight list-updates spawn via the callRunner dedup key, so its onOutput never fires and the outcome reads unknown (F-49-R1-5, WR-01)'
area: auth
severity: medium
platform: any
ready: code
resolves_commit: d2e2c01ce
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/backend/launcher.ts
  - src/backend/signInProbe/runnerProbes.ts
  - src/backend/storeManagers/nile/library.ts
  - src/backend/signInProbe/classify.ts
---

# Same nile output, two different outcomes

Run 1 (`49-LIVE-GATE.md` § Run 1, F-49-R1-5). Launches 1-4, 9, 10: `nile outcome=healthy`.
Launches 6-7: `nile outcome=unknown`. The runner logs are identical in content (`[]` on stdout,
`ERROR [CLI]: No games installed` on stderr); the only visible difference is the order the two
lines were written. The classifier appears to decide on the first chunk seen. Make the nile
classification order-independent and pin it with a test that feeds both orders.

## Root cause corrected by the Phase 49 code review (49-REVIEW.md WR-01, 2026-10-09)

The "stdout/stderr interleaving" hypothesis above describes a symptom, not the cause.
`classifyNileOutput` is already order-independent over one capture. The real mechanism:
`probeNileSession()` (`signInProbe/runnerProbes.ts:78-100`) and
`NileLibraryManager.listUpdateableGames()` (`nile/library.ts:179-182`, reached at boot via
`checkGameUpdates`) issue the identical `['list-updates','--json']` command, and `callRunner`
dedupes in-flight commands by `[runner.name, commandParts].join(' ')` (`launcher.ts:1727`), a
key that ignores `abortId` and every other option. The loser of the race gets the shared
settled `ExecResult` back but its own `onOutput` is never invoked (`launcher.ts:1755`/`:1770`
are unreachable after the early return at `:1731`), so `capture.observed()` is false and the
classifier returns `unknown`. **A classifier-order test would pass today and not touch the
defect.** Fix upstream: give the probe's spawn a non-colliding identity (or include `onOutput`/
`abortId` in the dedup key, or let a joined caller also receive the output), and pin it with a
test that races the two callers.

## Fix (2026-10-09, inline quick fix)

`callRunner` now treats a caller that passes `onOutput` as non-joinable: it neither returns an
in-flight promise for the same argv nor registers its own promise as joinable (callers without an
observer keep the original dedup). Pinned in `launcher_callRunner.test.ts` with three cases; two
go red against the pre-fix `launcher.ts` (mutation-proven), the third is the dedup control.
Backend project 5624/5628 green (one unrelated parallel-run flake in `dxvkInstallRemove`, green
in isolation).
