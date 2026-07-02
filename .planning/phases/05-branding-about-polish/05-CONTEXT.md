# Phase 5: Branding & About Polish - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete GameLib's identity across the surfaces Phase 4 left untouched:
- **BRAND-02** — macOS tray tooltip
- **BRAND-03** — residual backend log/dialog/notification strings
- **BRAND-04** — README accuracy + fork clarity
- **APP-01** — version-click release-notes experience (with upstream Heroic link)

This phase clarifies HOW to finish the rebrand. It does NOT add new capabilities.
Auto-update and a published-release pipeline surfaced during discussion and are
explicitly deferred to their own future phase (see Deferred Ideas).

</domain>

<decisions>
## Implementation Decisions

### APP-01 — Release-notes source & content
- **D-01:** Release notes come from a **bundled static file** shipped inside the app.
  `getCurrentChangelog()` reads it locally — no network call, no 404. This replaces
  the current behavior that fetches Heroic's GitHub `tags/v{version}` API (which 404s
  at GameLib `1.0.0` since there are no published GameLib GitHub releases).
- **D-02:** The `1.0.0` notes content = **GameLib-specific changes** (Steam platform
  support, CrossOver/Proton integration, the Heroic→GameLib rebrand). Concise and
  honest about the fork. Not a full mirror of Heroic's changelog.
- **D-03:** The required **upstream Heroic link is a line in the notes body** (e.g.
  "Built on Heroic 2.22.0 — see upstream release notes →" linking to Heroic's v2.22.0
  GitHub release). Not a separate UI element. Upstream base version = `2.22.0` per
  `UPSTREAM.md` / `package.json.upstream.baseVersion`.

### APP-01 — Upstream update-check
- **D-04:** **Suppress** the sidebar "Update Available!" block (`getLatestReleases()`)
  AND its "A new Heroic version was released!" desktop notification. With GameLib at
  `1.0.0` vs Heroic `2.22+`, the notice is always-on and points at Heroic downloads —
  misleading. It stays suppressed until the future release-pipeline phase repoints it
  at GameLib's own releases.

### BRAND-03 — Backend string boundary
- **D-05:** Rebrand **user-facing** backend strings → "GameLib": logs, dialogs, and
  notifications (e.g. "Do you want to restart Heroic now?", the Rosetta message,
  "Checking for new Heroic Updates", GOG/zoom offline errors, config-writing log).
- **D-06:** Rebrand the **Discord Rich Presence** identifiers (`application_type:
  'Heroic Games Launcher'`, `state: 'via Heroic on ...'`) → GameLib — these are
  user-visible to other people.
- **D-07:** **Leave** the **Plausible analytics User-Agent** (`HeroicGamesLauncher/1.0`)
  as-is — it's an external analytics contract; changing it risks dropping/misrouting
  telemetry.
- **D-08:** Rebrand **all three** filesystem paths via **clean cutover, no migration**:
  - log dir label (`Heroic/logs`, macOS `Heroic Games Launcher`)
  - `heroicInstallPath` (`~/Games/Heroic` default games install dir)
  - `wineCrossoverBottle` default (`'Heroic'`)
  Rationale: there are no published GameLib releases yet, so effectively no existing
  GameLib-path userbase to migrate — clean cutover is low-risk in practice. Existing
  data at old paths is not moved.

### BRAND-04 — README
- **D-09:** **Accuracy + fork-clarity pass** (not a full rewrite): fix typos
  (`derivitive`, `Differntiators`, lowercase `gameLib`, unclosed paren), tighten the
  GameLib intro (fork relationship + Steam + CrossOver differentiators), verify the
  fork/Steam/build-install sections read correctly. Leave Heroic's dev/contribution
  docs structure intact.
- **D-10:** Rebrand **instructional** in-README "Heroic" mentions → "GameLib" (build/
  run/debug steps), but **keep explicit "fork of Heroic" attribution and upstream
  links**.

### BRAND-02 — Tray tooltip
- **D-11:** `appIcon.setToolTip('Heroic')` → `'GameLib'` in
  `src/backend/tray_icon/tray_icon.ts:34`. Clear-cut; no design decision.

### Claude's Discretion
- Exact bundled release-notes file format (markdown vs JSON) and on-disk location —
  planner/executor to choose what fits the existing `Release` type consumed by
  `ChangelogModal`.
- The precise enumeration of which log/dialog strings qualify as "user-facing" under
  D-05 — apply the boundary (user-facing = rebrand; internal identifiers/third-party
  contracts = leave) at implementation time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fork versioning & upstream relationship
- `UPSTREAM.md` — records upstream base (Heroic `2.22.0` @ `b5b5cad3`, synced
  2026-06-30) and the two-version model; source of the upstream release link for D-03.
- `package.json` → `upstream.baseVersion` / `upstream.baseCommit` — machine-readable
  upstream base; the `2.22.0` link target.

### Prior branding work (carry-forward constraints)
- `.planning/quick/260701-ufx-rebrand-heroic-gamelib-user-facing-strin/` — user-facing
  strings + config-dir migration + `heroic://`→`gamelib://` already done; internal
  identifiers deliberately left for mergeability. Migration pattern precedent.
- `.planning/quick/260701-qxr-fix-readme-install-section-rewrite-to-ho/` — README
  install section already rewritten (build-from-source, no prebuilt fork releases).
- `.planning/quick/260630-ths-decouple-fork-versioning-from-upstream-h/` — version
  decoupled to `1.0.0`; `UPSTREAM.md` created.
- Phase 4 (`.planning/phases/04-branding/`) — D-04 targeted-rename principle: don't
  sweep all "Heroic" refs; keep `heroic://` protocol, `appFolder`, i18n KEY paths.
  NOTE: Phase 5 D-08 intentionally goes beyond D-04 on filesystem paths (clean cutover).

### Requirements
- `.planning/REQUIREMENTS.md` — BRAND-02, BRAND-03, BRAND-04, APP-01 definitions.
- `.planning/ROADMAP.md` § Phase 5 — goal + success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/frontend/components/UI/ChangelogModal/index.tsx` — renders `Release` (name +
  markdown `body`) via `getCurrentChangelog()`. Keep the component; change only what
  `getCurrentChangelog` returns (local bundled notes instead of GitHub fetch).
- `src/frontend/components/UI/Sidebar/components/HeroicVersion/index.tsx` — the
  version-click surface; also owns the `getLatestReleases()` "Update Available!" block
  to suppress (D-04). i18n string already reads "GameLib Version".
- `common/types` `Release` type — the shape the modal expects; bundled notes must
  conform (`name`, `body`, optionally `html_url`/`tag_name`).

### Established Patterns
- Backend changelog/release logic lives in `src/backend/utils.ts` (`getCurrentChangelog`
  ~L832, `getLatestReleases` ~L786) with IPC handlers in `src/backend/main.ts`
  (~L694, L703). `GITHUB_API` constant at `src/backend/constants/urls.ts:6`.
- Paths defined in `src/backend/constants/paths.ts` (`heroicInstallPath` L52) and
  `src/backend/logger/paths.ts` (log dirs L16/L19/L23).
- Config-dir migration precedent exists (quick 260701-ufx) — but D-08 chooses NO
  migration for the paths in this phase.

### Integration Points
- Tray: `src/backend/tray_icon/tray_icon.ts:34` (+ its test in `__tests__/`).
- Discord presence: `src/backend/storeManagers/gog/presence.ts:43` and the
  `state: 'via Heroic on ...'` string in `src/backend/utils.ts:636`.
- Plausible UA: `src/backend/utils/plausible.ts:34` — LEAVE (D-07).

</code_context>

<specifics>
## Specific Ideas

- Upstream link should target Heroic's **v2.22.0** GitHub release specifically (the
  current fork base), sourced from `UPSTREAM.md` / `package.json.upstream`.
- Existing CHANGELOG.md at repo root holds **stale Heroic 2.2.x** content and is NOT
  referenced by the frontend — do not treat it as the release-notes source (D-01 uses
  a fresh bundled file).

</specifics>

<deferred>
## Deferred Ideas

- **Release Pipeline & Auto-Update** (its own future phase / possibly own milestone):
  CI/release pipeline publishing signed artifacts to the GameLib fork's GitHub
  releases; code signing + macOS notarization + Windows Authenticode; `electron-updater`
  wiring + update feed; version-compare against GameLib's own releases. When it lands,
  it un-suppresses and repoints the update-check disabled in D-04. Reverses the current
  "build-from-source, no prebuilt fork releases" posture.

</deferred>

---

*Phase: 5-Branding & About Polish*
*Context gathered: 2026-07-02*
