# Phase 26: Steam Key Redemption - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A logged-in-only UI surface to redeem a single Steam product key from inside GameLib:
paste a key → `steam-user.redeemKey()` on the already-authenticated CM session → surface
the outcome and refresh the library. Steam-only, store-aware-ready in the data model.
No GOG/any-store redemption, no Humble auto-redeem, no install-after-redeem.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `26-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `26-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Manual Steam key entry point, visible only when logged into Steam
- Backend `redeemKey` wrapper + IPC handler
- Client-side format validation (reject obviously-malformed before send)
- `EPurchaseResult` branching for the four outcomes (success / already-owned / invalid / rate-limited)
- Library refresh via `recomputeOwnership()` on success
- Store-aware-ready UI structure (Steam-only wired)

**Out of scope (from SPEC.md):**
- Any-store loose-key generalization beyond Steam — deferred (roadmap increment 2)
- GOG (or any non-Steam) key redemption — no backend exists; research Q7 + seed
- Format-based store auto-detection/routing — unreliable (5-5-5 collides across stores)
- Auto-redeem revealed Humble keys into Steam — deferred to seed
- Offering/triggering install after redeem — existing library flow
- Client-side rate-throttle against Steam's activation cooldown — surface the result only
- Batch/multi-key redemption — single key per action

</spec_lock>

<decisions>
## Implementation Decisions

### Entry-point placement
- **D-01:** The entry point is a **left-sidebar nav item**, placed **under the Settings link**, in `src/frontend/components/UI/Sidebar/components/SidebarLinks`. User note: "can always move later" — low commitment, easy to relocate.
- **D-02:** The sidebar item is **gated on Steam login** (SPEC REQ1 governs): it appears only when `SteamUser.isLoggedIn()` / a live session exists — absent otherwise. Placement in the sidebar does not override the hidden-unless-logged-in requirement.
- **D-03:** Clicking the sidebar item **opens the redeem modal** (it does not navigate to a full screen/route).

### Redeem surface shape
- **D-04:** A **simple modal** — single key input + a Redeem button. One key per action (batch is out of scope). Reuse the generic `src/frontend/components/UI/Dialog` component (+ `DialogHandler` for programmatic open), NOT a Phase-14-style multi-step wizard.
- **D-05:** **Store is a hidden parameter** in the data model, defaulting to `steam` — no visible store selector in the UI yet. This satisfies SPEC REQ6 (store-aware-ready) in the data flow without surfacing a currently-one-option dropdown.

### Outcome presentation
- **D-06:** Outcomes are shown **inline in the modal** (status updates in place where the user typed). The modal **stays open** on result so the user has context.
- **D-07:** On **success**, show the redeemed game/package name (from `redeemKey`'s `packageList`) and offer a **"View in library" jump** to the newly-owned game. Library ownership is refreshed via `recomputeOwnership()` (SPEC REQ4).
- **D-08:** On **error**, the message stays put in the modal so the user can correct a mistyped key and retry without reopening. The four outcomes (success / already-owned / invalid / rate-limited) each get a **distinct** message (SPEC REQ5) — never a generic "failed."

### Format-validation strictness
- **D-09:** **Light structural validation** before calling `redeemKey`: reject empty/whitespace and clearly-wrong length/charset; normalize case + dashes. Do NOT enforce an exact 5-5-5 regex — that risks over-rejecting valid non-standard keys (SPEC REQ3: "basic shape/charset, must not over-reject"). The goal is catching typos, not being a store router.

### Claude's Discretion
- Exact IPC method name/shape on `src/preload/api/steam.ts` and the backend handler wiring.
- The precise normalization rule (uppercasing, dash insertion/stripping) within the "light structural" bound of D-09.
- Modal copy/wording for each of the four outcome messages.
- Whether the backend `redeemKey` wrapper is a new `SteamUser` static method or a sibling function in `user.ts` — planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements (read first)
- `.planning/phases/26-steam-key-redemption/26-SPEC.md` — Locked requirements, boundaries, acceptance criteria — MUST read before planning.

### Technical grounding
- `.planning/notes/steam-key-redemption-reveal-vs-activation.md` — reveal ≠ activation finding; `redeemKey` signature; the `SteamUser` seams (`getClient`/`ensureConnected`/`isLoggedIn`); `recomputeOwnership` follow-up; rate-limit risk.
- `@types/steam-user/index.d.ts` §L790 — `redeemKey(key) → { purchaseResultDetails: EPurchaseResult, packageList }` signature.

### Open research (informs outcome mapping)
- `.planning/research/questions.md` §Q6 — Steam invalid-key cooldown behavior + full `EPurchaseResult` failure taxonomy. **Resolving Q6 firms up the rate-limited/invalid/already-owned message mapping (SPEC REQ5).** Recommend answering before or during planning.
- `.planning/research/questions.md` §Q7 — GOG redeem feasibility + store-detection (OUT of scope for this phase; context for the store-aware-ready design only).

### Deferred follow-ons (context, not build targets)
- `.planning/seeds/humble-auto-redeem-into-steam.md` — reveal→redeem chain, gated on this phase shipping.
- `.planning/seeds/gog-key-redemption.md` — unified multi-store redeem surface, gated on Q7.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`SteamUser` class** (`src/backend/storeManagers/steam/user.ts:52`): `getClient()` (:92) returns the live `steam-user` client, `ensureConnected()` (:105) re-establishes the CM session from the persisted refresh token, `isLoggedIn()` (:86) gates availability. The redeem wrapper lives here: `ensureConnected()` → `getClient().redeemKey(key)`.
- **`recomputeOwnership()`** (steam library manager): call on a successful redeem so the newly-owned game appears without an app restart (SPEC REQ4).
- **`steam-user@5.3.0`**: `redeemKey` verified present on the prototype; typed at `@types/steam-user/index.d.ts:790`.
- **Generic `Dialog` component** (`src/frontend/components/UI/Dialog`) + `DialogHandler` — reuse for the redeem modal (D-04) instead of building bespoke.
- **Log-redaction discipline** (`src/backend/humble/library.ts`, e.g. `doRevealKey` at :1085): status-only logging, never key VALUES — mirror this for redeem (SPEC constraint).

### Established Patterns
- **Sidebar nav items** live in `src/frontend/components/UI/Sidebar/components/SidebarLinks` — add the gated "Redeem a Steam key" item there (D-01/D-02).
- **Steam preload/IPC surface**: `src/preload/api/steam.ts` (~41 lines today) exposes Steam backend calls to the renderer via the `makeHandlerInvoker` pattern — add the redeem method here (D-03).
- **Phase 14 Humble guided claim flow** is the nearest key-operation analog for messaging/redaction, but D-04 deliberately chooses a simpler modal over its multi-step wizard.

### Integration Points
- Renderer sidebar item → IPC (`steam.ts`) → backend `redeemKey` wrapper (`user.ts`) → `steam-user` CM → result mapped to `EPurchaseResult` → back to modal (inline outcome) + `recomputeOwnership()` on success.

</code_context>

<specifics>
## Specific Ideas

- "Just put it in the left menu pane under settings (can always move later)" — sidebar placement is intentionally low-commitment; don't over-engineer discoverability.
- Store dimension should exist in the data model now (for the future GOG/multi-store path) but must NOT surface as UI chrome yet.
- Success should feel complete: name the game and let the user jump straight to it in the library.

</specifics>

<deferred>
## Deferred Ideas

- **Any-store loose-key redemption (increment 2)** — generalize beyond Steam; roadmap increment, future phase.
- **GOG key redemption + unified redeem surface** — `.planning/seeds/gog-key-redemption.md`, gated on research Q7.
- **Auto-redeem revealed Humble keys into Steam** — `.planning/seeds/humble-auto-redeem-into-steam.md`, gated on this phase shipping + verified.
- **Client-side rate-throttle** against Steam's activation cooldown — deferred; this phase only surfaces the rate-limited result (pending Q6).
- **Visible store selector** — appears only when a second store (e.g. GOG) is actually wired.

### Reviewed Todos (not folded)
- "Productionize the macOS native Steam bridge" — matched on `steam` area only; unrelated to key redemption.
- "Steam bottle setup offers GPTK/Wine engines that produce a broken bottle" — bottle-engine bug; unrelated.
- "Runtime getProductInfo appinfo dump to lock the osarch parser" — appinfo/arch parsing; unrelated.
- "Startup download-resume silently auto-opens Steam-in-CrossOver" — install-resume bug; unrelated.

All four were keyword false-positives on "steam" — none touch this phase's redemption domain.

</deferred>

---

*Phase: 26-steam-key-redemption*
*Context gathered: 2026-07-20*
