---
phase: 42-deferred-linux-host-uat-gates
verified: null
status: human_needed
score: N/A — collection phase, no must-haves. 5 items as of 2026-09-06 (plan 38-01, Task 2): 38-W05, 38-S04, 38-S10, 38-S12 relocated from Phase 38, plus 38-S17 minted from the 38-S16 split. Confirmed at the tool: `audit-uat` reports by_phase["42"] == 5.
audit_tool_note: >
  `status` MUST stay `human_needed`. `gsd-sdk query audit-uat` admits a VERIFICATION.md when
  status is `human_needed` OR `gaps_found`, but `parseVerificationItems` only emits items when
  status === 'human_needed' — so `gaps_found` is admitted and then always yields ZERO items, and
  the phase disappears from the audit entirely. Verified live on Phase 34.1 (2026-08-13):
  switching that field dropped it from 10 open items to 0. The tool also counts EVERY entry in
  `human_verification` regardless of any `result:` field, so a discharged item must be MOVED to
  `human_verification_discharged` rather than annotated in place. Both failure modes are silent.

  THE `id:` FIELD DOES NOT SURVIVE INTO THE AUDIT OUTPUT. `audit-uat` emits each item with a
  POSITIONAL integer as `test:` and the `test:` prose as `name`; the `id:` is dropped entirely, so
  there is no key to join the audit back to this file except the prose. Positions do not track
  ids, because this array is in ARRIVAL order, not id order. CROSS-REFERENCE BY THE `test:`
  PROSE, NEVER BY POSITION, and never quote an audit position as if it were an ID.

  THIRD FAILURE MODE — THE PHANTOM-ITEM HAZARD (recorded in STATE.md under quick `260823-pzq`):
  with `status: human_needed` and an EMPTY `human_verification` array, `parseVerificationItems`
  falls through to a BODY SCRAPE looking for a `## human_verification` heading and reports that
  section's table rows as PHANTOM items. A phase enters the report only when `items.length > 0`.
  This file therefore carries NO `## human_verification` (or `## Human Verification`) heading
  anywhere in its prose body, by construction, so it stays correctly invisible to the audit until
  items are populated — that is the intended intermediate state while `human_verification: []`,
  not a defect.
purpose: >
  A collection phase. Every item here was relocated from Phase 38 (or, for `38-S17`, minted by a
  split of `38-S16`) because it can only be observed on a Linux host — Phase 38 narrowed on
  2026-09-06 (plan `38-01`) to Windows-plus-controller items only, per relocation rule (1): the
  destination must exist in ROADMAP.md BEFORE anything is relocated into it. Phase 34.9 routed 8
  items to a phase that was never in ROADMAP.md and six of them dangled 9-11 days while every
  gate read `unmapped 0` — this phase exists before Task 2 of plan 38-01 relocates anything into
  it, so that never happens again. Ships no code.

  THE HARDWARE IS OWNED AND AVAILABLE. A Linux machine is on hand; the only cost is the machine
  switch, not an acquisition.
deferral_note: >
  The `blocked_by:` KEY NAME IS HISTORICAL, inherited from `38-VERIFICATION.md`. Its values name
  the COST of running an item (a machine switch, or a machine switch plus a second-Steam-library
  setup step), never an unfalsifiable "needs hardware this project doesn't have" claim. Read
  `blocked_by` as "deferral cost", not as "blocker".
created: 2026-09-06
relocation_rules: >
  Inherited in substance from `38-VERIFICATION.md`, which minted them:
  (1) The destination must exist in ROADMAP.md BEFORE an item is relocated into it — Phase 34.9
  routed 8 items to a phase that never existed and every gate read green.
  (2) Every item names a `platform_gate` as a source-level expression, never a prose blocker.
  (3) Relocation is two-way: the origin phase keeps a `human_verification_relocated` receipt
  naming this phase and the item ID, and every item here names its origin.
  (4) Items are split at their branch boundary, never compounded. A compound item resolves to a
  single pass/fail and the un-run half disappears.

human_verification:
  - id: "38-W05"
    test: "Smoke-launch the CI-produced LINUX installer artifact. Download the AppImage from the `release-tauri.yml` workflow run for the commit under gate, mark it executable, and launch it."
    expected: "The AppImage launches directly (no separate install step, per D-11/D-12's AppImage-only decision). A window appears, and the process survives at least 10 seconds without crashing — the same bar `35-LIVE-GATE.md` criterion 1 applies to the macOS artifact."
    why_human: "Requires a Linux host. Same gap as 38-W04: `release-tauri.yml` builds and uploads the AppImage but never executes it."
    blocked_by: "machine switch -- boot the Linux machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src-tauri/tauri.conf.json `bundle.targets` includes `appimage` — an AppImage binary cannot execute on macOS at all; this is a binary-format boundary, not an unreached code branch."
    origin_phase: "35"
    origin_item: "35-19 Task 2, option-c"
    reduction_note: >
      THIS ITEM IS A RECORDED SCOPE REDUCTION AGAINST D-16, NOT A ROUTINE DEFERRAL. Same reduction
      as 38-W04, for the Linux leg specifically — D-16 said "artifacts plus a smoke launch"; Phase
      35 closed on artifact production alone for this leg. See `35-LIVE-GATE.md`'s Windows/Linux
      disposition section and `REQUIREMENTS.md` REQ-35-20.
    prior_state: >
      Never attempted. Same `35-PREFLIGHT.md` OQ-4 / D-00c basis as 38-W04.
    relocation_history: >
      Filed in Phase 38 on its original date (see origin_phase/origin_item above);
      relocated to Phase 42 on 2026-09-06 by plan 38-01 under D-38-08, reason "one host
      per item; Phase 38 retains Windows plus controller only".
  - id: "38-S04"
    test: "Steam quick install on a LINUX host, tauri runtime — native installs OFF, or ON with <=1 library. Click the PRIMARY half of Install."
    expected: "NOTHING opens — no dialog, modal, overlay or picker, no flash-and-close."
    why_human: "Requires a Linux host. On Linux the platform row does not render at all (D-18), a branch unreachable on macOS."
    blocked_by: "machine switch -- boot the Linux machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-QUICK-LINUX / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).
    relocation_history: >
      Filed in Phase 38 on its original date (see origin_phase/origin_item above);
      relocated to Phase 42 on 2026-09-06 by plan 38-01 under D-38-08, reason "one host
      per item; Phase 38 retains Windows plus controller only".
  - id: "38-S10"
    test: "Section-gating matrix row 7 on a LINUX host, tauri runtime — native installs OFF, or ON with <=1 library."
    expected: "The platform row does NOT render at all (D-18); library dropdown, wine section and free-space line ALL ABSENT; content-light notice PRESENT (D-20/Q6). All four checked independently."
    why_human: "Requires a Linux host. 'Platform row absent' is a distinct state from 'platform row present but read-only' and cannot be produced on macOS or Windows."
    blocked_by: "machine switch -- boot the Linux machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-7 / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).
    relocation_history: >
      Filed in Phase 38 on its original date (see origin_phase/origin_item above);
      relocated to Phase 42 on 2026-09-06 by plan 38-01 under D-38-08, reason "one host
      per item; Phase 38 retains Windows plus controller only".
  - id: "38-S12"
    test: "Section-gating matrix row 8 on a LINUX host, tauri runtime — hasChoice (native installs ON and >1 library)."
    expected: "The platform row does NOT render (D-18); library dropdown PRESENT; wine section ABSENT; free-space line PRESENT. All four checked independently."
    why_human: "Requires a Linux host AND two registered libraries. `hasChoice` = native Steam installs ON **and** >1 registered library. `getSteamLibraries()` (src/backend/utils.ts:671) filters candidates through `existsSync`, so library COUNT is what the gate reads."
    blocked_by: "machine switch + setup -- boot the Linux machine (OWNED and available), then register a SECOND Steam library on it"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-8 / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).
    relocation_history: >
      Filed in Phase 38 on its original date (see origin_phase/origin_item above);
      relocated to Phase 42 on 2026-09-06 by plan 38-01 under D-38-08, reason "one host
      per item; Phase 38 retains Windows plus controller only".
  - id: "38-S17"
    test: "Content-light notice COPY and container, tauri runtime — scored on matrix row 7 (Linux) only."
    expected: "The notice renders in an `.infoBox`, NOT in ThirdPartyDialog's `.noticeIcon`/`.noticeInfo`. Copy must match the catalogue EXACTLY, per branch: native installs OFF -> gamelib:steam.install.contentLightNotice; native installs ON with <=1 library -> gamelib:steam.install.contentLightSingleLibraryNotice. Verify against public/locales/en/gamelib.json, never by eye."
    why_human: "Requires a Linux host, since the row is scored on matrix row 7."
    blocked_by: "machine switch -- boot the Linux machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow`'s `'absent'` branch requires `input.hostPlatform` to be NEITHER `'darwin'` NOR `'win32'` (i.e. Linux, or any unrecognised host); on macOS or Windows this branch is unreachable by construction."
    origin_phase: "34.13"
    origin_item: "G-D20-Q6-COPY / tauri (34.13-UAT.md) - Linux row-7 half"
    split_from: "38-S16"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's
      only host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate
      close-out once every macOS-runnable row was resolved (44 PASS / 0 FAIL). Minted
      2026-09-06 by plan 38-01 (D-38-11) as the Linux row-7 half of 38-S16, which stays in
      Phase 38 narrowed to the Windows row-5 half only.

human_verification_discharged: []
---

# Phase 42 — Deferred Linux-host UAT gates

This phase holds UAT items that can only be observed on a Linux host. It ships no code.

**The frontmatter above is the source of truth**, because it is what `gsd-sdk query audit-uat`
reads. This prose section is for narrative only; never record a result here alone.

## How to close an item

1. Run it and record the observation with a verbatim artifact — a log line, not a recollection.
   Prefer instrumenting the branch under test and reading the emitted value over asking an
   operator what they saw.
2. **Prove the branch was armed** before recording a pass. An item whose gate never executed is
   indistinguishable, in every green result, from one that passed.
3. Move the entry from `human_verification` to `human_verification_discharged`. Do not annotate
   it in place — the audit counts array membership and ignores any `result:` field.
4. Update the origin phase's `human_verification_relocated` receipt with the outcome, so the
   origin's record does not rot. A park is a promise with no receipt unless someone walks back.

## Adding to this phase

Append to `human_verification` with an `id`, an `origin_phase`, an `origin_item`, and a
`platform_gate` written as a source-level expression. Leave the matching
`human_verification_relocated` receipt in the origin phase in the same change — one-way
relocation is how items get orphaned.
