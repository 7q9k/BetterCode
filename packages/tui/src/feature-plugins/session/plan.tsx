import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js"
import { TodoItem } from "../../component/todo-item"
import { planInCurrentTurn, sessionTodos } from "../../util/todo"

/**
 * The agent's plan, pinned above the prompt: every step with its state while work is left, folded to its header once
 * every step is finished. A click on the header toggles it.
 */
export function SessionPlan(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const boundary = () => props.context.data.session.get(props.sessionID)?.revert?.messageID
  const messages = () => props.context.data.session.message.list(props.sessionID)
  const list = createMemo(() => sessionTodos(messages(), boundary()))
  const done = createMemo(() => list().filter((item) => item.status === "completed").length)
  const finished = createMemo(() => list().every((item) => item.status === "completed" || item.status === "cancelled"))
  const visible = createMemo(
    () =>
      list().length > 0 &&
      ((props.context.data.session.status(props.sessionID) === "running" && !finished()) ||
        planInCurrentTurn(messages(), boundary())),
  )
  // Undefined follows the plan; a click pins the user's choice until the plan's finished state changes again.
  const [pinned, setPinned] = createSignal<boolean>()
  const open = () => pinned() ?? !finished()
  createEffect(on(finished, () => setPinned(undefined), { defer: true }))

  const bar = () => {
    const width = 12
    const filled = Math.round((done() / Math.max(1, list().length)) * width)
    return { filled: "━".repeat(filled), empty: "━".repeat(width - filled) }
  }

  return (
    <Show when={visible()}>
      <box
        flexShrink={0}
        border={["left"]}
        borderColor={finished() ? theme.border.base : theme.text.action.primary.base}
        paddingLeft={1}
        marginBottom={1}
      >
        <box flexDirection="row" gap={1} onMouseDown={() => setPinned(!open())}>
          <text fg={theme.text.base}>
            <b>Plan</b>
          </text>
          <text fg={theme.text.muted}>
            {done()}/{list().length}
          </text>
          <text>
            <span style={{ fg: theme.text.feedback.success.base }}>{bar().filled}</span>
            <span style={{ fg: theme.border.base }}>{bar().empty}</span>
          </text>
          <text fg={theme.text.muted}>{open() ? "▼" : "▶"}</text>
        </box>
        <Show when={open()}>
          <For each={list()}>{(item) => <TodoItem theme={theme} todo={item} />}</For>
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.session.plan",
  setup(context) {
    context.ui.slot({
      append: "session.composer.top",
      render: (props) => <SessionPlan context={context} sessionID={props.sessionID} />,
    })
  },
})
