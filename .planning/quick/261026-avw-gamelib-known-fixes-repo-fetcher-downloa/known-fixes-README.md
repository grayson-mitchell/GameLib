# known-fixes

Tier-1 per-game fixes for [GameLib](https://github.com/grayson-mitchell/GameLib), for every store.

GameLib fetches this repo first when a game is installed. For Epic, GOG and Amazon, if no file
exists here GameLib falls back to
[Heroic-Games-Launcher/known-fixes](https://github.com/Heroic-Games-Launcher/known-fixes). For
Steam and Zoom only this repo is consulted. A file here fully replaces Heroic's for that game
(whole file, no merge). Local and bundled fixes inside the app take precedence over anything
fetched from here.

## Layout

One file per game, in Heroic's layout:

```
<store>/<appName>-<store>.json
```

Raw URL:

```
https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main/<store>/<appName>-<store>.json
```

| Directory | `appName` is                    |
| --------- | ------------------------------- |
| `epic`    | the Legendary app name          |
| `gog`     | the GOG product id              |
| `amazon`  | the Nile id                     |
| `steam`   | the Steam appId, e.g. `284100`  |
| `zoom`    | the Zoom id                     |

## Allowed keys

A file may carry only these keys:

- `title` - display name of the game
- `notes` - per-platform text shown to the user
- `winetricks` - winetricks verbs to install into the prefix
- `runInPrefix` - install-relative executables to run inside the prefix
- `envVariables` - environment variables set at launch
- `wikiLink` - link to further documentation
- `launchNotice` - text shown in the UI before launch

Any other key is dropped by GameLib with a warning. Tier-2 keys (`registry`,
`steamSharedRedists`, `evidence`, and in future `dllOverrides`, `overlays`, `shimFeatures`,
`platforms`) belong in `<appName>-<store>.profile.json`, which is local and bundled only and is
never fetched. Putting them here does nothing.

## Trust

Tier 1 is "trust the repo's mergers": `runInPrefix` and `winetricks` run code on the user's
machine. Review pull requests accordingly.

## Example

`steam/284100-steam.json`:

```json
{
  "title": "Example Game",
  "notes": {
    "macos": "Needs the bridge; first launch compiles shaders and takes a minute."
  },
  "envVariables": {
    "DXVK_ASYNC": "1"
  },
  "launchNotice": "The first launch may look frozen for up to a minute."
}
```
