import { expect, test } from "bun:test"
import { waveBar, waveLevels, WAVE_BARS } from "../src/activity-wave"

test("wave levels stay in range, taper at the ends and loop seamlessly", () => {
  const levels = waveLevels(24, 1.3, "working")

  expect(levels).toHaveLength(24)
  expect(levels.every((level) => level >= 0 && level <= 1)).toBe(true)
  expect(Math.max(levels[0]!, levels.at(-1)!)).toBeLessThan(Math.max(...levels))
  // One loop later the wave is the same, so precomputed frames never jump.
  waveLevels(24, 0.7).forEach((level, index) => expect(level).toBeCloseTo(waveLevels(24, 0.7 + 2 * Math.PI)[index]!, 9))
})

test("thinking moves less than working", () => {
  const spread = (mode: "thinking" | "working") => {
    const levels = waveLevels(32, 2, mode)
    return Math.max(...levels) - Math.min(...levels)
  }

  expect(spread("thinking")).toBeLessThan(spread("working"))
})

test("bars map levels onto the glyph ramp", () => {
  expect(waveBar(0)).toBe(" ")
  expect(waveBar(0.01)).toBe(WAVE_BARS[1])
  expect(waveBar(1)).toBe("█")
})
