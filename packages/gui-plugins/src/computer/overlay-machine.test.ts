import { describe, expect, test } from "bun:test"
import { createOverlayState, QUIET_MS, transitionOverlay, type OverlayState } from "./overlay-machine"

const activity = (action: "move" | "click" | "end", x = 10, y = 20) => ({
  type: "activity" as const,
  activity: { action, x, y },
})

describe("computer overlay", () => {
  test("the first activity shows the frame and the cursor; later ones only move the cursor", () => {
    const first = transitionOverlay(createOverlayState(), activity("move"))

    expect(first.state).toEqual({ type: "shown", attempt: 1 })
    expect(first.effects.map((effect) => effect.type)).toEqual(["show", "pointer", "quiet.arm"])

    const second = transitionOverlay(first.state, activity("click"))

    expect(second.effects.map((effect) => effect.type)).toEqual(["pointer", "quiet.arm"])
    expect(second.effects.at(-1)).toEqual({ type: "quiet.arm", attempt: 2, ms: QUIET_MS })
  })

  test("a quiet spell hides it, but only the timer of the latest activity counts", () => {
    const shown = transitionOverlay(transitionOverlay(createOverlayState(), activity("move")).state, activity("click"))

    expect(transitionOverlay(shown.state, { type: "quiet", attempt: 1 }).state).toBe(shown.state)

    const quiet = transitionOverlay(shown.state, { type: "quiet", attempt: 2 })

    expect(quiet.state).toEqual({ type: "hidden", attempt: 2 })
    expect(quiet.effects).toEqual([{ type: "hide" }])
  })

  test("end hides at once; after disposal nothing reacts", () => {
    const shown = transitionOverlay(createOverlayState(), activity("move")).state

    expect(transitionOverlay(shown, activity("end")).effects.map((effect) => effect.type)).toEqual([
      "quiet.cancel",
      "hide",
    ])

    const hidden: OverlayState = { type: "hidden", attempt: 3 }

    expect(transitionOverlay(hidden, activity("end")).effects).toEqual([])

    const disposed = transitionOverlay(shown, { type: "disposed" }).state

    expect(transitionOverlay(disposed, activity("move")).effects).toEqual([])
  })
})
