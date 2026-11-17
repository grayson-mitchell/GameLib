---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
reviewed: 2026-11-17T00:00:00Z
depth: standard
files_reviewed: 40
files_reviewed_list:
  - .github/workflows/release-tauri.yml
  - meta/buildSidecar.ts
  - meta/buildSidecarSea.ts
  - meta/esbuildWorkerBundleShared.ts
  - meta/measureItadCoverage.ts
  - src-tauri/src/ipc_contract.rs
  - src-tauri/src/main.rs
  - src/backend/miscRuntime.ts
  - src/backend/services/types.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/devSecretVault.ts
  - src/backend/sidecar/enrichmentFlowRegistration.ts
  - src/backend/sidecar/gameDetailsFlowRegistration.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/itadSecretStore.ts
  - src/backend/sidecar/keyringTokenStore.ts
  - src/backend/storeSearch/handlers.ts
  - src/backend/storeSearch/itad.ts
  - src/backend/storeSearch/itadCache.ts
  - src/backend/storeSearch/itadCoverage.ts
  - src/backend/storeSearch/itadKey.ts
  - src/backend/storeSearch/itadSecrets.ts
  - src/backend/storeSearch/stores.ts
  - src/backend/stores/createStores.ts
  - src/backend/testUtils/testMiscRuntime.ts
  - src/backend/testUtils/testServices.ts
  - src/common/discounts/storeMapping.ts
  - src/common/types/ipc/enrichment.ts
  - src/common/types/storeSearch.ts
  - src/frontend/screens/Settings/components/ItadApiKey.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
  - src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx
  - src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx
  - src/frontend/screens/StoreSearch/helpers.ts
  - src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts
  - src/frontend/screens/StoreSearch/hooks/useOwnedSteamGids.ts
  - src/frontend/screens/StoreSearch/index.css
  - src/frontend/screens/StoreSearch/index.tsx
  - src/preload/api/storeSearch.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
  necessity: 1
status: issues_found
---

# Phase 47: Code Review Report

**Reviewed:** 2026-11-17
**Depth:** standard
**Files Reviewed:** 40 (phase-47 hunks only for the shared files)
**Status:** issues_found

## Summary

Scope was limited to phase-47 commits (git log `--grep='^[a-z]*(47-NN)'`). The key-handling surface is sound: the built-in key is baked via an esbuild `--define` that is never logged, the release workflow secret is step-scoped and used with `test -n` only, the adapter logs `{endpoint,status}` and never the axios error or config, `StoreSearchError` messages carry only a marker, an endpoint label and a status, and `itad.getKeyStatus` returns two booleans. No key-shaped strings were found in the committed fixtures, the coverage JSON or the summaries. The 429 gate is timestamp-only with no timers or handles, so the sidecar exit contract holds. Zod schemas bound every new channel (gid regex, digits-only appids with max 5000, key max 256, country max 16 with a handler-side `^[A-Z]{2}$` normalisation). Stale-cache fallback with `cachedAt` is correct for 429, network and 5xx.

No Critical findings. The Warnings below are robustness problems: a user-key save path that reports success when nothing was persisted, per-keystroke persistence of a secret with no write ordering, an unbounded search stall on the Keychain, a lookup loop that does not stop on 429, and a silent cliff on large Steam libraries.

## Warnings

### WR-01: `itad.setApiKey` reports success when the keyring write failed; UI shows "Key saved"

**File:** `src/backend/storeSearch/itadSecrets.ts:52-65`, `src/frontend/screens/Settings/components/ItadApiKey.tsx:40-47`
**Issue:** `createItadSecrets.setApiKey` is "total": it catches the store failure, logs a warning and resolves. The IPC handler (`enrichmentFlowRegistration.ts:432-443`) therefore always resolves, and `ItadApiKey.persistKey` then runs `setHasKey(!!newValue)`. If the Keychain/keyring write fails or times out, the field switches to the "Key saved" placeholder, but nothing was stored and the key silently disappears at the next boot. The `unavailable` branch can only be reached by an IPC/zod rejection (for example a pasted value over 256 chars, see WR-02), never by a keyring failure. `getKeyStatus` also reads `getApiKey()` which swallows read failures into `undefined`, so a status re-read cannot expose it either.
**Fix:** Let the owner report the outcome and propagate it to the renderer.
```ts
// itadSecrets.ts
setApiKey(value): Promise<boolean> // true when persisted
// enrichmentFlowRegistration.ts
const ok = await deps.itadSecrets.setApiKey(key)
if (!ok) throw new Error('itad: could not store the key')   // or return { ok }
// ItadApiKey.tsx: only setHasKey(!!newValue) on success; show a "could not save" state otherwise
```

### WR-02: Key is persisted on every keystroke with no write ordering; an oversize paste permanently disables the field

**File:** `src/frontend/screens/Settings/components/ItadApiKey.tsx:32-48`
**Issue:** `onChange` fires `window.api.itad.setApiKey(newValue)` per keystroke (copied from the SteamGridDB field). Consequences specific to ITAD: (1) each keystroke is a separate OS-keyring write, and each partial key is immediately live: `resolveKey` prefers the stored user key, so any search issued mid-typing sends a truncated key to ITAD, gets a 403 and calls `markRejected()` (logging a warning each time) until the next keystroke resets it. (2) The sidecar handlers are independent async calls over the keyring invoke; nothing orders them, so an earlier partial value can land after the final one and the stored key ends up truncated, with `hasKey` still true. (3) A pasted value over 256 chars is rejected by zod, the catch runs `setUnavailable(true)` and the field is disabled until the settings page is remounted, with the misleading text "Unavailable on this build".
**Fix:** Persist on blur or an explicit Save, serialise writes, and keep `unavailable` for a failed `getKeyStatus` only.
```tsx
const [draft, setDraft] = useState('')
const save = () => window.api.itad.setApiKey(draft.trim()).then(...)  // onBlur / Enter / Save button
// on a setApiKey rejection: show an inline "invalid key" error, do not setUnavailable(true)
```

### WR-03: Optional user-key read can stall every search (and the Advanced settings page) on a Keychain prompt

**File:** `src/backend/storeSearch/itad.ts:130-142` (called at 479 and 553), `src/backend/sidecar/enrichmentFlowRegistration.ts:424-427`
**Issue:** `resolveKey` awaits `secrets.getApiKey()` before the request is made. For a user who has saved a key, the first read goes through `SidecarKeyringSlotStore.readToken`, which on macOS can raise a Keychain approval dialog and is bounded only by the 45 s `KEYRING_READ_TIMEOUT` (see the module's own doc comment). The built-in key needs no I/O, yet the search is held for up to that long behind an optional secret, and `itad.getKeyStatus` triggers the same read just by opening Settings > Advanced. A failed read is memoised for 120 s, but each caller before the memo is armed still waits.
**Fix:** Cap the user-key lookup in `resolveKey` (for example `Promise.race` with a 2-3 s timeout that falls through to the built-in key, using no timer handle that outlives the call, or a `readToken()`-style non-blocking peek of the cached value), and have `getKeyStatus` use the cached/memoised outcome rather than forcing a prompt.

### WR-04: `lookupSteamGids` keeps hammering ITAD after a 429 or network failure

**File:** `src/backend/storeSearch/itad.ts:606-628`
**Issue:** The chunk loop catches every failure, logs and continues to the next chunk. With the schema's 5000-appid ceiling and a chunk size of 200 that is up to 25 sequential requests, all of which will fail the same way after a 429 or an offline error, extending the rate-limit window and delaying the caller. The comment says the keyless route's limit is separate, but a 429 is still a signal to stop. A 200 response with an unexpected body shape (for example an HTML error page, so `data?.[...]` is `undefined`) also caches `null` for every id in the chunk for a full day (`ITAD_GID_MISS_TTL_MS`), poisoning the ownership join.
**Fix:**
```ts
} catch (err) {
  logWarning(...)
  break // a failed lookup will not be fixed by the next chunk
}
// and before the write loop:
if (data === null || typeof data !== 'object' || Array.isArray(data)) continue // do not cache misses from a malformed body
```

### WR-05: Owned-on-Steam join silently disables itself for libraries over 5000 appids

**File:** `src/frontend/screens/StoreSearch/hooks/useOwnedSteamGids.ts:49-52`, `src/common/types/ipc/enrichment.ts:75`
**Issue:** The hook sends the whole distinct appid set in one `getItadSteamGids` call, while the schema rejects arrays over 5000 entries. A large Steam library plus waiting Humble keys exceeds that, the call rejects with an invalid-args error, the catch logs and resets to an empty map, and every Steam badge falls back to the fuzzy arms with no visible signal.
**Fix:** Chunk renderer-side (`appIds.slice(i, i + 5000)`) and merge the records, or raise the schema bound to match the backend's own chunking.

## Info

### IN-01: Release gate accepts a whitespace-only `ITAD_API_KEY` secret

**File:** `.github/workflows/release-tauri.yml:341-342`
**Issue:** The gate is `test -n "$IN_ITAD_API_KEY"`, but `itadKeyDefineFlag` and `resolveBuiltInItadKey` both `.trim()` the value. A secret that is only whitespace or a newline passes the fail-fast step and then bakes `""`, shipping a build that reports "not set up in this build" which is the exact outcome D-04 exists to prevent.
**Fix:** `test -n "$(printf %s "$IN_ITAD_API_KEY" | tr -d '[:space:]')"`.

### IN-02: A rejected built-in key surfaces as a generic provider error and does not use the stale copy

**File:** `src/backend/storeSearch/itad.ts:246-260, 521-526, 572-577`
**Issue:** A 401/403 on the built-in key (revoked or expired shared key) maps to `provider` ("Couldn't reach the price provider" with a Retry button that cannot help), and `isStaleCoverable` excludes 4xx so an available stale copy is not served either. The distinct `notConfigured` copy ("Add an IsThereAnyDeal API key in Settings > Advanced") is the one that would actually let a user recover.
**Fix:** In `toStoreSearchError`, map 401/403 from a non-user key to `notConfigured`, and consider treating it as stale-coverable.

### IN-03: Dead/unused configuration code (necessity)

**File:** `src/backend/storeSearch/itad.ts:194-209`, `src/backend/storeSearch/itadCoverage.ts:74-80`
**Issue:** **Category:** necessity. `ITAD_PRICE_AMOUNT_SOURCE` is the constant `'amount'`, so the `amountInt` branch and `fractionDigits()` in `priceString` can never run (generality without instantiation: the only value ever measured is `'amount'`, per `47-ITAD-COVERAGE.json`). `ITAD_AUTH_STYLE` is an unexported const kept alive by an `eslint-disable no-unused-vars` and is read nowhere.
**Fix:** Delete the `amountInt` branch, `fractionDigits`, and `ITAD_AUTH_STYLE` (move the measured facts into the file's doc comment); the sweep script retains the measurement.

### IN-04: Expanded breakdown renders an empty panel when ITAD returns no deals

**File:** `src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx:76-81`
**Issue:** `getGameDeals` legitimately returns `[]` (and caches it for an hour, `itad.ts:564-570`), after which `deals.map` renders an empty bordered container with no message.
**Fix:** Render a "No store prices found for this game" line when `deals.length === 0`.

---

_Reviewed: 2026-11-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
