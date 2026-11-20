---
status: human_needed
score: 8/8 must-haves verified in code
human_verification:
  - test: "Live gate: operator publishes gst-libav-1.24.13-macos-x86_64.tar.gz to the grayson-mitchell/GameLib release, then launches Unclaimed World (284100) on macOS CrossOver"
    expected: "Overlay downloads, installs, GST_PLUGIN_PATH ends in overlays/gst-libav-1.24.13/lib/gstreamer-1.0, main-menu WMV plays"
    why_human: "Asset is intentionally unpublished; needs the real payload and a CrossOver bottle. Also run pnpm build:overlay-archive on the real payload and confirm 'pinned: match' before upload."
---

# Quick 261027-n77 Verification

**Status:** human_needed. No code gaps found.

## Checks run
- `npx jest` on the 6 suites (archive, install, overlays, steamBridgeKnownFixes, AboutDialog x2): 6/6 suites, 150 tests pass.
- `npx tsc --noEmit`: clean (exit 0).
- `npx prettier --check` on the new backend, common and meta files: clean.

## Specific code confirmations
(a) Sha before parse, per-file after: PASS. `knownFixOverlayInstall.ts` checks `buf.length` and `sha256Hex(buf)` against the pins (lines 212-219) before `readOverlayTarGz` (222). It then extracts to a temp dir and runs `verifyInstalledOverlay` for per-file size and sha256 and the exact plugin-dir listing (234) before the rename into place.

(b) Tar reader strictness: PASS. `knownFixOverlayArchive.ts` rejects:
- a bad checksum;
- a non-ustar magic or version;
- any typeflag other than '0', which covers symlinks, hardlinks, directories and pax;
- a ustar prefix field;
- absolute, `..`, `.`, empty-segment, backslash and non-ASCII paths;
- paths outside the expected set, duplicates, oversized or truncated entries and missing entries.

gunzip is capped by `maxOutputLength`. Extraction is in Node, with no child process.

(c) Profiles cannot supply a URL or sha: PASS. `validateOverlayEntries` allows only the keys `id` and `target`. Any extra key is rejected with a warning. The id is looked up in the in-code catalogue, and the target must match the catalogue. The URL is built from the catalogue (`overlayArchiveUrl`). `overlays` is added to `TIER2_PROFILE_KEYS`, not the tier-1 list, so the remote layer cannot carry it.

(d) GST_PLUGIN_PATH: PASS. `appendPathList` splits on ':', drops empty segments, dedupes by normalised absolute path and appends. The base value includes tier-1 env, the user's `enviromentOptions` and `process.env`. A warning is logged if `GST_PLUGIN_PATH_1_0` shadows it. Both the Steam bridge (`bridgeKnownFixes.ts`) and `prepareWineLaunch`/`games.ts` (`withKnownFixEnv`) are wired. Env vars are logged via `logKnownFixEnv` with a source tag in both paths.

(e) Failure paths never throw: PASS. `installOnce` wraps everything in try/catch and returns null after a warning. `ensureOverlayInstalled` has an outer try/catch. `resolveKnownFixOverlayEnv` catches and returns `{}`. The covered failures include offline, non-200, timeout, size or sha mismatch, hostile archive, per-file mismatch and rename races. A temp dir is cleaned up in `finally`.

(f) Timers and bounds: PASS. The 120 s deadline timer is `unref`'d and cleared in `finally`. The abort controller is registered and deleted through the app aborthandler, and `Promise.race` against abort handles fetchers that ignore the signal. The axios request has a 30 s timeout, `maxContentLength` and `maxBodyLength` equal to the pinned archive size, and `validateStatus` of 200 only. Concurrent installs share an in-flight promise. Nothing runs at boot.

## Other must-haves
- Idempotent: `verifyInstalledOverlay` runs first and returns early with no fetch (the test suite covers this).
- Platform gate: darwin and crossover only, otherwise a debug line.
- Install location: GameLib-owned `knownFixOverlaysPath` under the app folder, not the game folder or bottle.
- Profile: `public/fixes/284100-steam.profile.json` carries `{id: gst-libav-1.24.13, target: gstreamer-plugin-path}`.
- LGPL: `THIRD-PARTY-NOTICES.md`, the publish checklist doc, the About dialog change and the `gamelib.json` string in the locale catalogs (the commit touched `gamelib.json` and `gamelib.mt.json` per locale). The AboutDialog tests pass.
- Build script: `meta/buildOverlayArchive.ts` and the `build:overlay-archive` package.json script exist. The script verifies each source file against its pin, builds, self-reads, and compares to the pinned sha. Exit 3 on mismatch. The writer zeroes volatile header fields and pins the gzip mtime and OS byte.
- Nothing published: no release or upload code was added.
- `fixes/local/284100-steam.json` still exists at `~/Library/Application Support/gamelib/fixes/local/`. The commits delete no files, and no `knownBad` line was changed (the only diff mention is in a todo doc, as future-step text).

## Caveats (non-blocking)
- I did not re-derive the pinned archive sha. Whether the pin matches the real payload is only confirmable by running the build script on that payload. That is part of the human item.
- `find-deadcode` findings are pre-existing and out of scope, as stated.
- The working tree has an unrelated uncommitted modification to `src/backend/knownFixesRegistry.ts`, which is the orchestrator's work.

## Gaps
None.
