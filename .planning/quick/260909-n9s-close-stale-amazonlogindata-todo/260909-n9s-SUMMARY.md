---
quick_id: 260909-n9s
status: complete
date: 2026-09-09
type: docs-only
---

# Summary — 260909-n9s

**Outcome:** Todo closed with **no code change**. Its premise was refuted, not just its remedy.

## What was asked

Action `2026-09-01-webview-amazonlogindata-is-permanently-null.md`: `amazonLoginData` is
permanently `null`, so 6 read sites in `WebView/index.tsx` never see a value. Suggested fix —
read Amazon data from `oauthLoginState` instead.

## What was found

Phase 40 Plan 01 (commit `157409206`) **deleted** the state and all 6 read sites rather than
repairing them. Verified against HEAD:

- `index.tsx` no longer imports `NileLoginData`; its only `useState` is `showLoginWarningFor`.
- The login arm returns `<TauriLoginPanel runner state={oauthLoginState}/>` at `index.tsx:422`,
  **before** the store/wiki arm reads `startUrl`.
- `/loginweb/nile` is in `LOGIN_PATHNAMES` (`loginRoutes.ts:24`) ⇒ `isStoreRoute === false`
  ⇒ `useStoreEmbedHost` no-ops and never navigates the residual `''` url.

So the empty string is unreachable behind three independent gates, not one.

## The remedy was superseded, not pre-applied

The todo assumed `index.tsx` still needs Amazon login data. It does not.
`useTauriOAuthLogin.ts:220` consumes `getAmazonLoginData()` internally and forwards `.url` to the
login window — it never returns the payload to the component. There is nothing to rewire.

## Verification

`npx jest WebViewAmazonLoginDataSpawn.test.ts useTauriOAuthLogin.test.tsx`
→ **2 suites passed, 78 tests passed**.

`pnpm planning-gates` → **9/9 passed**.

The single-call-site gate (`WebViewAmazonLoginDataSpawn.test.ts`) carries its own negative
control: it asserts failure against a synthetic source with a duplicated `getAmazonLoginData()`
call, so its green is not a green-check-proving-nothing.

## Follow-ups

None. The `ready:` field was corrected `live-gate` → `code` on close: the closure rests on code
evidence and existing gated suites, so no live Amazon/Nile login run was required.
