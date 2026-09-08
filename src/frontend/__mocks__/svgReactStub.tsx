/**
 * Jest stand-in for vite's `?react` SVG-as-component imports (Phase 42,
 * D-42-03 — first consumer: `HumbleKeyRow`'s store indicator).
 *
 * The real build uses `vite-plugin-svgr`'s `?react` query suffix (declared
 * for `tsc` via `src/common/typedefs/vite.d.ts`'s
 * `/// <reference types="vite-plugin-svgr/client" />`) to turn an `.svg`
 * file into a React component at build time. Jest has no equivalent loader
 * — this project deliberately installs no jsdom and no SVG transformer (see
 * `src/frontend/jest.config.js`'s docstring) — so every `*.svg?react`
 * specifier is routed here via `moduleNameMapper` instead of being resolved
 * to a real SVG.
 *
 * The stub renders a plain `<span>` carrying the caller's `className` plus a
 * stable `data-testid` so tests can find "a logo was rendered here" in the
 * no-DOM element graph without needing to know which specific logo it was.
 */
type Props = { className?: string }

export default function SvgReactStub({ className }: Props) {
  return (
    <span data-testid="svg-stub" className={className}>
      svg-stub
    </span>
  )
}
