# BetterCode desktop (Tauri)

The BetterCode desktop app on [Tauri 2](https://tauri.app): a Rust shell around the system web view instead of
Electron's bundled Chromium. It shows the very same interface as the Electron app, because it builds the same
renderer (`packages/desktop/src/renderer`).

## How it fits together

| Part | Electron app (`packages/desktop`) | Tauri app (this package) |
| --- | --- | --- |
| Interface | `src/renderer` | the same `src/renderer`, unchanged |
| Renderer transport | `src/renderer/ipc-client.ts` (MessagePort) | `src/bridge.ts`, swapped in by `vite.config.ts` |
| Main process | `src/main` (TypeScript) | `src-tauri/src` (Rust): `rpc.rs` answers the same calls |
| Window buttons (Windows) | native title bar overlay | `src/window-controls.ts` in the same 138 px |
| Background service | `serve --service`, found through `service.json` | the same, in `sidecar.rs` |

The renderer calls the desktop through `window.electron`-style RPCs (`packages/desktop/src/shared/ipc-rpc`).
`bridge.ts` sends each call to the Rust command `rpc` with its tag and payload, and Rust replies with the value the
Electron main process would. Bytes cross as `{"$bytes": base64}`.

The server password reaches the renderer here (Electron injects it into request headers instead), and the app
authenticates the way it does against any password-protected server. The server already allows the Tauri origins.

## Status (phase 1)

Works: the full interface, the background service, storage and drafts, file and folder pickers, saving files,
clipboard, opening links and paths, zoom, fullscreen, the window frame on Windows, several windows.

Not yet: main-process GUI plugins (the embedded browser pane, debug tools, pairing, SSH, WSL), deep links, the
first-launch onboarding, macOS and Linux tuning, signed release builds.

## Develop

```bash
bun install
cd packages/desktop-tauri
bun run dev
```

`bun run dev` starts the renderer on port 1420 and the Tauri window. The app looks for the BetterCode CLI bundled
next to it, then in `~/.bettercode/bin`, then `bettercode` on `PATH`. To run the CLI from source instead:

```bash
BETTERCODE_CLI_COMMAND='["bun","run","--cwd","<repo>/packages/cli","src/index.ts"]' \
BETTERCODE_SERVICE_FILE="$HOME/.local/state/opencode/service-local.json" \
bun run dev
```

(A CLI run from source keeps the upstream `opencode` state folder and the `local` channel, so it registers as `service-local.json` there.)

## Build

```bash
bun run build
```

produces the installer in `src-tauri/target/release/bundle`.
