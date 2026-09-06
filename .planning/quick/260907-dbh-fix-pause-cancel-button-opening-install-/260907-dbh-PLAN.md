---
quick_id: 260907-dbh
slug: fix-pause-cancel-button-opening-install-
type: execute
date: 2026-09-07
autonomous: true
closes_todo: .planning/todos/pending/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md
files_modified:
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx
  - .planning/todos/pending/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md
  - .planning/todos/completed/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md

must_haves:
  truths:
    - "Mid-download on a non-steam game, clicking the main button calls `handleInstall`, and does NOT call `openInstallGameModal` — the pause/cancel path is reached"
    - "Steam routing is unchanged: a steam game still reaches `handleInstall` unconditionally, and the steam-installing button stays disabled"
    - "The label/action disagreement is audited by a CENSUS over EVERY key of `GameContextType['is']`, type-enforced so a future flag cannot be silently omitted — not a hand-picked sample"
    - "The todo's three named siblings (`is.updating`, `is.reparing`, `is.moving`) get a MEASURED verdict, asserted in the suite: they never change the button label AND the button is disabled while they hold. The negative finding is a passing assertion, not prose"
    - "The new suite was RED against unmodified `MainButton.tsx` with the failure output captured verbatim, and GREEN after the one-line guard change with the test file byte-identical between the two runs"
    - "Every jest verdict in this task is scored on the printed suite/test COUNT, never on the exit code alone (`--selectProjects` is case-sensitive and fails open)"
    - "The downstream pause path is confirmed still reachable by re-verifying two source cites at execution time, so the one-line fix cannot silently no-op behind `if (!folder) return`"
  artifacts:
    - path: "src/frontend/screens/Game/GamePage/components/MainButton.tsx"
      provides: "Install-button onClick that falls through to handleInstall while a non-steam install is in flight"
      contains: "!is.installing"
    - path: "src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx"
      provides: "Direct defect test + type-enforced flag census proving label/action agreement across the whole `is` shape"
    - path: ".planning/todos/completed/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md"
      provides: "RESOLVED record carrying the measured per-flag audit table and the reachability argument for the flags that were cleared"
  key_links:
    - from: "src/frontend/screens/Game/GamePage/components/MainButton.tsx install-button onClick"
      to: "handleInstall"
      via: "early-return guard that now also tests !is.installing"
      pattern: "!is\\.installing"
    - from: "src/frontend/screens/Game/GamePage/index.tsx handleInstall"
      to: "frontend/helpers/library install() -> handleStopInstallation"
      via: "install({ installPath: folder, isInstalling: true })"
      pattern: "isInstalling"
---

<objective>
During a download of a **non-steam** game the game page's main button reads **Pause / Cancel** and
opens the **install modal** instead. The label is computed from `is.installing`; the onClick ignores
that flag entirely.

Fix the guard, and — as the todo explicitly asks — audit the rest of this component for the same
defect shape (a label branch reading a flag the click handler does not), producing a **measured**
verdict for each flag whether or not further defects exist.

Output: a one-line guard change, a census test that was RED at HEAD, and a closed todo carrying the
audit table.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<critical_context>

## Read the todo first — it records a WRONG diagnosis so you do not re-derive it

`.planning/todos/pending/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md`

Its key content, restated so you do not have to reconstruct it:

- The defect is at **`MainButton.tsx:305`** (verified still live at HEAD by the orchestrator):
  `if (!is_installed && !is.queued && gameInfo.runner !== 'steam') {`
- `runner !== 'steam'` is what **SHIELDS** steam. legendary / gog / nile / zoom / sideload are broken;
  **steam is correct**.
- An initial diagnosis against `GamePage/index.tsx:701` (the `runner === 'steam' && !is_installed`
  branch of `handleInstall`) was **WRONG and is recorded as wrong**. That branch does omit
  `!isInstalling`, but it is unreachable here because `disabledInstallButtons` contains
  `(gameInfo.runner === 'steam' && is.installing)` — the steam button is *disabled* during install,
  so its onClick never fires. **Do not "fix" it. Do not re-derive it.**

## The fix

`MainButton.tsx:305`, add one conjunct:

```
if (!is_installed && !is.queued && !is.installing && gameInfo.runner !== 'steam') {
```

## The downstream path is real — but it hangs on `folder`. Re-verify, do not assume.

Traced during planning; **both cites must be re-checked by you before you call the fix delivered**,
because the whole fix silently no-ops if either has moved:

1. `src/backend/downloadmanager/utils.ts:178-183` emits
   `sendGameStatusUpdate({ appName, runner, status: 'installing', folder: path })`. That `folder` is
   what `hasStatus()` hands `GamePage/index.tsx:136`, and what `handleInstall`'s
   `if (!folder) { return }` (`index.tsx:709`) tests.
2. `src/frontend/helpers/library.ts:50-67` — `install()` returns early on `!installPath`, then
   `if (isInstalling)` routes to `handleStopInstallation(...)`. **That is the pause/cancel action.**

So post-fix the click travels: onClick → `handleInstall(false)` → not queued → not settingUpBottle →
not steam → `!is_installed && !isInstalling` is **false** (isInstalling true) so `handleModal()` is
skipped → `folder` truthy → `install({ installPath: folder, isInstalling: true })` →
`handleStopInstallation`. Verify cite 1 and cite 2 with one `grep -n` each and record both in the
SUMMARY. If either has moved, **stop and report** rather than shipping a fix that cannot fire.

## The audit surface — what actually disagrees, and why most of it is unreachable

`getButtonLabel()` (`:141`) consults: `is.notInstallable`, `is.notSupportedGame`, `is.queued`,
`is.installing` (three branches, two of them gated on `runner === 'steam'` / `statusContext`),
`is.settingUpBottle`, plus `gameInfo.runner` / `is_installed` / `install?.steamResumePending`.

The install-button onClick consults only: `is_installed`, `is.queued`, `gameInfo.runner`.

`disabledInstallButtons` (`:51`) = `is.playing || is.updating || is.reparing || is.moving ||
is.uninstalling || is.notSupportedGame || is.notInstallable || is.importing ||
(runner === 'steam' && is.installing) || is.settingUpBottle`.

That is the reachability lever: a flag that both changes the label and appears in
`disabledInstallButtons` cannot produce a click at all. `is.installing` on a non-steam runner is the
one flag that changes the label and is **not** disabled. Your census must *demonstrate* this rather
than restate it.

The todo's three named siblings — `is.updating`, `is.reparing` (note the upstream misspelling, one
`i`), `is.moving` — appear in **neither** `getButtonLabel()` nor `getPlayLabel()`, and appear in
**both** disabled predicates. Their verdict is "no disagreement possible, and unreachable anyway" —
but it must be asserted, not asserted-about.

The **play** button is out of the defect shape and needs no change: its onClick is
`handlePlay(gameInfo)` unconditionally, and `handlePlay` (`index.tsx:662`) opens with
`if (isPlaying || isUpdating) return sendKill(...)`, which is exactly what the `Stop` label promises.
Every other flag `getPlayLabel()` reads (`syncing`, `launching`, `installingRedist`,
`installingWinetricksPackages`) sits in `disabledPlayButtons`. Record this in the SUMMARY as a
read-verified finding; do not spend a task on it.

## The test harness already exists — copy it, do not invent one

`src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamSplitButton.test.tsx` is the
model. The Frontend jest project runs `testEnvironment: 'node'` with **no jsdom and no
react-test-renderer** (see `src/frontend/jest.config.js`), so components are *called as plain
functions* and the returned React-element object graph is walked. Copy from that file verbatim:

- the `DEFAULT_IS` literal typed `GameContextType['is']` (**this typing is what makes the census a
  census** — a new flag on the type breaks `tsc` until it is added here),
- `jest.mock('react', ...)` returning `mockGameContext` from `useContext`,
- `jest.mock('react-i18next', ...)` via `./faithfulTranslate`'s `faithfulReactI18next()`,
- `jest.mock('frontend/hooks/useSetting', ...)`,
- `jest.mock('frontend/components/UI/Dropdown', ...)` — mandatory, it imports `.scss` which is
  unparseable in this project,
- `jest.mock('frontend/state/InstallGameModal')`,
- the `findAll` walker, `resetContext`, `makeGameInfo`, `findInstallButtonsSpan`.

Note `resetMocks: true` in the Frontend project config — mock call counts reset between tests for you.

## Gate reality at HEAD — do not plan around these

- `pnpm test:ci` is **RED** at HEAD for an unrelated leaked-timer reason (`sidecarRpc.ts:339`). Do
  not run it, do not cite it.
- `pnpm lint` is **above its warning ceiling** from Phase 39 debt, so `.husky/pre-push` refuses
  pushes. Do not gate on it; use `--no-verify` only if the user asks you to push (this task does not).
- `--selectProjects` is **case-sensitive and fails open**: the Frontend project's `displayName` is
  exactly `Frontend`. A typo prints `0 total` and exits **0**. Score every run on the printed count.
- **Never** chain a file write and a jest run in one shell command — jest reads stale. Write, then
  run as a separate invocation.

</critical_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — census the label/action disagreement across every `is` flag, prove exactly one is reachable</name>
  <files>src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx</files>
  <behavior>
Against **unmodified** `MainButton.tsx`, this new suite must fail on the `installing` case and only
the `installing` case:

- R1 (the defect, direct): runner `gog`, `is_installed: false`, `is.installing: true` — the install
  button is NOT disabled, its label is the Pause/cancel branch, and clicking it calls
  `handleInstall` exactly once and `openInstallGameModal` **zero** times. → RED at HEAD.
- R2 (census, the audit): for every key of `GameContextType['is']`, with that flag as the only one
  set, runner `gog`, `is_installed: false` — if the label is not the fresh-install branch, then
  EITHER the button is `disabled === true` OR the click does not call `openInstallGameModal`. → RED
  at HEAD, naming `installing`.
- R3 (partition pin): the set of flags that change the label for a `gog` game is exactly
  `{notInstallable, notSupportedGame, queued, installing, settingUpBottle}`. → GREEN at HEAD.
- R4 (the todo's named siblings, measured): for each of `updating`, `reparing`, `moving` — the label
  IS the fresh-install branch **and** the button is `disabled === true`. → GREEN at HEAD.
- R5 (steam unchanged): runner `steam`, `is.installing: true` — button is `disabled === true`; and
  with `is.installing: false`, clicking routes to `handleInstall`, never the modal. → GREEN at HEAD.
  </behavior>
  <action>
Create `MainButton.installClickRouting.test.tsx` in
`src/frontend/screens/Game/GamePage/components/__tests__/`. Head it with a docstring naming quick
`260907-dbh`, the todo it closes, and an explicit **vacuity boundary**: this suite proves element-graph
routing (which handler a click reaches, and whether the node is disabled); it does NOT prove that
`handleStopInstallation` actually stops a live download — that half is covered by the two source
cites recorded in the SUMMARY.

Copy the harness preamble from `MainButton.steamSplitButton.test.tsx` (list in `<critical_context>`).
Keep `DEFAULT_IS` typed `GameContextType['is']` — do not widen it to `Record<string, boolean>`, that
typing is the census mechanism.

Add two helpers on top of the copied `findAll` walker:

- `installButtonOf(tree)` — the first `n.type === 'button'` inside the `installButtons` span (reuse
  `findInstallButtonsSpan`, then `findAll(span, n => n.type === 'button')[0]`).
- `labelIsFreshInstall(button)` — `findAll(button, n => n.type === Download).length > 0`, importing
  `Download` from `@mui/icons-material` (the same module instance `MainButton` imports). Identify the
  branch **structurally by icon element type**, never by translated text — the catalog is
  upstream-owned and its wording is not this suite's business.

Then a `probe(flag)` helper that: `resetContext({ is: { ...DEFAULT_IS, [flag]: true } })`, invokes
`MainButton` with `jest.fn()` handlers it keeps a reference to, pulls the install button, and returns
`{ flag, disabled: button.props.disabled === true, freshInstallLabel: labelIsFreshInstall(button),
opensModal, callsHandleInstall }` — the last two computed by actually awaiting `button.props.onClick()`
and reading the two mocks. Compute the whole table first, assert over it second (the repo's
"partition the findings, then assert" convention) so a failure names the offending flags rather than
just the first one.

Write R1–R5 as described in `<behavior>`. For R2 and R4, assert with the **flag names in the failure
message** (e.g. `expect(violations).toEqual([])` where `violations` is an array of flag-name strings)
so the RED output is self-describing.

Do **NOT** touch `MainButton.tsx` in this task.

Run the suite as its own command (never chained to the write) and capture the output VERBATIM for the
SUMMARY:

    npx jest --selectProjects Frontend --runInBand --verbose src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx

Record: the printed `Tests: N failed, M passed, X total` line, and which test names failed. Expected
RED shape: R1 and R2 fail (R2's violation list contains exactly `installing`), R3/R4/R5 pass. If R2
names any flag *other than* `installing`, you have found a second real defect the plan did not
anticipate — **stop and report it** before writing any fix; do not silently expand scope.

Commit as `test(260907-dbh): RED-prove the install button ignores is.installing for non-steam games`.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runInBand --verbose src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx</automated>
  </verify>
  <done>
The run prints a NON-ZERO total test count (a `0 total` result means the project selector missed —
treat as failure, not success). R1 and R2 FAIL against unmodified `MainButton.tsx`; R2's violation
list is exactly `['installing']`; R3, R4 and R5 PASS. The verbatim failure output and the counts are
captured for the SUMMARY. `MainButton.tsx` is unchanged (`git diff --stat` shows the test file only).
  </done>
</task>

<task type="auto">
  <name>Task 2: GREEN — add `!is.installing` to the guard, re-verify the downstream path, re-run the neighbouring gates</name>
  <files>src/frontend/screens/Game/GamePage/components/MainButton.tsx</files>
  <action>
1. At `MainButton.tsx:305`, change the early-return condition to:

       if (!is_installed && !is.queued && !is.installing && gameInfo.runner !== 'steam') {

   Add a short comment above the `if` citing quick `260907-dbh`: the label branch at `:222` reads
   `is.installing` and renders Pause/cancel, so the click must fall through to `handleInstall` —
   which routes to `install({ isInstalling: true })` → `handleStopInstallation`. Note that steam is
   already excluded by the `runner !== 'steam'` conjunct and is unaffected. **No user-facing strings
   change**; do not add any (and if that ever changes, new keys go in `gamelib.json`, never
   `translation.json`).

2. Re-verify the two downstream cites from `<critical_context>` with one `grep -n` each and record
   both, with their current line numbers, in the SUMMARY:
   - `grep -n "status: 'installing'" -A2 src/backend/downloadmanager/utils.ts` — must still show
     `folder: path` on the same status update.
   - `grep -n "isInstalling" src/frontend/helpers/library.ts` — must still show the `if (isInstalling)`
     branch returning `handleStopInstallation`.
   If either has moved or lost the property, **stop and report**: the guard fix would be inert.

3. Run, each as its own command, and record the printed counts for every one:

   - the new suite (must go fully GREEN, same file, byte-identical to the Task 1 commit — state that
     you did not edit it):
     `npx jest --selectProjects Frontend --runInBand --verbose src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx`
   - the three sibling MainButton suites plus the catalog-defaults gate (no regressions):
     `npx jest --selectProjects Frontend --runInBand src/frontend/screens/Game/GamePage/components/__tests__/`
   - the meta gate that scans this file for hardcoded strings:
     `npx jest --selectProjects Meta --runInBand meta/__tests__/hardcodedStringGate.test.ts`
   - `npx tsc --noEmit -p tsconfig.json` (or `pnpm codecheck` if that is the project's wrapper) —
     exit 0.

   Do NOT run `pnpm test:ci` or `pnpm lint`; both are known-RED at HEAD for unrelated reasons and
   would only manufacture noise.

Commit as `fix(260907-dbh): let the Pause/Cancel button reach handleInstall for non-steam downloads`.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runInBand --verbose src/frontend/screens/Game/GamePage/components/__tests__/</automated>
  </verify>
  <done>
`MainButton.tsx:305` reads `!is_installed && !is.queued && !is.installing && gameInfo.runner !== 'steam'`.
The new suite is GREEN with a non-zero test count, and the test file is unchanged since Task 1 (proven
by `git diff HEAD~1 -- <test file>` being empty). The whole `__tests__/` directory run reports zero
failures with a suite count of at least 5 (4 pre-existing + the new one) — the count is recorded, not
just the exit code. `hardcodedStringGate` passes. Typecheck exits 0. Both downstream cites re-verified
and recorded with current line numbers.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the todo with the MEASURED audit table</name>
  <files>.planning/todos/pending/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md, .planning/todos/completed/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md</files>
  <action>
`git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/` and rewrite it as a
RESOLVED record. Keep the original Symptom and Diagnosis sections intact — including the recorded
WRONG diagnosis, which stays so it is never re-derived. Append:

**`## Resolution (quick 260907-dbh)`** — the one-line guard change with its final form, the commit
shas, and the RED→GREEN evidence: which tests failed against unmodified source (verbatim count line
from Task 1) and the passing counts after (Task 2). State plainly that the test file was byte-identical
across both runs, so the transition is attributable to the source change alone.

**`## The audit the todo asked for — MEASURED, not assumed`** — the table `probe()` produced, one row
per `GameContextType['is']` key, with columns: flag / changes the label? / button disabled? / click
opens the modal? / verdict. Then, in prose:

- the single reachable disagreement was `is.installing` on a non-steam runner, now fixed;
- `notInstallable`, `notSupportedGame` and `settingUpBottle` change the label but sit in
  `disabledInstallButtons`, so the onClick cannot fire — **cleared by unreachability, and R2 asserts
  the `disabled` arm rather than trusting it**;
- `queued` changes the label and is reachable, but the onClick already tests `!is.queued` and routes
  to `handleInstall` — **cleared by correct routing**;
- the todo's three named siblings `is.updating`, `is.reparing`, `is.moving` appear in **neither**
  label function, so no disagreement is even expressible, and both disabled predicates carry them —
  **cleared, and R4 asserts both halves**;
- the play button was read and found to agree: `handlePlay` opens with
  `if (isPlaying || isUpdating) return sendKill(...)`, matching the `Stop` label, and every other flag
  `getPlayLabel()` reads sits in `disabledPlayButtons`. Cite `GamePage/index.tsx:662`.

Say explicitly that the census is over the **whole `is` type** and is type-enforced by `DEFAULT_IS:
GameContextType['is']`, so a flag added later cannot slip past it silently — and name the one way it
still could: if someone widens that annotation.

**`## Limits`** — the suite proves click ROUTING and the disabled attribute on the element graph; it
does not render, does not simulate a real pointer event, and does not prove a live download actually
stops. That last half rests on the two re-verified source cites (`downloadmanager/utils.ts` emitting
`folder`, `helpers/library.ts` routing `isInstalling` to `handleStopInstallation`), which are read
evidence, not runtime evidence. No live UAT was run.

Then append a one-line entry to STATE.md's quick-task table if the project keeps one — **by hand-editing
the file, never via a `gsd-sdk state.*` verb** (that verb has corrupted STATE.md four times in this
project's ledger).

Commit as `docs(260907-dbh): close the pause-button todo with the measured flag audit`.
  </action>
  <verify>
    <automated>test ! -f .planning/todos/pending/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md && grep -c "MEASURED" .planning/todos/completed/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md</automated>
  </verify>
  <done>
The todo no longer exists in `pending/`, exists in `completed/`, and carries a per-flag table covering
every `GameContextType['is']` key with a verdict column, plus the RED→GREEN evidence, plus the Limits
section. The three flags the todo named by hand (`updating`, `reparing`, `moving`) each have a row and
an explicit cleared-by reason.
  </done>
</task>

</tasks>

<verification>
Run each as its own command and score on the printed COUNT, never the exit code:

1. `npx jest --selectProjects Frontend --runInBand --verbose src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx`
   → non-zero total, zero failures.
2. `npx jest --selectProjects Frontend --runInBand src/frontend/screens/Game/GamePage/components/__tests__/`
   → ≥ 5 suites, zero failures.
3. `npx jest --selectProjects Meta --runInBand meta/__tests__/hardcodedStringGate.test.ts` → zero failures.
4. `grep -n "!is.installing" src/frontend/screens/Game/GamePage/components/MainButton.tsx` → matches
   inside the install-button onClick guard.
5. Typecheck exits 0.

Not run, deliberately: `pnpm test:ci` (RED at HEAD, leaked timer in `sidecarRpc.ts:339`) and
`pnpm lint` (above its Phase 39 warning ceiling). Neither is this task's to fix.
</verification>

<success_criteria>
- `MainButton.tsx:305` guard contains `!is.installing`; nothing else in the component changed.
- A new Frontend suite exists that was RED against unmodified source (captured verbatim) and is GREEN
  after, with the test file provably unchanged between the two runs.
- The audit covers every `GameContextType['is']` key by type-enforced census, and its negative findings
  are passing assertions (R3/R4), not prose.
- Zero new user-facing strings.
- The todo is in `completed/` with the measured table and an honest Limits section.
</success_criteria>

<output>
Create `.planning/quick/260907-dbh-fix-pause-cancel-button-opening-install-/260907-dbh-SUMMARY.md` when done.
</output>
</content>
</invoke>
