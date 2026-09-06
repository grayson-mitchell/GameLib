# Architecture diagrams

Four standalone, interactive architecture diagrams generated with
[archify](https://github.com/tt-a1i/archify). Each `.html` is fully
self-contained — open it directly in a browser, no server and no network.

Each viewer carries a light/dark toggle, pan/zoom, search, relationship
tracing, three guided views, and PNG/SVG export.

| Diagram | Question it answers |
| --- | --- |
| [`gamelib-overview.html`](gamelib-overview.html) | **Start here.** The static layer map — what code exists, how much of it, and which direction dependencies may run. |
| [`gamelib-topology.html`](gamelib-topology.html) | The runtime process and transport topology: renderer → Rust shell → Node sidecar, and the typed wire contracts between them. |
| [`gamelib-runners.html`](gamelib-runners.html) | The runner store-manager polymorphism — how `libraryManagerMap` stays exhaustive over the `Runner` union, and how the six implementations differ. |
| [`gamelib-capability.html`](gamelib-capability.html) | The Tauri v2 capability trust boundary: what the renderer is granted, what was deliberately refused, and why the list is explicit. |

## Provenance

The specs in [`spec/`](spec/) pin:

```
revision 36832a3df02bfdbd329c1aa856219c5a52676df5
```

Every `sources[].path` in every spec was verified by archify to exist at that
revision — the diagrams are evidence-linked, not hand-asserted. Node counts and
LOC figures were measured at that commit and will drift as the tree moves.

## Regenerating

Requires the `archify` skill installed at `.claude/skills/archify` (a per-user
install; it is not vendored into this repo).

```bash
cd .claude/skills/archify

# validate a spec without writing an artifact
node bin/archify.mjs validate architecture \
  ../../../doc/archify/spec/overview.architecture.json \
  --quality showcase --repo-root ../../..

# re-render and atomically commit the HTML
node bin/archify.mjs deliver architecture \
  ../../../doc/archify/spec/overview.architecture.json \
  ../../../doc/archify/gamelib-overview.html \
  --quality showcase --repo-root ../../..
```

`--repo-root` is required because the specs declare source evidence; archify
refuses to render without a checkout to verify the paths against.

To also collect browser containment/readability evidence, point `ARCHIFY_CHROME`
at a Chrome or Chromium binary and run
`node bin/archify.mjs visual-check <output.html> --json`.

## Notes

- All four specs pass archify's `showcase` profile: 9/9 layout checks, 0
  composition errors, 0 warnings, and containment plus readability at
  1440×900, 1600×1000, 1920×1080 and 2048×1320 in both themes.
- The HTML artifacts are ~720 KB each because the viewer runtime is inlined.
  That is the cost of being openable offline with no build step.
- `doc/archify` is listed in `.prettierignore`: the HTML is a generated,
  checksummed artifact and reformatting it would invalidate its delivery
  receipt. Edit the spec and re-deliver instead of hand-editing the HTML.
