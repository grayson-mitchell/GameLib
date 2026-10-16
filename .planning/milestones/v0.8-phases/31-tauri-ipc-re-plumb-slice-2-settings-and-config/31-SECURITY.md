---
phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config
audited: 2026-07-23
auditor: Claude (gsd-security-auditor)
register_authored_at_plan_time: true
asvs_level: default
block_on: high
threats_total: 10
threats_closed: 10
threats_open: 0
---

# Phase 31 Security Audit — Tauri IPC re-plumb slice 2 (settings/config)

Threat register was authored at plan time across all four PLAN.md files
(31-01..31-04). This audit verifies each declared mitigation/acceptance against
the implemented code, not against documentation or SUMMARY.md claims. All four
sidecar jest suites (`settingsFlows.test.ts`, `storeLayer.test.ts`,
`dialogStub.test.ts`, `electronUntouched.test.ts` — 81/81 tests) and
`cargo check --manifest-path src-tauri/Cargo.toml` were independently re-run
during this audit (not sourced from SUMMARY.md), both green.

## Threat Verification

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-31-01 | Info disclosure / Tampering | `setSetting`/`writeConfig` → configStore | mitigate | CLOSED | `settingsFlowRegistration.ts:144-199` — write path routes exclusively through `GlobalConfig.get().setSetting`/`GameConfig.get(appName).setSetting`, never through `configStore`'s raw `set`/`flush` or `storeWriteHandlers.ts`'s separate `storeSet` channel. `settingsFlows.test.ts:436-454` ("T-31-01: setSetting routes exclusively through GlobalConfig.setSetting, never GlobalConfig.set()/flush()") asserts a settings-shaped key (`steamGridDbApiKey`) reaches only `setSetting`, never `set`/`flush` — independently re-run, PASS. The pre-existing `TOKEN_STORE_KEY` deny-list (`storeWriteHandlers.ts:133`, Phase 28 D-04) is untouched by this phase and gates a disjoint write channel (`storeSet`), so it remains fail-closed. |
| T-31-02 | Tampering | per-game raw write `join(gamesConfigPath, appName+'.json')` | mitigate | CLOSED (superseded/hardened by T-31-04-02) | `settingsFlowRegistration.ts:153-158` type-guards non-string `appName`/`key` before any write, dropping the frame. Hardened further by the containment guard below (T-31-04-02), which is the stronger, actually-load-bearing control. |
| T-31-04 | Elevation of privilege | new `dialog_message`/`dialog_save` allowlist entries | mitigate | CLOSED | `sidecarTransport.ts:161-183` — both constants added ONLY to `RUST_INVOKE_CHANNELS`. `main.rs:368-427` — both match arms (`"dialog_message"`, `"dialog_save"`) placed before the `_ =>` catch-all, dispatched on the existing spawned worker thread (`main.rs:613`). Verified `git diff --stat 66cfcee5~1..1e98c8e1 -- src-tauri/capabilities/ src-tauri/Cargo.toml` is empty — no capability widening, no new dependency, across the entire phase's commit range. `cargo check` independently re-run: `Finished`. |
| T-31-05 | Info disclosure | 31-PORTED-CHANNELS.md / SEAM.md overstating shipped scope | mitigate | CLOSED | `grep -n "CLOSED for all async members" SEAM.md` → no match (overstated claim removed post-gap-closure). `SEAM.md:133,180` both carry "Claim level: 'wired and unit-proven', NOT 'hardware-proven'". `31-PORTED-CHANNELS.md` claim-scope note (top of file) states the same; `showMessageBox` correctly relocated to "Deliberately NOT ported this phase" with its real callers named, not "no in-scope caller". |
| T-31-SC (×3, one per plan 31-01/02/03) | Tampering | npm/cargo installs | accept | CLOSED | `git diff --stat 66cfcee5~1..1e98c8e1 -- package.json src-tauri/Cargo.toml` is empty across the full phase-31 commit range — no new packages installed in any of the four plans. Acceptance rationale (no supply-chain surface added) holds. |
| T-31-04-01 | Elevation/Tampering | `dialog.showMessageBox` (CR-01) | mitigate | CLOSED | `electronStub.ts:204-221` — body contains `response: -1`, one `console.warn`, no `throw`/`Promise.reject`/`requestRustInvoke`. `grep -n "requestRustInvoke(RUST_DIALOG_MESSAGE" electronStub.ts` returns exactly one match, inside `showErrorBox` (L192), not `showMessageBox`. `dialogStub.test.ts:154-172` asserts a multi-button `buttons:['Confirm','Cancel']` call resolves `{response:-1,checkboxChecked:false}` and `callLog` never contains a `RUST_DIALOG_MESSAGE` entry — independently re-run, PASS. Both documented live callers (`promptI386Recovery` decline=`response!==0`, `askForceUninstall` decline=`response!==1`) decline on `-1`. Code review (31-REVIEW.md, WR-B) additionally found a third, previously-undocumented call site (`showDialogBoxModalAuto`'s catch-fallback, `dialog/dialog.ts:45`) — traced as inert (return value discarded, no await) and still safe under the never-reject/never-forward property, but the doc comment at `electronStub.ts:167-183` undercounts callers. This is a documentation-completeness gap, not a broken mitigation — logged below as a residual note, not a blocker. |
| T-31-04-05 | Denial of Service | `dialog.showMessageBox` reject path | mitigate | CLOSED | Same evidence as T-31-04-01 — function body has no code path that can throw or reject; `dialogStub.test.ts` asserts `.resolves.toEqual(...)` only, never `.rejects`. Preserves the "never throws" property the unguarded fire-and-forget callers depend on. |
| T-31-04-02 | Tampering | per-game write branch of `setSetting`/`writeConfig` (WR-01) | mitigate | CLOSED, with one adjacent noted gap | `settingsFlowRegistration.ts:95-99` `isContainedGameConfig()` uses genuine `resolve()`+`relative()`+`isAbsolute()` containment (not `join()`/`startsWith()`), mirroring the proven `library.ts:1114-1119` idiom — verified by direct read, matches the code-review's independent hand-trace (31-REVIEW.md) of traversal, absolute-path, and prefix-collision cases. Applied to `setSetting`'s per-game branch (L165-171) unconditionally after the string type-guard. **Applied to `writeConfig`'s per-game branch (L188-197) ONLY when `appName` is already a string** (`typeof appName === 'string' && appName !== 'default' && !isContainedGameConfig(appName)`) — a non-string/missing `appName` bypasses this guard entirely and falls through to `writeConfig(appName as string, ...)`. Independently confirmed present in the live file (not fixed since the 31-REVIEW.md finding WR-A). This bypass does NOT produce a path-traversal escape (JS's `+ '.json'` string coercion of a non-string JSON value cannot produce `/`/`..` path separators — a number, array, or object coerces to a comma/bracket string, not a path escape), so the core STRIDE threat this control targets (traversal escaping `gamesConfigPath`) remains closed for all `appName` values that could actually escape. The residual bypass (malformed-frame → predictable `undefined.json` write) is a distinct, narrower issue already registered and accepted separately as T-31-04-03 (WR-02) below — not a silent break of THIS threat's mitigation. Independently re-ran `settingsFlows.test.ts`'s two WR-01 traversal tests: both PASS, and the stderr drop-lines fire live (`[settingsFlowRegistration] setSetting/writeConfig dropped a path-escaping appName`), confirming the guard executes at runtime, not just type-checks. |
| T-31-04-03 | Tampering | `writeConfig` malformed-frame type guard (WR-02) | accept | CLOSED (acceptance rationale holds) | Confirmed still present and unfixed: `writeConfig`'s containment guard short-circuits on non-string `appName` (see T-31-04-02 above), same finding as 31-REVIEW.md's WR-A. Verified the risk is genuinely low as claimed: a non-string `appName` cannot escape `gamesConfigPath` via string coercion (confirmed by code read — `+` operator on array/object/number/boolean/null does not yield path separators), so the worst outcome is a predictable, in-directory `undefined.json`/`[object Object].json` write — parity-inherited from Electron's own `writeConfig`, no new attack surface. Out-of-scope per the user's explicit locked decision (31-04-PLAN.md objective + REQUIREMENTS.md REQ-31-06 mapping). Acceptance entry recorded in this SECURITY.md's Accepted Risks Log below. |
| T-31-04-04 | Info Disclosure | `dialog_save` directory-component drop (WR-03) | accept | CLOSED (acceptance rationale holds) | Confirmed `main.rs:399-407` — `dialog_save`'s Rust arm passes the full `defaultPath` string to `.set_file_name(file_name)` verbatim (no basename extraction), matching 31-REVIEW.md's anti-pattern note (unresolved, as expected — accepted, not mitigated). Verified zero real callers: `grep -rln "showSaveDialog"` repo-wide returns only `electronStub.ts` (the implementation) and `dialogStub.test.ts` (its own test) — no production call site exists to exploit this. Acceptance rationale (zero callers, behavior-degradation-only) holds. Acceptance entry recorded below. |
| T-31-03 | Tampering | `showSaveDialog` returned path used downstream | accept | CLOSED (acceptance rationale holds) | Same zero-caller grep as above confirms the rationale: no in-scope or out-of-scope consumer reads `showSaveDialog`'s return value anywhere in `src/`. Path originates from the native OS dialog (user-chosen), consistent with the accepted disposition. Acceptance entry recorded below. |

## Accepted Risks Log

The following threats are formally accepted (disposition `accept`), per the user's explicit,
plan-documented scope decisions. Each entry's rationale was independently re-verified against
live code during this audit, not merely re-asserted from planning docs.

1. **T-31-04-03 / WR-02** — `writeConfig`'s per-game containment guard is bypassed when `appName`
   is a non-string or missing JSON value (falls through to a type-unsafe cast). Accepted because
   the bypass cannot produce a filesystem-path escape (JS's string coercion of non-string JSON
   values never yields `/` or `..`); worst case is a predictable, contained `undefined.json`
   write. Parity-inherited from Electron's own `writeConfig`. Deferred fix (add the same
   unconditional non-string guard `setSetting` already has) tracked as a WARNING, not a blocker.

2. **T-31-04-04 / WR-03** — `dialog_save`'s Rust arm passes a caller-supplied `defaultPath` to
   `set_file_name` without stripping directory components. Accepted because `showSaveDialog` has
   zero real callers anywhere in the repository (verified by grep during this audit) — there is
   no reachable path for this to leak directory information today. Revisit if/when a real caller
   adopts `showSaveDialog`.

3. **T-31-03** — `showSaveDialog`'s returned path is unvalidated by the electronStub layer.
   Accepted because (a) zero real callers exist repo-wide (verified), and (b) the path is
   user-chosen via the native OS save dialog by construction. Any future consumer is responsible
   for validating the path before writing.

4. **T-31-SC** (all four plans) — No new npm or cargo packages were introduced anywhere in Phase
   31 (verified via `git diff --stat` across the full commit range for `package.json` and
   `src-tauri/Cargo.toml` — empty). No supply-chain legitimacy gate was required.

## Residual Notes (non-blocking)

- **CR-01 doc undercounts callers (31-REVIEW.md WR-B):** `electronStub.ts`'s rationale comment
  above `dialog.showMessageBox` names two live callers (`promptI386Recovery`,
  `askForceUninstall`) but a third, inert call site exists (`showDialogBoxModalAuto`'s
  catch-fallback, `backend/dialog/dialog.ts:45`, reachable via
  `installFlowRegistration.ts:86`). Traced and confirmed safe in practice (return value
  discarded, function never rejects, so the "never auto-confirm / never crash" properties this
  audit verified for T-31-04-01/T-31-04-05 hold regardless of caller count) — but the
  documentation itself is incomplete, which risks a future Phase 33 implementer reasoning from
  an undercounted caller inventory. Recommend updating the comment block before Phase 33 touches
  `showMessageBox`. Not a threat-mitigation gap for this phase — no BLOCKER.

## Unregistered Flags

None. No `## Threat Flags` section was present in any of the four SUMMARY.md files for this
phase. The code-review-discovered issues (31-REVIEW.md WR-A, WR-B, IN-01) all map to
already-registered threat IDs (T-31-04-02/T-31-04-03 and T-31-04-01 respectively) — none
constitute new, unmapped attack surface.

## Independent Verification Performed This Audit

- `npx jest settingsFlows.test.ts storeLayer.test.ts dialogStub.test.ts electronUntouched.test.ts` → 4 suites, 81/81 PASS (re-run, not SUMMARY-trusted).
- `cargo check --manifest-path src-tauri/Cargo.toml` → `Finished` (re-run, not SUMMARY-trusted).
- `git diff --stat 66cfcee5~1..1e98c8e1 -- package.json src-tauri/Cargo.toml src-tauri/capabilities/` → empty (confirms T-31-SC and the T-31-04 no-capability-widening claim across the full phase, not just the plan that introduced the channels).
- `grep -rln "showSaveDialog" src/` → confirms zero production callers (T-31-03/T-31-04-04 acceptance basis).
- Direct read of `electronStub.ts`, `settingsFlowRegistration.ts`, `sidecarTransport.ts`, `main.rs` (dispatch_rust_channel) in full — mitigation code confirmed present at the cited lines, not inferred from surrounding structure.

SECURITY.md: `.planning/phases/31-tauri-ipc-re-plumb-slice-2-settings-and-config/31-SECURITY.md`
