import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Loader } from "@opencode/ui/loader"
import { Select } from "@opencode/ui/select"
import { TextInput } from "@opencode/ui/text-input"
import { createSignal, For, onCleanup, Show, untrack, type Component, type JSX } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { showToast } from "@/shell/notifications/toast"
import { errorMessage } from "@/shell/layout/helpers"
import { Option } from "effect"
import {
  API_FORMATS,
  customEndpointView,
  FORMAT_PLACEHOLDER,
  decodeModelList,
  initialCustomEndpoint,
  modelIDs,
  transitionCustomEndpoint,
  type ApiFormat,
  type CustomEndpointEffect,
  type CustomEndpointEvent,
} from "./custom-endpoint-machine"

const FORMAT_LABEL: Record<ApiFormat, string> = {
  "openai-chat": "OpenAI Chat Completions",
  "openai-responses": "OpenAI Responses",
  "anthropic-messages": "Anthropic Messages",
}

/** How long a model list may take before the fetch counts as failed. */
const FETCH_TIMEOUT_MS = 15_000

/**
 * Adds a provider of your own: a local or remote endpoint that speaks OpenAI Chat Completions, OpenAI Responses or
 * Anthropic Messages. The models come from the endpoint's list or are typed in; saving writes the provider into the
 * global configuration, and the server offers its models like any other provider's.
 */
export const DialogCustomEndpoint: Component<{
  /** The API the picker entry stands for; it can still be changed in the form. */
  format?: ApiFormat
  onDone?: () => void
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const sdk = useServerSDK()
  const dialog = useDialog()
  const [state, setState] = createSignal(initialCustomEndpoint(untrack(() => props.format)))
  const view = () => customEndpointView(state())
  const controllers = new Set<AbortController>()

  onCleanup(() => controllers.forEach((controller) => controller.abort()))

  const send = (event: CustomEndpointEvent) =>
    untrack(() => {
      const next = transitionCustomEndpoint(state(), event)

      if (next.state !== state()) setState(next.state)
      next.effects.forEach(run)
    })

  const run = (effect: CustomEndpointEffect) => {
    if (effect.type === "fetch") return void fetchModels(effect.attempt, effect.request)

    void sdk.api.experimental.config
      .update({ provider: { id: effect.id, value: effect.value } })
      .then(() => {
        showToast({
          title: language.t("provider.custom.saved.title"),
          description: language.t("provider.custom.saved.description", { name: effect.value.name }),
        })
        props.onDone?.()
        dialog.close()
      })
      .catch((error) => send({ type: "save.failed", message: errorMessage(error, language.t("common.requestFailed")) }))
  }

  const fetchModels = async (attempt: number, request: { url: string; headers: Record<string, string> }) => {
    const controller = new AbortController()
    controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    // The desktop app fetches from its main process, so a local server needs no CORS headers.
    const fetcher = platform.fetch ?? globalThis.fetch

    try {
      const response = await fetcher(request.url, { headers: request.headers, signal: controller.signal })

      if (!response.ok) return send({ type: "fetch.failed", attempt, message: `HTTP ${response.status}` })
      const ids = Option.match(decodeModelList(await response.json()), { onNone: () => [], onSome: modelIDs })

      if (ids.length === 0)
        return send({ type: "fetch.failed", attempt, message: language.t("provider.custom.fetch.empty") })
      send({ type: "fetch.succeeded", attempt, ids })
    } catch (error) {
      send({
        type: "fetch.failed",
        attempt,
        message: controller.signal.aborted
          ? language.t("provider.custom.fetch.timeout")
          : errorMessage(error, language.t("common.requestFailed")),
      })
    } finally {
      clearTimeout(timer)
      controllers.delete(controller)
    }
  }

  const saveError = () => {
    const current = state().save

    return current.status === "failed" ? current.message : undefined
  }

  const fetchStatus = () => {
    const current = state().fetch

    if (current.status === "fetched")
      return language.plural("provider.custom.fetch.done", current.count, { count: String(current.count) })

    if (current.status === "failed") return language.t("provider.custom.fetch.failed", { message: current.message })

    return undefined
  }

  return (
    // The large size fixes the height at 480px; the form grows with its model list instead, up to the window.
    <Dialog size="large" fit containerClass="!h-auto max-h-[calc(100vh-48px)]">
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("provider.custom.title")}
          description={language.t("provider.custom.description")}
        />
      </DialogHeader>
      {/* Grows with its content up to the fields' own maximum, so added models stay in view. */}
      <DialogBody class="flex flex-col px-5 pb-4">
        <div
          data-component="custom-endpoint"
          data-scrollable
          class="flex max-h-[min(62vh,560px)] flex-col gap-4 overflow-y-auto pb-2"
        >
          <Field
            label={language.t("provider.custom.name")}
            hint={view().providerID ? `providers.${view().providerID}` : undefined}
          >
            <TextInput
              class="!w-full"
              value={state().name}
              placeholder={language.t("provider.custom.name.placeholder")}
              onInput={(event) => send({ type: "field.changed", field: "name", value: event.currentTarget.value })}
            />
          </Field>
          <Field label={language.t("provider.custom.format")}>
            <Select
              options={[...API_FORMATS]}
              current={state().format}
              label={(format) => FORMAT_LABEL[format]}
              onSelect={(format) => format && send({ type: "format.changed", format })}
              appearance="base"
              class="!w-full"
            />
          </Field>
          <Field label={language.t("provider.custom.baseURL")}>
            <TextInput
              value={state().baseURL}
              placeholder={FORMAT_PLACEHOLDER[state().format]}
              class="!w-full font-mono"
              onInput={(event) => send({ type: "field.changed", field: "baseURL", value: event.currentTarget.value })}
            />
          </Field>
          <Field label={language.t("provider.custom.apiKey")} hint={language.t("provider.custom.apiKey.hint")}>
            <TextInput
              class="!w-full"
              type="password"
              value={state().apiKey}
              placeholder={language.t("provider.custom.apiKey.placeholder")}
              onInput={(event) => send({ type: "field.changed", field: "apiKey", value: event.currentTarget.value })}
            />
          </Field>
          <Field label={language.t("provider.custom.models")}>
            <div class="flex gap-2">
              <TextInput
                class="min-w-0 flex-1 font-mono"
                value={state().draft}
                placeholder={language.t("provider.custom.models.placeholder")}
                onInput={(event) => send({ type: "field.changed", field: "draft", value: event.currentTarget.value })}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  send({ type: "model.added" })
                }}
              />
              <Button variant="neutral" disabled={!state().draft.trim()} onClick={() => send({ type: "model.added" })}>
                {language.t("provider.custom.models.add")}
              </Button>
              <Button variant="neutral" disabled={!view().canFetch} onClick={() => send({ type: "fetch.requested" })}>
                <Show when={state().fetch.status === "fetching"}>
                  <Loader class="size-3.5" />
                </Show>
                {language.t("provider.custom.models.fetch")}
              </Button>
            </div>
            <Show when={fetchStatus()}>
              {(message) => (
                <p
                  class="text-[12px] leading-[18px]"
                  classList={{
                    "text-v2-text-text-muted": state().fetch.status !== "failed",
                    "text-[var(--v2-state-fg-danger)]": state().fetch.status === "failed",
                  }}
                >
                  {message()}
                </p>
              )}
            </Show>
            <Show
              when={state().models.length > 0}
              fallback={
                <p class="text-[12px] leading-[18px] text-v2-text-text-faint">
                  {language.t("provider.custom.models.empty")}
                </p>
              }
            >
              <ul class="flex max-h-44 flex-col gap-0.5 overflow-y-auto" data-scrollable>
                <For each={state().models}>
                  {(id) => (
                    <li class="flex h-7 items-center gap-2 rounded-md ps-2 pe-1 hover:bg-v2-overlay-simple-overlay-hover">
                      <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-v2-text-text-base">{id}</span>
                      <IconButton
                        icon={<Icon name="xmark-small" size="small" />}
                        variant="ghost"
                        size="small"
                        aria-label={language.t("provider.custom.models.remove", { model: id })}
                        onClick={() => send({ type: "model.removed", id })}
                      />
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Field>
          <Show when={saveError()}>
            {(message) => (
              <p class="text-[12px] leading-[18px] text-[var(--v2-state-fg-danger)]">
                {language.t("provider.custom.save.failed", { message: message() })}
              </p>
            )}
          </Show>
        </div>
        {/* Outside the scrolling fields, so the actions stay in view however many models the list holds. */}
        <div class="flex shrink-0 justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="contrast" disabled={!view().canSave} onClick={() => send({ type: "save.requested" })}>
            <Show when={view().busy}>
              <Loader class="size-3.5" />
            </Show>
            {language.t("provider.custom.save")}
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  )
}

function Field(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <label class="flex flex-col gap-1.5">
      <span class="flex items-baseline gap-2 text-[12px] font-[530] leading-[18px] text-v2-text-text-muted">
        {props.label}
        <Show when={props.hint}>
          <span class="font-[440] text-v2-text-text-faint">{props.hint}</span>
        </Show>
      </span>
      {props.children}
    </label>
  )
}
