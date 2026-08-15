/**
 * Task 1 (34.13-15) — D-27 rows 3/5, D-28 containment.
 *
 * Neither `GameCard/index.tsx` nor `GameSubMenu/index.tsx` can be imported
 * into this jest project: both `import './index.css'` at line 1, and this
 * repo carries no jsdom / react-test-renderer (`src/frontend/jest.config.js`
 * docstring, `testEnvironment: 'node'`). Groups A/B below are pure-function
 * specs against `steamInstallOptionsEntry.ts` directly; Groups C/D are
 * comment-stripped source-text gates over the two `.tsx` files, following
 * `framelessWindowCopy.test.ts`'s idiom.
 *
 * VACUITY BOUNDARY: this suite proves the two predicates' values and proves
 * that both `.tsx` files' stripped source calls the shared predicate and
 * imports the shared door. It proves NOTHING about whether either menu item
 * actually renders, is visible, or is reachable by mouse/keyboard/gamepad —
 * that is 34.13-13's manual gate (see this plan's `<verification>`).
 *
 * All source gates below run over `stripSourceComments`-stripped text
 * specifically so this task's OWN explanatory code comments (which
 * legitimately name the forbidden/required identifiers to explain the D-27
 * corrections) can neither satisfy nor break a gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  showSteamCardInstallOptions,
  showSteamSubMenuInstallOptions,
  type SteamCardInstallOptionsState,
  type SteamSubMenuInstallOptionsState
} from '../steamInstallOptionsEntry'

const GAME_CARD_PATH = join(
  __dirname,
  '..',
  '..',
  'screens/Library/components/GameCard/index.tsx'
)
const GAME_SUB_MENU_PATH = join(
  __dirname,
  '..',
  '..',
  'screens/Game/GameSubMenu/index.tsx'
)

// Pre-edit count of GameSubMenu's existing button class string, pinned at
// authoring time via `git show HEAD:<path> | grep -c "..."` so spec D4
// cannot pass on a file where the new button was added with a different
// class string.
const PRE_EDIT_SUBMENU_BUTTON_CLASS_COUNT = 17
const EXPECTED_SUBMENU_BUTTON_CLASS_COUNT =
  PRE_EDIT_SUBMENU_BUTTON_CLASS_COUNT + 1

function readStrippedGameCard(): string {
  return stripSourceComments(readFileSync(GAME_CARD_PATH, 'utf8'))
}

function readStrippedGameSubMenu(): string {
  return stripSourceComments(readFileSync(GAME_SUB_MENU_PATH, 'utf8'))
}

const NON_STEAM_RUNNERS = ['gog', 'legendary', 'nile', 'sideload'] as const

const cardBaseState: SteamCardInstallOptionsState = {
  runner: 'steam',
  isInstalled: false,
  isQueued: false,
  isInstallable: true,
  isDelisted: false
}

describe('showSteamCardInstallOptions (D-27 row 3, D-28)', () => {
  it('A1: steam + not installed + not queued + installable + not delisted -> true', () => {
    expect(showSteamCardInstallOptions(cardBaseState)).toBe(true)
  })

  it.each(NON_STEAM_RUNNERS)(
    'A2 DISCRIMINATOR: D-28 -- no non-Steam runner (%s) ever sees this entry',
    (runner) => {
      expect(
        showSteamCardInstallOptions({ ...cardBaseState, runner })
      ).toBe(false)
    }
  )

  it('A3: steam + isInstalled true -> false', () => {
    expect(
      showSteamCardInstallOptions({ ...cardBaseState, isInstalled: true })
    ).toBe(false)
  })

  it('A4: steam + isQueued true -> false', () => {
    expect(
      showSteamCardInstallOptions({ ...cardBaseState, isQueued: true })
    ).toBe(false)
  })

  it('A5: steam + isInstallable false -> false', () => {
    expect(
      showSteamCardInstallOptions({ ...cardBaseState, isInstallable: false })
    ).toBe(false)
  })

  it('A6: steam + isDelisted true -> false', () => {
    expect(
      showSteamCardInstallOptions({ ...cardBaseState, isDelisted: true })
    ).toBe(false)
  })

  it('A7: pure function -- same input twice yields the same result, and no window stub is installed here so a stray window.api read would throw rather than pass silently', () => {
    expect(typeof (global as unknown as { window?: unknown }).window).toBe(
      'undefined'
    )
    const first = showSteamCardInstallOptions(cardBaseState)
    const second = showSteamCardInstallOptions(cardBaseState)
    expect(first).toBe(true)
    expect(second).toBe(true)
  })
})

const subMenuBaseState: SteamSubMenuInstallOptionsState = {
  runner: 'steam',
  isInstalled: false
}

describe('showSteamSubMenuInstallOptions (D-27 row 5, D-28)', () => {
  it('B1: steam + isInstalled false -> true', () => {
    expect(showSteamSubMenuInstallOptions(subMenuBaseState)).toBe(true)
  })

  it.each(NON_STEAM_RUNNERS)(
    'B2 DISCRIMINATOR: D-28 -- non-Steam runner (%s) with isInstalled false -> false',
    (runner) => {
      expect(
        showSteamSubMenuInstallOptions({ ...subMenuBaseState, runner })
      ).toBe(false)
    }
  )

  it('B3: steam + isInstalled true -> false', () => {
    expect(
      showSteamSubMenuInstallOptions({
        ...subMenuBaseState,
        isInstalled: true
      })
    ).toBe(false)
  })

  it('B4: the two predicates are NOT the same function -- a state where the card is false and the submenu is true', () => {
    const state = {
      runner: 'steam' as const,
      isInstalled: false,
      isQueued: true,
      isInstallable: true,
      isDelisted: false
    }
    expect(showSteamCardInstallOptions(state)).toBe(false)
    expect(
      showSteamSubMenuInstallOptions({
        runner: state.runner,
        isInstalled: state.isInstalled
      })
    ).toBe(true)
  })
})

describe('GameCard/index.tsx source gates (D-27 row 3, D-28 -- comment-stripped)', () => {
  it('C1: uses the shared predicate rather than an inline conjunct, gate proven non-vacuous', () => {
    const source = readStrippedGameCard()
    expect(source).toMatch(/showSteamCardInstallOptions/)

    const matcher = /showSteamCardInstallOptions/
    const inlineSpecimen =
      "show: runner === 'steam' && !isInstalled && !isQueued && isInstallable && !isDelisted"
    expect(matcher.test(inlineSpecimen)).toBe(false)
  })

  it('C2: calls openSteamInstallOptions', () => {
    expect(readStrippedGameCard()).toMatch(/openSteamInstallOptions/)
  })

  it('C3: the pre-existing plain install entry is untouched (D-28 proof by absence-of-change)', () => {
    const source = readStrippedGameCard()
    expect(source).toContain("label: t('button.install')")
    expect(source).toContain(
      'show: !isInstalled && !isQueued && isInstallable && !isDelisted'
    )
  })

  it('C4: openInstallGameModal still appears (the sideload handleEdit path was not collaterally removed)', () => {
    expect(readStrippedGameCard()).toMatch(/openInstallGameModal/)
  })

  it('C5: zero occurrences of startSteamQuickInstall (no second route to the quick half)', () => {
    const source = readStrippedGameCard()
    const count = (source.match(/startSteamQuickInstall/g) ?? []).length
    expect(count).toBe(0)
  })
})

describe('GameSubMenu/index.tsx source gates (D-27 row 5, D-28 -- comment-stripped)', () => {
  it('D1: uses the shared predicate', () => {
    expect(readStrippedGameSubMenu()).toMatch(/showSteamSubMenuInstallOptions/)
  })

  it('D2: calls openSteamInstallOptions', () => {
    expect(readStrippedGameSubMenu()).toMatch(/openSteamInstallOptions/)
  })

  it("D3: the file's existing installed-gated cluster is untouched", () => {
    const source = readStrippedGameSubMenu()
    expect(source).toContain('{isInstalled && (')
    expect(source).toContain("t('button.edit-game', 'Edit Game')")
  })

  it('D4: the new button carries the file\'s own class string -- pinned pre/post-edit counts', () => {
    const source = readStrippedGameSubMenu()
    const count = (
      source.match(/link button is-text is-link buttonWithIcon/g) ?? []
    ).length
    expect(count).toBe(EXPECTED_SUBMENU_BUTTON_CLASS_COUNT)
  })

  it('D5: zero occurrences of Dropdown and zero of ContextMenu (a third, distinct idiom)', () => {
    const source = readStrippedGameSubMenu()
    expect((source.match(/Dropdown/g) ?? []).length).toBe(0)
    expect((source.match(/ContextMenu/g) ?? []).length).toBe(0)
  })
})
