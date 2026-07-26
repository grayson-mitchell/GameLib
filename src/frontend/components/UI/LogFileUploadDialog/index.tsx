import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircularProgress } from '@mui/material'

import { Dialog, DialogContent, DialogFooter, DialogHeader } from '../Dialog'
import useGlobalState from 'frontend/state/GlobalStateV2'

export default function LogUploadDialog() {
  const { t } = useTranslation()
  const { uploadLogFileProps, setUploadLogFileProps } = useGlobalState.keys(
    'uploadLogFileProps',
    'setUploadLogFileProps'
  )

  const [confirmed, setConfirmed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(false)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)

  const onClose = useCallback(() => {
    setConfirmed(false)
    setUploading(false)
    setUploadLogFileProps(false)
  }, [setConfirmed, setUploading, setUploadLogFileProps])

  const doUpload = useCallback(async () => {
    if (!uploadLogFileProps) return

    setConfirmed(true)
    setUploading(true)

    const result = await window.api.uploadLogFile(
      uploadLogFileProps.name,
      uploadLogFileProps.logFileArgs
    )

    setUploading(false)
    if (!result) {
      setError(true)
      return
    }
    const [url] = result
    // Use the app's own clipboard channel, NOT navigator.clipboard: under
    // Tauri the renderer is WKWebView, whose Web Clipboard API resolves
    // without actually writing, so this dialog's "URL copied to your
    // clipboard" message was a lie in the Tauri build (found by the phase
    // 34.3 live gate, item 5). clipboardWriteText is registered in BOTH
    // builds -- main.ts:1427 under Electron, clipboardFlowRegistration.ts
    // under the sidecar (-> the Rust clipboard arm) -- so this is parity-safe.
    window.api.clipboardWriteText(url)
    setUploadUrl(url)
  }, [uploadLogFileProps])

  const [dialogTitle, dialogContent, dialogFooter] = useMemo(() => {
    if (!uploadLogFileProps) return ['', '', '']
    if (!confirmed)
      return [
        t('setting.log.upload.confirm.title', 'Upload log file?'),
        t(
          'setting.log.upload.confirm.content',
          'Do you really want to upload "{{name}}"?',
          { name: uploadLogFileProps.name }
        ),
        <>
          <button onClick={doUpload} className={'button is-primary'}>
            {t('box.yes')}
          </button>
          <button onClick={onClose} className={'button is-danger'}>
            {t('box.no')}
          </button>
        </>
      ]
    if (uploading)
      return [
        t('setting.log.upload.uploading.title', 'Uploading'),
        <>
          <CircularProgress />
          <br />
          {t('setting.log.upload.uploading.content', 'Uploading log file...')}
        </>,
        <></>
      ]
    if (error)
      return [
        t('setting.log.upload.error.title', 'Upload failed'),
        <>
          {t(
            'setting.log.upload.error.content',
            "Failed to upload log file. Check GameLib's general log for details"
          )}
          <br />
          <br />
          {t(
            'setting.log.upload.error.manual_upload',
            'Click the "SHOW LOG FILE IN FOLDER" button and upload the "launch.log" file manually to Discord or any online file sharing service.'
          )}
        </>,
        <>
          <button onClick={onClose} className={'button is-secondary'}>
            {t('box.ok')}
          </button>
        </>
      ]
    return [
      t('setting.log.upload.done.title', 'Upload complete'),
      t(
        'setting.log.upload.done.content',
        'Uploaded to {{url}} (URL copied to your clipboard)',
        {
          url: uploadUrl
        }
      ),
      <>
        <button onClick={onClose} className={'button is-secondary'}>
          {t('box.ok')}
        </button>
      </>
    ]
  }, [uploadLogFileProps, confirmed, uploading, error, uploadUrl])

  if (!uploadLogFileProps) return <></>

  return (
    <Dialog
      onClose={onClose}
      showCloseButton={false}
      className="log-upload-result"
    >
      <DialogHeader>{dialogTitle}</DialogHeader>
      <DialogContent>{dialogContent}</DialogContent>
      <DialogFooter>{dialogFooter}</DialogFooter>
    </Dialog>
  )
}
