// Deviation (36-01 Task 2, Rule 3 -- blocking TS compile error): this
// project pins @types/react@^18.3.20, whose `HTMLAttributes<T>` does not yet
// declare the `inert` DOM attribute (added upstream to @types/react only in
// a later release). The plan's locked_decisions section mandates the
// React-18 string-form literal `inert={loginInFlight ? '' : undefined}` on
// `.loginContentWrapper` (`Login/index.tsx`) -- this augmentation makes that
// literal type-check without widening any other attribute or touching
// react-dom's actual runtime behaviour (react-dom already forwards `inert`
// to the DOM as a real HTML attribute; only the TYPE was missing).
import 'react'

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLAttributes<T> {
    inert?: string
  }
}
