/**
 * Phase 72 Plan 10 (D-01, D-03): every intentional exit entry must call `begin_shutdown()`
 * before the sidecar is closed, or its stdout EOF raises a false "GameLib stopped working"
 * dialog. Assertions run against COMMENT-STRIPPED source so prose quoting a needle cannot
 * satisfy them.
 */
import {
  readHandlerBody,
  readTauriShellFile,
  readTauriShellProductionSource,
  readTauriShellSource
} from 'backend/testUtils/tauriShellSource'
import {
  stripSourceComments,
  stripTrailingLineComment
} from '../testUtils/stripSourceComments'

function strip(raw: string): string {
  return stripSourceComments(raw)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

function code(relPath: string): string {
  return strip(readTauriShellFile(relPath))
}

/** Text from `start` up to (not including) the first `end` after it. */
function slice(src: string, start: string, end: string): string {
  const from = src.indexOf(start)
  expect(from).toBeGreaterThanOrEqual(0)
  const to = src.indexOf(end, from + start.length)
  expect(to).toBeGreaterThan(from)
  return src.slice(from, to)
}

describe('sidecar shutdown flag call sites (D-03)', () => {
  it('shutdown_child sets the flag before any kill', () => {
    const src = code('shell_state.rs')
    const body = slice(src, 'fn shutdown_child', 'fn write_raw')
    const flag = body.indexOf('begin_shutdown()')
    expect(flag).toBeGreaterThanOrEqual(0)
    expect(flag).toBeLessThan(body.indexOf('libc::kill'))
    expect(flag).toBeLessThan(body.indexOf('child.kill()'))
  })

  it('the AppExit arm sets the flag before app.exit', () => {
    const arm = strip(
      readHandlerBody(
        stripSourceComments(readTauriShellProductionSource()),
        'app_exit',
        1
      )
    )
    const flag = arm.indexOf('begin_shutdown()')
    expect(flag).toBeGreaterThanOrEqual(0)
    expect(flag).toBeLessThan(arm.indexOf('app.exit'))
  })

  it('the AppRelaunch arm sets the flag before app.restart', () => {
    const arm = strip(
      readHandlerBody(
        stripSourceComments(readTauriShellProductionSource()),
        'app_relaunch',
        1
      )
    )
    const flag = arm.indexOf('begin_shutdown()')
    expect(flag).toBeGreaterThanOrEqual(0)
    expect(flag).toBeLessThan(arm.indexOf('app.restart'))
  })

  it('the RunEvent::ExitRequested arm sets the flag', () => {
    // The whole shell source: the ExitRequested arm lives in the entry file.
    const src = strip(readTauriShellSource())
    const arm = slice(
      src,
      'tauri::RunEvent::ExitRequested',
      'tauri::RunEvent::Exit =>'
    )
    expect(arm).toContain('begin_shutdown()')
  })

  it('the reader surfaces EOF after draining, and never respawns the sidecar (D-01)', () => {
    const src = code('sidecar.rs')
    const drain = src.indexOf('drain_pending_invokes(&state.pending')
    expect(drain).toBeGreaterThanOrEqual(0)
    expect(src.indexOf('on_sidecar_eof(', drain)).toBeGreaterThan(drain)
    expect(src.match(/\bspawn_sidecar\(/g)?.length ?? 0).toBe(1)
  })
})

// WR-01 (quick 261108-lav): the dead-sidecar path must reap the whole tree before the dialog.
// Pins the Windows/Linux arms that a local macOS `cargo test` cannot exercise.
describe('dead-sidecar tree reap (WR-01)', () => {
  it('surface_dead_sidecar reaps before the dialog, with no liveness gate', () => {
    const body = slice(
      code('sidecar.rs'),
      'fn surface_dead_sidecar',
      '.blocking_show()'
    )
    const reap = body.indexOf('reap_dead_sidecar_tree()')
    expect(reap).toBeGreaterThanOrEqual(0)
    expect(reap).toBeLessThan(body.indexOf('.dialog()'))
    expect(body).not.toContain('!gone')
    expect(body).not.toContain('try_wait')
  })

  it('reap_dead_sidecar_tree kills the group before reaping, drops the job and latches', () => {
    const body = slice(
      code('shell_state.rs'),
      'fn reap_dead_sidecar_tree',
      'fn shutdown_child'
    )
    const kill = body.indexOf('kill_process_group(')
    expect(kill).toBeGreaterThanOrEqual(0)
    expect(kill).toBeLessThan(body.indexOf('child.wait()'))
    expect(body).toContain('job.lock()')
    expect(body).toContain('tree_reaped.store(true')
  })

  it('shutdown_child skips the group signal once the tree is reaped', () => {
    const body = slice(
      code('shell_state.rs'),
      'fn shutdown_child',
      'fn write_raw'
    )
    expect(body).toContain('tree_reaped.load(')
  })
})
