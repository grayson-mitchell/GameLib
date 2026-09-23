import * as fileSize from 'filesize'
import { diskSpaceLabels } from '../diskSpaceLabels'

/**
 * Quick task `260923-vdq`. TDD RED for the shared free/total label formatter
 * both install dialogs need.
 *
 * The assertions below compute their expectation from `filesize` itself
 * (`fileSize.partial({ base: 2 })`), the exact construction the helper must
 * use for byte-identical parity with `frontend/helpers`'s `size` and the
 * backend's `getFileSize` -- never a hand-typed literal, so this test cannot
 * drift from the library's own formatting.
 */

const size = fileSize.partial({ base: 2 }) as (arg: unknown) => string

describe('diskSpaceLabels', () => {
  it('formats free/diskSize into two base-2 strings matching filesize({ base: 2 }) output', () => {
    const free = 323_671_837_818 // ~301.44 GiB
    const diskSize = 576_899_820_748 // ~537.15 GiB

    const result = diskSpaceLabels({ free, diskSize })

    expect(result.freeLabel).toBe(size(free))
    expect(result.totalLabel).toBe(size(diskSize))
  })

  it('formats zero bytes without throwing', () => {
    expect(() => diskSpaceLabels({ free: 0, diskSize: 0 })).not.toThrow()
    const result = diskSpaceLabels({ free: 0, diskSize: 0 })
    expect(result.freeLabel).toBe(size(0))
    expect(result.totalLabel).toBe(size(0))
  })

  it('exposes the two labels under names that do NOT spell diskSize', () => {
    const result = diskSpaceLabels({ free: 1024, diskSize: 2048 })
    const keys = Object.keys(result)
    expect(keys).toContain('freeLabel')
    expect(keys).toContain('totalLabel')
    expect(keys).not.toContain('diskSize')
    expect(keys.some((k) => k.includes('diskSize'))).toBe(false)
  })
})
