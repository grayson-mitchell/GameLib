# 260907-ov3 — LIVE GATE (archival discharge, no operator session required)

**Discharges:** `.planning/todos/pending/2026-08-23-keyring-get-bounded-timeout-unverified-live.md`
(`REQ-34.4.1-GAP-11`).

**Scoring commit:** HEAD `4650dbdc4` (the plan was written against `1a6b6985f`; between the two,
`src-tauri/src/main.rs`, `src/backend/sidecar/keyringTokenStore.ts` and
`src/backend/sidecar/sidecarRpc.ts` are untouched — `git diff --stat 1a6b6985f..HEAD -- <those
three files>` is empty — so the drift proof below applies unchanged to the actual scoring commit).

**Evidence baseline:** `d629d9f30`.

**The one-sentence correction.** The event this todo calls UNVERIFIED had already fired live and
been reported; the miss was that nobody re-read the log archive.

---

## Evidence provenance

Source logs lived only in `~/Library/Logs/GameLib/`, outside the repo, and would have rotated away.
The three `elapsed=`-bearing archives are copied into this directory. Faithfulness proven by md5:

| File | Source path | mtime | Bytes | Source md5 | Copy md5 | Match |
|---|---|---|---|---|---|---|
| `260907-ov3-evidence-35-02-ab-tauri-part1.log` | `~/Library/Logs/GameLib/gamelib.log.35-02-ab-tauri-part1` | 2026-08-28 16:00 | 36873 | `365915d1c4f226e0133a5987995c8e31` | `365915d1c4f226e0133a5987995c8e31` | identical |
| `260907-ov3-evidence-34.6-21-gap2.log` | `~/Library/Logs/GameLib/gamelib.log.34.6-21-gap2-G2-2-and-G2-3` | 2026-08-26 18:59 | 30853 | `09eca5ad75af8d0087f9b75e39f94038` | `09eca5ad75af8d0087f9b75e39f94038` | identical |
| `260907-ov3-evidence-pre-346-12.log` | `~/Library/Logs/GameLib/gamelib.log.pre-346-12-20260823T235034Z` | 2026-08-24 11:50 | 4139 | `723a30f380a5e008ed5a83087cb4cd43` | `723a30f380a5e008ed5a83087cb4cd43` | identical |

**What each contains:**
- `260907-ov3-evidence-35-02-ab-tauri-part1.log` — the **primary specimen**. One 2026-08-28 session,
  two independent slots (`humble-session`, `steam-refresh-token`) timing out at ~45.0s each, plus the
  unwrapped `keyring_delete` sibling timing out at 60.0s twice in the same session (the negative
  control).
- `260907-ov3-evidence-34.6-21-gap2.log` — one further `elapsed=45006ms` `humble-session` timeout
  (2026-08-26 18:33:03), plus a successful `steam-refresh-token` read at `elapsed=6226ms` in the same
  file (corroborates the happy path also logs `elapsed=`, so the token is not timeout-specific
  instrumentation).
- `260907-ov3-evidence-pre-346-12.log` — one further `elapsed=45006ms` `humble-session` timeout
  (2026-08-24 11:39:19), the earliest of the four elapsed-bearing lines — one day after the todo was
  opened (2026-08-23).

**E4 census — non-qualifying archives, deliberately NOT copied:**

| File | Bytes | `keyring:timeout` present | `elapsed=` present | Why excluded |
|---|---|---|---|---|
| `gamelib.log.34.5-g6-gate2` | 351376 | yes | no | Predates quick-260817-d61, which added the `trigger=`/`elapsed=` tokens. Not discharge-bearing. |
| `gamelib.log.34.5-g6-gate3-sessionA` | 74537 | yes | no | Same reason. |
| `gamelib.log.old.34.5-g6-gate2` | 5062 | yes | no | Same reason. |

None copied — none is discharge-bearing, and the largest alone is 351 KB against ~72 KB for the
three qualifying files. Absence is a recorded decision, not an oversight.

---

## Discharge-condition scoring

The discharge condition, verbatim from the todo:

> A live run in which `keyring_get` **actually times out** (or is made to, by an unavailable/blocked
> keyring), producing a **classified** error inside the bound rather than a silent consumption of the
> RPC budget — and the elapsed time measured, not inferred.

Every bar below is a runnable grep against the **in-repo copy**
(`260907-ov3-evidence-35-02-ab-tauri-part1.log`), never against `~/Library/Logs/GameLib/`, which will
rotate. All commands were actually run at scoring commit `4650dbdc4`.

```bash
Q=.planning/quick/260907-ov3-live-gate-the-keyring-get-bounded-classi
P="$Q/260907-ov3-evidence-35-02-ab-tauri-part1.log"
```

| Clause | Command | Expected | Observed | Verdict |
|---|---|---|---|---|
| **C1/C2** — real `keyring_get` timeouts, classified | `grep -cE 'SidecarKeyringSlotStore\((steam-refresh-token\|humble-session)\)\.getToken\(\): keyring_get failed: keyring:timeout trigger=[a-z-]+ elapsed=[0-9]+ms' "$P"` | 2 | **2** | MET |
| **C2(b)** — independent second classifier | `grep -cE 'keyring failure memoized slot=[a-z-]+ class=timeout ms=120000 trigger=' "$P"` | 2 | **2** | MET |
| **C2(c)** — downstream consumer branches on the class | `grep -cF 'refresh token read failed (timeout) — this is retryable' "$P"` | ≥1 | **4** (two distinct timeout events, each logged twice — L45/L48 for the 15:49:49 event, L63/L80 for a later memo-hit re-check at 15:50:31) | MET |
| **C4** — elapsed measured | `grep -oE 'keyring:timeout[^\n]*elapsed=[0-9]+ms' "$P" \| grep -oE '[0-9]+ms'` | `45006ms`, `45004ms` | **`45006ms`, `45004ms`** | MET |
| **C4 corroboration** — wall-clock agrees with self-reported elapsed | `grep -nE 'getToken\(\): issuing keyring_get \(may prompt\) trigger=' "$P"` | `15:48:56`, `15:49:04` | **`15:48:56` (L18), `15:49:04` (L32)** — issued 15:48:56 → failed 15:49:41 = 45s; issued 15:49:04 → failed 15:49:49 = 45s. Agrees to the second on both slots. | MET |
| **C3** — inside the bound, RPC budget not consumed | `grep -c 'rustInvoke timed out after 60000ms: keyring_get' "$P"` | 0 | **0** | MET |
| **C3 non-vacuity** — the 60s timer WAS armed for `keyring_get` | `sed -n '96,100p' src/backend/sidecar/sidecarRpc.ts \| grep -ci keyring` | 0 (absent from `UNBOUNDED_RUST_CHANNELS`) | **0** — the list is exactly `RUST_DIALOG_OPEN`, `RUST_DIALOG_MESSAGE`, `RUST_DIALOG_SAVE` | MET |
| **X1** — not the 34.6 Step-1 "unreported" rider | inspection: different session/file/date, four elapsed-bearing lines across three archives | distinct | **distinct** — this todo's 2026-08-25 disposition scored the 34.6 gate document, not the log archive; the archive has four elapsed-bearing lines the gate document never named | MET |
| **X2** — not the `keyring:unavailable` wrong-failure-mode rejection | `grep -c 'keyring_get failed: keyring:unavailable' "$P"` | 0 | **0** | MET |
| **F7** — real keyring arm ran, not the dev vault | `grep -cF '[bootstrap] secret stores: keyring' "$P"` / `grep -cF '[bootstrap] secret stores: dev-vault' "$P"` | ≥1, then 0 | **1**, then **0** | MET |
| **NC** — the unwrapped sibling, same session, opaque transport timeout | `grep -cF 'clearToken(): keyring_delete failed: rustInvoke timed out after 60000ms: keyring_delete' "$P"` | 2 | **2** (L88 15:51:41, L89 15:51:48) | MET |

**No disagreement between any expected and observed value.** No bar was widened, narrowed, or
re-derived to fit the evidence.

**Quoted lines (primary specimen):**

```
L18 (15:48:56) SidecarKeyringSlotStore(humble-session).getToken(): issuing keyring_get (may prompt) trigger=unspecified
L32 (15:49:04) SidecarKeyringSlotStore(steam-refresh-token).getToken(): issuing keyring_get (may prompt) trigger=game-page
L40 (15:49:41) keyring failure memoized slot=humble-session class=timeout ms=120000 trigger=unspecified
L41 (15:49:41) SidecarKeyringSlotStore(humble-session).getToken(): keyring_get failed: keyring:timeout trigger=unspecified elapsed=45006ms
L43 (15:49:49) keyring failure memoized slot=steam-refresh-token class=timeout ms=120000 trigger=game-page
L44 (15:49:49) SidecarKeyringSlotStore(steam-refresh-token).getToken(): keyring_get failed: keyring:timeout trigger=game-page elapsed=45004ms
L45 (15:49:49) Steam: refresh token read failed (timeout) — this is retryable, keeping the signed-in session and NOT clearing any credentials
L88 (15:51:41) SidecarKeyringSlotStore(steam-refresh-token).clearToken(): keyring_delete failed: rustInvoke timed out after 60000ms: keyring_delete
L89 (15:51:48) SidecarKeyringSlotStore(steam-refresh-token).clearToken(): keyring_delete failed: rustInvoke timed out after 60000ms: keyring_delete
```

---

## Code drift — the evidence applies to today's tree

Baseline sha `d629d9f30` — `docs(35-02): item 1 verdict BOTH — corrects an incomplete Electron
record`, 2026-08-28, resolved and read via `git log -1 --format='%h %ad %s' d629d9f30`, not assumed.

| # | Region | Command | Result |
|---|---|---|---|
| D1 | baseline sha, resolved | `git log -1 --format='%h %ad %s' d629d9f30` | `d629d9f30 Fri Aug 28 15:59:57 2026 +1200 docs(35-02): item 1 verdict BOTH — corrects an incomplete Electron record` |
| D2a | `const KEYRING_READ_TIMEOUT` | extracted at baseline L1278 / HEAD L2218, text compared | identical text (`const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs(45);`), moved by line-shift only |
| D2b | `fn keyring_account` | extracted baseline L271→HEAD L1076, brace-balanced body, md5 | **`0640c1e837a85d504749a91ea0dea189`** at both revisions — identical |
| D2c | `fn keyring_get_result` | extracted baseline L3197→HEAD L4332, brace-balanced body, md5 | **`1edef35637f552ad78a890536c8865f7`** at both revisions — identical |
| D2d | `fn bounded_keyring_read` | extracted baseline L3220→HEAD L4355, brace-balanced body, `diff -q` | **identical** (13 lines each side) |
| D2e | `"keyring_get" => {` dispatch arm | extracted baseline L3334→HEAD L5550, brace-balanced body, `diff -q` | **identical** (18 lines each side) |
| D3 | `keyringTokenStore.ts` `fetchToken()` (from `private async fetchToken` to just before `async setToken`) | extracted baseline L315-398→HEAD L382-465, `diff -q` | **identical** (84 lines each side). Independently re-measured md5 = `613010da40cbc47f0c44b1d09a627ece` at both revisions — the executor's own md5 tool produces a different digest string than the one quoted during planning, but the byte-identity claim itself is independently corroborated, which is the load-bearing fact. |
| D4 | `RUST_INVOKE_TIMEOUT_MS` value | `git show <rev>:src/backend/sidecar/sidecarRpc.ts \| grep 'RUST_INVOKE_TIMEOUT_MS ='` | `60_000` at baseline (line 58), at plan-time HEAD `1a6b6985f` (line 60), and at scoring HEAD `4650dbdc4` (line 60) — value unchanged, only the line number moved |
| D5 | honest scope of the drift claim | `git diff --stat d629d9f30 1a6b6985f -- src-tauri/src/main.rs src/backend/sidecar/keyringTokenStore.ts src/backend/sidecar/sidecarRpc.ts` | `main.rs` **+5478/-0** lines net across the file, `keyringTokenStore.ts` **79** lines changed, `sidecarRpc.ts` **30** lines changed — 3 files changed, 5297 insertions(+), 290 deletions(-) |

**D5, stated honestly.** The claim is **not** "these files are unchanged" — they changed
substantially as wholes. The claim is that the five specific regions the discharge depends on
(`KEYRING_READ_TIMEOUT`, `bounded_keyring_read`, `keyring_get_result`, `keyring_account`, the
`keyring_get` dispatch arm, and `keyringTokenStore.ts`'s `fetchToken()`) are byte-identical, and the
outer RPC bound's value is unchanged. The `keyringTokenStore.ts` churn is in the `isAvailable()`
reachability-probe path (quick-260905-jx3 / l8g), which the discharge does not touch.

**Additionally verified for this scoring:** `git diff --stat 1a6b6985f..HEAD -- src-tauri/src/main.rs
src/backend/sidecar/keyringTokenStore.ts src/backend/sidecar/sidecarRpc.ts` is **empty** — none of
the three files changed at all between the plan's stated HEAD and the actual scoring commit
`4650dbdc4`, so the region proof above applies unmodified to today's tree.

---

## Recorded limitations

- **macOS-only, dev builds.** The archive contains no Windows or Linux observation.
- **The Rust-side stderr line (F5) is absent from the archive by construction.** The Rust arm emits a
  bare `eprintln!` (`[shell] keyring keyring_get timed out after 45s ...`) to stderr only — it is in
  no log file, not `gamelib.log`, not `gamelib-shell.log`. The discharge condition does not ask for
  it.
- **Scope, unchanged and load-bearing: this is the OBSERVABILITY requirement.** It is NOT a
  root-cause fix for F-9 and closing it does not close F-9.

---

## Optional reproduction on today's binary (NOT required for the close)

**This does not gate the close. Its only new contribution is capturing the Rust-side stderr line
(F5), which is absent from the archive by construction and which the discharge condition does not
require.** The "reproduces on today's binary" value is largely pre-paid by the D2/D3 byte-identical
region proof above. Its bars start at `(not run)` and stay there unless an operator supplies raw
output.

### Why the `steamgrid-api-key` slot, and only that slot

An item created without `-A` does not list `gamelib-shell` among its trusted applications, so every
read raises a macOS authorization dialog — and a macOS Keychain authorization dialog **blocks until
answered**. Left unanswered, the read blocks the full 45s bound.

`steamgrid-api-key` is the right target on three grounds: it is allowlisted (F1), so
`keyring_account()` resolves it rather than returning `keyring:unknown-slot`; it is currently
**absent** (F2), so planting and deleting it destroys nothing; and it is low-stakes — a SteamGridDB
API key, not a login credential. `~/Library/Application Support/gamelib/config.json` has
`"steamGridDbApiKey": ""`, which is falsy, so `migrateSteamGridDbApiKey()` early-returns and no
boot-time `keyring_set` will overwrite the plant — **re-check this before planting; it is a
precondition, not a permanent property.**

**`steam-refresh-token` MUST NOT be the forcing target.** Real credential, documented history of
destruction, PRESENT, and its own read hangs for minutes.

### Plant — Variant 1 (try first)

```bash
security add-generic-password \
  -s com.gamelib.launcher \
  -a steamgrid-api-key \
  -l gsd-260907-ov3-planted \
  -w 'gsd-260907-ov3-dummy'
```

- **No `-A` and no `-T`** is the load-bearing part: it leaves `gamelib-shell` off the trusted list.
- **No `-U`** is deliberate — the command then FAILS if an item already exists, refusing to overwrite
  anything the census missed.
- `-l gsd-260907-ov3-planted` gives a unique label that teardown asserts before deleting.

### Plant — Variant 2 (escalation, only if Variant 1 does not block)

Tear down first, then re-plant naming exactly one trusted app that is definitively not GameLib:

```bash
security add-generic-password -s com.gamelib.launcher -a steamgrid-api-key \
  -l gsd-260907-ov3-planted -T /usr/bin/true -w 'gsd-260907-ov3-dummy'
```

Only after **both** variants fail to block may the run be scored INCONCLUSIVE.

### Teardown — mandatory whatever the outcome

```bash
# 1. GUARD: confirm the item is OURS. Non-prompting (no -w, no -g).
security find-generic-password -s com.gamelib.launcher -a steamgrid-api-key 2>&1 \
  | grep -c 'gsd-260907-ov3-planted'      # must be >= 1 before proceeding

# 2. Delete. The -a flag is LOAD-BEARING.
security delete-generic-password -s com.gamelib.launcher -a steamgrid-api-key

# 3. Re-census; must match F2 exactly.
for s in steam-refresh-token humble-session humble-csrf steamgrid-api-key; do
  printf '%-22s ' "$s"
  security find-generic-password -s com.gamelib.launcher -a "$s" >/dev/null 2>&1 \
    && echo PRESENT || echo absent
done
```

⚠ **`security delete-generic-password -s com.gamelib.launcher` WITHOUT `-a` deletes the first matching
item for the service, which may be `steam-refresh-token`.** The `-a steamgrid-api-key` is not
optional. Step 1's label guard exists so a mis-targeted delete is caught before it fires.

### Hazards, all of which apply

1. **Never Allow / Always Allow the Keychain dialog** — that adds `gamelib-shell` to the item's ACL
   and destroys the forcing condition. Touch nothing until the `keyring:timeout` line appears in
   `gamelib.log`; then click **Deny** / **Cancel**.
2. **Never use the `steam-refresh-token` slot as the forcing target.** It holds a real credential and
   this project has destroyed that slot before. Perform no Steam gesture during the run either — that
   slot is PRESENT (F2) and its read has historically hung 48.9s / 291s, which would put a second
   blocked read in flight and make the measurement unattributable. The Keychain dialog names no item;
   slot attribution comes only from the `issuing keyring_get` log line.
3. The UI may freeze for up to 45s. Expected, not a crash. Do not force-quit.
4. **120s memo (F6):** a second gesture inside the window logs `memo hit ... without a second
   keyring_get` and measures nothing. Restart the app between observations.
5. `GAMELIB_DEV_SECRET_VAULT` must be unset in the launching shell (F7).
6. Launch `pnpm tauri:dev` — never bare `tauri dev` (stale static bundle) — and **TEE stderr**, or
   the one line this run exists to capture is lost.
7. `pnpm tauri:dev` exits 0 without replacing a running instance. Quit GameLib first; confirm
   `pgrep -f gamelib-shell | wc -l` is `1` after launch (a second instance splits the shell sink).
8. Sweep the orphaned node sidecar and `vite` after each run — dev teardown does not reap them and a
   PATH-based sweep misses `vite`.
9. **A dialog answered before 45s elapses VOIDS the run; it is not a FAIL.** "A keyring timeout races
   Keychain approval" is a recorded interaction and the todo names it: a slow human is not a defect.

### Procedure

- **Step 0.** Quit GameLib. Census all four slots; expect `PRESENT / absent / absent / absent` (F2).
  Confirm `env | grep -c GAMELIB_DEV_SECRET_VAULT` is `0`. Confirm
  `grep 'steamGridDbApiKey' ~/Library/Application\ Support/gamelib/config.json` is the empty string —
  if it is not, **STOP**: the boot-time migration would `keyring_set` over the planted item.
- **Step 1.** Plant the foreign-ACL item (Variant 1).
- **Step 2.** `pnpm tauri:dev 2>&1 | tee <Q>/260907-ov3-repro-shell.log`.
- **Step 3.** Open **Settings → the SteamGridDB API key field** (its mount fires
  `steamgriddb.hasApiKey` → `getApiKey()` → `getToken()` on the `steamgrid-api-key` slot). Fallbacks:
  the **Add Game / Sideload** dialog, or right-click a game → **Edit**. Then wait, touching nothing.
  If no dialog appears and the read returns fast, tear down and retry once with Variant 2
  (`-T /usr/bin/true`); only if that also fails to block is the run INCONCLUSIVE.
- **Step 4.** Quit, Ctrl-C the tee, `cp ~/Library/Logs/GameLib/gamelib.log <Q>/260907-ov3-repro-gamelib.log`,
  sweep orphans.
- **Step 5.** **TEARDOWN, mandatory whatever the outcome:** label guard → delete → re-census. See
  above; the `-a steamgrid-api-key` argument is load-bearing.
- **Step 6.** Paste back: both censuses, the raw output of each optional bar, and whether a dialog
  appeared.

### Optional-run bars — all start at `(not run)`

| Bar | Assertion | Expected | Result |
|-----|-----------|----------|--------|
| R1 | `grep -cE 'SidecarKeyringSlotStore\(steamgrid-api-key\)\.getToken\(\): issuing keyring_get \(may prompt\) trigger=' repro-gamelib.log` | `>= 1` (slot attribution) | (not run) |
| R2 | `grep -cE 'SidecarKeyringSlotStore\(steamgrid-api-key\)\.getToken\(\): keyring_get failed: keyring:timeout trigger=[a-z]+ elapsed=[0-9]+ms' repro-gamelib.log` | `>= 1` | (not run) |
| R3 | elapsed from R2 | integer in `[45000, 46000]` — **do not widen after the fact** | (not run) |
| R4 | `grep -cF '[shell] keyring keyring_get timed out after 45s' repro-shell.log` | `>= 1` — **the one thing the archive cannot supply** | (not run) |
| R5 | `grep -c 'rustInvoke timed out after 60000ms' repro-gamelib.log repro-shell.log` | `0` | (not run) |
| R6 | post-teardown four-slot census | matches F2: PRESENT / absent / absent / absent | (not run) |

**Task 3 status: awaiting an operator.** This section was not run during this execution — the
executor does not have a channel to the operator and cannot answer this gate on their behalf. Every
bar above stays `(not run)` unless the operator later pastes raw Steps 0–6 output. If the operator
declines, the correct annotation is `not run, declined — the close does not depend on it`.

---

## Verdict

**All four discharge clauses (C1–C4) plus X1, X2, and the code-drift claim (D) are MET, each backed
by a runnable in-repo grep with the observed value matching the expectation exactly.** The negative
control (NC) is also MET, and for free — it comes from the same session as the primary specimen: at
15:51:41 and 15:51:48 the deliberately-unwrapped `keyring_delete` sibling, same slot, produced the
opaque `rustInvoke timed out after 60000ms: keyring_delete` transport error, while the wrapped
`keyring_get` reads on the same blocked Keychain, minutes earlier, produced a named `keyring:timeout`
classification at 45.0s. This is a better negative control than anything that could be staged,
because both arms ran against the same blocked Keychain in the same process.

**Discharge condition satisfied from archived evidence. The todo closes** (Task 2 of this plan).

Task 3 (optional forced reproduction) is not required for this close and was not run — its only
value would be capturing the Rust-side stderr line (F5), which the discharge condition does not
require and which is pre-paid by the D2/D3 byte-identical region proof.
