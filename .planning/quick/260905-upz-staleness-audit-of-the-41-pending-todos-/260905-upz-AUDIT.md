# 260905-upz Staleness Audit — Ledger

All commands below were run in this session, against HEAD (`840196e9c`), from the repo root. Every
row cites the command and its verbatim (or line-count-abridged, never edited) output.

---

## Section 1 — Candidate group A: the two `installed.json` watcher todos

### `2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md`
### `2026-08-25-installed-json-watcher-not-ported-to-tauri.md`

**Command:** `ls -la src/backend/sidecar/installedJsonWatcher.ts`
```
-rw-r--r--@ 1 graysonmitchell  staff  9185 Sep  1 22:00 src/backend/sidecar/installedJsonWatcher.ts
```
The watcher module exists on disk.

**Command:** `grep -vE '^\s*(//|\*|/\*)' src/backend/sidecar/bootstrap.ts | grep -n 'startInstalledJsonWatcher'`
(comment-stripped — `bootstrap.ts:661` names the module in a comment and would satisfy a naive grep;
this is the real import + call site)
```
10:import { startInstalledJsonWatcher } from './installedJsonWatcher'
307:      startInstalledJsonWatcher()
310:        `[bootstrap] startInstalledJsonWatcher() failed: ${error}`,
```
A real import and a real call site, both surviving comment-strip.

**Command:** `grep -c "installed.json updated, refreshing library" build/main/sidecar.js`
```
1
```
Both todos' discharge condition (this exact log string appearing in the built bundle) now returns
`1`; both recorded `0` at filing time.

**Command:** `ls -la build/main/sidecar.js src/backend/sidecar/installedJsonWatcher.ts`
```
-rw-r--r--@ 1 graysonmitchell  staff  1351269 Sep  5 20:45 build/main/sidecar.js
-rw-r--r--@ 1 graysonmitchell  staff     9185 Sep  1 22:00 src/backend/sidecar/installedJsonWatcher.ts
```
The bundle (Sep 5 20:45) **postdates** the source (Sep 1 22:00), so the bundle grep is admissible
corroboration here — but the load-bearing evidence is the source call site above (bootstrap.ts),
which does not depend on when the bundle was last built.

**Command:** `ls src/backend/main.ts`
```
ls: src/backend/main.ts: No such file or directory
```
Confirmed absent — the 08-24 todo's third clause ("sweep `main.ts` for other unported non-handler
side effects") targets a file that no longer exists. The question behind that clause (are there
other unported non-handler side effects in the sidecar's own bootstrap?) has not been answered by
any of the above and remains open.

**Verdict, A1 (`…never-ported-to-the-tauri-sidecar.md`):** PARTIAL — headline defect (watcher absent)
is answered; third clause (`main.ts` sweep) cannot be executed as written and is unanswered.

**Verdict, A2 (`…not-ported-to-tauri.md`):** PARTIAL — the watcher-ported conjunct is answered; the
todo's other conjunct (a live re-drive of `getDefaultSavePath` against a real legendary title
returning a non-empty path on the first call) has not been observed in this session and cannot be
cheaply checked (needs a live app session + an installed legendary title).

---

## Section 2 — Candidate group B: the two rsync todos

### `2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects.md`

This todo has no `## Not yet established` section (it has `## Suggested fix`, 4 numbered items).
Read first via `cat`, then judged against current code, item by item.

**Command:** `sed -n '1200,1245p' src/backend/utils.ts`
```
  const destination = join(newInstallPath, basename(install_path))

  let currentFile = ''

  // D-35-19-07: `which rsync` answers the wrong question. macOS 15+ (Sequoia)
  // ships Apple's `openrsync` as /usr/bin/rsync, so the existence probe SUCCEEDS
  // and the `mv` fallback below never engages -- while openrsync rejects two of
  // the flags GNU rsync takes, aborting the move outright. What matters is the
  // IMPLEMENTATION, so probe `rsync --version` (which also proves existence).
  let rsyncFlavour: 'gnu' | 'openrsync' | null = null
  try {
    const { stdout } = await execAsync('rsync --version')
    rsyncFlavour = /openrsync/i.test(stdout) ? 'openrsync' : 'gnu'
  } catch (error) {
    logError(error, LogPrefix.Gog)
  }
  if (rsyncFlavour) {
    const origin = install_path + '/'
    // `--no-human-readable` is load-bearing on GNU, not decoration: without it
    // GNU groups digits (`12,582,912`) and the `/^\s+(\d+)/` byte parse in the
    // progress callback below reads "12". openrsync implements neither that flag
    // nor `--info=`, but already prints plain digits, and its `--progress` output
    // is byte-compatible with that same parser (verified against a real
    // transfer), which is why the callback is untouched by this fix.
    //
    // The GNU list is kept byte-identical to what shipped before, so the path
    // that already worked cannot regress.
    const rsyncArgs =
      rsyncFlavour === 'openrsync'
        ? ['--archive', '--compress', '--remove-source-files', '--progress']
        : [
            '--archive',
            '--compress',
            '--no-human-readable',
            '--remove-source-files',
            '--info=name,progress'
          ]
    logInfo(
      `moving command (${rsyncFlavour}): rsync ${rsyncArgs.join(
        ' '
      )} ${origin} ${destination} `,
      LogPrefix.Backend
    )
```

**Command:** `grep -vE '^\s*(//|\*|/\*)' src/backend/utils.ts | grep -n "rsyncFlavour\|no-human-readable"`
(comment-stripped — the explanatory comment block at ~1205-1226 cannot satisfy this on its own)
```
1057:  let rsyncFlavour: 'gnu' | 'openrsync' | null = null
1060:    rsyncFlavour = /openrsync/i.test(stdout) ? 'openrsync' : 'gnu'
1064:  if (rsyncFlavour) {
1067:      rsyncFlavour === 'openrsync'
1072:            '--no-human-readable',
1077:      `moving command (${rsyncFlavour}): rsync ${rsyncArgs.join(
```
Real (non-comment) code branches on flavour and only puts `--no-human-readable` / `--info=` in the
GNU arm.

**Command:** `grep -rn "moveOnUnix\|moveInstall" src/backend/storeManagers/legendary/games.ts src/backend/storeManagers/gog/games.ts`
```
src/backend/storeManagers/legendary/games.ts:19:  moveOnUnix,
src/backend/storeManagers/legendary/games.ts:353:  async moveInstall(
src/backend/storeManagers/legendary/games.ts:359:    const moveImpl = isWindows ? moveOnWindows : moveOnUnix
src/backend/storeManagers/legendary/games.ts:742:      await thirdParty.removeInstalledGame(this.appName)
src/backend/storeManagers/gog/games.ts:9:  moveOnUnix,
src/backend/storeManagers/gog/games.ts:775:  async moveInstall(
src/backend/storeManagers/gog/games.ts:782:    const moveImpl = isWindows ? moveOnWindows : moveOnUnix
```
Both legendary and gog `moveInstall` route to the same shared `moveOnUnix` in `utils.ts`.

**Command:** `sed -n '1246,1330p' src/backend/utils.ts` (the mv fallback and success-test region)
```
    if (code === 0) {
      logInfo(`Finished Moving ${title}`, LogPrefix.Backend)
      // remove the old install path
      await spawnAsync('rm', ['-rf', install_path])
    } else {
      // log-secret-gate-exempt: stderr of rsync (install move), not an auth command
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  } else {
    const { code, stderr } = await spawnAsync('mv', [
      '-f',
      install_path,
      destination
    ])
    // D-35-19-08: same inverted test as above. `mv` reports any failure as a
    // non-zero exit, not specifically 1.
    if (code === 0) {
      return { status: 'done', installPath: destination }
    } else {
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  }
```
The `code !== 1` inverted test named in the todo's item 3 no longer exists anywhere in this function
— both the rsync arm and the `mv` arm now test `code === 0` (attributed to `D-35-19-08` in a
preceding comment).

**Command:** `find src/backend -iname "*utils*test*" | xargs grep -ln "rsync"` →
`src/backend/__tests__/moveOnUnix.test.ts`, then
`grep -n "openrsync\|no-human-readable\|argv\|toHaveBeenCalledWith" src/backend/__tests__/moveOnUnix.test.ts`
```
52:function withRsync(flavour: 'gnu' | 'openrsync' | 'absent') {
59:      flavour === 'openrsync'
60:        ? 'openrsync: protocol version 29\nrsync version 2.6.9 compatible\n'
124:    test('openrsync is never passed the two flags it rejects', async () => {
125:      withRsync('openrsync')
131:      expect(args).not.toContain('--no-human-readable')
147:        '--no-human-readable',
155:    test('openrsync still takes the rsync path — it does NOT fall through to mv', async () => {
159:      withRsync('openrsync')
```
A unit test pinning the argv per flavour exists.

**Item-by-item verdict:**
| # | Suggested fix | Answered by |
|---|---|---|
| 1 | Capability probe, not existence probe | `rsync --version` / flavour detection — YES |
| 2 | Drop unsupported flags on openrsync / fall back with a log | openrsync arm uses only supported flags — YES |
| 3 | Fix `code !== 1` success test in `mv` arm | now `code === 0` in both arms — YES |
| 4 | Unit test pinning exact argv | `moveOnUnix.test.ts` — YES |

**Verdict:** DISCHARGED — all four suggested-fix items are answered by code that survives
comment-stripping, plus a call-site grep confirming both consumers share the fixed function.

### `2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md`

**Command:** `grep -n -A12 'Not yet established' .planning/todos/pending/2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md`
```
39:## Not yet established
40-
41-- **Whether it reproduces under Tauri.** The A/B run could not tell: on the Tauri leg the
42-  `openDialog` invoke was dropped at the 60s `INVOKE_TIMEOUT` bound before the move was ever
43-  requested, so no `rsync` was spawned and the leg carries no evidence either way. Predicted to
44-  reproduce (shared code), but predicted is not measured.
45-- **Which call site builds the flag list**, and whether other `rsync` flags in the same invocation
46-  are also unsupported. `--no-human-readable` is the first flag rejected; openrsync may reject more
47-  once that one is removed. Fixing only the flag that happened to be reported first is the obvious
48-  trap here.
49-- Whether Homebrew `rsync` (GNU rsync 3.x, if installed and earlier in `PATH`) masks this on some
50-  developer machines — which would explain why it has not been hit before.
```

Same `utils.ts:1204-1233` region and the same call-site grep as above apply here (this todo and
the 08-24 todo target the identical function). Judged clause by clause:

- **"Whether it reproduces under Tauri"** — not independently re-measured live in this session
  (no live move was driven). But the underlying code path (`moveOnUnix`) is shared unconditionally
  by both the legendary and gog `moveInstall` methods regardless of Electron/Tauri front end (same
  call-site grep as group A above), so this closes **on code**, not on an observed move under Tauri.
- **"Which call site builds the flag list, and whether other flags are also unsupported"** —
  answered: `moveOnUnix` in `utils.ts` (called from `legendary/games.ts:359` and `gog/games.ts:782`);
  the openrsync arm already drops both flags this todo worried about (`--no-human-readable` and,
  implicitly, `--info=name,progress` — replaced with `--progress`), so no second flag remains to be
  discovered incrementally.
- **"Whether Homebrew rsync masks this on developer machines"** — not a discharge-blocking clause,
  it is explanatory speculation about why the bug went unnoticed; not applicable to whether the fix
  is present.

**Verdict:** DISCHARGED — same fix, same call sites, no residue. What is NOT claimed: the flavour
branch has not been exercised live on macOS in this session, so this closes on code, not on an
observed move.

---

## Section 3 — Candidate group C: `2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md`

**Command:** `grep -vE '^\s*(//|\*|/\*)' src/frontend/components/UI/PathSelectionBox/index.tsx | grep -n "commitFromBlur\|commitPath"`
```
60:  function commitPath(next: string) {
70:    commitPath(next)
74:  function commitFromBlur(next: string) {
79:    commitPath(next)
84:      commitPath('')
97:        commitPath(selectedPath)
121:      onBlur={(e) => commitFromBlur(e.target.value)}
```
The blur handler now routes through `commitFromBlur` → `commitPath`, the same funnel the picker
route uses — no longer a direct `onPathChange(e.target.value)` call as the todo originally found.

**Command:** `sed -n '100,120p' src/frontend/components/UI/PathSelectionBox/index.tsx`
```
  function commitPath(next: string) {
    enterCommittedRef.current = null
    if (next === path) {
      // Guard G1
      return
    }
    onPathChange(next)
    setJustSaved(true)
  }

  function commitFromEnter(next: string) {
    commitPath(next)
    enterCommittedRef.current = next
```
Guard G1: `if (next === path) return` — before this ever calls `onPathChange`. For the reported
scenario (an empty field losing focus), `next === '' === path`, so G1 suppresses the call entirely;
`onPathChange('')` — and therefore `EgsSettings`'s `'unlink'` mapping — never fires.

**Command:** `grep -n "message.unsync\|message.sync\|title:" src/frontend/screens/Settings/components/EgsSettings.tsx`
```
36:          title: t('box.error.title', 'Error')
43:            newPath === 'unlink' ? t('message.unsync') : t('message.sync'),
44:          title: 'EGS Sync'
```
Both the sync and unsync success dialogs still render under the literal, identical title
`'EGS Sync'` — only the body message string differs (`message.sync` vs `message.unsync`).

**Item-by-item verdict:**
| # | Suggested fix | Status |
|---|---|---|
| 1 | Don't treat an empty field as "unlink"; require explicit clear gesture | Satisfied — G1 suppresses the no-op commit before `onPathChange` fires |
| 2 | Guard the blur route the way the picker route is guarded | Satisfied — `commitFromBlur` → `commitPath` shares G1 with the picker route |
| 3 | Make the two dialogs distinguishable at a glance | **NOT satisfied** — `title: 'EGS Sync'` is identical for both; only `message.sync`/`message.unsync` differ |

**Verdict:** PARTIAL — items 1/2 closed by guard G1; item 3 is live and unaddressed.

---

## Section 4 — Known-live group (one command each, no further investigation)

### `2026-08-22-steam-getgameinfo-returns-empty-on-async-cache-miss.md`
**Command:** `grep -rn "return {} as GameInfo" src/backend/storeManagers/steam/`
```
src/backend/storeManagers/steam/games.ts:618:      return {} as GameInfo
```
**Verdict:** LIVE — unchanged.

### `2026-08-31-tray-about-window-opens-without-focus-on-secondary-display.md`
**Command:** `grep -rn "showAboutWindow" src-tauri/src/`
```
src-tauri/src/main.rs:706:/// Reaches `window.api.showAboutWindow` (`src/preload/api/helpers.ts`, barrelled into
src-tauri/src/main.rs:712:/// name next: the eval below is optional-chained, so if `window.api.showAboutWindow` ever
src-tauri/src/main.rs:716:/// listens for an inbound `showAboutWindow` push (it has only ever been an OUTBOUND call), so
src-tauri/src/main.rs:727:            "[shell] WARN: tray About: no '{MAIN_WINDOW_LABEL}' window to reach window.api.showAboutWindow -- skipping"
src-tauri/src/main.rs:731:    if let Err(e) = window.eval("window.api?.showAboutWindow?.()") {
```
**Command:** `sed -n '700,732p' src-tauri/src/main.rs` (nearby `set_focus` check)
```
fn open_about_window_from_tray(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        eprintln!(
            "[shell] WARN: tray About: no '{MAIN_WINDOW_LABEL}' window to reach window.api.showAboutWindow -- skipping"
        );
        return;
    };
    if let Err(e) = window.eval("window.api?.showAboutWindow?.()") {
        eprintln!("[shell] WARN: tray About: eval failed ({e}) -- About window not opened");
    }
}
```
No `set_focus()` (or any activation call) anywhere in this function — same shape the todo names.
Note: as of quick `260905-d33` (per the docstring above this function), About is now an in-app
modal rather than a separate `WebviewWindow`, so the mechanism has changed — but the underlying
defect (nothing brings the target window to front/focus before dispatching) is unchanged.
**Verdict:** LIVE — unchanged (mechanism shifted but the missing-focus-call defect persists).

### `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`
**Command:** `grep -n "acquire_single_instance" src-tauri/src/main.rs`
```
8043:fn acquire_single_instance(socket_path: &std::path::Path) -> SingleInstanceRole {
8074:// equivalent, so `acquire_single_instance` is never called on a non-unix target at all (see
8075-// `main()`'s `#[cfg(not(unix))]` arm below) -- Windows keeps TODAY's behaviour (a second
8076-// launch starts a second instance), a named, accepted gap, not a silent regression.
8635:        .and_then(|path| match acquire_single_instance(path) {
```
`#[cfg(unix)]` gate confirmed directly above the function definition (line 8042), and the comment
at 8074-8076 confirms Windows is explicitly excluded and the gap is accepted, not silently missing.
**Verdict:** LIVE — unchanged (unix-only guard, as named).

### `2026-09-03-lint-translations-is-structurally-blind-to-an-absent-key.md`
**Command:** `sed -n '130,155p' meta/lintTranslations.ts`
```
function checkFileAgainstEnglish(translations: object) {
  for (const key in translations) {
    checkValueAgainstEnglish(
      translations[key],
      enFiles[processingFile][key],
      key
    )
  }
}
```
`checkFileAgainstEnglish` still iterates `for (const key in translations)` — the TRANSLATION file's
own keys, not English's — so a key present in English but absent from the translation is never
visited.
**Verdict:** LIVE — unchanged.

### `2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md`
**Command:** recursive walk of `public/locales/en/gamelib.json` counting empty-string leaf values
(via a short inline Python script; full traversal, not a raw grep count)
```
6
redeemKey.alreadyOwned
redeemKey.error
redeemKey.invalid
redeemKey.rateLimited
redeemKey.successNoPackage
redeemKey.successWithPackage
```
Count is still 6, and the key set is unchanged (`redeemKey.*`).
**Verdict:** LIVE — unchanged.

### `2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md`
**Command:** `sed -n '295,315p' src/frontend/screens/Game/GamePage/components/MainButton.tsx`
```
      {(!is_installed || is.queued) && (
        <span className="installButtons">
          <button
            onClick={async () => {
              if (!is_installed && !is.queued && gameInfo.runner !== 'steam') {
                openInstallGameModal({
                  appName: gameInfo.app_name,
                  runner: gameInfo.runner,
                  gameInfo,
                  action: 'install'
                })
                return
              }
              handleInstall(is_installed)
            }}
            disabled={disabledInstallButtons}
            autoFocus={true}
            className={classNames(
              'button',
              {
```
The guard at (source) line 303 is `if (!is_installed && !is.queued && gameInfo.runner !== 'steam')`
— still no `!is.installing` term.
**Verdict:** LIVE — unchanged.

### `2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` — deliberately PARKED

**Command:** `grep -n '^status:' .planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md`
```
status: "PARKED 2026-09-04 — superseded by cross-store signed-out/offline mode design (ROADMAP Phase 999.1), which needs boot-time auth state and therefore conflicts with deferring the read. The dev-mode prompt symptom that motivated this todo is addressed by GAMELIB_DEV_SECRET_VAULT=1; the shipped-build prompt count is governed by Apple code signing, not read timing. See PARKED section below for the unpark condition."
```
This todo carries its own written unpark condition and PARKED status as of 2026-09-04. Per this
audit's explicit instruction, a parked item is recorded, not reopened, closed, or adjudicated.
**Verdict:** PARKED — left exactly as filed, no action taken.

---

## Adjudication

| Todo | Verdict | Destination | Residue |
|---|---|---|---|
| `2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md` | PARTIAL | `completed/` | `2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md` |
| `2026-08-25-installed-json-watcher-not-ported-to-tauri.md` | PARTIAL, closes on the mechanism only | `completed/` | `2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md` |
| `2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects.md` | DISCHARGED | `completed/` | no residue |
| `2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md` | DISCHARGED | `completed/` | no residue (same root cause as the 08-24 rsync todo) |
| `2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md` | PARTIAL, closes on items 1/2 only | `completed/` | `2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md` |

Three residue todos newly filed in `.planning/todos/pending/`:
- `2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`
- `2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md`
- `2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md`

---

*(Section 5 — the full 41-todo sweep and queue-state tally — appended in Task 3.)*

---

## Section 5 — Bounded sweep of the remaining 29 (completed by the orchestrator)

The gsd-executor stalled partway through this sweep (stream watchdog, no progress for 600s) after
completing Tasks 1 and 2. Tasks 1-2 output was intact and is unchanged above. This section was
completed directly by the orchestrator rather than by respawning an executor that had already
stalled once.

**Evidence classes are labelled per row, and they are not equal.** Read the class before trusting
the verdict:

- `PROBED` — a command was run against HEAD and its result is decisive for the todo's own claim.
- `BY CONSTRUCTION` — the todo's discharge condition is a human action, a credential, a hardware
  gesture, or an unmade design decision. No commit can satisfy it silently, so code drift cannot
  have discharged it. **No code probe was run.**
- `UNDETERMINED` — a one-command screen was not decisive. The todo needs a full read against its
  own residue clauses, which exceeds this sweep's mandate. **This is a successful audit row, not
  a failure.**

### PROBED — 6 rows

| # | Todo | Command | Result | Verdict |
|---|---|---|---|---|
| 13 | `2026-08-27-i18n-gate-flags-declaration-site-literals` | `sed -n '269,330p' meta/__tests__/genI18nGateScope.test.ts` | `facetLabels.ts`, `chipLabels.ts`, `helpers/gamepad.ts` all still present in `DECLARED_UNSCANNED_DEBT` | **LIVE** |
| 17 | `2026-08-30-library-search-bar-suggestions-are-mouse-dead` | executor's last probe before the stall | the misleading comment is present verbatim ("is UNCHANGED and still correct... LibrarySearchBar's shared consumption"); the record correction has not been made | **LIVE** |
| 20 | `2026-09-01-non-english-catalogs-are-unrebranded-2117-heroic-strings` | `grep -rho "Heroic" public/locales/*/translation.json \| wc -l` | `1969` | **LIVE — headline count is stale.** The todo says 2117; HEAD is 1969. The defect is live but its magnitude has drifted, so the number must not be quoted from the title. |
| 21 | `2026-09-01-webview-amazonlogindata-is-permanently-null` | `grep -rn "amazonLoginData" src \| wc -l` | `4` | **LIVE** — anchor still present |
| 25 | `2026-09-03-nav-tour-shows-stale-heroic-branding-in-28-locales` | `grep -rl "Heroic" public/locales/*/tour.json` | no `tour.json` exists; the tour strings are in `translation.json`, inside todo 20's 1969 | **LIVE — overlaps todo 20.** These two are not independent; fixing 20 wholesale would absorb 25. Whoever takes either should take both. |
| 18 | `2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41` | `npx jest --runTestsByPath .../decompressPool.test.ts` | `Tests: 41 passed, 41 total` | **LIVE — see below. NOT discharged.** |

#### Row 18 is the sweep's one real finding, and it is the opposite of a discharge

The todo records `Tests: 3 failed, 38 passed` on 2026-08-31, and states the isolated single-suite
run reproduced all three identically — i.e. deterministic, explicitly ruled out as a load artifact.
All three named tests now pass, and the suite is 41/41.

Nothing that could explain it has changed:

```
$ git log --oneline --since=2026-08-30 -- src/backend/storeManagers/steam/lzmaLoader.ts
(no output)
$ git log --oneline --since=2026-08-30 -- src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
(no output)
$ node -v
v26.2.0                          # same version the todo recorded
$ stat -f "%Sm" node_modules/lzma-native
Aug 23 20:47:49 2026             # predates the 2026-08-31 todo
$ git diff --quiet HEAD -- .../decompressPool.test.ts && echo CLEAN
CLEAN
```

Same loader, same test file, same Node, same native module — and a deterministic 3-test failure
became a pass. **The todo's own central question ("the native module is loadable outside jest and
resolves to `pure-js` inside it") is still unanswered.** The green result is now the thing that
needs explaining.

The todo anticipated exactly this trap in its own words: *"Do not assume the kill switch is simply
'working as intended' — if that were so, these three tests would have been deleted or skipped, not
left asserting `native`."* They still assert `native`, and they now pass, with no code change.

**Verdict: LIVE, and upgraded in interest.** Closing this on a green suite would have been the
`flake-baselines-can-be-undiagnosed-bugs` failure mode, with the flake on the passing side. The
non-reproduction is recorded on the todo itself; the todo stays in `pending/`.

### BY CONSTRUCTION — 14 rows, no code probe run

Each of these has a discharge condition no commit can satisfy silently. Verdict **LIVE** for all.

| # | Todo | Why code drift cannot have discharged it |
|---|---|---|
| 1 | `2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined` | Its own title records the outcome as undetermined; needs an investigation, not a commit |
| 2 | `2026-08-23-humble-integrated-activation-reconcile-key-state` | Unbuilt feature work |
| 3 | `2026-08-23-keyring-get-bounded-timeout-unverified-live` | Discharge is a live measurement |
| 6 | `2026-08-24-importgame-wineprefix-wineversion-not-contained` | Open design question (what containment root is correct for a Wine prefix) |
| 9 | `2026-08-25-getanticheatinfo-sidecar-frame-drops` | Under active investigation in a concurrent session (`.planning/debug/anticheat-response-frame-drop.md`) — deliberately not touched |
| 10 | `2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window` | Solution explicitly TBD; three options, none chosen |
| 11 | `2026-08-26-winetricks-package-selection-is-temperamental` | Needs a hover/search gesture on hardware |
| 12 | `2026-08-27-answer-q2-cheapshark-to-isthereanydeal-migration` | An open research question |
| 22 | `2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued` | Recorded as unreproducible |
| 24 | `2026-09-03-all-10032-non-english-fork-strings-are-unreviewed` | A standing review requirement, not a defect with a fix commit |
| 26 | `2026-09-04-adtraction-ad-block-detection-has-no-derivable-signal` | "No derivable signal" is a design finding awaiting a decision |
| 27 | `2026-09-04-macos-releases-ship-unsigned-and-unnotarized` | Blocked on Apple credentials |
| 28 | `2026-09-05-confirm-the-gap-d-nav-drain-on-store-gog` | Frontmatter says `needs: one-manual-gesture-on-macos` |
| 29 | `2026-09-05-store-epic-blocked-by-cloudflare-turnstile` | Frontmatter says `needs: spike-then-decision-then-code` |

### UNDETERMINED — 8 rows

A one-command screen was run and was **not** decisive. Recording the screen output would invite a
verdict it does not support, so these are left explicitly unresolved. Each needs a full read against
its own residue clauses.

| # | Todo | Screen run | Why it is not decisive |
|---|---|---|---|
| 4 | `2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog` | `grep -c showDialogBoxModalAuto .../eos_overlay.ts` → `1` | One call site exists, but the todo is about the *remove* path specifically and about a 25-consumer dead-CSS claim. Presence ≠ the right path styled. |
| 5 | `2026-08-24-importgame-does-not-validate-the-folder-matches-the-game` | `grep -c assertPlausibleAbsolutePath .../installFlowRegistration.ts` → `8` | Shape validation exists; the todo asks for *identity* validation (does the folder match the selected game). Different question. |
| 7 | `2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op` | `grep -c winetricksInstall .../wineToolsFlowRegistration.ts` → `11` | The todo's claim is about a `send`-kind channel dispatching to nothing at runtime. A registration count cannot refute it. |
| 8 | `2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux` | `grep -rl callOrDeclare src/frontend \| wc -l` → `12` | The helper is used in 12 files; whether *this* call site bypasses it is unanswered. The todo also names a Linux-only path. |
| 14 | `2026-08-27-stall-watchdog-leaves-the-download-running` | `grep -rn "stallWatchdog\|StallWatchdog" src/backend` → `0` | Zero hits means the identifier is named differently, not that the watchdog is absent. A false discharge risk. |
| 15 | `2026-08-27-steam-depot-install-fails-with-unclassified-generic-error` | `grep -rn "classifyDepotError" src/backend \| wc -l` → `58` | Classification machinery exists; whether *this* failure is still unclassified needs the original repro. |
| 19 | `2026-09-01-helper-processes-orphan-on-app-quit` | `grep -c "RunEvent::Exit\|ExitRequested" src-tauri/src/main.rs` → `5` | Exit handling exists; whether helpers are reaped by it is a different claim, and the todo is about the absent `before-quit` equivalent. |
| 23 | `2026-09-02-gog-and-amazon-logout-never-clear-the-shared-cookie-jar` | `grep -rn "clearCookies\|clearAllCookies" src/backend \| wc -l` → `128` | 128 hits across the backend say nothing about whether the *GOG and Amazon logout paths* clear the *shared* jar. |

### Sweep adjudication

**Discharge candidates found: 0.** The one candidate the screen surfaced (row 18) was disqualified
on inspection — see above. The plan's cap of 3 auto-adjudications was therefore never approached,
and no todo is moved by this section.

### Row 16 — added after a self-check of this section's own coverage

The first pass of Section 5 tabulated 28 rows against 29 unaudited todos.
`2026-08-29-import-game-is-unlabelled-and-over-promoted` was dropped. Caught by counting the
sections back against the input list rather than trusting the tables — the
`audit-uat-drops-id-and-emits-by-position` shape, reproduced here in a hand-written table.

| # | Todo | Command | Result | Verdict |
|---|---|---|---|---|
| 16 | `2026-08-29-import-game-is-unlabelled-and-over-promoted` | `grep -n "button.import" .../MainButton.tsx` and a `gamepage.button.import` lookup in `en/translation.json` | label still renders `Import Game`; the catalog key is **absent**, so the string comes from the inline `t()` default at `MainButton.tsx:413` | **LIVE (PROBED for item 1; items 2-3 BY CONSTRUCTION)** |

Two notes for whoever takes it:

- **Line drift.** The todo cites `MainButton.tsx:301` and `:399`; the live call site is `:413`.
- **The rename is not a catalog edit.** `gamepage.button.import` does not exist in
  `en/translation.json` — the visible string is the inline default. Editing the catalog alone would
  change nothing. Its items 2 and 3 (demote the control; decide whether the feature earns its keep)
  are product decisions no commit can discharge silently.

### Section 5 final tally — 29 rows

| Class | Count |
|---|---|
| PROBED → LIVE | 7 (rows 13, 16, 17, 18, 20, 21, 25) |
| BY CONSTRUCTION → LIVE (no probe run) | 14 |
| UNDETERMINED (screen not decisive) | 8 |
| Discharged / moved by this section | **0** |
