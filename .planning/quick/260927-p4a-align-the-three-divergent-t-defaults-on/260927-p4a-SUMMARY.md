---
phase: quick-260927-p4a
plan: 01
status: complete
subsystem: i18n
tags: [i18n, i18next-parser, copy, todo-close, todo-file]
dependency-graph:
  requires: ["quick-260926-p2w"]
  provides: ["three-key-reuse-defect-resolved", "eos-overlay-copy-followup-filed"]
affects:
  - "src/backend/shortcuts/ipc_handler.ts"
  - "src/backend/sidecar/shortcutsFlowRegistration.ts"
  - "src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx"
  - "src/frontend/screens/WineManager/components/WineManagerSettingsModal.tsx"
tech-stack:
  added: []
  patterns: ["align an inert t() default with its catalog value", "positive-control (Control B) in place of lost non-vacuity residue"]
---

# [QUICK-260927-p4a] Summary

## What changed

Option A, taken on all three keys `quick-260926-p2w` filed as class C (a key shared by two call
sites that want different copy). Four one-line edits, each keyed on surrounding string content
(not line number, per the plan's MUTABLE-SCOPE AUTHORITY #3786 note), plus a one-line in-situ
comment at each site per the plan's decision:

- `src/backend/shortcuts/ipc_handler.ts:73` — `i18next.t('box.shortcuts.title', 'Shortcuts
  Removed')` → `'Shortcuts'`
- `src/backend/sidecar/shortcutsFlowRegistration.ts:272` — same key/value change, same comment
- `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx:163` —
  `t('setting.eosOverlay.updating', 'The EOS Overlay is being updated...')` → `'Updating...'`
- `src/frontend/screens/WineManager/components/WineManagerSettingsModal.tsx:31` —
  `t('wine.manager.settings', 'Wine Manager Settings')` → `'Settings'`

All four edits are inert at runtime: every one of these keys already resolves from the catalog at
every site touched, so **no user-visible text changed**. What changed is that the source stopped
claiming copy that was never shown, and a catalog regenerated from source can no longer pick up
the wrong variant.

Committed in two atomic commits: `ae661b5c6` (Task 1, the four source edits) and `c24ac48f6`
(Task 2, the todo close + file).

## The CORRECTION was confirmed live, not just trusted

The plan's `## CORRECTION` said the task brief's named non-vacuity control (the `already mapped to
a map or parent` warning residue) no longer exists on this tree, dissolved by `e71757335`. Ran
`pnpm i18n` before any edit and confirmed: 786 lines, exactly 5 `Found same keys with different
values` lines (3 distinct keys), 0 case-insensitive `mapped` hits. Proceeded on the CORRECTION as
written, using its two named replacement controls (A and B below) instead of the brief's control.

## Measured, per `<verify>` item

**1. `pnpm i18n` — zero collisions, both controls run.**
- Before: 5 `Found same keys with different values` lines (3 distinct keys). After: **0**.
- **Control A** (parser's positive output unmoved): all four `[en] <namespace>` blocks printed
  with `Unique keys` **806/317/285/15** (matches baseline exactly), `Added keys: 0` and
  `Restored keys: 0` in every block, `Unreferenced keys` **65/7/5/0** (matches baseline exactly),
  and a `Parsing <abs path>` line present for all four edited files. Confirmed by grep against the
  captured output.
- **Control B** (positive control on the detector): temporarily restored `'Shortcuts Removed'` at
  `ipc_handler.ts` only, re-ran `pnpm i18n` — the `translation:box.shortcuts.title` collision line
  **returned** (2 occurrences, since the file now disagreed with both the other `removeShortcut`
  site and the already-aligned `addShortcut` site). Then `git checkout --` that file to revert —
  this rolled the file back to its **pre-Task-1 committed state** (the edit was not yet committed
  when Control B ran), so the one-line comment and the `'Shortcuts'` alignment had to be
  **reapplied by hand** immediately after. Re-ran `pnpm i18n`: **0** collisions again, `git diff`
  confirmed the file matched the intended Task 1 edit exactly. This is worth flagging for future
  runs of this plan shape: Control B's `git checkout --` only works as a same-invocation revert if
  the file's real edit is already committed; here it wasn't, so the revert overshot and had to be
  corrected on the spot. Final state is correct and verified.
- `git status --porcelain public/locales` empty after **every** run (initial, dirty, post-checkout,
  post-reapply, final) — confirmed each time, never dirty.

**2. `pnpm codecheck`** — clean, both `tsc --noEmit` passes, run twice (once mid-flow, once after
the Control B correction). No errors either time.

**3. `pnpm lint`** — exit 0. Final line `production: PASS | tests: PASS`. Warning counts: production
**1107** (baseline 1107, unmoved), tests **638** (baseline 638, unmoved — zero headroom, so this
is a real check, not a vacuous one).

**4. `npx prettier --check`** over the exact four paths, one invocation — `All matched files use
Prettier code style!`, exit 0. Re-checked after the Control B correction too, still clean.

**5. `python3 .planning/todos/todo-frontmatter-gate.py`** — OK both before and after the todo
move: 17 pending todos before the move (16 original + 1 new), **16** after `git mv` staged the
parent out — matches the plan's stated 16 → 16. New todo's `severity: minor`, `platform: any`,
`ready: human` accepted in that order.

**6. `pnpm planning-gates`** — **12/12** passed, unchanged from baseline. Also ran
`.planning/planning-envelope-tag-gate.py` standalone before committing Task 2: 3345 tracked `.md`
files, 952 ending in a genuinely paired closing tag, **0** carrying a trailing orphan
envelope-tag run — neither new todo file tripped it.

**7. `npx jest --selectProjects Backend Frontend`** — green. 400 suites, 8134 tests passed (3
skipped), 0 failed. The five named source-grep guard tests (`shortcutsFlows.test.ts`,
`flowRegistrationCensus.test.ts`, `electronReachLedger.test.ts`,
`EosActionConfirmationGuard.test.ts`, `EosDeclineCallSiteGuard.test.ts`) all **PASS** —
**the comment-sensitivity fallback did NOT fire.** The comments added at all four sites are
invisible to these guards' content-anchored regex windows, exactly as the plan predicted but did
not assume. Comments were kept at all four sites; nothing was dropped.

**8. Grep assertion** — `'Shortcuts Removed'`, `'The EOS Overlay is being updated'`, and
`'Wine Manager Settings'` return **zero** hits across `src/` and `meta/` after the edits. The only
remaining hits are the three table rows inside
`.planning/todos/completed/2026-09-26-three-translation-keys-are-reused-for-two-different-meanings.md`,
which documents the old strings by design — expected per the plan.

**Deliberately omitted, per the plan:** `pnpm lint-translations` and `pnpm i18n-churn-guard` (both
read `public/locales/`, proven untouched by the step-1 porcelain checks — nothing for them to
observe); `pnpm test` in full (the other three jest projects cover none of the four touched files);
a `--check` over the two `.planning/todos/` files written in Task 2 (both are prettier-ignored —
`{"ignored":true,"inferredParser":null}` — so `--check` there would be vacuous; kept consistent by
hand-matching the surrounding corpus instead, per CLAUDE.md's formatter-check section).

## Task 2 — parent todo closed, EOS follow-up filed

Appended a `## Resolution` section to the parent todo recording: Option A taken on all three keys
by `quick-260927-p4a` on 2026-09-27; that it is free and already the shipped state; that Option B
was rejected on the 47-translation `gamelib` cost and the English-only-debt `translation` cost the
parent todo itself measured; and the one accepted copy cost (`setting.eosOverlay.updating` now
reads `'Updating...'` where its three siblings are full sentences). `git mv`'d it to
`.planning/todos/completed/`, frontmatter left as-is (`completed/` is exempt from the frontmatter
gate).

Filed
`.planning/todos/pending/2026-09-27-eos-overlay-updating-is-terser-than-its-three-sibling-status-lines.md`
proposing Option B for `setting.eosOverlay.updating` **only** (a distinct `gamelib.json` key for
the main status line at `AdvancedSettings/index.tsx:163`, leaving the shared key untouched for the
update-button label at `:472`). `severity: minor`, `platform: any`, `ready: human` — the code
change is trivial but shipping it means producing 47 real translations, so it needs a person's
decision, not desk-ready code.

`git mv` + `git add` + both gates + commit happened in one invocation (Task 2's commit
`c24ac48f6`), per the CLAUDE.md constraint on staged moves.

## What is NOT claimed

No user-visible text changed anywhere in this task. All four edited defaults were already dead
code — the catalog value was winning at every site before this edit. The only behavioural change
is to source-level self-consistency and to what a future `pnpm i18n` run on a modified catalog
could pick up.
