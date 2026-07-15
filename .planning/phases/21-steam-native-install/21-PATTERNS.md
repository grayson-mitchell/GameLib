# Phase 21: Steam Native Install - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 14 (6 new, 8 modified/reused)
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/storeManagers/steam/depot.ts` (NEW) | service (download orchestrator) | streaming + file-I/O | `.planning/spikes/002-steam-user-depot-download/download.mjs` (spike orchestration) + `src/backend/storeManagers/legendary/games.ts` `.install()` (L571) | role-match (spike proves the mechanism; legendary shows the DownloadManager-producer shape) |
| `src/backend/storeManagers/steam/depot/crypto.ts` (NEW) | utility (transform) | transform | `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs` `steamDecrypt`/`decryptFilename` | exact (lift near-verbatim, per RESEARCH.md "Don't Hand-Roll") |
| `src/backend/storeManagers/steam/depot/decompress.ts` (NEW) | utility (transform) | transform | `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs` `decompressChunk` | exact (lift near-verbatim) |
| `src/backend/storeManagers/steam/depot/manifest.ts` (NEW) | utility (file-I/O, ACF writer) | file-I/O | `.planning/notes/steam-depot-install-architecture.md` field list (spike 001) + `src/backend/storeManagers/steam/library.ts` `readAcfState()` (L781, read-side sibling) | role-match (write-side has no existing analog in the codebase — hand-templated string builder is itself the pattern, see Pitfall 1) |
| `src/backend/storeManagers/steam/games.ts` (MODIFIED — `install()` L527, `stop()` L890) | controller/service (branch point) | request-response | itself (existing `install()`/`stop()`/`uninstall()` branch-on-bottle-eligibility pattern, L527-836) | exact (extend the same file's own established pattern) |
| `src/backend/storeManagers/steam/library.ts` (MODIFIED — `init()` L83, `scanDownloadingAppIds()` L1302, `startInstallPolling()` L1022) | service (poller / recovery) | event-driven (poll loop) | itself (existing `AcfSource`/`PollOptions` native-vs-bottle pattern) | exact — D-05 rewires `init()`'s resume call, no new poller shape needed |
| `src/backend/storeManagers/steam/bottle.ts` (MODIFIED — reuse only, no new dispatch) | service (path resolver) | file-I/O | itself `getBottleSteamappsDir()` (L136) | exact — reused unmodified as a write target per D-15 |
| `src/backend/storeManagers/steam/electronStores.ts` (MODIFIED — add D-13 opt-in key) | config | CRUD (key-value) | itself (existing `TypeCheckedStoreBackend`/`CacheStore` pattern) | exact |
| `src/backend/downloadmanager/utils.ts` (POSSIBLY MODIFIED — steam-aware branch, if any) | service (queue producer) | request-response | itself `installQueueElement()` (full file, L19-131) | exact — Steam already has a conditional branch here (size fetch, notify suppression); extend the same `if (runner === 'steam')` style |
| `src/backend/storeManagers/steam/__tests__/depot.test.ts` (NEW) | test | — | `src/backend/storeManagers/steam/__tests__/games.test.ts` (mock-factory header, L1-100) | role-match (same mock-factory conventions: logger, electron, electronStores) |
| `src/backend/storeManagers/steam/__tests__/manifest.test.ts` (NEW) | test | — | `src/backend/storeManagers/steam/__tests__/library.test.ts` (ACF read-side test pattern) | role-match |
| `src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx` (NEW, D-13 toggle — exact name is planner's call) | component (settings toggle) | request-response | `src/frontend/screens/Settings/components/DownloadProtonToSteam.tsx` (full file, 44 lines) | exact — near-identical shape: `useSetting` + `ToggleSwitch` + `InfoIcon`, Steam-related risk-framed copy |
| Install-location override picker (D-09, likely inside `SteamGame`'s install flow or a new modal reusing `DownloadDialog`) | component (path picker) | request-response | `src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx` `PathSelectionBox` usage (L663-720) | role-match — reuse the `PathSelectionBox` UI component directly, not the whole DownloadDialog |
| Guided Steam-client install (D-10) | component + service (consent flow) | request-response | `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` (L1-80+) + backend `provisionBottle()` in `bottle.ts` | role-match — same consent-dialog-then-background-task shape, targeting the native installer instead of CrossOver |

## Pattern Assignments

### `src/backend/storeManagers/steam/depot.ts` (service, streaming/file-I/O)

**Analogs:** `.planning/spikes/002-steam-user-depot-download/download.mjs` (proven end-to-end mechanism) and `src/backend/storeManagers/legendary/games.ts` `.install()` (L571-655, the DownloadManager-producer shape to match).

**Depot selection + manifest fetch pattern** (from `download.mjs` lines 43-59, spike-proven):
```javascript
const info = await client.getProductInfo([APP_ID], [], true)
const appinfo = info.apps[APP_ID].appinfo
const gid = appinfo.depots[DEPOT].manifests.public.gid

const key = await new Promise((res, rej) =>
  client.getDepotDecryptionKey(APP_ID, DEPOT, (e, k) => (e ? rej(e) : res(k)))
)

const ContentManifest = await import('steam-user/components/content_manifest.js')
const raw = await new Promise((res, rej) =>
  client.getRawManifest(APP_ID, DEPOT, gid, 'public', (e, m) => (e ? rej(e) : res(m)))
)
const manifest = (ContentManifest.default ?? ContentManifest).parse(raw)

// Decrypt filenames OURSELVES — steam-user truncates them.
for (const f of manifest.files) f.filename = decryptFilename(f.filename, key)
```
Multi-depot (D-14/Pattern 3 in RESEARCH.md) extends this to `selectAllDepots()` (spike 001, see below) and runs this fetch once per depot, summing `totalBytes` across all of them.

**Streaming write pattern — MUST replace `download.mjs`'s RAM-buffered `Buffer.alloc`+`writeFileSync` (lines 96-111 below is what NOT to keep as-is):**
```javascript
// download.mjs's proven-but-RAM-bound version (reference only, do not port unmodified):
const buf = Buffer.alloc(Number(file.size))
for (const chunk of file.chunks) {
  chunk.attemptSeed = i % hosts.length
  const data = await fetchChunk(hosts, DEPOT, chunk, key, lzma)
  data.copy(buf, Number(chunk.offset))
}
writeFileSync(dest, buf)
```
RESEARCH.md Pattern 2 mandates the fix — positional `fs.write` to an open fd instead:
```typescript
// RESEARCH.md Pattern 2 (recommended fix, not yet spike-tested — flag for validation)
import { open, ftruncate } from 'node:fs/promises'
const fd = await open(dest, 'w')
await ftruncate(fd.fd, Number(file.size))
await Promise.all(file.chunks.map(async (chunk) => {
  const data = await fetchChunk(hosts, depotId, chunk, key, lzma)
  await fd.write(data, 0, data.length, Number(chunk.offset))
}))
await close(fd.fd)
```

**Concurrency pattern** (`download.mjs` lines 126-138, proven, keep as-is):
```javascript
const queue = files.map((f, i) => [f, i])
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const [f, i] = queue.shift()
      try {
        await downloadFile(f, i)
      } catch (err) {
        failures.push({ file: f.filename, error: err.message })
      }
    }
  })
)
```

**DownloadManager progress-emit shape to match** (from `src/common/types.ts` L326-334, the `InstallProgress` every runner already speaks):
```typescript
export interface InstallProgress {
  bytes: string
  eta: string
  folder?: string
  percent?: number
  downSpeed?: number
  diskSpeed?: number
  file?: string
}
```
Emit via `sendFrontendMessage('progressUpdate', { appName, runner: 'steam', status: 'installing', progress: {...} })` — this is the exact call already used by `library.ts`'s `pollInstallOnce()` (L944-953, see below) for the bottle-progress case; reuse the same call shape from `depot.ts` for the native in-process download.

**Cancel wiring (D-02)** — must check `AbortController.signal.aborted` in the chunk loop, mirroring the existing `stopCurrentDownload()` → `callAbortController` → `.stop()` path (`src/backend/downloadmanager/downloadqueue.ts` L293-297, unmodified):
```typescript
function stopCurrentDownload() {
  const { appName, runner } = currentElement!.params
  callAbortController(appName)               // src/backend/utils/aborthandler/aborthandler.ts
  libraryManagerMap[runner].getGame(appName).stop(false)
}
```
`SteamGame.stop()` (`games.ts` L890-895, currently a no-op) must become non-no-op for the depot-download path, checking a per-appId abort signal registered at download start via `createAbortController(appId)` (`aborthandler.ts` L5-10).

---

### `src/backend/storeManagers/steam/depot/crypto.ts` (utility, transform)

**Analog:** `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs` lines 27-58 — lift near-verbatim per RESEARCH.md's "Don't Hand-Roll" table ("the algorithm itself should never be reimplemented").

```typescript
// Source: .planning/spikes/002-steam-user-depot-download/steam-depot.mjs:34-58
import { createDecipheriv } from 'node:crypto'

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

export function decryptFilename(b64: string, key: Buffer): string {
  const plain = steamDecrypt(Buffer.from(b64, 'base64'), key)
  const nul = plain.indexOf(0)
  return (nul === -1 ? plain : plain.subarray(0, nul)).toString('utf8')
}
```

**Security note (from RESEARCH.md Security Domain — Threat Patterns table):** every filename this module decrypts is untrusted input from a CDN response. Before this filename is used to build a file-write destination in `depot.ts`, resolve+relative+containment-check against the target `steamapps/common/{installdir}` root (per user memory: "path.join is not containment (use resolve+relative)" — the Phase 18 lesson applies identically here).

---

### `src/backend/storeManagers/steam/depot/decompress.ts` (utility, transform)

**Analog:** `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs` lines 70-104 — lift verbatim (the VZ-container header-reconstruction quirk is empirically solved, not a place to improvise).

```typescript
// Source: .planning/spikes/002-steam-user-depot-download/steam-depot.mjs:70-104
export async function decompressChunk(buf: Buffer, lzma: LzmaModule): Promise<Buffer> {
  const magic = buf.subarray(0, 2).toString('latin1')

  if (magic === 'VZ') {
    if (buf.subarray(-2).toString('latin1') !== 'zv') {
      throw new Error('VZ chunk: bad footer magic')
    }
    const props = buf.subarray(7, 12)
    const payload = buf.subarray(12, buf.length - 10)
    const outSize = buf.readUInt32LE(buf.length - 6)   // note: len-6, not len-4

    const size = Buffer.alloc(8)
    size.writeUInt32LE(outSize, 0)
    const stream = Buffer.concat([props, size, payload])

    return await new Promise((resolve, reject) =>
      lzma.decompress(stream, (result, err) =>
        err ? reject(err) : resolve(Buffer.from(result))
      )
    )
  }

  if (magic === 'PK') {
    const zlib = await import('node:zlib')
    const nameLen = buf.readUInt16LE(26)
    const extraLen = buf.readUInt16LE(28)
    return zlib.inflateRawSync(buf.subarray(30 + nameLen + extraLen))
  }

  throw new Error(`unknown chunk container: ${JSON.stringify(magic)}`)
}

export const sha1 = (buf: Buffer) => createHash('sha1').update(buf).digest('hex')
```

**Retry pattern to co-locate or import alongside** (`steam-depot.mjs` lines 116-145 `fetchChunk` — empirically tuned, ~16% of chunks fail without cross-server retry at concurrency 8):
```typescript
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
      if (i < attempts - 1) await sleep(200 * 2 ** i)  // 200/400/800ms backoff
    }
  }
  throw new Error(`chunk failed after ${attempts} attempts`)
}
```

---

### `src/backend/storeManagers/steam/depot/manifest.ts` (utility, file-I/O — the ACF writer)

**Analog:** No existing write-side analog in the codebase (the project has only ever *read* `.acf` files via `@node-steam/vdf.parse()` — `library.ts` `readAcfState()` L781-839, `buildBottleInstalledMap()` L850-893). This is the one net-new pattern this phase introduces. The field list is spike-verified (RESEARCH.md lines 605-638, reproduced from spike 001).

**Field list to hand-template (StateFlags = 1026, never 4):**
```
"AppState"
{
  "appid"          "264160"
  "Universe"       "1"
  "StateFlags"     "1026"
  "installdir"     "WazHack"
  "name"           "..."
  "LastUpdated"    "..."
  "SizeOnDisk"     "..."          // measured real bytes on disk, NOT manifest-derived
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
    // one entry PER downloaded depot
  }
  "UserConfig" {}
  "MountedDepots" {}
}
```
Minimum required fields for adoption: `appid`, `Universe` (=1), `StateFlags`, `installdir`. Casing is exact and mixed (`universe`/`lastupdated` lowercase in some Steam-authored files, `SizeOnDisk`/`StateFlags` cased) — reproduce byte-for-byte per spike 001's finding, verify against a real Steam-authored `.acf` at implementation time.

**Reference for the string-safety discipline** (spike 001's own selection code — `select.mjs` line 107, the same 64-bit-as-string invariant this module must uphold on write):
```javascript
// Source: .planning/spikes/001-acf-adoption/select.mjs:105-110
out.push({
  id,
  manifest: String(gid), // STRING — 64-bit, must never touch a JS Number
  size: Number(typeof m === 'object' ? (m.size ?? 0) : 0),
  dlcappid: d.dlcappid ? String(d.dlcappid) : undefined
})
```

**Anti-pattern (explicit, per RESEARCH.md Pitfall 1):** do NOT use `@node-steam/vdf`'s `stringify()` — confirmed present in the package but unused anywhere in the codebase today; its 64-bit number handling is unverified and risks the exact GID-rounding bug spike 001 found on the `parse()` side. Hand-template the text directly.

**Atomic-write requirement (RESEARCH.md Security Domain — Threat Patterns table):** write to a temp file in the same directory, then atomic-rename over `appmanifest_{appId}.acf`. Neither spike tested a crash-mid-write; this must be a planned task in the manifest writer, not an afterthought.

---

### `src/backend/storeManagers/steam/games.ts` `install()`/`stop()` (controller/service, request-response — the branch point)

**Analog:** itself — the file's own existing bottle-vs-native branching pattern (D-13's opt-in setting adds a THIRD branch alongside the existing bottle/native split).

**Existing branch structure to extend** (`games.ts` L527-585, full current `install()`):
```typescript
async install(_args: InstallArgs): Promise<InstallResult> {
  await this.ensurePlatformsCaptured()
  if (this.isBottleEligible()) {
    if (!isBottleReady()) {
      sendFrontendMessage('steamBottleSetupRequired', { appName: this.appId })
      return { status: 'done', deferredToSetup: true }
    }
    const result = await tellBottledSteamToInstall(this.appId)
    if (result.status !== 'done') {
      return { status: 'error', error: result.error }
    }
    startInstallPolling(this.appId, { source: 'bottle' })
    return { status: 'done' }
  }

  const url = buildSteamProtocolUrl('install', this.appId)
  if (!url) {
    return { status: 'error', error: `Invalid appId: ${this.appId}` }
  }
  await shell.openExternal(url)
  startInstallPolling(this.appId)
  return { status: 'done' }
}
```
D-13's opt-in setting reads from a new `electronStores.ts` key (pattern below) and, when ON, branches BEFORE the existing bottle-eligibility check into the new `depot.ts` orchestrator (native path) or `depot.ts` writing into `getBottleSteamappsDir()` (bottle path, D-15) — the bottle-eligibility check itself is unchanged, only what happens on each branch changes.

**appId validation chokepoint to reuse** (`games.ts` L50-62, T-03-01 — extend to every new appId/depotId touchpoint in `depot.ts` per RESEARCH.md Security Domain):
```typescript
export function buildSteamProtocolUrl(
  verb: 'rungameid' | 'install' | 'uninstall',
  appId: string
): string | null {
  if (!/^\d+$/.test(appId)) {
    logWarning(`SteamGame: rejected non-numeric appId "${appId}" ...`, LogPrefix.Steam)
    return null
  }
  return `steam://${verb}/${appId}`
}
```

**`stop()` no-op to real-abort conversion** (`games.ts` L890-895, current no-op — must become conditional):
```typescript
// Current (native/bottle steam:// path — Steam owns process lifecycle, stays no-op):
async stop(_stopWine?: boolean): Promise<void> {
  logWarning(`SteamGame.stop: Steam owns process lifecycle for appId ${this.appId}; no-op`, LogPrefix.Steam)
}
// NEW: when a depot-download is in flight for this.appId, stop() must instead
// call callAbortController(this.appId) — mirrors downloadqueue.ts's own call site.
```

---

### `src/backend/storeManagers/steam/library.ts` `init()`/`scanDownloadingAppIds()`/`startInstallPolling()` (service, event-driven poll loop — D-05 startup finalize)

**Analog:** itself — the existing `AcfSource`/`PollOptions` pattern (native vs bottle) is the template for D-05's "finalize to 1026, never auto-drive" rewire.

**Current startup-resume call site to rewire** (`library.ts` L102-121, inside `init()`):
```typescript
try {
  const downloadingIds = await scanDownloadingAppIds()
  for (const appId of downloadingIds) {
    logInfo(`Steam: resuming install poll for appId ${appId} ...`, LogPrefix.Steam)
    startInstallPolling(appId)   // ← D-05: must NOT resume the depot download itself.
                                   //   Must instead call the same write-1026-and-stop
                                   //   function used by cancel/failure (Pattern 5),
                                   //   THEN startInstallPolling to watch for Steam's
                                   //   own repair pass to flip StateFlags to 4.
  }
} catch (err) {
  logWarning(['Steam: scanDownloadingAppIds failed during init, skipping resume:', err], LogPrefix.Steam)
}
```
This is the folded-todo fix (CONTEXT.md "Folded Todos" section) — the poller itself (`pollInstallOnce`, L907-1001) requires ZERO changes; it only ever *watches* `readAcfState()`, never drives anything. Only the `init()` resume call needs the new finalize-then-poll sequencing.

**`AcfSource`/`PollOptions` type pattern to extend if depot.ts needs its own source variant** (`library.ts` L37-46):
```typescript
export type AcfSource = 'native' | 'bottle'
type PollOptions = { intervalMs?: number; source?: AcfSource }
```

**Progress-from-ACF emit shape** (`library.ts` `pollInstallOnce()` L907-955 — the exact `progressUpdate`/`gameStatusUpdate` vocabulary `depot.ts` must ALSO speak, so the DownloadManager UI needs zero changes):
```typescript
sendFrontendMessage('gameStatusUpdate', { appName: appId, runner: 'steam', status: 'installing' })
// ...
sendFrontendMessage('progressUpdate', {
  appName: appId,
  runner: 'steam',
  status: 'installing',
  progress: { percent, bytes: getFileSize(numerator), eta: '' }
})
```

**`readAcfState()` bit-4 StateFlags check** (`library.ts` L816-824 — the exact bitmask logic `manifest.ts`'s `1026` write must be consistent with on the read side, unchanged):
```typescript
const stateFlags = parseInt(state.StateFlags, 10)
if ((stateFlags & 4) !== 0) {
  return { state: 'installed', stateFlags, installPath: ..., sizeOnDisk: state.SizeOnDisk ?? '0' }
}
return { state: 'downloading', stateFlags, bytesDownloaded: ..., bytesToDownload: ... }
```

---

### `src/backend/storeManagers/steam/bottle.ts` (service, file-I/O path resolver — D-15 reuse, no dispatch)

**Analog:** itself — `getBottleSteamappsDir()` (L136-138) is reused as-is; `dispatchToBottledSteam()` (L819-886) and `tellBottledSteamToInstall()` (L888-892) are explicitly NOT called for the depot-download path (only for D-10 guided setup / launch / uninstall verbs).

```typescript
// Source: src/backend/storeManagers/steam/bottle.ts:136-138 — REUSE AS-IS
export function getBottleSteamappsDir(bottleName: string): string {
  return join(resolveBottleSteamRoot(bottleName), 'steamapps')
}
```
`depot.ts`'s D-15 branch writes files and the `.acf` directly here with plain Node `fs` — `getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)` is the exact same resolution `library.ts`'s `getBottleSteamappsRoot()` (L54-56) already uses, so reuse that private helper's pattern (or export it) rather than re-deriving the path independently.

**Depot-selection OS parameter for the bottle path** — `select.mjs`'s `selectDepots(appinfo, owned, { os, ... })` (L66-70) already accepts `os` as a parameter; call it with `os: 'windows'` for D-15 (the bottled client is Windows Steam), never the host's native OS filter.

**`isBottleReady()` reuse for D-11's bottle-side readiness gate** (`bottle.ts` L233-258, unchanged — RESEARCH.md Open Question 1 recommends treating this as the bottle-specific analog of D-11's native "prompt to launch Steam once," reused rather than reinvented):
```typescript
export function isBottleReady(bottleName?: string): boolean {
  const ready = isBottleProvisioned(name) && existsSync(getBottleSteamExePath(name))
  // ... self-heals stored `provisioned` flag on first true observation
  return ready
}
```

**`sanitizeBottleName()` chokepoint** (`bottle.ts` L156-169, T-17-01 — already covers `depot.ts`'s bottle-path construction as long as it reuses `getBottleSteamappsDir()`/`getBottleDir()` rather than building bottle paths independently — no new work needed here per RESEARCH.md Security Domain).

---

### `src/backend/storeManagers/steam/electronStores.ts` (config, D-13 opt-in setting)

**Analog:** itself — the existing `TypeCheckedStoreBackend`/`CacheStore` pattern (full file, 78 lines).

```typescript
// Source: src/backend/storeManagers/steam/electronStores.ts:1-33 — existing pattern
const configStore = new TypeCheckedStoreBackend('steamConfigStore', { cwd: 'steam_store' })
const steamBottleConfigStore = new TypeCheckedStoreBackend('steamBottleConfigStore', { cwd: 'steam_store' })
```
D-13's opt-in toggle should be a simple boolean key on the EXISTING `configStore` (mirrors how `useSetting('downloadProtonToSteam', false)` on the frontend reads/writes a plain GlobalConfig-backed setting — see the frontend component pattern below) rather than a new dedicated store, unless planning determines the setting needs Steam-specific store semantics. `steamBottleConfigStore`'s `get_nodefault`/`set` pattern (seen throughout `bottle.ts`, e.g. L184-190, L233-258) is the concrete read/write idiom to copy if a dedicated key is used instead.

---

### `src/backend/downloadmanager/utils.ts` `installQueueElement()` (service, request-response — queue producer, POSSIBLY unmodified)

**Analog:** itself (full file, 216 lines) — Steam ALREADY has bespoke conditional branches here (fire-and-forget notify suppression, `deferredToSetup` handling). RESEARCH.md's stated design goal is that `depot.ts` slots in "as a peer of legendary/gogdl/nile with zero DownloadManager-side changes" — this file should need NO new runner-specific branch, since `SteamGame.install()` (already called at L93-103) is the actual dispatch point, and `depot.ts`'s progress emits bypass this file entirely (direct `sendFrontendMessage` calls, same as `library.ts`'s poller does today).

```typescript
// Source: src/backend/downloadmanager/utils.ts:73-80, 117-129 — existing Steam-aware branches (reference only)
if (runner !== 'steam') {
  notify({ title, body: i18next.t('notify.install.startInstall', 'Installation Started') })
}
// ...
finally {
  if (runner !== 'steam' || deferredToSetup) {
    sendGameStatusUpdate({ appName, runner, status: 'done' })
  }
}
```
**Caution flagged for planning:** D-06's "actionable error + Retry" UX may require this file to surface `depot.ts`'s richer error classes (vs. today's generic error string) into the DM queue's error display — reconcile against `src/backend/downloadmanager/downloadqueue.ts`'s `addToFinished()`/`processNotification()` (L59-77, L300-355) which currently only branches on the generic `DMStatus` union, not error subtypes.

---

### Settings toggle — D-13 opt-in (component, request-response)

**Analog:** `src/frontend/screens/Settings/components/DownloadProtonToSteam.tsx` (full file, 44 lines) — nearly identical shape needed: a single boolean `useSetting`, gated visibility, risk-framed `InfoIcon` copy.

```typescript
// Source: src/frontend/screens/Settings/components/DownloadProtonToSteam.tsx — full pattern to copy
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import ContextProvider from 'frontend/state/ContextProvider'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const EnableSteamNativeInstall = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const [enableSteamNativeInstall, setEnableSteamNativeInstall] = useSetting(
    'enableSteamNativeInstall', // exact key name is planner's call
    false
  )

  if (!isDefault) return <></>

  return (
    <div className="toggleRow">
      <ToggleSwitch
        title={t('setting.steam-native-install', 'Download Steam games directly in GameLib')}
        htmlId="enable-steam-native-install"
        handleChange={() => setEnableSteamNativeInstall(!enableSteamNativeInstall)}
        value={enableSteamNativeInstall}
      />
      <InfoIcon text={t('help.steam_native_install', '...D-13 risk-framing copy...')} />
    </div>
  )
}
export default EnableSteamNativeInstall
```
`src/frontend/screens/Settings/components/SteamRuntime.tsx` (49 lines) is a second close analog showing the platform-gated variant (`isLinux`/`isWin` checks) — reuse that gating style if D-13's toggle should be OS-conditional (it should not be, per D-12 "all three desktop OSes", but the pattern is available if a platform caveat emerges during planning).

---

### Install-location override picker (D-09) (component, request-response)

**Analog:** `src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx` — reuse the `PathSelectionBox` UI primitive directly (imported from `frontend/components/UI`), not the surrounding DownloadDialog logic.

```typescript
// Source: src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:663-672
<PathSelectionBox
  type="directory"
  onPathChange={setInstallPath}
  path={installPath}
  placeholder={getDefaultInstallPath()}
  pathDialogTitle={t('install.path')}
  pathDialogDefaultPath={getDefaultInstallPath()}
  htmlId="setinstallpath"
  label={t('install.path', 'Select Install Path')}
  noDeleteButton
/>
```
For D-09, the picker's OPTIONS list should be populated from `getSteamLibraries()` (`backend/utils.ts` L536, already existing — enumerates every registered `libraryfolders.vdf` path) rather than a free-text directory browser — the picker should default to Steam's primary library and only render the override UI when `getSteamLibraries().length > 1` (per D-09's "single-library users see no friction").

---

### Guided Steam-client install (D-10) (component + service, request-response — consent flow)

**Analog:** `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` (consent-dialog-then-background-task UI) + backend `provisionBottle()` in `bottle.ts` (L540+, download-installer-then-run pattern).

```typescript
// Source: src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx:1-59 — the consent+phase-machine shape to copy
type Phase = 'consent' | 'provisioning' | 'error'
const SteamBottleSetup = () => {
  const { isOpen, appName, close } = useSteamBottleSetup()
  const [phase, setPhase] = useState<Phase>('consent')
  const [provisionError, setProvisionError] = useState<string>()
  // ... consent Dialog blocks until confirmed, then switches to a non-blocking
  // banner (mirrors HumbleExpiryToast) so it never fights the native installer's
  // own window for focus.
}
```
The backend half (`provisionBottle()`, `bottle.ts` L540+ — not fully read in this pass, but referenced in the file's module header comment L1-15: "fetch SteamSetup.exe once, run it non-silently (D-02)") is the download-and-run-the-official-installer pattern D-10 needs for the NATIVE Steam installer on Win/macOS. `checkWineBeforeLaunch`/`downloadFile`/`spawnAsync` (imported at `bottle.ts` L28-32 from `backend/utils`) are the concrete utilities already used for this "fetch an external installer, run it non-silently" shape.

**Backend signal to reuse for opening the consent UI** (`games.ts` L535-537, already wired for the bottle case — D-10's native case should send an analogous but distinct frontend message):
```typescript
sendFrontendMessage('steamBottleSetupRequired', { appName: this.appId })
// D-10 native-installer-missing case needs its own event, e.g.
// sendFrontendMessage('steamClientSetupRequired', { appName: this.appId })
```

---

## Shared Patterns

### appId/depotId numeric validation (T-03-01 / T-17-04 precedent)
**Source:** `src/backend/storeManagers/steam/games.ts` L50-62 (`buildSteamProtocolUrl`'s `/^\d+$/` guard) and `src/backend/storeManagers/steam/bottle.ts` L806, L823-829 (`dispatchToBottledSteam`'s identical guard).
**Apply to:** Every new appId/depotId touchpoint in `depot.ts`, `manifest.ts`, and any new IPC handler — this is a direct precedent enforced TWICE already in this codebase; apply it a third time. Do not trust PICS-returned IDs are always well-formed.

### AbortController cancel wiring
**Source:** `src/backend/utils/aborthandler/aborthandler.ts` (full file, 44 lines — `createAbortController`/`callAbortController`/`deleteAbortController`) + `src/backend/downloadmanager/downloadqueue.ts` L293-297 (`stopCurrentDownload`).
**Apply to:** `depot.ts`'s chunk-download loop (check `signal.aborted` per-chunk) and `SteamGame.stop()`.

### DownloadManager progress vocabulary (`InstallProgress`)
**Source:** `src/common/types.ts` L326-334 (`InstallProgress`), already consumed identically by `src/backend/storeManagers/steam/library.ts` `pollInstallOnce()` L944-953 and by every other runner via `sendFrontendMessage('progressUpdate', ...)`.
**Apply to:** `depot.ts`'s progress emits — zero DownloadManager/frontend changes needed if this shape is matched exactly.

### `AcfSource` native/bottle duality
**Source:** `src/backend/storeManagers/steam/library.ts` L37-46 (`AcfSource` type, `PollOptions`) — already threaded through `readAcfState()`, `pollInstallOnce()`, `startInstallPolling()`, `buildBottleInstalledMap()`.
**Apply to:** Any new function in `depot.ts`/`manifest.ts` that needs to distinguish a native vs. bottle write target should accept/propagate the same `'native' | 'bottle'` union rather than inventing a new one.

### Path containment for untrusted (decrypted/CDN-sourced) filenames
**Source:** No single codebase file demonstrates this today for Steam specifically, but per user memory ("path.join is not containment (use resolve+relative)" — Phase 18 lesson) and RESEARCH.md's Security Domain Threat Patterns table, every per-file write destination in `depot.ts` derived from `decryptFilename()`'s output MUST be validated via `resolve()`+`relative()` containment-check against the target `steamapps/common/{installdir}` root before the write, not merely `join()`ed.
**Apply to:** `depot.ts`'s per-file write loop.

### 64-bit-as-string discipline (never let a GID/SteamID64 touch a JS `Number`)
**Source:** `.planning/spikes/001-acf-adoption/select.mjs` L105-110 (`manifest: String(gid), // STRING — 64-bit, must never touch a JS Number`).
**Apply to:** `depot.ts` (every depot GID from PICS), `manifest.ts` (every `InstalledDepots[depotId].manifest` and any `LastOwner` field written).

### Settings toggle shape (`useSetting` + `ToggleSwitch` + `InfoIcon`)
**Source:** `src/frontend/screens/Settings/components/DownloadProtonToSteam.tsx` (full file) and `src/frontend/screens/Settings/components/SteamRuntime.tsx` (full file).
**Apply to:** The new D-13 opt-in toggle component.

## No Analog Found

None — every file in the recommended structure has at least a role-match analog. The single genuinely novel piece of code is the ACF *write* side (`manifest.ts`) — the codebase has never written a `.acf` before (only read), so its closest analog is the spike's field-list documentation and the read-side sibling function, not a parallel write-side implementation. This is flagged inline above, not listed as a hard gap, since spike 001 already validates the exact field list and casing to reproduce.

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/`, `src/backend/downloadmanager/`, `src/backend/storeManagers/legendary/`, `src/backend/utils/aborthandler/`, `src/common/types.ts`, `src/frontend/screens/Settings/components/`, `src/frontend/screens/Library/components/InstallModal/`, `src/frontend/screens/Game/GamePage/components/`, `.planning/spikes/001-acf-adoption/`, `.planning/spikes/002-steam-user-depot-download/`
**Files scanned:** ~25 (via graphify orientation queries + targeted reads)
**Pattern extraction date:** 2026-07-15
