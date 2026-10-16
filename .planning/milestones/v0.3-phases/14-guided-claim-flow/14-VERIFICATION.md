---
phase: 14-guided-claim-flow
verified: 2026-07-08T23:15:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 14: Guided Claim Flow Verification Report

**Phase Goal:** Users can safely reveal and activate Humble Steam keys with structural protection against key waste, accidental re-reveal, and Steam activation rate-limit lockout
**Verified:** 2026-07-08T23:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap SC) | Status | Evidence |
|---|---------|--------|----------|
| 1 | Revealing a key requires explicit per-key confirmation with irreversibility warning; no auto-reveal, no "reveal all" | ✓ VERIFIED | `HumbleClaimWizard/index.tsx:163-193` — `warning` step renders explicit danger-styled "Reveal key" button; `handleReveal` (line 93) is the only call site of `window.api.humbleRevealKey` and only fires from that button or the 'failed' step's manual retry. Grep for `reveal.?all|revealAll|bulkReveal` across `src/` returns zero matches. `HumbleKeyRow`/`Waiting`/`Spares`/`All` tabs each individually confirmed — `claimAction` prop rendered only from `Waiting/index.tsx` (single `grep` hit), so no per-tab or global reveal-all affordance exists anywhere in the UI. |
| 2 | Reveal on already-owned game intercepts and hard-routes to Giftable Spares (C2 hard block) | ✓ VERIFIED | `library.ts:902-908` — backend `revealKey()` re-reads `target.ownedElsewhere` from the live key set (never trusts renderer) and returns `{status:'owned_blocked'}` *before* any write-ahead audit or adapter call when true. Wizard (`index.tsx:111-114`) routes `owned_blocked` → `c2Block` step, whose only action navigates to `/humble-keys/spares` (`handleC2Confirm`, line 134-137) and closes the wizard. Route `/humble-keys/spares` confirmed registered in `App.tsx:187-190`. Fuzzy matches blocked identically to exact matches (D-70, code comment + `library.ts:899-901`). Live human checkpoint (14-VALIDATION.md, 2026-07-08) independently confirmed this end-to-end with a real owned key. |
| 3 | After reveal: key copied to clipboard, browser opens `store.steampowered.com/account/registerkey?key=` pre-filled; "Mark as redeemed" button records completion | ✓ VERIFIED | `handleReveal` (index.tsx:107) calls `window.api.clipboardWriteText(outcome.key)` on `status:'revealed'`. `keyShown` step (index.tsx:312-326) opens `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(revealedKey)}` via `window.api.openExternalUrl` for Steam-platform keys. `handleMarkRedeemed` (index.tsx:139-153) calls `window.api.humbleMarkRedeemed`, which backend (`library.ts:1060-1082`) persists `locallyRedeemedPending: true` + appends a `mark_redeemed` audit record. Live checkpoint (2026-07-08) independently confirmed the full reveal→clipboard→Steam registerkey→successful Steam activation chain and the mark-redeemed/undo cycle with no second reveal call. |
| 4 | Every reveal and redeem action recorded in a local audit log (identity, timestamp, outcome); audit written before the reveal API call | ✓ VERIFIED | `library.ts:958` (`appendAudit(... 'reveal_attempt' ...)`) executes at line 958, strictly before the adapter call at line 983 (`adapterRevealKey`) — write-ahead ordering confirmed by direct code read, not just comment. `appendAudit` also fires for `c2_block` (903), `reveal_success` (995), `reveal_failed` (1006), `reveal_ambiguous` (1046), `mark_redeemed` (1074), `undo_redeemed` (1104). `AuditRecord` type (`electronStores.ts:94-101`) carries `event/at/outcome/title/platform` — never the key value. `humbleAuditStore` confirmed disconnect-exempt: `HumbleUser.disconnect()` (`user.ts:534+`) only clears `configStore`, `humbleLibraryStore`, `humbleSyncStore` — `humbleAuditStore`/`humbleLocalRedeemedStore` are absent from that clear list. |
| 5 | Non-Steam keys show "Redeem on {platform}" link-out + copy-key button; no one-click activation | ✓ VERIFIED | `keyShown` step's non-Steam branch (index.tsx:327-339) renders only an `openExternalUrl(NON_STEAM_REDEEM_HELP_URL)` link-out button labeled `redeemOnPlatform` ("Redeem on {{platform}}") — no IPC call that submits/activates a key exists in this branch. The "Copy key" button (index.tsx:301-309) is rendered unconditionally above the platform branch, covering both Steam and non-Steam cases. No one-click activation code path found for any non-Steam `key_type`. Live checkpoint (2026-07-08) independently confirmed the non-Steam link-out with no one-click activation. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/humble/library.ts` | `revealKey`/`markRedeemed`/`undoRedeemed` orchestration, write-ahead audit, C2 re-check | ✓ VERIFIED | All three functions present (lines 872, 1060, 1092); single adapter call site (line 983); C2 recheck at 902; write-ahead ordering confirmed |
| `src/backend/humble/adapter.ts` | `revealKey()` POST to `/humbler/redeemkey`, typed `AdapterResult` | ✓ VERIFIED | Confirmed present; live-validated 2026-07-08 (contract confirmed empirically, incl. CSRF + electron-net transport requirement discovered via debug session) |
| `src/backend/humble/electronStores.ts` | `humbleAuditStore` + `humbleLocalRedeemedStore`, composite-keyed, disconnect-exempt | ✓ VERIFIED | Both stores present (lines 115, 131); confirmed absent from `disconnect()`'s clear list in `user.ts` |
| `src/backend/humble/ipc_handler.ts` | 5 re-validating handlers (`humbleRevealKey`, `humbleMarkRedeemed`, `humbleUndoRedeemed`, `humbleGetRevealedKeyValue`, `humbleGetClaimAnnotations`) | ✓ VERIFIED | All 5 registered (lines 94-107), delegating to `HumbleLibrary` which performs server-side re-validation internally |
| `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx` | Single stateful wizard: warning → reveal → keyShown → mark-redeemed, C2 redirect, non-Steam branch | ✓ VERIFIED | Full state machine present and matches spec; only call site of `humbleRevealKey` |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | `claimAction` prop (Keys-waiting only), undo-override affordance | ✓ VERIFIED | `claimAction` prop present, restricted-exception comment matches actual usage (only `Waiting/index.tsx` supplies it) |
| `src/frontend/screens/Humble/Keys/Waiting/index.tsx` | Claim/Finish wiring + wizard mount + annotation refresh | ✓ VERIFIED | `openWizard`/`closeWizard`/`refreshAnnotations` all present and wired to `HumbleKeyRow` |
| `.planning/phases/14-guided-claim-flow/14-VALIDATION.md` | Recorded live-validation outcome | ✓ VERIFIED | Present, `status: approved`, dated 2026-07-08, includes per-step outcome for all 6 checkpoint items |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `HumbleClaimWizard` reveal step | `window.api.humbleRevealKey` | single explicit-confirm call | ✓ WIRED | Confirmed sole call site |
| `HumbleClaimWizard` Steam branch | `store.steampowered.com/account/registerkey?key=` | `openExternalUrl(encodeURIComponent(key))` | ✓ WIRED | Confirmed exact URL construction |
| `library.ts revealKey` | `adapter.ts revealKey` (`POST /humbler/redeemkey`) | single call site after write-ahead persistence | ✓ WIRED | Confirmed ordering: audit+flag write (958, 962) precedes adapter call (983) |
| `ipc_handler.ts humbleRevealKey` | `HumbleLibrary.revealKey` | server-side re-validated delegate | ✓ WIRED | Confirmed |
| `Waiting/index.tsx` | `HumbleClaimWizard` via `showDialogModal` | `claimAction.onClick` opens modal | ✓ WIRED | Confirmed (`openWizard`) |
| `Spares/index.tsx` | `window.api.humbleClearOwnershipOverride` | WR-04 undo-override affordance | ✓ WIRED | Confirmed present in `HumbleKeyRow` (undo-override button), gated by `undoOverride` prop |

### Behavioral Spot-Checks / Automated Gate

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend+frontend suite green | `pnpm test` | 38 suites, 706/706 tests passed | ✓ PASS |
| Typecheck clean | `pnpm codecheck` | `tsc --noEmit` — no output, exit 0 | ✓ PASS |
| No "reveal all" affordance anywhere in UI | `grep -rniE "reveal.?all\|revealAll\|bulkReveal" src/` | no matches | ✓ PASS |
| No debt markers (TBD/FIXME/XXX/TODO/placeholder) in phase-modified files | grep sweep of all 18 files modified across Plans 01-05 | no matches | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention used by this project/phase; the phase's own mandatory live-verification gate (checkpoint:human-verify, Plan 14-06 Task 2) serves the equivalent role for the one network call that cannot be simulated (irreversible reveal against the live Humble endpoint). That checkpoint was independently re-confirmed by this verifier as genuinely executed (14-VALIDATION.md contains dated, step-by-step outcome narrative, not just a pass marker) and is corroborated by a separately-resolved debug session (`.planning/debug/resolved/humble-reveal-key-fails.md`) that captured live log evidence (`csrfTokenPresent=true`, successful reveal, no failure line) — not merely narrated. Treated as PASS.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| HCLAIM-01 | 01, 02, 03, 04, 05, 06 | Explicit per-key reveal confirmation, no auto-reveal/reveal-all | ✓ SATISFIED | Truth #1 above |
| HCLAIM-02 | 01, 03, 05 | C2 hard block routes owned-elsewhere keys to Spares | ✓ SATISFIED | Truth #2 above |
| HCLAIM-03 | 02, 03, 04, 06 | Reveal → clipboard + Steam registerkey deep-link → Mark as redeemed | ✓ SATISFIED | Truth #3 above |
| HCLAIM-04 | 01, 03 | Local audit log (identity, timestamp, outcome), write-ahead | ✓ SATISFIED | Truth #4 above |
| HCLAIM-05 | 04, 05 | Non-Steam "Redeem on {platform}" link-out + copy, no one-click activation | ✓ SATISFIED (see note) | Truth #5 above |

**Note on HCLAIM-05 documentation inconsistency (non-blocking):** `.planning/REQUIREMENTS.md` line 85 still shows `- [ ] **HCLAIM-05**` (unchecked) and its traceability row (line 158) reads `HCLAIM-05 | Phase 14 | Pending`, while HCLAIM-01..04 are checked `[x]`/`Complete`. This is a documentation lag, not a code gap — the code evidence for HCLAIM-05 (non-Steam link-out only, no one-click activation, live-checkpoint-confirmed 2026-07-08) is as solid as the other four. `.planning/REQUIREMENTS.md` should be updated to check off HCLAIM-05 and mark its traceability row `Complete` to keep the document accurate; this is a paperwork fix, not a reason to withhold phase approval.

No orphaned requirements: all 5 IDs mapped to Phase 14 in REQUIREMENTS.md traceability appear in at least one plan's `requirements` frontmatter array.

### Anti-Patterns Found

None found in the 18 files modified across Plans 01-05 (grep sweep for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|placeholder|coming soon|not yet implemented|not available`, case-insensitive — zero matches).

### Known Issues Carried Forward from Code Review (14-REVIEW.md) — Not Blocking This Phase's 5 Success Criteria

These were independently re-confirmed present in the code during this verification but do not falsify any of the 5 roadmap success criteria as literally stated; they are documented here for visibility and future-phase follow-up, per the escalation-gate pattern (warning tier):

- **CR-01 (Critical, per code review):** `library.ts:186-201` / `classify.ts:44-49` — after a sync runs while a key is locally-marked-redeemed, `locallyRedeemedPending` is silently dropped, making the D-77 Undo affordance permanently unreachable for that key going forward (confirmed by direct read of `classifyOrder`'s caller in `fetchAndCommitOrder` and `selectKeysWaiting`'s filter condition, `viewFilters.ts:55-65`). This affects **undo integrity**, not the audit-log truth itself (audit records remain intact and are unaffected — append-only, keyed independently of `locallyRedeemedPending`). None of the 5 roadmap SCs require cross-sync undo persistence; SC3's "Mark as redeemed" recording-of-completion is unaffected. Recommend a follow-up fix per the code review's proposed patch before the undo affordance is relied upon in later phases.
- **WR-01 (Warning):** No in-flight guard on backend `revealKey` — the eligibility check reads cached state (only flips to REVEALED *after* a successful adapter call), so two IPC invocations racing before the first resolves could both pass eligibility and both fire the irreversible reveal POST. The renderer's `busy` flag (index.tsx:56) is the only current guard and is explicitly untrusted per this project's own stated threat model (T-14-03). This is relevant to the phase's stated goal language ("structural protection against ... accidental re-reveal") as a narrow race-condition edge case, not the double-click/UI-level protection which IS in place (button disabled while `busy`). Recommend closing per the code review's proposed `revealsInFlight` Set fix.
- **WR-02 through WR-06 (Warnings/Info):** Confirmed present as described in 14-REVIEW.md (Finish-activation resume lost after sync; CSRF staleness window; ownership-override undo unreachable in one direction; unhandled wizard promise rejections; `schema_error` misclassification of a well-formed server denial). None contradict the 5 stated success criteria; all are robustness/edge-case gaps appropriate for a fast-follow, not phase-blocking.

### Human Verification Required

None outstanding. The one class of behavior that cannot be verified by static/automated means — the live reveal/redeem HTTP contract against Humble's actual API, the C2 hard block, the mark-redeemed/undo cycle, and the non-Steam link-out — was already executed as a mandatory human checkpoint (Plan 14-06 Task 2) and approved 2026-07-08, with dated per-step outcomes recorded in `14-VALIDATION.md` (not merely a pass marker — it documents which specific steps were walked and confirms CSRF disposition, corroborated by a separately-resolved live debug session with captured log evidence). This verifier independently confirmed the corresponding code paths exist and match the validated behavior; re-running the live check would consume another disposable key with no verification benefit.

### Gaps Summary

No gaps block phase goal achievement. All 5 roadmap success criteria are independently verified in the codebase (not merely claimed in SUMMARY.md): per-key confirm with no reveal-all, C2 hard block to Spares, reveal→clipboard→Steam registerkey→mark-redeemed, write-ahead audit logging, and non-Steam link-out-only activation. Full test suite (706/706) and typecheck are green. One documentation inconsistency (HCLAIM-05 unchecked in REQUIREMENTS.md despite being implemented and live-validated) should be corrected but does not block phase completion. Six known robustness issues from the code review (1 Critical — CR-01 undo-after-sync; 5 Warning-tier) remain open and are recommended as fast-follow work, but none falsify the phase's 5 stated success criteria.

---

_Verified: 2026-07-08T23:15:00Z_
_Verifier: Claude (gsd-verifier)_
