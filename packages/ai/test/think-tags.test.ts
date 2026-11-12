import { describe, expect, test } from "bun:test"
import {
  flushThinkTags,
  initialThinkTags,
  splitThinkTags,
  type ThinkTagPiece,
  type ThinkTagState,
} from "../src/protocols/utils/think-tags.js"

const stream = (chunks: string[]) => {
  const start: { state: ThinkTagState; pieces: ThinkTagPiece[] } = { state: initialThinkTags, pieces: [] }
  const result = chunks.reduce((current, chunk) => {
    const next = splitThinkTags(current.state, chunk)

    return { state: next.state, pieces: [...current.pieces, ...next.pieces] }
  }, start)
  const pieces = [...result.pieces, ...flushThinkTags(result.state)]

  return {
    reasoning: pieces.flatMap((piece) => (piece.kind === "reasoning" ? [piece.text] : [])).join(""),
    text: pieces.flatMap((piece) => (piece.kind === "text" ? [piece.text] : [])).join(""),
  }
}

describe("think tags", () => {
  test("splits a leading block from the answer, wherever the chunks break", () => {
    const whole = "  <think>plan the reply</think>\n\nHello there"

    // Every way of cutting the stream in two gives the same split.
    for (let cut = 0; cut <= whole.length; cut++)
      expect(stream([whole.slice(0, cut), whole.slice(cut)])).toEqual({
        reasoning: "plan the reply",
        text: "Hello there",
      })
  })

  test("streams a plain answer as text at once", () => {
    expect(splitThinkTags(initialThinkTags, "Hello")).toEqual({
      state: { mode: "text" },
      pieces: [{ kind: "text", text: "Hello" }],
    })
    expect(stream(["Use <think> here", "</think>"])).toEqual({ reasoning: "", text: "Use <think> here</think>" })
  })

  test("keeps an unfinished block as reasoning and a lone prefix as text when the stream ends", () => {
    expect(stream(["<think>still thinking"])).toEqual({ reasoning: "still thinking", text: "" })
    expect(stream(["<thi"])).toEqual({ reasoning: "", text: "<thi" })
  })
})
