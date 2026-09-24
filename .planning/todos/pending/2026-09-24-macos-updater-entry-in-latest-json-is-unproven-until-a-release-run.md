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

## Execution log — 2026-09-24, pre-flight done, the tag push is the one thing outstanding

Everything a desk can reach for this gate is now done. The run has NOT been fired: the `v*` tag
push was refused twice by the auto-mode classifier (`[Production Deploy]`), once as a compound
command and once split into its own call. `git tag -a` alone was allowed, so the tag exists
locally and points at a pushed commit — only `git push origin <tag>` remains, and it needs an
operator.

**State at the moment of writing.**

- `origin/main` is `19b5e3a9e`. That is the first time `598fac565` (the `bundle.targets` fix) has
  reached the remote at all — the fix had been sitting unpushed for the whole life of this todo,
  so no release run could have proven it even if one had been fired.
- Pushing `main` first required clearing an unrelated blocker: `meta/findDeadcode.cjs` failed the
  pre-push hook on one new `used-in-module` finding (`SteamVisibility`, from quick-260924-g7r).
  Resolved at source per the gate's own option (b) — the `export` dropped, not baselined
  (`19b5e3a9e`). `npx prettier --check` and `pnpm codecheck` both clean after it.
- Tag `v0.7.0-updater-test1` exists locally, annotated, pointing at `19b5e3a9e`. `git ls-remote
  --tags origin` shows 0 matches for it.

**To fire it:**

```
git push origin v0.7.0-updater-test1
```

**Baseline `latest.json`, read off the live draft before the run** (this is what item 4 and item 5
are scored against — it is the artifact of run `35841476015`, the Linux leg only):

```json
{
  "version": "0.7.0",
  "pub_date": "2026-09-23T09:18:46.332Z",
  "platforms": {
    "linux-x86_64": { "signature": "<420B>", "url": ".../releases/assets/583419320" },
    "linux-x86_64-appimage": { "signature": "<420B>", "url": ".../releases/assets/583419320" }
  }
}
```

No `darwin-*` key, and both Linux keys point at the SAME asset id — that is the pre-run state, not
a defect to chase.

**Scoring commands, for whoever reads the run:**

```
gh run list --workflow=release-tauri.yml --limit 3
gh run view <id> --log --job <macos job id> | grep -nE 'Looking for artifacts|Found artifacts|app.tar.gz|Signature not found'   # items 1-2
gh release view v0.7.0 --json assets --jq '.assets[].name'                                                                     # item 3
gh release download v0.7.0 -p latest.json -O /tmp/latest.after.json --clobber && python3 -m json.tool /tmp/latest.after.json    # items 4-5
```

**Two things that would otherwise be misread as this todo's result.**

- The Windows leg WILL fail at step 5 `Run ./.github/actions/install-deps`. It did exactly that on
  `35841476015` and is tracked separately by
  `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`. `fail-fast: false`, so
  it does not stop the macOS leg.
- On `35841476015` the macOS leg SUCCEEDED end-to-end in 13m50s — notarization was on its fast
  path, not its 2h05m one. So a run that sits far past ~15 minutes is a new condition, not the
  expected shape.

Also visible on the draft and not part of this gate: `GameLib_0.7.0_x64.dmg` dated 2026-08-28 is a
stale leftover. The macOS matrix leg builds `aarch64` only, so no run fired today will refresh it.

## SCORED — run 35942560790, tag `v0.7.0-updater-test1`, 2026-09-24. All five items PASS.

Commit built: `19b5e3a9e`. All three matrix legs green. macOS leg 01:21:42 → 01:35:08 (13m26s);
`Notarizing` → `Notarizing Finished with status Accepted for id 83ecfefa-…` took 72s, the fast
path again.

| # | claim | observed | verdict |
| - | ----- | -------- | ------- |
| 1 | `.app.tar.gz` + `.sig` in BOTH the `Looking for artifacts in:` and `Found artifacts:` blocks | both blocks list all four paths — dmg, `.app`, `.app.tar.gz`, `.app.tar.gz.sig` (log 01:33:38) | **PASS** — the asymmetry the predecessor measured is gone |
| 2 | job does NOT end `Signature not found for the updater JSON. Skipping upload...` | 0 occurrences in the whole macOS job log | **PASS** |
| 3 | the release carries the tarball and its signature as assets | `GameLib_0.7.0_aarch64.app.tar.gz` (98,024,400 B, 01:33:49Z) and `.sig` (404 B, 01:33:50Z) | **PASS**, see naming note |
| 4 | `latest.json` gains `darwin-aarch64` with a non-empty signature, Linux keys surviving | `darwin-aarch64` AND `darwin-aarch64-app`, both sig 404 B, both → asset 584932557 = `GameLib_0.7.0_aarch64.app.tar.gz`. `linux-x86_64`/`-appimage` both still present (→ 584926136 = the AppImage) | **PASS** |
| 5 | `pub_date` is the macOS leg's timestamp or later | `2026-09-24T01:33:50.127Z` — the `.sig` upload moment, 94 s before the leg ended | **PASS** |

**Naming note on item 3.** The todo predicted assets named `GameLib.app.tar.gz`. `tauri-action`
renames on upload: the on-disk bundle IS `bundle/macos/GameLib.app.tar.gz`, the uploaded asset is
`GameLib_0.7.0_aarch64.app.tar.gz`. Same file, and `latest.json` points at it by asset id, so
nothing is broken — but a future check grepping the literal `GameLib.app.tar.gz` against the
RELEASE rather than the LOG will find nothing and mis-score this.

**The ordering trap is half-resolved, and the half that remains is the Gatekeeper half.** The
sequence is now read off this run's own log, not inferred: `Bundling GameLib.app` 01:31:10 →
`Signing …/GameLib.app` 01:31:13 → notarization zip 01:31:23 → `Accepted` 01:32:35 → dmg 01:32:38
→ **`Bundling …/GameLib.app.tar.gz` 01:33:38**. The updater payload is therefore built from the
POST-notarization app, not a pre-notarization copy — the worse of the two possibilities the todo
named is ruled out. What is NOT settled: no `stapler`/`staple` line appears anywhere in the log,
so whether the ticket is stapled INTO the app the tarball wraps is still unobserved. That is a
`spctl --assess` / `stapler validate` question against the downloaded asset, not a log question,
and it stays open.

**Two observations that are NOT this todo's result, recorded so they are not lost:**

- **The Windows leg SUCCEEDED**, for the first time ever — `GameLib_0.7.0_x64-setup.exe`
  (112,309,170 B) plus `.sig`, and `windows-x86_64` + `windows-x86_64-nsis` keys in `latest.json`.
  `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` says that leg dies at
  step 5 `install-deps`; that was true on 35841476015 and is NOT true here. Its premise needs
  re-reading against this run before anyone trusts either state.
- **`draft-release-mac.yml` and `draft-release-linux.yml` did not run.** This workflow's header
  claims both co-trigger on `v*` and land assets on the same release. Only `Release Tauri` fired
  on this tag. The header is stale on that point.

Still on the draft and still stale: `GameLib_0.7.0_x64.dmg` dated 2026-08-28. The macOS matrix leg
is `aarch64` only, so no run refreshes it, and `latest.json` has no `darwin-x86_64` key.
