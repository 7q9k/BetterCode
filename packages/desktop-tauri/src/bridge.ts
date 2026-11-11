// The desktop renderer's IPC transport for the Tauri shell. Vite resolves the renderer's `ipc-client` to this module
// (see vite.config.ts), so api.ts, plugins.ts and every screen above them run unchanged. It also fills in what
// Electron's preload provides (`window.electron`) and, on Windows, draws the caption buttons Electron's title bar
// overlay draws natively.

import { invoke as tauriInvoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { mountWindowControls, setWindowControlsMode, setWindowControlsZoom } from "./window-controls"

type DesktopEvent = { readonly _tag: string }

const current = getCurrentWebviewWindow()

const label = current.label

const listeners = new Map<string, Set<(value: DesktopEvent) => void>>()

const beforeDispose = new Set<() => Promise<unknown> | void>()

// The Rust side sends each window its own events (`emit_event` in src-tauri/src/lib.rs).
void current.listen<DesktopEvent>("desktop-event", (event) =>
  listeners.get(event.payload._tag)?.forEach((listener) => listener(revive(event.payload) as DesktopEvent)),
)

window.addEventListener(
  "pagehide",
  () => void Promise.allSettled([...beforeDispose].map((callback) => callback())),
  { once: true },
)

const snapshot = request<{ storage: Record<string, unknown>; plugins?: unknown[] }>("WindowSnapshot", {
  names: ["opencode.global.dat", "default.dat", `opencode.window.${label.replace(/[^a-zA-Z0-9._-]/g, "-")}.dat`],
}).catch(() => ({ storage: {}, plugins: undefined }))

// What Electron's preload exposes. A Tauri window has no path for a dropped File, so drops fall back to the
// browser's handling, as in the web app.
Object.assign(window, {
  electron: {
    windowID: label,
    bootstrap: { id: label, packaged: !import.meta.env.DEV },
    storageSnapshot: snapshot.then((value) => value.storage),
    plugins: snapshot.then((value) => value.plugins),
    getPathForFile: () => "",
  },
})

if (navigator.userAgent.includes("Windows")) mountWindowControls()

export function onBeforeDispose(callback: () => Promise<unknown> | void) {
  beforeDispose.add(callback)

  return () => beforeDispose.delete(callback)
}

export function invoke<Value = unknown>(tag: string, payload?: unknown): Promise<Value> {
  return request<Value>(tag, payload ?? null)
}

export function send(tag: string, payload?: unknown) {
  void invoke(tag, payload).catch(() => undefined)
}

/** Like `invoke`; aborting rejects at once. The Rust side finishes the call, whose answer is then dropped. */
export function cancellable<Value = unknown>(tag: string, payload: unknown, signal: AbortSignal | undefined) {
  if (signal?.aborted) return Promise.reject(signal.reason)
  const call = invoke<Value>(tag, payload)

  if (!signal) return call

  return new Promise<Value>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    call.then(resolve, reject)
  })
}

export function listen<Value extends DesktopEvent>(tag: string, listener: (value: Value) => void) {
  const callback = listener as (value: DesktopEvent) => void
  const callbacks = listeners.get(tag) ?? new Set()
  callbacks.add(callback)
  listeners.set(tag, callbacks)

  return () => {
    callbacks.delete(callback)

    if (callbacks.size === 0) listeners.delete(tag)
  }
}

async function request<Value>(tag: string, payload: unknown) {
  // Edit actions act on this document's selection, which only the page itself can reach.
  if (tag === "MenuRunAction" && editAction(payload)) return undefined as Value

  // The caption buttons are drawn by this page, so they follow the title bar's appearance and the page zoom here.
  if (tag === "WindowSetTitlebar") setWindowControlsMode((payload as { theme: { mode: "light" | "dark" } }).theme.mode)

  if (tag === "WindowSetZoomFactor") setWindowControlsZoom((payload as { factor: number }).factor)

  const reply = await tauriInvoke("rpc", { tag, payload: encode(payload) }).catch((cause: unknown) => {
    throw failure(cause)
  })

  return revive(reply) as Value
}

// Rust fails with `{ message }`, or with `{ code, message? }` for the plugin calls whose callers read the code
// (packages/desktop/src/renderer/plugins.ts). Plain failures become Errors, as Electron's RPC client rejects with.
function failure(cause: unknown) {
  if (cause === null || typeof cause !== "object" || "code" in cause) return cause
  const message = "message" in cause && typeof cause.message === "string" ? cause.message : String(cause)

  return new Error(message)
}

const editCommands: Record<string, string> = {
  "edit.undo": "undo",
  "edit.redo": "redo",
  "edit.cut": "cut",
  "edit.copy": "copy",
  "edit.paste": "paste",
  "edit.delete": "delete",
  "edit.selectAll": "selectAll",
}

function editAction(payload: unknown) {
  const action = (payload as { action?: string } | null)?.action
  const command = action ? editCommands[action] : undefined

  if (!command) return false
  document.execCommand(command)

  return true
}

// Bytes cross Tauri's JSON IPC as {"$bytes": base64}; every other value is JSON already. Undefined keys are dropped
// the way Electron's JSON codec drops them.
function encode(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $bytes: toBase64(value) }

  if (Array.isArray(value)) return value.map(encode)

  if (value === null || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => (item === undefined ? [] : [[key, encode(item)]])),
  )
}

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive)

  if (value === null || typeof value !== "object") return value

  if ("$bytes" in value && typeof value.$bytes === "string") return fromBase64(value.$bytes)

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item)]))
}

function toBase64(bytes: Uint8Array) {
  const chunks: string[] = []

  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))

  return btoa(chunks.join(""))
}

function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}
