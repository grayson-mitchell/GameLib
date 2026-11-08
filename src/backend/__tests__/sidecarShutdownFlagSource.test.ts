/**
 * Phase 72 Plan 10 (D-01, D-03): every intentional exit entry must call `begin_shutdown()`
 * before the sidecar is closed, or its stdout EOF raises a false "GameLib stopped working"
 * dialog. Assertions run against COMMENT-STRIPPED source so prose quoting a needle cannot
 * satisfy them.
 */
import {
  readTauriShellFile,
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
    const src = code('store_embed.rs')
    const arm = slice(
      src,
      'RustInvokeChannel::AppExit =>',
      'RustInvokeChannel::AppRelaunch =>'
    )
    const flag = arm.indexOf('begin_shutdown()')
    expect(flag).toBeGreaterThanOrEqual(0)
    expect(flag).toBeLessThan(arm.indexOf('app.exit'))
  })

  it('the AppRelaunch arm sets the flag before app.restart', () => {
    const src = code('store_embed.rs')
    const arm = slice(
      src,
      'RustInvokeChannel::AppRelaunch =>',
      'RustInvokeChannel::AppHide =>'
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
