export * as ComputerUse from "./computer-use.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

/**
 * What the computer tool is doing, so the desktop app can show it: a white frame around the screens while the agent
 * controls them, and the agent's cursor where it acts. `x` and `y` are physical screen pixels of the virtual desktop.
 * `end` follows the last action of a tool call; the frame also fades on its own when no activity follows.
 */
export const Activity = Schema.Struct({
  sessionID: Schema.String,
  action: Schema.Literals(["screenshot", "move", "click", "drag", "scroll", "type", "key", "end"]),
  x: Schema.optionalKey(Schema.Finite),
  y: Schema.optionalKey(Schema.Finite),
  /** How long the pointer takes to glide to `x`, `y`, so the drawn cursor moves with it. */
  durationMs: Schema.optionalKey(Schema.Finite),
}).annotate({ identifier: "ComputerUse.Activity" })
export type Activity = typeof Activity.Type

export const Definition = Rpc.define({
  id: "experimental.computer",
  methods: {},
  events: { activity: { schema: Activity } },
})

/** The event type the activity arrives as on the server's event stream. */
export const ACTIVITY_EVENT = "rpc.experimental.computer.activity"
