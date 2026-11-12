import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  rmSync
} from 'graceful-fs'
import { join } from 'path'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { Runtime, RuntimeName } from 'common/types'
import { downloadFile, extractTarFile } from './util'
import { axiosClient } from 'backend/utils'
import type { AppPaths } from 'backend/process/context'
import type { ProcessRunner } from 'backend/process/types'

type RuntimePaths = Pick<AppPaths, 'runtimePath'>

async function _get(deps: { paths: RuntimePaths }): Promise<Runtime[]> {
  mkdirSync(deps.paths.runtimePath, { recursive: true })
  const allRuntimes = await axiosClient.get('https://lutris.net/api/runtimes')
  if (!allRuntimes.data) {
    logError('Failed to fetch runtime list', LogPrefix.Runtime)
  }
  return allRuntimes.data || []
}

async function download(
  deps: { runner: Pick<ProcessRunner, 'run'>; paths: RuntimePaths },
  name: RuntimeName
): Promise<boolean> {
  try {
    const runtimes = await _get(deps)
    const runtime = runtimes.find((inst) => {
      return inst.name === name
    })
    if (!runtime) {
      throw new Error(`Runtime ${name} was not found in runtime list`)
    }
    logInfo(
      ['Downloading runtime', name, 'with download link', runtime.url],
      LogPrefix.Runtime
    )

    const tarFileName = runtime.url.split('/').pop()!
    const tarFilePath = join(deps.paths.runtimePath, tarFileName)
    await downloadFile(runtime.url, tarFilePath)

    const extractedFolderPath = join(deps.paths.runtimePath, name)

    if (existsSync(extractedFolderPath)) {
      rmSync(extractedFolderPath, { recursive: true })
    }

    await extractTarFile(deps, tarFilePath, {
      extractedPath: extractedFolderPath,
      strip: 1
    })

    writeFileSync(
      join(extractedFolderPath, 'current_version'),
      runtime.created_at
    )

    unlinkSync(tarFilePath)

    return true
  } catch (error) {
    logError(
      ['Failed to download runtime', `${name}:`, error],
      LogPrefix.Runtime
    )
    return false
  }
}

async function isInstalled(deps: { paths: RuntimePaths }, name: RuntimeName) {
  if (!existsSync(join(deps.paths.runtimePath, name))) return false

  const runtimes = await _get(deps).catch(() => [])
  const runtime = runtimes.find((inst) => inst.name === name)

  // this should be impossible, so prevent redownload by faking it's installed
  if (!runtime) {
    logError('Runtime not found in runtime list', LogPrefix.Runtime)
    return true
  }

  const version_path = join(deps.paths.runtimePath, name, 'current_version')

  if (!existsSync(version_path)) return false

  const current_version = readFileSync(version_path)

  return runtime.created_at === current_version.toString()
}

export { download, isInstalled }
