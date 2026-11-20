---
phase: quick-260919-tms
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts
  - src/frontend/helpers/declaredUnavailable.ts
  - src/frontend/screens/Game/GameSubMenu/index.tsx
  - .planning/todos/pending/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md
  - .planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md
autonomous: true
requirements:
  - TODO-2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux

must_haves:
  truths:
    - "All 5 `window.api.<eosChannel>` call sites in GameSubMenu/index.tsx go through `callOrDeclare`, so a rejection writes one durable `[GAMELIB_DECLARED_UNAVAILABLE]` line to gamelib.log instead of a silent unhandled rejection."
    - "A declined EOS call clears `eosOverlayRefresh`, so the menu item's spinner can no longer stick until remount."
    - "A new GameSubMenu-scoped guard test fails RED against the pre-edit source and passes GREEN after the edit."
    - "`AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts` is byte-unchanged and still passes (its `EXPECTED_EOS_CALL_SITES = 11` is untouched)."
    - "The hardcoded-string/i18n gate stays at zero violations across the whole committed scope — GameSubMenu/index.tsx IS in that scope."
    - "The todo is corrected (3 -> 5 sites, stale line numbers, D-08 -> D-03, unbuildable discharge condition) and moved to `.planning/todos/completed/`."
  artifacts:
    - path: "src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts"
      provides: "Source-text structural gate over GameSubMenu's EOS call sites"
      contains: "callOrDeclare("
    - path: "src/frontend/helpers/declaredUnavailable.ts"
      provides: "Shared `EOS_FEATURE` display constant, out of i18n gate scope"
      contains: "export const EOS_FEATURE"
    - path: "src/frontend/screens/Game/GameSubMenu/index.tsx"
      provides: "5 wrapped EOS call sites with refresh-state release on decline"
      contains: "callOrDeclare"
    - path: ".planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md"
      provides: "Corrected, closed todo"
      contains: "status: completed"
  key_links:
    - from: "src/frontend/screens/Game/GameSubMenu/index.tsx"
      to: "src/frontend/helpers/declaredUnavailable.ts"
      via: "named import of callOrDeclare, EOS_FEATURE, DEFERRAL_D03"
      pattern: "import \\{[^}]*callOrDeclare[^}]*\\} from 'frontend/helpers/declaredUnavailable'"
    - from: "src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts"
      to: "src/frontend/screens/Game/GameSubMenu/index.tsx"
      via: "readFileSync of the real component source"
      pattern: "readFileSync\\("
---

<objective>
Wrap GameSubMenu's **five** EOS overlay `window.api.*` call sites in `callOrDeclare`, so a
rejection under Tauri (where all 8 EOS channels are deferred, D-03) produces one durable
`gamelib.log` line instead of a post-mount unhandled rejection that reaches nothing, and so the
menu item's "refreshing" spinner is released on the decline path instead of sticking until
remount.

Purpose: discharges
`.planning/todos/pending/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md`.
That todo is **wrong in three ways** and the plan corrects it rather than following it (see
`<corrections_to_the_source_todo>`).

Output: one new guard test, one new shared constant, five wrapped call sites, and the corrected
todo moved to `completed/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@src/frontend/helpers/declaredUnavailable.ts
@src/frontend/screens/Game/GameSubMenu/index.tsx
@src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
@src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts
@src/frontend/helpers/__tests__/DeferredChannelCallSiteGuard.test.ts
@.planning/todos/pending/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md
</context>

<corrections_to_the_source_todo>
Measured against HEAD (`318817a88`) in this session. **Do not follow the todo's own numbers.**

1. **5 call sites, not 3.** `handleEosOverlay()` now spans `index.tsx:231-281` (the todo's
   `225-241` is stale):
   - `:234` `await window.api.disableEosOverlay(appName)`
   - `:238` `await window.api.enableEosOverlay(appName)`
   - `:261` `await window.api.installEosOverlay()` — inside the install dialog's Yes handler
   - `:263` `await window.api.enableEosOverlay(appName)` — **second one, missing from the todo**
   - `:321-323` `window.api\n  .isEosOverlayEnabled(appName)\n  .then(...)` in the `useEffect` —
     **missing from the todo**

2. **The deferral id is `D-03`, not `D-08`.** Use the already-exported `DEFERRAL_D03`.

3. **The todo's discharge condition is unbuildable as written.** It says to update
   `EosDeclineCallSiteGuard.test.ts`'s anchor "to reflect the new total across both files". That
   guard's `componentPath = join(__dirname, '..', 'index.tsx')` hard-binds it to
   AdvancedSettings, and 5 of its 6 assertions are AdvancedSettings-specific. Leave
   `EXPECTED_EOS_CALL_SITES = 11` alone; write a **new, separately-named sibling guard** scoped
   to GameSubMenu instead (Task 1).
</corrections_to_the_source_todo>

<measured_constraints>
Each of these was measured in this session. They are the non-obvious part of the job.

**C1 — the i18n gate trap. Do NOT copy AdvancedSettings' local `EOS_FEATURE`.**
`src/frontend/screens/Game/GameSubMenu/index.tsx` **IS** listed in `meta/i18nGateScope.json`
(line 93); `AdvancedSettings/index.tsx` is **not**. A local
`const EOS_FEATURE = 'EOS Overlay'` in GameSubMenu is a two-word phrase, so it fails
`isTechnicalToken()`'s `LOWERCASE_TOKEN_RE` (`/^[a-z][a-zA-Z0-9]*$/`,
`meta/hardcodedStringGate.ts:259`) and lands as a **blocking** `kind: variable` violation. This
exact failure is already recorded at `declaredUnavailable.ts:109-121` (plan 34.5-55's Rule 1
auto-fix) for `EditGameDialog`/`SideloadDialog`. Fix: export `EOS_FEATURE` from
`declaredUnavailable.ts` (`grep -c declaredUnavailable meta/i18nGateScope.json` = **0**; the
gate does not scan it) and import it.

The bare channel literals (`'disableEosOverlay'` etc.) are safe as-is: single lowercase-initial
camelCase tokens, no whitespace, no dot — `LOWERCASE_TOKEN_RE` exempts them. No
`EOS_CHANNEL_BY_MEMBER` map is needed (unlike the dotted `steamgriddb.*` channels).

**C2 — do NOT touch `AdvancedSettings/index.tsx`.** This is a *correctness* constraint, not a
consistency preference. Its own guard asserts, verbatim:
`expect(collapsed).toContain("import { callOrDeclare } from 'frontend/helpers/declaredUnavailable'")`
(`EosDeclineCallSiteGuard.test.ts:90-93`). Switching that file to
`import { callOrDeclare, EOS_FEATURE } from ...` deletes that exact substring and turns the guard
RED. AdvancedSettings keeps its local duplicate `EOS_FEATURE`/`EOS_DEFERRAL`; leave both files
byte-unchanged.

**C3 — the existing guard's regex cannot see the 5th call site; yours must.** Measured: with the
AdvancedSettings guard's `collapse()` + `window\.api\.(<channel>)` regex, GameSubMenu's pre-edit
count is **4**, not 5. `collapse()` maps the newline+indent in
`window.api\n  .isEosOverlayEnabled(...)` to a single **space**, so `window.api .isEos…` never
matches. A whitespace-tolerant `window\.api\s*\.\s*(<channel>)` finds all **5**. Use the tolerant
form in the new guard, and say why in its header — a guard defeated by a Prettier method-chain
break is exactly the green-check-proving-nothing shape this repo keeps stamping out.

**C4 — behavioural payload, not just logging.** Today a rejection from these awaits means the
following `setEosOverlayRefresh(false)` never runs, so the spinner at `index.tsx:527-541`
(`eosOverlayRefresh ? refreshCircle() : <button …>`) sticks until remount. `callOrDeclare`
resolves `{ok:false}` and **never throws**, so the wrapping must actually release
`eosOverlayRefresh` on every `!result.ok` path. Mirror AdvancedSettings' precedented shape and its
comment ("Runs on BOTH branches (ok and not-ok) — callOrDeclare never throws…",
`AdvancedSettings/index.tsx:189-192`).

**C5 — no new user-facing strings, and no new UI state.** `EOS_FEATURE` only ever reaches
`callOrDeclare`'s internal `window.api.logError` line; it is never rendered. Deliberately **out of
scope**: GameSubMenu does *not* get AdvancedSettings' `eosOverlayUnavailable` state or a visible
"unavailable" label. Its EOS surface is one toggle button, not a panel with fabricable status
text, and adding a visible decline string would pull in the l10n standing requirement (new strings
go in `gamelib.json`) for no measured gain. If that is wanted later it is a separate todo.

**C6 — the `git mv` trap.** `git mv` commits **HEAD** content and drops unstaged edits — measured
twice on this repo, the second time undetected for 7 days. In Task 3, `git mv` **first**, edit at
the new path **second**, then `git add` and verify the staged content with
`git diff --cached -- .planning/todos/completed/…` before committing.
</measured_constraints>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the GameSubMenu-scoped EOS call-site guard, and capture its RED</name>
  <files>src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts</files>
  <behavior>
    Written and run BEFORE any source edit, so its RED is real and captured rather than asserted.
    Post-edit (Task 2) it must be fully GREEN with no change to its assertions.

    - Anchor: exactly 5 EOS call sites found in the real `GameSubMenu/index.tsx`, and `> 0`.
      (GREEN pre-edit AND post-edit by design — this is the deletion detector, not the RED source.)
    - Every one of the 5 is preceded, within `CALL_SITE_WINDOW` collapsed characters, by
      `callOrDeclare(`. (RED pre-edit: 0 of 5.)
    - The file imports `callOrDeclare` from `frontend/helpers/declaredUnavailable`. (RED pre-edit.)
    - Every `!` + `.ok` decline branch in `handleEosOverlay` releases the spinner: the collapsed
      source contains `setEosOverlayRefresh(false)` at least as many times as it contains
      `callOrDeclare(` minus one (the `isEosOverlayEnabled` probe in the `useEffect` owns no
      spinner) — pin the exact measured counts rather than an inequality if the post-edit shape
      makes an exact number honest. (RED pre-edit.)
    - Self-tests (anti-vacuity): the anchor fires on a synthetic source with one call site
      renamed away; the wrapper invariant fires on a synthetic bare unwrapped EOS call; the
      whitespace-tolerance is itself proven by a synthetic
      `window.api\n  .isEosOverlayEnabled(x)` input matching (this is the assertion that pins C3
      and must not be dropped).
  </behavior>
  <action>
    Create `src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts`.

    Name it exactly that — a DISTINCT leaf name, NOT a second `EosDeclineCallSiteGuard.test.ts`.
    Duplicate leaf names have already caused `git log -S` to blame the wrong commit on this repo.

    Mirror the proven shape of the two existing guards
    (`AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts` and
    `helpers/__tests__/DeferredChannelCallSiteGuard.test.ts`): `readFileSync` the real component
    source, `collapse()` every whitespace run to a single space, scan with a `RegExp` built from
    the imported `EOS_OVERLAY_CHANNELS`, and check a preceding `CALL_SITE_WINDOW` (200) collapsed
    characters for `callOrDeclare(`. Import `EOS_OVERLAY_CHANNELS` from
    `frontend/helpers/declaredUnavailable` — never re-list the eight names by hand.

    Two deliberate deviations from the AdvancedSettings guard, both of which belong in the new
    file's header comment with their measured reason:
    (a) the call-site regex is `window\.api\s*\.\s*(<channels>)`, not `window\.api\.(<channels>)`
        — see C3; the strict form measures 4 where the truth is 5.
    (b) the import assertion uses `DeferredChannelCallSiteGuard.test.ts`'s regex form
        (`/import \{[^}]*\bcallOrDeclare\b[^}]*\} from 'frontend\/helpers\/declaredUnavailable'/`),
        not an exact solo-import literal, because GameSubMenu imports three names from that module
        and Prettier may wrap the statement.

    Every positive assertion uses `toBe`/`toContain`/`toMatch`. Never a bare negative-regex
    assertion on the real source — this project shipped 7 vacuous ones and that guard's header
    bans the shape. Negative assertions appear ONLY inside the `self-test` describe block, against
    synthetic strings.

    Then run it against the untouched source and paste the verbatim failure output into the
    summary as the RED proof. Expect: the wrapper assertion, the import assertion and the
    spinner-release assertion RED; the count anchor GREEN at 5.

    Do NOT use `git stash` to produce the RED — an executor stash has previously stranded a
    concurrent session on this repo. Writing the test first makes the stash unnecessary.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runInBand src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts</automated>
  </verify>
  <done>The guard file exists; run against the pre-edit source it reports a NON-ZERO number of failing tests (never an empty/erroring suite), and the verbatim output is captured for the summary.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Export EOS_FEATURE and wrap all 5 GameSubMenu EOS call sites</name>
  <files>src/frontend/helpers/declaredUnavailable.ts, src/frontend/screens/Game/GameSubMenu/index.tsx</files>
  <behavior>
    - Task 1's guard turns fully GREEN with zero edits to its assertions.
    - `AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts` and
      `helpers/__tests__/DeferredChannelCallSiteGuard.test.ts` both still pass, unchanged.
    - `helpers/__tests__/declaredUnavailable.test.ts` still passes (it pins
      `EOS_OVERLAY_CHANNELS` at 8 entries against the deferred inventory bucket; adding an
      unrelated export must not disturb it).
    - The whole-scope hardcoded-string gate still reports zero violations, and its
      `scannedFiles`/allowlist/file-exempt integrity assertions are untouched.
  </behavior>
  <action>
    **2a — `src/frontend/helpers/declaredUnavailable.ts`.** Add
    `export const EOS_FEATURE = 'EOS Overlay'` next to the existing `STEAMGRIDDB_FEATURE` /
    `WINETRICKS_FEATURE` / `DEFERRAL_D03` block (currently ~line 122), extending that block's
    existing doc comment to name the EOS cluster and GameSubMenu as the in-gate-scope caller (the
    comment already explains the identical reasoning for SteamGridDB — do not duplicate the
    explanation, extend it). Do NOT add a channel-name map: EOS channel names are bare camelCase
    tokens and are already technical-token exempt (C1).

    **2b — `src/frontend/screens/Game/GameSubMenu/index.tsx`.** Add
    `import { callOrDeclare, DEFERRAL_D03, EOS_FEATURE } from 'frontend/helpers/declaredUnavailable'`
    and rewrite `handleEosOverlay()` (231-281) plus the `useEffect` probe (321-323) so every
    `window.api.<eosChannel>` call is the `call:` thunk of a `callOrDeclare({ channel, feature:
    EOS_FEATURE, deferral: DEFERRAL_D03, call })` invocation. Five sites, wrapped one-for-one —
    add none, delete none.

    Per-site decline behaviour (C4). `callOrDeclare` returns `{ok:true,value} | {ok:false,…}`, so
    the previously-destructured results now come off `.value`:
    - `disableEosOverlay` → release `eosOverlayRefresh` on BOTH branches; only set
      `eosOverlayEnabled(false)` when `ok`.
    - the first `enableEosOverlay` → on `!ok`, release the spinner and `return` before reading
      `installNow`/`wasEnabled` (they now live on `.value`).
    - `installEosOverlay` (dialog Yes handler) → on `!ok`, release the spinner and `return`
      without attempting the follow-up enable.
    - the second `enableEosOverlay` (dialog Yes handler) → release the spinner on BOTH branches;
      only `setEosOverlayEnabled(...)` when `ok`.
    - `isEosOverlayEnabled` (useEffect probe) → only `setEosOverlayEnabled` when `ok`. This one
      owns no spinner; do NOT touch `eosOverlayRefresh` here (it is driven by `libraryStatus`
      immediately above). Keep the `useEffect` callback synchronous — a `.then((result) => { if
      (result.ok) … })` on the `callOrDeclare` promise is the smallest correct diff.

    Leave the "No" button's `onClick: () => setEosOverlayRefresh(false)` exactly as-is, and leave
    the Phase-35 `installNow` explanatory comment in place (update only the parts made false by
    the `.value` indirection). Carry over AdvancedSettings' "Runs on BOTH branches (ok and not-ok)
    — callOrDeclare never throws" comment at the release sites, since that is the behaviour this
    task is actually buying.

    Scope fences: do NOT add an `eosOverlayUnavailable` state or any visible decline text (C5); do
    NOT touch `AdvancedSettings/index.tsx` (C2); do NOT edit
    `AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts`; do NOT add any npm dependency.

    Keep the diff Prettier-clean and warning-neutral: `pnpm lint` runs TWO zero-padded ceilings
    (`SRC_CEILING = 1124`, `TESTS_CEILING = 638`, `meta/lintScoped.cjs`) with no headroom. Any new
    ESLint warning — including one from the new test file — turns it RED. Do not raise a ceiling
    to reach green; fix the code.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runInBand src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts src/frontend/helpers/__tests__/DeferredChannelCallSiteGuard.test.ts src/frontend/helpers/__tests__/declaredUnavailable.test.ts</automated>
    <automated>npx jest --selectProjects Meta --runInBand meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/genI18nGateScope.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>pnpm lint</automated>
  </verify>
  <done>All four targeted Frontend suites pass with a non-zero test count; both Meta gate suites pass; `tsc --noEmit` is clean; `pnpm lint` exits 0 against both unchanged ceilings; `git diff --stat` shows `AdvancedSettings/index.tsx` and `AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts` untouched.</done>
</task>

<task type="auto">
  <name>Task 3: Correct the source todo and move it to completed/</name>
  <files>.planning/todos/pending/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md, .planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md</files>
  <action>
    **Order matters (C6).** `git mv` the file from `pending/` to `completed/` FIRST, then edit it
    at its new path, then `git add`. `git mv` commits HEAD content and silently drops unstaged
    edits — measured twice on this repo, once undetected for 7 days.

    Corrections to make, all of them (the file currently ships four false claims and one
    unbuildable instruction):
    1. Title and body: "three EOS overlay call sites" -> **five**. Include the enumerated list
       from `<corrections_to_the_source_todo>` above, with the two sites the original never
       recorded (the second `enableEosOverlay` in the dialog Yes handler, and the `useEffect`
       `isEosOverlayEnabled` probe) called out as *newly found*, not silently folded in.
    2. Line numbers `225-241` / `228` / `231` / `237` -> the measured `231-281` span and the real
       per-site lines. Say explicitly that the original numbers were stale, so a future reader
       does not trust a rendered line number again.
    3. `D-08` -> `D-03`, naming the exported `DEFERRAL_D03` as the constant in use.
    4. Replace the "Discharge condition" section. Record that the original instruction — update
       `EosDeclineCallSiteGuard.test.ts`'s anchor to a cross-file total — was **unbuildable**
       (that guard is hard-bound to AdvancedSettings via
       `componentPath = join(__dirname, '..', 'index.tsx')`, and 5 of its 6 assertions are
       AdvancedSettings-specific), and that it was discharged instead by a separately-named
       sibling guard, `GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts`, with
       `EXPECTED_EOS_CALL_SITES = 11` left untouched.
    5. Add a short "What was actually shipped" section naming: the shared `EOS_FEATURE` export
       and the i18n-gate reason for it (C1), the whitespace-tolerant regex correction (C3), the
       spinner-release behaviour (C4), and the explicitly-declined scope (no `eosOverlayUnavailable`
       UI state in GameSubMenu, C5) so the decline is a recorded decision rather than a silent gap.
    6. Frontmatter: `status: pending` -> `status: completed`. Add `resolved: 2026-09-19` and
       `resolved_by: quick-260919-tms`. Leave `severity`/`platform`/`ready` in place unchanged —
       `.planning/todos/todo-frontmatter-gate.py` scopes to `pending/` only, so `completed/` is
       exempt, but removing them loses information for no benefit.

    Then verify the move actually carried the edits, by content and not by memory:
    `git diff --cached -- .planning/todos/completed/2026-08-25-*.md` must show the corrected body,
    and `git status --short` must show the `pending/` path deleted with nothing left behind.
  </action>
  <verify>
    <automated>test ! -f .planning/todos/pending/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md && grep -q 'status: completed' .planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md && grep -q 'D-03' .planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md && ! grep -q 'D-08' .planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md && echo TODO_CLOSED_OK</automated>
    <automated>pnpm planning-gates</automated>
  </verify>
  <done>`TODO_CLOSED_OK` prints; `pnpm planning-gates` reports all gates passing; the staged content at the `completed/` path contains the corrected body (verified via `git diff --cached`, not by re-reading the working tree alone).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar IPC | `window.api.<eosChannel>` crosses into the sidecar; under Tauri these 8 channels are unregistered (D-03) and always reject. |
| renderer -> `gamelib.log` | `callOrDeclare` writes a diagnostic line via `window.api.logError`; GameLib is a public fork whose developers paste log output. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tms-01 | Information disclosure | `callOrDeclare` log line | mitigate | Inherited, not re-implemented: `CallOrDeclareSpec` carries no `args` field on purpose (T-34.5-48-04), so the `appName` passed to `enable/disableEosOverlay(appName)` can never reach the log. This plan must NOT add an args/context field to the spec, and must NOT interpolate `appName` into any message. |
| T-tms-02 | Denial of service | `gamelib.log` | mitigate | Inherited: `declaredOnce` dedupes one line per channel per session, so a user repeatedly clicking the EOS toggle cannot flood the log. This plan adds no second logging path. |
| T-tms-03 | Repudiation | GameSubMenu EOS toggle | mitigate | This is the defect being closed: a rejection currently leaves zero evidence anywhere. Wrapping all 5 sites makes the decline durable and attributable to `D-03`. |
| T-tms-SC | Tampering | npm/pip/cargo installs | accept | **No package installs in this plan.** Both imports are intra-repo (`frontend/helpers/declaredUnavailable`); no `package.json` change. No legitimacy gate applies. |
</threat_model>

<verification>
Run in order, each as its own command. **Never pipe a build or test to `tail`** — it masks the
exit code, and this repo has three recorded wrong conclusions from exactly that habit.

1. `npx jest --selectProjects Frontend --runInBand src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts` — the new guard, GREEN, non-zero test count.
2. `npx jest --selectProjects Frontend --runInBand src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts src/frontend/helpers/__tests__/DeferredChannelCallSiteGuard.test.ts src/frontend/helpers/__tests__/declaredUnavailable.test.ts` — the three neighbouring guards, unchanged and still GREEN.
3. `npx jest --selectProjects Meta --runInBand meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/genI18nGateScope.test.ts` — the blocking hardcoded-string/i18n gate over the whole committed scope (GameSubMenu/index.tsx is in it), plus the scope-staleness ratchet.
4. `pnpm codecheck` — `tsc --noEmit`, exit 0. Note this **cannot see lint errors**; step 5 is not optional.
5. `pnpm lint` — both ceilings (`SRC_CEILING = 1124`, `TESTS_CEILING = 638`) and both file-count floors, exit 0. Neither ceiling may be edited.
6. `pnpm planning-gates` — all gates, for the todo move.
7. `npx jest --selectProjects Frontend --runInBand` — full Frontend project, to prove nothing else regressed.

Record the actual suite/test counts from steps 1, 2 and 7 in the summary. A count of zero is a
scope collapse masquerading as a pass, not a green run.

Not run here, and say so in the summary rather than implying coverage: the backend/common/preload
jest projects (untouched by this plan) and `pnpm test:ci` as a whole — the orchestrator re-runs
gates independently.
</verification>

<success_criteria>
- All 5 EOS `window.api.*` call sites in `GameSubMenu/index.tsx` are `callOrDeclare` `call:` thunks; the whitespace-tolerant scan still counts exactly 5 (none added, none deleted).
- Every `!result.ok` path that owns the spinner releases `eosOverlayRefresh`; the `useEffect` probe correctly does not touch it.
- `GameSubMenuEosDeclineCallSiteGuard.test.ts` exists with a captured pre-edit RED and a post-edit GREEN, and its self-test block includes the whitespace-tolerance case.
- `EOS_FEATURE` is exported from `declaredUnavailable.ts` and imported by GameSubMenu; no two-word string literal is declared inside any i18n-gate-scoped file.
- `AdvancedSettings/index.tsx` and its guard test are byte-unchanged; `EXPECTED_EOS_CALL_SITES` is still `11`.
- Steps 1-7 of `<verification>` all exit 0 with non-zero test counts where applicable; no lint ceiling, allowlist, or gate threshold was edited to reach green.
- The corrected todo lives at `.planning/todos/completed/` with `status: completed`, all four false claims fixed and the unbuildable discharge condition replaced.
</success_criteria>

<output>
Create `.planning/quick/260919-tms-wrap-gamesubmenu-s-5-eos-overlay-call-si/260919-tms-SUMMARY.md` when done.

The summary MUST contain, verbatim and not paraphrased:
- the pre-edit RED output of the new guard (Task 1),
- the post-edit GREEN suite/test counts for steps 1, 2 and 7,
- the `pnpm lint` line showing both scopes' warning counts against their unchanged ceilings,
- an explicit statement of what was NOT verified: nothing was exercised live (the EOS overlay menu
  item renders only under `isLinux && runner === 'legendary'`, and this is a macOS machine), so the
  spinner-release behaviour is proven structurally by the guard and by the `callOrDeclare` contract,
  not by a live click. Do not let a structural pass read as a live one.
</output>
