# Deferred Items

Out-of-scope discoveries logged here per the executor's scope-boundary rule (only auto-fix
issues directly caused by the current task's changes).

## Plan 15 — `depot.test.ts` full-suite-only flake (2026-07-30)

- **Found during:** Plan 15's `npm run test:ci` verification run.
- **Symptom:** `src/backend/storeManagers/steam/__tests__/depot.test.ts` — test `D-UAT-06: a
  PERSISTENT CM drop during plan-build exhausts the bounded retry and resolves status error
  (classified, actionable message) — never cancelled, never an unhandled throw` failed once in a
  full `npm run test:ci` run (1 failed / 3350 passed / 3351 total).
- **Isolation check performed** (per project memory `flake-baselines-can-be-undiagnosed-bugs` —
  never accept a baseline flake without running the single-file repro first): `npx jest
  src/backend/storeManagers/steam/__tests__/depot.test.ts` in isolation → **106/106 passed**,
  including this exact test.
- **Scope:** `src/backend/storeManagers/steam/depot.ts` and its test file are entirely outside
  this plan's `files_modified` (`src-tauri/src/main.rs`,
  `src/common/types/sidecarTransport.ts`, `src/backend/humble/loginWindowSeam.ts`,
  `src/backend/sidecar/humbleLoginFlowRegistration.ts`,
  `src/backend/sidecar/__tests__/humbleLoginFlows.test.ts`, plus the three out-of-scope
  interface-completeness follow-throughs listed in this plan's SUMMARY). Not fixed here per the
  scope-boundary rule.
- **Disposition:** logged, not fixed. A future session touching `depot.test.ts` or its
  suite-ordering/timing assumptions should re-run this repro before assuming it is unrelated.

## Plan 18 — `seam-parity-sweep.py` category/term tables are stale relative to plans 12/13/15/16 (2026-07-30)

- **Found during:** Plan 18's Task 4 (S-09 closure), regenerating `34.4.1-SEAM-PARITY-SWEEP.md` for
  the first time since Plan 10 wrote the script (the addendum's own instruction — "fix the script,
  never hand-edit"). Getting the regeneration to complete at all required three BLOCKING fixes
  (line-hint refreshes for 6 sites shifted by intervening plans' edits, widening
  `CONFIGSTORE_SET_RE` to also match `storeHumbleSecret(...)` calls since Plan 12's secret-store
  seam replaced the literal `configStore.set('csrfToken', ...)` shape the script was written
  against, and a new `SITE_PROFILES` entry for Plan 17's `library.ts:1202` diagnostic-label
  ternary) — all committed in this plan's Task 4 commit as required, script-only fixes.
- **Two CONTENT-level staleness issues surfaced that are separate from the above (they don't hard-
  stop the script — it completes and produces output — but the output is misleading for
  already-closed findings) and are OUT OF this plan's scope (F-2/F-3/F-4/S-09), left for plan 19
  ("declare/reconcile" per STATE.md's gap-cycle order) to fix in the script itself:**
  1. **F-6 (S-07/S-10) still reports `authCache`/`cache`/`hostResolver`/`storage` as dropped**, even
     though Plan 16 already closed `storage`/`cache` via a SECOND wipeSteps entry
     (`clearHumbleStorage`/`clearEpicStorage`). The script's `categories_for_labels()` mapping table
     (built in Plan 10, before Plan 15/16 added these step labels) does not recognize either label,
     so both fall into an `UNKNOWN:*` bucket that never counts toward closing `storage`/`cache` in
     the dropped-category diff — the regenerated table under-reports Plan 16's real fix.
  2. **F-1 (S-11, `secretStore.ts`) reports SILENTLY-DROPPED**, even though Plan 13 already closed
     F-1 via a real OS-keyring-backed `HumbleSecretStore` implementation (34.4 D-09 struck per
     STATE.md). `secretStore.ts`'s own module doc comment thoroughly describes the keyring seam,
     the sidecar install path, and Plan 13's role, but carries no token matching the script's strict
     `T-\d.../D-\d+` ID pattern — `is_axis_b_declared()`'s alternate-seam-term path requires BOTH an
     id AND a term, so an id-less (however well-written) doc comment cannot pass, per the same
     strict-by-design discipline that correctly keeps F-6's own near-miss (`T-34.4.1-30` present,
     no category term) SILENTLY-DROPPED. Recommend either adding a formal decision id to
     `secretStore.ts`'s header, or having plan 19 decide the classification is out of this script's
     mechanical reach and record it by hand in that plan's own gap-reconciliation document instead.
- **Scope:** neither `categories_for_labels()`'s mapping table nor `secretStore.ts`'s header is
  touched by this plan — both are pre-existing symptoms of plans 12/13/15/16 (already committed, all
  outside this plan's `files_modified`) never having regenerated this sweep. Not fixed here.
- **Disposition:** logged, not fixed. The regenerated `34.4.1-SEAM-PARITY-SWEEP.md` is committed
  as-is (mechanically honest per the script's own current rules) — plan 19 owns reconciling S-07/
  S-10/S-11's disposition text against the fact that F-6 and F-1 are both already closed.

## Plan 19 — `seam-parity-sweep.py`'s S-07/S-10/S-11 staleness re-forwarded, not fixed (2026-07-30)

- **Found during:** Plan 19's own read of this file's Plan 18 entry (above) while writing
  `34.4.1-19-PLAN.md` Task 1's declaration into `34.4.1-PORTED-CHANNELS.md`.
- **Issue, unchanged from Plan 18's own description:** `seam-parity-sweep.py`'s
  `categories_for_labels()` mapping table predates plans 15/16's `clearHumbleStorage`/
  `clearEpicStorage` step labels, so the regenerated `34.4.1-SEAM-PARITY-SWEEP.md` still reports
  S-07/S-10 as SILENTLY-DROPPED for `storage`/`cache` even though plan 16 closed both. Separately,
  `is_axis_b_declared()`'s strict id+term bar (by design) cannot recognize `secretStore.ts`'s
  prose-only module doc comment, so S-11 still reports SILENTLY-DROPPED even though plan 13 closed
  F-1.
- **Why not fixed here, despite plan 18 explicitly routing it to "plan 19":** `34.4.1-19-PLAN.md`'s
  own `files_modified` frontmatter and task list name exactly three files
  (`34.4.1-PORTED-CHANNELS.md`, `REQUIREMENTS.md`, `ROADMAP.md`) — `seam-parity-sweep.py` and
  `34.4.1-SEAM-PARITY-SWEEP.md` are not among them, and this plan's own objective is explicit that
  it must "change nothing whose truth the gate has not yet established" and must not expand scope
  beyond what its own task list declares. `34.4.1-PORTED-CHANNELS.md`'s new gap-cycle section
  records this staleness in prose (so a reader of the declared record is not misled) but does not
  touch the script or the generated sweep document.
- **Scope:** `seam-parity-sweep.py` and `34.4.1-SEAM-PARITY-SWEEP.md` are outside this plan's
  declared files. Not fixed here.
- **Disposition:** logged, re-forwarded. No plan currently owns this — neither plan 19 (this one)
  nor plan 20 (the live-gate re-run, which touches `34.4.1-LIVE-GATE-RERUN.md`,
  `34.4.1-LIVE-GATE.md`, `34.4.1-PORTED-CHANNELS.md` and `IPC-PORT-INVENTORY.md` only) lists this
  file in scope. A future plan should fix `categories_for_labels()` for
  `clearHumbleStorage`/`clearEpicStorage`, decide whether to add a formal decision id to
  `secretStore.ts`'s header or accept S-11's SILENTLY-DROPPED read as a known false-negative of
  the script's strict-by-design matching, and regenerate the sweep document.

## Plan 18 — `helperProcess.test.ts` full-suite-only flake (2026-07-30)

- **Found during:** Plan 18's Task 4 `npm run test:ci` verification run (3386 passed / 3387 total,
  1 failed).
- **Symptom:** `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` — test
  `HEALTH never answers at all (probe timeout every attempt) -> unreachable, ready:false` failed
  once under full-suite timing pressure.
- **Isolation check performed** (per project memory `flake-baselines-can-be-undiagnosed-bugs`):
  `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` in isolation →
  **9/9 passed**, including this exact (timeout-sensitive) test.
- **Scope:** the Steam bridge helper process and its test file are entirely outside this plan's
  files (`src-tauri/src/main.rs`, `src/backend/humble/user.ts`, `src/backend/humble/adapter.ts`,
  and their tests). Not fixed here per the scope-boundary rule.
- **Disposition:** logged, not fixed.

## Live observation — Keychain prompt storm at boot, and F-9's probable root cause (2026-07-31)

- **Found during:** Plan 21 Task 3's human checkpoint. The operator booted the app to drive the
  spike-016 probe and was prompted for the Keychain password **20+ times on a single boot**. The
  probe itself was NOT run — this observation is not spike 016's answer, and Task 3 remains open.
- **Second observation, same boot:** the Humble session survived the relaunch — **no re-login was
  required**. This is plan 13's F-1 fix (session cookie held in the `humble-session` keyring slot)
  behaving correctly across a real process restart. Not gate evidence on its own, but it is the
  first live signal that F-1's closure holds outside the test suite.

### Why this matters beyond the annoyance: it is very likely **F-9's root cause**

F-9 is recorded as *"the intermittent 60-second `keyring_get` timeout that hit the `humble-csrf`
slot"* and is currently owned by **plan 26**, whose objective is framed as making an intermittent
timeout reproducible. That framing now looks wrong.

A modal Keychain prompt blocks `keyring::Entry::get_password()` until the operator answers it.
Queued behind ~20 other prompts, a single call trivially exceeds `RUST_INVOKE_TIMEOUT_MS`
(`src/backend/sidecar/sidecarRpc.ts:58` — 60_000) and rejects as a timeout. That is F-9's exact
signature, and it explains the "intermittent" qualifier precisely: whether it fires depends on how
quickly the operator dismissed the dialog. F-9 is then not a flake to be stabilised but a
**consequence of an unbounded keyring read count**.

### Two separable causes, different confidence levels

| Question | Cause | Confidence |
|---|---|---|
| Why **20+** reads per boot | **No caching anywhere in the keyring read path.** `SidecarKeyringSlotStore.getToken()` / `.isAvailable()` (`src/backend/sidecar/keyringTokenStore.ts:64-90`) issue an unconditional `requestRustInvoke` per call — no memo, no in-flight dedupe, no process-lifetime cache. Every `HumbleUser.getCredentials()` / `getCsrfToken()` call site (`humble/user.ts:141,152`; callers in `humble/library.ts:791,1161`, `humble/validation.ts:24`, `humble/adapter.ts:711`) is a fresh Keychain hit, and `storeHumbleSecret()` adds an `isAvailable()` probe after *every* write (`humble/user.ts:109`). | **Source-verified** (verified by absence of any cache/memo/inflight symbol in both `keyringTokenStore.ts` and `humbleSecretStore.ts`) |
| Why **each** read prompts at all | Hypothesis: `pnpm tauri:dev` re-links and ad-hoc re-signs the binary on each rebuild; macOS binds Keychain ACLs to the code signature, so a prior "Always Allow" grant does not carry across rebuilds. | **UNPROVEN hypothesis** — not tested. Stated here so a later reader does not mistake it for a finding. |

The second row governs **severity**: if the per-read prompt is dev-signature churn, a stably-signed
release build would grant once and the read count would be invisible to users. The missing cache
would remain a real defect (latency, and a genuine timeout exposure on any slow/locked Keychain),
but not a catastrophic one. **This must be tested before plan 26 is re-scoped** — the fix for
"unsigned dev builds re-prompt" and the fix for "we read the Keychain 20 times" are different work.

### Scope and disposition

- **Scope:** entirely outside plan 21's declared `files_modified` (`REQUIREMENTS.md`, `ROADMAP.md`,
  `STATE.md`, `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `34.4.1-SPIKE-016-FINDINGS.md`).
  Not fixed here.
- **Disposition:** logged, **not fixed**, and explicitly **forwarded to plan 26** as a scope
  change to be decided by the operator before that plan executes. Plan 26 currently owns F-9 and
  names `src-tauri/src/main.rs`, `src/backend/sidecar/sidecarRpc.ts` and its test — a read-count
  fix would additionally touch `keyringTokenStore.ts` / `humbleSecretStore.ts`, which plan 26 does
  **not** currently declare. Re-scoping plan 26 (or minting a new plan) is required; do not let an
  executor silently widen it.
- **Open question for whoever picks this up:** does the prompt storm reproduce on a properly
  signed build? That single test decides whether this is a release-blocking defect or a
  dev-ergonomics problem with a latent timeout tail.

### Follow-up (2026-07-31, same day): signing hypothesis MECHANISM CONFIRMED, empirical test NOT RUNNABLE locally

The row above marked "why does each read prompt at all" as an unproven hypothesis. The mechanism is
now confirmed from the build itself; the *empirical* test remains unrun, and cannot be run on this
machine.

**Evidence gathered:**

- `codesign -dvvv src-tauri/target/debug/gamelib-shell` → `Signature=adhoc`,
  `TeamIdentifier=not set`, `Identifier=gamelib_shell-6d116d516af003c6`.
- `security find-identity -v -p codesigning` → **0 valid identities found** on this machine.
- `src-tauri/tauri.conf.json` has **no `bundle.macOS` block at all** — no `signingIdentity`, no
  entitlements, no hardened-runtime settings. `bundle.targets` includes `dmg`;
  `createUpdaterArtifacts` is `true`.
- `.github/workflows/release-tauri.yml` signs **conditionally**: only when `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY` are all present. Otherwise it emits
  `::warning::... shipping unsigned` and continues.

**Mechanism (confirmed):** keyring 3.6.3's `apple-native` feature stores generic passwords in the
legacy login keychain, whose items carry a per-item ACL naming trusted applications by *designated
requirement*. With an ad-hoc signature and no team, the DR degrades to a **cdhash** match.
`tauri:dev` recompiles on every run → new cdhash every run → any "Always Allow" grant is stale on
the next rebuild. The `gamelib_shell-<hash>` identifier suffix is Rust's compilation-metadata hash,
so in dev not even the identifier is stable.

**Correction to the severity note in the row above.** That note said a stably-signed release build
would reduce this to a single prompt, and used that to argue the defect may be dev-only. That
reasoning assumed the shipped build IS signed. It is not guaranteed to be: signing is conditional
on CI secrets and the workflow explicitly ships unsigned when they are absent. On an **unsigned
release**, the cdhash is fixed within a version — so a grant sticks — but `createUpdaterArtifacts`
means every auto-update ships a new binary with a new cdhash, staling every grant. **The storm then
returns after every update.** Signing does not de-risk the missing cache; it only decides whether a
user meets it once per install or once per update.

**Unexplained, and it matters for the fix.** Even ad-hoc, clicking **Always Allow** on the first
prompt should silence subsequent reads of that same item *within the same boot* — the ACL grant
applies to the running binary immediately. 20+ prompts in one boot therefore means either (a) the
operator clicked **Allow** (one-shot) rather than Always Allow, or (b) grants are not sticking at
all. These imply different fixes: (a) is purely the read-count defect; (b) means something is wrong
with how the items' ACLs are created and is the more serious reading. **Determine which before
scoping plan 26.**

**Partial structural explanation of the count:** plan 11's allowlist defines THREE accounts
(`steam-refresh-token`, `humble-session`, `humble-csrf`). Each is a separate keychain item with its
own independent ACL — a grant on one never carries to the others. Three distinct dialogs are
structurally unavoidable no matter how good the caching is; only the count *beyond* three is
attributable to the missing cache.

**Test status:** the "does it reproduce on a signed build?" question in the row above is
**NOT runnable locally** (0 codesigning identities). It requires either a Developer ID cert
installed on the test machine, or a CI run with the three Apple secrets populated. Do not record it
as answered until one of those happens.

### Resolution of the "Always Allow" ambiguity (2026-07-31)

The entry above listed two readings of the 20+ prompts and said they imply different fixes.
**Operator confirms they clicked "Always Allow", not one-shot "Allow"** — i.e. reading (b), grants
not sticking. Investigation of the live Keychain narrows this to a single surviving cause.

**Alternatives tested and ELIMINATED:**

| Candidate | Verdict | Evidence |
|---|---|---|
| Per-call item churn (service/account varying per call) | Ruled out | `KEYRING_SERVICE` / `keyring_account()` are compile-time constants (`src-tauri/src/main.rs:168-196`); every `Entry::new` uses `KEYRING_SERVICE` + an allowlisted account |
| Duplicate items, each carrying its own ACL | Ruled out | `security dump-keychain` → exactly 4 items under `com.gamelib.launcher`, no duplicate account names |
| Allowlist bypassed / unlisted accounts being written | Ruled out | The one non-allowlisted item (`steam-refresh-token-selfcheck`, `cdat` 2026-07-22) is written by NO current code — grep of `src-tauri/src/` and `src/backend/` finds zero references. Dead cruft from an earlier build. |

**Surviving cause:** the ad-hoc code signature. "Always Allow" adds the requesting app to the
item's ACL as a `SecTrustedApplication` (a path plus a code requirement). For an ad-hoc-signed
binary with no TeamIdentifier that requirement degrades to a bare cdhash, and such records do not
durably persist — the dialog accepts the grant, but it does not take effect. This is consistent
with every observation. **Status: inference by elimination, NOT proof.** Every locally-testable
alternative has been eliminated; the confirming test still requires a signed build and this machine
has 0 codesigning identities.

**Severity, resolved:**

- **Properly signed build:** ~3 prompts total, ever (one per keychain item, on first access). The
  read count is invisible to users.
- **Ad-hoc / unsigned build:** N prompts, where N *is* the read count. The missing cache is the
  entire problem.

This partially reinstates the ORIGINAL severity read and softens the correction recorded above —
but that correction still stands on one point: `release-tauri.yml` ships unsigned when the Apple
secrets are absent, and `createUpdaterArtifacts: true` restales grants on every update. **The cache
fix remains warranted**; it is what protects users on the unsigned release path.

**Consequence for plan 26 / F-9 — caching alone does NOT close it.** F-9's 60s `keyring_get`
timeout is now fully explained (a read blocked behind a modal dialog exceeds
`RUST_INVOKE_TIMEOUT_MS`). But the FIRST read still blocks on a dialog even with a perfect cache.
A complete fix needs both: (1) eliminate redundant reads, and (2) handle "this call is waiting on
the user" honestly rather than letting it hit a bare 60s timeout and reject. Scope plan 26 for
both, or it will close the symptom and leave the failure mode.

**Minor hygiene item, unowned:** the orphaned `steam-refresh-token-selfcheck` entry sits in the
operator's login keychain from a 2026-07-22 build. Harmless and no longer written, but a probe
artifact was left in a real user keychain — worth a look at whether any current self-check path can
still strand entries. NOT deleted here (it is the operator's keychain, not this plan's to modify).

### Upgrade (2026-07-31): the ACL theory now has DIRECT hardware evidence, not just elimination

Plan 26's Task 1 timing harness (`keyring_read_timing_hypothesis_absent_vs_present_entry`, `#[ignore]`d,
in `src-tauri/src/main.rs`) was run live on this machine, twice. It **refuted** the research
hypothesis ("a missing Keychain entry blocks longer than a present one") — and refuted it in the
opposite direction:

| Case | Observed |
|---|---|
| Absent entry | 40–102 ms |
| **Present** entry (real `steam-refresh-token` account) | **48.9 s**, then **291 s** — both failing `PlatformFailure(-60008, "Unable to obtain authorization for this operation")` |

`-60008 / "Unable to obtain authorization for this operation"` is the **ACL authorization check
failing** — which is exactly what the ad-hoc-signature theory predicts, and it arrives as a direct
observation rather than as the inference-by-elimination recorded above. The entries above should be
read with that upgrade in mind: the mechanism is no longer only "the surviving candidate", it is
measured.

It also fully accounts for F-9's severity. A 291-second stall does not merely brush
`RUST_INVOKE_TIMEOUT_MS` (60 s) — it exceeds it nearly fivefold, so the timeout was always going to
fire and the "intermittent" qualifier was only ever about how quickly the operator dismissed the
dialog.

**Still NOT proven, unchanged:** whether a properly signed build collapses the storm. This machine
has 0 codesigning identities; the confirming test remains a CI run with the Apple secrets or a cert
installed locally. Plan 26 shipped a bounded `KEYRING_READ_TIMEOUT` (8 s, justified from the
measured 40 ms–291 s spread) plus a read cache — it does not, and cannot, prove the prompt count
drops on a real boot. That is plan 29's gate.

## Plan 28 — `seam-parity-sweep.py` staleness **CLOSED** (2026-07-31)

**Closes the Plan 18 entry and the Plan 19 re-forward above.** Both described the same two content
defects; neither was fixed, both times for the same reason — **the file was never listed in a
plan's `files_modified`**. Plan 18 found it and routed it to plan 19; plan 19 declined on exactly
that ground; plan 20's scope did not include it either. Plan 28 listed
`seam-parity-sweep.py` and `34.4.1-SEAM-PARITY-SWEEP.md` explicitly, which is the fix for the
process failure as much as for the content.

**Fix 1 — `WIPE_STEP_CATEGORIES`.** Added `clearHumbleStorage` and `clearEpicStorage`, both mapping
to `{storage, cache}`. They previously fell into the `UNKNOWN:` bucket, so S-07/S-10 kept reporting
storage and cache as dropped after plan 16 had closed both.

**Fix 2 — a real decision id, not a loosened bar.** Option (a) as the research recommended:
`T-34.4.1-56` — plan 13's own threat row, *"Humble session cookie at rest … the secret moves from a
world-readable JSON file"* — is now stated in `secretStore.ts`'s module docblock beside the
reduction it describes. `is_axis_b_declared()`'s id+term requirement is **unchanged**
(`grep -c required_terms` still 3), and a new self-test case asserts it in BOTH directions so a
future loosening fails the reject half. **S-11 is now DECLARED.**

**The research's diagnosis of S-11 was incomplete, and this is the part worth carrying forward.**
The docblock was not merely id-less. Once the id was added the comment was **not being read at
all**: `extract_file_header_comment()` requires the WHOLE comment inside a 3000-character window,
and the addition pushed its closing `*/` to character 3149. Moving the docblock above the imports —
where a module docblock belongs — gives it the full window at 2931 characters. **The window was not
widened to accommodate prose.** Anyone editing that docblock again should know it has ~70 characters
of headroom; a comment that outgrows the window silently stops being a declaration.

**S-07 and S-10 still read `SILENTLY-DROPPED`, and that is now correct rather than stale.** With the
mapping fixed, the Tauri branch is seen to cover storage and cache; the residual drop is
**`authCache` + `hostResolver` only** — a real, much narrower gap with no Tauri equivalent. The
document is left mechanically honest per the standing "fix the script, never hand-edit the generated
document" instruction. **This is a genuine open item, not a reporting artifact**, and it is the one
row of this sweep that a future plan should own.

**S-12** (`src/backend/steamgrid/secureKey.ts`) is **pre-existing**, present in the previously
committed sweep, and is the F-1b instance already recorded — not a new discovery by this plan.

## Plan 28 — WKWebView silent-no-op sweep backlog filed (2026-07-31)

`34.4.1-WKWEBVIEW-NOOP-SWEEP.md`, generated by `wkwebview-silent-noop-sweep.py` (16 self-test
cases). Filed as a backlog per research Item 2's bound: **static analysis cannot determine whether a
flagged API degrades silently, throws, or works.** Every row below is a candidate for a future
targeted spike, **not a defect claim**, and none was resolved inline — `git diff --stat -- src/` was
empty for the sweep's own commit.

**5 `UNVERIFIED-LIVE` rows, all on the Rust axis. 0 on the JS axis.**

| Axis | Rows | Disposition |
|------|------|-------------|
| JS/TS (`src/frontend`, `src/preload`) | 0 unverified | The only 2 hits are `queryLocalFonts` in `queryLocalFontsSafe.ts`, both **GUARDED** and both **VERIFIED-LIVE**. 11 of the 13 allowlisted APIs have no code reference at all. |
| Rust (`dispatch_rust_channel`) | 5 unverified | All five are `WebViewBuilder::build()`, in `humble_login_open` (1269), `humble_reveal_post` (1676), `humble_login_clear_storage` (1743), `humble_login_cookies_for_domain` (1815) and the tray `show` arm (2217). |

**Nothing here looks urgent on its face.** `build()`'s vendored caveat is **Linux/X11-and-Wayland
specific** ("Only X11 is supported … use `WebViewBuilderExtUnix::new_gtk`"), so it does not bear on
macOS at all and bears on Linux only if the login window is ever opened under Wayland. That is the
single row worth a spike, and it is a **Linux packaging** question rather than a WKWebView one.

The two rows that would have mattered are already **VERIFIED-LIVE** and need no spike:
`cookies()` ("Android: Unsupported, always returns an empty `Vec`") and `delete_cookie()`
("Android: Not supported") — both already observed live as F-6.

**Honest calibration, recorded in the generated document too:** of the four known instances of this
failure class, **three were found by a human driving a UI and none by a scanner**. This tool would
not have caught `navigator.clipboard`, `queryLocalFonts` or `delete_cookie` before the fact. It
narrows where to look next; it does not replace the live gate.

---

## Plan 29 — findings from the THIRD live gate run (2026-07-31)

The gate passed 4/4 and Phase 34.4.1 closes. Everything below is a finding the run produced that
**no plan owns**. None was fixed at gate time — Task 2 is run-and-record, and inventing a fix mid-gate
would ship unproven code, which plans 08 and 20 both declined to do.

**Read the ownership rule first.** Plan 28 closed a sweep-staleness item that had been logged and
correctly re-forwarded **twice** without being done, each time because `seam-parity-sweep.py` was
never in any plan's `files_modified`. **A carry-forward without an owning plan that declares the
file is a note, not a task.** Every entry below therefore names the file that must be declared.

### D-29-01 — Manage Accounts does not self-refresh after a successful sign-in (NEW, UX-blocking)

After sign-in completed, the Manage Accounts page kept rendering its in-progress state:

> Signing in to Humble Bundle
> A sign-in window has opened. Complete sign-in there — this page updates automatically once it succeeds.

The page's own promise was not kept. Navigating away and back loads correctly and shows Humble
connected, so **the session is fine — this is a stale view, not lost auth**. Severity is
UX-blocking-but-not-data-affecting: a user following the on-screen instruction sees no sign their
login worked and is told to keep waiting for an update that never arrives.

**Files to declare:** `src/frontend/screens/Login/` (the Manage Accounts route) and whatever
publishes the login-completed signal to it.

### D-29-02 — post-login `/api/v1/user/info` returns a 232-byte HTML 404

```
Humble adapter: /api/v1/user/info HTTP failure diagnostic
  status=404 contentType=text/html; charset=utf-8 bodyIsString=true looksLikeHtml=true bodyLength=232
Humble post-login identity fetch threw (best-effort, login already accepted): AxiosError 404
```

Non-blocking — the fetch is best-effort, login was already accepted, and the adapter's error
discipline held (message only, never body or cookie). Two candidate explanations, **neither
established**: the endpoint path has moved, or an interstitial is answering in its place.
`looksLikeHtml=true` on a 404 fits both.

**Possible shared root cause with D-29-01 — HYPOTHESIS, NOT A CONCLUSION.** An identity fetch that
throws is a plausible reason the UI never receives the account details it waits on. The two are
consistent and share a moment in time, which is exactly the evidence shape that cost F-10 nine live
runs when it was treated as proof.

**Discriminator, cheap and mandatory before either is fixed:** determine whether Manage Accounts'
update path is gated on `getAccountIdentity`'s result. If yes, one fix closes both. If it renders
from the login-accepted signal independently, these are two unrelated defects that coincided.
**Settle it by reading the code, not by assuming the tidier answer.**

**Files to declare:** `src/backend/.../humble/adapter.ts`, `humble/user.ts` (`finishLogin` /
`getAccountIdentity`).

### D-29-03 — a SUCCESSFUL `humbleRevealKey` logs no completion line (observability)

The log records `Humble reveal: calling adapter (...)` and then nothing — no status, no duration.
Failure paths **are** instrumented (D-29-02's 404 produced a full diagnostic), so the asymmetry is
specifically that success is silent.

**Consequence, which is why it is filed rather than shrugged off:** item 4's central outcome — *did
the real network call work* — was **not verifiable from the log at all** and rested entirely on the
operator's screen. A future automated or semi-automated gate cannot confirm this item without a
human present.

**Suggested shape:** one INFO line on the success path carrying HTTP status and duration and
**explicitly no body**. The redaction discipline is proven correct (the revealed value appears in no
log and no document) and must be preserved by any such line.

**File to declare:** `humble/adapter.ts`.

### D-29-04 — `len=0`: an empty document title is applied to the login window unguarded

`[shell] humble_login_open: title change applied len=0` fires mid-sequence (`22` → `0` → `42`). The
shell forwards WebKit's reported document title with no non-empty guard.

**Explicitly REFUTED as the cause of the visible `Tauri app` flash — do not write it up as such.**
It was proposed as that cause and disposed of by ordering: the flash is one-way and completes before
the first title application (`len=22`), whereas `len=0` fires only after the bar already reads
`Humble Bundle - Log In`. **Filed on its own merits as a latent smell**, not as an explanation for
anything observed.

**File to declare:** `src-tauri/src/main.rs` (`humble_login_open`'s `on_document_title_changed`).

### D-29-05 — `Tauri app` visible between window presentation and first title application

Cosmetic. Root cause established from ordering evidence: `presentation requested` precedes
`title change applied len=22` in the same scrollback, and the interval between them is a titleless
window showing the application default. Fix, if ever wanted, is to create the window with a
provisional title rather than the framework default.

**File to declare:** `src-tauri/src/main.rs`.

### D-29-06 — F-9: a generic RPC timeout fired live; co-occurrence UNDETERMINED

```
[shell] response for unknown/timed-out id=1575 (dropped)
```

A request timed out, was abandoned, and its response arrived to find no waiter. **`keyring:timeout`
specifically did NOT fire** — plan 26's classified 8s message never appeared, and the post-relaunch
boot in item 2 was clean.

**The contract's specific question — did it co-occur with a cookie operation — is UNDETERMINED and
is recorded as such rather than rounded to "no".** `id=1575` carries no channel name; answering it
requires locating the request that opened that id in the same scrollback.

**A methodological correction is embedded here and is the transferable part:** this was first
recorded as "F-9 watch CLEAN" on the strength of a `gamelib.log` grep. That grep could not have seen
it — shell `eprintln!` never reaches the log file. **A clean grep of the wrong source is not
evidence of absence.**

**Status:** F-9 remains OPEN and unassigned, as it was after run 2.

### D-29-07 — domain-scoping of the cookie clear is UNTESTED, and the gate contract is why

`survivingNonHumble=0` in item 3's census is **vacuous, not passing**: `before total=34` equalled
`matched=34`, so no non-Humble cookie existed for the delete to spare and the zero is
arithmetically forced.

**Root cause is the contract, not the operator.** Precondition 6 of `34.4.1-LIVE-GATE-RERUN-3.md`
STRUCK the planted non-Humble cookie as moot, reasoning that plan 17's census *"supplies the
evidence without it."* That conflates the **measuring apparatus** with the **thing measured** — a
census cannot report `survivingNonHumble > 0` against a single-origin jar however correct its
counting. Item 1's from-scratch reset then guaranteed the single-origin condition. **The contract
instructed the operator not to plant a cookie, then required an outcome only a planted cookie could
produce.** No action available during the run could have satisfied it.

**Next cycle MUST unstrike precondition 6** and re-run item 3(b) against a jar holding at least one
non-Humble cookie of known name and domain. The planted cookie and the census are **complements,
not alternatives** — which is what the strike got wrong.

### D-29-08 — Epic logout: expected fixed by construction, UNOBSERVED

No authenticated Epic session was available, so the shared Rust arm's second caller was never
exercised. No `clearEpicCookies` count line was seen; the removed-nothing warning was neither
observed to fire nor observed not to fire. No new Epic OAuth login was opened (D-04, Phase 34.5
scope).

Epic's logout calls the **same** arm that Humble's disconnect just proved fixed, so the structural
argument is sound — but it is an **inference from shared code, not a measurement**, which is
precisely the distinction that let run 2's failure hide behind a fully-green suite. **No document
may describe Epic's logout as verified on this basis.**

**Owner:** Phase 34.5, which holds the Epic auth surface.

### D-29-09 — REQUIREMENTS checkboxes were `[x]` while their own riders said "stays UNCHECKED"

Found while applying Task 3's gated updates. `REQ-34.4.1-06`, `-GAP-03`, `-GAP-05`, `-GAP-07` and
`-GAP-08` were all already `[x]` **despite each carrying prose stating the box stays UNCHECKED until
the gate records a PASS** — and the gate had failed twice at that point.

The end state is now correct (the gate passed, so `[x]` is right), but **for the whole of gap cycle
2 the requirements register overstated closure**, and plan 29's own FAIL-branch acceptance criterion
would have caught it only on a failure. Recorded because it is the same class this phase keeps
catching: **a claim not matched by its artifact.**

**Suggested guard:** a check that a requirement whose body contains "stays UNCHECKED" cannot be
`[x]` — mechanically enforceable, unlike the prose convention it protects.

### D-29-10 — `seam-parity-sweep.py`'s anti-vacuity guard was itself failing

Plan 28 added two check functions with self-test cases but left `expected_case_count = 11`, so
`--self-test` exited non-zero from plan 28 until plan 29 Task 3 bumped it to 13. **The guard that
exists to prove every check can reject was the one check nobody was running.**

Fixed as a recorded deviation (the file is not in plan 29's `files_modified`). Filed so the pattern
is visible: **a self-test's own bookkeeping needs a test too, or it silently stops running.**

---

## Gap cycle 3 — dispositions from the 2026-08-23 re-score (plan 30)

Every `D-29-*` finding was re-scored against current code before gap cycle 3 was planned. The list
was **23 days old**, and re-scoring changed the scope materially. Full working:
`34.4.1-GAP-CYCLE-3-ANALYSIS.md`.

### D-29-01 — **CLOSED 2026-08-23.** Fixed after filing; evidence is in the source.

`src/frontend/screens/WebView/components/HumbleLoginSurface.tsx:58-67` describes this finding's
exact symptom **in the past tense, as the rationale for the design that replaced it**:

> "…the promise settled, but nothing told `TauriLoginPanel` (still statically rendering 'a sign-in
> window has opened' for `runner === 'humble'` regardless of any watch outcome), so the user was
> left staring at a lying in-progress message forever."

The success branch now runs `await humble.login(result); onDone()`, and `error` / `timeout` /
`cancelled` route through the same `TauriOAuthLoginState` shape the four OAuth runners already use,
so `TauriLoginPanel`'s existing generic branches render for humble too.

**Attribution:** Phase 34.4.2 (`F-34.4.2-19`) and quick task `260808-gl6`.

**`.planning/debug/resolved/manage-accounts-slow-update.md` is NOT this defect's closure.** That
session is `status: fixed` (2026-08-03, phase 34.5) for the **GOG / OAuth-capture** path, whose root
cause was a redundant second `gogdl auth` subprocess in `GOGUser.login()`. It is corroborating
context for the defect *class* only. Recording it as D-29-01's closure would be exactly the
conflation D-29-02's discriminator was written to prevent — same symptom, same screen, different
runner, different mechanism.

### D-29-10 — **CLOSED AT FILING.** Never an open task.

Its own body says so: *"Fixed as a recorded deviation (the file is not in plan 29's
`files_modified`). Filed so the pattern is visible."* Recorded here so no future cycle re-plans it.

**The transferable lesson, which is the reason it was filed at all:** a self-test's own bookkeeping
needs a test too, or it silently stops running. Plan 28 added two check functions but left
`expected_case_count = 11`, so `--self-test` exited non-zero from plan 28 until plan 29 Task 3
bumped it to 13 — **the guard that exists to prove every check can reject was the one check nobody
was running.**

> **Note for gap cycle 3:** `seam-parity-sweep.py` is RED again today (2026-08-23, exit 1), but for
> an unrelated reason — an unclassified Axis A site at `src/backend/humble/library.ts:1211`. That is
> tracked as **NEW-01** and owned by plan 31, which declares the script in its `files_modified`.
> **It is not a regression of D-29-10.**

### D-29-09 — **ONE requirement, not "checkboxes".**

Hand-swept all 26 `REQ-34.4.1-*` blocks. The tooling could not have found this: *plan-phase
gap-analysis is not phase-scoped and is blind to every decimal-phase REQ ID*, and this phase is
**doubly** decimal (`N.M.P`), so every ✓/✗ it prints here is unreliable.

**Exactly one** requirement carried `[x]` against its own "stays UNCHECKED" rider with no `CLOSED`
record: **`REQ-34.4.1-GAP-11`** (`keyring_get` bounded-timeout observability), whose body ends *"This
box stays UNCHECKED — live-only."* Un-checked by this plan.

**Two false positives were caught and discarded.** `REQ-34.4.1-13` and `REQ-34.4.1-GAP-06` tripped a
naive scan because the block-splitter absorbed the **gap-cycle section preamble** — which itself
contains the phrase "box stays `[ ]`" — into the preceding requirement's block. Stripping the
preamble removed both. **A sweep whose unit is the block must prove where the block ends.**

### NEW-01 — `seam-parity-sweep.py` was RED on `main` for 23 days (plan 31, **CLOSED 2026-08-23**)

Not a D-29 finding — it post-dates the list. Found only because gap cycle 3 ran the script by hand.

**It was line drift, not an unclassified site.** The hard stop named
`src/backend/humble/library.ts:1211` as having "no `SITE_PROFILES` entry", but the entry existed —
keyed to `line_hint: 1202`, and `run_axis_a()`'s ±5 window cannot absorb a 9-line shift. Fixing one
hint surfaced the next; **all three `SITE_PROFILES` hints and seven of the eight
`EXPECTED_AXIS_A_SITES` entries had drifted at once.**

Renumbered by **enclosing function**, never by position, because the walk now finds a fifth
`humble/user.ts` site that the floor does not list — positional matching would have mis-assigned
every entry after it. That fifth site (`:873`, `checkHealthAndFlagExpiry`'s S-09 guard) was
deliberately kept out of the floor, per Plan 18's own note that this list is *"a FLOOR … not an
exhaustive site list"*. Adding it would quietly convert a floor into an inventory.

`legendary/user.ts:137` never drifted, which is the useful control: the renumbering was not a
blanket rewrite.

**An attribution error is recorded here on purpose.** A first draft blamed
`fbbfa852e style: apply prettier repo-wide` alone, on the strength of `git diff -w` showing
changes. **That test is invalid** — `-w` ignores whitespace *within* a line and does not ignore
reflowing, so it cannot distinguish a formatting sweep from real work in either direction. The
honest attribution is the **~8 commits** that touched these files since the Plan 18 refresh
(34.4.2 and 34.5 behavioural work plus the prettier sweep), collectively.

**Verification, three states, real exit codes** (`cmd | tail` reports `tail`'s status — a mistake
made while first diagnosing this gate):

| state | expected | measured |
|---|---|---|
| after the fix | exit 0 | **exit 0**, 13 findings written |
| one hint reverted `1211`→`1202` | exit 1 | **exit 1**, same hard stop |
| restored | exit 0 | **exit 0** |
| `--self-test` | exit 0 | **exit 0** — "every check rejects its corresponding bad input" |

Regenerating `34.4.1-SEAM-PARITY-SWEEP.md` risked the recorded *regenerating-an-artifact-breaks-its-pins*
failure. Checked: `src/backend/sidecar/__tests__/seamBranchParity.test.ts` pins this surface and
**passes 28/28** after the regeneration. `pnpm planning-gates` 6/6.

> **The gate is still not wired into CI.** `pnpm planning-gates` runs six gates and this is not one
> of them, which is the whole reason a red gate survived 23 days unnoticed. **Wiring it in is NOT
> done here and is not in this plan's scope.** What it would take: add
> `seam-parity-sweep.py` to `meta/runPlanningGates.py`'s discovery, and decide whether the three
> pre-existing `SILENTLY-DROPPED` entries (`S-07`, `S-10`, `S-12`) are acceptable at red or must be
> dispositioned first — they are reported today but do not fail the run. Named rather than left as
> another undeclared note, per this file's own rule.

### D-29-08 / D-29-06 — owners assigned (plan 34, 2026-08-23)

Both were **unassigned notes**, not tasks. `grep -rl "34\.4\.1" .planning/todos/` was empty in both
`pending/` and `completed/` — all ten `D-29-*` findings lived only in this file, which carries no
frontmatter and is therefore invisible to `gsd-sdk query audit-uat` **and** to the explorer rollup.

Now tracked:

- `D-29-08` → `.planning/todos/pending/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md`
- `D-29-06` → `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`

**D-29-08 was genuinely ORPHANED, with dates.** It named Phase 34.5; 34.5's own `-26-SUMMARY.md:316`
disclaims it; 34.6 inherited only the Epic **login** and `egsSync` legs from the parked 34.7; 34.7 is
ON HOLD; and `clearEpicCookies` exists in no phase folder but this one's. **Owner: 34.6 — CONFIRMED by the operator 2026-08-23** ("yes move to 34.6"); was proposed,
as an explicit addition — the existing inheritance demonstrably did not cover logout.

**D-29-06 keeps UNDETERMINED as UNDETERMINED.** Its transferable half is preserved verbatim: the
finding was first recorded "F-9 watch CLEAN" on a `gamelib.log` grep that **could not have seen it**,
because shell `eprintln!` never reaches the log file. *A clean grep of the wrong source is not
evidence of absence.*

## Gap cycle 3 — ownership map for every D-29 item

Per this file's own rule — *a carry-forward without an owning plan that declares the file is a note,
not a task* — nothing below is left without an owner **and** a declared file.

| ID | Disposition | Owner | Declared file |
|---|---|---|---|
| D-29-01 | CLOSED (already fixed) | plan 30 | — (ledger only) |
| D-29-02 | **PARKED 2026-08-23** (operator) — UNDETERMINED, non-blocking | plan 32 → todo `2026-08-23-humble-user-info-404-two-candidates-undiscriminated.md` | `src/backend/humble/adapter.ts` |
| D-29-03 | OPEN | plan 32 | `src/backend/humble/adapter.ts` |
| D-29-04 | OPEN | plan 33 | `src-tauri/src/main.rs` |
| D-29-05 | OPEN | plan 33 | `src-tauri/src/main.rs` |
| D-29-06 | **PARKED 2026-08-23** (operator) — co-occurrence UNDETERMINED | plan 34 → todo `2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` | todo file above |
| D-29-07 | OPEN — headline | plan 35 | `34.4.1-LIVE-GATE-RERUN-4.md` |
| D-29-08 | RE-HOMED to 34.6, CONFIRMED 2026-08-23 | plan 34 → todo; owner signed off by the operator, not just proposed | todo file above |
| D-29-09 | CLOSED (one REQ) | plan 30 | `.planning/REQUIREMENTS.md` |
| D-29-10 | CLOSED at filing | plan 30 | — (ledger only) |
| NEW-01 | CLOSED | plan 31 | `seam-parity-sweep.py` |

### D-29-03 — **CLOSED 2026-08-23** (plan 32). D-29-02 — remains open, handed to plan 35.

**D-29-03 closed.** `revealKey()` (`adapter.ts`) now emits exactly one INFO line on the success
path: `Humble adapter: /... reveal succeeded  keyPresent=true durationMs=<n> contentType=<t>`.
Live-gate item 4's central outcome — *did the real network call work* — is now machine-checkable
instead of resting entirely on the operator's screen.

**Two tests, each RED-proven against the defect it guards** (not merely against the old code):

| test | red-proof | result |
|---|---|---|
| completion line exists, exactly once, with `durationMs` | delete the `logInfo` call | **FAILS** ✓ |
| revealed key reaches NO log sink | interpolate `key=${parsed.data.key}` into the line | **FAILS** ✓ |

The redaction test audits **all three sinks** (`logInfo`/`logWarning`/`logError`), not just the one
the call under test uses — a redaction check driven through a single caller has found exactly one
leak on this project four times, where a census found more. It also asserts no `keyLength=`, because
a length is a side channel on a secret whose value is the entire point of the call.

**No HTTP status in the line, and that is a scope DECISION, not an oversight.** D-29-03's suggested
shape asked for "HTTP status and duration". `HumbleRawResponse` carries only `{ data, contentType }`
— there is no status field. Adding one means widening the shared transport type across **both**
branches (`humblePostRequestViaSeam` and the electron-net path), which is exactly the seam-parity
surface F-1 and F-6 hid in, for an observability nicety. Duration plus an explicit success marker
satisfies what the finding actually needs; the status code adds nothing a gate can use that the
marker does not. Recorded here so a future reader sees a decision rather than a missing half.

---

**D-29-02 NOT closed — deliberately, and this is the planned outcome.** Plan 32 instructed: *"If it
cannot be determined without a live authenticated session, say so and stop — record it as a
live-gate observation for plan 35 rather than guessing."*

It cannot. The two candidate explanations — the endpoint path has moved, or an interstitial is
answering in its place — are **both** consistent with everything observable offline:

- `adapter.ts:673` records the path as *"confirmed empirically in Plan 05 (10-VALIDATION.md)"*, so
  it demonstrably worked once. That rules out "never existed", not either live candidate.
- `looksLikeHtml=true` on a 404 fits both equally.
- An unauthenticated probe cannot discriminate: an interstitial and a moved path would both answer
  an anonymous request with HTML.

Guessing here would repeat the failure that cost F-10 nine live runs — correlation shipped as cause.

**Handed to plan 35** as a named live-gate observation, against a live authenticated session.
**Non-blocking regardless:** `finishLogin` gates acceptance on `getGamekeys`, never on
`getAccountIdentity`, whose throw is caught. The fetch stays best-effort; making the UI depend on it
is explicitly out of scope.

### D-29-04 and D-29-05 — **CLOSED (static half) 2026-08-23** (plan 33). Live half → plan 35.

**D-29-04.** An empty document title is now a no-op. `login_window_title`'s own
`Some(title) if !title.is_empty()` guard was already correct — the defect was that
`on_document_title_changed` **called it with a value it should have discarded**, so
`login_window_title(origin, Some(""))` fell through to the bare origin and the bar dropped its
document title and got it back (the live `22 → 0 → 42` sequence). The guard now short-circuits
**before** the lock and before `set_title`. The skip is still logged: *"fired and ignored"* and
*"never fired"* are different diagnoses, and only a logged skip separates them.

**D-29-05.** The visible login window is built with an **origin-derived** provisional title,
`login_window_title(&origin, None)`, so it never presents as the framework default `Tauri app`.
Scoped to the `if visible` block — the hidden reveal/clear windows have no title bar
(`T-34.4.1-82`).

**WR-07 is NOT re-opened.** It prohibits a hard-coded *application* title, not an origin-derived
one; `origin` here is `url.origin().ascii_serialization()`, never page content, and the document's
own title still replaces this via the callback.

> ### An existing gate was AMENDED, and this is the part worth reading
>
> `tauriShellSource.test.ts` asserted `expect(chain).not.toContain('.title(')` — **a blanket ban on
> the method.** D-29-05's fix made it fail, and that exposed the gate as **measuring the wrong
> property**: it could not have distinguished `.title("GameLib")` (prohibited) from
> `.title(login_window_title(&origin, None))` (correct), because it rejected both.
>
> **The gate was amended; the code was not bent to satisfy it.** Bending code to satisfy an
> unpassable gate is a recorded failure here, and so is a gate that is non-vacuous, RED-proven and
> still guards nothing. The amended version forbids a string literal (all three Rust forms, plus
> `format!`) **and** requires every surviving `.title(` argument to be `login_window_title(` — so a
> future `.title(some_other_var)` cannot slip past the literal check.

**Four red-proofs, each against the defect it guards:**

| # | mutation | expected | result |
|---|---|---|---|
| 1 | `.title("GameLib")` | amended WR-07 gate FAILS | **FAILS** ✓ |
| 2 | `.title(some_other_var)` | amended WR-07 gate FAILS | **FAILS** ✓ |
| 3 | remove the provisional title | D-29-05 presence gate FAILS | **FAILS** ✓ |
| 4 | move the empty guard AFTER `set_title` | D-29-04 order gate FAILS | **FAILS** ✓ |

Red-proof 1 is the load-bearing one: it shows the amendment did **not** weaken WR-07's negative
half. A "fix" to a failing gate that also disarms it would be the worse outcome.

**The PRESENCE half is now closed at SOURCE level only.** `main.rs`'s own WR-07 CORRECTION comment
records that a grep gate structurally cannot establish presence — the new
`.title(login_window_title(&origin, None))` assertion closes that at the source, but **whether an
operator still SEES a `Tauri app` flash is visual and timing-dependent** and remains plan 35's.

`cargo check` clean, `cargo test` **155/155**, `tauriShellSource` **114/114**, tsc 0, eslint 0
errors, seam sweep exit 0.
