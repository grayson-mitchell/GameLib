# 42-07 Task 2 — operator checkpoint log (COMPLETE)

Running record of the `checkpoint:human-verify` gate. **This is deliberately NOT
`42-07-SUMMARY.md`** — creating that file early would set `has_summary: true` and make the
plan-index treat plan 42-07 as complete while gate items remain unanswered. See the Status
line below for the live count — do not trust a number hard-coded in this paragraph.

Operator answers are transcribed as given. Nothing in this file was inferred, auto-approved,
or generated on the operator's behalf.

Status: **COMPLETE — all 6 items resolved.** See the summary table near the end.

> **CAVEAT — item 3's PASS is against the PRE-REDESIGN row.** The operator subsequently
> directed a row redesign (quick task `260908-*`, "drop origin, title line height"): the store
> icon moves to the left, grows to the title line-box, the store-name text and the
> `· {{origin}}` segment are removed. That changes the exact rendering item 3 verified.
> **Item 3 was deliberately NOT re-run** — superseded again by the operator's subsequent
> Humble Keys screen redesign (2026-09-09), which restructures the row a third time. Verifying
> the `vo4` treatment would have been throwaway work. The unverified surface is carried by two
> open `ready: live-gate` todos instead; see "Residue" at the end. Item 4 is SUPERSEDED — it
> measured reserved-glyph-box geometry inside `.humbleKeyRowCaption`, which `vo4` replaced.

---

## 1. A1 — `key_type === 'gog'` — **CORRECTED**

Humble sends **`gog_keyless`**, not `gog`.

First live observation of a real GOG Humble entitlement in this project. Evidence chain,
all orchestrator-measured 2026-09-08:

- Operator sync log, pre-fix:
  `order classified to zero keys: <gamekey redacted> tpkd_dict.all_tpks=array(1)
  skipped=[[0]:direct-redeem-entitlement(key_type=gog_keyless key_type_human_name=GOG Keyless)]`
- Root cause: `KNOWN_GAME_KEY_TYPES` (`src/backend/humble/classify.ts`) listed
  `origin_keyless` and `epic_keyless` but not `gog_keyless`, so the entitlement failed the
  direct-redeem protective override and was discarded before becoming a `HumbleKey`.
- Closed by quick task `260908-uic`.
- Post-fix sync, live: `gamekeys=33 fetched=33/33 frozen=0 ok=33 ... zeroKeyOrders=0
  keysCached=33` (was `zeroKeyOrders=1 keysCached=32`). Cache now reports platform strings
  `['generic', 'gog_keyless', 'steam']`, with the single `gog_keyless` row in state
  `UNREVEALED`.

The pre-existing `gog` entry was retained — it remains the evidenced value for a genuinely
keyed GOG key. `gog_keyless` is a second, separately-evidenced value.

## 2. The four display names — **APPROVED AS SHIPPED**

Operator, 2026-09-08, verbatim: *"approve all four, keep Origin"*.

| `key_type` | approved display name |
|---|---|
| `uplay` | Ubisoft Connect |
| `battlenet` | Battle.net |
| `origin` | Origin |
| `origin_keyless` | Origin |
| `nintendo_direct` | Nintendo |

No code change resulted — `KEY_TYPE_PRESENTATIONS` already carried these exact strings.

`Origin` was explicitly put to the operator against the alternative `EA App` (EA retired the
Origin client in 2022–23) and **`Origin` was chosen deliberately**, as the name faithful to
the key the user actually holds. Recorded so a later reader does not "modernise" it as
drift.

**These four were approved as a NAMING JUDGEMENT, not observed on screen.** The operator's
library is 31 `steam` / 1 `gog_keyless` / 1 `generic` — it contains zero `uplay`,
`battlenet`, `origin`, `origin_keyless` or `nintendo_direct` keys, so no row in this account
can render any of these strings. Do not record this item as visually verified.

## 5. GOG deep link end to end — **NOT APPLICABLE** (resolved, not skipped)

Cannot occur, and this is by design rather than a gap.

The operator's only GOG item is `gog_keyless` — a direct-redeem entitlement with **no key
code**. `REDEEM_URL_BUILDERS` deliberately omits `gog_keyless` (T-UIC-01): building
`gog.com/redeem/<code>` for a codeless entitlement would be broken or would carry a secret
it should not. It falls through to the Humble help URL, exactly as `epic_keyless` does.

Consequence, and it matches the owning todo's August prediction verbatim: **phase 42's GOG
deep link (42-05) still has no reachable user.** The todo said building it would mean
"untestable code with no user"; that remains true, now for an evidenced reason rather than
an assumed one.

## 3. Both themes — **PASS** (against the pre-redesign row; see caveat above)

Operator, 2026-09-08, verbatim: *"both themes look fine"*.

Store logo visible and correctly coloured in both a light and a dark GameLib theme. The
`fill: currentColor` inheritance concern (todo
`2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live`) did not
materialise — the logo did not vanish or invert on either theme. This was verified against a
real **GOG** row (the newly-classified `gog_keyless` entitlement) as well as Steam rows, so
two distinct logo assets were exercised, not one.

**Same reply carried a design rejection**, recorded here because it is operator input, not a
defect report: *"logo's are very small. should be size of row … should be icon only and put
at begining of row"*. Resolved after review into the redesign directive below.

## Redesign directive (operator, 2026-09-08) — follow-up work, not a phase-42 gate item

Verbatim: *"drop origin, title line height"*.

Agreed scope: store icon moves to the LEFT of the row and grows to the title line-box;
the caption drops BOTH the store-name text and the `· {{origin}}` segment; the game title
becomes the row's single label.

**The field removed is `origin`, NOT the title.** The operator's first instruction was to
remove "the now superfluous game title that is column 4". Measured against their live cache,
that would have been destructive: `origin` is the bundle/order label (`humble.ts:104`), and
on **20 of 33 keys** it is the gift string `"A very special gift just for you"`, which names
no game at all. Dropping the title would have rendered those twenty rows unidentifiable
(Crusader Kings III and Citizen Sleeper both reduce to "Steam · A very special gift just for
you"). The duplication the operator saw is real but only on SINGLE-GAME orders, where
`origin` ≈ `title` — e.g. `Dex` / `Dex: Enhanced Version`, `Racine` / `Racine`,
`Valiant: Resurrection` / `Valiant: Resurrection (Steam)`. Corrected before any code changed.

Two constraints carried into the follow-up task:
- **No-logo stores keep their text label** (`uplay`, `battlenet`, `origin`, `origin_keyless`,
  `nintendo_direct`, and the `generic`/unknown row the operator actually holds). Only
  `steam`, `gog`, `epic` have art. Icon-only would blank those rows and make item 2's
  approved names unreachable.
- **The icon must gain an accessible name.** It is currently `aria-hidden="true"`
  (`HumbleKeyRow/index.tsx:359-361`) precisely BECAUSE the adjacent text names the store.
  Once that text is gone the rationale inverts and screen-reader users lose the store
  entirely.

## 6. Auto-settle and its Undo — **PASS**

Operator, 2026-09-09, verbatim: *"3, confirmed moved successfully"* / *"4. refreshed and stayed"*.

Operator-observed: Undo moved the row from `Redeemed` back to `Revealed`, and after a
further sync it **stayed** in `Revealed`.

Orchestrator-verified from disk, before and after (the visual "stayed put" is also what a UI
that simply never re-ran the settle would look like, so the decline record is the load-bearing
evidence, not the row position):

| check | before | after |
|---|---|---|
| `humble_settle_declined.json` | did not exist | **exists, 1 record, field `declinedAt`** |
| local-redeemed overlay entries | 14 | **13** |
| entries with `source: 'ownership-exact'` | 12 | **11** |
| entries with absent `source` (legacy) | 2 | 2 — untouched |
| undone composite still in local-redeemed | — | **False** |

**The decisive observation:** the undone key remains `state: REVEALED`,
`ownedElsewhere: true`, `matchConfidence: exact` — it still satisfies EVERY precondition for
the 42-03 auto-settle. It did not re-settle across a subsequent sync. The only thing
suppressing it is the decline record, so this is a genuine falsification test of the
durability guard rather than an absence-of-evidence pass.

**The fuzzy-match half was verified by measurement, not by eye.** All 12 auto-settled
entries joined back to library rows with `matchConfidence: exact`; **zero** of the operator's
8 fuzzy-matched keys were settled. D-42's "Not the same game" boundary held.

Also confirms 42-02's legacy path against real data: the 2 overlay entries with no `source`
field were left untouched by the undo and continue to default to `'user'`.

---

## Gate complete — all six items resolved

| # | Item | Outcome |
|---|---|---|
| 1 | A1 `key_type` | **CORRECTED** → `gog_keyless`; fixed and live-confirmed (QT `260908-uic`) |
| 2 | Four display names | **APPROVED AS SHIPPED** (naming judgement, not observed) |
| 3 | Both themes | **PASS**, against the pre-`vo4` rendering — see residue below |
| 4 | No layout shift | **SUPERSEDED** by the `vo4` redesign |
| 5 | GOG deep link | **NOT APPLICABLE** — keyless entitlement carries no code |
| 6 | Auto-settle + Undo | **PASS**, operator-observed and disk-verified |

### Residue carried out of this gate (named, not hidden)

- **Item 3's PASS is against a superseded rendering.** Quick task `260908-vo4` subsequently
  moved the icon, resized it from the title line box, and changed how it gets its colour
  (explicit `color: var(--text-secondary)` instead of inheriting through
  `.humbleKeyRowCaption`). The current build's theme behaviour is therefore UNVERIFIED. It was
  deliberately not re-run: the operator has since specified a full Humble Keys screen
  redesign (search/sort/filter chrome, column headers, a restructured three-column row), so
  re-verifying the `vo4` treatment would be throwaway work. Covered by the two open
  `ready: live-gate` todos:
  `2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md` and
  `2026-09-08-humble-key-row-store-icon-geometry-unverified-live.md`.
- **Phase 42's GOG deep link (42-05) has no reachable user**, now for an evidenced reason.
- **Item 4 has no successor check yet** — re-scope it against the redesigned row.

- **4. No layout shift.** SUPERSEDED by the redesign — it measured `.humbleKeyRowCaption`'s
  reserved-glyph-box geometry, which the redesign replaces. Do not collect numbers for a
  layout about to be deleted; re-scope the check after the redesign lands.
- **6. Auto-settle and its Undo.** Settled count, Undo returns row to `Revealed`, re-sync
  durability (must NOT re-settle), and confirmation that no fuzzy-matched key settled.
