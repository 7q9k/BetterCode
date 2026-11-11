// The composer's dictation: the microphone opens and records, the recording is cut into segments at the speaker's
// pauses, and each segment is transcribed while the user keeps talking, its text going into the prompt as soon as it
// is ready. Each press of the microphone starts a new attempt; results of an older attempt are ignored.

export type DictationError = "microphone" | "transcription"

export type DictationState =
  | { readonly status: "idle"; readonly attempt: number; readonly error?: DictationError }
  | { readonly status: "starting"; readonly attempt: number; readonly progress?: number }
  // `pending` counts segments sent for transcription whose text has not come back yet.
  | { readonly status: "recording"; readonly attempt: number; readonly pending: number; readonly progress?: number }
  // The microphone is closing (`closed` false) or closed; the last segments are still being transcribed.
  | {
      readonly status: "transcribing"
      readonly attempt: number
      readonly pending: number
      readonly closed: boolean
      readonly progress?: number
    }

export type DictationEvent =
  | { readonly type: "toggle" }
  | { readonly type: "cancel" }
  | { readonly type: "started"; readonly attempt: number }
  | { readonly type: "denied"; readonly attempt: number }
  // A stretch of speech, cut at a pause or when the microphone closed.
  | { readonly type: "segment"; readonly attempt: number; readonly audio: Float32Array }
  // The microphone closed and every segment of the take has been sent.
  | { readonly type: "closed"; readonly attempt: number }
  // The speech model's first download.
  | { readonly type: "progress"; readonly attempt: number; readonly progress: number }
  | { readonly type: "transcribed"; readonly attempt: number; readonly text: string }
  | { readonly type: "failed"; readonly attempt: number }
  | { readonly type: "disposed" }

export type DictationEffect =
  // Opens the microphone and starts loading the speech model, so it is ready by the first pause.
  | { readonly type: "start"; readonly attempt: number }
  // Closes the microphone; `keep` sends what is still buffered on as a last segment.
  | { readonly type: "stop"; readonly attempt: number; readonly keep: boolean }
  | { readonly type: "transcribe"; readonly attempt: number; readonly audio: Float32Array }
  | { readonly type: "insert"; readonly text: string }

export type DictationTransition = { readonly state: DictationState; readonly effects: readonly DictationEffect[] }

export const IDLE_DICTATION: DictationState = Object.freeze({ status: "idle", attempt: 0 })

export function transitionDictation(state: DictationState, event: DictationEvent): DictationTransition {
  const same = { state, effects: [] }

  if (event.type === "disposed" || event.type === "cancel") {
    if (state.status === "idle") return same

    const open = state.status === "starting" || state.status === "recording" || !state.closed

    return {
      state: { status: "idle", attempt: state.attempt },
      effects: open ? [{ type: "stop", attempt: state.attempt, keep: false }] : [],
    }
  }

  if (event.type === "toggle") {
    if (state.status === "idle") {
      const attempt = state.attempt + 1

      return { state: { status: "starting", attempt }, effects: [{ type: "start", attempt }] }
    }

    if (state.status === "recording")
      return {
        state: {
          status: "transcribing",
          attempt: state.attempt,
          pending: state.pending,
          closed: false,
          progress: state.progress,
        },
        effects: [{ type: "stop", attempt: state.attempt, keep: true }],
      }

    return same
  }

  // The microphone opened for an attempt that was cancelled meanwhile: close it again.
  if (event.type === "started" && !(state.status === "starting" && state.attempt === event.attempt))
    return { state, effects: [{ type: "stop", attempt: event.attempt, keep: false }] }

  if (event.attempt !== state.attempt || state.status === "idle") return same

  if (event.type === "progress") {
    if (state.progress === event.progress) return same

    return { state: { ...state, progress: event.progress }, effects: [] }
  }

  if (state.status === "starting") {
    if (event.type === "started")
      return {
        state: { status: "recording", attempt: state.attempt, pending: 0, progress: state.progress },
        effects: [],
      }

    if (event.type === "denied")
      return { state: { status: "idle", attempt: state.attempt, error: "microphone" }, effects: [] }

    return same
  }

  if (event.type === "failed")
    return {
      state: { status: "idle", attempt: state.attempt, error: "transcription" },
      effects:
        state.status === "recording" || !state.closed ? [{ type: "stop", attempt: state.attempt, keep: false }] : [],
    }

  if (event.type === "segment") {
    if (state.status === "transcribing" && state.closed) return same

    return {
      state: { ...state, pending: state.pending + 1 },
      effects: [{ type: "transcribe", attempt: state.attempt, audio: event.audio }],
    }
  }

  if (event.type === "transcribed") {
    const pending = Math.max(0, state.pending - 1)
    const effects: DictationEffect[] = event.text ? [{ type: "insert", text: event.text }] : []

    if (state.status === "transcribing" && state.closed && pending === 0)
      return { state: { status: "idle", attempt: state.attempt }, effects }

    return { state: { ...state, pending }, effects }
  }

  if (event.type === "closed" && state.status === "transcribing") {
    if (state.pending === 0) return { state: { status: "idle", attempt: state.attempt }, effects: [] }

    return { state: { ...state, closed: true }, effects: [] }
  }

  return same
}

/** What the microphone button shows for a state. */
export function dictationView(state: DictationState) {
  const progress = state.status === "idle" ? undefined : state.progress

  return {
    recording: state.status === "recording",
    busy: state.status === "starting" || state.status === "transcribing",
    // Text is still on its way: the last segments after the microphone closed, or any while it records.
    transcribing: state.status === "transcribing" || (state.status === "recording" && state.pending > 0),
    // The speech model's first download, until it is complete.
    loading: progress !== undefined && progress < 100 ? progress : undefined,
    error: state.status === "idle" ? state.error : undefined,
  }
}
