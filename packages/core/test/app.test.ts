import { expect, test } from "bun:test"
import path from "node:path"
import { App } from "@opencode/core/app"

test("formats app metadata as a user agent", () => {
  expect(App.useragent(App.make({ name: "sdk", version: "3.0.1", channel: "beta" }))).toBe("opencode/beta/3.0.1/sdk")
})

test("reports at least the synced OpenCode version, so OpenCode's version gates accept BetterCode releases", () => {
  expect(App.useragent(App.make({ name: "cli", version: "0.0.5", channel: "latest" }))).toBe(
    `opencode/latest/${App.BASE_VERSION}/cli`,
  )
  expect(App.useragent(App.make({ name: "cli", version: "local", channel: "local" }))).toBe("opencode/local/local/cli")
})

test("the synced OpenCode version matches package.json, which the upstream sync updates", async () => {
  const pkg = await Bun.file(path.join(import.meta.dir, "..", "package.json")).json()
  expect(App.BASE_VERSION).toBe(pkg.version)
})
