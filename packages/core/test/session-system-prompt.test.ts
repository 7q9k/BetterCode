import { expect, test } from "bun:test"
import { SessionSystemPrompt } from "@opencode/core/session/system-prompt"

test("renders the default system prompt instructions", () => {
  const prompt = SessionSystemPrompt.make(["edit", "read", "shell"])
  expect(prompt).not.toContain("${OPENCODE_TOOL_GUIDANCE}")
  expect(prompt).toContain("Use the edit tool for targeted changes to existing text files")
  expect(prompt).not.toContain("todowrite")
})

test("asks for the plan first when todowrite is available", () => {
  expect(SessionSystemPrompt.make(["edit", "todowrite"])).toContain(
    "call todowrite with the whole plan before your first other tool call",
  )
})
