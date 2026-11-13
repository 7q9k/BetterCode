import { Option, Schema } from "effect"

// Pure model for the Team tab: who is on the team, and what the subagents of this session did and are doing.

export type TeamRole = "lead" | "writer" | "read-only"

export type TeamMember = {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly role: TeamRole
}

export type TeamRunStatus = "running" | "done" | "failed"

export type TeamRun = {
  readonly id: string
  readonly agent: string
  readonly task: string
  readonly status: TeamRunStatus
  /** The model the lead chose for this run, when it chose one. */
  readonly model?: string
  readonly started: number
  readonly ended?: number
}

/** What the model needs of an agent, as the server lists it. */
export type AgentInput = {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly mode: "subagent" | "primary" | "all"
  readonly hidden: boolean
  readonly permissions: readonly { readonly action: string; readonly resource: string; readonly effect: string }[]
}

/** What the model needs of a tool call in an assistant message. */
export type ToolInput = {
  readonly id: string
  readonly name: string
  readonly status: "streaming" | "running" | "completed" | "error"
  readonly input: unknown
  readonly created: number
  readonly completed?: number
  /**
   * The subagent's own session, when the call started one. The call itself returns at once while the agent keeps
   * working in that session, so its state, not the call's, says whether the agent still runs and how it ended.
   */
  readonly child?: { readonly running: boolean; readonly ended?: number; readonly failed: boolean }
}

const SUBAGENT_TOOLS: readonly string[] = ["subagent", "task"]

// A tool call that got past streaming is running, finished or failed.
const RUN_STATUS = { running: "running", completed: "done", error: "failed" } satisfies Record<string, TeamRunStatus>

const RunInput = Schema.Struct({
  agent: Schema.optionalKey(Schema.String),
  subagent_type: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  prompt: Schema.optionalKey(Schema.String),
})

const decodeRun = Schema.decodeUnknownOption(RunInput)

/** An agent that may not edit anything: its rules deny every action before allowing the reading ones. */
function readOnly(agent: AgentInput) {
  return agent.permissions.some((rule) => rule.action === "*" && rule.resource === "*" && rule.effect === "deny")
}

/** The visible team: primary agents lead, subagents are writers or read-only specialists. Leads list first. */
export function teamMembers(agents: readonly AgentInput[]): TeamMember[] {
  const order: Record<TeamRole, number> = { lead: 0, writer: 1, "read-only": 2 }

  return agents
    .flatMap((agent): TeamMember[] =>
      agent.hidden
        ? []
        : [
            {
              id: agent.id,
              name: agent.name,
              description: agent.description,
              role: agent.mode !== "subagent" ? "lead" : readOnly(agent) ? "read-only" : "writer",
            },
          ],
    )
    .toSorted((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name))
}

/** Every subagent run among the tool calls, newest first; a call still streaming its input is not a run yet. */
export function teamRuns(tools: readonly ToolInput[]): TeamRun[] {
  return tools
    .flatMap((tool): TeamRun[] => {
      if (!SUBAGENT_TOOLS.includes(tool.name) || tool.status === "streaming") return []

      const input = Option.getOrUndefined(decodeRun(tool.input))
      const agent = input?.agent?.trim() || input?.subagent_type?.trim() || "general"
      const task = input?.description?.trim() || input?.prompt?.trim().split("\n")[0] || agent
      const child = tool.child

      const status: TeamRunStatus =
        tool.status === "error" || child?.failed ? "failed" : child?.running ? "running" : RUN_STATUS[tool.status]

      return [
        {
          id: tool.id,
          agent,
          task,
          status,
          model: input?.model?.trim() || undefined,
          started: tool.created,
          ended: status === "running" ? undefined : (child?.ended ?? tool.completed),
        },
      ]
    })
    .toSorted((a, b) => b.started - a.started)
}

/** How many runs each agent has in each state, by agent id or name as the tool call named it. */
export function teamLoad(runs: readonly TeamRun[]) {
  const load = new Map<string, { running: number; done: number; failed: number }>()

  runs.forEach((run) => {
    const key = run.agent.toLowerCase()
    const entry = load.get(key) ?? { running: 0, done: 0, failed: 0 }
    entry[run.status] += 1
    load.set(key, entry)
  })

  return load
}

/** A run's duration as a short label: seconds under a minute, else minutes and seconds. */
export function runDuration(run: TeamRun, now: number) {
  const seconds = Math.max(0, Math.round(((run.ended ?? now) - run.started) / 1000))

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** How long a finished run stays on the graph, and how long its fade-out takes at the end of that time. */
export const LINGER = { done: 5000, failed: 9000, fade: 600 } as const

/** A run on the graph, and whether it is fading out. */
export type StageRun = TeamRun & { readonly leaving: boolean }

/**
 * The runs the graph shows at `now`, oldest first so new agents join at the end: every running run, and a finished one
 * until its linger time is over, fading out during the last part of it.
 */
export function teamStage(runs: readonly TeamRun[], now: number): StageRun[] {
  return runs
    .flatMap((run): StageRun[] => {
      if (run.status === "running" || run.ended === undefined) return [{ ...run, leaving: false }]
      const gone = run.ended + LINGER[run.status]

      if (now >= gone) return []

      return [{ ...run, leaving: now >= gone - LINGER.fade }]
    })
    .toSorted((a, b) => a.started - b.started)
}

/** The graph's geometry, in the units of its 300-wide view box. */
export const GRAPH = { width: 300, lead: { x: 150, y: 16, w: 172, h: 58 }, card: { w: 134, h: 70 }, top: 118, row: 86 }

/** Where each of `count` agent cards sits: two columns, an odd last card centred, rows going down. */
export function teamLayout(count: number) {
  const height = count === 0 ? GRAPH.lead.y + GRAPH.lead.h + 12 : GRAPH.top + Math.ceil(count / 2) * GRAPH.row

  const cards = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 2)
    const alone = index === count - 1 && count % 2 === 1

    return { x: alone ? 150 : index % 2 === 0 ? 78 : 222, y: GRAPH.top + row * GRAPH.row }
  })

  return { height, cards }
}

/** The link from the lead's bottom edge to the top of a card centred at `x`, starting at `y`. */
export function teamLink(x: number, y: number) {
  const start = GRAPH.lead.y + GRAPH.lead.h
  const middle = (start + y) / 2

  return `M ${GRAPH.lead.x} ${start} C ${GRAPH.lead.x} ${middle}, ${x} ${middle}, ${x} ${y}`
}

/** `text` cut to `max` characters with an ellipsis, so SVG text fits its card. */
export function fitText(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim()

  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** `text` broken at spaces into at most `lines` lines of `max` characters; the last line ends with an ellipsis if cut. */
export function wrapText(text: string, max: number, lines: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)

  const wrapped = words.reduce<string[]>((result, word) => {
    const last = result.at(-1)

    if (last !== undefined && `${last} ${word}`.length <= max) result[result.length - 1] = `${last} ${word}`
    else result.push(word)

    return result
  }, [])

  if (wrapped.length <= lines) return wrapped.map((line) => fitText(line, max))

  const kept = wrapped.slice(0, lines).map((line) => fitText(line, max))
  const last = kept.at(-1) ?? ""

  // More text follows the last line, so it ends with an ellipsis even when it fits.
  const cut = last.endsWith("…") ? last : `${last.length < max ? last : last.slice(0, max - 1).trimEnd()}…`

  return [...kept.slice(0, -1), cut]
}

/** The user's team setup, as the plugin stores it. */
export type TeamSetup = { readonly enabled: boolean; readonly off: readonly string[] }

/** Whether a member takes work under this setup: leads always do, the others only while the team is on and they are selected. */
export function memberActive(member: TeamMember, setup: TeamSetup) {
  return member.role === "lead" || (setup.enabled && !setup.off.includes(member.id))
}

/** What a member is doing: its running task if it has one, else the last thing it finished in this session. */
export function memberWork(member: TeamMember, runs: readonly TeamRun[]) {
  const mine = runs.filter((run) => [member.id.toLowerCase(), member.name.toLowerCase()].includes(run.agent.toLowerCase()))

  return mine.find((run) => run.status === "running") ?? mine[0]
}

/**
 * The note that tells the session's lead which subagents it may use. It is the only way the setup reaches the model,
 * so it names every allowed agent and says plainly what is off.
 */
export function teamNote(members: readonly TeamMember[], setup: TeamSetup) {
  const subagents = members.filter((member) => member.role !== "lead")
  const allowed = subagents.filter((member) => memberActive(member, setup))
  const excluded = subagents.filter((member) => !memberActive(member, setup))

  if (allowed.length === 0)
    return [
      "<system-reminder>",
      "The user turned the agent team OFF. Do not start subagents; do all work yourself in this session until the user turns the team back on.",
      "</system-reminder>",
    ].join("\n")

  return [
    "<system-reminder>",
    "The user set up an agent team for this session and you are its lead. Lead it:",
    "- Do small requests yourself: a question, one edit, a handful of tool calls.",
    "- For larger work, split it into independent parts and start one subagent per part in the same message, so they run in parallel. Read-only agents search, research, design, review and verify; agents that can edit implement.",
    "- Hand wide searches and research to a subagent instead of reading many files yourself, and have a read-only agent review or verify a larger change before you report it done.",
    "- A subagent sees none of this conversation: give each one a complete brief with the goal, the files and what done looks like.",
    "Use these subagents, and only these:",
    ...allowed.map((member) => `- ${member.id} (${member.role === "read-only" ? "read-only" : "can edit"})`),
    ...(excluded.length
      ? [
          `Do not use: ${excluded.map((member) => member.id).join(", ")}. Where one of them would have been the right choice, do that part yourself or use an allowed agent.`,
        ]
      : []),
    "</system-reminder>",
  ].join("\n")
}
