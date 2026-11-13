---
status: resolved
trigger: "Humble key reveal/redeem broken after Humble's Next.js + Ory migration: the new filterUserLibrary data has no keyindex so revealKey returns ineligible; legacy POST /humbler/redeemkey returns 403 text/html; csrf cookie renamed csrf_cookie -> csrf_token_<hash>. Need to find the new site's reveal mechanism (likely another Next.js server action) and restore reveal + downstream Steam redeem in GameLib's Humble Keys page."
created: 2026-11-14
updated: 2026-11-14
---

## Symptoms

- expected: On GameLib's Humble Keys page, revealing an unrevealed key fetches its code from Humble (and marks it revealed on humblebundle.com); for Steam keys, the downstream "redeem on Steam" flow then works with that code.
- actual: revealKey returns `ineligible` before any request, because the new library data (filterUserLibrary server action, fixed in 31a4f11df) has no `keyindex`. The legacy POST `/humbler/redeemkey` returns 403 text/html even before that guard was added. The CSRF cookie is renamed (`csrf_cookie` -> `csrf_token_<hash>`).
- errors: 403 text/html from /humbler/redeemkey (legacy stack); `ineligible` outcome in GameLib.
- timeline: Broke with Humble's Next.js (App Router) + Ory Kratos migration, observed 2026-11-13. Worked before against the legacy API.
- reproduction: Sign in to Humble in GameLib -> Humble Keys -> pick an unrevealed key -> Reveal.

## Context (from resolved sessions)

- See `.planning/debug/resolved/humble-keys-sync-api-gone.md` (commit 31a4f11df) and `.planning/debug/resolved/humble-login-url-404.md` (b4c5a5317).
- Library comes from the Next.js server action `filterUserLibrary` on `/home/library`. The action id is scraped from JS chunks (`getLibraryOrders` in `src/backend/humble/adapter.ts`), and the request must mirror React encodeReply exactly: `_1_<field>` FormData names, root part `"0"` = `[prevState,"$K1"]` appended LAST, `?page=N`, the exact router-state-tree, no Next-Url.
- Key item fields include: id, type, keyIntegrationId, redemptionData{keyFormatted,...}, redeemedAt, giftStatus, directRedeem, redeemable, expired, notGiftable, customCtaUrl. A revealed key's code is in `redemptionData.keyFormatted`.
- Library item id is used as gamekey; each key's id is the tpk machine_name.

## Security constraints (operator-imposed, binding)

- Never log, record, or relay cookie values, session tokens, CSRF tokens, key codes (keyFormatted), userIds or response bodies. Names, domains, statuses, counts and shapes only.
- Do NOT reveal or redeem real keys autonomously. A live reveal spends one of the operator's keys and is the operator's decision; ask for it only as an explicit checkpoint, and prefer static analysis of the public JS chunks first.
- Do not hammer Humble: one request per diagnostic action, with gaps.
- Commit by explicit path only (never gsd-sdk commit, never git add -A/.).

## Current Focus

- hypothesis: The new site reveals keys via another Next.js server action (sibling of filterUserLibrary), keyed by the key/entitlement id instead of gamekey+keyindex.
- next_action: gather initial evidence — find the reveal/redeem server action in the site's JS chunks (name, id, argument shape) without performing a reveal.

## Evidence

- Anonymous fetch of /home/library/<any id> HTML + its JS chunks exposes server action `redeemEntitlementAction` (not in /home/library chunks; only in the detail-route chunk). Client calls it as `redeemEntitlementAction(entitlement.id, entitlement.keyIntegrationId, signInResult|undefined)` and reads `{success, key, orderStatus, accountName, errorKind}`.
- "Redeem" in GameLib = local markRedeemed only (no Humble call); unaffected once a code exists.

## Eliminated

## Resolution

- root_cause: reveal used legacy /humbler/redeemkey needing keyindex; new site uses server action redeemEntitlementAction(keyId, keyIntegrationId).
- fix: adapter.revealKey posts that action (id scraped from /home/library/<gamekey> chunks, cached, one re-discovery on stale); keyindex side-channel now carries keyIntegrationId; legacy seam POST code removed. Gates green; sidecar built. Verified live 2026-11-14 08:43: GOG key revealed via redeemEntitlementAction (keyPresent=true, 9s), code displayed. Reveal log line now prints keyId once.
