---
status: diagnosed
trigger: "Opening the GOG store from a game link switches the left navigation to the GOG panel instead of leaving it blank (47-UAT Test 6 / gap G-47-6)"
created: 2026-11-18T08:00:00Z
updated: 2026-11-18T08:45:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED (medium confidence, see blind_spots). The tier-2 panel is NOT removed or collapsed on any route that opens the GOG store. On the `/store-page?store-url=<gog url>` deep-link route (Deals card, game-page "Store" link, Humble Keys) the Stores panel renders but NO row in it is active, because the four store rows are plain NavLinks keyed on `/store/<store>` pathnames and the deep-link pathname is `/store-page`. The previously selected row (e.g. Deals) is deselected and no "GOG Store" row takes its place, which reads as "goes blank rather than changing to gog".
test: static trace of every entry point + route-to-tab + panel selection + NavLink active matching, re-run of existing unit tests, node check of react-router path parsing
expecting: n/a (diagnosis complete)
next_action: hand off to planner/fixer. Live falsification step for the caller: at `/store-page?store-url=...` inspect `.NavShell__tier2` in devtools. 8 `.NavItem` rows and none `.active` confirms this diagnosis; a `NavShell__tier2--collapsed` class or an empty column refutes it.

reasoning_checkpoint:
  hypothesis: "StoresPanel's store rows have no way to become active on the `/store-page` deep-link route, because active state is purely `location.pathname === '/store/<store>'` (NavLink) and the deep link's owning store (`resolveStoreForUrl(...).key`) is computed only inside WebView and never reaches NavShell/StoresPanel."
  confirming_evidence:
    - "resolveActiveTab('/store-page') === 'stores' (navTabs.ts:55-67; navTabs.test.ts:97-99) and NavShell renders <StoresPanel/> un-collapsed for 'stores' (NavShell/index.tsx:75-85; NavShell.test.tsx:216). Both suites re-run green (53 tests)."
    - "react-router parsePath of the DiscountCard destination gives pathname `/store-page`; evaluating NavLink's active rule (pathname === to || startsWith(to + '/')) against all seven StoresPanel/Deals/Humble destinations gave active=false for every one."
    - "StoresPanel never passes `isActiveFallback` to any NavItem (StoresPanel/index.tsx:41-91), so the only active signal is NavLink's pathname match."
    - "WebView/index.tsx:278 and :311-313 already derive the deep link's store key (`deepLinkConfig.key`) - the information exists, it just stops inside WebView."
  falsification_test: "Open GameLib at `/store-page?store-url=https%3A%2F%2Faf.gog.com%2Fgame%2F...` and inspect `.NavShell__tier2`. If it carries `NavShell__tier2--collapsed` or has no `.NavShell__tier2List` child, this hypothesis is wrong."
  fix_rationale: "Not applied (diagnose-only). Direction: resolve the current store once from pathname + `store-url` search param and feed it to the store rows as `isActiveFallback`."
  blind_spots: "Could not observe the user's UAT session: the UAT-time app log rotated away (gamelib.log only covers launches from 19:47 onward) and the dev app now running is the user's own, so I did not drive it. The literal word 'blank' is therefore interpreted, not observed. Alternative B (native embed covering the tier-2 column) is argued against statically but not live-tested."
  candidate_causes:
    - "code: store rows lack deep-link-aware active state (the confirmed cause)"
    - "code/layout: native embed rect measured while tier-2 is mid-expand (collapsed game page -> stores) so the embed overlaps the column; would show GOG content over the column, not a blank one, and the ResizeObserver plus trailing flush re-sends the final rect - not confirmed, not refuted live"
    - "config/data: user's stored last-store / default-store cascade sends the Stores tab to /store/gog - irrelevant to the symptom (that route DOES highlight the row)"
  and_gate: "no - one condition suffices: any navigation whose pathname is `/store-page` leaves every store row inactive. (The aggravating context is that three separate screens use that route.)"

## Symptoms

expected: Opening the GOG store from a game link (here, 'portal') switches the left navigation (tier-2 nav panel) to the GOG store panel instead of leaving it blank.
actual: User reported: "minor bug, if you click on portal takes you to the gog store, the left navigation goes blank rather than changing to gog"
errors: None reported
reproduction: Test 6 in 47-UAT. macOS, `pnpm tauri:dev`. User searched 'portal' (Deals region Germany) and clicked the result, which took them into the in-app GOG store view; the left navigation went blank instead of showing the GOG/Stores navigation. Exact entry point not certain.
started: Discovered during UAT of phase 47 (2026-11-18).

## Eliminated

- hypothesis: The tier-2 route matcher does not recognise the deep-link route, so nothing renders
  evidence: resolveActiveTab explicitly lists `store-page` (navTabs.ts:57) and `/store/` (navTabs.ts:56); navTabs.test.ts:93-99 pin both to 'stores'. Phase 34.10-01 PLAN line 108 records this as intended.
  timestamp: 2026-11-18T08:20:00Z

- hypothesis: NavShell collapses or empties the tier-2 column for store routes
  evidence: tier2Collapsed is true only for activeTab null / accounts / downloads / (games && !filled) (NavShell/index.tsx:75-79). 'stores' is none of those, and `tier2Panel = <StoresPanel/>` is assigned for it (index.tsx:84-85). NavShell.test.tsx:216 asserts exactly this.
  timestamp: 2026-11-18T08:22:00Z

- hypothesis: A Store Search row or its expanded per-store deal opens the GOG store inside the app
  evidence: The only outbound action in src/frontend/screens/StoreSearch is `window.api.openExternalUrl(deal.buyUrl)` (StoreSearchBreakdown/index.tsx:87,90) -> sidecar `shell.openExternal` (shellFilesFlowRegistration.ts:156-164). There is no navigate/Link/href in that screen, so it can never reach the in-app GOG view. (UAT Test 2 already passed: it opens the browser.)
  timestamp: 2026-11-18T08:25:00Z

- hypothesis: A link clicked inside the embedded GOG page changes the route (and so the panel)
  evidence: useStoreEmbedHost.ts contains no react-router navigate/history call at all (grep: only `store_embed_navigate` IPC and comments). In-embed navigation only updates `navState.url` and writes `last-url-<store>`; route and NavShell are unchanged, so the panel cannot change. Rust `store_embed_navigation_policy` only allows/blocks/hands off by scheme.
  timestamp: 2026-11-18T08:28:00Z

- hypothesis: A backend `openScreen` message routes into the store view
  evidence: `openScreen` is sent only from shortcutsFlowRegistration.ts:444/448/452 with `/settings/general`, `/download-manager`, `/library`.
  timestamp: 2026-11-18T08:30:00Z

- hypothesis: This is a regression introduced by the 34.10 sidebar-to-tab-strip migration
  evidence: The retired Sidebar (git show 0559bc0d0^:.../SidebarLinks/index.tsx) set `isActiveFallback` only on the Stores item (`pathname.includes('/store/')`, line 133) and on gamepage/settings items; it never highlighted a per-store row for `store-page` either. The gap exists in the old design too; the new Stores panel simply makes it visible.
  timestamp: 2026-11-18T08:33:00Z

## Evidence

- timestamp: 2026-11-18T08:10:00Z
  checked: graphify query for tier-2 panel selection and store routing; read NavShell/index.tsx, navTabs.ts, StoresPanel/index.tsx, NavItem/index.tsx, App.tsx routes
  found: Panel is chosen from `resolveActiveTab(location.pathname)`. Routes that render the store view: `store/:store`, `store-page`, `wiki` (App.tsx:249-263). Stores panel rows are `NavItem` -> `NavLink to=/store-search | /store/amazon | /store/epic | /store/gog | /store/steam | /discounts | /humble-keys`. No row receives `isActiveFallback`.
  implication: Panel presence is route-correct; row highlight is strictly pathname equality.

- timestamp: 2026-11-18T08:15:00Z
  checked: every caller that opens the in-app GOG (or any) store view (grep for '/store', 'store-page' across src/frontend)
  found: (1) NavTabs Stores tab -> `/store/<remembered|default>`; (2) StoresPanel "GOG Store" row -> `/store/gog`; (3) Deals `DiscountCard` handleClick -> `navigate('/store-page?store-url=' + encodeURIComponent(withAffiliate(storeLink)))` (Discounts/components/DiscountCard/index.tsx:30-32), GOG catalog items are rewritten to af.gog.com; (4) game page `GameSubMenu` Store NavLink -> `/store-page?store-url=${storeUrl}` (GameSubMenu/index.tsx:741-745; NOT URI-encoded); (5) Humble Keys gog_keyless claim -> `/store-page?store-url=<humble>` (Humble/Keys/index.tsx:91); (6) in-embed clicks (no route change); (7) Store Search -> external browser only.
  implication: Of the in-app paths, only (1)/(2) land on a route that matches a row. (3)(4)(5) all land on `/store-page`. The Deals card is the most likely entry for the report: the Deals screen is the GOG catalog with its own search box ('portal' filters titles) and the region selector the user had just been using.

- timestamp: 2026-11-18T08:35:00Z
  checked: node: react-router-dom@7.18.5 parsePath on the DiscountCard destination; NavLink active rule against each StoresPanel/Deals/Humble `to`
  found: pathname=`/store-page`, search=`?store-url=https%3A%2F%2Faf.gog.com%2Fgame%2Fportal_knights%3Fas%3D1838482841`. All 7 destinations: active=false.
  implication: On the deep-link route the panel shows but nothing is selected. Coming from Deals, the Deals highlight is lost and GOG Store is not gained.

- timestamp: 2026-11-18T08:38:00Z
  checked: WebView/index.tsx:274-313 and rememberLastStore call (index.tsx:70-72)
  found: The deep-link branch resolves `deepLinkConfig = resolveStoreForUrl(deepLinkUrl)` and uses `deepLinkConfig.key` as the embed `storeKey` (D-35: reuses the store's identity). `rememberLastStore(store)` runs only for the `store` route PARAM, so a deep link does not update last-store either. The resolved key never leaves WebView.
  implication: The data needed to highlight the right row already exists in the renderer; NavShell/StoresPanel have no access to it. Origin table lives in `screens/WebView/storeEmbedOrigins.ts` (keys: epic, gog, amazon, steam, humble - exactly the store rows plus Humble).

- timestamp: 2026-11-18T08:40:00Z
  checked: npx jest navTabs.test.ts NavShell.test.tsx (read-only run)
  found: 2 suites, 53 tests pass, including '/store-page' -> 'stores' and 'stores tier-2 contains StoresPanel, no collapsed modifier'.
  implication: The "panel disappears" reading is contradicted by the existing, passing contract tests.

- timestamp: 2026-11-18T08:41:00Z
  checked: ~/Library/Logs/GameLib/*.log for the UAT-time session
  found: gamelib.log / gamelib.log.old only start at 19:47-19:53 (the offline-crash session and later); the earlier Test 1 session was overwritten on relaunch. No `[WebView] store/wiki route pathname=/store-page` line exists to confirm the exact entry.
  implication: Entry point cannot be proven from logs; the report is consistent with the Deals-card / game-page-link family, all of which share the same route.

## Resolution

root_cause: "StoresPanel's rows (`NavLink to=/store/<store>`) can only be active on `/store/:store`. The in-app routes reached from a game link (Deals DiscountCard, game-page Store link, Humble Keys claim) use `/store-page?store-url=<store url>`; its pathname `/store-page` matches no row, and the store it resolves to (`resolveStoreForUrl(...).key`, computed in WebView/index.tsx:278) never reaches NavShell/StoresPanel. The Stores panel is therefore present but has no selected row (the prior row, e.g. Deals, is deselected and 'GOG Store' is not selected), which is what the user described as the left navigation going blank instead of changing to gog."
fix: "(not applied - diagnose-only) Direction: add a pure `resolveActiveStore(pathname, search)` beside `resolveActiveTab` that returns the `:store` param for `/store/:store` or `resolveStoreForUrl(search.get('store-url'))?.key` for `/store-page`; have StoresPanel read `useLocation()` and pass `isActiveFallback` to the matching store row (humble -> the Humble Keys row when shown). Move or re-export `resolveStoreForUrl` so NavShell does not import from `screens/WebView`. Optionally call `rememberLastStore(deepLinkConfig.key)` so the Stores tab also returns to the deep-linked store. Add a StoresPanel/NavShell test: `/store-page?store-url=<gog>` -> GOG Store row active; non-store host -> no row."
verification: ""
files_changed: []
