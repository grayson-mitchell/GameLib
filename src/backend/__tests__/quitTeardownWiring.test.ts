/**
 * Quick task 260907-juv -- wiring gates for the two-layer helper-process-orphan fix
 * (`.planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-...md`).
 *
 * This file is the ONLY thing that gates Layer B (the Rust process-group spawn + group
 * reap in `src-tauri/src/main.rs`) in CI: this repo's CI runs no `cargo` step, so a
 * `#[cfg(test)]` Rust test would never gate anything here. Every assertion below runs
 * against COMMENT-STRIPPED source -- an unfiltered grep/`toContain` would be satisfied by
 * the very prose that documents the fix (main.rs's own doc comments quote these exact
 * tokens), which is precisely the vacuous-gate shape `tauriShellSource.test.ts` was built
 * to avoid. This file follows that same two-stage strip convention
 * (`stripSourceComments` first, THEN a local trailing-`//`/`stripTrailingLineComment(Ts)`
 * pass) and copies its `extractBracedBlock` brace-matcher, but is authored as a new
 * sibling rather than appended to that 2600+ line file.
 *
 * Also carries a raw-source (unstripped) gate: the target of that one assertion IS a
 * comment, so stripping it away would make the assertion trivially vacuous instead.
 *
 * Hazard respected throughout: `stripSourceComments` eats a leading `*` Rust deref line
 * (project memory `strip-source-comments-eats-rust-deref-lines`) -- no assertion target
 * line below begins with `*`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  stripSourceComments,
  stripTrailingLineComment,
  stripTrailingLineCommentTs
} from '../testUtils/stripSourceComments'

const MAIN_RS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'src',
  'main.rs'
)

const CARGO_TOML_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'Cargo.toml'
)

const GOG_GAMES_TS_PATH = join(
  __dirname,
  '..',
  'storeManagers',
  'gog',
  'games.ts'
)

const BACKEND_SRC_DIR = join(__dirname, '..')

/** Mirrors `tauriShellSource.test.ts`'s `loadMainRsCode` two-stage strip verbatim. */
function loadMainRsCode(): string {
  const raw = readFileSync(MAIN_RS_PATH, 'utf-8')
  return stripSourceComments(raw)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map(stripTrailingLineComment)
    .join('\n')
}

/** The TS-aware counterpart, for `games.ts` -- IN-08's `stripTrailingLineCommentTs`. */
function loadGamesTsCode(): string {
  const raw = readFileSync(GOG_GAMES_TS_PATH, 'utf-8')
  return stripSourceComments(raw)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map(stripTrailingLineCommentTs)
    .join('\n')
}

/**
 * Extracts a braced block starting at the first `{` found after `openMarker`, tracking
 * brace depth so a nested block does not terminate the match early. Copied from
 * `tauriShellSource.test.ts:1086` (the project's established convention for this shape) --
 * intentionally not imported from there, since that file is a describe-scoped local
 * helper, not an exported util.
 */
function extractBracedBlock(code: string, openMarker: string): string {
  const markerIdx = code.indexOf(openMarker)
  expect(markerIdx).toBeGreaterThan(-1)
  const braceStart = code.indexOf('{', markerIdx)
  expect(braceStart).toBeGreaterThan(-1)
  let depth = 0
  let i = braceStart
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  expect(depth).toBe(0)
  return code.slice(markerIdx, i + 1)
}

function listTsFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listTsFilesRecursive(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('Layer B -- Rust process-group spawn + group reap (quick 260907-juv)', () => {
  test('C1: configure_sidecar_process_group is defined in main.rs', () => {
    const code = loadMainRsCode()
    expect(code).toContain('fn configure_sidecar_process_group')
  })

  test('C2: BOTH sidecar spawn sites call configure_sidecar_process_group (parity)', () => {
    const code = loadMainRsCode()
    const devBody = extractBracedBlock(code, 'fn spawn_sidecar_dev(')
    const packagedBody = extractBracedBlock(code, 'fn spawn_sidecar_packaged(')
    expect(devBody).toContain('configure_sidecar_process_group(')
    expect(packagedBody).toContain('configure_sidecar_process_group(')
  })

  test('C3: the known .spawn() call-site count is pinned -- a THIRD SIDECAR spawn site must extend C2, not bump this number', () => {
    const code = loadMainRsCode()
    const matches = code.match(/\.spawn\(\)/g) ?? []
    // Measured at HEAD (32324f6ec): 3 occurrences --
    //   1. spawn_sidecar_dev's Command::new(&node)....spawn()
    //   2. spawn_sidecar_packaged's std_command....spawn()
    //   3. linux_wake_lock::acquire's Command::new("systemd-inhibit")....spawn(),
    //      #[cfg(target_os = "linux")] -- an UNRELATED wake-lock helper, not a
    //      descendant of the sidecar's process tree and not in scope for this fix.
    // If this count changes, the new occurrence must be triaged: if it is a THIRD
    // SIDECAR spawn site, C2 must be extended to assert parity on it too -- do not
    // just bump this number to make the test pass again.
    expect(matches.length).toBe(3)
  })

  test('C4: shutdown_child reaps the process GROUP (SIGTERM -> bounded grace via try_wait -> SIGKILL -> wait())', () => {
    const code = loadMainRsCode()
    const body = extractBracedBlock(code, 'fn shutdown_child(')
    expect(body).toContain('libc::kill(')
    expect(body).toContain('SIGTERM')
    expect(body).toContain('SIGKILL')
    // A negated pgid argument -- `libc::kill(-pgid, ...)`, never a bare/positive pid,
    // which would signal a single process rather than its whole group.
    expect(body).toMatch(/libc::kill\(\s*-/)
    expect(body).toContain('try_wait')
    expect(body).toContain('child.wait()')
  })

  test('C5: the Windows arm still calls child.kill() (Layer B degrades, never regresses)', () => {
    const code = loadMainRsCode()
    const body = extractBracedBlock(code, 'fn shutdown_child(')
    expect(body).toContain('#[cfg(not(unix))]')
    const nonUnixArm = body.slice(body.indexOf('#[cfg(not(unix))]'))
    expect(nonUnixArm).toContain('child.kill()')
  })

  test('C6: libc is declared as a unix-only direct dependency in Cargo.toml', () => {
    const raw = readFileSync(CARGO_TOML_PATH, 'utf-8')
    const unixSectionMatch = raw.match(
      /\[target\.'cfg\(unix\)'\.dependencies\]([\s\S]*?)(\n\[|$)/
    )
    expect(unixSectionMatch).not.toBeNull()
    expect(unixSectionMatch?.[1] ?? '').toMatch(/libc\s*=/)
  })
})

describe('Layer A -- comet registration on the shared long-lived-child registry (quick 260907-juv)', () => {
  test('C7: the comet spawn site (games.ts) registers with registerLongLivedChild', () => {
    const code = loadGamesTsCode()
    const idx = code.indexOf("'--from-heroic'")
    expect(idx).toBeGreaterThan(-1)
    const window = code.slice(idx, idx + 4000)
    expect(window).toContain('registerLongLivedChild(')
  })
})

describe('No stale main.ts before-quit claim survives in src/backend (quick 260907-juv)', () => {
  test('C8: raw source -- the exact phrase does not appear outside a line documenting its own supersession', () => {
    // Raw (UNSTRIPPED) on purpose: the subject under assertion here IS a comment, so
    // running this through the comment stripper would make the assertion vacuous by
    // construction. Scoped narrowly to the exact phrase the todo named, exempting only
    // lines that already document the claim is false (`deleted` / `no longer exists`).
    const TARGET = '`main.ts` before-quit'
    // Excludes THIS file: it necessarily quotes the target phrase in its own source
    // (the TARGET constant above), which would otherwise self-flag as an offender.
    const files = listTsFilesRecursive(BACKEND_SRC_DIR).filter(
      (file) => file !== __filename
    )
    const offenders: string[] = []
    for (const file of files) {
      const raw = readFileSync(file, 'utf-8')
      const lines = raw.split('\n')
      lines.forEach((line, i) => {
        if (line.includes(TARGET) && !/deleted|no longer exists/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
