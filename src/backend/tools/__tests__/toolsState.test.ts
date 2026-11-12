/**
 * 66.4-14 (D-05, D-66.2-03): the tools' single-flight slot, catalog and script-metadata caches and
 * the winetricks environment are closure state of one `createToolsState()` instance. Two Tools
 * built on the same state share them; Tools on different states do not.
 */
import { createToolsState } from '../toolsState'
import { createWinetricksEnvironment } from '../winetricksEnvironment'
import type { WinetricksComponent } from 'common/types'

const component = (verb: string): WinetricksComponent =>
  ({ verb }) as unknown as WinetricksComponent

describe('createToolsState', () => {
  it('starts empty and idle', () => {
    const state = createToolsState()
    expect(state.installing.get()).toBe('')
    expect(state.catalogCache.size).toBe(0)
    expect(state.scriptMetadata.get()).toBeNull()
  })

  it('an installing component set through one holder is visible through the state', () => {
    const state = createToolsState()
    state.installing.set('vcrun2019')
    expect(state.installing.get()).toBe('vcrun2019')
    state.installing.set('')
    expect(state.installing.get()).toBe('')
  })

  it('the catalog and script-metadata caches are per instance', () => {
    const a = createToolsState()
    const b = createToolsState()
    a.catalogCache.set('gog:game', [component('xact')])
    a.scriptMetadata.set({
      key: '1:2',
      value: { byVerb: {}, needsGui: new Set() } as never
    })
    a.installing.set('dxvk')
    expect(b.catalogCache.size).toBe(0)
    expect(b.scriptMetadata.get()).toBeNull()
    expect(b.installing.get()).toBe('')
    expect(a.catalogCache.get('gog:game')).toHaveLength(1)
    expect(a.scriptMetadata.get()?.key).toBe('1:2')
  })
})

describe('createWinetricksEnvironment', () => {
  it('reports empty, records and returns fresh copies', () => {
    const env = createWinetricksEnvironment()
    expect(env.getReport('gog', 'g')).toEqual({
      unsupportedWineVersion: null,
      missingDependencies: []
    })
    env.recordMissingDependencies('gog', 'g', ['7z'])
    const report = env.getReport('gog', 'g')
    report.missingDependencies.push('mutated')
    expect(env.getReport('gog', 'g').missingDependencies).toEqual(['7z'])
  })

  it('fires the listener on a change, not on a no-op, and the listener can be replaced', () => {
    const env = createWinetricksEnvironment()
    const first = jest.fn()
    const second = jest.fn()
    env.onChanged(first)
    env.recordUnsupportedWine('gog', 'g', '7.7')
    env.recordUnsupportedWine('gog', 'g', '7.7')
    expect(first).toHaveBeenCalledTimes(1)
    env.onChanged(second)
    env.recordMissingDependencies('gog', 'g', ['a'])
    env.recordUnsupportedWine('gog', 'g', null)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('two environments never share a report', () => {
    const a = createWinetricksEnvironment()
    const b = createWinetricksEnvironment()
    a.recordUnsupportedWine('gog', 'g', '7.7')
    expect(b.getReport('gog', 'g').unsupportedWineVersion).toBeNull()
  })
})
