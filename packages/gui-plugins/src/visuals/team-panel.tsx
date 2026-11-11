import { createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import type { MountedSession } from "@opencode/plugin/gui"
import {
  memberActive,
  memberWork,
  runDuration,
  teamMembers,
  teamRuns,
  type TeamMember,
  type TeamRole,
  type TeamRunStatus,
  type TeamSetup,
} from "./team"

type Key =
  | "team.on"
  | "team.off"
  | "team.toggle"
  | "team.lead"
  | "team.idle"
  | "team.last"
  | "team.apply"
  | "team.applied"
  | "team.pending"
  | "team.include"
  | "team.activity"
  | "team.activity.empty"
  | "team.ask"
  | `team.role.${TeamRole}`
  | `team.status.${TeamRunStatus}`

type Translate = (key: Key) => string

// Monochrome status marks, as in the plan graph.
const mark: Record<TeamRunStatus, JSX.CSSProperties> = {
  running: {
    border: "1.5px solid var(--v2-text-text-base)",
    background: "linear-gradient(90deg, var(--v2-text-text-base) 50%, transparent 50%)",
  },
  done: { border: "1.5px solid var(--v2-text-text-muted)", background: "var(--v2-text-text-muted)" },
  failed: { border: "1.5px dashed var(--v2-state-fg-danger)", background: "transparent" },
}

const LINE = "1px solid var(--v2-border-border-strong)"

const heading: JSX.CSSProperties = {
  padding: "14px 14px 6px",
  "font-size": "12px",
  "line-height": "18px",
  color: "var(--v2-text-text-faint)",
}

const chip: JSX.CSSProperties = {
  "font-family": "var(--font-family-mono)",
  "font-size": "11px",
  "line-height": "16px",
  padding: "0 5px",
  "border-radius": "5px",
  border: "1px solid var(--v2-border-border-base)",
  color: "var(--v2-text-text-muted)",
  "white-space": "nowrap",
}

const clip: JSX.CSSProperties = { overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }

/**
 * The side panel's Team tab. On top, the team as a picture: the lead, and below it every agent with what it is doing
 * now. The switch turns the whole team on or off, each agent's checkbox takes it in or out, and Apply tells the
 * session's lead about the setup. Below, the session's subagent runs, newest first.
 */
export function TeamPanel(props: {
  session: MountedSession
  t: Translate
  setup: TeamSetup
  /** The model the session's next prompt is sent with, as the lead's label. */
  leadModel?: string
  /** True once the current setup was sent to this session. */
  applied: boolean
  onEnabled: (enabled: boolean) => void
  onMember: (id: string, included: boolean) => void
  onApply: (members: readonly TeamMember[]) => void
  onAsk: (name: string) => void
}) {
  const members = createMemo(() =>
    teamMembers(props.session.server.data.location.agent.list({ directory: props.session.directory }) ?? []),
  )

  const leads = () => members().filter((member) => member.role === "lead")
  const crew = () => members().filter((member) => member.role !== "lead")

  const runs = createMemo(() =>
    teamRuns(
      props.session.server.data.session.message.list(props.session.id).flatMap((message) =>
        message.type === "assistant"
          ? message.content.flatMap((part) =>
              part.type === "tool"
                ? [
                    {
                      id: part.id,
                      name: part.name,
                      status: part.state.status,
                      input: part.state.input,
                      created: part.time.created,
                      completed: part.time.completed,
                    },
                  ]
                : [],
            )
          : [],
      ),
    ),
  )

  // A clock for the durations of running subagents; it ticks only while one runs.
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => runs().some((run) => run.status === "running") && setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(timer))

  return (
    <div
      data-component="visuals-team-panel"
      data-scrollable
      style={{
        height: "100%",
        "min-height": "0",
        "overflow-y": "auto",
        background: "var(--v2-background-bg-base)",
        color: "var(--v2-text-text-base)",
        "font-family": "var(--font-family-sans)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "10px",
          padding: "10px 14px",
          "border-bottom": "1px solid var(--v2-border-border-muted)",
          "font-size": "13px",
          "line-height": "var(--line-height-compact)",
        }}
      >
        <button
          type="button"
          role="switch"
          aria-checked={props.setup.enabled}
          aria-label={props.t("team.toggle")}
          onClick={() => props.onEnabled(!props.setup.enabled)}
          style={{
            width: "34px",
            height: "20px",
            padding: "2px",
            "border-radius": "999px",
            border: LINE,
            background: props.setup.enabled ? "var(--v2-text-text-base)" : "transparent",
            cursor: "pointer",
            display: "flex",
            "justify-content": props.setup.enabled ? "flex-end" : "flex-start",
            "flex-shrink": "0",
          }}
        >
          <span
            style={{
              width: "14px",
              height: "14px",
              "border-radius": "999px",
              background: props.setup.enabled ? "var(--v2-background-bg-base)" : "var(--v2-text-text-muted)",
            }}
          />
        </button>
        <span style={{ "font-weight": "var(--font-weight-medium)" }}>
          {props.t(props.setup.enabled ? "team.on" : "team.off")}
        </span>
        <button
          type="button"
          disabled={props.applied}
          onClick={() => props.onApply(members())}
          title={props.t("team.pending")}
          style={{
            "margin-inline-start": "auto",
            height: "24px",
            padding: "0 10px",
            "border-radius": "6px",
            border: LINE,
            background: props.applied ? "transparent" : "var(--v2-text-text-base)",
            color: props.applied ? "var(--v2-text-text-faint)" : "var(--v2-background-bg-base)",
            "font-size": "12px",
            "font-weight": "var(--font-weight-medium)",
            cursor: props.applied ? "default" : "pointer",
            "white-space": "nowrap",
          }}
        >
          {props.t(props.applied ? "team.applied" : "team.apply")}
        </button>
      </div>

      {/* The picture: the lead on top, a trunk down, and every agent below with its current work. */}
      <div style={{ padding: "14px 12px 4px", display: "flex", "flex-direction": "column", "align-items": "center" }}>
        <div
          data-slot="team-lead"
          style={{
            "min-width": "150px",
            "max-width": "100%",
            padding: "9px 14px",
            "border-radius": "12px",
            border: "1px solid var(--v2-text-text-base)",
            background: "var(--surface-raised-base)",
            "text-align": "center",
          }}
        >
          <div style={{ display: "flex", "justify-content": "center", "align-items": "center", gap: "8px" }}>
            <span style={{ "font-size": "13px", "font-weight": "var(--font-weight-medium)" }}>
              {leads()
                .map((member) => member.name)
                .join(" / ") || props.t("team.lead")}
            </span>
            <span style={chip}>{props.t("team.lead")}</span>
          </div>
          <Show when={props.leadModel}>
            <div
              style={{
                "margin-top": "3px",
                "font-family": "var(--font-family-mono)",
                "font-size": "11px",
                "line-height": "16px",
                color: "var(--v2-text-text-muted)",
                ...clip,
              }}
            >
              {props.leadModel}
            </div>
          </Show>
        </div>
        <div style={{ width: "1px", height: "16px", background: "var(--v2-border-border-strong)" }} />
        <div
          style={{
            width: "100%",
            display: "grid",
            "grid-template-columns": "repeat(auto-fill, minmax(128px, 1fr))",
            gap: "0 8px",
            "border-top": LINE,
            opacity: props.setup.enabled ? 1 : 0.45,
          }}
        >
          <For each={crew()}>
            {(member) => {
              const active = () => memberActive(member, props.setup)
              const work = () => memberWork(member, runs())
              const busy = () => active() && work()?.status === "running"

              return (
                <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", "min-width": "0" }}>
                  <div style={{ width: "1px", height: "10px", background: "var(--v2-border-border-strong)" }} />
                  <div
                    data-slot="team-member"
                    data-active={active()}
                    style={{
                      width: "100%",
                      "box-sizing": "border-box",
                      "margin-bottom": "8px",
                      padding: "8px 9px",
                      "border-radius": "10px",
                      border: busy() ? "1px solid var(--v2-text-text-base)" : LINE,
                      "border-style": active() ? "solid" : "dashed",
                      background: active() ? "var(--surface-raised-base)" : "transparent",
                      opacity: active() ? 1 : 0.55,
                      display: "flex",
                      "flex-direction": "column",
                      gap: "3px",
                      "min-width": "0",
                    }}
                  >
                    <div style={{ display: "flex", "align-items": "center", gap: "6px", "min-width": "0" }}>
                      <input
                        type="checkbox"
                        checked={!props.setup.off.includes(member.id)}
                        disabled={!props.setup.enabled}
                        aria-label={`${props.t("team.include")}: ${member.name}`}
                        onChange={(event) => props.onMember(member.id, event.currentTarget.checked)}
                        style={{ margin: "0", "accent-color": "var(--v2-text-text-base)", "flex-shrink": "0" }}
                      />
                      <button
                        type="button"
                        title={member.description ?? props.t("team.ask")}
                        disabled={!active()}
                        onClick={() => props.onAsk(member.name)}
                        style={{
                          padding: "0",
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          "font-family": "inherit",
                          "font-size": "13px",
                          "line-height": "var(--line-height-compact)",
                          "font-weight": "var(--font-weight-medium)",
                          cursor: active() ? "pointer" : "default",
                          "min-width": "0",
                          ...clip,
                        }}
                      >
                        {member.name}
                      </button>
                    </div>
                    <span style={{ ...chip, "align-self": "flex-start" }}>{props.t(`team.role.${member.role}`)}</span>
                    <div
                      style={{
                        display: "flex",
                        "align-items": "center",
                        gap: "5px",
                        "font-size": "11px",
                        "line-height": "16px",
                        color: busy() ? "var(--v2-text-text-base)" : "var(--v2-text-text-faint)",
                        "min-width": "0",
                      }}
                    >
                      <Show when={active() && work()} fallback={<span>{props.t("team.idle")}</span>}>
                        {(run) => (
                          <>
                            <span
                              style={{
                                width: "7px",
                                height: "7px",
                                "border-radius": "999px",
                                "flex-shrink": "0",
                                ...mark[run().status],
                              }}
                            />
                            <span title={run().task} style={clip}>
                              {run().status === "running" ? run().task : `${props.t("team.last")}: ${run().task}`}
                            </span>
                          </>
                        )}
                      </Show>
                    </div>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      <div style={heading}>{props.t("team.activity")}</div>
      <Show
        when={runs().length}
        fallback={
          <div
            style={{
              padding: "4px 14px 16px",
              "font-size": "13px",
              "line-height": "var(--line-height-base)",
              color: "var(--v2-text-text-muted)",
            }}
          >
            {props.t("team.activity.empty")}
          </div>
        }
      >
        <div style={{ display: "flex", "flex-direction": "column", padding: "0 10px 16px" }}>
          <For each={runs()}>
            {(run) => (
              <div
                data-status={run.status}
                style={{
                  display: "grid",
                  "grid-template-columns": "max-content minmax(0, 1fr) max-content",
                  "align-items": "center",
                  gap: "2px 8px",
                  padding: "7px 4px",
                  "border-bottom": "1px solid var(--v2-border-border-muted)",
                  "font-size": "12px",
                  "line-height": "18px",
                }}
              >
                <span
                  title={props.t(`team.status.${run.status}`)}
                  style={{ width: "8px", height: "8px", "border-radius": "999px", ...mark[run.status] }}
                />
                <span style={{ display: "flex", "align-items": "center", gap: "6px", "min-width": "0" }}>
                  <span style={{ "font-weight": "var(--font-weight-medium)", "text-transform": "capitalize" }}>
                    {run.agent}
                  </span>
                  <Show when={run.model}>
                    <span style={{ ...chip, ...clip }}>{run.model}</span>
                  </Show>
                </span>
                <span style={{ "font-family": "var(--font-family-mono)", color: "var(--v2-text-text-faint)" }}>
                  {runDuration(run, now())}
                </span>
                <span />
                <span title={run.task} style={{ "grid-column": "2 / 4", color: "var(--v2-text-text-muted)", ...clip }}>
                  {run.task}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
