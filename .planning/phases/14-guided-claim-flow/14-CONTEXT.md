# Phase 14: Guided Claim Flow - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Users safely reveal and activate Humble Steam keys through a guided, per-key claim flow:
explicit reveal behind an irreversibility warning (C1, no auto-reveal, no "reveal all"
anywhere), a backend-enforced C2 guard that intercepts already-owned games and routes to
Giftable Spares, clipboard copy + `store.steampowered.com/account/registerkey?key=`
deep-link + "Mark as redeemed" confirmation (HCLAIM-03), a write-ahead local audit log
(HCLAIM-04), and "Redeem on {platform}" link-out for non-Steam keys (HCLAIM-05).

Delivers HCLAIM-01..05. This phase introduces the **first write-style Humble API call**
in the codebase (the reveal request) — it goes through `adapter.ts` like everything else
(C5). No store overlay, no expiration alerts/OS notifications (Phase 15). Humble remains
a keys domain, NOT a Runner (locked v1.2 decision).

**Pre-phase gates:** (1) Phase 13 is `gaps_found` — CR-01 (urgency-badge 24–48h date
math) must close before Phase 14 ships on top of it; the fix is small and already
specified in 13-REVIEW.md. (2) The Phase 12 WR-01..04 accept-or-remediate decision due
before this phase is RESOLVED here as D-71.

</domain>

<decisions>
## Implementation Decisions

> Numbering continues from Phase 13 (D-49..D-64) to keep v1.2 decision IDs unambiguous.

### Claim flow shape
- **D-65:** The flow runs in a **modal wizard**: a "Claim" button on the key row opens a
  single modal walking warning → reveal → key copied + "Open Steam" → "Mark as redeemed".
  One controlled surface carries the C1 warning and completion; reuses the app's existing
  Dialog components and matches the D-58 confirm-dialog friction pattern.
- **D-66:** **REVEALED-but-unredeemed rows resume at the post-reveal step**: the row swaps
  "Claim" for **"Finish activation"**, which reopens the modal directly at the
  key + Open Steam + Mark-redeemed step — no warning replay, and **never a second reveal
  call** (the key value is already local per D-74).
- **D-67:** The Claim/Finish action renders **in the Keys-waiting tab only**, mirroring
  D-60's one-view-one-action symmetry. All-keys rows stay D-22 read-only; C2 has a single
  UI entry point to guard.
- **D-68:** **Non-Steam keys use the same wizard with the activation step swapped**
  (HCLAIM-05): warning → reveal → key copied, then "Redeem on {platform}" opens that
  platform's redemption page instead of the Steam registerkey deep-link. "Mark as
  redeemed" still closes the loop and feeds the audit log. One flow, one audit path.

### C2 guard (owned-game interception)
- **D-69:** C2 is enforced by a **backend re-check inside the reveal IPC handler** —
  `ownedElsewhere` is re-validated against current data at call time, **before** the
  write-ahead audit record and the API request. An owned verdict returns a typed
  "owned → go to spares" result that the modal turns into `navigate()` to the Phase 13
  spares sub-route. UI view-membership filtering is the first line; the backend check is
  the guarantee (SC2 "hard block, not an advisory" — closes the stale-row race where a
  sync/Steam-refresh recompute flips ownership between render and click).
- **D-70:** **Fuzzy "Likely owned" matches block exactly like exact AppID matches.** The
  escape hatch is the existing D-42 "Not the same game" override on the Spares row, which
  moves the key back to Keys waiting where Claim works. One guard, one escape hatch, no
  claim-anyway bypass branch. (D-41's persisted provenance still matters: it powers the
  "Likely owned" labeling that tells the user the override applies.)
- **D-71 (WR gate resolution):** **Fix WR-01 and WR-04 inside Phase 14; accept WR-02 and
  WR-03 as documented.** Rationale: D-70 makes the override load-bearing for claiming —
  WR-01 (falsy `steam_app_id` skips both match tiers) mis-sorts keys the guard trusts,
  and WR-04 (no undo-override UI) makes a mistaken override — now the sanctioned claim
  path — irreversible, leaving a truly-owned key claimable forever. WR-02 (numeric-sequel
  fuzzy false-positives) is inherent to fuzzy matching and mitigated by the badge +
  override; WR-03 (override inert while Steam disconnected) is protected by D-48
  keep-last-known.
- **D-72:** **C2 gates the reveal only.** "Finish activation" always works for REVEALED
  keys — blocking it would strand a key that can be neither claimed nor gifted (spec §2.1:
  reveal forfeits the gift link; D-55 keeps owned+REVEALED out of Spares). If the game is
  owned at the finish step, show a **passive note** ("You already own this on Steam —
  activation will likely fail there") but never block. Steam is the final arbiter of
  duplicate activation.

### Key exposure & audit
- **D-73:** Post-reveal, the modal shows the **full key string in plaintext with a re-copy
  button** (alongside the HCLAIM-03 auto-copy). The user needs a manual-paste fallback;
  C4 targets logs and IPC debug payloads, not the user's own screen. Matches Humble's own
  post-reveal display.
- **D-74:** The revealed key value **persists into the existing per-key cache entry** —
  the same store that already holds `redeemed_key_value` for REDEEMED keys after sync (no
  new secret-surface class). "Finish activation" works across restarts with zero extra
  Humble requests; the next sync would populate the same field anyway.
- **D-75:** The audit log is a **backend store surfaced only as per-row annotations** —
  "revealed {date}" / "redeemed {date}" on the row/modal, following the D-59
  "gift link copied {date}" precedent. No full audit-viewer surface this phase.
- **D-76:** Audit records hold **identity + outcome, never the key value** (C4):
  `machineName`, human title, platform, event type, timestamp, outcome. Events recorded:
  **reveal attempt (write-ahead, per SC4) → outcome update (success / API-fail),
  mark-redeemed, undo events, and C2 blocks** (blocks are cheap to record and diagnostic
  gold when the guard misfires on a fuzzy false-positive). Per Phase 10 D-04 the audit
  store **survives disconnect**.

### Redeem confirmation & failure handling
- **D-77:** **"Mark as redeemed" is undoable while REDEEMED rests solely on the local
  mark** — undo flips the key back to REVEALED and writes an audit event. Once a Humble
  sync returns `redeemed_key_value`, the key is genuinely REDEEMED and the undo
  affordance disappears (server truth wins — mirrors D-30's classification precedence).
  **Superseded by Phase 14 gap closure (14-07) — see PROJECT.md D-30 amendment:
  redeemed_key_val presence means REVEALED, REDEEMED is local-only.**
- **D-78:** The write-ahead REVEALED flag **rolls back on confirmed failure only**: a
  definitive API error (4xx/5xx response, schema error) clears the flag — key stays
  UNREVEALED, audit outcome "failed", modal shows a retryable error. An **ambiguous
  outcome (timeout, dropped connection) keeps the flag** — assume revealed, let the next
  sync reconcile. Conservative exactly where it must be (never regress a real reveal —
  the D-30 invariant), honest everywhere else (never forfeit gift-ability of an untouched
  key on a plain network error).
- **D-79:** Pacing is **serial + denial cooldown** (C3): one in-flight reveal at a time —
  the wizard is inherently serial and its own friction is the throttle — plus a Humble
  403/429 on reveal triggers the existing D-33-style cooldown gating further reveals
  ("temporarily unavailable — retry in Nm"). No artificial timer between successful
  claims.
- **D-80:** **No active nudges** for REVEALED-but-unconfirmed keys beyond the passive row
  state (Finish-activation button + revealed-date annotation). No banners, toasts, or
  notifications — D-31's "background states aren't interruption-worthy" philosophy;
  Phase 15 owns alerting.

### Claude's Discretion
- **Reveal endpoint contract** — researcher must identify Humble's reveal/redeem request
  (the classic `humbler/redeemkey` form post or current equivalent) and spec it as a new
  `adapter.ts` function behind `AdapterResult`, with redacted logging (key values never
  logged, C4) and the X-Requested-By header discipline. Distinguishing "definitive
  failure" from "ambiguous outcome" for D-78 falls out of this contract.
- **UNPICKED Choice-month pseudo-entries** (D-27) sit in Keys waiting but have no key to
  reveal — presumably their action is a link-out to `choice_url` to pick on Humble, or no
  action this phase. Researcher/planner decides; do not let them enter the reveal wizard.
- **Key-identity edge**: 13-REVIEW warns machineName alone can collide when the same game
  arrives via two orders — decide whether audit/cache keying needs a
  `gamekey+machineName` composite (same disposition as Phase 13's WR-01).
- **D-24 freeze interaction**: marking a key REDEEMED locally may make its order
  all-terminal and freeze it from re-fetch — confirm the local mark still gets reconciled
  (or intentionally isn't) and that undo (D-77) behaves with a frozen order.
- Exact wizard step layout/copy, C1 warning wording, i18n keys in the **consumed**
  namespace (Phase 10 WR-08), Dialog component composition.
- Audit store shape/location in `electronStores.ts` (joins the D-04 wipe exemption
  alongside REVEALED flags, overrides, gifted-at).
- WR-01 fix approach (falsy-`steam_app_id` handling in `dedup.ts`) and WR-04
  undo-override affordance placement/copy.
- 403-cooldown duration reuse, retry UX on failed reveal, outcome vocabulary for audit
  records, undo affordance placement (row vs toast vs modal).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 14: Guided Claim Flow" — goal + 5 success criteria
  (per-key confirmation, C2 hard block, clipboard+registerkey+mark-redeemed, write-ahead
  audit, non-Steam link-out).
- `.planning/REQUIREMENTS.md` § "Humble Guided Claim" — HCLAIM-01..05 wording.

### Claim-flow model & constraints
- `.planning/research/HUMBLE-SPEC-SOURCE.md` — §2.1 (state detection; reveal is
  DESTRUCTIVE — forfeits gift link), §2.2 (transitions), §2.4 (key attributes incl.
  `revealed_at`), F5 (guided claim flow definition), F7 (non-Steam handling), C1 (never
  auto-reveal), C2 (owned-game intercept), C3 (user-initiated + throttled), C4 (key
  strings are secrets — never logged), C5 (adapter isolation), C6 (auditable actions),
  ToS grey-zone note. THE reference for flow semantics.
- `.planning/research/PITFALLS.md` — C5 access-denial history (Lutris lockouts) and the
  Steam-side ~10-failed-activations/hr lockout heuristic behind C3.

### Prior-phase decisions that bind this phase
- `.planning/phases/13-keys-waiting-giftable-spares-views/13-CONTEXT.md` — D-51 (spares
  sub-route = the C2 redirect target), D-53 (REVEALED keys stay in Keys waiting — the
  Finish-activation rows), D-55 (owned+REVEALED excluded from Spares — why D-72 never
  blocks the finish step), D-58 (confirm-dialog friction pattern D-65 follows), D-60
  (one-view-one-action symmetry D-67 mirrors).
- `.planning/phases/12-ownership-dedup/12-CONTEXT.md` — D-41 (fuzzy provenance +
  "treat fuzzy gently" intent D-70 resolves), D-42 (override = the escape hatch), D-43
  (override survives disconnect), D-44 (AppID verdict final), D-48 (keep-last-known
  ownership — the C2 guard's data can be stale-but-safe).
- `.planning/phases/11-library-sync-5-state-key-model/11-CONTEXT.md` — D-24 (frozen
  terminal orders — interacts with local REDEEMED marks), D-30 (write-ahead REVEALED
  flag store + classification precedence that D-77/D-78 extend), D-33 (403 cooldown
  machinery D-79 reuses).
- `.planning/phases/10-humble-auth-adapter-scaffold/10-CONTEXT.md` — D-04 (disconnect-wipe
  exemption the audit log joins), D-14 (axios transport seam).

### Open findings this phase consumes or resolves
- `.planning/phases/12-ownership-dedup/12-REVIEW.md` — WR-01..WR-04 full text; D-71
  fixes WR-01 + WR-04 in-phase, accepts WR-02 + WR-03 with rationale.
- `.planning/phases/13-keys-waiting-giftable-spares-views/13-VERIFICATION.md` — Phase 13
  `gaps_found` status: CR-01 (urgency-badge 24–48h math) is a pre-phase gate; also
  documents 13-REVIEW WR-01..03 (machineName-only identity edge relevant to audit/cache
  keying).

### Existing code (build on, don't rebuild)
- `src/backend/humble/adapter.ts` — the C5 wall; the reveal call is added HERE as a new
  typed function (first write-style request; redacted logging precedent inside).
- `src/backend/humble/electronStores.ts` — REVEALED-flag store (D-30) this phase writes;
  conventions for the audit store; gifted-at store precedent.
- `src/backend/humble/classify.ts` — classification precedence the local
  REVEALED/REDEEMED marks feed (`redeemed_key_value` ⇒ REDEEMED beats local flag).
- `src/backend/humble/ipc_handler.ts` + `src/preload/api/humble.ts` — `humble:*` IPC +
  invoker conventions (server-side validation pattern from Phase 13 is the D-69 model).
- `src/backend/humble/dedup.ts` — ownership matching the C2 guard queries; WR-01 fix
  lands here.
- `src/backend/humble/library.ts` + `syncFence.ts` — sync lifecycle, 403 cooldown, and
  the fence pattern for keeping mutations and syncs from interleaving.
- `src/frontend/screens/Humble/Keys/Waiting/index.tsx` + `components/HumbleKeyRow` — the
  rows that gain Claim/Finish buttons and audit annotations.
- `src/frontend/screens/Humble/Keys/Spares/index.tsx` — C2 redirect destination; D-58
  dialog + D-42 override live here; WR-04 undo-override affordance lands nearby.
- `src/frontend/App.tsx` (lines ~177–197) — the nested `humble-keys` route table with the
  `spares` child route the C2 navigate targets.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The write-ahead REVEALED flag store already exists (built Phase 11, D-30) — this phase
  is its first writer; classification precedence already honors it.
- Phase 13's gift-flow plumbing is the architectural template end-to-end: confirm Dialog
  with locked irreversibility copy, `humbleRecordGiftLinkOpened` IPC with server-side
  validation, persisted per-key timestamp annotation, preload invoker via
  `makeHandlerInvoker`.
- D-33 403-cooldown machinery in the sync path — reuse for reveal denials (D-79) rather
  than building a second cooldown.
- `openExternalUrl` pattern (used by Spares) for the registerkey deep-link and platform
  link-outs; Electron clipboard API surface already used for gift links.
- `dedup.ts` ownership lookup — the C2 guard is a read of existing match state, not new
  matching logic.

### Established Patterns
- IPC via `addHandler()` typed in `AsyncIPCFunctions`/`FrontendMessages`; server-side
  re-validation inside handlers (Phase 13 precedent) — the D-69 guard follows this.
- `electron-store` domain stores in `electronStores.ts`; disconnect-wipe exemption list
  (D-04) gains the audit store.
- Semantic color tokens; all strings via `t()` in the **consumed** namespace (WR-08).
- Redacted logging discipline from `adapter.ts` — key values join cookies/gift links as
  never-logged secrets (C4).

### Integration Points
- `adapter.ts` grows the reveal function (first write-style call) behind `AdapterResult`.
- The reveal IPC handler chain: C2 re-check (dedup state) → write-ahead audit record →
  write-ahead REVEALED flag → adapter reveal call → outcome reconciliation (D-78).
- Keys-waiting rows: Claim/Finish buttons keyed off state + ownership; modal navigates to
  `/humble-keys/spares` on C2 block.
- `classify.ts`: local REDEEMED mark (D-77) enters precedence below `redeemed_key_value`;
  key-cache entry gains the locally-captured key value (D-74).
- Steam game-details annotation + ownership recompute (D-47): a successful redeem should
  eventually reflect via Steam library refresh — no new wiring required, but verify the
  recompute picks up the newly-owned game.

</code_context>

<specifics>
## Specific Ideas

- The wizard's own friction IS the throttle — resist adding artificial waits between
  successful claims (D-79); C3 is satisfied by serialization + denial cooldown.
- The dangerous asymmetry in D-78: forfeiting gift-ability of an untouched key (flag
  stuck after a failed reveal) is a real loss; regressing a genuinely-revealed key is
  worse. Rollback only on *confirmed* failure; keep on ambiguity.
- The override round-trip (blocked → Spares → "Not the same game" → back to Waiting →
  Claim) is deliberate friction for a rare, dangerous case — do not shortcut it with a
  claim-anyway bypass (D-70 rejected that).
- Audit write-ahead ordering is a locked success criterion (SC4): audit record BEFORE the
  reveal API call, same spirit as the D-30 flag.
- Key strings are secrets in transit and at rest in logs (C4) — but not on the user's own
  screen (D-73). The line is logs/IPC-debug/exports, not the modal.

</specifics>

<deferred>
## Deferred Ideas

- **Full audit-log viewer surface** (chronological activity list) — rejected for v1.2
  (D-75 keeps annotations only); revisit if users ask for a claim history.
- **Fuzzy claim-anyway inline bypass** — rejected (D-70); revisit only if the override
  round-trip proves annoying in real use.
- **Active nudges for in-flight claims** (tab-count emphasis, startup reminder toast) —
  rejected (D-80); expiration/urgency alerting is Phase 15's domain (HSTORE-03), which
  could subsume "revealed but never activated" reminders later.
- **Phase 13 CR-01 gap closure** — not a Phase 14 deliverable, but a pre-phase gate;
  13-REVIEW.md already contains the corrected implementation + test.

</deferred>

---

*Phase: 14-guided-claim-flow*
*Context gathered: 2026-07-07*
