/**
 * Text gate: the Tauri-free scanner crates stay tested and linted in CI. Default workspace
 * members hide them from `cargo test --bin gamelib-shell`, so the explicit `-p` step and the
 * `--workspace` clippy run are load-bearing. The clippy toolchain and ratchet steps are
 * unconditional on the macOS and Windows legs (per-platform baseline); the Linux leg (Phase 72
 * D-14) skips them via exactly `if: runner.os != 'Linux'`, since no Linux baseline exists.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const workflow = readFileSync(
  join(__dirname, '..', '..', '.github', 'workflows', 'rust-test.yml'),
  'utf-8'
)

const TEST_RUN = 'run: cargo test -p gamelib-scan -p gamelib-scan-cli'

function steps(text: string): string[] {
  return text.split(/^ {6}- /m)
}

function hasScanCrateStep(text: string): boolean {
  const block = steps(text).find((s) => s.includes(TEST_RUN))
  if (!block) return false
  return (
    block.includes('working-directory: src-tauri') && !/^\s*if:/m.test(block)
  )
}

function hasUngatedClippy(text: string): boolean {
  const ratchet = steps(text).find((s) =>
    s.includes('node ../meta/clippyRatchet.cjs')
  )
  const toolchain = steps(text).find((s) => s.includes('toolchain: 1.99.1'))
  if (!ratchet || !toolchain) return false
  // Phase 72 Plan 01 (D-14): the Linux leg is compile+test only -- clippyRatchet.cjs holds no
  // Linux baseline -- so exactly this one guard is allowed. Any other `if:` still fails.
  const strip = (s: string) => s.replace(LINUX_SKIP, '')
  return !/^\s*if:/m.test(strip(ratchet)) && !/^\s*if:/m.test(strip(toolchain))
}

const LINUX_SKIP = /^\s*if: runner\.os != 'Linux'\s*$/m

function hasWorkspaceClippy(text: string): boolean {
  return text.includes('clippy --workspace --all-targets')
}

describe('rust-test.yml covers the gamelib-scan crates', () => {
  test('is the Rust test workflow', () => {
    expect(workflow).toContain('name: Rust test')
  })

  test('has an unconditional explicit -p test step in src-tauri', () => {
    expect(hasScanCrateStep(workflow)).toBe(true)
  })

  test('clippy ratchet lints the whole workspace', () => {
    expect(hasWorkspaceClippy(workflow)).toBe(true)
  })

  test('clippy toolchain and ratchet run on every matrix leg (no if:)', () => {
    expect(hasUngatedClippy(workflow)).toBe(true)
  })

  test('still tests the shell crate', () => {
    expect(workflow).toContain('cargo test --bin gamelib-shell')
  })
})

describe('anti-vacuity: the predicates reject mutated workflows', () => {
  test('rejects a workflow without the -p step', () => {
    expect(hasScanCrateStep(workflow.replace(TEST_RUN, 'run: true'))).toBe(
      false
    )
  })

  test('rejects a workflow whose step is conditional', () => {
    const mutated = workflow.replace(
      '- name: cargo test (gamelib-scan, gamelib-depot and gamelib-steamfiles crates)\n',
      "- name: cargo test (gamelib-scan, gamelib-depot and gamelib-steamfiles crates)\n        if: runner.os == 'macOS'\n"
    )
    expect(mutated).not.toBe(workflow)
    expect(hasScanCrateStep(mutated)).toBe(false)
  })

  test('rejects clippy without --workspace', () => {
    expect(
      hasWorkspaceClippy(workflow.replace('clippy --workspace', 'clippy'))
    ).toBe(false)
  })

  test.each([
    '- name: Install pinned clippy toolchain\n',
    '- name: cargo clippy ratchet (shrink-only, per-platform baseline)\n'
  ])('rejects a workflow whose clippy step is conditional: %s', (anchor) => {
    const mutated = workflow.replace(
      anchor,
      `${anchor}        if: runner.os == 'macOS'\n`
    )
    expect(mutated).not.toBe(workflow)
    expect(hasUngatedClippy(mutated)).toBe(false)
  })
})
