---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 06
subsystem: ui
tags: [notice, toast, ipc, zod, zustand, i18n, safety, frontend-message]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-02 assertAtOrAboveFloor census helper; 82-03 REMOVAL_REASONS closed set in src/common/types/safety.ts; 82-05 the fail-closed adapter whose first blocking item feeds the notice"
provides:
  - "removalRefusedNotice FrontendMessage: a closed-set z.strictObject (kind, outcome, reason, optional title/appName/runner/otherTitle) and its ipcDomainCensus pins"
  - "src/backend/safety/refusal.ts pushRemovalRefusal(deps, payload): one push, one log line naming the op, outcome and check, never throws"
  - "src/common/types/removalRefusal.ts: REMOVAL_REFUSAL_KINDS, REMOVAL_REFUSAL_OUTCOMES, RemovalRefusalPayload"
  - "preload slot handleRemovalRefusedNotice and the renderer store useRemovalRefusedNotice / handleRemovalRefusedNoticeSignal"
  - "RemovalRefusedNotice error toast in the bottom-right NoticeStack, with removalRefused.* en copy for every kind, reason and outcome"
affects: [82-07, 82-08, 82-09, 82-11]

actuals:
  tokens: 14300
  tasks: 2
  commits: 7
plan_head_before: 5b49949df002ff16a4f7781a5ef503d0407d4ab2
plan_head_after: 5aa82aac0cff393ce1a3efdd09304c6dd962803c

tech-stack:
  added: []
  patterns:
    - "A backend-pushed notice that is a queue, not a singleton: each queued refusal is its own child component with its own phase state, and the store entry is removed only when its exit animation finishes"
    - "A push helper takes the log sink as an optional dep (default: the sidecar logger), so the log line is asserted with the repo capture util and no module is mocked"
    - "Honesty guard in the view: 'Nothing was deleted' is rendered only for outcome refused AND a reason other than delete-failed"

key-files:
  created:
    - src/common/types/removalRefusal.ts
    - src/backend/safety/refusal.ts
    - src/backend/safety/__tests__/refusal.test.ts
    - src/frontend/state/RemovalRefusedNotice.ts
    - src/frontend/state/__tests__/RemovalRefusedNotice.test.ts
    - src/frontend/components/UI/RemovalRefusedNotice/index.tsx
    - src/frontend/components/UI/RemovalRefusedNotice/index.scss
    - src/frontend/components/UI/RemovalRefusedNotice/__tests__/RemovalRefusedNotice.test.tsx
  modified:
    - src/common/types/ipc/appShell.ts
    - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/appShell.test.ts
    - src/preload/api/settings.ts
    - src/frontend/state/initStateSubscriptions.ts
    - src/frontend/state/__tests__/initStateSubscriptions.test.ts
    - src/frontend/components/UI/NoticeStack/index.tsx
    - src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx
    - src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts
    - src/frontend/dev/noticePreview.ts
    - src/frontend/dev/__tests__/noticePreview.test.ts
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts
    - public/locales/en/gamelib.json

key-decisions:
  - "No auto-hide and no countdown hairline: a refusal either says nothing was deleted or that files may be partly gone, and the user must acknowledge which (as ThemeSaveFailedNotice and ReadOnlyStoresNotice do)"
  - "The renderer queue is capped at the newest five notices; the oldest is dropped, since the newest refusals are the ones still actionable"
  - "Error colour is the leading stripe only (var(--status-danger), compound selector so it outranks the region sheet); the icon keeps the shared accent because noticeStackStylesheetGate forbids a notice restyling the icon, and the sketch's token table has the icon as accent"
  - "delete-failed can never be paired with 'Nothing was deleted', even if a caller marks it refused (T-82-19, enforced in the view and tested)"
  - "Unknown game or other-game titles use separate sentences ('Another game is installed inside this folder.') rather than an interpolated fallback that would start a sentence in lower case"

patterns-established:
  - "Notice payloads carry display titles but never a path or raw error text; the log line carries neither title nor path"

requirements-completed: [FND-02]

coverage:
  - id: D1
    description: "A refusal pushed from the backend reaches the renderer and shows as an error toast in the bottom-right stack, naming the game, the failed check and (outcome refused) that nothing was deleted"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/RemovalRefusedNotice/__tests__/RemovalRefusedNotice.test.tsx; src/backend/safety/__tests__/refusal.test.ts; src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "The channel is closed-set end to end: strict IPC schema, renderer filter drops out-of-set kind/outcome/reason/runner, the ok reason and non-string fields; a smuggled path never reaches the store"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/ipcSchemas/appShell.test.ts; src/frontend/state/__tests__/RemovalRefusedNotice.test.ts; src/backend/sidecar/__tests__/ipcDomainCensus.test.ts; pnpm check:ipc-contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "A failed outcome, and the delete-failed reason on its own, never say nothing was deleted"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "RemovalRefusedNotice.test.tsx cases 'says nothing was deleted only for a refused outcome' and 'never says nothing was deleted for delete-failed, even if marked refused'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Copy goes through i18n: removalRefused.* keys extracted into public/locales/en/gamelib.json; every kind and reason group renders real copy, never a raw key"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "RemovalRefusedNotice.test.tsx 'covers every kind' and 'renders real copy for every non-ok reason'; pnpm i18n --fail-on-update"
        status: pass
    human_judgment: false
  - id: D5
    description: "The toast looks right live: error stripe in each theme, the stack with several queued refusals, dismiss and slot collapse"
    requirement: FND-02
    verification: []
    human_judgment: true
    rationale: "Not exercised in a running app. jsdom proves structure, copy and phase handling; the stripe colour and stacking need an eye on a real theme. window.__gamelibNotices.removal() (dev) queues a refused and a failed notice for it."

duration: 55min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 06: Removal-refusal notice Summary

**A guarded removal that is refused or fails now reaches the user: one closed-set `removalRefusedNotice` push from the backend, a queued renderer store, and an error toast in the existing bottom-right stack that names the game, the one check that stopped it, and whether anything was deleted.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-11-20T08:36Z
- **Tasks:** 2 (tracer, auto)
- **Files modified:** 23 (8 created, 15 modified)

## Accomplishments

- Contract: `removalRefusedNotice` is a `z.strictObject` over `REMOVAL_REFUSAL_KINDS`, `REMOVAL_REFUSAL_OUTCOMES` and `REMOVAL_REASONS`; schema tests reject an unknown reason, kind, outcome, runner and an extra key (a smuggled `path`). `ipcDomainCensus` moved total 294 -> 295 and owner-less 66 -> 67 in the same commit; the 284 floor is kept (measured margin now 11).
- Backend: `pushRemovalRefusal` sends the message and writes exactly `[safety] <kind> <outcome>: <reason>` (no path, no title); it never throws, so a notice that cannot be delivered cannot become a second failure inside a guard.
- Renderer: `useRemovalRefusedNotice` queue (newest five), `handleRemovalRefusedNoticeSignal` closed-set filter (also drops `ok`), preload slot `handleRemovalRefusedNotice`, wired in `initStateSubscriptions`.
- Toast: one child per queued refusal inside its own `renderNoticeSlot`, `useNoticePhaseFallback`, store-embed suppression while on screen, always-visible keyboard-reachable dismiss with an i18n aria-label, `role="alert"` on the text. The store entry goes only when the exit animation finishes. Registered in `AppNoticeStack` between the theme-save notice and the Humble prompt.
- Copy: a title per kind, a body per reason group (nested, inside, protected root, outside trust root, not a prefix, folder looks shared, delete failed, unconfirmed), an outcome sentence. 19 `removalRefused.*` keys extracted into `public/locales/en/gamelib.json`.

## Task Commits

1. **Task 1 (tracer): refusal from backend push to a rendered toast** - `89c7ebaaa` (feat)
2. **Task 2: translated copy for every kind/reason/outcome, i18n scope entries, dev preview** - `5aa82aac0` (feat)

Tracer gate: the Task 1 verify chain (jest over the seven named suites, `check:ipc-contract`, `codecheck`, `backend-di-ceilings`, prettier file-info and check) passed before Task 2 started; no `gate="blocking-human"` on the task. Tracer verified end-to-end, expanded.

`commits: 7` is the measured `rev-list` count over `plan_head_before..HEAD`; five of the seven (`38ade8ea5`, `bcae1c49a`, `d566c2770`, `2111cec0b`, `636a5df8a`) are other sessions' commits that landed on main in between. This plan's own commits are `89c7ebaaa` and `5aa82aac0`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Census total re-measured (plan said 296 -> 297)**
- **Found during:** Task 1
- **Issue:** the plan's pin numbers predate quick pp4 (-2); the live pin was 294.
- **Fix:** 294 -> 295 and owner-less 66 -> 67, with a dated comment in the test. The floor stays 284.
- **Commit:** `89c7ebaaa`

**2. [Rule 3 - Blocking] Stack gates required the stylesheet and gate-table entry in Task 1**
- **Issue:** `noticeStackStylesheetGate` fails a new `renderNoticeSlot` caller that is not in its `SLOTS` table, and the component imports `./index.scss`; both were planned for Task 2.
- **Fix:** `index.scss` and the `SLOTS` entry landed in the tracer commit so it stayed green. The full copy mapping also landed in the tracer (a superset of the plan's "default text for one case"); Task 2 then covered extraction, coverage tests and the rest.
- **Commit:** `89c7ebaaa`

**3. [Rule 1 - Bug] Icon colour cannot be --status-danger**
- **Issue:** the plan asked for an error stripe and icon colour; `noticeStackStylesheetGate` ("does not restyle shared parts") forbids a slot sheet restyling `.noticeStackIcon`, and the sketch token table has the icon as accent.
- **Fix:** stripe only, via `.noticeStackToast.removalRefusedNotice { border-inline-start-color: var(--status-danger) }` (compound so it outranks the region sheet, which loads after). `grep status-danger index.scss` is 1.
- **Commit:** `89c7ebaaa`

**4. [Rule 3 - Blocking] i18n scope artifacts and their pinned counts**
- **Issue:** the two new frontend files are fork-touched, so `i18nForkTouchedFiles.json` had to name them; the A-03 ratchet then required them in `i18nGateScope.json` (or declared debt), and `genI18nGateScope.test.ts` pins 315/437.
- **Fix:** hand-inserted both files in sorted position into both artifacts (scanned, not debt: the gate shows 0 violations on them), counts 315 -> 317 and 437 -> 439 in the test with a dated header comment, `generatedBy` clause appended. Not a `pnpm gen-i18n-gate-scope` run (precedent: phase 64 plan 09, quick pp4).
- **Files modified:** `meta/i18nGateScope.json`, `meta/__tests__/genI18nGateScope.test.ts`
- **Commit:** `5aa82aac0`

**5. [Rule 3 - Blocking] i18n hardcoded-string allowlist is count-pinned**
- **Issue:** the dev preview's three new game-title literals would grow the `noticePreview.ts` allowlist count (pinned at 1, "a decision, not a way to reach green").
- **Fix:** one shared `FIXTURE_TITLE` constant (still the single literal) used by every preview payload; the other-game name is derived from it. `noticePreview.test.ts` gained the `removal` key and two cases.
- **Commit:** `5aa82aac0`

**6. [Rule 3 - Blocking] knip: RemovalRefusalOutcome had no consumer**
- **Fix:** the component's `outcomeBody` now types its parameter with it.
- **Commit:** `5aa82aac0`

**7. [Rule 2 - Missing critical, informational] Defensive behaviour beyond the plan**
- `pushRemovalRefusal` swallows a failed push/log (never throws into a guard); the store caps the queue at five and rejects `runner` values outside the Runner set (`Record<Runner, true>` so a new runner fails tsc); the view refuses to say "Nothing was deleted" for `delete-failed` even if marked refused.

---

**Total deviations:** 6 auto-fixed (5 blocking, 1 bug), 1 informational
**Impact on plan:** none on scope or behaviour; three of the fixes are repo gates that the plan's file list did not anticipate.

## Issues Encountered

- `public/locales/en/gamelib.json` carried a foreign uncommitted key-order hunk (`contrastSummaryNone`, `saveFailed`/`saveTheme` reordered). `pnpm i18n` produces that ordering, so HEAD's catalog is not `pnpm i18n`-stable and `pnpm i18n --fail-on-update` only reads clean against the working tree. Task 2's commit staged HEAD's blob plus only the 27 `removalRefused` lines (0 deletions, confirmed with `git diff --cached`); the working-tree copy and the foreign hunk were left untouched.
- `keepRemoved: true` keeps a key after its call site goes; the interim `removalRefused.unknownOther` was removed from the catalog by hand before the commit.
- `hardcodedStringGate` and `genI18nGateScope` are slow (several minutes) and were run in the background.
- Known pre-existing reds (`moduleStateCensus`, `diPhaseGates` on `X86_NULL_OBJECT_VERSION_SET`) were not touched and do not involve this plan's files.

## Known Stubs

None. Nothing in this plan calls `pushRemovalRefusal` yet: the guard call sites that push refusals are plans 82-07 to 82-09. The notice is reachable now only through the dev preview (`window.__gamelibNotices.removal()`) and the tests.

## Threat Flags

None. The one new surface, the `removalRefusedNotice` FrontendMessage, is the one the plan's threat model covers (T-82-17 closed sets and no paths, T-82-18 strict schema plus renderer filter, T-82-19 outcome-honest copy), each backed by a test.

## Next Phase Readiness

- Guard sites in 82-07/08/09 call `pushRemovalRefusal({ sendFrontendMessage }, { kind, outcome, reason: firstBlockingItem(...).reason, title, otherTitle })`; `otherTitle` comes from `titleForKnownKey(item.otherKey)` (82-05). They pass `outcome: 'failed'` whenever a delete ran or its effect is unconfirmed.
- Carried from 82-03/82-05: the D-22 exec-bit rule over-refuses native Linux sideload folders with helper scripts; the `folder-looks-shared` copy already says "may be shared with other software".
- A live look at the toast (stripe per theme, several queued) is owed; see coverage D5.

## Self-Check: PASSED

All created files exist on disk; commits `89c7ebaaa` and `5aa82aac0` are ancestors of HEAD; the verification chain was re-run green: jest over refusal, store, component, stack, stylesheet gate, theme tokens, noticePreview, `ipcDomainCensus`, `ipcSchemas/appShell`, `initStateSubscriptions`, `genI18nGateScope` and `hardcodedStringGate`; `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm lint` (0 errors), `pnpm backend-di-ceilings`, `pnpm find-deadcode`, `pnpm boundaries`, `pnpm i18n --fail-on-update` (exit 0 on the working tree), prettier file-info and check over every prettier-covered path written. Acceptance greps: `removalRefusedNotice` in appShell.ts 1+, `toBe(295)` (re-measured) in the census test, `handleRemovalRefusedNotice` in settings.ts 1+, `RemovalRefusedNotice` in NoticeStack/index.tsx 2, `"removalRefused"` in gamelib.json 1, `status-danger` in the toast scss 1.

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*
