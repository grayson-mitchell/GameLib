---
phase: quick-260712-lkn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/wiki_game_info/wiki_game_info.ts
  - src/backend/wiki_game_info/ipc_handler.ts
  - src/common/types/ipc.ts
  - src/frontend/types.ts
  - src/frontend/screens/Game/GameContext.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "On macOS/Linux, the CrossOver rating pill shows a small refresh icon button"
    - "Clicking the refresh icon force-refetches wiki info bypassing the 30-day cache and re-renders the pill with fresh data"
    - "Clicking the refresh icon does NOT open the CodeWeavers link (parent onClick is suppressed)"
    - "The refresh control shows a disabled/loading state while the fetch is in flight"
  artifacts:
    - path: "src/backend/wiki_game_info/wiki_game_info.ts"
      provides: "getWikiGameInfo forceRefresh parameter that skips the cached-response early return"
      contains: "forceRefresh"
    - path: "src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx"
      provides: "Refresh IconButton on the CrossOver pill"
      contains: "Refresh"
  key_links:
    - from: "src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx"
      to: "window.api.getWikiGameInfo"
      via: "refresh callback from GameContext"
      pattern: "getWikiGameInfo"
    - from: "src/backend/wiki_game_info/ipc_handler.ts"
      to: "getWikiGameInfo"
      via: "forceRefresh arg threaded through handler"
      pattern: "forceRefresh"
---

<objective>
Add a user-facing "refresh" control to the CrossOver compatibility rating pill so a stale
cached rating (notably games cached with `codeweavers` = a real `null` rating, which the
existing self-heal logic will NOT re-fetch for up to 30 days) can be force-refetched on demand.

Purpose: Once a game is cached as unrated (e.g. Avernum 4 -> `{ macRating: null, linuxRating: null, slug }`),
a newly-added CrossOver rating on codeweavers.com is invisible until the 30-day TTL expires.
There is currently no way to force a re-fetch.

Output: A small MUI Refresh IconButton on the CrossOver pill that bypasses the cache, plus the
backend `forceRefresh` plumbing that makes the bypass possible.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- Confirmed from codebase. Executor should use these directly. -->

Backend entrypoint — src/backend/wiki_game_info/wiki_game_info.ts:
```typescript
export async function getWikiGameInfo(game: Game): Promise<WikiInfo | null>
// Cached-response early return lives at lines ~24-48:
//   const cachedResponse = wikiGameInfoStore.get(title)
//   ... staleAppleData / staleCrossoverData computed ...
//   if (cachedResponse && !staleAppleData && !staleCrossoverData) { return cachedResponse }
// Fresh fetch + `wikiGameInfoStore.set(title, wikiGameInfo)` follows.
```

IPC handler — src/backend/wiki_game_info/ipc_handler.ts:
```typescript
addHandler('getWikiGameInfo', async (e, title, appName, runner) =>
  getWikiGameInfo(getGame(appName, runner))
)
```

IPC type — src/common/types/ipc.ts (~line 436):
```typescript
getWikiGameInfo: (
  title: string,
  appName: string,
  runner: Runner
) => Promise<WikiInfo | null>
```

Frontend context type — src/frontend/types.ts (interface GameContextType, ~line 285):
```typescript
// currently ends with:
  status: Status | undefined
  wikiInfo: WikiInfo | null
```

Context default — src/frontend/screens/Game/GameContext.tsx:
```typescript
const initialContext: GameContextType = { ... wikiInfo: null }
```

GamePage wiring — src/frontend/screens/Game/GamePage/index.tsx:
```typescript
// line 96:
const [wikiInfo, setWikiInfo] = useState<WikiInfo | null>(null)
// lines 295-304: useEffect fetches getWikiGameInfo(title, appName, runner) then setWikiInfo(info)
// line 366+: const contextValues: GameContextType = { ...many fields..., wikiInfo }
```

Pill component — src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:
```typescript
const { wikiInfo, is } = useContext(GameContext)
// showCrossover block ~lines 92-113 renders <a className="iconWithText" onClick={onClickCrossover}> pill
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add forceRefresh plumbing through backend + IPC</name>
  <files>src/backend/wiki_game_info/wiki_game_info.ts, src/backend/wiki_game_info/ipc_handler.ts, src/common/types/ipc.ts</files>
  <action>
Add an optional second parameter `forceRefresh = false` to `getWikiGameInfo` in
`src/backend/wiki_game_info/wiki_game_info.ts`. Signature becomes
`export async function getWikiGameInfo(game: Game, forceRefresh = false): Promise<WikiInfo | null>`.
In the cached-response early-return guard (currently `if (cachedResponse && !staleAppleData && !staleCrossoverData)`),
add `!forceRefresh &&` so it becomes `if (!forceRefresh && cachedResponse && !staleAppleData && !staleCrossoverData)`.
Leave everything else unchanged — when `forceRefresh` is true the function falls through to the
fresh fetch and the existing `wikiGameInfoStore.set(title, wikiGameInfo)` call re-populates the cache.

In `src/backend/wiki_game_info/ipc_handler.ts`, thread the new arg:
`addHandler('getWikiGameInfo', async (e, title, appName, runner, forceRefresh) => getWikiGameInfo(getGame(appName, runner), forceRefresh))`.

In `src/common/types/ipc.ts` (~line 436) add the optional param to the signature:
`getWikiGameInfo: (title: string, appName: string, runner: Runner, forceRefresh?: boolean) => Promise<WikiInfo | null>`.
The preload `makeHandlerInvoker('getWikiGameInfo')` forwards extra args automatically — no preload edit needed.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx tsc --noEmit 2>&1 | grep -E "wiki_game_info|ipc\.ts" || echo "no wiki/ipc type errors"</automated>
  </verify>
  <done>getWikiGameInfo accepts forceRefresh; the cache early-return is skipped when true; the IPC handler and type both carry the optional forceRefresh arg. tsc reports no new type errors in the edited files.</done>
</task>

<task type="auto">
  <name>Task 2: Expose refresh callback via GameContext and add Refresh button to CrossOver pill</name>
  <files>src/frontend/types.ts, src/frontend/screens/Game/GameContext.tsx, src/frontend/screens/Game/GamePage/index.tsx, src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx</files>
  <action>
Wire a force-refresh callback from GamePage down to the pill via GameContext (minimal wiring:
the IPC call stays in GamePage where title/appName/runner already exist).

1. `src/frontend/types.ts` — in `interface GameContextType`, add an optional field after `wikiInfo`:
`refreshWikiInfo?: () => Promise<void>`.

2. `src/frontend/screens/Game/GameContext.tsx` — no functional field required in `initialContext`
(the field is optional). Leave `initialContext` as-is; the optional type covers the default.

3. `src/frontend/screens/Game/GamePage/index.tsx` — define a callback near the wikiInfo state
(line 96) that force-refetches and updates state:
`const refreshWikiInfo = useCallback(async () => { const info = await window.api.getWikiGameInfo(gameInfo.title, appName, runner, true); if (info) setWikiInfo(info) }, [gameInfo.title, appName, runner])`.
Import `useCallback` from React if not already imported. Add `refreshWikiInfo` to the
`contextValues: GameContextType` object (alongside `wikiInfo` at ~line 401). Note this refresh
path intentionally sets any non-null `info` (unlike the initial useEffect which gates on
applegamingwiki/howlongtobeat/pcgamingwiki) so a codeweavers-only update still lands.

4. `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` — in the `showCrossover`
block (~lines 92-113):
   - Pull `refreshWikiInfo` from `useContext(GameContext)` alongside `wikiInfo, is`.
   - Add local loading state: `const [refreshing, setRefreshing] = useState(false)`.
   - Import `IconButton` from `@mui/material` and `Refresh` from `@mui/icons-material`, and
`useState` from react.
   - Render a small `IconButton` (size="small") containing `<Refresh fontSize="small" />` inside
the pill, after the Rating/Unrated content. Give it
`title={t('info.refresh-rating', 'Refresh rating')}` and matching `aria-label`.
   - onClick handler must call `event.stopPropagation()` (and `event.preventDefault()`) to stop
the parent `<a onClick={onClickCrossover}>` from opening the CodeWeavers window, then set
`refreshing` true, `await refreshWikiInfo?.()`, and set `refreshing` false in a finally.
   - Set the IconButton `disabled={refreshing}` so it shows a disabled state while in flight.
Match existing conventions: MUI icons + IconButton, the `iconWithText` pattern, `t()` from the
'gamepage' namespace. Keep it minimal — no new CSS files.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx tsc --noEmit 2>&1 | grep -E "AppleWikiInfo|GamePage/index|GameContext|frontend/types" || echo "no frontend type errors"</automated>
  </verify>
  <done>The CrossOver pill renders a small Refresh IconButton; clicking it calls window.api.getWikiGameInfo(..., true) via refreshWikiInfo, stops the parent link from firing, disables during the fetch, and updates wikiInfo so the pill re-renders. tsc reports no new type errors.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no new errors (project `codecheck` script).
- `npx eslint --cache src/backend/wiki_game_info src/frontend/screens/Game` passes (project `lint`).
- `npx jest src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts` still passes (no regression in codeweavers fetch).
</verification>

<success_criteria>
- A macOS/Linux user viewing a game whose CrossOver rating is cached as `null` can click a
  refresh icon on the pill and see the freshly-fetched rating without waiting for the 30-day TTL.
- Clicking refresh never navigates to codeweavers.com.
- The refresh control is disabled while the fetch is in flight.
- No type or lint regressions; existing codeweavers test still green.
</success_criteria>

<output>
Create `.planning/quick/260712-lkn-add-refresh-affordance-for-crossover-com/260712-lkn-SUMMARY.md` when done
</output>
