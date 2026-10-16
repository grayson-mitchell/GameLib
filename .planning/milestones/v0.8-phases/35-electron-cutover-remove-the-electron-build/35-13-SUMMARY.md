---
phase: 35-electron-cutover-remove-the-electron-build
plan: 13
subsystem: infra
tags: [electron, tauri, typescript, type-declarations, esbuild, module-move]
requires:
  - phase: 35-01
    provides: the sidecar/platform boundary and the electron-reach ledger this move is measured against
  - phase: 35-04
    provides: "`app.isPackaged` delegating to `isPackagedSidecar` — present in the moved file"
  - phase: 35-08
    provides: "`powerSaveBlocker` forwarding to the Rust wake-lock commands — present in the moved file"
  - phase: 35-09
    provides: "`session`'s clearing surface forwarding to `clear_browsing_data` — present in the moved file"
provides:
  - "`src/backend/platform/index.ts` — the single module replacing `'electron'` across the backend, moved from `src/backend/sidecar/electronStub.ts` with git rename detection intact (R099, 32 commits of `--follow` history)"
  - "`src/backend/platform/types.ts` — 20 first-party type declarations replacing every electron type the tree references, in both the ambient `Electron.` namespace form and the `import type ... from 'electron'` form"
  - "`src/backend/platform/__tests__/types.usage.test.ts` — a type-usage assertion module proving each declaration against its real call site, with a negative section that fails the build if a declaration is later widened"
  - "the esbuild `--alias:electron=` target repointed to the new path, with its mirror assertion moved in the same commit"
affects: [35-15, 35-16, 35-18]
tech-stack:
  added: []
  patterns:
    - "First-party type declarations replacing a package's ambient global namespace, annotated with their consuming sites"
    - "Branded opaque types for values that are passed through but never read, so a future field read is a compile error naming the site"
    - "Negative type assertions via `@ts-expect-error`, which invert the gate: widening a declaration makes the directive unused and fails the build"
key-files:
  created:
    - src/backend/platform/types.ts
    - src/backend/platform/__tests__/types.usage.test.ts
  modified:
    - src/backend/platform/index.ts
    - meta/esbuildWorkerBundleShared.ts
    - meta/__tests__/buildSidecarSea.test.ts
    - src/backend/sidecar/__tests__/electronUntouched.test.ts
    - src/backend/sidecar/__tests__/isPackagedSidecar.test.ts
key-decisions:
  - "D-02 honoured exactly: all 22 exports ship. `35-PREFLIGHT.md`'s `PLATFORM_EXPORT_COUNT: 19` is SUPERSEDED, not contradicted — it answered a narrower question (live production surface, test files excluded) than the move poses (can this be deleted without breaking the build). Corrected census: 21 live + 1 dead = 22."
  - "Opaque electron handles (`IpcRendererEvent`, `IpcMainEvent`, `Event`, `BrowserWindow`) are BRANDED rather than declared structurally. No consuming site reads a field off any of them; a brand makes a future read a compile error naming the site, which is the loud failure mode T-35-56 wants."
  - "`BrowserWindow` is declared in `types.ts` but deliberately NOT re-exported from `index.ts`: that module already exports a `BrowserWindow` VALUE, and TypeScript rejects the pair with `TS2323: Cannot redeclare exported variable`. Measured, not assumed."
  - "Non-vacuity of the assertion module is PROVEN by six deliberate widenings of `types.ts`, each confirmed to turn the module red — not asserted."
patterns-established:
  - "Pattern: a type declaration carries the repo-relative paths of its consuming sites in a comment directly above it, so a later reader can tell whether it is still needed"
  - "Pattern: positive type assertions are structurally blind to over-permissiveness; pair them with `@ts-expect-error` negative assertions to gate narrowness"
  - "Pattern: compile-only assertions live in exported, never-invoked functions — bare blocks are EXECUTED by ts-jest"
requirements-completed: [REQ-35-01, REQ-35-02]
duration: ~2h (across two executor sessions)
completed: 2026-08-29
---

**`backend/platform` now exists at its final path with 32 commits of history intact, ships all 22 exports, owns the esbuild `electron` alias, and carries 20 first-party electron type declarations proven against their real call sites — with zero production consumers, while both shells still build.**

- **Duration:** ~2h across two executor sessions (Task 1 landed by a prior executor that died on an API error partway into Task 2)
- **Tasks:** 2 of 2
- **Files modified:** 72 across three commits (66 in commit 1, 6 in commit 2, 3 in commit 3)

## Commits

| Commit | Task | Scope |
|---|---|---|
| `af0602e9b` | 1 | `refactor(35-13): move electronStub.ts to backend/platform/index.ts (D-02)` — 66 files |
| `dc04ed787` | 1 | `docs(35-13): platform module header, export-surface decision, stale path comments` — 6 files |
| `27015a776` | 2 | `feat(35-13): declare the electron type surface first-party (D-03)` — 3 files |

---

## Task 1 — the move (landed by the prior executor, independently verified)

`git mv src/backend/sidecar/electronStub.ts src/backend/platform/index.ts`. Git recorded it as
**R099**; `git log --follow --oneline src/backend/platform/index.ts` returns **32 commits**, history
predating this phase intact. `src/backend/sidecar/electronStub.ts` is gone.

The moved file's own content changed by exactly **four lines out of 926** — the relative imports
whose depth changed (`./pathShim`, `./isPackagedSidecar`, `./sidecarRpc`, and the `./nativeImageShim`
re-export, all becoming `../sidecar/...`). No behaviour, no export and no comment was altered, which
is the whole point of D-02 and the mitigation for T-35-55.

Everything else in commit 1 is a mechanically-forced consequence of the move:

- 25 production sidecar modules: `from './electronStub'` → `from '../platform'`
- 38 sidecar test files + `humble/__tests__/userAgent.test.ts`: `'../electronStub'` /
  `'../../sidecar/electronStub'` → `'../../platform'`
- `electronUntouched.test.ts`'s by-construction gate reads the module BY PATH:
  `'../electronStub.ts'` → `'../../platform/index.ts'`
- `isPackagedSidecar.test.ts`'s T-35-11 source gate is directory-scoped to `sidecar/`; it gained a
  `readPlatform()` reader so the SAME assertions now read the module at its new path. No assertion
  changed.
- the single `--alias:electron=` literal in `seaEsbuildFlags()`
  (`meta/esbuildWorkerBundleShared.ts`) and its mirror assertion in
  `meta/__tests__/buildSidecarSea.test.ts`, repointed together so neither can drift (T-35-54).

**Deliberately NOT changed:** three synthetic fixture strings
`"import { ipcMain } from './electronStub'"` in `appShellImportGate`, `gameDetailsImportGate` and
`enrichmentFlows`. These are fabricated source text feeding comment-stripper self-tests, not path
references; rewriting them would weaken the self-test.

**Two committed sha256 pins were re-pinned** per each gate's own documented procedure, with the prior
digests and justification recorded inline:
`SETTINGS_FLOW_REGISTRATION_SHA256` (1 insertion, 1 deletion: import specifier only) and
`ELECTRON_UNTOUCHED_SHA256` (2 insertions, 2 deletions: two path repoints). Neither pin's guarded
behaviour was touched.

### The export-surface decision (T-35-57)

The module ships **all 22 exports**, so D-02's "same 22 exports" holds exactly and no delta needs
stating. This **deliberately diverges** from `35-PREFLIGHT.md` PD-B's `PLATFORM_EXPORT_COUNT: 19`,
which marked `ElectronStubTransport`, `IpcHandler` and `IpcListener` DEAD.

PD-B's census rule explicitly excluded test files, so it answered *"is this live PRODUCTION
surface?"* — not *"can this export be deleted without breaking the build"*, which is the question the
move actually poses. Re-measured across the whole tree:

| Export | PD-B | Re-measured |
|---|---|---|
| `IpcHandler` | DEAD | **LIVE** — `eosOverlayFlows.test.ts`, `wineToolsFlows.test.ts`, `runnerSliceRegistration.test.ts` (~10 cast sites) |
| `IpcListener` | DEAD | **LIVE** — `runnerSliceRegistration.test.ts` |
| `ElectronStubTransport` | DEAD | **DEAD** — genuinely zero consumers anywhere; kept for API-shape parity at zero runtime cost (it is an interface; nothing is emitted) |

Dropping the first two would break three test files the plan separately forbids rewriting. PD-B
itself authorises keeping them ("keep them for API-shape parity at zero functional cost — either is
valid"). **Corrected census: 21 live + 1 dead = 22 shipped.** `PLATFORM_EXPORT_COUNT: 19` is
SUPERSEDED, not contradicted — it asked a correct, narrower question.

`35-PREFLIGHT.md` was left unedited: it is an observation record, and the correction belongs here.

### Four plan corrections recorded by the prior executor

1. **Blast radius.** The plan's `files_modified` frontmatter lists **6** entries. The move actually
   touched **66 files** in commit 1 (70 across both Task 1 commits, 72 including Task 2). The plan's
   own `<interfaces>` block predicted only the alias and the tests.
   *Measurement note:* the figure relayed to this executor as "95" could not be reproduced against
   the commits. The measured numbers are 66 / 70 / 72 files, and 60 repointed import specifiers in
   commit 1. Reporting what is measurable rather than restating the figure.
2. **Commit-1 file-count criterion unsatisfiable.** The plan requires commit 1 to touch "no file
   other than the moved file, `meta/esbuildWorkerBundleShared.ts` and
   `meta/__tests__/buildSidecarSea.test.ts`". That is impossible: 64 modules import the moved file by
   relative path, and leaving them broken would put a non-compiling tree in history. The rename is
   still cleanly detected (R099) because the moved file's own diff is 4 lines.
3. **`PLATFORM_EXPORT_COUNT: 19` superseded** by the corrected census above.
4. **File facts.** The moved file is **926 lines**, not the 817 the plan states, and required
   **4** relative-import fixes, not 2.

---

## Task 2 — the type surface (this session)

### The enumeration, re-measured

The plan states its type list is "representative, not exhaustive". It was re-derived from the plan's
own three greps, run over `src/` with `--include="*.ts" --include="*.tsx"`.

**Form 3 — bare `Electron.` namespace references.** `grep -rn "Electron\.[A-Za-z]" src` returns
**23 lines**, of which **one is prose**: `humbleLoginChromeCss.ts:5` reads
`deliberately NOT \`Electron.WebviewTag\`` inside a block comment. So **22 real references across 13
distinct names**. (A looser `Electron\.[A-Za-z]*` grep returns 33 hits; the extra 10 are sentences
ending "…under Electron." and similar. No declaration was created for any of them.)

| Type | Real refs | Sites |
|---|---|---|
| `Electron.IpcRendererEvent` | 4 | `DownloadManager/index.tsx:41`, `DialogHandler/index.tsx:38`, `Winetricks/index.tsx:95,:105` |
| `Electron.CrossProcessExports` | 4 | `tray_icon/__tests__/tray_icon.test.ts:91,:133,:188,:228` |
| `Electron.WebviewTag` | 3 | `WebView/index.tsx:71`, `HumbleLoginSurface.tsx:33`, `WebviewControls/index.tsx:14` |
| `Electron.MenuItemConstructorOptions` | 2 | `tray_icon.test.ts:59`, `extra-mock-function.ts:24` |
| `Electron.MouseInputEvent` | 1 | `main.ts:1305` |
| `Electron.MouseWheelInputEvent` | 1 | `main.ts:1306` |
| `Electron.KeyboardInputEvent` | 1 | `main.ts:1307` |
| `Electron.MessageBoxOptions` | 1 | `main.ts:571` |
| `Electron.ShortcutDetails` | 1 | `shortcuts/shortcuts/shortcuts.ts:79` |
| `Electron.Rectangle` | 1 | `common/types.ts:956` |
| `Electron.IpcMainInvokeEvent` | 1 | `dialog/dialog.ts:9` |
| `Electron.DidFailLoadEvent` | 1 | `WebView/index.tsx:346` |
| `Electron.BrowserWindowConstructorOptions` | 1 | `common/typedefs/extra-mock-function.ts:14` |

**Form 2 — `import type ... from 'electron'`, 12 real sites** (a 13th hit,
`sidecar/__tests__/electronReachLedger.test.ts:497`, is prose describing the pattern):

| Type | Sites |
|---|---|
| `IpcRendererEvent` | `SteamBridgeSetup.ts:1`, `SteamClientSetup.ts:1`, `SteamBottleSetup.ts:1`, `__tests__/SteamBridgeSetup.test.ts:13`, `__tests__/SteamClientSetup.test.ts:12`, `__tests__/SteamBottleSetup.test.ts:13`, `preload/ipc.ts:3`, `preload/api/misc.ts:18` |
| `FileFilter` | `components/UI/PathSelectionBox/index.tsx:6` |
| `BrowserWindow`, `OpenDialogOptions` | `backend/utils/openDialog.ts:20` |
| `OpenDialogOptions`, `TitleBarOverlay` | `common/types/ipc.ts:1` |

Plus the inline specifier `import { ipcMain, type IpcMainEvent } from 'electron'`
(`backend/ipc.ts:2`).

### FINDING 1 — the `import type` grep is blind in one direction (2 types missed)

`grep -rn "import type.*from ['\"]electron['\"]"` cannot see a **type imported without the `type`
keyword**. A wider `grep -rn "from ['\"]electron['\"]"` finds **five** such sites, and two of them
contribute type names that appear in **no other form anywhere in the tree**:

| Site | Specifier | Status |
|---|---|---|
| `src/backend/utils/uninstaller.ts:13` | `import { Event } from 'electron'` | **`Event` — NEW, in no other form** |
| `src/backend/__tests__/main_window.test.ts:3` | `import { BrowserWindow, Display, screen } from 'electron'` | **`Display` — NEW, in no other form** |
| `src/frontend/state/GlobalState.tsx:44` | `import { IpcRendererEvent } from 'electron'` | name already in the set |
| `src/common/types.ts:17` | `import { TitleBarOverlay } from 'electron'` | name already in the set |
| `src/backend/__mocks__/electron.ts:2-5` | `import { BrowserWindowConstructorOptions, MenuItemConstructorOptions }` | names already in the set |

Both new names are declared. Had they been missed, plan 35-18 would have surfaced them as unowned
type errors in `uninstaller.ts` (live backend code) and `main_window.test.ts`.

`Event` is the more dangerous of the two: electron's `Event` **shadows the DOM lib's global `Event`**
at that site. If plan 35-15 removes the import without rewriting the reference, `Event` silently
resolves to the DOM `Event` — a different type that still compiles. That hazard is recorded in
`types.ts` above the declaration.

### The declared set — 20 types

These are the target names plans 35-15 and 35-16 must rewrite onto. All are exported from
`src/backend/platform/types.ts`.

| # | Declared name | Shape | Why |
|---|---|---|---|
| 1 | `IpcRendererEvent` | branded opaque | 12 sites, none reads a field |
| 2 | `IpcMainEvent` | branded opaque | `backend/ipc.ts` listener signatures only |
| 3 | `Event` | branded opaque | `uninstaller.ts`, never read; both registrations already erase it |
| 4 | `IpcMainInvokeEvent` | `{ sender: { send(channel, ...args) } }` | `dialog.ts:16` READS `event.sender.send(...)` |
| 5 | `DidFailLoadEvent` | 4 fields, electron's real types | `WebView/index.tsx:346` destructures `validatedURL` |
| 6 | `WebviewTag` | `extends HTMLElement`, 10 methods + 5 event names | enumerated per call site below |
| 7 | `FileFilter` | complete (2 fields) | `PathSelectionBox` prop, and `OpenDialogOptions.filters` |
| 8 | `OpenDialogOptions` | complete (7 fields) | `openDialog.ts`, `common/types/ipc.ts:438` |
| 9 | `MessageBoxOptions` | faithful subset (14 fields) | `main.ts:571` literal + spread |
| 10 | `ShortcutDetails` | complete (8 fields), `target` REQUIRED | `shortcuts.ts:79` + later `icon`/`iconIndex` assignment |
| 11 | `MenuItemConstructorOptions` | faithful subset (18 fields) | tray template, mock, `CrossProcessExports.Tray.menu` |
| 12 | `BrowserWindowConstructorOptions` | 12 fields the tree sets/reads | `main_window.ts:54` spread; `main_window.test.ts` reads x/y/w/h |
| 13 | `TitleBarOverlay` | complete (3 fields) | `common/types/ipc.ts:136`, `common/types.ts:960` |
| 14 | `Rectangle` | complete (4 fields) | `common/types.ts:956` — `WindowProps extends Rectangle` |
| 15 | `Display` | 8 fields | `main_window.ts:33-41` reads `workAreaSize`; test casts a partial |
| 16 | `MouseInputEvent` | literal `type` union + x/y required | `main.ts:1305` union member |
| 17 | `MouseWheelInputEvent` | `type: 'mouseWheel'` narrowed | `main.ts:1306` union member |
| 18 | `KeyboardInputEvent` | literal `type` union + `keyCode` | `main.ts:1307` union member |
| 19 | `BrowserWindow` | branded opaque | `openDialog.ts:20` parameter, never read |
| 20 | `CrossProcessExports` | namespace containing `Tray` | `tray_icon.test.ts` ×4 |

Two supporting types are declared but **not** exported, because no site names them: `Size` (reached
through `Display`'s fields) and `ElectronInputEventBase` (electron calls it `InputEvent`; the name is
avoided because `InputEvent` is a `lib.dom` global this project has enabled, and exporting a
same-named type would set a shadowing trap).

`WebviewTag`'s surface is the exhaustive list of what its three call sites touch: `getURL`,
`loadURL`, `getUserAgent`, `setUserAgent`, `canGoBack`, `canGoForward`, `goBack`, `goForward`,
`reload`, `insertCSS`, and `addEventListener`/`removeEventListener` for exactly `dom-ready`,
`did-fail-load`, `page-title-updated`, `did-navigate`, `did-navigate-in-page`. It extends
`HTMLElement` because it is a real DOM node and because `humbleLoginChromeCss.ts`'s structural
stand-in relies on the inherited generic `addEventListener(type: string, …)` overload.

### How T-35-56 was mitigated

Every declaration was written against **both** the real shape in
`node_modules/electron/electron.d.ts` (while it still exists) **and** the consuming site.
**No declaration uses a bare `any`.** Where electron uses `any` in a parameter position
(`WebContents.send(channel, ...args: any[])`, `MenuItemConstructorOptions.click`'s three arguments),
the declaration uses `unknown` instead — which accepts every argument at the call site while refusing
to hand anything back untyped.

The load-bearing narrowness is the string-literal `type` unions on the three input events.
`main.ts:1303` declares `(MouseInputEvent | MouseWheelInputEvent | KeyboardInputEvent)[]` and pushes
bare object literals into it; discrimination happens entirely through `type`. Widening `type` to
`string` would make ~12 pushes accept a malformed event silently.

### FINDING 2 — a positive assertion is structurally blind to over-permissiveness

The assertion module (`src/backend/platform/__tests__/types.usage.test.ts`) was first written with
positive assertions only, then tested for non-vacuity by deliberately damaging `types.ts`. **Two of
three mutations were caught. The third escaped:**

| Mutation | Positive-only result |
|---|---|
| drop `IpcMainInvokeEvent.sender.send` | **RED** — `TS18046: 'props.event.sender' is of type 'unknown'` |
| drop `WebviewTag.insertCSS` | **RED** — `TS2741: Property 'insertCSS' is missing … but required in type 'HumbleLoginChromeCssWebview'` |
| widen `KeyboardInputEvent['type']` to `string` | **GREEN — escaped** |

The escape is instructive and generalises: the union at `main.ts:1303` still discriminated, because
narrowing works by *excluding* the two mouse members, whose literals were left intact. A positive
assertion can only ever demonstrate that something is *permitted*; it is structurally blind to a
declaration that permits **too much** — which is exactly the T-35-56 failure it was meant to catch.

The fix inverts the gate. A negative section using `@ts-expect-error` asserts **rejections**: if a
declaration is later widened so that the line stops erroring, TypeScript reports the directive itself
as unused (`TS2578`) and the build fails. Narrowness becomes self-proving rather than assumed.

Re-run after hardening, **all six mutations caught**:

| # | Mutation to `types.ts` | Result |
|---|---|---|
| M1 | `KeyboardInputEvent['type']` → `string` | RED (TS2578) |
| M2 | drop `IpcMainInvokeEvent.sender.send` | RED (TS18046) |
| M3 | drop `WebviewTag.insertCSS` | RED (TS2741) |
| M4 | de-brand `IpcRendererEvent` to `{ ports?: unknown[] }` | RED (TS2578) |
| M5 | widen `OpenDialogOptions.properties` with `\| string` | RED (TS2578) |
| M6 | make `ShortcutDetails.target` optional | RED (TS2578) |

`types.ts` was restored from a `cp` snapshot after each mutation and verified by `shasum -a 256 -c`.
No `git stash`, `git reset` or `git checkout -- <path>` was used at any point.

### FINDING 3 — compile-only assertions must not be bare blocks

The assertion module's first draft used top-level block statements. **ts-jest executed them**, and
the suite failed to run with
`TypeError: Cannot read properties of undefined (reading 'addEventListener')` on
`undefined as unknown as WebviewTag`. Every assertion now lives in an **exported, never-invoked
`assert_*()` function**: `export` keeps eslint from flagging it unused, and never calling it keeps it
compile-only. This matters beyond tidiness — an assertion that must be runtime-safe is a *weaker*
assertion, because it can only exercise values it can actually construct.

### FINDING 4 — `BrowserWindow` cannot be re-exported from `index.ts` (TS2323)

`src/backend/platform/index.ts` exports `BrowserWindow` as a **`const` object**, not a class, so it
supplies only the value meaning. `types.ts` also declares a `BrowserWindow` **type** (the window
instance type `openDialog.ts:20` names). Adding it to the `export type { … }` block was tested and
produces:

```
src/backend/platform/index.ts(715,14): error TS2323: Cannot redeclare exported variable 'BrowserWindow'.
src/backend/platform/index.ts(994,3): error TS2323: Cannot redeclare exported variable 'BrowserWindow'.
```

19 of the 20 types are re-exported from `index.ts` with `export type { … } from './types'`.
`BrowserWindow` is imported from `backend/platform/types` directly. **Plan 35-15 must not assume
`openDialog.ts`'s type import is a one-string change to `backend/platform`** — it is a one-string
change to `backend/platform/types`. This is recorded in a comment in `index.ts` so 35-15 does not
discover it as a surprise.

---

## Notes for plans 35-15, 35-16 and 35-18

These are not blockers for this plan; they are the parts of the downstream rewrites that this task's
measurements show are **not** mechanical.

1. **`src/common/typedefs/extra-mock-function.ts` AUGMENTS the ambient `Electron` namespace** —
   `declare global { namespace Electron { interface BrowserWindow {…}; interface Tray { menu: … } } }`.
   It is not a consumer of the namespace; it *extends* it. Once `electron` leaves `package.json`,
   `declare global { namespace Electron }` still creates the namespace, but
   `Electron.BrowserWindowConstructorOptions` and `Electron.MenuItemConstructorOptions` inside it
   become undeclared, and the `BrowserWindow`/`Tray` interfaces it declares become the *only*
   definitions of those names — changing their meaning rather than erroring. **35-16 cannot rewrite
   this file with a `Electron.X` → `X` substitution.**
2. **`Electron.CrossProcessExports.Tray` is the other non-mechanical site.** It is a qualified
   namespace member, and `.menu` on it comes from (1)'s augmentation, not from electron.
   `CrossProcessExports.Tray` here declares `menu` plus the three methods `tray_icon.ts` calls
   (`setContextMenu`, `setToolTip`, `on`) so that once 35-15 repoints `tray_icon.ts` at
   `index.ts`'s `Tray` **class**, the test's `as` cast retains structural overlap and does not have
   to be downgraded to `as unknown as`.
3. **Latent gap for 35-15: `index.ts`'s `Tray` class has no `setImage`.**
   `src/backend/tray_icon/tray_icon.ts:54` calls `appIcon.setImage(...)`. It compiles today because
   `tray_icon.ts` imports the real electron `Tray`. The moment 35-15 repoints that import at
   `backend/platform`, it will not. Recorded and left alone: the plan forbids behaviour changes
   inside the move, and adding a method to the stub is a behaviour change.
4. **`<webview>` survives 35-18.** The JSX intrinsic is declared by `@types/react`, not by
   `electron.d.ts` — verified by grep. Only the element's *type* (`WebviewTag`) needed replacing.
5. **`src/backend/__mocks__/electron.ts` is excluded from `tsc`** (`tsconfig.json` excludes
   `**/__mocks__/**`), but ts-jest still compiles it. Its two electron type imports are covered by
   this file's declarations; `pnpm codecheck` alone will not report on it.

## Deviations from Plan

### Auto-added, Task 2

**1. [Rule 2 — missing critical functionality] Two type names the plan's enumeration could not see**
- **Found during:** Task 2, running the plan's own greps
- **Issue:** `import type ... from 'electron'` is blind to `import { X } from 'electron'` where `X`
  is a type. `Event` (`utils/uninstaller.ts:13`) and `Display` (`__tests__/main_window.test.ts:3`)
  appear in no other form and would have had no declaration to point at in 35-15/35-18.
- **Fix:** both declared, with the `Event`/DOM-`Event` shadowing hazard documented.
- **Files:** `src/backend/platform/types.ts`
- **Commit:** `27015a776`

**2. [Rule 1 — bug in this task's own work] The assertion module was vacuous against widening**
- **Found during:** Task 2 non-vacuity testing
- **Issue:** mutation M1 (widening a literal union to `string`) passed a positive-only assertion
  module — the exact class of defect T-35-56 names.
- **Fix:** added a negative assertion section using `@ts-expect-error`, then re-ran all six
  mutations; all now caught.
- **Files:** `src/backend/platform/__tests__/types.usage.test.ts`
- **Commit:** `27015a776`

**3. [Rule 1 — bug in this task's own work] The assertion module executed at load**
- **Found during:** Task 2, first `pnpm test --selectProjects Backend` run
- **Issue:** bare block statements ran under ts-jest and threw on a manufactured `WebviewTag`.
- **Fix:** every assertion moved into an exported, never-invoked function.
- **Commit:** `27015a776`

### Scope boundaries respected

- `src/backend/main.ts` and `src/preload/index.ts` untouched.
- `35-PREFLIGHT.md` left unedited (observation record).
- No production module imports `from 'backend/platform'`; the only consumer is the assertion module.
- No `gsd-sdk state.*` or `roadmap.*` verb was invoked. STATE.md and ROADMAP.md are the
  orchestrator's to update by hand.
- Task 1's work was not re-opened; the 22-export decision stands as recorded.

## Verification

| Check | Result |
|---|---|
| `pnpm codecheck` | **exit 0** |
| `npx eslint src/backend/platform/` | **0 errors**, 8 warnings (2 pre-existing in `index.ts`; 6 in the assertion module are `require-await` on shapes that mirror real async call sites, plus one `no-unsafe-call` under a deliberate `@ts-expect-error`) |
| `npx prettier --check "src/backend/platform/**/*.ts"` | clean |
| `pnpm test --selectProjects Backend Meta` | **217 suites, 5001 tests — 4 failed**, exactly the known-red baseline (3× `decompressPool` native-LZMA `pure-js`, 1× `genI18nGateScope` A-17 drift). **Count unchanged.** |
| `pnpm build:sidecar` | exit 0 |
| `pnpm smoke:sidecar` | **PASS** |
| `git log --follow src/backend/platform/index.ts` | 32 commits |
| `git show --stat -M af0602e9b` | rename detected, `R099` |
| `test ! -f src/backend/sidecar/electronStub.ts` | exit 0 |
| `grep -c "alias:electron=./src/backend/platform/index.ts" meta/esbuildWorkerBundleShared.ts` | `1` |
| `grep -rc "electronStub" meta/` | `0` |
| `grep -c "^export" src/backend/platform/index.ts` | **23** — 22 value exports (unchanged, D-02) plus the one `export type {` line Task 2 added. See the note below: this grep stopped being a valid proxy for the export count the moment the type re-export block landed. |
| `grep -cE "^export (interface\|type\|namespace) " src/backend/platform/types.ts` | **20** |
| `grep -c "IpcMainEvent\|IpcRendererEvent\|WebviewTag\|DidFailLoadEvent" types.ts` | 14 (criterion: ≥4) |
| `grep -c "src/" src/backend/platform/types.ts` | 50 (criterion: ≥20, one per declared type) |
| `grep -c "export type" src/backend/platform/index.ts` | 4 (criterion: ≥1) |
| `grep -rn "from 'backend/platform'" src/` | one import — the assertion module. The other 2 hits are comment prose in `index.ts`. |

**Correction to the plan's Task 1 acceptance criterion 5.** The plan asserts
`grep -c "^export" src/backend/platform/index.ts` equals `PLATFORM_EXPORT_COUNT`. That held at the
end of Task 1 (22) but **no longer holds after Task 2**, which adds a single `export type { … } from
'./types'` block whose opening line also begins with `export`. The value-export surface is still
exactly 22 and unchanged; the grep now returns 23. A later reader checking that criterion against the
final tree would read a false delta. The count that matters is measured directly:

```
grep -c "^export"        src/backend/platform/index.ts   # 23  = the 22-export surface + Task 2's one re-export line
grep -c "^export type {" src/backend/platform/index.ts   #  1  = that re-export line; 23 - 1 = 22, unchanged
git show dc04ed787:src/backend/platform/index.ts | grep -c "^export"   # 22, the surface at the end of Task 1
grep -cE "^export (interface|type|namespace) " src/backend/platform/types.ts   # 20 type declarations
```

(A first attempt at this correction used
`grep -cE "^export (const|class|function|interface|type|\{) "`, which also returns 23 — the
`export type {` line matches the `type` alternative. Recorded because the same trap will catch the
next reader who tries to separate the two surfaces with a single pattern.)

| runtime erasure of `types.ts` | bundled `index.ts` with esbuild: **0** references to `types.ts`, `CrossProcessExports` or any brand. Fully erased. |

## Known Stubs

None introduced. The one pre-existing stub gap discovered — `index.ts`'s `Tray` class lacking
`setImage` — is documented under "Notes for plans 35-15…" above and is inert until 35-15 repoints
`tray_icon.ts`.

## Threat Flags

None. This plan adds no network endpoint, auth path, file access pattern or schema change. It moves
one file and adds two declarations-and-assertions files, all compile-time.

## Self-Check: PASSED

- `src/backend/platform/types.ts` — FOUND
- `src/backend/platform/__tests__/types.usage.test.ts` — FOUND
- `src/backend/platform/index.ts` — FOUND
- `src/backend/sidecar/electronStub.ts` — correctly ABSENT
- commit `af0602e9b` — FOUND
- commit `dc04ed787` — FOUND
- commit `27015a776` — FOUND
