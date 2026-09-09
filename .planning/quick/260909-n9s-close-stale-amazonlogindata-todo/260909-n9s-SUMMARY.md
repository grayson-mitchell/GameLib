---
quick_id: 260909-n9s
status: complete
date: 2026-09-09
type: docs-only
---

# Summary — 260909-n9s

**Outcome:** Todo closed with **no behavioural code change**. Its premise was refuted, not just
its remedy. One non-behavioural source edit was required — see *Pointer repair* below.

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

## Pointer repair (not in the original plan)

`index.tsx:169` cited this todo at its `.planning/todos/pending/...` path — a breadcrumb left by
the very commit that resolved it. Moving the file to `completed/` made that reference dangle, so
the path was corrected in place. Comment-only: no behaviour, no API, no control flow touched.
Re-verified after the edit — all 10 `WebView/__tests__` suites pass (213 tests), `planning-gates`
9/9, prettier clean.

## Noted, not actioned

`.planning/quick/260905-upz-.../260905-upz-AUDIT.md:466` scored this todo **LIVE — anchor still
present** on 2026-09-05 using `grep -rn "amazonLoginData" src | wc -l` => `4`. All four hits were
already **comments**, not code; the todo had been dead since `157409206`. A bare identifier grep
cannot distinguish a live read site from a comment describing its deletion. Recorded here rather
than corrected — that audit is a historical artefact.

## Follow-ups

None. The `ready:` field was corrected `live-gate` → `code` on close: the closure rests on code
evidence and existing gated suites, so no live Amazon/Nile login run was required.
