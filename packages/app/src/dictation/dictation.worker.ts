import { pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from "@huggingface/transformers"
import type { DictationReply, DictationRequest } from "./dictation"

// On the GPU: Whisper large-v3 turbo, 4-bit, about 760 MB, downloaded once and then served from the browser cache. It
// understands German and every other common language well, and runs fast through WebGPU. On the CPU it would take many
// seconds per sentence, so without WebGPU dictation falls back to the small base model.
const GPU = {
  model: "onnx-community/whisper-large-v3-turbo",
  options: { device: "webgpu", dtype: { encoder_model: "q4", decoder_model_merged: "q4" } },
} as const

const CPU = { model: "onnx-community/whisper-base", options: { device: "wasm", dtype: "q8" } } as const

// What Whisper says for a segment of noise or breathing, learned from subtitled video. A segment that is only one of
// these is dropped.
const HALLUCINATION =
  /^(untertitel(ung)?\b.*|.*\bzdf\b.*|vielen dank (fürs|für's|für das) zuschauen\.?|thanks? (you )?for watching\.?|thank you\.?|you|\.+|…)$/i

// One pipeline for the worker's life; a failed load is dropped so the next dictation tries again. `request` is the
// dictation the load reports its download progress to.
let loading: Promise<AutomaticSpeechRecognitionPipeline> | undefined

let request = 0

// Segments are transcribed one after another, in the order they were spoken.
let queue = Promise.resolve()

// The last whole percent reported; the download reports every few kilobytes, the page needs only whole steps.
let reported = -1

const post = (reply: DictationReply) => self.postMessage(reply)

const progress_callback = (info: ProgressInfo) => {
  if (info.status !== "progress_total" || Math.floor(info.progress) === reported) return

  reported = Math.floor(info.progress)
  post({ type: "progress", id: request, progress: reported })
}

const gpu = async () => !!(await navigator.gpu?.requestAdapter().catch(() => null))

const load = () => {
  loading ??= gpu()
    .then((available) =>
      available
        ? pipeline("automatic-speech-recognition", GPU.model, { ...GPU.options, progress_callback })
        : pipeline("automatic-speech-recognition", CPU.model, { ...CPU.options, progress_callback }),
    )
    .then((recognizer) => {
      // A cached model may never report the last percent; once it is ready, the download is done.
      if (reported < 100) post({ type: "progress", id: request, progress: 100 })

      reported = 100

      return recognizer
    })
    .catch((cause: unknown) => {
      loading = undefined
      throw cause
    })

  return loading
}

self.addEventListener("message", (event: MessageEvent<DictationRequest>) => {
  const message = event.data
  request = message.id

  // Recording started: load the model now, so it is ready by the first pause.
  if (message.type === "warm") return void load().catch(() => undefined)

  queue = queue.then(() =>
    load()
      .then((recognizer) => recognizer(message.audio, { chunk_length_s: 30, task: "transcribe" }))
      .then((output) => {
        const text = (Array.isArray(output) ? output : [output])
          .map((part) => part.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()

        post({ type: "result", id: message.id, text: HALLUCINATION.test(text) ? "" : text })
      })
      .catch((cause: unknown) =>
        post({ type: "error", id: message.id, message: cause instanceof Error ? cause.message : String(cause) }),
      ),
  )
})
