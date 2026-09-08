---
phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
plan: 05
subsystem: ui
tags: [react, jest, i18n, humble, key-type-table]

requires:
  - phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
    plan: 01
    provides: "common/humble/keyTypePresentation.ts (HUMBLE_REDEEM_HELP_URL, getKeyTypePresentation, getRedeemTarget)"
  - phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
    plan: 04
    provides: "precedent for the table's second frontend consumer (HumbleKeyRow), same locale-fill discipline"
provides:
  - "HumbleClaimWizard's activation button resolves through the key_type table's three-way partition (steam / deep-link / help) instead of a two-way Steam-vs-static-help fork"
  - "GOG keys open https://www.gog.com/redeem/<urlencoded code> with an 'Open GOG' label"
  - "Every platform with no evidenced deep link (uplay, unrecognised, etc.) opens the static help URL with the code dropped, labelled with the table's proper display name instead of the raw key_type token"
affects: [humble-claim-wizard]

tech-stack:
  added: []
  patterns:
    - "getRedeemTarget/getKeyTypePresentation as the single resolution point for a redeem action; the wizard builds zero URLs itself (0 encodeURIComponent occurrences remain in the file)"
    - "const _exhaustive: never guard over a 3-member ActivationKind union, no default: clause, mirroring 42-04's resolvePlatformDisplay/resolveStoreLogo pattern"

key-files:
  created: []
  modified:
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
    - public/locales/en/gamelib.json (+ all 48 other locale gamelib.json files)

key-decisions:
  - "isSteam (declared at index.tsx:81) is reused, not removed, inside the new redeem-action resolver — it is exactly what the plan specified to keep Steam's label/URL byte-identical to today; its four other pre-existing consumers (:89, :116, :422, :590) were left untouched, confirmed by diffing the file against the pre-plan baseline (only 2 diff hunks total: the header comment, and the replaced fork)"
  - "NON_STEAM_REDEEM_HELP_URL local constant removed entirely; HUMBLE_REDEEM_HELP_URL (defined once, in common/humble/keyTypePresentation) is now the only definition of the fallback URL in the repo, confirmed by a zero-result grep"

requirements-completed: [REQ-42-03]

duration: "unknown for the full plan -- see Continuation Agent Disclosure below. The two task commits (test-only RED, then GREEN) are 9m22s apart: 19:37:12 -> 19:46:34, 2026-09-08 (both +1200)."
completed: 2026-09-08
---

# Phase 42 Plan 05: HumbleClaimWizard Table-Driven Redeem Action Summary

**Replaced `HumbleClaimWizard`'s Steam-vs-static-help two-way redeem fork with the key_type table's three-way resolution: GOG now opens the operator-verified `https://www.gog.com/redeem/<code>` deep link, Steam is byte-identical to today, and everything else keeps the static help URL labelled with a proper display name instead of the raw `key_type` token.**

## Continuation Agent Disclosure — read this first

**This SUMMARY was NOT written by the executor that implemented the plan.** The original executor
completed and committed both tasks (`1ebe14115` test, `2a1c942fd` feat), then died on a 502 API
error at the moment it was about to write this SUMMARY. Its transcript and its own verification
records (RED output capture, task-by-task notes, timing) are lost — they never existed in any
artifact I have access to.

I am a fresh continuation agent spawned afterward. **Every verification claim in this document is
one I performed myself, in this session, against the already-committed code** — not a
transcription of the dead agent's claims. Where I could not reproduce a claim independently, I say
so explicitly rather than asserting it.

Concretely, what I did NOT do: I did not implement anything. The working tree was clean and both
commits already existed when I started. My job was solely to re-verify and to write this file.

## What I independently re-verified

### RED — reproven, not just trusted

The plan's Task 1 commit (`1ebe14115`) is test-file-only. To reprove RED myself (not just read the
commit message's claim), I created a detached git worktree at that exact commit — leaving the main
working tree untouched — and ran the Frontend jest project's `HumbleClaimWizard` suite against it.
At that commit the test file already contains the four new/rewritten cases, but the implementation
file is still byte-identical to the pre-plan baseline (`dd175aff7`, since commit `1ebe14115` touches
only the test file). Result:

```
Test Suites: 1 failed, 157 passed, 158 total
Tests:       4 failed, 2380 passed, 2384 total
```

All four failures were the right ones, for the right reason:
- `opens the GOG deep link ... (HCLAIM-05, D-42-03)` — expected `"Open GOG"`, received `"Redeem on gog"`.
- `urlencodes the revealed code in the GOG deep link (D-42-03)` — expected the GOG URL, received the
  static help URL (no GOG branch existed yet).
- `shows "Redeem on Ubisoft Connect" ... for an uplay key (HCLAIM-05, D-42-03)` — expected
  `"Redeem on Ubisoft Connect"`, received the raw-token `"Redeem on uplay"`.
- `shows "Redeem on Other" for an unrecognised platform ... (HCLAIM-05, D-42-03)` — expected
  `"Redeem on Other"`, received the raw-token `"Redeem on wibble"`.

No other suite in the whole Frontend project regressed at that commit (157/158 suites still green),
and the Steam URL pin did not fail — consistent with the plan's "the Steam pin must still pass
untouched" requirement even at the RED checkpoint. The scratch worktree was removed afterward; the
main working tree and `git status` were verified unaffected before and after.

**This is a genuine independent reproof of RED**, not a repetition of the dead agent's claim — I
generated this failing run myself, in this session, from the committed test file and the pre-plan
implementation.

### GREEN — reproven at HEAD

- `npx tsc --noEmit` — exit 0, clean.
- `npx jest --selectProjects Frontend Meta` — **196 suites, 3423 passed, 1 skipped, 1 FAILED.** The
  single failure is `genI18nGateScope > A-17 ANTI-ROT`, reproduced by me at HEAD; it is
  orchestrator-owned scope drift from plan 42-04 (the `svgReactStub.tsx` file it added is not yet in
  `meta/i18nForkTouchedFiles.json`), not caused by this plan. I did not touch `meta/i18nGateScope.json`,
  `meta/i18nForkTouchedFiles.json`, `meta/__tests__/genI18nGateScope.test.ts`, or run
  `pnpm gen-i18n-gate-scope`, per the explicit prohibition in my instructions.
- `HumbleClaimWizard`'s own suite: **17/17 passing**, verified by name (see below).
- `npx eslint` scoped to the two touched source files: **0 problems.**
- `npx prettier --check` on the two touched source files + `public/locales/en/gamelib.json`: **all
  three pass.**
- `pnpm lint-translations:gamelib` — `0 findings, 0 hard failures`.
- `pnpm i18n-churn-guard` — `clean -- no upstream public/locales/ catalog changed.`
- `npx i18next --silent --fail-on-update` — exit 0; `[en] gamelib` reports `Added keys: 0, Restored
  keys: 0`; `git status --short public/locales` was empty both before and after running it — the new
  key was already correctly hand-authored across every locale, no drift.
- `pnpm lint` (full repo) exits 1 at 4236 warnings against the 4157 ratchet — confirmed
  **pre-existing and unrelated**: the scoped eslint run above (0 problems on the two touched files)
  proves this plan added zero net-new warnings.

### The four pre-existing tests the plan required to remain untouched — verified byte-identical, not just "still passing"

Passing is necessary but not sufficient — a rewritten assertion that happens to still pass would
satisfy "still green" while violating the plan's "MUST NOT CHANGE" instruction. I instead diffed
each cited block's actual text between the pre-plan baseline (`dd175aff7`) and `HEAD`, extracted by
content marker (not line number, since line numbers shifted from the new tests inserted above them):

| Test | Baseline vs HEAD |
|---|---|
| `it.each([['gog'], ['steam']])(...)` — "does not call humbleRevealKey on the initial %s claim-mode render" | **byte-identical** |
| Steam URL pin — `registerkey?key=ABCD-1234` block, "falls back to the manual key hand-off when Steam declines the redeem" | **byte-identical** |
| `WR-05: a rejected humbleMarkRedeemed stays on the key step ...` (gog fixture) | **byte-identical** |
| `marks a revealed key as redeemed and calls onDone (HCLAIM-04)` (gog fixture) | **byte-identical** |

All four pass in the HEAD run (confirmed by name in the verbose jest output). The plan's own `isSteam`
scope boundary was also verified structurally: `git diff dd175aff7 HEAD -- index.tsx` produces exactly
2 hunks (the header import/comment block, and the replaced redeem-action fork at the file's tail) — so
`isSteam`'s declaration (`:81`) and its four other pre-existing consumers (`:89`, `:116`, `:422`,
`:590`) are provably untouched, not merely "probably fine." The sixth `isSteam` reference at `:675` is
new code from this plan's own resolver (`activationKind`), exactly as the plan's Task 2 instructions
specify ("Steam ... keep `t('humbleKeys.openSteam', ...)` EXACTLY as today").

### i18n — counted, not sampled

- `humbleKeys.openStore` present in **all 49** locale `gamelib.json` files (`en`: `"Open {{store}}"`),
  verified by iterating every file in `public/locales/` and reading the key with `python3 -c
  json.load`. Every non-`en` locale carries a translated value containing the `{{store}}`
  interpolation token.
- `git diff --quiet dd175aff7 HEAD -- public/locales/en/translation.json` — passes; the upstream-owned
  catalog is untouched.
- `grep NON_STEAM_REDEEM_HELP_URL src/` — zero matches; the constant was fully removed, not left as
  dead code.
- `grep -c encodeURIComponent HumbleClaimWizard/index.tsx` — `0`; all URL construction, including
  encoding, now lives solely inside `common/humble/keyTypePresentation`'s `getRedeemTarget`.

### The `:13-17` (baseline numbering) rationale comment, before/after

**Before** (`dd175aff7`):
```ts
// D-68/T-14-09: a single, static, generic redemption-help destination for
// EVERY non-Steam platform. No authoritative Humble key_type -> URL table
// exists (RESEARCH Open Q3) — fabricating a per-platform deep-link risks
// sending the user's real secret to a wrong/broken page. Never interpolate
// any per-key value into this string.
const NON_STEAM_REDEEM_HELP_URL = 'https://support.humblebundle.com/hc/en-us'
```

**After** (`HEAD`):
```ts
// D-68/T-14-09, revised by D-42-03 (Phase 42): the static, generic
// redemption-help destination for every platform with NO evidenced
// deep-link URL — origin/origin_keyless/uplay/battlenet/nintendo_direct/
// epic/epic_keyless/generic and anything unrecognised. Steam and GOG are
// the only two evidenced deep links and they are resolved by
// common/humble/keyTypePresentation's getRedeemTarget, which also
// guarantees the key value is DROPPED on this branch. Fabricating a
// per-platform deep-link would risk sending the user's real secret to a
// wrong/broken page — never interpolate any per-key value into this URL.
// This file no longer defines (or needs to import) the fallback URL
// itself — `getRedeemTarget` returns it as `redeemTarget.url` on its
// 'help' branch, so `HUMBLE_REDEEM_HELP_URL` has exactly one definition
// in the repo, inside the table.
```

Corrected in place (the "No authoritative table exists" clause, now false, was revised) rather than
deleted wholesale, per the plan's explicit instruction.

## Task Commits (both pre-existing, verified present)

1. **Task 1 (RED):** `1ebe14115` `test(42-05): RED — pin GOG deep link, uplay/unknown help
   fallback for HumbleClaimWizard` — test-file-only, rewrites the old gog-fixture generic-help test
   into four cases (GOG deep-link + its urlencoding, uplay routed to help with no code leak,
   unrecognised platform pinned the same way).
2. **Task 2 (GREEN):** `2a1c942fd` `feat(42-05): resolve HumbleClaimWizard's redeem action through
   the key_type table` — replaces the fork with the table-driven resolver, corrects the rationale
   comment, adds `humbleKeys.openStore` to all 49 locales.

Both commits verified present in `git log --oneline --all` and their diffs re-inspected directly
(`git show <hash>`, `git diff dd175aff7 HEAD`) as part of this re-verification, not assumed from
their commit messages alone.

## Threat Model — re-checked, not re-derived

The plan's `<threat_model>` (T-42-17 through T-42-21, T-42-SC) is fully addressed by the landed
code: `getRedeemTarget` is the sole URL resolver (T-42-17/T-42-18/T-42-19), no logging was added
(T-42-20), the unknown branch renders the neutral `'Other'` label sourced only from the table
(T-42-21), and no package-manager install occurred (T-42-SC). No new trust boundary, endpoint, or
schema surface was introduced beyond what the plan's own threat model already covers — no
`## Threat Flags` section needed.

## Known Stubs

None. Every `ActivationKind` branch (`steam` / `deep-link` / `help`) renders real, non-placeholder
content; the `'unknown'` presentation branch's "Other" label is the same intentional neutral
fallback established in plan 42-04, reused here rather than duplicated.

## User Setup Required

None — no external service configuration required.

## Deviations from Plan

None. Both commits match the plan's Task 1 and Task 2 instructions exactly, verified by direct diff
inspection rather than by trusting the commit messages. No Rule 1-4 auto-fixes were needed during
this re-verification pass because no implementation work occurred in this session — only
verification.

## Next Phase Readiness

- `HumbleClaimWizard` is now the second frontend consumer of `common/humble/keyTypePresentation.ts`
  (after `HumbleKeyRow` in plan 42-04), and the last of the three ad-hoc `key_type` interpretation
  sites CONTEXT.md's scope item 3 targeted is now closed.
- The pre-existing `genI18nGateScope > A-17 ANTI-ROT` failure (orchestrator-owned, from plan 42-04's
  `svgReactStub.tsx`) is still outstanding at HEAD after this plan — not introduced or worsened by
  this plan, and explicitly out of scope for this executor to fix.
- No blockers for subsequent Phase 42 plans.

## Self-Check: PASSED

- `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx` — FOUND
- `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx` — FOUND
- `public/locales/en/gamelib.json` — FOUND, contains `humbleKeys.openStore`
- `src/common/humble/keyTypePresentation.ts` — FOUND (plan 42-01 dependency)
- Commit `1ebe14115adbdef04c76bf3c8a624b64b714b6bb` — FOUND in `git log --oneline --all`
- Commit `2a1c942fda6fd98f83164e58817c8847ccdf8293` — FOUND in `git log --oneline --all`

---
*Phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin*
*Completed: 2026-09-08*
*SUMMARY written by a continuation agent after the original executor stalled on a 502 error before writing it. See "Continuation Agent Disclosure" above.*
