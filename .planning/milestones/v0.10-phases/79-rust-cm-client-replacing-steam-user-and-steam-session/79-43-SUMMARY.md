---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 43
subsystem: docs / deletion gate
tags: [docs, gate, steam-cm]
requires: [79-42]
provides: [CF-01 deletion pin, AM-01, AM-02, TODO-084]
key-files:
  created:
    - src/backend/__tests__/steamCmPortComplete.test.ts
  modified:
    - .planning/research/STEAM-STACK.md
    - CLAUDE.md
    - src-tauri/crates/README.md
  moved:
    - .planning/todos/pending/2026-11-07-spike-refresh-via-running-steam-client.md -> completed/
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 43: Pin the CM deletion and amend the stack docs Summary

`steamCmPortComplete.test.ts` pins the removal of steam-user, steam-session, lzma and zstddec, and STEAM-STACK.md, CLAUDE.md and the crates README now describe the Rust CM client (steam-vent in `gamelib-steamcm`) instead of the frozen npm stack.

## Commits
- 7dd6e3c8d test: port-complete gate
- b0d6239ce docs: STEAM-STACK, CLAUDE.md, crates README section 12, todo closed

## What was done
- **Gate** (24 cases): 13 DELETED paths absent; FORBIDDEN needles absent from `src` and `meta` after comment stripping; KEPT fixtures and crate manifests present; the five packages absent from package.json; no lzma/steam-user patch in pnpm-workspace.yaml; anti-vacuity (scanner flags a synthetic `from 'steam-user'`, ignores the same in a comment; scan covers >= 500 files).
- **STEAM-STACK.md**: new "Amended by Phase 79" section (steam-vent rev 767481ad, Web API sign-in with the RUSTSEC-2023-0071 justification, reqwest, Mac owned-apps path shipping OFF, wrap retired per D-09 PASS, ring provider installed in main()), a "Why the freeze was lifted" list over spikes 071a-c, 072-074, 077, 080-082, 084, 085, and steamroom and steam-client-lib rows in the rejected table. The old text is kept as a labelled historical record.
- **CLAUDE.md**: "Technology Stack (Steam)" short version rewritten; every line naming steam-user or steam-session carries retired/replaced. No account-name display is documented (Accounts tile shows none, by design). The check passes on CLAUDE.md and fails on the pre-phase `c9d010f65` version.
- **crates/README.md**: section 12, the CM client as the fourth worked example.
- **Todo**: moved to completed/ with a resolution section.

## Deviations from Plan

**1. [Rule 1 - Bug] FORBIDDEN matching.** Plain substring matching hit 22 legitimate files ('steam-user' is also a boot step and manager id, `sidecar_send` contains `_send`, `lzma` appears in the SEA tests). Package names are matched as module specifiers (from/require/import()/mock), `LoginSession` by word boundary and `_send` only when not preceded by an identifier character. `__tests__` directories are skipped, as in the steamfiles gate. The synthetic anti-vacuity cases still prove the scanner can fail.

**2. Todo resolution text.** The plan's line said Refresh uses the running Mac Steam client with CM fallback. That is not what ships (the Mac path is OFF by default, and Refresh uses Rust CM), so the resolution says that instead and cites the Spacewar todo and UAT-B item 13.

**3. Rust description.** The README and stack text only restate facts found in the 79 summaries, carry notes and spike READMEs. No Rust was touched.

## Verification
- `pnpm exec jest src/backend/__tests__/steamCmPortComplete.test.ts`: 24 passed.
- `pnpm planning-gates`: 12/12. Prettier check passes on the test, CLAUDE.md and the README (.planning files are prettier-ignored, so no formatter check there).
- Pre-push chain plus `gameinfo-narrowing-ceiling` exit 0 on a `git archive HEAD` export.

## Self-Check: PASSED
