// Deleted by 66.4-20 together with backend/constants/paths.ts.
// Pins that ctx.paths (derivePaths) and the import-time constants cannot disagree
// while consumers move across.
describe('AppPaths parity with constants/paths', () => {
  test('every exported constant equals the same-named AppPaths field', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constants = require('backend/constants/paths') as Record<
      string,
      unknown
    >
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolveAppPaths } = require('../bootstrap') as {
      resolveAppPaths: () => Record<string, unknown>
    }
    const paths = resolveAppPaths()
    let compared = 0
    for (const name of Object.keys(constants)) {
      if (name === 'fixAsarPath') continue
      const field = name === 'userDataPath' ? 'userData' : name
      expect({ field, value: paths[field] }).toEqual({
        field,
        value: constants[name]
      })
      compared++
    }
    expect(compared).toBeGreaterThanOrEqual(28)
  })
})
