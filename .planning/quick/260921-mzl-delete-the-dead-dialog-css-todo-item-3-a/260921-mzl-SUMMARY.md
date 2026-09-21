---
phase: quick-260921-mzl
plan: 01
subsystem: ui-dialogs
tags: [css-cleanup, dead-code, todo-triage]
dependency-graph:
  requires: []
  provides:
    - "Dialog/index.css reduced to its five live rules"
    - ".planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md"
  affects:
    - src/frontend/components/UI/Dialog/index.css
    - src/frontend/components/UI/Dialog/components/Dialog.tsx
    - src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts
    - src/frontend/components/UI/Winetricks/WinetricksBrowse/index.scss
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md
  modified:
    - src/frontend/components/UI/Dialog/index.css
    - src/frontend/components/UI/Dialog/components/Dialog.tsx
    - src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts
    - src/frontend/components/UI/Winetricks/WinetricksBrowse/index.scss
    - .planning/todos/completed/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md
decisions:
  - "Deleted only item 3's six named dead .Dialog__* blocks; did not widen scope to .Dialog__headerTitle/.Dialog__content even though they measured equally dead, because their deadness fans into four other stylesheets that need their own visual-verification pass."
metrics:
  duration: "~35 minutes"
  completed: 2026-09-21
---

# Quick Task 260921-mzl: Delete the dead Dialog CSS (todo item 3) Summary

Deleted six dead `.Dialog__*` rule blocks from `Dialog/index.css`, repaired the three comment
blocks in `Dialog.tsx` and the three sites in `dialogWindowChrome.test.ts` that the deletion made
false, re-anchored `WinetricksBrowse/index.scss`'s bare-`--modal-background` precedent citation,
filed the wider census correction the work surfaced, and closed the parent todo without losing its
three other verified-but-unfixed items.

## What changed

**`Dialog/index.css`** went from 120 lines to 31 lines (an 89-line reduction; final count 31
lines / 5 rules: `.Dialog`, `.Dialog__headerTitle`, `.Dialog__content`, `.log-upload-result`,
`.Dialog__footer`). Deleted: `.Dialog__element`,
`.Dialog__element::backdrop`, the `.Dialog__element:popover-open, .Dialog__element[open]`
variant, `.Dialog__header`, `.Dialog__Close`, the combined `.Dialog__Close, .Dialog__header`,
`.Dialog__CloseButton` (plus its `:focus-visible`/`:hover`/`:active`), and `.Dialog__CloseIcon`.
`.Dialog`'s three declared custom properties (`--dialog-margin-horizontal`,
`--dialog-margin-vertical`, `--dialog-gap`) were kept untouched — they are consumed externally by
`InstallModal/index.scss:27` and `Winetricks/index.scss:3`, and internally by the surviving
`.Dialog__headerTitle`/`.Dialog__content` rules.

**`Dialog.tsx`** — three comment blocks (radius-override rationale, dropped `sx` pair rationale,
entrance-transition rationale) restated in the present tense with a `260921-mzl` deletion marker.
No executable line changed.

**`dialogWindowChrome.test.ts`** — one `it()` title and three inline comments restated to say the
rule was deleted rather than dead-but-present. No assertion changed; the ABSENCE guard at the
bottom of the file still asserts `.Dialog__element` is never applied as a className, now with a
present-tense rationale ("stops a stale class name being reintroduced ... stops a future reader
re-adding the deleted rule") instead of the now-false "opacity: 0 forever" consequence.

**`WinetricksBrowse/index.scss`** — the bare `--modal-background` precedent citation was
re-measured and re-anchored. The `Dialog.tsx` line number moved from `:51` (at plan-write time)
to **`:53`** after the 1b comment edits landed (re-measured on disk with grep, not copied
forward). The citation of the two now-deleted `Dialog/index.css:20,73` lines was removed and
replaced with a citation of `Dialog.tsx`'s `StyledPaper` `backgroundColor` — the dialog's own
surface, so an undefined `--modal-background` would already have broken the dialog before
reaching this sticky search bar.

**New pending todo** —
`.planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md`
records that `.Dialog__headerTitle` and `.Dialog__content` are equally dead (0 className hits) but
were deliberately NOT deleted here, because `.Dialog__content`'s deadness fans into five rules
across four other stylesheets (`SettingsModal/index.scss:1`, `ModifyInstallModal/index.scss:7`,
`ProgressDialog/index.css:6`, `MessageBoxModal/index.css:6` and `:10`) that nobody has visually
verified — a wider blast radius than item 3's self-contained blocks. It also records the Settings
compound-selector asymmetry (`.settingsDialogContent` half is still live via a `Dialog.tsx:56`
`:has()` height rule) and the opposite-direction `.Dialog__input` finding (applied at
`RedeemSteamKeyDialog/index.tsx:122`, no matching rule anywhere). Frontmatter carries
`severity: minor`, `platform: any`, `ready: code`, bare and lowercase.

**Parent todo closed** —
`.planning/todos/completed/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md`
now carries a closing note at the top of its body naming: item 3 done (with the six deleted blocks
and the four-file ripple explained); items 1/2/4 verified-accurate-at-HEAD-`39f024e6a` and closed
unfixed by design, each naming its in-situ warning location (`games.ts`'s D-35-15-01 comment,
`utils.ts`'s CR-04 `cancelId: 0` comment, `platform/index.ts:440-442`/`:506-511`); and a
cross-reference by filename to the new census-correction todo. Moved with plain `mv` +
`git add -A`, not `git mv` (this repo's `git mv` has twice committed HEAD content and dropped
unstaged edits).

## Gate results

- `npx jest --runInBand dialogWindowChrome.test.ts cssTokenSweep.test.ts` — **PASS**, 9/9 tests,
  both suites green.
- `pnpm codecheck` (`tsc --noEmit`) — **PASS**, clean.
- `pnpm lint` — **unchanged**: production 1119 warnings (ceiling 1124), tests 638 warnings
  (ceiling 638, at ceiling), both before and after this task. Verified by inspecting the full
  diff of the two edited `.tsx`/`.ts` files: every changed line is either a `//` comment or a
  jest `it()` title string — no executable line, assertion, JSX attribute, or import changed in
  either file — so no lint rule (all of which fire on code shape, not comment/string-literal
  prose) could have been newly triggered or newly cleared. The warning count did not move, and no
  ceiling was raised.
- `npx prettier --check` on the four touched files — **PASS**, all Prettier-clean.
- `pnpm planning-gates` — **PASS**, 11/11, run twice (after Task 2 and again after Task 3).

## Items 1, 2 and 4: closed unfixed by design, not overlooked

To be explicit, since the parent todo's title named four things and only one was fixed here:
items 1 (dead sideloaded-game unload confirmation, real owner D-35-15-01), 2 (inverted-polarity
quit confirmation, `cancelId: 0` already guards it) and 4 (`showMessageBoxSync`'s latent
Tauri-transport gap, zero live consumers today) were each re-verified accurate at HEAD `39f024e6a`
during this task and closed **unfixed, deliberately** — not because they were forgotten, but
because each already carries its own correct in-situ warning at the location that actually owns
the fix. This is stated in the parent todo's closing note with the exact file/comment each one
lives in, so a future reader does not have to re-investigate.

## Deviations from Plan

None — plan executed exactly as written. The only plan-noted amendment (line-number
re-measurement after 1b landed) was performed as specified: measured `53`, not the plan's
placeholder `51`.

## Known Stubs

None.

## Threat Flags

None — this task deleted dead CSS, restated comments, and moved planning documents. No new
network endpoint, auth path, file-access pattern, or schema change at a trust boundary was
introduced.

## Self-Check: PASSED

Verified on disk / in git history:
- `src/frontend/components/UI/Dialog/index.css` — FOUND, 31 lines, 5 rules confirmed by grep.
- `.planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md` — FOUND.
- `.planning/todos/completed/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md` — FOUND; `.planning/todos/pending/2026-09-19-...` — confirmed absent.
- Commit `4e989f307` (Task 1) — FOUND in `git log`.
- Commit `aa41446cb` (Task 2) — FOUND in `git log`.
- Commit `89c6ffe87` (Task 3) — FOUND in `git log`.
