---
slug: stale-signin-row-remount
status: resolved
trigger: "Library sign-in rows do not re-derive a mid-session verdict=cleared until the screen remounts (F-49-R1-2)"
created: 2026-10-10
updated: 2026-10-10
related_todo: .planning/todos/pending/2026-10-10-library-sign-in-rows-do-not-rederive-a-mid-session-clear.md
---

# Debug: Library sign-in row does not clear on a mid-session `cleared` verdict

## Symptoms

- **Expected behavior:** When a store's sign-in probe verdict transitions to `cleared` mid-session, the Library screen's sign-in notice row for that store disappears promptly (within a render cycle of the verdict arriving), without requiring navigation away and back.
- **Actual behavior:** A `cleared` verdict arrives (e.g. Steam at 09:50:42 with an empty flag census) but the Library continued rendering the expired/stale sign-in row for ~70s. The row only vanished after navigating to another tab and back (a remount). Launch 3 showed the same shape for Epic, though that instance is confounded by a separate finding (F-49-R1-1).
- **Error messages:** None — silent stale render, no console/log error.
- **Timeline:** First observed in `49-LIVE-GATE.md` § Run 1, Launch 9 (2026-10-09, macOS live gate for Phase 49).
- **Reproduction:** (1) Get a store (Steam) into an expired/sign-in-required state so the Library shows its sign-in notice row. (2) Clear the sign-in (re-auth) so the backend verdict becomes `cleared`. (3) Observe the Library screen without navigating away — the stale row persists for an extended period. (4) Navigate to another tab and back — the row disappears immediately.

## Suspected root cause (from orchestrator code-read — verify, don't assume)

- `LibrarySignInNotice/index.tsx` derives rows from context state on every render, so the component itself is not obviously the problem — the context's sign-in state is suspected stale.
- Suspect `signInProbeOutcomes` (or whatever persisted-flag read backs it) in `GlobalState.tsx` is only (re-)read/refreshed at mount, not when a `cleared` verdict event arrives mid-session — so the context value stays stale until a remount forces a fresh read.
- `librarySignInRows.ts` likely just maps context state to rows; verify whether it does any memoization that could itself cause staleness independent of the context value.

## Fix goals (acceptance)

- A mid-session `cleared` verdict removes the corresponding Library sign-in row without requiring the user to navigate away and back.
- No regression to the other verdicts/outcomes (`expired`, `unknown`, etc.) that the sign-in rows already render correctly.
- Add regression test coverage for the mid-session cleared-verdict transition.

## Current Focus

reasoning_checkpoint:
  hypothesis: "runSignInProbePass (pass.ts) calls publishSignInProbeOutcomes() exactly once, after Promise.all across all five stores settles — so a store whose own verdict resolves quickly (Steam at 26.3s in Launch 9) has its renderer-visible update gated behind whichever sibling probe in the same pass is slowest (bounded at 45s each, or longer when gated on a human Keychain click), even though that store's persisted flag and in-memory outcome were already correct the moment ITS OWN probe settled."
  confirming_evidence:
    - "pass.ts:237 — `publishSignInProbeOutcomes()` is called once, after the `Promise.all` over all `stores.map(...)` entries, not inside the per-store task."
    - "pass.test.ts:626-631 pins this exact behavior: 'publishes the outcome map exactly once per pass' — confirms it is deliberate, not accidental, and therefore a real design gap rather than a one-off typo."
    - "verdict.ts decide()/applySignInVerdict and electron_store.ts's TypeCheckedStoreBackend.set/delete->notifyStoreChanged fire SYNCHRONOUSLY per-store, well before the pass's Promise.all resolves — so the persisted flag (steamConfigStore.credentialsMissing) and renderer snapshot (tauriTransport.ts's STORE_CHANGED_CHANNEL listener) are already correct at 'steam verdict=cleared' time, confirming the data is right and only the React re-render trigger is late."
    - "signInInputs.ts's collectSignInInputs reads steamConfigStore.get_nodefault('credentialsMissing') fresh on every call (never cached) — so the only missing piece is something causing LibrarySignInNotice to re-render and re-invoke that read."
    - "GlobalState.tsx:1716-1721 handleSignInProbeOutcomes IS a live mid-session push listener (setState on every push), which REFUTES the original mount-only hypothesis recorded at session start."
    - "49-LIVE-GATE.md Launch 9: 'steam verdict=cleared' logged, 'flags census empty' (flag already correct), yet the stale row rendered ~70s before a remount cleared it — consistent with Steam (26.3s, gated on a delayed Keychain Allow click) finishing well before a slower sibling probe in the same 5-store Promise.all, deferring the one-shot publish to the slowest of the five."
  falsification_test: "If Steam were provably the LAST (slowest) of the five probes to settle in that pass, the aggregate publish would fire within microseconds of 'steam verdict=cleared' and the row would clear almost immediately — not 70s later. No raw launch-9.log is available in-repo to check the other four stores' individual elapsed times directly, so this specific ordering claim is inferred, not independently timestamped; see blind_spots."
  fix_rationale: "Move the publishSignInProbeOutcomes() call inside the per-store async task, immediately after recordSignInProbeOutcome succeeds, instead of once after the whole Promise.all. This makes each store's own verdict reach the renderer the instant it is known, independent of how long sibling probes take — fixing the root cause (publish cadence) rather than the symptom (adding a remount-equivalent timer/poll on the renderer side)."
  blind_spots: "Cannot verify from available evidence which of the other four stores (legendary/gog/nile/humble) was the actual slowest probe in Launch 9's pass, since the raw gamelib-launch-9.log is not committed to the repo (only excerpted in 49-LIVE-GATE.md). The ~70s figure is consistent with the batching theory but not independently proven down to the specific sibling store. Also did not live-reproduce the scenario (would require a macOS Keychain-gated multi-store login state) — relying on static code tracing plus the live-gate record."
  candidate_causes:
    - "code: runSignInProbePass's single end-of-Promise.all publish site (pass.ts:237) — the confirmed cause."
    - "config/environment: none implicated — the persisted flag writes and STORE_CHANGED_CHANNEL snapshot patch are correct regardless of platform/config; a Keychain dialog delay is what WIDENED the window in Launch 9's specific case but is not itself a defect."
  and_gate: "No — a single code-category cause (the batched publish site) fully explains the symptom on its own; the Keychain delay is a situational amplifier (makes the window wide enough to observe), not a second required condition. The bug reproduces with ANY spread between the fastest and slowest probe in a pass, Keychain or not."
next_action: none -- human confirmed on a real macOS run (2026-10-10): "it cleared right away, no remount needed." Session resolved; proceeding to archive.

## Evidence

- timestamp: 2026-10-10
  checked: src/backend/signInProbe/outcomes.ts, verdict.ts, pass.ts
  found: publishSignInProbeOutcomes() sends the whole outcome map over the 'signInProbeOutcomes' IPC channel. It is called from noteSignInSucceeded/noteSignedOut individually (per-event), but from runSignInProbePass only ONCE, after Promise.all over all logged-in stores' probes resolves (pass.ts:237).
  implication: a store's own verdict (recorded earlier in the same pass, e.g. steam at t=26s) cannot reach the renderer until every other store in the same pass has also settled, however long that takes (up to 45s bound each).

- timestamp: 2026-10-10
  checked: src/backend/electron_store.ts (TypeCheckedStoreBackend.set/delete), src/backend/storeChangeNotifier.ts, src/preload/tauriTransport.ts (ensureChangeListenerAttached/applyFieldChange)
  found: a persisted flag write (e.g. steamConfigStore.delete('credentialsMissing') inside verdict.ts's decide()) synchronously calls notifyStoreChanged, which — when a notifier is installed — pushes a STORE_CHANGED_CHANNEL frame that the renderer's tauriTransport.ts patches into its in-memory snapshot immediately (deleteAtPath/setAtPath). This is independent of, and much faster than, the signInProbeOutcomes publish.
  implication: the underlying data (the flag the Library row derivation reads) is already correct within milliseconds of a store's own verdict — the staleness is entirely about what triggers React to re-render and re-read it, not about the flag's correctness.

- timestamp: 2026-10-10
  checked: src/frontend/helpers/signInInputs.ts (collectSignInInputs), src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx
  found: collectSignInInputs reads steamConfigStore.get_nodefault('credentialsMissing') synchronously and fresh on every call — no memoization. LibrarySignInNotice calls it inline during render, not in an effect, so ANY re-render of this component re-derives the current row correctly.
  implication: a remount "fixes" the stale row purely because mounting forces a fresh render/fresh collectSignInInputs call — it does not do anything the normal render path couldn't also do, if only something had triggered that render sooner.

- timestamp: 2026-10-10
  checked: src/frontend/state/GlobalState.tsx lines 1713-1721 (handleSignInProbeOutcomes) and 1942-1955 (mount-time getSignInProbeOutcomes pull)
  found: GlobalState DOES subscribe to a live 'signInProbeOutcomes' push (this.setState on every push, not just a one-time mount pull). This directly refutes the debug session's originally recorded hypothesis ("only refreshed at mount").
  implication: the mount-only theory is wrong; the actual gating mechanism is the PASS's publish cadence (once per pass, not once per store), not an absent live subscription.

- timestamp: 2026-10-10
  checked: src/backend/signInProbe/__tests__/pass.test.ts lines 1-18, 625-631
  found: the pass's own test suite explicitly pins "publishes the outcome map exactly once per pass" (D-08) as an intentional invariant, with a header comment calling out "publish once" as part of the pass's contract under test.
  implication: the once-per-pass batching is deliberate (not a slip), so fixing this bug requires a conscious, acknowledged change to that invariant (publish once per resolved store instead), with the test updated to match the new, corrected contract.

## Eliminated

- hypothesis: signInProbeOutcomes (or its backing persisted-flag read) in GlobalState.tsx is only refreshed at mount, not when a cleared verdict event arrives mid-session.
  evidence: GlobalState.tsx:1716-1721 registers window.api.handleSignInProbeOutcomes as a live push listener that calls this.setState on every push, independent of the mount-time pull at lines 1942-1955. The mid-session push path works as designed.
  timestamp: 2026-10-10

## Resolution

root_cause: "runSignInProbePass() in src/backend/signInProbe/pass.ts called publishSignInProbeOutcomes() exactly once, after Promise.all across all five stores' probes settled, instead of per-store immediately after each store's own outcome was recorded. A fast store's already-correct, already-persisted verdict (Steam cleared at 26.3s in Launch 9) was gated behind whichever sibling probe in the same pass was slowest (bounded up to 45s each, longer when a human Keychain dialog delays it), so the renderer's signInProbeOutcomes push -- the only thing that forces GlobalState/LibrarySignInNotice to re-render and re-derive rows -- did not arrive until the whole pass finished. The underlying persisted flag and in-memory outcome were correct within milliseconds; only the React re-render trigger was late. This was a deliberate design choice (D-08, 'publish once per pass') that did not account for cross-store resolve-time variance."
fix: "Moved publishSignInProbeOutcomes() from after the pass's Promise.all into the per-store async task in src/backend/signInProbe/pass.ts, called immediately after recordSignInProbeOutcome(store, outcome) succeeds (not called for stale or errored verdicts, which record nothing). Each store's verdict now reaches the renderer the instant it is known, independent of sibling probes' duration. Updated the module's D-08 doc comment and the per-pass function doc comment to describe per-store publish instead of once-per-pass. Updated src/backend/signInProbe/__tests__/pass.test.ts: rewrote 'publishes the outcome map exactly once per pass' to assert SIGN_IN_STORES.length publishes per pass (not 1), updated the stale-probe and rejected-probe tests' publishCount() expectations to SIGN_IN_STORES.length - 1 and SIGN_IN_STORES.length respectively, and added a new regression test ('F-49-R1-2 regression: a fast store publishes immediately, without waiting for a slower sibling in the same pass') that stages a slow gog probe behind a never-resolving deferred promise and asserts the other four stores (legendary, nile, humble, steam) already recorded and published before gog resolves."
verification:
  - signal: targeted-tests
    result: pass
    detail: "npx jest src/backend/signInProbe/__tests__/pass.test.ts -- 39/39 pass, including the new F-49-R1-2 regression test and the three rewritten publishCount() assertions."
  - signal: suite-regression
    result: pass
    detail: "npx jest src/backend/signInProbe (6 suites, 192 tests) and the broader sign-in-related suites (sidecar boot-wire, bootstrapWirings, GlobalStateSignInMount, librarySignInNoticeSource, librarySignInRows, signInStateParity, signInTracer, signInInputs -- 8 suites, 104 tests) all pass with no changes other than the ones in pass.ts/pass.test.ts."
  - signal: typecheck
    result: pass
    detail: "npx tsc --noEmit -- clean, no errors."
  - signal: lint
    result: pass
    detail: "node meta/lintScoped.cjs -- production: PASS | tests: PASS (0 errors, 638 pre-existing warnings, none newly introduced in pass.ts or pass.test.ts -- confirmed via grep for signInProbe/pass in the lint output)."
  - signal: format
    result: pass
    detail: "npx prettier --check src/backend/signInProbe/pass.ts src/backend/signInProbe/__tests__/pass.test.ts -- all matched files use Prettier code style."
  - signal: revert-sanity
    result: not-run
    detail: "Not executed as a separate step; the existing pinned test ('publishes the outcome map exactly once per pass', pre-fix) already served as the disconfirming check -- it asserted the old once-per-pass behavior and had to be rewritten specifically because the fix changes that invariant, which is direct evidence the code path changed as intended."
  - signal: human-verify
    result: pass
    detail: "User confirmed on a live macOS run (2026-10-10): 'it cleared right away, no remount needed.' This is the real-environment check the guardrail's automated signals cannot perform -- it confirms the original F-49-R1-2 symptom (stale sign-in row persisting until a tab remount) no longer reproduces after the per-store publish fix, in the same Keychain-gated multi-store sign-in flow that originally exposed it."
  guardrail_verdict: accepted
files_changed:
  - src/backend/signInProbe/pass.ts
  - src/backend/signInProbe/__tests__/pass.test.ts
