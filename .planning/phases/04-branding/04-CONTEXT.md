# Phase 4: Branding - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

The app currently identifies as "Heroic" throughout source code and as
`appId: com.heroicgameslauncher.hgl` (with `productName: GameLib`) in the
build config. This phase makes the app **identify and distribute as GameLib**
across three locked touchpoints:

1. Title bar / window title shows the product name (GameLib), not "Heroic"
2. About page (Settings → System Info) reflects the GameLib name
3. Package/distribution metadata (`package.json`, `electron-builder.yml`)
   correctly identifies the app as GameLib

In scope: user-visible identity + distribution metadata.
Out of scope: full visual rebrand (new logo, icons, color scheme) — that is a
v2 item (see Deferred Ideas). Internal code identifiers and legitimate Heroic
repo/API references are NOT renamed.

</domain>

<decisions>
## Implementation Decisions

### Canonical name
- **D-01:** The canonical product name is **GameLib** (one word, no "r").
  The user explicitly chose "GameLib" over "GamerLib" during discussion.
- **D-02:** `electron-builder.yml` already has `productName: GameLib` — this is
  therefore **already correct** and should be left as-is (it is not a typo).
- **D-03 [informational]:** PROJECT.md, REQUIREMENTS.md (BRAND-01), ROADMAP.md success
  criteria, and CLAUDE.md currently say "GamerLib". These are stale and must be
  reconciled to **GameLib**. Treat every "GamerLib" reference in planning docs
  and the ROADMAP success criteria as meaning "GameLib". (See Deferred Ideas
  for the doc-reconciliation follow-up — planner should decide whether to fold
  the planning-doc fixups into this phase or note them separately.)

### Rename depth
- **D-04:** **Targeted identity rename only.** Change only the user-visible
  identity and distribution metadata. Do NOT sweep all ~82 source files that
  contain the string "Heroic". Leave internal code identifiers, repo URLs, and
  Heroic Web API references untouched to avoid breaking legitimate functionality
  and to keep upstream merges clean.
- **D-05:** Concrete touchpoints to change (non-exhaustive — planner/researcher
  to confirm exact locations):
  - `package.json` → `name` ("heroic" → gamelib), `author.name`, and
    `description` (currently "An Open Source Launcher for GOG, Epic Games and
    Amazon Games" — should reflect Steam too / GameLib).
  - `electron-builder.yml` → `appId` (see D-06). `productName` already GameLib.
  - Window/title-bar display string and About page display string.

### appId / on-disk identity
- **D-06:** **Change the appId** from `com.heroicgameslauncher.hgl` to a GameLib
  identity (proposed: `com.gamelib.app` — planner may finalize the exact
  reverse-DNS form). Rationale: there are no validated users yet ("ship to
  validate"), so there is no existing userData/config to preserve, and a clean
  GameLib appId gives the app its own on-disk identity instead of masquerading
  as Heroic. Note: this relocates the userData directory, which is acceptable
  given no production user base.

### Upstream mergeability
- **D-07:** **Centralize where practical.** For in-app display text (title bar,
  About page), prefer a single display-name constant / i18n value referenced
  everywhere, so future renames and upstream merges touch one line rather than
  many. Config files (`package.json`, `electron-builder.yml`) are inherently
  single-point edits. This honors the project constraint of staying mergeable
  with Heroic upstream.

### Claude's Discretion
- Exact reverse-DNS form of the new appId (within the GameLib identity).
- Whether the centralized display name lives in an existing constants/i18n
  module vs a new one — researcher should find the existing pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` — Phase 4 "Branding" section: goal, Mode (mvp),
  and the 3 success criteria (note: criteria text says "GamerLib" → read as
  "GameLib" per D-01/D-03).
- `.planning/REQUIREMENTS.md` — BRAND-01 (note: says "GamerLib" → "GameLib").
- `.planning/PROJECT.md` — product identity & the "stay mergeable with Heroic
  upstream" constraint (note: says "GamerLib" → "GameLib").

### Files to modify (identity touchpoints)
- `package.json` — `name`, `author.name`, `description`.
- `electron-builder.yml` — `appId` (change), `productName` (already GameLib).
- `src/frontend/screens/Settings/sections/SystemInfo/software.tsx` — likely
  About / system-info display surface (confirm during research).

No external specs/ADRs beyond the planning docs above — requirements fully
captured in the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing i18n / constants infrastructure (Heroic uses i18next + a constants
  module) — researcher should locate the canonical place for a display-name
  value to satisfy the "centralize" decision (D-07).

### Established Patterns
- Distribution identity lives in `package.json` + `electron-builder.yml`
  (`appId`, `productName`, artifact name templates already reference
  `${productName}`).
- ~82 source files contain the literal "Heroic" — most are internal/legitimate
  and intentionally left untouched (D-04).

### Integration Points
- Window title is set in the Electron main process (backend) — confirm exact
  location during research.
- About surface: `src/frontend/screens/Settings/sections/SystemInfo/`.

</code_context>

<specifics>
## Specific Ideas

- Name is exactly **"GameLib"** — one word, capital G, capital L, no "r",
  no space. This spelling is authoritative over any "GamerLib" found in repo
  docs.

</specifics>

<deferred>
## Deferred Ideas

- **Full visual rebrand** (new logo, app icons, color scheme) — explicitly a v2
  item per REQUIREMENTS.md. Not in this phase.
- **Sweeping internal "Heroic" rename** across all ~82 files — intentionally out
  of scope to preserve upstream mergeability and avoid breaking Heroic
  repo/API references.
- **Reconcile planning-doc naming** — PROJECT.md, REQUIREMENTS.md, ROADMAP.md,
  and CLAUDE.md still say "GamerLib"; they should be updated to "GameLib".
  Planner to decide whether this doc fixup belongs in this phase's plans or is
  handled as a separate housekeeping pass.

</deferred>

---

*Phase: 4-Branding*
*Context gathered: 2026-06-28*
