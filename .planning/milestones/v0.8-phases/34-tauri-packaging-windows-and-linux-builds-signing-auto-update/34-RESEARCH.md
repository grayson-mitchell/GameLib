# Phase 34: Tauri packaging — Windows and Linux builds, signing, auto-update - Research

**Researched:** 2026-07-24
**Domain:** Tauri v2 bundling/CI release pipeline, Node single-executable sidecar compilation, code-signing/notarization plumbing, minisign-based auto-update
**Confidence:** MEDIUM-HIGH (config/CLI surface HIGH — verified against official Tauri v2 docs and npm/crates.io registries; sidecar single-binary compilation MEDIUM — one load-bearing claim about macOS x64 SEA support-tier could not be independently hardware-verified this session)

## Summary

Phase 34 turns the macOS-only Tauri dev shell (`bundle.active: false`, no updater plugin, sidecar spawned via a bare `Command::new("node")` that assumes a system Node install) into a real three-platform release pipeline. The work has four independent-but-sequenced parts: (1) compile the Node sidecar into a self-contained per-OS executable using Node's built-in **Single Executable Applications (SEA)** feature so no user needs Node installed; (2) add the **Tauri v2 updater plugin** (`tauri-plugin-updater` / `@tauri-apps/plugin-updater`, both at 2.10.1) with a minisign keypair, public key committed to `tauri.conf.json`, private key + password as GitHub secrets; (3) build a **GitHub Actions matrix** (`windows-latest` + `ubuntu-latest` + `macos-latest`) using the official `tauri-apps/tauri-action`, which builds, optionally signs (via env-var presence), generates `latest.json`, and creates a draft prerelease on a `v*` tag push; (4) wire signing/notarization so it reads secrets and **gracefully no-ops** when they're absent — this is trivial for macOS (Tauri's bundler already treats `APPLE_CERTIFICATE` env-var absence as "skip codesign") but requires an explicit CI conditional for Windows, because Windows signing config (`certificateThumbprint`) is a static `tauri.conf.json` field, not an env-var gate.

A critical cross-cutting finding not called out in the phase context: the `keyring` crate in `src-tauri/Cargo.toml` currently only enables the `apple-native` feature (Phase 28 shipped macOS-only real `safeStorage`). Shipping Windows and Linux builds under D-01 without also adding the `windows-native` and `sync-secret-service` Cargo features will silently break the OS-keychain-backed Steam token storage on those two platforms — this belongs in Phase 34's task list even though it wasn't named in `34-CONTEXT.md`.

The existing sidecar has essentially zero native-addon exposure (verified: `lzma` is pure JS, `zstddec`'s WASM is base64-inlined in the bundled JS, `steam-user`/`steam-session` have no `.node` binaries) — this makes it an unusually favorable candidate for single-executable compilation. The one real risk is the `decompressPool.ts` `worker_threads` spawn (`new Worker(path.join(__dirname, 'decompressWorker.js'))`), which will fail to find that file once the sidecar is compiled to a single binary; the code **already has a graceful inline fallback** for this exact failure mode (proven by reading `spawnWorker`'s catch block), so correctness is not at risk — only decode throughput, which should be flagged as an accepted, documented regression rather than a blocker.

**Primary recommendation:** Node SEA (legacy 2-step `--experimental-sea-config` + `postject`, NOT the newer one-step `--build-sea` flag, which requires Node 25.5.0+ and this project targets Node ≥22 LTS) for the sidecar; `tauri-plugin-updater` 2.10.1 + minisign for the update feed; `tauri-apps/tauri-action` in a 3-OS GitHub Actions matrix triggered on `v*` tags with `releaseDraft: true` / `prerelease: true`; env-var-gated signing for macOS (native Tauri behavior) and an explicit CI-conditional `--config` override for Windows (no native "absent secret" gate exists for that platform).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| App bundling (NSIS/AppImage/dmg) | Tauri bundler (Rust CLI) | CI runner (per-OS) | Tauri cannot cross-compile bundle formats; each OS's installer must be built on that OS |
| Sidecar compilation (Node SEA) | Build tooling (Node, per-OS) | Tauri `externalBin` | SEA must be built on the target OS/arch; Tauri only consumes the resulting binary as a resource |
| Code signing / notarization | CI pipeline (env-var-gated) | Tauri bundler (invokes signtool/codesign) | Signing is a build-time step the bundler triggers conditionally; secrets never live in app code |
| Auto-update feed (`latest.json`) | GitHub Releases (static hosting) | Tauri updater plugin (Rust + JS) | No self-hosted server (D-07); GitHub Releases is a passive artifact host, the plugin does all trust/verification logic client-side |
| Update signature verification | Tauri updater plugin (Rust, minisign) | — | Verification must happen before install; minisign keypair is the sole trust anchor |
| Release trigger / draft gating | GitHub Actions (`tauri-action`) | Human (manual publish) | D-09: CI never auto-publishes; a human always reviews artifacts first |
| OS keychain token storage | Rust shell (`keyring` crate) | Sidecar (`rustInvoke` relay, unchanged from Phase 28) | Cross-platform credential storage is inherently OS-native — must be compiled in per-target-OS via Cargo features, not something the sidecar or JS layer can substitute |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

- **D-01:** Ship a real installable build for **all three platforms** (Windows + Linux + macOS) by end of this phase — productionize macOS too (`.dmg`, flip `bundle.active` to `true`), so Phase 35 (Electron cutover) inherits all three shipping on Tauri per its stated dependency. No macOS packaging gap left dangling.
- **D-02:** Bundle formats are **Claude's discretion**, defaulting to the lean, updater-friendly set: **Windows NSIS**, **Linux AppImage**, **macOS `.dmg`**. During research, evaluate whether adding Linux `.deb`/`.rpm` is cheap; if included, note they do NOT auto-update via the Tauri feed (would need apt/dnf repos — out of scope), so they are a manual/native-install convenience only.
- **D-03:** **Plumbing now, certs later.** Wire signing + notarization into the build config reading credentials from env vars / GitHub Actions secrets, but ship **unsigned** for 0.x. Zero cost, no identity enrollment; real signing activates later by dropping secrets in.
- **D-04:** When signing secrets are **absent** (the normal case now), the build **gracefully skips** signing/notarization, **logs a clear warning**, and still produces a working unsigned artifact. CI must **never fail** on missing certs. (Not ad-hoc/self-signed; not fail-loud.)
- **D-05:** Build via a **GitHub Actions matrix** — `windows-latest` + `ubuntu-latest` + `macos-latest` runners (Tauri cannot cross-compile; the dev only has a Mac locally, so CI is the only way to produce Windows/Linux at all). Free for public repos. Prefer `tauri-action` for bundle + (conditional) sign + draft-release in one step.
- **D-06:** The **Node sidecar is compiled into a single self-contained executable per OS** (Node SEA / `pkg` / `bun compile` — pick during research based on what the Phase 27 sidecar already does) and shipped as a Tauri `externalBin`/sidecar. **No external Node install** on the user's machine; clean auto-update story.
- **D-07:** Feed is a static **`latest.json` on GitHub Releases** of `grayson-mitchell/GameLib` (generated by `tauri-action`), polled by the Tauri updater plugin. Same host as the already-repointed Electron feed (quick task `260720-q5n`). No self-hosted server.
- **D-08:** Generate the **Tauri updater minisign keypair this phase** (this is separate from OS code signing and is free / no identity enrollment). Commit the **public key** into `tauri.conf.json`; store the **private key + password** as GitHub Actions secrets. Auto-update cannot function without this, so it is NOT deferred.
- **D-09:** **Release trigger:** pushing a version tag (e.g. `v0.8.0`) runs CI, which builds all platforms and creates a **DRAFT GitHub Release marked prerelease**. Human reviews artifacts, then publishes manually. Draft ⇒ the updater can't see it until published; the prerelease flag keeps it off GitHub "Latest" — directly avoids the Phase 19 "prerelease-not-Latest" pitfall where a 0.x prerelease got marked Latest and pushed to everyone.

### Claude's Discretion

- Exact Linux format set beyond AppImage (D-02) — recommend during research.
- Sidecar single-binary compilation tool (D-06) — pick the lightest path that yields a working install with no external Node dependency, informed by the Phase 27 sidecar.
- Whether to also add a `workflow_dispatch` manual trigger alongside the tag trigger (D-09) for test builds — nice-to-have.

### Deferred Ideas (OUT OF SCOPE)

- **Paid code-signing certs** (Apple Developer Program $99/yr + Developer ID notarization; Windows Authenticode ~$200+/yr or Azure Trusted Signing) — plumbing lands now, activation deferred past 0.x.
- **Linux `.deb`/`.rpm` auto-update repos** (apt/dnf) — even if `.deb`/`.rpm` artifacts are built, serving updates for them is out of scope; the Tauri updater covers NSIS/AppImage/`.dmg` only.
- **Electron removal** — Phase 35 (cutover), intentionally breaks the additive/reversible invariant.
- **App identifier/version bump considerations** (e.g. `0.7.0` → `0.8.0`, `com.gamelib.shell`) — flag for planning to confirm; not a blocking discussion item.

</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs exist yet for Phase 34 (`REQUIREMENTS.md` has no `REQ-34-*` entries; ROADMAP.md's Phase 34 row reads "Requirements: TBD — mint at `/gsd-plan-phase 34`"). Based on the locked decisions above and the research below, natural requirement boundaries for the planner to mint are:

| Suggested boundary | Maps to decisions | Research support |
|---|---|---|
| macOS productionization (`bundle.active: true`, `.dmg` target, icon set, additive-invariant re-check) | D-01 | "macOS productionization" section below; SEAM.md additive/reversible invariant; existing `dist:mac`/`release:mac` Electron scripts as icon/entitlements precedent |
| Windows + Linux bundle targets (NSIS, AppImage, optional `.deb`/`.rpm`) | D-01, D-02 | "Bundle formats" section; `tauri.conf.json` `bundle.targets` |
| Sidecar single-binary compilation (per-OS SEA build + `externalBin` wiring + `main.rs` spawn-path fix) | D-06 | "Sidecar compilation" section, Pitfalls 1–3 |
| Signing/notarization plumbing with graceful skip | D-03, D-04 | "Signing & notarization" section, Pitfall 4 |
| Updater plugin + minisign keypair + capability permission | D-07, D-08 | "Auto-update" section, Code Examples |
| CI release workflow (matrix, tauri-action, draft+prerelease, tag trigger) | D-05, D-09 | "CI pipeline" section, Code Examples |
| `keyring` crate cross-platform feature flags (NOT explicitly named in CONTEXT.md — surfaced by this research) | (implied by D-01) | "Cross-platform keyring feature gap" Pitfall — blocks real safeStorage on Win/Linux otherwise |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tauri-apps/plugin-updater` | 2.10.1 [VERIFIED: npm registry, matches `tauri-plugin-updater` crate version] | JS API for the auto-update flow (`check()`, `downloadAndInstall()`) | Official first-party Tauri v2 plugin — the only supported auto-update mechanism |
| `tauri-plugin-updater` (Rust crate) | 2.10.1 [VERIFIED: cargo search / crates.io, matches JS package version] | Rust-side updater: signature verification (minisign), download, install | Official first-party plugin; required companion to the JS API |
| `@tauri-apps/plugin-shell` | 2.3.5 [VERIFIED: npm registry] | JS-side `Command.sidecar()` invocation, if the frontend/Rust needs to (re)spawn the sidecar with the officially-supported path-resolution helper | Official plugin; resolves the correct per-platform `externalBin` binary path automatically (dev vs bundled differ) |
| `tauri-plugin-shell` (Rust crate) | 2.3.5 [VERIFIED: cargo search / crates.io] | Rust-side sidecar spawn/execute primitives (`app.shell().sidecar(name)`) | Official plugin; the currently hand-rolled `Command::new("node")` in `main.rs` needs this (or an equivalent manual path-resolution) once the sidecar becomes a packaged `externalBin` |
| `@tauri-apps/cli` | 2.11.4 (already a devDependency) | `tauri signer generate` (minisign keypair), `tauri build`, `tauri icon` | Official CLI, already installed |
| `postject` | latest [VERIFIED: npm registry; slopcheck OK] | Injects the Node SEA blob into a copied `node` binary (legacy 2-step SEA workflow) | Official Node.js team tool, referenced directly by nodejs.org's own SEA documentation — not a third-party or community substitute |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tauri-apps/tauri-action` (GitHub Action, not an npm package) | `@v1` [CITED: official Tauri CI docs example workflow] | One-step build + conditional-sign + draft-release + `latest.json` generation per matrix leg | Every CI leg (Windows/Linux/macOS) in the release workflow |
| `dtolnay/rust-toolchain@stable` (GitHub Action) | — | Installs Rust toolchain on the CI runner before `tauri-action` builds | Every CI leg — GitHub-hosted runners do not guarantee a fresh/matching Rust toolchain out of the box |
| `swatinem/rust-cache@v2` (GitHub Action) | — | Caches `~/.cargo` + `src-tauri/target` across CI runs | Recommended in the official workflow; cuts multi-minute Rust rebuild time per run |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node SEA (sidecar compilation) | `@yao-pkg/pkg` (community-maintained fork of the deprecated Vercel `pkg`) | More mature handling of multi-entry-point bundling and some native-module scenarios, but it's a third-party tool with its own release cadence, vs. SEA being a first-party Node.js feature already matching this project's `engines.node >= 22` constraint. Recommended as the **fallback** if SEA's `worker_threads`/macOS-x64 risk (Pitfall 1/2 below) proves unworkable in practice. |
| Node SEA | `bun compile` | Bun's compile can cross-compile target platforms from one host and produces a genuinely single-file binary with no `postject` dance, but it means running the sidecar under the Bun runtime instead of Node — a bigger behavioral-parity risk for a codebase whose test suite (jest/ts-jest), tooling (esbuild targeting `node22`), and `steam-user`'s `protobufjs`/`bytebuffer` dependency chain have only ever been exercised under Node. Not recommended without a dedicated compatibility spike. |
| `--build-sea` one-step Node flag | Legacy 2-step `--experimental-sea-config` + `postject` | `--build-sea` only shipped in Node **v25.5.0** (Jan 2026, non-LTS "Current" release line) [VERIFIED: nodejs.org v25.5.0 release notes / official SEA docs]. This project's `package.json` `engines.node` is `>=22`, and the current LTS line is v24.x — CI's `actions/setup-node` with `node-version-file: package.json` will resolve to a `>=22` LTS release, NOT v25.5+. The 2-step legacy workflow has been stable since Node 20 and works on the LTS version this project already targets. |
| Windows `.msi` (WiX) target | NSIS only | NSIS is Tauri's lighter-weight default and is what `tauri-action`'s `updaterJsonPreferNsis` input is built around; WiX/MSI adds enterprise-deployment friability (Group Policy install) not needed for a 0.x hobbyist launcher. Skip for now. |

**Installation:**
```bash
# JS-side plugins
pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-shell
pnpm add -D postject

# Rust-side plugins (from src-tauri/)
cd src-tauri
cargo add tauri-plugin-updater
cargo add tauri-plugin-shell

# keyring crate: ADD Windows + Linux features to the EXISTING dependency line
# (do not bump the major version — Cargo.toml already pins "version = 3" and
#  Cargo.lock resolves 3.6.3; a "keyring 4.x" now exists on crates.io but is
#  an unrelated, unverified upgrade path, not part of this phase's scope)
# Edit src-tauri/Cargo.toml:
#   keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
```

**Version verification:** All npm packages above confirmed live via `npm view <pkg> version`; both Rust crates confirmed live via `cargo search <crate>` (crates.io's own HTTP API blocked ad hoc scripted requests during this research session with a data-access-policy 403 — `cargo search`, which crates.io permits, was used instead and returned matching results for both plugins).

## Package Legitimacy Audit

| Package | Registry | Age/Downloads (as surfaced by slopcheck) | Source Repo | slopcheck | Disposition |
|---------|----------|-------------------------------------------|--------------|-----------|-------------|
| `@tauri-apps/plugin-updater` | npm | established, official Tauri org package | github.com/tauri-apps/plugins-workspace | `[OK]` | Approved |
| `@tauri-apps/plugin-shell` | npm | established, official Tauri org package | github.com/tauri-apps/plugins-workspace | `[OK]` | Approved |
| `postject` | npm | established, official Node.js org tooling | github.com/nodejs/postject | `[OK]` | Approved |
| `tauri-plugin-updater` | crates.io | established, official Tauri org crate | github.com/tauri-apps/plugins-workspace | `[OK]` | Approved |
| `tauri-plugin-shell` | crates.io | established, official Tauri org crate | github.com/tauri-apps/plugins-workspace | `[OK]` | Approved |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

All five new packages were verified live via `slopcheck install` (npm ecosystem) and `slopcheck install --ecosystem crates.io` (Rust ecosystem) during this research session — every package resolved `[OK]`. Note: running `slopcheck install` performs a REAL install as a side effect; this session's runs against `package.json` were reverted via `git checkout -- package.json` + `pnpm install --frozen-lockfile` immediately after, and the `src-tauri` crate check failed to find a `Cargo.toml` (run from the wrong directory) so it made no changes there. **The planner/executor must re-run these installs for real** — this research only proved the packages are legitimate, it did not leave them installed.

Package-name provenance: `@tauri-apps/plugin-updater`, `tauri-plugin-updater`, `@tauri-apps/plugin-shell`, and `tauri-plugin-shell` were discovered via official Tauri v2 documentation (`v2.tauri.app`), not training-data guesswork — combined with the slopcheck `[OK]` verdict and matching version numbers across the JS/Rust pairs, these are tagged `[VERIFIED]` above. `postject` was discovered via the official nodejs.org SEA documentation page itself (it is literally the tool that page instructs you to run) — also `[VERIFIED]`.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │         GitHub Actions (per tag push)     │
                    │  matrix: windows-latest / ubuntu-latest /  │
                    │           macos-latest                     │
                    └───────────────┬─────────────────────────┘
                                    │ (each leg, independently)
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
 ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
 │ 1. Build     │             │ 1. Build     │             │ 1. Build     │
 │ sidecar SEA  │             │ sidecar SEA  │             │ sidecar SEA  │
 │ (node exe +  │             │ (node exe +  │             │ (node exe +  │
 │ postject)    │             │ postject)    │             │ postject)    │
 └──────┬───────┘             └──────┬───────┘             └──────┬───────┘
        │ externalBin/<name>-<triple>[.exe]
        ▼                           ▼                           ▼
 ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
 │ 2. tauri-    │             │ 2. tauri-    │             │ 2. tauri-    │
 │ action:      │             │ action:      │             │ action:      │
 │ tauri build  │             │ tauri build  │             │ tauri build  │
 │ (NSIS)       │             │ (AppImage)   │             │ (.dmg)       │
 │ + WINDOWS_*  │             │ + no sign    │             │ + APPLE_*    │
 │ secret check │             │ needed       │             │ secret check │
 │ (conditional)│             │              │             │ (native skip)│
 └──────┬───────┘             └──────┬───────┘             └──────┬───────┘
        │                            │                            │
        └────────────┬───────────────┴───────────────┬────────────┘
                      ▼                               ▼
           ┌──────────────────────┐        ┌──────────────────────┐
           │ 3. tauri-action       │        │ latest.json generated │
           │ uploads artifacts to  │───────▶│ (minisign-signed)      │
           │ a DRAFT + prerelease  │        │ same GitHub Release   │
           │ GitHub Release        │        └──────────────────────┘
           └──────────┬───────────┘
                      ▼
           ┌──────────────────────┐
           │ 4. HUMAN reviews      │
           │ draft, manually       │
           │ publishes             │
           └──────────┬───────────┘
                      ▼
           ┌──────────────────────┐
           │ 5. Installed app's    │
           │ tauri-plugin-updater  │
           │ polls latest.json,    │
           │ verifies minisign sig,│
           │ downloads+installs    │
           └──────────────────────┘
```

### Recommended Project Structure

```
src-tauri/
├── tauri.conf.json          # bundle.active: true, targets, plugins.updater block added
├── Cargo.toml                # + tauri-plugin-updater, tauri-plugin-shell; keyring features expanded
├── capabilities/
│   └── default.json          # + updater:default, shell:allow-execute (scoped to the sidecar name)
├── binaries/                 # NEW — externalBin target: holds per-triple sidecar binaries
│   ├── gamelib-sidecar-x86_64-pc-windows-msvc.exe
│   ├── gamelib-sidecar-x86_64-apple-darwin
│   ├── gamelib-sidecar-aarch64-apple-darwin
│   └── gamelib-sidecar-x86_64-unknown-linux-gnu
└── src/main.rs                # sidecar spawn path: dev = `node build/main/sidecar.js`,
                                # packaged = resolved externalBin path (tauri-plugin-shell)

meta/
└── buildSidecarSea.ts         # NEW — per-OS SEA build script (sea-config.json + postject invocation),
                                # mirrors the existing meta/buildSteamBridgeShims.ts convention

.github/workflows/
└── release-tauri.yml          # NEW — the 3-OS matrix release workflow (D-05/D-09)
```

### Pattern 1: Env-var-gated code signing (macOS — native, no change needed)

**What:** Tauri's bundler checks for `APPLE_CERTIFICATE` at build time; if absent, it skips `codesign`/notarization entirely and produces an unsigned `.app`/`.dmg`. This IS the D-04 graceful-skip behavior already, natively, for macOS.
**When to use:** macOS leg of the CI matrix — set the env vars conditionally via GitHub secrets; when secrets are unset in this repo (0.x, no paid cert yet), the step silently produces an unsigned artifact.
**Example:**
```yaml
# Source: https://v2.tauri.app/distribute/sign/macos/ (official Tauri docs)
- uses: tauri-apps/tauri-action@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}                 # unset today -> skip signing
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  with:
    tagName: v__VERSION__
    releaseDraft: true
    prerelease: true
    args: ${{ matrix.args }}
```

### Pattern 2: CI-conditional Windows signing (NOT env-var-native — requires an explicit branch)

**What:** Unlike macOS, Windows signing config (`certificateThumbprint`, `digestAlgorithm`, `timestampUrl`, or `signCommand`) lives as a **static field in `tauri.conf.json`**, not something the bundler skips purely because an env var is unset. If you hardcode `certificateThumbprint` in the committed config, a CI run with no cert imported will try to sign against a thumbprint that doesn't exist and FAIL — violating D-04's "never fail" rule.
**When to use:** Windows leg of the CI matrix.
**Example:**
```yaml
# Source: https://v2.tauri.app/distribute/sign/windows/ (official Tauri docs) — pattern synthesized
# for the graceful-skip requirement (D-04), which the docs do not natively provide for Windows.
- name: Import signing certificate (if present)
  if: env.WINDOWS_CERTIFICATE != ''
  shell: pwsh
  run: |
    $bytes = [Convert]::FromBase64String("${{ secrets.WINDOWS_CERTIFICATE }}")
    Set-Content -Path cert.pfx -Value $bytes -AsByteStream
    $securePw = ConvertTo-SecureString -String "${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}" -AsPlainText -Force
    Import-PfxCertificate -FilePath cert.pfx -CertStoreLocation Cert:\CurrentUser\My -Password $securePw

- uses: tauri-apps/tauri-action@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    tagName: v__VERSION__
    releaseDraft: true
    prerelease: true
    # Signed build: pass an inline config override merged over tauri.conf.json.
    # Unsigned build: omit the override entirely — `tauri.conf.json` itself never
    # declares `certificateThumbprint`, so the default is always "no Windows signing".
    args: >
      ${{ env.WINDOWS_CERTIFICATE != '' &&
          format('--config {{"bundle":{{"windows":{{"certificateThumbprint":"{0}","digestAlgorithm":"sha256","timestampUrl":"http://timestamp.digicert.com"}}}}}}', env.WINDOWS_CERT_THUMBPRINT) ||
          '' }}
```

### Pattern 3: Node SEA (legacy 2-step, LTS-compatible) build script

**What:** Compiles `build/main/sidecar.js` (already produced by the existing `pnpm build:sidecar` esbuild step) into a self-contained per-OS executable with no external Node dependency.
**When to use:** As a pre-bundle step in each CI matrix leg, before `tauri-action` runs, writing the result into `src-tauri/binaries/gamelib-sidecar-<host-triple>[.exe]`.
**Example:**
```bash
# Source: https://nodejs.org/api/single-executable-applications.html (official Node.js docs, verified 2026-07-24)
# sea-config.json
cat > sea-config.json <<'EOF'
{
  "main": "build/main/sidecar.js",
  "output": "sidecar-prep.blob",
  "disableExperimentalSEAWarning": true
}
EOF

node --experimental-sea-config sea-config.json

# Copy the running node binary (per-OS)
node -e "require('fs').copyFileSync(process.execPath, process.platform === 'win32' ? 'gamelib-sidecar.exe' : 'gamelib-sidecar')"

# macOS only: strip the existing signature before injection
if [ "$(uname)" = "Darwin" ]; then codesign --remove-signature gamelib-sidecar; fi

# Inject the blob (sentinel fuse string is fixed/official, do not alter)
npx postject gamelib-sidecar${EXT} NODE_SEA_BLOB sidecar-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  $( [ "$(uname)" = "Darwin" ] && echo "--macho-segment-name NODE_SEA" )

# macOS only: ad-hoc re-sign so Gatekeeper doesn't reject it outright
if [ "$(uname)" = "Darwin" ]; then codesign --sign - gamelib-sidecar; fi
```

### Pattern 4: `externalBin` config + capability permission

**What:** Registers the compiled sidecar as a Tauri-bundled resource and grants the shell-execute permission scoped to exactly that binary.
**When to use:** Once Pattern 3 has produced the per-triple binaries in `src-tauri/binaries/`.
**Example:**
```json
// Source: https://v2.tauri.app/develop/sidecar/ (official Tauri docs)
// src-tauri/tauri.conf.json
{
  "bundle": {
    "active": true,
    "externalBin": ["binaries/gamelib-sidecar"]
  }
}
```
```json
// src-tauri/capabilities/default.json — add alongside the existing permissions array
{
  "identifier": "shell:allow-execute",
  "allow": [{ "name": "binaries/gamelib-sidecar", "sidecar": true }]
}
```

### Anti-Patterns to Avoid

- **Hardcoding `certificateThumbprint` in the committed `tauri.conf.json`:** breaks D-04 the moment CI runs without the cert secret present — the build will try to sign against a thumbprint with no matching cert in the store and fail. Keep the base config signing-free; inject signing config only via a CI-conditional `--config` override (Pattern 2).
- **Assuming `--build-sea` is available:** it shipped in Node 25.5.0 (a non-LTS "Current" release as of Jan 2026). This project's `engines.node` (`>=22`) and CI's `actions/setup-node` (via `node-version-file`) will resolve to an LTS line (22.x/24.x) that does NOT have this flag. Use the legacy 2-step workflow (Pattern 3).
- **Trusting `package.json`'s `repository` field for the updater feed:** it deliberately still points at Heroic upstream (by design, per `260720-q5n`'s SUMMARY.md) — the Tauri updater's `endpoints` array in `plugins.updater` must be explicitly pointed at `grayson-mitchell/GameLib`, the same lesson already applied to `electron-builder.yml`'s `publish` block. Do not let any tool derive the feed from `repository`.
- **Leaving the `keyring` crate at `apple-native`-only:** compiles fine on all three OSes today (feature-gated code just becomes a no-op-ish credential backend on non-macOS), but real OS-keychain storage on Windows/Linux silently fails at runtime once those builds ship — see Pitfall 5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Update signature verification | A custom HMAC/checksum scheme for verifying downloaded installers | `tauri-plugin-updater`'s built-in minisign (Ed25519) verification | It's the load-bearing security mechanism for auto-update; a custom scheme is both more work and a fresh attack surface for zero benefit over the first-party, audited implementation |
| Per-OS installer generation (NSIS/AppImage/dmg) | Custom `makensis`/`appimagetool`/`hdiutil` shell scripts | Tauri's `bundle` config (`targets`) | Tauri's bundler already wraps all three toolchains with sane defaults (icon sizing, metadata, updater-artifact co-generation) — bypassing it means re-solving problems Tauri already solved, and losing `createUpdaterArtifacts` wiring |
| Sidecar binary path resolution (dev vs packaged) | Manual `if cfg!(debug_assertions) { ... } else { ... }` path branching in `main.rs` | `tauri-plugin-shell`'s `app.shell().sidecar(name)` | The plugin already encodes the dev-vs-bundled path-resolution logic (including `resource_dir()` differences per OS) that the current skeleton's `resolve_sidecar_entry()` only handles for the dev-mode "system node" case |
| Draft/prerelease + `latest.json` generation | Hand-rolled `gh release create` + manually computed update manifest | `tauri-action`'s `releaseDraft`/`prerelease`/`uploadUpdaterJson` inputs | This is exactly what `tauri-action` exists to do — it also correctly names/signs the manifest to match what `tauri-plugin-updater` expects to parse |

**Key insight:** every piece of this phase has an official, first-party Tauri or Node.js tool that already does the job — the actual work is almost entirely **wiring and CI plumbing**, not building new mechanisms. The one place custom logic is genuinely needed is the Windows graceful-skip conditional (Pattern 2), because Tauri's own docs don't provide an env-var-native equivalent to macOS's behavior there.

## Common Pitfalls

### Pitfall 1: `worker_threads` spawn breaks silently under a compiled sidecar (but has an existing safety net)
**What goes wrong:** `src/backend/storeManagers/steam/depot/decompressPool.ts`'s `resolveWorkerPath()` computes `path.join(__dirname, 'decompressWorker.js')`. Today (dev-mode, `pnpm build:sidecar`'s esbuild bundle), this file happens to exist at `build/main/decompressWorker.js` **only because `electron-vite build` (a separate build step that runs first in `tauri:dev`) independently compiles it as its own entry point into the same output directory** — a coincidence of two build tools sharing an output folder, not something the sidecar's own build step produces. Once the sidecar is compiled into a single SEA/pkg executable and no longer sits in that same `build/main/` folder (or that folder isn't shipped at all in a packaged release), `new Worker(...)` will throw `ENOENT`/module-not-found.
**Why it happens:** SEA (and `pkg`) bundle exactly one entry file; a `Worker(differentFilePath)` call expects a real file on disk at that path, which SEA does not provide by default.
**How to avoid:** This is NOT a correctness blocker — `spawnWorker()`'s try/catch already sets `this.inlineFallback = true` and continues decompression single-threaded on the main thread (verified by reading the code). Document this as an **accepted, deliberate throughput regression** for packaged builds unless the planner chooses to also ship `decompressWorker.js` as a companion resource file next to the compiled sidecar and pass an explicit `workerPath` override (the pool's constructor already accepts `opts.workerPath` for exactly this purpose).
**Warning signs:** Depot chunk-decode throughput logs (`chunk-stream stats`, referenced in Phase 25's memory) showing a sudden single-thread-equivalent slowdown specifically in packaged (non-dev) builds; the pool's own inline-fallback path is silent (no explicit warning logged) — flag this as a possible small polish task (log a one-time warning on fallback) if the planner wants visibility.

### Pitfall 2: Node SEA's own docs flag macOS x64 as a lower-confidence tier than arm64/Windows/Linux
**What goes wrong:** Node's official SEA documentation states the feature is "tested regularly" on Windows, Linux (most distros/arches), and macOS **arm64 only** — x64 macOS is notably absent from that regularly-tested list.
**Why it happens:** Apple Silicon is now the dominant macOS CI/dev target; x64 mac testing appears to have fallen out of Node core's routine CI matrix, not that the mechanism is fundamentally broken on Intel.
**How to avoid:** GameLib ships both `--x64` and `--arm64` macOS builds (see `electron-builder.yml`'s existing `mac.artifactName: ...${arch}...` and `release:mac`'s `--x64 --arm64`). Add an explicit live-hardware or CI-artifact-smoke-test validation step for the compiled macOS **x64** sidecar specifically before treating D-06 as done for that architecture — don't assume arm64 success implies x64 success.
**Warning signs:** A macOS x64 packaged build that hangs on sidecar startup, or a `postject`/`codesign` step that behaves differently under Rosetta-emulated vs native x64 CI runners (GitHub's `macos-latest` runners are Apple-Silicon-native as of 2026; an x64 SEA built there is a **cross-arch** build, which also triggers the documented "set `useCodeCache`/`useSnapshot` to `false` for cross-platform SEA" requirement — already satisfied by the legacy 2-step workflow in Pattern 3, which never uses those options).

### Pitfall 3: Node SEA restricts module loading to built-ins by default — but this project's bundle already satisfies that
**What goes wrong:** SEA's injected main script can, by default, only `require()` built-in Node modules — arbitrary `node_modules` resolution is disabled unless you explicitly call `module.createRequire(__filename)`.
**Why it happens:** SEA is designed for single-file distribution; it deliberately narrows the module resolution surface to avoid depending on a `node_modules` folder existing next to the executable.
**How to avoid:** Not an issue here — `pnpm build:sidecar`'s esbuild step already bundles every non-`electron`/`electron-store` dependency into the single `build/main/sidecar.js` output (confirmed: `--bundle --packages=external --external:electron --external:electron-store`). As long as no code path performs a *dynamic*, non-bundled `require()` at runtime (verified: the two `import('lzma')` calls in `depot.ts`/`decompressPool.ts`/`decompressWorker.ts` are **static** dynamic-imports of an already-bundled dependency, which esbuild inlines at build time, not a runtime filesystem lookup), this constraint is already satisfied.
**Warning signs:** A `MODULE_NOT_FOUND` error specifically inside the packaged sidecar (not reproducible in dev) pointing at a package name rather than a project-relative path — would indicate something esbuild didn't inline, worth auditing `build:sidecar`'s `--external` flags if this occurs.

### Pitfall 4: Windows signing has no native "skip if absent" behavior — must be built explicitly
**What goes wrong:** Unlike macOS (env-var presence check baked into Tauri's bundler), Windows code signing is driven by static `tauri.conf.json` fields. If `certificateThumbprint` is committed to the config, a secrets-less CI run will attempt to sign against a nonexistent certificate and the build will FAIL — directly violating D-04.
**Why it happens:** Tauri's Windows signing implementation predates a first-class "conditional" design; it assumes you either configure signing or you don't, statically.
**How to avoid:** Never commit `certificateThumbprint`/`signCommand` to the base `tauri.conf.json`. Gate an entirely separate `--config` JSON-merge override (Pattern 2) behind a CI `if: env.WINDOWS_CERTIFICATE != ''` conditional, so the unsigned path is simply "run `tauri build` with no override" — the true default, not a special case.
**Warning signs:** A Windows CI leg failing specifically with a "certificate not found" or "no certificates were found that met all the given criteria" `signtool` error — this is the signature of the anti-pattern above, not a real infrastructure problem.

### Pitfall 5: `keyring` crate's macOS-only feature flag silently breaks Windows/Linux `safeStorage`
**What goes wrong:** `src-tauri/Cargo.toml` currently declares `keyring = { version = "3", features = ["apple-native"] }` (Phase 28). Building for Windows or Linux with only this feature enabled means no platform credential-store backend is compiled in for those OSes.
**Why it happens:** Phase 27/28 were explicitly macOS-only in scope (`27-CONTEXT.md`'s deferred list names "Windows/Linux Tauri packaging" as out of scope) — nobody has needed the other two platform features yet.
**How to avoid:** Add `windows-native` and `sync-secret-service` to the feature list (`features = ["apple-native", "windows-native", "sync-secret-service"]`). `sync-secret-service` requires `libdbus` at runtime on Linux (present by default on GNOME/KDE desktops via `gnome-keyring`/`kwallet`; consider the `vendored` sub-feature to statically link `libdbus` if a bare-minimum Linux desktop environment without a Secret Service implementation is a supported target — flag this as an open question for the planner/discuss-phase since GameLib's Linux desktop-environment support matrix isn't specified anywhere in the repo).
**Warning signs:** A Windows or Linux packaged build where Steam login "succeeds" but the token silently fails to persist across restarts (forcing re-login every launch) — the `keyring_get`/`keyring_set`/`keyring_delete` dispatch in `main.rs` already returns a structured `keyring:unavailable:{e}` error rather than panicking (verified by reading the code), so this would surface as a **silent-feeling but logged** failure, not a crash. [ASSUMED: the exact `keyring::Error` variant returned when zero platform features are compiled in for the running OS was not empirically reproduced this session — treat the "silently fails" framing as the most likely failure mode based on the crate's documented feature-gating design, not a hardware-verified observation.]

### Pitfall 6: No existing Windows draft-release CI workflow to model against
**What goes wrong:** The repo has `.github/workflows/draft-release-mac.yml` and `draft-release-linux.yml` (both triggered on `v*` tag push, both Electron/`electron-builder`-based) but **no `draft-release-win.yml`** — Windows portable builds only exist in the non-publishing `build-base.yml` reusable workflow (`pnpm dist:win portable`, no `-p always`/publish flag, no code-signing env vars referenced anywhere in the repo for Windows). Do not assume a Windows electron-builder release precedent exists to mirror; Phase 34's Windows CI leg is genuinely new, not a port of existing Electron automation.
**Why it happens:** The Electron build's Windows release path was apparently never wired for automated publishing, only ad-hoc CI artifact builds.
**How to avoid:** Build the Windows leg of the new `release-tauri.yml` workflow directly from the official Tauri/`tauri-action` reference workflow (Pattern 2 above + the canonical example in Code Examples), not from any existing GameLib workflow file.
**Warning signs:** N/A — this is a "don't go looking for a pattern that isn't there" pitfall, confirmed by directly grepping `.github/workflows/*.yml` for `windows`/`win` references during this research session.

### Pitfall 7: Existing `v*` tag trigger is already claimed by the Electron draft-release workflows
**What goes wrong:** `draft-release-mac.yml` and `draft-release-linux.yml` both trigger `on: push: tags: ['v*']`. A new Tauri release workflow using the same `v*` pattern will run **simultaneously** with the existing Electron release workflows on every tag push — not a conflict per se (they publish to the same GitHub Release via `-p always`/`tauri-action`'s own draft-release creation, and GitHub Releases support multiple assets per release), but it means every version tag now triggers 4 parallel CI jobs (mac-electron, linux-electron, and however many Tauri matrix legs) — worth flagging to the planner as an intentional design point, not an accident, and worth confirming the Tauri and Electron artifacts use distinguishable filenames on the same release (electron-builder's `artifactName` patterns already include `-Setup-`/`-Portable-`/`-macOS-`/`-linux-` segments; ensure the Tauri bundler's default artifact names don't collide).
**Why it happens:** Both pipelines are additive (per the Phase 27+ invariant) and both are tag-triggered by convention.
**How to avoid:** Either (a) accept co-triggering and verify no filename collisions on the shared GitHub Release, or (b) use a distinct tag pattern for the Tauri pipeline (e.g., `tauri-v*`) if the planner wants to decouple the two release cadences during the transition period before Phase 35 retires Electron. This is a genuine open decision, not a research-resolved fact — surface it to the planner/discuss-phase.
**Warning signs:** A tag push producing two GitHub Releases instead of one uploading to the same release, or an artifact-name collision silently overwriting one platform's installer with another's during upload.

## Code Examples

### Full reference CI workflow (canonical, adapted for this repo's pnpm/tsc toolchain)

```yaml
# Source: https://v2.tauri.app/distribute/pipelines/github/ (official Tauri v2 docs,
# adapted: pnpm instead of npm, existing ./.github/actions/install-deps composite action reused,
# ubuntu system deps per tauri-action's own documented requirement)
name: Release Tauri

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'
            args: '--target aarch64-apple-darwin'
          - platform: 'macos-latest'
            args: '--target x86_64-apple-darwin'
          - platform: 'ubuntu-24.04'
            args: ''
          - platform: 'windows-latest'
            args: ''
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v6

      - name: Install Ubuntu system dependencies
        if: matrix.platform == 'ubuntu-24.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdg-utils

      - uses: ./.github/actions/install-deps

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Build self-contained sidecar (Node SEA)
        run: pnpm build:sidecar-sea   # new script — see meta/buildSidecarSea.ts (Pattern 3)

      - name: Import Windows signing certificate (if present)
        if: matrix.platform == 'windows-latest' && env.WINDOWS_CERTIFICATE != ''
        shell: pwsh
        env:
          WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
          WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
        run: |
          $bytes = [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE)
          Set-Content -Path cert.pfx -Value $bytes -AsByteStream
          $securePw = ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
          Import-PfxCertificate -FilePath cert.pfx -CertStoreLocation Cert:\CurrentUser\My -Password $securePw

      - uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          tagName: v__VERSION__
          releaseName: 'GameLib v__VERSION__'
          releaseBody: 'See the assets below to download and install.'
          releaseDraft: true
          prerelease: true
          args: ${{ matrix.args }}
```

### `tauri.conf.json` updater block

```json
// Source: https://v2.tauri.app/plugin/updater/ (official Tauri v2 docs)
{
  "bundle": {
    "active": true,
    "targets": ["nsis", "appimage", "dmg"],
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<contents of the generated .key.pub file>",
      "endpoints": [
        "https://github.com/grayson-mitchell/GameLib/releases/latest/download/latest.json"
      ],
      "windows": { "installMode": "passive" }
    }
  }
}
```

### Minisign keypair generation (run once, locally, NOT in CI)

```bash
# Source: https://v2.tauri.app/plugin/updater/ (official Tauri v2 docs)
pnpm tauri signer generate -- -w ~/.tauri/gamelib-updater.key
# Outputs:
#   ~/.tauri/gamelib-updater.key       <- private key: paste into GitHub secret TAURI_SIGNING_PRIVATE_KEY
#   ~/.tauri/gamelib-updater.key.pub   <- public key: paste into tauri.conf.json plugins.updater.pubkey
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Node SEA 2-step (`--experimental-sea-config` + `postject`) | Node SEA 1-step (`--build-sea`) | Node v25.5.0, Jan 2026 | Not usable yet for this project — v25.5.0 is a non-LTS "Current" release and this project targets `>=22` LTS. Revisit once v25.x/v26.x reaches LTS status (expected ~Oct 2026 per Node's release cadence) and the project is willing to bump its minimum Node version. |
| electron-updater feed derived from `package.json.repository` | Explicit `publish`/`endpoints` block pointing at the fork | 2026-07-20 (`260720-q5n`) | Established precedent this phase must replicate for the Tauri updater's `endpoints` array — do not let it default anywhere. |

**Deprecated/outdated:**
- Vercel's original `pkg` package: unmaintained since 2023; do not recommend it even as a fallback — use `@yao-pkg/pkg` (the actively maintained fork) if Node SEA proves unworkable.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `keyring::Error` variant returned when zero platform-native features are compiled in for the running OS results in a "silent-feeling but logged" failure (not a panic/crash) | Pitfall 5 | If wrong (e.g., it actually panics or fails at compile time instead), the planner should add an earlier, compile-time or startup-time guard rather than relying on the existing runtime error-mapping in `main.rs` |
| A2 | GitHub's `macos-latest`/`ubuntu-latest`/`windows-latest` hosted runners have sufficient Rust toolchain support out of the box that `dtolnay/rust-toolchain@stable` + `swatinem/rust-cache@v2` is sufficient (no additional system Rust dependencies needed beyond what `tauri-action`'s own Ubuntu apt-get list covers) | Code Examples (CI workflow) | If wrong, the CI leg would fail early with a clear toolchain error — low risk, but the planner should budget one CI-debugging iteration for this rather than assuming zero-friction first-run success |
| A3 | Adding `windows-native`/`sync-secret-service` to the `keyring` crate's feature list is sufficient for D-01's "real installable build" bar on Windows/Linux, without also needing the `vendored` sub-feature for dbus static-linking | Standard Stack / Pitfall 5 | If the target Linux desktop environments lack a Secret Service implementation (unlikely on mainstream GNOME/KDE but possible on minimal window-manager setups), `sync-secret-service` alone will fail at runtime and the `vendored` feature (or a documented "no keyring found" fallback UX) would be needed instead |

**If this table is empty:** N/A — see above.

## Open Questions (RESOLVED)

> All three were resolved during Phase 34 planning; each resolution points at the deciding plan/task.

1. **Should the Tauri release workflow share the `v*` tag trigger with the existing Electron `draft-release-mac.yml`/`draft-release-linux.yml`, or use a distinct tag pattern?**
   - What we know: Both existing Electron workflows already claim `v*`; a new Tauri workflow using the same pattern will co-trigger on every version tag push during the Electron/Tauri coexistence window (until Phase 35).
   - What's unclear: Whether GameLib wants one unified release per tag (both shells' artifacts on the same GitHub Release) or a decoupled Tauri release cadence.
   - Recommendation: Default to sharing `v*` (simplest, matches D-09's "pushing a version tag... creates a draft release" framing) and verify no artifact-filename collisions; flag as a quick discuss-phase confirmation if the user has a preference.
   - **RESOLVED (34-06 Task 1):** Shares the `v*` trigger (co-triggering with the Electron `draft-release-*` workflows is ACCEPTED — Pitfall 7); the plan requires confirming Tauri vs electron-builder artifact names do not collide.

2. **Does GameLib need to support Linux desktop environments without a Secret Service implementation (bare window managers, minimal server-like Linux)?**
   - What we know: `sync-secret-service` (the `keyring` crate's Linux feature) depends on a running Secret Service provider (GNOME Keyring, KWallet) being present.
   - What's unclear: No existing repo document specifies a minimum supported Linux desktop-environment matrix.
   - Recommendation: Assume mainstream GNOME/KDE desktops are the target (matches the existing Electron Linux build's implicit assumptions — CrossOver/Wine bottle work in this codebase already assumes a fairly complete desktop Linux environment) unless the user says otherwise; document the runtime fallback behavior (Pitfall 5) regardless.
   - **RESOLVED (34-02 Task 1):** Targets mainstream GNOME/KDE; the plan documents the Secret Service assumption and the `keyring:unavailable` structured-error fallback (Pitfall 5 / A3).

3. **What is the exact per-OS `build:sidecar-sea` invocation shape, and should it live as a new `meta/*.ts` script (mirroring `buildSteamBridgeShims.ts`/`gen_vtables.ts`'s existing convention) or inline in the CI workflow?**
   - What we know: The existing `build:sidecar` esbuild step is a single cross-platform command; the SEA packaging step (Pattern 3) has OS-conditional branches (codesign only on macOS, `.exe` extension only on Windows).
   - What's unclear: Whether to write this as a portable `meta/buildSidecarSea.ts` (Node script, matches repo convention, testable) or as inline shell steps per matrix leg in the workflow YAML (simpler, less code, harder to test locally).
   - Recommendation: Follow the established `meta/*.ts` convention (portable, `esbuild`-runnable, and locally reproducible outside CI) — this is a low-risk, low-cost decision for the planner to make explicitly rather than defaulting to inline YAML.
   - **RESOLVED (34-02 Task 2):** Built as portable `meta/buildSidecarSea.ts` (exported pure argv-builders, unit-tested by `buildSidecarSea.test.ts`), NOT inline CI YAML.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Sidecar build (esbuild bundle + SEA compile) | ✓ (local dev machine) | v26.2.0 (local); CI resolves via `node-version-file: package.json` → `>=22` LTS | — |
| Rust / Cargo | Tauri shell build | ✓ | 1.94.x-class toolchain (per 27-CONTEXT) | `dtolnay/rust-toolchain@stable` in CI |
| `@tauri-apps/cli` | `tauri build`, `tauri signer generate` | ✓ | 2.11.4 (already a devDependency) | — |
| `slopcheck` | Package legitimacy verification (this research session) | ✓ (installed at `/opt/homebrew/bin/slopcheck`) | — | — |
| `postject` | Node SEA blob injection | ✗ (not yet installed) | latest, `[VERIFIED]` via slopcheck | `npx postject` works without a persistent install; add as a devDependency if the planner wants a pinned version |
| GitHub Actions hosted runners (windows-latest/ubuntu-latest/macos-latest) | The entire CI release matrix (D-05) | Assumed ✓ (standard GitHub-hosted runners, free for public repos per D-05) | — | — |
| A real Windows Authenticode certificate / Apple Developer ID | Real (non-plumbing) signing | ✗ (explicitly deferred, D-03) | — | Unsigned artifacts (the designed, accepted 0.x state) |

**Missing dependencies with no fallback:** none — every missing piece (real certs) has an explicit, locked fallback (ship unsigned, D-03/D-04).

**Missing dependencies with fallback:** `postject` (fallback: `npx postject` ad hoc, no persistent install required).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 (already configured, `jest.config.js`) |
| Config file | `jest.config.js` |
| Quick run command | `pnpm test -- --testPathPattern=<new-test-file>` |
| Full suite command | `pnpm test:ci` |

### Phase Requirements → Test Map

| Req ID (suggested) | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-34-macos-productionization | `bundle.active: true` + `.dmg` target present; `npm start` and `npm run tauri:dev` both still launch | config-shape unit test + manual smoke | `pnpm test -- --testPathPattern=tauriConf` | ❌ Wave 0 — new test |
| REQ-34-winlinux-bundles | `bundle.targets` includes `nsis` and `appimage` | config-shape unit test | `pnpm test -- --testPathPattern=tauriConf` | ❌ Wave 0 — new test |
| REQ-34-sidecar-sea | Compiled sidecar binary runs standalone (`./gamelib-sidecar` responds on stdio without a system Node on PATH) | integration / manual (CI-artifact smoke test) | manual: run the produced binary in a clean container with no Node installed | ❌ Wave 0 — new CI smoke step |
| REQ-34-signing-graceful-skip | CI build with unset signing secrets produces an artifact and does NOT fail the job | CI-level (not local jest) | GitHub Actions dry run (`workflow_dispatch` with no secrets set, or a scratch fork) | ❌ Wave 0 — new CI job to exercise once |
| REQ-34-updater-config | `tauri.conf.json` `plugins.updater.pubkey` is set and non-empty; `endpoints` contains `grayson-mitchell/GameLib`, never `Heroic-Games-Launcher` | config-shape unit test | `pnpm test -- --testPathPattern=tauriConf` | ❌ Wave 0 — new test |
| REQ-34-release-trigger | Workflow YAML triggers on `v*` tag push; `releaseDraft`/`prerelease` inputs are both `true` | CI-config unit test (parse YAML, assert fields) | `pnpm test -- --testPathPattern=releaseWorkflow` | ❌ Wave 0 — new test |
| REQ-34-keyring-features | `Cargo.toml`'s `keyring` dependency line includes `windows-native` and `sync-secret-service` alongside `apple-native` | config-shape unit test (parse `Cargo.toml`, assert feature list) | `pnpm test -- --testPathPattern=cargoFeatures` | ❌ Wave 0 — new test |

### Sampling Rate
- **Per task commit:** targeted `pnpm test -- --testPathPattern=<touched area>`
- **Per wave merge:** `pnpm test:ci`
- **Phase gate:** Full suite green before `/gsd:verify-work`, PLUS a real tag-push CI dry run (this phase is unusually CI-native — most of its "tests" are whether the GitHub Actions workflow itself runs and produces artifacts, which jest cannot simulate. Budget an explicit human-verify checkpoint task for "push a test tag, confirm all 3 matrix legs complete and a draft prerelease appears with 3 platform artifacts + `latest.json`").

### Wave 0 Gaps
- [ ] A new `tauriConf.test.ts` (or similar) asserting `tauri.conf.json`'s `bundle.active`, `bundle.targets`, and `plugins.updater.endpoints` shape — cheap, fast, catches config regressions before a CI run is even needed.
- [ ] A new `cargoFeatures.test.ts` (or a simple grep-based check) asserting the `keyring` dependency line in `Cargo.toml` includes the three platform features.
- [ ] A new `releaseWorkflow.test.ts` parsing the new `.github/workflows/release-tauri.yml` and asserting matrix OSes, tag trigger, and draft/prerelease flags — this is the closest thing to a regression test for D-05/D-09 without actually running CI.
- [ ] No existing test infrastructure covers GitHub Actions workflow execution itself — this phase's real acceptance gate is a live tag-push dry run, which is inherently a `checkpoint:human-verify` task, not something jest can automate.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not applicable — this phase touches build/release pipeline, not app-level auth |
| V3 Session Management | no | Not applicable |
| V4 Access Control | no | Not applicable |
| V5 Input Validation | no | No new user-facing input surface introduced this phase |
| V6 Cryptography | yes | Minisign (Ed25519) signature verification via `tauri-plugin-updater` — never hand-roll (see Don't Hand-Roll); private key + password must be GitHub Actions **secrets**, never committed, never logged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Compromised/forged update artifact served from GitHub Releases | Tampering | minisign signature verification (built into `tauri-plugin-updater`) — an unsigned or wrongly-signed `latest.json`/installer is rejected client-side before install |
| Update feed silently repointed at an attacker-controlled or wrong (Heroic upstream) endpoint | Spoofing | `plugins.updater.endpoints` hardcoded to `grayson-mitchell/GameLib` in the committed config (never derived from `package.json.repository`, which intentionally still points at Heroic) — this is the exact failure mode `260720-q5n` already fixed for Electron; do not regress it for Tauri |
| Minisign private key leaked via CI logs or a misconfigured secret | Information Disclosure | Private key + password live ONLY as GitHub Actions secrets (`TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), never printed in workflow logs; GitHub Actions automatically redacts registered secret values from log output as a baseline mitigation |
| Windows/Apple signing certificate exfiltration from CI | Information Disclosure | Same secrets-only handling; base64-encoded `.pfx`/`.p12` decoded only in-memory during the CI job, never written to a persisted/cached artifact |
| A malicious sidecar binary substituted for the legitimate compiled one before Tauri bundles it | Tampering | The SEA-compiled sidecar is produced in the SAME CI job/leg that bundles it (no cross-job artifact hand-off in the recommended design) — minimizes the window for substitution; if a future redesign splits sidecar-build and bundle into separate jobs, add artifact checksuming between them |

## Sources

### Primary (HIGH confidence)
- https://v2.tauri.app/plugin/updater/ — updater plugin config, minisign keypair generation, capability permissions
- https://v2.tauri.app/develop/sidecar/ — `externalBin` config syntax, target-triple naming, capability permission, Rust/JS invocation
- https://v2.tauri.app/distribute/sign/windows/ — Windows signing config keys (`certificateThumbprint`, `signCommand`, etc.)
- https://v2.tauri.app/distribute/pipelines/github/ — canonical GitHub Actions release workflow example
- https://nodejs.org/api/single-executable-applications.html — Node SEA config shape, `--build-sea` vs legacy 2-step workflow, `postject` sentinel fuse string, documented testing-tier caveats (macOS arm64-only), module-loading restrictions
- npm registry (`npm view <pkg> version`) — `@tauri-apps/plugin-updater` 2.10.1, `@tauri-apps/plugin-shell` 2.3.5, `@tauri-apps/cli` 2.11.4
- `cargo search <crate>` (crates.io) — `tauri-plugin-updater` 2.10.1, `tauri-plugin-shell` 2.3.5, `keyring` (current Cargo.lock-resolved 3.6.3 vs. latest-available 4.1.5)
- slopcheck (local tool) — legitimacy verification for all 5 new packages recommended this phase, all `[OK]`
- Direct repository inspection (`src-tauri/tauri.conf.json`, `Cargo.toml`, `main.rs`, `package.json`, `electron-builder.yml`, `.github/workflows/*.yml`, `src/backend/storeManagers/steam/depot/decompressPool.ts`, `node_modules/lzma`, `node_modules/zstddec/dist/zstddec.cjs`) — current-state facts about the sidecar's dependency tree, existing CI conventions, and the keyring feature gap

### Secondary (MEDIUM confidence)
- https://nodejs.org/en/blog/release/v25.5.0 (via WebSearch summary) — confirms `--build-sea` shipped in v25.5.0, a non-LTS release line
- WebSearch summaries of Tauri v2 macOS/Windows signing docs (cross-checked against the direct WebFetch of the same official pages where possible)

### Tertiary (LOW confidence)
- None used as authoritative claims — all LOW-confidence findings were either upgraded via cross-verification or explicitly logged in the Assumptions Log above.

## Metadata

**Confidence breakdown:**
- Standard stack (updater plugin, shell plugin, versions): HIGH — every version number independently confirmed via `npm view`/`cargo search` against the live registries, not training-data recall
- Sidecar single-binary compilation (Node SEA): MEDIUM — the mechanism and commands are HIGH confidence (official Node docs), but the practical outcome for this specific codebase (macOS x64 tier, worker_threads fallback behavior under real packaging) rests on code-reading inference rather than an actual build-and-run this session; flagged explicitly in Pitfalls 1–2 and Assumptions A1/A3
- CI pipeline / signing plumbing: HIGH for macOS (official docs directly describe env-var-gated skip behavior) / MEDIUM for Windows (the graceful-skip design in Pattern 2 is a synthesis, not something the official docs hand you pre-built)
- Cross-platform keyring feature gap: MEDIUM — the feature-flag requirement is HIGH confidence (crates.io/lib.rs feature documentation), but the exact runtime failure mode on a feature-less platform build was not empirically reproduced (Assumption A1)

**Research date:** 2026-07-24
**Valid until:** ~30 days for the Tauri/Node ecosystem facts (config keys, plugin versions — Tauri and Node both ship frequently; re-verify plugin versions at plan time if this research is used more than a few weeks later), ~7 days for anything version-number-specific (e.g., re-run `npm view`/`cargo search` immediately before executing rather than trusting this document's pinned numbers if execution is delayed)

## RESEARCH COMPLETE

**Phase:** 34 - Tauri packaging — Windows and Linux builds, signing, auto-update
**Confidence:** MEDIUM-HIGH

### Key Findings
- Node SEA (legacy 2-step `--experimental-sea-config` + `postject`, NOT the new `--build-sea` one-step flag, which needs Node 25.5.0+ this project doesn't target) is the recommended sidecar compilation path — the sidecar has essentially zero native-addon exposure (verified: `lzma` pure JS, `zstddec`'s WASM is base64-inlined, no `.node` binaries), making it an unusually clean SEA candidate.
- The `decompressPool.ts` `worker_threads` spawn will break under single-binary compilation (the sibling `decompressWorker.js` file it expects won't exist), but the code already has a working graceful inline fallback — this is an accepted throughput regression, not a correctness blocker.
- A significant finding NOT named in `34-CONTEXT.md`: `src-tauri/Cargo.toml`'s `keyring` crate only has the `apple-native` feature enabled (Phase 28, macOS-only). Shipping Windows/Linux builds without adding `windows-native` + `sync-secret-service` will silently break OS-keychain-backed Steam token persistence on those platforms.
- macOS signing/notarization has a native "skip if secrets absent" behavior in Tauri's bundler (env-var presence check) — this satisfies D-04 for free. Windows signing does NOT have this natively (`certificateThumbprint` is a static config field); the planner needs an explicit CI-conditional `--config` override, detailed in Pattern 2.
- No existing `draft-release-win.yml` or any Windows code-signing precedent exists in this repo to model against — the Windows CI leg is genuinely new work, built from the official Tauri reference workflow, not a port of anything already here.
- All 5 new packages recommended this phase (`@tauri-apps/plugin-updater`, `@tauri-apps/plugin-shell`, `postject`, `tauri-plugin-updater`, `tauri-plugin-shell`) passed slopcheck `[OK]` on their respective registries.

### File Created
`/Users/graysonmitchell/Projects/GameLib/.planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Every version independently confirmed live against npm/crates.io registries this session |
| Architecture | HIGH | Config shapes/CLI commands directly sourced from official Tauri v2 docs via WebFetch |
| Sidecar compilation | MEDIUM | Mechanism is HIGH confidence (official Node docs) but real-world outcome (macOS x64 tier, worker fallback) inferred from code-reading, not an actual build-and-run |
| Pitfalls | MEDIUM-HIGH | Most are directly verified by reading repo code or official docs; one (Pitfall 5's exact keyring failure mode) is explicitly logged as an assumption |

### Open Questions (RESOLVED — see the detailed `## Open Questions (RESOLVED)` section above)
1. Should the new Tauri release workflow share the `v*` tag trigger with the existing Electron draft-release workflows, or use a distinct pattern? (co-triggering risk during the Electron/Tauri coexistence window)
2. What Linux desktop-environment matrix does GameLib actually need to support for the `sync-secret-service` keyring backend? (no existing repo doc specifies this)
3. Should the SEA packaging step live as a portable `meta/buildSidecarSea.ts` script (repo convention) or inline CI YAML?

### Ready for Planning
Research complete. Planner can now mint REQ-34-NN requirements from the "Phase Requirements" boundary table above and create PLAN.md files.
