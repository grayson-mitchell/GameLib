# Quick Task 260929-qth: Fix phase 40 CR-01/CR-02 in the store embed host - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Task Boundary

Fix phase 40 CR-01/CR-02 in the store embed host: gate start-URL navigation on embeddability and
store identity, and recover from a null slot on first render.

Both findings were re-verified in source at HEAD on 2026-09-29 before this task was opened — they
are live, not stale review debt.

**CR-01** — the start-URL sync effect at `useStoreEmbedHost.ts:314-327` fires on any `startUrl`
change and calls `window.api.storeEmbedNavigate(startUrl)`. It compares only the URL string and
checks neither `storeKey` nor embeddability. Its own section header reads "SAME-STORE NAVIGATION ON
A START-URL CHANGE" — the intent — but nothing enforces it. `urls['/store/epic']` (`index.tsx:155`)
means a GOG → Epic switch changes `startUrl` and fires this effect, loading
`https://www.epicgames.com/store/en-US/` into the live native webview. The hook is called at
`index.tsx:264`, above every early return, because hooks cannot be conditional; the render side's
`<WebviewUnavailablePanel reason="epic" />` at `index.tsx:472` therefore does not prevent the load.
Route-leave HIDES rather than closes (`storeEmbedHide` at `:372`; `storeEmbedClose` reserved for app
teardown at `:368`), so the webview stays live.

**CR-02** — the open/bounds effect at `useStoreEmbedHost.ts:208-309` is mount-once (`[]` deps at
`:309`) and early-returns when `slotRef.current` is null (`:210-215`). `slotRef` is attached only at
`index.tsx:492`, BELOW the early returns for the deep-link (`:443`), platform (`:456`) and Epic
(`:472`) panels. Cold-starting on `/store/epic` then navigating to `/store/gog` leaves `openedRef`
false, `storeEmbedOpen` never called and no ResizeObserver ever attached, for the remainder of that
mount. CR-01's no-remount fact is what makes this permanent rather than transient.

**Shared root cause:** `App.tsx:249` registers a single route entry `path: 'store/:store'`, and
React Router does not remount an element when only a param changes.

</domain>

<decisions>
## Implementation Decisions

### Non-embeddable target arm (CR-01)

**Gate the effect on `isEmbeddableOrigin(startUrl)`. On a non-embeddable target, call
`storeEmbedHide()` and skip `storeEmbedNavigate` entirely.**

`isEmbeddableOrigin` (`storeEmbedOrigins.ts:125`) already exists and — measured at HEAD — has ZERO
production call sites. It is referenced only by `__tests__/storeEmbedOrigins.test.ts` and
`screens/Humble/Keys/__tests__/index.test.tsx`. The guard is written and simply never wired.

Rejected `storeEmbedClose()` for this arm: the in-situ comment at `:362-366` reserves `close()` for
app teardown (D-21) and states that closing on an ordinary route change "would throw away the
webview and its cookie jar, defeating the instant, state-intact return this hook exists to give".
Hiding stops the page load — which is the whole of what D-05 protects against — without paying that
cost. Rejected navigate-to-`about:blank`-then-hide: an extra IPC round-trip and a lost scroll
position, answering no threat that plain hide does not.

**This removes no user-facing capability.** Epic in-app browsing is already off by design and has
been since Phase 40 shipped: `storeEmbedOrigins.ts:45-49` carries `embeddable: false`, and
`index.tsx:472` already renders the panel with a working "Open in browser" button routed through
`window.api.openExternalUrl`. The Epic tile deliberately stays in the stores panel (D-08 — "a tile
leading to a working open-in-browser escape hatch beats no tile"). What this fix removes is the
invisible half: the background page load behind that panel, which is exactly the load D-05 exists
to prevent (`WebviewUnavailablePanel.tsx:31-44` — `Window::add_child` still inherits the injected
globals that are the root-caused Talon fingerprint).

### Slot recovery shape (CR-02)

**Attach the slot via a callback ref that flips a `slotPresent` state false → true exactly once, and
key the open/bounds effect on `[slotPresent]`.**

This re-runs the effect precisely when the slot appears and never on a URL change, so the
ResizeObserver's identity survives a same-store navigation.

**HARD CONSTRAINT — do not break this.** The `[]` at `:309` is deliberate and documented at
`:304-309`: "the observer's identity must outlive a same-store URL change or the throttle window
above would be defeated on every navigation." Plan 40-11's live gate caught a related regression on
real hardware, where the embed updated only on mouse-stop during a drag-resize. Adding `startUrl`
(or a raw `slotRef.current`) to the dependency array in a way that tears down and re-attaches the
observer on every navigation is a regression of that fix, not a fix of CR-02.

Rejected replacing the `slotRef` prop with a hook-owned callback ref: structurally cleaner, but it
changes the hook's public prop shape and ripples through `index.tsx`'s JSX and the 670-line test
file's setup for no behavioural gain.

### CR-01's D-35 sub-claim — narrowed, no re-keying

**Implement only the embeddability gate. Do NOT add a `storeKey`-change close/reopen arm.**

The review's CR-01 also asserts the effect "carries one store's key-scoped session into another
store's content on any store→store switch, contrary to D-35", and proposes "on a store change,
re-key rather than reuse". That was measured at HEAD on 2026-09-29 and **does not hold at this
layer**:

- `src-tauri/src/main.rs:5066` — `const STORE_EMBED_LABEL: &str = "store-embed"`, a single
  constant. Every command (`set_bounds`, `hide`, `show`, `close`, `back`, `forward`, `reload`,
  `navigate`) resolves that one label. There is ONE embed webview, globally — not one per store.
- `store_embed_open_args` (`main.rs:5265`) parses `{ url, x, y, w, h }`. There is no `storeKey`
  parameter.
- `storeEmbedFlowRegistration.ts:189` — `async open(url, bounds, _storeKey)`, underscore-prefixed
  and discarded. `common/types/ipc.ts:426-429` states it outright: "`storeKey` … is the caller's own
  bookkeeping — the Rust arm this reaches takes no such argument (40-02-SUMMARY.md), so it never
  crosses the wire."

So re-keying is not expressible today, there are no key-scoped sessions at this layer to cross, and
same-origin isolation already prevents one store's page reading another's cookies. A store→store
navigation of the shared embed is the architecture working as designed. Record this narrowing in
the SUMMARY and in `40-REVIEW.md` alongside the finding — do not silently drop it, and do not
implement against it.

`storeKey` remains meaningful in the RENDERER, where it keys restore persistence
(`localStorage.setItem('last-url-' + storeKey, …)` at `:199`). That is unaffected.

### Claude's Discretion

- Exact naming of the new state/callback-ref pair, and whether the `slotPresent` signal lives in
  `index.tsx` or is returned by the hook.
- Whether the non-embeddable arm also needs to suppress the FIRST open (not just a later navigate)
  when the hook mounts directly on `/store/epic` — determine from the code, and if it does, cover
  it; the two arms share the same guard.
- Test placement across the existing `useStoreEmbedHost.test.tsx` versus a new sibling file.

</decisions>

<specifics>
## Specific Ideas

**One prediction that is NOT measured, and must not be reported as fixed without hardware.** On a
GOG → Epic switch nothing currently calls `storeEmbedHide()`, and the bounds remain set to where the
GOG slot was. Reading the code, the native webview should therefore stay VISIBLE at those bounds —
now showing Epic — on top of the unavailable panel. This is an inference from the code path, not an
observation: it has not been run on macOS hardware. The chosen fix (hide on a non-embeddable target)
would also resolve it if it is real. Treat it as a hypothesis worth a live check, never as a claimed
outcome. If it cannot be verified at the desk, say so plainly rather than implying the visual defect
was fixed.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-REVIEW.md`
  — CR-01 at `:76-124`, CR-02 at `:126-161`. 429 lines, deep review, 71 files, 3C/10W/4I.
- D-05 (Epic excluded from the embed), D-18 (single geometry oracle, no fallback rect), D-21
  (hide on route leave, close only at app teardown), D-31/D-34/D-35 (the origin table), D-08
  (Epic tile stays, with an open-in-browser escape hatch).
- Plan 40-11's live gate (2026-09-05, Item 3) — the drag-resize throttle regression that the `[]`
  dependency array and the leading-edge throttle both exist to prevent.

</canonical_refs>
