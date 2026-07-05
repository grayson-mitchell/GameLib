import { useContext, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import { UpdateComponent } from 'frontend/components/UI'

// D-01: Runner is reused completely unmodified. Humble's Connect action can't
// use Runner's normal loginUrl -> WebView navigation (D-05/D-07: the login
// happens in a main-process BrowserWindow, not a renderer route) so this is a
// minimal route whose only job is to trigger the login/reconnect IPC call on
// mount, then navigate back to /login once the BrowserWindow resolves
// (settles to 'done' | 'waiting' | 'error' - see HumbleUser.openLoginWindow,
// never hangs, D-06 silent-cancel included).
export const humbleLoginPath = '/humble-connect'

export default function HumbleConnect() {
  const { humble } = useContext(ContextProvider)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true

    async function run() {
      const result = humble.expired
        ? await window.api.humbleReconnect()
        : await window.api.humbleStartLogin()
      await humble.login(result)
      navigate('/login')
    }

    void run()
    // Only ever run once, on mount - re-running on every `humble` context
    // update would re-open the login window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <UpdateComponent
      message={t('login.humble_connecting', 'Waiting for Humble Bundle login...')}
    />
  )
}
