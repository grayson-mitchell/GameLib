# Quick Task 261030-qqh: Refresh the Steam library when leaving the in-app Steam store - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning

<domain>
## Task Boundary

Action the todo `.planning/todos/pending/2026-10-28-steam-in-app-purchase-needs-manual-library-refresh.md`:
a game bought or granted in the embedded Steam store must show in the library without a manual
Refresh.

</domain>

<decisions>
## Implementation Decisions

### Probe findings (2026-10-30, live + desk)

- **Live (operator):** a free-to-own "Add to Library" in the embed did NOT change the URL (no
  main-frame load), and it showed "added to library". So the todo's first candidate, an
  `on_page_load` receipt-URL trigger, cannot catch a free grant. A paid checkout's receipt step is
  unmeasured and may be in-page too, so do not build a URL-match trigger.
- **Desk (store JS, `store.steampowered.com` bundles):** the grant is the protobuf service call
  `Checkout.AddFreeLicense#1` (ICheckoutService), sent as XHR. The store's own owned list is
  `dynamicstore/userdata/` (`rgOwnedApps`), cookie-authenticated; it is empty when anonymous.
- GameLib has no cookie read and no script eval for the store embed (`main.rs` rules out
  `eval()` there), so it can see neither the grant XHR nor the owned list.

### Trigger (operator decision, locked): refresh on store exit

- When the user leaves the Steam in-app store embed, run the SAME owned-apps library refresh the
  explicit Refresh button runs. Reuse it, along with the key-redeem (`user.ts` `redeemKey`)
  library-update wiring, if that is the same mechanism. Do not invent a second refresh path.
- "Leaving" means the embed closing or hiding for the Steam store (route change away from the
  store, or switching store tabs). Pick the existing lifecycle point that covers both.
- Gate: only when, during that embed session, the main frame loaded at least one Steam
  store app, cart or checkout page (from the existing nav-event drain in `useStoreEmbedHost.ts`).
  Plain browsing of the front page does not arm it.
- Throttle: at most one auto refresh per short window (planner picks the value, minutes not
  hours). Never stack on a refresh that is already in flight.
- Steam only. Epic/GOG/other store embeds are unchanged.
- Signed-out Steam: do nothing. Never prompt for sign-in from this trigger.
- Do NOT keep an authenticated CM session open for this (CLAUDE.md stack note). The refresh's own
  on-demand logon is accepted.
- Rejected: the cookie read plus `dynamicstore/userdata` diff (new sensitive surface), and the
  receipt-URL `on_page_load` trigger (cannot catch in-page grants).

### Claude's Discretion

- Whether the arm/flag lives in the frontend hook or the backend.
- The throttle value.
- Any quiet log line for observability.

</decisions>

<specifics>
## Specific Ideas

Live gate for the SUMMARY (operator, not executor): a free-to-own "Add to Library" in the embed,
then leaving the store, shows the game in the library with no manual Refresh.

</specifics>

<canonical_refs>
## Canonical References

- The todo file above.
- CLAUDE.md "Technology Stack (Steam)": authenticated only on demand.
- `Skill("gamelib-conventions")` (the `<verify>` prettier rule; fake-HOME if any spawn is involved).

</canonical_refs>
