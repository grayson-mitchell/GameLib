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

## Resolution

**(a) What shipped.** Quick task `260928-sph` closed this todo in two code commits, both against
`.planning/planning-frontmatter-gate.py`: `feat(quick-260928-sph): walk phase VERIFICATION/UAT
ledgers in the frontmatter gate` (`b1849e908`) and `test(quick-260928-sph): cover ledger pins,
relabel, deletion, fence and floor in the frontmatter gate self-test` (`643787228`). The gate now
walks every phase VERIFICATION/UAT ledger under `.planning/phases/*/` and the archived
`.planning/milestones/*-phases/*/` — 89 files at the 2026-09-28 census (85 active + 4 archived,
`MINIMUM_PHASE_LEDGERS = 89`) — and STRICTLY parses each one's frontmatter through the same
`run_parser`/`extract_frontmatter` the STATE.md/ROADMAP.md check already used. A ledger that
parses as a mapping is OK. A ledger that does not parse is FAIL unless pinned in
`KNOWN_UNPARSEABLE_TERMINAL`, and even then only when a SHAPE READ (`read_status_line`, not a
second parser) of its own column-0 `status:` line still equals the pinned status — a pinned
file's status silently moving is exactly this incident's class, and it FAILS rather than
re-matching by luck. A ledger with no frontmatter fence at all is FAIL unless pinned in
`KNOWN_NO_FRONTMATTER`. Both pin tables are shrink-only: a pinned path that no longer exists, now
parses, or now has a fence FAILS with "stale pin -- remove it". The opening fence must also be
byte-exact (`---\n`/`---\r\n`), matching gsd-core's own `frontmatterRegion` rule. Ledger failures
join the SAME final `fail()` call the STATE.md/ROADMAP.md walk already used, so a ledger failure
alone still exits non-zero. Proven end-to-end against the real incident bytes: a copied tree with
the real pre-repair `38-VERIFICATION.md` (`git show 0801e07eb^:...`) spliced in turns red with a
`GATE FAILED:` line naming the file and reporting its shape-read `human_needed` status; the
unmodified copy stays green. The self-test grew from 18 to 38 lines (20 new `ledger:` cases:
5 in the first commit, 15 in the second), covering both hash-pinned incident shapes, the
repaired form, every pin failure mode (stale-by-nonexistence, stale-by-now-parsing,
stale-by-now-fenced, pinned-flip, status-line-removed, ambiguous-status), fix-by-relabel,
fix-by-deletion, the inexact-fence divergence, not-a-mapping, and the scan-level anti-vacuity
floor.

**(b) `MINIMUM_EXPECTED_GATES` stays 12.** No new `*-gate.py` file was added — the fix direction
above and DD-1 both call for extending the existing gate's TARGET POLICY rather than adding a
tenth-generation gate file, so `meta/runPlanningGates.py` was not touched and its floor is
unchanged.

**(c) The three terminal files were pinned, not repaired, and that costs nothing.**
`34.13-UAT.md` (`status: complete`), `34.4.1-VERIFICATION.md` (`status: passed`), and
`39-VERIFICATION.md` (`status: passed`) remain exactly as they were — visible by name in the
gate's `NOTE:` output, but unedited. `audit-uat` never opens a VERIFICATION file at a terminal
status regardless of whether its frontmatter parses, and a UAT file's items are read from the
body regardless of frontmatter status at all (`uat.cjs:137-139,155`) — so repairing these three
would have bought no audit visibility that pinning does not already provide, while carrying real
risk of misdescribing content nobody asked this task to touch.

**(d) The measured correction to this todo's own Mechanism/Measured narrative.** This todo
described the incident as one defect. Splicing the real pre-repair bytes and testing each half in
isolation shows it was two, and they did not contribute equally: the score-only defect (the
unquoted plain `score:` scalar containing `2026-09-23: `, introduced by `e09fbc652`) still reads
gsd-core status `human_needed` when spliced alone, because gsd-core's own
`loadWithAmbiguousColonRepair`/`repairAmbiguousColonValues` retries a failed parse by
double-quoting column-0 plain values containing a colon-space — it did NOT, by itself, hide Phase
38. The quote-only defect (the six unescaped `"` characters `aaae8a1d2` added inside `38-S08`'s
double-quoted `result:`, an INDENTED scalar) reads `undefined` when spliced alone — gsd-core's
repair never touches indented lines. So `aaae8a1d2`'s quotes, not `e09fbc652`'s colon, are what
actually hid the phase from `audit-uat`. Both shapes are still rejected by this gate: it enforces
the strict property (parses under js-yaml 4, the same parser gsd-core itself uses before any
repair), not "parses under a consumer's repair crutch". This is also why `39-VERIFICATION.md` —
which carries the column-0 shape alone — stays a pinned NOTE rather than being promoted to an OK:
it is rescued by gsd-core today, but the gate does not loosen to match a consumer's repair path.

**(e) Scope was widened past this todo's literal wording.** The Fix direction above named
`.planning/phases/*` files; the shipped walk also covers the archived
`.planning/milestones/*-phases/*/` directories, because `uat.cjs:84-123` scans those archives too
— a future milestone archive move must not silently shrink the walk's coverage.

**(f) `check_divergence_shapes` (the STATE.md/ROADMAP.md check) is deliberately NOT applied to
ledgers.** Measured: it would convict 10 ledgers (19 problems) — including
`38-VERIFICATION.md`'s own repair, which uses exactly the backslash-escaped-quote shape that
check exists to reject under the RETIRED get-shit-done-cc hand-rolled parser. gsd-core reads
ledgers through vendored js-yaml (`frontmatter.cjs:33`), for which that shape and a `|` block
scalar read identically to this gate's own parse. Applying that check to ledgers would be a gate
convicting correct code.

**(g) Stated limits, not implemented (DD-9).** gsd-core's own `parseGuardedYamlRegion` refuses
YAML anchors, aliases, and the U+E000 sentinel; this gate's js-yaml accepts them. No ledger uses
any of the three today (measured), and all 80 active parseable ledgers read the same `status`
under both parsers — so this is recorded as a limit in the gate's docstring rather than closed,
matching the same honesty convention the STATE.md/ROADMAP.md check's own "THE LIMIT" section
already used.

**(h) Live audit-uat re-measure.** `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw`
after this task's commits: `total_items` 429, `total_files` 56, `parse_gap_files` 0,
`by_phase['38']` 10 — identical to the planning-time baseline, as expected: this task edited no
ledger, only the gate and the todo corpus. CLAUDE.md's "419 outstanding items across 55 files"
figure was left untouched, per the todo's own instruction above — it remains a dated measurement
from before Phase 38 was ever visible to `audit-uat`, not a live one.
