---
created: 2026-08-25
source: /gsd-execute-phase 34.6 code review gate (CR-01, 34.6-REVIEW.md)
severity: critical
status: RESOLVED
introduced_by: 34.6-11
resolves_phase: 34.6
resolved: 2026-08-25
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

## Fix direction — DECIDED (gap plans 34.6-18 / 34.6-19)

The guard's root is the wrong root. Containment against `defaultInstallPath` is not the property
either channel needs. Candidates: drop containment for these two channels and rely on the
user's explicit picker selection as the authorisation; or contain against the set of *configured
library roots* rather than the single default; or validate the path is a directory the user can
write to rather than that it sits under a specific prefix. Whichever is chosen, the regression
test must use an out-of-root path, since that is the case the current fixtures cannot express.

**Adopted: drop `defaultInstallPath` containment for `moveInstall`/`importGame`; validate SHAPE
only.** `assertContainedPath(defaultInstallPath, path, ...)` was removed from both handlers and
replaced by a new `assertPlausibleAbsolutePath(path, context)` in the same module: absolute
(after backslash normalisation), no `..` segment, no NUL byte, non-empty after trim, and a
string.

**Why this and not something stricter — two independent reasons, both checkable:**

1. **The containment control was CIRCULAR against its own named adversary.** The threat
   `T-34.5-C6-49-03` names is a compromised/tampered RENDERER supplying a hostile `path`. But
   the containment root, `defaultInstallPath`, is written by that same renderer:
   `src/frontend/screens/Settings/components/DefaultInstallPath.tsx` sets it through
   `useSetting('defaultInstallPath', ...)`, which reaches the renderer-writable send-kind
   channel `setSetting` (`src/backend/sidecar/settingsFlowRegistration.ts:160`;
   `src/backend/main.ts:1022` on the Electron leg). A renderer that can call `moveInstall` can
   first call `setSetting` with `defaultInstallPath` set to the filesystem root and then move
   anywhere. The control asserted a property the adversary could grant itself — it read as a
   boundary and was not one.
2. **The real trust boundary for these two channels is the OS-native directory picker.**
   `moveInstall`'s path comes from `window.api.openDialog({ properties: ['openDirectory'], ... })`
   (`GameSubMenu/index.tsx` `onMoveInstallYesClick`); `importGame`'s comes from
   `PathSelectionBox` in `InstallModal/ImportDialog/index.tsx`. `openDialogCallback`
   (`src/backend/utils/openDialog.ts`) applies zero root enforcement by design —
   `defaultPath` is the dialog's STARTING directory only.

**Rejected alternative A — widen the root to "anywhere the picker can reach."** That is
containment-in-name-only: a guard that asserts nothing while reading as if it asserts
something. This project already carries a recorded pattern of gates that measure the wrong
property; adding another would have been a worse outcome than removing the check honestly.

**Rejected alternative B — gate on "the path was returned by a real `openDialog()` this
session."** Requires new session-token plumbing across the preload seam for a threat the picker
already bounds, and invents cross-process state that can desync (a picker result that outlives
its token, or a token that survives a reload, both produce a false rejection of a legitimate
move). Disproportionate to a local desktop launcher at ASVS L1.

`assertContainedPath` / `PathContainmentError` stay exported and byte-identical — retained as
the shared containment primitive for a future consumer (see the adjacent Wine-prefix todo
below) — but now have ZERO production call sites.

## Closure evidence

- Landing commits: `402b48c50`, `6d30448e3`, `df03d47d8` (plan 34.6-18, per
  `34.6-18-SUMMARY.md`); `1a549bd28`, `6af1bd4d5` (plan 34.6-19, per `34.6-19-SUMMARY.md`), which
  additionally made the rejection user-visible via a dialog.
- RED-proof file: `evidence/34.6-18-RED-crossroot.txt`, captured against the pre-fix source
  before `assertPlausibleAbsolutePath` landed.
- **This todo's closure is not the same event as REQ-34.6-05's closure.** REQ-34.6-05 in
  `.planning/REQUIREMENTS.md` stays un-ticked pending the live re-drive contracted in
  `34.6-21-PLAN.md`; that plan flips REQ-34.6-05 back to `[x]` only if the drive returns PASS.
