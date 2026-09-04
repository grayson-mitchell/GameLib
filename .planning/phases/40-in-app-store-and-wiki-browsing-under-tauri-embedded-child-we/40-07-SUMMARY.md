---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 07
subsystem: "Store embed navigation chrome (Rust history stack + seam + presentational component)"
tags: [tauri, rust, ipc, react, i18n, security]

dependency-graph:
  requires: ["40-05 (declared-unimplemented navigation methods and seam interface)", "40-06 (Dialog suppression wiring)", "40-02 (STORE_EMBED_LABEL registry and on_page_load push)", "40-EMBED-API-VERIFICATION.md (D-25 verdict: no native history API)"]
  provides: ["Rust-side history-stack cursor semantics (back/forward/reload/navigate dispatch arms)", "live back()/forward()/reload()/navigate() seam methods", "StoreEmbedControls presentational chrome component"]
  affects: ["40-08 (host that owns the takeNavEvents() subscription and passes props into StoreEmbedControls, and that will render it in the position the retired WebviewControls bar occupied)", "40-09 (deep-link/route-change navigation calling store_embed_navigate)"]

tech-stack:
  added: []
  patterns:
    - "One-shot suppression flag distinguishing user-initiated history pushes from history-driven cursor moves (arms on back/forward/reload, consumed by the next on_page_load Finished event)"
    - "Back/forward availability derived from cursor position, never stored as independent flags that could drift"
    - "Synchronous state mutation before an async webview call (store_embed_navigate pushes to history before calling webview.navigate(), avoiding a stale read)"
    - "Declared-unimplemented-throw error builders must not name a specific owning plan once that plan starts shipping partial coverage (a shared 'plan N owns this' message becomes false the moment plan N ships without touching the one remaining unimplemented method)"
    - "Presentational chrome component: all navigation state arrives as props, zero internal ref/subscription, mirroring TauriLoginPanel's structural pattern"
    - "Host display parses a URL for display only and fails soft (empty string, never a throw) on an unparseable value"

key-files:
  created:
    - src/frontend/components/UI/StoreEmbedControls/index.tsx
    - src/frontend/components/UI/StoreEmbedControls/index.css
    - src/frontend/components/UI/StoreEmbedControls/__tests__/StoreEmbedControls.test.tsx
  modified:
    - src-tauri/src/main.rs
    - src/backend/store/storeEmbedSeam.ts
    - src/backend/sidecar/storeEmbedFlowRegistration.ts
    - src/backend/sidecar/__tests__/storeEmbedFlows.test.ts
    - public/locales/en/gamelib.json

decisions:
  - "D-25 verdict confirmed: no native back/forward/history API exists on tauri::webview::Webview 2.11.5 or wry 0.55.1's WebView (re-confirmed against 40-EMBED-API-VERIFICATION.md, not re-derived). The Rust-side history stack (D-22) was built."
  - "storeEmbedSeam.ts's back()/forward()/reload()/navigate() were widened from Promise<void> to Promise<StoreEmbedNavEvent> -- required by Task 2's own action text (each method 'returns the navigation state, coerced with a per-field type check'), which cannot compile against a void return. Not listed in the plan's files_modified frontmatter; applied as a Rule 3 blocking fix."
  - "takeNavEvents() (the one seam method this plan does NOT implement) was given its own error-builder naming no specific future plan, replacing the prior 40-05-authored message that named '40-07' as owner -- that claim becomes false the instant this plan ships without addressing it."
  - "StoreEmbedControls' props are named backAvailable/forwardAvailable, not canGoBack/canGoForward, even though StoreEmbedNavEvent's own fields use those names -- the acceptance criteria explicitly forbid the literal substrings in this component, and the naming difference also signals structurally that this is pushed state, not a queryable method."

metrics:
  duration: "~3.5 hours across 3 tasks"
  completed: 2026-09-04
---

# Phase 40 Plan 07: Store Embed Navigation Chrome Summary

Rust-side browser history-stack cursor semantics driving four new dispatch arms, a live TypeScript
seam implementation replacing four declared-unimplemented throws, and a presentational
`StoreEmbedControls` React component that receives all navigation state as props and can never
regress into querying a live webview handle.

## D-25 Verdict Consumed, Not Re-Derived

`40-EMBED-API-VERIFICATION.md` (plan 40-02) is the authority and was read first, per Task 1's own
instruction. It confirms `tauri::webview::Webview` (2.11.5) exposes `url()`, `navigate(Url)`,
`reload()`, `eval()`, `hide()`, `show()`, `close()`, `set_position()`, `set_size()`, `position()`,
`size()` and no `go_back`/`go_forward`/`can_go_back`/`can_go_forward`; `wry` 0.55.1's `WebView` is
the same shape. No native history API exists on either side. **D-22's Rust-side history stack was
built**, not superseded by a native API. This plan did not re-run the vendored-source scan itself
— it trusted the prior plan's recorded verdict, as instructed.

## Observed Failure Before the Fix (mandatory RED)

The regression test `store_embed_state_back_moves_the_cursor_it_does_not_append_a_new_entry` was
run against a deliberately reintroduced append-instead-of-move defect in `go_back()`
(`self.history.push(u)` instead of moving `self.cursor` in place):

```
assertion left == right failed: go_back must move the cursor, not append a new history entry
 left: 4
right: 3
```

This confirms the append defect really does grow the history stack on every back press (the
"grows forever, never actually goes back" failure mode Task 1 calls out). The defect was reverted
and the full Rust suite re-run: **232 passed, 0 failed, 1 ignored**. The one-shot suppression flag
(armed by `store_embed_back`/`store_embed_forward`/`store_embed_reload`, consumed by the next
`on_page_load` `Finished` event) is what makes the difference between this passing and failing.

## Rust Navigation Arms (Task 1, commit `391eec498`)

Four dispatch arms added to `dispatch_rust_channel`, all `#[cfg(target_os = "macos")]`-gated with
a legible error on the non-macOS path, matching the channel-name constants plan 40-05 already
minted byte for byte:

- `store_embed_back` / `store_embed_forward` — move the cursor (never push), navigate the embed to
  the resulting URL, return the derived navigation state.
- `store_embed_reload` — arms suppression, calls `webview.reload()`, does not touch the cursor.
- `store_embed_navigate` — pushes the new URL and truncates any forward entries **synchronously**,
  before calling `webview.navigate()`, so the caller never receives a stale read waiting on the
  async `on_page_load` event; then arms suppression so the real subsequent `Finished` event does
  not double-push.

Back/forward availability is derived from the cursor's position in the stack on every response,
never stored as an independent flag — there is nothing to drift out of sync with.

Zero page-side JS injection: no `eval` call exists anywhere in the store-embed dispatch path
(confirmed via `grep -n "eval" src-tauri/src/main.rs` — the only `eval` occurrences are
pre-existing, unrelated code: the tray About window, the login-origin banner update, and Humble's
reveal-post arm). The arms carry an in-place comment naming the 2026-08-03 Talon fingerprint
root-cause as the reason `eval` must never be reached for here.

8 new Rust unit tests, all pure state-machine tests needing no running app: default-state has
neither back nor forward available; push-three-then-back-twice lands on the first entry;
forward-once-after-back returns to the skipped entry; push-from-middle truncates forward entries;
reload does not push a duplicate entry; the mandated back-moves-not-appends regression test;
navigation-state JSON reports full URL/host/availability; the same on empty state never panics.

## Seam Methods Live (Task 2, commit `879b21444`)

`storeEmbedFlowRegistration.ts`'s four declared-unimplemented throws (`back`/`forward`/`reload`/
`navigate`) were replaced with real `requestRustInvoke` calls, each response coerced through
`coerceNavState()` with an explicit per-field check (`url`/`host` must be strings,
`canGoBack`/`canGoForward` must be booleans) and a descriptive throw naming the channel and
quoting the raw response on any mismatch. No method returns a default — a navigation state that
silently defaulted to "back unavailable" would be indistinguishable from a correctly disabled
button, which is exactly the failure mode this project's coercion discipline exists to prevent.

`takeNavEvents()` remains genuinely unimplemented (out of this plan's scope), but its
declared-unimplemented error was rewritten to name no specific future plan — the prior message
inherited from 40-05 said "plan 40-07 owns it," which becomes a false claim the instant this plan
ships four of five methods without touching the fifth.

### Extended per-method malformed-response table (extends 40-05's table)

| Method | Expected result shape | Behavior on malformed response |
|---|---|---|
| `back` | `StoreEmbedNavEvent` | Throws on `null`, missing `canGoBack`, non-boolean `canGoForward`, or non-string `url` |
| `forward` | `StoreEmbedNavEvent` | Same 4 shapes |
| `reload` | `StoreEmbedNavEvent` | Same 4 shapes |
| `navigate` | `StoreEmbedNavEvent` | Same 4 shapes |

16 new `it.each` cases (4 bad shapes × 4 methods) added to the malformed-response-throws describe
block, extending 40-05's 15 assertions for `open`/`setBounds`/`hide`/`show`/`close`.

40-05's `unimplemented-navigation-throws-naming-40-07` test was **inverted, not deleted**: it now
proves each of `back`/`forward`/`reload`/`navigate` reaches its Rust channel with the expected
arguments and resolves the navigation state (including a dedicated case proving `navigate` forwards
its `url` argument unchanged on the wire); `takeNavEvents`'s own declared-unimplemented assertion
was kept, with its regex loosened from `/40-07/` to `/not yet implemented/` since its error message
no longer names a specific plan.

Full suite: 55/55 tests passing in `storeEmbedFlows.test.ts`; `pnpm codecheck` and `pnpm exec
eslint` both clean on all three touched TypeScript files.

## StoreEmbedControls Chrome Component (Task 3, commit `8692abf51`)

`StoreEmbedControls` is a plain function component receiving `url`, `backAvailable`,
`forwardAvailable`, and four callbacks (`onBack`/`onForward`/`onReload`/`onOpenInBrowser`) as
props. It declares no `useRef`, subscribes to no navigation event (`grep -c
"addEventListener\|useRef"` = 0), and does not reproduce the retired bar's `history.back()` router
fallback (`grep -c "history.back()"` = 0) — back and forward are disabled purely from props. The
literal substrings `canGoBack`/`canGoForward` do not appear in the component
(`grep -c "canGoBack\|canGoForward"` = 0) even though `StoreEmbedNavEvent`'s own fields use those
names — the host (plan 40-08) will map field names to these prop names when it wires the
component up.

D-23 host-only display: the current URL is parsed with `new URL()` for display purposes only; on
success only `.host` is shown (never the full URL, so affiliate/session query strings never reach
the rendered output — verified by a test using a URL carrying `utm_source` and `session` params);
on failure (`try`/`catch`) the host renders as empty rather than throwing, so a malformed URL
cannot take the store screen down (T-40-07-06). The insecure-scheme warning class from the retired
bar is carried over, applied when the parsed URL's protocol is not `https:`.

### Translation keys — reused vs. newly minted

- **Reused** (confirmed present and localised in `public/locales/en/translation.json`, default
  namespace, unchanged): `webview.controls.back`, `webview.controls.forward`,
  `webview.controls.reload`, `webview.controls.openInBrowser`.
- **Newly minted** (in `public/locales/en/gamelib.json`, under the existing `webview` key):
  `webview.storeEmbedControls.hostLabel` — `"Currently viewing {{host}}"`, an accessibility label
  on the host display naming the origin for screen readers. This did not exist on the retired bar.

Styled entirely with existing CSS custom properties (`var(--accent)`, `var(--background-darker)`,
`var(--text-danger)`, `var(--danger)`, `var(--icon-disabled)`, `var(--space-3xs)`, `var(--text-sm)`,
`var(--text-hover)`, `var(--overlay-controls-width)`) — zero hardcoded hex colors
(`grep -cE "#[0-9a-fA-F]{3,6}"` on the CSS file = 0), per the sketch-findings multi-theme
survival rule.

11-case test suite (no jsdom — plain function invocation, this project's established DOM-less
component-test convention): back enabled fires its callback, back disabled never invokes its
callback, forward availability is independent of back, reload is never gated by back/forward,
host displayed with query string absent, unparseable URL renders without throwing, empty URL
disables Open in browser, insecure-scheme class present for `http://` and absent for `https://`,
the new accessibility label carries the interpolated host, and Open in browser fires its callback.

`git diff --stat src/frontend/components/UI/NavShell/ src/frontend/screens/WebView/index.tsx` is
empty — neither file was touched, confirming D-24 (this chrome slots into the retired bar's
structural position with no NavShell change) and the plan's own verification requirement.

## Open Item Deferred From Plan 40-06: The Adtraction Dialog

Plan 40-06's SUMMARY explicitly recorded that the adtraction dialog — one of its five expected
`Dialog` consumers — "does not currently exist as renderable code": its render was deleted in plan
40-01, leaving only orphaned, `void`-referenced state in `WebView/index.tsx`
(`showAdtractionWarning`, `setShowAdtractionWarning`, `dontShowAdtractionWarning`,
`setDontShowAdtractionWarning`, lines ~273-276) with an explanatory comment confirming the
deletion. Plan 40-06 stated: "When Plan 40-07 rebuilds the adtraction dialog, it will render
through the same shared `Dialog` component and inherit this plan's suppression wiring
automatically."

**This plan's actual task list — read in full from `40-07-PLAN.md` before execution — contains no
task, acceptance criterion, or mention of the adtraction dialog anywhere** (objective, the three
tasks, the threat model, or the output spec). Rebuilding it was never in scope here. Compounding
this, `40-07-PLAN.md`'s own top-level `<verification>` block requires
`git diff --stat src/frontend/components/UI/NavShell/ src/frontend/screens/WebView/index.tsx` to be
empty — the only file carrying the orphaned state is explicitly off-limits to this plan.

**Disposition: this item remains open and is explicitly re-flagged here, not silently dropped.**
The orphaned `showAdtractionWarning`/`dontShowAdtractionWarning` state in `WebView/index.tsx` is
untouched by this plan and needs a future plan (most likely 40-08, which will already be editing
`WebView/index.tsx` to wire in `StoreEmbedControls` and the `takeNavEvents()` subscription) to
either rebuild the adtraction dialog through the shared `Dialog` component, or make a deliberate
decision to delete the orphaned state instead if the dialog is no longer wanted. Neither choice was
made here — surfacing the discrepancy honestly is the correct outcome for a plan whose own
verification block forbids touching the one file the fix would require.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened `StoreEmbedSeam`'s navigation methods from `Promise<void>` to `Promise<StoreEmbedNavEvent>`**
- **Found during:** Task 2
- **Issue:** `storeEmbedSeam.ts` was not listed in this plan's `files_modified` frontmatter, but
  Task 2's own action text requires each method to "return the navigation state, coerced with a
  per-field type check" — impossible against the interface's existing `Promise<void>` signature.
- **Fix:** Widened `back()`, `forward()`, `reload()`, `navigate(url)` to
  `Promise<StoreEmbedNavEvent>` in the interface.
- **Files modified:** `src/backend/store/storeEmbedSeam.ts`
- **Commit:** `879b21444`

**2. [Rule 2 - Missing critical functionality] Added `safeNavState()` fail-safe wrapper**
- **Found during:** Task 2
- **Issue:** The file's existing `ipcMain.handle` registrations for status-only methods
  (`open`/`hide`/`show`/`close`) use a `safeStatus()` wrapper so a Rust-side error resolves
  `{status:'error'}` rather than rejecting the IPC promise. No equivalent existed for methods that
  must also carry a navigation-state payload on success.
- **Fix:** Added `safeNavState()`, the direct analog of `safeStatus()`, returning
  `{status:'ok', navState}` or `{status:'error', error}`; wired it into the `storeEmbedBack`/
  `Forward`/`Reload`/`Navigate` `ipcMain.handle` registrations.
- **Files modified:** `src/backend/sidecar/storeEmbedFlowRegistration.ts`
- **Commit:** `879b21444`

**3. [Rule 1 - Bug] Fixed a stale ownership claim in `takeNavEvents()`'s declared-unimplemented error**
- **Found during:** Task 2
- **Issue:** The pre-existing (40-05-authored) shared `NAV_OWNER_PLAN = '40-07'` constant, reused
  by all five navigation methods' unimplemented-throws, becomes a false claim for `takeNavEvents()`
  specifically the moment this plan ships the other four methods without addressing it.
- **Fix:** Gave `takeNavEvents()` its own `takeNavEventsUnimplementedError()` builder naming no
  specific future plan, stating instead that ownership is not yet assigned.
- **Files modified:** `src/backend/sidecar/storeEmbedFlowRegistration.ts`,
  `src/backend/sidecar/__tests__/storeEmbedFlows.test.ts` (regex loosened from `/40-07/` to
  `/not yet implemented/`)
- **Commit:** `879b21444`

**4. [Rule 1 - Bug] Rephrased 3 residual literal "40-07" doc-comment substrings**
- **Found during:** Task 2, caught by re-running this plan's own acceptance-criteria grep
- **Issue:** `grep -c "40-07" src/backend/sidecar/storeEmbedFlowRegistration.ts` must return 0 per
  the plan's Task 2 acceptance criteria; the first implementation left 3 occurrences in doc
  comments (not the error message itself, already fixed by deviation #3).
- **Fix:** Rephrased all three (e.g. "owned by plan 40-07" → "owned by Phase 40 Plan 07";
  a specific threat-ID citation removed in favor of plain English) while preserving meaning.
- **Files modified:** `src/backend/sidecar/storeEmbedFlowRegistration.ts`
- **Commit:** `879b21444`

None of Task 1 or Task 3 required a deviation beyond the plan as written.

## Known Stubs

None. All three tasks' outputs are fully wired: the Rust arms are live and tested, the seam
methods make real IPC calls, and `StoreEmbedControls` is ready to receive real props once plan
40-08 renders it — it is not itself stubbed, it is simply not yet mounted anywhere (mounting it is
plan 40-08's explicit job per this plan's `affects` list).

## Threat Flags

None. All new surface (the four Rust dispatch arms, the seam's four live methods, and the chrome
component) is already covered by this plan's own `<threat_model>` (T-40-07-01 through -06,
T-40-07-SC) — no new network endpoint, auth path, file access pattern, or schema change was
introduced outside that register.

---
*Phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we*
*Completed: 2026-09-04*
