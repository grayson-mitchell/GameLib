---
phase: quick-260909-pym
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/acfInstalldir.ts
  - src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts
  - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/library.ts
  - .planning/todos/pending/2026-09-09-cold-session-installdir-falls-back-to-app-appid.md
  - .planning/quick/260909-pym-fix-cold-session-installdir-fallback/260909-pym-SUMMARY.md
autonomous: true
requirements: [QUICK-260909-pym]

must_haves:
  truths:
    - "On a cold session with no steam-user client, resolveSteamInstallTarget awaits SteamUser.ensureConnected() and then reads the real PICS installdir, instead of returning app_<appid> in 1ms"
    - "When an appmanifest_<appid>.acf already exists in the chosen target steamapps dir, its installdir is used in preference to PICS, so a reinstall/resume can never create a second directory beside a live install"
    - "An ACF-sourced installdir funnels through the SAME sanitizeInstalldir as the PICS-sourced one — a denylisted or non-contained ACF candidate still throws UnsafeInstalldirError"
    - "A connect failure, a connect timeout, or a PICS failure still degrades to a safe fallback dir name and never hard-fails the install"
    - "The total worst-case bound inside resolveSteamInstallTarget is STRICTLY SMALLER than games.ts's 50000ms outer bound"
    - "installdirFallbackUsed reflects the FINALLY-CHOSEN candidate, not just the PICS one"
    - "The three live app_257350 / app_25900 / app_402060 directories are not renamed, moved, repaired or deleted by any code in this plan"
  artifacts:
    - path: "src/backend/storeManagers/steam/acfInstalldir.ts"
      provides: "readAcfInstalldir(steamappsDir, appId) — single-source on-disk ACF installdir extraction shared by installLocation.ts and library.ts"
      exports: ["readAcfInstalldir"]
    - path: "src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts"
      provides: "Parser coverage for the shared helper (present / absent / corrupt / blank installdir)"
    - path: "src/backend/storeManagers/steam/__tests__/installLocation.test.ts"
      provides: "RED-first cold-session and ACF-precedence coverage plus the WR-01 arithmetic pin"
    - path: "src/backend/storeManagers/steam/installLocation.ts"
      provides: "ensureConnected-then-retry cold path, ACF-before-PICS candidate selection, corrected fallback flag"
  key_links:
    - from: "src/backend/storeManagers/steam/installLocation.ts"
      to: "SteamUser.ensureConnected"
      via: "bounded await when getClient() is null"
      pattern: "ensureConnected"
    - from: "src/backend/storeManagers/steam/installLocation.ts"
      to: "src/backend/storeManagers/steam/acfInstalldir.ts"
      via: "import { readAcfInstalldir }"
      pattern: "readAcfInstalldir"
    - from: "src/backend/storeManagers/steam/library.ts"
      to: "src/backend/storeManagers/steam/acfInstalldir.ts"
      via: "locateDownloadingTarget delegates its ACF read"
      pattern: "readAcfInstalldir"
---

<objective>
The FIRST native Steam install of every session lands in a duplicate `app_<appid>`
directory. `fetchInstalldir` (`installLocation.ts:230-235`) returns `undefined` the
moment `SteamUser.getClient()` is null, so on a cold session the install directory is
chosen 1ms in, *before* the data needed to name it has been fetched. The same appId
resolves correctly on the 3rd and 4th install of the same session once the client is warm.

Purpose: stop paying a full re-download of a title already on disk (measured:
`jobCount=1215 reconciledSkipped=0` cold vs `jobCount=0 reconciledSkipped=1215` warm),
and stop accumulating orphaned duplicate directories.

Output: a cold-session install resolves the real installdir; a reinstall over an
existing ACF reuses that ACF's directory name; both go through the one shared sanitizer.

**Not in scope (hard constraint 4):** repairing, renaming or deleting the existing
`app_257350` / `app_25900` / `app_402060` directories. Those are LIVE installs whose own
ACFs point AT those names with `StateFlags=4`. They are user data and a separate
operator decision. No code in this plan touches them. The ACF-precedence rule in Task 2
is in fact what makes a future reinstall of those three land back in their existing
directory rather than beside it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-09-cold-session-installdir-falls-back-to-app-appid.md
@src/backend/storeManagers/steam/installLocation.ts
@src/backend/storeManagers/steam/__tests__/installLocation.test.ts
@CLAUDE.md

Project skill: `Skill("spike-findings-gamelib")` — Steam native install + depot/ACF patterns.

<root_cause_already_located>
Do NOT re-derive this. It was measured live 2026-09-09 across four consecutive real installs.

`fetchInstalldir` (`installLocation.ts:230`) opens with a `getClient()` null-guard whose
comment claims it saves a PICS round-trip on a cold session. **It saves nothing.**
`buildDepotPlan/fetchAppInfo` pays the identical PICS round-trip 232ms later, and
`SteamUser.ensureConnected` pays a 1629ms cold connect regardless. The only effect of the
guard is to move the installdir decision to before the data exists.

`ensureSteamClientReady` (`clientSetup.ts`) is **not a connection** — it validates the
appId, checks the client is installed, checks `libraryfolders.vdf` exists, and returns
`{ready:true}` in 0–1ms. That is why `runNativeDepotDownload`'s ordering *looks* correct
but isn't.

This has bitten before and was only instrumented, not fixed: `sanitizeInstalldir`'s own
docstring (`installLocation.ts:146`) records `Wasteland`/259130 silently redirecting into
`app_259130`; the response then was to add the WARNING log that is now firing.
</root_cause_already_located>

<interfaces>
<!-- Contracts the executor needs. Do not go looking for these in the codebase. -->

From `src/backend/storeManagers/steam/installLocation.ts`:
- `export interface SteamInstallTarget { targetSteamappsDir: string; installdir: string; installdirFallbackUsed?: boolean }`
- `export interface SteamLibraryTarget { path: string; steamappsDir: string; isPrimary: boolean }`
- `export class UnsafeInstalldirError extends Error {}`
- `export function fallbackInstalldirFor(appId: string): string`
- `export function sanitizeInstalldir(candidate: string | undefined, appId: string, steamappsDir: string): string`
- `export async function listSteamLibraryTargets(): Promise<SteamLibraryTarget[]>`
- `export async function resolveSteamInstallTarget(appId: string, args: InstallArgs): Promise<SteamInstallTarget>`
- private `async function fetchInstalldir(appId: string): Promise<string | undefined>` — never throws
- private `const NUMERIC_APP_ID = /^\d+$/`

From `src/backend/storeManagers/steam/user.ts`:
- `static getClient(): InstanceType<typeof SteamUserLib> | null`
- `static async ensureConnected(): Promise<boolean>` — already awaitable, already de-duplicates
  concurrent callers via `connectingPromise`, has a canary fast path when already connected,
  and returns `false` (never throws) when `isLoggedIn()` is false or the token is unreadable.

From `src/backend/storeManagers/steam/withTimeout.ts`:
- `export const STEAM_PICS_TIMEOUT_MS = 25000`
- `export const STEAM_PICS_BULK_TIMEOUT_MS = 90000`
- `export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T>`
- `export function isTimeoutError(err: unknown): err is TimeoutError`

From `src/backend/storeManagers/steam/library.ts` (private, ~L282-311):
- `async function locateDownloadingTarget(appId): Promise<{ targetSteamappsDir, installdir, name } | null>`
  — loops `getSteamLibraries()`, `existsSync(join(steamappsDir, 'appmanifest_<id>.acf'))`,
  `readFileSync` + `parse` from `@node-steam/vdf`, reads `parsed?.AppState?.installdir`,
  `continue`s on a falsy installdir and on a parse throw.
</interfaces>

<import_direction_constraint>
`library.ts:57-61` already imports from `./installLocation`. Therefore **`installLocation.ts`
must never import from `library.ts`** — that is a cycle. This is why Task 1 extracts the ACF
read into a new leaf module both files import, rather than exporting
`locateDownloadingTarget`.
</import_direction_constraint>

<timeout_arithmetic>
**Hard constraint 3 — show the arithmetic. These numbers were read from source, not assumed.**

Outer bound (`games.ts:1698-1702`): `withTimeout(resolveSteamInstallTarget(...), STEAM_PICS_TIMEOUT_MS * 2)`
= **50 000 ms**. Its own WR-01 comment states this must stay STRICTLY LARGER than any inner
bound, or the outer timer (armed first) pre-empts `fetchInstalldir`'s deliberate graceful
fallback and converts a recoverable transient CM hang into a fatal
"Steam pre-download timed out".

`ensureConnected()` is **NOT self-bounded to anything below 50 000 ms.** Verified worst cases:
- cold-connect path (our case, `getClient()` null): keyring `readTokenOutcome`
  + `connectSteamUserClient`'s own 15 000 ms logOn timeout (`user.ts:386`)
  + the 20 000 ms late-connect grace window that follows it
  = **≥ 35 000 ms**, excluding the keyring read.
- canary path: `CANARY_TIMEOUT_MS` 5 000 + `RELOG_GRACE_MS` 20 000 = **25 000 ms**.
- canary path where `relog()` throws synchronously: 5 000 + the full cold path = **≥ 40 000 ms**.

So an **unbounded** `await ensureConnected()` inside `fetchInstalldir` gives an inner worst
case of ≥ 35 000 + 25 000 (`getProductInfo`) = **≥ 60 000 ms > 50 000 ms** — a WR-01
inversion. **Rejected.**

The bounded design, inner worst case after this fix:

| Step inside `resolveSteamInstallTarget`         | Bound        |
|-------------------------------------------------|--------------|
| `listSteamLibraryTargets` (fs, non-network)      | ms-scale     |
| `readAcfInstalldir` (sync fs + vdf parse)        | ms-scale     |
| `ensureConnected`, NEW `STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS` | 20 000 ms |
| `getProductInfo`, existing `STEAM_PICS_TIMEOUT_MS`           | 25 000 ms |
| **total inner worst case**                       | **45 000 ms** |

45 000 < 50 000 — **strictly smaller, 5 000 ms of headroom.** Relationship preserved.

Why 20 000 ms specifically: a cold connect that is going to succeed settles inside
`connectSteamUserClient`'s own 15 000 ms logOn timeout (measured live: **1 629 ms**).
20 000 covers that path in full plus 5 000 ms of the late-grace edge case, and still leaves
5 000 ms under the outer bound. Abandoning the remaining late-grace window here is not
fatal (hard constraint 2): it degrades to the ACF / `app_<id>` fallback, and
`buildDepotPlan`'s own `ensureConnected` moments later still gets the connection.
</timeout_arithmetic>

<test_environment>
- Backend jest project `displayName: 'Backend'` (`src/backend/jest.config.js`). `--selectProjects`
  is **case-sensitive and fails OPEN** — a mismatched name exits 0 with "No tests found".
  A run reporting `No tests found` is a FAILED verification, never a pass.
- `resetMocks: true` strips implementations off `jest.fn(impl)` before EVERY test, including
  the first, and including implementations supplied at `jest.mock()` factory time. Any mock
  needing an implementation must be re-armed inside the test body or a `beforeEach`. The
  existing tests in `installLocation.test.ts` already do this per-`it`; follow that pattern.
- `installLocation.test.ts` already has: `jest.mock('backend/logger', factory)`,
  `jest.mock('backend/utils', factory)`, `jest.mock('../user')` (automock — `getClient` and
  `ensureConnected` are both already `jest.fn()`), `jest.mock('i18next', factory)`, plus
  local `makeFakeClient()` and `mockProductInfo(appId, installdir)` helpers and `const APP_ID = '12345'`.
- `library.test.ts` already has `jest.mock('graceful-fs')` and `jest.mock('@node-steam/vdf')`.
  A jest module mock is registry-wide for the whole test FILE, so those existing mocks
  continue to cover the ACF read after Task 3 moves it into a new module — **provided the new
  module imports the exact same specifiers** (`graceful-fs`, `@node-steam/vdf`).
- `-t` is a **regex**: never put parentheses in a `-t` filter.
- Never chain a file write and a jest run in one `&&` command — jest reads the stale file.
  Write, then run in a separate call.
</test_environment>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract the shared ACF installdir reader, and land the RED tests</name>
  <files>
    src/backend/storeManagers/steam/acfInstalldir.ts,
    src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts,
    src/backend/storeManagers/steam/__tests__/installLocation.test.ts
  </files>
  <behavior>
    `acfInstalldir.test.ts` (all GREEN at the end of this task — the module is new and
    standalone, nothing is wired to it yet):
    - returns the `AppState.installdir` string when `appmanifest_<appId>.acf` exists in the
      given steamapps dir and parses
    - returns `undefined` when the manifest file does not exist
    - returns `undefined` when the file exists but `parse` throws (corrupt ACF) — must not
      propagate, same discipline as `readAcfState` (T-2-01)
    - returns `undefined` when `AppState.installdir` is absent, empty, or whitespace-only
    - returns the LITERAL on-disk value without sanitizing it — sanitization is the caller's
      job via the one shared `sanitizeInstalldir` (D-03); pin this with an `'../../evil'`
      fixture that comes back verbatim

    `installLocation.test.ts` — three NEW tests, ALL EXPECTED TO FAIL against current HEAD:
    - RED-1 (cold session): `SteamUser.getClient` armed `mockReturnValueOnce(null)` then
      `mockReturnValue(client)`, where `client.getProductInfo` is
      `mockProductInfo(12345, 'Avadon The Black Fortress')`, and
      `SteamUser.ensureConnected` armed `mockResolvedValue(true)`.
      Assert `result.installdir === 'Avadon The Black Fortress'`,
      `result.installdirFallbackUsed` is undefined, and
      `jest.mocked(SteamUser.ensureConnected)` was called.
      **At HEAD this fails with `Received: "app_12345"` and zero `ensureConnected` calls.**
    - RED-2 (ACF precedence): `jest.mock('../acfInstalldir')`, arm
      `readAcfInstalldir` `mockReturnValue('app_257350')`, and arm the client's PICS to
      return `'Baldurs Gate II Enhanced Edition'`. Assert `result.installdir === 'app_257350'`.
      **At HEAD this fails: it returns the PICS name, which is exactly the second-directory-
      beside-a-live-install harm.**
    - RED-3 (ACF short-circuits the connect): with `readAcfInstalldir` returning a usable
      name and `getClient()` null, assert `ensureConnected` was NOT called and
      `getProductInfo` was NOT called — the reinstall path must not pay a cold connect at all.
      **At HEAD this "passes" only vacuously; assert the installdir too so it is non-vacuous.**

    Also add, in this task, the negative-control assertion that keeps RED-1 honest: a test
    where `getClient()` is null AND `ensureConnected` resolves `false` — `installdir` must be
    `app_12345` and `installdirFallbackUsed` must be `true`, and the call must RESOLVE, never
    reject (hard constraint 2). This one passes at HEAD and must still pass after Task 2.
  </behavior>
  <action>
Create `src/backend/storeManagers/steam/acfInstalldir.ts` as a LEAF module — it must import
nothing from `installLocation.ts`, `library.ts`, `games.ts` or `depot.ts` (see
`<import_direction_constraint>`). Its only imports are `existsSync`/`readFileSync` from
`graceful-fs`, `parse` from `@node-steam/vdf`, `join` from `path`, and the logger if a
diagnostic is wanted. Export exactly one function,
`readAcfInstalldir(steamappsDir: string, appId: string): string | undefined`, that reads
`appmanifest_<appId>.acf` from THAT ONE directory and returns `parsed?.AppState?.installdir`
when it is a non-blank string, else `undefined`; a read or parse throw returns `undefined`.

Deliberately per-directory, not per-library-list: `installLocation.ts` needs the ACF in the
one steamapps dir the install has ALREADY been targeted at (the override/primary match), and
`library.ts`'s `locateDownloadingTarget` composes the loop over `getSteamLibraries()` itself.
Document that split in the module docstring.

Docstring must state the D-03 contract explicitly: this function returns the RAW on-disk
value and performs NO sanitization; every caller must funnel it through
`sanitizeInstalldir`, because an ACF is attacker-writable by anyone who can write into
`steamapps/`.

Write `__tests__/acfInstalldir.test.ts` with `jest.mock('graceful-fs')` and
`jest.mock('@node-steam/vdf')`, arming both inside `beforeEach` (resetMocks strips factory
implementations).

Then add the three RED tests plus the negative control to `installLocation.test.ts`. Add
`jest.mock('../acfInstalldir')` at the top alongside the existing mocks and import
`readAcfInstalldir` for arming. Because the automocked default return is `undefined`, every
EXISTING test in the file keeps its current PICS-only behaviour with no edit — verify that
claim by running the whole file, not just the new tests.

Do NOT touch `installLocation.ts` in this task. The RED must be produced by the shipped
defect, not by a half-applied change.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --runInBand src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts</automated>
    <automated>npx jest --selectProjects Backend --runInBand src/backend/storeManagers/steam/__tests__/installLocation.test.ts 2>&1 | tail -60</automated>
  </verify>
  <done>
`acfInstalldir.test.ts` is fully GREEN with a nonzero test count.
`installLocation.test.ts` reports exactly 3 failures — RED-1, RED-2, RED-3 — and every
pre-existing test plus the new negative control still passes. The RED-1 failure output
literally contains `Received: "app_12345"`. **Copy that failure block verbatim into the
SUMMARY as the RED evidence.** A failure that reads `Cannot find module` is a VACUOUS red and
does not count — fix the import and re-run until the failure is the behavioural one.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Connect before deciding, and prefer an existing on-disk ACF — tests go GREEN</name>
  <files>src/backend/storeManagers/steam/installLocation.ts</files>
  <behavior>
    All three RED tests from Task 1 pass. The Task 1 negative control still passes. Every
    pre-existing test in `installLocation.test.ts` — including the WR-01 never-settling
    `getProductInfo` fake-timer test and all seven `UnsafeInstalldirError` abort tests —
    still passes unchanged.
  </behavior>
  <action>
Three edits to `installLocation.ts`.

**(1) Add the bound.** Define and export
`STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS = 20000` (in `withTimeout.ts` next to
`STEAM_PICS_TIMEOUT_MS`, so both bounds live in one place). Its docstring must reproduce the
`<timeout_arithmetic>` table above: 20 000 + 25 000 = 45 000 inner worst case, strictly under
`games.ts`'s 50 000 outer, and must name `user.ts:386`'s 15 000 ms logOn timeout and the
20 000 ms late-connect grace as the reason `ensureConnected` cannot be awaited unbounded.

**(2) Fix `fetchInstalldir`'s cold path.** Replace the `getClient()` null-guard's early
`return undefined` and its now-false "this PICS round-trip is NOT paid here" comment with:
when `getClient()` is null, `await withTimeout(SteamUser.ensureConnected(), STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS, 'fetchInstalldir ensureConnected')`
inside a try/catch, then retry `getClient()`; if it is STILL null, return `undefined` as
before. Justified because that same connection is paid by `buildDepotPlan` moments later
regardless — this only moves the wait to before the decision that depends on it.

Hard constraint 2 — the no-hard-fail degrade is preserved: `ensureConnected` returning
`false`, rejecting, or timing out all fall through to `return undefined`, which
`sanitizeInstalldir` turns into the safe fallback name. `fetchInstalldir` must still be
incapable of throwing. Log the connect timeout at WARNING; do not let it escape.

Replace the two "temporary instrumentation, remove once root cause is confirmed" `[Timing]`
comments in this function with a settled comment recording the confirmed root cause and the
fix, since the investigation they were added for is now closed. Keep the `[Timing]` log
LINES — they are what measured this defect and will measure the fix.

**(3) Prefer an existing on-disk ACF, and correct the fallback flag.** In
`resolveSteamInstallTarget`, after `resolveOverride` has chosen `target` and BEFORE calling
`fetchInstalldir`, call `readAcfInstalldir(target.steamappsDir, appId)`. If it yields a
non-blank value, use it as the candidate and SKIP the PICS lookup entirely (this is what
makes RED-3 pass, and it means a reinstall pays no cold connect). Otherwise fall through to
`fetchInstalldir` as today.

Precedence rationale, put it in the code: the ACF is the on-disk truth for where this app
already lives. `app_257350`, `app_25900` and `app_402060` are LIVE installs whose OWN ACFs
name those directories with `StateFlags=4`. PICS-first would name a reinstall of one of them
`Baldurs Gate II Enhanced Edition` and create a SECOND directory beside the live one —
reproducing this very defect from the other direction, and defeating reconciliation
(`reconciledSkipped=0`). ACF-first makes those reinstalls land back in the directory that
already holds the bytes. It is also what keeps hard constraint 4 satisfiable without any
migration code.

Hard constraint 1 — the ACF candidate MUST be passed to the SAME `sanitizeInstalldir(candidate, appId, target.steamappsDir)`
call the PICS candidate already goes through. Do not add a second sanitizer, do not add an
ACF-only bypass, and do not catch `UnsafeInstalldirError` here — a denylisted or
non-contained ACF candidate must still propagate to `games.ts`'s security abort, exactly as a
hostile PICS candidate does. An ACF is attacker-writable by anyone who can write into
`steamapps/`; that is precisely why D-03 makes this the one shared sanitizer.

Recompute `installdirFallbackUsed` from the FINALLY-CHOSEN candidate, not from
`picsInstalldir`. Leaving it keyed to the PICS variable would make it report `true` on every
ACF-sourced resolve and the flag would lie to `games.ts`'s "installed to fallback directory"
warning.

Do NOT change `sanitizeInstalldir`'s signature, its return contract, its denylist, or its
"PICS returned no usable installdir" warning string. It has a second caller
(`library.ts`'s `buildResumeFinalizeOpts`) and its message is pinned by two tests
(`installLocation.test.ts` ~L478 and ~L493). Log the candidate SOURCE (`acf` vs `pics`) from
`resolveSteamInstallTarget` instead.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --runInBand src/backend/storeManagers/steam/__tests__/installLocation.test.ts src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts</automated>
  </verify>
  <done>
Both suites fully GREEN with a nonzero test count. RED-1/2/3 now pass; the negative control
and all pre-existing tests still pass. `grep -v '^\s*[/*]' src/backend/storeManagers/steam/installLocation.ts | grep -c 'ensureConnected'`
returns ≥ 1 — i.e. the call is in CODE, not only described in a comment.
  </done>
</task>

<task type="auto">
  <name>Task 3: Route library.ts through the same helper, and prove no regression</name>
  <files>
    src/backend/storeManagers/steam/library.ts,
    .planning/todos/pending/2026-09-09-cold-session-installdir-falls-back-to-app-appid.md
  </files>
  <action>
Rewrite `locateDownloadingTarget`'s inner block (`library.ts` ~L282-311) to call
`readAcfInstalldir(steamappsDir, appId)` instead of doing its own
`existsSync` + `readFileSync` + `parse` + `AppState.installdir` read. Keep the
`getSteamLibraries()` loop, the `continue`-on-falsy-installdir behaviour, and the
`library.get(appId)?.title ?? installdir` name lookup exactly as they are — only the ACF read
moves. This is the single-source reuse the fix depends on: `installLocation.ts` and
`library.ts` must never drift on how an ACF installdir is read, for the same reason D-03
makes them share one sanitizer.

Import direction check: `library.ts` -> `acfInstalldir.ts` is a leaf edge, and
`installLocation.ts` -> `acfInstalldir.ts` is too. No cycle is introduced.

If removing the read leaves `existsSync`, `readFileSync` or `parse` unused in `library.ts`,
drop those imports; if other functions in the file still use them, leave them. Let the lint
run below decide — do not guess.

Then update the todo file: set `status: RESOLVED` in the frontmatter (keep `severity`,
`platform` and `ready` keys present and bare/lowercase — `pnpm planning-gates` enforces all
three on `pending/`), and append a resolution note recording the fix (ensureConnected before
the decision, bounded at 20 000 ms; ACF-before-PICS precedence), the RED evidence, and that
its item 3 — reclaiming the existing `app_*` directories — is explicitly NOT done and remains
the operator's call. Do not delete or move the file; leave the `completed/` migration to the
normal todo-close flow.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --runInBand src/backend/storeManagers/steam/__tests__/</automated>
    <automated>npx tsc --noEmit -p tsconfig.json</automated>
    <automated>npx eslint src/backend/storeManagers/steam/acfInstalldir.ts src/backend/storeManagers/steam/installLocation.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/withTimeout.ts src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts src/backend/storeManagers/steam/__tests__/installLocation.test.ts</automated>
    <automated>npx prettier --check src/backend/storeManagers/steam/acfInstalldir.ts src/backend/storeManagers/steam/installLocation.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/withTimeout.ts src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts src/backend/storeManagers/steam/__tests__/installLocation.test.ts</automated>
    <automated>pnpm planning-gates</automated>
  </verify>
  <done>
The whole `src/backend/storeManagers/steam/__tests__/` directory is GREEN with a nonzero test
count — in particular `library.test.ts`, `games.test.ts` and `depot.finalize.test.ts` are
unchanged in outcome. `tsc`, `eslint` and `prettier --check` are clean on the six touched
files. `pnpm planning-gates` passes. The todo carries a RESOLVED status with the RED evidence
and an explicit note that the three live `app_*` directories were not touched.

`git status --porcelain src/` lists exactly the five source files this plan declares and no
others. Verify by inspection that nothing under any `steamapps/common/app_*` path was
created, renamed or removed by this work (hard constraint 4).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CM -> `fetchInstalldir` | PICS `config.installdir` is remote, untrusted input; already the reason `sanitizeInstalldir` exists |
| on-disk `steamapps/` -> `readAcfInstalldir` | **NEW read of an attacker-writable file.** Anyone who can write into `steamapps/` can plant an `appmanifest_<id>.acf` with an arbitrary `installdir` |
| `resolveSteamInstallTarget` -> depot writer | The approved `installdir` becomes a real filesystem write target |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-pym-01 | Tampering | `readAcfInstalldir` -> `resolveSteamInstallTarget` | mitigate | Planted-ACF traversal/separator/control-char candidate. The ACF value is passed to the SAME `sanitizeInstalldir(candidate, appId, target.steamappsDir)` as the PICS value (D-03, hard constraint 1) — denylist + containment against `steamapps/common`, throwing `UnsafeInstalldirError`, which `games.ts` already converts to a security abort. Pinned by the Task 1 `'../../evil'` fixture proving the helper returns the value RAW, so the sanitizer is provably the only thing standing between it and disk. |
| T-pym-02 | Elevation of Privilege | precedence order | accept | ACF-before-PICS lets a local attacker with `steamapps/` write access choose the (sanitized, contained) directory NAME within the install root. Accepted: that attacker can already write files directly into `steamapps/common`, so the capability is strictly weaker than what they hold; and the containment check bounds the effect to a subdirectory of the install root. |
| T-pym-03 | Denial of Service | `ensureConnected` await | mitigate | An unresponsive CM could park the installdir decision. Bounded at `STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS = 20000`; total inner 45 000 < 50 000 outer (see `<timeout_arithmetic>`), so a hang degrades to the fallback name rather than tripping the outer timer into a fatal "Steam pre-download timed out" (hard constraint 3). |
| T-pym-04 | Denial of Service | `fetchInstalldir` throw surface | mitigate | A connect rejection must not become a fatal install error. All `ensureConnected` outcomes (false / reject / timeout) fall through to `return undefined` inside `fetchInstalldir`'s existing never-throws contract (hard constraint 2). Pinned by the Task 1 negative control asserting the call RESOLVES with `app_12345`. |
| T-pym-SC | Tampering | npm/pip/cargo installs | n/a | No new packages. `graceful-fs` and `@node-steam/vdf` are already direct dependencies and already used by `library.ts` for this exact read. |
</threat_model>

<verification>
1. RED-before-GREEN is evidenced, not asserted: the SUMMARY contains the verbatim Task 1
   failure block including `Received: "app_12345"`, produced against an unmodified
   `installLocation.ts`.
2. The failure is behavioural, not `Cannot find module` — a module-resolution red proves
   nothing.
3. `src/backend/storeManagers/steam/__tests__/` is fully GREEN afterwards with a nonzero
   test count. A run reporting `No tests found` is a FAILED verification.
4. `installLocation.ts` contains a real `ensureConnected` call in code, not only in prose:
   `grep -v '^\s*[/*]' src/backend/storeManagers/steam/installLocation.ts | grep -c 'ensureConnected'` ≥ 1.
5. The one-sanitizer contract holds: `installLocation.ts` contains exactly one
   `sanitizeInstalldir(` call site inside `resolveSteamInstallTarget`, reached by BOTH the
   ACF and the PICS candidate.
6. `tsc --noEmit`, `eslint` and `prettier --check` clean on all touched files.
   Run `prettier --check` against the repo paths themselves — never against a temp copy and
   never from a `cd`-ed subdirectory, or it resolves a different config and reports CLEAN
   against zero files.
7. `pnpm planning-gates` passes with the todo's `severity`/`platform`/`ready` keys intact.
8. Hard constraint 4 held: no `steamapps/common/app_*` directory was created, renamed,
   repaired or deleted.
</verification>

<success_criteria>
- A cold session (no steam-user client) resolves the real PICS installdir instead of
  `app_<appid>`, and `ensureConnected` is observably awaited before the decision.
- An existing `appmanifest_<appid>.acf` in the target steamapps dir wins over PICS, with no
  connect and no PICS round-trip paid at all.
- Both candidate sources funnel through the single `sanitizeInstalldir`; a hostile ACF still
  throws `UnsafeInstalldirError`.
- No path added by this plan can hard-fail an install: connect failure, connect timeout and
  PICS failure all degrade to the safe fallback name.
- Inner worst-case 45 000 ms < outer 50 000 ms, with the arithmetic written into the code.
- `installdirFallbackUsed` reports the chosen candidate honestly.
- The three live `app_*` directories are untouched.
</success_criteria>

<output>
Create `.planning/quick/260909-pym-fix-cold-session-installdir-fallback/260909-pym-SUMMARY.md` when done.
It MUST include the verbatim Task 1 RED failure block. Do not commit unless the operator asks
— the working tree carries unrelated untracked files (`.claude/skills/archify/`,
`skills-lock.json`, a `.gitkeep`) and `gsd-sdk query commit` stages the entire tree.
</output>
