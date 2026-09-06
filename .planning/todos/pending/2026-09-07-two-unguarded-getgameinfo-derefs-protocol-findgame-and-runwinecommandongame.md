---
created: 2026-09-07
title: "Two unguarded non-title `getGameInfo()` derefs survive the 260907-e7a census: `protocol.ts:215`'s `{}` defeats its own caller's truthiness guard, and `tools/index.ts:896` destructures `install` unchecked"
area: steam
status: OPEN
severity: minor
source: "quick task 260907-e7a — class 6 of the getGameInfo() census; filed rather than buried in that todo's closure"
files:
  - src/backend/protocol.ts
  - src/backend/tools/index.ts
resolves_phase: null
---

## What's here

Quick task `260907-e7a` censused all 101 backend `getGameInfo()` hits and dispositioned every one.
Exactly **two** landed in class 6 — *non-title field read, no guard, no sentinel reliance* — and
neither was fixed there: both sit outside that task's planned file set (`steam/games.ts` + the todo
files), and neither is the raw-Map bypass question that task existed to answer. This todo carries
them forward so they are not lost with that closure.

Background: `SteamGame.getGameInfo()` returns `{} as GameInfo` on a double cache miss (in-memory
`library` Map miss **and** `steamLibraryStore` miss). Per **D-01** (`260905-luf`) that is a
**deliberate cross-runner sentinel**, not a defect — four consumers depend on its falsiness. So the
fix for each site below is a **guard at the call site**, never a change to the `{}` return.

## Site 1 — `protocol.ts:215`: a truthy `{}` defeats the caller's own `if (!gameInfo)` guard

```ts
// protocol.ts:208-223, findGame()
if (runner) return libraryManagerMap[runner].getGame(appName).getGameInfo()   // L215

for (const runner of RUNNERS.options) {
  const maybeGameInfo = libraryManagerMap[runner].getGame(appName).getGameInfo()
  if (maybeGameInfo.app_name) return maybeGameInfo                            // L222 — guarded
}
return
```

The two branches of the same function **disagree**. The no-runner loop (L221-222) checks
`app_name` and is correct — the census filed it as class 5, a legitimate sentinel consumer. The
explicit-runner branch at **L215** returns the `{}` straight through.

The caller's guard cannot catch it:

```ts
// protocol.ts:115-126
const gameInfo = findGame(appName, runner)
if (!gameInfo) {                                     // L116 — `{}` is TRUTHY; fails open
  return logError(`Could not receive game data for ${appName}!`, …)
}

const { is_installed, title } = gameInfo             // L123 — both undefined
const settings = await libraryManagerMap[gameInfo.runner]   // L124 — runner is undefined
  .getGame(appName)                                  // L125 — TypeError
  .getSettings()
```

**Consequence.** A `gamelib://` deep link naming an explicit runner throws
`TypeError: Cannot read properties of undefined (reading 'getGame')` inside the protocol handler.
The launch silently does nothing — no dialog, no user-facing error, only an unhandled rejection in
the log. Steam-reachable: `RUNNERS` was widened to include `'steam'` (see
`storeManagers/steam/launchDispatch.ts`'s header comment).

**Proposed fix.** Make L215 agree with L222 — return `undefined` rather than a `{}` that defeats the
caller's own guard, so no change is needed at the call site:

```ts
if (runner) {
  const info = libraryManagerMap[runner].getGame(appName).getGameInfo()
  return info.app_name ? info : undefined
}
```

## Site 2 — `tools/index.ts:896`: `install` destructured and dereferenced unchecked

```ts
// tools/index.ts:891-905, runWineCommandOnGame()
if (game.isNative()) {                                    // L892 — NOT a GameInfo guard
  logError('runWineCommand called on native game!', LogPrefix.Gog)
  return { stdout: '', stderr: '' }
}
const { folder_name, install } = game.getGameInfo()       // L896
const gameSettings = await game.getSettings()

return runWineCommand({
  gameSettings,
  installFolderName: folder_name,
  gameInstallPath: install.install_path,                  // L903 — install is undefined
  …
})
```

The only preceding check is an early return for *native* games, which is not a `GameInfo` guard.

**Consequence.** `TypeError` dereferencing `install_path` of undefined; the winetricks/winecfg
invocation rejects instead of running. Reachable for a **bottle-eligible** (i.e. `isNative() === false`)
macOS Steam game driven through any Wine-tools channel: `tools/ipc_handler.ts:16`, `:35`, `:44`,
`sidecar/wineToolsFlowRegistration.ts:376`, `sidecar/runnerMiscFlowRegistration.ts:167`, `:176`.

**Proposed fix.** Optional-chain the way `SteamGame.isGameAvailable()` (`steam/games.ts:2831`, the
census's model class-4 row) already does, and return the same `{stdout:'',stderr:''}` shape L893
already returns when there is nothing to run against.

## Scope note

Line numbers are as measured at HEAD `4c0a7f58d`, before `260907-e7a` inserted its comment blocks
into `steam/games.ts` (only that file's numbering shifted; neither file here was touched).

Explicitly **not** in scope, both inherited from `260905-luf` and re-confirmed by the census:
making `getGameInfo()` async (~40 call sites across ~20 files — needs its own phase; neither site
above requires it), and populating a stub `GameInfo` in the double-miss branch (permanently rejected
by D-01).

Full census, per-site verdicts and the class arithmetic:
`.planning/quick/260907-e7a-audit-and-close-the-non-title-axis-of-th/260907-e7a-SUMMARY.md`.
Closed parent ledger entry:
`.planning/todos/completed/2026-08-22-steam-getgameinfo-returns-empty-on-async-cache-miss.md`.
