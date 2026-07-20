import { spawnSync } from 'node:child_process'
import { getCometBin } from 'backend/utils'
import { join } from 'path'

async function getLegendaryVersion(): Promise<string> {
  // Imported lazily to break a circular dependency (helperBinaries/index.ts
  // <-> storeManagers/index.ts) — see the load-bearing comment in
  // storeManagers/gog/user.ts.
  const { libraryManagerMap } = await import('../../storeManagers')
  const { stdout, error, abort } = await libraryManagerMap[
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

async function getGogdlVersion(): Promise<string> {
  // Lazy import — see the load-bearing comment on getLegendaryVersion() above.
  const { libraryManagerMap } = await import('../../storeManagers')
  const { stdout, error } = await libraryManagerMap['gog'].runRunnerCommand(
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
  const { stdout, error } = spawnSync(join(path.dir, path.bin), ['--version'])

  if (error) return 'invalid'

  return stdout.toString().trimEnd()
}

async function getNileVersion(): Promise<string> {
  // Lazy import — see the load-bearing comment on getLegendaryVersion() above.
  const { libraryManagerMap } = await import('../../storeManagers')
  const { stdout, error } = await libraryManagerMap['nile'].runRunnerCommand(
    ['--version'],
    {
      abortId: 'nile-version'
    }
  )

  if (error) return 'invalid'

  return stdout
}

export { getLegendaryVersion, getGogdlVersion, getNileVersion, getCometVersion }
