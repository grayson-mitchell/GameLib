---
phase: 57-opt-in-known-fix-sharing-via-relay
reviewed: 2026-11-02T00:00:00Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - relay/.gitignore
  - relay/jest.config.js
  - relay/migrations/0001_init.sql
  - relay/package.json
  - relay/tsconfig.json
  - relay/wrangler.jsonc
  - relay/src/env.ts
  - relay/src/fileEdit.ts
  - relay/src/githubApp.ts
  - relay/src/githubFiles.ts
  - relay/src/handler.ts
  - relay/src/index.ts
  - relay/src/limits.ts
  - relay/src/prBody.ts
  - relay/src/publish.ts
  - relay/src/reportsTable.ts
  - relay/src/steamTitle.ts
  - relay/src/__tests__/fileEdit.test.ts
  - relay/src/__tests__/githubApp.test.ts
  - relay/src/__tests__/githubFiles.test.ts
  - relay/src/__tests__/handler.test.ts
  - relay/src/__tests__/helpers.test.ts
  - relay/src/__tests__/limits.test.ts
  - relay/src/__tests__/prBody.test.ts
  - relay/src/__tests__/publish.test.ts
  - relay/src/__tests__/steamTitle.test.ts
  - relay/src/__tests__/helpers/d1Sqlite.ts
  - relay/src/__tests__/helpers/fakeFetch.ts
  - relay/src/__tests__/helpers/testKeys.ts
  - src/common/knownFixReport.ts
  - src/common/types.ts
  - src/backend/knownFixReport.ts
  - src/backend/knownFixes.ts
  - src/backend/config.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/utils/macArch.ts
  - src/frontend/screens/Settings/components/ShareDetectedFixes.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
  - public/locales/en/translation.json
findings:
  critical: 3
  warning: 10
  info: 4
  total: 17
status: issues_found
---

# Phase 57: Code Review Report

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 37 (shared files limited to their phase-57 hunks)
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

The client side is in good shape. It is gated, never throws, bounded by a timeout and an abort
controller, and carries no client text in the payload. The problems are in the relay's GitHub
decision flow and D1 state model:

- The PR body and the D-20 suppression marker are built from every D1 row for the app,
  whatever happened to each row. So PRs can claim changes they do not contain, and closing one
  can suppress keys it never proposed.
- Nothing serialises concurrent publishes, and the force-reset of the branch can wipe another
  request's commit.
- The privacy copy promises a two-hour retention that the code does not enforce.

The validated `gamelibVersion` also lands, client-controlled, in committed files and PR
bodies, which D-14 forbids.

## Critical Issues

### CR-01: PR body and D-20 marker list every D1 row for the app, not the changes the PR contains

**File:** `relay/src/handler.ts:165-168, 202`; `relay/src/reportsTable.ts:92-111`; `relay/src/prBody.ts:61, 78`
**Issue:** `entriesForApp` returns every `reports` row for the appId, whatever its `outcome`:
`already-known`, `skipped`, `suppressed`, `issue`, or NULL (a row that hit the daily cap with a
429, or a 503). `renderPrBody` then prints a `Change: add/remove ...` line for each row and puts
every `key:op` in the `gamelib-report:` marker. Concrete consequences:

1. A Mach-O `macArch:add` report hits the daily cap (429). Under D-18 the client never resends
   it. A later `drm:add` report then opens a PR whose body says `Change: add macArch: "32"`, but
   the file only gains `drm`. The operator merges, believing macArch is included.
2. A `macArch:remove` row that became a bundled-removal issue shows up in a later drm PR as
   `Change: remove macArch ...` with the removal caveat.
3. The operator closes that PR. Its marker now contains `key:op` pairs the PR never proposed,
   so `publish.ts:124-129` suppresses those reports forever (a false D-20 suppression).
4. The repeat-report refresh (`handler.ts:155-169`) PATCHes the body of the row's PR even when
   that PR is already closed or merged. This rewrites a closed PR's marker with whatever rows
   exist now, which widens the suppression after the fact.

**Fix:** Build body entries only from rows that belong to the PR: `outcome = 'pr' AND pr_number = ?`,
plus the ref being published now. Skip the refresh when the PR is not open:
```ts
export async function entriesForPr(db, appId, prNumber: number | null, current: ReportRef) {
  // SELECT ... WHERE app_id = ? AND ((outcome = 'pr' AND pr_number = ?) OR (key = ? AND op = ?))
}
```
In the refresh path, `GET /pulls/{n}` first and only PATCH when `state === 'open'`.

### CR-02: Concurrent reports race; `forceBranch` can wipe another request's commit, and D-13 "one PR" is not enforced

**File:** `relay/src/handler.ts:137-153, 195-209`; `relay/src/publish.ts:100, 132-155`
**Issue:** A row's `outcome` is written only after `publishReport` returns. So two requests that
overlap both see `outcome === null` and both enter the publish flow. This happens with the same
ref from two users, or with `macArch:add` and `drm:add` for one appId. Both see no open PR, and
both reserve a daily-cap slot. The first creates `report/steam-<appId>`. The second gets
`'exists'` and `forceBranch`es it back to base, discarding the first commit, then writes its own
file. Its `createPull` returns 422 because a PR already exists for that head, so the request
answers 503. The first request's PR now carries only the second request's change, while its body
describes the first. The cap is charged twice, and the client retries a report that was in fact
"published". `forceBranch` is also reachable whenever a branch survives a merged PR. That case is
safe on its own, but nothing stops the forced update from hitting a branch that a concurrent
request has just pushed to.

**Fix:** Claim the work atomically in D1 before talking to GitHub, for example a per-appId lease:
```sql
UPDATE reports SET outcome = 'pending', lease_until = ? WHERE app_id = ? AND key = ? AND op = ?
  AND (outcome IS NULL OR (outcome = 'pending' AND lease_until < ?)) RETURNING 1
```
Hold a per-appId lock row, since the branch is per appId and not per ref. Re-check `findPulls(open)`
after `createBranch` returns `'exists'` and fold instead of forcing. Treat a 422 "already exists"
from `createPull` as a fold, not a 503.

### CR-03: User-facing privacy promise ("hashed form for about two hours") is not enforced

**File:** `relay/src/handler.ts:129-135`; `relay/src/limits.ts:59-65, 87-92`; `public/locales/en/translation.json` (`help.shareDetectedFixes`); `ShareDetectedFixes.tsx:36`
**Issue:** Bucket rows set `expires = hourStart + 2h`, but expired rows are deleted only by
`purgeExpiredBuckets`. That runs with 1% probability, and only on requests that already passed
the method/path/content-type/size/JSON/schema checks. At low traffic (a handful of reports a
day), rows holding hashed client IPs (`ip:<hash>:<hour>`) stay for weeks or indefinitely. D1 Time
Travel also keeps 30 days of history. The help text tells users the relay "keeps only a hashed
form for about two hours", and the code does not do that. The hash is also reversible by whoever
holds `IP_HASH_SALT`, because the IPv4 space is 2^32 (see WR-03).

**Fix:** Purge deterministically. Add a Cron Trigger (`"triggers": {"crons": ["*/30 * * * *"]}`)
with a `scheduled()` handler in `index.ts` that runs `DELETE FROM buckets WHERE expires < ?`.
Alternatively, run the purge on every request before `checkIpLimit` (it is one indexed DELETE).
Then correct the copy to reflect D1 backup retention ("about two hours, plus up to 30 days in
encrypted database backups"), or rotate the salt per day so old hashes cannot be linked.

## Warnings

### WR-01: Client-controlled `gamelibVersion` is written into committed fix files and PR/issue bodies (violates D-14)

**File:** `src/common/knownFixReport.ts:34`; `relay/src/fileEdit.ts:69`; `relay/src/prBody.ts:48, 91`; `relay/src/reportsTable.ts:38`
**Issue:** D-14 says "no user-controlled text lands in the repo or the PR". `gamelibVersion` accepts any
1-40 characters from `[0-9A-Za-z.+-]`. It is copied into `notes.<key>` in the committed JSON
("Reported by GameLib ${version}'s ...") and into the PR and issue bodies outside a code span.
Values such as `www.attacker-site.com` or `buy-cheap-pills.example` pass the regex and get
autolinked by GitHub in the PR body. They are also committed into a file that ships to every
GameLib client once merged.
**Fix:** Constrain the version to a real release shape and render it in a code span:
```ts
gamelibVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-(?:alpha|beta|rc)\.\d{1,3})?$/)
```
Alternatively, leave the version out of `notes` entirely and keep it only in the PR body, inside backticks.

### WR-02: Per-IP limit is trivially bypassed over IPv6; the global cap then becomes a DoS and D-20 poisoning lever

**File:** `relay/src/limits.ts:52-71`; `relay/src/handler.ts:78-91`
**Issue:** The bucket key is the hash of the full `CF-Connecting-IP`. One IPv6 client normally
controls a /64 (2^64 addresses), so the 10/hour limit does not apply to it. Any valid report for
a real Steam appId then reaches Steam and GitHub, and an `add` opens a PR until
`DAILY_CREATE_CAP` (25) is used up. An attacker can:

- exhaust the cap every day, so legitimate reports get 429;
- seed bogus PRs whose closure suppresses the real report for that appId+key+op forever under
  D-20.

**Fix:** Bucket IPv6 by /64 (normalise and keep the first four hextets before hashing). Consider
also a per-appId creation limit, and/or keep the daily cap separate for `add` and `remove`.

### WR-03: `IP_HASH_SALT` is not validated; a missing secret silently produces an unsalted hash

**File:** `relay/src/limits.ts:30`; `relay/src/handler.ts:80`
**Issue:** If `wrangler secret put IP_HASH_SALT` was skipped (staging, a new environment), the
hashed input is `undefined:<ip>:<day>`. Anyone with D1 read access can reverse those hashes
within minutes.
**Fix:** Fail closed. In `handle`, add `if (!env.IP_HASH_SALT || env.IP_HASH_SALT.length < 16) return respond(503, { status: 'unavailable' })`,
and log the misconfiguration.

### WR-04: `skipped`, `already-known` and `suppressed` outcomes are permanent, so GitHub is not the source of truth

**File:** `relay/src/handler.ts:153-180, 232-241`
**Issue:** `upsertReport` returns any non-NULL `outcome`, and every later report for that ref is then
just counted. A `skipped` caused by a malformed file on main stays dead after the operator fixes
the file. An `already-known` stays dead after the key is later removed from main. The header
comments in `publish.ts` and `reportsTable.ts` claim the opposite ("D1 is a cache and counter only;
GitHub stays the source of truth").
**Fix:** Treat only `pr` and `issue` as terminal. For `skipped` and `already-known`, re-run
`publishReport`. Rate-limit it (for example, at most once per day per ref) to bound GitHub calls.

### WR-05: D-20 closed-PR suppression is checked only when no PR is open, so suppressed reports can fold into another key's PR

**File:** `relay/src/publish.ts:100-130`
**Issue:** The open-PR fold returns before the closed-PR marker check. If the D1 row is NULL for
a ref that an operator-closed PR rejected, the report is written into the open PR anyway. This
happens after a D1 reset or migration, or through CR-01, where the cap blocked the row. Because
the comment calls GitHub the source of truth, the check should not depend on D1.
**Fix:** Run the `findPulls(branch, 'closed')` and marker check before the `open.length > 0` branch.

### WR-06: Folding into an open PR reports `updated` even when nothing was written

**File:** `relay/src/publish.ts:104-118`
**Issue:** When `branchPlan.kind` is `skipped` (the branch file is not JSON), `not-in-repo` (the
branch file lacks `macArch: "32"`, for example a stale branch) or `already-known`, no commit is
made. Even so, the body is rewritten to claim the change, `setOutcome('pr')` makes the ref
terminal, and the client gets a 200. In the `skipped` and `not-in-repo` cases the report is lost.
**Fix:** Only claim the change on `create`, `update` or `delete`. For `skipped` and `not-in-repo`,
return `skipped` and leave the D1 outcome NULL, or add a PR comment that flags the conflict.

### WR-07: A null or garbled Steam appdetails body is treated as "unknown app", and the client marks it as permanently rejected

**File:** `relay/src/steamTitle.ts:48-53`; `relay/src/handler.ts:184-189`; `src/backend/knownFixReport.ts:236-239`
**Issue:** Under load or rate limiting, Steam's `appdetails` can return HTTP 200 with the body
`null`, or an object without the requested appId. Both map to `unknown-app`, which yields 422.
Per D-17 the client then writes the sent record, so the report is never retried, even for a
valid app.
**Fix:** Return `unavailable` (503) when the body is not an object or has no `[appId]` key.
Reserve `unknown-app` for an explicit `success: false` or a disallowed `type`.

### WR-08: `decodeGitHubContent` throws on non-UTF-8 content despite the "never throws" contract

**File:** `relay/src/fileEdit.ts:2, 15-21`; `relay/src/githubFiles.ts:115-119`
**Issue:** `TextDecoder({ fatal: true })` throws a `TypeError` on invalid UTF-8, and `atob` throws on
bad base64. The error escapes `publishReport` and reaches the generic catch-all 503. That 503 is
retryable, so the CEG client resends on every launch and the relay re-fetches every time. The
module header says decode failures are returned as `skipped`.
**Fix:** Wrap the decode in `getFile`, and make the content an unparsable sentinel so `planAdd` and
`planRemove` return `skipped`:
```ts
let text: string
try { text = decodeGitHubContent(String(j.content ?? '')) } catch { text = '' }
```

### WR-09: The request body is read unbounded when `Content-Length` is missing

**File:** `relay/src/handler.ts:97-104`
**Issue:** If `Content-Length` is absent (chunked transfer), `declared` is 0 and `request.text()`
buffers the whole body before the size check. The 2 KB cap only takes effect after the full read,
up to the platform's 100 MB limit.
**Fix:** Read `request.body` with a reader and abort once more than `KNOWN_FIX_REPORT_MAX_BYTES`
bytes have arrived. Alternatively, reject requests that have no valid `Content-Length` with 411.

### WR-10: Dedup lookups only see the first page of results

**File:** `relay/src/githubFiles.ts:126, 190-193`
**Issue:** `findIssueByTitle` scans only the 100 most recent `bundled-removal` issues, so later
reports open duplicate issues once more than 100 exist. `findPulls(..., 'closed')` uses
`per_page=10`, so an operator-closed PR older than the newest 10 for that branch stops suppressing
(D-20).
**Fix:** Use the search API (`/search/issues?q=repo:o/r+label:bundled-removal+in:title+"steam <appId> "`),
or follow `Link: rel="next"`. Raise `per_page` to 100 for closed pulls.

## Info

### IN-01: `bundleExecutableName` accepts `.` and does not decode XML entities

**File:** `src/backend/utils/macArch.ts:113-123`
**Issue:** `<string>.</string>` passes `name === basename(name) && name !== '..'`, so
`firstBundleBinary` returns the `Contents/MacOS` directory itself as the binary. Names that
contain `&amp;` never match on disk, and the code falls back silently.
**Fix:** Reject `.` and empty names, decode the five XML entities, and require `statSync(...).isFile()`.

### IN-02: `publishReport` uses `Date.now()` instead of the injected clock

**File:** `relay/src/publish.ts:64`
**Issue:** The rest of the relay uses `deps.now`. This fallback (only reached if `own` is
missing) makes the note date nondeterministic in tests.
**Fix:** Add `now` to `PublishInput` and pass `deps.now()` in.

### IN-03: Identity ternary in the outcome mapping

**File:** `relay/src/handler.ts:236-239`
**Issue:** `outcome.status === 'already-known' ? 'already-known' : outcome.status` always yields
`outcome.status`. This is dead logic.
**Fix:** Pass `outcome: outcome.status`.

### IN-04: Staging reuses the production App installation id

**File:** `relay/wrangler.jsonc:39-40`
**Issue:** Staging requests a token scoped to `known-fixes-staging` using installation
`177665978`. That only works if the installation also covers the staging repo, which contradicts
D-02 ("installed only on known-fixes"). If it does not cover it, staging returns 503 on every
publish.
**Fix:** Document that the installation covers both repos, or give staging its own installation id.

---

_Reviewed: 2026-11-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
