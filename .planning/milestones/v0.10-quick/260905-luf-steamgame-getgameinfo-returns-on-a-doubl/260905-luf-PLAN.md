---
quick_id: 260905-luf
title: 'SteamGame.getGameInfo() returns {} on a double async cache miss — root-cause the empty-title install-failure surface'
date: 2026-09-05
status: pending
phase: quick-260905-luf
plan: '01'
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [QUICK-LUF-01]
files_modified:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts

must_haves:
  truths:
    - "A terminal Steam install failure never surfaces a nameless subject to the user, even when BOTH getGameInfo caches miss."
    - "A double cache miss inside SteamGame.getGameInfo() is visible in the log — once per appId, not once per call."
    - "The `{}` sentinel contract is preserved: gamedetails/dispatch.ts still converts it to `null` for the frontend."
    - "No caller that today reads `{}` and behaves correctly (tray runner resolution, library-manager fallback, teardown paths) changes behaviour."
  artifacts:
    - path: "src/backend/downloadmanager/utils.ts"
      provides: "exported resolveGameTitle() — the single fallback chain for every DM title consumer"
      contains: "export function resolveGameTitle"
    - path: "src/backend/downloadmanager/__tests__/downloadqueue.test.ts"
      provides: "regression test driving processNotification's error branch under a {} getGameInfo"
    - path: "src/backend/storeManagers/steam/__tests__/games.test.ts"
      provides: "double-miss contract pin + log-once assertion"
  key_links:
    - from: "src/backend/downloadmanager/downloadqueue.ts (processNotification)"
      to: "src/backend/downloadmanager/utils.ts (resolveGameTitle)"
      via: "direct call, passing element.params.gameInfo as the fallback"
      pattern: "resolveGameTitle\\("
    - from: "src/backend/storeManagers/steam/games.ts (getGameInfo double-miss branch)"
      to: "backend/logger logWarning"
      via: "once-per-appId warning before the `{}` return"
      pattern: "logWarning"
---

# Quick Task 260905-luf

## Objective

Root-cause and close the hole where `SteamGame.getGameInfo()` returns a bare
`{} as GameInfo` when BOTH its caches miss, and a downstream consumer then
renders that lie-shaped object as a **nameless** install-failure surface.

**Purpose:** the `{}` return is silent, type-invisible (`as GameInfo` tells
`tsc` every field is present), and reaches at least one consumer that has no
fallback at all.

**Output:** an observable (logged) miss, one shared fallback chain for every
DownloadManager title consumer, and regression tests that drive the double
miss directly.

## Evidence gathered at plan time — do not re-derive, but DO falsify

Read this section before touching code. It is measured from the tree at
`66157d0b4`, not assumed. Item 6 in particular **contradicts the reported
causal chain** and Task 1 exists to resolve that.

1. **The defect site.** `src/backend/storeManagers/steam/games.ts:558`
   `getGameInfo()` — in-memory `library` Map miss, then `steamLibraryStore`
   miss, then `return {} as GameInfo`. The double miss emits **nothing**: no
   log, no metric, no throw. It is completely silent today.

2. **`{}` is an INTENTIONAL cross-runner sentinel, not an accident.**
   `src/backend/gamedetails/dispatch.ts:82-89`:
   `if (!Object.keys(tempGameInfo).length) return null`, with the comment
   *"The game managers return an empty object if they couldn't fetch the game
   info, since most of the backend assumes getting it can never fail."*
   Returning a populated stub from the Steam manager therefore makes this
   check non-empty and hands the **frontend a fake GameInfo instead of the
   `null` it is written to handle**.

3. **Second stub regression:** `src/backend/sidecar/appShellFlowRegistration.ts:536`
   — `const info = libraryManagerMap[runner].getGame(appName).getGameInfo();
   if (info?.app_name) return runner`. This is tray runner resolution looping
   over every runner. A stub carrying `app_name` makes **the Steam manager
   claim ownership of every unknown appName**.

4. **Third stub regression:** `src/backend/storeManagers/steam/library.ts:1257`
   — `const fromGame = new SteamGame(appName).getGameInfo(); if
   (fromGame.app_name) return fromGame`. A stub short-circuits the library
   manager's own persisted-cache fallback.

5. **An existing test PINS the `{}` return:**
   `src/backend/storeManagers/steam/__tests__/games.test.ts` —
   `it('getGameInfo() returns {} when the appId is absent from BOTH the
   in-memory Map and the persisted cache')` asserting `expect(result).toEqual({})`
   (~L6472). Any contract change must consciously rewrite this pin.

6. **⚠ THE OBVIOUS DIALOG IS ALREADY GUARDED — the reported chain does not
   hold as stated.** The backend install-failure dialog
   (`gamelib:box.error.install.failed`, "The installation of {{title}}
   failed: {{error}}", `src/backend/downloadmanager/utils.ts:397`) takes its
   `{{title}}` from `resolveQueueElementTitle` (`utils.ts:55-62`), which is:
   `const { title } = ...getGameInfo(); return title || appName`.
   **It cannot render an empty title unless `appName` itself is empty.** A
   plan that "fixed" this dialog would be fixing something that already
   works. Task 1 must resolve where the observed emptiness actually comes
   from.

7. **The UNGUARDED sibling — leading candidate.**
   `src/backend/downloadmanager/downloadqueue.ts:388-390`, `processNotification`:
   `const { title } = libraryManagerMap[...].getGame(...).getGameInfo()`
   with **no `|| appName`**, then on `status === 'error'`:
   `notify({ title, body: i18next.t('notify.install.failed', 'Installation Failed') })`.
   `notify`'s parameter type is `title: string`
   (`src/backend/dialog/dialog.ts:56-60`) but the `{} as GameInfo` cast means
   it is `undefined` at runtime — a nameless "Installation Failed"
   notification, with `tsc` green.

8. **Two more unguarded reads of the same shape:**
   `src/backend/sidecar/installFlowRegistration.ts:342` (move) and `:475`
   (import), both `const { title } = ...getGameInfo()` feeding `notify({ title, ... })`.

9. **A better fallback than the bare appId already exists in scope.**
   `InstallParams.gameInfo: GameInfo` (`src/common/types.ts:481-486`) — every
   DM queue element carries the GameInfo captured at enqueue time, which has
   a real human title. `processNotification` has `element.params.gameInfo`
   in scope and ignores it.

## D-01 — the contract for the miss case (decided, with the rejects)

**CHOSEN: keep `{}` as the sentinel; make it LOUD, and make every title
consumer fallback-safe.**

Rationale — the three offered options each have a *named* regression here:

- **(a) Return a minimally-valid stub carrying `app_name`/`runner`/`title`.**
  REJECTED. Breaks evidence items 2, 3 and 4 simultaneously: the frontend's
  `null` contract at `dispatch.ts:88`, tray runner resolution at
  `appShellFlowRegistration.ts:536`, and the library manager's own fallback
  at `library.ts:1257`. It also flips the pin at item 5. The `{}` is a
  *protocol* shared by five store managers; changing it from inside the Steam
  one is a cross-runner protocol change wearing a bugfix's clothes.
- **(b) Make the method async / add an await-the-library path.** REJECTED for
  this task. `getGameInfo()` is synchronous at ~40 call sites across ~20
  files, including `finally` blocks and notification paths. Viral; not a
  quick task. (Worth a real phase if the hydration race itself is ever
  attacked.)
- **(c) Throw on miss.** REJECTED. Memory record
  `null-to-throw-accessor-swap-drops-guaranteed-cleanup`: a null→throw
  accessor swap in this codebase has already SKIPPED an unconditional
  cleanup once. `getGameInfo()` is called inside
  `downloadqueue.ts`'s `removeDownloaded` teardown (L344-346, reading
  `folder_name` to delete the partial install) and inside
  `installQueueElement`'s `finally`. A throw there strands exactly the
  cleanup those paths exist to perform. A throw is not free here.

**The residual defect is therefore at the consumer, and the silence is at the
producer.** Fix both: log the miss once per appId; give every DM title
consumer the same fallback chain
`live.title → element.params.gameInfo?.title → appName`.

**Overturn clause:** the executor may abandon D-01 ONLY if Task 1 produces
evidence that contradicts items 2-4. If that happens, **stop and report** —
do not silently switch contracts mid-task.

## Gates that apply (live constraints in this repo)

- **No new user-visible strings are expected.** The fallback resolves to an
  existing appId/title; no new copy. If the executor finds a case that needs
  new copy, the key goes in `public/locales/en/gamelib.json` under
  `box.error.install.*` or `notify.*` and **NEVER** `translation.json`.
  Verify with `git diff --stat public/locales/en/translation.json` → must be
  empty.
- **Never run `pnpm test`.** It manufactures unrelated failures under load.
  Every verify below names explicit test file paths.
- **Do not use `--selectProjects`.** `jest.config.js` declares `projects` as
  bare paths with no `displayName`, so the flag is case-sensitive and fails
  open. Path-scoped runs are confirmed working and fast
  (`npx jest <path>` resolved 265 tests in 0.16s during planning).
- Pre-push runs prettier repo-wide and re-reddens easily: run
  `npx prettier --check` on the touched files before finishing.

## Tasks

<task type="auto" tdd="true">
  <name>Task 1: Trace the real chain and RED-prove the unguarded consumer</name>
  <files>src/backend/downloadmanager/__tests__/utils.test.ts, src/backend/downloadmanager/__tests__/downloadqueue.test.ts</files>
  <behavior>
    - Test A (utils.test.ts, the CONTROL): `installQueueElement` with
      `runner: 'steam'`, `libraryManagerMap.steam.getGame().getGameInfo`
      mocked to return `{}`, and `install()` resolving `{status: 'error'}`.
      Assert `showDialogBoxModalAuto` was called with a message whose
      interpolated subject is NON-EMPTY (the appName). EXPECTED OUTCOME:
      GREEN on first run — this is the falsifier for evidence item 6. If it
      is RED, evidence item 6 is wrong and that is the headline finding.
    - Test B (downloadqueue.test.ts, the SUSPECT): drive
      `processNotification`'s `status === 'error'` branch through the
      existing harness (the file already mocks `notify: jest.fn()` at L100
      and reaches `processNotification` via its real `initQueue()` calls —
      see that file's own comment at L253-254). Seed a persisted queue
      element whose `params.gameInfo.title` is a real name, mock
      `getGameInfo` to `{}`, and assert `notify` was called with a
      non-empty `title`. EXPECTED OUTCOME: RED — `title` is `undefined`.
  </behavior>
  <action>
    Do NOT edit production code in this task. Establish the causal chain by
    measurement, then record it.

    1. Write Test A and Test B as described. Run each and record the actual
       pass/fail — not the expected one.
    2. Census every consumer that reads a title (or any field) off a possibly-`{}`
       Steam GameInfo and renders/notifies it without a fallback. Start from
       the four already found (downloadqueue.ts:388-390;
       installFlowRegistration.ts:342 and :475; utils.ts:60 — the last is
       already guarded) and widen with:
       `grep -rn "getGameInfo()" src/backend --include='*.ts' | grep -v __tests__`
       For each hit, record: guarded / unguarded / not-a-title-consumer.
    3. Record in the task summary the EXACT `file:line` chain from
       `games.ts:558`'s `{}` to the nameless surface, and state plainly which
       surface the user actually saw. If the trace shows the reported
       "install-failure dialog" is in fact the OS notification from
       `processNotification` rather than `showDialogBoxModalAuto`, say so —
       the task description's framing is a hypothesis, not a finding.
    4. Do not proceed to Task 2 until the chain is named with evidence.
  </action>
  <verify>
    <automated>npx jest src/backend/downloadmanager/__tests__/utils.test.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts 2>&1 | tail -30</automated>
    RED proof required: Test B must FAIL, and the failure message must show
    the received title as `undefined`/empty (not a generic "cannot read
    property" — that would mean the harness never reached the branch).
  </verify>
  <done>
    Test A and Test B exist and their real outcomes are recorded. The
    `file:line` chain from the `{}` return to the nameless surface is written
    down. The consumer census is written down with a guarded/unguarded verdict
    per call site. If Test A came back RED, that is reported instead of
    assumed away.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Make the miss loud at the producer and fallback-safe at every consumer</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/downloadmanager/utils.ts, src/backend/downloadmanager/downloadqueue.ts, src/backend/sidecar/installFlowRegistration.ts</files>
  <behavior>
    - `resolveGameTitle(map, runner, appName, fallback?)` returns the live
      title when present; else `fallback?.title`; else `appName`. Never
      returns an empty string when `appName` is non-empty.
    - `processNotification`'s error branch notifies with a non-empty title
      when `getGameInfo()` returns `{}` but the queue element carries a title.
    - `SteamGame.getGameInfo()` still returns `{}` on a double miss (shape
      unchanged) and logs a warning naming the appId — at most once per appId
      per process.
  </behavior>
  <action>
    Implement D-01. Four edits, scoped by the Task 1 census.

    1. `src/backend/storeManagers/steam/games.ts` — in the double-miss branch,
       immediately before `return {} as GameInfo`, emit a `logWarning` with
       `LogPrefix.Steam` naming the appId and stating that BOTH the in-memory
       `library` Map and the persisted `steamLibraryStore` missed, so callers
       receive the empty sentinel. **Gate it to once per appId** via a
       module-level `Set<string>` — `getGameInfo()` is called on every library
       render and an ungated log would flood `gamelib.log`. Do NOT change the
       returned value; the existing pin at games.test.ts ~L6472 must still
       pass untouched. Extend the existing doc comment above the method to
       name this quick task and say why the sentinel is kept (cite
       `dispatch.ts:88`, `appShellFlowRegistration.ts:536`,
       `library.ts:1257`).
    2. `src/backend/downloadmanager/utils.ts` — export a new pure
       `resolveGameTitle(libraryManagerMap, runner, appName, fallback?: GameInfo): string`
       implementing `live.title || fallback?.title || appName`. Rewrite the
       existing private `resolveQueueElementTitle` (L55-62) to delegate to it
       so there is exactly ONE fallback chain in the module. Behaviour of the
       existing install-failure dialog must be byte-identical for every case
       it already handled — the fallback parameter is additive.
    3. `src/backend/downloadmanager/downloadqueue.ts` — replace
       `processNotification`'s bare `const { title } = ...getGameInfo()`
       (L388-390) with `resolveGameTitle(libraryManagerMap,
       element.params.runner, element.params.appName, element.params.gameInfo)`.
       This covers the paused / canceled / failed / finished branches at once,
       all of which pass `title` to `notify`.
    4. `src/backend/sidecar/installFlowRegistration.ts` — apply the same
       fallback at L342 (move) and L475 (import) IF the Task 1 census
       confirmed them unguarded. Those sites have no queue element, so the
       chain there is `live.title || appName`. If the census found them
       guarded or unreachable, skip and say so.

    Constraints:
    - Do NOT populate `{} as GameInfo` with a stub. Do NOT make
      `getGameInfo()` async. Do NOT make it throw. See D-01 for the named
      regression each of those causes.
    - No new i18n keys are expected. If one becomes necessary, it goes in
      `public/locales/en/gamelib.json` — never `translation.json`.
  </action>
  <verify>
    <automated>npx jest src/backend/downloadmanager/__tests__/utils.test.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts 2>&1 | tail -20</automated>
    Task 1's Test B must now be GREEN, and the pre-existing
    `expect(result).toEqual({})` pin in games.test.ts must still pass
    unmodified. Also run `npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5`
    (exit 0) and `git diff --stat public/locales/en/translation.json` (must
    print nothing).
  </verify>
  <done>
    The double miss is logged once per appId and still returns `{}`. Every
    unguarded title consumer named by the Task 1 census resolves through
    `resolveGameTitle`. No stub, no async, no throw. tsc clean,
    `translation.json` untouched.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Lock the contract and the fallback chain with regression tests</name>
  <files>src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/downloadmanager/__tests__/utils.test.ts, src/backend/downloadmanager/__tests__/downloadqueue.test.ts</files>
  <behavior>
    - games.test.ts: the double-miss (empty `library` Map + empty
      `steamLibraryStore`) still returns `{}` — the existing pin, kept.
    - games.test.ts: the double miss emits exactly ONE `logWarning` naming the
      appId, and a SECOND `getGameInfo()` call for the same appId emits no
      further warning (log-once, RED-provable by removing the Set guard).
    - games.test.ts: a miss for a DIFFERENT appId still warns (the Set guard
      is per-appId, not a global one-shot).
    - utils.test.ts: `resolveGameTitle` — live title wins; `{}` live + fallback
      title yields the fallback; `{}` live + no fallback yields `appName`;
      empty-string live title is treated as absent (not returned).
    - downloadqueue.test.ts: `processNotification`'s error branch notifies with
      the queue element's captured title when `getGameInfo()` returns `{}`
      (Task 1's Test B, now green), and still notifies with the LIVE title
      when the library Map is hydrated (no regression for the normal path).
  </behavior>
  <action>
    Add the tests above alongside the existing suites — do not restructure
    them. Follow the established fixture pattern in games.test.ts's
    "steam-library-22-games-missing" describe block (~L6425-6485):
    `library.delete(APP_ID)` to undo the describe-level seed, then
    `;(steamLibraryStore.get as jest.Mock).mockReturnValue([])` for the
    persisted miss.

    RED-prove each new assertion before declaring it done: temporarily revert
    the corresponding Task 2 edit (or delete the Set guard for the log-once
    test), confirm the test fails, restore. Record which assertions were
    RED-proven and which were not — a test that was never seen to fail proves
    nothing.

    Cross-reference the new games.test.ts block to this quick task id
    (260905-luf) and to D-01 so a future reader knows the `{}` return is a
    DECISION, not an oversight.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts 2>&1 | tail -15</automated>
    All three suites green, and the printed test count for games.test.ts is
    strictly greater than the pre-task count (record both numbers — a
    silently-skipped new test is the failure mode here). Then
    `npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/downloadmanager/utils.ts src/backend/downloadmanager/downloadqueue.ts src/backend/sidecar/installFlowRegistration.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts`
    and `npx eslint <same file list> 2>&1 | tail -5` — both exit 0.
  </verify>
  <done>
    The `{}` contract, the log-once behaviour, the three-step fallback chain,
    and the notification's non-empty title are each pinned by a test whose RED
    was observed. prettier and eslint clean on every touched file. Test counts
    before/after recorded.
  </done>
</task>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backend → gamelib.log | new warning line; must not leak secrets |
| backend → OS notification / renderer dialog | title string crosses to a user-visible surface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-luf-01 | Information disclosure | `getGameInfo()` double-miss `logWarning` | mitigate | Log the numeric appId and the two cache names only — never the store contents, never a path, never a token. Matches the existing `LogPrefix.Steam` warnings in the same method. |
| T-luf-02 | Denial of service | same log line | mitigate | Once-per-appId `Set` guard; `getGameInfo()` runs on every library render, so an ungated warning would flood `gamelib.log` on a cold boot with a large library. |
| T-luf-03 | Spoofing | `resolveGameTitle` fallback to `element.params.gameInfo` | accept | The queue element's GameInfo originates from this app's own enqueue path, not from a remote source; it is already trusted for `size` and `runner` on the same object. |
| T-luf-SC | Tampering | npm/pip/cargo installs | n/a | This task installs no packages. If that changes, the Package Legitimacy Gate applies and a blocking human checkpoint is required. |
</threat_model>

## Verification

- `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts` — all green.
- `npx tsc --noEmit -p tsconfig.json` — exit 0.
- `git diff --stat public/locales/en/translation.json` — empty.
- `npx prettier --check` + `npx eslint` on the touched file list — exit 0.
- **Never** `pnpm test`.

## Success Criteria

- The `file:line` causal chain from `games.ts:558`'s `{}` to the nameless
  user-visible surface is recorded, with the evidence-item-6 discrepancy
  explicitly resolved rather than glossed.
- `SteamGame.getGameInfo()` still returns `{}` on a double miss — the
  cross-runner sentinel is intact and `dispatch.ts:88` still converts it to
  `null`.
- The double miss is no longer silent: one warning per appId per process.
- Every title consumer named unguarded by the census resolves through a
  single shared fallback chain, and no Steam install failure can surface a
  nameless subject.
- Each new assertion's RED was observed at least once and recorded.

## Output

Write `.planning/quick/260905-luf-steamgame-getgameinfo-returns-on-a-doubl/260905-luf-SUMMARY.md`
when done, including the Task 1 trace, the consumer census table, the
RED-proof ledger, and the before/after test counts.
