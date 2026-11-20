---
phase: quick-261026-piq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot/cdnAuth.ts
  - src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts
  - .planning/todos/pending/2026-10-26-chunk-timeouts-by-depot-or-host-unmeasured.md
  - .planning/todos/completed/2026-10-25-empty-cdn-auth-token-for-depot-200511-and-high-chunk-timeout-rate.md
autonomous: true
requirements:
  - TODO-2026-10-25-empty-cdn-auth-token (direction 1)

must_haves:
  truths:
    - "A GetCDNAuthToken reply with eresult=1 (OK) that decodes cleanly with an empty token resolves getToken to '' and is cached as 'no token required' for CDN_AUTH_NO_TOKEN_TTL_MS (30 min)"
    - "Within that TTL no further _send happens for that depot+host, including inside the last PROACTIVE_REFRESH_BUFFER_MS (5 min) of the TTL"
    - "After the TTL expires, the next getToken re-fetches"
    - "A no-token reply produces exactly one logInfo line per fetch, carrying eresult, rawBodyShape, rawBodyBytes and decodedExpirationTime, with no Error object or stack and no token content; it produces no logWarning"
    - "invalidate() clears a no-token entry, so the next getToken re-fetches"
    - "Real failures (eresult != OK, decode error, timeout, and empty token with an undefined eresult) still take the 60s CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS path with the existing logWarning, unchanged"
  artifacts:
    - path: "src/backend/storeManagers/steam/depot/cdnAuth.ts"
      provides: "No-token positive result and long-TTL cache entry"
      contains: "export const CDN_AUTH_NO_TOKEN_TTL_MS = 30 * 60 * 1000"
    - path: "src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts"
      provides: "No-token TTL, re-fetch, logging and invalidate tests"
      contains: "CDN_AUTH_NO_TOKEN_TTL_MS"
    - path: ".planning/todos/pending/2026-10-26-chunk-timeouts-by-depot-or-host-unmeasured.md"
      provides: "Split-out direction 2 of the original todo"
      contains: "ready: live-gate"
    - path: ".planning/todos/completed/2026-10-25-empty-cdn-auth-token-for-depot-200511-and-high-chunk-timeout-rate.md"
      provides: "Original todo, closed with a resolution note"
      contains: "## Resolution"
  key_links:
    - from: "CdnAuthTokenCache.getToken cache-hit check"
      to: "CachedToken.noToken"
      via: "freshness margin of 0 for no-token entries instead of PROACTIVE_REFRESH_BUFFER_MS"
      pattern: "noToken"
    - from: "callGetCDNAuthToken empty-token branch"
      to: "resolvePromise (not reject)"
      via: "eresult === ERESULT_OK gate"
      pattern: "CDN_AUTH_NO_TOKEN_TTL_MS"
---

<objective>
Stop treating a clean eresult=OK, empty-token GetCDNAuthToken reply as a failure. Today
`callGetCDNAuthToken` rejects it with 'ContentServerDirectory.GetCDNAuthToken: empty response',
and `fetch()` logs a warning with the Error (so with a stack) and arms the 60s failure cooldown.
The result is a re-fetch plus two warnings and a stack trace per depot+host every minute for the
whole download. Live evidence shows the reply means "this depot needs no token". The same type=CDN
hosts served chunks token-less with zero timeouts in the 10-23 log, and the 2026-09-07 Californium
run in `.planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md`
showed the same. So cache '' as a positive result for 30 minutes and log it once at info level.

Then split the todo's unanswerable direction 2 (timeout clustering) into its own live-gate todo and
close the original.

Purpose: remove about 100 stack traces and per-minute redundant CM round-trips per XCOM-sized
download, and keep real failures on their existing path.
Output: modified cdnAuth.ts and cdnAuth.test.ts, one new pending todo, one todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-10-25-empty-cdn-auth-token-for-depot-200511-and-high-chunk-timeout-rate.md
@src/backend/storeManagers/steam/depot/cdnAuth.ts
@src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts
@src/backend/storeManagers/steam/__tests__/fixtures/cdnAuthSendFixture.ts

<interfaces>
Extracted from the code. The executor does not need to explore further.

cdnAuth.ts (708 lines):
- Module doc comment, lines 1-~200. The REGRESSION GUARD paragraph (~150-170) says a failed or
  timed-out fetch is negative-cached and `getToken` "degrades to ''". The TOKEN FORMAT paragraph
  (~72) already says getToken returns "'' when no token is available/needed".
- `describeRawBody(raw)` (~322-344) never throws and returns `{ shape, byteLength }`. Its doc
  comment says it runs "on the path that is ABOUT to log a diagnostic and reject". Update that
  wording, since the clean-OK path now resolves.
- `export const PROACTIVE_REFRESH_BUFFER_MS = 5 * 60 * 1000` (~353)
- `export const CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS = 3000` (~360)
- `export const CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS = 60 * 1000` (~371)
- `interface CachedToken { token: string; expiresAt: number }` (~373)
- Class doc comment (~378-404) lists the fetch outcomes. Add the no-token outcome there.
- `getToken` (~438): checks the cooldown first, then
  `if (cached && cached.expiresAt - Date.now() > PROACTIVE_REFRESH_BUFFER_MS) return cached.token`,
  then pending coalescing.
- `private async fetch(depotId, host, key)` (~521-557): on success it sets `this.cache` to the
  result, deletes the negativeCache entry, and calls `logInfo('[Timing] CDN auth token acquired: ... tokenLen=... expiresInMs=...')`.
  On catch it sets the negativeCache cooldown and calls `logWarning([msg, err])`.
- `private callGetCDNAuthToken(depotId, host): Promise<{ token: string; expiresAt: number }>`
  (~586-695). In the `_send` callback: settled guard, then
  `const eresult = hdr?.proto?.eresult`, then reject if `eresult !== undefined && eresult !== ERESULT_OK`,
  then decode (reject on throw), then `if (!body.token) { describeRawBody; logWarning([...]); reject(new Error('...empty response')) }`
  (~645-680). The success branch maps expiration_time from seconds to ms.
- `invalidate(depotId, host)` (~705) runs `this.cache.delete(key)`. That already clears any
  cache entry, including the new no-token one. Keep it as is and update only its doc comment.
- `const ERESULT_OK = 1` (local constant).

Test file: `jest.mock('backend/logger', () => ({ logInfo: jest.fn(), logWarning: jest.fn(), ... }))`,
with `jest.clearAllMocks()` in beforeEach. The fake-timer pattern is `jest.useFakeTimers()` inside
try/finally with `jest.useRealTimers()`, plus `jest.advanceTimersByTime(...)`. `Date.now()` follows
the fake clock, as the existing cooldown test at ~234-265 relies on.
`makeFakeClient(impl)` is `makeFakeSendClient` from the fixture. `impl` returns
`{ token?, expiration_time?, eresult? }` with eresult defaulting to 1, and the fixture returns
`{ client, calls }`. `{ token: '' }` or `{}` from impl gives an eresult=1 empty-token reply, so the
fixture needs no change. No existing test asserts the 'empty response' string. Today the empty-OK
path is not directly tested.

Callers (checked with graphify query and then grep at planning time):
- `src/backend/storeManagers/steam/depot/decompress.ts:1091-1093` calls
  `wantsCdnAuthToken(meta) && cdnAuth ? await cdnAuth.getToken(depotId, host, signal) : ''`.
  It appends '' verbatim, so '' already means "send token-less". Nothing treats '' as a failure.
- `decompress.ts:1136-1142` calls `cdnAuth.invalidate(depotId, host)` on a 401/403 when
  `wantsCdnAuthToken(meta)`.
- `src/backend/storeManagers/steam/depot.ts` only constructs `new CdnAuthTokenCache(client, Number(appId))`
  (~1361, ~4185, ~4347) and threads it through. It never calls getToken or invalidate.
- `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts:1948-1995` sends an empty body
  with `eresult: 5`, so it stays on the failure path and needs no change.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Cache a clean eresult=OK empty-token reply as "no token required" for 30 minutes</name>
  <files>src/backend/storeManagers/steam/depot/cdnAuth.ts, src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts</files>
  <behavior>
    - Test A (not re-fetched within TTL): with fake timers, impl returns `{ token: '' }` (eresult defaults to 1). The first getToken resolves ''. An immediate second call resolves '' with calls.length === 1. After `jest.advanceTimersByTime(CDN_AUTH_NO_TOKEN_TTL_MS - PROACTIVE_REFRESH_BUFFER_MS + 1000)` (inside the window where a normal token would be proactively refreshed), still '' and still 1 call. After advancing further to `CDN_AUTH_NO_TOKEN_TTL_MS - 1` total, still 1 call.
    - Test B (re-fetched after TTL): same setup, but impl returns `{ token: '' }` on the first call and a real `'?later-token'` with a +3600s expiration_time on the second. After `advanceTimersByTime(CDN_AUTH_NO_TOKEN_TTL_MS + 1)`, getToken resolves '?later-token' and calls.length === 2.
    - Test C (logging): after one no-token getToken, logWarning has not been called and logInfo has been called exactly once. Its message is a plain string: not an array, and with no Error instance among any of its arguments. It contains the depot, the host, `eresult=1`, `rawBodyShape=`, `rawBodyBytes=` and `decodedExpirationTime=`. A second getToken within the TTL adds no further logInfo call.
    - Test D (invalidate): after a no-token getToken, `cache.invalidate('12345', 'host-a')`, then the next getToken calls _send again (calls.length === 2). Invalidate does not start a cooldown.
    - Test E (an empty token without a clean OK is still a failure): build a hand-rolled `CDNAuthTokenClient` whose `_send` calls back with `encodeResponse({})` and `{ proto: {} }` (eresult undefined). getToken resolves '', logWarning is called, and a second immediate call makes no further _send, which shows the 60s cooldown armed. This pins the decision that only an explicit eresult === ERESULT_OK counts as "no token required".
    - All existing tests keep passing unchanged: failure (eresult 5/2), timeout, cooldown, abort, coalescing and SECURITY.
  </behavior>
  <action>
In cdnAuth.ts, after `CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS`, add a doc-commented
`export const CDN_AUTH_NO_TOKEN_TTL_MS = 30 * 60 * 1000`. Its doc says a clean eresult=OK
empty-token reply is Steam's definitive "this depot+host needs no token" answer. Cite the 10-23
log and the 2026-09-07 Californium run in one line each. Say it is cached rather than re-asked,
and that the TTL is finite only so a later Valve policy change is still picked up within a
download.

Extend `CachedToken` with an optional `noToken?: true` flag.

In `getToken`'s cache-hit check, use a freshness margin of 0 for a `noToken` entry and
`PROACTIVE_REFRESH_BUFFER_MS` otherwise. A no-token entry is served while
`expiresAt - Date.now() > 0`. Without this, a no-token entry would be re-fetched 5 minutes early,
and with a TTL at or below 5 minutes it would be re-fetched immediately. Proactive refresh exists
to avoid a token expiring mid-chunk, and there is no token here to expire. Add a short comment
saying so.

Change the return type of `callGetCDNAuthToken` to `Promise<CachedToken>`. Inside the `_send`
callback's `if (!body.token)` branch:
- If `eresult === ERESULT_OK`, call `describeRawBody(rawBody)` and emit ONE `logInfo` with a plain
  string, not an array and with no Error. The string carries depot, host, eresult, rawBodyShape,
  rawBodyBytes, decodedExpirationTime and `noTokenTtlMs=${CDN_AUTH_NO_TOKEN_TTL_MS}`, under
  LogPrefix.Steam, with wording like 'CdnAuthTokenCache: no CDN auth token required (empty token,
  eresult=OK)'. Never log token content. Then resolve
  `{ token: '', expiresAt: Date.now() + CDN_AUTH_NO_TOKEN_TTL_MS, noToken: true }`.
  Deliberately ignore the decoded expiration_time for the TTL; it still appears in the log line.
- Otherwise (eresult undefined), keep the existing logWarning diagnostic and the 'empty response'
  rejection exactly as they are. That is a failure and keeps the 60s cooldown.

In `fetch()`, keep `this.cache.set(key, result)` and `this.negativeCache.delete(key)`. Emit the
existing '[Timing] CDN auth token acquired' logInfo only when `!result.noToken`, so the no-token
path logs exactly once per fetch. Leave the catch block untouched, so real failures keep the 60s
cooldown and the logWarning with err.

Leave the body of `invalidate()` untouched. Its `cache.delete` already clears a no-token entry.

Update the doc comments in proportion to the change, matching the existing dense style without
adding new essays:
- the REGRESSION GUARD paragraph of the module doc: one or two sentences noting that a clean-OK
  empty token is a positive cached result, not a failure;
- the class doc's outcome list: one new bullet;
- `getToken`'s doc: '' now also means "no token required";
- the cycle-12 DIAGNOSTIC comment in the empty-token branch: rewrite it to say what the
  live evidence settled;
- `describeRawBody`'s doc: it no longer always runs "about to reject";
- `invalidate()`'s doc: it also clears a no-token entry, so a 401/403 re-asks.
Do not edit decompress.ts or depot.ts. Planning-time inspection shows that '' is already appended
verbatim as "token-less", and no caller treats '' as failure.

In cdnAuth.test.ts, import `CDN_AUTH_NO_TOKEN_TTL_MS` and add Tests A-E from `<behavior>` as a new
`describe('no-token reply (eresult=OK, empty token) — quick 261026-piq', ...)` block. Use the
existing fake-timer try/finally pattern and the existing `makeFakeClient` and `encodeResponse`
helpers. Write the tests first and confirm they fail against the current code (RED), then
implement (GREEN).
  </action>
  <verify>
    <automated>pnpm jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/depot/cdnAuth.ts src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts</automated>
  </verify>
  <done>
Tests A-E pass, every pre-existing test in the three suites still passes, codecheck is clean, and
prettier passes on both src files. `grep -n "CDN_AUTH_NO_TOKEN_TTL_MS = 30 \* 60 \* 1000" src/backend/storeManagers/steam/depot/cdnAuth.ts`
matches one line. The 'empty response' rejection now survives only for a non-OK eresult.
  </done>
</task>

<task type="auto">
  <name>Task 2: Split direction 2 into a new live-gate todo and close the original</name>
  <files>.planning/todos/pending/2026-10-26-chunk-timeouts-by-depot-or-host-unmeasured.md, .planning/todos/completed/2026-10-25-empty-cdn-auth-token-for-depot-200511-and-high-chunk-timeout-rate.md</files>
  <action>
Create `.planning/todos/pending/2026-10-26-chunk-timeouts-by-depot-or-host-unmeasured.md`. Its
frontmatter mirrors the original's: `created: 2026-10-26`, a `title:` along the lines of "Whether
the ~18% chunk-timeout rate in the 2026-10-25 XCOM download clusters on depot 200511 or on
particular hosts is unmeasured", `source:` naming quick 261026-piq split out of the 10-25 todo,
`area: steam-depot-download`, and `files:` listing `src/backend/storeManagers/steam/depot.ts`.
Then, in exactly this order, bare and lowercase per the gamelib-conventions todo-triage rule:
`severity: medium`, `platform: any`, `ready: live-gate`.

The body must state these facts:
- In the 10-25 run (stats at @1786s), totalAttempts was 9693, timeouts 1707 (~18%) and rotations
  1732, with downSpeedMiBs swinging 13.46 -> 0.00.
- That log has since rotated away, so clustering cannot be answered from it.
- The empty-token cause is removed by quick 261026-piq, so it is no longer a confound.
- The `[Timing] chunk-stream stats` lines (depot.ts ~2498-2630) already carry the per-host
  `worstHosts=[host[a=N ok=N to=N err=N ...]]` counts, so the next live XCOM 200510 run answers
  the host half with no code change. The depot half would still need per-depot timeout counts or
  a stats line scoped to a depot. Say this as an open question, not a decision.
- What the 2026-10-23 log (`~/Library/Logs/GameLib/gamelib.log.pre-51-29-20261023-214423`, XCOM
  200510 plus 230070) showed, measured at planning time:
  - worst stats line @760s: totalAttempts=27167, timeouts=84 (~0.3%) and rotations=86;
  - the largest share of timeouts on fastly.cdn.steampipe.steamcontent.com (to=47 of a=1637,
    avgMs=4110, plus one UND_ERR_CONNECT_TIMEOUT), then alibaba (to=13 of 5371), the three
    SteamCache hosts (10/7/5) and akamaized (to=2);
  - an earlier stats line (@45-55s) with alibaba a=1362 ok=1362 to=0 and timeouts=0 on all six
    hosts, even though 200511 logged the empty-token reply (28 such lines for 200511 in that log).
  Before copying these numbers, re-grep the log if it still exists. If it has rotated, keep the
  numbers attributed as "measured 2026-10-26 during planning".
- The 10-25 rate of ~18% is about 60x the 10-23 rate, and the cause is unknown. Do not assert one.

Then `git mv` the original todo from pending/ to
`.planning/todos/completed/2026-10-25-empty-cdn-auth-token-for-depot-200511-and-high-chunk-timeout-rate.md`.
Add `status: RESOLVED` to its frontmatter, matching
`.planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md`,
and append a `## Resolution (2026-10-26, quick-261026-piq)` section. That section covers:
- Direction 1 is fixed. An eresult=OK empty token is now cached as "no token required" for
  `CDN_AUTH_NO_TOKEN_TTL_MS` (30 min), with one info line per fetch, no stack and no 60s cooldown.
- The evidence: the 10-23 token-less type=CDN hosts serving with zero timeouts, and the 09-07
  Californium run.
- Direction 2 is split to the new todo, named by its path.
- Real failures still take the 60s cooldown and the warning.
  </action>
  <verify>
    <automated>pnpm planning-gates && test -f .planning/todos/completed/2026-10-25-empty-cdn-auth-token-for-depot-200511-and-high-chunk-timeout-rate.md && ! test -e .planning/todos/pending/2026-10-25-empty-cdn-auth-token-for-depot-200511-and-high-chunk-timeout-rate.md && sed -n '1,15p' .planning/todos/pending/2026-10-26-chunk-timeouts-by-depot-or-host-unmeasured.md | grep -A2 '^severity: medium$' | tr '\n' '|' | grep -q '^severity: medium|platform: any|ready: live-gate|'</automated>
    Prettier: both paths are under `.planning/`. `npx prettier --file-info` reports `"ignored": true`
    for `.planning/todos/**` (checked at planning time), so the prettier check is omitted for this
    task rather than run as a check that proves nothing.
  </verify>
  <done>
The new pending todo exists with the three triage keys in order, and `pnpm planning-gates` is
green. The original todo is in completed/ with `status: RESOLVED` and a Resolution section, and is
no longer in pending/.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CM -> CdnAuthTokenCache | The reply body and eresult come from Valve's CM over steam-user's transport |
| CdnAuthTokenCache -> log file | Log lines persist to ~/Library/Logs/GameLib and end up in debug bundles |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261026-piq-01 | Information disclosure | no-token logInfo in callGetCDNAuthToken | mitigate | Log only eresult, shape, byte length, expiration_time, depot, host and TTL. The token is '' on this path by construction, and the existing SECURITY tests plus Test C assert that no Error or token content is logged |
| T-261026-piq-02 | Denial of service | the 30-min no-token cache entry | mitigate | invalidate() on a 401/403 clears the entry (Test D), so a host that starts requiring a token recovers on its next rejection rather than after 30 minutes |
| T-261026-piq-03 | Tampering | an empty token with an undefined eresult | mitigate | Only an explicit eresult === ERESULT_OK earns the no-token cache. Anything else stays on the 60s failure path (Test E) |
</threat_model>

<verification>
- `pnpm jest --selectProjects Backend` over cdnAuth.test.ts, depotPrimitives.test.ts and depot.test.ts
- `pnpm codecheck`
- `npx prettier --check src/backend/storeManagers/steam/depot/cdnAuth.ts src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts`. The `.planning/` paths are prettier-ignored, so they are omitted.
- `pnpm planning-gates`
- `graphify update .` after the code change, per CLAUDE.md
</verification>

<success_criteria>
- A clean eresult=OK empty-token reply gives one info line and is cached for 30 min. There are no
  warnings, stacks or per-minute re-fetches.
- Real failures behave as before.
- Direction 2 lives on as a correctly triaged live-gate todo. The original todo is closed with a
  resolution note.
</success_criteria>

<output>
Create `.planning/quick/261026-piq-treat-an-empty-eresult-ok-cdn-auth-token/261026-piq-SUMMARY.md` when done.
</output>
