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

export type CfgTestClass = 'test' | 'other' | 'ambiguous'

/**
 * Classify one column-0 attribute line. 'test' = exactly `#[cfg(test)]`, or `#[cfg(all(...))]` whose
 * top-level comma-separated arguments include the bare token `test`. 'ambiguous' = a `#[cfg(` line that
 * mentions the word `test` in any other shape (any/not/nested). 'other' = anything else.
 * Must match Rust `classify_cfg_test_attr` in src-tauri/src/main.rs's test module.
 */
export function classifyCfgTestAttr(line: string): CfgTestClass {
  if (!line.startsWith('#[cfg(')) return 'other'
  if (line === '#[cfg(test)]') return 'test'
  if (!/\btest\b/.test(line)) return 'other'
  const m = /^#\[cfg\(all\((.*)\)\)\]$/.exec(line)
  if (!m) return 'ambiguous'
  const inner = m[1] ?? ''
  const args: string[] = []
  let depth = 0
  let inStr = false
  let cur = ''
  for (const c of inner) {
    if (c === '"') inStr = !inStr
    if (!inStr) {
      if (c === '(') depth++
      else if (c === ')') depth--
      else if (c === ',' && depth === 0) {
        args.push(cur.trim())
        cur = ''
        continue
      }
    }
    cur += c
  }
  args.push(cur.trim())
  return args.includes('test') ? 'test' : 'ambiguous'
}

/**
 * Every whole test-gated `mod <ident> { ... }` block in `src` (Phase 71 D-10 cut rule): a column-0
 * `mod <ident> {` line preceded by a contiguous run of column-0 `#[...]` lines, at least one of which
 * is a recognised test cfg ({@link classifyCfgTestAttr}), through the next line that is exactly `}`.
 * The range starts at the FIRST attribute line of the run. A cfg attribute that mentions `test` in an
 * unrecognised shape throws (fail closed). Line numbers are 0-based and inclusive. Must match Rust
 * `cut_test_modules`.
 */
export function listRustTestModuleBlocks(
  src: string
): { name: string; startLine: number; endLine: number }[] {
  const lines = src.split('\n')
  const out: { name: string; startLine: number; endLine: number }[] = []
  let skipUntil = -1
  for (let i = 0; i < lines.length; i++) {
    if (i <= skipUntil) continue
    const line = lines[i] ?? ''
    if (!TEST_MOD_OPEN.test(line)) continue
    let start = i
    while (start > 0 && (lines[start - 1] ?? '').startsWith('#[')) start--
    let isTest = false
    for (let k = start; k < i; k++) {
      const cls = classifyCfgTestAttr(lines[k] ?? '')
      if (cls === 'ambiguous')
        throw new Error(`ambiguous test cfg at line ${k + 1}: ${lines[k]}`)
      if (cls === 'test') isTest = true
    }
    if (!isTest) continue
    let end = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] === '}') {
        end = j
        break
      }
    }
    if (end === -1) throw new Error(`unterminated test module at line ${i + 1}`)
    out.push({ name: line.split(' ')[1] ?? '', startLine: start, endLine: end })
    skipUntil = end
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
 * One shell file's PRODUCTION text: {@link readTauriShellFile} with its co-located test modules cut
 * (Phase 71 D-10). Any pin on a file that may carry a `#[cfg(test)] mod` (presence, order or count of a
 * production construct) must read through this, or a needle in the test module can satisfy it.
 */
export function readTauriShellProductionFile(
  relPath: string,
  repoRoot: string = DEFAULT_REPO_ROOT
): string {
  return stripRustTestModules(readTauriShellFile(relPath, repoRoot))
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
 * The step fns `rpc_humble_login_open` calls, in call order (quick 261111-buh). Each is a column-0 fn
 * in `login_window/humble_open.rs` whose statements were moved out of the handler verbatim.
 * {@link readHandlerBodyWithSteps} splices each one's statements in at its call so a source pin sees
 * the arm as one body, and {@link listStepLinkageProblems} fails when a step is renamed, left uncalled,
 * called twice, called from elsewhere or called out of order. Re-derive this list from the handler; do
 * not widen it to make a pin pass.
 */
export const HUMBLE_LOGIN_OPEN_STEPS: readonly string[] = [
  'arm_visible_login_latch_macos',
  'build_login_window',
  'install_native_bar_for_sheet_macos',
  'present_visible_login_window_macos',
  'install_login_window_close_hook'
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A call of `step(` that is neither a longer identifier's tail nor the fn's own `fn step(` line. */
function stepCallPattern(step: string, flags = ''): RegExp {
  return new RegExp(`(?<![\\w])(?<!fn )${escapeRegExp(step)}\\(`, flags)
}

/**
 * The body statements of the column-0 fn `fnName`, signature excluded: like
 * {@link readTopLevelFnBody}, plus, when the `fn` line does not itself end with `{` (rustfmt's
 * one-param-per-line form), the leading parameter lines through the `) ... {` line that closes the
 * signature. Throws on every case `readTopLevelFnBody` throws on.
 */
export function readTopLevelFnStatements(
  source: string,
  fnName: string,
  minLines = 3
): string {
  const body = readTopLevelFnBody(source, fnName, minLines)
  const re = new RegExp(`^(pub\\(crate\\) )?fn ${escapeRegExp(fnName)}\\(`)
  const header = source.split('\n').find((l) => re.test(l)) ?? ''
  if (header.trimEnd().endsWith('{')) return body
  const lines = body.split('\n')
  const close = lines.findIndex(
    (l) => l.trim().startsWith(')') && l.trimEnd().endsWith('{')
  )
  if (close < 0) {
    throw new Error(
      `readTopLevelFnStatements: ${fnName} has a multi-line signature with no closing ") ... {" line`
    )
  }
  return lines.slice(close + 1).join('\n')
}

/** Index of the line that ends the statement starting at `from` (the first at or after it ending `;`). */
function statementEndLine(lines: readonly string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    if ((lines[i] ?? '').trimEnd().endsWith(';')) return i
  }
  return from
}

/**
 * {@link readHandlerBody} with each listed step's statements ({@link readTopLevelFnStatements})
 * spliced in right after the statement that calls it, so an ordering pin reads across the call
 * sequence exactly as it did before the handler was split. A step the handler does not call is not
 * spliced (a lone synthetic handler keeps working); a step the handler calls but the source does not
 * define throws. {@link listStepLinkageProblems} is what fails on an uncalled or misplaced step.
 */
export function readHandlerBodyWithSteps(
  source: string,
  wireName: string,
  steps: readonly string[],
  minLines = 3
): string {
  const lines = readHandlerBody(source, wireName, minLines).split('\n')
  const insertAfter = new Map<number, string[]>()
  for (const step of steps) {
    const re = stepCallPattern(step)
    lines.forEach((line, i) => {
      if (!re.test(line)) return
      const at = statementEndLine(lines, i)
      const list = insertAfter.get(at) ?? []
      list.push(readTopLevelFnStatements(source, step))
      insertAfter.set(at, list)
    })
  }
  const out: string[] = []
  lines.forEach((line, i) => {
    out.push(line)
    out.push(...(insertAfter.get(i) ?? []))
  })
  return out.join('\n')
}

/**
 * One problem string per way the `steps` of `rpc_<wireName>` are mis-linked; `[]` when clean. A step
 * must be defined exactly once, called exactly once in the handler body, called nowhere else in
 * `source`, and called in list order.
 */
export function listStepLinkageProblems(
  source: string,
  wireName: string,
  steps: readonly string[]
): string[] {
  const problems: string[] = []
  const handler = readHandlerBody(source, wireName, 1)
  const positions: { step: string; at: number }[] = []
  for (const step of steps) {
    try {
      readTopLevelFnBody(source, step, 1)
    } catch (e) {
      problems.push(
        `${step}: definition missing or duplicated (${(e as Error).message})`
      )
    }
    const inHandler = (handler.match(stepCallPattern(step, 'g')) ?? []).length
    if (inHandler !== 1) {
      problems.push(
        `${step}: called ${inHandler} times in rpc_${wireName}, expected exactly 1`
      )
    }
    const inSource = (source.match(stepCallPattern(step, 'g')) ?? []).length
    if (inSource !== 1) {
      problems.push(
        `${step}: called ${inSource} times across the source, expected exactly 1 (a second caller?)`
      )
    }
    const at = handler.search(stepCallPattern(step))
    if (inHandler === 1 && at >= 0) positions.push({ step, at })
  }
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1]
    const cur = positions[i]
    if (prev && cur && cur.at < prev.at) {
      problems.push(
        `${cur.step}: called before ${prev.step}, but the step list orders ${prev.step} first`
      )
    }
  }
  return problems
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
