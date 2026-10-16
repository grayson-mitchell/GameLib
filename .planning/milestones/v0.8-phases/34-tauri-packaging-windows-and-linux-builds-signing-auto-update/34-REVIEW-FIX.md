---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
fixed_at: 2026-07-24T22:40:00Z
review_path: .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 34: Code Review Fix Report

**Fixed at:** 2026-07-24T22:40:00Z
**Source review:** `.planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 12
- Fixed: 12
- Skipped: 0

**Test status:** the phase's five named suites (plus
`meta/__tests__/buildSteamBridgeShims.test.ts`, which CR-01 pulls into scope) run
**182 passed / 0 failed**, up from 111. `pnpm exec tsc --noEmit` is clean. ESLint
reports no new errors (2 pre-existing `no-redundant-type-constituents` errors remain
on `buildPostjectArgv`/`buildCodesignArgv`, untouched by this pass).

**On the test-weakness note (WR-04/WR-05):** every fix that had a corresponding test
got a test that *executes* the changed path rather than another shape assertion. Two
new mechanisms carry that:
- `src/backend/__tests__/helpers/workflowSteps.ts` extracts a step's literal `run: |`
  body and runs it the way GitHub does (`bash --noprofile --norc -eo pipefail`) in a
  throwaway directory. Every helper throws instead of returning an empty/default value,
  so a missing step cannot make its caller's assertions vacuous.
- Workflow steps that call `gh` are exercised against a stub `gh` on `PATH`, driven by
  env vars, with a call log — so "did it even attempt the download?" is assertable.

Both new BLOCKER fixes were spot-checked RED-then-GREEN: reverting
`DELIM="ARGS_${RANDOM}..."` to a fixed literal fails the strengthened Test 7 *and* the
executed delimiter test (the old assertion stayed green against exactly that change).

## Fixed Issues

### CR-01: GAP-1's steam-bridge step was host-arch-driven

**Files modified:** `meta/buildSteamBridgeShims.ts`, `.github/workflows/release-tauri.yml`, `meta/__tests__/buildSteamBridgeShims.test.ts`, `src/backend/__tests__/releaseWorkflow.test.ts`
**Commit:** `5af99577`
**Applied fix:** Added `resolveBridgeArch(env)` (mirrors `resolveTriple()`) reading
`GAMELIB_BRIDGE_TARGET_ARCH` with a `process.arch` fallback, and made it the default
argument of `bundledBinDir`/`helperOutputPath`/`shimOutputPath`/`steamAppIdOutputPath`/
`buildShimCompileArgv`. Added `machoArchFlag()` and wired an explicit `clang -arch
x86_64|arm64` into `buildHelperCompileArgv`, so the emitted Mach-O really is the
architecture its bundled path claims. The workflow sets the env var per macOS leg via
`${{ matrix.sidecar_triple == 'x86_64-apple-darwin' && 'x64' || 'arm64' }}`.

Tests: the regression test drives the **default-argument** path (exactly how
`compileHelper()`/`compileShim()` call these helpers), not just the explicit form; a
source-scan asserts `process.arch` now appears exactly once in the whole file, as
`resolveBridgeArch`'s fallback. On the workflow side the test *evaluates* the GitHub
ternary for both macOS triples and asserts the arch it yields, and cross-checks that
the env var the workflow sets is the one the build script reads.

---

### CR-02: `frontendDist: "../build"` embedded ~70 MB of build intermediates

**Files modified:** `.github/workflows/release-tauri.yml`, `src/backend/__tests__/releaseWorkflow.test.ts`
**Commit:** `309ccb7c`
**Applied fix:** Took the review's option (b) — a prune step between the SEA build and
tauri-action that removes `build/node-dist`, `build/main`, `build/preload`,
`build/sea-config.json`, `build/sidecar-prep.blob`, then fail-loud guards
(`test -f build/index.html`, and `test -d build/bin` on the macOS legs, which doubles
as a CI-side interlock for CR-01). Verified `emptyOutDir: false` on the renderer and
that `index.html` references only `/src/frontend/index.tsx`, so nothing Tauri loads
lives under the pruned paths.

Chose (b) over (a)/`.sea-work/` deliberately: relocating the SEA scratch dir would not
remove `build/main/main.js` + `build/main/chunks/` (Electron main output that Tauri
never loads but would still embed), so the prune is the strictly larger fix. The
review's "better long-term" relocation remains available and is not foreclosed.

Tests: the prune step's real shell body is **executed** against a synthetic `build/`
tree mirroring the contents the review observed. Five cases: intermediates gone;
renderer output + bundled bridge assets intact; fails loudly when `index.html` is
missing; fails loudly on a macOS leg with no `build/bin`; and does *not* fire that
guard on non-macOS legs.

---

### CR-03: `generateSeaBlob()` spawned a bare `'node'` from `PATH`

**Files modified:** `meta/buildSidecarSea.ts`, `meta/__tests__/buildSidecarSea.test.ts`
**Commit:** `66bb0410`
**Applied fix:** Introduced an exported `buildSeaBlobArgv()` (matching the file's
existing pure-argv-builder convention) returning `process.execPath` +
`['--experimental-sea-config', SEA_CONFIG_PATH]`, and had `generateSeaBlob()` consume
it. This makes the file's twice-documented "the base binary must match the Node version
generating the blob" invariant true by construction.

Did **not** add the extra cross-build version assertion the review floated: `nodeDistUrls()`
already defaults `version` to `process.version` and no production caller overrides it,
so the cross path is same-version by construction once the native path is fixed. The
test asserts that coupling directly (`nodeDistUrls(hostTriple()).archiveName` contains
`process.version`) rather than adding a redundant runtime check.

Tests: exercises the exported builder the production path now uses (not just a source
scan), plus a comment-stripped source scan for `spawnArgv('node'` and a
`seaBlobArgv.command` consumption check mirroring the existing `postjectArgv.command` guard.

---

### WR-01: `cert.pfx` escaped the `try/finally` guarantee

**Files modified:** `.github/workflows/release-tauri.yml`, `src/backend/__tests__/releaseWorkflow.test.ts`
**Commit:** `513010a3`
**Applied fix:** Moved `Set-Content -Path cert.pfx` inside the `try`, leaving
`ConvertTo-SecureString` (the one statement that can throw on a half-configured secret
set) before it, while nothing is on disk yet. Corrected the step comment, which had
asserted a guarantee the code did not provide.

Tests: assert containment inside the step's real run block — *every* `cert.pfx`
occurrence must sit after `try {`, the write must follow `try {`,
`ConvertTo-SecureString` must precede the write, and the `finally` removal must follow
`Import-PfxCertificate`. The old `toContain('finally {')` could not distinguish a
finally that covers the write from one that does not.

---

### WR-02: the "both secrets" gate still ignored `WINDOWS_CERTIFICATE_PASSWORD`

**Files modified:** `.github/workflows/release-tauri.yml`, `src/backend/__tests__/releaseWorkflow.test.ts`
**Commit:** `5740d2ab`
**Applied fix:** Added `env.WINDOWS_CERTIFICATE_PASSWORD != ''` to the cert-import
step's `if:` and `[ -n "$WINDOWS_CERTIFICATE_PASSWORD" ]` to the build-args signing
branch; the warn-and-skip branch's message now names both missing-secret cases. Test 1
and Test 5 extended to the third secret.

Tests: the three-branch shell is **executed** for every secret combination with
`$GITHUB_OUTPUT` captured and parsed — all three present merges the override;
cert+thumbprint-without-password warns, ships unsigned and stays green (the WR-02 case);
cert+password-without-thumbprint likewise; no secrets passes `matrix.args` through
untouched; a non-Windows leg never merges an override. Two extra executed cases cover
the delimiter randomisation and prove a newline-bearing thumbprint lands inside the
heredoc body rather than injecting a sibling step output.

---

### WR-03: `TAURI_SIGNING_PRIVATE_KEY` had no graceful-skip and no warning

**Files modified:** `.github/workflows/release-tauri.yml`, `src/backend/__tests__/releaseWorkflow.test.ts`
**Commit:** `2f5405d0`
**Applied fix:** Added the review's preflight step, placed immediately after
`actions/checkout` so the failure is fast and cheap rather than surfacing as an opaque
`tauri build` error after the renderer + Rust + SEA builds. The error message names the
two concrete remedies (enrol the secret, or set `createUpdaterArtifacts: false`).

Note this is a deliberate behaviour choice, not a silent one: it does **not** weaken
D-04, which governs OS code-signing certs. The updater key genuinely has no skip path
while `createUpdaterArtifacts: true` and a pubkey are committed, so the honest options
were "named early failure" or "make updater artifacts conditional"; the review
recommended the former and it is the smaller change.

Tests: the assertion is expressed as a *coupling* — `createUpdaterArtifacts: true`
implies the guard exists, fails with `::error::` + `exit 1`, and appears before the
renderer/SEA/tauri-action steps. Flipping `createUpdaterArtifacts` to `false` therefore
legitimately retires the guard instead of leaving a stale test.

---

### WR-04: assertions satisfied by the workflow's own comment prose

**Files modified:** `src/backend/__tests__/releaseWorkflow.test.ts`, `src/backend/__tests__/tauriConf.test.ts`
**Commit:** `6b522fc7`
**Applied fix:** Test 7 now runs against the comment-stripped workflow, asserts
`DELIM=.*${RANDOM}`, and additionally forbids a fixed literal delimiter
(`args<<IDENT$`). Test 3 switched to the stripped source. In `tauriConf.test.ts`, tests
1 and 3–8 now read through `stripComments()`. The private stripper in the GAP-4 describe
block was collapsed onto the file-level helper so it is reachable from every assertion —
the availability-but-not-application gap the review identified.

Verified RED-then-GREEN: replacing the randomised delimiter with `ARGS_EOF` fails Test 7
and the executed delimiter test; the pre-fix Test 7 stayed green against that same change.

---

### WR-05: `isWindowsSpawnable()` was dead code with a tautological test

**Files modified:** `meta/buildSidecarSea.ts`, `meta/__tests__/buildSidecarSea.test.ts`
**Commit:** `34e7eb2f`
**Applied fix:** Took the review's **first** option — deleted the predicate and its two
tests — rather than the "make it load-bearing inside `spawnArgv()`" option. Rationale
recorded here because it is a judgement call: the predicate's premise ("`CreateProcess`
can only run a path carrying `.exe/.cmd/.bat/.com`") is accurate for explicit
extensionless paths but **not** for bare command names, which libuv resolves through
`PATH` + an extension list. A blanket assertion inside `spawnArgv()` would therefore
have hard-failed legitimate bare-name spawns (`tar` in `obtainCrossNodeBinary()` on a
Windows host) on a premise that is false for that case. Encoding a false premise as a
runtime throw is worse than the dead code it replaces. The genuine guards — the
`node_modules/.bin` source scan, CR-03's bare-`'node'` source scan, and the
commands-exist-on-disk assertions — all inspect the argv this file really executes.

Tests: the surviving test was rewritten from a platform-conditional
`isWindowsSpawnable(...)` check into an unconditional "every command this script spawns
resolves to a file that exists on disk", now covering postject, esbuild **and** the new
SEA-blob argv.

---

### WR-06: `buildEsbuildArgv()`'s Windows branch was untestable off Windows

**Files modified:** `meta/buildSidecarSea.ts`, `meta/__tests__/buildSidecarSea.test.ts`
**Commit:** `e6c40d81` (plus lint follow-up `270d3ae2`)
**Applied fix:** Parameterized as `buildEsbuildArgv(platform: NodeJS.Platform =
process.platform)`, matching `buildPostjectArgv`/`buildCodesignArgv`. (Typed
`NodeJS.Platform` rather than the siblings' `NodeJS.Platform | string`, which ESLint
flags as a redundant union — the two sibling signatures keep their pre-existing errors
and were left untouched.)

Did not adopt the "sniff the file's first bytes for a `#!` shebang" variant: it changes
behaviour on all platforms based on a runtime probe, which is a larger change than this
finding warrants and would need its own live validation on the very leg that has never
run. Parameterization removes the blind spot the finding names; the shebang idea is
noted here as an available follow-up.

Tests: both branches are now asserted unconditionally on every host — `win32` routes
through `process.execPath` with the CLI as `args[0]`; `darwin`/`linux` spawn the binary
directly; the two branches carry identical flags; and the default parameter still
follows the host.

---

### WR-07: every `gh release download` failure read as "nothing to promote"

**Files modified:** `.github/workflows/promote-updater-feed.yml`, `src/backend/__tests__/helpers/workflowSteps.ts`, `src/backend/__tests__/tauriConf.test.ts`, `src/backend/__tests__/releaseWorkflow.test.ts`
**Commit:** `55269008`
**Applied fix:** The step now reads the asset list first (`gh release view "$TAG" --json
assets`); an unreadable release is a hard `::error::` + `exit 1`, and only a genuinely
absent `latest.json` takes the skip path. Implemented the asset check as a `node`
one-liner rather than the review's `--jq`: `tauriConf.test.ts` test 7 forbids `jq ` in
this workflow as a signature-integrity guard, and `--jq '...'` contains that substring.
Using `node` keeps that guard **intact** rather than loosening it (see WR-08 below).

This commit also extracted `src/backend/__tests__/helpers/workflowSteps.ts` and moved
`releaseWorkflow.test.ts` onto it, so both workflow test files share one stripper and
one step-executor (also addresses IN-02's duplication, which was out of scope).

Tests: the step is **executed** against a stub `gh`. Asset present → downloaded,
`found=true`. Electron-only release → `found=false`, `::notice::`, and the call log
proves no download was even attempted. `gh release view` failing (exit 1 and exit 8) →
job fails, `::error::` with no misleading `::notice::`, no `found=` output, no feed file.
A download failing after the asset was confirmed present also fails the job.

---

### WR-08: no version-ordering check before clobbering the feed

**Files modified:** `.github/workflows/promote-updater-feed.yml`, `src/backend/__tests__/tauriConf.test.ts`
**Commit:** `2c30f2c8`
**Applied fix:** The publish step reads the incoming manifest's `version`, refuses to
promote a strict downgrade (`sort -V` comparison against the current feed manifest,
`::warning::` + `promoted=false` + `exit 0`), and warns when the manifest's version does
not match the published tag. Emits a `promoted` step output that WR-09's verification
gates on.

Two deliberate deviations from the review's snippet, both recorded because they are
judgement calls:
1. **Equal versions are promoted, not refused.** The upload is a byte-identical
   `--clobber`, so re-running after a partial or interrupted upload must stay possible;
   only a strict downgrade is a real hazard.
2. **Tag/version mismatch warns, it does not fail.** A prerelease tag (`v0.7.0-rc1`)
   legitimately differs from `tauri.conf.json`'s `version`, so a hard failure would
   block valid promotions. A manifest with *no* version at all **is** a hard failure.

`tauriConf.test.ts` test 7's `not.toContain('jq ')` guard was left **unchanged** (the
review suggested loosening it): the node-based reads never needed `jq`, so the stricter
guard costs nothing and keeps the "never rewrite the signed manifest" invariant tight.

Tests: the publish step is **executed** against a stub `gh`. Newer manifest promoted;
older manifest refused with the feed left in place and no upload call; ordering proven
semantic not lexicographic (`0.10.0` vs `0.9.0`, both directions); first-ever promotion
with no feed-holder release uploads unconditionally; same-version re-promotion allowed;
tag/version mismatch warns but still promotes; matching pair promotes silently; a
version-less manifest is refused with `::error::`.

---

### WR-09: the "audit trail" checksum step was decorative

**Files modified:** `.github/workflows/promote-updater-feed.yml`, `src/backend/__tests__/tauriConf.test.ts`
**Commit:** `4ed656a7`
**Applied fix:** The checksum step now exports the digest as a step output and writes it
to `$GITHUB_STEP_SUMMARY` (durable, unlike an expiring job log). A new
"Verify the promoted feed round-trips byte-identically" step, gated on
`steps.publish.outputs.promoted == 'true'`, re-downloads what the feed actually serves,
re-hashes it, and fails the job on any mismatch — so a truncated upload, a clobber race
or any rewrite of the signed manifest is caught rather than shipped.

Tests: both steps are **executed**. The digest step's output and summary are checked
against an independently computed SHA-256. The verify step passes when the served bytes
match and fails with `::error::` when they differ by a single field. A structural
assertion confirms the verify step is gated on an actual promotion and ordered after the
upload. (`sha256sum` is GNU coreutils and present on the `ubuntu-24.04` runner this job
uses; the test installs a byte-compatible `shasum -a 256` shim on PATH when running on a
macOS dev machine, so the workflow's own instructions are executed verbatim either way.)

## Notes and follow-ups (not findings, not fixed)

- **No YAML-parser test was added.** The review noted "no test parses either workflow as
  YAML". Both `yaml` and `js-yaml` are only *transitive* dependencies here, so a test
  importing one would rest on an undeclared dependency. Both workflows were verified to
  parse (and their step order confirmed) during this pass; the executed-step tests are
  the stronger substitute. Adding `yaml` as an explicit devDependency would make a
  parse-level test reasonable.
- **Out of scope, still open:** IN-01 (`csp: null` + `withGlobalTauri: true`) — CR-02
  materially reduces its blast radius (the backend bundle is no longer webview-fetchable)
  but the unrestricted CSP remains. IN-03 (`tar -xzf` on a `.zip`-capable path;
  unreachable `aarch64-unknown-linux-gnu` triple). Prior-round WR-09 (no `concurrency`
  across the four matrix legs and the two co-triggering Electron workflows) is still
  open, and WR-08's `latest.json` read-modify-write is still downstream of it — the new
  downgrade guard narrows but does not close that race.
- **`--fix` cannot close the live gate.** Every change here is still unexercised on a
  real runner; REQ-34-09's `v*` tag-push gate remains the only thing that can prove the
  pipeline end to end.

---

_Fixed: 2026-07-24T22:40:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
