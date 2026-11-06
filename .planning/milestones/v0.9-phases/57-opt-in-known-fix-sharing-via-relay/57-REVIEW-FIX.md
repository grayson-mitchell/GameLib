---
phase: 57-opt-in-known-fix-sharing-via-relay
fixed_at: 2026-11-02T03:28:10Z
review_path: .planning/phases/57-opt-in-known-fix-sharing-via-relay/57-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 57: Code Review Fix Report

**Fixed at:** 2026-11-02T03:28:10Z
**Source review:** .planning/phases/57-opt-in-known-fix-sharing-via-relay/57-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 8 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-07, WR-08). The operator chose
  this scope.
- Fixed: 8
- Skipped: 0 in scope. The other 9 findings were out of scope (listed below).

Verification: relay `npx jest` gives 172/172 passing (140 before the fixes). `npx tsc --noEmit -p .`
is clean. ESLint reports no errors on the changed files, only warnings that were already there.
`npx prettier --check` passes on every changed file. The client known-fix report suites give 51/51
passing. `wrangler deploy --dry-run` accepts the config for both prod and staging. Nothing was
deployed.

## Fixed Issues

### CR-01: PR body and D-20 marker list every D1 row for the app, not the changes the PR contains

**Files modified:** `relay/src/reportsTable.ts`, `relay/src/publish.ts`, `relay/src/githubFiles.ts`,
`relay/src/handler.ts`, `relay/src/__tests__/handler.test.ts`, `relay/src/__tests__/publish.test.ts`,
`relay/src/__tests__/githubFiles.test.ts`
**Commit:** 3923ba7ed
**Applied fix:**

- `entriesForApp` is replaced by `entriesForPr(db, appId, prNumber, current)`. It returns only rows
  with `outcome = 'pr' AND pr_number = ?`, plus the ref being published now.
- `publishReport` takes an `entriesFor(prNumber | null)` callback. A new PR's body and marker carry
  this report alone. A fold carries that PR's rows plus this report.
- The repeat-report refresh now calls a new `RepoClient.getPullState` (`GET /pulls/{n}`) and sends the
  PATCH only when the state is `open`.

**Status:** fixed: requires human verification. This is a logic change to which rows a PR body lists.

### CR-02: Concurrent reports race; `forceBranch` can wipe another request's commit, and D-13 "one PR" is not enforced

**Files modified:** `relay/migrations/0002_publish_locks.sql` (new), `relay/src/reportsTable.ts`,
`relay/src/handler.ts`, `relay/src/publish.ts`, `relay/src/__tests__/handler.test.ts`,
`relay/src/__tests__/helpers/d1Sqlite.ts`
**Commit:** 229684dfc
**Applied fix:**

- **The lease.** A new `publish_locks` table holds one lease per appId, because the branch is per
  appId. The lease is taken by an atomic conditional upsert,
  `INSERT … ON CONFLICT DO UPDATE … WHERE expires <= now RETURNING token`, with a 120 s lease. It is
  taken before any GitHub work and released in a `finally`. A crashed or cancelled request frees the
  appId when the lease expires.
- **Re-read under the lease.** The handler re-reads the row while it holds the lease. If an earlier
  holder already published this ref, the request answers `counted`.
- **A losing request.** It answers a retryable `503 {status:'unavailable', detail:'busy'}` and leaves
  its outcome NULL. Under D-16/D-17 the client does not mark it, so it retries, and the retry folds
  or is counted. A 200 would have marked the report sent even when the winner later failed.
- **Body refreshes.** These also run only while holding the lease. A held lease skips the refresh.
- **Tests.** The test D1 helper now applies every migration in order. Tests gate the first request
  mid-publish and check:
  - one PR;
  - no force-reset;
  - the cap charged once;
  - the loser's outcome stays NULL;
  - the lease is released after a failure;
  - a stale lease is taken over.

  A mutation check confirmed the tests fail without the lock.

**Status:** fixed: requires human verification. This is concurrency and state logic.

### CR-03: User-facing privacy promise ("hashed form for about two hours") is not enforced

**Files modified:** `relay/wrangler.jsonc`, `relay/src/limits.ts`, `relay/src/handler.ts`,
`relay/src/index.ts`, `relay/src/__tests__/handler.test.ts`, `relay/src/__tests__/limits.test.ts`
**Commit:** 7e97ea2dc
**Applied fix:**

- `purgeExpiredBuckets` now runs on every request, first thing, before method, path or other
  validation. It replaces the 1% random purge.
- `index.ts` gains a `scheduled()` handler that purges expired buckets.
- `wrangler.jsonc` adds `"triggers": {"crons": ["*/30 * * * *"]}` to prod and to `env.staging`.
- An hourly IP bucket now expires when its hour ends, not an hour later. With the 30-minute cron, a
  hashed IP lives at most about 1.5 hours.

The help text and PRIVACY.md wording ("about two hours") is unchanged and is now true for the live
table.

### WR-01: Client-controlled `gamelibVersion` is written into committed fix files and PR/issue bodies (violates D-14)

**Files modified:** `relay/src/fileEdit.ts`, `relay/src/prBody.ts`, `relay/src/__tests__/fileEdit.test.ts`,
`relay/src/__tests__/prBody.test.ts`
**Commit:** 599aee10a
**Applied fix:**

- **The note.** `notes.<key>` includes the version only when it matches
  `^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:alpha|beta|rc|dev)(?:\.\d{1,4})?)?$`. Otherwise the note says
  "Reported by an unknown GameLib version's …".
- **Why the pre-release words are a fixed list.** A free-form suffix would have admitted
  `1.2.3-evil.example`.
- **PR and issue bodies.** These render the version inside a code span, using the same handling as
  titles.
- **The shared schema.** `src/common/knownFixReport.ts` is unchanged. Tightening it would have
  turned non-release client builds into a permanent 422.

### WR-02: Per-IP limit is trivially bypassed over IPv6; the global cap then becomes a DoS and D-20 poisoning lever

**Files modified:** `relay/src/limits.ts`, `relay/src/__tests__/limits.test.ts`, `PRIVACY.md`
**Commit:** 2edae24e3
**Applied fix:** The new `rateLimitSubject(ip)` reduces an IPv6 address to its /64 prefix before
hashing. It normalises these forms:

- compressed (`::`);
- zone ids;
- embedded IPv4;
- IPv4-mapped `::ffff:a.b.c.d`, which becomes the IPv4 address.

IPv4 is unchanged. An unparsable value is used as-is. PRIVACY.md now says that IPv6 is hashed by its
/64 prefix.

### WR-03: `IP_HASH_SALT` is not validated; a missing secret silently produces an unsalted hash

**Files modified:** `relay/src/handler.ts`, `relay/src/__tests__/handler.test.ts`
**Commit:** 2b1872ebc
**Applied fix:**

- The handler answers `503 {status:'unavailable'}` when `IP_HASH_SALT` is missing or shorter than 16
  characters (`MIN_SALT_LENGTH`).
- That check runs before any D1 write or outbound call.
- The misconfiguration is logged without the value.
- The test harness salt was lengthened to pass the new check.

### WR-07: A null or garbled Steam appdetails body is treated as "unknown app", and the client marks it as permanently rejected

**Files modified:** `relay/src/steamTitle.ts`, `relay/src/__tests__/steamTitle.test.ts`,
`relay/src/__tests__/handler.test.ts`
**Commit:** b5b3e8166
**Applied fix:**

- **`unknown-app`, a 422.** An explicit `{ "<id>": { "success": false } }`. Also explicit
  `success: true` data whose type is not allowed or whose name is empty.
- **`unavailable`, a retryable 503.** A body that is null, not an object or an array. Also a missing or
  non-object entry, `success` that is not a boolean, or `success: true` with no `data` object.

**Status:** fixed: requires human verification. This changes how the relay classifies Steam answers.

### WR-08: `decodeGitHubContent` throws on non-UTF-8 content despite the "never throws" contract

**Files modified:** `relay/src/githubFiles.ts`, `relay/src/fileEdit.ts`, `relay/src/__tests__/githubFiles.test.ts`
**Commit:** e836d9315
**Applied fix:** `getFile` catches a decode failure and returns empty, unparsable text, so
`planAdd` and `planRemove` return `skipped` and `publishReport` never throws. The `fileEdit.ts` header
now says accurately where that guarantee lives. An end-to-end test runs `publishReport` against a
real `createRepoClient` and an undecodable main file. It checks for `skipped` and that no write is
made.

## Skipped Issues

These findings were outside the scope the operator chose for this run. They were not attempted, and
their code is untouched.

### WR-04: `skipped`, `already-known` and `suppressed` outcomes are permanent, so GitHub is not the source of truth

**File:** `relay/src/handler.ts:153-180, 232-241`
**Reason:** skipped: out of operator-chosen scope
**Original issue:** Any non-NULL outcome is terminal, so a `skipped` or `already-known` row never
re-runs, even after the repo changes.

### WR-05: D-20 closed-PR suppression is checked only when no PR is open, so suppressed reports can fold into another key's PR

**File:** `relay/src/publish.ts:100-130`
**Reason:** skipped: out of operator-chosen scope
**Original issue:** The open-PR fold returns before the closed-PR marker check.

### WR-06: Folding into an open PR reports `updated` even when nothing was written

**File:** `relay/src/publish.ts:104-118`
**Reason:** skipped: out of operator-chosen scope
**Original issue:** In the fold path, `skipped`, `not-in-repo` and `already-known` branch plans still
rewrite the body, set outcome `pr` and answer 200.

### WR-09: The request body is read unbounded when `Content-Length` is missing

**File:** `relay/src/handler.ts:97-104`
**Reason:** skipped: out of operator-chosen scope
**Original issue:** A chunked request is fully buffered before the 2 KB size check.

### WR-10: Dedup lookups only see the first page of results

**File:** `relay/src/githubFiles.ts:126, 190-193`
**Reason:** skipped: out of operator-chosen scope
**Original issue:** `findIssueByTitle` scans 100 issues, and closed-PR lookups use `per_page=10`.

### IN-01: `bundleExecutableName` accepts `.` and does not decode XML entities

**File:** `src/backend/utils/macArch.ts:113-123`
**Reason:** skipped: out of operator-chosen scope
**Original issue:** `<string>.</string>` resolves to the `Contents/MacOS` directory itself.

### IN-02: `publishReport` uses `Date.now()` instead of the injected clock

**File:** `relay/src/publish.ts:64`
**Reason:** skipped: out of operator-chosen scope
**Original issue:** The `firstSeen` fallback is nondeterministic. After CR-01 the current row is
always present, so the fallback cannot be reached in practice.

### IN-03: Identity ternary in the outcome mapping

**File:** `relay/src/handler.ts:236-239`
**Reason:** skipped: out of operator-chosen scope
**Original issue:** `outcome.status === 'already-known' ? 'already-known' : outcome.status` is dead
logic.

### IN-04: Staging reuses the production App installation id

**File:** `relay/wrangler.jsonc:39-40`
**Reason:** skipped: out of operator-chosen scope
**Original issue:** Staging uses installation `177665978`, which only works if that installation also
covers `known-fixes-staging`.

## Operator Follow-ups (deploy)

- **Remote D1 migration required:** `relay/migrations/0002_publish_locks.sql` must be applied
  remotely before the new Worker code is deployed. Apply it to both `gamelib-fix-relay` and
  `gamelib-fix-relay-staging`. Without the table, every publish fails with a 503.
- **Check the salt length:** confirm the deployed `IP_HASH_SALT` secret is at least 16 characters. If
  it is shorter, WR-03 makes the relay answer 503 to every report until the secret is replaced.
- **Cron trigger:** deploying registers the `*/30 * * * *` Cron Trigger.
- **D1 Time Travel caveat (not addressed):** D1's point-in-time restore keeps history for up to 30
  days, so hashed buckets remain recoverable from backups after the live rows are purged. The
  reviewer's alternative was to state this in the help text, but the user-facing copy in
  `public/locales/en/translation.json` was not changed. That file has unrelated uncommitted edits
  from another session. Decide whether to add a backup caveat to both the help text and PRIVACY.md.

---

_Fixed: 2026-11-02T03:28:10Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
