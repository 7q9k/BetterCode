import { BrowserWindow, screen } from "electron"
import { Option, Schema } from "effect"
import { OpenCode } from "@opencode/client/promise"
import { ComputerUse } from "@opencode/schema/computer-use"
import type { Plugin } from "@opencode/plugin/gui/main"
import {
  createOverlayState,
  transitionOverlay,
  type OverlayActivity,
  type OverlayEffect,
  type OverlayEvent,
} from "./overlay-machine"
import { OVERLAY_PAGE } from "./overlay-page"

const decodeActivity = Schema.decodeUnknownOption(ComputerUse.Activity)

// How long to wait before listening again after the app's server went away or the stream broke.
const RECONNECT_MS = 3000

/**
 * Shows that an agent controls the desktop: while the computer tool acts, a white glowing frame lines every display
 * and the agent's cursor glides to where it moves, clicks and types. It listens to the app's own server, whose
 * computer tool reports each action before it happens.
 */
const setup: Plugin.MainSetup = (ctx) => {
  let state = createOverlayState()
  let quiet: ReturnType<typeof setTimeout> | undefined
  let windows: BrowserWindow[] = []

  const dispatch = (event: OverlayEvent) => {
    const result = transitionOverlay(state, event)
    state = result.state
    result.effects.forEach(run)
  }

  const run = (effect: OverlayEffect) => {
    if (effect.type === "show") return show()

    if (effect.type === "hide") return hide()

    if (effect.type === "pointer") return pointer(effect.activity)

    clearTimeout(quiet)

    if (effect.type === "quiet.cancel") return
    quiet = setTimeout(() => dispatch({ type: "quiet", attempt: effect.attempt }), effect.ms)
  }

  // One click-through window per display, above everything and left out of screen capture.
  const show = () => {
    hide()
    windows = screen.getAllDisplays().map((display) => {
      const window = new BrowserWindow({
        ...display.bounds,
        transparent: true,
        frame: false,
        resizable: false,
        movable: false,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        show: false,
        fullscreenable: false,
        // Windows fits a new window into the work area, which leaves the taskbar outside the frame.
        enableLargerThanScreen: true,
        backgroundColor: "#00000000",
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      })

      window.setIgnoreMouseEvents(true)
      window.setAlwaysOnTop(true, "screen-saver")
      window.setContentProtection(true)
      window.setVisibleOnAllWorkspaces(true)
      window.webContents.once("did-finish-load", () => {
        if (window.isDestroyed()) return
        window.showInactive()
        // Once shown, the window may take the whole display, taskbar included.
        window.setBounds(display.bounds)
      })
      void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_PAGE)}`)

      return window
    })
  }

  const hide = () => {
    windows.forEach((window) => {
      if (!window.isDestroyed()) window.destroy()
    })
    windows = []
  }

  // The tool reports physical pixels; windows are placed in device-independent pixels.
  const pointer = (activity: OverlayActivity) => {
    if (activity.x === undefined || activity.y === undefined) return

    const physical = { x: activity.x, y: activity.y }
    const point = process.platform === "win32" ? screen.screenToDipPoint(physical) : physical

    windows.forEach((window) => {
      if (window.isDestroyed()) return
      const bounds = window.getBounds()

      const inside =
        point.x >= bounds.x &&
        point.x < bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y < bounds.y + bounds.height

      const message = inside
        ? { x: point.x - bounds.x, y: point.y - bounds.y, ms: activity.durationMs ?? 0, action: activity.action }
        : null

      void window.webContents.executeJavaScript(`window.agent && window.agent(${JSON.stringify(message)})`, false)
    })
  }

  // Listens to the app's own server for the computer tool's activity, again after the server restarts.
  const listen = async () => {
    while (!ctx.signal.aborted) {
      const endpoint = ctx.serverEndpoints.get("sidecar")

      if (endpoint) {
        const events = OpenCode.make({ baseUrl: endpoint.url, headers: endpoint.headers }).event.subscribe({
          types: [ComputerUse.ACTIVITY_EVENT],
          signal: ctx.signal,
        })

        await consume(events).catch((cause: Error) =>
          ctx.log.write("debug", "computer activity stream ended", { error: cause.message }),
        )
      }

      await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS))
    }
  }

  const consume = async (events: AsyncIterable<{ readonly type: string; readonly data: unknown }>) => {
    for await (const event of events) {
      if (event.type !== ComputerUse.ACTIVITY_EVENT) continue
      const activity = Option.getOrUndefined(decodeActivity(event.data))

      if (activity) dispatch({ type: "activity", activity })
    }
  }

  void listen()
  ctx.onCleanup(() => dispatch({ type: "disposed" }))
}

export default setup
