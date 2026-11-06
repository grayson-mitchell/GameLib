---
phase: 57
slug: opt-in-known-fix-sharing-via-relay
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-11-04
---

# Phase 57 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> Built from the `<threat_model>` blocks of plans 57-01..57-12 and verified against the implementation
> (relay/, src/common, src/backend, frontend toggle, PRIVACY.md, tests, 57-UAT.md). No new-threat scan was
> performed. No SUMMARY carries a `## Threat Flags` section, so there are no unregistered flags.

**Path shorthand:** `R` = `relay/src`, `C` = `src/common/knownFixReport.ts`, `B` = `src/backend/knownFixReport.ts`.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GameLib client -> relay (HTTPS, public) | Unauthenticated POST; body is attacker-controlled |
| relay -> Steam appdetails | Canonical title comes from an external, untrusted response |
| relay -> GitHub API | App installation token writes files/PRs/issues in the known-fixes repo |
| relay -> Cloudflare D1 | Holds counters, outcomes, hashed-IP buckets, publish leases |
| operator -> Cloudflare / GitHub App | Secrets (private key, salt) and installation scope |
| repo -> npm registry | `relay/` wrangler + workerd install |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-57-01 | Elevation | knownFixReportSchema | mitigate | CLOSED | `C:30-47` `.strict()` + `KNOWN_FIX_REPORT_PAIRS` pair refine; `key`/`value` enums |
| T-57-02 | Tampering | appId | mitigate | CLOSED | `C:34` `/^[1-9][0-9]{0,9}$/` |
| T-57-03 | Tampering | schema drift | mitigate | CLOSED | single module imported by client (`B:20`) and relay (`R/handler.ts:6`); `src/backend/__tests__/knownFixReportDrift.test.ts:13,26` vs `TIER1_ROUTING_KEYS`/`filterTier1KnownFixes` |
| T-57-04 | Info disclosure | payload | mitigate | CLOSED | `C` schema has no title/user/path fields, strict; client body built `B:166-174` |
| T-57-05 | Repudiation | shareDetectedFixes default | mitigate | CLOSED | `src/backend/config.ts:344` `false`; reader `B:113` and UI use `=== true` |
| T-57-06 | Info disclosure | help text / PRIVACY.md | mitigate | CLOSED | `PRIVACY.md:51,130-135` IP handling (hash of /64, ~2h, Time Travel 30d); help text enumerates sent fields incl. IP |
| T-57-07 | Spoofing | non-mac | accept | CLOSED | Accepted risk AR-1; `B:101,108` `isMac` gate; `ShareDetectedFixes.tsx:23` renders nothing off macOS |
| T-57-08 | Info disclosure | relay/wrangler.jsonc | mitigate | CLOSED | `relay/wrangler.jsonc` vars hold only non-secret ids/limits; secret names only in comment; `relay/.gitignore` has `.dev.vars`, `*.pem` |
| T-57-09 | Info disclosure | Worker logs | mitigate | CLOSED | `wrangler.jsonc` `observability.enabled:false` at top level and in `env.staging` |
| T-57-10 | Info disclosure | D1 schema | mitigate | CLOSED | `migrations/0001_init.sql`, `0002_publish_locks.sql`: no IP column; `buckets` = hashed key + expiry |
| T-57-SC | Tampering | relay package / wrangler install | mitigate | CLOSED | `relay/package.json` exact pin `wrangler 4.156.0`; `relay/pnpm-workspace.yaml` `onlyBuiltDependencies: esbuild, workerd`; `57-11-SUMMARY.md:13,39` install with `--ignore-workspace`; relay absent from root install |
| T-57-11 | Repudiation | send while disabled | mitigate | CLOSED | `B:101-102` read per call; `knownFixReport.test.ts:90-111` gate tests |
| T-57-12 | Info disclosure | outbound body | mitigate | CLOSED | `B:166-183` constants + `parseKnownFixReport`, sends `parsed.report`; `knownFixReport.test.ts:215` exact key set |
| T-57-13 | DoS | sidecar exit / install path | mitigate | CLOSED | `B:187-193` abort registry + `AbortSignal.timeout(8000)`, axios `timeout`; `B:255-261` void wrapper; no import-time work; `knownFixReport.test.ts:275-300` |
| T-57-14 | Tampering | persisted sent record | mitigate | CLOSED | `B:128-132` `wasSent` defensive parse; `knownFixReport.test.ts:232` |
| T-57-15 | Tampering | GAMELIB_FIX_RELAY_URL env | accept | CLOSED | Accepted risk AR-2; `B:74-76` |
| T-57-16 | Spoofing | redirect (client) | mitigate | CLOSED | `B:119-121` axios `maxRedirects: 0` |
| T-57-17 | Tampering | title in file/PR | mitigate | CLOSED | `R/steamTitle.ts:17-23` sanitiser (Cc/Cf, backticks, `<>`, 200 cap); `R/fileEdit.ts` JSON.stringify; `R/prBody.ts:44-58,66` code span only; `prTitle`/`issueTitle` contain no title |
| T-57-18 | SSRF | Steam fetch | mitigate | CLOSED | `R/steamTitle.ts:42-44` fixed host, appId already regex-validated; `redirect:'manual'` + `!res.ok` -> unavailable (deliberate substitution for `'error'`, which workerd rejects: 57-12-SUMMARY deviation 1; `steamTitle.test.ts:132`). Redirects are never followed. |
| T-57-19 | Tampering | existing file corruption | mitigate | CLOSED | `R/fileEdit.ts:121-134` spread preserves order/other keys; `parseObject` non-object -> `skipped`; `:21` fatal UTF-8 decode |
| T-57-20 | DoS | Steam outage | mitigate | CLOSED | `R/steamTitle.ts:50-70` -> `unavailable`; `R/handler.ts:233-235` 503; `B:226-229` 5xx not marked |
| T-57-21 | Elevation | installation token scope | mitigate | CLOSED | `R/githubApp.ts:116-122` `repositories:[REPO_NAME]`, contents/pull_requests/issues write |
| T-57-22 | Info disclosure | private key in errors | mitigate | CLOSED | `R/githubApp.ts:33-62` fixed-string errors; key only from `env`; `githubApp.test.ts:148`, `handler.test.ts:513` |
| T-57-23 | DoS | flood | mitigate | CLOSED | `R/handler.ts:85-97` per-IP limit before body, counts every attempt; `R/limits.ts:103-117` atomic UPSERT...RETURNING; `reserveDailyCreation` 25/day cap called in `publish.ts` before creation |
| T-57-24 | Info disclosure | IP storage | mitigate | CLOSED | `R/limits.ts:90-98` salted per-day SHA-256 sliced to 32 hex; bucket expires hour end, purge on every request and 30-min cron (`index.ts`, `wrangler.jsonc` crons); `limits.test.ts:46` raw IP never stored |
| T-57-25 | Spoofing | forged JWT / replay | accept | CLOSED | Accepted risk AR-3; `R/githubApp.ts:68-72` exp = now+540s |
| T-57-26 | Tampering | branch/path injection | mitigate | CLOSED | `R/publish.ts:63-64` `report/steam-${appId}`, `fixFilePath` from validated appId; `R/githubFiles.ts:117` `encodeURIComponent` on head/ref |
| T-57-27 | Info disclosure | token in errors | mitigate | CLOSED | `R/githubFiles.ts:73-90` errors carry method/path/status only |
| T-57-28 | DoS | parallel writes | mitigate | CLOSED | no `Promise.all` in relay/src; `githubFiles.test.ts:311` and `publish.test.ts:160` `maxConcurrent()==1`; non-2xx -> `GitHubUnavailableError` -> 503 |
| T-57-29 | Spoofing | redirects (GitHub) | mitigate | CLOSED | `R/githubFiles.ts:79` `redirect:'manual'` + 2xx-only check (same workerd rationale; `githubFiles.test.ts:251-266`) |
| T-57-30 | DoS | install/launch paths | mitigate | CLOSED | `games.ts:2987`, `library.ts:2012,2027` call `reportDetectedFix` void, not awaited; never-settling mock test `library.test.ts:8511-8512` |
| T-57-31 | Tampering | hook args | mitigate | CLOSED | literals at each site (`macArch`/`drm`, add/remove, `macho`/`ceg`); appId re-validated by `parseKnownFixReport` (`B:177`) |
| T-57-32 | Tampering | PR/issue text injection | mitigate | CLOSED | `R/prBody.ts:36-40,66` titles digits+constants; title/version only in code span; `prBody.test.ts:75-91` asserts no `@`/`#<digit>` outside spans |
| T-57-33 | DoS | PR spam per app | mitigate | CLOSED | `R/publish.ts:97-121` fold into open PR; `:127-139` D-20 suppression; `:141` `reserveCreation` before creation; publish lease `handler.ts` |
| T-57-34 | Tampering | operator content | mitigate | CLOSED | `R/fileEdit.ts:121-159` other keys kept; remove deletes only `macArch` (+ its note); file deleted only when only title/notes remain |
| T-57-35 | Repudiation | operator rejection | mitigate | CLOSED | `R/publish.ts:127-139` closed-unmerged marker checked on GitHub via `findPulls(...,'closed')`, independent of D1; `handler.ts:189-192` never rewrites closed PR body |
| T-57-36 | Elevation | changes reaching users | accept | CLOSED | Accepted risk AR-4; grep of relay/src finds no merge call (only comments) |
| T-57-37 | DoS | endpoint flood | mitigate | CLOSED | `R/handler.ts:76-122` method/path check, IP bucket before `request.text()`, content-type, 2048-byte cap (declared and actual); `:56-62` any error -> 503 |
| T-57-38 | Elevation | payload smuggling | mitigate | CLOSED | `R/handler.ts:123` shared strict parse; only `CF-Connecting-IP`, `content-type`, `content-length` read |
| T-57-39 | Tampering | client text into repo | mitigate | CLOSED | only `report.{appId,key,op,gamelibVersion}` + Steam title reach GitHub; version gated by `releaseVersion` regex (`R/fileEdit.ts:78-84`) and code span; `fileEdit`/`prBody` tests |
| T-57-40 | Info disclosure | logs | mitigate | CLOSED | `R/handler.ts` logs appId/key/op/status only; `handler.test.ts:580` asserts IP never reaches console |
| T-57-41 | DoS | GitHub/Steam outage | mitigate | CLOSED | `R/handler.ts:56-62,233-235,311-319` 503; client treats 5xx as retryable (`B:226-232`) |
| T-57-42 | Repudiation | operator rejection | mitigate | CLOSED | `R/handler.ts` suppressed outcome stored via `setOutcome`; repeats go to `counted` path without publish |
| T-57-43 | Info disclosure | wrangler telemetry | mitigate | CLOSED | Procedural: `WRANGLER_SEND_METRICS=false` for every command, recorded in `57-11-SUMMARY.md:49` and required by `57-12-PLAN.md:63`. Not enforced by a committed config or script (env var cannot be set in wrangler.jsonc); see Notes. |
| T-57-44 | Info disclosure | GitHub App private key | mitigate | CLOSED | `git ls-files` shows no `.pem` or `.dev.vars` tracked; `relay/.gitignore` excludes both; secrets via `wrangler secret put` (`57-12-SUMMARY.md:35`) |
| T-57-45 | Elevation | App installation scope | mitigate | CLOSED | Accepted risk AR-5 (user decision 2026-11-04). Runtime narrowing exists (T-57-21), but no recorded evidence of the installation itself: `57-12-SUMMARY.md` and `57-UAT.md` record only the App/installation ids, not "known-fixes only", the three permissions, or webhook inactive. `57-12-SUMMARY.md:80` ("Remove `known-fixes-staging` from the GitHub App installation") implies the installation currently also covers the staging repo. |
| T-57-46 | Tampering | sentinel URL shipped | mitigate | CLOSED | `src/backend/__tests__/knownFixReportUrl.test.ts` fails on sentinel; `B:150-157` refuses to send to a sentinel URL; `B` URL is the deployed workers.dev host |
| T-57-47 | Repudiation | live gate claims | mitigate | CLOSED | `57-UAT.md` items 1-5 record PR URL `https://github.com/grayson-mitchell/Known-Fixes/pull/1`, commit, branch and timestamped log lines |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-1 | T-57-07 | Spoofing a non-mac client is harmless: the toggle is hidden off macOS and the client also gates on `isMac`; a hand-built request is bounded by the relay's schema and limits. | plan 57-02/04 | 2026-11-04 |
| AR-2 | T-57-15 | `GAMELIB_FIX_RELAY_URL` is dev/staging only; anyone who controls the process environment already controls the app. | plan 57-04 | 2026-11-04 |
| AR-3 | T-57-25 | GitHub verifies the RS256 JWT; `exp` is at most 10 minutes, so replay window is bounded. | plan 57-06 | 2026-11-04 |
| AR-4 | T-57-36 | Operator reviews and merges every PR; the relay contains no merge call. | plan 57-09 | 2026-11-04 |
| AR-5 | T-57-45 | The installation's own scope is unrecorded and may still include `known-fixes-staging`, but every installation token is narrowed at request time to `[REPO_NAME]` with contents/pull_requests/issues write only (`relay/src/githubApp.ts:116-122`), so the relay cannot act outside known-fixes. Removing the staging repo from the installation remains open operator cleanup (`57-12-SUMMARY.md:80`). | user | 2026-11-04 |

---

## Notes (non-blocking)

- T-57-18 / T-57-29: plans specified `redirect: 'error'`; workerd rejects it, so the implementation uses `'manual'` with a 2xx-only success check. No redirect is followed and the Authorization header is never replayed. Treated as equivalent.
- T-57-43: telemetry suppression is operator procedure only. Consider documenting `WRANGLER_SEND_METRICS=false` in a relay README or the deploy script.
- Housekeeping from `57-12-SUMMARY.md:80-81`: operator still to delete the downloaded `.pem` files (T-57-44 residual, outside the repo).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-04 | 49 | 48 | 1 | gsd-security-auditor |
| 2026-11-04 | 49 | 49 | 0 | user accepted T-57-45 as AR-5 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed (T-57-45 accepted as AR-5)
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-04
