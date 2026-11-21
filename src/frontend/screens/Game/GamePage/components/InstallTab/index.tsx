import { useContext } from 'react'
import type { GameInfo } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'
import GameContext from '../../../GameContext'
import { installActionGates } from '../../actions/installActionGates'
import { useInstallLocationActions } from '../../actions/useInstallLocationActions'
// Imported by file path, not through the components barrel, to avoid an import
// cycle (the barrel is imported by GamePage, which imports this).
import PlatformSupport from '../PlatformSupport'
import AppleWikiInfo from '../AppleWikiInfo'
import RunsForMeToggle from '../RunsForMeToggle'
import DownloadSizeInfo from '../DownloadSizeInfo'
import InstalledInfo from '../InstalledInfo'
import CloudSavesSync from '../CloudSavesSync'
import HumbleOriginInfo from '../HumbleOriginInfo'
import NativePortInfo from '../NativePortInfo'
import IntegrationRows from './IntegrationRows'
import LocationRow from './LocationRow'
import SizeRow from './SizeRow'
import VersionRow from './VersionRow'
import './index.css'

interface Props {
  gameInfo: GameInfo
  platform: string
  handleUpdate: () => void
  hasUpdate: boolean
}

/**
 * Phase 100: the right panel's Install tab. The legacy rows stay in a
 * `.legacyRows` wrapper so GamePage's old row styling keeps applying to them
 * and not to the new groups; plan 08 removes the wrapper once every row has
 * been reshaped.
 */
const InstallTab = ({ gameInfo, platform, handleUpdate, hasUpdate }: Props) => {
  const { is, gameSettings, gameExtraInfo, runner } = useContext(GameContext)
  const locationActions = useInstallLocationActions(gameInfo)

  const gates = installActionGates({
    is,
    runner,
    isInstalled: gameInfo.is_installed,
    isThirdPartyManaged: !!gameInfo.thirdPartyManagedApp,
    isBrowserGame: gameInfo.install.platform === 'Browser',
    hasWinePrefix:
      !is.win &&
      !is.native &&
      gameSettings?.wineVersion.type !== 'crossover' &&
      !!gameSettings?.winePrefix,
    hasChangelog: !!gameExtraInfo?.changelog?.length,
    cloudSavesAvailable:
      gameInfo.is_installed &&
      hasCapability(runner, 'supportsCloudSaves') &&
      !!gameInfo.cloud_save_enabled &&
      !is.linuxNative,
    settingFolder: locationActions.settingFolder
  })

  return (
    <>
      <div className="installFacts">
        <LocationRow
          gameInfo={gameInfo}
          gates={gates}
          actions={locationActions}
        />
        <SizeRow gameInfo={gameInfo} gates={gates} />
        <VersionRow
          gameInfo={gameInfo}
          gates={gates}
          handleUpdate={handleUpdate}
          hasUpdate={hasUpdate}
        />
        <CloudSavesSync gameInfo={gameInfo} gates={gates} />
      </div>
      <div className="legacyRows">
        <div>
          <PlatformSupport gameInfo={gameInfo} />
          <AppleWikiInfo gameInfo={gameInfo} />
          <RunsForMeToggle gameInfo={gameInfo} />
          <DownloadSizeInfo gameInfo={gameInfo} />
          <InstalledInfo gameInfo={gameInfo} />
          <HumbleOriginInfo gameInfo={gameInfo} />
          <NativePortInfo gameInfo={gameInfo} platform={platform} />
        </div>
      </div>
      <IntegrationRows gameInfo={gameInfo} platform={platform} />
    </>
  )
}

export default InstallTab
