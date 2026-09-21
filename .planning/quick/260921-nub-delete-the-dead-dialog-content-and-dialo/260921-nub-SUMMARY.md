---
phase: quick-260921-nub
plan: 01
subsystem: ui-dialogs
tags: [css, dead-code, dialog, settings]
dependency-graph:
  requires: []
  provides: [dead-dialog-css-removed]
  affects: [src/frontend/components/UI/Dialog, src/frontend/screens/Settings/components/SettingsModal, src/frontend/components/UI/RedeemSteamKeyDialog]
tech-stack:
  added: []
  patterns: [in-situ comment justifying a surviving CSS custom property, plain mv + content-verify instead of git mv for todo closure]
key-files:
  created:
    - .planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md
    - .planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md
    - .planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
  modified:
    - src/frontend/components/UI/Dialog/index.css
    - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css
    - src/frontend/components/UI/ProgressDialog/index.css
    - src/frontend/screens/Game/ModifyInstallModal/index.scss
    - src/frontend/screens/Settings/components/SettingsModal/index.tsx
    - src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
  deleted:
    - src/frontend/screens/Settings/components/SettingsModal/index.scss
decisions:
  - "Deletion over re-anchoring for the compound .Dialog__content.settingsDialogContent selector, per the Dialog.tsx:106-120 precedent (260820-kq0/260921-mzl) -- re-anchoring would have activated an unreviewed 65vw/60vh/800px/64vh layout on the Settings dialog for the first time"
metrics:
  duration: "~40 minutes"
  completed: 2026-09-20
---

# Phase quick-260921-nub Plan 01: Delete dead `.Dialog__content`/`.Dialog__headerTitle` CSS and close the parent todo Summary

Deleted two dead primitive CSS classes and the five downstream stylesheet rules that named them
across four files, removed one orphaned `Dialog__input` className, filed three adjacent findings
surfaced while measuring, and closed the parent todo with a decision record — no behaviour change,
no visual change, no new rule anywhere.

## What Was Built

**Task 1** (`b123a7467`) deleted `.Dialog__headerTitle` and `.Dialog__content` from
`Dialog/index.css`, plus the now-orphaned `--dialog-margin-vertical`/`--dialog-gap` tokens (their
only references were the two deleted rules), and the four downstream rules in
`MessageBoxModal/index.css`, `ProgressDialog/index.css` and `ModifyInstallModal/index.scss` that
styled the dead classes. `Dialog/index.css` is now 23 lines / three rules: `.Dialog`,
`.log-upload-result`, `.Dialog__footer`.

`--dialog-margin-horizontal` survives, with this exact in-situ comment added directly above it:

```
/* quick-260921-nub: kept because InstallModal/index.scss:27 and
   Winetricks/index.scss:3 still reference it by name, and
   cssTokenSweep.test.ts would go red without this declaration. Whether it
   actually resolves at those two sites is a separate, open question --
   no element under src/ is ever given the bare class this rule targets --
   see .planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md */
```

**Task 2** (`5d220d1cd`) deleted `SettingsModal/index.scss` outright (its only content was the now-
provably-dead compound `.Dialog__content.settingsDialogContent` rule and its nested `.log-box`)
and its `import './index.scss'`. `className="settingsDialogContent"` on `DialogContent` was kept —
`Dialog.tsx:56`'s live `:has(.settingsDialogContent):not(:has(.logs-wrapper))` height rule is keyed
on it. Also removed the orphaned `className="Dialog__input"` from `RedeemSteamKeyDialog`'s
`<input>`, a provable no-op since no rule anywhere ever matched it.

**Task 3** (`30630b9d2`) filed three pending todos surfaced while measuring, and closed the parent
todo with a decision record.

## Deviations from Plan

None — plan executed exactly as written. One transient measurement artifact, not a deviation: after
`rm`-ing `SettingsModal/index.scss` but before `git add`, `cssTokenSweep.test.ts` briefly failed
with `ENOENT` because it enumerates files via `git ls-files` (reads the index, not the working
tree) and then reads them from disk. Staging the deletion (`git add`) resolved it immediately;
re-running the Frontend jest project afterward showed the expected 167/2655 pass count. No code
changed as a result of this — it was a measurement-ordering artifact, documented here in case a
future executor hits the same false alarm.

## Lint Counts (before / after, both scopes unchanged)

| Scope | Before | After |
| --- | --- | --- |
| production (`SRC_CEILING` 1124) | 1119 warnings, PASS | 1119 warnings, PASS |
| tests (`TESTS_CEILING` 638) | 638 warnings, PASS | 638 warnings, PASS |

`diff` between the full before/after `pnpm lint` transcripts showed exactly one line changed, a
line-number shift (46→45) on the same pre-existing `react-hooks/exhaustive-deps` warning in
`SettingsModal/index.tsx`, caused by removing the `import './index.scss'` line one line above it —
not a new or cleared warning.

## Frontend Jest (before / after)

167 test suites / 2655 tests passed at HEAD `0135587aa` (baseline) and again after all three tasks
(includes `cssTokenSweep.test.ts`, `dialogWindowChrome.test.ts`, `muiTabsSelectorScoping.test.ts`).

## New Todos Filed

| Filename | Severity | Ready |
| --- | --- | --- |
| `2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md` | minor | live-gate |
| `2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md` | minor | live-gate |
| `2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md` | medium | live-gate |

The parent todo (`2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md`)
moved from `pending/` to `completed/` with a closing note recorded at the top of its body.

## Deletion Over Re-anchoring

Deletion was chosen over re-anchoring by deliberate precedent, not by default. The parent todo
framed both as open options. `Dialog.tsx:106-120` records the binding precedent set by
`260820-kq0` and restated by `260921-mzl`: reviving an unreviewed rule that has never applied would
change sizing for all ~25 `Dialog` consumers as an undiscussed side effect. The concrete consequence
that decided it here: re-anchoring the compound `.Dialog__content.settingsDialogContent` selector to
a bare `.settingsDialogContent` would have activated `width: 65vw; display: flex; flex: 1 1 60vh;
max-width: 800px; min-height: 64vh` on the Settings dialog for the first time ever — a live visual
change with no requirement behind it, in a `testEnvironment: 'node'` project with no jsdom and no
CSS engine able to observe whether it looks right. Re-anchoring remains available to a future,
deliberately-visual, live-gated task.

## Known Stubs

None — this plan only removes dead CSS/attributes and files/closes todos; no new UI surface, no
new data flow.

## Self-Check: PASSED

Verified on disk:

- `src/frontend/components/UI/Dialog/index.css` exists, 23 lines, contains
  `--dialog-margin-horizontal:` and does not contain `--dialog-margin-vertical`/`--dialog-gap`.
- `src/frontend/screens/Settings/components/SettingsModal/index.scss` does not exist (`git ls-files`
  confirms it is untracked-deleted, not merely absent).
- `git log --oneline -3` shows `30630b9d2`, `5d220d1cd`, `b123a7467`, all present in `git log --all`.
- `.planning/todos/completed/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md`
  exists and contains the closing note plus all three new todo filenames.
- `grep -rn 'Dialog__content\|Dialog__headerTitle\|Dialog__input' src/` returns zero lines.
