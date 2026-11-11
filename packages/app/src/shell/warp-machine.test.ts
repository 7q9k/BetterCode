import { describe, expect, test } from "bun:test"
import { IDLE_WARP, transitionWarp } from "./warp-machine"

describe("transitionWarp", () => {
  test("plays on request and returns to idle when that run finishes", () => {
    const playing = transitionWarp(IDLE_WARP, { type: "requested", reduced: false })
    expect(playing).toEqual({ type: "playing", run: 1 })
    expect(transitionWarp(playing, { type: "finished", run: 1 })).toBe(IDLE_WARP)
  })

  test("a request while playing restarts it, and the earlier run's finish is ignored", () => {
    const first = transitionWarp(IDLE_WARP, { type: "requested", reduced: false })
    const second = transitionWarp(first, { type: "requested", reduced: false })
    expect(second).toEqual({ type: "playing", run: 2 })
    expect(transitionWarp(second, { type: "finished", run: 1 })).toBe(second)
  })

  test("reduced motion never starts it", () => {
    expect(transitionWarp(IDLE_WARP, { type: "requested", reduced: true })).toBe(IDLE_WARP)
  })
})
