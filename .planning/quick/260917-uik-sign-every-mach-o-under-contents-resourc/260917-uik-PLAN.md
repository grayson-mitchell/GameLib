---
phase: quick-260917-uik
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/signMachOResources.ts
  - package.json
  - .github/workflows/release-tauri.yml
  - src/backend/__tests__/signMachOResources.test.ts
  - src/backend/__tests__/releaseWorkflow.test.ts
  - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "A Mach-O detector exists that selects files by magic bytes, never by extension, and never follows symlinks"
    - "Run by hand against the live local build/bin/arm64/darwin tree, that detector selects exactly the same population `file | grep -c Mach-O` selects (253 at the 2026-09-17 helper versions) and selects zero non-Mach-O decoys"
    - "Every selected file is signed with the Developer ID identity, --force, --options runtime and --timestamp, deepest-path-first"
    - "No helper signing invocation ever passes --deep or --entitlements"
    - "src-tauri/entitlements.plist is byte-identical to HEAD -- the sidecar's allow-jit entitlement is untouched"
    - "The signing step runs on the macOS leg only, after the helper tree is fully populated, and BEFORE the tauri-action step in release-tauri.yml's step order"
    - "The signing step is skipped, with the job staying green, when APPLE_SIGNING_IDENTITY is absent (D-04 invariant preserved)"
    - "A zero-file run is a hard failure, not a silent success"
    - "No job-level env: map of APPLE_* is reintroduced (GAP-A regression guard)"
    - "The P12 written to disk is removed by a trap that fires on failure as well as success (WR-01 class)"
  artifacts:
    - path: "meta/signMachOResources.ts"
      provides: "Magic-byte Mach-O detection + deepest-first codesign driver with a --dry-run mode"
      contains: "JEST_WORKER_ID"
    - path: ".github/workflows/release-tauri.yml"
      provides: "The macOS-only signing step, gated on APPLE_SIGNING_IDENTITY, placed before tauri-action"
      contains: "sign:macos-resources"
    - path: "src/backend/__tests__/signMachOResources.test.ts"
      provides: "Executed detection tests over a synthetic fixture + argv shape assertions"
  key_links:
    - from: ".github/workflows/release-tauri.yml"
      to: "meta/signMachOResources.ts"
      via: "pnpm sign:macos-resources"
      pattern: "sign:macos-resources"
    - from: "package.json"
      to: "meta/signMachOResources.ts"
      via: "runTs.cjs script entry"
      pattern: "meta/signMachOResources.ts"
---

<objective>
Sign every Mach-O under the macOS helper tree with the Developer ID identity, hardened runtime and a
secure timestamp, at its SOURCE path in the runner workspace, before Tauri's bundler copies it into
`GameLib.app/Contents/Resources/` and before Tauri signs the outer `.app`.

Purpose: Apple returned `Invalid` / "Archive contains critical validation errors" on 253 paths, 100%
of them under `Contents/Resources/build/bin/arm64/darwin/`. Tauri signs only `Contents/MacOS/*` and
the outer bundle; it does not recurse `Contents/Resources`. No macOS release can be published until
this is closed.

Output: `meta/signMachOResources.ts`, a `sign:macos-resources` package script, one new macOS-only
step in `release-tauri.yml`, executed tests, and an honest todo status update.

**This plan cannot be verified by anything it produces.** See `<verification_reality>`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
@.github/workflows/release-tauri.yml
@src-tauri/tauri.macos.conf.json
@./CLAUDE.md

Prior art to copy, not reinvent:
- `meta/buildSteamBridgeShims.ts:361-370` — the `JEST_WORKER_ID` main-guard idiom. Required: memory
  records that importing a `meta/` script runs its `main()` and rewrites the artifact. A signing
  script that signs on import would be actively dangerous under jest.
- `.github/workflows/release-tauri.yml:229-279` — the "Enable Apple signing only when a complete
  cert secret set is enrolled" step. It writes `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`
  and `APPLE_SIGNING_IDENTITY` to `$GITHUB_ENV` **only** on a fully-enrolled run. That is the gate
  this plan hangs off; do not add a parallel one.
- `.github/workflows/release-tauri.yml:323-334` — the Windows cert import's `try/finally`. Its
  WR-01 history (key material written to the workspace before the cleanup existed) is the exact
  failure mode the P12 trap in Task 2 must not repeat.
</context>

<measured_evidence>
Everything below was measured on this working tree on 2026-09-17, not assumed. It is recorded here
because it is what settles the todo's two open questions.

**The population.** `find build/bin/arm64/darwin -type f -print0 | xargs -0 file | grep -c Mach-O`
returns **253**, out of 277 regular files. Apple rejected **253** distinct paths. The local source
tree and the rejected bundle population are the same set. The detector written in Task 1 must
reproduce that number.

**These binaries are ad-hoc signed, not third-party-signed.** `codesign -dv --verbose=4` reports:
- `legendary/legendary` → `flags=0x2(adhoc)`, `Signature=adhoc`
- `comet` → `flags=0x20002(adhoc,linker-signed)`
- `legendary/_internal/charset_normalizer/cd.cpython-312-darwin.so` → `flags=0x2(adhoc)`

**No bundle is sealed.** `find build/bin/arm64/darwin -name _CodeSignature` returns **empty**.
PyInstaller signed each Mach-O individually and never sealed the three `Python.framework` bundles.

**12 symlinks exist** in the tree (`_internal/Python`, `Python.framework/Python`,
`Python.framework/Resources`, `Python.framework/Versions/Current`, ×3 helpers). `find -type f`
already excludes them and their targets are separately present in the file list.

**The helper tree is not committed.** `git ls-files build/bin` returns 0. It is produced on the
runner by `pnpm download-helper-binaries` (inside `.github/actions/install-deps`, workflow line 99)
plus `pnpm build-steam-bridge` (line 153, which emits `steam-bridge-helper`).
</measured_evidence>

<design_decisions>

### (a) Can these third-party binaries be re-signed with our Developer ID? YES.

Every one of the 253 carries an **ad-hoc** signature. An ad-hoc signature carries no team identity,
no entitlements, and no Developer ID we would be destroying — there is no vendor signature here to
preserve, and no "re-signing invalidates someone else's seal" hazard. `codesign --force -s
"$APPLE_SIGNING_IDENTITY" --options runtime --timestamp <file>` replaces it cleanly. `--force` is
**required** (the files already bear a signature; without it codesign errors out).

`--deep` is **forbidden**, for three separate reasons: Apple deprecates it for signing; it applies
the *outer* entitlements to nested content; and it would seal the `Python.framework` bundles, which
we deliberately do not seal (see below).

### Granularity: per-Mach-O-file. Never seal a bundle.

Two reasons, both measured:

1. It matches the defect exactly. Apple's 253 complaints are file-level, on a tree where
   `_CodeSignature` does not exist anywhere. The remedy that matches the measurement is file-level.
2. A bundle seal (`CodeResources`) hashes the bundle's file layout *including its symlinks*. There
   are 12 symlinks in this tree, and **Tauri's symlink handling when copying `bundle.macOS.files`
   into `Contents/Resources` is unverified**. If it dereferences them, a sealed framework breaks at
   validation. An embedded per-file signature lives inside the Mach-O's own `LC_CODE_SIGNATURE`
   load command — it is data *in the file* — so it survives any byte-preserving copy regardless of
   how symlinks are handled.

### (b) Do any need their own entitlements? NO — and the reasoning matters more than the answer.

**Entitlements are not a notarization input.** Apple's four verbatim complaints were: missing secure
timestamp (506), not signed with a valid Developer ID certificate (500), hardened runtime not
enabled (10), invalid signature (6). Those map 1:1 onto `--timestamp`, `-s "$IDENTITY"`,
`--options runtime`, and "sign it properly". Adding `allow-jit`,
`allow-unsigned-executable-memory` or `disable-library-validation` would not change the notarization
verdict by one line.

Specifically:
- **`disable-library-validation` is not needed.** Library validation rejects loading code signed by
  a *different* Team ID. We sign all 253 with the *same* Developer ID, so legendary/nile/gogdl
  loading their own `libssl.3.dylib`, `Python.framework/Versions/3.12/Python` and
  `*.cpython-312-darwin.so` are same-team loads and pass.
- **CPython 3.12 has no JIT.** The copy-and-patch JIT is 3.13+ and opt-in at build time. The
  plausible residual need is libffi/ctypes closure allocation wanting `MAP_JIT`, which would need
  `com.apple.security.cs.allow-jit` on that specific helper.

So: **ship with no entitlements on the helpers**, and treat "a helper crashes at runtime under
hardened runtime" as a **question notarization cannot answer**. Adding an entitlement speculatively
weakens the posture for an unmeasured need, and this repo's own history (the sidecar's `allow-jit`
was added for a *predicted* failure that turned out not to be the failure) is the argument against
guessing. If a runtime crash IS observed on the published build, the remedy is to add
`com.apple.security.cs.allow-jit` to that one helper via the per-path entitlements map Task 1 builds
in — which is why the map exists even though it ships empty.

**`src-tauri/entitlements.plist` must not be touched, read, or passed to any helper codesign call.**
It is the app/sidecar entitlements file whose `allow-jit` was vindicated by the failed run (the
sidecar drew zero complaints). Passing it to the helpers via `--entitlements` would be a silent
grant of JIT to 253 binaries that have not been shown to need it.

### WHERE: sign at the SOURCE path, in a workflow step before `tauri-action`.

Three candidates were on the table. The pick is **option 3 (source path)**, implemented as
**option 1's placement** (a workflow step before `tauri-action`).

| Candidate | Verdict |
|---|---|
| Reach into `Contents/Resources` mid-bundle | **Impossible.** The `.app` does not exist until the bundler runs, and `tauri-action` exposes no hook between "copy resources" and "sign the app". |
| `beforeBundleCommand` | **Rejected.** It fires at the *same moment* relative to the copy as a pre-`tauri-action` workflow step, so it buys nothing — and it costs: it would fire on the Linux and Windows legs, and on every developer's local `tauri build` where no Developer ID exists. The conditional-enrolment logic already lives in the workflow. |
| **Sign at `build/bin/arm64/darwin` in the workspace** | **Picked.** |

Why it is correct rather than merely convenient:

- **The ordering requirement is satisfied by construction.** "Innermost-first, and before Tauri signs
  the outer `.app`" stops being a fragile sequencing problem: everything is signed before the
  bundler has created a bundle at all.
- **A content copy preserves the signature**, because the signature is embedded in the Mach-O, not
  an xattr and not a sidecar file.
- **It is desk-testable** against the local tree, which no in-bundle approach is.
- Tauri's outer-`.app` signing pass then seals our already-correct inner signatures into
  `CodeResources` by hash. Tauri does not pass `--deep`, so it neither re-signs nor strips them.

**Placement:** immediately after `Prune non-frontend build intermediates before bundling`
(workflow line 418-429, whose `test -d build/bin` guard already asserts the tree survived) and
immediately before the `tauri-apps/tauri-action@v1` step (line 431). By that point
`download-helper-binaries` (line 99) and `build-steam-bridge` (line 153) have both run, so the tree
is complete, and nothing later writes into `build/bin`.

### The keychain problem — the highest-risk part of this plan.

**At this point in the job, the Developer ID cert is not in any keychain.** Tauri's bundler does its
own `security import` later, during `tauri build`. So `codesign -s "$APPLE_SIGNING_IDENTITY"` in our
step would fail with "no identity found" unless our step imports the cert itself.

The step therefore creates its own throwaway keychain, imports the P12, signs with an explicit
`--keychain`, and deletes the keychain in a trap — leaving the runner's keychain search list as it
found it, so Tauri's own later `security create-keychain` / `set-keychain-search-list` sequence
operates on clean state.

**This is the single assumption in this plan that only a live run can settle** (see
`<verification_reality>` item 1). It is called out rather than buried.

</design_decisions>

<verification_reality>

**A green CI build does not verify this fix. Neither does a local dry-run. Neither does jest.**

The failing leg is the only thing that has ever exercised this path, and the three things that can
actually break are all invisible to every gate this plan can add.

### Desk-verifiable (what the tasks below genuinely prove)

- The detector reproduces the exact `file | grep -c Mach-O` population on the live local tree
  (253 today), and selects zero of the 24 non-Mach-O files (`base_library.zip`, `cacert.pem`,
  `Info.plist`, `RECORD`, `*.dist-info/*`, `steam_appid.txt`).
- The detector skips all 12 symlinks.
- The codesign argv contains `--force`, `--options runtime`, `--timestamp`, and does NOT contain
  `--deep` or `--entitlements` (asserted from a `--dry-run` capture, not from reading the source).
- Deepest-first ordering.
- A zero-file run exits non-zero.
- `src-tauri/entitlements.plist` is byte-identical to HEAD.
- The workflow step exists, is macOS-only, is gated on `APPLE_SIGNING_IDENTITY`, and its index in
  the parsed YAML `steps` array is strictly less than the `tauri-action` step's index.
- `pnpm codecheck` / the backend suite / `pnpm planning-gates` stay at their existing baseline.

### NOT desk-verifiable — live tag push only

1. **Whether our temp keychain coexists with Tauri's own keychain handling.** Highest risk. A
   collision here fails the macOS leg loudly at `tauri build`, which is a *better* failure than the
   current one, but it is still a failure only a real run can reveal.
2. **Whether the signature survives Tauri's `bundle.macOS.files` copy into `Contents/Resources`.**
   Argued above from how Mach-O signatures are stored; not observed.
3. **Whether notarization returns `Accepted`.**
4. **Whether any helper crashes at runtime under hardened runtime with no entitlements.** A
   notarization `Accepted` says *nothing* about this. A signed, notarized, never-launched helper is
   exactly the shape of a green check proving nothing.

### The only real verification

Push a fresh throwaway tag. Then, in order:

```
# 1. the run itself
#    notarization result must read Accepted, not Invalid

# 2. on the DOWNLOADED published artifact, not on a local build
codesign -dv --verbose=4 GameLib.app
spctl -a -vvv -t install GameLib.app
xcrun stapler validate GameLib.app

# 3. spot-check the population that was rejected -- expect
#    "Authority=Developer ID Application" and flags=0x10000(runtime), NOT adhoc
codesign -dv --verbose=4 GameLib.app/Contents/Resources/build/bin/arm64/darwin/legendary/legendary
codesign -dv --verbose=4 GameLib.app/Contents/Resources/build/bin/arm64/darwin/nile/_internal/Python.framework/Versions/3.12/Python
codesign -dv --verbose=4 GameLib.app/Contents/Resources/build/bin/arm64/darwin/comet

# 4. count survivors -- this must be ZERO
find GameLib.app/Contents/Resources -type f -print0 | xargs -0 -n1 codesign -dv 2>&1 \
  | grep -c 'adhoc\|code object is not signed'

# 5. step 4 above is a POSITIVE-control trap: run it against a known-adhoc file first
#    and confirm it reports 1, or a zero from a broken pipeline reads as success

# 6. LAUNCH the app and actually invoke each helper once (an Epic login via legendary,
#    an Amazon library refresh via nile, a GOG action via gogdl). This is the only thing
#    that tests the no-entitlements decision.
```

Step 6 is not optional and is not covered by steps 1-5.

</verification_reality>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Mach-O detector + codesign driver in meta/signMachOResources.ts</name>
  <files>meta/signMachOResources.ts, package.json, src/backend/__tests__/signMachOResources.test.ts</files>
  <behavior>
    Detection, over a synthetic fixture built in the test's tmpdir (NOT the real build/bin tree — a
    count pinned to the live tree would rot the first time downloadHelperBinaries bumps a helper
    version):
    - A file whose first 4 bytes are `cf fa ed fe` (MH_MAGIC_64 little-endian on disk) IS selected.
    - `ce fa ed fe` (MH_MAGIC 32-bit) IS selected.
    - `fe ed fa cf` / `fe ed fa ce` (big-endian) ARE selected.
    - `ca fe ba be` with a sane `nfat_arch` (< 32) IS selected as a fat binary.
    - `ca fe ba be` with `nfat_arch` = 0x00000034 (a Java class file, major version 52) is NOT
      selected. This collision is real and is why nfat_arch is checked.
    - A file named `legendary` containing ASCII text is NOT selected (extension/name is never used).
    - A file named `cd.cpython-312-darwin.so` containing ASCII text is NOT selected.
    - `base_library.zip` (PK magic) is NOT selected.
    - A file shorter than 8 bytes is NOT selected and does not throw.
    - A symlink pointing at a genuine Mach-O fixture is NOT selected (its target, if it is itself
      inside the scanned tree, is selected once and only once).
    Ordering:
    - Returned paths are sorted by descending path-component count; ties broken lexicographically
      so the order is deterministic.
    Argv shape, captured from `--dry-run` (the test asserts the captured argv, it does not grep the
    source — memory: prose that names a flag satisfies a source grep without the flag ever running):
    - contains `--force`, `--options`, `runtime`, `--timestamp`, `-s`, `--keychain`
    - does NOT contain `--deep`
    - does NOT contain `--entitlements`
    Failure modes:
    - Scanning a directory that yields zero Mach-O files exits non-zero with a message naming the
      directory. A zero-count success is forbidden.
    - Scanning a non-existent directory exits non-zero.
    - A `codesign` non-zero exit after the retry budget is exhausted exits non-zero. No file may be
      skipped silently.
  </behavior>
  <action>
Create `meta/signMachOResources.ts`, following the existing `meta/` conventions.

Module shape — export the pure parts, guard the side-effecting part:
- `export function isMachO(headerBytes: Buffer): boolean` — magic-byte test only, no filesystem.
- `export async function collectMachOFiles(dir: string): Promise<string[]>` — walks `dir`, uses
  `lstat` to skip symlinks (do NOT use a `-follow` equivalent), opens each regular file, reads the
  first 8 bytes, applies `isMachO`, returns deepest-first sorted.
- `export function codesignArgs(file, identity, keychain, entitlements?): string[]` — builds argv.
- `async function main()` — parses `--dir`, `--keychain`, `--dry-run`, reads the identity from
  `--identity` or `$APPLE_SIGNING_IDENTITY`, and drives.
- Guard `main()` behind `if (!process.env.JEST_WORKER_ID)`, copying the idiom and the explanatory
  comment shape from `meta/buildSteamBridgeShims.ts:361-370`. This is load-bearing: this repo has
  already been bitten by importing a `meta/` script and having its `main()` run. Here that would
  mean codesigning during a test run.

Magic bytes to accept (read 8 bytes so `nfat_arch` is available):
`0xFEEDFACE`, `0xFEEDFACF`, `0xCEFAEDFE`, `0xCFFAEDFE`, and `0xCAFEBABE`/`0xBEBAFECA` only when the
following u32 (`nfat_arch`) is non-zero and < 32. Write the Java-class-file collision down in a
comment next to that check — `0xCAFEBABE` is both FAT_MAGIC and the Java class magic, and without
the `nfat_arch` sanity check a stray `.class` would be handed to codesign.

Signing invocation per file, in deepest-first order:
`codesign --force --sign "$IDENTITY" --options runtime --timestamp --keychain "$KEYCHAIN" <file>`

Strict prohibitions, each with a one-line comment stating why:
- never `--deep` (Apple-deprecated; applies outer entitlements to nested content; would seal the
  Python.framework bundles we deliberately leave unsealed)
- never `--entitlements` by default (entitlements are not a notarization input; the sidecar's
  `src-tauri/entitlements.plist` must never reach a helper)

Per-path entitlements map: declare `const HELPER_ENTITLEMENTS: Record<string, string> = {}` —
**empty**, with a comment saying it is the designated seam for the case where a live run shows a
specific helper crashing under hardened runtime, and that adding an entry requires an observed
crash, not a hunch.

Timestamp retry: `--timestamp` makes a network round-trip to Apple's TSA, and this run makes ~253 of
them back to back. Apple's timestamp service rate-limits under exactly that pattern ("The timestamp
service is not available"). Retry each file up to 4 times with exponential backoff (1s, 2s, 4s, 8s)
ONLY when codesign's stderr mentions the timestamp service; any other codesign failure fails
immediately. After the budget, fail the whole run — an unsigned survivor recreates the defect
verbatim.

Progress + census: print the detected count before signing and a final `signed N/N` line. Fail hard
if the detected count is 0.

Add to `package.json` scripts, matching the sibling entries' exact runTs form:
`"sign:macos-resources": "node meta/runTs.cjs --bundle --platform=node --target=node22 meta/signMachOResources.ts"`

Write `src/backend/__tests__/signMachOResources.test.ts` covering the `<behavior>` list. Build the
fixture tree with `mkdtemp` under `tmpdir()` and remove it in `afterAll`. Do not reach into
`build/bin` from the test — that tree is gitignored, absent on a fresh clone, and version-drifting.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm exec jest src/backend/__tests__/signMachOResources.test.ts 2>&1 | tail -20</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm sign:macos-resources -- --dir build/bin/arm64/darwin --dry-run --identity "DESK-CHECK" --keychain /dev/null 2>&1 | tail -5</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && EXPECTED=$(find build/bin/arm64/darwin -type f -print0 | xargs -0 file 2>/dev/null | grep -c 'Mach-O') && ACTUAL=$(pnpm sign:macos-resources -- --dir build/bin/arm64/darwin --dry-run --identity DESK-CHECK --keychain /dev/null 2>/dev/null | grep -c '^codesign ') && echo "file(1)=$EXPECTED detector=$ACTUAL" && test "$EXPECTED" = "$ACTUAL" && test "$EXPECTED" -gt 0</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && git diff --quiet HEAD -- src-tauri/entitlements.plist && echo "entitlements.plist UNTOUCHED"</automated>
  </verify>
  <done>
    Jest suite passes. The dry-run's emitted argv count equals `file(1)`'s Mach-O count on the live
    local tree and both are > 0 (expected 253 at today's helper versions — recorded as an
    observation in the SUMMARY, NOT pinned in any committed gate). `src-tauri/entitlements.plist`
    is byte-identical to HEAD.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire the macOS-only signing step into release-tauri.yml</name>
  <files>.github/workflows/release-tauri.yml, src/backend/__tests__/releaseWorkflow.test.ts</files>
  <action>
Insert ONE new step into `release-tauri.yml`, positioned **after** the `Prune non-frontend build
intermediates before bundling` step and **immediately before** the `tauri-apps/tauri-action@v1`
step.

Gate:
`if: startsWith(matrix.platform, 'macos') && env.APPLE_SIGNING_IDENTITY != ''`

`APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD` are already in the
step environment — the earlier "Enable Apple signing only when a complete cert secret set is
enrolled" step wrote them to `$GITHUB_ENV`, and only on a fully-enrolled run. **Do NOT add a
job-level or step-level `env:` map for any `APPLE_*` name.** That is precisely GAP-A: a mapped
secret resolves to defined-and-empty when absent, and `var_os`-style presence checks then take the
signing branch on empty data. Reading them from the inherited environment is what preserves D-04's
"CI never fails on missing certs, job stays green" invariant — a secrets-less run simply skips this
step.

Step body (`shell: bash`, `set -euo pipefail`):

1. `KEYCHAIN="$RUNNER_TEMP/gamelib-helpers.keychain-db"`,
   `P12="$RUNNER_TEMP/gamelib-helpers.p12"`,
   `KEYCHAIN_PW="$(openssl rand -base64 24)"`.
2. Capture the existing user keychain search list into `ORIG_KEYCHAINS` BEFORE modifying it.
3. Install a `trap ... EXIT` that restores `ORIG_KEYCHAINS`, runs
   `security delete-keychain "$KEYCHAIN" 2>/dev/null || true`, and `rm -f "$P12"`. **The trap must be
   installed before the P12 is written**, so it fires on failure as well as success. This is the
   WR-01 lesson from the Windows leg restated: that bug existed precisely because the cleanup was
   registered after the key material hit disk.
4. Decode: `printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$P12"` (`base64 -d` is not
   portable; `--decode` is what macOS's base64 accepts).
5. `security create-keychain -p "$KEYCHAIN_PW" "$KEYCHAIN"`
6. `security set-keychain-settings -lut 21600 "$KEYCHAIN"` — without this the keychain can relock
   partway through a multi-minute 253-file signing run.
7. `security unlock-keychain -p "$KEYCHAIN_PW" "$KEYCHAIN"`
8. `security import "$P12" -k "$KEYCHAIN" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign`
9. `security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PW"
   "$KEYCHAIN" >/dev/null` — omitting this makes codesign fail with `errSecInternalComponent` on a
   headless runner. Redirect its output; it echoes the keychain dump.
10. `security list-keychains -d user -s "$KEYCHAIN" $ORIG_KEYCHAINS`
11. `pnpm sign:macos-resources -- --dir build/bin/arm64/darwin --keychain "$KEYCHAIN"`

Never `echo` `$APPLE_CERTIFICATE`, `$APPLE_CERTIFICATE_PASSWORD` or `$KEYCHAIN_PW`.

Write a step comment that records, in the house style already used throughout this file: the run id
(35223308954) and the measured 253/253 population; that Tauri signs only `Contents/MacOS/*` and the
outer `.app`; why signing happens at the SOURCE path rather than in the bundle (embedded Mach-O
signature survives a content copy; ordering satisfied by construction); why the keychain is created
here at all (Tauri's own `security import` has not run yet at this point in the job); and that the
keychain is torn down so Tauri's later keychain manipulation sees clean state. State plainly that
the keychain-coexistence claim is UNPROVEN LIVE — the file's own header already sets the precedent
of labelling unproven claims, and mislabelling this one as verified would be the exact pattern this
repo keeps stamping out.

Add to `src/backend/__tests__/releaseWorkflow.test.ts`, in a new `describe` block.

Convention note, deliberate deviation: that file's header states it uses raw-text assertions and no
YAML parser. The new block SHOULD use one — `js-yaml` is a direct devDependency (`package.json:172`,
^4.1.1), so this adds nothing. The reason is the ordering invariant: a raw-text
`indexOf(a) < indexOf(b)` over this file is unsound, because the step comment written above
legitimately mentions `tauri-action`, so the first textual match is a comment, not the step. Parsing
to a `steps` array and comparing array indices is the only form of the assertion that cannot be
satisfied by prose — which is this repo's recurring gate-failure mode. Leave the existing raw-text
blocks alone and note the deviation in the new block's comment.

Assert:
- a step whose `run` contains `sign:macos-resources` exists
- its `if` contains both `startsWith(matrix.platform, 'macos')` and `env.APPLE_SIGNING_IDENTITY != ''`
- **its index in the `steps` array is strictly less than the index of the `tauri-apps/tauri-action`
  step** — this is the ordering invariant, and index comparison is the only form of it that cannot
  be satisfied by a comment
- its index is strictly greater than the `Prune non-frontend build intermediates` step's index
- no `env:` map anywhere in the job maps a key beginning `APPLE_` (GAP-A regression guard)
- the step body contains `trap` and the `trap` line appears at a lower character offset than the
  `base64 --decode` line (the WR-01 ordering invariant, asserted positionally rather than by
  presence)

Two gate-hygiene rules from CLAUDE.md apply to every grep-shaped assertion above: strip `#` comment
lines before counting, and never assert `== 0` against an unfiltered file — the step comment this
task writes NAMES `--deep` and `--entitlements` while explaining why they are prohibited, so a naive
"no `--deep` in the workflow" grep would convict correct code.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm exec jest src/backend/__tests__/releaseWorkflow.test.ts 2>&1 | tail -25</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && node -e "const y=require('js-yaml'),f=require('fs');const d=y.load(f.readFileSync('.github/workflows/release-tauri.yml','utf8'));const s=d.jobs.release.steps;const a=s.findIndex(x=>(x.run||'').includes('sign:macos-resources'));const b=s.findIndex(x=>(x.uses||'').includes('tauri-action'));console.log('sign step idx',a,'tauri-action idx',b);if(a<0||b<0||a>=b)process.exit(1)"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -v '^\s*#' .github/workflows/release-tauri.yml | grep -c 'APPLE_CERTIFICATE: \${{' | xargs -I{} sh -c 'echo "job-level APPLE_ env maps: {}"; test {} -eq 0'</automated>
  </verify>
  <done>
    The step exists, is macOS-and-enrolment gated, and parses to an index strictly between the prune
    step and `tauri-action`. `releaseWorkflow.test.ts` passes with the new block. No `APPLE_*`
    secret is mapped through an `env:` block anywhere in the job.
  </done>
</task>

<task type="auto">
  <name>Task 3: Record the honest status on the todo — the fix is written, not verified</name>
  <files>.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md</files>
  <action>
The todo stays **OPEN** and stays in `pending/`. Nothing in this plan can close it — only a tag push
reaching notarization `Accepted` can, and a helper launch under hardened runtime is needed on top of
that. Do not move it to `completed/`; this repo's memory records closing-on-a-false-title discarding
untested siblings.

Update its frontmatter, preserving CLAUDE.md's bare-lowercase-exact vocabulary and the
`severity` → `platform` → `ready` key order:
- `severity: critical` — unchanged
- `platform: macos` — unchanged
- `ready: code` → `ready: live-gate`. This is now literally true and is the whole point of the
  vocabulary: the desk work is done, and what remains needs a live run.
- `needs: resign-resources-then-retag` → a value naming what actually remains, e.g.
  `retag-and-confirm-notarization-accepted`.

Append a `## STATUS 2026-09-17 (quick-260917-uik)` section that records:
- Open question (a) is **ANSWERED: yes.** All 253 are ad-hoc signed (`flags=0x2(adhoc)`, comet
  `0x20002(adhoc,linker-signed)`), so there is no third-party Developer ID seal to destroy and
  `--force` suffices. Cite the measurement, not the conclusion alone.
- Open question (b) is **ANSWERED: no entitlements, deliberately** — with the reasoning that
  entitlements are not a notarization input at all, that `disable-library-validation` is unnecessary
  because all 253 get the same Team ID, and that CPython 3.12 has no JIT. Record that the residual
  risk (a libffi/ctypes `MAP_JIT` need) is a RUNTIME question that a notarization `Accepted` cannot
  answer, and that the designated remedy is the empty `HELPER_ENTITLEMENTS` map in
  `meta/signMachOResources.ts`.
- The placement decision and why `beforeBundleCommand` was rejected.
- The measured `file(1)` count of 253 on the local tree matching Apple's 253 rejected paths — with
  the caveat that this number is a 2026-09-17 observation at the current helper versions and is
  deliberately NOT pinned in any gate.
- **A verbatim statement that nothing has been verified**: the keychain coexistence, the
  copy-preserves-signature claim, the notarization verdict, and the no-entitlements runtime decision
  are all unobserved. Reproduce the verification command block from `<verification_reality>` above,
  including the step-5 positive control and the step-6 helper launch.
- That `src-tauri/entitlements.plist` was not modified and the sidecar's `allow-jit` is intact.

Leave the two sibling todos (Linux compile failure, Windows tar failure) alone.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates 2>&1 | tail -15</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -n '^severity:\|^platform:\|^ready:\|^needs:' .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -f .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md && ! test -f .planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md && echo "todo correctly still OPEN"</automated>
  </verify>
  <done>
    `pnpm planning-gates` is green. The todo is still in `pending/`, reads `severity: critical`,
    `platform: macos`, `ready: live-gate` in that key order, and carries a STATUS section that
    answers both open questions with their measurements and states plainly that the fix is unverified.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub secret → runner filesystem | The Developer ID P12 is decoded to `$RUNNER_TEMP` to be importable; `security import` has no in-memory-only path. |
| Downloaded helper binaries → our Developer ID | We are attesting, with our identity, to 253 binaries we did not build. |
| codesign → Apple TSA | 253 outbound timestamp requests. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-uik-01 | Information disclosure | P12 at `$RUNNER_TEMP/gamelib-helpers.p12` | mitigate | `trap ... EXIT` installed BEFORE the file is written, so it fires on failure too. This is the WR-01 defect on the Windows leg restated; Task 2 asserts the trap's position, not just its presence. |
| T-uik-02 | Information disclosure | Keychain password, cert password | mitigate | Never echoed; `set-key-partition-list` output redirected to `/dev/null` (it dumps keychain contents); `set -x` never enabled. |
| T-uik-03 | Tampering | Signing third-party helpers with our Developer ID | accept | Unavoidable — Apple requires every Mach-O in the bundle carry the submitting team's Developer ID. Bounded by `pnpm download-helper-binaries` being the only path into `build/bin`. This does not widen the trust surface: these binaries already ship inside the app and already execute. |
| T-uik-04 | Elevation of privilege | Entitlement over-grant | mitigate | Helpers are signed with NO entitlements and never with `--entitlements src-tauri/entitlements.plist`; `--deep` is prohibited so the app's `allow-jit` cannot propagate to 253 binaries. Task 1 asserts both from captured argv. |
| T-uik-05 | Denial of service | Apple TSA rate-limiting across 253 requests | mitigate | Bounded exponential-backoff retry, narrowed to timestamp-service stderr only; hard failure after the budget so no file ships unsigned. |
| T-uik-SC | Tampering | npm/pip/cargo installs | mitigate | **No new package is added by this plan.** `meta/signMachOResources.ts` uses only `node:fs`, `node:path` and `node:child_process`, run through the existing `meta/runTs.cjs` shim. No legitimacy checkpoint is required because no install occurs. |
</threat_model>

<verification>
Desk gates, in order:

```
pnpm exec jest src/backend/__tests__/signMachOResources.test.ts
pnpm exec jest src/backend/__tests__/releaseWorkflow.test.ts
pnpm codecheck
pnpm planning-gates
git diff --quiet HEAD -- src-tauri/entitlements.plist
```

Backend suite and lint are RED at HEAD per project memory (the allowlist is a ledger). Compare
against the pre-change baseline on the same sha rather than against "green" — and name the sha when
reporting "pre-existing", because this repo's memory records that claim being made about an
unstated baseline four times.

Then the manual desk observation (record the number in the SUMMARY, pin it nowhere):

```
find build/bin/arm64/darwin -type f -print0 | xargs -0 file | grep -c Mach-O
pnpm sign:macos-resources -- --dir build/bin/arm64/darwin --dry-run --identity DESK-CHECK --keychain /dev/null | grep -c '^codesign '
```

Both must be equal and > 0.

**Then stop, and say so.** The fix is not verified. See `<verification_reality>` for the live gate.
</verification>

<success_criteria>
- Every Mach-O under `build/bin/arm64/darwin` — detected by magic bytes, symlinks excluded — is
  signed deepest-first with the Developer ID identity, `--force`, `--options runtime` and
  `--timestamp`, at its source path, before the bundler copies it and before Tauri signs the `.app`.
- No helper signing call passes `--deep` or `--entitlements`. `src-tauri/entitlements.plist` is
  byte-identical to HEAD.
- A zero-file run fails; a partially-signed run fails; neither reports success.
- The step is macOS-only, gated on `APPLE_SIGNING_IDENTITY`, and a secrets-less run skips it with
  the job staying green (D-04).
- No `APPLE_*` secret is mapped via an `env:` block (GAP-A).
- The step's index in the parsed YAML `steps` array is strictly between the prune step and
  `tauri-action`, asserted by an executed test.
- The todo remains OPEN with `ready: live-gate`, both open questions answered with their
  measurements, and the unverified status stated plainly.
- The SUMMARY does NOT claim the notarization defect is fixed.
</success_criteria>

<output>
Create `.planning/quick/260917-uik-sign-every-mach-o-under-contents-resourc/260917-uik-SUMMARY.md` when done.

The SUMMARY must state, in its own words and not only by reference, that a green local run and a
green CI build both prove nothing here, and that the next action is a throwaway tag push followed by
the six-step verification block — including the step-5 positive control and the step-6 helper
launch that tests the no-entitlements decision.
</output>
</content>
