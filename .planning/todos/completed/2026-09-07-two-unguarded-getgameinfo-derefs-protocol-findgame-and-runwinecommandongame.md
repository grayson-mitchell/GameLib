---
created: 2026-09-07
title: "Two unguarded non-title `getGameInfo()` derefs survive the 260907-e7a census: `protocol.ts:215`'s `{}` defeats its own caller's truthiness guard, and `tools/index.ts:896` destructures `install` unchecked"
area: steam
status: RESOLVED
resolved: 2026-09-07
resolved_by: quick-260907-f2g
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

## Resolution

Closed by quick task `260907-f2g` (2026-09-07), branch `fix/steam-native-install-stability`, from
HEAD `bc47c9e80`. Both sites guarded at the call site; the `{}` return itself was not touched, per
D-01. No file under `src/backend/storeManagers/` was modified.

### (a) The two guards, as landed

**Site 1 — `src/backend/protocol.ts:221-224`** (commit `50cc0a3e3`). The todo's own proposed fix for
this site was correct and is what shipped, modulo a local name:

```ts
if (runner) {
  const gameInfo = libraryManagerMap[runner].getGame(appName).getGameInfo()
  return gameInfo.app_name ? gameInfo : undefined
}
```

The loop branch's `if (maybeGameInfo.app_name) return maybeGameInfo` — now at **L231**, one of
D-01's four legitimate sentinel consumers — is byte-identical to HEAD. The diff on `protocol.ts` is
exactly one line replaced by the block above plus a six-line comment; no line outside the
explicit-runner branch changed.

**Site 2 — `src/backend/tools/index.ts:903-909`** (commit `1bef4de03`), inserted immediately after
the `const { folder_name, install } = game.getGameInfo()` at L896 and before `game.getSettings()`:

```ts
if (!install?.install_path) {
  logError(
    `runWineCommand called on ${runner} game ${appName} whose GameInfo carries no resolved install path`,
    LogPrefix.Gog
  )
  return { stdout: '', stderr: '' }
}
```

`{ stdout: '', stderr: '' }` is byte-identical to the shape both guards above it already return.
The log carries runner + appName only, never the install path, matching the redaction posture of
the adjacent `logError`s. The change is **13 insertions, 0 deletions**, so the `runner === 'steam'`
early return (Pitfall 5) and the `isNative()` early return are provably untouched and both still
run first.

### (b) Both RED-proof recipes, verbatim

Each was observed twice: once before the production change existed, and once again via the named
revert after it. Both reverts were performed by **hand-edit** — never `git checkout --` (this
repo's post-checkout hook fires a binary download and throws) and never `git stash` (it strands
concurrent sessions).

**Site 1.** Test: `src/backend/__tests__/protocol.test.ts`, describe
`findGame explicit-runner branch guards the {} sentinel (260907-f2g)`, first test. It drives the
CALLER path (`handleProtocol(['gamelib://launch?appName=steam-1&runner=steam'])`), not `findGame()`
in isolation — the rejection originates at `protocol.ts:124`, inside `handleLaunch`.

Revert: hand-edit the guard block back to the single line

```ts
if (runner) return libraryManagerMap[runner].getGame(appName).getGameInfo()
```

Observed failure, verbatim:

```
Received promise rejected instead of resolved
Rejected to value: [TypeError: Cannot read properties of undefined (reading 'getGame')]
```

Guarded: `Tests: 30 passed, 30 total`. Reverted: `Tests: 1 failed, 29 passed, 30 total`.

**Site 2.** Test: `src/backend/tools/__tests__/runWineCommandOnGameGuard.test.ts`, first test.

Revert: hand-edit the entire `if (!install?.install_path) { … }` block out of `tools/index.ts`,
leaving `gameInstallPath: install.install_path` as the next deref.

Observed failure, verbatim:

```
Received promise rejected instead of resolved
Rejected to value: [TypeError: Cannot read properties of undefined (reading 'install_path')]
```

Guarded: `Tests: 10 passed, 10 total` across `runWineCommandOnGameGuard.test.ts` and
`dxvkEvidenceLines.test.ts`. Reverted: `Tests: 1 failed, 2 passed, 3 total`.

Each site also carries an **inverse** test proving the guard is not over-broad — a populated
`GameInfo` still reaches its destination (`dispatchSteamLaunch` for Site 1; `runWineCommand` with
`gameInstallPath: '/games/g'` for Site 2). Site 2 additionally pins adjacent-branch parity: the
pre-existing `isNative()` branch returns the same `{ stdout: '', stderr: '' }` shape, so the two
guards cannot drift apart.

Site 2's tests use **`runner: 'gog'`, not `'steam'`**. `runWineCommandOnGame` returns early for
`'steam'` at `tools/index.ts:879` before reaching either the `isNative()` check or the deref, so a
Steam runner would make every test in that file vacuous — green against guarded and unguarded
source alike. The bottled-macOS-Steam `isNative() === false` case this todo describes remains the
REACHABILITY argument for a `{}` arriving at L896; `'gog'` is merely the vehicle that executes the
same lines.

### (c) Correction: this todo's own Site 2 proposed fix was insufficient

This todo proposed to "optional-chain the way `SteamGame.isGameAvailable()` already does". Measured
during `260907-f2g`'s planning and re-confirmed at execution: **`WineCommandArgs.gameInstallPath` is
declared `?: string`** (`src/common/types.ts:766`). So `gameInstallPath: install?.install_path`
type-checks cleanly and passes `undefined` straight through to `runWineCommand` → `setupEnvVars`.
That trades a loud, immediately-diagnosable `TypeError` for a silent bad-argument Wine invocation —
strictly worse. The shipped fix is therefore guard **and** early-return **and** log, not a bare
optional chain. (The optional chain still appears, but only inside the `if` condition, where the
narrowing it produces is what makes the unchanged `install.install_path` at L912 safe.)

Site 1's proposed fix needed no such correction — it was accurate as filed.

### (d) Correction: `dxvkEvidenceLines.test.ts:24-27`'s importability claim is false

That file asserts in prose that `tools/index.ts` "reaches Electron transitively and must not be
imported under the backend jest project". **Measured false**, twice: once by a planning-time probe,
and again by `runWineCommandOnGameGuard.test.ts`, which imports `{ runWineCommandOnGame } from
'../index'` for real. Exactly two `jest.mock` factories suffice — `'../../storeManagers'` (supplying
`libraryManagerMap`; note `tools/index.ts` reaches it through a LAZY
`await import('../storeManagers')` at L889, which `jest.mock` intercepts regardless) and
`'../../launcher'` (supplying `runWineCommand`, `setupEnvVars`, `setupWineEnvVars`, `validWine`).
The suite loads and runs in under a second.

**That docstring was NOT edited by this task** — it is out of scope, being a source-text gate for an
unrelated DXVK contract — and it **remains inaccurate at HEAD**. The correction is recorded here and
in the new test file's own header so the next reader of either does not re-derive it. Anyone wanting
to import `tools/index.ts` from a backend test may do so.

### Verification

- `npx jest --selectProjects Backend --testPathPattern 'backend/__tests__/protocol'` — 30 passed,
  0 failed. Includes both pre-existing loop-branch tests, which carry D-01 non-regression.
- `npx jest --selectProjects Backend --testPathPattern 'tools/__tests__'` — 10 passed, 0 failed.
  `dxvkEvidenceLines.test.ts`'s collapsed-source gate did not regress; adding a guard clause removes
  no `runWineCommand(` occurrence, so its `>= 2` count assertion is unaffected.
- `npx tsc --noEmit -p tsconfig.json` — exit 0.
- `npx eslint` on all four touched files — 0 errors. `npx prettier --check` — clean.
- No new user-facing strings. Both new messages are developer-facing `logError` calls matching
  their neighbours; `public/locales/en/gamelib.json` and `translation.json` are untouched.
