import type { TFunction } from 'i18next'

/**
 * G1 (59-22): the one label for every phase of getting the built-in engine
 * ready. The backend context is `downloading:<0-100>`, `verifying`,
 * `extracting` or `setting-up`; a bare integer is the pre-phase format.
 * Anything else renders the 0% download label (T-59-79).
 */
export function engineDownloadLabel(
  context: string | undefined,
  t: TFunction<'gamepage', undefined>
): string {
  switch (context) {
    case 'verifying':
      return t(
        'gamelib:steam.engine.status.verifying',
        'Verifying built-in engine'
      )
    case 'extracting':
      return t(
        'gamelib:steam.engine.status.extracting',
        'Unpacking built-in engine'
      )
    case 'setting-up':
      return t(
        'gamelib:steam.engine.status.settingUp',
        'Setting up built-in engine'
      )
  }
  const match = /^(?:downloading:)?(\d{1,3})$/.exec(context ?? '')
  const percent = match ? Math.min(Number(match[1]), 100) : 0
  return t(
    'gamelib:steam.engine.status.downloading',
    'Downloading built-in engine ({{percent}}%)',
    { percent: String(percent) }
  )
}
