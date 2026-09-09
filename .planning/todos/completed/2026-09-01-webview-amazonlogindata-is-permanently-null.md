---
created: 2026-09-01T00:00:00.000Z
title: "WebView/index.tsx's `amazonLoginData` state is permanently `null` — 6 read sites never see a value"
area: login
severity: medium
platform: any
ready: code
status: "RESOLVED 2026-09-09 by quick-260909-n9s -- NOT fixed as specified: the premise was refuted, not merely the remedy. Phase 40 Plan 01 (commit 157409206) DELETED the amazonLoginData state and all 6 read sites from WebView/index.tsx rather than repairing them, so there is no dead state left to rewire. index.tsx no longer imports NileLoginData and its only useState is showLoginWarningFor. The todo prescribed reading Amazon data from oauthLoginState instead; that remedy is SUPERSEDED -- index.tsx needs no Amazon login data at all, because useTauriOAuthLogin fetches it internally and never returns it to the component. The empty-string /loginweb/nile url that remains is unreachable behind three independent closed gates: (1) isLoginPathname(pathname) returns TauriLoginPanel at index.tsx:422 before the store/wiki arm ever reads startUrl; (2) /loginweb/nile is in LOGIN_PATHNAMES (loginRoutes.ts:24) so isStoreRoute is false; (3) with isStoreRoute false useStoreEmbedHost no-ops and never navigates it. The real fetch is live and gated -- useTauriOAuthLogin.ts:220 owns the single getAmazonLoginData() call, protected by WebViewAmazonLoginDataSpawn.test.ts, a single-call-site gate carrying its own negative control. Suites run: WebViewAmazonLoginDataSpawn + useTauriOAuthLogin = 2 passed, 78 tests. No code change made: index.tsx L165-171 and L276-291 already record why no fetch belongs there (the ~12.8s per-call double-spawn measured by quick task 260806-teb)."
resolved_by: quick-260909-n9s
resolves_phase: ""
found_by: "Quick task 260901-ud5 (clearing the pre-push eslint gate)"
files:
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
---

## Symptom

`src/frontend/screens/WebView/index.tsx` holds local state
`const [amazonLoginData] = useState<NileLoginData | null>(null)` — the setter was dropped
(quick task 260901-ud5, eslint `no-unused-vars` on `setAmazonLoginData`) because
`commit 40dcd9ac1` (Phase 35 Plan 17) deleted the effect body that used to call it, without
replacing the write. `amazonLoginData` is now permanently `null` for the lifetime of the
component.

## Read sites affected (all in `WebView/index.tsx`)

- Line ~203: `'/loginweb/nile': amazonLoginData ? amazonLoginData.url : ''` — the Nile/Amazon
  webview src always resolves to `''`.
- Line ~242: `if (!amazonLoginData) { ... }` — always takes the "no data" branch.
- Lines ~253–256: `amazonLoginData.client_id`, `.code_verifier`, `.serial` — unreachable
  given the branch above always short-circuits first.
- Line ~375: `amazonLoginData` in a `useEffect` dependency array — never changes, so the
  effect never re-fires on this account.

## Likely correct owner

The replacement comment at the deleted call site names `useTauriOAuthLogin.ts`'s
`getAmazonLoginData()` (via `window.api.getAmazonLoginData()`, called at
`useTauriOAuthLogin.ts:220`) as the sole remaining fetch of this data. `oauthLoginState`
(the return of `useTauriOAuthLogin(...)` at `index.tsx:163`) likely already carries the
payload this component needs — the fix is probably to read Amazon's login data from
`oauthLoginState` instead of the dead local `amazonLoginData` state, not to resurrect a
setter.

## Why not fixed in 260901-ud5

That task's scope was clearing an eslint error with a behaviour-identical destructure
change (drop the unused setter only). Repairing the actual data flow is a distinct,
non-trivial change to `WebView/index.tsx`'s Amazon/Nile login path and needs its own
verification against a live Amazon/Nile login flow.

## Resolution (quick-260909-n9s, 2026-09-09)

Closed **without a code change** — the symptom section above describes a file that no longer
exists in that shape.

`commit 157409206` (Phase 40 Plan 01, D-09, "retire Model A render sites from WebView screen and
HumbleLoginSurface") deleted `handleAmazonLogin`, the `amazonLoginData` state, and every
`<webview>` event-listener effect. Each of the six read sites named above went with them:

| Read site in this todo | Fate |
| --- | --- |
| L~203 `'/loginweb/nile': amazonLoginData ? ... : ''` | now the literal `''`, and unreachable |
| L~242 `if (!amazonLoginData)` | deleted with `handleAmazonLogin` |
| L~253-256 `.client_id` / `.code_verifier` / `.serial` | deleted |
| L~375 dep-array entry | deleted |

### Why the prescribed remedy was superseded

This todo proposed *"read Amazon's login data from `oauthLoginState` instead of the dead local
`amazonLoginData` state"*. That is not the shipped shape. `useTauriOAuthLogin` **consumes**
`getAmazonLoginData()` internally at `useTauriOAuthLogin.ts:220` and forwards `.url` to the login
window; it never surfaces the payload in its returned state. `index.tsx` therefore requires no
Amazon login data on any path — there is nothing to rewire.

### Do not "restore" a fetch here

`index.tsx` L276-291 keeps a deliberate no-op effect as the historical record: a second
`nile auth --login --non-interactive` spawn at that site is the ~12.8s-per-call
pyinstaller-onefile-spawn-tax that quick task 260806-teb measured and removed.
`WebViewAmazonLoginDataSpawn.test.ts` gates exactly that — one call site, no more, no fewer —
and includes a negative control asserting the gate fails against a duplicated call site.
