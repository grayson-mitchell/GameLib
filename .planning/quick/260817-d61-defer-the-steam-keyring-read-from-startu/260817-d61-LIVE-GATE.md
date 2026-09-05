# 260817-d61 — LIVE GATE (operator session)

**Why this exists.** Every gate in `260817-d61-PLAN.md` is structural. `GAMELIB_DEV_SECRET_VAULT=1`
bypasses the macOS Keychain in every dev/CI/jest run, and jest cannot observe a Keychain prompt at
all, so nothing in the suite can show that the prompt moved. This is the only procedure that can.

Discharges: Phase 34.5 ledger rows `U-34.5-01` / `U-34.5-10` (plan `34.5-58`), and the measurement
half of `.planning/todos/pending/keyring-read-lazy-at-point-of-use.md`.

---

## READ THIS FIRST — two slots that are NOT Steam still prompt at startup

Confirmed in the preserved pre-fix log `~/Library/Logs/GameLib/gamelib.run3.log`:

```
(11:33:00) SidecarKeyringSlotStore(humble-session).getToken():      issuing keyring_get (may prompt)
(11:33:00) SidecarKeyringSlotStore(steam-refresh-token).getToken(): issuing keyring_get (may prompt)
(11:33:23) SidecarKeyringSlotStore(humble-csrf).getToken():         issuing keyring_get (may prompt)
```

**Three slots read at startup. This task deferred exactly one of them — `steam-refresh-token`.**
`humble-session` and `humble-csrf` are untouched and will still fire unattended Keychain prompts at
boot.

Consequences for this gate:

- **Seeing a Keychain prompt at startup is NOT a failure of this fix.** You must attribute the
  prompt to a slot via the log before judging anything. Judge by slot name, never by "I saw a
  prompt".
- The user-visible symptom ("an unexplained Keychain prompt at boot") is therefore only
  *partially* fixed. If the underlying hypothesis is right — that context-free prompts get
  dismissed — Humble's two prompts still have that defect, and they train the dismissal habit that
  Steam's later prompt then inherits. Record this; it is likely a follow-up todo regardless of how
  this gate lands.

---

## Preconditions

1. **`GAMELIB_DEV_SECRET_VAULT` MUST be unset.** If set, the Keychain is bypassed and this entire
   gate is vacuous — it would pass against a build with the fix reverted.
   ```bash
   env | grep GAMELIB_DEV_SECRET_VAULT   # must print nothing
   ```
2. A Steam account must be logged in with a token actually stored in the `steam-refresh-token`
   slot. If the slot is empty the read returns `absent` and proves nothing about prompt timing.
3. Build with `pnpm tauri:dev` — **never bare `tauri dev`**, which serves a stale static bundle and
   would test the pre-fix code while looking correct.
4. Quit any running GameLib instance first. A second instance splits the `[shell]` log sink and the
   absence-grep below becomes unreliable.

## Grep calibration (already performed — do not skip on a re-run)

**WIDENED 2026-09-05 by quick-260905-kd0.** The original pattern below matched `keyring_get` on the
`getToken()` path only. That is NARROWER than the property this gate claims to hold, which is "no
Steam Keychain prompt at startup". `SidecarKeyringSlotStore` reaches the Keychain through **four**
channels, and all four can prompt — `setToken()`'s and `clearToken()`'s own source comments say so:
*"a write is a real Keychain round trip and can prompt"*, and *"a delete is a real Keychain round
trip that can prompt. A 2026-08-14 session observed TWO prompts during a single Steam sign-out."*

| Channel | Can prompt | Pre-invoke announcement | Post-invoke line |
|---|---|---|---|
| `keyring_get` | yes | `(may prompt)` | `ok` / `failed` |
| `keyring_available` | **no, since quick-260905-l8g** | `(non-prompting reachability probe)` | `ok` / `failed` |
| `keyring_set` | yes | **none** | `ok len=` / `failed` |
| `keyring_delete` | yes | **none** | `ok` / `failed` |

For an ABSENCE gate the post-invoke line suffices — a completed round trip always leaves one — so
the pattern keys on the announcement *and* the outcome line, covering all four.

**`keyring_available` stays in the pattern even though it can no longer prompt.** It still makes a
round trip at boot, which is worth seeing on its own; and it is precisely the channel whose
regression back to the prompting path this gate would need to catch. Dropping it on the grounds
that "it does not prompt any more" would rebuild the blind spot this gate already had once. The
same rule is pinned in code by the prompting-channel ledger in
`src/backend/sidecar/__tests__/keyringTokenStore.test.ts`.

**What quick-260905-l8g changed.** The arm used to call `entry.get_password()` on the caller's real
slot — a full secret read that raised an authorization dialog. It now probes a
deliberately-never-written account, which returns `errSecItemNotFound` immediately: no item, no
ACL, no dialog. Measured on this hardware 2026-09-05 at **16.28 ms / 15.12 ms / 16.75 ms**
(`Err(NoEntry)` every time) against **48.87 s / 291.08 s** for the old present-account read. A
Keychain dialog blocks until answered, so a probe returning in milliseconds provably did not raise
one.

**This widening is only non-vacuous because of `0fdbdac36`.** Before it, a successful
`keyring_available` emitted no line whatsoever, so an absence-assertion over it would have been
vacuously true by construction: a false green. Do not port this pattern to a build that predates
that commit.

**The widened pattern (use this one):**

```bash
GATE_A_PATTERN='SidecarKeyringSlotStore\(steam-refresh-token\)\.[a-zA-Z]+\(\): (issuing )?keyring_(get|available|set|delete)\b'
```

**Calibration, measured 2026-09-05 — not asserted.** Two specimens. The known-bad one is the real
2026-08-17 pre-fix log, still present on the operator machine. The second was generated FROM THE
CODE (a throwaway jest run capturing real logger output, then deleted) rather than retyped from a
display copy, and is preserved at
`.planning/quick/260905-kd0-widen-the-260817-d61-absence-grep-to-cou/260905-kd0-specimen-startup-probe.log`.

| Pattern | code-generated specimen | real pre-fix log | humble-slot false hits |
|---|---|---|---|
| OLD `getToken(): issuing keyring_get` | **1** — misses the `keyring_available` line entirely | 1 | 0 |
| WIDENED (above) | **4** | **2** | **0** |

The OLD pattern scoring 1 where the WIDENED scores 4 on the same file **demonstrates the hole
rather than arguing it**. The WIDENED pattern still hitting the real pre-fix log preserves the
calibration property — a later zero is meaningful, not a broken pattern. Zero humble-slot hits
confirms it stays slot-scoped, which Gate A's third PASS bullet requires.

```bash
# reproduce both columns
grep -cE "$GATE_A_PATTERN" ~/Library/Logs/GameLib/gamelib.run3.log   # => 2  (known-bad specimen)
grep -cE "$GATE_A_PATTERN" .../260905-kd0-specimen-startup-probe.log # => 4  (all four line shapes)
```

---

## Gate A — startup issues NO Steam keyring read (proof by absence)

1. Quit GameLib completely.
2. Preserve and clear the log so the absence is unambiguous:
   ```bash
   cp ~/Library/Logs/GameLib/gamelib.log ~/Library/Logs/GameLib/gamelib.log.pre-d61-gateA 2>/dev/null
   : > ~/Library/Logs/GameLib/gamelib.log
   ```
3. `pnpm tauri:dev`. Wait for the library grid to render.
4. **Do not touch anything Steam.** Do not open the Games tab, a game page, Install, Play, or
   Refresh. Sit on a non-Steam surface. Wait ~60s.
5. Collect (widened 2026-09-05 — see Grep calibration above for why the narrow
   `issuing keyring_get` form was insufficient):
   ```bash
   GATE_A_PATTERN='SidecarKeyringSlotStore\(steam-refresh-token\)\.[a-zA-Z]+\(\): (issuing )?keyring_(get|available|set|delete)\b'
   grep -nE "$GATE_A_PATTERN" ~/Library/Logs/GameLib/gamelib.log
   grep -n "library refresh deferred" ~/Library/Logs/GameLib/gamelib.log
   ```

**PASS requires all three:**

- [ ] Zero matches for `$GATE_A_PATTERN` — i.e. zero Steam-slot Keychain round trips of ANY of the
      four channels, not merely zero `keyring_get` reads. A pass recorded with the pre-2026-09-05
      narrow pattern does not discharge this bullet and must be re-run.
- [ ] At least one `Steam: library refresh deferred until a deliberate Steam action — no
      keyring_get issued (trigger=startup)` line. *(Absence of both this AND the read would mean
      the Steam path never ran at all — a vacuous pass, not a real one.)*
- [ ] `humble-session` / `humble-csrf` lines MAY be present. Expected. Not a failure.

## Gate B — a deliberate Steam action unlocks the read

6. Now click the **Games** tab (or open any Steam game's page).
7. Watch for the Keychain prompt. It should arrive **now**, seconds after your click.
8. **Approve it.**
9. Collect:
   ```bash
   grep -n "steam-refresh-token" ~/Library/Logs/GameLib/gamelib.log
   ```

**PASS requires:**

- [ ] `issuing keyring_get (may prompt) trigger=<X>` where `<X>` is one of `game-page`,
      `user-refresh`, `user-install`, `user-play`, `login` — and **never** `startup`.
- [ ] `keyring_get ok present=true len=<n> trigger=<X> elapsed=<n>ms` — the read succeeded.
- [ ] The prompt arrived after your click, not before it.

## Gate C — the measurement (this is the actual point)

The hypothesis under test is that a context-free prompt gets dismissed, producing the observed
**9 failed reads : 1 success** ratio (7 `keyring:timeout`, 2 `keyring:unavailable`, 1 ok).

One run cannot move that ratio. Repeat Gates A+B across **at least 10 cold launches**, ideally
spread over normal use rather than back to back, and tally:

```bash
grep -h "steam-refresh-token" ~/Library/Logs/GameLib/gamelib.log* \
  | grep -oE "keyring_get (ok|failed)[^,]*" | sort | uniq -c
```

Record the post-fix ratio against the 9:1 baseline. Note `elapsed=` values too — a fast approve
supports the "context makes it obvious" story; a slow one that still succeeds suggests the user
hesitated regardless and the timing theory is weaker than assumed.

**If the ratio does not improve, the hypothesis is wrong and the todo should say so.** The deferral
is still defensible on its own terms (a prompt tied to a user action is better UX regardless), but
it would not have been the cause, and the real cause would still be open. Do not quietly reinterpret
a null result as a pass.

---

## Result

| Gate | Date | Outcome | Notes |
|------|------|---------|-------|
| A | 2026-08-17 | **PASS** | Unattended, on real hardware. See below. |
| B | 2026-08-17 | **PASS** | One `keyring_get`, `trigger=user-refresh`, fired ~6 min after boot on operator click. See below. |
| C | 2026-08-17 | **RETIRED — ill-posed** | Cannot discriminate deferral from dev-signing ACL churn on either build type. See Finding 2. |

### Gate A evidence (2026-08-17 11:38, build started 11:38:20 — 10 min after Task 3 `21f4f4767` at 11:28:24)

Not a staged test: the concurrent `260817-dib` session launched the app for its own install-watchdog
gate and never touched Steam, which is exactly Gate A's protocol.

```
steam-refresh-token 'issuing keyring_get' at startup : 0    (required 0)
'library refresh deferred ... (trigger=startup)'     : 1    (required >=1, anti-vacuity)
any steam-refresh-token line at all                  : 0
humble slots issuing at startup                      : 2    (expected — untouched by this task)
```

Grep calibrated: the same pattern returns `1` against pre-fix `gamelib.run3.log`, so the zero is a
real absence, not a broken pattern. The deferral line proves the Steam path RAN and chose to defer,
rather than never running — the zero is non-vacuous.

### Gate A, second independent run (2026-08-17 11:46, operator's own rebuild)

Reproduced unattended on a separate launch. Preserved at `gamelib.log.pre-d61-gateB`:

```
(11:46:09) humble-session  issuing keyring_get (may prompt) trigger=unspecified
(11:46:09) Steam: library refresh deferred until a deliberate Steam action — no keyring_get issued (trigger=startup)
(11:46:30) humble-csrf     issuing keyring_get (may prompt) trigger=unspecified
```

Zero `steam-refresh-token` lines. This run also **accounts for the operator's reported boot prompts**:
two came from GameLib (both Humble), the remainder from the dev-ACL path. Steam contributed none.

### Gate B evidence (2026-08-17 11:51, same session, operator clicked the Games tab)

```
(11:51:59) steam-refresh-token issuing keyring_get (may prompt) trigger=user-refresh
(11:52:24) steam-refresh-token keyring_get ok present=true len=498 trigger=user-refresh elapsed=24518ms
```

- **Exactly one** `keyring_get` in the entire session, on the Steam slot.
- `trigger=user-refresh`, never `startup` — the Games tab maps via `nav-tabs-games-tab` in the
  allowlist. Correct attribution.
- Fired ~6 minutes after app start: unambiguously click-driven, not boot-driven.
- **The read SUCCEEDED** (`present=true len=498`).

**The decisive detail — two dialogs, ONE `keyring_get`, `elapsed=24518ms`.** The operator saw two
Keychain prompts for a single read. That is precisely the ad-hoc-signature behaviour
`keyring-timeout-races-keychain-approval` documents: the ACL grant will not persist on an unstable
dev code identity, so macOS re-requests authorization mid-read. The 24.5 s spans both dialogs.

**Under the former 8 s `KEYRING_READ_TIMEOUT` this read would have TIMED OUT.** It succeeded only
because the bound is now 45 s. This is a live, single-run demonstration that the 9:1 ratio was
driven by dev-signing ACL churn rather than by prompt context — independent corroboration for
retiring Gate C below. On a stable-identity production build this is one dialog, once.

---

## FINDING 1 — `keyring_available` is a second, SILENT prompt channel — **CLOSED 2026-09-05**

> **Status: CLOSED.** Both halves fixed — the silence by quick-260905-jx3 (`0fdbdac36`), the grep
> hole by quick-260905-kd0. Line references below are refreshed to HEAD; the originals
> (`main.rs:3131`, `keyringTokenStore.ts:203-221`, `user.ts:115`, `humbleSecretStore.ts:73`) had
> gone stale by 2 000+ lines while the defect itself was completely unchanged.

`src-tauri/src/main.rs:5369-5386` (`keyring_available`) calls `entry.get_password()` at `:5372` — a
**full secret read**. It prompts exactly like `keyring_get`. But `fetchAvailable()`
(then `keyringTokenStore.ts:203-221`) logged **only on failure**: a *successful* probe was
completely silent.

**Gate A's grep could not see an `isAvailable()`-driven prompt.** That was a genuine hole in the
gate's coverage, not a hypothetical.

**Gate A survived it by luck rather than design.** Non-test `.isAvailable()` call sites, census
re-run 2026-09-05 (one new since the original audit):

| Call site | Slot | Prompts? |
|---|---|---|
| `humble/user.ts:116` (inside `storeHumbleSecret`, write-path only) | Humble | yes |
| `humbleSecretStore.ts:76` (`SLOT_STORES.sessionCookie`) | Humble | yes |
| `steamgridSecretStore.ts:71` (`SidecarSteamGridDbSecretStore.isAvailable()`) | steamgrid-api-key | **no** — the seam declares this member synchronous, so it returns `true` optimistically and never reaches `SidecarKeyringSlotStore.isAvailable()` |

There is still **no prompting Steam-slot `isAvailable()` caller**, so the Steam slot genuinely did
not touch the Keychain at startup. The steamgrid store is the near miss the original finding
predicted: it addresses a non-Humble slot and is named as if it probes, and only its synchronous
interface stops it.

**How it was closed, in the order it had to happen:**

1. `0fdbdac36` (quick-260905-jx3) made the successful probe visible — an INFO
   `issuing keyring_available (may prompt) trigger=<label>` line before the invoke and an
   `available=<bool> trigger= elapsed=` line after it, mirroring `fetchToken()`.
2. quick-260905-kd0 widened this gate's pattern to match it — **and could not have done so first.**
   Before step 1 there was no line to grep for, so an absence-assertion over `keyring_available`
   would have been vacuously true: a false green by construction.

The widening also found the original remedy too narrow: the prompt surface is **four** channels,
not two. See Grep calibration above. A CI-visible ledger test in
`src/backend/sidecar/__tests__/keyringTokenStore.test.ts` now fails if a fifth is added, so this
rule no longer depends on someone re-reading this file.

**Still not attempted, and still strictly better:** `keyring_available` maps both `Ok(_)` and
`Err(NoEntry)` to `true` — it is really asking "is the Keychain backend reachable", which may be
answerable without decrypting an item. A non-prompting probe removes the channel entirely rather
than logging it.

## FINDING 2 — Gate C is ILL-POSED and is hereby RETIRED, not deferred

Operator reported **~4 password prompts** on a `tauri dev` rebuild (generic wording: one "access
confidential information", one "access key information"). Only **2** appear in the log, both Humble
`keyring_get`. The remaining ~2 are not GameLib's `keyring_get` path at all.

**This is already-established project knowledge, not a new finding here.** It was diagnosed and
written up well before this task, and this session initially failed to recall it — recorded so the
next reader does not re-derive it a third time. The standing record is the memory
`keyring-timeout-races-keychain-approval` (reference type, updated 2026-08-14):

> "`keyring_get failed: keyring:timeout` on macOS is a code-signing problem wearing a timeout's
> clothes." A `cargo run` debug binary has an **unstable code identity**, so macOS will not persist
> the ACL grant; every read re-requests authorization. … "This is very likely a **dev-build
> artifact**. A signed, notarized production build has a stable identity, gets the ACL grant once,
> and stops prompting."

That same record is where the observed **7 timeout / 2 unavailable(Deny) / 1 ok = 9:1** ratio comes
from, and it is also the origin of this task — its closing line reads "Consider making the read lazy
so the prompt arrives with user context."

**The consequence, stated plainly.** The 9:1 ratio is a **dev-build number**, produced by ad-hoc
signing ACL churn. Therefore:

- Re-measuring it on `tauri dev` measures the ACL churn, not this fix.
- Re-measuring it on a packaged build is **also not a test of this fix**, because a stable-identity
  build was never expected to exhibit 9:1 in the first place. An improvement there would be
  attributable to the signature, not the deferral.

Gate C as originally specified ("re-measure the 9:1 ratio to confirm or kill the prompt-timing
hypothesis") therefore **cannot discriminate** between the two causes on either build type. It is
retired as ill-posed rather than left open as a task nobody can meaningfully perform.

**What this task's value actually rests on, honestly stated.** Not the failure ratio. The deferral
buys a real UX property that holds on a production build where the prompt fires *once*: the Keychain
dialog arrives attached to a deliberate user action instead of unattended at boot. That property is
proven by Gates A and B. The prompt-timing *hypothesis* about the 9:1 ratio is neither confirmed nor
refuted by this work — it was aimed at a number whose dominant cause was already known to be
something else.

**Standing guidance, unchanged:** do not re-architect secret storage on the strength of the timeout
symptom. The two legitimate fixes for the dev-prompt pestering remain (a) sign the dev build with a
stable identity, or (b) `GAMELIB_DEV_SECRET_VAULT=1`, which is opt-in and already exists.
