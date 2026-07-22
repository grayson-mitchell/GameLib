---
phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
reviewed: 2026-07-22T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/downloadmanager/electronStores.ts
  - src/backend/electron_store.ts
  - src/backend/logger/electronStores.ts
  - src/backend/logger/uploader.ts
  - src/backend/migration/electronStores.ts
  - src/backend/migration/index.ts
  - src/backend/sidecar/__tests__/fileStore.test.ts
  - src/backend/sidecar/__tests__/skeletonFlows.test.ts
  - src/backend/sidecar/__tests__/storeLayer.test.ts
  - src/backend/sidecar/fileStore.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/storeRegistration.ts
  - src/backend/sidecar/storeWriteHandlers.ts
  - src/backend/wine/manager/electronStores.ts
  - src/backend/wine/manager/utils.ts
  - src/common/jest.config.js
  - src/common/types/__tests__/storePolicy.test.ts
  - src/common/types/sidecarTransport.ts
  - src/common/types/storePolicy.ts
  - src/preload/__tests__/tauriTransport.test.ts
  - src/preload/api/misc.ts
  - src/preload/tauriTransport.ts
findings:
  critical: 6
  warning: 12
  info: 5
  total: 23
status: fixed
fixed_at: 2026-07-22
fix_scope: all Critical (CR-01..CR-06) and all Warning (WR-01..WR-12); Info OUT of scope
resolution:
  CR-01: fixed (f72fe92c)
  CR-02: fixed (ffbf44d1)
  CR-03: fixed (bf349afd)
  CR-04: fixed (9a7dd9f3)
  CR-05: fixed (6997c606)
  CR-06: fixed (40823a5b)
  WR-01: fixed (e1a1a10c)
  WR-02: fixed (e1a1a10c)
  WR-03: fixed (653f8992)
  WR-04: fixed (398e9e2d)
  WR-05: fixed (44bf754d)
  WR-06: fixed (44bf754d)
  WR-07: fixed (c12e2cec)
  WR-08: fixed (cf26e09d)
  WR-09: fixed (445704e4)
  WR-10: fixed (040f6443)
  WR-11: fixed (76a29fb3)
  WR-12: fixed (0841a5eb)
  IN-01: open (Info — out of fix scope)
  IN-02: open (Info — out of fix scope)
  IN-03: open (Info — out of fix scope)
  IN-04: open (Info — out of fix scope)
  IN-05: open (Info — out of fix scope)
---

# Phase 29: Code Review Report

**Reviewed:** 2026-07-22
**Depth:** standard
**Files Reviewed:** 23
**Status:** fixed (all 6 Critical + all 12 Warning resolved 2026-07-22; 5 Info left open)

## Resolution Status (2026-07-22)

All Critical and Warning findings were fixed and committed atomically, one commit per
finding (or per tightly-coupled pair). Each fix carries a regression test. Verification
at the end of the pass: `npx jest` 111/111 suites, 2027/2027 tests green;
`npx tsc --noEmit -p tsconfig.json` clean; `npx eslint` introduced no new errors.

| ID | Status | Commit | Note |
|----|--------|--------|------|
| CR-01 | FIXED | `f72fe92c` | `DISALLOWED_KEY_PATH_SEGMENTS`/`isSafeKeyPath` single-sourced in `storePolicy.ts`; guards all three `fileStore` path helpers plus a new write-path guard (c′) |
| CR-02 | FIXED | `ffbf44d1` | own-property lookup + `Array.isArray` belt-and-braces; parametrized test over the whole `Object.prototype` key set |
| CR-03 | FIXED | `bf349afd` | `setAtPath`/`deleteAtPath` added to `tauriTransport`, used by `snapshotSet`/`snapshotDelete` and the `STORE_CHANGED` echo |
| CR-04 | FIXED | `9a7dd9f3` | `accessPropertiesByDotNotation` honoured; URL-key flat-on-disk test |
| CR-05 | FIXED | `6997c606` | `load()` shape validation; parametrized test over `null`/string/number/boolean/array |
| CR-06 | FIXED | `40823a5b` | additive deny-list extension; also made `isSecretStoreKey` total (same CR-02 hazard on the Electron path) |
| WR-01 | FIXED | `e1a1a10c` | guard (a) now tests `RECOGNIZED_CACHE_STORE_NAMES`, not a regex that matched everything |
| WR-02 | FIXED | `e1a1a10c` | `storeNew` restricted to recognized cache stores; junk-file regression test |
| WR-03 | FIXED | `653f8992` | write pair gated + renderer-visible `console.warn` |
| WR-04 | FIXED | `398e9e2d` | `isWritableStoreField` — a subtractive `WRITE_DENIED_FIELDS` overlay on the read allow-list (one list, still fail-closed), excluding `configStore.settings`/`userHome`/`userInfo` and every `*.userData` |
| WR-05 | FIXED | `44bf754d` | best-effort `unlinkSync` in the persist fallback |
| WR-06 | FIXED | `44bf754d` | `0o600` on both writes, `0o700` on `mkdir`; mode re-asserted on every temp+rename |
| WR-07 | FIXED | `c12e2cec` | both hydrate paths replace instead of merging |
| WR-08 | FIXED | `cf26e09d` | first registration wins + stderr diagnostic |
| WR-09 | FIXED | `445704e4` | dead `CACHE_STORE_POLICY` deleted; `DENIED_CACHE_STORES` consulted directly by both resolvers |
| WR-10 | FIXED | `040f6443` | `CACHE_STORE_NAME_PATTERN` single-sourced in `storePolicy.ts` |
| WR-11 | FIXED | `76a29fb3` | resolve+relative containment in `resolveStorePath()`; T-27-03 header rewritten to state the invariant accurately |
| WR-12 | FIXED | `0841a5eb` | guard (c), WR-04 write-denied field, and a legitimate `legendary_library` write now covered (hostile-key and dot-notation cases landed with CR-01/CR-03) |
| IN-01..IN-05 | OPEN | — | Info tier, deliberately out of this fix pass's scope |

Deviation worth flagging: WR-04 was implemented as a subtractive `WRITE_DENIED_FIELDS`
overlay rather than the separate `WRITE_ALLOWLIST` the finding suggested. An unknown
field still fails `isAllowedStoreField` first, so the fail-closed property is preserved
while leaving ONE hand-maintained list instead of two that can drift (which is IN-02's
concern applied to the write side).


## Summary

Phase 29 generalizes the Tauri sidecar store layer: a new fail-closed allow-list
(`storePolicy.ts`), a new single write choke point (`storeWriteHandlers.ts`), a
path-keyed shared cell registry plus atomic persistence in `fileStore.ts`, and
four D-15 store extractions. The allow-list's *field-name* semantics are correct
for the five named secrets, and the secret-redaction tests genuinely exercise the
real handlers. The Electron path is untouched behaviourally, as required.

However the layer has six defects that must be fixed before this ships:

1. **`fileStore.setAtPath()` is prototype-pollutable from renderer-controlled
   keys** — and the library it replaces (`electron-store` → `dot-prop`) explicitly
   guards against exactly this. Verified reachable end-to-end.
2. **`isAllowedStoreField()` is not fail-closed for `Object.prototype`-named store
   names** — it *throws* (verified live) instead of returning `false`.
3. **The renderer snapshot writes dot-notation keys flat but reads them nested**,
   which breaks `configStore.set('games.hidden', …)`, `games.favourites`,
   `games.customCategories` and every frontend `CacheStore` entry (whose
   `__timestamp.${key}` write is a dot-key) for the remainder of the session.
4. **`FileStore` ignores `accessPropertiesByDotNotation: false`**, so
   `uploadedLogs` (keys are URLs) is written in a different on-disk shape than the
   Electron build produces, and `getUploadedLogFiles()` then yields `NaN` expiry.
5. **`FileStore.load()` can return a non-object**, defeating the documented
   "corrupt file never fatal" guarantee.
6. Two pre-existing renderer↔credential gaps in `src/preload/api/misc.ts` that this
   phase's own research identified and consciously left open in the *shipping*
   build.

The write path also has a dead guard, an unfiltered optimistic-write path, and no
test coverage at all for guard (c) or for hostile keys.

---

## Critical Issues

### CR-01: Prototype pollution in `FileStore.setAtPath()`, reachable from a renderer `storeSet`

**File:** `src/backend/sidecar/fileStore.ts:110-126` (also `deleteAtPath`, 128-137)
**Issue:** `setAtPath()` walks `key.split('.')` and assigns without rejecting
`__proto__` / `constructor` / `prototype` segments. `electron-store` — the module
`FileStore` replaces — delegates to `dot-prop`, which *does* reject them
(`node_modules/dot-prop/index.js:4-10`, `disallowedKeys`). Replacing the library
therefore reintroduced a vulnerability class the original was immune to.

Verified reachable:

```
renderer  window.api.storeSet('timestampStore', '__proto__.polluted', 'PWNED')
   → tauriTransport.snapshotSet → send('storeSet', …)
   → storeWriteHandlers.applyStoreWrite
        guard (a) pass  ('timestampStore' ∈ STORE_UNIVERSE)
        guard (b) pass  (not steamConfigStore)
        guard (c) pass  → isAllowedStoreField('timestampStore','__proto__.polluted') === true
                          (verified: policy is '*')
        guard (d) pass  → FileStore.set('__proto__.polluted', 'PWNED')
   → Object.prototype.polluted === 'PWNED'  (verified in node)
```

`isAllowedStoreField` also returns `true` for `legendary_library` /
`gog_library` / `nile_library` / `zoom_library` / `gogSyncStore` /
`gogPrivateBranches` / `wikigameinfo` / `uploadedLogs` with a `__proto__.*` key,
and for `configStore` with `settings.__proto__.polluted` (only the *first*
segment is checked). This pollutes the sidecar process — the same process that
holds Steam session material and dispatches every RPC handler.

**Fix:**

```ts
const DISALLOWED_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

function isSafePath(path: string): boolean {
  return !path.split('.').some((s) => DISALLOWED_PATH_SEGMENTS.has(s))
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  if (!isSafePath(path)) {
    process.stderr.write(
      `[sidecar/fileStore] rejected a disallowed key path segment\n`
    )
    return
  }
  // … existing body, and use Object.create(null)-free plain objects as today
}
```

Apply the identical guard in `getAtPath` and `deleteAtPath`, and add a
defence-in-depth rejection in `applyStoreWrite` (guard (c′)) so the policy layer
also refuses these keys rather than relying solely on the storage layer.

---

### CR-02: `isAllowedStoreField()` throws instead of failing closed for prototype-named store names

**File:** `src/common/types/storePolicy.ts:170-192`
**Issue:** `STORE_ALLOWLIST` is a plain object literal, so `STORE_ALLOWLIST[storeName]`
resolves through `Object.prototype`. For `storeName` of `constructor`,
`toString`, `valueOf`, `hasOwnProperty`, … `policy` is a *function*, not
`undefined`, so the `policy === undefined` fail-closed branch is skipped and
`policy.includes(topLevelKey)` throws. Verified live:

```
isAllowedStoreField('constructor','x')  → THREW: policy.includes is not a function
isAllowedStoreField('toString','x')     → THREW: policy.includes is not a function
```

The module header promises "An unknown store name … returns `false`". It does not
— it raises. `snapshotGet`/`snapshotHas` (`tauriTransport.ts:291`, `310`) call
this synchronously from the renderer with **no** try/catch, and the file's own
SEAM Invariant B says a throw on that path can blank the window. On the sidecar
side `dispatchSend` swallows it (`sidecarRpc.ts:117-124`), which converts it into
a silent dropped write.

**Fix:**

```ts
const policy = Object.prototype.hasOwnProperty.call(STORE_ALLOWLIST, storeName)
  ? STORE_ALLOWLIST[storeName]
  : undefined
```

or declare the table with a null prototype:
`export const STORE_ALLOWLIST: Record<string, readonly string[] | '*'> = Object.assign(Object.create(null), { … })`.
Add `expect(isAllowedStoreField('constructor','x')).toBe(false)` and the same for
`toString`/`valueOf` to `storePolicy.test.ts` — the current "fails closed on an
unknown store name" test only checks `notARealStore`, which happens to miss the
prototype chain entirely.

---

### CR-03: Renderer snapshot stores dot-notation keys FLAT but reads them NESTED — every `games.*` and `__timestamp.*` write reads back stale

**File:** `src/preload/tauriTransport.ts:325-335` (`snapshotSet`/`snapshotDelete`),
`150-160` (change listener), read side `236-248` (`getAtPath`)
**Issue:** `snapshotSet` does `snapshot[storeName][key] = value` — a flat
assignment — while `snapshotGet`/`snapshotHas` resolve the key through
`key.split('.').reduce(...)`. The two are not inverses. Concrete, shipped call
sites that use dot keys:

- `src/frontend/state/GlobalState.tsx:413/424` — `configStore.set('games.hidden', …)`
- `…:438/449` — `configStore.set('games.favourites', …)`
- `…:473/492/503/523/539` — `configStore.set('games.customCategories', …)`
- `src/frontend/helpers/electronStores.ts:116` — every `CacheStore.set()` writes
  `` `__timestamp.${key}` ``, and `:95` reads it back with the same dot key.

Sequence on the Tauri path: user hides a game → `snapshot.configStore['games.hidden']`
gets set flat → any subsequent `configStore.get('games.hidden', [])` traverses
`snapshot.configStore.games.hidden` and returns the **pre-write** hydrated value.
The game un-hides. Worse for `CacheStore`: a freshly written entry can never be
read back in-session, because its `__timestamp.<key>` lookup resolves to
`undefined` and `get()` returns the fallback — the library caches are permanently
cold within any session in which they were written.

The `STORE_CHANGED_CHANNEL` listener (`:150-160`) repeats the same flat write, so
the echo from the sidecar does not repair it either. Only a restart does (the
sidecar's `FileStore` *does* split on dots, so disk is correct).

**Fix:** give `tauriTransport` a `setAtPath`/`deleteAtPath` mirroring the read
side (with CR-01's disallowed-segment guard), and use it in `snapshotSet`,
`snapshotDelete`, and the change listener:

```ts
export function snapshotSet(storeName: string, key: string, value?: unknown): void {
  if (!snapshot[storeName]) snapshot[storeName] = {}
  setAtPath(snapshot[storeName], key, value)   // not snapshot[storeName][key] = value
  send(STORE_SET_CHANNEL, [storeName, key, value])
}
```

Add a regression test: `snapshotSet('configStore','games.hidden',[…])` followed by
`snapshotGet('configStore','games.hidden')` must return the value just written.

---

### CR-04: `FileStore` ignores `accessPropertiesByDotNotation: false`, corrupting `uploadedLogs`' shape

**File:** `src/backend/sidecar/fileStore.ts:59-69, 110-126`; store declared at
`src/backend/logger/electronStores.ts:10-14`
**Issue:** `uploadedLogFileStore` is deliberately constructed with
`accessPropertiesByDotNotation: false` because its **keys are dpaste URLs**
(`uploader.ts:97` — `uploadedLogFileStore.set(url, uploadData)`). `FileStoreOptions`
accepts the flag into its index signature and then never acts on it; `set()`
unconditionally splits on `.`. A URL such as `https://dpaste.com/AB12` is written
as nested objects (`{"https://dpaste": {"com/AB12": {…}}}`).

Consequences:
- The on-disk file written by the sidecar is **not** interchangeable with the file
  written by the Electron build, contradicting `fileStore.ts:13-16` ("a
  sidecar-written value and an Electron-build-written value read back
  identically").
- `getUploadedLogFiles()` (`uploader.ts:141-155`) iterates `raw_store` top-level
  entries and reads `value.uploadedAt` → `undefined` → `timeDifferenceDays` is
  `NaN` → `NaN >= 2` is `false` → every malformed entry is returned to the
  renderer as "valid" and never expires.

`storeLayer.test.ts`'s round-trip probe uses the key `__gsdProbe` (no dot), so it
cannot detect this.

**Fix:** honour the option.

```ts
export default class FileStore {
  private readonly dotNotation: boolean
  constructor(options: FileStoreOptions = {}) {
    this.dotNotation = options.accessPropertiesByDotNotation !== false
    …
  }
  set(key: string, value: unknown): void {
    if (this.dotNotation) setAtPath(this.cell.data, key, value)
    else this.cell.data[key] = value
    this.persist()
  }
  // same branch in get/has/delete
}
```

Add a `uploadedLogs`-shaped test asserting a URL key stays flat on disk.

---

### CR-05: `FileStore.load()` can return a non-object, making a corrupt file fatal

**File:** `src/backend/sidecar/fileStore.ts:239-249` (consumed at `146-172`)
**Issue:** `load()` returns `JSON.parse(raw)` unvalidated. A file containing
`null`, `"str"`, `12`, or `true` parses successfully, so the `catch` never fires
and `cell.data` becomes a non-object. Then:

- `data === null` + `options.defaults` present → `setAtPath(null, …)` throws
  `TypeError: Cannot set properties of null` **inside the constructor**, i.e. at
  module scope of `storeRegistration.ts`'s imports → the sidecar fails to boot.
- `data === null` with no defaults → the first `set()` throws the same TypeError.
- `data === 12`/`"str"` → writes are silently discarded (primitives ignore
  property assignment in sloppy mode / throw in strict mode).

The header and `fileStore.test.ts:132-147` both claim "a corrupt file is treated
as an empty store rather than a fatal error", but the test only covers
*unparseable* JSON, not *parseable-but-wrong-type* JSON.

**Fix:**

```ts
function load(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {}
  try {
    const raw = readFileSync(filePath, 'utf-8')
    if (!raw.trim()) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}
```

---

### CR-06: The shipped Electron build still exposes `csrfToken` and both `credentials` blobs to any renderer script

**File:** `src/preload/api/misc.ts:144-147`
**Issue:** `SECRET_STORE_KEYS` lists only `humbleConfigStore.sessionCookie` and
`steamConfigStore.refreshToken`. The three fields this phase's own header comment
(`storePolicy.ts:47-55`) identifies as secrets — `humbleConfigStore.csrfToken`,
`gogConfigStore.credentials` (GOG access/refresh tokens), `zoomConfigStore.credentials`
— remain readable in the shipping build:

```js
window.api.storeGet('gogConfigStore', 'credentials')   // full GOGLoginData
window.api.storeGet('humbleConfigStore', 'csrfToken')
window.api.storeGet('zoomConfigStore', 'credentials')
```

The file's stated rationale for the divergence is that "flipping this shipped
Electron build to fail-closed risks blocking a legitimate read among the 379
`window.api.*` call-sites". That argument applies to converting to an
allow-list; it does **not** apply to *adding three names to the existing
deny-list*. No UI code reads those fields (the same comment says so: "The UI only
needs isLoggedIn/userData/expired/encryptionDegraded"). Deferring to Phase 35
leaves real users exposed while the not-yet-shipped path is protected.

**Fix:**

```ts
const SECRET_STORE_KEYS: Record<string, readonly string[]> = {
  humbleConfigStore: ['sessionCookie', 'csrfToken'],
  steamConfigStore: ['refreshToken'],
  gogConfigStore: ['credentials'],
  zoomConfigStore: ['credentials']
}
```

This is a strictly additive deny-list extension — no allow-list flip, no Phase 35
coupling.

---

## Warnings

### WR-01: `applyStoreWrite` guard (a) is a no-op

**File:** `src/backend/sidecar/storeWriteHandlers.ts:97-107`
**Issue:** `isSyntacticallyValidCacheName` is `/^[A-Za-z0-9_-]{1,64}$/`, which
matches *every* member of `STORE_UNIVERSE` and every other plausible name. The
`!isUniverseMember && !isSyntacticallyValidCacheName` condition can only fire for
names containing `.`, `/`, spaces, or >64 chars. The comment presents it as "the
same acceptance test the read side applies", implying an allow-list check that
does not exist — the real gate is guard (c). `skeletonFlows.test.ts:429-451`
asserts `not_a_store` is rejected and attributes it to "guard (a)/(c)"; only (c)
rejects it.
**Fix:** either drop the misleading claim from the comment, or make guard (a)
meaningful: `if (!isUniverseMember && !RECOGNIZED_CACHE_STORE_NAMES.includes(storeName)) return`.

### WR-02: `storeNew` lets the renderer create arbitrary files under `store_cache/`

**File:** `src/backend/sidecar/storeWriteHandlers.ts:230-248`
**Issue:** The handler constructs a real `Store` for **any** name matching the
64-char pattern, with no allow-list check (unlike the write path). A renderer
script can create unbounded `${userData}/store_cache/<name>.json` files. Every
subsequent write to those names is then rejected by guard (c), so the store is
created but permanently unusable — a pure junk-file/DoS vector with no legitimate
consumer.
**Fix:** restrict the construction branch to `RECOGNIZED_CACHE_STORE_NAMES`
(export it from `storePolicy.ts`) and log-and-drop anything else.

### WR-03: `snapshotSet`/`snapshotDelete` bypass the allow-list, re-creating the silent-divergence failure the phase set out to kill

**File:** `src/preload/tauriTransport.ts:325-335`
**Issue:** `snapshotGet`/`snapshotHas` gate on `isAllowedStoreField`; the write
pair does not. A write to a non-allow-listed field updates the renderer's snapshot
optimistically, is rejected by sidecar guard (c) with a stderr line the renderer
never sees, and the UI shows a saved value that is not on disk until restart. That
is precisely 29-RESEARCH Pitfall 1 in a new location. Any future `StoreStructure`
field added without a matching `STORE_ALLOWLIST` entry becomes silent data loss.
**Fix:** gate `snapshotSet`/`snapshotDelete` on `isAllowedStoreField` and
`console.warn` on rejection, so the failure is visible in the renderer where the
caller is.

### WR-04: The read allow-list is reused verbatim as the write allow-list, making `configStore.settings` renderer-writable

**File:** `src/backend/sidecar/storeWriteHandlers.ts:122-130`, policy at
`src/common/types/storePolicy.ts:73`
**Issue:** Guard (c)'s comment states the *safe* direction ("a field the renderer
may not read, it may not write"), but the implemented policy is the converse:
everything readable is writable. `configStore.settings` is `AppSettings`, which
carries `wineVersion.bin`, `wrapperOptions`, `launcherArgs`, `winePrefix` — i.e.
executable paths and command lines consumed on the next game launch. Renderer
write access there is effectively local code execution. Read-safety and
write-safety are not the same predicate.
**Fix:** introduce a separate `WRITE_ALLOWLIST` (or a per-field `{read, write}`
tuple) and exclude `configStore.settings`, `configStore.userHome`, and
`*.userData` from the write side; route settings changes through the existing
typed `requestAppSettings`/`setSetting` IPC instead.

### WR-05: The atomic-persist fallback leaves orphan `.tmp-<pid>` files forever

**File:** `src/backend/sidecar/fileStore.ts:180-198`
**Issue:** If `writeFileSync(tmpPath)` succeeds but `renameSync` fails (e.g.
cross-device, EPERM, AV lock on Windows), the catch does a direct write and
returns — `tmpPath` is never unlinked. Since the name is pid-stable, one orphan
per store file per process, accumulating in the user's config directory. The test
at `fileStore.test.ts:76-91` only covers the success path.
**Fix:** wrap the fallback with `try { unlinkSync(tmpPath) } catch { /* best effort */ }`.

### WR-06: Token-bearing store files are written with default (world-readable) permissions

**File:** `src/backend/sidecar/fileStore.ts:187-197`
**Issue:** Both `writeFileSync(tmpPath, …)` and the direct-write fallback use the
default mode (0o666 & ~umask → typically 0o644). `${userData}/steam_store/config.json`
and `humble_store/config.json` hold safeStorage ciphertext and, when
`encryptionDegraded` is set, plaintext session material. Additionally, temp+rename
*replaces* the inode, so any hardened mode a prior process or the user applied to
the real file is silently reset on the next `persist()`.
**Fix:** pass `{ mode: 0o600 }` to both `writeFileSync` calls, and `mkdirSync(dir, { recursive: true, mode: 0o700 })`.

### WR-07: Hydration merges instead of replaces, so deleted keys never disappear from the renderer

**File:** `src/preload/tauriTransport.ts:191-197`, `208-234`
**Issue:** Both hydrate paths do `snapshot[storeName] = { ...(snapshot[storeName] ?? {}), ...values }`.
A key removed on disk (by the backend, by a migration, or by `store.clear()`)
stays in the renderer's copy for the life of the window, and `snapshotGet` will
keep returning the stale value in preference to the caller default. This also
defeats the self-heal the D-06 change listener is supposed to guarantee for
backend-side deletions.
**Fix:** replace wholesale — `snapshot[storeName] = { ...values }` — the sidecar's
filtered payload is already authoritative for that store.

### WR-08: `TypeCheckedStoreBackend` silently overwrites an existing registry entry

**File:** `src/backend/electron_store.ts:49-52`
**Issue:** The constructor unconditionally does `storeRegistry.set(name, …)`. A
second construction under the same `ValidStoreName` silently re-points every
name-keyed dispatch (`getRegisteredStore`, and therefore the whole new write path)
at a different instance, with no warning. `bootstrap.test.ts:135` already does
this for `configStore`, polluting the registry for anything else in that worker.
Now that the registry is load-bearing for renderer-driven writes, last-writer-wins
is not an acceptable default.
**Fix:**

```ts
if (storeRegistry.has(name)) {
  process.stderr.write(`[electron_store] duplicate registration for '${name}' — keeping the first instance\n`)
} else {
  storeRegistry.set(name, { instance: …, options: … })
}
```

### WR-09: `CACHE_STORE_POLICY` is dead, and `DENIED_CACHE_STORES` is unreachable in practice

**File:** `src/common/types/storePolicy.ts:123`, `136`
**Issue:** `CACHE_STORE_POLICY` is exported and never imported anywhere (verified
repo-wide). `DENIED_CACHE_STORES` contains only `humble_library`, which is not in
`handlers.ts`'s `CACHE_BACKED_STORE_NAMES` (`handlers.ts:77-83`) and not in
`STORE_UNIVERSE` — so `resolveRawStore('humble_library')` already returns `{}`
before the deny check is ever consulted. The header presents it as a live control
against leaking `revealedKeyValue`/`keyindex`; it is currently decoration, and it
will silently stop being decoration the day someone adds `humble_library` to a
handler list.
**Fix:** either delete `CACHE_STORE_POLICY` and document `DENIED_CACHE_STORES` as
forward-looking, or make it load-bearing by having `resolveRawStore` /
`resolveWritableStore` consult it directly.

### WR-10: `CACHE_STORE_NAME_PATTERN` is duplicated across the read and write handlers

**File:** `src/backend/sidecar/storeWriteHandlers.ts:48` vs
`src/backend/sidecar/handlers.ts:140`
**Issue:** The same regex is defined twice with an explicit comment saying it is
deliberately not shared. Given it is the *only* thing preventing an RPC-supplied
name from reaching `resolveStorePath()` (see WR-11), the two copies drifting apart
is a path-traversal risk, not a style issue.
**Fix:** export it once from `common/types/storePolicy.ts` (which both files
already import) and delete both local copies.

### WR-11: `fileStore.ts`'s T-27-03 header claim is now false — the path *is* partly RPC-derived, with no containment guard in `fileStore` itself

**File:** `src/backend/sidecar/fileStore.ts:17-23` vs
`src/backend/sidecar/storeWriteHandlers.ts:75-81`
**Issue:** The header asserts the path "is resolved ONLY from `pathShim.getPath('userData')`
plus the constructor's own `options.cwd`/`options.name` — both fixed at
construction time by backend code … never from an RPC-supplied path". As of this
phase, `resolveWritableStore()` and `storeNew` pass an RPC-supplied `storeName`
straight into `new Store({ cwd: 'store_cache', name: storeName })`, which becomes
`FileStore`'s `options.name`. The only thing stopping `../../evil` is the caller's
regex — `resolveStorePath()` itself performs no containment check.
**Fix:** update the header to state the invariant accurately, and add
defence-in-depth in `resolveStorePath()`:

```ts
const full = join(baseDir, `${name}.json`)
if (relative(getPath('userData'), full).startsWith('..') && !isAbsolute(cwd ?? '')) {
  throw new Error('[sidecar/fileStore] refusing a store path outside userData')
}
```

(Pattern precedent: Phase 18's "`path.join` is not containment — use resolve+relative".)

### WR-12: Write-path test coverage omits guard (c), cache-store writes, and hostile keys

**File:** `src/backend/sidecar/__tests__/skeletonFlows.test.ts:321-452`,
`src/backend/sidecar/__tests__/storeLayer.test.ts`
**Issue:** The write suite covers guard (b) (`refreshToken`) and malformed store
names only. There is no test that:
- a non-allow-listed field (e.g. `humbleConfigStore.csrfToken`, `gogConfigStore.credentials`)
  is rejected by guard (c) — the very control this phase claims to have added;
- a legitimate cache-store write (`legendary_library`) persists;
- `__proto__.x` / `constructor` keys are refused (CR-01/CR-02 would both have been
  caught by a single such case);
- a dot-notation key round-trips through `snapshotSet` → `snapshotGet` (CR-03).

`storeLayer.test.ts` never exercises `storeWriteHandlers.ts` at all.
**Fix:** add the four cases above to `skeletonFlows.test.ts`'s `storeSet` block.

---

## Info

### IN-01: Redundant `DENIED_CACHE_STORES` check

**File:** `src/common/types/storePolicy.ts:171-173` and `182-183`
**Issue:** The function returns `false` for a denied store at line 171; the
`!DENIED_CACHE_STORES.includes(storeName)` conjunct at line 183 is unreachable
dead logic.
**Fix:** drop the second check (or the first) so there is one place to maintain.

### IN-02: `STORE_ALLOWLIST` has no compile-time totality guarantee

**File:** `src/common/types/storePolicy.ts:57`
**Issue:** Typed `Record<string, …>`, so a new `StoreStructure` key that is never
added here fails only at runtime, guarded solely by a *hand-copied* list in
`storePolicy.test.ts:24-46`. Two hand-maintained lists, not one.
**Fix:** type it `Record<ValidStoreName, readonly string[] | '*'>` (a separate
const for the cache names), which makes an omission a compile error.

### IN-03: `storeNew` logs "ignored renderer-supplied options" on every boot

**File:** `src/backend/sidecar/storeWriteHandlers.ts:237-241`
**Issue:** `registerStore()` (`tauriTransport.ts:179`) always forwards `options`
for the four frontend `CacheStore`s, so this diagnostic fires four times on every
launch as normal behaviour. A warning that always fires stops being a warning.
**Fix:** only log when `options` differs from the hardcoded shape.

### IN-04: `wine/manager/utils.ts` re-exports the extracted store, creating two import paths

**File:** `src/backend/wine/manager/utils.ts:26-28`
**Issue:** `export { wineDownloaderInfoStore }` keeps the heavy host module as a
valid import source for the store, which is exactly what D-15 set out to avoid —
a future import of the store via `utils.ts` silently reintroduces the import-time
wall in the sidecar.
**Fix:** drop the re-export and update the (few) consumers to import from
`./electronStores`; if it must stay for compatibility, add a comment marking it
deprecated for sidecar-reachable code.

### IN-05: `storeRegistration.ts`'s `touched` array is an unverifiable bundler hack

**File:** `src/backend/sidecar/storeRegistration.ts:148-198`
**Issue:** 44 aliased imports funnelled into an array whose only use is
`void touched.length`. It works, but nothing tests that it works — if Rollup ever
elides one of the imports the failure mode is a store that silently snapshots as
`{}`. `storeLayer.test.ts` runs under ts-jest (no Rollup), so it cannot catch a
bundler regression.
**Fix:** add a post-build assertion (grep the emitted `build/main/sidecar.js` for
each store's `cwd`/`name` literal), or mark `src/backend/sidecar/storeRegistration.ts`
`sideEffects: true` in the bundler config and drop the array.

---

_Reviewed: 2026-07-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
