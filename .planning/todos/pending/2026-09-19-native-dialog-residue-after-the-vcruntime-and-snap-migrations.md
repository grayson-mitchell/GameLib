---
created: 2026-09-19
title: "Native dialog residue after the VCRuntime and Snap migrations: a dead-code confirmation, a polarity trap, cosmetic dead CSS, and the shim's latent axis-3 gap"
area: ui-dialogs
severity: minor
platform: any
ready: code
source: "quick-260919-sch, split out of the closing note in .planning/todos/completed/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md"
files:
  - src/backend/storeManagers/storeManagerCommon/games.ts
  - src/backend/utils.ts
  - src/frontend/components/UI/Dialog/index.css
  - src/backend/platform/index.ts
---

# Native dialog residue after the VCRuntime and Snap migrations

Quick task `260919-sch` moved the two live, verified dialog-shim collapse defects (VCRuntime
"Don't show again", the Snap warning checkbox) off the native `dialog.showMessageBox` shim onto
the in-app `showDialog` path — see the closing note at the top of
`.planning/todos/completed/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`.
That todo's own census listed several other items that were explicitly out of scope for that
task and were never touched. They are re-filed here so they are not lost with the parent todo's
closure.

## 1. Dead-code sideloaded-game unload confirmation

`src/backend/storeManagers/storeManagerCommon/games.ts:121` computes `choice` from
`dialog.showMessageBoxSync(browserGame, { buttons: ['Yes', 'No'], ... })` on a sideloaded browser
game's `will-prevent-unload` event. The handler that would call it is never reached: four
statements earlier, `openNewBrowserGameWindow` (`games.ts:47`) calls `new BrowserWindow({...})`
at `games.ts:87`, and `backend/platform`'s `BrowserWindow` stub is an object literal carrying only
`getAllWindows` — `new` on it throws `TypeError` unconditionally, every platform, no delegation
switch. The real owner of this surface is **D-35-15-01** (browser games broken under Tauri,
open, unowned; recorded fix is a Tauri child window, "the same shape as the embedded store
browser"). A fix to the dialog call alone would change no observable behaviour — do not fix this
in isolation; fix it as part of D-35-15-01's Tauri child window work.

## 2. Inverted-polarity quit confirmation (`utils.ts:281`)

`src/backend/utils.ts:281` (`handleExit`): index 0 is the SAFE "No", index 1 is the DESTRUCTIVE
"Yes" (killing an in-flight install/download and exiting). It carries an explicit `cancelId: 0`
(added specifically because the shim's positional cancelId fallback would otherwise resolve to
the destructive branch on any transport error). This call site was not touched by `260919-sch`
and still uses the native `dialog.showMessageBox` path. If it is ever migrated to the in-app
`showDialog` path, the response polarity must be preserved exactly — a naive migration that
reorders the two buttons would flip which one is destructive.

## 3. Cosmetic dead CSS in `Dialog/index.css`

`src/frontend/components/UI/Dialog/index.css` still carries dead `.Dialog__element` (`:10`,
`:39`, `:43`), `.Dialog__header` (`:50`) and `.Dialog__Close*` (`:64`, `:76`, `:103`) blocks as
unused cruft — nothing in `Dialog.tsx` applies these classes since quick task `260820-kq0` round
3 restyled the primitive directly via `styled(Paper)`. The one live rule is `.Dialog__footer`
(`:115`). Purely cosmetic; safe to delete whenever someone is next in this file, not worth a
dedicated pass on its own.

## 4. Shim axis 3: `showMessageBoxSync` is a latent trap, not a present defect

`src/backend/platform/index.ts`'s `showMessageBoxSync` cannot cross the async `rustInvoke`
transport, so it is a logged no-op that unconditionally `console.warn(...)`s and `return 0`s.
Today this has **zero live consumers** — its only call site is item 1 above, which is itself
unreachable — so it is not currently causing observable harm. It is recorded here because any
*future* caller of `showMessageBoxSync` will silently get a plausible-looking `0` response
instead of an error, degrading rather than failing loud. Worth a lint/grep check before adding
any new `showMessageBoxSync` call site; not worth fixing preemptively with no consumer.

## Notes

`detectVCRedist` (`src/backend/utils.ts`) itself has no call site at HEAD and is never invoked on
Windows or anywhere else — that is a separate, already-filed defect, not part of this residue
list: see
`.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md`. This todo's item 1
above is about a *different* function (the sideloaded browser-game unload confirmation); do not
conflate the two when triaging.
