import { Schema } from "effect"

// A provider of your own: any endpoint that speaks one of three APIs, with its base URL, an optional API key and the
// model IDs to offer. The models can be typed in or fetched from the endpoint's `/models` list. Saving writes the
// provider into the global configuration under `providers`, where the server picks it up like any configured one.

export type ApiFormat = "openai-chat" | "openai-responses" | "anthropic-messages"

export const API_FORMATS: readonly ApiFormat[] = ["openai-chat", "openai-responses", "anthropic-messages"]

/** The AI SDK package the server maps to each API's native implementation. */
export const FORMAT_PACKAGE: Record<ApiFormat, string> = {
  "openai-chat": "@ai-sdk/openai-compatible",
  "openai-responses": "@ai-sdk/openai",
  "anthropic-messages": "@ai-sdk/anthropic",
}

/** A base URL that works for a local server of each API, shown as the field's placeholder. */
export const FORMAT_PLACEHOLDER: Record<ApiFormat, string> = {
  "openai-chat": "http://localhost:11434/v1",
  "openai-responses": "http://localhost:8000/v1",
  "anthropic-messages": "https://api.anthropic.com/v1",
}

export type CustomEndpointField = "name" | "baseURL" | "apiKey" | "draft"

export type CustomEndpointState = {
  readonly name: string
  readonly format: ApiFormat
  readonly baseURL: string
  readonly apiKey: string
  readonly models: readonly string[]
  /** The model ID being typed, added with Enter or the add button. */
  readonly draft: string
  readonly attempt: number
  readonly fetch:
    | { readonly status: "idle" }
    | { readonly status: "fetching"; readonly attempt: number }
    | { readonly status: "fetched"; readonly count: number }
    | { readonly status: "failed"; readonly message: string }
  readonly save:
    | { readonly status: "idle" }
    | { readonly status: "saving" }
    | { readonly status: "failed"; readonly message: string }
}

export type CustomEndpointEvent =
  | { readonly type: "field.changed"; readonly field: CustomEndpointField; readonly value: string }
  | { readonly type: "format.changed"; readonly format: ApiFormat }
  | { readonly type: "model.added" }
  | { readonly type: "model.removed"; readonly id: string }
  | { readonly type: "fetch.requested" }
  | { readonly type: "fetch.succeeded"; readonly attempt: number; readonly ids: readonly string[] }
  | { readonly type: "fetch.failed"; readonly attempt: number; readonly message: string }
  | { readonly type: "save.requested" }
  | { readonly type: "save.failed"; readonly message: string }

export type CustomEndpointEffect =
  | { readonly type: "fetch"; readonly attempt: number; readonly request: ModelsRequest }
  | { readonly type: "save"; readonly id: string; readonly value: ProviderEntry }

export type ModelsRequest = { readonly url: string; readonly headers: Record<string, string> }

/** Where the provider's requests go, and the key they carry when the server needs one. */
export type ProviderSettings = { baseURL: string; apiKey?: string }

/** The entry written under `providers.<id>` in the global configuration. */
export type ProviderEntry = {
  readonly name: string
  readonly package: string
  readonly settings: ProviderSettings
  readonly models: Record<string, { readonly name: string }>
}

export const initialCustomEndpoint = (format: ApiFormat = "openai-chat"): CustomEndpointState => ({
  name: "",
  format,
  baseURL: "",
  apiKey: "",
  models: [],
  draft: "",
  attempt: 0,
  fetch: { status: "idle" },
  save: { status: "idle" },
})

/** The next state and the work it starts; an event that does not apply returns the same state object. */
export type CustomEndpointTransition = {
  readonly state: CustomEndpointState
  readonly effects: readonly CustomEndpointEffect[]
}

export function transitionCustomEndpoint(
  state: CustomEndpointState,
  event: CustomEndpointEvent,
): CustomEndpointTransition {
  const same: CustomEndpointTransition = { state, effects: [] }

  if (state.save.status === "saving" && event.type !== "save.failed") return same

  if (event.type === "field.changed") return to({ ...state, [event.field]: event.value })

  if (event.type === "format.changed") return to({ ...state, format: event.format })

  if (event.type === "model.added") {
    const id = state.draft.trim()

    if (!id) return same

    return to({ ...state, models: addModels(state.models, [id]), draft: "" })
  }

  if (event.type === "model.removed")
    return to({ ...state, models: state.models.filter((model) => model !== event.id) })

  if (event.type === "fetch.requested") {
    if (!customEndpointView(state).canFetch) return same
    const attempt = state.attempt + 1

    return to({ ...state, attempt, fetch: { status: "fetching", attempt } }, [
      { type: "fetch", attempt, request: modelsRequest(state) },
    ])
  }

  // A fetch the user started again, or one for settings changed since, no longer applies.
  if (event.type === "fetch.succeeded" || event.type === "fetch.failed") {
    if (state.fetch.status !== "fetching" || state.fetch.attempt !== event.attempt) return same

    if (event.type === "fetch.failed") return to({ ...state, fetch: { status: "failed", message: event.message } })

    return to({
      ...state,
      models: addModels(state.models, event.ids),
      fetch: { status: "fetched", count: event.ids.length },
    })
  }

  if (event.type === "save.requested") {
    const view = customEndpointView(state)

    if (!view.canSave) return same

    return to({ ...state, save: { status: "saving" } }, [
      { type: "save", id: view.providerID, value: providerEntry(state) },
    ])
  }

  return to({ ...state, save: { status: "failed", message: event.message } })
}

function to(state: CustomEndpointState, effects: readonly CustomEndpointEffect[] = []): CustomEndpointTransition {
  return { state, effects }
}

/** What the form shows and allows. */
export function customEndpointView(state: CustomEndpointState) {
  const providerID = providerIDFor(state.name)
  const validURL = isHttpURL(state.baseURL.trim())
  const busy = state.save.status === "saving"

  return {
    providerID,
    validURL,
    busy,
    canFetch: validURL && state.fetch.status !== "fetching" && !busy,
    canSave: !!providerID && validURL && state.models.length > 0 && !busy,
  }
}

/** A provider ID from its display name: lowercase words joined by dashes, as the config patch requires. */
export function providerIDFor(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

/** The request listing the endpoint's models: OpenAI-style APIs take a bearer token, Anthropic an `x-api-key`. */
export function modelsRequest(state: Pick<CustomEndpointState, "format" | "baseURL" | "apiKey">): ModelsRequest {
  const key = state.apiKey.trim()
  const url = `${state.baseURL.trim().replace(/\/+$/, "")}/models`

  const headers: Record<string, string> = {}

  if (state.format === "anthropic-messages") headers["anthropic-version"] = "2023-06-01"

  if (key && state.format === "anthropic-messages") headers["x-api-key"] = key

  if (key && state.format !== "anthropic-messages") headers.authorization = `Bearer ${key}`

  return { url, headers }
}

/** The model lists the supported APIs answer with: OpenAI and Anthropic as `data[].id`, Ollama's native API as `models[].name`. */
export const ModelList = Schema.Union([
  Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String })) }),
  Schema.Struct({ models: Schema.Array(Schema.Struct({ name: Schema.String })) }),
])

export type ModelList = typeof ModelList.Type

/** Parses a `/models` answer at the network boundary; anything else is not a model list. */
export const decodeModelList = Schema.decodeUnknownOption(ModelList)

/** The model IDs in a parsed model list. */
export function modelIDs(list: ModelList): string[] {
  if ("data" in list) return list.data.map((item) => item.id)

  return list.models.map((item) => item.name)
}

function providerEntry(state: CustomEndpointState): ProviderEntry {
  const key = state.apiKey.trim()
  const settings: ProviderSettings = { baseURL: state.baseURL.trim().replace(/\/+$/, "") }

  if (key) settings.apiKey = key

  return {
    name: state.name.trim(),
    package: FORMAT_PACKAGE[state.format],
    settings,
    models: Object.fromEntries(state.models.map((id) => [id, { name: id }])),
  }
}

function addModels(current: readonly string[], ids: readonly string[]) {
  return [...new Set([...current, ...ids.flatMap((id) => (id.trim() ? [id.trim()] : []))])]
}

function isHttpURL(value: string) {
  try {
    const url = new URL(value)

    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
