---
phase: 260928-tjj
plan: 01
subsystem: auth/webview
tags: [rust, tauri, comment-only, humble, gog, amazon, epic, cookie-clear]

# Dependency graph
requires: []
provides:
  - "Single, platform-explicit, symbol-cited caller-routing statement for BOTH `humble_login_clear_cookies` and the sibling `humble_login_cookies_for_domain` census arm in `src-tauri/src/main.rs` -- replacing three contradictory copies of the same stale sentence across two arms"
  - "`.planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md` -- closed, `result: pass`, recording the two corrections the re-audit made to the todo's own table"
affects: [humble-login, cookie-clear, gog-logout, amazon-logout, epic-logout]

# Actuals (#2632)
actuals:
  tokens: 1720
  tasks: 2
  commits: 3
plan_head_before: 02e0ed0f1f164f75dd471fc8240e071395172785

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single caller-routing statement, cited by symbol never by line number, cross-referenced from a sibling arm rather than duplicated -- the pattern this task exists to establish so the next drift is structurally harder"

key-files:
  created:
    - .planning/quick/260928-tjj-correct-the-stale-caller-routing-comment/BASE.sha
  modified:
    - src-tauri/src/main.rs
    - .planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md

key-decisions:
  - "Fixed both stale copies of the sentence, not just the one the todo named -- planning measurement (10) found the identical contradiction duplicated ~700 lines below in the sibling `humble_login_cookies_for_domain` census arm; fixing only the named one would have recreated the exact drift this task exists to end"
  - "The task brief's own non-macOS assumption was measured FALSE and not written into the comment -- GOG and Amazon never reach this arm off macOS (early return in their JS helpers) and Epic opens a real window there instead of falling through to the sentinel-label no-window path"
  - "Extended the existing Phase 40 (D-15) note to carry the whole caller-routing statement rather than writing a new comment block, per the todo's own Solution section: one statement, not two that can drift apart again"
  - "Census arm does not duplicate the statement -- it gets a one-line pointer back to the clear arm's note plus its own arm-specific fact (reached via `seam.cookiesForDomain`, reuses the same `label` binding), matching the idiom the file already used for its mechanism cross-reference"

patterns-established: []

requirements-completed:
  - QUICK-260928-tjj

coverage:
  - id: D1
    description: "Stale sentence ('Every other caller...routed through a live Tauri-managed window') removed file-wide -- both copies, not just the one the todo named"
    requirement: "QUICK-260928-tjj"
    verification:
      - kind: other
        ref: "grep -c 'routed through a live Tauri-managed window' src-tauri/src/main.rs -> 0 (was 2 before the edit)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Clear arm's extended Phase 40 note names all four callers by symbol, all three sentinel-label constants, both Rust domain matchers, and an explicit Windows/Linux platform split"
    requirement: "QUICK-260928-tjj"
    verification:
      - kind: other
        ref: "sed -n over the arm region grep-checked for clearGogCookiesForLogout, clearAmazonCookiesForLogout, EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL, store_logout_cookie_domain_matches, epic_cookie_domain_matches, Windows/Linux -- all present"
        status: pass
    human_judgment: false
  - id: D3
    description: "Census arm points at the clear arm's statement instead of duplicating it, and names its own arm-specific fact (seam.cookiesForDomain)"
    requirement: "QUICK-260928-tjj"
    verification:
      - kind: other
        ref: "sed -n over the census-arm region grep-checked for 'seam.cookiesForDomain' and 'humble_login_clear_cookies' -- both present"
        status: pass
    human_judgment: false
  - id: D4
    description: "Comment-only: zero executable Rust lines changed, measured against BASE.sha not a rangeless git diff"
    requirement: "QUICK-260928-tjj"
    verification:
      - kind: other
        ref: "git diff -U0 <BASE.sha> -- src-tauri/src/main.rs, every +/- line's non-`//`-prefixed count == 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Rust suite still green at the recorded pre-edit baseline, including the two comment-sensitive pins that scan this arm"
    requirement: "QUICK-260928-tjj"
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell: test result: ok. 289 passed; 0 failed; 2 ignored"
        status: pass
    human_judgment: false
  - id: D6
    description: "Source todo closed: moved to completed/, result: opens with bare status word pass, records the audit's two corrections"
    requirement: "QUICK-260928-tjj"
    verification:
      - kind: other
        ref: ".planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md, grep -qE '^result: pass( |$)'"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-09-28
status: complete
---

# Phase 260928-tjj Plan 01: Correct the stale caller-routing comment Summary

**Collapsed three contradictory caller-routing comments across two `main.rs` match arms into one accurate, platform-explicit statement -- correcting a task-brief assumption that was itself measured false and a second stale copy the source todo never named.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-28 (plan committed at `02e0ed0f1`)
- **Completed:** 2026-09-28
- **Tasks:** 2
- **Files modified:** 2 (`src-tauri/src/main.rs`, the completed todo)

## Re-run Census Result

Re-ran the production `seam.clearCookies` / `seam.cookiesForDomain` census against live source rather than trusting `<planning_measurements>` or the todo's own table:

- **Confirmed, unchanged from planning:** exactly four production `seam.clearCookies` sites (`humble/user.ts:1010`, `gog/user.ts:69`, `nile/user.ts:69`, `legendary/user.ts:400`) and exactly four production `seam.cookiesForDomain` sites (`humble/user.ts:976`, `gog/user.ts:54`, `nile/user.ts:56`, `legendary/user.ts:338`). All three sentinel-label constants (`GOG_COOKIE_CLEAR_NO_WINDOW_LABEL`, `AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL`, `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`) exist exactly where planning said. Both Rust domain matchers (`epic_cookie_domain_matches` over `EPIC_COOKIE_DOMAINS`, `store_logout_cookie_domain_matches` over `STORE_LOGOUT_COOKIE_DOMAINS`) confirmed unchanged.
- **Confirmed:** `legendary/user.ts:290` -- `const label = isMac ? EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL : await seam.open(COOKIE_HANDLE_ORIGIN, ...)`. Epic's sentinel label is macOS-conditional; off macOS it opens a real hidden window and passes its real label instead.
- **Confirmed:** `gog/user.ts:47` and `nile/user.ts:49` both open `clearGogCookiesForLogout`/`clearAmazonCookiesForLogout` with `if (!isMac) { return }`. Off macOS neither ever calls the Rust arm.
- **Confirmed (measurement 10 in the plan):** `grep -c 'routed through a live Tauri-managed window' src-tauri/src/main.rs` returned 2 before the edit, not 1 -- the todo undercounted. The second copy sat in the sibling `humble_login_cookies_for_domain` census arm (~700 lines below the clear arm), same contradiction, same Phase 40 note pattern underneath it.

**Every planning measurement held against live source.** Nothing disagreed; the only correction needed was the task brief's own non-macOS assumption, which planning had already flagged as false in measurement (4) and which is explicitly NOT what got written into the comment.

**Task brief's own false assumption:** the brief stated that off macOS "the sentinel-label callers still fall through to `humble_login:no-window:{label}`." This is false and was not written into the comment. GOG and Amazon never reach the arm off macOS (early return); Epic uses a real window label there. Off macOS every caller that reaches this arm carries a real window label, and no caller is expected to hit the no-window error by design -- the new comment states this platform split explicitly, in both arms.

## Pre- and Post-edit `cargo test` Counts

- **Pre-edit baseline (recorded by Task 1's precondition):** `test result: ok. 289 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.05s`
- **Post-edit:** `test result: ok. 289 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.06s`

Identical counts. The comment-sensitive pin `epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache` passed at every checkpoint, including with the two forbidden literals (`fn clear_default_data_store_cookies_for_domain`, `NSSet::from_slice`) confirmed absent from every line this task added.

## Accomplishments

- Deleted the stale final sentence ("Every other caller...routed through a live Tauri-managed window...") from BOTH arms -- the clear arm's Epic-pristine-window paragraph and the census arm's mirrored paragraph -- keeping each paragraph's still-correct preceding structural reasoning intact.
- Extended the clear arm's existing Phase 40 (D-15) note into a single caller-routing statement: all four callers named by symbol with the label kind each passes, the macOS branch split (Humble alone reaches the window-based branch; Epic/GOG/Amazon all take the fallback via the two named Rust matchers), and an explicit Windows/Linux paragraph stating that GOG/Amazon never reach the arm off macOS and Epic uses a real window there instead -- with an explicit callout that this is NOT the same claim as the macOS paragraph.
- Added a one-line pointer in the census arm's own Phase 40 note back to the clear arm's statement, plus the one fact specific to that arm (`seam.cookiesForDomain`, same `label` binding reuse) -- avoiding a second full copy.
- Verified the comment-only property against `BASE.sha` (pinned before the first edit while HEAD was still the plan commit) rather than a rangeless `git diff`, so the check could not pass vacuously once committed.
- Moved the source todo to `completed/` via `git mv`, staged the `result:` edit, ran `pnpm planning-gates`, and committed the move in one invocation per CLAUDE.md's plain-`mv`-crashes-a-gate warning.

## Task Commits

1. **Task 1: Collapse three contradictory caller-routing comments across two arms into one accurate, platform-explicit statement** - `f760836a0` (fix)
2. **Task 2: Close the source todo -- move to completed with a status-word result** - `c803d00f7` (docs, rename only -- see Deviations) + `d68ebaa7d` (fix, the `result:` edit itself)

**Plan metadata:** committed separately by the orchestrator (per its instructions, this executor did not commit STATE.md/SUMMARY.md).

## Files Created/Modified

- `src-tauri/src/main.rs` -- rewrote the caller-routing comment paragraphs in both `humble_login_clear_cookies` and `humble_login_cookies_for_domain` match arms. Comment-only: `git diff` against `BASE.sha` shows 42 insertions / 8 deletions, every one a `//`-prefixed line; zero non-comment lines changed.
- `.planning/quick/260928-tjj-correct-the-stale-caller-routing-comment/BASE.sha` -- created (precondition), the pinned pre-edit revision the comment-only gate diffs against.
- `.planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md` -- moved from `pending/`, `result:` now opens with the bare word `pass` and records the audit's two corrections plus the two-copies finding.

## Decisions Made

- **Fixed both stale copies, not just the named one.** Planning measurement (10) found the identical sentence duplicated in the sibling census arm; the plan's own reasoning (fixing only the named arm "would leave the identical wrong sentence 700 lines below...and make a file-wide negative grep impossible") was followed exactly -- the census arm gets a pointer, not a duplicate, keeping the file-wide count at one statement.
- **Task brief's non-macOS assumption rejected, not incorporated.** Live source (both JS helper guards and the Epic ternary) directly contradicts it; writing it into the comment would have reintroduced exactly the kind of unverified claim this task exists to remove.
- **Forbidden literals avoided by construction, not by after-the-fact scrubbing.** Neither `fn clear_default_data_store_cookies_for_domain` nor `NSSet::from_slice` appears anywhere in the new text -- confirmed by grep against the full file after the edit, with both hits (function definition, existing type-set locator) sitting outside the touched region.
- **BASE.sha pinned before any edit, while HEAD was still the plan commit** (`02e0ed0f1`) -- captured after the code edits were already made in-session but before any commit landed, so it still correctly represents the pre-edit revision; the diff gate against it is non-empty and comment-only as required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Task 2's combined stage+gate+commit invocation silently dropped the `result:` edit**
- **Found during:** Task 2, immediately after the first commit (`c803d00f7`)
- **Issue:** The `git add <completed-path> <pending-path> 2>/dev/null` call in the combined stage/gate/commit invocation listed both the post-rename `completed/` path and the now-nonexistent pre-rename `pending/` path (to be safe against either state). Passing a nonexistent pathspec to `git add` fails the whole invocation, and the `2>/dev/null` redirect hid the fatal error; the following `;`-separated `git status --short` (not `&&`-chained to the `add`) ran regardless and showed a clean-looking staged rename, so `pnpm planning-gates && git commit` proceeded and committed only the `git mv` staged earlier -- not the `result: pass` `Edit` made just before, which had landed on disk but never made it into the index.
- **Fix:** Verified via `git status --short` that the committed content still read `result: pending` while the working tree had the correct `result: pass` text; staged the file alone (a path guaranteed to exist), re-ran `pnpm planning-gates` (12/12 pass), and created a new corrective commit (`d68ebaa7d`) rather than amending `c803d00f7`, per the no-amend rule.
- **Files modified:** `.planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md`
- **Verification:** `git status --short` clean afterward; re-ran the full Task 2 automated verify block (pending-path absent, completed-path present, `result: pass` grep, `pnpm planning-gates`) -- all pass.
- **Committed in:** `d68ebaa7d`

---

**Total deviations:** 1 auto-fixed (Rule 3 -- a self-inflicted staging bug in this executor's own Task 2 commit invocation, caught and corrected within the same session before handoff)
**Impact on plan:** No scope creep. The plan's required end state (todo moved, `result:` opening on a bare `pass`, planning gates green) is met; it now took one extra corrective commit to get there, which is why `actuals.commits` is 3, not the 2 a clean run would have produced.

## Issues Encountered

None beyond the deviation above, which was caught and resolved before this SUMMARY was written.

## Formatter Verdicts (CLAUDE.md, measured with prettier 3.7.4)

- `src-tauri/src/main.rs`: OMITTED per the plan's own measurement -- `npx prettier --check` exits 2 ("No parser could be inferred"), not ignored but unparseable, so a `--check` here is a hard error, not assurance. Not re-run; the plan's recorded reasoning is authoritative and was not contradicted by anything found during execution.
- Todo file under `.planning/`: OMITTED -- `.planning/` is prettier-ignored, `--check` there matches zero files and would be vacuous. Matched the surrounding file's existing wrap and key order by hand instead.

## Verification Gates Run (all passing)

1. `cargo test --bin gamelib-shell` -- `test result: ok. 289 passed; 0 failed; 2 ignored` both pre- and post-edit.
2. `grep -c 'routed through a live Tauri-managed window' src-tauri/src/main.rs` -- `0` (was `2` before the work).
3. Clear-arm region anchor check -- `clearGogCookiesForLogout`, `clearAmazonCookiesForLogout`, `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`, `store_logout_cookie_domain_matches`, `epic_cookie_domain_matches`, `Windows/Linux` all present.
4. Census-arm region anchor check -- `seam.cookiesForDomain` and a pointer to `humble_login_clear_cookies` both present, no duplicated statement.
5. Comment-only diff assertion against `BASE.sha` -- diff non-empty, every changed line `//`-prefixed, zero non-comment lines.
6. `pnpm planning-gates` -- 12/12 gates passed after the todo move.
7. Forbidden-literal check -- `fn clear_default_data_store_cookies_for_domain` and `NSSet::from_slice` both confirmed absent from every line touched by this task (both literals still exist elsewhere in the file, unperturbed).

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- `src-tauri/src/main.rs`'s cookie arms now carry exactly one caller-routing statement, file-wide, correct on both macOS and Windows/Linux.
- The source todo is closed with a `pass` result recording the two corrections the audit made.
- No blockers or concerns for follow-on work; this was a comment-only, fully reversible change (`git revert` on either commit).

---
*Phase: 260928-tjj*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: `src-tauri/src/main.rs`
- FOUND: `.planning/quick/260928-tjj-correct-the-stale-caller-routing-comment/BASE.sha`
- FOUND: `.planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md`
- FOUND commit: `f760836a0`
- FOUND commit: `c803d00f7`
- FOUND commit: `d68ebaa7d`
- CONFIRMED: `git status --short` shows only the untracked SUMMARY.md itself (no residual unstaged code/todo changes)
