# Phase 28 — Recurring-ID Security Evidence (Shard R)

Re-audit of the 6 threat IDs that recur across multiple Phase 28 plans (20 `(plan, threat_id)`
units). `28-SECURITY.md` (2026-07-22, `threats_open: 0`) collapsed each recurring ID to a single
register row; this shard independently re-verifies every recurrence against the CURRENT working
tree (post `f339137c6`, `2d1abe64a`, `71960ff83`, and the multi-slot `SidecarKeyringSlotStore`
rework). Shard S (the 11 single-occurrence IDs) is out of scope here.

Adversarial default: every row below starts assumed OPEN until a grep/read match is cited.

---

## T-28-01 — Tampering: sidecar/non-Electron writer corrupting shared `configStore` `TOKEN_STORE_KEY` (3 units)

| # | Plan | Disposition | Status | Evidence |
|---|------|-------------|--------|----------|
| 1 | 28-03 | mitigate | CLOSED | `src/backend/storeManagers/steam/tokenStore.ts:4` is the sole importer of `TOKEN_STORE_KEY` (declared `constants.ts`). `user.ts` grepped — zero `TOKEN_STORE_KEY` matches, only unrelated `configStore.*` keys (`isLoggedIn`, `userData`, `credentialsMissing`) at `user.ts:74,313-355`. |
| 2 | 28-04 | mitigate | CLOSED | `src/backend/sidecar/keyringTokenStore.ts` import block (lines 1-13) has no `configStore`/`electronStores`/`TOKEN_STORE_KEY` import. Test `keyringTokenStore.test.ts:408-414` (`'source contains no reference to configStore/TOKEN_STORE_KEY/TOKEN_PREFIX/writeFileSync'`) reads the real source file and regexes it — a real assertion, not a tautology. |
| 3 | 28-05 | mitigate | CLOSED | `electronUntouched.test.ts` drives the REAL `configStore` (unmocked, `jest.requireActual`) through all four `SidecarKeyringTokenStore` operations, byte-comparing `refreshToken` and the full store snapshot before/after (lines 179-263), plus a whole-suite real-file byte comparison (lines 285-298), plus the source-gate `configStore`/`TOKEN_STORE_KEY`/`TOKEN_PREFIX` regex against `keyringTokenStore.ts` and `bootstrap.ts` (lines 300-309). Verified this suite is now strictly read-only (no `.set()`/`.clear()`/`.delete()` anywhere) per the 28-06-SUMMARY.md incident writeup — a prior version of this exact file destroyed a real developer's Steam token; the current version cannot. |

**T-28-01 reconciled: 3/3 CLOSED.**

---

## T-28-02 — Information Disclosure: plaintext token persistence on Keychain failure/Deny (4 units)

| # | Plan | Disposition | Status | Evidence |
|---|------|-------------|--------|----------|
| 4 | 28-02 | mitigate | CLOSED | `src-tauri/src/main.rs:3268-3320` — `keyring_set`/`keyring_delete`/`keyring_available` arms: every `Err` branch returns `Err(format!("keyring:unavailable:{e}"))` or `Ok(Value::Bool(false))`; no filesystem/config write exists anywhere in `dispatch_rust_channel`'s keyring arms. No fallback write path in current code. |
| 5 | 28-03 | accept | CLOSED | `28-SECURITY.md:38,64` records `AR-28-01` in the Accepted Risks Log for the Electron-legacy half. Code matches: `tokenStore.ts:136-147` (`encryptToken`) logs-then-stores-plaintext when `safeStorage.isEncryptionAvailable()` is false — deliberately preserved (D-11). Test `tokenStore.test.ts:184-194` asserts the exact plaintext-write + exact warning string via `toHaveBeenCalledWith`. Accept disposition satisfied: entry present, dated 2026-07-22, `grayson.mitchell`. |
| 6 | 28-04 | mitigate | CLOSED | `keyringTokenStore.ts` — `setToken()`/`clearToken()`/`getToken()`/`readToken()` failure paths (lines ~333-345, ~415-430) resolve to `''`/`false`/void with a warning, never write anywhere. `electronStub.ts:532-542` — `safeStorage.encryptString`/`decryptString` now `throw`, replacing the former plaintext round-trip stub. No env-var/in-memory fallback in this module (confirmed no `process.env` reference — `keyringTokenStore.test.ts:1402-1408` source-gates this, with a RED-proof at `1411-1439` proving the gate would actually fail against a specimen that DOES reference `process.env`). Noted but non-blocking: `devSecretVault.ts` (added later, 34.5 gap cycle 4) is a SEPARATE, env-gated, packaged-build-refused dev vault that can substitute for `SidecarKeyringTokenStore` entirely at `bootstrap.ts:537-541` — it is a deliberate, later, out-of-Phase-28-scope escape hatch documented in its own header as directly contradicting `keyringTokenStore.ts`'s "no dev escape hatch" claim; it does not activate ON a Keychain failure (T-28-02's specific threat shape), it is chosen ahead of time via `GAMELIB_DEV_SECRET_VAULT=1`, so it does not reopen this unit but is worth carrying forward for whoever next revises T-28-02's threat-model wording. |
| 7 | 28-06 | mitigate | CLOSED | `28-PROOF.md:79` — recorded hardware Deny-path checkpoint output: "No plaintext token written anywhere; no token-ish string in the log." This is the human-verified Step 2 side-condition the plan's mitigation names. Cross-checked: all self-check scaffolding (`keyring_self_check*`, `SELFCHECK_ACCOUNT_SUFFIX`, `GAMELIB_KEYRING_SELFCHECK`) is fully removed from `src-tauri/src/main.rs` (zero grep matches), consistent with 28-06-SUMMARY.md's Task 4 closeout — the surface this unit's mitigation describes no longer exists in code, and its removal is itself evidenced by the same grep. |

**T-28-02 reconciled: 4/4 CLOSED.**

---

## T-28-03 — Elevation of Privilege: channel/account argument used to address an arbitrary Keychain item (2 units)

| # | Plan | Disposition | Status | Evidence |
|---|------|-------------|--------|----------|
| 8 | 28-01 | mitigate | CLOSED | `src/backend/sidecar/sidecarRpc.ts:345-349` — `requestRustInvoke()` checks `RUST_INVOKE_CHANNELS.includes(channel)` and rejects before emitting a frame. Real test: `rustInvokeChannel.test.ts:202-219` — non-allowlisted channel rejects AND asserts zero `"kind":"rustInvoke"` frames reached the output stream (not just that the promise rejected). |
| 9 | 28-02 | mitigate | CLOSED | `src-tauri/src/main.rs:246-273` — `keyring_account(slot)` matches exactly `"steam-refresh-token"`/`"humble-session"`/`"humble-csrf"` to `&'static str` constants; the `_` arm returns `Err("keyring:unknown-slot")` — no wildcard/pass-through. `dispatch_rust_channel`'s own catch-all is `main.rs:5186` (`Err(format!("rustInvoke:unknown-channel:{channel}"))`). Unit test `keyring_account_rejects_an_unknown_slot_with_no_fallback_to_a_real_account` (main.rs:7671) and `keyring_account_rejects_a_plausible_looking_near_miss_slot` (main.rs:7685) both real, non-tautological (compare against the function's actual `Err` return, not a re-derivation of its logic). Note: the plan text's "exactly four literal arms" is now stale — `dispatch_rust_channel` has grown many more arms (`dialog_open`, `dialog_message`, `notification_show`, clipboard, `app_exit`, etc.) since 28-02 — but the substantive guarantee (no arbitrary Keychain address from `args`) is unaffected by that growth and remains enforced entirely by `keyring_account`'s closed match. |

**T-28-03 reconciled: 2/2 CLOSED.**

---

## T-28-04 — Information Disclosure: token/secret value reaching a log or diagnostic (6 units — the "starkest case")

| # | Plan | Disposition | Status | Evidence |
|---|------|-------------|--------|----------|
| 10 | 28-01 | mitigate | CLOSED (source-verified; no dedicated regression test found) | `sidecarRpc.ts:256-262` — the unrecognized-inbound-frame-kind branch's `process.stderr.write` template literal interpolates only `value.kind` and `value.id`; `args`/`result` are not referenced anywhere in that branch or in scope at that point. Verified no test drives an actual unrecognized-`kind` frame through `handleFrame()` and asserts stderr content (`rustInvokeChannel.test.ts`, `skeletonFlows.test.ts`'s "unrecognized" hits are for `storeNew` names, unrelated). Direct source read closes this — the interpolation is structurally incapable of including `args`/`result` — but flagging the absent regression test as a minor gap (not a blocker: the code shape itself is unambiguous and a future refactor that widened the log line would be caught by any reviewer diffing this file, though not by CI). |
| 11 | 28-02 | mitigate | CLOSED | `src-tauri/src/main.rs` — every keyring failure log site (`keyring_get` at ~3258/3262, `keyring_set` at ~3278/3283, `keyring_delete` at ~3295/3300, `keyring_available` at ~3315/3320) uses `eprintln!("[shell] keyring {channel} failed: {e:?}")` — `channel` + Debug-format of `keyring::Error` only. Explicit inline comment at `main.rs:3277`: "Never log the secret itself (threat T-28-04) — channel + error only." The secret argument (`args.first()` in `keyring_set`) is never passed to any log call. |
| 12 | 28-03 | mitigate | CLOSED | `user.ts:192-198` — the `unreadable` branch's `logWarning` names only `outcome.reason` (`'timeout'`/`'unavailable'`), never a token. Real test: `user.test.ts:1098-1117` ("does NOT log 'no stored refresh token' on an unreadable read, and DOES log a distinct retryable warning naming the reason") drives the actual `ensureConnected()` path with a fake `unreadable` outcome and asserts the warning content, not a re-derivation. |
| 13 | 28-04 | mitigate | CLOSED | `keyringTokenStore.test.ts:1358-1376` — "no log line anywhere in the module contains the token value, proven with a distinctive literal": seeds `DISTINCTIVE_TOKEN = 'zzz-never-log-this-value-zzz'`, drives `readTokenOutcome()`, asserts across `logInfo`/`logDebug`/`logWarning` call args that the literal never appears. Distinctive per the method's own bar (not empty/generic). Companion tests at lines 938-966 ('super-secret-token') and 1029-1050 ('another-secret') give the same proof for the read-success and write-success paths respectively. |
| 14 | 28-05 | mitigate | CLOSED | `package.json:43` — `"test:ci": "jest --runInBand --silent"` confirms the `--silent` claim. `electronUntouched.test.ts` uses only the synthetic literal `'sidecar-only-token'`/`'should-never-persist'` (never a real token) and contains zero `console.log`/`logInfo` calls of any secret value — the suite's only assertions are `toBe`/`equals` comparisons, never a print. |
| 15 | 28-06 | mitigate | CLOSED | Self-check scaffolding fully removed from `main.rs` (zero grep matches for `selfcheck`/`SELFCHECK`), so the surface described by this threat no longer exists in shipped code. Independently, `28-PROOF.md:74,79` records the actual hardware Deny-run terminal output verbatim (a `keyring::Error` debug dump, no token) plus the orchestrator's explicit side-condition check: "no token-ish string in the log." |

**T-28-04 reconciled: 6/6 CLOSED** (one unit — 28-01 — closed by direct source inspection rather than an automated regression test; noted as a minor coverage gap, not a blocker).

---

## T-28-05 — Denial of Service: a stalled/hung Keychain or rustInvoke call wedging the sidecar (3 units)

| # | Plan | Disposition | Status | Evidence |
|---|------|-------------|--------|----------|
| 16 | 28-01 | mitigate | CLOSED | `sidecarRpc.ts:58` `RUST_INVOKE_TIMEOUT_MS = 60_000`; `sidecarRpc.ts:354-367` arms a `setTimeout` that deletes the `rustPending` entry and rejects. Real test: `rustInvokeChannel.test.ts:223-236` ("rejects with a timeout message after 60s when unanswered") uses fake timers and asserts the actual rejection, plus a second test (240-257) asserting the timeout message names the specific channel. |
| 17 | 28-02 | mitigate | CLOSED | `main.rs:5737-5744` (reader-thread `rustInvoke` handling) — `thread::spawn(move \|\| { dispatch_rust_channel(...) ... })`, with an inline comment citing "threat T-28-05, head-of-line blocking" directly. `keyring_get` is additionally bounded by its own `KEYRING_READ_TIMEOUT` via `bounded_keyring_read` (`main.rs:3244-3253`), layered on top of the sidecar's 60s bound. |
| 18 | 28-04 | mitigate | CLOSED | `keyringTokenStore.ts`'s `classifyKeyringFailure()` (lines ~63-69) classifies a rejection as `'timeout'` vs `'unavailable'` via regex on the error message; every `getToken()`/`isAvailable()`/`setToken()`/`clearToken()` failure path resolves promptly (never awaits indefinitely) once `requestRustInvoke()` itself settles (bounded by unit 16's 60s). Test: `keyringTokenStore.test.ts:255-270` ("classifies a rustInvoke timeout rejection as unavailable, not as 'no entry'") drives an actual timeout-shaped rejection and asserts the classification and the `class=timeout` memo log line. |

**T-28-05 reconciled: 3/3 CLOSED.**

---

## T-28-09 — Spoofing: `isEncryptionAvailable()` claiming `true` while offering no real encryption (2 units)

| # | Plan | Disposition | Status | Evidence |
|---|------|-------------|--------|----------|
| 19 | 28-04 | mitigate | CLOSED | `src/backend/sidecar/electronStub.ts:533` — `isEncryptionAvailable: (): boolean => false`. Confirmed reversed from the pre-Phase-28 stub (which returned `true`, per SEAM.md's documented 27-05 garbage-decrypt cause). |
| 20 | 28-05 | mitigate | CLOSED | `electronUntouched.test.ts:311-317` — dedicated source-gate test reads `electronStub.ts`, strips comments, and asserts the exact regressed literal `/isEncryptionAvailable:\s*\(\):\s*boolean\s*=>\s*true/` never reappears. This is a real, specific regex against the true lie shape, not a generic "contains true" check that would false-positive on unrelated code. |

**T-28-09 reconciled: 2/2 CLOSED.**

---

## Reconciliation

| Threat ID | Units in shard | Closed | Open |
|-----------|-----------------|--------|------|
| T-28-01 | 3 | 3 | 0 |
| T-28-02 | 4 | 4 | 0 |
| T-28-03 | 2 | 2 | 0 |
| T-28-04 | 6 | 6 | 0 |
| T-28-05 | 3 | 3 | 0 |
| T-28-09 | 2 | 2 | 0 |
| **Total** | **20** | **20** | **0** |

## Notes carried forward (not blockers, but worth another auditor's eye)

1. **Unit 6 (T-28-02 / 28-04):** `devSecretVault.ts` (34.5 gap cycle 4, dated after this phase) is
   a documented, env-gated, packaged-build-refused plaintext escape hatch that can be installed
   INSTEAD of `SidecarKeyringTokenStore` at `bootstrap.ts:537-541`. It does not violate T-28-02's
   literal threat shape (activation is not conditioned on a Keychain failure), and its own header
   explicitly acknowledges it contradicts `keyringTokenStore.ts`'s "no dev escape hatch" claim. Not
   in this shard's scope to re-threat-model, but the Phase 28 threat register's D-08 language should
   eventually be revised to reflect that a later phase intentionally reopened this door under strict
   guardrails.
2. **Unit 10 (T-28-04 / 28-01):** No automated regression test exercises the unrecognized-frame-kind
   stderr branch specifically. The code is unambiguous by direct read (only `kind`/`id` are
   interpolated), so this closes on source evidence, but a future refactor of that branch has no CI
   tripwire today.
