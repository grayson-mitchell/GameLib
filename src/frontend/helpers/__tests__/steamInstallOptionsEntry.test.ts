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
  showSteamMainButtonInstallOptions,
  showSteamSubMenuInstallOptions,
  type SteamCardInstallOptionsState,
  type SteamMainButtonInstallOptionsState,
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

// GameSubMenu's shared button class string. D4 guards ONE property: the
// install-options button added by 34.13-15 reuses this file's own idiom rather
// than inventing a bespoke class.
//
// D4 used to assert a WHOLE-FILE occurrence count of this string, pinned as
// `17 pre-edit + 1`. That proxy was re-baselined on 2026-08-21 because it
// measured the wrong thing in both directions:
//   - False RED: `be73db5cb` (260821-le0) added an unrelated "Remove all
//     copies" button using the same class. The count went 18 -> 19 and D4
//     failed even though the property it guards was untouched. Any future
//     button added to this file would break it again.
//   - False GREEN: a whole-file total is silently satisfiable. If the
//     install-options button LOST the class while any other button gained it,
//     the total would not move and D4 would still pass -- exactly the drift it
//     exists to catch.
// It now reads the class off that specific button, so it is stable under
// unrelated additions and cannot be satisfied by a compensating change
// elsewhere.
const SUBMENU_BUTTON_CLASS = 'link button is-text is-link buttonWithIcon'

// The install-options button is identified by its onClick handler, which is
// unique to it (the only other `openSteamInstallOptions` occurrence in the file
// is the import). Returns null when no such button is found, so a missing or
// renamed handler fails loudly rather than vacuously.
function installOptionsButtonClass(source: string): string | null {
  const handlerIdx = source.indexOf('openSteamInstallOptions(appName')
  if (handlerIdx === -1) return null

  const tagStart = source.lastIndexOf('<button', handlerIdx)
  if (tagStart === -1) return null

  // First `>` after the handler closes the opening tag -- the arrow in
  // `() => openSteamInstallOptions(...)` sits before handlerIdx, and a
  // className value contains no `>`.
  const tagEnd = source.indexOf('>', handlerIdx)
  if (tagEnd === -1) return null

  const openingTag = source.slice(tagStart, tagEnd + 1)
  return openingTag.match(/className="([^"]*)"/)?.[1] ?? null
}

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
      expect(showSteamCardInstallOptions({ ...cardBaseState, runner })).toBe(
        false
      )
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
  isInstalled: false,
  isDelisted: false
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

  // 34.13 review WR-05: a delisted Steam game is "confirmed unavailable on
  // Steam … not activatable" (common/types.ts). The submenu entry used to
  // ignore `is_delisted` entirely even though `gameInfo` is in scope at its
  // call site.
  it('B3b: steam + isInstalled false + isDelisted true -> false', () => {
    expect(
      showSteamSubMenuInstallOptions({
        ...subMenuBaseState,
        isDelisted: true
      })
    ).toBe(false)
  })

  it('B3b-RED: the pre-fix predicate (runner && !isInstalled only) would have returned true for that same delisted state', () => {
    // The known-bad implementation, written out so the discriminator is
    // visible: this is what shipped, and it answers `true` for a game the
    // fixed predicate correctly refuses.
    const preFix = ({
      runner,
      isInstalled
    }: {
      runner: string
      isInstalled: boolean
    }) => runner === 'steam' && !isInstalled
    const delistedState = { ...subMenuBaseState, isDelisted: true }
    expect(preFix(delistedState)).toBe(true)
    expect(showSteamSubMenuInstallOptions(delistedState)).toBe(false)
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
        isInstalled: state.isInstalled,
        isDelisted: state.isDelisted
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

  it('C6 (34.13 review B-WR-10): handlePlay routes an uninstalled STEAM game to the shared chokepoint before the generic install() helper can see it', () => {
    // The generic helper forwards `runner` verbatim and defaults
    // `installPath` to GameLib's `defaultInstallPath` -- NOT a Steam
    // library. `handlePlay`'s pre-existing guard excluded only `'sideload'`,
    // never `'steam'`, so a Steam game reaching it would install to the
    // wrong directory: verbatim the shape WR-02 already proved live once in
    // Console Mode. Reported LATENT (no rendered control was found that
    // reaches `handlePlay` in the not-installed/not-queued state), so this
    // gate exists to stop it becoming live.
    const source = readStrippedGameCard()
    const start = source.indexOf('async function handlePlay')
    expect(start).toBeGreaterThan(-1)
    const body = source.slice(start).replace(/\s+/g, ' ')

    const steamGuard = body.indexOf("gameInfo.runner === 'steam'")
    const genericInstall = body.indexOf('return install({')
    expect(steamGuard).toBeGreaterThan(-1)
    expect(genericInstall).toBeGreaterThan(-1)
    // ORDER is the whole property: a guard placed after the generic call
    // guards nothing.
    expect(steamGuard).toBeLessThan(genericInstall)
  })

  it('C6-RED: the ordering gate trips on a known-bad input DERIVED FROM THE REAL SOURCE with the guard removed', () => {
    const source = readStrippedGameCard()
    const start = source.indexOf('async function handlePlay')
    const knownBad = source
      .slice(start)
      .replace(/\s+/g, ' ')
      .replace("gameInfo.runner === 'steam'", 'REMOVED')
    expect(knownBad.indexOf("gameInfo.runner === 'steam'")).toBe(-1)
  })

  // ── 34.13 review B-WR-05 ────────────────────────────────────────────────
  //
  // C6 pinned the guard's ORDER relative to the generic install() and nothing
  // about its CONJUNCTS. The B-WR-10 guard dropped `!isQueued` (which the
  // branch it replaced for Steam carried) and `!isDelisted` (which every
  // sibling install route on this card enforces), and sat ABOVE the
  // `if (isQueued) { removeFromDMQueue }` handler -- so a queued,
  // not-installed Steam game would dispatch a SECOND install where the
  // pre-fix code dequeued.
  it('C7 (B-WR-05): the Steam guard carries !isInstalled, !isQueued and !isDelisted', () => {
    expect(() =>
      assertSteamGuardConjuncts(readStrippedGameCard())
    ).not.toThrow()
  })

  it.each(['!isQueued', '!isDelisted', '!isInstalled'])(
    'C7-RED: deleting "%s" from the guard, DERIVED FROM THE REAL SOURCE, is rejected',
    (conjunct) => {
      // `sliceSteamGuard` works on FLATTENED text, so the derivation must
      // too -- otherwise `replace` silently finds nothing and this RED spec
      // degenerates into a tautology.
      const source = readStrippedGameCard().replace(/\s+/g, ' ')
      const guard = sliceSteamGuard(source)
      const knownBad = source.replace(
        guard,
        guard.replace(`${conjunct} &&`, '')
      )
      expect(knownBad).not.toBe(source)
      expect(() => assertSteamGuardConjuncts(knownBad)).toThrow(
        new RegExp(`missing ${conjunct.replace('!', '\\!')}`)
      )
      // ...and C6's ordering obligation still passes on that same input,
      // which is why the conjuncts could go missing unnoticed.
      const body = knownBad
        .slice(knownBad.indexOf('async function handlePlay'))
        .replace(/\s+/g, ' ')
      expect(body.indexOf("gameInfo.runner === 'steam'")).toBeLessThan(
        body.indexOf('return install({')
      )
    }
  )
})

/** The `if (...)` condition of handlePlay's Steam guard, flattened. */
function sliceSteamGuard(source: string): string {
  const flattened = source.replace(/\s+/g, ' ')
  const marker = flattened.indexOf(
    "gameInfo.runner === 'steam' ) { openInstallGameModal("
  )
  const at =
    marker === -1 ? flattened.indexOf("gameInfo.runner === 'steam'") : marker
  if (at === -1) {
    throw new Error('sliceSteamGuard: the Steam guard is gone')
  }
  const start = flattened.lastIndexOf('if (', at)
  const end = flattened.indexOf(')', at)
  if (start === -1 || end === -1) {
    throw new Error('sliceSteamGuard: could not bound the Steam guard')
  }
  return flattened.slice(start, end + 1)
}

function assertSteamGuardConjuncts(source: string) {
  const guard = sliceSteamGuard(source)
  for (const conjunct of ['!isInstalled', '!isQueued', '!isDelisted']) {
    if (!guard.includes(conjunct)) {
      throw new Error(
        `assertSteamGuardConjuncts: handlePlay's Steam guard is missing ${conjunct} -- got "${guard}". Every sibling install route on this card enforces all three (items menu \`show: … && !isDelisted\`, showSteamCardInstallOptions, renderIcon's \`if (isDelisted) return null\`), and the branch this guard replaced carried !isQueued.`
      )
    }
  }
}

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

  it("D4: the install-options button carries the file's own class string", () => {
    const source = readStrippedGameSubMenu()
    expect(installOptionsButtonClass(source)).toBe(SUBMENU_BUTTON_CLASS)
  })

  it('D4b: that class string is genuinely shared, not invented by this button', () => {
    // The half the targeted check cannot see: "the file's OWN class string"
    // only means something if other buttons in the file use it too. Stable
    // under additions and removals, unlike the old exact-count pin.
    const source = readStrippedGameSubMenu()
    const occurrences = (
      source.match(new RegExp(SUBMENU_BUTTON_CLASS, 'g')) ?? []
    ).length
    expect(occurrences).toBeGreaterThan(1)
  })

  it('D4 DISCRIMINATOR: the same extraction rejects a bespoke class string', () => {
    // Anti-vacuity proof carried in the suite itself rather than left to a
    // one-off manual check: mutate ONLY the install-options button's class in
    // a copy of the source and confirm the extractor reports the mutation.
    // If this ever passes while D4 also passes on mutated input, D4 is dead.
    const mutated = readStrippedGameSubMenu().replace(
      /(<button\s+onClick=\{\(\) => openSteamInstallOptions\(appName[^>]*?className=")[^"]*(")/,
      '$1bespoke-install-button$2'
    )
    expect(installOptionsButtonClass(mutated)).toBe('bespoke-install-button')
    expect(installOptionsButtonClass(mutated)).not.toBe(SUBMENU_BUTTON_CLASS)
  })

  it('D5: zero occurrences of Dropdown and zero of ContextMenu (a third, distinct idiom)', () => {
    const source = readStrippedGameSubMenu()
    expect((source.match(/Dropdown/g) ?? []).length).toBe(0)
    expect((source.match(/ContextMenu/g) ?? []).length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 34.13 review C-04 — the THIRD door.
//
// This module's own doc claimed to be "the SINGLE site where `runner ===
// 'steam'` is evaluated for these entries". The `MainButton` caret, added by
// the same phase, inlined its own conjunct and was the only one of the three
// not gated on `is_delisted`. These specs cover the new shared predicate; the
// element-graph proof that the caret actually disappears for a delisted game
// is `MainButton.steamSplitButton.test.tsx` S10/S10b.
// ---------------------------------------------------------------------------
const mainButtonBaseState: SteamMainButtonInstallOptionsState = {
  runner: 'steam',
  isInstalled: false,
  isQueued: false,
  isDelisted: false,
  installDisabled: false
}

describe('showSteamMainButtonInstallOptions (34.13 review C-04)', () => {
  it('E1: steam + not installed + not queued + not delisted + install enabled -> true', () => {
    expect(showSteamMainButtonInstallOptions(mainButtonBaseState)).toBe(true)
  })

  it.each(NON_STEAM_RUNNERS)('E2: D-28: %s -> false', (runner) => {
    expect(
      showSteamMainButtonInstallOptions({ ...mainButtonBaseState, runner })
    ).toBe(false)
  })

  it.each([
    ['isInstalled', { isInstalled: true }],
    ['isQueued', { isQueued: true }],
    ['isDelisted', { isDelisted: true }],
    ['installDisabled', { installDisabled: true }]
  ] as Array<[string, Partial<SteamMainButtonInstallOptionsState>]>)(
    'E3: %s alone suppresses the caret',
    (_label, override) => {
      expect(
        showSteamMainButtonInstallOptions({
          ...mainButtonBaseState,
          ...override
        })
      ).toBe(false)
    }
  )

  it('E4: DISCRIMINATOR — isDelisted is the term the pre-fix inline conjunct lacked, so it must flip the verdict on its own', () => {
    // The pre-fix expression was exactly
    // `runner === 'steam' && !isInstalled && !isQueued && !installDisabled`.
    // Evaluated here against the SAME state, it says `true` for a delisted
    // game; the shared predicate must say `false`. If this ever stops being
    // a real difference, the fix has been reverted.
    const delisted = { ...mainButtonBaseState, isDelisted: true }
    const preFixVerdict =
      delisted.runner === 'steam' &&
      !delisted.isInstalled &&
      !delisted.isQueued &&
      !delisted.installDisabled
    expect(preFixVerdict).toBe(true)
    expect(showSteamMainButtonInstallOptions(delisted)).toBe(false)
  })

  it('E5: the MainButton caret no longer inlines the conjunct — it calls the shared predicate', () => {
    const source = stripSourceComments(
      readFileSync(
        join(
          __dirname,
          '..',
          '..',
          'screens/Game/GamePage/components/MainButton.tsx'
        ),
        'utf8'
      )
    )
    expect(source).toMatch(/showSteamMainButtonInstallOptions\(\{/)
    // The pre-fix inline form, which this module's doc comment says must
    // not exist in any component file.
    expect(source).not.toMatch(
      /gameInfo\.runner === 'steam' &&\s*!is_installed/
    )
  })
})
