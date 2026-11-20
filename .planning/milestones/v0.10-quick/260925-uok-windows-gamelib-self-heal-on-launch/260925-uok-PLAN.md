---
phase: quick-260925-uok
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - src-tauri/Cargo.toml
  - src/backend/__tests__/tauriShellSource.test.ts
  - .planning/REQUIREMENTS.md
  - .planning/todos/pending/2026-09-25-windows-gamelib-registration-is-install-time-only.md
  - .planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md
autonomous: true
requirements: [REQ-46-06]

must_haves:
  truths:
    - "On Windows, a GameLib launch whose HKCU gamelib:// shell\\open\\command is missing, dangling, or points at a different executable rewrites that key to point at the running executable."
    - "A launch whose key already points at the running executable performs no registry write (no rewrite-every-launch churn)."
    - "Every registry failure — missing key, access denied, read failure, write failure — logs a warning and returns; startup never aborts."
    - "A run with CI=e2e performs no registry read and no registry write."
    - "The single register_all() call site is still under #[cfg(target_os = \"linux\")] and the REQ-46-06 pin tests are green."
    - "The values the repair writes are byte-identical in shape to what the NSIS installer writes."
    - "main.rs's decision-point (a) prose, tauriShellSource.test.ts's header, and REQUIREMENTS.md decision point (a) all describe the new self-heal path rather than the superseded 'install-time only, no runtime self-assertion' story."
  artifacts:
    - path: "src-tauri/src/main.rs"
      provides: "pure protocol-command normalisation/comparison helpers + #[cfg(windows)] registry repair fn + its call site + rewritten decision-point prose"
      contains: "fn gamelib_protocol_repair_needed"
    - path: "src-tauri/Cargo.toml"
      provides: "Win32_System_Registry feature on the cfg(windows) windows-sys dependency, with an inline comment naming the gated symbols"
      contains: "Win32_System_Registry"
    - path: "src/backend/__tests__/tauriShellSource.test.ts"
      provides: "source gates for the repair call site (cfg(windows)), the CI=e2e guard on the repair path, the absence of register_all() on the repair path, and the fail-open shape — each with a RED self-test"
      contains: "gamelib_protocol_repair"
    - path: ".planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md"
      provides: "the closed todo recording option 1, the rationale, and what remains unverified"
      contains: "Resolution"
  key_links:
    - from: "src-tauri/src/main.rs .setup() closure"
      to: "repair_windows_gamelib_protocol_registration"
      via: "a #[cfg(windows)] block sitting immediately AFTER the existing #[cfg(target_os = \"linux\")] register_all block"
      pattern: "repair_windows_gamelib_protocol_registration\\("
    - from: "repair_windows_gamelib_protocol_registration"
      to: "gamelib_protocol_repair_needed"
      via: "direct call on the read result"
      pattern: "gamelib_protocol_repair_needed\\("
    - from: "src-tauri/Cargo.toml Win32_System_Registry"
      to: "windows_sys::Win32::System::Registry::{RegOpenKeyExW, RegQueryValueExW, RegCreateKeyExW, RegSetValueExW, RegCloseKey}"
      via: "cargo feature gate"
      pattern: "Win32_System_Registry"
---

<objective>
Close `.planning/todos/pending/2026-09-25-windows-gamelib-registration-is-install-time-only.md` by
implementing **option 1 of its Options list — self-heal on launch**.

Today, `gamelib://` is registered on Windows at INSTALL time only (the NSIS template writes HKCU
`Software\Classes\gamelib`). Any other application that writes that key — at its own install time
or, as observed live on 2026-09-25, at its own runtime launch — silently steals the scheme, and
GameLib has no way to detect or recover from it short of a reinstall. On 2026-09-25 a leftover
Electron-era `C:\Program Files\GameLib\GameLib.exe` did exactly that during plan 46-07's live-gate
re-run; the operator then uninstalled it, leaving `gamelib://` DANGLING, and `46-07` Check 5 failed
with `Start-Process : This command cannot be run due to the error: Application not found.` A human
had to restore the HKCU value with `Set-ItemProperty` before the re-gate could continue.

Purpose: at Windows startup, read `HKCU\Software\Classes\gamelib\shell\open\command`. If it is
missing, dangling, or points at anything other than the currently-running executable, rewrite it to
point at the currently-running executable.

Output: a new, narrowly-scoped `#[cfg(windows)]` repair function in `src-tauri/src/main.rs`, its
pure host-independent decision helpers with Rust unit tests, TypeScript source gates, and the
corrected prose in three places that currently tell the superseded story.
</objective>

<locked_decisions>
The operator has ALREADY chosen the mitigation. **Do not re-open it. Do not survey alternatives.
Do not propose option 2 or option 3.** Options 2 (warn-only) and 3 (accept-and-document) were
explicitly rejected.

These constraints are operator-stated and non-negotiable:

**(a) This is a NEW Windows-only repair function, NOT a widening of `register_all()`.**
The single `register_all()` call site must remain under `#[cfg(target_os = "linux")]` verbatim, so
`cfgGuardAboveRegisterAll()` in `src/backend/__tests__/tauriShellSource.test.ts` keeps returning
`'#[cfg(target_os = "linux")]'` and the REQ-46-06 pin tests stay green.

That same describe block also asserts **`register_all() has exactly one call site`** by counting
occurrences of the literal string `register_all()` in the comment-stripped source. `loadMainRsCode`
(tauriShellSource.test.ts:73) strips comments in three passes — `stripSourceComments` for `/* */`
blocks, a filter dropping any line whose trimmed form starts with `//` (this covers `///` doc
comments too), and `stripTrailingLineComment` for mixed code/comment lines — so prose mentioning
`register_all()` is safe. What is NOT safe is a Rust **string literal** containing `register_all()`,
or any second real call. Do not introduce either.

**(b) Fail open (T-34.5-G6-24).** A failed read, a failed write, an access-denied, a missing key —
every one logs a warning through the existing discipline and returns. Startup must never abort.
This is the same rule the neighbouring `CreateMutexW` code already follows.

**(c) Honour the CI=e2e guard.** `std::env::var("CI").as_deref() == Ok("e2e")` must skip the repair
entirely, exactly as the Linux `register_all()` arm does. This is load-bearing, not cosmetic: unlike
the Linux arm this repair **WRITES to the real user registry**, so an automated test run that
skipped the guard would rewrite the host's protocol association as a side effect of starting the
app.

**(d) Update the prose in three places** (task 2 and task 3 below name them exactly).

**(e) Add source-level test coverage with RED-proof self-tests**, in the established style.

**(f) Every task's `<verify>` runs `npx prettier --check` over the exact paths that task wrote** —
explicit paths, never a bare `.`.

**(g) Move the todo to `.planning/todos/completed/` as the final task**, recording honestly what
remains unverified.
</locked_decisions>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-25-windows-gamelib-registration-is-install-time-only.md

Read these regions of the codebase before writing anything (the `graphify` orientation rule in
CLAUDE.md applies — run `graphify query "windows single instance deep link registration"` first):

- `src-tauri/src/main.rs:10070-10133` — the decision-point (a) comment block and the Linux-only
  `register_all()` call. This is where the new call site goes (immediately AFTER the closing `}` of
  the `#[cfg(target_os = "linux")]` block at :10133) and where the prose rewrite lands.
- `src-tauri/src/main.rs:8409-8600` — the house style for `windows-sys` FFI in this file: a
  `#[cfg(windows)]` attribute at column 0, scoped `use windows_sys::Win32::...` imports INSIDE the
  fn body, one `unsafe` block with a `// SAFETY:` comment justifying it, every failure path
  returning a sentinel rather than panicking, and a doc comment stating the fail-open contract.
- `src-tauri/src/main.rs:9553-9587` — `shell_diag`. Note its discipline: it is used on the deep-link
  path and **must never be handed a URL payload**. The repair path logs registry *paths* and
  *outcomes*, never the stored command value verbatim (a hijacker's command string is untrusted
  third-party data; log a coarse classification instead — see task 2).
- `src-tauri/src/main.rs:9754-9790` — the `#[cfg(windows)]` single-instance block in `main()`. Note
  the `eprintln!("[shell] WARN: ... (fail-open, T-34.5-G6-24)")` shape.
- `src-tauri/Cargo.toml:237-268` — the `[target.'cfg(windows)'.dependencies] windows-sys` block.
  Each feature carries an inline comment naming the exact symbols it gates, and the trailing
  paragraph about the omitted `Win32_System_Memory` feature shows the expected rigour (symbols
  confirmed by grepping the vendored source, not assumed).
- `src/backend/__tests__/tauriShellSource.test.ts:2268-2423` — the deep-link describe block:
  `cfgGuardAboveRegisterAll`, the REQ-46-06 pin tests, the CI-guard test, and the RED self-test
  pattern. **:2268-2292 is the header doc comment whose item 3 must be corrected.**
- `src/backend/__tests__/tauriShellSource.test.ts:2466-2523` — `fnRegion` and its RED self-test.
  This is the region-gate pattern the new tests should copy. Note `fnRegion` stops at the next
  `\nfn ` or `\n#[cfg` at column 0, and that it is scoped to its own describe — the file's
  established convention is to re-declare such helpers per-describe (`extractBracedBlock` is
  declared three separate times), so declare a fresh copy rather than hoisting.
- `src/backend/__tests__/cargoFeatures.test.ts:185-300` — `EXPECTED_LOCKFILE_CRATE_NAMES`. This pins
  Cargo.lock crate **names**. Adding a FEATURE to an already-declared dependency changes no crate
  name, so this test stays green; re-run it to prove that rather than assuming it.
- `.planning/REQUIREMENTS.md:2215-2221` (decision point (a)) and `:2282-2287` (REQ-46-06).
</context>

<established_facts>
These were established during planning by direct inspection. Verify them if cheap; do not
re-derive from scratch, and do not guess where a fact is already pinned here.

**F1 — The exact installer output is knowable from this repo.** A real generated
`src-tauri/target/debug/nsis/x64/installer.nsi` exists in the working tree. Lines 922-925 are:

    WriteRegStr SHCTX "Software\Classes\gamelib" "URL Protocol" ""
    WriteRegStr SHCTX "Software\Classes\gamelib" "" "URL:${BUNDLEID} protocol"
    WriteRegStr SHCTX "Software\Classes\gamelib\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
    WriteRegStr SHCTX "Software\Classes\gamelib\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""

with `!define INSTALLMODE "currentUser"` (line 39) → `SHCTX` = **HKCU**,
`!define MAINBINARYNAME "gamelib-shell"` (line 46) → the installed exe is
`$INSTDIR\gamelib-shell.exe`, and `!define BUNDLEID "com.gamelib.shell"` (line 48), which matches
`tauri.conf.json`'s `"identifier"`. `$\"` is NSIS's escaped double-quote. So the four literal
values the installer produces are:

| key | value name | value |
|---|---|---|
| `Software\Classes\gamelib` | `URL Protocol` | `` (empty `REG_SZ`) |
| `Software\Classes\gamelib` | *(default)* | `URL:com.gamelib.shell protocol` |
| `Software\Classes\gamelib\DefaultIcon` | *(default)* | `"<exe>",0` |
| `Software\Classes\gamelib\shell\open\command` | *(default)* | `"<exe>" "%1"` |

Do **not** hardcode `com.gamelib.shell`. Use `app.config().identifier` at the call site and pass it
in, so the written value can never drift from `tauri.conf.json`.

**F2 — The `windows-sys` feature is `Win32_System_Registry`.** Confirmed by grepping the vendored
`windows-sys-0.60.2` source (`~/.cargo/registry/src/index.crates.io-*/windows-sys-0.60.2/`), the
same method the existing `Win32_System_Memory` comment used:

- `src/Windows/Win32/System/Registry/mod.rs` declares `RegCloseKey` (:2), `RegCreateKeyExW` (:13),
  `RegOpenKeyExW` (:56), `RegQueryValueExW` (:69), `RegSetValueExW` (:90), plus
  `pub type HKEY` (:147), `HKEY_CURRENT_USER` (:150), `KEY_READ` (:169), `KEY_SET_VALUE` (:170),
  `KEY_WRITE` (:174), `REG_OPTION_NON_VOLATILE` (:1043), `REG_SZ` (:1073).
- `Cargo.toml:235` declares `Win32_System_Registry = ["Win32_System"]`.
- `RegCreateKeyExW` additionally carries `#[cfg(feature = "Win32_Security")]` (for its
  `SECURITY_ATTRIBUTES` parameter). **`Win32_Security` is already enabled** in this project, so no
  second feature is needed.
- `ERROR_SUCCESS` (:3957), `ERROR_FILE_NOT_FOUND` (:2220) and `type WIN32_ERROR` (:10086) live in
  `src/Windows/Win32/Foundation/mod.rs`, gated by `Win32_Foundation` — **already enabled**.

So exactly ONE feature is added: `Win32_System_Registry`.

**F3 — Dependency choice: stay with `windows-sys`.** `winreg` and `windows-registry` are present in
`Cargo.lock` transitively, but the default in this repo is consistency with the adjacent
single-instance FFI, and Cargo.toml:246-248 already records the standing rationale ("`windows-sys`,
not the higher-level `windows` crate: narrow FFI surface, matching every other Win32-FFI dependency
already in this tree"). Five registry calls is a narrow surface with no ergonomic argument strong
enough to justify a departure. **Record this decision in the Cargo.toml comment.**

**F4 — `cargo fmt --check` is ALREADY RED on this repo and must NOT be run as a gate.** Measured
2026-09-25: `cd src-tauri && cargo fmt --check` exits 1 against unmodified `main.rs` (pre-existing
import-order and if-expression debt from line 25 onward). There is no rustfmt job in
`.github/workflows/` and no rustfmt hook in `.husky/`. Running `cargo fmt` would reformat thousands
of unrelated lines. The repo's real Rust gate is `.github/workflows/rust-test.yml`:
`cd src-tauri && cargo test --bin gamelib-shell`. Use that, plus `cargo check --bin gamelib-shell`.
Both compile the `#[cfg(windows)]` arm for real, because the executing host IS Windows.
`build/renderer/index.html` is present, so `tauri::generate_context!()` will resolve.

**F5 — `.planning/**` is in `.prettierignore`**, but `npx prettier --check .planning/<file>` still
exits 0 ("All matched files use Prettier code style!"). Constraint (f) is satisfied literally and
harmlessly by including those paths; do so.

**F6 — Jest invocation.** `jest.config.js` uses path-based `projects` with no `displayName`, so
`--selectProjects` is unavailable. Run a single file as
`npx jest src/backend/__tests__/tauriShellSource.test.ts`.
</established_facts>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure protocol-command helpers in main.rs, unit-tested on any host</name>
  <files>src-tauri/src/main.rs</files>
  <behavior>
Following the REQ-46-07 precedent already established for the Windows single-instance guard —
"every non-FFI decision is a pure function, NOT `#[cfg(windows)]`-gated, and unit-tested in
`#[cfg(test)] mod tests` on any host" — all the *deciding* happens here, where it can be tested on
any machine. Task 2's FFI function does I/O and nothing else.

Write these Rust unit tests in the existing `#[cfg(test)] mod tests` block FIRST, watch them fail,
then implement:

`gamelib_protocol_command_exe(command: &str) -> Option<String>`
  - `"C:\\Program Files\\GameLib\\gamelib-shell.exe" "%1"` → `Some("C:\\Program Files\\GameLib\\gamelib-shell.exe")`
  - `"C:\\a\\b.exe" %1` (unquoted placeholder) → `Some("C:\\a\\b.exe")`
  - `C:\\nospaces\\b.exe "%1"` (unquoted exe) → `Some("C:\\nospaces\\b.exe")`
  - `"C:\\a\\b.exe"` (no argument at all) → `Some("C:\\a\\b.exe")`
  - `   "C:\\a\\b.exe" "%1"   ` (leading/trailing whitespace) → `Some("C:\\a\\b.exe")`
  - `""` → `None`;  `"   "` → `None`;  `"\"\" \"%1\""` (empty quoted path) → `None`
  - `"\"C:\\a\\b.exe` (unterminated opening quote) → `None`

`gamelib_protocol_paths_equivalent(a: &str, b: &str) -> bool`
  - case-insensitive: `C:\\A\\B.EXE` vs `c:\\a\\b.exe` → true (use `eq_ignore_ascii_case`, NOT a
    locale-aware fold — Windows path comparison is ordinal-ignore-case)
  - trailing/leading whitespace ignored
  - a leading `\\\\?\\` extended-length prefix on either side is stripped before comparison
    (`std::env::current_exe()` can return one), so `\\\\?\\C:\\a\\b.exe` vs `C:\\a\\b.exe` → true
  - genuinely different paths → false
  - **no filesystem access** — a dangling path must still compare, and `canonicalize()` would fail
    on exactly the case this feature exists for

`gamelib_protocol_repair_needed(stored: Option<&str>, current_exe: &str) -> bool`
  - `None` (key or value absent) → true
  - `Some("")` → true
  - `Some` whose extracted exe is `None` (malformed) → true
  - `Some` pointing at a DIFFERENT exe → true
  - `Some` pointing at the current exe, any case, with or without the `"%1"` argument → **false**
    (this is the anti-churn case: a naive string equality here produces a rewrite on every single
    launch)

`gamelib_protocol_open_command(exe: &str) -> String` → `"<exe>" "%1"`, byte-identical in shape to
F1's table row 4. Test with a spaces-in-path exe.

`gamelib_protocol_default_value(identifier: &str) -> String` → `URL:<identifier> protocol`
(F1 row 2). Test with `com.gamelib.shell`.

`gamelib_protocol_default_icon(exe: &str) -> String` → `"<exe>",0` (F1 row 3). Note the **no space**
after the comma — match the NSIS output exactly.

Round-trip test, the one that matters most: feed
`gamelib_protocol_open_command("C:\\Program Files\\GameLib\\gamelib-shell.exe")` straight back into
`gamelib_protocol_repair_needed(Some(&produced), "C:\\Program Files\\GameLib\\gamelib-shell.exe")`
and assert **false**. A repair that does not satisfy its own detector rewrites forever.
  </behavior>
  <action>
Add the six pure functions above to `src-tauri/src/main.rs`. Place them immediately BEFORE the
`// Everything below is #[cfg(windows)]-only ...` banner at line 8409, alongside the other pure
`windows_*` decision helpers that live above that banner — they belong to the same
"host-independent, unit-testable" tier that the banner's own text defines.

**None of them carry a `#[cfg]` attribute.** That is the point: they compile and are tested on
macOS and Linux CI legs too.

Give the group a doc comment that states: (1) these are the decision half of the Windows
`gamelib://` self-heal, deliberately separated from the FFI half per the REQ-46-07 precedent stated
in the banner below them; (2) the exact NSIS-produced value shapes from F1, with the
`installer.nsi:922-925` citation, because byte-compatibility with the installer is the whole
correctness criterion for the writer; (3) that comparison is deliberately filesystem-free, naming
the dangling-path reason.

Then add the `#[cfg(test)] mod tests` cases from `<behavior>`, one `#[test]` fn per function plus
the round-trip.

Do not write any `windows_sys` import, any `unsafe`, or any registry call in this task. Do not use
the literal text `register_all()` in a string literal anywhere (locked decision (a)).
  </action>
  <verify>
    <automated>cd src-tauri && cargo test --bin gamelib-shell 2>&1 | tail -20</automated>
    <automated>cd src-tauri && cargo test --bin gamelib-shell gamelib_protocol 2>&1 | tail -20</automated>
    <automated>npx prettier --check src-tauri/src/main.rs</automated>
  </verify>
  <done>
`cargo test --bin gamelib-shell` passes with the new `gamelib_protocol_*` tests included and no
pre-existing test regressed (baseline recorded in `rust-test.yml`: 234 passed, 0 failed, 2 ignored —
the new count must be strictly higher with 0 failed). The round-trip test passes. No `#[cfg]`
attribute on any of the six new functions. `prettier --check` on the written path exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: The #[cfg(windows)] registry repair, its Cargo feature, its call site, and the decision-point prose rewrite</name>
  <files>src-tauri/Cargo.toml, src-tauri/src/main.rs</files>
  <action>
**2a — Cargo.toml.** Add exactly one feature to the existing
`[target.'cfg(windows)'.dependencies] windows-sys` list (`src-tauri/Cargo.toml:250-263`):

    "Win32_System_Registry",         # RegOpenKeyExW, RegQueryValueExW, RegCreateKeyExW,
                                     # RegSetValueExW, RegCloseKey, HKEY, HKEY_CURRENT_USER,
                                     # KEY_READ/KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ

matching the existing per-feature inline-comment style. Extend that block's surrounding prose with a
short paragraph recording F2 (the symbols were confirmed in
`windows-sys-0.60.2/src/Windows/Win32/System/Registry/mod.rs`, and `RegCreateKeyExW`'s extra
`#[cfg(feature = "Win32_Security")]` is already satisfied by the `Win32_Security` feature above) and
F3 (`winreg`/`windows-registry` were considered and rejected for consistency with the neighbouring
single-instance FFI — the same "narrow FFI surface" rationale this block already states). Adding a
feature changes no Cargo.lock crate name, so `cargoFeatures.test.ts`'s pin is unaffected; say so.

**2b — the repair function.** Add `fn repair_windows_gamelib_protocol_registration(identifier: &str)`
to `src-tauri/src/main.rs`, `#[cfg(windows)]`-gated at column 0, placed in the FFI tier below the
line-8409 banner (after `current_user_identity`, before or after the pipe helpers — anywhere in
that tier is fine). Signature returns `()`; it is infallible by construction, like `shell_diag`.

Shape it exactly like `current_user_identity`: a doc comment stating the fail-open contract, scoped
`use windows_sys::Win32::...` imports inside the fn, one `unsafe` block with a `// SAFETY:` comment,
and a handle-closing discipline with no early `return`/`?` between an `Reg*` open/create and its
`RegCloseKey`.

Behaviour:

1. **CI=e2e guard FIRST**, before any registry call:
   `if std::env::var("CI").as_deref() == Ok("e2e") { eprintln!(...); return; }`
   Use that expression **character-for-character** — `tauriShellSource.test.ts:2409` asserts the
   literal string `std::env::var("CI").as_deref() == Ok("e2e")` is present in the source, and task 3
   adds a region-scoped version of that assertion over this function. The log line must name the
   repair, e.g. `"[shell] CI=e2e -- skipping the gamelib:// HKCU registration repair"`.

2. `let Ok(exe) = std::env::current_exe() else { warn + return }`, then
   `let Some(exe) = exe.to_str() else { warn + return }` (a non-UTF-8 exe path fails open).

3. Open `HKEY_CURRENT_USER` subkey `Software\Classes\gamelib\shell\open\command` with `KEY_READ`.
   Read the **default** value (`lpValueName` = a pointer to a wide empty string) with
   `RegQueryValueExW`, two-call size probe (first call `lpData` null to learn `cbData`, then a
   `Vec<u16>` sized `cbData / 2`). Accept only `REG_SZ` / `REG_EXPAND_SZ`; anything else is treated
   as `None`. Trim the trailing NUL(s) before `String::from_utf16_lossy`. **Any** non-`ERROR_SUCCESS`
   return — including `ERROR_FILE_NOT_FOUND` — yields `None`, which is a legitimate "repair needed"
   input, not an error to bail on. `RegCloseKey` the read handle before deciding.

4. `if !gamelib_protocol_repair_needed(stored.as_deref(), exe) { return; }` — no write, no log noise
   beyond at most one debug line. This is the overwhelmingly common path.

5. Otherwise write, via `RegCreateKeyExW` (`REG_OPTION_NON_VOLATILE`, `KEY_SET_VALUE`, null
   `lpSecurityAttributes`, null `lpClass`) + `RegSetValueExW` (`REG_SZ`, data = the UTF-16 encoding
   of the value INCLUDING its NUL terminator, `cbData` = `len_utf16_including_nul * 2`), **all four
   values from F1**, in the installer's own order:
     - `Software\Classes\gamelib`                    value `URL Protocol` = `""`
     - `Software\Classes\gamelib`                    default = `gamelib_protocol_default_value(identifier)`
     - `Software\Classes\gamelib\DefaultIcon`        default = `gamelib_protocol_default_icon(exe)`
     - `Software\Classes\gamelib\shell\open\command` default = `gamelib_protocol_open_command(exe)`
   All four, not just the command: a hijacker that rewrote `shell\open\command` may equally have
   rewritten the default and the icon, and writing the complete installer-shaped set is what makes
   the repaired key byte-compatible rather than a new third divergent shape. Each key gets its own
   create/set/close; a failure on any one logs and moves on to the next (fail open, no `?`).

6. Log discipline, following `shell_diag`'s rule. Log the registry SUBKEY PATH and the OUTCOME. Do
   **not** log the stored command value verbatim — it is untrusted third-party data of unbounded
   length written by whatever hijacked the key, and the neighbouring deep-link code's whole
   T-34.5-G6-25 discipline is "the reason, never the payload". Log a coarse classification instead:
   `absent`, `unparseable`, or `points-elsewhere`. Use `eprintln!("[shell] WARN: ...")` for failures
   (matching the `#[cfg(windows)]` single-instance block at :9761-9786) and `shell_diag` for the
   one-line success/decision record, since "did the repair run and what did it decide?" is exactly
   the kind of question `shell_diag`'s file sink exists to answer under a bundled app with discarded
   stderr.

7. `unwrap()`, `expect(`, `panic!`, `unreachable!`, and `?` are **forbidden** in this function body.
   Task 3 gates on their absence.

**2c — the call site.** In the `.setup()` closure, immediately AFTER the closing `}` of the existing
`#[cfg(target_os = "linux")]` block (currently `src-tauri/src/main.rs:10133`), add:

    #[cfg(windows)]
    repair_windows_gamelib_protocol_registration(&app.config().identifier);

(or an equivalent `#[cfg(windows)] { ... }` block — either satisfies task 3's nearest-cfg walk).

Placement rationale to state in the comment: (i) it must be AFTER, not before, so the nearest
`#[cfg(...)]` above the sole `register_all()` occurrence stays `#[cfg(target_os = "linux")]` and
`cfgGuardAboveRegisterAll()` is untouched; (ii) it sits in `.setup()` rather than in `main()`
because by this point the single-instance decision has already run and every secondary has
`std::process::exit(0)`'d, so only the ONE surviving instance ever touches the registry; (iii) it is
**synchronous and not spawned on a thread** — four HKCU value writes on a worst-case path is
sub-millisecond, a thread would add a handle whose termination would then have to be reasoned about
for no measurable gain, and a deep link arriving moments after launch benefits from the repair
having already completed rather than racing it. (`app.config().identifier` is read here rather than
hardcoded so the written `URL:<id> protocol` value cannot drift from `tauri.conf.json`.)

**2d — rewrite the decision-point (a) prose** at `src-tauri/src/main.rs:10070-10133`. Its Windows
bullet currently says Windows "registers at INSTALL time only" and the block as a whole asserts
there is no runtime self-assertion. That stops being true with this change. The rewritten bullet
must say, in this file's own register:

  - Windows still registers at INSTALL time via the NSIS template (unchanged), **and** now
    self-heals at runtime via `repair_windows_gamelib_protocol_registration`.
  - The repair is deliberately **narrower than `register_all()`**, and why: `register_all()` is the
    plugin's whole-scheme registration for every configured scheme on whatever the platform's own
    mechanism is; this is a single HKCU subtree read, a comparison, and a conditional write of the
    four values the NSIS template already writes — no plugin surface, no new scheme, no
    platform-abstraction layer. Widening the `#[cfg]` on `register_all()` would have been the
    broader change and was rejected in favour of this.
  - The evidence: the 2026-09-25 live-gate hijack during plan 46-07 (`46-LIVE-GATE-RERUN.md`,
    Check 3b / Check 5). Name the mechanism concretely — a leftover machine-wide Electron-era
    `GameLib.exe` re-registered HKCU at its own runtime launch, was then uninstalled without
    restoring the prior value, and left `gamelib://` dangling; Check 5's ping failed with
    `Application not found` and a human had to `Set-ItemProperty` the value back by hand.
  - The last-launch-wins consequence, stated rather than hidden: two GameLib installations on one
    machine will each repair the key to themselves on launch, so the most recently launched build
    owns `gamelib://`. That is the intended semantics of "point it at the current executable" and is
    strictly better than the dangling state it replaces, but it is not a no-op for a
    multiple-install machine and a future reader should not have to discover it empirically.
  - The `CI=e2e` guard is load-bearing HERE in a way it is not on the Linux arm: this path WRITES to
    the real user registry.

Keep the macOS and Linux bullets, the single-instance-guard bullet, the RESEARCH.md Q6 timing note,
and the ledger-row bullet intact. Do not let the block shrink into a summary — it is load-bearing
and its length is earned. And keep the existing REQ-46-06 override recipe pointer accurate: the pin
is still Linux-only and still operator-overridable; what changed is *why* Windows does not need it.
  </action>
  <verify>
    <automated>cd src-tauri && cargo check --bin gamelib-shell 2>&1 | tail -20</automated>
    <automated>cd src-tauri && cargo test --bin gamelib-shell 2>&1 | tail -20</automated>
    <automated>npx jest src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/cargoFeatures.test.ts src/backend/__tests__/windowsDeepLinkSuppression.test.ts 2>&1 | tail -30</automated>
    <automated>node -e "const s=require('fs').readFileSync('src-tauri/src/main.rs','utf8').split('\n').filter(l=>!l.trim().startsWith('//')).join('\n'); const n=s.split('register_all()').length-1; if(n!==1){console.error('FAIL: register_all() occurrences in non-comment source =',n);process.exit(1)} console.log('OK: exactly one register_all() call site')"</automated>
    <automated>npx prettier --check src-tauri/src/main.rs src-tauri/Cargo.toml</automated>
  </verify>
  <done>
`cargo check` and `cargo test --bin gamelib-shell` both pass on this Windows host (so the
`#[cfg(windows)]` arm genuinely compiled). `cfgGuardAboveRegisterAll()` still returns
`'#[cfg(target_os = "linux")]'` and both REQ-46-06 pin tests are green. `cargoFeatures.test.ts` and
`windowsDeepLinkSuppression.test.ts` are green. The one-call-site check prints OK. Exactly one new
`windows-sys` feature (`Win32_System_Registry`) was added. The repair function body contains no
`unwrap()` / `expect(` / `panic!` / `?`. The decision-point block covers all five bullets listed in
2d. `prettier --check` on both written paths exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 3: Source gates with RED self-tests, the two remaining prose corrections, and closing the todo</name>
  <files>src/backend/__tests__/tauriShellSource.test.ts, .planning/REQUIREMENTS.md, .planning/todos/pending/2026-09-25-windows-gamelib-registration-is-install-time-only.md, .planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md</files>
  <action>
**3a — new source gates.** Add a new `describe` to `src/backend/__tests__/tauriShellSource.test.ts`,
placed immediately after the existing `Phase 35 plan 07 main.rs OS deep-link registration (D-07/D-05)`
describe so the two sit together. Title it for what it pins, e.g.
`'quick-260925-uok Windows gamelib:// HKCU self-heal on launch'`.

Declare fresh local copies of the two helpers it needs (the file's convention is per-describe
re-declaration, not hoisting — see `extractBracedBlock` declared three times):
  - `nearestCfgAbove(source, token)`: split `loadMainRsCode(source)` on newlines, find the first line
    containing `token`, walk UPWARD returning the first trimmed line that `startsWith('#[cfg(')`,
    else `null`. This is `cfgGuardAboveRegisterAll` generalised over its token; say so in its doc
    comment, and say why walking upward is what makes it a real gate (it cannot be satisfied by a
    `#[cfg(windows)]` sitting anywhere else in the file).
  - `fnRegion(code, fnToken)`: copy the existing implementation at :2475 verbatim, including its doc
    comment's explanation of the `\nfn ` / `\n#[cfg` boundary.

Then the four required gates, **each immediately followed by a RED-proof self-test driving
`loadMainRsCode(syntheticSource)` against synthetic NON-CONFORMING source**, exactly as the existing
tests do:

  1. **The call site exists and is `#[cfg(windows)]`-gated.**
     `expect(nearestCfgAbove(undefined, 'repair_windows_gamelib_protocol_registration(&app.config()'))`
     — or whatever the real call-site token is — `.toBe('#[cfg(windows)]')`.
     RED self-test A: an UNGATED call site → `null`.
     RED self-test B: a call site gated on `#[cfg(target_os = "linux")]` → not `'#[cfg(windows)]'`.

  2. **The CI=e2e guard is on the repair path**, region-scoped, not merely somewhere in the file:
     `const region = fnRegion(loadMainRsCode(), 'fn repair_windows_gamelib_protocol_registration(')`
     `expect(region).not.toBeNull()`
     `expect(region).toContain('std::env::var("CI").as_deref() == Ok("e2e")')`
     RED self-test: a synthetic repair fn with no guard, with the guard string placed in a
     *different* function, fails the region gate. (This is the single most important test in the
     set — locked decision (c) — because this path writes to the real user registry.)

  3. **The repair path does not call `register_all()`**:
     `expect(region).not.toContain('register_all()')`.
     RED self-test: a synthetic repair fn that DOES call it fails.
     Also re-assert here, adjacent, that the whole-file occurrence count of `register_all()` in the
     comment-stripped source is still exactly 1 — the new describe is the natural place for a future
     reader to look, and the assertion is cheap.

  4. **Fail-open shape**: `for (const forbidden of ['.unwrap()', '.expect(', 'panic!', 'unreachable!'])
     expect(region).not.toContain(forbidden)`, plus a `?`-operator check. For `?`, do not use a bare
     substring (it appears inside `\\\\?\\` path-prefix literals and in URLs); match
     `/\?;\s*$/m` over the region instead, and say in a comment why the narrower pattern was chosen.
     RED self-test: a synthetic repair fn containing `.unwrap()` and a `foo()?;` line fails both.

  Add a doc comment above the describe explaining what these gates are and are NOT: they are SOURCE
  gates parsing `main.rs` text, in the same family as everything else in this file, and they prove
  the shape of the code, **not** that a live Windows registry repair works. Name the live gate that
  would prove that (task 3c's todo record) so the reader is not left thinking these are stronger
  than they are — this repo's standing rule about gates appearing to cover more than they do.

**3b — correct the two remaining prose sites** (locked decision (d)):

  - `src/backend/__tests__/tauriShellSource.test.ts:2268-2292`, the header doc comment of the
    deep-link describe. Item 3 currently reads that `register_all()` stays Linux-only because
    "Windows ... registers `gamelib://` at INSTALL time via the NSIS template instead". Rewrite item
    3 so it states the CURRENT story: Windows registers at install time via NSIS **and** self-heals
    at runtime through the narrower `repair_windows_gamelib_protocol_registration` path (pinned by
    the new describe below), which is why the broader `register_all()` widening is still not needed.
    Keep the structural-vs-substring rationale sentence intact — it is still correct and still
    load-bearing. Also update the REQ-46-06 note at :2387-2396, which currently presents "stay
    Linux-only" as resting purely on the AppImage-analogue argument; it now also rests on the
    self-heal path existing. Keep the override recipe accurate.

  - `.planning/REQUIREMENTS.md`. Decision point (a) at :2217-2221 says "The NSIS installer alone
    registers `gamelib://`" — that is now false and must be corrected: NSIS at install time, plus a
    runtime HKCU self-heal added by quick-260925-uok, with `register_all()` still not widened and
    still pinned. Also correct REQ-46-06's body at :2282-2287 the same way ("The main.rs comment
    block above it states that Windows registers at INSTALL time via NSIS, and why the runtime call
    is not needed" → the block now also describes the self-heal path). Do not change REQ-46-06's
    `[x]` status or its row in the table at :509 — the requirement is still satisfied; only its
    rationale moved.

**3c — close the todo** (locked decision (g)). Use `git mv` so history follows the file:

    git mv .planning/todos/pending/2026-09-25-windows-gamelib-registration-is-install-time-only.md \
           .planning/todos/completed/

Then append a `## Resolution` section to the moved file recording:
  - **Option 1 (self-heal on launch) was chosen** by operator decision; options 2 (warn-only) and 3
    (accept-and-document) were rejected.
  - The rationale: a warn-only path still leaves the user to hand-edit the registry, and accepting
    the risk was already shown insufficient by the 2026-09-25 incident, in which the failure occurred
    during this project's OWN re-gate session and left a dangling pointer rather than a
    stale-but-valid one.
  - What shipped: the pure helpers, the `#[cfg(windows)]` repair, its call site, the
    `Win32_System_Registry` feature, the source gates, and the three prose corrections.
  - Why it is narrower than `register_all()`, in one sentence.
  - **NOT DONE — what remains unverified, stated plainly.** This todo's own "Verification (once
    decided/fixed)" section describes a LIVE Windows gate: a session in which a second application
    overwrites `HKCU\Software\Classes\gamelib\shell\open\command` and GameLib's next external
    `gamelib://` open still reaches the running instance. **That gate has NOT been run.** This work
    was desk-side: `cargo test` and jest source gates only. Nothing here has observed a real
    registry read, a real registry write, or a real `gamelib://` open. The Rust unit tests cover the
    pure decision helpers on a non-Windows-specific code path; the `#[cfg(windows)]` FFI function
    itself is exercised by NOTHING — it follows the `acquire_single_instance` precedent stated at
    `main.rs:8409-8413` ("these functions are not unit-tested ... exercised by the live gate,
    REQ-46-10, not `cargo test`"). Do not read this todo's presence in `completed/` as evidence the
    repair works on a real machine. State the exact live-gate steps a future operator should run.
  - Note the `platform: windows` / `ready: human` frontmatter that is now moot, and leave the
    frontmatter block otherwise as-is.

Regarding `pnpm planning-gates`: CLAUDE.md's todo-triage-frontmatter gate
(`.planning/todos/todo-frontmatter-gate.py`) scopes to `pending/` **only** — `completed/` is
deliberately exempt. So moving the file removes it from that gate's census rather than subjecting it
to a new one, and no frontmatter change is required by the move. Run `pnpm planning-gates` anyway to
confirm the discovery count (`MINIMUM_EXPECTED_GATES = 13`) and every gate still pass.
  </action>
  <verify>
    <automated>npx jest src/backend/__tests__/tauriShellSource.test.ts 2>&1 | tail -40</automated>
    <automated>pnpm planning-gates 2>&1 | tail -20</automated>
    <automated>pnpm codecheck</automated>
    <automated>test -f .planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md && test ! -f .planning/todos/pending/2026-09-25-windows-gamelib-registration-is-install-time-only.md && grep -q "Resolution" .planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md && echo "OK: todo moved and resolved"</automated>
    <automated>grep -c "NSIS installer alone" .planning/REQUIREMENTS.md | grep -qx 0 && echo "OK: superseded REQUIREMENTS prose corrected"</automated>
    <automated>npx prettier --check src/backend/__tests__/tauriShellSource.test.ts .planning/REQUIREMENTS.md .planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md</automated>
  </verify>
  <done>
All four new gates pass against the real `main.rs`, and every one has a paired RED self-test that
fails against synthetic non-conforming source. The whole `tauriShellSource.test.ts` suite is green,
including the untouched REQ-46-06 pins. `pnpm planning-gates` and `pnpm codecheck` pass. The todo
lives in `completed/` with a `## Resolution` section that names option 1, its rationale, and states
explicitly that the live Windows gate has NOT been run. All three prose sites tell the new story.
`prettier --check` on every written path exits 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HKCU registry → GameLib process | The stored `shell\open\command` value is written by *whatever last claimed the scheme*, including a hostile or merely broken third-party installer. It is untrusted, unbounded-length third-party input that this code parses. |
| GameLib process → HKCU registry | The repair WRITES to the real user registry. A run that should not have written (a CI run, a test harness) permanently alters the host's protocol association. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UOK-01 | Information disclosure | repair logging | mitigate | Never log the stored command value verbatim (it is attacker-controlled and may carry a path or payload); log the subkey path plus a coarse classification (`absent` / `unparseable` / `points-elsewhere`) only. Same discipline as T-34.5-G6-25 on the deep-link path. Task 2 step 6. |
| T-UOK-02 | Tampering | HKCU write during an automated run | mitigate | `std::env::var("CI").as_deref() == Ok("e2e")` returns BEFORE any registry call. Pinned by a region-scoped source gate with a RED self-test (task 3a gate 2). |
| T-UOK-03 | Denial of service | startup abort on registry failure | mitigate | Fail open (T-34.5-G6-24): no `unwrap()` / `expect(` / `panic!` / `?` on the repair path; every failure logs and returns. Pinned by task 3a gate 4. |
| T-UOK-04 | Tampering | parsing a malformed/hostile command string | mitigate | `gamelib_protocol_command_exe` is a pure, unit-tested parser with explicit cases for empty, whitespace-only, unterminated-quote and empty-quoted-path inputs; anything it cannot parse yields `None`, which routes to "repair needed" rather than to a crash. Task 1. |
| T-UOK-05 | Elevation of privilege | writing outside HKCU | accept | The repair touches `HKEY_CURRENT_USER\Software\Classes\gamelib` and its three child paths only, with no `HKLM` access and no elevation. This matches the installer's own `currentUser` install mode (F1), so the repair can never grant itself reach the installer did not already have. |
| T-UOK-06 | Repudiation | a silent rewrite the user did not ask for | accept | The rewrite is logged through `shell_diag`, which has a file sink surviving a bundled app's discarded stderr. Last-launch-wins on a multi-install machine is documented in the decision-point block (task 2d) rather than silently absorbed. |
| T-UOK-SC | Tampering | supply chain | mitigate | No new package is installed in any ecosystem. The only dependency change is enabling one additional feature (`Win32_System_Registry`) on the already-declared, already-resolved `windows-sys` 0.60. No new crate name enters `Cargo.lock`, verified by re-running `cargoFeatures.test.ts` (task 2 verify). No npm/pip/cargo install task exists in this plan, so the package-legitimacy checkpoint protocol does not apply. |
</threat_model>

<verification>
Run from the repository root after all three tasks:

1. `cd src-tauri && cargo check --bin gamelib-shell` — exit 0. This is the only proof the
   `#[cfg(windows)]` arm compiles at all, and it is only obtainable because the executing host is
   Windows.
2. `cd src-tauri && cargo test --bin gamelib-shell` — 0 failed, total strictly greater than the
   234-test baseline in `rust-test.yml`.
3. `npx jest src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/cargoFeatures.test.ts src/backend/__tests__/windowsDeepLinkSuppression.test.ts` — all green.
4. `pnpm codecheck` — exit 0.
5. `pnpm planning-gates` — exit 0.
6. `npx prettier --check src-tauri/src/main.rs src-tauri/Cargo.toml src/backend/__tests__/tauriShellSource.test.ts .planning/REQUIREMENTS.md .planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md` — exit 0.
7. Do NOT run `cargo fmt` or `cargo fmt --check` (F4: already red repo-wide, would reformat
   thousands of unrelated lines).

**What this verification does NOT establish, stated plainly.** No step above reads or writes a real
registry key, and no step opens a real `gamelib://` URL. The `#[cfg(windows)]` FFI function is
compiled but never executed by any test, following the `acquire_single_instance` precedent stated at
`main.rs:8409-8413`. The live Windows gate — hijack the key from a second application, then confirm
an external `gamelib://` open still reaches the running instance — remains undischarged and must be
recorded as such in the completed todo (task 3c).
</verification>

<success_criteria>
- A Windows launch with a missing, dangling or foreign `HKCU\Software\Classes\gamelib\shell\open\command`
  rewrites all four installer-shaped values to point at the running executable; a launch with a
  matching value writes nothing.
- `CI=e2e` short-circuits before the first registry call, pinned by a region-scoped source gate.
- No `unwrap()` / `expect(` / `panic!` / `?` on the repair path, pinned by a source gate.
- `register_all()` still has exactly one call site, still under `#[cfg(target_os = "linux")]`;
  `cfgGuardAboveRegisterAll()` and both REQ-46-06 pin tests unchanged and green.
- Exactly one new `windows-sys` feature, with an inline comment naming its symbols and a paragraph
  recording where they were confirmed and why `winreg`/`windows-registry` were not used.
- Four new source gates, each with a RED-proof self-test.
- `main.rs`'s decision-point (a) block, `tauriShellSource.test.ts`'s header + REQ-46-06 note, and
  `.planning/REQUIREMENTS.md`'s decision point (a) + REQ-46-06 body all tell the new story.
- The todo is in `completed/` with a `## Resolution` that names option 1 and states that the live
  Windows gate has not been run.
</success_criteria>

<output>
Create `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-SUMMARY.md` when done.
</output>
