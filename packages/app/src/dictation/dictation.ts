import { createSignal, onCleanup } from "solid-js"
import {
  dictationView,
  IDLE_DICTATION,
  transitionDictation,
  type DictationEffect,
  type DictationEvent,
} from "./machine"
import { createSegmenter, feedSegmenter, flushSegmenter, SAMPLE_RATE } from "./segmenter"

export type DictationRequest = { type: "warm"; id: number } | { type: "transcribe"; id: number; audio: Float32Array }

export type DictationReply =
  | { type: "progress"; id: number; progress: number }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id: number; message: string }

// Hands each block of microphone samples to the page; the block size is the audio graph's (128 samples).
const TAP = `registerProcessor("dictation-tap", class extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel) this.port.postMessage(channel.slice())
    return true
  }
})`

/**
 * The driver for composer dictation (see `machine.ts`). It opens the microphone at 16 kHz, cuts the speech into
 * segments at pauses (see `segmenter.ts`) and hands each to a worker that runs Whisper locally; each segment's text
 * goes to `onText` as soon as it is ready.
 */
export function createDictation(input: { requestMicrophone?: () => Promise<boolean>; onText: (text: string) => void }) {
  const [state, setState] = createSignal(IDLE_DICTATION)
  // The input level, smoothed, for the button's pulse. Kept apart from the machine: it changes every few milliseconds.
  const [level, setLevel] = createSignal(0)
  // The open microphone of the current attempt; set only while it records.
  const microphone = { stop: (_keep: boolean) => {} }

  const dispatch = (event: DictationEvent) => {
    const next = transitionDictation(state(), event)

    if (next.state !== state()) setState(next.state)
    next.effects.forEach(run)
  }

  const run = (effect: DictationEffect) => {
    if (effect.type === "start") {
      warm((progress) => dispatch({ type: "progress", attempt: effect.attempt, progress }))

      return void open(effect.attempt)
    }

    if (effect.type === "stop") return microphone.stop(effect.keep)

    if (effect.type === "transcribe")
      return void recognize(effect.audio, (progress) =>
        dispatch({ type: "progress", attempt: effect.attempt, progress }),
      ).then((reply) =>
        dispatch(
          reply.type === "result"
            ? { type: "transcribed", attempt: effect.attempt, text: reply.text }
            : { type: "failed", attempt: effect.attempt },
        ),
      )

    input.onText(effect.text)
  }

  const open = async (attempt: number) => {
    const allowed = input.requestMicrophone ? await input.requestMicrophone().catch(() => false) : true

    const stream = allowed
      ? await navigator.mediaDevices
          .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
          .catch(() => undefined)
      : undefined

    if (!stream) return dispatch({ type: "denied", attempt })

    // The context resamples the microphone to the 16 kHz Whisper hears.
    const context = new AudioContext({ sampleRate: SAMPLE_RATE })
    const module = URL.createObjectURL(new Blob([TAP], { type: "text/javascript" }))

    const tap = await context.audioWorklet
      .addModule(module)
      .then(() => new AudioWorkletNode(context, "dictation-tap"))
      .catch(() => undefined)

    URL.revokeObjectURL(module)

    if (!tap) {
      stream.getTracks().forEach((track) => track.stop())
      void context.close()

      return dispatch({ type: "denied", attempt })
    }

    const segmenter = createSegmenter()

    tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const result = feedSegmenter(segmenter, event.data)
      setLevel((previous) => previous * 0.7 + result.level * 0.3)

      if (result.segment) dispatch({ type: "segment", attempt, audio: result.segment })
    }

    context.createMediaStreamSource(stream).connect(tap)

    microphone.stop = (keep) => {
      microphone.stop = () => {}

      tap.port.onmessage = null
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
      setLevel(0)

      if (!keep) return

      const last = flushSegmenter(segmenter)

      if (last) dispatch({ type: "segment", attempt, audio: last })
      dispatch({ type: "closed", attempt })
    }

    dispatch({ type: "started", attempt })
  }

  onCleanup(() => dispatch({ type: "disposed" }))

  return {
    view: () => dictationView(state()),
    level,
    toggle: () => dispatch({ type: "toggle" }),
    cancel: () => dispatch({ type: "cancel" }),
  }
}

// One worker for the app's life, shared by every composer, started on the first dictation so the model and runtime
// load only when used. Requests carry their own id, since each composer counts its attempts from one.
type Recognizer = { worker?: Worker; requests: number }

const recognizer: Recognizer = { requests: 0 }

function worker() {
  recognizer.worker ??= new Worker(new URL("./dictation.worker.ts", import.meta.url), { type: "module" })

  return recognizer.worker
}

// Loads the model ahead of the first segment, reporting the first download's progress.
function warm(onProgress: (progress: number) => void) {
  const target = worker()
  const id = ++recognizer.requests

  const listen = (event: MessageEvent<DictationReply>) => {
    if (event.data.id !== id || event.data.type !== "progress") return

    onProgress(event.data.progress)

    if (event.data.progress >= 100) target.removeEventListener("message", listen)
  }

  target.addEventListener("message", listen)
  target.postMessage({ type: "warm", id } satisfies DictationRequest)
}

function recognize(audio: Float32Array, onProgress: (progress: number) => void) {
  const target = worker()
  const request = { type: "transcribe", id: ++recognizer.requests, audio } satisfies DictationRequest

  return new Promise<Exclude<DictationReply, { type: "progress" }>>((resolve) => {
    const finish = (reply: Exclude<DictationReply, { type: "progress" }>) => {
      target.removeEventListener("message", listen)
      target.removeEventListener("error", crash)
      resolve(reply)
    }

    const listen = (event: MessageEvent<DictationReply>) => {
      const reply = event.data

      if (reply.id !== request.id) return

      if (reply.type === "progress") return onProgress(reply.progress)
      finish(reply)
    }

    // A worker that fails to load or crashes would otherwise leave the composer transcribing forever.
    const crash = (event: ErrorEvent) => {
      if (recognizer.worker === target) recognizer.worker = undefined
      target.terminate()
      finish({ type: "error", id: request.id, message: event.message })
    }

    target.addEventListener("message", listen)
    target.addEventListener("error", crash)
    target.postMessage(request, [request.audio.buffer])
  })
}
