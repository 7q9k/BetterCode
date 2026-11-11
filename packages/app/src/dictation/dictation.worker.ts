import { pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from "@huggingface/transformers"
import type { DictationReply, DictationRequest } from "./dictation"

// Whisper base, quantized: about 80 MB, downloaded on first use and then served from the browser cache. It runs on the
// CPU, so dictation needs no API key and the recording never leaves the machine.
const MODEL = "onnx-community/whisper-base"

// One pipeline for the worker's life; a failed load is dropped so the next dictation tries again. `request` is the
// dictation the load reports its download progress to.
let loading: Promise<AutomaticSpeechRecognitionPipeline> | undefined

let request = 0

const post = (reply: DictationReply) => self.postMessage(reply)

const load = () => {
  loading ??= pipeline("automatic-speech-recognition", MODEL, {
    device: "wasm",
    dtype: "q8",
    progress_callback: (info: ProgressInfo) => {
      if (info.status === "progress_total") post({ type: "progress", id: request, progress: info.progress })
    },
  }).catch((cause: unknown) => {
    loading = undefined
    throw cause
  })

  return loading
}

self.addEventListener("message", (event: MessageEvent<DictationRequest>) => {
  const message = event.data
  request = message.id

  load()
    .then((recognizer) => recognizer(message.audio, { chunk_length_s: 30, stride_length_s: 5 }))
    .then((output) => {
      const text = (Array.isArray(output) ? output : [output]).map((part) => part.text).join(" ")
      post({ type: "result", id: message.id, text: text.replace(/\s+/g, " ").trim() })
    })
    .catch((cause: unknown) =>
      post({ type: "error", id: message.id, message: cause instanceof Error ? cause.message : String(cause) }),
    )
})
