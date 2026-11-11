import { For, Show } from "solid-js"
import { chartTicks, type Chart } from "./model"
import { createWidth } from "./size"

// The chart draws at the width it is given, so labels stay 11px at any window size; only its height is chosen.
const FALLBACK_WIDTH = 560

const MAX_HEIGHT = 240

const MIN_HEIGHT = 160

const LEFT = 44

const RIGHT = 12

const TOP = 12

const BOTTOM = 28

// Monochrome series: one text colour at falling strength, so a chart reads in black and white.
const shade = (index: number, count: number) => 1 - (index / Math.max(1, count)) * 0.7

function format(value: number) {
  return Math.abs(value) >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value * 100) / 100)
}

/** Bar, line and pie charts from a ```chart block, drawn as SVG in the theme's text colour. */
export function ChartView(props: { chart: Chart }) {
  const chart = () => props.chart
  const max = () => Math.max(0, ...chart().series.flatMap((item) => item.data))
  const axis = () => chartTicks(max())
  const frame = createWidth()
  const width = () => frame.width() || FALLBACK_WIDTH
  const height = () => Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, width() * 0.5)))
  const plotWidth = () => width() - LEFT - RIGHT
  const plotHeight = () => height() - TOP - BOTTOM
  const y = (value: number) => TOP + plotHeight() - (value / axis().top) * plotHeight()
  const slot = () => plotWidth() / chart().labels.length

  const pie = () => {
    const values = chart().series[0]?.data ?? []
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0) || 1
    let angle = -Math.PI / 2

    return values.map((value, index) => {
      const sweep = (Math.max(0, value) / total) * Math.PI * 2
      const start = angle
      angle += sweep
      const r = Math.min(92, height() / 2 - 12, width() / 2 - 12)
      const cx = width() / 2
      const cy = height() / 2
      const large = sweep > Math.PI ? 1 : 0
      const p = (a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`

      return {
        d:
          sweep >= Math.PI * 2 - 1e-6
            ? `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`
            : `M${cx} ${cy} L${p(start)} A${r} ${r} 0 ${large} 1 ${p(angle)} Z`,
        opacity: shade(index, values.length),
        label: chart().labels[index],
        share: Math.round((Math.max(0, value) / total) * 100),
      }
    })
  }

  return (
    <div
      data-component="visuals-chart"
      style={{
        border: "1px solid var(--v2-border-border-base)",
        "border-radius": "12px",
        background: "transparent",
        padding: "12px 14px",
        color: "var(--v2-text-text-base)",
        "font-family": "var(--font-family-sans)",
      }}
    >
      <Show when={chart().title}>
        <div style={{ "font-size": "13px", "line-height": "var(--line-height-compact)", "margin-bottom": "8px" }}>
          {chart().title}
          <Show when={chart().unit}>
            <span style={{ color: "var(--v2-text-text-faint)" }}> ({chart().unit})</span>
          </Show>
        </div>
      </Show>
      <div ref={frame.ref} style={{ "min-width": "0", overflow: "hidden" }}>
      <svg width={width()} height={height()} viewBox={`0 0 ${width()} ${height()}`} style={{ display: "block", color: "var(--v2-text-text-muted)" }} role="img">
        <title>{chart().title ?? chart().type}</title>
        <Show
          when={chart().type !== "pie"}
          fallback={
            <For each={pie()}>
              {(slice) => (
                <path
                  d={slice.d}
                  fill="currentColor"
                  fill-opacity={slice.opacity}
                  stroke="var(--v2-background-bg-deep)"
                  stroke-width="2"
                >
                  <title>
                    {slice.label}: {slice.share}%
                  </title>
                </path>
              )}
            </For>
          }
        >
          <For each={axis().ticks}>
            {(tick) => (
              <g>
                <line x1={LEFT} x2={width() - RIGHT} y1={y(tick)} y2={y(tick)} stroke="var(--v2-border-border-muted)" />
                <text
                  x={LEFT - 6}
                  y={y(tick) + 4}
                  text-anchor="end"
                  font-size="11"
                  fill="var(--v2-text-text-faint)"
                  style={{ "font-family": "var(--font-family-mono)" }}
                >
                  {format(tick)}
                </text>
              </g>
            )}
          </For>
          <For each={chart().labels}>
            {(label, index) => (
              <text
                x={LEFT + slot() * index() + slot() / 2}
                y={height() - 8}
                text-anchor="middle"
                font-size="11"
                fill="var(--v2-text-text-muted)"
              >
                {label.length > 12 ? `${label.slice(0, 11)}…` : label}
              </text>
            )}
          </For>
          <Show
            when={chart().type === "bar"}
            fallback={
              <For each={chart().series}>
                {(series, index) => (
                  <g opacity={shade(index(), chart().series.length)}>
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-dasharray={index() ? `${6 - index()} 3` : undefined}
                      points={series.data.map((value, i) => `${LEFT + slot() * i + slot() / 2},${y(value)}`).join(" ")}
                    />
                    <For each={series.data}>
                      {(value, i) => (
                        <circle cx={LEFT + slot() * i() + slot() / 2} cy={y(value)} r="3" fill="currentColor">
                          <title>
                            {series.name} · {chart().labels[i()]}: {format(value)}
                          </title>
                        </circle>
                      )}
                    </For>
                  </g>
                )}
              </For>
            }
          >
            <For each={chart().series}>
              {(series, index) => {
                const count = chart().series.length
                const group = slot() * 0.7
                const bar = group / count

                return (
                  <For each={series.data}>
                    {(value, i) => (
                      <rect
                        x={LEFT + slot() * i() + (slot() - group) / 2 + bar * index()}
                        y={y(Math.max(0, value))}
                        width={Math.max(1, bar - 2)}
                        height={Math.max(0, TOP + plotHeight() - y(Math.max(0, value)))}
                        rx="3"
                        fill="currentColor"
                        fill-opacity={shade(index(), count)}
                      >
                        <title>
                          {series.name} · {chart().labels[i()]}: {format(value)}
                        </title>
                      </rect>
                    )}
                  </For>
                )
              }}
            </For>
          </Show>
        </Show>
      </svg>
      </div>
      <Show when={chart().series.length > 1 || chart().type === "pie"}>
        <div
          style={{
            display: "flex",
            "flex-wrap": "wrap",
            gap: "4px 14px",
            "margin-top": "8px",
            "font-size": "12px",
            "line-height": "18px",
            color: "var(--v2-text-text-muted)",
          }}
        >
          <For
            each={
              chart().type === "pie"
                ? pie().map((slice) => ({ name: `${slice.label} ${slice.share}%`, opacity: slice.opacity }))
                : chart().series.map((series, index) => ({
                    name: series.name,
                    opacity: shade(index, chart().series.length),
                  }))
            }
          >
            {(item) => (
              <span style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    "border-radius": "3px",
                    background: "var(--v2-text-text-base)",
                    opacity: item.opacity,
                  }}
                />
                {item.name}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
