import type { SessionMessageInfo } from "@opencode/client/promise"
import type { SessionDocument } from "@opencode/session-ui/document"
import { CURRENT_SESSION_ID, STORY_MODEL, STORY_TIME } from "@opencode/session-ui/storybook"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import { createMemo, onMount } from "solid-js"
import { SessionPreview } from "@/session/story-model"
import { sessionTodos, type Todo } from "./todos"

const timelineDetail = timelinePresets[2].value

const plan = [
  "Read the cart store and checkout API",
  "Add a saved_carts table and migration",
  "Save and restore carts in the cart store",
  "Show saved carts on the account page",
  "Write tests for saving and restoring",
  "Run typecheck and the test suite",
]

// `progress` steps are done, the next one is in progress and the rest are pending.
const todosAt = (progress: number): Todo[] =>
  plan.map((content, index) => ({
    content,
    status: index < progress ? "completed" : index === progress ? "in_progress" : "pending",
  }))

function document(todos: Todo[]): SessionDocument {
  const messages: SessionMessageInfo[] = [
    {
      id: "msg_user_carts",
      type: "user",
      text: "Let signed-in customers save their cart and pick it up on another device.",
      time: { created: STORY_TIME },
      metadata: { agent: "build", model: STORY_MODEL },
    },
    {
      id: "msg_assistant_carts",
      type: "assistant",
      agent: "build",
      model: STORY_MODEL,
      content: [
        { type: "text", text: "I'll add saved carts in six steps and keep the plan below up to date as I go." },
        {
          type: "tool",
          id: "tool_todowrite",
          name: "todowrite",
          state: {
            status: "completed",
            input: { todos },
            content: [{ type: "text", text: "Todos updated" }],
            metadata: { todos },
          },
          time: { created: STORY_TIME + 1_000, ran: STORY_TIME + 1_100 },
        },
        {
          type: "text",
          text: "The `saved_carts` table and its migration are in place. Next I'm wiring `saveCart` and `restoreCart` into `src/stores/cart.ts`.",
        },
      ],
      time: { created: STORY_TIME + 500 },
    },
  ]

  return { sessionID: CURRENT_SESSION_ID, messages, status: { type: "busy" }, diffs: [] }
}

function Preview(props: { progress: number }) {
  const value = createMemo(() => document(todosAt(props.progress)))

  onMount(() =>
    setTimeout(() => {
      const timeline = window.document.querySelector('[data-slot="story-timeline"]')
      timeline?.scrollTo({ top: timeline.scrollHeight })
    }, 150),
  )

  return (
    <SessionPreview
      title="Add saved carts"
      description="acme-store · main"
      document={value()}
      timelineDetail={timelineDetail}
      todos={{ items: sessionTodos(value().messages) }}
    />
  )
}

export default {
  title: "OpenCode/Session/Plan list",
  id: "session-plan-list",
  render: (args: { progress: number }) => <Preview {...args} />,
  args: { progress: 2 },
  argTypes: { progress: { control: { type: "range", min: 0, max: 6, step: 1 } } },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "The agent's plan pinned above the composer while it works through the steps.",
      },
    },
  },
}

export const InProgress = {}

export const Finished = { args: { progress: 6 } }
