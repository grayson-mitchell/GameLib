import { TFunction } from 'i18next'

import { InstallPlatform } from 'common/types'

// Phase 34.8-08a (REQ-34.8-01/-11/-17): the 13 native file-picker filter
// labels/extension-descriptors this plan retrofits, extracted out of
// `index.tsx` into this standalone module.
//
// [Rule 3 - blocking issue, deviation from the plan's stated "extract...
// in this file" action] `index.tsx` has `import './index.scss'` as its very
// first line -- this project's jsdom-less jest config (no `.scss`
// transform/moduleNameMapper, see `src/frontend/jest.config.js`) cannot
// parse a `.scss` import, so any test file that imports anything from
// `index.tsx` (even a named export with no rendering) fails with "Jest
// encountered an unexpected token" the moment `index.tsx` itself is
// evaluated. Extracting these two pure, `t`-parameterized functions into
// this SCSS-free sibling module lets the test import them in isolation --
// the same posture already used for `ThemeSelector`'s `themeLabels.ts`
// split earlier in this same plan.
//
// ONE key is reused across all three byte-identical 'All' filter-catch-all
// sites, and ONE key is reused across the two byte-identical 'Other
// Binaries' sites (linux/osx), per this plan's <action> instruction --
// this keeps the generated catalog small and each distinct English string
// a single translation unit.

export function localImageFilters(t: TFunction) {
  return [
    {
      name: t('gamelib:sideload.filter.images', 'Images'),
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']
    },
    { name: t('gamelib:sideload.filter.all', 'All'), extensions: ['*'] }
  ]
}

export function fileFilters(platform: InstallPlatform, t: TFunction) {
  switch (platform) {
    case 'Windows':
    case 'windows':
    case 'Win32':
      return [
        {
          name: t('gamelib:sideload.filter.executables', 'Executables'),
          extensions: ['exe', 'msi']
        },
        {
          name: t('gamelib:sideload.filter.scripts', 'Scripts'),
          extensions: ['bat']
        },
        { name: t('gamelib:sideload.filter.all', 'All'), extensions: ['*'] }
      ]
    case 'linux':
      return [
        {
          name: t('gamelib:sideload.filter.appImages', 'AppImages'),
          extensions: [
            t('gamelib:sideload.filter.appImageExtension', 'AppImage')
          ]
        },
        {
          name: t('gamelib:sideload.filter.otherBinaries', 'Other Binaries'),
          extensions: ['sh', 'py', 'bin']
        },
        { name: t('gamelib:sideload.filter.all', 'All'), extensions: ['*'] }
      ]
    case 'osx':
    case 'Mac':
      return [
        {
          name: t('gamelib:sideload.filter.apps', 'Apps'),
          extensions: [t('gamelib:sideload.filter.appExtension', 'App')]
        },
        {
          name: t('gamelib:sideload.filter.otherBinaries', 'Other Binaries'),
          extensions: ['sh', 'py', 'bin']
        },
        { name: t('gamelib:sideload.filter.all', 'All'), extensions: ['*'] }
      ]
    // FIXME: Can these happen?
    case 'Android':
    case 'iOS':
    case 'Browser':
      return []
  }
}
