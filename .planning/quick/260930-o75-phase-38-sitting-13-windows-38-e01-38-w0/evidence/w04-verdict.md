# 38-W04 — verdict: PASS (sitting 13, Windows 11, 2026-09-30)

**Bar**, as the item states it (`35-LIVE-GATE.md` criterion 1): the installer completes without
error; GameLib launches, a window appears, and the process survives at least 10 seconds without
crashing.

## Artifact and provenance

- `GameLib_0.7.0_x64-setup.exe`, 112419624 bytes, sha256
  `61d59bfddfb9fb56c26a3cdb6ff27af008fc9ee8a540f11e81842324c03d5281`. It was downloaded with
  `gh release download v0.7.0` from the DRAFT release, and the local hash equals the digest GitHub
  records for the asset.
- The asset was uploaded at `2026-09-29T10:46:19Z`, inside the Windows job window
  (`10:35:12Z`–`10:47:23Z`) of `release-tauri.yml` run `36556473399`, `headSha b48e8948f`. That is
  the same run whose AppImage `38-W05` discharged on in sitting 12. The draft is shared and
  overwritten by later runs, so this timing is strong evidence that the asset came from the run.
  No byte in the artifact names the run, so it is not proof.
- **Not verified:** Authenticode (`Get-AuthenticodeSignature` reports `NotSigned`, as expected for
  an unsigned build). The Tauri updater `.sig` (416 bytes) was downloaded but not checked against
  the updater public key.

## Install

- The existing per-user install at `C:\Users\grays\AppData\Local\GameLib` was v0.7.0, with shell
  mtime 2026-09-25 and 33668608 bytes (`w04-install-before.json`). It was installed over, as the
  operator decided.
- `GameLib_0.7.0_x64-setup.exe /S`: **exit 0 in 8.4 s**, with no elevation prompt (per-user
  install). Afterward (`w04-install-after.json`), `gamelib-shell.exe` is 16554496 bytes with mtime
  2026-09-29T23:44:26+13:00 (10:44:26Z, inside the CI job window) and sha256 `5ADCE1BE…6C63A9F`.
  `gamelib-sidecar.exe` is 121496576 bytes with mtime 10:37:20Z. The uninstall key still reads
  DisplayVersion 0.7.0.
- The silent install did not launch the app.

## Smoke launch (`win_smoke.ts`, output `w04-smoke.txt`)

- Before launch, no `gamelib-shell`/`gamelib-sidecar` was running. The operator had closed the dev
  build because the single-instance mutex is keyed on the user SID.
- The shell was spawned under a fresh `createFakeHomeProfile()` (prefix `gl-w04s13-`), which was
  disposed afterward.
- **Window:** a top-level `GameLib` window was present at the first sample (1618 ms), with handle
  `0x70AD2` throughout.
- **Survival:** alive at **12 of 12** one-second samples, with no exit before teardown.
- **Children:** the bundled `gamelib-sidecar.exe` (PID 21276, from the install directory) and
  WebView2 `msedgewebview2.exe` 154.0.4258.37 were present at every sample.
- **UI:** `w04-t12-window.png` (cropped to the window) shows the real app: the tab bar, Library
  with **All Games 0**, and the GameLib 0.7.0 what's-new dialog. An empty library fits a cold
  profile.
- **Teardown:** `taskkill /T /F` on the shell. Afterward no `gamelib-*` process remained.

## Honest limits

- ONE host, ONE artifact, ONE launch, ONE DPI (1.25).
- **Fake-profile isolation is PARTIAL on Windows.** The eight env variables redirect the Node
  sidecar, and the empty library is consistent with that. The Tauri shell resolves its own folders
  (app data, the WebView2 user-data folder) through the Windows known-folder API, which ignores
  those env variables, so the shell side very likely ran against the operator's real
  `%LOCALAPPDATA%`/`%APPDATA%` locations. The harness captured no app stdout/stderr, so no
  real-profile data entered the evidence. This limit is structural to Windows and not specific to
  this sitting. It is worth a line in CLAUDE.md's two-profile section.
- The installer was run silently (`/S`), so the interactive NSIS pages were not exercised.
- Updater-signature verification and signed-build behaviour (SmartScreen) are out of scope.
