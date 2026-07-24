# Phase 34: Tauri packaging — Windows and Linux builds, signing, auto-update - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 9 (2 modified config, 1 modified Rust source, 1 new Rust config note, 1 new CI workflow, 1 new build script, 3 new jest tests)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/tauri.conf.json` (bundle targets, `plugins.updater`, `createUpdaterArtifacts`) | config | transform (static JSON, read at build+runtime) | `src-tauri/tauri.conf.json` itself (current state) + `electron-builder.yml`'s `publish` block for the fork-pointed-feed precedent | exact (same file, extend) |
| `src-tauri/Cargo.toml` (`keyring` features, + `tauri-plugin-updater`/`tauri-plugin-shell` deps) | config | transform | `src-tauri/Cargo.toml` itself (current state) | exact (same file, extend) |
| `src-tauri/capabilities/default.json` (+ `updater:default`, `shell:allow-execute` scoped to sidecar) | config | request-response (webview→Rust IPC gate) | `src-tauri/capabilities/default.json` itself | exact (same file, extend) |
| `src-tauri/src/main.rs` (sidecar spawn path: dev `node` vs packaged `externalBin`/`tauri-plugin-shell`) | Rust-shell | event-driven (process spawn + stdio relay, unchanged wiring) | `src-tauri/src/main.rs` itself (`resolve_sidecar_entry()`/`spawn_sidecar()`) | exact (same file, extend) |
| `.github/workflows/release-tauri.yml` (NEW) | CI-workflow | batch (matrix build → draft release) | `.github/workflows/draft-release-mac.yml` + `draft-release-linux.yml` (tag-driven draft-prerelease pattern, different bundler) | role-match (same trigger/intent, different tool: `tauri-action` vs `electron-builder`) |
| `meta/buildSidecarSea.ts` (NEW) | build-script | batch (per-OS compile step invoked pre-bundle) | `meta/buildSteamBridgeShims.ts` (packaging-time native-build script convention) | exact (same `meta/*.ts` convention: argv-form spawn, `JEST_WORKER_ID` guard, exported pure helpers for testability) |
| `meta/__tests__/buildSidecarSea.test.ts` (NEW, if planner splits it out) | test | transform | `meta/__tests__/gen_vtables.test.ts` (imports exported pure functions, asserts argv/path shape without invoking the real toolchain) | exact |
| `src-tauri/__tests__/tauriConf.test.ts` / `cargoFeatures.test.ts` / `releaseWorkflow.test.ts` (NEW, config-shape tests) | test | transform (parse JSON/TOML/YAML, assert shape) | `src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts` (reads a JSON file, asserts required-field shape and rejects malformed variants) | role-match (closest existing "parse a static config artifact and assert its shape" test) |
| `electron-builder.yml` `publish` block (READ-ONLY reference, not modified) | config | — | itself | exact (precedent only — do not re-derive, mirror the `endpoints`/`pubkey` value into the Tauri config directly) |

## Pattern Assignments

### `src-tauri/tauri.conf.json` (config, transform)

**Analog:** the file's own current state (`/Users/graysonmitchell/Projects/GameLib/src-tauri/tauri.conf.json`) + `electron-builder.yml`'s `publish` block for the fork-pointing precedent.

**Current full shape** (lines 1-31):
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "GameLib",
  "version": "0.7.0",
  "identifier": "com.gamelib.shell",
  "build": {
    "frontendDist": "../build",
    "beforeBuildCommand": ""
  },
  "app": { "withGlobalTauri": true, "windows": [ ... ], "security": { "csp": null } },
  "bundle": {
    "active": false,
    "targets": "all",
    "icon": []
  },
  "plugins": {}
}
```

**Fork-pointed-feed precedent to mirror** (`electron-builder.yml` lines 24-31):
```yaml
# Auto-update feed for electron-updater. Without this, electron-builder derives
# the feed from package.json's `repository` field, which still points at Heroic
# upstream (Heroic 2.x > GameLib 0.x always triggers a bogus "update available"
# popup that downloads Heroic's installer). Point it at the GameLib fork instead.
publish:
  provider: github
  owner: grayson-mitchell
  repo: GameLib
```
Apply the SAME never-derive-from-defaults discipline to `plugins.updater.endpoints`: hardcode the literal `https://github.com/grayson-mitchell/GameLib/releases/latest/download/latest.json` URL — never let any generator/CLI default it from `package.json.repository` (which intentionally still points at Heroic per `260720-q5n`).

**Target shape (from RESEARCH.md Code Examples, `tauri.conf.json` updater block):**
```json
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
Also add `"externalBin": ["binaries/gamelib-sidecar"]` inside `bundle` once `meta/buildSidecarSea.ts` produces the per-triple binaries (Pattern 4 in RESEARCH.md).

**Error handling / graceful-degradation note:** No `certificateThumbprint`/`signCommand` field belongs in this file (Windows signing anti-pattern — see CI workflow section below). Keep this file signing-free; signing is injected only via a CI-conditional `--config` override.

---

### `src-tauri/Cargo.toml` (config, transform)

**Analog:** the file's own current state.

**Current dependency block** (lines 14-21):
```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
tauri-plugin-notification = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
keyring = { version = "3", features = ["apple-native"] }
```

**Target edit** (additive only — do not bump `keyring`'s major version, `Cargo.lock` resolves 3.6.3):
```toml
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
tauri-plugin-updater = "2"
tauri-plugin-shell = "2"
```
This is the cross-cutting gap RESEARCH.md surfaced (not named in CONTEXT.md): shipping Windows/Linux builds with only `apple-native` compiled in silently breaks Steam-token keychain persistence on those two OSes.

---

### `src-tauri/capabilities/default.json` (config, request-response)

**Analog:** the file's own current state.

**Current shape** (full file, 11 lines):
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the GameLib shell: ...",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "notification:allow-is-permission-granted"
  ]
}
```
**Convention to follow:** every permission addition in this file so far has come with an inline justification comment in the `description` field explaining exactly why it's needed and why broader defaults were deliberately NOT granted (see the existing WR-03 dialog-permission reasoning). Follow the same pattern for the two new entries:
- `updater:default` — required for the JS `check()`/`downloadAndInstall()` API surface.
- `shell:allow-execute` scoped via an `allow: [{ "name": "binaries/gamelib-sidecar", "sidecar": true }]` entry (RESEARCH.md Pattern 4) — do NOT grant a broad `shell:allow-execute` with no `sidecar`/`name` scoping; mirror the existing narrow-scoping discipline (e.g., `notification:allow-is-permission-granted` was granted ALONE, not `notification:default`).

---

### `src-tauri/src/main.rs` (Rust-shell, event-driven)

**Analog:** the file's own current state — `resolve_sidecar_entry()` (lines 530-535) and `spawn_sidecar()` (lines 541-563).

**Current dev-mode path resolution:**
```rust
fn resolve_sidecar_entry() -> String {
    if let Ok(entry) = std::env::var("GAMELIB_SIDECAR_ENTRY") {
        return entry;
    }
    format!("{}/../build/main/sidecar.js", env!("CARGO_MANIFEST_DIR"))
}

fn spawn_sidecar() -> std::io::Result<Child> {
    let entry = resolve_sidecar_entry();
    ...
    let child = Command::new("node")
        .arg(&entry)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    ...
}
```
**Target behavior:** in a packaged build, `Command::new("node")` must become the resolved `externalBin` sidecar binary path (no external Node on the user's machine — D-06). RESEARCH.md's "Don't Hand-Roll" table recommends `tauri-plugin-shell`'s `app.shell().sidecar(name)` for this exact dev-vs-packaged path resolution rather than hand-rolling a `cfg!(debug_assertions)` branch — it already knows `resource_dir()` per-OS differences. Preserve the existing `GAMELIB_SIDECAR_ENTRY` env-var override and the existing diagnostic `eprintln!` lines (spawn success/failure logging) — this file's established convention is to log path/cwd/exists BEFORE attempting spawn (lines 543-549) and to log success/failure explicitly (lines 556-562); any replacement spawn path must keep the same diagnostic discipline.

**Error handling pattern to keep:** every `rustInvoke` dispatch arm in `dispatch_rust_channel` (lines 260-521) uses the flat-`String` error convention (`.map_err(|e| e.to_string())`) and never logs secret values (T-28-04) — no new pattern needed here since Phase 34 does not add new `rustInvoke` channels, only changes how the sidecar process itself is located/spawned.

---

### `.github/workflows/release-tauri.yml` (CI-workflow, batch)

**Analog:** `.github/workflows/draft-release-mac.yml` and `.github/workflows/draft-release-linux.yml` (same tag-driven draft-prerelease intent, different bundler — `tauri-action` instead of `electron-builder`).

**`draft-release-mac.yml` full pattern** (21 lines):
```yaml
name: Draft Release MacOSX

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

env:
  GITHUB_TOKEN: ${{ secrets.WORKFLOW_TOKEN }}
  GH_TOKEN: ${{ secrets.WORKFLOW_TOKEN }}
  CSC_IDENTITY_AUTO_DISCOVERY: true
  CSC_LINK: ${{ secrets.CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.TEAMID }}
  EVS_ACCOUNT_NAME: ${{ secrets.EVS_ACCOUNT_NAME }}
  EVS_PASSWD: ${{ secrets.EVS_PASSWD }}

jobs:
  draft-releases:
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/install-deps
      - name: Fetch bundled CrossOver index snapshot
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release download crossover-index --pattern crossover-index.json.gz --dir public --clobber \
            || echo "No published index yet; shipping without a bundled snapshot"
      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
      - run: python3 -m pip install castlabs-evs
      - run: pnpm release:mac
```

**`draft-release-linux.yml` full pattern** (17 lines — simpler, no extra secrets needed):
```yaml
name: Draft Release Linux

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  draft-releases:
    runs-on: ubuntu-24.04
    steps:
      - run: sudo apt-get install --no-install-recommends -y libarchive-tools libopenjp2-tools rpm
      - uses: actions/checkout@v6
      - uses: ./.github/actions/install-deps
      - run: pnpm release:linux
        env:
          GITHUB_TOKEN: ${{ secrets.WORKFLOW_TOKEN }}
          GH_TOKEN: ${{ secrets.WORKFLOW_TOKEN }}
```

**Repo-specific conventions to carry over into `release-tauri.yml`:**
- `on: push: tags: ['v*']` + `workflow_dispatch:` — identical trigger shape (matches D-09's tag-driven trigger and Claude's-discretion `workflow_dispatch` add-on).
- `uses: actions/checkout@v6` then `uses: ./.github/actions/install-deps` — the existing composite action for dependency install; reuse it rather than hand-rolling `pnpm install` steps (see `.github/actions/install-deps/action.yml`).
- Secrets are read via `env:` block at job or step level, never inlined into `run:` shell strings directly — mirror this for `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`/`APPLE_*`/`WINDOWS_*`.
- **Known gap surfaced by RESEARCH.md Pitfall 6/7:** there is NO existing `draft-release-win.yml` to model the Windows leg against, and both existing workflows already claim the `v*` tag (Pitfall 7 — co-triggering is expected/accepted per the additive/reversible invariant, not a bug to fix). Do not go looking for Windows electron-builder release precedent; the Windows CI leg is genuinely new, built from RESEARCH.md's "Full reference CI workflow" and "Pattern 2" (CI-conditional Windows signing) sections directly.
- **Signing-secret env-var names differ from Electron's:** Electron's mac workflow uses `CSC_LINK`/`CSC_KEY_PASSWORD`/`APPLE_APP_SPECIFIC_PASSWORD`/`TEAMID`; Tauri's `tauri-action` expects `APPLE_CERTIFICATE`/`APPLE_CERTIFICATE_PASSWORD`/`APPLE_SIGNING_IDENTITY`/`APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` (RESEARCH.md Pattern 1). These are a **new, separate set of GitHub secrets** — do not assume the existing Electron secrets are reusable as-is by name.

---

### `meta/buildSidecarSea.ts` (build-script, batch)

**Analog:** `meta/buildSteamBridgeShims.ts` (packaging-time native-build script convention, Phase 24).

**Imports pattern** (lines 44-49):
```typescript
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chmod, copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { downloadZig } from './downloadZig'
```

**Argv-form spawn helper — never a shell string** (lines 151-168):
```typescript
function spawnArgv(
  command: string,
  args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}
```

**Exported pure argv-builder pattern — so tests can assert command construction without invoking the real toolchain** (lines 112-146, `buildHelperCompileArgv`/`buildShimCompileArgv`):
```typescript
export function buildHelperCompileArgv(arch: string = process.arch): {
  command: string
  args: string[]
} {
  return {
    command: 'clang',
    args: ['-O2', '-o', helperOutputPath(arch), HELPER_SOURCE_PATH]
  }
}
```
Apply the same shape to `buildSidecarSea.ts`: export pure functions like `buildSeaConfigPath()`, `buildPostjectArgv(binaryPath, blobPath)`, `sidecarOutputPath(triple)` so `meta/__tests__/buildSidecarSea.test.ts` can assert the exact per-OS argv (codesign-strip only on macOS, `.exe` extension only on Windows, sentinel-fuse string exact-match) without running real `node --experimental-sea-config`/`postject`.

**Compile-gate error handling pattern** (lines 206-230, `compileShim()`):
```typescript
async function compileShim(): Promise<void> {
  if (!existsSync(SHIM_SOURCE_PATH) || !existsSync(SHIM_DEF_PATH)) {
    throw new Error(`Missing generated shim source (...) -- run \`pnpm gen-vtables\` first`)
  }
  const zigBinPath = await downloadZig()
  mkdirSync(bundledBinDir(), { recursive: true })
  const { command, args } = buildShimCompileArgv(zigBinPath)
  const result = await spawnArgv(command, args)
  if (result.code !== 0) {
    throw new Error(`COMPILE GATE FAILED: zig cc exited ${result.code} ...:\n${result.stderr}`)
  }
  if (!existsSync(shimOutputPath())) {
    throw new Error(`COMPILE GATE FAILED: zig cc exited 0 but no .dll was emitted at ${shimOutputPath()}`)
  }
}
```
This "non-zero exit OR missing output file both FAIL the build, loudly" discipline is the right template for the SEA build step too — a `postject` exit 0 with no resulting executable at the expected path must throw, not silently continue (this is a build-script correctness gate, distinct from D-04's CI-signing graceful-skip, which applies only to signing/notarization, not to the sidecar-compile step itself).

**Script-vs-module entry guard** (lines 238-248 — MUST be copied verbatim, this is a known repo gotcha):
```typescript
// esbuild-bundled, run via `... | node` stdin -- Node never sets `require.main`
// for a script read from stdin. `JEST_WORKER_ID` reliably distinguishes
// "imported under test" from "run as a script".
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
```

**`package.json` script wiring precedent** (existing `build:sidecar` line, to extend/companion, not replace):
```
"build:sidecar": "esbuild --bundle --platform=node --target=node22 --format=cjs --packages=external --external:electron --external:electron-store --outfile=build/main/sidecar.js src/sidecar/index.ts",
```
Add a new `"build:sidecar-sea"` script that runs AFTER `build:sidecar` (SEA compiles the esbuild output, it does not replace the bundle step) — mirrors how `release:mac` already chains `pnpm build-steam-bridge && electron-vite build && electron-builder ...` (multiple build steps, in sequence, before the packaging tool runs).

---

### `src-tauri/__tests__/tauriConf.test.ts` / `cargoFeatures.test.ts` / `releaseWorkflow.test.ts` (test, transform)

**Analog:** `src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts`.

**Imports + fixture-load pattern** (lines 1-21):
```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bridgeAllowlist,
  bridgeAllowlistSchema
} from '../allowlist'
```
For the config-shape tests, the equivalent is reading the real committed file directly (no schema module needed — these are plain JSON/TOML/YAML parse-and-assert tests, not schema-validated app data):
```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const tauriConf = JSON.parse(
  readFileSync(join(__dirname, '..', 'tauri.conf.json'), 'utf-8')
)
```

**Assertion style — plain `describe`/`test` blocks, one behavior per test** (lines 23-48):
```typescript
describe('bridgeAllowlistSchema', () => {
  test('accepts a well-formed payload (version 1, >=1 game entry)', () => {
    const result = bridgeAllowlistSchema.safeParse(makeValidPayload())
    expect(result.success).toBe(true)
  })

  test('throws (via .parse()) on a payload with a missing `appId`', () => {
    const payload = makeValidPayload()
    // @ts-expect-error -- intentionally malformed for the fail-loud test
    delete payload.games[0].appId
    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })
  ...
})
```
Apply the same one-behavior-per-test shape to the three new Wave-0 tests named in RESEARCH.md's "Phase Requirements → Test Map":
- `tauriConf.test.ts`: assert `bundle.active === true`, `bundle.targets` includes `nsis`/`appimage`/`dmg`, `plugins.updater.pubkey` is a non-empty string, `plugins.updater.endpoints` contains a URL matching `grayson-mitchell/GameLib` and does NOT contain `Heroic-Games-Launcher`.
- `cargoFeatures.test.ts`: read `Cargo.toml` as text (or a minimal TOML parse), assert the `keyring` dependency line's `features` array contains `apple-native`, `windows-native`, AND `sync-secret-service`.
- `releaseWorkflow.test.ts`: parse `.github/workflows/release-tauri.yml` as YAML, assert `on.push.tags` includes `'v*'`, and assert every matrix leg / `tauri-action` step sets `releaseDraft: true` and `prerelease: true` (a direct regression test for D-09, modeled on the same "assert required shape, fail loud on drift" discipline as `allowlist.test.ts`).

## Shared Patterns

### Fork-pointed feed / never-derive-from-defaults
**Source:** `electron-builder.yml` lines 24-31 (`publish` block + its explanatory comment)
**Apply to:** `src-tauri/tauri.conf.json`'s `plugins.updater.endpoints`, and `tauriConf.test.ts`'s negative assertion (`.not.toContain('Heroic-Games-Launcher')`).
```yaml
publish:
  provider: github
  owner: grayson-mitchell
  repo: GameLib
```
This is a named, previously-fixed regression class (`260720-q5n`) — the planner must treat any tool/generator that could re-derive the feed from `package.json.repository` (which deliberately still says Heroic) as a correctness bug, not a style nit.

### Argv-form spawn (never a shell string)
**Source:** `meta/buildSteamBridgeShims.ts` lines 151-168 (`spawnArgv`)
**Apply to:** `meta/buildSidecarSea.ts`'s `node --experimental-sea-config` and `postject` invocations.
Repo-wide convention (referenced in project memory as "T-24-06"): every build-script subprocess call passes `command` + `args: string[]` separately, never interpolates into a single shell string.

### `meta/*.ts` script entry guard
**Source:** `meta/buildSteamBridgeShims.ts` lines 238-248
**Apply to:** `meta/buildSidecarSea.ts`
```typescript
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
```

### Compile/build-step "fail loud, never silently continue" gate
**Source:** `meta/buildSteamBridgeShims.ts` lines 206-230 (`compileShim`)
**Apply to:** `meta/buildSidecarSea.ts`'s SEA build/inject steps — a non-zero exit code OR a missing expected output file must both throw. NOTE: this is orthogonal to D-04's signing graceful-skip — D-04 applies ONLY to the signing/notarization step (Windows/macOS certs absent = expected, no-op, warn); the sidecar compile step itself must never be allowed to silently produce a broken/missing binary.

### Capability permission scoping discipline (narrowest-necessary + documented reasoning)
**Source:** `src-tauri/capabilities/default.json` (existing `description` field's inline reasoning for `notification:allow-is-permission-granted` being granted ALONE instead of `notification:default`)
**Apply to:** the new `updater:default` and `shell:allow-execute` (scoped to `binaries/gamelib-sidecar`, `sidecar: true`) permission entries — add matching inline justification, do not grant broader defaults than what's actually invoked.

### Rust error-mapping convention (flat `String`, never log secrets)
**Source:** `src-tauri/src/main.rs` `dispatch_rust_channel` (e.g. lines 262-277, `keyring_get` arm)
```rust
Err(e) => {
    eprintln!("[shell] keyring {channel} failed: {e:?}");
    Err(format!("keyring:unavailable:{e}"))
}
```
**Apply to:** any new error path Phase 34 touches in `main.rs` (e.g. sidecar-spawn failure once the spawn source changes to `tauri-plugin-shell`) — keep the existing `.map_err(|e| e.to_string())` / prefixed-`String`-error convention, and never print the Steam token / signing secrets in a diagnostic line.

## No Analog Found

None — all 9 files/roles in this phase's scope have a strong existing analog in the codebase (the two structurally "genuinely new" pieces, the Windows CI signing conditional and the SEA build script's OS-conditional branches, still have a documented reference shape directly in `34-RESEARCH.md`'s Code Examples section, which the planner should treat as the fallback source when no repo analog exists for a specific sub-step).

## Metadata

**Analog search scope:** `.github/workflows/`, `.github/actions/`, `meta/`, `meta/__tests__/`, `src-tauri/` (all files), `src/backend/storeManagers/steam/bridge/__tests__/`, `electron-builder.yml`, `package.json` (scripts block)
**Files scanned:** `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `.github/workflows/draft-release-mac.yml`, `.github/workflows/draft-release-linux.yml`, `.github/actions/install-deps/action.yml` (listed, not read in full), `meta/buildSteamBridgeShims.ts`, `meta/__tests__/gen_vtables.test.ts`, `src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts`, `electron-builder.yml`, `package.json` (scripts)
**Pattern extraction date:** 2026-07-24

## PATTERN MAPPING COMPLETE

**Phase:** 34 - Tauri packaging — Windows and Linux builds, signing, auto-update
**Files classified:** 9
**Analogs found:** 9 / 9

### Coverage
- Files with exact analog (same file being extended, or same-convention sibling): 6
- Files with role-match analog (same role/intent, different tool/bundler): 3
- Files with no analog: 0

### Key Patterns Identified
- Every config file this phase touches (`tauri.conf.json`, `Cargo.toml`, `capabilities/default.json`, `main.rs`) already exists — this phase is additive editing of known files, not new-file creation, so the primary "analog" for each is its own current committed state plus the RESEARCH.md-sourced target shape.
- The fork-pointed-feed discipline (`electron-builder.yml`'s `publish` block, fixed under quick-task `260720-q5n`) is the load-bearing precedent for `plugins.updater.endpoints` — must be hardcoded, never derived, and negatively asserted in tests (`.not.toContain('Heroic')`).
- `meta/buildSteamBridgeShims.ts` is the definitive template for the new `meta/buildSidecarSea.ts`: argv-form spawn (never shell strings), exported pure argv-builder functions for testability, fail-loud compile gates (non-zero exit OR missing output both throw), and the `JEST_WORKER_ID`-guarded script entry point.
- No existing Windows release-CI precedent exists anywhere in the repo (confirmed by grep) — the Windows leg of `release-tauri.yml` and its CI-conditional signing override must be built from `34-RESEARCH.md`'s Code Examples directly, not ported from an existing GameLib workflow.
- Config-shape jest tests (`tauriConf`/`cargoFeatures`/`releaseWorkflow`) should follow `allowlist.test.ts`'s read-file-then-assert-shape, one-behavior-per-test style — no new test-infrastructure pattern needed.

### File Created
`/Users/graysonmitchell/Projects/GameLib/.planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
