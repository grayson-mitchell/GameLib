---
created: 2026-08-23
title: "`keyring_get`'s bounded, classified timeout is UNVERIFIED live"
source: 34.4.1 gap cycle 3 (REQ-34.4.1-GAP-11); un-checked 2026-08-23 by plan 30
status: completed
severity: medium
resolves_phase: null
parked: 2026-08-23
parked_by: operator
blocked_by: "nothing external — this needs a live login that exercises keyring_get, which any live gate provides. It is not blocked, it is UNSCHEDULED."
revisit_trigger: "the next live login gate anyone runs — Phase 34.6 runs one"
related_requirement: REQ-34.4.1-GAP-11
---

# `keyring_get`'s bounded, classified timeout is UNVERIFIED live

## The claim that may NOT be made

The bounded-timeout path exists in code and the unit suite is green. **That is not the same as
having watched it fire.** `REQ-34.4.1-GAP-11`'s own body reads *"This box stays UNCHECKED —
live-only"*, and plan 30 un-checked it in 2026-08-23 precisely because a checked box with a rider
saying otherwise is worse than an unchecked one.

Every blocking defect in Phase 34.4.1 was found by a human driving the UI; none by automation, while
the suite ran 3279/3279 and then 3387/3387 fully green. **A green suite does not discharge this.**

## Why this one has teeth

An unbounded `keyring_get` can consume the sidecar's **entire 60s RPC budget**, silently. That is the
whole reason the requirement exists. It is the most consequential of 34.4.1's three parked residuals
— the other two are diagnostic-quality.

Note the scope carefully: this is an **OBSERVABILITY** requirement — a classified, bounded error
instead of a silent stall. **It is NOT a root-cause fix for F-9** ([[.]] see the F-9 todo), and
closing it will not close that.

## Greppable landmarks

- `keyring_get` — the sidecar RPC arm
- `issuing keyring_get` — the per-slot log line; the Keychain dialog itself names no item, so
  slot attribution comes from this line and nothing else
- the recorded interaction: **a keyring timeout races Keychain approval** — a slow human approving a
  dialog is not a defect, and the two must not be conflated when reading a live run

**Re-grep these before acting.** A code-read prediction on this project once outlived its own fix by
three days.

## Discharge condition — concrete, not a category

A live run in which `keyring_get` **actually times out** (or is made to, by an unavailable/blocked
keyring), producing a **classified** error inside the bound rather than a silent consumption of the
RPC budget — and the elapsed time measured, not inferred. A run in which the keyring answers
normally proves only that the happy path works, which was never in doubt.

## Park

**Parked 2026-08-23 by operator decision** ("park the three remaining items"). Parked is not
assigned: no phase owns this. It is cheap to fold into any live login gate, and Phase 34.6 runs one —
that is the natural revisit point, not a commitment.

## Disposition (2026-08-25, plan 34.6-14) — does NOT close

34.6's live gate ran the rider this todo folded into (`34.6-LIVE-GATE.md` Step 1, "Rider (folded
todo 1...)"). Two distinct `keyring_get` observations exist in that document, and neither is the
one this todo's discharge condition asks for:

1. **Step 1 itself:** at gate-recording time the rider's status was recorded explicitly as
   **"unreported"** — "neither confirmed firing nor confirmed non-firing." The gate's own text is
   explicit that a non-firing rider is NOT a discharge and must be left open, never assumed
   non-firing.
2. **Step 3** (SteamGridDB key resolution), recorded separately:
   `[shell] keyring keyring_get failed: keyring:unavailable: Platform secure storage failure: In
   dark wake, no UI possible` — a real keyring failure, but the **wrong failure mode**:
   `keyring:unavailable` is an immediate rejection, not the bounded, classified **timeout** this
   todo's discharge condition specifically requires, with elapsed time measured. The gate itself
   records this as "harmless in this run ... recorded as an observation, not scored against any
   step" — explicitly not a discharge of this rider.

Neither observation satisfies "`keyring_get` actually times out ... producing a classified error
inside the bound ... elapsed time measured, not inferred." **Stays pending, UNSCHEDULED**, per its
own park note. Phase 34.6's live login gate was the natural revisit point the park named, and it
ran — but the specific timeout event never fired (or was not reported if it did). No phase
currently owns forcing this observation.

## Disposition (2026-09-07, quick-260907-ov3) — CLOSES

Discharged from evidence that already existed. Scored clause by clause in
`.planning/quick/260907-ov3-live-gate-the-keyring-get-bounded-classi/260907-ov3-LIVE-GATE.md`
against three log archives now preserved inside the repo (they lived in `~/Library/Logs/GameLib/`
and would have rotated away).

**Primary specimen:** `260907-ov3-evidence-35-02-ab-tauri-part1.log`, the 2026-08-28 Phase 35-02 A/B
live session, commit `d629d9f30`.

    (15:49:41) SidecarKeyringSlotStore(humble-session).getToken():
               keyring_get failed: keyring:timeout trigger=unspecified elapsed=45006ms
    (15:49:49) SidecarKeyringSlotStore(steam-refresh-token).getToken():
               keyring_get failed: keyring:timeout trigger=game-page elapsed=45004ms
    (15:49:49) Steam: refresh token read failed (timeout) — this is retryable,
               keeping the signed-in session and NOT clearing any credentials

Two independent slots, one session, a naturally blocked Keychain — not a staged plant.

- **Actually timed out** — yes, twice here and once each in two further sessions (2026-08-24,
  2026-08-26).
- **Classified** — three times independently: the literal `keyring:timeout` from
  `bounded_keyring_read`; `keyring failure memoized slot=... class=timeout ms=120000` from
  `classifyKeyringFailure`, a different function; and a downstream consumer branching on the class to
  keep the session rather than clear credentials. It is NOT the `keyring:unavailable: ... In dark
  wake, no UI possible` immediate rejection the 2026-08-25 disposition rejected as the wrong failure
  mode.
- **Inside the bound, RPC budget not consumed** — 45004ms / 45006ms, both under the 60000ms
  `RUST_INVOKE_TIMEOUT_MS`, and `rustInvoke timed out after 60000ms: keyring_get` occurs ZERO times
  across the whole log archive. The absence is non-vacuous: `keyring_get` is absent from
  `UNBOUNDED_RUST_CHANNELS`, so the 60s timer was armed and would have fired.
- **Elapsed measured, not inferred** — the `elapsed=` token is a sidecar-side round-trip delta, and
  the log's own timestamps corroborate it independently on both slots: issued 15:48:56 → failed
  15:49:41, and issued 15:49:04 → failed 15:49:49. Both exactly 45s.

**Negative control, from the same session and better than anything stageable.** At 15:51:41 and
15:51:48 the same slot's `keyring_delete` — the deliberately UNWRAPPED sibling arm — produced
`rustInvoke timed out after 60000ms: keyring_delete`. Same process, same blocked Keychain, minutes
apart: the wrapped arm yields a named class at 45.0s, the unwrapped arm an opaque transport error at
60.0s. That is precisely the degradation `KEYRING_READ_TIMEOUT` exists to prevent, observed happening
next door.

**The evidence applies to today's tree**, against a named baseline: between `d629d9f30` and
`1a6b6985f` (and unchanged again through the actual scoring commit `4650dbdc4`), `const
KEYRING_READ_TIMEOUT`, `bounded_keyring_read`, `keyring_get_result`, `keyring_account`, the
`keyring_get` dispatch arm and `keyringTokenStore.ts`'s `fetchToken()` are all byte-identical, and
`RUST_INVOKE_TIMEOUT_MS` is still `60_000`. The files as WHOLES changed substantially; the claim is
scoped to those regions and no further.

**Limitations, recorded not laundered:** macOS-only, dev builds. The Rust-side
`[shell] keyring keyring_get timed out after 45s` line is a bare `eprintln!` to stderr and is in no
log file, so it is absent from the archive by construction — the discharge condition does not ask for
it. An optional forced reproduction that would capture it is written up in the gate file and was NOT
required for this close.

**Scope, unchanged.** This is the OBSERVABILITY requirement only. It is NOT a root-cause fix for F-9
and this does not close F-9.

### Why this sat open for two weeks — the transferable lesson

The park note named the revisit trigger as "the next live login gate anyone runs, Phase 34.6 runs
one". **Gates did run, and the event did fire in them** — an `elapsed=`-bearing `keyring:timeout` line
was already on disk by 2026-08-24, one day after this todo was opened and a day before its
2026-08-25 disposition was written.

The 2026-08-25 disposition was not careless: it read the gate DOCUMENT (`34.6-LIVE-GATE.md`) and
correctly found that neither of the two observations that document recorded was a discharge. Its own
hedge — *"the specific timeout event never fired **(or was not reported if it did)**"* — names the
exact gap it could not see past. **The miss was of source, not of rigour: the gate documents were
re-read, the LOG ARCHIVE was not.** A gate document records what its author looked for; it is not a
census of what the run emitted.

**Rule for the next parked live-observation todo: before staging a fresh run to force an event,
grep the log archive for it.** The discharge condition here was greppable in one command
(`grep -h 'keyring:timeout.*elapsed=' ~/Library/Logs/GameLib/*.log*`) and would have closed this two
weeks earlier at zero cost — and without planting an item in a Keychain slot next to a real
credential.
