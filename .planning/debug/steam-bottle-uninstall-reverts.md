---
slug: steam-bottle-uninstall-reverts
status: awaiting_human_verify
trigger: "cant uninstall 'all will fall', when i try and uninstall it says uninstalling for a time, but then reverts back... tried to delete file on disk, still cant remove it."
created: 2026-08-15
updated: 2026-08-15T21:40:00Z
goal: find_and_fix
live_access: yes — operator is at the keyboard and can drive `pnpm tauri:dev`, paste logs, and answer questions
---

# Debug Session: Steam bottle game uninstall reverts to installed

## Symptoms

**Expected behavior:** Uninstalling the Steam game "All Will Fall" removes it from disk and
the library entry flips to not-installed (Install button returns), permanently.

**Actual behavior:** The UI shows an "uninstalling" state for a period of time, then reverts
back to the installed state. The game remains listed as installed. Manually deleting the
game's files on disk does NOT make the entry go away either — it still shows as installed.

**Error messages:** None. No visible error banner, notification, or toast. Operator has not
yet checked DevTools console or the log file.

**Timeline:** Operator believes uninstall worked at some earlier point, but has not worked
"for a while" — self-assessed as possibly a Tauri-rearchitecture-introduced regression.
Not confirmed whether other games uninstall correctly.

**Reproduction:** Run `pnpm tauri:dev`, open "All Will Fall" (Steam, installed into a
CrossOver/Wine bottle as a Windows-only title), trigger Uninstall from the game page.

NOTE: the "All Will Fall" repro case (appmanifest_2706020.acf + install dir app_2706020,
3.9GB) was DELETED live by the operator during this session after data was captured. Re-
testing against it directly is no longer possible. HOARD (appId 63000, ~276M) is intact,
confirmed genuinely Steam-authored, and reproduces the IDENTICAL failure — it is now the
live repro case for this session.

CONCLUSION REACHED: `steam://uninstall/<appid>` is a UI-gated verb — the bottled Steam client
accepts and executes it, but the resulting confirmation dialog never becomes usable in this
CrossOver bottle (see Resolution layer 3/4). Delegating uninstall to the bottled Steam client
is therefore architecturally unworkable here for EVERY bottle title, regardless of manifest
authorship, wine engine, client warmth, or window-raise logic — all of which were real,
independently confirmed, and fixed/ruled out along the way, but none of which can make a
GUI-gated confirm dialog reachable when the OS never maps its window. Fix direction (agreed):
extend GameLib's own already-shipped direct-deletion uninstall pattern to cover ALL
bottle-eligible titles, not only GameLib-owned ones — see Current Focus / Resolution.

## Environment

- Build: **Tauri dev** (`pnpm tauri:dev`) — Rust/Tauri shell + Node sidecar
- Store: **Steam**
- Install kind: **CrossOver/Wine bottle** (Windows-only Steam title)
- Platform: macOS (darwin 25.5.0)
- Branch: `fix/steam-native-install-stability`

## Current Focus

hypothesis: "IMPLEMENTED this round — the generalized direct-deletion fix
  is code-complete and self-verified (tsc clean, eslint 0 errors, full
  steam suite 995/995, full repo suite 5543/5544 [1 pre-existing skip,
  unrelated] — 0 regressions). Session is now at the human-verify
  checkpoint: awaiting the operator's live confirmation against Hoard
  before this can be archived as resolved."
test: "Self-verification is DONE (see files_changed for exactly what
  moved). Remaining test is LIVE: operator runs `pnpm tauri:dev`,
  uninstalls Hoard from the UI, and confirms (a) badge flips to
  not-installed, (b) common/Hoard is actually gone from disk, (c)
  appmanifest_63000.acf is gone, (d) any OTHER installed bottle title
  (especially one sharing the Steamworks Common Redistributables depot) is
  untouched/still shows installed."
expecting: "Hoard uninstalls cleanly without ever depending on the Steam
  GUI dialog. Any bottle title sharing a depot with Hoard (SharedDepots
  228987/228990 -> 228980, Steamworks Common Redistributables) remains
  intact and unaffected."
next_action: "AWAITING OPERATOR LIVE VERIFICATION (see checkpoint request
  below Resolution). Once the operator confirms, archive this session
  (move to resolved/, append knowledge-base entry, done). If the operator
  reports a problem, drop back to investigating with whatever new evidence
  they provide."

reasoning_checkpoint:
  hypothesis: "Delegating bottle uninstall to the bottled Steam client's
    own steam://uninstall confirm dialog is unworkable for EVERY
    bottle-eligible title in this CrossOver bottle (CW_USEDEFAULT
    off-screen window defect, independent of manifest authorship/wine
    engine/client warmth) — therefore uninstall() must stop depending on
    that dialog entirely and use direct filesystem deletion for every
    bottle-eligible, non-bridge title, exactly as it already does for
    bridge installs (uninstallBridgeGame) and GameLib-authored native-bottle
    installs (uninstallBottleGameDirectly, formerly
    uninstallBottleNativeGame)."
  confirming_evidence:
    - "webhelper.txt: the uninstall confirm dialog IS created (right size,
      648x224) at CW_USEDEFAULT garbage position
      (805240832,805240832) — real dialog object, unreachable coordinate."
    - "content_log.txt: zero app-state activity for appId 63000 across two
      warm/logged-in dispatch attempts, while the SAME log format proves
      itself working via a control case (Avowed background update logged
      normally in the same window)."
    - "Two independent warm-retry discriminators against Hoard (genuinely
      Steam-authored, ruling out the authorship hypothesis) both failed
      identically to the original 'All Will Fall' failure."
  falsification_test: "If, after this fix, uninstalling Hoard live still
    leaves common/Hoard and appmanifest_63000.acf on disk, OR flips the
    badge without actually removing the files, the direct-deletion
    mechanism itself (not the dialog-delegation diagnosis) would be wrong
    — that would refute this round's fix, not the earlier root-cause
    finding."
  fix_rationale: "The fix bypasses the broken mechanism (Steam's own
    confirm dialog) entirely rather than trying to repair it — CrossOver's
    CW_USEDEFAULT resolution is outside GameLib's code, so no amount of
    readiness-gating, window-raising, or engine-routing correctness (all
    real, already fixed) can make an off-screen window visible. GameLib
    already owns file-level uninstall for bridge and native-bottle
    installs; extending that same, already-proven mechanism to cover every
    bottle-eligible title removes the dependency on the broken dialog for
    ALL of them, not just some."
  blind_spots: "(1) Whether a live, running bottled Steam client will
    re-write/recreate the manifest concurrently with GameLib's own
    deletion has NOT been live-tested (only reasoned about — see
    Resolution.fix for the argument that this is structurally safe: no
    in-process await gap between rmSync and the confirming re-read, and
    POSIX/macOS unlink semantics are safe against a separate process
    holding an open handle). (2) The SharedDepots-survival proof is a real
    filesystem test but uses a SYNTHETIC directory tree
    (mkdtempSync-created fixture mirroring Hoard's real
    SharedDepots/installdir shape), not Hoard's actual on-disk manifest —
    live verification against the real bottle is the step that closes
    this gap."

## Prior art / adjacent known state

- `.planning/debug/uninstall-game-vanishes.md` — **different symptom** (uninstalled game
  vanishes from the list until refresh), parked 2026-07-22 pending the daemon
  rearchitecture. Its evidence is still potentially relevant: it established that
  `SteamLibraryManager.refresh()` re-pushes library state to the frontend in a way a single
  `pushGameToLibrary` upsert does not, and that `refresh()` (`steam/library.ts:588`) has
  **no concurrency guard** and was observed double-firing. A refresh racing the uninstall is
  a candidate mechanism for "reverts back" — still not ruled out as a CONTRIBUTING factor.
- Temporary diagnostic logging was committed in `cc4cfd89` to
  `src/backend/storeManagers/steam/library.ts` and `src/frontend/state/GlobalState.tsx`.
  Still present on this branch, untouched (commit message says "REVERT BEFORE MERGE"),
  out of scope for this fix — flag before merge, do not revert as part of this session.
- Known Tauri-shell traps that fit a silent no-op: sidecar `send` channels fail silently;
  `console.*` and the file logger are invisible from the sidecar (stdout IS the RPC pipe);
  unported invoke channels reject with `UNPORTED_CHANNEL_MARKER` and the rejection may be
  swallowed. Weighed against directly by live log evidence (dispatch chain fires end-to-end)
  — see Eliminated. `raiseFrontmostBottledProcess`'s `app.hide()` fallback throws `TypeError:
  Cannot read properties of undefined (reading 'hide')` — `app` is undefined in the Tauri
  sidecar, the same hollow-Electron-stub class of defect as the dead `safeStorage`/
  `nativeImage` stubs. Genuine Tauri regression, SECONDARY/independent, still unfixed — did
  not fire on either warm-retry attempt (raise succeeded before reaching the fallback both
  times) but the dead fallback remains latent. Track separately, do not conflate with root
  cause, do not fix without asking first.
- Bottle installs have a separate install-state source of truth from native Steam installs
  (ACF/appmanifest vs. bottle prefix contents) — "deleting files on disk doesn't help"
  suggests install state is being read from a store/manifest, not from disk. CONFIRMED (see
  Evidence): `is_installed` is derived purely from `readAcfState`, never from disk contents.
- `FALLBACK_INSTALLDIR_PREFIX = 'app_'` is defined at
  `src/backend/storeManagers/steam/installLocation.ts:31` — Steam itself never names an
  install directory this way; a manifest with an `app_<appid>` installdir is a strong signal
  the install was GameLib-authored (spike-003 / Phase 23 full-ownership install), not
  Steam-authored. Authorship is NOT the discriminator for the uninstall-revert symptom
  itself (see Eliminated) — it remains true and relevant only as a fact about how "All Will
  Fall" got onto disk, and as a naming-convention detail relevant to generalizing
  uninstallBottleNativeGame() (see next_action).
- `uninstallBridgeGame()` (`src/backend/storeManagers/steam/games.ts:1936`) already performs
  direct deletion (`rmSync(installRoot, { recursive: true, force: true })` + manifest
  cleanup) for the non-bottle "bridge" uninstall path.
- A `nativeBottleInstall` marker + `uninstallBottleNativeGame()` direct-deletion routing fix
  was implemented and self-verified this session (types/lint/full suite green) for titles
  installed via `installBottleNative()` (GameLib's own depot downloader, no Wine dispatch).
  Disposition: this is being GENERALIZED (not replaced) — the fix direction is now to extend
  direct-deletion coverage to ALL bottle-eligible titles, so this becomes the common
  mechanism rather than a narrow GameLib-owned-only carve-out. See Current Focus/Resolution.
- ADJACENT DEFECT (not part of this fix, logged for later): `appmanifest_2825840.acf` ("All
  Will Fall - Demo") is an orphan — StateFlags=4, SizeOnDisk 4.1GB, non-zero LastPlayed, but
  `common/All Will Fall Demo` does not exist on disk at all. Left in place as evidence; do
  not fix without asking the operator first — out of scope for this session.
- CONVERGENT INDEPENDENT EVIDENCE: an unrelated concurrent session (phase 34.13, frontend
  work, commits `73473ef67` etc. on this same branch) landed `C-03 refuse to submit a
  non-CrossOver engine to the cxbottle provisioner` — the WRITE-side counterpart to this
  session's READ-side `getSteamBottleSettings()` fix. Strong corroboration the wine-engine
  diagnosis (layer 1) is correct, not coincidental.
- ADJACENT SIDE EFFECT, recorded for later: merely starting/warming the bottled Steam client
  as a byproduct of dispatching one verb triggered (a) a ~177MB client self-update AND (b)
  Steam's own background library-update pass on an unrelated already-installed title
  (Avowed, appId 2457220 — content_log.txt: 'App update changed : Running Update,Staging,
  Committing' ... 'finished update, 1 mounted depots'). A user's uninstall click currently
  has a real chance of silently triggering an unrelated game update in the background with
  zero GameLib-visible feedback. Not fixed as part of this session (the direct-deletion fix
  removes GameLib's OWN need to warm/dispatch to the client at all for uninstall, which
  incidentally avoids this specific trigger for the uninstall verb, but install/launch still
  dispatch to the client and could still trigger it) — flagged for a future, separate
  investigation into whether install/launch dispatch should also avoid this.
- EXPLICIT NON-GOAL (per operator decision, this round): cleaning up now-orphaned
  SharedDepots content after every title referencing it has been uninstalled (e.g. if Hoard
  were the LAST title referencing the Steamworks Common Redistributables depot, that depot's
  files would now be orphaned dead weight on disk) is NOT attempted by this fix. Doing so
  correctly would require a real cross-manifest refcount system (scanning every OTHER
  installed bottle manifest's own SharedDepots/InstalledDepots to prove nothing else still
  references a given depot before deleting it) that does not exist anywhere in this codebase
  today. The fix implemented this round is scoped to strict under-deletion safety (never touch
  a shared depot's content, ever) rather than attempting correct-but-riskier cleanup. Flagged
  here for a future, separate investigation if disk-space reclamation for orphaned shared
  depots is ever prioritized.

## Evidence

- timestamp: 2026-08-15
  checked: src/backend/storeManagers/steam/games.ts uninstall()/uninstallBridgeGame()
  found: "All Will Fall" (appId 2706020) is a Windows-only, bottle-eligible,
    non-bridge-allowlisted title, so uninstall() routes through
    tellBottledSteamToUninstall() -> dispatchToBottledSteam('uninstall', ...)
    followed by startUninstallPolling(appId, {source:'bottle'}).
  implication: Confirmed the exact code path exercised; bridge path (which
    deletes files directly) is not involved.

- timestamp: 2026-08-15
  checked: src/backend/storeManagers/steam/library.ts pollUninstallOnce /
    startUninstallPolling / GRACE_TICKS
  found: GRACE_TICKS=20 at the default 3000ms interval = 60s. If
    seenUninstalling never becomes true (STATE_UNINSTALLING bit 0x800 never
    observed on the ACF) within that window, the poller stops and sends
    gameStatusUpdate {status:'done'} with the badge left installed — an
    intentional "user cancelled Steam's dialog" fallback, not a bug in
    itself.
  implication: A ~60s "uninstalling" period followed by a silent revert to
    installed is the DESIGNED behavior when Steam's confirm dialog is never
    actioned.

- timestamp: 2026-08-15
  checked: src/backend/storeManagers/steam/bottle.ts dispatchToBottledSteam()
  found: For verb 'install', raiseInstallerWindow('install') is called. For
    'launch', raiseBottledGameWindow('launch') is called. For 'uninstall',
    raiseInstallerWindow('uninstall') is also called (sibling-verb
    consistency fix, kept).
  implication: A real design gap that is now genuinely useful once a real
    resident Steam process exists to raise — but insufficient alone, since
    raising a window that the OS never mapped cannot make it visible (see
    later CW_USEDEFAULT finding).

- timestamp: 2026-08-15
  checked: ~/Library/Logs/GameLib/gamelib.log.old (session 1, 19:03:44-19:06:37)
  found: Full real-world trace for appId 2706020 ("All Will Fall") — dispatch
    fires, wine command runs, polling starts, "Finished uninstalling" logs
    almost immediately, user re-clicks 5s later, and after 61s the poller
    stops with "no uninstall detected; user may have cancelled".
  implication: Confirms backend dispatch/IPC itself is NOT broken (rules out
    an unported-Tauri-channel hypothesis as sole cause — see Eliminated).

- timestamp: 2026-08-15
  checked: "Bottle steamapps appmanifest_2706020.acf + install dir
    app_2706020 (live filesystem read, captured before operator-authorized
    deletion)"
  found: 'installdir="app_2706020"' matches FALLBACK_INSTALLDIR_PREFIX
    ('app_'), which Steam itself never generates. StateFlags="4" (0x800 bit
    never set). File mtime Aug 12, install dir intact at 3.9G.
  implication: Confirms this manifest was GameLib-authored — a true fact
    about "All Will Fall" specifically, but NOT the reason the uninstall
    revert happens in general (see Hoard discriminator).

- timestamp: 2026-08-15
  checked: "Census of every appmanifest_*.acf in the bottle's steamapps dir"
  found: "All Will Fall" was the ONLY manifest with an app_* installdir; all
    other bottle titles have real Steam-authored folder names.
  implication: A sample-of-one correlation, subsequently DISCRIMINATED
    AGAINST by the Hoard test — see Eliminated.

- timestamp: 2026-08-15
  checked: "LIVE VERIFICATION #1 of raiseInstallerWindow('uninstall') alone,
    against 'All Will Fall'"
  found: Confirm dialog still did not come to the front.
  implication: Falsifies window-raise-alone as sufficient (see Eliminated).

- timestamp: 2026-08-15
  checked: "src/backend/storeManagers/steam/games.ts install()/uninstall()/
    installBottleNative(), installLocation.ts — read directly"
  found: install() has two bottle-eligible sub-paths: legacy delegation and
    installBottleNative() (no Wine dispatch, gated by
    isSteamNativeInstallEnabled()). uninstall() had exactly one branch for
    any bottle-eligible non-bridge title: tellBottledSteamToUninstall() —
    no ownership check existed prior to this session's fix.
  implication: A real asymmetry; the resulting fix is independently
    defensible but NOT what explains the general symptom (see Hoard test).

- timestamp: 2026-08-15
  checked: "LIVE DISCRIMINATOR TEST #2: uninstalling HOARD (appId 63000) —
    confirmed genuinely Steam-authored — via the untouched legacy delegated
    path, with the window-raise fix present."
  found: IDENTICAL failure to 'All Will Fall'. On-disk: appmanifest_63000.acf
    byte-identical, mtime unchanged (Jul 13 21:23); common/Hoard untouched.
  implication: DIRECTLY FALSIFIES the ownership/authorship hypothesis —
    delegation is broken for ALL bottle titles, not just native-installed
    ones.

- timestamp: 2026-08-15
  checked: "gamelib.log Hoard trace + independent `ps aux` sweep DURING the
    uninstalling window (pre wine-engine-fix)"
  found: wine command returned in ~1s; ps aux showed ZERO matching
    processes (no steam.exe/wineserver/CrossOver); raiseFrontmostBottledProcess
    logged 'no matching process within ~18s'; its app.hide() fallback threw
    TypeError (app undefined in sidecar).
  implication: No bottled Steam process at all — nothing for the URI to be
    handled by. Root cause candidate at the time; superseded/explained by
    the wine-engine finding below.

- timestamp: 2026-08-15
  checked: "Operator's on-disk config: steam_store/config.json,
    global config.json (live forensic read)"
  found: steamBottleConfigStore.wineVersion.type === "toolkit" (Game
    Porting Toolkit), NOT "crossover". globalSettings.winePrefix points to
    a path confirmed nonexistent on disk. steam.exe itself, independently
    verified via `file`, is a genuine PE32+ binary inside a healthy
    CrossOver bottle (cxbottle.conf confirms WineArch=win64).
  implication: The bottle and its Steam install are fine — the engine used
    to DISPATCH commands into it was wrong.

- timestamp: 2026-08-15
  checked: "src/backend/launcher.ts setupWineEnvVars()/runWineCommand(),
    read directly"
  found: CX_BOTTLE is set ONLY for type 'crossover'; type 'toolkit' sets
    WINEPREFIX instead. getSteamBottleSettings() never overrides
    winePrefix, so a 'toolkit'-typed engine silently misroutes.
    runWineCommand always awaits child.on('close') before resolving.
  implication: Confirms the exact env-var misrouting mechanism and that the
    ~1s 'Finished uninstalling' reflects a genuine fast process exit, not a
    fire-and-forget artifact.

- timestamp: 2026-08-15
  checked: "getBridgeBottleSettings()/resolveBridgeCrossoverWine()
    (Phase 24, D-UAT-24-06) vs. getSteamBottleSettings() (Phase 17), same
    file"
  found: The bridge getter already enforces CrossOver-only engine
    resolution; the Steam getter, its older sibling, had no equivalent
    enforcement.
  implication: A genuine, checkable asymmetry — the fix backports the
    already-proven bridge pattern to the Steam bottle.

- timestamp: 2026-08-15
  checked: "games.ts install() bottle branch + operator's
    enableSteamNativeInstall config value"
  found: enableSteamNativeInstall: true is set; install() short-circuits to
    installBottleNative() (no Wine dispatch) before ever reaching legacy
    delegation.
  implication: Confirms the operator's "install works" belief maps entirely
    to the Wine-bypassing native path — there was no live evidence legacy
    delegated install/launch ever worked in this environment either.

- timestamp: 2026-08-15
  checked: "LIVE VERIFICATION #2 (post wine-engine-fix): operator restarted
    `pnpm tauri:dev`, re-ran Hoard uninstall, gamelib.log + ps aux sweep"
  found: "Log shows 'Checking if wine version exists: CrossOver (Steam
    bottle runtime)' (was Game-Porting-Toolkit-latest), the wine command
    now targets the real CrossOver bottle, and
    'raiseFrontmostBottledProcess [uninstall]: raised to front
    (steam.exe pid=24565)' — the raise SUCCEEDED, no app.hide() TypeError.
    ps aux shows a RESIDENT process tree: pid 24565 steam.exe (Ss, 15s CPU
    — was exiting in ~1s before), pid 24322 CrossOver's own wineserver,
    pid 24309 CrossOver's own winewrapper.exe. All three PRIOR failure
    modes (wrong engine, no resident process, app.hide TypeError) are
    confirmed GONE."
  implication: CONFIRMS the wine-engine misrouting diagnosis and fix as
    correct and working — do not re-open. However the uninstall STILL did
    not complete — a further, distinct layer exists.

- timestamp: 2026-08-15
  checked: "Bottled Steam's OWN log files under the bottle's Steam
    directory: bootstrap_log.txt, console_log.txt, connection_log.txt,
    cef_log.txt, webhelper.txt — mtimes and tail content"
  found: "Only bootstrap_log.txt was touched today (20:40:52) — all other
    client logs are still dated Jul 21; the real Steam CLIENT never reached
    a running state. bootstrap_log.txt tail: 'Downloading update (91,560 of
    177,803 KB)... Download complete... uninstalled manifest found...
    Found pending update... Extracting package... Committing NTFS
    transaction... Update complete, launching Steam... Shutdown'."
  implication: "The bottled Steam client had not been launched since Jul
    21 and was cold. On this first post-fix dispatch it self-updated
    (~177MB) instead of acting on the steam://uninstall/63000 URI, then
    logged 'Shutdown' — the original URI did not survive the
    update-and-relaunch cycle. The raise at 20:40:34 raised a
    BOOTSTRAPPER/updater process, not a ready client."

- timestamp: 2026-08-15
  checked: "Live process state of pid 24565, sampled BEFORE any kill
    (per this project's standing sample-before-kill practice), checked
    twice ~2 minutes apart"
  found: "CPU stuck at exactly 0:15.01 across both checks (frozen, not
    progressing); nothing written to any bottled log since 20:40:52;
    `osascript ... count of windows` for process \"steam.exe\" returns 0.
    Sample (main thread parked in wine_wininet_collect_connections,
    NSEventThread idle) saved at the session scratchpad as
    steam-exe-wedge-24565.txt. appmanifest_63000.acf still mtime Jul 13,
    completely untouched."
  implication: "pid 24565 is genuinely wedged — resident but idle-waiting,
    not spinning, with zero AX windows. Confirms raiseFrontmostBottledProcess
    reporting a 'successful raise' is NOT a reliable readiness signal."

- timestamp: 2026-08-15T20:47Z
  checked: "WARM-RETRY DISCRIMINATOR #1: operator killed wedged pid 24565,
    restarted pnpm tauri:dev, re-issued Hoard uninstall against the NOW-
    updated bottled Steam client."
  found: "gamelib.log: correct engine (layer 1 unaffected). ps aux: pid
    27220 steam.exe genuinely alive and running normally (not frozen); CM
    login succeeded (connection_log.txt: 'RecvMsgClientLogOnResponse() :
    OK' at 20:46:47); console_log.txt shows 'ExecuteSteamURL:
    steam://uninstall/63000' fired TWICE (20:47:00, 20:47:33) — the URI IS
    being received and executed by the client this time. BUT:
    appmanifest_63000.acf STILL mtime Jul 13, untouched; content_log.txt
    has zero AppID-63000 activity; uninstall did not proceed."
  implication: "A warm/updated client DOES receive and act on the URI
    promptly (unlike the cold-bootstrap case). But receiving/executing the
    URI is NOT sufficient for the uninstall to complete."

- timestamp: 2026-08-15T20:48Z
  checked: "macOS Accessibility state of the live, warm, fully-connected
    bottled steam.exe (pid 27220) and its steamwebhelper.exe children, via
    System Events, plus direct read of the bottle's own webhelper.txt log
    for window-creation events around the uninstall dispatch."
  found: "steam.exe: 'count of windows'=0 despite being fully warm,
    CM-connected, and actively processing the uninstall URL.
    steamwebhelper.exe (CEF UI process): also 'count of windows'=0.
    webhelper.txt tells the real story: at 20:47:06, 'CreatingPopup
    name:Uninstall ... (-2147483648.00, -2147483648.00) 648.00x224.00'
    followed by 'Uninstall: Created window: size: 648,224 pos:
    805240832,805240832' — the confirm dialog IS created (right size, real
    dialog) but at position (805240832,805240832), nowhere near either of
    the operator's two real displays. The SAME garbage position recurs for
    the login window (20:46:32) and two notification-toast popups
    (20:47:36/38) — every popup relying on Steam's CW_USEDEFAULT
    ('let the system pick a position', Win32 sentinel -2147483648) hits
    this. By contrast, the real main library window (valid persisted
    x=378,y=133) and 12 context-menu popups (valid explicit
    screenavailwidth/height coordinates) render correctly — proving Steam
    itself reads the correct screen size when it isn't relying on
    CW_USEDEFAULT."
  implication: "ROOT MECHANISM for the rendering layer: CrossOver/Wine's
    resolution of Steam's CW_USEDEFAULT sentinel is broken in this bottle,
    producing an absurd off-screen coordinate for every popup that doesn't
    carry its own persisted x/y. The window genuinely exists at the
    Win32/CEF level but is positioned so far outside any real display that
    macOS's window server never materializes it as an addressable NSWindow
    — invisible/unfocusable to the user AND to GameLib's AX-based raise
    tooling. INDEPENDENT of client staleness — reproduces on a fully warm,
    current, CM-connected client."

- timestamp: 2026-08-15T20:55Z
  checked: "SECOND, more complete warm-retry: bottled Steam client came up
    FULLY this time (39 bottled logs live today vs. previously frozen at
    Jul 21; steamwebhelper.exe running, buildid 1785799196), CONFIRMED
    LOGGED IN (connection_log.txt: 20:46:47
    'RecvMsgClientLogOnResponse() : OK' -> '[Logged On]' — the
    steamwebhelper -steamid=0 launch arg is a stale process-start snapshot,
    NOT current login state, and must not be cited as evidence of
    not-logged-in). console_log.txt: ExecCommandLine + ExecuteSteamURL for
    steam://uninstall/63000 fired at 20:47:00 and again 20:47:33 — the
    verb IS accepted by a fully warm, logged-in client. content_log.txt
    (Steam's own app-state/depot log) was independently checked for
    AppID-63000 activity: ZERO entries of any kind (no 'state changed', no
    scheduler entry) since Jul 13. The log format itself is proven
    reliable in the SAME time window — it recorded a complete, real update
    cycle for an unrelated already-installed title (Avowed, appId
    2457220): 'App update changed : Running Update,Staging,Committing' ...
    'starting commit ... 0 updated, 0 moved, 0 deleted files' ...
    'finished update, 1 mounted depots' ... 'scheduler finished (result No
    Error)'. Operator independently confirmed visually: no dialog
    appeared. steamui.txt logged 'Warning: SteamUI thread frame stalled
    for: 5570 ms' then '7171 ms' in this window."
  implication: "STRENGTHENS and independently corroborates the
    CW_USEDEFAULT finding via a second signal: not only is the dialog
    window unreachable via AX/System Events (which is a NOTED
    UNRELIABLE-UNDER-WINE signal, not load-bearing on its own — Wine-hosted
    windows are known to enumerate unreliably via System Events, so
    'count of windows'=0 should not be over-weighted in isolation), but
    Steam's OWN internal app-state log shows the uninstall verb produced
    ZERO downstream effect for appid 63000 specifically, while proving via
    a same-window Avowed update that the log mechanism itself works fine.
    Combined with the direct webhelper.txt evidence of the dialog being
    created off-screen, this is now decisively established via THREE
    independent signals (webhelper.txt window-creation coordinates,
    content_log.txt app-state silence contrasted with a working control
    case, and operator visual confirmation) rather than resting on the
    single weaker AX/System Events signal alone. CONCLUSION: delegating
    uninstall to the bottled Steam client's own confirm-dialog flow is
    unworkable in this bottle for ANY title, warm or cold, Steam-authored
    or GameLib-authored — the fix must stop depending on that dialog
    entirely for bottle uninstalls, not merely gate on readiness."

- timestamp: 2026-08-15T21:40:00Z
  checked: "IMPLEMENTATION + self-verification of the generalized
    direct-deletion fix (games.ts uninstall()/uninstallBottleGameDirectly,
    bottle.ts, electronStores.ts, games.test.ts) — pnpm run codecheck (tsc
    --noEmit), npx eslint on all changed files, npx jest against
    src/backend/storeManagers/steam (full steam suite), npx jest with no
    path filter (full repo suite)."
  found: "tsc --noEmit: 0 errors. eslint: 0 errors on all four changed
    source files + the test file (pre-existing warning-only baseline,
    unchanged in kind — no new errors). Steam suite: 28 test suites / 995
    tests, all passing (games.test.ts: 220/220, including a new real
    (mkdtempSync, unmocked node:fs) SharedDepots-survival regression test
    proving a sibling shared-depot-owner directory + its own manifest
    survive Hoard's uninstall untouched). Full repo suite: 274 test suites
    / 5544 tests, 5543 passing + 1 pre-existing unrelated skip, 0
    failures."
  implication: "The generalized fix is code-complete with zero measured
    regressions across the entire repo test suite. Live operator
    verification against the real Hoard install (badge flip + actual
    on-disk removal + no OTHER bottle title/shared-depot content
    disturbed) is the one remaining unverified claim — the synthetic
    filesystem test proves the DELETION SCOPING logic is correct, but does
    not exercise a live, possibly-running bottled Steam client or Hoard's
    actual on-disk manifest."

## Eliminated

- hypothesis: "Unported/silently-failing Tauri sidecar IPC channel for
    'uninstall' (steam-logon-button-tauri knowledge-base pattern)"
  evidence: "'uninstall' is registered via ipcMain.handle in
    installFlowRegistration.ts (a real invoke/response channel) and the
    live log shows the full dispatch chain firing correctly end-to-end."
  timestamp: 2026-08-15

- hypothesis: "dispatchToBottledSteam() never raising the bottled Steam
    client's window for the 'uninstall' verb is SUFFICIENT to explain the
    revert symptom."
  evidence: "Applied the raise, self-verified, then LIVE-VERIFIED against
    'All Will Fall' — no observable change. Further explained by the later
    finding that no bottled Steam process existed at all to raise a window
    for at that time, and later still that even a successful raise cannot
    make an off-screen CW_USEDEFAULT window visible."
  timestamp: 2026-08-15

- hypothesis: "uninstall()/install() ownership asymmetry — Steam only acts
    on steam://uninstall/<id> for a manifest it authored itself."
  evidence: "LIVE DISCRIMINATOR TEST: HOARD (genuinely Steam-authored)
    failed identically to 'All Will Fall' via the untouched legacy
    delegated path. If authorship were the discriminator, Hoard should
    have succeeded; it did not."
  timestamp: 2026-08-15

- hypothesis: "A readiness-gate (ensure bottled Steam is warm/updated/CM-
    connected before dispatching the verb URI) is SUFFICIENT, on its own,
    to fix the general uninstall-revert symptom for delegated bottle
    titles."
  evidence: "TWO warm-retry discriminators against a fully warm, updated,
    CM-connected, LOGGED-IN client: the URI is received and executed both
    times (console_log.txt ExecuteSteamURL), yet the uninstall never
    proceeds. webhelper.txt shows the confirm dialog created at an
    off-screen CW_USEDEFAULT garbage position; content_log.txt
    independently shows zero app-state activity for the target appId
    while proving the log mechanism itself works via a control case
    (Avowed). A readiness-gate would have fixed only the cold-start/
    URI-loss failure mode; it does nothing for this independent
    rendering-layer defect. FALSIFIED as sufficient."
  timestamp: 2026-08-15T20:55Z

- hypothesis: "Delegating uninstall to the bottled Steam client is
    workable for AT LEAST genuinely Steam-authored bottle titles (i.e. the
    problem is scoped to GameLib-owned installs and/or client warmth, not
    the delegation mechanism itself)."
  evidence: "Two independent warm-retry discriminators against Hoard (a
    control case, unambiguously Steam-authored, fully warm/updated/
    logged-in on both attempts) both failed identically to the original
    'All Will Fall' failure — dialog created off-screen (webhelper.txt),
    zero app-state effect (content_log.txt), confirmed visually absent by
    the operator. Delegation is unworkable for ALL bottle titles in this
    environment, not a subset. Fix direction generalized accordingly — see
    Current Focus/Resolution."
  timestamp: 2026-08-15T20:55Z

## Resolution

root_cause: "MULTI-LAYERED — FOUR layers identified across this session,
  one code-level layer fixed, the remaining unfixable-in-place layer
  requires bypassing Steam's own uninstall UI entirely:
  (1) FIXED, LIVE-CONFIRMED: getSteamBottleSettings() (bottle.ts) trusted
  a persisted non-CrossOver wineVersion (Game Porting Toolkit), causing
  every dispatchToBottledSteam call to run the wrong wine engine against a
  nonexistent prefix and exit in ~1s with no resident client.
  (2) CONFIRMED, real, but subsumed by the fix direction below rather than
  fixed directly: a cold/stale bottled Steam client burns the first
  dispatch on a self-update-and-relaunch cycle, dropping the original URI.
  (3)/(4) CONFIRMED via two independent warm-retry discriminators, and the
  reason this cannot be fixed by GameLib code targeting the delegation
  path: CrossOver/Wine's resolution of Steam's CW_USEDEFAULT window-
  position sentinel is broken in this bottle, so the uninstall confirm
  dialog (and every other popup lacking its own persisted position) is
  created off-screen and never materializes as an addressable NSWindow —
  invisible/unfocusable to the user and to GameLib's AX-based raise
  tooling, and produces zero downstream app-state effect
  (content_log.txt) even on a fully warm, logged-in client. This is a
  CrossOver/Wine rendering defect outside GameLib's direct control, and
  reproduces identically for Steam-authored and GameLib-authored titles
  alike (Hoard fails exactly like 'All Will Fall' did). CONCLUSION:
  steam://uninstall/<id> is a UI-gated verb that cannot be relied upon in
  this bottle at all; readiness-gating, window-raising, and correct engine
  routing are all real, necessary fixes for OTHER things, but none of them
  can make an off-screen window visible, so delegated bottle uninstall is
  architecturally unworkable here regardless of further tuning."
fix: "IMPLEMENTED this round. games.ts's SteamGame.uninstall() now routes
  EVERY bottle-eligible, non-bridge title to direct filesystem deletion
  unconditionally — the `nativeBottleInstall === true` ownership gate that
  previously chose between direct deletion and
  tellBottledSteamToUninstall() is REMOVED; every such title takes the
  same path now. The former uninstallBottleNativeGame() was renamed to
  uninstallBottleGameDirectly() (private method on SteamGame, games.ts) to
  reflect its broadened scope, and its JSDoc was rewritten to document the
  two hazards explicitly:
  (a) SHAREDDEPOTS — handled BY CONSTRUCTION, not by a refcount system
  (explicitly out of scope, as agreed): the function resolves installRoot
  as `join(commonRoot, installdirSegment)` where `installdirSegment` is
  the single top-level path segment under common/ for THIS title's own
  installdir (from readAcfState('bottle').installPath, which itself reads
  the ACF's own on-disk `installdir` field — see naming-convention note
  below). A shared depot's actual files live under the OWNING app's own
  installdir, a SIBLING directory under common/ that this function never
  constructs a path to or touches. A new REAL-FILESYSTEM regression test
  (mkdtempSync fixture mirroring Hoard's actual SharedDepots/installdir
  shape: Hoard's own installdir + a sibling 'Steamworks Common
  Redistributables' dir) proves the sibling directory, its file, and its
  own manifest all survive Hoard's uninstall untouched.
  (b) LIVE-CLIENT INTERFERENCE — addressed by design, not by a
  detect-and-retry mechanism: rmSync() runs synchronously with no `await`
  between it and the containment check that produced its path, so there
  is no in-process race window for a competing write between GameLib's own
  delete and the confirming pollUninstallOnce() re-read; a separate OS
  process (steam.exe under Wine) holding open file descriptors against
  the now-unlinked path is safe POSIX/macOS behavior, not a crash/hang
  source; any real failure (permissions, a locked file) is already caught
  and returned as a normal error result, never thrown/hung. This was NOT
  live-tested against an actually-running bottled Steam client this round
  (see Current Focus reasoning_checkpoint blind_spots) — flagged for the
  live-verification checkpoint below.
  NAMING-CONVENTION GENERALIZATION: turned out to already be satisfied
  structurally — readAcfState()'s installPath was already built from the
  ACF's own on-disk `installdir` field (library.ts), never from
  FALLBACK_INSTALLDIR_PREFIX ('app_...', installLocation.ts, which is only
  used as an install-time fallback when PICS returns nothing). No naming
  branch was needed; a Steam-authored installdir like 'Hoard' and a
  GameLib-authored one like 'app_2706020' were already handled identically
  by uninstallBottleNativeGame()'s existing logic. This is proven directly
  by the merged 'direct deletion for ALL bottle-eligible titles' test
  block, which deliberately uses installdir='Hoard' (not 'app_...') as its
  primary fixture.
  nativeBottleInstall FLAG DISPOSITION: kept, not removed — repurposed as
  PROVENANCE-ONLY metadata (documented in both games.ts's
  markNativeBottleInstall JSDoc and electronStores.ts's field JSDoc). It is
  still written on every committed installBottleNative() completion and
  still cleared by pollUninstallOnce()'s confirmed-absent branch — neither
  writer/eraser needed to change — but uninstall() no longer reads it for
  routing. Removing the writer/eraser pair entirely was rejected: it
  remains true, potentially useful install-provenance data at negligible
  ongoing cost.
  dispatchToBottledSteam('uninstall', ...) / tellBottledSteamToUninstall()
  DISPOSITION (bottle.ts): kept in place as a documented
  unused-but-harmless code path, not deleted. games.ts no longer imports or
  calls tellBottledSteamToUninstall. Rationale documented inline on the
  export: it is a small, shared, already-independently-tested primitive
  (removing it would delete real bottle.test.ts coverage of behavior that
  itself works correctly — the URI dispatch and window-raise both fire;
  it's Steam's own dialog rendering that's broken); it may become useful
  again if the underlying CrossOver CW_USEDEFAULT defect is ever fixed
  upstream; and it costs nothing to leave in place.
  Layer (1) [wine-engine] remains fixed and independently verified,
  unaffected by this round. Layer (2) [cold-client URI loss] is now MOOT
  for uninstall specifically (delegation is never used for it any more);
  still a live concern for install/launch, which still delegate — out of
  scope for this session, unchanged from the prior update."
verification: "SELF-VERIFIED this round: `pnpm run codecheck` (tsc
  --noEmit) clean, 0 errors. `npx eslint` on all four changed source files
  plus the test file: 0 errors (pre-existing warning-only baseline
  unchanged in kind — no new errors introduced). Full steam test suite:
  28 suites / 995 tests, all passing (games.test.ts alone: 220/220,
  including a NEW real-filesystem SharedDepots-survival test). Full repo
  suite: 274 suites / 5543 passing + 1 pre-existing unrelated skip, 0
  failures, 0 regressions. Layer (1) [wine-engine] remains
  self-verified + LIVE-CONFIRMED from the prior round, unaffected.
  NOT YET DONE: live operator verification against Hoard on the real
  bottle (badge flip, actual on-disk removal of common/Hoard +
  appmanifest_63000.acf, and confirmation that another bottle title
  sharing/adjacent to the Steamworks Common Redistributables depot is
  unaffected) — see the CHECKPOINT REACHED request. Session remains open
  until that confirmation lands."
files_changed:
  - src/backend/storeManagers/steam/games.ts (THIS ROUND: uninstall()
    routes every bottle-eligible non-bridge title to direct deletion
    unconditionally, removing the nativeBottleInstall ownership gate and
    the tellBottledSteamToUninstall()/startUninstallPolling('bottle') call
    for the legacy-delegated case; uninstallBottleNativeGame() renamed to
    uninstallBottleGameDirectly() with JSDoc covering the SharedDepots and
    live-client hazards explicitly; markNativeBottleInstall's JSDoc updated
    to record the flag's provenance-only disposition; unused
    tellBottledSteamToUninstall import removed. Carries the prior round's
    wine-engine-adjacent work unchanged.)
  - src/backend/storeManagers/steam/bottle.ts (THIS ROUND: JSDoc added to
    tellBottledSteamToUninstall documenting the deliberate
    kept-but-unused-by-games.ts disposition. No behavioral change. Also
    still carries the prior round's wine-engine fix +
    raiseInstallerWindow('uninstall') sibling-verb fix, both independently
    correct and unaffected by this round.)
  - src/backend/storeManagers/steam/electronStores.ts (THIS ROUND:
    nativeBottleInstall field JSDoc rewritten to document its
    provenance-only disposition — no schema/behavioral change.)
  - src/backend/storeManagers/steam/__tests__/games.test.ts (THIS ROUND:
    the 'nativeBottleInstall ownership routing' describe block replaced
    with 'direct deletion for ALL bottle-eligible titles' — inverted the
    two tests that used to assert delegation for nativeBottleInstall:false/
    absent, since both now assert direct deletion instead; added a NEW
    real-filesystem SharedDepots-survival test (mkdtempSync fixture);
    updated D4 [D-17 forced-verdict durability block] and the Phase 24
    bridge-routing block's 'non-allowlisted title' regression test to
    match the new routing; removed the now-obsolete
    'bottle-eligible + provisioned: uninstall() calls
    tellBottledSteamToUninstall' test. D5b and N1 in the D-17 block needed
    no changes — D5b never asserted on tellBottledSteamToUninstall itself
    (only that uninstallBridgeGame is skipped) and needed only an added
    getSteamBottleSettings() mock so the real (unmocked in that block)
    readAcfState() call it now reaches doesn't throw; N1 exercises the
    NATIVE mac path, untouched by this fix. Added real (unmocked) node:fs/
    node:path/node:os imports scoped to the new SharedDepots test only.)
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts (carries the
    PRIOR round's regression tests for the wine-engine fix + window-raise
    fix — untouched this round.)
  - src/backend/storeManagers/steam/library.ts (carries the PRIOR round's
    pollUninstallOnce nativeBottleInstall-clearing change — untouched this
    round; its 'absent' branch is exactly what
    uninstallBottleGameDirectly() reuses via pollUninstallOnce(appId,
    'bottle') after its own deletion, unchanged in this round.)
