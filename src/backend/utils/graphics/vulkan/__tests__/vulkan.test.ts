import {
  createScriptedRunner,
  type ScriptStep
} from 'backend/testUtils/scriptedRunner'
import { createVulkan } from '../index'
import { fixAsarPath } from 'backend/process/appPaths'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'

const paths = createTestAppPaths('/fake/root')

const stepFor = (arg: string, stdout: string, code = 0): ScriptStep => ({
  cmd: '',
  match: (argv: readonly string[]) => argv[0] === arg,
  result: { stdout, code }
})

// The scripted runner matches on the exact cmd, so the tests read it back from the first call.
function scripted(steps: ScriptStep[]) {
  const binSuffix = 'vulkan-helper'
  // cmd is the resolved helper path; recompute it the same way the module does.
  const { join } = jest.requireActual<typeof import('path')>('path')
  const cmd = fixAsarPath(
    join(paths.publicDir, 'bin', process.arch, process.platform, binSuffix)
  )
  return createScriptedRunner(steps.map((s) => ({ ...s, cmd })))
}

describe('createVulkan', () => {
  it('runs instance-version once with a 10s timeout and memoises it', async () => {
    const runner = scripted([stepFor('instance-version', '[1,3,250]')])
    const vulkan = createVulkan({ runner, paths })
    expect(await vulkan.getInstanceVersion()).toEqual([1, 3, 250])
    expect(await vulkan.getInstanceVersion()).toEqual([1, 3, 250])
    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]?.argv).toEqual(['instance-version'])
    expect((runner.calls[0]?.opts as { timeoutMs: number }).timeoutMs).toBe(
      10_000
    )
  })

  it('memoises physical-versions across anyGpuSupportsVersion calls', async () => {
    const runner = scripted([
      stepFor(
        'physical-versions',
        '[{"name":"GPU A","major":1,"minor":2,"patch":0}]'
      )
    ])
    const vulkan = createVulkan({ runner, paths })
    expect(await vulkan.anyGpuSupportsVersion([1, 1, 0])).toBe('GPU A')
    expect(await vulkan.anyGpuSupportsVersion([1, 3, 0])).toBe(false)
    expect(runner.calls).toHaveLength(1)
  })

  it('does not memoise nvapi-path', async () => {
    const runner = scripted([
      { ...stepFor('nvapi-path', '/opt/nv\n'), repeat: true }
    ])
    const vulkan = createVulkan({ runner, paths })
    expect(await vulkan.getNvngxPath()).toBe('/opt/nv')
    expect(await vulkan.getNvngxPath()).toBe('/opt/nv')
    expect(runner.calls).toHaveLength(2)
  })

  it('maps non-zero, timeout and spawn error to the unknown values', async () => {
    const nonZero = createVulkan({
      paths,
      runner: scripted([
        stepFor('instance-version', '[1,3,0]', 1),
        stepFor('physical-versions', '[]', 2),
        stepFor('nvapi-path', 'x', 1)
      ])
    })
    expect(await nonZero.getInstanceVersion()).toBe(false)
    expect(await nonZero.anyGpuSupportsVersion([1, 1, 0])).toBe(false)
    expect(await nonZero.getNvngxPath()).toBe('')

    const broken = scripted([
      {
        ...stepFor('instance-version', ''),
        error: { code: 'ENOENT' }
      },
      {
        ...stepFor('nvapi-path', 'late'),
        result: { stdout: 'late', timedOut: true, code: null }
      }
    ])
    const vulkan = createVulkan({ runner: broken, paths })
    expect(await vulkan.getInstanceVersion()).toBe(false)
    expect(await vulkan.getNvngxPath()).toBe('')
  })
})
