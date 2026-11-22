// Quick 261123-bbi: source census for the refresh buttons that spin through
// useMinimumSpin. The frontend jest project has no jsdom by default, so the
// call sites are pinned by source text; the hook's behaviour is proven in
// useMinimumSpin.test.ts and the Humble Keys acceptance case in its own
// component test.
//
// HONEST SCOPE: this pins the six known sites only. A NEW refresh button that
// skips the hook is not detected here (D-6).
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

type Site = {
  name: string
  path: string
  // patterns that must NOT appear in the comment-stripped source
  forbidden: RegExp[]
  // patterns that MUST appear
  required: RegExp[]
}

const FRONTEND = resolve(__dirname, '..', '..')

const SITES: Site[] = [
  {
    name: 'Humble Keys',
    path: 'screens/Humble/Keys/index.tsx',
    forbidden: [/(spinning|'fa-spin'): humble\.syncing/],
    required: []
  },
  {
    name: 'Library header',
    path: 'components/UI/Header/index.tsx',
    forbidden: [
      /const refreshButtonSpinning = refreshing \|\| anyScopedRefresh/
    ],
    required: [
      /spinning: refreshButtonSpinning/,
      /isSteamSyncing && !refreshButtonSpinning/
    ]
  },
  {
    name: 'Wine Manager',
    path: 'screens/WineManager/index.tsx',
    forbidden: [/'fa-spin': refreshingWineVersions/],
    required: []
  },
  {
    name: 'Error screen',
    path: 'components/UI/ErrorComponent/index.tsx',
    forbidden: [],
    required: [/fa-spin/, /refreshIcon/]
  },
  {
    name: 'Apple wiki rating refresh',
    path: 'screens/Game/GamePage/components/AppleWikiInfo.tsx',
    forbidden: [],
    required: [/fa-spin/]
  },
  {
    name: 'Wiki-info Retry',
    path: 'screens/Game/GamePage/components/WikiInfoEmptyState.tsx',
    forbidden: [],
    required: [/fa-spin/]
  }
]

describe('refresh buttons route their spin through useMinimumSpin (261123-bbi)', () => {
  describe.each(SITES)('$name', (site) => {
    const src = stripSourceComments(
      readFileSync(resolve(FRONTEND, site.path), 'utf8')
    )

    it('imports useMinimumSpin from frontend/hooks/useMinimumSpin', () => {
      expect(src).toMatch(
        /import\s*\{\s*useMinimumSpin\s*\}\s*from\s*'frontend\/hooks\/useMinimumSpin'/
      )
    })

    it('calls useMinimumSpin( exactly once', () => {
      expect(src.match(/useMinimumSpin\(/g)).toHaveLength(1)
    })

    it('calls the onClickStart function somewhere', () => {
      const m = src.match(/onClickStart:\s*(\w+)/)
      const name = m ? m[1] : 'onClickStart'
      expect(src).toMatch(new RegExp(`\\b${name}\\(\\)`))
    })

    it('reads the hook spinning value for an fa-spin class key', () => {
      const m = src.match(/spinning:\s*(\w+)/)
      expect(m).not.toBeNull()
      const name = (m as RegExpMatchArray)[1]
      expect(src).toMatch(
        new RegExp(`[\\[\\]'"]*fa-spin[\\[\\]'"]*\\s*:\\s*${name}\\b`)
      )
    })

    if (site.name === 'Apple wiki rating refresh') {
      it('calls useMinimumSpin( above the first early `return null`', () => {
        expect(src.indexOf('useMinimumSpin(')).toBeGreaterThan(-1)
        expect(src.indexOf('useMinimumSpin(')).toBeLessThan(
          src.indexOf('return null')
        )
      })
    }

    // Plain loops, not it.each: an empty table makes jest fail the suite.
    for (const re of site.forbidden) {
      it(`does not contain ${re}`, () => {
        expect(src).not.toMatch(re)
      })
    }

    for (const re of site.required) {
      it(`contains ${re}`, () => {
        expect(src).toMatch(re)
      })
    }
  })
})
