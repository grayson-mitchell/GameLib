# Phase 21: Steam Native Install - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the opaque `steam://install/{appId}` install handoff with an **in-process depot
download GameLib owns** — real progress, real errors, real recovery — surfaced through the
same DownloadManager UI every other store uses. GameLib downloads the depot over its existing
authenticated `steam-user` CM connection, writes an `appmanifest_{appId}.acf` (`StateFlags = 1026`)
into a Steam-registered library folder, and the **Steam client adopts the install**. Launch stays
on `steam://rungameid` (DRM keeps working) and **Steam owns all future updates** (delta-patching,
repair) — GameLib owns only the first install.

The technical mechanism is already de-risked end-to-end by spikes 001 (`.acf` adoption) and 002
(in-process depot download). This phase turns that proven mechanism into a shipped, setting-gated
feature.

**In scope:** first-install depot download; DownloadManager progress; failure/recovery via Steam
verify-repair handoff; install-location targeting; guided Steam-client install when missing; a
user opt-in setting; all three desktop OSes; depot-download into the Phase 17 macOS bottle.

**Out of scope:** true in-app pause/resume (needs streaming-to-disk first — deferred); GameLib
owning updates (D-2 — Steam owns updates permanently); delta-patching / integrity repair (Steam's job).
</domain>

<decisions>
## Implementation Decisions

### Progress & Control UX
- **D-01:** Route Steam downloads through the **existing DownloadManager queue** (same surface
  legendary/gogdl/nile use) — percentage, speed, ETA. No Steam-specific progress UI.
- **D-02:** V1 exposes **cancel only** — no in-app pause/resume. Resume-from-partial is untested
  (spike 002: files assembled in RAM, streaming-to-disk + persisted chunk state not built).
  True pause/resume is explicitly deferred to a later phase.
- **D-03:** The progress bar / queue size is driven by **real total bytes from the depot manifest**,
  replacing today's `pc_requirements` estimate (`getSteamInstallSize`). Real progress is the point.

### Failure & Recovery
- **D-04:** On a failed or cancelled download (chunk retries exhausted, disk error, user cancel),
  the default outcome is to **write the `1026` `.acf` over whatever landed and hand off to Steam's
  verify-and-repair pass**. Steam re-downloads/repairs the missing bytes and flips `StateFlags` to `4`
  itself. This is the one recovery path proven end-to-end (spike 001) — no GameLib-owned resume.
- **D-05:** On **app startup** with a partial/interrupted GameLib download on disk: same behavior —
  finalize into a `1026` manifest so Steam picks it up on its next launch. **Never silently
  auto-drive Steam / Steam-in-CrossOver.** (Resolves the folded todo — see Folded Todos.)
- **D-06:** A failed download presents in the queue as an **actionable error + Retry** — plain-language
  reason (e.g. "Steam servers dropped the connection", "Out of disk space") mapped from the
  downloader's error classes.
- **D-07 (reconciliation note for planning):** "Hand off to Steam" (automatic, D-04) and "Retry"
  (manual GameLib re-download, D-06) are **complementary, not conflicting** — the `1026` handoff is
  the always-on safety net; Retry re-runs GameLib's own downloader for users who want GameLib to own
  the retry. Planning reconciles the exact interaction (e.g. does Retry supersede the already-written acf).

### Install Location
- **D-08:** Write downloaded depot files into an **existing Steam-registered library folder**
  (from `config/libraryfolders.vdf`'s `steamapps/`). Required for Steam adoption — an arbitrary path
  is not adopted unless registered. Do NOT (V1) have GameLib mutate `libraryfolders.vdf` to register
  a custom path.
- **D-09:** When multiple Steam library folders/drives exist, **default sensibly (Steam's primary),
  and offer an override picker** (reuse the existing install-location modal pattern). Single-library
  users see no friction.
- **D-10:** When the **Steam client is not installed**, run a **guided install with user consent**
  (reuse Phase 17's guided-setup / consent pattern): download + run the official installer on
  Win/macOS, link the download on Linux (distro packaging is not reliably automatable). Then proceed
  to the game install. This makes "no library folder" a non-standalone case — it collapses into the
  Steam-presence gate.
- **D-11 (Claude's discretion):** Handling the "Steam installed but never run → no `libraryfolders.vdf`
  yet" edge is planning's call. Lean: **prompt the user to launch Steam once** (lower risk than GameLib
  authoring Steam config from scratch), unless research shows a fresh install reliably creates the folder.

### Rollout Scope
- **D-12:** Target **all three desktop OSes** (Windows, macOS, Linux). The download mechanism is
  OS-agnostic (spikes ran on macOS).
- **D-13:** Ship behind a **user opt-in setting**. When OFF, today's `steam://install` handoff is
  unchanged. The setting is the primary safety valve for a de-risked-but-still-young feature.
- **D-14:** When the setting is ON, GameLib's downloader handles **all** Steam installs — including
  the paths spikes did NOT validate (multi-depot games, very large / 50GB+ games). No per-case
  `steam://install` fallback. **Consequence:** the untested paths become must-validate research items
  (see below), not must-avoid.
- **D-15:** **Depot-download into the Phase 17 macOS CrossOver bottle** too — GameLib downloads the
  Windows depot into the bottle's `steamapps/` and the **bottled** Windows Steam adopts the `1026`
  `.acf`, unifying the mechanism across native and bottle installs. **Consequence:** must validate
  that bottled Steam adopts a hand-written manifest the same way native Steam does (spike 001 proved
  native only).

### MUST-VALIDATE (flagged for researcher/planner — consequences of D-14/D-15)
- **Multi-depot games** — spike 001's two-channel ownership selection was verified 11/11, but full
  multi-depot *download* was proven single-depot only (spike 002, WazHack macOS depot).
- **Very large / 50GB+ games + streaming-to-disk** — spike 002 assembled files **in RAM**; large
  games require streaming to disk (untested). This is a hard blocker for big titles, not a nicety.
- **Bottle adoption** — does the bottled Windows Steam (Phase 17) adopt a hand-written `.acf`
  identically to native Steam? Proven for native only.
- **Hard-DRM launch confirmation** — spike 001's WazHack was not confirmed hard-DRM. Confirm a
  DRM-heavy title launches after GameLib-owned install before shipping (existing "still open" item).
- **`@node-steam/vdf` 64-bit corruption** — audit existing `.acf` call sites; the library silently
  rounds 64-bit GIDs/SteamID64s, harmless today but fatal once GameLib *writes* manifests. 64-bit IDs
  must be strings end-to-end.

### Claude's Discretion
- D-11 (not-initialized Steam edge) — lean toward prompt-to-launch.
- Error-class → message mapping (D-06) — planning maps the downloader's failure modes to copy.

### Folded Todos
- **`steam-startup-download-resume-autoopens-crossover.md`** (from Phase 18 UAT test 1) — On startup,
  `SteamLibraryManager.init()` → `scanDownloadingAppIds()` → `startInstallPolling()` resumes an
  in-progress install; for a bottle game this silently drives the bottled Windows Steam and auto-opens
  Steam-in-CrossOver with no prompt ("the app did something on its own"). **Fits Phase 21 scope**
  because this phase changes *who owns the download* — GameLib now owns the depot download directly
  rather than driving the Steam client. **Resolved by D-05:** startup finalizes a partial into a
  `1026` manifest for Steam to adopt on its next launch, and **never silently auto-drives Steam /
  CrossOver.**
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Spike Findings (READ FIRST — locked, de-risked design)
- `.planning/notes/steam-depot-install-architecture.md` — Full architecture decision record.
  D-1 (launch stays with Steam), D-2 (Steam owns updates), the `.acf` adoption trick (`StateFlags 1026`),
  Option A (in-process `steam-user`) chosen / Option B (C# DepotDownloader) rejected, and the "still open" list.
- `.planning/spikes/MANIFEST.md` — The 9 non-negotiable locked requirements + spike 001/002 verdicts.
  Every "Requirements" bullet here is binding on the real build.
- `.planning/spikes/001-acf-adoption/select.mjs` — The verified two-channel package-level depot-selection
  rule (11/11 exact vs real installs). PICS-alone selection was invalidated — do not reimplement it.
- `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs` — The ~100-line reimplementation of the
  two broken `steam-user` pieces (`getManifest` filename truncation; `downloadChunk`/`downloadFile` throw).
  Use `getRawManifest()` + hand decrypt/decompress. Retry chunks across different content servers (~16%
  fail at concurrency 8). Pure-JS LZMA is sufficient (no `lzma-native`).
- `.planning/seeds/steam-native-install.md` — Original seed framing.
- `.planning/research/questions.md` §Q3, Q4, Q5 — Open questions this phase answers.

### Existing GameLib Steam code (integration surface)
- `src/backend/storeManagers/steam/games.ts` §`install()` (L527), `buildSteamProtocolUrl()` (L50) —
  the current `steam://install` path being replaced; the numeric-appId guard (T-03-01) to preserve.
- `src/backend/storeManagers/steam/library.ts` §`init()` / `scanDownloadingAppIds()` /
  `startInstallPolling()` — the ACF install poller + startup resume (folded-todo territory; D-05/D-07).
- `src/backend/storeManagers/steam/bottle.ts` §`tellBottledSteamTo{Install,...}` (L840+) — the Phase 17
  bottle install path that D-15 extends to depot-download-into-the-bottle.

### ROADMAP / requirements
- `.planning/ROADMAP.md` §"Phase 21: Steam Native Install" — phase goal. (Requirements for Phase 21 are
  NOT yet minted — they'll be created during `/gsd-plan-phase 21`.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DownloadManager queue + progress rows** (legendary/gogdl/nile pattern): the target surface for
  D-01/D-03 — Steam becomes another producer of progress events into the shared queue.
- **`buildSteamProtocolUrl()` numeric-appId guard** (`games.ts:50`, T-03-01): keep for the surviving
  `steam://rungameid` launch path.
- **`startInstallPolling()` / ACF poller** (`library.ts`): today it reconciles install state after a
  `steam://install` handoff. Phase 21 mostly supplants the download half; the poller may still confirm
  the final `StateFlags & 4` adoption. Planning reconciles poller vs in-process progress.
- **`libraryfolders.vdf` parsing** (`@node-steam/vdf`): already used to enumerate Steam library paths
  (D-08/D-09 install targeting). **CAUTION:** this same library corrupts 64-bit IDs — audit before writing.
- **Phase 17 guided-setup / consent flow** (`SteamBottleSetup.tsx` + `bottle.ts` provisioning): the
  pattern to reuse for D-10 guided Steam-client install.
- **Existing authenticated `steam-user` CM connection** (Phase 1 auth): the download reuses this session
  directly — no second logon.

### Established Patterns
- Every other store owns its own download binary and parses progress; Steam is the odd one out. Phase 21
  makes Steam consistent — but in-process (TS), not via a bundled binary.
- `steam://` verbs are constructed only through the numeric guard; never interpolate an unvalidated appId.
- Install state is never optimistically flipped (D-02 from Phase 3) — only the ACF/manifest confirms.

### Integration Points
- `SteamGame.install()` — the branch point: setting ON → in-process depot download; OFF → today's
  `steam://install`. macOS bottle-eligible + setting ON → depot-download-into-bottle (D-15).
- Install-location modal — reused for the D-09 multi-library override picker.
- Settings surface — new opt-in toggle (D-13).
- Startup `init()` resume path — rewired for D-05 (finalize to `1026`, no silent bottle drive).
</code_context>

<specifics>
## Specific Ideas

- **`StateFlags = 1026` (`UpdateRequired | UpdateStarted`), never `4`.** Claiming `FullyInstalled`
  asserts a byte-perfect download; if wrong, Steam trusts the lie and the user gets a broken game.
  `1026` makes Steam a verify-repair safety net — directly aligned with the "fewer broken installs" goal.
- **The recovery model is deliberately "delegate resume to Steam."** GameLib does not build resume;
  it writes an honest partial manifest and lets Steam's repair pass finish. One mechanism for
  failure, cancel, and startup-resume alike.
- The opt-in setting is framed as the user accepting a young (but de-risked) path — which is what
  justifies D-14 (downloader for everything, no fallback) and D-15 (bottle unification) in V1.
</specifics>

<deferred>
## Deferred Ideas

- **True in-app pause/resume** — requires streaming-to-disk + persisted per-chunk state + manifest-GID
  pinning across the gap + auth/key re-fetch. All untested (spike 002). Its own phase once streaming-to-disk lands.
- **GameLib owning updates** — permanently out of scope per architecture D-2. Steam's delta-patching is
  better than anything we'd build; revisiting this re-opens the entire build-vs-bundle decision.
- **Custom (non-Steam-registered) install locations** — would require GameLib to mutate `libraryfolders.vdf`;
  deferred (D-08 targets existing registered folders only).

### Reviewed Todos (not folded)
- **`steam-getproductinfo-appinfo-dump.md`** — a Phase 18 osarch-parser dump task, already used for its
  purpose. Not related to depot download; left deferred.

</deferred>

---

*Phase: 21-steam-native-install*
*Context gathered: 2026-07-15*
