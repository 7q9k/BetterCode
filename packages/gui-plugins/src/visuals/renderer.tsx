import { CodeBlock, createKeyed, Panel, type MountedSession, type Plugin } from "@opencode/plugin/gui"
import { showToast } from "@opencode/ui/toast"
import { teamMembers, teamNote } from "./team"
import type VisualsDefinition from "./index"
import { ChartView } from "./chart"
import { collectPlans, parseChart, parsePlan } from "./model"
import { PlanGraph } from "./plan-graph"
import { PlansPanel, sessionTexts } from "./plans-panel"
import { TeamPanel } from "./team-panel"

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
    // Run plan writes the command into the prompt; the user still sends it.
    render: (props) => (
      <PlansPanel session={props.session} t={t} onRun={() => props.screen.composer.setText("/dag plan accepted, go")} />
    ),
  }

  ctx.add(Panel, panel)

  // The Team tab is always there: the agents available in this session and what its subagents are doing.
  const teamTab = {
    id: "team",
    get title() {
      return ctx.t("team.title")
    },
    pinned: true,
  }

  const team: Panel = {
    id: "team",
    region: "side",
    width: 300,
    mobile: {
      get title() {
        return ctx.t("team.title")
      },
      order: 41,
      kind: "menu",
      icon: "outline-steer",
    },
    list: () => [teamTab],
    render: (props) => (
      <TeamPanel
        session={props.session}
        t={t}
        setup={ctx.stores.team.value}
        leadModel={leadModel(props.screen.composer.model())}
        applied={!setupDue(ctx.stores.teamSent(props.session).value?.setup ?? "")}
        onEnabled={(enabled) =>
          ctx.stores.team.update((draft) => {
            draft.enabled = enabled
          })
        }
        onMember={(id, included) =>
          ctx.stores.team.update((draft) => {
            draft.off = included ? draft.off.filter((item) => item !== id) : [...draft.off, id]
          })
        }
        onApply={(members) => void apply(props.session, members)}
        // Picking a member starts a prompt that hands the work to it; the user finishes and sends it.
        onAsk={(name) => props.screen.composer.setText(ctx.t("team.prompt").replace("{{agent}}", name))}
      />
    ),
  }

  const setupKey = () => JSON.stringify(ctx.stores.team.value)

  // Whether a session that last received `last` needs the current setup. The default setup is sent too: most model
  // prompts say nothing about subagents (GPT's even discourage them), so without the note the lead never delegates.
  const setupDue = (last: string) => last !== setupKey()

  const leadModel = (model: { providerID: string; modelID: string; variant?: string } | undefined) =>
    model ? `${model.providerID}/${model.modelID}${model.variant ? ` · ${model.variant}` : ""}` : undefined

  // Sends the setup to the session as a note the lead reads on its next turn; it does not wake an idle session, but a
  // running one takes it at its next step, so the sync below sends it only while the session is idle.
  const apply = async (session: MountedSession, members: Parameters<typeof teamNote>[0]) => {
    const key = setupKey()

    try {
      await session.server.client.session.synthetic({
        sessionID: session.id,
        text: teamNote(members, ctx.stores.team.value),
        description: ctx.t("team.note"),
        resume: false,
      })
      ctx.stores.teamSent(session).set({ setup: key })
    } catch (cause) {
      showToast({
        variant: "error",
        title: ctx.t("team.apply.failed"),
        description: cause instanceof Error ? cause.message : undefined,
      })
    }
  }

  ctx.add(Panel, team)

  // Syncs the routed session with the team setup: when the setup differs from what the session last received, the lead
  // gets the note without the user opening the Team tab. A running session gets it once it settles: a note admitted
  // mid-turn is delivered at the next step boundary and makes the model answer the same prompt a second time, as a new
  // session's first prompt did. Admitted while idle, it waits and reaches the model with the user's next prompt.
  createKeyed(
    () => {
      const session = ctx.sessions.current()
      const sent = session ? ctx.stores.teamSent(session) : undefined
      const agents = session?.server.data.location.agent.list({ directory: session.directory })

      if (!session || !sent?.ready() || !agents?.length) return undefined

      if (session.server.data.session.status(session.id) === "running") return undefined

      return setupDue(sent.value?.setup ?? "") ? { session, key: setupKey(), members: teamMembers(agents) } : undefined
    },
    (due) => {
      if (due) void apply(due.session, due.members)
    },
    { equals: (previous, next) => previous?.session.key === next?.session.key && previous?.key === next?.key },
  )

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
