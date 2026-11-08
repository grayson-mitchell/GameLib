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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

/**
 * Generated files (Phase 67): hand-authored shell logic is what these tests pin. The generated
 * contract mirrors every channel name (`RustInvokeChannel::from_name` arms), which would inflate
 * dispatch-arm counts and trip negative assertions; its freshness is covered by
 * `pnpm check:ipc-contract` instead.
 */
export const GENERATED_MODULES: readonly string[] = ['ipc_contract.rs']

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
 * True when `relPath` (posix, relative to `src-tauri/src`) is kept out of the combined shell source:
 * a generated module, a pre-split sibling by exact name, or a file inside the directory that
 * sibling is later split into (`macos_epic_embed.rs` -> `macos_epic_embed/**`, Phase 71 D-11).
 */
export function isExcludedShellFile(relPath: string): boolean {
  if (GENERATED_MODULES.includes(relPath)) return true
  return PRE_SPLIT_SIBLING_MODULES.some(
    (sibling) =>
      relPath === sibling ||
      relPath.startsWith(`${sibling.replace(/\.rs$/, '')}/`)
  )
}

/**
 * Posix-relative paths (relative to `src-tauri/src`) of every shell `.rs` file
 * except the pre-split siblings: the module files sorted, then `main.rs` LAST.
 *
 * `main.rs` goes last on purpose: its `#[cfg(test)] mod tests {` is the final item of the file, and
 * several tests take "production code" as everything before the first `mod tests {`. With `main.rs`
 * last that idiom still yields every module's code plus `main.rs`'s own production code, and
 * excludes only the cargo test module -- with `main.rs` first it would silently drop every module.
 */
export function listTauriShellSourceFiles(
  repoRoot: string = DEFAULT_REPO_ROOT
): string[] {
  const all: string[] = []
  walk(join(repoRoot, SHELL_SRC_REL), '', all)
  const rest = all
    .filter((p) => p !== 'main.rs' && !isExcludedShellFile(p))
    .sort()
  return [...rest, 'main.rs']
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

const TEST_MOD_OPEN = /^mod [A-Za-z_][A-Za-z0-9_]* \{$/

/**
 * Every whole `#[cfg(test)] mod <ident> { ... }` block in `src` (Phase 71 D-10 cut rule): a
 * column-0 `#[cfg(test)]` line immediately followed by a column-0 `mod <ident> {` line, through the
 * next line that is exactly `}`. Line numbers are 0-based and inclusive.
 */
export function listRustTestModuleBlocks(
  src: string
): { name: string; startLine: number; endLine: number }[] {
  const lines = src.split('\n')
  const out: { name: string; startLine: number; endLine: number }[] = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '#[cfg(test)]') continue
    const next = lines[i + 1] ?? ''
    if (!TEST_MOD_OPEN.test(next)) continue
    let end = -1
    for (let j = i + 2; j < lines.length; j++) {
      if (lines[j] === '}') {
        end = j
        break
      }
    }
    if (end === -1) throw new Error(`unterminated test module at line ${i + 1}`)
    out.push({ name: next.split(' ')[1] ?? '', startLine: i, endLine: end })
    i = end
  }
  return out
}

/** `src` with every {@link listRustTestModuleBlocks} line range removed; nothing else changes. */
export function stripRustTestModules(src: string): string {
  const blocks = listRustTestModuleBlocks(src)
  if (blocks.length === 0) return src
  const drop = new Set<number>()
  for (const b of blocks)
    for (let l = b.startLine; l <= b.endLine; l++) drop.add(l)
  return src
    .split('\n')
    .filter((_, idx) => !drop.has(idx))
    .join('\n')
}

/**
 * The combined shell source with each file's own test modules cut BEFORE concatenation, so a
 * module that gains co-located tests cannot cut off the files after it (Phase 71 D-10).
 */
export function readTauriShellProductionSource(
  repoRoot: string = DEFAULT_REPO_ROOT
): string {
  return listTauriShellSourceFiles(repoRoot)
    .map((p) => stripRustTestModules(readTauriShellFile(p, repoRoot)))
    .join('\n')
}

/**
 * The body lines of the single column-0 `fn <fnName>(` (optionally `pub(crate)`), up to but not
 * including the next line that is exactly `}`. Throws when the fn is missing, duplicated, or its
 * body has fewer than `minLines` non-blank lines, so a repointed pin cannot pass on an empty body.
 */
export function readTopLevelFnBody(
  source: string,
  fnName: string,
  minLines = 3
): string {
  const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^(pub\\(crate\\) )?fn ${escaped}\\(`)
  const lines = source.split('\n')
  const starts: number[] = []
  lines.forEach((l, i) => {
    if (re.test(l)) starts.push(i)
  })
  if (starts.length !== 1) {
    throw new Error(
      `readTopLevelFnBody: expected exactly one definition of ${fnName}, found ${starts.length}`
    )
  }
  const start = starts[0] ?? 0
  const body: string[] = []
  let closed = false
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '}') {
      closed = true
      break
    }
    body.push(lines[i] ?? '')
  }
  if (!closed) throw new Error(`readTopLevelFnBody: ${fnName} is unterminated`)
  if (body.filter((l) => l.trim() !== '').length < minLines) {
    throw new Error(
      `readTopLevelFnBody: body of ${fnName} has fewer than ${minLines} non-blank lines`
    )
  }
  return body.join('\n')
}

/** Body of the `rpc_<wireName>` handler fn; see {@link readTopLevelFnBody} for the throws. */
export function readHandlerBody(
  source: string,
  wireName: string,
  minLines = 3
): string {
  return readTopLevelFnBody(source, `rpc_${wireName}`, minLines)
}

/**
 * Full text (tests included) of `macos_epic_embed.rs` followed by every `macos_epic_embed/**\/*.rs`
 * in sorted order. Today that is exactly the single file; the Epic embed suites read through this so
 * the Wave 4 split needs no reader edit (Phase 71 D-11).
 */
export function readMacosEpicEmbedSource(
  repoRoot: string = DEFAULT_REPO_ROOT
): string {
  const parts = [readTauriShellFile('macos_epic_embed.rs', repoRoot)]
  const dirAbs = join(repoRoot, SHELL_SRC_REL, 'macos_epic_embed')
  if (existsSync(dirAbs)) {
    const nested: string[] = []
    walk(dirAbs, 'macos_epic_embed/', nested)
    for (const p of nested.sort()) parts.push(readTauriShellFile(p, repoRoot))
  }
  return parts.join('\n')
}
