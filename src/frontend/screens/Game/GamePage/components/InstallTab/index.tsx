import type { GameInfo } from 'common/types'
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
import './index.css'

interface Props {
  gameInfo: GameInfo
  platform: string
}

/**
 * Phase 100: the right panel's Install tab. The legacy rows stay in a
 * `.legacyRows` wrapper so GamePage's old row styling keeps applying to them
 * and not to the new groups; plan 08 removes the wrapper once every row has
 * been reshaped.
 */
const InstallTab = ({ gameInfo, platform }: Props) => (
  <>
    <div className="legacyRows">
      <div>
        <PlatformSupport gameInfo={gameInfo} />
        <AppleWikiInfo gameInfo={gameInfo} />
        <RunsForMeToggle gameInfo={gameInfo} />
        <DownloadSizeInfo gameInfo={gameInfo} />
        <InstalledInfo gameInfo={gameInfo} />
        <CloudSavesSync gameInfo={gameInfo} />
        <HumbleOriginInfo gameInfo={gameInfo} />
        <NativePortInfo gameInfo={gameInfo} platform={platform} />
      </div>
    </div>
    <IntegrationRows gameInfo={gameInfo} platform={platform} />
  </>
)

export default InstallTab
