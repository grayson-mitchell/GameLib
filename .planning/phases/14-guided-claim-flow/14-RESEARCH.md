# Phase 14: Guided Claim Flow - Research

**Researched:** 2026-07-07
**Domain:** Undocumented Humble Bundle reveal/redeem API + Electron/React claim-flow UX + local audit persistence
**Confidence:** MEDIUM overall — HIGH for everything that extends existing, already-shipped Phase 10-13 patterns; MEDIUM/LOW for the reveal/redeem HTTP contract itself, which is reverse-engineered and has never been called by this codebase (this phase is the adapter's first write-style request)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> Numbering continues from Phase 13 (D-49..D-64).

**Claim flow shape**
- **D-65:** The flow runs in a **modal wizard**: a "Claim" button on the key row opens a single modal walking warning → reveal → key copied + "Open Steam" → "Mark as redeemed". One controlled surface carries the C1 warning and completion; reuses the app's existing Dialog components and matches the D-58 confirm-dialog friction pattern.
- **D-66:** **REVEALED-but-unredeemed rows resume at the post-reveal step**: the row swaps "Claim" for **"Finish activation"**, which reopens the modal directly at the key + Open Steam + Mark-redeemed step — no warning replay, and **never a second reveal call** (the key value is already local per D-74).
- **D-67:** The Claim/Finish action renders **in the Keys-waiting tab only**, mirroring D-60's one-view-one-action symmetry. All-keys rows stay D-22 read-only; C2 has a single UI entry point to guard.
- **D-68:** **Non-Steam keys use the same wizard with the activation step swapped** (HCLAIM-05): warning → reveal → key copied, then "Redeem on {platform}" opens that platform's redemption page instead of the Steam registerkey deep-link. "Mark as redeemed" still closes the loop and feeds the audit log. One flow, one audit path.

**C2 guard (owned-game interception)**
- **D-69:** C2 is enforced by a **backend re-check inside the reveal IPC handler** — `ownedElsewhere` is re-validated against current data at call time, **before** the write-ahead audit record and the API request. An owned verdict returns a typed "owned → go to spares" result that the modal turns into `navigate()` to the Phase 13 spares sub-route. UI view-membership filtering is the first line; the backend check is the guarantee (SC2 "hard block, not an advisory" — closes the stale-row race where a sync/Steam-refresh recompute flips ownership between render and click).
- **D-70:** **Fuzzy "Likely owned" matches block exactly like exact AppID matches.** The escape hatch is the existing D-42 "Not the same game" override on the Spares row, which moves the key back to Keys waiting where Claim works. One guard, one escape hatch, no claim-anyway bypass branch. (D-41's persisted provenance still matters: it powers the "Likely owned" labeling that tells the user the override applies.)
- **D-71 (WR gate resolution):** **Fix WR-01 and WR-04 inside Phase 14; accept WR-02 and WR-03 as documented.** Rationale: D-70 makes the override load-bearing for claiming — WR-01 (falsy `steam_app_id` skips both match tiers) mis-sorts keys the guard trusts, and WR-04 (no undo-override UI) makes a mistaken override — now the sanctioned claim path — irreversible, leaving a truly-owned key claimable forever. WR-02 (numeric-sequel fuzzy false-positives) is inherent to fuzzy matching and mitigated by the badge + override; WR-03 (override inert while Steam disconnected) is protected by D-48 keep-last-known.
- **D-72:** **C2 gates the reveal only.** "Finish activation" always works for REVEALED keys — blocking it would strand a key that can be neither claimed nor gifted (spec §2.1: reveal forfeits the gift link; D-55 keeps owned+REVEALED out of Spares). If the game is owned at the finish step, show a **passive note** ("You already own this on Steam — activation will likely fail there") but never block. Steam is the final arbiter of duplicate activation.

**Key exposure & audit**
- **D-73:** Post-reveal, the modal shows the **full key string in plaintext with a re-copy button** (alongside the HCLAIM-03 auto-copy). The user needs a manual-paste fallback; C4 targets logs and IPC debug payloads, not the user's own screen. Matches Humble's own post-reveal display.
- **D-74:** The revealed key value **persists into the existing per-key cache entry** — the same store that already holds `redeemed_key_value` for REDEEMED keys after sync (no new secret-surface class). "Finish activation" works across restarts with zero extra Humble requests; the next sync would populate the same field anyway.
- **D-75:** The audit log is a **backend store surfaced only as per-row annotations** — "revealed {date}" / "redeemed {date}" on the row/modal, following the D-59 "gift link copied {date}" precedent. No full audit-viewer surface this phase.
- **D-76:** Audit records hold **identity + outcome, never the key value** (C4): `machineName`, human title, platform, event type, timestamp, outcome. Events recorded: **reveal attempt (write-ahead, per SC4) → outcome update (success / API-fail), mark-redeemed, undo events, and C2 blocks** (blocks are cheap to record and diagnostic gold when the guard misfires on a fuzzy false-positive). Per Phase 10 D-04 the audit store **survives disconnect**.

**Redeem confirmation & failure handling**
- **D-77:** **"Mark as redeemed" is undoable while REDEEMED rests solely on the local mark** — undo flips the key back to REVEALED and writes an audit event. Once a Humble sync returns `redeemed_key_value`, the key is genuinely REDEEMED and the undo affordance disappears (server truth wins — mirrors D-30's classification precedence).
- **D-78:** The write-ahead REVEALED flag **rolls back on confirmed failure only**: a definitive API error (4xx/5xx response, schema error) clears the flag — key stays UNREVEALED, audit outcome "failed", modal shows a retryable error. An **ambiguous outcome (timeout, dropped connection) keeps the flag** — assume revealed, let the next sync reconcile. Conservative exactly where it must be (never regress a real reveal — the D-30 invariant), honest everywhere else (never forfeit gift-ability of an untouched key on a plain network error).
- **D-79:** Pacing is **serial + denial cooldown** (C3): one in-flight reveal at a time — the wizard is inherently serial and its own friction is the throttle — plus a Humble 403/429 on reveal triggers the existing D-33-style cooldown gating further reveals ("temporarily unavailable — retry in Nm"). No artificial timer between successful claims.
- **D-80:** **No active nudges** for REVEALED-but-unconfirmed keys beyond the passive row state (Finish-activation button + revealed-date annotation). No banners, toasts, or notifications — D-31's "background states aren't interruption-worthy" philosophy; Phase 15 owns alerting.

### Claude's Discretion
- **Reveal endpoint contract** — identify Humble's reveal/redeem request and spec it as a new `adapter.ts` function behind `AdapterResult`, with redacted logging (key values never logged, C4) and the X-Requested-By header discipline. Distinguishing "definitive failure" from "ambiguous outcome" for D-78 falls out of this contract. **→ Resolved below in "Reveal Endpoint Contract."**
- **UNPICKED Choice-month pseudo-entries** (D-27) sit in Keys waiting but have no key to reveal — presumably their action is a link-out to `choice_url` to pick on Humble, or no action this phase. Researcher/planner decides; do not let them enter the reveal wizard. **→ Recommendation below.**
- **Key-identity edge**: 13-REVIEW warns machineName alone can collide when the same game arrives via two orders — decide whether audit/cache keying needs a `gamekey+machineName` composite (same disposition as Phase 13's WR-01). **→ Recommendation below.**
- **D-24 freeze interaction**: marking a key REDEEMED locally may make its order all-terminal and freeze it from re-fetch — confirm the local mark still gets reconciled (or intentionally isn't) and that undo (D-77) behaves with a frozen order. **→ Analysis below.**
- Exact wizard step layout/copy, C1 warning wording, i18n keys in the **consumed** namespace (Phase 10 WR-08), Dialog component composition.
- Audit store shape/location in `electronStores.ts` (joins the D-04 wipe exemption alongside REVEALED flags, overrides, gifted-at).
- WR-01 fix approach (falsy-`steam_app_id` handling in `dedup.ts`) and WR-04 undo-override affordance placement/copy.
- 403-cooldown duration reuse, retry UX on failed reveal, outcome vocabulary for audit records, undo affordance placement (row vs toast vs modal).

### Deferred Ideas (OUT OF SCOPE)
- **Full audit-log viewer surface** (chronological activity list) — rejected for v1.2 (D-75 keeps annotations only); revisit if users ask for a claim history.
- **Fuzzy claim-anyway inline bypass** — rejected (D-70); revisit only if the override round-trip proves annoying in real use.
- **Active nudges for in-flight claims** (tab-count emphasis, startup reminder toast) — rejected (D-80); expiration/urgency alerting is Phase 15's domain (HSTORE-03).
- **Phase 13 CR-01 gap closure** — not a Phase 14 deliverable, but a pre-phase gate; 13-REVIEW.md already contains the corrected implementation + test.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HCLAIM-01 | Reveal a single UNREVEALED key only on explicit per-key action, behind a clear irreversibility warning — never auto-reveal, no "reveal all" | Modal-wizard pattern (D-65) built on the existing `showDialogModal`/`MessageBoxModal` (ReactElement message support, confirmed below); the reveal endpoint contract is isolated to ONE new `adapter.ts` function, callable from exactly one IPC handler — matches PITFALLS.md Pitfall 1's "single call site" prevention |
| HCLAIM-02 | Revealing a key for an already-owned game is intercepted and routed to Giftable Spares (C2 guard) | D-69's backend re-check pattern is the exact shape already shipped for `humbleSetOwnershipOverride`/`humbleRecordGiftLinkOpened` (re-validate server-side, reject+log on mismatch) — see Architecture Patterns and Code Examples |
| HCLAIM-03 | Reveal copies key to clipboard, opens `registerkey?key=`, "Mark as redeemed" confirms | `window.api.clipboardWriteText` + `window.api.openExternalUrl` already exist and are used elsewhere (Epic SID login, Phase 13 Spares gift deep-link) — no new IPC primitives needed, only new call sites |
| HCLAIM-04 | Every reveal and redeem recorded in a local audit log (what, when, outcome) | New `humbleAuditStore` (array-per-key `CacheStore`), write-ahead ordering pattern from PITFALLS.md Pitfall 8, composite-key recommendation to avoid 13-REVIEW WR-01's machineName collision |
| HCLAIM-05 | Non-Steam keys show "Redeem on {platform}" link-out + copy-key, no one-click activation | D-68's unified-wizard-with-swapped-final-step keeps one code path; `platform` field (from `key_type`, D-28) already distinguishes Steam from everything else |
</phase_requirements>

## Summary

This phase adds the **first write-style Humble API call** to a codebase that has, until now, only ever read from Humble (`getGamekeys`, `getOrderDetail`, `getAccountIdentity`). Every architectural pattern the phase needs — server-side re-validation of renderer-supplied state (D-69), write-ahead persistence before an external call (D-30's REVEALED flag precedent), a confirm-dialog wizard reusing `showDialogModal`, composite-key stores to survive machineName collisions — already exists in the codebase in near-identical form from Phases 11-13. The planning risk is not "does GameLib have the scaffolding" (it does) but **getting the undocumented reveal/redeem HTTP contract right on the first live attempt**, because C1 makes every reveal call irreversible and expensive to get wrong.

Cross-referencing two independent, still-functioning open-source Humble key-redemption tools (a Python/Selenium tool and a Tampermonkey userscript, six years apart, still cited as working in 2025 rate-limit discussions) gives a **consistent** reveal contract: `POST https://www.humblebundle.com/humbler/redeemkey` with form body `keytype=<machine_name>&key=<gamekey>&keyindex=<tpk index field>`, returning `{success, key, error_msg}`. This is MEDIUM confidence (cross-verified, but neither source is official documentation). One critical, LOWER-confidence detail only one source demonstrates: the endpoint may require a `csrf-prevention-token` header sourced from a `csrf_cookie` cookie — GameLib's current login flow captures only `_simpleauth_sess` and would need to start capturing this second cookie too. This must be validated live before the phase can be considered done (see "Reveal Endpoint Contract" and "Open Questions").

A second load-bearing finding: the API's tpk objects carry a `keyindex` field that **nothing in the current `classify.ts`/`OrderDetailTpkSchema` captures today** — it must be added to the schema and threaded through to wherever the reveal handler looks up a key's identity, mirroring how `steam_app_id` was added in Phase 12.

A third finding, purely architectural: `HumbleKey.state` in the renderer's live cache (`humbleLibraryStore`) is currently only ever (re)computed by `classifyOrder()`, which only runs during a full sync. Reveal and redeem happen **between** syncs, so the reveal/redeem handlers must **directly patch the cached `HumbleKey.state` (and push `humbleKeysUpdated`)** the same way Phase 12's WR-03 fix directly patches ownership fields when the sync-gated recompute can't run — otherwise a successful reveal would not show up in the UI until the next sync.

**Primary recommendation:** Build the reveal/redeem flow as: (1) a new `adapter.ts` `revealKey()` function using the researched contract behind `AdapterResult`, gated by a live validation checkpoint before shipping; (2) a new composite-keyed (`gamekey:machineName`) audit store and local-redeemed-mark store, learning from 13-REVIEW's WR-01 rather than repeating it; (3) one IPC handler chain (C2 re-check → write-ahead audit + REVEALED flag → adapter call → outcome reconciliation → direct cache-projection patch) mirroring the D-69 re-validation pattern already shipped twice; (4) a stateful wizard React component passed as `showDialogModal`'s `message` ReactElement, reusing the existing Dialog chrome.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| C1 irreversibility warning + wizard steps | Browser/Renderer | — | Pure UI state machine (React), no persistence of its own |
| C2 owned-game guard (authoritative check) | API/Backend (main process) | Renderer (first-line filtering) | D-69 locks this: the renderer's view membership is UX-only; main process re-validates against live `humbleLibraryStore`/`dedup.ts` state before any write happens — a stale renderer must never be trusted |
| Reveal/redeem HTTP call | API/Backend (adapter.ts) | — | C5 isolation wall — no other file may call Humble directly |
| Write-ahead audit + REVEALED/redeemed-mark stores | API/Backend (electron-store on disk) | — | Must survive process crash and app restart (Pitfall 1/8); Electron main process owns all `electron-store` instances |
| Revealed key-value cache (for "Finish activation") | API/Backend (electron-store, new field/store) | Renderer (transient, on-demand fetch only) | C4: the raw key value must never live in the renderer's persistent Context/state — fetched narrowly, on-demand, when the modal needs to display it |
| Steam activation | Browser/Renderer → OS (external protocol handler) | — | `shell.openExternal`/`openExternalUrl` deep-links into the user's installed Steam client; GameLib never submits the key programmatically (matches every reference implementation) |
| Clipboard copy | Browser/Renderer → OS clipboard | — | Existing `clipboardWriteText`/`clipboardReadText` IPC pair (Electron `clipboard` API), already used by Epic SID login |

## Project Constraints (from CLAUDE.md)

- **Tech stack lock:** Electron + React + TypeScript, must stay mergeable with upstream Heroic — this phase adds no new frontend framework/pattern, only new IPC channels, a new backend module surface, and one new modal component. No risk to mergeability.
- **Steam auth approach:** Already resolved in a prior milestone (steam-user/steam-session) — irrelevant to this phase; Steam interaction here is **only** the `steam://`/web `registerkey` deep-link, not the Steamworks/steam-user library.
- **GSD workflow enforcement:** file-changing work must go through a GSD command (`/gsd-execute-phase` etc.) — a planning-scope note, not a code constraint; flagged here for the plan's own record.
- No project-specific lint/test/security directives beyond what's already encoded in the Humble spec docs (`HUMBLE-SPEC-SOURCE.md`, `PITFALLS.md`) referenced throughout this document.

## Standard Stack

### Core

No new external packages are required. This phase is 100% additive within the existing stack:

| Library | Version (installed) | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------|
| axios | ^1.13.5 [VERIFIED: package.json] | Transport for the new `revealKey()` adapter call | Already the sole Humble transport (`humbleRequest` in `adapter.ts`); the reveal call is a `POST`, requiring a small new `humblePostRequest` sibling function, not a new library |
| zod | ^3.24.3 [VERIFIED: package.json] | Response-shape validation for the reveal endpoint's JSON body | Matches every existing adapter schema (`OrderDetailSchema`, `AccountIdentitySchema`) — `.passthrough()` tolerant schema, per C5 |
| electron (built-in `clipboard`, `shell`) | ^41.1.1 [VERIFIED: package.json] | Clipboard copy (HCLAIM-03) + external URL open (Steam registerkey / non-Steam platform links) | Already wired end-to-end: `window.api.clipboardWriteText`/`clipboardReadText` and `window.api.openExternalUrl` exist and are consumed today by `Login/SIDLogin` and `Spares/index.tsx` respectively |

### Supporting

| Library | Already Present | When to Use |
|---------|-----------------|-------------|
| `electron-store` (via project's `CacheStore`/`TypeCheckedStoreBackend` wrappers) | Yes | New audit store, new local-redeemed-mark store, new revealed-key-value store all follow the exact `CacheStore<T, KeyType>` pattern already used for `humbleRevealedStore`/`humbleOwnershipOverrideStore`/`humbleGiftedAtStore` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A dedicated multi-step wizard modal component | A sequence of separate `showDialogModal()` calls (one per step, chained like Spares' D-58 confirm dialog) | Either works technically (message accepts a `ReactElement`, confirmed in code below). A single stateful component is cleaner for shared loading/error state across steps (in-flight reveal call, retry) and is the recommended approach — chaining discrete dialogs would require lifting all wizard state into the caller |
| Submitting the Steam key programmatically via an unofficial Steam endpoint | `steam://` / web `registerkey?key=` deep-link (locked, HCLAIM-03) | Every reference community tool (FailSpy, Benjamin-Dobell) either automates the real Steam client UI or the documented `store.steampowered.com/account/ajaxregisterkey/` endpoint with a live Steam web session — GameLib's existing Steam integration is via `steam-user`/`steam-session` (game-library API), not a browser session with a Steam `sessionid`, so the locked deep-link approach is also the only one that requires no new Steam-side session capture |

**Installation:** None — no new packages.

**Version verification:** `axios@^1.13.5`, `zod@^3.24.3`, `electron@^41.1.1` confirmed present via `package.json` read (`[VERIFIED: package.json]`) — this phase does not bump or add dependencies.

## Package Legitimacy Audit

**Not applicable — this phase installs no new packages.** Every capability (HTTP POST, JSON schema validation, clipboard, external-URL open, local key-value store) is served by dependencies already in `package.json` and already used elsewhere in the Humble integration. No `slopcheck`/registry verification needed.

## Reveal Endpoint Contract (Researched — Claude's Discretion resolved)

This is the single highest-risk unknown in the phase. Findings below are cross-verified across **two independent, still-referenced community implementations** — `FailSpy/humble-steam-key-redeemer` (Python + Selenium, 2021-era, still linked from PITFALLS.md's own sources) and a 2023 Tampermonkey userscript ("Humble Bundle Auto Redeem", GreasyFork). Both were fetched and quoted verbatim during this research session.

### Request shape [CITED: github.com/FailSpy/humble-steam-key-redeemer, greasyfork.org/en/scripts/441728-humble-bundle-auto-redeem — cross-verified, non-official]

```
POST https://www.humblebundle.com/humbler/redeemkey
Content-Type: application/x-www-form-urlencoded
Accept: application/json, text/javascript, */*; q=0.01
Cookie: _simpleauth_sess=<session cookie>
X-Requested-By: hb_android_app        (existing HUMBLE_REQUIRED_HEADERS — keep it on writes too)

Body (form-encoded):
  keytype=<tpk.machine_name>     <- NOT the platform label (key_type) — a naming trap, see below
  key=<order.gamekey>
  keyindex=<tpk.keyindex>        <- a field NOT currently captured anywhere in this codebase
```

**Naming trap (load-bearing):** the POST field literally named `keytype` does **not** carry the platform (`steam`/`gog`/`epic` — what this codebase calls `key_type`/`platform`). Both independent sources populate it with `tpk["machine_name"]` / `gameItem.machine_name` — i.e., GameLib's own `HumbleKey.machineName`. `key` is the order id (`HumbleKey.gamekey`). Both of these are already captured fields — no schema change needed for them. Only `keyindex` is new.

### Response shape [CITED: same two sources]

```json
// success
{ "success": true, "key": "XXXXX-XXXXX-XXXXX" }
// failure
{ "success": false, "error_msg": "..." }
```
A non-200 HTTP status is also possible (the reference implementations check `status != 200` as an independent failure signal alongside `error_msg`/`success`).

### CSRF token — the unresolved risk [ASSUMED — LOW-MEDIUM confidence, single-source]

Only the FailSpy (Selenium-driven, real-browser-cookie) implementation demonstrates a `csrf-prevention-token` request header, sourced from a `csrf_cookie` cookie on the `humblebundle.com` domain, read via `driver.get_cookie('csrf_cookie')`. The userscript (which executes *inside* an authenticated `humblebundle.com` page, so the browser attaches all same-origin cookies automatically and needs no manual header) does not demonstrate this at all — consistent with either "the header isn't actually required" or "it's required, and the userscript's real in-page execution context satisfies it another way GameLib's out-of-page axios call cannot."

**Why this matters for GameLib specifically:** `HumbleUser` (`src/backend/humble/user.ts`) currently captures and persists **only** `_simpleauth_sess` from the `persist:humble` session partition at login time. It never reads a `csrf_cookie`. If the reveal endpoint does enforce CSRF, an unmodified `getCredentials()`-only reveal call will fail — and because `mapAxiosError` already routes a 403 into `access_denied` (which D-79 explicitly wires to the 403/429 cooldown), a CSRF-shaped failure will *masquerade* as a rate-limit denial rather than surfacing as a distinct, fixable auth problem.

**Recommendation for the plan:**
1. Extend `HumbleUser`'s cookie-capture watch (`checkCookie`/`finishLogin` in `user.ts`) to **also** read the `csrf_cookie` value from the same `session.fromPartition(HUMBLE_LOGIN_PARTITION)` at the same moment it captures `_simpleauth_sess`, and persist it alongside (same encryption treatment via `safeStorage`, same `configStore` key family).
2. Add it optionally to the reveal request's headers (`csrf-prevention-token: <value>`) whenever present; never required at the type level (a login that never observed the cookie should not crash the reveal call — it should just attempt without the header and let the live response prove whether it was needed).
3. **This entire contract — URL, params, and the CSRF question — MUST go through a live validation checkpoint** with a real UNREVEALED test key before this phase ships, exactly matching this codebase's own established practice for every other undocumented Humble endpoint (Phase 10's `humbleRunValidation` dev-only trigger, Phase 11's multiple "live-UAT round N" comments in `classify.ts`/`adapter.ts`). Given C1's irreversibility, this checkpoint is not optional polish — recommend a dedicated `checkpoint:human-verify` gate in the plan before the reveal call is wired to any UI button, using one throwaway UNREVEALED key.

### `keyindex` — new field, schema + type change required

**Confirmed independently in both sources' code:** `keyindex` is read directly off each `tpkd_dict.all_tpks[n]` object — it is not computed by either tool, it is an existing API field the current `OrderDetailTpkSchema` (`adapter.ts`) does not declare and `classify.ts` does not extract.

Required changes:
- `OrderDetailTpkSchema` (`adapter.ts`): add `keyindex: z.union([z.string(), z.number()]).nullish()` (tolerant — real type unconfirmed, likely a number).
- `classify.ts`/`classifyOrder`: extract it the same way `steam_app_id` was added in Phase 12 — but **do not** put it on the public `HumbleKey` type sent over `humbleKeysUpdated`/`humbleGetKeys` (it has no display purpose and needlessly widens the IPC surface). Instead, either (a) keep an internal-only lookup map maintained alongside `humbleLibraryStore` that the reveal IPC handler reads directly (never serialized to the renderer), or (b) store it as an extra field on the cache entry's internal representation and strip it in a `toDisplaySafe()` projection function before any IPC push. Recommend (a) for minimal blast radius — a small backend-only `Map`/lookup rebuilt on every `classifyOrder` commit, analogous to how `humbleRevealedStore`'s `isRevealed` predicate is injected into `classifyOrder` without living on `HumbleKey`.
- Add fixtures with a real `keyindex` value (0 and non-zero) to `__tests__/fixtures/tpks.ts`, mirroring how Phase 12 added `steam_app_id: 0` / `''` fixtures for WR-01.

## Architecture Patterns

### System Architecture Diagram

```
Renderer (Keys-waiting tab)
  │
  │ user clicks "Claim" on a Keys-waiting row (D-67: this tab only)
  ▼
Wizard modal (showDialogModal, message=<HumbleClaimWizard>)
  │  Step 1: irreversibility warning (C1) — user must explicitly confirm
  ▼
IPC: humbleRevealKey({ gamekey, machineName })
  │
  ▼
Main process — reveal IPC handler (new, mirrors humbleSetOwnershipOverride's
re-validation shape)
  │
  ├─► 1. Look up target key in HumbleLibrary.getKeys() by (gamekey, machineName)
  │      — reject + log if not found / not UNREVEALED (renderer never trusted)
  │
  ├─► 2. C2 RE-CHECK (D-69, hard block): if ownedElsewhere === true (exact OR
  │      fuzzy, D-70) → return { status: 'owned_blocked' } — record a
  │      'c2_block' audit event (D-76) — NO reveal call, NO REVEALED flag.
  │      Renderer navigates to /humble-keys/spares.
  │
  ├─► 3. WRITE-AHEAD (Pitfall 1/8, before the network call):
  │        - humbleRevealedStore.set(key)         (existing Phase 11 store)
  │        - humbleAuditStore: append 'reveal_attempt' record (new, composite key)
  │
  ├─► 4. adapter.ts revealKey(cookie, csrfToken, { gamekey, machineName, keyindex })
  │        └─► C5 wall: POST /humbler/redeemkey, zod-validated response
  │
  ├─► 5a. SUCCESS → persist key value (new store/field, D-74) → audit
  │        outcome='success' → DIRECTLY patch cached HumbleKey.state to
  │        'REVEALED' in humbleLibraryStore (classifyOrder does not run
  │        between syncs — see "Direct cache-projection patch" below) →
  │        sendFrontendMessage('humbleKeysUpdated', getKeys())
  │
  ├─► 5b. DEFINITIVE FAILURE (4xx/5xx/schema_error) → ROLL BACK: delete the
  │        REVEALED flag written in step 3 → audit outcome='failed' →
  │        cached state was never touched, stays UNREVEALED → modal shows
  │        retryable error (D-78)
  │
  └─► 5c. AMBIGUOUS (network throw/timeout) → KEEP the REVEALED flag from
           step 3 (assume revealed) → audit outcome='ambiguous' → do NOT
           claim to have the key value (we don't) → next sync's
           classifyOrder reconciles the display state → see Open Questions
           for the UX gap this creates

Modal Step 2 (on success): key shown in plaintext + auto-copy (D-73) + "Open
Steam" (steam registerkey deep-link) OR "Redeem on {platform}" (D-68, non-Steam)
  │
  ▼
User clicks "Mark as redeemed" → IPC humbleMarkRedeemed({gamekey, machineName})
  │
  ▼
Main process: write local-redeemed-mark store (new) → audit 'mark_redeemed'
→ direct-patch cached state to 'REDEEMED' + set a `locallyRedeemedPending: true`
projection flag (new) → push humbleKeysUpdated
  │
  ▼
Row shows REDEEMED + "Undo" (D-77) — undo writes 'undo_redeemed' audit event,
deletes the local mark, direct-patches state back to 'REVEALED'. Undo
disappears automatically once a real sync sets redeemedKeyValuePresent=true
(server truth wins — classify.ts precedence, unchanged for that case).
```

### Recommended Project Structure

No new top-level folders — all additions extend existing modules:

```
src/backend/humble/
├── adapter.ts            # + humblePostRequest, + revealKey()
├── classify.ts            # + keyindex extraction, + isLocallyRedeemed precedence tier
├── electronStores.ts       # + humbleAuditStore, + humbleLocalRedeemedStore,
│                          #   + humbleRevealedKeyValueStore (all composite-keyed)
├── library.ts              # + revealKey/markRedeemed/undoRedeemed orchestration,
│                          #   + direct cache-projection patch helper
├── ipc_handler.ts          # + humbleRevealKey/humbleMarkRedeemed/humbleUndoRedeemed/
│                          #   humbleGetRevealedKeyValue handlers (server-side re-validation)
└── constants.ts            # + HUMBLE_REDEEM_URL (or path), reuse HUMBLE_REQUIRED_HEADERS

src/common/types/humble.ts  # + reveal/redeem result discriminated unions,
                            #   + locallyRedeemedPending?: boolean on HumbleKey

src/frontend/screens/Humble/Keys/
├── Waiting/index.tsx       # + Claim/Finish-activation button + wizard mount
└── components/
    └── HumbleClaimWizard/   # NEW — the stateful modal-body component (D-65)
        └── index.tsx
```

### Pattern 1: Server-side re-validation of renderer-supplied identity (already shipped twice — reuse verbatim)

**What:** Every existing write-style Humble IPC handler (`humbleSetOwnershipOverride`, `humbleRecordGiftLinkOpened`) re-looks-up the target key in `HumbleLibrary.getKeys()` and checks the specific precondition server-side, logging + no-op'ing on mismatch rather than trusting the renderer's button-gating.
**When to use:** The reveal, mark-redeemed, and undo-redeemed handlers all need this — C2's "hard block, not advisory" (SC2) is exactly this pattern applied to `ownedElsewhere`.
**Example:**
```typescript
// Source: src/backend/humble/ipc_handler.ts (existing, Phase 12/13) — reuse this shape
addHandler('humbleSetOwnershipOverride', async (e, machineName) => {
  const targetKey = HumbleLibrary.getKeys().find(
    (key) => key.machineName === machineName
  )
  if (!targetKey || targetKey.matchConfidence !== 'fuzzy') {
    logWarning(['Rejected ... for non-fuzzy machineName:', machineName], LogPrefix.Backend)
    return
  }
  HumbleLibrary.setOwnershipOverride(machineName)
})
```
Phase 14's reveal handler follows the identical shape, but keyed by `(gamekey, machineName)` composite (see Pattern 3) and checking `state === 'UNREVEALED' && !ownedElsewhere` before proceeding.

### Pattern 2: Write-ahead persistence before an irreversible external call (already shipped once — extend it)

**What:** `humbleRevealedStore` already exists specifically because Phase 11 anticipated this exact requirement (its own doc comment: "this store ... must survive a disconnect/reconnect cycle so a previously-revealed key never regresses to UNREVEALED"). PITFALLS.md Pitfall 1/8 spell out the precise ordering requirement: persist the flag (and the audit "attempt" record) to disk **before** the API call, so a crash between "Humble accepted the reveal" and "we recorded that" can never silently regress state.
**When to use:** Every reveal call, no exceptions — this is SC4's literal wording ("the audit record is written before the reveal API call").
**Example:**
```typescript
// New handler in ipc_handler.ts / orchestration in library.ts
async function revealKey(gamekey: string, machineName: string): Promise<RevealOutcome> {
  const target = findKey(gamekey, machineName)
  if (!target || target.state !== 'UNREVEALED') return { status: 'ineligible' }
  if (target.ownedElsewhere) {
    appendAudit(gamekey, machineName, 'c2_block')
    return { status: 'owned_blocked' }
  }

  // Write-ahead: BOTH before the network call.
  humbleRevealedStore.set(machineName, { revealedAt: Date.now() })
  appendAudit(gamekey, machineName, 'reveal_attempt')

  const result = await revealKeyAdapterCall(cookie, csrfToken, {
    gamekey, machineName, keyindex: lookupKeyindex(gamekey, machineName)
  })

  if (result.status === 'ok') {
    humbleRevealedKeyValueStore.set(compositeKey(gamekey, machineName), { key: result.data.key })
    appendAudit(gamekey, machineName, 'reveal_success')
    patchCachedState(gamekey, machineName, 'REVEALED')
    return { status: 'revealed', key: result.data.key }
  }
  if (result.status === 'schema_error' || result.status === 'access_denied') {
    // Definitive-enough per D-78 (access_denied is a real 403/429, not ambiguous)
    humbleRevealedStore.delete(machineName)
    appendAudit(gamekey, machineName, 'reveal_failed')
    return { status: 'failed' }
  }
  // session_expired or a thrown/transient error: D-78 "ambiguous" path — KEEP the flag.
  appendAudit(gamekey, machineName, 'reveal_ambiguous')
  return { status: 'ambiguous' }
}
```

### Pattern 3: Composite identity keys for new per-key stores (learn from 13-REVIEW WR-01, don't repeat it)

**What:** 13-REVIEW.md's WR-01 (already shipped, documented, not retroactively fixed) proves `machine_name` is **not** unique across two different Humble orders for the same game — the codebase's own `HumbleKeyGroup` component comment says so, and every row is already keyed in the renderer as `` `${gamekey}:${machineName}` ``. Phase 11's `humbleRevealedStore` and Phase 12's `humbleOwnershipOverrideStore` were both keyed by `machineName` alone, before this collision was documented; Phase 13's `humbleGiftedAtStore` repeated the mistake and 13-REVIEW caught it as WR-01.
**When to use:** Every **new** Phase 14 store (audit store, local-redeemed-mark store, revealed-key-value store) should key by the composite `` `${gamekey}:${machineName}` `` from day one — this is a one-line difference at store-creation time and avoids inheriting a known, already-documented defect class into brand-new code.
**Recommendation:** Do not attempt to retrofit `humbleRevealedStore`'s existing key scheme in this phase (that is a data-migration problem affecting already-persisted user state, out of the CONTEXT-locked scope) — but the new reveal/mark-redeemed IPC channels should accept **both** `gamekey` and `machineName` from the renderer (not machineName alone, unlike the two older channels) specifically so the composite-keyed lookups and stores can be correct from the start. Flag the pre-existing `humbleRevealedStore` machineName-only risk explicitly in the plan as an accepted, pre-existing limitation (same disposition as 13-REVIEW's WR-01/02/03: documented, not blocking, fixed only if cheap).

### Pattern 4: Direct cache-projection patch (mirrors Phase 12 WR-03's fix)

**What:** `HumbleKey.state`/`ownedElsewhere` inside `humbleLibraryStore` is normally only rewritten by `classifyOrder()` (full sync) or `recomputeOwnership()` (dedup pass) — both are periodic, not triggered by a single-key user action. Phase 12's WR-03 fix (already shipped) had to teach `setOwnershipOverride`/`clearOwnershipOverride` to patch `humbleLibraryStore` entries **directly** when the periodic recompute couldn't run (Steam disconnected) — the exact same problem Phase 14 has for reveal/redeem, which happen entirely outside any sync.
**When to use:** After a successful reveal, after mark-redeemed, and after undo-redeemed — each must locate the affected cache entry inside `humbleLibraryStore`, replace that one key's `state` (and, for redeem, the new `locallyRedeemedPending` flag), write the entry back, and call `sendFrontendMessage('humbleKeysUpdated', getKeys())`, exactly like `dedup.ts`'s WR-03 fix does for ownership fields.
**Example:**
```typescript
// Source: pattern extended from src/backend/humble/library.ts's WR-03 fix
// (12-REVIEW.md's suggested code) — same for reveal/redeem state patches.
function patchCachedState(gamekey: string, machineName: string, newState: HumbleKeyState) {
  const entry = humbleLibraryStore.get(gamekey)
  if (!entry) return
  const idx = entry.keys.findIndex((k) => k.machineName === machineName)
  if (idx === -1) return
  const keys = [...entry.keys]
  keys[idx] = { ...keys[idx], state: newState }
  humbleLibraryStore.set(gamekey, { ...entry, keys })
  sendFrontendMessage('humbleKeysUpdated', getKeys())
}
```

### Pattern 5: `classify.ts` precedence extension for the local-redeemed mark (D-77)

**What:** `classifyTpk`'s documented precedence (expiry > server `redeemed_key_value` > local REVEALED flag > default) needs one more tier for D-77's local "Mark as redeemed" — it must classify as REDEEMED (so the row/state model treats it the same as a server-confirmed redeem) but the **renderer** needs to know the difference so it can show the D-77 "Undo" affordance only for the locally-sourced case.
**Example:**
```typescript
// Extends src/backend/humble/classify.ts's classifyTpk — precedence unchanged
// at the top (expiry still wins), new tier inserted ABOVE isLocallyRevealed:
export function classifyTpk(
  tpk: { redeemedKeyValuePresent: boolean; expiration: string | null; isExpired?: boolean },
  isLocallyRevealed: boolean,
  isLocallyRedeemed: boolean,   // NEW
  now: Date = new Date()
): HumbleKeyState {
  if (tpk.isExpired || (tpk.expiration && new Date(tpk.expiration).getTime() <= now.getTime())) {
    return 'UNREDEEMABLE'
  }
  if (tpk.redeemedKeyValuePresent) return 'REDEEMED'   // server truth, undo never applies
  if (isLocallyRedeemed) return 'REDEEMED'             // NEW — D-77 local mark, undo applies
  if (isLocallyRevealed) return 'REVEALED'
  return 'UNREVEALED'
}
```
The renderer distinguishes the two REDEEMED origins via a new `locallyRedeemedPending?: boolean` field on `HumbleKey` (true only when classification came from the new local-mark tier, computed by the same caller that already threads `isRevealed` into `classifyOrder`).

### Pattern 6: Reusing `showDialogModal` for a multi-step wizard

**What:** `DialogModalOptions.message` is typed `string | React.ReactElement` (`src/frontend/types.ts`) and `MessageBoxModal` renders it as-is when `type` is not `'ERROR'`. This means a **stateful** React component can be passed as `message`, and it owns its own step index / loading / error state internally — no new modal infrastructure needed.
**Example:**
```typescript
// Source: existing src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.tsx
// confirms this is safe today:
//   const getContent = () => { ... default: return props.message ... }
// So:
showDialogModal({
  showDialog: true,
  title: t('humbleKeys.claimWizardTitle', 'Claim this key'),
  message: <HumbleClaimWizard humbleKey={key} onDone={() => showDialogModal({ showDialog: false })} />,
  buttons: [] // wizard renders its own step-appropriate actions inside `message`
})
```

### Anti-Patterns to Avoid
- **Auto-reveal on prefetch/import/cache-warm** (PITFALLS.md Pitfall 1) — the ONLY call site for `revealKey()` must be the one IPC handler behind explicit user confirmation. No loop over keys ever calls it.
- **Retrying the reveal call automatically on network error** — D-78's ambiguous-outcome handling exists precisely so the system never auto-resubmits a reveal that might have already succeeded server-side; any retry must be a fresh, explicit user action.
- **Exposing `keyindex` or the raw revealed key value on the broadcast `HumbleKey`/`humbleKeysUpdated` type** — both are either unnecessary (keyindex) or a C4 secret (key value); neither belongs in the type every renderer subscriber receives on every sync.
- **Trusting the renderer's `ownedElsewhere` at the moment of the reveal click** — D-69 exists specifically because that value can be stale (a Steam library refresh or Humble sync can flip it between render and click); the backend must re-read current state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-step modal/dialog chrome | A new modal/overlay system | `showDialogModal` + `MessageBoxModal`/`Dialog` (existing) | Already handles backdrop, close semantics, `disableDialogBackdropClose`, animations; `message: ReactElement` already supports arbitrary stateful content (confirmed by reading the component) |
| Clipboard access | Direct `navigator.clipboard` in the renderer | `window.api.clipboardWriteText`/`clipboardReadText` (existing IPC, backed by Electron's `clipboard` module in the main process) | Already used by Epic SID login; Electron's renderer-side clipboard access has sandboxing/permission quirks the main-process bridge avoids |
| Opening the Steam registerkey page / non-Steam redemption pages | A custom BrowserWindow or webview | `window.api.openExternalUrl` (existing listener → `shell.openExternal`/`openUrlOrFile`) | Already used by Phase 13's Spares gift deep-link for the identical "open an external humblebundle.com/steam URL" need |
| JSON response validation for the reveal endpoint | Manual field presence checks / `as` casts | `zod` `.passthrough()` schema, same discipline as every existing adapter schema | Matches C5's "never a blind cast of an untrusted response" rule already enforced everywhere else in `adapter.ts` |
| Bounded write-ahead persistence | A custom transaction/journal system | The existing `CacheStore` `.set()`/`.delete()` pattern, called in the specific before/after order the plan specifies | `electron-store` writes are synchronous to disk; the codebase's write-ahead pattern is already "call `.set()` before the async network call, `.delete()` on confirmed rollback" — no new infra needed, only correct call ordering |

**Key insight:** This phase's entire backend surface is a recombination of patterns already shipped in Phases 11-13 (write-ahead flag stores, server-side IPC re-validation, direct cache-projection patching, composite keys). The only genuinely new engineering risk is the undocumented HTTP contract itself — everything downstream of a successful/failed adapter call is assembling existing Lego bricks.

## Common Pitfalls

*(PITFALLS.md's Pitfalls 1, 2, 3, 4, 5, 8 already ground the phase's CONTEXT decisions — D-65 through D-80 exist specifically because of them. The pitfalls below are ones this research session surfaced that are NOT already fully resolved by the locked CONTEXT decisions.)*

### Pitfall A: CSRF-shaped failures will be misclassified as rate-limit denials
**What goes wrong:** If the reveal endpoint requires the `csrf-prevention-token`/`csrf_cookie` pairing (see "Reveal Endpoint Contract") and GameLib doesn't send it, Humble will most likely respond 403. `mapAxiosError` already turns any 403 into `access_denied`, and D-79 wires `access_denied` straight into the existing 15-minute cooldown (`HUMBLE_COOLDOWN_MS`). Every user's very first reveal attempt could silently "rate-limit" the whole feature for 15 minutes with no indication the real cause was a missing header.
**Why it happens:** The existing 401/403 mapping was designed for read endpoints where 403 genuinely only ever meant "Humble is denying us" (PITFALLS.md Pitfall 3). A write endpoint introduces a third possible 403 cause (CSRF rejection) that the current binary mapping cannot distinguish.
**How to avoid:** Capture and send the `csrf_cookie` value (see recommendation above) BEFORE relying on the existing `access_denied` cooldown semantics; validate live with a real key before shipping; if the live checkpoint shows a 403 with a CSRF-shaped `error_msg`, add a distinct `AdapterResult` status (e.g. `'csrf_error'`) that surfaces as "please reconnect your Humble account" rather than a rate-limit cooldown.
**Warning signs:** A live test reveal returns 403 on the very first attempt (before any real rate-limit could plausibly have been hit) — check `error_msg` content, don't assume it's C3 rate-limiting.

### Pitfall B: Ambiguous-outcome reveals leave "Finish activation" without a key to finish with
**What goes wrong:** D-78's ambiguous-outcome path deliberately keeps the REVEALED flag on a network timeout, "assuming revealed." D-66 promises "Finish activation" never triggers a second reveal call because "the key value is already local per D-74." But on the ambiguous path, the key value was **never received** — there is nothing local to show. If the modal naively reopens at the post-reveal step, it has no key string to display, copy, or activate with.
**Why it happens:** D-78 and D-66 were written to cover the common cases (definitive success, definitive failure) — the ambiguous case is a genuine three-way split the CONTEXT decisions don't fully resolve, and it's easy to miss because "REVEALED flag present" is being used as a stand-in for "key value present," which is only true on the success path.
**How to avoid:** Distinguish, in the REVEALED-flag store or a sibling field, "revealed with known key value" vs "revealed, key value unconfirmed" (the latter only occurs via the ambiguous path). "Finish activation" for the unconfirmed case should show a distinct message ("We couldn't confirm this reveal completed — sync to check") with a manual sync trigger, rather than either silently failing to render a key or, worse, calling `revealKey` a second time (which C1/D-66 explicitly forbid). See Open Questions — this needs an explicit planning decision, not just an implementation detail.

### Pitfall C: `keyindex` absence on already-cached (pre-Phase-14) orders
**What goes wrong:** Every order already synced by an existing GameLib install (Phases 11-13) was classified without ever reading `keyindex` — if Phase 14 ships and a user's next "Claim" click is against a key whose order was cached *before* this phase's `HUMBLE_CLASSIFIER_VERSION` bump, the lookup for `keyindex` will find nothing.
**Why it happens:** Exactly the same class of bug the codebase already hit and fixed for `steam_app_id` in Phase 12 (`HUMBLE_CLASSIFIER_VERSION` bump forces a one-time full re-fetch+re-classify so every cached row backfills the new field) — and already has the fix pattern in place.
**How to avoid:** Bump `HUMBLE_CLASSIFIER_VERSION` (currently `3`) to `4` when adding `keyindex` extraction, exactly as Phase 12 did for `steam_app_id`. Additionally, defensively disable/hide the "Claim" button (or show a "sync to enable" state) for any UNREVEALED key whose cached entry lacks a resolvable `keyindex`, since a reveal call with a missing/undefined `keyindex` would either fail server-side or (worse) silently target the wrong tpk.
**Warning signs:** A "Claim" click on an old-cache row does nothing or throws — check whether the order was re-classified since the version bump.

### Pitfall D: Reveal call racing a concurrent Humble sync
**What goes wrong:** `library.ts`'s `sync()` freely rewrites `humbleLibraryStore` entries during a sync (progressive commit per order, per the existing `D-26`/`D-34` comments). A reveal/redeem's direct cache-projection patch (Pattern 4) reads-modifies-writes the same store keyed by `gamekey`. If a sync is mid-flight and commits a fresh `classifyOrder()` result for the SAME gamekey between the reveal handler's read and its write, the reveal's patch will stomp the sync's fresher data (or vice versa) — a classic read-modify-write race, on a store this codebase already treats carefully elsewhere (the `syncFence.ts` generation-counter exists for exactly this class of problem, but currently only fences sync-vs-disconnect, not sync-vs-reveal).
**Why it happens:** This phase introduces the first non-sync writer of `humbleLibraryStore` entries at a granularity below "recompute everything" (dedup.ts's `recomputeOwnership` also writes per-entry, but always AFTER a sync's own writes complete in sequence, never concurrently with one).
**How to avoid:** D-79 already serializes reveals to "one in-flight at a time," which helps but does not address a reveal racing an *unrelated* concurrent Humble sync. Recommend gating: either (a) the reveal handler checks `syncInFlight`-equivalent state and defers/rejects with a "sync in progress, try again in a moment" response, or (b) the patch re-reads the entry immediately before writing (already the pattern) and this is accepted as a narrow, low-probability window not worth blocking on for v1.2 — but the plan should make an explicit choice here rather than leaving it implicit.
**Warning signs:** A reveal patch is silently overwritten by a sync's `classifyOrder` commit for the same gamekey landing microseconds later (would manifest as a briefly-correct-then-reverted UI state, hard to reproduce in manual testing).

## Code Examples

### Reveal adapter function (new, adapter.ts)
```typescript
// Source: contract researched from FailSpy/humble-steam-key-redeemer +
// GreasyFork "Humble Bundle Auto Redeem" (cross-verified, non-official —
// MUST be confirmed via a live checkpoint before shipping, see Open Questions).
const RevealResponseSchema = z
  .object({
    success: z.boolean().nullish(),
    key: z.string().nullish(),
    error_msg: z.string().nullish()
  })
  .passthrough()

export async function revealKey(
  cookie: string,
  csrfToken: string | undefined,
  params: { gamekey: string; machineName: string; keyindex: string | number }
): Promise<AdapterResult<{ key: string }>> {
  try {
    const body = new URLSearchParams({
      keytype: params.machineName,   // naming trap: NOT the platform label
      key: params.gamekey,
      keyindex: String(params.keyindex)
    }).toString()
    const headers = {
      ...HUMBLE_REQUIRED_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `_simpleauth_sess=${cookie}`,
      ...(csrfToken ? { 'csrf-prevention-token': csrfToken } : {})
    }
    const res = await axios.post(
      `${HUMBLE_BASE_URL}/humbler/redeemkey`,
      body,
      { headers, timeout: REQUEST_TIMEOUT_MS }
    )
    const parsed = RevealResponseSchema.safeParse(res.data)
    if (!parsed.success) {
      return { status: 'schema_error', raw: res.data }  // never log res.data (C4)
    }
    if (parsed.data.success !== true || !parsed.data.key) {
      // error_msg is intentionally NEVER logged verbatim if it could echo a
      // key value; log presence/length only, matching describeSchemaFailure's
      // redaction discipline.
      return { status: 'schema_error', raw: undefined }
    }
    return { status: 'ok', data: { key: parsed.data.key } }
  } catch (err) {
    return mapAxiosError<{ key: string }>(err)
  }
}
```

### Non-Steam redemption link-out (HCLAIM-05)
```typescript
// D-68: same wizard, swapped final step. `platform` already exists on HumbleKey
// (derived from key_type, D-28) — no new capability needed, just branching UI.
const isSteam = humbleKey.platform === 'steam'
// ... after reveal:
{isSteam ? (
  <button onClick={() => window.api.openExternalUrl(
    `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(revealedKey)}`
  )}>
    {t('humbleKeys.openSteam', 'Open Steam')}
  </button>
) : (
  <button onClick={() => window.api.openExternalUrl(platformRedeemUrl(humbleKey.platform))}>
    {t('humbleKeys.redeemOnPlatform', 'Redeem on {{platform}}', { platform: humbleKey.platform })}
  </button>
)}
<button onClick={() => window.api.clipboardWriteText(revealedKey)}>
  {t('humbleKeys.copyKey', 'Copy key')}
</button>
```
Note: `platformRedeemUrl` (mapping `platform` → a redemption page per non-Steam store) is not researched here — no existing per-platform redemption URL table exists in the codebase or the spec docs. This is an **Open Question** (below): the simplest, most defensible option is a generic "search {{platform}}'s activation page" copy pointing users to redeem manually, since no authoritative source enumerates every Humble `key_type` → redemption-URL mapping and guessing wrong risks sending users to a broken/wrong link for a real secret.

## State of the Art

| Old Approach (pre-Phase-14) | Current Approach (this phase) | When Changed | Impact |
|--------------------------|-------------------------------|---------------|--------|
| Humble adapter is read-only (`getGamekeys`/`getOrderDetail`/`getAccountIdentity`) | Adds the first write-style call (`revealKey`) | This phase | New failure modes (partial success, CSRF, rate-limit-vs-auth ambiguity) that read-only calls never had to distinguish |
| `HumbleKey.state` only changes via full sync (`classifyOrder`) or dedup recompute | Direct, single-key cache-projection patches outside any sync (Pattern 4) | This phase (extends Phase 12's WR-03 precedent) | Requires care around races with a concurrent sync (Pitfall D) |
| Per-key stores keyed by `machineName` alone (Phases 11-13) | New Phase 14 stores keyed by composite `gamekey:machineName` | This phase (informed by 13-REVIEW WR-01) | New stores are collision-safe from day one; pre-existing stores remain a documented, accepted limitation |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The reveal endpoint is `POST https://www.humblebundle.com/humbler/redeemkey` with form body `keytype`/`key`/`keyindex` and JSON response `{success, key, error_msg}` | Reveal Endpoint Contract | HIGH if wrong: the entire reveal call fails; mitigated by the mandatory live-validation checkpoint recommended in this doc before wiring the UI |
| A2 | The endpoint requires a `csrf-prevention-token` header sourced from a `csrf_cookie` cookie, and GameLib's login flow must start capturing that cookie | Reveal Endpoint Contract | MEDIUM: if actually not required, the extra capture/header is harmless; if required and NOT implemented, every reveal 403s and gets misclassified as a rate-limit cooldown (Pitfall A) |
| A3 | `keyindex` is a raw field on each `tpkd_dict.all_tpks[n]` object (not derived) | Reveal Endpoint Contract / Code Examples | HIGH if wrong: reveal calls would need a different identity parameter entirely; both independent sources agree it's a passthrough field, giving moderate confidence, but neither is Humble's own documentation |
| A4 | Humble's response to an "already owned" Steam activation is a Steam-side signal, not something Humble's `redeemkey` endpoint itself reports — i.e., C2 must be enforced entirely client-side (GameLib's own ownership data) BEFORE calling reveal, because Humble's reveal endpoint has no concept of "you already own this on Steam" | Architecture Patterns (C2 guard) | LOW — this matches every reference implementation's design (ownership checked locally against a separate Steam library, never delegated to Humble) and is consistent with PITFALLS.md Pitfall 2's framing |
| A5 | No authoritative per-`key_type` redemption-URL table exists for non-Steam platforms (Epic/GOG/Ubisoft/Battle.net/etc.) | Code Examples (HCLAIM-05) | MEDIUM: shipping a wrong/guessed URL per platform could send users to a broken page for handling a real secret; recommend generic copy instead of guessed URLs unless the plan finds a specific need |

**None of these are HIGH-confidence-verified facts** — every one should be treated as needing a live-validation checkpoint (A1-A3) or an explicit planning decision (A4-A5), not assumed true at plan time.

## Open Questions

1. **What exactly should "Finish activation" show for an ambiguous-outcome REVEALED key with no locally-known key value?** (Pitfall B)
   - What we know: D-78 keeps the REVEALED flag on ambiguous outcomes; D-66 assumes the key value is always locally available for "Finish activation."
   - What's unclear: these two decisions conflict in exactly this one case, which CONTEXT does not explicitly resolve.
   - Recommendation: track "key value known" as a distinct piece of state from "REVEALED flag set"; show a "confirming with Humble — sync now" affordance instead of either a blank field or a forbidden second reveal call. This should be resolved explicitly during planning, not left to implementation-time improvisation.

2. **Does the `humbler/redeemkey` endpoint actually require CSRF, and under what exact cookie/header names, in 2026?**
   - What we know: one 2021-era tool demonstrates it; a separate in-page userscript doesn't need it (different execution context).
   - What's unclear: whether Humble still enforces this at all, whether the cookie name is still `csrf_cookie`, and whether the header name is still `csrf-prevention-token`.
   - Recommendation: mandatory live-validation checkpoint (`checkpoint:human-verify`) with a real account and a disposable UNREVEALED key before the reveal button is wired to any production UI path. Budget a fallback: if the plain `_simpleauth_sess`-only request works without CSRF, drop the extra capture entirely rather than carrying dead code.

3. **What should the non-Steam "Redeem on {platform}" link-out actually link to?**
   - What we know: HCLAIM-05 requires a link-out + copy-key, no one-click activation.
   - What's unclear: no source (spec docs, PITFALLS.md, or this research) enumerates a Humble `key_type` → redemption-URL table for Epic/GOG/Ubisoft/Battle.net/etc.
   - Recommendation: default to generic copy ("Copy this key and redeem it on {{platform}}'s site") without a guessed deep-link, or link to a neutral "how to redeem a {{platform}} key" help concept, rather than fabricating platform URLs this research cannot verify.

4. **Should the pre-existing `humbleRevealedStore`/`humbleOwnershipOverrideStore` (machineName-only keying) be migrated to composite keys in this phase, given Phase 14 is the first phase where a machineName collision could cause real, expensive harm (a wasted key)?**
   - What we know: 13-REVIEW's WR-01 documents the exact collision risk; CONTEXT's Discretion section explicitly defers this decision to the researcher/planner.
   - What's unclear: how common duplicate-order-for-the-same-game actually is among real users (no telemetry), and whether a migration is cheap enough to justify in this phase vs. accepted as a documented limitation.
   - Recommendation: accept as a documented limitation for `humbleRevealedStore` in this phase (matches 13-REVIEW's own disposition for its WR-01/02/03), but ensure ALL new Phase 14 stores use composite keys so the collision surface does not grow.

## Environment Availability

No new external tool/runtime/service dependency is introduced by this phase — it operates entirely within the existing Humble/Steam/Electron stack already validated in Phases 10-13. Skipped per the section's own skip condition.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (`ts-jest` preset), two projects: `src/backend`, `src/frontend` |
| Config file | `jest.config.js` (root) |
| Quick run command | `pnpm jest src/backend/humble/__tests__/<file>.test.ts` (targeted) |
| Full suite command | `pnpm test` (616/616 passing as of Phase 13's verification) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HCLAIM-01 | Reveal never fires without explicit confirmation; no reveal-all code path exists | unit + static grep | `pnpm jest src/backend/humble/__tests__/library.test.ts` + a code-search assertion (grep for all call sites of the new `revealKey` adapter function, assert exactly one) | ❌ Wave 0 — new test file/section needed |
| HCLAIM-02 | C2 backend re-check blocks reveal for `ownedElsewhere === true` (exact and fuzzy) | unit | `pnpm jest src/backend/humble/__tests__/library.test.ts -t "C2"` | ❌ Wave 0 |
| HCLAIM-03 | Successful reveal triggers clipboard write + external URL open with correct `registerkey?key=` value | unit (pure URL-building helper) + manual/UAT for actual clipboard/external-open | `pnpm jest src/backend/humble/__tests__/<new file>.test.ts` | ❌ Wave 0 |
| HCLAIM-04 | Audit record written before the adapter call; survives disconnect; records reveal/redeem/undo/C2-block events | unit | `pnpm jest src/backend/humble/__tests__/electronStores.test.ts` (extend existing disconnect-survival pattern) + `library.test.ts` (write-ahead ordering, mock adapter to control resolve timing) | ❌ Wave 0 |
| HCLAIM-05 | Non-Steam keys never show a one-click-activation button, only link-out + copy | unit (component/pure-helper) | `pnpm jest src/frontend --testPathPattern=HumbleClaimWizard` | ❌ Wave 0 |
| D-78 (write-ahead rollback) | Definitive failure rolls back REVEALED flag; ambiguous failure keeps it | unit | `pnpm jest src/backend/humble/__tests__/library.test.ts -t "rollback"` | ❌ Wave 0 |
| D-77 (undo redeem) | Undo works pre-sync-confirmation, disappears post-sync-confirmation | unit | `pnpm jest src/backend/humble/__tests__/classify.test.ts -t "isLocallyRedeemed"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `pnpm jest <touched file>.test.ts`
- **Per wave merge:** `pnpm test` (full 616+ suite) and `pnpm codecheck`
- **Phase gate:** full suite green + a dedicated live-validation checkpoint (see Open Questions #2) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/backend/humble/__tests__/adapter.test.ts` (or extend existing coverage) — `revealKey()` schema validation, error-status mapping, redacted-logging assertions (no key value in any logged output)
- [ ] `src/backend/humble/__tests__/library.test.ts` — extend with reveal/redeem/undo orchestration, C2 re-check, write-ahead ordering, rollback-vs-keep-on-failure-type
- [ ] `src/backend/humble/__tests__/classify.test.ts` — extend `classifyTpk` tests for the new `isLocallyRedeemed` precedence tier
- [ ] `src/backend/humble/__tests__/electronStores.test.ts` — extend disconnect-survival tests for the 2-3 new stores
- [ ] A new frontend test file for `HumbleClaimWizard` (first frontend component test for the claim flow specifically — the frontend jest project already exists per Phase 12, per IN-05 fix `testMatch: ['**/__tests__/**/*.test.ts?(x)']`)
- [ ] A `checkpoint:human-verify` task (not an automated test) for the live reveal-endpoint validation described in Open Questions #2 — this cannot be automated since it requires a real Humble account and consumes one real, disposable key

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (session already established in Phase 10) | N/A — reuses existing `_simpleauth_sess` handling; only extends it to (possibly) also capture `csrf_cookie` |
| V3 Session Management | Yes (new cookie capture) | Same `safeStorage`-gated encryption + `HUMBLE_TOKEN_PREFIX`-style storage discipline already used for `_simpleauth_sess`, applied identically to any new `csrf_cookie` capture |
| V4 Access Control | Yes (C2 guard) | Server-side (main-process) re-validation of the reveal precondition — never trust the renderer's view-membership filtering alone (D-69, ASVS V4.1-style "enforce on the server") |
| V5 Input Validation | Yes | `zod` `.passthrough()` schema on the reveal response (existing C5 pattern); `gamekey`/`machineName` from the renderer are looked up against the live key set, never interpolated directly into a URL/query without validation (mirrors the existing `encodeURIComponent(gamekey)` discipline in `getOrderDetail`) |
| V6 Cryptography | Yes (secrets at rest) | Revealed key values are now a NEW class of persistent secret (unlike the session cookie, PITFALLS.md doesn't mandate encryption for these specifically, but the same `safeStorage` pattern used for the session cookie is a reasonable, low-cost extension worth flagging to the planner as a discretionary hardening — see below) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Revealed key value logged accidentally (e.g. in an error path that stringifies the full adapter response) | Information Disclosure | Redacted logging discipline already enforced everywhere else in `adapter.ts` — the new `revealKey()` function must NEVER log `res.data`/`parsed.data` verbatim; only status/length, matching `describeSchemaFailure`'s existing pattern |
| Revealed key value pushed to the renderer as part of the routine `humbleKeysUpdated`/`HumbleKey` broadcast | Information Disclosure | Keep the key value OFF the `HumbleKey` type entirely; expose it only via a narrow, on-demand IPC call (`humbleGetRevealedKeyValue(gamekey, machineName)`) invoked only while the wizard modal is actually open at the post-reveal step |
| Renderer-forged "this key is not owned elsewhere" claim used to bypass C2 | Tampering / Elevation of Privilege | D-69's mandatory backend re-check — this is the phase's single most safety-critical control; must be implemented before any UI wiring, and unit-tested with an explicit "renderer says unowned, backend says owned" adversarial test case |
| CSRF token (if required) captured but then itself logged or sent over IPC to the renderer unnecessarily | Information Disclosure | Same discipline as the session cookie: main-process-only, encrypted at rest via `safeStorage`, never included in any `sendFrontendMessage` payload |
| A definitive-vs-ambiguous failure misclassification silently re-attempts a reveal (violates C1's "never a second reveal call" via a code path other than an explicit user click) | Repudiation / Tampering | D-78's explicit distinction must be implemented as written — no generic retry wrapper around the reveal call anywhere in the stack (this is the exact shape of PITFALLS.md Pitfall 1's warning about "a retry wrapper around the reveal API call") |

## Sources

### Primary (HIGH confidence)
- `package.json` (read directly) — confirms `axios@^1.13.5`, `zod@^3.24.3`, `electron@^41.1.1` already present, no new installs needed
- Direct reads of the existing codebase: `src/backend/humble/{adapter,classify,dedup,library,electronStores,user,syncFence,ipc_handler,constants}.ts`, `src/preload/api/humble.ts`, `src/common/types/{humble,ipc}.ts`, `src/frontend/screens/Humble/Keys/**`, `src/frontend/types.ts`, `src/frontend/components/UI/DialogHandler/**` — every architecture pattern and code example above is grounded in what is actually shipped, not assumed

### Secondary (MEDIUM confidence)
- [FailSpy/humble-steam-key-redeemer](https://github.com/FailSpy/humble-steam-key-redeemer) — `redeem_humble_key()`/`perform_post()` source, fetched and quoted verbatim — reveal URL, form params (`keytype`/`key`/`keyindex`), response shape (`success`/`key`/`error_msg`), and CSRF header/cookie usage
- [GreasyFork "Humble Bundle Auto Redeem" userscript](https://greasyfork.org/en/scripts/441728-humble-bundle-auto-redeem/code) — independent confirmation of the same URL/params, no CSRF handling shown (different execution context)
- `.planning/research/PITFALLS.md` and `.planning/research/HUMBLE-SPEC-SOURCE.md` (project-local, pre-existing research artifacts) — grounded the CONTEXT.md decisions this research builds on; re-read in full for this session
- `.planning/phases/12-ownership-dedup/12-REVIEW.md`, `.planning/phases/13-keys-waiting-giftable-spares-views/13-REVIEW.md` + `13-VERIFICATION.md` — WR-01/WR-04 (Phase 12) and WR-01 (Phase 13, machineName collision) directly inform this phase's D-71 fix scope and the composite-key recommendation

### Tertiary (LOW confidence)
- The CSRF cookie name (`csrf_cookie`) and header name (`csrf-prevention-token`) — single-source (FailSpy, ~2021-era), not independently corroborated, not official documentation; flagged for mandatory live validation (Assumption A2, Open Question 2)
- Community discussion of Steam's ~10-failed-activation/hour and ~50-successful/hour rate limits (already cited in PITFALLS.md, not re-verified in this session — carried forward as-is)

## Metadata

**Confidence breakdown:**
- Standard stack / no-new-dependencies: HIGH — directly confirmed via `package.json` and existing call sites
- Architecture patterns (server-side re-check, write-ahead, direct cache-patch, composite keys): HIGH — every pattern is copied from already-shipped, already-reviewed code in this exact codebase
- Reveal/redeem HTTP contract (URL, params, response shape): MEDIUM — cross-verified across two independent community tools, but neither is official Humble documentation
- CSRF requirement specifically: LOW — single source, pre-dates this research by several years, requires live validation
- Pitfalls/security: HIGH for the domain-general pitfalls (already validated by the project's own PITFALLS.md and two prior code reviews), MEDIUM for the phase-specific new pitfalls (B, C, D) identified in this session, which are reasoned from the codebase's own architecture rather than externally verified

**Research date:** 2026-07-07
**Valid until:** ~7 days for the reveal endpoint contract specifically (undocumented API, no changelog, prior incidents of silent breakage per PITFALLS.md Pitfall 5/3 — re-verify immediately before implementation if more than a few days pass); ~30 days for the architecture/pattern guidance (stable, grounded in already-shipped code)
