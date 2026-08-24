---
created: 2026-08-24T00:00:00.000Z
title: "The EOS overlay remove confirmation renders as a NATIVE system dialog, not an app-styled one — and it is one of ~14 such sites, whose obvious fix is booby-trapped"
area: ui-dialogs
status: OPEN
severity: minor
files:
  - src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts
  - src/backend/dialog/dialog.ts
  - src/frontend/components/UI/Dialog/index.css
---

## Context

Observed live by the operator on 2026-08-24 while driving **step 2 of `34.6-LIVE-GATE.md`**
(the EOS overlay round-trip). The "Confirm overlay removal" dialog appeared and functioned
correctly — that observation is what confirmed amendment **A-02**'s corrected premise, that the
dialog belongs to `remove()`'s unconditional call and not to `enable()`'s gated one. But it
renders as an **OS-native dialog**, visually unlike the rest of the app.

Operator's words: *"the dialog to remove looks like a system dialog (not conforming to app
styling)."*

## Root cause

`eos_overlay.ts:162`'s `remove()` calls Electron's **native** `dialog.showMessageBox(...)`.
The app also has an **in-app styled** path — `showDialogBoxModalAuto()`
(`src/backend/dialog/dialog.ts:8`), which forwards to the renderer via
`sendFrontendMessage('showDialog', ...)` and is drawn by the React `Dialog` primitive. The EOS
overlay code uses the former.

## This is systemic, not one site

A census of `src/backend` (excluding tests, `electronStub`, `dialogStub`) finds roughly **14**
native `showMessageBox` / `showMessageBoxSync` call sites:

- `main.ts:585`
- `protocol.ts:153`
- `utils.ts:287`, `:339`, `:838`, `:858`, `:973`, `:1387`
- `updater.ts:35`, `:59`
- `dialog/dialog.ts:45` (the native fallback arm — legitimate)
- `sidecar/appShellFlowRegistration.ts:343`
- `storeManagers/steam/library.ts:1772`
- `storeManagers/storeManagerCommon/games.ts:89` (`showMessageBoxSync`)

So "make the EOS dialog match the app" is really "decide which dialogs are native and which are
in-app, and apply that consistently." Fixing only the EOS one narrows the inconsistency without
resolving it.

## Three traps — do NOT do the obvious migration blind

**1. The in-app `Dialog` primitive is NOT actually styled the way its CSS implies.**
A class census (2026-08-20, quick task `260820-kq0`) found `Dialog/index.css`'s
`.Dialog__element`, `.Dialog__header`, `.Dialog__content` and `.Dialog__Close*` rules **entirely
dead** — the only live rule is `.Dialog__footer`. The primitive was reimplemented on MUI, so the
caller's `className` lands on `PaperProps` and the Paper never carries `.Dialog__element`. All
**25** existing dialog consumers silently fall back to MUI defaults.
**The trap:** the dead rule bases `opacity: 0; transform: translateY(50px)` and restores them only
under `:popover-open` / `[open]` — native `<dialog>`/popover states that can never match MUI's
Paper `<div>`. So the obvious fix (apply `.Dialog__element` to the Paper) would render **every
dialog in the app permanently invisible**. Migrating EOS onto the in-app dialog for "consistent
styling" therefore inherits an unstyled target, and any attempt to style that target first must
not reason forward from the stylesheet — it does not describe the running app.

**2. Under the Tauri sidecar, a dialog that REJECTS crashes the app.**
`dialog.showMessageBox` today never throws — it resolves a safe value, and unguarded
fire-and-forget callers depend on that (`promptI386Recovery` at `steam/library.ts`, invoked as
`void promptI386Recovery(appId)`; `askForceUninstall` at `utils.ts:~292`, reached fire-and-forget
from `launcher.ts`). There is no `process.on('unhandledRejection')` guard and the sidecar runs as
plain `node`, so a rejecting dialog path is a process crash. Any rework must **resolve a
safe-decline sentinel, never reject**.

**3. `utils.ts:287` has INVERTED response semantics** relative to every other `showMessageBox`
caller in the codebase — the file says so in a comment at `:290`. A blanket mechanical migration
would flip a destructive branch's sense.

## Suggested shape

1. Decide the policy first: which confirmations are legitimately OS-native (quit, updater,
   pre-window-ready) versus in-app (anything reached from a settings surface). Record the rule.
2. Independently, fix the `Dialog` primitive so the in-app path is genuinely styled — knowing the
   base-state trap above — otherwise migrating callers onto it changes nothing visible.
3. Only then migrate the settings-surface confirmations, EOS removal included, preserving each
   caller's response polarity and the never-reject contract.

Steps 1 and 2 are independently valuable and can land separately.

## Notes

Not resolved by Phase 34.6 — deliberately no `resolves_phase:` field, so this is not auto-closed
by that phase's completion. The 34.6 live gate only *observed* the dialog; A-02's assertion is
about **where** the dialog occurs, not how it is styled, so step 2's disposition is unaffected.

Related: [[stylesheet-can-be-wholly-dead-against-its-component]] ·
[[sidecar-dialog-reject-crashes]]
