**These `<!-- GSD:*-start source:... -->` regions are hand-maintained.** The `source:` marker is
historical provenance, not live generation. No tool reads or rewrites these regions today —
`gsd-sdk` contains no reference to the markers and `get-shit-done-cc` is not installed — and the
conventions below were hand-written straight into this file (`c33f98771`, `d7d021a05`,
`67ed8767b`). Edit the regions here, directly; content written into a named source file will not
propagate. A region marked `source:hand-maintained` has no source document at all.

<!-- GSD:project-start source:.planning/PROJECT.md -->

## Project

**GameLib**

GameLib is a public fork of Heroic Games Launcher that adds Steam as a first-class supported platform. Where Heroic covers Epic Games, GOG, and Amazon Games, GameLib extends this with full Steam library integration — browse, install, and launch Steam games from the same interface. It targets gamers who want a single unified launcher instead of switching between clients.

**Core Value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

### Constraints

- **Tech stack**: React + TypeScript on a Rust/Tauri shell. GameLib is an independent project, not a fork tracking Heroic — upstream mergeability is not a constraint. Do not raise deviation from upstream Heroic as a concern or caveat.
- **Compatibility**: Linux, macOS, Windows (same as Heroic)
- **Steam auth**: Approach TBD during research phase — Steamworks SDK, steam-user npm package, or browser-based login
<!-- GSD:project-end -->

<!-- GSD:stack-start source:.planning/research/STEAM-STACK.md -->

## Technology Stack (Steam)

Decided during the research phase and **frozen**. The full decision record — pinned versions, the
rejected-alternatives table with reasons, confidence ratings and sources — is in
`.planning/research/STEAM-STACK.md`. Read it when you change Steam auth, library-data or launch
plumbing; otherwise you do not need it.

The short version: **steam-session** for auth (QR / credentials / SteamGuard, yielding a refresh
token), **steam-user** to reach the CM network and call `getOwnedApps()`, **@node-steam/vdf** to
read local `libraryfolders.vdf` and `appmanifest_*.acf`, **axios** for public store metadata and
artwork, and `shell.openExternal("steam://rungameid/{appId}")` to launch.

`steamworks.js`, `greenworks`, `electron-steam-openid`, Steam partner OAuth and browser-based
Steam login were each evaluated and **rejected** — mostly because they require a Valve-assigned
AppId, are abandoned, or only yield a SteamID64 with no library access. `STEAM-STACK.md` records
the reason for each and they still hold, so re-propose one only after reading it.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:hand-maintained -->

## Conventions

Five conventions govern work in this repo. **Each row below is a trigger, not the rule itself.**
The full text — rationale, measurements, and the incident history that makes each one stick —
is in `Skill("gamelib-conventions")`. Load it before acting on any of these. Three of the five
are discipline-only: no gate can catch a violation, so the text is the only thing standing
between you and the defect it was written for.

| When you are about to…                                         | The rule                                                                                                                                                                                                                  | Enforced by                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| create a file in `.planning/todos/pending/`                    | Carry all three of `severity:`, `platform:`, `ready:` — bare, lowercase, exact, in that order. The `/gsd-add-todo` template omits them; add them by hand. Never widen the gate's vocabulary to admit a value that failed. | `pnpm planning-gates` (CI)                                                  |
| spawn a child process from `src/` or `meta/`                   | Use `createFakeHomeProfile()`; never a hand-rolled `env` literal. Isolated by default, **plus** a named, justified real-profile arm where a defect only arms under a populated profile.                                   | `fakeHomeIsolation.test.ts` (in-repo spawn sites only)                      |
| create a timer, watcher, socket or child handle in the sidecar | `unref()` it, **and** leave no unbounded in-flight work at boot — `unref()` is the wrong tool for that second half. Exit is by event-loop drain at stdin EOF.                                                             | almost nothing — `smoke:sidecar` misses slow exit                           |
| edit an item in a `*-UAT.md` file                              | `### N.` heading at column 0, `expected:` inline, and `result:` opening with a bare or bracketed status word. Prose may follow the word, never precede it.                                                                | nothing in CI                                                               |
| write a task's `<verify>` block                                | Run `npx prettier --check` over the exact paths written — scoped, never `.`. Check with `--file-info` first; if every path is prettier-ignored, say so and omit the check rather than carry a green that proves nothing.  | `.husky/pre-commit` (backstop; skipped by rebase/cherry-pick/`--no-verify`) |

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:.planning/research/ARCHITECTURE.md -->

## Architecture

No whole-app architecture is mapped. That is the honest state, not a placeholder awaiting a tool.

The repo's one architecture study is `.planning/research/ARCHITECTURE.md` (391 lines, researched
2026-07-05) — read it, but read it in scope. It is titled _Architecture Research — Humble Bundle
Integration_ and describes a key-management overlay on an **Electron** launcher. It predates the
Rust/Tauri shell, which landed 2026-07-20 in `83dc57a76`, by fifteen days: it mentions Electron
13 times and Tauri 0. Treat its process, IPC and packaging model as pre-rearchitecture.

For current structure, orient with `graphify query` (see the graphify section at the end of this
file) and follow the patterns already in the codebase.

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:.claude/skills/ -->

## Project Skills

- **Spike findings for GameLib** (implementation patterns, constraints, gotchas for Steam native install + macOS native Steam bridge + the Rust/Tauri rearchitecture and its login-webview/cookie surface + login-window UX on macOS: modal attachment, Keychain autofill channels, and the local OAuth test store) → `Skill("spike-findings-gamelib")`
- **Sketch findings for GameLib** (validated design decisions, CSS patterns, visual direction: app-level card/folder tabs replacing the sidebar, the two-tier nav structure, the 78px macOS traffic-light inset, multi-theme survival rules, and the Games library filter panel) → `Skill("sketch-findings-gamelib")`
- **GameLib repo conventions** (the full text of the five rules indexed under Conventions above: todo triage frontmatter, fake-HOME isolation, the sidecar exit contract, UAT item shape, and the `<verify>` formatter check — with the measurements and incidents behind each) → `Skill("gamelib-conventions")`
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.

<!-- GSD:profile-end -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- **Do not read graphify-out/GRAPH_REPORT.md into context.** It is ~324,000 tokens (1.3 MB) — a
  third of a 1M window — and once read it is re-billed on every later turn of the session.
  `graphify-out/graph.json` is far worse at ~13.4M tokens; never open it. If `query`/`path`/
  `explain` genuinely do not surface enough, read a **scoped slice** (`grep`/`sed -n` for the
  section you need), or say the graph cannot answer it — do not fall back to the whole report.
- `graphify-out/wiki/index.md` does not currently exist, so the wiki rule above is a dead branch;
  check before relying on it.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
