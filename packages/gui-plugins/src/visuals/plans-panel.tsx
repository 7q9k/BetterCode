import { createMemo, createSignal, For, Show } from "solid-js"
import type { MountedSession } from "@opencode/plugin/gui"
import { collectPlans } from "./model"
import { PlanGraph } from "./plan-graph"

type Translate = Parameters<typeof PlanGraph>[0]["t"] & ((key: "plans.empty" | "plans.earlier") => string)

/** The text of every assistant message in the session, in order: where `plan` blocks come from. */
export function sessionTexts(session: MountedSession) {
  return session.server.data.session.message
    .list(session.id)
    .flatMap((message) =>
      message.type === "assistant"
        ? message.content.flatMap((part) => (part.type === "text" ? [part.text] : []))
        : [],
    )
}

/**
 * The side panel's Plans tab, after oh-my-hermes: the session's latest plan as a vertical graph that follows every
 * reprint of its statuses, and the earlier plans to switch to.
 */
export function PlansPanel(props: { session: MountedSession; t: Translate; onRun?: () => void }) {
  const plans = createMemo(() => collectPlans(sessionTexts(props.session)))
  // Undefined follows the newest plan; a click pins an earlier one until a new plan arrives.
  const [picked, setPicked] = createSignal<string>()

  const current = createMemo(() => {
    const list = plans()

    return list.find((item) => item.key === picked()) ?? list.at(-1)
  })

  return (
    <div
      data-component="visuals-plans-panel"
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        "min-height": "0",
        background: "var(--v2-background-bg-base)",
      }}
    >
      <Show
        when={current()}
        fallback={
          <div
            style={{
              margin: "auto",
              padding: "24px",
              "max-width": "280px",
              "text-align": "center",
              "font-size": "13px",
              "line-height": "var(--line-height-base)",
              color: "var(--v2-text-text-muted)",
            }}
          >
            {props.t("plans.empty")}
          </div>
        }
      >
        {(item) => (
          <div data-scrollable style={{ flex: "1", "min-height": "0", "overflow-y": "auto" }}>
            <PlanGraph plan={item().plan} t={props.t} direction="vertical" bare onRun={props.onRun} />
            <Show when={plans().length > 1}>
              <div
                style={{
                  padding: "10px 14px 16px",
                  "border-top": "1px solid var(--v2-border-border-muted)",
                  display: "flex",
                  "flex-direction": "column",
                  gap: "2px",
                }}
              >
                <span
                  style={{
                    "font-size": "12px",
                    "line-height": "18px",
                    color: "var(--v2-text-text-faint)",
                    "margin-bottom": "4px",
                  }}
                >
                  {props.t("plans.earlier")}
                </span>
                <For each={[...plans()].reverse()}>
                  {(entry) => (
                    <button
                      type="button"
                      onClick={() => setPicked(entry.key === plans().at(-1)?.key ? undefined : entry.key)}
                      style={{
                        "text-align": "start",
                        padding: "4px 8px",
                        "border-radius": "6px",
                        border: "none",
                        cursor: "pointer",
                        "font-size": "13px",
                        "line-height": "var(--line-height-compact)",
                        color:
                          entry.key === item().key ? "var(--v2-text-text-base)" : "var(--v2-text-text-muted)",
                        background:
                          entry.key === item().key ? "var(--v2-overlay-simple-overlay-hover)" : "transparent",
                      }}
                    >
                      {entry.plan.title ?? entry.plan.nodes.map((node) => node.id).join(" → ")}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}
