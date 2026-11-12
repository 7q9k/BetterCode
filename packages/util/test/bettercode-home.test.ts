import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { defaultAgents } from "../src/bettercode-agents.js"
import { bettercodeFolders, homeFolders, legacyFolders, pendingMoveService } from "../src/bettercode-home.js"

let home = ""

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "bettercode-home-"))
  delete process.env.BETTERCODE_LAYOUT
})

afterEach(() => {
  delete process.env.BETTERCODE_LAYOUT
  fs.rmSync(home, { recursive: true, force: true })
})

describe("bettercode home", () => {
  test("a fresh install keeps everything in ~/.bettercode", () => {
    expect(bettercodeFolders(home)).toEqual(homeFolders(home))
    expect(process.env.BETTERCODE_LAYOUT).toBe("home")
    expect(fs.readFileSync(path.join(homeFolders(home).config, "AGENTS.md"), "utf8")).toBe(defaultAgents)
  })

  test("moves the old XDG folders over", () => {
    const old = legacyFolders(home)
    write(path.join(old.data, "opencode.db"), "db")
    write(path.join(old.config, "AGENTS.md"), "rules")
    write(path.join(old.state, "locks", "x"), "")
    write(path.join(old.cache, "bin", "rg"), "")

    const own = bettercodeFolders(home)

    expect(own).toEqual(homeFolders(home))
    expect(fs.readFileSync(path.join(own.data, "opencode.db"), "utf8")).toBe("db")
    expect(fs.readFileSync(path.join(own.config, "AGENTS.md"), "utf8")).toBe("rules")
    expect(fs.existsSync(path.join(own.state, "locks", "x"))).toBe(true)
    expect(fs.existsSync(path.join(own.cache, "bin", "rg"))).toBe(true)
    expect(fs.existsSync(old.data)).toBe(false)
  })

  test("an existing home without rules stays without them", () => {
    fs.mkdirSync(homeFolders(home).data, { recursive: true })

    bettercodeFolders(home)

    expect(fs.existsSync(path.join(homeFolders(home).config, "AGENTS.md"))).toBe(false)
  })

  test("keeps the old folders while a service still runs from them", () => {
    const old = legacyFolders(home)
    write(path.join(old.data, "opencode.db"), "db")
    write(path.join(old.state, "service.json"), JSON.stringify({ pid: process.pid }))

    expect(pendingMoveService(home)).toBe(path.join(old.state, "service.json"))
    expect(bettercodeFolders(home)).toEqual(old)
    expect(fs.existsSync(path.join(old.data, "opencode.db"))).toBe(true)
    expect(pendingMoveService(home)).toBeUndefined()
  })

  test("a pinned layout is followed without moving anything", () => {
    const old = legacyFolders(home)
    write(path.join(old.data, "opencode.db"), "db")
    process.env.BETTERCODE_LAYOUT = "legacy"

    expect(bettercodeFolders(home)).toEqual(old)
    expect(fs.existsSync(homeFolders(home).data)).toBe(false)
  })
})

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
