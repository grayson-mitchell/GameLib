---
phase: 19-crossover-compatibility-index-macos
plan: 19-04
status: complete
completed: 2026-07-14
requirements: [CXIDX-04, CXIDX-05]
key_files:
  created:
    - .github/workflows/build-crossover-index.yml
  modified:
    - .gitignore
    - .github/workflows/build-base.yml
    - .github/workflows/draft-release-mac.yml
threats_addressed: [T-19-01]
---

# 19-04 Summary — CrossOver index publishing workflow

## What was built
A daily (`schedule: 0 6 * * *`) + `workflow_dispatch` GitHub Action
(`build-crossover-index.yml`) that runs `pnpm build-crossover-index` and publishes
`crossover-index.json.gz` + `collisions.json` to a rolling `crossover-index`
release tag (never `v*`, default `github.token`, `contents: write`). `build-base.yml`
was wired to fetch the bundled snapshot into `public/` before packaging;
`draft-release-mac.yml` left isolated to `v*` tags so the index tag can't trigger a
signed mac build. `.gitignore` excludes the bundled snapshot artifact.

## Commits
- `35027263` — feat(19-04): add daily CrossOver index publishing workflow (+ .gitignore)
- `6e2c9d77` — feat(19-04): fetch bundled CrossOver index snapshot before packaging

## Checkpoint resolution (human-action, blocking)
Task 3 was a `checkpoint:human-action` — enable the scheduled workflow on the fork
(GitHub disables fork schedules by default) and do a first manual publish. Completed
2026-07-14:
- Full app snapshot (leak-free, no `.planning/`) pushed to the `grayson-mitchell/GameLib`
  fork and merged to `main` so the workflow is on the default branch.
- Workflow enabled; manual `workflow_dispatch` run `29305427482` completed **success** (45s).
- `crossover-index` release published with both assets, `generatedAt: 2026-07-14T04:13:37Z`.
- Verified it did NOT trigger "Draft Release MacOSX" (no runs).

## Deviation (D-1, Rule 1 — bug found during checkpoint verification)
`gh release create --latest=false` did NOT keep the release off "Latest": GitHub forces
a repository's sole non-draft/non-prerelease release to "Latest" regardless of
`make_latest`. Remediated the live release by marking it **prerelease** (GitHub never
badges prereleases as Latest; `/releases/latest` now 404s). The app consumes the index
by its fixed `crossover-index` tag, not by "latest", so this is safe. The flag persists
because future runs skip re-creation (the release already exists).

**Follow-up (non-blocking):** harden `build-crossover-index.yml` to create the release
with `--prerelease` (instead of/in addition to `--latest=false`) so a delete+recreate
stays correct without manual intervention.

## Verification
- Workflow run: completed / success (run 29305427482).
- Release assets: `crossover-index.json.gz`, `collisions.json`.
- Not Latest: `/releases/latest` → 404 (prerelease).
- No mac build triggered.
- Payload carries `generatedAt`.
