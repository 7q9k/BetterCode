// The working indicator's audio wave, shared by the desktop app and the terminal UI: a row of bar glyphs whose heights
// follow three sine waves running at different speeds, so the row moves like a level meter, smoothly and without a
// visible repeat. The ends taper so the row reads as one shape.

/** Bar glyphs from silent to full. */
export const WAVE_BARS = " ▁▂▃▄▅▆▇█"

/** How busy the wave looks: thinking breathes slowly, working runs faster and fuller. */
export type WaveMode = "thinking" | "working"

/**
 * The heights of a wave of `width` bars at phase `phase` (radians; one full loop is 2π), each from 0 to 1. Every
 * component's speed is a whole multiple of the phase, so frames sampled over one loop repeat seamlessly.
 */
export function waveLevels(width: number, phase: number, mode: WaveMode = "thinking") {
  const lively = mode === "working" ? 1 : 0.55
  // The whole wave swells and settles once per loop, like a voice between words.
  const breath = 0.8 + 0.2 * Math.sin(phase)

  return Array.from({ length: width }, (_, index) => {
    const taper = Math.sin((Math.PI * (index + 0.5)) / width) ** 0.45
    const wave =
      0.42 +
      0.3 * Math.sin(index * 0.5 - phase * 2) +
      0.2 * lively * Math.sin(index * 0.21 + phase * 3) +
      0.14 * lively * Math.sin(index * 1.37 - phase * 5)

    const level = Math.max(0, Math.min(1, wave * taper * breath * (0.85 + 0.35 * lively)))

    // A soft contrast curve lifts the middle heights, so the wave uses the whole bar range instead of hugging the floor.
    return Math.min(1, level ** 0.7)
  })
}

/** The bar glyph for a level from 0 to 1; a level above zero always shows at least the lowest bar. */
export function waveBar(level: number) {
  if (level <= 0) return WAVE_BARS[0]!

  return WAVE_BARS[Math.max(1, Math.min(WAVE_BARS.length - 1, Math.round(level * (WAVE_BARS.length - 1))))]!
}
