import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  resolveDefaultPlatform,
  resolveMacNativeOffered
} from '../defaultPlatform'
import type { Runner } from 'common/types'

/**
 * Quick task `260824-u8b`.
 *
 * Unlike this directory's `installModalSource.test.ts` — which can only assert on RAW SOURCE,
 * because `index.tsx` imports `./index.scss` on its first line and this repo's Frontend jest
 * project has no jsdom — the platform-default rule now lives in a pure module with no side-effect
 * imports. So the first describe below is a REAL behavioural assertion, not a source grep.
 *
 * The `{children}` ordering gate at the bottom is still necessarily a source gate, and is marked
 * as such.
 */

const NON_STEAM_RUNNERS: Runner[] = ['legendary', 'gog', 'nile', 'sideload']

describe('resolveDefaultPlatform (quick 260824-u8b)', () => {
  describe('non-Steam runners derive the default from is_mac_native', () => {
    it.each(NON_STEAM_RUNNERS)(
      'defaults to Mac for a mac-native %s title on a macOS host, even with NO steam depot signal',
      (runner) => {
        expect(
          resolveDefaultPlatform({
            isMac: true,
            runner,
            // The exact live condition: a non-Steam title has no depot probe at all, so this is
            // false. Before this fix that alone forced 'Windows'.
            macDepotOffered: false,
            isMacNative: true
          })
        ).toBe('Mac')
      }
    )

    it.each(NON_STEAM_RUNNERS)(
      'defaults to Windows for a NON-mac-native %s title on a macOS host',
      (runner) => {
        expect(
          resolveDefaultPlatform({
            isMac: true,
            runner,
            macDepotOffered: false,
            isMacNative: false
          })
        ).toBe('Windows')
      }
    )
  })

  describe('Steam is UNCHANGED — anti-regression', () => {
    /**
     * THE load-bearing assertion of this file.
     *
     * The naive fix for the reported bug is `macOffered = isMacNative` for every runner. That
     * implementation passes every other test here and FAILS this one, which is why this case
     * exists: Steam must keep deriving its default from the DEPOT PROBE, per the 34.15 D-14
     * reasoning quoted in `index.tsx` (mac-only Steam games are a null set; Windows-via-bottle
     * always works; the probe is legitimately unresolved at modal open).
     */
    it('defaults to Windows for a Steam title whose depot signal says NO mac depot, even when is_mac_native is true', () => {
      expect(
        resolveDefaultPlatform({
          isMac: true,
          runner: 'steam',
          macDepotOffered: false,
          isMacNative: true
        })
      ).toBe('Windows')
    })

    it('defaults to Mac for a Steam title whose depot signal DOES offer a mac depot', () => {
      expect(
        resolveDefaultPlatform({
          isMac: true,
          runner: 'steam',
          macDepotOffered: true,
          isMacNative: false
        })
      ).toBe('Mac')
    })

    it('reads the depot signal for steam and the library signal for everyone else', () => {
      const input = { macDepotOffered: false, isMacNative: true }
      expect(resolveMacNativeOffered({ runner: 'steam', ...input })).toBe(false)
      expect(resolveMacNativeOffered({ runner: 'legendary', ...input })).toBe(
        true
      )
    })
  })

  describe('a non-macOS host never defaults to Mac', () => {
    it.each([...NON_STEAM_RUNNERS, 'steam' as Runner])(
      'returns Windows for %s regardless of either mac signal',
      (runner) => {
        expect(
          resolveDefaultPlatform({
            isMac: false,
            runner,
            macDepotOffered: true,
            isMacNative: true
          })
        ).toBe('Windows')
      }
    )
  })
})

/**
 * SOURCE GATE (vacuity boundary: proves the source encodes the ordering, NOT that it renders —
 * same limitation `installModalSource.test.ts` documents at length).
 */
describe('the platform selector renders FIRST inside DialogContent', () => {
  /**
   * `SteamDialog` is DELIBERATELY ABSENT from this list, and that is a finding rather than an
   * omission.
   *
   * It carries its own D-24 layout contract, pinned by
   * `SteamDialog/__tests__/steamDialogSource.test.ts`: the `libraryMissingNotice` degrade notice
   * must occur BEFORE `{children}`, and the D-14 `sharedBottleNotice` AFTER it. Moving
   * `{children}` to the top of SteamDialog was attempted during this task and turned that suite
   * RED — a documented Steam-specific decision that this quick task has no mandate to overturn,
   * and whose own test text already calls `{children}` "the first thing in DialogContent" while
   * requiring a notice above it.
   *
   * Left as-is on purpose. Revisiting SteamDialog's ordering is its own decision, not a side
   * effect of fixing the non-Steam platform default.
   */
  const DIALOGS = ['DownloadDialog', 'ImportDialog', 'ThirdPartyDialog']

  it.each(DIALOGS)(
    '%s renders {children} as the first child of <DialogContent>',
    (dialog) => {
      const source = stripSourceComments(
        readFileSync(join(__dirname, '..', dialog, 'index.tsx'), 'utf-8')
      )

      const openIndex = source.indexOf('<DialogContent>')
      expect(openIndex).toBeGreaterThan(-1)

      const firstChild = source
        .slice(openIndex + '<DialogContent>'.length)
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0)

      expect(firstChild).toBe('{children}')
    }
  )

  it('fails against a known-bad specimen where {children} is last (proves the gate is not vacuous)', () => {
    const knownBad = `
      <DialogContent>
        <PathSelectionBox />
        {children}
      </DialogContent>`
    const openIndex = knownBad.indexOf('<DialogContent>')
    const firstChild = knownBad
      .slice(openIndex + '<DialogContent>'.length)
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0)

    expect(firstChild).not.toBe('{children}')
    expect(firstChild).toBe('<PathSelectionBox />')
  })
})
