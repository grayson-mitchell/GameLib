# Phase 64: UI to edit themes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-17
**Phase:** 64-ui-to-edit-themes
**Areas discussed:** Gallery & editor home, Nested overrides on copy, Which tokens are editable, Contrast floors in editor

---

## Gallery & editor home

| Option | Description | Selected |
|--------|-------------|----------|
| Replace dropdown | The thumbnail grid becomes the picker on Appearance | ✓ |
| Beside the dropdown | Keep the SelectField and add a Browse button | |
| Its own Themes page | A new tier-2 entry under Settings | |

| Option (editor form) | Description | Selected |
|--------|-------------|----------|
| Split pane page | Token list plus a large live thumbnail | ✓ |
| Modal dialog | Opens over the gallery | |
| Inline expand | The card expands in place | |

| Option (live apply) | Description | Selected |
|--------|-------------|----------|
| Thumbnail only, Save applies | The app changes on Save, if the theme is active | ✓ |
| Whole app live | Every edit restyles the app | |
| Live, with a revert | Live, and Cancel restores | |

Management actions (multi-select): Rename ✓, Delete ✓, Duplicate a custom ✓, Export / import ✓ → then deferred.

| Option (export/import) | Description | Selected |
|--------|-------------|----------|
| Defer to backlog | JSON-friendly shape now, feature later | ✓ |
| Include in Phase 64 | Widen scope and add an import validation surface | |

| Option (grid layout) | Description | Selected |
|--------|-------------|----------|
| Two labelled groups | Built-in / Your themes | ✓ |
| One mixed grid | Custom themes marked with a badge | |

| Option (card click) | Description | Selected |
|--------|-------------|----------|
| Applies; Duplicate on card | Customs also get Edit, Rename and Delete | ✓ |
| Selects; buttons act | Use / Duplicate / Edit buttons below the grid | |

| Option (unsaved) | Description | Selected |
|--------|-------------|----------|
| Confirm discard | Save / Discard / Cancel | ✓ |
| Autosave | Every edit persists | |
| Silently discard | | |

**Notes:** The user first selected Export/import, then deferred it after it was flagged as a new
capability.

---

## Nested overrides on copy

| Option | Description | Selected |
|--------|-------------|----------|
| Inherit from base theme | Base class on body, custom token values over it | ✓ |
| Tokenize the overrides | Refactor all 10 themes so nested rules read tokens | |
| Hybrid | Inherit, and also promote the 5 hard-coded hex values into tokens | |

| Option (base drift) | Description | Selected |
|--------|-------------|----------|
| Frozen snapshots | Copies store every resolved value | ✓ |
| Store only diffs | Copies track the base | |

---

## Which tokens are editable

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped core + Advanced | ~25 core tokens in groups, the rest in Advanced | ✓ |
| Every resolved token, grouped | ~130 tokens up front | |
| Core set only | The rest are hidden | |

| Option (var() links) | Description | Selected |
|--------|-------------|----------|
| Flatten to literals | Each token independent | ✓ |
| Keep the links | Edits cascade | |

| Option (gradients) | Description | Selected |
|--------|-------------|----------|
| Advanced only (initially worded "read-only text") | Raw CSS text | ✓ |
| Derive from a colour | | |
| Hide gradients | | |

| Option (input) | Description | Selected |
|--------|-------------|----------|
| Swatch picker + hex/rgba text | Alpha-capable picker | ✓ |
| Native input type=color + text | No alpha | |

**Notes:** The first gradient option was worded inconsistently ("read-only" label, "editable"
description). A follow-up asked again, and the user chose **editable raw text** validated with
`CSS.supports`.

---

## Contrast floors in editor

| Option | Description | Selected |
|--------|-------------|----------|
| Live warning, never block | Inline warning, Save still works | ✓ |
| Warn + confirm on Save | | |
| Block Save | | |
| No checks | | |

| Option (checks) | Description | Selected |
|--------|-------------|----------|
| Reuse the test's floors | Shared module, one source of truth | ✓ |
| Add text-vs-background too | WCAG 4.5:1 | |

---

## Claude's Discretion

Thumbnail rendering technique, the storage key and shape (inside the Phase 68/69 constraints),
the `window.setTheme` custom branch, the fallback when the active theme is deleted, the exact
core token list, and the titlebar overlay refresh.

## Deferred Ideas

- Export / import custom themes as JSON
- Turning nested component overrides into tokens
- WCAG 4.5:1 text floor
