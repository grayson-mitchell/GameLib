---
phase: 23-steam-full-ownership-install-stateflags-4
reviewed: 2026-07-17T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/fileAttributes.ts
  - src/backend/storeManagers/steam/depot/manifest.ts
  - src/backend/storeManagers/steam/depot/reconcile.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/steam/__tests__/fileAttributes.test.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/manifest.test.ts
  - src/backend/storeManagers/steam/__tests__/nativeInstallSetting.test.ts
  - src/backend/storeManagers/steam/__tests__/reconcile.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-07-17
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the StateFlags=4 full-ownership productionization of spike 003: the
`canWriteFullOwnership` completeness gate, the sha1-gated `reconcile.ts`
resume module, the hand-templated `.acf` writer (`manifest.ts`), the
`fileAttributes.ts` Windows `attrib.exe` invocation, and `library.ts`'s
startup-resume wiring, plus their test suites.

The core fresh-install pipeline (`buildDepotPlan` -> `downloadDepotFiles` ->
`finalizeToSteam`) is solid: `canWriteFullOwnership` fails closed on every
input it is given, `reconcile.ts`'s sha1 gate is real (size-match alone is
never trusted, proven by dedicated tests), `manifest.ts` keeps every 64-bit
GID a string end-to-end and VDF-escapes untrusted PICS strings, and
`fileAttributes.ts`'s Windows path is argv-form `spawnSync` with a hardcoded
flag/trailing-path argv shape — no shell injection surface. The 1026 fallback
is unconditional and unchanged (`buildAppManifestText`'s defaults), confirmed
by a dedicated regression test that greps the source for a bare `"4"`
StateFlags literal.

However, the **startup-resume path** (`library.ts`'s `buildResumeFinalizeOpts`,
new in this phase) has a real fail-closed gap: it derives `allModesApplied`
directly from `reconcilePartialState`'s **content-only** sha1 verdict,
without ever re-running the mode-heal step that the fresh-install/live-resume
path (`downloadDepotFiles`) explicitly performs for every reconciled file.
That means a resume can earn StateFlags=4 while a file's Executable/ReadOnly/
Hidden bits were never actually confirmed applied — precisely the class of
"doubt" the gate is supposed to fail closed on. This is a BLOCKER. Three
lower-severity issues (an inconsistent Directory/Symlink guard in the
mode-heal loop, backslash-vs-forward-slash containment-check inconsistency
for symlink targets, and a missing `sanitizeInstalldir` call on the resume
path) round out the findings.

## Critical Issues

### CR-01: Startup-resume path grants StateFlags=4 without ever verifying (or re-applying) file modes

**File:** `src/backend/storeManagers/steam/library.ts:163-224` (specifically the `allModesApplied: allFilesVerified` assignment at line 206)

**Issue:**
`buildResumeFinalizeOpts` — the function `SteamLibraryManager.init()` calls on
every startup to finalize a GameLib-owned partial install found on disk —
builds its `FinalizeToSteamOpts` gate inputs like this:

```ts
const { jobs, allFilesVerified } = await reconcilePartialState(plan, installRoot)
return {
  ...
  outcome: jobs.length === 0 ? 'completed' : 'cancelled',
  failures: jobs.map(...),
  allFilesVerified,
  // Every file reconcile trusted was verified by the ORIGINAL download
  // session's own per-file pipeline (downloadSingleFile applies
  // EDepotFileFlag modes immediately after each file's own sha1 check
  // passes, before moving to the next file) ...
  allModesApplied: allFilesVerified
}
```

`reconcilePartialState` (`depot/reconcile.ts`) is explicitly, deliberately
**content-only** — it never inspects file mode bits (its own header comment:
"existence guarantees nothing, sha1 guarantees content" — nothing about
modes). The comment in `buildResumeFinalizeOpts` justifies trusting
`allFilesVerified` as a proxy for "modes applied" by assuming the ORIGINAL
download session always got far enough to run `applyEDepotFileModes` for
every file it sha1-verified. That assumption does not hold in the one case
that actually matters: a crash/kill exactly between `downloadSingleFile`'s
whole-file sha1 check succeeding (`depot.ts:824-829`) and its mode-application
call (`depot.ts:842-849`) leaves a file that is byte-perfect (passes sha1)
but has NEVER had its Executable/ReadOnly/Hidden bits applied. On next
startup, that file reconciles as `verified: true` (regularFileVerified only
checks size+sha1), `jobs.length` can be `0` for the whole plan, and
`buildResumeFinalizeOpts` reports `allModesApplied: true` with zero actual
verification — earning StateFlags=4 via `canWriteFullOwnership`.

This is the exact failure mode Phase 23 exists to prevent (spike 003's
`os error 256` — a missing `+x` bit, masked because Steam's verify pass is
skipped under StateFlags=4). Contrast with the fresh-install/live-resume path:
`downloadDepotFiles` (`depot.ts:940-960`) explicitly re-runs
`applyEDepotFileModes` for every file the reconciler skipped, specifically so
a healed/half-applied mode from a prior interrupted run never gets silently
trusted — and that healing failure is threaded into `failures` so the gate
sees it. `buildResumeFinalizeOpts` is a second, parallel caller of
`reconcilePartialState` (per this module's own "Shared Patterns" discipline)
but does **not** reuse that healing step — it has no access to
`applyEDepotFileModes` (an unexported `depot.ts` function) and no equivalent
of its own.

Confirmed by the test suite: `library.test.ts:1291` ("a fully-reconciled-
verified resume ... earns StateFlags=4") sets up a resume where
`reconcilePartialState` is mocked to return `{ jobs: [], allFilesVerified:
true }` and asserts StateFlags=4 gets written — with no mode-application
assertion anywhere in that test, and no test anywhere in `library.test.ts`
exercises the mode-application/mode-healing question for the resume path at
all (confirmed via grep — zero hits for `applyEDepotFileModes`/`chmod`/
`allModesApplied` outside the trivial pass-through).

**Fix:** Either (a) export `applyEDepotFileModes` (or an equivalent) from
`depot.ts` and call it from `buildResumeFinalizeOpts` for every
reconciler-trusted file with `flags` set, mirroring `downloadDepotFiles`'s own
healing loop, before reporting `allModesApplied: true`; or (b) fail closed
unconditionally on the resume path (`allModesApplied: false` always) until
that healing step exists, so a resume can only ever earn the safe 1026
fallback until modes are actually re-verified. Given the domain's explicit
"ANY doubt -> fall back to 1026" contract, (b) is the minimal safe fix; (a)
is the correct long-term fix (matches the fresh-install path's own
discipline and lets a genuinely-complete resume still earn StateFlags=4).

```ts
// depot.ts — export the existing helper
export async function healFileMode(dest: string, flags: number) { ... } // was applyEDepotFileModes

// library.ts — buildResumeFinalizeOpts, after reconcilePartialState:
let allModesHealed = true
for (const depot of plan.depots) {
  for (const file of depot.files) {
    if (!file.flags) continue
    if (jobs.some((j) => j.file === file)) continue // will be re-verified via failure path
    const dest = resolveContainedPath(installRoot, file.filename)
    const modeResult = await healFileMode(dest, file.flags)
    if (!modeResult.ok) allModesHealed = false
  }
}
// ...
allModesApplied: allFilesVerified && allModesHealed
```

## Warnings

### WR-01: Mode-heal loop applies file-mode operations to Directory/Symlink manifest entries without the same guard `downloadSingleFile` uses

**File:** `src/backend/storeManagers/steam/depot.ts:940-960`

**Issue:** `downloadSingleFile` explicitly returns early for Directory(64)
and Symlink(512) manifest entries (`depot.ts:767-796`) **before** ever
reaching the sha1-verify + `applyEDepotFileModes` block — a directory or
symlink path is never handed to `chmod`/`attrib.exe`. The mode-heal loop in
`downloadDepotFiles` that re-applies modes to reconciled (skipped-download)
files has no equivalent guard:

```ts
for (const depot of plan.depots) {
  for (const file of depot.files) {
    if (jobFiles.has(file) || !file.flags) continue
    const dest = resolveContainedPath(installRoot, file.filename)
    const modeResult = await applyEDepotFileModes(dest, file.flags)
    ...
```

`file.flags` is truthy for any Directory(64)/Symlink(512) entry (nonzero bit
value), so if a manifest ever combines those bits with ReadOnly(8)/Hidden(16)
(e.g. `flags = 64 | 8 = 72`), this loop will call
`applyDepotFileFlags(dest, 72, platform)` against a **directory path**. On
POSIX that resolves to `chmod(dirPath, 0o444)` — a directory with no execute
bit is not traversable, which would make every file inside it inaccessible.
No test in `depot.test.ts` or `reconcile.test.ts` exercises a Directory/
Symlink entry combined with a mode bit, so this combination is unverified
either way.

**Fix:** Mirror `downloadSingleFile`'s own guard — skip the mode-heal call
for Directory/Symlink entries:

```ts
if (jobFiles.has(file) || !file.flags) continue
if (file.flags & (DIRECTORY_FLAG | SYMLINK_FLAG)) continue
```

### WR-02: Symlink target containment check does not normalize backslashes, unlike `resolveContainedPath`

**File:** `src/backend/storeManagers/steam/depot.ts:781-787`

**Issue:** `resolveContainedPath` (line 610) normalizes a manifest filename's
backslashes to forward slashes before calling `resolve()`, specifically
because Windows-style depot paths can use `\` and POSIX's `resolve()`/
`relative()` do not treat `\` as a separator. The inline symlink-target
containment check in `downloadSingleFile` does not apply the same
normalization:

```ts
const resolvedTarget = resolve(dirname(dest), file.linktarget)
const relToRoot = relative(installRoot, resolvedTarget)
```

If a manifest's `linktarget` ever uses backslash-separated relative segments
(plausible given the same manifest format's filenames do), this containment
check and the eventual `symlink()` call will treat the whole string as one
literal path component rather than resolving nested directories — producing
a broken symlink rather than the intended target (functional bug). This is
not an exploitable traversal on POSIX (backslash isn't a real separator
there, so no actual escape is possible), but it is an inconsistency with the
established containment convention this same file uses one function up.

**Fix:** Normalize `file.linktarget` the same way before resolving:
`resolve(dirname(dest), file.linktarget.replace(/\\/g, '/'))`.

### WR-03: Startup-resume path never runs `installdir` through the `sanitizeInstalldir` whitelist guard the fresh-install path enforces

**File:** `src/backend/storeManagers/steam/library.ts:108-137, 163-224`

**Issue:** The fresh-install path (`installLocation.ts`'s
`resolveSteamInstallTarget`, Phase 21/T-21-01) sanitizes PICS-sourced
`installdir` against a positive whitelist before it is ever used to build a
filesystem root. `locateDownloadingTarget` (library.ts, this phase's
startup-resume helper) instead reads `installdir` directly off the on-disk
ACF's `AppState.installdir` field with no equivalent sanitization, and
`buildResumeFinalizeOpts` passes it straight into `buildDepotPlan` and
`resolve(target.targetSteamappsDir, 'common', target.installdir)`
(`library.ts:174`). Exploiting this requires an attacker who can already
write to the Steam library's `steamapps/` directory (to plant a hostile
`appmanifest_*.acf`), which is a fairly strong local-write precondition — so
this is a defense-in-depth gap rather than a directly exploitable
vulnerability, but it breaks the "path containment must guard every
filesystem write" invariant this phase is held to, and it is inconsistent
with the sibling fresh-install code path.

**Fix:** Route `target.installdir` through `sanitizeInstalldir` (or an
equivalent guard) before it reaches `buildDepotPlan`/`resolve()` in
`buildResumeFinalizeOpts`.

## Info

### IN-01: EDepotFileFlag bit constants duplicated across three files

**File:** `src/backend/storeManagers/steam/depot.ts:55-67`, `src/backend/storeManagers/steam/depot/reconcile.ts:27-28`, `src/backend/storeManagers/steam/depot/fileAttributes.ts:31-34`

**Issue:** `DIRECTORY_FLAG`/`SYMLINK_FLAG` are hardcoded independently in
both `depot.ts` and `reconcile.ts`; `READONLY_FLAG`/`HIDDEN_FLAG`/
`EXECUTABLE_FLAG`/`CUSTOM_EXECUTABLE_FLAG` are hardcoded independently in
both `depot.ts` and `fileAttributes.ts`. Each file's comment acknowledges
this is because `steam-user` doesn't export the enum publicly, but the values
are duplicated rather than centralized in one small local module the other
three import from — a future correction to one copy (e.g. if steam-user's
enum values were ever found to be wrong) could easily miss a sibling copy.

**Fix:** Extract a single `depot/edepotFileFlag.ts` (or similar) exporting
all six constants; have `depot.ts`, `reconcile.ts`, and `fileAttributes.ts`
import from it.

### IN-02: `buildResumeFinalizeOpts` labels an incomplete (not cancelled) resume as `outcome: 'cancelled'`

**File:** `src/backend/storeManagers/steam/library.ts:191`

**Issue:** `outcome: jobs.length === 0 ? 'completed' : 'cancelled'` reuses the
`'cancelled'` outcome label for "reconciliation found genuinely missing/
mismatched files" — which is not a user cancel and not an AbortSignal event.
Functionally harmless today (`canWriteFullOwnership` treats any non-
`'completed'` outcome as fail-closed, so this doesn't change behavior), but
it's a misleading label that could confuse a future reader/maintainer of
`finalizeToSteam`'s call sites into thinking an actual cancel occurred.

**Fix:** Consider a third outcome value (e.g. `'incomplete'`) for this case,
or a code comment at the call site making clear this reuses `'cancelled'`
purely for its fail-closed effect, not its literal meaning.

---

_Reviewed: 2026-07-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
