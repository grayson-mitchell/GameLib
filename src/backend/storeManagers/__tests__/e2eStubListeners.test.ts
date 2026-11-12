import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { createGogdlStubs, registerGogdlStubListeners } from '../gog/e2eMock'
import {
  createLegendaryStubs,
  registerLegendaryStubListeners
} from '../legendary/e2eMock'
import { createNileStubs, registerNileStubListeners } from '../nile/e2eMock'

const registrars = [
  [
    'gog',
    (
      ipc: Parameters<typeof registerGogdlStubListeners>[0],
      env: Parameters<typeof registerGogdlStubListeners>[1]
    ) => registerGogdlStubListeners(ipc, env, createGogdlStubs()),
    'setGogdlCommandStub'
  ],
  [
    'legendary',
    (
      ipc: Parameters<typeof registerLegendaryStubListeners>[0],
      env: Parameters<typeof registerLegendaryStubListeners>[1]
    ) => registerLegendaryStubListeners(ipc, env, createLegendaryStubs()),
    'setLegendaryCommandStub'
  ],
  [
    'nile',
    (
      ipc: Parameters<typeof registerNileStubListeners>[0],
      env: Parameters<typeof registerNileStubListeners>[1]
    ) => registerNileStubListeners(ipc, env, createNileStubs()),
    'setNileCommandStub'
  ]
] as const

describe('e2e command stub listeners (T-66.3-22)', () => {
  it.each(registrars)(
    '%s registers its channels only when CI is e2e',
    (_name, register, channel) => {
      const off = createIpcRegistry()
      register(off, { CI: 'true' })
      expect(off.has(channel)).toBe(false)

      const unset = createIpcRegistry()
      register(unset, { CI: undefined })
      expect(unset.has(channel)).toBe(false)

      const on = createIpcRegistry()
      register(on, { CI: 'e2e' })
      expect(on.has(channel)).toBe(true)
    }
  )
})
