// Cuts live microphone audio into segments at the speaker's pauses, so each one can be transcribed while the user
// keeps talking. Audio arrives at 16 kHz in small chunks; the segmenter tracks the noise floor to tell speech from
// silence and drops stretches without speech, which Whisper would otherwise fill with invented words.

export const SAMPLE_RATE = 16_000

const seconds = (value: number) => Math.round(value * SAMPLE_RATE)

// A segment needs this much audio before a pause may end it, and this much speech to be worth transcribing.
const MIN_SEGMENT = seconds(1.2)

const MIN_SPEECH = seconds(0.3)

// A pause this long ends a segment.
const PAUSE = seconds(0.5)

// A segment is cut here even without a pause; Whisper hears 30 seconds at most.
const MAX_SEGMENT = seconds(25)

// Silence before speech is kept only this long, so the first syllable is not clipped.
const LEAD_IN = seconds(0.4)

// Too little speech followed by this much silence was a click or a cough, not the start of a sentence: it is
// forgotten, so the silence after it is trimmed again instead of piling up in front of the next sentence.
const FORGET = seconds(1)

export type SegmenterState = {
  chunks: Float32Array[]
  length: number
  speech: number
  silence: number
  floor: number
}

export function createSegmenter(): SegmenterState {
  return { chunks: [], length: 0, speech: 0, silence: 0, floor: 0.01 }
}

/** Adds a chunk; returns a finished segment when this chunk ended one, and the chunk's level from 0 to 1. */
export function feedSegmenter(state: SegmenterState, chunk: Float32Array) {
  const rms = Math.sqrt(chunk.reduce((sum, value) => sum + value * value, 0) / Math.max(1, chunk.length))
  // The floor follows quiet stretches at once and loud ones only slowly, so speech does not raise it.
  state.floor = rms < state.floor ? rms : state.floor * 0.9995 + rms * 0.0005

  const speaking = rms > Math.max(0.012, state.floor * 3)

  state.chunks.push(chunk)
  state.length += chunk.length
  state.speech += speaking ? chunk.length : 0
  state.silence = speaking ? 0 : state.silence + chunk.length

  const level = Math.min(1, rms * 6)

  if (state.speech < MIN_SPEECH && state.silence >= FORGET) state.speech = 0

  if (state.speech === 0 && state.length > LEAD_IN) trimLeadIn(state)

  const paused = state.length >= MIN_SEGMENT && state.silence >= PAUSE && state.speech >= MIN_SPEECH

  if (!paused && state.length < MAX_SEGMENT) return { level, segment: undefined }

  return { level, segment: take(state) }
}

/** Ends the take: the buffered audio as a last segment, when it holds enough speech. */
export function flushSegmenter(state: SegmenterState) {
  if (state.speech < MIN_SPEECH) return undefined

  return take(state)
}

function take(state: SegmenterState) {
  const segment = state.speech >= MIN_SPEECH ? join(state.chunks, state.length) : undefined
  state.chunks = []
  state.length = 0
  state.speech = 0
  state.silence = 0

  return segment
}

// Drops the oldest silent chunks, keeping the lead-in.
function trimLeadIn(state: SegmenterState) {
  while (state.chunks.length > 1 && state.length - (state.chunks[0]?.length ?? 0) >= LEAD_IN) {
    state.length -= state.chunks.shift()?.length ?? 0
  }

  state.silence = state.length
}

function join(chunks: Float32Array[], length: number) {
  const audio = new Float32Array(length)

  chunks.reduce((offset, chunk) => {
    audio.set(chunk, offset)

    return offset + chunk.length
  }, 0)

  return audio
}
