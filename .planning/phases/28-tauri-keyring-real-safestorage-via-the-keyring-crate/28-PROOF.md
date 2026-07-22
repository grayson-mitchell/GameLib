# Phase 28 Plan 06 — Proof Pair (Automated + Hardware)

**Recorded:** 2026-07-22
**Plan:** `28-tauri-keyring-real-safestorage-via-the-keyring-crate` / Plan 06 (Task 3)
**Status:** REQ-28-01, REQ-28-02, REQ-28-04, REQ-28-06, REQ-28-07 hardware-verified. REQ-28-05
incidental fix (`openExternal` drop) NOT hardware-verified this plan — recorded honestly below.

---

## 1. Automated proof

Commands and outcomes carried forward from plans 28-01 through 28-05 (all already committed;
re-stated here as the durable proof-pair record this plan's acceptance criteria require).

| Plan | Command | Outcome |
|------|---------|---------|
| 28-01 | `npx jest` (new `rustInvokeChannel`-adjacent suite) | PASS — Self-Check PASSED (28-01-SUMMARY.md) |
| 28-02 | `cd src-tauri && cargo build` | Exit 0, zero warnings; `cargo tree -p keyring` confirms `keyring v3.6.3` + `security-framework v3.7.0` |
| 28-03 | `npx jest src/backend/storeManagers/steam/__tests__/tokenStore.test.ts src/backend/storeManagers/steam/__tests__/user.test.ts` | 12/12 + 62/62 pass |
| 28-04 | `npx jest src/backend/sidecar/__tests__` (bootstrap, skeletonFlows, rustInvokeChannel, keyringTokenStore) | 21/21 green across the four files |
| 28-04 | `cd src-tauri && cargo build` | Clean, no warnings (regression check, no Rust files touched that plan) |
| 28-04 | `npm run test:ci` (full, unscoped) | 1892/1894 pass; 2 failures are the pre-existing `library.ts` leaked-install-poll-timer crash, unrelated to this phase (tracked in `deferred-items.md`) |
| 28-05 | `npx jest src/backend/sidecar/__tests__/electronUntouched.test.ts` | 10/10 pass |
| 28-05 | `npx jest src/backend/sidecar/__tests__ src/backend/storeManagers/steam/__tests__/tokenStore.test.ts src/backend/storeManagers/steam/__tests__/user.test.ts` | 7 suites, 113/113 pass |
| 28-05 | `cd src-tauri && cargo build` | Clean, no warnings |
| 28-05 | `npm run test:ci` (full, unscoped) | Exits 1 due to the same pre-existing `library.ts` leaked-timer crash; a scoped run excluding only that one file passed 107/107 suites, 1738/1738 tests |

**Pre-existing, out-of-scope failure (documented, not fixed by this phase):** the full,
unscoped `npm run test:ci` run fails on `library.ts`'s leaked install-poll `setTimeout`, first
observed 2026-07-19, predating this phase. Every suite this phase's plans 28-01..05 actually
touch is green. See `deferred-items.md`.

**Regression introduced mid-phase and fixed** (outside this plan's own task list — see
`28-06-SUMMARY.md` § Deviations for the full incident writeup): commit `92c29a5e` made
`electronUntouched.test.ts` strictly read-only and isolated `skeletonFlows.test.ts` Test 4 after
both were found driving the developer's REAL production Electron `configStore`, one of which
(`skeletonFlows.test.ts` Test 4, landed by Phase 27) destroyed the developer's real Steam
refresh token mid-execution of this phase.

---

## 2. Hardware proof

All five checkpoint steps performed on real macOS hardware by the user, 2026-07-22. Terminal
output recorded verbatim below.

### Step 1 — Round-trip (REQ-28-01) — PASS

Single-process mode (`GAMELIB_KEYRING_SELFCHECK=1`). Verbatim terminal output:

```
[shell][keyring-selfcheck] starting: service=com.gamelib.launcher account=steam-refresh-token-selfcheck
[shell][keyring-selfcheck] set: writing synthetic value "gamelib-selfcheck-1784683600390704000"
[shell][keyring-selfcheck] set: OK
[shell][keyring-selfcheck] get: reading back
[shell][keyring-selfcheck] verdict: byte-identical=true (wrote "gamelib-selfcheck-1784683600390704000", read "gamelib-selfcheck-1784683600390704000")
[shell][keyring-selfcheck] delete: cleaning up
[shell][keyring-selfcheck] delete: OK
```

No Keychain prompt appeared for this run — CORRECT, the process owned the item for its whole
lifetime (see Finding 2 below for why this is expected, not a gap in the test).

### Step 2 — Deny path (REQ-28-06, closes RESEARCH Assumption A1 / Open Question 1) — PASS

**This is the headline result of this plan.** Reached via the `seed`/`verify` mode split (added
by commit `7b9016bd` after the plan's original single-mode design proved unable to reach the
Deny prompt — see Finding 2). Verbatim terminal output from the run where the user clicked
**Deny**:

```
[shell][keyring-selfcheck] mode=verify starting: service=com.gamelib.launcher account=steam-refresh-token-selfcheck
[shell][keyring-selfcheck] verify: reading existing entry this process did not create (expected to prompt if the binary's code signature changed since the seed run)
[shell][keyring-selfcheck] verify: get_password FAILED — this is the Deny-path observation (REQ-28-06 / RESEARCH Assumption A1). Full keyring::Error debug: PlatformFailure(Error { code: -128, message: "User canceled the operation." })
```

Side conditions verified by the orchestrator on the Deny run:
- App still started: sidecar signalled READY, webview opened.
- No plaintext token written anywhere; no token-ish string in the log.
- Electron `configStore` byte-identical (see Step 4 below).
- No `spike011` Keychain entry exists (`security find-generic-password -s spike011` → not found).

### Step 3 — Rebuild re-prompt (REQ-28-07 / D-08) — PASS (expected friction, not a bug)

Observed across TWO independent seed→rebuild→verify cycles: a fresh Keychain prompt appeared
each time purely because of the `cargo build` rebuild (macOS Keychain ACLs are keyed to the
accessing binary's code-signing identity, and an unsigned/ad-hoc dev build's identity effectively
changes across rebuilds). This is D-08's accepted, locked friction, now confirmed on hardware —
not worked around, per plan instruction.

### Step 4 — Electron untouched, cross-build (REQ-28-02 / D-04) — PASS

Baseline taken with a REAL signed-in session before any Tauri run this plan: 818 bytes,
`md5 958bf6829589f20a8de935ebf7c2502b`, keys `refreshToken` (len=697) / `isLoggedIn` / `userData`;
`store_cache/steam_library.json` = 378 entries.

After ALL seed/verify/approve/deny launches across this checkpoint: `diff` produced NO output,
`md5` still `958bf6829589f20a8de935ebf7c2502b`, library still 378 entries. The sidecar's keyring
path never touched the shared Electron `configStore`, matching D-04's hard constraint by
construction (no code path in `SidecarKeyringTokenStore` imports `configStore` or
`TOKEN_STORE_KEY` — see `src/backend/sidecar/keyringTokenStore.ts`).

### Step 5 — openExternal / steam:// launch (REQ-28-05, incidental) — NOT VERIFIED

The Tauri build starts signed-out by design (D-02/D-03 — no login channel exists yet), so no
game was launchable during this checkpoint. Recorded honestly as **NOT VERIFIED** — this is not
claimed as a pass. The `openExternal` reader-thread fix (commit `ae963d68`, plan 28-02) remains
verified only by `cargo build` compiling cleanly and by code inspection of `start_reader()`'s new
`kind == "openExternal"` branch; it has not been hardware-exercised end-to-end because the
prerequisite (an authenticated, launchable Steam game inside the Tauri window) is out of scope
per D-03. Whoever ports the login channel next should hardware-verify this path as part of that
phase's own checkpoint.

---

## 3. Assumption A1 closed

**RESEARCH.md Assumption A1 / Open Question 1** asked: does a macOS Keychain Deny click surface
through `keyring::Error::PlatformFailure`, `Error::NoStorageAccess`, or some other variant?

**Answer, observed on real hardware:** `PlatformFailure`, specifically wrapping OSStatus `-128`
(`errSecUserCanceled` / "User canceled the operation."). Full debug output:

```
PlatformFailure(Error { code: -128, message: "User canceled the operation." })
```

`NoStorageAccess` was NOT observed on this hardware for the Deny click — the earlier research
uncertainty ("do these three failure modes flatten to the same variant, or map distinctly?") is
resolved for the Deny case specifically: it is `PlatformFailure`, not `NoStorageAccess`.

**Does 28-04's/28-02's classification logic need adjusting in light of this?** No adjustment
needed — checked directly against the shipped code, not assumed:

- `src-tauri/src/main.rs`'s `dispatch_rust_channel()` (plan 28-02) does not pattern-match on
  `PlatformFailure` vs. `NoStorageAccess` by name at all. It special-cases exactly one variant —
  `keyring::Error::NoEntry` (the healthy "no entry yet" first-run case) — and treats every OTHER
  variant, whatever its name, identically: log the `{:?}` debug and return
  `Err(format!("keyring:unavailable:{e}"))`. Since the observed Deny variant (`PlatformFailure`)
  is not `NoEntry`, it falls into that same generic "unavailable" bucket exactly as `NoStorageAccess`
  would have — the classification was already correct because it was written to be
  variant-agnostic beyond the one case that has different semantics (D-06's "no entry yet is not
  unavailable" rule from RESEARCH Pitfall 1).
- `src/backend/sidecar/keyringTokenStore.ts`'s `SidecarKeyringTokenStore` (plan 28-04) never
  inspects the `keyring::Error` variant name either — it treats ANY rejection from
  `requestRustInvoke()` (any string, `keyring:unavailable:PlatformFailure`,
  `keyring:unavailable:NoStorageAccess`, or otherwise) as "unavailable," logs one warning, and
  resolves to `''`/`false`. Both `PlatformFailure` and `NoStorageAccess` literal strings already
  appear as interchangeable fixtures across `keyringTokenStore.test.ts` and
  `electronUntouched.test.ts` (`grep -rn "NoStorageAccess\|PlatformFailure" src/backend/`,
  confirmed 2026-07-22) — the tests were already written not to depend on which one occurs.

**Conclusion:** no code gap exists; A1's uncertainty did not require a fix, only the recorded
answer above. No gap is being filed for `/gsd-plan-phase 28 --gaps`.

---

## 4. D-03 deferral restated

**Phase 27 UAT steps 2/3 remain BLOCKED**, NOT unblocked by this phase. This phase (28) proves
the keyring storage mechanism works — a synthetic token round-trips byte-identical through the
real Keychain via the sidecar, and Electron's stored session is provably untouched. It does
**not** wire any login channel (`startQRLogin`/`startCredentialLogin`), which is what Phase 27
UAT steps 2/3 actually require (signing in and seeing a real, populated Steam library inside the
Tauri window). D-03 explicitly locked this scope boundary during planning; ROADMAP.md's original
Phase 28 entry claim that this phase "unblocks Phase 27's UAT steps 2/3" was superseded at
planning time and is restated here as CLOSED/superseded, not reopened. The login-channel port is
recorded as the natural next slice in `SEAM.md` §3 (updated by this plan, see below).

---

## 5. Decisions taken under discretion

| Decision | What was chosen | One-line rationale |
|----------|------------------|---------------------|
| D-07 | Rust (`keyring` crate) talks to the Keychain, not Node shelling `/usr/bin/security` | D-05 already commits to building a sidecar→Rust channel; putting the Keychain call in Rust reuses that channel instead of adding a second subprocess-per-call pattern GameLib had already moved away from |
| D-09 | A small `TokenStore` interface (`isAvailable`/`getToken`/`setToken`/`clearToken`) with a registry, not a sidecar-only distinct config key | Keeps `user.ts`'s Electron path byte-identical (wrapped, not rewritten) while giving the sidecar path somewhere to live without a parallel ad hoc key scheme |
| D-10 | A generic, named-command `rustInvoke` request/response frame, not a keyring-specific one-off | D-05's stated intent is reusable infra for future ports (`dialog`/`clipboard`/`notification`/`screen`); a generic channel costs one new frame `kind` and one pending-map — barely more than a one-off |
| D-11 | Electron's plaintext fallback in `encryptToken()` is KEPT (not removed) | Out of this phase's stated boundary; the sidecar's own D-06 policy never persists plaintext regardless, so the asymmetry is contained and now explicitly documented rather than silently divergent |
| Open Question 2 | `openExternal` got its own minimal fire-and-forget fix (a dedicated `kind == "openExternal"` reader branch), NOT converted into a `rustInvoke` request/response call | Converting it would change `electronStub.shell.openExternal`'s contract and ripple into the Phase 27 launch flow — out of this phase's boundary. The minimal fix closes the verified silent-drop bug (RESEARCH Pitfall 2) without a behavior change; an explicit `else` diagnostic branch also now catches any future unrecognized frame kind so this class of bug cannot recur silently |

---

## Findings

### Finding 1 — A1's answer is `PlatformFailure`, not `NoStorageAccess`

See § 3 above for the full detail. Consequence: any future code that tries to distinguish "user
denied" from "keychain is broken/unavailable" by matching the `keyring::Error` variant alone
CANNOT do so — both surface as `PlatformFailure`. Telling them apart requires inspecting the
wrapped OSStatus code (`-128` = `errSecUserCanceled` for Deny). Checked and confirmed: no shipped
code in this phase currently attempts that distinction (see § 3), so this is recorded as a
constraint for future work, not a bug fixed here.

### Finding 2 — Self-owned Keychain items never prompt

The original Task 1 scaffolding performed create→read→delete in ONE process. macOS only
challenges a process for an item it does NOT already own — a process is never prompted for an
item it just created itself in the same run. This made the plan's originally-designed
verification (a single-process self-check reaching both the Approve and Deny prompts) structurally
unreachable: mode `"1"` can only ever prove the happy-path round-trip, never the Deny path or the
rebuild re-prompt. This required the `seed`/`verify` mode split (commit `7b9016bd`): `seed` writes
and deliberately leaves an entry; a REBUILD changes the binary's code-signing identity; `verify`
(a separate process) then reads an item it did not create, which is what actually makes macOS
treat it as foreign and present the authorization prompt. This is a genuine, hardware-confirmed
insight about macOS Keychain authorization semantics — recorded here so a future phase does not
design the same unreachable single-process test.

### Finding 3 — Scaffolding residue left behind by the Deny run

Because `keyring_self_check_verify()`'s failed `get_password()` call returns early (before its
own cleanup code runs), a Deny run leaves BOTH the `-selfcheck` Keychain entry AND the scratch
file `$TMPDIR/gamelib-keyring-selfcheck-seed.txt` behind on disk. This residue is real and
currently present on the developer's machine as of this writing. It is NOT cleaned up by this
task — Task 4's removal of the scaffolding code cannot retroactively delete state the scaffolding
already wrote, and the executor is instructed not to run destructive cleanup commands itself.
The exact removal commands are surfaced in `28-06-SUMMARY.md` for the orchestrator/user to run at
their discretion:
- Keychain entry: service `com.gamelib.launcher`, account `steam-refresh-token-selfcheck`
- Scratch file: `$TMPDIR/gamelib-keyring-selfcheck-seed.txt`

### Finding 4 — The scratch file is a plaintext-on-disk pattern that must not be reused for a real token

`keyring_self_check_seed()` writes the synthetic self-check value to a plaintext file under
`std::env::temp_dir()` so the separate `verify` process can compare against it across the process
boundary. This is harmless here because the value is synthetic
(`gamelib-selfcheck-<timestamp-nanos>`), never a real credential, and the whole mechanism is
scaffolding removed by Task 4. It is called out explicitly so this pattern — "write the
value-under-test to a plaintext tmp file to compare across processes" — is never copied for
anything that touches a real refresh token. D-06/D-08 already forbid any plaintext fallback in
the production path; this finding exists purely to prevent the scaffolding's plaintext-scratch-file
convenience from being mistaken for an acceptable production pattern later.

---

## Scaffolding removal record (Task 4)

The self-check trigger (`GAMELIB_KEYRING_SELFCHECK`, `keyring_self_check`/`keyring_self_check_seed`/
`keyring_self_check_verify`, `SELFCHECK_ACCOUNT_SUFFIX`, and the scratch-file helpers) was
scaffolding with an owner from the start (banner-marked `SCAFFOLDING (28-06 Task 1)` in three
places) and has been fully removed in this same plan, commit `a1966f7b`
("fix(28-06): remove keyring self-check scaffolding from main.rs"). The round-trip verdict and
the `keyring::Error` debug output above were captured BEFORE removal and are the durable,
reproducible record — a future reader who wants to reproduce the round-trip must temporarily
re-add an equivalent trigger; none exists in the shipped shell as of this commit.
`cargo build` confirmed clean with zero warnings and zero remaining `selfcheck` references
after removal.
