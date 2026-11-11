/**
 * `showDialogBoxModalAuto(deps, props)` and `notify(deps, props)` take the host slices first
 * (66.3-05). Wrapping their jest.fn with `propsOnly` records `props` alone, so
 * `mock.calls[n][0]` and `toHaveBeenCalledWith(props)` assertions read the user-visible payload.
 * Every other member (`mock`, `mockClear`, `mockImplementation`, ...) is the inner jest.fn's own.
 */
export function propsOnly<T extends jest.Mock>(inner: T): T {
  return new Proxy(inner, {
    apply: (target, thisArg, args: unknown[]) =>
      Reflect.apply(target, thisArg, args.slice(1))
  })
}
