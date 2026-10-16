# Phase 26: Steam Key Redemption — Specification

**Created:** 2026-07-20
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 6 locked

## Goal

A user can redeem a single Steam product key from inside GameLib — paste the key into a
GameLib entry point (shown only when logged into Steam) → GameLib activates it on the
already-authenticated `steam-user` CM session via `redeemKey()` → the newly-owned game
appears in the Steam library. No typing the key into the Steam client.

## Background

GameLib does **not** push keys to Steam today. The Humble flow's `doRevealKey`
(`src/backend/humble/library.ts:1085`) only *reveals* a key value from Humble; there is no
`redeemKey` call anywhere in `src/`, and no key-entry UI or IPC handler. Historically,
GameLib revealed a key and the user typed it into Steam by hand ("revealed ≠ activated").

The building blocks already exist:
- `steam-user@5.3.0` exposes `redeemKey(key) → { purchaseResultDetails: EPurchaseResult, packageList }` (typed at `@types/steam-user/index.d.ts:790`), activating on the logged-in account with no client UI.
- `SteamUser` (`src/backend/storeManagers/steam/user.ts:52`) already holds the authenticated client: `getClient()` (`:92`) returns the live instance and `ensureConnected()` (`:105`) re-establishes the CM connection from the persisted refresh token. `isLoggedIn()` (`:86`) gates availability.
- `recomputeOwnership()` exists to refresh library ownership after a change.

The gap this phase closes: a manual Steam key-entry surface + a backend `redeemKey` wrapper
(IPC-exposed) + `EPurchaseResult` → UX branching + client-side format validation. Full
grounding in `.planning/notes/steam-key-redemption-reveal-vs-activation.md`.

## Requirements

1. **Redeem entry point (Steam, logged-in only)**: A user-reachable UI surface to enter a Steam key, present only when a Steam session exists.
   - Current: No key-entry UI exists anywhere in GameLib.
   - Target: A discoverable entry point (exact placement decided in discuss-phase) that opens a manual Steam key input. It is not shown/reachable unless `SteamUser.isLoggedIn()`.
   - Acceptance: With no Steam session the entry point is absent; after Steam login it appears and opens the key input.

2. **Backend redeem wrapper + IPC**: A backend action redeems a single key on the authenticated CM session.
   - Current: No `redeemKey` call in `src/`; `SteamUser` exposes `getClient()`/`ensureConnected()` but nothing calls `redeemKey`.
   - Target: A backend function (in/near `src/backend/storeManagers/steam/user.ts`) that ensures the connection then calls `client.redeemKey(key)`, exposed to the renderer via IPC, returning `EPurchaseResult` + `packageList`.
   - Acceptance: Submitting a known-valid test key results in a `redeemKey` call over the live session and returns the result to the renderer (verified with the user's spare test keys).

3. **Client-side format validation**: Obviously-malformed keys are rejected before any network call.
   - Current: n/a (no entry point).
   - Target: Empty/whitespace and structurally-invalid input (fails a basic Steam-key shape/charset check) is rejected with an inline message; `redeemKey` is not called. Exact rule decided in discuss-phase — must not over-reject valid Steam keys.
   - Acceptance: Pasting empty input or an obviously malformed string shows a validation message and produces no `redeemKey`/network call (observable in logs).

4. **Outcome handling — success**: A successful redeem surfaces the game name and refreshes ownership.
   - Current: n/a.
   - Target: On a success `EPurchaseResult`, show the redeemed package/game name (from `packageList`) and trigger `recomputeOwnership()` so the game appears as owned without an app restart.
   - Acceptance: Redeeming a valid, unowned test key shows the correct game name and the game appears in the Steam library view after the redeem, no restart.

5. **Outcome handling — already-owned / invalid / rate-limited**: The three non-success outcomes are surfaced distinctly.
   - Current: n/a.
   - Target: `redeemKey` results mapped to distinct user-facing messages for already-owned, invalid/bad key, and Steam activation rate-limit/cooldown — never collapsed into one generic "failed."
   - Acceptance: An already-owned key shows an "already owned" message; a malformed/nonexistent key shows an "invalid key" message; the rate-limited result shows a "wait/cooldown" message. Owned/invalid verified via test keys; rate-limit verified by result-code mapping if not reproducible live.

6. **Store-aware-ready UI (forward-compat, Steam-only behavior)**: The entry point is structured so a store dimension can be added later without a rewrite, but only Steam is offered/handled now.
   - Current: n/a.
   - Target: The redeem UI/data flow carries a store field/parameter so a future store (e.g. GOG) can be added; today only Steam is wired. No GOG/multi-store code, no format-based store auto-routing.
   - Acceptance: Code review confirms the redeem surface has no hard-coded assumption that Steam is the only possible store (store is a parameter/field), while the only wired path is Steam.

## Boundaries

**In scope:**
- Manual Steam key entry point, visible only when logged into Steam
- Backend `redeemKey` wrapper + IPC handler
- Client-side format validation (reject obviously-malformed before send)
- `EPurchaseResult` branching for the four outcomes (success / already-owned / invalid / rate-limited)
- Library refresh via `recomputeOwnership()` on success
- Store-aware-ready UI structure (Steam-only wired)

**Out of scope:**
- Any-store loose-key generalization beyond Steam — deferred (roadmap increment 2)
- GOG (or any non-Steam) key redemption — no backend exists; captured as research question + seed
- Format-based store auto-detection/routing — heuristic is unreliable (5-5-5 shape collides across Steam/Origin/Uplay/Rockstar/Bethesda; GOG has no canonical pattern)
- Auto-redeem revealed Humble keys into Steam — deferred to the seed (waits until this ships & is verified)
- Offering/triggering install after redeem — user installs via the existing library flow
- Client-side rate-throttle against Steam's activation cooldown — surface the result only; Q6 unresearched
- Batch/multi-key redemption — single key per action

## Constraints

- Requires a live authenticated `steam-user` CM session (`SteamUser.ensureConnected()`); entry point hidden when not logged in.
- Cross-platform (Windows / macOS / Linux) — redeem is over the CM connection with no client UI, so no platform-specific path.
- Must reuse the existing `SteamUser` session — no second Steam login prompt.
- Format validation must not over-reject valid Steam keys — basic shape/charset only; exact rule decided in discuss-phase.
- Never log raw key values — follow the existing redaction discipline used in `humble/library.ts` (status only, never key VALUE).
- Steam rate-limits invalid-key activations at the account level (see research Q6) — this phase does not throttle; it must surface the rate-limited result cleanly so a user isn't led to keep retrying.

## Acceptance Criteria

- [ ] Redeem entry point is absent when no Steam session; appears after Steam login
- [ ] Submitting a valid unowned test key redeems it (`redeemKey` called on live session) and the game appears as owned after `recomputeOwnership`, no restart
- [ ] Success message shows the redeemed game/package name from `packageList`
- [ ] An already-owned key shows a distinct "already owned" message
- [ ] An invalid/malformed key shows a distinct "invalid key" message
- [ ] Empty/obviously-malformed input is rejected client-side with no `redeemKey`/network call
- [ ] Rate-limited/cooldown result is surfaced as a distinct "wait" message (mapping verified even if not reproduced live)
- [ ] Raw key values never appear in logs
- [ ] Redeem surface carries a store field/param (store-aware-ready), with Steam as the only wired path

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                             |
|--------------------|-------|------|--------|---------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Single Steam key → redeemKey, logged-in-only      |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | Steam-only, store-aware-ready; GOG/Humble/install out |
| Constraint Clarity | 0.75  | 0.65 | ✓      | Auth-gated, format-validate, no throttle, x-platform |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | 4 outcomes + hidden-when-logged-out + lib refresh |
| **Ambiguity**      | 0.15  | ≤0.20| ✓      |                                                   |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective     | Question summary                                | Decision locked                                              |
|-------|-----------------|-------------------------------------------------|--------------------------------------------------------------|
| 1     | Researcher      | Which of the 3 roadmap increments is this phase?| Manual entry only; any-store + Humble auto-redeem deferred    |
| 1     | Boundary Keeper | Which redeem outcomes must be surfaced?         | All four: success+name, already-owned, invalid, rate-limited  |
| 1     | Boundary Keeper | Rate-limit guardrail depth?                     | Format-validate only (no client throttle; no Q6 dependency)   |
| 1.5   | Clarification   | Can key format route to the right store (GOG)?  | No — format detection unreliable + no GOG redeem backend; UI store-aware-ready, GOG → research question + seed |
| 2     | Boundary Keeper | Behavior when not logged into Steam?            | Hidden until logged in                                        |
| 2     | Boundary Keeper | Offer to install after successful redeem?       | No — refresh library only; install via existing flow          |

---

*Phase: 26-steam-key-redemption*
*Spec created: 2026-07-20*
*Next step: /gsd:discuss-phase 26 — implementation decisions (entry-point placement, format-validation rule, IPC shape, EPurchaseResult mapping)*
