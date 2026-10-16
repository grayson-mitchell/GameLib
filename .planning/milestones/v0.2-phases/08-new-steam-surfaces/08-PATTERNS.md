# Phase 8: New Steam Surfaces — Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 6 (5 modified source files + 1 i18n file)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` | component | request-response | Same file — existing Epic/GOG/Amazon/Zoom sub-items (lines 143–165) | exact |
| `src/frontend/screens/WebView/index.tsx` | screen | request-response | Same file — `validStoredUrl` switch + `urls` map (lines 17–88) | exact |
| `src/frontend/screens/ConsoleMode/index.tsx` | screen | CRUD | Same file — existing per-runner `allGames` spread + `storeFilters` + refresh guard | exact |
| `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx` | component | event-driven | Same file — `useEffect` launch + `onDismiss` finally pattern (lines 66–77) | exact |
| `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx` | component | request-response | Same file — `consoleModal` shell + keydown dismiss + `useEffect` + `onDismiss` | exact |
| `public/locales/en/translation.json` | config | — | Lines 226–270 (`console.*`) + lines 1094, 1225 (store keys) | exact |

All files are modifications to existing files. No new files are created in this phase. All analogs are within the files being modified — the patterns to copy are already present in each file.

---

## Pattern Assignments

### `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx`

**Analog:** Same file, lines 142–167 (Stores `SidebarSubmenu` block)

**Existing sub-item pattern** (lines 142–167):
```tsx
{inWebviewScreen && (
  <div className="SidebarSubmenu">
    <SidebarItem
      className="SidebarLinks__subItem"
      url="/store/epic"
      label={t('store', 'Epic Store')}
    />
    <SidebarItem
      className="SidebarLinks__subItem"
      url="/store/gog"
      label={t('gog-store', 'GOG Store')}
    />
    <SidebarItem
      className="SidebarLinks__subItem"
      url="/store/amazon"
      label={t('amazon-luna', 'Amazon Luna')}
    />
    {zoom.enabled && (
      <SidebarItem
        className="SidebarLinks__subItem"
        url="/store/zoom"
        label={t('zoom-store', 'Zoom Store')}
      />
    )}
  </div>
)}
```

**Steam sub-item to insert** (after Amazon, before Zoom — i.e. after line 158, before the `zoom.enabled` conditional):
```tsx
<SidebarItem
  className="SidebarLinks__subItem"
  url="/store/steam"
  label={t('steam-store', 'Steam Store')}
/>
```

Key observations:
- No icon prop — sub-items have no icons (contrast with top-level items which have `icon={faStore}` etc.)
- No conditional guard — Steam is always rendered (not gated on `steam.username` or similar), same as Epic/GOG/Amazon
- i18n pattern: `t('key', 'Default English')` with a flat string key matching the pattern `store`/`gog-store`/`amazon-luna`/`zoom-store` → new key: `steam-store`
- `SidebarItem` import is already present (line 28); `useContext(ContextProvider)` destructure does NOT need `steam` added here (Steam has no username/enabled gate)

---

### `src/frontend/screens/WebView/index.tsx`

**Analog:** Same file

**`validStoredUrl` switch** (lines 17–30) — copy one `case` block:
```typescript
const validStoredUrl = (url: string, store: string) => {
  switch (store) {
    case 'epic':
      return url.includes('epicgames.com')
    case 'gog':
      return url.includes('gog.com')
    case 'amazon':
      return url.includes('gaming.amazon.com')
    case 'zoom':
      return url.includes('zoom-platform.com')
    default:
      return false
  }
}
```
**Add before `default`:**
```typescript
    case 'steam':
      return url.includes('store.steampowered.com')
```

**`urls` map** (lines 76–88) — copy an existing entry:
```typescript
const urls: { [pathname: string]: string } = {
  '/store/epic': epicStore,
  '/store/gog': gogStore,
  '/store/amazon': amazonStore,
  '/store/zoom': zoomStore,
  '/wiki': wikiURL,
  // ...login entries...
}
```
**Add one entry:**
```typescript
  '/store/steam': 'https://store.steampowered.com/',
```

**`partition` attribute** (line 383) — no change needed, already `persist:${store}` → resolves to `persist:steam` automatically:
```tsx
partition={`persist:${startUrl === epicLoginUrl ? 'epicstore' : store}`}
```

**`showLoginWarningFor` type** (lines 298–300) — DO NOT add `'steam'`:
```typescript
const [showLoginWarningFor, setShowLoginWarningFor] = useState<
  null | 'epic' | 'gog' | 'amazon' | 'zoom'
>(null)
```
This type must stay exactly as-is. Do not add a `'steam'` branch to the `useEffect` at lines 308–328 either.

**`steamStore` variable** — declare alongside the other store URL constants (lines 61–65):
```typescript
const epicStore = `https://www.epicgames.com/store/${lang}/`
const gogStore = `https://af.gog.com?as=1838482841`
const amazonStore = `https://gaming.amazon.com`
const zoomStore = `https://www.zoom-platform.com`
// add:
const steamStore = 'https://store.steampowered.com/'
```
Then reference `steamStore` in the `urls` map instead of the inline string.

---

### `src/frontend/screens/ConsoleMode/index.tsx`

**Analog:** Same file

**Context destructure** (lines 60–72) — add `steam` alongside `epic`, `gog`, `amazon`, `zoom`:
```typescript
const {
  epic,
  gog,
  amazon,
  zoom,
  // add:
  steam,
  libraryStatus,
  sideloadedLibrary,
  refreshLibrary,
  refreshing,
  gameUpdates
} = useContext(ContextProvider)
```

**Refresh guard `useEffect`** (lines 99–114) — add `steam.library.length === 0` condition:
```typescript
useEffect(() => {
  window.api.setFullscreen(true)
  if (
    !refreshing &&
    epic.library.length === 0 &&
    gog.library.length === 0 &&
    amazon.library.length === 0 &&
    zoom.library.length === 0
    // add:
    && steam.library.length === 0
  ) {
    void refreshLibrary({ runInBackground: true })
  }
  return () => {
    window.api.setFullscreen(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**`allGames` useMemo** (lines 116–131) — add `steam.library` spread after `amazon.library`, before `zoom.library`:
```typescript
const allGames = useMemo<GameInfo[]>(() => {
  const all: GameInfo[] = [
    ...epic.library,
    ...gog.library,
    ...amazon.library,
    // add:
    ...steam.library,
    ...zoom.library,
    ...sideloadedLibrary
  ]
  return all.filter((g) => !g.install?.is_dlc && !g.thirdPartyManagedApp)
}, [
  epic.library,
  gog.library,
  amazon.library,
  // add:
  steam.library,
  zoom.library,
  sideloadedLibrary
])
```

**`storeFilters` useMemo** (lines 159–183) — add Steam chip after `nile`/Amazon, before `sideload`/Other. Copy the exact object shape:
```typescript
{ key: 'nile', label: 'Amazon', enabled: storesWithGames.has('nile') },
// add:
{ key: 'steam', label: 'Steam', enabled: storesWithGames.has('steam') },
{
  key: 'sideload',
  label: t('console.filter.sideload', 'Other'),
  enabled: storesWithGames.has('sideload')
},
```
Note: `label` is a hardcoded string, not wrapped in `t()` — matches the 'Epic', 'GOG', 'Amazon', 'ZOOM' pattern. Runner key for Steam is `'steam'` (matches the `runner` field on `GameInfo` for Steam games).

---

### `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx`

**Analog:** Same file

**Existing managed launch `useEffect`** (lines 66–77):
```typescript
// Fire the launch exactly once on mount; the overlay closes via onDismiss
// in the finally block. Intentionally not depending on the launch inputs.
useEffect(() => {
  void launch({
    appName: game.app_name,
    t,
    runner: game.runner as Runner,
    hasUpdate: false,
    showDialogModal
  }).finally(() => {
    onDismiss()
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**Steam fire-and-forget pattern** — replace the single `useEffect` with a runner-conditional approach:
```typescript
useEffect(() => {
  if (game.runner === 'steam') {
    // Fire-and-forget: steam://rungameid resolves immediately.
    // Hold the overlay for 1500ms so the user sees confirmation.
    void launch({
      appName: game.app_name,
      t,
      runner: game.runner as Runner,
      hasUpdate: false,
      showDialogModal
    })
    const timer = setTimeout(onDismiss, 1500)
    return () => clearTimeout(timer)
  } else {
    void launch({
      appName: game.app_name,
      t,
      runner: game.runner as Runner,
      hasUpdate: false,
      showDialogModal
    }).finally(() => {
      onDismiss()
    })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**Existing spinner idle-state pattern** (lines 109–113):
```tsx
<div
  className={classNames('consoleLaunchSpinner', {
    idle: status === 'playing'
  })}
/>
```
For Steam: apply `idle` class unconditionally (since Steam never emits `'playing'` status — the spinner should immediately show the green "done" state). Add `|| game.runner === 'steam'` to the idle condition:
```tsx
<div
  className={classNames('consoleLaunchSpinner', {
    idle: status === 'playing' || game.runner === 'steam'
  })}
/>
```

**Existing status label** (lines 114–116):
```tsx
<div className="consoleLaunchText">
  {label || t('console.launching', 'Launching')}
</div>
```
For Steam: `label` will be `null` (no `status` events from Steam CM), so the fallback `|| t(...)` fires. Replace the fallback for Steam:
```tsx
<div className="consoleLaunchText">
  {game.runner === 'steam'
    ? t('console.steam.launched', 'Launched in Steam')
    : label || t('console.launching', 'Launching')}
</div>
```

**`BackHint` / hold-to-cancel** (lines 120–125):
```tsx
<BackHint
  prefix={t('console.cancel.hintPrefix', 'Hold')}
  suffix={t('console.cancel.hintSuffix', 'for 3s to cancel')}
  active={holdStart != null}
/>
```
For Steam: do not render `BackHint` (no cancellable in-flight operation):
```tsx
{game.runner !== 'steam' && (
  <BackHint
    prefix={t('console.cancel.hintPrefix', 'Hold')}
    suffix={t('console.cancel.hintSuffix', 'for 3s to cancel')}
    active={holdStart != null}
  />
)}
```

**`useCancelOnHold`** (lines 34–43) — disable for Steam by setting `active: false`:
```typescript
const { holdStart, startHold, stopHold } = useCancelOnHold({
  active: !!game && game.runner !== 'steam',
  holdMs: CANCEL_HOLD_MS,
  onCancel: () => {
    if (game) void sendKill(game.app_name, game.runner)
    onDismiss()
  }
})
```

---

### `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx`

**Analog:** Same file

**`console-modal-open` body class guard** (lines 85–90) — keep as-is for Steam (prevents back-button pop during modal):
```typescript
useEffect(() => {
  document.body.classList.add('console-modal-open')
  return () => document.body.classList.remove('console-modal-open')
}, [])
```

**Existing keydown Escape handler** (lines 182–235) — the `Escape → onDismiss()` path already works for Steam. Keep the full keydown handler; it handles early dismiss correctly.

**Existing `consoleModal` JSX shell** (lines 250–256):
```tsx
<div className="consoleInstallOverlay" role="dialog" aria-live="polite">
  <div className="consoleModal">
    <div className="consoleModalTitle">
      {t('console.install.title', 'Install game')}
    </div>
    <div className="consoleModalGameTitle">{game.title}</div>
    ...
  </div>
</div>
```

**Steam handoff pattern** — branch on `game.runner === 'steam'` in the `useEffect` block and in JSX. Add a Steam-specific `useEffect` that fires the install handoff and schedules auto-dismiss:

```typescript
// Add alongside existing useEffects, after the 'console-modal-open' guard:
useEffect(() => {
  if (game.runner !== 'steam') return
  let cancelled = false
  void install({
    gameInfo: game,
    previousProgress: null,
    progress,
    installPath: 'default',
    isInstalling: false,
    platformToInstall: 'Windows',
    t,
    showDialogModal: () => null
  })
  const timer = setTimeout(() => {
    if (!cancelled) onDismiss()
  }, 1500)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**Steam JSX — minimal modal body** (replaces `consoleInstallFields` + buttons block for Steam):
```tsx
return (
  <div className="consoleInstallOverlay" role="dialog" aria-live="polite">
    <div className="consoleModal">
      {game.runner === 'steam' ? (
        <>
          <div className="consoleModalTitle">
            {t('console.steam.installing', 'Opening Steam to install…')}
          </div>
          <div className="consoleModalGameTitle">{game.title}</div>
        </>
      ) : (
        <>
          <div className="consoleModalTitle">
            {t('console.install.title', 'Install game')}
          </div>
          <div className="consoleModalGameTitle">{game.title}</div>
          <div className="consoleInstallFields">
            {/* ... existing platform/wine/path rows ... */}
          </div>
          <div className="consoleInstallButtons">
            {/* ... existing cancel/install buttons ... */}
          </div>
        </>
      )}
    </div>
  </div>
)
```

Note: The `consoleModalTitle` CSS applies `text-transform: uppercase; letter-spacing: 0.2em` already — no new SCSS needed.

**`cancelled` ref pattern** — use the `cancelled` boolean local to the `useEffect` closure (shown above) rather than a `useRef`. This is simpler and matches the existing `let cancelled = false` pattern already used at lines 76–83 (`requestAppSettings` fetch):
```typescript
useEffect(() => {
  let cancelled = false
  void window.api.requestAppSettings().then((settings) => {
    if (!cancelled) setInstallPath(settings.defaultInstallPath)
  })
  return () => {
    cancelled = true
  }
}, [])
```

---

### `public/locales/en/translation.json`

**Analog:** Existing store-label keys (lines 1094, 1225) and `console.*` keys (lines 226–270)

**Three new keys to add:**

**Key 1** — Sidebar sub-item label. Add alongside peer keys `"store"`, `"gog-store"`, `"amazon-luna"`, `"zoom-store"`. Insert near line 1225 (after `zoom-store`, before the `steam` object):
```json
"steam-store": "Steam Store",
```

**Key 2 & 3** — Console mode overlay strings. Add inside the `"console"` object (lines 226–271), as a new `"steam"` sub-object after the existing `"sort"` key:
```json
"steam": {
    "launched": "Launched in Steam",
    "installing": "Opening Steam to install…"
}
```

i18n usage in code:
- `t('console.steam.launched', 'Launched in Steam')` → LaunchOverlay status text
- `t('console.steam.installing', 'Opening Steam to install…')` → InstallOverlay modal title

Pattern for existing console keys (lines 262–264 for reference):
```json
"launching": "Launching",
"loading": "Loading your library…",
```

---

## Shared Patterns

### Context Destructure Pattern
**Source:** `src/frontend/screens/ConsoleMode/index.tsx` lines 60–72
**Apply to:** `ConsoleMode/index.tsx` only (other modified files don't use `useContext(ContextProvider)` for steam)
```typescript
const { epic, gog, amazon, zoom, ...rest } = useContext(ContextProvider)
// Steam is added to this destructure: add `steam,` after `zoom,`
```
`steam` is already declared in `ContextProvider.tsx` line 34 with shape `{ library: [], login, logout }` — no changes to ContextProvider needed.

### `useEffect` cleanup / `cancelled` flag pattern
**Source:** `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx` lines 75–83
**Apply to:** Steam `useEffect` in both `LaunchOverlay/index.tsx` and `InstallOverlay/index.tsx`
```typescript
useEffect(() => {
  let cancelled = false
  // ... async work ...
  const timer = setTimeout(() => {
    if (!cancelled) onDismiss()
  }, 1500)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}, [])
```

### i18n Call Pattern
**Source:** Throughout all modified files
**Apply to:** All new user-facing strings
```typescript
t('dotted.key', 'English fallback string')
// Sidebar sub-item:
t('steam-store', 'Steam Store')
// LaunchOverlay:
t('console.steam.launched', 'Launched in Steam')
// InstallOverlay:
t('console.steam.installing', 'Opening Steam to install…')
```
Chip labels (`'Steam'`) are hardcoded strings matching the existing pattern (`'Epic'`, `'GOG'`, `'ZOOM'`) — no `t()` wrapping.

---

## No Analog Found

None. All files have direct analogs within themselves (same-file pattern replication). No new files are created.

---

## Metadata

**Analog search scope:** All 6 named files read in full; no codebase-wide search required — all patterns are within the files being modified
**Files read:** 7 (5 source files + ContextProvider.tsx + translation.json)
**Pattern extraction date:** 2026-07-03
