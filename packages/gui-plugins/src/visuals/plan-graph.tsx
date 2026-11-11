import { For, Show, type JSX } from "solid-js"
import { layoutPlan, PLAN_STATUSES, type Plan, type PlanStatus, type PlacedNode } from "./model"
import { createWidth } from "./size"

// Boxes grow and shrink with the room they have, between these widths; below the minimum the graph turns vertical.
const MIN_NODE_WIDTH = 150

const MAX_NODE_WIDTH = 280

const NODE_HEIGHT = 92

const GAP_X = 40

const GAP_Y = 12

const GAP_LAYER_VERTICAL = 32

const PAD = 12

type Translate = (key: StatusKey | "plan" | "dependencies" | "writes" | "summary") => string

type StatusKey = `status.${PlanStatus}`

// Monochrome status marks: filled for finished work, a ring for planned, a half-filled ring while running.
const mark: Record<PlanStatus, JSX.CSSProperties> = {
  planned: { border: "1.5px solid var(--v2-text-text-faint)", background: "transparent" },
  running: {
    border: "1.5px solid var(--v2-text-text-base)",
    background: "linear-gradient(90deg, var(--v2-text-text-base) 50%, transparent 50%)",
  },
  done: { border: "1.5px solid var(--v2-text-text-muted)", background: "var(--v2-text-text-muted)" },
  verified: { border: "1.5px solid var(--v2-text-text-base)", background: "var(--v2-text-text-base)" },
  failed: { border: "1.5px dashed var(--v2-state-fg-danger)", background: "transparent" },
  blocked: { border: "1.5px dashed var(--v2-text-text-faint)", background: "transparent" },
}

type Direction = "horizontal" | "vertical"

/** How wide each box can be when `count` boxes and their gaps share `room` pixels. */
function fit(room: number, count: number, gap: number) {
  return (room - PAD * 2 - (count - 1) * gap) / count
}

/**
 * A plan as a graph of rounded boxes in dependency columns, after the Plans panel of oh-my-hermes (MIT). It measures
 * its width and fits the window: columns left to right while they fit, else dependency rows top to bottom; `vertical`
 * asks for rows from the start, as the narrow side panel does. Only a graph wider than the narrowest boxes scrolls.
 */
export function PlanGraph(props: { plan: Plan; t: Translate; direction?: Direction; bare?: boolean }) {
  const frame = createWidth()
  const layout = () => layoutPlan(props.plan)

  const vertical = () =>
    props.direction === "vertical" ||
    (frame.width() > 0 && fit(frame.width(), layout().layers, GAP_X) < MIN_NODE_WIDTH)

  const gapLayer = () => (vertical() ? GAP_LAYER_VERTICAL : GAP_X)
  const across = () => (vertical() ? layout().rows : layout().layers)
  const crossGap = () => (vertical() ? GAP_Y : GAP_X)

  const nodeWidth = () => {
    const room = frame.width() || MAX_NODE_WIDTH * across()

    return Math.round(Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, fit(room, across(), crossGap()))))
  }

  const position = (node: PlacedNode) =>
    vertical()
      ? { x: PAD + node.row * (nodeWidth() + GAP_Y), y: PAD + node.layer * (NODE_HEIGHT + gapLayer()) }
      : { x: PAD + node.layer * (nodeWidth() + gapLayer()), y: PAD + node.row * (NODE_HEIGHT + GAP_Y) }

  const span = (count: number, size: number, gap: number) => PAD * 2 + count * size + (count - 1) * gap

  const width = () =>
    vertical() ? span(layout().rows, nodeWidth(), GAP_Y) : span(layout().layers, nodeWidth(), gapLayer())

  const height = () =>
    vertical() ? span(layout().layers, NODE_HEIGHT, gapLayer()) : span(layout().rows, NODE_HEIGHT, GAP_Y)

  const byID = () => new Map(layout().nodes.map((node) => [node.id, node]))

  // Status counts in a fixed order, leaving out statuses no node has.
  const counts = () =>
    PLAN_STATUSES.flatMap((status) => {
      const count = layout().nodes.filter((node) => node.status === status).length

      return count ? [{ status, count }] : []
    })

  const edgePath = (from: PlacedNode, to: PlacedNode) => {
    const a = position(from)
    const b = position(to)

    if (vertical()) {
      const x1 = a.x + nodeWidth() / 2
      const y1 = a.y + NODE_HEIGHT
      const x2 = b.x + nodeWidth() / 2
      const y2 = b.y
      const bend = (y2 - y1) / 2

      return `M${x1} ${y1} C${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
    }

    const x1 = a.x + nodeWidth()
    const y1 = a.y + NODE_HEIGHT / 2
    const x2 = b.x
    const y2 = b.y + NODE_HEIGHT / 2
    const bend = (x2 - x1) / 2

    return `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
  }

  return (
    <div
      ref={frame.ref}
      data-component="visuals-plan"
      style={{
        border: props.bare ? "none" : "1px solid var(--v2-border-border-base)",
        "border-radius": props.bare ? "0" : "12px",
        background: props.bare ? "var(--v2-background-bg-base)" : "transparent",
        "font-family": "var(--font-family-sans)",
        color: "var(--v2-text-text-base)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "8px",
          padding: "10px 14px",
          "border-bottom": "1px solid var(--v2-border-border-muted)",
          "font-size": "13px",
          "line-height": "var(--line-height-compact)",
        }}
      >
        <span style={{ color: "var(--v2-text-text-faint)", "font-family": "var(--font-family-mono)" }}>
          {props.t("plan")}
        </span>
        <span style={{ "font-weight": "var(--font-weight-medium)" }}>{props.plan.title}</span>
        <span style={{ "margin-inline-start": "auto", display: "flex", gap: "10px", color: "var(--v2-text-text-muted)" }}>
          <For each={counts()}>
            {(item) => (
              <span style={{ display: "flex", "align-items": "center", gap: "5px" }}>
                <span
                  style={{ width: "8px", height: "8px", "border-radius": "999px", ...mark[item.status] }}
                />
                {item.count} {props.t(`status.${item.status}`)}
              </span>
            )}
          </For>
        </span>
      </div>

      <div data-scrollable style={{ "overflow-x": "auto" }}>
        <div style={{ position: "relative", width: `${width()}px`, height: `${height()}px`, margin: "0 auto" }}>
          <svg
            aria-hidden="true"
            width={width()}
            height={height()}
            style={{ position: "absolute", inset: "0", overflow: "visible" }}
          >
            <For each={layout().edges}>
              {(edge) => {
                const from = byID().get(edge.from)
                const to = byID().get(edge.to)

                if (!from || !to) return null
                const done = from.status === "done" || from.status === "verified"

                return (
                  <path
                    d={edgePath(from, to)}
                    fill="none"
                    stroke={done ? "var(--v2-text-text-muted)" : "var(--v2-text-text-faint)"}
                    stroke-width="1.25"
                    stroke-dasharray={done ? undefined : "4 4"}
                  />
                )
              }}
            </For>
          </svg>
          <For each={layout().nodes}>
            {(node) => (
              <div
                data-status={node.status}
                style={{
                  position: "absolute",
                  left: `${position(node).x}px`,
                  top: `${position(node).y}px`,
                  width: `${nodeWidth()}px`,
                  height: `${NODE_HEIGHT}px`,
                  "box-sizing": "border-box",
                  padding: "9px 11px",
                  "border-radius": "12px",
                  border:
                    node.status === "running"
                      ? "1px solid var(--v2-text-text-base)"
                      : "1px solid var(--v2-border-border-strong)",
                  background: "var(--surface-raised-base)",
                  "box-shadow": node.status === "running" ? "0 0 0 3px var(--v2-alpha-light-6, transparent)" : "none",
                  display: "flex",
                  "flex-direction": "column",
                  gap: "4px",
                  opacity: node.status === "blocked" ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                  <span
                    style={{
                      "font-family": "var(--font-family-mono)",
                      "font-size": "11px",
                      "line-height": "16px",
                      padding: "0 5px",
                      "border-radius": "5px",
                      border: "1px solid var(--v2-border-border-base)",
                      color: "var(--v2-text-text-muted)",
                    }}
                  >
                    {node.id}
                  </span>
                  <span style={{ width: "8px", height: "8px", "border-radius": "999px", ...mark[node.status] }} />
                  <span style={{ "font-size": "11px", color: "var(--v2-text-text-faint)" }}>
                    {props.t(`status.${node.status}`)}
                  </span>
                </div>
                <div
                  title={node.label}
                  style={{
                    "font-size": "13px",
                    "line-height": "var(--line-height-compact)",
                    "font-weight": "var(--font-weight-medium)",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap",
                  }}
                >
                  {node.label}
                </div>
                <Show when={node.model || node.category || node.effort}>
                  <div
                    style={{
                      "font-size": "11px",
                      "line-height": "16px",
                      color: "var(--v2-text-text-muted)",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                    }}
                  >
                    {[node.model, node.effort, node.category].filter(Boolean).join(" · ")}
                  </div>
                </Show>
                <Show when={node.writes.length}>
                  <div
                    title={node.writes.join(", ")}
                    style={{
                      "font-family": "var(--font-family-mono)",
                      "font-size": "11px",
                      "line-height": "16px",
                      color: "var(--v2-text-text-faint)",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                    }}
                  >
                    {node.writes.join(", ")}
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>

      <Show when={layout().edges.length}>
        <div
          style={{
            padding: "8px 14px 10px",
            "border-top": "1px solid var(--v2-border-border-muted)",
            "font-family": "var(--font-family-mono)",
            "font-size": "12px",
            "line-height": "18px",
            color: "var(--v2-text-text-muted)",
            display: "flex",
            "flex-wrap": "wrap",
            gap: "4px 16px",
          }}
        >
          <span style={{ color: "var(--v2-text-text-faint)" }}>{props.t("dependencies")}</span>
          <For each={layout().nodes.filter((node) => node.deps.length)}>
            {(node) => (
              <span>
                {node.id} ← {node.deps.join(", ")}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
