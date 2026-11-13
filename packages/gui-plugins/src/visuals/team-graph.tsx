import { createMemo, For, Show } from "solid-js"
import { fitText, GRAPH, runDuration, teamLayout, teamLink, wrapText, type StageRun } from "./team"

/**
 * The team as a living picture: the lead on top, and below it one card per subagent run, linked to the lead. A card
 * grows in when the lead starts the agent, pulses with a flow along its link while it works, shows a check or a cross
 * when it ends, and fades out a few seconds later. The animations live in team-graph.css.
 */
export function TeamGraph(props: {
  runs: readonly StageRun[]
  now: number
  lead: { name: string; model?: string; activity: string; busy: boolean }
  empty: string
  statusLabel: (status: StageRun["status"]) => string
}) {
  const layout = createMemo(() => teamLayout(props.runs.length))
  const lead = GRAPH.lead

  return (
    <div data-component="visuals-team-graph" style={{ padding: "6px 8px 2px" }}>
      <svg
        viewBox={`0 0 ${GRAPH.width} ${layout().height}`}
        width="100%"
        role="img"
        aria-label={props.lead.name}
        style={{ display: "block", overflow: "visible", transition: "height 300ms ease" }}
      >
        <For each={props.runs}>
          {(run, index) => {
            const card = () => layout().cards[index()] ?? { x: GRAPH.lead.x, y: GRAPH.top }
            const path = () => teamLink(card().x, card().y)

            return (
              <g>
                <path
                  class="team-link"
                  data-status={run.status}
                  data-leaving={run.leaving}
                  d={path()}
                  fill="none"
                  style={{
                    stroke: run.status === "failed" ? "var(--v2-state-fg-danger)" : "var(--v2-border-border-strong)",
                    "stroke-width": run.status === "running" ? "1.5" : "1",
                    "stroke-dasharray": run.status === "failed" ? "2 4" : undefined,
                    transition: "d 400ms ease",
                  }}
                />
                {/* Work flowing from the lead to the agent while it runs. */}
                <Show when={run.status === "running" && !run.leaving}>
                  <For each={[0, 0.45, 0.9]}>
                    {(delay) => (
                      <circle r="2.2" style={{ fill: "var(--v2-text-text-base)" }}>
                        <animateMotion dur="1.35s" begin={`${delay}s`} repeatCount="indefinite" path={path()} />
                      </circle>
                    )}
                  </For>
                </Show>
              </g>
            )
          }}
        </For>

        <g class="team-lead" data-busy={props.lead.busy}>
          <rect
            class="team-lead-ring"
            x={lead.x - lead.w / 2 - 4}
            y={lead.y - 4}
            width={lead.w + 8}
            height={lead.h + 8}
            rx="16"
            fill="none"
            style={{ stroke: "var(--v2-text-text-base)", "stroke-width": "1", opacity: props.lead.busy ? 0.4 : 0 }}
          />
          <rect
            x={lead.x - lead.w / 2}
            y={lead.y}
            width={lead.w}
            height={lead.h}
            rx="12"
            style={{ fill: "var(--surface-raised-base)", stroke: "var(--v2-text-text-base)", "stroke-width": "1" }}
          />
          <text
            x={lead.x}
            y={lead.y + 20}
            text-anchor="middle"
            style={{ fill: "var(--v2-text-text-base)", "font-size": "13px", "font-weight": "600" }}
          >
            {fitText(props.lead.name, 22)}
          </text>
          <Show when={props.lead.model}>
            {(model) => (
              <text
                x={lead.x}
                y={lead.y + 34}
                text-anchor="middle"
                style={{
                  fill: "var(--v2-text-text-faint)",
                  "font-size": "9.5px",
                  "font-family": "var(--font-family-mono)",
                }}
              >
                {fitText(model(), 30)}
              </text>
            )}
          </Show>
          <text
            x={lead.x}
            y={lead.y + 49}
            text-anchor="middle"
            style={{
              fill: props.lead.busy ? "var(--v2-text-text-base)" : "var(--v2-text-text-faint)",
              "font-size": "10.5px",
            }}
          >
            {fitText(props.lead.activity, 30)}
          </text>
        </g>

        <For each={props.runs}>
          {(run, index) => {
            const card = () => layout().cards[index()] ?? { x: GRAPH.lead.x, y: GRAPH.top }
            const left = () => card().x - GRAPH.card.w / 2
            const running = () => run.status === "running"

            const stroke = () =>
              run.status === "failed"
                ? "var(--v2-state-fg-danger)"
                : running()
                  ? "var(--v2-text-text-base)"
                  : "var(--v2-border-border-strong)"

            // The outer group places the card and glides it when cards ahead of it leave; the inner one animates it
            // in and out, which would otherwise replace the placement while its animation holds.
            return (
              <g style={{ transform: `translate(${left()}px, ${card().y}px)`, transition: "transform 400ms ease" }}>
              <g class="team-node" data-leaving={run.leaving}>
                <title>{`${run.agent}: ${run.task}${run.model ? ` (${run.model})` : ""}`}</title>
                <Show when={running()}>
                  <rect
                    class="team-pulse"
                    x="-3"
                    y="-3"
                    width={GRAPH.card.w + 6}
                    height={GRAPH.card.h + 6}
                    rx="13"
                    fill="none"
                    style={{ stroke: "var(--v2-text-text-base)", "stroke-width": "1" }}
                  />
                </Show>
                <rect
                  width={GRAPH.card.w}
                  height={GRAPH.card.h}
                  rx="10"
                  style={{
                    fill: "var(--surface-raised-base)",
                    stroke: stroke(),
                    "stroke-width": "1",
                    "stroke-dasharray": run.status === "failed" ? "3 3" : undefined,
                  }}
                />
                <Show
                  when={run.status === "done"}
                  fallback={
                    <Show
                      when={run.status === "failed"}
                      fallback={
                        <circle
                          class="team-dot"
                          data-status={run.status}
                          cx="12"
                          cy="15"
                          r="3.5"
                          style={{ fill: "var(--v2-text-text-base)" }}
                        />
                      }
                    >
                      <path
                        class="team-check"
                        d="M 8.5 11.5 L 15.5 18.5 M 15.5 11.5 L 8.5 18.5"
                        fill="none"
                        style={{ stroke: "var(--v2-state-fg-danger)", "stroke-width": "1.8", "stroke-linecap": "round" }}
                      />
                    </Show>
                  }
                >
                  <path
                    class="team-check"
                    d="M 7.5 15 L 10.8 18.3 L 16.5 11.5"
                    fill="none"
                    style={{
                      stroke: "var(--v2-state-fg-success)",
                      "stroke-width": "1.8",
                      "stroke-linecap": "round",
                      "stroke-linejoin": "round",
                    }}
                  />
                </Show>
                <text
                  x="23"
                  y="19"
                  style={{
                    fill: "var(--v2-text-text-base)",
                    "font-size": "12px",
                    "font-weight": "600",
                    "text-transform": "capitalize",
                  }}
                >
                  {fitText(run.agent, 13)}
                </text>
                <text
                  x={GRAPH.card.w - 9}
                  y="19"
                  text-anchor="end"
                  style={{
                    fill: "var(--v2-text-text-faint)",
                    "font-size": "9.5px",
                    "font-family": "var(--font-family-mono)",
                  }}
                >
                  {runDuration(run, props.now)}
                </text>
                <For each={wrapText(run.task, 23, 2)}>
                  {(line, row) => (
                    <text
                      x="10"
                      y={37 + row() * 13}
                      style={{ fill: "var(--v2-text-text-muted)", "font-size": "10.5px" }}
                    >
                      {line}
                    </text>
                  )}
                </For>
                {/* A working bar under the task while the agent runs; its outcome otherwise. */}
                <Show
                  when={running()}
                  fallback={
                    <text
                      x="10"
                      y="64"
                      style={{
                        fill: run.status === "failed" ? "var(--v2-state-fg-danger)" : "var(--v2-text-text-faint)",
                        "font-size": "9.5px",
                      }}
                    >
                      {props.statusLabel(run.status)}
                    </text>
                  }
                >
                  <rect
                    x="10"
                    y="59"
                    width={GRAPH.card.w - 20}
                    height="3"
                    rx="1.5"
                    style={{ fill: "var(--v2-background-bg-layer-04)" }}
                  />
                  <rect
                    class="team-bar"
                    x="10"
                    y="59"
                    width={GRAPH.card.w - 20}
                    height="3"
                    rx="1.5"
                    style={{ fill: "var(--v2-text-text-base)" }}
                  />
                </Show>
              </g>
              </g>
            )
          }}
        </For>
      </svg>
      <Show when={props.runs.length === 0}>
        <div
          style={{
            padding: "2px 8px 6px",
            "text-align": "center",
            "font-size": "12px",
            "line-height": "18px",
            color: "var(--v2-text-text-faint)",
          }}
        >
          {props.empty}
        </div>
      </Show>
    </div>
  )
}
