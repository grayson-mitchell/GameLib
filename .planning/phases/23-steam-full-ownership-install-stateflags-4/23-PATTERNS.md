# Phase 23: Steam full-ownership install (StateFlags=4) - Pattern Map

**Mapped:** 2026-07-17
**Files analyzed:** 9 (2 modify-in-place, 2 new source, 1 modify-secondary, 4 test files)
**Analogs found:** 9 / 9 (every file has a same-repo analog — this phase is almost entirely extension of existing, already-correct primitives; only D-04's reconciliation core logic is genuinely new, and it composes two existing functions)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/storeManagers/steam/depot.ts` (`finalizeToSteam`, modify) | service (orchestrator) | request-response (single decision point) | itself, current spike-gated block (`depot.ts:998-1027`) | exact — de-gating existing code, not new pattern |
| `src/backend/storeManagers/steam/depot/manifest.ts` (`AppManifestParams`/`buildAppManifestText`, modify comments + add buildid guard) | service (VDF serializer) | transform (pure text-build) | itself (`manifest.ts:72-76` `assertNumericId`) | exact — same guard shape, new call site |
| `src/backend/storeManagers/steam/depot.ts` (`downloadSingleFile`, extend flag block) | service (file I/O) | file-I/O | itself, current Executable/CustomExecutable block (`depot.ts:778-786`) | exact — same function, same flag-check pattern, new bits |
| `src/backend/storeManagers/steam/depot/fileAttributes.ts` (NEW — Windows attrib.exe + POSIX ReadOnly/Hidden) | utility (OS subprocess wrapper) | request-response (sync subprocess call) | `src/backend/storeManagers/steam/library.ts` `windowsRunningAppId()` (`library.ts:1475-1490`) | exact — same spawnSync-argv-form-no-shell pattern, same OS |
| `src/backend/storeManagers/steam/depot/reconcile.ts` (NEW — D-04 partial-state reconciliation) | service (new subsystem) | file-I/O + CRUD (reads disk, decides job list) | `sha1File()` (`depot.ts:610-620`) + the `jobs` array builder in `downloadDepotFiles` (`depot.ts:816-823`) | role-match — composes two existing primitives into new control flow; no direct 1:1 analog exists (confirmed net-new by RESEARCH.md) |
| `src/backend/storeManagers/steam/library.ts` (`SteamLibraryManager.init()` resume block, verify/extend) | service (startup resume orchestrator) | event-driven (startup hook) | itself (`library.ts:147-184`) | exact — verification target (Pitfall 5), not a rewrite |
| `src/backend/storeManagers/steam/__tests__/depot.test.ts` (extend: `finalizeToSteam`, `canWriteFullOwnership`, EDepotFileFlag) | test | CRUD (real-tmpdir fs assertions) | itself, `describe('finalizeToSteam', ...)` block (`depot.test.ts:688-756`) | exact |
| `src/backend/storeManagers/steam/__tests__/manifest.test.ts` (extend: unconditional buildid) | test | transform | itself (existing 199-line file, structure not yet read but same module under test) | exact |
| `src/backend/storeManagers/steam/__tests__/reconcile.test.ts` + `fileAttributes.test.ts` (NEW) | test | CRUD / mocked-subprocess | `depot.test.ts`'s `finalizeToSteam` describe block (real tmpdir) for reconcile; `library.test.ts`'s `spawnSync` mock (`library.test.ts:111-116`, `2268-2294`) for fileAttributes | exact — both precedents live in this same package |

**Directory convention note:** All existing Steam test files (`depot.test.ts`, `manifest.test.ts`, `decompressPool.test.ts`, `depotPrimitives.test.ts`) live flat in `src/backend/storeManagers/steam/__tests__/`, NOT nested under `depot/__tests__/`. There is no `depot/__tests__/` directory in the repo today. Put `reconcile.test.ts` and `fileAttributes.test.ts` in `src/backend/storeManagers/steam/__tests__/` to match the established flat convention — do not create a new nested `__tests__` directory under `depot/` even though RESEARCH.md's structure diagram suggests one.

## Pattern Assignments

### `src/backend/storeManagers/steam/depot.ts` — `finalizeToSteam` (service, request-response)

**Analog:** itself — the current env-gated block is the exact shape to de-gate.

**Current code to replace** (`depot.ts:998-1027`, read this session):
```typescript
// SPIKE 003 (throwaway, env-gated): full-ownership StateFlags=4 experiment.
const spike4 = process.env.GAMELIB_SPIKE_STATEFLAGS4 === '1'
if (spike4) {
  logWarning(
    `SPIKE 003: writing StateFlags=4 full-ownership manifest for appId ${appId} ` +
      `(sizeOnDisk=${sizeOnDisk}, buildid=${opts.buildid ?? '<none>'})`,
    LogPrefix.Steam
  )
}

await writeAppManifest(opts.targetSteamappsDir, {
  appId,
  installdir: opts.installdir,
  name: opts.name,
  sizeOnDisk: String(sizeOnDisk),
  lastOwner,
  stateFlags: spike4 ? '4' : undefined,
  bytes: spike4 ? String(sizeOnDisk) : undefined,
  buildid: spike4 ? opts.buildid : undefined,
  installedDepots: opts.depots.map((d) => ({
    depotId: d.depotId,
    manifest: d.gid,
    size: d.size
  }))
})
```

**Target shape** — replace `spike4` (an env var read) with `canWriteFullOwnership(...)` (a real predicate over `FinalizeToSteamOpts` fields, per RESEARCH.md Pattern 2). Preserve the exact `? '4' : undefined` / `? String(sizeOnDisk) : undefined` / `? opts.buildid : undefined` ternary shape — only the condition variable changes, so `manifest.ts`'s existing `stateFlags ?? '1026'` / `bytes ?? '0'` / `buildid ?? '0'` defaults (Pattern below) remain the single source of the safe fallback, unchanged. `FinalizeToSteamOpts` (`depot.ts:940-950`) needs new fields to carry the gate's inputs (`outcome`, `failures`, `allFilesVerified`, `allModesApplied` — see RESEARCH.md Pattern 2/Open Question 1) — thread these from `downloadDepotFiles`'s `DepotDownloadResult` the same way `buildid` is already threaded from `DepotPlan` today (`depot.ts:1077,1091,1085` per RESEARCH.md Pattern 1).

**Module-level docstring to update** (`depot.ts:917-928`) — currently states "this module NEVER writes StateFlags '4' (T-21-07)"; this comment is the literal thing D-01 supersedes. Update it in the same edit that removes the `spike4` gate, citing D-01/D-02 and the spike-003 validation, not just deleting the stale claim.

---

### `src/backend/storeManagers/steam/depot/manifest.ts` — `AppManifestParams`/`buildAppManifestText` (service, transform)

**Analog:** itself — `assertNumericId` (`manifest.ts:72-76`) is the exact guard-shape precedent for the new `buildid` numeric-shape check RESEARCH.md's Security Domain section recommends.

**No change to the default chain** — leave `manifest.ts:125,129,130` exactly as-is:
```typescript
// Source: src/backend/storeManagers/steam/depot/manifest.ts:124-130
const lastUpdated = Math.floor(Date.now() / 1000).toString()
const buildid = params.buildid ?? '0'
const lastOwner = params.lastOwner ?? '0'
const stateFlags = params.stateFlags ?? '1026'
const bytes = params.bytes ?? '0'
```
D-01/D-03 require the 1026 default stay the *unconditional* default here — only the caller (`finalizeToSteam`) decides to override it. Do not touch this block except to update the header comment (`manifest.ts:13-16`, "This module must NEVER write StateFlags '4'") since it's now caller-earned, not module-forbidden.

**New guard to add** (buildid numeric-shape check, per RESEARCH.md's Known Threat Patterns table — `buildid` is now unconditionally interpolated where previously it only reached this code behind the throwaway spike flag):
```typescript
// Pattern to follow — same shape as assertNumericId (manifest.ts:72-76):
function assertNumericId(id: string, label: string): void {
  if (!NUMERIC_ID.test(id)) {
    throw new Error(`writeAppManifest: rejected non-numeric ${label} "${id}"`)
  }
}
// buildid is interpolated at manifest.ts:144 (`"buildid"\t\t"${buildid}"`) — currently
// unguarded (free-text default "0"). Since it now flows unconditionally from PICS via
// D-02's threading, consider assertNumericId(buildid, 'buildid') before interpolation
// (skip the check when buildid === '0', the intentional untouched-fallback sentinel).
```

---

### `src/backend/storeManagers/steam/depot.ts` — `downloadSingleFile` EDepotFileFlag block (service, file-I/O)

**Analog:** itself — the existing Executable/CustomExecutable block IS the template; extend it, don't replace it.

**Existing code to extend verbatim** (`depot.ts:49-60` constants, `778-786` application):
```typescript
// Source: src/backend/storeManagers/steam/depot.ts:49-60
const DIRECTORY_FLAG = 64
const SYMLINK_FLAG = 512
const EXECUTABLE_FLAG = 32
const CUSTOM_EXECUTABLE_FLAG = 128
// ADD: const READONLY_FLAG = 8; const HIDDEN_FLAG = 16  (EDepotFileFlag, verified
// against node_modules/steam-user/enums/EDepotFileFlag.js per RESEARCH.md Pattern 4)

// Source: src/backend/storeManagers/steam/depot.ts:778-786
// SPIKE 003 finding: apply the manifest's executable flag(s). ...
if (file.flags && file.flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG)) {
  await chmod(dest, 0o755)
}
// ADD immediately after, same function, same file (`dest` already in scope):
// if (file.flags && file.flags & (READONLY_FLAG | HIDDEN_FLAG)) {
//   await applyDepotFileFlags(dest, file.flags, process.platform)
// }
```
Keep this as an in-function extension of `downloadSingleFile`, not a separate pass — the function already has `dest`, `file.flags`, and runs post-sha1-verify at exactly the right point (RESEARCH.md Pattern 4: "immediately after the existing Executable/CustomExecutable chmod block").

---

### `src/backend/storeManagers/steam/depot/fileAttributes.ts` (NEW) — Windows attrib.exe + POSIX ReadOnly (utility, request-response)

**Analog:** `src/backend/storeManagers/steam/library.ts` `windowsRunningAppId()` (`library.ts:1475-1490`) — this is the established, already-tested pattern for "OS state Node can't reach directly, shell out with argv-form spawnSync, no shell, hardcoded args."

**Imports pattern to follow** (`library.ts` uses `child_process.spawnSync` directly, no wrapper lib):
```typescript
import { spawnSync } from 'child_process'
```

**Core pattern to copy** (`library.ts:1470-1490`, read this session):
```typescript
/**
 * Reads Windows HKCU\Software\Valve\Steam\RunningAppID via reg.exe.
 * Uses argv-form spawnSync (no shell) — registry path is hardcoded (T-06-04).
 * Returns 0 on missing value, non-zero exit status, or thrown error.
 */
function windowsRunningAppId(): number {
  try {
    const result = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 }
    )
    if (result.status !== 0) return 0
    const match = result.stdout?.match(
      /RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i
    )
    return match ? parseInt(match[1], 16) : 0
  } catch {
    return 0
  }
}
```
**Apply this shape to the new `attrib.exe` helper:** argv-form array (`spawnSync('attrib', ['+R'|'-R', '+H'|'-H', filePath], { windowsHide: true })` per RESEARCH.md Pattern 4) — never string-interpolate the file path into a shell command (RESEARCH.md's Known Threat Patterns table flags this explicitly as the injection risk to avoid). Wrap in try/catch returning a safe no-op/false on failure, matching `windowsRunningAppId`'s `catch { return 0 }` fail-safe discipline. For POSIX `ReadOnly`, use `chmod` directly (strip write bits: `0o444`/`0o555` depending on whether Executable is also set — do not silently drop the executable bit, per RESEARCH.md Pattern 4). `Hidden` on POSIX is a documented no-op (dot-prefix naming convention, cannot retrofit onto an already-named/sha1-verified file) — return early/log, don't attempt a rename.

---

### `src/backend/storeManagers/steam/depot/reconcile.ts` (NEW) — D-04 partial-state reconciliation (service, file-I/O + CRUD)

**Analog:** No 1:1 analog (confirmed net-new by RESEARCH.md's Pattern 3: "What exists today: Nothing"). Compose two existing, already-correct primitives rather than inventing new I/O:

**Primitive 1 — whole-file sha1** (`depot.ts:610-620`, reuse verbatim, do not reimplement):
```typescript
// Source: src/backend/storeManagers/steam/depot.ts:610-620
function sha1File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk))
    stream.on('end', () => resolvePromise(hash.digest('hex')))
  })
}
```
This function is currently module-private in `depot.ts` — either export it from `depot.ts` for reuse in `reconcile.ts`, or move it to a shared location both modules import from (planner's call; do not duplicate the implementation).

**Primitive 2 — the job-list builder to filter** (`depot.ts:816-823`, the exact loop reconciliation turns into a filtered version of):
```typescript
// Source: src/backend/storeManagers/steam/depot.ts:816-823
const jobs: Array<{ depotId: string; key: Buffer; file: DepotPlanFile; fileSeed: number }> = []
let seed = 0
for (const depot of plan.depots) {
  for (const file of depot.files) {
    jobs.push({ depotId: depot.depotId, key: depot.key, file, fileSeed: seed++ })
  }
}
```
`reconcile.ts`'s `reconcilePartialState(plan, installRoot)` should walk this same `plan.depots[].files[]` shape, and for each file: resolve its destination via the SAME containment check `downloadSingleFile` already uses (`resolveContainedPath`, `depot.ts:599-608` — reuse/export, do not reimplement path-traversal defense), check existence+size, and if present call `sha1File()` against `file.sha_content` (same comparison `downloadSingleFile` does at `depot.ts:768-776`). Return a reduced `jobs` array (skip verified-matching files) plus a per-file "verified this run" record for the completeness gate (Pattern 2 in RESEARCH.md / `canWriteFullOwnership`).

**Critical invariant (Pitfall 1 in RESEARCH.md):** never treat existence+size as sufficient — every reconciled file MUST go through `sha1File()` before being excluded from the download job list. This is the single most important correctness rule for this new file; call it out in the module docstring the same way `depot.ts`'s own header comments document load-bearing invariants (see the `downloadSingleFile` docstring style at `depot.ts:688-695` as the documentation-density precedent to match).

**Containment reuse** (`depot.ts:592-608`, read this session — the path-traversal guard reconcile.ts must reuse, not reimplement):
```typescript
export class PathTraversalError extends Error {}

function resolveContainedPath(root: string, filename: string): string {
  const dest = resolve(root, filename.replace(/\\/g, '/'))
  const rel = relative(root, dest)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathTraversalError(
      `downloadDepotFiles: rejected path-traversal filename "${filename}" (escapes ${root})`
    )
  }
  return dest
}
```

---

### `src/backend/storeManagers/steam/library.ts` — `SteamLibraryManager.init()` resume block (service, event-driven — VERIFY not rewrite)

**Analog:** itself. Per RESEARCH.md Pitfall 5, this is very likely already correct for the folded-todo (bottle auto-open) concern — treat as a verification task, not a fix task.

**Current code** (`library.ts:147-185`, read this session, confirms RESEARCH.md's analysis):
```typescript
// Resume polling for any in-progress downloads detected on disk (D-07).
try {
  const downloadingIds = await scanDownloadingAppIds()
  for (const appId of downloadingIds) {
    try {
      const target = await locateDownloadingTarget(appId)
      if (target) {
        await finalizeToSteam(appId, {
          targetSteamappsDir: target.targetSteamappsDir,
          installdir: target.installdir,
          name: target.name,
          depots: []
        })
      }
    } catch (finalizeErr) { /* log, continue */ }
    startInstallPolling(appId)
  }
} catch (err) { /* log, skip resume */ }
```
Confirmed: `scanDownloadingAppIds()` never touches the bottle steamapps root (native-only), and this block calls only `finalizeToSteam` (currently always writes 1026, `depots: []`) + `startInstallPolling(appId)` — never `tellBottledSteamToInstall`. **D-04 changes what happens inside this block**, not whether it runs: today it finalizes an EMPTY depots array (no reconciliation, no real DepotPlan) — this is the actual gap D-04 fills. The call site to modify is the `finalizeToSteam(appId, {..., depots: []})` call — it needs to first rebuild a `DepotPlan` (re-run `buildDepotPlan`), run it through the new `reconcilePartialState`, and pass real `depots`/`buildid`/gate-inputs instead of an empty array — while preserving the exact same "never call `tellBottledSteamToInstall`/re-invoke `downloadSteamDepots`'s network loop unprompted" safety property RESEARCH.md's Pitfall 5 confirms is already correct. Add a regression test asserting `getBottleSteamappsRoot()` is never scanned at startup (RESEARCH.md's explicit recommendation) rather than allocating a "fix" task.

---

## Shared Patterns

### Whole-file SHA1 verification (single source of truth)
**Source:** `src/backend/storeManagers/steam/depot.ts:610-620` (`sha1File`)
**Apply to:** `downloadSingleFile` (existing, post-download verify) AND `reconcile.ts` (new, pre-download verify-what's-on-disk). Never reimplement — export/share the one function.

### Path containment (never `path.join` alone)
**Source:** `src/backend/storeManagers/steam/depot.ts:592-608` (`resolveContainedPath`, `PathTraversalError`)
**Apply to:** Any new code touching filesystem paths derived from manifest `filename`/`linktarget` fields — `reconcile.ts` walks the same untrusted-filename space `downloadSingleFile` does and must reuse this exact guard (Phase 18 lesson per user memory: `path.join` alone is not containment; use `resolve` + `relative`).

### 64-bit IDs are strings end-to-end
**Source:** `src/backend/storeManagers/steam/depot/manifest.ts:1-11` (module header), `depot.ts` `FinalizeDepotEntry`/`DepotPlanEntry` types
**Apply to:** Every field this phase touches — `buildid`, manifest GIDs, `LastOwner`/SteamID64. NEVER `@node-steam/vdf.parse()` a GID (rounds past `MAX_SAFE_INTEGER`, forces a spurious re-download). Keep `String(...)` coercion at the PICS-read boundary (already done at `depot.ts:507-511` for buildid) and never re-derive via a JS `Number`.

### Numeric-ID guard before VDF interpolation
**Source:** `src/backend/storeManagers/steam/depot/manifest.ts:72-76` (`assertNumericId`)
**Apply to:** Any new field written unconditionally into the manifest (buildid, per Known Threat Patterns table in RESEARCH.md) that wasn't previously guarded because it only reached this code behind the throwaway spike flag.

### OS-subprocess shelling for filesystem attributes Node can't reach
**Source:** `src/backend/storeManagers/steam/library.ts:1475-1490` (`windowsRunningAppId`, `spawnSync('reg', [...])`)
**Apply to:** `fileAttributes.ts`'s new `spawnSync('attrib', [...])` call — argv-form only, hardcoded flags, file path as a single argv element, `windowsHide: true`, try/catch-to-safe-default. This is the established, already-tested (see `library.test.ts:2268-2294`) project pattern for exactly this class of problem.

### Atomic manifest write (unchanged, do not touch)
**Source:** `src/backend/storeManagers/steam/depot/manifest.ts:173-194` (`writeAppManifest`)
**Apply to:** Nothing in this phase changes this — `.acf.tmp` write + fsync + rename stays the last filesystem action in `finalizeToSteam`, regardless of whether the gate resolves to `4` or `1026`. Confirmed unchanged scope per RESEARCH.md's Architecture Diagram ("VDF text, atomic temp+rename — UNCHANGED").

### Test style: real tmpdir, no fs mocking, for fs-heavy modules
**Source:** `src/backend/storeManagers/steam/__tests__/depot.test.ts:688-756` (`describe('finalizeToSteam', ...)`)
```typescript
describe('finalizeToSteam', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-finalize-test-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })
  it('...', async () => {
    mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
    writeFileSync(join(dir, 'common', 'SomeGame', 'a.bin'), Buffer.alloc(10))
    // ... call the function under test against `dir`, assert on real files
  })
})
```
**Apply to:** `reconcile.test.ts` — write real partial files into a real tmpdir (some sha1-matching, some mismatched, some missing), assert the returned job list and verification bookkeeping. Matches the project's established "real fs over tmpdir, not `fs` mocks" discipline for this specific module family.

### Test style: mocked `spawnSync` for OS-subprocess code
**Source:** `src/backend/storeManagers/steam/__tests__/library.test.ts:111-116` (module-level mock) + `:2268-2294` (`windowsRunningAppId` test cases)
```typescript
jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
  execFileSync: jest.fn()
}))
// ...
it('windowsRunningAppId: parses REG_DWORD 0x1b58 → 7000', () => {
  ;(spawnSync as jest.Mock).mockReturnValue({
    status: 0,
    stdout: 'RunningAppID    REG_DWORD    0x1b58'
  })
  expect(readRunningAppId()).toBe(7000)
})
it('windowsRunningAppId: returns 0 when spawnSync throws', () => {
  ;(spawnSync as jest.Mock).mockImplementation(() => {
    throw new Error('reg.exe not available')
  })
  expect(readRunningAppId()).toBe(0)
})
```
**Apply to:** `fileAttributes.test.ts` — same mock shape, same "success / non-zero exit / throws / unexpected-output" four-case coverage pattern for the new `attrib.exe` call.

## No Analog Found

None. Every file in scope has a same-repo analog to copy from — this phase's own RESEARCH.md correctly frames it as "wiring already-correct primitives into one new decision," not greenfield work, with D-04's `reconcile.ts` as the sole genuinely-new subsystem (and even that composes two existing, directly-reusable functions rather than inventing new I/O patterns).

The one artifact with no code analog is `23-UAT.md` (D-07's real-hardware validation record) — not a source file, so out of scope for this pattern map; RESEARCH.md already points the planner at `21-UAT.md` as its format precedent.

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/` (depot.ts, depot/manifest.ts, depot/decompress.ts, library.ts, games.ts, select.ts) and their `__tests__/` siblings; `node_modules/steam-user/enums/EDepotFileFlag.js` for the authoritative flag-bit source.
**Files scanned:** 9 source files read/grepped directly this session (depot.ts full structural read across 3 non-overlapping ranges + manifest.ts full read + decompress.ts partial + library.ts 3 ranges + games.ts 1 range + depot.test.ts 2 ranges + library.test.ts 2 ranges), plus graphify `explain`/`query` orientation before any raw read (per session policy).
**Pattern extraction date:** 2026-07-17
