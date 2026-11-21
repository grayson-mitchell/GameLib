/**
 * Phase 84 plan 17 (WR-02, privacy half): no shell diagnostic written to `gamelib.log` may carry
 * text the shell did not author.
 *
 * Why. The shell's diagnostics moved from the never-uploaded `gamelib-shell.log` into
 * `gamelib.log` (84-08), and `uploadLogFile` posts `gamelib.log` to a public paste service. A line
 * such as `keyring {channel} failed: {e:?}` therefore publishes an OS error string, and a line such
 * as `cwd={cwd}` publishes an absolute path, to anyone with the link. A message keeps a CATEGORY
 * (the operation plus an error kind, a variant, a classified prefix, a boolean or a count). The
 * external text goes to stderr only, through `shell_log_detail(message, detail)` or
 * `shell_eprintln!`.
 *
 * What this gate does. It walks EVERY `.rs` file under `src-tauri/src` itself (the shared reader
 * `tauriShellSource` deliberately excludes the macOS siblings, which is where the notification and
 * Epic-embed lines live; only the generated `ipc_contract.rs` is skipped), strips comments with the
 * shared stripper, finds every `shell_log(` and `shell_log_detail(` call, takes its balanced
 * argument list (for `shell_log_detail`, the FIRST argument only: the second is the stderr-only
 * detail and is allowed to carry anything) and fails, naming the file, on:
 *
 *   - a named format placeholder for an error or description: `{e}`, `{err}`, `{error}`,
 *     `{description}`, with or without a format spec (`{e:?}`);
 *   - a named format placeholder for a path or environment value: `{cwd}`, `{node}`, `{entry}`,
 *     `{shell_exe}`, `{app_root}`, `{steam_root}`, `{forward_args...}`;
 *   - one of those names, or `localizedDescription`, as an identifier in the argument list outside
 *     a string literal (a positional argument: `format!("... {}", e)`, `e.kind()`).
 *
 * What it does NOT do, stated so nobody reads a green run as a proof. It is a source-text match, not
 * a data-flow analysis. It cannot see error text that reaches a message under another name
 * (`let msg = e.to_string();` then `{msg}`), through a helper that returns a `String`
 * (`keyring_outcome_message`), through a macro, or through the `set_diag_sink` function pointer.
 * Bind every category to a named local whose name is not one of the above (`kind`,
 * `error_category`) and keep the error itself in the detail argument, which is the discipline this
 * gate can enforce. Line numbers below are those of the comment-stripped text (the shared stripper
 * drops whole comment lines), so each failure also carries the call's first line.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from '../testUtils/stripSourceComments'

const SHELL_SRC = join(__dirname, '..', '..', '..', 'src-tauri', 'src')
const GENERATED = ['ipc_contract.rs']

/** Names that denote an error, a description or a path/env value in this crate. */
const FORBIDDEN_NAMES = [
  'e',
  'err',
  'error',
  'description',
  'cwd',
  'node',
  'entry',
  'shell_exe',
  'app_root',
  'steam_root'
] as const

const PLACEHOLDER_RE = new RegExp(
  `\\{(?:${FORBIDDEN_NAMES.join('|')}|forward_args\\w*)(?::[^}]*)?\\}`
)
const IDENT_RE = new RegExp(
  `\\b(?:${FORBIDDEN_NAMES.join('|')}|forward_args\\w*|localizedDescription)\\b`
)

interface ShellLogCall {
  readonly name: 'shell_log' | 'shell_log_detail'
  /** The argument text that must be category-only (the first argument for `shell_log_detail`). */
  readonly message: string
  readonly line: number
  readonly head: string
}

/** Index just past the string literal (plain, raw, or char) that starts at `i`, or `i` itself. */
function skipLiteral(code: string, i: number): number {
  const rest = code.slice(i, i + 64)
  const raw = /^r(#*)"/.exec(rest)
  if (raw) {
    const close = `"${raw[1]}`
    const end = code.indexOf(close, i + raw[0].length)
    return end === -1 ? code.length : end + close.length
  }
  if (code[i] === '"') {
    let j = i + 1
    while (j < code.length && code[j] !== '"') j += code[j] === '\\' ? 2 : 1
    return j + 1
  }
  // A char literal ('x', '\n', '('), not a lifetime ('a).
  const ch = /^'(?:\\[^']*|[^\\'])'/.exec(rest)
  return ch ? i + ch[0].length : i
}

/** The argument text between the call's parentheses, and where its first argument ends. */
function readArgs(
  code: string,
  openIdx: number
): { args: string; firstEnd: number } {
  let depth = 1
  let i = openIdx + 1
  let firstEnd = -1
  while (i < code.length && depth > 0) {
    const skipped = skipLiteral(code, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    const c = code[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 1 && firstEnd === -1) firstEnd = i
    i++
  }
  const end = i - 1
  return {
    args: code.slice(openIdx + 1, end),
    firstEnd: firstEnd === -1 ? end : firstEnd
  }
}

function listShellLogCalls(code: string): ShellLogCall[] {
  const calls: ShellLogCall[] = []
  const callRe = /\bshell_log(_detail)?\(/g
  let match: RegExpExecArray | null
  while ((match = callRe.exec(code)) !== null) {
    if (code.slice(Math.max(0, match.index - 3), match.index) === 'fn ') {
      continue // the definition, not a call
    }
    const openIdx = match.index + match[0].length - 1
    const { args, firstEnd } = readArgs(code, openIdx)
    const detail = match[1] !== undefined
    calls.push({
      name: detail ? 'shell_log_detail' : 'shell_log',
      message: detail ? code.slice(openIdx + 1, firstEnd) : args,
      line: code.slice(0, match.index).split('\n').length,
      head: (code.slice(match.index).split('\n')[0] ?? '').trim()
    })
  }
  return calls
}

/** Why a message argument is not category-only, or null when it is. */
function externalTextIn(message: string): string | null {
  let literalText = ''
  let codeText = ''
  for (let i = 0; i < message.length; ) {
    const skipped = skipLiteral(message, i)
    if (skipped === i) {
      codeText += message[i]
      i++
    } else {
      literalText += message.slice(i, skipped)
      codeText += ' '
      i = skipped
    }
  }
  const placeholder = PLACEHOLDER_RE.exec(literalText)
  if (placeholder) return `placeholder ${placeholder[0]}`
  const ident = IDENT_RE.exec(codeText)
  if (ident) return `identifier ${ident[0]}`
  return null
}

function walkRs(dirAbs: string, rel: string, out: string[]): void {
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const next = `${rel}${entry.name}`
    if (entry.isDirectory()) walkRs(join(dirAbs, entry.name), `${next}/`, out)
    else if (entry.isFile() && entry.name.endsWith('.rs')) out.push(next)
  }
}

function shellRsFiles(): string[] {
  const all: string[] = []
  walkRs(SHELL_SRC, '', all)
  return all.filter((p) => !GENERATED.includes(p)).sort()
}

function readCode(rel: string): string {
  const raw = readFileSync(join(SHELL_SRC, rel), 'utf-8').replace(/\r\n/g, '\n')
  return stripSourceComments(raw)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

describe('no shell_log message carries external text (WR-02, privacy half)', () => {
  test('every shell_log / shell_log_detail message argument is category-only', () => {
    const offences: string[] = []
    for (const rel of shellRsFiles()) {
      for (const call of listShellLogCalls(readCode(rel))) {
        const why = externalTextIn(call.message)
        if (why !== null) {
          offences.push(`${rel}:${call.line} ${call.name} ${why}: ${call.head}`)
        }
      }
    }
    expect(offences).toEqual([])
  })

  test('non-vacuity: the walk reaches the macOS siblings and finds both call shapes', () => {
    const files = shellRsFiles()
    expect(files).toContain('macos_notifications.rs')
    expect(files).toContain('macos_epic_embed/nav_delegate.rs')
    expect(files).not.toContain('ipc_contract.rs')

    const all = files.flatMap((rel) => listShellLogCalls(readCode(rel)))
    expect(all.filter((c) => c.name === 'shell_log').length).toBeGreaterThan(50)
    expect(
      all.filter((c) => c.name === 'shell_log_detail').length
    ).toBeGreaterThan(10)
  })
})

describe('the matcher is not vacuous (positive and negative controls)', () => {
  const flagged = (call: string): string | null => {
    const calls = listShellLogCalls(call)
    expect(calls).toHaveLength(1)
    return externalTextIn(calls[0]?.message ?? '')
  }

  test.each([
    ['{e}', 'shell_log(&format!("x failed: {e}"))'],
    ['{e:?}', 'shell_log(&format!("x failed: {e:?}"))'],
    ['{err}', 'shell_log(&format!("x: {err}"))'],
    ['{error}', 'shell_log(&format!("x: {error}"))'],
    ['{error:?}', 'shell_log(&format!("x: {error:?}"))'],
    ['{description}', 'crate::shell_log(&format!("x -- {description}"))'],
    ['{cwd}', 'shell_log(&format!("  cwd={cwd}"))'],
    ['{node}', 'shell_log(&format!("spawning: \\"{node}\\" \\"{entry}\\""))'],
    ['{entry}', 'shell_log(&format!("entry {entry}"))'],
    ['{shell_exe}', 'shell_log(&format!("  GAMELIB_SHELL_EXE={shell_exe}"))'],
    ['{app_root}', 'shell_log(&format!("  GAMELIB_APP_ROOT={app_root}"))'],
    ['{steam_root}', 'shell_log(&format!("root {steam_root} (x)"))'],
    [
      '{forward_args:?}',
      'shell_log(&format!("  forward_args={forward_args:?}"))'
    ],
    [
      'localizedDescription',
      'shell_log(&format!("x {}", localizedDescription))'
    ],
    ['positional e', 'shell_log(&format!("x failed: {}", e))'],
    ['positional e.kind()', 'shell_log(&format!("x: {:?}", e.kind()))'],
    ['positional err', 'shell_log(&format!("x: {}", err))'],
    ['positional error', 'shell_log(&format!("x: {}", error))'],
    ['positional description', 'shell_log(&format!("x: {}", description))'],
    ['a multi-line call', 'shell_log(&format!(\n  "a \\\n   b {e}"\n))'],
    [
      'the message of shell_log_detail',
      'shell_log_detail(&format!("x failed: {e}"), &e)'
    ]
  ])('flags %s', (_spelling, call) => {
    expect(flagged(call)).not.toBeNull()
  })

  test.each([
    [
      'a bound category',
      'shell_log(&format!("keyring {channel} failed ({kind})"))'
    ],
    [
      'a similarly named local',
      'shell_log(&format!("x {err_kind} {entry_exists}"))'
    ],
    ['a plain literal', 'shell_log("WARN: no \'main\' window (a paren)")'],
    [
      'a shell_log_detail whose detail carries the error',
      'shell_log_detail(&format!("x failed ({kind})"), &format!("{e:?}"))'
    ],
    [
      'a shell_log_detail detail identifier',
      'shell_log_detail("x failed", &e)'
    ],
    ['a char literal paren', 'shell_log(&format!("x {}", \')\'))']
  ])('does not flag %s', (_what, call) => {
    expect(flagged(call)).toBeNull()
  })

  test('a function definition is not a call', () => {
    expect(
      listShellLogCalls('fn shell_log(message: &str) { let e = 1; }')
    ).toHaveLength(0)
    expect(
      listShellLogCalls(
        'pub(crate) fn shell_log_detail(message: &str, detail: &dyn Display) {}'
      )
    ).toHaveLength(0)
  })

  test('shell_log_detail contributes its first argument only', () => {
    const [call] = listShellLogCalls(
      'shell_log_detail(&format!("a ({kind}), b"), &format!("{e}"))'
    )
    expect(call?.name).toBe('shell_log_detail')
    expect(call?.message).toBe('&format!("a ({kind}), b")')
  })
})
