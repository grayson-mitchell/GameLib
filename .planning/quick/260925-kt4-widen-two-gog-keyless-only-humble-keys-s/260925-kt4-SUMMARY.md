---
quick: 260925-kt4
subsystem: humble-keys
tags: [humble, keyless, isKeylessKeyType, viewFilters, HumbleKeyRow]
requires: []
provides:
  - isGiftable widened to the full keyless set (gog_keyless, epic_keyless, origin_keyless)
  - Keys/index.tsx claim-destination fork widened to the full keyless set
  - HumbleKeyRow login-and-claim exclusion and claim-button label widened to match
affects:
  - src/common/humble/viewFilters.ts
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
key-files:
  created: []
  modified:
    - src/common/humble/viewFilters.ts
    - src/backend/humble/__tests__/viewFilters.test.ts
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
    - .planning/todos/completed/2026-09-25-humble-keys-two-sites-still-special-case-only-gog-keyless.md
decisions:
  - "D1: site 1's generalization to epic_keyless/origin_keyless rests on classify.ts:174-181's structural no-key-code shape, not a second live probe (stated in code comment)"
  - "D2: isGiftableSpare left byte-identical — platform-blind by design, divergence from isGiftable pinned by test"
  - "D3: isKeylessKeyType stays a closed literal set, never endsWith — an unrecognised foo_keyless must fall through to the safe/keyed path"
  - "D4: no new locale string added — humbleKeys.claimOnHumble already existed in all 49 locales"
metrics:
  duration: "~1 session (across a context compaction)"
  completed: 2026-09-25
---

# Quick Task 260925-kt4: Widen the two gog_keyless-only Humble Keys special cases Summary

Replaced four remaining `gog_keyless` string-literal special cases across the Humble Keys claim
and gift affordance surface with calls to the existing `isKeylessKeyType` predicate, so
`epic_keyless` and `origin_keyless` get the same treatment `gog_keyless` already had.

## What shipped

| Task | What | Commit |
|------|------|--------|
| 1 | `isGiftable` widened from `key.platform !== 'gog_keyless'` to `!isKeylessKeyType(key.platform)`; `isGiftableSpare` left untouched (D2); regression tests added in both `viewFilters.test.ts` and a new `HumbleKeyRow` describe block pinning the transitive loss of the gift button | `d74e013f8` |
| 2 | `Keys/index.tsx` claim-destination fork widened to route all keyless claims to the Humble embed; `HumbleKeyRow`'s `login-and-claim` exclusion (site 3) and claim-button label (site 4) widened to match; `isGogKeyless` local deleted; new regression describe blocks added in both test files | `a63ed0160` |
| 3a | Todo moved `pending/` → `completed/`, `git mv` staged (this commit captured only the pre-edit content — see Deviations) | `96568b2fc` |
| 3b | Follow-up commit landing the actual `status: RESOLVED` flip and the `## What shipped` correction section that the first todo commit missed | `4a862cd84` |

## Verification (actual output, re-run against final HEAD)

**Task 1:**
- `npx prettier --check` (3 files): `All matched files use Prettier code style!`
- `pnpm codecheck`: exit 0, no output
- jest (`viewFilters.test.ts` + `HumbleKeyRow/__tests__/index.test.tsx`): `OK total=165` (0 failed; floor was ≥158 — includes Task 2's additions to the same HumbleKeyRow file since jest was re-run against final HEAD, not isolated per-task state)

**Task 2:**
- `npx prettier --check` (4 files): `All matched files use Prettier code style!`
- `pnpm codecheck`: exit 0, no output
- `pnpm lint`: exit 0, `638 problems (0 errors, 638 warnings)` — all pre-existing, none in touched files; footer `production: PASS | tests: PASS`
- `gog_keyless` literal-count check: `OK: zero executable gog_keyless literals (was 4)` (benign `paste: usage` stderr warning on this macOS box, exit code and printed result both correct — same quirk noted during original execution)
- jest (3 files, full task-2 scope): `OK total=211` (0 failed; floor was ≥206)
- locale churn check: `OK: no locale churn`

**Task 3:**
- `test`/`grep` chain: `OK`
- `pnpm planning-gates`: `13/13 planning gates passed`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 3's todo-file commit initially landed without its actual edits**
- **Found during:** Task 3, immediately after committing `96568b2fc`
- **Issue:** `git mv` (run before the context compaction that split this session) both renamed and staged the todo file. After the compaction resumed, I used the `Edit` tool to flip `status: OPEN` → `status: RESOLVED` and append the `## What shipped` section — but never re-ran `git add` afterward. The commit therefore captured only the pre-edit, `git mv`-staged snapshot (`status: OPEN`, no `## What shipped` section), even though the working tree and my own tool output showed the edits as applied. `git commit --stat` showing `0 insertions(+), 0 deletions(-)` on a pure rename was the tell.
- **Fix:** Ran `git add` on the file again to stage the actual working-tree edits, verified only that one file was staged (`git diff --cached --name-only`), and created a new follow-up commit (`4a862cd84`) — not an amend — carrying the missing `status: RESOLVED` flip and `## What shipped` section. Re-verified the final committed blob via `git show 4a862cd84:<path>` before proceeding.
- **Files modified:** `.planning/todos/completed/2026-09-25-humble-keys-two-sites-still-special-case-only-gog-keyless.md`
- **Commit:** `4a862cd84` (fixes content that should have landed in `96568b2fc`)

No other deviations — Tasks 1 and 2 executed exactly as written, with all decisions (D1–D4) held as locked.

## Dirty-tree guard compliance

Confirmed via `git diff --cached --name-only` before every commit in this session that
`.planning/ROADMAP.md` and `.planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/`
never appeared in the staged set. Both remain untouched and unmodified by this task, exactly as
they were at dispatch. No wildcard staging (`git add -A`/`.`/`git commit -a`) was used at any
point.

## Self-Check: PASSED

All 7 files confirmed present on disk; all 4 commit hashes (`d74e013f8`, `a63ed0160`, `96568b2fc`,
`4a862cd84`) confirmed present in `git log --oneline --all`.
