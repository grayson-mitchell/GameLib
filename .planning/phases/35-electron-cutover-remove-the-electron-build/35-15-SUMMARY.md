---
phase: 35-electron-cutover-remove-the-electron-build
plan: 15
subsystem: backend
tags: [d-01, d-02, d-03, req-35-01, req-35-02, t-35-66, t-35-67, t-35-68, t-35-69, t-35-70, t-35-71]
status: COMPLETE 3/3 — src/backend/ is electron-free
wave: 9

requires: [35-13, 35-14]
provides:
  - 'Zero `from ''electron''` import statements under src/backend/ — 58 lines across 57 files rewritten to backend/platform'
  - 'A jest mock seam for backend/platform, replacing the one that died with the electron specifier'
  - 'A widened backend/platform type surface: 70 tsc errors -> 0'
  - 'A reach ledger baseline of 2, both owned by plan 35-16'
affects: [35-16, 35-18]

key-decisions:
  - 'main_window.ts RETAINED, correcting the plan — it has 12 live importers. Only tray_icon/ was deletable.'
  - 'The surface widening is a SEPARATE commit, so no surface change hides inside the mechanical diff.'
  - 'Two anti-degradation gates INVERTED rather than deleted, matching 35-14''s D-11 call.'
  - 'The ledger baseline is 2, NOT 0 — plan 35-18''s D-03 grep carries a documented asterisk.'

# Metrics
tasks-completed: 3
commits:
  - d09415f87  # task 1 — delete tray_icon
  - <batch>    # task 2 — storeManagers / sidecar / remaining backend
  - 1c1157441  # jest mock seam migration
  - 3fe548b09  # platform type surface widening
  - 01ec717e3  # task 3 — reach ledger
---

# Phase 35 Plan 15: The 67-File Rewrite

`src/backend/` no longer contains a single `from 'electron'` import statement. The mechanical
property the plan asked for held — **every rewrite commit is exactly `1 1 <path>` per file** — but
the plan's premise that this would be *inert* held only for the specifier. Three consequences it
did not anticipate cost more work than the rewrite itself.

## 1. Task 1 — one deletion, and one the plan got wrong

| Candidate | Verdict |
|---|---|
| `src/backend/tray_icon/` | **DELETED.** Importer grep returned nothing; every surviving mention in the tree is a comment. 35-06 replaced it in Rust, 35-14 removed its caller |
| `src/backend/main_window.ts` | **RETAINED — the plan listed it as a deletion candidate and was wrong.** It has **12 live importers**, including sidecar paths (`ipc.ts:3`, `launcher.ts:72`, `utils.ts:51`, `sidecar/shortcutsFlowRegistration.ts:95`). Deleting it would have broken live code |

The plan's "confirm rather than assume" instruction is the only reason that was caught.

`Tray` is the one `backend/platform` export that lost its last consumer. `nativeImage` was checked
too and is **not** orphaned. Nothing was removed from the platform surface — 35-18 owns that.

Tray PNG assets are untouched and still live: `src-tauri/src/main.rs:103/:107` `include_bytes!`
them into the shell binary.

## 2. Task 2 — the count, and a name check that passed while missing the problem

**65 files matched, 58 real import lines across 57 files** — 8 files matched only in comments, which
were left alone. The plan's stale count of 67 was re-derived as instructed.

T-35-67's prescribed check — diff the imported NAME set against the export surface — **passed
cleanly, 21/21 names had a home**. It is blind one level down: every failure that followed was a
*member* of a name that exists. `app` is exported; `app.showAboutPanel` was not declared. Worth
recording as a limitation of the check, not a mistake in running it.

Two sites were deliberately not rewritten:

- **`externalDynamicImportGate.test.ts:190`** — `import { app } from 'electron'` inside a template
  literal, the gate's own legal-control **specimen**. Rewriting it would change what the gate tests.
- **`openDialog.ts:20`** — the `D-35-13-03` split, the one file where the rewrite is not one string.

`BrowserWindow` needed the split at **two** sites, not the one D-35-13-03 predicted: `openDialog.ts`
and `utils.ts:782` (`detectVCRedist`), the latter also already importing the value, so its type
import is aliased.

## 3. The three things the plan did not anticipate

### (a) The jest mock seam died with the specifier — 128 failures, 18 suites

`src/backend/__mocks__/electron.ts` is keyed to the `electron` specifier. Because electron is a
**node_modules** package, jest applied it **automatically** to every backend suite. `backend/platform`
is a **user** module, and a user-module manual mock is **opt-in**. That asymmetry is the whole defect:
the mock silently stopped intercepting anything.

Three call forms had to move, and the third is the one a specifier sweep misses:

1. `jest.mock('electron', factory)` → retargeted, **13 suites**.
2. Suites relying on the automatic mock → explicit `jest.mock('backend/platform')`, **3 suites**,
   backed by a new manual mock at `src/backend/platform/__mocks__/index.ts`.
3. **`jest.requireMock('electron')` inside test bodies** — 15 call sites in `games.test.ts` alone.
   Retargeting only the `jest.mock` calls left that suite failing **all 265 tests**; the stack
   trace, not the specifier grep, is what found it.

The new mock **spreads the real module** and overrides only the nine doubles. The electron mock
exports 9 names, `backend/platform` exports 39 — returning only the nine would have left
`safeStorage`, `session`, `net`, `shell`, `clipboard` and `powerSaveBlocker` undefined for any suite
that opted in.

### (b) The type surface was censused for the sidecar, not the backend — 70 tsc errors

Widened in a **separate commit** so no surface change hides inside the mechanical diff:
`safeStorage` parameters, a typed `SidecarSession`/`SidecarCookie`, `net.request` arguments plus a
typed `SidecarIncomingMessage`, `shell.writeShortcutLink`, `app.setAboutPanelOptions`/
`showAboutPanel`/`getGPUInfo`, six fake-window members, `webContents.executeJavaScript`, and
`NotificationOptions.urgency`/`timeoutType`/`silent`.

**I introduced one behaviour change and then reversed it.** The first `fakeSession` resolved every
call, turning the D-09 accepted gap into a **lying** one — a cookie wipe reporting success while
wiping nothing, exactly the affordance D-05 forbids. `humbleFlows.test.ts`'s D-05 ordering proof
caught it: that suite asserts the Humble store clears happen *independently of every session wipe
step failing*. Every member now **rejects with a named error**, which also finally delivers what
this stub always claimed — a clear failure instead of the opaque `Cannot read properties of
undefined` its old `return {}` produced.

### (c) A pre-existing runtime break became visible

`storeManagerCommon/games.ts`'s browser-game window calls `new BrowserWindow(...)`, which the stub
cannot satisfy. **It has been broken under Tauri since the sidecar existed** — `Module._load`
already resolved `require('electron')` to this same stub — and the rewrite only made it visible to
`tsc`. Cast with the reasoning in-source to preserve current behaviour exactly, because fixing
behaviour noticed inside a mechanical diff is what the plan's constraint forbids. Ledgered.

## 4. Task 3 — the ledger, and why the baseline is 2

The pre-edit red was **not** the stale-baseline direction the plan predicted. It was two
**anti-degradation** assertions requiring reach to still exist. Both were **inverted rather than
deleted**, matching 35-14's call on the D-11 guard.

Emptying the array then made the growth tripwire throw, which is how the real remainder was found
rather than assumed:

```
A NEW electron-importing module entered the sidecar's reach graph and is NOT in the
committed baseline: src/common/types.ts, src/common/types/ipc.ts
```

Both are under `src/common/`, outside this plan's scope and owned by **35-16**. The
anti-degradation loop is **partitioned by scope**, not blanket-inverted — `requiredModules` contains
`src/common/types.ts` alongside backend modules, so asserting `false` for all would have been wrong
in the one direction that hides remaining work.

**FOR PLAN 35-18: the baseline length is 2.** D-03's success test carries a documented asterisk
rather than being a clean single grep.

## 5. Verification

| Check | Result |
|---|---|
| `from 'electron'` import statements under `src/backend/` | **0** (the fixture and prose mentions classified mechanically) |
| `require('electron')` in `src/backend/` | **0 real** — every hit is comment prose |
| `pnpm codecheck` | **exit 0** (from 70 errors) |
| `pnpm build:sidecar` | **PASS** — the esbuild leg tsc and jest cannot see |
| `pnpm smoke:sidecar` | **PASS** |
| `pnpm test --selectProjects Backend` | **185/186 suites, 4282 passed, 3 failed** |
| Every rewrite commit `1 1` per file | **yes**, `git show --numstat` clean |
| `src/frontend/` + `src/preload/` touched | **0 files** |

The 3 failures are the known-red `decompressPool` native-LZMA baseline, identity-confirmed. It
pre-dates this plan.

**Two criteria are NOT literally met and are not reported as met:**

- `grep -c "from 'electron'"` on `electronReachLedger.test.ts` must print `0`; it prints **9**. All
  nine are **documentation prose** in a file whose purpose is explaining electron reach —
  classified mechanically: real import statements 0, prose 9. Gutting the explanation to satisfy a
  grep is the wrong trade.
- The baseline is 2, not the hoped-for `[]` — by design, and owned by 35-16.

## Known Stubs

`backend/platform`'s widened members are signature-only: `writeShortcutLink` returns `false`,
`getGPUInfo` returns `{}`, the About-panel and window members are no-ops, and every `session`
member rejects. None pretends to work.

## Threat Flags

T-35-66 (behaviour hidden in a mechanical diff) held — the `1 1` property was enforced per commit
and the one real behaviour change I introduced was caught by an existing D-05 test, not by review.
T-35-67 was mitigated but its prescribed check is **name-level and blind to members**; that is the
finding. T-35-68 through T-35-71 as planned.
