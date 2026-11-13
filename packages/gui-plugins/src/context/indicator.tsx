import { Show, createMemo, type ComponentProps, type JSX } from "solid-js"
import { ProgressCircle } from "@opencode/ui/progress-circle"
import { Button } from "@opencode/ui/button"
import { Menu } from "@opencode/ui/menu"
import { Tooltip } from "@opencode/ui/tooltip"
import { useI18n } from "@opencode/ui/context/i18n"
import { lastAssistantWithUsage } from "@opencode/client/solid"
import { usePlugin, type ComposerModel, type MountedSession, type SessionScreen } from "@opencode/plugin/gui"
import { catalogModel, syncCatalog } from "./catalog"

/**
 * A session's usage, shared by the header indicator and the bar under the composer: the context the latest answer
 * filled (its tokens by kind, the model's limit and the share of it), what the session family has cost, and whether
 * the cost is worth showing. The limit is the one of `selected`, the model the composer sends the next prompt with,
 * so picking another model updates it at once; without one it is the limit of the model that wrote the answer.
 */
export function createSessionUsage(
  session: () => MountedSession,
  active: () => boolean,
  selected: () => ComposerModel | undefined = () => undefined,
) {
  const catalog = syncCatalog(session, active)

  const messages = createMemo(() => (session().id ? session().server.data.session.message.list(session().id) : []))

  const info = createMemo(() => (session().id ? session().server.data.session.get(session().id) : undefined))

  // Same step as the TUI: after the last completed compaction and before an undo boundary.
  const context = createMemo(() => {
    const message = lastAssistantWithUsage(messages(), info()?.revert?.messageID)

    if (!message) return
    const next = selected()
    const model = catalogModel(session(), next ? { providerID: next.providerID, id: next.modelID } : message.model)?.model

    const total =
      message.tokens.input +
      message.tokens.output +
      message.tokens.reasoning +
      message.tokens.cache.read +
      message.tokens.cache.write

    return {
      total,
      tokens: message.tokens,
      limit: model?.limit.context || undefined,
      usage: model?.limit.context ? Math.round((total / model.limit.context) * 100) : null,
    }
  })

  // A root session's cost includes its subagent sessions, as in the TUI.
  const spent = createMemo(() => (session().id ? session().server.data.session.cost(session().id) : 0))

  // Spend anywhere in the family keeps the cost visible, even when this session's model is free.
  const showCost = createMemo(() => {
    if (spent() > 0) return true
    const ref = info()?.model ?? messages().findLast((item) => item.type === "assistant")?.model
    const model = ref ? catalogModel(session(), ref)?.model : undefined

    if (!model) return true

    return model.cost.some((cost) => cost.input > 0 || cost.output > 0 || cost.cache.read > 0 || cost.cache.write > 0)
  })

  return { catalog, context, spent, showCost }
}

export function SessionContextUsage(props: {
  session: MountedSession
  /** False while the session's view is detached; it loads nothing until selected again. */
  active?: boolean
  variant?: "button" | "indicator"
  placement?: ComponentProps<typeof Tooltip>["placement"]
  /** The button shows only its ring and opens the usage in a menu, so a narrow header keeps room for the title. */
  compact?: boolean
  /** The session's screen, whose composer model sets the context limit; without it, the answering model's. */
  screen?: SessionScreen
}) {
  const ctx = usePlugin()
  const layout = ctx.layout
  const i18n = useI18n()

  const usage = createSessionUsage(
    () => props.session,
    () => props.active !== false,
    () => props.screen?.composer.model(),
  )

  const catalog = usage.catalog
  const context = usage.context
  const showCost = usage.showCost
  const variant = createMemo(() => props.variant ?? "button")

  const tokens = createMemo(() =>
    new Intl.NumberFormat(i18n.locale(), { notation: "compact", maximumFractionDigits: 0 })
      .format(context()?.total ?? 0)
      .toLocaleLowerCase(i18n.locale()),
  )

  const cost = createMemo(() =>
    new Intl.NumberFormat(i18n.locale(), { style: "currency", currency: "USD" }).format(usage.spent()),
  )

  const openContext = () => {
    if (!props.session.id) return
    catalog.retry()
    layout.toggle(`${ctx.id}:main`, props.session)
  }

  const viewContext = () => {
    if (!props.session.id) return
    catalog.retry()
    layout.open(`${ctx.id}:main`, props.session)
  }

  const circle = () => (
    <div class="flex items-center justify-center">
      <ProgressCircle
        appearance="indicator"
        size={16}
        strokeWidth={2}
        percentage={context()?.usage ?? 0}
        style={{
          "--progress-circle-background": "var(--v2-background-bg-layer-04)",
          "--progress-circle-background-overlay": "var(--v2-overlay-simple-overlay-pressed, transparent)",
          "--progress-circle-progress": "var(--v2-icon-icon-base, var(--icon-base))",
        }}
      />
    </div>
  )

  const compactCircle = () => (
    <div class="flex items-center justify-center">
      <ProgressCircle appearance="compact" size={16} percentage={context()?.usage ?? 0} />
    </div>
  )

  const menuRow = (name: JSX.Element, value: JSX.Element) => (
    <div class="flex h-7 min-w-0 items-center gap-4 px-3 text-[13px] font-[440] leading-[var(--line-height-compact)] tracking-[-0.04px]">
      <span class="shrink-0 text-v2-text-text-muted">{name}</span>
      <span class="ml-auto min-w-0 truncate text-right tabular-nums text-v2-text-text-base">{value}</span>
    </div>
  )

  const usageMenu = () => (
    <Menu
      placement="bottom-end"
      gutter={4}
      modal={false}
      onOpenChange={(open) => {
        if (open) catalog.retry()
      }}
    >
      <Tooltip value={ctx.t("usage.view")} placement={props.placement ?? "top"}>
        <Menu.Trigger
          as={Button}
          type="button"
          variant="ghost-muted"
          class="group shrink-0"
          style={{ padding: "0 6px", color: "var(--v2-text-text-faint)" }}
          aria-label={ctx.t("usage.view")}
        >
          {compactCircle()}
        </Menu.Trigger>
      </Tooltip>
      <Menu.Portal>
        <Menu.Content class="w-[200px] max-w-[calc(100vw-16px)]" aria-label={ctx.t("usage.view")}>
          {menuRow(ctx.t("usage.tokens"), context()?.total.toLocaleString(i18n.locale()) ?? "0")}
          <Show when={showCost()}>{menuRow(ctx.t("usage.cost"), cost())}</Show>
          {menuRow(ctx.t("usage.usage"), `${context()?.usage ?? 0}%`)}
          <Menu.Separator />
          <Menu.Item onSelect={viewContext}>{ctx.t("usage.view")}</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )

  return (
    <Show when={props.session.id}>
      <Show when={!props.compact} fallback={usageMenu()}>
        <Show
          when={variant() === "indicator"}
          fallback={
            <Tooltip value={ctx.t("usage.toggle")} placement={props.placement ?? "top"}>
              <Button
                type="button"
                variant="ghost-muted"
                class="group shrink-0"
                style={{ padding: "0 6px", color: "var(--v2-text-text-faint)" }}
                onClick={openContext}
                aria-expanded={layout.state(`${ctx.id}:main`, props.session) === "visible"}
                aria-label={ctx.t("usage.toggle")}
              >
                <span class="flex items-center gap-2 whitespace-nowrap group-active:text-v2-text-text-muted">
                  {compactCircle()}
                  <span>{tokens()}</span>
                  <Show when={showCost()}>
                    <span aria-hidden="true" class="flex w-1.5 shrink-0 items-center justify-center">
                      ·
                    </span>
                    <span>{cost()}</span>
                  </Show>
                </span>
              </Button>
            </Tooltip>
          }
        >
          {circle()}
        </Show>
      </Show>
    </Show>
  )
}
