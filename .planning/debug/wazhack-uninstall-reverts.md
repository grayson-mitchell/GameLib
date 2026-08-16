---
slug: wazhack-uninstall-reverts
status: awaiting_human_verify
trigger: "trid to uninstall Wazhack on electron build... said uninstalling but nothing happend (after 'completed' revered back to looking like is installed"
created: 2026-08-16
updated: 2026-08-16T21:50:00Z
goal: find_and_fix
live_access: yes — operator is at the keyboard on an Electron build and can re-run the uninstall, paste logs, and inspect disk
runtime: Electron (NOT Tauri)
---

# Debug Session: WazHack uninstall reverts to installed

## Symptoms

**Expected behavior:** Triggering Uninstall on the Steam title "WazHack" removes it from disk
and the library entry permanently flips to not-installed (Install button returns).

**Actual behavior:** The UI shows an "uninstalling" state, then reports completion — and the
entry reverts to looking installed. Nothing observably happened.

**Error messages:** None. No error banner, toast, or notification of any kind. Operator has
not yet checked the log file or DevTools console. Operator did NOT report seeing a "Game
Uninstalled" success toast, but did not explicitly rule one out.

**Timeline:** Observed 2026-08-16 on a freshly built Electron build of branch
`fix/steam-native-install-stability` (HEAD 2531e66f6). Confirmed by the orchestrator that all
four uninstall fixes from the 2026-08-15 `steam-bottle-uninstall-reverts` session are
ancestors of HEAD: 539bc979c, 60e89349a, cc320f258, fa9051a9e. So the running build DOES
contain `resolveInstallRoot()` and the layer-6 every-root survivor probe.

**Reproduction:** Launch the Electron build, open WazHack (Steam), trigger Uninstall from the
game page.

**Not yet established (operator answered "haven't checked"):**
- Whether WazHack's files are still on disk (native root, CrossOver bottle root, bridge root)
- Whether any other Steam title uninstalls correctly right now — only WazHack was tried, so
  scope (WazHack-specific vs general uninstall regression) is UNKNOWN. Do not assume either.

## Prior Art — READ BEFORE FORMING A HYPOTHESIS

### 1. `.planning/debug/resolved/steam-bottle-uninstall-reverts.md` (resolved 2026-08-15)

Same surface symptom ("says uninstalling, then reverts back to installed"), one day old, on
the Tauri runtime with a bottle-installed Windows title. Six layers found and fixed. The
layer most likely to be implicated here:

**LAYER (6), commit fa9051a9e — SELF-VERIFIED ONLY, NEVER LIVE-VERIFIED.**
`pollUninstallOnce()` (`src/backend/storeManagers/steam/library.ts`) now probes EVERY install
root except the one just uninstalled from (fixed order: native, bottle, bridge). When it finds
a surviving copy it **deliberately keeps `is_installed: true`**, re-resolves
`install_path`/`install_size`/`platform` to that survivor, and **skips the "Game Uninstalled"
toast**. That behaviour — badge stays installed, no toast, no error — is an exact match for
the reported symptom. It is correct behaviour IF a copy genuinely survives, and a bug if the
probe produces a false positive (e.g. a stale/leftover directory, a shared depot dir, an
empty-but-present folder, or a root-containment mismatch).

Its own resolution notes flag the precedent explicitly: on 2026-08-15 the operator reported
"did not flip", and investigation proved the badge was CORRECT because a third copy survived.
**Do not assume this is a bug before establishing what is actually on disk.** Equally, do not
assume it is correct — layer 6 was never live-verified.

Also relevant from that session: `uninstall()` routes on `library.get(appId)?.install?.install_path`
via `resolveInstallRoot()`, and **refuses, deleting nothing, when that resolves to null**. A
null resolution would produce a silent no-op with no error — also consistent with the symptom.

### 2. Memory: parked session `uninstall-game-vanishes` (2026-07-22)

WazHack is the exact title from that session. Recorded facts about it: `title='WazHack'`,
`is_mac_native=True`, `is_delisted=False`. That session's symptom was the inverse (entry
vanishes until refresh) and its root cause was never found; seven hypotheses were eliminated.
Two adjacent bugs were confirmed and deliberately NOT fixed there:
1. `SteamLibraryManager.refresh()` has no concurrency guard (observed double-firing).
2. `fetchMetadataIfNeeded()` treats Steam Store `{success:false}` as permanent `is_delisted`.

The temporary diagnostics from that session were reverted in cc320f258 (already on branch).

### 3. Project hazard: two install paths

`.planning` and memory both record the known two-install-paths hazard (native macOS Steam vs
CrossOver bottle vs GameLibSteamBridge bottle). WazHack being mac-native means the native root
is the expected owner, but a leftover copy on another root is precisely what layer 6 hunts for.

## Investigation Constraints

- Runtime is **Electron**, not Tauri. Sidecar-specific gotchas do not apply, but note that
  under Electron `MigrationSystem`/`whenReady()` inits DO run (the opposite of the Tauri case).
- `graphify-out/graph.json` exists — run `graphify query "<question>"` to orient before
  grepping or reading source files.
- Do NOT run `git stash` under any circumstances (a concurrent session's work has been
  stranded by this twice before).
- Never accept a mutating call's own success report as proof; verify on disk and in the
  persisted `steam_library.json`.

## Current Focus

> Rounds 1-4's `reasoning_checkpoint*` blocks (below the divider) are
> preserved as history, unedited. Round 5 (below the second divider, near
> the end of this file, right before "Relationship to
> steam-native-false-completion.md") holds the FINAL, settled
> reasoning_checkpoint — root cause confirmed by the Round 4 live retry,
> fix (a) implemented and RED/GREEN-proven. THIS block now reflects the
> session's live state.

reasoning_checkpoint: "See Round 5's reasoning_checkpoint (near the end of
  this file) for the final, confirmed-and-fixed state. Summary: root cause
  is the 'restart Steam to finish installing' notify() being structurally
  unreachable for the StateFlags=4 fast path (gated on the 1026-only
  isFullyInstalledStateFlags/downloading branch). Fixed by adding the same
  notify() call, gated on the already-correct isNativeHandoff signal, to
  the 'installed' branch of pollInstallOnce()."
test: "Self-verification complete this round: a RED-then-GREEN jest test
  proving the gate was unreachable pre-fix and reachable post-fix, the
  full steam suite, tsc --noEmit, and eslint. See Round 5's 'Verification'
  subsection for exact pass/fail counts."
expecting: "Self-verification PASSED — 1154/1154 steam suite tests, tsc
  clean, eslint 0 errors, RED proof confirmed pre-fix / GREEN confirmed
  post-fix. A full live re-test of the NEW notification firing in a real
  Electron build was assessed optional (the underlying mechanism is already
  live-confirmed by the Round 4 uninstall retest) and was NOT performed —
  left to operator discretion."
next_action: "AWAITING OPERATOR REVIEW. All changes are self-verified but
  UNCOMMITTED in the working tree (per instruction — do not commit until
  the operator reviews). Operator should: (1) review the diff in
  src/backend/storeManagers/steam/library.ts and
  src/backend/storeManagers/steam/__tests__/library.test.ts, (2) decide
  whether a live re-test (fresh native fast-path install, observe the new
  'Restart Steam to finish installing' toast) is wanted before commit, and
  (3) confirm the Round 1 toast fix should be committed as-is (Round 5
  recommends KEEP — see that section). Once confirmed, archive this session
  per the debug protocol's archive_session step (move to resolved/, append
  to knowledge-base.md, commit)."

---

## Round 1 (2026-08-16, initial investigation) — HISTORICAL, superseded by
## Round 3 below; preserved verbatim for the record.

reasoning_checkpoint:
  hypothesis: "GameLib's native-uninstall routing/delegation for WazHack (appId
    264160) is CORRECT and working exactly as designed (resolveInstallRoot ->
    'native' -> shell.openExternal('steam://uninstall/264160') ->
    startUninstallPolling). Native macOS Steam DOES receive and 'execute' the
    URL every time (Steam's own console_log.txt logs ExecuteSteamURL for each
    attempt) but never renders any visible confirmation dialog/sheet/window —
    an external, native-Steam-client-side failure outside GameLib's code,
    confirmed live twice independently (by me, and separately by the operator
    in a concurrent session). Because no confirmation is ever observed,
    pollUninstallOnce()'s grace-window timeout correctly refuses to flip the
    badge (D-02) — but startUninstallPolling()'s grace-window-timeout branch
    sends ONLY a bare gameStatusUpdate{status:'done'} with ZERO user-facing
    notify()/toast, so the user experiences a totally silent revert
    indistinguishable from 'nothing happened at all'. THIS silence is the
    actionable, in-scope root cause of the reported symptom ('said
    uninstalling but nothing happened... reverted back') — not a routing bug."
  confirming_evidence:
    - "On-disk ground truth: WazHack (264160) exists ONLY on the native macOS
      root (~/Library/Application Support/Steam/steamapps/common/WazHack,
      112M, appmanifest_264160.acf StateFlags=4/fully-installed). Exhaustive
      search of both CrossOver bottles (GameLibSteam, GameLibSteamBridge)
      found zero WazHack manifests or directories. This rules out the
      layer-6 dual-install-survivor hypothesis entirely for this case — there
      is no survivor to (mis)detect."
    - "steam_library.json (persisted cache) matches disk exactly: is_installed
      true, install.install_path pointing at the native root, size 111.99
      MiB — the cache is telling the truth; nothing was ever deleted."
    - "gamelib.log: routing chose 'source native' each time (three attempts:
      20:10:14, 20:10:37, 20:15:47), matching resolveInstallRoot()'s
      documented behavior for a native-only title. Every attempt ends with
      'uninstall polling ... stopped after grace window (20 ticks) — no
      uninstall detected; user may have cancelled'."
    - "Steam's OWN log (~/Library/Application Support/Steam/logs/console_log.txt)
      shows ExecuteSteamURL: steam://uninstall/264160 at timestamps matching
      EVERY GameLib delegation attempt, including two I fired manually via
      `open steam://uninstall/264160` during live investigation — proving
      Steam's client genuinely receives and processes the URL each time."
    - "Live reproduction (twice, independently): fired steam://uninstall/264160
      with native Steam already running, main window open/frontmost, on BOTH
      the Store tab and the Library tab (WazHack visible in the list, status
      'Installed 111.99 MiB'). Screenshots taken at 0.5s/1.5s/2.5s/4.5s
      intervals after firing show ZERO visual change — no dialog, no sheet,
      no window, no status change — in any frame. System Events AX query
      corroborates: zero windows ever appear for the steam_osx process."
    - "Independent confirmation from a concurrent operator session (observed
      via screenshot of the operator's own VS Code/Claude Code terminal,
      already mid-investigation of this exact bug): operator's own words —
      'no steam checker appeared (is possibility that it did appear but did
      not come to the surface)... did try again though and then checked with
      control centre that window was not open... was not on second try.'
      Independently corroborates zero visible confirmation UI across
      multiple real attempts."
    - "This is explicitly NOT a repeat of the CrossOver CW_USEDEFAULT
      off-screen-dialog defect from the resolved sibling session — that
      defect is bottle/Wine-specific. WazHack's uninstall used the NATIVE
      macOS Steam client the whole time (steam_osx, not a CrossOver bottle
      process)."
    - "The exact same code path (native delegation + poller) is LIVE-CONFIRMED
      working for a different title (Hoard) one day earlier in the sibling
      session — dialog appeared, uninstall completed in 3s. This rules out a
      categorical GameLib routing/URL-construction defect; the delegation
      mechanism itself is sound."
    - "protocol.ts (GameLib's own OS protocol handler) only parses
      `gamelib://` URLs — it has no registration for or handling of `steam://`
      at all, ruling out a self-interception/recursive-loop hypothesis for
      why the dialog never surfaces."
    - "Code read of startUninstallPolling()'s grace-window-timeout branch
      (library.ts ~2477-2488): on timeout it calls
      sendFrontendMessage('gameStatusUpdate', {status:'done'}) and
      stopUninstallPolling() — no notify()/toast call anywhere in this
      branch, unlike the confirmed-complete path in pollUninstallOnce() which
      DOES call notify() with i18next.t('notify.uninstalled', 'Game
      Uninstalled'). The frontend has no way to distinguish 'genuinely done'
      from 'gave up waiting' from this signal alone."
  falsification_test: "If the grace-window-timeout branch already surfaced a
    distinct user-facing notification, the reported symptom ('said
    uninstalling but nothing happened') would not match — the user would have
    seen SOME message explaining the outcome, even if Steam's dialog itself
    never appeared. It doesn't (confirmed by direct code read), so the
    hypothesis holds."
  fix_rationale: "Cannot fix Steam's own native client failing to render its
    own confirm dialog — that is outside this codebase (D-05, established in
    the sibling session, deliberately keeps Steam owning its native confirm
    UI; unilaterally switching native uninstalls to direct-deletion, bypassing
    Steam's dialog the way bottle installs now do, is a bigger product/safety
    decision requiring explicit operator sign-off, not something to change
    inside a debug fix). What IS fixable and directly addresses the complained-
    of symptom: telling the user, via the existing notify() toast mechanism
    already used elsewhere in this same file, that Steam never confirmed the
    uninstall when the grace window expires — turning a silent, confusing
    revert into an explained one. Minimal, additive, mirrors the existing
    completion-toast pattern exactly."
  blind_spots: "Have NOT determined WHY native Steam's confirm dialog fails to
    render for WazHack today when the identical mechanism worked for Hoard
    yesterday (Steam client update, per-title Steam UI state, cloud-save
    warning variant, the 'Downloads Paused - 1 Item Queued' footer state
    observed in every screenshot, or something else) — flagging as an open
    upstream/environmental question, explicitly NOT re-diagnosing further
    since it sits outside GameLib's code and a live differential test against
    Hoard would require destructively uninstalling a real owned game without
    the operator's explicit consent (declined to do this unilaterally). Have
    not verified whether the new notify() message could itself be mistaken by
    the user for a real error when Steam's dialog DID appear off-screen and
    the user simply hasn't clicked it yet (wording will phrase this as
    'not confirmed' / 'try again', not 'failed')."
test: "Implement the notify() fix in startUninstallPolling()'s grace-window
  timeout branch, run the steam suite + tsc + eslint, then request the
  operator re-run Uninstall on WazHack and confirm the new message appears
  when Steam's dialog goes unconfirmed."
expecting: "A distinct, honest toast/notification appears every time the
  grace window expires without a confirmed uninstall, replacing today's
  totally silent revert. Existing confirmed-uninstall and dual-install-
  survivor paths (which already have their own correct notify()/no-notify()
  behavior) are unchanged."
next_action: "Awaiting human verification: ask the operator to re-run Uninstall
  on WazHack in a rebuilt Electron build and report (a) whether a distinct
  'Uninstall not confirmed by Steam' notification now appears after the grace
  window instead of a silent revert, and (b) whether a Steam confirmation
  dialog becomes visible at all this time (still an open, unexplained
  question outside this fix's scope)."

---

## Round 2: Reopened question — does steam://uninstall/ work at all on native
## macOS Steam? (operator-directed, 2026-08-16, post-checkpoint)

> **⚠ RETRACTED 2026-08-16T21:15:00Z (Round 3, operator-supplied control-test
> evidence).** The central conclusion below — "steam://uninstall/<appid> is
> NOT a reliable mechanism ... a general property of the verb ... on this
> Steam client" — is UNSUPPORTED and is withdrawn. Do not act on it.
>
> **Why:** the operator ran the missing control test this round's own
> `blind_spots` flagged as the cleanest possible discriminator — uninstalling
> WazHack from literally inside Steam's own UI (mouse, no `steam://` URL
> involved at all). Result: **Steam's own UI reports WazHack as NOT INSTALLED
> and does not even offer an uninstall option.** `libraryfolders.vdf`
> confirms this independently: its "apps" map lists 19 appids for this
> library and 264160 (WazHack) is not one of them, even though
> `appmanifest_264160.acf` (StateFlags 4, fully populated) and the real
> `WazHack.app` payload both exist on disk.
>
> All 6 real-world `steam://uninstall/264160` firings this round and Round 1
> counted as evidence of "the verb does nothing" were firing at an appId
> Steam has **no registered install of at all**. A no-op is the CORRECT,
> expected response for uninstalling something Steam doesn't believe it owns
> — it is not evidence the verb is broken, dead, or unreliable in general.
> The `steam://open/games` control proved the OS-level dispatch mechanism
> works; it did not, and could not, control for "is this app registered as
> installed", which is the variable that actually explains every zero-effect
> firing recorded below. The verb-reliability question remains genuinely
> open and untested — it would require firing at an appId Steam DOES have
> registered (one of the 19 in `libraryfolders.vdf`), which was not done and
> is not recommended without the game's owner's explicit consent, since it
> is destructive.
>
> The evidence entries and reasoning below are preserved verbatim as the
> historical record of what was actually observed (the observations
> themselves — receipt/logging by Steam, zero visible UI reaction, zero
> `content_log.txt` entries — are all still true and valid); only the
> **interpretation** ("this proves the verb is broken") is retracted. See
> Round 3 below for the corrected interpretation and the revised root cause.

reasoning_checkpoint_round2:
  hypothesis: "steam://uninstall/<appid> fired externally (from GameLib via
    shell.openExternal(), or from a bare terminal `open` command — identical
    OS-level dispatch path) is received and logged by native macOS Steam's URL
    dispatcher (ExecuteSteamURL in console_log.txt) but does not reliably
    produce ANY downstream action — no confirmation dialog, no window, no
    content_log.txt state-machine entry, no focus change. This is a general,
    reproducible property of this verb when invoked externally, not specific
    to WazHack, not specific to GameLib, and not specific to macOS (matches
    independently-documented Linux community reports of the identical
    behavior via the identical verb fired from a bare terminal)."
  confirming_evidence:
    - "BUG in the ROUND-1 investigation's own tooling found first: the AX
      window queries in Round 1 targeted `process \"steam_osx\"` — but
      steam_osx is Steam's native launcher/backend process; the actual
      CEF-based UI windows belong to a DIFFERENT process, `process \"Steam
      Helper\"` (confirmed live: `tell process \"steam_osx\" to get name of
      every window` returns empty even while Steam's Library window is
      demonstrably open and visible on screen; `tell process \"Steam Helper\"
      to get name of every window` returns the real window list, e.g. `Steam,
      bunnzy`). This means Round 1's AX-query corroboration ('zero windows
      ever appear for the steam_osx process') was structurally guaranteed to
      return empty regardless of Steam's actual state and provides NO
      evidence either way. It does not overturn Round 1's conclusion, because
      Round 1's actual ground truth was the SCREENSHOT checks, not the AX
      query — but it is a real tooling defect worth recording so it isn't
      repeated."
    - "Differential test through the IDENTICAL dispatch mechanism GameLib
      uses (shell.openExternal() / macOS `open <steam:// url>`): fired `open
      \"steam://open/games\"` first. Result: Steam (process 'Steam Helper')
      became frontmost=true, and a screenshot immediately confirmed a real,
      visible UI reaction — Steam's Library/Home page rendered on screen,
      fully interactive. This proves the steam:// protocol dispatch mechanism
      itself is NOT broken in this environment — Steam demonstrably CAN
      receive and act on an externally-fired steam:// URL with a visible
      result."
    - "Immediately after, fired `open \"steam://uninstall/264160\"` through
      the exact same mechanism. Result: console_log.txt logged
      'ExecuteSteamURL: steam://uninstall/264160' (received/parsed, as in
      every prior attempt) but Steam's frontmost/visible flags stayed
      false/false — it did NOT grab focus this time, unlike the nav verb
      seconds earlier. Manually re-activating 'Steam Helper' and
      screenshotting showed Steam still on the exact same Library/Home page
      as before firing — no confirmation dialog, no sheet, no navigation, no
      change of any kind. content_log.txt (Steam's own content state
      machine, the established ground-truth log for this investigation) has
      ZERO entries for 264160 before or after (grep count = 0); its only
      recent entries are for a different, unrelated appID (63000) from the
      prior day."
    - "This directly replicates and extends Round 1's already-completed
      'bypass GameLib entirely' test (fired manually via bare `open` twice in
      Round 1, zero visual change both times) — now with a same-session,
      back-to-back differential against a verb PROVEN to work through the
      identical dispatch path, and with corrected process-name tooling. The
      isolation is now verb-specific and mechanism-independent: nav works,
      uninstall does not, through the same code path, same session, same
      Steam client instance, same title state."
    - "Web research corroboration (Valve/Steam community, not GameLib- or
      macOS-specific): multiple independent reports describe the identical
      failure signature for steam://uninstall/<appid> fired from a bare
      terminal — on Linux, 'the process doesn't actually uninstall the game -
      Steam just downloads the manifest and returns \"Nothing to do\"'.
      Separately: 'the new Steam UI forces an uninstall confirmation prompt
      to be displayed in the browser-rendered new Library UI... [the URL]
      just automates the UI, and if there's a UI issue it will fail.' This
      matches our reproduction exactly — the verb is received, but its
      success depends on internal Steam UI/client state that an externally-
      fired URL does not reliably satisfy, and this is documented as a
      cross-platform (not macOS-only) Valve-side characteristic, not
      something any third-party launcher's URL construction can control or
      fix."
  falsification_test: "If steam://uninstall/264160 had produced ANY of: a
    frontmost/focus grab (like the nav verb did), a new/changed window, a
    content_log.txt entry for 264160, or a visibly different screenshot —
    the 'verb does nothing when fired externally' hypothesis would be false.
    None of these occurred, across 6 total real-world firings now (Round 1:
    2 manual + 3 via GameLib; Round 2: 1 more manual), all with 100%
    consistent zero-effect results."
  fix_rationale: "N/A — this round is diagnostic only, per operator
    instruction. No code change proposed or made. The toast fix from Round 1
    remains untouched and uncommitted in the working tree, per operator
    instruction."
  blind_spots: "Have NOT tested a second native-root title (Test 2 from the
    operator's discriminating-test list) — this remains a real gap in
    strictly ruling out a WazHack-specific manifest/depot corruption as a
    contributing factor. However, the differential (working nav verb vs
    non-working uninstall verb through the identical mechanism, same
    session) plus the independent cross-platform community reports of the
    identical failure signature for the SAME VERB on a DIFFERENT title/
    platform (Linux, arbitrary appid) substantially reduce how much a
    second-title test would add — the leading explanation is now a
    general Steam-side verb reliability issue, not a WazHack-specific one.
    Did not find a definitive Valve changelog/bug-tracker entry proving this
    is a KNOWN, ACKNOWLEDGED regression (only community forum/GitHub-issue
    reports) — so 'Valve has fixed this in some version/configuration we
    are not running' cannot be fully ruled out, though nothing in this
    session's evidence supports that being the case here. Have not
    determined whether firing uninstall from literally inside Steam's own
    UI (right-click a game row > Manage > Uninstall, done by a human with
    the mouse, not via any steam:// URL at all) succeeds — that would be
    the cleanest possible control test to isolate 'protocol-fired URLs
    specifically' from 'the uninstall feature is broken in this Steam
    installation entirely', but was not requested and was not performed."
  recommendation_for_operator: "steam://uninstall/<appid> is NOT a reliable
    mechanism for triggering a real uninstall when fired externally (via
    shell.openExternal() or a bare `open` command) on this Steam
    installation — it is logged as received but never observed to produce
    any downstream UI or content-state-machine effect, across 6 consistent
    real-world attempts, and this matches independently-documented Valve/
    Steam community reports of the same verb failing the same way on a
    different platform. This is a general property of the verb in this
    class of invocation, not a WazHack-specific or GameLib-specific defect —
    delegation to Steam's own confirm dialog (D-05) can never reliably
    complete a native uninstall this way, for ANY native title, on this
    Steam client. RECOMMENDATION: extend the direct-deletion pattern
    GameLib already ships for bottle-installed titles
    (`.uninstallBottleGameDirectly()`, src/backend/storeManagers/steam/
    games.ts ~L2174) to native installs as well, with GameLib owning its own
    confirmation dialog before deleting the install directory and updating
    the ACF manifest directly — since Steam cannot be relied upon to ever
    render its own confirmation UI for this verb. This is a product/scope
    decision requiring explicit operator sign-off and is NOT implemented in
    this session, per instruction. If the operator wants to fully close the
    WazHack-specific-vs-general gap before committing to that decision, the
    single highest-value remaining test is trying Manage > Uninstall from
    directly inside Steam's own UI with the mouse (no steam:// URL involved
    at all) — if that ALSO silently fails for WazHack, it points at this
    specific Steam installation/title rather than the verb-when-externally-
    fired theory; if it succeeds, that would sharpen the finding to
    'externally-fired URLs specifically' rather than 'uninstall generally'."

## Evidence

- timestamp: 2026-08-16T20:15:00Z
  checked: All three known install roots for WazHack (264160) — native macOS
    Steam steamapps/common, CrossOver bottle GameLibSteam steamapps, CrossOver
    bottle GameLibSteamBridge steamapps — plus their appmanifest .acf files,
    and the persisted steam_library.json cache entry.
  found: WazHack exists ONLY on the native root
    (~/Library/Application Support/Steam/steamapps/common/WazHack, 112M,
    appmanifest_264160.acf StateFlags=4/fully-installed). No manifest or
    directory for 264160 anywhere in either bottle. steam_library.json matches
    disk exactly (is_installed true, install_path = native root, 111.99 MiB).
  implication: Rules out the layer-6 dual-install-survivor hypothesis for
    this case entirely — there is nothing on another root for pollUninstallOnce()
    to (mis)detect as a survivor. The persisted cache is truthful; nothing was
    ever deleted.

- timestamp: 2026-08-16T20:16:00Z
  checked: ~/Library/Logs/GameLib/gamelib.log for all WazHack (264160)
    uninstall activity.
  found: Three attempts (20:10:14, 20:10:37, 20:15:47), each logging
    "delegating uninstall for appId 264160 via steam://uninstall/264160" with
    "starting uninstall polling ... source native" — confirming
    resolveInstallRoot() correctly chose 'native' every time (matches its
    documented behavior for a native-only title). Each attempt ends with
    "uninstall polling ... stopped after grace window (20 ticks) — no
    uninstall detected; user may have cancelled" and NO other message.
  implication: Routing and delegation are correct; the poller correctly
    detected no confirmation each time. Multiple attempts strongly suggest the
    operator retried after seeing no feedback — consistent with the reported
    symptom.

- timestamp: 2026-08-16T20:17:00Z
  checked: Native Steam's own log,
    ~/Library/Application Support/Steam/logs/console_log.txt.
  found: "ExecuteSteamURL: steam://uninstall/264160" logged at timestamps
    matching every GameLib delegation attempt, PLUS two more matching manual
    `open steam://uninstall/264160` invocations fired directly from this
    investigation.
  implication: Steam's client genuinely receives and processes the URL every
    single time — this is not a case of the URL never reaching Steam.

- timestamp: 2026-08-16T20:18:00Z-20:23:00Z
  checked: Live reproduction — fired `open steam://uninstall/264160` twice,
    independently, with native Steam already running: once with Steam's main
    window on the Store tab (frontmost, visible), once with Steam's main
    window on the Library tab with WazHack's row directly visible in the game
    list ("Installed 111.99 MiB"). Screenshots captured at 0.5s/0.8s/1.5s/
    2.5s/4.5s after each firing.
  found: Zero visual change in any frame — no confirmation dialog, no sheet,
    no status change, nothing. A `System Events` AX query for steam_osx's
    window list returned empty both before and after firing, and even after
    explicitly `open -a Steam` to guarantee the app was foregrounded.
  implication: Native macOS Steam is NOT rendering any visible confirmation
    UI for this steam://uninstall verb in this environment, regardless of
    which tab is showing or whether the window is already frontmost. This is
    NOT the CrossOver CW_USEDEFAULT bottle-specific off-screen-dialog defect
    from the resolved sibling session — this is the native steam_osx client.

- timestamp: 2026-08-16T20:19:00Z
  checked: A concurrent, independent operator session already investigating
    this same bug (observed via a screenshot that incidentally captured the
    operator's own VS Code/Claude Code terminal window).
  found: Operator's own words, replying to a question about whether a Steam
    confirmation dialog appeared: "no steam checker appeared (is possiblity
    that it did appear but did not come to the surface)... did try again
    though and then checked with control centre that window was not open...
    was not on second try."
  implication: Independent, human, first-hand confirmation of the same
    finding — across multiple real attempts, no Steam confirmation window
    was ever observed to appear. Corroborates the live reproduction above.

- timestamp: 2026-08-16T20:20:00Z
  checked: src/backend/protocol.ts (GameLib's own OS protocol-URL handler,
    full file).
  found: Only parses and handles `gamelib://` URLs (`parseHeroicUrl` requires
    `args.startsWith('gamelib://')`); no registration, listener, or handling
    of the `steam://` scheme anywhere in this file or its imports.
  implication: Rules out a hypothesis that GameLib itself intercepts/re-fires
    its own outgoing steam://uninstall URL via a self-registered protocol
    handler — there is no such handler for that scheme.

- timestamp: 2026-08-16T20:21:00Z
  checked: src/backend/storeManagers/steam/games.ts uninstall() (full native-
    routing branch) and the resolved sibling session's design notes (D-05).
  found: Native delegation is `shell.openExternal(steamProtocolUrl) +
    startUninstallPolling()` — deliberately does NOT show a GameLib-owned
    confirmation dialog; Steam is meant to own that UI (D-05, established
    2026-08-15). The identical code path is LIVE-CONFIRMED working for a
    different title (Hoard) one day earlier — dialog appeared, completed in
    3s.
  implication: The delegation mechanism/URL construction is proven sound in
    general; today's WazHack failure is either title-specific, Steam-client-
    state-specific, or a genuine (unexplained) Steam-side regression — not a
    GameLib routing defect.

- timestamp: 2026-08-16T20:24:00Z
  checked: src/backend/storeManagers/steam/library.ts,
    startUninstallPolling()'s grace-window-timeout branch (~lines 2474-2488
    pre-fix) versus pollUninstallOnce()'s confirmed-complete branch
    (~lines 2363-2381).
  found: The confirmed-complete branch calls `notify({title, body:
    i18next.t('notify.uninstalled', 'Game Uninstalled')})`. The grace-window-
    timeout branch called ONLY `sendFrontendMessage('gameStatusUpdate',
    {status:'done'})` — no notify()/toast anywhere. The frontend derives its
    badge purely from `is_installed` once any non-active status arrives, so
    both branches look byte-for-byte identical to the user apart from the
    (missing) toast.
  implication: This is the concrete, in-scope, actionable root cause of the
    reported symptom — a silent grace-window timeout that is indistinguishable
    from "nothing happened", regardless of why Steam's own dialog never
    surfaced.

- timestamp: 2026-08-16T20:29:00Z
  checked: Implemented fix (see Resolution) + ran
    `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t
    startUninstallPolling`, full `npx jest src/backend/storeManagers/steam`,
    `npx tsc --noEmit -p .`, `npx eslint` on both changed source files.
  found: New test passes (3/3 in that describe block); full steam suite
    1152/1152 pass (0 regressions, 1 new test); tsc clean; eslint 0 errors
    (pre-existing warning baseline unchanged, including the same i18next-
    default-export warning style already present at the other 3 i18next.t()
    call sites in this file).
  implication: Fix is self-verified. Live/human verification of the toast
    appearing in a real uninstall attempt remains open (see Resolution).

- timestamp: 2026-08-16T20:36:00Z
  checked: AX process name used by Round 1's window queries. Queried `tell
    application "System Events" to get name of every process whose visible is
    true` and separately `tell process "steam_osx" to get name of every
    window` vs `tell process "Steam Helper" to get name of every window`,
    while Steam's Library window was visibly open on screen (confirmed by
    screenshot).
  found: `process "steam_osx"` returns an EMPTY window list even while
    Steam's Library window is demonstrably open, visible, and frontmost on
    screen. The real window list ("Steam", "bunnzy") is owned by `process
    "Steam Helper"` (the CEF-based UI renderer), not steam_osx.
  implication: Round 1's AX-query corroboration ("zero windows ever appear
    for the steam_osx process") checked the wrong process and was
    structurally guaranteed to return empty regardless of Steam's real state
    — it is not valid evidence, though Round 1's actual conclusion survives
    because it was independently supported by screenshots, not the AX query.

- timestamp: 2026-08-16T20:36:12Z
  checked: Fired `open "steam://open/games"` (a verb known to work, through
    the same OS-level dispatch mechanism shell.openExternal() uses) and
    observed process state + a screenshot.
  found: Steam ("Steam Helper" process) became frontmost=true within ~1s;
    screenshot confirmed Steam's Library/Home page rendered live on screen,
    fully interactive (visible game list, "Downloads Paused - 1 Item Queued"
    footer, etc).
  implication: The steam:// external-dispatch mechanism is proven working in
    this environment for at least one verb — rules out a categorical
    "protocol dispatch broken" explanation for the uninstall verb's silence.

- timestamp: 2026-08-16T20:37:05Z
  checked: Immediately after, fired `open "steam://uninstall/264160"` through
    the identical mechanism; checked console_log.txt, content_log.txt
    (grep -c "264160"), Steam Helper frontmost/visible flags, and a
    screenshot after manually re-activating Steam.
  found: console_log.txt logged "ExecuteSteamURL: steam://uninstall/264160"
    (received/parsed, consistent with every prior attempt). Steam Helper's
    frontmost/visible flags were false/false immediately after (did NOT grab
    focus, unlike the nav verb seconds earlier). content_log.txt has ZERO
    entries for 264160 (grep count 0); its most recent entries are for an
    unrelated appID (63000) from the prior day. Screenshot after manual
    reactivation showed the exact same Library/Home page as before firing —
    no dialog, sheet, or any visible change.
  implication: Same-session, back-to-back differential against a proven-
    working verb through the identical dispatch path: nav works, uninstall
    does not. This is now verb-specific evidence, not a general dispatch
    failure, not an artifact of checking the wrong AX process, and not
    explainable by GameLib's own code (bypassed entirely — fired from a bare
    terminal). Sixth consistent real-world zero-effect firing of this verb
    across both rounds of this session.

- timestamp: 2026-08-16T21:28:00Z
  checked: Operator-performed diagnostic (quit Steam fully, relaunch,
    recheck libraryfolders.vdf's apps map) — the Round 3 blind_spots'
    recommended next step, reported via checkpoint response, cross-checked
    against this round's own understanding of the file formats.
  found: Steam's own native UI now shows WazHack as installed.
    ~/Library/Application Support/Steam/steamapps/libraryfolders.vdf's apps
    map now contains "264160" "117426878" — the byte value matches
    appmanifest_264160.acf's SizeOnDisk exactly. The ACF itself is otherwise
    untouched by Steam: StateFlags still "4", MountedDepots still empty,
    LastUpdated still the same Aug 13 value as Round 3's read — Steam
    scanned and registered the existing manifest verbatim rather than
    rewriting it. Corroborating: appid 63000 (Hoard) dropped OUT of the apps
    map (consistent with a sibling session's native uninstall the prior
    day), and 718850/1124300 had their sizes refreshed — both signs this was
    an ordinary startup rescan picking up real filesystem state, not an
    anomalous or partial adoption.
  implication: Confirms GAMELIB_HANDOFF_STATE_FLAGS's own doc comment
    (Round 3 evidence) was accurate even for the StateFlags=4 fast path, not
    just the 1026 handoff case: a full Steam client restart is sufficient to
    adopt an externally-authored, previously-orphaned manifest. This closes
    Round 3's open blind_spot on that question. It also independently
    confirms buildAppManifestText()'s output was valid and Steam-acceptable
    all along (Steam adopted it byte-for-byte, unmodified) — the manifold
    itself was never the defect, only the missing adoption signal was.
    Critically, this also removes the confound that made Round 2's six
    steam://uninstall/264160 firings uninterpretable: WazHack is now a
    Steam-registered app, so a fresh uninstall attempt is now a valid test
    of the verb itself, not a guaranteed no-op against an unregistered app.

- timestamp: 2026-08-16T21:35:00Z
  checked: The Round 4 pre-registered prediction's decisive live retry —
    operator triggered Uninstall on WazHack from GameLib's own UI (production
    call shape), then ground truth was cross-checked against disk rather than
    trusting GameLib's own on-screen report, per this session's standing
    verification rule.
  found: Operator reports "uninstalled successfully". Disk cross-check:
    ~/Library/Application Support/Steam/steamapps/appmanifest_264160.acf is
    GONE; .../steamapps/common/WazHack is GONE. An exhaustive search of every
    Steam root plus both CrossOver bottles for *264160*/WazHack* returns only
    ordinary owned-but-uninstalled residue (appcache/librarycache,
    appcache/stats, userdata/.../264160, userdata/.../ugc/
    264160_subscriptions.vdf, the bottle's own appcache/librarycache) — no
    surviving install anywhere.
  implication: The Round 4 prediction is CONFIRMED, not merely
    self-reported. Failure mode (A) (dialog/deletion never happens) and (B)
    (poller fails to flip the badge) are both ruled out. This is the first
    genuinely controlled test of steam://uninstall/264160 against a
    Steam-registered WazHack, and it succeeds end-to-end through the exact
    same code path (resolveInstallRoot -> native -> shell.openExternal ->
    startUninstallPolling -> pollUninstallOnce) that produced six consecutive
    no-ops earlier in this session against the unregistered app. Round 2's
    retracted "steam://uninstall is broken on macOS" finding is now closed
    WITH the control it originally lacked: the verb works correctly against a
    registered title; the six earlier no-ops were Steam-correct behavior
    against an unregistered one. GameLib's own uninstall state machine
    (routing, delegation, polling, survivor probe, badge flip, toast) needed
    zero changes — it was correct throughout. The sole actionable defect is
    upstream of uninstall entirely: nothing ever told the user, at INSTALL
    completion time, that Steam still needed a restart to adopt a
    fast-path-completed native manifest.

- timestamp: 2026-08-16T21:36:00Z
  checked: libraryfolders.vdf's "apps" map, re-read immediately after the
    Round 4 uninstall completed and the files were confirmed gone (previous
    entry), cross-referenced against file mtimes and a running-process check
    for Steam.
  found: libraryfolders.vdf STILL contains `"264160" "117426878"` in its
    apps map — Steam has NOT removed the entry, even though the manifest and
    payload are both confirmed gone from disk. libraryfolders.vdf's own mtime
    (21:02) predates the steamapps/ directory's mtime (21:07, when the
    uninstall actually ran) by 5 minutes. `steam_osx` (pid 75955) is still
    running.
  implication: Steam removes an app's manifest/payload immediately on
    uninstall but does NOT rewrite libraryfolders.vdf's apps map at the same
    time — it flushes that file lazily, apparently on client exit, not on
    every install/uninstall event. This means the apps map answers "has Steam
    ADOPTED this manifest at some point" reliably, but is STALE and
    UNRELIABLE for "is this currently installed" while Steam keeps running.
    Directly corroborates the earlier Hoard observation (appid 63000 dropping
    out of the map) as an on-exit flush, not a live update.
    CONSEQUENCE FOR FIX OPTION (b) (cross-checking libraryfolders.vdf as part
    of the install/uninstall state machine): if implemented as originally
    framed — as a general "is Steam aware of this install" oracle — it would
    have reported WazHack as installed for at least 5 minutes with zero files
    on disk after a genuinely successful uninstall, creating a NEW
    GameLib/Steam disagreement in the OPPOSITE direction from Round 3's
    original one. Option (b) is therefore scoped-down (never implemented this
    round): the apps map may only ever be consulted for ADOPTION detection
    (has Steam ever picked up this manifest), never as an installed/
    uninstalled-state oracle. This scoping decision is recorded here for any
    future session that revisits option (b) — it must not be reintroduced
    without this constraint.

## Round 3: Correction — orphaned ACF, GameLib-written StateFlags=4 manifest
## Steam never adopted into its own library registry (operator-directed,
## 2026-08-16, post-checkpoint, overturns Round 2)

reasoning_checkpoint_round3:
  hypothesis: "WazHack (264160) is a native Steam install that GameLib's OWN
    depot pipeline completed and finalized to StateFlags=4 full-ownership
    (Phase 23 'trustworthy 4' fast path) — but Steam's own client never
    formally adopted that manifest into its library registry
    (libraryfolders.vdf's per-library 'apps' map, the client's actual source
    of truth for 'what do I own'). GameLib's own is_installed/'installed'
    badge is derived PURELY from the ACF file's StateFlags bit and NEVER
    cross-checked against libraryfolders.vdf's apps map — so GameLib and
    Steam have been silently disagreeing about this title's install state
    since the ACF was written, each internally consistent with its own
    source of truth. Because Steam has no registration for 264160, EVERY
    uninstall attempt (steam://uninstall/264160, whether fired by GameLib or
    manually) is legitimately received, parsed, and correctly treated as
    'nothing to uninstall' — a no-op, not a verb failure. GameLib's poller
    then correctly finds the (Steam-orphaned but real) manifest still present
    after the grace window and correctly refuses to flip the badge. The
    reported symptom is fully explained without any defect in the uninstall
    verb, the delegation mechanism, or the polling logic — the defect is
    upstream, in native install finalization never confirming/forcing Steam
    library-registry adoption, or at minimum never telling the user that
    adoption didn't happen."
  confirming_evidence:
    - "Operator's own control test (Steam's native UI, mouse, zero steam://
      URLs involved): Steam reports WazHack as NOT INSTALLED and offers no
      uninstall option at all — the cleanest possible proof Steam's client
      genuinely has no record of this install, independent of any protocol
      dispatch question."
    - "Ground truth read directly off disk this round (not taken from the
      checkpoint transcript): ~/Library/Application Support/Steam/steamapps/
      libraryfolders.vdf's single library entry lists exactly 19 appids in
      its 'apps' map (8870, 8930, 35720, 57300, 63000, 73010, 91310, 107100,
      251570, 257350, 289070, 291650, 718850, 719040, 1086940, 1091500,
      1124300, 1295660, 1335830) — 264160 is absent."
    - "Ground truth read directly off disk this round: appmanifest_264160.acf
      exists, StateFlags=4, SizeOnDisk=117426878, buildid=9044149,
      LastOwner=76561197995867096, BytesToDownload==BytesDownloaded==
      117426878 (non-zero, matching), InstalledDepots has exactly one depot
      (264162, manifest 3306037234848478854, size 117426878), UserConfig={}
      empty, MountedDepots={} empty. WazHack.app itself exists on disk at
      .../steamapps/common/WazHack/WazHack.app."
    - "PROVENANCE — field-shape comparison, not inference: the on-disk ACF's
      exact field SET, ORDER, and tab-indentation depth
      (appid/Universe/StateFlags/installdir/name/LastUpdated/SizeOnDisk/
      buildid/LastOwner/BytesToDownload/BytesDownloaded/AutoUpdateBehavior/
      InstalledDepots{depotId{manifest,size}}/UserConfig{}/MountedDepots{})
      is a byte-for-byte match to
      src/backend/storeManagers/steam/depot/manifest.ts's
      buildAppManifestText() template — single-tab top level, double-tab
      nested InstalledDepots key, triple-tab manifest/size fields, empty
      UserConfig+MountedDepots blocks with those exact two keys and no
      others. This is GameLib's own hand-templated writer
      ('GameLib has only ever READ appmanifest files ... This module WRITES
      them for the first time', manifest.ts's own header comment) — real
      Steam's own internal VDF serializer is a different codebase with no
      reason to reproduce this exact whitespace/field-ordering choice. This
      directly answers checkpoint-response item 3 ('who wrote this ACF'):
      GameLib did, not Steam, not a bottled Steam client."
    - "ACF's own LastUpdated field (1786605854) converts to Thu Aug 13
      19:24:14 2026 (local) — exactly matching the .acf file's own mtime on
      disk (Aug 13 19:24) to the second. The WazHack.app payload directory
      itself is older (Jul 23 10:50) — consistent with GameLib's finalize
      step (which measures+writes SizeOnDisk/StateFlags/LastUpdated fresh
      every call, per depot.ts's finalizeToSteam/measureInstalledBytes) being
      invoked again on Aug 13 against payload bytes that had already existed
      since Jul 23 — i.e. a genuine GameLib-owned finalize event, not a
      one-off artifact."
    - "Code read: library.ts's own GAMELIB_HANDOFF_STATE_FLAGS(=1026) doc
      comment states explicitly and pre-existingly (predates this session):
      'bit 4 (FullyInstalled) is deliberately unset until Steam adopts the
      manifest, which only happens on a full Steam client restart (focusing
      the window is not enough). Steam replaces this value the moment it
      adopts the install.' This is GameLib's OWN prior, documented knowledge
      that Steam does not live-discover externally-authored manifests — it
      requires a full client restart to notice them at all."
    - "Code read: the ONLY 'restart Steam to finish installing' user
      notification (library.ts ~L1932-1943, i18n key
      steam.waitingForSteam.notify) is gated on
      `result.stateFlags === GAMELIB_HANDOFF_STATE_FLAGS (1026) &&
      poll.isNativeHandoff === true`. It is structurally UNREACHABLE for a
      StateFlags=4 write — the Phase 23 'trustworthy 4' fast path
      (canWriteFullOwnership passing at the end of a completed, fully
      sha1-verified download) writes '4' directly via finalizeToSteam,
      SKIPPING the 1026 handoff state entirely, and therefore skips this
      notification entirely too. A user whose install takes the fast path
      (the common case for a small, clean download like WazHack's 117 MB)
      gets ZERO indication that Steam still needs to notice/adopt the
      install — unlike a user on the 1026 fallback path, who does."
    - "Code read: getSteamLibraries() (backend/utils.ts) and
      clientSetup.ts/installLocation.ts's own doc comments confirm GameLib
      reads ONLY the library-folder PATH list out of libraryfolders.vdf, and
      explicitly 'NEVER authors/synthesizes' or mutates it. Nowhere in the
      codebase does GameLib parse or check libraryfolders.vdf's 'apps' map
      — the install/uninstall state machine (readAcfState, buildInstalledMap,
      pollInstallOnce/startUninstallPolling) is 100% driven by the ACF file's
      own StateFlags bit, with zero cross-check against whether Steam's own
      registry agrees the app is installed. This is why GameLib has been
      confidently, consistently correct about is_installed=true from its own
      evidence (the ACF) while being simultaneously and silently wrong about
      whether STEAM agrees — nothing in the codebase would ever have
      detected or surfaced this divergence."
    - "console_log.txt (33 total lines, Steam-managed/rotated, cannot
      establish historical restart timestamps) and content_log.txt (per
      Round 2's own evidence: zero entries for 264160, ever) both remain
      consistent with Steam never having processed 264160 through any of its
      own content/install pipelines at any point — not at Aug 13 (when
      GameLib wrote the manifest), and not since."
  falsification_test: "If Steam's own native UI (Manage > right-click,
    mouse-only, no steam:// URL) HAD shown WazHack as installed and offered
    an uninstall option, this hypothesis would be false — Steam would have a
    registration and the original silent-revert symptom would need a
    different explanation entirely (e.g. a real polling/badge bug). It did
    not; Steam's UI independently and directly confirms zero registration,
    matching libraryfolders.vdf's apps map exactly."
  fix_rationale: "N/A this round — investigation and record-correction only,
    per explicit operator instruction. No code change made. The Round 1
    toast fix remains uncommitted and untouched in the working tree; its
    wording ('please check Steam and try again') is now flagged as
    misleading for this class of defect (see below) and should not be
    committed as-is without revisiting the message."
  blind_spots: "Have NOT determined whether this is WazHack-specific (e.g. a
    one-off finalize invoked outside the normal install flow, perhaps during
    earlier debug-session investigation/testing of this exact title on
    Jul 19-23) or a GENERAL defect affecting every native install that takes
    the StateFlags=4 fast path — the code-level evidence (the restart
    notification's hard gate on stateFlags===1026 specifically) strongly
    suggests general, but this session has only directly inspected ONE
    orphaned ACF. Have NOT confirmed whether a Steam client restart, if
    performed today, would actually cause Steam to adopt this manifest and
    populate libraryfolders.vdf — GAMELIB_HANDOFF_STATE_FLAGS's doc comment
    asserts restart is sufficient for the 1026 case, but this ACF already
    reads StateFlags=4 (past the point that comment describes), and the
    machine has almost certainly had Steam relaunched at least once across
    the Aug 13 -> Aug 16 window without adopting it — this is a real gap:
    either 'restart adopts it' is false for the StateFlags=4 case too
    (untested), or Steam genuinely was never restarted in that window
    (unconfirmed either way from available logs). Testing this directly
    (quit Steam fully, relaunch, recheck libraryfolders.vdf) is the single
    highest-value next step and does not require destroying anything —
    flagging as the recommended next action rather than performing it
    unilaterally this round, since it is a live-environment action with
    unknown side effects on the operator's real Steam session."

## Round 4: Pre-registered prediction for the decisive live retry
## (operator-directed, 2026-08-16, post-checkpoint) — written BEFORE the
## operator runs the test, per explicit instruction.

reasoning_checkpoint_round4:
  hypothesis: "Now that Steam has adopted WazHack's manifest into
    libraryfolders.vdf's apps map (confirmed on-disk this round; Steam's own
    UI independently shows it installed), a fresh Uninstall triggered from
    GameLib's own UI (resolveInstallRoot -> native ->
    shell.openExternal('steam://uninstall/264160') ->
    startUninstallPolling()) will now SUCCEED end-to-end: Steam's
    confirmation dialog will render, the operator's confirmation will cause
    Steam to actually delete appmanifest_264160.acf and the WazHack.app
    payload, GameLib's poller (pollUninstallOnce()) will detect the manifest
    as 'absent' on the native root, find no survivor on either bottle root
    (none exists — see the 2026-08-16T20:15:00Z evidence entry), flip
    is_installed to false, push the updated library entry, and fire the
    confirmed 'Game Uninstalled' toast (notify() with i18next.t
    ('notify.uninstalled', ...)) — a materially different, positive outcome
    from every prior attempt in this session."
  confirming_evidence:
    - "Direct precedent through the IDENTICAL code path: the exact same
      native-delegation + poller mechanism is LIVE-CONFIRMED working for a
      different title, Hoard, one day earlier — Steam's confirm dialog
      appeared and the uninstall completed in 3s (Round 1 evidence,
      2026-08-16T20:21:00Z entry). The only variable this session's evidence
      has isolated as differing between Hoard's success and WazHack's six
      consecutive no-ops is Steam-side registration — which is now removed
      as of this round's confirmed libraryfolders.vdf adoption."
    - "Round 2's 'the verb is generally broken/unreliable' hypothesis was
      RETRACTED specifically because all six firings targeted an appId
      Steam had zero registration for — a Steam-correct no-op is the
      expected response to that precondition, not evidence against the
      verb. That precondition no longer holds for WazHack; this retry is
      the first genuine test of the verb against this title with the
      confound removed."
    - "Code read this round (library.ts L2216-2237, pollUninstallOnce()'s
      own doc comment and 'absent' branch): the badge-flip/toast logic is
      driven PURELY by whether the ACF is present or absent on disk after
      the poll, with a survivor probe across the other known roots before
      committing to 'not installed'. It has no dependency on WHY the ACF
      disappeared, HOW Steam decided to delete it, or any registration
      history — so once Steam genuinely deletes the manifest (which is now
      possible because Steam owns/recognizes this install), GameLib's own
      side of the state machine has no structural reason to behave
      differently than it did for Hoard."
    - "Operator's own report: Steam's native UI now shows WazHack as
      installed (the exact control test that, in its NOT-installed form,
      falsified nothing this round but supplied Round 3's key evidence) —
      this is the precondition Steam's uninstall feature needs to even
      OFFER the option, and by report it is now met."
  falsification_test: "This prediction is falsified by EITHER of two
    distinguishable failure modes, which point to different next steps: (A)
    Steam's confirmation dialog fails to appear or the operator confirms it
    but Steam itself never removes the ACF/payload — this would reinstate a
    genuine, now properly-controlled verb-reliability question (Round 2's
    retracted hypothesis would need to be taken seriously again, this time
    with a valid control), or (B) Steam DOES delete the manifest but
    GameLib's poller still fails to flip the badge or fire the toast
    (grace-window timeout, stuck 'uninstalling' status, or a silent revert
    identical to the original symptom) — this would point to a genuine,
    previously-unsuspected defect in pollUninstallOnce()'s own logic (e.g.
    a timing issue, a stale steam_library.json read, or a survivor-probe
    false positive against something not yet enumerated) that the on-disk
    single-root enumeration in this session did not anticipate. Success
    (dialog appears, confirms, ACF gone, badge flips, toast fires, verified
    against libraryfolders.vdf/steam_library.json/gamelib.log — not just
    GameLib's own on-screen report) confirms the prediction and closes the
    root-cause question definitively: registration gap was the sole cause,
    fix direction (a) is both necessary and sufficient."
  fix_rationale: "N/A — this round registers a prediction only, per explicit
    operator instruction. No code implemented. This block exists so the
    upcoming test result is graded against a real, timestamped prediction
    rather than rationalized after the fact."
  blind_spots: "Have not independently confirmed, this round, that Steam's
    native UI actually offers an 'Uninstall' menu option for WazHack (only
    inferred from the operator's 'Steam now shows WazHack as installed'
    report) — worth a quick glance during the retry, not a blocker. The
    upcoming retry goes through GameLib's UI/shell.openExternal(), which IS
    the production call shape (same mechanism Hoard succeeded through), but
    this is still only a SECOND registered-title data point for this verb
    on this machine, not a large sample. The 'Downloads Paused - 1 Item
    Queued' Steam footer state observed in earlier screenshots was never
    ruled out as a contributing factor to dialog non-appearance and remains
    untested as a variable — if the retry fails via failure mode (A) above,
    checking that footer state is a reasonable follow-up before concluding
    the verb itself is broken. Grace-window timing: if the operator is slow
    to click through Steam's dialog, a timeout could be misread as a fresh
    failure when it is really just human-speed lag — worth noting the
    approximate wall-clock delay between firing and confirming if the result
    is ambiguous."

## Round 5: Root cause confirmed by live test; fix (a) implemented
## (operator-directed, 2026-08-16, post-checkpoint)

The Round 4 prediction is CONFIRMED (see the 2026-08-16T21:35:00Z evidence
entry) — registration-gap was the sole cause of the WazHack-specific revert,
and GameLib's uninstall state machine required zero changes. The remaining
actionable gap is the one Round 3 already identified: native installs that
complete via the StateFlags=4 fast path give the user no signal that Steam
still needs a restart to adopt the manifest. Root cause is now settled.

reasoning_checkpoint:
  hypothesis: "The 'restart Steam to finish installing' notify() call
    (i18n key steam.waitingForSteam.notify) is the correct, already-proven
    signal for this exact problem — it already fires reliably for the 1026
    handoff path — but it is physically unreachable for the StateFlags=4
    fast path because it lives entirely inside pollInstallOnce()'s
    'downloading' branch (library.ts, gated on
    result.stateFlags === GAMELIB_HANDOFF_STATE_FLAGS (1026)). readAcfState()
    never returns state:'downloading' for a StateFlags=4 manifest — bit 4
    (FullyInstalled) is set, so isFullyInstalledStateFlags() is true and
    readAcfState() returns state:'installed' on the very first poll tick,
    routing into the DIFFERENT 'installed' branch (~L2013) which has no
    restart-notify logic at all. Making the signal reachable therefore means
    adding the same notify() call to the 'installed' branch, gated on the
    SAME already-correct provenance signal used by the 1026 case
    (poll.isNativeHandoff === true, set by games.ts's
    runNativeDepotDownload() the moment GameLib's OWN depot download
    finishes — before it's known whether the resulting ACF lands on 1026 or
    the fast-path 4) — NOT by reading libraryfolders.vdf (that's option (b),
    withdrawn/scoped per the staleness finding above)."
  confirming_evidence:
    - "Direct code read: readAcfState() (library.ts ~L1592-1654) returns
      state:'installed' whenever isFullyInstalledStateFlags(stateFlags) is
      true, unconditionally — there is no code path by which a StateFlags=4
      manifest is ever classified 'downloading', so the 1026-gated notify
      inside the 'downloading' branch can structurally never fire for it."
    - "Direct code read: games.ts's runNativeDepotDownload()
      (~L1543-1550) calls startInstallPolling(appId, { isNativeHandoff: true,
      ... }) immediately after downloadSteamDepots() finishes — BEFORE
      finalizeToSteam has decided whether the ACF lands on 1026 or 4. The
      isNativeHandoff flag is therefore an accurate 'GameLib wrote this
      manifest directly, Steam has not adopted it' signal for BOTH
      completion shapes, not just the 1026 one — it was already
      shape-agnostic, only the notify() call site wasn't."
    - "The existing 'GAME-02' test (library.test.ts) asserts notify() is
      called EXACTLY ONCE ('Installation Finished') for a StateFlags=4 poll
      with a plain (non-isNativeHandoff) startInstallPolling() call — proving
      the OFF-path (Steam owns the download) never got the restart notify
      even after this session's earlier 1026-path fix existed, corroborating
      that the gap is specifically about isNativeHandoff-true fast-path
      completions, not the 'installed' branch in general."
  falsification_test: "If a new RED test asserting notify() fires with the
    'Restart Steam to finish installing {{game}}' body on a StateFlags=4,
    isNativeHandoff:true poll PASSED against the pre-fix code, the hypothesis
    would be false (the gate would already be reachable). It did not — it
    failed with notify() showing only the 'Installation Finished' call
    (Number of calls: 1), confirming the gate really was unreachable before
    this round's change. See Verification below for the full RED-then-GREEN
    proof."
  fix_rationale: "Adds a second notify() call to pollInstallOnce()'s
    'installed' branch, gated on poll?.isNativeHandoff === true (mirroring
    the fire-once notifiedWaiting guard the 1026 branch already uses),
    reusing the EXACT SAME i18n key/fallback text
    (steam.waitingForSteam.notify) already shipped and working for the 1026
    case — no new copy, no new translation key, no behavior change to the
    OFF-path (Steam-owned download) flow, which never sets isNativeHandoff
    and is unaffected (confirmed by a dedicated regression test). This
    directly and only closes the root cause: it does not touch uninstall
    logic (already proven correct by the Round 4 live test), does not read
    libraryfolders.vdf (option (b), withdrawn), and does not add any
    orphaned-install recovery UX (option (c)/candidate 3, withdrawn/out of
    scope)."
  blind_spots: "This fix addresses installs GOING FORWARD — any native
    fast-path completion after this ships will notify the user to restart
    Steam. It does NOT retroactively repair already-orphaned installs (e.g.
    any other title in the same state WazHack was in before the operator's
    manual restart); that remains explicitly out of scope (Round 3 candidate
    3, never authorized). Self-verified only via jest/tsc/eslint this round —
    no fresh live native install was performed to observe the new toast
    firing in a real running Electron build (WazHack is already installed
    and cannot re-trigger a fresh completion without a full
    uninstall+reinstall cycle); see Verification below for why this is
    assessed as low-risk to defer."

### Fix implemented

**File:** `src/backend/storeManagers/steam/library.ts`, `pollInstallOnce()`'s
`'installed'` branch (~L2013-2069 post-fix).

Added, immediately after the existing GAME-02 "Installation Finished"
`notify()` call and before `stopInstallPolling(appId)`:

```ts
if (poll?.isNativeHandoff === true && !poll.notifiedWaiting) {
  poll.notifiedWaiting = true
  notify({
    title: existing?.title ?? '',
    body: i18next.t(
      'steam.waitingForSteam.notify',
      'Restart Steam to finish installing {{game}}',
      { game: existing?.title ?? '' }
    )
  })
}
```

No changes to: uninstall logic, the 1026-path notify (unchanged, still
inside the 'downloading' branch), translation files (reuses the existing
`steam.waitingForSteam.notify` key), or any option-(b)/(c) surface.

### Verification

- **RED proof (pre-fix):** added two new tests to
  `src/backend/storeManagers/steam/__tests__/library.test.ts` inside
  `describe('pollInstallOnce()')`, then ran
  `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t
  "Restart Steam to finish installing"` against the UNMODIFIED pre-fix
  `library.ts`. Result: **1 failed** — `notify` was called exactly once with
  `{ body: 'Installation Finished' }`; the expected second call for
  `'Restart Steam to finish installing CS:GO'` never happened ("Number of
  calls: 1"). This directly proves the gate was unreachable before the fix,
  not merely that the new test happens to pass post-fix.
- **GREEN proof (post-fix):** re-ran the same filtered test after applying
  the fix above. Result: **3 passed** (the new fast-path test, a companion
  "does NOT fire on an OFF-path poll" regression test, and the pre-existing
  1026-path test in the same filter match) — `notify` now called twice
  (`Installation Finished` then `Restart Steam to finish installing
  {{game}}` — the i18next mock in this test file returns the fallback
  string verbatim without interpolating `{{game}}`, matching this file's
  existing convention for asserting `notify()` body text at every other call
  site).
- **GAME-02 regression check:** re-ran
  `npx jest ... -t "GAME-02"` — both pre-existing tests still pass,
  confirming the OFF-path (non-isNativeHandoff) "Installation Finished"-only
  behavior is byte-for-byte unchanged.
- **Full steam suite:** `npx jest src/backend/storeManagers/steam` — **31
  suites passed, 1154/1154 tests passed** (1152 pre-existing + 2 new tests
  added this round; 0 regressions).
- **tsc:** `npx tsc --noEmit -p .` — clean, zero errors.
- **eslint:** `npx eslint src/backend/storeManagers/steam/library.ts
  src/backend/storeManagers/steam/__tests__/library.test.ts` — **0 errors,
  489 warnings**, all pre-existing baseline categories (the new call site
  adds exactly one more `import-x/no-named-as-default-member` warning of the
  same kind already present at the file's other 4 `i18next.t()` call sites —
  no new warning categories introduced).
- **Live re-test assessment:** NOT performed this round, and assessed as
  optional rather than required to close this session. The underlying
  mechanism this fix depends on (a native fast-path install completing and
  Steam successfully adopting the resulting manifest on restart) is already
  live-confirmed by the Round 4 operator test above — this fix only adds a
  notify() call using the identical, already-production-proven pattern
  (same notify()/i18next.t() call shape, same fire-once
  poll.notifiedWaiting guard, same i18n key) already shipped and working for
  the 1026 case. A live re-test would require a genuinely fresh native
  fast-path install (WazHack is already installed; observing this requires
  a full uninstall+reinstall cycle or a different, not-yet-owned title) —
  recommended as a nice-to-have follow-up, not a blocker, and left to the
  operator's discretion.

### Round 1 toast fix — final recommendation: KEEP, commit as-is

Re-examined `"Uninstall not confirmed by Steam — please check Steam and try
again"` (the grace-window-timeout toast in `startUninstallPolling()`)
against everything now known:

- Its PRIMARY use case — Steam's confirm dialog appeared and the user
  canceled it, or was too slow to confirm within the grace window — is
  unaffected by anything this session found, and the wording is accurate for
  it: Steam genuinely has a record, checking Steam and retrying genuinely
  works.
- Round 3 flagged it as misleading specifically for the ORPHANED-install
  case: a user checks Steam, finds the game not even listed, and "try again"
  offers no path forward. Fix (a) directly closes the gap that let installs
  become orphaned-and-silent in the first place — going forward, every
  native fast-path completion now gets an explicit, distinct "Restart Steam
  to finish installing" notification at INSTALL time, before the user ever
  reaches an uninstall attempt. A user who restarts Steam when prompted
  never reaches the orphaned-uninstall scenario this toast's wording was
  worried about.
- A residual edge case remains: a user could dismiss/ignore the new
  install-time restart notification and immediately attempt an uninstall
  before ever restarting Steam. In that narrow, self-inflicted case, "check
  Steam and try again" is still not actively harmful — checking Steam would
  show the game as not-installed, which is itself informative even if the
  wording doesn't anticipate it directly. Rewording to cover this residual
  case would be UX polish (effectively option (c) territory), not a
  correctness fix, and is out of this session's authorized scope.
- Given fix (a) is a GENERAL fix (applies to every native fast-path install
  going forward, not just WazHack), the orphaned-install precondition this
  toast's wording was worried about should become rare for any install
  completed after this fix ships.

**Recommendation: keep the toast as originally written and commit it as-is
alongside fix (a).** No further edit to its wording or the translation key
is proposed this round.

## Relationship to .planning/debug/steam-native-false-completion.md

Read in full this round per instruction. **Not the same defect — a sibling
in the same feature area (Steam native install finalization) but a distinct
failure mode, and that session is unrelated to fixing this one.**

- That session's reported symptom was a DOWNLOAD reported complete at ~50%
  bytes (Hogwarts Legacy, multi-depot) — a premature/false COMPLETION
  concern. It was resolved `not-a-bug`: the real install was on the
  CrossOver-bottle path (a real Steam client owns that download), and the
  user had simply navigated away and misread an accurate later completion
  as premature. No code change was made in that session.
- This session's defect is different in kind: the install genuinely,
  accurately, fully completed (StateFlags=4 is honest here — all bytes
  present, sha1-verified per the completeness gate) on GameLib's OWN native
  depot-download path (not the bottle path) — the problem is entirely
  AFTER completion, in Steam's client never being told/never noticing that
  a new, real, complete install now exists on disk.
- One directly useful, reusable fact carried over from that session: its
  own evidence recorded that "bottled real-Steam manifests omit
  BytesToDownload/BytesDownloaded fields" whereas GameLib's native writer
  always includes them. That distinction is exactly what this session used
  (independently, via direct template comparison) to prove WazHack's
  orphaned ACF was GameLib-authored, not Steam-authored — corroborating,
  not duplicating, that prior finding.

## Revised Root Cause (supersedes Round 1 and Round 2)

WazHack's native Steam install genuinely and correctly completed via
GameLib's own depot-download pipeline (Phase 23 StateFlags=4 full-ownership
fast path — confirmed honest: real payload on disk, sha1-verified,
BytesToDownload==BytesDownloaded, complete InstalledDepots). GameLib wrote
`appmanifest_264160.acf` directly to Steam's `steamapps/` directory
(confirmed by exact field-template match to
`depot/manifest.ts`'s `buildAppManifestText()`) — but Steam's own client
never adopted that manifest into its library registry
(`libraryfolders.vdf`'s per-library `apps` map), which is Steam's actual,
independent source of truth for "what is installed", separate from and never
cross-checked against the raw ACF file. Steam's own native UI independently
confirms this: it shows WazHack as NOT INSTALLED and offers no uninstall
option, matching `libraryfolders.vdf` exactly.

Every `steam://uninstall/264160` firing (by GameLib or manually) was
therefore correctly treated as "nothing to uninstall" by Steam — Round 2's
"the verb is generally unreliable/dead" conclusion is retracted; the verb's
own reliability was never actually tested by this session's evidence, since
every firing targeted an appId Steam has no registration for. GameLib's own
uninstall flow (`resolveInstallRoot` -> native -> delegate -> poll) is
correct end-to-end; it correctly finds the still-present manifest after the
grace window and correctly refuses to flip the badge, because nothing ever
removes that manifest.

The concrete, actionable defect: GameLib's "restart Steam to finish
installing" notification (library.ts, i18n key
`steam.waitingForSteam.notify`) is gated on `StateFlags === 1026` and
`isNativeHandoff === true` — it is structurally unreachable for the
StateFlags=4 fast path, which is the path this exact install took. A user
whose install completes via the fast path gets no signal, ever, that Steam
still needs to notice the install — and GameLib's own install/uninstall
state machine never cross-checks `libraryfolders.vdf`'s `apps` map, so it
cannot detect or surface this divergence itself. This is very likely a
GENERAL defect (not WazHack-specific) affecting every native Steam install
that completes via the StateFlags=4 fast path, though this session has
directly inspected only this one orphaned ACF (see blind_spots above).

**CONFIRMED by the Round 4 live retry (2026-08-16T21:35:00Z evidence entry)
and FIXED in Round 5.** The "does a Steam restart adopt a StateFlags=4
orphaned ACF" question is answered YES (operator's own retest: Steam's UI
now shows WazHack installed, libraryfolders.vdf lists 264160, and a
subsequent uninstall through GameLib's own UI succeeded end-to-end,
confirmed against disk). Root cause is settled: registration gap alone
explains the entire original symptom; GameLib's uninstall state machine
needed zero changes. Fix direction (a) — making the "restart Steam to
finish installing" notification reachable for the StateFlags=4 fast path,
using the same `isNativeHandoff` provenance signal already proven correct
for the 1026 case — is implemented (see Round 5 below). Fix option (b)
(cross-checking `libraryfolders.vdf`'s apps map) is withdrawn as originally
framed — a NEW staleness finding (2026-08-16T21:36:00Z evidence entry) shows
the apps map is flushed lazily by Steam, only reliable for adoption
detection, not as an installed-state oracle. Fix option (c) (an "orphaned
install" recovery UX for already-orphaned titles) remains out of scope,
not authorized this session. The Round 1 toast fix
("Uninstall not confirmed by Steam — please check Steam and try again") is
re-examined in Round 5 below and recommended to KEEP/commit as-is, now that
fix (a) closes the gap that made it potentially misleading.

## Eliminated

- hypothesis: "steam://uninstall/<appid> fired externally is a generally
    unreliable/broken verb on native macOS Steam, independent of any given
    title's registration state (Round 2's central conclusion)."
  evidence: "RETRACTED, not merely eliminated by new evidence — the
    hypothesis was never validly tested. Every one of the 6 real-world
    firings (Round 1 + Round 2) targeted appId 264160, which the operator's
    own control test (Steam's native UI) and libraryfolders.vdf both
    independently confirm Steam has NO registration for. A no-op against an
    unregistered app is the Steam-correct behavior, not evidence of a
    broken verb. The verb's actual reliability against a Steam-registered
    appId remains untested."
  timestamp: 2026-08-16T21:15:00Z

- hypothesis: "Layer 6 (dual-install survivor mis-detection) — pollUninstallOnce()'s
    every-root survivor probe is producing a false positive, keeping the
    badge installed for WazHack when nothing actually survives."
  evidence: "Exhaustive on-disk enumeration of all three known roots found
    WazHack ONLY on the native root — there is no survivor anywhere for the
    probe to (mis)detect. Also, gamelib.log shows every attempt already
    stopped in the grace-window-timeout branch (no manifest ever went absent
    on the polled root at all), which is a structurally different code path
    from the survivor-probe branch (that branch only runs once the polled
    root's manifest is confirmed absent)."
  timestamp: 2026-08-16T20:16:00Z

- hypothesis: "uninstall() refuses because install_path doesn't resolve inside
    any known root (the null-resolution silent-no-op case flagged in Prior
    Art)."
  evidence: "gamelib.log shows 'source native' and a real
    shell.openExternal delegation fired each time — the refuse/null branch
    logs a distinct WARNING ('uninstall() refused ... does not resolve inside
    any known root') that never appears anywhere in the log for this appId."
  timestamp: 2026-08-16T20:16:00Z

- hypothesis: "GameLib itself intercepts/re-fires the outgoing steam://uninstall
    URL via a self-registered OS protocol handler, preventing it from ever
    reaching the real Steam client."
  evidence: "protocol.ts only handles `gamelib://` URLs; no `steam://`
    registration or listener exists anywhere in the codebase. Steam's own
    console_log.txt independently confirms genuine, repeated receipt of the
    URL."
  timestamp: 2026-08-16T20:20:00Z

- hypothesis: "This is the same CrossOver/Wine CW_USEDEFAULT off-screen-dialog
    defect documented in the resolved sibling session (steam-bottle-uninstall-
    reverts), just recurring for a different title."
  evidence: "WazHack is mac-native and routes through native macOS Steam
    (steam_osx), never through a CrossOver/Wine bottle process — that defect
    is architecturally bottle-specific and cannot apply here."
  timestamp: 2026-08-16T20:21:00Z

## Resolution

> **Round 1's original `root_cause`/`fix`/`verification` (the silent
> grace-window-timeout gap) are SUPERSEDED but not wrong** — the toast they
> added (`notify.uninstallNotConfirmed`) is real, shipped, and re-affirmed by
> Round 5's final review below. Round 1 misattributed WHY Steam's dialog
> never rendered for WazHack specifically; Round 3 corrected that (no Steam
> registration); Round 4 confirmed it live; Round 5 (below) is the final,
> settled state: root cause confirmed, fix (a) implemented and verified.
> **Status: self-verified (RED-then-GREEN unit proof, tsc, eslint, full
> suite). NOT yet committed — awaiting operator review per instruction.**

root_cause: |
  CONFIRMED (Round 3 diagnosis, Round 4 live-tested and disk-verified,
  settled in Round 5). WazHack's native Steam install genuinely and honestly
  completed via GameLib's own StateFlags=4 full-ownership fast path
  (finalizeToSteam/canWriteFullOwnership, Phase 23) — real payload on disk,
  sha1-verified, BytesToDownload==BytesDownloaded. GameLib wrote
  appmanifest_264160.acf directly (byte-for-byte-confirmed match to
  depot/manifest.ts's buildAppManifestText() template) — but Steam's own
  client never adopted that manifest into its library registry
  (libraryfolders.vdf's "apps" map), which is Steam's independent source of
  truth for "installed" and is never cross-checked anywhere in GameLib's own
  ACF-StateFlags-bit-driven install/uninstall state machine. Confirmed by
  the operator's own control test (Steam's native UI showed WazHack as NOT
  INSTALLED, no uninstall option) and by libraryfolders.vdf's apps map
  independently lacking a 264160 entry. Every steam://uninstall/264160
  firing (GameLib's or manual) was therefore a Steam-correct no-op against
  an app Steam did not believe it owned — not a broken verb (Round 2's
  "verb is generally unreliable" conclusion stays retracted). GameLib's own
  uninstall flow (resolveInstallRoot -> native -> delegate -> poll) needed
  ZERO changes — proven by the Round 4 live retry, which succeeded
  end-to-end through that exact unmodified code path once Steam had adopted
  the manifest via a full client restart (operator-performed, Round 3's
  recommended next step).

  The sole actionable defect: GameLib's ONLY "restart Steam to finish
  installing" user notification was hard-gated on
  `result.stateFlags === GAMELIB_HANDOFF_STATE_FLAGS (1026) &&
  poll.isNativeHandoff === true`, inside pollInstallOnce()'s 'downloading'
  branch — structurally unreachable for the StateFlags=4 fast path, because
  readAcfState() returns state:'installed' (not 'downloading') the moment
  bit 4 (FullyInstalled) is set, routing into a completely different branch
  with no restart-notify logic at all. A fast-path install therefore gave
  the user zero signal, ever, that Steam still needed to notice it — a
  GENERAL defect affecting every native install that completes via the
  StateFlags=4 fast path, not WazHack-specific (confirmed general via direct
  code read of the gating logic, not merely inferred from one instance).
fix: |
  IMPLEMENTED (Round 5). Fix (a) only, per explicit scope authorization —
  options (b) (cross-check libraryfolders.vdf as an installed-state oracle)
  and (c) (orphaned-install recovery UX) remain withdrawn/out of scope; see
  the 2026-08-16T21:36:00Z evidence entry for why (b) specifically would
  have introduced a NEW, opposite-direction bug (libraryfolders.vdf is
  flushed lazily by Steam, stale for up to the lifetime of the Steam
  process — reliable only for adoption detection, never as a live
  installed-state check).

  Change: `src/backend/storeManagers/steam/library.ts`,
  `pollInstallOnce()`'s `'installed'` branch — added a second `notify()`
  call, gated on `poll?.isNativeHandoff === true && !poll.notifiedWaiting`
  (the same fire-once guard the 1026 branch already uses), firing
  immediately after the existing "Installation Finished" toast and before
  `stopInstallPolling(appId)`. Reuses the EXISTING i18n key
  `steam.waitingForSteam.notify` ("Restart Steam to finish installing
  {{game}}") already shipped for the 1026 path — no new translation key, no
  wording change, no behavior change to the OFF-path (Steam-owned download,
  isNativeHandoff never set) flow. See Round 5 above for the full
  reasoning_checkpoint and code snippet.

  The Round 1 toast fix (`notify.uninstallNotConfirmed`,
  "Uninstall not confirmed by Steam — please check Steam and try again") is
  KEPT and recommended for commit as-is — see Round 5's "Round 1 toast fix —
  final recommendation" for the full reasoning. It was never edited across
  any round of this session.
verification: |
  Self-verified this round, RED-then-GREEN proven:
  - RED (pre-fix): the new "fires the Restart Steam... notify on the
    installed branch" test, run against the unmodified pre-fix library.ts,
    FAILED — notify() was called exactly once ("Installation Finished"
    only; "Number of calls: 1"), proving the gate was genuinely unreachable
    before the fix, not just untested.
  - GREEN (post-fix): the same test plus a companion OFF-path regression
    test both PASS after the fix; notify() now fires twice on an
    isNativeHandoff:true StateFlags=4 poll (Installation Finished, then
    Restart Steam to finish installing).
  - GAME-02 regression tests (pre-existing "Installation Finished" toast
    behavior): unaffected, still pass.
  - Full steam suite: `npx jest src/backend/storeManagers/steam` —
    31 suites, 1154/1154 tests passed (1152 pre-existing + 2 new; 0
    regressions).
  - `npx tsc --noEmit -p .`: clean, 0 errors.
  - `npx eslint src/backend/storeManagers/steam/library.ts
    src/backend/storeManagers/steam/__tests__/library.test.ts`: 0 errors,
    489 warnings, all pre-existing baseline categories (new call site adds
    one more instance of an already-present warning type, no new
    categories).
  - Live re-test: NOT performed — assessed optional, not required. The
    underlying mechanism (fast-path install + Steam-restart adoption +
    uninstall) is already live-confirmed by the Round 4 operator retest; this
    fix only extends an already-production-proven notify() pattern to a
    second, structurally-parallel code path. See Round 5 above for full
    reasoning on why this is assessed low-risk to defer.
  Full human/live verification of the NEW notification firing in a real
  Electron build has NOT been performed and is the one open item before
  final close-out — left to operator discretion per instruction.
files_changed:
  - src/backend/storeManagers/steam/library.ts (Round 1: grace-window-timeout
    notify(); Round 5: added the isNativeHandoff-gated restart-Steam notify()
    to the 'installed' branch)
  - public/locales/en/translation.json (Round 1: added
    notify.uninstallNotConfirmed key; unchanged this round — Round 5 reuses
    the pre-existing steam.waitingForSteam.notify key)
  - src/backend/storeManagers/steam/__tests__/library.test.ts (Round 1: 3
    tests for the grace-window-timeout notify; Round 5: 2 new tests —
    RED-then-GREEN proof for the fast-path restart notify, plus an OFF-path
    regression test)
  - All changes remain UNCOMMITTED in the working tree — operator review
    requested before commit, per instruction.
