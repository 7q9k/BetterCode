import os from "os"
import path from "path"
import { bettercodeFolders } from "./bettercode-home.js"

const home = os.homedir()
const xdg = {
  data: process.env.XDG_DATA_HOME,
  cache: process.env.XDG_CACHE_HOME,
  config: process.env.XDG_CONFIG_HOME,
  state: process.env.XDG_STATE_HOME,
}
const data = xdg.data || (home ? path.join(home, ".local", "share") : undefined)
const cache = xdg.cache || (home ? path.join(home, ".cache") : undefined)
const config = xdg.config || (home ? path.join(home, ".config") : undefined)
const state = xdg.state || (home ? path.join(home, ".local", "state") : undefined)

/** The base directories that root opencode's global paths: XDG, or `~/.bettercode` for BetterCode. */
export function roots(app: string) {
  const tmp = path.join(os.tmpdir(), app)

  // XDG variables set explicitly (tests, isolated desktop runs) keep their meaning for BetterCode too.
  if (app === "bettercode" && home && !Object.values(xdg).some(Boolean)) return { ...bettercodeFolders(home), tmp }

  return {
    data: path.join(data!, app),
    cache: path.join(cache!, app),
    config: path.join(config!, app),
    state: path.join(state!, app),
    tmp,
  }
}
