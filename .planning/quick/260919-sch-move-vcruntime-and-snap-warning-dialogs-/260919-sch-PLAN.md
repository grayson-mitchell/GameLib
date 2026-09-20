---
quick_id: 260919-sch
date: 2026-09-19
description: Move the VCRuntime and Snap warning dialogs off the native shim onto the in-app `showDialog` path, closing the live Snap defect and structurally closing the VCRuntime one (whose surface is separately unreachable), and record the native-vs-in-app policy rule
source_todo: .planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md
context: .planning/quick/260919-sch-move-vcruntime-and-snap-warning-dialogs-/260919-sch-CONTEXT.md
baseline_sha: 31b1336c839fe2bddaabcdfa9db0133efa9e4adb
tasks: 5
---

# Quick Task 260919-sch — VCRuntime + Snap warnings move in-app

## What this does

Closes the dialog-shim collapse defects by routing both dialogs through
`showDialogBoxModalAuto` (the existing in-app path), widening the serializable
`ButtonOptions.action` discriminator so the renderer can carry the answer, and recording the
native-vs-in-app policy rule where the next caller will read it.

**The source todo's "Suggested shape" is infeasible and must not be followed.**
`src-tauri/src/main.rs:5803` accepts a `buttons` array only when `b.len() == 2`, maps it to
`MessageDialogButtons::OkCancelCustom`, and returns a bare `bool`; `tauri-plugin-dialog` has no
3-button variant and no checkbox support at all. **Do not touch the Rust dialog command.** If you
find yourself widening it, you have drifted — stop and re-read `260919-sch-CONTEXT.md`.

## Anchors re-verified at HEAD `31b1336c8` (2026-09-19)

| Anchor | At HEAD | Note |
|---|---|---|
| `src/backend/utils.ts:782` | `function detectVCRedist(mainWindow: BrowserWindowType)` | |
| `src/backend/utils.ts:843` | 3-button `dialog.showMessageBox(mainWindow, {...})` | DEFECT 1 |
| `src/backend/utils.ts:856` | `if (response === 2)` → `configStore.set('skipVcRuntime', true)` | unreachable |
| `src/backend/utils.ts:860-869` | `response === 0` → two `openUrlOrFile` + second native box at `:863` | |
| `src/backend/utils.ts:52` | `import { showDialogBoxModalAuto } from './dialog/dialog'` | already imported |
| `src/backend/utils.ts:57` | `import type { BrowserWindow as BrowserWindowType }` | **sole use is `:782`** |
| `src/backend/sidecar/appShellFlowRegistration.ts:385-411` | `isSnap` → `dialog.showMessageBox({checkboxLabel, checkboxChecked:false}).then(...)` | DEFECT 2 |
| `src/backend/sidecar/appShellFlowRegistration.ts:161` | `import { notify } from '../dialog/dialog'` | extend this import |
| `src/common/types.ts:48` | `action?: 'steamSignIn'` | |
| `src/frontend/components/UI/DialogHandler/index.tsx:15-31` | `resolveButtonAction` + `const _exhaustive: never = action` | |
| `src/frontend/components/UI/DialogHandler/index.tsx:48-53` | maps `action` → `onClick` before render | |
| `src/backend/sidecar/__tests__/appShellFlows.test.ts:1191-1194` | `snapDialogCalls` filtered on `RUST_DIALOG_MESSAGE`, `toHaveLength(2)` | will go red |
| `src/common/types/electron_store.ts:53-54` | `skipVcRuntime: boolean`, `showSnapWarning: boolean` | renderer `configStore.set` typechecks |
| `src/common/types/storePolicy.ts:103-104` | both keys on `STORE_ALLOWLIST.configStore` | renderer writes permitted |
| `src/common/types/ipc.ts:90` | `openExternalUrl: (url: string) => void` | |
| `src/frontend/types.ts:171` | `DialogModalOptions` — every field optional | `title` may be omitted |

## Four measured findings the executor must not re-derive, and must not silently drop

**1. `detectVCRedist` has ZERO call sites at HEAD.** A whole-repo grep (excluding
`node_modules/`, `graphify-out/`) returns exactly two hits: the declaration at `utils.ts:782` and
its name in the default-export object at `utils.ts:1796`. Nothing calls it. Its old caller lived
in `main.ts`, deleted during the Phase 35 Electron cutover.

This does not change the work — the dialog still moves in-app — but it does change what may
honestly be claimed. **Do not write "fixes a live Windows defect" in the SUMMARY.** The accurate
statement is: the unreachable-third-button defect is structurally removed, *and* the function that
would raise it is itself currently uncalled. Re-registering the caller is **out of scope**; record
it in the residue todo (Task 5).

**2. `dialog` becomes an unused import in `appShellFlowRegistration.ts` — and grep will lie to you
about it.** `grep -n 'dialog\.' src/backend/sidecar/appShellFlowRegistration.ts` returns **zero
hits**, because the call wraps: `dialog` is on line 388 and `.showMessageBox({` on line 389. The
binding is imported at line 147 (`import { ipcMain, app, powerSaveBlocker, dialog } from
'../platform'`) and line 388 is its only use. After Task 3 it must come out of that import or
`pnpm lint` fails.

**3. `MessageBoxModal` calls `onClose()` BEFORE `onClick()`** (`MessageBoxModal/index.tsx:49-52`).
This ordering is load-bearing for the VCRuntime download action: the handler closes the current
dialog and only then raises the follow-up info box. Were the order reversed, the info box would be
opened and immediately closed. Do not reorder it, and do not work around it.

**4. Escape-key coupling is why this matters beyond cosmetics.** On the native path a dismissed
dialog returns `false` → `response 1`, so index 1 is the dismiss slot — any "Don't show again" at
index 1 fires on Escape, persisting a suppression the user never chose. The in-app path has no
such coupling. This is a *motivation*, recorded in the Task 1 docstring; it does not constrain the
new button order.

## No live verification is possible on this machine

Defect 1 is Windows-only (`detectVCRedist` returns early unless `isWindows`), defect 2 is
Linux/Snap-only (`isSnap` gate). **Neither is reachable on macOS.** Jest, `tsc` and lint are the
only real gates here. No task below has a `done` condition that implies live confirmation, and the
SUMMARY must say so plainly rather than implying the fixes were observed working.

## Baseline discipline

`pnpm test:ci` is **known RED at HEAD** for unrelated reasons. Before editing anything, capture
the baseline for the two suites this task touches:

```
git rev-parse HEAD   # expect 31b1336c839fe2bddaabcdfa9db0133efa9e4adb
pnpm exec jest --selectProjects Backend appShellFlows.test.ts 2>&1 | tail -30
pnpm exec jest --selectProjects Frontend 2>&1 | tail -30
```

Any "pre-existing failure" claim in the SUMMARY **must name that sha**. A claim that does not name
a baseline is not a measurement.

Jest filter trap: every targeted run below must report a **non-zero** test count. A filter that
matches no file exits 0 and looks identical to a pass.

---

## Tasks

### Task 1 — widen the `action` discriminator, wire the three renderer handlers, record the policy

**files**
- `src/common/types.ts`
- `src/frontend/components/UI/DialogHandler/index.tsx`
- `src/backend/dialog/dialog.ts`

**action**

Widen `ButtonOptions.action` (`src/common/types.ts:48`) from the single literal `'steamSignIn'` to
a four-member union:

`'steamSignIn' | 'vcRuntimeDownload' | 'vcRuntimeSkip' | 'snapWarningSuppress'`

Keep the existing comment block at `:38-47` (it explains why `onClick` cannot cross the hop) and
extend it with one sentence naming the new consumers. Keep the "never a URL or arbitrary string —
an enum" constraint; the two VCRuntime URLs are hard-coded renderer-side, never passed through.

In `DialogHandler/index.tsx`, change `resolveButtonAction`'s second parameter from the bare
`navigate` to a single dependency object carrying `navigate`, `t` (from a new `useTranslation()`
call in the component) and `showDialogModal` (already destructured from `ContextProvider` at
`:34`). Add one `case` per new literal. **Preserve the `const _exhaustive: never = action` guard
verbatim** — it is what makes a future literal a `tsc` failure rather than a silently dropped
button.

Handler bodies:

- `'vcRuntimeSkip'` → `configStore.set('skipVcRuntime', true)` using `configStore` imported from
  `frontend/helpers/electronStores`. Both the type (`electron_store.ts:53`) and the write
  allowlist (`storePolicy.ts:103`) already admit this key.
- `'snapWarningSuppress'` → `configStore.set('showSnapWarning', false)` (same imports; type at
  `electron_store.ts:54`, allowlist at `storePolicy.ts:104`).
- `'vcRuntimeDownload'` → two `window.api.openExternalUrl(...)` calls with the two literal URLs
  currently at `utils.ts:861-862` (`https://aka.ms/vs/17/release/vc_redist.x86.exe` and
  `.../vc_redist.x64.exe`), then raise the follow-up info box with `showDialogModal({ message:
  t('box.vcruntime.install.message', '<the existing English default from utils.ts:865-867>'), type:
  'MESSAGE', buttons: [{ text: t('box.ok', 'OK') }] })`.

  **Omit `title` deliberately.** The native call being replaced (`utils.ts:863`) passes `message`
  only, so an absent title is exact parity with what ships today. `DialogModalOptions.title` is
  optional (`frontend/types.ts:171`) and `DialogHandler:70` already substitutes `''`. Adding a
  title would require a new locale key, which CLAUDE.md routes into `gamelib.json` and which
  CONTEXT explicitly rules out ("reuse the existing keys, add nothing, remove nothing").

Add **no new IPC channel**. Add **no new locale key**. `box.vcruntime.install.message` and
`box.ok` both already exist in `public/locales/en/translation.json` (`:163-165` and `:120`); the
frontend i18next init (`src/frontend/index.tsx:146-153`) sets no `defaultNS`, so plain
`useTranslation()` resolves against `translation.json` — do **not** reach for the `gamelib`
namespace here.

Do **not** export `resolveButtonAction`. `pnpm find-deadcode` (`ts-prune --error`) runs in CI via
`.github/workflows/lint.yml`; a test-only export would turn it red. Task 4 drives it through the
component instead.

Finally, add a module docstring to `src/backend/dialog/dialog.ts` above
`showDialogBoxModalAuto` recording the native-vs-in-app policy, stating all three rules:

1. **In-app** (`showDialogBoxModalAuto`): anything reached from a settings surface, any nag or
   warning, and **anything needing more than two buttons or a checkbox** — the native path
   structurally cannot express those (`main.rs:5803` takes `buttons` only at `len() == 2`;
   `tauri-plugin-dialog` has no checkbox at all).
2. **Native** (`dialog.showMessageBox`): quit confirmation, updater, pre-window-ready prompts,
   Rosetta — cases that must work before or independently of the renderer being alive.
3. **Any ASKING dialog moved to the renderer must gather its answer renderer-side**, because this
   path is one-way: it only `sendFrontendMessage`s outward. Either pass the answer back as an
   argument (`eos_overlay.ts`'s `remove(confirmed)` precedent) or act on it entirely in the
   renderer (what this task does, via `ButtonOptions.action`).

Include finding 4 above (the native Escape → `response 1` dismiss-slot coupling) as the recorded
motivation. Keep the docstring prose-only — no fenced code, and no phrasing that a substring gate
could later mistake for a live call site.

**verify**
```
pnpm codecheck
pnpm prettier
pnpm lint
```
`pnpm lint` carries two independent ceilings (`meta/lintScoped.cjs`: `SRC_CEILING = 1124`,
`TESTS_CEILING = 638`), neither padded. Both must still PASS.

**done**
`ButtonOptions.action` carries four literals; `resolveButtonAction` has a `case` for each plus the
untouched `never` guard; `dialog.ts` carries the three-rule policy docstring; `tsc` is clean;
both lint ceilings pass; no new IPC channel, no new locale key, no new export.

---

### Task 2 — VCRuntime dialog moves in-app, with its backend regression test

**files**
- `src/backend/utils.ts`
- `src/backend/__tests__/detectVCRedistDialog.test.ts` (new)

**action**

Replace the `dialog.showMessageBox(mainWindow, {...})` call at `utils.ts:843-854` and the entire
`response`-branching block at `:856-869` with a single `showDialogBoxModalAuto({...})` call
(already imported at `:52`), carrying `type: 'MESSAGE'`, the same `title` /`message` `t()` calls
verbatim, and three buttons in the same order as today:

1. `{ text: t('box.downloadNow', 'Download now'), action: 'vcRuntimeDownload' }`
2. `{ text: t('box.ok', 'Ok') }` — no action, dismiss only
3. `{ text: t('box.dontShowAgain', "Don't show again"), action: 'vcRuntimeSkip' }`

The backend keeps composing the label strings through `i18next.t` and sends plain resolved text —
that is why no renderer-side key work is needed for the buttons.

Delete from this function: the `openUrlOrFile` calls, the second `dialog.showMessageBox` at `:863`,
and every `response === N` comparison. All three effects now live renderer-side (Task 1).
`openUrlOrFile` is defined and exported from this module and used elsewhere — do not remove the
function, only these two call sites.

`mainWindow` is now unused. Change the signature to `detectVCRedist()`. Its name in the default
export (`utils.ts:1796`) is unchanged, and there are no call sites to update (see finding 1).
Removing the parameter orphans the `BrowserWindowType` type import at `:57` — that import's only
use is line 782, so delete it too or `pnpm codecheck` / `pnpm lint` will fail.

Add a `-- 260919-sch` comment above the new call naming *why* the native path was abandoned (the
`len() == 2` ceiling), so the next reader does not "restore" the third button natively.

New test `src/backend/__tests__/detectVCRedistDialog.test.ts`. Mirror
`src/backend/__tests__/askForceUninstall.test.ts` — same jest project (`displayName: 'Backend'`,
`testMatch: **/__tests__/**/*.test.ts`), same manual-mock set. `src/backend/dialog/__mocks__/dialog.ts`
already replaces `showDialogBoxModalAuto` with a `jest.fn()`, so `jest.mock('../dialog/dialog')`
gives you the spy directly. Note `resetMocks: true` in `src/backend/jest.config.js` — set any
implementation in `beforeEach`, never in a `jest.mock` factory.

The function is gated on `isWindows` and driven by a `spawn`ed PowerShell probe's `close` event.
Mock `backend/constants/environment` to `isWindows: true` and `child_process`'s `spawn` to a
controllable stub whose `stdout`/`stderr`/`close` listeners you can fire, then drive `close` with
code `0` after feeding fewer than four `Microsoft Visual C++ 2022` lines.

Assert, at minimum:
- `showDialogBoxModalAuto` called exactly once;
- its `buttons` array has length **3** — this is the assertion the native path structurally could
  not satisfy, and it is the point of the whole change;
- exactly one button carries `action: 'vcRuntimeSkip'` and exactly one carries
  `action: 'vcRuntimeDownload'`;
- `dialog.showMessageBox` (from the `backend/platform` automock) is called **zero** times —
  otherwise a partial revert that leaves the follow-up native box in place would stay green.

**verify**
```
pnpm codecheck
pnpm exec jest --selectProjects Backend detectVCRedistDialog.test.ts
pnpm lint
```
The jest run must report a non-zero test count. No live-app step — this path is Windows-only and
cannot run on this machine.

**done**
`utils.ts` raises exactly one in-app dialog with three buttons and contains no `response === N`
comparison and no second dialog in `detectVCRedist`; `mainWindow` and the orphaned
`BrowserWindowType` import are gone; the new suite passes with a non-zero test count; `tsc` clean;
both lint ceilings pass.

---

### Task 3 — Snap warning moves in-app, and its existing repeat-count test is re-pointed

**files**
- `src/backend/sidecar/appShellFlowRegistration.ts`
- `src/backend/sidecar/__tests__/appShellFlows.test.ts`

**action**

Replace the `dialog.showMessageBox({...}).then(...).catch(...)` chain at
`appShellFlowRegistration.ts:388-409` with a single `showDialogBoxModalAuto({...})` call. Extend
the existing import at `:161` to `import { notify, showDialogBoxModalAuto } from '../dialog/dialog'`
— this adds no new module edge (the file already depends on that module), so
`electronReachLedger.test.ts`'s baseline is untouched.

Keep `title` and `message` exactly as they are (same `i18next.t` calls, same `newLine`
interpolation). Pass `type: 'MESSAGE'` and two buttons:

1. `{ text: i18next.t('box.ok', 'OK') }` — dismiss
2. `{ text: i18next.t('box.warning.snap.checkbox', { defaultValue: 'Do not show this message again' }), action: 'snapWarningSuppress' }`

The checkbox **label key is reused verbatim** as a button label, per CONTEXT. Mint no new key and
delete no key (removing a locale key has three separate traps in this repo, and none needs
removing here).

Consequences to handle in the same edit:
- `dialog` is now unused in this file — remove it from the `'../platform'` import at `:147`. See
  finding 2: `grep 'dialog\.'` returns zero hits here because the call wraps across lines 388/389;
  trust the reading, not the grep.
- `showDialogBoxModalAuto` is synchronous and never throws (it carries its own internal
  try/catch, `dialog.ts:24-52`), so the `.then`/`.catch` go away. The handler's own outer
  try/catch at `:381` still satisfies this module's "every send-kind body is wrapped" discipline —
  say so in a comment rather than leaving the next reader to wonder whether the guard was dropped.
- Check whether `logSendFailure` still has other call sites after the `.catch` goes. If it does
  (expected), leave it alone. If this was its last caller, do **not** delete it — leave it and say
  so in the SUMMARY; it is part of this module's declared discipline.
- Update the module comment at `:200` that currently says "the Snap warning dialog are allowed to
  repeat" so it names the in-app `showDialog` push rather than a native box. The repeat property
  itself is unchanged and is deliberate.
- **Do not** remove `checkboxLabel`/`checkboxChecked` handling from the shim in
  `src/backend/platform/index.ts`. Other typing depends on that shape and the shim stays as-is.

Then re-point the existing test at `appShellFlows.test.ts:1191-1194`. It currently filters
`isolatedRequestRustInvoke.mock.calls` on `RUST_DIALOG_MESSAGE` and asserts
`toHaveLength(2)`. That count becomes 0 once the warning moves in-app.

**The property under test is the repeat COUNT** — that the warning shows on every `frontendReady`
while the preference is unset (the test force-mocks `showSnapWarning` to `true` at `:1161-1164`).
**Preserve that property at exactly 2.** Re-point the assertion at the in-app path: mock
`'../../dialog/dialog'` with the narrow-override shape `shellFilesFlows.test.ts:207-210` uses
(`{ ...jest.requireActual('../../dialog/dialog'), showDialogBoxModalAuto: jest.fn() }`), then assert
`showDialogBoxModalAuto` was called exactly twice.

**Do not weaken it to "called at least once", and do not delete it.** Also keep a
`RUST_DIALOG_MESSAGE` count assertion at **0** in the same test — without it, a partial revert
that raises *both* dialogs would leave the new assertion green.

Everything else in that test stays: the `SNAP_REAL_HOME` save/restore, the `isolateModules`
harness, the `isolatedEnvRef.isSnap = false` cleanup, and its explanatory comments. Its i18next
mock at `:155-183` already returns the default value for both the string-second-arg and
`{defaultValue}` shapes, so both new button labels resolve to real text under test.

Leave the other `RUST_DIALOG_MESSAGE` assertions in this file alone — they belong to `handleExit`
(the inverted-polarity quit confirmation, which explicitly stays native).

**verify**
```
pnpm codecheck
pnpm exec jest --selectProjects Backend appShellFlows.test.ts
pnpm lint
```
The run must report a non-zero test count and the Snap test must be among the tests that
executed. Compare the failure set against the baseline captured above; any remaining red must be
named against sha `31b1336c8`. No live-app step — this path is Linux/Snap-only.

**done**
The Snap branch raises exactly one in-app dialog with a suppress-action button and no
`checkboxLabel`; the `dialog` import is gone from this file; the existing test still asserts a
repeat count of exactly 2, now against `showDialogBoxModalAuto`, plus 0 `RUST_DIALOG_MESSAGE`
calls; `tsc` clean; both lint ceilings pass.

---

### Task 4 — frontend regression test for the three new button actions

**files**
- `src/frontend/components/UI/DialogHandler/__tests__/buttonActions.test.tsx` (new)

**action**

Mirror
`src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/removeEosOverlayConfirmation.test.tsx`
— it is the precedent regression test for exactly this migration shape, and CONTEXT names it as
the one to follow.

The Frontend jest project is `testEnvironment: 'node'` with no jsdom, no react-test-renderer and
no CSS transform (`src/frontend/jest.config.js`). So: call the component as a plain function and
inspect the returned element graph. Required mocks:

- `jest.mock('../components/MessageBoxModal', ...)` — it imports `./index.css`, which this project
  cannot transform. `NavItem.test.tsx:18` is the in-repo precedent for stubbing a colocated
  stylesheet side-effect import.
- `react-router-dom` → `{ useNavigate: () => jest.fn() }`.
- `react-i18next` → `useTranslation: () => ({ t: (key, dflt) => dflt ?? key })` (the EOS test's
  exact shape).
- `frontend/state/ContextProvider` → an identifiable sentinel object, resolved through a mocked
  `useContext` that returns `{ dialogModalOptions: { showDialog: false }, showDialogModal: <mock> }`.
- `react` → spread `requireActual`, override `useContext` as above and `useEffect` so it invokes
  its callback synchronously (the mapping under test lives inside that effect).
- `frontend/helpers/electronStores` → `{ configStore: { set: jest.fn() } }`. This module builds
  `TypeCheckedStoreFrontend`s at module scope and its constructors call `window.api.storeNew(...)`
  synchronously, so it must never load for real here.
- `window.api` stubbed on `globalThis` (the EOS test's convention) with `handleShowDialog`
  (returning a no-op unsubscribe and capturing the `onMessage` callback) and `openExternalUrl`.

Then: call `DialogHandler()`, take the captured `onMessage`, invoke it with a synthetic
`(event, title, message, 'MESSAGE', buttons)` payload, and read the mapped buttons off
`showDialogModal.mock.calls[0][0]`.

Assert one test per action:

- `'vcRuntimeSkip'` → invoking its `onClick` calls `configStore.set` exactly once with
  `('skipVcRuntime', true)`.
- `'snapWarningSuppress'` → `configStore.set` exactly once with `('showSnapWarning', false)`.
- `'vcRuntimeDownload'` → `window.api.openExternalUrl` called exactly **twice**, once with each of
  the two `aka.ms` URLs, **and** `showDialogModal` called again for the follow-up info box. Assert
  the two URLs by value — a count-only assertion would pass if both calls went to the same URL.
- No-regression: a button with **no** `action` passes through with `onClick` still `undefined`
  (mirrors the EOS test's item (c)); and `'steamSignIn'` still resolves to a handler.

Add no test-only export to the component (`pnpm find-deadcode` runs in CI).

**verify**
```
pnpm exec jest --selectProjects Frontend buttonActions.test.tsx
pnpm codecheck
pnpm lint
pnpm prettier
```
Non-zero test count required. Note the tests ceiling (`TESTS_CEILING = 638`) is unpadded — a new
suite that introduces even one new lint warning breaks it.

**done**
Four or more tests pass covering all three new literals plus the two no-regression cases; the
`vcRuntimeDownload` case asserts both URLs by value; no export was added to the component; `tsc`,
lint and prettier all clean.

---

### Task 5 — todo disposition: close the source todo, file the residue

**files**
- `.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md` (moved)
- `.planning/todos/completed/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md` (new location)
- `.planning/todos/pending/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md` (new)

**action**

Move the source todo to `.planning/todos/completed/`, keeping the filename byte-for-byte — 136 of
the 156 files already in `completed/` carry the same `YYYY-MM-DD-` prefix, so the convention holds,
and the todo's own Notes section says the path is kept stable deliberately.

**`git mv` trap (this repo has been bitten twice):** `git mv` stages the file's **HEAD** content,
silently discarding unstaged edits. Move first, edit at the new path second, then `git add` the new
path explicitly, and verify with `git diff --cached -- <new path>` that your edits are actually in
the index before committing. Never edit-then-`git mv`.

**Grep for the todo's own filename before moving** — the resolver leaves breadcrumbs. Known
referrers at HEAD (verified, excluding `node_modules/` and `graphify-out/`):
`.planning/quick/260907-rjc-*/{PLAN,SUMMARY}.md`, this task's `CONTEXT.md`,
`.planning/todos/completed/2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md`,
and four files under `.planning/phases/35-electron-cutover-remove-the-electron-build/`. Historical
records (`SUMMARY`/`PLAN`/`deferred-items`) are provenance and stay as written; do **not** rewrite
history to point at the new path.

In the moved file, record what actually shipped: both live defects structurally closed by moving
off the native shim (not by widening it — say why the todo's own "Suggested shape" was infeasible,
naming the `main.rs:5803` `len() == 2` ceiling), and the policy question from item 2 answered and
recorded in `dialog.ts`. State plainly that neither fix was verified live, and why. Leave the
frontmatter's three triage keys alone — `completed/` is deliberately out of the gate's scope.

Then file the residue as a **new** pending todo. Its frontmatter **must** carry all three triage
keys, bare, lowercase and exact, with `platform:` immediately after `severity:` and `ready:`
immediately after `platform:`:

```yaml
severity: minor
platform: any
ready: code
```

`.planning/todos/todo-frontmatter-gate.py` parses **only** the frontmatter block and matches values
bare and case-sensitively; `pnpm planning-gates` runs it in CI via
`.github/workflows/codecheck.yml`. Never widen the gate's vocabulary to admit a value you typed.

The residue todo must carry four items, each with its anchor.

**Do NOT file the `detectVCRedist` missing-call-site as a residue item — it is ALREADY FILED.**
`.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md` records exactly this
(`severity: medium`, `platform: windows`, `ready: blocked`, sourced from quick-260906-gej's
FINDINGS row A7). Restating it here would put the same defect in `pending/` twice, which is a
failure mode this repo has already been bitten by. Instead:

- In the **moved (completed) source todo**, cross-reference that existing todo by path when
  explaining why defect 1's fix is structural rather than observed.
- In the **residue todo**, add one line under Notes pointing at it as the owner of the call-site
  question — a pointer, not a restatement, and not a numbered item.
- Do **not** edit `2026-09-06-detectvcredist-never-runs-on-windows.md` itself. Its `ready: blocked`
  and `platform: windows` triage stand; this task does not unblock it.

The four items:

1. **Dead-code sideloaded-game unload confirmation** (`storeManagerCommon/games.ts:121`),
   unreachable behind the `new BrowserWindow` throw at `games.ts:87`. Real owner is **D-35-15-01**'s
   Tauri-child-window fix, which is phase-sized.
3. **Inverted-polarity quit confirmation still live** (`utils.ts:281`, `handleExit`): index 0 is
   the SAFE "No", index 1 the DESTRUCTIVE "Yes", with an explicit `cancelId: 0`. A live constraint
   on any future migration of that site — preserve the polarity exactly. It stays native by policy
   (rule 2 of the Task 1 docstring).
4. **Cosmetic dead CSS** in `src/frontend/components/UI/Dialog/index.css`: `.Dialog__element`
   (`:10`, `:39`, `:43`), `.Dialog__header` (`:50`), `.Dialog__Close*` (`:64`, `:76`, `:103`). The
   one live rule is `.Dialog__footer` (`:115`).
5. **Shim axis 3 remains a latent trap:** `showMessageBoxSync` cannot cross the async `rustInvoke`
   transport and is a logged no-op returning `0`. Zero live consumers today (its only call site is
   item 2's dead code), so it is a trap for the next caller, not a present defect.

Carry no `resolves_phase:` field — same reasoning as the source todo, which declined one
deliberately.

**verify**
```
pnpm planning-gates
grep -n '^severity: \|^platform: \|^ready: ' .planning/todos/pending/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md
git diff --cached --stat
ls .planning/todos/pending/ | wc -l    # expect 24 (23 after the move, +1 new)
```

**done**
The source todo lives in `completed/` with its filename unchanged and an accurate shipped-vs-not
record whose edits are provably in the index; the residue todo exists in `pending/` with all four
items, the Notes pointer to `2026-09-06-detectvcredist-never-runs-on-windows.md`, and the three
triage keys in the required order; `2026-09-06-detectvcredist-never-runs-on-windows.md` is
UNMODIFIED; `pnpm planning-gates` is green.

---

## Out of scope — do not touch

- **The Rust dialog command** (`src-tauri/src/main.rs:5803`). No widening, no 3-button variant, no
  checkbox. This is the plugin's ceiling, not shim sloppiness.
- **`checkboxLabel` / `checkboxChecked` in `src/backend/platform/index.ts`.** Now unused by these
  two callers, but other typing depends on the shape. The shim stays as-is.
- **The other 8 census sites**, especially `utils.ts:281` (`handleExit`) with its explicit
  `cancelId: 0` — leave it exactly as it is.
- **`storeManagerCommon/games.ts:121`** — dead code owned by D-35-15-01.
- **Re-registering a `detectVCRedist` caller** — recorded in the residue todo, not fixed here.
- **Any locale key addition or removal.** Every string these dialogs need already exists.
- **New IPC channels.** Every affordance needed already exists.

## SUMMARY must say, plainly

- Neither defect is reachable on macOS; **no live run on this machine verified either fix**. Jest,
  `tsc`, lint and prettier are the whole of the evidence.
- `detectVCRedist` has no call site at HEAD, so defect 1's surface is currently unreachable
  independently of the shim — the fix is structural, not observed.
- Any "pre-existing failure" claim names baseline sha `31b1336c8`.
