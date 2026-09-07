# Phase 42 Context — Humble key platform identity

**Source:** operator conversation 2026-09-07 (three locked decisions via AskUserQuestion) plus
code verification performed the same day against `fix/steam-native-install-stability` @ `7bf39e3b5`.
Not produced by `/gsd:discuss-phase` — the design questions that change the plan were asked
directly and are recorded below as locked.

---

## THE OWNING TODO'S PREMISE IS FALSE — STRIKE IT BEFORE PLANNING AGAINST IT

This phase owns `.planning/todos/pending/2026-08-23-humble-integrated-activation-reconcile-key-state-with-steam-.md`.
**Its central claim does not hold, and must not become a requirement.**

The todo states:

> "GameLib keeps presenting it in Keys-waiting with an actionable **Activate** button … Every
> reconciliation spends a **real Steam activation attempt** … Working through 18 keys in one
> sitting is a plausible way to trip that."

Measured against the code:

| Claim | Verdict | Evidence |
|---|---|---|
| Owned keys appear in Keys-waiting | **FALSE** | `selectKeysWaiting` (`src/common/humble/viewFilters.ts:62`) returns `false` for any `k.ownedElsewhere`. Landed `5bfc2cb3d`, 2026-07-08 — six weeks BEFORE the todo was written. |
| Owned keys offer an Activate button | **FALSE** | The button rides entirely on the optional `claimAction` prop. Exactly one caller supplies it: `Keys/Waiting/index.tsx:222`. `Spares/index.tsx:79` passes `giftAction` only; `HumbleKeyGroup/index.tsx:81` (the All tab) passes `urgencyTier` only. |
| Reconciling spends an activation attempt | **UNREACHABLE for owned keys** | No Activate button ⇒ no attempt. |
| Rate-limit hazard across 18 keys | **NO PATH TO OCCUR** | Same. Applies only to the 2 keys measured `ownedElsewhere: false / matchConfidence: none`. |

**Consequences for planning.** Do NOT mint requirements for: gating the Activate button on
ownership, serializing a batch activate, or stopping on `rate-limited`. There is no such button on
these keys and no such batch. A requirement written against the todo's prose would be a gate
against a defect that does not exist.

**What survives is one line of the todo, and it is correct:**

> "a REVEALED + owned key has nothing to gift and no reason to sit in Keys-waiting either.
> **That third state has no home today.**"

`selectKeysWaiting` excludes them (owned) and `selectGiftableSpares` excludes them (it takes
`state === 'UNREVEALED'` only, `viewFilters.ts:76`). So owned+REVEALED keys appear ONLY under the
All tab's `Revealed` heading, permanently, with no settle path. That is the real defect.

**Census (todo's 2026-08-23 measurement — the only one that exists).** 33 orders / 32 keys;
31 steam, 1 generic, 0 gog. Of 20 REVEALED steam keys: 13 `owned+exact`, 5 `owned+fuzzy`,
2 unowned. Corroborated post-hoc: `humble_local_redeemed.json` holds exactly 2 entries, matching
the todo's "two Steam keys are REDEEMED".

**The live cache is GONE and cannot be re-measured.** `~/Library/Application Support/gamelib/store_cache/humble_library.json`
was clobbered to `{}` on 2026-09-07 at 12:29 (alongside `humble_sync.json`) — the known
tests-clobber-real-stores defect. The mode-`600` overlays (`humble_local_redeemed.json`,
`humble_revealed.json`) survived. Re-run a sync before any live gate.

---

## Locked decisions

### D-42-01 — Settle by reusing REDEEMED + D-77 Undo. No new state, no new tab.

An exact-match owned+REVEALED key is marked REDEEMED through the **existing** local-redeemed
overlay, and renders under All-keys' `Redeemed` heading with D-77's Undo affordance unchanged.

Rejected: a sixth display state ("Already on Steam") and a fourth tab. Both were offered; the
operator chose the smallest surface. The undo requirement the todo demands ("whatever settles the
row should be undoable, like D-77's local-redeemed Undo") is then satisfied by machinery that
already ships rather than a parallel mechanism.

**Constraint this decision creates — resolve in planning, it is not a further user decision.**
Reusing REDEEMED conflates a *Steam-ownership inference* with the user's *explicit* "Mark as
redeemed". `humble_local_redeemed.json` records `{ redeemedAt: number }` with no provenance. The
settle must write a provenance discriminator (e.g. `source: 'user' | 'ownership-exact'`) into that
record — additively, so existing entries keep parsing — so that:
  - Undo copy can distinguish "you marked this" from "we inferred this",
  - a future audit can tell the two apart,
  - and `HumbleLibrary.getClaimAnnotations`' D-77 gating ("only while `redeemedAt` reflects a
    local-only mark") is re-checked against the new writer rather than assumed to still hold.

### D-42-02 — Settle automatically during the ownership recompute. Exact matches ONLY.

| Input | Action |
|---|---|
| `ownedElsewhere && matchConfidence === 'exact' && state === 'REVEALED'` | settle → REDEEMED (provenance `ownership-exact`), Undo available |
| `ownedElsewhere && matchConfidence === 'fuzzy'` | **untouched** — stays REVEALED |
| `!ownedElsewhere` | untouched |

Fuzzy must never auto-settle. The todo is explicit and D-42's "Not the same game" override exists
precisely because fuzzy matches are sometimes wrong. 5 of the 18 owned keys are fuzzy.

Watch the D-48 keep-last-known interaction: `library.ts:257` preserves a prior
`ownedElsewhere: true` across a recompute that would transiently read false. A settle driven off
ownership must not fire on a transiently-true value either — read the same reconciled overlay the
C2 guard reads, not a mid-recompute intermediate.

### D-42-03 — Store indicator: logo + proper display name, with an EXPLICIT unknown branch.

Replace the raw platform token in the row caption with the store's logo and display name drawn
from the new table. Today `HumbleKeyRow/index.tsx:230` renders
`'{{platform}} · {{origin}}'` where `platform` is Humble's raw lowercase `key_type`, passed
straight through from `classify.ts:440` (`platform: string`, no mapping) — so the row literally
reads "steam · …".

Rendering contract:

| key_type | logo | name |
|---|---|---|
| `steam` | steam-logo.svg | Steam |
| `gog` | gog-logo.svg | GOG |
| `epic` / `epic_keyless` | epic-logo.svg | Epic Games |
| `origin`, `origin_keyless`, `uplay`, `battlenet`, `nintendo_direct` | **none** | proper name, text only |
| `generic`, anything unrecognised | **none** | neutral ("Other"), never a fabricated name |

**The trap, and it is the same trap in both halves of this phase.** `components/UI/StoreLogos/index.tsx`
is keyed on `Runner` (`legendary | gog | sideload | nile | zoom | steam`) and its `default` branch
returns the **GameLib icon**. The evidenced key_type set contains platforms with no runner and no
logo, so falling through `StoreLogos`' default would stamp "GameLib" on a Uplay key. The todo
already forbids the URL form of this mistake —

> "Don't let a per-platform map regress that case into a fabricated URL."

— and it applies identically to icons. **Explicit unknown branch, never a default.** Do not extend
`Runner` to carry Humble-only platforms; map key_type → presentation directly.

---

## Scope

### In

1. **One evidenced `key_type` table** — the single artifact both halves consume. Carries, per
   platform: display name, logo-or-none, redeem-URL-or-help-fallback. Pure, no React, no I/O;
   `src/common/humble/` tier alongside `viewFilters.ts` / `groupKeys.ts`, unit-testable from the
   backend jest project.
2. **Store indicator on the row** (D-42-03), replacing the raw-token caption.
3. **GOG redeem deep link** — `https://www.gog.com/redeem/<code>`, operator-verified 2026-08-23.
   Currently every non-Steam key routes to the static `NON_STEAM_REDEEM_HELP_URL`
   (`HumbleClaimWizard/index.tsx:18`, used at `:662`) while Steam gets a real prefilled link at
   `:648`. The table subsumes that fork.
4. **Auto-settle of exact-match owned+REVEALED keys** (D-42-01, D-42-02), with provenance and Undo.
5. **Strike the false premise from the owning todo** and record the verification, so the claim is
   not re-derived by the next reader.

### Out

- Activate-button gating, batch activate, rate-limit serialization — no reachable caller (see above).
- Redeem deep links for platforms other than Steam and GOG. No evidenced URL and no key to test
  against. `origin`/`uplay`/`battlenet`/`nintendo_direct` keep the static help URL.
- One-click GOG activation. There is no GOG redemption API: the Galaxy OAuth token GameLib holds
  is scoped to `api.gog.com`/`embed.gog.com` data endpoints, not the storefront, and the redeem
  form is captcha-gated. Assisted deep-link is the ceiling.
- Extending the `Runner` union.

---

## Assumptions

**A1 — `key_type === 'gog'`. EVIDENCED, NOT OBSERVED.** Planning proceeds on this at the
operator's explicit instruction ("treat gog as the evidenced assumption").

Basis: `src/backend/humble/__tests__/fixtures/tpks.ts:459` records the game-store key_type union
from two independent third-party integrations — Playnite's `HumbleKeysLibrary` `keyTypeWhitelist`
and GOG Galaxy's `KEY_TYPE` enum:

```
steam, gog, origin, origin_keyless, uplay, epic, epic_keyless, battlenet, nintendo_direct
```

**Status of the confirming observation.** The operator bought a GOG Humble game on 2026-09-07,
satisfying the todo's stated revisit gate ("Revisit when a GOG key appears in a sync"). But
`humble_library.json` is `{}` and no sync has run since the clobber, so **the key is not yet in
GameLib's data and `key_type` has never been read live for GOG.** A sync must confirm before this
phase closes. If the live value differs, only the table's key changes — the structure does not.

**A2 — the 2026-08-23 census still describes the library.** Unverifiable until a sync (A1). Counts
inform sizing only; no requirement should depend on an exact count.

---

## Success criteria

1. A GOG key's row shows the GOG logo and "GOG", and its redeem action opens
   `https://www.gog.com/redeem/<code>` with the code prefilled.
2. A Steam key's row and redeem action are unchanged from today's behaviour.
3. A key whose `key_type` is `generic`, or any value not in the table, shows a neutral indicator
   with **no logo** and routes to `NON_STEAM_REDEEM_HELP_URL` — never a fabricated name or URL,
   never the GameLib icon.
4. An exact-match owned+REVEALED key settles to REDEEMED automatically on sync, carries
   `ownership-exact` provenance, and can be undone back to REVEALED.
5. A **fuzzy**-match owned+REVEALED key is untouched by the settle and still offers D-42's
   "Not the same game" override.
6. The owning todo no longer asserts that owned keys appear in Keys-waiting with an Activate
   button, and records how that was measured.

---

## Standing repo constraints (not phase-specific, but binding here)

- New user-facing strings go in `public/locales/en/gamelib.json`, **never** `translation.json` —
  the upstream-owned catalog fails CI on any write. `HumbleKeyRow` already holds both `t` and
  `tGamelib` bindings for exactly this reason (`index.tsx:66-69`).
- `HumbleKeyRow` is under a **D-22 read-only contract** with three enumerated sanctioned
  exceptions (D-42 override + WR-04 undo, `giftAction`, `claimAction`). The store indicator is
  presentational and does not need a new exception; any new *interactive* affordance on the row
  does, and must be added to that comment block rather than slipped in.
- `HumbleKeyRow` ← `HumbleKeyGroup` had a circular import once (WR-09); shared constants live in
  their own leaf module (`stateLabels.ts`). Put the new table in `common/`, not beside a component.

---

## UI-SPEC disposition — gate fired on a SUBSTRING false positive, recorded not silently skipped

`plan-phase` step 5.6 evaluated `HAS_UI=0` and would normally block until a `42-UI-SPEC.md` exists.
It fired on two words, neither of which is a UI signal:

```
5 x  platform      -> supplies "form"
1 x  Requirements  -> supplies "ui"   (Req-UI-rements)
```

This is the known substring false-fire in that gate. **But the conclusion is not entirely wrong:**
D-42-03 does change what `HumbleKeyRow` renders, so there IS a real (small) visual surface. Planning
proceeds with `--skip-ui` because D-42-03 already carries a per-platform rendering contract, and the
remaining visual questions are enumerated here rather than deferred to a spec that would not be read:

- **Ragged leading edge.** Some rows get a logo, some do not (`origin`/`uplay`/`battlenet`/
  `nintendo_direct`/`generic`). The caption must not shift horizontally between logo and no-logo
  rows — reserve the glyph box, or keep the logo inline with the text rather than in a column.
- **Both themes.** GameLib ships multiple themes; the store logos are single-colour SVGs imported
  `?react`, so they inherit `currentColor` only if the SVG does not hard-code a fill. Verify each
  logo against a light AND a dark theme before claiming the indicator is done — do not eyeball one.
- **Measure, do not eyeball.** Layout-shift and colour claims on this row must be backed by pixel
  or computed-style measurement, not a screenshot impression.
- **Row height must not change.** The caption line already carries `{{platform}} · {{origin}}`;
  swapping the token for a logo + proper name must not reflow the list or disturb the urgency badge
  and expiration columns.
