---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
reviewed: 2026-07-24T21:05:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - .github/workflows/release-tauri.yml
  - .github/workflows/promote-updater-feed.yml
  - meta/buildSidecarSea.ts
  - meta/__tests__/buildSidecarSea.test.ts
  - src-tauri/tauri.conf.json
  - src/backend/__tests__/releaseWorkflow.test.ts
  - src/backend/__tests__/tauriConf.test.ts
findings:
  critical: 3
  warning: 9
  info: 3
  total: 15
status: issues_found
---

# Phase 34 (gap cycle 2): Code Review Report

**Reviewed:** 2026-07-24T21:05:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Gap cycle 2 (34-12..34-15) closes the four verification gaps as claimed at the
level of "the literal thing the gap named now exists in the file". It does not
close them at the level of "the pipeline would now produce a correct artifact."

Two of the three BLOCKERs below are *created* by GAP-1's fix, not merely
missed by it. Adding `pnpm exec electron-vite build` + `pnpm build-steam-bridge`
to the workflow is the change that first makes `build/` reachable by
tauri-action — and `build/` is where `buildSidecarSea.ts` already parks a
58 MB Node tarball, a 13 MB unminified full-backend bundle, and the raw SEA
blob. `frontendDist: "../build"` embeds all of it into the shipped binary
(CR-02). And `pnpm build-steam-bridge` writes to `public/bin/${process.arch}/`
using the *runner's* arch, which is the exact host-vs-target defect class that
gap cycle 1's CR-01 fix taught this codebase to avoid for the sidecar — now
reintroduced for the bridge helper on the `x86_64-apple-darwin` leg (CR-01).

GAP-2's fix is also partial: it converted two of the three PATH-dependent
spawns in `buildSidecarSea.ts` to `require.resolve` + `process.execPath` and
left `generateSeaBlob()` spawning a bare `'node'` (CR-03), which silently
breaks the file's own documented "the base binary must be the exact same Node
version as the blob" invariant.

On the tests: the scope note's warning about string/shape assertions is
justified. `releaseWorkflow.test.ts` Test 7 (`expect(source).toContain('$RANDOM')`)
is satisfied by the workflow's own comment prose at line 203 — it would pass
against a fixed heredoc delimiter (WR-04). `isWindowsSpawnable()` is dead
production code whose test asserts a regex against three hardcoded literals
and proves nothing about the build script (WR-05). No test parses either
workflow as YAML, executes any step, or inspects what actually lands in
`build/`.

I verified empirically where it mattered: `require.resolve` does resolve
correctly under the `esbuild ... | node` stdin invocation; esbuild's
`maybeOptimizePackage()` gate really is `os.platform() !== "win32" && !isYarn()`
so the platform branch's premise is accurate; `electron-vite`'s renderer
`outDir` really is `build` so GAP-1's step does populate `frontendDist`; both
workflow YAMLs parse.

Prior-round findings WR-09 (no concurrency control across four matrix legs +
two co-triggering Electron workflows) and IN-02 (`hostTriple()` mislabels
arm64 Windows/Linux) remain open and are **not** re-raised here per the scope
note — but note that CR-02 and the `latest.json` read-modify-write race are
downstream of WR-09 still being open.

## Critical Issues

### CR-01: GAP-1's new steam-bridge step is host-arch-driven — the `x86_64-apple-darwin` bundle ships an unreachable bridge helper

**File:** `.github/workflows/release-tauri.yml:97-100`
**Issue:**
34-12 added:

```yaml
      - name: Build steam bridge shims (macOS only)
        if: startsWith(matrix.platform, 'macos')
        run: pnpm build-steam-bridge
```

`meta/buildSteamBridgeShims.ts` writes its outputs to
`public/bin/${process.arch}/darwin/` (file header lines 11 and 19), where
`process.arch` is the **build host's** arch. `macos-latest` runners are
Apple Silicon, so both macOS matrix legs emit
`public/bin/arm64/darwin/steam-bridge-helper` and
`public/bin/arm64/darwin/steam_api.dll`. Vite copies `public/` into `build/`,
which becomes `frontendDist`.

At runtime the consumer resolves the same path from the **running process's**
arch:

```ts
// src/backend/constants/paths.ts:97,111
join(publicDir, 'bin', process.arch, 'darwin', 'steam_api.dll')
join(publicDir, 'bin', process.arch, 'darwin', 'steam-bridge-helper')
```

The `--target x86_64-apple-darwin` bundle ships an x86_64 SEA sidecar
(`GAMELIB_SIDECAR_TARGET_TRIPLE: x86_64-apple-darwin`), so `process.arch` is
`'x64'` there. It will look for `bin/x64/darwin/...`, find nothing, and the
macOS Steam bridge — the entire Phase 24 feature — is dead in the x86_64
build. The binaries are also arm64 Mach-O regardless of path, because `clang`
is invoked with no `-arch` flag.

This is the same host-vs-target bug family as the CR-01 that gap cycle 1 fixed
for the sidecar (`resolveTriple()` / `GAMELIB_SIDECAR_TARGET_TRIPLE`), and the
same one `buildSidecarSea.ts:315-337` documents at length — reintroduced by
this cycle's own fix, for a different artifact, with no test guarding it.

**Fix:** make the bridge build target-driven the same way the sidecar build
already is. Minimum viable:

```yaml
      - name: Build steam bridge shims (macOS only)
        if: startsWith(matrix.platform, 'macos')
        shell: bash
        env:
          GAMELIB_BRIDGE_TARGET_ARCH: ${{ matrix.sidecar_triple == 'x86_64-apple-darwin' && 'x64' || 'arm64' }}
        run: pnpm build-steam-bridge
```

and in `meta/buildSteamBridgeShims.ts`, replace `process.arch` in the output
path with `process.env.GAMELIB_BRIDGE_TARGET_ARCH || process.arch`, and pass
the matching `-arch x86_64` / `-arch arm64` to the `clang` invocation
(`buildHelperCompileArgv`, line ~117). Add a regression test mirroring
`resolveTriple`'s: an `x64` override must yield a `bin/x64/darwin/...` path.
Alternatively build a universal helper with `-arch x86_64 -arch arm64` and
resolve `bin/universal/darwin/...` on darwin only.

---

### CR-02: `frontendDist: "../build"` now embeds ~70 MB of SEA/Electron build intermediates — including the full unminified backend bundle — into every shipped installer

**File:** `.github/workflows/release-tauri.yml:108-110, 134-137` + `src-tauri/tauri.conf.json:7`
**Issue:**
Before GAP-1, tauri-action aborted with "Unable to find your web assets"
because nothing populated `build/`. GAP-1 fixes that — and in doing so makes
Tauri consume the *whole* `build/` tree, which is also
`buildSidecarSea.ts`'s scratch directory (lines 116-121, 178). Step ordering
in the workflow is: renderer build (line 110) → SEA build (line 137) →
tauri-action (line 227), so every SEA intermediate is present when Tauri
reads `frontendDist`.

Observed contents of `build/` on this machine after exactly that sequence:

```
build/node-dist/node-v26.2.0-darwin-x64.tar.gz   58 MB   (downloaded Node dist)
build/node-dist/node-v26.2.0-darwin-x64/                 (extracted node binary)
build/main/sidecar-sea-bundle.js                 13 MB   (full backend, unminified)
build/main/sidecar.js                           935 KB
build/main/main.js                              670 KB   (Electron main — unused by Tauri)
build/main/chunks/                                       (Electron main chunks)
build/main/decompressWorker.js
build/sea-config.json
build/sidecar-prep.blob                                  (the SEA blob)
```

Tauri embeds `frontendDist` into the compiled Rust binary via
`generate_context!`/`EmbeddedAssets` and serves it over `tauri://localhost`.
Consequences:

1. **Size** — the `x86_64-apple-darwin` leg embeds a 58 MB Node tarball plus
   a second copy of the sidecar (SEA blob) plus a third copy (the JS bundle)
   into the installer.
2. **Source disclosure** — `sidecar-sea-bundle.js` is the entire GameLib
   backend, esbuild-bundled with no `--minify`, including the Steam auth,
   token-store and depot code. It is fetchable from the webview.
3. **Aggravated by `"csp": null`** (`tauri.conf.json:22`) plus
   `"withGlobalTauri": true` (line 11) — there is no CSP restricting what the
   webview may fetch, and `window.__TAURI__` is exposed globally.

No test asserts anything about `frontendDist`'s contents; `tauriConf.test.ts`
only checks `bundle.*` keys.

**Fix:** stop overloading `build/` as both the frontend dist and the SEA
scratch dir. Either (a) point `frontendDist` at a dedicated renderer-only
directory, or (b) prune before bundling. Option (b) is the smallest change —
add a step between the SEA build and tauri-action:

```yaml
      - name: Prune non-frontend build intermediates before bundling
        shell: bash
        run: |
          rm -rf build/node-dist build/main build/preload
          rm -f build/sea-config.json build/sidecar-prep.blob
          test -f build/index.html   # fail loud if the prune ate the frontend
```

Better long-term: move `NODE_DIST_CACHE_DIR`, `SEA_CONFIG_PATH`,
`SEA_BLOB_PATH` and `SEA_BUNDLE_PATH` in `meta/buildSidecarSea.ts` out of
`build/` into a sibling `.sea-work/` (add to `.gitignore`), so the two trees
can never collide again. Add a test that enumerates the expected
`frontendDist` roots and fails on any unexpected top-level entry.

---

### CR-03: `generateSeaBlob()` still spawns a bare `'node'` from `PATH` — GAP-2's fix skipped the third spawn, silently allowing a version-skewed SEA binary

**File:** `meta/buildSidecarSea.ts:479-482`
**Issue:**
GAP-2 (34-13) converted `esbuild` and `postject` to `require.resolve` +
`process.execPath`, on the stated rationale that `process.execPath` "is never
looked up via `PATH`/PATHEXT and is therefore spawnable identically on every
OS" (lines 136-141). The third spawn in the same file was not converted:

```ts
const result = await spawnArgv('node', [
  '--experimental-sea-config',
  SEA_CONFIG_PATH
])
```

This is not just stylistic inconsistency — it breaks a correctness invariant
the file itself documents twice:

> "the base binary MUST match the Node version generating the SEA blob"
> (lines 396-399)
> "the SEA blob (`generateSeaBlob()`) is generated by THIS running `node`, so
> the base binary injected with it must be the exact same Node version."
> (lines 500-504)

`generateSeaBlob()` does **not** run under "THIS running node". It runs under
whatever `node` `PATH` resolves to. Meanwhile `copyNodeBinary()` uses
`process.execPath` for native builds and `nodeDistUrls(triple)` — defaulted to
`process.version` — for cross builds. Any divergence (nvm/fnm shim vs. the
node that `pnpm` spawned, Corepack, a `.nvmrc` mismatch, a `volta`-pinned
project) produces a SEA blob from Node X injected into a Node Y base binary.
The failure mode is a runtime crash or subtly wrong behavior in the shipped
sidecar, not a build error: `verifyBinaryArch()` gates the Mach-O *arch* but
nothing gates the *version*, and both the exit-code check and the
`existsSync()` check pass.

On this machine `process.execPath` is v26.2.0 (evidenced by the downloaded
`build/node-dist/node-v26.2.0-darwin-x64.tar.gz`), while `package.json`
`engines.node` is `>=22` — precisely the situation where a stale PATH `node`
is plausible.

**Fix:**

```ts
const result = await spawnArgv(process.execPath, [
  '--experimental-sea-config',
  SEA_CONFIG_PATH
])
```

and add a version gate so the invariant is enforced rather than merely
documented — in `copyNodeBinary()`, for the cross-build path, assert the
downloaded dist's version equals `process.version`; for the native path this
is automatic once the above change lands. A cheap regression test: assert the
comment-stripped source of `buildSidecarSea.ts` contains no
`spawnArgv('node'` / `spawnArgv("node"` literal (the same technique
`buildSidecarSea.test.ts:292` already uses for `.bin`).

## Warnings

### WR-01: `cert.pfx` escapes the `try/finally` guarantee — the step comment's "removed even when the import throws" claim is false

**File:** `.github/workflows/release-tauri.yml:171-179`
**Issue:** The step comment (lines 156-160) asserts:

> "cert.pfx exists on disk only for the duration of the import; the finally
> block below removes it immediately afterward, including when the import
> itself throws, so no retried/continued job step can find it left behind."

But `ConvertTo-SecureString` sits **outside** the `try`:

```powershell
Set-Content -Path cert.pfx -Value $bytes -AsByteStream        # <- file written
$securePw = ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force   # <- can throw HERE
try {
  Import-PfxCertificate ...
} finally {
  Remove-Item -Path cert.pfx -Force -ErrorAction SilentlyContinue
}
```

If `WINDOWS_CERTIFICATE_PASSWORD` is empty or unset, `ConvertTo-SecureString
-String ""` is a terminating error under GitHub's `pwsh` shell
(`$ErrorActionPreference = 'Stop'`), the script aborts before entering the
`try`, and the PKCS#12 private key remains in the runner workspace. Practical
exposure is bounded because a failed step aborts the job — but the documented
invariant is simply not true, and this is exactly the half-configured-secrets
scenario GAP-4 set out to make safe.

`releaseWorkflow.test.ts:150` (`expect(source).toContain('finally {')`) and
`:145` do not catch this — they only check that a `finally` exists somewhere
after `Import-PfxCertificate`.

**Fix:** move every statement that can throw after the file write inside the
`try`, or write the file inside the `try`:

```powershell
$bytes = [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE)
$securePw = ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
try {
  Set-Content -Path cert.pfx -Value $bytes -AsByteStream
  Import-PfxCertificate -FilePath cert.pfx -CertStoreLocation Cert:\CurrentUser\My -Password $securePw
} finally {
  Remove-Item -Path cert.pfx -Force -ErrorAction SilentlyContinue
}
```

Tighten the test to assert `Set-Content -Path cert.pfx` appears *after*
`try {`.

---

### WR-02: GAP-4's "both secrets required" gate still ignores `WINDOWS_CERTIFICATE_PASSWORD` — the D-04 "CI never fails on missing certs" invariant is still breakable

**File:** `.github/workflows/release-tauri.yml:169`
**Issue:** The fix comment (lines 189-197) claims the three-branch shell
"restores" D-04's locked invariant. It restores it for exactly one of the
three Windows secrets. The cert-import step's gate is:

```yaml
if: matrix.platform == 'windows-latest' && env.WINDOWS_CERTIFICATE != '' && env.WINDOWS_CERT_THUMBPRINT != ''
```

`WINDOWS_CERTIFICATE_PASSWORD` is not checked anywhere. Enrolling cert +
thumbprint but not the password — the exact "half-configured secret set" the
gap names — hard-fails the `windows-latest` leg with an opaque PowerShell
binding error, which is the same class of failure GAP-4 was raised to
eliminate. `releaseWorkflow.test.ts` Test 5 asserts only the two secrets that
were fixed, so the gap is invisible to the suite.

**Fix:** require all three secrets in both gates, and route the
cert-but-no-password case through the existing warn-and-skip branch:

```yaml
if: matrix.platform == 'windows-latest' && env.WINDOWS_CERTIFICATE != '' && env.WINDOWS_CERT_THUMBPRINT != '' && env.WINDOWS_CERTIFICATE_PASSWORD != ''
```

```bash
elif [ "${{ matrix.platform }}" = "windows-latest" ] && [ -n "$WINDOWS_CERTIFICATE" ]; then
  echo "::warning::WINDOWS_CERTIFICATE is set but WINDOWS_CERT_THUMBPRINT and/or WINDOWS_CERTIFICATE_PASSWORD is missing; shipping unsigned"
  VALUE="${{ matrix.args }}"
```

Extend Test 5 to assert the third secret.

---

### WR-03: `TAURI_SIGNING_PRIVATE_KEY` is the only secret with no graceful-skip and no warn step, yet `createUpdaterArtifacts: true` is unconditional

**File:** `src-tauri/tauri.conf.json:37` + `.github/workflows/release-tauri.yml:58-59`
**Issue:** The workflow header (lines 21-26) states the locked invariant:
"Every signing path below is conditional on the relevant secret being
non-empty; the default (secrets absent) is 'skip signing, log a clear
warning, ship an unsigned artifact, job stays green'."

That is implemented for `APPLE_CERTIFICATE` (line 143) and
`WINDOWS_CERTIFICATE` (line 150). It is **not** implemented for
`TAURI_SIGNING_PRIVATE_KEY`, and `bundle.createUpdaterArtifacts` is a static
`true` with a committed `plugins.updater.pubkey`. With a pubkey present and
`TAURI_SIGNING_PRIVATE_KEY` empty, `tauri build` errors out rather than
skipping — failing **all four** matrix legs, not just one, and producing no
`latest.json` for `promote-updater-feed.yml` to promote. This asymmetry is
undetectable from the repo (secret enrollment is not inspectable) and is not
covered by any test or warning step, on a pipeline explicitly marked
`UNPROVEN LIVE`.

**Fix:** add a preflight step matching the two existing warning steps, so a
missing updater key is a loud, named failure instead of an opaque tauri
error:

```yaml
      - name: Fail fast with a clear message if the updater signing key is absent
        if: env.TAURI_SIGNING_PRIVATE_KEY == ''
        shell: bash
        run: |
          echo "::error::TAURI_SIGNING_PRIVATE_KEY is not enrolled, but tauri.conf.json sets createUpdaterArtifacts: true and commits an updater pubkey. tauri build will fail on every matrix leg. Enrol the secret, or set createUpdaterArtifacts: false."
          exit 1
```

Add a `releaseWorkflow.test.ts` assertion that a `TAURI_SIGNING_PRIVATE_KEY == ''`
guard exists whenever `tauri.conf.json` has `createUpdaterArtifacts: true`.

---

### WR-04: `releaseWorkflow.test.ts` Test 7 is satisfied by the workflow's own comment prose — it would pass against a fixed heredoc delimiter

**File:** `src/backend/__tests__/releaseWorkflow.test.ts:295-298`
**Issue:**

```ts
test('Test 7: the heredoc delimiter is randomised via $RANDOM', () => {
  const source = loadReleaseWorkflow()
  expect(source).toContain('$RANDOM')
})
```

`loadReleaseWorkflow()` is the **unstripped** file, and
`release-tauri.yml:203-204` literally reads:

> "All three branches now emit via a heredoc whose delimiter is randomised
> per run from bash's `$RANDOM` ..."

So the assertion is satisfied by the comment alone. Replacing
`DELIM="ARGS_${RANDOM}${RANDOM}${RANDOM}"` with `DELIM="ARGS_EOF"` — the
exact regression this test exists to prevent — leaves it green. The file's
own sibling describe block already established the comment-stripping helper
(`loadStrippedReleaseWorkflow`, line 239) and its docstring at lines 233-237
explains precisely why stripping is required here; Test 7 just doesn't use it.

Test 3 (lines 264-268) has the same defect in a weaker form: both
`toContain('elif')` and `/::warning::[^\n]*WINDOWS_CERT_THUMBPRINT/` run
against the unstripped source.

**Fix:**

```ts
test('Test 7: the heredoc delimiter is randomised via $RANDOM', () => {
  const stripped = loadStrippedReleaseWorkflow()
  expect(stripped).toMatch(/DELIM=.*\$\{?RANDOM\}?/)
  expect(stripped).not.toMatch(/args<<[A-Za-z_][A-Za-z0-9_]*\s*$/m)  // no literal delimiter
})
```

and switch Test 3 to `loadStrippedReleaseWorkflow()`. Same treatment for
`tauriConf.test.ts` tests 3-6 and 8, which are all unstripped `toContain`
assertions against files whose comments discuss the same strings.

---

### WR-05: `isWindowsSpawnable()` is dead production code; its test is a tautology over three hardcoded literals

**File:** `meta/buildSidecarSea.ts:165-174`, `meta/__tests__/buildSidecarSea.test.ts:262-266`
**Issue:** `isWindowsSpawnable` is exported and never called by any
production code path — grep across the repo returns only its own definition
and the test file. `spawnArgv()`, `buildEsbuildArgv()`, `buildPostjectArgv()`
and `copyNodeBinary()` all ignore it. Its own docstring admits its purpose is
documentary ("Pure predicate documenting exactly why...").

Its headline test asserts a regex against string constants that appear
nowhere in the build script:

```ts
expect(isWindowsSpawnable('node_modules\\.bin\\postject')).toBe(false)
expect(isWindowsSpawnable('node_modules/.bin/esbuild')).toBe(false)
expect(isWindowsSpawnable('C:\\Program Files\\nodejs\\node.exe')).toBe(true)
```

This tests `/\.(exe|cmd|bat|com)$/i` against literals. It cannot regress when
the build script regresses. The genuine GAP-2 guard is the separate
`'the source contains no node_modules/.bin path construction'` test (line 292),
which does inspect real source. `isWindowsSpawnable` adds an exported API
surface, a maintenance burden, and — worse — the appearance of coverage where
there is none.

**Fix:** either delete `isWindowsSpawnable` and its two tests (the source-scan
test already covers the regression), or make it load-bearing by asserting it
inside `spawnArgv()`:

```ts
function spawnArgv(command: string, args: string[]) {
  if (process.platform === 'win32' && !isWindowsSpawnable(command)) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/CR-02): "${command}" has no Windows-executable ` +
        `extension and cannot be spawned via CreateProcess without a shell.`
    )
  }
  ...
}
```

That turns the predicate into a real runtime gate (and would, incidentally,
have caught CR-03's bare `'node'` on Windows).

---

### WR-06: `buildEsbuildArgv()` reads `process.platform` directly, so its Windows-only branch is untestable off Windows — the one branch GAP-2 exists to fix is the one never exercised

**File:** `meta/buildSidecarSea.ts:243-259`, `meta/__tests__/buildSidecarSea.test.ts:229-245`
**Issue:** `buildPostjectArgv(binaryPath, blobPath, platform = process.platform)`
and `buildCodesignArgv(binaryPath, platform = process.platform)` both accept an
injectable platform, and their tests exercise darwin/win32/linux
unconditionally. `buildEsbuildArgv()` takes no parameters and branches on
`process.platform` internally (line 255). Its test is therefore forced into:

```ts
if (process.platform === 'win32') { /* assert execPath branch */ }
else { /* assert direct-spawn branch */ }
```

On macOS/Linux dev machines and on three of the four CI legs, the `win32`
branch is never evaluated. GAP-2 was raised *because* Windows behavior had
never been validated; the fix reintroduces a Windows-only code path with the
same "green everywhere but Windows" blind spot.

The branch's premise is correct (I confirmed
`node_modules/esbuild/install.js:223` gates on
`os2.platform() !== "win32" && !isYarn()`), but the premise is a runtime
property of a third-party installer, wrapped in a `try/catch` (lines 226-229)
that silently leaves the JS wrapper in place on failure and is skipped
entirely when `ESBUILD_BINARY_PATH` is set (line 250). A `process.platform`
check is a proxy for "is this file a native binary", not a test of it.

**Fix:** parameterize and detect rather than assume:

```ts
export function buildEsbuildArgv(
  platform: NodeJS.Platform | string = process.platform
): { command: string; args: string[] } {
  const esbuildCli = resolveEsbuildCli()
  const flags = [ /* unchanged */ ]
  return platform === 'win32'
    ? { command: process.execPath, args: [esbuildCli, ...flags] }
    : { command: esbuildCli, args: flags }
}
```

then assert both branches unconditionally:

```ts
expect(buildEsbuildArgv('win32').command).toBe(process.execPath)
expect(buildEsbuildArgv('win32').args[0]).toMatch(/esbuild[\\/]bin[\\/]esbuild$/)
expect(buildEsbuildArgv('linux').command).toMatch(/esbuild[\\/]bin[\\/]esbuild$/)
```

More robust still: sniff the resolved file's first bytes for a `#!` shebang
and route through `process.execPath` iff it is a script, on every OS. That
removes the dependency on esbuild's installer behavior entirely.

---

### WR-07: `promote-updater-feed.yml` treats every `gh release download` failure as "nothing to promote" — auth, network and rate-limit failures silently freeze the updater feed

**File:** `.github/workflows/promote-updater-feed.yml:64-71`
**Issue:**

```bash
if gh release download "$TAG" --pattern 'latest.json' --dir feed --clobber; then
  echo "found=true" >> "$GITHUB_OUTPUT"
else
  echo "::notice::No latest.json on the published release; nothing to promote"
  echo "found=false" >> "$GITHUB_OUTPUT"
fi
```

The `else` branch is reached for *any* non-zero exit: no matching asset (the
intended case, per the comment at lines 55-58), but equally an expired token,
a 5xx from the API, a secondary rate limit, or a transient network fault.
`found=false` then skips all three downstream steps, the job goes green, and
the only signal is a `::notice::` claiming a specific cause that may be
false. Because this is the sole mechanism keeping
`/releases/download/updater/latest.json` current, a silent failure here means
every installed client is permanently pinned to the previous version's
manifest with no alarm anywhere.

**Fix:** distinguish the expected case from the unexpected one:

```bash
if gh release view "$TAG" --json assets --jq '.assets[].name' > names.txt; then
  if grep -qx 'latest.json' names.txt; then
    gh release download "$TAG" --pattern 'latest.json' --dir feed --clobber
    echo "found=true" >> "$GITHUB_OUTPUT"
  else
    echo "::notice::No latest.json asset on $TAG (Electron-only release); nothing to promote"
    echo "found=false" >> "$GITHUB_OUTPUT"
  fi
else
  echo "::error::Could not read assets for $TAG -- the updater feed was NOT updated"
  exit 1
fi
```

Also consider a `::warning::` when `found=false`, so a leg that should have
produced `latest.json` but didn't is visible in the run summary rather than
buried at notice level.

---

### WR-08: the promotion has no version-ordering check — publishing an older draft rewrites the feed with an older manifest

**File:** `.github/workflows/promote-updater-feed.yml:46, 105-108`
**Issue:** The only guard is `startsWith(github.event.release.tag_name, 'v')`.
Because `release-tauri.yml` creates **draft** releases held for human review
(D-09), it is normal for several unpublished drafts to accumulate. Publishing
them out of order — or publishing a hotfix branch's older tag after a newer
one — unconditionally clobbers the feed:

```bash
gh release upload updater feed/latest.json --clobber
```

`tauri-plugin-updater` will not *install* a downgrade, but the feed
nonetheless stops advertising the newest build until someone re-publishes,
with no warning. There is also no assertion that the promoted manifest's
`version` matches `$TAG`, so a stale `latest.json` left on a release from a
retried run would be promoted verbatim.

**Fix:** compare versions before clobbering. Note `tauriConf.test.ts` test 7
forbids `jq ` in this workflow (as a signature-integrity guard against
rewriting the file) — reading with `jq -r` does not rewrite it, but to stay
inside the letter of that guard use `gh`'s built-in `--jq` or a node one-liner:

```bash
NEW=$(node -e "process.stdout.write(require('./feed/latest.json').version)")
if gh release download updater --pattern latest.json --dir current --clobber 2>/dev/null; then
  CUR=$(node -e "process.stdout.write(require('./current/latest.json').version)")
  if [ "$NEW" = "$CUR" ] || [ "$(printf '%s\n%s\n' "$CUR" "$NEW" | sort -V | tail -1)" != "$NEW" ]; then
    echo "::warning::Refusing to promote $NEW over the current feed version $CUR"
    exit 0
  fi
fi
gh release upload updater feed/latest.json --clobber
```

Tighten test 7's guard from `not.toContain('jq ')` to something that targets
*writes* (e.g. no `jq ... >` redirect into `latest.json`), so integrity
checking is not accidentally forbidden along with rewriting.

---

### WR-09: the "audit trail" checksum step is decorative — computed, printed, never compared or retained

**File:** `.github/workflows/promote-updater-feed.yml:76-79`
**Issue:**

```yaml
      - name: Record the manifest checksum (audit trail)
        if: steps.download.outputs.found == 'true'
        shell: bash
        run: sha256sum feed/latest.json
```

The comment calls this "an auditable record linking the feed's current
contents to the release tag it was copied from." It writes one line to a job
log that expires with the default retention, is not attached to the release,
not compared against anything before or after upload, and not asserted by any
test. It provides no tamper detection: the upload happens two steps later
with no re-hash, so a modified file would not be caught. As written it is a
no-op that reads as a control.

**Fix:** either make it real — hash it and persist the digest durably:

```yaml
      - name: Record and verify the manifest checksum
        if: steps.download.outputs.found == 'true'
        shell: bash
        env:
          TAG: ${{ github.event.release.tag_name }}
        run: |
          DIGEST=$(sha256sum feed/latest.json | cut -d' ' -f1)
          echo "Promoting $TAG latest.json sha256=$DIGEST" >> "$GITHUB_STEP_SUMMARY"
```

and re-hash after `gh release upload` to confirm the round trip — or delete
the step and drop the "audit trail" claim from the comment.

## Info

### IN-01: `"csp": null` plus `"withGlobalTauri": true` leaves the webview unrestricted

**File:** `src-tauri/tauri.conf.json:11, 21-23`
**Issue:** `app.security.csp` is `null`, which disables Content Security Policy
injection entirely, while `withGlobalTauri: true` exposes `window.__TAURI__` to
every script in the webview. Any injected script (a compromised CDN asset, a
stored-XSS payload rendered by the React app, or a game description fetched
from the Steam store API) has full access to the Tauri command surface. This
predates gap cycle 2 and may be a deliberate Electron-parity choice, but it
materially amplifies CR-02 (the backend bundle is fetchable from that same
webview) and should be an explicit, recorded decision rather than a default.
**Fix:** set a restrictive `csp` (at minimum `default-src 'self'` plus the
specific `img-src`/`connect-src` origins the store/artwork code needs), and
drop `withGlobalTauri` if the renderer uses the `@tauri-apps/api` package
rather than the global.

---

### IN-02: three near-identical comment-stripping helpers duplicated across the test suite

**File:** `src/backend/__tests__/tauriConf.test.ts:59-64`, `src/backend/__tests__/releaseWorkflow.test.ts:239-244`, `meta/__tests__/buildSidecarSea.test.ts:287-290`
**Issue:** `stripComments`, `loadStrippedReleaseWorkflow` and
`loadStrippedBuildScript` implement the same idea three different ways with
three different fidelities: the two YAML ones drop `#`-leading lines only
(missing trailing inline comments), the TS one strips `/* */` blocks and
`//`-leading lines (missing trailing `//` comments and mishandling `*/` inside
string literals). WR-04 exists partly because this helper is available but
inconsistently applied. **Fix:** extract one shared
`src/backend/__tests__/helpers/stripComments.ts` exposing
`stripHashComments(text)` and `stripJsComments(text)`, and use it everywhere a
`toContain` assertion is made against a heavily-commented file.

---

### IN-03: `obtainCrossNodeBinary()` hardcodes `tar -xzf` while `nodeDistUrls()` can return a `.zip`, and `nodeDistName()` supports a triple no caller can reach

**File:** `meta/buildSidecarSea.ts:373-389, 416, 564-570`
**Issue:** `nodeDistUrls()` correctly returns `node-<v>-win-x64.zip` for the
Windows triple (tested at `buildSidecarSea.test.ts:164-168`), but
`obtainCrossNodeBinary()` unconditionally extracts with `tar -xzf`. The only
thing preventing a tar-on-zip failure is the `triplePlatform(triple) === 'win32'`
early throw at line 506 — a guard placed for a different reason. Separately,
`nodeDistName()` maps `aarch64-unknown-linux-gnu` → `linux-arm64` but no
matrix leg, `expectedMachoArch()` case, or CI path ever produces that triple;
adding an arm64-Linux leg later would work by accident until it doesn't.
**Fix:** derive the extraction command from the archive name rather than the
platform (`archiveName.endsWith('.zip') ? unzip : tar`), and either wire the
arm64-Linux triple into the matrix or drop it from `nodeDistName()` so the
supported set is single-sourced.

---

_Reviewed: 2026-07-24T21:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
