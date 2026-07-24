---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
reviewed: 2026-07-24T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - .github/workflows/release-tauri.yml
  - src-tauri/src/main.rs
  - src-tauri/tauri.conf.json
  - src-tauri/capabilities/default.json
  - src-tauri/Cargo.toml
  - meta/buildSidecarSea.ts
  - meta/sidecarSeaFsShim.ts
  - package.json
  - src/backend/__tests__/tauriConf.test.ts
  - src/backend/__tests__/releaseWorkflow.test.ts
  - src/backend/__tests__/cargoFeatures.test.ts
  - meta/__tests__/buildSidecarSea.test.ts
findings:
  critical: 2
  warning: 4
  info: 1
  total: 7
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-07-24
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the Tauri packaging pipeline: the release CI matrix, the Node sidecar SEA compile
script + its `fs.readFileSync` shim, the Rust shell's sidecar spawn/lifecycle path, and the
Tauri config/capabilities/Cargo manifest. The graceful-skip-signing (D-04), draft+prerelease
(D-09), and fork-pointed-updater-feed (T-34-01) invariants called out in the task are all
correctly implemented and test-covered. The capability scoping for `shell:allow-execute` is
correctly narrow (sidecar-only, matches the task's explicit ask).

Two BLOCKER-level defects were found that will break the release pipeline for real users on
two of the four CI matrix legs: (1) the SEA sidecar-binary build script derives its output
filename/architecture from the CI **runner's** native arch, not from the Tauri `--target` the
matrix leg is actually cross-compiling for, which silently mislabels/miscompiles the sidecar
for the `x86_64-apple-darwin` macOS leg; and (2) the committed icon set has no Windows `.ico`
despite `nsis` being an active bundle target. Four warnings and one info item round out the
rest — mostly gaps between a documented security/lifecycle invariant and what the code actually
does (dev-sidecar env override not gated to debug builds, cert.pfx persisted to disk despite an
"in-memory only" claim, no sidecar-process cleanup on app exit, and a pre-existing null CSP that
is now more exposed given this phase makes the shell actually shippable).

## Critical Issues

### CR-01: macOS x86_64 SEA sidecar is built for the wrong architecture/triple on Apple-Silicon CI runners

**File:** `meta/buildSidecarSea.ts:189-200` (`hostTriple()`), consumed at `meta/buildSidecarSea.ts:351`
**Also:** `.github/workflows/release-tauri.yml:34-38` (macOS matrix legs), `:81-82` (`pnpm build:sidecar-sea` step, unconditional, no target/triple input)

**Issue:** `hostTriple()` derives the sidecar's output triple purely from the machine that is
*running the build script* (`process.platform`/`process.arch`), not from the Tauri `--target`
flag the matrix leg is building for:

```ts
function hostTriple(): string {
  if (process.platform === 'win32') {
    return 'x86_64-pc-windows-msvc'
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? 'aarch64-apple-darwin'
      : 'x86_64-apple-darwin'
  }
  return 'x86_64-unknown-linux-gnu'
}
```

`release-tauri.yml`'s matrix has two `macos-latest` legs: one building `--target
aarch64-apple-darwin`, the other `--target x86_64-apple-darwin`. GitHub's `macos-latest` runners
are Apple-Silicon-native (arm64) — `34-RESEARCH.md` line ~366 even calls this out explicitly as
"a cross-arch build". So on **both** macOS legs, `process.arch === 'arm64'` inside the Node
process executing `buildSidecarSea.ts`, meaning `hostTriple()` **always returns
`'aarch64-apple-darwin'`**, regardless of which `--target` the matrix leg is actually building
for. `copyNodeBinary()` also just copies `process.execPath` — the arm64 Node binary running the
script — so even the underlying binary bytes are wrong for an x86_64 build, not just the label.

Concretely, on the `--target x86_64-apple-darwin` leg:
- `pnpm build:sidecar-sea` writes `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`.
- `tauri build --target x86_64-apple-darwin` (via tauri-action) looks for the externalBin
  resolved to `binaries/gamelib-sidecar-x86_64-apple-darwin`, which was never produced.
- That leg's bundling step fails to resolve the sidecar externalBin (build failure), OR — if the
  naming happened to coincidentally line up in some other invocation shape — an arm64 sidecar
  binary would ship inside an x86_64 app bundle and crash at runtime on Intel Macs.

`hostTriple()` is not exported/tested (`meta/__tests__/buildSidecarSea.test.ts` only tests
`sidecarOutputPath`, `buildSeaConfigPath`, `buildPostjectArgv`, `buildCodesignArgv` — never
`hostTriple`), so nothing catches this. No planning doc (34-RESEARCH.md, 34-06-SUMMARY.md) shows
this being resolved; the RESEARCH doc flags the cross-arch *risk* but the shipped
implementation has no mechanism to build for a non-host target at all.

**Fix:** Derive the triple from the actual Cargo/Tauri target being built, not from
`process.arch`. E.g. read a `CARGO_BUILD_TARGET`/`TAURI_TARGET_TRIPLE` env var set explicitly by
the workflow step for that leg (`--target ${{ matrix.rust_target }}` extracted from `matrix.args`),
and fall back to `hostTriple()` only when unset (native builds / `tauri dev`):

```ts
function resolveTriple(): string {
  const override = process.env.GAMELIB_SIDECAR_TARGET_TRIPLE
  if (override) return override
  return hostTriple()
}
```

```yaml
      - name: Build self-contained sidecar (Node SEA)
        env:
          GAMELIB_SIDECAR_TARGET_TRIPLE: ${{ startsWith(matrix.platform, 'macos') && (contains(matrix.args, 'aarch64') && 'aarch64-apple-darwin' || 'x86_64-apple-darwin') || '' }}
        run: pnpm build:sidecar-sea
```

Producing a genuinely native x86_64 binary from an arm64 runner additionally requires either a
cross-compiled Node binary for that triple (not just relabeling `process.execPath`) or running
that leg under Rosetta — this needs to be resolved as part of the fix, not just the naming.

---

### CR-02: No Windows `.ico` icon committed despite `nsis` being an active bundle target

**File:** `src-tauri/tauri.conf.json:27-34`
**Evidence:** `src-tauri/icons/` contains `32x32.png`, `64x64.png`, `128x128.png`,
`128x128@2x.png`, `icon.icns`, `icon.png` — no `icon.ico`, and `tauri.conf.json`'s `bundle.icon`
array does not reference one either:

```json
    "targets": ["nsis", "appimage", "dmg"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.png"
    ],
```

**Issue:** `nsis` (Windows) is an active bundle target, but Tauri's bundler needs an `.ico` icon
to produce the Windows installer/executable icon; the plan itself (`34-05-PLAN.md`) explicitly
anticipated this ("if any required icon is missing, regenerate from `public/icon.png` via `pnpm
tauri icon public/icon.png`") but no `.ico` was ever generated/committed — every other
platform's asset (`.icns` for macOS, PNGs for Linux/general) is present, only the Windows one is
missing, which is consistent with `tauri icon` having been run on a macOS dev machine without
producing (or without committing) the Windows output. This will surface on the `windows-latest`
CI leg as either a hard bundling failure or, at minimum, a shipped Windows installer/exe with a
missing or default fallback icon — a release-blocking defect for the Windows leg either way.

**Fix:** Generate and commit `src-tauri/icons/icon.ico` (e.g. `pnpm tauri icon
public/icon.png`, or verify the existing icon-generation pipeline the Electron build already
uses via `@shockpkg/icon-encoder`) and add it to `bundle.icon` in `tauri.conf.json`. Add it to
`tauriConf.test.ts`'s shape assertions so a future icon-set regression is caught by the existing
Wave-0 test file rather than only discovered on a live Windows CI run.

## Warnings

### WR-01: `GAMELIB_SIDECAR_ENTRY` dev override is honored even in release builds, contradicting the file's own D-06 comment

**File:** `src-tauri/src/main.rs:538-544`

**Issue:** The doc comment states an absolute invariant: "A release build always resolves the
bundled sidecar via `tauri-plugin-shell` — never a system `node` (D-06)." But the actual gate is:

```rust
fn use_dev_sidecar() -> bool {
    std::env::var("GAMELIB_SIDECAR_ENTRY").is_ok() || cfg!(debug_assertions)
}
```

`std::env::var("GAMELIB_SIDECAR_ENTRY").is_ok()` is checked unconditionally, with no
`cfg!(debug_assertions)` guard around it. If this env var is ever present in a **release**
build's process environment (e.g. accidentally inherited from a CI/test harness, a leftover
shell profile export, or set deliberately by a local actor with shell access), `spawn_sidecar()`
takes the `spawn_sidecar_dev()` path and runs `Command::new("node").arg(&entry)` — spawning an
arbitrary system `node` against whatever path the env var names — instead of the verified,
packaged `externalBin`. This is a narrow attack surface (requires the ability to set the
packaged app's environment) but it directly contradicts the stated release-build guarantee, and
there's no test asserting this invariant.

**Fix:** Gate the env-var override to debug builds only, matching the stated invariant:

```rust
fn use_dev_sidecar() -> bool {
    cfg!(debug_assertions) && std::env::var("GAMELIB_SIDECAR_ENTRY").is_ok() || cfg!(debug_assertions)
}
```
(i.e. `cfg!(debug_assertions)` alone is sufficient/correct — drop the release-reachable branch of
the `env::var` check, or explicitly `#[cfg(debug_assertions)]`-gate the whole function body.)

### WR-02: Windows signing `cert.pfx` is written to disk and never deleted, contradicting the "in-memory only" security claim

**File:** `.github/workflows/release-tauri.yml:101-108`

**Issue:** The file header and the phase's own threat model claim the Windows cert is handled
"ONLY in-memory (never written to a cached/persisted artifact, T-34-05)". The actual step:

```yaml
      - name: Import Windows signing certificate (if present)
        ...
        run: |
          $bytes = [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE)
          Set-Content -Path cert.pfx -Value $bytes -AsByteStream
          $securePw = ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
          Import-PfxCertificate -FilePath cert.pfx -CertStoreLocation Cert:\CurrentUser\My -Password $securePw
```

writes the decoded certificate to `cert.pfx` on disk in the checkout working directory and never
removes it. In practice the GitHub-hosted runner VM is destroyed after the job, so the exposure
window is bounded and there is currently no `actions/upload-artifact`/cache step that would leak
it — but the file itself, and the doc claim that nothing is "written to a cached/persisted
artifact", is factually inaccurate as written, and any future step added to this job (cache,
artifact upload, debug-tmate session, etc.) would then risk exposing it.

**Fix:** Delete the file immediately after import:

```yaml
          Import-PfxCertificate -FilePath cert.pfx -CertStoreLocation Cert:\CurrentUser\My -Password $securePw
          Remove-Item -Path cert.pfx -Force
```

and correct the header comment to describe the actual (write-then-delete) handling rather than
claiming "in-memory only".

### WR-03: Sidecar child process has no explicit termination on app exit — potential orphaned background process

**File:** `src-tauri/src/main.rs:117-125` (`SidecarState._child`), `:790-848` (`main()`, no `RunEvent`/exit handler)

**Issue:** The sidecar `Child` handle is held only to prevent premature reaping while the app is
running (per its own comment: "Kept alive so the child is not reaped; the shell owns the
sidecar's lifetime"). There is no `.run(|app_handle, event| ...)` closure, no
`RunEvent::ExitRequested`/`WindowEvent::CloseRequested` handler, and no `Drop` impl that kills
the child process. `app_exit`/`app_relaunch` (`dispatch_rust_channel`, lines ~471-486) call
`AppHandle::exit()`/`AppHandle::restart()` directly and only two specific in-app call sites
reach those — normal window-close (red X / Cmd+Q / Alt+F4) does not route through them at all.
Whether the OS reliably terminates the piped-stdio child when the parent process exits is
platform- and terminal/session-dependent and is not something this code enforces. If the sidecar
process survives the window closing, it can linger as an orphaned background process (holding an
authenticated Steam session, network sockets, file handles) after the user believes they have
quit the app — and would also block a subsequent app launch if the sidecar takes an exclusive
resource (e.g. a lock file) that hasn't been documented as safe to double-acquire.

**Fix:** Register a `RunEvent`/`WindowEvent::CloseRequested` handler (or a `Drop` impl on
`SidecarState`) that explicitly calls `Child::kill()` (or sends the sidecar a graceful-shutdown
RPC frame first, then kills on timeout) before the process exits.

### WR-04: `security.csp: null` combined with `withGlobalTauri: true` and broad `opener:default` leaves the webview with no CSP hardening (pre-existing, but now more exposed)

**File:** `src-tauri/tauri.conf.json:21-24`, `src-tauri/capabilities/default.json:8`

**Issue:** `"csp": null` disables Content-Security-Policy entirely for the webview. Combined
with `withGlobalTauri: true` (full `window.__TAURI__` API surface injected into every page) and
the `opener:default` capability grant (lets renderer JS call `plugin:opener` commands, including
opening arbitrary URLs, directly — not only through the app's own `open_external` command), any
future renderer-side XSS (e.g. via unsanitized store/game metadata rendered from
network-supplied data) would have materially higher impact than it would under even a baseline
CSP. This was introduced in Phase 27 (commit `83dc57a7`), not this phase, but this phase is what
flips `bundle.active: true` and ships the shell to real users on three platforms for the first
time — a reasonable point to close this gap before a public release.

**Fix:** Define a real CSP (e.g. `default-src 'self'; img-src 'self' data: https:; connect-src
'self' https:`) tuned to the renderer's actual needs, and reassess whether `opener:default`'s
full command set is needed by renderer JS directly or whether it can be narrowed the same way
`shell:allow-execute` was scoped down to only the sidecar in this phase.

## Info

### IN-01: `sidecarSeaFsShim.ts`'s system.pem path match is looser than necessary

**File:** `meta/sidecarSeaFsShim.ts:46-48`

**Issue:** `isSteamSystemPemPath` matches any path ending in `system.pem`:

```ts
function isSteamSystemPemPath(path: unknown): boolean {
  return typeof path === 'string' && path.endsWith('system.pem')
}
```

This is scoped to the SEA build step (a controlled, trusted build-time context, not
attacker-reachable input), so the practical risk is low, but it is broader than the documented
intent ("`@doctormckay/steam-crypto`'s bundled Steam 'system' public key"). If any other bundled
module ever reads a same-named file at a different path, this shim would silently substitute the
wrong bytes instead of passing the real read through.

**Fix:** Match against a more specific suffix, e.g.
`path.includes('@doctormckay/steam-crypto') && path.endsWith('system.pem')` (or the exact
resolved path if it's stable across esbuild bundling), to avoid an unintended match.

---

_Reviewed: 2026-07-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
