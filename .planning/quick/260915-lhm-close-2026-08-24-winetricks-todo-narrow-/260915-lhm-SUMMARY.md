---
quick-task: 260915-lhm
subsystem: ui
tags: [react, typescript, jest, eslint, tauri, webkit-localstorage, dom-instrumentation, wcag-contrast]

provides:
  - "2026-08-24 winetricks send-channel todo closed (completed/), history preserved, RESOLVED 2026-09-15 section appended"
  - "2026-08-26 winetricks search/hover todo narrowed to its two unresolved halves, ready: live-gate, still OPEN in pending/"
  - "searchProbe.ts: default-OFF, opt-in, six-capture live-instrumentation harness for the shared SearchBar suggestions list"
  - "260915-lhm-PROBE-RETRIEVAL.md: one-pass operator drive + sqlite retrieval + reading table for the harness"
affects: [2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search, 2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press]

tech-stack:
  added: []
  patterns:
    - "Default-OFF live-DOM instrumentation gated by a single localStorage key, armed by a magic string typed into an existing input, proven via three independent arm-time signals (badge / durable record / secondary log line) rather than one"
    - "WCAG contrast-ratio pure functions (parseRgb/relativeLuminance/contrastRatio) unit-tested without jsdom by keeping all DOM-facing code in a separate, untested-by-unit-test half of the same module"

key-files:
  created:
    - src/frontend/components/UI/SearchBar/searchProbe.ts
    - src/frontend/components/UI/SearchBar/__tests__/searchProbeContrast.test.ts
    - .planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md
  modified:
    - .planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md (moved to completed/, appended)
    - .planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md (fully rewritten)
    - src/frontend/components/UI/SearchBar/index.tsx (14 added lines: ulRef, arming useEffect, ref= on <ul>)

key-decisions:
  - "Documented, did not fix, two rotted-verify-anchor false negatives in the plan's own Task 1/Task 2 grep checks (see Issues Encountered) rather than reword plan-mandated prose to satisfy an overly-broad grep"
  - "Task 1's closing section states the PARKED useEffect-probe anomaly was made MOOT, not answered -- deliberately avoids any claim of explanation"
  - "Task 2's F-4 contrast hypothesis is recorded and explicitly labelled UNPROVEN, not adopted as a working theory"

requirements-completed: []

duration: "not reliably measurable -- this execution spanned a context-compaction boundary; own commits span 16:06:01-16:06:21 PDT 2026-09-15, immediately following unrelated commit a88104f8c at 13:37:00 PDT from either an earlier stretch of this same session or the concurrent session on this branch"
completed: 2026-09-15
---

# Quick Task 260915-lhm: Close/narrow two winetricks todos, add a default-OFF SearchBar probe

**Closed the resolved 2026-08-24 winetricks send-channel todo with full history preserved, narrowed the 2026-08-26 search/hover todo to its two genuinely unresolved halves, and built a six-capture, default-OFF live-DOM instrument (`searchProbe.ts`) for the still-open Library mouse-dead defect -- an instrument only, with no diagnosis and no fix.**

## Accomplishments

- `.planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md` moved (plain `mv`, not `git mv`) to `completed/`, grown 394 -> 485 lines, with a `## RESOLVED 2026-09-15 -- fixed by Phase 35 Plan 25` section naming `366e719bb`, the parent-remount mechanism (~4ms after mousedown, ~60ms before mouseup), and the two live-mouse installs (`vcrun2005`, `vcrun2008`) that proved it. The section explicitly states the PARKED section's silent `useEffect` probe anomaly was made **moot** by a different measurement, not answered -- this is stated plainly enough that a future reader cannot mistake it for an explanation.
- `.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md` rewritten in place: retitled, the stale `WinetricksSearch.tsx` file pin fixed to `WinetricksSearch/index.tsx`, `ready: code` changed to `ready: live-gate` with an explicit justification (three prior code-reading theories about this surface have all been wrong), and the body split into SHIPPED (the `366e719bb` Install-click fix) versus REMAINS (Half A search-filtering, **never investigated**; Half B hover-highlight). Records an explicitly **UNPROVEN** contrast-defect hypothesis (F-4: `--accent` has 10 per-theme values ranging down to a near-invisible `#30444a` dark slate). Stays `status: OPEN` in `pending/`.
- `src/frontend/components/UI/SearchBar/searchProbe.ts` (741 lines): a self-contained, default-OFF live-instrumentation harness implementing all six required capture categories -- C-1 hover/contrast (the pure `parseRgb`/`relativeLuminance`/`contrastRatio` WCAG functions, unit-tested), C-2 pointer sequence (ul-origin and document-origin, to distinguish "no mouseup" from "mouseup landed elsewhere"), C-3 focus/DOM rAF sampling (mousedown through mouseup+100ms or a 600ms hard cap), C-4 hit-testing (`elementFromPoint`/`elementsFromPoint` at mousedown), C-5 mount/unmount `MutationObserver`s on both the `<ul>` and its parent, and C-6 Tab-key before/after sampling. Armed by typing `::probe-on` into any `SearchBar` consumer's value; disarmed by `::probe-off`. Three independent arm-time proofs: an on-screen badge (drawn directly to `document.body`, outside React), a durable `localStorage` record with a nonce, and a secondary (documented-as-secondary) `window.api.logInfo` line.
- `src/frontend/components/UI/SearchBar/index.tsx` wired in with exactly 14 added lines: a `ulRef`, an arming `useEffect` calling `attachSearchProbe(ulRef.current, value)`, and `ref={ulRef}` on the existing `<ul className="autoComplete">`. The `ROOT CAUSE FOUND` retraction comment block is byte-identical.
- `src/frontend/components/UI/SearchBar/__tests__/searchProbeContrast.test.ts` (new, `.ts` not `.tsx` to land inside the project's `no-explicit-any`/`no-unsafe-*` test override, which only matches `*.ts`): pins `parseRgb`'s valid/alpha/transparent/invalid/empty cases, the WCAG anchor (black-vs-white = 21), the identity anchor (a colour against itself = 1), null-on-failure, and a non-vacuity check that the two anchors actually disagree.
- `.planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md`: the one-pass operator drive script, the sqlite retrieval commands (all three WebKit-localStorage traps: the empty `WebsiteData/LocalStorage/` decoy, UTF-16LE BLOB decoding, multi-origin `-wal`-mtime selection), a reading table mapping each C-1..C-6 outcome to the hypothesis it kills, and an explicit negative-control note that a `0 rec` result is a hard finding, not a failed run.

## Task Commits

1. **Task 1 + Task 2: close/narrow the two todos** - `e11d40679` (docs)
2. **Task 3: build searchProbe.ts harness, wire it into SearchBar, test it, document retrieval** - `8efb96c02` (chore)

Per the plan's own commit protocol (two commits, not three), Tasks 1 and 2 share a single commit since both are pure todo-file edits with no code dependency between them; Task 3 is its own commit.

**No plan-metadata commit was made** for STATE.md/ROADMAP.md/SUMMARY.md/PLAN.md, per this execution's hard prohibitions -- those are the orchestrator's responsibility, not this task's.

## Files Created/Modified

- `src/frontend/components/UI/SearchBar/searchProbe.ts` - the six-capture instrument (new)
- `src/frontend/components/UI/SearchBar/__tests__/searchProbeContrast.test.ts` - unit tests for the pure contrast-math half (new)
- `src/frontend/components/UI/SearchBar/index.tsx` - 14-line call-site wiring, everything else byte-identical
- `.planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md` - drive + retrieval doc (new)
- `.planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md` - moved from `pending/`, appended (394 -> 485 lines)
- `.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md` - fully rewritten in place, stays OPEN

## Decisions Made

- Kept all plan-mandated prose in both todo files verbatim, including sentences containing the substring "resolves_phase" (used only to document the deliberate *absence* of that frontmatter key), rather than reword them to dodge a blanket grep in the plan's own verify block -- see Issues Encountered below.
- Chose `rows: Element[]` (an explicit type annotation) over changing `recordHoverSample`'s `li` parameter type, to fix a `tsc` type error between `Element` and the DOM lib's inferred `HTMLLIElement[]` from `querySelectorAll('li')`, keeping the function's public parameter type as the more general `Element` (matching what `closest('li')` actually returns at every call site).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a type error between `Element` and the DOM lib's inferred `HTMLLIElement[]`**
- **Found during:** Task 3, first `pnpm codecheck` run after writing `searchProbe.ts`
- **Issue:** `rows.indexOf(li)` failed to typecheck: `Array.from(ul.querySelectorAll('li'))` infers `HTMLLIElement[]`, but `li` is typed as the more general `Element` (matching every caller's `closest('li')` return type)
- **Fix:** Annotated `const rows: Element[] = Array.from(ul.querySelectorAll('li'))` so both sides agree on the wider type
- **Files modified:** `src/frontend/components/UI/SearchBar/searchProbe.ts`
- **Verification:** `pnpm codecheck` exits 0 afterward
- **Committed in:** `8efb96c02` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Purely a type-level fix inside the new file; no behavioral or scope change.

## Issues Encountered

**Two rotted-verify-anchor false negatives in the plan's own automated checks (not a defect in this work):**

Both Task 1's and Task 2's `FRONTMATTER_OK`-style blocks in the plan include `! grep -q 'resolves_phase' "$F"` as a blanket whole-file check, intended to assert "no `resolves_phase:` frontmatter key was set." Both files' *bodies* legitimately contain the literal substring `resolves_phase` in prose that documents the deliberate absence of that key (e.g. Task 1's original, pre-existing lines: *"No `resolves_phase:` -- this is NOT resolved by Phase 34.6..."*; Task 2's plan-mandated Notes section: *"No `resolves_phase:` -- 34.6 is verified `passed` and must not auto-close this file."*). A blanket substring grep cannot distinguish "no frontmatter key" from "body prose that names the field." Confirmed via `git show HEAD:<path> | grep -n resolves_phase` (pre-existing in Task 1's case) and via `awk`-based frontmatter-only extraction (no such key exists in either file's actual YAML block) that the real, substantive requirement -- no `resolves_phase:` YAML key -- **is** satisfied in both files. Per the plan's own guidance ("If a verify command above fails against the tree you have, first check whether the anchor rotted rather than assuming the work is wrong"), this was diagnosed as a stale/rotted verify anchor in the plan itself, not reworded away, and is recorded here rather than silently worked around.

**No other issues.** `pnpm planning-gates` passed 11/11 on the first run against the final tree; `pnpm codecheck` passed clean after the one type-error fix above; the targeted Jest suite passed both files (13 tests) on the first run after the fix; `pnpm lint` matched the plan's exact numeric anchors (see below) with zero iteration needed.

## Gate Results (verbatim outcomes, including the one failure)

- `pnpm planning-gates` → **11/11 planning gates passed.** (matches V-9 baseline exactly)
- `pnpm codecheck` → **exit 0**, after the one Rule-1 fix above (first run failed with `TS2345` on `Element` vs `HTMLLIElement`)
- `npx jest --selectProjects Frontend --passWithNoTests src/frontend/components/UI/SearchBar` → **2 suites, 13 tests, all passed** (`suggestionFocusRace.test.tsx` unchanged/pinned + new `searchProbeContrast.test.ts`)
- `git diff --stat` on `suggestionFocusRace.test.tsx` → **empty** (zero-byte diff confirmed)
- `pnpm lint` → **exactly `1123 problems (0 errors, 1123 warnings)` in production and `638 problems (0 errors, 638 warnings)` in tests, exit 0** -- measured numerically, not by exit code alone. These are the same two numbers as `V-9`/`V-10`'s planning-time baseline: `searchProbe.ts`, its test, and the `index.tsx` edit introduced **zero new lint warnings** in either scope, despite tests sitting at zero free headroom.
- Scope fence: `index.scss`, `LibrarySearchBar/index.tsx`, `WinetricksSearch/index.tsx` all byte-unchanged (`git diff` empty on each); `SearchBar/index.tsx` added exactly 14 lines (budget was ≤25); the `ROOT CAUSE FOUND (Phase 35 Plan 25` comment string is intact.
- All six captures (`C-1`..`C-6`) confirmed present in comment-stripped source via the plan's own token-presence check.
- `SEARCHPROBE-REMOVE-ME` marker present in 3 files (`searchProbe.ts`, `index.tsx`, `searchProbeContrast.test.ts`) -- exceeds the ≥2 requirement.
- Retrieval doc content check (`localstorage.sqlite3`, `utf-16-le`, `-wal`, `::probe-on`, `badge`, `0 rec`/`zero record`) → all present.

## Concurrency Report

HEAD was at `a88104f8c` at the start of this stretch of work and remained there, unmoved, until this task's own two commits landed (`e11d40679`, then `8efb96c02`) -- the concurrent session did not commit during this execution window. `git status --porcelain` before each commit showed exactly the expected foreign, untouched paths (one modified todo, `.claude/skills/archify/`, `skills-lock.json`, the `260912-d84` quick-task artifacts, and the spike-024 screenshots/log) alongside this task's own paths; nothing foreign was ever staged. No rebase, reset, revert, or force operation was used. `git mv` was never used for the todo move (plain `mv` + explicit `git add` on both paths); the staged blob was asserted directly (`git show ":<path>" | grep -c 'RESOLVED 2026-09-15'` → `1`) before committing, satisfying T-LHM-07 independently of git's own cosmetic rename-detection display (`git status` showed an `R` marker for the move, which is git's content-similarity heuristic and not evidence of `git mv` having been used or of any data loss -- confirmed directly by the staged-blob check).

## What This Work Does NOT Close

- **The 2026-08-24 todo's own unresolved anomaly** (the silent `useEffect` probe in `Winetricks/index.tsx` that never fired despite having no early return and a live dependency array) remains genuinely unexplained. It now lives in `completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md`'s `### Still unexplained: the probe that never fired` section. This closure states plainly that the anomaly was made **moot**, not answered -- nobody should read the file closing as the anomaly being resolved.
- **Half A of the 2026-08-26 todo** (the search box needing several attempts before it filters usably) has never been investigated at all -- every measurement taken on this surface since 2026-08-25 was aimed at the Install-click/highlight symptom, never at search filtering. Narrowing this todo's title and scope is not progress on Half A; it is scoping the file honestly around what has and has not been looked at.
- **Task 3 produced an instrument, not a diagnosis.** `searchProbe.ts` makes a live measurement of the Library `SearchBar` mouse-dead defect (and the winetricks hover-highlight/F-4 contrast question) possible in one operator drive; it does not run that drive, does not read the result, and asserts no cause anywhere in its own code, its test, or the retrieval doc. The Library defect described in `2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md` remains exactly as open as it was before this task.
- The winetricks browse-UI redesign was out of scope and was not touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The instrument (`searchProbe.ts`) and its retrieval doc are in place and gate-clean; the next actionable step for either open todo is the live operator drive described in `260915-lhm-PROBE-RETRIEVAL.md`, not further code reading. No blockers.

## Self-Check: PASSED

All created files confirmed present on disk (`searchProbe.ts`, `searchProbeContrast.test.ts`, `260915-lhm-PROBE-RETRIEVAL.md`, the moved `completed/2026-08-24-...md`, the rewritten `pending/2026-08-26-...md`, this SUMMARY). Both commit hashes (`e11d40679`, `8efb96c02`) confirmed present in `git log --oneline --all`.

---
*Quick task: 260915-lhm*
*Completed: 2026-09-15*
