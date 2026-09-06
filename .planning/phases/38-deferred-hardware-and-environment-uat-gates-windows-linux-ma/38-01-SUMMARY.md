---
phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
plan: 01
subsystem: planning-infra
tags: [gsd-ledger, uat, audit-uat, yaml, docs-only]

# Dependency graph
requires:
  - phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
    provides: "38-E01..38-E04 (embed-backend UAT items minted by plan 40-10, D-04)"
  - phase: 34.13-steam-install-time-wine-bottle-form-gog-parity
    provides: "34.13-UAT.md's original 27 S/C-series items, most already relocated into Phase 38"
provides:
  - "Phase 38 narrowed from 34 to 17 open items — Windows-plus-controller only"
  - "Phase 42 (Deferred Linux-host UAT gates) created in ROADMAP.md with a 5-item ledger"
  - "Phase 43 (Off-macOS embed backend) created in ROADMAP.md with a 4-item ledger"
  - "9 Electron-runtime items retired as unscoreable, each naming its surviving Tauri twin"
  - "38-S16 split into a narrowed Windows-only item plus newly-minted 38-S17 (Linux)"
  - "Repaired 38-HUMAN-UAT.md sitting protocol: correct scope, correct Windows log path, the WKWebView-vs-WebView2 gamepad finding, a Recording protocol template, and a Blocking constraints section"
affects: [42-deferred-linux-host-uat-gates, 43-off-macos-embed-backend-webview2-and-webkit2gtk, 38-02, 38-03, 38-04, 38-05, 38-06, 38-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Whole-YAML-mapping relocation between VERIFICATION.md ledgers, never re-typed, to avoid the two documented silent failure modes of audit-uat's parser"
    - "Retirement via array move (human_verification -> human_verification_discharged) plus result:/retired_reason: fields, never an in-place annotation"
    - "Two-way relocation receipts (human_verification_relocated) so an origin phase's record cannot rot silently"

key-files:
  created:
    - .planning/phases/42-deferred-linux-host-uat-gates/42-VERIFICATION.md
    - .planning/phases/43-off-macos-embed-backend-webview2-and-webkit2gtk/43-VERIFICATION.md
  modified:
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
    - .planning/ROADMAP.md

key-decisions:
  - "Resolved the human_verification_relocated entry count at 9 (8 relocated + 1 minted-by-split), not the plan's internally-inconsistent 'nine ... tenth' (10) phrasing, because 9 is the only count that reconciles against the actual item disposition table (4 to Phase 42 + 4 to Phase 43 + 1 minted = 9)."
  - "Used a raw-text (non-YAML-round-trip) Node script to move whole item mappings between files, to guarantee zero reformatting of untouched entries — verified byte-identical (modulo incidental inter-item blank-line normalization) against a pre-edit backup for all 16 untouched Phase 38 items."
  - "Treated the plan's own Task-1 verify script's Parked-heading indexOf check as a false negative (it matches earlier inline backtick mentions of the heading string in unrelated prose, not the actual '## Parked / Superseded Phases' heading) and confirmed placement correctness with a line-anchored regex instead."

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-09-06
---

# Phase 38 Plan 01: Ledger repair and three-way phase split Summary

**Retired 9 dead Electron-runtime UAT items as unscoreable, relocated 9 more into two newly-created phases (42 Linux-host, 43 embed-backend), split one compound item, and repaired the sitting protocol — all measured at `gsd-sdk query audit-uat` (34/59 before, 17/5/4/51 after), not merely asserted.**

## Performance

- **Duration:** ~25 min (start time not separately captured this session; measured from first commit 14:38:34 NZST to last commit 14:52:49 NZST, plus preceding read/investigation time)
- **Completed:** 2026-09-06T14:52:49+12:00
- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Created Phase 42 (Deferred Linux-host UAT gates) and Phase 43 (Off-macOS embed backend) in both `.planning/ROADMAP.md` and on disk, **before** anything was relocated into them (relocation rule 1 / D-38-10) — verified both stayed audit-invisible (no phantom-item body-scrape) while their arrays were still empty.
- Retired 9 Electron-runtime items (`38-C07`, `38-S01`, `38-S03`, `38-S05`, `38-S07`, `38-S09`, `38-S11`, `38-S13`, `38-S15`) into `human_verification_discharged` with `result: unscoreable` and a `retired_reason` naming Phase 35's Electron-build removal and each item's surviving Tauri twin — never recorded as a pass, never deleted.
- Relocated 4 items to Phase 42 (`38-W05`, `38-S04`, `38-S10`, `38-S12`) and 4 to Phase 43 (`38-E01`..`38-E04`), each carrying a new `relocation_history` field and a matching outgoing receipt in `38-VERIFICATION.md`'s new `human_verification_relocated` frontmatter key.
- Split `38-S16` (D-38-11): narrowed in place to the Windows row-5 branch only, and minted `38-S17` (Linux row-7 half) into Phase 42 with a grep-able `platform_gate`.
- Repaired `38-HUMAN-UAT.md`'s four stale defects (header count, scope enumeration, the false "runs on macOS" controller claim, the macOS-vs-Windows log path) and added a Recording protocol section, a Blocking constraints section, a DevTools re-test note, and an Out-of-scope section.
- Corrected `.planning/ROADMAP.md` section Phase 38's item count and its false "without leaving the desk" depends-on claim, while deliberately preserving the historical count strings as marked history.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Phase 42 and Phase 43 before any item is relocated** - `b3e9795f3` (docs)
2. **Task 2: Retire the 9 Electron items, relocate the 9 off-Windows items, split 38-S16** - `e7ee813e9` (docs)
3. **Task 3: Repair 38-HUMAN-UAT.md and correct ROADMAP section Phase 38** - `98bea539e` (docs)

**Plan metadata commit:** pending (this SUMMARY + STATE/ROADMAP/REQUIREMENTS update, per the executor's final-commit step)

## Files Created/Modified

- `.planning/phases/42-deferred-linux-host-uat-gates/42-VERIFICATION.md` - New collection-phase ledger, 5 items (4 relocated + 1 minted `38-S17`)
- `.planning/phases/43-off-macos-embed-backend-webview2-and-webkit2gtk/43-VERIFICATION.md` - New implementation-phase ledger, 4 relocated items (`38-E01`..`38-E04`)
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md` - 9 items retired to `human_verification_discharged`, 8 items relocated out, `38-S16` narrowed, `38-S17` split off, new `human_verification_relocated` receipt block, `score:` updated
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md` - Sitting protocol repaired: correct 17-item scope, correct Windows log path, WKWebView-vs-WebView2 finding, Recording protocol + Blocking constraints + Out-of-scope sections
- `.planning/ROADMAP.md` - Phase 42 and Phase 43 sections + overview bullets added; Phase 38's item count and depends-on paragraph corrected

## Measured Gate (D-38-03, D-38-07, arithmetic_discrepancy)

**Before** (captured bare, `gsd-sdk query audit-uat`, before any edit):

```json
{
  "total_files": 8,
  "total_items": 59,
  "by_category": { "pending": 2, "human_uat": 57 },
  "by_phase": { "27": 2, "30": 2, "32": 2, "33": 3, "34": 2, "35": 7, "38": 34, "34.13": 7 }
}
```

**After** (captured bare, after Task 2's edits landed; re-confirmed unperturbed after Task 3):

```json
{
  "total_files": 10,
  "total_items": 51,
  "by_category": { "pending": 2, "human_uat": 49 },
  "by_phase": { "27": 2, "30": 2, "32": 2, "33": 3, "34": 2, "35": 7, "38": 17, "42": 5, "43": 4, "34.13": 7 }
}
```

**Reconciliation:** 9 retired (leave the open set), 1 minted (`38-S17`, enters it): **net −8** on the all-phase total (59 → 51). Every other phase's `by_phase` count is unchanged from the before-state, confirming no item was silently dropped anywhere else in the ledger set.

**CONTEXT.md's "falls by exactly 9" phrasing does not reconcile with its own item table**, exactly as the plan's `arithmetic_discrepancy` block warned it might not. The table (17 + 5 + 4 + 9 = 35 = 34 original + 1 minted) is the one that reconciles; the "exactly 9" prose does not account for `38-S17`'s entry into the open set. Resolved in favor of the table, per the plan's own instruction.

**D-38-03 twin re-check (live, not trusted from CONTEXT.md's prose):** grepped `38-VERIFICATION.md` for each of the 9 Tauri twin ids before Task 2's edits — `38-C08`, `38-S02`, `38-S04`, `38-S06`, `38-S08`, `38-S10`, `38-S12`, `38-S14`, `38-S16` — and confirmed all 9 present as live `- id:` entries in `human_verification` (lines 333, 369, 395, 421, 447, 473, 499, 528, 559 respectively), positioned before `human_verification_discharged: []` (line 651). **9 of 9 confirmed live**, none already discharged. No twin's observation is lost by this plan's retirements.

## Decisions Made

- **`human_verification_relocated` entry count resolved at 9, not the plan's stated "nine ... tenth" (10).** Task 2's action text says "nine entries, one per relocated item... Add a tenth entry for 38-S17" and the acceptance criteria separately says "exactly 10 entries; 4 ... 4 ... 1" (which itself sums to 9, not 10). Neither phrasing reconciles against the actual item set: 4 relocated to Phase 42 + 4 relocated to Phase 43 + 1 minted-by-split for `38-S17` = 9 receipts total. Wrote 9. Neither of the plan's two automated `<verify>` node scripts for Task 2 checks this specific count (confirmed by reading both scripts before writing the receipts), so this is a documentation-accuracy resolution with no gate impact — handled the same way the plan itself instructs resolving CONTEXT.md's "falls by exactly 9" inconsistency: trust the reconciling arithmetic over the prose.
- **Task 1's own Parked-heading verify script has a false-negative bug**, not a defect in this plan's output. `r.indexOf('## Parked / Superseded Phases')` matches the FIRST literal occurrence of that string anywhere in the file — including three unrelated inline backtick mentions in prose at lines 59, 920 and 921, all of which sit before the real `### Phase 43` heading at line ~5196. Re-verified placement correctness with a line-anchored regex (`/^## Parked \/ Superseded Phases/m`), which confirmed both `### Phase 42` (index 551056) and `### Phase 43` (index 552860) genuinely precede the real heading (index 554703). Documented here rather than silently working around it, per the standing instruction to record when a plan's own gate is unreliable.
- **Moved YAML via raw string slicing, not a YAML parse/reserialize round-trip**, specifically to satisfy the plan's "do not reformat... a whole-file rewrite is exactly how an item gets silently dropped" instruction. Verified all 16 untouched Phase 38 items are byte-identical to the pre-edit backup, with the sole exception of incidental inter-item blank-line spacing (the original file was already inconsistent about whether a blank line separated adjacent items; the transformation normalized this to a single line break between every entry). No field content, wording, or indentation of any untouched entry changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a self-introduced score-line duplication bug before it reached a commit**
- **Found during:** Task 2, first script run
- **Issue:** The transformation script's new `score:` line text for `38-VERIFICATION.md` accidentally included a second literal `"score: "` prefix inside the replacement string, producing `score: score: N/A ...` in the written file.
- **Fix:** Caught by inspecting the diff against the pre-edit backup before committing; corrected the script, restored all three files from backup, and re-ran the full transformation cleanly.
- **Files affected:** `38-VERIFICATION.md` (never committed in the broken state)
- **Verification:** Post-fix `grep -n '^score:'` shows a single well-formed line; re-ran both of Task 2's automated verify scripts (structure gate + measured gate), both PASS.

---

**Total deviations:** 1 auto-fixed (1 bug, caught pre-commit, zero downstream impact) plus 2 documented plan-inconsistency resolutions (see Decisions Made above — no code/doc defect resulted, both are the plan's own text disagreeing with itself or with the file it inspects).
**Impact on plan:** None of the three findings above changed the deliverable's substance. The score-line bug never reached a commit. Both plan-text inconsistencies were resolved in favor of the option that reconciles against measured/actual state, matching the plan's own stated policy for exactly this situation (CONTEXT.md's arithmetic).

## Issues Encountered

- **CRLF line endings in `38-VERIFICATION.md` vs LF in the newly-created `42-/43-VERIFICATION.md` files** required care in the transformation script (marker searches, regex anchors) to avoid silently matching zero or the wrong occurrence. Resolved by explicitly testing marker/occurrence counts before every string replacement rather than assuming success.
- **`node -e` via `execFileSync('gsd-sdk.cmd', ...)` failed with `EINVAL` on this Windows/Git-Bash/Node combination.** Worked around by invoking `gsd-sdk query audit-uat` directly via the Bash tool and redirecting to a scratch file, then reading that file from Node — this is also the pattern the plan itself mandates (never trust a piped exit code; capture output to a file first).

## User Setup Required

None - no external service configuration required. This plan is docs-only.

## Next Phase Readiness

- Plan `38-02` (two-way relocation receipts and retirement outcomes at origin phases 34.13, 35 and 40) can proceed — `38-VERIFICATION.md`'s `human_verification_relocated` block and the 9 retired items' `retired_reason` fields give it everything it needs to write the matching origin-side receipts.
- Plans `38-03` through `38-07` (the actual Windows hardware sitting, `autonomous: false`) can proceed against a ledger that now accurately describes 17 Windows-plus-controller items, with `38-HUMAN-UAT.md` naming the correct log path and scope.
- Phase 42 and Phase 43 exist and are ready to receive their own planning (`/gsd-plan-phase 42`, `/gsd-plan-phase 43`) whenever a Linux host sitting or the embed-backend implementation work is scheduled — neither is blocked by anything in this plan.
- No blockers. `gsd-sdk query audit-uat` confirms the ledger is internally consistent at 17/5/4/51 as of this plan's completion.

---
*Phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma*
*Completed: 2026-09-06*

## Self-Check: PASSED

- FOUND: `.planning/phases/42-deferred-linux-host-uat-gates/42-VERIFICATION.md`
- FOUND: `.planning/phases/43-off-macos-embed-backend-webview2-and-webkit2gtk/43-VERIFICATION.md`
- FOUND: `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`
- FOUND: `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md`
- FOUND: `.planning/ROADMAP.md`
- FOUND commit: `b3e9795f3` (Task 1)
- FOUND commit: `e7ee813e9` (Task 2)
- FOUND commit: `98bea539e` (Task 3)

No missing items.
