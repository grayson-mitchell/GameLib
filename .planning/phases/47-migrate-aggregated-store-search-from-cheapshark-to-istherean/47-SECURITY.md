---
phase: "47"
slug: "migrate-aggregated-store-search-from-cheapshark-to-istherean"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-18"
---

# Phase 47 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time across plans 47-01..47-18 (58 unique IDs; T-47-SC is repeated in 47-14..47-18 and listed once). Only plans 14-18 declare severity; elsewhere severity is inferred by the auditor and marked `(i)`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| operator shell -> sweep script | ITAD key enters only via `GAMELIB_ITAD_API_KEY` | shared API key (secret) |
| sweep script -> committed files | output crosses into git; must never carry the key | fixtures, coverage JSON |
| ITAD API -> fixtures | third-party response bodies become test inputs | provider data |
| operator -> GitHub secret store | shared key leaves the operator's machine only into GitHub's encrypted store | shared API key (secret) |
| GitHub secret -> CI step env | shared key enters one step's environment | shared API key (secret) |
| CI -> shipped binary | key baked into the sidecar bundle (extractable by design; ITAD's model) | shared API key |
| user env -> sidecar | `GAMELIB_ITAD_API_KEY` overrides at runtime | API key |
| sidecar -> api.isthereanydeal.com | outbound HTTPS carrying the key as a query param | API key, query, country |
| renderer -> sidecar IPC | untrusted args to searchStores / getStoreSearchDeals / getItadSteamGids / itad.setApiKey | query, country, gid, appids, user key |
| renderer query text -> cache key | user-typed text becomes part of a persisted store key | free text |
| disk cache -> adapter | persisted entries read back as trusted data | cached prices/URLs |
| ITAD response -> renderer | provider URLs and strings flow to `openExternalUrl` and the UI | URLs, store names, asset URLs |
| IPC error text -> UI | rejection strings classified into codes | error text |
| gid map -> badge | provider mapping decides an "Owned on Steam" claim | ITAD gid ↔ Steam appid |
| sidecar -> Rust keyring commands | slot names must be on Rust's allow-list | user API key (secret) |
| sidecar -> renderer status | must expose booleans only | key status |
| dev vault file | plaintext dev-only store behind `GAMELIB_DEV_SECRET_VAULT` | dev API key |
| Rust allow-list | only generated IPC channels may cross | channel names |
| renderer poll -> Rust shell main thread | 250 ms IPC poll drives a native webview URL read (gap G-47-9) | webview state |
| remote store page -> embed | network failure decides whether a URL exists | navigation outcome |
| route query string -> nav highlight | free-form `store-url` parameter picks the highlighted store | URL |
| localStorage region -> renderer / IPC / Deals catalog | user-editable stored region decides the country sent | country code |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-47-01 | Information disclosure | measureItadCoverage.ts writes | high (i) | mitigate | `assertNoSecret` guards the only `writeFileSync` and stdout (`meta/measureItadCoverage.ts:76-81,117-121,300-306`) | closed |
| T-47-02 | Information disclosure | sweep console output | medium (i) | mitigate | logs `{endpoint, status}`; key travels in axios `params` (`:310-318`) | closed |
| T-47-03 | Denial of service | shared ITAD budget (sweep) | low (i) | mitigate | 500 ms pacing, break on first 429 (`:137,219-222`) | closed |
| T-47-04 | Tampering | ITAD fixtures | low (i) | accept | see Accepted Risks AR-01 | closed |
| T-47-05 | Information disclosure | GitHub secret creation | high (i) | mitigate | hidden-prompt `gh secret set` recorded in 47-02-SUMMARY; no key literal committed (process-verified) | closed |
| T-47-06 | Repudiation | D-07 correspondence | low (i) | accept | see AR-02 | closed |
| T-47-07 | Denial of service | formatPrice garbled currency | low (i) | mitigate | try/catch fallback (`StoreSearch/helpers.ts:23-33`); `formatUsdPrice.test.ts:43` | closed |
| T-47-08 | Spoofing | price without unit | low (i) | mitigate | ISO code appended when Intl omits it (`helpers.ts:28-30`) | closed |
| T-47-09 | Information disclosure | release-tauri.yml | high (i) | mitigate | step-scoped env, `test -n` without echo (`release-tauri.yml:337-347`); pinned by `releaseWorkflow.test.ts:1794-1834` | closed |
| T-47-10 | Information disclosure | esbuild argv / build logs | medium (i) | mitigate | stderr/`error.message` only (`meta/buildSidecar.ts:41,48`; `buildSidecarSea.ts:510-514`); residual note 3 below | closed |
| T-47-11 | Information disclosure | key extractable from binary | medium (i) | accept | see AR-03 | closed |
| T-47-12 | Denial of service | release shipping keyless | medium (i) | mitigate | fail-fast step before SEA build (`release-tauri.yml:337-342`) | closed |
| T-47-13 | Tampering | meta bundles inheriting the key | low (i) | mitigate | `itadKeyDefineFlag` separate from `seaEsbuildFlags()`; only sidecar builds consume it | closed |
| T-47-14 | Tampering | searchCacheKey | medium (i) | mitigate | sha256 key (`itadCache.ts:32-38`); dotted-title test | closed |
| T-47-15 | Denial of service | unbounded itad_prices | low (i) | mitigate | 500-entry cap with index eviction (`itadCache.ts:16,63-80`) | closed |
| T-47-16 | Denial of service | sidecar exit | medium (i) | mitigate | no timers in `storeSearch/*.ts`; source assertion `itadCache.test.ts:140` | closed |
| T-47-17 | Denial of service | duplicate concurrent ITAD calls | low (i) | mitigate | single-flight (`itadCache.ts:123-131`) | closed |
| T-47-18 | Tampering | locally edited cache file | low (i) | accept | see AR-04 | closed |
| T-47-19 | Information disclosure | itad.ts logging/errors | high (i) | mitigate | marker + endpoint + status only (`itad.ts:77-87,169-172,239-244`); FAKEKEY tests, `logSecretGate.test.ts` | closed |
| T-47-20 | Tampering | provider deal URL | high (i) | mitigate | https-only parse (`itad.ts:178-185,273`); scheme allow-list `openPolicy.ts:79-97` | closed |
| T-47-21 | Tampering | gameId in cache key | medium (i) | mitigate | UUID check before I/O (`itad.ts:187-192,538`) | closed |
| T-47-22 | Tampering | query injection into ITAD URL | medium (i) | mitigate | axios `params`; zod max 256 enforced by `ipcValidation.ts:71` | closed |
| T-47-23 | Denial of service | shared 1000/5min budget | medium (i) | mitigate | 1h fresh cache, pre-cache, single-flight, 429 gate, 20-row cap | closed |
| T-47-24 | Spoofing | silent USD fallback | low (i) | mitigate | `pricedCountry` + provider currency returned (`itad.ts:118-122,281`) | closed |
| T-47-25 | Tampering | getStoreSearchDeals gid arg | medium (i) | mitigate | hex/hyphen regex (`enrichment.ts:69-73`) + UUID check | closed |
| T-47-26 | Denial of service | getItadSteamGids flood | low (i) | mitigate | digits-only, max 5000, chunking (`enrichment.ts:74-76`; `itad.ts:593-620`) | closed |
| T-47-27 | Elevation of privilege | stale IPC allow-list | medium (i) | mitigate | channels in `ipc_contract.rs`; `pnpm check:ipc-contract` up to date | closed |
| T-47-28 | Information disclosure | handler rejection text | medium (i) | mitigate | rethrow unchanged (`handlers.ts:61-64`); marker asserted in `handlers.test.ts` | closed |
| T-47-28b | Information disclosure | error text crossing IPC | medium (i) | mitigate | `enrichmentFlows.test.ts:645-701` asserts marker present, key absent | closed |
| T-47-29 | Repudiation | swallowed provider error | low (i) | mitigate | log-and-rethrow (`handlers.ts:60-96`) | closed |
| T-47-30 | Tampering | country arg | low (i) | mitigate | `normalizeCountry` (`handlers.ts:49-53`); zod max 16 | closed |
| T-47-31 | Information disclosure | raw provider error in DOM | medium (i) | mitigate | raw error to `logError`, UI shows fixed `t()` string by code | closed |
| T-47-32 | Spoofing | wrong "Owned on Steam" | low (i) | mitigate | failed lookup → empty map → no badge (`useOwnedSteamGids.ts:60-66`) | closed |
| T-47-33 | Denial of service | gid lookups per render | low (i) | mitigate | stable sorted key, one call per set; backend persistence | closed |
| T-47-34 | Tampering | buyUrl opened externally | high (i) | mitigate | unchanged URL to `openExternalUrl`; adapter + `openPolicy.ts` checks (as T-47-20) | closed |
| T-47-35 | Spoofing | stale price shown as live | low (i) | mitigate | `cachedAt` line with absolute timestamp (row + breakdown) | closed |
| T-47-36 | Tampering | storeName / HTML injection | medium (i) | accept | see AR-05 | closed |
| T-47-37 | Information disclosure | user key at rest | high (i) | mitigate | OS keyring slot `itad-api-key` (`itadSecretStore.ts`, `keyringTokenStore.ts:31`); never in config.json | closed |
| T-47-38 | Information disclosure | secret-store logs | medium (i) | mitigate | operation + error message only (`itadSecrets.ts:42-47`); `logSecretGate.test.ts` | closed |
| T-47-39 | Elevation of privilege | arbitrary keyring slot | medium (i) | mitigate | Rust allow-list arm, unknown slot → error (`src-tauri/src/main.rs:471-479`); distinct-account test | closed |
| T-47-40 | Information disclosure | dev vault plaintext | low (i) | accept | see AR-06 | closed |
| T-47-41 | Information disclosure | itad.getKeyStatus | high (i) | mitigate | returns `{hasKey, rejected}` booleans only | closed |
| T-47-42 | Tampering | itad.setApiKey arg | medium (i) | mitigate | `z.string().max(256)` + non-string guard | closed |
| T-47-43 | Denial of service | rejected user key burning budget | low (i) | mitigate | one-shot fallback; `markRejected` on 401/403 only | closed |
| T-47-44 | Information disclosure | rejected-key log line | medium (i) | mitigate | status-only log (`itad.ts:169-172`) | closed |
| T-47-45 | Elevation of privilege | new itad.* channels | medium (i) | mitigate | `ipc_contract.rs:635-636`; contract check clean | closed |
| T-47-46 | Information disclosure | key echoed in UI | medium (i) | mitigate | field starts empty; only booleans read back (`ItadApiKey.tsx`) | closed |
| T-47-47 | Information disclosure | shoulder-surfing | low (i) | mitigate | `type="password"` reaches the input; asserted in `ItadApiKey.test.tsx:135` | closed |
| T-47-48 | Repudiation | silent save failure | low (i) | mitigate | IPC failure sets `unavailable`, disables field | closed |
| T-47-49 | Denial of service | store embed nav drain / wry `url_from_webview` (G-47-9 crash) | high | mitigate | URL read only after `PageLoadEvent::Finished` (`store_embed/controls.rs:88-139`, `state.rs`, `open.rs:115-119,297-299`); 5 regression tests | closed |
| T-47-50 | Denial of service | flag-check vs close/recreate race | low | accept | see AR-07 | closed |
| T-47-51 | Information disclosure | drain log line | low | mitigate | logs `host_str()` only (`controls.rs:131-135`, `open.rs:121-124`) | closed |
| T-47-52 | Spoofing | resolveActiveStore lookalike host | low | mitigate | delegates to `resolveStoreForUrl` (https, exact/dot-suffix host); `evilgog.com` and http tests | closed |
| T-47-53 | Tampering | stored region (Store Search) | low | mitigate | `getStoredRegionFor(allowed)`; backend `normalizeCountry` still applies | closed |
| T-47-54 | Denial of service | rapid region switching | low | accept | see AR-08 | closed |
| T-47-55 | Tampering | thumbnail URL selection | low | accept | see AR-09 | closed |
| T-47-56 | Tampering | stored region (Deals) | low | mitigate | `getStoredRegionOverride` filters to REGION_OPTIONS; `storeRegion.test.ts:100` | closed |
| T-47-SC | Tampering | npm/pip/cargo installs (47-14..18) | low | accept | see AR-10 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Auditor notes (informational, none open):**
1. Every SUMMARY `## Threat Flags` section reports none; 47-03/04/05 SUMMARYs carry no such section (their surface is in the register).
2. T-47-05: secret presence rests on the 47-02-SUMMARY record (the auditor's `gh secret list` re-check was denied by the permission classifier) — process-verified, not independently re-verified.
3. T-47-10 residual: `meta/buildSidecarSea.ts:913` logs a whole Error object; an esbuild spawn error after CLI resolution could carry the `--define:__ITAD_API_KEY__=` argv into a build log. Not exercised; GitHub masks secret values in logs. Treated as inside the declared mitigation.
4. T-47-20/34 layering: `openPolicy.ts` is a scheme allow-list (https/http/mailto/tel/steam); the https-only gate is the adapter's `isHttpsUrl`. A hand-edited cached `buyUrl` falls under accepted T-47-18.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-47-04 | ITAD fixtures are test-only, reviewed in 47-01 Task 3; URLs kept verbatim for verbatim-URL tests | planner (47-01-PLAN) | 2026-11-12 |
| AR-02 | T-47-06 | D-07 correspondence record is the operator's mailbox; send still pending operator | planner (47-02-PLAN) | 2026-11-12 |
| AR-03 | T-47-11 | Shared key baked into the binary is extractable by design (ITAD's risk model); blast radius bounded by cache, debounce, 429 gate and dashboard monitoring | planner (47-04-PLAN) | 2026-11-12 |
| AR-04 | T-47-18 | Locally edited cache file trusted like every per-install cache; data only drives display | planner (47-05-PLAN) | 2026-11-12 |
| AR-05 | T-47-36 | React text rendering escapes provider strings; no `dangerouslySetInnerHTML` (confirmed) | planner (47-10-PLAN) | 2026-11-12 |
| AR-06 | T-47-40 | Dev-vault plaintext store is dev-only behind `GAMELIB_DEV_SECRET_VAULT === '1'`, same posture as the SteamGridDB dev slot | planner (47-11-PLAN) | 2026-11-12 |
| AR-07 | T-47-50 | Close/recreate race unreachable at runtime: close only at app teardown, new webview only after `reset_for_new_webview`; Linux/Windows `url()` do not unwrap | planner (47-14-PLAN) | 2026-11-18 |
| AR-08 | T-47-54 | Region switching re-runs the committed query once through the existing debounce; results cached per country; 429 keeps existing states | planner (47-16-PLAN) | 2026-11-18 |
| AR-09 | T-47-55 | Thumbnail trust unchanged: same ITAD asset fields, same host, existing CachedImage path | planner (47-17-PLAN) | 2026-11-18 |
| AR-10 | T-47-SC | No package installs or lockfile changes in 47-14..18 (verified against git) | planner (47-14..18-PLAN) | 2026-11-18 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-18 | 58 | 58 | 0 | gsd-security-auditor (ASVS L1, block_on high) via /gsd-execute-phase 47 --gaps-only |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-18
