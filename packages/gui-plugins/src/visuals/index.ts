import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"
import en from "./i18n/en"

/** The user's team setup: whether subagents are used at all, and which agents are left out. */
export const TeamSettings = Schema.Struct({
  enabled: Schema.Boolean,
  off: Schema.Array(Schema.String),
})

export default Plugin.define({
  stores: {
    team: Store.global(TeamSettings, { enabled: true, off: [] }),
    // The team setup each session last received, so a session is told once per change, also across restarts.
    teamSent: Store.session(Schema.Struct({ setup: Schema.String }), { setup: "" }),
  },
  i18n: { en },
})
