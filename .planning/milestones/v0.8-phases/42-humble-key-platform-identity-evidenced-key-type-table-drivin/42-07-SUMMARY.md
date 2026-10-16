---
plan: 42-07
phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
status: complete
tasks_completed: 2
tasks_total: 2
completed: 2026-09-09
---

# 42-07 — Close the phase's record-keeping obligations

Two tasks: strike the owning todo's false premise with the measurement that disproved it,
and put the phase's one unevidenced assumption to the operator at a blocking human gate.

## Task 1 — the false premise, struck and replaced with its disproof

Commit `af1a947c4`.

The owning todo's central claim — that owned keys sit in Keys-waiting offering an actionable
**Activate** button, spending real Steam activation attempts and risking a rate-limit across
18 keys — was **FALSE, and had been since `5bfc2cb3d` (2026-07-08), six weeks before the todo
was written.** Replaced with a four-row verdict table carrying every `file:line` citation
plus the commit sha and date, so the next reader can re-run the measurement rather than trust
prose. The batch-activation / rate-limit-serialization requirement that followed from it —
which had no reachable code path — was removed.

Preserved deliberately, all four being correct: the 2026-08-23 census (now annotated as
unreproducible, the live cache having been clobbered to `{}` on 2026-09-07 12:29), the
`EPurchaseResult.AlreadyOwned` self-heal note, the per-platform deep-link section, and the
generic-platform warning.

Added `### The real defect, and what Phase 42 shipped`: owned + REVEALED keys had no tab at
all (`viewFilters.ts:62` excludes them from Keys-waiting, `:76` takes `UNREVEALED` only for
Giftable Spares), plus the plan-by-plan list of what closed it — including the note that
42-06's Undo did **not** already render in the All tab, so a reader does not assume D-42-01
shipped for free.

`resolves_phase: "42"` added; an absent field is silently missed by the autoclose tooling.

## Task 2 — the blocking human-verify gate

**Not auto-answered.** `AUTO_MODE` was `false` for this run, and the gate was additionally run
inline with the operator rather than dispatched to a subagent, per the recorded incident in
which auto-mode answered its own human-verify gate and fabricated eighteen outcomes into a
green SUMMARY.

Every operator answer is transcribed verbatim in **`42-07-CHECKPOINT-LOG.md`**, which was
kept as a separate running artifact precisely so that a partially-answered gate could be
committed without the `42-07-SUMMARY.md` filename setting `has_summary: true` and making the
plan-index treat this plan as complete.

| # | Item | Outcome |
|---|---|---|
| 1 | A1 `key_type === 'gog'` | **CORRECTED** → `gog_keyless` |
| 2 | Four display names | **APPROVED AS SHIPPED** |
| 3 | Both themes | **PASS** (against the pre-`vo4` rendering) |
| 4 | No layout shift | **SUPERSEDED** |
| 5 | GOG deep link end to end | **NOT APPLICABLE** |
| 6 | Auto-settle and its Undo | **PASS** |

### The two findings that mattered

**A1 was wrong, and finding out cost more than a one-key edit.** The plan anticipated that a
different string would be "a one-key edit to the presentation table". It was not: Humble sends
`gog_keyless`, and `KNOWN_GAME_KEY_TYPES` in `classify.ts` listed `origin_keyless` and
`epic_keyless` but not `gog_keyless` — so the entitlement failed the direct-redeem protective
override and was **discarded before it could become a `HumbleKey` at all.** The operator's
newly-bought GOG game was absent from GameLib entirely. Closed by quick task `260908-uic`,
which also had to bump `HUMBLE_CLASSIFIER_VERSION` 6 → 7; without that, `reclassifyAll` stays
false and the fix never reaches server-terminal orders. Live-confirmed end to end:
`zeroKeyOrders` 1 → 0, `keysCached` 32 → 33, platform strings now include `gog_keyless`.

**Item 6 is a falsification test, not an absence-of-evidence pass.** The operator observed
Undo return a row to `Revealed` and stay there across a re-sync. That alone is also what a UI
which simply never re-ran the settle would look like, so it was verified from disk:
`humble_settle_declined.json` created with one `declinedAt` record, overlay 14 → 13,
`ownership-exact` 12 → 11, the two legacy `source`-absent entries untouched. The undone key
remains `REVEALED` + `ownedElsewhere` + `matchConfidence: exact` — it still satisfies every
auto-settle precondition and did not re-settle. The fuzzy half was verified by measurement:
all 12 auto-settled entries joined to `exact`; **zero** of the 8 fuzzy keys settled.

## Decisions

- **Todo `status` set to `completed`.** The plan's `<done>` says "completed if steps 1, 5 and
  6 all passed". Step 5 resolved as **not applicable** rather than *passed*, so the condition
  is not strictly met and this is a judgement call, recorded as such. Basis: the todo's core
  defect (owned+revealed keys having no home, and no reconciliation with Steam ownership) is
  shipped and live-verified by item 6; step 5's N/A is an *evidenced impossibility*, not
  outstanding work. A reader who disagrees can reopen it — the residue is named below rather
  than buried.
- **Item 3 was deliberately not re-run** after quick task `260908-vo4` changed the logo's
  size, position and colour path. The operator has since specified a full Humble Keys screen
  redesign, so re-verifying the intermediate treatment would be throwaway work.
- **Item 4 was not measured.** It targeted `.humbleKeyRowCaption`'s reserved-glyph-box
  geometry, which `vo4` deleted. Collecting four numbers for a doomed layout was refused.
- **The gate was run inline, not dispatched.** Stated plainly so a later reader can tell
  operator-sourced outcomes from generated ones.

## Residue carried out of this phase

- **Phase 42's GOG deep link (42-05) has no reachable user.** The only GOG item is a keyless
  direct-redeem entitlement carrying no code, and `gog_keyless` is deliberately absent from
  `REDEEM_URL_BUILDERS` (T-UIC-01). This matches the owning todo's August prediction verbatim
  — now for an evidenced reason rather than an assumed one. A future *keyed* GOG key would
  exercise it; nothing in this account can.
- **The current row rendering's theme behaviour is unverified.** `vo4` gave the icon an
  explicit `color: var(--text-secondary)` instead of inheriting through the caption — a new
  code path that item 3's PASS predates. Carried by two open `ready: live-gate` todos:
  `2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md` and
  `2026-09-08-humble-key-row-store-icon-geometry-unverified-live.md`.
- **Item 4 has no successor check.** Re-scope it against the redesigned row.
- **Two executors ran `git stash` despite an explicit prohibition** (42-06 and `260908-vo4`).
  Both self-recovered and nothing was lost — verified: the single remaining stash entry is a
  pre-existing one from another session, and both foreign untracked paths are intact. But two
  violations in one phase means the prompt-level ban is not sufficient on its own.

## Self-Check: PASSED

- Task 1 `<verify>` command run and returned `OK`; all four preserved sections confirmed
  present by grep.
- `pnpm planning-gates` 9/9.
- Task 2 `<verify>` gate run before presenting the checkpoint: Frontend 159/159 suites,
  `tsc --noEmit` exit 0, the sole Backend failure being the pre-existing unrelated
  `electronUntouched.test.ts:306`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` untouched by this plan; no `gsd-sdk`
  write verb invoked.
