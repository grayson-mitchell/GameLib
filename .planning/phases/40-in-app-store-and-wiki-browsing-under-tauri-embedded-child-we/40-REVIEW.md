---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
reviewed: 2026-09-29
depth: deep
files_reviewed: 71
diff_base: df2e58172d6161f1fd0bdd97567d1d0d0dbb95ea^
findings:
  critical: 3
  warning: 10
  info: 4
  total: 17
status: issues_found
---

# Phase 40: Code Review Report

**Reviewed:** 2026-09-29
**Depth:** deep (four parallel lanes, partitioned along the phase's own architectural seams)
**Files Reviewed:** 71
**Status:** issues_found

## Scope and how it was derived

The phase's 11 SUMMARY artifacts yield 81 key-file paths. The workflow's git-diff cross-check was
**not** applied as written, because it would have been wrong by two orders of magnitude here:

- The phase directory's first commit is `df2e58172` (2026-09-03), an unrelated quick task that
  added only `.gitkeep`. The real phase start is `924f20d33` (2026-09-04), three commits later.
- `df2e58172^..HEAD` spans **1365 commits**, of which **64** are phase-40-scoped and **707** are
  unrelated quick tasks. Phase 40's code work ended 2026-09-05; HEAD is 24 days later.
- That range surfaces **695** changed files. The cross-check would have appended **632** unrelated
  ones to the review scope, and the resulting count would also have forced a depth downgrade.

Scope was therefore taken as the SUMMARY set cross-checked against the union of files touched by
the **64 phase-40-scoped commits only**. That surfaced 8 real source files the SUMMARY extractor
missed (`meta/hardcodedStringGate.ts`, `meta/i18nGateScope.json`,
`meta/__tests__/hardcodedStringGate.test.ts`,
`src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts`,
`src/frontend/components/UI/NavShell/index.tsx`, plus 3 since-deleted files filtered out) and 96
locale catalogues.

**Excluded:** the 96 `public/locales/*` catalogues (mechanical l10n churn, prettier-ignored data)
and 18 planning prose documents. **Included** against the workflow's literal `.planning/*`
exclusion: the four `.py` CI gates living under `.planning/`, because they are executable source,
and `model-a-retirement-gate.py` is one of Phase 40's own deliverables.

Depth: `--deep` was requested. The resolver downgrades deep→standard above 50 files. Rather than
silently return a standard pass, the 71 files were partitioned into four lanes — Rust shell (3
files / 16.6k lines), sidecar wire seam (17), frontend store-embed and suppression (31),
auth/preload/CI gates (20) — each reviewed at deep depth with the full manifest for cross-file
context. Every finding below was re-verified by the orchestrator against the source before
inclusion; two lane claims were corrected in the process (see CR-03 and the note under WR-10).

## Summary

The phase's security design holds up. The STRIDE register T-40-04-01..09 was independently
re-verified against code by two lanes, including tracing the ACL claim through vendored
`tauri-2.11.5`/`tauri-utils-2.9.3` source rather than trusting in-repo comments: because the
store-embed is `WebviewUrl::External`, every command requires a resolved `remote` grant, and no
capability declares one. The navigation/download/new-window policy closures default-deny correctly.
The cookie-clear helper genuinely re-reads and counts rather than trusting wry's removal signal.

The sidecar exit contract is respected in this phase's files — no unref'd handles on live paths, no
unbounded boot-time network calls. The seven CI gates reviewed are unusually rigorous: every one
mechanically re-derives its facts from the live tree and documents its own blind spots. **No
gate-honesty violation was found**, which given this project's history is worth stating explicitly.

What is wrong is concentrated in **lifecycle and state-synchronisation**, not in the security
model. Three Criticals: two renderer lifecycle bugs that follow from `store/:store` being a single
route entry (so a `:store` param change does not remount `WebView`), and one logout path that
leaves credentials and cookies behind while the UI reports success. The Rust warnings are a related
family — state mutated before the fallible operation that justifies it, with no rollback.

## Critical Issues

### CR-01: Switching stores navigates the live native embed into a non-embeddable store, defeating D-05

**Files:** `src/frontend/screens/WebView/useStoreEmbedHost.ts:314-327`,
`src/frontend/screens/WebView/index.tsx:258-269,472`, `src/frontend/App.tsx:249`

`App.tsx:249` registers a single route entry, `path: 'store/:store'`. React Router does not remount
an element when only a param changes, and `StoresPanel` (`NavShell/components/StoresPanel/index.tsx:37-40`)
offers `/store/gog`, `/store/steam`, `/store/epic` and `/store/amazon` as ordinary nav items — so a
store→store switch is a first-class UI flow that keeps the same `useStoreEmbedHost` instance alive.

The start-URL sync effect compares only the URL string:

```ts
// useStoreEmbedHost.ts:314-327
useEffect(() => {
  if (previousUrlRef.current === null) { previousUrlRef.current = startUrl; return }
  if (previousUrlRef.current === startUrl) return
  previousUrlRef.current = startUrl
  window.api
    .storeEmbedNavigate(startUrl)
    .then(applyNavResult)
    .catch((error) => { logNavCallFailure('storeEmbedNavigate (start-url change)', error) })
}, [startUrl, applyNavResult])
```

Its own section header reads "SAME-STORE NAVIGATION ON A START-URL CHANGE", which is the intent —
but nothing enforces "same store". It checks neither `storeKey` nor embeddability.

`urls['/store/epic'] = epicStore` (`index.tsx:155`), so navigating GOG → Epic changes `startUrl`
and fires this effect. The render side does the right thing — `index.tsx:472` early-returns
`<WebviewUnavailablePanel url={startUrl} reason="epic" />` before the embed slot at `:492` — but
`useStoreEmbedHost` is called at `:263`, above every early return, because hooks cannot be
conditional. And route-leave **hides** rather than closes: `storeEmbedHide()` at
`useStoreEmbedHost.ts:372`, with `storeEmbedClose()` reserved for app teardown at `:368`.

Net effect: the still-live native webview loads `https://www.epicgames.com/store/en-US/` while
invisible. D-05 excludes Epic from the embed because of a confirmed Talon fingerprinting vector,
and fingerprinting runs on page load, not on visibility — so being hidden does not mitigate it.
The same path also carries one store's key-scoped session into another store's content on any
store→store switch, contrary to D-35.

The guard already exists and is simply not called here: `isEmbeddableOrigin(url)`
(`storeEmbedOrigins.ts:125`, documented `true` only for a KNOWN and EMBEDDABLE store, "D-05
excludes Epic").

**Fix:** gate the effect on embeddability and on `storeKey` identity — on a non-embeddable target,
hide or close the embed instead of navigating it; on a store change, re-key rather than reuse.

---

### CR-02: A null slot on first render disables the embed for the rest of the component's life

**File:** `src/frontend/screens/WebView/useStoreEmbedHost.ts:205-309`

The open/bounds effect is mount-once with an empty dependency array and an early return when the
slot ref is null:

```ts
// useStoreEmbedHost.ts:208-215
useEffect(() => {
  const slot = slotRef.current
  if (!slot) {
    window.api.logInfo(
      '[useStoreEmbedHost] slot ref is null on mount -- no ResizeObserver attached, no bounds sent (D-18: no fallback rect)'
    )
    return undefined
  }
  ...
}, [])
```

The `[]` is deliberate and documented (`:304-309`) — the ResizeObserver's identity must outlive a
same-store URL change. But combined with CR-01's fact that `store/:store` does not remount, the
null-slot branch becomes permanent rather than transient. `slotRef` is only attached at
`index.tsx:492`, below the early returns for the Epic (`:472`), platform (`:456`) and deep-link
(`:443`) panels.

So: cold-start directly on `/store/epic` (or any route whose first render returns a panel), then
navigate to `/store/gog`. `WebView` does not remount, the effect never re-runs, `openedRef` stays
false, `storeEmbedOpen` is never called and no ResizeObserver is ever attached. The GOG store
renders an empty slot for the remainder of that mount. Only navigating fully out of `/store/*` and
back recovers it.

**Fix:** re-run the effect when the slot becomes available — key it on slot presence, or attach via
a callback ref — while keeping the observer's identity stable across same-store URL changes.

---

### CR-03: An aborted Amazon logout leaves credentials and cookies intact while the UI reports signed out

**Files:** `src/backend/storeManagers/nile/user.ts:248-274`,
`src/frontend/state/GlobalState.tsx:924-933`, `src/backend/utils.ts:318`

```ts
// nile/user.ts:248-258
static async logout() {
  const commandParts = ['auth', '--logout']
  const res = await libraryManagerMap['nile'].runRunnerCommand(commandParts, {
    abortId: 'nile-logout'
  })

  if (res.abort) {
    logError('Failed to logout: abort by user', LogPrefix.Nile)
    return
  }
  // ... configStore.delete('userData'); clearCache('nile'); clearAmazonCookiesForLogout()
```

On abort the function returns before `configStore.delete('userData')`, before `clearCache('nile')`
and before `clearAmazonCookiesForLogout()`.

That alone would be defensible — a cancelled logout arguably should not clean up. What makes it a
defect is that **the renderer cannot see the abort and clears its state anyway**:

```ts
// GlobalState.tsx:924-933
amazonLogout = async () => {
  await window.api.logoutAmazon()
  this.setState({ amazon: { library: [], user_id: null, username: null } })
  console.log('Logging out from amazon')
}
```

`logoutAmazon` is typed `() => Promise<void>` (`ipc.ts:466`) and the handler returns
`NileUser.logout()` unchanged (`runnerAuthFlowRegistration.ts:238-239`), so no abort signal reaches
the frontend. The app shows the user signed out while `userData` and the shared Amazon cookie jar
both survive — and Phase 40's entire premise is that the store embed shares that jar, so the
embedded Amazon page stays authenticated behind a UI that says otherwise. That is the
T-40-04-07/T-40-04-08 class this phase's threat model was written to close.

**Reachability — this is narrow but live.** Nothing sends `abort('nile-logout')` from the UI, so
this is not a user-facing cancel button. It fires through `callAllAbortControllers()`, called from
`handleExit()` at `src/backend/utils.ts:318` — i.e. quitting the app while the logout CLI call is
in flight. Note that this path only *became* reachable when the `for...in`-over-a-Map bug in
`callAllAbortControllers` was fixed; before that the function was a documented no-op.

**Correction to the lane finding this came from.** The lane reported the in-source comment as
self-contradictory, quoting it as claiming cleanup "runs FIRST and UNCONDITIONALLY". The full
comment reads "runs FIRST and UNCONDITIONALLY **relative to the cookie-side step below**", which is
true as written — that strand does not hold, and a fix aimed at it would edit the wrong thing. The
documentation contradiction is real but lives in the **test file**: `nile/__tests__/logoutCookies.test.ts:5-6`
claims the suite proves "credential cleanup runs first and unconditionally" with no qualifier,
while its own abort test at `:146-158` asserts `expect(mockConfigStoreDelete).not.toHaveBeenCalled()`.
The test encodes the current behaviour as correct; the header claims the opposite property.

GOG has no equivalent hazard — no CLI round-trip, no abort branch.

**Fix:** decide the intended semantics and make all three layers agree. Either hoist the credential
cleanup above the abort guard (cleanup is unconditional, matching the test header), or propagate
the abort to the renderer so the UI does not show a logout that did not happen. Either way, correct
the test header.

## Warnings

### WR-01: History-driven navigation mutates state before the fallible navigate, with no rollback

**File:** `src-tauri/src/main.rs:5597-5691`

`store_embed_back`/`forward`/`reload`/`navigate` all mutate `StoreEmbedState` — moving the cursor
and arming the one-shot `suppress_next_push` flag — then release the lock and only then call
`Webview::navigate()`/`reload()`, which can fail. `go_back()` (`main.rs:5199-5206`) decrements
`cursor` and sets `suppress_next_push = true` unconditionally, before the caller attempts anything.

On `Err` the function returns an error but the cursor has already moved and is never restored, and
`suppress_next_push` is left armed with no navigation landing. The next genuine navigation has its
`push()` silently swallowed by the stale flag, so it is dropped from history entirely and never
reaches the renderer via `store_embed_take_nav_events`. This is reachable: `store_embed_close`/
`store_embed_open` re-creation run on their own `thread::spawn`'d worker per `rustInvoke` frame
(`main.rs:10311`).

**Fix:** commit the state mutation only after the navigate/reload succeeds, or roll back explicitly
in the `Err` branch.

### WR-02: `store_embed_navigate` can record the pre-redirect URL permanently and suppress the correction

**File:** `src-tauri/src/main.rs:5674-5691`

The function pushes the *requested* URL into history and arms `suppress_next_push` before calling
`webview.navigate(url)`, so the `on_page_load` Finished event this navigation produces is treated
as mere confirmation and dropped. Verified directly at `main.rs:5136-5140`: `push()` early-returns
and clears the flag without recording the URL or calling `enqueue_nav_event()`.

That is correct only when the URL that finishes loading is byte-identical to the one requested. It
is not, whenever the destination redirects — `http`→`https`, locale/region, or affiliate
resolution. This is the exact `af.gog.com` → `www.gog.com` shape the file's own commentary
(`main.rs:5097-5103`) cites as the symptom that motivated the nav-event queue. `store_embed_navigate`
is documented (`main.rs:5665`) as the entry point plan 40-09's deep-link and route-change paths
use — precisely where such redirects are most common.

Net effect: the pre-redirect URL and host are recorded permanently, and the one event that could
correct them is suppressed. This reintroduces the GAP-D symptom class for the deep-link path only.

### WR-03: `StoreEmbedState.history` has no size cap, unlike its sibling queue

**File:** `src-tauri/src/main.rs:5106-5149`

`history: Vec<String>` grows without bound for the life of the process, while `pending_nav_events`
on the same struct caps at `STORE_EMBED_NAV_EVENTS_CAP = 50` with oldest-dropped
(`main.rs:5085,5160-5166`), tested at `main.rs:16244-16264`. The file's own comments model "a page
that navigates in a loop" as a live concern for this subsystem, so the threat was recognised and
the mitigation applied to only one of the two collections. A looping or adversarial store page
grows `history` indefinitely.

### WR-04: Restore persistence is keyed only on the `:store` param

**Files:** `src/frontend/screens/WebView/useStoreEmbedHost.ts:191-203`,
`src/frontend/screens/WebView/index.tsx:195-205`

The D-30 `last-url-<storeKey>` restore writes from `navState.url` and reads back through a
`:store`-keyed lookup. The read side does validate that the stored URL resolves to the route's own
store and evicts on mismatch (`index.tsx:195-205`), which is the right shape — but the write side's
keying interacts with CR-01: while the embed is pointed at the wrong store, a persisted value can
be written under the previous store's key.

### WR-05: The nav-event drain polls on routes where it can never resolve anything

**File:** `src/frontend/screens/WebView/useStoreEmbedHost.ts:148-179`

The GAP-D drain poll is tied to the hook's lifetime rather than to embed liveness, so it keeps
issuing IPC calls on humble-login, login, non-macOS and Epic routes where no embed exists. Cleanup
itself is correct and verified against the hook's own test suite — this is purposeless background
traffic, not a leaked timer.

### WR-06: Dead login-warning state kept alive only by `void` references

**File:** `src/frontend/screens/WebView/index.tsx:293-325,388-390`

`showLoginWarningFor`, its effect, and the `handleSuccessfulLogin`/`onLoginWarningClosed` handlers
are retained solely via `void` references, with an in-file comment explaining they exist "for the
linter during the interim window". That window has closed — the Model B chrome fully landed and
nothing reads them now.

### WR-07: Dead CSS left behind by the Model A → B migration

**File:** `src/frontend/screens/WebView/index.css:5-30`

`.login-warning`, `.WebView__webview` and `:has(.UpdateComponent) .WebView__webview` target classes
removed in the migration; no JSX applies them. The outer `.WebView` selector is still live.

### WR-08: The preload boundary validates `bounds` but passes `url` straight through

**File:** `src/preload/api/storeEmbed.ts:7,15,19-23`

`storeEmbedSetBounds` implements an explicit preload-boundary courier check for its `bounds`
parameter, but `storeEmbedOpen` and `storeEmbedNavigate` pass a raw `url: string` directly to
`makeHandlerInvoker`. The Rust scheme policy is the real control and it holds (T-40-04-02/03
verified), so this is defence-in-depth rather than an open hole — but the file establishes a
validation pattern and then does not apply it to the parameter that carries remote input.

### WR-09: GOG/Nile cookie verification is weaker than Humble's

**Files:** `src/backend/storeManagers/gog/user.ts`, `src/backend/storeManagers/nile/user.ts`

Both check only zero-versus-nonzero deleted count, which satisfies the stated threat-model spec
exactly. Humble's equivalent does fuller before/after arithmetic and would additionally catch a
partial-deletion leak that the GOG/Nile check passes silently.

### WR-10: The closed GAP-D fix is recorded as still-open in three files

**Files:** `src/common/types/sidecarTransport.ts:407-413`, `src/common/types/ipc.ts:438-441`,
`.planning/phases/40-.../40-VERIFICATION.md`

Quick task `260905-e61` closed GAP-D on 2026-09-05 across all three layers (`b1fb9da27`,
`1a98652ca`, `b4de6820a`, `b89c3d5d4`); the todo is in `.planning/todos/completed/`. Verified
closed at HEAD independently by three lanes: the Rust dispatch arm exists (`main.rs:8160-8169`),
the queue is bounded and drain/push serialize through the same mutex, the seam genuinely invokes
it (`storeEmbedFlowRegistration.ts:251-257`), and the renderer polls it.

Three records still describe the pre-fix state as current:

- `sidecarTransport.ts:407-413` — the channel-group doc block says "the last four have no Rust arm
  yet" and describes a declared-unimplemented Error pattern that no longer exists. It is
  contradicted by the per-constant JSDoc a few lines below in the same file, which correctly says
  "live since plan 40-07".
- `ipc.ts:438-441` — says `storeEmbedTakeNavEvents` is "NOT YET BACKED BY A RUST ARM", while its
  four sibling nav-channel comments were correctly updated.
- `40-VERIFICATION.md` — still records REQ-40-06 as PARTIAL with the greyed-out Back button as a
  present-tense consequence. `b89c3d5d4` corrected `IPC-PORT-INVENTORY.md`, `STATE.md` and the
  todo, but not this file, which has since been edited three times (2026-09-11, 09-17, 09-28) for
  unrelated reasons without anyone noticing.

This is not cosmetic. During this review the stale verification record was briefed to two lanes as
fact, and without an independent refutation from a third lane both would have reported a
long-fixed defect as live.

## Info

### IN-01: `::selection` colours on the host warning text fail contrast

**File:** `src/frontend/components/UI/StoreEmbedControls/index.css:75-81`

`.StoreEmbedControls__hostText--warning::selection` sets `background: var(--danger)` against the
fixed `--text-danger` (`#f97881`) foreground. Computed ratios across sampled themes range
1.20:1–2.82:1, worst case `#ff5555` at 1.20:1 (effectively invisible), all below WCAG AA's 4.5:1.
Consistent with the recorded repo fact that `--danger` is itself only 3.55:1.

### IN-02: `humbleRunValidation` is exported unconditionally despite dev-only registration

**File:** `src/preload/api/humble.ts:7` — confirmed pre-existing since Phase 10, not a Phase 40
regression. Recorded for the backlog, not as a finding against this phase.

### IN-03: Two smoke-hook timers are not `unref()`'d

**File:** `src/backend/sidecar/humbleLoginFlowRegistration.ts:433,465`

The Assumption-A4 smoke hook's two `setTimeout` calls are the one place in the sidecar lane where
the unref convention is neither applied nor explicitly exempted. Low priority: the hook is gated
behind `GAMELIB_LOGIN_SEAM_SMOKE`, off by default, and self-resolves in ~2s when enabled.

### IN-04: Two previously-recorded gaps verified closed at HEAD

The `208`→`213` `meta/i18nForkTouchedFiles.json` count gap and the `last-url-` hardcodedStringGate
false positive in `WebView/index.tsx` are both closed and self-consistent at HEAD, with the count
pins in `meta/__tests__/genI18nGateScope.test.ts` moved in step. Recorded because
`40-VERIFICATION.md` still lists them among its failed truths.

## Verified clean

- **Threat model T-40-04-01..09** — re-verified against code by two independent lanes, including
  tracing `RuntimeAuthority::resolve_access` and `Webview::on_message` through vendored
  `tauri-2.11.5`/`tauri-utils-2.9.3` rather than trusting in-repo comments.
- **Sidecar exit contract** — no unref'd handles on live paths (both `.unref()` and `.unref?.()`
  spellings swept, comment lines stripped), no unbounded boot-time network calls.
- **Suppression mechanism** — `StoreEmbedSuppressionContext`, `useSuppressStoreEmbedWhile` and
  every consumer (Dialog, Dropdown, HumbleExpiryToast, TourContext) handle nested acquire/release,
  unmount-while-suppressed, StrictMode double-invoke and mid-suppression route change correctly,
  and are non-tautologically tested.
- **CI gate honesty** — seven gates reviewed (`hardcodedStringGate.ts` and its 1836-line suite,
  `genI18nGateScope.test.ts`, `runPlanningGates.py`, `model-a-retirement-gate.py`,
  `ported-channels-gate.py`, `preload-surface-gate.py`, `seam-parity-sweep-gate.py`). Every one is
  self-testing and mechanically re-derives its facts from the live tree. No "gate that cannot fail"
  was found.
- **Wire contract** — TS channel kinds and response coercion match the Rust arms; malformed
  responses throw rather than coercing to a default, pinned by explicit tests.
- No `eval`/`innerHTML`, no hardcoded secrets, no injection vectors found in scope.

## Notes on verification of this report

Every finding above was re-checked by the orchestrator against the source before inclusion. Two
lane claims did not survive that check unchanged:

1. CR-03's comment-contradiction strand was a misreading of a scope qualifier; the finding is
   retained on different and stronger evidence (see the correction note in CR-03).
2. Three lanes were briefed on `40-VERIFICATION.md`'s REQ-40-06 PARTIAL verdict as fact. It is
   stale. Two lanes were corrected mid-review; one had already refuted it independently. The stale
   record is now itself reported as WR-10.

**Formatter check:** `.planning/**` is prettier-ignored (`--file-info` reports
`{ "ignored": true, "inferredParser": null }`), so `npx prettier --check` over this file would
match zero files, print a green pass and prove nothing. It is deliberately not run. This file was
hand-matched to the wrap and heading conventions of the surrounding phase artifacts.

**Not done:** no tests were run and no source file was modified by this review.
