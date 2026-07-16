---
phase: 21-steam-native-install
reviewed: 2026-07-16T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/manifest.ts
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/steam/__tests__/manifest.test.ts
  - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
findings:
  critical: 2
  warning: 3
  info: 0
  total: 5
status: resolved
disposition:
  - id: CR-01 (unescaped manifest GID in VDF)
    action: fixed
    commit: b207e488
    note: assertNumericId(d.manifest) added in buildInstalledDepotsBlock; header comment now accurate. + non-numeric-GID rejection test.
  - id: CR-02 (symlink EEXIST on retry)
    action: fixed
    commit: b207e488
    note: rm(dest,{force:true}) before symlink() makes the branch idempotent like mkdir(recursive)/open('w'). + retry-idempotency test.
  - id: WR-01 (symlink type arg omitted on Windows)
    action: deferred
    note: Cross-platform hardening; v1.4 milestone is macOS-focused (POSIX symlinks need no type arg). Tracked for a Windows-hardening pass.
  - id: WR-02 (backslash normalization in symlink target)
    action: deferred
    note: Same Windows-only concern; POSIX/macOS manifest targets use forward slashes. Tracked with WR-01.
  - id: WR-03 (ASCII-only installdir whitelist)
    action: wontfix
    note: Deliberate T-21-14-03 security decision. Fallback to app_<id> is functional; loosening to arbitrary Unicode reopens RTL-override/control-char risk. Left as-is by design.
---

# Phase 21: Code Review Report (Gap Closure — CR-01/WR-01..04)

**Reviewed:** 2026-07-16
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the gap-closure diff for verifier CR-01 (directory/symlink manifest entries written as empty files) and warnings WR-01 (VDF injection), WR-02 (silent zero-chunk loss), WR-03 (unclamped progress percent), WR-04 (weak `sanitizeInstalldir`), covering commits 897eb515, 08b06e5a, 60e2032d against diff base 7238cf20.

The Directory/Symlink flag-bit branching in `downloadSingleFile` is correctly ordered before the empty-file fast path, uses the correct `EDepotFileFlag` bit values (Directory=64, Symlink=512, verified against `node_modules/steam-user/enums/EDepotFileFlag.js`), and the symlink-target containment check correctly uses `resolve()` + `relative()` (not `path.join`) and rejects an escaping target in the test suite. WR-02's zero-chunk guard and WR-03's percent clamp are both correctly implemented and match their test coverage.

However, two new defects were introduced by this fix, both severe enough to block sign-off:

1. The VDF-injection fix (WR-01) escapes `name`/`installdir` but leaves the `manifest` GID field — sourced from the exact same untrusted-PICS-data pool the file's own header comment calls out — completely unescaped/unvalidated, directly contradicting that same header comment's claim that it is "validated separately via assertNumericId."
2. The new symlink-creation branch calls `fs.promises.symlink()` directly with no idempotency handling. Unlike the directory branch (`mkdir(..., {recursive:true})`, idempotent) and the regular-file branch (`open(dest, 'w')`, truncates), `symlink()` throws `EEXIST` if anything already exists at the destination — which is guaranteed to happen on every D-07 retry of an app containing a symlink entry that succeeded on a prior attempt, and can also happen within a single fresh install if two depots in the same plan declare the same symlink path (common for shared/redistributable files across base+DLC depots).

Three further warnings were found in the same symlink branch and in the WR-04 whitelist hardening; details below.

## Critical Issues

### CR-01: `manifest` GID interpolated into the `.acf` VDF with no validation or escaping — reopens the exact injection class WR-01 was meant to close

**File:** `src/backend/storeManagers/steam/depot/manifest.ts:86-99`
**Issue:** `buildInstalledDepotsBlock` calls `assertNumericId(d.depotId, 'depotId')` before interpolating `depotId`, but never validates or escapes `d.manifest` (the 64-bit manifest GID) before interpolating it raw at line 93: `` `\t\t\t"manifest"\t\t"${d.manifest}"` ``. This field originates from `depot/select.ts`'s `selectAllDepots` (`manifest: String(gid)` at `select.ts:160`, where `gid` is read straight out of PICS appinfo — `d?.manifests?.[branch]`, a `string | { gid: string }` shape with zero shape/content validation, `select.ts:144-145`). This is the same untrusted-PICS-data-pool the file's own header comment (lines 24-32) explicitly calls out as needing `vdfEscape()` for `name`/`installdir` — but the GID never goes through `vdfEscape()` or `assertNumericId()`. Worse, the file's own header comment (lines 29-32) explicitly (and incorrectly) claims: *"The numeric-guarded fields (appid, depotId, manifest GID, size) are untouched by this — they are validated separately via assertNumericId"* — this is false for `manifest` GID; grep confirms `assertNumericId` is called exactly twice in the file, for `params.appId` and `d.depotId`, never for `d.manifest`.

A hostile/corrupted manifest GID string containing a `"` + newline (e.g. via a compromised/MITM'd CM connection, the same threat model WR-01 was written against) can inject a sibling `"StateFlags" "4"` key into the written `.acf`, causing Steam to treat a partial/failed install as fully verified and installed — exactly the attack WR-01 closed for `name`/`installdir`, left open here.

**Fix:**
```typescript
function buildInstalledDepotsBlock(depots: InstalledDepotEntry[]): string {
  return depots
    .map((d) => {
      assertNumericId(d.depotId, 'depotId')
      assertNumericId(d.manifest, 'manifest') // <-- add this
      return [
        `\t\t"${d.depotId}"`,
        '\t\t{',
        `\t\t\t"manifest"\t\t"${d.manifest}"`,
        `\t\t\t"size"\t\t"${d.size}"`,
        '\t\t}'
      ].join('\n')
    })
    .join('\n')
}
```
(Alternatively, if a non-numeric GID must ever be tolerated, route it through `vdfEscape()` instead of throwing — but given every other 64-bit identifier in this module is numeric-guarded, `assertNumericId` is the more consistent fix and matches the file's own stated intent.)

### CR-02: New symlink branch is not idempotent — `fs.symlink()` throws `EEXIST` on retry or on duplicate cross-depot paths, permanently failing that file

**File:** `src/backend/storeManagers/steam/depot.ts:514-529`
**Issue:** The new Symlink branch calls `await symlink(file.linktarget, dest)` with no check for (and no removal of) a pre-existing entry at `dest`. Unlike the Directory branch (`mkdir(dest, { recursive: true })` — a documented no-op if the directory already exists) and the regular-file path (`open(dest, 'w')` — truncates on open), Node's `fs.promises.symlink()` throws `EEXIST` if `dest` already exists as anything (file, directory, or another symlink).

This is a real, reachable regression against the codebase's own D-07 "Retry" invariant (explicitly tested for regular files in `depot.test.ts`'s `'D-07: Retry ... overwrites on-disk files without throwing'` test, but that test uses only a plain file — no symlink entry is exercised in it). Concretely:
- **Retry scenario:** `downloadSteamDepots` re-invokes `buildDepotPlan` + `downloadDepotFiles` from scratch on every retry (per the D-07 test), reprocessing every file in the plan — including symlinks that already succeeded on a prior attempt. The second call to `symlink()` for that same path throws `EEXIST`, permanently recording that file as a failure on every subsequent retry (it can never succeed again), so the install can never fully complete.
- **Same-plan duplicate:** if two depots in a single plan (e.g. base game + DLC depot, which commonly share redistributable/symlinked files) both declare a manifest entry for the same relative path as a symlink, the second worker to process it hits the same `EEXIST` on the very first install attempt, not just on retry.

**Fix:** Make the symlink creation idempotent, matching the directory/file branches:
```typescript
import { rm } from 'node:fs/promises' // add to existing node:fs/promises import

// ...
await rm(dest, { force: true }) // no-op if nothing exists there yet
await symlink(file.linktarget, dest)
```

## Warnings

### WR-01: `symlink()` called without an explicit `type` argument — order-dependent broken directory symlinks on Windows

**File:** `src/backend/storeManagers/steam/depot.ts:528`
**Issue:** `await symlink(file.linktarget, dest)` omits the optional `type` ('file' | 'dir' | 'junction') argument. Per Node's own documented behavior, on Windows this argument matters: if omitted, Node auto-detects by checking whether `target` already exists on disk at the moment of the call, defaulting to `'file'` if it does not. Because files across a depot are processed by a bounded worker pool (`FILE_CONCURRENCY = 8`) with no ordering guarantee between a symlink entry and its target file's entry, whether the target exists yet at symlink-creation time is non-deterministic. A symlink whose target turns out to be a directory can silently become a Windows file-type symlink instead of a directory-type one, producing a broken/incorrect link — and GameLib explicitly targets Windows as a first-class platform (per CLAUDE.md constraints).

**Fix:** Determine the target type from the manifest itself (or from a stat of the resolved target once written) and pass it explicitly:
```typescript
const targetIsDir = /* look up whether resolvedTarget corresponds to a Directory-flagged manifest entry */
await symlink(file.linktarget, dest, process.platform === 'win32' ? (targetIsDir ? 'dir' : 'file') : undefined)
```

### WR-02: Symlink target containment check doesn't normalize backslash separators, unlike the regular-file path — asymmetric handling risks broken symlinks from Windows-style manifest data

**File:** `src/backend/storeManagers/steam/depot.ts:397-406` vs `depot.ts:520-521`
**Issue:** `resolveContainedPath` (used for every regular file's own destination) explicitly normalizes backslashes before resolving: `filename.replace(/\\/g, '/')` (line 398), with the comment "Phase 18 lesson." The new symlink-target containment check does **not** apply the same normalization: `resolve(dirname(dest), file.linktarget)` (line 520) uses `file.linktarget` raw. Depot manifests are known to carry backslash-separated paths (this is exactly why `resolveContainedPath` normalizes them for filenames). A symlink `linktarget` value using backslash separators (e.g. `..\subfolder\lib.so`) will, on a POSIX install host, be treated by `resolve()`/`relative()` as a single literal path component (POSIX does not treat `\` as a separator) rather than a real relative path — the containment check will pass, but the resulting symlink's target will be the wrong, broken literal string instead of the intended relative path.

**Fix:** Apply the same normalization used for `file.filename` before resolving the symlink target:
```typescript
const resolvedTarget = resolve(dirname(dest), file.linktarget.replace(/\\/g, '/'))
```
and use the normalized value (not the raw `file.linktarget`) in the subsequent `symlink()` call as well, so the created link and the validated path agree.

### WR-03: `SAFE_INSTALLDIR` whitelist rejects all non-ASCII installdir names — functional regression vs. the pre-fix behavior

**File:** `src/backend/storeManagers/steam/installLocation.ts:90`
**Issue:** The hardened whitelist `/^[A-Za-z0-9 ._-]+$/` (WR-04) is strictly ASCII-only. The pre-fix `sanitizeInstalldir` only rejected `/`, `\`, and `..` substrings — any legitimately-named game with a non-ASCII installdir (accented Latin, CJK, Cyrillic, etc. — which do exist among real Steam titles) previously passed through unchanged and now unconditionally falls back to a generic `app_<appId>` directory name, changing observable behavior for a large class of inputs that pose no actual traversal/injection risk. This is a stricter-than-necessary fix: the actual threats being closed (quotes, colons, control characters, path separators, `..`) do not require excluding all of Unicode.

**Fix:** Widen the whitelist to accept Unicode letters/digits while still excluding the dangerous character classes:
```typescript
const SAFE_INSTALLDIR = /^[\p{L}\p{N} ._-]+$/u
```
(retains rejection of quotes, colons, slashes, backslashes, and control characters, since none of those are `\p{L}`/`\p{N}`/space/dot/dash/underscore).

---

_Reviewed: 2026-07-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
