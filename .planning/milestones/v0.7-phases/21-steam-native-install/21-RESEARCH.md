# Phase 21: Steam Native Install - Research

**Researched:** 2026-07-15
**Domain:** In-process Steam depot download (steam-user CM protocol), Steam appmanifest (.acf) adoption, Electron DownloadManager integration, CrossOver/Wine bottle filesystem integration
**Confidence:** MEDIUM — the core mechanism (depot download + .acf adoption) is HIGH confidence, empirically validated end-to-end by two real-machine spikes. The six MUST-VALIDATE items called out in CONTEXT.md (streaming-to-disk, multi-depot, bottle adoption, hard-DRM, 64-bit VDF, DownloadManager wiring) are each individually LOW-to-MEDIUM confidence — none has a real-machine spike of its own. This research narrows each to a concrete, gradeable engineering task; none is a research dead-end.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Progress & Control UX**
- **D-01:** Route Steam downloads through the **existing DownloadManager queue** (same surface legendary/gogdl/nile use) — percentage, speed, ETA. No Steam-specific progress UI.
- **D-02:** V1 exposes **cancel only** — no in-app pause/resume. Resume-from-partial is untested (spike 002: files assembled in RAM, streaming-to-disk + persisted chunk state not built). True pause/resume is explicitly deferred to a later phase.
- **D-03:** The progress bar / queue size is driven by **real total bytes from the depot manifest**, replacing today's `pc_requirements` estimate (`getSteamInstallSize`). Real progress is the point.

**Failure & Recovery**
- **D-04:** On a failed or cancelled download (chunk retries exhausted, disk error, user cancel), the default outcome is to **write the `1026` `.acf` over whatever landed and hand off to Steam's verify-and-repair pass**. Steam re-downloads/repairs the missing bytes and flips `StateFlags` to `4` itself. This is the one recovery path proven end-to-end (spike 001) — no GameLib-owned resume.
- **D-05:** On **app startup** with a partial/interrupted GameLib download on disk: same behavior — finalize into a `1026` manifest so Steam picks it up on its next launch. **Never silently auto-drive Steam / Steam-in-CrossOver.**
- **D-06:** A failed download presents in the queue as an **actionable error + Retry** — plain-language reason (e.g. "Steam servers dropped the connection", "Out of disk space") mapped from the downloader's error classes.
- **D-07 (reconciliation note for planning):** "Hand off to Steam" (automatic, D-04) and "Retry" (manual GameLib re-download, D-06) are **complementary, not conflicting** — the `1026` handoff is the always-on safety net; Retry re-runs GameLib's own downloader for users who want GameLib to own the retry. Planning reconciles the exact interaction.

**Install Location**
- **D-08:** Write downloaded depot files into an **existing Steam-registered library folder** (from `config/libraryfolders.vdf`'s `steamapps/`). Required for Steam adoption. Do NOT (V1) have GameLib mutate `libraryfolders.vdf` to register a custom path.
- **D-09:** When multiple Steam library folders/drives exist, **default sensibly (Steam's primary), and offer an override picker** (reuse the existing install-location modal pattern).
- **D-10:** When the **Steam client is not installed**, run a **guided install with user consent** (reuse Phase 17's guided-setup/consent pattern): download + run the official installer on Win/macOS, link the download on Linux. Then proceed to game install.
- **D-11 (Claude's discretion):** "Steam installed but never run → no `libraryfolders.vdf` yet" edge is planning's call. Lean: **prompt the user to launch Steam once**, unless research shows a fresh install reliably creates the folder.

**Rollout Scope**
- **D-12:** Target **all three desktop OSes** (Windows, macOS, Linux). The download mechanism is OS-agnostic.
- **D-13:** Ship behind a **user opt-in setting**. When OFF, today's `steam://install` handoff is unchanged.
- **D-14:** When the setting is ON, GameLib's downloader handles **all** Steam installs — including multi-depot games and very large / 50GB+ games. No per-case `steam://install` fallback.
- **D-15:** **Depot-download into the Phase 17 macOS CrossOver bottle** too — GameLib downloads the Windows depot into the bottle's `steamapps/` and the **bottled** Windows Steam adopts the `1026` `.acf`, unifying the mechanism across native and bottle installs.

**MUST-VALIDATE (flagged for researcher/planner — consequences of D-14/D-15)**
- Multi-depot games — download proven single-depot only (spike 002).
- Very large / 50GB+ games + streaming-to-disk — spike 002 assembled files **in RAM**.
- Bottle adoption — does bottled Windows Steam adopt a hand-written `.acf` identically to native? Proven native only.
- Hard-DRM launch confirmation — spike 001's WazHack was not confirmed hard-DRM.
- `@node-steam/vdf` 64-bit corruption — audit existing call sites; 64-bit IDs must be strings end-to-end.

### Claude's Discretion
- D-11 (not-initialized Steam edge) — lean toward prompt-to-launch.
- Error-class → message mapping (D-06) — planning maps the downloader's failure modes to copy.

### Deferred Ideas (OUT OF SCOPE)
- **True in-app pause/resume** — requires streaming-to-disk + persisted per-chunk state + manifest-GID pinning across the gap + auth/key re-fetch. All untested (spike 002). Its own phase once streaming-to-disk lands.
- **GameLib owning updates** — permanently out of scope per architecture D-2. Steam's delta-patching is better than anything we'd build.
- **Custom (non-Steam-registered) install locations** — would require GameLib to mutate `libraryfolders.vdf`; deferred (D-08 targets existing registered folders only).
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 21 requirement IDs are **not yet minted** — `/gsd-plan-phase 21` mints them from the locked
D-01..D-15 decisions above (per ROADMAP.md and STATE.md). This research is organized around those
decisions and the five MUST-VALIDATE items rather than requirement IDs. The planner should mint
requirements directly from the `<user_constraints>` Decisions list (a natural 1:1 or 1:few mapping
already exists — e.g. D-01/D-03 → progress requirement, D-04/D-05/D-06/D-07 → recovery requirement,
D-08/D-09/D-10/D-11 → install-location requirement, D-12/D-13/D-14 → rollout requirement, D-15 →
bottle requirement) and cross-reference each against the "Phase Requirements → Test Map" in the
Validation Architecture section below.
</phase_requirements>

## Summary

The architecture is locked and de-risked: spikes 001 and 002 proved, on a real machine, that (a)
Steam adopts a hand-written `appmanifest_{appId}.acf` with `StateFlags = 1026` and verifies/repairs
it to `4` with zero re-download, and (b) `steam-user`'s authenticated CM connection can download a
complete depot in-process, byte-identical to Steam's own client, using pure-JS LZMA (no native
module). Phase 21 turns this proven mechanism into a shipped feature: a small (~100-200 line)
orchestrator sits on top of the already-working `steam-depot.mjs` primitives (`getRawManifest`,
hand-rolled decrypt/decompress, retry-across-content-servers), feeds progress into the *existing*
DownloadManager queue the same way legendary/gogdl/nile already do, and writes the `1026` manifest
GameLib already knows the shape of from spike 001.

The five MUST-VALIDATE items are not open-ended unknowns — each has a concrete, low-risk engineering
answer discoverable in this research: streaming-to-disk is a straightforward switch from
`Buffer.alloc` + `writeFileSync` to positional `fs.write(fd, chunk, offset)` (chunks are already
offset-addressable); multi-depot download is "run the existing per-depot pipeline N times, sum the
totals"; bottle adoption is very likely to work because the bottled Steam client is the *same*
Windows Steam binary reading the *same* manifest format, and GameLib's existing bottle-scoped ACF
poller (`readAcfState(appId, 'bottle')`) already works against arbitrary bottle `steamapps/`
content with no changes needed; the `@node-steam/vdf` 64-bit risk is real but narrow — its four
existing call sites are safe today by accident (none reads a 64-bit field), and the fix is simply
"never call `VDF.stringify()` to write the manifest; hand-template the ACF text instead," which
spike 001's own code already does. Hard-DRM confirmation is the one item that is genuinely
empirical and cannot be resolved by reading code — it needs a real installed hard-DRM title
(e.g. a Denuvo or VMProtect-wrapped game) tested against the shipped build before general release.

**Primary recommendation:** Build the depot-download orchestrator as a new module in
`src/backend/storeManagers/steam/` (e.g. `depot.ts`) that wraps the spike's `steam-depot.mjs`
primitives, writes files via positional `fs.write` (not RAM-buffered), sums totals across all
depots returned by `selectAllDepots()`, and feeds `sendProgressUpdate`/`sendGameStatusUpdate` in
the exact shape `InstallProgress` already expects — so it slots into `installQueueElement()`
(`downloadmanager/utils.ts`) as a peer of legendary/gogdl/nile with zero DownloadManager-side
changes. Manifest writing must be a hand-rolled VDF text template (never `@node-steam/vdf.stringify()`
— confirmed unused anywhere in the codebase today, and spike 001 already establishes the
string-templating precedent). The `1026`→Steam-repair handoff (D-04/D-05) reuses the *same* write
path for cancel, failure, and startup-resume, collapsing three cases into one code path.

## Architectural Responsibility Map

GameLib is an Electron app; "tiers" map to Electron's process model plus the external OS-level
Steam client, not a web app's browser/CDN/API split.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Depot manifest fetch, decrypt, chunk download/decompress | Backend (Electron main) | Filesystem/Storage | `steam-user`'s CM connection and all crypto/decompress work happen in the main process; nothing here is renderer-visible until progress events fire |
| Progress/speed/ETA computation | Backend (Electron main) | Frontend (renderer DownloadManager UI) | Backend computes bytes/percent from the depot manifest total (D-03); frontend only renders `InstallProgress` it already knows how to render for legendary/gogdl/nile |
| Cancel control | Frontend (DownloadManager cancel button) | Backend (AbortController + chunk loop check) | Existing `callAbortController(appName)` primitive (Node `AbortController`) is already wired from `stopCurrentDownload()`; the Steam downloader must just check `signal.aborted` in its chunk loop, mirroring the existing pattern |
| ACF manifest writing (`1026`) | Backend (Electron main) / Filesystem | OS-integration (Steam client reads it) | GameLib writes the file directly to a `steamapps/` directory it already has fs access to; adoption is entirely the external Steam process's concern |
| Install-location selection (D-08/D-09) | Frontend (picker modal) | Backend (`getSteamLibraries()` VDF read) | Reuses the existing `InstallModal`/`DownloadDialog` picker pattern already used by GOG/Epic path selection |
| Guided Steam-client install (D-10) | Backend (orchestrates installer download + non-silent run) | OS-integration (native installer process) | Mirrors Phase 17's `SteamBottleSetup.tsx` + bottle provisioning consent pattern, but targeting the *native* Steam installer, not CrossOver |
| Bottle depot-download (D-15) | Backend (Electron main, writes into bottle's real macOS filesystem path) | OS-integration (bottled Windows Steam client) | `getBottleSteamappsDir()` already resolves to a real macOS directory (CrossOver's C: drive is a real directory tree) — GameLib writes there directly with plain Node `fs`, no Wine dispatch needed for the download itself |
| Failure/recovery handoff (D-04/D-05) | Backend (writes `1026` over partial state) | OS-integration (native or bottled Steam verify-repair pass) | Single write-path serves cancel, failure, and startup-resume — Steam's own repair logic (external process) does the actual recovery work |
| Settings opt-in toggle (D-13) | Frontend (Settings screen) | Backend (`configStore`/electron-store read at install() branch point) | Standard `configStore` pattern already used elsewhere in the codebase (see `SteamGame.getSettings()` / `getSteamBottleSettings()`) |

## Standard Stack

### Core

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `steam-user` | `^5.3.0` [VERIFIED: package.json — already a project dependency] | Authenticated CM connection; `getProductInfo` (PICS), `getDepotDecryptionKey`, `getRawManifest`, `getContentServers` | Already GameLib's Steam auth/library backbone (Phase 1/2); spike 002 proved its *primitives* (not its `getManifest()`/`downloadChunk()` convenience wrappers) work perfectly for depot download |
| `@node-steam/vdf` | `^2.2.0` [VERIFIED: package.json — already a project dependency] | Parse `libraryfolders.vdf` and read-side `appmanifest_*.acf` fields | Already used at 4 call sites (`utils.ts` `getSteamLibraries`, `steam/library.ts` `readAcfState`/`buildBottleInstalledMap`, `launcher.ts` `toolmanifest.vdf`) — **but must NOT be used to WRITE the new depot-download manifest** (see Pitfall 1) |
| `electron-store` (via `TypeCheckedStoreBackend`) | `^8.2.0` [VERIFIED: package.json] | Persist the opt-in setting (D-13), any per-appId download bookkeeping | Existing `configStore`/`steamBottleConfigStore` pattern (`src/backend/storeManagers/steam/electronStores.ts`) |
| `lzma` (pure JS) | `2.3.2` [VERIFIED: npm registry — `npm view lzma version` confirms 2.3.2, published 2022-06-19; slopcheck OK; already imported by the project's own spike 002 code (`download.mjs`), which is a codebase-authoritative source] | Decompress Steam's `VZ`-container LZMA chunks without a native module | Confirmed byte-correct against a real Steam install in spike 002 (171/171 files identical), 2.2× slower than `lzma-native` (13.8s vs 6.3s on a 112MB depot) but requires no `node-gyp`/Electron rebuild — matches the project's deliberate no-native-modules constraint |
| Node built-in `crypto` (`createDecipheriv`, `createHash`) | Node runtime | AES-256-ECB/CBC depot decrypt, SHA1 chunk/file verification | No package needed — `steam-depot.mjs` already implements the exact decrypt sequence Steam expects |
| Node built-in `fs`/`node:fs` (positional write, `fs.open`/`fs.write`/`ftruncate`) | Node runtime | Stream chunks to disk at their declared offset instead of RAM-buffering a whole file | Required for the streaming-to-disk MUST-VALIDATE item — no package needed, this is a change in *how* the existing `fs` calls are made, not a new dependency |

### Supporting (already present, reused as-is)

| Library | Already Present | Role in Steam Native Install |
|---------|-----------------|----------------------|
| `axios` | Yes (`^1.13.5`) | Unrelated to depot download itself, but already used for `getSteamInstallSize`'s estimate (D-03 replaces this path with real manifest totals for Steam) |
| Node built-in `AbortController` | Runtime | Existing `backend/utils/aborthandler/aborthandler.ts` primitive — reuse for D-02 cancel-only control, checked inside the chunk-download loop |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-JS `lzma` | `lzma-native` | 2.2× faster (17.8 vs 8.1 MB/s) but a native module requiring `node-gyp`/Electron ABI rebuild per platform — rejected by the architecture note as cutting against the deliberate no-native-modules constraint. Could be offered later as an *optional* opt-in speed path since the fallback already exists, but V1 should ship pure-JS only |
| In-process `steam-user` orchestrator (Option A, CHOSEN) | C# wrapper around SteamRE/DepotDownloader (Option B) | REJECTED in `.planning/notes/steam-depot-install-architecture.md` — requires a second toolchain (.NET 8), a second auth stack workaround with no confirmed token-injection path, and 5-platform native build/release pipeline permanently inside an Electron repo. No remaining justification once Option A was proven |
| Hand-templated ACF text | `@node-steam/vdf.stringify()` | `stringify()` exists in the package (confirmed via `lib/index.d.ts`) and is **unused anywhere in the current codebase** — using it to serialize a manifest containing 64-bit `InstalledDepots` GIDs would risk the same `Number` precision loss the `parse()` side is documented to have (spike 001 finding). Hand-templating (as spike 001 already does) keeps every 64-bit value a string end-to-end with zero library involvement |

**Installation:**
```bash
npm install lzma
```
No other new packages are required — `steam-user`, `@node-steam/vdf`, `axios`, and `electron-store`
are already project dependencies (confirmed in `package.json`).

**Version verification:** `npm view lzma version` → `2.3.2` (published 2022-06-19). `npm view
steam-user version` was not re-verified in this session (already pinned and actively used
elsewhere in the codebase since Phase 1/2 — CLAUDE.md's own Technology Stack section already
documents `5.3.0` as verified December 2025). If planning wants to confirm no newer `steam-user`
patch has shipped since, re-run `npm view steam-user version` at plan time.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `lzma` | npm | ~4 yrs (published 2022-06-19, stable since) | 42,100/week | `github.com/nmrugg/LZMA-JS` | OK | Approved |
| `steam-user` | npm | already installed, project dependency | n/a (existing dep) | `github.com/DoctorMcKay/node-steam-user` | not re-run (pre-existing, previously verified per CLAUDE.md Technology Stack) | Approved (pre-existing) |
| `@node-steam/vdf` | npm | already installed, project dependency | n/a (existing dep) | `github.com/node-steam/vdf` | not re-run (pre-existing) | Approved (pre-existing) |
| `axios` | npm | already installed, project dependency | n/a (existing dep) | n/a | not re-run (pre-existing) | Approved (pre-existing) |
| `electron-store` | npm | already installed, project dependency | n/a (existing dep) | n/a | not re-run (pre-existing) | Approved (pre-existing) |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

`lzma` is the only genuinely new package this phase introduces. `slopcheck scan --pkg npm lzma
--json` returned `"status": "OK"`, `"flags": []` in this session. No `postinstall` script was
returned by `npm view lzma scripts.postinstall` (empty output). All other packages listed above
are pre-existing project dependencies confirmed present in `package.json` (codebase grep, an
authoritative source) and were not re-audited against the registry in this session since they
predate this phase and are already in active production use elsewhere in the Steam store manager.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Frontend (renderer) — UNCHANGED surface                                 │
│  DownloadManager queue UI  ◄── progressUpdate / gameStatusUpdate IPC ───┐│
│  Install-location picker (D-09, reused pattern)                        ││
│  Settings toggle "Enable native Steam install" (D-13)                  ││
└───────────────────────────────────────┬────────────────────────────────┘│
                                         │ addToQueue({runner:'steam', ...})│
                                         ▼                                 │
┌─────────────────────────────────────────────────────────────────────────┤
│ Backend — downloadmanager/downloadqueue.ts + utils.ts (UNCHANGED)       │
│  initQueue() → installQueueElement(params)                             │
│    → libraryManagerMap['steam'].getGame(appId).install(args)  ─────┐   │
└──────────────────────────────────────────────────────────────────┬─┘   │
                                                                     ▼     │
┌────────────────────────────────────────────────────────────────────────┤
│ SteamGame.install() (steam/games.ts) — branch point (D-13)             │
│                                                                          │
│   setting OFF ──► today's steam://install handoff (unchanged)          │
│                                                                          │
│   setting ON, native ──► NEW: depot.ts orchestrator                    │
│   setting ON, bottle-eligible (D-15) ──► NEW: depot.ts, writes into    │
│                          bottle's steamapps via getBottleSteamappsDir()│
└───────────────────────────────────┬─────────────────────────────────┬──┘
                                     ▼                                 │
┌────────────────────────────────────────────────────────────────────┐│
│ NEW: steam/depot.ts — the orchestrator (~100-200 lines)              ││
│                                                                        ││
│  1. selectAllDepots(appinfo, dlcInfos, owned, {os}) ── spike 001      ││
│     (os='macos'/'linux'/'windows' per host OR 'windows' for bottle)  ││
│  2. for each depot: getRawManifest() → decrypt filenames (spike 002) ││
│  3. sum totalBytes across ALL selected depots ── D-03 real total     ││
│  4. for each file, each chunk: fetchChunk() with content-server retry││
│     write via fs.write(fd, chunk, chunk.offset) ── STREAMING, no RAM ││
│     buffering of whole files (MUST-VALIDATE item 1)                  ││
│  5. check AbortController signal each chunk ── D-02 cancel           ││
│  6. sendProgressUpdate(...) / sendGameStatusUpdate(...) ── same shape││
│     legendary/gogdl already emit; DownloadManager needs NO changes   ─┼──► back to
│  7. on success OR failure OR cancel: write appmanifest_{id}.acf with │    frontend
│     StateFlags=1026, hand-templated text (NEVER @node-steam/vdf      │    (top)
│     .stringify()) ── D-04/D-06/D-07                                  │
│  8. existing bottle-scoped ACF poller (startInstallPolling(appId,    │
│     {source:'bottle'})) already detects the manifest — no changes    │
│     needed there for D-15                                            │
└────────────────────────────────────────────────────────────────────┬─┘
                                                                        ▼
                                          ┌─────────────────────────────────┐
                                          │ External: native OR bottled     │
                                          │ Windows Steam client reads the  │
                                          │ 1026 manifest, verifies+repairs,│
                                          │ flips to 4 (spike 001)          │
                                          └─────────────────────────────────┘
```

### Recommended Project Structure

```
src/backend/storeManagers/steam/
├── depot.ts          # NEW — orchestrator: selectDepots → download → write manifest
├── depot/
│   ├── crypto.ts     # NEW — steamDecrypt/decryptFilename (lift from steam-depot.mjs)
│   ├── decompress.ts # NEW — decompressChunk (VZ container handling, lift from steam-depot.mjs)
│   └── manifest.ts   # NEW — hand-templated ACF writer (StateFlags 1026, InstalledDepots as strings)
├── games.ts           # MODIFIED — install()/stop() branch on the opt-in setting
├── library.ts          # MOSTLY UNCHANGED — existing readAcfState/pollInstallOnce/
│                        #   startInstallPolling/scanDownloadingAppIds already work against
│                        #   ANY appmanifest_*.acf regardless of who wrote it (D-05 reuse)
├── bottle.ts           # UNCHANGED for the download path itself — getBottleSteamappsDir()
│                        #   is reused as a write target; tellBottledSteamToInstall() is
│                        #   NOT called for the depot-download path (no Wine dispatch needed
│                        #   for the download — only for guided setup / D-10)
└── electronStores.ts   # MODIFIED — add the D-13 opt-in setting key
```

### Pattern 1: Depot download as a DownloadManager producer (D-01)

**What:** Steam's depot download must speak the exact same `InstallProgress` /
`sendGameStatusUpdate` vocabulary legendary/gogdl/nile already use, so the DownloadManager queue,
progress bar, and cancel button work with zero changes.

**When to use:** Any time the orchestrator has new byte counts to report — throttle to a
reasonable interval (legendary/gogdl throttle stdout-parsed progress; Steam should throttle its
own emit, e.g. every ~1% or every N ms, not per-chunk, to avoid IPC flooding on a fast LAN).

**Example (progress emit shape, from `common/types.ts` — already used by every runner):**
```typescript
// Source: src/common/types.ts:326 (InstallProgress) — existing shared shape
sendProgressUpdate({
  appName: appId,
  runner: 'steam',
  status: 'installing',
  progress: {
    percent: Math.round((doneBytes / totalBytesAcrossAllDepots) * 100),
    bytes: getFileSize(doneBytes),   // existing util, already used in library.ts
    downSpeed: instantaneousBytesPerSec,
    eta: formattedEta
  }
})
```

**Cancel wiring (D-02), matching the existing `stopCurrentDownload()` → `callAbortController` → `.stop()` path:**
```typescript
// Source: src/backend/downloadmanager/downloadqueue.ts:293 (existing, unmodified)
function stopCurrentDownload() {
  const { appName, runner } = currentElement!.params
  callAbortController(appName)               // existing primitive, no changes needed
  libraryManagerMap[runner].getGame(appName).stop(false)
}

// NEW in steam/games.ts — stop() is currently a no-op ("Steam owns process lifecycle").
// For the depot-download path it must instead abort the in-flight chunk loop:
async stop(_stopWine?: boolean): Promise<void> {
  if (this.depotDownloadInFlight) {
    // signal already registered via getAbortController(this.appId) at download start
    // depot.ts's chunk loop checks signal.aborted and exits, then D-04's write-1026 fires
  }
}
```

### Pattern 2: Streaming chunk writes (MUST-VALIDATE item 1 — memory bound)

**What:** Spike 002's `download.mjs` allocates a full-file `Buffer` (`Buffer.alloc(Number(file.size))`)
and writes it in one `writeFileSync` call after every chunk lands. This is correct at 112MB but
unbounded at 50GB+ — peak memory scales with the largest single file in the depot, and total
concurrent-file memory scales with `CONCURRENCY × largest-file-size` if multiple files download
in parallel.

**When to use:** Always, in the real build — this replaces spike 002's buffering unconditionally,
not just for "large" games, since the fix costs nothing at small scale.

**The fix:** Because each chunk already carries a declared `offset` within its file (spike 002's
`data.copy(buf, Number(chunk.offset))`), the natural fix is a positional write directly to an
open file descriptor instead of an in-memory `Buffer`:

```typescript
// ASSUMED — Node fs API mechanics are HIGH confidence/well-documented; the specific
// integration into steam-depot.mjs's pipeline is this research's recommendation, not
// something either spike tested. Flag for a short validation pass (write + read-back +
// SHA1 verify a real multi-GB depot) before this ships.
import { open, write, close, ftruncate } from 'node:fs/promises'

const fd = await open(dest, 'w')
await ftruncate(fd.fd, Number(file.size))   // pre-size the file (sparse on most filesystems)

// Chunks can be written in ANY order / concurrently — this is what makes retry-across-
// content-servers (spike 002 Finding 2) safe to keep as-is: a retried chunk just re-writes
// the same offset range.
await Promise.all(file.chunks.map(async (chunk) => {
  const data = await fetchChunk(hosts, depotId, chunk, key, lzma)  // unchanged from spike
  await fd.write(data, 0, data.length, Number(chunk.offset))
}))

// Whole-file SHA1 verification must ALSO become a streaming read, not a kept-in-RAM buffer —
// use a ReadStream piped through crypto.createHash('sha1') rather than re-reading the whole
// file into a Buffer (which would defeat the point of streaming the write).
await close(fd.fd)
```

**Memory-bound implication:** peak resident memory becomes `O(concurrency × chunk_size)` — Steam
depot chunks are historically capped around ~1MB, so at `CONCURRENCY=8` this is single-digit MB
regardless of file or depot size, a categorical improvement over the current RAM-buffered
approach. This directly unblocks D-14's "no fallback for 50GB+ games" requirement.

### Pattern 3: Multi-depot download (MUST-VALIDATE item 2)

**What:** Spike 001's `selectAllDepots(appinfo, dlcInfos, owned, opts)` (`.planning/spikes/
001-acf-adoption/select.mjs`) already returns an array of `{id, manifest, size, dlcappid}`
descriptors for every depot the user should install — this was verified 11/11 against real
Steam installs, including multi-depot games (Wasteland 3, Dead Island). Spike 002 only ever
*downloaded* one depot from that array (WazHack's single macOS depot). The gap is purely
"run the already-proven per-depot download pipeline once per selected depot," not a new
selection problem.

**When to use:** Every install — single-depot games are simply the N=1 case.

```typescript
// Source: extends spike 001's selectAllDepots() + spike 002's per-depot pipeline
const depots = selectAllDepots(appinfo, dlcInfos, owned, { os, arch, language, branch })
const perDepotManifests = await Promise.all(
  depots.map((d) => fetchManifestFor(appId, d.id, d.manifest))  // spike 002's getRawManifest step, per depot
)
const totalBytes = perDepotManifests.reduce(
  (sum, m) => sum + m.files.reduce((s, f) => s + Number(f.size), 0),
  0
)  // D-03's real total — sum ACROSS depots, not just one

// All depots' files land under the SAME common/{installdir} — this mirrors how the real
// Steam client merges multi-depot installs into one directory tree. The InstalledDepots
// map in the written .acf must list EVERY downloaded depot: { [depotId]: { manifest: gidString, size } }
```

**What must still be validated (not resolvable by reading code):** whether file paths from
different depots ever collide when merged into the same `installdir` with *different* content
(base game vs. a DLC depot overwriting a shared file) — the working assumption, grounded in the
fact that the real Steam client performs exactly this merge today without incident, is that
depot file trees are disjoint or byte-identical on overlap. This should be spot-checked against
one real multi-depot game as part of Phase 21 execution, not assumed silently.

### Pattern 4: Bottle depot-download reuses the existing ACF poller unmodified (D-15, MUST-VALIDATE item 3)

**What:** `getBottleSteamappsDir(bottleName)` (`src/backend/storeManagers/steam/bottle.ts:136`)
already resolves to a real macOS directory path — CrossOver's bottle `drive_c` is a plain
directory tree on the host filesystem, not something that requires a Wine process to write into.
GameLib can therefore write depot files and the `.acf` manifest into
`getBottleSteamappsDir(bottleName)` with plain Node `fs` calls, exactly as it already does for
the native path, with **no `runWineCommand`/`tellBottledSteamToInstall` dispatch needed for the
download itself** (that dispatch mechanism, `dispatchToBottledSteam()`, currently exists only to
tell the *bottled Steam client* to run its own `steam://install` — a different mechanism than
depot-download).

**Critical finding — the bottle-scoped ACF poller already works for this, unmodified:**
`readAcfState(appId, 'bottle')` and `startInstallPolling(appId, { source: 'bottle' })`
(`src/backend/storeManagers/steam/library.ts:781`, `:1022`) already scan
`getBottleSteamappsRoot()` for `appmanifest_{appId}.acf` and parse `StateFlags` with the same
bitmask logic used natively — this code was built for the *existing* "dispatch steam://install
into the bottle, then poll" flow (Phase 17), but it has **no dependency on who wrote the
manifest**. Depot-download-into-the-bottle can reuse this poller with zero changes.

**What genuinely needs validation (cannot be confirmed by reading GameLib's code — it depends on
the bottled Windows Steam binary's own internal behavior):** whether the bottled Steam client
notices a manifest that appeared on disk *without* Steam itself having written it, the same way
spike 001 proved native Steam does after a restart. The bottled Steam client is the unmodified
Windows Steam binary running under Wine/CrossOver — its `.acf` adoption logic does not know or
care that it's running under a compatibility layer, which is a strong reason to expect identical
behavior to spike 001. But this is inference from "same binary, different host OS," not a
direct test. **Recommendation:** run spike 001's exact procedure a second time, but with the
target being the bottled Steam client instead of native Steam, before D-15 ships. This is a small,
well-scoped validation task (reuse spike 001's script against `getBottleSteamappsDir()` instead
of the native `defaultSteamPath`), not a research gap requiring new investigation.

**Depot selection for the bottle path:** `select.mjs` currently hardcodes `HOST_OS = 'macos'` as
its default `os` filter. Depot-download-into-the-bottle must select the **Windows** depot
(`os: 'windows'`), not the host's native macOS depot, since the bottled Steam client is Windows
Steam. This is a straightforward parameterization of the existing `selectDepots(appinfo, owned,
{ os, ... })` function signature — `os` is already a parameter, just never called with
`'windows'` in the spike.

### Pattern 5: The `1026` handoff as the single recovery mechanism (D-04/D-05/D-07)

**What:** Cancel (D-02), failure (chunk retries exhausted, disk error), and startup-resume
(D-05, replacing the folded-todo's silent auto-drive) should all funnel into the *same* function:
write whatever depot files landed so far, write the `.acf` with `StateFlags = 1026` and an
honest (possibly incomplete) `InstalledDepots` map, and stop. Steam's own verify-repair pass
(proven in spike 001) reconciles whatever is actually on disk against the real manifest.

**Reconciling with Retry (D-06/D-07):** Retry (user clicks "Retry" in the DownloadManager queue)
should simply re-invoke the same `depot.ts` orchestrator from scratch for that appId — since the
partial download's `.acf` already claims `1026` (not `4`), a Retry that overwrites the on-disk
files is not fighting Steam's own state; Steam has not yet had a chance to run its repair pass
(that only happens when the Steam client itself launches/focuses). The two paths are naturally
non-conflicting as CONTEXT.md's D-07 predicts, **provided** the manifest write always happens
last (after files, before returning control), so a Retry started mid-write never races a
partially-written `.acf`.

### Anti-Patterns to Avoid

- **Do not write `StateFlags = 4`** under any circumstance the depot download itself controls.
  Only Steam's own verify pass should ever set bit 4 — writing it prematurely asserts a
  byte-perfect download GameLib cannot actually guarantee (architecture note, `.planning/notes/
  steam-depot-install-architecture.md`).
- **Do not use `@node-steam/vdf.stringify()`** to serialize the new manifest (see Pitfall 1).
- **Do not buffer whole files in RAM** before writing (see Pattern 2) — this is fine for the
  small games spike 002 tested but is the literal blocker CONTEXT.md flags for 50GB+ titles.
- **Do not call `tellBottledSteamToInstall()`** for the D-15 depot-download-into-bottle path —
  that function dispatches a `steam://install` *into* the bottle (the old mechanism); the new
  mechanism writes files directly to the bottle's filesystem and never needs to run anything
  inside Wine for the download step itself.
- **Do not let `scanDownloadingAppIds()`/`startInstallPolling()` silently re-drive Steam or
  CrossOver on startup** (the folded todo, resolved by D-05) — startup resume must finalize to
  `1026` and stop, never auto-launch anything.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Steam CM authentication, PICS product info, depot decryption key retrieval, content-server discovery | A custom Steam network protocol client | `steam-user`'s existing primitives (`getProductInfo`, `getDepotDecryptionKey`, `getContentServers`, `getRawManifest`) | These are exactly the parts of `steam-user` that spike 002 proved work correctly — "the hard parts, which are also the parts we'd least want to reimplement" (spike 002 finding) |
| LZMA decompression of Steam's `VZ` container | A custom LZMA decoder | the `lzma` npm package (pure JS) fed a reconstructed `lzma_alone` header (spike's `decompressChunk`) | Spike 002 already solved the exact header-reconstruction quirk (`outputSize` at `len-6` not `len-4`); the LZMA algorithm itself should never be reimplemented — only the small container-format shim around it |
| Depot ownership / selection logic | A PICS-alone or heuristic depot picker | `selectAllDepots()`/`selectDepots()` from spike 001 (`.planning/spikes/001-acf-adoption/select.mjs`) | Verified 11/11 against real installs; PICS-alone selection was empirically INVALIDATED (passed 1/11, failed 10/11) — this is not a place to improvise a "simpler" rule |
| VDF/KeyValue parsing (read side) | A custom VDF parser | `@node-steam/vdf`'s `parse()` | Already the project's established parser for `libraryfolders.vdf`/`.acf`/`toolmanifest.vdf`; safe for every field the codebase currently reads (none are 64-bit) |
| VDF/KeyValue serialization for the NEW manifest write (write side) | *(exception to the row above)* Using `@node-steam/vdf`'s `stringify()` | A minimal hand-templated ACF string writer (following spike 001's exact field list/casing) | This is the one place hand-rolling is CORRECT — see Pitfall 1. `stringify()`'s internal number handling for 64-bit `InstalledDepots` GIDs is unverified and risky; string-templating keeps every 64-bit value untouched |
| Retry/backoff across flaky CDN edges | Ad-hoc retry logic | The exact pattern already proven in `steam-depot.mjs`'s `fetchChunk()` (4 attempts, exponential 200/400/800ms backoff, rotating to a *different* content server each attempt) | ~16% of chunks fail without this at concurrency 8 (spike 002 measurement) — this is empirically tuned, not a guess |

**Key insight:** Nearly everything genuinely hard about a Steam depot downloader (protocol,
crypto, manifest format, retry tuning, depot selection) has already been built and verified by
the two spikes. The phase's actual new-code surface is small: wire the proven primitives into
GameLib's existing DownloadManager/ACF-poller infrastructure, and fix the one architectural gap
(RAM buffering) the spikes flagged but didn't need to solve at their test scale.

## Common Pitfalls

### Pitfall 1: Writing the manifest via `@node-steam/vdf.stringify()` silently corrupts 64-bit depot GIDs
**What goes wrong:** The written `.acf`'s `InstalledDepots` map contains 64-bit manifest GIDs
(e.g. depot manifest IDs like `...854`). If serialized through `@node-steam/vdf.stringify()`,
these risk the same precision loss its `parse()` side is documented to have (spike 001: a real
GID `…854` came back as `…700` after a parse round-trip through this library) — `stringify()`'s
internal number handling has not been separately verified safe, and using it at all reintroduces
the exact class of bug spike 001 discovered.
**Why it happens:** JavaScript `Number` cannot exactly represent integers above
`Number.MAX_SAFE_INTEGER` (2^53−1); 64-bit Steam manifest GIDs and SteamID64s regularly exceed
this. Any code path that turns such a value into a JS `Number` before re-serializing it loses
precision — the string value is fine until something coerces it.
**How to avoid:** Hand-template the manifest text directly (as spike 001's own code already
does — see `manifest: String(gid), // STRING — 64-bit, must never touch a JS Number` in
`select.mjs`). Keep every 64-bit field (`InstalledDepots[depotId].manifest`, any `LastOwner`
SteamID64) as a string from PICS response through to the written file, with zero pass through
`@node-steam/vdf`'s `stringify()` or any other numeric coercion.
**Warning signs:** A written manifest whose depot GID, when compared byte-for-byte against the
PICS-reported GID string, differs in its last few digits — the classic sign of float rounding.

### Pitfall 2: `@node-steam/vdf`'s existing 4 call sites are safe TODAY only because none reads a 64-bit field — this can silently change
**What goes wrong:** Today's `parse()` usage (`utils.ts:getSteamLibraries` — folder paths only;
`library.ts:readAcfState`/`buildBottleInstalledMap` — `StateFlags`, `SizeOnDisk`, `installdir`,
`BytesDownloaded`/`BytesToDownload` only; `launcher.ts` — `toolmanifest.vdf`'s small
`require_tool_appid`) never touches `InstalledDepots` or any 64-bit GID/SteamID64 field, so the
corruption bug has never manifested in production. If a future change (e.g. an idempotency check
like "is this depot's manifest GID already what we intend to write, so we can skip a redundant
write") reads `InstalledDepots` back via the existing `parse()` import, it will silently corrupt
that value the same way spike 001 found.
**Why it happens:** `parse()` is already imported and trusted in this codebase for other fields;
it is easy to assume it's safe for *all* fields of a `.acf` file, not just the ones currently read.
**How to avoid:** Any future code that needs to READ the `InstalledDepots` map back out of a
written manifest (for comparison/idempotency, not general `StateFlags`/`SizeOnDisk` reads, which
remain safe) must extract the GID via a bounded regex/string match, never `@node-steam/vdf.parse()`.
**Warning signs:** Any new `.InstalledDepots` or `.LastOwner` property access anywhere downstream
of a `VDF.parse()`/`parse()` call.

### Pitfall 3: RAM-buffering a whole file before writing breaks at 50GB+ scale (D-14's own consequence)
**What goes wrong:** Spike 002's proven-correct download path (`Buffer.alloc(Number(file.size))`,
fill via `chunk.copy`, single `writeFileSync` at the end) works at 112MB but has no fallback path
under D-14 — GameLib's downloader must handle *every* Steam install, including 50GB+ titles, with
no `steam://install` escape hatch. Naively "just running the spike's code at scale" will OOM or
thrash swap on large single files (some Steam depot files, e.g. video/audio bundles, single-file
pak archives, can be multiple GB).
**Why it happens:** The spike deliberately kept its implementation simple to isolate the
protocol/crypto correctness question — it explicitly flags this as untested ("files are currently
assembled fully in RAM before writing — fine at this size, needs streaming for large files").
**How to avoid:** Apply Pattern 2 (positional `fs.write` to an open file descriptor) universally,
not conditionally on file size — there's no reason to maintain two code paths.
**Warning signs:** Memory profiling during a large-game download shows RSS scaling with the
largest single file in the depot rather than staying bounded by concurrency × chunk size.

### Pitfall 4: Silent startup auto-drive of Steam/CrossOver (the folded todo, resolved by D-05 — but easy to regress)
**What goes wrong:** `SteamLibraryManager.init()` → `scanDownloadingAppIds()` →
`startInstallPolling(appId)` (native, no `source` override) already resumes ACF polling for any
in-progress install found on disk at startup (`library.ts:83-121`). Prior to Phase 21, this was
harmless for the native `steam://install` path (polling doesn't *drive* anything, it just
watches). But if a naive Phase 21 implementation makes `startInstallPolling` (or a new startup
hook) *resume the depot download itself* rather than finalize-to-`1026`-and-stop, it silently
re-triggers network activity and, for a bottle-eligible game, could re-trigger a Wine dispatch —
exactly the behavior D-05 was written to forbid ("never silently auto-drive Steam /
Steam-in-CrossOver").
**Why it happens:** The existing `init()` code already has a "resume polling on startup" pattern;
it is a natural (but wrong) extension to think "resume the *download* too."
**How to avoid:** Startup resume must call the SAME write-`1026`-and-stop function used for
cancel/failure (Pattern 5), never re-invoke the depot download orchestrator itself. The existing
ACF poller (which only *watches*, never drives) is correctly reused for the *subsequent* state —
after startup has finalized the partial into `1026`, watching for Steam's own repair pass to flip
it to `4` is exactly what the poller already does with zero changes.
**Warning signs:** A killed-mid-download GameLib process, when restarted, resumes network
activity for that appId without any user action.

### Pitfall 5: `steam-user`'s internal module import path (`steam-user/components/content_manifest.js`) is undocumented and version-fragile
**What goes wrong:** Spike 002's `download.mjs` imports `steam-user/components/content_manifest.js`
directly (a non-exported internal module path) purely to reuse its `ContentManifest.parse()`
protobuf-decoding step — a legitimate need, since `getRawManifest()` returns raw protobuf bytes
that must be parsed into the file/chunk list before GameLib's own decrypt/decompress logic can
run. This is not part of `steam-user`'s public API surface and could silently break or move on a
future `steam-user` version bump with no semver signal (internal paths aren't covered by semver).
**Why it happens:** `steam-user` does not expose a public function to parse a raw manifest buffer
into structured file/chunk data — only the (broken) `getManifest()` convenience wrapper does this
internally, which is exactly the piece spike 002 found unusable.
**How to avoid:** Pin the exact `steam-user` version this integration is built and tested
against; add a smoke test that fails loudly (not silently) if `content_manifest.js`'s export
shape changes on an upgrade. Treat any `steam-user` version bump as requiring a re-run of the
manifest-parsing path against a real depot before merging.
**Warning signs:** A `steam-user` dependency bump in a future PR with no corresponding re-test of
the depot-download path.

## Code Examples

Verified patterns lifted directly from the two validated spikes (all HIGH confidence — these are
the exact functions that produced 171/171 byte-identical files and a working `.acf` adoption on
a real machine):

### Depot chunk fetch, decrypt, decompress, verify (spike 002, unmodified)
```typescript
// Source: .planning/spikes/002-steam-user-depot-download/steam-depot.mjs
// This is the ~100-line reimplementation of steam-user's two broken convenience
// helpers. Lift essentially verbatim into src/backend/storeManagers/steam/depot/.
export function steamDecrypt(ciphertext: Buffer, key: Buffer): Buffer {
  const ivDec = createDecipheriv('aes-256-ecb', key, null)
  ivDec.setAutoPadding(false)
  const iv = Buffer.concat([ivDec.update(ciphertext.subarray(0, 16)), ivDec.final()])
  const dec = createDecipheriv('aes-256-cbc', key, iv)
  dec.setAutoPadding(false)
  const plain = Buffer.concat([dec.update(ciphertext.subarray(16)), dec.final()])
  const pad = plain[plain.length - 1]
  const padOk = pad >= 1 && pad <= 16 &&
    plain.subarray(plain.length - pad).every((b) => b === pad)
  return padOk ? plain.subarray(0, plain.length - pad) : plain
}

// Retries across DIFFERENT content servers — mandatory, ~16% of chunks fail without it.
export async function fetchChunk(hosts, depotId, chunk, key, lzma, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const host = hosts[((chunk.attemptSeed ?? 0) + i) % hosts.length]
    try {
      const res = await fetch(`https://${host}/depot/${depotId}/chunk/${sha}`)
      if (!res.ok) throw new Error(`CDN ${res.status}`)
      const decrypted = steamDecrypt(Buffer.from(await res.arrayBuffer()), key)
      const data = await decompressChunk(decrypted, lzma)
      if (sha1(data) !== sha) throw new Error('chunk sha1 mismatch')
      return data
    } catch (err) {
      if (i < attempts - 1) await sleep(200 * 2 ** i)  // 200/400/800ms
    }
  }
  throw new Error(`chunk failed after ${attempts} attempts`)
}
```

### The `.acf` StateFlags=1026 write (spike 001 field list — HIGH confidence, reproduced Steam's own file exactly)
```
// Source: .planning/notes/steam-depot-install-architecture.md (field list from spike 001)
"AppState"
{
  "appid"          "264160"
  "Universe"       "1"
  "StateFlags"     "1026"
  "installdir"     "WazHack"
  "name"           "..."
  "LastUpdated"    "..."
  "SizeOnDisk"     "..."          // measured real bytes on disk, NOT a manifest-derived sum
  "buildid"        "..."          // free — Steam recomputes on verify
  "LastOwner"      "..."          // SteamID64 — STRING, never a JS Number
  "BytesToDownload" "0"           // free — Steam recomputes
  "BytesDownloaded" "0"           // free — Steam recomputes
  "AutoUpdateBehavior" "0"
  "InstalledDepots"
  {
    "<depotId>"
    {
      "manifest" "<64-bit gid, STRING>"
      "size"     "<bytes>"
    }
    // one entry PER downloaded depot (Pattern 3 — multi-depot)
  }
  "UserConfig" {}
  "MountedDepots" {}
}
```
Minimum required fields for Steam to adopt: `appid`, `Universe` (=1), `StateFlags`, `installdir`.
`Bytes*`/`buildid`/`DownloadType`/`TargetBuildID` are all free — Steam recomputes them during its
verify pass. `casing is exact and mixed` (`universe`/`lastupdated` lowercase, `SizeOnDisk`/
`StateFlags` cased) — reproduce byte-for-byte per spike 001's finding.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `steam://install/{appId}` handoff — opaque, no progress, no error surface, no control | In-process depot download via `steam-user`'s authenticated CM connection, `.acf` adoption trick | Phase 21 (this phase) | Real progress/speed/ETA in the shared DownloadManager queue (matches every other store); actionable errors + Retry; Steam remains the launch/DRM/update authority throughout |
| `getSteamInstallSize()`'s `pc_requirements.minimum` HTML-scrape estimate (D-04 of Phase 6, "?? MB" fallback) | Real total bytes summed from the depot manifest(s) at enqueue time | D-03 (this phase) | The DownloadManager queue size stops being an estimate for Steam, matching LIB-06's original "no more `?? MB`" intent, now Steam-specific too |
| `tellBottledSteamToInstall()` — dispatches `steam://install` INTO the bottle via `runWineCommand`, letting bottled Steam do its own opaque download | Depot-download directly into the bottle's `steamapps/` filesystem path, same mechanism as native (D-15) | D-15 (this phase) | Unifies the install mechanism across native and bottle installs; the existing Wine-dispatch path is retained ONLY for guided setup (D-10)/launch/uninstall verbs, not for install |

**Deprecated/outdated:**
- `steam-user`'s `getManifest()` and `downloadChunk()`/`downloadFile()` convenience wrappers are
  broken against current Steam protocol behavior (confirmed by spike 002, filed against
  `content_manifest.js:92`'s padding-stripping bug and an "Illegal starting byte" ByteBuffer
  error respectively) — do not use them even though they remain part of the package's public API.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Positional `fs.write(fd, chunk, offset)` streaming, replacing spike 002's RAM-buffered `Buffer.alloc`+`writeFileSync`, is the correct fix for the memory-bound problem at 50GB+ scale | Pattern 2 | Node `fs` mechanics are HIGH confidence (well-documented), but this exact integration into the depot-download pipeline has never been run against a real large depot — if wrong, large-game installs could still OOM or produce corrupted files if positional writes interact badly with sparse-file allocation on a given filesystem/OS. **Mitigation:** validate against one real 10GB+ depot before shipping. |
| A2 | Multi-depot files from different depots never collide with conflicting content when merged into the same `common/{installdir}` | Pattern 3 | If two depots ship different bytes at the same relative path, "last write wins" silently corrupts the install and Steam's own verify pass may or may not catch it depending on which depot it re-checks last. **Mitigation:** spot-check one real multi-depot game's file lists for overlap before trusting this at scale. |
| A3 | The bottled (Windows, under Wine/CrossOver) Steam client adopts a hand-written `1026` manifest identically to native Steam, because it is the same unmodified binary | Pattern 4 | If bottled Steam's `.acf` adoption behaves differently under Wine (e.g. path translation edge cases, or CrossOver's own registry/filesystem virtualization interferes), D-15 could silently fail — files present, manifest present, but Steam never runs the verify-repair pass or never launches the game. **Mitigation:** re-run spike 001's exact procedure against the bottle before D-15 ships (explicitly recommended in Pattern 4, not yet done). |
| A4 | `@node-steam/vdf`'s `stringify()` has the same 64-bit precision risk as its `parse()` (only `parse()`'s bug was actually demonstrated by spike 001) | Pitfall 1 | If `stringify()` is actually safe (e.g. it special-cases strings and never coerces to `Number`), avoiding it costs nothing but a small amount of extra hand-templating code — low downside either way, so this assumption is conservative rather than risky. |
| A5 | A missing/never-launched Steam client scenario ("Steam installed but no `libraryfolders.vdf` yet," D-11) is best handled by prompting the user to launch Steam once, rather than GameLib synthesizing the file | User Constraints — D-11 (Claude's discretion, explicitly not re-litigated by this research) | If a fresh Steam install actually does NOT reliably create `libraryfolders.vdf` on first launch either, the prompt-once flow could loop. **Mitigation:** CONTEXT.md already flags this as planning's call; this research did not find independent evidence either way (not investigated — see Open Questions). |

## Open Questions

1. **Does `getSteamLibraries()`'s fallback (`['/usr/share/steam']`, then merging `libraryfolders.vdf` folders) already gate correctly on the bottle scenario, or does the bottle need its own separate "not-yet-ready" detection distinct from D-11's native case?**
   - What we know: `getBottleSteamappsDir()` is a completely separate resolver from
     `getSteamLibraries()` and doesn't depend on `libraryfolders.vdf` at all — it resolves via
     `resolveBottleSteamRoot()`'s `existsSync` probes against known CrossOver path segments.
   - What's unclear: whether D-11's "prompt to launch Steam once" UX applies identically to the
     bottle case, or whether the bottle case has a cleaner signal (`isBottleReady()` already
     exists and is stricter — conf + steam.exe existence).
   - Recommendation: planning should treat native (D-11) and bottle readiness as two genuinely
     separate gates — the bottle already has a battle-tested `isBottleReady()` predicate from
     Phase 17; reuse it rather than inventing a parallel check.

2. **What does a Steam depot's actual chunk size distribution look like across real games, for tuning `CONCURRENCY` and the Pattern 2 memory-bound math?**
   - What we know: spike 002's WazHack test used `CONCURRENCY=8` file-level parallelism (not
     chunk-level within a file) and saw ~16% chunk failure without retry; chunk sizes were not
     explicitly measured/reported in the spike.
   - What's unclear: whether Steam depot chunks are consistently sub-1MB (the commonly-cited
     figure from community DepotDownloader documentation) across all games, or whether some
     depots use larger chunk sizes that would change the Pattern 2 memory-bound estimate.
   - Recommendation: log actual chunk sizes during the first real integration test; tune
     concurrency/memory-bound documentation from measured data rather than the community-sourced
     estimate this research relied on.

3. **What is the actual behavior of a confirmed hard-DRM title (Denuvo/VMProtect) launched after a GameLib-owned depot install?**
   - What we know: spike 001's WazHack was not confirmed hard-DRM-wrapped; the *mechanism*
     (files + `1026` manifest → Steam adopts → `steam://rungameid` launches) is proven for a
     non-hard-DRM title.
   - What's unclear: whether any DRM-specific check (e.g. a DRM wrapper verifying its own
     embedded checksum against what it expects from a "real" Steam-downloaded install) could
     behave differently for a GameLib-downloaded-then-Steam-adopted file set versus a
     Steam-downloaded one — the bytes should be identical (spike 002 proved byte-identical
     downloads), which is the strongest evidence this will be fine, but "should be identical" is
     not the same as "confirmed against a real DRM title."
   - Recommendation: this is the one MUST-VALIDATE item that is genuinely empirical and cannot be
     resolved by further code reading — schedule a real-machine test against an owned hard-DRM
     title (e.g. a title known to use Denuvo) before general release, as CONTEXT.md already flags.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `steam-user` (npm) | Depot manifest fetch, CM connection | Yes (project dependency) | `^5.3.0` | none needed — already installed |
| `@node-steam/vdf` (npm) | Read-side manifest/VDF parsing | Yes (project dependency) | `^2.2.0` | none needed — already installed |
| `lzma` (npm) | Pure-JS chunk decompression | Not yet installed — new dependency this phase | `2.3.2` (latest, verified) | `lzma-native` remains available as a later opt-in speed path if pure-JS throughput proves insufficient |
| Node built-in `crypto`/`fs`/`AbortController` | Decrypt, streaming writes, cancel | Yes (Node runtime, Electron main process) | matches project's pinned Electron/Node version | none needed |
| Real Steam client (native) | `.acf` adoption, launch, verify-repair | Assumed present per D-10's guided-install fallback when absent | n/a (external app) | D-10 guided install/link-out when missing |
| Real bottled Windows Steam client (CrossOver/Wine) | D-15 bottle adoption | Provisioned via Phase 17's existing guided setup; gated by `isBottleReady()` | n/a (external app inside bottle) | Phase 17's existing guided-setup flow when bottle not ready |
| A real, currently-authenticated Steam CM connection | Every depot download | Depends on runtime login state (Phase 1 auth), not a build-time dependency | n/a | Existing `SteamUser.ensureConnected()` gate already used by `refresh()`; depot download should gate identically |

**Missing dependencies with no fallback:** none — `lzma` is the only net-new package and it has no
external service dependency (pure computation).

**Missing dependencies with fallback:** `lzma-native` remains an available (but not required)
faster alternative if pure-JS throughput proves insufficient in practice; the native Steam client
and bottled Steam client both have existing GameLib-owned guided-install/setup fallbacks (D-10,
Phase 17) for the "not installed" case.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (`ts-jest` preset), per `jest.config.js` |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js` (projects: `src/backend`, `src/frontend`, `meta`) |
| Quick run command | `npx jest src/backend/storeManagers/steam --silent` |
| Full suite command | `npm run test:ci` (`jest --runInBand --silent`) |

### Phase Requirement → Test Map

Since Phase 21 requirement IDs are not yet minted (see `<phase_requirements>`), this maps to the
locked Decisions directly — the planner should mint requirement IDs 1:1 (or close to it) with
these rows.

| Decision(s) | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01/D-03 | Steam install enqueues into DownloadManager with real total bytes, emits `progressUpdate` in the shared `InstallProgress` shape | unit | `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -x` | ❌ Wave 0 — new file |
| D-02 | Cancel mid-download aborts the chunk loop and triggers the D-04 write-1026 path | unit | `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -t cancel -x` | ❌ Wave 0 |
| D-04/D-05/D-06/D-07 | Failed/cancelled/startup-interrupted downloads all converge on a single `1026`-write function; Retry re-invokes the orchestrator without racing the manifest write | unit | `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -t recovery -x` | ❌ Wave 0 |
| D-08/D-09 | Install-location resolution defaults to Steam's primary library and offers an override picker when multiple exist | unit + manual UAT (frontend picker) | `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -t location -x` | ❌ Wave 0 |
| D-10/D-11 | Guided Steam-client install triggers when Steam/`libraryfolders.vdf` is absent | unit (backend orchestration) + manual UAT (installer download+run is inherently manual-only) | `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -t guided-setup -x` | ❌ Wave 0 |
| D-12/D-13/D-14 | Opt-in setting gates the branch point in `SteamGame.install()`; OFF preserves today's `steam://install` byte-for-byte | unit (existing `games.test.ts` pattern extended) | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -x` | ✅ file exists, needs new cases |
| D-15 (native manifest, hand-written) | `.acf` adoption itself (StateFlags 1026→4, zero re-download, launch) | manual-only, real-machine (spike 001's own procedure) | n/a — this is inherently a real-Steam-client test, not automatable in CI | N/A |
| D-15 (bottle manifest adoption) | Bottled Windows Steam adopts a hand-written manifest the same way native does | manual-only, real-machine (Assumption A3's recommended re-run of spike 001 against the bottle) | n/a | N/A |
| MUST-VALIDATE: streaming-to-disk | A large (10GB+) real depot downloads with bounded memory and produces a byte-correct file | manual-only, real-machine (memory profiling against a real large game) | n/a | N/A |
| MUST-VALIDATE: multi-depot | A real multi-depot game (e.g. Wasteland 3) downloads all depots with no file collisions and a correct summed total | manual-only, real-machine | n/a | N/A |
| MUST-VALIDATE: hard-DRM | A confirmed hard-DRM title launches after a GameLib-owned install | manual-only, real-machine (Open Question 3) | n/a | N/A |
| 64-bit VDF audit (Pitfall 1/2) | The written manifest's `InstalledDepots` GID string survives round-trip unchanged | unit (string equality assertion, no VDF library involved) | `npx jest src/backend/storeManagers/steam/__tests__/manifest.test.ts -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest src/backend/storeManagers/steam --silent`
- **Per wave merge:** `npm run test:ci`
- **Phase gate:** Full suite green before `/gsd:verify-work`, PLUS the manual-only real-machine
  rows above (bottle adoption, streaming-to-disk at scale, multi-depot, hard-DRM) — none of these
  are automatable in CI and must be tracked as explicit UAT checkpoints, not silently skipped.

### Wave 0 Gaps
- [ ] `src/backend/storeManagers/steam/__tests__/depot.test.ts` — covers D-01 through D-11 orchestration logic (mock the CM connection / chunk fetch, as spike 002's own manual tests did not need to since they ran against a live Steam session)
- [ ] `src/backend/storeManagers/steam/__tests__/manifest.test.ts` — covers the hand-templated ACF writer, specifically the 64-bit string-preservation invariant (Pitfall 1/2)
- [ ] Extend existing `src/backend/storeManagers/steam/__tests__/games.test.ts` — D-13 opt-in branch point, D-02 `stop()` behavior change from no-op to real abort
- [ ] Extend existing `src/backend/storeManagers/steam/__tests__/library.test.ts` — confirm `readAcfState`/`startInstallPolling`/`scanDownloadingAppIds` require NO changes for D-05/D-15 reuse (regression-guard the "already works unmodified" claims in Pattern 4/Pitfall 4)
- [ ] Framework install: none — Jest/ts-jest already configured project-wide

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new surface) — reuses Phase 1's existing `steam-user` CM auth session unchanged; no new credential handling introduced | n/a |
| V3 Session Management | No — same reasoning; `SteamUser.ensureConnected()` gate is reused as-is | n/a |
| V4 Access Control | Marginal — appId validation is the relevant control (see below) | numeric-appId guard, extended from the existing `buildSteamProtocolUrl`/`dispatchToBottledSteam` pattern (`/^\d+$/` regex) |
| V5 Input Validation | Yes — depot IDs, manifest GIDs, filenames, bottle names, and appIds all flow from network responses or user-adjacent config into filesystem paths and shell-adjacent dispatch | bounded regex/numeric guards at every chokepoint (see Threat Patterns below) |
| V6 Cryptography | Yes — AES-256-ECB/CBC decrypt and SHA1 verification are performed, but these are *consuming* Valve's own DRM/CDN protocol (decrypting content the user already owns), not protecting GameLib's own secrets | Node built-in `crypto` only — never hand-roll AES/SHA1; already the case in the spike code |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via a maliciously/corruptly-decrypted filename (`decryptFilename()` returning `../../etc/passwd`-shaped content from a compromised or spoofed CDN response) | Tampering | Every file write must resolve the destination path and verify it stays within the target `steamapps/common/{installdir}` root before writing — the existing codebase's `resolve`+`relative`+containment-check pattern is already established (per user memory: "path.join is not containment (use resolve+relative)" — a lesson from Phase 18). Apply the same pattern here for every per-file write target derived from a decrypted filename. |
| appId/depotId injection into constructed URLs or dispatch commands | Tampering / Injection | Extend the existing `buildSteamProtocolUrl`'s `/^\d+$/` numeric guard (T-03-01) and `dispatchToBottledSteam`'s identical guard (T-17-04) to every new appId/depotId touchpoint in `depot.ts` — this is a direct precedent already enforced twice in this codebase, apply it a third time rather than trusting PICS-returned IDs are always well-formed |
| Corrupted/truncated `.acf` write leaving the game's Steam-registered state ambiguous (e.g. a crash mid-write) | Tampering / Denial of Service | Write to a temp file in the same directory, then atomic-rename over the final `appmanifest_{appId}.acf` — standard "never leave a half-written manifest" pattern. Neither spike tested this failure mode explicitly; it should be a planned task, not an afterthought. |
| Chunk SHA1 mismatch or file SHA1 mismatch (CDN serving corrupted/tampered content) | Tampering | Already verified at two levels in the spike (`fetchChunk`'s per-chunk SHA1 check, `download.mjs`'s whole-file `sha_content` check) — preserve both checks in the real build; do not skip the whole-file check for performance, since chunk-level checks alone don't catch offset-placement bugs |
| `@node-steam/vdf.stringify()` numeric coercion silently corrupting a 64-bit `InstalledDepots` GID, causing Steam to reject/mismatch the manifest and force a redundant re-download (not a security vuln per se, but a correctness/DoS-adjacent failure mode) | Tampering (of GameLib's own written state, not attacker-controlled) | See Pitfall 1 — hand-template instead |
| Bottle name / install path used in `runWineCommand`'s `commandParts` array | Injection | Already mitigated by the existing `sanitizeBottleName()` guard (T-17-01) in `bottle.ts` — no new work needed for D-15 as long as `depot.ts` reuses `getBottleSteamappsDir()`/`getBottleDir()` rather than constructing bottle paths independently |

## Sources

### Primary (HIGH confidence)
- `.planning/spikes/001-acf-adoption/select.mjs` — verified depot-selection rule (11/11 real installs), read directly
- `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs` — verified depot download primitives, read directly
- `.planning/spikes/002-steam-user-depot-download/download.mjs` — verified end-to-end orchestration (171/171 byte-identical), read directly
- `.planning/spikes/002-steam-user-depot-download/README.md` — spike 002's own findings write-up, read directly
- `.planning/spikes/MANIFEST.md` — the 9 locked non-negotiable requirements, read directly
- `.planning/notes/steam-depot-install-architecture.md` — the ADR (D-1, D-2, StateFlags trick, Option A/B decision), read directly
- `.planning/research/questions.md` (Q3/Q4/Q5) — read directly, all three answered
- `.planning/phases/21-steam-native-install/21-CONTEXT.md` — locked D-01..D-15 decisions, read directly
- Codebase, read directly (via graphify orientation then targeted reads): `src/backend/storeManagers/steam/games.ts` (`install()` L527, `buildSteamProtocolUrl()` L50, `isBottleEligible()` L612, `stop()` L890), `src/backend/storeManagers/steam/library.ts` (`init()` L83, `readAcfState()` L781, `pollInstallOnce()` L907, `startInstallPolling()` L1022, `scanDownloadingAppIds()` L1302, `buildBottleInstalledMap()` L850), `src/backend/storeManagers/steam/bottle.ts` (`getBottleSteamappsDir()` L136, `dispatchToBottledSteam()` L819, `tellBottledSteamToInstall()` L888, `isBottleReady()` L233), `src/backend/downloadmanager/downloadqueue.ts` (full file), `src/backend/downloadmanager/utils.ts` (full file), `src/common/types.ts` (`InstallProgress`, `DMQueueElement`, `InstallParams`), `src/backend/utils.ts` (`getSteamLibraries()` L536), `src/backend/utils/aborthandler/aborthandler.ts` (`callAbortController` pattern), `src/backend/launcher.ts` (VDF usage L736), `package.json` (installed dependency versions), `node_modules/@node-steam/vdf/lib/index.d.ts` (confirms `stringify` export exists and is unused elsewhere)
- `npm view lzma version` / `npm view lzma repository.url` — registry-verified `2.3.2`, `github.com/nmrugg/LZMA-JS`
- `slopcheck scan --pkg npm lzma --json` — registry-legitimacy tool, returned `"status": "OK"`, `"flags": []`

### Secondary (MEDIUM confidence)
- `CLAUDE.md`'s own Technology Stack section (already-recorded prior research from an earlier phase) — cross-referenced for `steam-user`/`steam-session` version provenance, not independently re-verified in this session
- `npm view lzma-native version` — checked for comparison purposes only (not a phase dependency), confirms `8.0.6` last published 2022-06-19

### Tertiary (LOW confidence)
- Steam depot chunk size distribution (~1MB, cited in Open Question 2) — community-sourced estimate from general DepotDownloader documentation knowledge, NOT independently verified in this session against a real Steam depot's actual chunk metadata; flagged explicitly for validation
- Whether a fresh/never-launched Steam install reliably creates `libraryfolders.vdf` on first run (D-11 edge) — not investigated in this session; CONTEXT.md already scopes this as planning's discretionary call, not a blocking research gap

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package is either already an audited project dependency or (for `lzma`) freshly registry-verified and slopcheck-clean
- Architecture: HIGH for the core mechanism (two real-machine spikes), MEDIUM for the five MUST-VALIDATE extensions (streaming, multi-depot, bottle adoption, hard-DRM, 64-bit audit) — each has a concrete engineering answer in this research but none has its own real-machine spike yet
- Pitfalls: HIGH — all five pitfalls are grounded in either a spike's documented finding or direct reading of the current codebase's exact call sites, not speculation

**Research date:** 2026-07-15
**Valid until:** 30 days (2026-08-14) — the domain (Steam's undocumented depot/manifest protocol) is reverse-engineered community knowledge that could shift with a Steam client update at any time; re-verify the `.acf` adoption behavior (spike 001's core finding) if a significant Steam client version has shipped in the interim before executing this phase.
