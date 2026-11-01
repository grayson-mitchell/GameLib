# Phase 57: Opt-in known-fix sharing via relay - Research

**Researched:** 2026-11-02
**Domain:** Sidecar fire-and-forget HTTP client + Cloudflare Worker relay + GitHub App REST automation
**Confidence:** MEDIUM-HIGH (codebase facts HIGH; Cloudflare/GitHub facts cited from official docs; a few GitHub behaviours ASSUMED, listed in the Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The relay is a **Cloudflare Worker**. Dedup and rate-limit state live in Cloudflare KV or D1 (the planner/researcher picks which), and the GitHub credential lives in Worker secrets. The operator creates the Cloudflare account.
- **D-02:** The relay authenticates to GitHub as a **GitHub App** installed only on `grayson-mitchell/known-fixes`, with contents and pull-requests write (plus issues write for D-11). The Worker mints short-lived installation tokens from the app's private key. The operator creates the app, and the plan must include those steps as an operator checklist.
- **D-03:** Relay source lives **in this repo** (e.g. `relay/`), deployed with wrangler. The payload schema and the allow-list of key/value pairs are shared with the client code (or generated from one source) so they can't drift, and they are tested together.
- **D-04:** The client reaches the relay through a **hard-coded URL constant**, in the style of `GAMELIB_KNOWN_FIXES_BASE`, with a dev/env override for testing against a local (`wrangler dev`) or staging relay.
- **D-05:** The relay opens a **pull request** with `steam/<appId>-steam.json` already written, not an issue. (Exception: D-11.)
- **D-06:** **One PR per appId** on branch `report/steam-<appId>`. A later report for the same appId while that PR is open (e.g. CEG after 32-bit) adds a commit to the open PR instead of opening a second one.
- **D-07:** If `steam/<appId>-steam.json` already exists on known-fixes, the PR **merges the key in** and keeps every other key. This matches the bundled seeds, which carry `macArch` and `drm` in one file.
- **D-08:** A removal report's PR **removes only the `macArch` key**. If nothing but `title`/`notes` remains, the PR deletes the file. `drm` and any real fix keys stay.
- **D-09:** **No consent dialog.** The setting is off by default, and turning it on is the consent. The toggle carries the icon-only (i) help on its label line (see memory: help icon on title line). The help text lists exactly what is sent (appId, title, detected key/value, GameLib version) and what never is (user id, paths, logs).
- **D-10:** The toggle lives in **General** settings, is shown **on macOS only** (all three detectors run only there), and when sending, the client writes **a log line only**: the report and the relay's response. No toast and no sent-reports list.
- **D-11:** A removal report that targets a `macArch: "32"` entry existing **only in bundled `public/fixes/`** (not on the known-fixes repo) makes the relay open an **issue** on known-fixes, labelled e.g. `bundled-removal` and naming the appId, because a PR there cannot remove it. The operator fixes it in a GameLib release.
- **D-12:** **Client skip rule (add reports):** skip when `readKnownFixes(appId, 'steam')`, the winning layer across local, bundled and remote, already yields the same key with the same value. A file that has `macArch` but no `drm` still lets a CEG report through. **Removal reports** are sent only when the winning entry still says `macArch: "32"`. This replaces the roadmap's literal "skip when a fix file for that title exists".
- **D-13:** **One report opens a PR.** The verdicts are deterministic binary scans and the operator reviews every PR. Repeat reports for the same appId+key+op are counted and the count is surfaced in the PR body (or a PR comment), but they never open new PRs.
- **D-14:** **Relay validation:** a strict payload schema; key/value limited to the tier-1 routing pairs (`macArch`/`"32"`, `drm`/`"ceg"`); op add/remove; appId numeric; store `steam`. The relay checks that the appId exists via the public Steam store API and writes **Steam's canonical title**, never the client-sent title, so no user-controlled text lands in the repo or the PR. A rejected payload gets a 4xx.
- **D-15:** **Rate limiting:** per-IP (hashed and short-lived, never written to GitHub) plus a global daily cap on new PRs/issues, held in KV/D1. The planner sets the exact numbers (order of magnitude: ~10 reports/IP/hour).
- **D-16:** **Client "already sent" record:** a persisted set keyed by appId+key+op. A report is marked only on a relay **2xx**, and a **4xx** is also marked so it is never resent. A network error, timeout or 5xx is not marked; the next time the detector fires (the next install or launch) it retries. There is **no background retry queue**.

### Claude's Discretion
- KV vs D1 for relay state; exact rate-limit numbers; the PR title, body and labels (it should cite the detector and the GameLib version, and show the repeat-report count).
- Where the setting is persisted (GlobalConfig vs a dedicated store) and the exact copy of the label and help text.
- The client HTTP timeout and where in the detection paths the send hook sits. It must not block or delay install or launch.

### Deferred Ideas (OUT OF SCOPE)
- A "Sent reports" list in Settings: considered and declined for this phase (D-10).
- Requiring N independent reports before a PR: declined (D-13). Revisit if abuse appears.
- Sharing from detectors on other platforms, or new detectors: out of scope. The setting is macOS only until such detectors exist.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped (ROADMAP: "Requirements: TBD"). The decisions D-01..D-16 are the requirements; the table maps each to the finding that enables it.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Cloudflare Worker, KV or D1, secrets | Use **D1** (atomic UPSERT counters); KV is not atomic. See Standard Stack, Pattern 4 |
| D-02 | GitHub App installation tokens | RS256 JWT via WebCrypto, PKCS#1 to PKCS#8 conversion, Pattern 3, Operator Checklist |
| D-03 | Shared schema + allow-list | `src/common/knownFixReport.ts` (zod, relative imports only), imported by client and relay, drift test in Backend project |
| D-04 | Hard-coded URL + env override | Mirror `GAMELIB_KNOWN_FIXES_BASE`; env `GAMELIB_FIX_RELAY_URL`; constant must be filled after the operator deploy checkpoint |
| D-05..D-08 | PR shape, merge/removal semantics | GitHub REST sequence in Pattern 3; D-07/D-08 file-edit rules in Pattern 5 |
| D-09, D-10 | Setting UX, log-only | `shareDetectedFixes` in AppSettings + `EnableSteamNativeInstall.tsx`/`AdvertiseAvxForRosetta.tsx` pattern |
| D-11 | Bundled-only removal -> issue | Relay decides by checking the repo (absence = bundled-only); no client layer field needed. Pattern 3 |
| D-12 | Client skip rule | `readKnownFixes` gives the winning entry but not the winning layer; add a layer-aware sibling (Pitfall 4) |
| D-13 | Counts, no new PRs | D1 `reports` table + PR body PATCH with log-scaled throttling |
| D-14 | Strict validation, canonical title | zod `.strict()` + refine; Steam `appdetails?appids=<id>&filters=basic` (verified live) |
| D-15 | Rate limits | D1 buckets (`ip:<hash>:<hour>`, `cap:<day>`); numbers in Pattern 4 |
| D-16 | Sent record | New `CacheStore` + lazy-require pattern; **two conflicts found** (Pitfalls 1 and 2) |
</phase_requirements>

## Summary

The client half is small and fits cleanly into existing patterns: a new leaf module `src/backend/knownFixReport.ts` (axios, injectable `post`, URL constant + env override, never throws) called with `void` from three existing sites. The setting follows the `enableSteamNativeInstall` / `notifyHumbleExpirations` template (AppSettings field, factory default, `useSetting` toggle with `InfoIcon`, gated on `platform === 'darwin'` as `AdvertiseAvxForRosetta` does). The "already sent" set follows the `steamRestartHoldStore` precedent (a dedicated `CacheStore` consumed through a lazy `require`). The sidecar exit contract is satisfied cheaply: register each in-flight send's `AbortController` through the existing `createAbortController(id)` registry, because `releaseOnStdinEof()` already calls `callAllAbortControllers()`, and bound the request with `AbortSignal.timeout()` (whose timer does not keep the loop alive) plus axios `timeout`.

The relay is a pure `fetch(request, env)` Worker whose logic is written against structural interfaces (`D1Like`, injected `fetch`), so the whole thing is unit-testable under the repo's existing **Jest** with a new `relay/` project, Node 22 globals (`Request`, `Response`, `crypto.subtle`) and `node:sqlite` as a real SQL engine for the D1 queries (verified working under this repo's Jest 29). No vitest and no `wrangler` in the root install are needed. `wrangler` lives in an independent `relay/package.json` (it pulls `workerd`, which has a postinstall). The shared schema lives in `src/common/knownFixReport.ts` with relative imports only, so wrangler's esbuild can bundle it from outside `relay/`.

Two decisions as written conflict with the code or with their own intent and need a planner call: (1) D-16's "retry the next time the detector fires" is not true for the Mach-O detector, which fires once per install (Pitfall 1); (2) D-16's "4xx is also marked" would permanently drop a report rejected only by a rate limit or daily cap (Pitfall 2). Also: PRIVACY.md currently asserts the maintainer operates no server, which this phase falsifies (Pitfall 8).

**Primary recommendation:** D1 for all relay state; Worker logic as pure testable modules with the GitHub REST calls made strictly serially; client `reportDetectedFix()` is a never-throwing leaf called with `void`, registered in the abort-controller registry, with 429/408 treated as retryable (not marked).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Detect verdict (Mach-O, CEG) | Sidecar (Node backend) | — | Already there; no new detectors |
| Opt-in toggle UI | Browser/Client (React settings) | Sidecar GlobalConfig (persist + read) | `useSetting` writes through to GlobalConfig; sidecar reads it at send time |
| Skip rule + sent record (D-12, D-16) | Sidecar | — | Needs `readKnownFixes` (fs) and a persisted store |
| Send report (bounded, abortable) | Sidecar | — | Network work must live where the exit contract is enforced |
| Schema + allow-list | Shared module `src/common` | Relay Worker, Sidecar | Single source consumed by both ends (D-03) |
| Validation, canonical title, rate limit, dedup | Relay Worker | D1 | Untrusted input boundary; holds no secrets on the client |
| GitHub credential + PR/issue creation | Relay Worker (secrets) | GitHub App | D-02; no secret in the app |
| Review/merge | Operator on GitHub | — | Nothing reaches users until merged |
| Delivery to users | Existing `fetchRemoteKnownFixes` | CDN (raw.githubusercontent.com) | Unchanged |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | ^1.20.0 (already in package.json) | Client HTTP POST | STEAM-STACK.md mandates axios; fetcher already uses it |
| zod | ^3.24.3 (installed 3.25.6) | Shared strict payload schema | Already a root dependency; `.strict()` rejects unknown keys |
| wrangler | 4.156.0 (npm, modified 2026-10-29) | Worker dev/deploy, D1 migrations, secrets | Cloudflare's official CLI; engines node >=22 [VERIFIED: npm view] |
| @cloudflare/workers-types | 5.20261101.1 | Types for `relay/src/index.ts` entry only | Official typings [VERIFIED: npm view] |
| Cloudflare D1 | Workers Free: 5M rows read/day, 100k rows written/day, 5 GB [CITED: developers.cloudflare.com/d1/platform/pricing] | Dedup counts, rate buckets, daily cap | SQLite, atomic UPSERT ... RETURNING |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:sqlite` (Node >=22.13 unflagged) | built-in | Real SQL engine for relay tests | Wrap in a `D1Like` adapter; works under repo Jest 29 (verified in scratch, emits an ExperimentalWarning) |
| Jest 29 + ts-jest (already installed) | ^29.7 | Relay + client tests | Reuse; add a `relay/jest.config.js` project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| D1 | KV | KV is eventually consistent (visible "up to 60 seconds or more" elsewhere) and has no atomic increment [CITED: developers.cloudflare.com/kv/concepts/how-kv-works]; concurrent reports would lose counts and let the daily cap overshoot. Reject. |
| D1 rate limits | Workers Rate Limiting binding (`ratelimits`, wrangler >=4.36.0) | Per-location, approximate, period only 10 or 60 s, docs advise against IP keys [CITED: developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit]. Cannot express hourly or daily caps. Optional extra layer only. |
| D1 | Durable Object | Strongest consistency, but more code and a paid-plan question; D1 UPSERT is enough here |
| vitest-pool-workers 0.23.0 | Jest + injected deps | Would add a second test runner to CI; Worker logic needs no Workers-only API beyond `crypto.subtle`/`fetch`, which Node 22 has. Use Jest. |
| `@octokit/*`, `jose` | hand-written `fetch` calls + ~30-line JWT | Octokit adds bundle weight for 8 endpoints. NOT hand-rolling crypto: WebCrypto does the RS256 sign. The JWT assembly is trivial and fully testable. |

**Installation (relay only; independent of the root install):**
```bash
cd relay
pnpm install --ignore-workspace          # relay/package.json: wrangler, @cloudflare/workers-types, typescript
```
`--ignore-workspace` gives `relay/` its own `node_modules` and `pnpm-lock.yaml` (verified in a scratch copy of the root `pnpm-workspace.yaml` layout, which has no `packages:` key). `workerd` (a dependency of wrangler) has `scripts.postinstall: node install.js`, so `relay/pnpm-workspace.yaml` must allow-list builds (`onlyBuiltDependencies: [esbuild, workerd]`, plus whatever `pnpm install` reports as ignored).

**Version verification:** run 2026-11-02 via `npm view` (wrangler 4.156.0; @cloudflare/workers-types 5.20261101.1; zod 3.25.6 installed; workerd dep 1.20261023.1).

## Package Legitimacy Audit

slopcheck could not be installed (the `pip install` was denied by the sandbox classifier), so per protocol every package below is **[ASSUMED]** for legitimacy and the planner must gate the relay install behind a `checkpoint:human-verify`. Registry checks that did run: both packages exist, have official Cloudflare repositories, and are years old.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| wrangler | npm | since 2012 (first publish) | not checked | github.com/cloudflare/workers-sdk | unavailable | [ASSUMED] - well-known official; human-verify gate |
| @cloudflare/workers-types | npm | since 2019 | not checked | github.com/cloudflare/workerd | unavailable | [ASSUMED] - human-verify gate |
| workerd (transitive of wrangler) | npm | n/a | n/a | cloudflare | unavailable | postinstall `node install.js` observed; official binary installer, flag in checkpoint |
| axios, zod | npm | already in root package.json | — | — | n/a | Pre-existing dependencies, no new install |

**Packages removed due to [SLOP]:** none. **Packages flagged [SUS]:** none (slopcheck did not run).

## Architecture Patterns

### System Architecture Diagram

```
 macOS GameLib (sidecar)                                   Cloudflare Worker (relay)                     GitHub
 -----------------------                                   -------------------------                     ------
 detector verdict
  |- verifyMacArchGroundTruth (32 | 64-vs-curated-32)
  |- persistBridgeDrmSignal (ceg)
        |
        v  void reportDetectedFix(...)   (never awaited, never throws)
  [isMac && shareDetectedFixes===true ?] --no--> return (nothing sent)
        | yes
  [D-12 skip: winning layer already agrees?] --yes--> return
        | no
  [sent-record has appId:key:op?] --yes--> return
        | no
  POST JSON (axios, signal=AbortController registered in aborthandler, timeout ~8s)
        |                                       v
        |                          [size/method/content-type] -> 4xx
        |                          [per-IP bucket (D1, hashed)]  -> 429
        |                          [zod strict + pair/op refine]   -> 400/422
        |                          [D1 upsert count for appId:key:op]
        |                              |- row has pr/issue -> repeat: PATCH PR body (log-scaled) -> 200 counted
        |                          [daily cap (D1)]               -> 429
        |                          [Steam appdetails canonical title] -> 422 unknown app / 503 Steam down
        |                          [mint installation token (JWT RS256)] ----> POST /app/installations/{id}/access_tokens
        |                          [GET steam/<id>-steam.json @main] -------> contents API
        |                              |- add & already has key  -> 200 already-known
        |                              |- remove & no file/key   -> open issue (bundled-removal) ---> POST /issues
        |                              |- else: open PR on branch report/steam-<id>:
        |                                  GET pulls?head=owner:branch&state=open
        |                                  open? -> GET file @branch -> merge -> PUT (commit)
        |                                  none? -> GET ref main -> POST git/refs -> PUT/DELETE file -> POST /pulls
        v                                       |
  2xx -> mark sent ; 4xx(not 408/429) -> mark sent ; 5xx/429/408/timeout/abort -> not marked
  log line only (report + response status)
                                               operator reviews and merges PR on known-fixes
                                                       |
                                                       v
                                  existing fetchRemoteKnownFixes (raw.githubusercontent.com) delivers to users
```

### Recommended Project Structure
```
src/common/knownFixReport.ts            # zod schema, KNOWN_FIX_REPORT_PAIRS, types (relative imports + zod only)
src/common/__tests__/knownFixReport.test.ts
src/backend/knownFixReport.ts           # client: URL const, env override, injectable post, skip rule, sent record, never throws
src/backend/__tests__/knownFixReport.test.ts
src/backend/__tests__/knownFixReportDrift.test.ts   # schema pairs vs TIER1_ROUTING_KEYS + filterTier1KnownFixes (D-03)
src/backend/storeManagers/steam/electronStores.ts   # + steamKnownFixReportStore (CacheStore<unknown>, lazy-required)
src/frontend/screens/Settings/components/ShareDetectedFixes.tsx  # + export in components/index.ts, + GeneralSettings
relay/
├── package.json  pnpm-workspace.yaml  wrangler.jsonc  tsconfig.json  jest.config.js
├── migrations/0001_init.sql
└── src/
    ├── index.ts        # export default { fetch } - only file that touches Worker types
    ├── handler.ts      # handleReport(request, deps) pure
    ├── env.ts          # structural D1Like / EnvLike
    ├── githubApp.ts    # JWT mint + installation token
    ├── githubFiles.ts  # contents/refs/pulls/issues calls
    ├── fileEdit.ts     # pure merge/remove rules (D-07/D-08)
    ├── steamTitle.ts   # appdetails lookup + sanitize
    ├── limits.ts       # D1 buckets
    └── __tests__/
```
Root `jest.config.js` `projects` gains `'<rootDir>/relay'`. `relay/jest.config.js` copies `src/common/jest.config.js` (`rootDir: '../'`... set `rootDir` to repo root and `roots: ['<rootDir>/relay']`, `modulePaths: [compilerOptions.baseUrl]`). `relay/` is outside the root `tsconfig.json` `include` (only `src`), so root `tsc`/eslint do not see it; give `relay/tsconfig.json` its own `lib: ["es2022"]` + workers-types and run `tsc -p relay` as a verify step. Handlers must NOT import Worker ambient types (`D1Database`, `KVNamespace`), because ts-jest compiles them under the root tsconfig (DOM lib); declare tiny structural interfaces instead and let `index.ts` adapt.

### Pattern 1: Client module (mirrors `knownFixesFetcher.ts`)
**What:** leaf module, no `electron`/`backend/ipc`/`backend/utils` imports; URL constant, `process.env` override, injectable transport, never rejects.
```typescript
// Source: modelled on src/backend/knownFixesFetcher.ts (GAMELIB_KNOWN_FIXES_BASE, KnownFixesGet, defaultGet)
export const GAMELIB_FIX_RELAY_URL = 'https://<operator-filled>.workers.dev/v1/reports'
export function relayUrl(): string {
  return process.env.GAMELIB_FIX_RELAY_URL || GAMELIB_FIX_RELAY_URL
}
export type RelayPost = (url: string, body: unknown, signal: AbortSignal) =>
  Promise<{ status: number; data: unknown }>
const defaultPost: RelayPost = async (url, body, signal) => {
  const res = await axios.post(url, body, {
    timeout: 8000,                 // inactivity bound
    signal,                        // hard bound: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])
    maxRedirects: 0,
    validateStatus: () => true,    // never throws on HTTP status
    headers: { 'User-Agent': `GameLib/${version}` }
  })
  return { status: res.status, data: res.data }
}
export function reportDetectedFix(args: DetectedFix, deps = defaultDeps): void {
  void run(args, deps).catch((e) => logWarning(`Known-fix report failed: ${String(e)}`, LogPrefix.Backend))
}
```
Details the planner must carry:
- **Version:** `import { app } from 'backend/platform'` then `app.getVersion()` (returns the static `package.json` version; `process.env.npm_package_version` is unset in the SEA sidecar, `platform/index.ts` L76 and L304). Do not use `getHeroicVersion()` (appends a version name). Inject for tests. Currently `0.8.0`.
- **Gate order** inside `run`: `isMac` -> setting (`GlobalConfig.get().getSettings().shareDetectedFixes === true`) -> D-12 skip -> sent-record -> POST. Read the setting at send time, every time (toggling off must stop sends immediately).
- **Exit contract (CLAUDE.md / gamelib-conventions):** the send is referenced in-flight work. (1) Bound it: `AbortSignal.any([ctrl.signal, AbortSignal.timeout(8000)])` plus axios `timeout`. `AbortSignal.timeout()` timers do not keep the loop alive. (2) Register `const ctrl = createAbortController('known-fix-report:' + key)` from `backend/utils/aborthandler/aborthandler` and `deleteAbortController(...)` in `finally`. `releaseOnStdinEof()` already runs `callAllAbortControllers()`, so an EOF mid-send aborts it with zero change to `stdinEofRelease.ts`. An aborted send is not marked sent (it retries when the detector next fires). (3) Nothing is issued at boot. (4) No timers of its own; if a `setTimeout` is ever added, `unref?.()` it. Use a distinct id prefix so `SteamGame.stop(appId)` cannot abort a report.
- **Logging (D-10):** one `logInfo` with the report (appId/key/value/op/version) before the send, one with status after. Never log headers or the response body verbatim beyond `status` and the relay's `status` string.
- **Response mapping (see Pitfall 2):** 2xx mark; 4xx except 408/429 mark; 408/429/5xx/network/abort/timeout do not mark.

### Pattern 2: Sent record + settings
- **Store:** add to `electronStores.ts` `export const steamKnownFixReportStore = new CacheStore<unknown>('steam_known_fix_reports', null)` with the same `// ts-prune-ignore-next` note as `steamRestartHoldStore`, consumed only via a lazy `require('./storeManagers/steam/electronStores')` from the client module (keeps electron-store out of module load and out of unit tests; tests inject an in-memory `{get,set}`). Key: `${appId}:${key}:${op}`; value: `{ at: number, status: number }`. Parse defensively (disk is untrusted). Check `RECOGNIZED_CACHE_STORE_NAMES` (store-change notifier) before adding, since `CacheStore` writes call `notifyStoreChanged(filename)`; grep it and add the name if the list is closed.
- **Setting:** `AppSettings.shareDetectedFixes: boolean` in `src/common/types.ts` (next to `notifyHumbleExpirations`, L113); default `false` in `getFactoryDefaults()` (`config.ts` ~L343); read as `=== true`. UI: new `ShareDetectedFixes.tsx` modelled on `NotifyHumbleExpirations.tsx` (a `toggleRow` with `ToggleSwitch` + `InfoIcon`, which is the (i)-on-the-label-line pattern from memory) and on `AdvertiseAvxForRosetta.tsx` for the macOS gate (`const { platform } = useContext(ContextProvider); if (platform !== 'darwin') return <></>`). Export from `Settings/components/index.ts`, render in `GeneralSettings/index.tsx` (e.g. after `EnableSteamNativeInstall`). Translation keys `setting.shareDetectedFixes` / `help.shareDetectedFixes` with English defaults via `t(key, default)`, then `pnpm i18n` to regenerate `public/locales/en/translation.json` (the file currently has uncommitted changes in the working tree; the i18n churn guard runs in CI).
- **Help text must be exact (D-09):** sent = game id (appId), title, the detected fix (e.g. `macArch: 32`), add/remove, GameLib version; never = user id, file paths, logs. Also truthfully note that the relay sees the request's IP address (hashed, short-lived, never published).

### Pattern 3: GitHub App from a Worker (all calls strictly serial)
GitHub's content-write endpoints warn against parallel calls (409) and "creating content too quickly" triggers secondary rate limits [CITED: docs.github.com/en/rest/repos/contents, /rest/issues/issues]. Issue calls one at a time; map 409/422-conflict to a 503 so the client retries later.

**Auth.**
```typescript
// Source: docs.github.com generating-a-json-web-token-jwt-for-a-github-app (RS256; iat 60 s back; exp <= 10 min; iss = client ID or app ID)
const b64url = (b: ArrayBuffer | string) => /* base64url without padding */
export async function mintAppJwt(appId: string, pkcs8Pem: string, nowSec = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = { iat: nowSec - 60, exp: nowSec + 9 * 60, iss: appId }
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const der = Uint8Array.from(atob(pkcs8Pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body))
  return `${body}.${b64url(sig)}`
}
// POST https://api.github.com/app/installations/{INSTALLATION_ID}/access_tokens
//   Authorization: Bearer <jwt>   (NOT "token <jwt>")   Accept: application/vnd.github+json
//   X-GitHub-Api-Version: 2022-11-28   User-Agent: gamelib-fix-relay (GitHub rejects UA-less requests)
//   body: { "repositories": ["known-fixes"], "permissions": {"contents":"write","pull_requests":"write","issues":"write"} }
// -> { token, expires_at }  (1 h). Cache in a module-scope variable until 5 min before expires_at.
```
- **PKCS#1 vs PKCS#8:** GitHub downloads the app key as `-----BEGIN RSA PRIVATE KEY-----` (PKCS#1). WebCrypto `importKey('pkcs8', ...)` accepts only PKCS#8 (a PKCS#1 key is rejected; this is a documented failure in `universal-github-app-jwt`). Convert **once, by the operator, before `wrangler secret put`**: `openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app-pkcs8.pem`. The Worker should detect `BEGIN RSA PRIVATE KEY` and fail with a clear logged message (503, no secret in the message) rather than a cryptic DOMException. [CITED: web search of universal-github-app-jwt README + MDN SubtleCrypto.importKey]
- **iss:** GitHub recommends the client ID; the app ID also works. Store as var `GITHUB_APP_ID` (not secret).

**REST sequence** (owner/repo from vars; repo URL path is case-insensitive, the repo's canonical name is `Known-Fixes`, default branch `main` [VERIFIED: api.github.com 2026-11-02]):

| Step | Call | Notes |
|------|------|-------|
| 1 | `GET /repos/{o}/{r}/contents/steam/{id}-steam.json?ref=main` | 200 `{sha, content(base64 w/ newlines), encoding}` or 404 |
| 2 | `GET /repos/{o}/{r}/pulls?head={o}:report/steam-{id}&state=open` | open PR for D-06? (GitHub is the source of truth, D1 is only a hint) |
| 3a | open PR exists: `GET contents/...?ref=report/steam-{id}` -> merge -> `PUT contents/...` `{message, content, branch, sha}` | skip the PUT if the merged bytes are unchanged |
| 3b | none: `GET /repos/{o}/{r}/git/ref/heads/main` -> `POST /repos/{o}/{r}/git/refs {ref:"refs/heads/report/steam-{id}", sha}` | 422 "Reference already exists" = stale branch: `PATCH git/refs/heads/report/steam-{id} {sha, force:true}` |
| 4 | `PUT` (create/update, `sha` of main's file blob when updating) or `DELETE contents/... {message, sha, branch}` (D-08 file removal) | `committer`/`author` omitted -> the app is the author |
| 5 | `POST /repos/{o}/{r}/pulls {title, head, base:"main", body}` | store PR number in D1 |
| 6 | repeat report: `PATCH /repos/{o}/{r}/pulls/{n} {body}` | regenerate body from the D1 counts; throttle to counts 2,3,5,10,25,50,100.. to bound writes |
| D-11 | `POST /repos/{o}/{r}/issues {title, body, labels:["bundled-removal"]}` | see label caveat |

**Closed-unmerged PR (operator rejected):** if step 2 finds no open PR but `GET pulls?head=...&state=closed` shows a closed, unmerged PR for that branch, treat the report as operator-rejected: count it in D1, return 200 `suppressed`, and do not open a new PR. Without this a rejected fix reopens every time a new client reports it. This is a researcher recommendation inside the "Claude's discretion" area; flag to the user (Open Question 3).

**Label caveat:** GitHub's docs say only users with push access can set labels on a new issue and others are silently dropped; they do not say whether a missing label is auto-created [CITED: docs.github.com/en/rest/issues/issues]. Put "create label `bundled-removal`" in the operator checklist rather than relying on auto-create. [ASSUMED] that the app (write access) can apply an existing label.

### Pattern 4: D1 state, rate limits, dedup
```sql
-- relay/migrations/0001_init.sql  (apply: wrangler d1 migrations apply gamelib-fix-relay --local | --remote)
CREATE TABLE reports (
  app_id TEXT NOT NULL, key TEXT NOT NULL, op TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  last_version TEXT, pr_number INTEGER, issue_number INTEGER,
  PRIMARY KEY (app_id, key, op)
);
CREATE TABLE buckets (bucket TEXT PRIMARY KEY, n INTEGER NOT NULL, expires INTEGER NOT NULL);
```
```sql
INSERT INTO buckets (bucket, n, expires) VALUES (?1, 1, ?2)
  ON CONFLICT(bucket) DO UPDATE SET n = n + 1 RETURNING n;   -- atomic; verified under node:sqlite
```
- Bucket keys: `ip:<hash>:<YYYYMMDDHH>` (expires +2 h) and `cap:<YYYYMMDD>` (expires +2 d). `hash = hex(SHA-256(IP_HASH_SALT + ':' + ip + ':' + YYYYMMDD)).slice(0,32)`: the daily-rotating salt means a stored hash cannot link a person across days; the raw IP is never stored or logged. IP source: the `CF-Connecting-IP` header.
- Purge opportunistically: `DELETE FROM buckets WHERE expires < ?` on ~1% of requests (or a `triggers.crons` daily). Write budget: Free plan 100k rows written/day [CITED]; at these numbers an abuser exhausts per-IP limits long before the D1 budget. If D1 errors (including budget exhaustion) the relay **fails closed** with 503.
- **Recommended numbers (planner may adjust):** per-IP **10 requests/hour counting every attempt including rejected ones**; global **25 new PRs+issues per UTC day**; JSON body max 2 KB; repeats of an existing row do not consume the creation cap but do consume the IP limit.
- D1 `reports` row is a **cache and counter, never authoritative for PR existence** (a D1 write failure after a successful PR must not produce a second PR; step 2 re-finds the PR on GitHub).

### Pattern 5: File edit rules (pure functions, heavily unit-tested)
- Parse existing file with `JSON.parse`; must be a plain object else respond 200 `skipped` (log) and let the operator handle it.
- **Add:** if `existing[key] === value` -> `already-known` (no PR). Else set the key, **keep every other key verbatim and in order**, do NOT run the client's `filterTier1KnownFixes` over the existing file (that would delete tier-2/unknown keys the operator wrote). New file body: `{ "title": <canonical>, "<key>": "<value>" }`. Never overwrite an existing `title`.
- **Remove (macArch only):** delete `macArch`; if the remaining keys are a subset of `{title, notes}` -> DELETE the file; else PUT the rest. If the file has no `macArch` or does not exist on `main` -> D-11 issue.
- Serialise `JSON.stringify(obj, null, 2) + '\n'` (matches `steam/1603180-steam.json`, 2-space).
- **UTF-8:** GitHub's base64 contains newlines and the repo files contain non-ASCII (e.g. an em dash in notes). Decode with `atob(content.replace(/\n/g,''))` -> bytes -> `TextDecoder`; encode with `TextEncoder` -> bytes -> `btoa(String.fromCharCode(...))` (chunked). Never `btoa(str)` directly.
- Removal PR body must say: "If GameLib's bundled `public/fixes/steam/<id>-steam.json` also has this key, it also needs a release fix" (whole-file layer shadowing, Pitfall 5).

### Anti-Patterns to Avoid
- **KV for counters/caps:** non-atomic and eventually consistent.
- **Trusting D1 for "does a PR exist":** ask GitHub.
- **Writing the client-sent title anywhere** (file, PR title, PR body, issue). Use Steam's canonical name only, sanitised.
- **Awaiting the send in an install/launch path**, or `await`ing it in `verifyMacArchGroundTruth` before the badge-flip/`promptI386Recovery`.
- **A hand-rolled `env` literal in any spawn** (not applicable here unless a test spawns the sidecar: use `createFakeHomeProfile()`).
- **Parallel GitHub writes** (409 / secondary rate limit).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payload validation | `typeof` ladders | zod `.strict()` + `.refine` in `src/common/knownFixReport.ts` | Single source for client and relay (D-03); rejects unknown fields |
| RS256 signing | a JS RSA implementation | `crypto.subtle` (`RSASSA-PKCS1-v1_5`, SHA-256) | Native, constant-time; assembling the 3-part JWT is the only custom code |
| Counters / caps | read-modify-write in KV | D1 `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` | Atomic |
| Persisted sent-set | ad-hoc JSON file | `CacheStore` via lazy require | Established pattern (`steamRestartHoldStore`), corruption tolerant |
| Abort on exit | a new EOF listener | `createAbortController` registry | `releaseOnStdinEof` already calls `callAllAbortControllers()` |
| HTTP timeouts | bare `axios.post` | `AbortSignal.timeout` + axios `timeout` | Contract half 2: bound in-flight work |
| IP privacy | storing IPs | daily-salted SHA-256 buckets | Nothing linkable stored |
| Fake D1 for tests | a hand-written SQL emulator | `node:sqlite` `DatabaseSync` behind `D1Like` | Real SQLite semantics (UPSERT/RETURNING) |

**Key insight:** every hard part (atomicity, signing, shadowing semantics, exit drain) already has a primitive in Node, SQLite, WebCrypto, or this repo; the risk is in the seams (retry semantics, status mapping, layer awareness), not in missing libraries.

## Common Pitfalls

### Pitfall 1: D-16 "retries the next time the detector fires" is false for the Mach-O detector
**What goes wrong:** `verifyMacArchGroundTruth` returns early once `mac_arch_verified === true` or `mac_arch === '32'` with a non-known-fix source (library.ts ~L1944-1949), and it is only called on the install-complete tick or the focus-reconciliation false->true flip (L1739, L3300). After the verdict is persisted, no later event re-enters the reporting code. A network failure or 5xx on the 32-bit (and removal) report is therefore never retried. The CEG detector is different: `persistBridgeDrmSignal` runs on every `installBridgeGame`/`launchBridgeGame`, so it retries naturally. Also, enabling the setting after a verdict was already made never reports that old verdict.
**How to avoid:** Accept and document (best effort; "done when" is a fresh install), OR add one cheap retry seam: call `reportDetectedFix` from the early-return branch for an already-persisted `mac_arch:'32'`/`'macho'` verdict (idempotent via the sent record), noting that this branch is only reached on later focus-reconciliation flips so it will rarely fire. Recommend: accept and state it plainly in the plan; do not build a queue (D-16 forbids it).
**Warning signs:** a plan task claiming "retried on next launch" for the 32-bit path.

### Pitfall 2: 4xx-is-marked would permanently drop rate-limited reports
**What goes wrong:** D-16 marks every 4xx as sent. A relay answering 429 for a per-IP limit or the global daily cap would make the client never resend that fix.
**How to avoid:** Relay uses 429 + `Retry-After` for limits (semantically correct) and the client treats **408 and 429 like 5xx (not marked)**; every other 4xx (400/413/415/422) is a definitive rejection and is marked. This refines D-16's intent (a 4xx means "this payload is rejected", not "try later"). Flag for user confirmation (A2). Likewise the relay returns 503 (not 4xx) when Steam's appdetails or GitHub is unavailable, and 422 only for a definitive `success:false` unknown app.

### Pitfall 3: Steam appdetails behaviour
**What goes wrong:** `GET https://store.steampowered.com/api/appdetails?appids=220&filters=basic` returns `{"220":{"success":true,"data":{"type":"game","name":"Half-Life 2",...}}}`; a bad id returns `{"99999999":{"success":false}}` [VERIFIED: live curl 2026-11-02]. Multiple ids with `filters` return HTTP 400 (observed); query one id per call. `success:false` is also returned for region-locked, delisted or age-gated apps, so a legitimately owned delisted title would be rejected with a definitive 4xx. The endpoint is unofficial and rate-limited by IP (the Worker shares Cloudflare egress IPs).
**How to avoid:** Only call it for new rows (not repeats); 429/5xx/non-JSON from Steam -> relay 503. Sanitise the name (strip control chars and backticks/markdown, collapse whitespace, cap 200). Accept `type` in a small set (`game`; decide on `demo`/`dlc`), reject otherwise. Document that `success:false` titles can never be reported via this path (Open Question 4).

### Pitfall 4: `readKnownFixes` returns the merged winning entry but not its layer
**What goes wrong:** D-12 says skip when the winning entry already agrees, and send a removal only when the winning entry still says `macArch:"32"`. A hand-written **local** (`fixes/local/`) file is a user-private override; a removal report because of a local file would tell the operator to fix a repo file that does not contain the entry.
**How to avoid:** Add a thin `readKnownFixesWithLayer(appName, runner)` sibling in `knownFixes.ts` (same loop, returns `{ fix, layer }`) and skip both add and remove reports when `layer === 'local'`. Do not change `readKnownFixes`' signature. Add-skip uses the same call (`fix[key] === value`).

### Pitfall 5: Whole-file layer shadowing makes some PRs insufficient or invisible
**What goes wrong:** layers resolve local > bundled > remote, first parsed object wins the WHOLE file (knownFixes.ts). A bundled file lacking `drm` shadows a remote file that has it, so the D-12 check (winning entry) reports CEG, the relay merges `drm` into the remote file, and the user still never sees it until bundled is fixed. For removals, removing `macArch` from the remote file does nothing for users whose bundled file also has it.
**How to avoid:** Keep D-12 as decided, but make the PR body state the shadowing caveat (above). Do not try to solve it in this phase.

### Pitfall 6: CEG report must fire before the `userRoute === 'bridge'` early return
**What goes wrong:** `persistBridgeDrmSignal` returns `null` when the user forced the bridge, but the detector verdict (`drm.kind === 'ceg'`) is still definitive. Hooking after the `if (readBridgeVerdict(...).userRoute === 'bridge') return null` loses those reports.
**How to avoid:** Call `reportDetectedFix` right after `writeBridgeDrmVerdict(...)` when `drm?.kind === 'ceg'`, before the user-route check. `caller` does not matter. The hook sits in the private method so both call sites (L2460, L4469) are covered by one edit.

### Pitfall 7: Relay Worker needs only relative imports from `src/`
**What goes wrong:** wrangler's esbuild does not apply the root `baseUrl: ./src/`; `import 'common/...'` fails at bundle time. A shared module importing anything under `backend/` also drags electron-ish code in.
**How to avoid:** `src/common/knownFixReport.ts` imports only `zod` (resolved from the repo-root `node_modules`, upward from the file) and uses no path-aliased imports. The drift test (which needs `backend/knownFixes`) lives in `src/backend/__tests__`, not in `src/common`.

### Pitfall 8: PRIVACY.md becomes false
**What goes wrong:** PRIVACY.md states "The maintainer does not operate a server that receives your data" (intro) and "GameLib does not operate a server of its own" (section "Servers the maintainer controls"), and the destinations tables list every outbound host. This phase adds a maintainer-operated Worker that receives an opt-in report and sees IPs.
**How to avoid:** Add a plan task to update PRIVACY.md: intro sentence, a new row/section for the relay (opt-in, macOS, what is sent, IP hashed with a daily salt and kept ~2 h, nothing sent when the setting is off), and the "Servers the maintainer controls" section; also bump the "checked at commit" line. No gate enforces it (grep found none), so make it an explicit task.

### Pitfall 9: Sidecar must not be changed to hold the loop
**What goes wrong:** a send in flight at EOF holds the process open up to the timeout (~8 s) if not aborted.
**How to avoid:** the abort registration above; a unit test that starts a send with a never-resolving `post`, calls `callAllAbortControllers()`, and asserts the signal aborted and the promise settled. `pnpm smoke:sidecar` is not sufficient (it misses slow exit); no boot-time send exists, so it should stay green.

### Pitfall 10: Wrangler install side effects
`workerd` runs a postinstall, and `pnpm` 10 ignores build scripts unless allow-listed. Keep it inside `relay/` so the root install (and CI `pnpm install`) stays unchanged. Do not add `wrangler` to the root `package.json`.

## Code Examples

### Shared schema (D-03)
```typescript
// src/common/knownFixReport.ts  (imports: zod only)
import { z } from 'zod'
export const KNOWN_FIX_REPORT_PAIRS = { macArch: '32', drm: 'ceg' } as const  // mirrors TIER1_ROUTING_KEYS + filterTier1KnownFixes
export const knownFixReportSchema = z
  .object({
    v: z.literal(1),
    store: z.literal('steam'),
    appId: z.string().regex(/^[1-9][0-9]{0,9}$/),
    title: z.string().max(200).optional(),          // accepted, ignored by the relay (D-14)
    key: z.enum(['macArch', 'drm']),
    value: z.enum(['32', 'ceg']),
    op: z.enum(['add', 'remove']),
    gamelibVersion: z.string().regex(/^[0-9A-Za-z.+-]{1,40}$/)
  })
  .strict()
  .refine((r) => KNOWN_FIX_REPORT_PAIRS[r.key] === r.value, { message: 'pair not allowed' })
  .refine((r) => r.op === 'add' || r.key === 'macArch', { message: 'only macArch can be removed' })
export type KnownFixReport = z.infer<typeof knownFixReportSchema>
```
Drift test (Backend project): for every pair, `filterTier1KnownFixes('x','test',{[key]:value})` keeps it; every key is in `TIER1_ROUTING_KEYS` (export it, currently module-private) and a wrong value is rejected by both. Also assert `Object.keys(KNOWN_FIX_REPORT_PAIRS)` equals `TIER1_ROUTING_KEYS`.

### Worker entry and testable handler
```typescript
// relay/src/index.ts - the only file using Worker ambient types
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleReport(request, { db: env.DB, fetch, now: () => Date.now(), env })
  }
}
// handler.ts: pure, deps injected, returns Response; jest drives it with node:sqlite + a recorded fake GitHub/Steam fetch
```

### wrangler.jsonc
```jsonc
{
  "name": "gamelib-fix-relay",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-31",
  "observability": { "enabled": false },           // no request logging of IPs
  "vars": { "REPO_OWNER": "grayson-mitchell", "REPO_NAME": "known-fixes", "BASE_BRANCH": "main",
            "GITHUB_APP_ID": "<id>", "GITHUB_INSTALLATION_ID": "<id>" },
  "d1_databases": [{ "binding": "DB", "database_name": "gamelib-fix-relay", "database_id": "<id>", "migrations_dir": "migrations" }],
  "env": { "staging": { "name": "gamelib-fix-relay-staging", "vars": { "REPO_NAME": "<scratch-repo>" }, "d1_databases": [ /* staging db */ ] } }
}
```
Secrets (never in `vars`): `wrangler secret put GITHUB_APP_PRIVATE_KEY < app-pkcs8.pem`, `wrangler secret put IP_HASH_SALT`. Local: `relay/.dev.vars` (gitignored) + `wrangler dev` + `wrangler d1 migrations apply gamelib-fix-relay --local`. [CITED: developers.cloudflare.com/workers/wrangler/configuration]. Note: non-inheritable keys (`vars`, `d1_databases`) must be restated per `env`.

### PR body (discretion)
```
Detected by GameLib <version> (<detector: post-install Mach-O check | PE CEG scan>) on macOS.
Change: add `macArch: "32"` to steam/<id>-steam.json   (title from Steam: `<canonical>`)
Reports received: N (first <date>, latest <date>)
Review checklist: [ ] title matches the game  [ ] bundled public/fixes copy also needs a release fix (removals)
```
Put canonical title only inside a code span; no `@`/`#` outside code spans (mention and cross-reference injection).

## Operator Checklist (D-01, D-02) - plan must include a `checkpoint:human-action` before the live gate

1. **Cloudflare:** create an account (Workers Free includes D1 [CITED]); `pnpm wrangler login` from `relay/`.
2. **D1:** `wrangler d1 create gamelib-fix-relay`; paste the `database_id` into `wrangler.jsonc`; `wrangler d1 migrations apply gamelib-fix-relay --remote`.
3. **GitHub App** (github.com -> Settings -> Developer settings -> GitHub Apps -> New): name e.g. `GameLib Fix Relay`; Homepage = GameLib repo; **Webhook: inactive**; Repository permissions: **Contents: Read & write, Pull requests: Read & write, Issues: Read & write** (Metadata read is automatic); "Where can this app be installed": **Only on this account**. Create, note the **App ID / Client ID**, **Generate a private key** (downloads a PKCS#1 `.pem`).
4. **Install** the app on `grayson-mitchell/known-fixes` only (select repositories); note the **installation ID** from the URL `/settings/installations/<id>`.
5. **Convert the key:** `openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app-pkcs8.pem`; keep both files out of the repo; delete after upload.
6. **Secrets:** `wrangler secret put GITHUB_APP_PRIVATE_KEY < app-pkcs8.pem`; `wrangler secret put IP_HASH_SALT` (random 32+ bytes).
7. **Vars:** set `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID` in `wrangler.jsonc`.
8. **Label:** create label `bundled-removal` on known-fixes (see label caveat).
9. **Optional:** repo setting "Automatically delete head branches" so merged `report/steam-*` branches disappear (the relay still handles a stale branch).
10. **Deploy:** `wrangler deploy`; record the `*.workers.dev` URL; **fill `GAMELIB_FIX_RELAY_URL` in the client** (a plan task must come after this checkpoint; a unit test should fail on the placeholder string so it cannot ship).
11. **Smoke:** `curl -X POST <url>/v1/reports -d '{}'` -> expect 400/422 and no GitHub activity; then the live gate on this Mac.
12. **Staging (recommended before the live gate):** a scratch repo + `--env staging`, point the client with `GAMELIB_FIX_RELAY_URL`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `wrangler.toml` | `wrangler.jsonc` recommended for new projects | current docs | Use jsonc; some new features are JSON-only |
| GitHub OAuth/PAT in a worker | GitHub App installation token (1 h), scoped to one repo | ongoing | No long-lived credential; permissions limited to the repo |
| KV counters | D1 / Durable Objects for strong consistency | ongoing | Use D1 |
| `iss` = App ID | GitHub recommends client ID (App ID still accepted) | current docs | Either; use whichever the operator copies |

**Deprecated/outdated:** do not use `Authorization: token <jwt>` (must be `Bearer`).

## Runtime State Inventory

Not a rename/refactor/migration phase (greenfield relay + additive client hooks). Omitted.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | wrangler, @cloudflare/workers-types legitimate (slopcheck could not run) | Package Legitimacy | Low: official Cloudflare packages; planner gates install with human-verify |
| A2 | Treating 408/429 as retryable (not marked) is acceptable as a refinement of D-16 "4xx also marked" | Pitfall 2, Pattern 1 | A rate-limited report would otherwise be lost forever; user should confirm |
| A3 | Suppressing reports for a PR the operator closed unmerged (D-06 branch name reused) | Pattern 3 | Without it, a rejected fix reopens; with it, a wrongly closed PR needs a manual path |
| A4 | An app with write access can apply an existing label on issue create; label auto-create unknown | Pattern 3 | Issue opens without label; mitigated by operator pre-creating the label |
| A5 | Per-IP 10/h, global 25 creations/day, 2 KB body are sane starting numbers | Pattern 4 | Too tight blocks legitimate users; too loose enables spam; all are vars |
| A6 | `node:sqlite` is available in the CI Node 22.x (`setup-node` with `engines >=22`; unflagged from 22.13) | Validation | If CI resolves older 22.x, relay SQL tests fail; fall back to a hand fake or pin Node |
| A7 | Steam `appdetails` name for a `type:"game"` app is safe to use after sanitising; delisted `success:false` titles are acceptable losses | Pitfall 3 | A real fix for a delisted title can't be reported |
| A8 | Cloudflare account/Workers Free needs no payment method | Operator Checklist | Operator surprise only |
| A9 | `CF-Connecting-IP` is always present for client requests to a workers.dev route | Pattern 4 | If absent, fall back to a single shared bucket (fail safe) |

## Open Questions

1. **32-bit/removal retry (Pitfall 1).** What we know: the Mach-O detector fires once per install. Unclear: whether the user wants a retry seam. Recommendation: accept best-effort, state it in the plan.
2. **429/408 handling (Pitfall 2).** Recommendation: not-marked/retryable; needs a one-line confirmation because D-16 says "a 4xx is also marked".
3. **Operator-closed PRs.** Recommendation: count and suppress (A3); confirm with the user.
4. **Delisted/region-locked titles** fail the canonical-title check (D-14); acceptable? Recommendation: yes, log-only.
5. **`title` on the wire.** D-14 means the relay never uses it, yet D-09 lists the title as sent. Recommendation: keep it (matches locked help text), schema `optional`, ignored; dropping it would be a pure privacy gain if the user prefers.
6. **Hook placement for `verifyMacArchGroundTruth`.** Recommend after the badge-flip/`logInfo` block, before `void promptI386Recovery(appId)`: `reportDetectedFix({ appId, title: library.get(appId)?.title, key:'macArch', value:'32', op:'add', detector:'macho' })`; and in the `wasKnownFix32 && verdict === '64'` block with `op:'remove'`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | relay tests, wrangler | yes | v22.23.4 | — |
| pnpm | install | yes | 12.16.1 (repo pins 10.28.0) | — |
| `node:sqlite` | relay D1 SQL tests | yes (verified under repo Jest) | built-in | in-memory fake `D1Like` |
| gh CLI | optional repo/label setup | yes | /opt/homebrew/bin/gh | web UI |
| wrangler | deploy / `wrangler dev` | no (not installed globally) | 4.156.0 on npm | installed per-`relay/` by the plan |
| Cloudflare account | deploy | operator-created, unknown | — | blocks only the live gate |
| GitHub App | live gate | operator-created, unknown | — | blocks only the live gate |
| network to api.github.com / store.steampowered.com | live gate, wrangler | yes (curl verified from this Mac) | — | — |
| slopcheck | package audit | no (install denied) | — | `[ASSUMED]` + human-verify gate |

**Missing with no fallback:** Cloudflare account and GitHub App (operator checkpoint). **Missing with fallback:** wrangler (per-relay install).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7 + ts-jest (existing); projects Backend / Common / Frontend / Preload / Meta, add Relay |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js` (add `'<rootDir>/relay'` to `projects`), new `relay/jest.config.js` |
| Quick run command | `pnpm jest src/backend/__tests__/knownFixReport.test.ts src/common/__tests__/knownFixReport.test.ts relay` |
| Full suite command | `pnpm test:ci` (plus `pnpm smoke:sidecar`, `tsc -p relay --noEmit`) |

### Phase Decisions -> Test Map
| ID | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| D-03 | Schema pairs equal `TIER1_ROUTING_KEYS` and pass `filterTier1KnownFixes` | unit | `pnpm jest src/backend/__tests__/knownFixReportDrift.test.ts` | Wave 0 |
| D-03 | Strict schema accepts valid, rejects extra keys, bad pair, `drm`+`remove`, non-numeric appId | unit | `pnpm jest src/common/__tests__/knownFixReport.test.ts` | Wave 0 |
| D-04 | URL constant not the placeholder; env override wins | unit | `pnpm jest src/backend/__tests__/knownFixReport.test.ts -t url` | Wave 0 |
| D-09/D-10 | Toggle renders on darwin only, writes `shareDetectedFixes`, has InfoIcon; backend default false | unit (frontend + backend) | `pnpm jest src/frontend/screens/Settings` ; `pnpm jest src/backend/__tests__/config` | Wave 0 |
| D-10 | Setting off -> `post` never called; non-mac -> never called | unit | `pnpm jest src/backend/__tests__/knownFixReport.test.ts -t gate` | Wave 0 |
| D-12 | Add skipped when winning layer agrees; CEG passes when file has only macArch; removal only when winning still 32; local-layer skipped | unit | same file `-t skip` | Wave 0 |
| D-16 | Mark on 2xx and non-408/429 4xx; not on 5xx/429/408/network/abort | unit | same file `-t sent` | Wave 0 |
| exit contract | Controller registered; `callAllAbortControllers()` aborts an in-flight send; no un-unref'd timer; send never rejects | unit | same file `-t abort` | Wave 0 |
| hooks | 32 verdict, 64-vs-curated-32, and CEG (including forced-bridge) each call `reportDetectedFix`; call is not awaited | unit | extend `library.test.ts`, new games test around `persistBridgeDrmSignal` | Wave 0 |
| D-05..D-08 | Create/merge/remove/delete-file bytes, key order, UTF-8 round-trip | unit | `pnpm jest relay -t fileEdit` | Wave 0 |
| D-06 | Existing open PR -> commit on branch, no second PR; stale branch -> force reset | unit with scripted fake GitHub `fetch` | `pnpm jest relay -t pr` | Wave 0 |
| D-11 | Remove + no file/key on main -> issue with label, once | unit | `pnpm jest relay -t bundled` | Wave 0 |
| D-13 | Repeat increments count, no new PR, body PATCH log-throttled | unit (node:sqlite) | `pnpm jest relay -t repeat` | Wave 0 |
| D-14 | Unknown app -> 422; Steam 5xx -> 503; canonical title written, client title never appears in any outbound GitHub body | unit | `pnpm jest relay -t title` | Wave 0 |
| D-15 | 11th request/hour -> 429; cap -> 429; hash is not the raw IP and rotates by day | unit | `pnpm jest relay -t limits` | Wave 0 |
| D-02 | JWT header/claims, RS256 verifies with the matching public key, PKCS#1 key gives a clear error | unit (generate a keypair in the test with WebCrypto) | `pnpm jest relay -t jwt` | Wave 0 |
| D-01 | Worker boots under `wrangler dev`, rejects `{}` | manual smoke | `cd relay && pnpm wrangler dev` + curl | manual |
| Done-when | Real install of a 32-bit Mac title with setting on opens a correct PR; setting off sends nothing | manual live gate (operator + this Mac) | UAT item | manual-only (needs real account, app, Mac) |

### Sampling Rate
- **Per task commit:** the quick run command for the touched area.
- **Per wave merge:** `pnpm test:ci` + `tsc -p relay --noEmit` + `pnpm lint`.
- **Phase gate:** full suite green + `pnpm smoke:sidecar` + staging-relay dry run, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `relay/jest.config.js` + root `projects` entry; `relay/tsconfig.json`
- [ ] `relay/src/__tests__/` helpers: `node:sqlite` `D1Like` adapter, scripted fake `fetch` (GitHub + Steam), WebCrypto test keypair
- [ ] All test files in the map above (none exist)
- [ ] Export `TIER1_ROUTING_KEYS` from `knownFixes.ts` (currently module-private)
- Framework install: none for root (Jest present). `relay/` install is the checkpointed `pnpm install --ignore-workspace`.

## Security Domain

### Applicable ASVS Categories (L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (public opt-in endpoint, no user identity) | — ; abuse handled by V13/rate limits |
| V3 Session Management | no | stateless |
| V4 Access Control | yes (credential scope) | GitHub App limited to one repo + 3 permissions; installation token `repositories`/`permissions` narrowed per mint |
| V5 Input Validation | yes | zod strict schema, size cap, pair allow-list, canonical title; sanitise Steam name |
| V6 Cryptography | yes | WebCrypto RS256; SHA-256 for IP hashing; never hand-rolled |
| V7 Logging | yes | no IPs/headers/bodies in logs; `observability` disabled; client logs report + status only |
| V8 Data Protection | yes | IP stored only as daily-salted hash for ~2 h; no user id/path/log collected; secrets only via `wrangler secret` |
| V13 API | yes | method/content-type/size limits, rate limits, daily cap, fail closed |
| V14 Config | yes | secrets not in `vars`/repo; private key + PKCS#8 file deleted after upload |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Title/markdown/@mention injection into repo or PR | Tampering | Never use client title; canonical Steam name sanitised, inside a code span only; JSON serialised with `JSON.stringify` |
| Payload smuggling (extra keys such as `launchArgs`, `exeOverride`) | Elevation | `.strict()` + fixed pair table; key/value from constants, never echoed from input |
| PR/issue spam for real appIds | DoS / Spoofing | per-IP + daily cap; one PR per appId (D-06); repeats only count; operator review; closed-PR suppression |
| Branch/path injection via appId | Tampering | regex `^[1-9][0-9]{0,9}$`; branch and path built only from validated digits |
| Stolen/leaked GitHub key | Information disclosure / EoP | App scoped to one repo, short-lived tokens, secret store, revocable key; operator can regenerate |
| Unauthenticated endpoint scraped or flooded | DoS | 2 KB cap, method/content-type checks before parsing, IP bucket checked first, D1 failure -> 503; optional Cloudflare WAF rate rule |
| IP deanonymisation | Information disclosure | hash + daily salt + short expiry, no raw IP anywhere, privacy doc updated |
| Open redirect / SSRF via Steam fetch | Tampering | fixed host, id interpolated only after regex validation, `redirect: 'error'` |
| Client sends when disabled | Repudiation | gate reads setting at send time; test asserts zero calls when off |
| Hostile dev override of relay URL in production | Tampering | env override is a local-process env var only; document as dev/testing |

## Sources

### Primary (HIGH confidence)
- Repo code read this session: `src/backend/knownFixesFetcher.ts`, `knownFixes.ts`, `storeManagers/steam/{library.ts, games.ts, macArchKnownFix.ts, drmKnownFix.ts, electronStores.ts, steamRestartHold.ts}`, `utils/aborthandler/aborthandler.ts`, `sidecar/stdinEofRelease.ts`, `platform/index.ts`, `config.ts`, `frontend/.../EnableSteamNativeInstall.tsx`, `NotifyHumbleExpirations.tsx`, `AdvertiseAvxForRosetta.tsx`, `GeneralSettings/index.tsx`, jest configs, `PRIVACY.md`, `.claude/skills/gamelib-conventions/SKILL.md`
- Live checks 2026-11-02: Steam `appdetails` shapes (success / `success:false` / multi-id 400); `api.github.com/repos/grayson-mitchell/known-fixes` (default_branch `main`, issues enabled, canonical name `Known-Fixes`, only `steam/1603180-steam.json` present); `npm view` versions; `node:sqlite` UPSERT/RETURNING under repo Jest; `pnpm install --ignore-workspace` layout test

### Secondary (MEDIUM confidence, official docs fetched)
- https://developers.cloudflare.com/workers/wrangler/configuration/ (jsonc recommended, kv/d1/vars shapes)
- https://developers.cloudflare.com/d1/platform/pricing/ (Free limits)
- https://developers.cloudflare.com/kv/concepts/how-kv-works/ (eventual consistency, no atomic ops)
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ (per-location, approximate, 10/60 s, wrangler >=4.36.0)
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app (RS256, iat -60 s, exp <= 10 min, Bearer)
- https://docs.github.com/en/rest/repos/contents and /rest/issues/issues (PUT/DELETE contents params, 409 on parallel writes, labels need push access, secondary rate limits)

### Tertiary (LOW confidence)
- Web search: PKCS#1 vs PKCS#8 for WebCrypto and the `openssl pkcs8 -topk8` conversion (universal-github-app-jwt README, MDN importKey); consistent with widely known behaviour but not read from GitHub's own page
- GitHub endpoints for refs (`git/ref/heads/...`, `POST git/refs`, `PATCH ... force`), `GET pulls?head=owner:branch`, PR PATCH: from training knowledge, not re-fetched this session (A-level HIGH familiarity, mark for verification in the staging run)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH. Versions verified; slopcheck unavailable.
- Architecture: HIGH for client integration (code read); MEDIUM for relay (docs plus staging run will confirm GitHub edge cases).
- Pitfalls: HIGH for 1, 2, 4, 5, 6, 8 (from code/doc reading); MEDIUM for 3 (unofficial Steam API).

**Research date:** 2026-11-02
**Valid until:** ~2026-12-02 (wrangler releases weekly; re-check `npm view wrangler version` and `compatibility_date` at plan time)
