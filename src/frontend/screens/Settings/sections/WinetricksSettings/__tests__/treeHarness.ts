/**
 * Shared hand-rolled render harness for the Winetricks tab's component tests.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`), so every component test calls function
 * components directly and inspects the returned React-element object graph.
 * That works for a single component but not for a tab composed of child
 * components: the child elements come back unexpanded. This module adds the
 * one missing piece, `__expand`, which walks an element graph and calls every
 * function component it meets, giving each component INSTANCE (keyed by its
 * structural path) its own hook state. The result is a tree of host elements,
 * strings and numbers only, which the `find*` helpers below can query.
 *
 * Usage (the factory form is required: `jest.mock` hoists above imports):
 *
 *   jest.mock('react', () => jest.requireActual('./treeHarness').createReactMock())
 *   jest.mock('react-i18next', () => jest.requireActual('./treeHarness').createI18nMock())
 *   jest.mock('@fortawesome/react-fontawesome', () =>
 *     jest.requireActual('./treeHarness').createFontAwesomeMock())
 *
 * State updates are synchronous and do NOT schedule a re-render; a test calls
 * `render()` again to observe them, exactly like the older `reinvoke()` idiom.
 */

export interface ElementLike {
  type: unknown
  key?: string | number | null
  props: Record<string, unknown> & { children?: unknown }
}

type Instance = {
  id: number
  states: unknown[]
  refs: { current: unknown }[]
  effectDeps: (unknown[] | undefined)[]
  cleanups: (void | (() => void))[]
  stateCursor: number
  refCursor: number
  effectCursor: number
  idCursor: number
}

interface ReactHarness {
  __beginRender: () => void
  __resetMount: () => void
  __setContext: (value: unknown) => void
  __expand: (node: unknown) => unknown
}

// ts-prune-ignore-next -- consumed by tests through `jest.requireActual('./treeHarness')` inside a hoisted `jest.mock` factory, a string path static analysis cannot follow
export function createReactMock() {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let nextInstanceId = 0
  const newInstance = (): Instance => ({
    id: nextInstanceId++,
    states: [],
    refs: [],
    effectDeps: [],
    cleanups: [],
    stateCursor: 0,
    refCursor: 0,
    effectCursor: 0,
    idCursor: 0
  })

  let instances = new Map<string, Instance>()
  let rootInstance = newInstance()
  let current: Instance = rootInstance
  let contextValue: unknown = {}

  const resetCursors = (inst: Instance) => {
    inst.stateCursor = 0
    inst.refCursor = 0
    inst.effectCursor = 0
    inst.idCursor = 0
  }

  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined
  ): boolean => {
    if (!prev || !next) return true
    if (prev.length !== next.length) return true
    return prev.some((d, i) => !Object.is(d, next[i]))
  }

  const expand = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) {
      return node.map((child, index) => {
        const key =
          child && typeof child === 'object' && 'key' in child
            ? (child as ElementLike).key
            : null
        return expand(child, `${path}/${key ?? index}`)
      })
    }
    if (!node || typeof node !== 'object') return node
    const el = node as ElementLike
    if (!('props' in el) || !el.props) return node

    if (typeof el.type === 'function') {
      const component = el.type as (props: unknown) => unknown
      const id = `${path}/${component.name}`
      let inst = instances.get(id)
      if (!inst) {
        inst = newInstance()
        instances.set(id, inst)
      }
      const previous = current
      current = inst
      resetCursors(inst)
      let out: unknown
      try {
        out = component(el.props)
      } finally {
        current = previous
      }
      return expand(out, id)
    }

    return {
      ...el,
      props: {
        ...el.props,
        children: expand(el.props.children, `${path}<`)
      }
    }
  }

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const inst = current
      const idx = inst.stateCursor++
      if (idx >= inst.states.length) {
        inst.states[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        inst.states[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(inst.states[idx])
            : updater
      }
      return [inst.states[idx], setState]
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const inst = current
      const idx = inst.effectCursor++
      if (depsChanged(inst.effectDeps[idx], deps)) {
        const priorCleanup = inst.cleanups[idx]
        if (typeof priorCleanup === 'function') {
          priorCleanup()
        }
        inst.effectDeps[idx] = deps
        inst.cleanups[idx] = effect()
      }
    },
    useRef: (initial: unknown) => {
      const inst = current
      const idx = inst.refCursor++
      if (idx >= inst.refs.length) {
        inst.refs[idx] = { current: initial }
      }
      return inst.refs[idx]
    },
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
    useId: () => `id-${current.id}-${current.idCursor++}`,
    useContext: () => contextValue,
    __beginRender: () => {
      resetCursors(rootInstance)
    },
    __resetMount: () => {
      instances = new Map()
      rootInstance = newInstance()
      current = rootInstance
      resetCursors(rootInstance)
    },
    __setContext: (value: unknown) => {
      contextValue = value
    },
    __expand: (node: unknown) => expand(node, 'root')
  }
}

// ts-prune-ignore-next -- consumed by tests through `jest.requireActual('./treeHarness')` inside a hoisted `jest.mock` factory, a string path static analysis cannot follow
export function createI18nMock() {
  const interpolate = (
    template: string,
    vars: Record<string, unknown>
  ): string =>
    template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = vars[key]
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : ''
    })

  // `t`'s second argument is either a plain English default string or an
  // i18next options object carrying `defaultValue` (plus `_one`/`_other`
  // plural variants) and interpolation values. This performs the same
  // `{{token}}` interpolation i18next would so assertions can match the real
  // rendered English text.
  const t = (
    key: string,
    defaultValueOrOptions?: string | Record<string, unknown>
  ): string => {
    if (typeof defaultValueOrOptions === 'string') {
      return defaultValueOrOptions
    }
    if (defaultValueOrOptions && typeof defaultValueOrOptions === 'object') {
      const opts = defaultValueOrOptions
      const count = opts.count as number | undefined
      const variant =
        count === undefined
          ? undefined
          : count === 1
            ? opts.defaultValue_one
            : opts.defaultValue_other
      const template = (variant ?? opts.defaultValue) as string | undefined
      return template ? interpolate(template, opts) : key
    }
    return key
  }
  return { useTranslation: () => ({ t }) }
}

// FontAwesomeIcon renders to a host `svg` carrying its class names and icon
// name, so a test can assert "this row shows the success icon" without
// pulling the SVG renderer into a node-environment run.
// ts-prune-ignore-next -- consumed by tests through `jest.requireActual('./treeHarness')` inside a hoisted `jest.mock` factory, a string path static analysis cannot follow
export function createFontAwesomeMock() {
  return {
    FontAwesomeIcon: (props: {
      icon?: { iconName?: string }
      className?: string
    }) => ({
      type: 'svg',
      key: null,
      props: {
        className: props.className,
        'data-icon': props.icon?.iconName
      }
    })
  }
}

export function harness(): ReactHarness {
  return jest.requireMock('react') as unknown as ReactHarness
}

/** Calls `component(props)` and expands every function component below it. */
export function render<P>(
  component: (props: P) => unknown,
  props: P
): ElementLike {
  harness().__beginRender()
  return harness().__expand({
    type: component,
    key: null,
    props
  }) as ElementLike
}

export function walk(node: unknown, visit: (el: ElementLike) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!node || typeof node !== 'object') return
  const el = node as ElementLike
  if (!('props' in el) || !el.props) return
  visit(el)
  walk(el.props.children, visit)
}

export function findAll(
  tree: unknown,
  predicate: (el: ElementLike) => boolean
): ElementLike[] {
  const found: ElementLike[] = []
  walk(tree, (el) => {
    if (predicate(el)) found.push(el)
  })
  return found
}

function hasClassToken(el: ElementLike, token: string): boolean {
  const cn = el.props.className
  return typeof cn === 'string' && cn.split(/\s+/).includes(token)
}

export function findByClass(tree: unknown, token: string): ElementLike[] {
  return findAll(tree, (el) => hasClassToken(el, token))
}

export function collectText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join('')
  }
  if (node && typeof node === 'object' && 'props' in (node as ElementLike)) {
    return collectText((node as ElementLike).props.children)
  }
  return ''
}
