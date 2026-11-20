---
phase: quick-260714-gnc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .graphifyignore
autonomous: true
requirements: [GNC-01]

must_haves:
  truths:
    - "graphify's scanner skips .planning/, scratchpad/, graphify-out/ and .claude/ when building the graph"
    - "README.md and CHANGELOG.md remain indexable as document nodes"
    - "No graph artifact, skill, or existing config file is changed by this task"
  artifacts:
    - path: ".graphifyignore"
      provides: "gitignore-syntax exclusion patterns scoping the knowledge graph to code + top-level docs"
      contains: ".planning/"
      min_lines: 8
  key_links:
    - from: ".graphifyignore"
      to: "graphify detect._load_graphifyignore"
      via: "repo-root ignore file merged after .gitignore (last-match-wins)"
      pattern: "^\\.planning/$"
---

<objective>
Create `.graphifyignore` at the repo root so the graphify knowledge graph indexes code plus top-level project docs only.

Purpose: The graph is 9,264 nodes, of which 5,541 are markdown document nodes. `.planning/` alone contributes 5,323 — outweighing `src/` (3,269) by 1.6:1. graphify refuses to render its HTML visualization above 5,000 nodes, and the planning-doc noise pollutes `graphify query` results.

Output: One new file, `.graphifyignore`. Nothing else changes. The graph is NOT rebuilt in this task — the user rebuilds separately.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

## Pre-researched mechanism — do NOT re-verify, do NOT run graphify

Already confirmed in the installed graphify source at
`/Users/graysonmitchell/.local/pipx/venvs/graphifyy/lib/python3.14/site-packages/graphify/`:

- `detect.py:1146` — `detect()` calls `_load_graphifyignore(root)`. `detect()` is the shared scanner used by BOTH `graphify extract` and `graphify update`, so `.graphifyignore` is honored by `/gsd-graphify build` (which runs `graphify update .`) with no skill patching. This is why the ignore file was chosen over the `--code-only` / `--exclude` CLI flags, which exist only on `extract`.
- `detect.py:882` — merges `.gitignore` and `.graphifyignore`, reading gitignore first and graphifyignore last, so graphifyignore patterns win on conflict via last-match-wins.
- `detect.py:757` — patterns follow the full gitignore spec, including `!` negations and per-directory anchoring.

## Hook note

A graphify PreToolUse hook in this repo demands `graphify query` before reading source files. That rule is for CODE exploration. This task touches no source code — it creates a single dotfile at the repo root. Do not run graphify queries. Do not rebuild the graph.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create .graphifyignore at repo root</name>
  <files>.graphifyignore</files>
  <action>
Create `/Users/graysonmitchell/Projects/GameLib/.graphifyignore` using the Write tool (never a heredoc).

Contents, in this order:

1. A short comment header (lines starting with `#`) stating that this file scopes the graphify knowledge graph to the codebase plus top-level project docs, and that it uses gitignore syntax merged after `.gitignore`.
2. Four directory-exclusion patterns, each with a trailing slash so only directories match, each preceded by a one-line `#` comment naming what it is:
   - `.planning/` — GSD planning artifacts (the dominant node source)
   - `scratchpad/` — throwaway working files
   - `graphify-out/` — graphify's own output, must not index itself
   - `.claude/` — agent config, not project code

Hard constraints:
- Do NOT add any blanket `*.md` or `**/*.md` pattern. That would strip `README.md` and `CHANGELOG.md`, which MUST stay indexed as doc nodes.
- Do NOT add `!README.md` / `!CHANGELOG.md` negations — they are unnecessary (nothing excludes them) and add noise.
- Do NOT exclude `doc/`, `src/`, `e2e/`, or any other code/doc directory.
- Do NOT modify `.gitignore`, `CLAUDE.md`, the `gsd-graphify` skill, or any file under `graphify-out/`. `.graphifyignore` is the ONLY file created or changed.
- Do NOT run `graphify update`, `graphify extract`, `graphify query`, or `/gsd-graphify build`. Rebuilding is explicitly out of scope; the user does it separately.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -f .graphifyignore && for p in '\.planning/' 'scratchpad/' 'graphify-out/' '\.claude/'; do grep -v '^#' .graphifyignore | grep -qE "^${p}\$" || { echo "MISSING pattern: $p"; exit 1; }; done && ! grep -v '^#' .graphifyignore | grep -qE '\*\.md' && ! grep -v '^#' .graphifyignore | grep -qiE '(readme|changelog)' && grep -qc '^#' .graphifyignore && echo GATE_PASS</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test "$(git status --porcelain -- .gitignore CLAUDE.md graphify-out .claude/skills | wc -l | tr -d ' ')" = "0" && echo NO_COLLATERAL_CHANGES</automated>
  </verify>
  <done>`.graphifyignore` exists at the repo root with a comment header and exactly the four directory patterns `.planning/`, `scratchpad/`, `graphify-out/`, `.claude/`; it contains no `*.md` glob and no README/CHANGELOG reference; `.gitignore`, `CLAUDE.md`, the skill, and graph artifacts are untouched; the graph was not rebuilt.</done>
</task>

</tasks>

<verification>
1. Both automated gates in Task 1 print `GATE_PASS` and `NO_COLLATERAL_CHANGES`.
2. `git status --porcelain` shows `.graphifyignore` as the only newly added tracked-intent file from this task (pre-existing untracked/modified entries from earlier work may remain).
3. No graphify command was executed during the plan.
</verification>

<success_criteria>
- `.graphifyignore` exists at `/Users/graysonmitchell/Projects/GameLib/.graphifyignore`.
- It excludes `.planning/`, `scratchpad/`, `graphify-out/`, `.claude/` and nothing else.
- `README.md` and `CHANGELOG.md` are not excluded (no `*.md` pattern present).
- Exactly one file added; no other file in the repo modified.
- Graph not rebuilt (informational expectation, unverified here: next rebuild drops ~9,264 → ~3,900 nodes, under the 5,000-node viz limit).
</success_criteria>

<output>
Create `.planning/quick/260714-gnc-add-graphifyignore-to-scope-knowledge-gr/260714-gnc-SUMMARY.md` when done.
</output>
