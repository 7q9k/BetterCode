import { readFileSync } from "node:fs"
import path from "node:path"
import { app } from "electron"
import type { Endpoint } from "@opencode/client/service"
import { CHANNEL } from "../constants"

// The main thread idles between showing the first window and evaluating the main bundle, waiting
// for the renderer's asset requests. That slot is long enough to find out whether a compatible
// background service is already running, so the renderer's first data request is not the first
// moment anyone asks. The probe only looks; a service that has to be started waits for the layers,
// which set the environment the CLI expects.
let probe: Promise<Endpoint | undefined> | undefined

export function startSidecarProbe() {
  if (!app.isPackaged) return
  const version = CHANNEL === "beta" ? undefined : bundledVersion()

  if (version === "") return

  probe = Promise.all([import("@opencode/client/service"), bettercodeServiceFile()])
    .then(([client, file]) => client.Service.discover({ version, file }))
    .catch(() => undefined)
}

let serviceFile: Promise<string> | undefined

/**
 * Where the bundled BetterCode CLI registers its service: `~/.bettercode/state` (see OPENCODE_APP_NAME in
 * packages/cli/script/build.ts). Builds before v0.0.10 kept their data in the XDG folders; a service still running
 * from those holds the database, so it is stopped first (the bundled CLI replaces it anyway) and the folders move.
 */
export function bettercodeServiceFile() {
  serviceFile ??= locateServiceFile()

  return serviceFile
}

async function locateServiceFile() {
  if (process.env.XDG_STATE_HOME) return path.join(process.env.XDG_STATE_HOME, "bettercode", "service.json")
  const { bettercodeFolders, pendingMoveService } = await import("@opencode/util/bettercode-home")
  const { Service } = await import("@opencode/client/service")
  const pending = pendingMoveService(app.getPath("home"))

  if (pending) await Service.stop({ file: pending, pty: "handoff" }).catch(() => undefined)

  return path.join(bettercodeFolders(app.getPath("home")).state, "service.json")
}

/** The probe's result, once: a later connect must not adopt a service that may have exited since boot. */
export function takeSidecarProbe() {
  const result = probe ?? Promise.resolve(undefined)
  probe = undefined

  return result
}

function bundledVersion() {
  try {
    return readFileSync(path.join(process.resourcesPath, "opencode-cli.version"), "utf8").trim()
  } catch {
    return ""
  }
}
