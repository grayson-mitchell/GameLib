import fs from 'fs'
import path from 'path'

// Phase 17-10 gap closure (MACSTEAM-02) regression guard: the guided-setup
// banner (.steamBottleSetupToast) previously had zero CSS rules and rendered
// as plain unstyled text over the window. This repo has no scss
// moduleNameMapper and testEnvironment is 'node', so we deliberately do NOT
// import the component or the scss (would require a scss/jsdom transform).
// Instead we assert against the raw file text, same approach as would be
// used for HumbleExpiryToast/index.scss.
const componentDir = path.resolve(__dirname, '..')
const scssPath = path.join(componentDir, 'SteamBottleSetup.scss')
const tsxPath = path.join(componentDir, 'SteamBottleSetup.tsx')

describe('SteamBottleSetup styling', () => {
  const scssContent = fs.readFileSync(scssPath, 'utf-8')
  const tsxContent = fs.readFileSync(tsxPath, 'utf-8')

  it('imports the co-located stylesheet from the component', () => {
    expect(tsxContent).toMatch(/import\s+['"]\.\/SteamBottleSetup\.scss['"]/)
  })

  it('defines the toast container selector', () => {
    expect(scssContent).toMatch(/\.steamBottleSetupToast\s*{/)
  })

  it('defines the message, action, and dismiss selectors', () => {
    expect(scssContent).toMatch(/\.steamBottleSetupMessage\s*{/)
    expect(scssContent).toMatch(/\.steamBottleSetupAction\s*{/)
    expect(scssContent).toMatch(/\.steamBottleSetupDismiss\s*{/)
  })

  it('gives the toast a visible background, elevated z-index, and padding (the exact regression)', () => {
    const toastRuleMatch = scssContent.match(
      /\.steamBottleSetupToast\s*{([^}]*)}/
    )
    expect(toastRuleMatch).not.toBeNull()
    const toastRule = toastRuleMatch ? toastRuleMatch[1] : ''
    expect(toastRule).toMatch(/background:/)
    expect(toastRule).toMatch(/z-index:/)
    expect(toastRule).toMatch(/padding:/)
  })
})
