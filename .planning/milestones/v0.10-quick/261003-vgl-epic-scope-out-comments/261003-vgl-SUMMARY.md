---
status: complete
quick_task: 261003-vgl
title: Rewrite the stale Epic scope-out and platform-bullet comments
one_liner: Rewrote three stale source comments across two files so they state what spike 024 and the Linux/Windows embed spikes measured instead of what was predicted in 2026-08 -- Cloudflare Turnstile (not the Talon login fingerprint) for the Epic scope-out, and macOS+Linux shipped with Windows alone falling through for the platform bullet.
date: 2026-10-03
tags: [docs, webview, epic, platform, spike-024, comments-only]
dependency_graph:
  requires: []
  provides: [epic-scope-out-comment-matches-spike-024, platform-bullet-matches-linux-windows-spikes]
  affects: [src/frontend/screens/WebView/index.tsx, src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx]
tech_stack:
  added: []
  patterns: [comment-only-change-verified-by-strip-comment-identity-diff]
key_files:
  created: []
  modified:
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
decisions:
  - "No behaviour change anywhere -- every non-comment line in both files is byte-identical to the pre-task HEAD (3f7a1f306), confirmed by a strip-comment identity diff per task and once more at the end against the whole change."
  - "Platform bullet corrected per the plan's approved third finding: the embed ships on macOS AND Linux, Windows alone reaches the panel, and 027's live Windows 11 PASS is written as a discharged HARNESS question (38-E01), not as shipped Windows support -- no shipping rationale invented beyond the Phase 38 ledger pointer."
  - "Out-of-scope siblings (useStoreEmbedHost.test.tsx's CR-01 comment and MANIFEST.md's stale 024 row/run-count) were left untouched per the plan -- recorded there as a planner-authorized deferral, not re-litigated here."
actuals:
  tokens: 1755
  tasks: 2
  commits: 2
  plan_head_before: "3f7a1f306"
  plan_head_after: "860c2c1a6"
metrics:
  duration: "~25min"
  completed: 2026-10-03
---

# Quick Task 261003-vgl: Rewrite the stale Epic scope-out and platform-bullet comments — Summary

**One-liner:** Rewrote the `/store/epic` scope-out comment above `WebView/index.tsx`'s `store === 'epic'` guard, and both the `reason="epic"` and `reason="platform"` bullets in `WebviewUnavailablePanel`'s docstring, so all three state what spike 024 (Cloudflare Turnstile, WONTFIX-closed 2026-09-15) and the Linux/Windows embed spikes (025/026/028/029/027) actually measured, instead of the 2026-08-03 Talon login-fingerprint prediction and the stale macOS-only platform claim.

## What was built

1. **Task 1 (tracer)** — Rewrote the comment block above `if (store === 'epic')` in `src/frontend/screens/WebView/index.tsx` (lines 521-529 pre-edit). Named the Cloudflare Turnstile gate spike 024 measured, stated the REFUTED injected-globals/login-fingerprint theory (the fingerprint was present in the run that rendered AND the runs that were challenged), recorded the unattended runs 1-3 and interactive run 5 results, flipped the status to measured-and-closed (WONTFIX, 2026-09-15), cited the spike README by path, and kept all three honest limits (run 1 is not a capability question; the single-residential-IP confounder is unresolved; sign-in surfaces are deliberately untouched per D-07). D-05/D-08/REQ-40-12, the "nothing upstream stopped it" note, and the D-08 tile rationale all survive. Committed `6f9793a99`.
2. **Task 2** — Rewrote both stale bullets in `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx`'s docstring:
   - `reason="epic"` bullet: compressed version of Task 1's story — names the Turnstile gate, records the refutation, reads as WONTFIX-closed and permanent, cites the spike README, keeps the no-accusation restraint, deletes the pending-spike sentence and its `MANIFEST.md` pointer, keeps D-08's tile rationale.
   - `reason="platform"` (D-02) bullet: says the embed ships on macOS AND Linux (Linux attributed to the positioning todo's 2026-09-28 decision (a), reusing `index.tsx:506-507`'s own citation), says Windows alone now reaches the panel, replaces the falsified "only evidence is Mac-restricted" rationale with the Linux spikes (025/026, 028/029 for the GtkFixed reparent lever and 100/100 allocation reliability) and the Windows cross-check (027's live Windows 11 PASS on 2026-09-30), and reads that Windows run as a discharged harness question (`38-E01`) rather than shipped support. D-02, D-04, the Phase 38 ledger pointer, and the `016/017/018` citation all survive.
   Committed `860c2c1a6`.

Both commits are on branch `quick-261002-b63`, on top of the already-committed `261003-vgl-PLAN.md`, which was not re-committed:

```
6f9793a99 docs(261003-vgl): rewrite Epic scope-out comment with spike 024 measurement
860c2c1a6 docs(261003-vgl): rewrite epic + platform bullets in WebviewUnavailablePanel docstring
```

## Verification run per task (all green)

| Check | Task 1 | Task 2 |
|---|---|---|
| Positive gate tokens (`024-epic-store-…`, `turnstile`, `WONTFIX`) | present | present |
| Stale literals removed (`would reproduce` / `deliberately provisional`, `MANIFEST.md`, `macOS-only`, `Windows and Linux`) | `would reproduce` absent | all four absent |
| Platform-bullet-only tokens (`2026-09-28`, `027`) | n/a | present |
| Preservation anchors (`D-05`/`D-08`/`REQ-40-12`, `embeddable: false`/`StoresPanel`, `D-02`/`D-04`/`Phase 38`/`016/017/018`, `reason="platform"`/`TauriLoginPanel`/`CrossoverBadge`/`T-34.4.1-26`) | present | present |
| Comment-width gate | 0 lines over 99 cols | 0 lines over 80 cols (max line observed: 77) |
| Strip-comment identity diff vs `git show HEAD:<file>` | empty | empty |
| Disclosure gate (no dotted-quad IP / `Session ID` / `windowNumber` in added lines) | pass | pass |
| `npx prettier --check <exact path>` | pass | pass |
| `pnpm codecheck` | pass (7.7s-class) | pass |
| `npx jest --config src/frontend/jest.config.js src/frontend/screens/WebView` | 15 suites / 305 tests, all green | 15 suites / 305 tests, all green |

One mid-task correction: Task 2's platform bullet first draft still contained the literal `macOS-only` inside the new prose ("the only embed evidence is macOS-only is stale"); the width/identity/prettier/jest gates all passed regardless since those gates don't catch that specific string, but the explicit negative gate (`! grep -q 'macOS-only'`) caught it immediately. Reworded to "Mac-restricted" (matching the plan's own action-text wording for this exact point) and re-ran every gate to confirm.

## Whole-change verification (run once at the end, both files)

- Strip-comment identity diff against pre-task `HEAD` (`3f7a1f306`): empty for both files — `COMMENT-ONLY OK` for `index.tsx` and `WebviewUnavailablePanel.tsx`.
- `npx prettier --check` on both exact paths: pass (both report `{ "ignored": false, "inferredParser": "typescript" }` per the plan's own pre-measured fact, so the check is non-vacuous).
- `pnpm codecheck`: pass.
- `npx jest --config src/frontend/jest.config.js src/frontend/screens/WebView`: 15 suites / 305 tests, all green (unchanged from the plan's pre-measured baseline).

## Honest limits preserved (the point of the task)

- Run 1 rendered the Epic store fully (`bodyLen=89181`) — this was never a capability question.
- All five spike-024 runs share one residential IP; the IP/behaviour-reputation explanation for run 1 remains untested and unseparated from "the webview is blocked." Neither comment claims otherwise.
- Anything behind Epic sign-in was deliberately untouched (D-07) — neither comment implies the sign-in surface was probed.
- Neither comment writes a flat accusation that Epic blocks in-app browsing.
- The platform bullet does NOT claim Windows embedding is shipped: 027's live Windows 11 PASS is written explicitly as a HARNESS-only result that discharges `38-E01`'s question while Windows embedding remains unbuilt. No shipping rationale was invented — only the pre-existing Phase 38 ledger pointer and 027's own observation (synchronous `#[tauri::command]` webview creation hangs on Windows) are cited, and that observation is presented as an observation, not a decision.

## Out of scope — left exactly as the plan recorded

Two stale siblings of this same staleness were identified during planning and are recorded, not fixed, per the plan's explicit scope boundary (a planner has no authority to widen the file set beyond what was requested):

1. `src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` (~line 683) — a CR-01 rationale comment still says a navigated-into page "carries the root-caused Talon fingerprint." The test's four pinned properties are correct and unaffected; only the prose misattributes. Recommended follow-up: a quick task or a `minor`/`ready: code` todo.
2. `.planning/spikes/MANIFEST.md` (~line 267, ~line 383) — the 024 row still says "3 runs" and lists the human-click question as open; runs 4-5 answered it on 2026-09-15 and the README's own frontmatter already says RESOLVED. Prettier-ignored planning state; needs hand-matching, not a formatter.

Neither blocks anything downstream — confirmed in the plan, not re-derived here.

## Known Stubs

None. This is a comments-only change; no code paths, data sources, or UI surfaces were touched.

## Threat Flags

None beyond what the plan's own threat model already dispositioned. All four STRIDE entries (`T-VGL-01` Information Disclosure, `T-VGL-02` Tampering on the guard, `T-VGL-03` Repudiation on overclaim, `T-VGL-SC` package-install supply chain) were pre-identified and mitigated per the plan; no new surface was introduced. No package-manager installs occurred (`T-VGL-SC` stays vacuous by construction, as the plan anticipated).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-caught by the plan's own negative gate] Task 2's first-draft platform bullet re-introduced the literal `macOS-only`**
- **Found during:** Task 2 verify, running the explicit `! grep -q 'macOS-only'` gate
- **Issue:** The new prose describing the falsified "only evidence is Mac-restricted" rationale used the exact string `macOS-only` while explaining why that claim is stale, which is itself a literal match against the gate designed to prove the stale claim was removed.
- **Fix:** Reworded "the claim that the only embed evidence is macOS-only is stale" to "the claim that the only embed evidence is Mac-restricted is stale" — matches the plan's own action-text wording for this exact point ("Dropping the claim that the only embed evidence is Mac-restricted is the point of this edit").
- **Files modified:** `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx`
- **Commit:** `860c2c1a6` (fixed before this file was ever committed; no separate commit needed)

No other deviations. The plan was executed as written — no architectural changes, no missing-functionality additions, and no blocking issues beyond the one self-caught wording fix above.

## Self-Check: PASSED

- Both modified files confirmed present on disk via direct `[ -f ... ]` checks.
- Both commit hashes (`6f9793a99`, `860c2c1a6`) confirmed present via `git log --oneline --all | grep`.
- `git status --short` confirmed clean except `.planning/state.json` (pre-existing, unrelated) and this quick task's own untracked `.planning/quick/261003-vgl-epic-scope-out-comments/` directory.
- Strip-comment identity diff re-confirmed empty for both files against pre-task `HEAD` (`3f7a1f306`) in the whole-change verification pass, independent of per-task commit order.
