# Phase 42 — Multi-Source Coverage Audit

**Produced:** 2026-09-07 by the planner, alongside `42-01`…`42-07-PLAN.md`.
**Sources audited:** ROADMAP phase goal, CONTEXT.md decisions + success criteria,
PATTERNS.md constraints, the owning todo. There is no `42-RESEARCH.md`; CONTEXT.md
and PATTERNS.md carry the research-tier content and are audited in its place.

---

## Requirement register

Minted from CONTEXT.md's six success criteria plus assumption A1.

| ID | Requirement | Source | Plans |
|---|---|---|---|
| REQ-42-01 | ONE pure `key_type` -> presentation table in `src/common/humble/`: display name, logo-or-none, redeem-URL-or-help-fallback, with an EXPLICIT unknown branch (no `default` fall-through, no fabricated name, no fabricated URL, never the GameLib icon) | CONTEXT scope 1, D-42-03, SC1/SC3 | 42-01 |
| REQ-42-02 | `HumbleKeyRow`'s caption renders the store logo + proper display name from the table, replacing the raw lowercase `key_type` token; `{{origin}}` unchanged; no-logo platforms render text-only with no layout shift | CONTEXT scope 2, D-42-03, SC1/SC3 | 42-04 |
| REQ-42-03 | `HumbleClaimWizard`'s Steam-vs-static-help fork is replaced by table-driven resolution; GOG opens `https://www.gog.com/redeem/<code>`; Steam byte-identical; everything else keeps `NON_STEAM_REDEEM_HELP_URL` | CONTEXT scope 3, SC1/SC2/SC3 | 42-05 |
| REQ-42-04 | Exact-match owned+REVEALED keys auto-settle to REDEEMED on the ownership recompute, reading the reconciled overlay, with additive `source: 'user' \| 'ownership-exact'` provenance | CONTEXT scope 4, D-42-01/D-42-02, SC4 | 42-02, 42-03 |
| REQ-42-05 | Fuzzy matches NEVER auto-settle and keep the D-42 "Not the same game" override | CONTEXT scope 4, D-42-02, SC5 | 42-03 |
| REQ-42-06 | The auto-settle is undoable back to REVEALED from a REACHABLE UI affordance under All-keys' `Redeemed` heading, and the undo is durable across the next recompute | D-42-01, SC4 | 42-03 (durability), 42-06 (reachability) |
| REQ-42-07 | The owning todo no longer asserts the false premise and records how it was measured | CONTEXT scope 5, SC6 | 42-07 |
| REQ-42-08 | `key_type === 'gog'` is confirmed against a live sync, or explicitly recorded as unconfirmed | CONTEXT A1 | 42-07 |

---

## GOAL — ROADMAP Phase 42 goal statement

| Goal clause | Status | Plan |
|---|---|---|
| "Replace ad-hoc `key_type` interpretation at three call sites with ONE evidenced table" | COVERED | 42-01 builds it; 42-04 and 42-05 consume it at all three sites |
| "display name, logo-or-neutral, redeem-URL-or-help-fallback" | COVERED | 42-01 |
| "drive the row's store indicator … from it" | COVERED | 42-04 |
| "…and the per-platform deep links from it" | COVERED | 42-05 |
| "give owned+revealed keys somewhere to live … no way to settle them" | COVERED | 42-03 (settle) + 42-06 (undo reachability) |

---

## CONTEXT — locked decisions

| ID | Decision | Status | Plan |
|---|---|---|---|
| D-42-01 | Settle by reusing REDEEMED + D-77 Undo. No new state, no new tab. Renders under All-keys' `Redeemed` heading. Provenance field required because REDEEMED now conflates two causes. | COVERED | 42-02 (provenance schema), 42-03 (settle + durable undo), 42-06 (undo reachability) |
| D-42-02 | Only `matchConfidence === 'exact'` + `ownedElsewhere` + `state === 'REVEALED'` settles. Fuzzy NEVER. Must read the same reconciled overlay the C2 guard reads, not a mid-recompute intermediate (D-48 keep-last-known interaction). | COVERED | 42-03 — settle site is `recomputeOwnership`'s `mutatedKeys` only; the per-order Branch A/B block at `library.ts:224-260` is explicitly excluded and diff-pinned |
| D-42-03 | Store indicator: logo + proper display name, with an EXPLICIT unknown branch. Never the `StoreLogos` `default` GameLib-icon fall-through. Never extend `Runner`. | COVERED | 42-01 (table + explicit unknown member), 42-04 (render + direct negative pins) |

### CONTEXT — deferred / out of scope (correctly ABSENT from all plans)

| Item | Verified absent |
|---|---|
| Activate-button gating | No plan mentions it. The premise is struck in 42-07. |
| Batch activate / "activate all" | No plan mentions it. |
| Rate-limit serialization | No plan mentions it. 42-07 Task 1 deletes the requirement sentence and `grep -q` asserts its absence. |
| Deep links for platforms other than Steam and GOG | 42-01 pins `kind: 'help'` for all seven others plus unknown. |
| One-click GOG activation | Not planned. 42-05 delivers assisted deep-link only. |
| Extending the `Runner` union | 42-04 forbids importing `StoreLogos` and forbids extending `Runner`; pinned by grep. |

---

## PATTERNS — constraints that must shape the plans

| Constraint | Status | Plan |
|---|---|---|
| New `common/humble` file follows the four-sibling convention (docblock, named consts, discriminated union with explicit no-value case, per-branch D-NN citation) | COVERED | 42-01 Task 2 |
| Test-location trap: a `src/common` jest project exists and looks right, but all four `common/humble` siblings are tested from `src/backend/humble/__tests__/` | COVERED | 42-01 Task 1 explicitly forbids `src/common/humble/__tests__/` |
| `HumbleClaimWizard/__tests__/index.test.tsx:406-426` pins `'Redeem on gog'` and must be rewritten, with a still-unmapped platform substituted to preserve fallback coverage | COVERED | 42-05 Task 1 (substitutes `uplay`, adds an unrecognised case) |
| The Steam pin at `:371-379` must NOT change | COVERED | 42-05 verify diffs it against the COMMIT, not the working tree |
| No test pins the `HumbleKeyRow` caption — new coverage, not a migration | COVERED | 42-04 Task 3 creates the component's first-ever suite |
| D-22 read-only contract: presentational changes need no exception; interactive ones must be enumerated | COVERED | 42-04 states no exception is needed and does not edit the block; 42-06 adds Exception 4 for the genuinely interactive Undo |
| `encodeURIComponent` deep-link convention mirrored from the Steam branch | COVERED | 42-01 Task 2; 42-05 removes all URL construction from the wizard (grep-pinned to zero `encodeURIComponent`) |
| Additive-only schema evolution: optional field, missing reads as the pre-Phase-42 default | COVERED | 42-02 Task 1 (`source?`), Task 2 (`?? 'user'`) |
| WR-01: `allTerminal`/`freezeEligible` RECOMPUTED, never spread forward, when a key's state changes | COVERED | 42-03 Task 2, pinned both directions (settle and undo) |
| New strings -> `gamelib.json`, never `translation.json` | COVERED | 42-04, 42-05, 42-06 each add exactly one key and each verify includes `git diff --quiet -- public/locales/en/translation.json` |

---

## TODO — the owning todo's "Solution" section

| Todo item | Status | Plan |
|---|---|---|
| "the ROW should distinguish 'owned on Steam, nothing to do' from 'genuinely waiting'" | COVERED | 42-03 settles it into `Redeemed`; 42-06 renders "Already in your Steam library" |
| "reconcile without spending an activation attempt at all" | COVERED | 42-03 settles from the ownership signal; no Steam call is made |
| "Fuzzy matches are NOT [evidence] and must not be auto-settled" | COVERED | 42-03 REQ-42-05, table-driven negative pins |
| "Whatever settles the row should be undoable, like D-77's local-redeemed Undo" | COVERED | 42-03 (durable) + 42-06 (reachable) |
| "Also in scope: per-platform redeem deep links" / GOG `https://www.gog.com/redeem/<code>` | COVERED | 42-05 |
| "Watch out for: one key is `platform: 'generic'` … Don't let a per-platform map regress that case into a fabricated URL" | COVERED | 42-01 (explicit `generic` map entry -> `{ kind: 'unknown' }`, help URL with the code dropped), 42-04 + 42-05 direct pins |
| The Activate-button / rate-limit paragraphs | STRUCK, not implemented | 42-07 — see the "false premise" section below |

---

## Deliberate non-coverage, with justification

Two items are deliberately NOT planned. Neither is a gap.

1. **Activate-button gating, batch activation, rate-limit serialization.**
   The owning todo's premise is FALSE and re-verified false on 2026-09-07:
   `selectKeysWaiting` excludes `ownedElsewhere` (`viewFilters.ts:62`, landed
   `5bfc2cb3d` on 2026-07-08), and the Activate button rides on the `claimAction`
   prop supplied by exactly one caller (`Keys/Waiting/index.tsx:222`). Owned keys
   reach neither. There is no reachable code path for the hazard, so there is
   nothing to gate or serialize. Struck by 42-07 rather than implemented.
   **The planner found no counter-example.**

2. **Clearing a settle-decline.** Plan 42-03 adds a durable decline record so an
   Undo survives the next recompute. Nothing in this phase lets the user
   re-settle a declined key. No success criterion asks for it, and re-settling
   would defeat the durability the Undo depends on. Recorded explicitly in 42-03's
   summary so a later reader does not read the absence as an oversight.

---

## Planner findings surfaced during audit

Two things in the source artefacts were assumptions that did not hold against the
code. Both are handled inside the plan set rather than silently worked around.

**F-42-A — D-42-01's "D-77's Undo affordance unchanged" was FALSE.**
The Undo button lives inside `{claimAction && ...}` (`HumbleKeyRow/index.tsx:114-130`);
`claimAction` has exactly one supplier (`Keys/Waiting/index.tsx:222`); the All tab
renders `<HumbleKeyRow humbleKey urgencyTier />` only (`HumbleKeyGroup/index.tsx:81`)
and never fetches annotations at all; and an auto-settled key is `ownedElsewhere`
so it can never reach Keys-waiting. Without new frontend work an auto-settled key
would have NO Undo anywhere and success criterion 4 would be unreachable. Plan
42-06 closes it, implementing D-42-01's intent (undo reachable, under All-keys'
Redeemed heading, no new tab, no sixth state). The alternative — widening
`selectKeysWaiting` — was rejected because it changes tab membership D-42-01 did
not sanction and would render "Finish activation" on an owned key after an undo.

**F-42-B — an SVG import in `HumbleKeyRow` would have broken a green suite.**
`Waiting/__tests__/index.test.tsx:22` imports the REAL `HumbleKeyRow` module, and
`src/frontend/jest.config.js` has no `moduleNameMapper` at all, so
`frontend/assets/steam-logo.svg?react` is unresolvable under ts-jest. Plan 42-04
Task 1 lands a mapper plus a local stub as a prerequisite, with the resolution
failure captured as RED first. No package is installed to solve it.

---

## Wave / dependency structure

| Wave | Plans | Rationale |
|---|---|---|
| 1 | 42-01, 42-02 | Zero file overlap. 42-01 is `common/humble` + a backend test; 42-02 is `electronStores.ts` + `library.ts` + `library.test.ts`. |
| 2 | 42-03, 42-04 | 42-03 depends on 42-02 (shares `library.ts`, `electronStores.ts`). 42-04 depends on 42-01 (imports the table). No overlap between the two. |
| 3 | 42-05 | Depends on 42-01 (table) and on 42-04 for `public/locales/en/gamelib.json` — file overlap forces the later wave. |
| 4 | 42-06 | Depends on 42-02/42-03 (provenance + writer), 42-04 (`HumbleKeyRow`), 42-05 (`gamelib.json`). |
| 5 | 42-07 | Records the outcome of everything above; the live checkpoint needs the whole phase shipped. |

Every plan is 2–3 tasks. No file appears in two plans of the same wave.
