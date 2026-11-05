/**
 * The single shared reader for source-text tests over the Rust shell
 * (`src-tauri/src/**`).
 *
 * `src-tauri/src/main.rs` was split into sibling module files (quick task
 * 261106-ab1). Source-text tests historically read `main.rs` alone; reading it
 * after the split would make every needle that moved silently disappear, and
 * every negative (absence) assertion pass vacuously. This helper discovers all
 * shell `.rs` files automatically, so a future module is in scope without
 * editing this file.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The sibling modules that existed BEFORE the split. They are excluded from the
 * concatenated shell source: tests historically read `main.rs` only, and
 * including these would change counts and negative assertions that were written
 * against `main.rs` alone.
 */
export const PRE_SPLIT_SIBLING_MODULES: readonly string[] = [
  'epic_embed_js_dialog.rs',
  'epic_embed_state.rs',
  'macos_epic_embed.rs',
  'macos_native_gamepad.rs',
  'macos_notifications.rs',
  'native_gamepad_shape.rs',
  'notification_backend.rs',
  'store_embed_handoff_policy.rs'
]

const DEFAULT_REPO_ROOT = join(__dirname, '..', '..', '..')
const SHELL_SRC_REL = 'src-tauri/src'

function walk(dirAbs: string, relPrefix: string, out: string[]): void {
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const rel = `${relPrefix}${entry.name}`
    if (entry.isDirectory()) {
      walk(join(dirAbs, entry.name), `${rel}/`, out)
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      out.push(rel)
    }
  }
}

/**
 * Posix-relative paths (relative to `src-tauri/src`) of every shell `.rs` file
 * except the pre-split siblings: `main.rs` first, then the rest sorted.
 */
export function listTauriShellSourceFiles(
  repoRoot: string = DEFAULT_REPO_ROOT
): string[] {
  const all: string[] = []
  walk(join(repoRoot, SHELL_SRC_REL), '', all)
  const rest = all
    .filter((p) => p !== 'main.rs' && !PRE_SPLIT_SIBLING_MODULES.includes(p))
    .sort()
  return ['main.rs', ...rest]
}

/** One shell file's text (path relative to `src-tauri/src`). */
export function readTauriShellFile(
  relPath: string,
  repoRoot: string = DEFAULT_REPO_ROOT
): string {
  return readFileSync(join(repoRoot, SHELL_SRC_REL, relPath), 'utf-8')
}

/**
 * Every shell source file concatenated with a bare newline (no marker text — a
 * separator comment could itself match a needle).
 */
export function readTauriShellSource(
  repoRoot: string = DEFAULT_REPO_ROOT
): string {
  return listTauriShellSourceFiles(repoRoot)
    .map((p) => readTauriShellFile(p, repoRoot))
    .join('\n')
}
