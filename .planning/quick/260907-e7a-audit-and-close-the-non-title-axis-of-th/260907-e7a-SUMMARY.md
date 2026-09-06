---
phase: quick-260907-e7a
plan: '01'
subsystem: steam
tags: [steam, getGameInfo, census, audit, todo-closure]
requires: [260905-luf, 260905-mv5]
provides:
  - 'A complete six-class disposition of every backend `getGameInfo()` hit'
  - 'A reachability verdict for the raw-Map bypass at uninstall()/uninstallBottleGameDirectly()'
  - 'The closed 2026-08-22 getGameInfo double-cache-miss todo'
affects:
  - src/backend/storeManagers/steam/games.ts
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
decisions: []
metrics:
  duration: TBD
  completed: 2026-09-07
---

# Quick Task 260907-e7a: Audit and Close the Non-Title Axis of the Steam `getGameInfo()` Todo Summary

**The non-title axis of the Steam `{}`-sentinel todo is a two-row finding, not a systemic gap: 21 of
101 backend `getGameInfo()` hits are Steam-reachable at all, and only `protocol.ts:215` and
`tools/index.ts:896` deref a non-title field without a guard.**

---

## Task 1 — Census of the non-title axis

### Step 1: the census command, verbatim, and its total

```
grep -rn "getGameInfo()" src/backend --include='*.ts' | grep -v __tests__ | wc -l
```

**Observed total: 101.** E-1 recorded 101. **Observed == recorded**; no call sites were added or
removed since HEAD `4c0a7f58d`.

Bucket split (each run as the same grep without `wc -l`, filtered):

| Bucket | Filter | Recorded (E-1) | Observed |
|---|---|---|---|
| A — outside `src/backend/storeManagers/` | `grep -v "src/backend/storeManagers/"` | 33 | **33** |
| B — inside `storeManagers` but not `steam/games.ts` | `grep "storeManagers/" \| grep -v "steam/games.ts"` | 53 | **53** |
| C — `steam/games.ts` itself | `grep "steam/games.ts"` | 15 | **15** |

**Bucket arithmetic: 33 + 53 + 15 = 101 ✓** (equals the observed census total).

Of bucket C's 15, exactly 5 match `this\.getGameInfo()` — L936, L2037, L2350 *(comment)*,
L2575 *(comment)*, L2831 — i.e. **3 real calls**. Matches E-1.

### Step 2: six-class disposition

**Class arithmetic: 29 + 51 + 4 + 6 + 5 + 4 + 2 = 101 ✓**

| # | Class | Count |
|---|---|---|
| 1 | `not-a-call` (comment / JSDoc / log string / method definition) | 29 |
| 2 | `same-runner` — the Steam `{}` sentinel is structurally unreachable | 51 |
| 3a | `title-axis, already dispositioned` by 260905-luf / 260905-mv5 | 4 |
| 3b | `title-axis, NOT previously dispositioned` — surfaced by this census | 6 |
| 4 | `non-title, guarded` | 5 |
| 5 | `non-title, relies-on-sentinel (intentional)` | 4 |
| 6 | `non-title, genuinely unguarded` | 2 |

> **Plan correction (class 3 split).** The plan defined class 3 as "title-axis, already
> dispositioned". Six title-axis hits are Steam-reachable and were **never** dispositioned by luf or
> mv5 (mv5 closed exactly four sites; see its SUMMARY rows 1-4). Collapsing them into class 3 would
> have been a sample that clears, not a census that convicts, so class 3 is split into **3a**
> (dispositioned, cited) and **3b** (newly surfaced, listed row-by-row with consequences). The seven
> class counts still sum to 101.

#### Class 1 — `not-a-call` (29). Count only.

Bucket A (9): `utils.ts:331`, `downloadmanager/downloadqueue.ts:393`, `utils/gameTitle.ts:4`,
`utils/uninstaller.ts:109`, `shortcuts/ipc_handler.ts:37`, `shortcuts/ipc_handler.ts:47`,
`sidecar/enrichmentFlowRegistration.ts:42`, `sidecar/shortcutsFlowRegistration.ts:145`,
`sidecar/shortcutsFlowRegistration.ts:155`.
Bucket B (8): `steam/metadataCapture.ts:66`, `steam/state.ts:5`, `gog/games.ts:171`,
`sideload/games.ts:36`, `sideload/library.ts:91`, `zoom/games.ts:129`, `nile/games.ts:70`,
`legendary/games.ts:91`.
Bucket C (12): `steam/games.ts` L139, L142, L575, L594 *(the method definition itself)*, L610
*(its own log string)*, L1998, L2007, L2026, L2040, L2350, L2575, L2576.

#### Class 2 — `same-runner` / Steam-unreachable by construction (51). Count + reason.

**The one-line reason, so this class is not mistaken for hand-waving:** a call is in class 2 only
when the receiver provably cannot be a `SteamGame`. Three sub-shapes, each with its own evidence:

- **2a — `this.getGameInfo()` inside a non-Steam store manager (39).** Those managers populate their
  own `GameInfo` synchronously (`legendary/library.ts:203`'s `loadFile`) or carry an explicit
  `title: ''` fallback; the Steam `{}` sentinel has no way into `this`.
  `gog/games.ts` 99, 300, 418, 491, 521, 778, 870, 989, 1249, 1286, 1299 (11);
  `sideload/games.ts` 63, 86, 113, 147 (4);
  `zoom/games.ts` 229, 474, 536, 554, 584, 781, 800, 816 (8);
  `nile/games.ts` 96, 212, 304, 434, 457, 570 (6);
  `legendary/games.ts` 298, 356, 469, 499, 578, 740, 866, 886, 1039, 1096 (10).

- **2b — runner pinned to a string literal that is not `'steam'` (5).**
  `save_sync.ts:40` (`libraryManagerMap['legendary']`), `save_sync.ts:109`
  (`libraryManagerMap['gog']`), `gog/redist.ts:124` (`libraryManagerMap['gog']`),
  `legendary/setup.ts:17` (`libraryManagerMap['legendary']`),
  `wiki_game_info/howlongtobeat/utils.ts:111` (`getGogHLTBGameData`, reached only from
  `utils.ts:334` inside the `gameInfo.runner == 'gog'` branch opened at `utils.ts:328`).

- **2c — cross-runner in signature, but every caller short-circuits `'steam'` before reaching it
  (7).** Each row carries the file:line that does the short-circuiting:

  | Hit | Killing evidence |
  |---|---|
  | `launcher.ts:122` (`launchEventCallback`) | Both callers return before it for Steam: `sidecar/steamFlowRegistration.ts:357` (`if (runner === 'steam') { … return }`) and `protocol.ts:159` (`if (gameInfo.runner === 'steam') { … return }`). Both dispatch to `dispatchSteamLaunch` instead. |
  | `launcher.ts:789` (`prepareWineLaunch`) | Its five callers are `storeManagerCommon/games.ts:197`, `nile/games.ts:359`, `zoom/games.ts:692`, `legendary/games.ts:958`, `gog/games.ts:587`. No Steam caller exists. |
  | `launcher.ts:999` (`installFixes`) | Sole caller is `launcher.ts:909`, inside `prepareWineLaunch` (row above). |
  | `storeManagerCommon/games.ts:153` | Sideload's own launch path. |
  | `storeManagers/index.ts:49` (`autoUpdate`) | `checkGameUpdates.ts:41` does call `autoUpdate('steam', …)`, but the array it passes is always empty: `steam/library.ts:1294-1296` is `async listUpdateableGames() { return [] }`. The `forEach` body containing the hit never runs for Steam. |
  | `shortcuts/shortcuts.ts:34` (`addShortcuts`) | `SteamGame` overrides `addShortcuts` with a log-only no-op at `steam/games.ts:2057-2062`; the module function is never entered with a `SteamGame`. |
  | `shortcuts/shortcuts.ts:124` (`removeShortcuts`) | Same, `steam/games.ts:2064-2069`. |

#### Class 3a — title-axis, already dispositioned (4). Citations, no re-analysis.

| file:line | Closed by |
|---|---|
| `utils/gameTitle.ts:58` (`resolveGameTitle`) | 260905-mv5, D-02 — this **is** the shared fallback chain (`pickTitle(title, appName, fallback?.title)`); relocated from `downloadmanager/utils.ts` by luf. |
| `utils/gameTitle.ts:77` (`resolveTitleForGame`) | 260905-mv5, D-02 — the `Game`-instance counterpart, feeding mv5 sites 1 (`askForceUninstall`) and 2 (`uninstallGameCallback`). |
| `shortcuts/ipc_handler.ts:35` (`shortcutsExists`, Electron) | 260905-mv5 **SUMMARY row 3** — D-03 guard: `if (!title) { logWarning(…); return false }` at L45-51, deliberately *not* a synthesized title because it feeds `shortcutFiles()`, a filesystem path component. |
| `sidecar/shortcutsFlowRegistration.ts:143` (`shortcutsExists`, sidecar) | 260905-mv5 **SUMMARY row 4** — identical D-03 guard. |

#### Class 3b — title-axis, NOT previously dispositioned (6). Every row listed.

| file:line | Field(s) read | Guard | Consequence when `{}` |
|---|---|---|---|
| `gamedetails/dispatch.ts:176` (`repair`) | `title` | none — `notify({ title, … })` at L214 | `notify()` fires with `title: undefined`. **Steam-inert in practice:** `SteamGame.repair()` (`steam/games.ts:2260-2266`) is a log-only stub returning `{stderr: 'Steam library not implemented until Phase 2'}`; nothing user-visible depends on the title on that path. |
| `wiki_game_info/wiki_game_info.ts:29` | `title` (L34), `app_name` (L30), `runner` (L31) | none — `removeSpecialcharacters(gameInfo.title)` at L34 is `text.replaceAll(…)` on `undefined` | Throws `TypeError: Cannot read properties of undefined (reading 'replaceAll')`, **caught** by the `try` opened at L33 → `logError('Was not able to get ExtraGameInfo data for undefined', …)` at L200 and a `null` return. Net effect: the PCGamingWiki/AppleGamingWiki compat data stays empty for that render. No crash, no dialog. |
| `shortcuts/nonesteamgame/nonesteamgame.ts:207` (`addNonSteamGame`) | `title` only (L217, 244, 250, 257, 276, 335, 343, 350, 356, 364), `app_name` (L272, 311) | none | Writes a `shortcuts.vdf` entry with `AppName: undefined`. **UI-gated off for Steam:** the only caller chain is `handleAddToSteam` behind `!isSteam` at `frontend/screens/Game/GameSubMenu/index.tsx:518` ("Steam games are already in Steam — hide the add/remove-to-Steam action"). The `addToSteam` IPC channel would still accept `runner='steam'` from a renderer-supplied argument. |
| `shortcuts/nonesteamgame/nonesteamgame.ts:378` (`removeNonSteamGame`) | `title` only (L405, 413, 454, 461, 466, 474) | none | Same UI gate; a no-match removal loop. |
| `shortcuts/nonesteamgame/nonesteamgame.ts:510` (`isAddedToSteam`) | `title` | none — `checkIfAlreadyAdded(content, game.getGameInfo().title)` | **This one IS reached for Steam games:** the `isAddedToSteam` `useEffect` at `GameSubMenu/index.tsx:299` runs *unconditionally*, outside the `!isSteam` gate that only wraps the button at L518. `checkIfAlreadyAdded(content, undefined)` matches nothing → returns `-1` → `added = false`. Consequence: **none observable**, because the button whose label that boolean drives is hidden for Steam. |
| `storeManagers/steam/launchDispatch.ts:53` | `app_name`, `title`, `runner` (via `addRecentGame`, `recent_games.ts:44-48`) | none | A `games.recent` entry `{appName: undefined, title: undefined, runner: undefined}` is unshifted. The tray's recent list renders a nameless row; the next `addRecentGame` drops it (`recent_games.ts:35`'s `a.appName &&` filter). Fires only *after* `game.launch()` already resolved `true`. |

#### Class 4 — non-title, guarded (5). Every row listed.

| file:line | Field(s) read | Guard expression |
|---|---|---|
| `steam/games.ts:936` (`getExtraInfo`) | `extra` | `info.extra ?? { reqs: [], about: { description: '', shortDescription: '' } }` (L938-941) |
| `steam/games.ts:2037` (`ensurePlatformsCaptured`) | `extra`, `title` — deref'd by the callee | `fetchMetadataIfNeeded(current)` never bare-derefs: `...current.extra` at L752 (spreading `undefined` in an object literal is legal and contributes nothing), `current.extra?.reqs ?? []` at L753, `data.name ?? current.title` at L824. Reaches its own `NUMERIC_APP_ID` guard at L692 regardless. |
| `steam/games.ts:2831` (`isGameAvailable`) | `is_installed`, `install.install_path` | `Boolean(info?.is_installed && info.install?.install_path && existsSync(info.install.install_path))` (L2839-2843) |
| `downloadmanager/downloadqueue.ts:350` | `folder_name` | `const { folder_name } = …; if (folder_name) { removeFolder(…) }` (L348-353) |
| `wiki_game_info/howlongtobeat/utils.ts:327` | `runner` | `if (gameInfo.runner == 'gog')` at L328 — `undefined == 'gog'` is `false`, so the Steam path reads nothing further off the object. |

#### Class 5 — non-title, relies-on-sentinel (intentional) (4). Every row listed.

| file:line | Field(s) read | The contract |
|---|---|---|
| `gamedetails/dispatch.ts:82` | *(shape, not a field)* | `if (!Object.keys(tempGameInfo).length) return null` at L88 — converts `{}` → `null` for the frontend. **D-01 consumer #1.** |
| `sidecar/appShellFlowRegistration.ts:536` | `app_name` | `if (info?.app_name) return runner` at L537 — the tray runner-resolution loop skips a runner on falsy `app_name`. **D-01 consumer #2.** |
| `storeManagers/steam/library.ts:1257` | `app_name` | `if (fromGame.app_name) return fromGame` at L1258, then its own `steamLibraryStore` fallback at L1261-1262. **D-01 consumer #3.** |
| `protocol.ts:221` | `app_name` | `if (maybeGameInfo.app_name) return maybeGameInfo` at L222 — the no-runner search loop over `RUNNERS.options`. **A fourth sentinel consumer that D-01 does not name.** Recorded here so a future change to the `{}` return knows about it. |

#### Class 6 — non-title, genuinely unguarded (2). Every row listed, with its concrete consequence.

| file:line | Field(s) read | Why unguarded | Concrete user-visible consequence when `{}` |
|---|---|---|---|
| `protocol.ts:215` (`findGame`, the explicit-runner branch) | `runner` (at the caller) | `if (runner) return libraryManagerMap[runner].getGame(appName).getGameInfo()` returns `{}` **directly**. The caller's guard at `protocol.ts:116` is `if (!gameInfo) return logError(…)` — and `{}` is **truthy**, so the guard fails open. Three lines later `protocol.ts:124` does `libraryManagerMap[gameInfo.runner].getGame(appName).getSettings()` with `gameInfo.runner === undefined`. | A `gamelib://launch/steam/<appid>` deep link throws `TypeError: Cannot read properties of undefined (reading 'getGame')` inside the protocol handler. The launch silently does nothing; the user gets no dialog, only an unhandled rejection in the log. Note the sibling branch at L221 **is** guarded — the two branches of the same function disagree. |
| `tools/index.ts:896` (`runWineCommandOnGame`) | `folder_name`, `install.install_path` | `const { folder_name, install } = game.getGameInfo()` then `gameInstallPath: install.install_path` at L903. `install` is `undefined` → deref throws. The only preceding guard is `if (game.isNative())` at L892, which is an *early return for native games*, not a `GameInfo` guard. | Reachable only for a bottle-eligible (i.e. `isNative() === false`) macOS Steam game driven through a Wine-tools channel (`tools/ipc_handler.ts:16/35/44`, `sidecar/wineToolsFlowRegistration.ts:376`, `sidecar/runnerMiscFlowRegistration.ts:167/176`). Consequence: `TypeError: Cannot destructure … 'install_path' of undefined`; the winetricks/winecfg invocation rejects instead of running. |

**What a fix would be, per row (not written here — Task 1 changes no production code):**
- `protocol.ts:215` — return `undefined` instead of a `{}` that defeats the caller's own `if (!gameInfo)`, e.g. mirror L222's shape: `const info = …getGameInfo(); return info.app_name ? info : undefined`. That makes both branches of `findGame` agree and needs no change at the call site.
- `tools/index.ts:896` — guard `install?.install_path` the way `isGameAvailable` (`steam/games.ts:2839-2843`) already does, or early-return the `{stdout:'',stderr:''}` shape L893 already returns for the native case.

Neither is fixed by this task: both are **non-title, non-uninstall** sites outside this plan's
`files_modified` set, and neither is the bypass question Task 2 exists to answer. They are carried
into the todo closure by name rather than buried (see Task 3), and a follow-up todo is filed.

### Step 3: explicit verdicts for the four hand-named sites

| Site | Verdict |
|---|---|
| `steam/games.ts:936` `getExtraInfo()` | **Class 4 — guarded.** `info.extra ?? { reqs: [], about: {description:'', shortDescription:''} }` (L938-941). A `{}` yields the literal default; the caller receives a well-formed `ExtraInfo`. No gap. |
| `steam/games.ts:2831` `isGameAvailable()` | **Class 4 — guarded.** `Boolean(info?.is_installed && info.install?.install_path && existsSync(…))` (L2839-2843). Every hop is optional-chained; a `{}` resolves `false`, which is the correct answer for a game whose info cannot be found. No gap. |
| `steam/games.ts:2037` `fetchMetadataIfNeeded(this.getGameInfo())` | **Class 4 — the callee tolerates `{}`.** `fetchMetadataIfNeeded` (L679) derefs `current` in exactly three places: `...current.extra` (L752, spreading `undefined` contributes nothing), `current.extra?.reqs ?? []` (L753), and `data.name ?? current.title` (L824, where `data.name` comes from the store API). It reaches its own `pendingFetches` dedup (L682) and `NUMERIC_APP_ID` rejection (L692) before any of that. No gap. |
| `SteamGame.stop()` (`steam/games.ts:~2803`) | **not-applicable — the todo names this site in error.** Re-verified: `sed -n '2803,2825p'` shows `stop()` reading `nativeInstallsInFlight.get(this.appId)` and otherwise `logWarning`ing a no-op. It contains **no** `getGameInfo()` call — consistent with the census, where `steam/games.ts`'s only three real calls are L936, L2037, L2831. E-2 confirmed. |

### Step 4: field-axis widening

Coverage was established per-site (every deref of every Steam-reachable `GameInfo` value was traced
inside its own function), not by a second grep — that is why `install`, `is_installed`, `extra`,
`folder_name` and `runner` all appear above with a named guard or a named absence. A confirming
sweep for the remaining fields
(`grep -rn "\.\(art_cover\|is_delisted\|canRunOffline\|wine_info\|save_folder\|platforms\)\b" src/backend --include='*.ts'`,
tests and non-Steam managers filtered) surfaced **one hit the `getGameInfo()` grep could not see**:

| file:line | Field | How it evaded the census grep | Disposition |
|---|---|---|---|
| `shortcuts/nonesteamgame/steamhelper.ts:69` and `:87` | `art_cover` | The `GameInfo` was captured into `gameInfo` at `nonesteamgame.ts:207` and passed **across a module boundary** (`nonesteamgame.ts:272`'s `getIcon(gameInfo.app_name, gameInfo)`), so the read happens on `props.gameInfo.art_cover` with no `getGameInfo()` token anywhere on the line. | Inherits `nonesteamgame.ts:207`'s class-3b disposition: `generateImage(undefined, 1920, 620)`; unreachable for Steam through the UI (`GameSubMenu/index.tsx:518`). Recorded so it is not re-discovered. |

The other sweep hits were all non-gaps and are named for completeness: `launcher.ts:526` and `:852`
read `canRunOffline` on the class-2c non-Steam launch path; `steam/games.ts:638` and `:646` read
`existing.is_delisted` / `existing.art_cover` **after** `getGameInfo()`'s own
`if (!existing) return {}` early return at L618, so `existing` is provably non-null there;
`game_overrides/index.ts:75` reads an override record, not a `GameInfo`; `steam/library.ts:1124`
and `:1146` read `cachedMeta?.` with optional chaining and never touch `getGameInfo()`.

**Class 6 is non-empty (2 rows).** Both are recorded above with a proposed fix and neither is written
here, per the task's own instruction.

---

## Task 2 — The raw-Map bypass: **documented non-gap, not a fix**

### Step 1: re-measurement of every plan-time snapshot

Every recorded value was re-measured before being relied on. **All four matched; none disagreed.**

| Anchor | Recorded (plan time, HEAD `4c0a7f58d`) | Observed now | Verdict |
|---|---|---|---|
| **E-4a** `init()` hydrates the Map synchronously from `steamLibraryStore` | `library.ts:711` `init()`; read at L717; `library.clear()` → `library.set(g.app_name, g)` at L717-722; no intervening `await` | `init()` at **L711**; `const cached = steamLibraryStore.get('games', [])` at **L717**; `if (cached.length)` L718; `library.clear()` at **L719**; `library.set(g.app_name, g)` at **L721** inside a plain `forEach`. **No `await` between the read and the sets.** | ✅ match |
| **E-4b** zero `await`s in the `refresh()` clear→rebuild window | L1090 `library.clear()`, L1215 `library.set(appIdStr, gameInfo)`; `awk 'NR>=1090 && NR<=1220' … \| grep -c "await "` → **0** | Boundaries unchanged: `grep -n "library.clear()\|library.set(appIdStr"` → clear at **1090**, set at **1215**. Same awk → **0**. No line-number drift, no window widening needed. | ✅ match |
| **E-5** the two bypass reads + the `root === null` refusal | `games.ts:2354` and `games.ts:2578`; refusal at `~2386` returning a non-empty `stderr` | `games.ts:2354` `const installPath = library.get(this.appId)?.install?.install_path`; `games.ts:2578` `const entryInstallPath = library.get(this.appId)?.install?.install_path`. Refusal branch at **L2391-2398**: `logWarning(…)` then `return { stdout: '', stderr: 'Refused to uninstall: install_path does not resolve inside any known root for appId …' }` — a **logged refusal with a non-empty `stderr`**, exactly as E-5 corrected the task framing. `uninstallBottleGameDirectly`'s sibling refusal is at L2580-2589. | ✅ match |
| **E-6** `getGameInfo()` self-heals the Map on a store hit | `games.ts:595-610` | `games.ts:594` `getGameInfo(): GameInfo {`; Map read L595; `steamLibraryStore.get('games', []).find(…)` L597-599; **`library.set(this.appId, cached)` at L601**; `{} as GameInfo` sentinel at L618. | ✅ match |

**E-4b was strengthened beyond the recorded measurement.** `grep -c "await "` counts only one shape,
so the window was re-scanned for every other suspension point and early exit:

```
awk 'NR>=1090 && NR<=1215 && (/await|\.then\(|yield|async |return |throw |Promise\./)' \
  src/backend/storeManagers/steam/library.ts
```

→ **one match, and it is a false positive**: `L1180`, the substring "yields" inside a prose comment.
The loop opener at `L1091` is `for (const app of ownedApps) {` — a plain `for…of`, **not** `for await`
— and it closes at `L1217`. So there is no `await`, no `.then()`, no `yield`, no nested `async`
callback, no `return` and no `throw` anywhere between the clear and the last set.

### Step 2: the reachability verdict

> **Question:** can a user reach `uninstall()` (or `uninstallBottleGameDirectly()`) for an owned,
> installed Steam game while the in-memory `library` Map has no entry for that appId, but
> `steamLibraryStore` does?
>
> **VERDICT: NO — NOT REACHABLE. Branch 3b (documented non-gap).**

Each candidate window, killed or confirmed on its own evidence:

| Window | Verdict | Deciding evidence (file:line) |
|---|---|---|
| **(a) Before `init()` runs** | **OPEN at the UI layer — not killed.** Reported honestly rather than assumed away. | The uninstall control at `frontend/screens/Game/GameSubMenu/index.tsx:435-449` is gated on **`disabled={is.playing}` only** (L445). Nothing gates it on library-hydration state, and for a Steam game L437-439 fires `window.api.uninstall(appName, runner, false, false)` immediately with no confirm modal (D-05). So the renderer *can* present an enabled, actionable uninstall control from its own state before the backend's `init()` hydration lands. This window survives — which is precisely why (d), not (a), is the load-bearing kill. |
| **(b) The `refresh()` clear→rebuild window** | **KILLED.** | `library.ts:1090` `library.clear()` → `L1091` `for (const app of ownedApps) {` (plain `for…of`) → `L1215` `library.set(appIdStr, gameInfo)` → loop closes `L1217` → `L1220` `steamLibraryStore.set('games', Array.from(library.values()))`. Re-measured: **zero** `await`/`.then(`/`yield`/`async `/`return `/`throw ` in `NR 1090..1215`. The clear→rebuild→persist span is one uninterrupted synchronous block; the event loop never yields inside it, so **no IPC handler can observe a cleared Map.** |
| **(c) A game in the store but dropped from the Map by a *completed* `refresh()`** | **KILLED.** | `library.ts:1220` writes the store **from** the rebuilt Map: `steamLibraryStore.set('games', Array.from(library.values()))`, wholesale, in the same synchronous block as the rebuild. The Map is the *source* of the store, so after a completed `refresh()` the two are identical by construction and the store cannot hold an entry the Map lacks. |
| **(d) Ordering — is there a path to `uninstall()` that has provably NOT called `getGameInfo()` for that appId first?** | **KILLED — and this is the load-bearing kill.** | **No such path exists.** `uninstaller.ts:118` `await game.uninstall({ shouldRemovePrefix })` is the **sole** caller of `.uninstall(` anywhere in `src/backend` (the only other grep hit is a prose comment at `steam/bottle.ts:1042`). Its sole IPC registration is `sidecar/installFlowRegistration.ts:216` → `uninstallGameCallback` at L218. And **five lines earlier**, `uninstaller.ts:113` runs `const title = resolveGameTitle(libraryManagerMap, runner, appName)` → `utils/gameTitle.ts:58` `libraryManagerMap[runner].getGame(appName).getGameInfo()` — same appId, same runner. Per E-6 that call already consulted `steamLibraryStore` and already wrote the entry back into the Map at `games.ts:601`. Between L113 and L118 there is **no `await`** (L115 `let uninstalled = false`, L117 `try {`), so nothing can interleave and undo the self-heal. |

**Why (d) makes the verdict timing-independent.** (b) and (c) are arguments about *when* the Map can
diverge from the store. (d) is an argument about *ordering on the only path that matters*: whatever
state the Map is in — even the fully-cleared state window (a) leaves open — the caller's own
`getGameInfo()` at `uninstaller.ts:113` repairs it before `games.ts:2354` reads it. **The bypass's
forfeited store fallback is redundant, because its sole caller already performed that fallback.**

`uninstallBottleGameDirectly()` inherits this for free and is strictly safer: it is `private`
(`games.ts:2552`) and its only call site is `uninstall()` itself at `games.ts:2363`
(`return this.uninstallBottleGameDirectly()`), i.e. inside the same synchronous continuation after
the same self-heal.

**The one shape that is not fully killed, recorded rather than buried.** If a *synchronous* exception
is thrown inside the rebuild loop (`library.ts:1091-1217`), the `catch` at `L1222` re-throws at
`L1236` and `refresh()` rejects with the Map left cleared while the store still holds the previous
list — the Map-miss/store-hit divergence, genuinely. But (i) it requires an unrelated latent defect
(the window contains no `throw` of its own), and (ii) even then (d) still holds: the uninstall path
self-heals from that same surviving store entry before the bypass reads. This is noted so the next
reader does not mistake its absence for an oversight.

### Step 3b: the deliverable — source comments only

**Documented non-gap, not a fix. No production behaviour changed; no test was written** (per the
`<behavior>` block: "If the verdict is NOT REACHABLE, NO test is written and NO production behaviour
changes"). A fix was not manufactured to make the task feel substantial.

Both bypass sites now carry a `260907-e7a`-tagged comment recording the three required facts:

| Site | What the comment adds |
|---|---|
| `games.ts:2349-2375` (marker at L2355; the read moved to L2376) | That the bypass forfeits **the `steamLibraryStore` fallback AND the Map self-heal** (`games.ts:596-604`, `library.set` at L601), not merely the metadata fetch the pre-existing comment named; the full (d) evidence chain (`uninstaller.ts:118` sole caller, `installFlowRegistration.ts:216` sole registration, `uninstaller.ts:113` → `gameTitle.ts:58`, no `await` between); and (b)/(c) as corroboration with their line numbers. |
| `games.ts:2596-2609` (marker at L2601; the read moved to L2610) | The same forfeit note, plus why this site is strictly safer (`private` at L2574, sole call site `games.ts:2385`), cross-referencing `uninstall()`'s comment rather than restating the chain. |

Both end with "do not re-open this without new evidence" so the next reader does not re-derive the
question — the stated purpose of branch 3b.

### RED-proof ledger

**Not applicable — no test was written, because no production behaviour changed.** Branch 3a's
R1-R4 were never entered. Recording this explicitly rather than leaving the section absent: an
unproven test claimed as proven would be worse than no test, and so would a ledger for tests that
do not exist.

### Task 2 verification results

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0**, clean |
| exactly one `getGameInfo(): GameInfo` definition survives the comment-strip | **PASS** (guards against the new prose being counted as a second definition) |
| `grep -c "260907-e7a" src/backend/storeManagers/steam/games.ts` | **2** — one marker at each bypass site |
| `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` (own command, per `jest-in-the-same-command-as-a-write-reads-stale`) | **269 passed, 269 total**, 1 suite |
| `git diff --stat public/locales/` | **empty** — no new user-facing strings, as expected |
| `npx prettier --check src/backend/storeManagers/steam/games.ts` | **All matched files use Prettier code style!** |

> **Line-number convention.** Every `file:line` outside the Step 3b table is **as measured at HEAD
> `4c0a7f58d`**, before this task inserted its comments — that is the state the census and the
> reachability argument were derived against, and it is what a reader comparing to the plan's
> evidence block will expect. Only the Step 3b table describes the post-edit tree. For the two
> sites this task touched, the post-edit deltas are: `uninstall()`'s bypass read `2354 → 2376`;
> `uninstallBottleGameDirectly()`'s bypass read `2578 → 2610`; the method's own definition
> `2552 → 2574`; its `NUMERIC_APP_ID` guard `2566 → 2588`; its call site `2363 → 2385`. Nothing
> else in `games.ts` moved by more than these two comment insertions (+22 and +14 lines).
