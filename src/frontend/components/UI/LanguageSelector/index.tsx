import { useContext, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { configStore } from 'frontend/helpers/electronStores'
import ContextProvider from 'frontend/state/ContextProvider'
import { SelectField } from '..'
import { MenuItem } from '@mui/material'
import type { SupportedLanguage } from 'common/languages'
import {
  buildTranslationIssueUrl,
  shouldShowMtNotice
} from './translationIssue'

const storage: Storage = window.localStorage

export enum FlagPosition {
  NONE = 'none',
  PREPEND = 'prepend',
  APPEND = 'append'
}

interface Props {
  flagPossition?: FlagPosition
  // Login screen renders the picker bare (no "Choose App Language" label)
  // beside the "Go to Library" button; Settings keeps the labelled form.
  hideLabel?: boolean
}

const languageLabels: Record<SupportedLanguage, string> = {
  ar: 'العربية',
  az: 'آذربایجان دیلی',
  be: 'беларуская мова',
  bg: 'български',
  bs: 'bosanski',
  ca: 'Català',
  cs: 'Čeština',
  de: 'Deutsch',
  el: 'Greek',
  en: 'English',
  es: 'Español',
  et: 'Eesti keel',
  eu: 'Euskara',
  fa: 'فارسی',
  fi: 'Suomen kieli',
  fr: 'Français',
  ga: 'Gaeilge',
  gl: 'Galego',
  he: 'עברית',
  hu: 'Magyar',
  hr: 'Hrvatski',
  ja: '日本語',
  ko: '한국어',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  lt: 'Lietuvių',
  ml: 'മലയാളം',
  nb_NO: 'bokmål',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português',
  pt_BR: 'Português (Brasil)',
  ro: 'limba română',
  ru: 'Русский',
  sk: 'slovenčina',
  sr: 'српски језик',
  sv: 'Svenska',
  ta: 'தமிழ்',
  tr: 'Türkçe',
  uk: 'украї́нська мо́ва',
  vi: 'tiếng Việt',
  zh_Hans: '简体中文',
  zh_Hant: '正體字'
}

const languageFlags: Record<SupportedLanguage, string> = {
  ar: '🇸🇦',
  az: '🇦🇿',
  be: '🇧🇾',
  bg: '🇧🇬',
  bs: '🇧🇦',
  ca: '🇪🇸',
  cs: '🇨🇿',
  de: '🇩🇪',
  el: '🇬🇷',
  en: '🇬🇧',
  es: '🇪🇸',
  et: '🇪🇪',
  eu: '🇪🇸',
  fa: '🇮🇷',
  fi: '🇫🇮',
  fr: '🇫🇷',
  ga: '🇮🇪',
  gl: '🇪🇸',
  he: '🇮🇱',
  hu: '🇭🇺',
  hr: '🇭🇷',
  ja: '🇯🇵',
  ko: '🇰🇷',
  id: '🇮🇩',
  it: '🇮🇹',
  lt: '🇱🇹',
  ml: '🇮🇳',
  nb_NO: '🇳🇴',
  nl: '🇳🇱',
  pl: '🇵🇱',
  pt: '🇵🇹',
  pt_BR: '🇧🇷',
  ro: '🇷🇴',
  ru: '🇷🇺',
  sr: '🇷🇸',
  sk: '🇸🇰',
  sv: '🇸🇪',
  ta: '🇮🇳',
  tr: '🇹🇷',
  uk: '🇺🇦',
  vi: '🇻🇳',
  zh_Hans: '🇨🇳',
  zh_Hant: '🇹🇼'
}

export default function LanguageSelector({
  flagPossition = FlagPosition.NONE,
  hideLabel = false
}: Props) {
  const { t, i18n } = useTranslation()
  const { language, setLanguage } = useContext(ContextProvider)
  const currentLanguage = language || i18n.language || 'en'

  const handleChangeLanguage = (newLanguage: string) => {
    window.api.changeLanguage(newLanguage)
    storage.setItem('language', newLanguage)
    configStore.set('language', newLanguage)
    i18n.changeLanguage(newLanguage)
    setLanguage(newLanguage)
  }

  const label =
    languageLabels[currentLanguage as SupportedLanguage] ?? currentLanguage

  const handleReportTranslationProblem = () => {
    window.api.openExternalUrl(buildTranslationIssueUrl(currentLanguage, label))
  }

  const handleReportTranslationProblemKeyDown = (
    event: KeyboardEvent<HTMLAnchorElement>
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleReportTranslationProblem()
    }
  }

  const renderOption = (lang: SupportedLanguage) => {
    const flag = languageFlags[lang]
    let label = languageLabels[lang]
    if (flagPossition === FlagPosition.PREPEND) label = `${flag} ${label}`
    if (flagPossition === FlagPosition.APPEND) label = `${label} ${flag}`

    return (
      <MenuItem key={lang} value={lang}>
        {label}
      </MenuItem>
    )
  }

  // 260925-88h: the app-wide MT disclosure + report link. Never shown for
  // English -- see shouldShowMtNotice. The Weblate link that used to render
  // here (its enabling prop, now removed from this component's Props) was
  // deleted: it was never enabled anywhere (measured -- GeneralSettings used
  // the default false, Login passed false explicitly), and it pointed at
  // Heroic's own Weblate project, which GameLib -- an independent fork that
  // does not pull from Heroic -- never reads corrections from for ANY
  // string, fork or upstream-copied. The `openWeblate` IPC channel and
  // `weblateUrl` constant are left in place (removing a channel is a
  // preload-surface/seam-parity change, out of this quick task's scope) but
  // are now unreferenced by the frontend.
  let afterSelect = null
  if (shouldShowMtNotice(currentLanguage)) {
    afterSelect = (
      <>
        <p className="smallLink languageSelectorMtNotice">
          {t(
            'gamelib:languageSelector.mtNotice',
            'Some text in this language was machine-translated and may contain mistakes.'
          )}
        </p>
        <a
          className="link"
          role="button"
          tabIndex={0}
          onClick={handleReportTranslationProblem}
          onKeyDown={handleReportTranslationProblemKeyDown}
        >
          {t(
            'gamelib:languageSelector.reportTranslationProblem',
            'Report a translation problem'
          )}
        </a>
      </>
    )
  }

  return (
    <>
      <SelectField
        htmlId="languageSelector"
        onChange={(event) => handleChangeLanguage(event.target.value)}
        value={currentLanguage}
        label={
          hideLabel ? undefined : t('setting.language', 'Choose App Language')
        }
        extraClass="languageSelector"
        afterSelect={afterSelect}
      >
        {/* Object.keys is typed string[] by TS design regardless of the object's key
            type; the Record<SupportedLanguage, string> annotation above is what proves
            this literal carries exactly the SupportedLanguage keys at runtime, so this
            assertion is sound -- not `any`, not `!`, and it does not widen the Record
            back to an index signature. */}
        {(Object.keys(languageLabels) as SupportedLanguage[]).map((lang) =>
          renderOption(lang)
        )}
      </SelectField>
    </>
  )
}
