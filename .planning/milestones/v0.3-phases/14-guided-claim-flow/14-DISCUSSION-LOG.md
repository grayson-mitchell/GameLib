# Phase 14: Guided Claim Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 14-guided-claim-flow
**Areas discussed:** Claim flow shape, C2 guard: exact vs fuzzy, Key exposure & audit surface, Redeem confirmation & failures

---

## Claim flow shape

**Q1: What container should the reveal → activate → mark-redeemed sequence run in?**

| Option | Description | Selected |
|--------|-------------|----------|
| Modal wizard | 'Claim' on the row opens one modal: warning → reveal → key copied + Open Steam → Mark as redeemed; reuses Dialog components, D-58 friction pattern | ✓ |
| Inline row expansion | Row expands in place; multi-step state on a list row is fragile (scroll, re-sort, tab switches) | |
| Per-key detail page | Dedicated routed claim page; heavier than a 3-step interaction needs | |

**Q2: How does a REVEALED-but-unredeemed row let the user finish?**

| Option | Description | Selected |
|--------|-------------|----------|
| Resume at post-reveal step | Row swaps Claim for 'Finish activation', reopening the modal at the key/Open Steam/Mark-redeemed step; no warning replay, no second reveal call | ✓ |
| Same Claim button, smart modal | One label, modal detects state; row stops signaling in-flight claims | |
| Separate actions per step | Discrete Copy/Open/Mark buttons inline; crowded, drops the guided feel | |

**Q3: Where does the Claim action appear?**

| Option | Description | Selected |
|--------|-------------|----------|
| Keys waiting only | Mirrors D-60 one-view-one-action; All keys stays D-21/D-22 read-only; single C2 entry point | ✓ |
| Keys waiting + All keys | Act from the full inventory; breaks D-22, doubles guard surfaces | |
| Anywhere the key renders | Most consistent, most guard surface to maintain | |

**Q4: How do non-Steam keys fit the claim flow (HCLAIM-05)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Same wizard, swapped step | Identical modal; activation step shows 'Redeem on {platform}' link-out instead of Steam registerkey; Mark as redeemed still applies | ✓ |
| Reveal-only, no guided finish | No mark-redeemed step; REVEALED non-Steam keys linger with no completion | |
| Different lighter dialog | Separate simpler dialog; doubles components and copy | |

---

## C2 guard: exact vs fuzzy

**Q1: Where should the C2 ownership check enforce?**

| Option | Description | Selected |
|--------|-------------|----------|
| Backend re-check at reveal | Reveal IPC handler re-validates ownedElsewhere at call time, before audit record + API request; typed 'owned → go to spares' result drives navigate() | ✓ |
| UI-only guard | View membership + modal-open check; mid-flow sync can slip through | |
| Backend + modal pre-check | Friendlier but same logic in two places | |

**Q2: Does the guard treat fuzzy 'Likely owned' matches differently from exact AppID matches?**

| Option | Description | Selected |
|--------|-------------|----------|
| Same block, override is the escape | Both tiers hard-block to Spares; D-42 'Not the same game' override moves the key back to Waiting. One guard, one escape hatch | ✓ |
| Fuzzy gets claim-anyway inline | Softer path with 'Claim anyway' recording the override; adds a bypass branch and second override write-path | |
| Fuzzy doesn't block at all | Only exact matches trigger C2; weakens the stale-state backstop | |

**Q3: WR-01..04 accept-or-remediate disposition (gate due before Phase 14)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Fix WR-01 + WR-04 in phase 14 | Both load-bearing once the override is the C2 escape hatch (WR-01 mis-sorts guard inputs; WR-04 makes a mistaken override irreversible); accept WR-02 (inherent to fuzzy, mitigated) + WR-03 (D-48-protected edge) | ✓ |
| Accept all four | Fastest; ships an irreversible override as the escape hatch | |
| Remediate all four first | Cleanest baseline, most delay; WR-02 has no clean fix | |

**Q4: Does C2 also gate post-reveal steps (mark-as-redeemed)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Reveal only, note at finish | Finish activation always works (blocking strands the key — no spare path post-reveal); passive 'you already own this' note if owned | ✓ |
| Gate both steps | Spec-literal but strands revealed keys with no path anywhere | |
| Reveal only, no note | User hits Steam's 'already own this' error cold | |

---

## Key exposure & audit surface

**Q1: How is the key string presented in the modal after reveal?**

| Option | Description | Selected |
|--------|-------------|----------|
| Full key + copy button | Plaintext + re-copy; manual-paste fallback; C4 targets logs/IPC, not the user's own screen | ✓ |
| Masked with show toggle | Shoulder-surfing protection at the cost of friction in a flow initiated to get the key | |
| Clipboard-only, never shown | No fallback if paste fails | |

**Q2: Where does the revealed key value live between reveal and mark-redeemed?**

| Option | Description | Selected |
|--------|-------------|----------|
| Persist in the key cache | Same store that holds redeemed_key_value after sync; resume works across restarts, zero extra requests | ✓ |
| Re-fetch at resume | Extra Humble request per resume (C5 frugality), breaks offline | |
| In-memory only | Closing the app mid-claim strands a REVEALED key | |

**Q3: Is the audit log user-visible?**

| Option | Description | Selected |
|--------|-------------|----------|
| Row annotations only | Backend store + per-key 'revealed/redeemed {date}' annotations (D-59 precedent); no new surface | ✓ |
| Backend store only | Requirement letter satisfied, no user confirmation trail | |
| Full audit view | New chronological surface the phase doesn't ask for | |

**Q4: Audit record contents and which events get one?**

| Option | Description | Selected |
|--------|-------------|----------|
| Identity + outcome, no key value | machineName, title, platform, event, timestamp, outcome; events: reveal attempt (write-ahead) → outcome, mark-redeemed, C2 blocks | ✓ |
| Reveals + redeems only | Leaner, less diagnostic value on guard misfires | |
| Include the key value | Second persistent copy of every secret; C4 violation-in-waiting | |

---

## Redeem confirmation & failures

**Q1: Can 'Mark as redeemed' be undone?**

| Option | Description | Selected |
|--------|-------------|----------|
| Undo while local-only | Undo exists while REDEEMED rests solely on the local mark; flips to REVEALED + audit event; disappears once redeemed_key_value confirms | ✓ |
| No undo | One mis-click permanently files an unactivated key as done | |
| Time-limited undo toast | Arbitrary window; mistakes are discovered later | |

**Q2: Write-ahead REVEALED flag when the reveal API call fails?**

| Option | Description | Selected |
|--------|-------------|----------|
| Rollback on confirmed failure only | Definitive API error rolls back (UNREVEALED, audit 'failed', retryable); ambiguous outcome (timeout) keeps the flag, next sync reconciles | ✓ |
| Always keep the flag | Network error permanently misfiles an untouched key as gift-forfeited | |
| Always roll back on error | Success-with-lost-response regresses a real reveal — the D-30 bug | |

**Q3: Claim pacing (C3)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Serial + denial cooldown | One in-flight reveal (modal inherently serial); 403/429 triggers D-33-style cooldown gating further reveals | ✓ |
| Fixed cooldown between reveals | Punishes legitimate multi-key sessions for no server-side reason | |
| Hourly cap | Strongest protection, most frustrating; measures the wrong call anyway | |

**Q4: Active nudges for REVEALED-but-unconfirmed keys?**

| Option | Description | Selected |
|--------|-------------|----------|
| Passive row state only | Finish-activation button + annotation; no banners/toasts (D-31 philosophy; Phase 15 owns alerting) | ✓ |
| Tab-count emphasis | Second counter on a tab that just got counts designed | |
| Startup reminder toast | Phase 15 (HSTORE-03) territory; toast fatigue | |

---

## Claude's Discretion

- Reveal endpoint discovery + adapter contract (incl. definitive-vs-ambiguous failure taxonomy for the flag rollback)
- UNPICKED Choice-month pseudo-entry behavior in the Waiting view (must not enter the reveal wizard)
- Key-identity keying (machineName vs gamekey+machineName composite) for audit/cache stores
- D-24 frozen-order interaction with local REDEEMED marks and undo
- Wizard step layout/copy, C1 warning wording, i18n keys (consumed namespace)
- Audit store shape/location; WR-01 fix approach; WR-04 undo-override affordance placement
- Cooldown duration reuse, retry UX, audit outcome vocabulary, undo placement

## Deferred Ideas

- Full audit-log viewer surface — revisit if users ask for claim history
- Fuzzy claim-anyway inline bypass — revisit only if the override round-trip proves annoying
- Active in-flight-claim nudges — Phase 15 alerting could subsume later
- Phase 13 CR-01 gap closure — pre-phase gate, not a Phase 14 deliverable
