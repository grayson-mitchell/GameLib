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

If `pgrep -f` reports a count that does not match the windows you can see (it matches any process
whose command line merely contains the path, for example another shell or a `log stream` filter;
48-08's P1 hit exactly this), use the exact-name form `pgrep -x gamelib-shell` instead, and say so in
`preflight.txt`.

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
  `grep -rn dismissedSignInNotices "$APPSUP/GameLib" | tee -a "$GATE_DIR/config-dismissed.txt"`
  (the renderer persists it through `setSetting({ appName: 'default', key: 'dismissedSignInNotices' })`,
  `GlobalState.tsx:857-869`; the recursive grep does not assume which JSON file holds it).
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
  `Login/index.tsx:260-261`). If neither is available, withdraw this leg and cite
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

---

## Structural Reachability Review

Authored by plan 49-11 **before publication**, per
`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` §2: all seven
defect-class tests applied to every item, sub-check and precondition, and to the capture
instruction itself. Verdicts: **REACHABLE**, **IMPOSSIBLE**, **CONDITIONAL** (reachable only if a
named external premise holds; the contract carries the in-run check for that premise). The plan
authored this contract and did not run it (D-E); every "evidence" below is a source file:line or a
command whose output is cited, not a live observation.

**Tests 6 and 7 have caught nothing before this contract** (the reference says so itself). This
review is their first application, and it found things with both: see _Review-driven changes_.

### Review table

| # | Item / sub-check / precondition | Surface it names | What it asks for | Verdict | Evidence |
|---|---|---|---|---|---|
| R1 | Capture: session dir + `tee -a` + delimiter | `terminal.log` | one UTC dir, append every launch, `=== GATE LAUNCH N — … ===` | REACHABLE | `gate_pre` in the Capture standard; reference §3 |
| R2 | Capture: archive `gamelib.log` per launch | `gamelib.log` | `cp` to `gamelib-launch-N.log` after quit | REACHABLE | rotation at `log_writer.ts:144-146` (`renameSync` to `.old` on first write) |
| R3 | Capture: archive runner logs per launch | `runners/{legendary,gog,nile}.log` | `cp` to `runner-<r>-launch-N.log` | REACHABLE (added by this review) | `logger/index.ts:82-93` one `LogWriter` per runner, same rotation class as R2 |
| R4 | Capture: exactly one instance | `pgrep -f 'target/debug/gamelib-shell'` | empty before, count 1 after, again at teardown | REACHABLE | the command itself (reference §3) |
| R5 | Capture: closing inventory | session dir | `ls -la`, `wc -l` | REACHABLE | the commands |
| R6 | Capture: redaction before repo | excerpts | `gate_redact` + a human read | CONDITIONAL (depends on the operator reading the output; no tool can prove the redactor complete) | `probeLegendarySession` passes no `logSanitizer` (`runnerProbes.ts:57-64`) so `legendary.log` is raw |
| R7 | Preflight: vault variable unset | shell env | `env \| grep GAMELIB_DEV_SECRET_VAULT` prints nothing | REACHABLE | `package.json:32-33` (`tauri:dev` sets it, `tauri:dev:keyring` does not) |
| R8 | Preflight: credential paths resolve | Application Support | `ls`/`find` the four files | CONDITIONAL (the `userData` directory name is not verified on this Windows box) | `gog/constants.ts:7`, `legendary/constants.ts:9`, `nile/constants.ts:4-7`, `constants/paths.ts:24,45`; the preflight discovers and records them |
| R9 | Preflight: key-name listing | credential files | key paths, never values | REACHABLE | the node snippet prints `Object.keys` recursion only |
| R10 | Preflight: sidecar build | `build/main/sidecar.js` | `pnpm build:sidecar` | REACHABLE | `package.json:37` |
| R11 | Item 1 precondition: Epic connected, file edited in place | `user.json` | `isLoggedIn()` stays true | REACHABLE | `legendary/user.ts:707-709` is `existsSync(legendaryUserInfo)` |
| R12 | Item 1 precondition: healthy baseline (launch 1) | `legendary status --json` | `outcome=healthy` first | REACHABLE | `classify.ts:120-123` (healthy needs an `account` that is not `<not logged in>`) |
| R13 | Item 1 induction edit | `user.json` fields | past `*expires_at`, invalid `refresh_token` | CONDITIONAL (key names are legendary's; this tree does not name them, so preflight lists them) | preflight step 3 |
| R14 | Item 1 gestures: Library notice, Accounts tile | Library, Manage Accounts | look and screenshot | REACHABLE | Library = `games` tab, Accounts = `accounts` tab, `NavShell/navTabs.ts:11` |
| R15 | Item 1 literals `outcome=expired`, `verdict=latched` | `gamelib.log` | two lines | REACHABLE | emitters `pass.ts:217-219`, `verdict.ts:136`; sink `gamelib.log` |
| R16 | Item 1 literal `Stored credentials are no longer valid` | `runner-legendary` log | the legendary binary's text | CONDITIONAL (external binary, the very thing under test) | constant `classify.ts:48`; both streams reach the runner writer, `launcher.ts:1748,1763` |
| R17 | Item 1 row and tile text | Library row, Epic tile | "Your Epic Games sign-in expired", "Sign-in expired — Reconnect" | REACHABLE | `LibrarySignInNotice/index.tsx` row copy; `RunnerToStore.legendary` = "Epic Games" (`facetLabels.ts:27`); `gamelib.json` `login.epicReconnect` |
| R18 | Item 1 "exactly one row" | row decision | one row per store | REACHABLE | `resolveLibrarySignInRows` walks `SIGN_IN_STORES` (49-09) |
| R19 | Item 2 precondition: no legendary flag after launch 3 | `flags.log` | census | REACHABLE | `gate_flags` command |
| R20 | Item 2 induction: hosts block | `/etc/hosts`, DNS cache | add line, flush, `curl` fails | CONDITIONAL (needs `sudo`; the OAuth hostname is the operator-confirmed one, not source-derived here) | `curl` exit non-zero is the in-run proof; record the host legendary actually contacted |
| R21 | Item 2 precondition: app stays online | connectivity monitor | `pass started` appears | REACHABLE | `online_monitor.ts:80-83` pings four other hosts; `pass.ts:307-309` starts only when online |
| R22 | Item 2 literal `HTTP request for login failed` | `runner-legendary` log | text | CONDITIONAL (external binary; FINDING path defined) | constant `classify.ts:49` |
| R23 | Item 2 absence: no row, flag unset | row, `flags.log` | nothing latched | REACHABLE | positive proof: `verdict=unchanged` (`verdict.ts:103-105,136`) |
| R24 | Item 3 precondition: `auth.json` edited in place | gogdl auth config | file stays | REACHABLE | `classify.ts:151-152` needs `authConfigExists`; `gog/user.ts:410` |
| R25 | Item 3 induction | `auth.json` entries | invalid `refresh_token`, `loginTime=1` | CONDITIONAL (key names from preflight; `loginTime` per `gog/user.ts:141`) | preflight step 3 |
| R26 | Item 3 precondition: the `auth` spawn runs | TTL cache | cache empty in a fresh process | REACHABLE | `gog/user.ts:121-123,350-359`; positive: `Running command:` … `auth` in `gamelib.log` |
| R27 | Item 3 literal: bare `null`, no `Failed to refresh credentials` | `runner-gog` log | one present, one absent | CONDITIONAL (external binary) | `classify.ts:150-157`, `gog/user.ts:101-112`; the absence has a positive control (R32) |
| R28 | Item 3 row and tile | Library, GOG tile | copy | REACHABLE | `gamelib.json` `login.gogReconnect`; `RunnerToStore.gog` = "GOG" |
| R29 | Item 4 **as the plan worded it**: block `auth.gog.com` with valid credentials | gogdl refresh | expects `Failed to refresh credentials` | **IMPOSSIBLE as worded** | a valid unexpired token is answered from `auth.json` with no network call (49-RESEARCH 1b table: "Stored token not expired → credentials JSON"); the block would exercise nothing. **RESTATED as R30.** |
| R30 | Item 4 restated: also set `loginTime=1` keeping the valid refresh token | `auth.json` | forces a refresh attempt into the blocked host | CONDITIONAL | RESEARCH 1b "Expired, refresh raises ConnectionError → `null` + `Failed to refresh credentials`"; in-run proof is R31 |
| R31 | Item 4 literal `Failed to refresh credentials` | `runner-gog` log | present | CONDITIONAL (external binary) | constant `classify.ts:50-51`; same sink as R27's absence |
| R32 | Item 4 absence: no GOG row | row | none | REACHABLE | positive: `verdict=unchanged` and `Failed to refresh credentials` present |
| R33 | Item 5 precondition: ≥ 1 installed Amazon game | `installed.json` | count ≥ 1 | CONDITIONAL (A4 may make `list-updates` a no-op without one; arm B defined) | preflight step 4; RESEARCH A4 |
| R34 | Item 5 induction | `current_user.json` | expired access token, invalid refresh token | CONDITIONAL (key names from preflight) | the in-run proof is R35's line, not the edit |
| R35 | Item 5 literal `Failed to refresh the token <Response [NNN]>` | `runner-nile` log | record NNN | CONDITIONAL (external binary; A3, A6) | `classify.ts:52,169-172` |
| R36 | Item 5 result NNN ∈ {400,401,403} | classifier | `expired` | REACHABLE (FINDING path defined for other NNN) | `classify.ts:185-196` |
| R37 | Item 6 emptying `installed.json` in place | `installed.json` | `[]`, original backed up | REACHABLE | the command and the count print |
| R38 | Item 6 any of three outcomes recorded | `runner-nile` log | present/absent | REACHABLE | acceptance rule in the item |
| R39 | Item 7 precondition: Keychain build, vault unset | `tauri:dev:keyring` | Keychain actually used | REACHABLE | `package.json:32-33`; R7 |
| R40 | Item 7 precondition: a prompt appears | macOS Keychain ACL | dialog shown | CONDITIONAL (an earlier "Always Allow" or an unchanged binary identity suppresses it) | in-run proof: the dialog is seen and `elapsed` is human-scale; remedy documented |
| R41 | Item 7 precondition: Steam pre-latched | `credentialsMissing` | flag set by launches 1-5 | CONDITIONAL | `steam/user.ts:117-118` (`absent` → `expired`); `flags.log` shows it after launch 5; else 7c NOT SCORED |
| R42 | Item 7 gesture: click Deny | system dialog | operator clicks | REACHABLE | system UI, not app UI |
| R43 | Item 7 literals incl. `trigger=boot-probe` | `gamelib.log` | issuing / failed / memoized lines for two slots | REACHABLE | `keyringTokenStore.ts:406,413,436`; label via `steam/user.ts:115-116`, `humble/user.ts:784` |
| R44 | Item 7 absence: no `latched` for steam/humble | `gamelib.log` | verdict lines | REACHABLE | structural guarantee (`verdict.ts:103-105` returns before any write); positive `verdict=unchanged` |
| R45 | Item 7 Steam row stays | Library | row present after the pass | REACHABLE | presence is observed at boot from the persisted flag, before the pass |
| R46 | Item 8 needs a new process | process-scoped 120 s memo | relaunch between 7 and 8 | REACHABLE (restated order) | `keyringTokenStore.ts:60,369-373` |
| R47 | Item 8 gesture: leave dialogs unanswered | system dialog | do nothing for ~50 s | REACHABLE | operator waits |
| R48 | Item 8 literal `bound reached` exactly | `gamelib.log` | line at ≈45 s | CONDITIONAL (Rust's own 45 s timeout can win the millisecond race) | `pass.ts:84` equals `main.rs:3079`; restated to an `elapsed` window, `bound reached` recorded not scored |
| R49 | Item 8 elapsed window 44.9-50 s | `gamelib.log` | `outcome=unknown elapsed=n` | REACHABLE | `pass.ts:217-219` |
| R50 | Item 9 **as the plan worded it**: quit the app, measure exit, PID gone | Rust shell shutdown | drain proof | **IMPOSSIBLE as worded** | quitting makes the shell SIGTERM the sidecar's group (`main.rs:1883-1927`) and print `sidecar terminated on exit` (`main.rs:1940`) whether or not it would drain; PID-gone passes vacuously. **RESTATED as R51.** |
| R51 | Item 9 restated: run the sidecar directly, close stdin at READY, time the exit | `build/main/sidecar.js` | drain measurement | REACHABLE | the same direct-run shape as `meta/sidecarStartupSmoke.cjs:129-134` (real profile, named exemption), with the EOF moved to READY |
| R52 | Item 9 `pass started` naming five stores | `gamelib.log` | positive proof the pass probed everything | CONDITIONAL (the pass starts only when online) | `pass.ts:198-201,307-309` |
| R53 | Item 9 timing instrument | `perl` | millisecond stamps | REACHABLE | `perl` ships with macOS; `date +%N` does not |
| R54 | Item 10 precondition: two never-connected stores | Accounts tiles | A and B | CONDITIONAL (the operator may have all five connected; a sign-out fallback is recorded) | preflight step 5 |
| R55 | Item 10a row copy | Library row | "<Store> is not connected", `Sign in`, × | REACHABLE | `LibrarySignInNotice/index.tsx:150-182`; `gamelib.json` `library.signIn.notConnected` |
| R56 | Item 10b theme switch | Settings → General | pick three themes | REACHABLE | `ThemeSelector` mounted at `GeneralSettings/index.tsx:36`; theme names `themeLabels.ts` (`midnightMirage`, `dracula`; `gruvbox_dark` is in the set per 49-09's UAT routing) |
| R57 | Item 10c dismiss × and persistence | row × button | click, then grep the setting | REACHABLE | `LibrarySignInNotice/index.tsx:181`; `GlobalState.tsx:857-869` |
| R58 | Item 10d absence after relaunch | row | B absent | REACHABLE | meaningful: B's row was observed present in launch 9 before the dismiss |
| R59 | Item 11a Sign in → one overlay | row button → `/login?open=` | one overlay for that store | REACHABLE | `LibrarySignInNotice/index.tsx:166`; `Login/index.tsx:246-257` |
| R60 | Item 11 premise: a login form is shown | WKWebView cookie jar | form before credentials | CONDITIONAL (a live session in the jar auto-completes the overlay, F-34.4.2-16) | in-run proof: the form is rendered; else not scored, pick another store |
| R61 | Item 11b tab round trip does not reopen | NavShell tabs | Games → Accounts | REACHABLE | `navTabs.ts:11`; `?open=` removed at `Login/index.tsx:260-261` |
| R62 | Item 11c Back | browser history | Back does not reopen | CONDITIONAL (no UI Back control; controller B or inspector `history.back()`) | `tauriGamepadInput.ts:147-150`; unit cover `loginOpenParam.test.ts` (49-10) |
| R63 | Item 11d complete a real sign-in | store overlay | log in, no row on return | CONDITIONAL (needs the operator's real credentials) | `Login/index.tsx:455-535` open the overlay for all five stores |
| R64 | Item 11d absence of A's row | Library | no row | REACHABLE | meaningful: A's row was observed present at gesture (a) in the same launch |

### Test 1 — origin and scheme reachability

No sub-check or precondition uses a `http://` URL. `grep -c "http://"` over this file prints `0`.
Every network target is a store's real `https` host; the `/etc/hosts` lines point those hosts at
`127.0.0.1` for the duration of one launch and are not a fixture the surface under test must accept.
**No finding.**

### Test 2 — concurrency reachability

The contract never asks the operator to drive two things at once through one UI. Items 1/3/5 share
launch 2 but their inductions are three independent files and their evidence is three separate
sinks, so nothing is driven concurrently. Items 7/8 raise **two** Keychain dialogs (one per slot)
at once; macOS presents system dialogs one at a time and the operator answers them in sequence, so
this is not a concurrent drive. For item 7 the operator answers both; for item 8 neither until the
pass is complete. **One CONDITIONAL:** if only one dialog appears (a slot already allowed), record
it; the other slot's literal then reads `ok`, not a Deny. **No impossibility.**

### Test 3 — log-line emitter reachability, with the SINK clause

Every required literal has an emitter file:line and a sink in the _Where each required literal comes
from_ table. Partition confirmed against the tree: `[signInProbe] …` (`pass.ts:198-241`,
`verdict.ts:136`) and the keyring lines (`keyringTokenStore.ts:373,406,413,436,459`) are sidecar
`logInfo`/`logWarning`, hence `gamelib.log` only; runner text reaches the per-runner log because
`callRunner` attaches `getRunnerLogWriter(runner.name)` and writes both streams to it
(`launcher.ts:1748,1763`); only `[shell]` and `[sidecar:err]` reach `terminal.log`. **No literal is
demanded of `terminal.log` except `[shell] sidecar terminated on exit`, which is labelled
informational and not scored.** Three runner literals (`Stored credentials are no longer valid`,
`Failed to refresh credentials`, `Failed to refresh the token`) have their constants in
`classify.ts:48-53` but are _emitted by external binaries_; their emitter cannot be grepped in this
tree and that is exactly what A1-A6 gate. **No finding beyond the declared assumption.**

### Test 4 — absence-observability

| Required absence | Would the presence case be observable? | Kind |
|---|---|---|
| Item 2: no row / flag unset | yes: `verdict=latched` line plus a row plus a census entry | falsifiable |
| Item 3: no `Failed to refresh credentials` | yes: item 4's launch produces that exact literal in that exact sink | falsifiable (positive control exists) |
| Item 4: no GOG row | yes, as item 2 | falsifiable |
| Item 7: no `latched` for steam/humble; Humble has no row | yes: any write logs `verdict=latched` | **structural guarantee**: `verdict.ts:103-105` returns `unchanged` before any store write, so this confirms an existing guarantee, not a novel discovery |
| Item 7: Steam row stays | yes: the row is observed present at boot before the pass | falsifiable |
| Item 8: no `[signInProbe]` line caused by the late Deny | yes: the pass logs through `logInfo` | falsifiable |
| Items 10d/11d: row absent | yes: the same row was observed present earlier in the same launch | falsifiable |
| Item 9 (as worded): PID gone after quit | **no**: SIGTERM kills it regardless | **vacuous, restated (R50/R51)** |

### Test 5 — requirement-interaction reachability (the pairing pass)

**Reduction applied:** every _state-mutating_ requirement against every _evidence-bearing_
requirement, not the full (M+N)² cross product.

- **M = 14 state-mutating requirements:** m1 Epic `user.json` edit; m2 gogdl `auth.json` edit;
  m3 nile `current_user.json` edit; m4 nile `installed.json` emptied; m5 `/etc/hosts` block;
  m6 app relaunch (rotates `gamelib.log` and the runner logs, resets the process-scoped Deny memo,
  the sticky Steam unlock, the sign-in epochs and gogdl's TTL cache); m7 Keychain Deny (arms the 120 s
  memo); m8 Keychain Allow; m9 dismiss; m10 sign-in completion; m11 theme switch;
  m12 `GAMELIB_DEV_SECRET_VAULT` toggle (including the Steam latch the vault builds write);
  m13 the direct sidecar run (rotates logs, runs against the real profile); m14 every restore step.
- **N = 13 evidence-bearing requirements:** e1 `[signInProbe]` lines; e2 keyring `trigger=` lines;
  e3 `legendary` runner log; e4 `gog` runner log; e5 `nile` runner log; e6 persisted-flag census;
  e7 Library rows; e8 Accounts tile text; e9 the dismissed setting; e10 `terminal.log` `[shell]`
  lines; e11 timing numbers; e12 archive completeness; e13 backup validity as a restore source.
- **Pairs considered: 14 × 13 = 182. Pairs flagged: 23. Intended-by-design: 3 (m9×e9, m10×e8,
  m11×e7: the mutation _is_ what the evidence observes). Remaining 156: disjoint file or process,
  no interaction.**

Every flagged pair, with its disposition:

| # | Pair (mutator × evidence) | What would be destroyed or invalidated | Disposition in the contract |
|---|---|---|---|
| F1 | m6 × e1 | `gamelib.log` renamed to `.old` on the next process's first write (`log_writer.ts:144-146`); a second relaunch overwrites `.old` | `gate_archive N` after every quit, before the next launch |
| F2-F4 | m6 × e3, e4, e5 | the same rotation applies to each runner log (R3) | runner logs archived per launch (**extends reference §3**, which names only `gamelib.log`) |
| F5 | m6 × e6 | launch 2's `expired` latch persists and would make launch 4's "no row, flag unset" fail or pass wrongly | launch 3 added: restore + a healthy launch that clears the flags before any absence assertion |
| F6 | m6 × e13 | a healthy launch can refresh and **rotate** a refresh token (gogdl does, RESEARCH 594), so an older backup restores a dead token | `gate_backup N` after **every** quit; each induction restores from the backup taken after the launch before it |
| F7 | m7 × e2 | item 7's Deny arms the 120 s memo (`keyringTokenStore.ts:60`); item 8 in the same process would be answered from memo with no prompt | item 8 is its own launch (7), a new process |
| F8 | m8 × e2 | a persistent "Always Allow" would remove the prompt that items 7/8 need | Allow-once only, and launch 9 runs after 6 and 7 |
| F9 | m12 × e2 | `pnpm tauri:dev` sets the vault variable, bypassing the Keychain; items 7/8 would be vacuous | `pnpm tauri:dev:keyring` plus the env assertion (R7) |
| F10 | m12 × e6 | vault launches read the Steam slot as absent and latch `credentialsMissing` | recognised and used: it is item 7c's precondition, cleared by launch 9's Allow |
| F11 | m9 × e7 | a dismissed row hides item 11d's "no row", proving nothing | item 11 uses store A, item 10 uses store B |
| F12 | m10 × e7 | completing a sign-in turns item 10's store into a connected one | same separation |
| F13-F16 | m13 × e1, e3, e4, e5 | the direct sidecar run rotates `gamelib.log` and the runner logs and uses the real profile | runs after `gate_archive 7`; archived as launch 8; named real-profile arm |
| F17 | m5 × e1 | a hosts block wide enough to take the app offline suppresses the pass, making every "no row" vacuous | only the OAuth hosts are blocked; `pass started` is required positively (R21) |
| F18 | m5 × e4 | the block exercises nothing against a valid unexpired GOG token | item 4 restated with `loginTime=1` (R29/R30) |
| F19 | m14 × e6 | a restore that did not take would look like a store the app cannot reach | each restore has a positive observable (`outcome=healthy` next launch; `curl` status; `diff`) |
| F20 | m1 × e1 | legendary deleting `user.json` would make Epic "not connected", so it is never probed | the edit is in place; `pass started stores=` must name `legendary` |
| F21 | m3 × e5 | a nile edit that does not trigger a refresh leaves item 5 unobserved | the runner-log line, not the edit, is the proof; FAIL means re-run |
| F22 | m4 × e5 | an emptied `installed.json` may stop `list-updates` refreshing (A4) | this is item 6's purpose, recorded as a result |
| F23 | m6 × e10 | a truncating `tee` on relaunch destroys the transcript (F-34.4.2-11, the original defect) | `tee -a` throughout; delimiter per launch |

**Counts for this review: 64 table rows (R1-R64: 41 REACHABLE, 21 CONDITIONAL, 2 IMPOSSIBLE-as-worded, both restated); 182 pairs considered; 23 flagged; 0 unresolved.**

### Test 6 — pre-existing external-state reachability

| Item premise | External state that could invalidate it | Check that covers it |
|---|---|---|
| 1, 3, 5 "credential is expired" | legendary / gogdl / nile each cache or refresh on their own | the runner-log line for each, not the edit, is the proof (R16, R27, R35) |
| 3 "the refresh is attempted" | gogdl's TTL cache hides the spawn | fresh process each launch; `Running command: … auth` required (R26) |
| 4 "the refresh reaches the network" | an unexpired GOG token never calls out | `loginTime=1` added (R29/R30) |
| 2, 4 "the host is unreachable" | DNS cache, an unrelated resolver path | `curl` exit proof before the launch and a status proof after the restore |
| 7, 8 "Keychain used" | `GAMELIB_DEV_SECRET_VAULT` exported in the operator's shell; a persisted "Always Allow" | env assertion, `tauri:dev:keyring`, dialog seen (R7, R39, R40) |
| 7c "Steam pre-latched" | vault launches may not have latched it | `flags.log` after launch 5; else not scored (R41) |
| 9 "all five stores connected" | the pass starts only when online | `pass started stores=` names all five (R52) |
| 10 "a never-connected store exists" | all five connected | preflight step 5, sign-out fallback (R54) |
| 11 "logged out" | the **WKWebView cookie jar** can auto-complete the overlay with no form (F-34.4.2-16) | the rendered login form is the positive observable (R60) |
| every launch | a stale `gamelib-shell` instance | `pgrep` empty before, 1 after (R4) |

### Test 7 — UI-level reachability (operator gesture sequences)

| Gesture | Component that renders the control | State assumed | Result |
|---|---|---|---|
| Item 1/3/5: look at the Library notice and the Accounts tile | Library tab and `LibrarySignInNotice`; Accounts tab and `Login/index.tsx` tiles | rows derive from persisted flags at launch | reachable |
| Item 10a: see the row, its `Sign in` and × | `LibrarySignInNotice/index.tsx:150-182` | `row.dismissible` true for `not-connected` | reachable |
| Item 10b: switch theme | `ThemeSelector`, `GeneralSettings/index.tsx:36` | Settings route reachable from the nav | reachable |
| Item 10c: click × | `index.tsx:181` → `GlobalState.tsx:857` | none | reachable |
| Item 11a: click `Sign in` | `index.tsx:166` → `/login?open=<store>` → `Login/index.tsx:246-257` | the effect is keyed on `searchParams`, not `loading` | reachable |
| Item 11a (tile path): click a store tile instead | `Runner/index.tsx:128-136`; all five tiles pass `primaryLoginAction` (`Login/index.tsx:455,473,491,520,535`) | none | reachable, and **no route navigation** unmounts the other tiles (the F-34.4.2-17 trap does not apply here) |
| Item 11b: Games then Accounts | `NavShell` tabs, `navTabs.ts:11` | none | reachable |
| Item 11c: **Back** | **no UI control**; `window.history.back()` only via a gamepad B press, `tauriGamepadInput.ts:147-150` | a controller | **CONDITIONAL**: inspector `history.back()` stand-in, or withdrawn with the unit cover named |
| Item 7/8: click Deny / do nothing | macOS system dialogs, not app UI | the dialog appears | reachable if R40 holds |

### Review-driven changes (nothing withdrawn; two items restated)

1. **Item 9 restated (R50 IMPOSSIBLE → R51).** Measured by running the sidecar directly with stdin
   closed at READY, not by quitting the app.
2. **Item 4 restated (R29 IMPOSSIBLE → R30).** Adds `loginTime=1` so a refresh is actually attempted.
3. **Launch 3 added** (restore plus a healthy "clear" launch), because launch 2's persisted
   `expired` latches would otherwise contaminate launch 4's absence assertions (F5).
4. **Runner logs archived per launch**, and **credentials backed up after every launch** (F2-F4, F6).
5. **Item 8 is its own launch** and is scored by an `elapsed` window, not by `bound reached`
   alone (F7, R48).
6. **Items 10 and 11 use two different never-connected stores** (F11, F12), and item 11's Back leg
   is conditional (R62).
7. **Items 5/6 gain an arm B** for an operator with no installed Amazon game (R33, A4).
8. **Which dev command is which** is stated (`tauri:dev` sets the vault variable; `tauri:dev:keyring`
   does not), because the prior Steam keyring gate's "build with `pnpm tauri:dev`" is now the
   opposite of what items 7/8 need (F9).

### What this review does not claim

This list is drawn from defects this project has already measured; nothing here shows it complete.
The count of structural impossibilities found in this contract at authoring time is **2** (R29,
R50), both restated before publication; 49-12 should record the count it meets at run time,
whatever it is, so the next completeness gap surfaces as a number. Tests 6 and 7 were applied for
the first time here. The three theme names are all present in the selector's set (`themeLabels.ts:43,107` for
`gruvbox_dark`). Four operator-supplied facts are not verifiable from this Windows box and are
discovered at preflight: the `userData` directory name, the credential files' key names, the Epic
OAuth hostname legendary contacts, and whether a Keychain "Always Allow" already exists.

---

## Run 1 — 2026-10-09 (UTC; operator's local date 2026-10-10 NZDT)

**Operator:** the project owner, on the Mac, driving the app window, the Keychain dialogs and
`sudo`. **Shell side:** driven from the assistant's shell after the operator's interactive zsh
swallowed three multi-line pastes (`interactive_comments` off, then `banghist`, then an unexplained
silent paste); recorded in `preflight.txt`. PID checks on the assistant side used
`pgrep -x gamelib-shell` because a `bash -c` carrying the `-f` pattern self-matches.

**Session dir:** `/tmp/gamelib-gate-49-20261009T193112Z`, mode 0700. **Tags under test:**
legendary 0.21.0, gogdl v1.3.0, nile v1.2.0 (`meta/releaseTags.ts:44-46`). Sidecar rebuilt
before launch 1 (`build/main/sidecar.js`, 1442145 bytes).

**Launches run:** 1, 2, 3, 4, 6, 7, 8, 9, 10. **Launch 5 not run** (see item 5/6). Every launch
had exactly one `gamelib-shell` instance at window-up and at teardown. No launch was aborted.

### Preflight facts that changed the plan

- Credential paths resolved: Epic `GameLib/legendaryConfig/legendary/user.json`; GOG
  `gamelib/gog_store/auth.json` (one directory, two spellings); Amazon
  `GameLib/nile_config/nile/current_user.json` + `installed.json`.
- Epic keys include `expires_at`, `refresh_expires_at`, `refresh_token` (induction as written).
- GOG entry keys include `loginTime` (induction as written; one account entry).
- **Amazon `current_user.json` holds only `name` and `user_id`.** nile v1.2.0 keeps its tokens
  in an encrypted `*.enc` blob in the same directory. The item 5 induction (edit refresh/expiry
  keys) has nothing to edit. Installed count = 0.
- All five stores connected at launch 1 (Accounts screen); never-connected set empty, so items
  10/11 used the sign-out fallback (Humble = B, GOG = A). No controller: item 11c used the
  inspector `history.back()` stand-in.

### Verdicts

One line per item for the record gate, then the table:

- Item 1 — PASS (launch 2), with FINDING F-49-R1-1
- Item 2 — PASS (launch 4)
- Item 3 — PASS (launch 2)
- Item 4 — PASS (launch 4)
- Item 5 — NOT SCORED (induction impossible: encrypted nile token store); FINDING recorded, todo filed
- Item 6 — FINDING A4 (result (c), from launches 1-4; launch 5 skipped as redundant)
- Item 7 — PASS (launch 6; Steam denied, Humble recorded absent)
- Item 8 — PASS (launch 7)
- Item 9 — PASS (launch 8)
- Item 10 — FAIL on 10d (launch 10); 10a/10b/10c PASS; FINDING nord_light
- Item 11 — PASS (launches 9, 10)

| Item | Launch | Result | Evidence | Notes |
|---|---|---|---|---|
| 1 | 2 | **PASS** (+ FINDING) | `gamelib-launch-2.log`, `runner-legendary-launch-2.log`, `flags.log` | screenshots not captured (capture loop saw the wrong Space); row/tile copy operator-attested. FINDING: legendary **deleted `user.json`** on the invalid refresh token; see F-49-R1-1. |
| 2 | 4 | **PASS** | `gamelib-launch-4.log`, `runner-legendary-launch-4.log`, `hosts-check.txt`, `item2-library.png` | Library showed "Epic Games is not connected" (F-49-R1-1 fallout), not an expired row. |
| 3 | 2 | **PASS** | `gamelib-launch-2.log`, `runner-gog-launch-2.log`, `flags.log` | gogdl did not rewrite or remove `auth.json` (mtime unchanged). |
| 4 | 4 | **PASS** | `gamelib-launch-4.log`, `runner-gog-launch-4.log`, `hosts-check.txt` | |
| 5 | — | **NOT SCORED** | `preflight.txt` | induction impossible by file edit (encrypted token store); operator declined server-side device deregistration. Follow-up todo, `ready: live-gate`. |
| 6 | 1-4 (launch 5 skipped) | **FINDING (A4)** | `runner-nile-launch-{1,2,3,4,6,7,9}.log` | with 0 installed, `list-updates --json` prints `[]` + `ERROR [CLI]: No games installed` before any auth; observed 7×. Result (c). |
| 7 | 6 | **PASS** (Steam) / Humble recorded as absent | `gamelib-launch-6.log`, `item7-library.png` | one dialog (Steam) denied; Humble slot read `ok present=false` (session lives in the dev vault, not the Keychain), review Test 2 CONDITIONAL. 7c PASS: Steam row still present. No dialog screenshot. |
| 8 | 7 | **PASS** | `gamelib-launch-7.log`, `item8-timeline.txt` | sidecar bound won: `bound reached`, `steam outcome=unknown elapsed=45009ms`; Rust `keyring:timeout` 6 ms later; late Deny produced no `[signInProbe]` line. |
| 9 | 8 | **PASS** | `gamelib-launch-8.log`, `sidecar-stdout.txt`, `item9-timing.txt` | `EXIT_CODE 0`, elapsed **2.437 s**, `pass started stores=legendary,gog,nile,humble,steam`, no leftover pid. |
| 10 | 9, 10 | **FAIL (10d)**; 10a/10b/10c PASS; FINDING (nord_light) | `item10-themes/`, `config-dismissed.txt`, `item10d-launch10-library.png` | dismiss persisted (`store/config.json settings.dismissedSignInNotices = ["humble"]`) yet the Humble row returned on relaunch. See F-49-R1-3. |
| 11 | 9, 10 | **PASS** | `gamelib-launch-9.log`, `item11-shot-{1,2}.png`, `gamelib-launch-10.log` | exactly two `oauthLoginCapture runner=gog` windows in launch 9: `loginwin-2 … cancelled reason=window-closed` (11a close), `loginwin-3 … captured` (11d). No third window → 11b/11c did not reopen. Launch 10: `gog outcome=healthy`, no GOG row. |

### Required literals observed (redacted excerpts)

Launch 1 (positive control): `pass complete outcomes=legendary:healthy,gog:healthy,nile:healthy,humble:healthy,steam:expired` (Steam latched by the vault build as the contract predicts; `credentialsMissing` present in `flags.log` after launch 1).

Launch 2:
```
[signInProbe] pass started stores=legendary,gog,nile,humble,steam
Sign-in probe: … legendary status --json
[signInProbe] legendary outcome=expired elapsed=1049ms
[signInProbe] legendary verdict=latched
Running command: … gogdl --auth-config-path "…/gog_store/auth.json" auth
[signInProbe] gog outcome=expired elapsed=1041ms
[signInProbe] gog verdict=latched
[signInProbe] pass complete outcomes=legendary:expired,gog:expired,nile:healthy,humble:healthy,steam:expired
runner-legendary: [EPCAPI] ERROR: Login to EGS API failed with errorCode: errors.com.epicgames.account.auth_token.invalid_refresh_token
runner-legendary: [Core] ERROR: Stored credentials are no longer valid! Please login again.
runner-gog: null            (×3, one per gogdl auth spawn; NO "Failed to refresh credentials")
flags: legendary_store/config.json "expired": true ; gog_store/config.json "expired": true
```
`status --json` printed **no JSON to stdout** on the failure path (A5: the healthy path's stdout was not inspected for the `account` key in this run; the classifier reached `expired` from the stderr marker).

Launch 3 (clear): `gog outcome=healthy` + `gog verdict=cleared`; `legendary outcome=healthy` + `legendary verdict=cleared`; flags census: Steam only.

Launch 4:
```
[signInProbe] legendary outcome=unknown elapsed=685ms
[signInProbe] legendary verdict=unchanged
[signInProbe] gog outcome=unknown elapsed=430ms
[signInProbe] gog verdict=unchanged
runner-legendary: [Core] ERROR: HTTP request for login failed: ConnectionError(MaxRetryError('HTTPSConnectionPool(host='account-public-service-prod03.ol.epicgames.com', port=443) …
runner-gog: [AUTH] ERROR: Failed to refresh credentials   (then null)
hosts-check: epic curl exit=7 (block) → after restore epic http=404, gog http=404; diff clean; 0 gate lines left
```

Launch 6:
```
SidecarKeyringSlotStore(humble-session).getToken(): keyring_get ok present=false len=0 trigger=unspecified elapsed=44ms
SidecarKeyringSlotStore(steam-refresh-token).getToken(): issuing keyring_get (may prompt) trigger=boot-probe
SidecarKeyringSlotStore(steam-refresh-token).getToken(): keyring_get failed: keyring:unavailable:Platform secure storage failure: User canceled the operation. trigger=boot-probe elapsed=3134ms
keyring failure memoized slot=steam-refresh-token class=unavailable ms=120000 trigger=boot-probe
[signInProbe] steam outcome=unknown elapsed=3135ms / steam verdict=unchanged
[signInProbe] humble outcome=unknown elapsed=3ms / humble verdict=unchanged
```

Launch 7:
```
09:44:00 steam-refresh-token issuing keyring_get (may prompt) trigger=boot-probe
09:44:45 [signInProbe] steam bound reached
09:44:45 [signInProbe] steam outcome=unknown elapsed=45009ms ; steam verdict=unchanged
09:44:45 pass complete outcomes=legendary:healthy,gog:healthy,nile:healthy,humble:unknown,steam:unknown
09:44:45 keyring_get failed: keyring:timeout trigger=boot-probe elapsed=45015ms ; memoized class=timeout
(late Deny after pass complete: no further [signInProbe] line)
```

Launch 8 (`item9-timing.txt`): `EOF_AT 1791578785.420`, `EXIT_CODE 0`, `EXIT_AT 1791578787.857`, `ELAPSED 2.437 s`, pgrep empty. `gamelib-launch-8.log`: `pass started stores=legendary,gog,nile,humble,steam`; legendary/gog/nile outcomes logged; no `pass complete` (steam/humble keyring invokes had no peer and rode the unref'd timer, as scoped).

Launch 9: Allow → `steam-refresh-token keyring_get ok present=true len=493 trigger=boot-probe elapsed=26303ms`, `steam outcome=healthy`, `steam verdict=cleared`; flags census empty. `GOG logout: cleared 6 cookie(s)`. `config-dismissed.txt`: `config.json.defaultSettings.dismissedSignInNotices = ["humble"]` and `store/config.json.settings.dismissedSignInNotices = ["humble"]`.

Launch 10: `pass started stores=legendary,gog,nile,steam` (Humble signed out), all four `healthy`; dismissed list still `["humble"]`; **Library rendered "Humble Bundle is not connected" with Sign in and ×** (operator-observed, `item10d-launch10-library.png`).

### Findings (each has a pending todo)

- **F-49-R1-1 (item 1, major).** legendary 0.21.0 **deletes `user.json`** when the refresh token is rejected. `LegendaryUser.isLoggedIn()` is `existsSync(user.json)`, `getUserInfo()` then purges `userInfo` from the backend config store (`legendary/user.ts:713`), and the renderer only asks for a rebuild when `userInfo` already exists (`GlobalState.tsx:1859`). Net effect after a real expiry: the Accounts tile reads "EPIC GAMES LOGIN", the Library shows "Epic Games is not connected", and the "Sign-in expired — Reconnect" copy is visible only in the session that latched it. The `expired` latch itself is correct. Restored in this run by a real Epic login in launch 10.
- **F-49-R1-2 (items 3 and 9, renderer, medium).** A mid-session `verdict=cleared` does not reach the Library until it remounts: Epic's row stayed after a 2.4 s clear in launch 3 (confounded by F-49-R1-1), and a stale Steam expired row rendered ~70 s after `steam verdict=cleared` in launch 9 and vanished on navigating away and back.
- **F-49-R1-3 (item 10d, major, FAIL).** Dismissal persisted to both config files, yet the row returned on relaunch. `GlobalState.tsx:528` seeds `dismissedSignInNotices` from `configStore.get_nodefault('settings')` at module load (`:82`); the on-disk `["humble"]` did not reach that seed.
- **F-49-R1-4 (item 6, A4).** With nothing installed the Amazon probe is a no-op: nile exits before auth. A user with no installed Amazon game is never told their Amazon sign-in expired. Note: nile's `library sync` (run by the app anyway) does exercise the token and succeeded every launch.
- **F-49-R1-5 (nile classifier, medium).** Identical nile output (`[]` + `No games installed`) classified `healthy` in launches 1-4 and 9-10 but `unknown` in launches 6-7; the only visible difference is stdout/stderr interleaving order.
- **F-49-R1-6 (item 10b, nord_light, minor).** Operator judgment: the not-connected row's text renders black on a dark banner in `nord_light`; illegible. The three required themes were judged pass.
- **Operator UI notes (not gate items):** the sign-in rows render after the first shelf, not at the top; the banner's vertical padding could be halved.

### Restores and final state

Epic `user.json` restored from `after-L1` after launch 2 (positive: `legendary outcome=healthy`, `verdict=cleared` in launch 3). GOG restored from `after-L1` after launch 2 and from `after-L3` after launch 4 (positive: `gog outcome=healthy` in launches 3 and 6). `/etc/hosts` restored: diff clean, 0 gate lines, both hosts HTTP 404. Amazon untouched. Theme back on `zombie`. Final connection state: Epic signed in (real login, launch 10), GOG signed in (item 11d), Amazon connected, Humble signed in again (launch 10, `keyring_set ok`), Steam connected. Structural impossibilities met at run time: **1** (item 5's induction; the contract's preflight-conditional R34 fired).

### Closing inventory

`ls -la` of the session dir: 9 `gamelib-launch-N.log` files (1,2,3,4,6,7,8,9,10), 27 runner logs, `terminal.log`, `flags.log`, `hosts-check.txt`, `item8-timeline.txt`, `item9-timing.txt`, `config-dismissed.txt`, `preflight.txt`, `sidecar-stdout.txt`, 8 PNGs + `item10-themes/` (4 PNGs), `secrets/` (34 entries), `excerpts/` (43 redacted files, self-checked: 0 names, 0 emails, 0 token-shaped strings).

```
wc -l (selected):
     173 gamelib-launch-1.log     148 gamelib-launch-2.log     144 gamelib-launch-3.log
     187 gamelib-launch-4.log      97 gamelib-launch-6.log      97 gamelib-launch-7.log
      37 gamelib-launch-8.log     527 gamelib-launch-9.log     269 gamelib-launch-10.log
     650 terminal.log              27 flags.log                 71 preflight.txt
    3882 total
```

## Verdict

**FAIL 8/11** on the strict count: items 1, 2, 3, 4, 7, 8, 9, 11 PASS; item 10 FAIL (10d); item 5 NOT SCORED; item 6 FINDING (acceptable result (c)). The probe layer (classifiers, verdict writer, bound, Keychain degradation, sidecar exit) passed every scored item. The failures and major findings are in the renderer's persistence and re-derivation, plus legendary's file deletion.

**Assumptions:** A1 CONFIRMED (launch 2 marker; launch 4 negative marker). A2 CONFIRMED (bare `null`, no refresh-failed line for a dead token; `Failed to refresh credentials` for a blocked host). A3 NOT TESTED (item 5). A4 CONFIRMED as a FINDING (no refresh with 0 installed). A5 PARTIALLY CONFIRMED (stderr marker reaches the probe; stdout carries no JSON on failure; healthy-path `account` key not inspected). A6 NOT TESTED (item 5).
