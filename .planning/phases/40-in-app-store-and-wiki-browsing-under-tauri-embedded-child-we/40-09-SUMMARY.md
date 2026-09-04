---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 09
subsystem: "Store-embed route logic: origin table, restore, deep-link gating, adtraction gap"
tags: [security, tauri, react, url-parsing, origin-validation]

dependency-graph:
  requires: ["40-04 (Rust scheme policy, store_embed_navigation_policy)", "40-08 (useStoreEmbedHost, live embed render path)"]
  provides: ["storeEmbedOrigins.ts -- the single origin table (resolveStoreForUrl, isEmbeddableOrigin)", "real host-based restore validation and stale-value drop (D-30)", "deep-link origin gate (D-34/D-35)", "the D-32 adtraction gap declaration"]
  affects: ["any future plan touching WebView/index.tsx's route logic or adding a sixth embeddable store"]

tech-stack:
  added: []
  patterns:
    - "One origin table (storeEmbedOrigins.ts) as the single source of truth for 'is this a known/embeddable store', replacing four ad-hoc per-store substring checks"
    - "Host validation via exact-match-or-dot-suffix on the parsed hostname, never a substring test on the full URL"
    - "Real-source-execution testing: extract the exact statements from index.tsx between two markers, transpile with ts.transpileModule, execute via new Function against the real resolveStoreForUrl import -- proves a regression to the real file fails the suite the same way it fails at runtime"
    - "'Logged, never silent' gap declaration for a control that cannot be built: remove the orphaned state, add a diagnosable log line, file a todo carrying the vendored-source citation, and pin the gap's shape with a source-text test"
    - "Mutation testing (deliberate temporary breakage, confirm red, restore) used to prove new assertions are not vacuous, for both the restore-persistence timing and the deep-link outcome logic"

key-files:
  created:
    - src/frontend/screens/WebView/storeEmbedOrigins.ts
    - src/frontend/screens/WebView/__tests__/storeEmbedOrigins.test.ts
    - src/frontend/screens/WebView/__tests__/WebViewDeepLinkAndRestore.test.ts
    - src/frontend/screens/WebView/__tests__/WebViewAdtractionGapDeclared.test.ts
    - .planning/todos/pending/2026-09-04-adtraction-ad-block-detection-has-no-derivable-signal-under-tauri.md
  modified:
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/useStoreEmbedHost.ts

decisions:
  - "D-31 host validation is exact-match-or-dot-suffix on the parsed URL's hostname (hostname === apex || hostname.endsWith('.' + apex)), never .includes() on the full URL and never a bare .endsWith(apex) on the hostname (which would still match 'evilgog.com')."
  - "D-30's restore storage is localStorage, not sessionStorage, determined by measurement (filesystem inspection of the WKWebView's on-disk WebsiteData under ~/Library/WebKit/{gamelib-shell,com.gamelib.shell}/WebsiteData, which has no SessionStorage-backed store) rather than ported from the retired code, which used sessionStorage and could never have survived a process restart -- the one property this restore now exists for after 40-08's hide()-on-leave made the within-session case redundant."
  - "The restore write moved from route-entry time to navigation time (a useEffect keyed on navState.url, guarded by a hasNavigatedRef so the FIRST render -- the initial mount, before any real navigation -- never overwrites a still-valid stored value with the same startUrl it was just given)."
  - "A stored value is dropped (localStorage.removeItem) on READ, not merely ignored, whenever resolveStoreForUrl(storedUrl)?.key !== the route's own store -- covers both 'resolves to nothing' and 'resolves to a different configured store' as equally invalid."
  - "Deep links (D-34/D-35) are gated through the SAME resolveStoreForUrl table used for restore validation: embeddable only if the origin resolves to a configured, embeddable store, and if so the deep link is opened under THAT store's own key -- never a sixth 'deep-link' identity (D-35)."
  - "D-32 is a declared gap, not a re-derivation: 40-EMBED-API-VERIFICATION.md Q3's verdict is ABSENT (no navigation-failure callback exists anywhere in the wry->tauri chain on macOS), and the deadline-armed on_navigation/on_page_load fallback considered as an alternative cannot be built safely because store_embed_open's on_navigation closure carries no frame-type flag (an already-established limitation of that exact hook, main.rs's on_document_title_changed arm, spike 013)."
  - "D-32's own caveat text is corrected in this plan: the retired detection was a MAIN-FRAME did-fail-load listener reading its own failed URL's query string for the redirect target -- it was never a subresource detector. The actual obstacle is that no navigation-failure signal of any kind survived the platform change, not a frame-type limitation on the original detector."
  - "The orphaned showAdtractionWarning/dontShowAdtractionWarning state and void refs (unreachable since the Dialog itself was deleted in plan 40-01) are REMOVED, not carried forward again -- replaced by a single 'logged, never silent' gap-log effect gated on store === 'gog' (the only store the retired handler ever applied to)."
requirements-completed: [REQ-40-07, REQ-40-08, REQ-40-09]

metrics:
  duration: "~3h across 3 tasks (session spanned a context-compaction boundary)"
  completed: 2026-09-04
---

# Phase 40 Plan 09: Re-derive Route-Level Behaviours Summary

Replaces four ad-hoc substring host checks with one origin table, re-derives the last-URL restore
against measured (not assumed) storage semantics and a write-on-navigation timing fix, gates
store-page deep links through that same origin table so unvetted third-party URLs can only reach
the native embed under a known store's own identity, and declares the D-32 adtraction workaround a
proven-infeasible gap rather than shipping a detection that cannot fire.

## Performance

- **Tasks:** 3 completed
- **Files modified:** 7 (5 created, 2 modified)
- **Completed:** 2026-09-04

## Accomplishments

- `storeEmbedOrigins.ts` is now the single origin table for all five stores (epic, gog, amazon,
  zoom, steam), answering both "is this a known store" and "is this store embeddable" from one
  place, with 47 adversarial assertions proving the boundary.
- `validStoredUrl`'s substring test is gone; both the restore-read path and the deep-link gate now
  parse the URL and compare the real hostname, exact-or-dot-suffix, against the resolved store's
  apex.
- The last-URL restore writes on navigation (not route entry) and is dropped on read the moment it
  no longer resolves to the route's own store -- proven by 9 tests in `useStoreEmbedHost.test.tsx`
  (2 new) and 4 restore-outcome tests plus a self-test in `WebViewDeepLinkAndRestore.test.ts`.
- Store-page deep links to an unconfigured or non-embeddable origin now open externally
  automatically, via the same escape hatch `WebviewUnavailablePanel`'s own button uses --  proven
  by 5 outcome tests plus 2 self-tests.
- The D-32 adtraction workaround is declared a gap with a citation-backed rationale, the orphaned
  state it left behind is removed, a diagnosable "logged, never silent" line ships in its place,
  and a todo captures three possible future resolution paths for anyone who wants to revisit it.

## Task Commits

1. **Task 1: Build the D-31 origin table + adversarial test suite** - `2ede63d2d` (feat)
2. **Task 2: Re-derive last-URL restore (D-30) and gate store-page deep links (D-34/D-35)** - `b5d98d471` (feat)
3. **Task 3: Declare the D-32 adtraction gap, remove orphaned state** - `9e538c2ed` (refactor)

_Note: no separate plan-metadata commit updates STATE.md/ROADMAP.md -- those files and the
`gsd-sdk query state.*`/`roadmap.*` verbs are owned by the orchestrator per this session's explicit
instruction; only this SUMMARY.md is committed in the final metadata commit._

## Task 1: The Origin Table (D-31)

`storeEmbedOrigins.ts` exports `STORE_EMBED_ORIGINS` (5 entries: epic, gog, amazon, zoom, steam),
`hostMatchesApex` (exact match or dot-suffix), `resolveStoreForUrl(url): StoreEmbedConfig | null`,
and `isEmbeddableOrigin(url): boolean`. Epic is present but `embeddable: false` (D-05 stays out of
scope for the actual embed, but the table still needs to recognize it as a *known* store for the
deep-link decision).

**47 adversarial assertions**, including the two boundary cases the retired substring check would
have let through:

- `https://evil-gog.com.attacker.net/` -- a prefix-label attack (the real apex as a label prefix
  inside an attacker-controlled domain) -- **fails** `resolveStoreForUrl`, resolves to `null`.
- `https://attacker.net/?redirect=gog.com` -- the apex appearing only in a query string, never in
  the hostname -- **fails** `resolveStoreForUrl`, resolves to `null`.

Both cases are exactly the ones this plan's `<planning_findings>` named as passing under the
retired `url.includes('gog.com')` check; both are proven rejected under the new hostname-based
check.

## Task 2: Restore (D-30) and Deep-Link Gate (D-34/D-35)

### The restore-storage question, answered by measurement

The retired code used `sessionStorage`, which cannot survive a process restart -- the one property
this restore now exists for, since plan 40-08's `hide()`-on-leave already preserves embed state
across in-session route changes. Measured directly against the packaged app's on-disk WebKit
state (`~/Library/WebKit/{gamelib-shell,com.gamelib.shell}/WebsiteData`): there is no
SessionStorage-backed file at all for this origin, confirming `sessionStorage` cannot be the
correct choice for a cross-restart restore. **`localStorage` is used instead**, which persists to
disk and survives the process restart the restore is for.

### Write timing fix

The restore write moved to a `useEffect` keyed on `navState.url`, guarded by a `hasNavigatedRef`
so the initial mount (before any real navigation has happened) never re-writes the value it was
just given. Mutation-tested: temporarily removing the `hasNavigatedRef` guard turned the new
persistence-timing test red; restored and re-confirmed green.

### Read-time validation and drop

A restored URL is used only if `resolveStoreForUrl(storedUrl)?.key === store` (the route's own
store); otherwise it is dropped via `localStorage.removeItem` and the caller-provided `startUrl`
is used instead. Both "resolves to nothing" and "resolves to a *different* configured store" are
treated as equally invalid -- proven by 4 outcome tests in `WebViewDeepLinkAndRestore.test.ts`:

1. Stored value resolves to nothing (`attacker.net`) -> dropped, removed.
2. Stored value still resolves to the same store -> used, nothing removed.
3. Stored value resolves to a *different* configured store (Steam, on a GOG route) -> dropped,
   removed.
4. No stored value at all -> caller-provided start URL untouched, nothing removed.

### The five deep-link outcomes

1. A deep link to an embeddable store (Steam) opens the embed under Steam's own key -- no sixth
   "deep-link" identity (D-35).
2. A deep link to a known-but-not-embeddable store (Epic, D-05) opens externally; the original
   start URL is not overwritten.
3. A deep link to an unknown origin (`attacker.net`) opens externally.
4. An unparseable `store-url` value opens externally without throwing.
5. A route that is not a store-page deep link at all is never routed through this gate.

All five, plus 2 anti-vacuity self-tests, run against the REAL extracted-and-transpiled statements
from `index.tsx` (via `ts.transpileModule` + `new Function`, following the
`GlobalStateSleepAssertionClassification.test.ts` precedent) executed against the real
`resolveStoreForUrl` import -- not a hand-duplicated reimplementation. Mutation-tested: temporarily
forcing `deepLinkShouldOpenExternally` to `false` turned 3 of the outcome tests red; restored and
re-confirmed green.

## Task 3: The D-32 Adtraction Gap

### Branch taken: gap declared

`40-EMBED-API-VERIFICATION.md` Q3's verdict, quoted verbatim:

> Citation: `wry-0.55.1/src/wkwebview/class/wry_navigation_delegate.rs` (the full
> `WKNavigationDelegate` `impl` block) implements exactly six delegate methods... Apple's
> `WKNavigationDelegate` protocol additionally defines `webView:didFailProvisionalNavigation:
> withError:` and `webView:didFailNavigation:withError:` — neither is implemented here...
>
> **VERDICT: ABSENT**

No navigation-failure callback exists anywhere in the wry->tauri chain on macOS, and no
`on_navigation_failed`/`on_load_error` field exists on `WebViewAttributes`. The fallback considered
as an alternative -- arm a deadline from `on_navigation` on a main-frame navigation to the tracker
host, disarm it from `on_page_load`'s next main-frame `Started` event -- also cannot be built
safely: `store_embed_open`'s own `.on_navigation(` closure (`main.rs`, D-29) has the signature
`move |url: &Url| -> bool`, carrying no frame-type flag, a limitation this project had already
independently established for the exact same hook (`main.rs`'s `on_document_title_changed` arm,
citing spike 013: "5 of 8 `on_navigation` events [are] third-party iframes, the callback carries no
frame-type flag to filter them"). Arming on it anyway would let a third-party ad subframe re-arm
the deadline indefinitely -- precisely the defect the 013-015 `on_page_load`-vs-`on_navigation`
rule exists to prevent.

### Correction to D-32's own caveat

This plan's own `<planning_findings>` flagged D-32's caveat as "likely INVERTED." Confirmed by
reading the retired implementation (`git show 599fd51f2`): the handler fired on a **main-frame**
`did-fail-load` event matching `track.adtraction.com`, extracting a redirect target from that
failed URL's own query string. It was never a subresource detector. The real obstacle is not a
frame-type limitation on the original detector -- it is that no navigation-failure signal of any
kind survived the platform change.

### What shipped

- Removed the orphaned `showAdtractionWarning`/`setShowAdtractionWarning`/
  `dontShowAdtractionWarning`/`setDontShowAdtractionWarning` state and their `void` refs from
  `index.tsx` (the `Dialog` render itself was already deleted in plan 40-01; only this unreachable
  state had survived).
- Added a "logged, never silent" `useEffect`, gated on `store === 'gog'` (the only store the
  retired handler ever applied to), that calls `window.api.logInfo(...)` once per GOG store visit,
  naming the gap as D-32 and citing Q3's ABSENT verdict.
- Filed
  `.planning/todos/pending/2026-09-04-adtraction-ad-block-detection-has-no-derivable-signal-under-tauri.md`,
  carrying the full vendored-source citation, the corrected caveat, and three possible future
  resolution paths (do nothing; a hand-rolled `objc2` `WKNavigationDelegate` for the store embed,
  mirroring `EpicPristineNavDelegate`; or a generic main-frame stall detector unrelated to the
  tracker host by name).
- Added `WebViewAdtractionGapDeclared.test.ts` (10 tests): the gap effect logs and is gated
  correctly, names D-32 and cites ABSENT, is not silently empty, depends on `[store]`, and that the
  removed state/Dialog are gone from the comment-stripped source -- plus 4 anti-vacuity self-tests.

### Acceptance criterion: grep still non-zero, by design

`grep -c "adtraction" src/frontend/screens/WebView/index.tsx` returns **5** -- consistent with the
gap-declared branch. All five occurrences are in the new D-32 gap-declaration comment and the
updated "Do NOT delete" comment (prose documentation of why the identifiers are gone), not in any
live state, effect logic, or Dialog render.

## Planning Gates

`python3 meta/runPlanningGates.py` -- **8/8 passed**, including the phase 40 Model A retirement gate.

## Full Verification

```
$ pnpm exec jest src/frontend/screens/WebView
Test Suites: 13 passed, 13 total
Tests:       258 passed, 258 total

$ pnpm codecheck
tsc --noEmit  (clean)

$ pnpm lint
4157 problems (0 errors, 4157 warnings)   -- ratchet held exactly, not exceeded

$ cd src-tauri && cargo check
Finished `dev` profile [unoptimized + debuginfo] target(s)

$ cargo test
test result: ok. 232 passed; 0 failed; 1 ignored
```

## Deviations from Plan

None beyond what the plan itself explicitly branches on (D-32's gap-declaration path, which the
plan names as a valid, equally-acceptable outcome to re-derivation). No architectural changes, no
new packages (confirmed: no `package.json`/`Cargo.toml`/lockfile diff in any of the three task
commits), no auth gates encountered.

### Auto-fixed Issues (lint/type errors surfaced during Task 2's own verification, not carried into Task 3)

**1. [Rule 1 - Bug] `@typescript-eslint/no-unsafe-function-type` and `no-constant-condition` in `WebViewDeepLinkAndRestore.test.ts`**
- **Found during:** Task 2, running `pnpm lint` as part of the task's own verify block
- **Issue:** `compileToFunction`'s return type was annotated as the bare `Function` type, and one
  self-test used a `!false /* comment */ ? x : y` constant-condition ternary.
- **Fix:** Narrowed the return type to `(...args: unknown[]) => unknown` (with a matching
  `as (...args: unknown[]) => unknown` cast on the `new Function(...)` call site to satisfy `tsc`),
  and replaced the constant-condition ternary with a named `regressedDeepLinkEmbeddable` boolean.
  Also removed a duplicate adjacent `eslint-disable-next-line @typescript-eslint/no-implied-eval`
  comment left over from an earlier edit.
- **Files modified:** `src/frontend/screens/WebView/__tests__/WebViewDeepLinkAndRestore.test.ts`
- **Commit:** `b5d98d471`
- **Verified:** `pnpm lint` returned to exactly 4157 problems / 0 errors (ratchet held, not
  exceeded).

## Known Stubs

None. All three tasks' outputs are fully wired: the origin table is the real function both the
restore and deep-link logic call, the restore reads/writes real `localStorage`, and the gap-log
line is a real `window.api.logInfo` call reachable at runtime, not a placeholder.

## Threat Flags

None. All new surface (the origin table, the restore read/write path, the deep-link origin gate,
and the gap-log effect) is already covered by this plan's own `<threat_model>` (T-40-09-01 through
-06, T-40-09-SC) -- no new network endpoint, auth path, file access pattern, or schema change was
introduced outside that register.

---
*Phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we*
*Completed: 2026-09-04*
