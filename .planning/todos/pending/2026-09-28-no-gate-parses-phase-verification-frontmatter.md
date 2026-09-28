---
created: 2026-09-28
title: 'No gate parses phase VERIFICATION/UAT frontmatter — Phase 38''s ledger was invalid YAML from 2026-09-23 while gsd-core audit-uat silently read 0 of its 11 open items'
found_during: quick 260928-raq
severity: medium
platform: any
ready: code
area: planning-records
files:
  - .planning/planning-frontmatter-gate.py
  - meta/runPlanningGates.py
  - .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
  - .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-VERIFICATION.md
  - .planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md
---

## Mechanism

`gsd-core`'s `audit-uat` reads a phase VERIFICATION/UAT file's frontmatter with a STRICT YAML
parse (`extractFrontmatter`, `@opengsd/gsd-core` 1.14.0). An unparseable frontmatter block comes
back as an EMPTY mapping, so `status` reads as `undefined`, the `human_needed` /
`gaps_found` gate that `parseVerificationItems` checks never opens, and the phase silently drops
out of `audit-uat`'s `by_phase` map — no error, no `parse_gap`, nothing that turns red. The only
frontmatter parse gate that exists in this repo today, `.planning/planning-frontmatter-gate.py`,
targets `STATE.md` and `ROADMAP.md` only (see its own header comment, which names this exact
failure mode for `STATE.md`). It does not walk `.planning/phases/*/*-{VERIFICATION,UAT,HUMAN-UAT}.md`
at all.

## Measured

- `38-VERIFICATION.md`'s frontmatter had been invalid YAML since `e09fbc652` (2026-09-23), when
  `score:` gained a colon-space sequence as an unquoted plain scalar, and `aaae8a1d2`
  (2026-09-23) added six unescaped double quotes inside `38-S08`'s double-quoted `result:`.
  Before this quick's repair, `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` had NO
  `38` key in `summary.by_phase` — all 11 open items were invisible. After the syntax-only
  repair (quick 260928-raq, Task 1), `by_phase['38']` reads 11 and `parse_gap_files` is 0.
- Census of `.planning/phases/*/*-{VERIFICATION,UAT,HUMAN-UAT}.md` frontmatter under js-yaml
  4.1.1, reproducible with
  `node .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs --census`:
  - Before this quick's repair: 78 ok, 2 with no frontmatter, 5 bad
    (`34.13-UAT.md`, `34.4.1-VERIFICATION.md`, `38-HUMAN-UAT.md`, `38-VERIFICATION.md`,
    `39-VERIFICATION.md`).
  - After the repair: 80 ok, 2 with no frontmatter, 3 bad (`34.13-UAT.md`,
    `34.4.1-VERIFICATION.md`, `39-VERIFICATION.md`).
- The three remaining bad files carry terminal statuses (`complete`/`passed`/`passed`), so
  `audit-uat` skips them by status even when they do parse. There is no audit consequence from
  those three today — but that is incidental to their current status field, not to anything
  that would catch a FUTURE file in an open state breaking the same way.

## Why medium

The one live instance (Phase 38) is fixed by this quick task. But `38-VERIFICATION.md` is edited
by nearly every Phase 38 quick task going forward — it is this project's entire deferred-hardware
backlog — and nothing stops the next hand-edit from reintroducing an unescaped colon or an
unescaped quote and silently dropping the whole phase from `audit-uat` again, undetected, exactly
as happened for five days between `e09fbc652`/`aaae8a1d2` and this quick task's discovery.

## Fix direction

Extend `planning-frontmatter-gate.py`'s TARGET POLICY. At minimum, cover any phase
VERIFICATION/UAT file whose `status` is `human_needed` or `gaps_found` — the two statuses where
a parse failure silently drops items from `audit-uat`'s open-item count. Include a REJECT
self-test built from this incident's two shapes (an unquoted plain scalar containing `: `, and a
double-quoted scalar containing an unescaped inner `"`), and raise `MINIMUM_EXPECTED_GATES` only
if a new gate file is added. CLAUDE.md's own position is that a gate is a deliberate decision on
its merits, not a reflex — the merits here are that the existing gate was written for this exact
failure shape, just scoped to `STATE.md` only.

## Also note

CLAUDE.md's UAT-section figure "419 outstanding items across 55 files" was measured while Phase
38 was invisible to `audit-uat`, so it excludes Phase 38 entirely. It is a dated measurement, not
a live one — re-measure with `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` before
quoting it elsewhere. Do not edit that CLAUDE.md figure from this todo.
