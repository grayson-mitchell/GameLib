import React, { useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { faCopy, faFolderOpen } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { MenuItem } from '@mui/material'
import { SelectField, UpdateComponent } from 'frontend/components/UI'
import SettingsContext from '../../SettingsContext'
import './index.css'
import {
  useAmazonAccount,
  useEpicAccount,
  useGogAccount
} from 'frontend/state/accountHooks'
import useLibraryState from 'frontend/state/libraryState'
import { GameInfo } from 'common/types'
import { useNavigate } from 'react-router-dom'
import useUiState from 'frontend/state/uiState'
import Upload from '@mui/icons-material/Upload'
import Cloud from '@mui/icons-material/Cloud'
import classNames from 'classnames'

import type { GetLogFileArgs } from 'common/types/ipc/logger'
import {} from 'common/storeCapabilities'

interface LogBoxProps {
  logFileContent: string
}

const LogBox: React.FC<LogBoxProps> = ({ logFileContent }) => {
  const { t } = useTranslation()
  const maxLines = 1000
  let sliced = false
  let lines = logFileContent.split('\n')
  if (lines.length > maxLines) {
    lines = ['...', ...lines.slice(-maxLines)]
    sliced = true
  }

  return (
    <>
      {sliced && (
        <span className="setting long-log-hint">
          {t(
            'settings.log.long-log-hint',
            'Log truncated, last 1000 lines are shown!'
          )}
        </span>
      )}
      <span className="setting log-box">
        {lines.map((line, key) => {
          if (line.toLowerCase().includes(' err')) {
            return (
              <p key={key} className="log-error">
                {line}
              </p>
            )
          } else if (line.toLowerCase().includes(' warn')) {
            return (
              <p key={key} className="log-warning">
                {line}
              </p>
            )
          } else {
            return (
              <p key={key} className="log-info">
                {line}
              </p>
            )
          }
        })}
      </span>
    </>
  )
}

export default function LogSettings() {
  const { t } = useTranslation()
  const { appName, runner } = useContext(SettingsContext)
  const { setUploadLogFileProps, closeSettingsModal } = useUiState.keys(
    'setUploadLogFileProps',
    'closeSettingsModal'
  )
  const navigate = useNavigate()
  const isInSettingsMenu = appName === 'default'

  const [logFileContent, setLogFileContent] = useState<string>('')
  const [logFileExist, setLogFileExist] = useState<boolean>(false)
  const [showLogOf, setShowLogOf] = useState<GetLogFileArgs>(
    !runner ? {} : { appName, runner }
  )
  const [refreshing, setRefreshing] = useState<boolean>(true)
  // Phase 100 D-02: a game's Logs tab picks between the game's last session
  // (its own log) and the general GameLib log. No new backend: both are
  // getLogContent arguments the page already polls.
  const gameLogArgs: GetLogFileArgs = !runner ? {} : { appName, runner }
  const logSession = showLogOf.appName ? 'lastSession' : 'gamelibLog'

  const epic = useEpicAccount()
  const gog = useGogAccount()
  const amazon = useAmazonAccount()
  const sideloadedLibrary = useLibraryState((s) => s.sideloadedLibrary)
  const [installedGames, setInstalledGames] = useState<GameInfo[]>([])

  useEffect(() => {
    let games: GameInfo[] = []
    games = games.concat(epic.library.filter((game) => game.is_installed))
    games = games.concat(gog.library.filter((game) => game.is_installed))
    games = games.concat(amazon.library.filter((game) => game.is_installed))
    games = games.concat(sideloadedLibrary.filter((game) => game.is_installed))
    games = games.sort((game1, game2) => game1.title.localeCompare(game2.title))

    setInstalledGames(games)
  }, [epic.library, gog.library, amazon.library, sideloadedLibrary])

  const getLogContent = () => {
    void window.api.getLogContent(showLogOf).then((content: string) => {
      if (!content) {
        setLogFileContent(t('setting.log.no-file', 'No log file found.'))
        setLogFileExist(false)
        return setRefreshing(false)
      }
      setLogFileContent(content)
      setLogFileExist(true)
      setRefreshing(false)
    })
  }

  useEffect(() => {
    getLogContent()
    const interval = setInterval(() => {
      getLogContent()
    }, 1000)
    return () => clearInterval(interval)
  }, [showLogOf])

  function changeLogSession(session: string) {
    setRefreshing(true)
    setShowLogOf(session === 'gamelibLog' ? {} : gameLogArgs)
  }

  function copyLog() {
    window.api.clipboardWriteText(logFileContent)
  }

  function showLogFileInFolder() {
    window.api.showLogFileInFolder(showLogOf)
  }

  // Opens Settings > Report a problem (the email report form), preselecting the
  // game whose log is shown. Closes the Logs modal first when opened from one.
  function openReportForm() {
    closeSettingsModal()
    void navigate('/settings/report', {
      state: showLogOf.appName
        ? { reportGame: `${showLogOf.runner}/${showLogOf.appName}` }
        : undefined
    })
  }

  const descriptiveLogFileName = useMemo(() => {
    if (!showLogOf.runner)
      return t('setting.log.descriptiveNames.heroic', 'General GameLib log')
    if (showLogOf.appName) {
      const gameTitle = installedGames.find(
        ({ app_name }) => app_name === showLogOf.appName
      )?.title
      return t(
        'setting.log.descriptiveNames.game-log',
        'Game log of {{gameTitle}}',
        { gameTitle }
      )
    }
    const labelByRunner: Partial<Record<string, () => string>> = {
      legendary: () =>
        t(
          'setting.log.descriptiveNames.legendary',
          'Epic Games / Legendary log'
        ),
      gog: () => t('setting.log.descriptiveNames.gog', 'GOG log'),
      nile: () => t('setting.log.descriptiveNames.nile', 'Amazon / Nile log')
    }
    return labelByRunner[showLogOf.runner]?.() ?? ''
  }, [showLogOf, installedGames, t])

  const logFilesToShow = useMemo(() => {
    const baseFiles: { title: string; args: GetLogFileArgs }[] = [
      { title: 'GameLib', args: {} },
      { title: 'Epic/Legendary', args: { runner: 'legendary' } },
      { title: 'GOG', args: { runner: 'gog' } },
      { title: 'Amazon/Nile', args: { runner: 'nile' } }
    ]
    const logsForInstalledGames = installedGames.map((game) => ({
      title: game.overrides?.title || game.title,
      args: {
        appName: game.app_name,
        runner: game.runner
      }
    }))
    return baseFiles.concat(logsForInstalledGames)
  }, [installedGames])

  return (
    <>
      <h3>{t('setting.log.instructions_title', 'How to report a problem?')}</h3>
      <p className="report-problem-instructions">
        {t(
          'gamelib:reportProblem.logsInstructions',
          'Describe what happened in the report form. Diagnostics and recent logs can be included automatically.'
        )}{' '}
        <a className="clickable" role="button" onClick={openReportForm}>
          {t('gamelib:reportProblem.openForm', 'Open the report form')}
        </a>
      </p>
      <div
        className={classNames('logs-wrapper', {
          'game-log': !isInSettingsMenu
        })}
      >
        {isInSettingsMenu && (
          <span className="log-buttongroup">
            {logFilesToShow.map(({ title, args }, i) => {
              const isSelected =
                args.appName === showLogOf.appName &&
                args.runner === showLogOf.runner
              return (
                <a
                  key={i}
                  className={`log-buttons ${isSelected ? 'log-choosen' : ''}`}
                  onClick={() => {
                    setRefreshing(true)
                    setShowLogOf(args)
                  }}
                  title={title}
                >
                  {title}
                </a>
              )
            })}
          </span>
        )}

        {!isInSettingsMenu && (
          <SelectField
            htmlId="logSession"
            extraClass="logSessionPicker"
            label={t('gamelib:settings.logs.session', 'Log')}
            value={logSession}
            onChange={(e) => changeLogSession(e.target.value)}
          >
            <MenuItem value="lastSession">
              {t('gamelib:settings.logs.lastSession', 'Last session')}
            </MenuItem>
            <MenuItem value="gamelibLog">
              {t('gamelib:settings.logs.gamelibLog', 'GameLib log')}
            </MenuItem>
          </SelectField>
        )}

        {refreshing ? (
          <span className="setting log-box">
            <UpdateComponent />
          </span>
        ) : (
          <LogBox logFileContent={logFileContent} />
        )}
      </div>
      <span className="footerFlex">
        {logFileExist && (
          <>
            {!isInSettingsMenu && (
              <a
                onClick={copyLog}
                title={t('gamelib:settings.logs.copy', 'Copy log')}
                className="button is-footer"
              >
                <div className="button-icontext-flex">
                  <div className="button-icon-flex">
                    <FontAwesomeIcon icon={faCopy} />
                  </div>
                  <span className="button-icon-text">
                    {t('gamelib:settings.logs.copy', 'Copy log')}
                  </span>
                </div>
              </a>
            )}
            <a
              onClick={showLogFileInFolder}
              title={t('setting.log.show-in-folder', 'Show log file in folder')}
              className="button is-footer"
            >
              <div className="button-icontext-flex">
                <div className="button-icon-flex">
                  <FontAwesomeIcon icon={faFolderOpen} />
                </div>
                <span className="button-icon-text">
                  {t('setting.log.show-in-folder', 'Show log file in folder')}
                </span>
              </div>
            </a>
            <a
              onClick={() => {
                setUploadLogFileProps({
                  logFileArgs: showLogOf,
                  name: descriptiveLogFileName
                })
              }}
              title={t('setting.log.upload.button', 'Upload log file')}
              className="button is-footer"
            >
              <div className="button-icontext-flex">
                <div className="button-icon-flex">
                  <Upload />
                </div>
                <span className="button-icon-text">
                  {t('setting.log.upload.button', 'Upload log file')}
                </span>
              </div>
            </a>
          </>
        )}
        {isInSettingsMenu && (
          <>
            <a
              onClick={() =>
                useUiState.setState({ showUploadedLogFileList: true })
              }
              title={t('setting.log.show-uploads', 'Show uploaded log files')}
              className="button is-footer"
            >
              <div className="button-icontext-flex">
                <div className="button-icon-flex">
                  <Cloud />
                </div>
                <span className="button-icon-text">
                  {t('setting.log.show-uploads', 'Show uploaded log files')}
                </span>
              </div>
            </a>
          </>
        )}
      </span>
    </>
  )
}
