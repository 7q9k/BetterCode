import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { Grow } from "./spring-height"
import { TodoGlyph } from "./todo-pill"
import { todoFinished, type Todo } from "./todos"
import "./plan-list.css"

/**
 * The agent's plan, pinned above the composer under the latest answer: every step with its state, the step in hand
 * highlighted. It folds to its header once every step is finished; the header toggles it either way.
 */
export function SessionPlanList(props: { todos: readonly Todo[] }) {
  const language = useLanguage()
  const done = createMemo(() => props.todos.filter((todo) => todo.status === "completed").length)
  const finished = createMemo(() => props.todos.every(todoFinished))
  // Undefined follows the plan: open while work is left, folded once it is done. A click pins the user's choice
  // until the plan's finished state changes again.
  const [pinned, setPinned] = createSignal<boolean>()
  const open = () => pinned() ?? !finished()
  let list: HTMLDivElement | undefined

  createEffect(on(finished, () => setPinned(undefined), { defer: true }))

  // Keep the step in progress in view as the plan advances.
  createEffect(
    on(
      () => props.todos.findIndex((todo) => todo.status === "in_progress"),
      (index) => {
        if (index < 0 || !list) return
        list.querySelectorAll('[data-slot="session-plan-row"]')[index]?.scrollIntoView({ block: "nearest" })
      },
    ),
  )

  return (
    <section
      data-component="session-plan-list"
      data-finished={finished() ? "" : undefined}
      aria-label={language.t("session.plan.title")}
      class="relative z-0 -mb-3 rounded-xl bg-v2-background-bg-base px-1.5 pt-1.5 pb-4 shadow-[inset_0_0_0_0.5px_var(--v2-border-border-base)]"
    >
      <button
        type="button"
        data-slot="session-plan-header"
        aria-expanded={open()}
        onClick={() => setPinned(!open())}
        class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-start"
      >
        <span class="text-[11px] font-[530] uppercase leading-[var(--line-height-tight)] tracking-[0.05px] text-v2-text-text-muted">
          {language.t("session.plan.title")}
        </span>
        <span class="text-[11px] leading-[var(--line-height-tight)] text-v2-text-text-faint [font-variant-numeric:tabular-nums]">
          {language.t("session.plan.progress", { done: String(done()), count: String(props.todos.length) })}
        </span>
        <span data-slot="session-plan-bar" aria-hidden="true" class="ms-auto">
          <span style={{ width: `${(done() / Math.max(1, props.todos.length)) * 100}%` }} />
        </span>
        <svg
          data-slot="session-plan-chevron"
          data-open={open() ? "" : undefined}
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          aria-hidden="true"
          class="shrink-0 text-v2-icon-icon-faint"
        >
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <Grow when={open()} fade>
        <div ref={(element) => (list = element)} data-slot="session-plan-rows" class="max-h-[232px] overflow-y-auto px-0.5">
          <For each={props.todos}>
            {(todo) => (
              <div
                data-slot="session-plan-row"
                data-status={todo.status}
                class="flex shrink-0 items-start gap-2 rounded-md px-1.5 py-1"
              >
                <span class="flex h-5 shrink-0 items-center">
                  <TodoGlyph status={todo.status} />
                </span>
                <span
                  dir="auto"
                  data-slot="session-plan-text"
                  class="min-w-0 flex-1 text-[13px] leading-[var(--line-height-base)] tracking-[-0.04px]"
                >
                  {todo.content}
                </span>
                <Show when={todo.status === "in_progress"}>
                  <span data-slot="session-plan-now" class="shrink-0 text-[11px] leading-5 text-v2-text-text-faint">
                    {language.t("session.plan.now")}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Grow>
    </section>
  )
}
