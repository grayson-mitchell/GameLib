/**
 * Source-text structural gate for four call sites named by the todo
 * `2026-10-05-long-running-wine-and-sync-channels-hit-the-60s-invoke-timeout`.
 *
 * Each awaits an invoke that can reject (the old 60s bound, an unset
 * `GAMELIB_SHELL_EXE`, a corrupt `shortcuts.vdf`, a failed download) and used to
 * either strand a busy flag (`steamRefresh`, `runningSetup`) or produce an
 * unhandled rejection (`callTool`, `installWineVersion`).
 *
 * WHY A SOURCE GATE AND NOT A BEHAVIOURAL ONE: this Frontend jest project has no
 * jsdom / react-test-renderer (`src/frontend/jest.config.js`). `GameSubMenu` and
 * `SideloadDialog` each import a stylesheet and declare a dozen-plus hooks, well
 * past what the hand-rolled hook harness makes safe to invoke as a plain
 * function. `EacRuntime` and `CloudSavesSync` -- the two small components on the
 * same todo -- ARE covered behaviourally, in `eacRuntimeInstallFailure.test.tsx`
 * and `cloudSavesSyncFailure.test.tsx`. This gate proves a shape, not a runtime
 * outcome; do not read it as stronger than that.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const FRONTEND = join(__dirname, '..', '..', '..', '..')

function read(rel: string): string {
  return readFileSync(join(FRONTEND, rel), 'utf-8')
}

/** The brace-balanced block that opens at the first `{` after `anchor`. */
function blockAfter(source: string, anchor: string): string {
  const start = source.indexOf(anchor)
  if (start < 0) throw new Error(`anchor not found: ${anchor}`)
  const open = source.indexOf('{', start + anchor.length)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') depth--
    if (depth === 0) return source.slice(open, i + 1)
  }
  throw new Error(`unbalanced block after: ${anchor}`)
}

describe('long-running invoke call sites release their busy state on rejection', () => {
  test('GameSubMenu handleAddToSteam clears steamRefresh in a finally block', () => {
    const body = blockAfter(
      read('screens/Game/GameSubMenu/index.tsx'),
      'async function handleAddToSteam()'
    )
    expect(body).toContain('window.api')
    expect(blockAfter(body, 'finally')).toContain('setSteamRefresh(false)')
  })

  test('SideloadDialog handleRunExe clears runningSetup in a finally block (also covers the early return)', () => {
    const body = blockAfter(
      read('screens/Library/components/InstallModal/SideloadDialog/index.tsx'),
      'const handleRunExe = async () =>'
    )
    expect(body).toMatch(/window\.api\s*\.runWineCommand\(/)
    expect(blockAfter(body, 'finally')).toContain('setRunningSetup(false)')
  })

  test('Winetricks launchWinetricks handles a callTool rejection', () => {
    const body = blockAfter(
      read('components/UI/Winetricks/index.tsx'),
      'function launchWinetricks()'
    )
    expect(body).toContain('.callTool(')
    expect(body).toContain('.catch(')
  })

  test('WineItem install handles an installWineVersion rejection', () => {
    const body = blockAfter(
      read('screens/WineManager/components/WineItem/index.tsx'),
      'async function install()'
    )
    // Whitespace-tolerant: prettier breaks `window.api\n  .installWineVersion(`.
    expect(body).toMatch(/window\.api\s*\.installWineVersion\(/)
    expect(body).toContain('.catch(')
  })

  test('self-test: blockAfter returns the balanced block, not the rest of the file', () => {
    const src = 'function a() { if (x) { y() } } function b() { z() }'
    expect(blockAfter(src, 'function a()')).toBe('{ if (x) { y() } }')
  })
})
