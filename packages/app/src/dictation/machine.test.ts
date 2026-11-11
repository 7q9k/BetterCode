import { describe, expect, test } from "bun:test"
import {
  IDLE_DICTATION,
  dictationView,
  transitionDictation,
  type DictationEffect,
  type DictationEvent,
  type DictationState,
} from "./machine"

const run = (events: DictationEvent[], from: DictationState = IDLE_DICTATION) => {
  const effects: DictationEffect[] = []

  const state = events.reduce((current, event) => {
    const next = transitionDictation(current, event)
    effects.push(...next.effects)

    return next.state
  }, from)

  return { state, effects }
}

const audio = new Float32Array(16)

describe("dictation machine", () => {
  test("records, transcribes and inserts the text", () => {
    const result = run([
      { type: "toggle" },
      { type: "started", attempt: 1 },
      { type: "toggle" },
      { type: "recorded", attempt: 1, audio },
      { type: "progress", attempt: 1, progress: 40 },
      { type: "transcribed", attempt: 1, text: "hallo welt" },
    ])

    expect(result.state).toEqual({ status: "idle", attempt: 1 })
    expect(result.effects).toEqual([
      { type: "start", attempt: 1 },
      { type: "stop", attempt: 1, keep: true },
      { type: "transcribe", attempt: 1, audio },
      { type: "insert", text: "hallo welt" },
    ])
  })

  test("a second press while starting or transcribing does nothing", () => {
    const starting = transitionDictation(IDLE_DICTATION, { type: "toggle" }).state
    expect(transitionDictation(starting, { type: "toggle" }).state).toBe(starting)

    const transcribing: DictationState = { status: "transcribing", attempt: 1 }
    expect(transitionDictation(transcribing, { type: "toggle" }).state).toBe(transcribing)
  })

  test("cancel drops the take and ignores its late results", () => {
    const result = run([
      { type: "toggle" },
      { type: "started", attempt: 1 },
      { type: "cancel" },
      { type: "recorded", attempt: 1, audio },
      { type: "transcribed", attempt: 1, text: "late" },
    ])

    expect(result.state).toEqual({ status: "idle", attempt: 1 })
    expect(result.effects).toEqual([
      { type: "start", attempt: 1 },
      { type: "stop", attempt: 1, keep: false },
    ])
  })

  test("a result of an older attempt is ignored", () => {
    const result = run(
      [
        { type: "transcribed", attempt: 1, text: "old" },
        { type: "progress", attempt: 1, progress: 10 },
      ],
      { status: "transcribing", attempt: 2 },
    )

    expect(result.state).toEqual({ status: "transcribing", attempt: 2 })
    expect(result.effects).toEqual([])
  })

  test("a microphone that opens after cancel is closed again", () => {
    const result = run([{ type: "toggle" }, { type: "cancel" }, { type: "started", attempt: 1 }])

    expect(result.state).toEqual({ status: "idle", attempt: 1 })
    expect(result.effects.at(-1)).toEqual({ type: "stop", attempt: 1, keep: false })
  })

  test("denied access and failed transcription end in an error that the next press clears", () => {
    const denied = run([{ type: "toggle" }, { type: "denied", attempt: 1 }])
    expect(dictationView(denied.state).error).toBe("microphone")

    const failed = run([{ type: "failed", attempt: 3 }], { status: "transcribing", attempt: 3 })
    expect(dictationView(failed.state).error).toBe("transcription")

    expect(transitionDictation(failed.state, { type: "toggle" }).state).toEqual({ status: "starting", attempt: 4 })
  })

  test("a take too short to transcribe returns to idle without inserting", () => {
    const result = run([{ type: "recorded", attempt: 1 }], { status: "transcribing", attempt: 1 })

    expect(result.state).toEqual({ status: "idle", attempt: 1 })
    expect(result.effects).toEqual([])
  })

  test("dispose closes an open microphone", () => {
    expect(transitionDictation({ status: "recording", attempt: 2 }, { type: "disposed" }).effects).toEqual([
      { type: "stop", attempt: 2, keep: false },
    ])
    expect(transitionDictation(IDLE_DICTATION, { type: "disposed" }).state).toBe(IDLE_DICTATION)
  })

  test("the view reports the model download only until it completes", () => {
    expect(dictationView({ status: "transcribing", attempt: 1, progress: 30 }).loading).toBe(30)
    expect(dictationView({ status: "transcribing", attempt: 1, progress: 100 }).loading).toBeUndefined()
  })
})
