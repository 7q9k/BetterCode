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
  },
  i18n: { en },
})
