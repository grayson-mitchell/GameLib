# 42-07 Task 2 — operator checkpoint log (IN PROGRESS)

Running record of the `checkpoint:human-verify` gate. **This is deliberately NOT
`42-07-SUMMARY.md`** — creating that file early would set `has_summary: true` and make the
plan-index treat plan 42-07 as complete while three gate items are still unanswered.

Operator answers are transcribed as given. Nothing in this file was inferred, auto-approved,
or generated on the operator's behalf.

Status: **3 of 6 answered.**

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

---

## Still outstanding — operator input required

- **3. Both themes.** Per-theme verdict on store-logo visibility/colour in the row caption.
  Now testable against a real GOG row for the first time.
- **4. No layout shift.** Four measured numbers: `getComputedStyle(row).height` and
  `.humbleKeyRowCaption` `getBoundingClientRect().left`, for a logo row vs a no-logo row.
- **6. Auto-settle and its Undo.** Settled count, Undo returns row to `Revealed`, re-sync
  durability (must NOT re-settle), and confirmation that no fuzzy-matched key settled.
