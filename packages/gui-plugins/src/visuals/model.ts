// Pure parsing and layout for the `plan` and `chart` code blocks. Anything that does not parse returns undefined, so
// the block keeps showing its source instead of a broken picture.

import { Option, Schema } from "effect"

export type PlanStatus = "planned" | "running" | "done" | "verified" | "failed" | "blocked"

export type PlanNode = {
  readonly id: string
  readonly label: string
  readonly deps: readonly string[]
  readonly status: PlanStatus
  readonly agent?: string
  readonly model?: string
  readonly category?: string
  readonly effort?: string
  readonly writes: readonly string[]
  readonly check?: string
}

export type Plan = { readonly title?: string; readonly nodes: readonly PlanNode[] }

export type PlacedNode = PlanNode & { readonly layer: number; readonly row: number }

export type PlanLayout = {
  readonly nodes: readonly PlacedNode[]
  readonly layers: number
  readonly rows: number
  readonly edges: readonly { readonly from: string; readonly to: string }[]
}

export type ChartType = "bar" | "line" | "pie"

export type Chart = {
  readonly type: ChartType
  readonly title?: string
  readonly unit?: string
  readonly labels: readonly string[]
  readonly series: readonly { readonly name: string; readonly data: readonly number[] }[]
}


/** Every plan status, in the order the graph lists them. */
export const PLAN_STATUSES: readonly PlanStatus[] = ["running", "planned", "blocked", "failed", "done", "verified"]

// Models write statuses in many ways; map the common ones and fall back to planned.
const STATUS_ALIASES = {
  planned: "planned",
  running: "running",
  done: "done",
  verified: "verified",
  failed: "failed",
  blocked: "blocked",
  pending: "planned",
  waiting: "planned",
  todo: "planned",
  queued: "planned",
  in_progress: "running",
  "in-progress": "running",
  active: "running",
  complete: "done",
  completed: "done",
  passed: "verified",
  pass: "verified",
  error: "failed",
  fail: "failed",
} satisfies Record<string, PlanStatus>

// The fields models use for a node, including the oh-my-hermes names; extra fields are ignored.
const Text = Schema.optionalKey(Schema.String)

const Names = Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)]))

const NodeInput = Schema.Struct({
  id: Schema.String,
  label: Text,
  title: Text,
  task: Text,
  deps: Names,
  depends_on: Names,
  dependsOn: Names,
  status: Text,
  agent: Text,
  owner: Text,
  model: Text,
  category: Text,
  effort: Text,
  writes: Names,
  write_scope: Names,
  files: Names,
  check: Text,
  verify: Text,
})

const PlanInput = Schema.Union([
  Schema.Array(Schema.Unknown),
  Schema.Struct({ title: Text, nodes: Schema.Array(Schema.Unknown) }),
])

const SeriesInput = Schema.Struct({ name: Text, data: Schema.Array(Schema.Finite) })

const ChartInput = Schema.Struct({
  type: Schema.String,
  title: Text,
  unit: Text,
  labels: Schema.optionalKey(Schema.Array(Schema.String)),
  series: Schema.Array(Schema.Unknown),
})

const decodePlan = Schema.decodeUnknownOption(Schema.fromJsonString(PlanInput))

const decodeNode = Schema.decodeUnknownOption(NodeInput)

const decodeChart = Schema.decodeUnknownOption(Schema.fromJsonString(ChartInput))

const decodeSeries = Schema.decodeUnknownOption(SeriesInput)

function clean(value: string | undefined) {
  const trimmed = value?.trim()

  return trimmed ? trimmed : undefined
}

function names(value: string | readonly string[] | undefined) {
  const list = value === undefined ? [] : Array.isArray(value) ? value : [value]

  return list.flatMap((item) => clean(item) ?? [])
}

function status(value: string | undefined): PlanStatus {
  const raw = value?.trim().toLowerCase() ?? ""

  return Object.entries(STATUS_ALIASES).find(([alias]) => alias === raw)?.[1] ?? "planned"
}

function node(item: typeof NodeInput.Type): PlanNode[] {
  const id = clean(item.id)

  if (!id) return []

  return [
    {
      id,
      label: clean(item.label) ?? clean(item.title) ?? clean(item.task) ?? id,
      deps: names(item.deps ?? item.depends_on ?? item.dependsOn),
      status: status(item.status),
      agent: clean(item.agent ?? item.owner),
      model: clean(item.model),
      category: clean(item.category),
      effort: clean(item.effort),
      writes: names(item.writes ?? item.write_scope ?? item.files),
      check: clean(item.check ?? item.verify),
    },
  ]
}

export function parsePlan(source: string): Plan | undefined {
  const input = Option.getOrUndefined(decodePlan(source))

  if (!input) return undefined
  const entries = "nodes" in input ? input.nodes : input
  const title = "nodes" in input ? clean(input.title) : undefined
  const nodes = entries.flatMap((entry) => Option.match(decodeNode(entry), { onNone: () => [], onSome: node }))

  if (nodes.length === 0) return undefined
  const ids = new Set(nodes.map((item) => item.id))

  // Unknown dependencies are dropped so a typo does not hide the whole graph.
  return {
    title,
    nodes: nodes.map((item) => ({ ...item, deps: item.deps.filter((dep) => ids.has(dep) && dep !== item.id) })),
  }
}


/** How far a plan is: finished tasks of all, and whether a Run would have work (planned tasks, none running). */
export function planProgress(plan: Plan) {
  const total = plan.nodes.length
  const finished = plan.nodes.filter((node) => node.status === "done" || node.status === "verified").length
  const running = plan.nodes.some((node) => node.status === "running")

  return {
    total,
    finished,
    ratio: total ? finished / total : 0,
    runnable: !running && plan.nodes.some((node) => node.status === "planned"),
  }
}

const CHECKBOX: Record<PlanStatus, string> = {
  planned: "[ ]",
  running: "[ ]",
  blocked: "[ ]",
  failed: "[ ]",
  done: "[x]",
  verified: "[x]",
}

/** The plan as a Markdown checklist, for pasting into an issue or a PR: one line per task with its details. */
export function planMarkdown(plan: Plan) {
  const lines = plan.nodes.map((node) => {
    const details = [
      node.agent && `agent: ${node.agent}`,
      node.deps.length > 0 && `after ${node.deps.join(", ")}`,
      node.check && `check: \`${node.check}\``,
      node.status !== "planned" && node.status !== "done" && node.status,
    ].filter(Boolean)

    return `- ${CHECKBOX[node.status]} **${node.id}** ${node.label}${details.length ? ` (${details.join("; ")})` : ""}`
  })

  return [...(plan.title ? [`## ${plan.title}`, ""] : []), ...lines].join("\n")
}

const PLAN_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*(plan|dag|plan-graph)\b[^\n]*\n([\s\S]*?)\n {0,3}\1[ \t]*$/gim

/**
 * Every complete plan block in the given texts, in order, each with a stable key. A plan reprinted under the same title
 * (a `/dag` run updating its statuses) replaces the earlier one in place, so the list holds one entry per plan with its
 * latest state.
 */
export function collectPlans(texts: readonly string[]) {
  const plans: { key: string; plan: Plan }[] = []
  texts.forEach((value, textIndex) =>
    [...value.matchAll(PLAN_FENCE)].forEach((match, blockIndex) => {
      const plan = parsePlan(match[3] ?? "")

      if (!plan) return
      const key = plan.title ? `title:${plan.title}` : `block:${textIndex}:${blockIndex}`
      const existing = plans.findIndex((item) => item.key === key)

      if (existing === -1) plans.push({ key, plan })
      else plans[existing] = { key, plan }
    }),
  )

  return plans
}

/** Places each node in the column after its deepest dependency; a cycle falls back to declaration order. */
export function layoutPlan(plan: Plan): PlanLayout {
  const byID = new Map(plan.nodes.map((node) => [node.id, node]))
  const depth = new Map<string, number>()
  const visiting = new Set<string>()

  const layerOf = (id: string): number => {
    const known = depth.get(id)

    if (known !== undefined) return known

    if (visiting.has(id)) return 0
    visiting.add(id)
    const deps = byID.get(id)?.deps ?? []
    const value = deps.length ? Math.max(...deps.map(layerOf)) + 1 : 0
    visiting.delete(id)
    depth.set(id, value)

    return value
  }

  const rows = new Map<number, number>()

  const nodes = plan.nodes.map((node) => {
    const layer = layerOf(node.id)
    const row = rows.get(layer) ?? 0
    rows.set(layer, row + 1)

    return { ...node, layer, row }
  })

  return {
    nodes,
    layers: Math.max(...nodes.map((node) => node.layer)) + 1,
    rows: Math.max(...rows.values()),
    edges: nodes.flatMap((node) => node.deps.map((dep) => ({ from: dep, to: node.id }))),
  }
}


const CHART_TYPES: readonly ChartType[] = ["bar", "line", "pie"]

export function parseChart(source: string): Chart | undefined {
  const input = Option.getOrUndefined(decodeChart(source))
  const type = CHART_TYPES.find((item) => item === input?.type.trim().toLowerCase())

  if (!input || !type) return undefined

  const series = input.series.flatMap((entry, index) =>
    Option.match(decodeSeries(entry), {
      onNone: () => [],
      onSome: (item) => (item.data.length ? [{ name: clean(item.name) ?? `#${index + 1}`, data: item.data }] : []),
    }),
  )

  if (!series.length) return undefined
  const labels = input.labels ?? []
  const length = Math.max(...series.map((item) => item.data.length))

  return {
    type,
    title: clean(input.title),
    unit: clean(input.unit),
    labels: Array.from({ length }, (_, index) => clean(labels[index]) ?? String(index + 1)),
    series,
  }
}


/** A rounded axis maximum and its tick values, for bar and line charts. */
export function chartTicks(max: number, count = 4) {
  if (max <= 0) return { top: 1, ticks: [0, 1] }
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rough) ?? rough
  const top = Math.ceil(max / step) * step

  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step) }
}
