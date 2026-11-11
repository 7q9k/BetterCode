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

const first = new Float32Array(16)

const last = new Float32Array(8)

describe("dictation machine", () => {
  test("transcribes segments while recording and the last one after stopping", () => {
    const result = run([
      { type: "toggle" },
      { type: "started", attempt: 1 },
      { type: "segment", attempt: 1, audio: first },
      { type: "transcribed", attempt: 1, text: "Hallo," },
      { type: "toggle" },
      { type: "segment", attempt: 1, audio: last },
      { type: "closed", attempt: 1 },
      { type: "transcribed", attempt: 1, text: "wie geht's?" },
    ])

    expect(result.state).toEqual({ status: "idle", attempt: 1 })
    expect(result.effects).toEqual([
      { type: "start", attempt: 1 },
      { type: "transcribe", attempt: 1, audio: first },
      { type: "insert", text: "Hallo," },
      { type: "stop", attempt: 1, keep: true },
      { type: "transcribe", attempt: 1, audio: last },
      { type: "insert", text: "wie geht's?" },
    ])
  })

  test("stays transcribing until the microphone closed and every segment came back", () => {
    const stopped = run([{ type: "toggle" }], { status: "recording", attempt: 1, pending: 1 })
    const answered = run([{ type: "transcribed", attempt: 1, text: "eins" }], stopped.state)

    expect(answered.state).toMatchObject({ status: "transcribing", pending: 0, closed: false })
    expect(run([{ type: "closed", attempt: 1 }], answered.state).state).toEqual({ status: "idle", attempt: 1 })
  })

  test("a second press while starting or transcribing does nothing", () => {
    const starting = transitionDictation(IDLE_DICTATION, { type: "toggle" }).state
    expect(transitionDictation(starting, { type: "toggle" }).state).toBe(starting)

    const transcribing: DictationState = { status: "transcribing", attempt: 1, pending: 1, closed: true }
    expect(transitionDictation(transcribing, { type: "toggle" }).state).toBe(transcribing)
  })

  test("cancel closes the microphone and ignores late results", () => {
    const result = run([
      { type: "toggle" },
      { type: "started", attempt: 1 },
      { type: "segment", attempt: 1, audio: first },
      { type: "cancel" },
      { type: "transcribed", attempt: 1, text: "late" },
    ])

    expect(result.state).toEqual({ status: "idle", attempt: 1 })
    expect(result.effects.at(-1)).toEqual({ type: "stop", attempt: 1, keep: false })
    expect(result.effects).not.toContainEqual({ type: "insert", text: "late" })
  })

  test("a result of an older attempt is ignored", () => {
    const from: DictationState = { status: "recording", attempt: 2, pending: 1 }
    const result = run([{ type: "transcribed", attempt: 1, text: "old" }], from)

    expect(result.state).toBe(from)
    expect(result.effects).toEqual([])
  })

  test("a microphone that opens after cancel is closed again", () => {
    const result = run([{ type: "toggle" }, { type: "cancel" }, { type: "started", attempt: 1 }])

    expect(result.state).toEqual({ status: "idle", attempt: 1 })
    expect(result.effects.at(-1)).toEqual({ type: "stop", attempt: 1, keep: false })
  })

  test("denied access and a failed segment end in an error that the next press clears", () => {
    expect(dictationView(run([{ type: "toggle" }, { type: "denied", attempt: 1 }]).state).error).toBe("microphone")

    const failed = run([{ type: "failed", attempt: 3 }], { status: "recording", attempt: 3, pending: 1 })
    expect(dictationView(failed.state).error).toBe("transcription")
    expect(failed.effects).toEqual([{ type: "stop", attempt: 3, keep: false }])

    expect(transitionDictation(failed.state, { type: "toggle" }).state).toEqual({ status: "starting", attempt: 4 })
  })

  test("a take without speech returns to idle without inserting", () => {
    const result = run([{ type: "closed", attempt: 1 }], {
      status: "transcribing",
      attempt: 1,
      pending: 0,
      closed: false,
    })

    expect(result.state).toEqual({ status: "idle", attempt: 1 })
    expect(result.effects).toEqual([])
  })

  test("dispose closes an open microphone", () => {
    expect(transitionDictation({ status: "recording", attempt: 2, pending: 0 }, { type: "disposed" }).effects).toEqual([
      { type: "stop", attempt: 2, keep: false },
    ])
    expect(transitionDictation(IDLE_DICTATION, { type: "disposed" }).state).toBe(IDLE_DICTATION)
  })

  test("the model download shows while starting and recording, until it completes", () => {
    const loading = run([{ type: "toggle" }, { type: "progress", attempt: 1, progress: 30 }])
    expect(dictationView(loading.state).loading).toBe(30)

    const recording = run([{ type: "started", attempt: 1 }], loading.state)
    expect(dictationView(recording.state)).toMatchObject({ recording: true, loading: 30 })

    expect(dictationView(run([{ type: "progress", attempt: 1, progress: 100 }], recording.state).state).loading).toBe(
      undefined,
    )
  })
})
