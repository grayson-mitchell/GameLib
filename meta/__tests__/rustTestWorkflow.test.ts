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
// Phase 82 D-18: the safety crates run as their own step BEFORE the multi-crate step.
const SAFETY_TEST_RUN = 'run: cargo test -p gamelib-safety -p gamelib-testutil'
// Phase 83 D-13: the process-lifetime harness runs as its own step, before the multi-crate step.
const PROC_TEST_RUN = 'run: cargo test -p gamelib-proc'

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

function multiCrateRunLine(text: string): string {
  const block = steps(text).find((s) => s.includes(TEST_RUN))
  return block?.split(/\r?\n/).find((l) => l.includes(TEST_RUN)) ?? ''
}

// Phase 83 (FND-04): gamelib-core is the trait crate every later slice depends on.
function testsCoreCrate(text: string): boolean {
  return /(^|\s)-p gamelib-core(\s|$)/.test(multiCrateRunLine(text))
}

function hasSafetyCrateStep(text: string): boolean {
  const block = steps(text).find((s) => s.includes(SAFETY_TEST_RUN))
  if (!block) return false
  return (
    block.includes('working-directory: src-tauri') && !/^\s*if:/m.test(block)
  )
}

function safetyStepComesFirst(text: string): boolean {
  const all = steps(text)
  const safety = all.findIndex((s) => s.includes(SAFETY_TEST_RUN))
  const multi = all.findIndex((s) => s.includes(TEST_RUN))
  return safety !== -1 && multi !== -1 && safety < multi
}

function hasProcCrateStep(text: string): boolean {
  const block = steps(text).find((s) => s.includes(PROC_TEST_RUN))
  if (!block) return false
  return (
    block.includes('working-directory: src-tauri') && !/^\s*if:/m.test(block)
  )
}

function procStepComesBeforeMulti(text: string): boolean {
  const all = steps(text)
  const proc = all.findIndex((s) => s.includes(PROC_TEST_RUN))
  const multi = all.findIndex((s) => s.includes(TEST_RUN))
  return proc !== -1 && multi !== -1 && proc < multi
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

  test('has an unconditional gamelib-safety/gamelib-testutil step in src-tauri (Phase 82 D-18)', () => {
    expect(hasSafetyCrateStep(workflow)).toBe(true)
  })

  test('the safety step runs before the multi-crate step so a red crate cannot mask it', () => {
    expect(safetyStepComesFirst(workflow)).toBe(true)
  })

  test('has an unconditional gamelib-proc step in src-tauri (Phase 83 D-13)', () => {
    expect(hasProcCrateStep(workflow)).toBe(true)
  })

  test('the gamelib-proc step runs before the multi-crate step so a red crate cannot mask it', () => {
    expect(procStepComesBeforeMulti(workflow)).toBe(true)
  })

  test('the multi-crate step tests gamelib-core (Phase 83)', () => {
    expect(testsCoreCrate(workflow)).toBe(true)
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
      '- name: cargo test (gamelib-core, gamelib-scan, gamelib-depot, gamelib-steamfiles, gamelib-steamcm, gamelib-steampoll and gamelib-i18n crates)\n',
      "- name: cargo test (gamelib-core, gamelib-scan, gamelib-depot, gamelib-steamfiles, gamelib-steamcm, gamelib-steampoll and gamelib-i18n crates)\n        if: runner.os == 'macOS'\n"
    )
    expect(mutated).not.toBe(workflow)
    expect(hasScanCrateStep(mutated)).toBe(false)
  })

  test('rejects a workflow whose multi-crate step omits gamelib-core', () => {
    const mutated = workflow.replace(' -p gamelib-core', '')
    expect(mutated).not.toBe(workflow)
    expect(testsCoreCrate(mutated)).toBe(false)
  })

  test('rejects a workflow without the safety step', () => {
    const mutated = workflow.replace(SAFETY_TEST_RUN, 'run: true')
    expect(mutated).not.toBe(workflow)
    expect(hasSafetyCrateStep(mutated)).toBe(false)
  })

  test('rejects a workflow whose safety step is conditional', () => {
    const anchor =
      '- name: cargo test (gamelib-safety and gamelib-testutil, run first so an earlier red crate cannot mask them; Phase 82 D-18)\n'
    const mutated = workflow.replace(
      anchor,
      `${anchor}        if: runner.os == 'macOS'\n`
    )
    expect(mutated).not.toBe(workflow)
    expect(hasSafetyCrateStep(mutated)).toBe(false)
  })

  test('rejects a workflow whose safety step runs after the multi-crate step', () => {
    // Swap the two commands, so the safety command sits in the later step.
    const mutated = workflow
      .replace(SAFETY_TEST_RUN, '__SAFETY__')
      .replace(TEST_RUN, SAFETY_TEST_RUN)
      .replace('__SAFETY__', TEST_RUN)
    expect(mutated).not.toBe(workflow)
    expect(safetyStepComesFirst(mutated)).toBe(false)
  })

  test('rejects a workflow without the gamelib-proc step', () => {
    const mutated = workflow.replace(PROC_TEST_RUN, 'run: true')
    expect(mutated).not.toBe(workflow)
    expect(hasProcCrateStep(mutated)).toBe(false)
  })

  test('rejects a workflow whose gamelib-proc step is conditional', () => {
    const anchor =
      '- name: cargo test (gamelib-proc process-lifetime harness, run before the multi-crate step so an earlier red crate cannot mask it; Phase 83 D-13)\n'
    const mutated = workflow.replace(
      anchor,
      `${anchor}        if: runner.os == 'macOS'\n`
    )
    expect(mutated).not.toBe(workflow)
    expect(hasProcCrateStep(mutated)).toBe(false)
  })

  test('rejects a workflow whose gamelib-proc step runs after the multi-crate step', () => {
    // Swap the two commands, so the proc command sits in the later step.
    const mutated = workflow
      .replace(PROC_TEST_RUN, '__PROC__')
      .replace(TEST_RUN, PROC_TEST_RUN)
      .replace('__PROC__', TEST_RUN)
    expect(mutated).not.toBe(workflow)
    expect(procStepComesBeforeMulti(mutated)).toBe(false)
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
