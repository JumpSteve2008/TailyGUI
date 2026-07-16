# sillyTaily Desktop

[![Build and Release](https://github.com/JumpSteve2008/TailyGUI/actions/workflows/build.yml/badge.svg)](https://github.com/JumpSteve2008/TailyGUI/actions/workflows/build.yml)

Windows desktop application for [SillyTavern](https://github.com/SillyTavern/SillyTavern) — no Node.js installation required, just download and run.

## Features

- **Zero-setup** — SillyTavern runtime and all dependencies bundled into a single installer
- **Multi-profile** — isolated profiles with independent data, configs, ports, and extensions
- **Sandbox isolation** — per-profile lock files, dynamic port allocation, PID validation, automatic zombie lock cleanup
- **Crash recovery** — ST server auto-restart on crash (up to 3 attempts)
- **Frameless Fluent UI** — custom titlebar with Windows 11 Mica-inspired design
- **Window state memory** — remembers position, size, and maximized state

## Quick Start

### Download

Download the latest installer from [GitHub Releases](https://github.com/JumpSteve2008/TailyGUI/releases).

Run `sillyTaily-Setup-x.x.x.exe` and follow the installer.

### From Source

```bash
# Clone with submodule
git clone --recurse-submodules https://github.com/JumpSteve2008/TailyGUI.git
cd TailyGUI

# Install dependencies
pnpm install

# Install ST dependencies
cd vendor/SillyTavern && npm install && cd ../..

# Apply Node.js 24 compatibility patches (required)
# These fix crypto hash and iframe embedding issues
node scripts/patch-st.js

# Run in dev mode
pnpm dev

# Run with custom profile
pnpm dev -- --profile work
```

## Build

```bash
pnpm build:win
```

Output: `release/sillyTaily Setup x.x.x-beta.exe`

### Build environment variables (for China mainland)

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
pnpm build:win
```

## Architecture

```
app launch
  → parse --profile arg (default: "default")
  → sandbox.setupProfile()
    ├─ check lock file (PID alive → conflict, activate existing)
    ├─ allocate port (reuse last, or scan from 8000)
    ├─ create profile dirs (%APPDATA%/sillyTaily/profiles/{name}/)
    └─ init config.yaml from ST default
  → spawn ST child process (node server.js)
  → health check polling (GET /, 30s timeout)
  → create BrowserWindow → load ST web UI via iframe
  → on close: SIGTERM → wait → SIGKILL → release lock
```

## Profile Directory

```
%APPDATA%/sillyTaily/
├── profiles.json              # profile registry
├── profiles/
│   └── default/
│       ├── .lock               # { pid, port, timestamp, hostname }
│       ├── config.yaml         # ST config
│       └── data/               # ST data root (characters, chats, settings...)
```

## Project Structure

```
TailyGUI/
├── src/
│   ├── main/
│   │   ├── index.ts            # App lifecycle, window management
│   │   ├── sandbox.ts          # Profile isolation, port allocation, lock files
│   │   ├── st-server.ts        # ST child process spawn & health check
│   │   ├── ipc.ts              # IPC handler registration
│   │   └── logger.ts           # electron-log wrapper
│   ├── preload/
│   │   └── index.ts            # contextBridge API
│   └── renderer/
│       ├── index.html          # Shell UI (titlebar + content area)
│       ├── app.js              # Renderer logic
│       └── style.css           # Fluent Design styles
├── vendor/
│   └── SillyTavern/            # ST source (git submodule)
├── scripts/
│   ├── bundle-st.js            # Pre-bundle ST for packaging
│   └── copy-renderer.js        # Copy renderer files to dist
├── resources/
│   └── icons/                  # App icons
├── electron-builder.yml        # NSIS installer config
├── package.json
└── tsconfig.*.json
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 43 |
| ST runtime | Node.js (bundled) |
| Language | TypeScript |
| Build | tsc + electron-builder |
| Installer | NSIS |
| Logging | electron-log |
| Config store | electron-store |

## ST Compatibility Patches

Electron 43 ships with Node.js 24, which has breaking changes. Two patches are required:

1. **crypto hash** — Node 24 removed `shake256`. Replaced with `sha256` in `vendor/SillyTavern/webpack.config.js`
2. **X-Frame-Options** — Helmet blocks iframe embedding. Disabled via `frameguard: false` in `vendor/SillyTavern/src/server-main.js`

Run `node scripts/patch-st.js` after `npm install` in the ST directory to apply both patches automatically.

## Known Issues

### WASM image processing (Node 24)

`@jsquash/jpeg` thumbnail generation fails in Electron's Node 24 environment due to `fetch('file://')` not being supported. Images work fine — only automatic thumbnail/color extraction for avatars is affected. Will be fixed in a future upstream ST update.

## License

AGPL-3.0 — same as SillyTavern upstream.
