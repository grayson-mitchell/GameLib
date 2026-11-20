# Phase 82: Guardrails, hygiene and shared safety primitives - Research

**Researched:** 2026-11-20
**Domain:** Test-suite health and drift gates (jest 29 / ts-jest, Python planning gates), a new Tauri-free Rust safety crate (`gamelib-safety`) reached by TS through `rustInvoke`, guarded destructive paths in the Node sidecar, dead-code deletion
**Confidence:** HIGH for repo facts (every red, delete site and gate below was read or run this session); MEDIUM for the Windows CI behaviours and the Rust API shape (proposal, not yet compiled)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Red-suite policy (FND-01, criterion 1)**
- **D-01:** The green bar is the **full gate set**, not just the backend jest project. That means `pnpm test` across every jest project (backend, frontend, meta) plus the ratchet gates: `backend-di-ceilings`, `steam-line-ceiling`, `find-deadcode`, `lint` (`meta/lintScoped.cjs`), `i18n --fail-on-update`, `gameinfo-narrowing-ceiling`, `planning-gates`. Exit condition: the pre-push hook passes **without `--no-verify`**.
- **D-02:** The red list must be **re-measured at the start of the phase** from a clean `git worktree add --detach` checkout, as 78-TEST-HEALTH did. The "Known red" list in `80-HANDOFF.md` is stale. Quick 261117-pfj fixed all 13 suites on 2026-11-17, but new reds have appeared since then (themeTokens, the jestMock ratchet). Don't trust any list. Measure.
- **D-03:** Retiring a suite requires **per-suite operator approval**. The executor proposes the retirement with a reason. The suite is deleted or skipped only after sign-off, so plans that retire suites need a `checkpoint:decision`. Fixing is the default. Never widen a baseline or ceiling to get a gate green (same rule as Phase 78 and quick 261117-pfj).
- **D-04:** The ledger is a **single phase doc**, `82-TEST-LEDGER.md`, in the style of `78-TEST-HEALTH.md`: proof head sha, per-suite verdict (fixed with cause and commit, or retired with reason and approval date), plus the full-run counts. Retired suites are deleted outright, so no machine-read retirement file or gate exists.

**Vacuous-pass guards (FND-01, criterion 2)**
- **D-05:** Every census-style gate gets **both** guards: (a) an assertion that the scanned count is at or above a pinned floor (the 71-19 "vacuous EOF pin" pattern; `rendererZodGuard.test.ts` "scan is not vacuous" is an in-repo example), and (b) a deliberate empty or truncated-input test that must fail. They apply to `ipcDomainCensus` and `flowRegistrationCensus` (named by the criterion) **and** to every other census-style gate the researcher finds (e.g. `phase70PassthroughCensus`, `bridgeCensus`, moduleStateCensus, the ceiling scanners).

**Where the safety primitives land (FND-02)**
- **D-06:** **One Rust implementation, adopted by live TS now.** The tri-state type and `safe_path` are built once in Rust, and the current TS destructive paths call it through `rustInvoke`. A rejected or failed `rustInvoke` reads as **Unknown, so the op refuses**. Later port slices call the crate directly. No parallel TS reimplementation. — **Reversibility:** costly — every guarded TS call site gains a rustInvoke dependency; undoing it means re-inlining guard logic at each site.
- **D-07:** **New small Tauri-free crate** (working name `gamelib-safety`, final name at Claude's discretion). It follows the existing crate recipe in `src-tauri/crates/README.md` (dispatch op, shell dispatch arm, `EXPECTED_LOCKFILE_CRATE_NAMES` updated in the same commit). Its API must let Phase 83 re-home it into `gamelib-core` without changing the API.
- **D-08:** Also in scope: a Rust **`FakeHome`** test helper (the Rust twin of `createFakeHomeProfile()`), and a **rules section in `src-tauri/crates/README.md`** stating "destructive guards refuse on Unknown; readers distinguish absent from could-not-read" and "one shared `safe_path`; never derive a trust root from the data being validated".

**Coverage of the sibling guarantee and guards (FND-02, criteria 3-4)**
- **D-09:** The **known nested co-install bug in TS `uninstallBottleGameDirectly`** (`src/backend/storeManagers/steam/gameUninstall.ts:671`) is **fixed in this phase** through the shared primitive and covered by the nested-installdir table row. It is not deferred as a port divergence.
- **D-10:** "Never deletes a sibling" covers **every recursive delete GameLib itself performs on uninstall**: Steam native and bridge, sideload, and the GameLib-side folder/prefix deletes for Epic, GOG and Amazon. It does **not** cover deletes performed inside the legendary/gogdl/nile binaries.
- **D-11:** The guarded destructive ops are uninstall (all stores, per D-10); **bottle/prefix removal**, meaning both the Steam bridge bottle removal and the `shouldRemovePrefix` prefix delete on uninstall for every store; and **`resetHeroic`** (`src/backend/utils.ts:379`). `clearCache` is **not** guarded: it drops rebuildable caches only.
- **D-12:** Criterion 3 needs **one injected-rejection test per guard** (a rejected rustInvoke or an unreadable input, asserting refusal and that nothing was deleted).

**Refusal UX**
- **D-13:** A refusal shows an **error in the existing bottom-right notice stack**. It names the game and the reason in plain words and says nothing was deleted, e.g. "Couldn't uninstall X: GameLib couldn't confirm the install location. Nothing was deleted." A log line names the guard that refused. The tile returns to its prior state (no stuck "Uninstalling"; cf. the explicit `done` emit already in `uninstallBottleGameDirectly`). Retry means clicking again. No new dialog and no retry button. Copy goes through i18n.
- **D-14:** **All guards run before any delete.** An op with several delete targets (e.g. uninstall plus remove prefix) deletes nothing unless every guard passes. The notice names the check that failed.

**Delete-path edge policy (criterion 4 table semantics)**
- **D-15:** **Symlinks are unlinked, never followed.** A symlinked install root is removed as a link, and the target data survives. A symlink inside the tree is unlinked, never recursed through. The same applies to Windows junctions.
- **D-16:** **Another known install nested under the delete target means refuse**, with a notice naming the other game. "Known install" means any store's library entry. No delete-around-it.
- **D-17:** Containment and sibling comparisons use the **canonicalized on-disk real path**, case-folded and NFC-normalized on case-insensitive volumes. If canonicalization fails, the answer is **Unknown, so the op refuses**.
- **D-18:** The three-OS proof is **CI only**. The Rust adversarial table (nested installdir, `.\x`, `C:\x`, UNC, symlink, case, NFC/NFD) runs under `cargo test` on the existing windows/macos/ubuntu matrix and creates real symlinks and junctions on each runner. This phase needs no live session.

### Claude's Discretion
- Format and location of the `utils.ts`/`bootstrap.ts` responsibility inventory and of the milestone-wide state-ownership table (the research suggests a phase doc. Each store/cache has exactly one owner per slice boundary, and the table is sequenced so no owner moves twice).
- How far the dead-export sweep goes (start from the knip baseline; lower the baseline in the same commit as each deletion).
- The crate's final name and its exact API shape, within D-06/D-07.
- Exact notice wording, within D-13.

Already decided (carried forward, not re-asked):
- `CI=e2e` mock backends (`*/e2eMock.ts` and the bootstrap branch) are **deleted** (operator decision 2026-11-17, REQUIREMENTS-v0.11 Out of Scope).
- `src/backend/sidecar/fileStore.ts` is deleted **only after a live-or-dead check** (FEATURES says dead per `store_backend.ts:63`; ARCHITECTURE reads it as the owner of the renderer store bridge). If it's live, it's Phase 85 scope.
- Other zero-risk deletions per criterion 5: type-only files, dead exports, `legendary/commands/*`.

Folded Todos:
- `2026-11-18-themetokens-render-site-census-finds-37-sites-expects-34.md`: `themeTokens.test.ts` finds 37 `.is-link` render sites against a pin of 34. It's a red suite under D-01, so fix it (or retire it with approval, per D-03).
- `2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md`: `backend-di-ceilings` jestMock ratchet red on five frontend tests. It's a ratchet gate under D-01, and the fix is rewriting the tests to drop `jest.mock`, never raising the baseline.

### Deferred Ideas (OUT OF SCOPE)
None. (Ten keyword-matched todos reviewed and not folded: Windows releases unsigned; packaged app blank render; depot `optionaldlc`; winebus IOHID PowerA wedge; Amazon store-exit refresh live-verify; Steam verify/move install; restart note flash; download queue "Finished Installation" at handoff; Steam native invite picker; protonfixes import tool; x86 shim flat API parity.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Every backend test suite is green, or retired with a recorded reason, before the first port slice; drift-gate suites (IPC census, flow-registration census) cannot pass vacuously | "Measured red set" (the actual reds, cause and fix per suite), "Census gate matrix" (every gate, its floor, how to add the empty-input test), CI-only reds section |
| FND-02 | Destructive operations (uninstall, bottle removal, store reset) refuse when a check returns "unknown"; uninstalling a game never deletes a sibling game co-installed beside it, on macOS, Windows and Linux | "Recursive delete inventory", "gamelib-safety API proposal", "Rust test strategy" (adversarial table, junctions/symlinks on Windows CI), "Refusal UX" |
</phase_requirements>

## Summary

The phase has more already-done work than CONTEXT assumes and a few traps CONTEXT does not mention. Measured from a clean worktree of HEAD `21a22ad78` plus a main-tree rerun, the red set is small: **5 jest suites** (`storeKinds`, `createStores`, `tauriShellSource`, `acfUpdateReplay`, `themeTokens`) and **1 ratchet gate** (`planning-gates`: `STATE.md` has `Plan: 20 plans executed`). `ipcDomainCensus` and `flowRegistrationCensus` are green, and **both already carry pinned floors**; what they lack is only the deliberate empty-input test. The `backend-di-ceilings` jestMock todo is already resolved (quick 261117-omv). The nested co-install bug at `gameUninstall.ts:671` was **already fixed** in TS (commit `237a1b41d`, `installdirShape`); the genuinely unguarded recursive deletes are GOG `rmSync(install_path)`, sideload `rmSync(dirname(executable))` (a sibling-deletion hazard when the exe sits in a flat folder), the `removePrefix` string-equality guard (runs AFTER the install is already deleted), the bridge bottle removal (lexical containment, plus an external `cxbottle --delete`), and `resetHeroic` (fire-and-forget `send`, always relaunches).

Two scope claims in the criteria are false and need an operator decision before they become tasks: `legendary/commands/*` is **not** zero-risk (14 files, 10 live importers, `base.ts` is in the runtime bundle and exports zod brands used by `save_sync.ts`, `user.ts`, `games.ts`, `library.ts`), and the "type-only files" in FEATURES all have importers (typed, erased at runtime but live at compile time). The genuinely zero-risk set is: `fileStore.ts` (verified dead), the `CI=e2e` mock surface, `src/common/types/proxy-types.ts`, and the 19 dead `src/backend` exports in the knip baseline.

The environment also has **CI reds outside D-01's named set** that the operator should rule on: Test CI (`tauriShellSource`, same as local), Rust test macOS clippy (`deprecated` at `gamelib-steampoll/tests/adoption.rs:1528`), and Rust test Windows (3 `gamelib-depot` `tests/fetch.rs` tests, red on Windows every run since 2026-11-16). The Windows one matters directly because D-18's three-OS proof rides on that same single `cargo test -p ...` step.

**Primary recommendation:** Build `gamelib-safety` (check + guarded delete in Rust, one `rustInvoke` adapter that maps any rejection to `unknown`), plus a small `gamelib-testutil` crate holding `FakeHome` (note `tempfile::tempdir()` is NOT 0700 by default: set it). Adopt it at the five live delete families through one TS adapter, with a pre-flight in `uninstallGameCallback` so every guard runs before any delete (D-14). Surface refusals through a new generic notice (the existing `steamRequestNotice` is Steam-only and numeric-appId-only). Run a separate, first `cargo test` CI step for the new crates so an earlier red crate cannot mask them.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tri-state type, `safe_path`, guarded recursive delete | Rust crate (`gamelib-safety`) | Shell dispatch arm (`safety_dispatch.rs`) | D-06: one implementation; the shell only validates args and forwards |
| Mapping a failed `rustInvoke` to `unknown` | Node sidecar (one TS adapter) | — | The single place a rejection is converted, so no call site can forget a `catch` |
| Collecting "known installs" (every store's library entry) | Node sidecar (`libraryManagers[*].getListOfGames()`) | — | The library maps live in TS until their owning slice ports (Phases 89-92) |
| Uninstall orchestration and pre-flight (D-14) | Node sidecar (`uninstallGameCallback`) | — | Owns the multi-target sequence (install dir, prefix, settings) |
| Refusal notice | Renderer (NoticeStack) | Node sidecar (push) | Backend decides and pushes a closed-set reason; renderer maps to i18n |
| Three-OS adversarial proof | CI (`rust-test.yml` windows/macos/ubuntu legs) | — | D-18: CI only, no live session |
| Census / ceiling gates | jest Meta + Backend projects, `meta/*.cjs` | — | Source-scanning gates, no runtime |

## Standard Stack

### Core (Rust, new crates)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gamelib-safety` (new, in-repo) | 0.1.0 | Tri-state, `safe_path`, guarded delete, `dispatch(op, args)` | D-07; follows the Phase 63/73/75/79/80 crate shape |
| `gamelib-testutil` (new, in-repo, library only) | 0.1.0 | Rust `FakeHome` | STACK.md line 228 already recommends a tiny `gamelib-testutil`; keeps every crate's dev-dependency light |
| `serde` 1 / `serde_json` 1 | in tree | Args structs, `deny_unknown_fields`, camelCase | Same as `gamelib-scan` `Cargo.toml` [VERIFIED: src-tauri/crates/gamelib-scan/Cargo.toml: `serde = { version = "1", features = ["derive"] }`, `serde_json = "1"`] |
| `unicode-normalization` | 0.1.26 | NFC for case-insensitive comparison (D-17) | Official unicode-rs crate; only dependency is `tinyvec`, already in `Cargo.lock` (so the lockfile gains exactly one name) [CITED: crates.io API deps for 0.1.26: `tinyvec ^1`; `cargo search` showed `0.1.26`] |
| `dunce` | 1.0.5 | Canonical path without the Windows `\\?\` form where it can be simplified | Already in `Cargo.lock` (via aws-lc-sys build), so adding it as a direct dep adds no lockfile name [CITED: docs.rs/dunce: "leaves UNC paths as-is when they can't be unambiguously expressed in a simpler way"] |
| `tempfile` | 3.27.0 in tree | `FakeHome` backing dir, test fixtures | Already a dev-dep of every crate |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `junction` | 2.1.0 | Create NTFS junctions in Windows-only tests with no privilege | Windows `[target.'cfg(windows)'.dev-dependencies]` only. Deps: `scopeguard` (already in lock), `windows-sys >=0.59,<=0.61` (0.61.2 in lock). Alternative with zero new crates: `cmd /C mklink /J` from the test |
| `same-file` | 1.0.6 in tree | Identity (dev+inode / file index) comparison | Optional hardening for "same directory" when two spellings canonicalize differently (bind mounts). Not required by D-17 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `unicode-normalization` | `icu_normalizer` 2.2.0 (already in lock, transitive) | No new lock name, but a heavier API and relies on a transitive crate's default `compiled_data` feature |
| `gamelib-testutil` crate | `pub mod fake_home` behind a `testing` feature in `gamelib-safety` (the `gamelib-steampoll` pattern) | One fewer crate and CI entry now; Phase 83 then has to hoist it again |
| Rust does the delete | Rust returns a verdict, TS keeps `rmSync` | Leaves TS `rmSync` semantics (junction handling) in charge and opens a check-then-delete gap. Rust `remove_dir_all` "does not follow symbolic links and it will simply remove the symbolic link itself" [CITED: doc.rust-lang.org/std/fs/fn.remove_dir_all.html] and protects against symlink TOCTOU on Windows and Unix |

**Installation (Cargo, in `src-tauri/crates/gamelib-safety/Cargo.toml`):**
```toml
[package]
name = "gamelib-safety"
version = "0.1.0"
edition = "2021"
rust-version = "1.77.2"
publish = false

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
unicode-normalization = "0.1"
dunce = "1"

[dev-dependencies]
gamelib-testutil = { path = "../gamelib-testutil" }
tempfile = "3"

[target.'cfg(windows)'.dev-dependencies]
junction = "2"

[lints.clippy]
dbg_macro = "deny"
todo = "deny"
```
MSRV note: `rust-version = "1.77.2"` is the workspace default per the README (section 1); `dunce` 1.0.5 and `unicode-normalization` 0.1.26 MSRVs were not checked this session [ASSUMED]; `cargo +1.77.2 check -p gamelib-safety` is the proof step, and a per-crate `rust-version` bump (like the depot crates) needs operator sign-off.

**Version verification:** `cargo search` run 2026-11-20: `unicode-normalization = "0.1.26"`, `junction = "2.1.0"`, `dunce = "1.0.5"`, `tempfile = "3.27.0"`. [VERIFIED: cargo search]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| unicode-normalization | crates.io | since 2015-04 | ~12.2M/wk | github.com/unicode-rs/unicode-normalization | OK | Approved |
| dunce | crates.io | since 2017-11 | ~11.4M/wk | gitlab.com/kornelski/dunce | OK | Approved (already in lock) |
| junction | crates.io | since 2019-05 | ~136k/wk | github.com/tesuji/junction | OK | Approved (Windows dev-dep only) |
| tempfile | crates.io | since 2015-04 | ~20.6M/wk | github.com/Stebalien/tempfile | OK | Approved (already in lock) |
| same-file | crates.io | since 2017-01 | ~16.6M/wk | (seam: OK) | OK | Optional |

Source: `gsd-tools query package-legitimacy check --ecosystem crates ...` returned OK for all five [VERIFIED: gsd-tools seam]. `junction` was also confirmed on docs.rs (functions `create`, `delete`, `exists`, `get_target`; Windows-only by its `windows-sys` dependency) [CITED: docs.rs/junction]. **Packages removed (SLOP):** none. **Packages flagged (SUS):** none.

## Measured red set (D-01, D-02)

**Method and a trap.** Measured at HEAD `21a22ad78` from `git worktree add --detach` (scratchpad), full `pnpm test --silent`: `Test Suites: 58 failed, 5 skipped, 1025 passed, 1083 of 1088 total; Tests: 584 failed, 36 skipped, 22391 passed; Time: 232.406 s`. **53 of the 58 were an artifact of my worktree**: I symlinked `node_modules` from the main tree, so jest resolved two React copies (`TypeError: Cannot read properties of null (reading 'useRef')`). Rerunning all 58 in the main tree (identical source; only `.planning/` and the locale catalogue key order differ) left exactly the 5 real reds below (`Test Suites: 10 failed` counts each twice because of the argument list I built). **The executor must give the clean worktree its own install** (`pnpm install --frozen-lockfile`, then the "fresh worktree needs build prep" memory step), never a symlinked `node_modules`. Cost to expect: ~4 minutes for the full jest run on this 30-core Mac [VERIFIED: measured, 232.4 s].

| Gate (D-01) | Result at HEAD | Evidence |
|-------------|----------------|----------|
| `pnpm test` (all projects) | **5 real reds** (table below) | measured |
| `backend-di-ceilings` | PASS | `backend-di-ceilings: PASS childProcess=1 (1 files) jestMock=1876 (451 files) sanctioned=1` |
| `steam-line-ceiling` | PASS | `PASS (197 files scanned, 0 allowlisted over 1000)` |
| `gameinfo-narrowing-ceiling` | PASS | `PASS (870 files scanned, 46 allowlisted)` |
| `find-deadcode` | PASS | `PASS (336 baselined knip findings; ...)` |
| `lint` | PASS | `production: PASS | tests: PASS`, `624 problems (0 errors, 624 warnings)` |
| `i18n --fail-on-update` | PASS (clean tree) | `Added keys: 0 ... Unreferenced keys: 0`. The main tree is dirty: `public/locales/en/gamelib.json` has a key-sort-order diff (not a content change); do not trust the main tree for this gate |
| `codecheck`, `prettier`, `boundaries` | PASS | these three are in `.husky/pre-push` but not in D-01's list; they are green |
| `planning-gates` | **RED 11/12** | `.planning/state-sdk-field-anchor-gate.py`: `PROBLEM: Plan: value '20 plans executed' is neither <N> of <M> ... nor gsd-core's own between-phases value Not started` (`.planning/STATE.md:80`: `Plan: 20 plans executed`) |

Note `.husky/pre-push` runs `codecheck`, `lint`, `prettier`, `i18n --fail-on-update`, `find-deadcode`, `boundaries`, `steam-line-ceiling`, `backend-di-ceilings`, `gameinfo-narrowing-ceiling` [VERIFIED: .husky/pre-push lines 2-10]. It does **not** run jest or `planning-gates`. So "the pre-push hook passes without `--no-verify`" (D-01's exit condition) is already true at HEAD; the real exit condition is the union list in D-01 plus the CI findings below. Say so in the ledger.

### The 5 real jest reds: cause and fix direction

| Suite | Failure | Cause | Fix direction (never widen a ceiling) |
|-------|---------|-------|----------------------------------------|
| `src/backend/__tests__/storeKinds.test.ts` and `src/backend/stores/__tests__/createStores.test.ts` | store `steam_direct_launch_verdict` is built but absent from `EXPECTED_KINDS` / `fixtures/registeredStores.json` | commit `053a72cc4` (quick 261117-p38) added the store at `src/backend/storeManagers/steam/stores.ts:365` with declared kind `cache` and did not update the two pin tables | Make the kind decision the test's header demands ("cache = discarded on a shape-changing version bump, user-state = migrated, never discarded"): it is a derivable eligibility verdict, so `steam_direct_launch_verdict: 'cache'` in `EXPECTED_KINDS` plus a `registeredStores.json` entry. Also bump `MIN_CONSTRUCTIONS` (currently `51`) only if the scan count changed; do not lower it |
| `src/backend/__tests__/tauriShellSource.test.ts` (2 cases: `NARROWNESS: ... drops the Epic term`, `... no longer conjoined with is_none()`) | `expect(epicTermDeleted).not.toEqual(code)` fails | **A mutation test that mutates nothing** (the very failure its comment warns about). Commit `ec530001e` ("rustfmt src-tauri") re-wrapped the Rust guard at `src-tauri/src/login_window/humble_cookies.rs:208-209` onto `if existing_window.is_none()\n        && (epic_cookie_domain_matches(domain) \|\| store_logout_cookie_domain_matches(domain))\n    {`, so the multi-line `CENSUS_GUARD` literal (test lines ~1485-1490) no longer matches and `String.replace` is a no-op | Re-anchor the mutations on a whitespace-collapsed form (as `censusFallbackViolations` already does with `.replace(/\s+/g, '')`) or on a regex, so a future `cargo fmt` cannot silently turn the test vacuous. CI "Test" is red on this same suite on every recent push (`gh run`) |
| `src/backend/storeManagers/steam/localFiles/__tests__/acfUpdateReplay.test.ts` | `no oracle case acfUpdate/readLocalConfigBetaKey/playtime/10` | quick 261117-q52 (`2b2d34ddd`) added `src-tauri/crates/gamelib-steamfiles/tests/fixtures/localconfig/playtime.vdf` to the shared corpus; the replay test iterates `listFiles(join(root,'localconfig'))` and `expected.json` has 0 `readLocalConfigBetaKey/playtime` cases | Add the four hand-written oracle cases (`playtime/10,20,99,abc`) to `expected.json` with a Rust-verified value and a note naming the source of truth (README section 6, "new cases are written by hand"). Do not exclude the fixture from the loop |
| `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` (folded todo) | `expect(isTextSites).toHaveLength(34)` at line 2801; received **39** | the todo says 37; HEAD finds 39 sites | Follow the todo's direction: list the sites, decide per site whether it belongs in the `.is-link` family, then update the pinned counts **and** the case title together. Do not bump 34 to 39 unexamined, the case exists to catch a render site that escaped the contrast census |

**Flaky, not red:** `src/backend/tools/__tests__/dxvkInstallRemove.test.ts` failed once under full-suite load (`ENOTEMPTY ... rmdir ... prefix-...` in `afterEach`) and passed in the main-tree rerun. Record it in the ledger as observed-flaky; if it reds again, fix the `rmSync` race (`maxRetries`) rather than retiring it.

**The jestMock todo is already closed.** `.planning/todos/completed/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md` has `## Resolution: Resolved by quick 261117-omv`, and the gate passes at `jestMock=1876`. CONTEXT lists it as folded; no work remains except a one-line ledger note. Keep this in mind for new tests: they must use injected fakes, never `jest.mock` (a new `jest.mock` has no baseline and turns the ratchet red).

**Skipped:** 5 suites and 36 tests are skipped at HEAD (platform or real-environment opt-ins, for example `windowsShortcut.win32.test.ts`, `ntdllPatch.realCrossover.test.ts`). The ledger should list them with the reason they skip; the criterion says "no suite is left on a known-red list", and a silently skipped suite is the same shape. Get the list with `pnpm test --json --outputFile=<scratch>/jest.json` and read `numPendingTestSuites` entries.

### CI-observed reds outside D-01's named set (ask the operator)

`gh run list` on 2026-11-20: Test CI red on the last 2 runs, Rust test red on the last 7 runs (green only on 2026-11-16 `eb1e2d37e`).

| Where | Failure | Evidence | Suggested handling |
|-------|---------|----------|--------------------|
| Test CI | `tauriShellSource.test.ts` NARROWNESS (same as above) | run 44671044014 log | Fixed by the jest fix above |
| Rust test, macos leg | clippy ratchet: `FAIL: 1 new warning(s) for deprecated, which has no ceiling` at `crates/gamelib-steampoll/tests/adoption.rs:1528:18` (`std::sync::atomic::Atomic::<usize>::fetch_update: renamed to try_update`) | run 44671043816 | Replace with a `compare_exchange` loop (a `try_update` call may trip `clippy::incompatible_msrv` at MSRV 1.77.2, which already has 1 baselined hit). Do not add a ceiling |
| Rust test, windows leg | 3 `gamelib-depot` tests fail: `a_long_outage_after_fetching_began_demotes_no_host` (`left: 0 right: 1`), `errors_before_any_success_still_demote_a_dead_host_after_a_late_start` (`left: 0 right: 3`), `outage_exhaustion_reports_the_real_attempt_count` (`reported 3 attempts`), `tests/fetch.rs:511/562/583`; red on every Windows run since 2026-11-16 | run 44671043816 | Needs a Windows repro; the tests use 200-300 ms windows against a dead `127.0.0.1` port. Likely a Windows refused-connect delay [ASSUMED]. **A checkpoint:decision**: fix, or retire per D-03 with approval |

**Why the Windows one blocks this phase:** `rust-test.yml` runs one `cargo test -p ... -p ...` step; cargo stops at the first failing test binary unless `--no-fail-fast` is passed, so crates listed after `gamelib-depot` can be skipped on the Windows leg. Put the new `gamelib-safety`/`gamelib-testutil` tests in **their own earlier step** (or pass `--no-fail-fast`), or D-18's Windows proof can pass or fail vacuously depending on order.

## Census gate matrix (D-05)

Existing floors are real; the common gap is the deliberate empty/truncated-input test (D-05b). Feasibility = does the scan take an injectable input set today.

| Gate | Path | Scans | Floor today | Empty-input test feasible | Work |
|------|------|-------|-------------|----------------------------|------|
| `ipcDomainCensus` | `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` | `ipc/<domain>.ts` declarations vs `*FlowRegistration.ts` | `expect(files.length).toBe(22)`, `expect(total).toBe(296)`, `toBeGreaterThanOrEqual(284)`, `Object.keys(NO_REGISTRATION_OWNER)).toHaveLength(66)` [VERIFIED: test lines read] | Yes: `registeredChannels(source, constants)`, `undeclaredChannels`, `duplicateDeclarations(domains)`, `parseDomainFile` are pure; `registrationFiles()` and `parsedDomains()` read fixed dirs | Extract the count/floor assertions into a pure `assertCensusNotVacuous({ files, total })` and test it throws on `{files: [], total: 0}` and on a truncated set (e.g. 200 of 296) |
| `flowRegistrationCensus` | `.../flowRegistrationCensus.test.ts` | `register*Flows()` counts vs `EXPECTED` table | `EXPECTED` must equal on-disk files exactly; self-test `>150 registrations`, `>=15 modules`, call sites `>=19` | Yes: `countRegistrations(source)`, `registerFnDocstring(source)`, `claimedTotal(...)` are pure; `registrationFiles()` reads `SIDECAR_DIR` | Parametrise `registrationFiles(dir = SIDECAR_DIR)`; assert an empty tmp dir and a one-file dir both fail the "names exactly the modules on disk" and the `>150` floor |
| `phase70PassthroughCensus` | `.../phase70PassthroughCensus.test.ts` | walk of `src/` and `meta/` for `phase70Passthrough(` | `files.length` `toBeGreaterThan(100)` | Yes: `walk(dir, out)` is a pure function of a dir | Lift `walk`+floor into a helper; test that an empty dir fails the floor |
| `moduleStateCensus` | `src/backend/__tests__/moduleStateCensus.test.ts` | top-level mutable bindings via `meta/backendDiCeilings.cjs` `census(root?)` | `backendFiles >= 445`; has a seeded-fixture positive control | Yes: `census(root)` is injectable | Add `census(emptyDir).backendFiles` fails the floor (the positive control proves detection, not emptiness) |
| `backendDiCeilings` | `meta/backendDiCeilings.cjs` + `meta/__tests__/backendDiCeilings.test.ts` | jest.mock / child_process counts | file-count floors in the script (`minBackendFiles`, `minSrcFiles`) | Yes | Test the `main()` floor path with a root of 0 files (the script already prints `scanned only N backend files, below the floor`) |
| `steamLineCeiling` | `meta/steamLineCeiling.cjs` | file line counts | `minFiles` floor; test `exits non-zero when fewer files than the floor are scanned` exists | Already covered | None (verify it uses an empty dir, not just a high floor) |
| `gameInfoNarrowingCeiling` | `meta/gameInfoNarrowingCeiling.cjs` | narrowing sites | `evaluate({scannedFiles, minFiles})`; test `flags a scan below the floor` exists | Already covered | None |
| `knipRatchet` | `meta/knipRatchet.cjs` | knip JSON on stdin | empty report exits 1 (`refusing to read it as zero findings`) | Already covered | Confirm a test pipes an empty report |
| `lintScoped` | `meta/lintScoped.cjs` | eslint over scoped globs | `minFiles` per scope, "fix the patterns, do not lower the floor" | Already covered | None |
| `bridgeCensus` | `meta/bridgeCensus.ts` + `meta/__tests__/bridgeCensus.test.ts` | local-bottle census (needs real bottles) | tests use synthetic inputs; the README says the tier-2 sweep "Zero inputs must fail" | Partly: check `bridgeCensus.ts` for a zero-input exit | Read before deciding: grep found no `exit(3)`/"no inputs" in `bridgeCensus.ts`; if a zero-input run exits 0, that is the vacuous pass |
| `*PortComplete` (5) | `src/backend/__tests__/{depot,scanner,steamCm,steamFiles,steamPolls}PortComplete.test.ts` | walk asserting deleted paths stay deleted | each asserts `>= 500` files scanned | Yes | One shared helper + one empty-dir test |
| `diPhaseGates`, `electronReachLedger`, `externalDynamicImportGate` | `src/backend/__tests__/diPhaseGates.test.ts`, `src/backend/sidecar/__tests__/...` | import/reach walks | floors `>=400`, `>=17`, `visitedFiles > 224`, `>=200`; `externalDynamicImportGate` has a permanent known-bad self-test | Mostly | Add empty-input only where the floor is the sole guard |
| `appShellImportGate`, `gameDetailsImportGate` | `src/backend/sidecar/__tests__/` | import graph of one module family | only `files.length toBeGreaterThan(0)` | Yes | **Weak floor** (`>0`): raise to a measured floor |
| `rendererZodGuard` | `meta/__tests__/rendererZodGuard.test.ts:214` | zod imports in renderer | `test('scan is not vacuous')` | Reference implementation | Model for the helper |
| `logSecretGate` | `meta/logSecretGate.ts` | `src/backend` log calls | `refuses an empty scope` test exists (line 362) | Already covered | None |
| `hardcodedStringGate`, `genI18nGateScope`, `boundaryGates`, `boundaryWiring` | `meta/` | frontend strings / dep-cruiser | `EmptyScopeError`, "empty-scope guard" describe exists for the scope generator | Mostly | Spot-check `hardcodedStringGate` scan for a floor |
| Frontend census tests (`navTourAnchorCensus`, `labelSuiteI18nCensus`, `steamResumeCopyCensus`, `tokenCensus`, `themeTokens`, ...) | `src/frontend/**/__tests__/` | source-text scans | ad hoc pins | Not in the named set | **Out of scope for D-05 unless the executor finds one with no floor**; the in-scope list is the backend, `meta/` and sidecar gates above |
| `planning-gates` | `meta/runPlanningGates.py` | `.planning/**/*-gate.py` | floor 12 gates (conventions skill) | Already covered | Fix `STATE.md` |

**Suggested shared helper:** `src/backend/testUtils/censusFloor.ts` exporting `assertAtOrAboveFloor(label, scanned, floor)` (throws a message naming the label) and each census test imports it, so the deliberate empty-input test is one `expect(() => assertAtOrAboveFloor('x', 0, 22)).toThrow()` per gate plus the real call. It must not use `jest.mock`.

## Recursive delete inventory (D-10, D-11)

All line numbers read this session at HEAD.

| # | Site | Delete | Current guard | Insertion point for the Rust guard |
|---|------|--------|---------------|-------------------------------------|
| 1 | `src/backend/utils/uninstaller.ts:79` `removePrefix` | `rmSync(winePrefix, { recursive: true })` | string equality only: `winePrefix === defaultInstallPath`, `=== sharedWinePrefix`, `=== defaultWinePrefix`; a non-empty folder needs `drive_c` or `pfx`. No canonicalization, no symlink check, no nested-install check. Called **without `await`** at `:182` (after `game.uninstall()` already deleted the install) and from `sideload/games.ts:151` | Replace by one `safety_remove_tree` target `kind: 'prefix'`, with `protectedRoots: [defaultInstallPath, sharedWinePrefix, defaultWinePrefix, userHome]` and `knownInstalls`. Add a **pre-flight** in `uninstallGameCallback` (before `game.uninstall`, `:140`) when `shouldRemovePrefix && !storeCapabilities[runner].installHandOffToClient`: `safety_check_removal` for the prefix, and on non-`yes` emit the refusal notice, send `done`, return (D-14). Order today is install-delete first, prefix second, which violates D-14 |
| 2 | `uninstaller.ts:95,107` `removeFixFile`, `removeSettingsAndLogs` | single-file `rmSync` of `${fixesPath}/${appName}-${store}.json` and `${gamesConfigPath}/${appName}.json/.log/-lastPlay.log` | none; `appName` is `nonEmptyString()` from the renderer (`src/common/types/ipc/install.ts:51`) | Not recursive, outside D-10/D-11. Recommend a cheap `child-of-root` check in the same adapter (an `appName` of `../../x` deletes `x.json`), at the planner's discretion |
| 3 | `storeManagers/gog/games.ts:1168,1180` | `rmSync(object.install_path, { recursive: true })`, `rmSync(supportPath, { recursive: true })` | none beyond `existsSync`. Installer `unins000.exe` runs first. `install_path` comes from the persisted GOG installed store | Pre-flight at the top of `uninstall()` after `array.splice` is **moved after the guard** (today the installed store entry is removed from the in-memory array before the delete; a refusal must leave it intact). Replace both with `safety_remove_tree` (targets: install dir `kind:'game-install'`, support dir `kind:'game-support'`) |
| 4 | `storeManagers/sideload/games.ts:156` | `if (deleteFiles && executable !== undefined) rmSync(dirname(executable), { recursive: true })` | none. **Sibling hazard**: an exe at `~/Games/foo.exe` deletes `~/Games` and every other game and file in it. `libraryStore.set('games', current)` runs **before** the delete (`:151-153`), so a refusal after it would leave the library entry gone | Guard first (including `removePrefix` at `:150`), then mutate the store, then delete. `protectedRoots` must include `defaultInstallPath` and `userHome`; `knownInstalls` from all managers excluding self |
| 5 | `storeManagers/steam/gameUninstall.ts:309-310` `uninstallBridgeGame` | `rmSync(installRoot, recursive)` + manifest | `resolveBridgeGameInstallRoot` (`bridgeInstallState.ts:111`, resolve+relative containment, no symlink/canonical) | `safety_remove_tree` with `trustRoot` = `getBottleSteamappsDir(paths, bottleName)/common` (derived from settings, not from the manifest) |
| 6 | `gameUninstall.ts:903-904` `uninstallBottleGameDirectly` | `rmSync(installRoot, recursive)` | **already hardened**: NUMERIC_APP_ID, `resolveInstallRoot` location check, `readAcfState` unknown/downloading refusals (75 WR-01, 34.13 A-10), `installdirShape` single/nested/escaping (`:540-570`, commit `237a1b41d`), `findOtherManifestsWithInstalldir` (Rust, normalises other manifests' first folder) | Keep the existing refusals; replace the final `rmSync` pair with `safety_remove_tree` so the canonical, symlink and other-store (D-16) checks apply. **Correct CONTEXT:** the nested co-install bug is no longer at `:671`; the nested-installdir row of the table should be asserted on both the Rust crate and this TS call site |
| 7 | `gameUninstall.ts` native route -> `removeNativeInstallDirectly` -> `removeSteamInstallCopy` -> Rust `remove_copy` (`gamelib-steampoll/src/acf_copies.rs:326`, `remove_dir_all` at `:405`) | Rust | `guard_install_root` (`:277`): absolute, no dot segment, `steamapps` ancestor, **refuses** a symlink/reparse root or `common`, canonical-inside-`steamapps/common`; `installdir_shape` single/nested/escaping; conflict scan | Already Rust and already refuses on `Unknown` (`UNKNOWN_CONFLICT`). Leave it. It does not check other **stores'** known installs (D-16). Open Question 3 |
| 8 | `storeManagers/steam/cancelDelete.ts:225` | `rmSync(installRoot, recursive)` (cancel a partial install) | `installdir` sanitiser, single segment, `findOtherManifestsWithInstalldir` (rejection -> `<unknown>`) | Adjacent (CONTEXT lists it as an uninstall call site). Route through the adapter for D-16 coverage |
| 9 | `storeManagers/steam/bridgeBottleLifecycle.ts:222` `removePerGameBridgeBottle` | `cxbottle --delete --force` (external) then `rmSync(bottleDir, recursive)` | `guardPerGameBridgeBottleName` (name checks + `relative(resolve(bottlesRoot), resolve(getBottleDir(paths,name))) === name`), lexical only | Guard before **both** the `cxbottle` spawn and the `rmSync` fallback: `safety_check_removal` target `kind:'bottle'`, `trustRoot` = CrossOver Bottles dir. A symlinked bottle dir must be unlinked, not recursed (D-15) |
| 10 | `storeManagers/steam/provisionBottle.ts:332`, `engine/bottlePrimitives.ts:221` `removeCreatedBottleDir` | recursive bottle dir delete | name sanitise + `relative(...) === name` | Provisioning/rollback only, not reachable from uninstall. Optional: route through the same adapter |
| 11 | `src/backend/utils.ts:385` `resetHeroic` | `rmSync(folder, { recursive: true, force: true })` for `paths.gamesConfigPath` and `paths.configPath`, then `setTimeout(relaunch+quit, 1000)` | none. Registered as `deps.ipc.on('resetHeroic', ...)` (a **send**, no reply) at `sidecar/shellFilesFlowRegistration.ts:294-304` | Make `resetHeroic` async. Guard both targets with `trustRoot` = `appFolder` (`paths.configPath = join(appFolder,'config.json')`, `gamesConfigPath = join(appFolder,'GamesConfig')`, `process/appPaths.ts:166-167`). On refusal: emit the refusal notice and **skip the relaunch/quit** (today the timer always fires). Because it is a `send`, the notice is the only feedback channel |
| 12 | `utils.ts:1462` `removeFolder` -> `downloadmanager/downloadqueue.ts:493` | recursive delete of a partial download folder on cancel | `assertContainedPath(root, folderName)` (lexical) | Adjacent, not uninstall. Note it in the ledger |

**Other `rmSync` sites, confirmed unreachable from uninstall:** `wine/manager/{downloader/main.ts:226,344,359; utils.ts:433}` (wine version install/remove), `wine/runtimes/runtimes.ts:52`, `tools/{dxmt.ts:106,123; index.ts}` (tool installs), `sidecar/nativeImageShim.ts:202,289` (temp dirs), `sidecar/legacyZoomDataCleanup.ts:40` (boot), `knownFixOverlayInstall.ts:257,272` and `steam/bridge/drm/*` (`fsp.rm` of temp/stale overlay dirs), `engine/{fallbackEngine.ts:309,312,451,481; engineSwitch.ts:395; adoptBottle.ts:57}` (engine install temp), `knownFixesFetcher.ts:156`, `downloadmanager/utils.ts:190`, `gog/library.ts:536` (single manifest file). **One site IS reachable from uninstall and CONTEXT's assumption does not hold for it:** `shortcuts/shortcuts/shortcuts.ts:262` (`removeShortcuts`, called at `gog/games.ts:1187` and from sideload via `removeShortcutsUtil`) does `rm(file, { recursive: true, force: true })` on `~/Applications/<title>.app` and `~/Desktop/<title>.app` on macOS (and `linkDesktopToApplications` at `:347`). The name goes through `sanitize(gameTitle)` (`shortcuts.ts` `shortcutFiles`), and the comment documents it is lstat-based and unlinks a link rather than following it. Classify as out of the D-10/D-11 explicit set (a shortcut, not a game folder) and record that in the ledger.

**Epic and Amazon:** `legendary/games.ts:794` and `nile/games.ts:595` `uninstall()` run the external binary; they contain no GameLib-side recursive delete (D-10 excludes the binaries). Their only GameLib-side recursive delete is the shared `removePrefix` (row 1).

### What "unknown" means at each guard

A rustInvoke rejection (any reason), a canonicalize failure that is not `NotFound`, an unreadable known-installs collection (a manager's `getListOfGames()` throws), a missing `trustRoot` derivation. All map to `unknown` and refuse. `NotFound` on the **target** is "absent": nothing to delete, proceed with the rest of the uninstall (manifest/store cleanup), as `remove_copy` does today (`Absent`).

## Architecture Patterns

### System Architecture Diagram

```
 renderer click "Uninstall"
        |  IPC 'uninstall' (appName, runner, shouldRemovePrefix, shouldRemoveSettings)
        v
 uninstallGameCallback (sidecar)
        |
        |-- collectKnownInstalls(deps, self)  ---- libraryManagers[*].getListOfGames()
        |        (throws -> knownInstalls = null -> verdict 'unknown')
        |
        |-- PRE-FLIGHT (D-14): safety_check_removal { targets:[install, prefix?, support?], knownInstalls }
        |        |                         ^ rustInvoke (requestRustInvoke)
        |        |                         | rejection/timeout/bad reply => adapter returns 'unknown'
        |        v
        |   overall != 'yes' ? ---- yes -----------------------------+
        |        | no/unknown                                         |
        |        v                                                    v
        |   push refusal notice (closed-set reason, game title)   game.uninstall()  -> store-specific:
        |   log "<guard> refused"                                    GOG/sideload: safety_remove_tree (re-checks, then deletes)
        |   sendGameStatusUpdate 'done'                              Steam: remove_copy (Rust) / safety_remove_tree
        |   return { refused: true }  (nothing deleted)              Epic/Amazon: legendary/nile binary
        |                                                                  |
        |                                                                  v
        |                                              removePrefix -> safety_remove_tree (already pre-flighted)
        v
 gamelib-safety (Rust):  canonical_real -> fold_key(NFC + case) -> contains / nested-known-install
                         -> remove_dir_all (never follows links) | unlink the link itself
```

### Recommended Project Structure
```
src-tauri/crates/
  gamelib-safety/            # lib: tri.rs, safe_path.rs, remove.rs, dispatch.rs, lib.rs (OPS, dispatch)
    tests/adversarial.rs     # the criterion-4 table, runs on 3 OS legs
  gamelib-testutil/          # lib: FakeHome (Rust twin of createFakeHomeProfile)
src-tauri/src/safety_dispatch.rs   # rpc_safety_* arms (validate Args, forward)
src/backend/safety/
  rustSafety.ts              # the ONE rustInvoke adapter (rejection -> 'unknown')
  knownInstalls.ts           # collectKnownInstalls(deps, selfKey)
  refusal.ts                 # reason -> notice push
src/frontend/components/UI/RemovalRefusedNotice/   # generic notice (see Refusal UX)
```
`src/backend/safety/` is new TS, kept small so `steam-line-ceiling` (1000 lines per file under `storeManagers/steam`) is not pushed: `gameUninstall.ts` is already 931 lines [VERIFIED: `wc -l`].

### Pattern 1: Tri-state and probe (Rust)
**What:** `Tri { Yes, No, Unknown }` for a check; `Probe<T> { Present(T), Absent, Unreadable(String) }` for a read, so a reader cannot collapse "absent" into "could not read".
**Example (proposal):**
```rust
// Source: proposal for gamelib-safety/src/tri.rs; modelled on acfState.ts AcfState (unknown) and
// gamelib-steampoll acf_copies.rs UNKNOWN_CONFLICT.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Tri { Yes, No, Unknown }

impl Tri {
    /// Kleene AND: `No` beats `Unknown`; everything else needs two `Yes`.
    pub fn and(self, o: Tri) -> Tri {
        match (self, o) {
            (Tri::No, _) | (_, Tri::No) => Tri::No,
            (Tri::Yes, Tri::Yes) => Tri::Yes,
            _ => Tri::Unknown,
        }
    }
    /// Destructive ops proceed only on `Yes`.
    pub fn allows(self) -> bool { self == Tri::Yes }
}

pub enum Probe<T> { Present(T), Absent, Unreadable(String) }
impl<T> From<std::io::Result<T>> for Probe<T> {
    fn from(r: std::io::Result<T>) -> Self {
        match r {
            Ok(v) => Probe::Present(v),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Probe::Absent,
            Err(e) => Probe::Unreadable(format!("{:?}", e.kind())),
        }
    }
}
```

### Pattern 2: One adapter converts rejection to `unknown` (TS)
```ts
// Source: proposal for src/backend/safety/rustSafety.ts; the existing models are
// scanners/rustScan.ts (invokeScan) and acfState.ts removeCopyViaRust (catch -> 'install state unknown').
export type SafetyVerdict = 'yes' | 'no' | 'unknown'
export interface SafetyReply {
  overall: SafetyVerdict
  items: { id: string; verdict: SafetyVerdict; reason: string; otherLabel?: string }[]
}

export async function checkRemoval(
  deps: RustInvokeDeps,
  req: SafetyRequest
): Promise<SafetyReply> {
  try {
    const reply = (await deps.requestRustInvoke(RUST_SAFETY_CHECK_REMOVAL, [req])) as SafetyReply
    if (!isSafetyReply(reply)) return unknownReply(req, 'bad-reply') // malformed also refuses
    return reply
  } catch {
    return unknownReply(req, 'rust-invoke-failed') // D-06: a rejection is Unknown, never permissive
  }
}
```
Call sites never wrap this in their own `catch`; a source gate (below) forbids it.

### Pattern 3: Guard-then-delete inside Rust, re-checking
`safety_remove_tree` re-runs the whole check itself for every target and deletes nothing unless `overall == Yes`. It never trusts a verdict from an earlier `safety_check_removal` call (the pre-flight is for UX and D-14 ordering; the delete call is the safety boundary). Deletion: for a symlink/junction target, remove the link (`remove_file` for a file link, `remove_dir` for a directory link or junction); otherwise `std::fs::remove_dir_all`, which does not follow links.

### Anti-Patterns to Avoid
- **Deriving the trust root from the data being validated** (80-REVIEW A/CR-01): the root comes from settings (`defaultInstallPath`, `userHome`, `getBottleSteamappsDir`, `appFolder`), never from the manifest, library entry or executable path.
- **`catch(() => false | null | [])` around a safety call** (PITFALLS 1 detection): this is what the source gate bans.
- **Lexical-only containment** (`path.join`, `startsWith` on strings): "path.join is not containment" (Phase 18); compare canonical component paths.
- **Check in one place, delete in another with an `await` between** (TOCTOU): the delete call re-checks.
- **New `jest.mock` in the new tests**: no baseline exists for them; inject fakes (`requestRustInvoke` stub in the existing style, `bridge/__tests__/fixtures/stubRustScan.ts`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive delete that must not follow links | a manual walker | `std::fs::remove_dir_all` (documented: does not follow symlinks, TOCTOU-protected on Windows and Unix) after the guard | Edge cases (junctions, read-only files on Windows) are already handled in std; the std Windows path uses `NtCreateFile`/`SetFileInformationByHandle` [CITED: doc.rust-lang.org/std/fs/fn.remove_dir_all.html] |
| Windows verbatim/UNC display | string slicing of `\\?\` | `dunce::canonicalize`, plus the repo's own `gamelib-scan/src/contain.rs` `strip_verbatim_prefix` test vectors (63 WR-03: `\\?\UNC\server\share\x` -> `\\server\share\x`) | The relative `UNC\server\...` bug already happened once |
| Unicode NFC | hand-written composition | `unicode-normalization` `nfc()` | Correctness over the whole Unicode range |
| Per-top-folder installdir classification | a new parser | hoist `installdir_shape` / `top_level_segment` from `gamelib-steampoll/src/acf_copies.rs:88-160,218-250` into `gamelib-safety` | They already encode the 80-REVIEW findings (`.`/`..`, `\`, `:`, NUL, trailing dots on Windows, case-insensitive compare) |
| A child-process FakeHome in tests | ad-hoc `env` literals | `gamelib-testutil::FakeHome` (below) | `fakeHomeIsolation.test.ts` covers TS spawn sites only; the Rust twin has no gate, so the helper is the control |

**Key insight:** every guard in this repo's review history (63 WR-03, 75 WR-02/WR-07, 80 A/CR-01, A/WR-01) was a *partial re-implementation* of the same five checks. Build them once, with the adversarial table attached.

## gamelib-safety API proposal (re-homeable into `gamelib-core`, D-07)

Design rules so Phase 83 can move it without changing the API: no `tauri` dependency, no global `home_dir()`/env reads (every root is a parameter), no `dispatch` coupling in the library surface (the `dispatch(op, args)` entry is a thin wrapper over plain functions), `serde` types in a `wire` module so core can re-export it.

```rust
// lib.rs surface (proposal)
pub mod tri;        // Tri, Probe<T>
pub mod safe_path;  // canonical_real, fold_key, contains, same_dir, installdir_shape, CaseMode
pub mod remove;     // check_removal, remove_tree + wire types
pub const OPS: &[&str] = &["safety_check_removal", "safety_remove_tree"]; // sorted, README section 2
pub const CLI_ONLY_OPS: &[&str] = &[];
pub fn dispatch(op: &str, args: &[serde_json::Value]) -> Result<serde_json::Value, String>; // catch_unwind, ":bad-args"

pub enum CaseMode { Sensitive, Insensitive, Auto } // Auto: probe the volume, default by OS, ambiguous => Insensitive (over-refuse is the safe direction)

pub struct Target   { pub id: String, pub path: String, pub kind: TargetKind, pub trust_root: Option<String> }
pub enum   TargetKind { GameInstall, GameSupport, Prefix, Bottle, AppFolder }
pub struct Known    { pub label: String, pub path: String }           // any store's library entry
pub struct Request  { pub targets: Vec<Target>, pub known_installs: Option<Vec<Known>>, // None = "could not read" => Unknown
                      pub self_label: Option<String>, pub protected_roots: Vec<String> }
pub struct Item     { pub id: String, pub verdict: Tri, pub reason: Reason, pub other_label: Option<String> }
pub struct Reply    { pub overall: Tri, pub items: Vec<Item> }

pub fn check_removal(req: &Request, case: CaseMode) -> Reply;          // read-only
pub fn remove_tree(req: &Request, case: CaseMode) -> RemoveReply;       // re-checks; deletes only if overall == Yes
```

**`Reason`** (closed, kebab-case on the wire, mapped 1:1 to i18n keys): `not-absolute`, `dot-segment`, `nul-byte`, `is-protected-root`, `is-trust-root`, `outside-trust-root`, `nested-known-install` (carries `otherLabel`), `inside-known-install` (carries `otherLabel`), `canonicalize-failed`, `known-installs-unreadable`, `no-trust-root`, `ok`.

**Semantics (each maps to a decision):**
- *Canonical real path (D-17):* `dunce::canonicalize(path)`. `NotFound` on the target => verdict `Yes` with reason `ok` and `absent: true` (nothing to delete). Any other error => `Unknown`/`canonicalize-failed`. For a target that does not exist but whose parent does, canonicalize the parent and append the name (so containment still works).
- *Fold key (D-17):* `fold_key(p, mode)` = components joined; if `Insensitive`: `nfc(s).to_lowercase()` per component. Never string-prefix compare: compare component vectors.
- *Containment:* canonical target must be strictly inside canonical `trust_root` (component `starts_with`, not equal). `trust_root` absent and kind in `{GameInstall, Prefix, Bottle}` => `Unknown/no-trust-root` unless the caller supplied `protected_roots` only (sideload has no single root; the nested-known-install and protected-root checks then carry the weight). Equal to a protected root (`defaultInstallPath`, `userHome`, drive root, `appFolder`) => `No/is-protected-root`.
- *Nested known install (D-16):* for each `Known` (excluding `self_label`): canonical (or lexical-absolute if absent) path `K`. `K` equals or lies under the target => `No/nested-known-install` with `otherLabel`. Target lies under `K` => `No/inside-known-install`. A `Known` whose path fails to canonicalize for a non-`NotFound` reason => `Unknown`. `known_installs: None` => `Unknown/known-installs-unreadable`.
- *Symlinks (D-15):* if the target itself is a symlink or Windows reparse point (junction), the unit of deletion is the link; the tree behind it is untouched and is not canonicalized for the nested-install check (otherwise a link to `~/Games` would refuse for its target's contents, and unlinking removes nothing of theirs). Inside the tree, `remove_dir_all` does not follow.
- *Windows reparse points:* `std::fs::symlink_metadata(p).file_attributes() & 0x400` (the existing `is_reparse_point` in `acf_copies.rs:262-270`).
- *Absolute-path classification of raw strings* (`.\x`, `C:\x`, `\\server\x`, NUL): lexical, identical on every OS, refuse (`not-absolute` / `dot-segment` / `nul-byte`), exactly as `installdir_shape` already refuses `\`, `:`, NUL on every OS.

**Shell arm** (`src-tauri/src/safety_dispatch.rs`): each `rpc_safety_*` validates through the generated `SafetyCheckRemovalArgs::from_args(args)?` then `gamelib_safety::dispatch(...)`, on the calling worker thread, no logging of paths or titles (T-28-04 rule at the top of `steampoll_dispatch.rs`). A panic is `Err` (README section 2).

**Reconciling D-15 with Phase 80:** `guard_install_root` (`acf_copies.rs:277`) **refuses** a symlinked install root, while D-15 says a symlinked root is **unlinked**. Both keep the target data safe. Recommendation: leave `remove_copy` alone (its documented delta is "all in the refusing direction", a safe superset), implement unlink in `gamelib-safety`, and have the Steam native row of the table assert "target data survives" (true for both). See Open Question 3.

## Crate recipe: what is actually required today

`src-tauri/crates/README.md` section 3 predates Phase 67's generated contract (it names `dispatch_rust_channel` in `sidecar.rs`; the live code is `rust_dispatch.rs` plus a generated enum). The steps that match HEAD, using `gamelib-scan` (the README's declared model, simplest shape) and the Phase 80 `steampoll` wiring as the pair of analogs:

1. **Crate dirs.** `src-tauri/crates/gamelib-safety/{Cargo.toml,src/lib.rs,tests/}` and `gamelib-testutil`. No `-cli` (README section 1: "Optional bin, only if `meta/` tools need the code headlessly"; none does, and D-18 proves it through `cargo test`).
2. **Workspace.** Add both to `[workspace] members` and `gamelib-safety = { path = "crates/gamelib-safety" }` to `[dependencies]` in `src-tauri/Cargo.toml` (members lines 446-459; dep lines 16-20) [VERIFIED: Cargo.toml read].
3. **TS channel constants.** In `src/common/types/sidecarTransport.ts`: `export const RUST_SAFETY_CHECK_REMOVAL = 'safety_check_removal' as const` and `RUST_SAFETY_REMOVE_TREE = 'safety_remove_tree' as const`, with the doc comment form used at `:598-600` (`Rust-side channel name: ... Bad args reject '<op>:bad-args'.`), a `RUST_SAFETY_CHANNELS` subset array (like `RUST_SCAN_CHANNELS` at `:1116`), and an entry in `RUST_INVOKE_CHANNELS` (`:994`).
4. **TS arg schema.** Add the zod tuple per channel to `src/common/types/ipc/rustInvoke.ts` (import the constants at the top block; entries like `[RUST_SCAN_CONTAINED_REAL]: z.tuple([z.object({ path: z.string(), rootDir: z.string() })])`).
5. **Regenerate.** `pnpm gen:ipc-contract` rewrites `src-tauri/src/ipc_contract.rs` (enum variant, `from_wire`/`as_wire`, `*Args` structs with `from_args`); CI's `pnpm check:ipc-contract` is the gate and `.husky/pre-commit` runs it when contract inputs are staged. Commit the regenerated file.
6. **Shell arm.** New `src-tauri/src/safety_dispatch.rs`; `mod safety_dispatch;` and `use safety_dispatch::*;` in `main.rs` next to `mod scan_dispatch;`/`use scan_dispatch::*;` (lines 128/151); the one-line arm `RustInvokeChannel::SafetyCheckRemoval => rpc_safety_check_removal(args),` in `src-tauri/src/rust_dispatch.rs`.
7. **Parity and pin tests.** Add the two channel names to the arm list in `src/backend/__tests__/tauriShellSource.test.ts` (the list at ~`:700-800` carries every `rustInvoke` arm), add a shell test next to `scan_channels_are_gamelib_scan_app_ops` in `main.rs` (`OPS` contains the channel, `dispatch(op, &[])` ends in `:bad-args`), and a `safetyChannelParity.test.ts` modelled on `src/backend/scanners/__tests__/scanChannelParity.test.ts` (OPS == `RUST_SAFETY_CHANNELS` == shell arms, with the anti-vacuity `OPS.length >= N` check at its top).
8. **Lockfile pin.** After `cargo` updates `src-tauri/Cargo.lock`, add `"gamelib-safety"`, `"gamelib-testutil"`, `"unicode-normalization"` (and `"junction"` if used) to `EXPECTED_LOCKFILE_CRATE_NAMES` in `src/backend/__tests__/cargoFeatures.test.ts` (sorted, line ~190; the existing line 217-218 shows where `gamelib-*` entries sit). Same commit [VERIFIED: file read].
9. **CI.** `.github/workflows/rust-test.yml`: add a **new first** step `cargo test -p gamelib-safety -p gamelib-testutil` (before the big `-p` step, so Windows reds elsewhere cannot mask it), extend the (g) comment list and the step name text. `meta/__tests__/rustTestWorkflow.test.ts` pins only the prefix `run: cargo test -p gamelib-scan -p gamelib-scan-cli` so a new step does not break it; if you instead append `-p`, keep that prefix intact.
10. **README.** Update the stale section 3 wording while adding the D-08 rules section.

**Gates a new crate/channel touches (so they do not surprise the plan):** `tauriShellSource.test.ts` (arm list), `cargoFeatures.test.ts` (lock names), `ipc_contract.rs` freshness (`check:ipc-contract`), `clippyRatchet` per-OS ceilings (a new crate must introduce **zero** clippy warnings; `--workspace --all-targets` lints tests too), `cargo fmt` per crate (`cargo fmt -p gamelib-safety -- --check`; never workspace-wide, PITFALLS 22), `scanChannelParity`-style test.

## Rust test strategy (D-18, criterion 4)

### Adversarial table
`gamelib-safety/tests/adversarial.rs`, table-driven (`struct Case { name, build: fn(&FakeHome) -> Fixture, expect: Expect }`). Rows and what each asserts (always also asserts a **sentinel file outside the target survives**):

| Row | Input | Expect | Runs on |
|-----|-------|--------|---------|
| nested installdir | target `common/Studio`, known install `common/Studio/GameB` | `No/nested-known-install`, `otherLabel` set, nothing deleted | all |
| nested the other way | target `common/Studio/GameB`, known install `common/Studio` | `No/inside-known-install` | all |
| `.\x` | raw `.\Studio`, `Studio\.`, `.\..\x` as the path/installdir | refuse (`dot-segment`/`not-absolute`) | all (lexical) |
| `C:\x` | drive-prefixed raw string | refuse | all (lexical; identical on Linux/macOS by design) |
| UNC | `\\server\share\x` and `\\?\UNC\server\share\x` | refuse as a raw installdir; as a real path on Windows, containment uses the `dunce` form and refuses outside the root | UNC-as-string: all; real UNC share: Windows only if constructible (it usually is not on a runner; assert the string form everywhere and leave the real-share case to the unit test of `strip_verbatim_prefix` vectors) |
| symlink root | `common/Game` is a symlink to `../victim` | `Yes` (the link is the unit), link removed, `victim/precious.txt` survives | unix: `symlink`; Windows: junction (always) and `symlink_dir` (see below) |
| symlink inside tree | `common/Game/inner` -> `victim` | delete completes, `victim` untouched | same |
| symlink to a known install | target is a link whose referent is another game | `Yes` for the link only, referent survives | same |
| case | known install `common/studio/GameB`, target `common/Studio`, `CaseMode::Insensitive` | `No/nested-known-install` | all (injected mode); plus a real-volume probe test that asserts `Auto` detects the runner's volume |
| NFC/NFD | target spelled NFC `é`, known install spelled NFD `e\u0301` | `Insensitive`: `No`; `Sensitive`: `Yes` (distinct names on a sensitive volume) | all (injected mode) |
| protected root | target equals `defaultInstallPath`/home/fs root | `No/is-protected-root` | all |
| unknown | canonicalize fails for a non-`NotFound` reason (a path component that is a file), known installs `None` | `Unknown`, nothing deleted | all |
| absent | target missing | `Yes`/`absent`, no error | all |

Joining rule from the README handoff: build expected paths segment by segment (`a.join("b").join("c")`), never `join("a/b")` (earlier Windows CI runs failed on exactly this: fixed in `6ec2e9db1`, `d6f314aec`, `f078c2762` per 80-HANDOFF).

### Creating links on the runners
- **Junctions (Windows):** need no privilege. Use the `junction` crate (`junction::create(target, link)`) as a Windows-only dev-dependency, or `cmd /C mklink /J <link> <target>`. Always run the junction rows on Windows.
- **Directory symlinks (Windows):** `std::os::windows::fs::symlink_dir` needs `SeCreateSymbolicLinkPrivilege` (administrators by default) [CITED: Microsoft "Create symbolic links" policy, via search results]. GitHub-hosted `windows-latest` runs as an administrator, so it should succeed [ASSUMED, verify on the first CI run]. **Do not copy the existing pattern**: `gamelib-steampoll/tests/acf_copies_security.rs:293-295` does `if std::os::windows::fs::symlink_dir(...).is_err() { return; }`, which silently passes when the privilege is missing. Write one helper in `gamelib-testutil`, `make_dir_link(target, link) -> LinkKind`, that returns an error, and make the test **panic when `CI` is set** and **skip with a printed reason only locally**.
- **Unix:** `std::os::unix::fs::symlink`, as the existing tests do.

### FakeHome (D-08): `createFakeHomeProfile()` twin
What the TS one does [VERIFIED: `src/backend/testUtils/fakeHomeProfile.ts:192-260` read]: `mkdtempSync(join(parent, prefix ?? 'gamelib-fakehome-'))`, `chmodSync(root, 0o700)`, then the eight variables `HOME`, `USERPROFILE`, `APPDATA`=`<root>/AppData/Roaming`, `LOCALAPPDATA`=`<root>/AppData/Local`, `XDG_CONFIG_HOME`=`<root>/.config`, `XDG_STATE_HOME`=`<root>/.local/state`, `XDG_DATA_HOME`=`<root>/.local/share`, `XDG_CACHE_HOME`=`<root>/.cache`; `childEnv(base)`, `registerCapture(path)`, `dispose()` (each removal in its own `try`, idempotent).

**Trap:** `tempfile::tempdir()` is **not** 0700. docs.rs: "Permissions default to `0o600` for tempfiles and `0o777` for tempdirs" before the umask, i.e. 0755 under a normal umask [CITED: docs.rs/tempfile Builder]. The TS conventions text calls the `mkdtemp 0700` "the security control". The Rust helper must request it explicitly:
```rust
// Source: proposal for gamelib-testutil/src/lib.rs
use std::{fs, path::{Path, PathBuf}};
pub struct FakeHome { dir: Option<tempfile::TempDir>, captures: Vec<PathBuf> }
impl FakeHome {
    pub fn new(prefix: &str) -> FakeHome {
        let mut b = tempfile::Builder::new();
        b.prefix(prefix);
        #[cfg(unix)]
        { use std::os::unix::fs::PermissionsExt; b.permissions(fs::Permissions::from_mode(0o700)); }
        FakeHome { dir: Some(b.tempdir().expect("fake home")), captures: Vec::new() }
    }
    pub fn root(&self) -> &Path { self.dir.as_ref().unwrap().path() }
    pub const ENV_KEYS: [&'static str; 8] = ["HOME","USERPROFILE","APPDATA","LOCALAPPDATA",
        "XDG_CONFIG_HOME","XDG_STATE_HOME","XDG_DATA_HOME","XDG_CACHE_HOME"];
    pub fn env(&self) -> Vec<(&'static str, PathBuf)> { /* the eight mappings above */ unimplemented!() }
    /// For a spawn: `cmd.env_clear()` is the caller's call; this only sets the eight.
    pub fn apply(&self, cmd: &mut std::process::Command) { for (k, v) in self.env() { cmd.env(k, v); } }
    pub fn register_capture(&mut self, p: PathBuf) { self.captures.push(p); }
}
impl Drop for FakeHome { fn drop(&mut self) { for p in &self.captures { let _ = fs::remove_dir_all(p); } } }
```
(`unimplemented!()` shown only to keep the proposal short; clippy denies `todo`, and the real body is the eight `join`s. The sample is a shape, not final code.) Fresh profile per call (the "no reuse" rule). The two-profile rule's second half (a named real-profile arm) applies where a Rust test spawns a binary that only misbehaves under a populated profile; the safety crate spawns nothing.

**Enforcement honesty:** no gate exists for Rust tests reading the real `HOME`. Add one cheap test in `meta/__tests__` (or extend `fakeHomeIsolation.test.ts`'s style) that greps `src-tauri/crates/**/*.rs` and `src-tauri/src/**/*.rs` test code for `std::env::var("HOME")`, `dirs::home_dir`, `home_dir()` outside an allowlist with a floor of files scanned. Mark it optional: PITFALLS 11 recommends it, D-08 does not require it.

### README rules section (D-08) to add to `src-tauri/crates/README.md`
Place after section 2 ("Library contract"); say exactly: "Destructive guards refuse on Unknown. Readers return a tri-state (`Yes | No | Unknown`) or a `Probe` that distinguishes absent from could-not-read; a transport failure is `Unknown`, never the permissive answer." and "One shared `safe_path` (`gamelib-safety`). Never derive a trust root from the data being validated (a manifest, a library entry, an executable path)." Also record the junction/symlink-in-CI helper rule and the 0700 trap.

## Refusal UX (D-13, D-14)

**How it works today.**
- `uninstallGameCallback` (`utils/uninstaller.ts:116`) emits `gameStatusUpdate { status: 'uninstalling' }` first, calls `game.uninstall({ shouldRemovePrefix })`, and on `result?.refused` logs `Uninstall refused; keeping settings ... (stderrLength=...)` then `sendGameStatusUpdate(deps, { appName, runner, status: 'done' })` and returns (`:141-152`). `result.failed` does the same (`:153-164`). Steam's `refuse()` helpers also emit their own `done` (`gameUninstall.ts:380-388`) because `installManagedExternally` suppresses the tail `done`.
- The only in-app notice path for uninstall is **`steamRequestNotice`**: a FrontendMessage with `kind` in a closed set (`uninstall-refused-running`, `uninstall-steam-error`, `uninstall-check-failed`, `uninstall-failed`, ...) rendered by `SteamEngineLaunchNotice` through `requestBody()` with i18n keys `steam.uninstall.*`, and gated by `handleSteamRequestNoticeSignal`, which **drops payloads whose `appId` does not match `/^[0-9]{1,10}$/`** (`src/frontend/state/SteamRequestNotice.ts`). Sideload app names and Epic names are not numeric, so this channel cannot carry a non-Steam refusal without loosening that validation.
- Non-Steam uninstall errors today produce only a native `notify(deps, { title, body: i18next.t('notify.uninstallError', 'Error uninstalling') })` (`uninstaller.ts:167-170`), not the bottom-right stack.

**Recommended design (the planner may choose the smaller alternative, below).** A new generic backend-fed notice, modelled on `ReadOnlyStoresNotice` (closed-set reasons, zustand store written only from the backend push, `renderNoticeSlot`, no auto-hide because the user needs to know nothing was deleted):
1. `FrontendMessages` channel `removalRefusedNotice` in `src/common/types/ipc/appShell.ts` (next to `readOnlyStoresNotice`, which uses `z.strictObject` and `z.enum(...)`): payload `{ kind: 'uninstall' | 'reset' | 'remove-bottle', appName?: string, runner?: Runner, title: string, reason: <closed enum from Reason>, otherTitle?: string, seq: number }`.
2. Preload `window.api.handleRemovalRefusedNotice` (pattern: `src/preload/api/settings.ts` for `handleReadOnlyStoresNotice`), subscription in `src/frontend/state/initStateSubscriptions.ts:240` style, store `src/frontend/state/RemovalRefusedNotice.ts`, component added to `AppNoticeStack` (`NoticeStack/index.tsx`).
3. Backend helper `pushRemovalRefusal(deps, ...)` beside `gameSettingWrite.ts` / `readOnlyStoresNotice.ts` (the `appShellImportGate` forbids `appShellFlowRegistration.ts` importing `../ipc`; `readOnlyStoresNotice.ts`'s header documents why it lives separately).
4. i18n: **English only** under `src/**` `t('removalRefused.<reason>', 'default text', { game, other })` calls, then `pnpm i18n` to extract into `public/locales/en/gamelib.json`. The catalogue is `en`-only in the parser (`locales: ['en']`, `output: 'public/locales/$LOCALE/$NAMESPACE.json'`, `sort: true`, `keepRemoved: true` in `i18next-parser.config.js`); other locales are filled by a separate machine-translation commit (precedent: `a36a40f7f` added one en key; `5d1112a47` translated the next one into all locales). `pnpm i18n --fail-on-update` is the gate, so commit the regenerated en catalogue. **`public/locales/**` is prettier-ignored** [VERIFIED: conventions skill, `--file-info` ignored: true]: no `prettier --check` in that task's verify.
5. Copy examples (D-13 wording): "Couldn't uninstall {{game}}: GameLib couldn't confirm the install location. Nothing was deleted." / "... {{other}} is installed inside this folder. Nothing was deleted." / "Couldn't reset GameLib: ... Nothing was deleted."
6. Logging: one line naming the guard, no paths or titles (the notice carries the title), e.g. `[safety] uninstall refused: nested-known-install`. `logSecretGate` only objects to raw process output and secret-named identifiers.

**Smaller alternative:** for the Steam routes only, add one kind to the existing set (the recipe is in commit `a36a40f7f`: `common/types/steam.ts` union, `SteamRequestNotice.ts` `REQUEST_KINDS`, `SteamEngineLaunchNotice/index.tsx` `RequestKind`/`REQUEST_KINDS`/`requestBody`, en catalogue) and use the native `notify` for non-Steam stores. This misses D-13 for GOG/sideload/Epic/Amazon (it is not the bottom-right stack), so the generic notice is the compliant choice. **Cost to budget:** one new FrontendMessage raises the `ipcDomainCensus` pins: `total` 296 -> 297, the `>= 284` floor re-measured, and `NO_REGISTRATION_OWNER` 66 -> 67 (a backend-pushed message has no `*FlowRegistration` owner; the file's own header says such a table change must land in the same commit). Re-run `pnpm gen:ipc-contract`.

**Tile state.** Refusal returns `{ stdout: '', stderr: <reason>, refused: true }` (the `ExecResult.refused` path), and `uninstallGameCallback` already sends `done`. Every new refusal must `return` before any `splice`/`libraryStore.set`/`installedGamesStore.set` mutation (GOG and sideload mutate their library stores before deleting today, rows 3-4), or a refusal leaves a half-uninstalled library.

**`resetHeroic`:** it is a `send` and the sidecar cannot reply. The refusal notice is the feedback; the 1-second `relaunch`/`quit` timer must be started only on success. (The timer is not `unref()`ed today; the exit-contract convention says new timers must be, so the refactor should `unref()` it while it is being touched.)

## fileStore.ts: live or dead (settled)

**Dead for the runtime; the ARCHITECTURE reading is wrong about the file, right about the bridge.**
Evidence:
1. Ran the dev bundle command from `meta/buildSidecar.ts` (`esbuild src/sidecar/index.ts --bundle --platform=node --target=node22 --format=cjs --packages=external` plus the ITAD define) with `--metafile`: 582 inputs, `src/backend/sidecar/fileStore.ts` **not present**, `src/backend/store_backend.ts` present [VERIFIED: esbuild metafile this session].
2. Importers of `sidecar/fileStore`: one test file, `src/backend/stores/__tests__/storeRoot.test.ts:4` (`import FileStore from '../../sidecar/fileStore'`), plus `sidecar/__tests__/fileStore.test.ts` (its own test). No source import [VERIFIED: grep].
3. `store_backend.ts:63` states "`sidecar/fileStore.ts` is not on the production path" and the production store class is `conf`.
4. The renderer store bridge (`sidecar:store-fetch`, `storeNew`, `storeChanged`) is owned by `src/backend/sidecar/storeWriteHandlers.ts` and `store_backend.ts`; the mentions of `fileStore.ts` in `storeWriteHandlers.ts:166`, `handlers.ts:540,601`, `knownFixes.ts:168`, `stores/storeRoot.ts:5` and `jest.setupContainment.ts:154` are stale comments.

**Deletion set (all in one commit, baselines lowered in the same commit):** `src/backend/sidecar/fileStore.ts` (432 lines), `sidecar/__tests__/fileStore.test.ts` (362), the `FileStore` cases in `stores/__tests__/storeRoot.test.ts` (120 lines; it also tests the root's cell registry), the now-unused `FileStoreCells`/`cells`/`createFileStoreCells` in `stores/storeRoot.ts` (`cells` has no other reader: `grep` found only the definition at `:80` and construction at `:152`), the `'src/backend/sidecar/fileStore.ts'` line in `diPhaseGates.test.ts:619`, and `"src/backend/sidecar/__tests__/fileStore.test.ts": 1` in `meta/backendDiCeilings/sidecar.json:9` (the jestMock baseline: it must drop, or the ratchet's stale-entry rule fails). Then run `pnpm find-deadcode` (unused-export fallout) and `pnpm codecheck`.

## Zero-risk deletions

| Item | Verdict | Evidence | Action |
|------|---------|----------|--------|
| `sidecar/fileStore.ts` | Delete | above | the set above |
| `*/e2eMock.ts` (`gog`, `legendary`, `nile`: 68+74+68 = 210 lines) and the `CI=e2e` surface | Delete (operator decision 2026-11-17) | **In the runtime bundle**, not dead code: `bootstrap.ts:56-58` import `register{Gogdl,Legendary,Nile}StubListeners`; `:2791-2806` call them (`CI === 'e2e'` gated inside `ipcRegistry.ts:120-127`); `gogRuntime.ts:17`, `nileRuntime.ts:10`, `legendaryRuntime.ts:13` import the `create*Stubs` factories and hold a `stubs` slot; `gog/library.ts:1629`, `nile/library.ts:551`, `legendary/library.ts:780` have `stubs.run(commandParts)` early returns; `e2eStubListeners.test.ts`, `gogRuntime.test.ts`, `nileRuntime.test.ts`, `legendaryRuntime.test.ts` cover them | See the ripple list below; this is a medium change, not a file delete |
| `legendary/commands/*` (14 files, 304 lines) | **NOT zero-risk** | `commands/base.ts` is in the bundle and exports runtime zod brands (`LegendaryAppName`, `NonEmptyString`, `PositiveInteger`, `ValidWinePrefix`, ...) imported by `save_sync.ts:16`, `utils/compatibility_layers.ts:11-12`, `legendary/{games,library,user}.ts`; the other 13 files are type-only but are the `LegendaryCommand` union imported by `games.ts:60`, `library.ts:36`, `user.ts:9`, `eos_overlay/eos_overlay.ts:8`, `storeManagers/index.ts:26`, `legendaryRuntime.test.ts:13`. Deleting them breaks `pnpm codecheck` | Open Question 1: defer to Phase 91 (legendary runner) as FEATURES says ("Collapse into Rust argv builders"), or collapse to one file now |
| "Type-only files" (`services/types.ts` 410 lines, `process/types.ts`, `logger/types.ts`, `humble/secretStore.ts`, `steam/cm/{SteamCmClient,steamCmTypes}.ts`, `depotRust/types.ts`, `localFiles/steamFilesTypes.ts`, `pollRust/steamPollTypes.ts`) | **NOT zero-risk** | each has live importers (for example `services/types.ts` is the `ManagerDeps` type; `steamCmTypes.ts` 7 importers, `humble/secretStore.ts` 13) | Type-only means erased at runtime, not unused. They die with their consumers. Do not delete |
| `src/common/types/proxy-types.ts` | Delete | knip baseline `files` finding [VERIFIED: `meta/knip-baseline.txt:319`] | delete the file and the baseline line |
| Dead `src/backend` exports in the knip baseline | Sweep | 19 `exports`, 3 `types`, 1 `duplicates`, 3 `unlisted` lines under `src/backend` [VERIFIED: grep count]. The 19: `HUMBLE_FUZZY_MATCH_THRESHOLD`, `HUMBLE_LOGIN_PARTITION`, `parseEntitlementKeys`, `OVERLAY_CAUSE_MAX_CHARS`, `verifyOverlayRunnerClone`, `CANCEL_DELETE_POLL_MS`, `CANCEL_DELETE_TIMEOUT_MS`, `DRM_DLL_OVERRIDES`, `assembleBridgeRouteInput`, `isBottleEligibleFromPlatforms`, `crossoverRequiredError`, `hasBottledSteamCopy`, `removeDemotedNativeOrphan`, `logOverlayInputOutcome`, `overlayInputLine`, `removeNativeInstallDirectly`, `uninstallBottleGameDirectly`, `uninstallNativeInGameLib`, `uninstallUnadoptedNativeDirectly` | Removing the `export` keyword (or the function) per item and deleting its baseline line **in the same commit** (`knipRatchet.cjs` fails on a stale baseline line as well as a new finding). **Sequence conflict:** four of the 19 are in `gameUninstall.ts` (the file the guard work edits) and two in `cancelDelete.ts`; do those in the same plan as the guard edit, not a separate one. 262 `src/preload` baseline lines are an API-surface category, leave them |
| 7 other baseline `files` | Leave | frontend `LoginWarning/index.tsx`, two `.scss`; meta `coldBootTiming.ts`, `measureCrossoverMatching.ts`, `probeSeaInWorker.ts` (FEATURES: delete when SEA goes) | out of scope |

**`CI=e2e` ripple (the planner needs this list; completeness is [ASSUMED]: re-grep `CI === 'e2e'|CI=e2e|e2eMock|\.stubs\b` after the change and require zero hits, with a floor-guarded `*PortComplete`-style test):**
- `src/backend/storeManagers/{gog,legendary,nile}/e2eMock.ts` (3 files), `storeManagers/__tests__/e2eStubListeners.test.ts`
- `sidecar/bootstrap.ts`: imports `:56-58`; `resolveAppPaths` `:1363-1373` (`process.env.CI === 'e2e' ? tmpNameSync(...)`, and `assetDir: isPackagedSidecar() || process.env.CI === 'e2e' ? 'build' : 'public'`); comments `:302`, `:1507`; stub-listener registration `:2791-2806`; the three `*-runtime` steps mention the stub slot (`:2254-2279`)
- `sidecar/appFolderStep.ts:44` (`if (deps.env.CI === 'e2e')`), `sidecar/ipcRegistry.ts:120-127`, `sidecar/processGuards.ts:224` (comment/branch)
- `storeManagers/{gog,legendary,nile}/{gogRuntime,legendaryRuntime,nileRuntime}.ts` `stubs` slots, and `library.ts` `stubs.run` early returns (`gog/library.ts:1629`, `nile/library.ts:551`, `legendary/library.ts:780`)
- `utils.ts:882` (`if (process.env.CI === 'e2e') return null`), `online_monitor.ts:222,326`, `anticheat/utils.ts:33`, `utils/releases.ts:14`
- IPC types: `src/common/types/ipc/testStubs.ts` `testStubsTestSyncArgs` (6 TestSync channels: `setLegendaryCommandStub`, `resetLegendaryCommandStub`, `setGogdlCommandStub`, `resetGogdlCommandStub`, `setNileCommandStub`, `resetNileCommandStub`), `ipc/index.ts`, `testUtils/ipcDomainParse.ts`; and in `ipcDomainCensus.test.ts` the `NO_REGISTRATION_OWNER` rows `TestSync:*` (6), the `TestSync` kind in `UMBRELLA`, the `total` comment history (`296` drops by 6), the `66` length (drops by 6), the `>= 284` floor (re-measure, keep the parse-miss margin)
- `diPhaseGates.test.ts:629,634,636` (ledger lines naming the three mock files)
- `meta/backendDiCeilings/*.json` baselines for any of the deleted tests (lower in the same commit)
- Run `pnpm gen:ipc-contract` and commit `ipc_contract.rs` if the TestSync channels reach it.

## Inventory and state-ownership documents (Claude's discretion)

**Format and location:** two phase docs next to the ledger, `82-UTILS-BOOTSTRAP-INVENTORY.md` and `82-STATE-OWNERSHIP.md` (prettier-ignored `.planning/` markdown, hand-matched). Phase docs, not `.planning/research/`, because Phases 83-99 plans must cite them and `gsd-plan-phase` loads the phase dir. Keep each table machine-checkable where cheap: a Python/TS gate that parses the first column and asserts every `export`ed symbol of `utils.ts` and every `name:` boot step of `bootstrap.ts` appears exactly once, with a floor (`>= 30` exports, `>= 60` steps) and an empty-input test (D-05 applied to the new gate). The existing `planning-gates` runner (`meta/runPlanningGates.py`, floor 12) is the home for a Python one; adding one raises that floor, which the runner's header says to record.

**`utils.ts` inventory (1923 lines).** Seed from the export block at `utils.ts:1880-1923`: `errorHandler, getCurrentChangelog, isEpicServiceOffline, showItemInFolder, removeSpecialcharacters, clearCache, clearAchievementCache, resetHeroic, getLegendaryBin, getGOGdlBin, getCometBin, getNileBin, archSpecificBinary, MACOS_ONEDIR_RUNNERS, formatEpicStoreUrl, constructAndUpdateRPC, quoteIfNecessary, removeQuoteIfNecessary, detectVCRedist, VC_REDIST_PROBE_TIMEOUT_MS, shutdownWine, getShellPath, getLatestReleases, getWineFromProton, getFileSize, removeFolder, getPathDiskSize, sendGameStatusUpdate, sendProgressUpdate, calculateEta, extractFiles, axiosClient, parseSize` plus `testingExportsUtils { semverGt, expandPathVariables }`. Columns: symbol, line range, responsibility group (binary paths / wine+runtime / fs / status-push / network / Discord presence / reset+cache / parsing), importer count (`grep -rn "from '.*utils'"` per symbol), target slice phase (88 launch, 86 leaves, 84 logger, 85 stores, delete), and a "DI-wiring or behaviour" flag (FEATURES: "real behaviour is DI wiring"). Note `constructAndUpdateRPC` (Discord presence) is a user-visible removal decided out of scope for v0.11 in REQUIREMENTS-v0.11 ("Discord rich presence — dropped by operator decision 2026-11-17"), so its row is "delete with its owner" and should say so.

**`bootstrap.ts` inventory (3320 lines).** Seed from the boot steps in order, each `name:` at the line given (read this session): `app-folder` (1506), `outbound-http-tracking` (1520), `logger` (1531), `sidecar-rpc` (1558), `host-services` (1574), `sign-in-probe-state` (1606), `steam-session-state` (1633), `steam-token-store` (1657), `steam-anonymous-client` (1671), `bridge-helper-registry` (1685), `stores` (1707), `migrations` (1743), `config` (1791), `secret-vault` (1832), `steamgrid-secrets` (1842), `itad-secrets` (1861), `steam-bottle` (1874), `abort-registry` (1903), `app-runtime` (1916), `misc-runtime` (1928), `command-runner` (1952), `steam-user` (2071), `humble-services` (2107), `online-monitor-owner` (2145), `engine-state` (2169), `engine-runtime` (2189), `steam-launch-runtime` (2206), `steam-bridge-runtime` (2220), `steam-install-runtime` (2236), `gog-runtime` (2254), `legendary-runtime` (2267), `nile-runtime` (2277), `info-caches` (2285), `tools-state` (2296), `winetricks-queue` (2305), `store-managers` (2332), `download-queue` (2461), `shell-exe-receipt` (2526), `asset-root-check` (2566), `i18n` (2662), `app-shell-state` (2764), `register-handlers` (2782), `rpc-server` (2810), `protocol-url-handler` (2825), `steamcm-configure` (2836), `mac-steam-online-restore` (2852), `steam-adoption-resume` (2865), `secret-stores` (2899), `orphaned-token-cleanup` (2983), `online-monitor` (3006), `anticheat-listener` (3018), `releases-fetch` (3074), `installed-json-watcher` (3095), `playtime-lock-clear` (3132), `legacy-zoom-cleanup` (3148), `engine-temp-sweep` (3157), `store-user-reconcile` (3170), `rosetta` (3198), `playtime-queue-drain` (3220), `gog-presence` (3243), `sign-in-probe-outcomes` (3270), `ready-sentinel` (3279), `sign-in-probe` (3285), `startup-protocol-url` (3308). Columns: step, lines, what it builds, state it owns, depends-on (order constraint), destination (Rust `setup` / deleted DI plumbing / delete), notes (`CI=e2e` branches die here; `gog-presence` dies with Discord).

**State-ownership table.** One row per persisted store and per long-lived in-memory owner, one owner at each slice boundary, sequenced so no owner moves twice (PITFALLS 19, ARCHITECTURE 2.4/2.5 three tiers). Seed the store rows from `EXPECTED_KINDS` in `src/backend/__tests__/storeKinds.test.ts` (19 `TypeCheckedStoreBackend` + 33 `CacheStore` entries, each already tagged `cache` or `user-state`; the planner adds `steam_direct_launch_verdict` once decided) and `src/backend/stores/__tests__/fixtures/registeredStores.json` (54 entries). Columns: store/state, kind (cache | user-state), file path, owner today, owner after each of Phases 83..99, sync-read consumers, migration/versioning notes (Phase 68), the slice that flips it. In-memory owners seed from ARCHITECTURE 2.4 (libraryState, gameSession, update-detection cache, download queue, running-game registry) and the `bootstrap.ts` runtime steps. Use the roadmap numbering in SUMMARY.md (83 seam/core, 84 logger, 85 store host, 86 leaves, 87 engine, 88 launch, 89 libraryState, 90 Steam services, 91-92 runners, 93 download manager, 94 Humble/shortcuts, 95-97 bridge, 98 cutover, 99 deletion).

## Common Pitfalls

### Pitfall 1: Worktree with a symlinked `node_modules`
**What goes wrong:** 53 phantom frontend reds (`reading 'useRef'`), a "known red list" that is 90% artifact.
**Why:** jest realpaths the symlink and loads two React copies.
**Avoid:** real `pnpm install --frozen-lockfile` in the worktree. **Warning sign:** many unrelated React suites failing with `Cannot read properties of null (reading 'useRef')`.

### Pitfall 2: A gate that is green because its mutation mutates nothing
**What goes wrong:** `tauriShellSource` went red only because `rustfmt` re-wrapped a Rust line; had the assertion been absent it would have passed vacuously. This is the exact class D-05 targets.
**Avoid:** anchor source-text mutations on whitespace-collapsed or regex forms, and always assert the mutation changed the text (as that test's own comment demands).

### Pitfall 3: Widening a pin instead of deciding
**What goes wrong:** bumping `34 -> 39` in themeTokens, or adding the new store to `EXPECTED_KINDS` without the cache-vs-user-state decision, or adding a clippy ceiling for `deprecated`.
**Avoid:** each red has a named fix above; the operator-approval path (D-03) is only for retirement.

### Pitfall 4: Guard after the delete
**What goes wrong:** `uninstallGameCallback` deletes the install, then `removePrefix` (un-awaited) may refuse or throw; GOG/sideload mutate their library store before deleting.
**Avoid:** pre-flight every target before the first mutation (D-14), and have `uninstall()` implementations return `{ refused: true }` before touching any store.

### Pitfall 5: A new Rust test crate masked by an earlier red crate
**What goes wrong:** one `cargo test -p a -p b ...` step stops at the first red binary.
**Avoid:** the new step runs first, or `--no-fail-fast`.

### Pitfall 6: Windows junction/symlink tests that silently skip
**What goes wrong:** the existing `acf_copies_security.rs:293-295` returns early when `symlink_dir` fails.
**Avoid:** one helper that fails the test when `CI` is set; always run the junction row (no privilege needed).

### Pitfall 7: `tempfile::tempdir()` is not 0700
**Avoid:** `Builder::permissions(from_mode(0o700))` on Unix.

### Pitfall 8: Refusal state mutation order and `steam-line-ceiling`
`gameUninstall.ts` is 931 of 1000 allowed lines; new adapter code goes in `src/backend/safety/`, not into that file.

## Code Examples

### Injected-rejection test (one per guard, D-12)
```ts
// Source: proposal, style of src/backend/utils/__tests__/uninstaller.test.ts and the rustHandlers
// stub in storeManagers/steam/__tests__/removeCopies.test.ts (no jest.mock)
it('refuses and deletes nothing when the safety rustInvoke rejects (prefix)', async () => {
  const deps = makeUninstallerDeps({
    requestRustInvoke: async () => { throw new Error('transport down') }
  })
  const { prefix } = seedPrefix(root)              // real tmp dir with drive_c
  await uninstallGameCallback(deps, undefined, 'app', 'sideload', true, false)
  expect(existsSync(prefix)).toBe(true)            // nothing deleted
  expect(sentNotices(deps)).toContainEqual(expect.objectContaining({ kind: 'uninstall', reason: 'rust-invoke-failed' }))
  expect(lastStatus(deps)).toBe('done')            // tile not stuck on "uninstalling"
})
```
Write one such test per guard family: prefix, GOG install, sideload deleteFiles, Steam bridge install, Steam bottle install, bridge bottle removal, `resetHeroic` (assert no relaunch timer fired). "Unreadable input" variant: `getListOfGames` throws.

### Source gate: no raw recursive deletes left in the guarded files
```ts
// Source: proposal, modelled on moduleStateCensus.test.ts and rendererZodGuard.test.ts:214
const GUARDED = ['utils/uninstaller.ts', 'storeManagers/gog/games.ts', 'storeManagers/sideload/games.ts',
  'storeManagers/steam/gameUninstall.ts', 'storeManagers/steam/bridgeBottleLifecycle.ts', 'utils.ts' /* resetHeroic only */]
it('scans the guarded files (floor)', () => expect(scanned.length).toBeGreaterThanOrEqual(GUARDED.length))
it('has no rmSync/rm with recursive:true outside the adapter', () => expect(offenders(scanned)).toEqual([]))
it('the detector finds a seeded raw delete (not vacuous)', () => expect(offenders([seed("rmSync(x, { recursive: true })")])).toHaveLength(1))
it('fails on an empty scan', () => expect(() => assertFloor([], GUARDED.length)).toThrow())
```
`utils.ts` also holds `removeFolder` (`rm` at `:1462`, outside D-10/D-11): allowlist that line with a reason, and strip comment lines when scanning (the conventions skill's grep-trap note applies).

## State of the Art

| Old approach | Current approach | When | Impact |
|--------------|------------------|------|--------|
| Lexical containment (`resolve`+`relative`), per-site | Canonical real path, tri-state, one Rust module | 80-REVIEW A/CR-01 and A/WR-01 (2026-11) | Removes the weaker-semantics-on-port class (PITFALLS 2) |
| `std::fs::remove_dir_all` TOCTOU | std protects against symlink TOCTOU on Windows and Unix targets (not ESP-IDF, Redox, VxWorks, etc.) | documented in current std | Safe to rely on for the three CI OSes [CITED: doc.rust-lang.org/std/fs/fn.remove_dir_all.html] |

**Deprecated/outdated in the planning inputs:** the "Known red" list in `80-HANDOFF.md`; PITFALLS's statement that `ipcDomainCensus`/`flowRegistrationCensus` are on a known-red list (both pass); PITFALLS/CONTEXT's `gameUninstall.ts:768-797` / `:671` nested-bug locations (fixed, now `:540-570` and `:780-815`); `crates/README.md` section 3's `dispatch_rust_channel` wording.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GitHub-hosted `windows-latest` runs as an administrator, so `symlink_dir` succeeds | Rust test strategy | If it lacks the privilege the symlink rows fail loudly under the CI-hard-fail helper; junction rows still run. Fix: Developer Mode step or junction-only |
| A2 | `macos-latest` volume is APFS case-insensitive | adversarial table | The real-volume `Auto` probe test would see a sensitive volume; the injected-`CaseMode` rows still cover the logic |
| A3 | The Windows `gamelib-depot` `fetch.rs` failures come from a slow refused-connect on Windows vs 200-300 ms windows | CI-observed reds | Wrong diagnosis only changes the fix; the operator decision (fix vs retire) stands |
| A4 | `dunce` 1.0.5 and `unicode-normalization` 0.1.26 build at `rust-version = "1.77.2"` | Standard Stack | A per-crate MSRV bump (needs sign-off, as the depot crates did) |
| A5 | The `CI=e2e` ripple list above is complete | Zero-risk deletions | A leftover `CI === 'e2e'` branch; the post-change grep gate catches it |
| A6 | A generic `removalRefusedNotice` is preferred over extending `steamRequestNotice` | Refusal UX | Extra IPC/census churn; the smaller Steam-only route misses D-13 for non-Steam stores |
| A7 | macOS `realpath` does not normalise component case, so folding is needed even after canonicalization | safe_path semantics | Folding is harmless if it does |
| A8 | `try_update` would trip `clippy::incompatible_msrv` at MSRV 1.77.2 | CI-observed reds | Then `try_update` is a fine fix |
| A9 | `getListOfGames()` on every manager returns every installed entry with `install.install_path` | Known-installs collection | A missed store means D-16 under-detects; verify each manager when writing `collectKnownInstalls` |

## Open Questions

1. **`legendary/commands/*` and "type-only files" are not zero-risk.** Criterion 5 lists them; they have live importers and runtime brands. Recommendation: do not delete in Phase 82; collapse `legendary/commands` only if the operator wants it now, otherwise Phase 91. Needs an operator ruling because the criterion's wording says otherwise. (If the planner treats this as a deviation from a success criterion, put a `checkpoint:decision`.)
2. **CI-only reds in or out of FND-01.** Test CI (`tauriShellSource`) is in via jest. The macOS clippy `deprecated` is a one-line fix and should go in. The Windows `gamelib-depot` fetch tests need a Windows repro; fix or retire needs the operator (D-03).
3. **Symlinked install root policy.** `gamelib-steampoll` `guard_install_root` refuses it; D-15 says unlink. Recommendation: leave Phase 80's refusal (data survives either way), implement unlink in the new crate, state the difference in the README and the ledger.
4. **Sideload `deleteFiles` semantics.** `dirname(executable)` is attacker-or-accident controlled. With `protectedRoots` (home, `defaultInstallPath`) and the nested-known-install check, `~/Games/foo.exe` is refused only if another known game is inside or the folder is protected; an unknown file collection (not a game) in that folder is still deleted. Does the operator want a stricter rule (refuse unless the executable sits in a dedicated subfolder)?
5. **`steam_direct_launch_verdict` kind.** The declared kind is `cache`; the test header requires a deliberate decision. Confirm `cache`.
6. **Where `FakeHome` lives.** Recommended `gamelib-testutil`; the lower-ceremony alternative is a `testing` feature on `gamelib-safety`. Either satisfies D-08.
7. **A pre-existing `appName` path-injection on the file-level deletes** (`removeFixFile`, `removeSettingsAndLogs`) is outside D-10/D-11. Fix opportunistically or log as a todo (`severity: medium`, `platform: any`, `ready: code`, the three keys required by `pnpm planning-gates`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / pnpm | jest, gates | yes | repo-pinned (gates ran) | none needed |
| Rust toolchain | crate build/test | yes | cargo/rustc 1.99.1 | CI uses 1.99.1 for clippy |
| `gh` CLI (authenticated) | CI status, per-leg logs | yes | used this session | none |
| Windows machine | Windows-only behaviour | no | operator's non-primary OS | CI legs are the proof (D-18); a Windows-only repro (depot fetch tests) is a blocker for that one red |
| Linux machine | Linux behaviour | no | n/a | `ubuntu-latest` leg |
| esbuild (repo) | reachability proof | yes | repo version | none |
| graphify | codebase orientation | CLI present but `graphify.enabled: false` in config | not used | direct reads |

Missing with no fallback: none for planning. The Windows depot-fetch repro cannot be done locally.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29 with ts-jest, six projects (`src/backend` = "Backend", `src/frontend` = "Frontend", `src/common`, `src/preload`, `meta` = "Meta", `relay`) [VERIFIED: `jest.config.js` projects list]; Rust: `cargo test` (rustc 1.99.1) |
| Config file | `jest.config.js`, `src/backend/jest.config.js`, `meta/jest.config.js`; `src-tauri/Cargo.toml` workspace |
| Quick run (one TS file) | `npx jest --runTestsByPath src/backend/<path>.test.ts` |
| Quick run (one project) | `npx jest --selectProjects Backend` |
| Quick run (Rust) | `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil` |
| Full suite | `pnpm test` (all projects, ~4 min on 30 cores) plus the gate list below; Rust CI legs via `.github/workflows/rust-test.yml` |

### Phase Requirements -> Test Map
| Req | Behavior | Test type | Automated command | File exists? |
|-----|----------|-----------|-------------------|--------------|
| FND-01 | every jest project green | full | `pnpm test` | yes |
| FND-01 | `storeKinds` / `createStores` pin the new store | unit | `npx jest --runTestsByPath src/backend/__tests__/storeKinds.test.ts src/backend/stores/__tests__/createStores.test.ts` | yes (edit) |
| FND-01 | `tauriShellSource` mutation tests actually mutate | unit | `npx jest --runTestsByPath src/backend/__tests__/tauriShellSource.test.ts` | yes (edit) |
| FND-01 | `acfUpdateReplay` has the playtime oracle cases | unit | `npx jest --runTestsByPath src/backend/storeManagers/steam/localFiles/__tests__/acfUpdateReplay.test.ts` | yes (edit `expected.json`) |
| FND-01 | `themeTokens` census re-derived | unit | `npx jest --runTestsByPath src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` | yes (edit) |
| FND-01 | `planning-gates` 12/12 | gate | `pnpm planning-gates` | yes (fix `STATE.md` `Plan:` line) |
| FND-01 | census gates fail on empty/truncated input | unit | `npx jest --runTestsByPath src/backend/sidecar/__tests__/ipcDomainCensus.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/sidecar/__tests__/phase70PassthroughCensus.test.ts src/backend/__tests__/moduleStateCensus.test.ts` | exists; new cases Wave 0 |
| FND-01 | ratchet gates | gate | `pnpm backend-di-ceilings && pnpm steam-line-ceiling && pnpm gameinfo-narrowing-ceiling && pnpm find-deadcode && pnpm lint && pnpm i18n --fail-on-update` | yes |
| FND-02 | tri-state, safe_path, adversarial table | cargo | `cd src-tauri && cargo test -p gamelib-safety` (also each CI leg) | Wave 0 |
| FND-02 | FakeHome is 0700 and sets the eight variables | cargo | `cargo test -p gamelib-testutil` | Wave 0 |
| FND-02 | channel parity (OPS == constants == arms) | jest | `npx jest --runTestsByPath src/backend/safety/__tests__/safetyChannelParity.test.ts` | Wave 0 |
| FND-02 | one injected-rejection test per guard | jest | `npx jest --runTestsByPath src/backend/safety/__tests__/guards.test.ts` | Wave 0 |
| FND-02 | no raw recursive delete left in guarded files | jest | `npx jest --runTestsByPath src/backend/__tests__/destructivePathGate.test.ts` | Wave 0 |
| FND-02 | refusal notice renders, tile returns to rest | jest (Frontend) | `npx jest --runTestsByPath src/frontend/components/UI/RemovalRefusedNotice/__tests__/*.test.tsx` | Wave 0 |
| FND-02 | contract is fresh | gate | `pnpm check:ipc-contract` | yes |
| FND-02 | lockfile names pinned | jest | `npx jest --runTestsByPath src/backend/__tests__/cargoFeatures.test.ts` | yes (edit) |
| criterion 5 | dead code gone | gate | `pnpm find-deadcode && pnpm codecheck` | yes |

### Sampling Rate
- **Per task commit:** the task's own `--runTestsByPath` set plus `cd src-tauri && cargo test -p gamelib-safety` when Rust changed; `cargo fmt -p gamelib-safety -- --check` for Rust (prettier has no parser for `.rs`/`Cargo.toml`/`knip-baseline.txt`: `--file-info` reports `inferredParser: null`, so a `prettier --check` there is vacuous; omit it and say so in the `<verify>`).
- **Per wave merge:** `pnpm test --selectProjects Backend Meta` (or the whole `pnpm test`), the six ratchet gates, `pnpm codecheck`, `pnpm check:ipc-contract`.
- **Phase gate:** full D-01 set green in a **clean worktree with its own install**; CI green on all three Rust legs and Test CI after push (`gh run list --workflow rust-test.yml`, `--workflow test.yml`); the ledger records the proof head sha.
- Prettier in `<verify>`: `src/**/*.ts(x)` and `.github/workflows/rust-test.yml` are seen by prettier (`ignored: false`, parsers `typescript`/`yaml`): run `npx prettier --check <exact paths>`. `.planning/**` (the ledger, inventory, ownership docs) and `public/locales/**` are ignored: omit the check there and say so. `src-tauri/crates/README.md` is markdown and not ignored: check it.

### Wave 0 Gaps
- [ ] `src-tauri/crates/gamelib-safety/{src,tests/adversarial.rs}` and `gamelib-testutil/src/lib.rs`
- [ ] `src/backend/safety/{rustSafety.ts,knownInstalls.ts,refusal.ts}` and `__tests__/{safetyChannelParity,guards}.test.ts`
- [ ] `src/backend/__tests__/destructivePathGate.test.ts`
- [ ] `src/backend/testUtils/censusFloor.ts` and the empty-input cases in the four census tests
- [ ] Frontend notice component and tests
- [ ] `82-TEST-LEDGER.md`, `82-UTILS-BOOTSTRAP-INVENTORY.md`, `82-STATE-OWNERSHIP.md`
- [ ] No framework install needed.

## Security Domain

Security enforcement is not disabled in `.planning/config.json` (the key is absent), so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (renderer-supplied `appName`/paths reaching a delete) | argument validation at the IPC boundary (`nonEmptyString()`, `runnerArg()`) plus the Rust guard with a trust root from settings |
| V5 Input Validation | yes | serde `deny_unknown_fields` Args structs (README section 2), closed-set `Reason` enums, lexical refusal of `..`, drive, UNC, NUL |
| V6 Cryptography | no | — |
| V12 Files and Resources (path traversal, symlink following) | yes | canonical real-path containment, unlink-not-follow, std `remove_dir_all` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `appName`/installdir/manifest (`../`, `C:\`, UNC) | Tampering | lexical refusal then canonical containment under a settings-derived trust root |
| Symlink/junction redirect of a delete target (CWE-59) | Tampering | unlink the link, never recurse through it; no follow in `remove_dir_all` |
| TOCTOU between check and delete (CWE-367) | Tampering | the delete call re-checks; std's `remove_dir_all` symlink-race protection |
| Deleting a sibling game co-installed beside the target | Tampering / data loss | nested-known-install refusal across all stores (D-16), protected roots |
| Fail-open on a failed guard call | Elevation / data loss | adapter maps rejection and malformed reply to `unknown`, which refuses (D-06) |
| Notice or log leaking a path | Information disclosure | closed-set reasons, title only (no path) in the notice, no paths in the log line |

## Project Constraints (from CLAUDE.md)

- **GSD enforcement:** repo edits go through a GSD command; use `/gsd-execute-phase` (hyphen form, never `/gsd:`); `gsd-tools commit "msg" path` commits all dirty `.planning`, so executors stage with `--files` (memory notes).
- **Conventions (full text in `Skill("gamelib-conventions")`, read):**
  - Todos created in `.planning/todos/pending/` carry `severity:`, `platform:`, `ready:` bare, lowercase, exact, in that order (`pnpm planning-gates` enforces; never widen the vocabulary).
  - Spawning a child from `src/` or `meta/` uses `createFakeHomeProfile()`, never an `env` literal. The new TS adapter spawns nothing; the Rust `FakeHome` is its analogue.
  - Sidecar handles: `unref()` every timer/watcher/socket/child and leave no unbounded in-flight work at boot. Relevant to `resetHeroic`'s relaunch timer.
  - UAT items: `### N.` at column 0, inline `expected:`, `result:` opening with a status word (this phase needs no live session per D-18, so likely none).
  - **Every task `<verify>` runs `npx prettier --check` over the exact paths written**, after `--file-info` confirms they are not ignored; if every path is ignored, say so and omit the check (ledger/inventory/ownership docs, `public/locales/**`, and for Rust files use `cargo fmt -p <crate> -- --check`).
- **Tech stack:** Rust/Tauri shell with React/TS renderer; steam-vent/gamelib-steamcm decisions stand (this phase does not touch them). Do not raise deviation from upstream Heroic as a concern.
- **Architecture:** orient with `graphify query`, do not read `GRAPH_REPORT.md` or `graph.json`.
- **Memory notes that bear on execution:** `tauri dev` does not rebuild the sidecar (run `pnpm build:sidecar` before any live check of TS changes); dev launch is `pnpm tauri:dev`, never `tauri:dev:run`; a fresh worktree needs build prep; macOS TCC and CrossOver notes are irrelevant here.
- **Ratchet gates that new code must respect:** `jestMock` baseline (no new `jest.mock`), `moduleStateCensus` zero module state (the adapter and helpers must hold no top-level mutable binding), `steam-line-ceiling` 1000 lines per file under the steam dir, `hardcodedStringGate` (user-facing strings through `t()`), `logSecretGate`, `boundaries` (dependency-cruiser), `lint` warning ceilings, `find-deadcode` baseline.

## Sources

### Primary (HIGH confidence)
- Repo files read or run this session: `82-CONTEXT.md`, `REQUIREMENTS-v0.11.md`, `research/v0.11/{PITFALLS,FEATURES,SUMMARY,ARCHITECTURE,STACK}.md`, `src-tauri/crates/README.md`, `.husky/pre-push`, `.github/workflows/rust-test.yml`, the delete sites listed above, `gamelib-steampoll/src/acf_copies.rs`, `gamelib-scan/src/contain.rs`, `src/backend/testUtils/fakeHomeProfile.ts`, the census tests, the `meta/*.cjs` gates, `meta/knip-baseline.txt`, `package.json`, `src-tauri/Cargo.toml`/`Cargo.lock`
- Measurements: full `pnpm test` in a `git worktree`, the nine gates, a main-tree rerun of the 58 failing suites, an esbuild metafile of the sidecar entry, `gh run view` logs for Rust test and Test CI
- [doc.rust-lang.org/std/fs/fn.remove_dir_all.html](https://doc.rust-lang.org/std/fs/fn.remove_dir_all.html): does not follow symlinks; TOCTOU protection; Windows implementation
- [docs.rs/tempfile Builder](https://docs.rs/tempfile/latest/tempfile/struct.Builder.html): default dir permissions `0o777` before umask; `permissions()`
- [docs.rs/dunce](https://docs.rs/dunce/latest/dunce/), [docs.rs/junction](https://docs.rs/junction/latest/junction/)
- crates.io API (dependencies of `junction 2.1.0` and `unicode-normalization 0.1.26`), `cargo search`, `gsd-tools query package-legitimacy check`

### Secondary (MEDIUM confidence)
- Web search on Windows symlink privilege (general Windows background, not specific to GitHub runners): [Microsoft "Create symbolic links"](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-R2-and-2012/dn221947(v=ws.11)), [Git for Windows symbolic links](https://github.com/git-for-windows/git/wiki/symbolic-links)

### Tertiary (LOW confidence)
- GitHub runner privilege and APFS case behaviour: see Assumptions A1, A2

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for the crate additions (lock and registry checked), MEDIUM for per-crate MSRV
- Architecture / delete inventory: HIGH (every site read at HEAD)
- Pitfalls: HIGH (reproduced or measured)
- Rust API and CI behaviours on Windows: MEDIUM (proposal; first CI run is the proof)

**Research date:** 2026-11-20
**Valid until:** 2026-11-27 (7 days: the tree is moving fast: quick tasks landed new reds twice in the last 3 days, so re-measure the red set at plan-execution start per D-02)
