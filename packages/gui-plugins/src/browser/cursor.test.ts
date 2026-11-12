import { expect, test } from "bun:test"
import { glidePath } from "./cursor"

test("a glide ends exactly on the target, eases out and lasts longer for longer moves", () => {
  const short = glidePath({ x: 0, y: 0 }, { x: 40, y: 0 })
  const long = glidePath({ x: 0, y: 0 }, { x: 1200, y: 600 })

  expect(short.points.at(-1)).toEqual({ x: 40, y: 0 })
  expect(long.points.at(-1)).toEqual({ x: 1200, y: 600 })
  expect(long.duration).toBeGreaterThan(short.duration)
  expect(long.duration).toBeLessThanOrEqual(650)
  // Every step moves forward, and the last steps are shorter than the middle ones: the pointer slows into the target.
  const xs = long.points.map((point) => point.x)
  const steps = xs.slice(1).map((x, index) => x - xs[index]!)
  expect(steps.every((step) => step >= 0)).toBe(true)
  expect(steps.at(-1)!).toBeLessThan(steps[Math.floor(steps.length / 2)]!)
})

test("a pointer already on the target does not glide", () => {
  expect(glidePath({ x: 10, y: 10 }, { x: 10.4, y: 10 })).toEqual({ duration: 0, points: [{ x: 10.4, y: 10 }] })
})
