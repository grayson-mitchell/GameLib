# Phase 23: Steam full-ownership install (StateFlags=4) - Research

**Researched:** 2026-07-17
**Domain:** Steam depot-install manifest authoring, filesystem fidelity, download resume/reconciliation
**Confidence:** HIGH (this phase productionizes an already-VALIDATED spike against real hardware; the code paths are read directly from the current repo, not inferred)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### StateFlags policy
- **D-01:** **Write `StateFlags=4` when GameLib can prove a clean, complete install; fall back to Phase 21's `1026` verify-handoff when completeness can't be proven.** "Provable" = fresh full download (or a fully-reconciled resume) with every chunk sha1-verified and all file modes applied. 1026 is the last-resort safety net (e.g. missing manifest, unknown flag, unrecoverable partial), not the default.
- **D-02:** A trustworthy `StateFlags=4` requires ALL of the spike-proven load-bearing fields (do not ship a partial set): `StateFlags "4"`; `BytesToDownload == BytesDownloaded == SizeOnDisk` (non-zero); current **public-branch `buildid`** threaded from PICS `appinfo.depots.branches.public.buildid` (today `finalizeToSteam`/`writeAppManifest` hard-code "0" — must be threaded through `buildDepotPlan`); correct `InstalledDepots` GID set (already guaranteed by Phase 21 selection); executable file-mode bits (see D-05/D-06).
- **D-03:** **No new user-facing toggle.** StateFlags=4 becomes the behavior of the existing Phase 21 native-install path, which is already gated behind the D-13 opt-in setting. The 1026 writer is NOT removed — it remains reachable as the D-01 fallback.

### Ownership scope boundary (D-2 reversal)
- **D-04:** **GameLib owns resume/interrupted-download recovery**, not just the happy-path first install. A resumed download re-verifies every chunk (sha1) and re-applies file modes, and if it can prove the install is complete it writes a trustworthy `StateFlags=4` — the same guarantee as a fresh install. This is a genuine scope expansion beyond spike-003's minimum (partial-state tracking + re-selection/reconciliation logic) — flag for research/planning as the largest new lift.
- **D-05:** **Updates remain Steam's job.** No delta-patching, no integrity-repair ownership. Full ownership covers install + resume completion only.

### File-mode fidelity
- **D-06:** **Replicate the full `EDepotFileFlag` mode set, on all OSes.** POSIX (macOS/Linux): apply `Executable(32)` + `CustomExecutable(128)` (PROVEN load-bearing — without the exec bit, `os error 256` on launch) plus `ReadOnly(8)` + `Hidden(16)` defensively via chmod. Windows: replicate read-only/hidden via Windows file attributes. Rationale: match everything Steam's verify pass does, since StateFlags=4 skips that pass and nothing downstream applies these. The depot writer (`downloadDepotFiles`/`downloadSingleFile`) currently handles only Directory(64) + Symlink(512) — file modes are the known gap.

### Pre-ship validation gate
- **D-07:** Phase 23 ships only after real-hardware verification of: **(1)** a multi-depot larger title (e.g. Cyberpunk, once Phase 21's D-UAT-08 is verified) installing under StateFlags=4 across depots with no verify/re-download; **(2)** a confirmed **hard-DRM title** launching under StateFlags=4 (closes spike 001's still-open DRM caveat); **(3)** an **interrupt-then-resume** run (kill Steam/GameLib mid-download, resume, confirm Steam-trusted `4` + launch, no re-download). Prove on **macOS first** (where spikes ran); expand Windows/Linux OS coverage in a follow-up rather than gating this phase on all three platforms.

### Claude's Discretion
- Exact mechanism for detecting the current public buildid vs. a mid-download buildid change (if Steam publishes an update between download start and manifest write) — planner/researcher to decide; correct behavior is likely "write the buildid we actually downloaded," which Steam then reads as UpdateRequired (correct, not a bug).
- Where the "provable completeness" gate lives (in `finalizeToSteam`, a dedicated verifier, or the resume reconciler) — planner's call.

### Folded Todos
- **`steam-startup-download-resume-autoopens-crossover.md`** (area: general, score 0.6) — *Startup download-resume silently auto-opens Steam-in-CrossOver for bottle games.* Folded into **D-04**: resume ownership means GameLib, not Steam, drives interrupted-download recovery, so the resume path's side effects (including any Steam/CrossOver auto-open) must be owned and made explicit here rather than delegated. **Research finding: this appears ALREADY FIXED by Phase 21's 21-16 gap closure — see Pitfall 5 below; verify, don't re-fix.**

### Deferred Ideas (OUT OF SCOPE)
- **Always-4 (remove 1026 entirely)** — rejected for now in favor of the 1026 fallback (D-01); revisit if the fallback proves never to fire in practice.
- **Windows/Linux validation gate** — deliberately deferred to a follow-up (D-07 ships macOS-first); not dropped.
- **Confirming non-file-mode verify-pass side effects are not load-bearing** (e.g. Steam-created config files) — spike flagged as possible; verify during Phase 23 validation, expand D-06 if found.
</user_constraints>

## Summary

Phase 23 turns spike-003's env-gated `GAMELIB_SPIKE_STATEFLAGS4` proof into the default behavior of
Phase 21's native-install path. The spike already answered the make-or-break question — Steam trusts a
GameLib-authored `StateFlags=4` manifest with no verify pass, provided five specific fields are correct —
and the env-gated code for four of those five fields already exists in the repo today, dormant behind the
flag. The real work of this phase is: (1) deleting the flag and making `stateFlags`/`bytes`/`buildid`
unconditional in `finalizeToSteam`, gated instead by a genuine "can I prove this is complete?" check that
falls back to 1026 when it can't; (2) extending the file-mode fix (currently only `Executable`/
`CustomExecutable`) to the full `EDepotFileFlag` set, cross-platform; and (3) building resume/reconciliation
from scratch — **today there is no resume of the actual byte-download at all.** A second `installDepotDownload()`
call re-runs `buildDepotPlan`/`downloadDepotFiles` from zero every time; nothing checks what's already on disk.
This is confirmed by direct inspection of `downloadSingleFile` (`depot.ts:696-787`), which always
`open(dest, 'w')` + `fd.truncate()`s every file regardless of prior state. D-04's "largest new lift" framing
in CONTEXT.md is accurate — it is new architecture, not a productionization of existing code, unlike D-01/D-02/D-06.

One piece of good news: the folded todo (bottle games silently auto-opening Steam-in-CrossOver on a
startup resume) already appears to be **fixed** by Phase 21's own 21-16 gap closure (`D-05` in
`library.ts:147-194`) — the startup scan is native-only (`scanDownloadingAppIds()` never touches the
bottle steamapps root) and the resume path only ever calls `finalizeToSteam` + `startInstallPolling`
(a passive ACF watcher), never `tellBottledSteamToInstall`. The planner should verify this during
Phase 23 rather than treat it as unsolved — but it is very likely already closed.

**Primary recommendation:** Thread `buildid` unconditionally through the existing `DepotPlan.buildid` →
`FinalizeToSteamOpts.buildid` → `AppManifestParams.buildid` chain (already wired, just spike-gated);
introduce a single `canWriteFullOwnership(...)` completeness predicate that both the fresh-install and
resume paths consult before calling `writeAppManifest` with `stateFlags: '4'`; extend `downloadSingleFile`'s
existing `EDepotFileFlag` chmod block to cover `ReadOnly(8)`/`Hidden(16)` (POSIX via chmod, Windows via a new
`attrib`-shelling helper matching the `windowsRunningAppId()` precedent — no new npm dependency); and build
a new partial-state reconciliation pass (compare on-disk files against the fresh `DepotPlan`, re-verify
existing bytes via `sha1File`, download only what's missing/mismatched) that both the interrupted-download-
continue path and the startup-resume path call before finalize.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Manifest field authoring (StateFlags/buildid/bytes) | API/Backend (`depot/manifest.ts`) | — | Pure VDF-text generation; no UI, no OS state |
| buildid threading (PICS → plan → finalize → manifest) | API/Backend (`depot.ts`) | — | Data flows entirely through the existing depot orchestrator; no new tier |
| Completeness/4-vs-1026 gate | API/Backend (`depot.ts`, new module or inline in `finalizeToSteam`) | — | Decision needs sha1-verification results + file-mode-application results, both backend-only |
| File-mode fidelity (chmod/attrib) | API/Backend (`depot.ts` downloadSingleFile) | OS-level (Node `fs.chmod` / Windows `attrib.exe` subprocess) | Filesystem metadata write, same tier as the existing chunk-write loop; Windows attribute bits require an OS subprocess call (no pure-Node API), matching the existing `reg.exe`/`ps` precedent in `library.ts` |
| Resume/reconciliation (partial-state detection + re-verify) | API/Backend (`depot.ts`, new pre-download reconciliation pass) | Database/Storage (reads existing on-disk files + `.acf`) | Needs both the on-disk file tree (storage) and DepotPlan/PICS data (backend) to reconcile; no browser/frontend involvement |
| Resume side-effect ownership (no silent Steam-in-CrossOver auto-open) | API/Backend (`library.ts` SteamLibraryManager.init()) | — | Already the tier that owns startup resume; D-04's scope-expansion is "don't regress this," not "move it" |
| Progress/status surfacing during resume | Frontend Server / IPC (`sendFrontendMessage`) | Browser/Client (React DownloadManager UI) | Unchanged from Phase 21 — existing `progressUpdate`/`gameStatusUpdate` IPC channel |

## Package Legitimacy Audit

**No new packages required for this phase.** `steam-user` (^5.3.0), `lzma` (2.3.2), and `@node-steam/vdf`
(^2.2.0, read-only, never used to serialize `.acf` — see manifest.ts header comment) are already installed
and were legitimacy-audited during Phase 21 research. Windows `ReadOnly`/`Hidden` file-attribute application
(D-06) uses a subprocess call to the OS-native `attrib.exe`, matching the existing `windowsRunningAppId()`
pattern in `library.ts:1475-1490` (`spawnSync('reg', ...)`) — no npm package needed, no new attack surface
beyond what `child_process.spawnSync` already represents in that file.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none — zero new packages)* | — | — | — | — | — | N/A |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │  SteamGame.install() / installDepotDownload()  │
                         └───────────────────┬───────────────────────┘
                                              │
                     ┌────────────────────────▼────────────────────────┐
                     │  buildDepotPlan(appId, opts)                     │
                     │  - fetchAppInfo (PICS)                           │
                     │  - buildid = appinfo.depots.branches.public      │
                     │              .buildid  [ALREADY WIRED, spike-    │
                     │              gated in finalizeToSteam only]      │
                     │  - selectAllDepots (owned depots, per-OS filter) │
                     │  - fetchDepotPlanEntry per depot (manifest+files)│
                     └────────────────────────┬────────────────────────┘
                                              │  DepotPlan { depots, totalBytes, buildid }
                     ┌────────────────────────▼────────────────────────┐
                     │  NEW (D-04): reconcilePartialState(plan, disk)  │
                     │  - walk installRoot for existing files           │
                     │  - for each already-present file: sha1File()     │
                     │    against manifest sha_content                  │
                     │  - build "jobs" list = ONLY missing/mismatched   │
                     │    files (skip already-verified-complete files)  │
                     │  - preserves existing chmod'd files untouched    │
                     └────────────────────────┬────────────────────────┘
                                              │  reduced job list
                     ┌────────────────────────▼────────────────────────┐
                     │  downloadDepotFiles(plan, opts)                  │
                     │  - downloadFileChunks (CHUNK_CONCURRENCY=4)      │
                     │  - fetchChunk: sha1(decompressed)===chunk.sha    │
                     │    gate (decompress.ts, ALREADY per-chunk safe)  │
                     │  - downloadSingleFile: whole-file sha1 verify    │
                     │  - EXTEND (D-06): apply full EDepotFileFlag set  │
                     │    (Executable/CustomExecutable ALREADY done;    │
                     │    ADD ReadOnly/Hidden — POSIX chmod +           │
                     │    Windows attrib.exe subprocess)                │
                     └────────────────────────┬────────────────────────┘
                                              │  DepotDownloadResult { outcome, failures }
                     ┌────────────────────────▼────────────────────────┐
                     │  NEW (D-01): canWriteFullOwnership(plan, result) │
                     │  - outcome === 'completed'                       │
                     │  - failures.length === 0                         │
                     │  - every attempted depot's files sha1-verified   │
                     │    (fresh) OR reconciled-verified (resume)       │
                     │  - buildid is non-empty                          │
                     │  → true: StateFlags=4 params                     │
                     │  → false: StateFlags=1026 params (existing path) │
                     └────────────────────────┬────────────────────────┘
                                              │
                     ┌────────────────────────▼────────────────────────┐
                     │  finalizeToSteam(appId, opts)                    │
                     │  - measureInstalledBytes (real disk sum)         │
                     │  - writeAppManifest via buildAppManifestText     │
                     │    (VDF text, atomic temp+rename — UNCHANGED)    │
                     └───────────────────────────────────────────────┘
                                              │
                                    appmanifest_{appId}.acf
                                              │
                     ┌────────────────────────▼────────────────────────┐
                     │  Real Steam client (native or bottled)           │
                     │  - StateFlags=4: adopts immediately, no verify   │
                     │  - StateFlags=1026: runs its own verify/repair   │
                     │    pass (existing fallback, UNCHANGED)           │
                     └───────────────────────────────────────────────┘
```

### Recommended Project Structure

No new files are strictly required — this phase extends existing modules. If the planner prefers
isolating the two new pieces of logic (reconciliation, completeness gate) for testability, following
the project's established front-half/back-half split precedent (21-04/21-05/21-06):

```
src/backend/storeManagers/steam/
├── depot.ts                      # existing orchestrator — add canWriteFullOwnership() call site,
│                                  #   extend downloadSingleFile's flag-application block
├── depot/
│   ├── manifest.ts                # existing — REMOVE spike-only comments, make stateFlags/bytes/
│   │                               #   buildid the unconditional production path (no env flag)
│   ├── reconcile.ts               # NEW (D-04) — reconcilePartialState(plan, installRoot): walks disk,
│   │                               #   sha1-verifies existing files, returns reduced job list +
│   │                               #   per-file "already verified" bookkeeping for the completeness gate
│   ├── fileAttributes.ts          # NEW (D-06) — applyDepotFileFlags(path, flags, platform):
│   │                               #   POSIX chmod (Executable/CustomExecutable/ReadOnly) +
│   │                               #   Windows attrib.exe subprocess (ReadOnly/Hidden)
│   └── decompress.ts              # existing — unchanged, already the per-chunk sha1 gate
```

### Pattern 1: Threading buildid from PICS to the manifest writer (D-02)

**What:** `buildDepotPlan` already computes `buildid` from PICS appinfo (`depot.ts:504-511`) and returns
it on `DepotPlan.buildid`. `downloadSteamDepots` already captures it (`depot.ts:1077,1091`) and passes it
to `finalize()` (`depot.ts:1085`). `finalizeToSteam` already accepts `opts.buildid` (`FinalizeToSteamOpts`,
`depot.ts:949`) and threads it to `writeAppManifest` — but ONLY inside the `spike4` conditional
(`depot.ts:1021`: `buildid: spike4 ? opts.buildid : undefined`). Making this production behavior is a
one-line change: pass `opts.buildid` unconditionally (or default to `'0'` only when genuinely absent, e.g.
zero-depot installs).

**When to use:** Every finalize call, both fresh-install and resume, whenever the plan/reconciliation
successfully read PICS appinfo. If PICS could not be reached (rare — buildDepotPlan already requires a
connected client), buildid falls back to `'0'`, which correctly forces the 1026 fallback path per D-01
(a `"0"` buildid is explicitly called out in the spike as reading like `UpdateRequired`).

**Mid-download buildid change (CONTEXT.md's flagged discretion item):** `buildDepotPlan` reads `buildid`
ONCE, at plan-build time, before any chunk downloads. If Valve publishes a new build between plan-build and
finalize, the manifest still gets fetched/downloaded against the OLD manifest GIDs (Steam's CM serves a
consistent snapshot per `getRawManifest` call with a pinned `gid`), so writing "the buildid we actually
downloaded" (the one captured in `DepotPlan.buildid`) is correct — the files on disk genuinely correspond
to that buildid. Steam reading a stale-but-honest buildid on next launch as `UpdateRequired` is the correct,
intended outcome (Steam's own updater takes over, matching D-05's "updates remain Steam's job"). No new
code is needed beyond the existing plan-time capture — just verify the finalize call site never re-derives
buildid from a second, later PICS read that could race with the depot download.

**Example (existing code, currently spike-gated — becomes unconditional):**
```typescript
// Source: src/backend/storeManagers/steam/depot.ts:1013-1027 (current, spike-gated)
await writeAppManifest(opts.targetSteamappsDir, {
  appId,
  installdir: opts.installdir,
  name: opts.name,
  sizeOnDisk: String(sizeOnDisk),
  lastOwner,
  stateFlags: spike4 ? '4' : undefined,          // → becomes: canWriteFullOwnership ? '4' : undefined
  bytes: spike4 ? String(sizeOnDisk) : undefined, // → becomes: canWriteFullOwnership ? String(sizeOnDisk) : undefined
  buildid: spike4 ? opts.buildid : undefined,     // → becomes: canWriteFullOwnership ? opts.buildid : undefined
  installedDepots: opts.depots.map((d) => ({ depotId: d.depotId, manifest: d.gid, size: d.size }))
})
```

### Pattern 2: The 4-vs-1026 completeness gate (D-01, Claude's Discretion item)

**What:** A single predicate function, consulted at the ONE call site inside `finalizeToSteam` (recommended
location — keeps Pattern 5's "single recovery function" invariant intact, per the existing `depot.ts:917-928`
module comment; do not fork finalize into two functions). Inputs available at that point: the
`DepotDownloadResult` (`outcome`/`failures`), the reconciliation pass's per-file verification record (which
files were freshly sha1-verified THIS run vs. inherited from disk), and `opts.buildid`.

**Recommended gate logic** (derived directly from spike-003's proven load-bearing field list):
```typescript
function canWriteFullOwnership(opts: {
  outcome: 'completed' | 'cancelled'
  failures: DepotDownloadFailure[]
  buildid?: string
  allFilesVerified: boolean   // every file in the plan is EITHER freshly-downloaded-and-sha1-verified
                               // OR reconciled-and-sha1-re-verified this run (D-04) — never "assumed fine"
  allModesApplied: boolean    // EDepotFileFlag application succeeded for every flagged file
}): boolean {
  return (
    opts.outcome === 'completed' &&
    opts.failures.length === 0 &&
    !!opts.buildid && opts.buildid !== '0' &&
    opts.allFilesVerified &&
    opts.allModesApplied
  )
}
```
Any `false` falls back to the existing, unmodified 1026 path — which is ALREADY the correct, tested,
production behavior (Phase 21 shipped it). This means the safest implementation strategy is: 1026 stays
the literal default value in `writeAppManifest`/`buildAppManifestText` (as it is today), and StateFlags=4
is an opt-in override the gate explicitly earns — inverting nothing about the existing safe path.

**When to use:** Called once, inside `finalizeToSteam`, immediately before the `writeAppManifest` call.

### Pattern 3: Resume/reconciliation (D-04 — the largest new lift, genuinely new code)

> **DIVERGENCE RESOLVED (2026-07-17, in favor of 23-PATTERNS.md / CONTEXT D-04):** The
> "does NOT need to run for the startup ACF-watcher path" guidance below is the STALE view. CONTEXT
> D-04 expands scope so GameLib *owns* resume/interrupted-download recovery and must be able to write a
> trustworthy `StateFlags=4` on a proven-complete resume — which the empty `depots:[]` startup path
> cannot do. Plan 23-03 Task 3 therefore has `library.ts init()` rebuild a real `DepotPlan`, run
> `reconcilePartialState`, and feed real gate inputs to `finalizeToSteam` (fail-closed to 1026 when
> reconciliation finds missing/failed files). The invariant Pattern 3 was protecting — never re-invoke
> the network download loop / `tellBottledSteamToInstall` unprompted, never scan the bottle root — is
> PRESERVED and regression-tested. See 23-PATTERNS.md "library.ts init() resume block" section.

**What exists today:** Nothing. `installDepotDownload()` (`games.ts:726-792`) always calls
`downloadSteamDepots` fresh; `buildDepotPlan` always builds the FULL plan (every owned depot, every file);
`downloadDepotFiles` always processes every file in that plan; `downloadSingleFile` always
`open(dest, 'w')` + `fd.truncate(Number(file.size))`, unconditionally overwriting whatever was there
(`depot.ts:758-761`). An interrupted download today just re-downloads 100% of the game on retry — wasteful
but not unsafe, and it still converges on the same 1026-fallback finalize. There is no code path today
that inspects "what's already correct on disk" at all.

**What "resume ownership" requires for a trustworthy 4 (D-04):** Before `downloadDepotFiles` runs, walk
`installRoot` for each planned file; if a file at the expected path already exists with the expected size,
run `sha1File()` against it (the SAME function `downloadSingleFile` already uses post-download) and compare
to `file.sha_content`. A match means: skip re-downloading this file's chunks, but the completeness gate
(Pattern 2) must still record it as "verified this run" — reconciliation IS verification, just against
disk instead of network. A mismatch (or missing file) means: treat exactly as today's fresh-download job.
This turns the existing `jobs` array construction in `downloadDepotFiles` (`depot.ts:817-823`) into a
filtered list, with the filtering step being the new code.

**File-mode fidelity on reconciled (already-present) files:** A file inherited from a PRIOR GameLib partial
download already had its executable bit set by that prior run (if the prior run included the D-06 fix).
A file inherited from a partial download made by an OLDER GameLib build (pre-Phase-23, no chmod applied)
would NOT have the correct mode. Recommendation: re-apply `applyDepotFileFlags` unconditionally to every
reconciled file, not just freshly-downloaded ones — chmod/attrib calls are idempotent and cheap, and this
closes the "upgraded mid-download" edge case for free.

**When to use:** Every call to `downloadDepotFiles`/`installDepotDownload`, both the explicit user-initiated
"Resume"/retry action and any future interrupted-download continuation. Does NOT need to run for the
startup ACF-watcher path (`library.ts` init()) — that path already correctly avoids re-invoking the depot
orchestrator at all (see Pitfall/Finding below) and should keep doing so; reconciliation only matters when
`downloadSteamDepots` is about to actually run again.

### Pattern 4: EDepotFileFlag full fidelity (D-06)

**What:** `depot.ts:59-60` already defines `EXECUTABLE_FLAG = 32` and `CUSTOM_EXECUTABLE_FLAG = 128`,
applied via `chmod(dest, 0o755)` at `depot.ts:784-786`. Verified against the authoritative source
(`node_modules/steam-user/enums/EDepotFileFlag.js`, confirmed by direct read this session):

```javascript
// Source: node_modules/steam-user/enums/EDepotFileFlag.js (VERIFIED — actual installed package)
{
  UserConfig: 1, VersionedUserConfig: 2, Encrypted: 4, ReadOnly: 8, Hidden: 16,
  Executable: 32, Directory: 64, CustomExecutable: 128, InstallScript: 256, Symlink: 512
}
```
`Directory` (64) and `Symlink` (512) are already handled (`downloadSingleFile`, `depot.ts:714-743`).
`Executable`/`CustomExecutable` (32/128) are already handled. **Missing: `ReadOnly` (8) and `Hidden` (16).**

**POSIX (macOS/Linux):** `ReadOnly` maps naturally to chmod bits (strip the write bits: `0o444`/`0o555`
depending on whether Executable is also set — do not silently drop the executable bit when combining flags).
`Hidden` has no POSIX filesystem-attribute equivalent (Unix "hidden" is purely a dot-prefix naming
convention, which cannot be retrofitted onto an already-named file) — **`Hidden` is a no-op on POSIX,
document this explicitly rather than attempting a rename**, since Steam's own filenames aren't dot-prefixed
and renaming would break the sha1-verified path.

**Windows:** Neither `ReadOnly` nor `Hidden` are POSIX chmod concepts. Node's `fs.chmod` on Windows only
toggles the `FILE_ATTRIBUTE_READONLY` bit (via the write-permission bits) and has NO API for
`FILE_ATTRIBUTE_HIDDEN` — this is a documented Node.js/libuv limitation `[ASSUMED — training-knowledge
claim about Node's fs.chmod Windows behavior; not independently re-verified via Node docs this session;
low risk since it only affects fidelity, not the trust decision]`. The established project pattern for
Windows-specific OS state Node can't reach directly is shelling out (see `windowsRunningAppId()`,
`library.ts:1475-1490`, using `spawnSync('reg', [...])`). Recommend the same pattern:
`spawnSync('attrib', ['+R'|'-R', '+H'|'-H', filePath], { windowsHide: true })`. This needs a
`checkpoint:human-verify` or at minimum an explicit spike/manual test on real Windows hardware before
shipping, since it's new subprocess-based OS interaction, not proven by spike-003 (which ran on macOS only).

**When to use:** In `downloadSingleFile`, immediately after the existing Executable/CustomExecutable
chmod block, gated on `file.flags & (READONLY_FLAG | HIDDEN_FLAG)`. Also re-applied during reconciliation
(Pattern 3) for inherited files.

### Anti-Patterns to Avoid

- **Do not remove the 1026 writer or the `1026`-default in `buildAppManifestText`.** D-01/D-03 both require
  it stay reachable as the fallback; `stateFlags = params.stateFlags ?? '1026'` (manifest.ts:129) should
  remain the unconditional default — only the CALLER (`finalizeToSteam`) decides when to override it, never
  a change to the default itself.
- **Do not compute `SizeOnDisk`/`BytesToDownload`/`BytesDownloaded` as a DepotPlan-derived sum.** Spike 001
  already found this overshoots multi-depot installs by 236MB (Wasteland 3) — `measureInstalledBytes`
  (real recursive disk walk, `depot.ts:960-978`) is already correct and must stay the source for all three
  fields, including under StateFlags=4.
- **Do not gate the completeness check on `outcome === 'completed'` alone.** A `downloadDepotFiles` call
  can return `outcome: 'completed'` with a non-empty `failures` array (per-file errors don't stop the rest
  of the batch — `depot.ts:895-897`) — both conditions must be checked (Pattern 2 already does this).
  Missing this is a realistic gap-introduction risk since `failures.length === 0` is easy to forget.
- **Do not re-derive `buildid` from a second PICS call inside `finalizeToSteam`.** Use only the value
  captured in `DepotPlan.buildid` at plan-build time (Pattern 1) — a second read risks racing a real Valve
  update mid-download and writing a buildid that doesn't match what was actually downloaded.
- **Do not let reconciliation (Pattern 3) skip the whole-file sha1 check for "trusted" files.** The entire
  point of D-04 is that GameLib, not Steam, is asserting completeness — a file that merely "exists at the
  right size" without a sha1 re-check is exactly the gap spike-003's exec-bit surprise warned about
  ("sha1 guarantees content, not filesystem mode" generalizes to "existence guarantees nothing, sha1 does").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Whole-file integrity check | A new hashing utility | The existing `sha1File()` (`depot.ts:612-620`, streaming, already used post-download) | Already correct, already streaming (no RAM blowup on large files), already the exact hash algorithm Steam manifests use |
| Per-chunk integrity | A new verification layer for resumed chunks | The existing `fetchChunk`/`decodeChunk` sha1 gate (`decompress.ts:88-105`) | Already enforces `sha1(decompressed) === chunk.sha` before returning any chunk — reconciliation only needs to decide WHICH files skip re-fetching, not change how fetching itself verifies |
| VDF manifest serialization | A generic VDF writer, or `@node-steam/vdf`'s `.stringify()` | The existing hand-templated `buildAppManifestText()` (`manifest.ts:121-162`) | The project already established (Phase 21, T-21-04) that the parsing library's 64-bit handling is unverified/likely-broken for serialization; the hand-template is deliberate and load-bearing |
| Windows file-attribute manipulation | A native Node addon or an npm attributes package | `spawnSync('attrib', [...])`, matching `windowsRunningAppId()`'s `spawnSync('reg', [...])` precedent | Keeps the project's no-native-modules constraint; `attrib.exe` is a stock Windows binary, zero install |
| Detecting "is this download actually complete" | A new heuristic (e.g. trusting `outcome==='completed'`) | The completeness gate (Pattern 2), which composes existing verification signals | Spike-003 already enumerated the exact minimum field set; reinventing the check risks missing one of the 5 proven load-bearing fields |

**Key insight:** Nearly every primitive this phase needs (sha1 verification, chunk retry, VDF writing,
progress throttling) already exists and is already correct — Phase 21 built a genuinely integrity-checked
downloader. The risk in this phase is not "the primitives are missing," it's "wiring four already-correct
primitives (plan buildid, chunk sha1, whole-file sha1, file-mode application) into ONE new decision (the
completeness gate) without silently dropping one of them," plus building the one genuinely-new primitive
(reconciliation) carefully enough that it doesn't weaken the sha1 guarantee it's built on top of.

## Common Pitfalls

### Pitfall 1: Treating "file exists on disk" as proof of completeness
**What goes wrong:** Reconciliation (D-04) skips re-downloading a file because it's present, without
re-verifying its sha1 — then StateFlags=4 asserts a corrupt/truncated file is fine.
**Why it happens:** Checking existence + size is cheap; checking sha1 requires reading the whole file.
It's tempting to treat "right size" as "probably fine" for performance.
**How to avoid:** Reconciliation MUST call `sha1File()` on every existing candidate file before treating it
as verified — this is explicitly what spike-003's core lesson ("sha1 guarantees content, Steam's verify
pass guarantees more") demands be taken seriously for the NEW reconciliation code too.
**Warning signs:** A resumed install writes StateFlags=4 faster than a fresh install of the same size would
allow for a full sha1 pass — a sign the hash check was skipped or short-circuited.

### Pitfall 2: Forgetting failures.length in the completeness gate
**What goes wrong:** `downloadDepotFiles` can return `outcome: 'completed'` with non-empty `failures` — a
gate that checks only `outcome` writes StateFlags=4 over a partially-failed install.
**Why it happens:** `outcome` reads like a boolean success/fail signal; the failures array is a second,
easy-to-miss field on the same result object.
**How to avoid:** The gate function (Pattern 2) must be a single, tested, exported predicate — never inlined
ad-hoc at each call site — so this check can't silently diverge between the fresh-install and resume paths.
**Warning signs:** A user reports a game "installed" but a specific file is missing/corrupt, with no verify
pass having run to catch it.

### Pitfall 3: Windows Hidden attribute silently no-op'ing
**What goes wrong:** `fs.chmod` is called expecting it to also set the Hidden attribute on Windows; it
doesn't (chmod only reaches the ReadOnly bit) — the flag is "applied" from the code's perspective (no error
thrown) but the file isn't actually hidden.
**Why it happens:** Node's cross-platform `fs.chmod` abstraction hides the fact that Windows file attributes
and POSIX permission bits are fundamentally different concepts that only partially overlap.
**How to avoid:** Explicitly branch on platform for `Hidden`/`ReadOnly` (Pattern 4) — never assume
`fs.chmod` covers Windows attribute semantics. Since D-06 also states this fidelity gap is "unlikely to
block launch" per spike-003's own open-items note, treat this as lower-urgency than the exec-bit fix, but
still implement it correctly rather than with a silently-failing shortcut.
**Warning signs:** A Windows user reports Steam's own file browser or a re-verify shows different attributes
than expected; not launch-blocking, so likely to go unnoticed without a dedicated D-07 hardware check.

### Pitfall 4: Re-deriving buildid instead of reusing the plan-time capture
**What goes wrong:** A second `client.getProductInfo()` call inside `finalizeToSteam` (rather than reusing
`DepotPlan.buildid`) races a mid-download Valve update and writes a buildid that doesn't match the files
actually on disk — the exact "byte-perfect content but wrong build claim" failure mode StateFlags=4 is
supposed to prevent.
**Why it happens:** `finalizeToSteam` doesn't currently HAVE the buildid in scope except via the threaded
`opts.buildid` parameter (already correctly wired) — but a future edit "simplifying" the call chain might
be tempted to fetch it fresh instead of threading it, especially since `finalizeToSteam` already does its
own `SteamUser.getClient()` lookup for `lastOwner`.
**How to avoid:** Keep `buildid` strictly a caller-supplied parameter on `FinalizeToSteamOpts`, sourced only
from `DepotPlan.buildid` (Pattern 1) — never let `finalizeToSteam` fetch PICS itself.
**Warning signs:** A code review finds a new `getProductInfo` call inside `finalizeToSteam` or its callers
that isn't feeding into the existing plan-time capture.

### Pitfall 5: Assuming the folded-todo bottle auto-open bug still needs fixing
**What goes wrong:** The planner allocates a full task to "fix" the Steam-in-CrossOver auto-open on resume,
duplicating work that Phase 21's 21-16 gap closure already appears to have done.
**Why it happens:** CONTEXT.md's Folded Todos section frames this as still-open work under D-04's expanded
ownership scope, written before this session's direct code inspection.
**How to avoid:** Direct read of `library.ts:122-206` (`SteamLibraryManager.init()`) this session shows
`scanDownloadingAppIds()` is native-steamapps-only (never touches `getBottleSteamappsRoot()`) and the
resume path calls only `finalizeToSteam` (writes 1026, never 4, never bottle-scoped) + `startInstallPolling(appId)`
WITHOUT `{source: 'bottle'}` — meaning a bottle game's interrupted download is never touched by startup
resume at all today. This looks like it's already fixed. Recommend the planner add a **verification task**
(read the code, confirm this analysis, possibly add/extend a regression test asserting the bottle steamapps
root is never scanned at startup) rather than a **fix task**.
**Warning signs:** None expected if verified early — flagging here specifically so planning doesn't
over-allocate effort to non-existent work.

## Code Examples

### Existing buildid capture (already correct, just spike-gated downstream)
```typescript
// Source: src/backend/storeManagers/steam/depot.ts:504-511 (buildDepotPlan)
const buildid = String(
  (appinfo as unknown as {
    depots?: { branches?: { public?: { buildid?: string | number } } }
  }).depots?.branches?.public?.buildid ?? ''
)
```

### Existing whole-file sha1 verification (reuse verbatim for reconciliation)
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

### Existing executable-bit fix (the template for the ReadOnly/Hidden extension)
```typescript
// Source: src/backend/storeManagers/steam/depot.ts:778-786
// SPIKE 003 finding: apply the manifest's executable flag(s). Under the 1026
// handoff Steam's verify pass sets this; the StateFlags=4 full-ownership path
// does not run verify, so without this the game binary is non-executable and
// launch fails with `os error 256` on macOS. sha1 guarantees CONTENT, not the
// filesystem mode — so this is required for full ownership regardless of the
// spike flag (harmless under 1026: Steam would set the same bit anyway).
if (file.flags && file.flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG)) {
  await chmod(dest, 0o755)
}
```

### The exact StateFlags=4 manifest Steam accepted (spike-003 real capture, reference field set)
```
// Source: .planning/spikes/003-stateflags4-full-ownership/snapshot-after-gamelib.acf
"AppState"
{
	"appid"		"264160"
	"Universe"		"1"
	"StateFlags"		"4"
	"installdir"		"WazHack"
	"name"		"WazHack"
	"LastUpdated"		"1784271612"
	"SizeOnDisk"		"117426878"
	"buildid"		"9044149"
	"LastOwner"		"76561197995867096"
	"BytesToDownload"		"117426878"
	"BytesDownloaded"		"117426878"
	"AutoUpdateBehavior"		"0"
	"InstalledDepots" { "264162" { "manifest" "3306037234848478854" "size" "117426878" } }
	"UserConfig" {}
	"MountedDepots" {}
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| GameLib writes `StateFlags=1026`; Steam's own verify pass repairs everything and flips to `4` | GameLib writes `StateFlags=4` directly when it can prove completeness; falls back to `1026` only when it can't | Spike-003, VALIDATED 2026-07-17 (this session's phase) | Zero-touch install — Steam does nothing on first launch of a GameLib-installed game; but GameLib now owns everything Steam's verify pass used to silently provide (file modes, at minimum) |
| Depot downloader always re-downloads 100% on any retry/resume | Depot downloader will reconcile partial state (D-04), skipping already-verified files | This phase (net-new, no prior implementation) | Faster resumes; but introduces new correctness surface (a wrongly-trusted partial file is a new failure class that didn't exist when every retry was a clean full download) |
| File modes (executable bit) implicitly provided by Steam's verify pass | File modes must be explicitly applied by GameLib's depot writer, per `EDepotFileFlag` | Spike-003 exec-bit discovery, 2026-07-17 | `Directory`(64)/`Symlink`(512) already handled (Phase 21); `Executable`(32)/`CustomExecutable`(128) already handled (spike-003); `ReadOnly`(8)/`Hidden`(16) still missing — this phase's D-06 scope |

**Deprecated/outdated:**
- The MANIFEST.md "Write `StateFlags = 1026`, never `4`" rule is explicitly superseded (see `.planning/spikes/MANIFEST.md` line 27-33) — it remains correct for the FALLBACK path only, never as an absolute constraint.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node's `fs.chmod` on Windows only reaches `FILE_ATTRIBUTE_READONLY`, with no API surface for `FILE_ATTRIBUTE_HIDDEN` | Pattern 4 / Pitfall 3 | If wrong (Node does expose a Hidden-setting path), the recommended `attrib.exe` subprocess approach is unnecessary extra complexity — low risk, easily discovered during D-07's Windows follow-up validation, non-blocking since D-07 explicitly defers full Windows coverage |
| A2 | The Phase 21 21-16 gap-closure (`library.ts:147-194`) has already fully resolved the folded-todo bottle-auto-open concern, since startup resume never scans the bottle steamapps root and never calls `tellBottledSteamToInstall` | Pitfall 5 | If wrong (some other code path still triggers the auto-open — e.g. a bottle-specific poller elsewhere not found by this session's search), the planner would under-scope a task that's actually still needed; low risk since a targeted grep for `tellBottledSteamToInstall`/`scanDownloadingAppIds` call sites found no other candidates, but recommend the planner re-run this check rather than trust it fully |
| A3 | A resumed/reconciled file's `sha1File()` re-check has acceptable performance cost for large (50GB+) titles referenced in D-07's Cyberpunk validation target | Pattern 3 | If wrong (full-file re-hashing on every resume attempt is too slow for large titles), the planner may need a cheaper first-pass heuristic (e.g. mtime+size) before falling back to sha1 for files that look suspicious — but weakening the sha1-always-verify guarantee for speed directly undermines D-01's "provable completeness" bar, so this should be measured, not assumed away |

**If this table is empty:** N/A — see above.

## Open Questions (RESOLVED)

1. **Exact location of the `canWriteFullOwnership` gate — inline in `finalizeToSteam` vs. a separate exported/testable function?**
   - What we know: CONTEXT.md leaves this to "planner's call" (Claude's Discretion). `finalizeToSteam` is
     explicitly documented as the project's "single recovery function" (Pattern 5, `depot.ts:917-928`)
     that all outcomes converge on — this argues for keeping the gate logic INSIDE that function (or as a
     pure helper it calls) rather than forking a second finalize path.
   - What's unclear: Whether the reconciliation pass's "allFilesVerified" bookkeeping is naturally computed
     inside `downloadDepotFiles`'s existing result shape (`DepotDownloadResult`) or needs a new return field.
   - Recommendation: Extend `DepotDownloadResult` with an `allFilesVerifiedThisRun: boolean` (or similar)
     field the download loop already has the information to populate, rather than a parallel out-of-band
     verification pass — keeps the single-source-of-truth discipline this codebase already follows.
   - **RESOLVED (2026-07-17):** Plan 23-02 Task 1 implements `canWriteFullOwnership` as a single **exported,
     unit-tested pure predicate** called INSIDE `finalizeToSteam` (no forked finalize path); 23-02 Task 2
     extends `DepotDownloadResult` with `allFilesVerifiedThisRun`/`allModesApplied` and threads them via
     `FinalizeToSteamOpts`, exactly as recommended.

2. **Does `measureInstalledBytes`'s recursive disk walk need to change for reconciliation, or is it already sufficient?**
   - What we know: `measureInstalledBytes` (`depot.ts:960-978`) already recursively sums real bytes under
     `installRoot` regardless of HOW those bytes got there (fresh download or pre-existing from a prior
     partial run) — it is source-agnostic by construction.
   - What's unclear: Whether it needs any change at all for D-04, or whether it's already exactly the right
     "measure what's really on disk" primitive reconciliation should build on top of.
   - Recommendation: Treat `measureInstalledBytes` as already correct and unchanged for this phase — no
     open work here, but the planner should confirm no other assumption elsewhere depends on
     `SizeOnDisk` reflecting only THIS run's downloads (it already reflects the whole directory tree).
   - **RESOLVED (2026-07-17):** Plan 23-03 Task 2 keeps `measureInstalledBytes` as the unchanged
     SizeOnDisk/bytes source for both fresh and reconciled installs (acceptance criteria forbid a
     DepotPlan-sum substitution) — no change needed, confirmed source-agnostic.

3. **Multi-depot buildid: does every depot share one `buildid`, or is it per-depot?**
   - What we know: Spike-003 and the codebase both treat `buildid` as a single per-APP value from
     `appinfo.depots.branches.public.buildid` — one value for the whole app, not per-depot.
   - What's unclear: Whether Valve's data model has any per-depot build versioning that could matter for
     D-07's multi-depot Cyberpunk validation target — untested by spike-003 (WazHack is single-depot).
   - Recommendation: D-07 explicitly gates shipping on a real multi-depot hardware test; this is exactly
     the kind of assumption that test should surface. No code change needed now, but flag it as the thing
     D-07's multi-depot check is FOR.
   - **RESOLVED (2026-07-17):** Deferred to Plan 23-04's D-07 multi-depot hardware gate (REQ-23-07,
     Gate 1), as recommended — the per-app single-buildid assumption is exactly what that real
     multi-depot install (Cyberpunk) is designed to surface. No code change in this phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest ^29.7.0 (ts-jest, per project `jest.config.js`) |
| Config file | `jest.config.js` |
| Quick run command | `pnpm jest src/backend/storeManagers/steam/__tests__/depot.test.ts` |
| Full suite command | `pnpm test:ci` (jest --runInBand --silent) |

### Phase Requirement → Test Map

> No pre-existing REQ-IDs exist for this phase (per task brief — mint during planning from D-01..D-07).
> Table below anchors each locked decision to its testable behavior and the existing test file it extends,
> using D-XX as the stand-in ID until the planner mints SFI-XX (or similar) requirement IDs.

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-02 | buildid threaded unconditionally into manifest (not spike-gated) | unit | `pnpm jest manifest.test.ts -t buildid` | manifest.test.ts exists (199 lines) — extend, not new |
| D-01 | `canWriteFullOwnership` returns false on non-empty failures / missing buildid / outcome!=='completed' | unit | `pnpm jest depot.test.ts -t "completeness"` | depot.test.ts exists (1666 lines) — extend |
| D-01 | `canWriteFullOwnership` returns true only when every load-bearing field is present | unit | `pnpm jest depot.test.ts -t "canWriteFullOwnership"` | new test cases in depot.test.ts |
| D-04 | Reconciliation skips re-download of an existing sha1-matching file | unit | `pnpm jest depot.test.ts -t "reconcile"` | ❌ Wave 0 — new reconciliation module has no test file yet |
| D-04 | Reconciliation treats a sha1-mismatched existing file as a fresh download job | unit | `pnpm jest depot.test.ts -t "reconcile.*mismatch"` | ❌ Wave 0 |
| D-06 | `ReadOnly`/`Hidden` flags applied via chmod on POSIX | unit | `pnpm jest depot.test.ts -t "EDepotFileFlag"` | depot.test.ts exists — extend (existing Executable/CustomExecutable tests are the precedent) |
| D-06 | Windows attribute application shells to `attrib.exe` with correct args | unit (mocked spawnSync) | `pnpm jest fileAttributes.test.ts` | ❌ Wave 0 — new module, no test file |
| D-03 (opt-in inheritance) | StateFlags=4 behavior only reachable behind existing D-13 opt-in setting, no new toggle | unit | `pnpm jest nativeInstallSetting.test.ts` | nativeInstallSetting.test.ts exists — verify no new setting added |
| D-07 | Real-hardware validation (multi-depot, hard-DRM, interrupt-resume) | manual-only (real Steam client, real hardware) | N/A — human-verify, no automated harness possible for real Steam client behavior | See 23-UAT.md (to be created by planner) |

### Sampling Rate
- **Per task commit:** `pnpm jest src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/manifest.test.ts`
- **Per wave merge:** `pnpm test:ci`
- **Phase gate:** Full suite green before `/gsd:verify-work`, PLUS D-07's three real-hardware checks
  (multi-depot, hard-DRM, interrupt-resume) recorded in a `23-UAT.md` before the phase is considered
  shippable — these cannot be automated (real Steam client + real hardware + real owned titles).

### Wave 0 Gaps
- [ ] `src/backend/storeManagers/steam/depot/__tests__/reconcile.test.ts` (or inline in `depot.test.ts`) — covers D-04 reconciliation logic
- [ ] `src/backend/storeManagers/steam/depot/__tests__/fileAttributes.test.ts` — covers D-06 Windows attrib.exe subprocess + POSIX ReadOnly chmod, mocking `spawnSync` the same way `library.test.ts` presumably mocks `windowsRunningAppId`'s `spawnSync('reg', ...)` (verify precedent before writing)
- [ ] `23-UAT.md` — D-07's three real-hardware gates (multi-depot, hard-DRM title, interrupt-then-resume), following the `21-UAT.md` precedent format

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Reuses Phase 21's existing authenticated `steam-user` CM connection; no new auth surface |
| V3 Session Management | No | No change to session handling |
| V4 Access Control | No | No new access-control surface; depot ownership check is unchanged from Phase 21 |
| V5 Input Validation | Yes | `name`/`installdir` VDF-escaping (`vdfEscape()`, already implemented, WR-01) remains load-bearing; `buildid` now flows unconditionally into manifest text — confirm it passes through the same numeric/string discipline as other fields (it's already just interpolated as a string, no additional escaping needed since it's PICS-sourced numeric-like data, but SHOULD still be treated as untrusted content, not assumed safe) |
| V6 Cryptography | No new surface | sha1 usage here is integrity-checking (matching Steam's own manifest format), not a security cryptographic control — no change from Phase 21's existing `steamDecrypt`/AES handling |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reconciliation trusting a maliciously-placed file (e.g. another process drops a file at the expected path between plan-build and reconciliation) | Tampering | Always sha1-verify before trusting any existing file (Pattern 3) — never skip the hash check based on size/mtime alone; this is the same discipline as the existing chunk/whole-file verification, just extended to pre-existing files |
| `buildid` field injection via a crafted/compromised PICS response | Tampering | `buildid` is read via `String(...)` coercion from a numeric-typed PICS field and interpolated into a VDF value slot that is NOT one of the currently-escaped fields (`name`/`installdir` go through `vdfEscape()`; numeric-ish fields like `buildid` do not). Recommend the planner add an explicit numeric-shape guard (similar to `assertNumericId`) on `buildid` before interpolation, since it is now unconditionally written (previously only ever reachable behind the throwaway spike flag) |
| Windows `attrib.exe` subprocess argument injection | Tampering | Follow the existing `windowsRunningAppId()` precedent exactly — argv-form `spawnSync` (never shell-form/string concatenation), hardcoded flag arguments, file path as a single argv element (never string-interpolated into a shell command) |
| A resumed download silently trusting a partially-corrupted file due to a reconciliation logic bug | Tampering / Repudiation (user has no way to know their "complete" install is actually broken) | The completeness gate (Pattern 2) is the single chokepoint — recommend a dedicated "gate returns false when ANY input is ambiguous" default, i.e. fail closed to the already-safe 1026 fallback rather than fail open to StateFlags=4 |

## Sources

### Primary (HIGH confidence)
- `.planning/spikes/003-stateflags4-full-ownership/README.md` — validated experiment, RUN 1/RUN 2 results, 5 load-bearing fields
- `.planning/spikes/003-stateflags4-full-ownership/snapshot-after-gamelib.acf` — real Steam-accepted manifest capture
- `.planning/spikes/MANIFEST.md` — locked decisions, SUPERSEDED entry, spike table
- `.planning/notes/steam-depot-install-architecture.md` — D-1/D-2 architecture background
- `node_modules/steam-user/enums/EDepotFileFlag.js` — authoritative EDepotFileFlag bit values (read directly this session)
- `src/backend/storeManagers/steam/depot.ts` (full read, this session) — buildDepotPlan, finalizeToSteam, downloadSteamDepots, downloadSingleFile, downloadDepotFiles, sha1File, measureInstalledBytes
- `src/backend/storeManagers/steam/depot/manifest.ts` (full read, this session) — buildAppManifestText, writeAppManifest, AppManifestParams
- `src/backend/storeManagers/steam/depot/decompress.ts` (full read, this session) — per-chunk sha1 gate, fetchChunk retry
- `src/backend/storeManagers/steam/library.ts` (relevant sections read, this session) — readAcfState, pollInstallOnce, startInstallPolling, scanDownloadingAppIds, SteamLibraryManager.init(), locateDownloadingTarget
- `src/backend/storeManagers/steam/games.ts` (relevant sections read, this session) — installDepotDownload, tellBottledSteamToInstall call sites
- `src/backend/storeManagers/steam/depot/select.ts` (partial read, this session) — DepotDescriptor/OwnedSets shape
- `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-CONTEXT.md` — locked D-01..D-07 decisions

### Secondary (MEDIUM confidence)
- `.planning/todos/pending/steam-startup-download-resume-autoopens-crossover.md` — original bug report, cross-checked against current code (Pitfall 5) and found likely already resolved
- `.planning/STATE.md` — project history, Phase 21 completion status, decision log entries for 21-13/21-14/21-16

### Tertiary (LOW confidence)
- Node.js `fs.chmod` Windows-attribute-coverage claim (Assumption A1) — training-knowledge, not re-verified against current Node docs this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages, all existing dependencies already legitimacy-audited in Phase 21
- Architecture: HIGH — every code path referenced was read directly from the current repo this session, not inferred from documentation or training data
- Pitfalls: HIGH for D-01/D-02/D-06 (directly observed in code); MEDIUM for D-04 (genuinely new code, pitfalls are informed reasoning about the existing patterns rather than observed bugs)

**Research date:** 2026-07-17
**Valid until:** 2026-08-16 (30 days — stable spike-validated foundation, but D-04's reconciliation design should be re-checked against the actual implementation once written, since it's the one genuinely new subsystem)
