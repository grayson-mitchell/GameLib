---
created: 2026-08-24T00:00:00.000Z
title: "Two live dialog-shim collapse defects (VCRuntime 'don't show again', Snap checkbox) plus one dead-code site, across 10 native showMessageBox sites — and the still-unresolved native-vs-in-app policy question"
area: ui-dialogs
status: OPEN
severity: minor
files:
  - src/backend/platform/index.ts
  - src/backend/utils.ts
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/backend/storeManagers/storeManagerCommon/games.ts
---

## Rewrite notice (2026-09-07)

This is a **verified rewrite against HEAD**, not the original 2026-08-24 analysis. The original
is wrong on its headline claim and on parts of its census; both were independently re-confirmed
by the orchestrator and the planner on 2026-09-07 against every anchor cited below. Why it was
wrong:

- Its headline item — the EOS overlay remove confirmation rendering as a native dialog — was
  **fixed** by Phase 35 plan 26 (REQ-35-17, closes D-35-11-01). See "What has already closed"
  below.
- Its Trap 1 (the in-app `Dialog` primitive isn't really styled) was **fixed** by quick task
  `260820-kq0` round 3.
- Its Trap 2 (a rejecting dialog crashes the sidecar) was **mitigated** by a never-reject
  contract that now ships in `platform/index.ts`.
- Its census counted sites (`main.ts:585`, `updater.ts:35`, `updater.ts:59`) that no longer exist
  at HEAD, and every one of its surviving line numbers had drifted.

Meanwhile, defects introduced after the original was written — by the Rust dialog shim's narrower
contract — were recorded nowhere. They are this rewrite's headline. **Two are live** (both
platform-gated away from macOS); a third, first recorded here as live, was withdrawn the same day
as dead code — see section 3.

## The dialog-shim collapse defects (2 live, 1 withdrawn)

### 1. VCRuntime "Don't show again" is unreachable (Windows-only)

`src/backend/utils.ts:843` raises a 3-button dialog (`Download now` / `Ok` / `Don't show again`)
and branches on `response === 2` (`utils.ts:856`) to persist `configStore.set('skipVcRuntime',
true)`.

The shim it calls through, `src/backend/platform/index.ts`'s `showMessageBox`, maps the Rust
dialog's boolean result `true → response 0`, `false → response 1`
(`return { response: result === false ? 1 : 0, checkboxChecked: false }`). There is no path that
ever yields `2`. Under the Tauri sidecar, the third button is unreachable — clicking it can only
ever resolve to `0` or `1` — so `response === 2` can never fire and the "Don't show again"
preference can never be set. The warning will recur on every VCRuntime check, forever, with no
way to permanently dismiss it. **Windows-only** (the VCRuntime check only runs on Windows).

### 2. Snap warning "do not show again" checkbox can never be checked (Linux/Snap-only)

`src/backend/sidecar/appShellFlowRegistration.ts:389` raises the Snap-limitations warning with a
`checkboxLabel` ("Do not show this message again"); the caller's `.then((result) => { if
(result.checkboxChecked) { ... } })` (around `:402`–`:405`) is what persists the
`showSnapWarning: false` preference.

The shim hard-codes `checkboxChecked: false` on every return path — both the success arm
(`platform/index.ts`) and the catch/fail-safe arm. There is no code path in the shim that can
ever set it `true`. Under the Tauri sidecar the checkbox visually exists but its state is never
read back, so `result.checkboxChecked` is always `false` and the preference is never persisted.
The Snap warning recurs on every `frontendReady`, regardless of what the user checks.
**Linux/Snap-only** (`isSnap` gate).

### 3. Sideloaded-game unsaved-progress guard — DEAD CODE, not a live defect

> **CORRECTED 2026-09-07** — see the correction note at the end of this section. The first
> version of this rewrite called this a live, macOS-reachable, fail-open data-loss guard. That
> was wrong.

`src/backend/storeManagers/storeManagerCommon/games.ts:121` computes `choice` from
`dialog.showMessageBoxSync(browserGame, { buttons: ['Yes', 'No'], ... })` on the browser window's
`will-prevent-unload` event, then treats `choice === 0` ("Yes, quit") as leave-confirmed and calls
`event.preventDefault()` to allow the unload — the "Any unsaved progress might be lost"
confirmation for sideloaded browser games. `showMessageBoxSync` in the shim
(`src/backend/platform/index.ts:506`) is a logged no-op that only does `console.warn(...)` and
unconditionally `return 0` — and `0` is exactly the "Yes, quit" response.

**But that handler is never registered, so the no-op is never reached.** Four statements earlier,
`openNewBrowserGameWindow` (`games.ts:47`) calls `new BrowserWindow({...})` at `games.ts:87`.
`backend/platform`'s `BrowserWindow` is an object literal carrying only `getAllWindows`
(`platform/index.ts:753`) — `new` on it throws `TypeError` unconditionally. Construction throws,
the function never reaches `webContents.on('will-prevent-unload', ...)` at `:120`, and
`showMessageBoxSync` is never called.

There is no second shell where this path works. `package.json` contains zero `electron`
references, `node_modules/electron` does not exist, and `backend/platform` has no delegation
switch — it is the sole implementation on every platform. So this is not platform-gated like
defects 1 and 2; it is unreachable everywhere.

**A fix at `games.ts:121` alone would change no observable behaviour.** The owner of this surface
is **D-35-15-01** — "browser games broken under Tauri, been since sidecar existed... Status: open,
unowned. Pre-existing runtime break, NOT a regression"
(`.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md:1216`), whose
recorded real fix is a Tauri child window, "the same shape as the embedded store browser (spikes
016–018)". `games.ts:30` carries the same note inline. That is phase-sized work and out of this
todo's scope; the confirmation dialog should be reconsidered as part of it, not before it.

**Correction note (2026-09-07):** the original defect-3 claim in this rewrite was written from
the call site outward without a reachability check on its enclosing function — the same class of
error this file's own "Rewrite notice" was created to correct. Recorded rather than silently
edited so the next reader can see the mistake and its cause. The two remaining defects were
re-checked at the same time and both stand.

**Severity note:** defects 1 and 2 are each platform-gated inconveniences — a nag that will not go
away, on Windows and on Linux/Snap respectively. Neither is reachable on macOS. With defect 3
withdrawn, nothing here justifies `major`, so severity is `minor`.

## Common cause

All three defects trace to one thing: `src/backend/platform/index.ts`'s `showMessageBox` /
`showMessageBoxSync` shim has a contract **narrower than Electron's** along three independent
axes:

1. **At most two buttons.** The boolean-result mapping (`true`/`false` → `0`/`1`) cannot express
   a third button's response index. → Defect 1.
2. **No checkbox readback.** `checkboxChecked` is always hard-coded `false` on every return path.
   → Defect 2.
3. **No synchronous form.** `showMessageBoxSync` cannot cross the async `rustInvoke` transport, so
   it is a logged no-op that always returns `0`. Still a true property of the shim, but it
   currently has **zero live consumers** — its only call site (`games.ts:121`) is unreachable, per
   section 3. Axis 3 is therefore a latent trap for the next caller, not a present defect.

Any caller relying on a third button, a checkbox result, or a real synchronous prompt will
silently degrade under the sidecar rather than error — because each shim method still returns
successfully with a plausible-looking value. That is what makes axis 3 worth keeping on record
even with no consumer today.

## The census (10 live sites)

Excludes tests, `__mocks__`, `electronStub`, comment-only mentions, and the legitimate native
fallback arm at `src/backend/dialog/dialog.ts:45` (the `catch` arm of `showDialogBoxModalAuto`,
which intentionally falls back to a native dialog when the renderer IPC send fails). This
replaces the original's "~14" — that count included sites (`main.ts:585`, `updater.ts:35`,
`updater.ts:59`) that no longer exist at HEAD.

| Site | Role | Note |
|------|------|------|
| `src/backend/utils.ts:281` | `handleExit` / quit confirmation | INVERTED polarity, explicit `cancelId: 0` |
| `src/backend/utils.ts:343` | folder-not-found → force-uninstall | cancelId declared |
| `src/backend/utils.ts:843` | VCRuntime not installed | THREE buttons — **DEFECT 1** |
| `src/backend/utils.ts:863` | VCRuntime download-links info box | |
| `src/backend/utils.ts:978` | `ContinueWithFoundWine` | |
| `src/backend/utils.ts:1417` | Rosetta not found | OK-only |
| `src/backend/protocol.ts:180` | protocol-handler "not installed, install it?" | `cancelId: 1` |
| `src/backend/sidecar/appShellFlowRegistration.ts:389` | Snap warning | uses `checkboxLabel`/`checkboxChecked` — **DEFECT 2** |
| `src/backend/storeManagers/steam/library.ts:1772` | `promptI386Recovery` | fire-and-forget `void` |
| `src/backend/storeManagers/storeManagerCommon/games.ts:121` | sideloaded browser game `will-prevent-unload` | `showMessageBoxSync` — **DEAD CODE**, unreachable behind the `new BrowserWindow` throw at `:87` (D-35-15-01) |

## What has already closed

**A — the EOS headline item is FIXED (CLOSED).** Phase 35 plan 26 (REQ-35-17, closes
D-35-11-01): `src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts:173`'s
`remove(confirmed)` no longer calls `dialog.showMessageBox` at all — it only enforces a
fail-closed `confirmed !== true` gate at `:174`. The confirmation now happens app-styled in the
renderer, at `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx:250`
(`confirmRemoveEosOverlay`, via `showDialogModal`); only the affirmative button's `onClick` calls
`removeEosOverlay()`, passing the literal `true`. Regression test:
`src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/removeEosOverlayConfirmation.test.tsx`.

The structural insight this leaves behind, carried forward as a constraint on any future
migration: an **ASKING** dialog can never be moved to the renderer through the one-way
`showDialogBoxModalAuto` backend-dialog path (`src/backend/dialog/dialog.ts`) — that path only
sends a message outward, it has no way to carry an answer back. The answer has to be gathered
renderer-side and passed back in as an argument, the way `eos_overlay.ts`'s `remove(confirmed)`
now does.

**B — Trap 1 (the in-app `Dialog` primitive is not really styled) is FIXED.** Quick task
`260820-kq0` round 3 reimplemented the styling inside the primitive itself:
`src/frontend/components/UI/Dialog/components/Dialog.tsx:50` is a `styled(Paper)` override
(`backgroundColor: 'var(--modal-background)'`, `borderRadius: '10px'`), and `:128` sets MUI's own
`TransitionComponent={SlideUpTransition}` with `transitionDuration={500}`, replacing the dead
CSS rule's never-firing opacity/translateY entrance with MUI's supported mechanism. Nothing was
ever applied to the Paper via the dead CSS class, so no dialog was ever at risk of the
"permanently invisible" trap the original todo warned about.

**Residue only, COSMETIC, not blocking:** `src/frontend/components/UI/Dialog/index.css` still
carries dead `.Dialog__element` (`:10`, `:39`, `:43`), `.Dialog__header` (`:50`) and
`.Dialog__Close*` (`:64`, `:76`, `:103`) blocks as unused cruft. The one live rule is
`.Dialog__footer` (`:115`).

**C — Trap 2 (a rejecting dialog crashes the sidecar) is MITIGATED.**
`src/backend/platform/index.ts:459`'s `showMessageBox` forwards to the Rust transport and, on any
transport error or timeout, resolves `{ response: safeIndex, checkboxChecked: false }` rather
than rejecting — `safeIndex` is `options?.cancelId ?? (options?.buttons?.length ?? 1) - 1`
(`:486`), i.e. always the CALLER's own declared `cancelId`, never a positional heuristic.
`src/backend/sidecar/processGuards.ts` additionally installs a process-level
`unhandledRejection` guard as defence in depth. The never-reject contract the original todo asked
for already exists and is documented in place.

## What is still live from the original

**D — Trap 3 (inverted response semantics) is STILL LIVE.** `src/backend/utils.ts:281`
(`handleExit`): index 0 is the SAFE "No", index 1 is the DESTRUCTIVE "Yes" (killing an in-flight
install/download and exiting). It now carries an explicit `cancelId: 0` (CR-04), added precisely
because the shim's positional cancelId fallback would otherwise resolve to the destructive branch
on any transport error. This stands as a live constraint on any future migration of this site:
preserve its response polarity exactly.

## Suggested shape

1. **Fix the two live shim-collapse defects.** They are independent of the policy question below
   and can land first: extend the shim's 3-button mapping (or route the VCRuntime dialog through
   a 2-button + separate persisted-preference shape) for defect 1; wire a real checkbox-state
   round trip (or drop the checkbox and use a separate "don't ask again" mechanism) for defect 2.
   Both are platform-gated off macOS, so neither can be verified on the operator's own machine —
   scope accordingly.

   **Not in scope:** the sideloaded-game unload confirmation (section 3). It is dead code behind
   D-35-15-01's `new BrowserWindow` throw, and its real owner is that item's Tauri-child-window
   fix, which is phase-sized. Fixing the dialog call alone would change nothing observable.
2. **Decide the native-vs-in-app policy.** Which confirmations are legitimately OS-native (quit,
   updater, pre-window-ready, Rosetta) versus in-app (anything reached from a settings surface),
   and record the rule. This question from the original todo is still open and still applies to
   the surviving census sites.

## Notes

Deliberately no `resolves_phase:` field, carried over unchanged from the original — this todo is
not scoped to a single phase's completion and should not be auto-closed by one.

The filename still encodes the original's false "renders as a native system dialog" headline.
The path is kept stable deliberately (todos are referenced by path elsewhere); the frontmatter
`title` above is what's current.

Related, both **HISTORICAL** — retained as provenance for the two now-closed traps, not as
active hazards: [[stylesheet-can-be-wholly-dead-against-its-component]] (HISTORICAL: the
primitive is now genuinely styled at `Dialog.tsx:50`, per "What has already closed" B above) ·
[[sidecar-dialog-reject-crashes]] (HISTORICAL: `platform/index.ts:459` now provably never
rejects, per "What has already closed" C above).
