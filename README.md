# GameLib

GameLib is a derivative of Heroic Games Launcher (https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher). Key Differentiators are:

- Support for Steam Games
- Stronger CrossOver integration (Playing Games on macOS)

GameLib is an Open Source Game Library Manager for Linux, Windows and macOS.  
It supports games from:

- Epic Games Store
- GOG Games
- Amazon Games
- Steam

GameLib is built with:  
[![Typescript](https://img.shields.io/badge/Typescript-3178c6?style=for-the-badge&logo=typescript&labelColor=gray)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-5fd9fb?style=for-the-badge&logo=react&labelColor=gray)](https://reactjs.org/)
[![MUI](https://img.shields.io/badge/MUI-66b2ff?style=for-the-badge&logo=mui&labelColor=gray&logoColor=66b2ff)](https://mui.com/)
[![NodeJS](https://img.shields.io/badge/NodeJS-689f63?style=for-the-badge&logo=nodedotjs&labelColor=gray)](https://nodejs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-24C8D8?style=for-the-badge&logo=tauri&labelColor=gray)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-CE422B?style=for-the-badge&logo=rust&labelColor=gray)](https://www.rust-lang.org/)
[![Jest](https://img.shields.io/badge/Jest-18DF16?style=for-the-badge&logo=jest&labelColor=gray&logoColor=18DF16)](https://jestjs.io/)
[![Vite](https://img.shields.io/badge/Vite-BD34FE?style=for-the-badge&logo=vite&labelColor=gray)](https://vitejs.dev/)

## Index

- [GameLib](#gamelib)
  - [Index](#index)
  - [Features available right now](#features-available-right-now)
  - [Planned features](#planned-features)
  - [Supported Operating Systems](#supported-operating-systems)
  - [Language Support](#language-support)
  - [Installation](#installation)
    - [Prerequisites](#prerequisites)
    - [Linux](#linux)
    - [Windows / macOS](#windows--macos)
  - [Code signing policy](#code-signing-policy)
  - [Privacy](#privacy)
  - [Development environment](#development-environment)
    - [Building GameLib Binaries](#building-gamelib-binaries)
    - [Quickly testing/debugging GameLib on your own system](#quickly-testingdebugging-gamelib-on-your-own-system)
    - [Development on nix](#development-on-nix)
  - [Credits](#credits)

## Features available right now

- Login with an existing Epic Games, GOG, Steam or Amazon account
- Install, uninstall, update, repair and move Games
- Import an already installed game
- Play Epic games online [AntiCheat on macOS and on Linux depends on the game]
- Play games using Wine or Proton [Linux]
- Play games using Crossover [macOS]
- Download custom Wine and Proton versions [Linux]
- Access to Epic, GOG and Amazon Games stores directly from GameLib
- Search for the game on ProtonDB for compatibility information [Linux]
- Show ProtonDB and Steam Deck compatibility information [Linux]
- Sync installed games with an existing Epic Games Store installation
- Sync saves with the cloud
- Custom Theming Support
- Download queue
- Add Games and Applications outside GOG, Epic Games and Amazon Games
- Define your categories to organize your collection

## Planned features

- Support Other Store (IndieGala, etc)

## Supported Operating Systems

- Linux:
  - Ubuntu (latest 2 LTS versions)
  - Fedora (latest 2 versions)
  - Arch Linux & derivatives (Manjaro, Garuda, EndeavourOS)
  - GameLib will still _work_ on most distros, but it is up to you to _get_ it to work
- Windows 10 & 11
- macOS 14 or newer (Apple Silicon only). GameLib will not support Intel Macs on macOS.

## Language Support

<details>
  <summary>Expand</summary>

Thanks to the Heroic Games Launcher translation community, the interface text GameLib inherits from Heroic has been translated to almost 40 different languages so far:

- English
- Azerbaijani
- Basque
- Belarussian
- Bosnian
- Bulgarian
- Catalan
- Czech
- Croatian
- Simplified Chinese
- Traditional Chinese
- Dutch
- Estonian
- Finnish
- French
- German
- Greek
- Hebraic
- Japanese
- Korean
- Hungarian
- Italian
- Indonesian
- Malayalam
- Norwegian Bokmål
- Persian
- Polish
- Portuguese
- Portuguese (Brazil)
- Romanian
- Russian
- Serbian
- Spanish
- Slovak
- Swedish
- Tamil
- Turkish
- Ukrainian
- Vietnamese

</details>

Most interface text comes from Heroic Games Launcher, whose community translates it on
[Heroic's Weblate project](https://hosted.weblate.org/projects/heroic-games-launcher). GameLib has no
Weblate project of its own. Text that GameLib adds is written in English and machine-translated into
the other languages.

## Installation

GameLib does not publish prebuilt binaries yet, so you install it by **building
from source**. The build produces an **AppImage** on Linux, an **NSIS installer** on Windows, and an
**app bundle and dmg** on macOS. The steps below are a quickstart; see [Development environment](#development-environment) for full details.

### Prerequisites

- **Git**, **Node.js ≥ 22**, and **pnpm 10** — `corepack enable` gives you the pinned version
- The **stable Rust toolchain**, for example via [rustup](https://rustup.rs/). The desktop shell is a
  Tauri (Rust) app, and the release workflow builds it with Rust stable
- Tauri's system prerequisites for your OS (see the
  [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)). On Debian/Ubuntu the
  release workflow installs `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`,
  `librsvg2-dev`, `patchelf` and `xdg-utils` (measured on Ubuntu 22.04)
- On macOS, a system `clang` (for example from the Xcode Command Line Tools) — the
  `pnpm build-steam-bridge` step needs it
- On Windows, Rust's MSVC toolchain (the release target is `x86_64-pc-windows-msvc`)
- The **Steam client** installed — GameLib launches Steam games via `steam://`
- On Linux, **FUSE** to run the AppImage (install `libfuse2` if your distro doesn't ship it)

### Linux

```bash
# Clone the repo and enter it
git clone https://github.com/grayson-mitchell/GameLib.git
cd GameLib

# Install dependencies and helper binaries
pnpm install
pnpm download-helper-binaries

# Build the renderer and the Node sidecar
pnpm exec vite build
pnpm build:sidecar-sea

# Build the app. The override skips updater artifacts, which need GameLib's private updater signing key
pnpm exec tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'

# Run the result from src-tauri/target/release/bundle/appimage/
chmod +x src-tauri/target/release/bundle/appimage/GameLib_*.AppImage
./src-tauri/target/release/bundle/appimage/GameLib_*.AppImage
```

To just run it without building an installer, use `pnpm tauri:dev` (dev mode); see
[Quickly testing/debugging GameLib on your own system](#quickly-testingdebugging-gamelib-on-your-own-system).

### Windows / macOS

The steps are the same as on Linux.

- On macOS, run `pnpm build-steam-bridge` before `pnpm exec vite build`, as the release workflow does.
- On Windows, run the commands in Git Bash: the `--config` value uses bash quoting, and the release
  workflow runs its build steps with bash.
- The output lands under `src-tauri/target/release/bundle/`, in a subdirectory per format.
- Local builds are not code-signed; see the [Code signing policy](#code-signing-policy).

See [Building GameLib Binaries](#building-gamelib-binaries) for details.

## Code signing policy

**Windows:** GameLib release binaries are currently **not code-signed**, so Windows SmartScreen will
warn when you run the installer.

GameLib is applying to SignPath Foundation's free code-signing programme for open-source projects.
Nothing is signed through SignPath today. If the application is approved, Windows release binaries
will be signed through SignPath and the attribution SignPath Foundation requires will be added to
this section at that time.

**What gets signed:** only binaries built from this repository's source by the release workflow
(`.github/workflows/release-tauri.yml`): the GameLib application executable, its Node.js sidecar
and the installer. Third-party open-source tools bundled with GameLib on Windows (legendary, gogdl,
nile and comet, plus small helper executables) ship as built by their upstream projects and are not
signed by GameLib.

**Update packages:** these are also signed with GameLib's own updater key, a separate mechanism from
operating-system code signing. The public key is committed in `src-tauri/tauri.conf.json`, and the
updater plugin verifies packages against it.

**macOS:** builds produced by the release workflow are signed with an Apple Developer ID
certificate and notarized by Apple. This was verified on the v0.7.0 build (Gatekeeper `accepted`,
`source=Notarized Developer ID`). That release is still a draft, so no signed macOS release has been
published yet.

**Linux:** builds are not code-signed. The release workflow has no signing step for them.

| Role     | Member                                            | Responsibility                                            |
| -------- | ------------------------------------------------- | --------------------------------------------------------- |
| Author   | Grayson Mitchell ([grayson-mitchell][maintainer]) | Modifies the source code without additional review        |
| Reviewer | Grayson Mitchell ([grayson-mitchell][maintainer]) | Reviews changes proposed by contributors outside the team |
| Approver | Grayson Mitchell ([grayson-mitchell][maintainer]) | Approves each signing request                             |

GameLib currently has a single maintainer, who holds all three roles.

**Privacy:** see the [privacy policy](PRIVACY.md).

[maintainer]: https://github.com/grayson-mitchell

## Privacy

GameLib contains no telemetry, analytics or crash reporting, and it stores store credentials in your
operating system's credential store where one is used. It does make network requests to the stores
and data sources it needs. [PRIVACY.md](PRIVACY.md) lists what is stored, what is sent and to whom.

## Development environment

This part will walk you through setting up a development environment so you can build GameLib binaries yourself or make changes to the code.

1. Make sure Git, Node.js 22 or newer, pnpm 10 and the stable Rust toolchain are installed (see
   [Prerequisites](#prerequisites))
2. Clone the repo and enter the cloned folder, for example with these commands:

   ```bash
   git clone https://github.com/grayson-mitchell/GameLib.git
   cd GameLib
   ```

3. Make sure all dependencies are installed by running `pnpm install`
4. Download all helper binaries using `pnpm download-helper-binaries`

### Building GameLib Binaries

The reference build is `.github/workflows/release-tauri.yml`. Run these steps in order:

```bash
pnpm build-steam-bridge # macOS only
pnpm exec vite build
pnpm build:sidecar-sea
pnpm exec tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

`src-tauri/tauri.conf.json` sets `createUpdaterArtifacts: true` and commits the updater public key,
so `tauri build` fails without `TAURI_SIGNING_PRIVATE_KEY`. The `--config` override turns updater
artifacts off for a local build.

`pnpm build:sidecar-sea` writes the sidecar to `src-tauri/binaries/`.

The release workflow also signs macOS builds; local builds are not signed.

### Quickly testing/debugging GameLib on your own system

If you want to quickly test a change, or you're implementing features that require a lot of restarts, run `pnpm tauri:dev`.
It runs a pre-flight check that refuses to start while a different GameLib shell is running, bundles the sidecar once, and starts Vite's development server for the renderer.
Frontend changes reload live. Sidecar changes need a restart.

`pnpm tauri:dev` sets `GAMELIB_DEV_SECRET_VAULT=1`. That keeps the Steam refresh token and the Humble Bundle session secrets in a plaintext development vault on local disk instead of the OS credential store.
`pnpm tauri:dev:keyring` runs the same thing with the OS credential store.

### Development on Nix

[shell.nix](shell.nix) provides Node.js 22 and pnpm in an FHS environment. It does not run the
[installation steps](#development-environment) for you, and it does not include the Rust toolchain or
the WebKitGTK libraries a Tauri build needs. It predates GameLib's move to Tauri (last changed
2025-07-14).

## Credits

### Weblate: Localization platform

The platform hosting Heroic Games Launcher's translations, which GameLib inherits.

- URL: https://weblate.org/en/

### Those Awesome Guys: Gamepad prompts images

- URL: https://thoseawesomeguys.com/prompts/

### Tools We Use to Run Games

GameLib would not be possible without the work done in many other projects:

- Legendary: https://github.com/derrod/legendary (we use [a fork of it](https://github.com/Heroic-Games-Launcher/legendary))
- GOGdl: https://github.com/Heroic-Games-Launcher/heroic-gogdl
- Nile: https://github.com/imLinguin/nile
- Comet: https://github.com/imLinguin/comet
- GE-Proton: https://github.com/GloriousEggroll/proton-ge-custom
- Proton-cachyos: https://github.com/CachyOS/proton-cachyos
- umu-launcher: https://github.com/Open-Wine-Components/umu-launcher
- DXVK: https://github.com/doitsujin/dxvk
- VKD3D: https://github.com/HansKristian-Work/vkd3d-proton
- Game-Porting-Toolkit: https://github.com/Gcenx/game-porting-toolkit
- Wine-Staging: https://github.com/Gcenx/macOS_Wine_builds
- Wine-Crossover: https://github.com/Gcenx/winecx
- DXVK-MacOS: https://github.com/Gcenx/DXVK-macOS
- DXMT: https://github.com/3Shain/dxmt
- Heroic-Epic integration exe: https://github.com/Etaash-mathamsetty/heroic-epic-integration
- vulkan helper: https://github.com/imLinguin/vulkan-helper-rs

So be sure to follow and support those projects too!

[![jump](https://img.shields.io/badge/Back%20to%20top-%20?style=flat&color=grey&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjRweCIgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMjRweCIgZmlsbD0iI0ZGRkZGRiI+PHBhdGggZD0iTTAgMGgyNHYyNEgwVjB6IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTQgMTJsMS40MSAxLjQxTDExIDcuODNWMjBoMlY3LjgzbDUuNTggNS41OUwyMCAxMmwtOC04LTggOHoiLz48L3N2Zz4=)](#gamelib)
