import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { registerGogdlStubListeners } from '../gog/e2eMock'
import { registerLegendaryStubListeners } from '../legendary/e2eMock'
import { registerNileStubListeners } from '../nile/e2eMock'

const registrars = [
  ['gog', registerGogdlStubListeners, 'setGogdlCommandStub'],
  ['legendary', registerLegendaryStubListeners, 'setLegendaryCommandStub'],
  ['nile', registerNileStubListeners, 'setNileCommandStub']
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
