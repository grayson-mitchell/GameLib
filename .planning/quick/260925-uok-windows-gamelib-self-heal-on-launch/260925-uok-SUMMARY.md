---
phase: quick-260925-uok
plan: 01
subsystem: src-tauri/shell
tags: [windows, registry, deep-link, protocol-handler, self-heal, ffi]
requires:
  - 'src-tauri/src/main.rs .setup() closure'
  - 'windows-sys 0.60 (already declared)'
provides:
  - 'repair_windows_gamelib_protocol_registration (#[cfg(windows)] HKCU self-heal)'
  - 'gamelib_protocol_* pure decision helpers'
  - 'quick-260925-uok source-gate describe in tauriShellSource.test.ts'
affects:
  - '.planning/REQUIREMENTS.md decision point (a) / REQ-46-06 rationale'
  - '.planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md'
tech-stack:
  added:
    - 'windows-sys feature Win32_System_Registry (no new crate)'
  patterns:
    - 'REQ-46-07 pure-decision / FFI-I-O split'
    - 'fail-open T-34.5-G6-24'
    - 'region-scoped source gate with RED self-test'
key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
    - src-tauri/Cargo.toml
    - src/backend/__tests__/tauriShellSource.test.ts
    - .planning/REQUIREMENTS.md
    - .planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md
decisions:
  - 'Option 1 (self-heal on launch) implemented; options 2 (warn-only) and 3 (accept) rejected by the operator before planning'
  - 'New narrowly-scoped Windows repair fn rather than widening register_all() -- REQ-46-06 pin untouched'
  - 'windows-sys kept over winreg/windows-registry for consistency with the adjacent single-instance FFI'
metrics:
  tasks: 3
  commits: 3
  rust_tests_before: '234 passed / 0 failed / 2 ignored'
  rust_tests_after: '241 passed / 0 failed / 2 ignored'
  completed: 2026-09-25
---

# Quick 260925-uok: Windows `gamelib://` self-heal on launch — Summary

On Windows, a GameLib launch whose `HKCU\Software\Classes\gamelib\shell\open\command` is missing,
dangling, or pointing at another executable now rewrites all four installer-shaped values to point
at the running executable; a launch whose key already matches writes nothing.

## What was built

**Task 1 — pure decision helpers** (`08f24b05d`). Six unconditionally-compiled functions in
`src-tauri/src/main.rs`, placed immediately above the `#[cfg(windows)]` FFI banner, following
REQ-46-07's precedent that every non-FFI decision is a plain function unit-tested on any host:
`gamelib_protocol_command_exe`, `gamelib_protocol_paths_equivalent`,
`gamelib_protocol_repair_needed`, `gamelib_protocol_open_command`,
`gamelib_protocol_default_value`, `gamelib_protocol_default_icon`. Written TDD: 7 `#[cfg(test)]`
tests added first and observed failing with `E0425: cannot find function` before any
implementation existed. Comparison is deliberately filesystem-free — the incident that motivated
the feature left the stored value pointing at a *deleted* exe, so `canonicalize()` would fail on
exactly the case the repair exists for. The round-trip test asserts the repair's own output
satisfies its own detector; without it, a repair rewrites the user's registry every launch
forever.

**Task 2 — the FFI half, its Cargo feature, its call site, and the prose** (`f3972c70f`).
`#[cfg(windows)] fn repair_windows_gamelib_protocol_registration(identifier: &str)`: `CI=e2e`
short-circuit before the first registry call, then a two-call size-probe read of the command
key's default value, then — only when `gamelib_protocol_repair_needed` says so — a
create/set/close of all four installer values in the installer's own order. One `unsafe` block
with a SAFETY comment; no `unwrap`/`expect`/`panic!`/`?`; each write closes its own handle on both
the success and failure path. Logging carries the subkey path (our own constants) plus a coarse
`absent` / `unparseable` / `points-elsewhere` classification, never the stored command verbatim.
Call site added in `.setup()` immediately *after* the `#[cfg(target_os = "linux")]` block so the
nearest `#[cfg]` above the file's sole `register_all()` occurrence is still the Linux one.
Cargo.toml gained exactly one feature, `Win32_System_Registry`, with symbols confirmed by grepping
vendored `windows-sys-0.60.2` source. Decision-point (a) prose rewritten with all five required
bullets, including the last-launch-wins consequence on a multi-install machine.

**Task 3 — source gates, prose, todo closure** (`c3cc2ef44`). A new describe
`quick-260925-uok Windows gamelib:// HKCU self-heal on launch` with four gates, each followed by a
RED-proof self-test driving `loadMainRsCode(syntheticSource)`: call-site cfg (2 RED proofs),
region-scoped `CI=e2e` guard, no-`register_all()`-on-the-repair-path plus the one-call-site
re-assertion, and the fail-open token set. 16 new jest tests. The three superseded prose sites
corrected. Todo `git mv`'d to `completed/` with a `## Resolution` section.

## Verification — exact results

| Gate | Command | Result |
|---|---|---|
| Rust tests (baseline) | `cd src-tauri && cargo test --bin gamelib-shell` | **234 passed; 0 failed; 2 ignored** |
| Rust tests (after) | same | **241 passed; 0 failed; 2 ignored** — exit 0 |
| Rust tests (filtered) | `cargo test --bin gamelib-shell gamelib_protocol` | 7 passed; 0 failed — exit 0 |
| Compile | `cargo check --bin gamelib-shell` | exit 0. 9 warnings, all pre-existing (verified by a warning-by-warning diff against a clean rebuild — **zero** from new code) |
| jest trio | `npx jest tauriShellSource cargoFeatures windowsDeepLinkSuppression` | 3 suites, **232 passed** — exit 0 |
| one-call-site | the plan's `node -e` register_all counter | `OK: exactly one register_all() call site` — exit 0 |
| Planning gates | `pnpm planning-gates` | **13/13 passed** — exit 0 |
| Typecheck | `pnpm codecheck` | exit 0 |
| Prettier (TS + md) | `npx prettier --check src/backend/__tests__/tauriShellSource.test.ts .planning/REQUIREMENTS.md .planning/todos/completed/...md` | `All matched files use Prettier code style!` — exit 0 |
| Prettier (`.rs` / `.toml`) | `npx prettier --check src-tauri/src/main.rs src-tauri/Cargo.toml` | **exit 2** — see deviation 1 below |

`cargo fmt` / `cargo fmt --check` were NOT run (plan fact F4).

## Deviations from Plan

### 1. `[Rule 3 — blocking] The plan's prettier gate is unsatisfiable for `.rs` and `.toml` paths`

- **Found during:** Task 1 `<verify>`, again in Task 2.
- **Issue:** `npx prettier --check src-tauri/src/main.rs` exits **2** with
  `[error] No parser could be inferred for file "...main.rs"`. Not a formatting failure — prettier
  ships no Rust parser, and none for `Cargo.toml` either. Confirmed structural, not caused by my
  change: the identical command against the untouched `src-tauri/build.rs` produces the same
  error. Neither path is in `.prettierignore`.
- **Resolution (gate NOT weakened):** the repo's own authority on this is `.husky/pre-commit`,
  whose header states "files with no inferable parser exit 0" and which checks staged content via
  `prettier --check --stdin-filepath <abs path>`. That invocation was run for both paths and exits
  **0** — so the repo's actual formatting gate passes. I did not edit `.prettierignore`, did not
  drop the check, and did not substitute a bare `.`.
- **Additional substitute check, since prettier cannot see Rust at all:** I copied `main.rs` into
  the scratchpad and ran `rustfmt --check` against the copy (read-only; the repo file was never
  touched, and `cargo fmt` was never run). The pre-existing debt F4 describes is real —
  897 diff lines at edition 2021, 978 at edition 2024. Against edition 2024 (which matches the
  style actually on disk), my new code produced exactly **one** hunk, a multi-line
  `if RegOpenKeyExW(...)` call. I reformatted that one construct to rustfmt's preferred shape, and
  re-ran: **zero** rustfmt hunks now touch any line I added. Net new formatting debt: none.

### 2. `[Rule 2 — missing critical annotation] The six pure helpers carry `#[cfg_attr(not(windows), allow(dead_code))]``

- **Found during:** Task 1.
- **Issue:** The plan says "None of them carry a `#[cfg]` attribute. That is the point: they
  compile and are tested on macOS and Linux CI legs too." Taken literally that leaves six new
  `function is never used` warnings on every non-Windows non-test build, because their only
  non-test caller is `#[cfg(windows)]`.
- **Fix:** each helper carries `#[cfg_attr(not(windows), allow(dead_code))]` — a conditional
  *lint* attribute, not conditional compilation. The functions are still compiled and still
  unit-tested on every host, so the plan's stated *point* is fully preserved. This is the exact
  annotation all seven neighbouring pure `windows_*` single-instance helpers already carry, for
  the identical reason. Stated in the new block's own doc comment so a reader is not misled into
  thinking the functions are Windows-gated.

### 3. `[documentation] installer.nsi citation marked as a generated artifact`

- Per the checker warning folded into the dispatch: the doc comment citing
  `src-tauri/target/debug/nsis/x64/installer.nsi:922-925` now explicitly notes that path is a
  **generated build artefact (`src-tauri/.gitignore:2`) that does not resolve on a clean
  checkout**, with instructions to re-derive it via a Windows bundle build. The four value shapes
  are transcribed inline, so nothing depends on reopening that file. I did not open it.

## NOT DONE — stated rather than omitted

- **The live Windows gate has NOT been run**, and is the single outstanding item. Nothing in this
  work read a real registry key, wrote a real registry key, or opened a real `gamelib://` URL. Per
  the dispatch's hard safety rule the app was never launched and
  `HKCU\Software\Classes\gamelib` was never touched — the operator's machine holds a
  hand-restored value from the 2026-09-25 session, and running the app would have rewritten it as
  a build side effect, which is precisely what the `CI=e2e` guard in this plan exists to prevent.
- **The `#[cfg(windows)]` FFI function is exercised by no automated test.** It is *compiled* by
  `cargo check`/`cargo test` on this Windows host (which is the only proof obtainable desk-side
  that the arm compiles at all) and *executed* by nothing. This follows the
  `acquire_single_instance` precedent, but the consequence should not be glossed: the source gates
  prove the shape of the code, not that a real repair works.
- Six concrete live-gate steps — including the anti-churn re-launch check and the
  delete-the-whole-subtree case — are written into the completed todo's `## Resolution` for a
  future operator.
- **Not verified:** behaviour on a machine with two GameLib installations (last-launch-wins is
  documented in the decision-point block, not measured), behaviour under a `REG_EXPAND_SZ` stored
  value (accepted by the reader, never observed), and behaviour when the HKCU hive is
  access-denied (the fail-open branch is written and compiled, never exercised).

## Deferred Issues (out of scope — NOT fixed)

A post-task regression sweep over the nine other jest suites that parse `main.rs` found
**8 passed, 1 failed**. The failure is `src/backend/sidecar/__tests__/appRootResolution.test.ts`
"positive arm", at line 262: it builds extensionless runner-binary paths
(`legendary`, `gogdl`, `nile`, `comet`) but the shipped Windows files are `legendary.exe` etc., so
`existsSync` is false on any Windows machine. Proven pre-existing and untouched by this task —
`git diff 9df92784a HEAD -- src/backend/sidecar/ public/bin/` is empty and the assertion is
byte-identical at the base commit. Left unfixed per the scope boundary and written up in
`deferred-items.md` beside this summary. Every other suite in the sweep passed.

## Threat Flags

None. The only new surface is the HKCU write, which is already in the plan's threat register
(T-UOK-01 through T-UOK-06, T-UOK-SC) and whose `mitigate` dispositions are all implemented:
classification-only logging (T-UOK-01), the region-pinned `CI=e2e` guard (T-UOK-02), the
no-`unwrap`/`?` fail-open gate (T-UOK-03), and the unit-tested malformed-input parser (T-UOK-04).
No package was installed in any ecosystem; one cargo feature was enabled on an already-resolved
dependency, and `cargoFeatures.test.ts` was re-run to prove the Cargo.lock crate-name pin is
unchanged rather than assuming it.

## Known Stubs

None.

## Commits

| Task | Commit | Message |
|---|---|---|
| 1 | `08f24b05d` | `feat(quick-260925-uok): pure gamelib:// protocol-command decision helpers` |
| 2 | `f3972c70f` | `feat(quick-260925-uok): self-heal the Windows gamelib:// HKCU registration on launch` |
| 3 | `c3cc2ef44` | `test(quick-260925-uok): source gates for the HKCU self-heal, prose fixes, close the todo` |

## Self-Check: PASSED

All five modified files exist on disk; all three commit hashes resolve in `git log`; each
`must_haves` artifact carries its required token (`fn gamelib_protocol_repair_needed` in
`main.rs`, `Win32_System_Registry` in `Cargo.toml`, `gamelib_protocol_repair` in
`tauriShellSource.test.ts`, `## Resolution` in the completed todo); and the todo is confirmed
absent from `.planning/todos/pending/`.

</content>
</invoke>
