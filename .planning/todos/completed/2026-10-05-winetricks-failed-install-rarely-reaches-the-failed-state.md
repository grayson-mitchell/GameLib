---
created: 2026-10-05T00:00:00.000Z
title: "A failed winetricks install often never shows \"Install failed / Retry\" — buffered error lines are dropped on exit and the exit code is ignored"
area: wine
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 44"
files:
  - src/backend/tools/index.ts:704-711
  - src/common/winetricks/deriveRowState.ts:107-109
---

## Problem

REQ-44-20's per-verb error attribution only sees what progress events carry. On `exit` the backend
sends `['Done']` and clears the 1s interval; lines buffered since the last tick (usually the final
error lines) are dropped. The exit code is never checked; attribution relies only on a `' err'`
substring test. The 44-LIVE-GATE never reached the Errored state, so this was never observed.

## Failure scenario

winetricks prints its abort message and exits within the same second. The row goes back to
Available with no Failed badge, no Retry and no error text in the log.

## Suggested fix

On `exit`, flush pending `executeMessages` before sending Done; include the exit code or a `failed`
flag in the Done payload and attribute a non-zero exit to the verb.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

Mechanism confirmed: the `exit` handler sent `['Done']` and cleared the interval without flushing
`executeMessages`, and ignored the exit code; `attributeProgressEvent` had only the `' err'`
substring test.

**Changed.**

- `src/backend/tools/index.ts`: on `exit`, the interval is cleared, any buffered lines are flushed
  in one last progress event (tagged with the run's verb), a non-zero or signal exit is logged, and
  `Done` carries `failed: code !== 0`.
- `src/common/types/ipc.ts`: the `progressOfWinetricks` payload gains optional `failed`.
- `src/common/winetricks/deriveRowState.ts`: `attributeProgressEvent` flags the verb when
  `failed === true`, in addition to the unchanged `' err'` test. An untagged run never flags.
  `deriveRowState` precedence is unchanged: with the verb flagged, the row derives `errored` once
  `installing` clears.

**RED** (unfixed product code): `winetricksInstallLifecycle.test.ts` flush case (`doneIndex` 0 --
no event before Done) and both exit-code cases (no `failed` key); `deriveRowState.test.ts` "a
failed Done flags the verb even with no error-looking line" and "the flagged verb derives to
errored once the install has stopped"; `remountSafety.test.tsx` "a failed Done (non-zero
winetricks exit) flags the verb errored".

**GREEN**: all pass, with the checks listed in the double-click todo's resolution.

**Not verified.** No live run, so it is unmeasured whether real winetricks (or `umu-run
winetricks`) exits non-zero for every failure, or ever for something benign. Output that arrives
after `exit` but before `close` is still not sent: Done stays on `exit` so a lingering
`wineserver` holding the pipes cannot delay it. Noticed and not changed: every progress event
re-sends the whole `executeMessages` buffer (it is never emptied), so the dialog log repeats lines
on each tick -- pre-existing and out of scope.
