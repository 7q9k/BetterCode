/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { Context } from "@opencode/plugin/tui/context"
import { SessionPlan } from "../../src/feature-plugins/session/plan"

type Step = { content: string; status: "pending" | "in_progress" | "completed" | "cancelled" }

function plan(todos: Step[]) {
  return {
    id: "plan",
    type: "assistant",
    content: [
      { type: "tool", name: "todowrite", state: { status: "completed", input: { todos } } },
    ],
  }
}

function context(input: { messages: unknown[]; status?: "idle" | "running" }) {
  const color = RGBA.fromInts(200, 200, 200)
  return {
    theme: {
      text: {
        base: color,
        muted: color,
        faint: color,
        action: { primary: { base: color } },
        feedback: { warning: { base: color }, success: { base: color } },
      },
      border: { base: color },
    },
    data: {
      session: {
        get: () => ({}),
        status: () => input.status ?? "idle",
        message: { list: () => input.messages },
      },
    },
  } as unknown as Context
}

const steps: Step[] = [
  { content: "Read the code", status: "completed" },
  { content: "Change the updater", status: "in_progress" },
  { content: "Run the tests", status: "pending" },
]

async function render(ctx: Context) {
  const app = await testRender(() => <SessionPlan context={ctx} sessionID="session" />, { width: 60, height: 10 })
  await app.renderOnce()
  return app
}

test("shows every step of the current turn's plan with its progress", async () => {
  const app = await render(context({ messages: [{ id: "user", type: "user" }, plan(steps)], status: "running" }))

  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("Plan")
    expect(frame).toContain("1/3")
    expect(frame).toContain("[✓] Read the code")
    expect(frame).toContain("[•] Change the updater")
    expect(frame).toContain("[ ] Run the tests")
  } finally {
    app.renderer.destroy()
  }
})

test("folds a finished plan to its header", async () => {
  const done = steps.map((step) => ({ ...step, status: "completed" as const }))
  const app = await render(context({ messages: [{ id: "user", type: "user" }, plan(done)] }))

  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("3/3")
    expect(frame).not.toContain("Run the tests")
  } finally {
    app.renderer.destroy()
  }
})

test("hides a plan from an earlier turn once the user prompts again", async () => {
  const app = await render(context({ messages: [plan(steps), { id: "user", type: "user" }] }))

  try {
    expect(app.captureCharFrame()).not.toContain("Plan")
  } finally {
    app.renderer.destroy()
  }
})
