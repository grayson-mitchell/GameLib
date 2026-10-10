import type { TFunction } from 'i18next'
import type {
  WinetricksFamilyKey,
  WinetricksTaskGroupId
} from 'common/winetricks/verbs'

// Exhaustive switches whose every arm calls `t` with a LITERAL key and the
// literal English default from the frozen copy table (45-03). Never a
// template-literal or computed key: i18next-parser cannot extract those and
// warns on them, and `pnpm i18n --fail-on-update` runs pre-push.
//
// The `gamelib:` namespace prefix is load-bearing. These helpers receive an
// INJECTED `t` (the caller's `useTranslation('gamelib')` result), so the parser
// sees no `useTranslation('gamelib')` in this file and would otherwise file the
// keys under the default `translation` namespace. At runtime the prefix names
// the namespace the injected `t` already uses, so it resolves identically. Same
// idiom as `RedeemSteamKeyDialog/copy.ts`.

export function familySentence(
  t: TFunction,
  family: WinetricksFamilyKey
): string {
  switch (family) {
    case 'vcrun':
      return t(
        'gamelib:winetricksBrowse.family.vcrun',
        'Microsoft Visual C++ runtime libraries many Windows games need to start.'
      )
    case 'dotnet':
      return t(
        'gamelib:winetricksBrowse.family.dotnet',
        '.NET Framework runtime some Windows games require.'
      )
    case 'vbrun':
      return t(
        'gamelib:winetricksBrowse.family.vbrun',
        'Visual Basic runtime libraries a few older titles depend on.'
      )
    case 'd3dx':
      return t(
        'gamelib:winetricksBrowse.family.d3dx',
        'DirectX helper libraries used by DirectX 9–11 games.'
      )
    case 'dxvk':
      return t(
        'gamelib:winetricksBrowse.family.dxvk',
        'DXVK — translates DirectX calls to Vulkan for better compatibility and performance.'
      )
    case 'physx':
      return t(
        'gamelib:winetricksBrowse.family.physx',
        'NVIDIA PhysX physics engine required by some older games.'
      )
    case 'xactXinput':
      return t(
        'gamelib:winetricksBrowse.family.xactXinput',
        'Xbox-style game audio and controller input support some games need.'
      )
    case 'fonts':
      return t(
        'gamelib:winetricksBrowse.family.fonts',
        'Common Windows fonts some games expect to already be installed.'
      )
    case 'media':
      return t(
        'gamelib:winetricksBrowse.family.media',
        'Windows media and video codec support some games use for in-game video.'
      )
    case 'fontsmooth':
      return t(
        'gamelib:winetricksBrowse.family.fontsmooth',
        "Font smoothing (ClearType) setting for this game's Wine environment."
      )
    case 'videomemorysize':
      return t(
        'gamelib:winetricksBrowse.family.videomemorysize',
        "Reported video memory size for this game's Wine environment."
      )
    case 'csmt':
      return t(
        'gamelib:winetricksBrowse.family.csmt',
        "Command-stream multithreading setting for this game's graphics driver."
      )
    case 'vd':
      return t(
        'gamelib:winetricksBrowse.family.vd',
        "Virtual desktop setting for this game's Wine environment."
      )
  }
}

export function taskGroupName(t: TFunction, id: WinetricksTaskGroupId): string {
  switch (id) {
    case 'runtimes':
      return t(
        'gamelib:winetricksBrowse.taskGroup.runtimes',
        'Runtimes & frameworks'
      )
    case 'directx':
      return t(
        'gamelib:winetricksBrowse.taskGroup.directx',
        'DirectX & graphics'
      )
    case 'fonts':
      return t('gamelib:winetricksBrowse.taskGroup.fonts', 'Fonts')
    case 'media':
      return t('gamelib:winetricksBrowse.taskGroup.media', 'Media & codecs')
    case 'wineSettings':
      return t(
        'gamelib:winetricksBrowse.taskGroup.wineSettings',
        'Wine settings'
      )
  }
}
