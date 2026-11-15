/**
 * Source-text gate for the placement of the "Use frameless window" toggle and the "Tray Icon"
 * select (quick task 261115-t7m): they render on Appearance, not in Settings > General.
 *
 * No jsdom in the frontend jest project, so Accessibility/index.tsx is never imported (see
 * `index.test.tsx` in this folder); assertions scan `stripSourceComments`-stripped source.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const read = (path: string) => stripSourceComments(readFileSync(path, 'utf8'))

const accessibility = read(join(__dirname, '..', 'index.tsx'))
const general = read(
  join(
    __dirname,
    '..',
    '..',
    'Settings',
    'sections',
    'GeneralSettings',
    'index.tsx'
  )
)

describe('window settings placement (quick 261115-t7m)', () => {
  it('General no longer renders the tray icon select or frameless toggle', () => {
    expect(general).not.toContain('UseDarkTrayIcon')
    expect(general).not.toContain('UseFramelessWindow')
  })

  it('Appearance renders both components', () => {
    expect(accessibility).toContain('<UseFramelessWindow />')
    expect(accessibility).toContain('<UseDarkTrayIcon />')
  })

  it('both render after ThemeSelector and inside the provider-wrapped page body', () => {
    const theme = accessibility.indexOf('<ThemeSelector />')
    const wrapper = accessibility.indexOf(
      'export default function AccessibilityWrapper'
    )
    for (const tag of ['<UseFramelessWindow />', '<UseDarkTrayIcon />']) {
      const at = accessibility.indexOf(tag)
      expect(at).toBeGreaterThan(theme)
      expect(at).toBeLessThan(wrapper)
    }
  })

  it('the toggle is not nested in a label', () => {
    expect(accessibility).not.toMatch(/<label[^>]*>\s*<UseFramelessWindow/)
  })
})
