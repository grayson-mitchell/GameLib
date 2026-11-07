import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Runner } from 'common/types'
import type { EngineOption } from 'common/types/engine'
import { EngineOverrideView } from 'frontend/screens/Settings/components/EngineOverride'
import { initialInstallEngine } from '../WineSelector/engineInstallChoice'

type T = (
  key: string,
  defaultValue: string,
  opts?: Record<string, unknown>
) => string

interface Props {
  runner: Runner
  appName: string
  onChange: (engineId: string) => void
}

/**
 * Phase 61 D-17: the install-time Engine select for non-Steam Windows games on
 * macOS. Defaults to the global default engine; a Legacy default becomes
 * Automatic (D-20) and the global setting is never written from here.
 */
export default function EngineSelector({ runner, appName, onChange }: Props) {
  const { t } = useTranslation('gamelib')
  const [options, setOptions] = useState<EngineOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [value, setValue] = useState('automatic')

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      window.api.listEngineOptions({ runner, appName }),
      window.api.getDefaultEngine()
    ])
      .then(([opts, def]) => {
        if (cancelled) return
        const initial = initialInstallEngine(def?.effectiveEngineId)
        setOptions(opts)
        setValue(initial)
        onChange(initial)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        onChange('automatic')
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
    // onChange is a stable state setter from the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner, appName])

  const pick = (id: string) => {
    if (id.startsWith('legacy:')) return
    setValue(id)
    onChange(id)
  }

  return (
    <EngineOverrideView
      options={options}
      value={value}
      loaded={loaded}
      onChange={pick}
      t={t as unknown as T}
      open
    />
  )
}
