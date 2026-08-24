---
quick_id: 260824-u8b
slug: installmodal-native-platform-default
date: 2026-08-24
status: complete
commit: 68bada5bf
---

# Quick 260824-u8b — install modal: native platform default + selector position

**Status: COMPLETE.** Commit `68bada5bf`.

## What was wrong

Platform **availability** and platform **default** were derived from two different signals, and for
non-Steam runners they disagreed:

| | signal | source |
|---|---|---|
| availability (`platforms[]`) | `isMacNative` | `gameInfo.is_mac_native` — the store library |
| default (`getDefaultplatform`) | `macDepotOffered` | `resolveDepotAvailability()` — a **Steam depot** probe |

A non-Steam title has no depot probe, so `macDepotOffered` was false and **Windows was preselected
while the macOS option sat in the selector next to it**.

Measured live, not inferred: the Epic title Phoenix Point (`legendary`, `Iris`) has
`is_mac_native: true` and a real Mac manifest (`legendary info Iris --platform Mac` → version
`1.30.75117M`, 22.58 GiB download / 37.34 GiB on disk), and `metadata/Iris.json` carries both
`CloudSaveFolder` and `CloudSaveFolder_MAC`. The modal nonetheless launched
`legendary install Iris --platform Windows --base-path … --skip-dlcs -y --skip-sdl`.

## What changed

**New `defaultPlatform.ts`** — a pure module, extracted specifically so the Steam anti-regression
case can be asserted directly. `index.tsx` cannot be imported by any test in this repo (it imports
`./index.scss` on line 1 and the Frontend jest project has no jsdom), which is why this directory's
existing coverage is source-grep-only; the rule now lives somewhere a real behavioural test can
reach it.

```ts
resolveMacNativeOffered({ runner, macDepotOffered, isMacNative }) =
  runner === 'steam' ? macDepotOffered : isMacNative
```

Steam keeps the depot probe because unresolved-at-open is a genuine state there (34.15 D-05).
Everyone else uses `is_mac_native`, the same already-resolved field the availability seed reads — so
default and availability can no longer disagree.

**Steam is untouched**, and both existing guards are preserved: the `depotSignalResolved`
re-derivation effect and the `userChosePlatformRef` guard that protects an explicit user choice. The
initializer and the effect both read the one resolved `macNativeOffered` value, preserving the
identity the 34.15 D-14 comment exists to protect (the Terraria symptom).

**The 34.15 D-14 comment was extended, not deleted.** It previously read "do not misread it as an
argument for defaulting to Mac", which this change would have contradicted. It now records the
distinction: that reasoning is *Steam-specific* — Steam answers "is there a Mac build?" with a probe
that can be unresolved, whereas legendary/gog/nile/humble answer it with library data that is
already resolved, so an unknown-case default is simply wrong there.

**Selector moved to the top** of `DownloadDialog`, `ImportDialog` and `ThirdPartyDialog`, because it
reshapes the fields below it — `hasWine` gates the whole Wine row, and `ImportDialog`'s `pickFile`
decides file- vs directory-mode for the path picker.

## Findings

### F1 — SteamDialog was EXCLUDED from the move, on evidence

Moving `{children}` to the top of `SteamDialog` turned `steamDialogSource.test.ts` RED. It carries a
**D-24 layout contract**: `libraryMissingNotice` must occur BEFORE `{children}`, and the D-14
`sharedBottleNotice` after it. That is a deliberate Steam-specific decision this task has no mandate
to overturn, so SteamDialog was reverted and left as-found, with the reason recorded in the new
test file next to the (deliberately three-element) dialog list.

Worth flagging for whoever revisits it: that suite's own test name already calls `{children}` *"the
first thing in DialogContent"* while simultaneously requiring a notice above it. The name and the
assertion disagree. Not fixed here — it is Steam's contract to change.

### F2 — the directory-mode picker connection

`ImportDialog`'s `pickFile = platformToInstall === 'Mac'` decides whether the path picker opens in
file or directory mode, and **a macOS `.app` bundle is invisible in directory mode** (macOS treats
bundles as packages, i.e. files). During the 34.6 live gate this made an import fixture unreachable
until the platform was changed first. Putting the selector above the path field is what makes that
ordering discoverable rather than something the user has to know.

### F3 — Linux has the same shape, deliberately not changed

`isLinuxNative` mirrors `isMacNative` exactly, and the Linux default very likely has the same
defect. Out of scope here (the task was macOS-specific and no Linux host was available to measure
on). Anyone extending this should reuse `resolveMacNativeOffered`'s shape rather than special-casing.

## Verification

| Check | Result |
|---|---|
| `pnpm jest --selectProjects Frontend` | **123 suites / 2043 tests passed** |
| InstallModal suites specifically | 12 suites / 381 tests passed |
| `pnpm codecheck` (tsc --noEmit) | clean |
| `npx prettier --check` (6 touched files) | clean |
| `npx eslint` (6 touched files) | **0 errors** (severity 2), 15 pre-existing warnings |

**RED-proof, as required by the plan.** The naive fix — `macOffered = isMacNative` for every runner —
was installed deliberately and the suite run. All three Steam anti-regression assertions failed
against it while every other assertion passed, confirming the gate discriminates the exact mistake
it exists to catch. The real implementation was then restored from a pre-edit copy.

The `{children}`-ordering gate additionally carries an inline known-bad specimen proving it fails
when `{children}` is last, so a green run there is evidence rather than decoration.

## Deviations from plan

1. **SteamDialog dropped from Task 2** — see F1. The plan listed four dialogs; three were changed.
2. **First attempt inserted malformed JSX.** The rationale comment was written as `{/* … */`
   without the closing brace, and separately, `stripSourceComments` reduces a JSX comment to bare
   braces, which broke the "first child" assertion. Both were caught by the test run, the four
   files were restored from `HEAD` via `git show HEAD:<path> > <path>` (never `git checkout --`,
   which fires this repo's post-checkout hook), and the comment was reinstated *after* `{children}`
   rather than before it.

## Build safety (live gate was in progress)

No build artifact was touched: `electron-vite build`, `pnpm tauri:dev` and anything else rewriting
`build/` were avoided entirely, and PIDs 21590 / 21682 / 21802 plus the running `legendary`
download were left alone. The running app serves a static bundle from commit `c13b9e398` with no
Vite HMR, so **this change is NOT in the app currently under test** — it takes effect only on the
next rebuild.
