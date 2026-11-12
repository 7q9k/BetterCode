// Local reasoning models (Qwen3, DeepSeek-R1, QwQ and others behind Ollama, LM Studio or llama.cpp) often stream their
// thinking inside the ordinary content as `<think>...</think>` before the answer, instead of in a reasoning field.
// This splits such a stream into reasoning and text as it arrives. A tag split across chunks is held back until it is
// complete, and only a block that opens the response counts, so an answer that merely mentions `<think>` stays text.

const OPEN = "<think>"

const CLOSE = "</think>"

export type ThinkTagState =
  /** Nothing visible yet: the content is whitespace or could still be the start of `<think>`. */
  | { readonly mode: "detect"; readonly pending: string }
  /** Inside the thinking block; `pending` holds a tail that could be the start of `</think>`. */
  | { readonly mode: "reasoning"; readonly pending: string }
  /** Just past `</think>`: the blank lines models put before the answer are layout, not part of it. */
  | { readonly mode: "answer" }
  /** The answer itself: everything passes through as text. */
  | { readonly mode: "text" }

export type ThinkTagPiece = { readonly kind: "reasoning" | "text"; readonly text: string }

export type ThinkTagSplit = { readonly state: ThinkTagState; readonly pieces: readonly ThinkTagPiece[] }

export const initialThinkTags: ThinkTagState = { mode: "detect", pending: "" }

/** Splits one content chunk into the reasoning and text it carries. */
export function splitThinkTags(state: ThinkTagState, chunk: string): ThinkTagSplit {
  if (state.mode === "text") return { state, pieces: piece("text", chunk) }

  if (state.mode === "reasoning") return insideThinking(state.pending + chunk)

  if (state.mode === "answer") return answerStart(chunk)
  const buffer = state.pending + chunk
  const visible = buffer.trimStart()

  if (visible.startsWith(OPEN)) return insideThinking(visible.slice(OPEN.length))

  if (OPEN.startsWith(visible)) return { state: { mode: "detect", pending: buffer }, pieces: [] }

  return { state: { mode: "text" }, pieces: piece("text", buffer) }
}

/** What a stream that ended mid-tag still holds: an unfinished block stays reasoning, anything else text. */
export function flushThinkTags(state: ThinkTagState): readonly ThinkTagPiece[] {
  if (state.mode === "reasoning") return piece("reasoning", state.pending)

  if (state.mode === "detect") return piece("text", state.pending)

  return []
}

function insideThinking(buffer: string): ThinkTagSplit {
  const close = buffer.indexOf(CLOSE)

  if (close >= 0) {
    const answer = answerStart(buffer.slice(close + CLOSE.length))

    return { state: answer.state, pieces: [...piece("reasoning", buffer.slice(0, close)), ...answer.pieces] }
  }

  const held = partialClose(buffer)

  return {
    state: { mode: "reasoning", pending: buffer.slice(buffer.length - held) },
    pieces: piece("reasoning", buffer.slice(0, buffer.length - held)),
  }
}

// Skips the whitespace between the block and the answer, across chunks, then passes the answer through.
function answerStart(chunk: string): ThinkTagSplit {
  const answer = chunk.replace(/^\s+/, "")

  if (!answer) return { state: { mode: "answer" }, pieces: [] }

  return { state: { mode: "text" }, pieces: piece("text", answer) }
}

// The length of the longest tail of `buffer` that `</think>` starts with, held back until the next chunk decides it.
function partialClose(buffer: string) {
  const longest = Math.min(CLOSE.length - 1, buffer.length)

  return (
    Array.from({ length: longest }, (_, index) => longest - index).find((size) =>
      CLOSE.startsWith(buffer.slice(buffer.length - size)),
    ) ?? 0
  )
}

function piece(kind: ThinkTagPiece["kind"], text: string): ThinkTagPiece[] {
  return text ? [{ kind, text }] : []
}
