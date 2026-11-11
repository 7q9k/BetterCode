import { describe, expect, test } from "bun:test"
import { createSegmenter, feedSegmenter, flushSegmenter, SAMPLE_RATE } from "./segmenter"

const CHUNK = 128

// Feeds `seconds` of a tone (speech) or near-silence, returning the segments it cut.
const feed = (state: ReturnType<typeof createSegmenter>, seconds: number, loud: boolean) =>
  Array.from({ length: Math.round((seconds * SAMPLE_RATE) / CHUNK) }, (_, index) => {
    const chunk = new Float32Array(CHUNK).map((_, i) =>
      // Speech: a tone in syllables of 250 ms with short gaps between them.
      loud && index % 32 < 28 ? Math.sin(((index * CHUNK + i) / SAMPLE_RATE) * 2 * Math.PI * 220) * 0.2 : 0.0005,
    )

    return feedSegmenter(state, chunk).segment
  }).filter((segment) => segment !== undefined)

describe("dictation segmenter", () => {
  test("cuts at a pause after speech", () => {
    const state = createSegmenter()

    expect(feed(state, 0.3, false)).toEqual([])
    expect(feed(state, 1.5, true)).toEqual([])

    const cut = feed(state, 0.7, false)
    expect(cut).toHaveLength(1)
    // The lead-in silence is kept short, the speech and the pause are kept whole.
    expect(cut[0]!.length / SAMPLE_RATE).toBeGreaterThan(1.9)
    expect(cut[0]!.length / SAMPLE_RATE).toBeLessThan(2.5)
  })

  test("never sends silence, however long", () => {
    const state = createSegmenter()

    expect(feed(state, 30, false)).toEqual([])
    expect(flushSegmenter(state)).toBeUndefined()
  })

  test("a short pause inside a sentence does not cut it", () => {
    const state = createSegmenter()

    expect([...feed(state, 1, true), ...feed(state, 0.2, false), ...feed(state, 1, true)]).toEqual([])
    expect(flushSegmenter(state)?.length).toBeGreaterThan(2 * SAMPLE_RATE)
  })

  test("a click before a long silence does not keep the silence", () => {
    const state = createSegmenter()

    expect([...feed(state, 0.05, true), ...feed(state, 10, false), ...feed(state, 1.5, true)]).toEqual([])

    const cut = feed(state, 0.7, false)
    expect(cut).toHaveLength(1)
    expect(cut[0]!.length / SAMPLE_RATE).toBeLessThan(2.7)
  })

  test("a short word and a breath stay with the sentence after them", () => {
    const state = createSegmenter()

    expect([...feed(state, 0.25, true), ...feed(state, 0.6, false), ...feed(state, 1.5, true)]).toEqual([])
    expect(flushSegmenter(state)!.length / SAMPLE_RATE).toBeGreaterThan(2.3)
  })

  test("long speech without a pause is cut before Whisper's limit", () => {
    const state = createSegmenter()

    expect(feed(state, 27, true).map((segment) => segment.length / SAMPLE_RATE)).toEqual([25])
  })
})
