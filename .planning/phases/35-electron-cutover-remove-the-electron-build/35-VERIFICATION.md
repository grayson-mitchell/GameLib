---
phase: 35-electron-cutover-remove-the-electron-build
verified: 2026-08-30T04:12:40Z
status: gaps_found
score: 11/17 must-haves verified
overrides_applied: 0
re_verification: null
gaps:
  - truth: "REQ-35-20 — the phase closes on a BLOCKING packaged macOS arm64 live gate; its own text says 'Any FAIL means the phase does not close'"
    status: failed
    reason: "35-LIVE-GATE.md is `blocking: true` and its recorded verdict is FAIL — 17 PASS / 4 FAIL / 0 NOT ATTEMPTED over 21/21 measured criteria. The requirement's own closure clause is therefore unmet. Two of the four FAILs (6, 10) are on surfaces THIS PHASE built (tray recent-games, `gamelib://` deep link); their root causes are pre-existing, but the phase shipped new user-facing affordances on top of them without measuring them first."
    artifacts:
      - path: ".planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md"
        issue: "verdict: FAIL. Criteria 6, 10, 14, 16 FAIL."
      - path: "src/backend/protocol.ts"
        issue: "line 15 — `RUNNERS = z.enum(['legendary','gog','nile','sideload'])` omits `steam` while `storeManagers/index.ts` registers six managers including `steam`. `findGame()`'s fallback loop iterates `RUNNERS.options`, so a Steam deep link can never resolve. Verified independently in code."
      - path: "src/backend/launcher.ts"
        issue: "line 320 — `addRecentGame(gameInfo)` is the ONLY call site and sits after the play session ends. Steam titles hand off to `steam://rungameid/` with no child process to await, so a Steam launch is never recorded as recent and never reaches the tray submenu 35-06 built."
      - path: "src/backend/sidecar/installedJsonWatcher.ts"
        issue: "line 86 — the debounced refresh calls `refreshInstalled()` and sends NO frontend message, unlike every other library-mutating path (`legendary/games.ts:767`/`:1067`, `sideload/library.ts:77`, `nile/games.ts:512`). Backend state updates; the Library view does not (D-35-19-09)."
    missing:
      - "Add `steam` (and decide on `zoom`) to `RUNNERS` in src/backend/protocol.ts, or record an explicit accepted-gap"
      - "Give `addRecentGame` a call site reachable on the Steam protocol-handoff launch path, or remove/gate the tray recent-games affordance per D-05's own rule"
      - "Add `sendFrontendMessage('refreshLibrary', 'legendary')` to the installedJsonWatcher refresh callback"
      - "Re-run the four failing criteria, or convert each to a recorded, human-accepted scope reduction the way REQ-35-20's Windows/Linux half already was"

  - truth: "REQ-35-16 — the three folded Tauri channel dead ends are closed, and each fix is attributed to a named layer"
    status: partial
    reason: "Two of three legs land. `openDialog` IS in `LONG_RUNNING_CHANNELS` (main.rs:826-871) and was live-discharged as gate criterion 13. The `installed.json` watcher IS ported with its debounce and IS wired from bootstrap.ts — but its UI half fails (see gap 1). `winetricksInstall` is NOT fixed: 35-10 Task 2 is recorded BLOCKED / NOT IMPLEMENTED, and the requirement's own attribution clause fails on its own terms — the defect is in NONE of the three layers the requirement enumerates (sidecar registration, Rust dispatch, frontend emit), all three of which were re-measured correct. The real break is renderer hit-testing (`pointerdown`/`mousedown` arrive, `mouseup`/`click` never do; attributed to a React unmount)."
    artifacts:
      - path: "src/backend/sidecar/wineToolsFlowRegistration.ts"
        issue: "line 335 registers the channel correctly; the channel works end-to-end under keyboard activation. Mouse activation never emits."
    missing:
      - "Either fix the renderer unmount that eats the click, or re-home winetricksInstall to a named owner and amend REQ-35-16's three-layer attribution clause, which cannot be satisfied as written"

  - truth: "REQ-35-17 — the EOS remove confirmation and the path-rejection dialogs become app-styled"
    status: partial
    reason: "Path-rejection is done and the SEAM Phase 33 D-04 auto-resume port is real and wired (`appShellFlowRegistration.ts:435` — `void initQueue(true)` inside a 5s `.unref()`'d timer). The EOS half is NOT done: `eos_overlay.ts:162` and `:197` still call `dialog.showMessageBox`, i.e. the native dialog. Owned by D-35-11-01, which is marked NOT DONE and explicitly needs a human decision."
    artifacts:
      - path: "src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts"
        issue: "lines 162, 197 — still `dialog.showMessageBox` (native), not the app-styled pattern"
    missing:
      - "Resolve D-35-11-01 (moving a destructive confirmation gate across the IPC boundary) or record it as an accepted gap against REQ-35-17"

  - truth: "The repo's own test suite is green — no Phase 35 regression in the mechanized gates"
    status: failed
    reason: "`meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails. The committed `meta/i18nForkTouchedFiles.json` is stale because Phase 35 made 6 frontend files fork-divergent. This is a REAL Phase 35 regression, not inherited. The sanctioned repair (`pnpm gen-i18n-gate-scope`) was attempted and CASCADED the suite from 1 failure to 5 — the `--rewrite-scope` guard fixtures hard-code `163 -> 199` counts and the A-03 ratchet declares an exact debt set. No later milestone phase owns this."
    artifacts:
      - path: "meta/i18nForkTouchedFiles.json"
        issue: "stale — does not list the 6 frontend files Phase 35 made fork-divergent"
      - path: "meta/__tests__/genI18nGateScope.test.ts"
        issue: "A-17 ANTI-ROT red; a bare regen makes it worse"
    missing:
      - "A coordinated multi-file change: regenerate the scope AND update the `--rewrite-scope` guard fixture counts AND re-baseline the A-03 ratchet debt set, in one commit"

  - truth: "REQ-35-07 — logging out clears the embedded browser's persisted state and the app does not report success unless a post-clear read confirms it"
    status: partial
    reason: "The code is right and independently verified: `EPIC_COOKIE_DOMAINS` (main.rs:3189) and `EPIC_COOKIE_HOSTS` (legendary/user.ts:43) both carry all five Epic-owned apexes; `epic_cookie_domain_matches` delegates to the single `cookie_domain_matches` comparator rather than hand-rolling a second one; `user.ts:238`'s `if (total === 0)` makes a zero-total clear FATAL to logout. But the closure evidence does not exist: D-35-19-15 records that gate criterion 21 — the criterion that discharged the standing 34.6 Step 8 FAIL — did NOT actually exercise the multi-domain clear it was written to prove. So the widening is unit-proven and code-verified, never live-proven."
    artifacts:
      - path: ".planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md"
        issue: "D-35-19-15 — criterion 21 did not exercise the multi-domain cookie clear"
    missing:
      - "One live logout that leaves cookies on at least one non-`epicgames.com` Epic apex and reads the per-domain delta breakdown back out of `gamelib.log`"
deferred:
  - truth: "`pnpm lint` exits 0"
    addressed_in: "Phase 39"
    evidence: "Phase 39 goal: 'Repo-wide lint debt — drive `pnpm lint` to exit 0 after the Electron cutover'. Its roadmap section states explicitly: 'Why this phase runs AFTER Phase 35, not before: Phase 35 removes the Electron build. That deletion takes an as-yet-unmeasured share of the 3544 problems with it.' NOTE: the 6 current errors are specifically Phase 35 residue (uses deleted, declarations left behind) rather than part of the inherited 53, but Phase 39's repo-wide scope subsumes them."
  - truth: "REQ-35-20's Windows and Linux smoke launches"
    addressed_in: "Phase 38"
    evidence: "REQ-35-20 itself routes them: 'The smoke-launch half is routed to Phase 38 as 38-W04 (Windows) and 38-W05 (Linux)'. Phase 38 goal: 'Discharge, in one deliberate sweep, every UAT item across the project that cannot be run on this machine because it needs hardware or an OS this project does not have.' The scope reduction was explicitly acknowledged by the user (option-c, 2026-08-30)."
human_verification:
  - test: "Re-run gate criterion 6 after the recent-games tracking gap is addressed: launch a Steam title, quit it, then open the tray menu"
    expected: "The Steam title appears at position 1 of the recent-games submenu, carries a `runner` field, and clicking it launches the title without opening the main window"
    why_human: "Requires a real packaged .app, a real Steam title, and a tray click. The gate also never reached the click step, so tray launch of a Steam entry remains entirely untested."
  - test: "Re-run gate criterion 10/11 after `steam` is added to protocol.ts's RUNNERS enum: `open -a /Applications/GameLib.app \"gamelib://launch?appName=<steam appid>\"`"
    expected: "`gamelib.log` shows `[Backend]: Launching <title>` for the Steam title, matching the GOG control that already passes"
    why_human: "External OS URL dispatch into a packaged bundle; LaunchServices registration state is machine-specific and cannot be simulated."
  - test: "Re-run gate criterion 14's UI half after the watcher emits `sendFrontendMessage('refreshLibrary','legendary')`: with the Library view open, externally restore an entry to `installed.json`"
    expected: "The Library view updates within ~1s with NO manual refresh"
    why_human: "Visual re-render of a live view; the backend half already passes and cannot discriminate."
  - test: "REQ-35-07 live: log in to Epic, confirm a cookie exists on at least one of fortnite.com / unrealengine.com / twinmotion.com / metahuman.com, then log out"
    expected: "`gamelib.log` shows the per-domain breakdown with a non-zero delta on at least one non-epicgames.com apex, and the post-clear read confirms removal"
    why_human: "Requires real Epic credentials and a live WKWebView cookie jar. D-35-19-15 records that the gate's criterion 21 never exercised this."
  - test: "REQ-35-17 EOS: trigger the EOS overlay remove confirmation in one light and one dark theme"
    expected: "An app-styled dialog consistent with the ~14 other app dialogs, with the cancel path exercised and proven non-destructive"
    why_human: "Visual/theme rendering; D-35-11-01 explicitly requests a human decision before any work lands."
  - test: "Review criticals CR-01..CR-04 from 35-REVIEW.md (status: issues_found, 4 critical / 10 warning / 3 info, none closed)"
    expected: "A decision per item: fix, or accept with a recorded reason"
    why_human: "CR-01 (open_external accepts any renderer-supplied URL) and CR-03 (window.platform can never be 'win32' though nsis ships) are security/correctness judgement calls, not mechanical fixes."
---

# Phase 35: Electron cutover — remove the Electron build — Verification Report

**Phase Goal:** Retire the Electron build: delete `electron-vite`/`electron-builder` config, the preload contextBridge path, and the `isTauri()` branches, leaving Tauri as the only shell. Runs last, and only once the `session`/`powerSaveBlocker` parity gaps are resolved or explicitly accepted, and the parked Electron-renderer bugs have been re-tested against Tauri rather than fixed in Electron. Also in scope: `R-34.5-G1-PKG` (REQ-35-10 half a, REQ-35-11 half b).

**Verified:** 2026-08-30T04:12:40Z
**Status:** gaps_found
**Re-verification:** No — initial verification
**Roadmap `success_criteria`:** empty. Must-haves were merged from the 19 PLAN frontmatter `must_haves` blocks, the goal's own literal claims, and REQ-35-01..21 in REQUIREMENTS.md.

---

## Headline

**The cutover itself succeeded.** Every literal claim in the phase goal is true in the codebase, and I verified each one myself rather than reading it out of a SUMMARY. `R-34.5-G1-PKG` is closed on **both** halves, and I proved half (a) against a real packaged artifact in my own process — not from the 35-04 summary's word.

**What is not achieved is the phase's own closure condition.** REQ-35-20 says in its own text "Any FAIL means the phase does not close," and the blocking gate's verdict is FAIL. Four requirements (35-04, 35-05, 35-16, 35-17) ship partial, and one mechanized gate carries a real Phase 35 regression.

The gap set is small, specific and mostly one shape: **Steam titles are second-class on the runner-resolution paths this phase built new surfaces on top of.**

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `electron-vite` / `electron-builder` config is gone | ✓ VERIFIED | `electron.vite.config.ts` and `electron-builder.yml` both absent from disk. Zero `electron-vite`/`electron-builder` keys in `package.json` (`Object.keys({...deps,...devDeps}).filter(/electron/)` → `[]`). `vite.config.ts` is the live renderer config: `base: mode === 'production' ? './' : '/'` (the load-bearing injected value), `outDir: 'build'`, `emptyOutDir: false`, `preserveRunnerSymlinksPlugin()` at line 126. `meta/__tests__/viteRendererConfig.test.ts` PASSES in my own run. |
| 2 | The preload contextBridge path is gone | ✓ VERIFIED | `src/preload/index.ts` is 38 lines: a `./tauriAttach` side-effect import plus the Windows `navigator.platform` shim. Zero `contextBridge` call sites anywhere in `src/` — the only 4 matches are doc comments in `tauriAttach.ts` and its test. `src/preload/api/*` survives intact as REQ-35-14 required, and is consumed by `tauriAttach`. |
| 3 | The `isTauri()` branches are gone | ✓ VERIFIED | `grep -rn 'isTauri' src/` → **0 matches**, using the un-anchored form the requirement's own undercount lesson demands (the anchored `isTauri(` form was measured to miss 39 refs). Definition deleted from `src/preload/tauriTransport.ts`. `meta/__tests__/isTauriRemoved.test.ts` PASSES in my own run. |
| 4 | Tauri is the only shell — no remaining Electron entry point | ✓ VERIFIED (with residue) | `src/backend/main.ts`, `src/backend/updater.ts`, `e2e/`, `playwright.config.ts`, `flatpak/`, `flathub/`, `src/backend/__mocks__/electron.ts` — all absent. Zero `electron`/`electron-*` deps or devDeps. Zero real `from 'electron'` / `require('electron')` imports (41 grep hits, **all inside comments**, individually inspected). Zero `Electron.` namespace refs. esbuild `--alias:electron=` removed and its guard test INVERTED to assert absence. Reach-ledger measures 0 across 256 visited files. 78 `from 'backend/platform'` imports replace the former surface. **Residue — see Anti-Patterns:** `package.json` still declares `"main": "build/main/main.js"` (file does not exist) and `"debug:react": "pnpm start & npx react-devtools"` (the `start` script was deleted by 35-14); `pnpm-workspace.yaml` still lists `electron` under `onlyBuiltDependencies`. Nothing can start Electron, so the goal's substance holds. |
| 5 | REQ-35-10 half (a) — every `publicDir`-resolved asset ships in the packaged bundle | ✓ VERIFIED (artifact-level) | Config: `bundle.resources` is the **map** form — `{"../build/bin/":"build/bin","../build/locales/":"build/locales","../build/changelog.json":"build/changelog.json","../build/webviewPreload.js":"build/webviewPreload.js","../build/icon.png":"build/icon.png"}`. **Artifact, measured by me on `/Applications/GameLib.app` (built 2026-08-30 08:18, same run as the release DMG):** `Contents/Resources/` holds exactly `build/` and `icon.icns`. `build/locales` holds **147 files across 49 language dirs**. `translation.json` carries `notify.finished.reparing` = `"Finished Repairing"` — the exact key/value pair the 2026-08-22 both-directions probe proved missing. `_up_` **ABSENT**. `public` **ABSENT**. |
| 6 | REQ-35-11 half (b) — `app.isPackaged` has exactly ONE derivation and the packaged branch is reachable | ✓ VERIFIED | `src/backend/sidecar/isPackagedSidecar.ts` is the single `node:sea`-backed, fail-closed resolver. `platform/index.ts:277-278` is a **getter** (`get isPackaged() { return isPackagedSidecar() }`), not a captured boolean — load-bearing, because `paths.ts` reads it at module scope. Exactly three callers, all importing: `platform/index.ts:80`, `devSecretVault.ts:55`, `humbleFlowRegistration.ts:146` (which re-exports rather than keeping a copy). No second derivation exists. |
| 7 | Halves (a) and (b) actually MEET — `publicDir` resolves to a directory that is populated | ✓ VERIFIED (Level 4 data-flow trace) | Full chain traced end to end: `spawn_sidecar_packaged` sets `GAMELIB_APP_ROOT` from `app.path().resource_dir()` (main.rs:6807, :6975) → `platform/index.ts:300` `getAppPath: () => process.env.GAMELIB_APP_ROOT \|\| process.cwd()` → `paths.ts:80-83` `publicDir = resolve(getAppPath(), app.isPackaged \|\| CI==='e2e' ? 'build' : 'public')` → `Contents/Resources/build` → **which the artifact in truth 5 confirms is populated**. The requirement's own warning ("fixing (b) alone resolves correctly to a directory that does not exist") is discharged: it now resolves to a directory that exists AND has content. |
| 8 | The `powerSaveBlocker` parity gap is resolved | ✓ VERIFIED | Not a no-op any more. `main.rs:4144 macos_wake_lock` (IOKit `ASSERTION_TYPE_DISPLAY`/`ASSERTION_TYPE_SYSTEM`), `:4217 windows_wake_lock`, `:4274 linux_wake_lock`. The two kinds stay **distinct** (`WakeLockKind::Display`/`System`, unknown kinds **rejected** not defaulted — `wake_lock_start:unknown-kind`). `WakeLockRegistry` allocates a real unique id and `forget(id)` releases exactly that one; `wake_lock_release_all()` at shutdown (main.rs:8214). Ids start at 1, never 0, because `launcher.ts`'s re-entry guard is `if (!powerDisplayId)`. JS side forwards via `requestRustInvoke`. Live-discharged as gate criterion 15 (PASS). |
| 9 | The `session` parity gap is resolved or explicitly accepted | ✗ FAILED (partial) | Code is correct and independently verified (see gap 5) — five Epic apexes on both the Rust and TS sides, a single shared domain comparator, `total === 0` fatal to logout. But the closure evidence does not exist: D-35-19-15 records that gate criterion 21 did NOT exercise the multi-domain clear it was written to prove. Unit-proven and code-verified; never live-proven. |
| 10 | The parked Electron-renderer bugs were re-tested against Tauri while both shells still built | ✓ VERIFIED | `35-AB-RETEST.md` exists (74KB), 7 items scored across 2 shells with every `Observed:` filled, run in wave 1 before the point of no return. The named `debug-uninstall-game-vanishes-parked` is item 1. Two recorded corrections (`NEITHER`→`BOTH`, `NEITHER`→`NOT ATTEMPTED`) show the record was checked against nominated evidence rather than transcribed. Item 3's finding (`openDialog` missing from `LONG_RUNNING_CHANNELS`) was carried to 35-19 and discharged live as criterion 13. |
| 11 | REQ-35-14 — the irreversible step is named, tagged, and gated on a zero-MISSING behaviour checklist | ✓ VERIFIED | `git tag -l` confirms **`pre-electron-cutover` exists** — I used it as a live oracle throughout this verification (it is how I established truths 15 and 16's provenance). `35-CUTOVER-CHECKLIST.md` status `ZERO MISSING ROWS`, built by census of a 1561-line file registering 136 IPC channels, with `CENSUS-MAINTS-EDGES` **re-run at the deletion commit** rather than trusted from 35-PREFLIGHT. |
| 12 | REQ-35-20 — the phase closes on a PASSING blocking packaged macOS arm64 gate | ✗ FAILED | `35-LIVE-GATE.md` is `blocking: true`, `status: run`, 21/21 criteria measured with 0 blank `Observed:` fields — and `verdict: FAIL` (17 PASS / 4 FAIL). The requirement's own text: "Any FAIL means the phase does not close." |
| 13 | REQ-35-16 — the three folded channel dead ends are closed, each attributed to a named layer | ✗ FAILED (partial) | `openDialog` ✓ (in `LONG_RUNNING_CHANNELS`, live-discharged criterion 13). `installed.json` watcher ✓ backend / ✗ UI (criterion 14). `winetricksInstall` ✗ — 35-10 Task 2 BLOCKED, and the requirement's three-layer attribution clause is unsatisfiable as written. |
| 14 | REQ-35-17 — folded UI-affordance todos and both SEAM convergence items closed | ✗ FAILED (partial) | Path-rejection ✓. SEAM Phase 33 D-04 auto-resume ✓ **really ported** (`appShellFlowRegistration.ts:435`). SEAM Phase 31 D-02 ✓ closed moot-by-construction. EOS remove confirmation ✗ — still `dialog.showMessageBox` at `eos_overlay.ts:162`/`:197` (D-35-11-01). |
| 15 | REQ-35-04 — the tray is real under Tauri and no affordance remains that it cannot honour | ✗ FAILED (partial) | All three settings ARE honoured, so keeping all three toggles in `TraySettings.tsx` is correct under D-05: `noTrayIcon` and `startInTray` from the startup snapshot (main.rs:478-480, :7804-7820), `exitToTray` **deliberately excluded from the snapshot** and read live (main.rs:247, :552 — `if (exitToTray && !noTrayIcon)`), which is 35-06's own mid-gate fix. About window reachable. `addRecentGame` **does** now persist `runner` (`recent_games.ts:47`) — I verified this in code; the gate's "Steam entries carry no runner" observation is explained by pre-fix entries. **But the recent-games submenu is hollow for Steam** (criterion 6 FAIL) — see gap 1. |
| 16 | REQ-35-05 — `gamelib://` is OS-registered by the Tauri shell and reaches `protocol.ts`'s parser | ✗ FAILED (partial) | Shell half fully verified and live-proven: `tauri-plugin-deep-link = "2"` in Cargo.toml, `.plugin(tauri_plugin_deep_link::init())` at main.rs:7485, `on_open_url` at :7695, and **the callback re-validates through `protocol_url_arg()`** — the same single choke point argv and the single-instance socket use (verified at :6720, :6751, :7440, :7590). Gate criterion 10 confirms `on_open_url fired with 1 url(s)` → `delivered OS deep link to sidecar: ok (983ms)`. **The parser half cannot resolve Steam** — see gap 1. |
| 17 | The repo's mechanized gates are green with no Phase 35 regression | ✗ FAILED | `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT is red and is a real Phase 35 regression. (`pnpm lint` exit 1 → **deferred to Phase 39**; `decompressPool.test.ts` lzmaLoader ×3 → not a Phase 35 regression.) |

**Score:** 11/17 truths verified.

---

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `pnpm lint` exits 0 | Phase 39 | Phase 39 goal is literally "Repo-wide lint debt — drive `pnpm lint` to exit 0 after the Electron cutover", and its section states the sequencing reason: "Phase 35 removes the Electron build. That deletion takes an as-yet-unmeasured share of the 3544 problems with it. Fixing lint across files Phase 35 is about to delete is work thrown away." Caveat recorded: the 6 current errors are Phase 35 *residue*, not part of the inherited 53. |
| 2 | REQ-35-20's Windows and Linux smoke launches | Phase 38 | REQ-35-20 routes them by name: "The smoke-launch half is routed to Phase 38 as `38-W04` (Windows) and `38-W05` (Linux)." Phase 38's goal is discharging every UAT item needing hardware this machine lacks. User explicitly acknowledged the option-c scope reduction on 2026-08-30. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vite.config.ts` | plain-Vite renderer config lifted from the `renderer:` block | ✓ VERIFIED | 6225 B. `preserveRunnerSymlinksPlugin` present (line 126); `base: './'` in production — the injected value `electron-vite` never showed and a faithful lift of the visible block would have 404'd every packaged asset. |
| `meta/__tests__/viteRendererConfig.test.ts` | config-equivalence gate | ✓ VERIFIED | PASSES in my own run. |
| `src/backend/sidecar/isPackagedSidecar.ts` | single `node:sea` fail-closed resolver | ✓ VERIFIED | 5112 B, exists, 3 importing callers, `catch` returns `true`. |
| `src-tauri/tauri.conf.json` | `bundle.resources` shipping every `publicDir` asset at a reachable target | ✓ VERIFIED | Map form, all 5 targets under `build/`, no `..` segment, locales as a directory entry not a glob. |
| `src/backend/platform/index.ts` | the single electron-compatible surface | ✓ VERIFIED | 1133 lines, 26 exports, `handlerRegistry` at :162, `ipcMain` at :166. 78 consumers. |
| `src/backend/platform/types.ts` | first-party electron type declarations | ✓ VERIFIED | 632 lines, `IpcMainEvent` present. |
| `src/backend/store_backend.ts` | first-party `conf` shim replacing `electron-store` | ✓ VERIFIED | `conf@^10.2.0` in dependencies; `cwd` sourced explicitly from `pathShim.getPath('userData')` (the omission the plan measured would have collapsed all 24 cache files onto one `config.json` in the repo). |
| `src/backend/sidecar/installedJsonWatcher.ts` | ported watcher with debounce | ⚠️ HOLLOW | Exists, imports `legendaryInstalled`, wired from `bootstrap.ts:39`/`:661`, debounce intact, gate-proven to actually execute the deferred refresh. But line 86's callback sends **no frontend message**, so the rendered library never updates. |
| `src/preload/index.ts` | preload entry with the contextBridge block removed | ✓ VERIFIED | 38 lines; block gone, `src/preload/api/*` intact. |
| `meta/__tests__/electronAbsence.test.ts` | mutation-proven D-03 single-grep gate | ⚠️ PARTIAL | PASSES, but is structurally blind to `package.json`'s `main` field and `pnpm-workspace.yaml` — see Anti-Patterns. |
| `meta/__tests__/isTauriRemoved.test.ts` | static absence gate | ✓ VERIFIED | PASSES. |
| `meta/__tests__/artifactTargets.test.ts` | `bundle.targets` deep-equality pin | ✓ VERIFIED | PASSES. `targets: ["nsis","appimage","dmg"]`. |
| `src/backend/sidecar/__tests__/electronReachLedger.test.ts` | shrinking baseline, inverted to assert zero | ✓ VERIFIED | PASSES. Measured 0 reach across 256 visited files — a completed traversal, not a vacuous one. |
| `35-AB-RETEST.md` | 7-item × 2-shell observation record | ✓ VERIFIED | 74133 B, every `Observed:` filled. |
| `35-CUTOVER-CHECKLIST.md` | per-behaviour successor checklist | ✓ VERIFIED | `ZERO MISSING ROWS`, census-built, `CENSUS-MAINTS-EDGES` re-run. |
| `35-LIVE-GATE.md` | packaged-build gate, 21 criteria | ⚠️ RUN BUT FAILING | 107956 B, 21/21 measured, 0 blank fields — the artifact is exemplary. Verdict FAIL. |
| `35-RELEASE-NOTES.md` | user-facing accepted gaps | ✓ VERIFIED | Exists, contains "offline". |
| `git tag pre-electron-cutover` | annotated tag before any deletion | ✓ VERIFIED | Present; used as a live oracle in this verification. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `platform/index.ts` `app.isPackaged` | `isPackagedSidecar.ts` | delegating getter, never re-derives | ✓ WIRED | `:277-278`. Getter not captured boolean — correct, since `paths.ts` reads at module scope. |
| `devSecretVault.ts` guardrail (c) | `isPackagedSidecar.ts` | import, repointed from `humbleFlowRegistration.ts` | ✓ WIRED | `:55`, used at `:282`. Fail-closed guarantee intact. |
| `tauri.conf.json` `bundle.resources` | `paths.ts` `publicDir` | target layout equals `resolve(GAMELIB_APP_ROOT,'build')` | ✓ WIRED | Proven at the artifact level, not by config inspection alone. |
| `installElectronHook.ts` | `../platform` | `Module._load` redirect of `require('electron')` | ✓ WIRED | Second interception (`electron-store`) correctly deleted **with its docs**, per 35-05's own must-have about stale comments. |
| `meta/esbuildWorkerBundleShared.ts` | (nothing) | `--alias:electron=` removed, guard test inverted | ✓ WIRED | `buildSidecarSea.test.ts:352` asserts absence. |
| deep-link `on_open_url` | `protocol_url_arg()` | re-validation through the single allow-list | ✓ WIRED | main.rs:7695 → :7702 → `deep_link_decision` :6720 → `protocol_url_arg` :6670. Third source, no exception. |
| `main.rs` deep link | `protocol.ts` `handleProtocol` | validated URL dispatched to sidecar | ⚠️ PARTIAL | Delivery proven live (`delivered OS deep link to sidecar: ok`). The parser then cannot resolve a Steam appName. |
| `platform/index.ts` `powerSaveBlocker` | Rust wake-lock command | `requestRustInvoke` | ✓ WIRED | Mirrors clipboard forwarding; sync-over-async handled by minting a local id and resolving the Rust id on landing. |
| `legendary/user.ts` `clearEpicCookies` | `humble_login_clear_cookies` | one `seam.clearCookies` per Epic domain, deltas summed | ✓ WIRED | `:203-238`. Both sides widened together — the plan's explicit warning about a naive TS-only loop was heeded. |
| `installedJsonWatcher.ts` | the renderer | (nothing) | ✗ NOT_WIRED | No `sendFrontendMessage`. This is the criterion-14 FAIL. |
| `main.rs` tray recent-games | `addRecentGame` data | `store/config.json` `games.recent` | ✗ NOT_WIRED (Steam) | Writer never runs on the Steam protocol-handoff launch path. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `paths.ts` `publicDir` | resolved asset root | `GAMELIB_APP_ROOT` ← `resource_dir()` | Yes — 147 locale files measured in the real bundle | ✓ FLOWING |
| `platform/index.ts` `app.isPackaged` | `isPackagedSidecar()` | `require('node:sea').isSea()` | Yes — worker-thread agreement measured (OQ-1, `main=true worker=true`) | ✓ FLOWING |
| `main.rs` tray recent-games submenu | `TRAY_RECENT` seeded from `store/config.json` | `addRecentGame` at `launcher.ts:320` | **No for Steam** — writer unreachable on the `steam://rungameid` handoff path | ✗ HOLLOW |
| `protocol.ts` `findGame()` | `libraryManagerMap[runner]` | `RUNNERS.options` (4 of 6 registered managers) | **No for Steam** — `steam` absent from the enum | ✗ DISCONNECTED |
| Library view after external `installed.json` write | `installedGames` | `refreshInstalled()` | Backend yes, renderer **no** — no frontend message emitted | ✗ HOLLOW |
| `legendary/user.ts` cookie clear | `total` / `perDomain` | `seam.clearCookies` × 5 domains | Yes in code; **never live-measured** for the 4 sibling domains | ⚠️ UNPROVEN |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `electron` absent from `src/` and `package.json` | `npx jest meta/__tests__/electronAbsence.test.ts` | PASS | ✓ PASS |
| `isTauri()` absent from `src/` | `npx jest meta/__tests__/isTauriRemoved.test.ts` | PASS | ✓ PASS |
| `bundle.targets` pinned, no flatpak/flathub survivor | `npx jest meta/__tests__/artifactTargets.test.ts` | PASS | ✓ PASS |
| Vite config lift dropped nothing | `npx jest meta/__tests__/viteRendererConfig.test.ts` | PASS | ✓ PASS |
| Electron reach set is zero, non-vacuously | `npx jest src/backend/sidecar/__tests__/electronReachLedger.test.ts` | PASS (0 reach / 256 visited) | ✓ PASS |
| All five together | `npx jest --runInBand --silent <5 suites>` | `5 passed, 42 tests passed, 1.296s` | ✓ PASS |
| `isTauri` truly absent (un-anchored) | `grep -rn 'isTauri' src/ \| wc -l` | `0` | ✓ PASS |
| `Electron.` namespace refs absent | `grep -rnE '\bElectron\.[A-Z]' src/ \| wc -l` | `0` | ✓ PASS |
| Real `from 'electron'` imports absent | 41 hits, each inspected | all inside comments | ✓ PASS |
| Packaged locales present | `find /Applications/GameLib.app/Contents/Resources/build/locales -type f \| wc -l` | `147` across 49 langs | ✓ PASS |
| Packaged `_up_` / `public` absent | `ls -d .../Resources/{_up_,public}` | both `No such file or directory` | ✓ PASS |
| Translated string shipped, not just the key | JSON walk for `notify.finished.reparing` | `'Finished Repairing'` | ✓ PASS |
| `pre-electron-cutover` tag exists | `git tag -l \| grep electron` | `pre-electron-cutover` | ✓ PASS |
| `vite` resolvable | `require.resolve('vite/package.json')` | resolves (v6.3.5, hoisted peer) | ⚠️ PASS with caveat — undeclared direct dep |
| `package.json` `main` target exists | `ls build/main/main.js` | `No such file or directory` | ✗ FAIL (residue, non-fatal) |

---

### Probe Execution

The phase declares no `scripts/*/tests/probe-*.sh` probes; its mechanized closure gates are jest suites, which I executed above rather than reading their claimed results. `35-LIVE-GATE.md` is a human-gesture gate and cannot be re-executed by a verifier — its recorded verdict is taken as the measured input it is.

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| Phase 35 absence/pin gates (5 suites) | `npx jest --runInBand --silent ...` | 5 passed / 42 tests | PASS |
| Conventional `scripts/*/tests/probe-*.sh` | `find scripts -path '*/tests/probe-*.sh'` | none found | N/A |

---

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| REQ-35-01 `backend/platform` single module | 35-13, 35-15 | ✓ SATISFIED | 1133-line module, 26 exports, 78 `from 'backend/platform'` consumers. |
| REQ-35-02 `electron` nowhere in `src/`/`package.json` | 35-15/16/18 | ✓ SATISFIED | Verified 4 ways in my own process; mutation-proven gate passes. |
| REQ-35-03 `electron-store` → `conf` | 35-05, 35-16 | ✓ SATISFIED | `store_backend.ts` shim, `conf@^10.2.0`, explicit `cwd` from `pathShim`. |
| REQ-35-04 tray real, no unhonoured affordance | 35-06 | ✗ BLOCKED | Three settings honoured; recent-games submenu hollow for Steam (criterion 6 FAIL). |
| REQ-35-05 `gamelib://` OS registration | 35-07 | ✗ BLOCKED | Shell half live-proven; parser cannot resolve Steam (criterion 10 FAIL). |
| REQ-35-06 real `powerSaveBlocker` assertions | 35-08 | ✓ SATISFIED | Real IOKit/Win/Linux assertions, distinct kinds, unique ids, shutdown release. Live criterion 15 PASS. (D-35-19-10/-11/-12 record adjacent defects: double-acquire; a "download" system assertion held while merely playing.) |
| REQ-35-07 logout clears persisted state, no false success | 35-09 | ✗ BLOCKED | Code verified correct; live evidence missing (D-35-19-15). |
| REQ-35-08 renderer builds with plain `vite` | 35-03 | ✓ SATISFIED | `vite.config.ts` + gate; CI step "Build renderer web assets (vite)" → `pnpm exec vite build`. |
| REQ-35-09 real HMR + preserved packaged-evidence path | 35-03 | ✓ SATISFIED | `devUrl: http://localhost:5173`, `beforeDevCommand: pnpm exec vite`, and a separate `tauri:dev:packaged` that runs `vite build` then `tauri build --debug`. |
| REQ-35-10 `R-34.5-G1-PKG` half (a) | 35-04 | ✓ SATISFIED | **Artifact-proven by me**, not by summary. |
| REQ-35-11 `R-34.5-G1-PKG` half (b) | 35-01, 35-04 | ✓ SATISFIED | One derivation, three callers, fail-closed. |
| REQ-35-12 AppImage-only, Flatpak deleted | 35-12 | ✓ SATISFIED | `flatpak/`, `flathub/` absent; zero flatpak/flathub strings in `package.json`; `targets` deep-equality pinned with over-reach control. |
| REQ-35-13 clean updater handover | 35-14 | ✓ SATISFIED | `updater.ts` and `electron-updater` gone; Tauri updater plugin configured with pubkey, GitHub endpoint, `installMode: passive`, `createUpdaterArtifacts: true`. |
| REQ-35-14 named, tagged point of no return | 35-14 | ✓ SATISFIED | Tag present; zero-MISSING checklist; `src/preload/api/*` survived as required. |
| REQ-35-15 A/B re-test under both shells | 35-02 | ✓ SATISFIED | 7 items × 2 shells, run in wave 1, corrections recorded. |
| REQ-35-16 three folded channel dead ends | 35-07, 35-10 | ✗ BLOCKED | 2 of 3; `winetricksInstall` blocked and the attribution clause unsatisfiable as written. |
| REQ-35-17 UI affordances + SEAM convergence | 35-11 | ✗ BLOCKED | EOS dialog outstanding (D-35-11-01). |
| REQ-35-18 one fail-closed secret policy | 35-05, 35-16 | ✓ SATISFIED | `misc.ts`: zero `isTauri`, zero `SECRET_STORE_KEYS`, zero `electron-store`; `storeGet` gated on `isAllowedStoreField` alone. |
| REQ-35-19 `isTauri()` gone | 35-16, 35-17 | ✓ SATISFIED | Zero-match un-anchored grep + mutation-proven gate; both re-run by me. |
| REQ-35-20 blocking packaged gate | 35-01, 35-19 | ✗ BLOCKED | Gate RAN exemplarily (21/21, 0 blanks) but verdict is FAIL. |
| REQ-35-21 user-facing release notes | 35-18 | ✓ SATISFIED | 8 areas + decision-trace appendix; the logout item correctly sourced from 35-09's *observed* behaviour rather than the superseded decision text. |

**Orphaned requirements:** none. All 21 IDs the ROADMAP assigns to Phase 35 appear in at least one PLAN's `requirements:` field, and all 21 are accounted for above.

**Traceability defect (records, not code):** `.planning/REQUIREMENTS.md`'s table (lines 423-443) still reads `Planned (2026-08-28)` for **18 of 21** rows — only REQ-35-02, -18 and -19 are marked Complete. The checkbox list at 1137-1157 marks only `[x]` on -02, -18, -19, -21. By the evidence above, at least REQ-35-01, -03, -08, -09, -10, -11, -12, -13, -14, -15 are demonstrably complete and their rows understate reality. This is the project's known status-doc-lag pattern running in the *understating* direction.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `package.json` | `main` | `"main": "build/main/main.js"` — target file does not exist | ⚠️ Warning | A surviving declaration of the deleted Electron entry point. Inert under Tauri (nothing reads it), but it is exactly the class of stale pointer 35-05's own must-have called "worse than none". The D-03 gate cannot see it — `electronAbsence.test.ts` matches reference forms and dependency keys, not the `main` field. |
| `package.json` | `debug:react` | `"pnpm start & npx react-devtools"` — `start` deleted by 35-14, `react-devtools` no longer a dependency | ⚠️ Warning | Broken developer script. Its companion `vite_plugin_react_dev_tools` in `vite.config.ts` is now unreachable in practice. |
| `pnpm-workspace.yaml` | 8 | `onlyBuiltDependencies:` still lists `electron` | ⚠️ Warning | Build-approval entry for a package no longer installed. |
| `package.json` | — | `vite` is used by `beforeDevCommand`, `tauri:dev:packaged` and the CI renderer step, but is **not a declared dependency** — only a hoisted peer of `@vitejs/plugin-react-swc` / `vite-plugin-svgr` | ⚠️ Warning | This is `D-35-03-02`, which the ROADMAP itself flags as "a BLOCKING input for 35-14". It resolves today only because `.npmrc` sets `node-linker=hoisted`. The build's own toolchain depends on an undeclared package. |
| `.github/workflows/release-tauri.yml` | 12-20, 137, 404-416 | Header prose describes `draft-release-mac.yml`/`draft-release-linux.yml` co-running on `v*` and `electron-builder`'s artifactName segments | ⚠️ Warning | Both workflows are **deleted** — `.github/workflows/` no longer contains them. Stale prose describing a deleted mechanism in a file this phase edited. |
| `src/backend/save_sync.ts`, `eos_overlay.ts`, `utils.ts`, `extra-mock-function.ts`, `common/types/electron_store.ts` | 9 sites | `FIXME` markers with no issue/PR reference | ℹ️ Info | **Not a blocker.** I checked each against the phase base commit `e42f9862` — all 9 pre-date Phase 35 (inherited upstream Heroic debt), and the phase added exactly one `FIXME` line, `vite.config.ts:71`, which is a **verbatim carry** of `electron.vite.config.ts:21` as part of the documented lift. No new unreferenced debt. |
| `build/main/` | — | Holds `sidecar.js`, `sidecar-sea-bundle.js`, `decompressWorker*.js` — no `main.js` | ℹ️ Info | Confirms nothing Electron-shaped remains buildable; the directory name is now a misnomer only. |
| `Contents/Resources/build/` | — | No `crossover-index.json.gz`, which REQ-35-10's own text names as a `publicDir` asset class | ℹ️ Info | **Not a gap.** The snapshot is gitignored and CI-generated (`build-crossover-index.yml`); it exists in neither `public/` nor `build/` in this tree, so there is nothing to bundle. `fetcher.ts:43-60` explicitly treats ENOENT as "a NORMAL cold-start, not an error" and logs at info. |

---

### Correction to a phase record

`35-LIVE-GATE.md`'s frontmatter asserts: *"all four FAILs trace to pre-existing or upstream-inherited code, NOT the Electron cutover."* For criterion 6, **the gate's own body contradicts that** — it says explicitly: *"WHERE IT WAS INTRODUCED IS NOT ESTABLISHED HERE and must not be assumed."* The summary claim was therefore unsupported at the time it was written.

I closed that gap independently. `git grep addRecentGame pre-electron-cutover` and the phase base `e42f9862` both show the identical single call site at `launcher.ts:320`. **The claim is TRUE**, but it is now established rather than asserted. Criteria 10 and 14 already carried their own provenance evidence (`git blame` → upstream `7ba121ec5f`, and `git show 5643c7583^` respectively); criterion 6 did not.

---

### Gaps Summary

**The cutover is real and it is done well.** Electron is gone by every measure I could apply — config, entry points, imports, namespace references, dependencies, build alias, mock, e2e harness, Flatpak channel, and the `isTauri()` branch tree. The reach ledger measures zero non-vacuously. `R-34.5-G1-PKG`, the scope item homed here in August and orphaned across three prior phases, is closed on **both** halves, and I confirmed half (a) by listing a real shipping `.app` rather than trusting the summary that claimed it. The point of no return was tagged, gated on a census-built zero-MISSING checklist, and the A/B signal that Electron's deletion destroys forever was captured first, in wave 1, exactly as planned.

**What blocks closure is narrower than it looks, and it has one dominant shape.** Three of the four gate FAILs and both of the partial feature requirements converge on the same thing: **Steam titles are second-class on runner-resolution paths.** `protocol.ts:15`'s `RUNNERS` enum lists four runners while `storeManagers/index.ts` registers six, so a Steam deep link can never resolve. `addRecentGame` has one call site that the Steam `steam://rungameid` handoff structurally never reaches, so the tray's new recent-games submenu is empty of the platform this project exists to add. Both root causes pre-date the phase — I verified that against the `pre-electron-cutover` tag — but Phase 35 built two new user-facing affordances directly on top of them and measured them only at the very end, in the closing gate. Two defects, different files, one fix session.

**Two further gaps are independent.** The `installed.json` watcher was ported faithfully — and faithfully carried forward a 2022 upstream defect where the refresh never tells the renderer, so the user still has to hit refresh manually. And `meta/__tests__/genI18nGateScope.test.ts`'s A-17 ANTI-ROT is a genuine Phase 35 regression whose sanctioned one-command fix has already been measured to make things worse (1 failure → 5); it needs a coordinated multi-file change, and no later milestone phase owns it.

**Two things that look like gaps are not.** `pnpm lint` exiting 1 is Phase 39's declared job, sequenced deliberately after this phase. The Windows/Linux smoke launches are Phase 38's, routed there by REQ-35-20's own text with the user's explicit acknowledgement.

**Finally, the records need a pass.** `REQUIREMENTS.md` still calls 18 of 21 requirements "Planned" when at least ten are demonstrably complete — this phase's status documents lag reality in the understating direction, which is the mirror image of the failure mode this verification was asked to watch for. And `35-REVIEW.md` remains `status: issues_found` with four criticals unaddressed, one of which (`open_external` forwarding any renderer-supplied URL straight to `app.opener().open_url` with no scheme allow-list — confirmed at `main.rs:1203-1207`) is a security item, not a style note.

---

_Verified: 2026-08-30T04:12:40Z_
_Verifier: Claude (gsd-verifier)_
