# Measured evidence — 2026-09-23 macOS release live gate

Every string below was captured from the run log, the live release API, or a local command in
this session. Use these EXACT strings. Do not paraphrase, do not round, do not add claims.

## The run

- Tag `v0.7.0-notarize-test3` at commit `c946239ce`; GitHub Actions run `35841476015`.
- macOS job `107117309605`, `macos-latest`, `--target aarch64-apple-darwin`: **success**, 13m50s.
- Linux job: success.
- Windows job: **failure** at step 5 `install-deps`. Cause belongs to the separate pending todo
  `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`:
  `tar: gogdl/_internal/Python: Cannot create symlink to 'Python.framework/Versions/3.12/Python': No such file or directory`
  then `Error: tar extraction failed (exit 2)`. This is the ONLY reason the overall run reads
  `failure`. Cross-link it; do not adopt it into the notarization todo.

## macOS step timings (from the jobs API)

| step | conclusion | duration |
| --- | --- | --- |
| 18. Sign every Mach-O in the macOS helper tree before bundling | success | 0:00:23 |
| 19. Run tauri-apps/tauri-action@v1 | success | 0:08:32 |
| 20. Diagnose a notarization timeout (diagnostic only, never fails the job) | skipped | — |

## Notarization, verbatim from the job log

```
2026-09-23T09:21:59Z Notarizing /Users/runner/work/GameLib/GameLib/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/GameLib.app
2026-09-23T09:23:08Z Notarizing Finished with status Accepted for id 0f65332c-56c8-484d-822a-13163bc14ddb (Processing complete)
2026-09-23T09:23:08Z Stapling app...
```

Elapsed 1m09s. `grep -c 'Notarizing'` over the job log = 2, i.e. exactly these two lines.

NOTE for honesty: the log line `echo "::warning::Apple notarization credentials are set but
signing is not fully configured; skipping notarization"` DOES appear in the log, but it is the
step's own SCRIPT SOURCE being echoed by the runner (cyan `[36;1m` prefix), not an emitted
annotation. The only real `##[warning]` in the whole macOS job is the Node.js 20 deprecation
notice. Do not cite the echo as if notarization was skipped.

## Downloaded artifact

- `GameLib_0.7.0_aarch64.dmg`, 97083599 bytes, from draft release `378785323`.
- sha256 `c74717b59421119eaacce55c51ff153222c9e03296f87d817ed422423dba669c`.
- `xattr -l` showed `com.apple.diskimages.recentcksum` and `com.apple.provenance` only —
  **no `com.apple.quarantine`**, because it was fetched via the GitHub API rather than a browser.

## Recipe step 2

```
Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
CodeDirectory v=20500 size=26621 flags=0x10000(runtime) hashes=821+7 location=embedded
Timestamp=23 Sep 2026 at 9:21:45 PM
Notarization Ticket=stapled
TeamIdentifier=S7U223QWXJ
Sealed Resources version=2 rules=13 files=514
```

```
GameLib.app: accepted
source=Notarized Developer ID
origin=Developer ID Application: grayson mitchell (S7U223QWXJ)
SPCTL_RC=0
```

```
Processing: .../GameLib.app
The validate action worked!
STAPLER_RC=0
```

## Recipe step 3 — per-binary

All four: `Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)`,
`flags=0x10000(runtime)`, `TeamIdentifier=S7U223QWXJ`, timestamped.

| binary (under Contents/Resources/build/bin/arm64/darwin) | entitlements |
| --- | --- |
| `legendary/legendary` | none |
| `nile/_internal/Python.framework/Versions/3.12/Python` | none |
| `comet` | none |
| `steam-bridge-helper` | exactly one: `com.apple.security.cs.disable-library-validation` |

## Recipe steps 4 and 5 — both controls run BEFORE the real count

The loop used was the todo's own step-4 loop, unmodified, saved as a `.sh` and invoked by path.

| target | result |
| --- | --- |
| NEGATIVE control: scratch dir, Apple-signed `/bin/ls` + `/bin/cat` + one plain text file | `files=3 mach-o=2 survivors=0` |
| POSITIVE control: untouched local ad-hoc `build/bin/arm64/darwin` | `files=277 mach-o=253 survivors=253` |
| REAL: notarized bundle's `Contents/Resources` | `files=501 mach-o=253 survivors=0` |

## Recipe step 6

Bundle `ditto`'d off the read-only dmg. On the copy:

```
codesign --verify --deep --strict --verbose=2 GameLib.app
  GameLib.app: valid on disk
  GameLib.app: satisfies its Designated Requirement
  rc=0
```

The helper's single entitlement is still present after the copy.

`libsteam_api.dylib` on this machine resolves at
`~/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib`.

`steam-bridge-helper`, run from inside the copied notarized bundle under the REAL profile
(the deliberate real-profile arm of CLAUDE.md's two-profile rule):

```
[S_API FAIL] SteamAPI_Init() failed; ipcserver GetSteamPath failed.
[S_API] SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.
[S_API] SteamAPI_Init(): Could not determine Steam client install directory.
[2026-09-23T09:35:21Z] INIT   InitFlat failed r=1 err=Could not determine Steam client install directory. (is Steam running + signed in?) -- serving HEALTH only until a real session is live
[2026-09-23T09:35:21Z] LISTEN 127.0.0.1:54550 (loopback-only, persistent-channel)
```

Still alive when killed at 10s. THE REASONING: those `[S_API]` lines are emitted BY Valve's
dylib, so `dlopen` SUCCEEDED. It reached `SteamAPI_Init()` and failed only because Steam is not
running — the normal condition, identical to q6w's ad-hoc control (1). The Team ID mismatch is
gone.

Other three from inside the same notarized bundle: `legendary --version` rc=0 ("legendary version
\"0.21.0\", codename \"Lowlife\""), `gogdl --version` rc=0 ("1.3.0"), `nile --version` rc=0
("1.2.0 Robert Speedwagon"), `comet --help` rc=0.

App launched from the copied bundle with `open -n`: `gamelib-shell` and `gamelib-sidecar` both
alive and stable at 5/10/15/20/25/30s. No matching entries in `~/Library/Logs/DiagnosticReports`.

`spctl -a -vvv -t exec` on the copy: `accepted`, `source=Notarized Developer ID`, rc=0.

## What step 6 did NOT cover

1. No `com.apple.quarantine` on the dmg, so the real first-launch Gatekeeper dialog was NEVER
   exercised. `spctl -t exec` is an assessment, not that flow.
2. `steam-bridge-helper` was never spawned BY the sidecar — Steam was not running so the app never
   needed it. What is proven is direct exec from inside the bundle.
3. Recipe step 6's in-app invocations (Epic login via legendary, Amazon library refresh via nile,
   GOG action via gogdl) were NOT performed; they need credentials and a human.

## The updater manifest defect (FILE 2)

`src-tauri/tauri.conf.json`: `bundle.targets` = `['nsis', 'appimage', 'dmg']`,
`bundle.createUpdaterArtifacts` = `true`.

From the macOS job log, in order:

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

tauri-action inputs echoed in the same log: `uploadUpdaterJson: true`,
`uploadUpdaterSignatures: true`, `uploadPlainBinary: false`, `releaseDraft: true`.

Live state of draft release `378785323` AFTER the run:

- assets: `GameLib_0.7.0_aarch64.dmg` (09:24:05), `GameLib_0.7.0_amd64.AppImage` (09:18:45),
  `GameLib_0.7.0_amd64.AppImage.sig` (09:18:46), `GameLib_0.7.0_x64.dmg` (2026-08-28, stale),
  `latest.json` (09:18:47).
- `GameLib.app.tar.gz` and `GameLib.app.tar.gz.sig` are ABSENT entirely.
- `latest.json` content: `"pub_date": "2026-09-23T09:18:46.332Z"` — the LINUX leg's timestamp —
  and `platforms` containing ONLY `linux-x86_64` and `linux-x86_64-appimage`.

THE KEY POINT: p95 item 8 recorded the manifest as "still owed, pending a complete run". This run
WAS complete on macOS — Accepted, stapled, dmg uploaded — and the manifest still gained no macOS
entry. It is NOT reachable by re-running; it needs the config change. That is a CORRECTION to
p95's framing, not a restatement.

## Cleanup owed as of this writing

Tag `v0.7.0-notarize-test3` is still on origin and locally.
