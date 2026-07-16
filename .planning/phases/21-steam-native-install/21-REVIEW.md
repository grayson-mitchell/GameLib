---
phase: 21-steam-native-install
reviewed: 2026-07-15T19:22:57Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - src/backend/config.ts
  - src/backend/main.ts
  - src/backend/storeManagers/steam/clientSetup.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/crypto.ts
  - src/backend/storeManagers/steam/depot/decompress.ts
  - src/backend/storeManagers/steam/depot/manifest.ts
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/depotErrors.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/nativeInstallSetting.ts
  - src/common/typedefs/lzma.d.ts
  - src/common/typedefs/steam-user-content-manifest.d.ts
  - src/common/types.ts
  - src/common/types/ipc.ts
  - src/frontend/App.tsx
  - src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx
  - src/frontend/screens/Game/GamePage/components/SteamInstallLocationPicker.tsx
  - src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/InstallGameModal.ts
  - src/frontend/state/SteamClientSetup.ts
  - src/frontend/state/SteamInstallLocation.ts
  - src/preload/api/steam.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-07-15T19:22:57Z
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Phase 21 adds an in-process Steam depot downloader (fetch → AES decrypt → LZMA/zip
decompress → positional writes → `.acf` manifest). The security-critical primitives are
generally sound: per-chunk SHA1 gating in `fetchChunk`, whole-file SHA1 verification in
`downloadSingleFile`, `resolve()+relative()` path containment in `resolveContainedPath`
(correctly not trusting `path.join`), numeric appId/depotId guards at every network/FS
entry point, atomic temp-file+rename manifest writes, and registered-library-only install
targeting. IPC handlers validate appId server-side through a single seam.

However, the review surfaced one correctness BLOCKER and several robustness gaps. The
streaming write loop parses each manifest file's `flags` field but never consults it —
directory and symlink manifest entries (both size 0, no chunks) are written as empty
regular files, which collides with real subdirectories and breaks the child file writes
inside them. Separately, the `.acf` writer carefully guards its numeric fields but
interpolates the untrusted PICS-sourced `name` and `installdir` strings into VDF text
unescaped, allowing quote/newline injection into a state-control file. The remaining
findings concern silent success on inconsistent manifests, an unclamped progress percent,
and defensive-hardening opportunities.

## Critical Issues

### CR-01: Manifest `flags` parsed but never used — directory/symlink entries written as empty files, colliding with real subdirectories

**File:** `src/backend/storeManagers/steam/depot.ts:265-271, 488-495`
**Issue:** `fetchDepotPlanEntry` captures each manifest file's `flags` field
(`flags: f.flags`) but nothing downstream ever consults it. Steam depot manifests
(steam-user `content_manifest.parse`) include **directory** entries (flag
`EDepotFileFlag.Directory`) and **symlink** entries (flag `Symlink`, carrying a
`LinkTarget`), both of which have `size === 0` and no chunks. In `downloadSingleFile`:

```ts
if (!file.chunks.length || Number(file.size) === 0) {
  const empty = await open(dest, 'w')   // creates an empty REGULAR FILE
  await empty.close()
  return
}
```

A directory entry named `bin` is therefore written as an empty *file* `.../common/<dir>/bin`.
Because files are processed with `FILE_CONCURRENCY` in arbitrary order:
- If `bin` (the directory entry) is processed first, the later `bin/game.exe` write calls
  `mkdir(dirname(dest), { recursive: true })` on a path whose parent is now a file →
  `ENOTDIR`, recorded as a per-file failure.
- If `bin/game.exe` is processed first, the directory `bin` is created, then the `bin`
  directory *entry* calls `open(dest, 'w')` on an existing directory → `EISDIR`, another
  failure.

Either ordering produces spurious failures for essentially any game whose manifest
contains directory entries (most games), and symlinks are silently materialized as empty
files (broken links; `LinkTarget` discarded). This defeats the feature for real installs.
**Fix:**
```ts
// EDepotFileFlag: Directory = 64, Symlink = 512 (verify against steam-user's enum)
const DIRECTORY_FLAG = 64
const SYMLINK_FLAG = 512

// In downloadSingleFile, before any open()/mkdir():
if (file.flags && (file.flags & DIRECTORY_FLAG)) {
  await mkdir(dest, { recursive: true })
  return
}
if (file.flags && (file.flags & SYMLINK_FLAG)) {
  // create the symlink from its LinkTarget (must be captured in DepotPlanFile),
  // after a containment check on BOTH the link path and its resolved target,
  // or explicitly skip + record if link targets are out of scope.
  return
}
```
Before shipping, verify empirically what `content_manifest.parse` returns for a
directory-bearing depot and confirm the flag bit values against steam-user's enum; the
`flags` field is already threaded through `DepotPlanFile` for exactly this purpose but is
never read.

## Warnings

### WR-01: Untrusted PICS `name`/`installdir` interpolated into `.acf` VDF text unescaped (manifest injection)

**File:** `src/backend/storeManagers/steam/depot/manifest.ts:80-116, 92, 95, 96`
**Issue:** `buildAppManifestText` rigorously guards its numeric fields
(`assertNumericId` on appId/depotId) but interpolates the string fields directly:

```ts
`\t"installdir"\t\t"${params.installdir}"`,
`\t"name"\t\t"${params.name}"`,
```

`name` originates from PICS `appinfo.common.name` (`depot.ts:318`) with **no sanitization
at all**, and `installdir`'s upstream `sanitizeInstalldir` (`installLocation.ts:90-103`)
only rejects `/`, `\`, and `..` — it does **not** reject `"` , newlines, or other VDF
control characters. A name/installdir containing `"` or a newline breaks the VDF structure
or injects sibling keys into the AppState block that controls install state (e.g. a crafted
value could emit a second `"StateFlags" "4"` line). The `.acf` is read back by
`readAcfState` (`library.ts:889`, `parseInt(state.StateFlags,10) & 4`) and by Steam itself,
so a corrupted/injected manifest either mislabels install state or is silently dropped as
corrupt (`library.ts:906-907`). This is inconsistent with the module's own header comment,
which claims values are safely handled.
**Fix:** Escape VDF-significant characters before interpolation (VDF quotes strings with
`\"` and `\\`; reject or strip control chars/newlines outright), e.g.
```ts
const vdfEscape = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\t]/g, ' ')
// ...
`\t"name"\t\t"${vdfEscape(params.name)}"`,
`\t"installdir"\t\t"${vdfEscape(params.installdir)}"`,
```
and extend `sanitizeInstalldir` to also reject `"` and control characters.

### WR-02: `size > 0` with zero chunks is silently written as an empty file and reported as success (no SHA verification)

**File:** `src/backend/storeManagers/steam/depot.ts:491-495`
**Issue:** The empty-file fast path fires on `!file.chunks.length || Number(file.size) === 0`.
The `!file.chunks.length` half means a file that *should* have content (`size > 0`) but
whose manifest returned no chunks — an inconsistent/corrupt/mis-parsed manifest — is
truncated to an empty file, and the function returns **without** the whole-file SHA1 check
that the normal path enforces (lines 507-515). The download is then reported as fully
`completed` with no failure recorded, masking data loss until Steam's later verify pass.
**Fix:** Only treat a genuinely empty file as complete; a `size > 0` file with no chunks is
an error, not a success:
```ts
if (Number(file.size) === 0) {
  const empty = await open(dest, 'w'); await empty.close(); return
}
if (!file.chunks.length) {
  throw new Error(`downloadDepotFiles: file ${file.filename} has size ${file.size} but no chunks`)
}
```

### WR-03: Progress `percent` is not clamped and can exceed 100

**File:** `src/backend/storeManagers/steam/depot.ts:576`
**Issue:** `percent: totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0`.
`totalBytes` is the D-03 manifest-declared sum, while `doneBytes` accumulates
*decompressed* bytes actually written; the two need not agree, and the module's own
comments elsewhere note manifest sums can diverge from real on-disk totals. When
`doneBytes > totalBytes` the emitted percent exceeds 100. The sibling
`pollInstallOnce` in `library.ts:1016` explicitly clamps with
`Math.min(100, Math.max(0, ...))`; this path does not, so the DownloadManager can render
>100%.
**Fix:** `percent: totalBytes > 0 ? Math.min(100, Math.round((doneBytes / totalBytes) * 100)) : 0`.

### WR-04: `sanitizeInstalldir` is separator-only — permits quotes, control chars, and Windows drive-relative names

**File:** `src/backend/storeManagers/steam/installLocation.ts:90-103`
**Issue:** The check rejects only `/`, `\`, and `..`. A PICS `installdir` such as `C:foo`
(Windows drive-relative, no separator), or one containing `"`/newline/control characters,
passes through and is used both as a filesystem path segment in
`resolve(targetSteamappsDir, 'common', installdir)` and interpolated into the VDF manifest
(see WR-01). On Windows, `path.resolve` treats `C:foo` as drive-relative, producing a
target outside the intended tree (the per-file containment check in `depot.ts` is the
backstop, but the install-root itself is derived from this value before any per-file
check). Defense-in-depth for an attacker-influenced string that becomes the install root
should be stricter.
**Fix:** Whitelist instead of blacklist, e.g. reject anything not matching
`/^[A-Za-z0-9 ._-]+$/` after also rejecting a leading/trailing dot and any drive-letter
prefix, or fall back to `app_<appId>` for any value containing `"`, control chars, `:`, or
a bare `..` segment.

## Info

### IN-01: `steamDecrypt` returns padded plaintext on invalid PKCS#7 padding instead of failing

**File:** `src/backend/storeManagers/steam/depot/crypto.ts:29-32`
**Issue:** When the trailing padding bytes are not a valid PKCS#7 run, the function returns
the full (still-padded) plaintext rather than throwing. For a wrong key or corrupted
ciphertext this passes malformed bytes downstream. It is caught later (decompress footer
magic / chunk SHA1 mismatch), so there is no exploit, but silently returning
possibly-garbage plaintext is a foot-gun.
**Fix:** Consider throwing on invalid padding, or add a comment documenting that
downstream SHA1/decompress is the intended integrity gate.

### IN-02: `decompressChunk` decompresses before verifying `cb_original` size

**File:** `src/backend/storeManagers/steam/depot/decompress.ts:38-70, 101-113`
**Issue:** LZMA `decompress` and `zlib.inflateRawSync` run to completion before the
decompressed length is compared to `cb_original` (`depot/decompress.ts:111`). A crafted
chunk (e.g. MITM of the CDN over the HTTPS boundary) could inflate to a very large buffer
before the size check rejects it. Mitigated by HTTPS transport and the subsequent SHA1
gate, so out-of-scope severity-wise (memory/DoS, not correctness), but worth noting.
**Fix:** Reject chunks whose declared `cb_original` exceeds a sane chunk ceiling (Steam
chunks are ~1MB) before decompressing, and/or bound `inflateRawSync` output length.

### IN-03: `downloadSteamDepots` can call `finalize()` twice on the error path

**File:** `src/backend/storeManagers/steam/depot.ts:802, 819`
**Issue:** The `try` block awaits `finalize()` (line 802). If that call itself throws,
control falls into the `catch`, which awaits `finalize()` again (line 819). The write is
atomic (temp+rename) so a double write is harmless, but the second measure+write is
redundant work on an already-failing path.
**Fix:** Track whether finalize already ran (or move the success-path finalize outside the
try) so the catch only finalizes when the try did not.

---

_Reviewed: 2026-07-15T19:22:57Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
