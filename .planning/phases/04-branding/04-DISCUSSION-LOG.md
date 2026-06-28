# Phase 4: Branding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-28
**Phase:** 4-Branding
**Areas discussed:** Rename depth, appId / user data, Canonical name, Upstream merge

---

## Canonical name

| Option | Description | Selected |
|--------|-------------|----------|
| GamerLib | Matches PROJECT.md / REQUIREMENTS (BRAND-01). Treat 'GameLib' in electron-builder.yml as a typo. | |
| GameLib | Keep the name already in electron-builder.yml; update planning docs to match. | ✓ |

**User's choice:** GameLib — and clarified: "change to GameLib (I dropped the 's')", i.e. one word, no "r".
**Notes:** This reverses the apparent default. The planning docs (PROJECT.md, REQUIREMENTS, ROADMAP success criteria, CLAUDE.md) say "GamerLib" and are now stale; electron-builder.yml's `productName: GameLib` turns out to be correct. Reconciling the docs is logged as a deferred follow-up.

---

## Rename depth

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted identity only | Change only user-visible identity + distribution metadata; leave internal code, repo URLs, Heroic API refs. | ✓ |
| Full sweep | Replace 'Heroic' across all 82 files. High merge-conflict and breakage risk. | |

**User's choice:** Targeted identity only (recommended).
**Notes:** Honors the "stay mergeable with Heroic upstream" constraint.

---

## appId / user data

| Option | Description | Selected |
|--------|-------------|----------|
| Change to GameLib identity | Set appId to a GameLib reverse-DNS (e.g. com.gamelib.app). No validated users to preserve. | ✓ |
| Keep com.heroicgameslauncher.hgl | Preserve on-disk identity / existing local config. | |

**User's choice:** Change to GameLib identity ("change to GameLib (I dropped the 's')").
**Notes:** No production user base ("ship to validate"), so relocating the userData dir is acceptable. Exact reverse-DNS form left to planner.

---

## Upstream merge

| Option | Description | Selected |
|--------|-------------|----------|
| Centralize where practical | Single display-name constant / i18n value for in-app text; config files are single-point edits. | ✓ |
| Edit in place | Change literal strings wherever they appear; more merge conflicts. | |

**User's choice:** Centralize where practical (recommended).

---

## Claude's Discretion

- Exact reverse-DNS form of the new appId (within GameLib identity).
- Which existing constants/i18n module hosts the centralized display name.

## Deferred Ideas

- Full visual rebrand (logo, icons, colors) — v2.
- Sweeping internal "Heroic" rename across all ~82 files — out of scope.
- Reconcile planning-doc naming ("GamerLib" → "GameLib") in PROJECT.md,
  REQUIREMENTS.md, ROADMAP.md, CLAUDE.md.
