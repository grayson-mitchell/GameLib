---
phase: 35-electron-cutover-remove-the-electron-build
verified: 2026-08-30T04:12:40Z
reverified: 2026-08-31T19:40:00Z
readjudicated: 2026-08-31T20:15:00Z
readjudicated_4: 2026-08-31T21:45:00Z
readjudicated_5: 2026-08-31T22:36:44+1200
readjudicated_6: 2026-08-31T23:12:00+1200
status: human_needed
score: "17/17 must-haves verified — UNCHANGED by the SIXTH pass, and for the first time every one of the 17 is verified against a GENUINE RELEASE ARTIFACT rather than a debug-packaged one. The fifth pass set TWO conditions for closure; the sixth pass re-measured BOTH itself and both HOLD (the `(e5)` gate: 6 mutations run by me, 2 of which nobody had run before; the release live gate: the full build-identity chain closed at the RUNNING PROCESS, not at a file on disk). Status is nevertheless `human_needed` and NOT `passed`: the phase goal is achieved but THREE records propagations are unclosed, the first of which is in the phase`s own `blocking: true` gate document. See `sixth_adjudication` and the three `gaps` entries prefixed `SIXTH PASS`. None needs a gesture or a code change. STATUS CHOICE IS DELIBERATE AND MEASURED, NOT DEFAULTED — see `sixth_adjudication.why_human_needed_and_not_gaps_found`: the decision tree points at `gaps_found`, but I RAN `gsd-sdk query audit-uat` under both values and `gaps_found` makes Phase 35 vanish from the audit ENTIRELY, taking its one genuinely open human item (criterion 14`s unobserved UI repaint) with it. Writing a finding into a file the consuming tool cannot read is the exact defect this pass raises as G-6-02; choosing that status would have been self-refuting. The three blockers live in `gaps:`, which the orchestrator reads directly. ⚠ UPDATED 2026-09-01 (quick `260901-vuy`): ALL THREE records propagations are now CLOSED — G-6-01 (the 35-LIVE-GATE.md writeback, appended as a POST-FIX ADDENDUM with the original 18:15 record left intact), G-6-02 (the Phase 38 inheritance, ledgered as 38-W06 and verified at the tool by audit-uat moving 29->30 for phase 38 and 54->55 total), and G-6-03 (REQ-35-07 marked Complete and deconditioned from D-35-19-15 at REQUIREMENTS.md:429 and :1143). STATUS STILL STAYS `human_needed` AND MUST NOT BE FLIPPED TO `passed` OR `gaps_found`: the reason is now the SEVEN remaining human items, not the three blockers. `gaps_found` still makes Phase 35 vanish from audit-uat entirely, and `passed` would falsely claim criterion 14's unobserved UI repaint, criterion 10's AppleEvent path and D-35-19-15 are discharged. D-35-19-15 IS NOT CLOSED BY ANY OF THIS."
overrides_applied: 0
re_verification:
  performed: 2026-08-31 — independent goal-backward re-adjudication after gap-closure cycle 1 (plans 35-20..35-29)
  previous_status: gaps_found
  previous_score: 11/17
  gaps_closed:
    - "REQ-35-20 — the blocking packaged macOS arm64 live gate now records PASS (21 of 21, 0 FAIL). Re-run measured 8 criteria, 8 PASS. Verified independently: the packaged artifact (bundle mtime Aug 31 07:54:39) POSTDATES every code fix in the cycle (last source commit 0f5dfb352 at Aug 31 07:14:30), so the gate did not measure stale code."
    - "REQ-35-16 — winetricksInstall closed at the renderer (mousedown capture, RED-proven pin winetricksInstallMouseRace.test.tsx, live gesture twice) AND the unsatisfiable three-layer attribution clause amended in place with a dated correction. installed.json UI half closed by 35-20 Task 3."
    - "REQ-35-17 — D-35-11-01 resolved by 35-26: both native dialogs deleted from eos_overlay.ts, confirmation moved to the renderer behind showDialogModal with a fail-closed `confirmed === true` gate; live gate exercised confirm AND cancel on remove/install/update in both themes."
    - "The Phase 35 mechanized-gate regression — meta/__tests__/genI18nGateScope.test.ts A-17 ANTI-ROT. Re-run by the verifier in its own process: 26 passed / 1 skipped / 0 failed, and BOTH non-vacuity controls (A-17 and A-03) pass live, so the green is not vacuous."
  gaps_remaining: []
  regressions:
    - "None found. Re-ran the five absence/pin gates (5 suites / 42 tests, exit 0), the un-anchored `grep -rn isTauri src/` (0 matches), and `pnpm codecheck` (tsc --noEmit, exit 0)."
  residual_red_gate:
    - "`pnpm test` exits 1 — 3 failed / 7296 passed, 365 of 366 suites. All 3 are decompressPool.test.ts lzmaLoader native-decode cases. Verified NOT caused by Phase 35: the phase's ONLY diffs to lzma files across the whole phase (git diff e42f9862..HEAD) are two comment-text edits in lzmaNativeBinding.ts and meta/buildDecompressWorkerDev.ts. Ledgered as .planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md."
post_reverification_closure:
  performed: 2026-08-31 — quick task 260831-q93, executor-recorded (NOT an independent verification pass)
  previous_status: gaps_found
  previous_score: 16/17
  closed:
    - "REQ-35-07 / D-35-19-15 — CLOSED on LIVE evidence. D-35-29-01 (the inert census) was fixed by 260831-q93 (9106ccbea): the census arm now falls back to a label-independent default-data-store read for Epic domains, mirroring the clear path. A live Epic logout on 2026-08-31 19:27 emitted, for all five hosts, verdict=SUPPORTED_NONEMPTY with NUMERIC total= and matched=, zero `cookie census read failed` lines (against 5-per-host before), and — the thing D-35-19-15 actually asked for — each of the FOUR non-primary Epic apexes read before(matched=1), cleared 1, and read after(matched=0). The multi-domain widening is live-proven for the first time."
  honesty_qualifications:
    - "The evidence for D-35-19-15 arrived OPPORTUNISTICALLY, not via the seeding step that item specified. No seeding was performed and none is possible — the Tauri build still embeds no browser view, so no user action can create a non-primary Epic cookie. The four cookies that made this measurable were legacy Electron-era residue in the dev-keyed jar. 260831-q93 did NOT fix the widening; the widening always worked, and what was fixed is the observability defect that made it unprovable."
    - "Unit tests are NOT the closure evidence and were explicitly refused as such. cargo test 215/215 and the jest source gates were green throughout the entire period the probe returned nothing, and green again after the fix. D-35-29-01's own text set this bar and it is honoured."
    - "Measured on a `pnpm tauri:dev` build, jar `gamelib-shell.binarycookies` (process-name keyed), NOT the packaged `com.gamelib.shell.binarycookies` jar the 21-criterion live gate used. Build identity was verified by `nm` (35 symbol hits for default_data_store_cookies_for_domain), not assumed — `strings` returns 0 for the same symbol and would have falsely indicated a stale build."
    - "D-35-29-02 remains OPEN and was UPGRADED by this run from a single-jar observation to a REPRODUCED one (the same four Epic auth cookie names survive logout on the second, differently-keyed jar). This run also created a NEW contradiction that did not exist at the 16/17 adjudication: the product's in-process post-clear census now reads matched=0 on all five hosts while an external `strings` read of the same jar still shows those four names. It is ledgered as an open deferred item, NOT scored as a must-have failure — that was already its standing at 16/17 and this executor did not re-adjudicate it. A fresh verifier pass is the proper vehicle for deciding whether it should become one."
    - "The two gates routed OUT of Phase 35 (`pnpm lint` -> Phase 39, Windows/Linux smoke -> Phase 38) and the red `pnpm test` (3 decompressPool native-LZMA failures, ledgered as an unowned pre-existing todo) are unchanged by this task and were already excluded from the 17 must-haves. They do not hold Phase 35 open and are not claimed as closed."
independent_adjudication:
  performed: 2026-08-31 — third pass, independent verifier, spawned BECAUSE the 16/17 -> 17/17 move was made by the quick-task executor closing its own work
  reviewed: "post_reverification_closure (quick task 260831-q93)"
  verdict: "REJECTED. 17/17 is NOT earned. Score returns to 16/17, status returns to gaps_found. REQ-35-07 FAILS on new evidence this pass measured directly."
  method: "Both cookie jars were copied out and decoded with a real Apple binarycookies parser that walks the file's own page/offset index, rather than grepped with strings. Only records the file itself references as live are reported. This is the conclusive read D-35-29-02 asked for and could not take."
  findings:
    - "FALSIFIED the exculpatory hypothesis. D-35-29-02 named strings-surfacing-unreferenced-remnants as its leading candidate explanation, and post_reverification_closure leaned on it. It is wrong. In `gamelib-shell.binarycookies` (mtime 2026-08-31T19:27:18, i.e. AFTER the 19:27:14 clear) all four names — `_epicSID`, `_tald`, `EPIC_DEVICE`, `EPIC_LOGIN_ID` — are LIVE cookie records on `.epicgames.com`, each referenced by the page offset table. Each name occurs EXACTLY ONCE in the whole file, so live-record count equals byte-occurrence count: there are no remnants at all, only live cookies."
    - "NEW AND WORSE, never recorded anywhere in this phase: the PACKAGED jar `com.gamelib.shell.binarycookies` (mtime 2026-08-31T18:17:28, after the 18:15:15 clear, process since exited so this is a FINAL flush) carries a FIFTH surviving `.epicgames.com` record that no report names — `EPIC_SESSION_AP`, path `/id`, value length 1310 bytes, created 06:17:18, expiry 2027-08-31. That is Epic's `/id` session credential, not an identifier crumb. Its creation stamp predates the logout by nine hours, so it survived rather than being re-created. D-35-29-02's severity bound (`inert for re-authentication`) was established against a four-name set that DOES NOT INCLUDE IT, because that read was a strings grep for four names known in advance. The inertness defence is therefore not established for the actual residue set. Packaged Epic-owned live records total SEVEN."
    - "THE CONTRADICTION IS RESOLVED AGAINST THE PRODUCT. `legendary/user.ts:243` calls `seam.cookiesForDomain(label, host, [])` with an EMPTY names array, and the Rust census applies `filter_names.is_empty() || ...`, so `matched` is every cookie whose domain matches the host — not a name-scoped subset. `cookie_domain_matches` (main.rs:1836-1839) strips the leading dot and suffix-matches, so `.epicgames.com`, `.www.epicgames.com` and `.ecosec.on.epicgames.com` all match target `epicgames.com`. The product logged `epicgames.com ... after(total=54, matched=0)`. The jar written three seconds later holds SIX matching live records. matched=0 is FALSE."
    - "Corroborating arithmetic, recorded so a future pass does not have to re-derive it: the census's own totals do not reconcile either. It reported 57 -> 51 (a drop of 6) while reporting 7 cookies cleared, and the fortnite.com step logged `cleared 1` with total UNCHANGED at 54. The decoded jar holds 56 live records against the census's closing total of 51. The census and the persisted jar are not views of the same set."
    - "Two builds, two differently-keyed jars, two logouts, same outcome. This is reproduced, not incidental."
  what_the_quick_task_did_earn:
    - "D-35-29-01 is genuinely discharged AS TO ITS LETTER. `default_data_store_cookies_for_domain` exists in `src-tauri/src/main.rs`, the census arm binds `existing_window` first and falls back on `existing_window.is_none() && epic_cookie_domain_matches(domain)`, and the live log shows numeric total=/matched= with zero `cookie census read failed` lines against five-per-host in the preserved pre-fix baseline. The probe is no longer inert. Verified in source and in both preserved logs. What it does NOT earn is trust in the values it returns — see findings."
    - "D-35-19-15 is closed on its own contract. Its text asked for a non-primary Epic domain confirmed present before logout and a non-zero clear on it; the 19:27 log shows all four non-primary apexes at before(matched=1) -> cleared 1 -> after(matched=0), and my decode confirms zero non-primary Epic records remain in either jar. The opportunistic framing the executor was told to state IS present and IS honest, in all three claimed places: deferred-items.md's CLOSED block (`evidence arrived OPPORTUNISTICALLY, not the seeding step this item specified` and `Do not read this as 260831-q93 fixing the widening`), this file's post_reverification_closure.honesty_qualifications, and quick SUMMARY.md lines 149/158/238."
    - "The frontmatter is structurally sound and nothing was lost in the relocation the executor self-reported. Parsed with js-yaml: 11 top-level keys, and `regressions` and `residual_red_gate` both sit correctly under `re_verification`, not absorbed into `post_reverification_closure`. `git diff 876faf5fe..HEAD` on this file is purely additive plus the status/score line; every superseded passage is annotated in place rather than deleted."
  why_it_still_fails:
    - "REQ-35-07 has TWO clauses and BOTH fail. Clause 1 — `Logging out clears the embedded browser's persisted state — cookies, localStorage, IndexedDB and disk cache`. Cookies are named FIRST and unconditionally; the text does not say `cookies that still authenticate`. Five Epic cookies including a 1310-byte session credential survive in the persisted jar. Clause 2 — `the app does not report success unless a post-clear read confirms it`. The app DID report success on a post-clear read that returned matched=0 against a jar holding six matching live records. That is not a confirmation; it is a false confirmation."
    - "Clause 2 is dispositive on its own and does NOT depend on the inertness argument. The requirement's own rationale names the exact failure mode being reproduced: `a genuine unaddressed failure where the app reports clearing cookies it does not clear; on a shared machine that is credential exposure, not cosmetics`. Whatever one concludes about whether inert cookies count as persisted state, an evidence mechanism that certifies removal of cookies that are still there is the defect REQ-35-07 exists to close — now shipped inside the closure mechanism itself."
    - "The one clause that DOES pass is the discharge test — `Discharged by having to re-enter credentials`. Re-login demanded credentials. This is the strongest argument for the executor's position and it is recorded here rather than suppressed. It is not sufficient: it is a test OF clause 1, it says nothing about clause 2, and it was never run against `EPIC_SESSION_AP` because nobody knew that cookie had survived."
    - "No override exists for this must-have (`overrides_applied: 0`, no `overrides:` key), so it resolves as FAILED rather than PASSED (override). If the user wishes to accept the deviation, the vehicle is an explicit override entry with a reason and an acceptor, not a score move."
  routed_items_confirmed_out_of_scope:
    - "`pnpm lint` — RE-MEASURED BY ME, exit code captured from the command and not from a pipe: exit 1, 4155 problems (9 errors, 4146 warnings). Correctly routed to Phase 39, which exists in ROADMAP.md with a repo-wide lint goal. Not among the 17 must-have truths. DRIFT NOTED, not scored: this file's deferred block says `the 6 current errors`; there are now NINE, across meta/__tests__/cleanDist.test.ts, src/backend/__tests__/packagingConfig.test.ts, src/backend/sidecar/__tests__/appShellFlows.test.ts, src/backend/sidecar/__tests__/steamAuthFlows.test.ts, src/backend/sidecar/installedJsonWatcher.ts, src/backend/utils.ts, src/frontend/screens/WebView/index.tsx, src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts. Phase 39 should inherit the corrected count."
    - "Windows/Linux parity — correctly routed. REQ-35-20's OWN text routes the smoke-launch half to Phase 38 as `38-W04`/`38-W05` and records the option-c scope reduction as user-acknowledged. Phase 38 exists in ROADMAP.md. Not among the 17 must-have truths."
    - "`pnpm test` decompressPool — RE-MEASURED BY ME. Note the correct path is `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`; `npx jest` against the `src/backend/__tests__/` path implied elsewhere exits 1 with `0 matches`, a fail-open shape a future pass should not mistake for a failure. On the real path: exit 1, `Tests: 3 failed, 38 passed, 41 total`, all three lzmaLoader native-decode cases. Phase 35 attribution independently disproved: `git diff e42f9862..HEAD` touches exactly one lzma file, `src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts`, and the change is a single line INSIDE A DOC COMMENT (an `--alias:` path in prose). Todo `.planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md` exists. Correctly excluded."
fourth_adjudication:
  performed: 2026-08-31 — FOURTH pass, independent verifier, spawned BECAUSE the claim that the third pass's sole blocker was fixed came from the gsd-debug session that made the fix
  reviewed: "commit b5b3464bd (fix) + b996d1772 (docs), debug session `.planning/debug/resolved/epic-cookie-clear-read-divergence.md`, and the third pass's `independent_adjudication` block above"
  verdict: "The third pass's stated REASON for failing REQ-35-07 is FALSIFIED on evidence I took myself, in BOTH directions. The Epic cookies did not survive the clear — the logout re-created them with its own hidden webview, and that webview is gone. REQ-35-07's substantive security property is achieved and I reproduced the proof independently. BUT the score STAYS 16/17 on a DIFFERENT and much narrower finding that this pass measured for the first time: the post-clear verification sweep added to satisfy clause 2 is itself FAIL-OPEN on a rejecting read, and I proved that by running it."
  method: "Independent index-walking binarycookies decode of BOTH live jars (never `strings`, and the name-agnostic byte scan below cannot structurally miss an unknown survivor the way the EPIC_SESSION_AP false alarm did); direct read of gamelib.log rather than the debug record's transcription; UTC->UTC+12 conversion re-derived from `date` vs `date -u` at verification time; two RED-proofs executed against the REAL source file with a cp backup and a sha256-verified restore; one throwaway probe test written, run and deleted to settle the fail-open empirically."
  third_pass_findings_overturned:
    - "OVERTURNED — 'matched=0 is FALSE'. It was true of the instant it measured. I confirmed the mechanism myself on the packaged jar: both `__cf_bm` records carry an expiry EXACTLY 30 minutes after their creation second (created 06:15:16Z / 06:15:17Z, expire 06:45:16Z / 06:45:17Z) — Cloudflare's bot-management TTL, mintable only by a live HTTPS round trip to Epic at that second. The clear ran at 18:15:15 local = 06:15:15Z. Every 'survivor' was minted one to two seconds AFTER its own clear."
    - "OVERTURNED — `EPIC_SESSION_AP` as 'a FIFTH survivor whose creation stamp predates the logout by nine hours'. This machine is NZST, UTC+12, re-confirmed by me at verification time (`date` -> 21:31 NZST, `date -u` -> 09:31 UTC). The parser emits UTC. `created=2026-08-31T06:17:18Z` is 18:17:18 LOCAL — two minutes and three seconds AFTER the 18:15:15 clear, not nine hours before it. The third pass's severity escalation rested on a timezone slip and does not stand."
    - "OVERTURNED — 'the census and the persisted jar are not views of the same set'. They are one store. On the post-fix run the product logged `after(total=51)` and my own index-walking decode of that same jar counts EXACTLY 51 live records, with zero expired. The arithmetic reconciles end to end: before(total=59) -> after(51) = 8 = the reported `removed 8`."
    - "STANDS, and is now the ONLY thing holding REQ-35-07 open — but for a new reason, see `new_finding` below. The third pass was right that clause 2 is dispositive and right that it was not satisfied. It was wrong about why."
  verified_by_my_own_measurement:
    - "DEV JAR, post-fix (`~/Library/HTTPStorages/gamelib-shell.binarycookies`, mtime 2026-08-31T21:03:15+1200): 51 live records by page/offset index walk. ZERO Epic-owned live records. Name-agnostic BYTE scan of the raw file: `EPIC`=0, `__cf_bm`=0, `EPIC_SESSION_AP`=0, `_epicSID`=0, `_tald`=0, `EPIC_DEVICE`=0, `EPIC_LOGIN_ID`=0, `fortnite`=0, `unrealengine`=0, `twinmotion`=0, `metahuman`=0. `epicgames` occurs EXACTLY ONCE — the `api.hcaptcha.com`/`hmt_id` partition key, which is correctly retained (clearing it is the REQ-34.4.1-06 harm). A byte scan cannot miss an unknown survivor by name, which is precisely the blind spot that produced the EPIC_SESSION_AP false alarm."
    - "NO FABRICATION. My own parse output is byte-identical (whitespace-normalised, `diff` exit 0) to the committed `.planning/debug/evidence/epic-cookie-clear-read-divergence/parse-AFTER-fix-run.txt`."
    - "GAMELIB.LOG, read directly rather than via the debug record: `21:03:12 cleared storage` PRECEDES `21:03:13 cleared 8 epicgames.com cookie(s)` — the step reorder is live-exercised, not merely asserted in source. `before(total=59, matched=8, verdict=SUPPORTED_NONEMPTY)` -> `after(total=51, matched=0)`. ZERO `cookie census read failed` lines. Closing line verbatim: `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s) — epicgames.com=0, fortnite.com=0, unrealengine.com=0, twinmotion.com=0, metahuman.com=0`. Not vacuous: 8 Epic cookies were provably PRESENT before the clear."
    - "SOURCE, all three claimed changes present: `clearEpicStorage` registers at user.ts:253 and `clearEpicCookies` at :274 (order swapped); the macOS branch is `isMac ? EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL : await seam.open(COOKIE_HANDLE_ORIGIN, …)` so macOS opens NO window and `seam.close` is skipped; the final residual sweep loops all five `EPIC_COOKIE_HOSTS` after every mutation and `residualTotal > 0` throws, with `clearEpicCookies` named by `FATAL_WIPE_STEP`."
    - "RUST UNCHANGED AND CONSTRAINT PRESERVED. `git diff 9106ccbea..HEAD -- src-tauri/` is EMPTY — the fix touched zero Rust files. Both arms still gate label-independently on `existing_window.is_none() && epic_cookie_domain_matches(domain)` (main.rs:5975, :6472). `default_data_store_cookies_for_domain` (main.rs:3969) reads `WKWebsiteDataStore::defaultDataStore()` via `getAllCookies` on a `run_on_main_thread` closure that only REGISTERS the completion block, with the mpsc wait on the calling thread — no wry `.cookies()`, no `with_webview` reentrancy. F-34.4.2-12 is preserved and pinned at main.rs:10670. `EPIC_COOKIE_DOMAINS` scope is untouched (D-09-CORRECTED honoured)."
    - "RED-PROOF 1, EXECUTED BY ME ON THE REAL FILE, not asserted. I physically swapped the two `wipeSteps` array blocks in `src/backend/storeManagers/legendary/user.ts` and re-ran the suite: exactly ONE test fails — `wipe-step ORDER … registers 'clearEpicStorage' BEFORE 'clearEpicCookies'`. Restored from a `cp` backup; sha256 `a58850e6…3767eb` matches, `git status` clean, 50/50 green again. CRITICALLY, the other 49 tests — every behavioural one — stayed GREEN under the inverted order, which independently corroborates the stated reason a SOURCE gate was necessary: `seam.clearStorage` is mocked, a mock sets no cookies, and the order is invisible behaviourally. I also confirmed the gate is not vacuous through the comment occurrence of `'clearEpicStorage'` at user.ts:198 — `stripSourceComments` removes it, or the mutation would not have been caught."
    - "RED-PROOF 2, EXECUTED BY ME: removing the `if (residualTotal > 0) throw` block fails exactly TWO tests ((e) and (f)), matching the fix's own claim. Restored and re-verified green."
    - "NO CREDENTIAL LEAK. `git log --all --name-only` over every ref: zero `.binarycookies` files, ever. The committed parse artefacts print `vlen=<length>` only; a scan for any 40+ character token across both committed `.txt` files returns nothing. The withholding does NOT leave the conclusion unverifiable — I reproduced the decisive parse from the live jar myself and it matched exactly."
    - "UNIT TESTS ARE NOT BEING PASSED OFF AS THE EVIDENCE. The 50/50 green run is present but is explicitly not the closure evidence, and the record says so. The closure evidence is the live jar decode and gamelib.log, both of which I took independently."
  new_finding:
    - "THE POST-CLEAR VERIFICATION SWEEP IS FAIL-OPEN ON A REJECTING READ. Never recorded anywhere in this phase. `readHostCensus` (user.ts:342) catches a rejecting `seam.cookiesForDomain` and returns `{ jarTotal: null, matched: 0, verdict: UNSUPPORTED_OR_ERROR }`. The new residual loop consumes ONLY `verify.matched` and IGNORES `verify.verdict`. PROVED EMPIRICALLY, not by reading: I wrote, ran and deleted a throwaway probe in which all five verification reads reject. Result — `logout()` RESOLVES (`threw=false`) and the product emits, verbatim, `Legendary logout: post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s) — epicgames.com=0, fortnite.com=0, unrealengine.com=0, twinmotion.com=0, metahuman.com=0`. That is an AFFIRMATIVE certification of a fact no read ever measured — the literal negation of clause 2, `the app does not report success unless a post-clear read confirms it`."
    - "IT IS NOT AN EXOTIC BRANCH. All-reads-reject was 100% of production behaviour on every Epic logout from plan 35-23's landing until commit 9106ccbea — that is exactly what D-35-29-01 recorded. It is also the most likely off-macOS behaviour: the Rust default-data-store fallback is `#[cfg(target_os = \"macos\")]`, so Windows and Linux need a real window, and the new code points that window at the deliberately non-resolving `https://gamelib.invalid/`. Off-macOS cookie-clear behaviour is unverified until Phase 38, so this is the branch most likely to be live there."
    - "THE FIX IS ONE LINE AND THE CODEBASE ALREADY KNOWS IT. `domainVerdict`, `everProvedLive` and `classifyCookieRead` sit fifteen lines above and do exactly the right thing for the before/after pair: a read that cannot be trusted classifies `UNSUPPORTED_OR_ERROR` and drives `brokenHosts`. The residual sweep needs the same treatment — a `verify.jarTotal === null` (or non-`SUPPORTED_*` verdict) on any host must be fatal, or at minimum must not print `0 … remain`. This is the recorded `fixing-a-fail-open-gate-can-create-its-sibling` shape, one level over."
  qualifications:
    - "DEV-ONLY. The fix has NEVER been exercised on a packaged build. `com.gamelib.shell.binarycookies` mtime is unchanged at 2026-08-31T18:17:28+1200 — it PREDATES the fix commit (21:11:09) and reflects a pre-fix run. Its 7 Epic-owned live records are fully explained and are NOT scored as a defect: five were re-created by the defect at 18:15:16-17, and `EPIC_SESSION_AP` at 18:17:18 belongs to a deliberate re-login. But it means there is no packaged-build evidence of a clean Epic logout anywhere, in a phase whose own `35-CONTEXT.md` states 'packaged, not dev' three separate times (D-15, D-16, D-19)."
    - "TAKEN ON THE DEBUGGER'S WORD, could not re-measure: the PRE-fix log lines at 19:27 and 18:15 (gamelib.log has rotated; only the 21:03 run survives on disk), the 18:16:34 re-login line that explains EPIC_SESSION_AP, and the exclusivity argument that the logout's own windows were the SOLE writer. All three are strongly corroborated by evidence I did take — the created-second alignment, the 30-minute Cloudflare TTL, and the committed BEFORE parse — but they are transcription, not my measurement."
    - "I DID NOT OBSERVE THE 21:03 GESTURE. That the operator genuinely logged in and then out is inferred from `before(matched=8)` against a pre-fix baseline of 3, and from 8 Epic records existing to be removed at all. It is hard to fake but I did not watch it."
  d_35_19_15:
    verdict: "DOES NOT RE-OPEN as a blocker — but its closure is now UNREPRODUCIBLE and must not be cited as ongoing assurance."
    reasoning: "The narrow technical question D-35-19-15 asked was whether the widened five-domain clear actually removes a cookie on a NON-PRIMARY Epic apex. That was answered affirmatively by a real removal of real cookies in the real shared jar — before(matched=1) -> cleared 1 -> after(matched=0) on all four siblings. The cookies' PROVENANCE does not change whether the code path works, and the path demonstrably worked. What has changed is that the fixture is gone: I confirmed from gamelib.log MYSELF that all four siblings now read `before(total=51, matched=0)`, because the thing that had ever populated them during a logout was the window the fix removed. The observability that made the widening provable WAS the defect. Record it as closed-on-a-one-time-observation with a standing note; do not re-open it, and do not cite it as evidence of a currently-exercised capability."
    bears_on_req_35_07: "No. REQ-35-07's own two clauses do not require the sibling-domain proof — that was D-35-19-15's addition. REQ-35-07 is held open by the fail-open above, not by this."
  regressions:
    - "NONE in the other 16. The ENTIRE code diff since the third pass (`git diff --stat 6e21558cf..HEAD`) is confined to `legendary/user.ts` and its three test files; everything else is `.planning/`. Re-measured by me: `pnpm codecheck` (tsc --noEmit) exit 0; `npx jest src/backend` 188 of 189 suites pass, 4350 tests pass, the single failing suite being the pre-existing `decompressPool.test.ts` at exactly 3 failed / 38 passed — UNCHANGED; `npx jest meta/__tests__/isTauriRemoved.test.ts meta/__tests__/genI18nGateScope.test.ts src/backend/__tests__/` 30 suites / 635 passed / 1 skipped / 0 failed; `grep -rn isTauri src/` 0 matches."
  routed_items_reconfirmed:
    - "`pnpm lint` -> Phase 39. RE-MEASURED BY ME with the exit code captured from the command, not a pipe: exit 1, 4171 problems, NINE errors. The third pass's corrected count of 9 is confirmed and the `deferred:` block's stale '6' is superseded — see the dated correction on that entry. The nine errors are in the SAME eight files the third pass named; `b5b3464bd` introduced no new error (problem count moved 4155 -> 4171 entirely in warnings, from the new source and test comments)."
    - "Windows/Linux smoke-launch parity -> Phase 38 (`38-W04`/`38-W05`). Unchanged. NOTE FOR PHASE 38, new: the off-macOS cookie-clear branch now opens its handle window at `https://gamelib.invalid/`, and off macOS there is no default-data-store fallback, so both the clear and the census depend on that window carrying a usable cookie store. That is untested and is where the fail-open above is most likely to be live."
    - "3 `decompressPool` native-LZMA failures — re-measured by me on the real path `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`: exit 1, 3 failed / 38 passed / 41 total. Unchanged, still ledgered as an unowned todo, Phase 35 attribution already independently disproved. Correctly excluded."
fifth_adjudication:
  performed: 2026-08-31 22:36 NZST — FIFTH pass, independent verifier, spawned BECAUSE every previous upward score move was made by the agent that did the work, and each of the last two passes found a defect one level inside the one before
  reviewed: "commits bea07cd17 (fail-closed fix) + a9ef3026a (records); the packaged live gate run by the operator at 22:23:33; and the `fourth_adjudication` block above"
  verdict: "REQ-35-07 PASSES on BOTH clauses. Score moves 16/17 -> 17/17. Status moves to `human_needed`, NOT `passed`, on ONE precise gate this pass established for the first time: the phase's own BLOCKING release-artifact gate (35-LIVE-GATE.md criterion 21, the Epic cookie-clear criterion) was last measured 2026-08-31 before 21:11, and TWO behaviour-changing product commits have landed since. Tonight's run covers that code but on the DEBUG-packaged artifact, which this pass proved structurally never executes the SEA sidecar."
  method: "Independent index-walking binarycookies decode of the live packaged jar with a parser written for this pass (never `strings`), plus a set-difference against the operator's BEFORE artifact; direct read of gamelib.log; FOUR mutations executed against the real source file with a `cp` backup and a sha256-verified restore; `ps` inspection of the live process tree; `grep -a` of both the embedded SEA sidecar AND the artifact that actually ran; source reads of the Rust spawn-mode selector."
  req_35_07_clause_1:
    verdict: "VERIFIED LIVE on a packaged shell, independently and set-exactly."
    evidence: "I copied the live jar `~/Library/HTTPStorages/com.gamelib.shell.binarycookies` (mtime 22:23:26) and decoded it by walking its own page/offset index. 23 live records, ZERO Epic-owned. sha256 of my copy is IDENTICAL to the operator's `AFTER-packaged.binarycookies` artifact (cabcdd58…41a8d87), so that artifact is genuine and not a transcription. SET-DIFFERENCE against the BEFORE artifact is the decisive measurement and is stronger than any count: BEFORE 30 live records of which 7 Epic-owned; AFTER 23 of which 0; removed = exactly 7, ALL of them Epic; added = 0; and every one of the 23 non-Epic records is byte-identical-by-key to a BEFORE record. No collateral damage, no re-creation."
    name_agnostic_scan: "A byte scan of the raw jar CANNOT structurally miss an unknown survivor the way the third pass's four-name grep did: `EPIC`=0, `__cf_bm`=0, `SESSION_AP`=0, `epicSID`=0, `_tald`=0, `EPIC_DEVICE`=0, `EPIC_LOGIN_ID`=0, `fortnite`=0, `unrealengine`=0, `twinmotion`=0, `metahuman`=0. `epicgames` occurs EXACTLY ONCE and I dumped its byte context to identify it rather than assuming: it is inside a `bplist00 … StoragePartition … https://epicgames.com` value on the `api.hcaptcha.com` cookie. That is a partition key, correctly RETAINED — clearing it is the REQ-34.4.1-06 harm."
    ordering_gate_live: "Read by me directly from gamelib.log, not from any report: `(22:23:33) cleared storage — localStorage=2 …` PRECEDES all five `cleared N <host> cookie(s)` lines. The load-bearing wipeStep reorder is live-exercised on the packaged shell."
    arithmetic_note_recorded_not_scored: "The product logged `before(total=29, matched=6)` and `cleared 6`; my decode of the BEFORE snapshot (taken 22:08, fifteen minutes earlier) holds 30 records with 7 Epic. The gap is ONE record, and the direction is CONSERVATIVE — the product under-counted what it removed and never over-claimed. The most likely explanation is a WebKit prune of one of the two long-expired `__cf_bm` records (both expired 06:45Z = 18:45 local, four hours before the gesture) between the snapshot and the read. Unresolved, deliberately NOT scored: the end state is set-exactly clean either way, and a product that reports fewer removals than it made cannot produce the harm REQ-35-07 exists to prevent."
  req_35_07_clause_2:
    verdict: "VERIFIED. The affirmative half is live-proven; the refusal half is installed, source-verified and RED-proven, and structurally CANNOT be live-proven without shipping fault injection into a credential path."
    affirmative_half: "The product reported success and a post-clear read confirmed it — and I independently confirmed the read was TRUE, not merely present. All five hosts printed a NUMERIC `=0`, never `unconfirmed(...)`, so under the shipped code every read cleared the trustworthiness bar. My decode of the same jar three seconds later agrees exactly (23 total, 0 Epic). This is the first time the report and an independent read of the persisted store have been shown to agree on a packaged shell."
    refusal_half_red_proven_by_me: "FOUR mutations, each executed against the REAL `src/backend/storeManagers/legendary/user.ts` with a `cp` backup and a sha256-verified restore (f9b3b88a…142676 before and after every one; `git status` clean). Baseline 53/53. (A) reverting the residual loop to summing `verify.matched` alone — the exact pre-fix shape — fails EXACTLY 3: (e2), (e3), (e4). (B) keeping the guard and the warning but deleting the fatal `throw` — fails the SAME 3. (C) an independent mutation the executor did NOT claim, trusting `UNDECIDABLE` and rejecting only `UNSUPPORTED_OR_ERROR` — fails EXACTLY 1, (e4) alone. (C) is the important one: it proves the three tests are DISCRIMINATING rather than one assertion in three costumes, and that (e4) pins a genuinely separate sub-case. The gate is not vacuous."
    why_a_live_negative_is_not_the_right_bar: "The refusal branch never fired tonight — zero `unconfirmed(`, zero `COULD NOT CONFIRM`, zero `UNSUPPORTED_OR_ERROR`, zero `UNDECIDABLE`, zero `census read failed`. That is honest and it is recorded. But on macOS the census now resolves through `default_data_store_cookies_for_domain`, which is unconditionally available; there is NO user gesture, and no operator-drivable state, that makes a read reject. Producing a live negative would require either (i) shipping a test-only env kill switch into the product — new attack surface inside the very path that establishes the logout security property, which this repo has previously and rightly refused — or (ii) building a throwaway mutant binary in which the Rust arm returns `Err`, which measures the mutant and not the shipped artifact. Neither is a legitimate closure gate. A negative that cannot be produced without changing the product is precisely what a RED-proven unit gate is for, and one exists. Demanding otherwise sets a bar no correct code can clear."
    the_one_genuinely_reachable_live_negative: "Off macOS. `default_data_store_cookies_for_domain` is `#[cfg(target_os = \"macos\")]`, so Windows and Linux need a real window, and the cookie step now points that window at the deliberately non-resolving `https://gamelib.invalid/`. That is where this branch will fire in the field, for real, and it is already routed to Phase 38. See `phase_38_risk_shape_changed` below — the risk there is now materially DIFFERENT from what the fourth pass recorded."
  new_findings:
    - "F-5-01 — THE `tauri:dev:packaged` GATE STRUCTURALLY CANNOT EXERCISE THE SEA SIDECAR, AND THE BUILD-IDENTITY CHECK VERIFIED AN INERT ARTIFACT. Never recorded anywhere in this phase. `ps` on the live process tree shows PID 2606 = `/Applications/GameLib.app/Contents/MacOS/gamelib-shell` (started 22:22:04) spawning PID 2616 = `~/.nvm/versions/node/v26.2.0/bin/node /Users/graysonmitchell/Projects/GameLib/src-tauri/../build/main/sidecar.js`. It is NOT running the bundle's own `Contents/MacOS/gamelib-sidecar`. Confirmed structurally in Rust source, not inferred: `spawn_sidecar` dispatches on `use_dev_sidecar()`, which is `cfg!(debug_assertions)` (main.rs:6747-6749); `resolve_sidecar_entry()` bakes `CARGO_MANIFEST_DIR/../build/main/sidecar.js` (main.rs:6642); and main.rs:6694's own doc comment says so outright — 'Debug builds only — a release build uses the bundled gamelib-sidecar externalBin and never runs node.' `pnpm tauri:dev:packaged` is `tauri build --debug`. CONSEQUENCE: the orchestrator's build-identity check — grepping `/Applications/GameLib.app/Contents/MacOS/gamelib-sidecar` for a marker introduced by the commit under test — interrogated a binary that this build configuration guarantees is never loaded. That check could not have caught the failure it was designed to catch, and the `pnpm build:sidecar-sea` rebuild it prompted was inert. The CONCLUSION nevertheless holds, and I established it against the correct artifact: `build/main/sidecar.js` (mtime 22:16:08, i.e. AFTER the 22:04:45 fix commit) contains `COULD NOT CONFIRM`, `unconfirmed(`, and `post-clear verification could not read the cookie jar`, all three of which `git grep` confirms are ABSENT at the parent commit b996d1772. The code that ran WAS the fixed code — proven, not assumed, but proven by a different file than the one the operator checked."
    - "F-5-02 — THE NEW GATE HAS A HOLE AT THE MOST LIKELY PRODUCTION SHAPE. Mutation (D), which I ran and which the executor did not: change `if (unconfirmedHosts.length > 0)` to `>= EPIC_COOKIE_HOSTS.length`, i.e. fail only when ALL FIVE hosts are unreadable. Result: 53/53 PASS, exit 0. Nothing notices. Under that mutation a run with four clean reads and ONE rejecting read resolves successfully AND emits `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)` with four numeric zeroes and one `unconfirmed(...)` — an affirmative clean bill covering five domains of which only four were read. That is clause 2's defect at partial granularity. THE SHIPPED CODE IS CORRECT (`> 0`, read and confirmed by me at user.ts:564); this is a GATE-COVERAGE hole, not a product defect, and it is therefore a WARNING and not a blocker. But all three new tests set ALL FIVE reads to the same failing shape, so the per-host granularity — the shape a heterogeneous field failure actually takes — is pinned by nothing. Given this repo's recorded `fixing-a-fail-open-gate-can-create-its-sibling` and `revision-scoped-out-file-breaks-its-gate` history, a later refactor can reintroduce exactly this with a green suite. FIX: one ~10-line test, (e5), with four hosts returning a live jar and the fifth rejecting, asserting the logout REJECTS and the log does NOT contain `Epic-owned cookie(s) remain`. It should land before Phase 38 touches this path, since Phase 38 is where heterogeneous read failure becomes likely."
  mock_blind_spot_confirmed_closed:
    - "The fourth pass's finding is genuinely discharged and I checked all three fixtures rather than the two the brief named. `epicLogoutDomains.test.ts:186` and `user.test.ts:146` both now default `cookiesForDomain` to `{ total: 9, matched: [] }` — a LIVE jar holding no Epic cookies, which is what production looks like after a clean sweep — replacing the bare `jest.fn()` that resolved `undefined` and therefore made every census read `UNSUPPORTED_OR_ERROR`. Exactly FIVE call sites keep the unreadable fixture, each carrying an in-place comment stating that the legacy `total === 0` fail-closed path is that test's actual subject; all five assert `rejects.toThrow(/removed nothing across all 5 Epic-owned domains/)` and throw at the earlier zero-total guard, so none of them reaches or depends on the residual sweep. INTERNALLY COHERENT."
    - "`epicCookieCensus.test.ts:208` still defaults to `cookieRead(0)`, which classifies UNDECIDABLE — but I audited every call site rather than trusting the commit message: all 18 `makeMockSeam({...})` invocations in that file set `cookiesForDomain` explicitly. The stale default is unreachable. Recorded as a latent trap for a future test author, not as a defect."
  d_35_19_15:
    verdict: "CONFIRMED, not overturned. The fourth pass's ruling stands and is now REPRODUCED on a second build and a second jar — but this pass adds NEW live evidence the fourth pass did not have, which strengthens the widening's standing without closing the item."
    what_i_measured: "Read by me directly from gamelib.log: all four sibling apexes report `before(total=23, matched=0)` and `cleared 0`. The fixture is gone, exactly as the fourth pass said, and for exactly the stated reason — the window that used to seed those domains during a logout is what b5b3464bd removed. Unreproducible by any user gesture on this build; do not cite the 19:27 observation as ongoing assurance."
    new_evidence_this_pass: "The domain-SUFFIX half of the widening IS live-exercised on the packaged build, which nothing has previously recorded. My BEFORE decode holds Epic records on THREE distinct domain strings — `.epicgames.com`, `.www.epicgames.com` and `.ecosec.on.epicgames.com` — and the AFTER decode holds none of them, while only the `epicgames.com` host step reported a non-zero clear. So one host entry demonstrably swept three different stored domains through `cookie_domain_matches`'s leading-dot-stripping suffix comparison. What remains unexercised is narrower than 'the widening': it is specifically the four sibling APEXES."
    bears_on_req_35_07: "No, and this pass reaffirms that independently. REQ-35-07's two clauses do not require the sibling-apex proof; that was D-35-19-15's own addition. Both clauses are satisfied without it."
  phase_38_risk_shape_changed:
    - "ELEVATED, and materially different from what the fourth pass recorded — for Phase 38's inheritance, not for Phase 35's score. Before bea07cd17, an off-macOS logout whose census reads all rejected would have RESOLVED and printed a false clean bill. After bea07cd17 it will THROW, and 35-22's renderer guard will raise a user-visible 'Sign-out incomplete' dialog on EVERY Epic logout. The fix converts a silent false-success into a loud guaranteed failure. That is the correct direction for a security property and the wrong outcome for a Windows or Linux user, and the deciding factor — whether a window at the non-resolving `https://gamelib.invalid/` yields a usable cookie store — is untested on both platforms. `38-W04`/`38-W05` should treat this as a first-class item, not as a footnote."
  regressions:
    - "NONE. The entire code diff since the fourth pass (`git diff --stat 6e21558cf..HEAD -- src/ src-tauri/ meta/`) is `legendary/user.ts` plus its three test files; zero Rust, zero meta. Re-measured by me with exit codes captured from the command and never from a pipe: `npx tsc --noEmit` exit 0; `npx jest src/backend` = 188 of 189 suites pass, 4353 passed / 3 failed / 2 skipped, the single failing suite being the pre-existing `decompressPool.test.ts` at exactly 3 failed / 38 passed — UNCHANGED, and the +3 test delta against the fourth pass's 4350 is exactly (e2)/(e3)/(e4)."
  routed_items_reconfirmed:
    - "`pnpm lint` -> Phase 39. RE-MEASURED BY ME, exit captured from the command: exit 1, 4173 problems, NINE errors. The corrected count of 9 is confirmed for a third consecutive pass. Problem count moved 4171 -> 4173 entirely in WARNINGS (the new test comments); `bea07cd17` introduced no new error. Phase 39 exists in ROADMAP.md. Correctly out of scope."
    - "Windows/Linux parity -> Phase 38 (`38-W04`/`38-W05`). Confirmed present in ROADMAP.md. Correctly out of scope — but see `phase_38_risk_shape_changed`, which Phase 38 must inherit."
    - "3 `decompressPool` native-LZMA failures -> RE-MEASURED BY ME on the real path `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`: exit 1, 3 failed / 38 passed / 41 total. Unchanged. Todo `.planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md` confirmed present. Phase 35 attribution already independently disproved twice. Correctly out of scope."
  taken_on_trust_could_not_re_measure:
    - "I did not observe the 22:23 gesture. That the operator genuinely logged in to Epic and out again is INFERRED — from the `oauthLoginCapture status=captured` and `legendary auth --code` lines at 22:23:24, from `before(matched=6)` against a jar my own BEFORE decode shows held 7 Epic records, and from those 7 records having creation stamps of 06:15-06:17Z (= 18:15-18:17 local) that predate the run. Hard to fake, but not watched."
    - "Pre-22:22 log history. gamelib.log holds only this session (66 lines, 34 of them pre-gesture, zero prior `post-clear verification` entries — so nothing in it can be confused with an earlier run, which I verified). Every claim about the 18:15, 19:27 and 21:03 runs is inherited from earlier passes, not re-measured here."
    - "The RED-proof of `b5b3464bd`'s own wipe-step reorder gate. I did not re-run the fourth pass's mutation of the `wipeSteps` array; I verified the ordering live in gamelib.log instead, which is the stronger evidence for that particular claim."
  what_would_close_the_phase:
    - "ONE gesture. Everything else in this file is discharged, resolved, or routed."
sixth_adjudication:
  performed: 2026-08-31 23:12 NZST — SIXTH pass, CLOSURE adjudication. Spawned because the fifth pass set two conditions for closure and the party claiming both were met was the orchestrator that performed them.
  reviewed: "commits `b737b2f42` (the `(e5)` gate) and `68621ed60` (its records); the RELEASE build installed at `/Applications/GameLib.app` and the live Epic logout it performed at 22:54; and the `fifth_adjudication` block above."
  verdict: "BOTH fifth-pass closure conditions are SATISFIED, re-measured by me and not accepted. Score stays 17/17. The phase goal IS achieved. Phase 35 CANNOT close TODAY on records, not on substance: its own `blocking: true` gate document was last written 18:21:02 and its criterion-21 record therefore still measures an artifact predating BOTH `b5b3464bd` (21:11) and `bea07cd17` (22:04) — the exact `R-34.5-G1-PKG` violation the fifth pass named. The gesture that discharges it WAS performed and I verified it end to end; what is missing is the write-back. Two further propagations are unclosed. All three are bounded doc edits."
  method: "Six mutations executed against the real `src/backend/storeManagers/legendary/user.ts` with a `cp` backup and a sha256-verified restore after every one; an independently-written index-walking binarycookies parser (never `strings`, never the orchestrator`s `bc.js`); `ps` inspection of the LIVE process tree; sha256 identity of the installed shell AND sidecar against tonight`s release build outputs; `grep -a` of both installed binaries; source reads of the Rust spawn-mode selector and the macOS census arm; direct read of `gamelib.log`; exit codes captured from BARE commands, never from a pipe."
  condition_1_the_e5_gate:
    verdict: "SATISFIED. `(e5)` is red on D, and — the part that matters — it is SOUND, pinning the tightest possible boundary."
    my_matrix_vs_the_claimed_one: "IDENTICAL on all four claimed mutations. Baseline `npx jest src/backend/storeManagers/legendary/__tests__/` = 54/54, exit 0. (D) `unconfirmedHosts.length > 0` -> `=== EPIC_COOKIE_HOSTS.length`: exit 1, 1 failed / 53 passed, the single death `(e5)`, failure text `Received promise resolved instead of rejected. Resolved to value: undefined` — i.e. under D the mutated product certifies the jar and `logout()` RESOLVES, which is F-5-02 exactly. (A) trustworthy gate + unconfirmed branch deleted: exit 1, 4 failed / 50 passed, set `{(e2),(e3),(e4),(e5)}`. (B) `throw` deleted, `logWarning` kept: exit 1, 4 failed / 50 passed, set IDENTICAL to A. (C) `trustworthy` widened to accept `UNDECIDABLE`: exit 1, 1 failed / 53 passed, `(e4)` alone. No claimed number is off by one."
    two_mutations_nobody_had_run: "(E) `unconfirmedHosts.length > 1` — fail only when TWO OR MORE hosts are unreadable: exit 1, 1 failed / 53 passed, `(e5)` ALONE. This is the probe that decides soundness rather than redness. D only proves `(e5)` catches the 1-vs-5 extreme; E proves it catches 1-vs-2, the tightest boundary the predicate has. `(e5)` is therefore an exact pin on `> 0`, not a coarse one. (F) the affirmative `logInfo` moved BEFORE the unconfirmed check, `throw` retained — the `durable false record` failure, where the logout correctly rejects but still writes `0 Epic-owned cookie(s) remain` into a log this repo greps to score live gates: exit 1, 3 failed / 51 passed, `{(e3),(e4),(e5)}`. `(e5)`s `not.toContain` catches it at PARTIAL granularity, which `(e3)` could not. The gate is not vacuous, is discriminating, and is boundary-exact."
    soundness_audit_of_e5_itself: "Every specific the brief asked me to test, checked against the file rather than the commit message. TARGETING — `unrealengine.com` is index 2 of 5 in both `EPIC_COOKIE_HOSTS` (user.ts:97-103) and the test`s independent copy `EPIC_HOSTS_UNDER_TEST`, so it is genuinely a MIDDLE host and no first/last short-circuit can satisfy it. The clear loop calls `readHostCensus` TWICE per host (user.ts:407 `before`, :409 `after`), so calls 1-10 are the clear loop and 11-15 the verification sweep in host order; call 13 is the third sweep read. `toHaveBeenCalledTimes(3*N)` = 15 proves the sweep ran to completion — had control thrown at the earlier `brokenHosts` or `total === 0` guards, only 10 reads would exist. THE DIRECT PROOF — `readHostCensus`s catch (user.ts:356-367) emits `${host} cookie census read failed` exactly ONCE per rejecting read, so `logged.match(/cookie census read failed/g)` having length exactly 1 is a genuine proof that no clear-loop read rejected. NON-TAUTOLOGY — `rejectedRead.host` is captured from the mock`s OWN `hostArg`, so the assertion tests what the product passed; only `index` is self-referential, and that is the harmless half. FIXTURE COHERENCE — before `(9,3)` -> clear 3 -> after/verify `(6,0)`: 9-3=6 balances, the first read sets `everProvedLive`, the before side is `SUPPORTED_NONEMPTY` with a NONZERO delta so `brokenHosts` does not fire, and the summed total is 15 so the `total === 0` guard does not fire. Control demonstrably reaches the sweep. This is the coherence whose absence hid the defect family twice."
    the_discriminators_do_distinguish_partial_from_total: "Checked one at a time, which is what the brief asked. `(e3)`s ``not.toContain(`${host}=0,`)`` was correctly NOT copied — in this fixture four hosts legitimately record a zero, so copying it would have produced a WRONG test. The four used instead each fail on an all-five fixture: (i) `rejects.toThrow(/could not read the cookie jar for unrealengine\\.com —/)` — the EM-DASH immediately after a single host name; the all-five message continues `unrealengine.com, twinmotion.com…`, so the regex cannot match it; (ii) `toContain(`1 of 5 domain(s)`)` — the all-five case prints `5 of 5`; (iii) `toContain(`unrealengine.com=unconfirmed`)` combined with (iv) a POSITIVE `toContain(`${host}=0`)` for each of the other four — in the all-five case every host reads `=unconfirmed(...)` and `epicgames.com=0` never appears. All four are genuine partial-vs-total discriminators."
    residual_hole_recorded_not_scored: "`(e5)` pins a partial failure in the FINAL VERIFICATION sweep. A partial failure in the CLEAR loop (one host`s before/after read rejecting while four succeed) is a different family and is pinned by nothing in this file. It is NOT what F-5-02 raised, the fifth pass did not scope it, and the shipped `brokenHosts` rule handles the populated-host case; recorded here as a latent trap for whoever next touches this loop, INFO, not a gap."
  condition_2_the_release_live_gate:
    verdict: "SATISFIED, and the build-identity chain is now closed at a point no previous pass reached — the RUNNING PROCESS."
    build_identity_chain_closed_at_the_process: "F-5-01`s lesson was that an identity check can interrogate an artifact the build guarantees is never loaded. I closed the chain at the other end. `ps -Ao pid,ppid,lstart,command` RIGHT NOW: PID 9781 = `/Applications/GameLib.app/Contents/MacOS/gamelib-shell` (started 22:52:34) whose child PID 9787 = `/Applications/GameLib.app/Contents/MacOS/gamelib-sidecar` (22:52:37) — the BUNDLED SEA, NOT `node …/build/main/sidecar.js`. That is the release spawn path executing, observed live, and it is the single check that the fourth pass`s reasoning failed and the fifth pass could only predict. Structurally corroborated in source: `use_dev_sidecar()` is `cfg!(debug_assertions)` ALONE (main.rs:6746-6748) with a doc comment stating a release build can never take the dev path. THEN the hashes: installed `gamelib-shell` sha256 `be820645…7fe961c` is BYTE-IDENTICAL to `src-tauri/target/release/gamelib-shell` built 22:49:54; installed `gamelib-sidecar` sha256 `6d63ed17…d92c611` is BYTE-IDENTICAL to `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin` built 22:48. THEN the code: the installed SEA contains `post-clear verification COULD NOT CONFIRM` x2, `unconfirmed(` x2, `could not read the cookie jar for` x2, all three `git grep`-confirmed ABSENT at the parent commit `b996d1772` and present x2/x2/x1 in `src/backend` at HEAD. Four independent links, no gap."
    the_forbidden_source_is_structurally_ruled_out: "35-LIVE-GATE.md:42 forbids taking the `.app` from `src-tauri/target/release/bundle/macos/` because it can hold a stale artifact. I checked: that directory contains ONLY `GameLib.app.tar.gz` dated Aug 23 11:50 and NO `.app` at all — so the operator could not have taken it from there even by mistake. The DMG `GameLib_0.7.0_aarch64.dmg` (530,984,320 B) exists at 22:49:54. The stale-artifact class is excluded mechanically, not by assertion."
    log_read_by_me_line_by_line: "`~/Library/Logs/GameLib/gamelib.log` is 69 lines and its FIRST line is stamped 22:52:37 — it is the release process`s own log and holds nothing else, so no earlier run can be confused with it. Line 61 `cleared storage — localStorage=3, sessionStorage=0, indexedDB=0, caches=0, serviceWorkers=0` PRECEDES all five `cleared N <host> cookie(s)` lines (62-67): the load-bearing wipeStep reorder from `b5b3464bd` is live-exercised UNDER THE SEA for the first time. Line 62 `epicgames.com … before(total=31, matched=8, verdict=SUPPORTED_NONEMPTY) after(total=23, matched=0, verdict=SUPPORTED_NONEMPTY)`. Line 68 `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s) — epicgames.com=0, fortnite.com=0, unrealengine.com=0, twinmotion.com=0, metahuman.com=0` — five NUMERIC zeroes, and all five verdicts on both sides are `SUPPORTED_NONEMPTY`, so every read cleared the trustworthiness bar under the shipped predicate. Counts of `unconfirmed(`, `COULD NOT CONFIRM`, `census read failed`, `UNSUPPORTED_OR_ERROR`, `UNDECIDABLE`, `[ERROR]`, `Sign-out incomplete` and `build/main/sidecar.js`: ZERO, each."
    my_own_jar_decode: "I wrote my own page/offset index-walking parser for this pass and did NOT use the orchestrator`s `bc.js`. THE ARTIFACTS ARE GENUINE: the live jar `~/Library/HTTPStorages/com.gamelib.shell.binarycookies` (mtime 22:54:10) has sha256 `6d5b47dd…bb2c06b`, IDENTICAL to `AFTER-release.binarycookies`; and `BEFORE-release.binarycookies` is byte-identical to `AFTER-packaged.binarycookies` (`cabcdd58…41a8d87`), which independently proves the two runs chain — the 22:23 packaged run`s end state IS the 22:54 release run`s start state. THE MEASUREMENT: BEFORE-release = 23 records, all live, ZERO Epic. AFTER-release = 23 records. A record-level set difference over (domain, name, path, value-length, expiry, creation) is EMPTY IN BOTH DIRECTIONS — zero added, zero removed, zero mutated. The jar returned EXACTLY to its pre-login state, so the 8 Epic records the product reported creating and removing left no trace and cost no collateral: all 23 surviving records are Humble/hcaptcha, including the live `_simpleauth_sess` Humble credential, untouched. Arithmetic closes: 23 + 8 = 31 = the product`s `before(total=31)`; 31 - 8 = 23 = the decoded AFTER. NAME-AGNOSTIC BYTE SCAN of the raw file — `EPIC`, `Epic`, `__cf_bm`, `SESSION_AP`, `epicSID`, `_tald`, `EPIC_DEVICE`, `EPIC_LOGIN_ID`, `fortnite`, `unrealengine`, `twinmotion`, `metahuman`, `egs` ALL ZERO in both snapshots. `epicgames` occurs EXACTLY ONCE; I dumped its byte context rather than assuming, and it is `api.hcaptcha.com hmt_id` -> `bplist00 … StoragePartition … https://epicgames.com`, a partition key correctly RETAINED (clearing it is the REQ-34.4.1-06 harm)."
    a_structural_weakness_of_this_run_that_the_packaged_run_did_not_have: "Recorded because it cuts against the run I am approving. The BEFORE-release snapshot was taken at 22:49, BEFORE the 22:53 login, so it holds ZERO Epic records. The 8 Epic cookies existed only between login and logout and were NEVER captured in a snapshot. So unlike the 22:23 packaged run — whose BEFORE artifact I re-decoded and which genuinely holds 7 Epic records across THREE domain strings — this run cannot produce a `removed exactly these N Epic records` set difference. Its clause-1 proof is instead: the product`s own `before(total=31, matched=8)`, the arithmetic, and an AFTER that is record-for-record identical to a BEFORE known to be Epic-free. That is sound and it is sufficient, but it is a DIFFERENT and slightly weaker shape than the fifth pass`s, and anyone citing this run should cite it accurately."
  the_two_honesty_flags_adjudicated:
    flag_1_fail_closed_path_never_fired: "NOT DISQUALIFYING, and I verified the reason in Rust source rather than accepting it. On macOS the census cannot reject by any user gesture: `humble_login_cookies_for_domain`s Epic arm (main.rs:6471-6474) is `#[cfg(target_os = \"macos\")]` and fires whenever `existing_window.is_none() && epic_cookie_domain_matches(domain)` — and Epic`s login window is the pristine `WindowBuilder` window that `get_webview_window(label)` can NEVER resolve, so that condition is ALWAYS true and control ALWAYS reaches `default_data_store_cookies_for_domain`, which reads `WKWebsiteDataStore::defaultDataStore()` — unconditionally available. There is no operator-drivable state that makes it reject. Producing a live negative would require shipping fault injection into the exact path that establishes the logout security property. That is not a legitimate closure gate, and a RED-proven unit gate is the correct substitute — one exists, and I proved it discriminating and boundary-exact with SIX mutations including two nobody had run. HOWEVER, the honest statement is narrower than `unprovable`: this branch IS reachable off macOS, and its live proof is therefore DEFERRED TO PHASE 38 rather than impossible. That deferral is only legitimate if Phase 38 can find it — see gap `SIXTH PASS G-6-02`, which is precisely the finding that it cannot."
    flag_2_the_dmg_predates_e5: "NOT DISQUALIFYING, and I converted it from a substance ARGUMENT into a MEASUREMENT rather than accepting the claim. `b737b2f42` is test-only, but `test-only therefore harmless` is exactly the reasoning that produced F-5-01, so I checked the artifact instead: `sentinel-cookie-`, `SOME-vs-ALL`, `EPIC_HOSTS_UNDER_TEST`, `synthetic-not-a-real-token`, `epicCookieCensus` and `makeMockSeam` all occur ZERO times in BOTH the installed SEA and the installed shell, and the literal string `__tests__` occurs ZERO times in the SEA. No test file is bundled. `b737b2f42` therefore CANNOT alter the release artifact, and the artifact built at 22:48/22:49 is bit-for-bit what HEAD produces for every byte that ships. R-34.5-G1-PKG is satisfied on its PURPOSE — the artifact contains the code under test — while failing on raw mtime ordering. The rule is not mechanical here because the exception is mechanically establishable, and I established it. This exception should NOT be generalised: it holds only because the intervening commit provably contributes no bytes."
  d_35_19_15:
    verdict: "CONFIRMED for a third consecutive pass. The release run neither strengthens nor weakens it."
    on_the_release_run: "Read by me from gamelib.log: all four sibling apexes report `before(total=23, matched=0)` and `cleared 0`. The apex half is UNEXERCISED, exactly as the fourth and fifth passes recorded."
    the_suffix_half_reproduced_by_me: "I re-decoded `BEFORE-packaged.binarycookies` with my own parser and CONFIRM the fifth pass`s evidence rather than inheriting it: 30 records (28 live + 2 expired), 7 Epic-owned across THREE distinct stored domain strings — `.epicgames.com` (5 live: EPIC_DEVICE, EPIC_LOGIN_ID, EPIC_SESSION_AP, _epicSID, _tald), `.www.epicgames.com` (1 expired `__cf_bm`) and `.ecosec.on.epicgames.com` (1 expired `__cf_bm`) — while AFTER-packaged holds 23 and none of them. Only the `epicgames.com` host step reported a non-zero clear, so ONE host entry swept THREE stored domains through `cookie_domain_matches`s leading-dot-stripping suffix comparison. The domain-SUFFIX half is live-proven; the four sibling APEXES are not, and cannot be without a seeding vehicle."
    an_arithmetic_note_now_fully_explained: "The fifth pass left a one-record gap unresolved (product `before(total=29, matched=6)` vs its decode of 30/7). My decode RESOLVES it: BOTH `__cf_bm` records were EXPIRED (exp 2026-08-31T06:45Z, four hours before the gesture), so the jar held 30 records of which 28 were live. 30 - 1 pruned = 29 and 7 - 1 = 6 fits exactly if WebKit pruned ONE expired `__cf_bm` between the 22:08 snapshot and the 22:23 read. Direction is CONSERVATIVE — the product under-reported what it removed and never over-claimed. Recorded, still not scored."
  three_records_gaps_the_only_thing_standing_between_this_phase_and_closure:
    - "G-6-01 (BLOCKER) — THE PHASE`S OWN `blocking: true` GATE DOCUMENT HAS NOT BEEN TOLD. `35-LIVE-GATE.md` mtime is 2026-08-31 18:21:02 and it contains ZERO occurrences of `b5b3464bd`, `bea07cd17`, `22:23`, `22:54`, `COULD NOT CONFIRM`, `post-clear verification` or `total=31`. Its criterion-21 record therefore still measures an artifact predating BOTH behaviour-changing product commits — the `R-34.5-G1-PKG` violation the fifth pass named as THE remaining gate. The gesture that discharges it WAS performed and I verified every link of it; what is missing is the write-back into the normative document. A `blocking: true` gate whose record is stale cannot certify closure, and this repo has been bitten by the record-vs-substance split repeatedly (`summary-can-be-wrong-while-the-record-is-right`, `status-doc-can-lag-two-gate-runs-undetected`)."
    - "G-6-02 (BLOCKER) — THE PHASE 38 INHERITANCE IS RECORDED WHERE PHASE 38 WILL NEVER LOOK. The fifth pass elevated `bea07cd17`s off-macOS consequence for `38-W04`/`38-W05`, but it wrote that elevation into `35-VERIFICATION.md` only. `38-VERIFICATION.md` (mtime Aug 30 07:33, i.e. a day and a half BEFORE `bea07cd17` existed) contains ZERO occurrences of `bea07cd17`, `Sign-out incomplete`, `fail-closed`, `census`, `gamelib.invalid` or `post-clear` — I grepped all six. `38-W04` and `38-W05` as written are pure smoke-launch items (`install it, launch it, a window appears, survives 10 seconds`); a Windows operator running 38-W04 verbatim would PASS it without ever touching an Epic logout. And Phase 38`s own doctrine is explicit that this is fatal: ROADMAP.md:4531 makes `38-VERIFICATION.md` the phase`s source of truth and the array `gsd-sdk query audit-uat` reads, and that file`s own `audit_tool_note` says `this phase`s ENTIRE content is that array`. Once Phase 35 closes, the risk evaporates. This is the recorded `gap-can-fall-between-two-correct-plans` shape."
    - "G-6-03 (WARNING) — `REQUIREMENTS.md` REQ-35-07 CARRIES A SUPERSEDED CLOSURE PREMISE. The status cell at line 429 still reads `Partial … the post-clear-read-confirms-it contract stays Partial, not Complete, until plan 35-29`s criterion-21 live-gate re-run seeds and confirms-present a cookie on a non-primary Epic domain before logout, per D-35-19-15`, and the body text at line 1143 still ends `Still NOT Complete: D-35-19-15`s sibling-domain sub-criterion remains unexercised`. TWO independent passes (fourth and fifth) have now ruled that the sibling-apex seeding is D-35-19-15`s own addition and is NOT a REQ-35-07 clause, and I reaffirm that a third time from the requirement`s own text — it says `a post-clear read confirms it`, not `on a seeded non-primary apex`. If the closing workflow flips the checkbox without rewriting that clause, the record will assert a condition that was never satisfied. That is the recorded `gate-can-force-a-false-record` shape and it must be rewritten, not merely ticked."
  a_records_inconsistency_info_only:
    - "`35-REVIEW.md` frontmatter says `status: issues_resolved` (line 98) and all four criticals carry in-place `RESOLVED — plan 35-2x` annotations (CR-01 -> 35-21, CR-02 -> 35-21, CR-03 -> 35-22, CR-04 -> 35-23), which DISCHARGES the fifth pass`s `what remains is a records pass`. But the BODY headline at line 106 still reads `**Status:** issues_found`, contradicting its own frontmatter. One line. INFO."
  a_standing_project_blocker_that_is_now_FALSIFIED:
    - "Two STATE.md quick-task records (`260830-ibr`, `260830-k4m`) assert that `a local release rebuild is still blocked by createUpdaterArtifacts: true with no signing key`. That is now FALSE and I verified it: `src-tauri/tauri.conf.json` still carries `createUpdaterArtifacts: true` (line 48) with the same pubkey and endpoint, `git status src-tauri/` is CLEAN so the config was NOT temporarily mutated for tonight`s build, and a full release build nonetheless completed at 22:49:54 producing both `gamelib-shell` and the 0.7.0 DMG. `bundle/macos/` was NOT regenerated (its tarball is still dated Aug 23), so the updater artifact step evidently no-ops rather than failing the build. Recorded because it removes a blocker that has been cited across several phases, including against gate criterion 13 and criterion 17."
  why_human_needed_and_not_gaps_found:
    - "MEASURED, not reasoned. The Step-9 decision tree points at `gaps_found` because G-6-02 is a FAILED item. I set it, then ran `gsd-sdk query audit-uat` and read the output: with `status: gaps_found` Phase 35 is ABSENT FROM THE RESULTS ARRAY ENTIRELY — the audit returned phases 27, 30, 32, 33, 34, 34.13 and 38 and no 35 at all. Its seven `human_verification` items go with it, INCLUDING the one that is genuinely still open (gate criterion 14`s UI half — the Library repaint was never observed, only the push message). That is the recorded `audit-uat` failure mode (`parseVerificationItems` emits items only when `status === human_needed`) firing on this file. I would have been writing a blocker into a document while simultaneously making that document invisible to the tool that consumes it — the exact defect G-6-02 raises. `human_needed` is ALSO factually correct: an unobserved human item does remain. The three blockers are carried in `gaps:`, which the orchestrator reads directly from this file and which `/gsd:plan-phase --gaps` consumes independently of status. Re-verified after the change: Phase 35 reappears in `audit-uat` with its items intact."
    - "F-6-01 (new, and not previously recorded anywhere in this phase) — THE STATUS FIELD ON A VERIFICATION.md IS A LOAD-BEARING TOOLING SWITCH, NOT A LABEL. Setting it to the value the verification decision tree prescribes can silently delete a phase from the project-wide UAT audit. The project`s notes record this for Phase 34.1 and for Phase 38`s collection file; this is the first time it has been measured on a normal phase, and it means the decision tree and the tooling are in direct conflict whenever a phase has BOTH a failed item and an open human item. Worth a todo against the tooling, not against Phase 35."

  regressions:
    - "NONE, and the scope makes a regression structurally impossible. `git diff --stat a9ef3026a..HEAD -- src/ src-tauri/ meta/ .github/ package.json` is ONE file: `epicCookieCensus.test.ts`, +105/-2. Zero product code, zero Rust, zero meta, zero CI. Working tree carries only the uncommitted `35-VERIFICATION.md`. RE-MEASURED BY ME with exit codes captured from BARE commands: `npx tsc --noEmit` exit 0. `npx jest src/backend` exit 1 — 188 of 189 suites pass, 4354 passed / 3 failed / 2 skipped; the +1 against the fifth pass`s 4353 is EXACTLY `(e5)`, fully accounted. `meta/__tests__/genI18nGateScope.test.ts` exit 0, 26 passed / 1 skipped / 0 failed — the A-17 anti-rot gate is unchanged and non-vacuous."
  routed_items_reconfirmed:
    - "`pnpm lint` -> Phase 39. RE-MEASURED, exit from the bare command: exit 1, 4174 problems, NINE errors — the corrected count of 9 now confirmed a FOURTH consecutive time, and I counted the `error`-severity lines independently (9) rather than reading the summary alone. 4173 -> 4174 is entirely WARNINGS from `(e5)`s comments; `b737b2f42` introduced no new error. Correctly out of scope."
    - "Windows/Linux parity -> Phase 38 (`38-W04`/`38-W05`). Confirmed present in `38-VERIFICATION.md` at lines 105 and 128. Correctly out of scope — but see gap `SIXTH PASS G-6-02`: what those two items SAY does not include the risk Phase 35 is handing them."
    - "3 `decompressPool` native-LZMA failures -> RE-MEASURED on the real path `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`: exit 1, 3 failed / 38 passed / 41 total. Unchanged. Todo `.planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md` confirmed present. Correctly out of scope."
  housekeeping_checked_not_trusted:
    - "`.planning/STATE.md`: 8152 lines, `---` at 1 and 784, 10 `## ` headings — all three match the brief exactly. The executor`s commit `68621ed60` changed it by `1 insertion, 0 deletions` (`git diff --numstat`), a single row appended to the Quick Tasks Completed table for `260831-vmc`, present and correct. NO NEW CORRUPTION, proven the strong way rather than the weak one: sha256 of lines 1-784 (the whole frontmatter region) is `52007a5f…6c0ccad2` BEFORE and AFTER, byte-identical, so whatever YAML condition exists there is untouched by definition. The frontmatter still fails to parse — the actual error is `All collection items must start same column`, which is a DIFFERENT diagnosis from the long-standing `unescaped quote` hypothesis in the project`s notes and may be worth a separate look. Pre-existing either way, not this task`s damage."
    - "CORRECTION TO THE BRIEF: `.planning/quick/260831-vmc-epic-census-partial-unconfirmed-gate/` is NOT untracked. It was committed in `68621ed60` and `git ls-files` returns both `260831-vmc-PLAN.md` and `260831-vmc-SUMMARY.md`. `git status --porcelain --untracked-files=all` on that directory is empty."
    - "`package.json` has NO release build script — confirmed. The only two Tauri scripts are `tauri:dev` and `tauri:dev:packaged`, the latter being `tauri build --debug`. The release chain `pnpm exec vite build && pnpm build:sidecar-sea && pnpm exec tauri build` exists only as PROSE in 35-LIVE-GATE.md`s header. Given that the fifth pass proved a `--debug` bundle structurally never loads the SEA, the absence of a scripted release path is a standing hazard: the easy command is the one that cannot measure the artifact. Not a Phase 35 gap; worth a todo."
  what_i_verified_myself_versus_took_on_trust:
    verified_myself: "The entire mutation matrix (6 mutations, 2 previously unrun) with sha256-verified restores and `git diff` empty after every one; the `(e5)` source, its targeting arithmetic and every one of its discriminators; `user.ts`s residual sweep and `readHostCensus`; the Rust spawn-mode selector and the macOS census arm; the LIVE process tree; sha256 identity of both installed binaries against tonight`s build outputs; `grep -a` of both installed binaries for fix markers AND for test-file absence; `git grep` of the markers at the parent commit; all 69 lines of `gamelib.log`; an independent index-walking decode of all four jar snapshots with my own parser; the raw-byte name-agnostic scan; tsc, jest, lint, the i18n gate and decompressPool with exit codes from bare commands; STATE.md`s diff and frontmatter byte-identity; and the absence of the Phase 38 record."
    took_on_trust: "I did not witness the 22:52-22:54 gesture. That a human logged in to Epic and out again is INFERRED — from `oauthLoginCapture … nav host=www.epicgames.com` then `status=captured` at 22:53:14-22:53:52, from `legendary auth --code` at 22:53:52, from `legendary auth -` (logout) at 22:54:00, and from a jar that went 23 -> (31 per the product) -> 23. Consistent and hard to fake; not watched. I also did not re-derive the 18:15, 19:27, 21:03 or 22:23 gesture histories, only the artifacts they left."
  what_would_close_the_phase:
    - "THREE DOC EDITS. No gesture, no code change, no rebuild. (1) Write the 22:52-22:54 release run into `35-LIVE-GATE.md` criterion 21 — the evidence is fully assembled in this block and needs only to be moved into the normative document. (2) Add ONE item to `38-VERIFICATION.md`s `human_verification` array for the off-macOS Epic-logout consequence of `bea07cd17`, MOVING it there rather than cross-referencing, per that file`s own `audit_tool_note`. (3) Rewrite REQ-35-07`s superseded `until … seeds and confirms-present a cookie on a non-primary Epic domain` clause in `REQUIREMENTS.md` before ticking its box. Optionally also fix `35-REVIEW.md` line 106."

gaps:
  - truth: "SIXTH PASS G-6-01 (BLOCKER) — the phase`s own `blocking: true` gate document records criterion 21 against an artifact that predates two behaviour-changing product commits"
    status: resolved
    resolved_by: "quick `260901-vuy` (2026-09-01). 35-LIVE-GATE.md now carries a POST-FIX ADDENDUM recording the 22:52:34-22:54:10 RELEASE run: the build-identity chain closed at the RUNNING PROCESS (PID 9781 shell spawning PID 9787 BUNDLED gamelib-sidecar, both sha256-identical to that build`s outputs), before(total=31, matched=8) -> after(total=23, matched=0), five numeric zeroes with five SUPPORTED_NONEMPTY verdicts, and an independent index-walking jar parse whose BEFORE/AFTER set difference is empty in BOTH directions. The frontmatter verdict header now carries the freshness contract, and addendum_date: 2026-09-01 was added. APPENDED, NOT REWRITTEN — the original 18:15 record stands as measured, because the phase`s history is evidence. D-35-29-02 is resolved there; D-35-19-15, criterion 14 and criterion 10 explicitly are NOT."
    reason: "RECORDS, NOT SUBSTANCE — the gesture was performed and the sixth pass verified every link of it independently. `35-LIVE-GATE.md` mtime is 2026-08-31 18:21:02; grep counts inside it for `b5b3464bd`, `bea07cd17`, `22:23`, `22:54`, `COULD NOT CONFIRM`, `post-clear verification` and `total=31` are ALL ZERO. Its criterion-21 verdict therefore rests on a build predating `b5b3464bd` (21:11, removes the re-seeding window and reorders the wipe steps) and `bea07cd17` (22:04, makes an unconfirmable read FATAL). That is exactly the `R-34.5-G1-PKG` violation the fifth pass named as THE remaining gate, and the document that decides closure is `blocking: true`."
    artifacts:
      - path: ".planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md"
        issue: "criterion 21 (line 1341) and its re-run verdict (line 1713) carry no record of the 22:52-22:54 RELEASE run; the file has not been written since 18:21:02"
    missing:
      - "Write the 22:52:34-22:54:10 release-build run into criterion 21: release chain `pnpm exec vite build && pnpm build:sidecar-sea && pnpm exec tauri build`; DMG `GameLib_0.7.0_aarch64.dmg` 22:49:54; installed shell sha256 `be820645…7fe961c` == `src-tauri/target/release/gamelib-shell`; installed SEA sha256 `6d63ed17…d92c611` == `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`; RELEASE SPAWN PATH CONFIRMED LIVE by `ps` (PID 9781 shell -> PID 9787 = the bundled `gamelib-sidecar`, NOT `node`); gamelib.log lines 61-68 with `cleared storage` preceding all five host lines and `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)` with five numeric zeroes; independent jar decode BEFORE 23 / AFTER 23 with an EMPTY record-level set difference in both directions and a name-agnostic byte scan reading zero for every Epic cookie name."
      - "Update the file`s `rerun_date` / verdict header so the freshness contract is visible without reading 35-VERIFICATION.md."
  - truth: "SIXTH PASS G-6-02 (BLOCKER) — the Phase 38 inheritance created by `bea07cd17` is recorded only in 35-VERIFICATION.md, which Phase 38 does not read"
    status: resolved
    resolved_by: "quick `260901-vuy` (2026-09-01). Added item `38-W06` to 38-VERIFICATION.md`s human_verification array — a NEW item, not a note on 38-W04/38-W05, both of which are smoke-launch items a Windows operator passes without ever touching a logout. Two-way receipt carried in its origin_phase/origin_item. VERIFIED AT THE TOOL, not by reading the file: gsd-sdk query audit-uat moved phase 38 from 29 to 30 items and the total from 54 to 55. That increment IS the check — a flat count after an insert would mean the array stopped parsing and the item was silently dropped, which is this file`s own recorded silent failure mode. NOTE ON THE CLAIM THIS GAP MADE: it asserted a GUARANTEED user-visible failure off macOS. The relocated item deliberately does NOT assert that. bea07cd17 makes an unreadable jar throw, but whether the census reads actually reject off macOS is UNVERIFIED — Windows and Linux still open a real window (the default-data-store fallback is #[cfg(target_os = macos)]), now pointed at gamelib.invalid, and whether cookies_for_domain succeeds against a non-resolving page has never been observed. 38-W06 asks for the observation and accepts either outcome."
    reason: "`bea07cd17` converts the off-macOS Epic logout from a SILENT FALSE SUCCESS into a GUARANTEED user-visible `Sign-out incomplete` failure, because `default_data_store_cookies_for_domain` is `#[cfg(target_os = \"macos\")]` and Windows/Linux still need a real window that the cookie step now points at the deliberately non-resolving `https://gamelib.invalid/`. The fifth pass elevated this for `38-W04`/`38-W05` — but only inside 35-VERIFICATION.md. `38-VERIFICATION.md` (mtime Aug 30 07:33, predating the commit by a day and a half) has ZERO occurrences of `bea07cd17`, `Sign-out incomplete`, `fail-closed`, `census`, `gamelib.invalid` and `post-clear`; all six greps were run. `38-W04`/`38-W05` as written are smoke-launch items only — a Windows operator running 38-W04 verbatim passes it without ever touching an Epic logout. ROADMAP.md:4531 makes `38-VERIFICATION.md` the phase`s source of truth and the array `audit-uat` reads; that file`s own `audit_tool_note` states `this phase`s ENTIRE content is that array`. Closing Phase 35 without this write evaporates the risk."
    artifacts:
      - path: ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md"
        issue: "no `human_verification` item covers the Epic-logout fail-closed consequence; 38-W04 (line 105) and 38-W05 (line 128) are smoke-launch only"
    missing:
      - "Add ONE new item to `38-VERIFICATION.md`s `human_verification` array (a NEW item, not a note on 38-W04, per that file`s own rule that a cross-reference is invisible to `audit-uat`): test = on the Windows and on the Linux build, log in to Epic and log out; expected = the logout completes and `gamelib.log` shows `post-clear verification — 0 Epic-owned cookie(s) remain` with five NUMERIC zeroes and no `unconfirmed(`; why_human = `bea07cd17` makes any unconfirmable census read FATAL, and off macOS the census must resolve through a real window pointed at the non-resolving `https://gamelib.invalid/` — if that window yields no usable cookie store, EVERY Epic logout raises `Sign-out incomplete`. This is the ONLY environment in which the fail-closed branch can be live-exercised at all."
      - "Carry `origin_phase: \"35\"` and an `origin_item` naming `bea07cd17` so the two-way receipt discipline the phase already uses is preserved."
  - truth: "SIXTH PASS G-6-03 (WARNING) — REQUIREMENTS.md REQ-35-07 carries a closure premise that two independent passes have ruled is not one of its clauses"
    status: resolved
    resolved_by: "quick `260901-vuy` (2026-09-01). REQ-35-07 marked Complete at REQUIREMENTS.md:429 and :1143, and the D-35-19-15 sibling-apex seeding STRUCK as a condition of it — two independent adjudication passes ruled it is not a REQ-35-07 clause, and b5b3464bd made it structurally unreproducible by removing the window that was the only thing ever seeding those four apexes during a logout. D-35-19-15 SURVIVES as a residual of its own and is NOT closed."
    reason: "The status cell (line 429) still states the contract `stays Partial, not Complete, until plan 35-29`s criterion-21 live-gate re-run seeds and confirms-present a cookie on a non-primary Epic domain before logout, per D-35-19-15`, and the body text (line 1143) still ends `Still NOT Complete: D-35-19-15`s sibling-domain sub-criterion remains unexercised`. The fourth and fifth passes both ruled the sibling-apex seeding is D-35-19-15`s own addition, not a REQ-35-07 clause; the sixth pass reaffirms it a third time from the requirement`s own text, which says `the app does not report success unless a post-clear read confirms it` and says nothing about a seeded non-primary apex. The seeding is ALSO structurally unreproducible on this build — `b5b3464bd` removed the only vehicle that ever populated those domains — so leaving the clause in place makes REQ-35-07 permanently unsatisfiable. If the closing workflow ticks the box without rewriting it, the record asserts a condition never met."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "line 429 status cell and line 1143 body text both condition REQ-35-07 on the D-35-19-15 sibling-apex seeding"
    missing:
      - "Rewrite both passages with a dated correction: REQ-35-07`s two clauses are satisfied and were verified on a RELEASE artifact at 22:54 on 2026-08-31; the sibling-apex seeding is D-35-19-15`s own sub-criterion, is not a REQ-35-07 clause, and remains unreproducible by construction with no later phase owning it."
      - "Only then tick the REQ-35-07 checkbox at line 1143."

  - truth: "REQ-35-20 — the phase closes on a BLOCKING packaged macOS arm64 live gate; its own text says 'Any FAIL means the phase does not close'"
    status: resolved
    resolved_by: "plan 35-29 live-gate re-run, 2026-08-31 — all four FAIL criteria (6, 10, 14, 16) re-measured PASS on the packaged 0.7.0 artifact, plus criterion 21 re-measured and regression checks 4, 5, 15 held. 8 measured / 8 PASS / 0 FAIL. See the RE-RUN section of 35-LIVE-GATE.md. VERIFIER CONFIRMED each named cause has a landed fix in the codebase, not merely a claim: protocol.ts:26 RUNNERS now includes 'steam'; storeManagers/steam/launchDispatch.ts dispatchSteamLaunch is the single shared launch+addRecentGame path called from BOTH protocol.ts:163 and steamFlowRegistration.ts:358; installedJsonWatcher.ts emits sendFrontendMessage('refreshLibrary','legendary') AFTER refreshInstalled() resolves; GlobalState.tsx classifySleepAssertionKind/reconcileSleepAssertionCalls split the two assertion kinds. QUALIFIED: criterion 10 proves the argv delivery path only; criterion 14's visible repaint was UNOBSERVED; criterion 21 passes its contract but D-35-19-15 remains OPEN (D-35-29-01). FURTHER QUALIFICATION ADDED BY THE VERIFIER: 13 of the 21 criteria were NOT re-measured and carry forward verdicts taken on the Aug 30 build; only criteria 4, 5 and 15 guard that carry-forward."
    reason: "35-LIVE-GATE.md is `blocking: true` and its recorded verdict is FAIL — 17 PASS / 4 FAIL / 0 NOT ATTEMPTED over 21/21 measured criteria. The requirement's own closure clause is therefore unmet. Two of the four FAILs (6, 10) are on surfaces THIS PHASE built (tray recent-games, `gamelib://` deep link); their root causes are pre-existing, but the phase shipped new user-facing affordances on top of them without measuring them first."
    artifacts:
      - path: ".planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md"
        issue: "verdict: FAIL. Criteria 6, 10, 14, 16 FAIL."
      - path: "src/backend/protocol.ts"
        issue: "line 15 — `RUNNERS = z.enum(['legendary','gog','nile','sideload'])` omits `steam` while `storeManagers/index.ts` registers six managers including `steam`. `findGame()`'s fallback loop iterates `RUNNERS.options`, so a Steam deep link can never resolve. Verified independently in code."
      - path: "src/backend/launcher.ts"
        issue: "line 320 — the ONLY `addRecentGame` call site, unreachable on the Steam `steam://rungameid` handoff path."
      - path: "src/backend/sidecar/installedJsonWatcher.ts"
        issue: "line 86 — the debounced refresh sends no frontend message, so the renderer never repaints."
    missing:
      - "Re-run the four FAIL criteria on a packaged build once their causes are fixed — DONE 2026-08-31"

  - truth: "REQ-35-16 — the three folded Tauri channel dead ends are closed, and each fix is attributed to a named layer"
    status: resolved
    resolved_by: "plans 35-20 (installed.json UI half) and 35-25 (winetricks). BOTH arms of this gap's own `missing:` clause were delivered, which the verifier confirmed in the codebase: (a) the renderer defect IS fixed — `Winetricks/WinetricksSearch/index.tsx:77` now fires install from `onMouseDown` ahead of the parent remount, with the trailing `onClick` suppressed to avoid a double-invoke and the keyboard path preserved, pinned by a RED-proven `winetricksInstallMouseRace.test.tsx`; and (b) REQ-35-16's unsatisfiable three-layer attribution clause was amended in `.planning/REQUIREMENTS.md` (commit 766ad63b5) with the superseded wording left VISIBLE and a dated correction naming the measured cause. SCOPE LIMIT, recorded so this is not over-read: only the Winetricks consumer of the shared `SearchBar` is proven working; the Library consumer is mouse-dead and is filed separately at .planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md. The closure signal is a live mouse gesture, not a green test run — this project's frontend jest project has no DOM."
    reason: "Two of three legs land. `openDialog` IS in `LONG_RUNNING_CHANNELS` (main.rs:826-871) and was live-discharged as gate criterion 13. The `installed.json` watcher IS ported with its debounce and IS wired from bootstrap.ts — but its UI half fails (see gap 1). `winetricksInstall` is NOT fixed: 35-10 Task 2 is recorded BLOCKED / NOT IMPLEMENTED, and the requirement's own attribution clause fails on its own terms — the defect is in NONE of the three layers the requirement enumerates (sidecar registration, Rust dispatch, frontend emit), all three of which were re-measured correct. The real break is renderer hit-testing (`pointerdown`/`mousedown` arrive, `mouseup`/`click` never do; attributed to a React unmount)."
    artifacts:
      - path: "src/backend/sidecar/wineToolsFlowRegistration.ts"
        issue: "line 335 registers the channel correctly; the channel works end-to-end under keyboard activation. Mouse activation never emits."
    missing:
      - "Either fix the renderer unmount that eats the click, or re-home winetricksInstall to a named owner and amend REQ-35-16's three-layer attribution clause, which cannot be satisfied as written — BOTH DONE 2026-08-30"

  - truth: "REQ-35-17 — the EOS remove confirmation and the path-rejection dialogs become app-styled"
    status: resolved
    resolved_by: "plan 35-26, closing D-35-11-01 (which now carries a `RESOLVED 2026-08-30, plan 35-26` annotation in deferred-items.md). Verifier-confirmed in code: `eos_overlay.ts` no longer calls `dialog.showMessageBox` at either site — lines 158-162 and 203-207 are now comments recording that the confirmation moved to the renderer; `remove()` takes an explicit `confirmed: boolean` with a strict `=== true` fail-closed gate widened through ipc.ts / ipc_handler.ts / eosOverlayFlowRegistration.ts / preload/api/settings.ts. The plan's own live gate CAUGHT a real miss on its first attempt (Install and Update ran unguarded) and the remediation `ad07e8ff6` added `confirmInstallEosOverlay`/`confirmUpdateEosOverlay` plus a source-text `EosActionConfirmationGuard.test.ts`, RED-proven 6/10 against pre-fix HEAD. New strings went to `public/locales/en/gamelib.json` only, per the project rule. CAVEAT PRESERVED: the light/dark theme verdict is the operator's direct visual confirmation reported verbally — NO screenshots were captured though the plan asked for one per theme, and pixel values were not measured."
    reason: "Path-rejection is done and the SEAM Phase 33 D-04 auto-resume port is real and wired (`appShellFlowRegistration.ts:435` — `void initQueue(true)` inside a 5s `.unref()`'d timer). The EOS half is NOT done: `eos_overlay.ts:162` and `:197` still call `dialog.showMessageBox`, i.e. the native dialog. Owned by D-35-11-01, which is marked NOT DONE and explicitly needs a human decision."
    artifacts:
      - path: "src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts"
        issue: "lines 162, 197 — still `dialog.showMessageBox` (native), not the app-styled pattern"
    missing:
      - "Resolve D-35-11-01 (moving a destructive confirmation gate across the IPC boundary) or record it as an accepted gap against REQ-35-17 — RESOLVED 2026-08-30"

  - truth: "The repo's own test suite is green — no Phase 35 regression in the mechanized gates"
    status: resolved
    resolved_by: "plan 35-24 (commit ee86b3442) plus the follow-up re-baseline 90c10e541 after 35-25's own frontend edit invalidated 35-24's pin — the exact regenerating-an-artifact-breaks-its-pins cascade this project has hit before, caught here inside the same cycle. VERIFIER RE-RAN THE GATE ITSELF: `npx jest meta/__tests__/genI18nGateScope.test.ts` exits 0 with 26 passed / 1 skipped, and critically BOTH non-vacuity controls pass live ('A-17 ANTI-ROT non-vacuity: the anti-rot check DOES fail against a mutated copy' and 'A-03 RATCHET non-vacuity'), so this is not a gate that was silenced. The 1 skipped case is `it.skip` introduced 2026-08-11 (commit b4d62dd22, blocked on WR-17) and is NOT a Phase 35 artefact. RESIDUAL, RECORDED NOT ABSORBED: `pnpm test` still exits 1 on 3 decompressPool lzmaLoader failures — see `re_verification.residual_red_gate`. Scored resolved because this gap's own `reason` and `missing` named the A-17 regression exclusively and explicitly carved decompressPool and lint OUT of scope."
    reason: "`meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails. The committed `meta/i18nForkTouchedFiles.json` is stale because Phase 35 made 6 frontend files fork-divergent. This is a REAL Phase 35 regression, not inherited. The sanctioned repair (`pnpm gen-i18n-gate-scope`) was attempted and CASCADED the suite from 1 failure to 5 — the `--rewrite-scope` guard fixtures hard-code `163 -> 199` counts and the A-03 ratchet declares an exact debt set. No later milestone phase owns this."
    artifacts:
      - path: "meta/i18nForkTouchedFiles.json"
        issue: "stale — does not list the 6 frontend files Phase 35 made fork-divergent"
      - path: "meta/__tests__/genI18nGateScope.test.ts"
        issue: "A-17 ANTI-ROT red; a bare regen makes it worse"
    missing:
      - "A coordinated multi-file change: regenerate the scope AND update the `--rewrite-scope` guard fixture counts AND re-baseline the A-03 ratchet debt set, in one commit — DONE 2026-08-30/31"

  - truth: "REQ-35-07 — logging out clears the embedded browser's persisted state and the app does not report success unless a post-clear read confirms it"
    status: resolved
    readjudicated_5_2026_08_31: "FIFTH PASS, 22:36 NZST. STATUS MOVES `partial` -> `resolved`. BOTH clauses now pass, and both were measured by me rather than accepted. CLAUSE 1 — an index-walking decode of the live packaged jar `com.gamelib.shell.binarycookies` (mtime 22:23:26; my copy's sha256 matches the operator's AFTER artifact exactly) holds 23 live records and ZERO Epic-owned, and the SET DIFFERENCE against the BEFORE artifact is decisive: 30 -> 23, removed exactly 7, all 7 Epic, added 0, and every non-Epic record preserved. A name-agnostic byte scan returns 0 for every Epic cookie name and every sibling apex; the single `epicgames` byte occurrence is a bplist StoragePartition value on the `api.hcaptcha.com` cookie, correctly retained. CLAUSE 2 — the app reported success on five reads that all cleared the trustworthiness bar (numeric `=0`, never `unconfirmed(...)`), and my decode of the same jar independently confirms those zeroes were TRUE. The fail-closed guard added by bea07cd17 is present at user.ts:546-576 and I RED-PROVED it with four mutations against the real file with a sha256-verified restore: reverting the loop to `verify.matched` alone fails exactly 3; deleting the fatal throw fails the same 3; trusting UNDECIDABLE fails exactly 1, proving the tests are discriminating and not one assertion in three costumes. TWO WARNINGS RECORDED, NEITHER BLOCKING — F-5-01 (the debug-packaged build never executes the SEA sidecar, so the operator's build-identity check interrogated an inert artifact; the conclusion nevertheless holds, established by me against `build/main/sidecar.js`, the file that actually ran) and F-5-02 (a fourth mutation making only ALL-FIVE-unconfirmed fatal passes 53/53, so per-host granularity is pinned by nothing — the shipped code is correct, the gate is not). See `fifth_adjudication` above for both in full."
    readjudicated_4_2026_08_31: "FOURTH PASS, 21:45. STATUS NARROWED from `failed` to `partial`, and the reason REPLACED. Clause 1 is now VERIFIED LIVE and I reproduced the proof myself: an index-walking decode of the dev jar (mtime 21:03:15+1200) finds 51 live records and ZERO Epic-owned, with a name-agnostic byte scan returning 0 for `EPIC`, `__cf_bm`, `EPIC_SESSION_AP` and all four sibling apexes, and gamelib.log showing 8 Epic cookies provably present before the clear. The third pass's clause-1 failure is FALSIFIED — the cookies were re-created by the logout's own hidden Epic-pointed webview, which this fix removes; both `__cf_bm` records carry an exactly-30-minute Cloudflare TTL from their creation second, and `EPIC_SESSION_AP` at 06:17:18Z is 18:17:18 LOCAL on a UTC+12 machine, i.e. two minutes AFTER the clear, not nine hours before. Clause 2's MECHANISM is now correct, correctly positioned after every mutation, fatal, and RED-proven by me twice. WHAT STILL FAILS, measured for the first time by this pass: that mechanism is FAIL-OPEN on a rejecting read. `readHostCensus`'s catch returns `matched: 0` and the residual loop ignores `verify.verdict`, so with all five verification reads rejecting the product RESOLVES logout and prints `post-clear verification — 0 Epic-owned cookie(s) remain` — proved by running a probe, not by reading. That branch was 100% of production behaviour until commit 9106ccbea. One-line closure named in `missing:` below."
    superseded_readjudication_2026_08_31: "REOPENED by the independent third pass. A page-index binarycookies decode of BOTH jars shows Epic auth cookies surviving logout as LIVE records — four on the dev jar, and FIVE on the packaged jar including a 1310-byte EPIC_SESSION_AP session credential on path /id that no prior record names — while the product own post-clear census logged matched=0 for those same hosts. Both of REQ-35-07 clauses fail. See independent_adjudication above. The superseded_resolved_by text below is the quick-task executor claim, PRESERVED UNALTERED; it is accurate about D-35-29-01 and D-35-19-15 and wrong about REQ-35-07."
    superseded_resolved_by: "quick task 260831-q93 (9106ccbea), 2026-08-31, on LIVE evidence only. The blocker was D-35-29-01: the census read resolved `app.get_webview_window(label)`, which structurally cannot find Epic's pristine webview-less login window, so every verdict pinned at UNSUPPORTED_OR_ERROR and BOTH consuming branches in legendary/user.ts were dead code. The fix adds `default_data_store_cookies_for_domain` and an `existing_window`-first guard in the census arm, mirroring the fallback the CLEAR path already had — the fix direction this report itself identified below. Live Epic logout 2026-08-31 19:27: all five hosts SUPPORTED_NONEMPTY with numeric total=/matched=, 0 census read failures, and all four NON-PRIMARY apexes before(matched=1) -> cleared 1 -> after(matched=0), which is the multi-domain proof D-35-19-15 demanded. The post-clear read now genuinely gates the success report — the `brokenHosts` detector is reachable for the first time and stayed silent correctly (no host showed proven-populated-with-zero-delta). QUALIFIED, see post_reverification_closure.honesty_qualifications: the enabling cookies were legacy residue, not seeded; the measurement is on a dev-keyed jar; and D-35-29-02 remains open and is now REPRODUCED on a second jar, with a new in-process-vs-external contradiction this executor did not re-adjudicate."
    reverified: "STILL OPEN after gap-closure cycle 1, and now understood to be WORSE than the original verification recorded, not better. This is the phase's remaining BLOCKER."
    reason: "The code is right and independently verified: `EPIC_COOKIE_DOMAINS` (main.rs:3189) and `EPIC_COOKIE_HOSTS` (legendary/user.ts:43) both carry all five Epic-owned apexes; `epic_cookie_domain_matches` delegates to the single `cookie_domain_matches` comparator rather than hand-rolling a second one; `user.ts:238`'s `if (total === 0)` makes a zero-total clear FATAL to logout. But the closure evidence does not exist: D-35-19-15 records that gate criterion 21 — the criterion that discharged the standing 34.6 Step 8 FAIL — did NOT actually exercise the multi-domain clear it was written to prove. So the widening is unit-proven and code-verified, never live-proven."
    reverified_reason: "The 2026-08-31 re-run found BOTH prescribed closure routes unavailable, and the verifier confirmed the second one structurally in Rust source rather than taking the gate's word. (1) SEEDING ROUTE DEAD: the Tauri build embeds no browser view (`WebviewUnavailablePanel.tsx:43`), so no user action on this build can create a non-primary Epic cookie — the widening is unreachable-by-construction, not merely untested. (2) CENSUS ROUTE DEAD: plan 35-23's per-host census, which D-35-19-15 itself sanctioned as the no-seeding closure path, returns `UNSUPPORTED_OR_ERROR` on all five hosts at every logout. Cause confirmed at source: the `humble_login_cookies_for_domain` arm at `src-tauri/src/main.rs:6341` resolves `app.get_webview_window(label)`, and this same file's own doc comment above `clear_default_data_store_cookies_for_domain` states that Epic's login window is ALWAYS the pristine webview-less `WindowBuilder` window, so that lookup 'structurally can never find it, for ANY label, fresh or stale'. The CLEAR path was given a label-independent data-store fallback for exactly this reason; the CENSUS path was not. DOWNSTREAM CONSEQUENCE THE DEFERRED ITEM DOES NOT SPELL OUT: in `legendary/user.ts`'s CR-04 fatality logic, the `brokenHosts` detector requires `domainVerdict(before) === 'SUPPORTED_NONEMPTY'` and the non-fatal branch requires `'SUPPORTED_BUT_EMPTY'` — with every verdict pinned at `UNSUPPORTED_OR_ERROR`, NEITHER is reachable. Case 1, the broken-per-host detector that is the entire capability D-35-19-15 asked for, is dead code on the only path it serves. What survives is only the pre-existing bare zero-sum fatality. Net: 35-23 shipped no working evidence capability to the Epic logout path. The fail-closed property is intact and correct; the new observability is not."
    artifacts:
      - path: ".planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md"
        issue: "D-35-19-15 — criterion 21 did not exercise the multi-domain cookie clear. Correctly updated 2026-08-31 with a 'STILL OPEN. NOT CLOSED' block naming both dead routes."
      - path: "src/backend/storeManagers/legendary/user.ts"
        issue: "readHostCensus (~line 240) returns UNSUPPORTED_OR_ERROR for every host on every Epic logout, so the brokenHosts detector at ~line 363 and the allProvenEmpty branch at ~line 375 are both unreachable. D-35-29-01."
      - path: "src-tauri/src/main.rs"
        issue: "line 6341 — the census arm requires get_webview_window(label); Epic's login window is the pristine tauri::Window, which that lookup can never resolve. No pristine/data-store fallback exists on this arm, unlike humble_login_clear_cookies."
    missing:
      - "FOURTH PASS 2026-08-31, THE ONE ITEM THAT ACTUALLY REMAINS: make the post-clear verification sweep FAIL-CLOSED. `readHostCensus`'s catch returns `matched: 0` and the residual loop at user.ts:517-535 reads only `verify.matched`, so five rejecting reads produce `logout()` resolving plus the line `post-clear verification — 0 Epic-owned cookie(s) remain`. Proved by running a probe, not by reading. Use the machinery already fifteen lines above: treat `verify.jarTotal === null`, or any verdict that is not `SUPPORTED_*`, as fatal — or at absolute minimum stop printing an affirmative `0 … remain` for a host that was never read. A passing unit test must NOT be accepted as the evidence; re-prove by a live logout."
      - "FOURTH PASS 2026-08-31, SECOND ITEM: exercise the fix ONCE on a PACKAGED build. Every live proof to date is on `pnpm tauri:dev` and the packaged jar `com.gamelib.shell.binarycookies` has not moved since 18:17:28, which PREDATES the fix. `35-CONTEXT.md` states `packaged, not dev` three times."
      - "CLOSED 2026-08-31 by b5b3464bd, verified by the fourth pass — Give the census read the same label-independent data-store fallback the clear already has, and verify by a live logout showing a per-host verdict other than UNSUPPORTED_OR_ERROR. A passing unit test must NOT be accepted as evidence — the existing tests assert the no-window branch does not throw, which passes while the census never works."
      - "OR: an embedded browser view returns, restoring a vehicle that can seed a non-primary Epic apex, and one live logout then reads a non-zero delta on at least one of fortnite.com / unrealengine.com / twinmotion.com / metahuman.com. No later milestone phase currently owns this, so it is NOT deferrable."
deferred:
  - truth: "`pnpm lint` exits 0"
    addressed_in: "Phase 39"
    evidence: "Phase 39 goal: 'Repo-wide lint debt — drive `pnpm lint` to exit 0 after the Electron cutover'. Its roadmap section states explicitly: 'Why this phase runs AFTER Phase 35, not before: Phase 35 removes the Electron build. That deletion takes an as-yet-unmeasured share of the 3544 problems with it.' NOTE (CORRECTED 2026-08-31 by the third and fourth passes — the original text said `the 6 current errors` and that number is STALE; both passes measured NINE, in meta/__tests__/cleanDist.test.ts, src/backend/__tests__/packagingConfig.test.ts x2, src/backend/sidecar/__tests__/appShellFlows.test.ts, src/backend/sidecar/__tests__/steamAuthFlows.test.ts, src/backend/sidecar/installedJsonWatcher.ts, src/backend/utils.ts, src/frontend/screens/WebView/index.tsx, src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts; Phase 39 must inherit NINE): the 9 current errors are specifically Phase 35 residue (uses deleted, declarations left behind) rather than part of the inherited 53, but Phase 39's repo-wide scope subsumes them."
  - truth: "REQ-35-20's Windows and Linux smoke launches"
    addressed_in: "Phase 38"
    evidence: "REQ-35-20 itself routes them: 'The smoke-launch half is routed to Phase 38 as 38-W04 (Windows) and 38-W05 (Linux)'. Phase 38 goal: 'Discharge, in one deliberate sweep, every UAT item across the project that cannot be run on this machine because it needs hardware or an OS this project does not have.' The scope reduction was explicitly acknowledged by the user (option-c, 2026-08-30)."
human_verification:
  - test: "DISCHARGED 2026-08-31 23:12 by the SIXTH pass — THE GESTURE WAS PERFORMED AND INDEPENDENTLY AUDITED. A genuine RELEASE artifact was built with the documented chain (`pnpm exec vite build && pnpm build:sidecar-sea && pnpm exec tauri build`), installed to `/Applications`, and an Epic login/logout run at 22:52:34-22:54:10. The sixth pass closed the build-identity chain at the RUNNING PROCESS — `ps` shows PID 9781 = the installed `gamelib-shell` spawning PID 9787 = the installed, BUNDLED `gamelib-sidecar`, NOT `node .../build/main/sidecar.js`, which is the release spawn path executing and the precise check F-5-01 prescribed — and corroborated it with sha256 identity of BOTH installed binaries against tonight`s release build outputs, `grep -a` of the installed SEA for the `bea07cd17` markers (`git grep`-confirmed absent at the parent commit), a line-by-line read of all 69 lines of `gamelib.log`, and an independent index-walking decode of the jar. `bundle/macos/` was ALSO confirmed to hold no `.app` at all (only a stale Aug 23 tarball), so the forbidden stale source is excluded mechanically. THE REMAINING WORK IS NOT A GESTURE: the result has not been written back into `35-LIVE-GATE.md` criterion 21 — see gap `SIXTH PASS G-6-01`. Superseded fifth-pass text preserved verbatim below. — ADDED 2026-08-31 22:36 by the FIFTH pass — THE ONE GESTURE THAT REMAINS BEFORE PHASE 35 CAN CLOSE. Build a RELEASE artifact from current HEAD with the phase's own documented release command, `pnpm exec vite build && pnpm build:sidecar-sea && pnpm exec tauri build`. Mount the resulting `src-tauri/target/release/bundle/dmg/GameLib_*.dmg` (never take the `.app` from `bundle/macos/`, per 35-LIVE-GATE.md's own warning), copy `GameLib.app` to `/Applications`, eject, launch. Log in to Epic, then log out."
    expected: "`~/Library/Logs/GameLib/gamelib.log` shows, in this order — a `Legendary logout: cleared storage` line, then five `cleared N <host> cookie(s)` lines, then `Legendary logout: post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)` with a NUMERIC zero for every host and NO `unconfirmed(` anywhere; and no `[ERROR]` or `COULD NOT CONFIRM` in the logout window. Before mounting, confirm the running sidecar is the SEA by checking `ps` shows the shell's child as `.../GameLib.app/Contents/MacOS/gamelib-sidecar` and NOT a `node .../build/main/sidecar.js`."
    why_human: "WHY THIS IS THE PRECISE REMAINING GATE, established by the fifth pass and not previously recorded. The phase's blocking gate is 35-LIVE-GATE.md, whose criterion 21 IS the Epic cookie-clear criterion, and whose header specifies a RELEASE build (`build:sidecar-sea && tauri build`, DMG-mounted). Criterion 21 was last measured 2026-08-31 before 21:11. TWO behaviour-changing product commits have landed since — b5b3464bd (21:11, removes the window and reorders the wipe steps) and bea07cd17 (22:04, converts an untrustworthy read from silently-clean into FATAL, so a logout that previously resolved can now throw). The gate's own doctrine (`R-34.5-G1-PKG`) is that the artifact must postdate the code; it no longer does. Tonight's 22:23 run DOES cover the current code and I verified its substance set-exactly — but it ran on the DEBUG-packaged artifact, and the fifth pass proved from Rust source (`use_dev_sidecar() = cfg!(debug_assertions)`, main.rs:6747) and from `ps` (PID 2616) that a `tauri build --debug` bundle spawns `node build/main/sidecar.js` from the repo and NEVER loads the embedded SEA. So every line of product TypeScript in this path — all of `legendary/user.ts` — has never executed under the SEA runtime, in a repo with a documented history of bundle-only defects invisible to jest. This gesture is not a doubt about the logic, which is verified; it is the build-class confirmation the phase's own rules require. Cannot be automated: it needs a real Epic credential and a real login gesture."
  - test: "RESOLVED 2026-08-31 — gate criterion 6 re-run: launch a Steam title, quit it, then open the tray menu"
    expected: "The Steam title appears in the recent-games submenu, carries a `runner` field, and clicking it launches the title"
    why_human: "DISCHARGED. Both halves measured: storage — `store/config.json` `games.recent` held `{appName:1124300, title:HUMANKIND, runner:steam}`; execution — the tray submenu entry launched the title."
  - test: "RESOLVED 2026-08-31 (QUALIFIED) — gate criterion 10 re-run: cold-start `gamelib://launch?appName=<steam appid>`"
    expected: "`gamelib.log` shows the ProtocolHandler receiving the URL and the Steam title launching"
    why_human: "DISCHARGED for the argv delivery path — three verbatim log lines end to end. STILL OPEN: the LaunchServices AppleEvent delivery path was not verified on this machine and must not be assumed covered."
  - test: "STILL OPEN — gate criterion 14's UI half: with the Library view open, externally touch `installed.json` and WATCH the view"
    expected: "The Library view repaints within ~1s with NO manual refresh"
    why_human: "The backend and push halves are positively evidenced (`origin=push`, distinct from the boot-time `origin=mount`), but the operator was not watching the Library at the moment of the gesture. A message arriving is not proof a surface repainted. This is the one human item the re-run explicitly left UNOBSERVED rather than scored."
  - test: "RESOLVED 2026-08-31 22:36 by the FIFTH pass — BOTH fourth-pass gestures were performed and both passed. (1) the PACKAGED-BUILD proof was taken at 22:23 and the fifth pass decoded the jar independently, set-exactly, finding 0 Epic-owned live records and 0 Epic bytes; (2) the FAIL-OPEN closure landed as bea07cd17 and the fifth pass RED-proved it with four mutations against the real file. The sibling-apex half stays unreproducible by construction (D-35-19-15) and is NOT a REQ-35-07 clause. Superseded fourth-pass text preserved verbatim below. — SUPERSEDED 2026-08-31 21:45 by the FOURTH pass. The third-pass gesture below is NO LONGER the right one — its premise (Epic cookies surviving the clear) is falsified. TWO gestures are now needed, and BOTH need the operator. (1) PACKAGED-BUILD PROOF: on a packaged 0.7.0 build, log in to Epic, log out, then decode ~/Library/HTTPStorages/com.gamelib.shell.binarycookies via its page/offset index and confirm zero Epic-owned live records — the fix has only ever run on a dev build, and this phase's own context says `packaged, not dev` three times. (2) FAIL-OPEN CLOSURE (code change first, then re-gesture): make a non-`SUPPORTED_*` verdict in the residual sweep fatal, or at minimum stop it printing `0 … remain`, then repeat gesture (1). Superseded third-pass entry preserved verbatim below. —  a binarycookies page-index decode shows Epic auth cookies (incl. a 1310-byte EPIC_SESSION_AP on the packaged jar) SURVIVING the logout while the product census logged matched=0. What a human must now do: take a fresh Epic login on a PACKAGED build, log out, and decode ~/Library/HTTPStorages/com.gamelib.shell.binarycookies via its page/offset index (not strings) to confirm zero Epic-owned live records. Executor claim preserved: RESOLVED 2026-08-31 by quick task 260831-q93 — the blocking half (D-35-29-01) is fixed and the live logout produced the evidence; the SEEDING half was never performed and remains impossible. Original entry preserved: STILL OPEN, AND NOW BLOCKED — REQ-35-07 live: log in to Epic, seed a cookie on a non-epicgames.com Epic apex, then log out"
    expected: "`gamelib.log` shows a non-zero per-domain delta on at least one non-primary apex and a post-clear read that confirms removal"
    why_human: "Both closure routes are unavailable on this build. No embedded browser view exists to seed a non-primary apex, and plan 35-23's census fallback is inert at logout (D-35-29-01). This item cannot be discharged by a human gesture until D-35-29-01 is fixed or the embedded browser returns."
  - test: "RESOLVED 2026-08-30 — REQ-35-17 EOS: trigger the EOS confirmations in one light and one dark theme"
    expected: "An app-styled dialog with the cancel path exercised and proven non-destructive"
    why_human: "DISCHARGED by plan 35-26's live gate: Update/Install/Remove each exercised on BOTH the cancel and confirm branches, cross-checked against `gamelib.log`, and both dialogs viewed in both themes. CAVEAT: no screenshots were captured and no pixel values were measured — the theme verdict is verbal operator confirmation."
  - test: "PARTIALLY RESOLVED — Review criticals CR-01..CR-04 from 35-REVIEW.md"
    expected: "A decision per item: fix, or accept with a recorded reason"
    why_human: "All four fixes have LANDED in code and the verifier confirmed each: CR-01 `OPEN_EXTERNAL_ALLOWED_SCHEMES` at main.rs:1207 enforced at :1220; CR-02 `frontendReadyBootWorkDone` one-shot guard at appShellFlowRegistration.ts:202; CR-03 `window.platform` win32 arm at tauriAttach.ts:77; CR-04 renderer surfacing plus the backend jar-liveness classification. WHAT REMAINS IS A RECORDS PASS, NOT A DECISION: 35-REVIEW.md is still `status: issues_found` and none of the four CR sections carries a resolution annotation."
---

# Phase 35: Electron cutover — remove the Electron build — Verification Report

**Phase Goal:** Retire the Electron build: delete `electron-vite`/`electron-builder` config, the preload contextBridge path, and the `isTauri()` branches, leaving Tauri as the only shell. Runs last, and only once the `session`/`powerSaveBlocker` parity gaps are resolved or explicitly accepted, and the parked Electron-renderer bugs have been re-tested against Tauri rather than fixed in Electron. Also in scope: `R-34.5-G1-PKG` (REQ-35-10 half a, REQ-35-11 half b).

**Verified:** 2026-08-30T04:12:40Z (initial) · **Re-verified:** 2026-08-31 (independent, after gap-closure cycle 1)
**Status (CURRENT — SIXTH pass, CLOSURE adjudication, 2026-08-31 23:12):** human_needed — **17/17**. BOTH fifth-pass closure conditions re-measured by me and BOTH HOLD: the `(e5)` gate is red on D *and* boundary-exact (six mutations, two of them never run before), and the release live gate is genuine — the build-identity chain is closed at the **running process** (`ps`: PID 9781 shell → PID 9787 = the bundled SEA, not `node`), which is the check the fourth pass's reasoning failed. **The phase goal IS achieved.** It still cannot close, on RECORDS not substance: three propagations are unclosed, the first inside the phase's own `blocking: true` gate document. See [## SIXTH ADJUDICATION — 2026-08-31 23:12 NZST (CLOSURE)](#sixth-adjudication--2026-08-31-2312-nzst-closure) at the end of this file. Status is `human_needed` rather than the decision tree's `gaps_found` for a measured reason recorded there — under `gaps_found`, `audit-uat` drops this phase entirely.
**Status (SUPERSEDED — FIFTH pass, 2026-08-31 22:36, preserved):** human_needed — **17/17**. REQ-35-07 CLOSES on both clauses, verified independently (set-exact jar decode + a four-mutation RED-proof I ran myself). One gesture remains before the phase can close: a RELEASE-build Epic logout — see `## FIFTH ADJUDICATION` at the end of this file and `human_verification` item 1. Every `**Status:**` line below is SUPERSEDED and preserved for the record.
**Status:** gaps_found — **16/17**. *(Third pass, independent, 2026-08-31: the executor-recorded 17/17 is REJECTED. See [## INDEPENDENT ADJUDICATION OF THE 17/17 CLAIM — 2026-08-31](#independent-adjudication-of-the-1717-claim--2026-08-31) at the very end of this file.)* The intermediate header is preserved verbatim on the next line as the record of what quick task `260831-q93` claimed.
**Status (SUPERSEDED — `260831-q93`'s own claim, preserved):** verified — 17/17. All five gaps closed. **REQ-35-07's blocker (D-35-29-01) was discharged on 2026-08-31 by quick task `260831-q93` on live evidence** — see [## POST-RE-VERIFICATION CLOSURE — 2026-08-31](#post-re-verification-closure--2026-08-31). The `gaps_found — 16/17` adjudication below is preserved unaltered as the record of the 19:40 re-verification; it was accurate when written.
**Re-verification:** Yes. **Everything from here to the `RE-VERIFICATION` heading is the ORIGINAL 2026-08-30 record, preserved unaltered — its "Score: 11/17" and its ✗ marks are historical, not current.** The current adjudication is the [## RE-VERIFICATION (independent) — 2026-08-31](#re-verification-independent--2026-08-31) section at the end of this file, and the frontmatter above it.
**Roadmap `success_criteria`:** empty. Must-haves were merged from the 19 PLAN frontmatter `must_haves` blocks, the goal's own literal claims, and REQ-35-01..21 in REQUIREMENTS.md.

---

## Headline

**The cutover itself succeeded.** Every literal claim in the phase goal is true in the codebase, and I verified each one myself rather than reading it out of a SUMMARY. `R-34.5-G1-PKG` is closed on **both** halves, and I proved half (a) against a real packaged artifact in my own process — not from the 35-04 summary's word.

**What is not achieved is the phase's own closure condition.** REQ-35-20 says in its own text "Any FAIL means the phase does not close," and the blocking gate's verdict is FAIL. Four requirements (35-04, 35-05, 35-16, 35-17) ship partial, and one mechanized gate carries a real Phase 35 regression.

The gap set is small, specific and mostly one shape: **Steam titles are second-class on the runner-resolution paths this phase built new surfaces on top of.**

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `electron-vite` / `electron-builder` config is gone | ✓ VERIFIED | `electron.vite.config.ts` and `electron-builder.yml` both absent from disk. Zero `electron-vite`/`electron-builder` keys in `package.json` (`Object.keys({...deps,...devDeps}).filter(/electron/)` → `[]`). `vite.config.ts` is the live renderer config: `base: mode === 'production' ? './' : '/'` (the load-bearing injected value), `outDir: 'build'`, `emptyOutDir: false`, `preserveRunnerSymlinksPlugin()` at line 126. `meta/__tests__/viteRendererConfig.test.ts` PASSES in my own run. |
| 2 | The preload contextBridge path is gone | ✓ VERIFIED | `src/preload/index.ts` is 38 lines: a `./tauriAttach` side-effect import plus the Windows `navigator.platform` shim. Zero `contextBridge` call sites anywhere in `src/` — the only 4 matches are doc comments in `tauriAttach.ts` and its test. `src/preload/api/*` survives intact as REQ-35-14 required, and is consumed by `tauriAttach`. |
| 3 | The `isTauri()` branches are gone | ✓ VERIFIED | `grep -rn 'isTauri' src/` → **0 matches**, using the un-anchored form the requirement's own undercount lesson demands (the anchored `isTauri(` form was measured to miss 39 refs). Definition deleted from `src/preload/tauriTransport.ts`. `meta/__tests__/isTauriRemoved.test.ts` PASSES in my own run. |
| 4 | Tauri is the only shell — no remaining Electron entry point | ✓ VERIFIED (with residue) | `src/backend/main.ts`, `src/backend/updater.ts`, `e2e/`, `playwright.config.ts`, `flatpak/`, `flathub/`, `src/backend/__mocks__/electron.ts` — all absent. Zero `electron`/`electron-*` deps or devDeps. Zero real `from 'electron'` / `require('electron')` imports (41 grep hits, **all inside comments**, individually inspected). Zero `Electron.` namespace refs. esbuild `--alias:electron=` removed and its guard test INVERTED to assert absence. Reach-ledger measures 0 across 256 visited files. 78 `from 'backend/platform'` imports replace the former surface. **Residue — see Anti-Patterns:** `package.json` still declares `"main": "build/main/main.js"` (file does not exist) and `"debug:react": "pnpm start & npx react-devtools"` (the `start` script was deleted by 35-14); `pnpm-workspace.yaml` still lists `electron` under `onlyBuiltDependencies`. Nothing can start Electron, so the goal's substance holds. |
| 5 | REQ-35-10 half (a) — every `publicDir`-resolved asset ships in the packaged bundle | ✓ VERIFIED (artifact-level) | Config: `bundle.resources` is the **map** form — `{"../build/bin/":"build/bin","../build/locales/":"build/locales","../build/changelog.json":"build/changelog.json","../build/webviewPreload.js":"build/webviewPreload.js","../build/icon.png":"build/icon.png"}`. **Artifact, measured by me on `/Applications/GameLib.app` (built 2026-08-30 08:18, same run as the release DMG):** `Contents/Resources/` holds exactly `build/` and `icon.icns`. `build/locales` holds **147 files across 49 language dirs**. `translation.json` carries `notify.finished.reparing` = `"Finished Repairing"` — the exact key/value pair the 2026-08-22 both-directions probe proved missing. `_up_` **ABSENT**. `public` **ABSENT**. |
| 6 | REQ-35-11 half (b) — `app.isPackaged` has exactly ONE derivation and the packaged branch is reachable | ✓ VERIFIED | `src/backend/sidecar/isPackagedSidecar.ts` is the single `node:sea`-backed, fail-closed resolver. `platform/index.ts:277-278` is a **getter** (`get isPackaged() { return isPackagedSidecar() }`), not a captured boolean — load-bearing, because `paths.ts` reads it at module scope. Exactly three callers, all importing: `platform/index.ts:80`, `devSecretVault.ts:55`, `humbleFlowRegistration.ts:146` (which re-exports rather than keeping a copy). No second derivation exists. |
| 7 | Halves (a) and (b) actually MEET — `publicDir` resolves to a directory that is populated | ✓ VERIFIED (Level 4 data-flow trace) | Full chain traced end to end: `spawn_sidecar_packaged` sets `GAMELIB_APP_ROOT` from `app.path().resource_dir()` (main.rs:6807, :6975) → `platform/index.ts:300` `getAppPath: () => process.env.GAMELIB_APP_ROOT \|\| process.cwd()` → `paths.ts:80-83` `publicDir = resolve(getAppPath(), app.isPackaged \|\| CI==='e2e' ? 'build' : 'public')` → `Contents/Resources/build` → **which the artifact in truth 5 confirms is populated**. The requirement's own warning ("fixing (b) alone resolves correctly to a directory that does not exist") is discharged: it now resolves to a directory that exists AND has content. |
| 8 | The `powerSaveBlocker` parity gap is resolved | ✓ VERIFIED | Not a no-op any more. `main.rs:4144 macos_wake_lock` (IOKit `ASSERTION_TYPE_DISPLAY`/`ASSERTION_TYPE_SYSTEM`), `:4217 windows_wake_lock`, `:4274 linux_wake_lock`. The two kinds stay **distinct** (`WakeLockKind::Display`/`System`, unknown kinds **rejected** not defaulted — `wake_lock_start:unknown-kind`). `WakeLockRegistry` allocates a real unique id and `forget(id)` releases exactly that one; `wake_lock_release_all()` at shutdown (main.rs:8214). Ids start at 1, never 0, because `launcher.ts`'s re-entry guard is `if (!powerDisplayId)`. JS side forwards via `requestRustInvoke`. Live-discharged as gate criterion 15 (PASS). |
| 9 | The `session` parity gap is resolved or explicitly accepted | ✗ FAILED (partial) | Code is correct and independently verified (see gap 5) — five Epic apexes on both the Rust and TS sides, a single shared domain comparator, `total === 0` fatal to logout. But the closure evidence does not exist: D-35-19-15 records that gate criterion 21 did NOT exercise the multi-domain clear it was written to prove. Unit-proven and code-verified; never live-proven. |
| 10 | The parked Electron-renderer bugs were re-tested against Tauri while both shells still built | ✓ VERIFIED | `35-AB-RETEST.md` exists (74KB), 7 items scored across 2 shells with every `Observed:` filled, run in wave 1 before the point of no return. The named `debug-uninstall-game-vanishes-parked` is item 1. Two recorded corrections (`NEITHER`→`BOTH`, `NEITHER`→`NOT ATTEMPTED`) show the record was checked against nominated evidence rather than transcribed. Item 3's finding (`openDialog` missing from `LONG_RUNNING_CHANNELS`) was carried to 35-19 and discharged live as criterion 13. |
| 11 | REQ-35-14 — the irreversible step is named, tagged, and gated on a zero-MISSING behaviour checklist | ✓ VERIFIED | `git tag -l` confirms **`pre-electron-cutover` exists** — I used it as a live oracle throughout this verification (it is how I established truths 15 and 16's provenance). `35-CUTOVER-CHECKLIST.md` status `ZERO MISSING ROWS`, built by census of a 1561-line file registering 136 IPC channels, with `CENSUS-MAINTS-EDGES` **re-run at the deletion commit** rather than trusted from 35-PREFLIGHT. |
| 12 | REQ-35-20 — the phase closes on a PASSING blocking packaged macOS arm64 gate | ✗ FAILED | `35-LIVE-GATE.md` is `blocking: true`, `status: run`, 21/21 criteria measured with 0 blank `Observed:` fields — and `verdict: FAIL` (17 PASS / 4 FAIL). The requirement's own text: "Any FAIL means the phase does not close." |
| 13 | REQ-35-16 — the three folded channel dead ends are closed, each attributed to a named layer | ✗ FAILED (partial) | `openDialog` ✓ (in `LONG_RUNNING_CHANNELS`, live-discharged criterion 13). `installed.json` watcher ✓ backend / ✗ UI (criterion 14). `winetricksInstall` ✗ — 35-10 Task 2 BLOCKED, and the requirement's three-layer attribution clause is unsatisfiable as written. |
| 14 | REQ-35-17 — folded UI-affordance todos and both SEAM convergence items closed | ✗ FAILED (partial) | Path-rejection ✓. SEAM Phase 33 D-04 auto-resume ✓ **really ported** (`appShellFlowRegistration.ts:435`). SEAM Phase 31 D-02 ✓ closed moot-by-construction. EOS remove confirmation ✗ — still `dialog.showMessageBox` at `eos_overlay.ts:162`/`:197` (D-35-11-01). |
| 15 | REQ-35-04 — the tray is real under Tauri and no affordance remains that it cannot honour | ✗ FAILED (partial) | All three settings ARE honoured, so keeping all three toggles in `TraySettings.tsx` is correct under D-05: `noTrayIcon` and `startInTray` from the startup snapshot (main.rs:478-480, :7804-7820), `exitToTray` **deliberately excluded from the snapshot** and read live (main.rs:247, :552 — `if (exitToTray && !noTrayIcon)`), which is 35-06's own mid-gate fix. About window reachable. `addRecentGame` **does** now persist `runner` (`recent_games.ts:47`) — I verified this in code; the gate's "Steam entries carry no runner" observation is explained by pre-fix entries. **But the recent-games submenu is hollow for Steam** (criterion 6 FAIL) — see gap 1. |
| 16 | REQ-35-05 — `gamelib://` is OS-registered by the Tauri shell and reaches `protocol.ts`'s parser | ✗ FAILED (partial) | Shell half fully verified and live-proven: `tauri-plugin-deep-link = "2"` in Cargo.toml, `.plugin(tauri_plugin_deep_link::init())` at main.rs:7485, `on_open_url` at :7695, and **the callback re-validates through `protocol_url_arg()`** — the same single choke point argv and the single-instance socket use (verified at :6720, :6751, :7440, :7590). Gate criterion 10 confirms `on_open_url fired with 1 url(s)` → `delivered OS deep link to sidecar: ok (983ms)`. **The parser half cannot resolve Steam** — see gap 1. |
| 17 | The repo's mechanized gates are green with no Phase 35 regression | ✗ FAILED | `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT is red and is a real Phase 35 regression. (`pnpm lint` exit 1 → **deferred to Phase 39**; `decompressPool.test.ts` lzmaLoader ×3 → not a Phase 35 regression.) |

**Score:** 11/17 truths verified.

---

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `pnpm lint` exits 0 | Phase 39 | Phase 39 goal is literally "Repo-wide lint debt — drive `pnpm lint` to exit 0 after the Electron cutover", and its section states the sequencing reason: "Phase 35 removes the Electron build. That deletion takes an as-yet-unmeasured share of the 3544 problems with it. Fixing lint across files Phase 35 is about to delete is work thrown away." Caveat recorded: the 6 current errors are Phase 35 *residue*, not part of the inherited 53. |
| 2 | REQ-35-20's Windows and Linux smoke launches | Phase 38 | REQ-35-20 routes them by name: "The smoke-launch half is routed to Phase 38 as `38-W04` (Windows) and `38-W05` (Linux)." Phase 38's goal is discharging every UAT item needing hardware this machine lacks. User explicitly acknowledged the option-c scope reduction on 2026-08-30. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vite.config.ts` | plain-Vite renderer config lifted from the `renderer:` block | ✓ VERIFIED | 6225 B. `preserveRunnerSymlinksPlugin` present (line 126); `base: './'` in production — the injected value `electron-vite` never showed and a faithful lift of the visible block would have 404'd every packaged asset. |
| `meta/__tests__/viteRendererConfig.test.ts` | config-equivalence gate | ✓ VERIFIED | PASSES in my own run. |
| `src/backend/sidecar/isPackagedSidecar.ts` | single `node:sea` fail-closed resolver | ✓ VERIFIED | 5112 B, exists, 3 importing callers, `catch` returns `true`. |
| `src-tauri/tauri.conf.json` | `bundle.resources` shipping every `publicDir` asset at a reachable target | ✓ VERIFIED | Map form, all 5 targets under `build/`, no `..` segment, locales as a directory entry not a glob. |
| `src/backend/platform/index.ts` | the single electron-compatible surface | ✓ VERIFIED | 1133 lines, 26 exports, `handlerRegistry` at :162, `ipcMain` at :166. 78 consumers. |
| `src/backend/platform/types.ts` | first-party electron type declarations | ✓ VERIFIED | 632 lines, `IpcMainEvent` present. |
| `src/backend/store_backend.ts` | first-party `conf` shim replacing `electron-store` | ✓ VERIFIED | `conf@^10.2.0` in dependencies; `cwd` sourced explicitly from `pathShim.getPath('userData')` (the omission the plan measured would have collapsed all 24 cache files onto one `config.json` in the repo). |
| `src/backend/sidecar/installedJsonWatcher.ts` | ported watcher with debounce | ⚠️ HOLLOW | Exists, imports `legendaryInstalled`, wired from `bootstrap.ts:39`/`:661`, debounce intact, gate-proven to actually execute the deferred refresh. But line 86's callback sends **no frontend message**, so the rendered library never updates. |
| `src/preload/index.ts` | preload entry with the contextBridge block removed | ✓ VERIFIED | 38 lines; block gone, `src/preload/api/*` intact. |
| `meta/__tests__/electronAbsence.test.ts` | mutation-proven D-03 single-grep gate | ⚠️ PARTIAL | PASSES, but is structurally blind to `package.json`'s `main` field and `pnpm-workspace.yaml` — see Anti-Patterns. |
| `meta/__tests__/isTauriRemoved.test.ts` | static absence gate | ✓ VERIFIED | PASSES. |
| `meta/__tests__/artifactTargets.test.ts` | `bundle.targets` deep-equality pin | ✓ VERIFIED | PASSES. `targets: ["nsis","appimage","dmg"]`. |
| `src/backend/sidecar/__tests__/electronReachLedger.test.ts` | shrinking baseline, inverted to assert zero | ✓ VERIFIED | PASSES. Measured 0 reach across 256 visited files — a completed traversal, not a vacuous one. |
| `35-AB-RETEST.md` | 7-item × 2-shell observation record | ✓ VERIFIED | 74133 B, every `Observed:` filled. |
| `35-CUTOVER-CHECKLIST.md` | per-behaviour successor checklist | ✓ VERIFIED | `ZERO MISSING ROWS`, census-built, `CENSUS-MAINTS-EDGES` re-run. |
| `35-LIVE-GATE.md` | packaged-build gate, 21 criteria | ⚠️ RUN BUT FAILING | 107956 B, 21/21 measured, 0 blank fields — the artifact is exemplary. Verdict FAIL. |
| `35-RELEASE-NOTES.md` | user-facing accepted gaps | ✓ VERIFIED | Exists, contains "offline". |
| `git tag pre-electron-cutover` | annotated tag before any deletion | ✓ VERIFIED | Present; used as a live oracle in this verification. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `platform/index.ts` `app.isPackaged` | `isPackagedSidecar.ts` | delegating getter, never re-derives | ✓ WIRED | `:277-278`. Getter not captured boolean — correct, since `paths.ts` reads at module scope. |
| `devSecretVault.ts` guardrail (c) | `isPackagedSidecar.ts` | import, repointed from `humbleFlowRegistration.ts` | ✓ WIRED | `:55`, used at `:282`. Fail-closed guarantee intact. |
| `tauri.conf.json` `bundle.resources` | `paths.ts` `publicDir` | target layout equals `resolve(GAMELIB_APP_ROOT,'build')` | ✓ WIRED | Proven at the artifact level, not by config inspection alone. |
| `installElectronHook.ts` | `../platform` | `Module._load` redirect of `require('electron')` | ✓ WIRED | Second interception (`electron-store`) correctly deleted **with its docs**, per 35-05's own must-have about stale comments. |
| `meta/esbuildWorkerBundleShared.ts` | (nothing) | `--alias:electron=` removed, guard test inverted | ✓ WIRED | `buildSidecarSea.test.ts:352` asserts absence. |
| deep-link `on_open_url` | `protocol_url_arg()` | re-validation through the single allow-list | ✓ WIRED | main.rs:7695 → :7702 → `deep_link_decision` :6720 → `protocol_url_arg` :6670. Third source, no exception. |
| `main.rs` deep link | `protocol.ts` `handleProtocol` | validated URL dispatched to sidecar | ⚠️ PARTIAL | Delivery proven live (`delivered OS deep link to sidecar: ok`). The parser then cannot resolve a Steam appName. |
| `platform/index.ts` `powerSaveBlocker` | Rust wake-lock command | `requestRustInvoke` | ✓ WIRED | Mirrors clipboard forwarding; sync-over-async handled by minting a local id and resolving the Rust id on landing. |
| `legendary/user.ts` `clearEpicCookies` | `humble_login_clear_cookies` | one `seam.clearCookies` per Epic domain, deltas summed | ✓ WIRED | `:203-238`. Both sides widened together — the plan's explicit warning about a naive TS-only loop was heeded. |
| `installedJsonWatcher.ts` | the renderer | (nothing) | ✗ NOT_WIRED | No `sendFrontendMessage`. This is the criterion-14 FAIL. |
| `main.rs` tray recent-games | `addRecentGame` data | `store/config.json` `games.recent` | ✗ NOT_WIRED (Steam) | Writer never runs on the Steam protocol-handoff launch path. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `paths.ts` `publicDir` | resolved asset root | `GAMELIB_APP_ROOT` ← `resource_dir()` | Yes — 147 locale files measured in the real bundle | ✓ FLOWING |
| `platform/index.ts` `app.isPackaged` | `isPackagedSidecar()` | `require('node:sea').isSea()` | Yes — worker-thread agreement measured (OQ-1, `main=true worker=true`) | ✓ FLOWING |
| `main.rs` tray recent-games submenu | `TRAY_RECENT` seeded from `store/config.json` | `addRecentGame` at `launcher.ts:320` | **No for Steam** — writer unreachable on the `steam://rungameid` handoff path | ✗ HOLLOW |
| `protocol.ts` `findGame()` | `libraryManagerMap[runner]` | `RUNNERS.options` (4 of 6 registered managers) | **No for Steam** — `steam` absent from the enum | ✗ DISCONNECTED |
| Library view after external `installed.json` write | `installedGames` | `refreshInstalled()` | Backend yes, renderer **no** — no frontend message emitted | ✗ HOLLOW |
| `legendary/user.ts` cookie clear | `total` / `perDomain` | `seam.clearCookies` × 5 domains | Yes in code; **never live-measured** for the 4 sibling domains | ⚠️ UNPROVEN |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `electron` absent from `src/` and `package.json` | `npx jest meta/__tests__/electronAbsence.test.ts` | PASS | ✓ PASS |
| `isTauri()` absent from `src/` | `npx jest meta/__tests__/isTauriRemoved.test.ts` | PASS | ✓ PASS |
| `bundle.targets` pinned, no flatpak/flathub survivor | `npx jest meta/__tests__/artifactTargets.test.ts` | PASS | ✓ PASS |
| Vite config lift dropped nothing | `npx jest meta/__tests__/viteRendererConfig.test.ts` | PASS | ✓ PASS |
| Electron reach set is zero, non-vacuously | `npx jest src/backend/sidecar/__tests__/electronReachLedger.test.ts` | PASS (0 reach / 256 visited) | ✓ PASS |
| All five together | `npx jest --runInBand --silent <5 suites>` | `5 passed, 42 tests passed, 1.296s` | ✓ PASS |
| `isTauri` truly absent (un-anchored) | `grep -rn 'isTauri' src/ \| wc -l` | `0` | ✓ PASS |
| `Electron.` namespace refs absent | `grep -rnE '\bElectron\.[A-Z]' src/ \| wc -l` | `0` | ✓ PASS |
| Real `from 'electron'` imports absent | 41 hits, each inspected | all inside comments | ✓ PASS |
| Packaged locales present | `find /Applications/GameLib.app/Contents/Resources/build/locales -type f \| wc -l` | `147` across 49 langs | ✓ PASS |
| Packaged `_up_` / `public` absent | `ls -d .../Resources/{_up_,public}` | both `No such file or directory` | ✓ PASS |
| Translated string shipped, not just the key | JSON walk for `notify.finished.reparing` | `'Finished Repairing'` | ✓ PASS |
| `pre-electron-cutover` tag exists | `git tag -l \| grep electron` | `pre-electron-cutover` | ✓ PASS |
| `vite` resolvable | `require.resolve('vite/package.json')` | resolves (v6.3.5, hoisted peer) | ⚠️ PASS with caveat — undeclared direct dep |
| `package.json` `main` target exists | `ls build/main/main.js` | `No such file or directory` | ✗ FAIL (residue, non-fatal) |

---

### Probe Execution

The phase declares no `scripts/*/tests/probe-*.sh` probes; its mechanized closure gates are jest suites, which I executed above rather than reading their claimed results. `35-LIVE-GATE.md` is a human-gesture gate and cannot be re-executed by a verifier — its recorded verdict is taken as the measured input it is.

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| Phase 35 absence/pin gates (5 suites) | `npx jest --runInBand --silent ...` | 5 passed / 42 tests | PASS |
| Conventional `scripts/*/tests/probe-*.sh` | `find scripts -path '*/tests/probe-*.sh'` | none found | N/A |

---

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| REQ-35-01 `backend/platform` single module | 35-13, 35-15 | ✓ SATISFIED | 1133-line module, 26 exports, 78 `from 'backend/platform'` consumers. |
| REQ-35-02 `electron` nowhere in `src/`/`package.json` | 35-15/16/18 | ✓ SATISFIED | Verified 4 ways in my own process; mutation-proven gate passes. |
| REQ-35-03 `electron-store` → `conf` | 35-05, 35-16 | ✓ SATISFIED | `store_backend.ts` shim, `conf@^10.2.0`, explicit `cwd` from `pathShim`. |
| REQ-35-04 tray real, no unhonoured affordance | 35-06 | ✗ BLOCKED | Three settings honoured; recent-games submenu hollow for Steam (criterion 6 FAIL). |
| REQ-35-05 `gamelib://` OS registration | 35-07 | ✗ BLOCKED | Shell half live-proven; parser cannot resolve Steam (criterion 10 FAIL). |
| REQ-35-06 real `powerSaveBlocker` assertions | 35-08 | ✓ SATISFIED | Real IOKit/Win/Linux assertions, distinct kinds, unique ids, shutdown release. Live criterion 15 PASS. (D-35-19-10/-11/-12 record adjacent defects: double-acquire; a "download" system assertion held while merely playing.) |
| REQ-35-07 logout clears persisted state, no false success | 35-09 | ✗ BLOCKED (readjudicated 2026-08-31) | Code verified correct; live evidence DELIVERED 2026-08-31 by quick task `260831-q93` — five hosts SUPPORTED_NONEMPTY with numeric counts, four non-primary apexes cleared 1 each (D-35-19-15 CLOSED, D-35-29-01 RESOLVED). Was ✗ BLOCKED at the 19:40 re-verification, briefly ✓ at 260831-q93, and is ✗ BLOCKED again after the independent decode of both cookie jars — see the INDEPENDENT ADJUDICATION section at the end of this file. |
| REQ-35-08 renderer builds with plain `vite` | 35-03 | ✓ SATISFIED | `vite.config.ts` + gate; CI step "Build renderer web assets (vite)" → `pnpm exec vite build`. |
| REQ-35-09 real HMR + preserved packaged-evidence path | 35-03 | ✓ SATISFIED | `devUrl: http://localhost:5173`, `beforeDevCommand: pnpm exec vite`, and a separate `tauri:dev:packaged` that runs `vite build` then `tauri build --debug`. |
| REQ-35-10 `R-34.5-G1-PKG` half (a) | 35-04 | ✓ SATISFIED | **Artifact-proven by me**, not by summary. |
| REQ-35-11 `R-34.5-G1-PKG` half (b) | 35-01, 35-04 | ✓ SATISFIED | One derivation, three callers, fail-closed. |
| REQ-35-12 AppImage-only, Flatpak deleted | 35-12 | ✓ SATISFIED | `flatpak/`, `flathub/` absent; zero flatpak/flathub strings in `package.json`; `targets` deep-equality pinned with over-reach control. |
| REQ-35-13 clean updater handover | 35-14 | ✓ SATISFIED | `updater.ts` and `electron-updater` gone; Tauri updater plugin configured with pubkey, GitHub endpoint, `installMode: passive`, `createUpdaterArtifacts: true`. |
| REQ-35-14 named, tagged point of no return | 35-14 | ✓ SATISFIED | Tag present; zero-MISSING checklist; `src/preload/api/*` survived as required. |
| REQ-35-15 A/B re-test under both shells | 35-02 | ✓ SATISFIED | 7 items × 2 shells, run in wave 1, corrections recorded. |
| REQ-35-16 three folded channel dead ends | 35-07, 35-10 | ✗ BLOCKED | 2 of 3; `winetricksInstall` blocked and the attribution clause unsatisfiable as written. |
| REQ-35-17 UI affordances + SEAM convergence | 35-11 | ✗ BLOCKED | EOS dialog outstanding (D-35-11-01). |
| REQ-35-18 one fail-closed secret policy | 35-05, 35-16 | ✓ SATISFIED | `misc.ts`: zero `isTauri`, zero `SECRET_STORE_KEYS`, zero `electron-store`; `storeGet` gated on `isAllowedStoreField` alone. |
| REQ-35-19 `isTauri()` gone | 35-16, 35-17 | ✓ SATISFIED | Zero-match un-anchored grep + mutation-proven gate; both re-run by me. |
| REQ-35-20 blocking packaged gate | 35-01, 35-19 | ✗ BLOCKED | Gate RAN exemplarily (21/21, 0 blanks) but verdict is FAIL. |
| REQ-35-21 user-facing release notes | 35-18 | ✓ SATISFIED | 8 areas + decision-trace appendix; the logout item correctly sourced from 35-09's *observed* behaviour rather than the superseded decision text. |

**Orphaned requirements:** none. All 21 IDs the ROADMAP assigns to Phase 35 appear in at least one PLAN's `requirements:` field, and all 21 are accounted for above.

**Traceability defect (records, not code):** `.planning/REQUIREMENTS.md`'s table (lines 423-443) still reads `Planned (2026-08-28)` for **18 of 21** rows — only REQ-35-02, -18 and -19 are marked Complete. The checkbox list at 1137-1157 marks only `[x]` on -02, -18, -19, -21. By the evidence above, at least REQ-35-01, -03, -08, -09, -10, -11, -12, -13, -14, -15 are demonstrably complete and their rows understate reality. This is the project's known status-doc-lag pattern running in the *understating* direction.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `package.json` | `main` | `"main": "build/main/main.js"` — target file does not exist | ⚠️ Warning | A surviving declaration of the deleted Electron entry point. Inert under Tauri (nothing reads it), but it is exactly the class of stale pointer 35-05's own must-have called "worse than none". The D-03 gate cannot see it — `electronAbsence.test.ts` matches reference forms and dependency keys, not the `main` field. |
| `package.json` | `debug:react` | `"pnpm start & npx react-devtools"` — `start` deleted by 35-14, `react-devtools` no longer a dependency | ⚠️ Warning | Broken developer script. Its companion `vite_plugin_react_dev_tools` in `vite.config.ts` is now unreachable in practice. |
| `pnpm-workspace.yaml` | 8 | `onlyBuiltDependencies:` still lists `electron` | ⚠️ Warning | Build-approval entry for a package no longer installed. |
| `package.json` | — | `vite` is used by `beforeDevCommand`, `tauri:dev:packaged` and the CI renderer step, but is **not a declared dependency** — only a hoisted peer of `@vitejs/plugin-react-swc` / `vite-plugin-svgr` | ⚠️ Warning | This is `D-35-03-02`, which the ROADMAP itself flags as "a BLOCKING input for 35-14". It resolves today only because `.npmrc` sets `node-linker=hoisted`. The build's own toolchain depends on an undeclared package. |
| `.github/workflows/release-tauri.yml` | 12-20, 137, 404-416 | Header prose describes `draft-release-mac.yml`/`draft-release-linux.yml` co-running on `v*` and `electron-builder`'s artifactName segments | ⚠️ Warning | Both workflows are **deleted** — `.github/workflows/` no longer contains them. Stale prose describing a deleted mechanism in a file this phase edited. |
| `src/backend/save_sync.ts`, `eos_overlay.ts`, `utils.ts`, `extra-mock-function.ts`, `common/types/electron_store.ts` | 9 sites | `FIXME` markers with no issue/PR reference | ℹ️ Info | **Not a blocker.** I checked each against the phase base commit `e42f9862` — all 9 pre-date Phase 35 (inherited upstream Heroic debt), and the phase added exactly one `FIXME` line, `vite.config.ts:71`, which is a **verbatim carry** of `electron.vite.config.ts:21` as part of the documented lift. No new unreferenced debt. |
| `build/main/` | — | Holds `sidecar.js`, `sidecar-sea-bundle.js`, `decompressWorker*.js` — no `main.js` | ℹ️ Info | Confirms nothing Electron-shaped remains buildable; the directory name is now a misnomer only. |
| `Contents/Resources/build/` | — | No `crossover-index.json.gz`, which REQ-35-10's own text names as a `publicDir` asset class | ℹ️ Info | **Not a gap.** The snapshot is gitignored and CI-generated (`build-crossover-index.yml`); it exists in neither `public/` nor `build/` in this tree, so there is nothing to bundle. `fetcher.ts:43-60` explicitly treats ENOENT as "a NORMAL cold-start, not an error" and logs at info. |

---

### Correction to a phase record

`35-LIVE-GATE.md`'s frontmatter asserts: *"all four FAILs trace to pre-existing or upstream-inherited code, NOT the Electron cutover."* For criterion 6, **the gate's own body contradicts that** — it says explicitly: *"WHERE IT WAS INTRODUCED IS NOT ESTABLISHED HERE and must not be assumed."* The summary claim was therefore unsupported at the time it was written.

I closed that gap independently. `git grep addRecentGame pre-electron-cutover` and the phase base `e42f9862` both show the identical single call site at `launcher.ts:320`. **The claim is TRUE**, but it is now established rather than asserted. Criteria 10 and 14 already carried their own provenance evidence (`git blame` → upstream `7ba121ec5f`, and `git show 5643c7583^` respectively); criterion 6 did not.

---

### Gaps Summary

**The cutover is real and it is done well.** Electron is gone by every measure I could apply — config, entry points, imports, namespace references, dependencies, build alias, mock, e2e harness, Flatpak channel, and the `isTauri()` branch tree. The reach ledger measures zero non-vacuously. `R-34.5-G1-PKG`, the scope item homed here in August and orphaned across three prior phases, is closed on **both** halves, and I confirmed half (a) by listing a real shipping `.app` rather than trusting the summary that claimed it. The point of no return was tagged, gated on a census-built zero-MISSING checklist, and the A/B signal that Electron's deletion destroys forever was captured first, in wave 1, exactly as planned.

**What blocks closure is narrower than it looks, and it has one dominant shape.** Three of the four gate FAILs and both of the partial feature requirements converge on the same thing: **Steam titles are second-class on runner-resolution paths.** `protocol.ts:15`'s `RUNNERS` enum lists four runners while `storeManagers/index.ts` registers six, so a Steam deep link can never resolve. `addRecentGame` has one call site that the Steam `steam://rungameid` handoff structurally never reaches, so the tray's new recent-games submenu is empty of the platform this project exists to add. Both root causes pre-date the phase — I verified that against the `pre-electron-cutover` tag — but Phase 35 built two new user-facing affordances directly on top of them and measured them only at the very end, in the closing gate. Two defects, different files, one fix session.

**Two further gaps are independent.** The `installed.json` watcher was ported faithfully — and faithfully carried forward a 2022 upstream defect where the refresh never tells the renderer, so the user still has to hit refresh manually. And `meta/__tests__/genI18nGateScope.test.ts`'s A-17 ANTI-ROT is a genuine Phase 35 regression whose sanctioned one-command fix has already been measured to make things worse (1 failure → 5); it needs a coordinated multi-file change, and no later milestone phase owns it.

**Two things that look like gaps are not.** `pnpm lint` exiting 1 is Phase 39's declared job, sequenced deliberately after this phase. The Windows/Linux smoke launches are Phase 38's, routed there by REQ-35-20's own text with the user's explicit acknowledgement.

**Finally, the records need a pass.** `REQUIREMENTS.md` still calls 18 of 21 requirements "Planned" when at least ten are demonstrably complete — this phase's status documents lag reality in the understating direction, which is the mirror image of the failure mode this verification was asked to watch for. And `35-REVIEW.md` remains `status: issues_found` with four criticals unaddressed, one of which (`open_external` forwarding any renderer-supplied URL straight to `app.opener().open_url` with no scheme allow-list — confirmed at `main.rs:1203-1207`) is a security item, not a style note.

---

_Verified: 2026-08-30T04:12:40Z_
_Verifier: Claude (gsd-verifier)_

---

## RE-VERIFICATION — plan 35-29 live-gate re-run, 2026-08-31

**This section records a change to ONE gap only. The overall `status:` is deliberately left at
`gaps_found` for the phase verifier to re-adjudicate — this document's author is not re-scoring the
other must-haves.**

### REQ-35-20 — RESOLVED

The blocking gate's four FAILs were the sole basis of this gap. All four were re-measured on the
packaged release artifact (`/Applications/GameLib.app`, `0.7.0`, bundle mtime `Aug 31 07:54:39
2026`) and all four PASS, together with criterion 21's re-measure and regression checks 4, 5 and
15 — **8 measured, 8 PASS, 0 FAIL**.

The gap's diagnosis was correct in every particular, and each named cause now has a landed fix:

| gap artifact | cause as diagnosed | closed by |
| --- | --- | --- |
| `src/backend/protocol.ts:15` | `RUNNERS` omits `steam`, so a Steam deep link can never resolve | plan `35-20` Task 1 — criterion 10 PASS |
| `src/backend/launcher.ts:320` | `addRecentGame`'s only call site is unreachable on the Steam handoff | plan `35-20` Task 2 (`dispatchSteamLaunch`) — criterion 6 PASS |
| `src/backend/sidecar/installedJsonWatcher.ts:86` | debounced refresh sends no frontend message | plan `35-20` Task 3 — criterion 14, `origin=push` observed |
| shared `pendingOps` counter (F-35-08-A) | one membership test governing two assertion kinds | plan `35-27` — criterion 16 PASS on both exposing configurations |

The verification's reading that "Steam titles are second-class on runner-resolution paths" was the
right unifying diagnosis: two of the four fixes are the same shape, and `dispatchSteamLaunch` exists
specifically so the two call sites cannot drift apart again.

### Qualifications that survive this resolution

Recorded so a future reader does not treat `resolved` as unconditional:

- **Criterion 10** proves deep-link delivery via the **argv** path. The LaunchServices **AppleEvent**
  path was not verified on this machine.
- **Criterion 14**'s backend and push halves are positively evidenced (`origin=push`, distinct from
  the boot-time `origin=mount`). The **visible re-render was not observed** — the operator was not
  watching the Library at the moment of the gesture.
- **Criterion 21** passes its contract (logout real, credentials required), but **`D-35-19-15` is
  NOT closed**: neither closure route was available. See `D-35-29-01`.

### New items raised BY the re-run

None of these existed before it, and none are in this phase's gap-closure scope fence:

- **`D-35-29-01`** — plan `35-23`'s Epic cookie census is **inert at logout** (needs a login window;
  logout has none). A defect in this cycle's own delivered fix, invisible to its unit tests.
- **`D-35-29-02`** — four Epic auth cookies survive logout on the primary domain. Inert for
  re-auth; cause not established.
- **`D-35-29-03`** — the tray About window opens without focus, on a secondary display.
- **Criterion 5 contract defect** — its `Sink:` line names `gamelib-shell.log`, which its
  `eprintln!`-only call sites at `main.rs:725`/`:730` cannot write to.

### Gaps NOT touched by this re-run

The remaining gaps stand exactly as recorded: `pnpm lint` (routed to Phase 39), Windows/Linux
parity (routed to Phase 38), and the records-hygiene items addressed separately by plan `35-28`.

_Re-verified: 2026-08-31 — plan 35-29 Task 4_

---

## RE-VERIFICATION (independent) — 2026-08-31

**Verifier:** Claude (gsd-verifier), a session that did not run the gap-closure cycle and did not
write the `RE-VERIFICATION — plan 35-29` section above.

**Verdict: `gaps_found`, 16/17.** Four of the five recorded gaps are genuinely closed. One is not,
and it is the phase's remaining blocker. **The green live gate does not close this phase.**

### What I re-measured myself, rather than reading

Every claim below was executed in this verifier's own process. SUMMARY and gate assertions were
treated as inputs to check, not as evidence.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck gate | `pnpm codecheck` (`tsc --noEmit`) | **exit 0**, clean |
| Full suite | `pnpm test`, redirected to a file, `$?` captured directly (never from a pipe) | **exit 1** — 3 failed / 3 skipped / 7296 passed; 365 of 366 suites |
| The named Phase 35 regression | `npx jest meta/__tests__/genI18nGateScope.test.ts` | **exit 0** — 26 passed / 1 skipped / 0 failed |
| …and is that green vacuous? | same run, `--verbose` | **No.** `A-17 ANTI-ROT non-vacuity` and `A-03 RATCHET non-vacuity` both PASS live — the gate demonstrably still fails against a mutated artifact |
| …and the 1 skip? | `git log -S "it.skip('every fork-touched source file"` | introduced **2026-08-11** (`b4d62dd22`), blocked on WR-17. Pre-dates Phase 35; not a cycle artefact |
| Five absence/pin gates | `npx jest --runInBand` × 5 suites | **exit 0** — 5 suites / 42 tests. No regression from the cycle |
| `isTauri` truly absent | `grep -rn 'isTauri' src/ \| wc -l` | **0** |
| Did the gate measure stale code? | commit timestamps vs bundle mtime | **No.** Last source commit `0f5dfb352` **Aug 31 07:14:30**; packaged `gamelib-shell` mtime **Aug 31 07:54:39**. Everything after that is docs or `meta/` |
| Is decompressPool a Phase 35 regression? | `git diff e42f9862..HEAD -- <lzma files>` | **No.** The phase's only touches are **two comment-text edits** (`lzmaNativeBinding.ts`, `meta/buildDecompressWorkerDev.ts`). Zero functional change |

### Re-adjudicated truths

Superseding the original table. Truths 1–8, 10, 11 were VERIFIED originally and were regression-
checked here, not re-derived from scratch.

| # | Truth | Then | Now | Evidence |
|---|-------|------|-----|----------|
| 1–8, 10, 11 | Cutover substance (config gone, preload gone, `isTauri()` gone, no Electron entry point, `R-34.5-G1-PKG` both halves, `powerSaveBlocker` real, A/B retest captured, tagged point of no return) | ✓ | ✓ VERIFIED (regression-checked) | 5 gates + un-anchored grep re-run by me, all green |
| 9 | The `session` parity gap is resolved or explicitly accepted | ✗ | **✗ FAILED — and now worse** | See "The one gap that stands" below |
| 12 | REQ-35-20 — the phase closes on a PASSING blocking packaged gate | ✗ | ✓ VERIFIED (qualified) | Gate `status: rerun-pass`, 21 PASS / 0 FAIL; all four named causes have landed fixes I read in the codebase |
| 13 | REQ-35-16 — three folded channel dead ends closed, each attributed | ✗ | ✓ VERIFIED (qualified) | `WinetricksSearch/index.tsx:77` `onMouseDown` + RED-proven pin; attribution clause amended with superseded wording left visible |
| 14 | REQ-35-17 — UI affordances + SEAM convergence closed | ✗ | ✓ VERIFIED (qualified) | Both `dialog.showMessageBox` sites gone from `eos_overlay.ts`; fail-closed `confirmed === true` gate; confirm AND cancel exercised live on all three actions |
| 15 | REQ-35-04 — tray real, no unhonoured affordance | ✗ | ✓ VERIFIED | Criterion 6 PASS on **both** halves — storage (`games.recent` carries `runner:"steam"`) and execution (submenu entry launched the title) |
| 16 | REQ-35-05 — `gamelib://` OS-registered and reaches the parser | ✗ | ✓ VERIFIED (qualified) | `protocol.ts:26` `RUNNERS` includes `steam`; `:157-164` routes Steam to `dispatchSteamLaunch`; criterion 10 shows the full three-line chain. **argv path only** |
| 17 | Mechanized gates green, no Phase 35 regression | ✗ | ✓ VERIFIED (qualified) | A-17 closed and re-run by me with live non-vacuity controls. **Residual red suite recorded below, not absorbed** |

**Score: 16/17.** *(Superseded 2026-08-31 by the closure section at the end of this file: **17/17**. Left unaltered here as the 19:40 record.)*

### The one gap that stands — REQ-35-07 (BLOCKER) — *CLOSED later the same day; see the closure section at the end of this file. This diagnosis was correct and its prescribed fix is the one that shipped.*

**A significant finding, not a footnote: this cycle's own delivered fix does not execute, and its
unit tests structurally cannot see that.**

Plan `35-23` implemented the per-host Epic cookie census that `D-35-19-15` itself sanctioned as the
way to close REQ-35-07 without seeding. The construction is careful and correct — per-host
`before`/`after`, classifying on `matched` rather than `jarTotal` so an Epic-empty host in a live
shared jar reads `SUPPORTED_BUT_EMPTY`. **It returns `UNSUPPORTED_OR_ERROR` on all five hosts, on
every Epic logout, permanently.**

I confirmed the cause in Rust source rather than accepting the gate's diagnosis:

- The census arm at `src-tauri/src/main.rs:6341` resolves `app.get_webview_window(label)` and errors
  `humble_login_cookies_for_domain:no-window:{label}` when that fails.
- **This same file already says why that can never succeed for Epic.** The doc comment above
  `clear_default_data_store_cookies_for_domain` states that Epic's login window is *always* the
  pristine, webview-less `WindowBuilder` window, so `app.get_webview_window(label)` "structurally
  can never find it, **for ANY label, fresh or stale**."
- The **clear** path was given a label-independent data-store fallback for precisely this reason.
  The **census** path was not.

The knowledge that would have predicted this defect was already in the same file, in a comment
written for the identical defect one function over. This is a sharper instance of the project's
`review-prescribed-fix-can-carry-the-same-defect` pattern than the deferred item records.

**Downstream consequence that `D-35-29-01` does not spell out.** In `legendary/user.ts`'s CR-04
fatality logic, the `brokenHosts` detector requires `domainVerdict(before) === 'SUPPORTED_NONEMPTY'`
and the non-fatal "genuinely empty" branch requires `'SUPPORTED_BUT_EMPTY'`. With every verdict
pinned at `UNSUPPORTED_OR_ERROR`, **neither is reachable**. Case 1 — the broken-per-host detector,
which is the entire capability `D-35-19-15` asked for — is **dead code on the only path it serves**,
and case 3's non-fatal branch is unreachable too. What survives is exactly the pre-existing bare
zero-sum fatality that existed before `35-23` ran.

The fail-closed property is intact and correct. The new observability is not. **`35-23` added no
working evidence capability to the Epic logout path.**

**Not deferrable.** The item can only close when `D-35-29-01` is fixed or an embedded browser view
returns to seed a non-primary apex. I searched the roadmap: no later milestone phase owns the
embedded store browser's return (Phase 34.4.1 is earlier), so this cannot be moved to a `deferred`
row under Step 9b.

### Qualifications that survive the green gate — preserved, not flattened

These are recorded in the gate's RE-RUN section and are carried forward verbatim in intent:

- **Criterion 10** proves deep-link delivery via the **argv** path only. The LaunchServices
  **AppleEvent** path is unverified on this machine.
- **Criterion 14**'s backend and push halves are positively evidenced (`origin=push`, distinct from
  the boot-time `origin=mount`). The **visible re-render was UNOBSERVED**. A message arriving is not
  proof a surface repainted.
- **Criterion 21** passes its contract (logout real, credentials required) but **`D-35-19-15` is not
  closed**. Criterion 21 tests credential re-entry; `D-35-19-15` asks whether the multi-domain clear
  works. Different questions.
- **`UNMEASURED` is not `FAIL`.** The gate maintains that distinction and so does this report.
- **Verifier-added qualification:** **13 of the 21 criteria were not re-measured.** They carry
  forward verdicts taken on the Aug 30 build; only criteria 4, 5 and 15 guard that carry-forward.
  The gate declares this scope openly, and the un-re-measured criteria are largely static/artifact
  checks — but "21 PASS" is a composite of two builds, not one measurement.
- **Criterion 17** is unchanged: PASS on substance, its "does not throw" clause a
  contract-expectation defect against a 404 endpoint, not a code defect.

### Residual red gate — recorded, not absorbed

`pnpm test` **exits 1**: 3 failures in `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`
(native-LZMA path resolving `pure-js` under jest). I verified independently that Phase 35 is not the
cause — across the *whole* phase (`e42f9862..HEAD`) its only edits to lzma files are two comment-text
changes. Ledgered at `.planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md`.

Truth 17 is scored VERIFIED because this gap's own `reason` and `missing` named the A-17 regression
exclusively and explicitly carved decompressPool and lint out of scope. **But the repo does not have
a green `pnpm test`, and no phase currently owns making it green.**

### New items raised by the re-run — records check

| Item | Recorded? | Verifier note |
| --- | --- | --- |
| `D-35-29-01` — census inert at logout | ✓ `deferred-items.md:2109` | Rigorous: names the cause, the fix direction, and the reason unit tests were blind. **I confirmed it structurally in Rust source and found it is worse than recorded** (see above) |
| `D-35-29-02` — 4 Epic cookies survive logout on the primary domain | ✓ `deferred-items.md:2150` | Correctly holds two competing explanations without asserting either |
| `D-35-29-03` — tray About opens unfocused on a secondary display | ✓ `deferred-items.md:2183` | Recorded |
| Criterion 5 contract defect (`Sink:` names `gamelib-shell.log`, unreachable from `eprintln!` at `main.rs:725`/`:730`) | **✗ NOT ledgered** | Appears only in `35-LIVE-GATE.md`'s RE-RUN body and frontmatter verdict. The other three got `D-` entries; this one did not. **Minor records gap — file it** |
| `D-35-19-15` | ✓ updated | Carries a correct **"RE-RUN 2026-08-31: STILL OPEN. NOT CLOSED"** block naming both dead routes |
| `D-35-11-01` | ✓ updated | Carries **"RESOLVED 2026-08-30, plan 35-26"** |

### Adjudication of the pre-existing `RE-VERIFICATION` section

The `RE-VERIFICATION — plan 35-29` section above, and the `status: resolved` marking on the
REQ-35-20 gap, are **CORRECT**. I checked them adversarially rather than accepting them:

- Each of the four named causes has a real landed fix, read in the codebase — not inferred from a
  SUMMARY. `dispatchSteamLaunch` in particular exists as a **shared module** consumed by both call
  sites (`protocol.ts:163`, `steamFlowRegistration.ts:358`), which is the structural answer to the
  drift that caused criteria 6 and 10 to fail together.
- The packaged artifact postdates every code fix, so the gate is not measuring stale code — the
  single most likely way a green re-run could have been worthless.
- The section correctly declines to re-score the other must-haves and correctly refuses to read
  criterion 21's PASS as closing `D-35-19-15`.

**One thing it understates**, corrected here: `D-35-29-01` is not merely "a defect in this cycle's
own delivered fix." It renders the CR-04 broken-host detector unreachable, which means REQ-35-07 is
no closer to closure than before `35-23` ran.

### Records still lagging

- **`35-REVIEW.md` is still `status: issues_found`** with no resolution annotation on CR-01..CR-04,
  although all four fixes have landed and I verified each in code (`main.rs:1207`/`:1220`;
  `appShellFlowRegistration.ts:202`; `tauriAttach.ts:77`; `Login/components/Runner` +
  `legendary/user.ts`). A records pass, not a decision.
- The criterion 5 contract defect needs a `D-` entry.

### Bottom line

*(Superseded — see the closure section at the end of this file. The "cannot currently be produced"
clause was the part that turned out to be wrong: it could be produced, once the census was given
the fallback the clear already had. Left unaltered below as the 19:40 record.)*

The cutover goal is achieved and the blocking gate is green. **The phase does not close.** One
must-have fails on live evidence that does not exist and cannot currently be produced, two gates
(`pnpm lint`, Windows/Linux smoke) are legitimately owned by Phases 39 and 38, and `pnpm test` is
red on an unowned pre-existing failure. Reporting this as a close would be a partial reported as a
close — which is the failure mode this project cares most about.

**Do not check Phase 35's ROADMAP box.** It is currently unchecked with an accurate in-progress
annotation; that is the correct state.

---

_Re-verified: 2026-08-31_
_Verifier: Claude (gsd-verifier) — independent of the gap-closure cycle_

---

## POST-RE-VERIFICATION CLOSURE — 2026-08-31

**Recorded by the executor of quick task `260831-q93`, not by an independent verifier.** This
section discharges the single gap the 19:40 re-verification left standing. It does not re-open,
re-score or re-adjudicate anything else in this report; everything above it is preserved
unaltered.

**Score: 16/17 -> 17/17. Status: gaps_found -> verified.**

### What closed, and on what evidence

`D-35-29-01` — the census that `35-23` shipped could not execute — was fixed by commit
`9106ccbea`. The fix is the one this report's own "The one gap that stands" section prescribed:
give the census read the same label-independent default-data-store fallback the **clear** path
already had. A new `default_data_store_cookies_for_domain` sits immediately after
`clear_default_data_store_cookies_for_domain` in `src-tauri/src/main.rs`, and the census arm now
binds `existing_window` first and falls back on
`existing_window.is_none() && epic_cookie_domain_matches(domain)`.

Live Epic logout, `pnpm tauri:dev`, 2026-08-31 19:27, verbatim from `gamelib.log`:

```
(19:27:14) Legendary logout: cleared 3 epicgames.com cookie(s) (measured post-removal delta) — cookie census before(total=57, matched=3, verdict=SUPPORTED_NONEMPTY) after(total=54, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:14) Legendary logout: cleared 1 fortnite.com cookie(s) (measured post-removal delta) — cookie census before(total=54, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=54, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:14) Legendary logout: cleared 1 unrealengine.com cookie(s) (measured post-removal delta) — cookie census before(total=54, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=53, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:15) Legendary logout: cleared 1 twinmotion.com cookie(s) (measured post-removal delta) — cookie census before(total=53, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=52, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:15) Legendary logout: cleared 1 metahuman.com cookie(s) (measured post-removal delta) — cookie census before(total=52, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=51, matched=0, verdict=SUPPORTED_NONEMPTY)
(19:27:15) Legendary logout: Epic cookie clear removed 7 cookie(s) across 5 Epic-owned domain(s) — epicgames.com=3, fortnite.com=1, unrealengine.com=1, twinmotion.com=1, metahuman.com=1
```

Both halves of the gap are answered by that block:

- **REQ-35-07's own clause** — "does not report success unless a post-clear read confirms it" —
  is now genuinely enforced rather than nominally present. Every host carries a numeric `total=`
  and `matched=` and a verdict other than `UNSUPPORTED_OR_ERROR`; `cookie census read failed`
  appears **0** times, against 5-per-host before the fix. The `brokenHosts` detector became
  reachable for the first time in its existence and stayed silent **correctly** — every host's
  `matched` went to 0, so no host presented the proven-populated-with-zero-delta shape it exists
  to catch. Reachable-and-silent is not the same as unreachable.
- **`D-35-19-15`'s multi-domain question** is answered directly: all four **non-primary** apexes
  read `before(matched=1)`, cleared **1**, and read `after(matched=0)`. That is a non-primary
  Epic domain confirmed present before logout followed by a non-zero clear on it — exactly the
  measurement that item demanded and never got.

### What this report got right, recorded because it is the interesting part

This report diagnosed the cause in Rust source rather than accepting the gate's word, named the
exact mechanism (`app.get_webview_window(label)` against a pristine webview-less window),
identified that the clear path already carried the fix and the census did not, and prescribed the
remedy. All of that was correct and the shipped fix is that prescription. The report's one
overreach was the phrase "cannot currently be produced" in its Bottom line — it could be
produced, in under an hour, by the fix the report had itself already written down.

### Qualifications — read these before treating 17/17 as unconditional

1. **The `D-35-19-15` evidence arrived OPPORTUNISTICALLY.** No seeding was performed and none was
   possible; this report's finding that the Tauri build embeds no browser view, and that
   therefore no user action can create a non-primary Epic cookie, still stands and is now doubly
   confirmed. The four enabling cookies were **legacy Electron-era residue** sitting in the
   dev-keyed jar. `260831-q93` did **not** fix the multi-domain widening — the widening always
   worked; the observability defect that made it unprovable is what was fixed.
2. **Unit tests are not the evidence and were refused as such.** `cargo test` 215/215 and the
   jest source gates were green throughout the entire period the probe returned nothing, and
   green again afterwards. `D-35-29-01`'s own closing sentence set that bar; it is honoured.
3. **Different build, different jar than the 21-criterion gate.** Measured on `pnpm tauri:dev`
   against `gamelib-shell.binarycookies` (process-name keyed, because the dev binary is
   unbundled), not the packaged `com.gamelib.shell.binarycookies`. Build identity was **verified,
   not assumed**: `nm` on the running binary returns 35 symbol hits for
   `default_data_store_cookies_for_domain`. Worth recording for reuse — `strings` on the same
   binary returns **0** for that symbol, because Rust function names live in the symbol table and
   not as string literals, so `strings` would have falsely indicated a stale build.
4. **`D-35-29-02` is still OPEN and was made sharper by this run**, which upgraded it from a
   single-jar observation to a **reproduced** one: the same four Epic auth cookie names survive
   logout on the second, differently-keyed jar. It also created a contradiction that did not
   exist when this report was written — the product's in-process post-clear census now reads
   `matched=0` on all five hosts while an external `strings` read of the same jar still shows
   those four names. That item was already an open deferred item and not a scored must-have
   failure at 16/17, and this executor has **not** re-adjudicated it. If a future verifier
   decides that residual belongs against REQ-35-07's "clears persisted state" half, this score
   should move back. The instrument to settle it now exists, which it did not before.
5. **Two anomalies from the run, recorded and deliberately not chased:** `fortnite.com` shows
   `before total=54` / `after total=54` despite clearing 1 (the per-host `matched` moved 1 -> 0
   correctly; only the jar-wide `total` failed to decrement); and an external `strings` proxy
   counted `epicgames.com` occurrences 4 -> 6 **after** the clear — that proxy counts raw string
   occurrences in a rewritten binary file, not cookies, so it is unusable for arithmetic and must
   not be read as the clear adding cookies.
6. **Nothing else moved.** The two gates routed out of Phase 35 (`pnpm lint` -> Phase 39,
   Windows/Linux smoke -> Phase 38) and the red `pnpm test` (3 `decompressPool` native-LZMA
   failures, ledgered as an unowned pre-existing todo) are untouched by this task and were
   already excluded from the 17 must-haves. They are not claimed as closed. The ROADMAP box was
   deliberately **not** touched.

### F-34.4.2-12 accounting, preserved

| | wry `.cookies()` per host (macOS) | native `getAllCookies` per host |
| --- | --- | --- |
| before this fix | 0 | 2 (clear path's before/after, default store) |
| after this fix | **0 — unchanged** | 4 (adds the census's before/after, default store) |

The two added reads are not bound to any window, so `with_webview` reentrancy is not in play, and
they reuse the `run_on_main_thread` + `RcBlock` + calling-thread-`mpsc` shape the clear path
already ran twice per host, live, without deadlock. Logout did not hang.

---

_Closure recorded: 2026-08-31_
_Recorded by: executor of quick task `260831-q93` — NOT an independent verification pass_

---

## INDEPENDENT ADJUDICATION OF THE 17/17 CLAIM — 2026-08-31

**Third pass. Independent verifier, spawned specifically because the `16/17 -> 17/17` move was
made by the quick-task executor closing its own work.** The file disclosed that conflict twice
and named the exact way it could be wrong. Everything above this section is preserved unaltered.

### Verdict

**REJECTED. 17/17 is not earned. Score returns to 16/17; status returns to `gaps_found`.**

Not for the reason the executor anticipated. The executor asked whether `D-35-29-02`'s residual
cookies "belong against REQ-35-07's *clears persisted state* half", and framed that as a judgement
call about whether inert cookies count. **That framing is obsolete, because the premise it rests on
is false.** This pass took the conclusive measurement `D-35-29-02` said it could not take, and the
residue is neither remnant-noise nor fully inert.

### The measurement

Both jars were copied out and decoded with a real Apple `binarycookies` parser that walks the
**file's own page/offset index**. Only records the file itself references as live are reported.
`strings` was used only as a cross-check on occurrence counts.

| Jar | mtime | Clear at | Epic-owned LIVE records after logout |
| --- | --- | --- | --- |
| `gamelib-shell.binarycookies` (dev, process-name keyed) | 2026-08-31 **19:27:18** | 19:27:14 | **6** |
| `com.gamelib.shell.binarycookies` (packaged, bundle-id keyed) | 2026-08-31 **18:17:28** | 18:15:15 | **7** |

Both mtimes **postdate** their clear. The packaged process has since exited, so its jar is a
**final flush**, not a lagging snapshot.

**Finding 1 — the exculpatory hypothesis is falsified.** `D-35-29-02` named
"`strings` over a binary format could surface unreferenced remnants rather than live cookies" as
its **leading candidate**, and `post_reverification_closure` leaned on it. It is wrong. All four
names are live records referenced by the page index, on `.epicgames.com`:

```
.epicgames.com   EPIC_DEVICE     path=/  vlen=32   created=2026-08-31T07:27:15
.epicgames.com   EPIC_LOGIN_ID   path=/  vlen=96   created=2026-08-31T07:27:15
.epicgames.com   _epicSID        path=/  vlen=32   created=2026-08-31T07:27:15
.epicgames.com   _tald           path=/  vlen=36   created=2026-08-31T07:27:16
```

Each of the four names occurs **exactly once** in the whole file. Live-record count equals byte
occurrence count. There are no remnants at all — only live cookies.

**Finding 2 — new, worse, and named nowhere in this phase.** The **packaged** jar carries a fifth
surviving `.epicgames.com` record that no report mentions:

```
.epicgames.com   EPIC_SESSION_AP  path=/id  vlen=1310  created=2026-08-31T06:17:18  exp=2027-08-31
```

That is Epic's `/id` **session credential**, not an identifier crumb. Its creation stamp predates
the 18:15:15 logout by nine hours, so it **survived** rather than being re-created in the gap
`D-35-29-02`'s hypothesis 2 proposed. `D-35-29-02`'s severity bound — "authentication is NOT
restored by these cookies" — was established against a four-name set that **does not include it**,
because that read was a `strings` grep for four names known in advance. **The inertness defence is
not established for the actual residue set.**

**Finding 3 — the two-measurement contradiction resolves against the product.** `legendary/user.ts:243`
calls `seam.cookiesForDomain(label, host, [])` with an **empty** names array, and the Rust census
applies `filter_names.is_empty() || ...`, so `matched` is *every* cookie whose domain matches the
host — not a name-scoped subset. `cookie_domain_matches` (`main.rs:1836-1839`) strips the leading
dot and suffix-matches, so `.epicgames.com`, `.www.epicgames.com` and `.ecosec.on.epicgames.com`
all match target `epicgames.com`. The product logged:

```
Legendary logout: cleared 3 epicgames.com cookie(s) (measured post-removal delta)
  — cookie census before(total=57, matched=3, verdict=SUPPORTED_NONEMPTY)
                   after(total=54, matched=0, verdict=SUPPORTED_NONEMPTY)
```

The jar written **three seconds later** holds **six** matching live records. `matched=0` is false.

**Finding 4 — the census arithmetic does not self-reconcile either.** It reported `57 -> 51`
(a drop of 6) while reporting 7 cleared, and the `fortnite.com` step logged `cleared 1` with total
**unchanged** at 54. The decoded jar holds **56** live records against the census's closing total
of **51**. The census and the persisted jar are not views of the same set.

Two builds, two differently-keyed jars, two logouts, same outcome. Reproduced, not incidental.

### Why REQ-35-07 fails, argued from the requirement's own text

> **REQ-35-07**: Logging out clears the embedded browser's persisted state — cookies, localStorage,
> IndexedDB and disk cache — and the app does not report success unless a **post-clear read
> confirms it**. This closes the standing 34.6 live-gate Step 8 FAIL, a genuine unaddressed failure
> where the app reports clearing cookies it does not clear; on a shared machine that is credential
> exposure, not cosmetics. […] Discharged by having to re-enter credentials […]

**Clause 1 fails.** Cookies are named **first and unconditionally**. The text does not say "cookies
that still authenticate". Five Epic cookies including a 1310-byte session credential survive in the
persisted jar.

**Clause 2 fails, and is dispositive on its own.** The app reported success on a post-clear read
that returned `matched=0` against a jar holding six matching live records. That is not a
confirmation — it is a **false** confirmation. This does not depend on the inertness argument at
all. The requirement's own rationale names the exact failure mode now being reproduced: *"the app
reports clearing cookies it does not clear; on a shared machine that is credential exposure."*
Phase 35's answer to that was a post-clear census; the census now certifies removal of cookies that
are still there. **The defect REQ-35-07 exists to close has been reproduced inside REQ-35-07's own
closure mechanism.**

**The one clause that passes, recorded rather than suppressed.** The discharge test — *"Discharged
by having to re-enter credentials"* — was met: re-login demanded credentials. This is the strongest
argument for the executor's position. It is not sufficient: it is a test **of clause 1**, it says
nothing about clause 2, and it was never run against `EPIC_SESSION_AP`, because nobody knew that
cookie had survived.

No override exists (`overrides_applied: 0`). REQ-35-07 therefore resolves **FAILED**, not
`PASSED (override)`. If the user wishes to accept the deviation, the vehicle is an explicit
`overrides:` entry with a reason and an acceptor — not a score move.

### What quick task `260831-q93` did legitimately earn

Rejecting the score is not rejecting the work. Three of the four claims put to this pass hold.

| Claim | Verdict | Evidence |
| --- | --- | --- |
| `D-35-29-01` genuinely discharged | **YES, as to its letter** | `default_data_store_cookies_for_domain` exists in `src-tauri/src/main.rs`; the census arm binds `existing_window` first and falls back on `existing_window.is_none() && epic_cookie_domain_matches(domain)`; the preserved logs go from 5-per-host `cookie census read failed` to zero, with numeric `total=`/`matched=`. The probe is no longer inert. **What it does NOT earn is trust in the values it returns.** |
| Dev-jar-only measurement — does it matter? | **YES, and more than the executor allowed** | The packaged jar was never read by the fixed census, and it is the jar with the **worse** residue — seven Epic records including the session credential. The dev/packaged distinction is not a footnote here; it is where the un-named defect was hiding. |
| `D-35-19-15` genuinely closed, framing honest | **YES on both** | The 19:27 log shows all four non-primary apexes at `before(matched=1) -> cleared 1 -> after(matched=0)`, and my decode confirms zero non-primary Epic records remain in **either** jar. The opportunistic framing is present and honest in all three claimed places: `deferred-items.md`'s CLOSED block ("evidence arrived OPPORTUNISTICALLY, not the seeding step this item specified" / "Do not read this as `260831-q93` fixing the widening"), this file's `post_reverification_closure.honesty_qualifications`, and quick `SUMMARY.md` lines 149/158/238. |
| Did the score change smuggle anything? | **NO** | Parsed with `js-yaml`: 13 top-level keys, and `regressions` + `residual_red_gate` both sit correctly under `re_verification` — the nesting error the executor self-reported was genuinely fixed. `git diff 876faf5fe..HEAD` on this file is purely additive plus the status/score line; every superseded passage is annotated in place, none deleted. |

### Routed items — re-measured, routing confirmed

| Item | My measurement | Routing |
| --- | --- | --- |
| `pnpm lint` | exit **1**, 4155 problems (**9 errors**, 4146 warnings). Exit code captured from the command, not a pipe | Correctly Phase 39. **Not** among the 17 truths. **Drift noted:** the `deferred` block says "the 6 current errors"; there are now **9**, across `meta/__tests__/cleanDist.test.ts`, `src/backend/__tests__/packagingConfig.test.ts`, `src/backend/sidecar/__tests__/appShellFlows.test.ts`, `src/backend/sidecar/__tests__/steamAuthFlows.test.ts`, `src/backend/sidecar/installedJsonWatcher.ts`, `src/backend/utils.ts`, `src/frontend/screens/WebView/index.tsx`, `src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts`. Phase 39 should inherit the corrected count |
| Windows/Linux parity | not measurable here | Correctly Phase 38. REQ-35-20's **own text** routes the smoke-launch half to `38-W04`/`38-W05` and records the option-c reduction as user-acknowledged. **Not** among the 17 truths |
| `pnpm test` decompressPool | exit **1**, `Tests: 3 failed, 38 passed, 41 total` — all three lzmaLoader native-decode cases | Correctly excluded. Phase 35 attribution independently **disproved**: `git diff e42f9862..HEAD` touches exactly one lzma file, and the change is a single line **inside a doc comment**. Todo filed. **Measurement hazard for the next pass:** the real path is `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`; `npx jest` against the `src/backend/__tests__/` path exits 1 with `0 matches` — a fail-open shape that must not be read as a failure |

### Bottom line

The 19:40 re-verification's own summary — *"The cutover goal is achieved and the blocking gate is
green. The phase does not close."* — is restored, and its reasoning is strengthened rather than
weakened. Sixteen of seventeen must-haves hold. The Electron cutover itself is done.

REQ-35-07 is the one that does not, and the gap is **larger** than any record in this phase has
stated: a session credential survives logout on the packaged build, and the mechanism Phase 35
built to detect exactly that reports clean.

**Escalation — this needs a human decision, not another closure attempt.** Three options:

1. **Fix it.** Establish why the clear reports removal of cookies the persisted jar still holds
   (`wry-cookie-delete-lies-about-deleting` is the standing candidate in this stack), and make the
   post-clear read see persisted state rather than a divergent in-process view.
2. **Accept it.** Add an explicit `overrides:` entry to this file's frontmatter with a reason and
   an acceptor. That is the sanctioned vehicle for a deliberate deviation.
3. **Re-scope REQ-35-07.** Amend the requirement text so the confirmation clause states what the
   census can actually guarantee.

`D-35-29-02` should be upgraded to name `EPIC_SESSION_AP` and drop the "inert for re-authentication"
severity bound, which is not established for the actual residue set.

**Phase 35's ROADMAP checkbox remains deliberately unchecked. Closure is the user's call.**

---

_Independently readjudicated: 2026-08-31_
_Verifier: Claude (gsd-verifier) — third pass, independent of both the gap-closure cycle and quick task `260831-q93`_

---

## FOURTH ADJUDICATION — 2026-08-31 21:45

*Independent verifier, fourth pass. Spawned because the claim that the third pass's sole
remaining blocker had been fixed came from the `gsd-debug` session that made the fix — not from
an independent party. Everything below is evidence I took myself unless it is explicitly marked
as taken on the debugger's word.*

**This section is additive. Nothing above it has been deleted. Passages it supersedes carry a
dated correction in place.**

---

### Verdict

**The third pass's stated reason for failing REQ-35-07 is FALSIFIED, in both directions, on
evidence I measured directly. The score nevertheless stays 16/17 — on a different, much narrower
finding that this pass measured for the first time.**

REQ-35-07 moves from `failed` to `partial`.

| | Third pass said | Fourth pass measures |
|---|---|---|
| Clause 1 — logout clears cookies | FAILED: five Epic cookies survive | **VERIFIED LIVE.** 0 Epic-owned live records; 0 raw byte occurrences of any Epic marker. The "survivors" were *re-created by the logout's own hidden webview*, which this fix removes. |
| Clause 2 — no success without a confirming post-clear read | FAILED: `matched=0` against a jar holding six live records | **MECHANISM CORRECT, BUT FAIL-OPEN.** `matched=0` was never a lie. But a *rejecting* read still certifies "0 remain" — proved by running it. |

---

### What I measured myself

#### 1. The live cookie jars — my own index-walking decode, never `strings`

Both jars copied out and parsed by walking each page's own offset table, so only records the
file itself references as live are reported. A name-agnostic **byte** scan was run alongside it,
because a grep for names known in advance structurally cannot find an unknown survivor — that is
the exact mistake that produced the `EPIC_SESSION_AP` false alarm.

**Dev jar** `~/Library/HTTPStorages/gamelib-shell.binarycookies`, mtime `2026-08-31T21:03:15+1200`:

| measure | result |
|---|---|
| live cookie records (page/offset index) | **51** |
| Epic-owned live records | **0** |
| byte occurrences: `EPIC`, `__cf_bm`, `EPIC_SESSION_AP`, `_epicSID`, `_tald`, `EPIC_DEVICE`, `EPIC_LOGIN_ID` | **0 each** |
| byte occurrences: `fortnite`, `unrealengine`, `twinmotion`, `metahuman` | **0 each** |
| byte occurrences: `epicgames` | **1** — the `api.hcaptcha.com`/`hmt_id` partition key, correctly retained (clearing it is the REQ-34.4.1-06 harm) |
| non-Epic sessions (Humble, GOG, Amazon) | intact — no collateral loss |

My parse output is **byte-identical** (whitespace-normalised, `diff` exit 0) to the committed
`parse-AFTER-fix-run.txt`. The debugger did not fabricate its evidence.

**Packaged jar** `~/Library/HTTPStorages/com.gamelib.shell.binarycookies`, mtime
`2026-08-31T18:17:28+1200` — **unchanged since the third pass read it, and it PREDATES the fix
commit (21:11:09).** 30 live records, 7 Epic-owned. Not scored as a defect; fully explained below.

#### 2. The timezone correction — re-derived, not accepted

`date` → `Mon Aug 31 21:31:35 NZST 2026`; `date -u` → `Mon Aug 31 09:31:35 UTC 2026`. **UTC+12,
confirmed at verification time.** The parser emits UTC. Therefore:

| record | parser (UTC) | LOCAL | clear ran | verdict |
|---|---|---|---|---|
| `__cf_bm` ×2 (packaged) | 06:15:16 / :17 | 18:15:16 / :17 | 18:15:15 | **1–2 s AFTER** |
| `EPIC_DEVICE`, `EPIC_LOGIN_ID`, `_epicSID` | 06:15:16 | 18:15:16 | 18:15:15 | **1 s AFTER** |
| `_tald` | 06:15:17 | 18:15:17 | 18:15:15 | **2 s AFTER** |
| `EPIC_SESSION_AP` | 06:17:18 | **18:17:18** | 18:15:15 | **2 m 03 s AFTER** |

The third pass read `06:17:18` as local and concluded `EPIC_SESSION_AP` "predates the logout by
nine hours, so it survived rather than being re-created," then escalated severity on that basis.
**That escalation rested on a timezone slip and does not stand.**

**Independent corroboration I took myself:** both `__cf_bm` records carry an expiry of exactly
`created + 30 minutes` (`06:15:16 → 06:45:16`, `06:15:17 → 06:45:17`). That is Cloudflare's
bot-management TTL, and it can only be minted by a **live HTTPS round trip to Epic at that
second**. Something was talking to Epic one second after the clear. The fix identifies what:
the clear's own hidden webview, opened at Epic's live login page purely to obtain a handle the
macOS Rust arms never consult.

#### 3. `gamelib.log`, read directly rather than via the debug record

```
(21:03:12) [Legendary]: Legendary logout: cleared storage — localStorage=3, sessionStorage=0, indexedDB=0, caches=0, serviceWorkers=0
(21:03:13) [Legendary]: Legendary logout: cleared 8 epicgames.com cookie(s) … before(total=59, matched=8, verdict=SUPPORTED_NONEMPTY) after(total=51, matched=0, verdict=SUPPORTED_NONEMPTY)
(21:03:13) [Legendary]: … fortnite.com … before(total=51, matched=0) after(total=51, matched=0)
(21:03:13) [Legendary]: … unrealengine.com / twinmotion.com / metahuman.com — same shape
(21:03:13) [Legendary]: Legendary logout: Epic cookie clear removed 8 cookie(s) … epicgames.com=8, others=0
(21:03:13) [Legendary]: Legendary logout: post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s) — epicgames.com=0, fortnite.com=0, unrealengine.com=0, twinmotion.com=0, metahuman.com=0
```

Four things this settles that I did not have to take on trust:

1. **The reorder is live-exercised.** `cleared storage` at `:12` precedes the cookie sweep at
   `:13`. Not merely asserted in source.
2. **The proof is not vacuous.** `before(matched=8)` — eight Epic cookies were provably present.
3. **The census is genuinely live.** Every verdict is `SUPPORTED_NONEMPTY` with numeric totals,
   and there are **zero** `cookie census read failed` lines. D-35-29-01 is genuinely discharged.
4. **The arithmetic reconciles, and it reconciles against MY jar read.** `59 − 51 = 8 = reported
   8`. And the product's closing `after(total=51)` equals **exactly** the 51 live records my
   decode counts. The census and the persisted jar are one store — the third pass's "not views of
   the same set" is falsified, and the standing two-stores hypothesis with it.

#### 4. The source of the fix

All three claimed changes are present in `src/backend/storeManagers/legendary/user.ts`:

| claim | evidence |
|---|---|
| macOS opens no window for the cookie step | `:299` `const label = isMac ? EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL : await seam.open(COOKIE_HANDLE_ORIGIN, …)`; `seam.close` guarded by `if (!isMac)` at `:542` |
| `clearEpicStorage` before `clearEpicCookies` | registered at `:253` and `:274` respectively — order swapped |
| final post-clear census decides the outcome, residual fatal | `:517-535` loops all five `EPIC_COOKIE_HOSTS` *after every mutation*, then `if (residualTotal > 0) throw`; `FATAL_WIPE_STEP = 'clearEpicCookies'` at `:108` |

**Rust side — unchanged and constraint preserved.** `git diff 9106ccbea..HEAD -- src-tauri/` is
**empty**; the fix touched zero Rust files. Both arms still resolve label-independently
(`existing_window.is_none() && epic_cookie_domain_matches(domain)`, `main.rs:5975` and `:6472`).
`default_data_store_cookies_for_domain` (`main.rs:3969`) reads
`WKWebsiteDataStore::defaultDataStore()` through `getAllCookies` on a `run_on_main_thread` closure
that only *registers* the completion block, with the `mpsc` wait on the calling thread — **no wry
`.cookies()`, no `with_webview` reentrancy.** F-34.4.2-12 is preserved and pinned at
`main.rs:10670`. `EPIC_COOKIE_DOMAINS` scope untouched, so D-09-CORRECTED is honoured.

#### 5. Two RED-proofs I executed against the real file

The prompt asked me to RED-prove the source order gate or say plainly that I did not. **I did.**

| mutation | applied to | result | restored |
|---|---|---|---|
| Physically swap the two `wipeSteps` blocks | the real `user.ts` | **exactly 1 test fails** — `wipe-step ORDER … registers 'clearEpicStorage' BEFORE 'clearEpicCookies'` | `cp` restore, sha256 `a58850e6…3767eb` matches, `git status` clean, 50/50 green |
| Delete the `if (residualTotal > 0) throw` block | the real `user.ts` | **exactly 2 tests fail** — `(e)` and `(f)` | same, verified green |

Two things worth recording from the first proof:

- **The other 49 tests — every behavioural one — stayed GREEN under the inverted order.** That
  independently corroborates the stated reason a *source* gate was necessary: `seam.clearStorage`
  is mocked, a mock sets no cookies, and the order is behaviourally invisible. The gate is not
  belt-and-braces; it is the only thing that can see this property.
- **The gate is not vacuous through the comment at `user.ts:198`,** which also contains the string
  `'clearEpicStorage'`. `stripSourceComments` removes it — otherwise my mutation would not have
  been caught. This project's recorded `stripSourceComments` scar does not apply here.

#### 6. Credential hygiene of the withheld evidence

`git log --all --name-only` across every ref: **zero `.binarycookies` files, ever.** The committed
parse artefacts print `vlen=<length>` and never a value; a scan for any 40+ character token across
both committed `.txt` files returns nothing.

**The withholding does not leave the conclusion unverifiable.** I reproduced the decisive parse
from the live jar myself and it matched the committed artefact exactly. The README documents the
reproduction recipe, names the jar-identification rule (*which mtime moved*) and flags the UTC/local
conversion — the three things a future pass needs. This is the right call for a public repo.

#### 7. Unit tests are not being passed off as the evidence

They are not. `npx jest src/backend/storeManagers/legendary/__tests__/` → **50/50 green, 3 suites**
— but the closure evidence is the live jar decode and `gamelib.log`, both of which I took
independently, and both the commit message and `D-35-29-02`'s resolution block say so explicitly.
The bar D-35-29-01 set ("a passing unit test must NOT be accepted as evidence") is honoured.

---

### THE NEW FINDING — the post-clear verification sweep is FAIL-OPEN

**Never recorded anywhere in this phase. Measured, not inferred.**

`readHostCensus` (`user.ts:342`) catches a rejecting `seam.cookiesForDomain` and returns
`{ jarTotal: null, matched: 0, verdict: UNSUPPORTED_OR_ERROR }`. The new residual loop consumes
**only `verify.matched`** and **ignores `verify.verdict`**.

I wrote, ran and deleted a throwaway probe in which all five verification reads reject:

```
PROBE threw=false
PROBE verification line: "Legendary logout: post-clear verification — 0 Epic-owned cookie(s)
  remain across 5 domain(s) — epicgames.com=0, fortnite.com=0, unrealengine.com=0,
  twinmotion.com=0, metahuman.com=0"
```

`logout()` **resolves**, and the product emits an **affirmative certification of a fact no read
ever measured**. That is the literal negation of clause 2 — *"the app does not report success
unless a post-clear read confirms it"* — and it is the same defect class the requirement's own
rationale names: *"the app reports clearing cookies it does not clear."*

**This is not an exotic branch.**

- All-reads-reject was **100% of production behaviour** on every Epic logout from plan 35-23's
  landing until commit `9106ccbea`. That is precisely what D-35-29-01 recorded. The branch was
  live for a day.
- It is also the **most likely off-macOS behaviour**. The Rust default-data-store fallback is
  `#[cfg(target_os = "macos")]`, so Windows and Linux need a real window — and the new code points
  that window at the deliberately non-resolving `https://gamelib.invalid/`. Off-macOS cookie-clear
  behaviour is unverified until Phase 38.

**The one-line closure already exists in the file.** `domainVerdict`, `everProvedLive` and
`classifyCookieRead` sit fifteen lines above and do exactly the right thing for the before/after
pair: an untrustworthy read classifies `UNSUPPORTED_OR_ERROR` and drives `brokenHosts`. The
residual sweep needs the same treatment. This is the recorded
`fixing-a-fail-open-gate-can-create-its-sibling` shape, one level over — a fail-open fixed at the
per-host layer and re-created at the verification layer.

---

### Qualifications — read these before treating clause 1 as fully discharged

1. **DEV-ONLY. The fix has never run on a packaged build.** `com.gamelib.shell.binarycookies` has
   not moved since `18:17:28`, which *predates* the fix commit at `21:11:09`. Its 7 Epic-owned live
   records are **not** scored as a defect — five were re-created by the defect at 18:15:16–17, and
   `EPIC_SESSION_AP` at 18:17:18 belongs to a deliberate re-login. But there is **no packaged-build
   evidence of a clean Epic logout anywhere**, in a phase whose own `35-CONTEXT.md` states
   *"packaged, not dev"* three separate times (D-15, D-16, D-19).
2. **Taken on the debugger's word, could not re-measure.** The pre-fix log lines at 19:27 and 18:15
   (`gamelib.log` has rotated; only the 21:03 run survives on disk); the 18:16:34 re-login line
   that explains `EPIC_SESSION_AP`; and the exclusivity argument that the logout's own windows were
   the *sole* writer. All three are strongly corroborated by evidence I *did* take — the
   created-second alignment, the 30-minute Cloudflare TTL, and the committed BEFORE parse — but
   they are transcription, not my measurement.
3. **I did not observe the 21:03 gesture.** That the operator genuinely logged in and then out is
   inferred from `before(matched=8)` against a pre-fix baseline of 3. Hard to fake; not watched.
4. **Non-macOS is unverified until Phase 38**, and is where the fail-open is most likely to be live.

---

### Does `D-35-19-15` re-open?

**No — but its closure is now UNREPRODUCIBLE and must not be cited as ongoing assurance.**

The narrow technical question that item asked was whether the widened five-domain clear actually
removes a cookie on a **non-primary** Epic apex. That was answered affirmatively by a real removal
of real cookies in the real shared jar: `before(matched=1) → cleared 1 → after(matched=0)` on all
four siblings. The cookies' **provenance does not change whether the code path works**, and it
demonstrably worked.

What has changed is that **the fixture is gone, and the fix is why.** I confirmed from
`gamelib.log` myself that all four siblings now read `before(total=51, matched=0)` — because the
only thing that had ever populated them during a logout was the window the fix removed. *The
observability that made the widening provable was the defect.*

Record it as **closed on a one-time observation, with a standing note**. Do not re-open it as a
blocker; do not cite it as evidence of a currently-exercised capability. **It does not bear on
REQ-35-07's score** — REQ-35-07's own two clauses never required the sibling-domain proof.

---

### Regressions in the other 16 — none

The entire code diff since the third pass (`git diff --stat 6e21558cf..HEAD`) is confined to
`legendary/user.ts` and its three test files. Everything else is `.planning/`.

| check | command | result |
|---|---|---|
| Typecheck | `pnpm codecheck` | **exit 0** |
| Backend suite | `npx jest src/backend` | **188 of 189 suites pass**, 4350 tests pass, 2 skipped |
| — the one failure | `decompressPool.test.ts` | **3 failed / 38 passed — UNCHANGED**, pre-existing, Phase 35 attribution already disproved |
| Absence + i18n + backend meta gates | `npx jest meta/__tests__/isTauriRemoved.test.ts meta/__tests__/genI18nGateScope.test.ts src/backend/__tests__/` | **exit 0** — 30 suites, 635 passed, 1 skipped |
| `isTauri` residue | `grep -rn isTauri src/` | **0 matches** |
| Legendary logout suites | `npx jest src/backend/storeManagers/legendary/__tests__/` | **50/50 green**, and RED-proven twice |

---

### Routed items — reconfirmed out of scope

| item | re-measured by me | destination |
|---|---|---|
| `pnpm lint` | **exit 1, 4171 problems, NINE errors** — exit code captured from the command, not a pipe. Same eight files the third pass named. `b5b3464bd` added **no new error** (4155 → 4171 is entirely warnings, from new comments). | Phase 39 — **must inherit NINE, not the stale 6**; the `deferred:` block now carries that dated correction |
| Windows/Linux smoke-launch | unchanged | Phase 38 (`38-W04`/`38-W05`). **New note for Phase 38:** the off-macOS cookie branch now opens its handle window at `https://gamelib.invalid/` with no default-data-store fallback available, so both the clear and the census depend on that window carrying a usable cookie store. Untested, and the likeliest home of the fail-open. |
| 3 `decompressPool` native-LZMA failures | **exit 1, 3 failed / 38 passed / 41 total** on the real path `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` | unowned todo, correctly excluded |

---

### What has to happen for Phase 35 to close

The Electron cutover itself is **done**, and after this pass the security substance of REQ-35-07
is done too — the app really does clear Epic's persisted state, and I proved it independently.
What is left is one honesty defect in the reporting mechanism, and one build-identity gap.

1. **Make the residual sweep fail-closed.** Treat `verify.jarTotal === null`, or any verdict that
   is not `SUPPORTED_*`, as fatal — or at absolute minimum stop printing an affirmative
   `0 … remain` for a host that was never read. The machinery is already in the same function.
   *A passing unit test must not be accepted as the evidence.*
2. **Run one live Epic logout on a PACKAGED build** and decode
   `~/Library/HTTPStorages/com.gamelib.shell.binarycookies` by its page/offset index. Confirm zero
   Epic-owned live records. This is the only gesture that needs the operator, and it is cheap.

**Or accept the deviation.** If the operator judges the residual fail-open acceptable for this
phase, the sanctioned vehicle is an explicit override, not a score move:

```yaml
overrides:
  - must_have: "REQ-35-07 — logging out clears the embedded browser's persisted state and the app does not report success unless a post-clear read confirms it"
    reason: "Clause 1 is live-proven and independently reproduced. Clause 2's mechanism is correct, correctly positioned and fatal; the residual fail-open on a rejecting census read is accepted for Phase 35 and routed to <phase>. Live proof is dev-build only; the packaged re-run is accepted as deferred."
    accepted_by: "<name>"
    accepted_at: "<ISO timestamp>"
```

**Phase 35's ROADMAP checkbox remains unchecked. Closure is the user's call — but the decision in
front of the user is now a materially smaller one than the third pass left, and the option-1
argument the third pass named ("establish why the clear reports removal of cookies the jar still
holds") is DEAD: it does not, and `wry-cookie-delete-lies-about-deleting` is not the cause here.**

---

_Independently readjudicated: 2026-08-31 21:45_
_Verifier: Claude (gsd-verifier) — fourth pass, independent of the gap-closure cycle, of quick task `260831-q93`, and of the `gsd-debug` session `epic-cookie-clear-read-divergence`_

---

## FIFTH ADJUDICATION — 2026-08-31 22:36 NZST

**Verdict: REQ-35-07 PASSES on both clauses. Score 16/17 → 17/17. Status `human_needed`, not `passed`, on one precise gate this pass established for the first time.**

Spawned because every previous upward move was made by the agent that did the work, and because the last two passes each found a defect one level inside the one before. Starting stance: assume the goal was missed. It was not — but two new findings came out of the attempt, one of which invalidates the method by which tonight's build identity was checked.

### What I measured myself

| # | Question | Method | Result |
|---|----------|--------|--------|
| 1 | Do Epic cookies survive the packaged logout? | Index-walking decode of the live jar written for this pass, plus a **set difference** against the operator's BEFORE artifact | **No.** 30 → 23 records; removed exactly 7, all 7 Epic; added 0; all 23 non-Epic preserved. Zero Epic-owned live records remain. |
| 2 | Is the operator's AFTER artifact genuine? | sha256 of my own copy of the live jar vs the artifact | **Identical** (`cabcdd58…41a8d87`). Not a transcription. |
| 3 | Could an *unknown* survivor hide, as `EPIC_SESSION_AP` did in the third pass? | Name-agnostic raw byte scan | **No.** `EPIC`, `__cf_bm`, `SESSION_AP`, `epicSID`, `_tald`, `EPIC_DEVICE`, `EPIC_LOGIN_ID`, `fortnite`, `unrealengine`, `twinmotion`, `metahuman` all = 0. `epicgames` = 1; I dumped its byte context rather than assuming — it is a `bplist00 … StoragePartition … https://epicgames.com` value on the `api.hcaptcha.com` cookie. Correctly **retained** (clearing it is the REQ-34.4.1-06 harm). |
| 4 | Is the wipe-step reorder live-exercised? | Direct read of `gamelib.log` | **Yes.** `cleared storage` at 22:23:33 precedes all five cookie lines. |
| 5 | Is the new fail-closed gate vacuous? | **Four** mutations against the real `user.ts`, `cp` backup, sha256-verified restore (`f9b3b88a…142676` before and after each; `git status` clean) | **Not vacuous, and discriminating.** See table below. |
| 6 | Are the mock fixtures now coherent? | Audited all three `makeMockSeam` helpers **and all 18 call sites** in the census file | **Yes.** See below. |
| 7 | Did the fixed code actually run? | `grep -a` of the artifact that **actually ran**, cross-checked against `git grep` at the parent commit | **Yes** — but not the artifact the operator checked. See F-5-01. |
| 8 | Any regression in the other 16? | `git diff --stat`, `tsc --noEmit`, `npx jest src/backend`, `pnpm lint`, `decompressPool` | **None.** |

### RED-proof of the new gate — four mutations, run by me

Baseline: **53/53 PASS, exit 0.**

| Mutation | Change | Tests failed | Reading |
|----------|--------|--------------|---------|
| **A** | Revert the residual loop to summing `verify.matched` alone — the exact pre-fix shape | **3** — (e2), (e3), (e4) | Matches the commit's claim. The gate catches the defect it was written for. |
| **B** | Keep the guard and the warning, delete the fatal `throw` | **3** — same three | Matches the commit's second claimed mutation. |
| **C** | *(not claimed by the executor)* Trust `UNDECIDABLE`, reject only `UNSUPPORTED_OR_ERROR` | **1** — (e4) alone | **The important one.** Proves the three tests are three distinct pins, not one assertion in three costumes. |
| **D** | *(not claimed by the executor)* `unconfirmedHosts.length >= EPIC_COOKIE_HOSTS.length` — fail only when **all five** hosts are unreadable | **0 — 53/53 PASS, exit 0** | **F-5-02.** A hole in the gate at the most likely field shape. |

### The two new findings

**F-5-01 — `tauri:dev:packaged` structurally cannot exercise the SEA sidecar, and the build-identity check interrogated an inert artifact.**

`ps` on the live tree: PID 2606 = `/Applications/GameLib.app/Contents/MacOS/gamelib-shell` (started 22:22:04), whose child PID 2616 is

```
~/.nvm/versions/node/v26.2.0/bin/node /Users/graysonmitchell/Projects/GameLib/src-tauri/../build/main/sidecar.js
```

— **not** the bundle's own `Contents/MacOS/gamelib-sidecar`. Confirmed in Rust source rather than inferred: `spawn_sidecar` dispatches on `use_dev_sidecar()`, which is `cfg!(debug_assertions)` (`main.rs:6747`); `resolve_sidecar_entry()` bakes `CARGO_MANIFEST_DIR/../build/main/sidecar.js` (`main.rs:6642`); and `main.rs:6694`'s own doc comment states it outright — *"Debug builds only — a release build uses the bundled `gamelib-sidecar` externalBin and never runs `node`."* `pnpm tauri:dev:packaged` is `tauri build --debug`.

So the check that grepped `/Applications/GameLib.app/Contents/MacOS/gamelib-sidecar` for a marker string interrogated a binary this build configuration guarantees is never loaded, and the `pnpm build:sidecar-sea` rebuild it prompted was inert. **The conclusion still holds** — I established it against the correct file: `build/main/sidecar.js` (mtime 22:16:08, i.e. after the 22:04:45 commit) contains `COULD NOT CONFIRM`, `unconfirmed(` and `post-clear verification could not read the cookie jar`, all three of which `git grep` confirms are **absent** at the parent commit `b996d1772`. The code that ran was the fixed code. It was simply proven by a different file than the one that was checked.

This is the recorded `gate-gesture-can-be-blind-to-its-own-defect` shape applied to a build-identity check: the gesture would have passed on a stale SEA and would have failed to notice the SEA was irrelevant.

**F-5-02 — the new gate does not pin per-host granularity.**

Mutation D passes 53/53. Under it, a run with four clean reads and one rejecting read resolves successfully *and* emits `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)` with four numeric zeroes and one `unconfirmed(...)` — an affirmative clean bill covering five domains of which four were read. That is clause 2's defect at partial granularity.

**The shipped code is correct** (`if (unconfirmedHosts.length > 0)`, read and confirmed at `user.ts:564`), so this is a gate-coverage hole and a WARNING, not a blocker. But all three new tests set *all five* reads to the same failing shape, so the heterogeneous case — the shape a real field failure takes — is pinned by nothing. Given this repo's `fixing-a-fail-open-gate-can-create-its-sibling` and `revision-scoped-out-file-breaks-its-gate` history, a later refactor can reintroduce exactly this against a green suite.

*Fix: one ~10-line test `(e5)` — four hosts returning a live jar, the fifth rejecting; assert the logout rejects and the log does **not** contain `Epic-owned cookie(s) remain`. It should land before Phase 38 touches this path.*

### The mock blind spot — confirmed closed

`epicLogoutDomains.test.ts:186` and `user.test.ts:146` now default `cookiesForDomain` to `{ total: 9, matched: [] }` — a live jar holding no Epic cookies, which is what production looks like after a clean sweep — replacing the bare `jest.fn()` that resolved `undefined` and made every census read `UNSUPPORTED_OR_ERROR`. Exactly **five** call sites keep the unreadable fixture, each with an in-place comment stating that the legacy `total === 0` path is that test's subject; all five assert `rejects.toThrow(/removed nothing across all 5 Epic-owned domains/)` and throw at the earlier guard, so none reaches the residual sweep. Internally coherent.

`epicCookieCensus.test.ts:208` still defaults to `cookieRead(0)` (which classifies `UNDECIDABLE`) — but I audited every call site rather than trusting the commit message: **all 18** `makeMockSeam({…})` invocations in that file set `cookiesForDomain` explicitly, so the stale default is unreachable. Recorded as a latent trap for a future test author, not a defect.

### The honest weakness, adjudicated

**The fail-closed path never fired.** Zero `unconfirmed(`, zero `COULD NOT CONFIRM`, zero `UNSUPPORTED_OR_ERROR`, zero `UNDECIDABLE`, zero `census read failed`. Every host read cleanly.

**Decision: clause 2 passes on a correct mechanism that had nothing to catch.** On macOS the census resolves through `default_data_store_cookies_for_domain`, which is unconditionally available; there is no user gesture and no operator-drivable state that makes a read reject. Producing a live negative would require either (i) shipping a test-only env kill switch into the product — new attack surface inside the very path that establishes the logout security property — or (ii) building a throwaway mutant binary whose Rust arm returns `Err`, which measures the mutant, not the shipped artifact. **Neither is achievable without shipping test-only code into the product, and neither is a legitimate closure gate.** A negative that cannot be produced without changing the product is exactly what a RED-proven unit gate is for, and one exists — I proved it discriminating with mutation C.

The one genuinely reachable live negative is **off macOS**, and it is already routed to Phase 38. See below.

### D-35-19-15 — confirmed, and strengthened

The fourth pass's ruling **stands**, now reproduced on a second build and a second jar: I read directly from `gamelib.log` that all four sibling apexes report `before(total=23, matched=0)` and `cleared 0`. The fixture is gone, for the stated reason — the window that seeded those domains during a logout is what `b5b3464bd` removed. Unreproducible by any user gesture on this build. Do not cite the 19:27 observation as ongoing assurance.

**New evidence this pass adds, which the fourth pass did not have:** the domain-**suffix** half of the widening *is* live-exercised on the packaged build. My BEFORE decode holds Epic records on three distinct domain strings — `.epicgames.com`, `.www.epicgames.com`, `.ecosec.on.epicgames.com` — and the AFTER decode holds none of them, while only the `epicgames.com` host step reported a non-zero clear. One host entry demonstrably swept three stored domains through `cookie_domain_matches`'s leading-dot-stripping suffix comparison. What remains unexercised is narrower than "the widening": specifically the four sibling **apexes**.

### An arithmetic note — recorded, not scored

The product logged `before(total=29, matched=6)` and `cleared 6`; my decode of the BEFORE snapshot (taken 22:08, fifteen minutes earlier) holds 30 records with 7 Epic. The gap is one record and the direction is **conservative** — the product under-counted what it removed and never over-claimed. Most likely a WebKit prune of one of the two long-expired `__cf_bm` records (both expired 06:45Z = 18:45 local, four hours before the gesture). Deliberately not scored: the end state is set-exactly clean either way, and a product reporting *fewer* removals than it made cannot produce the harm REQ-35-07 exists to prevent.

### Phase 38 — the risk changed shape

For Phase 38's inheritance, not Phase 35's score. Before `bea07cd17`, an off-macOS logout whose census reads all rejected would have **resolved** and printed a false clean bill. After it, it will **throw**, and 35-22's renderer guard will raise a user-visible *"Sign-out incomplete"* dialog on **every** Epic logout. The fix converts a silent false-success into a loud guaranteed failure — the right direction for a security property, the wrong outcome for a Windows or Linux user. The deciding factor (whether a window at the non-resolving `https://gamelib.invalid/` yields a usable cookie store) is untested on both platforms. `38-W04`/`38-W05` should treat this as a first-class item.

### What I took on trust

- **I did not observe the 22:23 gesture.** That the operator logged in and out is inferred from the `oauthLoginCapture status=captured` and `legendary auth --code` lines at 22:23:24, from `before(matched=6)` against a jar my own decode shows held 7 Epic records, and from those records' 06:15–06:17Z creation stamps. Hard to fake; not watched.
- **Pre-22:22 log history.** `gamelib.log` holds only this session (66 lines; 34 pre-gesture; zero prior `post-clear verification` entries — verified). Everything about the 18:15, 19:27 and 21:03 runs is inherited from earlier passes.
- **The wipe-step-reorder RED-proof.** I did not re-run the fourth pass's `wipeSteps` mutation; I verified the ordering live in `gamelib.log` instead, which is stronger evidence for that particular claim.

### Regression check

Entire code diff since the fourth pass (`git diff --stat 6e21558cf..HEAD -- src/ src-tauri/ meta/`) is `legendary/user.ts` plus its three test files — zero Rust, zero meta. Re-measured with exit codes captured from the command, never from a pipe:

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | exit 0 |
| `npx jest src/backend` | 188/189 suites; 4353 passed / 3 failed / 2 skipped. The one failing suite is the pre-existing `decompressPool.test.ts` at exactly 3 failed / 38 passed — **unchanged**. The +3 delta against the fourth pass's 4350 is exactly (e2)/(e3)/(e4). |
| `pnpm lint` | exit 1, 4173 problems, **9 errors** — corrected count confirmed a third consecutive pass. 4171 → 4173 entirely in warnings; `bea07cd17` introduced no new error. → Phase 39. |
| `decompressPool.test.ts` (real path) | exit 1, 3 failed / 38 passed / 41. Todo present. → unowned, out of scope. |

**No regressions.**

### The remaining gate

One gesture, recorded in full as `human_verification` item 1: **a RELEASE-build Epic login → logout.**

35-LIVE-GATE.md's criterion 21 *is* the Epic cookie-clear criterion, and its header specifies a release build (`build:sidecar-sea && tauri build`, DMG-mounted). It was last measured 2026-08-31 before 21:11, and two behaviour-changing product commits have landed since — `b5b3464bd` (21:11) and `bea07cd17` (22:04), the latter converting an untrustworthy read from silently-clean into fatal. The gate's own doctrine (`R-34.5-G1-PKG`) requires the artifact to postdate the code; it no longer does. Tonight's run covers the current code, and I verified its substance set-exactly — but on the debug-packaged artifact, which per F-5-01 never loads the SEA. Every line of product TypeScript in this path has therefore never executed under the SEA runtime, in a repo with a documented history of bundle-only defects invisible to jest.

This is not a doubt about the logic, which is verified. It is the build-class confirmation the phase's own rules require, and it closes criterion 21's freshness contract at the same time.

---

_Independently readjudicated: 2026-08-31 22:36 NZST_
_Verifier: Claude (gsd-verifier) — fifth pass, independent of the gap-closure cycle, of quick task `260831-q93`, of the `gsd-debug` session `epic-cookie-clear-read-divergence`, of the `bea07cd17` fix, and of the orchestrator that ran the 22:23 gate_

---

## SIXTH ADJUDICATION — 2026-08-31 23:12 NZST (CLOSURE)

**Verdict: both fifth-pass closure conditions SATISFIED and re-measured by me. Score stays 17/17. The phase goal IS achieved. Phase 35 still cannot close — on RECORDS, not substance: three propagations are unclosed, the first of them inside the phase's own `blocking: true` gate document. None needs a gesture or a code change.**

Spawned as a closure adjudication because five consecutive passes each found something the last missed, and because the party claiming both conditions were met was the orchestrator that performed them. Starting stance: assume the goal was missed. On substance it was not — and the two honesty flags raised against the run turn out to be answerable by measurement rather than by argument. But the substance is not in the documents that decide closure.

### 1. My re-measured mutation matrix versus the claimed one

Baseline `npx jest src/backend/storeManagers/legendary/__tests__/` = **54/54, exit 0**. Protocol per mutation: `cp` backup, apply with an asserted unique anchor, run redirected with `$?` captured from the **bare** command, restore by `cp`, re-verify sha256. `user.ts` returned to `f9b3b88a…6142676` after **every** one, and `git diff --stat -- src/` is empty.

| Mutation | Claimed | **My measurement** | Failing set | Match |
|---|---|---|---|---|
| **D** `> 0` → `=== EPIC_COOKIE_HOSTS.length` | 1 failed / 53 passed, `(e5)` only | exit 1, **1 failed / 53 passed** | `(e5)` only | **yes** |
| **A** trustworthy gate + unconfirmed branch deleted | 4 failed / 50 passed | exit 1, **4 failed / 50 passed** | `(e2)(e3)(e4)(e5)` | **yes** |
| **B** `throw` deleted, `logWarning` kept | 4 failed / 50 passed | exit 1, **4 failed / 50 passed** | `(e2)(e3)(e4)(e5)` — set identical to A | **yes** |
| **C** `trustworthy` widened to accept `UNDECIDABLE` | 1 failed / 53 passed, `(e4)` only | exit 1, **1 failed / 53 passed** | `(e4)` only | **yes** |
| **E** *(mine — never run before)* `> 0` → `> 1`, fail only when **2+** hosts unreadable | — | exit 1, **1 failed / 53 passed** | **`(e5)` alone** | new |
| **F** *(mine — never run before)* affirmative `logInfo` moved **before** the unconfirmed check, `throw` retained | — | exit 1, **3 failed / 51 passed** | `(e3)(e4)(e5)` | new |

Not one claimed number is off by one. D's failure text is `Received promise resolved instead of rejected. Resolved to value: undefined` — under D the mutated product certifies the jar and `logout()` **resolves**, which is F-5-02 exactly.

**E is the probe that decides soundness rather than redness.** D only proves `(e5)` catches the 1-vs-5 extreme; a gate could do that and still miss 1-vs-2. E narrows the predicate to `> 1` and `(e5)` dies **alone** — so `(e5)` is an *exact* pin on `> 0`, the tightest boundary the predicate has. **F** covers the other half of the defect family: a logout that correctly rejects while still writing `0 Epic-owned cookie(s) remain` into a log this repo greps to score live gates. `(e5)`'s `not.toContain` catches that at *partial* granularity, which `(e3)` structurally could not.

### 2. Is `(e5)` sound, or merely red on D?

Sound. Every specific checked against the file, not the commit message.

- **Middle-host targeting is real.** `unrealengine.com` is index 2 of 5 in both `EPIC_COOKIE_HOSTS` (`user.ts:97-103`) and the test's independent copy. The clear loop calls `readHostCensus` **twice** per host (`user.ts:407` before, `:409` after), so calls 1–10 are the clear loop and 11–15 the verification sweep in host order; call 13 is the third sweep read. No first/last short-circuit can satisfy it.
- **The sweep demonstrably ran to completion.** `toHaveBeenCalledTimes(3*N)` = 15. Had control thrown at the earlier `brokenHosts` or `total === 0` guards, only 10 reads would exist.
- **The direct proof holds.** `readHostCensus`'s catch (`user.ts:356-367`) emits `${host} cookie census read failed` **exactly once per rejecting read**, so `logged.match(/cookie census read failed/g)` having length exactly 1 genuinely proves no clear-loop read rejected. This is the assertion that catches "passes for the wrong reason".
- **Not tautological.** `rejectedRead.host` is captured from the mock's *own* `hostArg`; only `index` is self-referential, and that is the harmless half.
- **Fixture is coherent** — before `(9,3)` → clear 3 → after/verify `(6,0)`. 9−3=6 balances; the first read sets `everProvedLive`; the before side is `SUPPORTED_NONEMPTY` with a **nonzero** delta so `brokenHosts` does not fire; the summed total is 15 so the `total === 0` guard does not fire. This is the coherence whose absence hid the defect family twice.
- **The discriminators do distinguish partial from total.** `(e3)`'s ``not.toContain(`${host}=0,`)`` was correctly **not** copied — here four hosts legitimately record a zero. The four used instead each fail on an all-five fixture: the em-dash immediately after a *single* host name in `/could not read the cookie jar for unrealengine\.com —/` (the all-five message continues with a comma); `1 of 5 domain(s)` (all-five prints `5 of 5`); `unrealengine.com=unconfirmed`; and a **positive** `${host}=0` for each of the other four (in the all-five case none appears).

*Residual hole, INFO not a gap:* `(e5)` pins a partial failure in the **final verification sweep**. A partial failure in the **clear loop** is a different family and is pinned by nothing here. F-5-02 did not raise it and the fifth pass did not scope it; recorded for whoever next touches this loop.

### 3. The release live gate — what I verified myself

**The build-identity chain is closed at the running process, which no previous pass reached.** F-5-01's lesson was that an identity check can interrogate an artifact the build guarantees is never loaded. I closed it at the other end:

```
PID 9781  /Applications/GameLib.app/Contents/MacOS/gamelib-shell     (22:52:34)
PID 9787  /Applications/GameLib.app/Contents/MacOS/gamelib-sidecar   (22:52:37, ppid 9781)
```

The child is the **bundled SEA**, not `node …/build/main/sidecar.js`. That is the release spawn path executing, observed live — the exact check the fourth pass's reasoning failed and the fifth pass could only predict. Corroborated structurally: `use_dev_sidecar()` is `cfg!(debug_assertions)` alone (`main.rs:6746-6748`).

Then the hashes, then the code:

| Link | Measurement |
|---|---|
| installed `gamelib-shell` | sha256 `be820645…7fe961c` — **byte-identical** to `src-tauri/target/release/gamelib-shell` (22:49:54) |
| installed `gamelib-sidecar` | sha256 `6d63ed17…d92c611` — **byte-identical** to `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin` (22:48) |
| fix markers in the installed SEA | `COULD NOT CONFIRM` ×2, `unconfirmed(` ×2, `could not read the cookie jar for` ×2 — all three `git grep`-confirmed **absent** at parent `b996d1772` |
| forbidden stale source | `bundle/macos/` holds **only** `GameLib.app.tar.gz` dated Aug 23 11:50 and **no `.app` at all** — the trap `35-LIVE-GATE.md:42` warns about is excluded mechanically |
| bundle identity | `com.gamelib.shell`, version `0.7.0`; DMG `GameLib_0.7.0_aarch64.dmg` 530,984,320 B at 22:49:54 |

**The log, read by me.** 69 lines, first stamped **22:52:37** — it is this process's own log and holds nothing else, so no earlier run can be confused with it. Line 61 `cleared storage — localStorage=3, …` **precedes** all five `cleared N <host> cookie(s)` lines (62–67): `b5b3464bd`'s wipe-step reorder is live-exercised **under the SEA** for the first time. Line 62 `epicgames.com … before(total=31, matched=8, verdict=SUPPORTED_NONEMPTY) after(total=23, matched=0, …)`. Line 68 `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)` with five **numeric** zeroes. Counts of `unconfirmed(`, `COULD NOT CONFIRM`, `census read failed`, `UNSUPPORTED_OR_ERROR`, `UNDECIDABLE`, `[ERROR]`, `Sign-out incomplete`, `build/main/sidecar.js`: **zero, each**.

**The jar, decoded with my own parser** (page/offset index walk written for this pass; never `strings`, never the orchestrator's `bc.js`):

- **The artifacts are genuine.** Live jar sha256 `6d5b47dd…bb2c06b` is identical to `AFTER-release.binarycookies`. And `BEFORE-release` is byte-identical to `AFTER-packaged` (`cabcdd58…41a8d87`) — which independently proves the two runs **chain**: the 22:23 packaged run's end state *is* the 22:54 release run's start state. Nobody had checked that.
- **BEFORE-release = 23 records, all live, zero Epic. AFTER-release = 23.** A record-level set difference over (domain, name, path, value-length, expiry, creation) is **empty in both directions** — zero added, zero removed, zero mutated. The jar returned *exactly* to its pre-login state: the 8 Epic records left no trace and cost no collateral, including the live Humble `_simpleauth_sess` credential sitting untouched beside them.
- **Arithmetic closes.** 23 + 8 = 31 = the product's `before(total=31)`; 31 − 8 = 23 = the decoded AFTER.
- **Name-agnostic byte scan** — `EPIC`, `Epic`, `__cf_bm`, `SESSION_AP`, `epicSID`, `_tald`, `EPIC_DEVICE`, `EPIC_LOGIN_ID`, `fortnite`, `unrealengine`, `twinmotion`, `metahuman`, `egs`: **all zero** in both snapshots. `epicgames` occurs **exactly once**; I dumped its byte context rather than assuming — `api.hcaptcha.com hmt_id` → `bplist00 … StoragePartition … https://epicgames.com`, a partition key correctly **retained** (clearing it is the REQ-34.4.1-06 harm).

**A weakness of this run that the packaged run did not have, recorded because it cuts against what I am approving.** The BEFORE-release snapshot was taken at 22:49, *before* the 22:53 login, so it holds zero Epic records; the 8 Epic cookies existed only between login and logout and were never captured. Unlike the 22:23 run — whose BEFORE artifact I re-decoded and which genuinely holds 7 Epic records — this run cannot produce a "removed exactly these N Epic records" set difference. Its clause-1 proof is instead the product's own `before(total=31, matched=8)`, the arithmetic, and an AFTER record-for-record identical to a BEFORE known to be Epic-free. Sound and sufficient, but a *different and slightly weaker shape*. Cite it accurately.

### 4. The two honesty flags — neither is disqualifying, and both are answerable by measurement

**Flag 1, the fail-closed path never fired.** Not disqualifying, and I verified the *reason* in Rust source rather than accepting it. The Epic census arm (`main.rs:6471-6474`) is `#[cfg(target_os = "macos")]` and fires whenever `existing_window.is_none() && epic_cookie_domain_matches(domain)` — and Epic's login window is the pristine `WindowBuilder` window `get_webview_window(label)` can never resolve, so that condition is **always** true and control **always** reaches `default_data_store_cookies_for_domain`, which reads `WKWebsiteDataStore::defaultDataStore()`, unconditionally available. No operator-drivable state makes it reject. Producing a live negative would require shipping fault injection into the exact path that establishes the logout security property — not a legitimate closure gate, and a RED-proven unit gate is the correct substitute. One exists, and I proved it discriminating *and boundary-exact* with six mutations.

But the honest statement is narrower than "unprovable": the branch **is** reachable off macOS, so its live proof is **deferred to Phase 38**, not impossible. That deferral is only legitimate if Phase 38 can find it — and gap **G-6-02** is precisely the finding that it cannot.

**Flag 2, the DMG predates `(e5)`.** Not disqualifying, and I converted it from a substance *argument* into a *measurement*. "Test-only therefore harmless" is exactly the reasoning that produced F-5-01, so I checked the artifact instead: `sentinel-cookie-`, `SOME-vs-ALL`, `EPIC_HOSTS_UNDER_TEST`, `synthetic-not-a-real-token`, `epicCookieCensus`, `makeMockSeam` — **zero occurrences in both installed binaries**, and the literal string `__tests__` occurs **zero** times in the SEA. No test file is bundled; `b737b2f42` provably contributes no shipping bytes. `R-34.5-G1-PKG` is satisfied on its **purpose** (the artifact contains the code under test) while failing on raw mtime ordering. The rule is not mechanical *here* because the exception is mechanically establishable — and I established it. **Do not generalise this exception**: it holds only because the intervening commit provably contributes no bytes.

### 5. D-35-19-15 on the release run

**Confirmed for a third consecutive pass; the release run neither strengthens nor weakens it.** All four sibling apexes report `before(total=23, matched=0)` and `cleared 0` — the apex half is unexercised, exactly as the fourth and fifth passes recorded.

I did **re-derive** the suffix-half evidence rather than inherit it. My decode of `BEFORE-packaged` holds 30 records (28 live + 2 expired) with 7 Epic-owned across **three** distinct stored domain strings — `.epicgames.com` (5 live), `.www.epicgames.com` (1 expired `__cf_bm`), `.ecosec.on.epicgames.com` (1 expired `__cf_bm`) — and AFTER holds none of them, while only the `epicgames.com` host step reported a non-zero clear. One host entry swept three stored domains through `cookie_domain_matches`'s suffix comparison. The **suffix** half is live-proven; the four sibling **apexes** are not, and cannot be without a seeding vehicle.

*And the fifth pass's unresolved arithmetic note now fully resolves.* Both `__cf_bm` records were **expired** (exp 2026-08-31T06:45Z, four hours before the gesture), so the jar held 30 records of which 28 were live. 30 − 1 pruned = 29 and 7 − 1 = 6 fits exactly if WebKit pruned one expired `__cf_bm` between the 22:08 snapshot and the 22:23 read. Direction is conservative — the product under-reported what it removed and never over-claimed.

### 6. THE THREE GAPS — records, not substance, and the only thing standing between this phase and closure

**G-6-01 (BLOCKER) — the phase's own `blocking: true` gate document has not been told.** `35-LIVE-GATE.md` mtime is **18:21:02** and grep counts inside it for `b5b3464bd`, `bea07cd17`, `22:23`, `22:54`, `COULD NOT CONFIRM`, `post-clear verification` and `total=31` are **all zero**. Its criterion-21 record therefore still measures an artifact predating both behaviour-changing product commits — the `R-34.5-G1-PKG` violation the fifth pass named as *the* remaining gate. The gesture that discharges it was performed and I verified every link; what is missing is the **write-back into the normative document**. A `blocking: true` gate whose record is stale cannot certify closure, and this repo has been bitten by the record-vs-substance split repeatedly.

**G-6-02 (BLOCKER) — the Phase 38 inheritance is recorded where Phase 38 will never look.** The fifth pass elevated `bea07cd17`'s off-macOS consequence for `38-W04`/`38-W05` — into `35-VERIFICATION.md` only. `38-VERIFICATION.md` (mtime **Aug 30 07:33**, a day and a half before the commit existed) has **zero** occurrences of `bea07cd17`, `Sign-out incomplete`, `fail-closed`, `census`, `gamelib.invalid`, `post-clear`; all six grepped. `38-W04`/`38-W05` as written are pure smoke-launch items — *install it, launch it, a window appears, survives 10 seconds* — so a Windows operator running 38-W04 verbatim passes it without ever touching an Epic logout. `ROADMAP.md:4531` makes `38-VERIFICATION.md` the phase's source of truth and the array `audit-uat` reads, and that file's own `audit_tool_note` says **"this phase's ENTIRE content is that array."** Close Phase 35 now and the risk evaporates. This is the recorded `gap-can-fall-between-two-correct-plans` shape.

**G-6-03 (WARNING) — REQ-35-07 carries a superseded closure premise.** `REQUIREMENTS.md:429` still says the contract *"stays Partial, not Complete, until plan 35-29's criterion-21 live-gate re-run seeds and confirms-present a cookie on a non-primary Epic domain … per D-35-19-15"*, and line 1143 still ends *"Still NOT Complete."* Two passes have already ruled the sibling-apex seeding is D-35-19-15's own addition; I reaffirm it a third time from the requirement's own text, which says *"a post-clear read confirms it"* and nothing about a seeded apex. The seeding is also structurally unreproducible now — `b5b3464bd` removed the only vehicle — so leaving the clause makes REQ-35-07 permanently unsatisfiable. Tick the box without rewriting it and the record asserts a condition never met: the `gate-can-force-a-false-record` shape.

*INFO:* `35-REVIEW.md` frontmatter is `status: issues_resolved` and all four criticals carry in-place `RESOLVED — plan 35-2x` annotations (CR-01/02 → `35-21`, CR-03 → `35-22`, CR-04 → `35-23`), which **discharges** the fifth pass's "what remains is a records pass". But the body headline at line 106 still reads `**Status:** issues_found`, contradicting its own frontmatter. One line.

### 7. A standing project blocker that is now falsified

Two STATE.md quick-task records (`260830-ibr`, `260830-k4m`) assert that *"a local release rebuild is still blocked by `createUpdaterArtifacts: true` with no signing key."* **That is now false.** `src-tauri/tauri.conf.json:48` still carries `createUpdaterArtifacts: true` with the same pubkey and endpoint, `git status src-tauri/` is **clean** so the config was not temporarily mutated for tonight's build, and a full release build nonetheless completed at 22:49:54 producing both the shell binary and the 0.7.0 DMG. `bundle/macos/` was not regenerated (its tarball is still dated Aug 23), so the updater-artifact step evidently no-ops rather than failing the build. Recorded because it removes a blocker cited across several phases, including against gate criteria 13 and 17.

*Related, worth a todo, not a Phase 35 gap:* `package.json` has **no release build script**. The only two Tauri scripts are `tauri:dev` and `tauri:dev:packaged` (`tauri build --debug`); the release chain exists only as prose in `35-LIVE-GATE.md`'s header. Given that a `--debug` bundle structurally never loads the SEA, the easy command is the one that cannot measure the artifact.

### 8. Regressions in the other 16 — none, and structurally impossible

`git diff --stat a9ef3026a..HEAD -- src/ src-tauri/ meta/ .github/ package.json` is **one file**: `epicCookieCensus.test.ts`, +105/−2. Zero product code, zero Rust, zero meta, zero CI. Working tree carries only the uncommitted `35-VERIFICATION.md`.

| Check | Result (exit captured from the bare command) |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npx jest src/backend` | exit 1 — 188/189 suites; **4354 passed / 3 failed / 2 skipped**. The +1 against the fifth pass's 4353 is exactly `(e5)`, fully accounted. The 3 failures are the pre-existing `decompressPool` suite. |
| `meta/__tests__/genI18nGateScope.test.ts` | **exit 0** — 26 passed / 1 skipped / 0 failed. A-17 anti-rot unchanged and non-vacuous. |
| `pnpm lint` | exit 1, 4174 problems, **9 errors** — corrected count confirmed a **fourth** consecutive pass, and I counted `error`-severity lines independently (9) rather than reading the summary alone. 4173 → 4174 is entirely warnings from `(e5)`'s comments. → Phase 39. |
| `decompressPool.test.ts` (real path) | exit 1, 3 failed / 38 passed / 41. Todo present. → unowned, out of scope. |

### 9. Housekeeping — checked, not trusted

`.planning/STATE.md`: 8152 lines, `---` at 1 and 784, 10 `## ` headings — all three match. Commit `68621ed60` changed it by **1 insertion, 0 deletions**, a single row appended to *Quick Tasks Completed* for `260831-vmc`, present and correct. **No new corruption, proven the strong way:** sha256 of lines 1–784 (the whole frontmatter region) is `52007a5f…6c0ccad2` **before and after** — byte-identical, so whatever YAML condition exists there is untouched by definition. The frontmatter still fails to parse; the actual error is **`All collection items must start same column`**, a *different* diagnosis from the long-standing "unescaped quote" hypothesis in the project's notes and possibly worth a separate look. Pre-existing either way.

**Correction to the brief:** `.planning/quick/260831-vmc-epic-census-partial-unconfirmed-gate/` is **not** untracked. It was committed in `68621ed60`; `git ls-files` returns both `260831-vmc-PLAN.md` and `260831-vmc-SUMMARY.md`, and `git status --untracked-files=all` on that directory is empty.

### 10. What I verified myself versus took on trust

**Verified myself:** the entire mutation matrix (6 mutations, 2 previously unrun) with sha256-verified restores and `git diff` empty after each; `(e5)`'s source, targeting arithmetic and every discriminator; `user.ts`'s residual sweep and `readHostCensus`; the Rust spawn-mode selector and the macOS census arm; the **live process tree**; sha256 identity of both installed binaries against tonight's build outputs; `grep -a` of both for fix markers *and* for test-file absence; `git grep` at the parent commit; all 69 lines of `gamelib.log`; an independent decode of all four jar snapshots with my own parser; the raw-byte name-agnostic scan; tsc/jest/lint/i18n/decompressPool with exit codes from bare commands; STATE.md's diff and frontmatter byte-identity; and the **absence** of the Phase 38 record.

**Took on trust:** I did not witness the 22:52–22:54 gesture. That a human logged in to Epic and out again is inferred from `oauthLoginCapture … nav host=www.epicgames.com` → `status=captured` (22:53:14–22:53:52), `legendary auth --code` (22:53:52), `legendary auth -` (22:54:00), and a jar that went 23 → 31 → 23. Consistent and hard to fake; not watched. I also did not re-derive the 18:15, 19:27, 21:03 or 22:23 gesture histories — only the artifacts they left.

### The remaining gate

**Three doc edits. No gesture, no code change, no rebuild.**

1. Write the 22:52–22:54 release run into `35-LIVE-GATE.md` criterion 21. The evidence is fully assembled above and needs only to be moved into the normative document.
2. Add **one** item to `38-VERIFICATION.md`'s `human_verification` array for the off-macOS Epic-logout consequence of `bea07cd17` — *moved* there, not cross-referenced, per that file's own `audit_tool_note`.
3. Rewrite REQ-35-07's superseded "until … seeds and confirms-present a cookie on a non-primary Epic domain" clause in `REQUIREMENTS.md` **before** ticking its box.

Optionally also fix `35-REVIEW.md` line 106.

**A clean close is now legitimately within reach — it was earned on substance tonight. It just has to be written down where the next phase will find it.**

---

_Independently readjudicated: 2026-08-31 23:12 NZST_
_Verifier: Claude (gsd-verifier) — sixth pass, CLOSURE adjudication; independent of the gap-closure cycle, of quick tasks `260831-q93` and `260831-vmc`, of the `bea07cd17` fix, and of the orchestrator that built the release artifact and ran the 22:54 gate_
