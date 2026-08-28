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

GameLib is built with Web Technologies:  
[![Typescript](https://img.shields.io/badge/Typescript-3178c6?style=for-the-badge&logo=typescript&labelColor=gray)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-5fd9fb?style=for-the-badge&logo=react&labelColor=gray)](https://reactjs.org/)
[![MUI](https://img.shields.io/badge/MUI-66b2ff?style=for-the-badge&logo=mui&labelColor=gray&logoColor=66b2ff)](https://mui.com/)
[![NodeJS](https://img.shields.io/badge/NodeJS-689f63?style=for-the-badge&logo=nodedotjs&labelColor=gray)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-4078c0?style=for-the-badge&logo=electron&labelColor=gray)](https://www.electronjs.org/)
[![electron-builder](https://img.shields.io/badge/electron--builder-4078c0?style=for-the-badge&logo=electronbuilder&labelColor=gray&logoColor=4078c0)](https://www.electron.build/)
[![Jest](https://img.shields.io/badge/Jest-18DF16?style=for-the-badge&logo=jest&labelColor=gray&logoColor=18DF16)](https://jestjs.io/)
[![Vite](https://img.shields.io/badge/Vite-BD34FE?style=for-the-badge&logo=vite&labelColor=gray)](https://vitejs.dev/)

## Index

- [GameLib](#gamelib)
  - [Index](#index)
  - [Features available right now](#features-available-right-now)
  - [Planned features](#planned-features)
  - [Supported Operating Systems](#supported-operating-systems)
  - [Language Support](#language-support)
    - [Help with Translations Here](#help-with-translations-here)
  - [Installation](#installation)
    - [Prerequisites](#prerequisites)
    - [Linux](#linux)
    - [Windows / macOS](#windows--macos)
  - [Development environment](#development-environment)
    - [Building GameLib Binaries](#building-gamelib-binaries)
    - [Building with VS Code](#building-with-vs-code)
    - [Quickly testing/debugging GameLib on your own system](#quickly-testingdebugging-gamelib-on-your-own-system)
    - [Testing with Docker](#testing-with-docker)
    - [Development on nix](#development-on-nix)
  - [Sponsors](#sponsors)
  - [Screenshots](#screenshots)
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
    Chances are though that someone on our [Discord](https://discord.gg/rHJ2uqdquK) can help you
- SteamOS (downloading using Discover only)
- Windows 10 & 11
- macOS 14 or newer (Apple Silicon only). GameLib will not support Intel Macs on macOS.

## Language Support

<details>
  <summary>Expand</summary>

Thanks to the community, GameLib has been translated to almost 40 different languages so far:

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

### Help with Translations [Here](https://hosted.weblate.org/projects/heroic-games-launcher)

## Installation

GameLib does not publish prebuilt binaries yet, so you install it by **building
from source**. On Linux the build produces an **AppImage**. The steps below are a
quickstart; see [Development environment](#development-environment) for full details.

### Prerequisites

- **Git**, **Node.js ≥ 22**, and **pnpm 10** — `corepack enable` gives you the pinned version
- The **Steam client** installed — GameLib launches Steam games via `steam://`
- On Linux, **FUSE** to run the AppImage (install `libfuse2` if your distro doesn't ship it)

### Linux

```bash
# Clone the repo (with submodules) and enter it
git clone https://github.com/grayson-mitchell/GameLib.git --recurse-submodules
cd GameLib

# Install dependencies and helper binaries
pnpm install
pnpm download-helper-binaries

# Build an installable package — AppImage by default
# (or specify: deb, rpm, pacman, tar.xz)
pnpm dist:linux

# Run the result from ./dist/
chmod +x dist/GameLib-*.AppImage
./dist/GameLib-*.AppImage
```

To just run it without building an installer, use `pnpm start` (dev mode).

### Windows / macOS

Follow the same clone → `pnpm install` → `pnpm download-helper-binaries` steps,
then build with `pnpm dist:win` or `pnpm dist:mac`. See
[Building GameLib Binaries](#building-gamelib-binaries) for details.

## Development environment

This part will walk you through setting up a development environment so you can build GameLib binaries yourself or make changes to the code.

1. Make sure Git, NodeJS, and pnpm 10 are installed  
   **NOTE**: On Windows, due to an issue with electron-builder, you'll need the standalone version of pnpm (`@pnpm/exe`)
   to build packages
2. Clone the repo and enter the cloned folder, for example with these commands:

   ```bash
   git clone https://github.com/grayson-mitchell/GameLib.git --recurse-submodules
   cd GameLib
   ```

3. Make sure all dependencies are installed by running `pnpm install`
4. Download all helper binaries using `pnpm download-helper-binaries`

### Building GameLib Binaries

Run the appropriate command for your OS:

- Build for Linux:

  ```bash
  pnpm dist:linux # Optionally specify a package to create (eg: deb, pacman, tar.xz, rpm, AppImage); default: AppImage
  ```

- Build for Windows:

  ```bash
  pnpm dist:win
  ```

- Build for Mac:
  ```bash
  pnpm dist:mac
  ```

### Building with VS Code

Instead of using the above commands to build GameLib, you can also use the Tasks in VSCode to build.
To do that, open up the command palette (Ctrl + P), type in "task" and press Space. You will then see 3 build tasks, "Build for Linux", "Build for Windows", and "Build for MacOS". Click the one you want to run.

### Quickly testing/debugging GameLib on your own system

If you want to quickly test a change, or you're implementing features that require a lot of restarts, you can use Vite's development server to speed up the process:  
Go to the "Run and Debug" tab of VSCode and start the "Launch GameLib (HMR & HR)" task (alternatively, if you're not using VSCode or just prefer the terminal, run `pnpm start`). GameLib will start up after a short while, and once you make any change to the code, it'll reload/restart.

### Development on Nix

After cloning the repository, Nix users can use `nix-shell` to make Node.JS/pnpm available and automatically run [installation step](#development-environment) 3 and 4. See [shell.nix](shell.nix) for more information.

## Sponsors

Thanks [Weblate](https://weblate.org/en/) for hosting our translations

![weblate](https://s.weblate.org/cdn/Logo-Darktext-borders.png)

Thanks [Signpath](https://signpath.io/?utm_source=foundation&utm_medium=github&utm_campaign=heroicgameslauncher) for providing free signing of Windows binaries

[![signpath](https://user-images.githubusercontent.com/26871415/182468471-6ef4aac6-a4e2-4ae8-93ef-d638cd01627d.png)](https://signpath.io/?utm_source=foundation&utm_medium=github&utm_campaign=heroicgameslauncher)

## Screenshots

<details>
  <summary>Expand</summary>

![image](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/assets/26871415/70c9e0f2-3fa8-4e56-9bb0-0e5f8713c968)
![image](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/assets/26871415/95e199d5-24de-4a23-a8b8-657afd657390)
![image](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/assets/26871415/e190ddce-b16c-40c6-a509-b1337669b65a)
![image](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/assets/26871415/9868d9eb-c141-4b46-874d-e13f668480cb)
![image](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/assets/26871415/07e76bdb-e794-41fd-9028-062fa22f15b6)
![image](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/assets/26871415/8daf7035-4f30-4dcd-a7ef-412ef690a286)
![image](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/assets/26871415/61467411-f518-4d10-b859-9c2adef3302e)

</details>

## Credits

### Weblate: Localization platform

- URL: https://weblate.org/en/

### Those Awesome Guys: Gamepad prompts images

- URL: https://thoseawesomeguys.com/prompts/

[![jump](https://img.shields.io/badge/Back%20to%20top-%20?style=flat&color=grey&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjRweCIgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMjRweCIgZmlsbD0iI0ZGRkZGRiI+PHBhdGggZD0iTTAgMGgyNHYyNEgwVjB6IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTQgMTJsMS40MSAxLjQxTDExIDcuODNWMjBoMlY3LjgzbDUuNTggNS41OUwyMCAxMmwtOC04LTggOHoiLz48L3N2Zz4=)](#heroic-games-launcher)

### Tools We Use to Run Games

Heroic would not be possible without the work done in many other projects:

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
