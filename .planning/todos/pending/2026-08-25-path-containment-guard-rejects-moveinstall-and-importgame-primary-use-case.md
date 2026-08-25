---
created: 2026-08-25
source: /gsd-execute-phase 34.6 code review gate (CR-01, 34.6-REVIEW.md)
severity: critical
status: pending
introduced_by: 34.6-11
---

# The 34.6-11 containment guard rejects the PRIMARY use case of both `moveInstall` and `importGame`

## The defect

Plan 34.6-11 added `assertContainedPath` as the first statement of both channels:

```ts
// src/backend/sidecar/installFlowRegistration.ts  (moveInstall ~:258, importGame ~:342)
assertContainedPath(
  GlobalConfig.get().getSettings().defaultInstallPath,
  path,
  'moveInstall' | 'importGame'
)
```

Both features are **designed to reference locations outside that root**:

- **`moveInstall`** is the "move to another drive" action (`GameSubMenu/index.tsx:99-110`,
  dialog copy `box.move.message`). Its picker passes `defaultPath: defaultInstallPath`, but
  that is only the dialog's **starting directory** — `properties: ['openDirectory']` lets the
  user pick anything. Moving to another drive is by definition outside the default root.
- **`importGame`** imports an **already-installed** game
  (`InstallModal/ImportDialog/index.tsx:68-80`). The path comes from a free path selection of
  wherever the game already lives, which is typically not under the default install path.

So the guard throws `PathContainmentError` on exactly the input each feature exists to accept.

## Verification performed

Confirmed by reading both call sites and both frontend callers directly, not inferred from the
review. `defaultPath` was specifically checked and is not a constraint on the returned value.

## Why the phase's own gates did not catch it

`34.6-11-SUMMARY.md`'s residual analysis evaluated only the **security** direction — whether the
root is user-reconfigurable and therefore widens the boundary. It never asked the converse
question: *do legitimate inputs even satisfy this constraint?* The channel-level tests use
synthetic paths manually placed inside the mocked root, so the fixtures cannot express the
real-world case. Two valid requirements (harden renderer-supplied paths; let users move games
to another drive) interacted into a defective contract — the failure shape this project has
recorded before as needing review of *pairs*, not items.

The phase's live gate did not cover it either: neither `moveInstall` nor `importGame` was driven
against an out-of-root path in `34.6-LIVE-GATE.md`.

## Related but distinct — do not merge

- `2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects.md` — a *different*
  blocker on the same feature (rsync flags openrsync rejects). Move is therefore blocked on
  macOS twice, for two unrelated reasons.
- `2026-08-24-importgame-wineprefix-wineversion-not-contained-by-34-6-11.md` — the deliberately
  accepted residual on the *other* arguments. That one is under-restriction; this one is
  over-restriction.

## Fix direction (not yet decided)

The guard's root is the wrong root. Containment against `defaultInstallPath` is not the property
either channel needs. Candidates: drop containment for these two channels and rely on the
user's explicit picker selection as the authorisation; or contain against the set of *configured
library roots* rather than the single default; or validate the path is a directory the user can
write to rather than that it sits under a specific prefix. Whichever is chosen, the regression
test must use an out-of-root path, since that is the case the current fixtures cannot express.
