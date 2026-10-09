# Phase 49 — LIVE GATE contract (macOS operator session)

**Authored by plan 49-11. Run by plan 49-12. Never run by the plan that authored it (standing rule D-E).**

**Why this exists.** Phase 49's unit suite proves the classifiers, the verdict writer, the pass, the
row decision and the tile mapping against _fixtures_. Three things no fixture can reach are gated
here, because a green suite never closes a live gate
(`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` §4(ii)):

1. **The runner failure strings and exit behaviour (RESEARCH A1-A6).** `classify.ts` is
   SOURCE-DERIVED from `legendary 0.21.0`, `gogdl v1.3.0`, `nile v1.2.0` (`meta/releaseTags.ts`),
   never observed against a real expired account. A drifted marker degrades to `unknown` (safe), but
   the feature is then dead: a real expiry would never show. Only this gate can tell.
2. **Keychain denial and an ignored prompt** yield `unknown` (never `expired`) within the 45 s bound
   (P1, D-01). Needs the macOS Keychain under an ad-hoc signature.
3. **Warm-profile sidecar exit** by event-loop drain after stdin EOF (D-20). `pnpm smoke:sidecar`
   runs on a COLD profile where nothing is logged in and nothing is probed.

Plus the judgment items no test asserts: never-connected row tone across themes, dismiss
persistence, one overlay per Sign in.

**Pinned tags under test:** `legendary 0.21.0`, `gogdl v1.3.0`, `nile v1.2.0`.

---

## READ THIS FIRST

1. **This contract was reviewed before publication** (see _Structural Reachability Review_ at the
   end). The review **restated** one item (9) and added a launch (the "clear" launch, 3) and two
   conditional arms (items 5/6 and 10/11). Nothing was withdrawn. Read _Review-driven changes_ in
   that section before you start; they explain why the launch order is not the item order.
2. **Which dev command is which.** `pnpm tauri:dev` SETS `GAMELIB_DEV_SECRET_VAULT=1`
   (`package.json`, `tauri:dev`); `pnpm tauri:dev:keyring` does NOT. Items 1-6 use the vault build
   (no Keychain involved). Items 7-8 and 9-11 use `pnpm tauri:dev:keyring` **and** a shell where
   `GAMELIB_DEV_SECRET_VAULT` is unset. If the variable is exported in your shell, the "keyring"
   build still bypasses the Keychain and items 7-8 are vacuous.
3. **You are editing your real accounts' credentials.** Every edit has a paired restore and a
   positive observable proving the restore (T-49-32). Back up **after every healthy launch**, not
   once at the start: gogdl rotates refresh tokens on a successful refresh, so a backup taken before
   a healthy launch can hold a token that launch already invalidated.
4. **Nothing from `secrets/` ever leaves the session directory** (T-49-30). Redact before anything
   is copied into the repo (see _Redaction and teardown_).

---

## Launch map (item order is not launch order)

| Launch | Purpose | Build | Items it serves |
|---|---|---|---|
| 1 | Positive control, no induction: each probe reports `healthy` | `pnpm tauri:dev` | baseline for 1, 3, 5 |
| 2 | Epic, GOG and Amazon driven to `expired` | `pnpm tauri:dev` | **1, 3, 5** |
| 3 | Restore + "clear" launch: every induced store reads `healthy` again | `pnpm tauri:dev` | restore proof for 1, 3, 5; precondition for 2, 4 |
| 4 | Network failure: Epic OAuth host and `auth.gog.com` blocked | `pnpm tauri:dev` | **2, 4** |
| 5 | Amazon with nothing installed | `pnpm tauri:dev` | **6** (and item 5, arm B, if you own no Amazon game) |
| 6 | Keychain **Deny** on both boot prompts | `pnpm tauri:dev:keyring` | **7** (+ Amazon restore proof) |
| 7 | Keychain prompts **left unanswered** (relaunch, new process) | `pnpm tauri:dev:keyring` | **8** |
| 8 | Sidecar run directly against the real warm profile, stdin closed at READY | `build/main/sidecar.js` (no shell) | **9** |
| 9 | Judgment and sign-in: themes, dismiss, Sign in | `pnpm tauri:dev:keyring` | **10** (a-c), **11** |
| 10 | Relaunch: dismiss and sign-in persistence | `pnpm tauri:dev:keyring` | **10** (d), **11** (d) |

Every item below names its launch ordinal and the archived files that carry its evidence.

---

## Capture standard (dual-sink, append-and-archive)

Phase 34.4.2 lost evidence twice to a truncating `tee` and a stale second instance. The standard
below is mandatory, not guidance.

**Two sinks, never confused** (confirmed by the emitters table below):

- `terminal.log` (the `tee`'d `pnpm tauri:dev` output) carries **only** Rust `[shell]` lines and
  sidecar **stderr** (`[sidecar:err]`).
- `~/Library/Logs/GameLib/gamelib.log` carries every sidecar `logInfo`/`logWarning`:
  `[signInProbe] …`, `SidecarKeyringSlotStore(…)`, `trigger=…`. **It never reaches the transcript.**
- `~/Library/Logs/GameLib/runners/{legendary,gog,nile}.log` carry the runners' own stdout/stderr.
- Sidecar `console.*` reaches nothing. **Never demand a sidecar literal of `terminal.log`
  (F-34.4.2-14), and never read a transcript's silence as proof a path did not run (§4(i)).**

**Session setup (once, before launch 1).** Paste into one terminal and keep that terminal open for
the whole run; every later block assumes these functions exist.

```bash
umask 077
export GATE_DIR="/tmp/gamelib-gate-49-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$GATE_DIR/secrets" "$GATE_DIR/excerpts"
export LOGDIR="$HOME/Library/Logs/GameLib"
export APPSUP="$HOME/Library/Application Support"

# one-instance assertion (F-34.4.2-15, -18): empty BEFORE a launch, exactly 1 after the window is up
gate_pre() {  # gate_pre <N>
  if pgrep -f 'target/debug/gamelib-shell' >/dev/null; then
    echo "ABORT: a gamelib-shell instance already exists; quit it and re-run this launch" | tee -a "$GATE_DIR/terminal.log"; return 1
  fi
  echo "=== GATE LAUNCH ${1} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$GATE_DIR/terminal.log"
}
gate_pid() {  # gate_pid <after-window|teardown> ; must report count=1, else ABORT the launch and re-run it
  local c; c=$(pgrep -f 'target/debug/gamelib-shell' | wc -l | tr -d ' ')
  echo "=== PID CHECK ($1) count=${c} pids=$(pgrep -f 'target/debug/gamelib-shell' | tr '\n' ' ') ===" | tee -a "$GATE_DIR/terminal.log"
  [ "$c" = 1 ]
}
# flag census: file paths + the matched literal only, never a value
gate_flags() {  # gate_flags <N>
  { echo "--- flags census, launch ${1}, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    grep -rHoE '"(expired|credentialsMissing)": *true' "$APPSUP/gamelib" "$APPSUP/GameLib" --include='*.json' 2>/dev/null
  } | tee -a "$GATE_DIR/flags.log"
}
# archive AFTER the app has quit and BEFORE the next launch's first write rotates the logs
gate_archive() {  # gate_archive <N>
  cp "$LOGDIR/gamelib.log" "$GATE_DIR/gamelib-launch-${1}.log"
  for r in legendary gog nile; do
    [ -f "$LOGDIR/runners/$r.log" ] && cp "$LOGDIR/runners/$r.log" "$GATE_DIR/runner-$r-launch-${1}.log"
  done
  gate_flags "$1"
}
# credential backup AFTER every quit and BEFORE any induction (gogdl rotates refresh tokens)
gate_backup() {  # gate_backup <N>   (paths resolved in Preflight; files named *-after-L<N>)
  [ -n "$EPIC_USER" ] && cp -p "$EPIC_USER" "$GATE_DIR/secrets/epic-user.after-L${1}.json"
  [ -n "$GOG_AUTH" ]  && cp -p "$GOG_AUTH"  "$GATE_DIR/secrets/gog-auth.after-L${1}.json"
  [ -n "$NILE_USER" ] && cp -p "$NILE_USER" "$GATE_DIR/secrets/nile-user.after-L${1}.json"
  [ -n "$NILE_INSTALLED" ] && cp -p "$NILE_INSTALLED" "$GATE_DIR/secrets/nile-installed.after-L${1}.json"
}
```

**Per launch:** `gate_pre N` → start the build with its output **appended**, e.g.
`pnpm tauri:dev 2>&1 | tee -a "$GATE_DIR/terminal.log"` (or `pnpm tauri:dev:keyring …` for launches
6, 7, 9, 10) → when the window is up run `gate_pid after-window` in a second terminal → drive the
item → quit → `gate_pid teardown` is run **just before** quitting → after the process is gone,
`gate_archive N` then `gate_backup N`. **If `gate_pid` ever reports a count other than 1, the launch
is ABORTED and re-run; its evidence is not scorable.** A bare `tee`, a `>` redirect, or skipping
`gate_archive` before the next launch destroys evidence: `gamelib.log` is renamed to `.old` on the
next process's first write (`src/backend/logger/log_writer.ts:144-146`, `#archiveOldLogFile`), and
the **runner** logs rotate the same way (each `getRunnerLogWriter` is its own `LogWriter`), so the
runner logs are archived per launch too, not only `gamelib.log`.

**First pass only (before launch 1):**

```bash
cp "$LOGDIR/gamelib.log.old" "$GATE_DIR/gamelib.pre-session.old" 2>/dev/null
for r in legendary gog nile; do cp "$LOGDIR/runners/$r.log.old" "$GATE_DIR/runner-$r.pre-session.old" 2>/dev/null; done
```

**Closing inventory (last step of the whole run):**

```bash
ls -la "$GATE_DIR/"
wc -l "$GATE_DIR"/*
```

A missing or zero-length `gamelib-launch-N.log` is visible here while the evidence can still be
re-made. Do not tear down until every launch's file is present and non-empty.

---

## Where each required literal comes from (Test 3, with the SINK clause)

Line numbers are the current tree (re-grep before the run; sinks can shift).

| Literal the contract requires | Emitter (file:line) | Sink the contract reads |
|---|---|---|
| `[signInProbe] pass started stores=…` | `src/backend/signInProbe/pass.ts:198-201` (`logInfo`) | `gamelib.log` |
| `[signInProbe] <store> bound reached` | `pass.ts:212` | `gamelib.log` |
| `[signInProbe] <store> outcome=<o> elapsed=<n>ms` | `pass.ts:217-219` | `gamelib.log` |
| `[signInProbe] <store> verdict=<latched\|cleared\|unchanged\|stale>` | `src/backend/signInProbe/verdict.ts:136` | `gamelib.log` |
| `[signInProbe] pass complete outcomes=…` | `pass.ts:238-241` | `gamelib.log` |
| `Sign-in probe: <legendary/nile command>` (spawn happened) | `src/backend/launcher.ts:1714` (`logInfo`, prefix from `runnerProbes.ts:62,87`) | `gamelib.log`; also first line in the runner log (`launcher.ts:1718`) |
| `Running command: … auth` (GOG spawn happened) | `launcher.ts:1714` / `:1718` (GOG passes no `logMessagePrefix`) | `gamelib.log` and `runners/gog.log` |
| `Stored credentials are no longer valid` | emitted by the **legendary 0.21.0 binary**; constant `classify.ts:48` | `runners/legendary.log` (`launcher.ts:1748,1763` write both streams to the runner writer) |
| `HTTP request for login failed` | legendary binary; constant `classify.ts:49` | `runners/legendary.log` |
| `Failed to refresh credentials` | **gogdl v1.3.0** stderr; constant `classify.ts:50-51` | `runners/gog.log` |
| bare `null` stdout (GOG expired) | gogdl stdout; handled `classify.ts:150-157`; `authLogSanitizer` returns a non-object line unchanged (`gog/user.ts:101-112`) | `runners/gog.log` |
| `Failed to refresh the token <Response [NNN]>` | **nile v1.2.0**; constant `classify.ts:52`, pattern `:169-172` | `runners/nile.log` |
| `SidecarKeyringSlotStore(<slot>).getToken(): issuing keyring_get (may prompt) trigger=boot-probe` | `src/backend/sidecar/keyringTokenStore.ts:406` | `gamelib.log` |
| `… keyring_get failed: … trigger=boot-probe elapsed=…ms` | `keyringTokenStore.ts:413` | `gamelib.log` |
| `keyring failure memoized slot=<slot> class=<unavailable\|timeout> ms=120000 trigger=boot-probe` | `keyringTokenStore.ts:436` (memo window `:60`) | `gamelib.log` |
| `… memo hit, answering unreadable/<reason> …` | `keyringTokenStore.ts:373` | `gamelib.log` |
| `… keyring_get ok present=<bool> len=<n> trigger=boot-probe elapsed=…` | `keyringTokenStore.ts:459` | `gamelib.log` |
| `[shell] sidecar terminated on exit` | `src-tauri/src/main.rs:1940` | `terminal.log`, **informational only** (see item 9) |

The `trigger=boot-probe` label reaches both slots: Steam via `noteSteamAuthTrigger('boot-probe')` +
`readTokenOutcome(…, 'boot-probe')` (`steam/user.ts:115-116`), Humble via
`HumbleUser.probeSession('boot-probe')` → `readSecret('sessionCookie', context)`
(`pass.ts:119`, `humble/user.ts:784`).

`SIGN_IN_PROBE_BOUND_MS = 45_000` (`pass.ts:84`) equals Rust `KEYRING_READ_TIMEOUT`
(`src-tauri/src/main.rs:3079`).

---

## Preflight (no launch yet)

Record every result into `$GATE_DIR/preflight.txt` (`| tee -a`).

```bash
# 0. no instance of anything GameLib; vault variable unset in THIS shell
pgrep -f 'target/debug/gamelib-shell' ; pgrep -f 'build/main/sidecar.js'    # both must print nothing
env | grep GAMELIB_DEV_SECRET_VAULT                                         # must print nothing
# 1. build the sidecar once (item 9 runs it directly); record the tags under test
pnpm build:sidecar && ls -la build/main/sidecar.js
grep -nE "legendary|gogdl|nile" meta/releaseTags.ts
# 2. resolve credential paths (appFolder = <appData>/GameLib; userData may be .../gamelib); EMPTY = not present
export EPIC_USER="$(ls "$APPSUP"/GameLib/legendaryConfig/legendary/user.json 2>/dev/null)"
export GOG_AUTH="$(find "$APPSUP" -maxdepth 3 -path '*gog_store/auth.json' 2>/dev/null | head -1)"
export NILE_USER="$(ls "$APPSUP"/GameLib/nile_config/nile/current_user.json 2>/dev/null)"
export NILE_INSTALLED="$(ls "$APPSUP"/GameLib/nile_config/nile/installed.json 2>/dev/null)"
echo "EPIC_USER=$EPIC_USER GOG_AUTH=$GOG_AUTH NILE_USER=$NILE_USER NILE_INSTALLED=$NILE_INSTALLED"
# 3. KEY NAMES only (never values) of each credential file
for f in "$EPIC_USER" "$GOG_AUTH" "$NILE_USER"; do
  [ -n "$f" ] && node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const w=(o,p)=>{for(const k of Object.keys(o)){const q=p+'.'+k;console.log(q);if(o[k]&&typeof o[k]==='object'&&!Array.isArray(o[k]))w(o[k],q)}};w(j,'')" "$f" | sed "s|^|$(basename "$f"): |"
done
# 4. installed Amazon games (count only)
[ -n "$NILE_INSTALLED" ] && node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('nile installed count =',Array.isArray(j)?j.length:Object.keys(j).length)" "$NILE_INSTALLED"
# 5. which stores are connected (the Accounts screen) and which are NEVER connected (needed by 10/11)
```

Preflight **PASS** requires: step 0 prints nothing; the three credential paths resolve (an empty
variable means that store is not connected and its items cannot run; record and skip those items
with the reason); the key-name listing is saved. For items 10/11 record which stores are
_never connected_ (see those items).

---

## Items

Each item states: launch ordinal, preconditions (connected stores, `GAMELIB_DEV_SECRET_VAULT`), the
induction with **backup-before and restore-after**, the operator gestures, the required literals
(emitter and sink in the table above), and PASS / FAIL / FINDING. **FINDING** means "the observed
reality differs from the source-derived assumption": the classifier degrades safely, the feature is
dead for that store, and a follow-up plan is needed; it is the gate doing its job, not a gate
failure.

### Item 1 — Epic expired → latch, row, tile, Reconnect (A1, A5)

- **Launch 2.** Build `pnpm tauri:dev` (vault ON). Evidence: `gamelib-launch-2.log`,
  `runner-legendary-launch-2.log`, `flags.log`, screenshots `item1-row.png`, `item1-tile.png`.
- **Preconditions:** Epic connected (`LegendaryUser.isLoggedIn()` is `existsSync(user.json)`,
  `legendary/user.ts:707-709`, so **edit the file in place; never delete or rename it**, or Epic
  reads "not connected" and is not probed). Launch 1 already showed
  `[signInProbe] legendary outcome=healthy` and `gate_backup 1` ran after it.
- **Induction (before launch 2):**

  ```bash
  # restore source for this item: $GATE_DIR/secrets/epic-user.after-L1.json
  node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));for(const k of Object.keys(j)){if(/expires_at\$/.test(k))j[k]='2000-01-01T00:00:00.000Z';if(k==='refresh_token')j[k]='gate-invalid'}fs.writeFileSync(p,JSON.stringify(j,null,2))" "$EPIC_USER"
  # positive observable the induction applied (dates and one boolean; no secret printed)
  node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));for(const k of Object.keys(j)){if(/expires_at\$/.test(k))console.log(k,j[k])};console.log('refresh invalid =',j.refresh_token==='gate-invalid')" "$EPIC_USER"
  ```

- **Gestures:** `gate_pre 2`, start, `gate_pid after-window`. Wait for `[signInProbe] pass complete`
  to appear in `gamelib.log` (`tail -f "$LOGDIR/gamelib.log" | grep --line-buffered signInProbe`
  in a second terminal). Open the Library (Games tab): screenshot the notice. Open Manage Accounts:
  screenshot the Epic tile. Quit.
- **Required literals:** `gamelib.log`: `[signInProbe] pass started stores=` naming `legendary`;
  `Sign-in probe:` with `status` (the spawn ran); `[signInProbe] legendary outcome=expired`;
  `[signInProbe] legendary verdict=latched`; `pass complete outcomes=` containing `legendary:expired`.
  `runner-legendary-launch-2.log`: `Stored credentials are no longer valid`, and the `status --json`
  stdout shape recorded (key names only).
- **PASS:** every literal above; exactly one row reading "Your Epic Games sign-in expired"
  (`library.signIn.expired` with `{{store}}` = "Epic Games"); the Epic tile button reads
  "Sign-in expired — Reconnect" (`login.epicReconnect`); `flags.log` shows `"expired": true` under the
  legendary store directory.
- **FINDING (A1/A5):** `outcome=unknown` with no marker in the runner log → record the exact text
  legendary printed (redacted) and the stream; the marker has drifted. `status --json` printing no
  JSON to stdout or logging to the stream `onOutput` does not see → A5.
- **FAIL:** the spawn did not run (`Sign-in probe:` absent), so the item's premise did not hold.
- **Restore:** `cp -p "$GATE_DIR/secrets/epic-user.after-L1.json" "$EPIC_USER"` after quitting
  launch 2 and archiving. **Positive confirmation:** launch 3 shows
  `[signInProbe] legendary outcome=healthy` and `verdict=cleared` (item 3's launch, below).

### Item 2 — Epic network failure → `unknown`, no latch (A1 negative)

- **Launch 4.** Build `pnpm tauri:dev` (vault ON). Evidence: `gamelib-launch-4.log`,
  `runner-legendary-launch-4.log`, `flags.log`, `hosts-check.txt`, `item2-library.png`.
- **Preconditions:** valid Epic credentials (restored; launch 3 showed `legendary outcome=healthy`);
  **no `"expired": true` for legendary in `flags.log` after launch 3**. The block is an
  `/etc/hosts` line for the Epic OAuth host only. The app's connectivity monitor pings
  `github.com`, `store.epicgames.com`, `gog.com` and `cloudflare-dns.com`
  (`src/backend/online_monitor.ts:80-83`; any one answering is "online"), so blocking only the
  OAuth host keeps the app online and the pass still starts.
- **Induction (before launch 4), with backup:**

  ```bash
  sudo cp -p /etc/hosts "$GATE_DIR/secrets/hosts.before-L4"
  echo "127.0.0.1 account-public-service-prod03.ol.epicgames.com auth.gog.com # gamelib-gate-49" | sudo tee -a /etc/hosts
  sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
  # positive observable the block is live (expect a non-zero curl exit, "Failed to connect")
  curl -sS -m 5 -o /dev/null https://account-public-service-prod03.ol.epicgames.com/ ; echo "curl exit=$?" | tee -a "$GATE_DIR/hosts-check.txt"
  curl -sS -m 5 -o /dev/null https://auth.gog.com/ ; echo "curl exit=$?" | tee -a "$GATE_DIR/hosts-check.txt"
  ```

  (`auth.gog.com` is blocked in the same launch for item 4; the two stores are independent.)
- **Gestures:** `gate_pre 4`, start, `gate_pid after-window`, wait for `pass complete`, open the
  Library, screenshot (no Epic expired row), quit.
- **Required literals:** `gamelib.log`: `pass started stores=` naming `legendary`;
  `Sign-in probe:` (spawn ran); `[signInProbe] legendary outcome=unknown`;
  `[signInProbe] legendary verdict=unchanged` (the **positive** proof the verdict path ran and wrote
  nothing, see the review's Test 4 row). `runner-legendary-launch-4.log`:
  `HTTP request for login failed`.
- **PASS:** the literals above; no Epic row; no legendary `"expired": true` in the post-launch
  `flags.log` census.
- **FINDING (A1 negative):** `outcome=unknown` and no row, but the marker is absent from the runner
  log (legendary logged something else) → record the observed line. The safe outcome held; only the
  marker drifted.
- **FAIL:** `outcome=expired` or `verdict=latched` for legendary (a network failure latched: P1
  violated), or no `pass started` (the app went offline; the block was too wide).
- **Restore (after launch 4 quits and archives):**

  ```bash
  sudo cp -p "$GATE_DIR/secrets/hosts.before-L4" /etc/hosts
  sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
  diff /etc/hosts "$GATE_DIR/secrets/hosts.before-L4" && echo "hosts restored"
  # positive observable the hosts resolve again (an HTTP status, not a connect failure)
  curl -sS -m 10 -o /dev/null -w '%{http_code}\n' https://account-public-service-prod03.ol.epicgames.com/ | tee -a "$GATE_DIR/hosts-check.txt"
  curl -sS -m 10 -o /dev/null -w '%{http_code}\n' https://auth.gog.com/ | tee -a "$GATE_DIR/hosts-check.txt"
  ```

### Item 3 — GOG expired (A2, D-17)

- **Launch 2** (same launch as item 1). Evidence: `gamelib-launch-2.log`,
  `runner-gog-launch-2.log`, `flags.log`, `item3-row.png`, `item3-tile.png`.
- **Preconditions:** GOG connected; `GOG_AUTH` resolved (`gogdlAuthConfig`,
  `src/backend/storeManagers/gog/constants.ts:7`, which `classifyGogdlAuth` requires to exist,
  `classify.ts:151-152`, so **edit in place, never delete**); launch 1 showed
  `gog outcome=healthy`; `gate_backup 1` ran.
- **Induction (before launch 2):** make the refresh token invalid and the login old, in place:

  ```bash
  node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));for(const k of Object.keys(j)){const e=j[k];if(e&&typeof e==='object'){if('refresh_token' in e)e.refresh_token='gate-invalid';if('loginTime' in e)e.loginTime=1}}fs.writeFileSync(p,JSON.stringify(j,null,2))" "$GOG_AUTH"
  node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));for(const k of Object.keys(j)){const e=j[k];if(e&&typeof e==='object')console.log('entry',k.slice(0,4)+'…','loginTime=',e.loginTime,'refresh invalid =',e.refresh_token==='gate-invalid','expires_in=',e.expires_in)}" "$GOG_AUTH"
  ```

  (`loginTime` is the key the code names in `gog/user.ts:141`; if the key-name listing in preflight
  shows a different name, edit that one and record it.)
- **Gestures:** as item 1, same launch; screenshot the GOG row and tile.
- **Required literals:** `gamelib.log`: `Running command:` followed by an `auth` command (the spawn
  ran; the TTL cache is empty in a fresh process, `gog/user.ts:121-123`); `[signInProbe] gog
  outcome=expired`; `[signInProbe] gog verdict=latched`. `runner-gog-launch-2.log`: a bare `null`
  line recorded, **and NO line containing `Failed to refresh credentials`** (that line is what
  separates expired from a connection error).
- **PASS:** the literals above; one row "Your GOG sign-in expired"; the GOG tile reads
  "Sign-in expired — Reconnect" (`login.gogReconnect`).
- **FINDING (A2 / D-17):** record gogdl's real stdout for a dead refresh token. If it prints
  something other than bare `null` the classifier yields `unknown` and the feature is dead for GOG.
  Record separately whether gogdl rewrote or removed `auth.json` during the run.
- **FAIL:** the `auth` spawn did not run, or `Failed to refresh credentials` is present (then the
  failure was a connection error and this launch did not induce what item 3 asks for).
- **Restore:** `cp -p "$GATE_DIR/secrets/gog-auth.after-L1.json" "$GOG_AUTH"`. **Positive
  confirmation:** launch 3 shows `gog outcome=healthy` and `gog verdict=cleared`.

### Item 4 — GOG network failure → `unknown`

- **Launch 4** (same launch as item 2; the hosts block already includes `auth.gog.com`). Evidence:
  `gamelib-launch-4.log`, `runner-gog-launch-4.log`, `hosts-check.txt`.
- **Preconditions:** valid GOG credentials restored (launch 3 `gog outcome=healthy`, flag clear).
  **The access token must be expired so a refresh is attempted at all**: a still-valid token makes
  gogdl answer from `auth.json` with no network call, and the block would exercise nothing
  (review Test 6). So, before launch 4, with the **valid** refresh token kept:

  ```bash
  # restore source for this item: $GATE_DIR/secrets/gog-auth.after-L3.json  (taken after the healthy launch 3)
  node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));for(const k of Object.keys(j)){const e=j[k];if(e&&typeof e==='object'&&'loginTime' in e)e.loginTime=1}fs.writeFileSync(p,JSON.stringify(j,null,2))" "$GOG_AUTH"
  ```

- **Gestures:** as item 2, same launch.
- **Required literals:** `gamelib.log`: `Running command:` with `auth` (spawn ran);
  `[signInProbe] gog outcome=unknown`; `[signInProbe] gog verdict=unchanged`.
  `runner-gog-launch-4.log`: `Failed to refresh credentials`.
- **PASS:** the literals above; no GOG row; no gog `"expired": true` in the census.
- **FINDING (A2):** `Failed to refresh credentials` absent although the host was blocked → gogdl
  logs the connection failure differently or the refresh did not reach the network; record what the
  runner log shows instead.
- **FAIL:** `outcome=expired` (a connection failure latched), or no `auth` spawn.
- **Restore:** hosts as item 2; `cp -p "$GATE_DIR/secrets/gog-auth.after-L3.json" "$GOG_AUTH"`
  after quitting launch 4. A refresh that fails does not rotate the token, so the launch-3 backup is
  still the live one. **Positive confirmation:** launch 5 shows `gog outcome=healthy`.

### Item 5 — Amazon expired (A3, A6)

- **Launch 2** (same launch as items 1 and 3). Evidence: `gamelib-launch-2.log`,
  `runner-nile-launch-2.log`, `flags.log`, `item5-row.png`, `item5-tile.png`.
- **Preconditions:** Amazon connected; `NILE_USER` resolved; **at least one installed Amazon game**
  (preflight step 4). nile only attempts a refresh when the access token has expired, and
  `list-updates` may do nothing with zero installed games (A4, item 6). **If your installed count is
  0, run item 5 as arm B inside launch 5 instead** (with item 6's induction; the two then share one
  observation, and you record that they do).
- **Induction (before launch 2):** make nile consider the access token expired and the refresh token
  invalid. The key names are those printed in preflight step 3 (names only):

  ```bash
  # restore source: $GATE_DIR/secrets/nile-user.after-L1.json
  node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));const w=o=>{for(const k of Object.keys(o)){const v=o[k];if(v&&typeof v==='object'){w(v);continue}if(/refresh_token/i.test(k))o[k]='gate-invalid';if(/(obtain|expires?_at|login_?time)/i.test(k)&&typeof v==='number')o[k]=1}};w(j);fs.writeFileSync(p,JSON.stringify(j,null,2))" "$NILE_USER"
  ```

  Record which key names were changed (the induction is correct only if nile then attempts a
  refresh; the observable below is what proves that, not the edit).
- **Gestures:** as item 1, same launch; screenshot the Amazon row and tile.
- **Required literals:** `gamelib.log`: `Sign-in probe:` with `list-updates` (the spawn ran);
  `[signInProbe] nile outcome=<…>`; `pass complete outcomes=` naming `nile`.
  `runner-nile-launch-2.log`: **record the exact `Failed to refresh the token <Response [NNN]>`
  line, including NNN.**
- **PASS:** NNN ∈ {400, 401, 403}, `nile outcome=expired`, `nile verdict=latched`, one row "Your
  Amazon Games sign-in expired", tile "Sign-in expired — Reconnect" (`login.amazonReconnect`).
- **FINDING (A3):** NNN is any other code → record it. The classifier yields `unknown`
  (`classify.ts:185-196`), so Amazon expiry is never detected; the 4xx set needs widening in a
  follow-up plan. **FINDING (A6):** the line carries no `<Response [` text → the status is
  unrecoverable and Amazon can only ever be `unknown`.
- **FAIL:** no `Failed to refresh the token` line at all although a game is installed and the edit
  applied → the premise (a refresh was attempted) did not hold; adjust the edit and re-run, do not
  score.
- **Restore:** `cp -p "$GATE_DIR/secrets/nile-user.after-L1.json" "$NILE_USER"`. **Positive
  confirmation:** launch 3 shows `nile outcome=healthy`.

### Item 6 — Amazon with nothing installed (A4)

- **Launch 5.** Build `pnpm tauri:dev` (vault ON). Evidence: `gamelib-launch-5.log`,
  `runner-nile-launch-5.log`, `flags.log`.
- **Preconditions:** the Amazon credential induction of item 5, re-applied from
  `$GATE_DIR/secrets/nile-user.after-L4.json` (the last healthy launch's backup); and
  `installed.json` emptied **in place** with the original backed up:

  ```bash
  # the post-launch-4 `gate_backup 4` already holds nile-user.after-L4.json and nile-installed.after-L4.json
  printf '[]' > "$NILE_INSTALLED"
  node -e "console.log('nile installed count now =',JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).length)" "$NILE_INSTALLED"   # must print 0
  ```

- **Gestures:** `gate_pre 5`, start, wait for `pass complete`, quit.
- **Required literals:** `gamelib.log`: `Sign-in probe:` with `list-updates` (spawn ran);
  `[signInProbe] nile outcome=<…>`. `runner-nile-launch-5.log`: record whether a
  `Failed to refresh the token` line is present.
- **Result (all three are acceptable and must be recorded, not "fixed"):**
  (a) line present with NNN ∈ {400,401,403} → `expired`; the probe works with nothing installed;
  (b) line present with another NNN → `unknown`; (c) no refresh attempt → `outcome=healthy`,
  **FINDING (A4):** with nothing installed the Amazon probe is a no-op, which means a user with no
  installed Amazon game is never told their Amazon sign-in expired.
- **PASS:** the observation is unambiguous (spawn ran; line present or provably absent in the runner
  log); **FAIL:** `Sign-in probe:` absent (spawn did not run).
- **Restore:** `cp -p "$GATE_DIR/secrets/nile-installed.after-L4.json" "$NILE_INSTALLED"` **and**
  `cp -p "$GATE_DIR/secrets/nile-user.after-L4.json" "$NILE_USER"`, then
  `node -e "…count…"` must print the original installed count from preflight. **Positive
  confirmation:** launch 6 shows `nile outcome=healthy`.

### Item 7 — Keychain **Deny** → `unknown`, not `expired` (P1)

- **Launch 6.** Build **`pnpm tauri:dev:keyring`** in a shell where
  `env | grep GAMELIB_DEV_SECRET_VAULT` prints nothing. Evidence: `gamelib-launch-6.log`,
  `terminal.log`, `flags.log`, `item7-prompt.png`, `item7-library.png`.
- **Preconditions:** Steam and Humble connected (Steam token in the `steam-refresh-token` slot,
  Humble in `humble-session`). Ad-hoc-signed dev build. **The Keychain prompt must actually
  appear**: if you ever clicked "Always Allow" for this binary, or the binary identity has not
  changed, no dialog appears and the item is not scorable (review Test 6). If no dialog appears,
  remove the GameLib entry's access in Keychain Access (Get Info → Access Control) or rebuild, and
  re-run launch 6. **Steam's `credentialsMissing` should be pre-latched** by launches 1-5 (vault ON
  reads the Steam slot as absent, so the pass latches it). Confirm in `flags.log` after launch 5
  (`credentialsMissing` listed). If it is not listed, sub-check 7c is NOT SCORED (record why); 7a/7b
  still run.
- **Gestures:** `gate_pre 6`, start, `gate_pid after-window`. Click **Deny** on each Keychain dialog
  that appears at boot (expect one per slot). Screenshot the dialog and the Library. Wait for
  `pass complete`. Quit.
- **Required literals (`gamelib.log`):** for slot `steam-refresh-token` **and** `humble-session`:
  `…getToken(): issuing keyring_get (may prompt) trigger=boot-probe`, then
  `…keyring_get failed: … trigger=boot-probe elapsed=…ms`, then
  `keyring failure memoized slot=<slot> class=unavailable ms=120000 trigger=boot-probe`;
  `[signInProbe] steam outcome=unknown`, `[signInProbe] humble outcome=unknown`,
  `[signInProbe] steam verdict=unchanged`, `[signInProbe] humble verdict=unchanged`.
- **PASS:** all of the above; **no** `verdict=latched` for either store in this launch; no Humble
  row; with Steam pre-latched (7c), **the "Your Steam sign-in expired" row is still present** after
  the Deny (`unknown` never clears, D-07).
- **FINDING:** `class=timeout` rather than `unavailable` on a Deny → Deny is being reported as a
  timeout; record the failure text. A `keyring_get ok` on a Deny click → the click was Allow.
- **Expected observation, not a defect (49-06 `<reversal_record>`):** after the pass, Steam's sticky
  boot-probe trigger has unlocked automatic Steam refresh for the rest of the process
  (`isSteamAuthUnlocked()` is true), so later `steam-refresh-token` lines with a different `trigger=`
  or `memo hit, answering unreadable` lines (within 120 s) may appear. Record them; do not fail on
  them.
- **Restore:** nothing was edited. Dismiss any leftover dialog before quitting.

### Item 8 — Ignored Keychain prompt → `unknown` at the bound (D-01)

- **Launch 7**, a **new process** (the 120 s Deny memo of launch 6 is process-scoped; reusing launch
  6's process would answer from the memo with no prompt at all, review Test 5). Build
  `pnpm tauri:dev:keyring`, vault variable unset. Evidence: `gamelib-launch-7.log`, `terminal.log`,
  `item8-timeline.txt`.
- **Preconditions:** as item 7, and the prompt appears (launch 7 starts cold; do not click anything).
- **Gestures:** `gate_pre 7`, start, `gate_pid after-window`, **do not touch either dialog**. Record
  the wall-clock time the dialogs appeared. Wait for `[signInProbe] pass complete` (≈45-50 s). Only
  **after** that line, click Deny on the leftover dialogs, wait 20 s, quit.
- **Required literals (`gamelib.log`):** `…issuing keyring_get (may prompt) trigger=boot-probe` for
  both slots; `[signInProbe] steam outcome=unknown elapsed=<n>ms` and
  `[signInProbe] humble outcome=unknown elapsed=<n>ms` with **44 900 ≤ n ≤ 50 000**; and, usually,
  `[signInProbe] steam bound reached` / `[signInProbe] humble bound reached` (`pass.ts:212`).
- **PASS:** `outcome=unknown` for both with `elapsed` in that window; no `verdict=latched`; no
  `[signInProbe]` line after `pass complete` caused by the late Deny.
- **Record, do not score:** which side won, the sidecar's bound timer (`bound reached`) or Rust's own
  45 s timeout (`class=timeout` on the keyring failure line, no `bound reached`). The two are armed
  milliseconds apart by design (D-01), so either order is legitimate; only the outcome and the
  window are scored.
- **FAIL:** `outcome=expired`, `verdict=latched`, or `elapsed` outside the window (a probe that
  waited the 60 s invoke ceiling instead of the 45 s bound).
- **Restore:** nothing edited.

### Item 9 — Warm-profile sidecar exit timing (R3, D-20)

- **Launch 8: no shell.** The plan's original wording ("quit the app at the moment the pass starts;
  measure the sidecar's exit after stdin EOF") cannot measure the property. Quitting the app makes
  the Rust shell SIGTERM the sidecar's process group (`main.rs:1883-1927`, `shutdown_child`) and
  print `[shell] sidecar terminated on exit` (`main.rs:1940`) whether or not the sidecar would have
  drained by itself, so "PID gone" passes vacuously (review Test 4). The contract therefore runs the
  sidecar **directly** against the real warm profile and closes its stdin itself. This is the named
  real-profile arm of the two-profile rule (the same exemption `meta/sidecarStartupSmoke.cjs`
  carries); do **not** use `pnpm smoke:sidecar` for this: it has a 30 s timeout, below the 45 s
  bound, and would false-fail on a warm profile.
- **Preconditions:** all five stores connected; healthy credentials (launch 6/7 restores confirmed);
  `pgrep -f 'target/debug/gamelib-shell'` and `pgrep -f 'build/main/sidecar.js'` both empty;
  `env | grep GAMELIB_DEV_SECRET_VAULT` empty; `build/main/sidecar.js` built (preflight step 1);
  `gate_archive 7` already run (this run rotates `gamelib.log` and the runner logs). Evidence:
  `gamelib-launch-8.log`, `runner-*-launch-8.log`, `sidecar-stdout.txt`, `item9-timing.txt`.
- **Procedure:**

  ```bash
  echo "=== GATE LAUNCH 8 — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$GATE_DIR/terminal.log"
  : > "$GATE_DIR/sidecar-stdout.txt"
  # stdin stays open until READY appears on stdout, then EOF: the exit time is measured FROM that EOF
  ( while ! grep -q __GAMELIB_SIDECAR_READY__ "$GATE_DIR/sidecar-stdout.txt" 2>/dev/null; do sleep 0.2; done
    perl -MTime::HiRes=time -e 'printf "EOF_AT %.3f\n", time' >> "$GATE_DIR/item9-timing.txt"
  ) | ( node build/main/sidecar.js > "$GATE_DIR/sidecar-stdout.txt" 2>> "$GATE_DIR/terminal.log"
        echo "EXIT_CODE $?" >> "$GATE_DIR/item9-timing.txt"
        perl -MTime::HiRes=time -e 'printf "EXIT_AT %.3f\n", time' >> "$GATE_DIR/item9-timing.txt" )
  pgrep -f 'build/main/sidecar.js' | tee -a "$GATE_DIR/item9-timing.txt"   # must print nothing
  cat "$GATE_DIR/item9-timing.txt"
  ```

  Elapsed = `EXIT_AT − EOF_AT`. Then `gate_archive 8`. If nothing exits after 120 s, `Ctrl-C` and record
  a FAIL with the elapsed time.
- **Required literals (`gamelib-launch-8.log`):** `[signInProbe] pass started stores=` **naming all
  five stores** (`legendary,gog,nile,humble,steam`). This is the positive observable that the pass
  ran and was probing every store; **if it is absent or names fewer stores, the item is not
  scorable** (the pass starts only once online). `sidecar-stdout.txt` contains
  `__GAMELIB_SIDECAR_READY__`.
- **PASS:** `EXIT_CODE 0`; Elapsed ≤ **50 s** (45 s bound + 5 s margin); `pgrep` empty.
- **FINDING:** Elapsed in (30 s, 50 s]: drained toward the bound, consistent with D-20; record the
  number. Elapsed > 50 s or no exit: **FAIL** (a handle is holding the loop; check the in-flight
  items listed in `pass.ts:34-53`; open todo `260913-m9c` records ~5 in-flight boot downloads that
  already push cold boots to 27-39 s, so record cold-comparison if relevant).
- **Scope, stated plainly:** with no Rust peer, the Steam/Humble `keyring_get` invokes get no
  answer; they ride the sidecar RPC timer, which is `unref()`'d, so they do not delay exit. This
  item therefore measures the runner children (`legendary`, `gogdl`, `nile`) and Humble's HTTP
  call, which are the referenced in-flight work. The Keychain-prompt-in-flight case is covered by
  items 7/8 for the _outcome_; its exit timing cannot be measured with the shell attached (SIGTERM).
- **In-app informational observation (not scored):** after quitting launch 6, record whether
  `terminal.log` shows `[shell] sidecar terminated on exit`. It always will.

### Item 10 — Never-connected row tone, dismiss persistence, multi-theme (P4 judgment, R5)

- **Launch 9** (a, b, c) and **launch 10** (d). Build `pnpm tauri:dev:keyring`, vault unset;
  **click Allow (not Always Allow) on the Keychain dialogs** in launch 9 so the Steam latch from
  launches 1-5 clears and no ACL grant persists for any later re-run of items 7/8. Evidence:
  `gamelib-launch-9.log`, `gamelib-launch-10.log`, `item10-<theme>.png` ×3, `config-dismissed.txt`.
- **Preconditions:** at least **two never-connected stores**, A (used by item 11) and B (used here).
  Never connected means the Accounts tile reads not-logged-in with no Reconnect text. If fewer than
  two stores qualify, sign out of one cheap store (Humble is the least costly to sign in again) and
  record that you did. Record your current theme so it can be restored.
- **Gestures (launch 9):**
  (a) In Library, screenshot B's row. It must read "<Store> is not connected", show the store's own
  logo, a `Sign in` button and a dismiss (×) button, and must not read as a warning.
  (b) Settings → General → theme: switch to `midnightMirage`, `gruvbox_dark`, `dracula` in turn,
  return to Library each time and screenshot B's row (`item10-midnightMirage.png`,
  `item10-gruvbox_dark.png`, `item10-dracula.png`). Judge, per theme: neutral/informational tone, no
  danger colour, no warning triangle, text legible against the row. (49-09 routed this judgment
  here, UAT item 10.)
  (c) Click B's × : the row disappears. Quit. Then
  `grep -n dismissedSignInNotices "$APPSUP/GameLib/config.json" | tee -a "$GATE_DIR/config-dismissed.txt"`.
  **Restore your original theme before quitting.**
- **Gestures (launch 10):** (d) relaunch; B's row is **absent** while A's row (still not connected,
  item 11 not yet done or done) behaves per item 11; `config-dismissed.txt` still lists B.
- **PASS:** (a) copy is exactly "<Store> is not connected" with the `Sign in` button; (b) your
  written judgment per theme is "information, not error" (a negative judgment on any theme is a
  FINDING with the screenshot, not a FAIL of the gate); (c) × hides the row, `config.json` lists B;
  (d) B is still absent after relaunch.
- **FAIL:** × hides the row but `config.json` does not list it (not persisted), or the row returns
  after relaunch while B is still never connected.

### Item 11 — Sign in opens one overlay (R6)

- **Launch 9** (a-c) and **launch 10** (d). Evidence: `item11-overlay.png`, `item11-after.png`,
  `gamelib-launch-9.log`.
- **Preconditions:** store A never connected and **not dismissed** (a dismissed row's absence after
  sign-in proves nothing: the dismiss alone would hide it). A is a different store from item 10's B.
- **Gestures (launch 9):**
  (a) Click A's row `Sign in`. Expected: the Manage Accounts screen with **A's** overlay open (one
  overlay). **Premise check (Test 6): the overlay must show a login form.** If it completes
  immediately because the store's WKWebView cookie jar already holds a session, the premise is
  broken: record the finding, do not score, and pick another never-connected store.
  (b) Close the overlay without signing in. Click the Games tab, then the Manage Accounts tab (nav
  tabs, `NavShell`). Expected: **no overlay reopens**.
  (c) _Back leg (CONDITIONAL):_ the shipped UI has no Back control; `history.back()` is reachable
  only through a controller's B button (`src/preload/api/tauriGamepadInput.ts:147-150`). With a
  controller, press B; without one, open the dev inspector console and run `history.back()` (the
  identical call the B button makes) and record that this stand-in was used. Expected: the overlay
  does **not** reopen (`?open=` was removed with `{ replace: true }`,
  `Login/index.tsx:264-266`). If neither is available, withdraw this leg and cite
  `loginOpenParam.test.ts` (49-10) as the unit-level cover.
  (d) Click A's row `Sign in` again, and this time **complete the sign-in** (real credentials).
  Return to Library. Quit. Launch 10: relaunch, Library shows **no row for A**.
- **PASS:** (a) exactly one overlay for A showing a form; (b) no reopen; (c) no reopen or withdrawn
  with reasoning; (d) the Accounts tile for A reads Connected, and the Library shows no A row in
  launch 9 and in launch 10. The absence is meaningful: A's row was observed present earlier in the
  same launch (gesture a), and the row is derived from state on every render
  (`LibrarySignInNotice/index.tsx`, "Row visibility is derived from context state").
- **FAIL:** two overlays, an overlay on the wrong store, an overlay that reopens on (b)/(c), or a
  row that remains for a connected store.
- **Restore:** if you signed out a store to make A or B available, that is a deliberate state
  change: record the final connection state of all five stores at teardown.

---

## Result record (filled by 49-12, not by this plan)

| Item | Launch | Result (PASS / FAIL / FINDING / NOT SCORED) | Evidence files | Notes |
|---|---|---|---|---|
| 1 | 2 | pending | | |
| 2 | 4 | pending | | |
| 3 | 2 | pending | | |
| 4 | 4 | pending | | |
| 5 | 2 (or 5) | pending | | |
| 6 | 5 | pending | | |
| 7 | 6 | pending | | |
| 8 | 7 | pending | | |
| 9 | 8 | pending | | |
| 10 | 9, 10 | pending | | |
| 11 | 9, 10 | pending | | |

---

## Redaction and teardown (T-49-30, T-49-32)

1. **Restore proof before anything else.** Every store you edited reads `outcome=healthy` in the
   next launch's `gamelib-launch-N.log`; `/etc/hosts` matches `hosts.before-L4`; `nile installed
   count` matches preflight; your theme and any signed-out store are back as recorded.
2. **Redact before anything is copied into the repo.** `legendary status` stdout carries the Epic
   display name and account fields; `runners/legendary.log` is written **unsanitised**
   (`probeLegendarySession` passes no `logSanitizer`); `gamelib.log` can carry usernames. Never copy
   `secrets/`; never copy raw logs. Produce excerpts:

   ```bash
   gate_redact() {  # gate_redact <file> ; writes $GATE_DIR/excerpts/<name>
     sed -E 's/("?(access_token|refresh_token|session_id|user_id|account_id|displayName|username|email)"? *[:=] *)("[^"]*"|[^,} ]+)/\1<redacted>/g' "$1" > "$GATE_DIR/excerpts/$(basename "$1")"
   }
   ```

   Then add your own account name(s) to a manual `sed -i '' 's/<your-name>/<redacted>/g'` pass and
   **read each excerpt by eye** before it is committed. A redactor that was never checked against a
   known-bad specimen is not a control: grep your excerpts for your own display name and email.
3. **Delete the session directory** once the excerpts are committed:
   `rm -rf "$GATE_DIR"`. (`rm -P` is not a secure erase on APFS/SSD and is not used; the control is
   that the directory is mode 0700 under `/tmp` and is removed.)
4. Commit nothing under `/tmp`, nothing from `secrets/`, and no screenshot showing an account name.

<!-- gsd:review-continue -->
