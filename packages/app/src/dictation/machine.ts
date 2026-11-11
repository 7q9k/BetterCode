// The composer's dictation: the microphone opens, records a take, and the take is transcribed into the prompt. Each
// press of the microphone starts a new attempt; results of an older attempt are ignored.

export type DictationError = "microphone" | "transcription"

export type DictationState =
  | { readonly status: "idle"; readonly attempt: number; readonly error?: DictationError }
  | { readonly status: "starting"; readonly attempt: number }
  | { readonly status: "recording"; readonly attempt: number }
  | { readonly status: "transcribing"; readonly attempt: number; readonly progress?: number }

export type DictationEvent =
  | { readonly type: "toggle" }
  | { readonly type: "cancel" }
  | { readonly type: "started"; readonly attempt: number }
  | { readonly type: "denied"; readonly attempt: number }
  // `audio` is missing when the take was too short or could not be decoded.
  | { readonly type: "recorded"; readonly attempt: number; readonly audio?: Float32Array }
  | { readonly type: "progress"; readonly attempt: number; readonly progress: number }
  | { readonly type: "transcribed"; readonly attempt: number; readonly text: string }
  | { readonly type: "failed"; readonly attempt: number }
  | { readonly type: "disposed" }

export type DictationEffect =
  | { readonly type: "start"; readonly attempt: number }
  // Closes the microphone; `keep` sends what was recorded on to transcription.
  | { readonly type: "stop"; readonly attempt: number; readonly keep: boolean }
  | { readonly type: "transcribe"; readonly attempt: number; readonly audio: Float32Array }
  | { readonly type: "insert"; readonly text: string }

export type DictationTransition = { readonly state: DictationState; readonly effects: readonly DictationEffect[] }

export const IDLE_DICTATION: DictationState = Object.freeze({ status: "idle", attempt: 0 })

export function transitionDictation(state: DictationState, event: DictationEvent): DictationTransition {
  const same = { state, effects: [] }

  if (event.type === "disposed") {
    if (state.status === "idle") return same

    return {
      state: { status: "idle", attempt: state.attempt },
      effects: state.status === "transcribing" ? [] : [{ type: "stop", attempt: state.attempt, keep: false }],
    }
  }

  if (event.type === "toggle") {
    if (state.status === "idle") {
      const attempt = state.attempt + 1

      return { state: { status: "starting", attempt }, effects: [{ type: "start", attempt }] }
    }

    if (state.status === "recording")
      return {
        state: { status: "transcribing", attempt: state.attempt },
        effects: [{ type: "stop", attempt: state.attempt, keep: true }],
      }

    return same
  }

  if (event.type === "cancel") {
    if (state.status === "idle") return same

    return {
      state: { status: "idle", attempt: state.attempt },
      effects: state.status === "transcribing" ? [] : [{ type: "stop", attempt: state.attempt, keep: false }],
    }
  }

  // The microphone opened for an attempt that was cancelled meanwhile: close it again.
  if (event.type === "started" && !(state.status === "starting" && state.attempt === event.attempt))
    return { state, effects: [{ type: "stop", attempt: event.attempt, keep: false }] }

  if (event.attempt !== state.attempt) return same

  if (state.status === "starting") {
    if (event.type === "started") return { state: { status: "recording", attempt: state.attempt }, effects: [] }

    if (event.type === "denied")
      return { state: { status: "idle", attempt: state.attempt, error: "microphone" }, effects: [] }

    return same
  }

  if (state.status !== "transcribing") return same

  if (event.type === "recorded") {
    if (!event.audio) return { state: { status: "idle", attempt: state.attempt }, effects: [] }

    return { state, effects: [{ type: "transcribe", attempt: state.attempt, audio: event.audio }] }
  }

  if (event.type === "progress") {
    if (state.progress === event.progress) return same

    return { state: { ...state, progress: event.progress }, effects: [] }
  }

  if (event.type === "transcribed")
    return {
      state: { status: "idle", attempt: state.attempt },
      effects: event.text ? [{ type: "insert", text: event.text }] : [],
    }

  if (event.type === "failed")
    return { state: { status: "idle", attempt: state.attempt, error: "transcription" }, effects: [] }

  return same
}

/** What the microphone button shows for a state. */
export function dictationView(state: DictationState) {
  return {
    recording: state.status === "recording",
    busy: state.status === "starting" || state.status === "transcribing",
    transcribing: state.status === "transcribing",
    // The speech model's first download, until it is complete.
    loading:
      state.status === "transcribing" && state.progress !== undefined && state.progress < 100
        ? state.progress
        : undefined,
    error: state.status === "idle" ? state.error : undefined,
  }
}
