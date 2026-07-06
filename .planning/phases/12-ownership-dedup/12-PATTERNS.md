# Phase 12: Ownership Dedup - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 13 (7 new/extended backend, 1 new/extended frontend component, 1 extended frontend row component, 2 type/store files, 2 test-fixture files)
**Analogs found:** 13 / 13 (all files have a strong same-repo analog; this phase mostly extends files that already exist)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/humble/dedup.ts` (NEW) | service (pure computation) | transform | `src/backend/humble/classify.ts` | exact (same "pure, no I/O" module discipline) |
| `src/backend/humble/classify.ts` (extend `classifyOrder`) | transform/utility | transform | itself (existing loop, ~line 291-306) | exact |
| `src/backend/humble/library.ts` (extend `runSync`/add `recomputeOwnership` caller) | service (orchestrator) | event-driven + CRUD (cache read/write) | itself (existing `runSync`/`getKeys`/`sendFrontendMessage` flow) | exact |
| `src/backend/humble/electronStores.ts` (add `humbleOwnershipOverrideStore`) | store/config | CRUD | itself (`humbleRevealedStore`, lines 28-36) | exact |
| `src/backend/humble/constants.ts` (bump `HUMBLE_CLASSIFIER_VERSION`, add threshold const) | config | — | itself (existing constant + comment, lines 31-41) | exact |
| `src/backend/humble/ipc_handler.ts` (add `humbleSetOwnershipOverride`/`humbleClearOwnershipOverride`) | controller (IPC) | request-response | itself (`humbleSync`/`humbleGetKeys` handlers, lines 30-32) | exact |
| `src/backend/humble/user.ts` (verify `disconnect()` exemption) | service | event-driven | itself (`disconnect()`, lines 471-521) | exact |
| `src/backend/main.ts` (hook Steam-refresh recompute trigger) | controller (IPC composition root) | request-response | itself (`refreshLibrary` handler, lines 959-969) | exact |
| `src/common/types/humble.ts` (extend `HumbleKey`) | model/type | — | itself (existing `HumbleKey` interface, lines 95-107) | exact |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (add badge + override affordance) | component | request-response (render + fire-and-forget IPC) | itself (existing row component, full file read) | exact |
| `src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx` (NEW) | component | request-response (derived read) | `src/frontend/screens/Game/GamePage/components/PlatformSupport.tsx` | exact (identical `{ gameInfo: GameInfo }` prop shape, same "info" TabPanel) |
| `src/backend/humble/__tests__/dedup.test.ts` (NEW) | test | — | `src/backend/humble/__tests__/classify.test.ts` | exact (pure-function unit-test style, fixture-driven) |
| `src/backend/humble/__tests__/fixtures/steamGames.ts` (NEW) | test fixture | — | `src/backend/humble/__tests__/fixtures/tpks.ts` (fixture-module convention) | role-match |

## Pattern Assignments

### `src/backend/humble/dedup.ts` (NEW — service, transform)

**Analog:** `src/backend/humble/classify.ts` (module discipline) + Steam library shape from `src/backend/storeManagers/steam/library.ts`

**Module discipline to copy** (`classify.ts` docstring, ~line 220-228):
```typescript
/**
 * ... No I/O, no logging, no store import ...
 * locally-carried-forward state is the `isRevealed` lookup, which reads a
 * separate keyed store (humbleRevealedStore, injected by the caller) rather
 * than being embedded in this order data.
 */
```
Apply the identical discipline to `dedup.ts`: a pure `recomputeOwnership(keys: HumbleKey[], steamGames: GameInfo[], override: (machineName: string) => boolean): HumbleKey[]` function — no `electron-store` import, no `sendFrontendMessage`. The caller (`library.ts`) reads/writes all stores, exactly like it already injects `isRevealed` into `classifyOrder` (see `library.ts` line 144: `(machineName) => humbleRevealedStore.has(machineName)`).

**Steam ownership source shape** (`src/backend/storeManagers/steam/library.ts`, confirmed this session):
```typescript
// line 53/126/183/238: steamLibraryStore.get('games', []) returns GameInfo[]
// app_name is the stringified Steam AppID (line 200: app_name: appIdStr)
const cached = steamLibraryStore.get('games', [])
```
`dedup.ts`'s exact-match branch compares `key.steamAppId === game.app_name` (both strings).

**Fuzzy algorithm + DLC guard** — copy verbatim from RESEARCH.md Pattern 3 (already vetted this session against the project's own documented false-positive fixtures in `PITFALLS.md`); do not substitute `fuse.js` (already installed, but purpose-built for haystack search, wrong semantics — see RESEARCH.md "Alternatives Considered") or a token-set library (structurally causes the DLC false positive this phase must prevent).

**Anti-pattern (explicit, from RESEARCH.md):** do NOT inline ownership computation into `classify.ts` — that module's docstring is a hard "no I/O, no store" contract; `dedup.ts` needs the Steam library cache and the override store, so it must be a separate module called by `library.ts`.

---

### `src/backend/humble/classify.ts` (extend `classifyOrder`, ~line 229-340)

**Analog:** itself — extend the existing per-tpk field-extraction loop.

**Core pattern to copy** (existing loop, lines 291-306):
```typescript
// D-28: platform label is derived from key_type for ANY platform —
// classification itself is fully platform-agnostic. Guaranteed a
// string here by the hasKeyEvidence gate above.
const platform = tpk.key_type as string
const title =
  typeof tpk.human_name === 'string' ? tpk.human_name : orderLabel

keys.push({
  gamekey,
  machineName,
  state,
  title,
  platform,
  expiration,
  origin: orderLabel
})
```
Add `steamAppId` extraction identically to how `redeemedKeyValuePresent`/`isExpired` are read (line 272-285: `Boolean(tpk.redeemed_key_val ?? tpk.redeemed_key_value)`, `tpk.is_expired === true`) — an untyped `Record<string, unknown>` cast read, tolerant of the value being either a string or number per RESEARCH.md Pattern 1. Add the two new fields (`steamAppId`, default `ownedElsewhere: false`, default `matchConfidence: 'none'`) to the object literal pushed at line 298-306. **Do not compute ownership here** — only capture the raw field; `dedup.ts` (called later by `library.ts`) fills in `ownedElsewhere`/`matchConfidence`.

**Defensive-skip pattern already established** (lines 247-312, `try { ... } catch { continue }` per-tpk) — the new field read must sit inside this same try/catch so a malformed `steam_app_id` shape never fails the whole order (T-11-05 precedent).

---

### `src/backend/humble/library.ts` (extend `runSync`, add Steam-refresh recompute entrypoint)

**Analog:** itself — the existing sync orchestration flow.

**Backfill trigger — zero new code, just bump the constant** (RESEARCH.md Pattern 2, confirmed against actual `runSync` logic at lines 425-442):
```typescript
// library.ts lines 425-442 (existing, read this session):
const storedClassifierVersion = currentState.classifierVersion ?? 1
const reclassifyAll = storedClassifierVersion !== HUMBLE_CLASSIFIER_VERSION
if (reclassifyAll) { /* logInfo(...) */ }
```
Bumping `HUMBLE_CLASSIFIER_VERSION` from `2` to `3` in `constants.ts` is the ENTIRE backfill mechanism — `runSync`'s existing `toFetch = reclassifyAll ? [...gamekeysResult.data] : [...newGamekeys, ...nonTerminalGamekeys]` (line 447-449) already forces a full re-fetch of every gamekey including D-24 frozen ones. No new branch needed in `library.ts` for the backfill itself.

**Recompute call site** — hook the new `dedup.ts` pass in as a final step of `runSync()`, mirroring the existing `getKeys()`/`sendFrontendMessage('humbleKeysUpdated', ...)` push pattern (line 480, and the terminal `setSyncState(...)` block at lines 536-550). **Critical: re-push `humbleKeysUpdated` after the dedup mutation** — per RESEARCH.md Pitfall 5, the existing per-order progressive push (line 480, D-26) does NOT cover a distinct final dedup step; add one more explicit `sendFrontendMessage('humbleKeysUpdated', getKeys())` after `recomputeOwnership` runs and mutates `humbleLibraryStore`.

**`getKeys()` read pattern to copy** (lines 276-282):
```typescript
function getKeys(): HumbleKey[] {
  const keys: HumbleKey[] = []
  for (const [, entry] of humbleLibraryStore.entries()) {
    keys.push(...entry.keys)
  }
  return keys
}
```
The dedup pass needs the equivalent write-back: iterate `humbleLibraryStore.entries()`, run `recomputeOwnership` per order's `keys` array, `humbleLibraryStore.set(gamekey, { ...entry, keys: mutatedKeys })`.

**Steam-refresh recompute entrypoint** — export a new `recomputeOwnership()` (or similarly named) function from `HumbleLibrary` (extend the export block at line 555-559, which currently exports `{ loadCached, sync, getKeys, getSyncState }`), callable from `main.ts`'s `refreshLibrary` handler without `steam/library.ts` needing any Humble import (one-way dependency direction preserved — see `main.ts` pattern below).

**Gate the write side on Steam connectivity** (RESEARCH.md Pitfall 3/Assumption A3) — do not let an empty/stale `steamLibraryStore.get('games', [])` result flip `ownedElsewhere: true` rows to `false`; check `SteamUser.isLoggedIn()` (or equivalent) plus a non-empty games array before running the pass at all; on failure, the call is a no-op (D-48 keep-last-known).

---

### `src/backend/humble/electronStores.ts` (add `humbleOwnershipOverrideStore`)

**Analog:** itself — `humbleRevealedStore` (lines 33-36) is the exact precedent named by D-30/D-42/D-43.

**Pattern to copy verbatim, changing only the store name/key:**
```typescript
// src/backend/humble/electronStores.ts lines 28-36 (existing):
// D-04/D-30: this store is NEVER cleared by HumbleUser.disconnect() — it
// (and the future audit log) must survive a disconnect/reconnect cycle so a
// previously-revealed key never regresses to UNREVEALED (Pitfall 1). Kept as
// a separate electron-store file on disk from the two stores above for
// exactly that reason — do not merge this into humbleLibraryStore.
const humbleRevealedStore = new CacheStore<{ revealedAt: number }, string>(
  'humble_revealed',
  null
)
```
New store: `humbleOwnershipOverrideStore = new CacheStore<{ overriddenAt: number }, string>('humble_ownership_override', null)`, keyed by `machine_name` per D-42. Add the comment cross-referencing D-42/D-43 (mirrors the D-04/D-30 comment style) and export it in the final `export { ... }` block (line 38-43).

---

### `src/backend/humble/constants.ts` (bump version, add threshold)

**Analog:** itself — the existing `HUMBLE_CLASSIFIER_VERSION` constant and its changelog-style comment (lines 30-41).

**Pattern to copy** (comment-as-changelog convention):
```typescript
// Live-UAT round 6: version stamp of the classification logic (classify.ts).
// ...
//   1 = rounds 1-5 (implicit — pre-versioning caches read as 1)
//   2 = round 6: D-29 v2 direct-redeem entitlement exclusion
export const HUMBLE_CLASSIFIER_VERSION = 2
```
Bump to `3`, append a changelog line: `//   3 = Phase 12: steam_app_id capture added to classifyOrder`. Add `export const HUMBLE_FUZZY_MATCH_THRESHOLD = 0.85` alongside, with a comment locking it to HDEDUP-01 success criterion 3 (mirrors the `HUMBLE_COOLDOWN_MS`/D-33 comment style at line 27-29).

---

### `src/backend/humble/ipc_handler.ts` (add override handlers)

**Analog:** itself — `humbleSync`/`humbleGetKeys` registration block (lines 26-32).

**Pattern to copy:**
```typescript
// ipc_handler.ts lines 30-32 (existing):
addHandler('humbleSync', async () => HumbleLibrary.sync())
addHandler('humbleGetKeys', () => HumbleLibrary.getKeys())
addHandler('humbleGetSyncState', () => HumbleLibrary.getSyncState())
```
Add `addHandler('humbleSetOwnershipOverride', async (e, machineName) => ...)` and a clear/undo counterpart, delegating to a new method (analogous to how these delegate to `HumbleLibrary`). Per RESEARCH.md Open Question 2, the handler must defensively validate `matchConfidence === 'fuzzy'` for the target key server-side before persisting — never trust renderer-only gating for a state-changing IPC call (this mirrors the codebase's stated discipline, e.g. `humbleCheckHealth`'s cooldown enforcement living server-side, referenced in this same file's docstring).

---

### `src/backend/humble/user.ts` (verify `disconnect()` exemption — read-only check, likely no code change beyond a comment)

**Analog:** itself — `disconnect()` method (lines 471-521), specifically the exemption comment at lines 514-520.

**Pattern already established, extend the comment only:**
```typescript
// user.ts lines 514-520 (existing):
// D-04/D-30: deliberately does NOT touch humbleRevealedStore (or the
// future audit log). That store now exists (Phase 11) and MUST survive
// a disconnect/reconnect cycle — clearing it here would regress a
// previously-revealed key back to UNREVEALED (Pitfall 1), permanently
// forfeiting its gift-link opportunity for no reason tied to the actual
// disconnect action. Extend this policy for Phase 14's audit log the
// same way; never delete this exclusion.
```
Confirm `humbleOwnershipOverrideStore` is never added to the `disconnect()` wipe list (lines 484, 489-490 only clear `configStore`/`humbleLibraryStore`/`humbleSyncStore`); extend the comment to name the new store per D-43, matching this project's own "never delete this exclusion" instruction to future authors.

---

### `src/backend/main.ts` (hook Steam-refresh recompute trigger)

**Analog:** itself — the existing generic `refreshLibrary` handler (lines 959-969).

**Pattern to copy:**
```typescript
// main.ts lines 959-969 (existing):
addHandler('refreshLibrary', async (e, library?) => {
  if (library !== undefined && library !== 'all') {
    await libraryManagerMap[library].refresh()
  } else {
    const allRefreshPromises = []
    for (const manager of Object.values(libraryManagerMap)) {
      allRefreshPromises.push(manager.refresh())
    }
    await Promise.allSettled(allRefreshPromises)
  }
})
```
Gate the new recompute call on `library === 'steam' || library === undefined || library === 'all'` (i.e., after any Steam-inclusive refresh completes), calling the new `HumbleLibrary.recomputeOwnership()` export — this is THE seam that keeps `steam/library.ts` completely Humble-unaware (confirmed one-way dependency direction; `steam/library.ts` has zero Humble imports per this session's grep).

---

### `src/common/types/humble.ts` (extend `HumbleKey`)

**Analog:** itself — the existing interface (lines 95-107) and its "deliberately has NO raw key-value field" doc-comment style (lines 89-94).

**Pattern to copy (doc-comment discipline, not just the field):**
```typescript
// lines 89-94 (existing, doc-comment convention to mirror):
/**
 * Display-safe, per-row shape rendered on the Phase 11 Humble Keys page
 * (D-19/D-21/D-22). Deliberately has NO raw key-value field — only the
 * derived state is ever exposed (C4 / T-11-01); the raw redeemed-key value
 * from the Humble API must never reach this type or the renderer.
 */
export interface HumbleKey { ... }
```
Add `steamAppId?: string`, `ownedElsewhere: boolean`, `matchConfidence: 'exact' | 'fuzzy' | 'none'` with doc comments explaining orthogonality to `state` (§2.3) — see RESEARCH.md "Extended `HumbleKey` type" code block for the exact doc-comment text to reuse; it already correctly cross-references D-41/D-44 and the "NEVER influences classification precedence" constraint that mirrors this file's existing `HumbleKeyState` doc-comment at lines 73-81.

**Also extend `HumbleOrderCacheEntry`** (lines 109-119) — no field changes needed (`allTerminal` semantics untouched per anti-pattern warning below), but note in a comment that `keys: HumbleKey[]` rows now carry the ownership overlay fields.

**Anti-pattern (explicit):** do NOT add `ownedElsewhere` to `HumbleKeyState` (line 82-87) — it is an overlay, never a 6th state (§2.3, D-38/D-39).

---

### `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (add badge + override)

**Analog:** itself — full existing component (70 lines, read this session).

**Existing structure to extend, not replace:**
```tsx
// index.tsx lines 47-69 (existing):
return (
  <li className="humbleKeyRow">
    <span className={`humbleKeyStateBadge humbleKeyStateBadge--${humbleKey.state}`}>
      {t(labelKey, labelDefault)}
    </span>
    <div className="humbleKeyRowInfo">
      <span className="humbleKeyRowTitle">{displayTitle}</span>
      {!isUnpicked && (
        <span className="humbleKeyRowCaption">
          {t('humbleKeys.rowCaption', '{{platform}} · {{origin}}', {
            platform: humbleKey.platform, origin: humbleKey.origin
          })}
        </span>
      )}
    </div>
    {expirationLabel !== null && (
      <span className="humbleKeyRowExpiration">{expirationLabel}</span>
    )}
  </li>
)
```
Add a new `<span className="humbleKeyOwnedBadge">` (or similar semantic-token class, following the `humbleKeyStateBadge`/`humbleKeyRowCaption`/`humbleKeyRowExpiration` naming convention) rendered when `humbleKey.ownedElsewhere` is true, text switching on `matchConfidence` (`'exact'` → "Owned on Steam", `'fuzzy'` → "Likely owned on Steam", per D-41). Add the "Not the same game" override affordance ONLY when `matchConfidence === 'fuzzy'` (D-42) — call the new `window.api.humbleSetOwnershipOverride(machineName)` fire-and-forget, following the existing refresh button's `onClick={() => window.api.humbleSync()}` fire-and-forget pattern in `Keys/index.tsx` line 142.

**Critical constraint from the existing docstring (lines 11-13, DO NOT VIOLATE):**
```tsx
// D-22: strictly read-only. No click handler, no button/link element, no
// cursor:pointer, no reveal/copy/expand affordance — Phase 14 owns claim
// actions, not this row. Do not "improve" this into an interactive element.
```
D-42 is the phase's **sanctioned exception** to this D-22 read-only rule — only the override affordance breaks read-only-ness, and only on fuzzy rows; every other interaction remains forbidden. Update this comment to note the D-42 carve-out explicitly so a future reader does not assume the whole row became interactive.

**Presentation-only constraint (D-39):** the badge must not alter `groupAndSortKeys`/`GROUP_ORDER` (`common/humble/groupKeys.ts`, consumed by `Keys/index.tsx` lines 13, 101, 189) — no dimming, no re-sorting, purely an additional inline element.

---

### `src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx` (NEW)

**Analog:** `src/frontend/screens/Game/GamePage/components/PlatformSupport.tsx` (full file read, 36 lines)

**Structure to copy verbatim (prop shape, hook usage, i18n namespace):**
```tsx
// PlatformSupport.tsx (existing, full file):
import { useTranslation } from 'react-i18next'
import { GameInfo } from 'common/types'

interface Props {
  gameInfo: GameInfo
}

const PlatformSupport = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  return (
    <div className="platformSupport">
      <b>{t('info.supportedPlatforms', 'Supported platforms')}:</b>
      ...
    </div>
  )
}

export default PlatformSupport
```
`HumbleOriginInfo` follows this exact shape: `{ gameInfo: GameInfo }` prop, `useTranslation('gamepage')` namespace, a root `<div className="humbleOriginInfo">`. Difference: also needs `useContext(ContextProvider)` for `humble.keys` (see `Keys/index.tsx` line 41: `const { humble } = useContext(ContextProvider)` — the established way every Humble-aware component reads the key inventory).

**Derived lookup (no new IPC channel needed — RESEARCH.md Pattern 5):**
```tsx
const matchedKey = humble.keys?.find(
  (k) => k.state === 'REDEEMED' && k.steamAppId === gameInfo.app_name
)
if (gameInfo.runner !== 'steam' || !matchedKey) return null
```
This mirrors how `steam/library.ts` line 261-262 looks up a cached game by `app_name` (`cached.find((g) => g.app_name === appName)`) — same key field, same equality comparison, just against the Humble side's `steamAppId`.

**Mounting point** (`GamePage/index.tsx`, confirmed this session, lines 551-567):
```tsx
<TabPanel ...>
  <PlatformSupport gameInfo={gameInfo} />
  <DownloadSizeInfo gameInfo={gameInfo} />
  <InstalledInfo gameInfo={gameInfo} />
  <CloudSavesSync gameInfo={gameInfo} />
</TabPanel>
```
Add `<HumbleOriginInfo gameInfo={gameInfo} />` as a sibling in this same "info" TabPanel; import it in the barrel import block (`index.tsx` lines 53-63, alongside `CloudSavesSync`/`DownloadSizeInfo`/`InstalledInfo`/`PlatformSupport`).

---

### `src/backend/humble/__tests__/dedup.test.ts` (NEW)

**Analog:** `src/backend/humble/__tests__/classify.test.ts` (fixture-driven pure-function test style, no store mocking)

**Pattern to copy:**
```typescript
// classify.test.ts lines 1-13 (existing):
/**
 * Unit tests for the pure 5-state classification model (D-30, HSYNC-01/02/03).
 * No axios/electron-store mocking needed — classifyTpk/classifyOrder are pure.
 */
import { classifyTpk, classifyOrder, ... } from '../classify'
import { unpickedChoiceMonthOrder, ... } from './fixtures/tpks'
```
`dedup.test.ts` should follow the identical no-mocking, fixture-driven style: `import { recomputeOwnership, titleSimilarity, isDlcFalsePositiveRisk } from '../dedup'` and a new `./fixtures/steamGames.ts` fixture module (mirrors `./fixtures/tpks.ts`'s existing convention of named exported fixture constants). Reuse the project's OWN documented true-positive/false-positive title pairs (RESEARCH.md Pattern 3, sourced from `PITFALLS.md` Pitfall 2) as the test data — do not invent new fixtures when the project already has vetted examples.

## Shared Patterns

### Pure-module discipline (no I/O)
**Source:** `src/backend/humble/classify.ts` (module-level docstring, lines 220-228)
**Apply to:** `dedup.ts` — no `electron-store`/`CacheStore` import, no `sendFrontendMessage`. All store reads/writes stay in the caller (`library.ts`), which already owns this responsibility for `classify.ts`'s `isRevealed` injection.

### Disconnect-survival store exemption (D-04/D-30 precedent, extended by D-43)
**Source:** `src/backend/humble/electronStores.ts` lines 28-36 + `src/backend/humble/user.ts` lines 514-520
**Apply to:** the new `humbleOwnershipOverrideStore` — copy the exact comment style, add it as a THIRD exemption (alongside `humbleRevealedStore`) that `disconnect()` never clears.

### Classifier-version backfill mechanism (zero new code required)
**Source:** `src/backend/humble/constants.ts` (`HUMBLE_CLASSIFIER_VERSION`) + `src/backend/humble/library.ts` `runSync()` lines 425-449
**Apply to:** capturing `steamAppId` on already-cached/frozen orders — bump the version constant only; the existing `reclassifyAll` branch in `runSync()` already does the rest.

### Progressive `humbleKeysUpdated` push discipline
**Source:** `src/backend/humble/library.ts` line 480 (D-26) + Pitfall 5 in RESEARCH.md
**Apply to:** any code path that mutates `humbleLibraryStore` rows outside the per-order sync loop (i.e., the dedup pass, both trigger paths from D-47) — each such path must independently call `sendFrontendMessage('humbleKeysUpdated', getKeys())` or the renderer silently shows stale ownership state.

### `useContext(ContextProvider)` for `humble.keys` (no new IPC channel)
**Source:** `src/frontend/screens/Humble/Keys/index.tsx` line 41 + `src/frontend/state/GlobalState.tsx` lines 85-94, 1092-1096
**Apply to:** `HumbleKeyRow` (already receives `humbleKey` as a prop, no change needed there) and the new `HumbleOriginInfo` (needs the full `humble.keys` array via context to do its own `.find()`).

### One-way dependency direction (Humble → Steam, never reverse)
**Source:** `src/backend/storeManagers/steam/library.ts` (confirmed zero Humble imports) + `src/backend/main.ts` `refreshLibrary` handler (lines 959-969)
**Apply to:** the D-47 Steam-refresh recompute trigger — hook it in `main.ts` (the composition root), never inside `steam/library.ts` itself.

## No Analog Found

None — every file in this phase's scope is either an extension of an existing file or a new file with a directly-analogous sibling already in the codebase (`PlatformSupport.tsx` for `HumbleOriginInfo.tsx`; `classify.ts`'s pure-function discipline for `dedup.ts`; `humbleRevealedStore` for the new override store).

## Metadata

**Analog search scope:** `src/backend/humble/`, `src/backend/storeManagers/steam/`, `src/backend/main.ts`, `src/common/types/humble.ts`, `src/frontend/screens/Humble/Keys/`, `src/frontend/screens/Game/GamePage/`, `src/frontend/state/` (GlobalState.tsx, ContextProvider.tsx)
**Files scanned:** 13 read directly this session (full-file reads for files ≤ 145 lines: `electronStores.ts`, `constants.ts`, `ipc_handler.ts`, `validation.ts`, `common/types/humble.ts`, `HumbleKeyRow/index.tsx`, `PlatformSupport.tsx`, `Keys/index.tsx`; targeted offset/limit reads for larger files: `classify.ts` lines 225-345, `library.ts` lines 1-90/260-460/555-559, `user.ts` lines 465-522, `main.ts` lines 950-990, `GlobalState.tsx` lines 80-110/1085-1125, `ContextProvider.tsx` lines 30-49); plus targeted `grep` line-locates on `classify.ts`, `library.ts`, `user.ts`, `main.ts`, `steam/library.ts`, `adapter.ts`, `cache.ts`, `library.test.ts`, `classify.test.ts`
**Pattern extraction date:** 2026-07-06
