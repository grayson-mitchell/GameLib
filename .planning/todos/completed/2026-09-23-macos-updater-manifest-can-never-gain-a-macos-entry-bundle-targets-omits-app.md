---
created: 2026-09-23T00:00:00.000Z
title: 'FIXED (config half): bundle.targets omitted `app`, the updater-enabled macOS target, so no macOS updater artifact was ever built — corrected in quick-260924-f9y. The manifest entry itself is still UNPROVEN and was carried to a successor todo BEFORE this close.'
area: build
severity: major
platform: any
ready: code
found_by: 'GitHub Actions run 35841476015, macOS job 107117309605, on tag v0.7.0-notarize-test3 at commit c946239ce. Extracted by quick task 260923-u3o.'
source: '.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md'
status: completed
resolved: 2026-09-24
resolved_by: quick-260924-f9y
files:
  - src-tauri/tauri.conf.json
  - .github/workflows/release-tauri.yml
---

## Problem

`severity: major` is the honest value under CLAUDE.md's vocabulary — "a feature is broken". The
macOS auto-updater cannot work at all, and publishing the `v0.7.0` draft as it stands would promote
an updater feed carrying no macOS entry whatsoever.

`src-tauri/tauri.conf.json` sets `bundle.targets` to `['nsis', 'appimage', 'dmg']` and
`bundle.createUpdaterArtifacts` to `true`. Those two settings contradict each other on macOS: the
bundler is told to produce updater artifacts, and is given no macOS target that produces one. The
bundler says so itself, verbatim from the job log:

```
Warn The bundler was configured to create updater artifacts but no updater-enabled targets were built. Please enable one of these targets:
```

The enumeration that should follow that colon never arrives — the log goes straight on to
`Cleaning`. The warning is recorded here exactly as captured, and the list it failed to print is
NOT invented; see `## Direction` for how the correct target name must be established.

## What was measured

From the macOS job log of run `35841476015`, in the order captured:

```
Warn The bundler was configured to create updater artifacts but no updater-enabled targets were built. Please enable one of these targets:
    Cleaning /Users/runner/work/GameLib/GameLib/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/GameLib.app
    Finished 1 bundle at:
        /Users/runner/work/GameLib/GameLib/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg

Looking for artifacts in:
/Users/runner/work/GameLib/GameLib/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg
/Users/runner/work/GameLib/GameLib/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/GameLib.app
/Users/runner/work/GameLib/GameLib/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/GameLib.app.tar.gz
/Users/runner/work/GameLib/GameLib/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/GameLib.app.tar.gz.sig
Found artifacts:
/Users/runner/work/GameLib/GameLib/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg
Looking for a draft release with tag v0.7.0...
Found draft release with tag v0.7.0 on the release list.
Deleting existing GameLib_0.7.0_aarch64.dmg...
Uploading GameLib_0.7.0_aarch64.dmg...
GameLib_0.7.0_aarch64.dmg successfully uploaded.
Signature not found for the updater JSON. Skipping upload...
```

**The asymmetry is the finding.** `Looking for artifacts in:` lists FOUR paths, two of which are
`GameLib.app.tar.gz` and `GameLib.app.tar.gz.sig`. `Found artifacts:` lists exactly ONE, the dmg.
Those two `.tar.gz` paths ARE the macOS updater artifact and its signature — the action looked for
them in the right place and they had never been built. That is why the run ends
`Signature not found for the updater JSON. Skipping upload...`.

The tauri-action inputs echoed in the same log rule out a misconfigured action: `uploadUpdaterJson:
true`, `uploadUpdaterSignatures: true`, `uploadPlainBinary: false`, `releaseDraft: true`. The action
was ASKED to upload the manifest and its signature, and had nothing to upload.

## The live release state after the run

Draft release `378785323`, queried after the run:

- Assets: `GameLib_0.7.0_aarch64.dmg` (09:24:05), `GameLib_0.7.0_amd64.AppImage` (09:18:45),
  `GameLib_0.7.0_amd64.AppImage.sig` (09:18:46), `GameLib_0.7.0_x64.dmg` (2026-08-28, stale), and
  `latest.json` (09:18:47).
- `GameLib.app.tar.gz` and `GameLib.app.tar.gz.sig` are ABSENT entirely.
- `latest.json` reads `"pub_date": "2026-09-23T09:18:46.332Z"` — the LINUX leg's timestamp — with
  `platforms` containing ONLY `linux-x86_64` and `linux-x86_64-appimage`.

**The diagnostic point.** `appimage` IS an updater-enabled target, which is precisely why the Linux
leg produced a `.sig` and populated the manifest while macOS did not. The asymmetry sits WITHIN a
single run, on a single commit, with the same action and the same inputs on both legs. That is the
evidence that the cause is target selection in `bundle.targets` and not a macOS-specific pipeline
failure.

## This is a CORRECTION to p95 item 8, not a restatement

`### STATUS 2026-09-23 (quick-260923-p95)` item 8, in the notarization todo, recorded this manifest
under **STILL OWED**, saying the draft "must not be published until a complete run regenerates the
manifest". That framing implies the fix is to re-run.

**It is not.** The macOS leg of run `35841476015` WAS complete — notarization Accepted, the app
stapled, the dmg built and uploaded to the draft — and the manifest still gained no macOS entry.
Re-running this configuration will produce the same result every time, because no macOS updater
artifact is ever built for the manifest to reference. This needs the config change; it is not
reachable by re-running.

p95 item 8 is NOT edited. It is correct as a record of what was believed then, and is superseded
here rather than rewritten — the notarization todo is append-only by its own repeated statement.

p95's honest bound still holds and is repeated rather than dropped: nothing is live while the
release stays a draft, because `promote-updater-feed.yml` fires only on
`release: types: [published]`. But publishing it as-is would promote a feed with no macOS entry at
all, which is the same hazard p95 named.

## Direction — proposed, NOT implemented

This todo changes no configuration. It records a measurement and a candidate.

Adding the updater-enabled macOS target to `bundle.targets` is the obvious candidate, and `app` is
the name to evaluate FIRST, since the artifact the bundler went looking for and never found is
`GameLib.app.tar.gz`.

Two requirements on whoever picks this up:

1. **Verify the exact target name against the INSTALLED Tauri version** — `@tauri-apps/cli ^2.11.4`
   at the time of writing — by reading that version's bundler documentation or its target
   enumeration. Do NOT assert it from memory. This repo has repeatedly recorded prescribed fixes
   that turned out to be wrong about the substrate, and the bundler's own warning here failed to
   print the list of valid targets, so the name is genuinely unconfirmed rather than merely
   untyped.
2. **State honestly, in whatever record closes this, whether `nsis` is likewise the updater-enabled
   Windows target.** It appears to be, but the Windows leg has NEVER produced an artifact — it dies
   at step 5 `install-deps`, tracked by
   `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` — so the Windows half of
   this question is UNTESTED here and must not be written down as measured.

## Readiness split — read `ready: code` narrowly

The frontmatter cannot express this, so it is flagged here.

The FIX is desk-ready: it is a one-line change to a JSON array, verifiable by typecheck and by
reading the installed CLI's documentation. That is why `ready: code` is the correct triage value.

The PROOF is not desk-reachable. Confirming that `latest.json` gains a `darwin-aarch64` entry
requires a macOS release run that builds, signs, notarizes and uploads. So `ready: code` here must
NOT be read as "desk-closeable end to end" — anyone closing this on a desk run alone would be
closing it on the plausibility of the fix, not on its observed effect.

## Related

- `2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md` — this defect
  was extracted from its `### STATUS 2026-09-23 (quick-260923-p95)` item 8 by quick task
  `260923-u3o`. The same run, `35841476015`, produced the evidence in both records.
  That todo is now **completed** (closed by `quick-260923-uvt`, 2026-09-23) and lives under
  `.planning/todos/completed/`.
- `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` — the reason the Windows
  half of the target question is untestable today.

## RESOLUTION 2026-09-24 (quick-260924-f9y) — the CONFIG half, and only that half

Commit `598fac565`. `bundle.targets` is now `["nsis", "appimage", "app", "dmg"]`.

### Requirement 1 — the target name, measured against the INSTALLED CLI

The todo forbade asserting the name from memory, and was right to: the bundler's warning stopped at
its colon and the enumeration never printed. That enumeration is not lost — it is a string literal
inside the binary shipped with `@tauri-apps/cli` **2.11.4** (the installed version, read from that
package's own `package.json`, not from the `^2.11.4` range in `package.json`):

```
$ strings -a node_modules/@tauri-apps/cli-darwin-arm64/cli.darwin-arm64.node \
    | grep 'updater-enabled targets'
The bundler was configured to create updater artifacts but no updater-enabled targets were built.
Please enable one of these targets: app, appimage, msi, nsis
```

So `app` — the todo's own first candidate, reached from the artifact name `GameLib.app.tar.gz` — is
confirmed, from the very binary that emitted the truncated warning. It is independently a valid
`BundleType` in that package's `config.schema.json` (`enum: ["app"]`, "The macOS application bundle
(.app)"), so the config also stays schema-valid.

### Requirement 2 — `nsis` and Windows, stated with its bound

**`nsis` IS in that enumeration.** So yes: the Windows target already in `bundle.targets` is
updater-enabled, and Windows was never making this mistake.

**That is a fact about the bundler's list and nothing more.** No Windows updater artifact has ever
been observed, because the Windows leg has never produced any artifact — it dies at step 5
`install-deps`, tracked by `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`.
The todo asked for this to be stated honestly rather than written down as measured; it is not
measured.

### Ordering, and why the other legs are unaffected

`app` is declared BEFORE `dmg` because the dmg bundler consumes the `.app`. tauri-bundler is
believed to sort package types by priority so that ordering would not matter, but that sort was NOT
read — declaring the producer first is correct under either behaviour, so the question did not need
answering.

Adding `app` is a no-op on Linux and Windows, and this is not an assumption: run `35841476015`
carried the SAME target list on all three legs and each built only its own platform's bundle. The
bundler already intersects `bundle.targets` with the target platform's own set.

### Gates moved with it

- `meta/__tests__/artifactTargets.test.ts` deep-equals the target array. Its header calls itself
  "a tripwire, not a prohibition" and requires a deliberate change to update it — done, with the
  reason recorded in place so a later reader does not mistake `app` for target-set creep. Its
  "exactly one Linux target" assertion is untouched (`app` is not in that filter) and its
  over-reach control still holds.
- `src/backend/__tests__/tauriConf.test.ts` gains one named assertion, so that dropping `app` fails
  a test that says WHAT broke rather than reporting a generic array mismatch.
- **Negative control run, not assumed:** reverting the config alone turned exactly those two red
  (2 failed / 47 passed), and both returned green with it restored. `pnpm lint` 1107/1124 src and
  638/638 tests — the zero-headroom tests scope did not move. `pnpm codecheck` rc=0.
  `npx prettier --check` rc=0 over the three changed paths.

### What this close does NOT claim

Nothing here observed a macOS updater artifact existing. This closes the FIX; the todo's own
"Readiness split" said the PROOF is not desk-reachable, and it still is not. Per CARRY BEFORE
CLOSE, the residual was given a home BEFORE this file moved:

`.planning/todos/pending/2026-09-24-macos-updater-entry-in-latest-json-is-unproven-until-a-release-run.md`
(`severity: major`, `ready: live-gate`) carries the five-item gate — `Found artifacts:` listing the
`.tar.gz` pair, no "Signature not found" line, both assets on the release, a `darwin-aarch64` entry
in `latest.json` ALONGSIDE the surviving `linux-x86_64*` entries, and a macOS-leg `pub_date` — plus
the throwaway-tag trap and one question this desk run deliberately left open: whether the
`.app.tar.gz` is built from the notarized-and-stapled app or from a pre-notarization copy.

The predecessor's publishing hazard is therefore NOT retired by this commit. It moves to the
successor todo intact.
