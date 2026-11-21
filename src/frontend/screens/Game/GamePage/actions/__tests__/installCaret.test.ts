import type { Runner } from 'common/types'
import { installCaretItem } from '../installCaret'

const idle = {
  isInstalled: false,
  isQueued: false,
  isInstalling: false,
  isImporting: false,
  isDelisted: false,
  installDisabled: false
}

describe('installCaretItem (D-20)', () => {
  it('steam, not installed, enabled -> steamOptions', () => {
    expect(installCaretItem({ ...idle, runner: 'steam' })).toBe('steamOptions')
  })

  it.each([
    ['delisted', { isDelisted: true }],
    ['installed', { isInstalled: true }],
    ['queued', { isQueued: true }]
  ])('steam %s -> null', (_name, patch) => {
    expect(installCaretItem({ ...idle, runner: 'steam', ...patch })).toBeNull()
  })

  it.each(['gog', 'legendary', 'nile', 'sideload'] as Runner[])(
    '%s, not installed, idle -> locate',
    (runner) => {
      expect(installCaretItem({ ...idle, runner })).toBe('locate')
    }
  )

  it('keeps the door when the install button is disabled as unsupported (third-party)', () => {
    expect(
      installCaretItem({ ...idle, runner: 'gog', installDisabled: true })
    ).toBe('locate')
  })

  it.each([
    ['installing', { isInstalling: true }],
    ['importing', { isImporting: true }],
    ['queued', { isQueued: true }]
  ])('non-steam %s -> null (unmounted, not disabled)', (_name, patch) => {
    expect(installCaretItem({ ...idle, runner: 'gog', ...patch })).toBeNull()
  })

  it.each(['steam', 'gog', 'legendary', 'nile', 'sideload'] as Runner[])(
    'installed %s -> null',
    (runner) => {
      expect(
        installCaretItem({ ...idle, runner, isInstalled: true })
      ).toBeNull()
    }
  )
})
