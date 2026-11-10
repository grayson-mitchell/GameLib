import { spawnSync } from 'node:child_process'
import { getCometBin } from 'backend/utils'
import { join } from 'path'
import type { ManagerDeps } from 'backend/services/types'

/** R1 slice: the runner managers the version probes ask. */
export type VersionProbeDeps = Pick<ManagerDeps, 'libraryManagers'>

const COMET_VERSION_TIMEOUT_MS = 5000

async function getLegendaryVersion(deps: VersionProbeDeps): Promise<string> {
  const { stdout, error, abort } = await deps.libraryManagers[
    'legendary'
  ].runRunnerCommand(
    {
      subcommand: undefined,
      '--version': true
    },
    {
      abortId: 'legendary-version'
    }
  )

  if (error ?? abort) return 'invalid'

  // Sample output:
  // legendary version "0.20.33", codename "Undue Alarm"
  // 1st capturing group matches the version, 2nd the codename
  const matches = stdout.match(/"([\d.]*)".*"(.*)"$/m)
  const version = matches?.[1]
  const codename = matches?.[2]
  if (!version || !codename) return 'invalid'
  return `${version} ${codename}`
}

async function getGogdlVersion(deps: VersionProbeDeps): Promise<string> {
  const { stdout, error } = await deps.libraryManagers['gog'].runRunnerCommand(
    ['--version'],
    {
      abortId: 'gogdl-version'
    }
  )

  if (error) return 'invalid'

  return stdout
}

async function getCometVersion(): Promise<string> {
  const path = getCometBin()
  // Bounded: spawnSync blocks the event loop, so a hung comet must not stall RPC frames.
  const { stdout, error } = spawnSync(join(path.dir, path.bin), ['--version'], {
    timeout: COMET_VERSION_TIMEOUT_MS
  })

  if (error) return 'invalid'

  return stdout.toString().trimEnd()
}

async function getNileVersion(deps: VersionProbeDeps): Promise<string> {
  const { stdout, error } = await deps.libraryManagers['nile'].runRunnerCommand(
    ['--version'],
    {
      abortId: 'nile-version'
    }
  )

  if (error) return 'invalid'

  return stdout
}

export { getLegendaryVersion, getGogdlVersion, getNileVersion, getCometVersion }
