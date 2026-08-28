---
phase: 35-electron-cutover-remove-the-electron-build
plan: 08
subsystem: shell
tags:
  [
    d-05,
    d-08,
    wake-lock,
    power-assertion,
    iokit,
    tauri,
    req-35-06,
    t-35-31,
    t-35-32,
    t-35-33,
    t-35-34,
    t-35-sc
  ]
status: TASKS 1-2 COMPLETE — Task 3 (blocking human-verify, live `pmset` observation) OUTSTANDING

# Dependency graph
requires: [35-04, 35-07]
provides:
  - '`wake_lock_start(kind)` / `wake_lock_stop(id)` as `dispatch_rust_channel` arms — real per-platform OS power assertions, replacing the D-08 no-op'
  - '`wake_lock_kind()` + `WakeLockKind` in main.rs — the pure two-literal validator, with no default arm'
  - '`WakeLockRegistry` — id→kind bookkeeping plus per-platform handle maps under one `Mutex`, so `stop` releases exactly the assertion its id names'
  - 'A shutdown release on `RunEvent::Exit`, so no assertion outlives the process'
  - '`RUST_WAKE_LOCK_START` / `RUST_WAKE_LOCK_STOP` on `RUST_INVOKE_CHANNELS`'
  - '`powerSaveBlocker` as a real forwarder with a JS-minted id, required `type`/`id` params, and an honest `isStarted()`'
  - 'Fixed `appShellFlowRegistration.ts` lock/unlock — previously passed no kind and no id'
affects: [35-15, 35-19]

# Tech tracking
tech-stack:
  added:
    - 'objc2-core-foundation 0.3.2 promoted from an already-resolved TRANSITIVE dependency to a direct macOS one at its identical version — NO new crate entered Cargo.lock'
  patterns:
    - 'Read platform constants out of the SDK header on the machine, not out of research prose that marked itself `[ASSUMED]` — `IOPMLib.h` is the authority for both the constant names and their string values, and the values are what `pmset` prints'
    - 'Extract the pure decision (`wake_lock_kind`) from the effectful syscall, the same split 35-07 used for `deep_link_decision` — the validator is then testable with no OS at all'
    - 'Make a parameter REQUIRED rather than defaulted when the two possible values are semantically distinct: it converts a silent collapse into a compile error, and it found a broken call site the plan had not listed'
    - 'A `stop`-releases-the-right-thing test must release the OLDEST lock first. Releasing newest-first cannot distinguish "release my id" from "release the last one" — the assertion passes against both'
    - 'Prove a new gate non-vacuous by breaking the implementation under it and watching it go red, before trusting a green'

key-files:
  created:
    - src/backend/sidecar/__tests__/wakeLock.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/main.rs
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/electronStub.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/__tests__/lifecycleStub.test.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts

key-decisions:
  - "33-RESEARCH's plugin verdict was RE-CHECKED and HELD. No plugin was adopted; no Package Legitimacy Gate was needed. Evidence below."
  - 'The two commands are `dispatch_rust_channel` ARMS, not `generate_handler!` entries. This is a deliberate deviation from the plan''s acceptance criteria, which are internally inconsistent on this point — argued in full below.'
  - '`launcher.ts` is UNCHANGED. The sync/async bridge did not force a change there; it forced the id to be minted JS-side.'
  - 'No new crate. The macOS arm reaches IOKit through `#[link(name = "IOKit", kind = "framework")]`; `objc2-core-foundation` was promoted from transitive to direct at its identical version, leaving the Cargo.lock crate-name set unchanged.'
  - '`appShellFlowRegistration.ts` was fixed although the plan did not list it — it is the live lock/unlock path under Tauri and it passed neither a kind nor an id.'

# Metrics
tasks-completed: 2
tasks-outstanding: 1
commits:
  - 387d90df5
  - 71a70b3ed
---

# Phase 35 Plan 08: Real OS Wake Lock Summary

`powerSaveBlocker` now holds genuine, per-kind OS power assertions through two Rust
`dispatch_rust_channel` arms and an id registry that makes `stop` precise, with a shutdown release
that prevents leaks — replacing a D-08 no-op that returned `-1` and held nothing.

## 1. The plugin re-check — verdict HELD

Re-checked with `cargo search` plus the crates.io and GitHub APIs on **2026-08-29**. This is the
A3 assumption 33-RESEARCH flagged as not independently verified.

| Candidate | Latest version | Last publish | Last repo push | Signals | Verdict |
|---|---|---|---|---|---|
| `tauri-plugin-nosleep` (pevers) | `2.0.0-beta.1` | 2024-02-25 | 2024-03-17 | Never graduated beta; no `repository` field on crates.io; 8,515 downloads all-time | **Not maintained** — 2 years 5 months stale |
| `tauri-plugin-screen-wake-lock` (cijiugechu) | `0.1.0` | 2025-12-22 | 2025-12-22 | Single version; repo has exactly 3 commits, all on its publish day; 0 stars; 38 downloads all-time; no description | **Fails on two counts** — see below |
| `tauri-plugin-keepawake` (thewh1teagle) | `0.1.1` | 2025-01-14 | repo returns **404** | Repo gone since 33-RESEARCH read it | **Worse than previously recorded** |

`tauri-plugin-screen-wake-lock` was the specific candidate A3 named, so it got the closest look. It
fails **independently of maintenance**: its own README says *"Keep the display awake while enabled
(desktop only)"* and its API is `setEnabled`/`disable`/`isSupported` — a single boolean display
lock. It has no system-sleep assertion at all, so it cannot express the display/system distinction
this plan exists to preserve. Adopting it would have hard-coded the T-35-32 collapse.

**Conclusion: 33-RESEARCH's verdict holds on stronger evidence than it originally had.** No plugin
was added, so the Package Legitimacy Gate was not triggered.

## 2. `launcher.ts`: NOT changed, and why the bridge did not force it

`src/backend/launcher.ts` is byte-identical (`git diff HEAD -- src/backend/launcher.ts` is empty).
It already passed a kind (`start('prevent-display-sleep')`) and an id (`stop(powerDisplayId)`).

The sync/async mismatch is real but it did **not** reach the call sites. Real Electron's
`start()` is synchronous and returns a number that `launcher.ts:190` assigns directly; the Tauri
command is a Promise, and a synchronous function cannot await one. Two options existed — make the
call sites async, or mint the id locally. **The id is minted JS-side** and returned in the same
tick, with the Rust id resolved into `heldWakeLocks` when the round-trip lands. Nothing became
async and no call site moved.

Two consequences worth recording:

- **Ids start at 1, never 0.** `launcher.ts`'s re-entry guard is `if (!powerDisplayId)`, which
  reads 0 as "no lock held" — a 0 id would take a second display assertion on every launch and
  leak the first. Pinned by a test on both the JS and Rust sides.
- **There is a window where a JS id is live but has no Rust id yet.** A `stop()` landing in that
  window is handled explicitly: it deletes the entry, and `start`'s own `.then` sees the missing
  entry and releases the assertion that arrives late. Covered by
  `a stop that races an in-flight start still releases the assertion Rust ends up taking`.

## 3. Shutdown release, and behaviour when the power API is unavailable

**Shutdown.** `wake_lock_release_all()` is called from the existing `RunEvent::Exit` handler in
`main.rs`, alongside `state.shutdown_child()`. It drains the registry and releases every platform
handle. It recovers a poisoned mutex via `into_inner()` rather than propagating — refusing to
release on the exit path is the one outcome worse than releasing from a poisoned registry — and it
returns immediately if the `OnceLock` was never initialised, so an exit where no game ever ran does
not panic. That last case has its own test.

This is not redundant with OS cleanup: macOS does release IOKit assertions when the owning process
dies, but Linux's `systemd-inhibit` children would be orphaned and Windows' flag thread never re-run.

**Power API unavailable.** Every failure arm logs `[shell] WARN: wake lock ... -- continuing` and
returns `Err`; none panics. A failed acquire **rolls back its bookkeeping entry** before returning,
so a failure cannot leave a phantom id that a later `stop` would "release". On the JS side a
rejected `requestRustInvoke` is caught, logged, and the id dropped from the held map, so `start()`
never throws into a game launch and a later `stop()` on that id is a quiet no-op.

`grep -vE '^\s*(//|/\*|\*)' src-tauri/src/main.rs | grep -c 'unwrap()'` is **41 before and 41
after**. The production wake-lock block (main.rs lines 3972–4412) contains **zero**
`unwrap()`/`panic!`/`expect(`; the only `panic!` in the feature is inside a `#[cfg(test)]` assertion.

## 4. Crate delta — independently recomputed, both directions

One crate was added to `Cargo.toml`: **`objc2-core-foundation 0.3.2`**, `default-features = false,
features = ["std", "CFString"]`, macOS-only. It supplies the `CFString` that IOKit's
`CFStringRef` parameters need. It was already resolved in `Cargo.lock` as a transitive dependency
of `tao`/`objc2-core-graphics`/`rfd`, so this is a promotion to a direct dependency at its
identical pinned version — the same discipline the existing `dispatch2` and `objc2-web-kit`
comments in that file already establish. IOKit itself is reached through
`#[link(name = "IOKit", kind = "framework")]`, not a bindings crate.

Delta computed by recomputing the name set from **both** sides and `comm`-ing them, not by counting
`+name =` lines in the diff:

```
grep '^name = ' Cargo.lock | sed 's/^name = //' | tr -d '"' | sort -u
```

| | Count |
|---|---|
| Unique crate names BEFORE | 510 |
| Unique crate names AFTER | 510 |
| **Appeared** (`comm -13`) | **(none)** |
| **Disappeared** (`comm -23`) | **(none)** |

The entire `Cargo.lock` diff is **one line** — `"objc2-core-foundation",` added to
`gamelib-shell`'s own `dependencies` array at line 1274. Because the crate-name *set* is unchanged,
`cargoFeatures.test.ts`'s `EXPECTED_LOCKFILE_CRATE_NAMES` pin **did not need re-pinning and stays
green**, which was confirmed by running it rather than assumed.

## 5. Deviations from the plan

### D1 — `dispatch_rust_channel` arms, NOT `generate_handler!` (deliberate; the plan is self-inconsistent here)

The plan's Task 1 acceptance criteria require the two commands in `tauri::generate_handler![...]`.
The plan's own `must_haves.key_links` and Task 2 require the JS side to reach them via
`requestRustInvoke`, "mirroring `clipboard.writeText`'s `RUST_CLIPBOARD_WRITE_TEXT` forwarding".

**These two requirements cannot both be satisfied.** They target different transports:

- `generate_handler!` is the **renderer→Rust** surface (`sidecar_invoke`, `sidecar_send`,
  `open_external`, `sidecar_store_snapshot`).
- `requestRustInvoke` emits a `rustInvoke` frame from the **sidecar**, which Rust routes through
  `dispatch_rust_channel`'s `match` — where every comparable arm lives (`clipboard_write_text`,
  `tray_set_icon`, `app_hide`, the keyring and dialog arms).

Registering in `generate_handler!` only would mean the sidecar's calls never arrive. Registering in
both would add dead code *and* hand the webview a power-management capability it has no use for,
against the D-02 zero-renderer-capability-grant stance that `clipboard_write_text`'s own comment
cites. **I followed the architecture and the `key_links` must-have, and did not add dead
`generate_handler!` entries purely to satisfy a grep.** The two `grep ... generate_handler!`
acceptance criteria are therefore **not met, by design**; the equivalent real check is that both
arms appear in `dispatch_rust_channel` above the `rustInvoke:unknown-channel` catch-all, which
`tauriShellSource.test.ts` now pins.

### D2 — `appShellFlowRegistration.ts` fixed (file not in the plan's list)

The plan named `launcher.ts:190` and `main.ts:650/655` and said not to port `main.ts`. Grep found a
third, unlisted site: `src/backend/sidecar/appShellFlowRegistration.ts`'s `lock`/`unlock` handlers,
calling `powerSaveBlocker.start()` with **no kind** and `powerSaveBlocker.stop()` with **no id**.

Under Tauri this is *the* live lock/unlock path — it is the sidecar mirror of the `main.ts` block
that dies at the point of no return. Leaving it would have shipped a working seam with a broken
consumer: downloads and games would both have failed to hold anything, or collapsed onto one kind.
Fixed to pass `'prevent-app-suspension'` (playing=false, the download case) and
`'prevent-display-sleep'` (playing=true), and to pass each `stop` the id its own `start` returned.
The stale D-08 "logged no-op" warnings in that file were removed with the no-op they described.

### D3 — `start`/`stop` parameters made REQUIRED

Rather than defaulting `type`, both parameters are required, matching real Electron's signature.
A default kind is precisely the silent collapse T-35-32 describes. Making it required turned D2's
broken call site into a **compile error** rather than something to notice by reading — `tsc` named
both bad calls immediately.

### D4 — test-gate declarations extended (not widened)

Two existing gates required a declaration for the new work. Neither was loosened:

- `tauriShellSource.test.ts` pins the set of `dispatch_rust_channel` arms. Its own comments show
  this is an **inventory-declaration discipline, not a ban** — 34.3, four 34.4.1 plans, and the
  `app_hide` quick task each added entries with plan, decisions and an explicit PROOF STATUS. The
  two wake-lock arms were declared the same way, including an honest statement that the syscalls
  are not automatically tested.
- `testContainment.test.ts` requires every suite in the directory to be classified.
  `wakeLock.test.ts` was added to `STRUCTURALLY_CONTAINED_SUITES` with its import graph read rather
  than assumed, and the file count recomputed by running `readdirSync` (56 = 4 + 52).

### D5 — `graphify update .` NOT run

`CLAUDE.md` asks for `graphify update .` after modifying code. It was **not** run: this repo's
`graphify update` is known to delete `graphify-out/graph.html`, which is currently a 36 MB
artifact. Destroying it silently as a side effect of a wake-lock plan seemed worse than flagging
it. **Run it yourself if you want the graph refreshed.**

## 6. A vacuous test, caught and fixed

The first version of the start/stop pairing test — the single most load-bearing assertion in this
plan, since it is the T-35-31 mitigation — **passed against a deliberately broken `stop`** that
released whichever lock was added last.

The cause: it released the two locks in *reverse* order (newest first). In that order the
"release the newest" bug is indistinguishable from correct behaviour — the newest lock *is* the
caller's on the first release, and the only one remaining on the second. The test now releases the
**oldest first**, which is the discriminating case, and was confirmed **RED** against the same
break before the break was reverted and the suite went green. The reasoning is recorded in the
test body so the order is not "tidied" back later.

This is the only reason the pairing assertion is now trustworthy; a green on the first version
would have proven nothing.

## 7. Verification

| Check | Result |
|---|---|
| `cargo test --manifest-path src-tauri/Cargo.toml` | **191 passed**, 0 failed, 1 ignored (11 new wake-lock tests) |
| `cargo build` | clean, **zero warnings** |
| `pnpm test --selectProjects Backend` | **4321 passed**, 3 failed — exactly the known-red `lzmaLoader`/`decompressPool` baseline. Run named the project and reported 4326 tests, so `--selectProjects` did not silently no-op |
| `pnpm test --selectProjects Backend -- wakeLock` | **12 passed** |
| `pnpm codecheck` | **exit 0** |
| `npx eslint --quiet` on all 8 touched TS files | **0 errors** (warnings only, matching pre-existing patterns in those files) |
| `npx prettier --check` on touched files | Only `tauriShellSource.test.ts` dirty, and **only in pre-existing Plan 06 hunks at lines 386–428**; my added lines are clean. Left alone per the repo-wide-red prettier rule |
| `grep -c 'logged no-op (D-08' electronStub.ts` | `0` |
| `grep -c 'D-08' electronStub.ts` | `1` (rationale rewritten, not dropped) |
| `git diff HEAD -- src/backend/launcher.ts` | empty |
| non-comment `unwrap()` count in main.rs | `41` → `41` |

A one-off full-suite run also showed `enrichmentFlows.test.ts`'s `getAnticheatInfo` case failing;
it **passes in isolation** and did not reproduce on a second full run. That is the known
"full suite manufactures failures under load" flake on a network-backed channel, unrelated to this
plan.

## Known Stubs

None. `isStarted()` was the last lying accessor in this seam and now answers from real state.

## Threat Flags

None. This plan introduces no new network endpoint, auth path, or schema change. The one new trust
boundary — a sidecar-supplied `kind` string selecting an OS assertion — is the one the plan's own
threat register already covers as T-35-32, and it is mitigated by rejection rather than defaulting.

## Task 3 — OUTSTANDING (blocking human-verify)

Not attempted and not self-certified. It needs a live `pnpm tauri:dev` run and `pmset -g assertions`
observations across six steps: baseline, display assertion during play, its release, a **system**
assertion during a depot download, its release, and a force-quit with an assertion held.

Two things worth knowing before running it:

- The assertion names `pmset` prints are `PreventUserIdleDisplaySleep` and
  `PreventUserIdleSystemSleep` — taken from the SDK header, and chosen partly *because* they make
  the two kinds distinguishable by eye in that output. The human-readable labels beside them will
  read `GameLib: a game is running` and `GameLib: a download is in progress`.
- **Windows and Linux must be recorded NOT ATTEMPTED**, not inferred. The Windows arm in
  particular carries the untested T-35-33 risk: `SetThreadExecutionState` is per-thread, and while
  the flags are deliberately held on a dedicated long-lived thread for exactly that reason, no
  automated test on any platform can observe whether that thread actually holds them.
