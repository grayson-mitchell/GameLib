# Phase 43: Humble Keys screen — unified list replacing the three tabs - Discussion Log

> **Audit trail only.** Do not use as input for planning, research, or execution agents.
> Decisions are captured in `43-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-09-09
**Phase:** 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
**Areas discussed:** List membership, `Most recent` sort, Scenario 1 coverage, Search /
hide-redeemed, What the row drops, Deleted-tab salvage, D-22 row contract

**Mode:** default interactive. Advisor mode off (no `USER-PROFILE.md`). No SPEC.md for this phase.
All seven offered gray areas were selected.

---

## List membership

### Generic-platform entries (`platform === 'generic'`)

| Option | Description | Selected |
|---|---|---|
| Ordinary rows | Sorted with everything else; TYPE reads neutral "Other"; no special partition | ✓ |
| Rows, but sorted last | Present but pushed to the bottom regardless of sort | |
| Excluded entirely | Dropped from the screen | |
| Filterable, shown by default | Ordinary rows plus a control to hide them | |

**Notes:** Supersedes the round-7 "Other" display bucket in `groupKeys.ts`. Rejected "sorted last"
because it costs a sort exception every future sort option must honour; rejected exclusion because
it silently loses inventory the user can currently see.

### UNPICKED Choice-month pseudo-entries

| Option | Description | Selected |
|---|---|---|
| Fifth scenario: `Pick on Humble` | Full-width deep link to Humble's Choice page | ✓ |
| Descriptive text, no button | KEY renders deadline text only; keeps the roadmap's four scenarios | |
| Reuse scenario 2 wording | Treat Humble as "the store" — `Claim on Humble` | |

**Notes:** Deliberately exceeds the roadmap's stated four scenarios. Justified by D-53 — a
silently-expiring pick deadline is the exact failure the screen exists to prevent, so text alone
under-serves it. Rejected reusing scenario 2 because it would overload semantics that mean
third-party store activation.

### UNREDEEMABLE / expired coverage

| Option | Description | Selected |
|---|---|---|
| No button, state text in KEY | Same shape as scenario 4's confident-match case | ✓ |
| Folded into scenario 4 | One "terminal" scenario shared with REDEEMED, different text | |
| Hidden by default | Treated as dead weight alongside redeemed keys | |

**Notes:** Rejected folding because it conflates "you have it" with "you lost it". The hide-by-
default option was superseded later by the `Redeemable keys only` decision, which achieves the
same visibility outcome with accurate wording.

### At-a-glance actionable count

| Option | Description | Selected |
|---|---|---|
| No count — the list is the count | D-52's per-tab counts die with the tab bar | ✓ |
| Count in the title row | One number beside "Humble Keys" | |
| Count reflects the filtered list | "showing N of M" in the controls row | |

**Notes:** A number duplicating the list is a second source of truth that can drift.

---

## `Most recent` sort

### How to handle a sort with no data behind it

| Option | Description | Selected |
|---|---|---|
| De-risk first, then decide | One-off diagnostic on a populated order before specifying the sort | ✓ |
| Ship two evidenced sorts | Replace with `Expiring soonest` + `Alphabetical`; zero backend risk | |
| Redefine against `ClaimAnnotation` | Sort by `revealedAt`/`redeemedAt` | |
| Capture the date this phase | Add the field + bump `HUMBLE_CLASSIFIER_VERSION` upfront | |

**Notes:** Confirmed in code before asking — `HumbleKey` (`types/humble.ts:93-126`) carries no
purchase/order date. Rejected the `ClaimAnnotation` redefinition because those timestamps exist
only for keys already acted on, so most rows would sort arbitrarily and read as broken. Rejected
committing to capture before knowing whether Humble sends anything to capture. **Resolves ROADMAP
open question 1 as "still open, but now with a defined way to close it".**

### Default sort

| Option | Description | Selected |
|---|---|---|
| Expiring soonest | Carries D-53/D-56 intent; real data on every row | ✓ |
| Sort picker's first option | Matches Humble's own site | |
| Alphabetical | Most predictable for finding a known title | |

### Control persistence

| Option | Description | Selected |
|---|---|---|
| Nothing persists | All three reset on every mount | ✓ |
| Sort + checkbox persist, search doesn't | Settings-shaped controls survive restart | |
| All three survive navigation only | State lifted above the route; restart resets | |

**Notes:** The library-filtering sketch flagged filter persistence as deliberately unresolved.
This screen is visited far less often than the library, so the smallest surface wins.

---

## Scenario 1 coverage

### Which login "not logged into the store" means

| Option | Description | Selected |
|---|---|---|
| GameLib's connected account | `steam`/`gog`/`epic`.`username` from ContextProvider | ✓ |
| The store website's session | Read the Phase 40 embedded-browser cookie jar | |
| Don't model login at all | Drop scenario 1 entirely | |

**Notes:** **Resolves ROADMAP open question 2 — per-store login state IS reachable**
(`types.ts:90-133`). The chosen option was taken with its limitation stated explicitly: GameLib's
Steam connection is a `steam-user` CM session, not the browser session that actually decides
whether `store.steampowered.com/account/registerkey` works. Rejected the cookie-jar read because
it makes a UI row depend on a probe with known Tauri seams (leading-dot blindness,
`cookies_for_url()` drops, reentrant deadlock).

### Stores GameLib cannot log into (`uplay` / `battlenet` / `origin*` / `nintendo_direct` / generic)

| Option | Description | Selected |
|---|---|---|
| `Claim on [store]` → help URL | Scenario 2 with no login precondition | ✓ |
| `Reveal key` + copy, no store button | Expose the code for the user to paste | |
| Text only, no action | Treated like expired keys | |

**Notes:** Rejected text-only because it strands real, claimable keys with no path forward.

### `gog_keyless` — **user requested clarification before answering**

The user paused the batch to ask whether an in-app alternative existed, since the recommended
option took them out of the app. Investigation before re-asking found two candidates:

- **A — the existing reveal endpoint.** `POST /humbler/redeemkey` with
  `keytype=<machineName>&key=<gamekey>&keyindex=<n>` + session cookie (`adapter.ts:587-595`).
  Fully backend, no browser. Humble's web UI shows one Redeem button for both keyed and
  `direct_redeem` shapes, and `direct_redeem: true` rides on the same tpk shape the endpoint keys
  on (`fixtures/tpks.ts:551-557`). Unverified: whether `RevealResponseSchema` parses a keyless
  response, and behaviour when the GOG↔Humble link is absent.
- **B — Phase 40's embedded store browser.** `storeEmbedOpen` takes an arbitrary URL (no allowlist
  in `storeEmbedSeam.ts`), and the spike finding "one default cookie jar per PROCESS" means an
  embed at `humblebundle.com/home/keys` inherits the Humble session. Never leaves the window.

Also established: GameLib **cannot** link the GOG account itself — Phase 42 showed the Galaxy
OAuth token only reaches `api.gog.com`/`embed.gog.com`.

| Option | Description | Selected |
|---|---|---|
| Probe the endpoint first, then decide | Spend the one live entitlement testing candidate A | ✓ |
| Embedded browser — `Claim on Humble` | Ship on Phase 40 machinery, no destructive probe | |
| External browser — `Claim on Humble` | Today's behaviour; leaves the app | |
| Text only, no action | Honest, but strands the entitlement | |

**Notes:** The probe is destructive and single-shot — the operator has exactly one live
`gog_keyless` entitlement (the GOG game bought 2026-09-07), and redemption is irreversible under
D-66. Fallback order if A fails: B, then external browser.

### Probe timing

| Option | Description | Selected |
|---|---|---|
| Before planning, as a spike | Phase 43 then implements one path, not a branch | ✓ |
| Inside the phase, as plan 1 | Keeps it in the phase record | |
| Don't probe — pick a UI path now | One-entitlement sample makes the probe expensive | |

---

## Search / hide-redeemed

### Search scope

| Option | Description | Selected |
|---|---|---|
| Title only | The row's single visible label | ✓ |
| Title + store name | Also matches "steam" / "GOG" / "Ubisoft Connect" | |
| Title + store + bundle origin | Everything the key carries | |

**Notes:** 42-04 dropped the `· {{origin}}` segment because 20 of 33 live keys carry the junk gift
string "A very special gift just for you". Matching a field the user cannot see, and which is
noise on most rows, invites confusing zero-results. Store-name search was rejected on the grounds
that a STORE facet answers it better — recorded as a deferred idea.

### Filter default

| Option | Description | Selected |
|---|---|---|
| Off — show everything | Opens as a complete inventory | |
| On — hide redeemed by default | Opens on the actionable set | ✓ |

### What counts as "redeemed"

| Option | Description | Selected |
|---|---|---|
| REDEEMED only, both provenances | Hides user-marked and ownership-settled; leaves expired visible | |
| REDEEMED + UNREDEEMABLE | Hides everything terminal | ✓ *(semantics — with a corrected label)* |
| REDEEMED + owned-elsewhere | Also hides unsettled fuzzy-owned keys | |

**User's response (free text):** *"change text (which in humble is option 2) to be more correct.
Maybe 'Redeemable keys only'"*

**Notes:** The user took option 2's semantics but rejected the roadmap's label as inaccurate. This
**inverts the control's polarity** — checked now means "show only redeemable" rather than "hide
redeemed". Combined with the On default, the list opens on the redeemable set. A follow-up question
confirmed UNPICKED belongs **in** the redeemable set, which lands the predicate exactly on the
shipped, unit-tested `WAITING_STATES` constant (`viewFilters.ts:20`) — no new predicate needed.

**Superseded by 260911-t0p:** live use showed a REVEALED key (already redeemed on Humble, only
needing on-platform activation) still appearing under "Redeemable keys only", which the checkbox's
own corrected label promises it will not. A direct user instruction to that quick task reversed
this selection for REVEALED specifically: the checkbox now filters on a new, separate constant,
`REDEEMABLE_ONLY_STATES` = `{UNPICKED, UNREVEALED}` (`viewFilters.ts`), which excludes REVEALED.
`WAITING_STATES` itself is unchanged and still backs `selectKeysWaiting` and the per-row claim
gate — this supersession touches only the checkbox predicate.

### UNPICKED in or out of "redeemable"

| Option | Description | Selected |
|---|---|---|
| In — reuse `WAITING_STATES` | `{UNPICKED, UNREVEALED, REVEALED}`; zero new code | ✓ |
| Out — strictly redeemable | `{UNREVEALED, REVEALED}`; literally correct, needs a new predicate | |

**Notes:** Literal accuracy lost to D-53 — UNPICKED is the one row type whose deadline is silent
and unrecoverable, so hiding it defeats the screen's purpose.

**Superseded by 260911-t0p:** the selected "reuse `WAITING_STATES`" wiring is no longer what the
checkbox uses — see the supersession note above the preceding table. UNPICKED itself is still IN
the redeemable set (`REDEEMABLE_ONLY_STATES` retains it); only REVEALED's membership changed.

---

## What the row drops

### State badge and expiration placement

| Option | Description | Selected |
|---|---|---|
| Both into KEY | KEY becomes the status-and-action cell; GAME stays a clean title | ✓ |
| State into KEY, expiration into GAME | Expiry as a caption under the title | |
| Both into GAME as captions | KEY is buttons only | |

**Notes:** Follows the roadmap's "other descriptive text moves into the KEY column" literally.

### `UrgencyBadge` placement

| Option | Description | Selected |
|---|---|---|
| Stays adjacent to the title in GAME | Urgency is about the game; GAME is where the eye lands | ✓ |
| Into KEY with the other status | All status in one column | |
| Leading edge, before TYPE | A dedicated urgency gutter | |

**Notes:** Rejected moving it into KEY because it would compete with the action button for
attention — the opposite of the badge's purpose. Rejected the gutter as a fourth column the
roadmap did not scope.

### The two `ready: live-gate` store-icon todos

| Option | Description | Selected |
|---|---|---|
| Re-verify against the new row, then close | Carry the live gate forward onto this phase's row | ✓ |
| Close as superseded, no new gate | Fastest; retires two unverified claims unmeasured | |
| Leave both open | Honest ledger, but they rot against a changed row | |

**Notes:** The geometry they describe becomes moot, but the underlying risks (`fill: currentColor`
inheritance across themes, alignment to the title line-box) apply identically to the new `TYPE`
column, and Phase 42's own context demands pixel/computed-style measurement on this exact row.

---

## Deleted-tab salvage

### The three routes

| Option | Description | Selected |
|---|---|---|
| Collapse to one route, redirect the old three | Cheap insurance for bookmarks and history | ✓ |
| Collapse to one route, delete the old three | Cleanest removal; stale links 404 | |
| Keep the paths as filter presets | Preserves links and meaning | |

**Notes:** Filter presets rejected — they resurrect per-view state (the thing this phase removes)
and collide with "nothing persists".

### The pinned "Expiring soon" section (D-86..D-89)

| Option | Description | Selected |
|---|---|---|
| No — the default sort does the job | `Expiring soonest` already puts those keys on top | ✓ |
| Yes — keep the pinned section | Preserves shipped, tested behaviour | |
| Only under the default sort | Section appears and vanishes as sort changes | |

**Notes:** A pinned section is a second mechanism doing the same job as the default sort, and it
has no coherent meaning under `Alphabetical`. `partitionWaitingByUrgency` loses its only caller.

### `HumbleKeyGroup` + `groupKeys.ts`

| Option | Description | Selected |
|---|---|---|
| Delete both — flat list, no groups | No caller left; the "Other" bucket died with generic rows | ✓ |
| Keep `groupKeys.ts`, delete the component | Retain the pure helper in case grouping returns | |
| Keep grouping as a sort option | "Group by state" as a third sort choice | |

**Notes:** Keep `STATE_LABEL_KEYS` and `GENERIC_KEY_PLATFORM`. Verification after this answer found
that `GENERIC_KEY_PLATFORM` is exported from the module being deleted and imported by two survivors
— recorded as a landmine in CONTEXT.md, not re-asked.

---

## D-22 row contract

| Option | Description | Selected |
|---|---|---|
| Rewrite as a KEY-column contract | TYPE/GAME presentational; all action in KEY | ✓ |
| Retire it entirely | The premise is gone | |
| Keep it, add exceptions | Minimal edit, preserves the audit trail | |

**Notes:** The invariant worth keeping is not "the row is read-only" but "interactivity lives in
ONE place and nowhere else". Rejected extending the exception list — a read-only contract with
eight-plus exceptions describes nothing. Rejected retirement because the guard has demonstrably
held across four phases.

---

## Claude's Discretion

Not asked; the planner decides within the recorded constraints:

- Empty states — three become one, with the filtered-empty case distinguished from genuinely-empty
  (the sketch's zero-result recovery path). Made sharper by the On-by-default checkbox: a user with
  only terminal keys meets the filtered-empty state on first visit.
- Column-header row behaviour — static labels vs clickable-to-sort. Presumed static, since the
  roadmap specifies a separate sort picker.
- `TYPE` column rendering for no-logo platforms — D-42-03's "ragged leading edge" warning now
  applies inside a real column.
- Exact copy for all new strings, subject to the gamelib.json and new-key constraints.

## Deferred Ideas

- Store / platform / state facets, collections, and filter chips (the full library-filtering panel).
- `Group by state` as a third sort option.
- Reading the Phase 40 cookie jar for true store-session state, making scenario 1 predictive.
- Redeem deep links for `origin` / `uplay` / `battlenet` / `nintendo_direct`.
- Synthesising a GameLib-side first-seen-at date if D-43-05's diagnostic finds no Humble date —
  noting it would sort by "when GameLib noticed", not "when you bought", and must not be labelled
  `Most recent`.
