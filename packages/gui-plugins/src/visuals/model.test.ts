import { describe, expect, test } from "bun:test"
import { chartTicks, collectPlans, layoutPlan, parseChart, parsePlan } from "./model"

describe("parsePlan", () => {
  test.each([["not json"], ["{}"], ['{"nodes": []}'], ['{"nodes": [{"label": "no id"}]}']])(
    "keeps the source for %p",
    (source) => expect(parsePlan(source)).toBeUndefined(),
  )

  test("reads the oh-my-hermes field names and normalises statuses", () => {
    const plan = parsePlan(
      JSON.stringify({
        title: "Ship it",
        nodes: [
          { id: "T1", task: "First", status: "completed", write_scope: "a.ts" },
          { id: "T2", title: "Second", depends_on: ["T1", "missing", "T2"], status: "in_progress" },
        ],
      }),
    )

    expect(plan?.nodes.map((node) => [node.id, node.label, node.status, node.deps, node.writes])).toEqual([
      ["T1", "First", "done", [], ["a.ts"]],
      ["T2", "Second", "running", ["T1"], []],
    ])
  })
})

describe("collectPlans", () => {
  const block = (title: string, status: string) =>
    "```plan\n" + JSON.stringify({ title, nodes: [{ id: "T1", status }] }) + "\n```"

  test("keeps one entry per plan title with its latest statuses, in first-seen order", () => {
    const plans = collectPlans([
      `intro\n${block("A", "planned")}`,
      `${block("B", "planned")}\ntext\n${block("A", "running")}`,
      block("A", "verified"),
    ])

    expect(plans.map((item) => [item.plan.title, item.plan.nodes[0]?.status])).toEqual([
      ["A", "verified"],
      ["B", "planned"],
    ])
  })

  test("ignores other languages, unclosed fences and blocks that do not parse", () => {
    expect(collectPlans(["```json\n{}\n```", "```plan\n{oops}\n```", "```plan\n" + '{"nodes":[{"id":"x"}]}'])).toEqual(
      [],
    )
  })
})

describe("layoutPlan", () => {
  test("puts each node one column after its deepest dependency and stacks a column", () => {
    const plan = parsePlan(
      JSON.stringify([
        { id: "A" },
        { id: "B", deps: ["A"] },
        { id: "C", deps: ["A"] },
        { id: "V", deps: ["B", "C"] },
      ]),
    )!

    const layout = layoutPlan(plan)
    expect(layout.nodes.map((node) => [node.id, node.layer, node.row])).toEqual([
      ["A", 0, 0],
      ["B", 1, 0],
      ["C", 1, 1],
      ["V", 2, 0],
    ])
    expect([layout.layers, layout.rows, layout.edges.length]).toEqual([3, 2, 4])
  })

  test("survives a dependency cycle", () => {
    const layout = layoutPlan(parsePlan(JSON.stringify([{ id: "A", deps: ["B"] }, { id: "B", deps: ["A"] }]))!)
    expect(layout.nodes).toHaveLength(2)
  })
})

describe("parseChart", () => {
  test.each([['{"type":"radar","series":[{"data":[1]}]}'], ['{"type":"bar","series":[{"data":[1,"x"]}]}'], ["[]"]])(
    "keeps the source for %p",
    (source) => expect(parseChart(source)).toBeUndefined(),
  )

  test("fills missing labels from the longest series", () => {
    expect(parseChart('{"type":"line","labels":["a"],"series":[{"data":[1,2,3]}]}')?.labels).toEqual(["a", "2", "3"])
  })

  test("rounds the axis up to a readable step", () => {
    expect(chartTicks(87)).toEqual({ top: 100, ticks: [0, 25, 50, 75, 100] })
  })
})
