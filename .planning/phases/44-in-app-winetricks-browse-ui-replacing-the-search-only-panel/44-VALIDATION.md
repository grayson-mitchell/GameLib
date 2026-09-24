---
phase: 44
slug: in-app-winetricks-browse-ui-replacing-the-search-only-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-16
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x via `ts-jest`. Frontend project is **`testEnvironment: 'node'`, NOT jsdom** — `jest-environment-jsdom` and `react-test-renderer` are not installed |
| **Config file** | `src/frontend/jest.config.js` (project `Frontend`); root `jest.config.js` declares 5 projects: `Backend`, `Common`, `Frontend`, `Meta`, `Preload` |
| **Quick run command** | `npx jest src/frontend/components/UI/Winetricks` |
| **Full suite command** | `npx jest --selectProjects Frontend --passWithNoTests --silent` |
| **Estimated runtime** | quick ~1s · Frontend project ~7s (measured 2026-09-16: 161 suites, 2526 tests, 6.04s) |

**The harness is hand-rolled and RTL is inapplicable.** There is no DOM. Component tests invoke
function components directly and `jest.mock('react', …)` to reimplement `useState`/`useEffect`/
`useRef` over manual state-slot arrays, then walk the returned React-element object graph by
`props.className` / `type`. Any task written against `render()` / `fireEvent` / `screen.getByRole`
cannot run. The working template in this exact domain is
`src/frontend/components/UI/Winetricks/WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx`
(~280 lines) — replicate its harness, do not install jsdom.

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/frontend/components/UI/Winetricks`
- **After every plan wave:** Run `npx jest --selectProjects Frontend --passWithNoTests --silent`,
  plus `pnpm lint-translations:gamelib` for any wave touching locale catalogs
- **Before `/gsd-verify-work`:** `Frontend` **and** `Meta` projects green; `pnpm planning-gates` green
- **Max feedback latency:** ~7 seconds

> **⚠ Do NOT gate on `pnpm test:ci`.** It exits 1 at HEAD with **zero failing tests** — a leaked
> 60s `rustInvoke('store_embed_open')` timer kills Node after the green summary prints. Every
> project is green run alone. A red `test:ci` is that unowned bug, not a Phase 44 regression;
> `--selectProjects` is the honest gate. `--selectProjects` is case-sensitive and fails **open**,
> so `--passWithNoTests` is mandatory or a typo'd project name exits 0 having run nothing.

---

## Per-Task Verification Map

Task IDs are assigned by the planner. Requirement IDs are **not yet minted** — ROADMAP.md reads
`Requirements: TBD` and no `/gsd-spec-phase` was run, so the planner mints `REQ-44-XX` from the
seams below. Until then this map is keyed by CONTEXT.md decision ID, which is the binding
vocabulary the §13a decision-coverage gate actually checks.

| Task ID | Plan | Wave | Decision / Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|------------------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 1 | D-03 — every curated verb resolves against the committed parser fixture | — | N/A | unit | `npx jest winetricksListParse` | ⚠️ exists, fixture must be EXTENDED — no current fixture covers all 8 curated verbs | ⬜ pending |
| TBD | TBD | 1 | D-19 — mousedown-capture + `suppressNextClick`, keyboard activation still works | — | N/A | component | `npx jest winetricksInstallMouseRace` | ❌ W0 — ported to the new Row location, not deleted | ⬜ pending |
| TBD | TBD | 2 | D-18 — row nodes stay mounted across install **start** AND install **completion** | — | N/A | component | `npx jest remountSafety` | ❌ W0 — new file | ⬜ pending |
| TBD | TBD | 2 | D-13 — installed components appear in search results, badged | — | N/A | component | `npx jest WinetricksBrowse` | ❌ W0 — new file | ⬜ pending |
| TBD | TBD | 2 | D-04 — expand/collapse resets to Default on every dialog open | — | N/A | component | `npx jest WinetricksBrowse` | ❌ W0 — new file | ⬜ pending |
| TBD | TBD | 2 | C-4 / UI-SPEC — the 8 unattended-incapable verbs never render an Install button | — | N/A | component | `npx jest WinetricksBrowse` | ❌ W0 — new file | ⬜ pending |
| TBD | TBD | 3 | D-08/D-09/D-10 — 11 keys × 48 locales pass catalog parity | — | N/A | integration (repo gate) | `pnpm lint-translations:gamelib && npx jest gamelibCatalogParity` | ✅ gate exists; keys do not | ⬜ pending |
| TBD | TBD | 3 | D-20 — orphaned `translation.json` `winetricks.*` keys removed, no surviving consumers | — | N/A | grep assertion | `grep -rn "winetricks\.\(search\|no-components\|installed\|nothingYet\|installing\)" src/` → 0 hits | N/A — grep-based | ⬜ pending |
| TBD | TBD | 3 | D-24 — no undefined CSS custom properties introduced | — | N/A | repo gate | the existing undefined-custom-property gate | ✅ exists | ⬜ pending |
| TBD | TBD | final | D-22 — live gate, both measurements | — | N/A | **manual-only** | N/A — see Manual-Only Verifications | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**D-18's proof is not the test passing — it is the test failing when reverted.** Land the test,
revert the `loadingInstalled` fix, confirm RED for **both** triggers independently, restore. `35-25`
closed only half of this defect precisely because only half was tested; a remount test that
exercises `installing` but not `loadingInstalled` would have been green against the bug this phase
exists to kill.

---

## Wave 0 Requirements

> **DELIBERATELY LEFT `draft` by the 2026-09-25 sweep (quick `260925-ghg`) — this is correct, not
> an oversight.** Phase 44 is **⛔ SUPERSEDED by Phase 45** (2026-09-18) at 7 of 8 plans, with
> `44-08` abandoned rather than finished, and it carries named unfixed residue: contrast defect 9
> ships at 3.50:1 in nord light, and three D-24 row states were never reached. Advancing this
> document to `approved` would assert a validation contract was satisfied for a screen that was
> deliberately retired mid-gate. The surviving seams (`src/common/winetricks/{verbs,
> deriveRowState}.ts`) carried into Phase 45 and are validated there, not here.

- [ ] `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx` —
      search → flat list, zero-result, D-13 installed-in-search, D-04 reset-on-open, C-4 Needs-GUI routing
- [ ] `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx` —
      D-18's both-triggers mount-identity assertion with its revert-to-red proof
- [ ] `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx` —
      D-19 port from `WinetricksSearch/__tests__/`; carry the harness and mock scaffolding across intact
- [ ] `src/backend/tools/__tests__/winetricksListParse.test.ts` — **extend** the committed fixture
      to a realistic multi-category chunk covering all 8 D-01 curated verbs (current fixtures are
      minimal synthetic single-line cases and cannot support D-03's assertion)
- [ ] **No framework install.** `ts-jest` + Jest 29 are configured; replicate the hand-rolled
      hook-mock harness. Adding `jest-environment-jsdom` is out of scope and would fork the
      Frontend project's deliberate no-DOM constraint.

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| A real mouse-click install runs to completion with the browse list staying mounted through **both** the install-start and install-completion transitions | D-22.1 | Every prior defect on this exact surface — mouse-dead Install, the remount race, the hover highlight — was invisible to the suite and only appeared under a real pointer in a real WKWebView. The node-environment harness has no pointer and no compositor. | Launch the packaged app, open a Wine game's Winetricks panel, browse (do not search) to a category, click Install on a small verb with a real mouse, and watch the list through completion. Record whether the list region ever blanks. |
| The Installed badge appears **in place** on that same row afterwards, with no list reflow and no scroll jump | D-22.2 | Proves `listInstalled()`'s refetch renders as a state change, not a remount. Reflow and scroll position are not observable without layout. | Note the scroll offset before install completes; compare after the badge appears. Pixel-measure rather than eyeballing. |
| Theme spot-check in one dark and one light theme | D-24 | The undefined-custom-property gate cannot see a contrast failure. This repo has shipped a 1.46:1 pairing every gate passed. | Open the panel in one dark and one light theme; confirm every state's colour is paired with an icon or text (C-3) and measure the badge/status contrast rather than judging it. |

**Explicitly NOT live-gated (D-23):** Needs-GUI routing for the 8 unattended-incapable verbs, and
pointer-driven browse/search. These rest on component tests alone. Recorded here so no later
document claims live coverage this phase does not have.

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a declared Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers every ❌ MISSING reference above
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `--passWithNoTests` present on every `--selectProjects` invocation
- [ ] D-18's revert-to-red proof recorded with the verbatim failure output, both triggers
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
