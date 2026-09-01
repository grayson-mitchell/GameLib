---
created: 2026-09-01T00:00:00.000Z
title: "WebView/index.tsx's `amazonLoginData` state is permanently `null` — 6 read sites never see a value"
area: login
severity: medium
status: pending
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
