---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
reviewed: 2026-11-18T00:00:00Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - public/locales/en/translation.json
  - src-tauri/src/store_embed/controls.rs
  - src-tauri/src/store_embed/open.rs
  - src-tauri/src/store_embed/state.rs
  - src/backend/storeSearch/__tests__/itad.test.ts
  - src/backend/storeSearch/itad.ts
  - src/frontend/components/UI/NavShell/__tests__/NavShell.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/StoresPanel.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/navTabs.test.ts
  - src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx
  - src/frontend/components/UI/NavShell/index.tsx
  - src/frontend/components/UI/NavShell/navTabs.ts
  - src/frontend/components/UI/RegionPicker/__tests__/RegionPicker.test.tsx
  - src/frontend/components/UI/RegionPicker/index.css
  - src/frontend/components/UI/RegionPicker/index.tsx
  - src/frontend/helpers/__tests__/storeRegion.test.ts
  - src/frontend/helpers/storeRegion.ts
  - src/frontend/screens/Discounts/helpers.ts
  - src/frontend/screens/Discounts/index.css
  - src/frontend/screens/Discounts/index.tsx
  - src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx
  - src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts
  - src/frontend/screens/StoreSearch/index.css
  - src/frontend/screens/StoreSearch/index.tsx
  - src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx
  - src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
  necessity: 1
status: issues_found
---

# Phase 47: Code Review Report (gap-closure round, plans 47-14..47-18)

**Reviewed:** 2026-11-18
**Depth:** standard (incremental: `git diff d4278f3a4..HEAD` over the 31 scoped paths)
**Files Reviewed:** 31
**Status:** issues_found

The prior round's review lives in git history at `aa2e10ee1` (dispositions in `47-REVIEW-DISPOSITION.md`).

## Summary

This round covers G-47-6 (store-page deep link lights the owning store row), G-47-7 (Store Search thumbnail box), G-47-8 (shared RegionPicker plus a Store Search region picker), G-47-9 (offline first-load crash guard plus offline banner) and two i18n gate-scope commits.

The core G-47-9 Rust guard holds up. I confirmed against the vendored wry 0.55.1 source that `url_from_webview` does `webview.URL().unwrap()` and that `PageLoadEvent::Finished` is emitted only from `did_finish_navigation`. The `page_finished` flag lifecycle (set on every Finished, reset on `clear()` and `reset_for_new_webview()`, kept across a store switch) is consistent, and the drain releases the state lock before the URL read. `resolveActiveStore` reuses `resolveStoreForUrl`, so there is no second host-matching rule. The ITAD country list matches the 32 the tests assert, and the shared `discounts.regionOverride` key is validated per screen. The i18n scope edits are internally consistent: fork-touched 439, scope 317.

No Critical issues. The three warnings are all on the new offline banner and the shared RegionPicker.

## Warnings

### WR-01: Offline "Try again" can re-request the previous store's URL after a store switch

**File:** `src/frontend/screens/WebView/index.tsx:421-424` (reads `useStoreEmbedHost.ts:1005`)
**Issue:** `retryEmbedLoad` calls `navigateEmbed(embedHost.currentUrl)`, and `currentUrl` is `navState.url`. The hook's own comments (`useStoreEmbedHost.ts:410-434` and `:904-905`) record that `/store/:store` is one mounted route and that on a store switch `navState.url` "still holds the previous store's last URL". The failing case is the one this banner exists for:
1. The embed has loaded store A.
2. The user goes offline and switches to store B.
3. `existing.navigate(urlB)` fails, so no Finished arrives and `navState.url` stays on A's page.
4. The banner shows, and Try again navigates the shared embed back to A's URL while the route says B.
Rust's `store_embed_navigate` also pushes A's URL into the store-B history. The hook's existing `onTryAgain` (`useStoreEmbedHost.ts:986-990`) already avoids this by retrying `startUrl`, with the same rationale.
**Fix:** Retry the route's own URL rather than `navState.url`. Either reuse `startUrl`, or fall back to it when `resolveStoreForUrl(currentUrl)?.key !== store`:
```tsx
const retryEmbedLoad = useCallback(() => {
  const owner = resolveStoreForUrl(embedCurrentUrl)
  navigateEmbed(owner?.key === store ? embedCurrentUrl : startUrl)
}, [navigateEmbed, embedCurrentUrl, store, startUrl])
```
Add a `StoreEmbedTimeoutBanner`/WebView-level test for the switch case. The current banner tests only prove the callback is wired.

### WR-02: Offline banner is driven by app connectivity alone, so it overrides a healthy loaded page

**File:** `src/frontend/screens/WebView/index.tsx:664`, `src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx:63-90`
**Issue:** `offline={connectivity?.status === 'offline'}` makes the banner render whenever the sidecar reports offline, regardless of whether the embed's page committed. Offline wins over `timedOut`. A user who already has a store page showing (or a Humble/Steam page that is cached) sees "You're offline, so this store can't load." sitting over a page that did load. That message is false, and the single action is a navigate that re-requests the page. The `uiState` default is `{ status: 'offline' }` (`uiState.ts:67`), so a mount that precedes the first `connectivitySync` result also flashes this banner as an app-wide false positive.
**Fix:** Gate the offline variant on the embed not having committed a page. The nav state does not expose this today, so either add a `pageFinished`/`loaded` field to the Rust nav-state JSON (the flag already exists in `StoreEmbedState`), or combine offline with the load-in-flight/timed-out signal:
```tsx
offline={connectivity.status === 'offline' && !embedHost.hasLoadedPage}
```
At minimum, reword the message so it is true when a page is already visible.

### WR-03: RegionPicker has no accessible name for its combobox

**File:** `src/frontend/components/UI/RegionPicker/index.tsx:50-58`
**Issue:** The label is wired as `<label htmlFor={id}>` with `<Select id={id}>`. In the installed MUI 5.17.1, `Select`'s `id` reaches the hidden native input, not the visible `role="combobox"` div. In `SelectInput.js:448` the div's `aria-labelledby` is built from `labelId` and `buttonId`, and both are undefined here. A screen reader therefore announces an unnamed combobox, and clicking the label does not open or focus it. The defect was inherited from the Deals markup, but this round promotes it into a shared component and adds a second consumer.
**Fix:** Give the label an id and pass it as `labelId`:
```tsx
<label className="regionPicker__label" id={`${id}-label`} htmlFor={id}>{label}</label>
<Select id={id} labelId={`${id}-label`} ...>
```
Add an assertion in `RegionPicker.test.tsx` that `labelId` is set.

## Info

### IN-01: Impossible-state guard on `connectivity?.status`

**Category:** necessity
**File:** `src/frontend/screens/WebView/index.tsx:664`
**Issue:** `connectivity` comes from `useUiState((s) => s.connectivity)`, typed `{ status; retryIn }` and initialised to a concrete object at `uiState.ts:67`. It is never undefined, and the sibling consumers (`GamePage/index.tsx:202`, `GameCard/index.tsx:785`, `DownloadSizeInfo.tsx`) read `connectivity.status` without `?.`. The optional chain guards a state the type and the store default rule out. Judgment-level, not a bug.
**Fix:** `connectivity.status === 'offline'`.

### IN-02: "Showing prices for {{country}}" caption now duplicates the region picker

**File:** `src/frontend/screens/StoreSearch/index.tsx:168-172`
**Issue:** The picker on the title row shows the active country (or "Auto (Germany)"), and the caption directly below still says "Showing prices for Germany." The two say the same thing. The caption is also pinned by tests. Not a bug, but it is redundant copy on the screen the picker was added to.
**Fix:** Drop the caption, or keep it only when the effective country differs from the picker's value. The existing `regionNote` already covers the fallback case.

---

_Reviewed: 2026-11-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
