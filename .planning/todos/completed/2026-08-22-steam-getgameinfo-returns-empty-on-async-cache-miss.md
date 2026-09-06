---
created: 2026-08-22
title: "SteamGame.getGameInfo() returns {} on a double async cache miss — root cause of the empty-title install-failure dialog"
area: steam
status: RESOLVED
resolved: 2026-09-07
resolved_by: quick-260907-e7a
severity: minor
files:
  - src/backend/storeManagers/steam/games.ts
found_by: "Phase 37 / REQ-37-03 (D-09) — fallback shipped in 37-04, root cause deliberately not gated"
---

## What's here

37-04 shipped a defensive fallback (`title || appName`) so the Steam install-failure dialog never
renders an empty game name again. Per D-09, that fallback closes REQ-37-03 without fixing the
underlying gap. This todo tracks the gap itself.

## The gap

`SteamGame.getGameInfo()` (`src/backend/storeManagers/steam/games.ts`, `getGameInfo()`, ~:554)
returns `{} as GameInfo` when BOTH of these miss:

1. The in-memory `library` Map (`library.get(this.appId)`)
2. The persisted `steamLibraryStore` cache (`steamLibraryStore.get('games', []).find(...)`)

When both miss, every field on the returned object — not just `title` — is absent, coerced to
`undefined` at runtime despite `GameInfo`'s fields being typed as required (e.g. `title: string`).
The observed symptom (37-04's origin todo) was the install-failure dialog rendering with the game
name missing, at the exact moment the adjacent log line already had the appid
(`Installation of 259130 failed with: ...`) — so the identifier was available, but the enriched
`GameInfo` behind it was not.

## Why this is Steam-only

- `LegendaryLibraryManager.getGameInfo(appName, forceReload)`
  (`src/backend/storeManagers/legendary/library.ts:203`) calls `this.loadFile(appName)`
  **synchronously** when `!library.has(appName)` — the read never returns before the library is
  populated.
- Both `src/backend/storeManagers/gog/games.ts` (~:189) and
  `src/backend/storeManagers/legendary/games.ts` (~:109) carry an explicit `title: ''` fallback
  (with a `logError`) in their own not-found branch — a deliberate, visible placeholder rather
  than a bare `{}`.
- Steam's `getGameInfo()` has neither the synchronous-load pattern nor the explicit-fallback
  pattern its siblings have. The in-memory `library` Map is populated by
  `SteamLibraryManager.refresh()`'s CM sync, which is async and can still be in flight when a
  caller reads `getGameInfo()` — e.g. renderer boot, or (per this todo) an install failure racing
  ahead of a library population that hasn't landed yet.

## Open question research left unanswered

Whether this async-population race causes non-title symptoms elsewhere that would justify closing
it structurally (rather than papering over each call site with its own fallback, the way 37-04 did
for the install-failure dialog). `getGameInfo()` has several other callers in
`src/backend/storeManagers/steam/games.ts` itself (e.g. `isGameAvailable()`, `uninstall()`,
`stop()`) and in `src/backend/downloadmanager/utils.ts` (`installQueueElement`,
`updateQueueElement`, now both routed through `resolveQueueElementTitle`) — each one that
destructures a field straight off `getGameInfo()`'s return without a null/empty guard inherits the
same async-miss gap. A structural fix would likely mirror the two-step fallback
`getGameInfo()` already has for the `library` Map miss (`steamLibraryStore` cache read) at a level
that's reachable before the CM sync completes, or would make the async gap impossible by ensuring
`getGameInfo()` cannot be called before the map is at least cache-hydrated.

## Scope note (D-09)

REQ-37-03 is closed by the 37-04 fallback (`title || appName` in
`src/backend/downloadmanager/utils.ts`'s `resolveQueueElementTitle`). This todo does **not**
reopen it — it exists so the root cause is on record rather than silently dropped once the
symptom stopped being visible.

## Resolution (2026-09-07, quick task `260907-e7a`)

Closed by the census this todo's `## Open question research left unanswered` section asked for.
Three quick tasks answered it in sequence: `260905-luf` (the title axis + the D-01 sentinel
decision), `260905-mv5` (the four remaining unguarded title sites), and this one (the non-title
axis, the raw-Map bypass, and this closure).

### (a) D-01 makes most of this a non-defect, not an oversight

`SteamGame.getGameInfo()` returning `{} as GameInfo` on a double cache miss is a **deliberate
cross-runner sentinel**, confirmed by `260905-luf` as D-01 and deliberately left in place. It is a
protocol, not a bug: three consumers depend on its falsiness and would break if it were replaced
with a populated stub.

| Consumer | The line that depends on `{}` being falsy/empty |
|---|---|
| `backend/gamedetails/dispatch.ts:82` | `if (!Object.keys(tempGameInfo).length) return null` — converts `{}` → `null`, which is the shape the frontend is built to handle. |
| `backend/sidecar/appShellFlowRegistration.ts:536` | `if (info?.app_name) return runner` — the tray runner-resolution loop skips a runner on a falsy `app_name` and tries the next one. |
| `backend/storeManagers/steam/library.ts:1257` | `if (fromGame.app_name) return fromGame`, then its own persisted-cache fallback. |

`260907-e7a`'s census found a **fourth** consumer of the same shape that D-01 does not name:
`backend/protocol.ts:221`'s `if (maybeGameInfo.app_name) return maybeGameInfo` in `findGame`'s
no-runner search loop. Recorded here so any future change to the `{}` return knows about it.

Populating a stub `GameInfo` in the double-miss branch is therefore **rejected**, permanently, by
D-01 — not deferred.

### (b) This todo's own title is factually wrong, and its body names a site in error

**The title is wrong.** It blames "the empty-title install-failure dialog". `260905-luf` disproved
that: the nameless surface was the **OS notification** emitted by
`backend/downloadmanager/downloadqueue.ts`'s `processNotification`, **not** the install-failure
dialog the title names. `resolveQueueElementTitle` already carried its `title || appName` fallback,
and luf's control test for the dialog was **GREEN on its first run** — there was nothing to fix
there. The title's framing is preserved above only as the historical record; it should not be
restated as if it held.

**The body names a site in error.** Under "Open question research left unanswered" this todo lists
`stop()` among the `getGameInfo()` callers that "inherit the same async-miss gap". It does not call
`getGameInfo()` at all. Re-verified at `src/backend/storeManagers/steam/games.ts:2803`: `stop()`
reads `nativeInstallsInFlight.get(this.appId)`, aborts the in-flight native depot download if one
exists, and otherwise `logWarning`s a no-op. The census confirms this independently — `steam/games.ts`
contains exactly **three** real `getGameInfo()` calls (L936, L2037, L2831) and `stop()` is not among
them. Verdict for that site: **not-applicable**.

### (c) The census and verdict table (inline)

Command, run verbatim at HEAD `4c0a7f58d`:

```
grep -rn "getGameInfo()" src/backend --include='*.ts' | grep -v __tests__ | wc -l
```

**Total: 101.** Buckets: outside `storeManagers/` **33** + inside `storeManagers` but not
`steam/games.ts` **53** + `steam/games.ts` **15** = **101**.

Class counts: **29 + 51 + 4 + 6 + 5 + 4 + 2 = 101**.

| # | Class | Count |
|---|---|---|
| 1 | `not-a-call` (comment / JSDoc / log string / method definition) | 29 |
| 2 | `same-runner` — the `{}` sentinel structurally unreachable | 51 |
| 3a | title-axis, already dispositioned by `260905-luf` / `260905-mv5` | 4 |
| 3b | title-axis, **never** dispositioned — newly surfaced by this census | 6 |
| 4 | non-title, **guarded** | 5 |
| 5 | non-title, **relies-on-sentinel (intentional)** | 4 |
| 6 | non-title, **genuinely unguarded** | 2 |

Class 3 had to be split: the plan assumed every title-axis hit was already closed, but `260905-mv5`
closed exactly four sites and six other title-axis hits are Steam-reachable and were never touched.

**Class 3a — title-axis, already dispositioned (4)**

| file:line | Closed by |
|---|---|
| `utils/gameTitle.ts:58` (`resolveGameTitle`) | mv5 D-02 — this *is* the shared fallback chain |
| `utils/gameTitle.ts:77` (`resolveTitleForGame`) | mv5 D-02 — the `Game`-instance counterpart |
| `shortcuts/ipc_handler.ts:35` (`shortcutsExists`, Electron) | mv5 SUMMARY row 3 — D-03 guard (`if (!title) { logWarning; return false }`) |
| `sidecar/shortcutsFlowRegistration.ts:143` (`shortcutsExists`, sidecar) | mv5 SUMMARY row 4 — identical D-03 guard |

**Class 3b — title-axis, never dispositioned (6)**

| file:line | Consequence when `{}` |
|---|---|
| `gamedetails/dispatch.ts:176` (`repair`) | `notify({ title: undefined })`. Steam-inert: `SteamGame.repair()` (`games.ts:2260-2266`) is a log-only stub. |
| `wiki_game_info/wiki_game_info.ts:29` | `removeSpecialcharacters(undefined)` throws, **caught** by the `try` at L33 → `logError` + `null` return. Compat data stays empty; no crash. |
| `shortcuts/nonesteamgame/nonesteamgame.ts:207` (`addNonSteamGame`) | VDF entry with `AppName: undefined`. UI-gated off for Steam (`GameSubMenu/index.tsx:518`, `!isSteam`). |
| `shortcuts/nonesteamgame/nonesteamgame.ts:378` (`removeNonSteamGame`) | Same gate; a no-match removal loop. |
| `shortcuts/nonesteamgame/nonesteamgame.ts:510` (`isAddedToSteam`) | **Does run for Steam** — the `useEffect` at `GameSubMenu/index.tsx:299` is outside the `!isSteam` gate. `checkIfAlreadyAdded(content, undefined)` → `-1` → `false`. No observable consequence: the button it drives is hidden for Steam. |
| `storeManagers/steam/launchDispatch.ts:53` | `addRecentGame` writes `{appName: undefined, title: undefined, runner: undefined}`; the tray shows a nameless recent row until the next add filters it out (`recent_games.ts:35`). |

**Class 4 — non-title, guarded (5)**

| file:line | Field(s) | Guard |
|---|---|---|
| `steam/games.ts:936` (`getExtraInfo`) | `extra` | `info.extra ?? { reqs: [], about: {…} }` |
| `steam/games.ts:2037` (`ensurePlatformsCaptured`) | `extra`, `title` | callee `fetchMetadataIfNeeded` never bare-derefs: `...current.extra` (L752), `current.extra?.reqs ?? []` (L753), `data.name ?? current.title` (L824) |
| `steam/games.ts:2831` (`isGameAvailable`) | `is_installed`, `install.install_path` | `Boolean(info?.is_installed && info.install?.install_path && existsSync(…))` |
| `downloadmanager/downloadqueue.ts:350` | `folder_name` | `if (folder_name) { removeFolder(…) }` |
| `wiki_game_info/howlongtobeat/utils.ts:327` | `runner` | `if (gameInfo.runner == 'gog')` — `undefined == 'gog'` is false |

**Class 5 — relies-on-sentinel, intentional (4)**: the three D-01 consumers in (a) above, plus
`protocol.ts:221`.

**Class 6 — non-title, genuinely unguarded (2)**

| file:line | Why unguarded | Concrete consequence |
|---|---|---|
| `protocol.ts:215` (`findGame`, explicit-runner branch) | Returns `{}` **directly**; the caller's guard at `protocol.ts:116` is `if (!gameInfo)` and `{}` is **truthy**, so it fails open. `protocol.ts:124` then does `libraryManagerMap[gameInfo.runner].getGame(appName)` with `runner === undefined`. | A `gamelib://` deep link throws `TypeError: Cannot read properties of undefined (reading 'getGame')`. The launch silently does nothing; no dialog, only an unhandled rejection in the log. Note the sibling branch at L221 **is** guarded — the two branches of the same function disagree. |
| `tools/index.ts:896` (`runWineCommandOnGame`) | `const { folder_name, install } = game.getGameInfo()` then `install.install_path` at L903. The only preceding check is `if (game.isNative())` at L892 — an early return for native games, not a `GameInfo` guard. | For a bottle-eligible (`isNative() === false`) macOS Steam game driven through a Wine-tools channel: `TypeError` destructuring `install_path` of undefined; the winetricks/winecfg invocation rejects instead of running. |

The **four sites this todo names by hand**, answered on its own terms: `games.ts:936` **guarded**;
`games.ts:2831` **guarded**; `games.ts:2037` **guarded (callee tolerates `{}`)**; `stop()`
**not-applicable — named in error** (see (b)).

One field-axis read evaded the `getGameInfo()` grep entirely and is recorded so it is not
re-discovered: `shortcuts/nonesteamgame/steamhelper.ts:69` and `:87` read `props.gameInfo.art_cover`
on a value captured at `nonesteamgame.ts:207` and passed across a module boundary at
`nonesteamgame.ts:272`, so no `getGameInfo()` token appears on those lines. It inherits
`nonesteamgame.ts:207`'s class-3b disposition.

### (d) Task 2's decision: the raw-Map bypass is a documented non-gap

`uninstall()` (`games.ts:2354`) and `uninstallBottleGameDirectly()` (`games.ts:2578`) read
`library.get(this.appId)?.install?.install_path` directly, bypassing `getGameInfo()`. Their existing
comments justified this by the metadata-fetch side effect only — but the bypass also forfeits
`getGameInfo()`'s `steamLibraryStore` fallback **and** its Map self-heal (`games.ts:596-604`,
`library.set(this.appId, cached)` at L601).

**Verdict: NOT REACHABLE. Documented non-gap — no production behaviour changed, no test written.**

| Candidate window | Verdict | Deciding evidence |
|---|---|---|
| (a) Before `init()` runs | **OPEN — reported, not assumed away.** | The uninstall control at `frontend/screens/Game/GameSubMenu/index.tsx:435-449` is gated on `disabled={is.playing}` (L445) alone — nothing gates it on library hydration, and for Steam L437-439 fires `window.api.uninstall(...)` with no confirm modal. The renderer *can* present an actionable uninstall before backend hydration lands. |
| (b) The `refresh()` clear→rebuild window | **KILLED.** | `library.ts:1090` `library.clear()` → `L1091` `for (const app of ownedApps) {` (plain `for…of`) → `L1215` `library.set(...)` → `L1220` `steamLibraryStore.set('games', Array.from(library.values()))`. Re-measured: **zero** `await`/`.then(`/`yield`/`async `/`return `/`throw ` in `NR 1090..1215`. One uninterrupted synchronous block; no IPC handler can observe a cleared Map. |
| (c) Store holds an entry a completed `refresh()` dropped | **KILLED.** | `library.ts:1220` writes the store **from** the rebuilt Map, wholesale, in that same block. The Map is the source of the store; the two cannot diverge after a completed refresh. |
| (d) Ordering — a path to `uninstall()` that never called `getGameInfo()` first | **KILLED — load-bearing.** | **No such path exists.** `uninstaller.ts:118` is the **sole** caller of `.uninstall(` in `src/backend`; its sole IPC registration is `sidecar/installFlowRegistration.ts:216` → `uninstallGameCallback`. Five lines earlier, `uninstaller.ts:113` runs `resolveGameTitle(libraryManagerMap, runner, appName)` → `utils/gameTitle.ts:58`'s `getGameInfo()` for the same appId, which already performed the store fallback and already self-healed the Map. **No `await` sits between L113 and L118**, so nothing can interleave and undo it. |

(d) is what makes the verdict timing-independent: whatever state the Map is in — including the
cleared state window (a) leaves open — the caller repairs it before `games.ts:2354` reads it. The
forfeited store fallback is **redundant, because the bypass's only caller already performed it**.
`uninstallBottleGameDirectly()` inherits this: it is `private` (`games.ts:2552`) and its only call
site is `uninstall()` at `games.ts:2363`.

One shape is **not** fully killed and is recorded rather than buried: a *synchronous* exception
thrown inside the rebuild loop (`library.ts:1091-1217`) would leave the Map cleared while the store
kept the previous list (`catch` at L1222 re-throws at L1236). It requires an unrelated latent defect
— that window contains no `throw` of its own — and (d) still holds even then.

**Deliverable:** source comments at both bypass sites, tagged `260907-e7a`, recording the wider
forfeit, the evidence that makes it harmless, and "do not re-open without new evidence". The diff is
**32 additions, 0 deletions, every added line a comment** — so `NUMERIC_APP_ID.test` (`games.ts:2566`)
and the `resolveInstallRoot` containment check are provably untouched. `tsc --noEmit` clean;
`games.test.ts` 269/269 green; `git diff --stat public/locales/` empty.

### What remains explicitly NOT done, and why

1. **Making `getGameInfo()` async stays scoped out.** ~40 call sites across ~20 files; `260905-luf`
   ruled it needs its own phase. This census found nothing that changes that judgement — no class-6
   row requires async to fix; both are ordinary guard additions.
2. **Populating a stub `GameInfo` in the double-miss branch stays rejected**, permanently, by D-01
   (see (a)).
3. **The two class-6 rows were NOT fixed here** and are not buried. `protocol.ts:215` and
   `tools/index.ts:896` are non-title, non-uninstall sites outside `260907-e7a`'s planned file set,
   and neither is the bypass question that task existed to answer. They are named above with a
   proposed fix each (`protocol.ts:215` — return `undefined` instead of a `{}` that defeats the
   caller's own truthiness guard, mirroring L222's shape; `tools/index.ts:896` — optional-chain
   `install?.install_path` the way `isGameAvailable` already does) and carried into a **follow-up
   todo** rather than dying with this closure.
4. **The six class-3b rows were NOT fixed here.** Each is documented above with its consequence;
   all six are either UI-gated off for Steam, caught by an enclosing `try`, or cosmetically
   self-correcting. None is a data-loss or crash path. They are recorded, not actioned.

## Closed (2026-09-07)

Resolved by quick task `260907-e7a`. Full census, per-site verdicts, the re-measurement table and
the bypass evidence chain live in
`.planning/quick/260907-e7a-audit-and-close-the-non-title-axis-of-th/260907-e7a-SUMMARY.md`.
