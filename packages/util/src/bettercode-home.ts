import fs from "fs"
import os from "os"
import path from "path"
import { defaultAgents } from "./bettercode-agents.js"

// BetterCode keeps everything in one folder in the home directory, like ~/.claude: `~/.bettercode/config` (settings,
// AGENTS.md), `data` (sessions database, logs), `state` (service registration, locks) and `cache`. Builds before
// v0.0.10 used the XDG folders (~/.config/bettercode, ~/.local/share/bettercode, ...); their content moves over once.
//
// The move must not pull the database from under a running background service, so while one is registered the old
// folders stay in use. The decision is pinned in the environment, so a service this process spawns uses the same
// folders as the process that waits for its registration.

const kinds = ["data", "config", "state", "cache"] as const

type Folders = Record<(typeof kinds)[number], string>

/** The folders BetterCode keeps its data in, after moving the old XDG folders over when that is safe. */
export function bettercodeFolders(home = os.homedir()) {
  const pinned = process.env.BETTERCODE_LAYOUT
  const layout = pinned === "home" || pinned === "legacy" ? pinned : settle(home)

  process.env.BETTERCODE_LAYOUT = layout

  return layout === "home" ? homeFolders(home) : legacyFolders(home)
}

/** The registration file of a service still running from the old folders, while their move is pending. */
export function pendingMoveService(home = os.homedir()) {
  if (process.env.BETTERCODE_LAYOUT) return undefined
  const own = homeFolders(home)
  const old = legacyFolders(home)

  if (fs.existsSync(own.data) || !fs.existsSync(old.data)) return undefined
  const file = path.join(old.state, "service.json")

  return serviceRunning(file) ? file : undefined
}

export function homeFolders(home: string): Folders {
  const root = path.join(home, ".bettercode")

  return {
    data: path.join(root, "data"),
    config: path.join(root, "config"),
    state: path.join(root, "state"),
    cache: path.join(root, "cache"),
  }
}

export function legacyFolders(home: string): Folders {
  return {
    data: path.join(home, ".local", "share", "bettercode"),
    config: path.join(home, ".config", "bettercode"),
    state: path.join(home, ".local", "state", "bettercode"),
    cache: path.join(home, ".cache", "bettercode"),
  }
}

function settle(home: string) {
  const own = homeFolders(home)
  const old = legacyFolders(home)
  const fresh = !fs.existsSync(path.dirname(own.data))

  if (!fs.existsSync(own.data) && fs.existsSync(old.data)) {
    if (serviceRunning(path.join(old.state, "service.json"))) return "legacy"

    // The database goes first: once it has moved, the new folders are in use for good.
    try {
      fs.mkdirSync(path.dirname(own.data), { recursive: true })
      fs.renameSync(old.data, own.data)
    } catch {
      return "legacy"
    }
  }

  kinds.filter((kind) => fs.existsSync(old[kind]) && !fs.existsSync(own[kind])).forEach((kind) => move(old[kind], own[kind]))

  // Only a new home gets the default rules, so a user who deleted or emptied them keeps it that way.
  if (fresh) writeDefaultAgents(path.join(own.config, "AGENTS.md"))

  return "home"
}

function writeDefaultAgents(file: string) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, defaultAgents, { flag: "wx" })
  } catch {}
}

// A rename can fail while another process holds a file open (Windows) or across drives; a copy keeps the settings.
function move(from: string, to: string) {
  try {
    fs.renameSync(from, to)
  } catch {
    try {
      fs.cpSync(from, to, { recursive: true })
    } catch {}
  }
}

function serviceRunning(file: string) {
  const pid = readPid(file)

  if (pid === undefined) return false

  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}

function readPid(file: string) {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"))

    if (parsed && typeof parsed === "object" && "pid" in parsed && typeof parsed.pid === "number") return parsed.pid
  } catch {}

  return undefined
}
