# Quick Task 260919-sch: Move VCRuntime + Snap warning dialogs in-app — Context

**Gathered:** 2026-09-19
**Status:** Ready for planning

<domain>
## Task Boundary

Fix the two live dialog-shim collapse defects recorded in
`.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`
by moving both dialogs off the native shim and onto the existing in-app `showDialog` path:

1. **VCRuntime "Don't show again" is unreachable** (`src/backend/utils.ts:843`, Windows-only) —
   a 3-button native dialog whose `response === 2` branch (`:856`, persists
   `configStore.set('skipVcRuntime', true)`) can never fire.
2. **Snap warning "do not show again" checkbox can never be checked**
   (`src/backend/sidecar/appShellFlowRegistration.ts:389`, Linux/Snap-only) — the shim hard-codes
   `checkboxChecked: false` on every return path, so `configStore.set('showSnapWarning', false)`
   at `:406` never runs.

Also: record the native-vs-in-app policy rule (item 2 of the todo's "Suggested shape").

</domain>

<decisions>
## Implementation Decisions

All of the following were verified against HEAD on 2026-09-19 and are **LOCKED** — do not
re-litigate them, and do not follow the todo's own "Suggested shape" where it conflicts (see
"The todo's prescribed fix is infeasible" below).

### The todo's prescribed fix is INFEASIBLE — this is why the approach changed

The todo says to "extend the shim's 3-button mapping" and "wire a real checkbox-state round
trip". **Neither is possible.** `src-tauri/src/main.rs:5803` accepts a `buttons` array **only**
when `b.len() == 2`, maps it to `MessageDialogButtons::OkCancelCustom`, and returns a bare
`bool` (`:5811`). `tauri-plugin-dialog` has no 3-button variant and **no checkbox support at
all**. The shim's narrow contract is the plugin's ceiling, not shim sloppiness. The remedy has
to change shape, not the mapping. Do not attempt to widen the Rust dialog.

### Approach: route both dialogs through the existing in-app path

Use `showDialogBoxModalAuto` from `src/backend/dialog/dialog.ts` (exported at `:81`). It is
already imported in `src/backend/utils.ts:52` and already used there at `:395` and `:407` — that
is the house pattern to match.

`MessageBoxModal` (`src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.tsx`)
already renders an arbitrary number of buttons in a loop — **no button-count limit exists on the
in-app path**, which is exactly what makes it the fix for defect 1.

### How the answer gets back: the `action` discriminator, not `onClick`

`showDialogBoxModalAuto` is **one-way** — it sends outward via `sendFrontendMessage('showDialog',
...)` and cannot carry an answer back. `ButtonOptions.onClick` is a function and does **not**
survive the structured-clone/JSON hop (documented at `src/common/types.ts:38-47`).

The serializable half is `ButtonOptions.action` (`src/common/types.ts:48`, currently the single
literal `'steamSignIn'`). `DialogHandler`'s `resolveButtonAction` (`index.tsx:15-31`) maps a
recognized literal to a real renderer-side handler before the button renders, and carries an
**exhaustiveness guard** (`const _exhaustive: never = action`) so a new literal added to the
union without a matching `case` fails `tsc` rather than silently dropping the button.

So: widen the `action` union, add the matching cases, and let the renderer do the work.

### Renderer-side handlers — every affordance already exists, add NO new IPC channels

- **Persisting both preferences:** `skipVcRuntime` and `showSnapWarning` are **both already on
  the renderer allowlist** (`src/common/types/storePolicy.ts:103-104`), and the renderer already
  writes config through `configStore.set(...)` (`src/frontend/helpers/electronStores.ts`, live
  example at `src/frontend/index.tsx:132`). Persist renderer-side.
- **Opening the VCRuntime download links:** `window.api.openExternalUrl(url)` is the established
  renderer path (many call sites, e.g. `Settings/components/NvidiaPrime.tsx:56`). Use it for both
  URLs. Do **not** add a new IPC channel for this.
- **The follow-up "download links have been opened" info box** (currently a second native dialog
  at `utils.ts:863`): raise it renderer-side via `showDialogModal` from `ContextProvider`.

### i18n — reuse the existing keys, add nothing, remove nothing

Every string these two dialogs need already exists: `box.vcruntime.notfound.title`/`.message`,
`box.vcruntime.install.message`, `box.downloadNow`, `box.ok`, `box.dontShowAgain`, and
`box.warning.snap.title`/`.message`/`.checkbox`. The **backend** composes the button label
strings and sends them as plain text, so the backend `i18next.t(...)` calls keep doing the
translating and no renderer-side key work is needed.

The Snap `checkboxLabel` key (`box.warning.snap.checkbox`, "Do not show this message again")
becomes a **button label** — reuse that exact key, do not mint a new one.

**Do not delete any locale key.** Removing one has three separate traps in this repo (the count
is 47, not 49, and `da`/`id`/`nl` break) — and none needs removing here.

### Button ORDER on the in-app path is free, but record why it mattered natively

A third trap, found during verification and **not** recorded in the todo: on the native path,
dismissing a dialog (Escape/close) returns `false` → `response 1`, so index 1 is the dismiss
slot. Any "Don't show again" sitting at index 1 fires on Escape, silently persisting a
suppression the user never chose. This is a **motivation** for moving in-app, where no such
coupling exists. Capture it in the policy note; it does not constrain the new button order.

### Where the native-vs-in-app policy rule gets recorded

Primary home: a docstring in `src/backend/dialog/dialog.ts` — the module that owns the in-app
path is what a future caller reads when choosing. The rule:

- **In-app** (`showDialogBoxModalAuto`): anything reached from a settings surface, any nag or
  warning, and **anything needing more than two buttons or a checkbox** — the native path
  structurally cannot express those.
- **Native** (`dialog.showMessageBox`): quit confirmation, updater, pre-window-ready prompts, and
  Rosetta — cases that must work before or independently of the renderer being alive.
- **Any ASKING dialog moved to the renderer must gather its answer renderer-side**, because the
  backend-dialog path is one-way. Either pass the answer back as an argument (the
  `eos_overlay.ts` `remove(confirmed)` precedent) or act on it entirely in the renderer (what
  this task does).

### Scope boundaries — what NOT to touch

- **Not in scope: the sideloaded-game unload confirmation** (`storeManagerCommon/games.ts:121`).
  It is dead code behind a `new BrowserWindow` throw at `games.ts:87`; its real owner is
  D-35-15-01's Tauri-child-window fix, which is phase-sized. Fixing the dialog call alone changes
  nothing observable.
- **Not in scope: the other 8 census sites.** `utils.ts:281` (`handleExit`) in particular carries
  an INVERTED polarity with an explicit `cancelId: 0` — leave it exactly as it is.
- **Do not widen the Rust dialog command.**
- **Do not remove** the now-unused `checkboxLabel`/`checkboxChecked` handling from the shim; other
  typing depends on the shape and the shim stays as-is.

</decisions>

<specifics>
## Specific Ideas

### Existing test that WILL break, and must be updated rather than deleted

`src/backend/sidecar/__tests__/appShellFlows.test.ts` (~`:1154`-`:1195`) drives `frontendReady`
twice and asserts `requestRustInvoke` was called with `RUST_DIALOG_MESSAGE` **exactly twice**.
Once the Snap warning moves in-app that count becomes 0 and the test goes red.

The property it is actually testing is the **repeat count** — that the warning shows on every
`frontendReady` while the preference is unset (the test force-mocks `showSnapWarning` to `true`).
Preserve that property: re-point the assertion at the in-app path (the `showDialog`
send / `showDialogBoxModalAuto` call) and keep the count at 2. Do not weaken it to a
"called at least once" assertion, and do not delete it.

### Test coverage to add

Neither defect is reachable on macOS (defect 1 is Windows-only, defect 2 is Linux/Snap-only), so
**no live run on this machine can verify either fix** — jest is the only available gate. Say so
plainly in the SUMMARY; do not claim live verification.

- Backend: the VCRuntime dialog raises the in-app path carrying three buttons, one of which
  carries the skip `action`.
- Frontend: `resolveButtonAction` maps each new literal to a handler that performs the right
  effect (persist the preference / open both URLs).

</specifics>

<canonical_refs>
## Canonical References

- `.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`
  — the source todo. Its **measurements are accurate** (the 10-site census holds at HEAD, one line
  drift: `steam/library.ts:1770`, not `:1772`). Its **prescribed remedy is not** — see above.
- `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx:250` — `confirmRemoveEosOverlay`,
  the precedent for an app-styled confirmation replacing a native one.
- `src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/removeEosOverlayConfirmation.test.tsx`
  — the precedent regression test for that migration; mirror its shape.

### Todo disposition (do this as part of the task)

After the fix lands, this todo must **not** be closed as-is, and must **not** be left open with a
title that has become false. Both of its live defects are fixed and the policy question is
answered, but real residue remains: the withdrawn dead-code section 3 (owned by D-35-15-01), the
still-live inverted-polarity constraint at `utils.ts:281`, and the cosmetic dead CSS in
`src/frontend/components/UI/Dialog/index.css` (`.Dialog__element`, `.Dialog__header`,
`.Dialog__Close*`).

So: move this todo to `.planning/todos/completed/` recording what actually shipped, and file a
**new** todo in `.planning/todos/pending/` for the residue. Per CLAUDE.md the new file must carry
all three triage keys, bare/lowercase/exact, in this order:

```yaml
severity: minor
platform: any
ready: code
```

`pnpm planning-gates` enforces this and will turn CI red if any key is missing.

</canonical_refs>
