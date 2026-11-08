import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'

// Epic-only: the sole reader is legendary's `--no-https` flag (legendary/games.ts).
const DownloadNoHTTPS = () => {
  const { t } = useTranslation()
  const [downloadNoHttps, setDownloadNoHttps] = useSetting(
    'downloadNoHttps',
    false
  )

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="downloadNoHttps"
        value={downloadNoHttps}
        handleChange={() => setDownloadNoHttps(!downloadNoHttps)}
        title={t(
          'gamelib:settings.downloadNoHttps',
          'Download Epic games over HTTP (for LanCache)'
        )}
      />
      <InfoIcon
        text={t(
          'gamelib:settings.downloadNoHttpsHelp',
          'Only useful if you run a LanCache server on your network. LanCache cannot cache HTTPS downloads, so this downloads Epic games over plain HTTP and lets other PCs on your network install them from the local cache. Each downloaded chunk is still checked against the game manifest. Leave off otherwise.'
        )}
      />
    </div>
  )
}

export default DownloadNoHTTPS
