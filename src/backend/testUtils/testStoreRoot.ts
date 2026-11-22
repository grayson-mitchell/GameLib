import { homedir } from 'os'
import { join } from 'path'
import { resolveAppDataDir } from '../process/appPaths'
import type { StoreFrame, StoreFrameSink } from '../stores/storeFrames'
import { createStoreRoot, type StoreRoot } from '../stores/storeRoot'
import { createDiskStoreSink } from './diskStoreSink'

/**
 * The OS appData folder for the jest-contained fake HOME: what a booted sidecar derives
 * (`resolveAppPaths`) and what the retired pathShim's `getPath('appData')` returned.
 */
export function testAppDataDir(): string {
  return resolveAppDataDir(process.platform, process.env, homedir())
}

/** `<appData>/GameLib` for the jest-contained fake HOME: the default test StoreRoot's userData. */
export function testUserDataDir(): string {
  return join(testAppDataDir(), 'GameLib')
}

/**
 * A fresh StoreRoot for tests. With no argument it roots at the same userData a booted sidecar
 * derives for the jest-contained fake HOME (`jest.setupContainment.ts`), so a suite that reads
 * the files a store wrote through another root on the same directory still lines up. Each call
 * returns independent cells and an unbound changes channel.
 *
 * Frames a Rust-owned store sends go to `frameSink`, which defaults to an in-process disk sink
 * (`diskStoreSink.ts`): it applies each frame to the store's file the way the shell's writer
 * would and answers it at once, so a real-store suite keeps writing through a store and reading the
 * file back. `recordFrames` keeps that sink and also collects every frame it receives, in order.
 * An explicit `frameSink` replaces the disk sink and the suite owns the answers. `wrapSink` keeps
 * the disk sink and puts a wrapper in front of it (a suite that makes a write throw, then lets the
 * rest through to the file).
 */
export function createTestStoreRoot(
  userData?: string,
  options: Pick<
    Parameters<typeof createStoreRoot>[0],
    'readOnlySinks' | 'boot' | 'frameSink'
  > & {
    recordFrames?: StoreFrame[]
    wrapSink?: (inner: StoreFrameSink) => StoreFrameSink
  } = {}
): StoreRoot {
  const { recordFrames, frameSink, wrapSink, ...rest } = options
  const resolvedUserData = userData ?? testUserDataDir()
  const disk = frameSink
    ? undefined
    : createDiskStoreSink({ userData: resolvedUserData, recordFrames })
  const root = createStoreRoot({
    ...rest,
    frameSink:
      frameSink ?? (disk && wrapSink ? wrapSink(disk.sink) : disk?.sink),
    userData: resolvedUserData
  })
  disk?.attach(root)
  return root
}
