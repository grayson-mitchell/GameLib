# Quick Task 261026-b9r: macOS App Management prompt mid-install - Research

**Researched:** 2026-10-26 (orchestrator, live on the operator's Mac: macOS Darwin 27.0.0, CrossOver at /Applications/CrossOver.app)

## Finding 1: the trigger is CrossOver's bottle creation, not a GameLib write

Evidence, from `log show --info --predicate 'process == "tccd"'`. The TCC events are info level, so `log stream` at its default level shows nothing. Note also that zsh's `log` builtin shadows `/usr/bin/log`.

- `cxbottle --create --bottle GameLibTccProbe --template win10_64`, the exact argv GameLib uses at `src/backend/storeManagers/steam/bottle.ts:859`, produced two `kTCCServiceSystemPolicyAppBundles` requests, both `Auth Right: Denied (User Consent), promptType: 1`:
  - 08:08:59.806, accessing `com.apple.perl` (`/usr/bin/perl`). This is CrossOver's perl tooling: `cxbottle`, then the bottle template `share/crossover/bottle_templates/win10_64/setup` and `CXBT_win10_64.pm`.
  - 08:09:00.841, accessing `rundll32.exe`, which `CXBT_win10_64.pm:155` runs inside wine during template setup (`rundll32 <section> crossover.inf`).
  - The responsible process was the app that spawned cxbottle. Inside GameLib that is GameLib, hence "GameLib was prevented from modifying apps".
- The bridge creates one bottle per title (`GameLibSteamBridge-<appId>`), so every bridge install runs `cxbottle --create`. That matches the report of a prompt on every install.
- Ruled out by live probes, none of which caused an AppBundles request: `wine cmd /c echo` in an existing bottle, and the native bridge helper (`build/bin/arm64/darwin/steam-bridge-helper --appid 1284190`, which only reads `Steam.AppBundle/.../steamclient.dylib`). A static grep found no GameLib code writing inside any `.app` except macOS game shortcuts (`shortcuts.ts generateMacOsApp`). Those write `~/Applications/<title>.app`, a bundle GameLib creates itself, and are off by default.
- Repeat bottle creates in the same session did not fire again. macOS appears to rate-limit or cache the denial after the first request, so a missing prompt does not mean access was granted.
- The exact file the template tried to modify is not in the info-level log. Capturing it would need `sudo fs_usage` or `eslogger`. It does not change the conclusion: the writer is CrossOver, so GameLib cannot redirect the write. **Avoidance is not possible from GameLib. The permission is needed.**

## Finding 2: detecting the grant with a write probe works

There is no public API to query App Management status. A probe does work:

```js
// node, run as the GameLib sidecar would
fs.writeFileSync('/Applications/CrossOver.app/Contents/.gamelib-appmgmt-probe', '')
fs.unlinkSync(samepath)
```

- With access denied (verified live from a VS Code-responsible shell), this throws `EPERM: operation not permitted`. No file is left behind.
- `/Applications/CrossOver.app` is owned by the user, so EPERM here means TCC denied the write. `EACCES` would mean plain POSIX ownership, for example a root-owned bundle. Treat that as `unknown`, not `denied`.
- Success (create plus unlink) means `granted`.
- A probe that hits EPERM also makes macOS add GameLib to the System Settings > Privacy & Security > App Management list, toggled off, and show the notification. Run at first launch, that is what we want: the user only has to flip the switch.
- Probe target: the detected CrossOver bundle. Derive it from `src/backend/storeManagers/steam/crossoverLocation.ts` (`/Applications/CrossOver.app` or `~/Applications/CrossOver.app`). With no CrossOver installed the permission is moot, so report `not-needed`.
- Only macOS needs this. Every other platform reports `not-needed`.
- A grant takes effect only after GameLib is relaunched, so the UI must say so. A Tauri relaunch command may already exist; check before adding one.

## Deep link

`x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles`. Open it through the existing `openExternal` path. Check that `open_external_scheme_check` in `src-tauri/src/main.rs` allows the `x-apple.systempreferences:` scheme, and add it narrowly if it doesn't.

## Welcome screen context (from todo 2026-10-22-first-run-welcome-screen-instead-of-changelog.md)

- Fresh installs currently show the inherited changelog modal (`src/frontend/components/UI/NavShell/components/HeroicVersion/index.tsx`, `showChangelogModal` starts `true`).
- First run must be told apart from an upgrade. Upgrades keep the changelog, and "Hide changelog on startup" (`src/frontend/screens/Settings/components/HideChangelogOnStartup.tsx`) keeps its meaning.
- Related todo `2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md`: the welcome text must NOT claim GameLib sets CrossOver up.
