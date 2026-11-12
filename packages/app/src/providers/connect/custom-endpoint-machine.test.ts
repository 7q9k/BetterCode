import { describe, expect, test } from "bun:test"
import { Option } from "effect"
import {
  customEndpointView,
  decodeModelList,
  initialCustomEndpoint,
  modelIDs,
  modelsRequest,
  providerIDFor,
  transitionCustomEndpoint,
  type CustomEndpointEvent,
  type CustomEndpointState,
  type CustomEndpointTransition,
} from "./custom-endpoint-machine"

const run = (events: CustomEndpointEvent[], state: CustomEndpointState = initialCustomEndpoint()) => {
  const start: CustomEndpointTransition = { state, effects: [] }

  return events.reduce((current, event) => {
    const next = transitionCustomEndpoint(current.state, event)

    return { state: next.state, effects: [...current.effects, ...next.effects] }
  }, start)
}

const filled: CustomEndpointEvent[] = [
  { type: "field.changed", field: "name", value: "Local LLM" },
  { type: "field.changed", field: "baseURL", value: "http://localhost:11434/v1/" },
]

describe("custom endpoint", () => {
  test("saves the provider entry for the chosen API, with typed and fetched models", () => {
    const fetched = run([...filled, { type: "fetch.requested" }])
    expect(fetched.effects).toEqual([
      { type: "fetch", attempt: 1, request: { url: "http://localhost:11434/v1/models", headers: {} } },
    ])

    const saved = run(
      [
        { type: "fetch.succeeded", attempt: 1, ids: ["qwen3-coder", "llama3.3"] },
        { type: "field.changed", field: "draft", value: " my-model " },
        { type: "model.added" },
        { type: "format.changed", format: "anthropic-messages" },
        { type: "field.changed", field: "apiKey", value: "sk-test" },
        { type: "save.requested" },
      ],
      fetched.state,
    )

    expect(saved.state.save.status).toBe("saving")
    expect(saved.effects).toEqual([
      {
        type: "save",
        id: "local-llm",
        value: {
          name: "Local LLM",
          package: "@ai-sdk/anthropic",
          settings: { baseURL: "http://localhost:11434/v1", apiKey: "sk-test" },
          models: {
            "qwen3-coder": { name: "qwen3-coder" },
            "llama3.3": { name: "llama3.3" },
            "my-model": { name: "my-model" },
          },
        },
      },
    ])
  })

  test("ignores the result of a fetch the user started again", () => {
    const twice = run([
      ...filled,
      { type: "fetch.requested" },
      { type: "fetch.failed", attempt: 1, message: "offline" },
      { type: "fetch.requested" },
    ])

    const stale = run([{ type: "fetch.succeeded", attempt: 1, ids: ["old"] }], twice.state)

    expect(stale.state.models).toEqual([])
    expect(run([{ type: "fetch.succeeded", attempt: 2, ids: ["new"] }], twice.state).state.models).toEqual(["new"])
  })

  test("needs a name, an http URL and a model before it saves", () => {
    expect(customEndpointView(run(filled).state).canSave).toBe(false)
    expect(run([{ type: "field.changed", field: "baseURL", value: "file:///tmp" }]).state.baseURL).toBe("file:///tmp")
    expect(
      customEndpointView(run([{ type: "field.changed", field: "baseURL", value: "file:///tmp" }]).state).canFetch,
    ).toBe(false)
    expect(run([...filled, { type: "save.requested" }]).effects).toEqual([])
  })

  test("a failed save keeps the form and can be retried", () => {
    const ready = run([
      ...filled,
      { type: "field.changed", field: "draft", value: "m" },
      { type: "model.added" },
      { type: "save.requested" },
    ])

    const failed = run([{ type: "save.failed", message: "disk full" }], ready.state)

    expect(failed.state.save).toEqual({ status: "failed", message: "disk full" })
    expect(run([{ type: "save.requested" }], failed.state).effects).toHaveLength(1)
  })
})

test("model list requests and answers for each API", () => {
  expect(modelsRequest({ format: "openai-chat", baseURL: "https://x.test/v1", apiKey: "k" }).headers).toEqual({
    authorization: "Bearer k",
  })
  expect(modelsRequest({ format: "anthropic-messages", baseURL: "https://x.test/v1", apiKey: "k" }).headers).toEqual({
    "anthropic-version": "2023-06-01",
    "x-api-key": "k",
  })
  // Answers as servers send them, including fields the list does not need and bodies that are not lists at all.
  expect(
    Option.map(decodeModelList({ object: "list", data: [{ id: "a", owned_by: "me" }, { id: "b" }] }), modelIDs),
  ).toEqual(Option.some(["a", "b"]))
  expect(Option.map(decodeModelList({ models: [{ name: "qwen3:8b", size: 1 }] }), modelIDs)).toEqual(
    Option.some(["qwen3:8b"]),
  )
  expect(Option.isNone(decodeModelList({ data: [{ nope: 1 }] }))).toBe(true)
  expect(Option.isNone(decodeModelList("nonsense"))).toBe(true)
  expect(providerIDFor("  Mein Server (lokal)! ")).toBe("mein-server-lokal")
})
