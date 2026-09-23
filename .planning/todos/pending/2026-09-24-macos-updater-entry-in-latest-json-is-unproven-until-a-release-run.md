---
created: 2026-09-24T00:00:00.000Z
title: 'The macOS updater entry in latest.json is UNPROVEN: the config fix is shipped, but no release run has yet produced GameLib.app.tar.gz or a darwin-* platform in the manifest'
area: build
severity: major
platform: any
ready: live-gate
needs: macos-release-run-then-read-latest-json
status: OPEN
found_by: 'Carried out of 2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md by quick-260924-f9y, 2026-09-24, BEFORE that todo was closed. That todo fixed the config; this is the half of it that a desk run cannot reach.'
source: '.planning/todos/completed/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md'
files:
  - src-tauri/tauri.conf.json
  - .github/workflows/release-tauri.yml
---

## What is already discharged, and what is not

**Discharged (commit `598fac565`, quick-260924-f9y).** `bundle.targets` now declares `app`, the
updater-enabled macOS target, verified against the enumeration inside the INSTALLED
`@tauri-apps/cli` 2.11.4 binary rather than from memory. Two gates pin it, and a negative control
confirmed both turn red when it is removed.

**NOT discharged — this todo.** Nothing has yet OBSERVED a macOS updater artifact existing. The
predecessor's own "Readiness split" section says so in as many words: the fix is desk-ready, the
proof is not, and closing on the desk run alone would be closing on the plausibility of the fix
rather than on its effect. This file is that residual, given a home before the predecessor moved.

`severity: major` is kept deliberately. The predecessor's hazard has NOT been retired by a config
edit: publishing the `v0.7.0` draft while `latest.json` still carries only `linux-x86_64*` would
promote an updater feed with no macOS entry. Nothing is live while the release stays a draft —
`promote-updater-feed.yml` fires only on `release: types: [published]` — but the hazard arms the
moment someone publishes, and until the run below happens nobody knows which side of it we are on.

`platform: any` because the build happens on a GitHub runner and the manifest can be read from any
machine. No operator Mac is required to SCORE this; a release run is.

## The gate — what must be observed, in order

On the next macOS release run (a `v*` tag push; see the traps below before firing one):

1. The macOS job's `Looking for artifacts in:` block lists `.../bundle/macos/GameLib.app.tar.gz`
   and `.../GameLib.app.tar.gz.sig` — it already did — AND the `Found artifacts:` block now lists
   them too. The asymmetry between those two lists is the exact shape the predecessor measured;
   its disappearance is the primary evidence.
2. The job does NOT end `Signature not found for the updater JSON. Skipping upload...`.
3. The release carries `GameLib.app.tar.gz` and `GameLib.app.tar.gz.sig` as assets.
4. `latest.json` `platforms` contains a `darwin-aarch64` key whose `url` points at the
   `.app.tar.gz` and whose `signature` is non-empty, ALONGSIDE the existing `linux-x86_64*` keys —
   the Linux entries surviving is half the result, not a given.
5. `pub_date` is the macOS leg's timestamp or later, not a stale Linux-leg one.

Score all five. Item 4 alone can be satisfied by a manifest that lost the Linux entries.

## Traps, carried forward from measured history

- **Do not fire a throwaway tag to test this.** `tauri-action` writes `tagName: v__VERSION__`, so a
  test tag still writes the REAL draft release; one partial run already left `latest.json`
  Linux-only with the macOS assets gone. Recorded under
  `a-throwaway-release-tag-still-writes-the-real-release`.
- Pushing a `v*` tag is intermittently refused by the auto-mode classifier as a compound command
  and allowed when split into its own call; `workflow_dispatch` is worse here, it tags `v0.7.0` for
  real.
- The macOS leg has sat 2h05m inside `xcrun notarytool submit --wait` once and 1m09s another time
  on the same configuration. A slow run is not by itself evidence of anything.
- `dmg` and `app` now both build. Whether the `.app.tar.gz` is produced from the NOTARIZED and
  STAPLED app or from a pre-notarization copy was NOT determined at desk — tauri-bundler's
  ordering was not read. If item 4 passes, that is still worth checking before an update is
  shipped to a user, because an updater payload that fails Gatekeeper on extraction would pass
  every check in this list.

## Windows — stated so it is not mistaken for measured

`nsis` IS in the bundler's updater-enabled enumeration (`app, appimage, msi, nsis`), so the Windows
config is not making the predecessor's mistake. That is a fact about the bundler's own list and
NOTHING MORE: the Windows leg has never produced an artifact at all — it dies at step 5
`install-deps`, tracked by `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`
— so no Windows updater artifact has ever been observed either. Do not fold the Windows half into
this todo's result; it is a different untested leg.
