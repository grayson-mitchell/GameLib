---
phase: 71-rust-shell-module-decomposition
verified: 2026-11-09T00:00:00Z
status: gaps_found
score: 6/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "D-10: no assertion loses coverage when tests are co-located; production-source readers never let a test-module call satisfy a production pin"
    status: partial
    reason: "WR-01 confirmed on the live tree. sidecarShutdownFlagSource.test.ts:85-91 reads code('sidecar.rs') (whole file) and asserts indexOf('on_sidecar_eof(', drain) > drain. sidecar.rs now has test-module calls at lines 698/707/716/717 (moved in 71-16), so deleting the production call at line 645 would still pass. The D-01 EOF-ordering regression pin is vacuous."
    artifacts:
      - path: "src/backend/__tests__/sidecarShutdownFlagSource.test.ts"
        issue: "pin reads unstripped sidecar.rs; satisfied by co-located tests"
    missing:
      - "Read stripRustTestModules(sidecar.rs) and bound the search to the reader fn body (fix in 71-REVIEW WR-01)"
      - "Audit other readTauriShellFile/include_str! callers whose target gained mod tests in 71-16/17 for indexOf(x, from) presence/order pins"
---

# Phase 71: Rust shell module decomposition Verification Report

**Phase Goal:** No multi-thousand-line Rust shell modules; windows, embeds and login surfaces split along seams, mechanical moves only.
**Status:** gaps_found (one narrow, test-only gap; production goal achieved)
**Re-verification:** No (initial)

No REQUIREMENTS.md exists; decisions D-01..D-15 in 71-CONTEXT.md were used. PLAN `requirements:` IDs all resolve to CONTEXT decisions: D-01 (Phase 67, confirmed: 0 `transport-mirror:` markers in sidecar.rs or anywhere in src-tauri/src; ipc_contract.rs generated), D-02 (superseded by 72-01; ubuntu-latest leg present and green), D-03..D-15 each claimed by one or more plans. D-06 handled by two todos (humble_login_open / clear_cookies). No orphaned IDs.

## Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Targets split along seams: store_embed.rs 4,623 -> 35 lines + store_embed/{state,policy,open,layout,controls}.rs; login_window.rs 3,339 -> 79 lines + 9 children; macos_epic_embed.rs 2,089 -> 249 + surface.rs/nav_delegate.rs | VERIFIED | `wc -l` on live tree; largest children state.rs 1,244 total (<1,000 non-test per sizes), sheet.rs 959 non-test |
| 2 | main.rs reduced / dispatcher extracted | VERIFIED (with caveat) | rust_dispatch.rs 77 lines, 45 one-line arms, no `_ =>`. main.rs 7,886 -> 3,962 total / 1,877 non-test; `fn main` is a single 1,175-line fn (D-06-style rationale, todo 2026-11-09-split-fn-main-setup-into-named-steps.md) |
| 3 | "No multi-thousand-line modules" | VERIFIED under D-13 (tests excluded), WARNING otherwise | Non-test: max is main.rs 1,877, single_instance.rs 1,620, tray.rs 1,159, surface.rs 1,019. Total lines incl. tests: main.rs 3,962, single_instance.rs 2,387, tray.rs 1,688 (multi-thousand). D-13 explicitly excludes co-located tests and permits justified overages; reasons recorded (71-14 for surface.rs; todos for main.rs, single_instance.rs, tray.rs). single_instance/tray were never phase targets. |
| 4 | Mechanical moves, no behaviour change | VERIFIED | Independent code review (71-REVIEW) byte-compared all 45 arm bodies and nested test fns: no production defect. `cargo test --bin gamelib-shell` re-run by me: 445 passed / 0 failed / 2 ignored, matching 71-18 and CONTEXT baseline direction (only 4 Wave-0 tests added) |
| 5 | Windows/Linux compiles via CI | VERIFIED | `gh run view`: 42443435105 (W0), 42445589877 (W1), 42469036864 (W2+3, on 05bf973bf), 42507609410 (W4), 42511011506 (W5, on 3025f9240) all conclusion success with windows/macos/ubuntu legs green |
| 6 | Phase 62 transport-mirror markers survive or removed only after Phase 67 contract | VERIFIED | 0 markers; ipc_contract.rs present (Phase 67 generated contract), `pnpm check:ipc-contract` up to date per 71-18 |
| 7 | D-10: co-located tests do not erode source-text pins | PARTIAL (gap) | Production reader + guards exist and needle counts were recorded, but WR-01 shows one pin became vacuous (see gap). |

**Score:** 6/7

## Deviations assessed

- **Wave 2/3 CI ordering (D-03):** live checks ran before CI went green because of a GitHub release-download outage; operator authorized; CI later green on 05bf973bf (all three legs, attempt 10). Process deviation only, final state satisfies the gate. Accepted, not a gap.
- **Wave 2 PENDING in 71-11:** resolved by the above run.
- **Live checks (D-14):** recorded as operator-approved per wave, including final Wave 5 check with title bar OFF and ON. I cannot re-observe these; they are operator attestations (see Human verification).

## Review warnings vs must-haves

- **WR-01:** undermines D-10 coverage guarantee -> GAP (above). Test-scaffolding only; production unaffected.
- **WR-02** (`#[cfg(all(test, ...))]` not stripped; `terminate_reply_tests` at terminate_veto.rs:323 counted as production): confirmed that exactly one such module exists. It makes the production reader slightly over-inclusive (can only hide an absence-violation, not create vacuity today). Non-blocking WARNING; fix before more cfg-stacked test modules appear.
- **WR-03** (guards narrower than names; longRunningChannels test-region locator spans production): WARNING. Guards do their documented job for current callers; hardening recommended. Not a must-have failure by itself.

Fixing WR-01 should be done together with the WR-02/WR-03 hardening pass (single small test-only plan via `/gsd-plan-phase 71 --gaps`).

## Other checks

- Full jest 8 failures: 2 known (WR-07 `.title(`, C3 `.spawn()` count) + 6 documented. 5 shown failing at pre-phase HEAD; x86CallbackWineHarness is unproven-environmental (touches no shell code). Not attributed to this phase; I did not re-run jest.
- Debt-marker/anti-pattern scan: moved code is verbatim; no new TBD/FIXME introduced observed by review. Deferred handler splits tracked as todos (pending, with frontmatter).
- VALIDATION.md: status complete, nyquist_compliant true, approved 2026-11-09.

## Human verification (operator-attested, not re-observed)

Final live check in `pnpm tauri:dev` (store embed, Humble/GOG/Amazon/Epic sign-in, Epic embed, tray, dialogs, single-instance, Cmd+Q, keyring relaunch; title bar OFF and ON) was approved by the operator. Re-confirmation is optional; no new UI changes since.

## Gaps Summary

Production goal is achieved: all four oversized files are decomposed, behaviour-preserving, CI green on three platforms, 445 tests pass locally. The one gap is a test-quality regression introduced by the phase itself (WR-01): the sidecar EOF-ordering pin no longer guards production. Remaining over-size files are justified under D-13 with todos.

_Verified: 2026-11-09_
_Verifier: Claude (gsd-verifier)_
