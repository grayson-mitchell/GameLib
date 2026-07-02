# Phase 5: Branding & About Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 5-branding-about-polish
**Areas discussed:** Release-notes source, Upstream update-check, Backend string boundary, README depth

---

## Release-notes source (APP-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled static file | Ship a GameLib release-notes doc inside the app; read locally, no network, no 404 | ✓ |
| Drive off CHANGELOG.md | Repurpose repo CHANGELOG.md (stale Heroic 2.2.x) and read top entry | |
| GameLib GitHub releases | Point API at fork releases — but none are published (would 404) | |

**User's choice:** Bundled static file
**Notes:** Current code fetches Heroic's `tags/v{version}` API which 404s at GameLib 1.0.0.

### Upstream link shape

| Option | Description | Selected |
|--------|-------------|----------|
| Link line in the notes | "Built on Heroic 2.22.0 — see upstream release notes →" in body | ✓ |
| Dedicated UI element | Separate button/section in ChangelogModal | |
| Pull version from UPSTREAM.md | Derive link dynamically from package.json.upstream | |

**User's choice:** Link line in the notes

### Notes content

| Option | Description | Selected |
|--------|-------------|----------|
| GameLib-specific changes | Steam, CrossOver/Proton, rebrand + upstream link | ✓ |
| Full changelog history | All versions + mirror of Heroic changelog | |
| You decide the content | Draft at execution time from git history/roadmap | |

**User's choice:** GameLib-specific changes

---

## Upstream update-check (APP-01 / version surface)

| Option | Description | Selected |
|--------|-------------|----------|
| Suppress it entirely | Disable getLatestReleases / hide "Update Available!" | ✓ (via redirect) |
| Keep as upstream indicator | Reframe as "upstream Heroic update available" | |
| Leave as-is | Don't touch this phase | |

**User's choice:** Initially selected "add auto-update and published release" (Other). Redirected as scope creep → user agreed to **defer auto-update to its own phase and suppress the notice now**.
**Notes:** getLatestReleases compares 1.0.0 vs Heroic 2.22+ → always-on misleading notice. Auto-update + published releases recognized as a large separate capability (CI/release pipeline, code signing/notarization, electron-updater). Captured as deferred idea "Release Pipeline & Auto-Update".

### Update notification wording

| Option | Description | Selected |
|--------|-------------|----------|
| N/A — suppressed | Notification never fires if check suppressed | ✓ (moot) |
| Rebrand wording only | Keep behavior, fix text | (initially picked, now moot) |

**User's choice:** Moot — suppressed with the check.

---

## Backend string boundary (BRAND-03)

### Third-party integration identifiers

| Option | Description | Selected |
|--------|-------------|----------|
| Rebrand Discord, leave Plausible | Discord presence user-visible → rebrand; Plausible UA is analytics contract → leave | ✓ |
| Rebrand both | Change Discord AND Plausible UA | |
| Leave both | Treat both as external integration IDs | |

**User's choice:** Rebrand Discord, leave Plausible

### Filesystem paths & config keys

| Option | Description | Selected |
|--------|-------------|----------|
| Leave all — internal | Consistent with Phase 4 D-04; avoid orphaning data | |
| Change display-y paths only | Rename macOS log folder label only | |
| Rebrand all paths | Full path rebrand + migration | ✓ |

**User's choice:** Rebrand all paths (log dir, heroicInstallPath, wineCrossoverBottle default)

### Migration strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-migrate on launch | 260701-ufx pattern; move/relabel old data | |
| Clean cutover, no migration | Change defaults; leave old data in place | ✓ |
| New installs only | Dual-path lookup, no data moves | |

**User's choice:** Clean cutover, no migration
**Notes:** No published GameLib releases yet → effectively no existing GameLib-path userbase, so clean cutover is low-risk in practice.

---

## README depth (BRAND-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Accuracy + fork clarity pass | Fix typos, tighten intro, verify sections; keep Heroic dev docs | ✓ |
| Deep rebrand | Rewrite whole README top-to-bottom | |
| Minimal typo fix | Only fix obvious typos | |

**User's choice:** Accuracy + fork clarity pass

### In-README Heroic mentions

| Option | Description | Selected |
|--------|-------------|----------|
| Keep upstream attribution, rebrand instructions | Rebrand build/run/debug steps; keep "fork of Heroic" attribution + links | ✓ |
| Leave Heroic mentions | Only touch intro/install | |
| You decide per-section | Judgment at execution time | |

**User's choice:** Keep upstream attribution, rebrand instructions

---

## Claude's Discretion

- Exact bundled release-notes file format (markdown vs JSON) and on-disk location.
- Precise enumeration of which log/dialog strings count as "user-facing" under D-05.

## Deferred Ideas

- **Release Pipeline & Auto-Update** — own future phase: CI/release pipeline, signed
  artifacts to GameLib fork releases, code signing/notarization, electron-updater +
  update feed, version-compare against GameLib's own releases. Un-suppresses and
  repoints the update-check disabled in this phase.
