---
phase: quick-260929-tmw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/notice_copy_probe.py
  - .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/ledger_inplace_check.cjs
  - .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
  - .planning/todos/pending/ (FAIL or unscored-anomaly branch only, at most one new todo per branch)
autonomous: false
requirements:
  - QUICK-260929-TMW
estimate:
  tokens: 190000
  raw_tokens: 190000
  tasks: 4
  confidence: low
must_haves:
  truths:
    - "`38-S16`'s LINUX/ROW-7 HALF was observed LIVE on this Linux host (Pop!_OS 22.04, X11, DISPLAY :1) against a dev build whose identity is PROVEN: the GameLib window's `_NET_WM_PID` resolves through `/proc/<pid>/exe` to `src-tauri/target/debug/gamelib-shell`, and `git status --porcelain -- src src-tauri package.json` was empty at launch."
    - "Both copy sub-branches of row 7 were armed and proven INDEPENDENTLY of the dialog, immediately before each scored open. OFF: `defaultSettings.enableSteamNativeInstall` reads `false`. ON-with-one-library: it reads `true` after the Settings-UI toggle, AND `steam_library_replica.cjs` prints `BRANCH: PARSED` and `COUNT=1` with `~/.steam/debian-installation` as its only EXISTS path, AND `findmnt -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309` shows that filesystem mounted nowhere."
    - "Each COPY verdict comes from a mechanical, codepoint-exact comparison of the AT-SPI-read notice string against `public/locales/en/gamelib.json`, never from a screenshot. The same read shows the OTHER key's string does NOT match, and a dialog-closed negative control preceded every open, so the instrument is proven to tell the two copies apart live."
    - "Each CONTAINER verdict names its basis: DOM-READ (the Web Inspector shows the notice text inside `div.infoBox`), or STRUCTURAL (source uniqueness at the proven build, plus text-tree and visual exclusion of ThirdPartyDialog's `.thirdPartyNotice`/`.noticeIcon`/`.noticeInfo`). No verdict is inferred from another."
    - "`38-S16` STAYS in `human_verification` whatever the outcome. The ledger gains exactly ONE new dated key on that entry, directly after `id`, and nothing else in the frontmatter changes (`ledger_inplace_check.cjs` against `PRE_SHA`). The open, discharged and retired counts, the open ids and audit-uat `by_phase['38']` are all FLAT."
    - "`enableSteamNativeInstall` ends the task at its recorded ORIGINAL value, proven by a `config.json` read after the UI restore. No process this task started survives it. No install was dispatched. No committed evidence carries a Steam account identifier."
    - "`/mnt/PopGames` is mounted again AT `/mnt/PopGames`, not at the udisks default `/media/graysonmitchell/7ca4a725-1bb4-4e38-8f76-bad1fc803309`, which `libraryfolders.vdf` ALSO registers as a library path. The replica again reports `COUNT=2` with the exact EXISTS set sitting 8 recorded. If the operator could not or would not authenticate the mount, the FIRST line of the SUMMARY and of the return message says the drive was left unmounted."
  artifacts:
    - ".planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/notice_copy_probe.py: read-only AT-SPI exact-copy instrument with subcommands `selftest`, `copy`, `locate`, `inspector`. `selftest` needs no app and proves the comparison logic against the live catalogue."
    - ".planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/ledger_inplace_check.cjs: read-only proof that the ledger edit added exactly one key to the open `38-S16` entry and changed nothing else, versus `PRE_SHA`."
    - ".planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/: baseline.env, mount-state.txt, geometry.txt, container-source-census.txt, tracer-copy.txt, library-replica.txt, notice-copy.txt, atspi-dialog-subtree.txt, region-checks.txt, burst-summary.txt, log-excerpt.txt, remount.txt, plus the cropped PNGs"
    - "38-VERIFICATION.md: one new dated key on the OPEN `38-S16` entry; nothing moved, no count changed"
    - "38-HUMAN-UAT.md: a `sessions:` entry, `updated:`, one `## Current Test` sentence and a `## Sitting 9` section"
    - "34.13-UAT.md: the `38-S16` receipt's `outcome:` and its `G-D20-Q6-COPY | tauri` body row (PASS, FAIL or PARTIAL only)"
  key_links:
    - "`SteamDialog/index.tsx:530-549`: `gating.contentLightNotice` renders ONE `div.infoBox` (`:531`) holding a `faWarning` icon and a copy selected by `nativeInstallOn` (`:539`): ON gives `gamelib:steam.install.contentLightSingleLibraryNotice` (`:541`), OFF gives `gamelib:steam.install.contentLightNotice` (`:545`). The `t()` defaults at `:542`/`:546` are byte-identical to the catalogue at planning time."
    - "`InstallModal/index.tsx:423`: `steamNativeInstallOn = steamLibraryList.length > 0`, passed to the dialog at `:659` and to the resolver at `:450-451`. With native ON and ONE library, `hasChoice` is false (`steamSectionGating.ts:199`), `libraryDropdown` is false (`:279`), and `contentLightNotice = !isMac && !libraryDropdown` is true (`:293`). KNOWN RESIDUAL (`steamEligibilityProbe.ts:267-273`): native ON with ZERO libraries is indistinguishable from OFF, which is why COUNT must be exactly 1, not 0."
    - "`applyLibraryFetchPending` (`steamEligibilityProbe.ts:276-284`) suppresses the notice while the library IPC is pending, so the notice is an EXPECTED LATE MOUNT. The IPC is gated server-side: `installFlowRegistration.ts:268` returns `listSteamLibraryTargets()` (`installLocation.ts:84-91`, which calls `getSteamLibraries()` at `utils.ts:671-692` on EVERY call) only when `isSteamNativeInstallEnabled()` (`nativeInstallSetting.ts:14-16`, a live GlobalConfig read) holds; otherwise it returns `[]`."
    - "`InstallModal/index.tsx:646` (`isSteamManagedApp && gameInfo`, SteamDialog) and `:710` (`isThirdPartyManagedApp`, ThirdPartyDialog) are exclusive arms of ONE ternary. `.noticeIcon`/`.noticeInfo` exist ONLY in `ThirdPartyDialog/index.tsx:110-114` and its `index.css`, inside `.thirdPartyNotice` (a 2px bordered box with a checkmark icon and an `h4` header, `gamepage.json` `third-party-managed.header`)."
    - "`/dev/nvme0n1p3` (UUID `7ca4a725-1bb4-4e38-8f76-bad1fc803309`) -> fstab `/mnt/PopGames` -> vdf candidate `/mnt/PopGames/SteamLibrary`. The SAME drive is also registered in the vdf as `/media/graysonmitchell/7ca4a725-1bb4-4e38-8f76-bad1fc803309/SteamLibrary`, the udisks default mountpoint. A remount there gives COUNT=2 with the WRONG path set."
    - "`38-VERIFICATION.md` frontmatter -> strict YAML -> gsd-core `audit-uat`. One unescaped quote drops Phase 38 from the audit silently. `ledger-check.cjs`, `ledger_inplace_check.cjs` and `pnpm planning-gates` are the checks."
---

<objective>
Run the LINUX HALF ONLY of Phase 38 item `38-S16` LIVE on this Linux machine as Sitting 9, and record
the true result IN PLACE. Do NOT discharge the item.

The item, from `38-VERIFICATION.md` (lines 48-58 at planning time). Re-read the live entry with
`grep -n 'id: "38-S16"'` before relying on anything quoted here:
- test: "Content-light notice COPY and container, tauri runtime — scored per branch, on BOTH matrix
  row 5 (Windows) and row 7 (Linux)."
- expected: "The notice renders in an `.infoBox`, NOT in ThirdPartyDialog's
  `.noticeIcon`/`.noticeInfo`. Copy must match the catalogue EXACTLY, per branch: native installs
  OFF -> gamelib:steam.install.contentLightNotice; native installs ON with <=1 library ->
  gamelib:steam.install.contentLightSingleLibraryNotice. Verify against
  public/locales/en/gamelib.json, never by eye."
- why_human: "Requires BOTH a Windows and a Linux host, since the row is scored on matrix rows 5
  and 7."
- `prior_state` ends: "A single-branch run does not discharge this item."
- The existing `sitting_1_2026_09_23` field records the Windows/row-5 half as NOT SCORED.
- `blocked_by`, `platform_gate` (`steamSectionGating.ts:182-207`), `origin_phase`, `origin_item`
  (`G-D20-Q6-COPY / tauri`) and `pair_note` are unchanged by this task.

THIS SITTING DOES NOT DISCHARGE `38-S16`, WHATEVER IT OBSERVES. The item is scored on BOTH matrix row
5 (Windows) and row 7 (Linux). Its own `prior_state` says a single-branch run does not discharge it,
and the Windows/row-5 half is still NOT SCORED. This sitting runs only the Linux half. Therefore:
- On PASS, FAIL, PARTIAL and NOT SCORED alike, the ledger edit is an IN-PLACE ANNOTATION: ONE new
  dated key (`SKEY`, for example `sitting_9_2026_09_29`) inserted directly after `id:` on the
  existing OPEN entry.
- The entry is NOT moved to `human_verification_discharged`. No count changes, `score:` is not
  edited, and ROADMAP.md is not edited.
- This is exactly the precedent `38-S14` set in sitting 5: sub-case (a) PASS, and the item stayed
  open because its `test:` needs the other sub-case. A half-run item moved to
  `human_verification_discharged` would be invisible to `audit-uat` forever.
- `ledger_inplace_check.cjs` and flat ledger counts enforce this mechanically. The verify fails on
  a discharge.

THE LINUX HALF HAS TWO COPY SUB-BRANCHES, AND THIS SITTING SCORES BOTH. Matrix row 7 is "native
installs OFF, or ON with <=1 library". That is `38-S10`'s own `test:`, discharged in sitting 7.
`38-S16`'s `expected:` assigns a different catalogue key to each arm.
- OFF (at any library count) must render `contentLightNotice`. Sitting 7 SAW that string, through
  AT-SPI, while scoring `38-S10`. It was never scored for THIS item: no catalogue-exact comparison
  and no container read were made against `38-S16`.
- ON with exactly one library must render `contentLightSingleLibraryNotice`. No sitting has ever
  produced this state on Linux. Today it is reachable because the drive is unmounted.
- The OFF sub-branch runs FIRST, at the operator's steady-state setting, with no toggle and no
  added hazard. It doubles as the LIVE DISCRIMINATION CONTROL: the same instrument must read two
  different strings under two proven arming states. A copy instrument that only ever returned one
  string would prove nothing.
- If the orchestrator wants the ON sub-branch only, drop step SB for `off` in Task 3. F1 and F2 then
  record NOT SCORED with the reason "descoped", and the RESULT word becomes PARTIAL at best.

THE FOUR SCORED FACTS. Each has its own verdict line and its own evidence:
- F1 `off-copy`: with native OFF, the rendered notice string EXACTLY equals the catalogue value of
  `steam.install.contentLightNotice`, and does NOT equal `contentLightSingleLibraryNotice`.
- F2 `off-container`: that notice renders in `div.infoBox`, not ThirdPartyDialog's
  `.noticeIcon`/`.noticeInfo`.
- F3 `on-copy`: with native ON and ONE library, the rendered notice string EXACTLY equals
  `steam.install.contentLightSingleLibraryNotice`, does NOT equal `contentLightNotice`, and no frame
  of the open burst shows the other copy.
- F4 `on-container`: that notice renders in `div.infoBox`, not ThirdPartyDialog's
  `.noticeIcon`/`.noticeInfo`.

THE CATALOGUE, measured at planning time with a Python json read of `public/locales/en/gamelib.json`.
Re-measure at execution: the live file is the source of truth, and a drifted value replaces this one.
- `steam.install.contentLightSingleLibraryNotice` (call it S): 122 characters. "There's only one
  Steam library on this system, so there's nothing to choose here — GameLib will install this game
  into it." It has straight apostrophes (U+0027) at indexes 5 and 55 and an EM DASH (U+2014) at
  index 81. It contains no U+FFFC and no newline.
- `steam.install.contentLightNotice` (call it O): 185 characters. "This installs through Steam's own
  client, so there's nothing to choose here. Turn on native Steam installs in Settings to manage
  install location and Windows compatibility from GameLib." It has U+0027 at indexes 27 and 50.
- Search discriminators, case-insensitive. They are the shared probe's own `SIGNATURES`:
  `only one steam library on this system` for S, and `turn on native steam installs in settings`
  for O.
- The `t()` defaults at `SteamDialog/index.tsx:542` and `:546` were byte-identical to S and O at
  planning time. So an exact match proves WHICH KEY rendered and that it equals the catalogue value.
  It cannot prove whether i18next served the value from the catalogue or from the default. Record
  that as an honest limit.
- A rendered string that is not English makes the copy fact NOT SCORED, because the item names the
  `en` catalogue.

"NEVER BY EYE" IS WHY THE TEXT INSTRUMENT IS MANDATORY. The copy verdicts come ONLY from
`notice_copy_probe.py copy`, which reads the notice string out of the AT-SPI tree and compares it
codepoint by codepoint with the catalogue.
- Sitting 7 proved that WebKitGTK exposes this exact string. `38-S10`'s committed
  `atspi-dialog-subtree.txt` shows a `page`-role node whose text is ONE U+FFFC (the inline icon's
  embedded-object placeholder) followed by `contentLightNotice` verbatim.
- The ONLY normalisation allowed:
  - split the node text on U+FFFC;
  - take the segment containing the discriminator;
  - strip its leading and trailing whitespace.
- One declared tolerance: a segment that differs from the catalogue ONLY by a newline where the
  catalogue has a space is a soft-wrap instrument artifact. Record it as `NEWLINE_ONLY`. Any other
  difference (a curly apostrophe, a hyphen for the em dash, a non-breaking space, one missing
  character) is a MISMATCH.
- Sitting 8 showed WebKitGTK can flatten a whole dialog's text into one out-of-dialog `page` node.
  So the probe searches the WHOLE app tree, scores the DEEPEST node carrying the discriminator, and
  records `in_dialog` for every hit.
- If the text instrument is unavailable or INVALID, F1 and F3 are NOT SCORED. The visual
  instrument cannot deliver an exact comparison.

THE CONTAINER EVIDENCE, IN TIERS. Record the basis on every container verdict.
- Source, static, at the proven build (`evidence/container-source-census.txt`, Task 1). Each
  catalogue key has exactly ONE non-test render site: `SteamDialog/index.tsx:541` and `:545`. Both
  sit inside the single `div.infoBox` opened at `:531`. ThirdPartyDialog references neither key.
  `.noticeIcon`/`.noticeInfo` appear ONLY in `ThirdPartyDialog/index.tsx` and its CSS. The two
  dialogs are exclusive arms of one ternary (`InstallModal/index.tsx:646` and `:710`).
- Text tree, live:
  - no `heading`-role node inside the dialog subtree;
  - no node carries the ThirdPartyDialog header string (`gamepage.json` `third-party-managed.header`,
    "This game is managed by a third-party application" at planning time);
  - the notice segment is preceded by exactly ONE U+FFFC. That is the `.infoBox` shape: an icon
    and a text run as siblings. ThirdPartyDialog would instead expose a heading plus a paragraph.
- Visual, live: the notice sits in a filled, rounded box (`.infoBox`, `InfoBox/index.css:1-10`),
  with the warning-triangle icon inline at its start. There is NO 2px bordered box, NO rounded
  checkmark icon and NO bold header line (`.thirdPartyNotice`, `ThirdPartyDialog/index.css`).
- DOM, live, preferred: WebKit's Web Inspector, reached by clicks only. Right-click the notice text,
  choose "Inspect Element", read the selected node and its ancestor path, and close the inspector
  with its own close button.
  - The debug build force-opens devtools for the main webview (`src-tauri/src/main.rs:11537-11543`),
    so the inspector exists in this build.
  - Whether WebKitGTK's context menu offers "Inspect Element" here is UNMEASURED, so Task 1 probes
    the route on the Settings page, with native OFF, before anything is armed.
  - AT-SPI cannot be relied on for the class name. WebKitGTK may flatten a plain `div` into an
    ancestor node, so the node that carries the text is not necessarily the `.infoBox` itself.
- Verdict bases:
  - A container PASS with basis DOM-READ needs the DOM read AND the structural checks.
  - A container PASS with basis STRUCTURAL is allowed when the DOM route is unavailable or fails
    for a recorded reason. The annotation must then say, in words, that the class was NOT read from
    the live DOM.

ARMING. Each sub-branch is proven independently of the dialog, immediately before its scored open.
- OFF: `defaultSettings.enableSteamNativeInstall` reads `false` (or is absent; `false` is the runtime
  default at `nativeInstallSetting.ts:15`). Any library count is row 7.
- ON with one library. ALL of the following must hold at the scored moment:
  - the key reads `true` after the Settings-UI toggle;
  - `steam_library_replica.cjs` (sitting 8's line-for-line replica of `getSteamLibraries()`, reused
    AS-IS by path) prints `BRANCH: PARSED`, `COUNT=1`, and exactly one EXISTS line:
    `/home/graysonmitchell/.steam/debian-installation`;
  - `findmnt -n -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309` prints nothing.
  COUNT=0, or the replica's unfiltered early return (the `/usr/share/steam` sentinel alone), is NOT
  this arm. It is the synthetic state that `38-S14`'s sitting-1 note rejected, and the KNOWN
  RESIDUAL where native ON cannot be told from OFF. Either makes the ON sub-branch NOT SCORED.
- The sidecar reads the setting live on every call, and `getSteamLibraries()` runs on every dialog
  open. No relaunch is needed after the toggle.
- Corroboration, not scored:
  - neither the library dropdown ("Choose Steam library") nor a combo box renders in either
    sub-branch;
  - neither copy renders in the sub-branch it does not belong to.
  A dropdown in the ON sub-branch means the IPC saw more than one library. That is ARMING
  CONTRADICTED, and the ON sub-branch is NOT SCORED.

MOUNT STATE AND THE REMOUNT. These facts were measured at planning time and are central to Task 4.
- Before spawning this planner, the quick orchestrator ran `udisksctl unmount -b /dev/nvme0n1p3`.
  The system journal shows the operator AUTHENTICATED for it: at 21:19:56, a polkit line granted
  TEMPORARY authorization for `org.freedesktop.udisks2.filesystem-unmount-others`.
- `pkaction --verbose` reports `implicit active: auth_admin_keep` for
  `org.freedesktop.udisks2.filesystem-fstab`, `filesystem-mount-system` and
  `filesystem-unmount-others`. The remount therefore needs the OPERATOR to authenticate as well.
  Claude cannot supply credentials and must not try.
- The remount is therefore a PLANNED `checkpoint:human-action`: Task 4, after all scoring and
  records.
  - Claude first tries `udisksctl mount -b /dev/nvme0n1p3 --no-user-interaction`, which fails fast
    instead of raising an authentication dialog on Claude's behalf.
  - When it is refused, the operator runs the mount and authenticates.
  - Claude verifies the result.
- The device: `/dev/nvme0n1p3`, ext4, UUID `7ca4a725-1bb4-4e38-8f76-bad1fc803309`
  (`/dev/disk/by-id/nvme-Samsung_SSD_990_PRO_2TB_S7HENU1Y595738L-part3`), with no mountpoint.
- fstab: `/dev/disk/by-uuid/7ca4a725-1bb4-4e38-8f76-bad1fc803309 /mnt/PopGames auto
  nosuid,nodev,nofail,x-gvfs-show,x-gvfs-name=LinuxGames 0 0`. `udisksctl mount` and the Files
  sidebar entry "LinuxGames" both honour this entry.
- THE TRAP: the vdf registers this SAME drive twice. It appears as `/mnt/PopGames/SteamLibrary`
  (candidate 4) AND as `/media/graysonmitchell/7ca4a725-1bb4-4e38-8f76-bad1fc803309/SteamLibrary`
  (candidate 3), which is the udisks default mountpoint for a device WITHOUT an fstab entry. A
  remount that lands at `/media/...` reads `COUNT=2` and looks restored, but with the wrong path
  set. Task 4 therefore checks the `findmnt` TARGET, and diffs the replica's EXISTS set against
  sitting 8's committed pre-unmount output. It never trusts the count alone.

DECLARED REAL-PROFILE ARM (CLAUDE.md two-profile rule, half 2). This sitting runs under the
operator's REAL `HOME`, on purpose. The justification is stated for THIS item:
- The ON sub-branch's library conjunct IS the operator's real Steam state. The replica and the app
  both read the real `libraryfolders.vdf` through the real `defaultSteamPath` (`~/.steam/steam`)
  and the real mount state. A fake HOME has no `config.json` and no `~/.steam`, so
  `getSteamLibraries()` would take its unfiltered early return. That is the synthetic single
  library `38-S14` rejected, not a real one-library state.
- The native conjunct lives in the real `config.json`. This sitting CHANGES it, and restores it.
- The item needs an owned, not-installed Steam game in a signed-in Library. That session lives in
  the real `~/.config/GameLib/` (left in place since sitting 6) and the dev vault
  `/tmp/gamelib-dev-secret-vault.json`.
- Sitting 6's justification (the `shell.openExternal` hand-off through `xdg-open`) does NOT carry
  over. This item never clicks Install. Say so in the record.
- Isolation still applies to every capture. Raw bursts, whole-window AT-SPI dumps, Settings grabs,
  full inspector grabs and the `tauri:dev` transcript go to the session scratchpad and are deleted
  at cleanup. Only vetted, cropped evidence is committed.

NATIVE-ON HAZARD. While native installs are ON, the PRIMARY half of any Install button starts a real
GameLib depot download into a real library: the default library, `~/.steam/debian-installation`, on
`/`. The game page's Install button also carries `autoFocus` (`MainButton.tsx:331`), so Enter or
Space on the page would press it. Therefore:
- the setting is ON only between Task 3 step D and step E;
- while it is ON, the executor sends NO keyboard input to any GameLib or inspector surface. It
  clicks only:
  - the Settings route and toggle;
  - the caret and the "Install with options…" menu item;
  - a right-click on the notice TEXT;
  - the "Inspect Element" menu item;
  - the inspector's close button;
  - the dialog's header X;
- Task 3 carries an ACCIDENTAL DOWNLOAD RULE.
- Install is never clicked, native ON or OFF: with native OFF the primary half would hand off to the
  Steam client.

LOCK RULE (measured in sitting 7; the operator unlocked for sitting 8). The GNOME session auto-locks
on idle. A lock curtain produces a non-blank, static grab that passes `selftest`.
- Before every capture step, check `loginctl show-session <LOCK_SESSION> -p LockedHint --value` and
  require `no`. If it reads `yes`, raise a human-action checkpoint for an unlock, then confirm `no`
  independently before clicking anything.
- Task 1 starts an idle inhibitor (`gnome-session-inhibit --inhibit idle`) and records the PID of
  the REAL inhibitor process, not of a shell wrapper. In sitting 8 a kill aimed at the wrapper
  silently did nothing.
- Read every Task 3 `read_first` range BEFORE Task 1's launch. Sitting 7 auto-locked during exactly
  that reading gap.

CAPTURE-GEOMETRY RULE (sitting 8's disclosed deviation). In sitting 8, `linux_sitting_capture.py`'s
`find_window()` took its origin from `xdotool getwindowgeometry --shell`, which reported a stable
but WRONG client origin, off by (+10,+45). `xwininfo -id`'s absolute origin and an AT-SPI-derived
click both proved it wrong. The root cause is unidentified; a screen lock/unlock cycle is suspected.
- Do NOT assume the bug recurs, and do NOT assume it does not.
- Task 1 cross-checks the two origins live and chooses the capture tool:
  - if they agree, use `linux_sitting_capture.py` as-is (`CAPTURE_TOOL=base`);
  - if they differ, use sitting 8's `capture_region_fix.py` as-is, by path, for
    `find`/`grab`/`burst` (`CAPTURE_TOOL=fix`), and keep using the base tool's `diff`, which only
    reads saved PNGs.
- Re-run the cross-check after any lock/unlock cycle, and immediately before each scored burst.
- Derive click points from AT-SPI screen extents (`notice_copy_probe.py locate`) whenever a
  grab-estimated coordinate is ambiguous. Sitting 8's first menu click missed on a
  screenshot-estimated coordinate.

Facts measured at planning time (2026-09-29, HEAD `55aa0d54b`). EVERY ONE IS MUTABLE. Re-measure at
execution and record the executed value.
- Nothing under `src`, `src-tauri`, `package.json` or `public/locales/en/gamelib.json` changed since
  `4a99e1d6b`, sitting 8's build. Every sitting-8 code anchor still holds.
- Ledger: 7 open / 19 discharged / 10 retired. The open ids, in array order:
  `38-W04,38-W05,38-S14,38-S16,38-E01,38-E03,38-E04`. audit-uat: `by_phase['38'] == 7`,
  `total_items == 426`, `parse_gap_files == 0`.
- Census: 80 ok, 2 no-frontmatter, 3 bad. `34.13-UAT.md` still fails at its pinned `(62:176)`.
- Replica: `BRANCH: PARSED`, then
  - 0 `/usr/share/steam` MISSING;
  - 1 `/home/graysonmitchell/.steam/debian-installation` EXISTS;
  - 2 `/media/graysonmitchell/Games/SteamLibrary` MISSING;
  - 3 `/media/graysonmitchell/7ca4a725-1bb4-4e38-8f76-bad1fc803309/SteamLibrary` MISSING;
  - 4 `/mnt/PopGames/SteamLibrary` MISSING;
  - `PROBE .../debian-installation/steamapps access=ok primary=true`, `FLATPAK_ID=unset`, `COUNT=1`.
- Mount: `findmnt` shows the drive mounted nowhere, and `/mnt/PopGames` is an empty, root-owned
  directory. `udisksctl` supports `--no-user-interaction`.
- Native setting: `false`, key present.
- Processes: no `gamelib-shell`, sidecar or `tauri dev`; :5173 free. The Steam client was running
  (`pgrep -x steam` gave 34061). This item does not need it, and it is never stopped.
- Session: loginctl session `2` (seat0, x11) had `LockedHint=no` and `IdleHint=no`.
- Log sink: `~/.local/state/GameLib/logs/gamelib.log`. `logInfo` lines never reach the terminal.
- Deep-link trap: `gamelib://` has no handler here, and `heroic://` belongs to the stale Electron deb
  at `/opt/GameLib`. Navigate by clicking the UI only.
- Process hygiene (sitting 6): the sidecar (`build/main/sidecar.js`) runs in its OWN process group,
  not the `setsid` group. The docked devtools panel appears at launch, and only its own close
  button closes it.
- 7 Days to Die (251570): sitting 8 confirmed, the same day, that it was not installed in EITHER
  library. While `/mnt/PopGames` is unmounted its `steamapps` there cannot be re-checked. Record
  that as a limit; it does not bear on the copy or container facts.

OUT OF SCOPE (do not score and do not record against):
- `38-S16`'s Windows/row-5 half, `38-S14`, and every other item.
- Discharging `38-S16`, editing `score:`, or editing ROADMAP.md.
- Clicking Install anywhere, or selecting a library.
- Editing `libraryfolders.vdf`; mounting or unmounting anything as Claude beyond the single
  non-interactive `--no-user-interaction` attempt in Task 4; running `sudo`.
- Any fix to what is observed. There are no edits under `src/` or `src-tauri/`.
- Editing a DOM node, attribute or style through the Web Inspector, or typing into its console.
Do not edit `.planning/STATE.md`: the quick orchestrator records the task.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

These are large files. Read ONLY the ranges named in each task's read_first. `38-VERIFICATION.md`,
`38-HUMAN-UAT.md` and `34.13-UAT.md` are not @-included, on purpose.

Precedents to mirror in shape, adapting the content:
- `.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/260929-hgm-PLAN.md` and its
  SUMMARY: the launch, identity proof, two-instrument scoring, native toggle round trip, cleanup and
  records discipline, the capture-offset deviation and the inhibitor-PID lesson.
- `38-S14`'s `sitting_5_2026_09_26` field in `38-VERIFICATION.md`: THE keep-open shape. It is a
  dated key inserted directly after `id:`, above the older `sitting_1_...` key, and it states
  plainly that the item stays open and why.
- `34.13-UAT.md`'s `38-S14` receipt `outcome:` ("PARTIAL 2026-09-26 by quick 260926-a1l ... ITEM
  STILL OPEN ... Do not read this as a discharge."), and its body row
  `| G-D20-CONTENTLIGHT | tauri | RELOCATED → **sub-case (a) PASS in Phase 38 (2026-09-26); item
  still OPEN** |`: the half-scored walk-back shape.
- `38-HUMAN-UAT.md`'s `## Sitting 8` section: the narrative and region-table shape.
- `38-S10`'s discharged entry: how sitting 7 described the notice it saw.

YAML-writing rules for every value this task adds (from quick 260928-raq):
- The new `38-VERIFICATION.md` key uses a double-quoted scalar, matching its neighbour
  `sitting_1_2026_09_23`. Write NO inner double quote and NO backslash. Apostrophes and the em dash
  are fine inside a double-quoted scalar.
- The `34.13-UAT.md` receipt value is double-quoted and matches the `38-S14` receipt: no inner double
  quote, no backslash, no apostrophe.
- Run `ledger-check.cjs` and `ledger_inplace_check.cjs` after every edit to `38-VERIFICATION.md`.
- Write the container in CSS-selector notation (`div.infoBox`), never as HTML tag syntax, in every
  file this task writes. The one exception is `container-source-census.txt`, which quotes
  `SteamDialog/index.tsx:530-532` verbatim; stop that quote before the element's closing line.

Reusable harnesses, used AS-IS by path. Do not copy or modify any of them:
- `.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs` (lines 1-66
  document the flags).
- `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py`
  (VISUAL): `find`, `selftest`, `grab`, `clients`, `burst`, `diff`.
- `.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/capture_region_fix.py`:
  `find`/`grab`/`burst` with the `xwininfo`-sourced origin. Use it only when Task 1's cross-check
  finds an offset.
- `.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py` (TEXT
  TREE): `dump`, `regions`, `smoke`. Its `SIGNATURES` already carries `content_light_off` and
  `content_light_single`.
- `.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/steam_library_replica.cjs`:
  the arming instrument. Its header names `38-S12`, which is its origin, not a limit on reuse.

New, in this quick task's own directory (the same pattern sitting 8 used for
`capture_region_fix.py`): `notice_copy_probe.py` (Task 1) and `ledger_inplace_check.cjs`
(Task 3).

Tooling quirk, now reproduced in sittings 6 AND 8: a long inline `&&` verify chain returned a bare
"Exit code 1" with no output through the Bash tool, although every step passed standalone. Copy each
verify block into a script in the session scratchpad and run it with `bash`. A foreground `sleep`
may be blocked, so poll with Monitor or an until-loop.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer. Re-measure the live baseline, the mount state and the arming, write and self-test the exact-copy probe, launch the HEAD dev build under the declared real-profile arm, prove identity, pick the capture tool by a live geometry cross-check, and prove every instrument end to end (visual, text tree, live exact-copy compare, and the click-only Web Inspector route) WITHOUT arming anything</name>
  <files>.planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/notice_copy_probe.py, .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/baseline.env, .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/library-replica.txt, .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/mount-state.txt, .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/geometry.txt, .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/container-source-census.txt, .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/tracer-copy.txt</files>
  <precondition>An X11 session is live on `DISPLAY=:1`. `xdotool`, `xwininfo`, `xprop`, `loginctl`, `findmnt`, `udisksctl` and `gnome-session-inhibit` are on PATH. `python3 -c 'import mss, PIL, Xlib, gi'` succeeds. `src-tauri/target/debug/gamelib-shell` exists, so the launch is an incremental build. `node_modules/@node-steam/vdf` and `node_modules/js-yaml` are installed.</precondition>
  <read_first>
    - .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs lines 1-66
    - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py lines 1-35 (subcommands; `find` prints JSON with `pid`, `x`, `y`, `width`, `height`)
    - .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/capture_region_fix.py lines 1-80 (the `xwininfo` origin method)
    - .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/steam_library_replica.cjs (all 72 lines)
    - .planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py lines 1-212 (SIGNATURES, app selection by pid with the "gamelib" name fallback, the dialog-containment rule, `get_text`)
    - .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/260929-hgm-SUMMARY.md lines 39-94 and 153-158 (lock checkpoint, inhibitor PID lesson, the offset deviation, the verify quirk)
    - .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/evidence/region-offset-deviation.txt
    - .planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/260928-tvk-SUMMARY.md lines 100-126 (sidecar process group, devtools panel)
    - .planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/evidence/atspi-dialog-subtree.txt (the U+FFFC-prefixed notice node)
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx lines 528-549
    - src/frontend/screens/Library/components/InstallModal/index.tsx lines 415-423, 640-660 and 700-712
    - src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx lines 100-125
    - EVERY read_first range of Task 3, read NOW, before Step 5's launch (see LOCK RULE)
  </read_first>
  <action>
Step 0. Session lock and idle inhibitor. Do these BEFORE anything is launched.
- Find this user's seat0 x11 session with `loginctl list-sessions --no-legend`. Record its id as
  `LOCK_SESSION` (it was `2` at planning time).
- `loginctl show-session <LOCK_SESSION> -p LockedHint --value` must read `no`. If it reads `yes`,
  launch NOTHING and return a human-action checkpoint asking the operator to unlock. There is
  nothing to clean up yet. On resume, confirm `no` independently.
- Start the inhibitor in the background under `setsid`:
  `gnome-session-inhibit --inhibit idle --app-id gsd-260929-tmw --reason "gsd-260929-tmw Phase 38 sitting 9" --inhibit-only`.
- Record the PID of the process whose `/proc/<pid>/exe` resolves to the `gnome-session-inhibit`
  binary. That is the real inhibitor, not the `setsid`/shell wrapper that `pgrep -f` also matches.
  Save it to the session scratchpad.
- Confirm `gnome-session-inhibit -l` lists the app id. If the inhibitor will not start, record a
  deviation and continue; the LockedHint checks remain the backstop.

Step 1. Re-measure the ledger baseline. It is mutable, so this task authorizes nothing from the
planning snapshot.
- Run ledger-check with `--human-uat`, starting from `--open 7 --discharged 19 --retired 10`. If it
  fails on a count, read the actual counts from its FAIL lines and re-run until it passes.
- Confirm `38-S16` is still OPEN, with
  `--includes 'open:38-S16:test=Content-light notice COPY and container'` and
  `--includes 'open:38-S16:prior_state=A single-branch run does not discharge this item.'`.
  - If `38-S16` is no longer in `human_verification`, STOP and report: someone else has moved it.
  - If it already carries a `sitting_9_*` key, STOP and report: this sitting has already been
    recorded.
- Read the live open ids, in array order, with a js-yaml read of the frontmatter. Do not guess the
  order.
- Run `--census`, and confirm `34.13-UAT.md` is still reported at `(62:176)`.
- Confirm `git status --porcelain -- src src-tauri package.json` is EMPTY. If it is not, STOP: the
  build would not be HEAD.
- Write `evidence/baseline.env` in this quick task's directory. It holds `KEY=value` lines only and
  no secrets. EVERY value must be one shell word, or be single-quoted, because later verifies
  `source` the file. Sitting 8's unquoted `UNAME` line would have executed `pop-os` as a command.
  - `O`, `D`, `R`: the live counts.
  - `OPEN_IDS`: the comma-separated live open ids.
  - `AUDIT38`, `TOTAL`: from the ledger-check audit-uat lines.
  - `CENSUS_BAD`.
  - `PRE_SHA`: `git rev-parse --short HEAD`.
  - `SDATE`: `date +%F`.
  - `SKEY`: `sitting_9_` followed by `SDATE` with its hyphens turned into underscores.
  - `LOCK_SESSION`.
  - `UNAME`, `OS_PRETTY_NAME`, `XDG_SESSION_TYPE`, `DISPLAY_VAR`: single-quoted.
  - Later steps append `ORIG_NATIVE`, `LIB_COUNT`, `MOUNT_TARGET`, `CAPTURE_TOOL`, `CAPTURE`,
    `SHELL_PID`, `TEXT_INSTRUMENT`, `DOM_ROUTE`, `DOM_ATSPI` and `SIGNED_IN`.
  Every later count in this plan means "these values". The ledger counts must end EQUAL to them.

Step 2. Record the arming state and the mount state, before launch.
- `ORIG_NATIVE`: read ONLY `defaultSettings.enableSteamNativeInstall` from
  `~/.config/GameLib/config.json` with a Python json read, and print nothing else from the file.
  Write `true`, `false` or `absent`. It was `false` at planning time. Do NOT change it in this task.
- Run the replica AS-IS by path:
  `node .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/steam_library_replica.cjs`.
  - Write its output to `evidence/library-replica.txt`, under a first line `# Task 1 <ISO time>`.
  - Write `LIB_COUNT` to `baseline.env`. It was 1 at planning time.
  - Compare its five candidate PATHS (not their EXISTS states) with sitting 8's committed
    `260929-hgm-.../evidence/library-replica.txt`. If the registered set changed, Steam rewrote the
    vdf. Record that in `mount-state.txt`, and do not repair it.
- Write `evidence/mount-state.txt`, section `# Task 1 <ISO time>`:
  - the output of `findmnt -n -o TARGET,OPTIONS -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309`
    (expected empty). Write `MOUNT_TARGET` to `baseline.env`: the target, or `none`;
  - the `Device`, `IdType`, `IdUUID` and `MountPoints` lines of `udisksctl info -b /dev/nvme0n1p3`.
    If `IdUUID` is not `7ca4a725-1bb4-4e38-8f76-bad1fc803309`, the device node moved: find the
    device for that UUID with `lsblk -f` and use it in Task 4, recording the change;
  - the `/etc/fstab` line for that UUID;
  - the `implicit active` value of `pkaction --action-id <id> --verbose` for
    `org.freedesktop.udisks2.filesystem-fstab` and `org.freedesktop.udisks2.filesystem-unmount-others`;
  - the udisks journal lines for this device from the last three hours, `journalctl -q --since '3
    hours ago' --no-pager`, filtered to lines naming `nvme0n1p3`. These show who unmounted it and
    whether authentication was needed;
  - one line stating THE TRAP from the objective: the vdf registers this same drive as candidates 3
    and 4.
- Outcomes:
  - `LIB_COUNT` of 1, with the one EXISTS path `~/.steam/debian-installation` and `MOUNT_TARGET`
    `none`: the ON sub-branch is armable.
  - `LIB_COUNT` of 2 or more: something remounted the drive or plugged in another. Write
    `LIBS_OK=no` to the scratchpad and CONTINUE: Task 2 handles it, and the OFF sub-branch does not
    need it.
  - `LIB_COUNT` of 0, or a `BRANCH` other than PARSED: write `LIBS_OK=no` and record why. The ON
    sub-branch cannot be armed legitimately (see ARMING).

Step 3. Write the exact-copy instrument, and prove its logic with no app running.
- Write `notice_copy_probe.py` in this quick task's directory. Python 3, stdlib plus
  `gi.repository.Atspi` only, read-only, no network.
- Its header docstring states what it is:
  - the `38-S16` exact-copy instrument for Phase 38 sitting 9, quick 260929-tmw;
  - it mirrors `atspi_dialog_probe.py`'s app selection (desktop children whose process id equals
    `--pid`, falling back to a case-insensitive "gamelib" name match) and its dialog-containment
    rule (a node is in a dialog when it or an ancestor has role `dialog`);
  - it reads text UNCAPPED;
  - it prints only matching nodes and their ancestor chains, never a whole-tree dump.
- Shared helpers:
  - `load_key(catalogue, dotted_key)` walks the JSON by the dotted path. A missing key or a
    non-string value exits 2 with a message.
  - `extract_segment(node_text, match)` splits on U+FFFC, picks the FIRST segment whose casefold
    contains `match` casefolded, and strips leading and trailing whitespace. It also counts the
    U+FFFC characters that immediately precede that segment in the raw text, ignoring whitespace
    between them (`FFFC_BEFORE_SEGMENT`).
  - `compare(segment, expected)` returns one of three results:
    - `EXACT` when they are equal;
    - `NEWLINE_ONLY` when replacing every newline in the segment with a space gives `expected`
      exactly, and every newline sits at an index where `expected` has a space;
    - `MISMATCH` otherwise, with the first differing index, both characters as `U+XXXX` (or `END`
      when one string is a prefix of the other) and both lengths.
- Subcommand `selftest --catalogue FILE`:
  - Uses the LIVE values of S (`steam.install.contentLightSingleLibraryNotice`) and O
    (`steam.install.contentLightNotice`).
  - Prints `S_LEN`, `O_LEN`, and the index and codepoint of every non-ASCII character and every
    apostrophe-like character in each.
  - Then prints one PASS or FAIL line per case:
    1. U+FFFC followed by S extracts to S, with `FFFC_BEFORE_SEGMENT=1`, and compares EXACT.
    2. S with its first U+0027 replaced by U+2019 compares MISMATCH at that index, naming
       `U+0027` and `U+2019`.
    3. S with its U+2014 replaced by U+002D compares MISMATCH at the em dash's index.
    4. O compared with S is MISMATCH; O compared with O is EXACT.
    5. S with its first space replaced by a newline compares NEWLINE_ONLY.
    6. The node text "Title", two U+FFFC, a newline, one U+FFFC, then S, then one U+FFFC,
       extracts to S with `FFFC_BEFORE_SEGMENT=1`.
    7. S with one character deleted compares MISMATCH with differing lengths.
  - Exits 0 only when every case passes.
- Subcommand `copy --pid PID --catalogue FILE --key K --match M [--alt-key K2 --alt-match M2]`:
  - Walks the app tree. For every node whose text (Text interface, uncapped), or failing that its
    name, contains `M` casefolded, prints one `HIT kind=expected` block:
    - `path`, `depth`, `role`, `in_dialog`, `source` (`text` or `name`);
    - `attrs`: the JSON of the node's AT-SPI attributes;
    - `SEGMENT_REPR` (Python repr), `SEGMENT_LEN`, `FFFC_BEFORE_SEGMENT`;
    - `COMPARE_EXPECTED` against K's catalogue value;
    - `COMPARE_ALT` against K2's value, when given.
  - Does the same for `M2`, printing `kind=alt` blocks.
  - For the DEEPEST hit of each kind, prints its ancestor chain up to the app root: one `ANCESTOR`
    line per level, with depth, role, name capped at 60 characters, and attrs.
  - Summary lines:
    - `EXPECTED_HITS`, `ALT_HITS`, and `DEEPEST_EXPECTED_COMPARE`;
    - `DIALOG_NODES`, and `DIALOG_HEADING_NODES` (role `heading` inside any dialog subtree);
    - `THIRD_PARTY_HITS`: nodes whose text or name contains the casefolded value of
      `third-party-managed.header` from `public/locales/en/gamepage.json`. Resolve that path
      relative to the `--catalogue` file's directory;
    - `ATTR_CLASS_EXPOSED`: `yes` if any node's attributes contain a `class` key, else `no`.
  - Exits 0 when it ran (zero hits included), 2 on a catalogue error, and 3 when no app matched.
- Subcommand `locate --pid PID --match M [--role R]`: for each node whose name or text contains `M`
  casefolded (and whose role equals `R` when given), prints path, role, name capped at 80
  characters, and its SCREEN extents `x,y,w,h` and centre `cx,cy` from `Atspi.Component`. It
  derives click points and never clicks.
- Subcommand `inspector --pid PID`:
  - prints every node in the SELECTED state with non-empty text or name;
  - prints every node whose text or name contains `infoBox`, `thirdPartyNotice`, `noticeIcon` or
    `noticeInfo` (case-sensitive: these are class names), each with path, role and text capped at
    300 characters;
  - then prints `SELECTED_COUNT`, `INFOBOX_HITS` and `THIRDPARTY_CLASS_HITS`.
  It is read-only.
- Run `python3 <probe> selftest --catalogue public/locales/en/gamelib.json`. It must exit 0. Keep
  its output in the scratchpad; Task 3 copies it into `notice-copy.txt`.

Step 4. The static container census. Write `evidence/container-source-census.txt`, headed with
`PRE_SHA`:
- For each of the two catalogue keys, list every `src/` hit outside `__tests__` directories with
  `grep -rn`. Expect exactly one each: `SteamDialog/index.tsx:541` and `:545`.
- Quote `SteamDialog/index.tsx` lines 530-532 verbatim: the `gating.contentLightNotice` guard, the
  `div` with className `infoBox`, and the icon. Name the lines that close them without quoting
  them.
- List every `src/` file containing `noticeIcon` or `noticeInfo`. Expect only
  `ThirdPartyDialog/index.tsx` and `ThirdPartyDialog/index.css`.
- Give the count of either catalogue key inside `ThirdPartyDialog/`. Expect 0.
- Quote `InstallModal/index.tsx` lines 646 and 710: the two ternary arms.
- Record S and O with their lengths and non-ASCII codepoints, and whether each `t()` default at
  `SteamDialog/index.tsx:542`/`:546` equals its catalogue value byte for byte. Use a Python read of
  both files. It was true for both at planning time.
- If ANY expectation fails, the build no longer matches this plan's container analysis. Record it;
  the STRUCTURAL basis is then unavailable, and only a DOM-READ can score F2 and F4.

Step 5. Take the pre-launch census, then launch.
- Use bracketed `pgrep -af` patterns (`[g]amelib-shell`, `[b]uild/main/sidecar.js`, `[t]auri dev`).
  `ss -Hltn '( sport = :5173 )'` must be empty.
- If a foreign GameLib process is running, do NOT kill it. Stop the inhibitor, STOP and report.
- Record `pgrep -x steam` (informational), `ls -ld ~/.config/GameLib`, and the vault's mode via
  `stat -c '%a %n'`. Never read the vault.
- Run `pnpm tauri:dev` with NO env overrides, in the background under `setsid`.
  - Save the group leader PID to the scratchpad.
  - Send the transcript to the scratchpad, never into the repo.
- Poll, bounded to 15 minutes, until `xdotool search --onlyvisible --name '^GameLib$'` returns a
  window.
- If the preflight refuses or the build fails, record the paraphrased reason, run Task 3 step I's
  process cleanup (there is no setting to restore yet), and STOP.

Step 6. Prove the identity and map the process tree.
- Take the window id from the search. `xdotool getwindowpid <id>` must resolve through
  `readlink /proc/<pid>/exe` to
  `/home/graysonmitchell/GameLib/src-tauri/target/debug/gamelib-shell`. Otherwise STOP.
- Write `SHELL_PID` to `baseline.env`.
- With `ps -o pid,pgid,sid,args`, record the `setsid` PGID AND the sidecar's PID and PGID in the
  scratchpad. Do not assume they share a group.

Step 7. Cross-check the capture geometry and pick the tool.
- Read `xdotool getwindowgeometry --shell <id>` (its X and Y) and `xwininfo -id <id>` (its
  "Absolute upper-left X/Y" and Width/Height), three times each.
- Write all six readings and `_NET_FRAME_EXTENTS` (`xprop -id <id>`) to `evidence/geometry.txt`,
  under `# Task 1 <ISO time>`.
- If the two origins agree on every reading, use the base tool: write `CAPTURE_TOOL=base` and
  `CAPTURE=.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py`.
- If they disagree, use the fix wrapper: write `CAPTURE_TOOL=fix` and
  `CAPTURE=.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/capture_region_fix.py`,
  and note the offset. The base tool's `selftest` and `clients` stay usable for fps and window
  lists, but not as region evidence.
- Confirm the choice empirically, as sitting 8 did:
  - run `locate --pid <SHELL_PID> --match settings --role 'page tab'` to get the NavTabs SETTINGS
    tab's screen extents;
  - `grab` with `$CAPTURE`, VIEW it, and check that the tab appears at (extent minus chosen origin)
    inside the image. Record the check.

Step 8. Clear stray UI and self-test the visual instrument.
- Check LockedHint. `grab` with `$CAPTURE` and VIEW it.
- If the docked devtools panel is visible (the debug build opens it at launch), close it with a
  coordinate click on the panel's OWN close button. Re-grab and view to confirm.
- Run the BASE tool's `selftest` and record fps and frame interval. When `CAPTURE_TOOL=fix`, the
  viewed fix-wrapper grab is the non-blank check.
- If the grab is blank (and LockedHint is `no`), relaunch once with
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` and record the deviation. If it is still blank, STOP.

Step 9. Smoke-test the text tree, and check the log sink.
- Run `timeout 150 python3 <atspi_dialog_probe.py> smoke --pid <SHELL_PID>`. On PASS write
  `TEXT_INSTRUMENT=ok`. On FAIL write `TEXT_INSTRUMENT=unavailable` with the failing line, and note
  that F1 and F3 will then be NOT SCORED. Do not reconfigure accessibility to chase it.
- `~/.local/state/GameLib/logs/gamelib.log` must exist, with an mtime since launch.

Step 10. In Settings: locate the toggle, run the live copy tracer, and probe the DOM route. Nothing
is armed.
- Navigate to Settings by clicking the SETTINGS tab at its `locate`-derived centre. The General
  section hosts `EnableSteamNativeInstall` (`GeneralSettings/index.tsx:48`).
- Find the row "Download Steam games directly in GameLib" (`setting.steam-native-install` in
  `translation.json`) with `locate`, and on a viewed grab.
  - The toggle's visual state must match `ORIG_NATIVE`.
  - Record the toggle's absolute click coordinates and the route to Settings in the scratchpad.
  - Do NOT click the toggle.
- LIVE COPY TRACER. Run `python3 <probe> copy --pid <SHELL_PID> --catalogue
  public/locales/en/translation.json --key setting.steam-native-install --match 'steam games
  directly'`.
  - Write its output to `evidence/tracer-copy.txt`, after checking that it carries no account
    identifier.
  - `DEEPEST_EXPECTED_COMPARE=EXACT` proves the live read-normalise-compare chain on a known
    string.
  - A MISMATCH with an explainable diff (for example, trailing punctuation added by the component)
    still proves the live read. Record the diff; the exact path then rests on `selftest`.
  - Zero hits: record `TEXT_INSTRUMENT=unavailable`.
- DOM ROUTE PROBE, with native still at `ORIG_NATIVE`.
  - Right-click (`xdotool click 3`) on an INERT heading of the Settings page. Never the toggle row,
    and never a control.
  - Grab and VIEW. If the WebKitGTK context menu lists "Inspect Element", click that item only.
    Grab and VIEW: the inspector must open with a node selected. Record whether it opened docked or
    as its own window.
  - Run `python3 <probe> inspector --pid <SHELL_PID>`. `SELECTED_COUNT` of at least 1 with readable
    node text means `DOM_ATSPI=ok`; otherwise `DOM_ATSPI=not-exposed`.
  - Close the inspector with its OWN close button, then grab and VIEW to confirm it is gone.
  - Write `DOM_ROUTE=ok`. If no "Inspect Element" item appears, dismiss the menu by left-clicking
    the same inert heading, and write `DOM_ROUTE=none`.
  - These grabs stay in the scratchpad.

Step 11. Back to the Library: sign-in and target.
- Navigate to the Library. `grab` and VIEW it: it must list owned Steam games.
- Open 7 Days to Die (251570) by clicking.
  - Its page must offer Install with the caret beside it.
  - No `appmanifest_251570.acf` may exist in any `steamapps` dir the replica listed as EXISTS.
- If it does not qualify, pick another owned, not-installed Steam game and record why. Its
  `/mnt/PopGames` side cannot be checked while unmounted; record that.
- Write `SIGNED_IN=yes` or `SIGNED_IN=no` to `baseline.env`.

Leave the app and the inhibitor RUNNING for Tasks 2 and 3. Native installs remain at `ORIG_NATIVE`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on && L=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs && RP=.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/steam_library_replica.cjs && . $Q/evidence/baseline.env && [ "$(loginctl show-session $LOCK_SESSION -p LockedHint --value)" = no ] && python3 $Q/notice_copy_probe.py selftest --catalogue public/locales/en/gamelib.json && python3 $CAPTURE find >/dev/null && test "$(readlink /proc/$SHELL_PID/exe)" = /home/graysonmitchell/GameLib/src-tauri/target/debug/gamelib-shell && test -s "$HOME/.local/state/GameLib/logs/gamelib.log" && node $L --open $O --discharged $D --retired $R --human-uat --open-ids $OPEN_IDS --includes 'open:38-S16:test=Content-light notice COPY and container' --includes 'open:38-S16:prior_state=A single-branch run does not discharge this item.' && node $RP | tail -1 | grep -qx "COUNT=$LIB_COUNT" && grep -qx "COUNT=$LIB_COUNT" $Q/evidence/library-replica.txt && grep -q 'nvme0n1p3' $Q/evidence/mount-state.txt && grep -q 'SteamDialog/index.tsx:541' $Q/evidence/container-source-census.txt && for k in TEXT_INSTRUMENT DOM_ROUTE DOM_ATSPI CAPTURE_TOOL SIGNED_IN; do grep -q "^$k=" $Q/evidence/baseline.env || { echo "baseline.env lacks $k"; exit 1; }; done && python3 -c "import json,os,sys; d=json.load(open(os.path.expanduser('~/.config/GameLib/config.json'))).get('defaultSettings',{}); o=sys.argv[1]; c=json.dumps(d['enableSteamNativeInstall']) if 'enableSteamNativeInstall' in d else 'absent'; sys.exit(0 if c==o or (o=='absent' and c=='false') else 1)" "$ORIG_NATIVE" && for f in $Q/notice_copy_probe.py $Q/evidence/baseline.env $Q/evidence/library-replica.txt $Q/evidence/mount-state.txt $Q/evidence/geometry.txt $Q/evidence/container-source-census.txt $Q/evidence/tracer-copy.txt; do npx prettier --file-info $f | grep -Eq '"ignored":[[:space:]]*true' || { echo "not prettier-ignored: $f"; exit 1; }; done</automated>
  </verify>
  <done>
- The screen is unlocked. The REAL idle-inhibitor PID is recorded and listed, or its failure is a
  recorded deviation.
- `notice_copy_probe.py` exists and its `selftest` passes all seven cases against the live
  catalogue, with no app involved.
- The dev window is up, and its PID's exe is proven to be `src-tauri/target/debug/gamelib-shell`.
  Both process groups are recorded.
- The geometry cross-check is recorded, and `CAPTURE` names the tool it justified. The choice was
  confirmed by a viewed grab against an AT-SPI extent.
- No devtools panel is docked. The visual instrument is self-tested. `TEXT_INSTRUMENT`,
  `DOM_ROUTE` and `DOM_ATSPI` are decided from live probes, and the live copy tracer's result is in
  `tracer-copy.txt`.
- `ORIG_NATIVE` is recorded and UNCHANGED. The toggle is located, and its state matches.
- `LIB_COUNT`, `MOUNT_TARGET` and `mount-state.txt` record the drive and arming state before launch.
  `LIBS_OK=no` is noted when the ON arm is not available.
- `container-source-census.txt` holds the static container evidence. `SIGNED_IN` and the target
  are decided from viewed grabs.
- Every file written sits under the prettier-ignored `.planning` tree, which the verify proves with
  `--file-info` instead of a vacuous `--check`. The app is left running.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Only if Task 1 found the screen locked, Steam sign-in NOT usable, or a library count other than exactly one, the operator restores whichever precondition failed</name>
  <action>
CHECK AND SKIP FIRST. Every precondition is mutable.
- LockedHint must read `no`. If it reads `yes`, ask for an unlock first, as in Task 1 Step 0.
- Re-run `python3 $CAPTURE find`: it must report the Task 1 PID and exe.
- Re-run the replica, and `findmnt -n -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309`.
- `grab` and VIEW the Library.
- If the Library lists owned Steam games including a not-installed one, AND the replica prints
  `BRANCH: PARSED` and `COUNT=1` with `~/.steam/debian-installation` as its only EXISTS path, record
  "all preconditions satisfied live, checkpoint skipped". Continue to Task 3 WITHOUT pausing.
- Otherwise pause, presenting ONLY the part or parts that failed. Signing in needs the operator's
  credentials and a Steam Guard or QR approval. Unmounting a drive needs their authentication.
  Claude does neither.
- A count problem blocks ONLY the ON sub-branch. If the operator declines Part B, Task 3 still
  scores the OFF sub-branch, and the ON sub-branch is recorded NOT SCORED.
  </action>
  <instructions>
Already done: the HEAD dev build is running with its identity proven, every capture instrument is
self-tested, and native Steam installs are still at their original setting (OFF), untouched.

PART A — only if asked: Steam sign-in.
1. In the GameLib dev window that is open now, sign in to Steam from GameLib's store login screen,
   by QR or credentials.
2. Wait until the Library lists your Steam games.

PART B — only if asked: exactly ONE Steam library on disk. This item's ON arm needs at most one of
your registered Steam libraries to exist right now. Before this task started, the quick orchestrator
unmounted `/mnt/PopGames` (with your authentication) for exactly this reason. Something has since
made a second library available again. The executor reports which path. Either:
1. If it is `/mnt/PopGames`, unmount it again with `udisksctl unmount -b /dev/nvme0n1p3`,
   authenticating when asked, or eject "LinuxGames" in the Files sidebar; or
2. If it is an external drive under `/media/<you>/...`, eject or unplug it.
It is remounted at the end of this task (Task 4), again with your authentication. No relaunch of
GameLib is needed: it re-reads the library list every time the dialog opens.

You may instead reply "decline" to Part B. The ON-with-one-library copy is then recorded NOT SCORED,
and the item stays open either way.

Do NOT click Install on any game, and do NOT open any install dialog yourself. The executor opens it
under capture, and turns native installs on only for that moment.
  </instructions>
  <verification>`find` reports the Task 1 PID and exe. A fresh viewed `grab` shows Steam games in the Library. The replica prints `BRANCH: PARSED` and `COUNT=1` with only `~/.steam/debian-installation` existing, or the operator declined Part B (recorded).</verification>
  <resume-signal>Type "signed in", "unmounted", both, or "decline", or describe what blocked you.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Score both copy sub-branches of the Linux half: OFF first at steady state, then native ON for one open only, each with an exact-copy read, a container read and a transient check. Restore the setting, clean up every process, and record the result IN PLACE on the still-open `38-S16`, in the narrative, and in the origin receipt</name>
  <files>.planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/ledger_inplace_check.cjs, .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md, .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md, .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md, .planning/todos/pending/ (FAIL or unscored-anomaly branch only)</files>
  <precondition>Task 2 was skipped on a live check or its resume signal arrived. `find` still reports the Task 1 PID, with exe `src-tauri/target/debug/gamelib-shell`. LockedHint reads `no`.</precondition>
  <reversibility rating="reversible">The ledger change is one added key on one entry. Deleting that line restores the `PRE_SHA` frontmatter exactly, which `ledger_inplace_check.cjs` would then report as the key missing. The native-install setting is restored through the same UI toggle and verified by a read. Nothing is moved between arrays.</reversibility>
  <read_first>
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx lines 415-566 (what each region renders; the notice at 530-549)
    - src/frontend/screens/Library/components/InstallModal/index.tsx lines 360-402, 415-460, 490-502, 640-660 and 700-740
    - src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts lines 182-210 and 270-303
    - src/frontend/screens/Library/components/InstallModal/steamEligibilityProbe.ts lines 258-284 (pending suppression and the KNOWN RESIDUAL)
    - src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx lines 100-125 and ThirdPartyDialog/index.css (the container to rule out)
    - src/frontend/components/UI/InfoBox/index.css lines 1-10 and src/frontend/screens/Library/components/InstallModal/index.scss lines 1-13 (what `.infoBox` looks like)
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx lines 325-412 (the autofocused primary Install button, and the caret)
    - 38-VERIFICATION.md: lines 1-4 and 6-11 (skip line 5, the `score:` line, which is not edited); the `38-S14` entry (grep `id: "38-S14"`, 11 lines); the `38-S16` entry (grep `id: "38-S16"`, 11 lines plus the blank after it)
    - 38-HUMAN-UAT.md: lines 1-47, and the `## Sitting 8` section to the end of the file
    - 34.13-UAT.md: the receipt blocks containing `to_item: "38-S14"` and `to_item: "38-S16"` (7 lines each), and the single lines starting `| G-D20-CONTENTLIGHT | tauri |` and `| G-D20-Q6-COPY | tauri |` (both very long; read them with a column cap)
    - CLAUDE.md "Todo triage frontmatter" (only if a todo is filed)
  </read_first>
  <action>
ACCIDENTAL DOWNLOAD RULE. This applies whenever native installs are ON.
- If an install or progress state appears for ANY game, cancel it at once with GameLib's own cancel
  control, then VIEW a grab confirming it stopped.
- Record the appId and the time.
- Record whether an `appmanifest_<appId>.acf` or a new `steamapps/common` directory now exists in
  `~/.steam/debian-installation`. Do NOT delete Steam files yourself; list them for the operator in
  the SUMMARY.
- The ON sub-branch is then NOT SCORED, unless steps SB-3 to SB-5 were already fully captured.
Install is NEVER clicked, in either state.

A. Order the sub-branches by `ORIG_NATIVE`, so the setting is toggled exactly once and restored once.
- `false` or `absent` (expected): run SB for `off`, then step D (turn ON), then SB for `on`, then
  step E (restore OFF).
- `true`: run SB for `on` (every ON precondition still applies), then step D (turn OFF), then SB for
  `off`, then step E (restore ON).
- For each sub-branch `k`, the expected key EXP, its discriminator EXPM, the other key ALT and its
  discriminator ALTM are:
  - `off`: EXP `steam.install.contentLightNotice`, EXPM `turn on native steam installs in
    settings`, ALT `steam.install.contentLightSingleLibraryNotice`, ALTM `only one steam library on
    this system`;
  - `on`: the same pair swapped.

SB. The per-sub-branch procedure. Run it once for each `k`.

SB-1. Preconditions, re-proven immediately before the open.
- LockedHint `no`. `python3 $CAPTURE find` reports the same PID and exe.
- If a lock/unlock cycle happened since the last cross-check, re-run Task 1 Step 7's cross-check,
  append it to `geometry.txt`, and switch `CAPTURE` if the result changed. Do this in any case
  immediately before the burst in SB-3.
- Read ONLY `enableSteamNativeInstall`. `off` needs `false` or absent; `on` needs `true`.
- Run the replica and append its output to `library-replica.txt` under `# Task 3 <k> pre-open <ISO
  time>`. Append `findmnt -n -o TARGET -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309` to
  `mount-state.txt` under the same heading.
- `on` requires ALL of the following. If any fails, `on` is NOT SCORED with that reason: skip to
  step E, or to the next sub-branch.
  - `BRANCH: PARSED`;
  - `COUNT=1`;
  - the only EXISTS line is `/home/graysonmitchell/.steam/debian-installation`;
  - the `findmnt` output is empty.
- `off` accepts any count.

SB-2. Target and negative control, with the dialog CLOSED.
- Navigate to the target game page by clicking. `grab` it as `pre-open-<k>.png`, and take a base
  tool `clients` baseline.
- Run the shared probe's `dump` into the scratchpad, then `regions --title <title>`. Then run
  `python3 <probe> copy --pid <SHELL_PID> --catalogue public/locales/en/gamelib.json --key EXP
  --match 'EXPM' --alt-key ALT --alt-match 'ALTM'` into the scratchpad.
- `EXPECTED_HITS` and `ALT_HITS` must both be 0, and the shared probe's `content_light_off` and
  `content_light_single` counts must both be 0.
- A non-zero count means a stale or foreign node carries a notice string. AT-SPI caches can outlive
  a closed dialog, which is why this runs before EACH open. Record it: the text instrument is
  INVALID for this sub-branch.

SB-3. Open the dialog under capture.
- Check LockedHint.
- Click the `SteamInstallCaret`. Take its coordinates from a viewed grab, or from `locate` if
  ambiguous.
- `grab` and VIEW: the menu must show "Install with options…", and the page must show NO install
  progress. Anything else triggers the ACCIDENTAL DOWNLOAD RULE.
- Get the menu item's centre with `python3 <probe> locate --pid <SHELL_PID> --match 'install with
  options'`, and confirm on the viewed grab that the point lies on the item.
- Run `python3 $CAPTURE burst --out <scratch>/open-<k> --pre 0.5 --seconds 6 --click X,Y`. Record
  frames, fps, the median interval, the click epoch and `new_windows`.
- Wait 2 seconds and check LockedHint. Then `grab` as `dialog-settled-<k>.png`, and VIEW it.
- The WHOLE dialog must be in view: the title row, the close X, the notice box, and the footer
  INSTALL button, with no scrollbar inside the body. If it is clipped, resize or scroll, recapture,
  and record the deviation.
- With PIL, crop `dialog-crop-<k>.png` (the dialog) and `notice-crop-<k>.png` (the notice box plus
  about 12px of margin). VIEW both at full resolution.

SB-4. Transient and late-mount check.
- Copy the burst frames, from the first one showing the dialog onward, into `<scratch>/settle-<k>/`.
  Add `dialog-settled-<k>.png` there as `frame_0000000000000.png`, so it sorts first.
- Run the BASE tool's `diff <scratch>/settle-<k> --flag 0.005`. Frames in the first ~500 ms after
  the dialog appears (the MUI Slide) deviate by design.
- VIEW every flagged frame after that window, plus the max frame, and classify each one:
  - EXPECTED LATE MOUNT: the notice is absent, then appears in its settled form, while everything
    else matches. `applyLibraryFetchPending` suppresses the notice while the library IPC is
    pending. Record the notice's first-visible latency in ms after the dialog first appeared.
  - SCORED TRANSIENT. Either of:
    - a notice visibly different from the settled notice. For `on`, this means a notice showing
      O's "Turn on native Steam installs in Settings" clause, or O's longer three-sentence shape.
      This is a DETECTION, not the copy verdict, and a detected frame is kept as
      `transient-<k>-<ms>.png`;
    - the notice vanishing after it first appeared.
  - ARMING CONTRADICTED: a "Choose Steam library" dropdown or a "Space Available" line in any frame.
    That is not row 7, and sub-branch `k` is NOT SCORED.
  - UNSCORED ANOMALY. Either of:
    - a platform row or a wine signature (`38-S10`'s territory, already discharged);
    - a second infoBox-style notice (the degrade copy "couldn't be reached" or "Not enough space",
      or the shared-bottle copy).
    Record the frames.

SB-5. Text-tree reads. Only if `TEXT_INSTRUMENT=ok`.
- After the settle, and before any further click, run `dump` and `regions --title <title>`.
- The text instrument is VALID for `k` only when all of these hold:
  - at least one dialog-role node exists;
  - inside it, `title` is at least 1;
  - the dialog-subtree role histogram has a push button named the Install label;
  - SB-2's negative control was 0/0 on both probes.
- Record `content_light_off` and `content_light_single` (in-dialog and outside), and
  `COMBO_BOX_COUNT`. It must be 0: no dropdown, which is arming corroboration.
- Run `python3 <probe> copy --pid <SHELL_PID> --catalogue public/locales/en/gamelib.json --key EXP
  --match 'EXPM' --alt-key ALT --alt-match 'ALTM'` into `<scratch>/copy-<k>.txt`.
- For the scratchpad's `atspi-dialog-subtree.txt` draft, keep ONLY the dialog-subtree lines (role
  plus text), both `regions` tables and the VALIDITY verdict.

SB-6. DOM read of the container. Only if `DOM_ROUTE=ok`, and only after SB-5.
- Get the notice's extents with `python3 <probe> locate --pid <SHELL_PID> --match 'EXPM'`.
- Choose a point ON the notice text: inside the notice box, and at least 40px from the footer
  INSTALL button and from the header X. Confirm the point on the viewed `notice-crop-<k>.png`.
- Right-click there (`xdotool click 3`). Grab and VIEW: a WebKitGTK context menu with "Inspect
  Element" must be showing, with no app menu, no dialog change and no progress.
- Click "Inspect Element" only. Grab and VIEW: the inspector is open with a node selected. When it
  opens as its own window, grab that window by its `xwininfo` absolute origin and size with mss, as
  `capture_region_fix.py` does.
- Record, in `div.infoBox` selector notation:
  - the selected node;
  - its parent, when a text node is selected;
  - the ancestor path shown in the inspector's path bar;
  - whether any node on that path carries `thirdPartyNotice`, `noticeIcon` or `noticeInfo`.
- If `DOM_ATSPI=ok`, run `python3 <probe> inspector --pid <SHELL_PID>` into the scratchpad and keep
  its SELECTED and INFOBOX lines.
- Crop the inspector grab to the DOM rows around the selected node plus the path bar, as
  `inspector-<k>.png`, and VIEW it for privacy.
- Close the inspector with its OWN close button. Grab and VIEW: the inspector is gone, the dialog is
  still open, and there is no progress.
- Never type into the inspector, edit a node or attribute, or click into its console.
- If any part fails (no "Inspect Element" item, a wrong node selected, the dialog closing), record
  the reason. The container basis for `k` is then STRUCTURAL.

SB-7. The visual container observation, from `notice-crop-<k>.png`. Describe what the crop shows:
- the box fill and its rounded corners;
- whether the warning-triangle icon sits inline at the start of the text;
- the absence or presence of a 2px border, a rounded checkmark icon, and a bold header line;
- the rendered language.

SB-8. Close the dialog with its header X. Grab and view to confirm it is gone. From `gamelib.log`,
extract the lines from the open second through +10s that contain `SteamDialog`, `SteamGame`,
`InstallModal`, `34.13` or `ERROR`, into `log-excerpt.txt` under `SUBBRANCH=<k>`. Write "no matching
lines" if there are none.

D. Switch the arm, as late as possible.
- Check LockedHint and `find`.
- Navigate to Settings by the saved route, and click the toggle at the saved coordinates.
- Re-grab and VIEW: the toggle shows the new state.
- Re-read ONLY the key: it must equal the new state. Retry once through the UI. If it is still
  wrong, the second sub-branch is NOT SCORED; go to E.
- Crop the grab to the toggle row alone, as `settings-native-on.png` (or `settings-native-off.png`
  when `ORIG_NATIVE` was `true`).
- If the new state is ON, the NATIVE-ON HAZARD applies from here until E: no keys to any GameLib or
  inspector surface, and only the clicks listed in the objective.

E. Restore FIRST, before any teardown, while the app still runs.
- Navigate to Settings and click the toggle. VIEW a grab showing the original state.
- Re-read the key: it must equal `ORIG_NATIVE`. When `ORIG_NATIVE` is `absent`, `false` is the
  runtime default; record that.
- Crop to the toggle row as `settings-native-restored.png`.
- If the app is gone before the restore, relaunch it per Task 1 Steps 5-8 under the same arm,
  re-prove its identity, restore through the UI, and re-read the key.
- NEVER hand-edit `config.json`. If the restore still fails, the FIRST line of both the SUMMARY and
  the return message must say native Steam installs were left in the wrong state in the operator's
  real profile, and why.

F. Write `evidence/region-checks.txt`. The verify parses its shape, so follow it exactly.
- Four verdict lines, each on its own line and each followed by indented evidence lines:
  - `FACT F1 off-copy VERDICT=<PASS|FAIL|NOT SCORED>`
  - `FACT F2 off-container VERDICT=<...>`
  - `FACT F3 on-copy VERDICT=<...>`
  - `FACT F4 on-container VERDICT=<...>`
- The evidence lines under each copy fact:
  - `DEEPEST_EXPECTED_COMPARE`;
  - the `SEGMENT_LEN` and whether the U+0027 and U+2014 positions matched;
  - `COMPARE_ALT`, `EXPECTED_HITS`, `ALT_HITS`, and the negative-control counts;
  - the shared probe's in-dialog counts;
  - the transient result.
- The evidence lines under each container fact:
  - a `BASIS=DOM-READ|STRUCTURAL|n/a` line;
  - the DOM read summary;
  - `DIALOG_HEADING_NODES`, `THIRD_PARTY_HITS` and `FFFC_BEFORE_SEGMENT`;
  - the visual observation;
  - the source-census reference.
- Then `ARMING` lines for each sub-branch: the key read-back, the replica COUNT and its EXISTS path,
  and the `findmnt` result for `on`.
- Then `CORROBORATION` lines: no dropdown, `COMBO_BOX_COUNT` 0, and the other copy absent.
- Then any `ANOMALY` lines.
- The LAST line is `RESULT=<word>`.

G. Scoring. Exactly one verdict per fact. Do not retry to get a different answer.
- COPY (F1, F3):
  - PASS when the text instrument is VALID for `k`, `DEEPEST_EXPECTED_COMPARE` is `EXACT` (or
    `NEWLINE_ONLY`, recorded as an instrument artifact), `COMPARE_ALT` is `MISMATCH`, `ALT_HITS` is
    0 in the settled read, and (for `on`) no scored transient was found.
  - FAIL when any of these holds with arming proven:
    - the other copy rendered (`ALT_HITS` of at least 1 settled, or a scored transient);
    - the expected copy is present but MISMATCHES in any codepoint (quote the index, both
      codepoints and both lengths);
    - no notice rendered at all at settle.
  - NOT SCORED when:
    - the arming was not proven;
    - the text instrument is unavailable or INVALID for `k` (the visual cannot give an exact
      comparison, and "never by eye" rules it out);
    - the dialog could not be opened or fully viewed;
    - the rendered text is not English;
    - the arming was contradicted;
    - the operator declined, or the sub-branch was descoped.
- CONTAINER (F2, F4):
  - PASS with BASIS=DOM-READ when the inspector shows the notice text inside an element whose class
    includes `infoBox`, no node on its path carries a ThirdPartyDialog class, AND the structural
    checks agree.
  - PASS with BASIS=STRUCTURAL when the DOM read was unavailable or failed for a recorded reason,
    AND all of these hold:
    - the source census holds;
    - `DIALOG_HEADING_NODES` is 0, `THIRD_PARTY_HITS` is 0 and `FFFC_BEFORE_SEGMENT` is 1 (when the
      text instrument is VALID);
    - the visual shows the `.infoBox` shape and none of the `.thirdPartyNotice` marks.
  - FAIL when any of these holds:
    - the DOM read shows another container;
    - any ThirdPartyDialog class, header string, checkmark icon or bordered box appears;
    - no notice rendered with arming proven.
  - NOT SCORED when no container evidence could be gathered.
- RESULT, computed from the four verdicts and never chosen:
  - PASS when all four are PASS;
  - FAIL when any is FAIL;
  - NOT SCORED when all four are NOT SCORED;
  - otherwise PARTIAL.
- `38-S16` stays OPEN under every RESULT.

H. The honest limits, stated in the record:
- the `t()` defaults equal the catalogue, so an exact match cannot tell a served catalogue value
  from a fallback default;
- the class name comes from the Web Inspector (DOM-READ) or from source plus structure
  (STRUCTURAL); name which, for each sub-branch;
- `hostPlatform` = `'linux'` is established by source (`src/preload/tauriAttach.ts:77`) and by
  host, and the row-7 shape itself excludes `darwin` and `win32`;
- `libraryCount` was corroborated by the replica and by the absent dropdown, not read from the
  webview;
- the KNOWN RESIDUAL (native ON with ZERO libraries renders O) was not exercised, because this
  host's primary library always exists;
- the burst interval bounds the shortest detectable flash;
- the text instrument sees what WebKitGTK exposes to AT-SPI, not the DOM;
- there was no operator eyeball;
- nothing was dispatched;
- the target's `/mnt/PopGames` side was not re-checked while unmounted;
- the Windows/row-5 half is still not scored, which is why the item stays open.

I. Cleanup. ALWAYS run this, including after any STOP. Order matters.
- Confirm the restore in E happened, or has been recorded as failed.
- Send `kill -TERM` to the negative `setsid` PGID AND, separately, to the sidecar's PGID. Before
  signalling the sidecar group, confirm with `ps -o pid,args -g <pgid>` that it holds only this
  run's sidecar.
- Wait up to 20 seconds, then `kill -KILL` whatever remains of either group.
- Kill the REAL inhibitor PID. `gnome-session-inhibit -l` must no longer list this task's app id.
- Bracketed-pattern `pgrep -af` must find no `[g]amelib-shell`, `[b]uild/main/sidecar.js` or
  `[t]auri dev`, and no `[v]ite` whose args contain this repo's path. `ss -Hltn '( sport = :5173 )'`
  must be empty. Record the final census.
- Do NOT stop the Steam client. Do NOT read or delete the dev vault. Do NOT touch the mount here:
  that is Task 4.
- Delete the scratchpad bursts, dumps, full grabs and transcript once the evidence is copied out.

J. Evidence. Write it into this quick task's `evidence/`.
- PNGs, per sub-branch: `pre-open-<k>.png`, `dialog-settled-<k>.png`, `dialog-crop-<k>.png`,
  `notice-crop-<k>.png`, `inspector-<k>.png` (DOM read only), and `transient-<k>-<ms>.png` for any
  kept frame. Once each: `settings-native-on.png` (or `-off`) and `settings-native-restored.png`.
- `notice-copy.txt` has three parts:
  - the `selftest` output;
  - the Task 1 tracer's summary line;
  - for each `k`, a `SUBBRANCH=<k>` block holding the negative-control summary lines and the full
    SB-5 `copy` output.
- `atspi-dialog-subtree.txt` holds, for each `k`, the dialog-subtree lines, both `regions` tables and
  the VALIDITY verdict. Where the instrument was UNAVAILABLE or INVALID, write one line saying so
  and why.
- `burst-summary.txt`, per `k`:
  - fps, interval and click epoch;
  - the settle-diff max and its frame;
  - the post-transition flagged frames with their classification;
  - the notice's late-mount latency;
  - any `clients` new windows, with PID, exe basename, WM_CLASS and title.
- `region-checks.txt` and `log-excerpt.txt`.
- Privacy gate:
  - VIEW every PNG. Crop or drop any that shows a Steam account name, avatar, SteamID or e-mail.
    Inspector crops must show only the DOM rows near the selected node and the path bar.
  - OS paths such as `/home/graysonmitchell/...` and `/mnt/PopGames/...`, the drive UUID, and the
    OS user name in a polkit journal line are NOT Steam account identifiers. They already appear in
    committed planning text.
  - No text file may contain a 17-digit run, or a hit for the credential regex in this task's
    verify.

K. Records. Use scoped Edits only; never Write an existing file. Substitute the RESULT word, `SDATE`,
`SKEY`, `PRE_SHA` and the measured values. Counts are the UNCHANGED `O`, `D`, `R`.

`38-VERIFICATION.md`, ALL outcomes, IN PLACE:
- FIRST write `ledger_inplace_check.cjs` in this quick task's directory (Node, CommonJS, js-yaml
  from the repo's `node_modules`, read-only). Its header comment says what it proves, and names
  Phase 38 sitting 9 and quick 260929-tmw.
  - Flags: `--rev SHA` and `--key NAME` (both required); `--id ID` (default `38-S16`); `--file PATH`
    (default the Phase 38 `38-VERIFICATION.md`).
  - It loads the frontmatter twice: from `git show SHA:PATH` and from disk. The frontmatter is the
    lines strictly between the first line that is exactly `---` and the next line that is exactly
    `---`.
  - It prints PASS or FAIL for each check, and exits 1 on any FAIL:
    - `top-keys`: same top-level keys, same order;
    - `top-values`: every top-level value except `human_verification` is deep-equal (compare the
      JSON strings). This covers `score`, `human_verification_discharged` and
      `human_verification_retired`;
    - `open-ids`: same ids, same order;
    - `other-open-entries`: every open entry except the `--id` one is deep-equal;
    - `key-absent-at-rev`;
    - `key-added`: on disk, `--key` is the entry's SECOND key (directly after `id`), and its value
      is a non-empty string;
    - `entry-otherwise-unchanged`: the disk entry with `--key` removed is deep-equal to the rev
      entry, key order included.
- NEGATIVE CONTROL, before editing: run it with `--rev $PRE_SHA --key $SKEY`. It must exit 1 with
  `key-added` as its ONLY FAIL. Record that output in the SUMMARY.
- The edit: insert ONE line, `    <SKEY>: "<text>"`, directly after `  - id: "38-S16"` and before
  `    sitting_1_2026_09_23:`. This mirrors `38-S14`, whose newer `sitting_5_...` key sits above
  its `sitting_1_...` key.
- The value is double-quoted, with no inner double quote and no backslash. It opens
  `LINUX/ROW-7 HALF <RESULT> -- sitting 9, <SDATE>, LINUX (the fourth Linux sitting). ITEM STAYS
  OPEN:` and then states:
  - that the item is scored on BOTH matrix rows 5 and 7, that its own `prior_state` says a
    single-branch run does not discharge it, and that the Windows/row-5 half is still NOT SCORED
    (sitting 1). So it stays in `human_verification` DELIBERATELY, the treatment `38-S14` received
    in sitting 5;
  - the host and session; the build `pnpm tauri:dev` DEBUG at `<PRE_SHA>`; identity PROVEN via PID
    and `/proc/<pid>/exe`;
  - the real-profile arm in one or two sentences, including that nothing was dispatched;
  - the game title and appId, and the route;
  - ARMING for each sub-branch:
    - the native setting's original value, the toggle and the restore, with the values read back;
    - for `on`, the replica's `COUNT=1`, its one EXISTS path, and the empty `findmnt`;
    - that `/mnt/PopGames` was temporarily unmounted by the quick orchestrator (the operator
      authenticated) to reach one library, and that the remount is recorded in
      `evidence/remount.txt`;
  - F1 to F4, each named, with its verdict and evidence. For the copy facts: the compare result
    against the named catalogue key, the length, and that the other key did NOT match. For the
    container facts: the BASIS and what it rested on;
  - the transient and late-mount results, with fps and interval;
  - the capture tool used, and why;
  - the text-instrument validity, with its controls;
  - the honest limits from H, shortened;
  - that `38-S14` and every other item were not touched;
  - the evidence directory path, and `quick 260929-tmw`.
- On NOT SCORED, the value opens `LINUX/ROW-7 HALF NOT SCORED -- sitting 9, <SDATE> ... ITEM STAYS
  OPEN:` and states why, what was observed, and the replica COUNT.
- Then run `ledger_inplace_check.cjs` (all PASS) and ledger-check (see verify).

`38-HUMAN-UAT.md`, ALL outcomes:
- Frontmatter: append one double-quoted `sessions:` string, `Sitting 9 -- <SDATE>, Linux (Pop!_OS
  22.04, X11), tauri dev build `<PRE_SHA>`, identity proven by PID -- 38-S16 Linux/row-7 half
  <RESULT>, item stays OPEN (Windows/row-5 half not scored)`.
- Set `updated:` to `<SDATE>`. Leave `source:` unchanged: `--human-uat` asserts exactly 3 entries.
- In the `## Current Test` bracket paragraph, use a multi-line `old_string` spanning from `third Linux
  sitting, scored` through `section below.]`. Before the `]`, add one sentence: Sitting 9, the
  fourth Linux sitting, scored `38-S16`'s Linux/row-7 half <RESULT> WITHOUT discharging it (the
  item also needs its Windows/row-5 half), so the ledger still holds <O> open, <D> discharged and
  <R> retired items; see the "## Sitting 9" section below. Wrap it to match the surrounding lines.
- Append at the end of the file a section headed
  `## Sitting 9 — <SDATE>, Linux (Pop!_OS 22.04, X11), `pnpm tauri:dev` at `<PRE_SHA>``.
  It contains:
  - an opening statement: the FOURTH LINUX SITTING; one item's Linux half; NOT a discharge, and why;
  - Conditions:
    - the identity proof;
    - the real-profile arm, and which earlier justifications carry over;
    - the mount state and the orchestrator's unmount, including THE TRAP;
    - arming per sub-branch, with the read-backs;
    - whether Task 2 was skipped;
    - the lock and inhibitor handling;
    - the Steam client state (informational);
    - the geometry cross-check and the capture tool chosen;
    - the instruments, with their self-tests and controls: `selftest`, the live copy tracer, the
      DOM route probe;
  - the catalogue: S and O quoted, with lengths and non-ASCII codepoints;
  - a four-row table from `region-checks.txt`, with the columns Fact, Expected, Text-tree compare,
    Container basis and evidence, Visual, and Verdict;
  - the arming corroboration and any anomalies;
  - the transient and late-mount check per sub-branch;
  - the result and ITEM STAYS OPEN;
  - an honest-limits paragraph;
  - a line that the Windows/row-5 half, `38-S14` and every other item were NOT scored;
  - a mount-restoration line naming `evidence/remount.txt` as the record of Task 4's
    operator-authenticated remount;
  - the artifact paths.
- The new section MUST NOT contain a `### <number>.` heading, or any line that starts at column 0
  with one of the two UAT item keys (the key-colon pair named in this task's verify).

`34.13-UAT.md`, on PASS, FAIL or PARTIAL only:
- Replace the `outcome:` of the receipt whose `to_item` is `"38-S16"`. Use a multi-line
  `old_string` from `to_item: "38-S16"` through its `outcome: "open — not yet run in phase 38"`,
  because that literal repeats in the file. Leave the receipt's `blocked_by:` as it is.
- The new value is double-quoted, with no inner double quote, no backslash and no apostrophe, like
  the `38-S14` receipt. It opens `PARTIAL <SDATE> by quick 260929-tmw (Phase 38 sitting 9, Linux,
  Pop!_OS 22.04, tauri dev build <PRE_SHA>) — LINUX/ROW-7 HALF <RESULT>, ITEM STILL OPEN.` It
  then states:
  - that 38-S16 REMAINS in the `38-VERIFICATION.md` human_verification array and was NOT
    discharged, because it is scored on BOTH matrix row 5 (Windows) and row 7 (Linux) and the
    Windows/row-5 half is still not scored;
  - one or two sentences with the four verdicts;
  - and it ends `Do not read this as a discharge.`
- In the body table, change `| G-D20-Q6-COPY | tauri | RELOCATED |` to
  `| G-D20-Q6-COPY | tauri | RELOCATED → **Linux/row-7 half <RESULT> in Phase 38 (<SDATE>); item still OPEN** |`.
- THE FILE-LEVEL CENSUS CANNOT SEE THIS EDIT. The frontmatter stops parsing at the pinned
  `(62:176)` error, which is BEFORE this receipt. Validate the receipt in isolation with the js-yaml
  one-liner in verify. Do NOT touch the pinned error: repairing it turns `pnpm planning-gates` red
  with a stale pin.
- On NOT SCORED, leave the receipt and the body row exactly as they are.

NOT edited, on every outcome: `score:`, `ROADMAP.md` (no count moves) and `.planning/STATE.md`.

Todos. At most one per branch, each at `.planning/todos/pending/<SDATE>-<short-slug>.md`.
- On FAIL:
  - Frontmatter keys, in this order:
    - `created: <SDATE>`;
    - a single-quoted `title` naming what rendered;
    - `found_during: Phase 38 sitting 9 (quick 260929-tmw)`;
    - `severity:`, then `platform: linux` immediately after, then `ready: live-gate` immediately
      after;
    - `area: steam-install`;
    - `files`: the code anchors.
  - Severity, bare and lowercase:
    - `major` when the wrong key rendered, no notice rendered, or the notice sat in a
      ThirdPartyDialog container (a feature is broken);
    - `medium` when the right key rendered with a codepoint drift from the catalogue (a real,
      bounded defect).
  - Body: what rendered, quoted from `notice-copy.txt` with the evidence file names; a mechanism
    hypothesis LABELLED as a hypothesis; and re-verification by re-running this sitting's SB
    procedure.
- On an UNSCORED ANOMALY: the same key order, with severity chosen from the CLAUDE.md vocabulary
  table, and a body stating it was NOT scored against `38-S16`.

L. Validate everything BEFORE committing (the verify below). Do not edit `.planning/STATE.md`.

M. Commit in ONE Bash invocation.
- `git add` the exact paths: `notice_copy_probe.py`, `ledger_inplace_check.cjs`, `evidence/`, the
  three phase files, and any todo. Do NOT add the untracked `.planning/spikes/025-*` files that were
  present at planning time.
- Check that `git diff --cached --name-only` lists only those paths, then commit.
- Message: `docs(quick-260929-tmw): Phase 38 sitting 9, fourth Linux sitting -- 38-S16 Linux half <RESULT>, item stays open`.
  End it with this session's attribution lines.
- Every path is under the prettier-ignored `.planning` tree; the verify proves that with
  `--file-info`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on && L=.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs && P38=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma && U=.planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md && . $Q/evidence/baseline.env && RESULT=$(sed -n 's/^RESULT=//p' $Q/evidence/region-checks.txt | tail -1) && test -n "$RESULT" && python3 -c "import re,sys; t=open(sys.argv[1]).read(); v=re.findall(r'^FACT F[1-4] (?:off|on)-(?:copy|container) VERDICT=(PASS|FAIL|NOT SCORED)$',t,re.M); r=t.strip().splitlines()[-1].split('=',1)[1].strip(); e='FAIL' if 'FAIL' in v else 'PASS' if v==['PASS']*4 else 'NOT SCORED' if v==['NOT SCORED']*4 else 'PARTIAL'; sys.exit(0 if len(v)==4 and r==e else 1)" $Q/evidence/region-checks.txt && node $L --open $O --discharged $D --retired $R --human-uat --open-ids "$OPEN_IDS" --includes "open:38-S16:$SKEY=LINUX/ROW-7 HALF $RESULT" --includes "open:38-S16:$SKEY=ITEM STAYS OPEN" --includes "open:38-S16:$SKEY=260929-tmw" --includes 'open:38-S16:prior_state=A single-branch run does not discharge this item.' --includes 'open:38-S16:sitting_1_2026_09_23=NOT SCORED. The Windows/row-5 branch' --includes "top:score=$O relocated items OPEN, $D discharged" && node $Q/ledger_inplace_check.cjs --rev $PRE_SHA --key $SKEY --id 38-S16 && node $L --census --expect-bad $CENSUS_BAD | grep -F '34.13-UAT.md' | grep -qF '(62:176)' && if [ "$RESULT" = "NOT SCORED" ]; then grep -q '^| G-D20-Q6-COPY | tauri | RELOCATED |' $U; else node -e 'const y=require("js-yaml"),L=require("fs").readFileSync(process.argv[1],"utf8").split("\n"),i=L.findIndex(l=>l.includes("to_item: \"38-S16\""));const o=y.load(L.slice(i-2,i+5).join("\n"));const s=o[0].outcome;if(!/^PARTIAL \d{4}-\d{2}-\d{2} by quick 260929-tmw /.test(s)||!s.includes("ITEM STILL OPEN")){console.error("38-S16 receipt outcome not parsed as PARTIAL/ITEM STILL OPEN");process.exit(1)}' $U && grep -q '^| G-D20-Q6-COPY | tauri | RELOCATED → \*\*Linux/row-7 half' $U; fi && grep -q '^## Sitting 9 — ' $P38/38-HUMAN-UAT.md && grep -q '^  - "Sitting 9 -- ' $P38/38-HUMAN-UAT.md && ! awk '/^## Sitting 9 — /{s=1} s' $P38/38-HUMAN-UAT.md | grep -Eq '^(### [0-9]+\.|expected:|result:)' && ls $Q/evidence/notice-copy.txt $Q/evidence/region-checks.txt $Q/evidence/atspi-dialog-subtree.txt $Q/evidence/burst-summary.txt $Q/evidence/log-excerpt.txt $Q/evidence/library-replica.txt $Q/evidence/mount-state.txt >/dev/null && ! grep -Eq '[0-9]{17}' $Q/evidence/*.txt $Q/evidence/baseline.env && ! grep -Eiq 'refresh.?token|access.?token|passw(or)?d' $Q/evidence/*.txt && python3 -c "import json,os,sys; d=json.load(open(os.path.expanduser('~/.config/GameLib/config.json'))).get('defaultSettings',{}); o=sys.argv[1]; c=json.dumps(d['enableSteamNativeInstall']) if 'enableSteamNativeInstall' in d else 'absent'; sys.exit(0 if c==o or (o=='absent' and c=='false') else 1)" "$ORIG_NATIVE" && test -z "$(gnome-session-inhibit -l 2>/dev/null | grep -F 'gsd-260929-tmw')" && test -z "$(pgrep -af '[g]amelib-shell|[b]uild/main/sidecar.js|[t]auri dev')" && test -z "$(ss -Hltn '( sport = :5173 )')" && pnpm -s planning-gates && for f in $P38/38-VERIFICATION.md $P38/38-HUMAN-UAT.md $U $Q/ledger_inplace_check.cjs $Q/evidence/region-checks.txt $Q/evidence/notice-copy.txt; do npx prettier --file-info $f | grep -Eq '"ignored":[[:space:]]*true' || { echo "not prettier-ignored: $f"; exit 1; }; done</automated>
  </verify>
  <done>
- Both copy sub-branches were run against a proven HEAD dev build, each armed and re-proven
  immediately before its scored open. OFF was proven by a config read. ON was proven by a config
  read-back of `true`, a replica `COUNT=1` with the one EXISTS path, and an empty `findmnt`.
- F1 to F4 each carry their own verdict and evidence:
  - the copy verdicts come from `notice_copy_probe.py copy`'s codepoint-exact comparison against
    `public/locales/en/gamelib.json`, with the other key shown NOT to match and a 0/0 negative
    control before each open;
  - the container verdicts name their basis;
  - `region-checks.txt`'s RESULT follows from the four verdicts by the fixed rule.
- `38-S16` is STILL in `human_verification`:
  - it has one new `SKEY` key directly after `id:`, and nothing else changed
    (`ledger_inplace_check.cjs` all PASS against `PRE_SHA`, after a recorded pre-edit negative
    control that failed ONLY on `key-added`);
  - the counts, the open ids and audit-uat `by_phase['38']` are FLAT;
  - `score:` is unchanged.
- `38-HUMAN-UAT.md` has the sessions entry and a parser-safe `## Sitting 9`. On PASS, FAIL or
  PARTIAL, `34.13-UAT.md`'s receipt parses in isolation as PARTIAL / ITEM STILL OPEN, and its
  pinned `(62:176)` error is unchanged. On NOT SCORED, both the receipt and the body row are
  untouched.
- `enableSteamNativeInstall` reads back as `ORIG_NATIVE`.
- No process from this run survives, including the sidecar's own group and the real inhibitor.
  Nothing listens on :5173.
- The Steam client, the dev vault and `libraryfolders.vdf` are untouched, and no install was
  dispatched.
- Committed evidence passes the privacy gate, and `pnpm planning-gates` is green.
- `/mnt/PopGames` is still unmounted at this point, by design: Task 4 remounts it.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: Remount `/mnt/PopGames` at its fstab mountpoint. The operator authenticates, because polkit requires it. Then prove the operator's two-library steady state is back with the right PATHS, not only the right count, and commit that proof</name>
  <read_first>
    - .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/evidence/mount-state.txt (device, UUID, fstab line, polkit values, THE TRAP)
    - .planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/evidence/library-replica.txt (sitting 8's pre-unmount EXISTS set, the restore target)
  </read_first>
  <action>
CHECK AND SKIP FIRST.
- Run `findmnt -n -o TARGET,OPTIONS -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309`.
  - If the target is already exactly `/mnt/PopGames`, someone has already remounted it. Skip
    straight to ON RESUME.
  - If it is mounted somewhere ELSE (for example `/media/graysonmitchell/7ca4a725-...`), do NOT
    unmount it yourself; that also needs the operator's authentication. Include it in the pause
    below.
- Run `udisksctl info -b /dev/nvme0n1p3`. `IdUUID` must be `7ca4a725-1bb4-4e38-8f76-bad1fc803309`.
  If Task 1 recorded a moved device node, use that node instead. If no block device carries the
  UUID, mount nothing and pause.
- The fstab line for the UUID must still name `/mnt/PopGames`.
- Try exactly ONE non-interactive mount: `udisksctl mount -b /dev/nvme0n1p3 --no-user-interaction`.
  - Planning measured `filesystem-fstab` as `auth_admin_keep`, and the orchestrator's own unmount
    needed the operator to authenticate. So this is EXPECTED to be refused with a
    `NotAuthorizedCanObtain` error. Record the error text in the scratchpad.
  - If it succeeds instead, go to ON RESUME without pausing.
- Never run `sudo`, never pipe or supply credentials, and never run the mount WITHOUT
  `--no-user-interaction`. That would pop an authentication dialog on the operator's screen that
  they did not start.
- Otherwise pause for the operator.

ON RESUME, after the operator's reply, or directly from a skip:
- `findmnt -n -o TARGET,OPTIONS -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309` must print exactly one
  line, with TARGET exactly `/mnt/PopGames`, and OPTIONS including `nosuid` and `nodev` (the fstab
  options, which proves the fstab entry was used).
- Run the replica. Append its output to `evidence/library-replica.txt` under
  `# Task 4 POST-REMOUNT <ISO time>`. It must print:
  - `BRANCH: PARSED` and `COUNT=2`;
  - `access=ok` on both `PROBE` lines;
  - an EXISTS set equal to the EXISTS set in sitting 8's committed replica output:
    `~/.steam/debian-installation` and `/mnt/PopGames/SteamLibrary`;
  - and it must NOT show `/media/graysonmitchell/7ca4a725-1bb4-4e38-8f76-bad1fc803309/SteamLibrary`
    as EXISTS.
- If the mount landed anywhere else, record it and pause again with the same instructions. Do not
  try to fix it.
- Write `evidence/remount.txt`, whatever the outcome. It holds:
  - the pre-check readings;
  - the non-interactive attempt and its error text;
  - what the operator reported doing, or that they declined;
  - the `findmnt` target and options after the remount;
  - the replica's `COUNT` and EXISTS set;
  - the EXISTS-set comparison against sitting 8;
  - a final line, `REMOUNT=restored` or `REMOUNT=NOT restored (<reason>)`.
  Say "authenticated", never the name of any credential.
- If the operator declines or it cannot be restored, the FIRST line of the SUMMARY and of the return
  message must say `/mnt/PopGames` was left UNMOUNTED, and give the command to fix it.
- Commit `evidence/remount.txt` and `evidence/library-replica.txt` in one Bash invocation, after
  checking `git diff --cached --name-only` lists only those two paths. Message:
  `docs(quick-260929-tmw): record /mnt/PopGames remount after Phase 38 sitting 9`, ending with this
  session's attribution lines.
- Then write the SUMMARY.
  </action>
  <instructions>
The sitting is finished and recorded. One thing is left: your games drive.

Before this task started, the quick orchestrator unmounted `/mnt/PopGames` (you authenticated that),
so GameLib would see exactly one Steam library. The executor has tried to mount it back
non-interactively, and polkit refused, as expected: mounting a system (fstab) drive needs your
authentication. Please do ONE of:
1. In a terminal, run `udisksctl mount -b /dev/nvme0n1p3` and authenticate when prompted. It should
   print `Mounted /dev/nvme0n1p3 at /mnt/PopGames`.
2. Or open Files and click "LinuxGames" in the sidebar, authenticating when asked. That entry comes
   from the same fstab line, so it also mounts at `/mnt/PopGames`.

Please do NOT mount it anywhere else by hand, such as a `/media/...` path. Steam's
`libraryfolders.vdf` also registers this same drive under
`/media/graysonmitchell/7ca4a725-1bb4-4e38-8f76-bad1fc803309/SteamLibrary`. A mount there would look
like "two libraries again" while being the wrong path.

Nothing in GameLib needs restarting. Steam may take a moment to notice the library is back.

You may instead reply "decline". The drive then stays unmounted, and the SUMMARY's first line says
so, with the command above.
  </instructions>
  <verification>`findmnt -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309` gives target exactly `/mnt/PopGames`, with `nosuid,nodev` among its options. The replica prints `BRANCH: PARSED` and `COUNT=2`, and its EXISTS set equals sitting 8's (`~/.steam/debian-installation`, `/mnt/PopGames/SteamLibrary`). `evidence/remount.txt` ends `REMOUNT=restored`, and both evidence files are committed. Or the operator declined, `remount.txt` ends `REMOUNT=NOT restored`, and the SUMMARY's first line says so.</verification>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on && RP=.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/steam_library_replica.cjs && H8=.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/evidence/library-replica.txt && test "$(findmnt -n -o TARGET -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309)" = /mnt/PopGames && findmnt -n -o OPTIONS -S UUID=7ca4a725-1bb4-4e38-8f76-bad1fc803309 | grep -q nosuid && OUT=$(node $RP) && echo "$OUT" | grep -qx 'COUNT=2' && echo "$OUT" | grep -qx 'BRANCH: PARSED: vdf has libraryfolders, candidates filtered by existsSync' && ! echo "$OUT" | grep -Eq '^[0-9]+ EXISTS /media/' && diff <(grep ' EXISTS ' $H8 | cut -d' ' -f2- | sort -u) <(echo "$OUT" | grep ' EXISTS ' | cut -d' ' -f2- | sort -u) && grep -q '^# Task 4 POST-REMOUNT' $Q/evidence/library-replica.txt && tail -1 $Q/evidence/remount.txt | grep -qx 'REMOUNT=restored' && ! grep -Eiq 'refresh.?token|access.?token|passw(or)?d' $Q/evidence/remount.txt && test -z "$(git status --porcelain -- $Q/evidence)"</automated>
  </verify>
  <resume-signal>Type "mounted" once `/mnt/PopGames` is mounted, or "decline", or describe what happened.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| live app, real profile -> committed repo evidence | Screenshots, AT-SPI text, inspector crops and window titles from the operator's real Steam session cross into a public repo |
| this task -> the operator's real GameLib settings | `enableSteamNativeInstall` is flipped for one open and must come back to its recorded original value |
| native installs ON -> real library disks | While ON, one wrong click or keypress starts a real depot download into `~/.steam/debian-installation` |
| running binary -> recorded build identity | What ran can differ from what the record claims (the sitting-5 stale-build incident) |
| ledger edit -> gsd-core audit-uat | One YAML slip silently removes Phase 38 from the audit. A mistaken MOVE would silently discharge a half-run item |
| this task -> the operator's mount state | The drive was unmounted for this sitting and must come back at the RIGHT mountpoint. Both directions need the operator's polkit authentication |
| this task's process tree -> the operator's desktop | The dev servers, a separately-grouped sidecar and the idle inhibitor can outlive the task |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260929-tmw-01 | Information disclosure | evidence PNGs, inspector crops, `notice-copy.txt`, `atspi-dialog-subtree.txt` | high | mitigate | Captures are window-region only. Settings captures are cropped to the toggle row, and inspector captures to the DOM rows near the selected node plus the path bar. Every PNG is VIEWED, and cropped or dropped if it shows an account name, avatar, SteamID or e-mail. `notice_copy_probe.py` prints only matching nodes and their ancestor chains, never a whole-tree dump. Whole-window dumps and full grabs stay in the scratchpad and are deleted. The Task 3 verify fails on any 17-digit run or on the credential regex. |
| T-260929-tmw-02 | Information disclosure | `/tmp/gamelib-dev-secret-vault.json`, `~/.steam` token files | medium | accept | This is the by-design DEV-ONLY vault on a single-user host. It is never read, printed or copied; only its mode is recorded. The replica reads only `libraryfolders.vdf` under `~/.steam` and one `config.json` key. |
| T-260929-tmw-03 | Tampering | operator's `enableSteamNativeInstall` | high | mitigate | `ORIG_NATIVE` is read before launch and verified unchanged by Task 1. The setting is flipped through the UI exactly once, as late as step D, and restored FIRST in step E, before any teardown, with a read-back. If the app died, it is relaunched to restore; `config.json` is never hand-edited. The Task 3 verify fails unless the key reads back as `ORIG_NATIVE`, and a failed restore must lead both the SUMMARY and the return message. |
| T-260929-tmw-04 | Tampering | accidental native depot download | high | mitigate | While native is ON: no keyboard input reaches any GameLib or inspector surface (the primary Install button is `autoFocus`), and only the listed clicks are made. The caret menu is VIEWED before the burst clicks the item, and the menu-item point is AT-SPI-derived. The right-click for the DOM read targets the notice TEXT, at least 40px from INSTALL. Install is never clicked, in either state. The ACCIDENTAL DOWNLOAD RULE cancels through GameLib's own control and lists leftovers without deleting Steam files. |
| T-260929-tmw-05 | Repudiation / Tampering | recorded build identity, arming and the copy verdict | high | mitigate | `_NET_WM_PID` -> `/proc/<pid>/exe` must equal `src-tauri/target/debug/gamelib-shell`, and the tree must be clean for `src src-tauri package.json` at launch. `PRE_SHA` is recorded, and no deep links are used. Arming is re-proven before EACH open (config read-back, replica, `findmnt`). The copy verdict is a committed, mechanical, codepoint-exact comparison whose logic is self-tested, whose live read is traced on a known string, and whose discrimination is shown live by the OFF/ON pair and by the 0/0 negative controls. |
| T-260929-tmw-06 | Tampering | `38-VERIFICATION.md` / `38-HUMAN-UAT.md` / `34.13-UAT.md` frontmatter, including an accidental discharge | high | mitigate | `ledger_inplace_check.cjs` proves against `PRE_SHA` that exactly one key was added to `38-S16`, directly after `id`, and that NOTHING else in the frontmatter changed. It runs pre-edit as a negative control. `ledger-check.cjs` asserts FLAT counts, unchanged open ids including `38-S16`, the preserved `prior_state` and `sitting_1` text, an unchanged `score:`, and live audit-uat. The 34.13 receipt is parsed IN ISOLATION. `pnpm planning-gates` runs, and the new HUMAN-UAT section is grep-checked for item-shaped lines. |
| T-260929-tmw-07 | Denial of service | orphaned `gamelib-shell`, sidecar, vite and inhibitor processes | medium | mitigate | Both the `setsid` PGID and the sidecar's own PGID are recorded at launch and killed TERM then KILL; the sidecar group is confirmed to be this run's before signalling. The REAL inhibitor PID (its exe, not a shell wrapper) is recorded and killed. The verify asserts no bracketed-pattern match, an empty :5173 and no listed inhibitor. Cleanup runs on every STOP path. |
| T-260929-tmw-08 | Tampering / Denial of service | the operator's mount state: `/mnt/PopGames` left unmounted, or remounted at the udisks default path | high | mitigate | Task 4 is a blocking checkpoint that always runs, even after a FAIL or NOT SCORED. Its verify requires `findmnt` TARGET to be exactly `/mnt/PopGames` with the fstab `nosuid` option, and the replica's EXISTS set to equal sitting 8's pre-unmount set, which rejects the `/media/.../7ca4a725-...` trap that a count alone would pass. A decline or failure leads the SUMMARY's first line with the command to fix it. |
| T-260929-tmw-09 | Elevation of privilege | polkit authentication for mount and unmount | high | mitigate | Claude never runs `sudo`, never supplies or pipes credentials, and makes exactly one mount attempt, with `--no-user-interaction`, so no authentication dialog is raised on the operator's behalf. Only the operator authenticates, through their own terminal or the Files sidebar. |
| T-260929-tmw-10 | Tampering | the Web Inspector as a write path into the live DOM | medium | mitigate | The inspector is opened only through "Inspect Element" and closed only through its own close button. Nothing is typed into it, no node, attribute or style is edited, and its console is never clicked. The DOM read happens AFTER the text-tree and visual reads of the same sub-branch, so any layout change it causes cannot contaminate them. |
| T-260929-tmw-11 | Tampering | GameLib's Steam library cache while the drive is unmounted | low | accept | Games installed on `/mnt/PopGames` may show as not installed during the sitting. No Install, Uninstall or Repair is clicked on any game. Installed state is re-derived from ACFs on the next sync after the remount. |
| T-260929-tmw-12 | Tampering | Steam-side state (`libraryfolders.vdf`, the client) | low | mitigate | Claude never edits `libraryfolders.vdf` (Steam rewrites it anyway) and never stops or drives the Steam client. Task 1 records whether the vdf's registered set changed since sitting 8, and does not repair it. |
| T-260929-tmw-13 | Denial of service | the operator's screen-lock behaviour | low | accept | `gnome-session-inhibit --inhibit idle` suppresses idle-lock only while its process lives. It changes no setting, is killed in step I, and its absence is verified. |
</threat_model>

<verification>
- Task 1 verify:
  - the screen is unlocked, and `selftest` passes;
  - the capture tool finds the window, and the shell PID's exe is proven;
  - the log sink exists;
  - ledger-check passes on the LIVE `baseline.env` counts, with `38-S16` open and its `prior_state`
    intact;
  - the replica reproduces `LIB_COUNT`;
  - `mount-state.txt` and the container census exist, and the five instrument decisions are
    recorded;
  - `enableSteamNativeInstall` is still `ORIG_NATIVE`;
  - every new file is proven prettier-ignored.
- Task 2: skipped on a live check of the lock, sign-in and the replica, or the operator's resume
  signal, re-checked with `find`, a viewed `grab` and a replica re-run.
- Task 3 verify: one command covers every outcome.
  - RESULT is consistent with the four verdicts.
  - The ledger counts are FLAT, the open ids are unchanged, and the annotation is present.
  - `ledger_inplace_check.cjs` passes.
  - The census pin is unchanged.
  - The 34.13 receipt and body row match the RESULT branch.
  - The HUMAN-UAT section is parser-safe.
  - The evidence exists and passes the privacy gate.
  - The native setting is restored, no process survives, and planning-gates is green.
- Task 4 verify: `findmnt` target, options and replica EXISTS set match the pre-unmount steady
  state, `remount.txt` records `REMOUNT=restored`, and the evidence is committed.
- Across the whole task: audit-uat `by_phase['38']` stays exactly `AUDIT38`, and `total_items` stays
  `TOTAL`. A CHANGE in either would mean the item was moved.
</verification>

<success_criteria>
- The ledger states a true, evidenced Linux-half result for `38-S16`, IN PLACE, on an entry that is
  still open. It is backed by:
  - a proven build identity;
  - two sub-branch armings proven independently of the dialog;
  - codepoint-exact copy comparisons against the catalogue, with live discrimination between the
    two keys;
  - container verdicts with a named basis;
  - a transient and late-mount check.
- `38-S16` remains open, because its Windows/row-5 half is unscored. Nothing else in the ledger
  changed.
- The operator's native-install setting is back to its original value, and a read proves it.
- `/mnt/PopGames` is back at `/mnt/PopGames` with the pre-sitting library set, or the SUMMARY's
  first line says it is not.
- Phase 38 stays audit-visible with `status: human_needed`. The counts agree across the ledger,
  `audit-uat` and `38-HUMAN-UAT.md`.
- Nothing from this run is left running. Nothing committed identifies the operator's Steam account.
  Nothing was installed.
- The SUMMARY records:
  - every re-measured baseline value from `baseline.env`;
  - the mount state before the sitting, and the remount outcome;
  - the replica output from Task 1, from each pre-open re-run, and after the remount;
  - whether Task 2 was skipped, and why;
  - the geometry cross-check and the capture tool chosen;
  - the lock and inhibitor handling;
  - the `selftest`, the tracer and the DOM-route results;
  - the text instrument's validity per sub-branch;
  - the fps, interval, settle-diff result and late-mount latencies;
  - the native-setting round trip, with its values;
  - the `ledger_inplace_check.cjs` negative control;
  - that the Windows/row-5 half of `38-S16` and all of `38-S14` still need the Windows machine.
</success_criteria>

<output>
Create `.planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/260929-tmw-SUMMARY.md` when done.
</output>
