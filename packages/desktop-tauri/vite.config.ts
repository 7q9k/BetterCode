import path from "node:path"
import { defineConfig, type Plugin } from "vite"

// Builds the Electron desktop renderer (packages/desktop/src/renderer) unchanged for the Tauri shell. The only module
// that differs is the IPC transport: imports of the renderer's ipc-client resolve to src/bridge.ts, which speaks to
// the Rust side instead of Electron's MessagePort. Everything the user sees is the same code.

const renderer = path.resolve(import.meta.dirname, "../desktop/src/renderer")
const transport = path.join(renderer, "ipc-client.ts")
const bridge = path.resolve(import.meta.dirname, "src/bridge.ts")

const tauriTransport: Plugin = {
  name: "bettercode-tauri:transport",
  enforce: "pre",
  async resolveId(source, importer, options) {
    if (!source.includes("ipc-client") || importer === bridge) return null
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })

    return resolved && path.normalize(resolved.id) === transport ? bridge : null
  },
}

const appPlugin = (await import("@opencode/app/vite")).default

export default defineConfig(({ command }) => ({
  root: renderer,
  publicDir: path.resolve(import.meta.dirname, "../app/public"),
  clearScreen: false,
  plugins: [tauriTransport, appPlugin],
  define: {
    "import.meta.env.OPENCODE_VERSION": JSON.stringify(process.env.OPENCODE_VERSION),
    "import.meta.env.VITE_OPENCODE_CHANNEL": JSON.stringify(process.env.OPENCODE_CHANNEL === "latest" ? "prod" : "dev"),
    "import.meta.env.OPENCODE_COMMIT": "undefined",
    "import.meta.env.OPENCODE_BETA_NOTES": "undefined",
    "import.meta.env.OPENCODE_TEST_ONBOARDING": "false",
  },
  server: { port: 1420, strictPort: true },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    minify: command === "build",
    target: "es2022",
  },
}))
