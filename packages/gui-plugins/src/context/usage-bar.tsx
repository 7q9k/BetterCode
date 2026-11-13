import { createMemo, Show } from "solid-js"
import { Tooltip } from "@opencode/ui/tooltip"
import { useI18n } from "@opencode/ui/context/i18n"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type definition from "./index"
import { createSessionUsage } from "./indicator"

// From these shares of the context window on, the bar warns that the session is filling up, then that it is nearly full.
const WARN = 75

const FULL = 92

/**
 * The usage row under the composer, as in Claude: a slim bar of how much of the model's context the session fills,
 * the tokens against the limit, and what the session has cost. Hovering shows the tokens by kind; clicking opens the
 * Context tab. Nothing shows before the session's first answer.
 */
export function ComposerUsage(props: { session: MountedSession }) {
  const ctx = usePlugin<typeof definition>()
  const i18n = useI18n()

  const usage = createSessionUsage(
    () => props.session,
    () => true,
  )

  const compact = createMemo(
    () => new Intl.NumberFormat(i18n.locale(), { notation: "compact", maximumFractionDigits: 1 }),
  )

  const count = (value: number) => compact().format(value).toLocaleLowerCase(i18n.locale())

  const cost = createMemo(() =>
    new Intl.NumberFormat(i18n.locale(), { style: "currency", currency: "USD" }).format(usage.spent()),
  )

  const percent = () => Math.min(100, usage.context()?.usage ?? 0)

  const tone = () =>
    percent() >= FULL
      ? "var(--v2-state-fg-danger)"
      : percent() >= WARN
        ? "var(--v2-state-fg-warning)"
        : "var(--v2-text-text-muted)"

  const details = () => {
    const tokens = usage.context()?.tokens

    if (!tokens) return ""

    return [
      `${ctx.t("stats.inputTokens")}: ${tokens.input.toLocaleString(i18n.locale())}`,
      `${ctx.t("stats.outputTokens")}: ${tokens.output.toLocaleString(i18n.locale())}`,
      `${ctx.t("stats.reasoningTokens")}: ${tokens.reasoning.toLocaleString(i18n.locale())}`,
      `${ctx.t("stats.cacheTokens")}: ${tokens.cache.read.toLocaleString(i18n.locale())} / ${tokens.cache.write.toLocaleString(i18n.locale())}`,
    ].join("\n")
  }

  return (
    <Show when={usage.context()}>
      {(context) => (
        <Tooltip value={<span style={{ "white-space": "pre-line" }}>{details()}</span>} placement="top">
          <button
            type="button"
            data-component="composer-usage"
            aria-label={ctx.t("usage.view")}
            onClick={() => {
              usage.catalog.retry()
              ctx.layout.open(`${ctx.id}:main`, props.session)
            }}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "10px",
              width: "100%",
              "min-width": "0",
              "margin-top": "6px",
              padding: "2px 6px",
              border: "none",
              "border-radius": "6px",
              background: "transparent",
              cursor: "pointer",
              color: "var(--v2-text-text-faint)",
              "font-size": "11.5px",
              "line-height": "16px",
              "font-variant-numeric": "tabular-nums",
            }}
          >
            <Show when={context().limit}>
              <span
                aria-hidden="true"
                style={{
                  position: "relative",
                  width: "88px",
                  height: "4px",
                  "flex-shrink": "0",
                  "border-radius": "999px",
                  overflow: "hidden",
                  background: "var(--v2-background-bg-layer-04)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    inset: "0 auto 0 0",
                    width: `${Math.max(2, percent())}%`,
                    "border-radius": "999px",
                    background: tone(),
                    transition: "width 600ms cubic-bezier(0.2, 0.8, 0.2, 1), background 300ms ease",
                  }}
                />
              </span>
              <span style={{ color: tone(), "white-space": "nowrap" }}>
                {ctx.t("usage.bar.context").replace("{{percent}}", String(percent()))}
              </span>
            </Show>
            <span style={{ "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
              {context().limit
                ? ctx
                    .t("usage.bar.tokens")
                    .replace("{{used}}", count(context().total))
                    .replace("{{limit}}", count(context().limit ?? 0))
                : `${count(context().total)} ${ctx.t("usage.tokens")}`}
            </span>
            <Show when={usage.showCost()}>
              <span style={{ "margin-inline-start": "auto", "white-space": "nowrap" }}>
                {ctx.t("usage.bar.session")} {cost()}
              </span>
            </Show>
          </button>
        </Tooltip>
      )}
    </Show>
  )
}
