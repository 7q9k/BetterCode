import { describe, expect, test } from "bun:test"
import {
  memberActive,
  memberWork,
  runDuration,
  teamLoad,
  teamMembers,
  teamNote,
  teamRuns,
  teamLayout,
  teamStage,
  wrapText,
  LINGER,
  type AgentInput,
  type TeamRun,
  type ToolInput,
} from "./team"

const agent = (id: string, mode: AgentInput["mode"], extra: Partial<AgentInput> = {}): AgentInput => ({
  id,
  name: id,
  mode,
  hidden: false,
  permissions: [],
  ...extra,
})

const tool = (id: string, extra: Partial<ToolInput>): ToolInput => ({
  id,
  name: "subagent",
  status: "completed",
  input: {},
  created: 0,
  ...extra,
})

describe("teamMembers", () => {
  test("hides hidden agents, assigns roles from mode and permissions, and lists leads first", () => {
    const members = teamMembers([
      agent("reviewer", "subagent", { permissions: [{ action: "*", resource: "*", effect: "deny" }] }),
      agent("title", "primary", { hidden: true }),
      agent("general", "subagent", { permissions: [{ action: "question", resource: "*", effect: "deny" }] }),
      agent("build", "primary"),
    ])

    expect(members.map((member) => [member.id, member.role])).toEqual([
      ["build", "lead"],
      ["general", "writer"],
      ["reviewer", "read-only"],
    ])
  })
})

describe("teamRuns", () => {
  test("reads subagent and task calls newest first, skips other tools and calls still streaming", () => {
    const runs = teamRuns([
      tool("a", { input: { agent: "reviewer", description: "Review diff" }, created: 10, completed: 40 }),
      tool("b", { name: "shell", input: { command: "ls" }, created: 20 }),
      tool("c", { name: "task", status: "running", input: { subagent_type: "tester", prompt: "Write tests\nmore" }, created: 30 }),
      tool("d", { status: "streaming", input: '{"agent":', created: 35 }),
      tool("e", { status: "error", input: "not an object", created: 5 }),
    ])

    expect(runs.map((run) => [run.id, run.agent, run.task, run.status])).toEqual([
      ["c", "tester", "Write tests", "running"],
      ["a", "reviewer", "Review diff", "done"],
      ["e", "general", "general", "failed"],
    ])
    expect(teamLoad(runs).get("tester")).toEqual({ running: 1, done: 0, failed: 0 })
  })
})

describe("runDuration", () => {
  test.each([
    { ended: 42_000, now: 0, label: "42s" },
    { ended: 125_000, now: 0, label: "2m 5s" },
    { ended: undefined, now: 9_400, label: "9s" },
  ])("$label", ({ ended, now, label }) => {
    expect(runDuration({ id: "x", agent: "a", task: "t", status: "done", started: 0, ended }, now)).toBe(label)
  })
})

describe("team setup", () => {
  const members = teamMembers([
    agent("build", "primary"),
    agent("tester", "subagent"),
    agent("reviewer", "subagent", { permissions: [{ action: "*", resource: "*", effect: "deny" }] }),
  ])

  const byId = (id: string) => members.find((member) => member.id === id)!

  test("the lead always works; others only while the team is on and they are selected", () => {
    expect(memberActive(byId("build"), { enabled: false, off: ["build"] })).toBe(true)
    expect(memberActive(byId("tester"), { enabled: true, off: [] })).toBe(true)
    expect(memberActive(byId("tester"), { enabled: true, off: ["tester"] })).toBe(false)
    expect(memberActive(byId("tester"), { enabled: false, off: [] })).toBe(false)
  })

  test("a member's work is its running task, else its latest one", () => {
    const runs = teamRuns([
      tool("old", { input: { agent: "tester", description: "First" }, created: 1 }),
      tool("new", { input: { agent: "Tester", description: "Second" }, created: 2, status: "running" }),
    ])

    expect(memberWork(byId("tester"), runs)?.task).toBe("Second")
    expect(memberWork(byId("reviewer"), runs)).toBeUndefined()
  })

  test("the note names allowed and excluded agents, or tells the lead to work alone", () => {
    const note = teamNote(members, { enabled: true, off: ["reviewer"] })
    expect(note).toContain("start one subagent per part in the same message")
    expect(note).toContain("- tester (can edit)")
    expect(note).toContain("Do not use: reviewer.")
    expect(note).not.toContain("- build")
    expect(teamNote(members, { enabled: false, off: [] })).toContain("turned the agent team OFF")
    expect(teamNote(members, { enabled: true, off: ["tester", "reviewer"] })).toContain("turned the agent team OFF")
  })
})

describe("team graph", () => {
  const run = (id: string, extra: Partial<TeamRun>): TeamRun => ({
    id,
    agent: id,
    task: id,
    status: "running",
    started: 0,
    ...extra,
  })

  test("running agents stay, finished ones fade out and then leave", () => {
    const runs = [
      run("late", { started: 20 }),
      run("done", { status: "done", started: 10, ended: 1000 }),
      run("failed", { status: "failed", started: 5, ended: 1000 }),
    ]

    expect(teamStage(runs, 2000).map((item) => item.id)).toEqual(["failed", "done", "late"])
    expect(teamStage(runs, 1000 + LINGER.done - 100).find((item) => item.id === "done")?.leaving).toBe(true)
    expect(teamStage(runs, 1000 + LINGER.done).map((item) => item.id)).toEqual(["failed", "late"])
    expect(teamStage(runs, 1000 + LINGER.failed).map((item) => item.id)).toEqual(["late"])
  })

  test("cards fill two columns and centre an odd last one", () => {
    expect(teamLayout(1).cards).toEqual([{ x: 150, y: 118 }])
    expect(teamLayout(3).cards.map((card) => card.x)).toEqual([78, 222, 150])
    expect(teamLayout(3).height).toBeGreaterThan(teamLayout(2).height)
  })

  test("task text wraps at spaces and ends with an ellipsis when cut", () => {
    expect(wrapText("review the parser changes", 12, 2)).toEqual(["review the", "parser…"])
    expect(wrapText("short", 12, 2)).toEqual(["short"])
  })
})

describe("subagent runs follow their own session", () => {
  const call = (child: ToolInput["child"]): ToolInput => ({
    id: "call",
    name: "subagent",
    status: "completed",
    input: { agent: "explore", description: "Count files" },
    created: 1,
    completed: 2,
    child,
  })

  test("a returned call whose session still works is running, and ends when the session goes idle", () => {
    expect(teamRuns([call({ running: true, failed: false })])[0]).toMatchObject({ status: "running", ended: undefined })
    expect(teamRuns([call({ running: false, ended: 900, failed: false })])[0]).toMatchObject({ status: "done", ended: 900 })
    expect(teamRuns([call({ running: false, ended: 900, failed: true })])[0]?.status).toBe("failed")
    expect(teamRuns([call(undefined)])[0]).toMatchObject({ status: "done", ended: 2 })
  })
})
