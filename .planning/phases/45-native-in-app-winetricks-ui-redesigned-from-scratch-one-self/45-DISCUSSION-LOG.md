# Phase 45: Native in-app Winetricks UI redesigned from scratch - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-10
**Phase:** 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
**Areas discussed:** Where it lives, Novice-first IA, Batch apply, Progress & hatch

---

## Where it lives

### Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Full-height settings section | Replaces the Tools-card button with a section inside per-game Settings; one scroll container, room for descriptions and a selection tray | ✓ |
| Keep a modal dialog | Stay inside the MUI Dialog opened from the Tools card; smallest blast radius, list capped ~50vh | |
| Dedicated route / page | `/winetricks/:runner/:appName` reachable from the game page and Settings; most room, new routing | |

**User's choice:** Full-height settings section.

### Entry point

The first framing (Settings Wine tab only / + game-page shortcut / + launch-failure prompt) was
declined before answering; the operator asked to clarify and proposed a third shape: a separate
tab in the per-game Settings strip. Reformulated:

| Option | Description | Selected |
|--------|-------------|----------|
| Own `Winetricks` tab beside Wine | New tab in the strip, shown only where the Wine tab shows; reads like opening the Winetricks app | ✓ |
| Inline section inside the Wine tab | Section at the bottom of the Wine tab below twelve toggles | |

**User's choice:** Own `Winetricks` tab.
**Notes:** Operator: "there is enough complexity in the screen to warrant its own tab"; making it
"as similar to the Winetricks app" by giving it its own tab is easier.

### Tab layout

| Option | Description | Selected |
|--------|-------------|----------|
| Single column + sticky action bar | Groups stack in one scroll; bottom bar shows `N selected · Apply` and run progress | ✓ |
| Two panes: catalog left, basket right | Selection list and focused-item description on the right; collapses below ~900px | |

**User's choice:** Single column + sticky action bar (preview mockup accepted).

### Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror today's Tools gate | Real game only, not Windows, not CrossOver | ✓ |
| Also under CrossOver bottles | Untested path | |
| Show always, explain when unusable | More empty-state copy to translate | |

**User's choice:** Mirror today's Tools gate.

---

## Novice-first IA

### Grouping

| Option | Description | Selected |
|--------|-------------|----------|
| Suggested + task groups + Everything else | Per-game suggestions on top, hand-named plain-language groups, collapsed long tail with search | ✓ |
| Suggested + upstream's 5 categories, renamed | Zero curation debt; 328 undifferentiated rows under one heading | |
| Suggested + flat searchable catalog | Simplest; novice gets nothing from the lower half | |

**User's choice:** Suggested + task groups + Everything else.

### Descriptions

| Option | Description | Selected |
|--------|-------------|----------|
| Family-level descriptions | ~12–15 prefix-keyed sentences, ~700 locale fills | ✓ |
| Per-verb descriptions for the curated tier | ~30–40 strings, ~1,900 fills | |
| Upstream metadata only | Title + publisher + year; the text already called rubbish | |

**User's choice:** Family-level descriptions.

### Odd verbs

| Option | Description | Selected |
|--------|-------------|----------|
| Hide apps, benchmarks, destructive settings | Keep only install-shaped settings verbs | ✓ |
| Keep all under Everything else, badge the destructive | Complete; bottle-wiper one search away | |
| Hide them all; components only | Loses fontsmooth/csmt/videomemorysize | |

**User's choice:** Hide apps, benchmarks, destructive settings.

### Suggested fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to the curated 8 | Group never empty; game-specific hits first | ✓ |
| Two groups: game-specific, then curated | Honest provenance, one more heading | |
| Game-specific only, empty otherwise | Group hides itself | |

**User's choice:** Fall back to the curated 8.

---

## Batch apply

### Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox to select; installed rows lose the checkbox | Installed slot shows check icon + `Installed`; tick only ever means will-install | ✓ |
| Checkbox always; installed pre-ticked and locked | Upstream's overloaded checkbox | |
| Tap-to-toggle rows, no checkbox glyph | Highlight as the only signal | |

**User's choice:** Checkbox to select; installed rows lose the checkbox.

### Execution

| Option | Description | Selected |
|--------|-------------|----------|
| GameLib-driven queue, one verb per invocation | Reuse `Winetricks.install` per verb like `installFixes` | ✓ |
| One `winetricks -q a b c` invocation | Fastest; attribution needs output parsing | |

**User's choice:** GameLib-driven queue.

### Failure

| Option | Description | Selected |
|--------|-------------|----------|
| Continue the rest, report per verb | Failed row gets Retry; bar summarises | ✓ |
| Stop at the first failure | Remaining stay selected | |
| Stop only for dependent verbs | Needs unreliable dependency metadata | |

**User's choice:** Continue the rest, report per verb.

### In flight

| Option | Description | Selected |
|--------|-------------|----------|
| Lock selection until the run finishes | Cancel-remaining control | ✓ |
| Allow appending to the running queue | Needs a backend queue with a `queued` state | |

**User's choice:** Lock selection until the run finishes.

---

## Progress & hatch

### Progress

| Option | Description | Selected |
|--------|-------------|----------|
| Per-row phase + bar, log behind a disclosure | `Downloading 42%` / `Installing…` / `Done`; `Show details` holds the classified log | ✓ |
| Bar-only, no log anywhere | Nothing to paste into a bug report | |
| Classified log always visible | The pane the operator called rubbish | |

**User's choice:** Per-row phase + bar, log behind a disclosure.

### Warnings

| Option | Description | Selected |
|--------|-------------|----------|
| Persistent non-red banner at the top of the tab | GPTK notice copy says expected and harmless; missing deps say what to install | ✓ |
| Inline in the per-row details only | User never learns why installs fail | |
| Per-run dismissible notice in the sticky bar | GPTK notice would nag every run | |

**User's choice:** Persistent non-red banner.

### Hatch

| Option | Description | Selected |
|--------|-------------|----------|
| Remove the hatch; derive the exclusion from the script | Delete button and `-q --gui`; no-install set from `w_download_manual`, tested against the pinned script; live arm `gdiplus_winxp` | ✓ |
| Remove the hatch; keep the hand list | Carries a list that matches no derivable signal | |
| Keep a hidden advanced hatch | Must also fix the 5-second self-dismissing warning | |

**User's choice:** Remove the hatch; derive the exclusion from the script.

### Leaving

| Option | Description | Selected |
|--------|-------------|----------|
| Run continues; tab re-syncs on return | Reuse game-page `Installing Winetricks Packages` status | ✓ |
| Warn before leaving, run continues | A nag Settings has nowhere else | |
| Cancel remaining on leave | Surprising | |

**User's choice:** Run continues; tab re-syncs on return.

---

## Claude's Discretion

Search placement and threshold inside Everything else; exact task-group names and membership;
exact family-prefix table; the queue's IPC shape (backend-resident); Cancel-remaining semantics for
the in-flight verb (default: finish); whether `conflicts` are surfaced at Apply; module layout and
how the `src/common/winetricks/` seams are extended.

## Deferred Ideas

Appending to a running queue; a game-page shortcut; a launch-failure prompt into the tab;
CrossOver bottles; always-visible tab with explanations; dependency-aware stop on failure;
Winecfg / Run EXE moving into the tab; per-verb descriptions beyond family level.
