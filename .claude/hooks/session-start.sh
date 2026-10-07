#!/bin/bash
# SessionStart hook for Claude Code cloud sessions: install JS dependencies so jest,
# `pnpm codecheck`, `pnpm lint` and `pnpm planning-gates` work in a fresh container.
# Local machines are left alone -- they manage their own node_modules.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Idempotent: a cached container with an up-to-date node_modules makes this a fast no-op.
# --frozen-lockfile keeps the session on exactly what pnpm-lock.yaml pins.
pnpm install --frozen-lockfile
