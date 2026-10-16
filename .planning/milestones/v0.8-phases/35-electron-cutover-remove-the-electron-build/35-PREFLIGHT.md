# 35 Preflight — Measured Answers

Phase 35 (electron-cutover-remove-the-electron-build), plan 01. This file records measured
answers to the five research open questions and the two pattern-mapper decisions `35-RESEARCH.md`
and `35-PATTERNS.md` deliberately left open, each with the exact command that produced it. No
production source file is modified by this plan — see Task 1's notes below for the one
file that WAS temporarily modified and restored during measurement.

Downstream plans (35-04, 35-07, 35-09, 35-12, 35-13, 35-14, 35-19) read their own section here
instead of re-deriving these facts.

## OQ-1

**Question (D-14):** does `require('node:sea').isSea()` return the SAME value inside a
`worker_threads.Worker` spawned from the sidecar's main thread as it does on the main thread
itself? This gates D-14's plan to make `app.isPackaged` a third caller of
`isPackagedSidecar()` (`src/backend/sidecar/humbleFlowRegistration.ts:159`), which
`devSecretVault.ts`'s fail-closed guardrail (c) trusts.

**Probe:** `meta/probeSeaInWorker.ts` (committed by this task). Mirrors `isPackagedSidecar()`'s
exact guarded shape (`require('node:sea')`, typed `{ isSea: () => boolean }`, `catch` ->
`'throw'`) on both the main thread and inside an `eval`-mode `worker_threads.Worker`, and prints
one line: `main=<v> worker=<v>`.

### (a) Dev / unpackaged context

Command:

```
node meta/runTs.cjs --bundle --platform=node --target=node22 meta/probeSeaInWorker.ts
```

Raw output:

```
main=false worker=false
```

Exit code: `0`.

### (b) Packaged SEA sidecar context

Route used: **route 1 from the plan's named substitute** — a temporary
`GAMELIB_PROBE_SEA_WORKER=1` env-gated branch added to the sidecar's own entry
(`src/sidecar/index.ts`), performing the identical two evaluations inline (main thread +
`eval`-mode worker) and logging the same `main=<v> worker=<v>` line, then running the real
`pnpm build:sidecar-sea` output with that env var set.

This branch was **temporary and has been fully removed**. Before editing, the original file was
snapshotted and its SHA-256 recorded
(`6e909fe6a1c77f525113c903cd93b31ecd2c39bffe577f4f344a9f68dfefcbe2`); after restoring via `cp`
from that snapshot (never `git checkout --`, per this plan's constraints —
`.husky/post-checkout` -> `download-helper-binaries` throws), the restored file's SHA-256 was
re-verified to match the original exactly, and `git status --porcelain` / `git diff --stat` were
confirmed clean for `src/sidecar/index.ts`. The compiled SEA binary
(`src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`, gitignored, CI-built artifact per its
own `.gitignore` header) was then rebuilt a second time from the clean, restored entry file so no
stale artifact on disk carries the temporary probe code.

Build command:

```
pnpm build:sidecar-sea
```

(chains `pnpm build:sidecar` then `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/buildSidecarSea.ts`,
per `package.json` line 36. Native/dev target, no cross-build: `aarch64-apple-darwin`.)

Run command (equivalent to, run via `child_process.spawnSync` for reliable stdout capture):

```
GAMELIB_PROBE_SEA_WORKER=1 src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin
```

Raw output line (stdout, among sidecar boot log lines which are expected — the probe branch runs
before `init()` starts the RPC loop, so nothing else consumes stdout in this mode):

```
main=true worker=true
```

Exit code: `0`.

### Disposition: `AGREES`

Both contexts evaluate `isSea()` identically within themselves (dev: `false`/`false`; SEA:
`true`/`true`). D-14's unification of `isPackagedSidecar()`'s value across a worker-thread and
main-thread caller is safe as designed. Plan 35-04 may proceed treating `app.isPackaged` as a
third caller of `isPackagedSidecar()` without owing a new worker-thread-context test case to
`src/backend/sidecar/__tests__/devSecretVault.test.ts` on the strength of THIS measurement (the
file is named here per the plan's instruction to always name it, not because a new case is
required — disposition is `AGREES`, not `DIVERGES`/`UNMEASURED`).

**Handoff:** `meta/probeSeaInWorker.ts` is throwaway and is deleted by plan 35-18, which owns the
final `electron`-absence / dead-file sweep for this phase (recorded so it does not become
permanent debris).

## OQ-4

**Question (D-16):** does `.github/workflows/release-tauri.yml` perform ANY runtime check on the
built artifact, or does it only build and upload? This determines whether "CI artifacts plus a
smoke launch" already has its smoke-launch half satisfied by CI, or whether that half is still an
open commitment.

Command (full-file read, not a step-name grep — a runtime check could be an inline `run:` on any
step):

```
wc -l .github/workflows/release-tauri.yml
sed -n '1,436p' .github/workflows/release-tauri.yml
```

Findings:

- 436 lines total.
- Matrix legs (`strategy.matrix.include`, lines 50-63): `macos-latest` /
  `--target aarch64-apple-darwin`, `macos-latest` / `--target x86_64-apple-darwin`,
  `ubuntu-24.04`, `windows-latest`. Four legs total.
- Reading every step end to end: no step launches the built app binary, no step runs a headless
  smoke check (no `xvfb`, no `--headless`, no invocation of the produced `.app`/`.exe`/AppImage),
  and no step asserts anything about the produced bundle's CONTENTS or BEHAVIOUR at runtime. The
  closest thing to a runtime check is `pnpm verify:updater-key`, which signs a throwaway probe
  file with the real Tauri signer and compares its key id against the committed
  `tauri.conf.json` pubkey — this validates the UPDATER SIGNING KEY, not the built application
  artifact, and runs before the app is even built.
- The file's LAST step (line 429) is `tauri-apps/tauri-action@v1` (`releaseDraft: true` at line
  433, `prerelease: true` at line 435). Nothing follows it. This step builds, optionally signs,
  and uploads to a draft GitHub Release — it does not execute the artifact.

### Disposition: `NEEDS-HUMAN-SMOKE`

CI never launches the built artifact. "CI artifacts plus a smoke launch" is NOT already satisfied
by the workflow — a human must download a CI-built artifact and launch it on real Windows/Linux
hardware (and ideally both macOS legs). This is a scheduling commitment, not a code change, and
belongs in a `checkpoint:human-verify` in whichever plan owns the final runtime verification gate
(per this phase's own success criteria, that is plan 35-19).

**Does closing user-deferred plan `34-07` (D-00c) change this answer?** No. `34-07`'s own header
comment inside `release-tauri.yml` (lines 4-8: "this pipeline has never completed a real tag-push
run — 34-07's live `v*` gate (REQ-34-09) is deliberately deferred") is about proving the pipeline
executes successfully end-to-end on a real tag push — a build/upload-success check, not a
launch-and-verify check. Closing `34-07` would confirm the workflow's four legs all produce
artifacts; it does not add a step that launches any of them. `35-CONTEXT.md`'s framing of `34-07`
as an available sequencing fallback stands, but it changes WHEN the smoke-launch commitment must
be honoured (after a proven-green pipeline exists), not WHETHER one is still needed.

## PD-A

**Question:** should plan 35-07 extend the hand-rolled single-instance guard to Windows, or
replace it with `tauri-plugin-single-instance`?

Command:

```
sed -n '5504,5620p' src-tauri/src/main.rs
sed -n '5388,5470p' src-tauri/src/main.rs
sed -n '6030,6060p' src-tauri/src/main.rs
grep -n "fn protocol_url_arg\|#\[cfg(test)\]\|cfg(not(unix))" src-tauri/src/main.rs
```

**D-44-A rejection sentence, restated verbatim from `main.rs:5507`:**

> "a plugin-based guard cannot run before `tauri::Builder::default()`, so a secondary process
> would still reach `.setup()` and spawn its own sidecar before the plugin could ever tell it 'you
> are secondary'."

(Read in full context at `main.rs:5504-5511`, immediately above `acquire_single_instance()`.)

Three facts recorded:

1. **Does the mechanism still hold at the pinned `tauri = 2.11.5`?** This preflight did NOT
   independently re-verify `tauri-plugin-single-instance`'s current callback-ordering guarantee
   against 2.11.5 — that would require reading the crate's own source or changelog, which is out
   of scope for this measurement pass. **Stated plainly rather than assumed:** this fact is
   UNCONFIRMED by this section. Plan 35-07, which owns the actual choice, must re-check the
   crate's documented ordering guarantee at the pinned version before treating D-44-A's mechanism
   as still accurate — do not treat this preflight section as having closed that question.
2. **Windows guard status — confirmed.** `acquire_single_instance()` (`main.rs:5537`) is
   `#[cfg(unix)]`-gated. `main.rs:5905-5943`'s `#[cfg(not(unix))]` arm sets
   `single_instance_socket_path_var`/`primary_listener` to `None` unconditionally and never calls
   `acquire_single_instance()`. Windows currently ships with NO single-instance guard at all.
   `U-34.5-18` (referenced at `main.rs:5570` and `main.rs:5868`) records this gap as accepted.
3. **`protocol_url_arg()` as the shared validation choke point — confirmed.** `protocol_url_arg()`
   (`main.rs:5388`) is called from three sites: the primary-process argv path (`main.rs:5435`),
   the secondary-process's own re-derivation of the URL to forward before it exits
   (`main.rs:5922`), and the primary's socket-accept loop re-validating the payload it reads off
   the Unix socket (`main.rs:6039`, inside a `trimmed.to_string()` single-element array — i.e. the
   socket payload is NOT trusted as pre-validated; it is re-run through the exact same parser).
   It already has `#[cfg(test)]` unit coverage: seven test functions starting at `main.rs:8277`
   (`protocol_url_arg_finds_url_among_the_vdf_launch_options`,
   `protocol_url_arg_returns_none_when_absent`, `protocol_url_arg_rejects_foreign_schemes`,
   `protocol_url_arg_rejects_control_characters`, `protocol_url_arg_rejects_oversized_url`,
   `protocol_url_arg_returns_the_first_match`, `protocol_url_arg_accepts_a_runnerless_url`).

**Options, evidence only, no binding choice made (plan 35-07 owns the decision):**

- **(A) Extend the hand-rolled guard to Windows** with a named pipe, mirroring the existing
  connect-first/bind-second + fail-open shape (`acquire_single_instance()`,
  `main.rs:5537-5563`). Tradeoff: preserves the ordering guarantee D-44-A relies on (no plugin
  callback race) and reuses the already-tested `protocol_url_arg()` choke point, at the cost of
  hand-maintaining a second OS-specific IPC primitive (named pipe vs Unix socket) rather than
  depending on a maintained crate.
- **(B) Adopt `tauri-plugin-single-instance`.** Tradeoff: removes the Windows gap and the
  hand-maintenance burden of a second platform-specific IPC mechanism, at the cost of possibly
  accepting a double sidecar spawn on the secondary process (per D-44-A's mechanism — see fact 1
  above, which this section could NOT independently confirm still holds at 2.11.5).
- **(C) Register `gamelib://` on macOS and Linux only, ship no Windows registration.** Tradeoff:
  avoids both the named-pipe maintenance cost of (A) and the double-spawn risk of (B) entirely, at
  the cost of a permanent, user-visible Windows deep-link gap, which would need to be recorded
  under D-05's fail-loud-with-a-clear-log-line rule rather than silently dropped.

## PD-B

**Question:** for each of the 22 `electronStub.ts` exports, what is its non-test, non-mock
consumer census EXCLUDING `src/backend/main.ts` and `src/preload/index.ts` (both die at the point
of no return), and what disposition follows: `SURVIVES`, `DEAD`, or `SURVIVES-AS-GAP`?

Commands:

```
grep -n "^export" src/backend/sidecar/electronStub.ts
grep -rn "from 'electron'" src/backend src/sidecar src/preload --include='*.ts' \
  | grep -v '__tests__\|\.test\.\|/mocks/\|__mocks__'
```

(The first pass of this census used a bare `grep -rl '\bName\b'`, which false-positived heavily
on common identifiers reused elsewhere in the codebase — e.g. `Menu`/`screen`/`session` as MUI
component names or unrelated local variables in `src/frontend/`. `electronStub.ts` is a
BACKEND-only concern, consumed only via files that literally `import { X } from 'electron'`
(resolved to the stub by the SEA/dev build's alias/require-hook mechanism, not by React
components). The census below uses that precise import-line grep instead, which is exhaustive for
this stub's actual consumer set.)

`grep -n "^export"` confirms exactly 22 export statements:
`ElectronStubTransport` (interface), `bindTransport` (function), `IpcHandler` (type),
`IpcListener` (type), `handlerRegistry` (const), `listenerRegistry` (const), `ipcMain`, `app`,
`dialog`, `Notification` (class), `safeStorage`, `shell`, `BrowserWindow`, `session`,
`nativeImage` (re-export), `screen`, `net`, `Menu`, `protocol`, `powerSaveBlocker`, `clipboard`,
`Tray` (class).

| Export | Consumer count (excl. main.ts/preload) | Consumer file(s) | Disposition |
|---|---|---|---|
| `ElectronStubTransport` | 0 | none — only self-referenced inside `electronStub.ts` | `DEAD` |
| `bindTransport` | 2 | `backend/sidecar/bootstrap.ts`, `backend/sidecar/sidecarRpc.ts` | `SURVIVES` |
| `IpcHandler` | 0 | none — only self-referenced inside `electronStub.ts` | `DEAD` |
| `IpcListener` | 0 | none — only self-referenced inside `electronStub.ts` | `DEAD` |
| `handlerRegistry` | 3 | `bootstrap.ts`, `eosOverlayFlowRegistration.ts`, `sidecarRpc.ts` | `SURVIVES` |
| `listenerRegistry` | 6 | `appShellFlowRegistration.ts`, `loggerFlowRegistration.ts`, `settingsFlowRegistration.ts`, `shellFilesFlowRegistration.ts`, `sidecarRpc.ts`, `storeWriteHandlers.ts` | `SURVIVES` |
| `ipcMain` | 1 | `backend/ipc.ts` (itself imported by 20+ live sidecar files — `online_monitor.ts`, `tray_icon.ts`, every `*/ipc_handler.ts`, etc. — so `ipc.ts` is not a main.ts-only file) | `SURVIVES` |
| `app` | 25+ | `save_sync.ts`, `launcher.ts`, `protocol.ts`, `utils.ts`, `main_window.ts`, `logger/uploader.ts`, `constants/paths.ts`, `tray_icon/tray_icon.ts`, `storeSearch/cheapshark.ts`, `humble/userAgent.ts`, `utils/plausible.ts`, `utils/inet/downloader/index.ts`, `discounts/fetchDiscounts.ts`, `shortcuts/*`, `steamgrid/utils.ts`, `migration/migrations/legendary.ts`, `storeManagers/steam/{bottle,constants}.ts`, `storeManagers/{gog,nile,zoom}/*` | `SURVIVES` |
| `dialog` | 7+ | `protocol.ts`, `utils.ts`, `dialog/dialog.ts`, `utils/openDialog.ts`, `storeManagers/steam/library.ts`, `storeManagers/storeManagerCommon/games.ts`, `storeManagers/legendary/eos_overlay/eos_overlay.ts` | `SURVIVES` |
| `Notification` | 3 | `utils.ts`, `dialog/dialog.ts`, `humble/expirationAlerts.ts` | `SURVIVES` |
| `safeStorage` | 3 | `humble/secretStore.ts`, `steamgrid/secureKey.ts`, `storeManagers/steam/tokenStore.ts` | `SURVIVES` |
| `shell` | 4 | `updater.ts`, `utils.ts`, `shortcuts/shortcuts/shortcuts.ts`, `storeManagers/steam/games.ts` | `SURVIVES` |
| `BrowserWindow` | 4 | `utils.ts`, `main_window.ts` (type + value), `storeManagers/storeManagerCommon/games.ts`, `utils/openDialog.ts` (type-only) | `SURVIVES` |
| `session` | 2 | `humble/user.ts`, `storeManagers/legendary/user.ts` (matches OQ-3's already-resolved census) | `SURVIVES` |
| `nativeImage` | 4 | `updater.ts`, `tray_icon/tray_icon.ts`, `shortcuts/shortcuts/shortcuts.ts`, `shortcuts/nonesteamgame/steamhelper.ts` | `SURVIVES` — caveat: MEMORY.md's `sidecar-electronstub-nativeimage-dead.md` records this stub's actual runtime implementation as functionally hollow under the sidecar; consumers exist and the export itself is not code-dead, but its behaviour is a known gap plan 35-13 inherits, not fixes |
| `screen` | 1 | `main_window.ts` | `SURVIVES` |
| `net` | 2 | `online_monitor.ts`, `humble/adapter.ts` | `SURVIVES` |
| `Menu` | 2 | `tray_icon/tray_icon.ts`, `storeManagers/storeManagerCommon/games.ts` | `SURVIVES` — confirms plan-time partial finding exactly |
| `protocol` | 1 | `backend/images_cache.ts` (the `imagecache` scheme, D-05-accepted) | `SURVIVES-AS-GAP` — confirms plan-time partial finding exactly |
| `powerSaveBlocker` | 1 | `launcher.ts` | `SURVIVES` |
| `clipboard` | 1 | `utils/ipc_handler.ts` | `SURVIVES` |
| `Tray` | 1 | `tray_icon/tray_icon.ts` | `SURVIVES` — confirms plan-time partial finding exactly |

`PLATFORM_EXPORT_COUNT: 19`

Dropped names (3, `DEAD`): `ElectronStubTransport`, `IpcHandler`, `IpcListener`. All three are
internal plumbing TYPES for the stub's own transport-binding mechanism (`bindTransport`'s
parameter type and the two registries' value types) — they are exported but never imported by any
other file, so by this census's own zero-consumer rule they are dead weight the platform module
does not need to re-export. **This is a correction to `35-CONTEXT.md`'s framing of "same 22
exports"**: 19 of the 22, not all 22, have a live external consumer. Plan 35-13 should either drop
these three re-exports (making them internal-only to wherever the platform module's transport
plumbing lives) or keep them for API-shape parity at zero functional cost — either is valid, but
the count is 19 live surface + 3 internal-only types, not 22 uniformly load-bearing exports.

## CENSUS-FLATPAK

Command:

```
find flatpak flathub -type f
grep -n "flatpak\|flathub" package.json
```

Raw output — files: `flatpak/com.heroicgameslauncher.hgl.png`, `flatpak/flathub.json`,
`flatpak/com.heroicgameslauncher.hgl.desktop`, `flatpak/prepareFlatpak.js`,
`flathub/update-flathub.ts`, `flatpak/patches/0001-timidity-fix-missing-includes.patch`,
`flatpak/templates/com.heroicgameslauncher.hgl.metainfo.xml.template`,
`flatpak/templates/com.heroicgameslauncher.hgl.yml.template` — 7 files under `flatpak/` plus
`flathub/update-flathub.ts`, confirming the plan-time partial finding exactly.

`package.json` scripts naming `flatpak`/`flathub` (5, one more than the plan-time partial list —
`dist:flatpak` was not named in the plan's own partial finding, and `flatpak:build`, not
`flatpak-build`, is the real script name):

```
"release:updateFlathub:ci": "tsc flathub/update-flathub.ts ... && node flathub/update-flathub.js"
"dist:flatpak": "pnpm dist:linux appimage && pnpm flatpak:prepare && pnpm flatpak:build"
"flatpak:build": "cd flatpak-build && flatpak-builder build com.heroicgameslauncher.hgl.yml --install --force-clean --user"
"flatpak:prepare": "node ./flatpak/prepareFlatpak.js"
"flatpak:prepare-release": "node ./flatpak/prepareFlatpak.js release"
```

This is the deletion manifest plan 35-12 consumes for the flatpak/flathub removal — 7 files under
`flatpak/`, `flathub/update-flathub.ts`, and these 5 `package.json` scripts.

## CENSUS-E2E

Command:

```
grep -n "_electron\|build/main/main.js" e2e/helpers.ts
grep -rl "helpers" e2e/*.spec.ts
grep -n "test:e2e" package.json
```

Raw output: `e2e/helpers.ts` imports `_electron as electron` from `@playwright/test` (line 4) and
launches `join(__dirname, '../build/main/main.js')` (line 9) via `electron.launch(...)`
(line 21). All five spec files under `e2e/` (`api.spec.ts`, `categories.spec.ts`,
`languages_selector.spec.ts`, `settings.spec.ts`, `webview_controls.spec.ts`) import from
`helpers.ts`. The `test:e2e` script (literal, `package.json` line 44) is:
`"electron-vite build && cross-env CI=e2e xvfb-maybe -- playwright test"`.

**Stated plainly, in this plan's own words:** the `CI=e2e` harness is an Electron-launching
harness, full stop — it starts the app via Playwright's `_electron` launcher against a built
Electron main-process file (`build/main/main.js`), which only exists because `electron-vite
build` produces it. It has no Tauri equivalent today and does not survive the Electron cutover
unmodified. `35-CONTEXT.md`'s D-19 and the ROADMAP both describe `CI=e2e` as a ready-made, cheap
harness for proving `R-34.5-G1-PKG` half (b) (a runtime smoke check) — that framing is a
**correction owed to those documents**: the harness as it exists today dies with Electron and
cannot be pointed at a Tauri build without first replacing its launch mechanism (Playwright's
`_electron` has no Tauri-native equivalent; a Tauri smoke harness needs a different driving
mechanism entirely, e.g. WebDriver/`tauri-driver`, or a CDP-based approach in the spirit of
MEMORY.md's `electron-live-gate-drivable-over-cdp.md` line — that line documents a DIFFERENT gate
having proven CDP-drivability for an Electron target, not this harness, and not yet for Tauri).
Plans 35-04 and 35-14 depend on this correction being on the record before they plan around
`CI=e2e` as if it were free.

## CENSUS-MAINTS-EDGES

Command:

```
grep -rn "backend/main'\|backend/main\"\|from '\.\./main'\|from './main'" src/sidecar/ src/backend/sidecar/
```

Raw output:

```
none
```

Zero matches (grep exit code 1). D-17's required answer holds: `src/sidecar/index.ts` and
`src/backend/sidecar/` have zero import edges into `src/backend/main.ts`. Plan 35-14's
point-of-no-return ordering (delete `main.ts`/`src/preload/index.ts` without first needing to
untangle a live import from the sidecar side) is valid on this evidence.
