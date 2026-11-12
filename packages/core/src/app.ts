export * as App from "./app.js"

import { Context, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"

export interface Info {
  readonly name: string
  readonly version: string
  readonly channel: string
}

export class Service extends Context.Service<Service, Info>()("@opencode/App") {}

export function make(input: Partial<Info> = {}): Info {
  return {
    name: input.name ?? "opencode",
    version: input.version ?? "unknown",
    channel: input.channel ?? "unknown",
  }
}

/**
 * The OpenCode release this code is synced from, as the repository's package.json versions say. BetterCode numbers its
 * own releases from 0.0.1, but OpenCode's servers read the version from the User-Agent and gate features on it, such as
 * the free tier ("OpenCode 1.18.0 or newer is required"), so a release reports at least this version.
 */
export const BASE_VERSION = "2.2.7"

export function useragent(app: Info) {
  return `opencode/${app.channel}/${reported(app.version)}/${app.name}`
}

// A release version below the synced OpenCode version reports that version; dev labels such as "local" pass through.
function reported(version: string) {
  const parts = parse(version)
  if (!parts) return version
  const base = parse(BASE_VERSION) ?? [0, 0, 0]
  const lower = parts.findIndex((part, index) => part !== base[index])
  return lower >= 0 && parts[lower]! < base[lower]! ? BASE_VERSION : version
}

function parse(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

export const layer = (input?: Partial<Info>) => Layer.succeed(Service, make(input))

export const configured = (input?: Partial<Info>) =>
  makeGlobalNode({ service: Service, layer: layer(input), deps: [] })

export const node = configured()
