import { createSignal, onCleanup } from "solid-js"
import {
  dictationView,
  IDLE_DICTATION,
  transitionDictation,
  type DictationEffect,
  type DictationEvent,
} from "./machine"

export type DictationRequest = { id: number; audio: Float32Array }

export type DictationReply =
  | { type: "progress"; id: number; progress: number }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id: number; message: string }

// Whisper hears 16 kHz mono.
const SAMPLE_RATE = 16_000

// Shorter takes are almost always a stray click, and Whisper invents words for silence.
const MIN_SECONDS = 0.4

/**
 * The driver for composer dictation (see `machine.ts`). It opens the microphone, records, decodes the take to 16 kHz
 * and hands it to a worker that runs Whisper locally; the text goes to `onText`.
 */
export function createDictation(input: { requestMicrophone?: () => Promise<boolean>; onText: (text: string) => void }) {
  const [state, setState] = createSignal(IDLE_DICTATION)
  // The input level, smoothed, for the button's pulse. Kept apart from the machine: it changes every frame.
  const [level, setLevel] = createSignal(0)
  // The open microphone of the current attempt; set only while it records.
  const microphone = { stop: (_keep: boolean) => {} }

  const dispatch = (event: DictationEvent) => {
    const next = transitionDictation(state(), event)

    if (next.state !== state()) setState(next.state)
    next.effects.forEach(run)
  }

  const run = (effect: DictationEffect) => {
    if (effect.type === "start") return void open(effect.attempt)

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

    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    const meter = new AudioContext()
    const analyser = meter.createAnalyser()
    analyser.fftSize = 512
    meter.createMediaStreamSource(stream).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    let frame = 0
    let keep = false

    const measure = () => {
      analyser.getFloatTimeDomainData(samples)
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
      setLevel((previous) => previous * 0.6 + Math.min(1, rms * 6) * 0.4)
      frame = requestAnimationFrame(measure)
    }

    recorder.addEventListener("dataavailable", (event) => chunks.push(event.data))
    recorder.addEventListener("stop", () => {
      cancelAnimationFrame(frame)
      stream.getTracks().forEach((track) => track.stop())
      void meter.close()
      setLevel(0)

      if (keep)
        void decode(new Blob(chunks, { type: recorder.mimeType })).then((audio) =>
          dispatch({ type: "recorded", attempt, audio }),
        )
    })

    microphone.stop = (value) => {
      microphone.stop = () => {}

      keep = value
      recorder.stop()
    }

    recorder.start()
    measure()
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

async function decode(blob: Blob) {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })

  const audio = await blob
    .arrayBuffer()
    .then((buffer) => context.decodeAudioData(buffer))
    .catch(() => undefined)

  void context.close()

  if (!audio || audio.duration < MIN_SECONDS) return undefined

  return audio.getChannelData(0).slice()
}

// One worker for the app's life, shared by every composer, started on the first dictation so the model and runtime
// load only when used. Requests carry their own id, since each composer counts its attempts from one.
type Recognizer = { worker?: Worker; requests: number }

const recognizer: Recognizer = { requests: 0 }

function recognize(audio: Float32Array, onProgress: (progress: number) => void) {
  const worker = (recognizer.worker ??= new Worker(new URL("./dictation.worker.ts", import.meta.url), {
    type: "module",
  }))

  const request: DictationRequest = { id: ++recognizer.requests, audio }

  return new Promise<Exclude<DictationReply, { type: "progress" }>>((resolve) => {
    const finish = (reply: Exclude<DictationReply, { type: "progress" }>) => {
      worker.removeEventListener("message", listen)
      worker.removeEventListener("error", crash)
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
      if (recognizer.worker === worker) recognizer.worker = undefined
      worker.terminate()
      finish({ type: "error", id: request.id, message: event.message })
    }

    worker.addEventListener("message", listen)
    worker.addEventListener("error", crash)
    worker.postMessage(request, [request.audio.buffer])
  })
}
