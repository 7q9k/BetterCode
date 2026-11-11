import { CodeBlock, createKeyed, Panel, type MountedSession, type Plugin } from "@opencode/plugin/gui"
import type VisualsDefinition from "./index"
import { ChartView } from "./chart"
import { collectPlans, parseChart, parsePlan } from "./model"
import { PlanGraph } from "./plan-graph"
import { PlansPanel, sessionTexts } from "./plans-panel"

const PLANS_TAB = "plans"

/**
 * Richer displays for the session: ```plan blocks become a task graph in the timeline and in a Plans tab of the side
 * panel (after oh-my-hermes), and ```chart blocks become charts. A block that does not parse keeps its source. Mermaid
 * diagrams are built into Markdown already.
 */
const setup: Plugin.Setup<typeof VisualsDefinition> = (ctx) => {
  const t = (key: Parameters<typeof ctx.t>[0]) => ctx.t(key)

  ctx.add(CodeBlock, {
    languages: ["plan", "dag", "plan-graph"],
    render: (props) => {
      const plan = parsePlan(props.code)

      if (!plan) return undefined

      return <PlanGraph plan={plan} t={t} />
    },
  })

  ctx.add(CodeBlock, {
    languages: ["chart"],
    render: (props) => {
      const chart = parseChart(props.code)

      if (!chart) return undefined

      return <ChartView chart={chart} />
    },
  })

  // One stable tab object, so the host never remounts its trigger; the getter follows the language.
  const tab = {
    id: PLANS_TAB,
    get title() {
      return ctx.t("plans.title")
    },
    closable: "hover" as const,
  }

  // The Plans tab is listed while the session has a plan, or while the user keeps it open.
  const panel: Panel = {
    id: "plans",
    region: "side",
    width: 300,
    // On narrow screens the side region folds into the view switcher; Plans sits in its More menu.
    mobile: {
      get title() {
        return ctx.t("plans.title")
      },
      order: 40,
      kind: "menu",
      icon: "outline-steer",
    },
    list: (input) => {
      const has = collectPlans(sessionTexts(input.session)).length > 0

      if (!has && !input.open.includes(PLANS_TAB)) return []

      return [tab]
    },
    render: (props) => <PlansPanel session={props.session} t={t} />,
  }

  ctx.add(Panel, panel)

  // Syncs the side layout with the session's plans: opens the Plans tab, without moving the user, when the routed
  // session gets a new plan. The first look at a session only records its count, so revisiting it reopens nothing.
  const seen = new Map<string, number>()
  createKeyed(
    (): { session: MountedSession; count: number } | undefined => {
      const session = ctx.sessions.current()

      if (!session) return undefined

      return { session, count: collectPlans(sessionTexts(session)).length }
    },
    (current) => {
      if (!current) return
      const before = seen.get(current.session.key)
      seen.set(current.session.key, current.count)

      if (before === undefined || current.count <= before) return
      ctx.layout.open(`${ctx.id}:${PLANS_TAB}`, current.session, { tab: "select", background: true })
    },
    {
      equals: (previous, next) => previous?.session.key === next?.session.key && previous?.count === next?.count,
    },
  )
}

export default setup
