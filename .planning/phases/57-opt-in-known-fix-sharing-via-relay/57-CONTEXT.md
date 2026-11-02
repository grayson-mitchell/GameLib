# Phase 57: Opt-in known-fix sharing via relay - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Fixes GameLib already detects on a user's Mac reach `grayson-mitchell/known-fixes` without
anyone pasting a log line. A new setting, **Share detected game fixes**, is off by default.
When it is on and an existing detector reaches a definitive verdict, the client sends a
minimal report to a serverless relay, and the relay opens a pull request on known-fixes with
the fix file already written. Nothing reaches users until the operator merges.

The three detectors (no new detectors in this phase):

1. The post-install Mach-O check (`verifyMacArchGroundTruth`, `steam/library.ts`) finds a
   32-bit Mac build → add `macArch: "32"` (quick 261027-bqe).
2. The PE CEG scan (`bridge/peSteamDrm.ts`, verdict persisted at `steam/games.ts`
   `installBridgeGame` / `launchBridgeGame`) finds Steam CEG DRM → add `drm: "ceg"`
   (quick 261027-gtd).
3. The Mach-O check finds a 64-bit build that a curated `macArch: "32"` entry claims is
   32-bit → **removal** report (today the contradiction warning at `library.ts:~2006`).

A report carries the appId, the title, the detected key and value, the op (add/remove) and
the GameLib version. It never carries a user id, a path or a log. The relay holds the GitHub
credential, so no secret ships in the app.

**Done when:** on this Mac, with the setting on, a fresh install of a 32-bit Mac title opens
a PR carrying the correct `steam/<appId>-steam.json`; with the setting off nothing is sent.

</domain>

<decisions>
## Implementation Decisions

### Relay hosting & GitHub identity
- **D-01:** The relay is a **Cloudflare Worker**. Dedup and rate-limit state live in
  Cloudflare KV or D1 (the planner/researcher picks which), and the GitHub credential lives
  in Worker secrets. The operator creates the Cloudflare account.
- **D-02:** The relay authenticates to GitHub as a **GitHub App** installed only on
  `grayson-mitchell/known-fixes`, with contents and pull-requests write (plus issues write for
  D-11). The Worker mints short-lived installation tokens from the app's private key. The
  operator creates the app, and the plan must include those steps as an operator checklist.
- **D-03:** Relay source lives **in this repo** (e.g. `relay/`), deployed with wrangler. The
  payload schema and the allow-list of key/value pairs are shared with the client code (or
  generated from one source) so they can't drift, and they are tested together.
- **D-04:** The client reaches the relay through a **hard-coded URL constant**, in the style of
  `GAMELIB_KNOWN_FIXES_BASE`, with a dev/env override for testing against a local
  (`wrangler dev`) or staging relay.

### PR shape
- **D-05:** The relay opens a **pull request** with `steam/<appId>-steam.json` already written,
  not an issue. (Exception: D-11.)
- **D-06:** **One PR per appId** on branch `report/steam-<appId>`. A later report for the same
  appId while that PR is open (e.g. CEG after 32-bit) adds a commit to the open PR instead of
  opening a second one.
- **D-07:** If `steam/<appId>-steam.json` already exists on known-fixes, the PR **merges the
  key in** and keeps every other key. This matches the bundled seeds, which carry `macArch`
  and `drm` in one file.
- **D-08:** A removal report's PR **removes only the `macArch` key**. If nothing but
  `title`/`notes` remains, the PR deletes the file. `drm` and any real fix keys stay.

### Consent & setting UX
- **D-09:** **No consent dialog.** The setting is off by default, and turning it on is the
  consent. The toggle carries the icon-only (i) help on its label line (see memory: help icon
  on title line). The help text lists exactly what is sent (appId, title, detected key/value,
  GameLib version) and what never is (user id, paths, logs).
- **D-10:** The toggle lives in **General** settings, is shown **on macOS only** (all three
  detectors run only there), and when sending, the client writes **a log line only**: the
  report and the relay's response. No toast and no sent-reports list.

### Dedup, trust & abuse
- **D-11:** A removal report that targets a `macArch: "32"` entry existing **only in bundled
  `public/fixes/`** (not on the known-fixes repo) makes the relay open an **issue** on
  known-fixes, labelled e.g. `bundled-removal` and naming the appId, because a PR there cannot
  remove it. The operator fixes it in a GameLib release.
- **D-12:** **Client skip rule (add reports):** skip when `readKnownFixes(appId, 'steam')`, the
  winning layer across local, bundled and remote, already yields the same key with the same
  value. A file that has `macArch` but no `drm` still lets a CEG report through. **Removal
  reports** are sent only when the winning entry still says `macArch: "32"`. This replaces the
  roadmap's literal "skip when a fix file for that title exists".
- **D-13:** **One report opens a PR.** The verdicts are deterministic binary scans and the
  operator reviews every PR. Repeat reports for the same appId+key+op are counted and the
  count is surfaced in the PR body (or a PR comment), but they never open new PRs.
- **D-14:** **Relay validation:** a strict payload schema; key/value limited to the tier-1
  routing pairs (`macArch`/`"32"`, `drm`/`"ceg"`); op add/remove; appId numeric; store
  `steam`. The relay checks that the appId exists via the public Steam store API and writes
  **Steam's canonical title**, never the client-sent title, so no user-controlled text lands
  in the repo or the PR. A rejected payload gets a 4xx.
- **D-15:** **Rate limiting:** per-IP (hashed and short-lived, never written to GitHub) plus a
  global daily cap on new PRs/issues, held in KV/D1. The planner sets the exact numbers
  (order of magnitude: ~10 reports/IP/hour).
- **D-16:** **Client "already sent" record:** a persisted set keyed by appId+key+op. A report
  is marked only on a relay **2xx**, and a **4xx** is also marked so it is never resent. A
  network error, timeout or 5xx is not marked; the next time the detector fires (the next
  install or launch) it retries. There is **no background retry queue**.

### Claude's Discretion
- KV vs D1 for relay state; exact rate-limit numbers; the PR title, body and labels (it
  should cite the detector and the GameLib version, and show the repeat-report count).
- Where the setting is persisted (GlobalConfig vs a dedicated store) and the exact copy of
  the label and help text.
- The client HTTP timeout and where in the detection paths the send hook sits. It must not
  block or delay install or launch.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition
- `.planning/ROADMAP.md` §"Phase 57: Opt-in known-fix sharing via relay" — the goal, payload,
  and done-when

### Known-fixes architecture and format
- `.planning/notes/per-game-compat-fixes-architecture.md` — tiers, layer resolution
  (local → bundled → remote, decision 6), and the remote allow-list rule
- `.planning/quick/261027-bqe-known-fix-macarch-32-key-routes-32-bit-m/261027-bqe-SUMMARY.md`
  — the `macArch: "32"` key, the paste-ready log line, and the contradiction warning
- `.planning/quick/261027-gtd-add-tier-1-known-fix-drm-ceg-key-and-ceg/261027-gtd-SUMMARY.md`
  — the `drm: "ceg"` key and `TIER1_ROUTING_KEYS`; seeds carry both keys in one file

### Repo conventions that bind this phase
- `Skill("gamelib-conventions")`: **the sidecar exit contract** (the report send is new
  sidecar network work and must be bounded and leave no unbounded in-flight work at stdin
  EOF), and the `<verify>` prettier rule
- `.planning/research/STEAM-STACK.md` — axios is the HTTP client for public Steam data

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/knownFixesFetcher.ts`: `GAMELIB_KNOWN_FIXES_BASE`, an injectable `KnownFixesGet`
  for tests, and a no-electron dependency rule. It's the model for the relay client module and
  its URL constant.
- `src/backend/knownFixes.ts`: `readKnownFixes`, `filterTier1KnownFixes` (the allow-list),
  `TIER1_ROUTING_KEYS`. These are the source for the shared key/value schema and the D-12
  skip check.
- `src/backend/storeManagers/steam/macArchKnownFix.ts`: `formatMacArch32KnownFixEntry`. It
  shows the exact file body today's log line proposes.
- `src/backend/storeManagers/steam/drmKnownFix.ts`: `knownFixSaysCeg`.

### Integration Points
- 32-bit verdict and contradiction: `verifyMacArchGroundTruth` in
  `src/backend/storeManagers/steam/library.ts` (~L1933; contradiction warning ~L2006–2013).
- CEG verdict: `persistBridgeDrmSignal` call sites in `src/backend/storeManagers/steam/games.ts`
  (`installBridgeGame` ~L2460, `launchBridgeGame` ~L4469).
- Setting UI: `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx`.

### Established Patterns
- Known-fix helpers never throw, and failures degrade to a log warning. The report send must
  follow the same rule.
- Remote known-fixes layout: `<store>/<appName>-<store>.json`.

</code_context>

<specifics>
## Specific Ideas

- The operator mirrors bundled seeds into known-fixes by hand today (bqe notes). D-12 counts
  bundled entries as "already known", so this phase does not do that mirroring.
- The live done-when runs on this Mac against the real deployed relay and GitHub App. The
  plan needs an operator checkpoint for account and app creation before that gate.

</specifics>

<deferred>
## Deferred Ideas

- A "Sent reports" list in Settings: considered and declined for this phase (D-10).
- Requiring N independent reports before a PR: declined (D-13). Revisit if abuse appears.
- Sharing from detectors on other platforms, or new detectors: out of scope. The setting is
  macOS only until such detectors exist.

</deferred>

---

*Phase: 57-opt-in-known-fix-sharing-via-relay*
*Context gathered: 2026-11-02*
